# NM.3.3.C Runtime Configuration Root Cause Analysis

## 1. Scope and repository baselines

Read-only targeted analysis; no source, test, deployment configuration, release, state, or process changes were made. The installed applications remained stopped; no Supervisor was started.

- AS `main`, HEAD `72b31e54e266743fbfd18b6169e4a85c843ddeb7`. Existing NM migration modifications and untracked files remain untouched.
- ARM `arm-supervisor`, HEAD `4e887715d4576e6fa64644778f0072bc94c018b4`. Existing `docs/Note.txt` modification remains untouched.
- Relevant repository AGENTS.md: AS instructions were read. No ARM-root AGENTS.md exists at the inspected checkout root.
- The persistent isolated deployment remains at `/home/parker/nm-verification/naming-migration-v1.1.0/`. Existing receipts, configs, logs and release files were read locally with secrets excluded/redacted. No live API/process interaction was performed. NM.3.3.B records all five processes stopped and the Supervisor retained; this analysis did not change that state.

## 2. RF-22 — AS configuration-to-listener chain

Call chain:

1. `src/config/configuration.ts::resolveConfiguration(environment)` reads `PORT`, defaults it to `3000`, validates integer range `0..65535`, and returns `ResolvedConfiguration.port`. There is no `HOST` or bind-address setting/type/default/validation.
2. `src/main.ts` (packaged entry) resolves the environment configuration and calls lifecycle startup.
3. `src/app/lifecycle.ts::startApplication` calls `application.listen(configuration.port)`.
4. `src/app/create-app.ts::createApplication` creates one Node HTTP server with `createServer(createHttpApp(...))`, then `attachSocketServer(httpServer, ...)` attaches Socket.IO to that same HTTP server.
5. `src/app/create-app.ts::listenHttpServer` calls `server.listen(port)` with no host argument. Node therefore selects its unspecified-address/wildcard behavior. Socket.IO shares the same listener; it does not create a second binding.

**Confirmed cause:** AS has no supported bind-host configuration and its HTTP listen call omits a host. The observed `*:3000` binding is the direct consequence of `server.listen(port)`, not a Supervisor `HOST` value being ignored by a supported AS setting. `HOST` is not present in AS resolved config and is never passed to `listen`.

**Configuration-only correction:** Not possible with current AS release semantics. Setting `HOST=127.0.0.1` in app config would not help: AS does not read it. The smallest compatible correction is an AS source change adding an explicit optional bind-host setting and threading it through resolved config/lifecycle to `server.listen(port, host)`. Preserve current default behavior for backward compatibility unless an owner explicitly approves a changed default. For this isolated rollout, a config-only fix requires that source capability to exist first; until then keeping AS stopped is correct.

Relevant existing tests: `tests/configuration.test.ts` covers PORT default/range but no host setting; `tests/application-lifecycle.test.ts` exercises lifecycle/port concurrency and startup/shutdown but creates a server without asserting its bound address. Test helpers bind their own test servers to `127.0.0.1`; that does not test AS's listener. Add focused config and actual address assertions if implementing.

## 3. ARM configuration composition and port allocation

Call chain and ownership:

1. `ApplicationConfigurationStore` reads `<storageRoot>/applications/<id>/application-config.json`; absent config becomes an empty environment object. It validates schema/key/value shape. This is operator-owned application configuration.
2. `ApplicationLifecycleManager.activateRelease` resolves the immutable installed manifest/release, calls `createProcessSpec`, registers the spec, then persists active selection. Activation creates the process spec but does not start it.
3. The manifest's `runtime` currently describes runtime type, minimum Node version and entrypoint; it has no HTTP port ownership/bind contract. The manifest's `arm` fields concern embedded ARM integration/metrics, not singleton HTTP ports.
4. `createProcessSpec` uses `applicationEnv: { ...config.environment, ...options.env }`; Supervisor-provided business defaults in `options.env` override same-key file values. It separately creates trusted `env` (runtime env, `NODE_ENV`, app/instance IDs and optional metrics values).
5. `ProcessManager.launch` chooses `declared = spec.applicationEnv?.PORT ?? spec.env?.PORT`. If present, it validates and claims that port. If absent, `DynamicPortAllocator.allocate()` probes a loopback ephemeral port and records it as a process-local lease. Thus application PORT is explicitly supported and takes precedence; dynamic allocation is the fallback, not mandatory.
6. At spawn, runtime environment is built as `{ ...spec.env, PORT: String(port), HOST: spec.env?.HOST ?? '127.0.0.1' }`. `ChildEnvironmentBuilder` merges OS allowlist, application environment, trusted runtime environment, then optional ARM runtime injection. Therefore trusted `PORT`/`HOST` override lower-precedence application entries (although application `PORT` already determined `port`); inherited Supervisor `PORT` is not copied from OS environment. Application config cannot set `HOST`; builder rejects it. Injection is final but current deployment did not enable automatic injection.
7. ProcessManager creates a child environment that can be consumed consistently by the current Node child runtime; other adapters/contracts may receive environment maps but no cross-adapter fixed-port acceptance is established by this investigation. Do not infer identical allocation semantics for Electron/executable adapters from this Node-specific ProcessManager path.

