# PowerSync Service Configuration

Guidance for configuring PowerSync Service, sync rules, and database replication.

## Architecture Overview

### Download Path 
The source database (Postgres or other supported databases) is connected to the PowerSync Service, which internally consists of a Replicator and API. The PowerSync Service streams data down to clients via the SDKs.

**Important:** The PowerSync Service handles the **download/sync path only**. Client uploads go directly to your backend API, which then writes to the source database. PowerSync picks up those changes via replication.

## Sync Rules Information

[sync-rules.md](./sync-rules.md)

## Sync Streams Information

[sync-rules.md](./sync-streams.md)

## Service Configuration (Self-hosted)

There are various options when configuring a PowerSync instance. See [Configuration File Structure](http://localhost:3000/configuration/powersync-service/self-hosted-instances#configuration-file-structure) for an outline on what's possible. 

### Bucket Storage Database
This is required by PowerSync and can be configured in two different ways.

| Storage Database | Configuration Reference                                                                                   |
|-----------------|--------------------------------------------------------------------------------------------------------------|
| MongoDB         | [MongoDB Storage](http://localhost:3000/configuration/powersync-service/self-hosted-instances#mongodb-storage) |
| Postgres        | [Postgres Storage](http://localhost:3000/configuration/powersync-service/self-hosted-instances#postgres-storage) |

### Client Authentication

There are various options when configuring client authentication on a PowerSync Service instance, see [Client Authentication](http://localhost:3000/configuration/powersync-service/self-hosted-instances#client-authentication) for more information on the options.

## Source Database Setup

### PostgreSQL

```sql
-- 1. Enable logical replication
ALTER SYSTEM SET wal_level = 'logical';
-- Restart PostgreSQL after this

-- 2. Create replication user
CREATE USER powersync_replication WITH REPLICATION PASSWORD 'secure_password';

-- 3. Grant read access
GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_replication;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO powersync_replication;

-- 4. Create publication for all tables
CREATE PUBLICATION powersync_pub FOR ALL TABLES;

-- OR for specific tables:
CREATE PUBLICATION powersync_pub FOR TABLE users, todos, lists;
```

### MongoDB

```javascript
// MongoDB requires replica set
// 1. Initialize replica set (if not already)
rs.initiate()

// 2. Create user with read access
db.createUser({
  user: "powersync",
  pwd: "secure_password",
  roles: [{ role: "read", db: "your_database" }]
})

// Change streams are used automatically
```

### MySQL

```sql
-- 1. Enable binary logging (in my.cnf)
-- [mysqld]
-- server-id = 1
-- log_bin = mysql-bin
-- binlog_format = ROW
-- binlog_row_image = FULL

-- 2. Create replication user
CREATE USER 'powersync'@'%' IDENTIFIED BY 'secure_password';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'powersync'@'%';
GRANT SELECT ON your_database.* TO 'powersync'@'%';
FLUSH PRIVILEGES;
```

### SQL Server (MSSQL)

```sql
-- 1. Enable CDC at database level
USE [YourDatabase];
EXEC sys.sp_cdc_enable_db;

-- 2. Create PowerSync user
CREATE LOGIN powersync_user WITH PASSWORD = 'secure_password';
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

-- 7. Optional: Reduce polling interval (default 5s, 1 = faster)
EXEC sys.sp_cdc_change_job @job_type = N'capture', @pollinginterval = 1;
```

## Streaming Protocol

### Endpoints

- `GET /sync/stream` - HTTP streaming
- `WS /sync/stream` - WebSocket

### Authentication

JWT tokens must include:
- `sub` - User ID (accessible via `request.user_id()`)
- `aud` - Audience (must match config)
- `exp` - Expiration time

## Troubleshooting

| Issue | Check |
|-------|-------|
| No data syncing | Parameter queries returning buckets? |
| Replication lag | Check WAL/oplog position, network latency |
| Missing tables | Publication/CDC includes all needed tables? |
| Auth failures | JWT claims match parameter queries? |
| Slow sync | Bucket sizes reasonable? Indexes on source? |
