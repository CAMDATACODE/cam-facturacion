package co.edu.uts.cam;

import java.sql.SQLException;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** Traduce errores al contrato HTTP sin exponer SQL, trazas ni contraseñas. */
@RestControllerAdvice
public class ErrorHandler {

    private static final Logger LOG = LoggerFactory.getLogger(ErrorHandler.class);

    /** Mensajes claros para las restricciones de MySQL (por nombre). */
    private static final Map<String, String> RESTRICCIONES = Map.ofEntries(
            Map.entry("uq_propietarios_cedula", "Ya existe un propietario con esa cédula."),
            Map.entry("ck_propietarios_cedula", "La cédula debe tener solo números (5 a 15 dígitos)."),
            Map.entry("ck_propietarios_correo", "El correo no es válido."),
            Map.entry("ck_propietarios_nombre", "Escriba el nombre completo."),
            Map.entry("uq_usuarios_usuario", "Ese usuario ya existe."),
            Map.entry("uq_usuarios_propietario", "Ese propietario ya tiene acceso a la comunidad."),
            Map.entry("uq_semanas_numero", "Ya existe una semana con ese número."),
            Map.entry("ck_semanas_fechas", "La fecha de check-out debe ser posterior a la de check-in."),
            Map.entry("ck_semanas_numero", "El número de semana debe estar entre 1 y 999."),
            Map.entry("uq_adquisiciones_semana_vigente", "Esa semana ya tiene un titular. Use \"Cambiar titular\"."),
            Map.entry("uq_pagos_cuota", "Esa cuota ya está registrada para esta adquisición."),
            Map.entry("ck_pagos_valor", "El valor del pago debe ser mayor que cero."),
            Map.entry("uq_comprobantes_pago", "Ese pago ya tiene comprobante."),
            Map.entry("ck_ofertas_precio", "La venta debe tener precio mayor que cero y el intercambio no lleva precio."),
            Map.entry("uq_ofertas_activa", "Ya tiene una oferta activa para esa semana."),
            Map.entry("ck_parametros_coherentes", "El número de cuotas por el valor de la cuota debe ser igual al valor total."),
            Map.entry("ck_parametros_valores", "Los valores deben ser mayores que cero y las cuotas entre 1 y 120."));

    private static ResponseEntity<Map<String, Object>> body(int status, String codigo, String mensaje) {
        return ResponseEntity.status(status).body(Api.map("error", Api.map("codigo", codigo, "mensaje", mensaje)));
    }

    @ExceptionHandler(ApiException.class)
    public ResponseEntity<Map<String, Object>> api(ApiException e) {
        return body(e.status, e.codigo, e.getMessage());
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, Object>> sql(DataAccessException e) {
        SQLException s = null;
        for (Throwable t = e; t != null; t = t.getCause()) if (t instanceof SQLException x) s = x;
        if (e instanceof DataAccessResourceFailureException || (s != null && String.valueOf(s.getSQLState()).startsWith("08"))) {
            return body(503, "SIN_BASE_DE_DATOS", "El servicio no está disponible en este momento.");
        }
        if (s == null) return unexpected(e);
        String msg = String.valueOf(s.getMessage());
        String friendly = RESTRICCIONES.entrySet().stream().filter(r -> msg.contains(r.getKey())).map(Map.Entry::getValue).findFirst().orElse(null);
        return switch (s.getErrorCode()) {
            // Errores de negocio de los procedimientos (SIGNAL ... MYSQL_ERRNO)
            case 5400 -> body(400, "ENTRADA_INVALIDA", msg);
            case 5403 -> body(403, "SIN_PERMISO", msg);
            case 5404 -> body(404, "NO_ENCONTRADO", msg);
            case 5409 -> body(409, "ESTADO_INCOMPATIBLE", msg);
            case 1062 -> body(409, "DUPLICADO", friendly != null ? friendly : "El registro ya existe.");
            case 3819 -> body(400, "ENTRADA_INVALIDA", friendly != null ? friendly : "Algún dato no cumple las reglas.");
            case 1451, 1452 -> body(409, "REFERENCIA", "El registro está relacionado con otros datos.");
            case 1264, 1292, 1366, 1406 -> body(400, "ENTRADA_INVALIDA", "Algún dato tiene un formato inválido.");
            default -> unexpected(e);
        };
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    public ResponseEntity<Map<String, Object>> badInput(Exception e) {
        return body(400, "ENTRADA_INVALIDA", "La solicitud tiene un formato inválido.");
    }

    @ExceptionHandler({NoResourceFoundException.class, HttpRequestMethodNotSupportedException.class})
    public ResponseEntity<Map<String, Object>> notFound(Exception e) {
        return body(404, "NO_ENCONTRADO", "Ruta no encontrada.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> unexpected(Exception e) {
        LOG.error("Error inesperado", e);
        return body(500, "ERROR_INTERNO", "Ocurrió un error inesperado.");
    }
}
