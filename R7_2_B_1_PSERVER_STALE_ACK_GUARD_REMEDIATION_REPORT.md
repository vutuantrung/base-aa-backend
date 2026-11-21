# R7.2.B.1 — PServer Stale ACK Guard & Readiness Hardening

## Baseline and changed paths

- Branch `main`, starting committed HEAD `9ea072113d636e37e181722c2ec882a832f438fb` (expected). Working tree was clean except this task prompt.
- Changed: `src/modules/pserver/pserver-protocol.ts`, `tests/pserver-protocol.test.ts`, TD03 in `docs/architecture/R7_2_RELIABILITY_RISK_INVENTORY.md` and `docs/architecture/TECHNICAL_DEBT.md`, current checkpoint in `docs/architecture/PROJECT_STATE.md`, and this report. No public interface, event, payload schema or dependency changed.
- TD02 Option B remains selected and OPEN. No M05/M06 or TD04 changes.

## Implementation and behavior

The protocol now keeps a monotonic registration generation. Each `connect` captures a new generation; each `disconnect` invalidates prior callbacks; explicit `close()` invalidates before calling transport close, including custom transports that do not synchronously emit `disconnect`. Fulfillment and rejection callbacks return without state mutation or current-attempt diagnostics when their generation is stale.

One `isSessionReady()` predicate requires both `transport.connected` and `sessionReady`. Public `protocol.connected`, registered gateway `isConnected()`, inbound `peer:message`, task dispatch validation, and outbound delivery use this predicate. Current-attempt missing/negative/rejected resume still leaves readiness false and retains the established ID; a later connect still sends `{ session_id: retainedId }`. No retry, fallback, ID clearing, or takeover was added.

| Case | Before B.1 characterization | B.1 result |
|---|---|---|
| ACK after disconnect, no reconnect | Mutated session ID/internal readiness; public connected false, but protocol gates could still proceed | Stale ACK ignored; ID unchanged, all readiness/gates false |
| ACK1 after connect2 starts | Could ready transport2 and mutate ID before ACK2 | ACK1 ignored; ACK2 alone readies and sets ID |
| ACK2 before ACK1 | Later ACK1 overwrote newer ID | Older ACK ignored; newer ID/readiness retained |
| Stale missing/negative/rejected ACK | Could log or change state for obsolete attempt | No state change or stale failure log |
| Current failed resume after known ID | Unready; old ID retained and reused on next connect | Preserved and explicitly tested |
| `close()` with ACK pending and no disconnect event | Could allow late ACK to re-arm state | Close invalidates ACK; readiness remains false |
| Delivery already sent before disconnect | No cancellation behavior established | Not cancelled by this change; remains a separate risk |

Focused tests also preserve 10,000 ms session ACK timeout, 5,000 ms delivery ACK timeout, event names, VM/resume payload shapes, inbound pre-ready ACK, dispatch validation, no-ACK ingress behavior, and outbound rejection semantics. Fake timing establishes protocol state transitions, not real PServer timing or remote session validity.

## Verification (Node 22.23.5)

- `node --import tsx --test tests/pserver-protocol.test.ts`: **16/16 passed**.
- `npm run check:architecture`: **PASS**; 52 files, 113 edges (51 runtime / 62 type-only), zero runtime file SCCs; one module runtime SCC reported.
- `npm run typecheck`: **PASS**.
- `npm run build`: **PASS**.
- `npm test -- --test-concurrency=1`: **167/167 passed**.
- `npm --prefix testing run test:playground`: **32/32 passed**.
- `git diff --check`: **PASS**.

The initial piped playground summary showed only 5 cases due the reporting command; the exact unpiped command was rerun and passed 32/32. A sandbox stream-descriptor warning appeared during typecheck/build but both commands exited 0.

## Remaining TD03 concerns and stop

Current ACK generation and readiness behavior is covered by deterministic local fakes. Real PServer late ACK timing and rejected-resume semantics remain unverified. This change intentionally does not decide whether the remote protocol should discard or retain a rejected resume ID; current retain-and-resend behavior is preserved. Already-started outbound deliveries are not cancelled or generation-bound. Review these limits before considering TD03 complete.

No commit or push. Stop for architectural review before any further TD03 remediation or R7.2.C.
