# HTTP API Design — api-data.json

Source of truth: user-provided `api-data.json`. This change adds **GET** endpoints only.

| Endpoint | Success | Missing |
|---|---|---|
| `GET /api/aa` | One AA connection object | 404 |
| `GET /api/browser/all` | Array of `{browser: {...}}` | 200 `[]` |
| `GET /api/browser/:id` | `{browser: {...}}` | 404 |
| `GET /api/extension/:id` | Extension object | 404 |
| `GET /api/extension/:id/activities` | Activity array | 404 unknown extension, 200 `[]` when empty |
| `GET /api/extension/:id/tasks` | Task array | 404 unknown extension, 200 `[]` when empty |

All endpoints inherit existing `/api` API-key middleware.

## Contract notes

- AA is a singular endpoint without an ID in the file. Implementation returns the record with the largest `connectedTime`; no records returns 404. **This selection rule is an implementation decision**, not specified in the input.
- `/api/browser/all` returns an array of browser wrappers, and `/api/browser/:id` returns one browser wrapper exactly as depicted.
- Activities in the source contain duplicated `id` keys. Response exposes one `id` property.
- Activity platform values use `Facebook | Tiktok | Threads`, whereas tasks use `facebook | tiktok | threads`. Both distinctions are intentionally preserved.
- `scheduleTime` remains a string with the documented pipe-delimited pattern; its units and calendar semantics are unspecified.
- `connectedTime`, `lastHeartbeatTime`, `disconnectedTime`, `createdTime`, etc. are returned as numeric values unchanged. Their units are unspecified in the source.
- `status` for AA, browser `type`, and features are free-form strings because the source gives no enumerations.
- `supportingPlatforms` is preserved as an array of objects each keyed by platform name, not silently normalized.
- `inputs` and `extraMeta` remain JSON objects.

## Data and boundaries

Business contracts live in `modules/aa-catalog/contracts.ts`. The SQLite adapter lives in `modules/aa-catalog/sqlite-catalog.ts`, and HTTP-only routing lives in `infrastructure/http/aa-catalog-router.ts`.

Five new SQLite tables hold serialized DTOs: `AaConnection`, `AaBrowser`, `AaExtension`, `AaActivity`, `AaTask`. Activity/task records additionally index `extension_id`. Existing Session and ProcessUsage schemas remain untouched.

The repository exposes internal `upsert*` methods to integrate with a future AA/extension synchronizer. **No write endpoints were requested or added.** There is no sample data inserted in production. Therefore initially `GET /api/aa` and single-record endpoints return 404, `GET /api/browser/all` returns `[]`, until real data is ingested.

For a future iteration, confirm whether connection status is sourced from Socket.IO events, how AA relates to browsers, and whether timestamps are seconds or milliseconds.

## Test

```sh
npm install
npm run typecheck
npm test
```
