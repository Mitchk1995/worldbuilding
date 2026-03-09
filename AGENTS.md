# Agent Operating Contract

This repo is agent-operated. Treat this file as the primary entrypoint.

## Startup loop

Before substantial work:

1. Read this file.
2. Read [progress.md](/D:/codexcoding/worldbuilding/progress.md).
3. Run `node src/cli.js brief operator`.
4. Run `node src/cli.js work list`.
5. If the task depends on current products, models, platforms, or best practices, research current internet sources first. Do not rely on stale local docs or pre-2026 assumptions.
6. When speaking to the user, use plain English. Do not mention code symbols, file paths, or other programmer-facing labels unless the user explicitly asks for them.

## Hard boundaries

- Keep `operator memory` separate from `world runtime memory`.
- Do not treat vector retrieval or transcript recall as canon.
- Do not open unrelated skills or reference files just because they seem adjacent.
- Check for existing relevant skills, systems, and upstream patterns before inventing new abstractions.
- Record user corrections and agent failures proactively.
- Treat stale model familiarity as a risk. Search the current year first before deciding which products or systems matter.

## Non-trivial work protocol

For any task that changes architecture, persistent state, orchestration, dashboards, or multi-file code:

1. Create a work item:
   `node src/cli.js work create <id> "<title>"`
2. Move it to active:
   `node src/cli.js work status <id> in_progress`
3. Log any new steering or failure when discovered:
   `node src/cli.js steering <kind> "<note>"`
   `node src/cli.js failure "<title>" "<details>"`
4. Implement in small increments.
5. Run verification.
6. Record audits before calling the work done:
   `node src/cli.js audit add <id> research pass main-agent "<notes>"`
   `node src/cli.js audit add <id> code pass main-agent "<notes>"`
   `node src/cli.js audit add <id> qa pass main-agent "<notes>"`
   `node src/cli.js audit add <id> independent pass <second-agent-name> "<notes from a second agent review>"`
7. Sync the review ledger into the repo:
   `npm run reviews:sync`
7. Complete the work item:
   `node src/cli.js work complete <id>`

`work complete` must fail if the latest required audits are not passing.

## Review standard

Every substantial change must satisfy all of these:

- `research`: current-source claims checked if the topic is time-sensitive
- `code`: changed behavior reviewed for regressions, missing edge cases, and architecture drift
- `qa`: commands/tests/manual checks run and recorded
- `independent`: a separate agent reviews the work so the builder is not the only reviewer

If a review fails, record it and continue only after remediation. Do not silently carry forward known slop.

## World-state discipline

- New canon events should enter as reviewable records first.
- Only approved canon should drive future projections and derived summaries.
- NPC memory can contain beliefs, rumors, and falsehoods. Canon cannot.

## Files that matter

- [src/memory/store.js](/D:/codexcoding/worldbuilding/src/memory/store.js): persistent operator/world memory and project audit logic
- [src/cli.js](/D:/codexcoding/worldbuilding/src/cli.js): command surface for memory, work, and audit operations
- [docs/research-2026-memory.md](/D:/codexcoding/worldbuilding/docs/research-2026-memory.md): current research baseline
- [progress.md](/D:/codexcoding/worldbuilding/progress.md): active handoff state

## Anti-slop rules

- Prefer fewer explicit systems over many vague ones.
- Make defaults inspectable.
- Make reviewable state changes visible.
- Do not claim certainty you have not earned.
- Do not let convenience become canon.
- Do not talk to the user like a programmer unless they ask for that level of detail.
- Do not let the same agent both build and be the only reviewer on non-trivial work.
