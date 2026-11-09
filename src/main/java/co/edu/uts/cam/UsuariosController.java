package co.edu.uts.cam;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Solo SUPERADMIN (AuthFilter exige el rol y cada método lo vuelve a comprobar): cuentas de administradores y historial de cambios.
 * Un SUPERADMIN crea cuentas (rol ADMIN o SUPERADMIN), las edita, las activa o desactiva, les cambia la contraseña
 * y elimina definitivamente las que no tienen actividad registrada.
 */
@RestController
@RequestMapping("/api")
public class UsuariosController {

    private static final Pattern USUARIO = Pattern.compile("^[A-Za-z][A-Za-z0-9._-]{2,39}$");
    /** Roles que se pueden asignar desde esta pantalla. PROPIETARIO se crea desde Propietarios. */
    private static final String[] ROLES = {"ADMIN", "SUPERADMIN"};
    private static final String TABLAS = "propietarios usuarios semanas parametros adquisiciones pagos comprobantes ofertas mensajes";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public UsuariosController(JdbcTemplate jdbc, TransactionTemplate tx) {
        this.jdbc = jdbc;
        this.tx = tx;
    }

    @GetMapping("/usuarios")
    public Map<String, Object> usuarios() {
        return Api.list(jdbc.queryForList("SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios"
                + " WHERE rol IN ('SUPERADMIN', 'ADMIN') ORDER BY rol DESC, nombre"));
    }

    @PostMapping("/usuarios")
    public ResponseEntity<Map<String, Object>> crear(@RequestBody(required = false) Map<String, Object> body, @RequestAttribute("user") SessionUser user) {
        exigirSuperadmin(user);
        Validate.only(body, "usuario", "nombre", "password", "rol");
        String usuario = nombreUsuario(body.get("usuario"));
        String nombre = Validate.text(body.get("nombre"), "El nombre", 3, 120);
        String rol = body.get("rol") == null ? "ADMIN" : Validate.oneOf(body.get("rol"), "El rol", ROLES);
        String hash = Passwords.hash(password(body.get("password")));
        Integer id = Api.como(jdbc, tx, user, () -> {
            jdbc.update("INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES (?, ?, ?, ?)", usuario, nombre, hash, rol);
            return jdbc.queryForObject("SELECT LAST_INSERT_ID()", Integer.class);
        });
        return Api.created(Api.one(jdbc, "SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios WHERE id = ?", id));
    }

    /** Edita nombre, usuario y rol. Nadie puede cambiar su propio rol, y siempre queda un superadministrador activo. */
    @PutMapping("/usuarios/{id}")
    public Map<String, Object> editar(@PathVariable int id, @RequestBody(required = false) Map<String, Object> body, @RequestAttribute("user") SessionUser user) {
        exigirSuperadmin(user);
        Validate.only(body, "usuario", "nombre", "rol");
        String usuario = nombreUsuario(body.get("usuario"));
        String nombre = Validate.text(body.get("nombre"), "El nombre", 3, 120);
        String rol = Validate.oneOf(body.get("rol"), "El rol", ROLES);
        String rolActual = (String) gestionable(id).get("rol");
        if (id == user.id() && !rol.equals(rolActual)) throw ApiException.forbidden("No puede cambiar su propio rol.");
        if ("SUPERADMIN".equals(rolActual) && !"SUPERADMIN".equals(rol)) exigirOtroSuperadminActivo(id);
        Api.como(jdbc, tx, user, () -> jdbc.update("UPDATE usuarios SET usuario = ?, nombre = ?, rol = ? WHERE id = ?", usuario, nombre, rol, id));
        return Api.data(Api.one(jdbc, "SELECT id, usuario, nombre, rol, activo, creado_en FROM usuarios WHERE id = ?", id));
    }

