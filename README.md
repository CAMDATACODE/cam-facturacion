# Sistema de facturación para proyectos inmobiliarios CAM

Aplicación **web** hecha en **NetBeans** con **Java Spring Boot** y **MySQL**, versionada en **GitHub**.

| Parte | Tecnología | Dónde está |
|---|---|---|
| Pantallas (frontend) | HTML, CSS y JavaScript | `src/main/resources/static/` |
| API (backend) | Java 17 · Spring Boot 3 · JdbcTemplate · Spring Session | `src/main/java/co/edu/uts/cam/` |
| Base de datos | MySQL 8: tablas, restricciones, vistas y procedimientos almacenados | `database/` |

## 1. Base de datos (MySQL Workbench)

En MySQL Workbench, abra cada archivo con *File → Open SQL Script…* y ejecútelo **completo** con el rayo ⚡. Hágalo en este orden:

1. `database/01_esquema.sql`. Crea la base `cam_facturacion`. **Si ya existe, la borra.**
2. `database/02_procedimientos.sql`. Crea las vistas y los procedimientos.
3. `database/03_datos_prueba.sql`. Carga 50 propietarios, 52 semanas, pagos, comprobantes, ofertas y mensajes, todos ficticios.
4. (Opcional, para producción) `database/04_permisos.sql`. Crea el usuario `cam_app` con permisos mínimos. Cambie su contraseña antes de ejecutarlo.

Para comprobar que quedó bien: `SELECT COUNT(*) FROM cam_facturacion.pagos;` debe dar 334.

## 2. Ejecutar en NetBeans

1. *File → Open Project* y elija la carpeta `cam-facturacion-spring`. NetBeans la reconoce como proyecto Maven.
   La primera vez descarga las librerías, así que necesita internet.
2. Abra `nbactions.xml` y escriba la contraseña de **su** MySQL en `<Env.DB_PASSWORD>`.
   También puede hacerlo en *clic derecho al proyecto → Properties → Actions → Run project*.
   Ese archivo no se sube a GitHub (está en `.gitignore`).
3. Clic en **Run Project** (F6). Cuando la consola diga `Started CamApplication`, abra <http://localhost:8080>.
4. Ingrese con estas cuentas:

| Rol | Usuario | Contraseña |
|---|---|---|
| Secretaria | `admin` | `1234` |
| Propietario (Helena Pérez Gómez, semana 5, con ofertas y mensajes) | `propietario` | `12345` |
| Los demás propietarios | su cédula | `12345` |

La primera vez que arranca, la aplicación cifra estas contraseñas en la base (PBKDF2). Por eso el primer arranque tarda unos segundos más.
Las contraseñas salen de `ADMIN_PASSWORD`, `PROPIETARIO_PASSWORD` y `PROPIETARIOS_PASSWORD`, y **solo se aplican a cuentas nuevas**.

*Clean and Build* genera `target/cam-facturacion.jar`, que se ejecuta con `java -jar cam-facturacion.jar`.
Las pruebas unitarias se corren con *clic derecho al proyecto → Test*.

## 3. Subir a GitHub desde NetBeans

1. En github.com cree un repositorio vacío. Sugerencia: `cam-facturacion`, sin README.
2. En NetBeans, haga *clic derecho al proyecto → Versioning → Initialize Git Repository* y acepte la carpeta del proyecto.
3. Haga *clic derecho → Git → Commit…* y escriba un mensaje, por ejemplo "Versión inicial". `target/` y `nbactions.xml` no se incluyen.
4. Haga *clic derecho → Git → Remote → Push…* y pegue la URL del repositorio (`https://github.com/USUARIO/cam-facturacion.git`).
   - Usuario: su usuario de GitHub.
   - Contraseña: un **token personal**, no su contraseña. Se crea en GitHub → *Settings → Developer settings → Personal access tokens*.
5. Para que los compañeros trabajen en el mismo proyecto:
   1. Agréguelos en el repositorio (*Settings → Collaborators*).
   2. Cada uno lo descarga con *Team → Git → Clone…*.
   3. Antes de empezar a trabajar, cada uno hace *Pull*; al terminar, *Commit* y luego *Push*.

**Nunca suban contraseñas reales al repositorio.** En la publicación van en variables del alojamiento.

## 4. Publicar con un enlace HTTPS

Necesitan un alojamiento con Java (o Docker), una base MySQL persistente y HTTPS.
Railway, por ejemplo, ofrece las dos cosas y publica desde GitHub. Revisen sus planes vigentes según el presupuesto.

1. **Base remota.**
   1. Cree una base MySQL en el alojamiento.
   2. Conéctese a ella desde MySQL Workbench con los datos que entrega el alojamiento.
   3. Ejecute los scripts 01, 02 y 03.
   4. Si el alojamiento no permite crear bases (la suya ya tiene nombre fijo), quite las 3 primeras líneas de `01_esquema.sql` y cambie `USE cam_facturacion;` por el nombre de su base en los scripts.
