# Hostinger Staging Validation

## Environment

- Hostinger plan: Single
- Backend target: native PHP (Node implementation retained separately)
- Local PHP validation: 8.3 PASS
- Staging hostname: `album-staging.inesymartin.es` created
- Document root isolation: `public_html/album-staging` confirmed in hPanel
- DNS resolution: PASS
- HTTPS availability: PASS
- PHP runtime response: PASS (PHP 8.3)
- Private application directory outside `public_html`: PASS
- Secret configuration outside `public_html`: PASS
- MariaDB connection and schema bootstrap: PASS
- Health `{"ok":true,"storage":"mysql"}`: PASS
- Staging CSP and `X-Robots-Tag: noindex`: PASS
- API JSON 404 routing: PASS
- Production root availability: PASS
- Production `/spotify` 302 target host: PASS (`open.spotify.com`, full temporary URL not recorded)
- Storage target: dedicated MySQL
- HTTPS: PASS
- Node 22 runtime on Hostinger: NOT AVAILABLE on Single plan
- Production-like runtime used: native PHP 8.3 adapter with the same `/api` contract

## Production isolation

- production site intact: PASS (no production action taken)
- production `.htaccess` untouched: PASS
- existing Spotify 302 preserved: PASS (no production action taken)
- staging document root independent: PASS (`public_html/album-staging`)

## Deployment

- package build: PASS
- PHP/MySQL local startup: PASS
- staging upload: PASS
- staging health: PASS (`storage=mysql`)

## MySQL

- local real connection: PASS (MySQL 8.0.46 and MariaDB 11.4)
- schema/idempotency/Unicode/15 GiB metadata: PASS
- restart persistence: PASS locally
- Hostinger database: PASS (dedicated staging database and user; credentials not recorded)

## OAuth

- state/PKCE and scopes: PASS in contract tests
- encrypted refresh token persistence: PASS locally
- staging redirect: PASS (exact HTTPS callback authorized)
- real staging callback: PASS
- connected status and Graph connection test: PASS
- encrypted refresh token recovered across fresh PHP requests and browser session: PASS

## OneDrive

- previous Node smoke test: PASS
- PHP Graph contract tests: PASS
- staging folder: `Boda/Album/Staging/Originales`
- real PHP staging connection: PASS

## Photo

- staging upload: PASS
- completion and gallery: PASS
- thumbnail: PASS
- viewer: PASS
- original download: PASS

## Video

- small MP4 upload and completion: PASS
- gallery and generated thumbnail: PASS
- autoplay/viewer: PASS
- original download: PASS
- 30 MB multi-chunk upload (10 MiB chunks): PASS

## CSP

- static policy review: PASS
- no global wildcard or `*.microsoft.com`: PASS
- browser CSP for real personal OneDrive photo upload, thumbnail, viewer and download: PASS
- video-specific browser CSP: PASS, including 30 MB multi-chunk upload
- final DevTools console CSP violations: 0 (PASS)

## Security boundaries

- `/album` without a valid access exchange: BLOCKED (PASS)
- signed access required before guest/gallery APIs: PASS
- secure, HttpOnly, SameSite=Lax cookie configuration: PASS
- CSP, `nosniff`, referrer policy, frame protection and staging `noindex`: PASS

## Restart

- PHP request restart and MySQL metadata persistence: PASS locally
- fresh private browser/session boundary: PASS
- health remains `storage=mysql`: PASS
- OneDrive remains connected without OAuth: PASS
- gallery persists: PASS
- photo thumbnail/viewer/download: PASS
- video thumbnail/viewer/download: PASS

## Final result

**STAGING VALIDATED — NOT YET PROMOTED TO PRODUCTION**

## Issues found

- The PHP configuration validator required `MYSQL_PORT` as a string while the deployment template correctly emitted integer `3306`, causing a sanitized `503 STARTUP_FAILED` before the database connection.
- The PHP cURL adapter created a Graph upload session with a bodyless `POST`; Graph rejected it with `411 Length Required`.
- A real OneDrive Personal upload session used the restricted `*.microsoftpersonalcontent.com` family, which was absent from `connect-src`.
- A real thumbnail used a regional Microsoft `*.svc.ms` host, which was absent from `img-src`.

- Hostinger Single cannot execute the Node.js backend.
- MySQL 8 may expose `information_schema` result keys in uppercase through PDO.

## Fixes applied

- `MYSQL_PORT` is now validated through the centralized positive-integer parser and is no longer incorrectly included among required string settings.
- Added regression coverage using the same integer port representation as the deployed PHP configuration.
- Startup failures write only exception class and sanitized numeric codes to a private runtime log outside `public_html`.
- Graph upload-session creation now sends an explicit JSON body and has contract coverage for it.
- CSP now permits `*.microsoftpersonalcontent.com` in `connect-src` for direct personal OneDrive uploads.
- CSP permits `*.svc.ms` only in `img-src` for regional Microsoft thumbnails; no regional hostname is hardcoded.

- Added a dependency-free PHP backend matching the existing `/api` contract.
- Added secure configuration validation, encrypted OAuth storage, Graph integration, PDO storage, rate limits and security headers.
- Made schema introspection tolerant of MySQL/PDO key casing.
- Added a deterministic Hostinger package builder and PHP/MySQL/Graph contract suite.

## Remaining risks

- iPhone HEIC;
- iPhone MOV/HEVC;
- Android;
- very large video;
- real mobile network;
- orphan reconciliation.
