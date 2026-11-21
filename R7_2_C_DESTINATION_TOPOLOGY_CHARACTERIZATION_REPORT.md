# R7.2.C — Destination Topology During Async Transformation

## Baseline and scope

- Branch `main`, starting HEAD `3d449f36eccf3b17fe95729ddc2a85b718fd8529` (expected). Working tree was clean except task prompts.
- Production source, public contracts, ACK mappings, M05/M06 lifecycle, TD02 and TD03 were not changed.
- Changed: `tests/peer-destination-policy.test.ts`; TD04 in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` and `docs/architecture/TECHNICAL_DEBT.md`; current R7.2 checkpoint in `docs/architecture/PROJECT_STATE.md`; this report.

## Deterministic method

Tests integrate `PeerMessageService`, `PeerDestinationPolicy`, a mutable real `PeerDirectory`, `TransformationRegistry`, and a physical socket-delivery recorder. A registered async transformer signals when reached (after initial validation) and waits on a manually resolved promise. Each test mutates directory state while that promise is held, then resolves it and awaits the final `processPeerMessageForAck` ACK. No sleeps, sockets, network, production data, or timing assumptions are used.

## Scenario evidence

| Scenario | Initial / suspended state and mutation | Observed final result |
|---|---|---|
| Stable explicit target | `worker-1/socket-old`; explicit `toInstanceId=worker-1`; transformer held; no topology change | Success ACK; one delivery to `socket-old`; explicit logical instance and transformed payload/processing metadata preserved. |
| Disconnect during transform | `worker-1/socket-old`; explicit target; remove that exact identity while held | `{ok:false, code:DESTINATION_OFFLINE, error:'Destination eserver is offline'}`; zero physical deliveries. |
| Same logical instance replacement | `worker-1/socket-old`; explicit target; remove old ID, register `worker-1/socket-new` while held | Success ACK; late lookup sends to `socket-new`; `toInstanceId` remains `worker-1`. This is observed late binding, not an affinity recommendation. |
| Untargeted target becomes ambiguous | Sole `worker-1/socket-one`; hold transform; add `worker-2/socket-two` | `{ok:false, code:DELIVERY_FAILED, error:'Destination eserver is offline'}`; zero delivery. Post-transform `has(eserver)` succeeds, then late policy lookup cannot select exactly one instance and throws; M10 maps it to `DELIVERY_FAILED`. |
| Ambiguity exists before processing | `worker-1` and `worker-2` both present before call | `{ok:false, code:AMBIGUOUS_DESTINATION, error:'Multiple EServer instances connected; toInstanceId is required'}`; zero delivery. This contrasts with ambiguity created after initial validation. |
| Untargeted sole-instance replacement | Sole `worker-1/socket-old`; hold transform; remove it and add sole `worker-2/socket-new` | Success ACK; current late lookup routes to `socket-new`; message remains untargeted (`toInstanceId` absent). |

## Policy questions left open

- **Affinity:** should delivery bind to original physical socket, logical EServer instance, or latest matching identity at delivery time?
- **Untargeted semantics:** may an untargeted message validated while one EServer exists follow a different sole logical instance after topology replacement?
- **Error classification:** should ambiguity created during transform remain `DELIVERY_FAILED` or be revalidated and return `AMBIGUOUS_DESTINATION`? No ACK contract was changed.
- **In-flight delivery:** this transform/topology window is distinct from TD03 cancellation. C does not cancel a delivery already sent while its socket ACK is pending.

These tests establish deterministic service/policy/directory behavior. They do not establish how often or whether real production socket events interleave with transformations in these exact ways. No policy is selected; no TD04 remediation was performed.

## Verification (Node 22.23.5)

- `node --import tsx --test tests/peer-message-service.test.ts tests/peer-destination-policy.test.ts`: **both files passed**. Case-level reporter showed 2 top-level file subtests; the two files contain and ran 20 `node:test` cases (10 each).
- `npm run check:architecture`: **PASS**; 52 files, 113 edges (51 runtime / 62 type-only), zero runtime file SCCs; one module runtime SCC reported.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- `npm test -- --test-concurrency=1`: **172/172 passed**.
- `npm --prefix testing run test:playground`: **32/32 passed**.
- `git diff --check`: pending final check.

Typecheck/build printed sandbox stream-descriptor warnings but both exited 0. No loopback or network test was required.

Stop for architectural review. No commit/push; no R7.3.
