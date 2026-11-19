# Task Progress

A Claude Code plugin that shows the current task's progress above the prompt and on the status line: completed steps / total steps of Claude's task list (TodoWrite, TaskCreate/TaskUpdate, or the Claude desktop app's plan).

> I made this small plugin because I needed it myself: I wanted to see how far along Claude is on a task.
> Maybe you need it too. If so, you're welcome to grab it from the latest release:
> https://github.com/huypvnurani/claude-task-progress/releases/latest
>
> Feedback and ideas are always appreciated.
>
> Mình làm plugin nhỏ này vì thấy cần cho cá nhân: muốn biết Claude đang làm tới đâu rồi.
> Biết đâu bạn cũng cần. Nếu vậy, xin mời bạn tải về tại:
> https://github.com/huypvnurani/claude-task-progress/releases/latest
>
> Mọi góp ý đều rất quý.
>
> — YuhTahn

```
━━━━━━━━━━━━──────── 58% (2/4 main steps)  −  ✕
Now: Count files › 2.2 Count .js (this step 34% · 1/3 sub-steps)
```

## Install

In Claude Code (terminal), at the prompt:

```
/plugin install task-progress --marketplace huypvnurani/claude-task-progress
```

From a shell:

```bash
claude plugin install task-progress --marketplace huypvnurani/claude-task-progress
```

In the Claude desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** with `huypvnurani/claude-task-progress` → add **task-progress**.

## What it does

- **Nested %**: main steps split 100%; a main step's sub-steps (a subagent's task list started during that step, or indented / `-` / `2.1`-numbered lines under it) split that step's share. Rounded to whole numbers; 100% only when everything is done.
- **Start bump**: a step that has just started counts 10% of its share, so the bar moves as soon as work begins, and never goes backwards.
- **Cancel / changes**: a cancelled turn keeps its % and shows "Stopped"; adding or removing steps recomputes the %. A finished task stays at 100% until the next task list replaces it.
- **Controls**: `−` minimize to one line, `□` expand, `✕` close. `/progress` shows it again; a new task list reopens it automatically.
- **Picks up running tasks**: when the plugin loads into a session that already has a task list (installed mid-task, or a session reopened), it rebuilds the progress from that session's history.
- **Languages**: en, vi, zh, ja, ko, th, fr, es, de, pt, id. Option `language` (default `auto`: the language of the task steps, then the system locale, then English).
- **No token cost**: the plugin only reads tool calls and draws local UI; it adds nothing to prompts, the system prompt or tool results, and makes no network calls.

## For AI agents

Agents can install, use and maintain this plugin on their own by following [AGENTS.md](AGENTS.md).

## License

MIT © YuhTahn
