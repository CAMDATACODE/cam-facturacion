package co.edu.uts.cam;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/** Validación de entradas en el servidor. MySQL vuelve a validar con sus restricciones. */
public final class Validate {

    public static final Pattern CEDULA = Pattern.compile("^\\d{5,15}$");
    public static final Pattern CORREO = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Pattern MONEY = Pattern.compile("^\\d{1,12}(\\.\\d{1,2})?$");
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private Validate() { }

    /** Rechaza claves no previstas: el navegador no puede enviar usuario, fechas de registro, etc. */
    public static Map<String, Object> only(Map<String, Object> body, String... allowed) {
        if (body == null) throw ApiException.bad("Envíe un objeto JSON.");
        List<String> ok = Arrays.asList(allowed);
        List<String> extra = body.keySet().stream().filter(k -> !ok.contains(k)).toList();
        if (!extra.isEmpty()) throw ApiException.bad("Campos no permitidos: " + String.join(", ", extra) + ".");
        return body;
    }

    private static boolean empty(Object v) { return v == null || (v instanceof String s && s.isBlank()); }

    public static Integer integer(Object v, String name, int min, int max, boolean optional) {
        if (optional && empty(v)) return null;
        Long n = null;
        if (v instanceof Integer || v instanceof Long) n = ((Number) v).longValue();
        else if (v instanceof String s && s.matches("-?\\d{1,10}")) n = Long.parseLong(s);
        if (n == null || n < min || n > max) throw ApiException.bad(name + " debe ser un número entero entre " + min + " y " + max + ".");
        return n.intValue();
    }

    public static int integer(Object v, String name, int min, int max) { return integer(v, name, min, max, false); }

    public static String text(Object v, String name, int min, int max, Pattern pattern, String patternMsg, boolean optional) {
        if (optional && empty(v)) return null;
        if (!(v instanceof String)) throw ApiException.bad(name + " es obligatorio.");
        String s = ((String) v).trim();
        if (s.length() < min || s.length() > max) throw ApiException.bad(name + " debe tener entre " + min + " y " + max + " caracteres.");
        if (pattern != null && !pattern.matcher(s).matches()) throw ApiException.bad(patternMsg != null ? patternMsg : name + " no tiene un formato válido.");
        return s;
    }

    public static String text(Object v, String name, int min, int max) { return text(v, name, min, max, null, null, false); }

    /** Fecha real en formato AAAA-MM-DD. */
    public static LocalDate date(Object v, String name) {
        if (!(v instanceof String s) || !DATE.matcher(s).matches()) throw ApiException.bad(name + " debe tener el formato AAAA-MM-DD.");
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException e) {
            throw ApiException.bad(name + " no es una fecha válida.");
        }
    }

    /** Importe como texto decimal con punto y máximo dos decimales ("750000" o "750000.50"). */
    public static BigDecimal money(Object v, String name, boolean optional) {
        if (optional && empty(v)) return null;
        String s = v instanceof String str ? str : v instanceof Number ? new BigDecimal(v.toString()).toPlainString() : null;
        if (s == null || !MONEY.matcher(s).matches() || new BigDecimal(s).signum() <= 0) {
            throw ApiException.bad(name + " debe ser un valor mayor que cero, con punto decimal y máximo dos decimales.");
        }
        return new BigDecimal(s);
    }

    public static boolean bool(Object v, String name) {
        if (!(v instanceof Boolean b)) throw ApiException.bad(name + " debe ser true o false.");
        return b;
    }

    public static String oneOf(Object v, String name, String... values) {
        if (!(v instanceof String s) || !Arrays.asList(values).contains(s)) {
            throw ApiException.bad(name + " debe ser uno de: " + String.join(", ", values) + ".");
        }
        return s;
    }

    /** limit (1 a 100, por defecto 20) y offset (0 o más). */
    public static int[] paging(String limit, String offset, int defLimit) {
        return new int[] {
            integer(limit == null ? String.valueOf(defLimit) : limit, "limit", 1, 100),
            integer(offset == null ? "0" : offset, "offset", 0, Integer.MAX_VALUE),
        };
    }
}
