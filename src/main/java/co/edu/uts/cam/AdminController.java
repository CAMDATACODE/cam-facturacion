package co.edu.uts.cam;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Secretaria (ADMIN): inicio, propietarios, semanas, parámetros y asignaciones. AuthFilter exige el rol. */
@RestController
@RequestMapping("/api")
public class AdminController {

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public AdminController(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    // ---------- Inicio ----------
    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        Map<String, Object> k = Api.one(jdbc, "SELECT"
                + " (SELECT COUNT(*) FROM propietarios) AS propietarios,"
                + " (SELECT COUNT(*) FROM adquisiciones WHERE estado <> 'TRASPASADA') AS semanas_asignadas,"
                + " (SELECT COUNT(*) FROM semanas) AS semanas,"
                + " (SELECT COALESCE(SUM(total_abonado), 0) FROM v_estado_cuenta WHERE estado <> 'TRASPASADA') AS recaudado,"
                + " (SELECT COALESCE(SUM(saldo), 0) FROM v_estado_cuenta WHERE estado <> 'TRASPASADA') AS saldo,"
                + " (SELECT CAST(COALESCE(SUM(cuotas_pagadas), 0) AS SIGNED) FROM v_estado_cuenta WHERE estado <> 'TRASPASADA') AS cuotas_pagadas,"
                + " (SELECT CAST(COALESCE(SUM(num_cuotas), 0) AS SIGNED) FROM v_estado_cuenta WHERE estado <> 'TRASPASADA') AS cuotas_plan,"
                + " (SELECT COUNT(*) FROM pagos WHERE NOT verificado) AS pagos_sin_verificar,"
                + " (SELECT COUNT(*) FROM comprobantes WHERE estado_envio <> 'ENVIADO') AS comprobantes_sin_enviar,"
                + " (SELECT COUNT(*) FROM ofertas WHERE estado = 'ACTIVA') AS ofertas_activas");
        // Recaudo de los últimos 12 meses (los meses sin pagos van en 0).
        YearMonth now = YearMonth.now(ZoneId.of("America/Bogota"));
        Map<String, Object> porMes = new java.util.HashMap<>();
        for (Map<String, Object> r : jdbc.queryForList("SELECT DATE_FORMAT(fecha_pago, '%Y-%m') AS mes, SUM(valor) AS valor FROM pagos"
                + " WHERE fecha_pago >= ? GROUP BY DATE_FORMAT(fecha_pago, '%Y-%m')", now.minusMonths(11).atDay(1))) {
            porMes.put((String) r.get("mes"), r.get("valor"));
        }
        List<Map<String, Object>> meses = new ArrayList<>();
        for (int i = 11; i >= 0; i--) {
            String m = now.minusMonths(i).toString();
            meses.add(Api.map("mes", m, "valor", porMes.getOrDefault(m, java.math.BigDecimal.ZERO)));
        }
        List<Map<String, Object>> ultimos = jdbc.queryForList("SELECT id, propietario, semana, numero_cuota, fecha_pago, valor, verificado"
                + " FROM v_pagos ORDER BY registrado_en DESC, id DESC LIMIT 10");
        return Api.data(Api.map("indicadores", k, "recaudo_mensual", meses, "ultimos_pagos", ultimos));
    }

    // ---------- Propietarios (FUN-PRO-01, FUN-PRO-02, FUN-SEM-03) ----------
    @GetMapping("/propietarios")
    public Map<String, Object> propietarios(@RequestParam(required = false) String q, @RequestParam(required = false) String limit,
                                            @RequestParam(required = false) String offset) {
        String sql = "SELECT p.id, p.cedula, p.nombre, p.correo,"
                + " (SELECT COUNT(*) FROM adquisiciones a WHERE a.propietario_id = p.id AND a.estado <> 'TRASPASADA') AS semanas,"
                + " EXISTS (SELECT 1 FROM usuarios u WHERE u.propietario_id = p.id AND u.activo) AS acceso_comunidad"
                + " FROM propietarios p WHERE p.cedula LIKE ? OR p.nombre LIKE ? ORDER BY p.nombre, p.id";
        String like = Api.like(q);
        return Api.page(jdbc, sql, List.of(like, like), Validate.paging(limit, offset, 20));
    }

