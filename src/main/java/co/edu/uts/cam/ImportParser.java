package co.edu.uts.cam;

import java.math.BigDecimal;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Lectura y conversión de los datos del archivo de importación (sin Spring ni POI).
 * Las funciones de conversión lanzan IllegalArgumentException con un mensaje listo para mostrar.
 */
public final class ImportParser {

    /** Columna esperada -> nombres aceptados en el encabezado (ya normalizados: minúsculas, sin tildes ni símbolos). */
    public static final Map<String, List<String>> COLUMNAS = Map.of(
            "cedula", List.of("cedula", "documento", "identificacion", "nit"),
            "semana", List.of("semana", "numerosemana", "nsemana"),
            "cuota", List.of("cuota", "numerocuota", "ncuota", "nocuota"),
            "fecha", List.of("fechapago", "fechadepago", "fecha"),
            "valor", List.of("valor", "monto", "abono", "valorpagado"),
            "verificado", List.of("verificado", "verificacion"));

    private static final Pattern FECHA_ISO = Pattern.compile("^(\\d{4})-(\\d{1,2})-(\\d{1,2})$");
    private static final Pattern FECHA_LATINA = Pattern.compile("^(\\d{1,2})[/-](\\d{1,2})[/-](\\d{4})$");
    private static final Pattern MILES = Pattern.compile("^\\d{1,3}(\\.\\d{3})+$");

    private ImportParser() { }

    /** "Cédula de Pago" -> "cedulapago". */
    public static String normalizar(String s) {
        if (s == null) return "";
        return Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase().replaceAll("[^a-z0-9]", "");
    }

    /** Posición de cada columna esperada dentro del encabezado; -1 si falta. */
    public static Map<String, Integer> indices(List<String> encabezado) {
        Map<String, Integer> idx = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, List<String>> e : COLUMNAS.entrySet()) {
            int pos = -1;
            for (int i = 0; i < encabezado.size() && pos < 0; i++) if (e.getValue().contains(normalizar(encabezado.get(i)))) pos = i;
            idx.put(e.getKey(), pos);
        }
        return idx;
    }

    // ---------- CSV ----------
    public static String decodificar(byte[] bytes) {
        String s;
        try {
            s = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            s = new String(bytes, StandardCharsets.ISO_8859_1); // CSV guardado por Excel en "ANSI"
        }
        return s.startsWith("\uFEFF") ? s.substring(1) : s;
    }

    /** Lee un CSV con separador ; , o tabulación (se detecta en la primera línea) y comillas dobles. */
    public static List<List<String>> leerCsv(byte[] bytes) {
        String text = decodificar(bytes);
        int fin = text.indexOf('\n');
        String primera = fin < 0 ? text : text.substring(0, fin);
        char sep = ';';
        int max = count(primera, ';');
        if (count(primera, ',') > max) { sep = ','; max = count(primera, ','); }
        if (count(primera, '\t') > max) sep = '\t';

        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (quoted) {
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') { cell.append('"'); i++; } else quoted = false;
                } else cell.append(c);
            } else if (c == '"') {
                quoted = true;
            } else if (c == sep) {
                row.add(cell.toString().trim());
                cell.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') i++;
                row.add(cell.toString().trim());
                cell.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
            } else cell.append(c);
        }
        if (cell.length() > 0 || !row.isEmpty()) { row.add(cell.toString().trim()); rows.add(row); }
        return rows;
    }

    private static int count(String s, char c) { return (int) s.chars().filter(x -> x == c).count(); }

    // ---------- Conversión de valores ----------
    public static String soloDigitos(String s) { return s == null ? "" : s.replaceAll("[\\s.\\-,]", ""); }

    public static int entero(String s, String nombre, int min, int max) {
        String t = s == null ? "" : s.trim().replaceAll("[.,]0+$", "");
        if (!t.matches("\\d{1,6}")) throw new IllegalArgumentException(nombre + " debe ser un número entero.");
        int n = Integer.parseInt(t);
        if (n < min || n > max) throw new IllegalArgumentException(nombre + " debe estar entre " + min + " y " + max + ".");
        return n;
    }

    /** AAAA-MM-DD o DD/MM/AAAA (también con guiones). Día primero, como se escribe en Colombia. */
    public static LocalDate fecha(String s) {
        String t = s == null ? "" : s.trim();
        try {
            Matcher m = FECHA_ISO.matcher(t);
            if (m.matches()) return LocalDate.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
            m = FECHA_LATINA.matcher(t);
            if (m.matches()) return LocalDate.of(Integer.parseInt(m.group(3)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(1)));
        } catch (java.time.DateTimeException e) {
            throw new IllegalArgumentException("La fecha de pago no es una fecha válida (" + t + ").");
        }
        throw new IllegalArgumentException("La fecha de pago debe ser AAAA-MM-DD o DD/MM/AAAA.");
    }

    /**
     * "750.000", "$ 750.000,50", "750000", "750000.50" -> BigDecimal.
     * Un punto seguido de exactamente tres dígitos se toma como separador de miles ("750.000" = 750000);
     * la coma es siempre decimal. Mayor que cero y con máximo dos decimales.
     */
    public static BigDecimal valor(String s) {
        String t = s == null ? "" : s.replaceAll("[$\\s]", "");
        if (t.contains(",")) t = t.replace(".", "").replace(',', '.');
        else if (MILES.matcher(t).matches()) t = t.replace(".", "");
        if (!t.matches("\\d{1,12}(\\.\\d{1,2})?") || new BigDecimal(t).signum() <= 0) {
            throw new IllegalArgumentException("El valor debe ser mayor que cero y con máximo dos decimales (" + (s == null ? "" : s.trim()) + ").");
        }
        return new BigDecimal(t);
    }

    /** Vacío = false (el pago queda sin verificar). */
    public static boolean verificado(String s) {
        String t = normalizar(s);
        return t.equals("si") || t.equals("s") || t.equals("true") || t.equals("1") || t.equals("x") || t.equals("verificado") || t.equals("yes");
    }
}
