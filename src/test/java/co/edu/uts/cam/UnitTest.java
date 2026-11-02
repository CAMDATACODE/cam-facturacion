package co.edu.uts.cam;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Pruebas unitarias (no requieren MySQL). En NetBeans: clic derecho en el proyecto > Test. */
class UnitTest {

    @Test
    void contrasenaConSalYVerificacion() {
        String h = Passwords.hash("1234");
        assertTrue(h.startsWith("pbkdf2_sha256$310000$"));
        assertNotEquals(h, Passwords.hash("1234"), "cada hash usa una sal distinta");
        assertTrue(Passwords.verify("1234", h));
        assertFalse(Passwords.verify("12345", h));
        assertFalse(Passwords.verify("1234", "texto-plano"));
    }

    @Test
    void importesConPuntoYMaximoDosDecimales() {
        assertEquals(new BigDecimal("750000"), Validate.money("750000", "v", false));
        assertEquals(new BigDecimal("750000.5"), Validate.money("750000.5", "v", false));
        for (String bad : new String[] {"0", "-1", "1.234", "750.000,00", "abc", ""}) {
            ApiException e = assertThrows(ApiException.class, () -> Validate.money(bad, "v", false), bad);
            assertEquals(400, e.status);
        }
    }

    @Test
    void fechasReales() {
        assertEquals(LocalDate.of(2026, 2, 28), Validate.date("2026-02-28", "f"));
        assertThrows(ApiException.class, () -> Validate.date("2026-02-30", "f"));
        assertThrows(ApiException.class, () -> Validate.date("30/10/2026", "f"));
    }

    @Test
    void enterosYCamposPermitidos() {
        assertEquals(24, Validate.integer("24", "c", 1, 24));
        assertThrows(ApiException.class, () -> Validate.integer(25, "c", 1, 24));
        assertThrows(ApiException.class, () -> Validate.integer(1.5, "c", 1, 24));
        assertThrows(ApiException.class, () -> Validate.only(Map.of("a", 1, "usuario_id", 9), "a"));
    }
}
