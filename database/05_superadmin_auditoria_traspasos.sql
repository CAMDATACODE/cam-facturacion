-- =====================================================================
-- Sistema de facturación para proyectos inmobiliarios CAM
-- 05 · Superadministrador, historial de cambios (auditoría) y traspasos con saldo
--
-- Se ejecuta UNA sola vez, completo, con la cuenta que creó la base (root o avnadmin):
--   · Instalación nueva: después de 01, 02, 03 (y 04 si lo usa).
--   · Base ya publicada (Aiven): ejecute este archivo y luego vuelva a ejecutar 02_procedimientos.sql.
-- Antes de ejecutarlo, seleccione la base (cam_facturacion en local, defaultdb en Aiven):
-- en MySQL Workbench, doble clic sobre la base en el panel izquierdo, o escriba USE nombre_base;
-- Si Aiven responde el error 1419 al crear los triggers, active log_bin_trust_function_creators
-- en Aiven Console > servicio MySQL > Advanced configuration y vuelva a ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Rol SUPERADMIN: administra las cuentas de los administradores.
--    La cuenta 'admin' (Marta Lucía Prada) pasa a ser la superadministradora.
-- ---------------------------------------------------------------------
ALTER TABLE usuarios DROP CHECK ck_usuarios_rol;
ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_rol CHECK (rol IN ('SUPERADMIN', 'ADMIN', 'PROPIETARIO'));
UPDATE usuarios SET rol = 'SUPERADMIN' WHERE usuario = 'admin';

-- ---------------------------------------------------------------------
-- 2. Traspasos: el nuevo titular recibe el saldo pendiente de la semana.
--    adquisicion_origen_id enlaza la adquisición nueva con la traspasada.
--    Una semana ya pagada se traspasa con 0 cuotas y saldo 0.
-- ---------------------------------------------------------------------
ALTER TABLE adquisiciones
  ADD COLUMN adquisicion_origen_id INT NULL AFTER estado,
  ADD CONSTRAINT fk_adquisiciones_origen FOREIGN KEY (adquisicion_origen_id) REFERENCES adquisiciones (id);
ALTER TABLE adquisiciones DROP CHECK ck_adquisiciones_valores;
ALTER TABLE adquisiciones ADD CONSTRAINT ck_adquisiciones_valores CHECK (valor_total >= 0 AND valor_cuota > 0 AND num_cuotas BETWEEN 0 AND 120);

-- ---------------------------------------------------------------------
-- 3. Historial de cambios (RNF-AUD-01). Los triggers guardan cada INSERT, UPDATE y DELETE
--    con el valor anterior y el nuevo. El autor llega en la variable @app_usuario_id:
--    la fija sp_exigir_usuario en cada procedimiento, y la API antes de cada escritura directa.
--    Sin llave foránea a propósito: el historial nunca debe impedir una operación.
--    cam_app solo tiene SELECT: nadie puede modificar el historial desde la aplicación.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  fecha       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usuario_id  INT          NULL,
  cuenta_bd   VARCHAR(100) NOT NULL,
  tabla       VARCHAR(30)  NOT NULL,
  registro_id INT          NOT NULL,
  accion      VARCHAR(6)   NOT NULL,
  antes       JSON         NULL,
  despues     JSON         NULL,
  CONSTRAINT ck_auditoria_accion CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE')),
  INDEX ix_auditoria_fecha (fecha),
  INDEX ix_auditoria_registro (tabla, registro_id),
  INDEX ix_auditoria_usuario (usuario_id)
) ENGINE = InnoDB;

-- Contraseñas: solo se registra que cambiaron (password_cambiada), nunca el hash.
DELIMITER $$

DROP TRIGGER IF EXISTS tr_aud_propietarios_ins$$
CREATE TRIGGER tr_aud_propietarios_ins AFTER INSERT ON propietarios FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'propietarios', NEW.id, 'INSERT', NULL, JSON_OBJECT('cedula', NEW.cedula, 'nombre', NEW.nombre, 'correo', NEW.correo));
END$$

