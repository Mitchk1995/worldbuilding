# Progress

Date: March 11, 2026

## Current state

Builder continuity is stable and should stay frozen unless a real defect appears.
Canon now has an explicit boundary and approval surface.
The board has been corrected so world foundation comes before canon content and simulation.
The active foundation work is now split into smaller threshold-hub sub-slices so each chat can stay narrower and more directional.
Builder continuity now has a verifiable startup adapter instead of relying on copied pieces with no assembly path.
Codex new-chat continuity now has a real auto-load bridge through a generated root `AGENTS.md` snapshot.
The cleanup pass now also removes one duplicated continuity load path, moves memory and context safety rules onto one shared source, strengthens the todo guard around active slice ids, and drops old sync-wrapper entry points.
World foundation has moved out of one growing brief and into a small indexed `world/` tree with short files.
The threshold hub now has a stronger working shape: public image, internal faces, social pressures, one first local anchor, and a first outward direction, while the hub itself stays unnamed on purpose.
That outward direction is now clear in working design: one large central island gives way to a hard first belt of smaller islands and straits, then to farther larger lands spaced far enough apart to keep the world widening in layers.

What exists on purpose:

- adapted Hermes-derived operator memory for builder continuity only
- one tested builder-continuity prompt assembly path for memory plus project context
- one Codex sync bridge that mirrors Hermes memory into the root `AGENTS.md`
- one validated todo board
- project context loading
- the rebuild blueprint in `docs/redesign.md`
- the canon boundary in `docs/canon-engine.md`
- indexed world foundation files under `world/`
- selection guidance in `world/foundation/INDEX.md` so future orchestrators can load the right leaf files cheaply
- a more concrete threshold-hub brief in `world/foundation/threshold-hub.md`
- a dedicated outward-direction note in `world/foundation/outer-island-belt.md`
- schema checks in `src/canon/canon-schema.js`
- no repo-local legacy sqlite stores or browser dump folders

What canon means in this repo right now:

- approved world facts only
- entities, locations, factions, timelines, rules of reality, and approved events
- explicit `canon_change` approval before a change can count as canon
- no builder memory, transcripts, or runtime beliefs mixed into world truth

What is still not built:

- first specific named major places, groups, and people
- a completed world foundation strong enough to guide canon content
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

Continue collaboratively defining the world foundation before any simulation work starts.

Start from `world/INDEX.md` and `world/foundation/INDEX.md`.

Best next anchor:

- define one local institution in the threshold hub that turns the tension between inland legitimacy and lived frontier competence into daily social reality

That next chat should stay small and writing-led:

- keep using the threshold hub as the bridge between center and frontier
- stay on one sub-slice at a time instead of reopening the whole foundation board
- let the new outward island-belt shape stay background context rather than reopening map design
- avoid drifting into runtime, NPC-agent design, or canon implementation

Use the result to make the next canon-content slice possible.

## Handoff note

Keep model lanes swappable. Current thinking is OpenAI/Codex for build and canon work, with a separate future runtime-social lane if needed; GLM-5 via OpenRouter is a current candidate based on user testing, but not a locked foundation decision.
Keep the current indexed world-file layout, keep files short, and avoid orchestration machinery until real pain appears.
Treat the working label `Return Steps` as provisional until regional naming texture is clearer.
Builder continuity now uses one shared prompt-safety rule file across Hermes memory loading and project-context loading, so future safety changes should start there instead of in two code paths.
The todo validator now requires at least one active item id and keeps `now` items aligned with `delivery.active_item_ids`, so slice boundaries should stay anchored in one place.
The old continuity wrapper scripts are gone; use `python -m tools.builder_continuity sync-agents` directly if the snapshot ever needs to be refreshed by hand.
The current active work should return to the threshold-hub institution slice once cleanup is complete.
