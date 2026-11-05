package co.edu.uts.cam;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** Respuestas JSON del contrato y consultas de uso común. */
public final class Api {

    private Api() { }

    /** Mapa ordenado que admite nulos: map("a", 1, "b", null). */
    public static Map<String, Object> map(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    public static Map<String, Object> data(Object d) { return map("data", d); }

    public static Map<String, Object> list(List<?> rows) { return map("data", rows, "total", rows.size()); }

    public static ResponseEntity<Map<String, Object>> created(Object d) { return ResponseEntity.status(201).body(data(d)); }

    /** Primera fila o null. */
    public static Map<String, Object> one(JdbcTemplate jdbc, String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Lista paginada {data, total}; el total no depende de limit/offset. */
    public static Map<String, Object> page(JdbcTemplate jdbc, String sql, List<Object> params, int[] paging) {
        List<Object> p = new java.util.ArrayList<>(params);
        p.add(paging[0]);
        p.add(paging[1]);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT t.*, COUNT(*) OVER () AS _total FROM (" + sql + ") t LIMIT ? OFFSET ?", p.toArray());
        long total;
        if (!rows.isEmpty()) {
            total = ((Number) rows.get(0).get("_total")).longValue();
        } else {
            total = paging[1] == 0 ? 0 : jdbc.queryForObject("SELECT COUNT(*) FROM (" + sql + ") t", Long.class, params.toArray());
        }
        rows.forEach(r -> r.remove("_total"));
        return map("data", rows, "total", total);
    }

    /** Patrón para LIKE con el texto escapado. */
    public static String like(String q) {
        String s = q == null ? "" : q.trim();
        return "%" + s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }

    /**
     * Escritura directa (sin procedimiento) atribuida al usuario de la sesión: fija @app_usuario_id
     * en la misma conexión, dentro de una transacción, para que los triggers de auditoría registren al autor.
     */
    public static <T> T como(JdbcTemplate jdbc, TransactionTemplate tx, SessionUser user, Supplier<T> work) {
        return tx.execute(st -> {
            jdbc.update("SET @app_usuario_id = ?", user.id());
            return work.get();
        });
    }

    /** 0/1 de MySQL o Boolean a boolean. */
    public static boolean bool(Object v) {
        return v instanceof Boolean b ? b : v instanceof Number n && n.intValue() != 0;
    }
}
