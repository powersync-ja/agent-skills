---
name: powersync-cli
description: PowerSync CLI — managing and deploying PowerSync instances from the command line for Cloud and self-hosted setups
metadata:
  tags: cli, powersync, cloud, self-hosted, deploy, sync-config, schema, token, devops, docker, docker-compose
---

# PowerSync CLI

The PowerSync CLI manages Cloud and self-hosted PowerSync instances from the command line. It supports local config management, schema generation, development token generation, deployment, and more.

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

Cloud commands require a PowerSync personal access token (PAT). If the user does not have one, direct them to generate one at: https://dashboard.powersync.com/account/access-tokens

The CLI checks in this order:

1. `PS_ADMIN_TOKEN` environment variable
2. Token stored via `powersync login` (macOS Keychain or config-file fallback)

```bash
# Store token for local use — opens browser to create a token or paste an existing one
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

### New Instance

```bash
powersync login
powersync init cloud                          # scaffold powersync/ directory
# Edit powersync/service.yaml and sync config
powersync link cloud --create --project-id=<project-id>   # creates instance + writes cli.yaml
# Add --org-id=<org-id> only if token has multiple orgs
powersync validate
powersync deploy
```

### Existing Instance

```bash
powersync login
powersync pull instance --project-id=<project-id> --instance-id=<instance-id>
# Creates powersync/, writes cli.yaml, downloads service.yaml and sync-config.yaml
# Add --org-id=<org-id> only if token has multiple orgs

# Edit YAML files as needed
powersync validate
powersync deploy
```

If the directory is already linked, `powersync pull instance` (no IDs needed) refreshes local config from the cloud.

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

```bash
powersync init self-hosted     # scaffold config template into powersync/
# Edit YAML files (include api.tokens for API key auth in service.yaml)

# Once your instance is deployed and reachable:
powersync link self-hosted --api-url=https://your-powersync.example.com
# Sets api_key in cli.yaml — use !env PS_ADMIN_TOKEN or set PS_ADMIN_TOKEN env var

powersync generate schema
powersync generate token
powersync status
```

`--api-url` is the URL your running PowerSync instance is exposed from (configured by your deployment — Docker, Coolify, etc.).

Supported self-hosted commands: `status`, `generate schema`, `generate token`, `validate`, `fetch instances`. The CLI does not provision or deploy to a remote server; use Docker for local development.

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

## Docker (Self-Hosted Local Stack)

`powersync docker` runs a self-hosted PowerSync stack with Docker Compose for local development and testing.

**Prerequisites:** Docker and Docker Compose V2 (2.20.3+).

### Workflow

```bash
# 1. Scaffold config and configure Docker stack
powersync init self-hosted
powersync docker configure        # links to local API automatically; creates powersync/docker/

# 2. Start the stack
powersync docker start            # docker compose up -d --wait

# 3. Use the local instance
powersync status
powersync validate
powersync generate schema --output=ts --output-path=./schema.ts
```

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
| `powersync generate token --subject=user-123` | Generate a development JWT |
| `powersync destroy --confirm=yes` | [Cloud only] Permanently destroy the linked instance |
| `powersync stop --confirm=yes` | [Cloud only] Stop the linked instance (restart with deploy) |

For full usage and flags, run `powersync --help` or `powersync <command> --help`.

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
