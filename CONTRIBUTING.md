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

## Writing for agents (playbook enforcement)

Agents often skip long docs. When you change this skill:

1. **Keep [skills/powersync/AGENTS.md](skills/powersync/AGENTS.md) as the single source of truth** for onboarding order. Put non-negotiable rules at the top (see **Agent compliance**).
2. **Duplicate critical constraints** in `SKILL.md` (first screen for many installers) and in `references/powersync-cli.md` when the topic is CLI/auth.
3. **Root [AGENTS.md](AGENTS.md)** should stay short but **mandatory**: point to the full playbook and forbid silent shortcuts.

Optional for Cursor users in this repo: [.cursor/rules/powersync-playbook.mdc](.cursor/rules/powersync-playbook.mdc) reinforces the same rules when editing skill files.

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

## Releases and versioning

The skill has a single version declared in four places that must always match:

1. `package.json` `version`
2. `skills/powersync/SKILL.md` frontmatter `metadata.version`
3. `.claude-plugin/marketplace.json` plugin entry `version`
4. `.claude-plugin/marketplace.json` marketplace `metadata.version`

`pnpm validate` fails when they differ, and CI enforces it.

Why this matters: Claude Code re-downloads an installed plugin only when the marketplace plugin `version` string changes. Content merged without a version bump never reaches existing plugin installs.

Release Please owns these version fields. Do not edit them by hand. Instead, use a [Conventional Commit](https://www.conventionalcommits.org/) prefix in the PR title (and therefore the squash commit on `main`) to declare the release impact:

- `fix:` creates a patch release for corrections and small content updates.
- `feat:` creates a minor release for new reference files, SDK coverage, or trigger changes.
- A commit with `BREAKING CHANGE:` in its footer creates a major release for incompatible restructures.
- `docs:`, `chore:`, and other non-release prefixes do not create a release on their own.

After releasable changes land on `main`, Release Please opens or updates a release PR. Merging that PR creates the version tag and GitHub Release, then uploads `index.json` and the skill archive. The repository's `GITHUB_TOKEN` is sufficient for publishing; maintainers can configure a `RELEASE_PLEASE_TOKEN` fine-grained personal access token if release-PR activity must trigger other GitHub Actions workflows.

## Submitting a Pull Request

1. Fork the repo and create a branch from `main`.
2. Make your changes. If adding a new reference file, update the routing table in `AGENTS.md` and `SKILL.md`. (`CLAUDE.md` is a redirect and does not need changes.)
3. Test your changes by installing the skill locally and asking an agent a question that exercises the updated content:
   ```
   npx skills add <path/to/powersync-ja/agent-skills>
   ```
4. Open a PR against `main` with a clear description of what changed and why. Use a Conventional Commit PR title such as `fix: correct Dart upload guidance` or `feat: add Expo SQLite coverage`.

### PR description checklist

- What file(s) changed?
- What was wrong or missing?
- Was any content removed, and if so, why?
- If a new reference file was added, which entry point files were updated to route to it?
- Does the PR title accurately encode the release impact? Do not bump version files manually.

## Questions

Open an issue if you're unsure whether a change is in scope, or if you'd like feedback on an approach before writing a full PR.
