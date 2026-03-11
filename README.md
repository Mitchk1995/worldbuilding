# Worldbuilding

This repository keeps the minimum durable shape needed to keep the living-world platform moving without drift.

What remains:

- the adapted Hermes-derived operator memory module
- one small builder-continuity adapter that checks Hermes status and syncs Hermes memory into the repo root `AGENTS.md`
- one structured todo board
- a first-principles architecture note
- a canon boundary document plus schema checks
- an indexed `world/` tree for the working foundation

The Hermes module is only for builder continuity. World canon and world runtime are separate future systems.
World foundation work now starts from `world/INDEX.md` and `world/foundation/INDEX.md`.

Direction changes now belong in the todo board and progress record instead of getting lost in one long chat.
Each chat should handle one small slice, stop at a clean point, and leave the next slice readable.
The board is validated with `npm run check:todo` before normal work.

Everything else should earn its way in.
