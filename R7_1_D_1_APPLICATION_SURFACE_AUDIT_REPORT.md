# R7.1.D.1 — Application Surface & Consumer Audit

## Scope and result

- Audit-only at base HEAD `41d7215e98b85e46bfaa7a270280c9ebd2e91dad` on `main`; no source, test, package, schema, or configuration changes.
- Traced `createApplication`, all three overloads, `ApplicationInstance`, `ApplicationConfig`, `startApplication`, `stopApplication`, inferred return consumers, and actual property accesses in tracked source/tests/testing/examples/README.
- Full evidence matrix for all 11 return properties, all 8 config fields, ownership, types, optionality, consumer/method evidence, ports, risks and D.2 recommendations: [APPLICATION_SURFACE_INVENTORY.md](docs/architecture/APPLICATION_SURFACE_INVENTORY.md).

## Findings

- Runtime overload behavior: omitted/true SQLite opens M17 and returns statically non-optional concrete repositories; false returns undefined repositories; a dynamic boolean uses broad optional `ApplicationInstance`. Enabled open throws if the optional SQLite driver is unavailable. `startApplication` accepts resolved boolean config and returns broad `ApplicationInstance`.
- The PServer connector is created only when both the M05 peer gateway (gated by `enableTestPeers`) and `pserver` config are present. `stopApplication` intentionally depends only on `{ close }`.
- Tracked usage exists for transformation registration, session/usage repository methods, all five catalog upserts plus read methods, PServer connection state, and listen/close. No tracked app-property access was found for `httpServer`, `router`, `routes`, or `sender`; this does not establish external non-use.
- M14 `SessionRepository`, M15 `ProcessUsageRepository`, and M16 read-only `AaCatalogRepository` are existing HTTP injection ports. Catalog app tests and README use concrete upserts; no catalog writer port is justified by this audit. Concrete repository classes have private DB members, so changing exposed types can break class identity/assignment consumers.
- M02 constructs concrete classes intentionally; construction does not prove each concrete public type is required. The late-bound router closure is documented without redesign.

## D.2 recommendation and approval

- Recommended baseline: retain the current properties, types, optionality and overloads. An additive consumer-driven capability view is an alternative only if a real consumer identifies a need. Narrow/remove behavior requires explicit compatibility approval; no decision is made here.
- D.2 acceptance should cover omitted/true/false/dynamic SQLite typing and runtime, repository presence/isolation and catalog writers/readers, peer connector present/absent combinations, lifecycle listen/close, and close-only `stopApplication` input.
- No new ADR or resolution of TD01 is claimed. APP/DEMO TBD, shutdown drain, HTTP semantics, gateway composition, M10/M11 and dependency enforcement stay out of scope.

## Verification

- Node 22.23.5: typecheck and build passed; serial backend **145/145**; playground **32/32 individual cases**; diff check passed. Zero skipped/cancelled cases.
- Backend used approved loopback access. No production endpoints/data were used.
- The playground command reported 32 tests on this run; the earlier five-file-entry discrepancy did not persist.
- Only documentation files were changed; the supplied untracked prompt was preserved. No commit or push.

## Next step

Await review/explicit authorization before R7.1.D.2. No implementation was started.
