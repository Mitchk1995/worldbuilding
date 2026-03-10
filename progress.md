# Progress

Date: March 10, 2026

## Current state

The old operator stack has been torn out.

What remains on purpose:

- exact Hermes operator memory
- one structured todo board
- project context loading
- a clean world-system blueprint
- slice-by-slice handoff through `todo.json` and this progress file instead of one bloated chat
- no repo-local legacy sqlite stores or browser dump folders

Current phase is only builder continuity.
The future world's memory and agent runtime are not being built in this slice.

## Why this reset happened

The previous system was wrong-shaped. It mixed operator memory, governance, review history, and future world state into one expanding pile. That created bloat instead of preserving the right context.

## Immediate next targets

1. Keep operator continuity stable with small curated memory only.
   Use the vendored Hermes memory implementation as the single source of truth.
   This is builder memory for preserving the rebuild process, not world memory.
2. Keep the todo board simple, validated, and reviewable so direction changes stay clean.
   The board must pass `npm run check:todo` before normal work and support clean handoff into a fresh chat.
3. Design a canon engine that is separate from operator memory.
4. Add a world simulation runtime that is explicitly ephemeral.
5. Build the user insertion layer only after canon and simulation are clean.

## Non-negotiables

- Operator memory is not world memory.
- World canon must be reviewable.
- Session chatter is not canon.
- New systems must stay smaller than the ones they replace.
