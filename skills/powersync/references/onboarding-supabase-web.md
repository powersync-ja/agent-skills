---
name: onboarding-supabase-web
description: Golden-path onboarding recipe for a React web app using Supabase auth with PowerSync Cloud
metadata:
  tags: onboarding, react, web, supabase, cloud, cli, dashboard, recipe
---

# React Web + Supabase + PowerSync Cloud

Use this file for the benchmark-style onboarding path: existing web app, Supabase auth already wired, PowerSync added for offline-first reads and queued uploads.

## Required Inputs

Collect these before editing app code:

- Whether the user wants **Dashboard** setup or **CLI** setup
- Whether the PowerSync Cloud instance already exists
- PowerSync instance URL, if the instance already exists
- Project ID and instance ID, if using CLI with an existing instance
- Supabase Postgres connection string, if the PowerSync source DB connection is not already configured

Only ask for the Postgres connection string when you are at the service configuration step.

## Workflow

Follow this sequence exactly:

1. Confirm the path is PowerSync Cloud + Supabase + web app.
2. Complete PowerSync Cloud setup first.
3. Verify backend readiness.
4. Only then implement app-side PowerSync integration.
5. If the UI is stuck on `Syncing...`, re-check backend readiness before touching frontend code.

## Backend Readiness Checklist

Do not move on until all items below are true:

- PowerSync instance exists
- Source DB connection is configured
- Sync config is deployed
- Client auth is configured for Supabase
- PowerSync instance URL is known
- Supabase publication exists for the synced tables

## New Cloud Instance

### Dashboard path

1. Create a project and a new PowerSync Cloud instance in the dashboard.
2. In the instance, connect the Supabase database.
3. In Sync Config, deploy the minimum sync config below.
4. In Client Auth, enable **Use Supabase Auth**.
5. If Supabase uses new signing keys, leave the JWT secret field empty.
6. Copy the instance URL for app `fetchCredentials()`.
7. Run the Supabase SQL below.

### CLI path

Prefer `PS_ADMIN_TOKEN` in autonomous or noninteractive environments.

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
4. Create and link the instance:
   ```bash
   powersync link cloud --create --project-id=<project-id>
   ```
5. Deploy service config, then sync config:
   ```bash
   powersync deploy service-config
   powersync deploy sync-config
   ```
6. Copy the instance URL and run the Supabase SQL below.

## Existing Cloud Instance

### Hard rule

Never run `powersync pull instance` after editing local config. If you need to pull config, do it first and back up local files before making any manual edits.

### Dashboard path

1. Open the existing PowerSync instance in the dashboard.
2. Verify source DB connection exists.
3. Verify sync config is deployed and correct.
4. Verify Client Auth uses Supabase Auth.
5. Copy the instance URL.
6. Verify the Supabase SQL has been run for the synced tables.

### CLI path

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
