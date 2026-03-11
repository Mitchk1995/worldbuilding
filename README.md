# Worldbuilding

This repository keeps the minimum durable shape needed to keep the living-world platform moving without drift.

What remains:

- the adapted Hermes-derived file-backed operator memory module
- one small builder-continuity adapter that checks Hermes status and syncs the memory snapshot into the repo root `AGENTS.md`
- one structured todo board
- a first-principles architecture note
- a canon boundary document plus schema checks
- an indexed `world/` tree for the working foundation

The memory setup in this repo is currently file-backed persistence plus `AGENTS.md` snapshot sync.
The raw memory files are the backend builder-continuity source, and the synced `AGENTS.md` block is the default hot layer for startup.
Those raw memory files should only be read directly when memory is being edited or debugged on purpose.
This repo does not currently provide a separate live Codex session-integration layer for memory beyond that continuity path.
The Hermes-derived module is only for builder continuity. World canon and world runtime are separate future systems.
World foundation work now starts from `world/INDEX.md` and `world/foundation/INDEX.md`.

Direction changes now belong in the todo board and progress record instead of getting lost in one long chat.
Each chat should handle one small slice, stop at a clean point, and leave the next slice readable.
The board is validated with `npm run check:todo` before normal work, and `npm run check:world` keeps the world tree indexed and short.

Everything else should earn its way in.
