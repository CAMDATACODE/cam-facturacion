-- =====================================================================
-- Sistema de facturación para proyectos inmobiliarios CAM
-- 02 · Vistas y procedimientos almacenados (operaciones transaccionales)
-- Ejecutar completo en MySQL Workbench (rayo ⚡) después de 01_esquema.sql.
--
-- Cada procedimiento que escribe abre una transacción: si algo falla, se revierte todo.
-- Los errores de negocio usan SIGNAL con MYSQL_ERRNO, que la API traduce a HTTP:
--   5400 entrada inválida (400) · 5403 sin permiso (403) · 5404 no existe (404) · 5409 estado incompatible (409)
-- La hora de referencia es Bogotá (UTC-5) sin depender de la zona del servidor.
-- =====================================================================
USE cam_facturacion;

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------

-- Estado de cuenta por adquisición (FUN-EDC-01).
CREATE OR REPLACE VIEW v_estado_cuenta AS
SELECT a.id                                        AS adquisicion_id,
       p.id                                        AS propietario_id,
       p.cedula, p.nombre, p.correo,
       s.id                                        AS semana_id,
       s.numero                                    AS semana,
       a.estado, a.fecha_inicio,
       a.valor_total, a.num_cuotas, a.valor_cuota,
       CAST(COUNT(pg.id) AS SIGNED)                AS cuotas_pagadas,
       CAST(a.num_cuotas - COUNT(pg.id) AS SIGNED) AS cuotas_pendientes,
       CAST(COALESCE(SUM(pg.valor), 0) AS DECIMAL(14,2))               AS total_abonado,
       CAST(a.valor_total - COALESCE(SUM(pg.valor), 0) AS DECIMAL(14,2)) AS saldo
FROM adquisiciones a
JOIN propietarios p ON p.id = a.propietario_id
JOIN semanas s      ON s.id = a.semana_id
LEFT JOIN pagos pg  ON pg.adquisicion_id = a.id
GROUP BY a.id, p.id, s.id;

-- Historial de pagos (FUN-PAG-04, RNF-AUD-01).
CREATE OR REPLACE VIEW v_pagos AS
SELECT pg.id, pg.adquisicion_id, pg.numero_cuota, pg.fecha_pago, pg.valor,
       pg.verificado, pg.verificado_en, pg.registrado_en,
       a.propietario_id, p.nombre AS propietario, p.cedula, p.correo,
       s.numero AS semana, a.num_cuotas,
       u.nombre AS registrado_por, uv.nombre AS verificado_por,
       c.numero AS comprobante, c.estado_envio
FROM pagos pg
JOIN adquisiciones a ON a.id = pg.adquisicion_id
JOIN propietarios p  ON p.id = a.propietario_id
JOIN semanas s       ON s.id = a.semana_id
JOIN usuarios u      ON u.id = pg.usuario_id
LEFT JOIN usuarios uv    ON uv.id = pg.verificado_por
LEFT JOIN comprobantes c ON c.pago_id = pg.id;

-- Comprobante con todo lo que se imprime (FUN-CMP-01).
CREATE OR REPLACE VIEW v_comprobantes AS
SELECT c.id, c.numero, c.pago_id, c.fecha_emision, c.estado_envio, c.enviado_en,
       COALESCE(c.correo_destino, p.correo) AS correo_destino,
       p.id AS propietario_id, p.nombre AS propietario, p.cedula,
       s.numero AS semana, s.fecha_checkin, s.fecha_checkout,
       pg.numero_cuota, a.num_cuotas, pg.fecha_pago, pg.valor, pg.verificado,
       a.valor_total,
       (SELECT CAST(SUM(x.valor) AS DECIMAL(14,2)) FROM pagos x
         WHERE x.adquisicion_id = a.id AND x.numero_cuota <= pg.numero_cuota) AS abonado_a_la_fecha,
       u.nombre AS emitido_por
FROM comprobantes c
JOIN pagos pg        ON pg.id = c.pago_id
JOIN adquisiciones a ON a.id = pg.adquisicion_id
JOIN propietarios p  ON p.id = a.propietario_id
JOIN semanas s       ON s.id = a.semana_id
JOIN usuarios u      ON u.id = c.usuario_id;

