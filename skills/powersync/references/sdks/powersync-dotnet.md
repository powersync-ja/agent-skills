---
name: powersync-dotnet
description: PowerSync .NET SDK — schema, queries, sync lifecycle, and backend connectors
metadata:
  tags: dotnet, csharp, maui, wpf, console, sqlite, offline-first, checkpoint-requests, RequestCheckpoint, WaitForSync, CheckpointRequestException, ICustomCheckpointRequestConnector, CheckpointMode, IFromRow, IQueryRow, IAuthenticator, IMutationUploader, GenerateSqlMapper, RawTable, MDSQLiteAdapter
---

# PowerSync .NET SDK

> **Load this when** building a .NET app (MAUI, WPF, Console) with PowerSync.

## Table of Contents
- [Installation](#installation)
- [Upgrading from v0.x](#upgrading-from-v0x)
- [Quick Setup](#quick-setup)
- [Query Patterns](#query-patterns)
- [Writes and Transactions](#writes-and-transactions)
- [Sync Status](#sync-status)
- [Sync Streams](#sync-streams)
- [Checkpoint Requests](#checkpoint-requests)
- [Logging](#logging)
- [Schema Updates](#schema-updates)

Best practices for building apps with the PowerSync .NET SDK.

Supported targets: .NET 8 (desktop only), .NET 9, .NET 10. MAUI apps (Android, iOS, Mac Catalyst, Windows) must target `net9.0` or `net10.0`. Also supported: WPF and Console. The SDK is GA from v1.0.1. .NET Standard 2.0, .NET Framework 4.8 and .NET 6 are not supported.

## Connector Compatibility

From `PowerSync.Common` 1.0.1, the .NET SDK supports the split API: implement `IAuthenticator` (`ResolveCredentials()`, `InvalidateCredentials()`) and `IMutationUploader` (`UploadMutations(IPowerSyncDatabase db)`) independently. Use the `Connect` overloads below for new integrations. `IPowerSyncBackendConnector` with `Connect(connector)` still works for existing code.

```csharp
await db.Connect(endpoint, authenticator: new MyAuthenticator(), uploader: new MyMutationUploader()); // downloads and uploads
await db.Connect(endpoint, authenticator: new MyAuthenticator(), uploader: null);                     // download-only
await db.Connect(uploader: new MyMutationUploader());                                                // upload-only, no endpoint or authenticator
```

`MyMutationUploader.UploadMutations` follows the same `GetNextCrudTransaction()` / `Complete()` contract as the `UploadData` example below. See [current SDK support](https://docs.powersync.com/client-sdks/usage-examples#connect-for-downloads-or-uploads-only).

## Upgrading from v0.x

If the project uses `PowerSync.Common` 0.x (beta), apply these changes when moving to v1:

- If targeting .NET Standard 2.0, .NET Framework 4.8 or .NET 6, move to .NET 8 or later (MAUI: .NET 9 or later).
- If the project references `PowerSync.Maui`, remove it (deprecated; `PowerSync.Common` includes the native libraries). Replace `MAUISQLiteAdapter` with `MDSQLiteAdapter` (`MDSQLiteAdapterOptions`) and `MAUISQLiteDBOpenFactory` with `MDSQLiteDBOpenFactory` (`MDSQLiteOpenFactoryOptions`), or pass `SQLOpenOptions`.
- If code uses Dapper-style `GetAll<T>`, `Get<T>`, `GetOptional<T>` or `Watch<T>`, implement `IFromRow<T>` on the result type, pass a mapper function, or use the alpha source generator. Dapper is no longer used. `GetAll<T>` and `Watch<T>` return `List<T>` (not `T[]`), and untyped queries return `IQueryRow` (not `dynamic`).
- If code compares `OnChange` `ChangedTables` with view names, compare with underlying table names instead (`ps_data__todo_lists`, not `todo_lists`).
- Operation IDs, write checkpoints and checkpoint request IDs are `long`, not `string`.
- A class implementing `ICustomCheckpointRequestConnector` must also implement `IPowerSyncBackendConnector`.
- `DBAdapterEvents.TablesUpdatedEvent.TablesUpdated` is a `HashSet<string>`. `BatchedUpdateNotification`, `INotification` and `UpdateNotification` are removed.

## Installation

`PowerSync.Common` works on all supported platforms, including MAUI. The `PowerSync.Maui` package is deprecated, so do not add it.

```bash
dotnet add package PowerSync.Common
```

## Quick Setup

### 1. Define Schema

There are two ways to define schemas: **dictionary syntax** (simple) and **attribute syntax** (type-safe).

#### Dictionary Syntax

```csharp
using PowerSync.Common.DB.Schema;

var todos = new Table
{
    Name = "todos",
    Columns =
    {
        ["description"] = ColumnType.Text,
        ["list_id"] = ColumnType.Text,
        ["completed"] = ColumnType.Integer, // booleans as INTEGER (0/1)
        ["created_at"] = ColumnType.Text,   // dates as ISO TEXT
    },
    Indexes =
    {
        ["list_idx"] = ["list_id"],
    }
};

var lists = new Table
{
    Name = "lists",
    Columns =
    {
        ["name"] = ColumnType.Text,
        ["owner_id"] = ColumnType.Text,
        ["created_at"] = ColumnType.Text,
    }
};

var schema = new Schema(todos, lists);
```

#### Attribute Syntax

```csharp
using PowerSync.Common.DB.Schema.Attributes;

[Table("todos"), Index("list_idx", ["list_id"])]
public class TodoItem
{
    [Column("id")]
    public string Id { get; set; } = "";

    [Column("description")]
    public string Description { get; set; } = "";

    [Column("list_id")]
    public string ListId { get; set; } = "";

    [Column("completed")]
    public bool Completed { get; set; }  // bool maps to INTEGER automatically

    [Column("created_at")]
    public string CreatedAt { get; set; } = "";
}

[Table("lists")]
public class TodoList
{
    [Column("id")]
    public string Id { get; set; } = "";

    [Column("name")]
    public string Name { get; set; } = "";

    [Column("owner_id")]
    public string OwnerId { get; set; } = "";

    [Column("created_at")]
    public string CreatedAt { get; set; } = "";
}

// Build schema from attributed types
var schema = new Schema(typeof(TodoItem), typeof(TodoList));

// Or mix: new Table(typeof(TodoItem)) also works
```

With attribute syntax, an `id` property of type `string` is **required** on each class but is not added as a column — PowerSync adds `id TEXT PRIMARY KEY` automatically. The `[Column("id")]` attribute maps the property when the class is used as a query result type.

Column types: `ColumnType.Text`, `ColumnType.Integer`, `ColumnType.Real` only — no boolean, date, or JSON native types. With attributes, `ColumnType.Inferred` auto-maps C# types (`string` → Text, `bool`/`int`/`long`/`enum` → Integer, `float`/`double` → Real, `decimal`/`DateTime`/`Guid` → Text).

No migrations required. Schema changes apply on next open. New columns start null; removed columns become inaccessible (data remains). Renaming = add new + remove old (data loss).

### Special Table Options

```csharp
// Local-only — not synced, not uploaded, persists across restarts
var drafts = new Table("drafts",
    new Dictionary<string, ColumnType> { ["content"] = ColumnType.Text },
    new TableOptions(localOnly: true));

// Insert-only — writes uploaded, server never sends data back
var logs = new Table("logs",
    new Dictionary<string, ColumnType> { ["message"] = ColumnType.Text },
    new TableOptions(insertOnly: true));

// Track previous values — available as entry.PreviousValues in UploadData
var todos = new Table("todos",
    new Dictionary<string, ColumnType>
    {
        ["description"] = ColumnType.Text,
        ["completed"] = ColumnType.Integer,
    },
    new TableOptions(
        trackPreviousValues: new TrackPreviousOptions
        {
            Columns = new List<string> { "completed" }, // null = track all columns
            OnlyWhenChanged = true
        }
    ));

// Track write metadata — adds _metadata column, available as entry.Metadata in UploadData
var tasks = new Table("tasks",
    new Dictionary<string, ColumnType> { ["title"] = ColumnType.Text },
    new TableOptions(trackMetadata: true));

// Ignore no-op updates (UPDATE that changes no values)
var items = new Table("items",
    new Dictionary<string, ColumnType> { ["name"] = ColumnType.Text },
    new TableOptions(ignoreEmptyUpdates: true));
```

With attribute syntax:

```csharp
[Table("todos", TrackPreviousValues = TrackPrevious.Columns | TrackPrevious.OnlyWhenChanged)]
[Index("list_idx", ["list_id"])]
public class TodoItem
{
    [Column("id")]
    public string Id { get; set; } = "";

    [Column("completed", TrackPrevious = true)] // only this column tracked
    public bool Completed { get; set; }

    [Column("description")]
    public string Description { get; set; } = "";
}

[Table("logs", InsertOnly = true)]
public class LogEntry { /* ... */ }

[Table("drafts", LocalOnly = true)]
public class Draft { /* ... */ }

[Table("tasks", TrackMetadata = true)]
public class Task { /* ... */ }

[Table("items", IgnoreEmptyUpdates = true)]
public class Item { /* ... */ }
```

### 2. Create Backend Connector

```csharp
using PowerSync.Common.Client;
using PowerSync.Common.Client.Connection;
using PowerSync.Common.DB.Crud;

public class MyConnector : IPowerSyncBackendConnector
{
    public async Task<PowerSyncCredentials?> FetchCredentials()
    {
        // Always fetch fresh credentials — do not cache stale tokens
        var token = await myAuthService.GetTokenAsync();
        return new PowerSyncCredentials(
            endpoint: "https://your-instance.powersync.journeyapps.com",
            token: token
        );
    }

    public async Task UploadData(IPowerSyncDatabase database)
    {
        var transaction = await database.GetNextCrudTransaction();
        if (transaction == null) return;

        try
        {
            foreach (var entry in transaction.Crud)
            {
                switch (entry.Op)
                {
                    case UpdateType.PUT:
                        await api.Upsert(entry.Table, entry.Id, entry.OpData!);
                        break;
                    case UpdateType.PATCH:
                        await api.Update(entry.Table, entry.Id, entry.OpData!);
                        break;
                    case UpdateType.DELETE:
                        await api.Delete(entry.Table, entry.Id);
                        break;
                }
            }

            await transaction.Complete(); // MUST call — otherwise the same transaction is returned forever
        }
        catch (Exception ex)
        {
            throw; // PowerSync backs off and retries automatically
        }
    }
}
```

**Fatal upload errors**: If `UploadData` always throws for a bad record, the queue stalls permanently. Detect unrecoverable errors (e.g. constraint violations) and call `await transaction.Complete()` to discard them.

#### CrudEntry Fields

```csharp
entry.Id              // string — row ID
entry.Op              // UpdateType — PUT | PATCH | DELETE
entry.OpData          // Dictionary<string, object>? — changed columns (null for DELETE)
entry.Table           // string — table name
entry.TransactionId   // long? — groups ops from the same WriteTransaction()
entry.PreviousValues  // Dictionary<string, string?>? — requires TrackPreviousValues on table
entry.Metadata        // string? — requires TrackMetadata on table
entry.ClientId        // int — internal client ID for the CRUD entry
```

Op semantics: `PUT` = full insert/replace (all non-null columns), `PATCH` = partial update (changed columns only), `DELETE` = deletion (`OpData` is null).

For batching multiple transactions at once, use `database.GetCrudBatch(limit)`. Both `CrudBatch` and `CrudTransaction` follow the same `Complete()` contract.

### 3. Initialize and Connect

#### Console / WPF

```csharp
using PowerSync.Common.Client;

var db = new PowerSyncDatabase(new PowerSyncDatabaseOptions
{
    Database = new SQLOpenOptions { DbFilename = "app.db" },
    Schema = schema,
});
await db.Init();

// Starts sync stream and UploadData loop in the background (non-blocking)
await db.Connect(connector);

// Wait for first sync before showing data-dependent UI
await db.WaitForFirstSync();
```

#### MAUI

Use the same `PowerSyncDatabase` setup as above, but store the database file in a platform-appropriate location:

```csharp
var dbPath = Path.Combine(FileSystem.AppDataDirectory, "app.db");
var db = new PowerSyncDatabase(new PowerSyncDatabaseOptions
{
    Database = new SQLOpenOptions { DbFilename = dbPath },
    Schema = schema,
});
await db.Init();

await db.Connect(connector);
```

Use a **single `PowerSyncDatabase` instance** per database file. Multiple instances for the same file cause lock contention and missed watch updates — share via dependency injection.

#### Connection Options

```csharp
await db.Connect(connector, new PowerSyncConnectionOptions(
    @params: new Dictionary<string, object> { ["userId"] = "abc123" }, // sync parameters
    retryDelayMs: 5000,
    crudUploadThrottleMs: 1000,
    appMetadata: new Dictionary<string, string> { ["app_version"] = "1.0.0" }
));
```

#### Disconnect and Clear

```csharp
await db.Disconnect();                    // stop syncing, keep local data
await db.DisconnectAndClear();            // stop syncing, wipe synced tables (e.g. on sign-out)
await db.DisconnectAndClear(clearLocal: false); // wipe synced data but preserve local-only tables
await db.Close();                         // release resources — cannot be reused after this
```

`Disconnect()` — temporary offline, token refresh, app backgrounding. Safe to reconnect as the same user. `DisconnectAndClear()` — user sign-out or account switch, prevents stale data leaking to the next user. `Close()` — app termination, instance cannot be reused after this call.

## Query Patterns

The SDK does not map rows to objects automatically (Dapper is not used). If a query has no result type or mapper, `Get` and `GetOptional` return an `IQueryRow` and `GetAll` and `Watch` return a `QueryResult` whose `Rows` holds `IQueryRow` values. Read columns by name with `GetString("name")`, or with `OrNull` variants such as `GetDateTimeOrNull("completed_at")` for nullable columns. To get typed results, pass a mapper function or implement `IFromRow<T>` (see Result Mapping).

### Watch Queries (Reactive)

Watch returns an `IAsyncEnumerable<List<T>>` that emits new results whenever dependent tables change.

```csharp
public record TodoResult(string Id, string Description);

// Watch returns IAsyncEnumerable — call synchronously to capture table listener
var watcher = db.Watch(
    "SELECT id, description FROM todos WHERE list_id = ? ORDER BY id",
    [listId],
    row => new TodoResult(row.GetString("id"), row.GetString("description"))
);

// Consume asynchronously
await foreach (var todos in watcher)
{
    // todos is List<TodoResult> — updated on every relevant table change
    UpdateUI(todos);
}
```

With cancellation:

```csharp
var cts = new CancellationTokenSource();
var watcher = db.Watch(
    "SELECT id, description FROM todos",
    null,
    row => new TodoResult(row.GetString("id"), row.GetString("description")),
    new SQLWatchOptions { Signal = cts.Token }
);

_ = Task.Run(async () =>
{
    await foreach (var results in watcher)
    {
        UpdateUI(results);
    }
}, cts.Token);

// Later: stop watching
cts.Cancel();
```

React to table changes without re-running a query:

```csharp
var onChange = db.OnChange(new SQLWatchOptions { Tables = ["todos", "lists"] });
await foreach (var e in onChange)
{
    Console.WriteLine($"Changed tables: {string.Join(", ", e.ChangedTables)}");
}
```

### One-Time Queries

```csharp
// GetAll with a mapper — returns List<T>
var ids = await db.GetAll("SELECT id FROM todos WHERE list_id = ?", [listId], row => row.GetString("id"));

// Get — returns one result, throws if not found
var todo = await db.Get<TodoItem>("SELECT * FROM todos WHERE id = ?", [id]);

// GetOptional — returns T? (null if not found)
var maybeTodo = await db.GetOptional<TodoItem>("SELECT * FROM todos WHERE id = ?", [id]);

// No result type — returns IQueryRow / QueryResult
IQueryRow row = await db.Get("SELECT description FROM todos WHERE id = ?", [id]);
string description = row.GetString("description");
```

### Result Mapping

Choose one of three ways to get typed results:

1. Mapper function, for one-off queries or single values: `db.GetAll(sql, parameters, row => ...)`.
2. `IFromRow<T>`, for a class reused across queries. Pass it as the type argument, for example `db.GetAll<TodoItem>(sql)`.
3. `[GenerateSqlMapper]` on a `partial` class, struct or record to generate the mapping at compile time. This needs the alpha `PowerSync.Common.SourceGenerators` package (`dotnet add package PowerSync.Common.SourceGenerators --prerelease`). Each property reads the column named by its `[Column]` attribute, or the same-named column (ignoring case) without it. Naming styles are not converted, so `CompletedAt` needs `[Column("completed_at")]`.

```csharp
using PowerSync.Common.DB;

public class TodoItem : IFromRow<TodoItem>
{
    public string Description { get; set; } = "";
    public DateTime? CompletedAt { get; set; }

    public static TodoItem FromRow(IQueryRow row) => new()
    {
        Description = row.GetString("description"),
        CompletedAt = row.GetDateTimeOrNull("completed_at")
    };
}
```

A schema class that uses `[Column]` attributes does not map rows by itself. If it is also a query result type, add `IFromRow<T>` or `[GenerateSqlMapper]` to it.

## Writes and Transactions

```csharp
// Single operation — uuid() is a PowerSync built-in SQLite function
await db.Execute(
    "INSERT INTO lists (id, created_at, name, owner_id) VALUES (uuid(), datetime(), ?, ?)",
    ["My List", userId]);

// Multiple operations atomically — auto-commits, auto-rollbacks on exception
await db.WriteTransaction(async tx =>
{
    await tx.Execute("DELETE FROM lists WHERE id = ?", [listId]);
    await tx.Execute("DELETE FROM todos WHERE list_id = ?", [listId]);
});

// Write transaction with return value
var count = await db.WriteTransaction<int>(async tx =>
{
    await tx.Execute("INSERT INTO lists (id, name, owner_id) VALUES (uuid(), ?, ?)", ["New", userId]);
    var result = await tx.Get<CountResult>("SELECT count(*) as count FROM lists");
    return result.count;
});
```

ID generation — every table has `id TEXT PRIMARY KEY` added automatically:

```csharp
await db.Execute("INSERT INTO todos (id, description) VALUES (uuid(), ?)", ["Buy milk"]);
// or generate in C#:
await db.Execute("INSERT INTO todos (id, description) VALUES (?, ?)", [Guid.NewGuid().ToString(), "Buy milk"]);
```

### Batch Execution

```csharp
// Execute the same statement with multiple parameter sets
await db.ExecuteBatch(
    "INSERT INTO todos (id, description, list_id) VALUES (uuid(), ?, ?)",
    [
        ["Buy milk", listId],
        ["Buy eggs", listId],
        ["Buy bread", listId],
    ]);
```

## Sync Status

```csharp
SyncStatus status = db.CurrentStatus;

status.Connected            // bool — sync stream is active
status.Connecting           // bool
status.DataFlowStatus.Downloading  // bool
status.DataFlowStatus.Uploading    // bool
status.HasSynced            // bool? — null = DB still opening; true = at least one full sync completed
status.LastSyncedAt         // DateTime?
status.DownloadProgress()   // SyncProgress? — non-null only while downloading
status.DataFlowStatus.UploadError    // Exception?
status.DataFlowStatus.DownloadError  // Exception?
```

Observe status changes via event stream:

```csharp
await foreach (var update in db.ListenAsync(cancellationToken))
{
    if (update.StatusChanged != null)
    {
        var s = update.StatusChanged;
        Console.WriteLine($"Connected: {s.Connected}, HasSynced: {s.HasSynced}");
    }
}
```

`HasSynced` persists across app restarts once set.

### Sync Priorities

Buckets can be assigned priorities (lower number = higher priority) on the server. Higher-priority data syncs first. See [Prioritized Sync](https://docs.powersync.com/usage/use-case-examples/prioritized-sync.md).

```csharp
await db.WaitForFirstSync(new PowerSyncDatabase.PrioritySyncRequest { Priority = 1 });

var entry = db.CurrentStatus.StatusForPriority(1);
entry.HasSynced     // bool?
entry.LastSyncedAt  // DateTime?

var progress = db.CurrentStatus.DownloadProgress()?.UntilPriority(1);
progress?.DownloadedFraction    // double 0.0–1.0
progress?.DownloadedOperations  // int
progress?.TotalOperations       // int
```

## Sync Streams

Sync Streams are the recommended way to define what data syncs to each client. See [Sync Config](references/sync-config.md) for server-side configuration (YAML definitions, parameters, CTEs) and [Client-Side Usage](https://docs.powersync.com/sync/streams/client-usage.md) for full examples.

> Sync Streams are currently in alpha in the .NET SDK.

If `auto_subscribe` is not set to `true` in the sync config, subscribe to streams from client code:

```csharp
using PowerSync.Common.Client.Sync.Stream;

// Create a stream handle
ISyncStream stream = db.SyncStream(
    name: "my_orders",
    parameters: new Dictionary<string, object> { ["userId"] = currentUserId }
);

// Subscribe to the stream
ISyncStreamSubscription subscription = await stream.Subscribe(new SyncStreamSubscribeOptions
{
    Ttl = TimeSpan.FromHours(1),                // optional — keep data alive after unsubscribe
    Priority = new StreamPriority(1),           // optional — lower number = higher priority
});

// Wait for this specific stream to complete its first sync
await subscription.WaitForFirstSync();

// Check stream status
SyncStreamStatus? streamStatus = db.CurrentStatus.ForStream(subscription);
streamStatus?.Subscription.HasSynced        // bool
streamStatus?.Subscription.LastSyncedAt     // DateTime?
streamStatus?.Subscription.Active           // bool
streamStatus?.Subscription.IsDefault        // bool
streamStatus?.Subscription.ExpiresAt        // DateTime?
streamStatus?.Progress?.DownloadedFraction  // double

// Unsubscribe when done — TTL starts running after this
subscription.Unsubscribe();

// Or unsubscribe all subscriptions for a stream
await stream.UnsubscribeAll();
```

Same stream name with different parameters creates separate subscriptions. Subscribing while offline is supported — subscriptions are tracked locally and sent on next connect.

## Checkpoint Requests

> Load this section when the operator needs the client to confirm that recent writes have been uploaded and their results have synced back locally.

If the operator needs to wait until local data reflects a specific server state, use `RequestCheckpoint()`. A checkpoint created after local writes confirms that those writes have been uploaded and the resulting server state has synced back.

> **Alpha API** — checkpoint requests may change. Requires PowerSync Service 1.24.0 or later.

### Enable Checkpoint Mode

If using checkpoint requests, pass `CheckpointMode.Requests()` when connecting:

```csharp
await database.Connect(
    connector: connector,
    options: new PowerSyncConnectOptions(checkpointMode: new CheckpointMode.Requests())
);
```

### Request a Checkpoint

```csharp
async Task RefreshLocalData(CancellationToken cancellationToken = default)
{
    var checkpoint = await database.RequestCheckpoint(cancellationToken);
    await checkpoint.WaitForSync(cancellationToken);
    // Local queries now reflect server state from when the request was made.
}
```

If the device is offline when `RequestCheckpoint()` is called, the call waits until the Service is reachable. A request remains valid across a reconnect — call `WaitForSync()` again on the same request after reconnecting.

With a timeout:

```csharp
try
{
    var checkpoint = await database.RequestCheckpoint();
    await checkpoint.WaitForSync().WaitAsync(TimeSpan.FromSeconds(30));
}
catch (TimeoutException)
{
    ShowRefreshMessage("The refresh timed out. Try again.");
}
catch (CheckpointRequestException e) when (e.Message == CheckpointRequestException.Disconnected)
{
    ShowRefreshMessage("Reconnect before refreshing again.");
}
catch (CheckpointRequestException e)
{
    // Handle other checkpoint errors
    ShowRefreshMessage($"Failed to request checkpoint: {e.Message}");
}
catch (Exception)
{
    // Handle other errors
}
```

### Confirming Write Round-Trip

After a local write, a checkpoint confirms the write has been uploaded and its result has synced back:

```csharp
await database.Execute(
    "INSERT INTO tasks (id, description) VALUES (uuid(), ?)",
    ["Review the project plan"]
);
var checkpoint = await database.RequestCheckpoint();
await checkpoint.WaitForSync();
// The write has uploaded and its server state has synced locally.
```

If `DisconnectAndClear()` is called, discard any existing checkpoint objects. Request a new checkpoint after reconnecting.

### Custom Backend Connector

If your application backend needs to create checkpoint requests (rather than letting PowerSync generate them), implement `ICustomCheckpointRequestConnector`:

```csharp
class BackendConnector : IPowerSyncBackendConnector, ICustomCheckpointRequestConnector
{
    public async Task<long> PostCheckpointRequest(string clientId, long requestId, CancellationToken ct)
    {
        var response = await BackendAPI.CreateCheckpointRequest(clientId, requestId, cancellationToken: ct);
        return response.RequestId;
    }

    // Also implement FetchCredentials and UploadData
}
```

Use your application's own authentication for `PostCheckpointRequest` — it does not receive the PowerSync sync token.

## Logging

The SDK accepts an `ILogger` via `PowerSyncDatabaseOptions`:

```csharp
using Microsoft.Extensions.Logging;

ILoggerFactory loggerFactory = LoggerFactory.Create(builder =>
{
    builder.AddConsole();
    builder.SetMinimumLevel(LogLevel.Debug);
});
var logger = loggerFactory.CreateLogger("PowerSync");

var db = new PowerSyncDatabase(new PowerSyncDatabaseOptions
{
    Database = new SQLOpenOptions { DbFilename = "app.db" },
    Schema = schema,
    Logger = logger,
});
```

## Schema Updates

Update the schema at runtime (must be disconnected):

```csharp
await db.Disconnect();
await db.UpdateSchema(newSchema);
await db.Connect(connector);
```

## Additional Resources

Only read these if the content above does not provide enough context for the task.

- [NuGet packages](https://www.nuget.org/profiles/PowerSync) — published packages
- [Full SDK reference](https://docs.powersync.com/client-sdk-references/dotnet.md) — full SDK documentation
- [API reference](https://powersync-ja.github.io/powersync-dotnet/api/PowerSync.html) — generated API docs for all SDK types, methods, and properties
- [CommandLine](https://github.com/powersync-ja/powersync-dotnet/tree/main/demos/CommandLine) — CLI app with real-time data sync example
- [WPF](https://github.com/powersync-ja/powersync-dotnet/tree/main/demos/WPF) — Windows desktop to-do list app example
- [MAUITodo](https://github.com/powersync-ja/powersync-dotnet/tree/main/demos/MAUITodo) — Cross-platform mobile and desktop to-do list example
