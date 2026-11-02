-- =====================================================================
-- Sistema de facturación para proyectos inmobiliarios CAM
-- 03 · Datos ficticios de prueba (fecha de referencia: 1 de noviembre de 2026)
-- Ejecutar después de 01 y 02. Las contraseñas las asigna la aplicación al arrancar
-- (cuentas con password_hash = 'PENDIENTE').
-- =====================================================================
USE cam_facturacion;

INSERT INTO propietarios (cedula, nombre, correo) VALUES
('1098001371','Laura Díaz Rueda','laura.diaz1@correo-ficticio.co'),
('1098002742','Ximena Pérez Gómez','ximena.perez2@correo-ficticio.co'),
('1098004113','Tomás Martínez Mantilla','tomas.martinez3@correo-ficticio.co'),
('1098005484','Valentina Pérez Cáceres','valentina.perez4@correo-ficticio.co'),
('1098006855','Helena Pérez Gómez','helena.perez5@correo-ficticio.co'),
('1098008226','Óscar Serrano Gómez','oscar.serrano6@correo-ficticio.co'),
('1098009597','Iván Gómez Duarte','ivan.gomez7@correo-ficticio.co'),
('1098010968','Óscar Pérez Arenas','oscar.perez8@correo-ficticio.co'),
('1098012339','Eduardo Ortiz Arenas','eduardo.ortiz9@correo-ficticio.co'),
('1098013710','Carlos Arenas Arenas','carlos.arenas10@correo-ficticio.co'),
('1098015081','Natalia Pérez Ortiz','natalia.perez11@correo-ficticio.co'),
('1098016452','Carlos Duarte Díaz','carlos.duarte12@correo-ficticio.co'),
('1098017823','Kevin Serrano Díaz','kevin.serrano13@correo-ficticio.co'),
('1098019194','Tomás Martínez Arenas','tomas.martinez14@correo-ficticio.co'),
('1098020565','Kevin Duarte Suárez','kevin.duarte15@correo-ficticio.co'),
('1098021936','Eduardo Arenas Arenas','eduardo.arenas16@correo-ficticio.co'),
('1098023307','Ximena Castro Mantilla','ximena.castro17@correo-ficticio.co'),
('1098024678','Eduardo Duarte Gómez','eduardo.duarte18@correo-ficticio.co'),
('1098026049','Valentina Pérez Villamizar','valentina.perez19@correo-ficticio.co'),
('1098027420','Helena Quintero Duarte','helena.quintero20@correo-ficticio.co'),
('1098028791','Óscar Jaimes Pinzón','oscar.jaimes21@correo-ficticio.co'),
('1098030162','Valentina Pinzón Mantilla','valentina.pinzon22@correo-ficticio.co'),
('1098031533','Kevin Ortiz Suárez','kevin.ortiz23@correo-ficticio.co'),
('1098032904','Zulma Ortiz Gómez','zulma.ortiz24@correo-ficticio.co'),
('1098034275','Valentina Ramírez Cáceres','valentina.ramirez25@correo-ficticio.co'),
('1098035646','Ricardo Jaimes Pinzón','ricardo.jaimes26@correo-ficticio.co'),
('1098037017','Kevin Villamizar Gómez','kevin.villamizar27@correo-ficticio.co'),
('1098038388','Eduardo Cáceres Serrano','eduardo.caceres28@correo-ficticio.co'),
('1098039759','Gustavo Jaimes Díaz','gustavo.jaimes29@correo-ficticio.co'),
('1098041130','Ricardo Serrano Pérez','ricardo.serrano30@correo-ficticio.co'),
('1098042501','Yesid Gómez Duarte','yesid.gomez31@correo-ficticio.co'),
('1098043872','Valentina Jaimes Jaimes','valentina.jaimes32@correo-ficticio.co'),
('1098045243','Zulma Mantilla Villamizar','zulma.mantilla33@correo-ficticio.co'),
('1098046614','Ricardo Arenas Pinzón','ricardo.arenas34@correo-ficticio.co'),
('1098047985','Diana Gómez Vargas','diana.gomez35@correo-ficticio.co'),
('1098049356','Ricardo Gómez Pérez','ricardo.gomez36@correo-ficticio.co'),
('1098050727','Alejandro Ramírez Arenas','alejandro.ramirez37@correo-ficticio.co'),
('1098052098','Yesid Pinzón Ramírez','yesid.pinzon38@correo-ficticio.co'),
('1098053469','Zulma Rueda Mantilla','zulma.rueda39@correo-ficticio.co'),
('1098054840','Andrea Pinzón Mantilla','andrea.pinzon40@correo-ficticio.co'),
('1098056211','Gustavo Villamizar Martínez','gustavo.villamizar41@correo-ficticio.co'),
('1098057582','Ricardo Pérez Castro','ricardo.perez42@correo-ficticio.co'),
('1098058953','Beatriz Ramírez Díaz','beatriz.ramirez43@correo-ficticio.co'),
('1098060324','Alejandro Ortiz Rueda','alejandro.ortiz44@correo-ficticio.co'),
('1098061695','Natalia Quintero Gómez','natalia.quintero45@correo-ficticio.co'),
('1098063066','Gustavo Pinzón Rueda','gustavo.pinzon46@correo-ficticio.co'),
('1098064437','Tomás Vargas Díaz','tomas.vargas47@correo-ficticio.co'),
('1098065808','Óscar Duarte Vargas','oscar.duarte48@correo-ficticio.co'),
('1098067179','Zulma Serrano Mantilla','zulma.serrano49@correo-ficticio.co'),
('1098068550','Yesid Rueda Ortiz','yesid.rueda50@correo-ficticio.co');