-- Ofertas con semana, autor y número de mensajes (FUN-COM-02).
CREATE OR REPLACE VIEW v_ofertas AS
SELECT o.id, o.adquisicion_id, o.tipo, o.precio, o.descripcion, o.estado,
       o.publicada_en, o.cerrada_en,
       a.propietario_id, p.nombre AS propietario,
       SUBSTRING_INDEX(p.nombre, ' ', 1) AS propietario_nombre_corto,
       s.numero AS semana, s.fecha_checkin, s.fecha_checkout,
       (SELECT CAST(COUNT(*) AS SIGNED) FROM mensajes m WHERE m.oferta_id = o.id) AS mensajes
FROM ofertas o
JOIN adquisiciones a ON a.id = o.adquisicion_id
JOIN propietarios p  ON p.id = a.propietario_id
JOIN semanas s       ON s.id = a.semana_id;

-- Todas las cuotas del plan de cada adquisición vigente. La cuota k vence en (inicio + k - 1 meses).
CREATE OR REPLACE VIEW v_cuotas AS
WITH RECURSIVE k (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM k WHERE n < 120)
SELECT a.id AS adquisicion_id, a.propietario_id, s.numero AS semana, k.n AS cuota,
       DATE_ADD(a.fecha_inicio, INTERVAL k.n - 1 MONTH) AS vence,
       pg.fecha_pago, COALESCE(pg.valor, a.valor_cuota) AS valor,
       CASE WHEN pg.id IS NOT NULL THEN 'PAGADA'
            WHEN DATE_ADD(a.fecha_inicio, INTERVAL k.n - 1 MONTH) < DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00')) THEN 'VENCIDA'
            ELSE 'PENDIENTE' END AS estado
FROM adquisiciones a
JOIN semanas s ON s.id = a.semana_id
JOIN k ON k.n <= a.num_cuotas
LEFT JOIN pagos pg ON pg.adquisicion_id = a.id AND pg.numero_cuota = k.n
WHERE a.estado <> 'TRASPASADA';

DELIMITER $$

-- ---------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_exigir_usuario$$
-- Exige un usuario activo con el rol indicado (NULL = cualquiera). Devuelve su rol y propietario.
CREATE PROCEDURE sp_exigir_usuario(IN p_usuario_id INT, IN p_rol VARCHAR(12), OUT o_rol VARCHAR(12), OUT o_propietario_id INT)
BEGIN
  SET o_rol = NULL, o_propietario_id = NULL;
  SELECT rol, propietario_id INTO o_rol, o_propietario_id FROM usuarios WHERE id = p_usuario_id AND activo;
  IF o_rol IS NULL OR (p_rol IS NOT NULL AND o_rol <> p_rol) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5403, MESSAGE_TEXT = 'No tiene permiso para esta operación.';
  END IF;
END$$

DROP PROCEDURE IF EXISTS sp_actualizar_estado_adquisicion$$
-- PAGADA con todas las cuotas; ACTIVA si falta alguna.
CREATE PROCEDURE sp_actualizar_estado_adquisicion(IN p_adquisicion_id INT)
BEGIN
  UPDATE adquisiciones a
  SET a.estado = IF((SELECT COUNT(*) FROM pagos WHERE adquisicion_id = p_adquisicion_id) >= a.num_cuotas, 'PAGADA', 'ACTIVA')
  WHERE a.id = p_adquisicion_id AND a.estado <> 'TRASPASADA';
END$$

-- ---------------------------------------------------------------------
-- Asignaciones (FUN-SEM-02)
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_asignar_semana$$
CREATE PROCEDURE sp_asignar_semana(IN p_usuario_id INT, IN p_propietario_id INT, IN p_semana_id INT, IN p_fecha_inicio DATE)
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, 'ADMIN', v_rol, v_prop);
  IF p_fecha_inicio IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'Indique la fecha de inicio del plan de cuotas.';
  END IF;
  START TRANSACTION;
  IF NOT EXISTS (SELECT 1 FROM propietarios WHERE id = p_propietario_id) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'El propietario no existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM semanas WHERE id = p_semana_id) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'La semana no existe.';
  END IF;
  -- uq_adquisiciones_semana_vigente rechaza una semana que ya tiene titular (1062).
  INSERT INTO adquisiciones (propietario_id, semana_id, fecha_inicio, valor_total, num_cuotas, valor_cuota, usuario_id)
  SELECT p_propietario_id, p_semana_id, p_fecha_inicio, valor_total, num_cuotas, valor_cuota, p_usuario_id
  FROM parametros WHERE id = 1;
  SELECT LAST_INSERT_ID() AS id;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_cambiar_titular$$
