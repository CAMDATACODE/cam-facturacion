# Imagen para publicar en cualquier alojamiento que acepte Docker (Railway, Render, etc.).
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src src
RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre
COPY --from=build /app/target/cam-facturacion.jar /app.jar
# El alojamiento define PORT; la aplicación lo lee en application.properties.
CMD ["java", "-jar", "/app.jar"]
