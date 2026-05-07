# PowerSync Skills

Use this skill to onboard a project onto PowerSync without trial-and-error. Treat this as a guided workflow first and a reference library second.

## Terminology (read first)

- **Operator** — the human directing this agent (whose request you are fulfilling). All "ask", "confirm", "tell" instructions in this skill refer to the operator unless they say otherwise.
- **User** — an end-user of the operator's PowerSync app (JWT subjects, the row a sync stream filters by, the person calling `disconnectAndClear()`, attachments owners). Used only in the app-domain sense.

If a sentence is ambiguous, default to the operator interpretation.

## Agent compliance (read first — non-negotiable)

**Follow this file’s playbook in order.** Do not skip ahead, assume defaults, or substitute your own architecture to “save time.”

| Do | Don’t |
|----|--------|
| Ask the operator for **Cloud vs self-hosted** and **which backend** if not stated | Ask which it is ( Supabase, Postgres, MSSQL, MYSQL MongoDB or self-hosted Docker) |
| Use the **PowerSync CLI** to scaffold, link (if cloud hosted), and deploy (`references/powersync-cli.md`) | Hand-write `service.yaml` / `sync-config.yaml` from scratch or invent compose files **unless** the operator explicitly says they cannot use the CLI |
| **Stop and ask** when a step needs credentials or interactive Cloud login you cannot perform | Silently build an alternate stack (e.g. manual Docker) without operator confirmation |
| Complete **backend readiness** (deployed sync config, auth, publication) **before** app code | Start React/client integration while sync is still unconfigured |
| Use **Sync Streams** (`config: edition: 3`) for new projects | Generate legacy Sync Rules YAML for new projects |

Shortcut requested? Operator must say so explicitly (e.g. “no CLI, dashboard only”).

## Continuous Use & Guardrails (existing projects)

The onboarding playbook below assumes a fresh project. On an **existing** project the rules in this section take precedence. Continuous-use sessions are where agents do the most damage — assume nothing about the linked instance, scope, or environment.

### Default scope: sync streams only

- Edit only `sync-config.yaml`.
- `service.yaml` (replication, storage, ports, auth, instance name) and `cli.yaml`? Stop and get explicit operator authorization in this conversation before editing.
- **Why:** sync-stream edits are recoverable by re-deploying; service-config or wrong-instance link changes can break replication or take down a production app.

### Confirm the target instance before any mutating command

Mutating commands: `powersync deploy`, `deploy service-config`, `deploy sync-config`, `destroy`, `stop`, `link cloud --create`, `pull instance`.

Before running any of them:

1. **Which instance?** Run `powersync fetch instances` or read `powersync/cli.yaml`; tell the operator the instance id + project.
2. **Is it production?** If the operator has not said which instances are safe, ask. Do not deploy to an instance not authorized in this session or in saved project memory.
3. `destroy`, `stop`, or any production-tagged instance → surface the command and target, wait for explicit go-ahead. One approval = one command, not a blanket pass.

`powersync pull instance` silently overwrites local `service.yaml` + `sync-config.yaml`. Back up first; never run it after local edits unless the operator accepts losing them.

### Save and reuse project memory

If your harness has a project memory or persistent notes file, record these once so the operator is not re-asked each session and you do not re-discover paths each turn:

| What to save | Example | Why |
|--------------|---------|-----|
| CLI invocation | `powersync` on PATH, `npx powersync@<v>`, project-local install | Skip reinstall / binary hunt |
| Config dir + sync-config path | `powersync/sync-config.yaml`, or non-default `--directory` | Skip re-globbing |
| Authorized instances + env | `<id-A>=dev (safe)`, `<id-B>=prod (ask first)` | Cite this before mutating commands |
| Allowed scope | `sync-config only` vs `sync-config + service-config authorized` | Default sync-config only until operator broadens |