-- PENDIENTE DE CONFIRMAR CON CAM: la adquisición anterior queda TRASPASADA con sus pagos
-- y el nuevo titular recibe una adquisición con las mismas condiciones y fecha de inicio.
CREATE PROCEDURE sp_cambiar_titular(IN p_usuario_id INT, IN p_adquisicion_id INT, IN p_nuevo_propietario_id INT)
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_estado VARCHAR(12);
  DECLARE v_actual INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, 'ADMIN', v_rol, v_prop);
  START TRANSACTION;
  SELECT estado, propietario_id INTO v_estado, v_actual FROM adquisiciones WHERE id = p_adquisicion_id FOR UPDATE;
  IF v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'La adquisición no existe.';
  END IF;
  IF v_estado = 'TRASPASADA' THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5409, MESSAGE_TEXT = 'Esa adquisición ya fue traspasada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM propietarios WHERE id = p_nuevo_propietario_id) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'El nuevo titular no existe.';
  END IF;
  IF p_nuevo_propietario_id = v_actual THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'El nuevo titular debe ser otro propietario.';
  END IF;
  UPDATE adquisiciones SET estado = 'TRASPASADA' WHERE id = p_adquisicion_id;
  UPDATE ofertas SET estado = 'CONCRETADA', cerrada_en = NOW() WHERE adquisicion_id = p_adquisicion_id AND estado = 'ACTIVA';
  INSERT INTO adquisiciones (propietario_id, semana_id, fecha_inicio, valor_total, num_cuotas, valor_cuota, usuario_id)
  SELECT p_nuevo_propietario_id, semana_id, fecha_inicio, valor_total, num_cuotas, valor_cuota, p_usuario_id
  FROM adquisiciones WHERE id = p_adquisicion_id;
  SELECT LAST_INSERT_ID() AS id;
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Pagos (FUN-PAG-01 a FUN-PAG-05)
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_registrar_pago$$
CREATE PROCEDURE sp_registrar_pago(IN p_usuario_id INT, IN p_adquisicion_id INT, IN p_numero_cuota INT,
                                   IN p_fecha_pago DATE, IN p_valor DECIMAL(14,2), IN p_verificado BOOLEAN)
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_estado VARCHAR(12);
  DECLARE v_num INT;
  DECLARE v_id INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, 'ADMIN', v_rol, v_prop);
  IF p_numero_cuota IS NULL OR p_fecha_pago IS NULL OR p_valor IS NULL OR p_verificado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'Faltan datos del pago.';
  END IF;
  IF p_valor <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'El valor debe ser mayor que cero.';
  END IF;
  IF p_fecha_pago > DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '-05:00')) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'La fecha de pago no puede ser futura.';
  END IF;
  START TRANSACTION;
  -- Bloquea la adquisición: dos registros simultáneos de la misma cuota se atienden en orden.
  SELECT estado, num_cuotas INTO v_estado, v_num FROM adquisiciones WHERE id = p_adquisicion_id FOR UPDATE;
  IF v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'La adquisición no existe.';
  END IF;
  IF v_estado = 'TRASPASADA' THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5409, MESSAGE_TEXT = 'La adquisición fue traspasada; no admite nuevos pagos.';
  END IF;
  IF p_numero_cuota < 1 OR p_numero_cuota > v_num THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'El número de cuota está fuera del plan de la adquisición.';
  END IF;
  -- uq_pagos_cuota rechaza una cuota repetida (1062).
  INSERT INTO pagos (adquisicion_id, numero_cuota, fecha_pago, valor, verificado, verificado_por, verificado_en, usuario_id)
  VALUES (p_adquisicion_id, p_numero_cuota, p_fecha_pago, p_valor, p_verificado,
          IF(p_verificado, p_usuario_id, NULL), IF(p_verificado, NOW(), NULL), p_usuario_id);
  SET v_id = LAST_INSERT_ID();
  CALL sp_actualizar_estado_adquisicion(p_adquisicion_id);
  COMMIT;
  SELECT v_id AS pago_id, cuotas_pagadas, saldo FROM v_estado_cuenta WHERE adquisicion_id = p_adquisicion_id;
