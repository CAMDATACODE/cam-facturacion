package co.edu.uts.cam;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Secretaria (ADMIN): pagos, comprobantes, estado de cuenta y recaudo. Las escrituras llaman procedimientos. */
@RestController
@RequestMapping("/api")
public class PagosController {

    private final JdbcTemplate jdbc;

    public PagosController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ---------- Pagos (FUN-PAG-01 a FUN-PAG-05) ----------
    @GetMapping("/pagos")
    public Map<String, Object> pagos(@RequestParam(required = false) String q, @RequestParam(required = false) String verificado,
                                     @RequestParam(required = false) String adquisicion_id, @RequestParam(required = false) String propietario_id,
                                     @RequestParam(required = false) String limit, @RequestParam(required = false) String offset) {
        String like = Api.like(q);
        List<Object> params = new ArrayList<>(List.of(like, like));
        StringBuilder cond = new StringBuilder();
        if (verificado != null && !verificado.isEmpty()) {
            params.add(Validate.oneOf(verificado, "verificado", "true", "false").equals("true"));
            cond.append(" AND verificado = ?");
        }
        if (adquisicion_id != null && !adquisicion_id.isEmpty()) {
            params.add(Validate.integer(adquisicion_id, "adquisicion_id", 1, Integer.MAX_VALUE));
            cond.append(" AND adquisicion_id = ?");
        }
        if (propietario_id != null && !propietario_id.isEmpty()) {
            params.add(Validate.integer(propietario_id, "propietario_id", 1, Integer.MAX_VALUE));
            cond.append(" AND propietario_id = ?");
        }
        String sql = "SELECT id, adquisicion_id, propietario_id, propietario, cedula, semana, numero_cuota, num_cuotas,"
                + " fecha_pago, valor, verificado, comprobante, registrado_por, registrado_en"
                + " FROM v_pagos WHERE (propietario LIKE ? OR cedula LIKE ?)" + cond + " ORDER BY propietario, semana, numero_cuota";
        return Api.page(jdbc, sql, params, Validate.paging(limit, offset, 20));
    }

    /** El usuario y la hora de registro los pone el servidor, no el navegador. */
    @PostMapping("/pagos")
    public ResponseEntity<Map<String, Object>> registrar(@RequestBody(required = false) Map<String, Object> body, @RequestAttribute("user") SessionUser user) {
        Validate.only(body, "adquisicion_id", "numero_cuota", "fecha_pago", "valor", "verificado");
        Map<String, Object> r = Api.one(jdbc, "CALL sp_registrar_pago(?, ?, ?, ?, ?, ?)", user.id(),
                Validate.integer(body.get("adquisicion_id"), "La adquisición", 1, Integer.MAX_VALUE),
                Validate.integer(body.get("numero_cuota"), "La cuota", 1, 120),
                Validate.date(body.get("fecha_pago"), "La fecha de pago"),
                Validate.money(body.get("valor"), "El valor", false),
                Validate.bool(body.get("verificado"), "verificado"));
        return Api.created(Api.map("id", r.get("pago_id"), "cuotas_pagadas", r.get("cuotas_pagadas"), "saldo", r.get("saldo")));
    }

    @PatchMapping("/pagos/{id}/verificacion")
    public Map<String, Object> verificar(@PathVariable int id, @RequestAttribute("user") SessionUser user) {
        Map<String, Object> r = Api.one(jdbc, "CALL sp_verificar_pago(?, ?)", user.id(), id);
        return Api.data(Api.map("verificado", true, "cambiado", Api.bool(r.get("cambiado"))));
    }

    @DeleteMapping("/pagos/{id}")
    public Map<String, Object> anular(@PathVariable int id, @RequestAttribute("user") SessionUser user) {
        jdbc.update("CALL sp_anular_pago(?, ?)", user.id(), id);
        return Api.data(Api.map("anulado", true));
    }

    // ---------- Comprobantes (FUN-CMP-01, FUN-CMP-02) ----------
    @PostMapping("/pagos/{id}/comprobante")
    public ResponseEntity<Map<String, Object>> emitir(@PathVariable int id, @RequestAttribute("user") SessionUser user) {
        Map<String, Object> r = Api.one(jdbc, "CALL sp_emitir_comprobante(?, ?)", user.id(), id);
        boolean creado = Api.bool(r.get("creado"));
        return ResponseEntity.status(creado ? 201 : 200).body(Api.data(Api.map("numero", r.get("numero"), "creado", creado)));
    }

    @PostMapping("/comprobantes/emitir-pendientes")
    public Map<String, Object> emitirPendientes(@RequestAttribute("user") SessionUser user) {
        return Api.data(Api.map("emitidos", Api.one(jdbc, "CALL sp_emitir_comprobantes_pendientes(?)", user.id()).get("emitidos")));
    }

