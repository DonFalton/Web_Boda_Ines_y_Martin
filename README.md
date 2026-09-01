# 💍 Web Boda Inés y Martín (2026)

Web de la boda y álbum colaborativo privado. La portada original vive en `/`; el álbum independiente está en `/album` y su panel no enlazado públicamente en `/album/admin`.

## Desarrollo local

Runtime de desarrollo y producción: **Node.js 22 LTS** (`package.json` exige `>=22 <23`).

1. Copia `.env.example` como `.env` y completa valores de desarrollo. `.env` nunca debe subirse al repositorio. `TOKEN_ENCRYPTION_KEY` debe ser hex de 64 caracteres o Base64 que decodifique exactamente a 32 bytes; una clave ausente o inválida impide arrancar también en desarrollo.
2. En una terminal ejecuta `npm run dev:server`.
3. En otra terminal ejecuta `npm run dev`.
4. Abre `http://localhost:5173/album#access=TU_ALBUM_ACCESS_TOKEN`.

El frontend escucha únicamente en `127.0.0.1:5173`; Vite redirige `/api` a Express en el puerto 3001.

## Comandos

- `npm run dev`: frontend local.
- `npm run dev:server`: API local con recarga.
- `npm run build`: frontend y servidor para producción.
- `npm start`: inicia el servidor compilado y sirve también `dist/` en producción.
- `npm run test:all`: pruebas unitarias y de integración.
- `npm run test:e2e`: recorrido completo con OneDrive simulado.
- `npm run typecheck`: comprobación TypeScript.
- `npm run audit:prod`: comprueba vulnerabilidades conocidas en las dependencias de producción según npm; no sustituye una auditoría completa de seguridad.
- `npm run test:php`: valida en Docker la alternativa PHP 8.3 + MySQL 8 para Hostinger Single.
- `npm run build:hostinger`: genera un paquete de staging PHP sin secretos en `release/hostinger-staging`.

## Documentación

- [Arquitectura del álbum](docs/album-architecture.md)
- [Despliegue en Hostinger y conexión con OneDrive](docs/album-deployment-hostinger.md)
- [Pruebas y criterios de aceptación](docs/album-testing.md)
- [Alternativa de staging PHP para Hostinger Single](docs/album-hostinger-php-staging.md)

Desarrollado y diseñado con cariño por Martín.
