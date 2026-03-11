# Worldbuilding Architecture

## Goal

Build an autonomous worldbuilding system that can later place the user inside a living agentic world without losing build continuity.

## The four layers

### 1. Operator continuity

This is for the builder, not the world.

- Hermes-style durable memory:
  an adapted Hermes-derived memory implementation for very small, curated, persistent notes
- AGENTS sync bridge:
  mirrors the Hermes memory snapshot into the repo root `AGENTS.md` for new-chat auto-load
- Progress and todo:
  one human-readable handoff record plus one planning surface

This layer exists so the build process keeps its bearings without turning every conversation into permanent sludge.
It is not the world's memory system.

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
Its memory, beliefs, and agent behavior are separate from builder continuity.

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

## Implementation sequence

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

## Execution stance

Current platform research does not justify a bigger architecture at this stage.
It mainly confirms the direction already set here:

- treat Codex and similar agent surfaces as working interfaces, not as the source of world truth
- keep durable world truth in canon records we control, not in model context or chat history
- keep runtime state separate from canon even if an agent is the thing reading or updating it

When orchestration work eventually starts, begin with the smallest useful tool boundary:

- read world foundation and canon
- propose a `canon_change`
- approve and apply a `canon_change`
- later, advance runtime state without letting runtime overwrite canon

That keeps the useful part of current agent-system practice:

- explicit tool boundaries
- reviewable state changes
- human approval on durable writes
- room to swap models later

Without importing the parts that are still wrong-shaped for this repo:

- multi-agent orchestration
- tool discovery catalogs
- full MCP gateway layers
- trust scoring or security-cognition systems
- heavy observability stacks

If real runtime work later proves we need more than this, add it only in response to a concrete pain:

- repeated workflow drift that calls for reusable skills
- unclear world mutations that need a plain action log
- provider lock-in that forces a small model-lane note
- security exposure that comes from real external tool surfaces, not from imagined future scale
