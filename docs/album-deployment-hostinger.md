# Despliegue en Hostinger y conexión con OneDrive

Esta guía no ejecuta ningún cambio en Hostinger ni Microsoft Entra. Es la lista manual para poner el MVP en producción cuando se decida.

## 1. Preparación

1. Usa Node.js 22 LTS; `package.json` rechaza como objetivo soportado cualquier major fuera de `>=22 <23`.
2. Conserva `.env` fuera de Git. El repositorio solo contiene `.env.example` sin valores.
3. Ejecuta antes de publicar:

   ```powershell
   npm ci
   npm run audit:prod
   npm run test:all
   npm run build
   npm run test:e2e
   ```

4. Usa MySQL en producción. Las cinco variables `MYSQL_*` son obligatorias: el proceso rechaza el arranque si falta alguna o si la configuración es parcial.

## 2. Registro manual en Microsoft Entra

Si ya existe un registro, comprueba estos valores sin cambiarlos hasta la ventana de despliegue:

1. Tipo de cuenta compatible: **solo cuentas Microsoft personales**.
2. Plataforma: **Web**, porque el callback y el secreto viven en Express; no es una SPA OAuth.
3. Redirect URI exacta: `https://TU_DOMINIO/api/admin/microsoft/callback`.
4. Permiso delegado de Microsoft Graph: `Files.ReadWrite`.
5. No añadas `User.Read`, permisos de aplicación ni permisos de sitios.
6. Crea un client secret y guarda su **valor** una sola vez en el gestor de variables de Hostinger.

La aplicación solicita dinámicamente `offline_access` junto con `Files.ReadWrite`. Microsoft documenta que `Files.ReadWrite` delegado está disponible para cuentas personales y permite operar en los archivos del usuario que concede acceso.

## 3. Variables

| Variable | Producción | Notas |
|---|---|---|
| `NODE_ENV` | `production` | Hostinger puede establecerla; confírmalo |
| `PUBLIC_APP_URL` | `https://TU_DOMINIO` | Sin barra final |
| `COOKIE_SECRET` | aleatorio ≥32 caracteres | Firmas de cookies |
| `ADMIN_KEY` | aleatorio ≥16 caracteres | Entrada a `/album/admin` |
| `ALBUM_ACCESS_TOKEN` | aleatorio ≥16 caracteres | Se comparte solo como fragmento URL |
| `TOKEN_ENCRYPTION_KEY` | 32 bytes | Hex de 64 caracteres o Base64 que decodifique exactamente a 32 bytes; se valida al arrancar en todos los entornos |
| `MICROSOFT_CLIENT_ID` | Application ID | No es secreto, pero se mantiene en backend |
| `MICROSOFT_CLIENT_SECRET` | valor del secreto | Nunca en Git ni frontend |
| `MICROSOFT_REDIRECT_URI` | `https://TU_DOMINIO/api/admin/microsoft/callback` | Coincidencia exacta con Entra |
| `ONEDRIVE_FOLDER` | `Boda/Album/Originales` | Se crea si no existe |
| `MAX_FILE_BYTES` | `16106127360` | 15 GiB por fichero |
| `MAX_BATCH_FILES` | `50` | Por selección |
| `MYSQL_HOST` | host asignado | De Hostinger MySQL |
| `MYSQL_PORT` | `3306` normalmente | Usa el valor del panel |
| `MYSQL_DATABASE` | base creada | Tablas se crean al arrancar |
| `MYSQL_USER` | usuario de la base | Permisos sobre esa base |
| `MYSQL_PASSWORD` | contraseña de la base | Secreto |

Hostinger asigna el puerto HTTP a la aplicación. No fijes `PORT` manualmente salvo que el panel lo requiera expresamente; el servidor usa `process.env.PORT` y cae a 3001 solo en local.

Para generar secretos localmente sin imprimir valores existentes. Usa Base64URL para cookies/claves de acceso y hex para `TOKEN_ENCRYPTION_KEY`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Usa una salida distinta para cada secreto. No las pegues en incidencias, capturas ni chats.

## 4. Hostinger hPanel

Los planes Business y Cloud compatibles permiten aplicaciones Node.js/Express. En hPanel:

1. `Websites` → `Add Website` → `Deploy Web App`.
2. Importa el repositorio privado desde GitHub o sube un ZIP sin `.env`, `node_modules`, `dist` ni `dist-server`.
3. Elige Express/Node.js o `Other` si no lo detecta.
4. Versión Node: 22.x.
5. Comando de build: `npm run build`.
6. Comando de inicio: `npm start`.
7. Entry file, si lo solicita: `dist-server/index.js`.
8. Añade las variables anteriores en `Environment variables`; no las incluyas en el repositorio.
9. Asocia el dominio y fuerza HTTPS antes de conectar Microsoft.
10. Despliega y revisa el log. Debe aparecer el puerto de escucha y no deben aparecer tokens, claves ni URLs de subida.

