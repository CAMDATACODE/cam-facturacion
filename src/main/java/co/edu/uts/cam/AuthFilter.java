package co.edu.uts.cam;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Protege /api: exige sesión (401), token CSRF en escrituras (403) y rol (403).
 * El propietario solo llega a /api/auth, /api/ofertas y /api/mis-semanas (FUN-SEG-03).
 * /api/usuarios y /api/auditoria son solo del SUPERADMIN.
 */
@Component
public class AuthFilter implements Filter {

    private final JdbcTemplate jdbc;

    public AuthFilter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;
        String path = req.getRequestURI();
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Referrer-Policy", "same-origin");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Content-Security-Policy",
                "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
        if (!path.startsWith("/api/") || path.equals("/api/health") || path.equals("/api/auth/login")) {
            chain.doFilter(request, response);
            return;
        }
        HttpSession session = req.getSession(false);
        SessionUser user = session == null ? null : (SessionUser) session.getAttribute("user");
        if (user == null) {
            error(res, 401, "SIN_SESION", "Inicie sesión para continuar.");
            return;
        }
        // Una cuenta desactivada pierde el acceso de inmediato, aunque tenga una sesión abierta.
        Boolean activo;
        try {
            activo = jdbc.query("SELECT activo FROM usuarios WHERE id = ?", rs -> rs.next() && rs.getBoolean(1), user.id());
        } catch (DataAccessException e) {
            error(res, 503, "SIN_BASE_DE_DATOS", "El servicio no está disponible en este momento.");
            return;
        }
        if (!Boolean.TRUE.equals(activo)) {
            session.invalidate();
            error(res, 401, "SIN_SESION", "Su cuenta fue desactivada.");
            return;
        }
        String method = req.getMethod();
        if (!method.equals("GET") && !method.equals("HEAD")) {
            String expected = (String) session.getAttribute("csrf");
            String got = req.getHeader("X-CSRF-Token");
            if (expected == null || got == null
                    || !MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), got.getBytes(StandardCharsets.UTF_8))) {
                error(res, 403, "CSRF_INVALIDO", "La sesión no es válida. Recargue la página.");
                return;
            }
        }
        boolean comunidad = path.startsWith("/api/auth/") || path.equals("/api/ofertas") || path.startsWith("/api/ofertas/")
                || path.equals("/api/mis-semanas");
        boolean superadmin = path.startsWith("/api/usuarios") || path.startsWith("/api/auditoria");
        if ((!comunidad && !user.admin()) || (superadmin && !user.superadmin())) {
            error(res, 403, "SIN_PERMISO", "No tiene permiso para esta operación.");
            return;
        }
        req.setAttribute("user", user);
        chain.doFilter(request, response);
    }

    private static void error(HttpServletResponse res, int status, String codigo, String mensaje) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json;charset=UTF-8");
        res.getWriter().write("{\"error\":{\"codigo\":\"" + codigo + "\",\"mensaje\":\"" + mensaje + "\"}}");
    }
}