DROP TRIGGER IF EXISTS tr_aud_propietarios_upd$$
CREATE TRIGGER tr_aud_propietarios_upd AFTER UPDATE ON propietarios FOR EACH ROW
BEGIN
  IF JSON_OBJECT('cedula', OLD.cedula, 'nombre', OLD.nombre, 'correo', OLD.correo) <> JSON_OBJECT('cedula', NEW.cedula, 'nombre', NEW.nombre, 'correo', NEW.correo) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'propietarios', NEW.id, 'UPDATE', JSON_OBJECT('cedula', OLD.cedula, 'nombre', OLD.nombre, 'correo', OLD.correo), JSON_OBJECT('cedula', NEW.cedula, 'nombre', NEW.nombre, 'correo', NEW.correo));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_propietarios_del$$
CREATE TRIGGER tr_aud_propietarios_del AFTER DELETE ON propietarios FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'propietarios', OLD.id, 'DELETE', JSON_OBJECT('cedula', OLD.cedula, 'nombre', OLD.nombre, 'correo', OLD.correo), NULL);
END$$

DROP TRIGGER IF EXISTS tr_aud_usuarios_ins$$
CREATE TRIGGER tr_aud_usuarios_ins AFTER INSERT ON usuarios FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'usuarios', NEW.id, 'INSERT', NULL, JSON_OBJECT('usuario', NEW.usuario, 'nombre', NEW.nombre, 'rol', NEW.rol, 'propietario_id', NEW.propietario_id, 'activo', NEW.activo));
END$$

DROP TRIGGER IF EXISTS tr_aud_usuarios_upd$$
CREATE TRIGGER tr_aud_usuarios_upd AFTER UPDATE ON usuarios FOR EACH ROW
BEGIN
  IF JSON_OBJECT('usuario', OLD.usuario, 'nombre', OLD.nombre, 'rol', OLD.rol, 'propietario_id', OLD.propietario_id, 'activo', OLD.activo) <> JSON_OBJECT('usuario', NEW.usuario, 'nombre', NEW.nombre, 'rol', NEW.rol, 'propietario_id', NEW.propietario_id, 'activo', NEW.activo) OR NOT (OLD.password_hash <=> NEW.password_hash) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'usuarios', NEW.id, 'UPDATE', JSON_OBJECT('usuario', OLD.usuario, 'nombre', OLD.nombre, 'rol', OLD.rol, 'propietario_id', OLD.propietario_id, 'activo', OLD.activo), JSON_OBJECT('usuario', NEW.usuario, 'nombre', NEW.nombre, 'rol', NEW.rol, 'propietario_id', NEW.propietario_id, 'activo', NEW.activo, 'password_cambiada', NOT (OLD.password_hash <=> NEW.password_hash)));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_usuarios_del$$
CREATE TRIGGER tr_aud_usuarios_del AFTER DELETE ON usuarios FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'usuarios', OLD.id, 'DELETE', JSON_OBJECT('usuario', OLD.usuario, 'nombre', OLD.nombre, 'rol', OLD.rol, 'propietario_id', OLD.propietario_id, 'activo', OLD.activo), NULL);
END$$

DROP TRIGGER IF EXISTS tr_aud_semanas_ins$$
CREATE TRIGGER tr_aud_semanas_ins AFTER INSERT ON semanas FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'semanas', NEW.id, 'INSERT', NULL, JSON_OBJECT('numero', NEW.numero, 'fecha_checkin', NEW.fecha_checkin, 'fecha_checkout', NEW.fecha_checkout));
END$$

DROP TRIGGER IF EXISTS tr_aud_semanas_upd$$
CREATE TRIGGER tr_aud_semanas_upd AFTER UPDATE ON semanas FOR EACH ROW
BEGIN
  IF JSON_OBJECT('numero', OLD.numero, 'fecha_checkin', OLD.fecha_checkin, 'fecha_checkout', OLD.fecha_checkout) <> JSON_OBJECT('numero', NEW.numero, 'fecha_checkin', NEW.fecha_checkin, 'fecha_checkout', NEW.fecha_checkout) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'semanas', NEW.id, 'UPDATE', JSON_OBJECT('numero', OLD.numero, 'fecha_checkin', OLD.fecha_checkin, 'fecha_checkout', OLD.fecha_checkout), JSON_OBJECT('numero', NEW.numero, 'fecha_checkin', NEW.fecha_checkin, 'fecha_checkout', NEW.fecha_checkout));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_semanas_del$$
CREATE TRIGGER tr_aud_semanas_del AFTER DELETE ON semanas FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'semanas', OLD.id, 'DELETE', JSON_OBJECT('numero', OLD.numero, 'fecha_checkin', OLD.fecha_checkin, 'fecha_checkout', OLD.fecha_checkout), NULL);
END$$