    @PatchMapping("/usuarios/{id}/estado")
    public Map<String, Object> estado(@PathVariable int id, @RequestBody(required = false) Map<String, Object> body, @RequestAttribute("user") SessionUser user) {
        exigirSuperadmin(user);
        Validate.only(body, "activo");
        boolean activo = Validate.bool(body.get("activo"), "activo");
        administrador(id);
        Api.como(jdbc, tx, user, () -> jdbc.update("UPDATE usuarios SET activo = ? WHERE id = ?", activo, id));
        return Api.data(Api.map("id", id, "activo", activo));
    }

    @PutMapping("/usuarios/{id}/password")
    public Map<String, Object> cambiarPassword(@PathVariable int id, @RequestBody(required = false) Map<String, Object> body,
                                               @RequestAttribute("user") SessionUser user) {
        exigirSuperadmin(user);
        Validate.only(body, "password");
        String hash = Passwords.hash(password(body.get("password")));
        if (id != user.id()) administrador(id);
        Api.como(jdbc, tx, user, () -> jdbc.update("UPDATE usuarios SET password_hash = ? WHERE id = ?", hash, id));
        return Api.data(Api.map("id", id));
    }

    /**
     * Elimina una cuenta de forma definitiva. Solo SUPERADMIN, con su contraseña como confirmación.
     * Reglas: no a uno mismo, no a propietarios, siempre queda un superadministrador activo, y solo cuentas sin actividad
     * (pagos, comprobantes, asignaciones, parámetros o cambios en el historial), para no perder quién hizo cada cosa.
     * El borrado queda en el historial de cambios (trigger tr_aud_usuarios_del) a nombre de quien lo hizo.
     */
    @DeleteMapping("/usuarios/{id}")
    public Map<String, Object> eliminar(@PathVariable int id, @RequestBody(required = false) Map<String, Object> body, @RequestAttribute("user") SessionUser user) {
        exigirSuperadmin(user);
        Validate.only(body, "password");
        if (id == user.id()) throw ApiException.forbidden("No puede eliminar su propia cuenta.");
        List<String> hashes = jdbc.queryForList("SELECT password_hash FROM usuarios WHERE id = ? AND activo", String.class, user.id());
        if (hashes.isEmpty() || !(body.get("password") instanceof String clave) || !Passwords.verify(clave, hashes.get(0))) {
            throw ApiException.forbidden("La contraseña no es correcta.");
        }
        String rol = (String) gestionable(id).get("rol");
        if ("SUPERADMIN".equals(rol)) exigirOtroSuperadminActivo(id);
        Long actividad = jdbc.queryForObject("SELECT (SELECT COUNT(*) FROM pagos WHERE usuario_id = ? OR verificado_por = ?)"
                + " + (SELECT COUNT(*) FROM comprobantes WHERE usuario_id = ?)"
                + " + (SELECT COUNT(*) FROM adquisiciones WHERE usuario_id = ?)"
                + " + (SELECT COUNT(*) FROM parametros WHERE actualizado_por = ?)"
                + " + (SELECT COUNT(*) FROM auditoria WHERE usuario_id = ?)", Long.class, id, id, id, id, id, id);
        if (actividad != null && actividad > 0) {
            throw new ApiException(409, "CON_ACTIVIDAD", "Esta cuenta tiene actividad registrada y no se puede eliminar. Desactívela para quitarle el acceso.");
        }
        Api.como(jdbc, tx, user, () -> jdbc.update("DELETE FROM usuarios WHERE id = ? AND rol IN ('ADMIN', 'SUPERADMIN')", id));
        return Api.data(Api.map("id", id));
    }

    /** Defensa en profundidad: aunque AuthFilter ya filtra /api/usuarios, cada operación vuelve a exigir el rol. */
    private static void exigirSuperadmin(SessionUser user) {
        if (user == null || !user.superadmin()) throw ApiException.forbidden("Solo el superadministrador puede realizar esta acción.");
    }

