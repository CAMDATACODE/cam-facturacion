package co.edu.uts.cam;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import java.net.URI;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Ingreso, sesión y salud del servicio (FUN-SEG-01, FUN-SEG-02). */
@RestController
public class AuthController {

    private static final long VENTANA_MS = 15 * 60 * 1000;
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final String appUrl;
    private final int maxIntentos;
    // shortcut: contador en memoria de una sola instancia; con varias instancias usar un almacén compartido.
    private final Map<String, long[]> intentos = new ConcurrentHashMap<>();

    public AuthController(JdbcTemplate jdbc, @Value("${cam.app-url}") String appUrl, @Value("${cam.login-max-intentos}") int maxIntentos) {
        this.jdbc = jdbc;
        this.appUrl = appUrl;
        this.maxIntentos = maxIntentos;
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> health() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            return ResponseEntity.ok(Api.data(Api.map("estado", "ok")));
        } catch (Exception e) {
            return ResponseEntity.status(503).body(Api.map("error", Api.map("codigo", "SIN_BASE_DE_DATOS", "mensaje", "Base de datos no disponible.")));
        }
    }

    /** Usuario y contraseña. Un único mensaje si falla: no dice qué campo estuvo mal. */
    @PostMapping("/api/auth/login")
    public Map<String, Object> login(@RequestBody(required = false) Map<String, Object> body, HttpServletRequest req) {
        String origin = req.getHeader("Origin");
        if (origin != null && !appUrl.isBlank() && !origin.equals(origin(appUrl))) throw ApiException.forbidden("Origen no permitido.");
        limitar(req.getRemoteAddr());
        Validate.only(body, "usuario", "password");
        String usuario = Validate.text(body.get("usuario"), "El usuario", 1, 40);
        String password = body.get("password") instanceof String p && p.length() <= Passwords.MAX ? p : "";
        Map<String, Object> u = Api.one(jdbc, "SELECT u.id, u.usuario, COALESCE(p.nombre, u.nombre) AS nombre, u.rol, u.propietario_id, u.password_hash"
                + " FROM usuarios u LEFT JOIN propietarios p ON p.id = u.propietario_id WHERE u.usuario = ? AND u.activo", usuario);
        boolean ok = Passwords.verify(password, u == null ? Passwords.DUMMY : (String) u.get("password_hash"));
        if (!ok || u == null || password.isEmpty()) throw new ApiException(401, "CREDENCIALES_INVALIDAS", "Usuario o contraseña incorrectos.");

        // Sesión nueva al ingresar (evita la fijación de sesión).
        HttpSession old = req.getSession(false);
        if (old != null) old.invalidate();
        HttpSession session = req.getSession(true);
        SessionUser user = new SessionUser(((Number) u.get("id")).intValue(), (String) u.get("usuario"), (String) u.get("nombre"),
                (String) u.get("rol"), u.get("propietario_id") == null ? null : ((Number) u.get("propietario_id")).intValue());
        byte[] token = new byte[32];
        RANDOM.nextBytes(token);
        String csrf = HexFormat.of().formatHex(token);
        session.setAttribute("user", user);
        session.setAttribute("csrf", csrf);
        return Api.data(Api.map("usuario", user.json(), "csrfToken", csrf));
    }

    @GetMapping("/api/auth/me")
    public Map<String, Object> me(@RequestAttribute("user") SessionUser user, HttpSession session) {
        return Api.data(Api.map("usuario", user.json(), "csrfToken", session.getAttribute("csrf")));
    }

    @PostMapping("/api/auth/logout")
    public Map<String, Object> logout(HttpSession session) {
        session.invalidate();
        return Api.data(Api.map("ok", true));
    }

    private void limitar(String ip) {
        long now = System.currentTimeMillis();
        long[] h = intentos.compute(ip, (k, v) -> v == null || v[1] < now ? new long[] {1, now + VENTANA_MS} : new long[] {v[0] + 1, v[1]});
        if (h[0] > maxIntentos) throw new ApiException(429, "DEMASIADOS_INTENTOS", "Demasiados intentos de ingreso. Espere 15 minutos.");
        if (intentos.size() > 10_000) intentos.values().removeIf(v -> v[1] < now);
    }

    private static String origin(String url) {
        URI u = URI.create(url);
        return u.getScheme() + "://" + u.getAuthority();
    }
}