DROP TRIGGER IF EXISTS tr_aud_parametros_ins$$
CREATE TRIGGER tr_aud_parametros_ins AFTER INSERT ON parametros FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'parametros', NEW.id, 'INSERT', NULL, JSON_OBJECT('valor_total', NEW.valor_total, 'num_cuotas', NEW.num_cuotas, 'valor_cuota', NEW.valor_cuota));
END$$

DROP TRIGGER IF EXISTS tr_aud_parametros_upd$$
CREATE TRIGGER tr_aud_parametros_upd AFTER UPDATE ON parametros FOR EACH ROW
BEGIN
  IF JSON_OBJECT('valor_total', OLD.valor_total, 'num_cuotas', OLD.num_cuotas, 'valor_cuota', OLD.valor_cuota) <> JSON_OBJECT('valor_total', NEW.valor_total, 'num_cuotas', NEW.num_cuotas, 'valor_cuota', NEW.valor_cuota) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'parametros', NEW.id, 'UPDATE', JSON_OBJECT('valor_total', OLD.valor_total, 'num_cuotas', OLD.num_cuotas, 'valor_cuota', OLD.valor_cuota), JSON_OBJECT('valor_total', NEW.valor_total, 'num_cuotas', NEW.num_cuotas, 'valor_cuota', NEW.valor_cuota));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_parametros_del$$
CREATE TRIGGER tr_aud_parametros_del AFTER DELETE ON parametros FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'parametros', OLD.id, 'DELETE', JSON_OBJECT('valor_total', OLD.valor_total, 'num_cuotas', OLD.num_cuotas, 'valor_cuota', OLD.valor_cuota), NULL);
END$$

DROP TRIGGER IF EXISTS tr_aud_adquisiciones_ins$$
CREATE TRIGGER tr_aud_adquisiciones_ins AFTER INSERT ON adquisiciones FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'adquisiciones', NEW.id, 'INSERT', NULL, JSON_OBJECT('propietario_id', NEW.propietario_id, 'semana_id', NEW.semana_id, 'fecha_inicio', NEW.fecha_inicio, 'valor_total', NEW.valor_total, 'num_cuotas', NEW.num_cuotas, 'valor_cuota', NEW.valor_cuota, 'estado', NEW.estado, 'adquisicion_origen_id', NEW.adquisicion_origen_id));
END$$

DROP TRIGGER IF EXISTS tr_aud_adquisiciones_upd$$
CREATE TRIGGER tr_aud_adquisiciones_upd AFTER UPDATE ON adquisiciones FOR EACH ROW
BEGIN
  IF JSON_OBJECT('propietario_id', OLD.propietario_id, 'semana_id', OLD.semana_id, 'fecha_inicio', OLD.fecha_inicio, 'valor_total', OLD.valor_total, 'num_cuotas', OLD.num_cuotas, 'valor_cuota', OLD.valor_cuota, 'estado', OLD.estado, 'adquisicion_origen_id', OLD.adquisicion_origen_id) <> JSON_OBJECT('propietario_id', NEW.propietario_id, 'semana_id', NEW.semana_id, 'fecha_inicio', NEW.fecha_inicio, 'valor_total', NEW.valor_total, 'num_cuotas', NEW.num_cuotas, 'valor_cuota', NEW.valor_cuota, 'estado', NEW.estado, 'adquisicion_origen_id', NEW.adquisicion_origen_id) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'adquisiciones', NEW.id, 'UPDATE', JSON_OBJECT('propietario_id', OLD.propietario_id, 'semana_id', OLD.semana_id, 'fecha_inicio', OLD.fecha_inicio, 'valor_total', OLD.valor_total, 'num_cuotas', OLD.num_cuotas, 'valor_cuota', OLD.valor_cuota, 'estado', OLD.estado, 'adquisicion_origen_id', OLD.adquisicion_origen_id), JSON_OBJECT('propietario_id', NEW.propietario_id, 'semana_id', NEW.semana_id, 'fecha_inicio', NEW.fecha_inicio, 'valor_total', NEW.valor_total, 'num_cuotas', NEW.num_cuotas, 'valor_cuota', NEW.valor_cuota, 'estado', NEW.estado, 'adquisicion_origen_id', NEW.adquisicion_origen_id));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_adquisiciones_del$$
