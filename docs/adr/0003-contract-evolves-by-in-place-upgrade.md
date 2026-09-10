# Contract evolves by in-place package upgrade; config carries two package ids

The 2026-07-12 v2 deployment (verified note creation) shipped as a Sui in-place package upgrade: `original-id` `0x281ef5…` stays fixed, `published-at` moved to `0x81c221…`. On Sui, move-call targets must use the **latest** published address, while struct/event type identity is anchored **forever** to the package that first defined the type — the original id. Config therefore carries both: `packageId` (call targets, changes every upgrade) and `originalPackageId` (type/object/event filters, never changes). They coincide only on a fresh first publish, which is why a single field worked until v2 and silently broke the dashboard's Note query after it.

## Considered Options

- **In-place upgrade (chosen).** Existing notes keep working against new code because their type never changes. Cost: two ids to wire, and every type-string construction site must use the original id.
- **Fresh republish per change.** One clean id, but every existing `ProductNote` is permanently orphaned from the new code (as happened deliberately in ADR-0001 when upstream froze the old positions anyway). Unacceptable now that live subscriber notes exist.

## Consequences

- Once any note exists on-chain, in-place upgrade is the only non-destructive evolution path; republish means abandoning live positions.
- Do not "simplify" the two ids back into one — type filters built from the latest `packageId` match nothing after the first upgrade. Regression tests pin this (`src/config/anker.test.ts`, `src/sui/ankerPortfolio.test.ts`).
- Types introduced in **later** package versions would be anchored to that version's address, not `0x281ef5…`; if a future module adds new structs/events, their filters need that version's id. None exist as of v2.