END$$

DROP PROCEDURE IF EXISTS sp_verificar_pago$$
-- Devuelve cambiado = 0 si ya estaba verificado.
CREATE PROCEDURE sp_verificar_pago(IN p_usuario_id INT, IN p_pago_id INT)
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_ver TINYINT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, 'ADMIN', v_rol, v_prop);
  START TRANSACTION;
  SELECT verificado INTO v_ver FROM pagos WHERE id = p_pago_id FOR UPDATE;
  IF v_ver IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'El pago no existe.';
  END IF;
  IF NOT v_ver THEN
    UPDATE pagos SET verificado = TRUE, verificado_por = p_usuario_id, verificado_en = NOW() WHERE id = p_pago_id;
  END IF;
  COMMIT;
  SELECT NOT v_ver AS cambiado;
END$$

DROP PROCEDURE IF EXISTS sp_anular_pago$$
-- Borra un pago creado por error. Se bloquea si ya tiene comprobante.
CREATE PROCEDURE sp_anular_pago(IN p_usuario_id INT, IN p_pago_id INT)
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_adq INT;
  DECLARE v_cmp VARCHAR(20);
  DECLARE v_msg VARCHAR(200);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, 'ADMIN', v_rol, v_prop);
  START TRANSACTION;
  SELECT adquisicion_id INTO v_adq FROM pagos WHERE id = p_pago_id;
  IF v_adq IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'El pago no existe.';
  END IF;
  SELECT id INTO v_prop FROM adquisiciones WHERE id = v_adq FOR UPDATE;
  SELECT numero INTO v_cmp FROM comprobantes WHERE pago_id = p_pago_id;
  IF v_cmp IS NOT NULL THEN
    SET v_msg = CONCAT('No se puede anular: el pago ya tiene el comprobante ', v_cmp, '. Un pago con soporte emitido se conserva.');
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5409, MESSAGE_TEXT = v_msg;
  END IF;
  DELETE FROM pagos WHERE id = p_pago_id;
  CALL sp_actualizar_estado_adquisicion(v_adq);
  COMMIT;
END$$

-- ---------------------------------------------------------------------
-- Comprobantes (FUN-CMP-01, FUN-CMP-02)
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_emitir_comprobante$$
-- Emite el comprobante de un pago verificado. Si ya existe, lo devuelve (creado = 0).
CREATE PROCEDURE sp_emitir_comprobante(IN p_usuario_id INT, IN p_pago_id INT)
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_ver TINYINT;
  DECLARE v_num VARCHAR(20);
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, 'ADMIN', v_rol, v_prop);
  START TRANSACTION;
  SELECT verificado INTO v_ver FROM pagos WHERE id = p_pago_id FOR UPDATE;
  IF v_ver IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'El pago no existe.';
  END IF;
  SELECT numero INTO v_num FROM comprobantes WHERE pago_id = p_pago_id;
  IF v_num IS NOT NULL THEN
    COMMIT;
    SELECT v_num AS numero, FALSE AS creado;
  ELSE
    IF NOT v_ver THEN
      SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5409,
        MESSAGE_TEXT = 'Primero verifique el pago: el comprobante se emite cuando se confirma el dinero.';
    END IF;
    SET v_num = CONCAT('CMP-', LPAD(p_pago_id, 6, '0'));
    INSERT INTO comprobantes (numero, pago_id, correo_destino, usuario_id)
    SELECT v_num, p_pago_id, p.correo, p_usuario_id
    FROM pagos pg JOIN adquisiciones a ON a.id = pg.adquisicion_id JOIN propietarios p ON p.id = a.propietario_id
    WHERE pg.id = p_pago_id;
    COMMIT;
    SELECT v_num AS numero, TRUE AS creado;
  END IF;
END$$

