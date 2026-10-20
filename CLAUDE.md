# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [AGENTS.md](AGENTS.md) for guidance. For PowerSync work, follow [skills/powersync/AGENTS.md](skills/powersync/AGENTS.md) in full — including **Agent compliance**. **`powersync login`** = PowerSync Cloud only.

## Commands

```bash
# Validate the skill — frontmatter, file references, script syntax, version parity,
# inline credentials, and marketplace.json shape. CI runs this on every push.
pnpm validate

# Security scan after any change to files under skills/.
# Requires SNYK_TOKEN (free account at app.snyk.io/account) and uv.
export SNYK_TOKEN=<your-token>
uvx snyk-agent-scan@latest scan skills/powersync --json

# Without a Snyk account, use the demo endpoint (pin 0.5.17; newer versions need a token).
SNYK_CLI_USE=true uvx snyk-agent-scan@0.5.17 scan skills/powersync \
  --analysis-url "https://labs.snyk.io/experiments/skill-scan/api/agent-scan/analysis-machine" \
  --json

# Report which platform reference files an installed copy can drop (read-only).
node skills/powersync/scripts/trim.mjs

# Actually prune the unused files (with operator approval only).
node skills/powersync/scripts/trim.mjs --apply
```

## Verifying changes

After changing any file under `skills/`, verify the skill still passes the Snyk scanner before considering the work done. The scan must report zero issues. Common false-positive triggers and safe alternatives are documented in [README.md](README.md) under "Verifying changes with snyk-agent-scan":

- `user:password@` connection strings — use `user@host` and supply the password via a separate `!env` field
- Hex strings of 20+ characters (commit SHAs, example IDs) — link to a branch or tag instead, or zero out most characters
- Literal credential values (e.g. `password: postgres`) — use `!env` references
- Wording that reads as credential harvesting — frame as keeping credentials in `.env`

Also run `pnpm validate` before pushing. CI enforces it.

## Architecture

This repo contains a single skill at `skills/powersync/`. The skill is a collection of Markdown reference files that agents load when helping developers build with PowerSync.

### Entry points and their roles

Three files serve as entry points, each for a different consumer:

- **`skills/powersync/AGENTS.md`** — primary entry point for all agents (Cursor, Codex, Claude, etc.). Contains the mandatory Agent compliance rules and the full onboarding playbook. This is the authoritative source for how agents should behave.
- **`skills/powersync/SKILL.md`** — entry point for skills.sh installers. Carries YAML frontmatter (name, description, tags, version) plus a condensed version of the same content as AGENTS.md. Both files must stay in sync; if a rule or routing entry changes in AGENTS.md, update SKILL.md too.
- **`skills/powersync/CLAUDE.md`** — a thin redirect to AGENTS.md for Claude Code. Never edit this file directly.

If the docs change also touches CLI or auth guidance, the same content is duplicated in `references/powersync-cli.md`. Update all three copies (AGENTS.md, SKILL.md, references/powersync-cli.md) or none.

### Reference files

`references/` holds topic-specific Markdown files agents load on demand:

- `sync-config.md`, `powersync-service.md`, `powersync-debug.md`, `powersync-overview.md`, `powersync-cli.md` — service-level topics
- `sdks/powersync-js.md` — foundation for all JS/TS projects; always load before any framework-specific SDK file
- `sdks/powersync-js-react.md`, `powersync-js-react-native.md`, `powersync-js-vue.md`, etc. — per-framework files
- `sdks/powersync-dart.md`, `powersync-kotlin.md`, `powersync-swift.md`, `powersync-dotnet.md`, `powersync-rust.md` — other platform SDKs

When adding a new reference file, update the routing tables in both AGENTS.md and SKILL.md in the same PR. A file with no routing entry is unreachable. Also add it to the `PLATFORMS` table in `scripts/trim.mjs`; `pnpm validate` enforces this for `references/sdks/` files.

### Version fields

The skill version is declared in four places that must always match:

1. `package.json` `version`
2. `skills/powersync/SKILL.md` frontmatter `metadata.version` (marked `# x-release-please-version`)
3. `.claude-plugin/marketplace.json` plugin entry `version`
4. `.claude-plugin/marketplace.json` marketplace `metadata.version`

`pnpm validate` fails when they differ. Release Please owns all four fields. Do not edit them by hand and do not remove the `x-release-please-version` marker.

### Skill scripts

`skills/powersync/scripts/` ships inside every installed copy and runs in consumer repos with no `node_modules`. Scripts must be plain Node ESM that imports only `node:` builtins. `pnpm validate` enforces this with a syntax check and an import audit.

### Release flow

PR title prefixes determine the release impact that Release Please reads from the squash commit:

- `fix:` — patch release (corrections, small content updates)
- `feat:` — minor release (new reference files, SDK coverage, trigger changes)
- `docs:`, `chore:` — no release on their own
- `BREAKING CHANGE:` in the commit footer — major release

After a releasable PR lands on `main`, Release Please opens or updates a release PR. Merging that PR creates the version tag, GitHub Release, and uploads `index.json` plus the skill archive.