-- 52 semanas del año 2027 (sábado a sábado).
INSERT INTO semanas (numero, fecha_checkin, fecha_checkout)
WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 52)
SELECT i, DATE_ADD('2027-01-02', INTERVAL (i - 1) * 7 DAY), DATE_ADD('2027-01-09', INTERVAL (i - 1) * 7 DAY) FROM n;

-- Cada propietario i tiene la semana i. Los propietarios 3 y 7 tienen además las semanas 51 y 52.
INSERT INTO adquisiciones (propietario_id, semana_id, fecha_inicio, valor_total, num_cuotas, valor_cuota, usuario_id)
SELECT p.id, s.id, DATE_ADD('2026-01-05', INTERVAL p.id % 3 MONTH), 18000000, 24, 750000, 1
FROM propietarios p JOIN semanas s ON s.numero = p.id
ORDER BY p.id;
INSERT INTO adquisiciones (propietario_id, semana_id, fecha_inicio, valor_total, num_cuotas, valor_cuota, usuario_id) VALUES
(3, 51, '2026-04-06', 18000000, 24, 750000, 1),
(7, 52, '2026-05-04', 18000000, 24, 750000, 1);

-- Pagos: entre 3 y 10 cuotas por adquisición, nunca después del 31 de octubre de 2026.
-- En una de cada cuatro adquisiciones, la última cuota pagada queda sin verificar.
CREATE TEMPORARY TABLE tmp_plan AS
WITH RECURSIVE k (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM k WHERE n < 10)
SELECT a.id, a.valor_cuota, k.n AS cuota,
       DATE_ADD(DATE_ADD(a.fecha_inicio, INTERVAL k.n - 1 MONTH), INTERVAL a.id % 6 DAY) AS fecha
FROM adquisiciones a JOIN k ON k.n <= 3 + (a.id * 7) % 8
WHERE DATE_ADD(DATE_ADD(a.fecha_inicio, INTERVAL k.n - 1 MONTH), INTERVAL a.id % 6 DAY) <= '2026-10-31';
CREATE TEMPORARY TABLE tmp_ultima AS SELECT id, MAX(cuota) AS cuota FROM tmp_plan GROUP BY id;

