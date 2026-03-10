Be proactive and helpful. Ask for design clarification only when a choice would materially change the system.

# Worldbuilding Rebuild Contract

This repo is being rebuilt from first principles.

## What we are building

An agentic worldbuilding system that can eventually place the user inside a living world without losing important build context.

## What survives the rebuild

- `AGENTS.md`: operating contract
- `progress.md`: current rebuild state
- exact Hermes operator memory module: small, curated, durable notes only
- Project context files: instructions that belong in files, not memory

## What does not survive the rebuild

- review ledgers
- failure ledgers
- steering ledgers
- mission-control dashboards
- GitHub policy machinery
- mixed operator/world memory stores
- anything that stores every note just because it exists

## Core boundaries

- Keep operator memory separate from world memory.
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
5. Read the Hermes-style operator memory files if they exist.
6. Read the vendored Hermes memory module, the project context loader, and the redesign document.
7. Run `git status --short`.
8. If the work depends on current platforms, models, or best practices, verify with current sources first.
9. If Hermes behavior matters, inspect the local Hermes clone before inventing a replacement.
10. For planning, architecture, or system-shape changes, get a focused subagent review for overengineering, slop buildup, and simpler alternatives before calling the work clean.

## Build order

1. Operator continuity:
   exact Hermes durable memory plus project context loading.
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
- Keep PRs small by mapping each change slice to one active item id, or two ids only when they are explicitly coupled.
- Once a clean item is tested and committed, merge it to `main` immediately and delete the work branch. Do not leave finished work stranded on a side branch.
