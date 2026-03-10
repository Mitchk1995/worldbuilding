# Worldbuilding Rebuild

This repository has been stripped back to the minimum shape needed to rebuild the system cleanly.

What remains:

- the exact Hermes operator memory module
- one structured todo board
- project context loading
- a first-principles redesign document

The Hermes module is only for builder continuity. World canon and world runtime are separate future systems.

Direction changes now belong in the todo board and progress record instead of getting lost in one long chat.
Each chat should handle one small slice, stop at a clean point, and leave the next slice readable.
The board is validated with `npm run check:todo` before normal work.

Everything else is expected to be rebuilt deliberately.
