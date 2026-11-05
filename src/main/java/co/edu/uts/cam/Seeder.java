package co.edu.uts.cam;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Asigna la contraseña configurada a las cuentas creadas por los scripts SQL con 'PENDIENTE'
 * (MySQL no puede calcular PBKDF2). Solo toca esas cuentas; las demás no cambian.
 */
@Component
public class Seeder implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(Seeder.class);
    private final JdbcTemplate jdbc;
    private final String admin;
    private final String propietario;
    private final String propietarios;

    public Seeder(JdbcTemplate jdbc, @Value("${cam.admin-password}") String admin,
                  @Value("${cam.propietario-password}") String propietario, @Value("${cam.propietarios-password}") String propietarios) {
        this.jdbc = jdbc;
        this.admin = admin;
        this.propietario = propietario;
        this.propietarios = propietarios;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            List<Map<String, Object>> pendientes = jdbc.queryForList("SELECT id, usuario, rol FROM usuarios WHERE password_hash = 'PENDIENTE'");
            for (Map<String, Object> u : pendientes) {
                String pass = !"PROPIETARIO".equals(u.get("rol")) ? admin : "propietario".equals(u.get("usuario")) ? propietario : propietarios;
                if (pass == null || pass.length() < Passwords.MIN) continue;
                jdbc.update("UPDATE usuarios SET password_hash = ? WHERE id = ? AND password_hash = 'PENDIENTE'", Passwords.hash(pass), u.get("id"));
            }
            if (!pendientes.isEmpty()) LOG.info("Contraseñas asignadas a {} cuentas nuevas.", pendientes.size());
        } catch (Exception e) {
            LOG.warn("No se pudieron preparar las cuentas iniciales: {}", e.getMessage());
        }
    }
}
