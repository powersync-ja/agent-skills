---
name: onboarding-supabase
description: Step-by-step onboarding recipe for any app using Supabase with PowerSync Cloud — orchestrates the correct sequence and points to canonical references for each step
metadata:
  tags: onboarding, supabase, cloud, recipe
---

# Supabase + PowerSync Cloud Onboarding

Use this recipe when onboarding any app onto PowerSync Cloud with a Supabase backend. This works for all platforms (web, React Native, Flutter, Kotlin, Swift, .NET, etc.).

**CLI-first.** See `references/powersync-cli.md`. Fall back to the dashboard only if the CLI is unavailable or the user explicitly prefers it.

## Required Inputs

Collect before editing app code:

- Whether the PowerSync Cloud instance already exists
- PowerSync instance URL (if instance exists)
- Project ID and instance ID (if using CLI with existing instance)
- Supabase Postgres connection string (if source DB connection not yet configured)
- `PS_ADMIN_TOKEN` or willingness to run `powersync login` (Cloud PAT only)

Only ask for the Postgres connection string when you reach the service configuration step.

**Note:** The Supabase CLI (`supabase init`, `supabase link`) does **not** create a new online Supabase project — it only scaffolds local config or links to an existing one.

## Workflow

Follow this sequence exactly. **Do not skip ahead to app code.**

### Phase 1: Service Setup

1. **Confirm the path.** PowerSync Cloud + Supabase + your platform.

2. **Write credentials to `.env` immediately.** As soon as Supabase project details are available, write `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PS_DATABASE_URI`, and `POWERSYNC_URL` to `.env`. Both `service.yaml` (via `!env` tags) and app code depend on these values. For how to get `POWERSYNC_URL`, see `references/powersync-cli.md` § "Getting POWERSYNC_URL".

3. **Run the Supabase publication SQL.** The publication must exist before PowerSync connects to the database. See `references/supabase-auth.md` § "Supabase Database Setup" for the exact SQL. Present it to the user and ask them to confirm.

4. **Scaffold and configure PowerSync.**
   - **New instance (CLI):** `powersync init cloud` → edit config → `powersync link cloud --create --project-id=<id>` → deploy
   - **New instance (Dashboard):** Create project/instance → connect database → deploy sync config → enable Supabase Auth
   - **Existing instance (CLI):** `powersync pull instance --project-id=<id> --instance-id=<id>` → edit → deploy

   See `references/powersync-cli.md` for full CLI workflow. Never run `powersync pull instance` after editing local config without backing up first.

5. **Configure service.yaml.** See `references/powersync-service.md` § "Minimal Cloud service.yaml Examples" for the Cloud + Supabase Auth template.

6. **Configure client auth.** See `references/supabase-auth.md` for all Supabase auth options (new signing keys, legacy HS256, local Supabase, manual JWKS).

7. **Generate sync config.** Load `references/sync-config.md`. Use Sync Streams with `config: edition: 3`.

8. **Deploy config** (prefer CLI):
   ```bash
   powersync deploy service-config
   powersync deploy sync-config
   ```

### Phase 2: Backend Readiness Gate

Do not proceed to app code until all items are verified:

- [ ] PowerSync instance exists and is running
- [ ] Source database connection is configured
- [ ] Supabase publication exists for synced tables
- [ ] Sync config is deployed with `config: edition: 3`
- [ ] Client auth is configured for Supabase
- [ ] All credentials and URLs are in `.env`

If any item is missing, finish it before writing app code.

### Phase 3: App Integration

Only after Phase 2 is complete.

9. **Install SDK packages.** Load the SDK reference file for your platform — see the SDK table in `SKILL.md`.

10. **Define the client schema.** Generate from deployed sync config:
    ```bash
    powersync generate schema --output=ts --output-path=./src/schema.ts
    ```
    Or write manually — but never define the `id` column (it is automatic).

11. **Implement the backend connector.** See `references/supabase-auth.md` § "fetchCredentials()" for the Supabase-specific implementation. For `uploadData`, Supabase users can write directly to Supabase via the client library or use Edge Functions.

12. **Initialize PowerSync and connect.**
    - `connect()` is fire-and-forget — use `waitForFirstSync()` if you need readiness.
    - Use `disconnectAndClear()` on logout or user switch.

13. **Switch reads to local SQLite** and test offline behavior.

## If the App Is Stuck on `Syncing...`

See `references/powersync-debug.md` § "First Response When the UI Is Stuck on `Syncing...`" — check backend readiness before inspecting frontend code.
