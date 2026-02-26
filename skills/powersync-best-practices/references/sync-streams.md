# Sync Streams

Sync Streams define exactly which data is synced to each client by using named, SQL-like queries and subscription parameters.

For a full overview, see [Sync Streams Overview](http://localhost:3000/sync/streams/overview)

## Requirements 

### PowerSync Service
- Self-hosted: v1.15.0+ 
- Cloud: Already met

### Sync Config
Must use config edition 3 in their sync config:
```yaml
config:
  edition: 3
```

### PowerSync SDKs
There are minimum SDK requirements when using Sync Streams in an application. See [Minimum SDK Versions](http://localhost:3000/sync/streams/migration#minimum-sdk-versions) for a full list for each supported PowerSync SDK.

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

[Global Data](http://localhost:3000/sync/streams/overview#global-data)

[Filtering By User](http://localhost:3000/sync/streams/overview#filtering-data-by-user)

[Auto-Subscribe](http://localhost:3000/sync/streams/overview#using-auto-subscribe)

For more information about how to perform advanced queries using [JOIN](http://localhost:3000/sync/streams/queries#using-joins), [Subqueries](http://localhost:3000/sync/streams/queries#using-subqueries) or [multiple queries per Stream](http://localhost:3000/sync/streams/queries#multiple-queries-per-stream) see [Queries](http://localhost:3000/sync/streams/queries). 

## Query Parameters

Query parameters allow you filter data in your Sync Streams. There are three different kinds of query parameters:

**Subscription parameters** are the most flexible option. Use them when the client needs to choose what data to sync at runtime. Each subscription operates independently, so a user can have multiple subscriptions to the same stream with different parameters.

Examples can be found [here](http://localhost:3000/sync/streams/parameters#subscription-parameters).

**Auth parameters** are the most secure option. Use them when you need to filter data based on who the user is. Since these values come from the signed JWT, they can’t be tampered with by the client.

Examples can be found [here](http://localhost:3000/sync/streams/parameters#auth-parameters).

**Connection parameters** apply globally across all streams for the session. Use them for values that rarely change, like environment flags or feature toggles. Keep in mind that changing them requires reconnecting.

Examples can be found [here](http://localhost:3000/sync/streams/parameters#connection-parameters).

See [Sync Streams Parameters](http://localhost:3000/sync/streams/parameters) for more information beyond this.

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

For a full breakdown, see [Limitations](http://localhost:3000/sync/streams/ctes#limitations).

## Common Examples and Patterns

Common patterns, use case examples, and demo Sync Streams. See [Examples](http://localhost:3000/sync/streams/examples).

## Migration

There are big differences between Sync Rules and Sync Streams, consider the following when migrating from Sync Rules to Sync Streams. See [Sync Streams Migrations](http://localhost:3000/sync/streams/migration) for information such as:
- How to migrate
- The tools that can make it easier 
- Understanding the difference between Sync Rules and Sync Streams
- Migration examples for common scenarios

## Client Usage

Client applications subscribe to Sync Streams to start syncing data. See [Client-Side](http://localhost:3000/sync/streams/client-usage) Usage for a full breakdown.
This covers topics such as:
- Initializing a subscription
- Inspect the sync status of a subscription
- Waiting for the first sync of a subscription
- Setting a TTL on a subscription
- Unsubscribing

There are examples available for each PowerSync Client SDK.

| SDK                  | Client Usage Reference URL                                                                                         |
|----------------------|-------------------------------------------------------------------------------------------------------------------|
| TypeScript/JavaScript| [Client Usage](http://localhost:3000/sync/streams/client-usage#typescript%2Fjavascript)                           |
| Dart                 | [Client Usage](http://localhost:3000/sync/streams/client-usage#dart)                                              |
| Kotlin               | [Client Usage](http://localhost:3000/sync/streams/client-usage#kotlin)                                            |
| Swift                | [Client Usage](http://localhost:3000/sync/streams/client-usage#swift)                                             |
| .NET                 | [Client Usage](http://localhost:3000/sync/streams/client-usage#net)                                               |

### Frameworks 

| Framework                 | Client Usage Reference URL                                                                                         |
|---------------------------|--------------------------------------------------------------------------------------------------------------------|
| React                     | [Client Usage](http://localhost:3000/sync/streams/client-usage#react-hooks)                                        |