CREATE TRIGGER tr_aud_adquisiciones_del AFTER DELETE ON adquisiciones FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'adquisiciones', OLD.id, 'DELETE', JSON_OBJECT('propietario_id', OLD.propietario_id, 'semana_id', OLD.semana_id, 'fecha_inicio', OLD.fecha_inicio, 'valor_total', OLD.valor_total, 'num_cuotas', OLD.num_cuotas, 'valor_cuota', OLD.valor_cuota, 'estado', OLD.estado, 'adquisicion_origen_id', OLD.adquisicion_origen_id), NULL);
END$$

DROP TRIGGER IF EXISTS tr_aud_pagos_ins$$
CREATE TRIGGER tr_aud_pagos_ins AFTER INSERT ON pagos FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'pagos', NEW.id, 'INSERT', NULL, JSON_OBJECT('adquisicion_id', NEW.adquisicion_id, 'numero_cuota', NEW.numero_cuota, 'fecha_pago', NEW.fecha_pago, 'valor', NEW.valor, 'verificado', NEW.verificado));
END$$

DROP TRIGGER IF EXISTS tr_aud_pagos_upd$$
CREATE TRIGGER tr_aud_pagos_upd AFTER UPDATE ON pagos FOR EACH ROW
BEGIN
  IF JSON_OBJECT('adquisicion_id', OLD.adquisicion_id, 'numero_cuota', OLD.numero_cuota, 'fecha_pago', OLD.fecha_pago, 'valor', OLD.valor, 'verificado', OLD.verificado) <> JSON_OBJECT('adquisicion_id', NEW.adquisicion_id, 'numero_cuota', NEW.numero_cuota, 'fecha_pago', NEW.fecha_pago, 'valor', NEW.valor, 'verificado', NEW.verificado) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'pagos', NEW.id, 'UPDATE', JSON_OBJECT('adquisicion_id', OLD.adquisicion_id, 'numero_cuota', OLD.numero_cuota, 'fecha_pago', OLD.fecha_pago, 'valor', OLD.valor, 'verificado', OLD.verificado), JSON_OBJECT('adquisicion_id', NEW.adquisicion_id, 'numero_cuota', NEW.numero_cuota, 'fecha_pago', NEW.fecha_pago, 'valor', NEW.valor, 'verificado', NEW.verificado));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_pagos_del$$
CREATE TRIGGER tr_aud_pagos_del AFTER DELETE ON pagos FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'pagos', OLD.id, 'DELETE', JSON_OBJECT('adquisicion_id', OLD.adquisicion_id, 'numero_cuota', OLD.numero_cuota, 'fecha_pago', OLD.fecha_pago, 'valor', OLD.valor, 'verificado', OLD.verificado), NULL);
END$$

DROP TRIGGER IF EXISTS tr_aud_comprobantes_ins$$
CREATE TRIGGER tr_aud_comprobantes_ins AFTER INSERT ON comprobantes FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'comprobantes', NEW.id, 'INSERT', NULL, JSON_OBJECT('numero', NEW.numero, 'pago_id', NEW.pago_id, 'correo_destino', NEW.correo_destino, 'estado_envio', NEW.estado_envio));
END$$

DROP TRIGGER IF EXISTS tr_aud_comprobantes_upd$$
CREATE TRIGGER tr_aud_comprobantes_upd AFTER UPDATE ON comprobantes FOR EACH ROW
BEGIN
  IF JSON_OBJECT('numero', OLD.numero, 'pago_id', OLD.pago_id, 'correo_destino', OLD.correo_destino, 'estado_envio', OLD.estado_envio) <> JSON_OBJECT('numero', NEW.numero, 'pago_id', NEW.pago_id, 'correo_destino', NEW.correo_destino, 'estado_envio', NEW.estado_envio) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'comprobantes', NEW.id, 'UPDATE', JSON_OBJECT('numero', OLD.numero, 'pago_id', OLD.pago_id, 'correo_destino', OLD.correo_destino, 'estado_envio', OLD.estado_envio), JSON_OBJECT('numero', NEW.numero, 'pago_id', NEW.pago_id, 'correo_destino', NEW.correo_destino, 'estado_envio', NEW.estado_envio));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_comprobantes_del$$
CREATE TRIGGER tr_aud_comprobantes_del AFTER DELETE ON comprobantes FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'comprobantes', OLD.id, 'DELETE', JSON_OBJECT('numero', OLD.numero, 'pago_id', OLD.pago_id, 'correo_destino', OLD.correo_destino, 'estado_envio', OLD.estado_envio), NULL);
END$$