INSERT INTO pagos (adquisicion_id, numero_cuota, fecha_pago, valor, verificado, verificado_por, verificado_en, usuario_id, registrado_en)
SELECT t.id, t.cuota, t.fecha, t.valor_cuota,
       NOT (t.cuota = u.cuota AND t.id % 4 = 0),
       IF(t.cuota = u.cuota AND t.id % 4 = 0, NULL, 1),
       IF(t.cuota = u.cuota AND t.id % 4 = 0, NULL, TIMESTAMP(DATE_ADD(t.fecha, INTERVAL 1 DAY), '10:00:00')),
       1, TIMESTAMP(t.fecha, '09:00:00')
FROM tmp_plan t JOIN tmp_ultima u ON u.id = t.id
ORDER BY t.id, t.cuota;

-- Comprobantes de los pagos verificados, salvo la última cuota pagada de cada adquisición.
INSERT INTO comprobantes (numero, pago_id, fecha_emision, correo_destino, estado_envio, enviado_en, usuario_id)
SELECT CONCAT('CMP-', LPAD(pg.id, 6, '0')), pg.id, pg.verificado_en, pr.correo,
       IF(pg.id % 9 = 0, 'FALLIDO', 'ENVIADO'), pg.verificado_en, 1
FROM pagos pg
JOIN adquisiciones a ON a.id = pg.adquisicion_id
JOIN propietarios pr ON pr.id = a.propietario_id
JOIN tmp_ultima u ON u.id = pg.adquisicion_id
WHERE pg.verificado AND pg.numero_cuota < u.cuota
ORDER BY pg.id;

DROP TEMPORARY TABLE tmp_plan;
DROP TEMPORARY TABLE tmp_ultima;

-- Comunidad.
INSERT INTO ofertas (adquisicion_id, tipo, precio, descripcion, estado, publicada_en, cerrada_en) VALUES
(2,  'VENTA',       19500000, 'Vendo mi semana 2 (enero). Incluye cuotas al día.', 'ACTIVA', '2026-10-02 09:15:00', NULL),
(5,  'INTERCAMBIO', NULL,     'Cambio semana 5 por cualquier semana de diciembre.', 'ACTIVA', '2026-10-10 18:40:00', NULL),
(11, 'INTERCAMBIO', NULL,     'Busco semana en Semana Santa; ofrezco la semana 11.', 'ACTIVA', '2026-10-15 11:05:00', NULL),
((SELECT a.id FROM adquisiciones a WHERE a.propietario_id = 3 AND a.semana_id = (SELECT id FROM semanas WHERE numero = 51)), 'VENTA', 18500000, 'Vendo semana 51 (diciembre), ideal para fin de año.', 'ACTIVA', '2026-10-20 08:30:00', NULL),
(20, 'VENTA',       17000000, 'Venta de la semana 20.', 'RETIRADA', '2026-09-01 10:00:00', '2026-09-15 10:00:00');

-- Se localiza cada oferta por su semana (adquisición) para no depender de los números de id.
INSERT INTO mensajes (oferta_id, propietario_id, texto, enviado_en)
SELECT o.id, m.prop, m.texto, m.fecha
FROM (
  SELECT 5 AS adq, 47 AS prop, 'Hola, tengo la semana 47 (noviembre). ¿Te sirve?' AS texto, '2026-10-11 08:02:00' AS fecha
  UNION ALL SELECT 5, 5,  'Me interesa más diciembre, pero lo pienso. ¿Es negociable?', '2026-10-11 09:20:00'
  UNION ALL SELECT 5, 47, 'Claro, hablemos con la secretaria para el cambio de titular.', '2026-10-11 10:01:00'
  UNION ALL SELECT 2, 14, '¿Aceptarías 19 millones?', '2026-10-03 14:00:00'
) m JOIN ofertas o ON o.adquisicion_id = m.adq AND o.estado = 'ACTIVA';

-- Acceso a la comunidad. Helena Pérez Gómez (cédula 1098006855, semana 5): usuario "propietario".
-- Los demás: usuario = cédula. Contraseñas: PROPIETARIO_PASSWORD / PROPIETARIOS_PASSWORD (por defecto 12345).
INSERT INTO usuarios (usuario, nombre, password_hash, rol, propietario_id)
SELECT IF(cedula = '1098006855', 'propietario', cedula), nombre, 'PENDIENTE', 'PROPIETARIO', id FROM propietarios ORDER BY id;
