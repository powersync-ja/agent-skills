---
name: powersync-cli
description: PowerSync CLI — managing and deploying PowerSync instances from the command line for Cloud and self-hosted setups
metadata:
  tags: cli, powersync, cloud, self-hosted, deploy, sync-config, schema, token, devops, docker, docker-compose
---

# PowerSync CLI

The PowerSync CLI manages Cloud and self-hosted PowerSync instances from the command line. It supports local config management, schema generation, development token generation, deployment, and more. See [this](https://docs.powersync.com/tools/cli.md) for any information not supplied in this document about the CLI.

## Recommended Defaults for Agents

Use these defaults unless the user explicitly wants something else:

- Prefer `PS_ADMIN_TOKEN` in autonomous or noninteractive environments.
- **`powersync login` is Cloud-only** (stores a Cloud PAT). Do not present it as the auth path for self-hosted-only setups.
- Treat `powersync login` as interactive and likely to interrupt the flow.
- Prefer `powersync deploy service-config` or `powersync deploy sync-config` over `powersync deploy` when only one file changed.
- For existing Cloud instances, pull config before manual edits and never pull again after editing unless local files were backed up first.

## High-Probability Failure Modes

- `No connection found in config` usually means the database connection was placed at the root instead of `replication.connections`.
- Sync config validation or deploy failures often mean `powersync/sync-config.yaml` is missing the top-level `config: edition: 3` wrapper.
- `powersync pull instance` silently overwrites local `service.yaml` and `sync-config.yaml`.

## Recommended Cloud Sequence

For the common Cloud path, use this order:

1. Authenticate with `PS_ADMIN_TOKEN` if available, otherwise `powersync login`.
2. Create or pull config.
3. Edit `service.yaml`.
4. Edit `sync-config.yaml`.
5. Deploy service config.
6. Deploy sync config.
7. Verify status.

## Installation
```bash
npm install -g powersync

# or run via npx (0.9.0 is the first version with the new CLI)
npx powersync@0.9.0
```

## How the CLI Resolves Instance Information

The CLI needs to know which instance to operate against. It uses the first available source in this order:

| Priority | Method | How |
|----------|--------|-----|
| 1 (highest) | Flags | `--instance-id`, `--project-id`, `--api-url`, etc. |
| 2 | Environment variables | `INSTANCE_ID`, `PROJECT_ID`, `API_URL`, etc. |
| 3 (lowest) | Link file | `powersync/cli.yaml` written by `powersync link` |

For Cloud, `--org-id` / `ORG_ID` is optional — omit it when your token has access to exactly one org. If the token covers multiple orgs, it must be provided.

## Authentication

### `powersync login` is for PowerSync Cloud only

**`powersync login`** stores a **PowerSync Cloud** personal access token (PAT). It authenticates the CLI against the **hosted PowerSync API** (create/link Cloud instances, `powersync deploy` to Cloud, `powersync fetch instances`, etc.). It is **not** used to authenticate to a **self-hosted** PowerSync service running in Docker.

| Hosting | How the CLI authenticates |
|---------|---------------------------|
| **PowerSync Cloud** | `PS_ADMIN_TOKEN` (PAT) or token from **`powersync login`** |
| **Self-hosted** | No `powersync login` for the running service. Use **`powersync init self-hosted`**, **`powersync docker configure` / `powersync docker start`**, and **`PS_ADMIN_TOKEN`** matching the self-hosted service’s admin API token (see self-hosted docs). |

Do not tell users to run `powersync login` when they are **only** using a local self-hosted stack unless they also need Cloud CLI commands.

---

Cloud commands require a PowerSync personal access token (PAT). If the user does not have one, direct them to generate one at: https://dashboard.powersync.com/account/access-tokens

Prefer `PS_ADMIN_TOKEN` when the environment is noninteractive or when the agent should avoid browser/device-login interruptions.

The CLI checks in this order (**for Cloud API calls**):

1. `PS_ADMIN_TOKEN` environment variable
2. Token stored via **`powersync login`** (macOS Keychain or config-file fallback) — **Cloud PAT only**

```bash
# Store a PowerSync Cloud PAT for local use — opens browser or paste token
# Not applicable to self-hosted-only workflows.
powersync login

# CI / one-off — set env var
export PS_ADMIN_TOKEN=your-token-here

# Inline for a single command
PS_ADMIN_TOKEN=your-token-here powersync fetch config --output=json

# Remove stored token
powersync logout
```

When secure storage is unavailable, `powersync login` asks whether to store the token in a plaintext config file after explicit confirmation. Decline and use `PS_ADMIN_TOKEN` instead.

Self-hosted instances use `PS_ADMIN_TOKEN` as the API key (not accepted via flags — use the link file or env var).

## Config Files

Define your instance and sync config in YAML files so you can version them in git, review changes before deploying, and run `powersync validate` before `powersync deploy`. The CLI uses a config directory (default `powersync/`) containing:

| File | Purpose |
|------|---------|
| `service.yaml` | Instance configuration: name, region, replication DB connection, client auth |
| `sync-config.yaml` | Sync Streams (or Sync Rules) configuration |
| `cli.yaml` | Link file (written by `powersync link`); ties this directory to an instance |

All YAML files support the `!env` custom tag for secrets and environment-specific values:

```yaml
uri: !env PS_DATABASE_URI           # string (default)
port: !env PS_PORT::number          # typed: number
enabled: !env FEATURE_FLAG::boolean # typed: boolean
```

### IDE Support

```bash
powersync configure ide   # YAML schema validation, !env custom tag, autocomplete
```

### Config Studio (built-in editor)

```bash
powersync edit config     # Monaco editor for service.yaml and sync-config.yaml
```

Config Studio provides schema-aware validation, autocomplete, and inline sync config errors. Changes are written back to your config directory.

### Cloud Secrets

For Cloud `service.yaml`, supply DB credentials from an environment variable at deploy time:

```yaml
# First deploy — supply secret via env var
password: secret: !env PS_DATABASE_PASSWORD

# After first deploy — reuse stored secret without re-supplying
password: secret_ref: default_password
```

## Cloud Usage

### New Cloud Instance

**Information the agent must collect from the user before proceeding:**
- PowerSync account (if they don't have one, direct to https://dashboard.powersync.com to sign up)
- A project on the dashboard (required before creating an instance — if they don't have one, they must create one at https://dashboard.powersync.com first)
- Project ID (find on dashboard or via `powersync fetch instances` after login)
- Org ID (only if their token covers multiple organizations)
- Database connection details (type, host, port, database name, username, password)

**Step-by-step:**

```bash
# 1. Authenticate
powersync login                               # opens browser for PAT

# 2. Scaffold config files
powersync init cloud                          # creates powersync/ with service.yaml and sync-config.yaml
```

**After `powersync init cloud`:** Read the generated `powersync/service.yaml` and `powersync/sync-config.yaml`. These contain placeholder values. Prompt the user for their database connection details and edit the files before continuing.

```bash
# 3. Create instance and deploy
powersync link cloud --create --project-id=<project-id>
# Add --org-id=<org-id> only if token has multiple orgs
# Output: "Created Cloud instance <instance-id> and updated powersync/cli.yaml."
# → Construct and save POWERSYNC_URL immediately (see "Getting POWERSYNC_URL" below)
powersync validate
powersync deploy
```

#### Cloud service.yaml Example

The database connection **must** be nested under `replication.connections` — not at the root level:

```yaml
# powersync/service.yaml — Cloud
replication:
  connections:
    - type: postgresql
      hostname: !env PS_DATABASE_HOST
      port: 5432
      database: !env PS_DATABASE_NAME
      username: !env PS_DATABASE_USER
      password:
        secret: !env PS_DATABASE_PASSWORD   # stored as Cloud secret on first deploy
      sslmode: verify-full
```

For the full `service.yaml` schema, see `references/powersync-service.md`.

#### Cloud sync-config.yaml Example

The `sync-config.yaml` **must** start with a `config: edition: 3` top-level wrapper:

```yaml
# powersync/sync-config.yaml — Cloud
config:
  edition: 3

streams:
  my_data:
    auto_subscribe: true
    query: SELECT * FROM my_table WHERE user_id = auth.user_id()
```

For the full sync config reference, see `references/sync-config.md`.

### Getting POWERSYNC_URL

The client-side `POWERSYNC_URL` follows the pattern `https://<instance-id>.powersync.journeyapps.com`.

**New instance** — the instance ID is printed when you create it. Construct and save the URL immediately:
```bash
powersync link cloud --create --project-id=<project-id>
# Output: "Created Cloud instance 69c3d035b5b902d469b2b47f and updated powersync/cli.yaml."
# → POWERSYNC_URL=https://69c3d035b5b902d469b2b47f.powersync.journeyapps.com
```

**Existing instance** — retrieve the ID from `powersync fetch instances`:
```bash
powersync fetch instances
# Note the instance id, e.g. "69a961b47c4f8b306a18fb7e"
# → POWERSYNC_URL=https://69a961b47c4f8b306a18fb7e.powersync.journeyapps.com
```

Write it to `.env` as `POWERSYNC_URL=https://<instance-id>.powersync.journeyapps.com` before writing any app code.

### Existing Cloud Instance

**Information the agent must collect from the user:**
- Project ID
- Instance ID
- Org ID (only if token covers multiple orgs)

The user can find these on the PowerSync Dashboard or by running `powersync fetch instances` after `powersync login`.

```bash
powersync login
powersync pull instance --project-id=<project-id> --instance-id=<instance-id>
# Add --org-id=<org-id> only if token has multiple orgs
```

This creates `powersync/`, writes `cli.yaml`, and downloads `service.yaml` and `sync-config.yaml`.

If the directory is already linked, `powersync pull instance` (no IDs needed) refreshes local config from the cloud.

**WARNING:** `powersync pull instance` **silently overwrites** your local `service.yaml` and `sync-config.yaml` with the remote version. Any hand-crafted or uncommitted local changes will be lost without warning or merge prompt. Always commit or back up local config files before running `pull instance`.

After pulling, edit files as needed, then:
```bash
powersync validate
powersync deploy
```

Prefer targeted deploys after edits:
```bash
powersync deploy service-config
powersync deploy sync-config
```

### Deploy Commands

```bash
powersync deploy                # deploy both service config and sync config
powersync deploy service-config # service config only (keeps cloud sync config unchanged)
powersync deploy sync-config    # sync config only (keeps cloud service config unchanged)
```

Prefer targeted deploys when only one file changed.

### One-Off Commands (No Local Config)

```bash
powersync login
powersync fetch instances                          # see available instances and IDs
powersync link cloud --instance-id=<id> --project-id=<id>
powersync generate schema
powersync generate token
```

## Self-Hosted Usage

### Self-Hosted with CLI + Docker (Recommended for Local Development)

The CLI manages a full Docker Compose stack for local development and testing.

**Prerequisites:** Docker and Docker Compose V2 (2.20.3+).

**Information the agent may need from the user:**
- If using `--database external`: the source database URI (set as `PS_DATA_SOURCE_URI`)
- If using `--storage external`: the storage database URI (set as `PS_STORAGE_SOURCE_URI`)
- If using the default options: no user input needed — the CLI provisions local Postgres for both

**Step-by-step:**

```bash
# 1. Scaffold config
powersync init self-hosted                    # creates powersync/ with service.yaml template

# 2. Configure Docker stack
powersync docker configure
# Use --database external to connect to an existing source database
# Use --storage external to use an existing storage database

# 3. Start the stack
powersync docker start                        # docker compose up -d --wait
```

**After `powersync init self-hosted`:** Read the generated `powersync/service.yaml`. If the user is connecting to an external database, prompt them for the connection URI and update the file. The `powersync docker configure` command will merge Docker-specific settings into `service.yaml` and write `cli.yaml`.

```bash
# 4. Verify and use the instance
powersync status
powersync validate
powersync generate schema --output=ts --output-path=./schema.ts
powersync generate token --subject=user-test-1
```

### Self-Hosted — Linking to an Existing Instance

For self-hosted instances already running (not managed by the CLI), the CLI can link to them for schema generation, token generation, and status checks.

**Information the agent must collect from the user:**
- API URL of the running PowerSync instance
- API token (must match a token configured in the instance's `api.tokens` setting)

```bash
powersync init self-hosted                    # scaffold config template
# Edit powersync/service.yaml (include api.tokens for API key auth)

powersync link self-hosted --api-url=https://your-powersync.example.com
# Set PS_ADMIN_TOKEN env var to match the instance's api.tokens value

powersync status
powersync generate schema
powersync generate token
```

`--api-url` is the URL the running PowerSync instance is exposed from (configured by your deployment — Docker, Coolify, etc.).

Supported self-hosted commands: `status`, `generate schema`, `generate token`, `validate`, `fetch instances`. The CLI does **not** create, deploy to, or pull config from a remote self-hosted server — you manage the server and its config yourself.

## Supplying Instance Info Without Linking

### Via Flags

```bash
# Cloud
powersync stop --confirm=yes \
  --instance-id=<id> \
  --project-id=<id>
# Add --org-id=<id> only if token has multiple orgs

# Self-hosted (API key from PS_ADMIN_TOKEN or cli.yaml)
powersync status --api-url=https://powersync.example.com
```

### Via Environment Variables

```bash
# Cloud
export INSTANCE_ID=<id>
export PROJECT_ID=<id>
# export ORG_ID=<id>   # only if token has multiple orgs
powersync stop --confirm=yes

# Self-hosted
export API_URL=https://powersync.example.com
export PS_ADMIN_TOKEN=your-api-key
powersync status --output=json

# Inline
INSTANCE_ID=<id> PROJECT_ID=<id> powersync stop --confirm=yes
API_URL=https://... PS_ADMIN_TOKEN=... powersync status
```

## Multi-Environment Setup

### Option A — Separate directories per environment

```bash
powersync deploy --directory=powersync          # production
powersync deploy --directory=powersync-dev      # dev
powersync deploy --directory=powersync-staging  # staging
```

Each directory has its own `cli.yaml` pointing at a different instance.

### Option B — Single directory with `!env` substitution

Use one `powersync/` folder and vary instance info via environment variables. Both `cli.yaml` and config files support `!env`.

`cli.yaml` (Cloud):
```yaml
type: cloud
instance_id: !env MY_INSTANCE_ID
project_id: !env MY_PROJECT_ID
org_id: !env MY_ORG_ID
```

`cli.yaml` (self-hosted):
```yaml
type: self-hosted
api_url: !env API_URL
api_key: !env PS_ADMIN_TOKEN
```

`service.yaml` (secrets and environment-specific values):
```yaml
# uri: !env PS_DATA_SOURCE_URI
# password: !env PS_DATABASE_PASSWORD
```

## Local Config Directory

The default config directory is `powersync/`. Override with `--directory`:

```bash
powersync deploy --directory=my-powersync
```

Contents of `powersync/`:
- `cli.yaml` — link file (instance identifiers, written by `powersync link`)
- `service.yaml` — service configuration (name, region, replication connection, auth)
- `sync-config.yaml` — sync rules / sync streams config

## Docker Commands Reference

For the full Docker setup workflow, see [Self-Hosted with CLI + Docker](#self-hosted-with-cli--docker-recommended-for-local-development) above.

### Stop and Reset

```bash
powersync docker stop                    # stop containers, keep them (can restart)
powersync docker stop --remove           # stop and remove containers
powersync docker stop --remove-volumes   # stop, remove containers and named volumes (implies --remove)
powersync docker reset                   # full teardown then start (docker compose down + up --wait)
```

Use `--remove-volumes` when you need init scripts to re-run on the next start (e.g. "Publication 'powersync' does not exist" error). Then run `powersync docker reset` to bring the stack back up clean.

### Docker Commands Reference

| Command | Description |
|---------|-------------|
| `powersync docker configure` | Create `docker/` layout with chosen modules, merge config into `service.yaml`, write `cli.yaml`. Remove existing `docker/` first to re-run. |
| `powersync docker start` | `docker compose up -d --wait`. Use after configure or after stop. |
| `powersync docker reset` | `docker compose down` then `docker compose up -d --wait`. Use after config changes or to clear a bad state. |
| `powersync docker stop` | Stop stack. Add `--remove` to remove containers, `--remove-volumes` to also remove volumes. |

### Docker Flags

| Flag | Applies to | Description |
|------|-----------|-------------|
| `--directory` | configure, start, reset | Config directory (default: `powersync/`). Compose dir is `<directory>/docker/`. |
| `--database` | configure | `postgres` (default) or `external` |
| `--storage` | configure | `postgres` (default) or `external` |
| `--project-name` | stop | Docker Compose project name. If omitted, reads from `cli.yaml`. |
| `--remove` | stop | Remove containers after stopping (`docker compose down`). |
| `--remove-volumes` | stop | Remove containers and named volumes (`docker compose down -v`). Implies `--remove`. |

`--database external`: set `PS_DATA_SOURCE_URI` in `powersync/docker/.env`.
`--storage external`: set `PS_STORAGE_SOURCE_URI` in `powersync/docker/.env`.

## Deploying from CI (e.g. GitHub Actions)

Keep `service.yaml` and `sync-config.yaml` in the repo (with secrets via `!env` and CI secrets), then run `powersync deploy` or `powersync deploy sync-config`.

Required CI environment variables:

| Variable | Purpose |
|----------|---------|
| `PS_ADMIN_TOKEN` | PowerSync personal access token |
| `INSTANCE_ID` | Target instance (if not using a linked directory) |
| `PROJECT_ID` | Target project (if not using a linked directory) |
| `ORG_ID` | Required only if token has multiple organizations |
| `API_URL` | Self-hosted: PowerSync API base URL |

```bash
# Example: deploy sync config on push
PS_ADMIN_TOKEN=${{ secrets.PS_ADMIN_TOKEN }} \
INSTANCE_ID=${{ vars.INSTANCE_ID }} \
PROJECT_ID=${{ vars.PROJECT_ID }} \
powersync deploy sync-config
```

## Common Commands

| Command | Description |
|---------|-------------|
| `powersync login` | Store PAT for Cloud (interactive or paste token) |
| `powersync logout` | Remove stored token |
| `powersync init cloud` | Scaffold Cloud config directory |
| `powersync init self-hosted` | Scaffold self-hosted config directory |
| `powersync configure ide` | Configure IDE for YAML schema validation and `!env` support |
| `powersync link cloud --project-id=<id>` | Link to an existing Cloud instance |
| `powersync link cloud --create --project-id=<id>` | Create a new Cloud instance and link |
| `powersync link self-hosted --api-url=<url>` | Link to a self-hosted instance by API URL |
| `powersync pull instance --project-id=<id> --instance-id=<id>` | Download Cloud config into local files |
| `powersync deploy` | Deploy full config to linked Cloud instance |
| `powersync deploy service-config` | Deploy only service config |
| `powersync deploy sync-config` | Deploy only sync config (optional `--sync-config-file-path`) |
| `powersync validate` | Validate config and sync rules/streams |
| `powersync edit config` | Open Config Studio (Monaco editor for service.yaml and sync-config.yaml) |
| `powersync migrate sync-rules` | Migrate Sync Rules to Sync Streams |
| `powersync fetch instances` | List Cloud and linked instances (optionally by project/org) |
| `powersync fetch config` | Print linked Cloud instance config (YAML/JSON) |
| `powersync status` | Instance diagnostics (connections, replication); Cloud and self-hosted |
| `powersync generate schema --output=ts --output-path=schema.ts` | Generate client-side schema |
| `powersync generate token --subject=user-123` | Generate a development JWT (see Development Tokens below) |
| `powersync destroy --confirm=yes` | [Cloud only] Permanently destroy the linked instance |
| `powersync stop --confirm=yes` | [Cloud only] Stop the linked instance (restart with deploy) |

For full usage and flags, run `powersync --help` or `powersync <command> --help`.

## Development Tokens

`powersync generate token --subject=<user-id>` generates a short-lived JWT for local development and testing.

**Cloud:** The instance manages signing keys automatically. `generate token` works immediately after `powersync deploy` with no additional `client_auth` configuration needed.

**Self-hosted:** The instance must have `client_auth` configured in `service.yaml` with a real signing key (JWKS URI, inline JWKs, Supabase Auth, or shared secret) before `generate token` will work. There is no `dev: true` auth type — that does not exist in the config schema.

```bash
powersync generate token --subject=user-test-1
# Copy the token output and use it as the JWT in fetchCredentials()
```

Dev tokens are for development only. In production, `fetchCredentials()` must return a real JWT from your auth provider.

## Migrating from the Previous CLI (0.8.0 → 0.9.0)

Version 0.9.0 is not backwards compatible with 0.8.0. To stay on the old CLI:

```bash
npm install -g @powersync/cli@0.8.0
```

Otherwise, upgrade to the latest `powersync` package and follow this mapping:

| Previous CLI | New CLI |
|-------------|---------|
| `npx powersync init` (enter token, org, project) | `powersync login` (token only). Then `powersync init cloud` to scaffold, or `powersync pull instance --project-id=... --instance-id=...` to pull an existing instance. |
| `powersync instance set --instanceId=<id>` | `powersync link cloud --instance-id=<id> --project-id=<id>` (writes `cli.yaml`). Use `--directory` for a specific folder. |
| `powersync instance deploy` (interactive or long flag list) | Edit `powersync/service.yaml` and `powersync/sync-config.yaml`, then `powersync deploy`. Config is in files, not command args. |
| `powersync instance config` | `powersync fetch config` (output as YAML or JSON with `--output`). |
| Deploy only sync rules | `powersync deploy sync-config` |
| `powersync instance schema` | `powersync generate schema --output=... --output-path=...` |
| Org/project stored by init | Pass `--org-id` and `--project-id` when needed, or use `powersync link cloud` so they are stored in `powersync/cli.yaml`. For CI, use env vars: `PS_ADMIN_TOKEN`, `INSTANCE_ID`, `PROJECT_ID`, `ORG_ID`. |

**Summary:** Authenticate with `powersync login` (or `PS_ADMIN_TOKEN` in CI). Use a config directory with `service.yaml` and `sync-config.yaml` as the source of truth. Link with `powersync link cloud` or `powersync pull instance`, then run `powersync deploy`. No more setting "current instance" separately from config — the directory and `cli.yaml` define the target.

## Known Issues and Limitations

- When secure storage is unavailable, `powersync login` may store the token in a plaintext config file after explicit confirmation.
- Self-hosted: the CLI does not create or manage instances on your server, or deploy config to it. It only links to an existing API and runs a subset of commands (`status`, `generate schema/token`, `validate`). The sole exception is Docker — it starts a local PowerSync Service in containers for development, not a remote or production instance.
- Some validation checks require a connected instance; validation of an unprovisioned instance may show errors that resolve after the first deployment.
