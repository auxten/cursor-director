# Cursor Director

Use Cursor as a lightweight control plane for multiple local CLI coding agents, running inside a per-session tmux.

Each Cursor conversation gets its own tmux server on a dedicated socket (`tmux -L cursor-<id>`), so parallel Cursor sessions never collide with each other or with your own tmux. Every non-trivial task runs as one tmux session hosting a local CLI agent, babysat by a cheap Composer 2.5 subagent that starts it, watches it, injects mid-run instructions, and reports back. The main Cursor agent only coordinates, reviews, and synthesizes.

![Cursor Director architecture](./assets/cursor-multitask-agents.svg)

## The idea

- **Cursor is the director:** it decomposes work, selects agents, and reviews their output.
- **tmux is the execution substrate:** one dedicated socket per Cursor session, one tmux session per task. CLIs run interactively inside, so instructions can be injected mid-run with `send-keys` — something plain background shells can't do.
- **Composer 2.5 subagents are session stewards:** one per task session. They launch the CLI, paste the task brief via tmux buffers, and poll `capture-pane` for progress and stalls. Since an interactive TUI never exits on its own, completion is detected as TUI idleness (input prompt back, pane unchanged across polls); the steward then captures the full scrollback and reports the result, key logs, and a diff summary — leaving the TUI and its tmux session alive so the chat stays readable via `tmux attach`. They never implement, debug, or analyze.
- **Claude Code CLI handles complex work:** Fable with High Effort, or Opus 4.8 with Extra High.
- **Codex CLI and Grok CLI handle general execution:** GPT 5.6 SOL for Codex, or Grok — dispatched over ACP by default (`grok agent stdio`, which pins the model to grok-build), falling back to the Grok 4.5 · High Effort TUI when mid-run steering is expected (then `--no-alt-screen` is mandatory, since its default alternate screen would hide scrollback from `capture-pane`).
- **Quota-aware routing, now automatable:** Claude via `claude -p "/usage"`; Codex `/status` and Grok `/usage show` — previously interactive-only — are driven in throwaway tmux sessions with `send-keys` + `capture-pane`. Unexposed limits stay UNKNOWN; between Codex and Grok, whichever has more weekly quota remaining gets the work, and an agent is avoided once a known limit reaches 80%.
- **Evidence-based review:** Cursor checks diffs, captured logs, tests, and artifacts instead of trusting self-reported success.
- **Regression before done:** for apps with a testable UI (e.g. iOS apps), a build alone doesn't close a task — the feature is exercised on the simulator (build → install → test → screenshots → pass/fail report), by the implementing agent or a separately dispatched CLI agent, following the target repo's own testing conventions where they exist.
- **History-preserving lifecycle:** finished task sessions are kept alive (renamed with a `done-` prefix) so the chat remains attachable and readable; they are killed only on explicit user request, when a task is relaunched in a fresh session, or under resource pressure. Since session existence no longer signals completion, coordination relies on TUI idleness or explicit sentinels instead. The session's tmux server is killed at wrap-up; orphaned `cursor-*` sockets are discovered under `/tmp/tmux-<uid>/` at startup and only killed with user approval.

## Routing summary

| Task type | Agent and configuration |
| --- | --- |
| Extremely simple | Composer 2.5 |
| tmux session stewarding (per task) | Composer 2.5 subagent |
| Complex reasoning, architecture, or debugging | Claude Code CLI: Fable · High Effort, or Opus 4.8 · Extra High |
| Routine or moderately complex implementation | Codex CLI: GPT 5.6 SOL · High Effort, or Grok CLI: grok-build via ACP (Grok 4.5 · High Effort on the TUI lane) |

## Two variants (v2)

- [prompt-cursor.md](./prompt-cursor.md) — Cursor as director; workers: Claude Code CLI / Codex / Grok; per-task Composer 2.5 stewards drive `watch.sh` in short blocking chunks.
- [prompt-claude-code.md](./prompt-claude-code.md) — Claude Code as director; workers: Codex / Grok; `watch.sh` runs as a background shell process that wakes the director on exit — no subagents at all, the director judges ambiguous panes itself (cheap-model stewards proved unreliable at watch duty). A non-blocking discipline section reproduces Cursor's Multi-Task feel: foreground turns stay short, new requests are routed (via the `STATE.md` table) before current work resumes, so the director is effectively always available.

v2 changes shared by both:

