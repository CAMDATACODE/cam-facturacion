package co.edu.uts.cam;

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

/**
 * Comunidad de intercambio (FUN-COM-01 a FUN-COM-04). La usan ambos roles: el propietario solo ve
 * el primer nombre de los demás (Ley 1581) y opera sobre lo propio; la secretaria supervisa todo.
 */
@RestController
@RequestMapping("/api")
public class ComunidadController {

    private final JdbcTemplate jdbc;

    public ComunidadController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static void soloPropietario(SessionUser u) {
        if (u.admin()) throw ApiException.forbidden("Esta acción es solo para propietarios.");
    }

    @GetMapping("/ofertas")
    public Map<String, Object> ofertas(@RequestAttribute("user") SessionUser u, @RequestParam(required = false) String tipo,
                                       @RequestParam(required = false) String dias, @RequestParam(required = false) String estado,
                                       @RequestParam(required = false) String mias) {
        List<Object> params = new ArrayList<>();
        String autor = "propietario AS autor, FALSE AS es_mia";
        if (!u.admin()) {
            autor = "IF(propietario_id = ?, 'Tú', propietario_nombre_corto) AS autor, propietario_id = ? AS es_mia";
            params.add(u.propietarioId());
            params.add(u.propietarioId());
        }
        List<String> cond = new ArrayList<>();
        if (!u.admin()) {
            // Propietario: ofertas activas de la comunidad, o todas las suyas en "Mis ofertas".
            if ("true".equals(mias)) { cond.add("propietario_id = ?"); params.add(u.propietarioId()); }
            else cond.add("estado = 'ACTIVA'");
        } else if (estado != null && !estado.isEmpty()) {
            cond.add("estado = ?");
            params.add(Validate.oneOf(estado, "estado", "ACTIVA", "RETIRADA", "CONCRETADA"));
        }
        if (tipo != null && !tipo.isEmpty()) { cond.add("tipo = ?"); params.add(Validate.oneOf(tipo, "tipo", "VENTA", "INTERCAMBIO")); }
        if (dias != null && !dias.isEmpty()) { cond.add("publicada_en >= NOW() - INTERVAL ? DAY"); params.add(Validate.integer(dias, "dias", 1, 3650)); }
        return Api.list(jdbc.queryForList("SELECT id, adquisicion_id, tipo, precio, descripcion, estado, publicada_en, cerrada_en,"
                + " semana, fecha_checkin, fecha_checkout, mensajes, " + autor + " FROM v_ofertas"
                + (cond.isEmpty() ? "" : " WHERE " + String.join(" AND ", cond)) + " ORDER BY publicada_en DESC, id DESC", params.toArray()));
    }

    /** Semanas propias que se pueden ofertar. */
    @GetMapping("/mis-semanas")
    public Map<String, Object> misSemanas(@RequestAttribute("user") SessionUser u) {
        soloPropietario(u);
        return Api.list(jdbc.queryForList("SELECT a.id AS adquisicion_id, s.numero AS semana, s.fecha_checkin, s.fecha_checkout,"
                + " EXISTS (SELECT 1 FROM ofertas o WHERE o.adquisicion_id = a.id AND o.estado = 'ACTIVA') AS con_oferta_activa"
                + " FROM adquisiciones a JOIN semanas s ON s.id = a.semana_id"
                + " WHERE a.propietario_id = ? AND a.estado <> 'TRASPASADA' ORDER BY s.numero", u.propietarioId()));
    }

    @PostMapping("/ofertas")
    public ResponseEntity<Map<String, Object>> publicar(@RequestAttribute("user") SessionUser u, @RequestBody(required = false) Map<String, Object> body) {
        soloPropietario(u);
        Validate.only(body, "adquisicion_id", "tipo", "precio", "descripcion");
        String tipo = Validate.oneOf(body.get("tipo"), "El tipo", "VENTA", "INTERCAMBIO");
        Object precio = tipo.equals("VENTA") ? Validate.money(body.get("precio"), "El precio", false)
                : body.get("precio") == null || "".equals(body.get("precio")) ? null : body.get("precio");
        if (precio != null && tipo.equals("INTERCAMBIO")) throw ApiException.bad("Una oferta de intercambio no lleva precio.");
        return Api.created(Api.one(jdbc, "CALL sp_publicar_oferta(?, ?, ?, ?, ?)", u.id(),
                Validate.integer(body.get("adquisicion_id"), "La semana", 1, Integer.MAX_VALUE), tipo, precio,
                Validate.text(body.get("descripcion"), "La descripción", 5, 500)));
    }

    @PatchMapping("/ofertas/{id}/estado")
    public Map<String, Object> cerrar(@RequestAttribute("user") SessionUser u, @PathVariable int id, @RequestBody(required = false) Map<String, Object> body) {
        Validate.only(body, "estado");
        String estado = Validate.oneOf(body.get("estado"), "El estado", "RETIRADA", "CONCRETADA");
        jdbc.update("CALL sp_cerrar_oferta(?, ?, ?)", u.id(), id, estado);
        return Api.data(Api.map("estado", estado));
    }

    @DeleteMapping("/ofertas/{id}")
    public Map<String, Object> eliminar(@RequestAttribute("user") SessionUser u, @PathVariable int id) {
        jdbc.update("CALL sp_eliminar_oferta(?, ?)", u.id(), id);
        return Api.data(Api.map("eliminada", true));
    }

    /** Conversación (FUN-COM-03): orden cronológico con autor, fecha y hora. */
    @GetMapping("/ofertas/{id}/mensajes")
    public Map<String, Object> mensajes(@RequestAttribute("user") SessionUser u, @PathVariable int id) {
        Map<String, Object> o = Api.one(jdbc, "SELECT id, estado, propietario_id, semana, tipo FROM v_ofertas WHERE id = ?", id);
        if (o == null) throw ApiException.notFound("La oferta no existe.");
        if (!u.admin() && !"ACTIVA".equals(o.get("estado")) && !u.propietarioId().equals(((Number) o.get("propietario_id")).intValue())) {
            throw ApiException.forbidden("Esa conversación ya no está disponible.");
        }
        List<Map<String, Object>> msgs = u.admin()
                ? jdbc.queryForList("SELECT m.id, m.texto, m.enviado_en, p.nombre AS autor, FALSE AS es_mio"
                        + " FROM mensajes m JOIN propietarios p ON p.id = m.propietario_id WHERE m.oferta_id = ? ORDER BY m.enviado_en, m.id", id)
                : jdbc.queryForList("SELECT m.id, m.texto, m.enviado_en, IF(m.propietario_id = ?, 'Tú', SUBSTRING_INDEX(p.nombre, ' ', 1)) AS autor,"
                        + " m.propietario_id = ? AS es_mio FROM mensajes m JOIN propietarios p ON p.id = m.propietario_id"
                        + " WHERE m.oferta_id = ? ORDER BY m.enviado_en, m.id", u.propietarioId(), u.propietarioId(), id);
        o.remove("propietario_id");
        return Api.data(Api.map("oferta", o, "mensajes", msgs));
    }

    @PostMapping("/ofertas/{id}/mensajes")
    public ResponseEntity<Map<String, Object>> enviar(@RequestAttribute("user") SessionUser u, @PathVariable int id,
                                                      @RequestBody(required = false) Map<String, Object> body) {
        soloPropietario(u);
        Validate.only(body, "texto");
        return Api.created(Api.one(jdbc, "CALL sp_enviar_mensaje(?, ?, ?)", u.id(), id, Validate.text(body.get("texto"), "El mensaje", 1, 1000)));
    }
}
