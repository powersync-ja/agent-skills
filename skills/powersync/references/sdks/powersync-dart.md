---
name: powersync-dart
description: PowerSync Dart SDK — schema, queries, sync lifecycle, backend connectors, Drift ORM, and Flutter Web support
metadata:
  tags: dart, flutter, flutter-web, drift, orm, sqlite
---

# PowerSync Dart SDK

Best practices and guidance for building Flutter apps with the PowerSync Dart SDK. Use this reference when setting up PowerSync in a Flutter project, configuring the client, defining schemas, writing queries, ORM support and Dart/Flutter Web support.

| Resource                                    | Description                                                    |
|----------------------------------------------|----------------------------------------------------------------|
| [Dart API reference](https://pub.dev/documentation/powersync/latest/powersync/) | View all available APIs for PowerSync Dart.                   |

## Example Projects

To see example implementations of the PowerSync Dart SDK, see the projects listed below:

| Example Project            | Link                                                                                                                 |
|---------------------------|----------------------------------------------------------------------------------------------------------------------|
| PowerSync + Supabase      | [supabase-todolist](https://github.com/powersync-ja/powersync.dart/tree/main/demos/supabase-todolist)                 |
| PowerSync + Supabase Drift Demo   | [supabase-todolist-drift](https://github.com/powersync-ja/powersync.dart/tree/main/demos/supabase-todolist-drift)                                 |

## Installation

```bash
flutter pub add powersync
```

## Upgrading 
```bash
flutter pub upgrade powersync
```

## Setup

### Define App Schema

```dart
import 'package:powersync/powersync.dart';

const schema = Schema(([
  Table('todos', [
    Column.text('list_id'),
    Column.text('created_at'),
    Column.text('completed_at'),
    Column.text('description'),
    Column.integer('completed'),
    Column.text('created_by'),
    Column.text('completed_by'),
  ], indexes: [
    // Index to allow efficient lookup within a list
    Index('list', [IndexedColumn('list_id')])
  ]),
  Table('lists', [
    Column.text('created_at'),
    Column.text('name'),
    Column.text('owner_id')
  ])
]));
```

See [Define the Client-Side Schema](https://docs.powersync.com/client-sdks/reference/flutter.md#1-define-the-client-side-schema) for more information.

### Create Backend Connector

```dart
import 'package:powersync/powersync.dart';

class MyBackendConnector extends PowerSyncBackendConnector {
  PowerSyncDatabase db;

  MyBackendConnector(this.db);
  @override
  Future<PowerSyncCredentials?> fetchCredentials() async {

    return PowerSyncCredentials(
      endpoint: 'https://xxxxxx.powersync.journeyapps.com',
      token: 'An authentication token'
    );
  }

  @override
  Future<void> uploadData(PowerSyncDatabase database) async {
    final transaction = await database.getNextCrudTransaction();
    if (transaction == null) {
      return;
    }

    for (var op in transaction.crud) {
      switch (op.op) {
        case UpdateType.put:
          // TODO: Instruct your backend API to CREATE a record
        case UpdateType.patch:
          // TODO: Instruct your backend API to PATCH a record
        case UpdateType.delete:
        //TODO: Instruct your backend API to DELETE a record
      }
    }

    await transaction.complete();
  }
}
```

See [Integrate with your Backend](https://docs.powersync.com/client-sdks/reference/flutter.md#3-integrate-with-your-backend) for more information.

Note use `getCrudBatch` when handling large numbers of mutations that need to be uploaded in bulk to the backend API.

### Instantiate the Database and Connect

1. Initialize `PowerSyncDatabase` and call `initialize()`

``` dart
import 'package:path/path.dart';
import 'package:path_provider/path_provider.dart';
import 'package:powersync/powersync.dart';
import '../main.dart';
import '../models/schema.dart';

openDatabase() async {
  final dir = await getApplicationSupportDirectory();
  final path = join(dir.path, 'powersync-dart.db');

  // Set up the database
  // Inject the Schema you defined in the previous step and a file path
  db = PowerSyncDatabase(schema: schema, path: path);
  await db.initialize();
}
```

2. Connect to the PowerSync Service

```dart
import 'package:flutter/material.dart';
import 'package:powersync/powersync.dart';

import 'powersync/powersync.dart';

late PowerSyncDatabase db;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await openDatabase();
  runApp(const DemoApp());
}

class DemoApp extends StatefulWidget {
  const DemoApp({super.key});

  @override
  State<DemoApp> createState() => _DemoAppState();
}

class _DemoAppState extends State<DemoApp> {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
        title: 'Demo',
        home: // TODO: Implement your own UI here.
        // You could listen for authentication state changes to connect or disconnect from PowerSync
        StreamBuilder(
            stream: // TODO: some stream,
            builder: (ctx, snapshot) {,
              // TODO: implement your own condition here
              if ( ... ) {
                // Uses the backend connector that will be created in the next step
                db.connect(connector: MyBackendConnector());
                // TODO: implement your own UI here
              }
            },
        )
    );
  }
}
```

See [Instantiate the PowerSync Database](https://docs.powersync.com/client-sdks/reference/flutter.md#2-instantiate-the-powersync-database) for more information.

## Sync Streams

See [Client Usage](/skills/powersync/references/sync-config.md) for information on how to subscribe to Sync Streams if `auto_subscribe` is not set to `true` in the `sync_config` on the PowerSync Service instance config.

## Query Patterns

There are various functions that you can use to query data in the SQLite database. Each sub-section below covers how they work.

See [Using PowerSync: CRUD](https://docs.powersync.com/client-sdks/reference/flutter.md#using-powersync-crud-functions) functions for more information.

### Define a model class

```dart
class TodoList {
  final int id;
  final String name;
  final DateTime createdAt;
  final DateTime updatedAt;

  TodoList({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.updatedAt,
  });

  factory TodoList.fromRow(Map<String, dynamic> row) {
    return TodoList(
      id: row['id'],
      name: row['name'],
      createdAt: DateTime.parse(row['created_at']),
      updatedAt: DateTime.parse(row['updated_at']),
    );
  }
}
```

### One-Time Queries

Use the following queries for once-off queries when reading data from the SQLite database.

| Query Type                                                                                                    | Example Code                                                                                     | Description                        |
|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|------------------------------------|
| [Get all](https://pub.dev/documentation/powersync/latest/sqlite_async/SqliteReadContext/getAll.html)        | `ResultSet results = await db.getAll('SELECT id FROM lists WHERE id IS NOT NULL');` | Fetch all matching results.         |
| [Get single](https://pub.dev/documentation/powersync/latest/sqlite_async/SqliteReadContext/get.html)     | `final result = await db.get('SELECT * FROM lists WHERE id = ?', [id]);`             | Fetch a single row, throws if not found. |
| [Get optional](https://pub.dev/documentation/powersync/latest/sqlite_async/SqliteReadContext/getOptional.html)   | `final result = await db.getOptional('SELECT * FROM lists WHERE id = ?', [id]);`     | Execute a read-only (SELECT) query and return a single optional result. |

### Reactive Queries

Use the `watch` function to listen to changes whenever tables change.

```dart
StreamBuilder(
  stream: db.watch('SELECT * FROM lists WHERE state = ?', ['pending']),
  builder: (context, snapshot) {
    if (snapshot.hasData) {
      // TODO: implement your own UI here based on the result set
      return ...;
    } else {
      return const Center(child: CircularProgressIndicator());
    }
  },
)
```

See the [API reference](https://pub.dev/documentation/powersync/latest/sqlite_async/SqliteQueries/watch.html) for the exact specification.

### Writing Data

See the functions below when needed to mutate data in the SQLite database.

| Query Type                                                                                                    | Example Code                                                                                     | Description                        |
|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|------------------------------------|
| [Execute](https://pub.dev/documentation/powersync/latest/sqlite_async/SqliteQueries/execute.html)        | `await db.execute('INSERT INTO lists(id, created_at, name, owner_id) VALUES(uuid(), datetime(), ?, ?)', ['name', '123']);` | Execute INSERT, UPDATE or DELETE statements. Best used for single mutations.         |
| [Write transaction](https://pub.dev/documentation/powersync/latest/sqlite_async/SqliteWriteContext/writeTransaction.html) | `await db.writeTransaction((tx) async { await tx.execute('INSERT INTO lists (id, name) VALUES (?, ?)', [listId, 'Shopping']); });` | Executes a write transaction against the database. Used when you need to perform multiple related operations as a single unit. Transactions help maintain consistency and can improve performance for bulk operations. |

## ORM

PowerSync has ORM support using [Drift](https://pub.dev/packages/drift). See the [drift_sqlite_async](https://pub.dev/packages/drift_sqlite_async) for usage examples and how to set this up in a Dart/Flutter application.

## Web Support

PowerSync has support for Flutter Web in `powersync` version ^1.9.0. See [Dart/Flutter Web](https://docs.powersync.com/client-sdks/frameworks/flutter-web-support.md) for detailed information such as additional configuration requirements, OPFS(origin private file system) for improved performance and limitations that developers should be aware of. 