DROP TRIGGER IF EXISTS tr_aud_ofertas_ins$$
CREATE TRIGGER tr_aud_ofertas_ins AFTER INSERT ON ofertas FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'ofertas', NEW.id, 'INSERT', NULL, JSON_OBJECT('adquisicion_id', NEW.adquisicion_id, 'tipo', NEW.tipo, 'precio', NEW.precio, 'descripcion', NEW.descripcion, 'estado', NEW.estado));
END$$

DROP TRIGGER IF EXISTS tr_aud_ofertas_upd$$
CREATE TRIGGER tr_aud_ofertas_upd AFTER UPDATE ON ofertas FOR EACH ROW
BEGIN
  IF JSON_OBJECT('adquisicion_id', OLD.adquisicion_id, 'tipo', OLD.tipo, 'precio', OLD.precio, 'descripcion', OLD.descripcion, 'estado', OLD.estado) <> JSON_OBJECT('adquisicion_id', NEW.adquisicion_id, 'tipo', NEW.tipo, 'precio', NEW.precio, 'descripcion', NEW.descripcion, 'estado', NEW.estado) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'ofertas', NEW.id, 'UPDATE', JSON_OBJECT('adquisicion_id', OLD.adquisicion_id, 'tipo', OLD.tipo, 'precio', OLD.precio, 'descripcion', OLD.descripcion, 'estado', OLD.estado), JSON_OBJECT('adquisicion_id', NEW.adquisicion_id, 'tipo', NEW.tipo, 'precio', NEW.precio, 'descripcion', NEW.descripcion, 'estado', NEW.estado));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_ofertas_del$$
CREATE TRIGGER tr_aud_ofertas_del AFTER DELETE ON ofertas FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'ofertas', OLD.id, 'DELETE', JSON_OBJECT('adquisicion_id', OLD.adquisicion_id, 'tipo', OLD.tipo, 'precio', OLD.precio, 'descripcion', OLD.descripcion, 'estado', OLD.estado), NULL);
END$$

DROP TRIGGER IF EXISTS tr_aud_mensajes_ins$$
CREATE TRIGGER tr_aud_mensajes_ins AFTER INSERT ON mensajes FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'mensajes', NEW.id, 'INSERT', NULL, JSON_OBJECT('oferta_id', NEW.oferta_id, 'propietario_id', NEW.propietario_id, 'texto', NEW.texto));
END$$

DROP TRIGGER IF EXISTS tr_aud_mensajes_upd$$
CREATE TRIGGER tr_aud_mensajes_upd AFTER UPDATE ON mensajes FOR EACH ROW
BEGIN
  IF JSON_OBJECT('oferta_id', OLD.oferta_id, 'propietario_id', OLD.propietario_id, 'texto', OLD.texto) <> JSON_OBJECT('oferta_id', NEW.oferta_id, 'propietario_id', NEW.propietario_id, 'texto', NEW.texto) THEN
    INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
    VALUES (@app_usuario_id, USER(), 'mensajes', NEW.id, 'UPDATE', JSON_OBJECT('oferta_id', OLD.oferta_id, 'propietario_id', OLD.propietario_id, 'texto', OLD.texto), JSON_OBJECT('oferta_id', NEW.oferta_id, 'propietario_id', NEW.propietario_id, 'texto', NEW.texto));
  END IF;
END$$

DROP TRIGGER IF EXISTS tr_aud_mensajes_del$$
CREATE TRIGGER tr_aud_mensajes_del AFTER DELETE ON mensajes FOR EACH ROW
BEGIN
  INSERT INTO auditoria (usuario_id, cuenta_bd, tabla, registro_id, accion, antes, despues)
  VALUES (@app_usuario_id, USER(), 'mensajes', OLD.id, 'DELETE', JSON_OBJECT('oferta_id', OLD.oferta_id, 'propietario_id', OLD.propietario_id, 'texto', OLD.texto), NULL);
END$$

DELIMITER ;

-- ---------------------------------------------------------------------
-- 4. Permiso del usuario de la aplicación para el nuevo procedimiento (solo si usa 04_permisos.sql).
--    Ejecute esta línea después de volver a ejecutar 02_procedimientos.sql:
-- GRANT EXECUTE ON PROCEDURE sp_intercambiar_semanas TO 'cam_app'@'%';
-- ---------------------------------------------------------------------
