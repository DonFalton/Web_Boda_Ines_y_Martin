# Album Final QA Report

## Environment

- Date: 2026-09-01
- Staging hostname: `album-staging.inesymartin.es`
- Local validation runtime: Node.js v22.23.2
- npm: 10.9.8
- Hostinger staging runtime: PHP 8.3 adapter (Hostinger Single has no Node.js runtime)
- Browser desktop: Playwright Chromium for automated E2E; real desktop staging checks previously completed in Brave/Chromium 149
- iPhone: physical device PASS; model not recorded
- iOS: version not recorded
- Safari: physical browser PASS
- Android: physical device PASS; model not recorded
- Android version: not recorded
- Chrome Android: physical browser PASS
- MySQL: Hostinger MariaDB with `storage=mysql`; exact managed-server version not recorded. Local integration also passed on MySQL 8.0.46 and MariaDB 11.4.

No secrets, cookies, OneDrive item identifiers or temporary capability URLs are recorded in this report.

## Entry gate

- Node 22 validation: PASS
- `TOKEN_ENCRYPTION_KEY` startup validation: PASS
- CSP hardening: PASS
- real MySQL: PASS
- Hostinger staging: PASS
- frontend gallery redesign: PASS

## Automated regression

- `npm ci`: PASS
- Audit: PASS — 0 known production dependency vulnerabilities according to `npm audit --omit=dev`
- Typecheck: PASS
- Server: PASS — 74 tests in 12 files
- Frontend: PASS — 46 tests in 10 files
- E2E: PASS — 6 Playwright Chromium tests
- Build: PASS — Vite production bundle and server TypeScript compilation
- Node: v22.23.2
- npm: 10.9.8

## Staging

- HTTPS: PASS
- Health: PASS — `storage=mysql`
- MySQL: PASS
- `/`, `/album` and `/album/admin` routing: PASS
- hard refresh routing: PASS
- unknown `/api` route returns JSON rather than the SPA: PASS
- CSP with real photo/video flows: PASS
- final legitimate CSP violations in DevTools: 0
- sensitive cookies use HttpOnly, Secure and SameSite=Lax where applicable: PASS
- security headers and album `noindex`: PASS
- unauthenticated album access blocked: PASS

The staging runtime differs from the preferred Node/Express target because the existing Hostinger Single plan cannot execute Node.js. The authorized PHP 8.3 adapter preserves the same `/api` contract, MySQL requirement, OAuth boundaries, upload flow and security policy. This difference is explicit and is not reported as Node-on-Hostinger validation.

## iPhone

- Access: PASS
- Upload: PASS
- real HEIC: PASS
- real MOV/HEVC: PASS
- Viewer: PASS
- individual download from viewer: PASS
- download from gallery selection: FAIL — known mobile-browser limitation
- Background/app switch: PASS
- Network change/recovery: PASS
- Safe areas/orientation: PASS

## Android

- Access: PASS
- Upload: PASS
- Photo: PASS
- Video: PASS
- Viewer: PASS
- individual download: PASS
- multi-download: FAIL — browser accepts the request but downloads only the first selected item
- Network change/recovery: PASS
- Orientation: PASS

## Large file

- Size: PASS at the mandatory >=500 MB threshold; exact tested size not recorded
- Previous evidence: a real 30 MB MP4 also passed multi-chunk upload with 10 MiB chunks
- Upload: PASS
- Retry/recovery: PASS
- Complete: PASS
- Download: PASS

## Batch upload

- Number files: 20 on a physical device
- Automated queue/concurrency coverage: PASS
- Twenty-photo physical batch: PASS
- Completed/recoverable: PASS
- UI responsiveness: PASS

## Gallery UX

- responsive automated viewports: PASS at 390x844, 430x932, 768x1024 and 1440x900
- gallery-first layout: PASS in automated/desktop checks
- upload action: PASS in automated/desktop checks
- selection and long-press logic: PASS in automated tests
- multi-download logic: PASS in automated tests
- viewer photo/video: PASS in automated/desktop checks
- physical mobile touch, safe-area and orientation validation: PASS
- multi-download: FAIL on physical iPhone/Android; individual viewer download remains available

