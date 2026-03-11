---
name: custom-backend
description: Building a custom backend for PowerSync — server-side API for uploadData, custom JWT auth, Postgres setup without Supabase, and end-to-end connector examples
metadata:
  tags: backend, custom, jwt, auth, express, fastify, postgres, uploadData, api, non-supabase
---

# Custom Backend for PowerSync

Use this file when building a PowerSync integration **without Supabase** — a custom Postgres database, your own auth, and a backend API (Express, Fastify, Hono, etc.) that receives writes from the client's upload queue.

| Resource | Description |
|----------|-------------|
| [App Backend Setup](https://docs.powersync.com/configuration/app-backend/setup.md) | Overview of setting up the app backend for PowerSync. |
| [Client-Side Integration](https://docs.powersync.com/configuration/app-backend/client-side-integration.md) | How to implement a backend connector. |
| [Writing Client-Side Changes](https://docs.powersync.com/usage/writing-client-side-changes-to-your-backend.md) | Detailed guide on the upload queue and backend write flow. |
| [Custom Auth](https://docs.powersync.com/configuration/auth/custom.md) | JWT auth setup for non-Supabase backends. |
| [Development Tokens](https://docs.powersync.com/configuration/auth/development-tokens.md) | Generate tokens for local development and testing. |

## Architecture Recap

```
Client App                    Your Backend API              Postgres DB
  |                                |                           |
  |-- uploadData() POST ---------->|--- INSERT/UPDATE/DELETE -->|
  |                                |<-- 2xx response -----------|
  |                                |                           |
  |                                                            |
PowerSync Service <-------------- CDC / logical replication ---|
  |
  |-- streams synced data -------> Client App (local SQLite)
```

Key rule: **client writes never go through PowerSync**. The upload queue sends writes to YOUR backend API. PowerSync only handles the read/sync path.

## 1. Postgres Database Setup

Skip this section if using Supabase — see `references/supabase-auth.md` instead.

### Enable Logical Replication

```sql
-- Check current setting
SHOW wal_level;
-- If not 'logical', set it (requires restart):
ALTER SYSTEM SET wal_level = 'logical';
-- Restart PostgreSQL after this change
```

Most managed Postgres providers (Neon, Railway, Render, etc.) have logical replication enabled or expose a setting for it. Check your provider's docs.

### Create Replication User

Generate a secure password — never use placeholder values.

```sql
-- Create dedicated user for PowerSync replication
CREATE USER powersync_replication WITH REPLICATION PASSWORD 'YOUR_GENERATED_PASSWORD';

-- Grant read access to synced tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_replication;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_replication;
```

### Create Publication

```sql
-- List specific tables (recommended)
CREATE PUBLICATION powersync FOR TABLE users, posts, comments;

-- Or all tables (simpler but less precise)
CREATE PUBLICATION powersync FOR ALL TABLES;

-- For each synced table, set REPLICA IDENTITY FULL (required for DELETE sync)
ALTER TABLE users REPLICA IDENTITY FULL;
ALTER TABLE posts REPLICA IDENTITY FULL;
ALTER TABLE comments REPLICA IDENTITY FULL;
```

### Service Config Connection

```yaml
# powersync/service.yaml
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATA_SOURCE_URI
      # For local Postgres without SSL:
      # sslmode: disable
```

## 2. Custom JWT Auth

PowerSync verifies JWTs from client apps. Without Supabase, you must generate and serve your own JWTs and JWKS.

### Supported Algorithms

| Algorithm | Type | Recommendation |
|-----------|------|----------------|
| RS256, RS384, RS512 | Asymmetric (RSA) | Recommended for production |
| ES256, ES384, ES512 | Asymmetric (ECDSA) | Recommended for production |
| EdDSA (Ed25519, Ed448) | Asymmetric | Recommended for production |
| HS256 | Symmetric | Development only |

### Required JWT Claims

| Claim | Required | Description |
|-------|----------|-------------|
| `sub` | Yes | User ID — returned by `auth.user_id()` in sync config queries |
| `aud` | Yes | Must match the `audience` configured in PowerSync service config |
| `iat` | Yes | Issued-at timestamp (seconds since epoch) |
| `exp` | Yes | Expiry timestamp — must be at most 86400 seconds (24h) after `iat` |
| `kid` | Yes (for JWKS) | Key ID — must match a key in the JWKS |

### Generate RSA Key Pair

```bash
# Generate a 2048-bit RSA private key
openssl genpkey -algorithm RSA -out private.pem -pkeyopt rsa_keygen_bits:2048

# Extract the public key
openssl rsa -in private.pem -pubout -out public.pem
```

### Implement a JWKS Endpoint

Your backend must serve a `/.well-known/jwks.json` endpoint. PowerSync fetches this every few minutes to get the public keys for token verification.

```ts
// Using jose library: npm install jose
import { exportJWK, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';

const privateKeyPem = readFileSync('./private.pem', 'utf-8');
const KID = 'powersync-key-1'; // Stable key identifier

let cachedJwk: any = null;

export async function getJWKS() {
  if (!cachedJwk) {
    const privateKey = await importPKCS8(privateKeyPem, 'RS256');
    const jwk = await exportJWK(privateKey);
    // Only include the public key components
    cachedJwk = {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: 'RS256',
      kid: KID,
      use: 'sig',
    };
  }
  return { keys: [cachedJwk] };
}
```

### Generate JWTs (Token Endpoint)

The token endpoint generates a PowerSync JWT for an already-authenticated user. It does **not** handle user login — your app authenticates users separately via sessions, OAuth, or whatever mechanism you use. The token endpoint simply takes a `user_id` and returns a signed JWT.

```ts
import { SignJWT, importPKCS8 } from 'jose';
import { readFileSync } from 'fs';

const privateKeyPem = readFileSync('./private.pem', 'utf-8');
const KID = 'powersync-key-1';
const POWERSYNC_URL = process.env.POWERSYNC_URL || 'http://localhost:8080';

export async function generateToken(userId: string): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, 'RS256');

  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('your-app')        // Must match issuer config if set
    .setAudience(POWERSYNC_URL)   // Must match audience config
    .setExpirationTime('5m')      // Short-lived; max 24h, PowerSync refreshes automatically
    .sign(privateKey);
}
```

### PowerSync Service Config for Custom Auth

```yaml
# powersync/service.yaml
client_auth:
  # Option 1: JWKS URI (recommended — supports key rotation)
  jwks_uri: https://your-backend.com/.well-known/jwks.json
  audience:
    - powersync

  # Option 2: Inline JWKS (no external endpoint needed)
  # jwks:
  #   keys:
  #     - kty: RSA
  #       n: "..."
  #       e: "AQAB"
  #       alg: RS256
  #       kid: powersync-key-1
  #       use: sig
  # audience:
  #   - powersync
```

For local development with `host.docker.internal`:

```yaml
client_auth:
  jwks_uri: http://host.docker.internal:3001/.well-known/jwks.json
  audience:
    - powersync
  block_local_jwks: false  # Required when JWKS URI resolves to a private IP
```

### Development Tokens (Self-Hosted)

For quick development without setting up full auth, configure a signing key in `service.yaml` and use the CLI to generate tokens:

```bash
powersync generate token --user-id "test-user-123"
```

This requires `client_auth` to be configured with at least one key. See [Development Tokens](https://docs.powersync.com/configuration/auth/development-tokens.md).

### Key Rotation

When using a JWKS URI:

1. Add the new key to the JWKS endpoint (keep the old key).
2. Wait 5 minutes for PowerSync to refresh its key cache.
3. Start signing tokens with the new key.
4. Wait for all old tokens to expire (up to their `exp`).
5. Remove the old key from the JWKS endpoint.

## 3. Backend API for uploadData

The client's `uploadData()` sends pending writes to your backend API. Your backend must:

1. Accept the write operations.
2. Apply them to Postgres **synchronously** (do not queue for later processing).
3. Return 2xx — even for validation errors.

### Request/Response Contract

| Scenario | HTTP Status | Effect on Upload Queue |
|----------|-------------|----------------------|
| Success | 2xx | `transaction.complete()` advances the queue |
| Validation error | 2xx (with error details in body) | Queue advances — surface errors via a synced table |
| Transient error (DB down) | 5xx | PowerSync retries with backoff |
| Auth error / permanent failure | 4xx | **Blocks the queue permanently** — never return 4xx for data errors |

### CrudEntry Format (What the Client Sends)

Each operation in the upload queue has this shape:

```ts
interface CrudEntry {
  id: string;              // Row ID (UUID)
  op: 'PUT' | 'PATCH' | 'DELETE';
  table: string;           // Table name
  opData?: Record<string, any>;  // Column values (undefined for DELETE)
  transactionId?: number;  // Groups ops from the same writeTransaction()
}
```

- `PUT` = full insert or replace (new row or complete overwrite)
- `PATCH` = partial update (opData contains only changed columns)
- `DELETE` = deletion (opData is undefined)

### Example: Express Backend

```ts
import express from 'express';
import pg from 'pg';

const app = express();
app.use(express.json());

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// Token endpoint — client calls this in fetchCredentials()
// This does NOT handle user authentication — your app authenticates users
// separately (session, OAuth, etc.). This endpoint just generates a
// PowerSync JWT for an already-authenticated user.
app.get('/api/auth/token', async (req, res) => {
  const userId = req.query.user_id as string;
  if (!userId) return res.status(400).json({ error: 'user_id is required' });

  // Optional: verify the caller is actually this user (check session, etc.)

  const token = await generateToken(userId);
  res.json({
    token,
    powersync_url: process.env.POWERSYNC_URL,
  });
});

// JWKS endpoint — PowerSync fetches this to verify tokens
app.get('/.well-known/jwks.json', async (_req, res) => {
  const jwks = await getJWKS();
  res.json(jwks);
});

// Upload endpoint — client's uploadData() calls this
app.post('/api/powersync/upload', async (req, res) => {
  const { operations } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const op of operations) {
      switch (op.op) {
        case 'PUT': {
          const columns = Object.keys(op.opData);
          const values = Object.values(op.opData);
          const placeholders = columns.map((_, i) => `$${i + 2}`).join(', ');
          const updateSet = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
          await client.query(
            `INSERT INTO ${op.table} (id, ${columns.join(', ')})
             VALUES ($1, ${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
            [op.id, ...values]
          );
          break;
        }
        case 'PATCH': {
          const columns = Object.keys(op.opData!);
          const values = Object.values(op.opData!);
          const setClause = columns.map((col, i) => `${col} = $${i + 2}`).join(', ');
          await client.query(
            `UPDATE ${op.table} SET ${setClause} WHERE id = $1`,
            [op.id, ...values]
          );
          break;
        }
        case 'DELETE': {
          await client.query(
            `DELETE FROM ${op.table} WHERE id = $1`,
            [op.id]
          );
          break;
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Upload error:', err);
    // Return 2xx with error details — do NOT return 4xx
    res.json({ success: false, error: (err as Error).message });
  } finally {
    client.release();
  }
});

app.listen(3001, () => console.log('Backend running on :3001'));
```

**IMPORTANT:** The upload endpoint example above uses string interpolation for table names. In production, validate `op.table` against an allowlist of known tables to prevent SQL injection:

```ts
const ALLOWED_TABLES = new Set(['posts', 'comments', 'users']);
if (!ALLOWED_TABLES.has(op.table)) {
  return res.json({ success: false, error: `Unknown table: ${op.table}` });
}
```

### Boolean Conversion

PowerSync stores booleans as integers (0/1) in SQLite. If your Postgres schema uses native `boolean` columns, convert before writing:

```ts
// Convert 0/1 to true/false for boolean columns
if (op.table === 'posts' && op.opData?.is_published !== undefined) {
  op.opData.is_published = Boolean(op.opData.is_published);
}
```

## 4. Client-Side Connector (Custom Backend)

### fetchCredentials

```ts
import type { PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/web';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;     // e.g. http://localhost:3001
const POWERSYNC_URL = import.meta.env.VITE_POWERSYNC_URL;  // e.g. http://localhost:8080

export class CustomConnector implements PowerSyncBackendConnector {
  private userId: string;
  private token: string | null = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  async fetchCredentials(): Promise<PowerSyncCredentials> {
    // Request a PowerSync JWT for the current user.
    // Your app handles user authentication separately — this endpoint
    // only generates PowerSync tokens for already-authenticated users.
    const res = await fetch(
      `${BACKEND_URL}/api/auth/token?user_id=${encodeURIComponent(this.userId)}`
    );
    if (!res.ok) throw new Error('Failed to get PowerSync token');

    const { token, powersync_url } = await res.json();
    this.token = token;

    return {
      endpoint: powersync_url || POWERSYNC_URL,
      token,
    };
  }
```

### uploadData

```ts
  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    try {
      const operations = transaction.crud.map((op) => ({
        id: op.id,
        op: op.op,
        table: op.table,
        opData: op.opData,
      }));

      const res = await fetch(`${BACKEND_URL}/api/powersync/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify({ operations }),
      });

      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);

      const result = await res.json();
      if (!result.success) {
        // Log validation errors but still complete the transaction
        // to prevent queue from stalling
        console.warn('Upload had errors:', result.error);
      }

      // MUST call complete() — without this the queue stalls permanently
      await transaction.complete();
    } catch (ex) {
      // Throw to retry later — PowerSync backs off automatically
      throw ex;
    }
  }
}
```

## 5. Complete Self-Hosted Docker Compose

A full local development setup with custom Postgres, MongoDB (for PowerSync bucket storage), and the PowerSync service:

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app_password
      POSTGRES_DB: myapp
    command: ["postgres", "-c", "wal_level=logical"]
    volumes:
      - pg-data:/var/lib/postgresql/data

  mongo:
    image: mongo:7
    command: mongod --replSet rs0
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  mongo-init:
    image: mongo:7
    depends_on:
      - mongo
    restart: "no"
    entrypoint: >
      mongosh --host mongo --eval "
        try { rs.initiate({ _id: 'rs0', members: [{ _id: 0, host: 'mongo:27017' }] }); }
        catch(e) { if (e.codeName !== 'AlreadyInitialized') throw e; }
      "

  powersync:
    image: journeyapps/powersync-service:latest
    depends_on:
      - mongo
      - mongo-init
    ports:
      - "8080:8080"
    environment:
      PS_DATA_SOURCE_URI: "postgresql://app:app_password@postgres:5432/myapp"
      PS_STORAGE_URI: "mongodb://mongo:27017/powersync_storage?replicaSet=rs0"
      PS_JWKS_URI: "http://host.docker.internal:3001/.well-known/jwks.json"
      PS_ADMIN_TOKEN: "dev-admin-token"
      POWERSYNC_SYNC_CONFIG_B64: "<base64-encoded sync-config.yaml>"
    volumes:
      - ./powersync/service.yaml:/config/service.yaml
    command: ["start", "-c", "/config/service.yaml"]

volumes:
  pg-data:
  mongo-data:
```

Notes:
- `PS_JWKS_URI` uses `host.docker.internal` to reach your backend API running on the host machine.
- If Postgres is also in Docker (same compose), use the service name (`postgres:5432`) — no `host.docker.internal` needed, and no `sslmode: disable` needed.
- If Postgres is on the host (e.g. local install, Supabase), use `host.docker.internal:<port>` and add `sslmode: disable` in the service.yaml if SSL is not configured.
- Generate the base64 sync config: `base64 -i ./powersync/sync-config.yaml` (macOS) or `base64 -w0 ./powersync/sync-config.yaml` (Linux).

## Common Pitfalls

### 1. Returning 4xx from upload endpoint

A 4xx response blocks the upload queue **permanently**. Always return 2xx, even for validation errors. Surface errors through a synced table or response body, never through HTTP status codes.

### 2. Async processing of writes

Do not accept the write and process it later (e.g., via a job queue). PowerSync's checkpoint system expects writes to be reflected in Postgres immediately so they can sync back to clients. If writes are delayed, clients see stale data or missing rows.

### 3. Missing REPLICA IDENTITY FULL

Without `ALTER TABLE ... REPLICA IDENTITY FULL`, PowerSync cannot sync DELETE operations to clients. The delete will apply in Postgres but clients keep the deleted row in local SQLite.

### 4. Token expiry exceeding 24 hours

PowerSync rejects tokens with `exp - iat > 86400` (24 hours). Use 1 hour for production, up to 24 hours for development.

### 5. Missing `kid` in JWT header

If the `kid` (Key ID) in the JWT header does not match any key in the JWKS, PowerSync returns `PSYNC_S2101: Could not find an appropriate key in the keystore`. Ensure the `kid` used in `setProtectedHeader()` matches the `kid` in your JWKS endpoint.

### 6. Forgetting `block_local_jwks: false` for local development

When the JWKS URI resolves to a private IP (`host.docker.internal`, `localhost`, `127.0.0.1`), PowerSync blocks the request by default. Set `block_local_jwks: false` in your service config for local development.
