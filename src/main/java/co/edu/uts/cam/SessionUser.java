package co.edu.uts.cam;

import java.io.Serializable;
import java.util.Map;

/** Usuario guardado en la sesión. Solo datos públicos, nunca la contraseña. */
public record SessionUser(int id, String usuario, String nombre, String rol, Integer propietarioId) implements Serializable {

    /** ADMIN y SUPERADMIN gestionan la información administrativa. */
    public boolean admin() { return "ADMIN".equals(rol) || superadmin(); }

    /** Solo SUPERADMIN administra las cuentas de los administradores y consulta el historial. */
    public boolean superadmin() { return "SUPERADMIN".equals(rol); }

    public Map<String, Object> json() {
        return Api.map("id", id, "usuario", usuario, "nombre", nombre, "rol", rol, "propietario_id", propietarioId);
    }
}
