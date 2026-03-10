# Progress

Date: March 10, 2026

## Current state

Builder continuity is stable and should stay frozen unless a real defect appears.
Canon now has an explicit boundary and approval surface.
The board has been corrected so world foundation comes before canon content and simulation.

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

- a world foundation brief strong enough to guide canon content
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

Collaboratively define the world foundation before any simulation work starts.

This slice should stay small and writing-led:

- core premise
- tone and writing feel
- natural conflicts and tensions
- basic rules of reality
- timeline anchor
- first important places, groups, and people
- a short list of things that should stay unknown for now

Use the result to make the next canon-content slice possible.
