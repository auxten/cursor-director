# Director Prompt — split into two variants

This prompt now ships in two variants sharing the same control-plane design:

- [prompt-cursor.md](./prompt-cursor.md) — Cursor as the director; workers: Claude Code CLI / Codex / Grok; per-task Composer 2.5 stewards drive `watch.sh` in short blocking chunks.
- [prompt-claude-code.md](./prompt-claude-code.md) — Claude Code as the director; workers: Codex / Grok; `watch.sh` runs as a background shell process that wakes the director on exit — no subagents at all, the director judges ambiguous panes itself.
