Original prompt: Build a long-running agentic world inside Codex with persistent world state, strong context management, a memory system, orchestration for NPCs and world events, a nice dashboard, and a clean workflow that does not get sloppy or leave things unreviewed.

Current state:
- The repo now has a working SQLite-backed memory spine in `src/memory/store.js`.
- Operator/build memory is separated from world runtime memory.
- Initial steerings and failure notes are seeded into `data/world-memory.sqlite` via `npm run seed:memory`.
- Current research notes are in [docs/research-2026-memory.md](/D:/codexcoding/worldbuilding/docs/research-2026-memory.md).
- The architecture is still provisional. Current internet research supports the direction, but broader comparison is still in progress.
- [AGENTS.md](/D:/codexcoding/worldbuilding/AGENTS.md) is now the primary repo contract.
- The store now tracks project work items and audits, not just operator/world memory.
- The bootstrap work item `governance-bootstrap` was completed only after research, code, and QA audits passed.

Hard steerings:
- Use internet-first research for current technical decisions. Do not trust old local files as the source of truth for evolving systems.
- Keep operator memory separate from world runtime memory.
- Do not treat vector search as canon.
- Capture feedback and failures proactively.
- Check for existing relevant skills and external systems before inventing new ones.
- Optimize the repo for agents first; keep README minimal.
- Do not count substantial work as done until research, code, and QA audits are recorded and passing.
- Start from current-year public sources when choosing what systems to research.
- Speak in plain English and avoid programmer wording unless the user asks for it.

Known failures already recorded:
- Research was scoped too narrowly at first.
- Unrelated memory skills were read and polluted context.
- Familiar older product names were used too early in the research framing.

Immediate next build targets:
- Add commands and reducers for relationships, factions, locations, and approved canon projections.
- Build a review workflow so autonomous world updates cannot silently rewrite canon.
- Add a dashboard over operator steerings, project work audits, review queue items, and entity briefs.
- Wire background jobs to OpenAI/Codex later, after the local state model is solid.
