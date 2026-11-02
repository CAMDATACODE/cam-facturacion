-- =====================================================================
-- Sistema de facturación para proyectos inmobiliarios CAM
-- 04 · Usuario de la aplicación con permisos mínimos (RNF-SEG-02)
-- Ejecutar con root (o la cuenta que creó la base). Cambie la contraseña antes de ejecutar.
--
-- cam_app consulta todo, mantiene propietarios, semanas, parámetros y cuentas,
-- y escribe pagos, comprobantes, adquisiciones, ofertas y mensajes SOLO mediante
-- los procedimientos (que se ejecutan con los permisos de su creador: SQL SECURITY DEFINER).
-- =====================================================================
CREATE USER IF NOT EXISTS 'cam_app'@'%' IDENTIFIED BY 'CAMBIE_ESTA_CLAVE';

GRANT SELECT ON cam_facturacion.* TO 'cam_app'@'%';
GRANT INSERT ON cam_facturacion.propietarios TO 'cam_app'@'%';
GRANT UPDATE (nombre, correo) ON cam_facturacion.propietarios TO 'cam_app'@'%';
GRANT INSERT, UPDATE (numero, fecha_checkin, fecha_checkout) ON cam_facturacion.semanas TO 'cam_app'@'%';
GRANT UPDATE (valor_total, num_cuotas, valor_cuota, actualizado_en, actualizado_por) ON cam_facturacion.parametros TO 'cam_app'@'%';
GRANT INSERT ON cam_facturacion.usuarios TO 'cam_app'@'%';
GRANT UPDATE (password_hash, activo) ON cam_facturacion.usuarios TO 'cam_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON cam_facturacion.SPRING_SESSION TO 'cam_app'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON cam_facturacion.SPRING_SESSION_ATTRIBUTES TO 'cam_app'@'%';

GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_asignar_semana TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_cambiar_titular TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_registrar_pago TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_verificar_pago TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_anular_pago TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_emitir_comprobante TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_emitir_comprobantes_pendientes TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_registrar_envio TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_recaudo_pendiente TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_publicar_oferta TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_cerrar_oferta TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_eliminar_oferta TO 'cam_app'@'%';
GRANT EXECUTE ON PROCEDURE cam_facturacion.sp_enviar_mensaje TO 'cam_app'@'%';
