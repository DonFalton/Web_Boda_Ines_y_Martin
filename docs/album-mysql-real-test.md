# Real MySQL Persistence Test

## Environment

- Date: 2026-08-31
- Node: v22.23.2
- MySQL version: 8.0.46
- Storage: MysqlStore
- Local isolation: official MySQL 8 Docker image with a persistent named volume
- Application database and integration-test database: separate

No host, user, password, token, OneDrive item ID or temporary URL is recorded in this report.

## Connection

- `mysql2` connection: PASS
- `SELECT 1`: PASS
- Backend startup: PASS
- `GET /api/health` returned `storage=mysql`: PASS
- MemoryStore fallback while MySQL was configured: not observed

## Schema

- `media`: PASS
- `oauth_tokens`: PASS
- `utf8mb4_unicode_ci`: PASS
- `BIGINT UNSIGNED` with a 15 GiB fixture: PASS
- Pagination index `(status, created_at, id)`: PASS
- Repeated schema bootstrap: PASS

## Media persistence

- Write: PASS
- Unicode guest names and emoji: PASS
- Status update: PASS
- Close pool: PASS
- New pool: PASS
- Read same media: PASS
- Equal-timestamp cursor pagination without gaps or duplicates: PASS
- SQL-like guest input stored as data: PASS

## OAuth persistence

- Dummy refresh token encrypted before storage: PASS
- Plaintext absent from the stored value: PASS
- Close pool and open a new pool: PASS
- Decrypt after reload equals dummy input: PASS
- Real encrypted OAuth record persisted in the application database: PASS
- Backend restart without repeating Microsoft authorization: PASS
- Graph access after restart: PASS

Access tokens remain memory-only and were not added to the schema.

## End-to-end restart

### Before restart

- OneDrive connected: PASS
- New safe photo uploaded directly: PASS
- Gallery: PASS
- Thumbnail: PASS
- Viewer: PASS
- Original download: PASS

### After backend restart

- Health `storage=mysql`: PASS
- OneDrive connected without a new OAuth flow: PASS
- Gallery still populated: PASS
- Thumbnail retrieved again: PASS
- Viewer: PASS
- Original download: PASS

No existing OneDrive file was deleted or enumerated. The previous smoke-test originals were not re-uploaded.

## Issues found

- The existing pagination index omitted `id`, although the query orders and cursors by `(created_at, id)`.
- `CREATE TABLE IF NOT EXISTS` alone did not add the pagination index to an existing table.
- The first schema assertion assumed lowercase `information_schema` field labels; MySQL on Windows returned uppercase labels.

## Fixes applied

- Made `utf8mb4` explicit in the mysql2 pool.
- Added the composite pagination index `(status, created_at, id)` to new schemas.
- Added an idempotent metadata check that adds the pagination index to an existing schema when absent.
- Added a real MySQL integration suite using a dedicated test database and specific fixture cleanup.
- Made schema-test field labels platform-independent with explicit aliases.

## Automated validation

- Node: v22.23.2
- npm: 10.9.8
- Production dependency audit: PASS, 0 known vulnerabilities reported by `npm audit --omit=dev`
- Typecheck: PASS
- Server: PASS, 67 tests in 12 files, including 4 real MySQL integration tests
- Frontend: PASS, 28 tests in 8 files
- Production build: PASS
- Chromium E2E: PASS, 2 tests

The E2E suite continued to mock the application API and did not contact Microsoft or write to OneDrive.

## Remaining risks

- Hostinger staging and its managed MySQL environment.
- Production Express/CSP verification in staging.
- Physical iPhone HEIC.
- Physical iPhone MOV/HEVC.
- Android.
- Very large video.
- Real mobile network.
- Orphan reconciliation remains intentionally unimplemented.
