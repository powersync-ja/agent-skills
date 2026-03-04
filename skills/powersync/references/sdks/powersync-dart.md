---
name: powersync-dart
description: PowerSync Dart SDK — schema, queries, sync lifecycle, backend connectors, Drift ORM, and Flutter Web support
metadata:
  tags: dart, flutter, flutter-web, drift, orm, sqlite
---

# PowerSync Dart SDK

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

## Sync Streams

See [sync-config.md](references/sync-config.md) for how to subscribe to Sync Streams when `auto_subscribe` is not set to `true` in the PowerSync Service config.

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

Supported in `powersync` v1.9.0+. See [Flutter Web Support](https://docs.powersync.com/client-sdks/frameworks/flutter-web-support.md) for configuration requirements, OPFS setup for improved performance, and known limitations.
