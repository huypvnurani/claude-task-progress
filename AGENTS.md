# AGENTS.md — guideline for AI agents

This file tells an AI coding agent (Claude Code, Codex, …) how to **install**, **use** and **maintain** the `task-progress` plugin without asking a human for steps. Follow it literally.

## 1. Install the plugin for the user

Only install when the user asks for it. Prefer the shell command; it works from any agent with a shell.

```bash
claude plugin install task-progress --marketplace huypvnurani/claude-task-progress
```

- If `claude` is not on `PATH` (e.g. inside the Claude desktop app), find the bundled binary: `ls ~/Library/Application\ Support/Claude/claude-code/*/*/claude.app/Contents/MacOS/claude` (macOS) and use the newest one.
- Check: `claude plugin list | grep -A4 task-progress` must show `Status: ✔ enabled`.
- Already-open sessions load it only after a restart; tell the user to open a new session.
- Do **not** install it twice under different names (e.g. a local copy and the GitHub one): the bar would be drawn twice. Check `claude plugin list` first.
- Do not type `/plugin …` into a shell; `/plugin` is a chat command of the Claude Code terminal UI only.

Optional language setting (default `auto`):

```bash
claude plugin install task-progress --marketplace huypvnurani/claude-task-progress --config language=vi
```

Values: `auto`, `en`, `vi`, `zh`, `ja`, `ko`, `th`, `fr`, `es`, `de`, `pt`, `id`.

## 2. Plan tasks so the progress bar is accurate

The plugin reads the agent's own task list. Nothing extra is sent to the model; you only need to keep a good task list.

**Sources it reads** (main loop and subagents):

| Tool | What the plugin does |
| --- | --- |
| `TodoWrite` | Replaces the list with `todos` |
| `TaskCreate` / `TaskUpdate` | Adds a step / changes its status, `deleted` removes it |
| `mcp__ccd_turn__update_plan` (Claude desktop app) | `items` replaces the list; `advance`, `done`, `start` move steps |
| `mcp__ccd_turn__wrap_up` | Marks every step done (100%) |

**How % is computed**

- Main steps split 100% equally (5 steps → 20% each).
- A main step's **sub-steps** split that step's share (step 2 with 3 sub-steps → 6.67% each).
- A step that is `in_progress` counts 10% of its share (the "start bump"); `completed` counts 100%.
- Rounded to whole numbers; 100% only when every step is done; the bar never goes backwards on normal progress.

**Rules for agents**

1. Make one list per user request, written in the user's language (the `auto` language follows the step titles).
2. Keep exactly one step `in_progress`. Mark a step `completed` as soon as it is done, not in a batch at the end.
3. To nest sub-steps in one flat list, put them right under their parent and start the title with `2.1 `, `- `, `↳ ` or leading spaces:
   ```
   Count files per type          ← main step
   2.1 Count .html               ← sub-step
   2.2 Count .js
   2.3 Count .css
   Find most recent file         ← main step
   ```
   A parent with sub-steps is "done" only when all of its sub-steps are done, even if the flat list advanced past it.
4. A subagent's own task list is nested automatically under the main step that was `in_progress` when the subagent wrote it. Start the main step **before** spawning the subagent.
5. When the scope changes, rewrite the whole list (keep finished steps `completed`); the % recomputes. Don't create a second list.
6. If the turn is cancelled the bar shows "Stopped". On the next turn, either continue the same list (update it) or replace it; leaving it untouched clears it at the end of that turn.

## 3. Maintain and release

Repository layout:

```
.claude-plugin/plugin.json       manifest (name must stay kebab-case: task-progress)
.claude-plugin/marketplace.json  marketplace "yuhtahn", lists this folder
hooks/register.tsx               hooks: tool.call, turn.complete, prompt.submit, command.run, ui.render
hooks/i18n.ts                    all UI strings, one entry per language
types/index.d.ts                 $.state contract: task-progress.progress, task-progress.view
hooks/*.test.ts(x)               tests
```

Workflow for any change:

1. Edit the code. Every user-visible string goes in `hooks/i18n.ts` for **all** languages; labels start with a capital letter.
2. Keep state keys and the contract in sync: the atoms in `register.tsx` use `plugin: 'task-progress'`, the same name as `plugin.json` and `types/index.d.ts`. If a stored shape changes, add a `shape` tag to the atom.
3. Run, and fix until both pass with no errors:
   ```bash
   claude plugin validate .
   claude plugin test .
   ```
   Add a test for every behaviour change (`hooks/flow.test.tsx` for hook flows, `hooks/register.test.ts` for the math).
4. Bump `version` in `.claude-plugin/plugin.json` (semver: fix → patch, feature → minor).
5. Commit, push `main`, then release with a matching tag:
   ```bash
   git commit -am "task-progress X.Y.Z: <summary>"
   git push
   gh release create vX.Y.Z --target main --title "task-progress vX.Y.Z" --notes "<what changed>"
   ```
6. Users update with `claude plugin marketplace update yuhtahn && claude plugin update task-progress@yuhtahn`.

Never add anything that sends data over the network or adds text to prompts, the system prompt or tool results: the plugin promises zero token cost and no network calls.
