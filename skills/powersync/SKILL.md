---
name: powersync
description: Guided onboarding and best practices for building applications with PowerSync — Cloud and self-hosted setup, sync configuration, client SDK usage, backend integration (Supabase, custom Postgres, MongoDB, MySQL, MSSQL), and debugging.
license: MIT
compatibility: Works with any skills-compatible agent. Some references include CLI commands requiring the @powersync/cli package.
metadata:
  author: powersync
  version: "1.2.0"
  organization: PowerSync
  tags: powersync, offline-first, local-first, sync-streams, sqlite, replication, uploadData, fetchCredentials, service-config, sync-config, cloud, cli, debugging, supabase, postgres, mongodb, mysql
---

# PowerSync Skills

Use this skill to onboard a project onto PowerSync without trial-and-error. Treat this as a guided workflow first and a reference library second.

**Agents:** Follow **[AGENTS.md](AGENTS.md)** in full — including **Agent compliance** (ask Cloud vs self-hosted, ask backend if unspecified, CLI-first, no silent shortcuts). **`powersync login`** is **PowerSync Cloud only** (PAT); self-hosted does not use it.

## Quick Rules

- **CLI-first.** Use the [PowerSync CLI](https://docs.powersync.com/tools/cli.md) for all operations. Do not hand-write config files. See `references/powersync-cli.md`.
- **Ask, don't assume.** Ask Cloud vs self-hosted. Ask which backend (Supabase, Postgres, MongoDB, MySQL, MSSQL). Do not default to Supabase.
- **Backend before frontend.** Deploy sync config and verify the service before writing app code.
- **Sync Streams for new projects.** Sync Rules are legacy.
- **Persist credentials immediately.** Write all URLs and keys to `.env` as soon as they are available.

## What to Load for Your Task

| Task | Start with | Load on demand |
|------|-----------|----------------|
| Supabase + PowerSync | `references/onboarding-supabase.md` | `references/supabase-auth.md`, `references/sync-config.md`, SDK files |
| Custom backend (non-Supabase) | `references/onboarding-custom.md` | `references/custom-backend.md`, `references/sync-config.md`, SDK files |
| New project setup | `references/powersync-cli.md` + `references/powersync-service.md` | `references/sync-config.md`, SDK files |
| Self-hosting / service config | `references/powersync-service.md` + `references/powersync-cli.md` | `references/sync-config.md` |
| Writing sync config | `references/sync-config.md` | — |
| Debugging sync issues | `references/powersync-debug.md` | — |
| Attachments | `references/attachments.md` | — |
| Architecture overview | `references/powersync-overview.md` | — |

## SDK Reference Files

### JavaScript / TypeScript

Always load `references/sdks/powersync-js.md` for any JS/TS project, then load the applicable framework file.

| Framework | File | Load early if… |
|-----------|------|----------------|
| React / Next.js | `references/sdks/powersync-js-react.md` | Vite + React project — contains the required `vite.config.ts` setup (`optimizeDeps.exclude`, `worker.format: 'es'`) needed before installing packages |
| React Native / Expo | `references/sdks/powersync-js-react-native.md` | |
| Vue / Nuxt | `references/sdks/powersync-js-vue.md` | |
| Node.js / Electron | `references/sdks/powersync-js-node.md` | |
| TanStack | `references/sdks/powersync-js-tanstack.md` | |

### Other SDKs

| Platform | File |
|----------|------|
| Dart / Flutter | `references/sdks/powersync-dart.md` |
| .NET | `references/sdks/powersync-dotnet.md` |
| Kotlin | `references/sdks/powersync-kotlin.md` |
| Swift | `references/sdks/powersync-swift.md` |

## Key Rules to Apply Without Being Asked

- Never define the `id` column in a PowerSync table schema; it is created automatically.
- Use `column.integer` for booleans and `column.text` for ISO date strings.
- `connect()` is fire-and-forget. Use `waitForFirstSync()` if you need readiness.
- `transaction.complete()` is mandatory or the upload queue stalls permanently.
- `disconnectAndClear()` is required on logout or user switch when local data must be wiped.
- A 4xx response from `uploadData` blocks the upload queue permanently; return 2xx for validation errors.
