package co.edu.uts.cam;

/** Error con estado HTTP y código para el contrato {"error":{"codigo","mensaje"}}. */
public class ApiException extends RuntimeException {

    public final int status;
    public final String codigo;

    public ApiException(int status, String codigo, String mensaje) {
        super(mensaje);
        this.status = status;
        this.codigo = codigo;
    }

    public static ApiException bad(String msg) { return new ApiException(400, "ENTRADA_INVALIDA", msg); }
    public static ApiException notFound(String msg) { return new ApiException(404, "NO_ENCONTRADO", msg); }
    public static ApiException forbidden(String msg) { return new ApiException(403, "SIN_PERMISO", msg); }
}
