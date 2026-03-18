# Contributing to PowerSync Agent Skills

Contributions are welcome from the community — whether you're fixing a bug, improving an existing reference, or adding support for a new SDK or topic.

## What Lives Here

This repo contains a single skill (`skills/powersync/`) following the [Agent Skills](https://agentskills.io/) specification. The skill is a collection of Markdown reference files that agents load when helping developers build with PowerSync.

```
skills/powersync/
├── CLAUDE.md           # Redirect to AGENTS.md (for Claude Code)
├── AGENTS.md           # Primary entry point for all agents (Cursor, Codex, Claude, etc.)
├── SKILL.md            # Entry point for skills.sh (includes YAML frontmatter + same content as AGENTS.md)
└── references/
    ├── sync-config.md
    ├── powersync-service.md
    ├── powersync-debug.md
    ├── powersync-overview.md
    ├── powersync-cli.md
    └── sdks/
        ├── powersync-js.md           # Foundation for all JS/TS projects
        ├── powersync-js-react.md
        ├── powersync-js-react-native.md
        ├── powersync-js-vue.md
        ├── powersync-js-node.md
        ├── powersync-js-tanstack.md
        ├── powersync-dart.md
        ├── powersync-dotnet.md
        ├── powersync-kotlin.md
        └── powersync-swift.md
```

## Types of Contributions

### Bug fixes
- Broken or outdated links
- Incorrect code examples
- API changes in a PowerSync SDK release

### Reference improvements
- Clearer explanations or examples for tricky patterns
- Missing common use cases (queries, transactions, sync lifecycle)
- Reducing token cost — replacing wide URL tables with inline explanations, removing rarely-needed content, adding skip signals to optional sections

### New SDK or framework coverage
- A new framework file (e.g. `powersync-js-solidjs.md`) following the patterns of existing files
- Additional patterns in an existing file (e.g. a new ORM integration)

### Entry point improvements
- Routing table updates when a new reference file is added
- New key rules that apply across all projects

## Writing Style

These files are read by agents, not humans. Write for clarity and token efficiency:

- **Prefer code over prose** — a working example communicates more than a paragraph of explanation.
- **Use numbered setup steps** — agents orient faster with a clear 1–2–3 sequence.
- **No filler** — skip marketing language, motivational intros, and redundant summaries.
- **Signal optional sections** — if a section is only needed for edge cases or debugging, add a skip note: `> Load this section only when…`
- **Resource table descriptions** — describe when to consult a link, not just what it is. Use the pattern: `"Full [X] guide, consult only when the inline examples don't cover your case."`

### File structure

Every reference file should have frontmatter:

```yaml
---
name: powersync-<topic>
description: One-sentence description of what this file covers
metadata:
  tags: comma, separated, trigger, keywords
---
```

Tags are used by skill routing systems for auto-activation. Use terms developers would type when asking for help: SDK names, API method names (`uploadData`, `fetchCredentials`), error terms, feature names.

### Key rules (apply to all files)

- Never define `id` in a PowerSync table schema — it is created automatically.
- Use `column.integer` (0/1) for booleans and `column.text` (ISO string) for dates.
- `connect()` is fire-and-forget — do not `await` it expecting data to be ready.
- `transaction.complete()` must always be called or the upload queue stalls permanently.
- `disconnectAndClear()` on logout, not `disconnect()`.
- Backend must return 2xx for validation errors — a 4xx blocks the upload queue permanently.

If you add an example that touches these patterns, make sure it reflects these rules.

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`.
2. Make your changes. If adding a new reference file, update the routing table in `AGENTS.md` and `SKILL.md`. (`CLAUDE.md` is a redirect and does not need changes.)
3. Test your changes by installing the skill locally and asking an agent a question that exercises the updated content:
   ```
   npx skills add <path/to/powersync-ja/agent-skills>
   ```
4. Open a PR against `main` with a clear description of what changed and why.

### PR description checklist

- What file(s) changed?
- What was wrong or missing?
- Was any content removed, and if so, why?
- If a new reference file was added, which entry point files were updated to route to it?

## Questions

Open an issue if you're unsure whether a change is in scope, or if you'd like feedback on an approach before writing a full PR.