Before acting on a saved entry naming a specific instance, file, or binary: verify it still matches reality. Stale → update the memory, do not act on it. Saved “prod = do not touch” + operator now asks for prod deploy → treat as scope expansion, confirm explicitly.

No persistent memory in your harness? Ask the operator at session start and keep answers in the active conversation.


## Always Use the PowerSync CLI

**The [PowerSync CLI](https://docs.powersync.com/tools/cli.md) is the default tool for all PowerSync operations.** Do not manually create config files, do not direct operators to the dashboard, and do not write `service.yaml` or `sync-config.yaml` from scratch. Fall back to manual config or dashboard instructions only when the operator explicitly says they can't use the CLI.

**Always load `references/powersync-cli.md`** when setting up or modifying a PowerSync instance — it contains the full command reference for Cloud, self-hosted, and Docker workflows.

## Onboarding Playbook

When the task is to add PowerSync to an app, follow this sequence:

1. **Platform.** Cloud or self-hosted?
2. **Backend.** If unspecified, ask (Supabase, custom Postgres, MongoDB, MySQL, MSSQL). Do not assume Supabase. Then load:
   - Supabase → `references/onboarding-supabase.md`
   - Anything else → `references/onboarding-custom.md` (must create a backend API with `uploadData`, token, and JWKS endpoints — do not skip this)
3. **Supabase online or local?** If unclear from project/env, ask before choosing connection strings, auth config, or references.
4. Collect required inputs before coding (see "Required Inputs Below").
5. **Load `references/sync-config.md`** and generate sync config. Source DB setup (publication SQL, replication, CDC) → `references/powersync-service.md` § "Source Database Setup". Without sync config, nothing syncs.
6. **Persist credentials to `.env` immediately.** When a CLI or dashboard returns DB credentials (host, port, db name, username, password, URI), write them to `.env` *before* deploying config or writing app code. `service.yaml` (`!env`) and app code (`fetchCredentials`) read from there. Minimum: `POWERSYNC_URL`, the Postgres URI (e.g. `PS_DATABASE_URI`), and any backend-specific keys.
7. **Create/link the instance and deploy config before app code.** CLI only — do not hand-create config files.
   - Cloud: `powersync init cloud` → edit config → `powersync link cloud --create` → `powersync deploy`
   - Self-hosted: `powersync init self-hosted` → `powersync docker configure` → `powersync docker start`
   - Source DB steps the agent cannot run (e.g. Supabase publication SQL): present the exact SQL, ask the operator to confirm done.
8. Only after backend readiness is confirmed, implement app-side PowerSync integration.

UI stuck on `Syncing...`? Default diagnosis is incomplete backend setup, not a frontend bug. Do not start client-side debugging while the service is unconfigured.

## Install Latest Dependencies

Always install PowerSync packages with `@latest`:

```bash
npm install @powersync/web@latest        # or react-native, node, etc.
npm install @journeyapps/wa-sqlite@latest
```

Never omit `@latest` for `@powersync/*` and `@journeyapps/*`. They release frequently; older cached versions miss critical fixes and APIs the sync config depends on.

## Critical Footguns

These apply to all paths. Domain-specific pitfalls are in their reference files — only load those when working in that domain.

- After any CLI op that provisions or links a service (Supabase, PowerSync, any backend), write the resulting credentials and URLs to `.env` immediately. Downstream config and app code read from `.env` and break silently if values are missing.
- `powersync pull instance` silently overwrites local `service.yaml` + `sync-config.yaml`. Back up before pulling.

Additional footguns by area (do not load unless working there):
- **Config/CLI:** `references/powersync-cli.md`, `references/powersync-service.md`, `references/sync-config.md`
- **JS/TS SDK:** `references/sdks/powersync-js.md` (type-only imports, `connect()` semantics, `transaction.complete()`)
- **React:** `references/sdks/powersync-js-react.md` (Strict Mode, Suspense, Next.js)
- **Supabase:** `references/supabase-auth.md` (JWT signing keys, publication SQL, local Supabase)
- **Custom backend:** `references/custom-backend.md` (upload endpoint rules, JWT pitfalls)

## Required Inputs Before Coding

Collect the minimum for the chosen path before changing app code. Only ask for secrets when you reach the step that needs them.

### All paths

- Backend/database (do not assume Supabase — ask if unspecified)
- Whether the PowerSync instance already exists
- PowerSync instance URL, if it exists
- Project ID + instance ID, if using CLI with an existing instance
- Source DB connection string, if PowerSync still needs it

### Additional for Supabase

- Supabase online (supabase.com) or locally hosted (`supabase start`)? If unclear from project/env, ask the operator.
- JWT signing: new signing keys or legacy JWT secret, if not obvious from setup.

### Additional for custom backends

- Auth approach (custom JWT, third-party auth provider)
- Existing backend API or build one (load `references/custom-backend.md`)

## Cloud Readiness Gate

Do not proceed to app-side code until **all** items below are verified:

- PowerSync instance exists
- Source database connection is configured
- Sync config is deployed
- Client auth is configured
- Instance URL is available for `fetchCredentials()`
- Source database replication/publication setup is complete
- All credentials and URLs are in `.env` (e.g. `POWERSYNC_URL`, `PS_DATABASE_URI`, plus any backend-specific keys)

Missing item? Finish service setup first. Use the CLI to verify and complete. For steps the agent cannot perform (e.g. running SQL in the source DB), present the exact commands and ask the operator to confirm completion before writing app code.

## First Response for `Syncing...`

Follow `references/powersync-debug.md` § "First Response When the UI Is Stuck on `Syncing...`" — verify backend readiness (endpoint URL, DB connection, sync config, client auth, replication/publication) *before* inspecting frontend code or requesting console logs.

## Setup Paths

Choose the matching path after the preflight. CLI is the default for all paths.

### Path 1: Cloud + CLI (Recommended)

Load `references/powersync-cli.md` and prefer the CLI for every step it supports:

- Create + link: `powersync link cloud --create --project-id=<project-id>`
- Deploy service config: `powersync deploy service-config`
- Deploy sync config: `powersync deploy sync-config`
- Prefer `PS_ADMIN_TOKEN` in autonomous/noninteractive environments. **`powersync login` is Cloud-only** (Cloud PAT) and only when interactive auth is acceptable.

### Path 2: Cloud + Dashboard

Use only when the operator explicitly prefers the dashboard or the CLI is unavailable.

Dashboard sequence:

1. Create or open the PowerSync project and instance.
2. Connect the source database.
3. Deploy sync config.
4. Configure client auth.
5. Copy the instance URL.
6. Verify source database replication/publication setup.

Backend is Supabase? Also load `references/supabase-auth.md`.

### Path 3: Self-Hosted + CLI (Recommended)

Load `references/powersync-cli.md`, `references/powersync-service.md`, and `references/sync-config.md`. Prefer the CLI for Docker (`powersync docker run`, `powersync docker reset`), schema generation, and any supported self-hosted op. Reminder: **`powersync login` is Cloud-only** — see `references/powersync-cli.md` § “Authentication” for self-hosted auth.

### Path 4: Self-Hosted + Manual Docker

Only when the CLI cannot be used. Load `references/powersync-service.md` and `references/sync-config.md`. Backend not Supabase? Also load `references/custom-backend.md`.

## Architecture, Routing, SDK Tables & Key Rules

Defined once in **SKILL.md** — refer there for:

- **Architecture diagram** — read/sync path (PowerSync Service → SDK) and write path (upload queue → your backend API)
- **"What to Load for Your Task"** table — tasks → starter and on-demand files
- **SDK Reference Files** tables — frameworks/platforms → reference files
- **"Key Rules to Apply Without Being Asked"** — `id` column, `connect()`, `transaction.complete()`, `disconnectAndClear()`, 4xx upload handling
