---
name: powersync-service
description: PowerSync Service configuration — self-hosting, Docker, source database setup, bucket storage, authentication, and PowerSync Cloud
metadata:
  tags: service, self-hosted, docker, postgresql, mongodb, mysql, mssql, authentication, jwt, replication, configuration
---

# PowerSync Service

Guidance for configuring PowerSync Service, sync config, and database replication.

Critical warnings for fast setup:

- Cloud and self-hosted service config both use `replication.connections`, never a root-level `connections`.
- If the app is stuck on `Syncing...`, the default diagnosis is incomplete backend setup: missing DB connection, missing sync config, missing client auth, or missing publication.

For source code see: [powersync-service](https://github.com/powersync-ja/powersync-service/)

For debugging see: [powersync-debug.md](references/powersync-debug.md).

## Sync Config

The rules that instruct the PowerSync Service what data to replicate and download to client application.

See [sync-config.md](references/sync-config.md) for detailed information.

## Service Configuration (Self-hosted)

Information on how to configure a PowerSync Service instance in a self-hosted environment. 

### Docker Image
The PowerSync Service Docker image is available on [Docker hub](https://hub.docker.com/r/journeyapps/powersync-service).

Quick Start:
```
docker run \
-p 8080:8080 \
-e POWERSYNC_CONFIG_B64="$(base64 -i ./config.yaml)" \
--network my-local-dev-network \
--name my-powersync journeyapps/powersync-service:latest
```

> **Port mapping:** The PowerSync service listens on port **8080** inside the container. Use `-p 8080:8080` (or `-p <host-port>:8080`). Do **not** use `8080:80` — the service does not listen on port 80.

### Configuration

There are four configuration methods available:
1. Base64-encoded config in the `POWERSYNC_CONFIG_B64` environment variable
2. Config file on a mounted volume (pass path with `-c` / `--config-path`)
3. Base64-encoded config as a command-line argument (`-c64`)
4. Sync config separately via `POWERSYNC_SYNC_CONFIG_B64` environment variable or `-sync64` flag

> **Sync config flag:** The Docker image does **not** accept a `-s` flag for sync config. Use the `POWERSYNC_SYNC_CONFIG_B64` environment variable or the `-sync64` command-line flag instead.

#### Docker Compose with mounted config + sync config

```yaml
powersync:
  image: journeyapps/powersync-service:latest
  ports:
    - "8080:8080"
  environment:
    PS_DATA_SOURCE_URI: "postgresql://user:pass@host:5432/db"
    PS_STORAGE_URI: "mongodb://mongo:27017/powersync_storage"
    POWERSYNC_SYNC_CONFIG_B64: "<base64-encoded sync-config.yaml>"
  volumes:
    - ./powersync/service.yaml:/config/service.yaml
  command: ["start", "-c", "/config/service.yaml"]
```

Generate the base64 value: `base64 -i ./powersync/sync-config.yaml` (macOS) or `base64 -w0 ./powersync/sync-config.yaml` (Linux).

| Resource                        | Description                                                                                                             |
|----------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| [Configuration File Structure](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances.md#configuration-file-structure) | Outline of all possible configuration options                                   |
| [Config Schema](https://unpkg.com/@powersync/service-schema@1.20.0/json-schema/powersync-config.json)                | JSON schema reference for PowerSync Service config                               |
| [self-host-demo](https://github.com/powersync-ja/self-host-demo) repo                                            | Example configurations for local development                                     |

#### Environment variable substitution
Use !env PS_VARIABLE_NAME in YAML for config values.

### Complete service.yaml Example

Below is a minimal but complete `service.yaml` for a self-hosted instance. Pay close attention to the YAML nesting — in particular, the database connection **must** be under `replication.connections`, not a top-level `connections` key.

```yaml
# powersync/service.yaml — self-hosted
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATA_SOURCE_URI   # e.g. postgresql://user:pass@host:5432/db

storage:
  type: mongodb
  uri: !env PS_STORAGE_URI           # e.g. mongodb://localhost:27017/powersync

# Client auth — required before `powersync generate token` works
client_auth:
  jwks_uri: !env PS_JWKS_URI

# API key for CLI access (matches PS_ADMIN_TOKEN)
api:
  tokens:
    - !env PS_ADMIN_TOKEN
```

### Minimal Cloud service.yaml Examples

For PowerSync Cloud, the minimal shape depends on your auth provider.

**Cloud + Supabase Auth:**

```yaml
# powersync/service.yaml — Cloud with Supabase
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATABASE_URI

client_auth:
  supabase: true
```

**Cloud + Custom Auth (JWKS):**

```yaml
# powersync/service.yaml — Cloud with custom JWT auth
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATABASE_URI

client_auth:
  jwks_uri: !env PS_JWKS_URI
  audience:
    - !env POWERSYNC_URL
```

Choose the example that matches your auth provider. See `references/supabase-auth.md` for Supabase details or `references/custom-backend.md` for custom JWT setup.

### Replication connections

**IMPORTANT:** The database connection **must** be nested under `replication.connections` — not a top-level `connections` key. Placing it elsewhere (e.g. `connections:` at the root) will cause a "No connection found in config" error.

Only one source database connection is supported per instance. Example:
```yaml
replication:
  connections:
    - type: postgresql
      uri: postgresql://user:pass@host:5432/db
```

#### SSL mode for local databases

Local Postgres instances (including local Supabase via `supabase start`) do not support SSL. The PowerSync service uses pgwire for replication, which defaults to SSL and **does not respect `sslmode=disable` in the URI query string**. You must set `sslmode` as a separate YAML key:

```yaml
replication:
  connections:
    - type: postgresql
      uri: !env PS_DATA_SOURCE_URI
      sslmode: disable   # Required for local Postgres / local Supabase
```

Without this, you will see: `Replication error postgres does not support ssl`.

### Bucket Storage Database
This is required by PowerSync and can be configured in two different ways. This is separate from the source DB.

| Storage Database | Configuration Reference                                                                                   |
|-----------------|--------------------------------------------------------------------------------------------------------------|
| MongoDB         | [MongoDB Storage](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances.md#mongodb-storage) |
| Postgres        | [Postgres Storage](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances.md#postgres-storage) |

### Client Authentication

There are various options when configuring client authentication on a PowerSync Service instance, see [Client Authentication](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances.md#client-authentication) for more information on the options. The options include: JWKS URI, inline JWKs, Supabase Auth, Shared Secrets. Prefer asymmetric keys (RS256, EdDSA, ECDSA) over shared secrets (HS256).

**Important:** There is no `dev: true` auth type in the `client_auth` config schema. It does not exist. For development tokens on self-hosted, configure a real signing key first, then use `powersync generate token`. On PowerSync Cloud, users need to enable development tokens via the dashboard in the Client Auth section of the instance. 


## PowerSync Cloud Setup

PowerSync Cloud can be set up via the **Dashboard** (UI) or the **CLI**. Both paths require the same four steps. **If any step is missing, the app will be stuck on "Syncing..." with no data.**

| Step | Dashboard | CLI |
|------|-----------|-----|
| 1. Create instance | Dashboard → New Instance | `powersync link cloud --create --project-id=<id>` |
| 2. Connect source DB | Instance Settings → Database | Edit `powersync/service.yaml` → `replication.connections`, then `powersync deploy` |
| 3. Deploy sync config | Instance → Sync Config editor | Edit `powersync/sync-config.yaml`, then `powersync deploy sync-config` |
| 4. Enable client auth | Instance → Client Auth section | Edit `powersync/service.yaml` → `client_auth`, then `powersync deploy service-config` |

**IMPORTANT:** All four steps must be completed. The most common cause of an app stuck on "Syncing..." is a missing or misconfigured step above — typically the database connection or sync config not being deployed.

For full CLI setup workflow, see `references/powersync-cli.md` → Cloud Usage.

See [PowerSync Cloud Instances](https://docs.powersync.com/configuration/powersync-service/cloud-instances.md) for detailed dashboard step-by-step instructions.

## Source Database Setup

Important: For all database user creation below, generate a cryptographically secure password (e.g., `openssl rand -base64 32` or a password manager). Never use placeholder values like `secure_password`, `password`, or `admin123` in production—these are unsafe and must not be suggested to users.

See [Source Database Setup](https://docs.powersync.com/configuration/source-db/setup.md) for more information about specific DB host requirements. 

Both PowerSync Cloud and Self-hosted require the same base source database setup.

### PostgreSQL Quick Start

```sql
-- 1. Enable logical replication (skip this step for Supabase — it is already enabled)
ALTER SYSTEM SET wal_level = 'logical';
-- Restart PostgreSQL after this

-- 2. Create replication user (replace with a generated secure password—do NOT use "secure_password")
CREATE USER powersync_replication WITH REPLICATION PASSWORD 'YOUR_GENERATED_PASSWORD';

-- 3. Grant read access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_replication;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_replication;

-- 4. Create publication (list every table PowerSync should replicate)
CREATE PUBLICATION powersync FOR TABLE users, todos, lists;

-- OR to replicate all current and future tables automatically:
CREATE PUBLICATION powersync FOR ALL TABLES;
```

### MongoDB Quick Start

```javascript
// MongoDB requires a replica set (standalone instances are NOT supported)
// Sharded clusters (including MongoDB Serverless) are NOT supported

// 1. Initialize replica set (if not already)
rs.initiate()

// 2. Create user with required privileges (replace with a generated secure password—do NOT use "secure_password")
// PowerSync needs read access to synced collections AND write access to _powersync_checkpoints
db.createUser({
  user: "powersync",
  pwd: "YOUR_GENERATED_PASSWORD",
  roles: [
    { role: "read", db: "your_database" },
    // Required: find, insert, update, remove, changeStream, createCollection on _powersync_checkpoints
    { role: "readWrite", db: "your_database", collection: "_powersync_checkpoints" },
    // Required: listCollections on the database
    { role: "dbAdmin", db: "your_database" }
  ]
})

// Change streams are used automatically
```

### MySQL Quick Start

```sql
-- 1. Enable binary logging and GTID (in my.cnf or my.ini)
-- [mysqld]
-- server-id = 1
-- log_bin = mysql-bin
-- binlog_format = ROW
-- binlog_row_image = FULL
-- gtid_mode = ON
-- enforce-gtid-consistency = ON

-- 2. Create replication user (replace with a generated secure password—do NOT use "secure_password")
CREATE USER 'powersync'@'%' IDENTIFIED BY 'YOUR_GENERATED_PASSWORD';
GRANT REPLICATION SLAVE, REPLICATION CLIENT, RELOAD ON *.* TO 'powersync'@'%';
GRANT SELECT ON your_database.* TO 'powersync'@'%';
FLUSH PRIVILEGES;
```

### SQL Server (MSSQL) Quick Start

```sql
-- 1. Enable CDC at database level
USE [YourDatabase];
EXEC sys.sp_cdc_enable_db;

-- 2. Create PowerSync user (replace with a generated secure password—do NOT use "secure_password")
CREATE LOGIN powersync_user WITH PASSWORD = 'YOUR_GENERATED_PASSWORD', CHECK_POLICY = ON;
CREATE USER powersync_user FOR LOGIN powersync_user;

-- 3. Grant permissions
USE [master];
GRANT VIEW SERVER PERFORMANCE STATE TO powersync_user;

USE [YourDatabase];
GRANT VIEW DATABASE PERFORMANCE STATE TO powersync_user;
ALTER ROLE db_datareader ADD MEMBER powersync_user;
ALTER ROLE cdc_reader ADD MEMBER powersync_user;

-- 4. Create required checkpoints table
CREATE TABLE dbo._powersync_checkpoints (
    id INT IDENTITY PRIMARY KEY,
    last_updated DATETIME NOT NULL DEFAULT (GETDATE())
);
GRANT INSERT, UPDATE ON dbo._powersync_checkpoints TO powersync_user;

-- 5. Enable CDC on checkpoints table
EXEC sys.sp_cdc_enable_table
    @source_schema = N'dbo',
    @source_name   = N'_powersync_checkpoints',
    @role_name     = N'cdc_reader',
    @supports_net_changes = 0;

-- 6. Enable CDC on each synced table
EXEC sys.sp_cdc_enable_table
    @source_schema = N'dbo',
    @source_name   = N'todos',
    @role_name     = N'cdc_reader',
    @supports_net_changes = 0;

-- 7. Optional: Reduce polling interval (default 5s)
-- pollinginterval = 0: fastest, highest CPU
-- pollinginterval = 1: 1 second, good production compromise
EXEC sys.sp_cdc_change_job @job_type = N'capture', @pollinginterval = 1;
```

## App Backend

PowerSync does not write client-side changes stored in the SQLite database back to the connected source database. Client applications are required to implement the `uploadData` function which should call a backend API to persist the local SQLite changes to the source database. 

| Resource | Description |
|----------|-------------|
| [App Backend Setup](https://docs.powersync.com/configuration/app-backend/setup.md) | Overview of setting up the app backend for PowerSync. |
| [Client-Side Integration with Your Backend](https://docs.powersync.com/configuration/app-backend/client-side-integration.md) | How to implement a "backend connector" and links to example implementations. |

## Authentication

PowerSync Client Applications use JWTs to authenticate agaist the PowerSync Service. 

| Topic                | Resource Link                                                                                          |
|----------------------|------------------------------------------------------------------------------------------------------|
| Authentication Setup | [Authentication Setup](https://docs.powersync.com/configuration/auth/overview.md)                    |
| Development Tokens   | [Development Tokens](https://docs.powersync.com/configuration/auth/development-tokens.md) – Configure tokens for development testing. |
| Custom Auth          | [Custom Auth](https://docs.powersync.com/configuration/auth/custom.md) – Configure custom authentication for PowerSync. |

PowerSync can also integrate with Auth providers, with official guides for the following: 

| Provider   | Resource Link                                                                 |
|------------|-----------------------------------------------------------------------------------|
| Supabase   | [Supabase](https://docs.powersync.com/configuration/auth/supabase-auth.md)            |
| Firebase   | [Firebase](https://docs.powersync.com/configuration/auth/firebase-auth.md)            |
| Auth0      | [Auth0](https://docs.powersync.com/configuration/auth/auth0.md)               |