`DynamicPortAllocator` uses a short-lived `listen(0, '127.0.0.1')` probe, closes it, and returns an advisory port lease; it is not an OS reservation and the app must bind that value. An explicit application `PORT` calls `claim(port)`. Restart re-runs `launch`, so dynamic fallback may change on restart; the recorded EServer 1 port changed from 33361 to 42005. Fixed explicit app ports remain the same unless unavailable/claimed, in which case launch fails.

## 4. RF-23 — EServer precedence and observed cause

The retained EServer 1/2 configuration files contain `ESERVER_PORT=3002` / `3012` and no `PORT`. Packaged `main.js` is only `import './eserver.mjs';`. The packaged `eserver.mjs` selects:

`Number(process.env.PORT ?? process.env.ESERVER_PORT ?? 3002)`

and passes the selected port to the shared peer-server helper. Therefore `PORT` has precedence over `ESERVER_PORT`, then the source default applies.

**Confirmed cause:** ARM sees no application `PORT`, so its documented singleton behavior allocates a dynamic port and injects that trusted `PORT` after application configuration. EServer prefers injected `PORT` to configured `ESERVER_PORT`; the dynamic ARM value wins. This exactly explains the observed `33361` and `40997`, and EServer 1's later `42005` after restart. It is not explained by ARM inheriting Supervisor's root `PORT`: `ChildEnvironmentBuilder` intentionally excludes arbitrary root env. It is not a package wrapper override: `main.js` only imports EServer. The value source is the ARM ProcessManager's own allocation/injection, established directly by source and consistent with changing restart port logs/status.

**Comparison:** AS also honors injected `PORT`, so ARM's assignment explains its selected port 3000 (the explicit AS config `PORT=3000` was claimed, not dynamically allocated). CDC and SPA source/package entrypoints use fixed `3001` and `3003` and ignore the injected `PORT`; they consequently bind those fixed loopback ports while ARM still records its dynamic allocated/injected port. The EServer shared listener helper binds `process.env.PEER_HOST ?? '127.0.0.1'`; CDC uses the same fixed loopback default. AS's distinct wildcard result is due to its own `listen(port)` implementation.

## 5. `process.port` meaning and discrepancy

`ManagedProcessState.port` is documented in `packages/process-manager/src/process-manager.ts` as the “Actual assigned HTTP port, retained for Supervisor re-adoption.” The launch path assigns it from either the explicit selected `PORT` or the dynamic allocator, passes it to the child as `PORT`, and persists it. The allocator comment explicitly says allocation is advisory until the child binds and confirms readiness. No child bind acknowledgment/verification exists in this flow.

`ProcessControllerAdapter` maps this to endpoint `{ host:'127.0.0.1', port:view.port, state:'ASSIGNED' }`; its class comment explicitly says endpoint is ASSIGNED, not BOUND or READY. Endpoint discovery consumes the status port and performs a reachability check before publishing discovered endpoints. The direct application management status, however, exposes `process.port` without an explicit state qualifier. It is therefore **assigned/injected port metadata**, not a verified listening port; the phrase “actual assigned” means selected for the process, not confirmed by socket inspection.

This is not a demonstrated defect in the lower-level ProcessController endpoint contract, whose state documents the distinction. It is a **misleading/underspecified management API field** when consumers read `process.port` as actual bind proof. CDC/SPA show why: the manager records a dynamic assigned port, but their fixed-port servers bind elsewhere. No process listener verification is used to correct that value. Endpoint discovery's reachability gate may avoid publishing unusable candidates but does not prove that its port belongs to the child if another service happens to answer there.

## 6. Responsibility ownership

