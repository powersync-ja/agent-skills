# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Overview

This repository contains PowerSync Agent Skills — context files that teach AI coding agents how to build applications with [PowerSync](https://powersync.com). The skills follow the [Agent Skills](https://agentskills.io/) specification and are distributed via `skills.sh` or the Codex plugin marketplace.

There is no build step, test suite, or compiled output. The deliverable is the content of the markdown files themselves.

## Repository Structure

```
skills/powersync/
├── SKILL.md        # Entrypoint — agent reads this first to understand when/how to use the skill
├── AGENTS.md       # Same content as SKILL.md; used by non-Codex agents (points to AGENTS.md)
├── AGENTS.md       # Points Codex to AGENTS.md
└── references/
    ├── powersync-overview.md
    ├── powersync-service.md
    ├── powersync-debug.md
    ├── sync-config.md
    └── sdks/
        ├── powersync-js.md              # JS/TS core — always load for any JS/TS project
        ├── powersync-js-react.md        # React web + Next.js
        ├── powersync-js-react-native.md # React Native + Expo
        ├── powersync-js-vue.md          # Vue + Nuxt
        ├── powersync-js-node.md         # Node.js + Electron
        ├── powersync-js-tanstack.md     # TanStack Query + TanStack DB
        ├── powersync-dart.md
        ├── powersync-dotnet.md
        ├── powersync-kotlin.md
        └── powersync-swift.md
```

## How Skills Are Structured

**`SKILL.md`** is the agent entrypoint. It defines:
- Frontmatter (`name`, `description`) used by the skills registry
- When the skill applies (trigger conditions)
- A reference table pointing to files in `references/`

**`references/`** contains the detailed knowledge. Each file is a standalone reference on a specific topic (SDK, service config, debugging, etc.).

**JS/TS SDK split**: The JS SDK is split across multiple files. `powersync-js.md` is always the base; framework files (`-react`, `-vue`, `-node`, etc.) are additive and do not repeat core content.

## Plugin Manifest

`.Codex-plugin/marketplace.json` defines how the Codex marketplace discovers and loads the skill. The `source` and `skills` paths are relative to the repo root.

## Package Manager

This project uses **pnpm** (`pnpm@10.30.2`). There are no scripts defined — `package.json` exists only for package metadata and registry purposes.

## Contributing New Skills or References

- New SDK references belong in `skills/powersync/references/sdks/`
- New topic references belong in `skills/powersync/references/`
- After adding a reference file, add an entry to the reference table in `SKILL.md` and `AGENTS.md`
- Keep reference files focused on a single topic; avoid duplicating content across files
