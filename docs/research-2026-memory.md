# Current Research Notes

These notes are the current internet-first baseline for the memory architecture in this repo.

## Sources that changed the design

- OpenAI announced GPT-5.4 on March 5, 2026 with native computer use and an experimental 1M-token context window in Codex. That makes richer agent workflows possible, but it still does not turn raw context into durable canon. Source: [OpenAI GPT-5.4 announcement](https://openai.com/index/gpt-5-4/).
- OpenAI's Conversations guide shows how to persist and continue response history with conversation IDs. Useful for run continuity, not enough by itself for world canon. Source: [Conversations guide](https://platform.openai.com/docs/guides/conversation-state?api-mode=responses).
- OpenAI's Background mode guide supports asynchronous long-running responses. That is a good fit for world-tick jobs, NPC updates, and delayed review work. Source: [Background mode guide](https://platform.openai.com/docs/guides/background).
- OpenAI Agents SDK session docs describe automatic session memory and trimming. That is good for per-run working memory, but it should stay downstream of our durable world state. Source: [Agents SDK sessions](https://openai.github.io/openai-agents-python/sessions/).
- OpenAI prompt caching docs confirm cached prefixes can lower cost/latency for repeated static context. That makes a stable world bible/system prefix cheaper, but cached prompt text is still not the database. Source: [Prompt caching](https://platform.openai.com/docs/guides/prompt-caching).
- OpenClaw's current concept docs describe memory as deliberate, durable units that can be inspected and managed instead of invisible hidden context. That is a strong argument for explicit memory records over hoping the model "just remembers." Source: [OpenClaw memory concepts](https://openclaw.dev/docs/concepts/memory/).
- OpenClaw's memory CLI docs reinforce that memory is an external managed subsystem with its own add/search/list flows. Source: [OpenClaw memory CLI](https://openclaw.dev/docs/cli/memory/).
- LangGraph's current checkpoint docs distinguish graph checkpoints by thread from the broader persistence layer. That reinforces the idea that run state and durable knowledge are not the same thing. Source: [LangGraph Checkpoint README](https://github.com/langchain-ai/langgraph/blob/main/libs/checkpoint/README.md).
- Mem0's current memory docs explicitly separate conversation, session, user, and organizational memory. Their own graph-vs-vector guide also argues that vector search alone fails once relationship traversal matters. Sources: [Mem0 memory types](https://github.com/mem0ai/mem0/blob/main/docs/core-concepts/memory-types.mdx), [Mem0 vector vs graph](https://github.com/mem0ai/mem0/blob/main/docs/cookbooks/essentials/choosing-memory-architecture-vector-vs-graph.mdx).
- Letta's current README centers "stateful agents" and explicit memory blocks instead of hidden long prompts. Source: [Letta README](https://github.com/letta-ai/letta/blob/main/README.md).

## Architecture consequences

- Separate `operator memory` from `world runtime memory`.
- Keep `world canon` in structured tables and append-only events with review gates.
- Split runtime memory by scope. Current systems commonly separate turn/conversation memory, session/task memory, user or entity memory, and shared organizational/world memory.
- Treat search as a retrieval aid, not a source of truth.
- Expect graph or relationship-aware memory to matter once the world has factions, kinship, rumor chains, and multi-hop social reasoning.
- Use model/session memory for temporary working state and compaction, not permanent reality.
- Keep a failure register and steering register so project governance survives across runs.

## Confidence level

The current implementation in this repo is a local-first baseline, not a finalized proof that the architecture is complete. What is high confidence right now is the direction:

- explicit layered memory is better than raw transcript accumulation
- vector retrieval should assist recall, not define canon
- world canon needs approval/review boundaries
- operator memory and runtime/world memory should stay separate