    /** La cuenta debe existir y ser ADMIN o SUPERADMIN (las de propietarios se gestionan desde Propietarios). */
    private Map<String, Object> gestionable(int id) {
        Map<String, Object> u = Api.one(jdbc, "SELECT id, rol FROM usuarios WHERE id = ?", id);
        if (u == null) throw ApiException.notFound("El usuario no existe.");
        if (!"ADMIN".equals(u.get("rol")) && !"SUPERADMIN".equals(u.get("rol"))) {
            throw ApiException.forbidden("Las cuentas de propietarios se gestionan desde Propietarios.");
        }
        return u;
    }

    private void exigirOtroSuperadminActivo(int id) {
        Long otros = jdbc.queryForObject("SELECT COUNT(*) FROM usuarios WHERE rol = 'SUPERADMIN' AND activo AND id <> ?", Long.class, id);
        if (otros == null || otros < 1) throw ApiException.forbidden("Debe quedar al menos un superadministrador activo.");
    }

    private static String nombreUsuario(Object v) {
        return Validate.text(v, "El usuario", 3, 40, USUARIO,
                "El usuario debe empezar con una letra y tener solo letras, números, punto, guion o guion bajo.", false);
    }

    /** Solo se gestionan cuentas ADMIN: el superadministrador no puede desactivarse a sí mismo ni tocar propietarios. */
    private void administrador(int id) {
        Map<String, Object> u = Api.one(jdbc, "SELECT rol FROM usuarios WHERE id = ?", id);
        if (u == null) throw ApiException.notFound("El usuario no existe.");
        if (!"ADMIN".equals(u.get("rol"))) throw ApiException.forbidden("Solo se pueden gestionar cuentas de administrador.");
    }

    private static String password(Object v) {
        if (!(v instanceof String s) || s.length() < Passwords.MIN || s.length() > Passwords.MAX) {
            throw ApiException.bad("La contraseña debe tener entre " + Passwords.MIN + " y " + Passwords.MAX + " caracteres.");
        }
        return s;
    }

    // ---------- Historial de cambios (05_superadmin_auditoria_traspasos.sql) ----------
    @GetMapping("/auditoria")
    public Map<String, Object> auditoria(@RequestParam(required = false) String tabla, @RequestParam(required = false) String usuario_id,
                                         @RequestParam(required = false) String desde, @RequestParam(required = false) String hasta,
                                         @RequestParam(required = false) String limit, @RequestParam(required = false) String offset) {
        StringBuilder sql = new StringBuilder("SELECT a.id, a.fecha, a.tabla, a.registro_id, a.accion, a.usuario_id,"
                + " COALESCE(p.nombre, u.nombre, 'Sistema') AS usuario, u.rol, a.cuenta_bd, a.antes, a.despues"
                + " FROM auditoria a LEFT JOIN usuarios u ON u.id = a.usuario_id LEFT JOIN propietarios p ON p.id = u.propietario_id WHERE 1 = 1");
        List<Object> params = new ArrayList<>();
        if (tabla != null && !tabla.isBlank()) {
            sql.append(" AND a.tabla = ?");
            params.add(Validate.oneOf(tabla, "La tabla", TABLAS.split(" ")));
        }
        Integer uid = Validate.integer(usuario_id, "El usuario", 1, Integer.MAX_VALUE, true);
        if (uid != null) {
            sql.append(" AND a.usuario_id = ?");
            params.add(uid);
        }
        LocalDate d = desde == null || desde.isBlank() ? null : Validate.date(desde, "Desde");
        LocalDate hs = hasta == null || hasta.isBlank() ? null : Validate.date(hasta, "Hasta");
        if (d != null && hs != null && d.isAfter(hs)) throw ApiException.bad("La fecha inicial no puede ser mayor que la final.");
        if (d != null) {
            sql.append(" AND a.fecha >= ?");
            params.add(d);
        }
        if (hs != null) {
            sql.append(" AND a.fecha < ?");
            params.add(hs.plusDays(1));
        }
        sql.append(" ORDER BY a.id DESC");
        return Api.page(jdbc, sql.toString(), params, Validate.paging(limit, offset, 50));
    }
}