- **Files are the data channel**: per-task `.tasks/` briefs, reports, `.done` sentinels, plus a `STATE.md` orchestration table so a fresh director session can resume the control plane after context loss. tmux scrollback is demoted to human viewing and forensics.
- **Three dispatch lanes**: Lane A (default) runs headless `codex exec` / `claude -p` *inside* a tmux session — process exit is the completion signal, no TUI-idleness heuristics — while the pane still streams live output; Lane B keeps the interactive TUI for tasks that need mid-run steering; Lane C speaks the [Agent Client Protocol](https://agentclientprotocol.com) through a ~35-line embedded bridge (`acp-run.mjs`) — verified end-to-end against Grok's native ACP endpoint (`grok agent stdio`) and the `@agentclientprotocol/claude-agent-acp` adapter. Lane C keeps Lane A's hard turn-end signal and adds machine-readable tool-call and permission events to the task log; permission requests are answered per-call and logged instead of blanket `--dangerously-*` flags. Grok defaults to Lane C (its ACP mode pins the model to grok-build); Codex stays on Lane A until `codex-acp` (0.16.0) bundles a core new enough for GPT 5.6 SOL.
- **Zero-token waiting**: a ~15-line `watch.sh` (sentinel check + pane-hash idle detection + timeout) replaces model-driven polling; models only judge ambiguous panes, one shot at a time.
- **Take-over preserved and upgraded**: worker sessions stay visible in the Claude Code / Codex desktop apps because the CLIs persist all sessions (headless included); take over by attaching, Ctrl-C, then `codex resume` / `claude --resume` in the same pane. An explicit takeover protocol stops the director from steering a session the user has claimed. (Grok's ACP sessions don't surface in `grok sessions list` — takeover on its Lane C is attach + redispatch; Claude's ACP sessions persist under `~/.claude/projects` as usual.)
- **Pairing (Codex ⇄ Grok cross-review)**: a non-trivial diff is dispatched to the *other* CLI as a reviewer that writes a structured `APPROVE | REWORK` verdict + findings to a review file; the director arbitrates and ping-pongs rework back to the implementer up to a three-attempt ladder. Independent model, blind-spot coverage, and it runs on CLI tokens — not the director's. High-risk work can also split implementer vs. independent test-writer against the same spec.
- **Dispatch emergent work too**: the "never do it yourself" rule is stated to cover problems that surface *mid-session* (a bug found in review, a follow-on hardening, "it's just one file") — the one measured failure mode where the director slid back into hands-on coding.
- **Detached-worktree isolation** when parallel tasks write the same repo, and **cached quota checks** (30-minute TTL, checked before long dispatches instead of as a ritual).

## Field results (measured, 2026-07)

Reconstructed from real session transcripts in this repo's home project. The framework's token win is structural, not a per-turn discount:

- **Context never fills up.** The heaviest do-it-all-yourself sessions pinned peak context at 830K–990K tokens (near the 1M ceiling → perpetual, lossy compaction). Every framework session stayed at 390K–600K with headroom to spare.
- **Implementation runs off-ledger.** Framework sessions dispatched 16–23 CLI tasks whose code generation never entered the director's output-token count; an equivalent direct session logged 29–200 hand-edits and 0.6M–3.6M director output tokens.
- **The one leak** was scope creep: when a director let mid-session work pull it into direct coding, its peak context jumped to the group high — which is why the "dispatch emergent work too" rule now exists.
- **Cheap stewards are unreliable** at watch duty (one shirked its report, another mis-attributed a shared-tree diff) — hence the Claude Code variant drops stewards entirely and the Cursor variant escalates a shirking steward to a stronger model.

## Use it

Copy the prompt of your chosen variant into a new conversation, then describe the work normally. The director remains the single point of coordination while the execution agents work inside the session's tmux behind it.

## 路由机制教训

旧版 prompt 的路由策略只写了 “Use Claude Code / Codex — GPT 5.6 SOL / Grok Build” 这样的产品名。站在 Cursor 主 agent 的视角，这些名称会被自然映射到 Cursor 内置的 Task 子代理模型（如 claude-fable-5、claude-opus-4-8、gpt-5.6、grok-4.5），导致任务全部消耗 Cursor 自己的 token，而没有使用用户本机安装的 `claude`、`codex`、`grok` 三个 CLI 各自的订阅额度。

因此，只写产品名不够。orchestrator prompt 必须显式规定派工机制：从仓库根目录在会话专属 tmux 中启动本机 CLI；同时必须显式禁止使用 Cursor 内置子代理承担实现、调试或分析类工作——唯一例外是作为 tmux 会话管理员的轻量 Composer 2.5 subagent。
