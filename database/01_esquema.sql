-- =====================================================================
-- Sistema de facturación para proyectos inmobiliarios CAM
-- 01 · Esquema (tablas, restricciones, índices y sesiones)
-- MySQL 8.0.16 o superior. Ejecutar completo en MySQL Workbench (rayo ⚡).
-- ATENCIÓN: borra y vuelve a crear la base cam_facturacion.
-- =====================================================================
DROP DATABASE IF EXISTS cam_facturacion;
CREATE DATABASE cam_facturacion CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE cam_facturacion;

CREATE TABLE propietarios (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  cedula     VARCHAR(15)  NOT NULL,
  nombre     VARCHAR(120) NOT NULL,
  correo     VARCHAR(150) NOT NULL,
  creado_en  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_propietarios_cedula UNIQUE (cedula),
  CONSTRAINT ck_propietarios_cedula CHECK (cedula REGEXP '^[0-9]{5,15}$'),
  CONSTRAINT ck_propietarios_nombre CHECK (CHAR_LENGTH(TRIM(nombre)) >= 3),
  CONSTRAINT ck_propietarios_correo CHECK (correo REGEXP '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$')
) ENGINE = InnoDB;

-- Cuentas. ADMIN = secretaria. PROPIETARIO = solo la comunidad.
-- password_hash = 'pbkdf2_sha256$iteraciones$sal$hash' (lo genera la aplicación).
-- 'PENDIENTE' = la aplicación le asigna la contraseña configurada al arrancar.
CREATE TABLE usuarios (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario        VARCHAR(40)  NOT NULL,
  nombre         VARCHAR(120) NOT NULL,
  password_hash  VARCHAR(200) NOT NULL,
  rol            VARCHAR(12)  NOT NULL,
  propietario_id INT          NULL,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  creado_en      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_usuario UNIQUE (usuario),
  CONSTRAINT uq_usuarios_propietario UNIQUE (propietario_id),
  CONSTRAINT fk_usuarios_propietario FOREIGN KEY (propietario_id) REFERENCES propietarios (id),
  CONSTRAINT ck_usuarios_rol CHECK (rol IN ('ADMIN', 'PROPIETARIO')),
  CONSTRAINT ck_usuarios_rol_propietario CHECK ((rol = 'PROPIETARIO') = (propietario_id IS NOT NULL))
) ENGINE = InnoDB;

CREATE TABLE semanas (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  numero         INT  NOT NULL,
  fecha_checkin  DATE NOT NULL,
  fecha_checkout DATE NOT NULL,
  CONSTRAINT uq_semanas_numero UNIQUE (numero),
  CONSTRAINT ck_semanas_numero CHECK (numero BETWEEN 1 AND 999),
  CONSTRAINT ck_semanas_fechas CHECK (fecha_checkout > fecha_checkin)
) ENGINE = InnoDB;

-- Condiciones vigentes de la acción (FUN-REP-01). Una sola fila.
CREATE TABLE parametros (
  id              TINYINT       PRIMARY KEY,
  valor_total     DECIMAL(14,2) NOT NULL,
  num_cuotas      INT           NOT NULL,
  valor_cuota     DECIMAL(14,2) NOT NULL,
  actualizado_en  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_por INT           NULL,
  CONSTRAINT fk_parametros_usuario FOREIGN KEY (actualizado_por) REFERENCES usuarios (id),
  CONSTRAINT ck_parametros_unico CHECK (id = 1),
  CONSTRAINT ck_parametros_valores CHECK (valor_total > 0 AND valor_cuota > 0 AND num_cuotas BETWEEN 1 AND 120),
  CONSTRAINT ck_parametros_coherentes CHECK (valor_cuota * num_cuotas = valor_total)
) ENGINE = InnoDB;