DROP PROCEDURE IF EXISTS sp_emitir_comprobantes_pendientes$$
CREATE PROCEDURE sp_emitir_comprobantes_pendientes(IN p_usuario_id INT)
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_n INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, 'ADMIN', v_rol, v_prop);
  START TRANSACTION;
  INSERT INTO comprobantes (numero, pago_id, correo_destino, usuario_id)
  SELECT CONCAT('CMP-', LPAD(pg.id, 6, '0')), pg.id, p.correo, p_usuario_id
  FROM pagos pg JOIN adquisiciones a ON a.id = pg.adquisicion_id JOIN propietarios p ON p.id = a.propietario_id
  WHERE pg.verificado AND NOT EXISTS (SELECT 1 FROM comprobantes c WHERE c.pago_id = pg.id)
  ORDER BY pg.id;
  SET v_n = ROW_COUNT();
  COMMIT;
  SELECT v_n AS emitidos;
END$$

DROP PROCEDURE IF EXISTS sp_registrar_envio$$
CREATE PROCEDURE sp_registrar_envio(IN p_usuario_id INT, IN p_pago_id INT, IN p_estado VARCHAR(10))
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  CALL sp_exigir_usuario(p_usuario_id, 'ADMIN', v_rol, v_prop);
  IF p_estado IS NULL OR p_estado NOT IN ('ENVIADO', 'FALLIDO') THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'El estado de envío debe ser ENVIADO o FALLIDO.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM comprobantes WHERE pago_id = p_pago_id) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'Ese pago no tiene comprobante.';
  END IF;
  UPDATE comprobantes SET estado_envio = p_estado, enviado_en = NOW() WHERE pago_id = p_pago_id;
END$$

-- ---------------------------------------------------------------------
-- Recaudo mensual (FUN-EDC-02): cuota del mes sin pago registrado.
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_recaudo_pendiente$$
CREATE PROCEDURE sp_recaudo_pendiente(IN p_anio INT, IN p_mes INT)
BEGIN
  SELECT x.id AS adquisicion_id, x.propietario_id, x.nombre AS propietario, x.cedula, x.correo,
         x.numero AS semana, x.k AS cuota, x.valor_cuota AS valor
  FROM (SELECT a.id, a.propietario_id, p.nombre, p.cedula, p.correo, s.numero, a.valor_cuota, a.num_cuotas,
               (p_anio * 12 + p_mes) - (YEAR(a.fecha_inicio) * 12 + MONTH(a.fecha_inicio)) + 1 AS k
        FROM adquisiciones a
        JOIN propietarios p ON p.id = a.propietario_id
        JOIN semanas s ON s.id = a.semana_id
        WHERE a.estado <> 'TRASPASADA') x
  WHERE x.k BETWEEN 1 AND x.num_cuotas
    AND NOT EXISTS (SELECT 1 FROM pagos pg WHERE pg.adquisicion_id = x.id AND pg.numero_cuota = x.k)
  ORDER BY x.nombre, x.numero;
END$$

-- ---------------------------------------------------------------------
-- Comunidad de intercambio (FUN-COM-01 a FUN-COM-04)
-- ---------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_publicar_oferta$$
CREATE PROCEDURE sp_publicar_oferta(IN p_usuario_id INT, IN p_adquisicion_id INT, IN p_tipo VARCHAR(12),
                                    IN p_precio DECIMAL(14,2), IN p_descripcion VARCHAR(500))
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, 'PROPIETARIO', v_rol, v_prop);
  IF p_tipo IS NULL OR p_tipo NOT IN ('VENTA', 'INTERCAMBIO') THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'El tipo debe ser VENTA o INTERCAMBIO.';
  END IF;
  IF p_tipo = 'INTERCAMBIO' AND p_precio IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'Una oferta de intercambio no lleva precio.';
  END IF;
  IF p_tipo = 'VENTA' AND (p_precio IS NULL OR p_precio <= 0) THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'La venta debe tener un precio mayor que cero.';
  END IF;
  IF p_descripcion IS NULL OR CHAR_LENGTH(TRIM(p_descripcion)) NOT BETWEEN 5 AND 500 THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'La descripción debe tener entre 5 y 500 caracteres.';
  END IF;
  START TRANSACTION;
  IF NOT EXISTS (SELECT 1 FROM adquisiciones WHERE id = p_adquisicion_id AND propietario_id = v_prop
                 AND estado <> 'TRASPASADA') THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5403, MESSAGE_TEXT = 'Solo puede ofertar sus propias semanas.';
  END IF;
  -- uq_ofertas_activa: una sola oferta activa por semana (1062).
  INSERT INTO ofertas (adquisicion_id, tipo, precio, descripcion) VALUES (p_adquisicion_id, p_tipo, p_precio, TRIM(p_descripcion));
  SELECT LAST_INSERT_ID() AS id;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_cerrar_oferta$$
