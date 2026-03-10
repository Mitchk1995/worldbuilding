# Canon Engine Boundary

This slice defines the boundary for canon. It does not build the world runtime, NPC memory, or player embodiment.

## What canon is

Canon is the small, reviewable record of approved world truth.

Only these kinds of things belong in canon:

- entities
- locations
- factions
- timelines
- rules of reality
- approved events

Each canon collection should stay keyed by stable id so a future diff shows exactly what changed.

## What canon is not

These do not belong in canon:

- Hermes builder memory
- project instructions, `AGENTS.md`, `progress.md`, and `todo.json`
- raw transcripts and brainstorming
- retrieval output treated as truth
- runtime beliefs, rumors, plans, scene state, or emotional state
- player-facing continuity unless a later slice explicitly promotes it through an approved canon change

## Smallest clean approval flow

1. Draft a `canon_change` with a short summary, a reason, and explicit operations against canon collections.
2. Keep it in `proposed` until someone explicitly marks it `approved` or `rejected`.
3. Only an `approved` change may be applied to canon.
4. Rejected or abandoned proposals are not canon and do not need permanent storage.

This keeps approval explicit without adding dashboards, ledgers, or fake governance.
Direct edits to a future canon document are only working drafts until an approved `canon_change` applies them.

## Separation rules

- Builder continuity lives in Hermes memory and project context files. Canon does not treat those as world truth.
- Runtime can read canon, but runtime beliefs cannot write themselves back into canon.
- If runtime uncovers something that should become world truth, it has to come back as a new proposed canon change.
- Transcripts can be evidence for a proposal, but they are never canon by default.
- Canon records themselves should stay fact-shaped. Do not hide rumors, scene state, transcript excerpts, or other temporary runtime material inside otherwise valid canon entries.

## Minimal surface added in this slice

- `src/canon/canon-schema.js`: tiny validation rules for canon documents and canon changes
- `test/canon-schema.test.js`: checks that the boundary stays explicit

Actual canon storage, authoring tools, and runtime readers come in later slices.
