Be proactive and helpful. Ask for design clarification only when a choice would materially change the system.

# Worldbuilding Operating Contract

This repo now runs from a small, first-principles baseline.

## What we are building

An agentic worldbuilding system that can eventually place the user inside a living world without losing important build context.

## What this repo keeps

- `AGENTS.md`: operating contract
- `progress.md`: current handoff state
- `todo.json`: single planning surface for active and upcoming slices
- adapted Hermes-derived operator memory module: small, curated, durable notes only
- Project instruction files: instructions that belong in files, not memory

## What this repo avoids

- review ledgers
- failure ledgers
- steering ledgers
- mission-control dashboards
- GitHub policy machinery
- mixed operator/world memory stores
- anything that stores every note just because it exists

## Core boundaries

- Keep operator memory separate from world memory.
- Treat Hermes operator memory as build continuity only.
- The world's own memory and agent system are separate future systems.
- Do not treat transcripts as canon.
- Do not use retrieval junk as truth.
- Keep durable memory tiny and explicit.
- Put project instructions in context files, not in memory.
- Do not build the living world on top of operator notes.

## Startup loop

Before substantial work:

1. Read `AGENTS.md`.
2. Read `progress.md`.
3. Read `todo.json`.
4. Run `npm run check:todo`.
5. Treat the auto-generated builder-continuity snapshot in `AGENTS.md` as the default hot memory layer for startup. Read the raw Hermes-style operator memory files only when you are explicitly editing or debugging builder continuity.
6. Run `python -m tools.builder_continuity status` and read the adapted Hermes-derived memory module, the builder-continuity adapter, and `docs/architecture.md`.
7. Run `git status --short`.
8. If the work depends on current platforms, models, or best practices, verify with current sources first.
9. If Hermes behavior matters, inspect the local Hermes clone recorded in `HERMES_HOME/UPSTREAM_SOURCE.txt` before inventing a replacement.
10. For planning, architecture, or system-shape changes, get a focused subagent review for overengineering, slop buildup, and simpler alternatives before calling the work clean.

## Continuity compatibility

- `tools/run_codex_continuity_sync.ps1`, `tools/run_codex_continuity_sync.cmd`, and `tools/run_codex_continuity_sync.vbs` are compatibility entry points for an external automatic continuity trigger.
- They may look redundant because the real logic lives in `python -m tools.builder_continuity sync-agents`, but do not remove them unless that external trigger has been updated and tested against the new path.
- Treat them as workflow compatibility files, not optional convenience wrappers.

## Implementation order

1. Operator continuity:
   adapted Hermes-derived durable memory plus the AGENTS sync bridge for builder continuity while the world is being built.
2. Canon engine:
   reviewable world facts, timelines, entities, and approved changes.
3. Simulation runtime:
   ephemeral world state, agents, scenes, and consequences.
4. Embodiment:
   the user enters the world through a controlled player-facing layer.

## Communication

- Speak in plain English.
- Do not talk like the user is coding.
- Be decisive about deleting wrong-shaped systems.
- Keep the repo small unless a new file clearly earns its place.
- Keep `todo.json` as the single planning surface. Change direction there instead of scattering plans across chat.
- Keep active work scope only in `todo.json` `delivery.active_item_ids`.
- Do not treat builder continuity work as world-memory work.
- Keep the synced `AGENTS.md` snapshot as the default hot builder-memory layer. Do not reread raw memory files by default.
- Treat each new chat as one small build slice.
- Do not let one chat carry multiple slices just because the thread already exists.
- If direction changes mid-slice, update `todo.json` and `progress.md`, commit the clean stopping point, and continue in a fresh chat.
- End each slice with a short handoff in `progress.md` so the next chat can start cleanly without depending on thread history.
- Rewrite `progress.md` to the current handoff state. Do not turn it into an append-only log.
- Keep PRs small by mapping each change slice to one active item id, or two ids only when they are explicitly coupled.
- Once a clean item is tested and committed, merge it to `main` immediately, push `main`, and delete the local and remote work branch. Do not leave finished work stranded on a side branch.

## World file pathing

- World knowledge belongs under `world/`, not in Hermes memory.
- `world/INDEX.md` is the root entry point for world files.
- `world/foundation/` holds pre-canon world design that is still being shaped.
- Future canon, runtime, and player-facing world files should stay in separate sibling paths under `world/` instead of mixing together.
- Keep world files small and easy to scan. Crossing 100 lines should be rare and should need a clear reason.
- Prefer one subject per file and update the nearest index whenever a world file is added, renamed, or moved.

<!-- BEGIN AUTO-GENERATED BUILDER CONTINUITY -->
## Auto-Generated Builder Continuity Snapshot

This section is auto-generated from Hermes MEMORY.md and USER.md so new Codex chats get the same small builder-continuity snapshot automatically. Treat it as the default hot builder-memory layer for startup, backed by the raw memory files. Treat it as builder continuity only, never as world canon. Do not edit it by hand.

══════════════════════════════════════════════
MEMORY (your personal notes) [29% — 644/2,200 chars]
══════════════════════════════════════════════
Use Hermes memory proactively for durable user corrections and workflow rules. Keep planning systems minimal and avoid adding policy sludge.
§
Do not conflate builder continuity memory with the future world's separate memory and agent system. Hermes memory work here is only for preserving the build process.
§
During world-design work, keep actual world decisions in repo design files and handoffs, not in Hermes memory. Preserve player-facing mystery without storing secret lore in operator memory.
§
Keep world gameplay and future simulation systems separate from planning and implementation surfaces such as todo, progress, and build notes.

══════════════════════════════════════════════
USER PROFILE (who the user is) [83% — 1,142/1,375 chars]
══════════════════════════════════════════════
The user hates overengineering and expects simple systems with only the minimum necessary moving parts.
§
The user wants collaborative, writing-focused world design in plain English, with focused questions only when a choice materially shapes the world. Do not make the user do technical work.
§
The user wants eventual play as themself, with real-time passage and some exercise integration, but with little to no explicit game mechanics or stat-sheet feel.
§
When a world-design choice could expose spoilers, frame questions indirectly so the user can shape the world without seeing hidden truths. Do not railroad them, but do protect mystery with careful wording.
§
Keep world knowledge out of Hermes memory. The user wants world files to stay highly organized, easy to navigate, and scalable without forcing large context loads.
§
When the user is unsure how to structure worldbuilding, choose the next best-practice design anchor instead of asking them to architect the process.
§
Be sharply scrutinizing about redundant or dead systems. If something is obviously duplicative, cut it instead of justifying it, and keep explanations tight.
<!-- END AUTO-GENERATED BUILDER CONTINUITY -->
