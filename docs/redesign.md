# First-Principles Redesign

## Goal

Build an autonomous worldbuilding system that can later place the user inside a living agentic world without losing build continuity.

## The four layers

### 1. Operator continuity

This is for the builder, not the world.

- Hermes-style durable memory:
  the exact Hermes memory implementation for very small, curated, persistent notes
- Project context:
  instructions that belong in files and get loaded at session start
- Progress:
  one human-readable rebuild record

This layer exists so the build process keeps its bearings without turning every conversation into permanent sludge.

### 2. Canon engine

This is the source of truth for the world.

- entities
- locations
- factions
- timelines
- rules of reality
- approved events

Canon must be reviewable and changeable on purpose. It cannot be whatever the model happened to say last time.

### 3. Simulation runtime

This is the living layer.

- agent goals
- current scene state
- temporary beliefs
- rumors
- plans
- consequences

This layer is allowed to be wrong, partial, emotional, and in motion. It is not canon by default.

### 4. Embodiment

This is how the user enters the world.

- player identity
- insertion point
- local sensory frame
- choice handling
- memory handoff rules between sessions

The user should experience a living world, not a dashboard.

## Persistence rules

Persist only these:

- operator continuity that is hard to rediscover
- approved canon
- player-facing continuity that must survive sessions

Do not persist these:

- raw transcripts
- speculative world chatter
- vector matches presented as truth
- broad review bureaucracy
- dashboards that summarize stale junk

## Build sequence

1. Keep Hermes-style operator memory working.
2. Add a canon store with explicit approvals.
3. Add a simulation runtime that reads canon but does not overwrite it.
4. Add the user insertion layer.

## Directional test

If a new component makes it harder to tell the difference between:

- builder memory
- project instructions
- world canon
- runtime beliefs

then it is the wrong component.