    @GetMapping("/propietarios/{id}")
    public Map<String, Object> propietario(@PathVariable int id) {
        Map<String, Object> p = Api.one(jdbc, "SELECT p.id, p.cedula, p.nombre, p.correo,"
                + " EXISTS (SELECT 1 FROM usuarios u WHERE u.propietario_id = p.id AND u.activo) AS acceso_comunidad"
                + " FROM propietarios p WHERE p.id = ?", id);
        if (p == null) throw ApiException.notFound("El propietario no existe.");
        p.put("semanas", jdbc.queryForList("SELECT a.id AS adquisicion_id, s.numero AS semana, s.fecha_checkin, s.fecha_checkout, a.estado"
                + " FROM adquisiciones a JOIN semanas s ON s.id = a.semana_id WHERE a.propietario_id = ? ORDER BY s.numero, a.id", id));
        return Api.data(p);
    }

    @PostMapping("/propietarios")
    public ResponseEntity<Map<String, Object>> crearPropietario(@RequestBody(required = false) Map<String, Object> body) {
        Validate.only(body, "cedula", "nombre", "correo", "password");
        String cedula = Validate.text(body.get("cedula"), "La cédula", 5, 15, Validate.CEDULA, "La cédula debe tener solo números (5 a 15 dígitos).", false);
        String nombre = Validate.text(body.get("nombre"), "El nombre", 3, 120);
        String correo = Validate.text(body.get("correo"), "El correo", 5, 150, Validate.CORREO, "El correo no es válido.", false);
        String password = password(body.get("password"), true);
        // Propietario y cuenta de la comunidad en una sola transacción.
        Integer id = tx.execute(st -> {
            jdbc.update("INSERT INTO propietarios (cedula, nombre, correo) VALUES (?, ?, ?)", cedula, nombre, correo);
            Integer nuevo = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
            if (password != null) definirAcceso(nuevo, password);
            return nuevo;
        });
        return Api.created(Api.one(jdbc, "SELECT id, cedula, nombre, correo FROM propietarios WHERE id = ?", id));
    }

    /** La cédula no se modifica; los pagos registrados no cambian. */
    @PutMapping("/propietarios/{id}")
    public Map<String, Object> editarPropietario(@PathVariable int id, @RequestBody(required = false) Map<String, Object> body) {
        Validate.only(body, "nombre", "correo");
        String nombre = Validate.text(body.get("nombre"), "El nombre", 3, 120);
        String correo = Validate.text(body.get("correo"), "El correo", 5, 150, Validate.CORREO, "El correo no es válido.", false);
        if (Api.one(jdbc, "SELECT id FROM propietarios WHERE id = ?", id) == null) throw ApiException.notFound("El propietario no existe.");
        jdbc.update("UPDATE propietarios SET nombre = ?, correo = ? WHERE id = ?", nombre, correo, id);
        return Api.data(Api.one(jdbc, "SELECT id, cedula, nombre, correo FROM propietarios WHERE id = ?", id));
    }

    /** Crea o cambia la contraseña de la comunidad (usuario = cédula). */
    @PutMapping("/propietarios/{id}/acceso")
    public Map<String, Object> acceso(@PathVariable int id, @RequestBody(required = false) Map<String, Object> body) {
        Validate.only(body, "password");
        String password = password(body.get("password"), false);
        if (Api.one(jdbc, "SELECT id FROM propietarios WHERE id = ?", id) == null) throw ApiException.notFound("El propietario no existe.");
        return Api.data(definirAcceso(id, password));
    }

    private Map<String, Object> definirAcceso(int propietarioId, String password) {
        String hash = Passwords.hash(password);
        int n = jdbc.update("UPDATE usuarios SET password_hash = ?, activo = TRUE WHERE propietario_id = ?", hash, propietarioId);
        if (n == 0) {
            jdbc.update("INSERT INTO usuarios (usuario, nombre, password_hash, rol, propietario_id)"
                    + " SELECT cedula, nombre, ?, 'PROPIETARIO', id FROM propietarios WHERE id = ?", hash, propietarioId);
        }
        String usuario = jdbc.queryForObject("SELECT usuario FROM usuarios WHERE propietario_id = ?", String.class, propietarioId);
        return Api.map("usuario", usuario, "creado", n == 0);
    }

