package co.edu.uts.cam;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.DateUtil;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Importa pagos de cuotas desde un Excel (.xlsx) o CSV al Estado de cuenta.
 * Cada fila se registra con sp_registrar_pago (mismas reglas, auditoría y estado de la adquisición que el formulario de Pagos).
 * Una fila con error no detiene las demás, y volver a cargar el mismo archivo no duplica nada (las cuotas ya registradas se omiten).
 * AuthFilter exige ADMIN o SUPERADMIN y el token CSRF.
 */
@RestController
@RequestMapping("/api")
public class ImportController {

    private static final Logger LOG = LoggerFactory.getLogger(ImportController.class);
    private static final long MAX_BYTES = 5L * 1024 * 1024;
    private static final int MAX_FILAS = 2000;
    private static final int MAX_ERRORES = 100;

    private final JdbcTemplate jdbc;

    public ImportController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Fila del archivo ya como lista de textos; numero = número de fila tal como la ve la persona en Excel. */
    private record Linea(int numero, List<String> celdas) { }

    @PostMapping("/estado-cuenta/importar")
    public Map<String, Object> importar(@RequestParam(value = "archivo", required = false) MultipartFile archivo,
                                        @RequestAttribute("user") SessionUser user) throws IOException {
        if (archivo == null || archivo.isEmpty()) throw ApiException.bad("Seleccione un archivo .xlsx o .csv.");
        if (archivo.getSize() > MAX_BYTES) throw ApiException.bad("El archivo supera los 5 MB.");
        String nombre = archivo.getOriginalFilename() == null ? "" : archivo.getOriginalFilename().toLowerCase(Locale.ROOT);
        byte[] bytes = archivo.getBytes();

        List<Linea> lineas;
        if (nombre.endsWith(".xlsx")) lineas = leerXlsx(bytes);
        else if (nombre.endsWith(".csv")) lineas = leerCsv(bytes);
        else throw ApiException.bad("Formato no admitido. Use un archivo .xlsx o .csv.");

        if (lineas.isEmpty()) throw ApiException.bad("El archivo está vacío.");
        Linea encabezado = lineas.get(0);
        Map<String, Integer> col = ImportParser.indices(encabezado.celdas());
        List<String> faltan = new ArrayList<>();
        for (String c : List.of("cedula", "semana", "cuota", "fecha", "valor")) if (col.get(c) < 0) faltan.add(c.equals("fecha") ? "fecha_pago" : c);
        if (!faltan.isEmpty()) {
            throw ApiException.bad("Faltan columnas en la primera fila: " + String.join(", ", faltan)
                    + ". Columnas esperadas: cedula, semana, cuota, fecha_pago, valor y (opcional) verificado.");
        }
        List<Linea> datos = lineas.subList(1, lineas.size()).stream().filter(l -> l.celdas().stream().anyMatch(s -> !s.isBlank())).toList();
        if (datos.isEmpty()) throw ApiException.bad("El archivo no tiene filas de datos.");
        if (datos.size() > MAX_FILAS) throw ApiException.bad("El archivo tiene más de " + MAX_FILAS + " filas. Divídalo en partes.");

        int importadas = 0;
        int omitidas = 0;
        int conError = 0;
        List<Map<String, Object>> errores = new ArrayList<>();
        Map<String, Integer> adquisiciones = new HashMap<>();   // cedula|semana -> adquisicion_id
        Map<Integer, Integer> planes = new HashMap<>();         // adquisicion_id -> num_cuotas
        Set<String> vistas = new HashSet<>();                   // adquisicion|cuota ya procesadas en este archivo

        for (Linea l : datos) {
            try {
                String cedula = ImportParser.soloDigitos(celda(l, col.get("cedula")));
                if (!Validate.CEDULA.matcher(cedula).matches()) throw new IllegalArgumentException("La cédula debe tener entre 5 y 15 dígitos.");
                int semana = ImportParser.entero(celda(l, col.get("semana")), "La semana", 1, 999);
                int cuota = ImportParser.entero(celda(l, col.get("cuota")), "La cuota", 1, 120);
                LocalDate fecha = ImportParser.fecha(celda(l, col.get("fecha")));
                BigDecimal valor = ImportParser.valor(celda(l, col.get("valor")));
                boolean verificado = ImportParser.verificado(celda(l, col.get("verificado")));

                String clave = cedula + "|" + semana;
                Integer adq = adquisiciones.get(clave);
                if (adq == null) {
                    List<Map<String, Object>> r = jdbc.queryForList("SELECT adquisicion_id, num_cuotas FROM v_estado_cuenta"
                            + " WHERE cedula = ? AND semana = ? AND estado <> 'TRASPASADA'", cedula, semana);
                    if (r.isEmpty()) throw new IllegalArgumentException("No hay una semana " + semana + " vigente para la cédula " + cedula + ".");
                    adq = ((Number) r.get(0).get("adquisicion_id")).intValue();
                    adquisiciones.put(clave, adq);
                    planes.put(adq, ((Number) r.get(0).get("num_cuotas")).intValue());
                }
                if (cuota > planes.get(adq)) throw new IllegalArgumentException("La cuota " + cuota + " está fuera del plan (" + planes.get(adq) + " cuotas).");
                if (!vistas.add(adq + "|" + cuota)) throw new IllegalArgumentException("La cuota " + cuota + " de la semana " + semana + " está repetida en el archivo.");

                Long ya = jdbc.queryForObject("SELECT COUNT(*) FROM pagos WHERE adquisicion_id = ? AND numero_cuota = ?", Long.class, adq, cuota);
                if (ya != null && ya > 0) { omitidas++; continue; }

                Api.one(jdbc, "CALL sp_registrar_pago(?, ?, ?, ?, ?, ?)", user.id(), adq, cuota, fecha, valor, verificado);
                importadas++;
            } catch (IllegalArgumentException e) {
                conError++;
                anotar(errores, l.numero(), e.getMessage());
            } catch (DataAccessException e) {
                SQLException s = null;
                for (Throwable t = e; t != null; t = t.getCause()) if (t instanceof SQLException x) s = x;
                int code = s == null ? 0 : s.getErrorCode();
                // Sin permiso o sin base de datos: no tiene sentido seguir con las demás filas.
                if (e instanceof DataAccessResourceFailureException || code == 5403 || (s != null && String.valueOf(s.getSQLState()).startsWith("08"))) throw e;
                if (code == 1062) { omitidas++; continue; }
                conError++;
                if (code == 5400 || code == 5404 || code == 5409) anotar(errores, l.numero(), s.getMessage());
                else {
                    LOG.error("Fila {} de la importación", l.numero(), e);
                    anotar(errores, l.numero(), "No se pudo registrar el pago.");
                }
            }
        }
        return Api.data(Api.map("filas", datos.size(), "importadas", importadas, "omitidas", omitidas, "con_error", conError,
                "errores", errores, "errores_truncados", conError > errores.size()));
    }

