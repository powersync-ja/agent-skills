# Sync Config

Expert guidance on Sync Config. Sync config is divided into two sections:
1. Sync Streams (new, default) - The latest implementation of Sync Config. New apps should use Sync Streams by default. Prioritize Sync Streams above Sync Rules.
2. Sync Rules (legacy) - The first implementation of Sync Config. New apps should not use Sync Rules, prioritize Sync Streams over Sync Rules.

# Sync Streams

Sync Streams define exactly which data is synced to each client by using named, SQL-like queries and subscription parameters.

For a full overview, see [Sync Streams Overview](https://docs.powersync.com/sync/streams/overview)

## Requirements 

### PowerSync Service
- Self-hosted: v1.20.0+ 
- Cloud: Already met

### Sync Config
Must use config edition 3 in their sync config:
```yaml
config:
  edition: 3
```

### PowerSync SDKs
There are minimum SDK requirements when using Sync Streams in an application. See [Minimum SDK Versions](https://docs.powersync.com/sync/streams/migration#minimum-sdk-versions) for a full list for each supported PowerSync SDK.

**IMPORTANT**
Client applications using a lower version than the `Rust Client Default` should make sure to enable the Rust Sync Client to use Sync Streams. 

## Structure
```yaml
config:
  edition: 3

streams:
  <stream_name>:
    query: SELECT ... FROM ... WHERE ...
    # optional:
    # auto_subscribe: true
```

## Basic Query
```yaml
streams:
  my_orders:
    query: SELECT * FROM orders WHERE user_id = auth.user_id()

  list_todos:
    query: |
      SELECT * FROM todos
      WHERE list_id = subscription.parameter('list_id')
```


## How to Query Data

There are different ways you can use Sync Streams to query data in your applications. 

[Global Data](https://docs.powersync.com/sync/streams/overview#global-data)

[Filtering By User](https://docs.powersync.com/sync/streams/overview#filtering-data-by-user)

For more information about how to perform advanced queries using [JOIN](https://docs.powersync.com/sync/streams/queries#using-joins), [Subqueries](https://docs.powersync.com/sync/streams/queries#using-subqueries) or [multiple queries per Stream](https://docs.powersync.com/sync/streams/queries#multiple-queries-per-stream) see [Queries](https://docs.powersync.com/sync/streams/queries). 

## Query Parameters

Query parameters allow you filter data in your Sync Streams. There are three different kinds of query parameters:

**Auth parameters** are the most secure option. Use them when you need to filter data based on who the user is. Since these values come from the signed JWT, they can’t be tampered with by the client.

Examples can be found [here](https://docs.powersync.com/sync/streams/parameters#auth-parameters).

**Subscription parameters** are the most flexible option. Use them when the client needs to choose what data to sync at runtime. Each subscription operates independently, so a user can have multiple subscriptions to the same stream with different parameters.

Examples can be found [here](https://docs.powersync.com/sync/streams/parameters#subscription-parameters).

**Connection parameters** apply globally across all streams for the session. Use them for values that rarely change, like environment flags or feature toggles. Keep in mind that changing them requires reconnecting.

Examples can be found [here](https://docs.powersync.com/sync/streams/parameters#connection-parameters).

See [Sync Streams Parameters](https://docs.powersync.com/sync/streams/parameters) for more information beyond this.

## Common Table Expressions (CTEs)

Reusable query patterns for your Sync Streams. You can create Global and Scoped CTEs. 

**Global** 
```yaml
with:
  user_orgs: SELECT org_id FROM org_members WHERE user_id = auth.user_id()

streams:
  org_projects:
    query: SELECT * FROM projects WHERE org_id IN user_orgs
  
  org_repositories:
    query: SELECT * FROM repositories WHERE org_id IN user_orgs
  
  org_settings:
    query: SELECT * FROM settings WHERE org_id IN user_orgs
```

**Scoped** 
```yaml
streams:
  project_data:
    with:
      accessible_projects: |
        SELECT id FROM projects 
        WHERE org_id IN (SELECT org_id FROM org_members WHERE user_id = auth.user_id())
    queries:
      - SELECT * FROM projects WHERE id IN accessible_projects
      - SELECT * FROM tasks WHERE project_id IN accessible_projects
      - SELECT * FROM comments WHERE project_id IN accessible_projects
```

### CTE Limitations

**This won't work**
```yaml
# This won't work - cte2 cannot reference cte1
with:
  cte1: SELECT org_id FROM org_members WHERE user_id = auth.user_id()
  cte2: SELECT id FROM projects WHERE org_id IN cte1  # Error!

```

For a full breakdown, see [Limitations](https://docs.powersync.com/sync/streams/ctes#limitations).

## Common Examples and Patterns

Common patterns, use case examples, and demo Sync Streams. See [Examples](https://docs.powersync.com/sync/streams/examples).

## Migration

There are big differences between Sync Rules and Sync Streams, consider the following when migrating from Sync Rules to Sync Streams. See [Sync Streams Migrations](https://docs.powersync.com/sync/streams/migration) for information such as:
- How to migrate
- The tools that can make it easier 
- Understanding the difference between Sync Rules and Sync Streams
- Migration examples for common scenarios

## Client Usage

Client applications subscribe to Sync Streams to start syncing data. See [Client-Side](https://docs.powersync.com/sync/streams/client-usage) Usage for a full breakdown.
This covers topics such as:
- Initializing a subscription
- Inspect the sync status of a subscription
- Waiting for the first sync of a subscription
- Setting a TTL on a subscription
- Unsubscribing

There are examples available for each PowerSync Client SDK.

| SDK                  | Client Usage Reference URL                                                                                         |
|----------------------|-------------------------------------------------------------------------------------------------------------------|
| TypeScript/JavaScript| [Client Usage](https://docs.powersync.com/sync/streams/client-usage.md#typescript%2Fjavascript)                           |
| Dart                 | [Client Usage](https://docs.powersync.com/sync/streams/client-usage.md#dart)                                              |
| Kotlin               | [Client Usage](https://docs.powersync.com/sync/streams/client-usage.md#kotlin)                                            |
| Swift                | [Client Usage](https://docs.powersync.com/sync/streams/client-usage.md#swift)                                             |
| .NET                 | [Client Usage](https://docs.powersync.com/sync/streams/client-usage.md#net)                                               |

### Frameworks 

| Framework                 | Client Usage Reference URL                                                                                         |
|---------------------------|--------------------------------------------------------------------------------------------------------------------|
| React                     | [Client Usage](https://docs.powersync.com/sync/streams/client-usage.md#react-hooks)                                        |

# Sync Rules

Sync rules define how data is partitioned into buckets and distributed to clients. This is considered legacy, however will still be supported. For the best experience use [sync-streams](./sync-streams.md).

## Structure

```yaml
bucket_definitions:
  <bucket_name>:
    parameters: SELECT ...   # Which buckets user can access
    data:                    # What data goes in each bucket
      - SELECT ... WHERE column = bucket.parameter
```

## Parameter Queries

Determine bucket access for authenticated users:

```yaml
# User's own data
parameters: SELECT request.user_id() AS user_id

# From database table
parameters: SELECT org_id FROM users WHERE id = request.user_id()

# From JWT claims
parameters: SELECT request.jwt() ->> 'tenant_id' AS tenant_id

# From client parameters
parameters: SELECT request.parameters() ->> 'workspace_id' AS workspace_id
```

## Data Queries

Define what rows go into each bucket:

```yaml
data:
  # Basic - all columns
  - SELECT * FROM documents WHERE user_id = bucket.user_id

  # Column selection
  - SELECT id, name, created_at FROM projects WHERE org_id = bucket.org_id

  # Transformations
  - SELECT id, UPPER(status) as status FROM tasks WHERE team_id = bucket.team_id
```

## Supported SQL Features

### Functions

| Category | Functions |
|----------|-----------|
| String | `upper()`, `lower()`, `substring()`, `length()`, `hex()`, `base64()` |
| JSON | `json_extract()`, `->`, `->>`, `json_array_length()`, `json_valid()` |
| Type | `typeof()`, `cast()` |
| Utility | `ifnull()`, `iif()`, `uuid_blob()` |
| Date/Time | `unixepoch()`, `datetime()` |
| Geospatial | `st_asgeojson()`, `st_astext()`, `st_x()`, `st_y()` |

### Operators (non-parameter comparisons)

- Comparison: `=`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `AND`, `OR`, `NOT`, `IS`, `IS NOT`
- Arithmetic: `+`, `-`, `*`, `/`, `%`
- String: `||` (concatenation)
- Null: `IS NULL`, `IS NOT NULL`

### Parameter Comparisons (bucket.* or token_parameters.*)

Only `=` and `IN` supported:
```yaml
# Allowed
WHERE user_id = bucket.user_id
WHERE bucket.role IN roles_array

# NOT allowed
WHERE user_id > bucket.user_id
WHERE upper(bucket.name) = column
```

## Not Supported

- JOINs (in data queries)
- GROUP BY, HAVING
- ORDER BY, LIMIT, OFFSET, DISTINCT
- Subqueries, CTEs
- Window functions
- `COALESCE()` - use `ifnull()` instead

## Common Patterns

### Personal Data

```yaml
bucket_definitions:
  my_data:
    parameters: SELECT request.user_id() AS user_id
    data:
      - SELECT * FROM notes WHERE owner_id = bucket.user_id
      - SELECT * FROM settings WHERE user_id = bucket.user_id
```

### Team/Organization

```yaml
bucket_definitions:
  team_data:
    parameters: |
      SELECT team_id FROM team_members
      WHERE user_id = request.user_id()
    data:
      - SELECT * FROM projects WHERE team_id = bucket.team_id
      - SELECT * FROM tasks WHERE team_id = bucket.team_id
```

### Role-Based Access

```yaml
bucket_definitions:
  admin_data:
    parameters: |
      SELECT 1 AS is_admin FROM users
      WHERE id = request.user_id() AND role = 'admin'
    data:
      - SELECT * FROM audit_logs WHERE bucket.is_admin = 1
```

### Global Data (all users)

```yaml
bucket_definitions:
  global:
    parameters: SELECT 'global' AS scope
    data:
      - SELECT * FROM app_config WHERE bucket.scope = 'global'
```

### Team-Based Access

```yaml
bucket_definitions:
  team_data:
    parameters: |
      SELECT team_id
      FROM team_members
      WHERE user_id = request.user_id()
    data:
      - SELECT * FROM projects WHERE team_id = bucket.team_id
      - SELECT * FROM tasks WHERE team_id = bucket.team_id
```

### Multi-Tenant Organization

```yaml
bucket_definitions:
  org_data:
    parameters: |
      SELECT org_id
      FROM users
      WHERE id = request.user_id()
    data:
      - SELECT * FROM documents WHERE org_id = bucket.org_id
      - SELECT * FROM folders WHERE org_id = bucket.org_id

  # User's private data within org
  private_data:
    parameters: |
      SELECT org_id, request.user_id() AS user_id
      FROM users
      WHERE id = request.user_id()
    data:
      - SELECT * FROM drafts WHERE org_id = bucket.org_id AND author_id = bucket.user_id
```

### Role-Based Access

```yaml
bucket_definitions:
  admin_data:
    parameters: |
      SELECT 1 AS is_admin
      FROM users
      WHERE id = request.user_id() AND role = 'admin'
    data:
      - SELECT * FROM audit_logs WHERE bucket.is_admin = 1
      - SELECT * FROM system_settings WHERE bucket.is_admin = 1

  user_data:
    parameters: SELECT request.user_id() AS user_id
    data:
      - SELECT * FROM user_documents WHERE user_id = bucket.user_id
```

### Global Data (All Users)

```yaml
bucket_definitions:
  global:
    - SELECT * FROM app_config 
    - SELECT * FROM categories
```

### JWT Claims

```yaml
bucket_definitions:
  tenant_data:
    parameters: |
      SELECT request.jwt() ->> 'tenant_id' AS tenant_id
    data:
      - SELECT * FROM records WHERE tenant_id = bucket.tenant_id
```