# Cursor Director

Use Cursor as a lightweight control plane for multiple local CLI coding agents, running inside a per-session tmux.

Each Cursor conversation gets its own tmux server on a dedicated socket (`tmux -L cursor-<id>`), so parallel Cursor sessions never collide with each other or with your own tmux. Every non-trivial task runs as one tmux session hosting a local CLI agent, babysat by a cheap Composer 2.5 subagent that starts it, watches it, injects mid-run instructions, and reports back. The main Cursor agent only coordinates, reviews, and synthesizes.

![Cursor Director architecture](./assets/cursor-multitask-agents.svg)

## The idea

- **Cursor is the director:** it decomposes work, selects agents, and reviews their output.
- **tmux is the execution substrate:** one dedicated socket per Cursor session, one tmux session per task. CLIs run interactively inside, so instructions can be injected mid-run with `send-keys` — something plain background shells can't do.
- **Composer 2.5 subagents are session stewards:** one per task session. They launch the CLI, paste the task brief via tmux buffers, and poll `capture-pane` for progress and stalls. Since an interactive TUI never exits on its own, completion is detected as TUI idleness (input prompt back, pane unchanged across polls); the steward then quits the TUI (`/exit` for claude and grok, `/quit` for codex) and confirms via the shell's `TASK_DONE=<exit code>` line before reporting the result, key logs, and a diff summary. They never implement, debug, or analyze.
- **Claude Code CLI handles complex work:** Fable with High Effort, or Opus 4.8 with Extra High.
- **Codex CLI and Grok CLI handle general execution:** GPT 5.6 SOL for Codex, or Grok 4.5 with High Effort (Grok launches with `--no-alt-screen`, since its default alternate screen would hide scrollback from `capture-pane`).
- **Quota-aware routing, now automatable:** Claude via `claude -p "/usage"`; Codex `/status` and Grok `/usage show` — previously interactive-only — are driven in throwaway tmux sessions with `send-keys` + `capture-pane`. Unexposed limits stay UNKNOWN; an agent is avoided once a known limit reaches 80%.
- **Evidence-based review:** Cursor checks diffs, captured logs, tests, and artifacts instead of trusting self-reported success.
- **Clean lifecycle:** task sessions are killed after their steward reports; the session's tmux server is killed at wrap-up; orphaned `cursor-*` sockets are discovered under `/tmp/tmux-<uid>/` at startup and only killed with user approval.

## Routing summary

| Task type | Agent and configuration |
| --- | --- |
| Extremely simple | Composer 2.5 |
| tmux session stewarding (per task) | Composer 2.5 subagent |
| Complex reasoning, architecture, or debugging | Claude Code CLI: Fable · High Effort, or Opus 4.8 · Extra High |
| Routine or moderately complex implementation | Codex CLI: GPT 5.6 SOL · High Effort, or Grok CLI: Grok 4.5 · High Effort |

## Use it

Copy the prompt in [prompt.md](./prompt.md) into a new Cursor conversation, then describe the work normally. Cursor remains the single point of coordination while the execution agents work inside the session's tmux behind it.

## 路由机制教训

旧版 prompt 的路由策略只写了 “Use Claude Code / Codex — GPT 5.6 SOL / Grok Build” 这样的产品名。站在 Cursor 主 agent 的视角，这些名称会被自然映射到 Cursor 内置的 Task 子代理模型（如 claude-fable-5、claude-opus-4-8、gpt-5.6、grok-4.5），导致任务全部消耗 Cursor 自己的 token，而没有使用用户本机安装的 `claude`、`codex`、`grok` 三个 CLI 各自的订阅额度。

因此，只写产品名不够。orchestrator prompt 必须显式规定派工机制：从仓库根目录在会话专属 tmux 中启动本机 CLI；同时必须显式禁止使用 Cursor 内置子代理承担实现、调试或分析类工作——唯一例外是作为 tmux 会话管理员的轻量 Composer 2.5 subagent。
