# Progress

Date: March 11, 2026

## Current state

The repo still has a small operator-continuity surface, but it is now guarded more explicitly.
Builder continuity in this repo is described honestly as a file-backed Hermes-derived memory store plus the synced root `AGENTS.md` snapshot.
No separate live Codex session-integration layer for memory was found in the repo itself.

The `world/` tree now has a small structural guard:

- `npm run check:world` verifies that every world file is listed in its nearest index
- every directory under `world/` that holds files must have its own `INDEX.md`
- every index entry must point to a real file
- Markdown files over 100 lines fail unless they carry a small explicit `<!-- world-check: max-lines=NNN -->` exception near the top
- the checker already tolerates future `world/canon/`, `world/runtime/`, and `world/player/` siblings, and leaves one small place to add canon-only rules later

Memory guidance is also tighter now:

- the repo-local `skills/memory-hygiene/` skill exists
- the memory tool guidance now pushes memory toward durable user preferences, workflow rules, and hard-to-rediscover environment facts
- it now explicitly rejects world lore, handoff notes, completed-task diary entries, and routine repo facts that already live in tracked files

World foundation still lives in a small indexed `world/` tree, and the threshold hub remains the best next content anchor.
The threshold hub still has its stronger working shape: public image, internal faces, social pressures, one first local anchor, and one first outward direction.
That outward direction is still clear in working design: one large central island gives way to a hard first belt of smaller islands and straits, then to farther larger lands spaced far enough apart to keep the world widening in layers.

What exists on purpose:

- adapted Hermes-derived file-backed operator memory for builder continuity only
- one small builder-continuity adapter centered on Hermes memory status and root `AGENTS.md` sync
- one validated todo board
- one `check:world` guard for the indexed world tree
- the memory-hygiene skill under `skills/memory-hygiene/`
- the architecture note in `docs/architecture.md`
- the canon boundary in `docs/canon-engine.md`
- indexed world foundation files under `world/`
- selection guidance in `world/foundation/INDEX.md` so future orchestrators can load the right leaf files cheaply
- a more concrete threshold-hub brief in `world/foundation/threshold-hub.md`
- a dedicated outward-direction note in `world/foundation/outer-island-belt.md`
- schema checks in `src/canon/canon-schema.js`
- regression coverage for the continuity surface, memory-tool guidance, and world checker
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
- World knowledge belongs in `world/`, not in Hermes memory.
- Handoff state belongs in `progress.md` and `todo.json`, not in memory.
- Canon changes require explicit approval.
- World canon must stay reviewable.
- Runtime beliefs are not canon.
- Session chatter is not canon.
- New systems must stay smaller than the ones they replace.

## Next slice

Return to the threshold-hub institution slice now that the cleanup guardrails are in place.

Start from `world/INDEX.md`, `world/foundation/INDEX.md`, and `world/foundation/threshold-hub.md`.

Best next anchor:

- define one local institution in the threshold hub that turns inland legitimacy and lived frontier competence into daily social reality

That next chat should stay small and writing-led:

- keep using the threshold hub as the bridge between center and frontier
- stay on one sub-slice at a time instead of reopening the whole foundation board
- let the outward island-belt shape stay background context rather than reopening map design
- avoid drifting into runtime, NPC-agent design, or canon implementation

Use the result to make the first canon-content slice easier to write.

## Handoff note

- Run `npm run check:world` whenever `world/` files or indexes change.
- Keep one `INDEX.md` per populated world directory so parent indexes can stay shallow.
- If a world Markdown file truly needs to exceed 100 lines, use a tight inline exception like `<!-- world-check: max-lines=118 -->` near the top.
- The repo’s current memory reality is file-backed `MEMORY.md` and `USER.md` plus synced `AGENTS.md` snapshot continuity. Do not describe it as a richer live repo-integrated memory system unless new wiring is actually added.
- The old `src/context` project-context prompt assembly path is gone. Do not re-add a second repo-side injection path unless AGENTS auto-load shows a real failure.
- Prompt safety still guards Hermes memory entries before they are mirrored into `AGENTS.md`.
- The continuity wrapper scripts in `tools/` must stay for now because an external automatic continuity trigger still calls them directly. They are compatibility entry points even though the real logic lives in `python -m tools.builder_continuity sync-agents`.
- Keep model lanes swappable. Current thinking is OpenAI/Codex for build and canon work, with a separate future runtime-social lane if needed; GLM-5 via OpenRouter is a current candidate based on user testing, but not a locked foundation decision.
