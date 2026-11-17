# Repository coding instructions

## TypeScript: avoid unnecessary type assertions

- Prefer TypeScript's natural type inference and contextual typing. Do not add `as const`, `as SomeType`, or other type assertions when they are not needed.
- For a fixed list used only by a Zod enum, pass the literal directly to `z.enum(['eserver', 'sserver', 'aaui'])` rather than creating a separate `as const` array.
- For object literals, use plain values such as `peerId: 'eserver'` and `status: 'online'` when a narrowed literal type is not required. If a precise public contract is needed, prefer an explicit type annotation or `satisfies` to a redundant assertion.
- Retain necessary literal narrowing (including `as const` for shared tuple-derived union types or discriminants when appropriate) if removing it would weaken type safety or alter an existing contract. Prefer a simpler equivalent type-safe declaration when available.
- Never replace an assertion by `any` or broaden a contract to silence the compiler. Run `npm run typecheck` and relevant tests after changing types.
- Apply these rules when generating, reviewing, or refactoring code. Keep changes scoped to the requested work; do not perform blanket assertion removal.
