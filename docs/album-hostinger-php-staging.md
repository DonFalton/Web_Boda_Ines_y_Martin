# Hostinger Single: PHP staging plan

## Why this path exists

The Hostinger Single plan cannot run the Node.js/Express process used by the original backend. The validated Node implementation remains available in the `album` branch alongside the React frontend and its API contract. Production uses the native PHP, PDO/MySQL, cURL and OpenSSL runtime available on shared hosting.

No additional hosting plan or Docker runtime is required in Hostinger. Docker is used only for local repeatable tests.

## Runtime architecture

```text
Browser (React/Vite)
  ├─ /api metadata and authentication → PHP 8.x → MySQL
  ├─ OAuth/token operations            → PHP 8.x → Microsoft Graph
  └─ photo/video bytes                 → Microsoft uploadUrl → OneDrive
```

PHP never proxies photo or video bytes. Uploads remain direct, use 10 MiB chunks, two parallel files, retry and cancellation. The same frontend continues to use the existing relative `/api` endpoints.

The PHP implementation preserves signed secure cookies, album access, stable guest ownership, owner-only deletion, PKCE/state, only `offline_access` and `Files.ReadWrite`, AES-256-GCM refresh-token encryption, upload sessions, capture dates, filtering, cursor pagination, thumbnails, viewer/download URLs and a restrictive CSP. It always requires MySQL; there is no MemoryStore fallback.

## Local validation

Validated on 2026-09-01:

- Node `v22.23.2`, npm `10.9.8`;
- PHP `8.3` with `curl`, `openssl` and `pdo_mysql`;
- MySQL `8.0.46` and MariaDB `11.4`;
- PHP syntax, schema idempotency, Unicode, 15 GiB metadata, pagination, prepared statements, encrypted OAuth restart and Graph contracts: PASS;
- original server tests: 74 PASS;
- original frontend tests: 46 PASS;
- original E2E tests: 6 PASS;
- Hostinger package build: PASS.

```powershell
npm run test:php
npm run build:hostinger
```

The generated, ignored package is `release/hostinger-staging`. It contains no populated configuration and no secrets.

## Required isolated staging layout

```text
/home/<account>/domains/inesymartin.es/
├─ album-app/                    private; outside every web document root
│  ├─ app/
│  ├─ runtime/
│  └─ config.php                secrets; never Git
└─ public_html/
   ├─ .htaccess                 production Spotify redirect; DO NOT TOUCH
   ├─ ...current production...
   └─ album-staging/            document root of album-staging.inesymartin.es
      ├─ .htaccess              staging rules only
      ├─ index.html
      ├─ assets/
      └─ api/index.php
```

Do not upload until hPanel confirms that `album-staging.inesymartin.es` has `public_html/album-staging` as its own document root. If hPanel maps the subdomain to the production document root, stop.

The staging `.htaccess` must only be placed inside the staging directory. Never replace `inesymartin.es/public_html/.htaccess`.

## hPanel procedure

1. Open **Websites → inesymartin.es → Dashboard → Domains → Subdomains**.
2. Create `album-staging.inesymartin.es` and select the dedicated directory `public_html/album-staging`.
3. Confirm HTTPS becomes valid for the subdomain before using OAuth.
4. Create a second, staging-only MySQL database and user. Use the exact host and port shown by hPanel.
5. Select PHP 8.2 or newer. Confirm `curl`, `openssl`, `json` and `pdo_mysql` are enabled.
6. Build locally with `npm run build:hostinger`.
7. Upload the **contents** of `release/hostinger-staging/public_html` only to the staging document root.
8. Upload the **contents** of `release/hostinger-staging/album-app` to the private `album-app` directory shown above.
9. Copy `config.example.php` to `config.php` inside that private directory and populate it there. Do not place `config.php` inside a web-accessible directory.
10. Ensure `album-app/runtime` is writable by the PHP account; the application creates it if permitted.

## Staging configuration

Use staging-specific values for `COOKIE_SECRET`, `ADMIN_KEY`, `ALBUM_ACCESS_TOKEN` and `TOKEN_ENCRYPTION_KEY`. The encryption key must be 64 hex characters or canonical Base64 representing exactly 32 bytes.

Expected non-secret values:

```text
PUBLIC_APP_URL=https://album-staging.inesymartin.es
MICROSOFT_REDIRECT_URI=https://album-staging.inesymartin.es/api/admin/microsoft/callback
ONEDRIVE_FOLDER=Boda/Album/Staging/Originales
MYSQL_PORT=<exact hPanel value>
MAX_FILE_BYTES=16106127360
MAX_BATCH_FILES=50
```

Never paste a password, token or client secret into documentation, Git, screenshots or chat.

## Pre-OAuth checks

Before changing Microsoft Entra, validate:

```text
https://album-staging.inesymartin.es/                 → React site
https://album-staging.inesymartin.es/album           → private album entry
https://album-staging.inesymartin.es/album/admin     → admin entry
https://album-staging.inesymartin.es/api/health      → {"ok":true,"storage":"mysql"}
https://album-staging.inesymartin.es/api/unknown     → JSON 404, not the SPA
```

Also confirm the staging noindex/security headers, that `https://inesymartin.es` still works, that production `/spotify` remains HTTP 302 and that the production `.htaccess` has not changed.

## Microsoft Entra stop point

Only after the exact HTTPS hostname works, request explicit authorization to add this additional Web redirect URI:

```text
https://album-staging.inesymartin.es/api/admin/microsoft/callback
```

Keep the existing localhost callback. Do not change scopes or secrets merely for this deployment.

## Promotion rule

Staging is not production. Do not copy its `.htaccess` over production, switch the main domain, remove the current website, or generate the final QR until staging and physical-device tests pass.
