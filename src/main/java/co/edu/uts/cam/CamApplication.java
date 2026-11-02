package co.edu.uts.cam;

import com.fasterxml.jackson.core.JsonGenerator;
import com.fasterxml.jackson.databind.JsonSerializer;
import com.fasterxml.jackson.databind.SerializerProvider;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jackson.Jackson2ObjectMapperBuilderCustomizer;
import org.springframework.context.annotation.Bean;

/** Sistema de facturación para proyectos inmobiliarios CAM. Clase principal (Run en NetBeans). */
@SpringBootApplication
public class CamApplication {

    public static void main(String[] args) {
        SpringApplication.run(CamApplication.class, args);
    }

    /**
     * Formato JSON del contrato: importes como texto ("750000.00"), fechas "AAAA-MM-DD"
     * y fecha-hora ISO con la zona de Bogotá ("2026-10-30T10:00:00-05:00").
     */
    @Bean
    Jackson2ObjectMapperBuilderCustomizer formatoJson() {
        JsonSerializer<LocalDateTime> bogota = new JsonSerializer<>() {
            @Override
            public void serialize(LocalDateTime v, JsonGenerator g, SerializerProvider p) throws IOException {
                g.writeString(v.truncatedTo(ChronoUnit.SECONDS) + (v.getSecond() == 0 ? ":00" : "") + "-05:00");
            }
        };
        JsonSerializer<Timestamp> bogotaTs = new JsonSerializer<>() {
            @Override
            public void serialize(Timestamp v, JsonGenerator g, SerializerProvider p) throws IOException {
                bogota.serialize(v.toLocalDateTime(), g, p);
            }
        };
        return b -> b.serializerByType(BigDecimal.class, ToStringSerializer.instance)
                .serializerByType(java.sql.Date.class, ToStringSerializer.instance)
                .serializerByType(LocalDateTime.class, bogota)
                .serializerByType(Timestamp.class, bogotaTs);
    }
}
