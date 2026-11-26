# NM.3.3.D Targeted Remediation Report

## Acceptance recommendation: PARTIAL — implementation and artifact verified; runtime deployment pending

RF-22 source remediation and focused tests are complete. Corrected fixed-port templates for RF-23 are prepared, but have not been written to live ARM config. New AS `1.1.1` candidate artifact passed structural and production dependency checks. Runtime inventory could not be queried without starting the Supervisor, which this task forbids; version availability and runtime resolution remain pending NM.3.3.V.

## 1. Baselines and preservation

- AS `main`, committed HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7`. Existing NM migration worktree changes were preserved; this task added only the focused HOST code/tests, required manifest entry/count maintenance, requested docs/report, and versioned candidate output.
- ARM `arm-supervisor`, HEAD `4e887715d4576e6fa64644778f0072bc94c018b4`. Existing `docs/Note.txt` edit preserved. ARM production source and tests unchanged; only the requested ARM docs were changed.
- Node `v22.23.5`, npm `10.9.9` used for checks/build/package.
- Isolated environment `/home/parker/nm-verification/naming-migration-v1.1.0/` was not mutated. No Supervisor or managed app was started. NM.3.3.B retained evidence says all apps were stopped; no live status re-query was made.

## 2. Accepted decisions

- NM-D06-A: AS gains optional `HOST`, follows ARM trusted HOST contract, and preserves old behavior if absent.
- NM-D07-A: EServers use fixed `PORT=3002`/`3012`; retain source `PORT`-first precedence.
- NM-D08-A: ARM `process.port` remains assigned metadata; document without runtime/API changes.
- NM-D09-A: app configs request CDC `PORT=3001` and SPA `PORT=3003`; no source changes to these apps.

## 3. Changes and ownership

- AS-owned implementation: `src/config/configuration.ts` resolves optional HOST; `src/app/lifecycle.ts` forwards it; `src/app/create-app.ts` passes it to the existing shared HTTP server listener. Socket.IO remains attached to that same server. `application.listen(port)` remains compatible, including unchanged error text for different-port calls; `startApplicationResources` retains its prior positional signature and takes optional HOST as a trailing parameter.
- AS tests: `tests/configuration.test.ts`, new `tests/host-binding.test.ts`, `tests/application-surface-compatibility.test.ts`; manifest registration/count updated in `docs/testing/R7_7_TEST_MANIFEST.json` and `tests/test-manifest-validator.test.ts`.
- AS docs/templates: `README.md`, `docs/operations/NAMING_MIGRATION_DEPLOYMENT_RUNBOOK.md`, `docs/operations/NM_3_3_D_ARM_APPLICATION_CONFIGURATION_TEMPLATES.md`.
- ARM docs only: `docs/DYNAMIC_ENDPOINTS.md`, `docs/ENV_CONFIGURATION.md`, `docs/CHILD_ENVIRONMENT_BUILDER.md`. No ARM implementation or test change.
- Checkpoint/report: `docs/architecture/PROJECT_STATE.md`, this report.
- Candidate files: `arm-packages/nm33d-v1.1.1-verified/as-1.1.1.zip` plus `SHA256SUMS`. Existing script also produced CDC/EServer/SPA 1.1.1 archives because its behavior packages all five. Those extra archives are unused and are not candidates for deployment; peers remain installed at 1.1.0.

## 4. HOST contract and implementation evidence

`HOST` is optional in AS environment. When absent, resolved `host` is `undefined` and AS calls `server.listen(port)`, preserving the previous Node unspecified-host behavior. When supplied, it must be an exact, unpadded IPv4 or IPv6 literal accepted by Node `isIP`; IPv6 zone identifiers are accepted only when the base literal validates. Empty, whitespace-only, padded, DNS-name, or other invalid values throw `Error('Invalid HOST')`. Validation performs no DNS lookup. PORT behavior is unchanged.

Lifecycle passes the resolved optional host into `ApplicationInstance.listen(port, host?)`; the HTTP listener calls the original one-argument form if absent and `server.listen(port, host)` if supplied. Existing application.listen(port) consumers remain valid. HTTP API and Socket.IO continue sharing one HTTP server/listener. No extra listener or protocol change was introduced.

`tests/host-binding.test.ts` inspects `httpServer.address()` after `startApplication(resolveConfiguration({HOST:'127.0.0.1', PORT:'0'}))`, confirms actual address `127.0.0.1`, IPv4, Socket.IO upgrade listener attachment, and shutdown. A second test confirms omitted HOST retains unspecified/wildcard binding. Config tests cover absent, loopback, wildcard IPv4, `::1`, documentation IPv6, empty/whitespace/padded/DNS rejection and unchanged PORT values. Automated tests prove source behavior only; RF-22 is **not runtime-resolved** until NM.3.3.V observes the installed new release bound to loopback.

## 5. Verification results

- Focused command: `PATH=/home/parker/.nvm/versions/node/v22.23.5/bin:$PATH node --import tsx --test tests/configuration.test.ts tests/application-surface-compatibility.test.ts` — configuration 9? test-file TAP top-level passed; application surface 8/8. Initial combined runner was sandbox-denied for listener-opening files; exact individual listener evidence below.
- Authorized local listener command: `PATH=/home/parker/.nvm/versions/node/v22.23.5/bin:$PATH node --import tsx --test tests/host-binding.test.ts tests/application-lifecycle.test.ts tests/http-gateway.test.ts tests/socket-peer-gateway-handshake.test.ts` — PASS 13/13, 0 skipped. Confirms actual bind, legacy lifecycle, HTTP gateway and Socket.IO handshake behavior.
- `PATH=... npm run typecheck` — PASS after preserving direct lifecycle test seam signature.
- `PATH=... npm run build` — PASS.
- `PATH=... npm run check:architecture` — PASS; 59 files, 145 edges, zero runtime file SCCs.
- `PATH=... npm run test:manifest` — PASS, 56 manifest entries / 56 discovered tests.
- `PATH=... npm run test:fast` — PASS, backend 92/92, selected 11 backend files; 0 selected playground files. First run found the expected stale 55-entry count assertion after manifest addition; updated that assertion to 56 and reran successfully.
- Initial sandbox runs of listener tests failed with sandbox socket EPERM and were rerun through authorized execution. First authorized full lifecycle invocation surfaced an error-string compatibility mismatch introduced during development; restored the existing “different port” contract and reran the 13 focused tests successfully. No test was weakened.

## 6. Corrected configuration templates

Complete redacted templates are in [NM.3.3.D ARM application templates](docs/operations/NM_3_3_D_ARM_APPLICATION_CONFIGURATION_TEMPLATES.md). They are not installed or written to live config.

- AS: `PORT=3000`, existing peer/SQLite/CDC settings and the approved persistent task/selection paths; no HOST in app config.
- CDC: `PORT=3001` plus existing shared API key.
- EServer 1/2: `PORT=3002` / `3012`, AS URL, `e-1` / `e-2`, key; omit redundant `ESERVER_PORT`.
- SPA: `PORT=3003`, AS URL, key.

No credentials were read into output or rotated. ARM supplies trusted `HOST=127.0.0.1`.

## 7. Documentation clarification

ARM docs now state explicit app `PORT` requests fixed assignment and absent PORT causes dynamic allocation; selected PORT/HOST are injected; apps must honor them; allocation is advisory until bind. `process.port` means assigned, not verified listening; `ASSIGNED` is not `BOUND` or `READY`. Fixed singleton ports can conflict; dynamic slots are needed for parallel Blue/Green. Public API fields and runtime semantics were not changed.

AS README and maintained naming migration runbook now document HOST literal validation, no-HOST backward compatibility, standalone `HOST=127.0.0.1`, ARM-managed HOST injection, corrected port templates, process.port limits, immutable release strategy and the runtime listener verification gate.

## 8. Candidate AS release and artifact verification

- Candidate: AS application ID `as`, version `1.1.1`, output `arm-packages/nm33d-v1.1.1-verified/as-1.1.1.zip`.
- SHA-256: `0857d072f9515bef0ad2e19128b8c70d70f5278de9970b12e7ede6c669e39a13`.
- Manifest: schema `1.0`, app ID `as`, version `1.1.1`, entry `dist/src/main.js`, npm-ci, `autoStart=false`, ARM SDK disabled.
- `unzip -t`: PASS; 88 entries. Entrypoint, package.json and lockfile are present. Archive package metadata/lockfile generated by existing script; native optional SQLite dependency is excluded as designed.
- New HOST implementation is present in compiled `dist/src/config/configuration.js`; listener code is included.
- Compiled source path inventory matched current `src/**/*.ts` compilation; no stale extra source files. Migrated-name scan on compiled archive paths found no obsolete identities.
- Extracted package into temporary verification directory and ran `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`: PASS, 90 packages. Temporary extracted dependency tree was removed; no ARM storage was touched.
- `SHA256SUMS` generated for all five outputs and `sha256sum -c SHA256SUMS` PASS 5/5. Only AS ZIP is candidate replacement; peers stay 1.1.0.
- Existing ARM Supervisor was not started solely to check whether 1.1.1 is unused. Availability remains **pending**; do not install until NM.3.3.V authenticated release inventory confirms it is unused.

## 9. RF-22 / RF-23 disposition

- RF-22: **source/configuration remediation implemented and automatically verified; runtime unresolved** pending new release deployment and observed loopback bind.
- RF-23: **configuration correction prepared, runtime unresolved**. ARM templates now set `PORT` to fixed desired values, matching ARM's current fixed-assignment support and EServer's PORT-first source behavior. Actual listeners must still be checked after deployment.
- RF-24 metadata: docs clarification only; API and runtime semantics unchanged.

## 10. NM.3.3.V bounded deployment procedure

1. Revalidate both repo baselines, persistent root ownership/permissions, Supervisor process/storage identity, credentials without disclosure, and authenticated management API. Do not start a second Supervisor if the existing one is active.
2. Confirm all five app processes are STOPPED; inventory installed/active releases and redacted config metadata.
3. Confirm `as@1.1.1` is unused; verify candidate checksum against `SHA256SUMS`. If unavailable or conflict exists, stop and select a separately approved new version; never overwrite 1.1.0.
4. Install only AS 1.1.1; record receipt/checksum/dependency result. Preserve all 1.1.0 releases.
5. Preserve current state paths, SQLite disabled, API key, CDC URL/path and peer identity settings. Apply corrected `PORT` values from the template with owner-only file mode; do not put HOST in application config.
6. Activate AS 1.1.1. Keep CDC/EServer 1/2/SPA on 1.1.0; activate only if their current active selections are absent or incorrect and authorized procedure allows.
7. Start CDC and use `ss` to confirm `127.0.0.1:3001`; start AS and immediately check `ss` for exactly `127.0.0.1:3000`. If any wildcard/non-loopback bind appears, stop AS immediately and do not start peers.
8. Start EServer 1, EServer 2 and SPA. Compare ARM assigned `process.port` and process status with OS listeners `127.0.0.1:3002`, `:3012`, `:3003`; do not count ARM ASSIGNED metadata alone as proof.
9. Verify HTTP health, invalid/missing auth rejection, AS-to-CDC `/ws` session ACK, EServer identities/welcome, SPA registration, and ARM logs/diagnostics without environment dumps or secrets.
10. Run representative stop/start/restart for AS and one EServer; verify new listener addresses/ports and reconnect. Confirm all new state remains under approved AS state dirs and SQLite stays disabled.
11. Preserve logs/releases/state and record final inventory/ownership. Stop all apps if any safety gate fails; no automatic cleanup.

## 11. Remaining blockers and next step

- Candidate version 1.1.1 availability is unknown until authenticated isolated inventory is read in NM.3.3.V.
- Runtime HOST injection and fixed listener addresses/ports have not been verified; RF-22 and RF-23 must remain open until then.
- No ARM package install, activation, config write, process operation, runtime-state mutation, credentials change, commit, or NM.4 work occurred. Stop here; do not begin NM.3.3.V automatically.