    @GetMapping("/comprobantes")
    public Map<String, Object> comprobantes(@RequestParam(required = false) String q, @RequestParam(required = false) String estado_envio,
                                            @RequestParam(required = false) String limit, @RequestParam(required = false) String offset) {
        String like = Api.like(q);
        List<Object> params = new ArrayList<>(List.of(like, like, like));
        String cond = "";
        if (estado_envio != null && !estado_envio.isEmpty()) {
            params.add(Validate.oneOf(estado_envio, "estado_envio", "PENDIENTE", "ENVIADO", "FALLIDO"));
            cond = " AND estado_envio = ?";
        }
        String sql = "SELECT pago_id AS id, numero, fecha_emision, propietario, cedula, semana, numero_cuota, valor, correo_destino, estado_envio"
                + " FROM v_comprobantes WHERE (numero LIKE ? OR cedula LIKE ? OR propietario LIKE ?)" + cond + " ORDER BY fecha_emision DESC, id DESC";
        Map<String, Object> out = Api.page(jdbc, sql, params, Validate.paging(limit, offset, 20));
        out.put("pendientes_por_emitir", jdbc.queryForObject("SELECT COUNT(*) FROM pagos pg WHERE pg.verificado"
                + " AND NOT EXISTS (SELECT 1 FROM comprobantes c WHERE c.pago_id = pg.id)", Long.class));
        return out;
    }

    /** Detalle para imprimir. Se identifica por el id del pago. */
    @GetMapping("/comprobantes/{pagoId}")
    public Map<String, Object> comprobante(@PathVariable int pagoId) {
        Map<String, Object> r = Api.one(jdbc, "SELECT * FROM v_comprobantes WHERE pago_id = ?", pagoId);
        if (r == null) throw ApiException.notFound("Ese pago todavía no tiene comprobante.");
        return Api.data(r);
    }

    @PatchMapping("/comprobantes/{pagoId}/envio")
    public Map<String, Object> envio(@PathVariable int pagoId, @RequestBody(required = false) Map<String, Object> body,
                                     @RequestAttribute("user") SessionUser user) {
        Validate.only(body, "estado");
        String estado = Validate.oneOf(body.get("estado"), "estado", "ENVIADO", "FALLIDO");
        jdbc.update("CALL sp_registrar_envio(?, ?, ?)", user.id(), pagoId, estado);
        return Api.data(Api.map("estado_envio", estado));
    }

    // ---------- Estado de cuenta (FUN-EDC-01) ----------
    @GetMapping("/estado-cuenta")
    public Map<String, Object> estadoCuenta(@RequestParam(required = false) String propietario_id) {
        Integer pid = Validate.integer(propietario_id, "propietario_id", 1, Integer.MAX_VALUE, true);
        Map<String, Object> resumen = Api.one(jdbc, "SELECT COALESCE(SUM(total_abonado), 0) AS total_abonado,"
                + " CAST(COALESCE(SUM(cuotas_pagadas), 0) AS SIGNED) AS cuotas_pagadas, CAST(COALESCE(SUM(cuotas_pendientes), 0) AS SIGNED) AS cuotas_pendientes,"
                + " COALESCE(SUM(saldo), 0) AS saldo, COALESCE(SUM(valor_total), 0) AS valor_total, COUNT(*) AS semanas"
                + " FROM v_estado_cuenta WHERE estado <> 'TRASPASADA' AND (? IS NULL OR propietario_id = ?)", pid, pid);
        List<Map<String, Object>> filas = pid != null
                ? jdbc.queryForList("SELECT adquisicion_id, semana, cuota, vence, fecha_pago, valor, estado FROM v_cuotas"
                        + " WHERE propietario_id = ? ORDER BY semana, cuota", pid)
                : jdbc.queryForList("SELECT adquisicion_id, propietario_id, nombre AS propietario, cedula, semana, valor_total, cuotas_pagadas,"
                        + " cuotas_pendientes, total_abonado, saldo, estado FROM v_estado_cuenta WHERE estado <> 'TRASPASADA' ORDER BY nombre, semana");
        return Api.data(Api.map("resumen", resumen, "filas", filas));
    }

    // ---------- Recaudo mensual (FUN-EDC-02) ----------
    @GetMapping("/recaudo")
    public Map<String, Object> recaudo(@RequestParam(required = false) String anio, @RequestParam(required = false) String mes) {
        int a = Validate.integer(anio, "anio", 2000, 2100);
        int m = Validate.integer(mes, "mes", 1, 12);
        LocalDate desde = LocalDate.of(a, m, 1);
        List<Map<String, Object>> pendientes = jdbc.queryForList("CALL sp_recaudo_pendiente(?, ?)", a, m);
        List<Map<String, Object>> sinVerificar = jdbc.queryForList("SELECT id, propietario, semana, numero_cuota, fecha_pago, valor"
                + " FROM v_pagos WHERE NOT verificado ORDER BY fecha_pago, id");
        Map<String, Object> esperado = Api.one(jdbc, "SELECT COUNT(*) AS cuotas, COALESCE(SUM(valor_cuota), 0) AS valor FROM adquisiciones"
                + " WHERE estado <> 'TRASPASADA' AND (? * 12 + ?) - (YEAR(fecha_inicio) * 12 + MONTH(fecha_inicio)) + 1 BETWEEN 1 AND num_cuotas", a, m);
        Map<String, Object> recaudado = Api.one(jdbc, "SELECT COUNT(*) AS pagos, COALESCE(SUM(valor), 0) AS valor FROM pagos"
                + " WHERE fecha_pago >= ? AND fecha_pago < ?", desde, desde.plusMonths(1));
        return Api.data(Api.map("pendientes", pendientes, "sin_verificar", sinVerificar, "esperado", esperado, "recaudado", recaudado));
    }
}