    private static void anotar(List<Map<String, Object>> errores, int fila, String mensaje) {
        if (errores.size() < MAX_ERRORES) errores.add(Api.map("fila", fila, "mensaje", mensaje));
    }

    private static String celda(Linea l, int i) { return i < 0 || i >= l.celdas().size() ? "" : l.celdas().get(i); }

    // ---------- Lectura de archivos ----------
    private static List<Linea> leerCsv(byte[] bytes) {
        List<List<String>> rows = ImportParser.leerCsv(bytes);
        List<Linea> out = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) out.add(new Linea(i + 1, rows.get(i)));
        return out;
    }

    /** Primera hoja del libro. Fechas -> AAAA-MM-DD; números -> texto con coma decimal (así "1.234" no se confunde con miles). */
    private static List<Linea> leerXlsx(byte[] bytes) {
        List<Linea> out = new ArrayList<>();
        DataFormatter fmt = new DataFormatter(new Locale("es", "CO"));
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            Sheet hoja = wb.getSheetAt(0);
            for (Row row : hoja) {
                int n = Math.max(row.getLastCellNum(), 0);
                if (n > 50) n = 50;
                List<String> celdas = new ArrayList<>();
                for (int i = 0; i < n; i++) celdas.add(valorCelda(row.getCell(i), fmt));
                out.add(new Linea(row.getRowNum() + 1, celdas));
                if (out.size() > MAX_FILAS + 50) throw ApiException.bad("El archivo tiene demasiadas filas.");
            }
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw ApiException.bad("No se pudo leer el archivo Excel. Verifique que sea un .xlsx válido y sin contraseña.");
        }
        return out;
    }

    private static String valorCelda(Cell c, DataFormatter fmt) {
        if (c == null) return "";
        CellType tipo = c.getCellType() == CellType.FORMULA ? c.getCachedFormulaResultType() : c.getCellType();
        switch (tipo) {
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(c)) return c.getLocalDateTimeCellValue().toLocalDate().toString();
                return java.math.BigDecimal.valueOf(c.getNumericCellValue()).stripTrailingZeros().toPlainString().replace('.', ',');
            case BOOLEAN:
                return c.getBooleanCellValue() ? "true" : "false";
            case STRING:
                return c.getStringCellValue().trim();
            default:
                return "";
        }
    }
}
