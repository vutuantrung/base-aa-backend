# R7.10.C — Feature-Mode Scope Reassessment

**Status:** decision proposal; no runtime work authorized. **Committed source baseline:** `3af7920814e2260ae3cdfeef220ef75fbea0daeb` (`main`). The R7.10.A/B decisions and characterization are committed evidence; this checkpoint does not revise them.

## Evidence classification

- **Source-confirmed:** `src/config/configuration.ts` uses exact string `'1'` for the peer and SQLite env flags; peer mode populates both top-level/nested fields and default PServer config. `createApplication` consumes the nested peer flag and defaults omitted SQLite to enabled. `startApplication` passes nested config to construction, invokes `onCreated`, registers the example from the top-level flag, then calls `listen`. M05 composes the peer namespace/workflows from nested mode; M03/M04 connector construction requires that gateway plus PServer config; `connect()` occurs later in startup. R7.8’s bounded lifecycle-to-example edge is explicit and accepted.
- **Test-observed:** committed R7.10.B resolver and direct-start cases include exact env value representatives, factory SQLite overloads, connector construction/disconnected state, both top/nested mismatch directions, callback/registration/listen ordering, and a local `/peers` connection. The B Full and serial evidence is committed and reports 259/259 backend plus 32/32 playground with zero skips. These are local tests, not deployment or external-peer evidence.
- **Historical accepted decisions:** R7.8 C-D01/02/03=A preserves the static example import, direct-start implicit registration, callback-before-registration-before-listen, and app-local registry. R7.9 RC-D03=A preserves gate/default behavior; M02 extraction is DEFERRED—EQUIVALENCE NOT PROVEN. R7.10.A AS-D01=A sets an evidence-backed ownership objective; AS-D02=B authorized R7.10.B characterization; AS-D03=A preserves classifications; AS-D04=A requires separate implementation approval; AS-D05=A scoped sets proportional evidence; AS-D06=A requires bounded owner decisions.
- **Unknown external evidence:** production CLI configurations, direct external `createApplication`/`startApplication` callers, package/deployment channels, operator requirements, downstream peer versions, and product ownership. `package.json` is `private` and has no `exports` map, while README documents direct embedding and CLI use; neither fact establishes the complete supported-consumer set.
- **Proposal:** freeze the characterized feature semantics as the current compatibility baseline. This closes only the question “is the observed flag divergence itself a demonstrated defect?” It does not close TD16 or certify every deployment combination.

## Reassessment of A — preserve feature-mode behavior

R7.10.B found **no named material behavioral defect** requiring another feature-mode test or a gate redesign. The exact-string behavior, distinct top-level/nested consumers, CLI PServer defaults, factory/resolved SQLite defaults, and demo registration order are source-confirmed and representative cases are test-observed. The reverse top=false/nested=true case is intentionally constructible and was exercised through local `/peers`; it did not justify normalizing the fields.

The remaining gaps are external or broader than this compatibility question: actual deployed environment values, external caller inventory, product ownership, remote PServer behavior, and deployment/runtime support. A single direct-start true/true end-to-end mode was not added as a separate test; existing factory, resolver, lifecycle and demo evidence cover its components. No source evidence indicates a conflicting behavior or known user impact. Additional Cartesian characterization would add little decision value without a specific caller or contract question.

**Recommended disposition:** preserve and treat the current feature-mode semantics as compatibility constraints. Make no further technical change under this topic. Keep TD16 **OPEN** because its broad gate/ownership/external-caller questions remain unresolved; do not label it remediated or infer product ownership.

## Frozen behavior and hard boundaries

1. `ENABLE_TEST_PEERS` and `ENABLE_SQLITE` are true only for exact string `'1'`. The CLI resolver sets top and nested peer flags together and supplies default PServer config only in peer mode.
2. Direct `createApplication` uses nested `ApplicationConfig`, defaults SQLite on if omitted, and never implicitly registers the example. A `ResolvedConfiguration` from `resolveConfiguration({})` explicitly has SQLite disabled before `startApplication` constructs the app.
3. The nested peer flag controls peer-gateway/`/peers` and M12/M13 composition plus the precondition for connector construction. The top-level peer flag controls demo registration. Both mismatch modes remain supported.
4. PServer connector construction does not mean `connect()` ran or that a session became ready. Local/mock evidence is not production PServer evidence.
5. `onCreated` runs before conditional demo registration; registration is before `listen`. The per-app `TransformationRegistry` and explicit static lifecycle→example edge remain accepted.
6. SQLite-disabled repository handles are absent, but route/auth/status and public `/health` behavior remain as characterized. `/health` is not readiness.
7. Preserve public application handles and overloads, ACK/error precedence, persistence paths/schema, startup rollback, bounded shutdown, late-settlement/writer ownership, legacy aliases and test selection.

Also preserve R7.5 P01–P06 receipt/ACK/uncertain-delivery/lock/quota limits, R7.6 D01–D06 admission/deadline/rollback/late-mutation rules, R7.7 55-entry manifest/serial backend/additive profiles/separate playground/unknown rows, and R7.9 approved RC/FI policies.

## No-go rationale

- Do not combine or rename feature gates, alter defaults, move example registration, add a capability facade, or change API/version contracts based only on naming, module size or local test convenience.
- Do not reclassify M12/M13 (**TBD**) or M14/M15 (**APP**). Do not resume M02 extraction; its R7.9 state remains **DEFERRED — EQUIVALENCE NOT PROVEN**.
- Do not infer external non-use from local grep, `private: true`, lack of an exports map, or no visible deploy manifest.
- F1 independent DB reopen does not prove release of the original SQLite handle. F2 asynchronous socket-close completion remains **NOT PROVEN**. Historical 254/255 failures remain unattributed; the earlier focused-pass/Full-fail discrepancy remains unresolved. No production, power-loss, exactly-once or remote deduplication guarantee is established.

No test, source, configuration, debt status or ownership change is proposed by this disposition.
