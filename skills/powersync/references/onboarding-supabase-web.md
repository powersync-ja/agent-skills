---
name: onboarding-supabase-web
description: Golden-path onboarding recipe for a React web app using Supabase auth with PowerSync Cloud
metadata:
  tags: onboarding, react, web, supabase, cloud, cli, dashboard, recipe
---

# React Web + Supabase + PowerSync Cloud

Use this file for the benchmark-style onboarding path: existing web app, Supabase auth already wired, PowerSync added for offline-first reads and queued uploads.

**Strongly prefer the [PowerSync CLI](https://docs.powersync.com/tools/cli) as the first option** for setup — creating/linking the instance, deploying service config, and deploying sync config. See `references/powersync-cli.md`. Fall back to the dashboard if the CLI is unavailable or the user explicitly prefers it.

## Required Inputs

Collect these before editing app code:

- Whether the PowerSync Cloud instance already exists
- PowerSync instance URL, if the instance already exists
- Project ID and instance ID, if using CLI with an existing instance
- Supabase Postgres connection string, if the PowerSync source DB connection is not already configured
- `PS_ADMIN_TOKEN` or willingness to run `powersync login` (for CLI deployment)

Only ask for the Postgres connection string when you are at the service configuration step.

## Workflow

Follow this sequence exactly. **Prefer the [PowerSync CLI](https://docs.powersync.com/tools/cli)** (see `references/powersync-cli.md`) as the first option to create/link the instance and to deploy service config and sync config. Try running the CLI commands directly before sending the user to the dashboard.

1. Confirm the path is PowerSync Cloud + Supabase + web app.
2. Generate the sync config and Supabase SQL based on the app's tables.
3. **Deploy backend setup before writing app code:**
   - Use `powersync deploy sync-config` and `powersync deploy service-config` to deploy directly via CLI.
   - For the Supabase publication SQL (which the agent cannot run), present the exact SQL to the user and ask them to run it in the Supabase SQL Editor and confirm when done.
   - Do not defer deployment to a post-implementation summary — the app will not sync without a deployed sync config.
4. Verify backend readiness.
5. Only then implement app-side PowerSync integration.
6. If the UI is stuck on `Syncing...`, re-check backend readiness before touching frontend code.

### Sync Config Deployment

The sync config tells the PowerSync service what data to replicate to each client. It **must** be deployed before the app will sync. Strongly prefer the [PowerSync CLI](https://docs.powersync.com/tools/cli) to deploy it (see `references/powersync-cli.md`):

```bash
powersync deploy sync-config
```

For service config changes (e.g. database connection, client auth):

```bash
powersync deploy service-config
```

Prefer the CLI for creating/linking the instance and for all deploys. If the CLI is not available or the user explicitly prefers the dashboard, instruct them to paste the sync config into the PowerSync dashboard Sync Config editor and deploy from there.

For Supabase publication SQL, the agent cannot run this directly. Present the exact SQL to the user and ask them to confirm it is done before proceeding.

## Backend Readiness Checklist

Do not move on until all items below are true:

- PowerSync instance exists
- Source DB connection is configured
- Sync config is deployed
- Client auth is configured for Supabase
- PowerSync instance URL is known
- Supabase publication exists for the synced tables

## New Cloud Instance

### CLI path (Recommended)

Prefer the [PowerSync CLI](https://docs.powersync.com/tools/cli) for every step below unless the user says otherwise. Full reference: `references/powersync-cli.md`. Prefer `PS_ADMIN_TOKEN` in autonomous or noninteractive environments.

1. Authenticate:
   ```bash
   PS_ADMIN_TOKEN=your-token-here powersync fetch instances
   ```
   If no token is available, use `powersync login` and treat it as interactive.
2. Scaffold:
   ```bash
   powersync init cloud
   ```
3. Edit `powersync/service.yaml` and `powersync/sync-config.yaml` using the minimum examples below.
4. **Create and link the instance** (prefer CLI):
   ```bash
   powersync link cloud --create --project-id=<project-id>
   ```
5. **Deploy service config, then sync config** (prefer CLI):
   ```bash
   powersync deploy service-config
   powersync deploy sync-config
   ```
6. Copy the instance URL and run the Supabase SQL below.

### Dashboard path

Only use if the user explicitly prefers the dashboard or the CLI is unavailable.

1. Create a project and a new PowerSync Cloud instance in the dashboard.
2. In the instance, connect the Supabase database.
3. In Sync Config, deploy the minimum sync config below.
4. In Client Auth, enable **Use Supabase Auth**.
5. If Supabase uses new signing keys, leave the JWT secret field empty.
6. Copy the instance URL for app `fetchCredentials()`.
7. Run the Supabase SQL below.

## Existing Cloud Instance

### Hard rule

Never run `powersync pull instance` after editing local config. If you need to pull config, do it first and back up local files before making any manual edits.

### CLI path (Recommended)

1. Authenticate with `PS_ADMIN_TOKEN` if available, otherwise `powersync login`.
2. Pull config before editing:
   ```bash
   powersync pull instance --project-id=<project-id> --instance-id=<instance-id>
   ```
3. Inspect the pulled files before making changes.
4. Edit only the files that need changes.
5. Prefer targeted deploys:
   ```bash
   powersync deploy service-config
   powersync deploy sync-config
   ```
6. Do not pull again after editing unless you first back up the local files.

## Minimum `service.yaml`

Use this structure for PowerSync Cloud with Supabase:

```yaml
# powersync/service.yaml
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATABASE_URI

client_auth:
  supabase: true
```

Rules:

- The database connection must be under `replication.connections`.
- Do not use a top-level `connections:` key.
- If using legacy Supabase JWT signing keys, add `supabase_jwt_secret`.

## Minimum `sync-config.yaml`

```yaml
config:
  edition: 3

streams:
  posts:
    auto_subscribe: true
    query: SELECT * FROM posts WHERE user_id = auth.user_id()
```

Rules:

- Keep the top-level `config:` wrapper.
- Use Sync Streams for new work.
- Scope per-user data with `auth.user_id()` when appropriate.

## Supabase SQL

Run this in the Supabase SQL Editor after the tables exist:

```sql
CREATE PUBLICATION powersync FOR TABLE posts;
ALTER TABLE posts REPLICA IDENTITY FULL;
```

If more tables should sync, add them to the publication or use `FOR ALL TABLES`.

## Client Auth Setup

For PowerSync Cloud + Supabase:

1. Enable **Use Supabase Auth** in the instance Client Auth settings.
2. If Supabase uses new signing keys, leave the JWT secret empty.
3. If Supabase uses legacy signing keys, provide the Supabase JWT secret.
4. Save and deploy.

## Verification Before App Integration

Verify all of these before changing app code:

1. `service.yaml` or dashboard DB settings point at the correct Supabase database.
2. Sync config is deployed and includes `config: edition: 3`.
3. Client Auth is enabled for Supabase.
4. The PowerSync instance URL is available.
5. The Supabase publication exists for the synced tables.

Only after that should you:

- add the SDK packages
- implement `fetchCredentials()`
- implement `uploadData`
- switch reads to local SQLite
- test offline behavior

## If the App Is Stuck on `Syncing...`

Check these in order:

1. Wrong PowerSync instance URL
2. Missing source DB connection
3. Missing or invalid sync config
4. Missing Supabase client auth setup
5. Missing Supabase publication

Do not assume the bug is in React code until all five checks pass.
