---
name: powersync-dart
description: PowerSync Dart SDK — schema, queries, sync lifecycle, backend connectors, Drift ORM, Flutter Web support, and encryption
metadata:
  tags: dart, flutter, flutter-web, drift, orm, sqlite, encryption, sqlcipher, sqlite3mc, checkpoint-requests
---

# PowerSync Dart SDK

> **Load this when** building a Flutter or Dart app with PowerSync.

Best practices and guidance for building Flutter apps with the PowerSync Dart SDK.

| Resource | Description |
|----------|-------------|
| [Dart API reference](https://pub.dev/documentation/powersync/latest/powersync/) | Full API reference, consult only when the inline examples don't cover your case. |
| [Supported Platforms](https://docs.powersync.com/resources/supported-platform.md#flutter-sdk) | Supported platforms and features, consult for compatibility details. |

## Installation

```bash
flutter pub add powersync
```

## Setup

### 1. Define Schema

```dart
import 'package:powersync/powersync.dart';

const schema = Schema([
  Table('todos', [
    Column.text('list_id'),
    Column.text('description'),
    Column.integer('completed'), // 0 or 1
    Column.text('created_at'),
    Column.text('completed_at'),
    Column.text('created_by'),
    Column.text('completed_by'),
  ], indexes: [
    Index('list', [IndexedColumn('list_id')])
  ]),
  Table('lists', [
    Column.text('created_at'),
    Column.text('name'),
    Column.text('owner_id'),
  ]),
]);
```

See [Define the Client-Side Schema](https://docs.powersync.com/client-sdks/reference/flutter.md#1-define-the-client-side-schema) for more information.

### 2. Create Backend Connector

```dart
import 'package:powersync/powersync.dart';

class MyBackendConnector extends PowerSyncBackendConnector {
  @override
  Future<PowerSyncCredentials?> fetchCredentials() async {
    final token = await myAuthService.getPowerSyncToken();
    return PowerSyncCredentials(
      endpoint: 'https://your-instance.powersync.journeyapps.com',
      token: token,
    );
  }

  @override
  Future<void> uploadData(PowerSyncDatabase database) async {
    final transaction = await database.getNextCrudTransaction();
    if (transaction == null) return;

    try {
      for (final op in transaction.crud) {
        switch (op.op) {
          case UpdateType.put:
            await apiClient.upsert(table: op.table, id: op.id, data: {...?op.opData, 'id': op.id});
          case UpdateType.patch:
            await apiClient.update(table: op.table, id: op.id, data: op.opData ?? {});
          case UpdateType.delete:
            await apiClient.delete(table: op.table, id: op.id);
        }
      }
      await transaction.complete();
    } catch (e) {
      rethrow;
    }
  }
}
```

Use `getCrudBatch` instead of `getNextCrudTransaction` when uploading large numbers of mutations in bulk.

See [Integrate with your Backend](https://docs.powersync.com/client-sdks/reference/flutter.md#3-integrate-with-your-backend) for more information.

### 3. Instantiate and Connect

```dart
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:powersync/powersync.dart';

late PowerSyncDatabase db;

Future<void> openDatabase() async {
  final dir = await getApplicationSupportDirectory();
  final path = join(dir.path, 'powersync-dart.db');

  db = PowerSyncDatabase(schema: schema, path: path);
  await db.initialize();
}

// Call after the user authenticates
Future<void> connect() async {
  await db.connect(connector: MyBackendConnector());
}

// Call on logout
Future<void> disconnect() async {
  await db.disconnectAndClear();
}
```

See [Instantiate the PowerSync Database](https://docs.powersync.com/client-sdks/reference/flutter.md#2-instantiate-the-powersync-database) for more information.

### SQLite Options

Pass `SqliteOptions` to tune low-level SQLite behavior:

```dart
db = PowerSyncDatabase(
  schema: schema,
  path: path,
  sqliteOptions: SqliteOptions(
    preparedStatementCacheSize: 64, // LRU cache per connection; omit to disable
    maxReaders: 5,                  // Max concurrent read connections (default: 5)
  ),
);
```

If statement preparation overhead is visible in profiling, set `preparedStatementCacheSize` to a non-zero value. Each connection keeps its own independent LRU cache up to that size. For the JS SDK equivalent, see `database.preparedStatementsCache`. See the [API reference](https://pub.dev/documentation/powersync/latest/sqlite_async/SqliteOptions/preparedStatementCacheSize.html) for details.

## Sync Streams

See [sync-config.md](references/sync-config.md) for how to subscribe to Sync Streams when `auto_subscribe` is not set to `true` in the PowerSync Service config.

## Checkpoint Requests (Alpha)

Checkpoint requests let you confirm that the local database has caught up to a specific server state. Use this when you need to know that server changes are available locally: after a local write to wait for the result to sync back, in a pull-to-refresh flow, or when a user opens a link that refers to data that may not have synced yet.

Requires PowerSync Service v1.24.0+. .NET and Rust SDKs do not yet support checkpoint requests.

To opt in, pass `checkpointMode: .requests()` in `SyncOptions` to `connect()`:

```dart
await db.connect(
  connector: connector,
  options: SyncOptions(checkpointMode: .requests()),
);
```

Without this option, calling `requestCheckpoint()` throws an error. Checkpoint IDs are represented as strings in the Dart SDK to match the JavaScript SDK's representation (large int64 values exceed the safe integer range for JavaScript numbers).

### Waiting for the Latest Server Data

```dart
final checkpoint = await database.requestCheckpoint();
await checkpoint.waitForSync(
  abortTrigger: Future.delayed(Duration(seconds: 30)),
);
// Local queries now reflect server state from when requestCheckpoint() was called.
```

`requestCheckpoint()` requires the database to be connected or connecting. If offline, the call suspends until the Service is reachable. Aborting `waitForSync` does not remove the checkpoint. It only limits how long you wait for the checkpoint to apply locally.

### Error Handling

```dart
try {
  final checkpoint = await database.requestCheckpoint();
  await checkpoint.waitForSync(
    abortTrigger: Future.delayed(Duration(seconds: 30)),
  );
} on AbortException {
  showRefreshMessage('The refresh timed out. Try again.');
} catch (e) {
  showRefreshMessage('Could not wait for checkpoint: $e');
}
```

### Relationship to Local Writes

When checkpoint requests are enabled, the SDK creates an internal request after each upload queue flush. You do not need to call `requestCheckpoint()` for your own writes. If you create a request while local writes are pending, waiting on it also waits for those writes to upload and their results to sync back:

```dart
await database.execute(
  'INSERT INTO tasks (id, description) VALUES (uuid(), ?)',
  ['Review the project plan'],
);
final checkpoint = await database.requestCheckpoint();
await checkpoint.waitForSync();
// The pending write has uploaded and its server state has synced locally.
```

This behavior relies on `uploadData()` returning only after your backend has committed the changes to the source database.

### Async Upload Backends (Team/Enterprise)

If `uploadData()` queues writes for later processing rather than committing them synchronously, mix in `CustomCheckpointRequestConnector` and implement `postCheckpointRequest`. This requires a `checkpoint_requests` event definition in your sync config and is available on [Team and Enterprise](https://www.powersync.com/pricing) plans:

```dart
final class MyBackendConnector extends PowerSyncBackendConnector
    with CustomCheckpointRequestConnector {
  // ... also implement fetchCredentials and uploadData

  @override
  Future<String> postCheckpointRequest(
    String clientId,
    String requestId,
  ) async {
    final response = await myBackend.createCheckpointRequest(clientId, requestId);
    return response.checkpointRequestId;
  }
}
```

See [Checkpoint Requests](https://docs.powersync.com/client-sdks/advanced/checkpoint-requests) for the full setup guide.

## Query Patterns

See [Using PowerSync: CRUD](https://docs.powersync.com/client-sdks/reference/flutter.md#using-powersync-crud-functions) for the full API reference.

### One-Time Queries

```dart
// Fetch all matching rows
final results = await db.getAll('SELECT * FROM todos WHERE list_id = ?', [listId]);

// Fetch single row — throws if not found
final todo = await db.get('SELECT * FROM todos WHERE id = ?', [id]);

// Fetch single row — returns null if not found
final todo = await db.getOptional('SELECT * FROM todos WHERE id = ?', [id]);
```

### Reactive Queries

```dart
StreamBuilder(
  stream: db.watch('SELECT * FROM todos WHERE list_id = ?', parameters: [listId]),
  builder: (context, snapshot) {
    if (!snapshot.hasData) return const CircularProgressIndicator();
    final todos = snapshot.data!;
    // build UI from todos
  },
)
```

### Writing Data

```dart
// Single mutation
await db.execute(
  'INSERT INTO todos (id, list_id, description, completed) VALUES (uuid(), ?, ?, ?)',
  [listId, 'Buy milk', 0],
);

// Multiple related mutations as a single unit
await db.writeTransaction((tx) async {
  await tx.execute('INSERT INTO lists (id, name) VALUES (uuid(), ?)', ['Shopping']);
  await tx.execute('INSERT INTO todos (id, list_id, description) VALUES (uuid(), ?, ?)', [listId, 'Milk']);
});
```

### Row Mapping

```dart
factory Todo.fromRow(Map<String, dynamic> row) => Todo(
  id: row['id'] as String,
  description: row['description'] as String,
  completed: row['completed'] == 1,
  createdAt: DateTime.parse(row['created_at'] as String),
);
```

## ORM — Drift

PowerSync supports [Drift](https://pub.dev/packages/drift) as an ORM via [drift_sqlite_async](https://pub.dev/packages/drift_sqlite_async). See the package for setup instructions and usage examples.

## Flutter Web

Supported in `powersync` v1.9.0+.

- If using SDK 2.2.0+: OPFS is supported on all major browsers (Chrome, Firefox, and Safari) without additional server headers. The SDK auto-selects OPFS when available, falling back to IndexedDB on older browsers or Safari private browsing.
- If using SDK <2.2.0: enabling OPFS on Safari requires serving the app with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` response headers.
- If upgrading to 2.2.0 from an older version that used those CORS headers: remove the headers from your server. Existing OPFS databases in Safari continue to work; users who had IndexedDB databases keep them with no data loss.

See [Flutter Web Support](https://docs.powersync.com/client-sdks/frameworks/flutter-web-support.md) for full setup details and known limitations.

## Encryption

Two options are available for encrypting the local SQLite database at rest:

| Option | Platforms |
|--------|----------|
| [SQLite3MultipleCiphers](https://utelle.github.io/SQLite3MultipleCiphers) | Native + web |
| [SQLCipher Community Edition](https://www.zetetic.net/sqlcipher/) | Native only |

Configure the encryption library in `pubspec.yaml`:

```yaml
hooks:
  user_defines:
    sqlite3:
      source: sqlite3mc  # or: sqlcipher
```

When choosing between them:

- If the project targets Flutter Web, use `sqlite3mc`. SQLCipher is not available on web.
- If the project targets both web and native, use `sqlite3mc` across all platforms for consistency.
- If the project is native-only and needs better performance or compliance with [Apple export regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations), prefer `sqlcipher`. It links OpenSSL or `Security.framework` on Apple targets instead of a built-in implementation.

If upgrading from SDK v1.x: encryption setup changed in v2.0. Remove any dependency on `powersync_sqlcipher` and follow the migration steps in the docs.

See [Data Encryption](https://docs.powersync.com/client-sdks/advanced/data-encryption) for full setup details.
