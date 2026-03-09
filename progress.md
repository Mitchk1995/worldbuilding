Original prompt: Build a long-running agentic world inside Codex with persistent world state, strong context management, a memory system, orchestration for NPCs and world events, a nice dashboard, and a clean workflow that does not get sloppy or leave things unreviewed.

Current state:
- The repo now has a working SQLite-backed memory spine in `src/memory/store.js`.
- Operator/build memory is separated from world runtime memory.
- Initial steerings and failure notes are seeded into the operator memory store via `npm run seed:memory`.
- Current research notes are in [docs/research-2026-memory.md](/D:/codexcoding/worldbuilding/docs/research-2026-memory.md).
- The architecture is still provisional. Current internet research supports the direction, but broader comparison is still in progress.
- [AGENTS.md](/D:/codexcoding/worldbuilding/AGENTS.md) is now the primary repo contract.
- The store now tracks project work items and audits, not just operator/world memory.
- The bootstrap work item `governance-bootstrap` was completed only after research, code, and QA audits passed.
- Current focus is operator-side memory, review discipline, and anti-slop workflow only. Do not start worldbuilding systems yet.
- The GitHub repository is now public, which removes the old private-plan enforcement blocker.
- The live GitHub policy now protects `main` with pull-request-only merging, strict required checks, conversation resolution, linear history, and no force pushes or branch deletion.
- The tracked GitHub policy lives in `src/github-policy.js`, and the repo can now audit or apply it with `npm run github:policy:audit` and `npm run github:policy:apply`.
- GitHub approving reviews are intentionally set to zero in branch protection because the real separate-agent review is enforced through the tracked review ledger and the required quality checks, not through a manual approval click.
- The GitHub automation work item is now complete with fresh research, code, QA, and separate-agent review records.
- The Notion server is visible in this session and the build-side mission-control page is live at [Operator Mission Control](https://www.notion.so/31e797eac74c8180bf5ae9405ebb4a40).
- That Notion page is now the live build-side hub for active work, reviews, steerings, and open problems.
- The Notion page now leads with a short summary and narrower tables so it is easier to scan without horizontal scrolling.
- The CLI now has a built-in workspace audit command, and work completion is expected to happen from a clean repo instead of leaving large uncommitted piles behind.

Hard steerings:
- Use internet-first research for current technical decisions. Do not trust old local files as the source of truth for evolving systems.
- Keep operator memory separate from world runtime memory.
- Do not treat vector search as canon.
- Capture feedback and failures proactively.
- Record new corrections and "never do that again" steerings immediately.
- Audit for exact and likely duplicate memory so operator memory stays clean.
- Resolve stale failures and limits instead of leaving them active forever.
- Check for existing relevant skills and external systems before inventing new ones.
- Optimize the repo for agents first; keep README minimal.
- Do not count substantial work as done until research, code, and QA audits are recorded and passing.
- Keep failed work in recursive review until the latest full set of reviews comes back clean.
- Use a separate reviewer instance for substantial work instead of relying only on self-review.
- Start from current-year public sources when choosing what systems to research.
- Speak in plain English and avoid programmer wording unless the user asks for it.

Known failures already recorded:
- Research was scoped too narrowly at first.
- Unrelated memory skills were read and polluted context.
- Familiar older product names were used too early in the research framing.
- Several new user steerings were not written into durable operator memory immediately.
- The current Notion tool path would not safely convert the mission-control page into one expanded inline board view, so the page currently works as a live hub with attached databases instead.

Immediate next build targets:
- Keep the live GitHub policy and the repo-tracked policy file in sync.
- Keep the Notion mission-control page in sync as build-side work, reviews, steerings, and open problems change.
- Use the built-in workspace audit and clean-finish rule so build work does not pile up as one large dirty tree again.
- Tighten duplicate and stale-note cleanup further where close paraphrases still slip through.
- Harden independent reviewer identity so a dishonest actor cannot fake the second-review rule by typing a different reviewer label.
- Keep worldbuilding work paused until operator governance is solid.