    private static String password(Object v, boolean optional) {
        if (optional && (v == null || "".equals(v))) return null;
        if (!(v instanceof String s) || s.length() < Passwords.MIN || s.length() > Passwords.MAX) {
            throw ApiException.bad("La contraseña debe tener entre " + Passwords.MIN + " y " + Passwords.MAX + " caracteres.");
        }
        return s;
    }

    // ---------- Semanas (FUN-SEM-01) ----------
    @GetMapping("/semanas")
    public Map<String, Object> semanas(@RequestParam(defaultValue = "todas") String estado) {
        String cond = switch (Validate.oneOf(estado, "estado", "todas", "libres", "asignadas")) {
            case "libres" -> " WHERE a.id IS NULL";
            case "asignadas" -> " WHERE a.id IS NOT NULL";
            default -> "";
        };
        return Api.list(jdbc.queryForList("SELECT s.id, s.numero, s.fecha_checkin, s.fecha_checkout,"
                + " DATEDIFF(s.fecha_checkout, s.fecha_checkin) AS noches, p.nombre AS titular, a.id AS adquisicion_id,"
                + " IF(a.id IS NULL, 'LIBRE', 'ASIGNADA') AS estado"
                + " FROM semanas s LEFT JOIN adquisiciones a ON a.semana_id = s.id AND a.estado <> 'TRASPASADA'"
                + " LEFT JOIN propietarios p ON p.id = a.propietario_id" + cond + " ORDER BY s.numero"));
    }

    private Object[] semana(Map<String, Object> body) {
        Validate.only(body, "numero", "fecha_checkin", "fecha_checkout");
        int numero = Validate.integer(body.get("numero"), "El número", 1, 999);
        LocalDate in = Validate.date(body.get("fecha_checkin"), "El check-in");
        LocalDate out = Validate.date(body.get("fecha_checkout"), "El check-out");
        if (!out.isAfter(in)) throw ApiException.bad("La fecha de check-out debe ser posterior a la de check-in.");
        return new Object[] {numero, in, out};
    }

    @PostMapping("/semanas")
    public ResponseEntity<Map<String, Object>> crearSemana(@RequestBody(required = false) Map<String, Object> body) {
        Object[] s = semana(body);
        jdbc.update("INSERT INTO semanas (numero, fecha_checkin, fecha_checkout) VALUES (?, ?, ?)", s);
        return Api.created(Api.one(jdbc, "SELECT * FROM semanas WHERE numero = ?", s[0]));
    }

    @PutMapping("/semanas/{id}")
    public Map<String, Object> editarSemana(@PathVariable int id, @RequestBody(required = false) Map<String, Object> body) {
        Object[] s = semana(body);
        if (Api.one(jdbc, "SELECT id FROM semanas WHERE id = ?", id) == null) throw ApiException.notFound("La semana no existe.");
        jdbc.update("UPDATE semanas SET numero = ?, fecha_checkin = ?, fecha_checkout = ? WHERE id = ?", s[0], s[1], s[2], id);
        return Api.data(Api.one(jdbc, "SELECT * FROM semanas WHERE id = ?", id));
    }

    // ---------- Parámetros (FUN-REP-01) ----------
    @GetMapping("/parametros")
    public Map<String, Object> parametros() {
        return Api.data(Api.one(jdbc, "SELECT p.valor_total, p.num_cuotas, p.valor_cuota, p.actualizado_en, u.nombre AS actualizado_por"
                + " FROM parametros p LEFT JOIN usuarios u ON u.id = p.actualizado_por WHERE p.id = 1"));
    }

