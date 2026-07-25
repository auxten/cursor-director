# Director Prompt — split into two variants

This prompt ships in two variants sharing the same control-plane design (both at v3):

- [prompt-cursor.md](./prompt-cursor.md) — Cursor as the director; workers: Claude Code CLI / Codex / Grok; per-task Composer 2.5 stewards drive `watch.sh` in short blocking chunks.
- [prompt-claude-code.md](./prompt-claude-code.md) — Claude Code as the director; workers: Codex / Grok; `watch.sh` runs as a background shell process that wakes the director on exit; a narrow read-only subagent policy (pane judgment, log digestion, scouting) replaces v2's blanket subagent ban.
- 中文版：[prompt-cursor.zh.md](./prompt-cursor.zh.md) / [prompt-claude-code.zh.md](./prompt-claude-code.zh.md) — 与英文版协议等价：命令、脚本与协议字符串逐字一致，仅叙述语言不同。

Both variants carry Lane C — ACP dispatch via an embedded `acp-run.mjs` bridge (Grok defaults to it; Claude can use it in the Cursor variant; Codex waits on a newer `codex-acp`).

v3 (2026-07-19) hardens both variants from the field audit ([field-audit-2026-07-18.md](./field-audit-2026-07-18.md)): true exit-code completion signals, a rebuilt watchdog (log-growth liveness + startup gate), a TASKS/JOURNAL/HANDOFF ledger with Intake/Reconcile/Wrap-up rituals, on-disk protocol persistence (`.tasks/PROTOCOL.md`), effort-tiered routing with a Spark bulk lane, review deployment-path verification, and pinned quota semantics.
