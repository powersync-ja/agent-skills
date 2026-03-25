---
name: supabase-auth
description: Configuring PowerSync with Supabase — database publication setup, JWT signing keys, Cloud dashboard setup, self-hosted service.yaml config, fetchCredentials() implementation, and error codes
metadata:
  tags: supabase, auth, jwt, jwks, client_auth, fetchCredentials, authentication, hs256, rs256, publication, replica-identity
---

# PowerSync + Supabase Auth

PowerSync verifies Supabase JWTs directly when connected to a Supabase-hosted Postgres database. This file covers everything needed to configure authentication end-to-end.

## Supabase Database Setup

Supabase already has logical replication enabled at the WAL level. You still need to create a publication so PowerSync knows which tables to replicate, and set `REPLICA IDENTITY FULL` on each table so that DELETE operations include the full row (required for PowerSync to sync deletes to clients).

Run this in the Supabase SQL Editor **after creating your tables**:

```sql
-- Create the PowerSync publication (required)
-- List every table PowerSync should replicate
CREATE PUBLICATION powersync FOR TABLE lists, todos;
```

When you add a new table that PowerSync should replicate, add it to the publication. To replicate all current and future tables automatically (simpler but less precise):

```sql
CREATE PUBLICATION powersync FOR ALL TABLES;
```

## JWT Signing Key Types