2. **Servicio web.** Cree el servicio *desde el repositorio de GitHub*. El proyecto trae un `Dockerfile` que compila y arranca la aplicación.
3. **Variables del servicio.**

| Variable | Valor |
|---|---|
| `DATABASE_URL` | `jdbc:mysql://HOST:PUERTO/NOMBRE_BD?connectionTimeZone=-05:00&forceConnectionTimeZoneToSession=true&sslMode=REQUIRED` |
| `DB_USER`, `DB_PASSWORD` | Los de la base remota (o `cam_app` si aplicó `04_permisos.sql`) |
| `APP_URL` | El enlace público, p. ej. `https://cam-facturacion.up.railway.app` |
| `COOKIE_SECURE` | `true` |
| `FORWARD_HEADERS` | `native` |
| `ADMIN_PASSWORD`, `PROPIETARIO_PASSWORD`, `PROPIETARIOS_PASSWORD` | Contraseñas propias para la revisión |

4. **Comprobación.**
   1. Abra `https://SU-ENLACE/api/health`: debe responder `{"data":{"estado":"ok"}}`.
   2. Desde **otro computador**, ingrese, registre un pago, emita un comprobante y publique una oferta.
   3. Recargue la página y verifique que los datos persisten.
5. Cada *Push* a GitHub vuelve a publicar la aplicación automáticamente.

## 5. Requerimientos de PSI y dónde están

| Requerimiento | Pantalla | API (Java) | MySQL |
|---|---|---|---|
| FUN-SEG-01/02/03 | Ingreso y menú por rol | `AuthController`, `AuthFilter` | `usuarios`, `sp_exigir_usuario` |
| FUN-PRO-01/02, FUN-SEM-03 | Propietarios | `AdminController /propietarios` | `uq_propietarios_cedula` |
| FUN-SEM-01 | Semanas | `/semanas` | `ck_semanas_fechas` |
| FUN-SEM-02 | Asignaciones | `/adquisiciones` | `sp_asignar_semana`, `sp_cambiar_titular`, `uq_adquisiciones_semana_vigente` |
| FUN-PAG-01/02 | Pagos de cuotas | `PagosController POST /pagos` | `sp_registrar_pago`, `uq_pagos_cuota` |
| FUN-PAG-03/04/05 | Pagos (verificar, historial, anular) | `/pagos/...` | `sp_verificar_pago`, `v_pagos`, `sp_anular_pago` |
| FUN-CMP-01/02 | Comprobantes y comprobante imprimible | `/comprobantes`, `/pagos/{id}/comprobante` | `sp_emitir_comprobante`, `v_comprobantes`, `sp_registrar_envio` |
| FUN-EDC-01 | Estado de cuenta | `/estado-cuenta` | `v_estado_cuenta`, `v_cuotas` |
| FUN-EDC-02 | Recaudo mensual | `/recaudo` | `sp_recaudo_pendiente` |
| FUN-COM-01..04 | Ofertas activas, Publicar, Mis ofertas, Comunidad | `ComunidadController` | `sp_publicar_oferta`, `sp_cerrar_oferta`, `sp_eliminar_oferta`, `sp_enviar_mensaje` |
| FUN-REP-01 | Parámetros | `/parametros` | `ck_parametros_coherentes` |
| FUN-REP-02 | Botón *Exportar* en cada tabla | — | CSV (`;`, UTF-8) que Excel abre |
| RNF-SEG-01 | — | `Passwords` (PBKDF2-SHA256, sal de 16 bytes) | `usuarios.password_hash` |
| RNF-SEG-02 | — | — | `04_permisos.sql` |
| RNF-AUD-01 | Columnas *Registró* y *Emitido por* | Usuario tomado de la sesión | `usuario_id`, `verificado_por` |
| RNF-FIA-01 | — | Validación en `Validate` | CHECK, UNIQUE, FK y procedimientos con `START TRANSACTION` y `FOR UPDATE` |

Errores de negocio: los procedimientos usan `SIGNAL ... MYSQL_ERRNO`, y la API los traduce así:
- 5400 → 400
- 5403 → 403
- 5404 → 404
- 5409 → 409

## 6. Pendiente o por confirmar

- **Motor de base de datos.** La guía y el documento de PSI dicen PostgreSQL; este proyecto usa MySQL. Hay que informarlo a la profesora y actualizar RNF-POR-01.
- **Cambio de titular.** El comprador inicia un plan nuevo con las mismas condiciones. Falta confirmar con CAM si hereda las cuotas pagadas.
- **Vencimiento.** Se asume que la cuota *k* vence en el mes (inicio del plan + *k* − 1).
- **Correo.** Se abre el programa de correo del equipo y se registra si se envió o falló. El envío automático requiere SMTP.
- **Excel.** La exportación es CSV (Excel lo abre). Si exigen `.xlsx`, hay que agregar una librería.
- **Contraseñas.** Se aceptan desde 4 caracteres para permitir `1234` y `12345`. En la publicación usen contraseñas largas.
