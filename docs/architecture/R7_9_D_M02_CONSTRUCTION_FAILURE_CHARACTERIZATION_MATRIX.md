# R7.9.D — M02 Construction Failure Characterization Matrix

**Source baseline:** `d9b252faf1eafe1f15362398f3c9e5f98c9f67a9` (`main`). No production source changed.

| Case | Source-proven path | Assertion and observation | Limits |
|---|---|---|---|
| F1 duplicate route ID | `createApplication` validates timeout and opens persistence before entering its `try` (`src/app/create-app.ts:60-69`). `RouteRegistry` construction consumes configured routes at `:71`; duplicate IDs throw `Error('Duplicate route: <id>')` (`src/modules/messaging/route-registry.ts:17-23`). `acquiredSockets` is not yet assigned. Catch synchronously calls `persistence.close()` and rethrows the original error if close succeeds (`create-app.ts:188-200`). | `tests/application-surface-compatibility.test.ts` supplies the same public route twice and asserts error name/message. It then opens the temporary file database through `better-sqlite3`, queries `sqlite_master` for `Session`, closes that independent handle and removes its unique temp directory. This demonstrates the DB file remains usable after construction failure; it does not inspect M02's handle. | Reopen success is an externally observable check compatible with closed or otherwise reopenable prior state; it is not direct proof of native handle closure. No sockets, PServer, runner locks, or HTTP listener were acquired at this failure point. Persistence-close failure aggregation is not injected. |
| F2 blank PServer UDID | Route/repository/HTTP setup and `attachSocketServer` complete first; `acquiredSockets = sockets` occurs at `create-app.ts:86`. With peer gateway and PServer config present, `connectToPServer` is called at `:87-89`; its public validation rejects whitespace-only UDID before transport construction (`src/infrastructure/socket/pserver-connector.ts:10-14`). `acquiredPServer` assignment at `:90` is not reached. Catch therefore has no PServer connector handle, invokes `acquiredSockets.close()` fire-and-forget, closes persistence synchronously, then rethrows (`create-app.ts:188-200`). | Test supplies `enableTestPeers: true`, a PServer URL, and whitespace UDID; it asserts exact `Error('PServer VM UDID is required')`. This confirms the public configuration trigger reaches the connector validation outcome. | The API exposes no completion promise for construction catch's asynchronous socket close. The assertion does **not** prove close completion, transport shutdown, native DB handle state, locks, or filesystem durability. No delay or guessed settlement is used. A reliable independent cleanup assertion requires an approved observable seam or a separate deterministic public signal. |

## Evidence classification

- **Observed by tests:** F1 exact error; the temporary SQLite file can be reopened and queried; F2 exact validation error.
- **Source-proven:** acquisition/marker order and exception/rollback code paths described above.
- **Not proven:** native DB handle closure as a direct handle-state fact; F2 Socket.IO close completion; transport shutdown; lock cleanup; filesystem durability; arbitrary constructor or close failures.
- **Deferred:** cleanup completion tests for F2 and all constructor/cleanup boundaries inaccessible through current deterministic public inputs. No production seam is proposed or added in this checkpoint.

## Future seam gate

Any seam for a named inaccessible boundary requires separate architecture-owner approval, an owner for the affected module, an equivalence argument preserving marker assignment and sync/async ordering, and targeted tests for original error identity, every attempted cleanup, listener/resource state, and R7.5–R7.8 invariants. No generic DI, monkey patch, public API change, or extraction is authorized here.
