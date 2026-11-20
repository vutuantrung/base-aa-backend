# Repository coding instructions

## TypeScript: avoid unnecessary type assertions

- Prefer TypeScript's natural type inference and contextual typing. Do not add `as const`, `as SomeType`, or other type assertions when they are not needed.
- For a fixed list used only by a Zod enum, pass the literal directly to `z.enum(['eserver', 'sserver', 'aaui'])` rather than creating a separate `as const` array.
- For object literals, use plain values such as `peerId: 'eserver'` and `status: 'online'` when a narrowed literal type is not required. If a precise public contract is needed, prefer an explicit type annotation or `satisfies` to a redundant assertion.
- Retain necessary literal narrowing (including `as const` for shared tuple-derived union types or discriminants when appropriate) if removing it would weaken type safety or alter an existing contract. Prefer a simpler equivalent type-safe declaration when available.
- Never replace an assertion by `any` or broaden a contract to silence the compiler. Run `npm run typecheck` and relevant tests after changing types.
- Apply these rules when generating, reviewing, or refactoring code. Keep changes scoped to the requested work; do not perform blanket assertion removal.

## Agent execution and context reuse

- Read `docs/architecture/PROJECT_STATE.md` once at task start. Follow applicable nested instructions. Open other architecture documents only at relevant sections, not by default.
- Check local branch, HEAD and `git status --short`; compare with the recorded source baseline. A docs-only descendant is not an implementation change. Review relevant unexpected deltas; stop on incompatible drift. Never reset, stash, overwrite unrelated changes or switch branches without authorization.
- Prefer `git diff --name-only`, targeted `rg`, and bounded file reads. Reuse verified checkpoint facts unless affected by changes, missing evidence or contradictions. Current source/tests outrank summaries for implemented behavior; explicit approved decisions outrank implementation accidents for intended architecture. Do not repeat missing-file searches unless new evidence warrants them.
- Favor intent-revealing names and Extract Method where useful. Avoid speculative layers, broad generic contracts and unrelated cleanup. Preserve external contracts, data and unresolved APP/DEMO functionality. Behavior changes require explicit scope/approval.
- Run focused tests while editing; at checkpoint exit run typecheck, build, complete backend and playground suites, and diff check. Use Node 22.23.5 for baseline comparisons; use local mocks, temporary data paths and loopback listeners. Never contact production services or modify existing runtime data. Capture logs locally; print summaries and relevant failure excerpts. Do not weaken tests or mark unrun checks PASS.
- If local listener tests fail with sandbox `listen EPERM`, request narrowly scoped authorized execution for those tests; do not bypass approval or alter tests to work around the restriction.
- At exit, write a compact delta report (aim 50–100 lines, shorter if sufficient), recording changed files, decisions, verification counts, failures, blockers and next step. Update PROJECT_STATE.md and only affected architecture/debt sections. Use links instead of copying historical reports. Record tested source HEAD plus dirty-diff status before commit; never invent a future SHA. Do not commit/push or advance phases without authorization.