-- Adquisición: vínculo propietario-semana. Copia las condiciones vigentes al crearse.
CREATE TABLE adquisiciones (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  propietario_id INT           NOT NULL,
  semana_id      INT           NOT NULL,
  fecha_inicio   DATE          NOT NULL,
  valor_total    DECIMAL(14,2) NOT NULL,
  num_cuotas     INT           NOT NULL,
  valor_cuota    DECIMAL(14,2) NOT NULL,
  estado         VARCHAR(12)   NOT NULL DEFAULT 'ACTIVA',
  -- Una semana tiene un solo titular vigente a la vez (FUN-SEM-02).
  semana_vigente INT AS (IF(estado = 'TRASPASADA', NULL, semana_id)) STORED,
  usuario_id     INT           NOT NULL,
  creado_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_adquisiciones_propietario FOREIGN KEY (propietario_id) REFERENCES propietarios (id),
  CONSTRAINT fk_adquisiciones_semana FOREIGN KEY (semana_id) REFERENCES semanas (id),
  CONSTRAINT fk_adquisiciones_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT uq_adquisiciones_semana_vigente UNIQUE (semana_vigente),
  CONSTRAINT ck_adquisiciones_estado CHECK (estado IN ('ACTIVA', 'PAGADA', 'TRASPASADA')),
  CONSTRAINT ck_adquisiciones_valores CHECK (valor_total > 0 AND valor_cuota > 0 AND num_cuotas BETWEEN 1 AND 120)
) ENGINE = InnoDB;

CREATE TABLE pagos (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  adquisicion_id INT           NOT NULL,
  numero_cuota   INT           NOT NULL,
  fecha_pago     DATE          NOT NULL,
  valor          DECIMAL(14,2) NOT NULL,
  verificado     BOOLEAN       NOT NULL DEFAULT FALSE,
  verificado_por INT           NULL,
  verificado_en  DATETIME      NULL,
  usuario_id     INT           NOT NULL,
  registrado_en  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pagos_adquisicion FOREIGN KEY (adquisicion_id) REFERENCES adquisiciones (id),
  CONSTRAINT fk_pagos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT fk_pagos_verificador FOREIGN KEY (verificado_por) REFERENCES usuarios (id),
  CONSTRAINT uq_pagos_cuota UNIQUE (adquisicion_id, numero_cuota),
  CONSTRAINT ck_pagos_cuota CHECK (numero_cuota BETWEEN 1 AND 120),
  CONSTRAINT ck_pagos_valor CHECK (valor > 0),
  CONSTRAINT ck_pagos_verificacion CHECK (verificado = (verificado_por IS NOT NULL AND verificado_en IS NOT NULL))
) ENGINE = InnoDB;
CREATE INDEX ix_pagos_fecha ON pagos (fecha_pago);

-- Máximo un comprobante por pago. La FK impide borrar un pago con comprobante (FUN-PAG-05).
CREATE TABLE comprobantes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  numero         VARCHAR(20)  NOT NULL,
  pago_id        INT          NOT NULL,
  fecha_emision  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  correo_destino VARCHAR(150) NULL,
  estado_envio   VARCHAR(10)  NOT NULL DEFAULT 'PENDIENTE',
  enviado_en     DATETIME     NULL,
  usuario_id     INT          NOT NULL,
  CONSTRAINT fk_comprobantes_pago FOREIGN KEY (pago_id) REFERENCES pagos (id),
  CONSTRAINT fk_comprobantes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id),
  CONSTRAINT uq_comprobantes_numero UNIQUE (numero),
  CONSTRAINT uq_comprobantes_pago UNIQUE (pago_id),
  CONSTRAINT ck_comprobantes_envio CHECK (estado_envio IN ('PENDIENTE', 'ENVIADO', 'FALLIDO'))
) ENGINE = InnoDB;