Supabase projects use one of two signing key types. **Check which your project uses** at [Project Settings → JWT](https://supabase.com/dashboard/project/_/settings/jwt) in the Supabase Dashboard before configuring PowerSync.

| Type | Algorithm | Notes |
|------|-----------|-------|
| **New JWT signing keys** | RS256 (asymmetric) | Recommended. PowerSync auto-detects from the connection string. |
| **Legacy JWT signing keys** | HS256 (symmetric) | Requires supplying the JWT secret to PowerSync. Consider migrating. |

---

## PowerSync Cloud Setup

Configure via the **Client Auth** section of your instance in the [PowerSync Dashboard](https://dashboard.powersync.com/).

### New JWT signing keys (recommended)

1. Enable the **Use Supabase Auth** checkbox.
2. Leave the **Supabase JWT Secret** field empty.
3. Click **Save and Deploy**.

PowerSync auto-detects your Supabase project from the database connection string and configures the JWKS URI (`https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`) and JWT audience (`authenticated`) automatically.

### Legacy JWT signing keys (HS256)

1. Enable the **Use Supabase Auth** checkbox.
2. Copy your **JWT Secret** from Supabase → [Project Settings → JWT](https://supabase.com/dashboard/project/_/settings/jwt).
3. Paste it into the **Supabase JWT Secret (Legacy)** field.
4. Click **Save and Deploy**.

### Manual JWKS (non-standard connections)

Use this when PowerSync cannot auto-detect your Supabase project (self-hosted Supabase, local Docker, non-standard connection string):

1. Leave **Use Supabase Auth** unchecked.
2. Add a **JWKS URI**, e.g. `http://localhost:54321/auth/v1/.well-known/jwks.json`.
3. Add `authenticated` as an accepted **JWT Audience**.
4. Click **Save and Deploy**.

> Skipping the `authenticated` audience causes `PSYNC_S2105` errors — see Troubleshooting below.

---

## Self-Hosted `service.yaml` Config

### New JWT signing keys (recommended)

PowerSync auto-detects the Supabase project from the connection string:

```yaml
client_auth:
  supabase: true
```

PowerSync automatically sets:
- JWKS URI: `https://<project-ref>.supabase.co/auth/v1/.well-known/jwks.json`
- Audience: `authenticated`

### Legacy JWT signing keys (HS256)

```yaml
client_auth:
  supabase: true
  supabase_jwt_secret: !env SUPABASE_JWT_SECRET
```

Get the secret from Supabase → Project Settings → JWT. Use `!env` to avoid hardcoding secrets.

### Local Supabase (`supabase start`)

**IMPORTANT:** Local Supabase (via `supabase start`) uses **ES256 asymmetric JWT signing keys**, not the legacy HS256 shared secret. This means:

- `supabase: true` alone **will not work** — it cannot auto-detect a local project from the connection string.
- `supabase: true` + `supabase_jwt_secret` **will not work** — it registers an HS256 key, but local Supabase issues ES256 tokens with a `kid` that doesn't match.
- You **must** use manual JWKS pointing to the local Supabase JWKS endpoint.

The error you'll see if misconfigured:
```
PSYNC_S2101: Could not find an appropriate key in the keystore. The key is missing or no key matched the token KID
```
With details showing: `Known keys: <kid: *, kty: oct, alg: HS256>` but the token has `alg: ES256` with a specific `kid`.

**Correct config for local Supabase:**

```yaml
client_auth:
  # Use host.docker.internal to reach the host machine from inside the PowerSync Docker container.
  # Alternatively, use the Supabase Kong container name (e.g. supabase_kong_<project-id>)
  # if both are on the same Docker network.
  jwks_uri: http://host.docker.internal:54321/auth/v1/.well-known/jwks.json
  audience:
    - authenticated
  block_local_jwks: false
```

Key details:
- Use `host.docker.internal` or the Supabase container name (not `localhost`) because this URI is resolved **from inside the PowerSync Docker container**.
- `block_local_jwks: false` is required because `host.docker.internal` resolves to a local/private IP, which PowerSync blocks by default.
- The well-known local Supabase JWT secret (`super-secret-jwt-token-with-at-least-32-characters-long`) is **not used** for token signing in newer Supabase versions — it's only used for the service role key and anon key.

**SSL for local Supabase Postgres:** Local Supabase does not support SSL. You **must** set `sslmode: disable` on the replication connection in `service.yaml`. The `sslmode=disable` query string in the URI alone does not work — pgwire ignores it. Use the YAML key instead:

```yaml
replication:
  connections:
    - type: postgresql
      uri: postgresql://postgres:postgres@host.docker.internal:54322/postgres
      sslmode: disable
```

Without this you will see: `Replication error postgres does not support ssl`.

You can verify your local Supabase is using ES256 by checking:
```bash
curl -s http://127.0.0.1:54321/auth/v1/.well-known/jwks.json
# Returns: {"keys":[{"alg":"ES256","crv":"P-256","kty":"EC",...}]}
```

### Manual JWKS (other non-standard connections)

Use when `supabase: true` cannot auto-detect the project (e.g. self-hosted Supabase, custom auth proxy):

```yaml
client_auth:
  jwks_uri: http://localhost:54321/auth/v1/.well-known/jwks.json
  audience:
    - authenticated
```

> Do **not** combine `supabase: true` with `jwks_uri`. Use one or the other.

---

## `fetchCredentials()` — Client Implementation

`fetchCredentials()` in your backend connector should return the Supabase session JWT. The examples below use the JS Supabase client; equivalent patterns exist for [Dart](https://github.com/powersync-ja/powersync.dart/blob/9ef224175c8969f5602c140bcec6dd8296c31260/demos/supabase-todolist/lib/powersync.dart#L38) and [Kotlin](https://github.com/powersync-ja/powersync-kotlin/blob/main/connectors/supabase/src/commonMain/kotlin/com/powersync/connector/supabase/SupabaseConnector.kt).

### Standard Supabase Auth (JS/TS)

```ts
import { createClient } from '@supabase/supabase-js';
import type { PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/web'; // or @powersync/react-native

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const connector: PowerSyncBackendConnector = {
  async fetchCredentials(): Promise<PowerSyncCredentials> {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) throw error ?? new Error('No session');
    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
      expiresAt: new Date(session.expires_at! * 1000),
    };
  },
  // ...uploadData
};
```

### Anonymous Sign-In (JS/TS)

```ts
async fetchCredentials(): Promise<PowerSyncCredentials> {
  // Sign in anonymously if no session exists
  let { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    session = data.session!;
  }
  return {
    endpoint: POWERSYNC_URL,
    token: session.access_token,
    expiresAt: new Date(session.expires_at! * 1000),
  };
},
```

`fetchCredentials` is called automatically on reconnect — always return a fresh token, never a cached one.

### `uploadData()` — Writing Changes Back to Supabase

For Supabase backends, `uploadData` writes client-side changes directly to Supabase using the Supabase JS client. **`transaction.complete()` is mandatory** — without it the upload queue stalls permanently.

```ts
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector, CrudEntry, UpdateType } from '@powersync/web';

export const connector: PowerSyncBackendConnector = {
  async fetchCredentials() { /* ... see above ... */ },

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      for (const op of transaction.crud) {
        const { op: opType, table, opData, id } = op;
        if (opType === UpdateType.PUT) {
          const { error } = await supabase.from(table).upsert({ ...opData, id });
          if (error) throw error;
        } else if (opType === UpdateType.PATCH) {
          const { error } = await supabase.from(table).update(opData).eq('id', id);
          if (error) throw error;
        } else if (opType === UpdateType.DELETE) {
          const { error } = await supabase.from(table).delete().eq('id', id);
          if (error) throw error;
        }
      }
      await transaction.complete(); // REQUIRED — clears the queue entry
    } catch (error) {
      // For 4xx errors (permanent failures), complete the transaction to avoid
      // blocking the queue. For 5xx/network errors, throw to trigger a retry.
      console.error('Upload error', error);
      throw error;
    }
  }
};
```

**Important:** RLS policies on your Supabase tables must allow the authenticated user to write their own rows. If `uploadData` consistently gets 4xx errors, the queue stalls — call `transaction.complete()` and log the error rather than retrying forever.

### Getting the PowerSync Instance URL

See `references/powersync-cli.md` § "Getting POWERSYNC_URL" — the instance ID is printed by `powersync link cloud --create` and the URL pattern is `https://<instance-id>.powersync.journeyapps.com`. Write it to `.env` before writing app code.

For self-hosted, the URL is whatever hostname your PowerSync Docker service is exposed on (e.g. `http://localhost:8080`).

---

## `auth.user_id()` in Sync Streams

`auth.user_id()` returns the Supabase user's UUID (the `sub` claim from the JWT). Use it to scope sync queries per user:

```yaml
streams:
  my_todos:
    auto_subscribe: true
    query: SELECT * FROM todos WHERE user_id = auth.user_id()
```

For Sync Rules (legacy), use `request.user_id()` instead.

---

## Kotlin: Built-in Supabase Connector

The Kotlin SDK includes a first-party Supabase connector that handles `fetchCredentials` and session management automatically:

```kotlin
// build.gradle.kts
implementation("com.powersync:connector-supabase:$powersyncVersion")
```

```kotlin
val connector = SupabaseConnector(
    supabaseUrl = "https://your-project.supabase.co",
    supabaseKey = "your-anon-key",
    powerSyncEndpoint = "https://your-instance.powersync.journeyapps.com",
)
```

---

## Troubleshooting

### `PSYNC_S2101` — Could not find an appropriate key in the keystore

PowerSync cannot verify the JWT signature. Check the error logs for `Known keys` and `tokenDetails` to diagnose the mismatch.

| Cause | Symptom | Solution |
|-------|---------|---------|
| **Local Supabase with `supabase_jwt_secret`** | Known keys show `HS256` but token uses `ES256` with a specific `kid` | Local Supabase uses ES256 asymmetric keys. Switch to manual JWKS config — see "Local Supabase" section above. |
| Incomplete Supabase key migration | Token `alg` doesn't match keystore | Complete the "Rotate to asymmetric JWTs" step in the [Supabase migration guide](https://supabase.com/blog/jwt-signing-keys#start-using-asymmetric-jwts-today). |
| Stale tokens after migration | Old tokens fail, new logins work | Have users sign out and back in to receive new tokens. |
| Auto-detection failed | `supabase: true` but no keys registered | PowerSync couldn't detect your Supabase project from the connection string. Use manual JWKS config. |
| Wrong JWT secret | HS256 verification fails | For legacy HS256 keys, verify the secret matches Supabase → Project Settings → JWT. |
| `block_local_jwks` blocking JWKS fetch | JWKS URI resolves to private IP, keys never fetched | Set `block_local_jwks: false` for local development. |

### `PSYNC_S2105` — JWT payload is missing a required claim "aud"

Using manual JWKS config without specifying an audience. Add `authenticated` to the audience list (Cloud dashboard or `audience: [authenticated]` in `service.yaml`).

### Auto-detection warning

If you see:
```
Supabase Auth is enabled, but no Supabase connection string found. Skipping Supabase JWKS URL configuration.
```

PowerSync couldn't detect your project from the connection string. Switch to manual JWKS configuration.

---

## Migrating from Legacy to New JWT Signing Keys

1. Follow **all steps** in the [Supabase JWT migration guide](https://supabase.com/blog/jwt-signing-keys#start-using-asymmetric-jwts-today), including the **"Rotate to asymmetric JWTs"** step. The migration is not complete without this step.
2. Update PowerSync config:
   - **Cloud / self-hosted with standard connection**: No change needed — PowerSync auto-detects the new JWKS. Remove any previously set legacy JWT secret.
   - **Manual JWKS**: Ensure `jwks_uri` points to the Supabase JWKS endpoint and `authenticated` is in the audience list.
3. Have all users sign out and sign back in to receive tokens signed with the new keys.
