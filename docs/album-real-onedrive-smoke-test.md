# Real OneDrive Smoke Test

## Environment

- Date: 2026-08-30 to 2026-08-31
- Node: v24.1.0
- Browser: Brave 149 / Chromium 149 on Windows
- Storage: MemoryStore
- OneDrive account type: Personal Microsoft account

## Pre-flight

- Required environment variables present: PASS
- Local public URL: PASS
- Local OAuth callback: PASS
- OneDrive folder configuration: PASS
- `.env` ignored by Git: PASS
- Typecheck: PASS
- Production dependency audit: PASS (0 known vulnerabilities in production dependencies according to `npm audit --omit=dev`)
- Automated tests: PASS (52 server and 28 frontend tests)
- End-to-end tests: PASS (2 Chromium tests)
- Production build: PASS (1,732 modules transformed)

## OAuth

- Authorization redirect: PASS
- Callback: PASS
- PKCE/state: PASS
- Refresh token persisted encrypted: PASS (MemoryStore; lost when the backend restarts)

## Graph connection

- Folder creation: PASS (`Boda/Album/Originales`)
- `codex-onedrive-test.txt`: PASS

## Photo

- createUploadSession: PASS
- direct PUT: PASS
- complete: PASS
- gallery: PASS (author: `Gepete Test`)
- thumbnail: PASS (Graph/API and visual browser confirmation)
- viewer: PASS
- download: PASS

## Video

- Files tested: safe MP4 files of approximately 834 KB and 30 MB
- createUploadSession: PASS
- direct PUT: PASS
- 10 MiB sequential chunks: PASS with the 30 MB file
- complete: PASS
- gallery: PASS
- thumbnail/poster: PASS
- viewer: PASS
- download: PASS

## Network retry

- Controlled browser-offline interruption during a real 30 MB upload: PASS
- Automatic recovery and successful completion: PASS (failed PUT, session GET `200`, resumed PUT `202`, final PUT `201`)
- Real Microsoft throttling (`429`): NOT ATTEMPTED intentionally; covered by automated tests with `Retry-After`

## Cancellation

- Active PUT aborted promptly: PASS
- Graph upload session DELETE: PASS (`204`, exactly once)
- Local `/fail` request: PASS (exactly once)
- Visual state remained `Cancelado` with manual retry available: PASS
- Canceled item absent from gallery: PASS

## Refresh and development storage

- Browser refresh while the backend remained alive: PASS; guest cookie and gallery remained available
- Backend restart/suspension with MemoryStore: EXPECTED RESET observed
- Effect observed: encrypted local OAuth record and gallery metadata were lost; originals already uploaded to OneDrive were not deleted
- Recovery: do not re-upload solely to repopulate this development instance. Future `Repair gallery / reconcile` remains a documented follow-up and is intentionally not implemented in this iteration.

## CSP / Browser console

- Real thumbnail and original media domains: PASS in the local browser flow
- CSP allowlist regression test: PASS
- Final browser verification with the SPA served by production Express: deferred to staging, because production correctly refuses to start without MySQL

## Issues found

- The local `.env` contained only `MYSQL_PORT` from the MySQL group. The server correctly rejected this partial configuration. The unused local port entry was removed so development can intentionally use MemoryStore.
- The initial OAuth callback failed because `TOKEN_ENCRYPTION_KEY` did not have a supported 32-byte encoding. The value was replaced locally without exposing it; the repeated OAuth callback then passed.
- Personal OneDrive returned `invalidRequest` when `createUploadSession` used the parent item-ID endpoint, both with and without the optional `fileSize` request field.
- The uploaded personal-OneDrive item did not include `@microsoft.graph.downloadUrl` in the selected metadata response, although the documented `/content` endpoint did provide the temporary URL through its redirect.
- The real temporary original URL used a Microsoft personal-content domain that was not present in the production CSP allowlist.
- A diagnostic process could not create a fresh guest session because its inherited album-access environment did not match the running backend. No credential was printed or changed; viewer/download validation will use the browser's existing authenticated session.
- The development backend later restarted while using MemoryStore. The real OneDrive originals remained, but the volatile OAuth record and media metadata disappeared as documented.

## Fixes applied

- Local ignored configuration: removed the standalone `MYSQL_PORT` entry and replaced the invalid encryption key with a valid random 32-byte key.
- `server/graph.ts`: changed upload-session creation to the documented root-path form, with an empty request body, after ensuring the album folder exists.
- `server/graph.ts`: obtains the temporary original URL from the official `/content` redirect without following or logging it.
- `server/graph.test.ts`: added regression assertions for the personal-OneDrive-compatible upload-session request and temporary original redirect.
- `server/app.ts` and `server/security.test.ts`: allow the restricted Microsoft personal-content wildcard family without hardcoding the observed temporary hostname. Staging later confirmed that OneDrive personal can also use this family for direct upload sessions, so it is required in `connect-src`.
- Local ignored configuration: rotated `COOKIE_SECRET` after local cookies were accidentally copied during diagnostics. Its value was not displayed.

## Remaining risks

- Browser console/CSP should be rechecked once the production Express-served SPA is running against real MySQL in staging.
- The real smoke-test originals are present in the configured OneDrive folder but are orphaned from the reset development MemoryStore. They were not deleted or enumerated during this test.
- Very large video remains pending; the real 30 MB MP4 validated sequential 10 MiB chunks.
- Physical iPhone HEIC and MOV/HEVC, Android, large video, mobile network and real MySQL remain pending.
- Restarting the development backend loses local metadata and the encrypted OAuth record because this smoke test uses MemoryStore.

## Follow-up

The later real-MySQL iteration validated persistence of encrypted OAuth and gallery metadata across a backend restart. See `docs/album-mysql-real-test.md`; this section remains the historical result of the earlier MemoryStore smoke test.
