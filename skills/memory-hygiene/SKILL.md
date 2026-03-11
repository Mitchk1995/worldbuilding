---
name: memory-hygiene
description: Keep durable memory strict, minimal, and separate from world files, handoff files, and routine repo notes. Use when deciding whether something belongs in persistent memory, tightening memory guidance, reviewing builder-continuity setup, or updating MEMORY.md and USER.md policy so memory does not turn into sludge.
---

# Memory Hygiene

Use durable memory as a tiny continuity surface. Prefer saving less.

## Save only

- Save durable user preferences, corrections, and communication expectations.
- Save durable workflow rules that are not already written in repo files.
- Save hard-to-rediscover environment facts, tool quirks, or setup details.

## Do not save

- Do not save world lore, canon candidates, secret setting notes, or design chatter. Put those in `world/`.
- Do not save handoff notes, next steps, or slice status. Put those in `progress.md` or `todo.json`.
- Do not save completed-task diary entries, routine summaries, or "what we did today" notes.
- Do not save routine repo facts that are already written in tracked files.
- Do not save anything easy to rediscover in a quick file read or command.

## Preferred homes

- Use `world/` for world knowledge.
- Use `progress.md` for the current handoff state.
- Use `todo.json` for active and upcoming slice planning.
- Use repo docs and instruction files for project rules that should be visible in files rather than hidden in memory.

## Review pass

Before adding or keeping a memory entry, ask:

1. Will this still matter in a later chat?
2. Is it hard to rediscover quickly?
3. Is memory the best home, or should it live in a repo file instead?

If any answer is no, do not save it to memory.

## Repo honesty

Describe the current setup plainly. If the repo only has file-backed memory plus `AGENTS.md` snapshot sync, say that. Do not imply a live session-integrated memory system unless you can point to real wiring in the repo.
