---
name: powersync-cli
description: PowerSync CLI — managing and deploying PowerSync instances from the command line for Cloud and self-hosted setups
metadata:
  tags: cli, powersync, cloud, self-hosted, deploy, sync-config, schema, token, devops, docker, docker-compose
---

# PowerSync CLI

The PowerSync CLI manages Cloud and self-hosted PowerSync instances from the command line. It supports local config management, schema generation, development token generation, deployment, and more.

## How the CLI Resolves Instance Information

The CLI needs to know which instance to operate against. It uses the first available source in this order:

| Priority | Method | How |
|----------|--------|-----|
| 1 (highest) | Flags | `--instance-id`, `--project-id`, `--api-url`, etc. |
| 2 | Environment variables | `INSTANCE_ID`, `PROJECT_ID`, `API_URL`, etc. |
| 3 (lowest) | Link file | `powersync/cli.yaml` written by `powersync link` |

For Cloud, `--org-id` / `ORG_ID` is optional — omit it when your token has access to exactly one org. If the token covers multiple orgs, it must be provided.

## Authentication

Cloud commands require a token (PowerSync PAT). The CLI checks in this order:

1. `PS_ADMIN_TOKEN` environment variable
2. Token stored via `powersync login` (macOS Keychain or config-file fallback)

```bash
# Store token for local use (prompts securely, not in shell history)
powersync login

# CI / one-off — set env var
export PS_ADMIN_TOKEN=your-token-here

# Inline for a single command
PS_ADMIN_TOKEN=your-token-here powersync fetch config --output=json

# Remove stored token
powersync logout
```

If secure storage is unavailable, `powersync login` asks whether to store the token in plaintext at `~/.config/powersync/config.yaml` (or `$XDG_CONFIG_HOME/powersync/config.yaml`). Decline and use `PS_ADMIN_TOKEN` instead.

Self-hosted instances use `PS_ADMIN_TOKEN` as the API key (not accepted via flags — use the link file or env var).

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
# Edit YAML files (database connection, sync config, etc.)

# Once your instance is deployed and reachable:
powersync link self-hosted --api-url=https://your-powersync.example.com
# Prompted for API key, or set PS_ADMIN_TOKEN so link file uses !env PS_ADMIN_TOKEN

powersync generate schema
powersync generate token
powersync status
```

`--api-url` is the URL your running PowerSync instance is exposed from (configured by your deployment — Docker, Coolify, etc.).

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

Type casting: append `::number` or `::boolean` to the env var name — e.g. `!env PS_PORT::number`.

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

`powersync docker` runs a self-hosted PowerSync stack with Docker Compose. Use it for local development and testing.

**Prerequisites:** a `service.yaml` in your config directory (run `powersync init self-hosted` if needed), Docker, and Docker Compose V2 (2.20.3+).

### Workflow

#### 1. Configure

```bash
powersync docker configure --database postgres --storage postgres
```

`--database` options: `postgres` (managed Postgres in the stack), `external` (existing DB — set `PS_DATA_SOURCE_URI` in `docker/.env`).

`--storage` options: `postgres` (managed Postgres for bucket metadata), `external` (set `PS_STORAGE_SOURCE_URI` in `docker/.env`).

This creates `powersync/docker/` containing:
- `docker-compose.yaml` — main compose file; mounts `service.yaml` and `sync-config.yaml`
- `.env` — default values for DB credentials, URIs, port, etc.
- `modules/` — database and storage compose partials and init scripts

It also merges replication and storage config into `powersync/service.yaml` (using `!env` so the PowerSync container resolves values from `docker/.env` at runtime) and writes `plugins.docker.project_name` to `cli.yaml`.

If `docker/` already exists, remove it before re-running configure.

#### 2. Start

```bash
powersync docker start
```

Runs `docker compose up -d --wait` and waits for all services to be healthy. No `.env` edits needed for default setups.

#### 3. Stop and Reset

```bash
powersync docker stop                    # stop containers, keep them (can restart)
powersync docker stop --remove           # stop and remove containers
powersync docker stop --remove-volumes   # stop, remove containers and named volumes (implies --remove)
powersync docker reset                   # full teardown then start (docker compose down + up --wait)
```

Use `--remove-volumes` when you need init scripts to re-run on the next start (e.g. "Publication 'powersync' does not exist" error). Then run `powersync docker reset` to bring the stack back up clean.

Use `powersync status` to debug a running instance.

### Commands Reference

| Command | Description |
|---------|-------------|
| `powersync docker configure` | Create `docker/` layout with chosen modules, merge config into `service.yaml`, write `cli.yaml`. Remove existing `docker/` first to re-run. |
| `powersync docker start` | `docker compose up -d --wait`. Use after configure or after stop. |
| `powersync docker reset` | `docker compose down` then `docker compose up -d --wait`. Use after config changes or to clear a bad state. |
| `powersync docker stop` | Stop stack. Add `--remove` to remove containers, `--remove-volumes` to also remove volumes. |

### Flags

| Flag | Applies to | Description |
|------|-----------|-------------|
| `--directory` | configure, start, reset | Config directory (default: `powersync/`). Compose dir is `<directory>/docker/`. |
| `--database` | configure | `postgres` (default) or `external` |
| `--storage` | configure | `postgres` (default) or `external` |
| `--project-name` | stop | Docker Compose project name. If omitted, reads from `cli.yaml`. Use to stop a specific project from any directory. |
| `--remove` | stop | Remove containers after stopping (`docker compose down`). |
| `--remove-volumes` | stop | Remove containers and named volumes (`docker compose down -v`). Implies `--remove`. |

### After Configure — Running Other CLI Commands

`configure` sets `api_url` and `api_key` in `cli.yaml` so other commands work against the local stack without extra flags:

```bash
powersync status
powersync validate
powersync generate schema --output=ts --output-path=./schema.ts
```
