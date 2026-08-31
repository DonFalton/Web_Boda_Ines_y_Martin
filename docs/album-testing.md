# Pruebas del álbum

La matriz soportada se ejecuta con **Node.js 22 LTS** (`node --version` debe devolver `v22.x`). La carga de configuración debe abortar antes de iniciar el servidor cuando `TOKEN_ENCRYPTION_KEY` no sea hex de 64 caracteres ni Base64 que decodifique exactamente a 32 bytes.

## Matriz automatizada

| Capa | Comando | Cobertura principal |
|---|---|---|
| Backend | `npm run test:server` | cookies, OAuth, cifrado, Graph, políticas, sesiones de subida, ownership, paginación y hardening |
| MySQL real | `npm run test:mysql` | schema idempotente, índices, `utf8mb4`, 15 GiB, SQL parametrizado, paginación y persistencia de media/OAuth tras recrear el pool |
| Frontend | `npm test` | fragmento mágico, nombre, selección de archivos, galería, visor, metadato noindex y rutas |
| E2E mock | `npm run test:e2e` | acceso → invitado → subida directa simulada → publicación → visor/descarga; portada `/` |
| Tipos | `npm run typecheck` | TypeScript frontend/configuración |
| Producción | `npm run build` | bundle Vite y compilación Node |
| Dependencias | `npm run audit:prod` | vulnerabilidades conocidas reportadas por npm en el árbol de producción; no es una auditoría integral |

Los tests de seguridad verifican que la CSP use familias OneDrive restringidas, no un hostname temporal concreto, `https:`, `*` ni `*.microsoft.com`. `connect-src` cubre la subida directa; `img-src` y `media-src` cubren thumbnails y originales temporales.

`npm run test:e2e` no contacta con Microsoft ni escribe en OneDrive. Playwright intercepta la API propia y la `uploadUrl`, pero ejecuta la interfaz real y un `XMLHttpRequest PUT` real desde el punto de vista del navegador.

La integración MySQL solo se activa cuando existe `MYSQL_TEST_DATABASE`. Debe apuntar a una base separada de `MYSQL_DATABASE`; los fixtures usan IDs fijos de prueba y se eliminan con `WHERE` específicos. Nunca se ejecutan `TRUNCATE`, `DROP TABLE` ni limpieza sobre la base de la aplicación. La prueba principal requiere un servidor MySQL real: escribe, cierra el pool, crea otro pool y lee los mismos datos.

La prueba E2E usa Chromium y arranca Vite en `127.0.0.1:5173`. Si falta el navegador:

```powershell
npx playwright install chromium
```

## Comprobación antes de merge o despliegue

```powershell
npm ci
npm run audit:prod
npm run typecheck
npm run test:all
npm run build
npm run test:e2e
```

No uses `npm audit fix --force` sin una migración planificada: puede introducir saltos mayores de Vite u otras dependencias.

## Pruebas manuales locales con OneDrive

Estas pruebas requieren configurar `.env`, registrar previamente el callback local y conectar una cuenta de prueba desde `/album/admin`.

1. Abre dos terminales: `npm run dev:server` y `npm run dev`.
2. Conecta OneDrive y ejecuta la prueba de conexión.
3. Abre `/album#access=...` en una ventana privada.
4. Prueba nombre vacío, espacios, tildes y emoji.
5. Selecciona JPG, PNG/HEIC si el dispositivo lo permite, MP4 y MOV.
6. Comprueba dos transferencias simultáneas y una tercera en espera.
7. Desconecta la red durante un vídeo y restáurala: debe mostrar **Reintentando…** y recuperarse automáticamente. Si agota tres retries, debe ofrecer el botón manual sin volver a escoger el archivo.
8. Cancela una subida y comprueba que no aparece en galería.
9. Comprueba cuadrícula a 390 px, 768 px, 1280 px y 1440 px.
10. Abre imagen y vídeo; usa flechas, Escape, foco y descarga.
11. Repite con dos navegadores usando el mismo nombre: deben conservar identidades distintas.
12. Reinicia el backend con MySQL y confirma persistencia.

## Casos no cubiertos automáticamente

- Safari iOS y Chrome Android físicos, cámara/iCloud, bloqueo de pantalla y background prolongado.
- Archivos 4K o cercanos al límite configurado.
- Caducidad real de sesiones Graph y rotación real de refresh token.
- Cuota real próxima a 20 GiB de reserva.
- Caídas de MySQL/OneDrive y reconciliación de elementos movidos manualmente.
- La ventana huérfana donde OneDrive acepta el último `PUT` pero `POST /complete` falla antes de cerrar el navegador.
- Inspección antivirus o magic bytes, que no forma parte de la arquitectura directa del MVP.

Antes de compartir el QR conviene completar al menos una pasada con iPhone, Android y un vídeo grande sobre una red móvil real.
