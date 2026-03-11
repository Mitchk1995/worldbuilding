# Worldbuilding

This repository keeps the minimum durable shape needed to keep the living-world platform moving without drift.

What remains:

- the adapted Hermes-derived operator memory module
- one builder-continuity adapter that assembles Hermes memory snapshots plus project context
- one Codex bridge that mirrors Hermes memory into the repo root `AGENTS.md` for new-chat auto-load
- one structured todo board
- project context loading
- a first-principles architecture note
- a canon boundary document plus schema checks
- an indexed `world/` tree for the working foundation

The Hermes module is only for builder continuity. World canon and world runtime are separate future systems.
World foundation work now starts from `world/INDEX.md` and `world/foundation/INDEX.md`.

Direction changes now belong in the todo board and progress record instead of getting lost in one long chat.
Each chat should handle one small slice, stop at a clean point, and leave the next slice readable.
The board is validated with `npm run check:todo` before normal work.

Everything else should earn its way in.
