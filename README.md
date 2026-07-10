# Cursor Director

Use Cursor Multitask as a lightweight control plane for multiple coding agents.

Cursor keeps the main session responsive while it understands the request, delegates implementation, monitors subscription limits, and reviews the final result.

![Cursor Director architecture](./assets/cursor-multitask-agents.svg)

## The idea

- **Cursor is the director:** it decomposes work, selects agents, and reviews their output.
- **Claude Code handles complex work:** use Fable with High Effort or Opus 4.8 with Extra High.
- **Codex and Grok Build handle general execution:** use GPT 5.6 SOL or Grok 4.5 with High Effort.
- **Composer 2.5 handles extremely simple tasks.**
- **Quota-aware routing:** avoid an agent when either its rolling 5-hour or weekly usage reaches 80%.
- **Non-blocking execution:** delegated agents run with Skip All Confirmations enabled, within the scope already authorized by the user.
- **Evidence-based review:** Cursor checks diffs, logs, tests, and artifacts instead of trusting self-reported success.

## Routing summary

| Task type | Agent and configuration |
| --- | --- |
| Extremely simple | Composer 2.5 |
| Complex reasoning, architecture, or debugging | Claude Code: Fable · High Effort, or Opus 4.8 · Extra High |
| Routine or moderately complex implementation | Codex: GPT 5.6 SOL · High Effort, or Grok Build: Grok 4.5 · High Effort |

## Use it

Copy the prompt in [prompt.md](./prompt.md) into a new Cursor conversation, then describe the work normally. Cursor remains the single point of coordination while the execution agents work behind it.

