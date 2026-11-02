-- 03b · Completa los datos de prueba (comunidad y cuentas de propietarios).
-- Úselo SOLO si 03_datos_prueba.sql se detuvo con el error 1452 en la tabla ofertas.
USE cam_facturacion;

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
