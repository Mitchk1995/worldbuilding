# Progress

Date: March 10, 2026

## Current state

Builder continuity is stable and should stay frozen unless a real defect appears.
Canon now has an explicit boundary and approval surface.

What exists on purpose:

- exact Hermes operator memory for builder continuity only
- one validated todo board
- project context loading
- the rebuild blueprint in `docs/redesign.md`
- the canon boundary in `docs/canon-engine.md`
- schema checks in `src/canon/canon-schema.js`
- no repo-local legacy sqlite stores or browser dump folders

What canon means in this repo right now:

- approved world facts only
- entities, locations, factions, timelines, rules of reality, and approved events
- explicit `canon_change` approval before a change can count as canon
- no builder memory, transcripts, or runtime beliefs mixed into world truth

What is still not built:

- a real canon store or authoring workflow beyond the minimal boundary
- the simulation runtime
- NPC belief or memory systems
- player embodiment

## Non-negotiables

- Operator memory is not world memory.
- Canon changes require explicit approval.
- World canon must stay reviewable.
- Runtime beliefs are not canon.
- Session chatter is not canon.
- New systems must stay smaller than the ones they replace.

## Next slice

Build the smallest simulation runtime boundary that reads canon without overwriting it.

That runtime should stay explicitly ephemeral:

- current scene state
- agent goals
- temporary beliefs
- rumors and plans
- consequences in motion

Start from the canon boundary files instead of inventing new memory machinery.
