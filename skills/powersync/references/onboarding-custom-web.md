---
name: onboarding-custom-web
description: Step-by-step onboarding recipe for a web app using a custom backend (non-Supabase) with PowerSync — custom Postgres, custom JWT auth, backend API for uploadData, and client integration
metadata:
  tags: onboarding, web, custom, backend, postgres, jwt, auth, uploadData, recipe, cloud, self-hosted
---

# Web App + Custom Backend + PowerSync

Use this file when onboarding a web app onto PowerSync with a **non-Supabase backend** — your own Postgres (or other supported database), your own auth, and your own backend API. This recipe works for both PowerSync Cloud and self-hosted.

**Strongly prefer the [PowerSync CLI](https://docs.powersync.com/tools/cli.md) as the first option** for setup. See `references/powersync-cli.md`. Fall back to the dashboard (Cloud) or manual Docker config (self-hosted) only if the CLI is unavailable or the user explicitly prefers it.

## Required Inputs

Collect these before writing any code:

- **Cloud or self-hosted** — which PowerSync hosting model
- **Database type and connection details** — Postgres, MongoDB, MySQL, or MSSQL (host, port, database, username, password or connection URI)
- Whether a PowerSync instance already exists
- PowerSync instance URL, if the instance already exists
- Project ID and instance ID, if using CLI with an existing Cloud instance
- How the user wants to handle auth (custom JWT with own keys, third-party auth provider like Auth0/Firebase, or dev tokens for prototyping)
- Whether they have an existing backend API or need to create one

Only ask for secrets (database password, private keys) when you are at the step that actually needs them.

## Workflow

Follow this sequence exactly. **Do not skip ahead to app code.**

### Phase 1: Service Setup

1. **Confirm the path.** Verify: PowerSync (Cloud or self-hosted) + custom backend + web app.

2. **Set up the source database.** Based on the database type, load `references/powersync-service.md` for the relevant quick start:
   - **Postgres:** Enable logical replication (`wal_level = logical`), create a replication user, create a publication for the synced tables, set `REPLICA IDENTITY FULL` on each synced table.
   - **MongoDB:** Ensure replica set is initialized, create a user with read access + write access to `_powersync_checkpoints`.
   - **MySQL:** Enable binary logging with `ROW` format and GTIDs, create a replication user.
   - **MSSQL:** Enable CDC at database level, create a PowerSync user with required permissions.

   For managed providers (Neon, Railway, Render, PlanetScale, etc.), check whether replication is already enabled. Present the exact SQL to the user and ask them to confirm it is done.

3. **Write credentials to `.env` immediately.** As soon as database details are available, write them to the project `.env` file — do not defer:
   ```
   POWERSYNC_URL=https://your-instance.powersync.journeyapps.com  # or http://localhost:8080 for self-hosted
   PS_DATABASE_URI=postgresql://user:pass@host:5432/db
   BACKEND_URL=http://localhost:3001
   ```
   Both `service.yaml` (via `!env` tags) and app code depend on these values.

4. **Scaffold and configure PowerSync.**
   - **Cloud:** `powersync init cloud` → edit `powersync/service.yaml` and `powersync/sync-config.yaml` → `powersync link cloud --create --project-id=<id>` → `powersync deploy`
   - **Self-hosted:** `powersync init self-hosted` → `powersync docker configure` → edit `powersync/service.yaml` and `powersync/sync-config.yaml` → `powersync docker start`

   See `references/powersync-cli.md` for the full CLI reference.

5. **Generate sync config.** Load `references/sync-config.md`. Use Sync Streams (not legacy Sync Rules):
   ```yaml
   config:
     edition: 3

   streams:
     my_data:
       auto_subscribe: true
       query: SELECT * FROM my_table WHERE user_id = auth.user_id()
   ```

6. **Configure client auth.** Use custom JWT auth in `service.yaml`:
   ```yaml
   client_auth:
     jwks_uri: !env PS_JWKS_URI
     audience:
       - !env POWERSYNC_URL
   ```
   For self-hosted local development, add `block_local_jwks: false` if the JWKS URI resolves to a private IP.

   For development without full auth setup, use `powersync generate token --subject=user-1` after configuring at least one signing key.

7. **Deploy config.**
   - **Cloud:** `powersync deploy service-config` then `powersync deploy sync-config`
   - **Self-hosted:** `powersync docker reset` (picks up config changes)

### Phase 2: Backend API

Only start this after the PowerSync service is configured and running.

8. **Create the backend API.** Load `references/custom-backend.md` for full details. Your backend needs three endpoints:

   | Endpoint | Purpose |
   |----------|---------|
   | `GET /.well-known/jwks.json` | Serves your public keys — PowerSync fetches this to verify client JWTs |
   | `GET /api/auth/token` | Generates a signed PowerSync JWT for an authenticated user |
   | `POST /api/powersync/upload` | Receives writes from the client's upload queue and applies them to your database |

   Key rules for the upload endpoint:
   - Apply writes synchronously (no job queues)
   - Always return 2xx — even for validation errors (4xx blocks the queue permanently)
   - Validate `op.table` against an allowlist to prevent SQL injection

9. **Set up JWT signing.** Generate an RSA key pair (or ECDSA/EdDSA), implement the JWKS endpoint, and implement the token endpoint. See `references/custom-backend.md` § 2 for full code examples.

   Required JWT claims: `sub` (user ID), `aud` (must match PowerSync audience config), `iat`, `exp` (max 24h after iat), `kid` (must match JWKS).

10. **Verify the auth chain.** Confirm:
    - JWKS endpoint returns valid keys (`curl http://localhost:3001/.well-known/jwks.json`)
    - Token endpoint returns a signed JWT
    - PowerSync can reach the JWKS URI (use `host.docker.internal` from Docker, not `localhost`)

### Phase 3: Backend Readiness Gate

Do not proceed to app code until all items are verified:

- [ ] PowerSync instance exists and is running
- [ ] Source database connection is configured
- [ ] Source database replication/publication/CDC is set up
- [ ] Sync config is deployed with `config: edition: 3`
- [ ] Client auth is configured (JWKS URI or inline keys)
- [ ] Backend API is running (JWKS + token + upload endpoints)
- [ ] All credentials and URLs are in `.env`

If any item is missing, finish it before writing app code.

### Phase 4: App Integration

Only after Phase 3 is complete.

11. **Install SDK packages.** Load the appropriate SDK reference file for your framework:
    - JS/TS base: `references/sdks/powersync-js.md`
    - Then the framework file: `references/sdks/powersync-js-react.md`, `powersync-js-vue.md`, etc.

12. **Define the client schema.** Generate it from the deployed sync config:
    ```bash
    powersync generate schema --output=ts --output-path=./src/schema.ts
    ```
    Or write it manually — but never define the `id` column (it is automatic).

13. **Implement the backend connector.** Create `fetchCredentials()` (calls your token endpoint) and `uploadData()` (calls your upload endpoint). See `references/custom-backend.md` § 4 for full code.

    Critical: `transaction.complete()` is mandatory in `uploadData` — without it the queue stalls permanently.

14. **Initialize PowerSync and connect.**
    - `connect()` is fire-and-forget — use `waitForFirstSync()` if you need readiness before rendering.
    - Use `disconnectAndClear()` on logout or user switch.

15. **Switch reads to local SQLite** and test offline behavior.

## If the App Is Stuck on `Syncing...`

Check these in order — do not assume the bug is in frontend code:

1. PowerSync endpoint URL in `fetchCredentials()` is correct (not the backend URL)
2. Source DB connection is configured in the PowerSync service
3. Sync config is deployed with `config: edition: 3`
4. Client auth is configured and JWKS is reachable from the PowerSync service
5. Source database replication/publication/CDC is set up for the synced tables
6. Token endpoint returns a valid JWT with correct `sub`, `aud`, `kid`, and `exp`

Only inspect frontend code after all six checks pass. Load `references/powersync-debug.md` for advanced diagnostics.

## Minimum `service.yaml` Examples

### Cloud + Custom Auth

```yaml
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATABASE_URI

client_auth:
  jwks_uri: !env PS_JWKS_URI
  audience:
    - !env POWERSYNC_URL
```

### Self-Hosted + Custom Auth

```yaml
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATA_SOURCE_URI

storage:
  type: mongodb
  uri: !env PS_STORAGE_URI

client_auth:
  jwks_uri: !env PS_JWKS_URI
  audience:
    - !env POWERSYNC_URL
  block_local_jwks: false  # For local development only

api:
  tokens:
    - !env PS_ADMIN_TOKEN
```

## Common Pitfalls

1. **4xx from upload endpoint** — Blocks the upload queue permanently. Always return 2xx.
2. **Async write processing** — PowerSync expects writes reflected in the database immediately for checkpoint consistency. Do not queue writes.
3. **Missing REPLICA IDENTITY FULL** — DELETE operations won't sync to clients without it.
4. **Token `exp - iat > 86400`** — PowerSync rejects tokens with expiry > 24h.
5. **`kid` mismatch** — The JWT header `kid` must match a key in your JWKS. Causes `PSYNC_S2101`.
6. **`block_local_jwks` not set** — JWKS URIs resolving to private IPs are blocked by default. Set `block_local_jwks: false` for local development.
7. **Wrong `endpoint` in `fetchCredentials()`** — Must be the PowerSync URL, not your backend URL. Causes 404 on `/sync/stream`.