-- ADMIN: cualquiera; PROPIETARIO: solo las propias.
CREATE PROCEDURE sp_cerrar_oferta(IN p_usuario_id INT, IN p_oferta_id INT, IN p_estado VARCHAR(12))
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_estado VARCHAR(12);
  DECLARE v_dueno INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
  CALL sp_exigir_usuario(p_usuario_id, NULL, v_rol, v_prop);
  IF p_estado IS NULL OR p_estado NOT IN ('RETIRADA', 'CONCRETADA') THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'El estado debe ser RETIRADA o CONCRETADA.';
  END IF;
  START TRANSACTION;
  SELECT o.estado, a.propietario_id INTO v_estado, v_dueno
  FROM ofertas o JOIN adquisiciones a ON a.id = o.adquisicion_id WHERE o.id = p_oferta_id FOR UPDATE;
  IF v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'La oferta no existe.';
  END IF;
  IF v_rol = 'PROPIETARIO' AND v_dueno <> v_prop THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5403, MESSAGE_TEXT = 'Solo puede cerrar sus propias ofertas.';
  END IF;
  IF v_estado <> 'ACTIVA' THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5409, MESSAGE_TEXT = 'La oferta ya no está activa.';
  END IF;
  UPDATE ofertas SET estado = p_estado, cerrada_en = NOW() WHERE id = p_oferta_id;
  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_eliminar_oferta$$
-- Elimina una oferta publicada por error (y sus mensajes, por ON DELETE CASCADE).
CREATE PROCEDURE sp_eliminar_oferta(IN p_usuario_id INT, IN p_oferta_id INT)
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_dueno INT;
  CALL sp_exigir_usuario(p_usuario_id, NULL, v_rol, v_prop);
  SELECT a.propietario_id INTO v_dueno FROM ofertas o JOIN adquisiciones a ON a.id = o.adquisicion_id WHERE o.id = p_oferta_id;
  IF v_dueno IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'La oferta no existe.';
  END IF;
  IF v_rol = 'PROPIETARIO' AND v_dueno <> v_prop THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5403, MESSAGE_TEXT = 'Solo puede eliminar sus propias ofertas.';
  END IF;
  DELETE FROM ofertas WHERE id = p_oferta_id;
END$$

DROP PROCEDURE IF EXISTS sp_enviar_mensaje$$
CREATE PROCEDURE sp_enviar_mensaje(IN p_usuario_id INT, IN p_oferta_id INT, IN p_texto VARCHAR(1000))
BEGIN
  DECLARE v_rol VARCHAR(12);
  DECLARE v_prop INT;
  DECLARE v_estado VARCHAR(12);
  CALL sp_exigir_usuario(p_usuario_id, 'PROPIETARIO', v_rol, v_prop);
  IF p_texto IS NULL OR CHAR_LENGTH(TRIM(p_texto)) NOT BETWEEN 1 AND 1000 THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5400, MESSAGE_TEXT = 'El mensaje debe tener entre 1 y 1000 caracteres.';
  END IF;
  SELECT estado INTO v_estado FROM ofertas WHERE id = p_oferta_id;
  IF v_estado IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5404, MESSAGE_TEXT = 'La oferta no existe.';
  END IF;
  IF v_estado <> 'ACTIVA' THEN
    SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO = 5409, MESSAGE_TEXT = 'La oferta ya no está activa.';
  END IF;
  INSERT INTO mensajes (oferta_id, propietario_id, texto) VALUES (p_oferta_id, v_prop, TRIM(p_texto));
  SELECT LAST_INSERT_ID() AS id;
END$$

DELIMITER ;
