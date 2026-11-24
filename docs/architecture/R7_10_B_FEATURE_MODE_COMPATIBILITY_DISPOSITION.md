# R7.10.B — Feature-Mode Compatibility Disposition

**Disposition:** observed feature-mode differences are intentional, source-supported compatibility behavior. No defect or redesign is identified by this characterization. This checkpoint adds evidence only; no implementation is authorized.

## Observed constraints

1. CLI gates compare exactly to string `'1'`. The resolver maps `ENABLE_TEST_PEERS` to both top-level and nested booleans and injects PServer defaults only when enabled. `ENABLE_SQLITE` is an independent exact-string gate.
2. Raw `createApplication` has a different SQLite default from CLI-resolved application configuration: omission enables SQLite at the factory, while `resolveConfiguration({})` sets false before `startApplication` calls the factory.
3. The nested `application.enableTestPeers` controls M05 peer gateway, `/peers`, workflow composition and eligibility for PServer connector construction. The top-level `enableTestPeers` controls M02 lifecycle example-rule registration.
4. Both mismatched programmatic combinations are valid. top=true/nested=false registers the per-app demo rule without peer gateway or connector; top=false/nested=true composes/starts peer gateway and workflows without demo registration, and can operate without PServer config.
5. PServer config enables only connector construction when the nested peer gateway is enabled. It is not proof of a successful connection: `connect()` occurs during startup after gateway start/listen/activation, and readiness depends on external transport/session behavior.
6. Direct `createApplication` never implicitly registers the example. Direct `startApplication` calls `onCreated`, optionally registers from the top-level flag, then calls `listen`. The static lifecycle→example edge and per-application registry remain accepted by R7.8 C-D01/02/03=A.
7. SQLite-disabled repository handles are absent, but HTTP route registration, `/health`, auth order and disabled-path responses retain the existing API behavior.

These findings do not suggest normalization. They are the approved historical distinctions in R7.8 and R7.9; changing them would require a separate explicit compatibility decision.

## Residual uncertainty and no-go boundaries

- No production CLI process or real PServer was started. Resolver tests do not prove deployed env wiring or remote connection/session semantics.
- External direct callers, operator configurations, and package consumers remain unknown. Absence from local grep is not proof of absence.
- Public API does not expose internal workflow object identity or runner construction/activation state; no production seam was added to expose it.
- F1 original SQLite native handle release remains unproven; F2 asynchronous socket close remains NOT PROVEN. This mode matrix does not expand R7.9 cleanup proof.
- M12/M13 remain TBD; M14/M15 APP; no ownership/debt status changed. TD16 remains OPEN because broad gate, caller and workflow-ownership questions remain beyond this matrix. TD15/TD17 and other debt remain open.
- Preserve R7.5 receipt/ACK/uncertain delivery, retry/lock/quota and power-loss limits; R7.6 shutdown/admission/deadline/writer ownership; R7.7 55-file manifest/serial command/profiles/playground/unknown rows; and R7.8 gates, public handles, `/health`, auth/status and demo registration contract.

## Future owner choices (not approved by this disposition)

Further work would need a separate owner decision selecting one of: (A) retain the characterized compatibility behavior and take no action; (B) gather operator/caller/product evidence for a named deployment mode; or (C) propose a specifically versioned compatibility change with external caller inventory, migration plan, rollback and full proof. Option C is not supported by this evidence alone. No R7.10.C or R7.11 activity is authorized.

**Stop:** provide the matrix and verification report to the Architecture Owner. This assessment is not permission to normalize flags, refactor M02, reclassify modules, or change APIs.
