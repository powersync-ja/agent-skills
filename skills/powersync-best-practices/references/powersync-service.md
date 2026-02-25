# PowerSync Service Configuration

Guidance for configuring PowerSync Service, sync rules, and database replication.

## Architecture Overview

```
                              DOWNLOAD PATH (Sync)
┌─────────────────┐     ┌──────────────────────────────────┐     ┌────────────┐
│ Source Database │────▶│       PowerSync Service          │────▶│  Clients   │
│  (Postgres/etc) │     │  ┌──────────┐  ┌─────────────┐   │     │  (SDKs)    │
│                 │     │  │Replicator│  │ Sync Engine │   │     │            │
└─────────────────┘     │  └──────────┘  └─────────────┘   │     └────────────┘
         ▲              └──────────────────────────────────┘            │
         │                                                              │
         │                     UPLOAD PATH                              │
         │              (Bypasses PowerSync Service)                    │
         │                                                              │
┌─────────────────┐                                                     │
│  Your Backend   │◀────────────────────────────────────────────────────┘
│      API        │
└─────────────────┘
```

**Important:** The PowerSync Service handles the **download/sync path only**. Client uploads go directly to your backend API, which then writes to the source database. PowerSync picks up those changes via replication.

## Sync Rules Examples

[sync-rules.md](./sync-rules.md)

## Service Configuration

### Environment Variables

```bash
# Database connection
POWERSYNC_DATABASE_URL=postgresql://user:pass@host:5432/db

# JWT authentication
POWERSYNC_JWT_SECRET=your-jwt-secret
POWERSYNC_JWT_AUDIENCE=your-app

# Service settings
POWERSYNC_PORT=8080
POWERSYNC_LOG_LEVEL=info
```

### YAML Configuration

```yaml
# powersync.yaml
replication:
  source:
    type: postgresql  # or mongodb, mysql, mssql
    uri: ${POWERSYNC_DATABASE_URL}

storage:
  type: postgresql
  uri: ${POWERSYNC_STORAGE_URL}

api:
  port: 8080

sync_rules:
  path: ./sync-rules.yaml

client_auth:
  supabase_jwt_secret: ${SUPABASE_JWT_SECRET}
  # OR
  jwks_uri: https://your-auth-provider/.well-known/jwks.json
```

## Database Replication Setup

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

Custom claims accessible via `request.jwt()`.

## Performance Tuning

### Bucket Design

**Good:**
- Small buckets (100s-1000s of rows)
- Clear partition boundaries
- Minimal cross-bucket references

**Bad:**
- Single bucket for all users
- Buckets with millions of rows
- Frequent bucket membership changes

### Compacting

Reduces storage by combining updates to same row:

```yaml
# powersync.yaml
compacting:
  enabled: true
  interval: 86400  # Daily
```

## Docker Deployment

```yaml
# docker-compose.yaml
version: '3.8'
services:
  powersync:
    image: journeyapps/powersync-service:latest
    ports:
      - "8080:8080"
    environment:
      - POWERSYNC_DATABASE_URL=postgresql://...
      - POWERSYNC_JWT_SECRET=...
    volumes:
      - ./sync-rules.yaml:/app/sync-rules.yaml
```

## Troubleshooting

| Issue | Check |
|-------|-------|
| No data syncing | Parameter queries returning buckets? |
| Replication lag | Check WAL/oplog position, network latency |
| Missing tables | Publication/CDC includes all needed tables? |
| Auth failures | JWT claims match parameter queries? |
| Slow sync | Bucket sizes reasonable? Indexes on source? |