## Persistence

- Before restart/request boundary: PASS
- After fresh PHP request and private browser session: PASS
- Health remains `storage=mysql`: PASS
- OAuth remains connected without reconnect: PASS
- Gallery persists: PASS
- Photo thumbnail/viewer/download: PASS
- Video thumbnail/viewer/download: PASS
- Refresh token remains encrypted at rest: PASS

Because PHP is request-scoped on Hostinger Single, the applicable runtime recovery test is a fresh PHP request plus a new private browser session backed by the same MariaDB data. There is no persistent Node process to restart on this plan.

## OAuth and OneDrive

- real staging OAuth callback: PASS
- PKCE/state and delegated scopes contract: PASS
- permissions remain `offline_access` plus `Files.ReadWrite`: PASS
- Graph connection test: PASS
- direct browser-to-OneDrive upload: PASS
- real photo upload/thumbnail/viewer/download: PASS
- real 30 MB video upload/thumbnail/autoplay/download: PASS
- no Hostinger proxying of photo/video bytes: PASS

## Guest usability

- physical guest flow: PASS as reported by the tester
- QR with iPhone camera: PASS
- QR with Android camera: PASS
- independent 2–3-person final rehearsal: pending until after production QR generation
- Observed blockers: none

## Accessibility and performance

- automated labels, keyboard viewer behavior, Escape and focus restoration: PASS
- responsive layout tests: PASS
- physical touch targets and notch/home-indicator safe areas: PASS
- reduced-motion/manual usability: PASS as reported
- contrast: no blocking issue recorded in existing desktop review
- several-dozen-item physical mobile scroll and jank review: PASS
- network inspection previously confirmed thumbnails in the grid and originals only on viewer/download: PASS

## Production isolation

- `https://inesymartin.es`: PASS
- production `.htaccess`: untouched
- existing Spotify redirect: PASS — HTTP 302 to host `open.spotify.com`
- staging document root: independent
- production promotion: NOT PERFORMED

## Bugs found

No new bug was found by the final automated regression. Physical testing found one non-blocking multi-download limitation:

| ID | Severity | Device | Expected | Actual | Disposition |
|---|---|---|---|---|---|
| MOB-01 | MEDIUM | Safari iOS / Chrome Android | Download all selected items from one action | Safari downloads only through the viewer; Android downloads only the first selected item | Accepted for this release: individual viewer download works and there is no data loss. A deterministic one-action multi-file download requires future packaging (for example ZIP) or a separately validated native share/save flow. |

Previously found staging bugs, all fixed with regression coverage:

| ID | Severity | Area | Actual result | Fix | Retest |
|---|---|---|---|---|---|
| STG-01 | BLOCKER | PHP startup | Integer `MYSQL_PORT` caused sanitized startup failure | Centralized positive-integer validation | PASS |
| STG-02 | BLOCKER | Graph upload session | Bodyless PHP POST returned `411 Length Required` | Explicit JSON request body | PASS |
| STG-03 | BLOCKER | CSP upload | Personal OneDrive upload host was blocked | Restricted personal-content family added to `connect-src` | PASS |
| STG-04 | HIGH | CSP thumbnail | Regional Microsoft thumbnail host was blocked | `*.svc.ms` added only to `img-src` | PASS |

## Remaining risks

- multi-download remains browser-dependent on iPhone and Android; individual viewer download is the supported fallback;
- independent rehearsal with 2–3 guests using the definitive production QR;
- orphan reconciliation remains intentionally unimplemented.

## Recommendation

**READY FOR PRODUCTION GO-LIVE**

No BLOCKER or HIGH defect remains open. `MOB-01` is MEDIUM and has a working individual-download fallback through the viewer. Production promotion still requires an explicit user-authorized deployment window; this report does not perform it.