| Finding | Owner / module | Root cause and evidence | Minimal correction | Risk |
|---|---|---|---|---|
| RF-22 AS wildcard bind | AS repo; AS configuration + application lifecycle/infrastructure socket attachment boundary. `src/config/configuration.ts`, `src/app/lifecycle.ts`, `src/app/create-app.ts` | No bind-host config exists; `listenHttpServer` invokes `server.listen(port)` without host; retained `ss` evidence showed `*:3000`. | Add optional explicit bind host in AS config and pass it through lifecycle to the shared HTTP/Socket.IO listener. Preserve old default until compatibility decision; configure loopback for this deployment. | Binding changes can affect remote clients; default change would be externally visible. Listener remains shared with Socket.IO, so host applies to both. |
| RF-23 EServer actual port mismatch | Split contract: ARM owns assignment/injection; EServer owns reading and precedence. ARM `ApplicationConfigurationStore`, `ApplicationLifecycleManager`, `ProcessManager`; package `eserver.mjs` | ARM allocates/injects `PORT` when config lacks it; EServer resolves `PORT` before `ESERVER_PORT`; logs show actual dynamic values and restart change. | For current singleton deployment, use ARM's already-supported application-owned `PORT=3002`/`3012` in the per-app config, which makes allocator claim and injection match EServer precedence. Keep EServer's existing PORT-first behavior. | Fixed ports can collide with other processes and are outside dynamic Blue/Green slot expectations; preflight and collision handling remain required. |
| ARM `process.port` interpretation | ARM repo; ProcessManager state and adapter/process management API contract | Manager stores selected port without bind confirmation. Controller labels endpoint ASSIGNED; management API exposes bare field. CDC/SPA fixed listeners differ from assigned values. | Do not change API semantics in this scope. Clarify docs/management representation as assigned; future richer state needs explicit bind/readiness evidence and a compatible API decision. | Changing public field meaning or claiming BOUND without handshake would be incorrect and could misroute discovery. |

No application-specific workaround should be added to ARM. ARM's configured `PORT` precedence and dynamic fallback match documented behavior. EServer port intent should use the already supported key `PORT` if a fixed singleton port is desired; whether these services are fixed-port or Supervisor-dynamic remains an operator/application deployment decision. `ESERVER_PORT` alone is not an ARM port request under the current contract.

## 7. Bounded remediation options and recommendation

### Network binding

1. **Current supported config:** none for AS. `HOST` is unsupported; setting it is ineffective.
2. **Add configurable host, compatibility default:** add optional `HOST`/`BIND_HOST` (owner decision on name) to AS resolution and thread it to `server.listen(port, host)`. Configure `127.0.0.1` for this isolated deployment. This is the recommended smallest safe correction; preserve wildcard default in this release line unless owners approve a default change.
3. **Change default to loopback:** safer for local-only deployments but externally visible; requires explicit compatibility approval and release notes.

### Port ownership

1. **Application-owned fixed singleton ports (recommended for NM.3.3 verification):** add `PORT=3002` and `PORT=3012` to the two application configuration files. This uses current ARM and EServer contracts and requires no source or package change. Revalidate port availability and ARM claims first. Remove/ignore the redundant `ESERVER_PORT` setting only through a separately approved config edit; since EServer checks `PORT` first, it can be retained without effect.
2. **Supervisor-managed dynamic ports:** remove expectations for fixed 3002/3012, let ARM inject its assigned `PORT`, and require EServer to honor it (which it already does). Update service consumers/discovery and verification criteria to use the assigned endpoint. EServer restart may receive a different port; clients must rediscover.
3. **Alternative explicit owner key or configurable ownership mode:** unnecessary for current need. Consider only if a named contract must distinguish desired port from runtime injected `PORT` or reconcile fixed/Blue-Green operation. Requires architecture approval and shared manifest/API semantics; not recommended now.

### Metadata

Retain endpoint state `ASSIGNED`; never treat it as BOUND/READY. Clarify bare management `process.port` docs. Any future `BOUND` claim needs a child readiness/bind handshake or trusted socket verification and API contract review.

## 8. Decisions, impact, verification, blockers

Required before remediation:

- AS owner chooses bind-host variable/name and approves preserving wildcard as default versus changing the default. To meet current loopback safety requirement, configure loopback explicitly after implementation exists.
- Deployment owner confirms EServers are intended fixed singleton ports 3002/3012 (recommended here) versus dynamically assigned services with discovery.
- ARM owner confirms the API's `process.port` remains assigned metadata and whether management docs should explicitly label it; no public contract change is proposed.

Release and verification impact:

- AS bind fix requires AS source changes, focused config/lifecycle/bound-address tests, a rebuilt AS package, and a new immutable unused release version. Do not overwrite 1.1.0.
- EServer fixed ports require per-app ARM configuration changes only (`PORT` keys); no EServer source or package change. Activation need not change because the lifecycle manager rereads config when creating the start spec; a process must be started only after authorization, and actual port/bind and collision checks repeated.
- Dynamic EServer option needs no package change but requires updated deployment expectations and discovery/reconnect verification.
- `process.port` documentation clarification requires ARM docs only. A real metadata semantic change would require ARM source/API tests and a compatibility decision; it is not recommended as part of this remediation.
- After an approved AS source/package version and selected port ownership are implemented, repeat isolated install/activation as needed for the new immutable release, then runtime bind/port verification, AS-to-CDC, EServer/SPA registration, auth, supervision, lifecycle reconnect and state-isolation checks. Re-run focused tests for changed areas only; no such tests were run for this read-only analysis.

Remaining blocker: operator/architecture-owner decisions and implementation authorization. All managed apps must remain stopped until the AS bind issue is corrected and the fixed-versus-dynamic EServer port ownership is selected. No implementation is started by this report.