    /** Solo afecta asignaciones nuevas: cada adquisición guarda sus propias condiciones. */
    @PutMapping("/parametros")
    public Map<String, Object> guardarParametros(@RequestBody(required = false) Map<String, Object> body, @RequestAttribute("user") SessionUser user) {
        Validate.only(body, "valor_total", "num_cuotas", "valor_cuota");
        jdbc.update("UPDATE parametros SET valor_total = ?, num_cuotas = ?, valor_cuota = ?, actualizado_en = NOW(), actualizado_por = ? WHERE id = 1",
                Validate.money(body.get("valor_total"), "El valor total", false), Validate.integer(body.get("num_cuotas"), "El número de cuotas", 1, 120),
                Validate.money(body.get("valor_cuota"), "El valor de la cuota", false), user.id());
        return parametros();
    }

    // ---------- Asignaciones (FUN-SEM-02) ----------
    @GetMapping("/adquisiciones")
    public Map<String, Object> adquisiciones(@RequestParam(required = false) String q, @RequestParam(defaultValue = "VIGENTES") String estado,
                                             @RequestParam(required = false) String limit, @RequestParam(required = false) String offset) {
        Validate.oneOf(estado, "estado", "VIGENTES", "ACTIVA", "PAGADA", "TRASPASADA", "TODAS");
        String like = Api.like(q);
        List<Object> params = new ArrayList<>(List.of(like, like, like));
        String cond = "";
        if (estado.equals("VIGENTES")) cond = " AND e.estado <> 'TRASPASADA'";
        else if (!estado.equals("TODAS")) { cond = " AND e.estado = ?"; params.add(estado); }
        String sql = "SELECT e.adquisicion_id AS id, e.propietario_id, e.nombre AS propietario, e.cedula, e.semana, e.fecha_inicio,"
                + " e.valor_total, e.num_cuotas, e.valor_cuota, e.cuotas_pagadas, e.saldo, e.estado FROM v_estado_cuenta e"
                + " WHERE (e.nombre LIKE ? OR e.cedula LIKE ? OR CAST(e.semana AS CHAR) LIKE ?)" + cond + " ORDER BY e.semana, e.adquisicion_id";
        return Api.page(jdbc, sql, params, Validate.paging(limit, offset, 100));
    }

    @PostMapping("/adquisiciones")
    public ResponseEntity<Map<String, Object>> asignar(@RequestBody(required = false) Map<String, Object> body, @RequestAttribute("user") SessionUser user) {
        Validate.only(body, "propietario_id", "semana_id", "fecha_inicio");
        Map<String, Object> r = Api.one(jdbc, "CALL sp_asignar_semana(?, ?, ?, ?)", user.id(),
                Validate.integer(body.get("propietario_id"), "El propietario", 1, Integer.MAX_VALUE),
                Validate.integer(body.get("semana_id"), "La semana", 1, Integer.MAX_VALUE), Validate.date(body.get("fecha_inicio"), "La fecha de inicio"));
        return Api.created(r);
    }

    @PostMapping("/adquisiciones/{id}/traspaso")
    public ResponseEntity<Map<String, Object>> traspaso(@PathVariable int id, @RequestBody(required = false) Map<String, Object> body,
                                                        @RequestAttribute("user") SessionUser user) {
        Validate.only(body, "nuevo_propietario_id");
        return Api.created(Api.one(jdbc, "CALL sp_cambiar_titular(?, ?, ?)", user.id(), id,
                Validate.integer(body.get("nuevo_propietario_id"), "El nuevo titular", 1, Integer.MAX_VALUE)));
    }

    /** Avance de una adquisición y siguiente cuota sin pago (para el formulario de pagos). */
    @GetMapping("/adquisiciones/{id}/resumen")
    public Map<String, Object> resumen(@PathVariable int id) {
        Map<String, Object> e = Api.one(jdbc, "SELECT e.*, (SELECT MIN(c.cuota) FROM v_cuotas c WHERE c.adquisicion_id = e.adquisicion_id"
                + " AND c.fecha_pago IS NULL) AS siguiente_cuota FROM v_estado_cuenta e WHERE e.adquisicion_id = ?", id);
        if (e == null) throw ApiException.notFound("La adquisición no existe.");
        return Api.data(e);
    }
}
