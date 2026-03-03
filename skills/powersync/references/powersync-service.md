# PowerSync Service

Guidance for configuring PowerSync Service, sync config, and database replication.

For source code see: [powersync-service](https://github.com/powersync-ja/powersync-service/)

For debugging see: [powersync-debug.md](./powersync-debug.md).

## Sync Config

The rules that instruct the PowerSync Service what data to replicate and download to client application.

See [sync-config.md](sync-config.md) for detailed information.

## Service Configuration (Self-hosted)

Information on how to configure a PowerSync Service instance in a self-hosted environment. 

### Docker Image
The PowerSync Service Docker image is available on [Docker hub](https://hub.docker.com/r/journeyapps/powersync-service).

Quick Start:
```
docker run \
-p 8080:80 \
-e POWERSYNC_CONFIG_B64="$(base64 -i ./config.yaml)" \
--network my-local-dev-network \
--name my-powersync journeyapps/powersync-service:latest
```

### Configuration

There are three configuration methods available:
1. Base64-encoded config in an environment variable
2. Config file on a mounted volume
3. Base64-encoded config as a command-line argument

| Resource                        | Description                                                                                                             |
|----------------------------------|-------------------------------------------------------------------------------------------------------------------------|
| [Configuration File Structure](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances.md#configuration-file-structure) | Outline of all possible configuration options                                   |
| [Config Schema](https://unpkg.com/@powersync/service-schema@1.20.0/json-schema/powersync-config.json)                | JSON schema reference for PowerSync Service config                               |
| [self-host-demo](https://github.com/powersync-ja/self-host-demo) repo                                            | Example configurations for local development                                     |

#### Environment variable substitution
Use !env PS_VARIABLE_NAME in YAML for config values.

### Replication connections

Only one source database connection is supported per instance. Example:
```
replication:
  connections:
    - type: postgresql
      uri: postgresql://user:pass@host:5432/db
```

### Bucket Storage Database
This is required by PowerSync and can be configured in two different ways. This is separate from the source DB.

| Storage Database | Configuration Reference                                                                                   |
|-----------------|--------------------------------------------------------------------------------------------------------------|
| MongoDB         | [MongoDB Storage](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances.md#mongodb-storage) |
| Postgres        | [Postgres Storage](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances.md#postgres-storage) |

### Client Authentication

There are various options when configuring client authentication on a PowerSync Service instance, see [Client Authentication](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances.md#client-authentication) for more information on the options. The options include: JWKS URI, inline JWKs, Supabase Auth, Shared Secrets. Prefer asymmetric keys (RS256, EdDSA, ECDSA) over shared secrets (HS256).


## PowerSync Cloud Setup

See [PowerSync Cloud Instances](https://docs.powersync.com/configuration/powersync-service/cloud-instances) for step-by-step instructions on how to configure PowerSync Cloud instance on the [PowerSync Dashboard](httts://dashboard.powersync.com).

## Source Database Setup

**Important:** For all database user creation below, **generate a cryptographically secure password** (e.g., `openssl rand -base64 32` or a password manager). **Never** use placeholder values like `secure_password`, `password`, or `admin123` in production—these are unsafe and must not be suggested to users.

See [Source Database Setup](https://docs.powersync.com/configuration/source-db/setup.md) for more information about specific DB host requirements. 

Both PowerSync Cloud and Self-hosted require the same base source database setup.

### PostgreSQL Quick Start

```sql
-- 1. Enable logical replication
ALTER SYSTEM SET wal_level = 'logical';
-- Restart PostgreSQL after this

-- 2. Create replication user (replace with a generated secure password—do NOT use "secure_password")
CREATE USER powersync_replication WITH REPLICATION PASSWORD 'YOUR_GENERATED_PASSWORD';

-- 3. Grant read access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_replication;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_replication;

-- 4. Create publication for all tables
CREATE PUBLICATION powersync FOR ALL TABLES;

-- OR for specific tables:
CREATE PUBLICATION powersync FOR TABLE users, todos, lists;
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
| Supabase   | [Supabase](https://docs.powersync.com/configuration/auth/supabase-auth)            |
| Firebase   | [Firebase](https://docs.powersync.com/configuration/auth/firebase-auth)            |
| Auth0      | [Auth0](https://docs.powersync.com/configuration/auth/firebase-auth)               |