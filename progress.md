# Progress

Date: March 11, 2026

## Current state

The repo now has a smaller operator-continuity surface.
Hermes memory still provides builder continuity, and the only repo-side continuity bridge is the synced snapshot in the root `AGENTS.md`.
The redundant project-context prompt assembly path is gone.
Canon still has an explicit boundary and approval surface, but it does not yet have a real indexed canon store or authoring workflow.
World foundation still lives in a small indexed `world/` tree, and the threshold hub remains the best next content anchor.
The threshold hub still has its stronger working shape: public image, internal faces, social pressures, one first local anchor, and one first outward direction.
That outward direction is still clear in working design: one large central island gives way to a hard first belt of smaller islands and straits, then to farther larger lands spaced far enough apart to keep the world widening in layers.

What exists on purpose:

- adapted Hermes-derived operator memory for builder continuity only
- one small builder-continuity adapter centered on Hermes memory status and root `AGENTS.md` sync
- one validated todo board
- the architecture note in `docs/architecture.md`
- the canon boundary in `docs/canon-engine.md`
- indexed world foundation files under `world/`
- selection guidance in `world/foundation/INDEX.md` so future orchestrators can load the right leaf files cheaply
- a more concrete threshold-hub brief in `world/foundation/threshold-hub.md`
- a dedicated outward-direction note in `world/foundation/outer-island-belt.md`
- schema checks in `src/canon/canon-schema.js`
- a small regression test that catches stale operating-surface language and the removed loader path
- no repo-local legacy sqlite stores or browser dump folders
- no redundant repo-side project-context prompt assembly layer

What canon means in this repo right now:

- approved world facts only
- entities, locations, factions, timelines, rules of reality, and approved events
- explicit `canon_change` approval before a change can count as canon
- no builder memory, transcripts, or runtime beliefs mixed into world truth

What is still not built:

- first specific named major places, groups, and people
- a completed world foundation strong enough to guide canon content cleanly
- a real indexed canon store or authoring workflow beyond the minimal boundary
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

Return to the threshold-hub institution slice now that the continuity cleanup is done.

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

- The old `src/context` project-context prompt assembly path is gone. Do not re-add a second repo-side injection path unless AGENTS auto-load shows a real failure.
- Continuity now means Hermes memory plus the synced root `AGENTS.md` snapshot, with `progress.md` and `todo.json` as the handoff and planning files.
- The repo now has a small regression check that fails if the old operating-language surface, the old architecture-doc path, or the removed loader path comes back.
- Keep model lanes swappable. Current thinking is OpenAI/Codex for build and canon work, with a separate future runtime-social lane if needed; GLM-5 via OpenRouter is a current candidate based on user testing, but not a locked foundation decision.
- Keep the current indexed world-file layout, keep files short, and avoid orchestration machinery until real pain appears.
- Treat the working label `Return Steps` as provisional until regional naming texture is clearer.
- Prompt safety now guards Hermes memory entries before they are mirrored into `AGENTS.md`.
- The todo validator now requires at least one active item id and keeps `now` items aligned with `delivery.active_item_ids`, so slice boundaries should stay anchored in one place.
- The continuity wrapper scripts in `tools/` must stay for now because an external automatic continuity trigger still calls them directly. They are compatibility entry points even though the real logic lives in `python -m tools.builder_continuity sync-agents`.
- The current active work should return to the threshold-hub institution slice.
- The recent agent-architecture review mostly reinforced the current repo shape. The one keeper is a future governed world-tool boundary: treat Codex as the working surface, keep canon as controlled world truth, and make durable world writes flow through explicit proposals and approvals instead of chat context.