Express sirve `dist/` y la API desde el mismo origen. Las rutas `/`, `/album` y `/album/admin` reciben la SPA; `/api/*` nunca cae al HTML.

La CSP usa familias restringidas, nunca hosts temporales concretos: `*.1drv.com`/`*.sharepoint.com` para recursos OneDrive compatibles y `*.microsoftpersonalcontent.com` para originales personales observados. Esta última familia solo figura en `img-src` y `media-src`; la descarga por navegación no necesita `connect-src`. Microsoft no garantiza el hostname de las URLs preautenticadas, así que confirma la consola con Express en staging sin ampliar a comodines globales.

## 5. MySQL

1. Crea base y usuario desde hPanel.
2. Copia host, puerto, base, usuario y contraseña a las cinco variables `MYSQL_*`.
3. Reinicia o vuelve a desplegar.
4. Comprueba `GET https://TU_DOMINIO/api/health`: debe responder `{"ok":true,"storage":"mysql"}`.

El servidor crea las tablas mínimas automáticamente. Haz copias de seguridad de la base: contiene la relación entre autores, originales e identificadores de OneDrive, además del refresh token cifrado.

El pool usa `utf8mb4` y UTC. El esquema incluye `BIGINT UNSIGNED` para tamaños, `captured_at`/`capture_source` y los índices de paginación por subida y captura. El arranque es idempotente: no elimina ni recrea tablas y añade columnas e índices de forma aditiva si faltan. Un fallo de conexión no activa `MemoryStore`; el startup falla.

La validación local puede realizarse con un MySQL 8 aislado en Docker, pero Docker no forma parte del despliegue. En Hostinger se usan la aplicación Node.js y la base MySQL creada en hPanel mediante las cinco variables `MYSQL_*`.

## 6. Primera conexión con OneDrive

1. Abre `https://TU_DOMINIO/album/admin` manualmente; no existe enlace público.
2. Introduce `ADMIN_KEY`.
3. Pulsa **Conectar OneDrive**.
4. Accede con la cuenta Microsoft personal propietaria del álbum y acepta únicamente acceso a archivos.
5. De vuelta al panel, pulsa **Probar conexión**.
6. Verifica en OneDrive la carpeta configurada y `codex-onedrive-test.txt`.

Después genera el enlace privado:

```text
https://TU_DOMINIO/album#access=ALBUM_ACCESS_TOKEN
```

El fragmento no se envía en la petición HTTP inicial y la aplicación lo elimina inmediatamente. Genera el QR a partir de este enlace, evitando acortadores o servicios de analítica.

## 7. Smoke test de producción

1. `/` conserva Bienvenida, Detalles del Plan y Confirmación.
2. `/album` sin fragmento muestra “Álbum privado”.
3. El enlace privado pide solo nombre.
4. Sube una foto pequeña y un vídeo corto de prueba.
5. Confirma autor, visor, reproducción y descarga.
6. Recarga y comprueba que la galería persiste.
7. Reinicia la aplicación desde hPanel y vuelve a comprobar galería y estado conectado.
8. Revisa que `npm run audit:prod` informe de 0 vulnerabilidades conocidas en las dependencias de producción antes de cada despliegue. Este resultado no equivale a una auditoría completa de seguridad.

## 8. Operación y recuperación

- Rotar `ADMIN_KEY` o `ALBUM_ACCESS_TOKEN` invalida nuevas autenticaciones, pero las cookies existentes duran hasta su expiración. Para un cierre inmediato, rota también `COOKIE_SECRET`; esto cierra todas las sesiones.
- Rotar `TOKEN_ENCRYPTION_KEY` sin recifrar el valor almacenado desconecta OneDrive. Conecta de nuevo desde el panel después de la rotación.
- Si expira o se revoca el client secret, crea otro en Entra, cambia `MICROSOFT_CLIENT_SECRET` y reinicia.
- Si se revoca el consentimiento Microsoft, el panel informará que la operación Graph falla; vuelve a conectar.
- No borres ni muevas manualmente originales mientras el álbum esté activo. Si ocurre, la tarjeta puede quedar huérfana hasta limpiar su registro en base de datos.
- También puede quedar una subida huérfana si OneDrive acepta el último `PUT`, falla `POST /complete` y el navegador se cierra. Una futura acción administrativa **Repair gallery / reconcile** comparará carpeta OneDrive y base de datos; no se ejecuta reconciliación automática en este MVP.

## Fuentes operativas

- [Hostinger: desplegar una aplicación Node.js](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Hostinger: variables de entorno](https://www.hostinger.com/support/how-to-add-environment-variables-during-node-js-application-deployment/)
- [Microsoft: registrar una aplicación](https://learn.microsoft.com/en-us/graph/auth-register-app-v2)
- [Microsoft: permiso Files.ReadWrite](https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadwrite)
- [Microsoft: sesiones de subida reanudables](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0)
