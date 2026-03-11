# Progress

Date: March 10, 2026

## Current state

Builder continuity is stable and should stay frozen unless a real defect appears.
Canon now has an explicit boundary and approval surface.
The board has been corrected so world foundation comes before canon content and simulation.
Builder continuity now has a verifiable startup adapter instead of relying on copied pieces with no assembly path.
Codex new-chat continuity now has a real auto-load bridge through a generated root `AGENTS.md` snapshot.
World foundation has moved out of one growing brief and into a small indexed `world/` tree with short files.

What exists on purpose:

- exact Hermes operator memory for builder continuity only
- one tested builder-continuity prompt assembly path for memory plus project context
- one Codex sync bridge that mirrors Hermes memory into the root `AGENTS.md`
- one validated todo board
- project context loading
- the rebuild blueprint in `docs/redesign.md`
- the canon boundary in `docs/canon-engine.md`
- indexed world foundation files under `world/`
- selection guidance in `world/foundation/INDEX.md` so future orchestrators can load the right leaf files cheaply
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

Start from the new `world/` structure rather than expanding `docs/world-foundation.md`.

Best next anchor:

- keep building the threshold hub as the first concrete place

That next chat should stay small and writing-led:

- give the threshold hub a public image, internal faces, and likely social pressures
- decide whether to name it yet
- use it to reveal the first important place and the first clear contrast between center and frontier
- avoid drifting into runtime, NPC-agent design, or canon implementation

Use the result to make the next canon-content slice possible.

## Handoff note

Keep model lanes swappable. Current thinking is OpenAI/Codex for build and canon work, with a separate future runtime-social lane if needed; GLM-5 via OpenRouter is a current candidate based on user testing, but not a locked foundation decision.
Reviewer passes on the world-file structure were positive: keep the current indexed markdown layout, keep files short, and avoid custom orchestration machinery until real pain appears.