CREATE TABLE ofertas (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  adquisicion_id    INT           NOT NULL,
  tipo              VARCHAR(12)   NOT NULL,
  precio            DECIMAL(14,2) NULL,
  descripcion       VARCHAR(500)  NOT NULL,
  estado            VARCHAR(12)   NOT NULL DEFAULT 'ACTIVA',
  -- Una sola oferta activa por semana.
  adquisicion_activa INT AS (IF(estado = 'ACTIVA', adquisicion_id, NULL)) STORED,
  publicada_en      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cerrada_en        DATETIME      NULL,
  CONSTRAINT fk_ofertas_adquisicion FOREIGN KEY (adquisicion_id) REFERENCES adquisiciones (id),
  CONSTRAINT uq_ofertas_activa UNIQUE (adquisicion_activa),
  CONSTRAINT ck_ofertas_tipo CHECK (tipo IN ('VENTA', 'INTERCAMBIO')),
  CONSTRAINT ck_ofertas_estado CHECK (estado IN ('ACTIVA', 'RETIRADA', 'CONCRETADA')),
  CONSTRAINT ck_ofertas_precio CHECK ((tipo = 'VENTA' AND precio > 0) OR (tipo = 'INTERCAMBIO' AND precio IS NULL)),
  CONSTRAINT ck_ofertas_descripcion CHECK (CHAR_LENGTH(TRIM(descripcion)) >= 5)
) ENGINE = InnoDB;
CREATE INDEX ix_ofertas_estado ON ofertas (estado, publicada_en);

CREATE TABLE mensajes (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  oferta_id      INT           NOT NULL,
  propietario_id INT           NOT NULL,
  texto          VARCHAR(1000) NOT NULL,
  enviado_en     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_mensajes_oferta FOREIGN KEY (oferta_id) REFERENCES ofertas (id) ON DELETE CASCADE,
  CONSTRAINT fk_mensajes_propietario FOREIGN KEY (propietario_id) REFERENCES propietarios (id)
) ENGINE = InnoDB;
CREATE INDEX ix_mensajes_oferta ON mensajes (oferta_id, enviado_en);

-- Sesiones guardadas en la base (Spring Session JDBC). Estructura oficial de Spring Session para MySQL.
CREATE TABLE SPRING_SESSION (
  PRIMARY_ID            CHAR(36)     NOT NULL,
  SESSION_ID            CHAR(36)     NOT NULL,
  CREATION_TIME         BIGINT       NOT NULL,
  LAST_ACCESS_TIME      BIGINT       NOT NULL,
  MAX_INACTIVE_INTERVAL INT          NOT NULL,
  EXPIRY_TIME           BIGINT       NOT NULL,
  PRINCIPAL_NAME        VARCHAR(100),
  CONSTRAINT SPRING_SESSION_PK PRIMARY KEY (PRIMARY_ID)
) ENGINE = InnoDB ROW_FORMAT = DYNAMIC;
CREATE UNIQUE INDEX SPRING_SESSION_IX1 ON SPRING_SESSION (SESSION_ID);
CREATE INDEX SPRING_SESSION_IX2 ON SPRING_SESSION (EXPIRY_TIME);
CREATE INDEX SPRING_SESSION_IX3 ON SPRING_SESSION (PRINCIPAL_NAME);

CREATE TABLE SPRING_SESSION_ATTRIBUTES (
  SESSION_PRIMARY_ID CHAR(36)     NOT NULL,
  ATTRIBUTE_NAME     VARCHAR(200) NOT NULL,
  ATTRIBUTE_BYTES    BLOB         NOT NULL,
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_PK PRIMARY KEY (SESSION_PRIMARY_ID, ATTRIBUTE_NAME),
  CONSTRAINT SPRING_SESSION_ATTRIBUTES_FK FOREIGN KEY (SESSION_PRIMARY_ID) REFERENCES SPRING_SESSION (PRIMARY_ID) ON DELETE CASCADE
) ENGINE = InnoDB ROW_FORMAT = DYNAMIC;

-- Datos iniciales: condiciones de la acción y cuenta de la secretaria.
-- La contraseña la pone la aplicación al arrancar (variable ADMIN_PASSWORD; por defecto 1234).
INSERT INTO usuarios (usuario, nombre, password_hash, rol) VALUES ('admin', 'Marta Lucía Prada', 'PENDIENTE', 'ADMIN');
INSERT INTO parametros (id, valor_total, num_cuotas, valor_cuota) VALUES (1, 18000000, 24, 750000);
