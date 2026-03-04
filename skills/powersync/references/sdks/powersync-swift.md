---
name: powersync-swift
description: PowerSync Swift SDK — schema, queries, sync lifecycle, backend connectors, and GRDB ORM support
metadata:
  tags: swift, ios, macos, grdb, orm, sqlite, offline-first
---

# PowerSync Swift SDK

Best practices and guidance for building apps with the PowerSync Swift SDK.

| Resource | Description |
|----------|-------------|
| [Swift API reference](https://powersync-ja.github.io/powersync-swift/documentation/powersync/) | Full API reference, consult only when the inline examples don't cover your case. |
| [Supported Platforms](https://docs.powersync.com/resources/supported-platform.md#swift-sdk) | Supported platforms and features, consult for compatibility details. |

## Installation

| Method | Instructions |
|--------|-------------|
| `Package.swift` | [Installation - Package.swift](https://docs.powersync.com/client-sdks/reference/swift.md#package-swift) |
| Xcode | [Installation - Xcode](https://docs.powersync.com/client-sdks/reference/swift.md#xcode) |

## Setup

### 1. Define Schema

```swift
import PowerSync

let lists = Table(
    name: "lists",
    columns: [
        // id column is automatically included
        .text("name"),
        .text("created_at"),
        .text("owner_id")
    ]
)

let todos = Table(
    name: "todos",
    columns: [
        .text("list_id"),
        .text("description"),
        .integer("completed"), // 0 or 1
        .text("created_at"),
        .text("completed_at"),
        .text("created_by"),
        .text("completed_by")
    ],
    indexes: [
        Index(name: "list_id", columns: [IndexedColumn.ascending("list_id")])
    ]
)

let AppSchema = Schema(tables: [lists, todos])
```

See [Define the Client-Side Schema](https://docs.powersync.com/client-sdks/reference/swift.md#1-define-the-client-side-schema) for more information.

### 2. Create Backend Connector

```swift
import PowerSync

@Observable
@MainActor
final class MyConnector: PowerSyncBackendConnectorProtocol {
    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    func fetchCredentials() async throws -> PowerSyncCredentials? {
        let response = try await apiClient.getPowerSyncToken()
        return PowerSyncCredentials(
            endpoint: "https://your-instance.powersync.journeyapps.com",
            token: response.token,
            expiresAt: response.expiresAt
        )
    }

    func uploadData(database: PowerSyncDatabaseProtocol) async throws {
        guard let transaction = try await database.getNextCrudTransaction() else { return }

        do {
            for entry in transaction.crud {
                switch entry.op {
                case .put:
                    var data = entry.opData ?? [:]
                    data["id"] = entry.id
                    try await apiClient.upsert(table: entry.table, id: entry.id, data: data)
                case .patch:
                    guard let opData = entry.opData else { continue }
                    try await apiClient.update(table: entry.table, id: entry.id, data: opData)
                case .delete:
                    try await apiClient.delete(table: entry.table, id: entry.id)
                }
            }
            try await transaction.complete()
        } catch {
            throw error
        }
    }
}
```

Use `getCrudBatch` instead of `getNextCrudTransaction` when uploading large numbers of mutations in bulk.

See [Integrate with your Backend](https://docs.powersync.com/client-sdks/reference/swift.md#3-integrate-with-your-backend) for more information.

### 3. Instantiate and Connect

```swift
@Observable
@MainActor
final class SystemManager {
    let connector = MyConnector()
    let db: PowerSyncDatabaseProtocol

    init() {
        db = PowerSyncDatabase(
            schema: AppSchema,
            dbFilename: "powersync-swift.sqlite"
        )
    }

    func connect() async throws {
        try await db.connect(connector: connector)
    }
}
```

See [Instantiate the PowerSync Database](https://docs.powersync.com/client-sdks/reference/swift.md#2-instantiate-the-powersync-database) for more information.

## Sync Streams

See [sync-config.md](references/sync-config.md) for how to subscribe to Sync Streams when `auto_subscribe` is not set to `true` in the PowerSync Service config.

## Query Patterns

See [Using PowerSync: CRUD](https://docs.powersync.com/client-sdks/reference/swift.md#using-powersync-crud-functions) for the full API reference.

### One-Time Queries

```swift
// Fetch all matching rows
let todos = try await db.getAll("SELECT * FROM todos WHERE list_id = ?", parameters: [listId])

// Fetch single row — throws if not found
let todo = try await db.get("SELECT * FROM todos WHERE id = ?", parameters: [id])

// Fetch single row — returns nil if not found
let todo = try await db.getOptional("SELECT * FROM todos WHERE id = ?", parameters: [id])
```

### Reactive Queries

```swift
// Watch a query — emits on every change to the watched tables
for try await todos in db.watch("SELECT * FROM todos WHERE list_id = ?", parameters: [listId]) {
    // update UI
}
```

### Writing Data

```swift
// Single mutation
try await db.execute(
    "INSERT INTO todos (id, description, completed) VALUES (uuid(), ?, ?)",
    parameters: ["New todo", 0]
)

// Multiple related mutations as a single unit
try await db.writeTransaction { tx in
    try await tx.execute("INSERT INTO lists (id, name) VALUES (?, ?)", parameters: [listId, "Shopping"])
    try await tx.execute("INSERT INTO todos (id, list_id, description) VALUES (uuid(), ?, ?)", parameters: [listId, "Milk"])
}
```

## ORM — GRDB

PowerSync Swift supports GRDB as an ORM. Requires PowerSync Swift v1.9.0+.

Setup requires a `DatabasePool` with PowerSync config — see [GRDB Setup](https://docs.powersync.com/client-sdks/orms/swift/grdb.md#setup).

```swift
// Define a GRDB record type
struct Todo: Codable, Identifiable, FetchableRecord, PersistableRecord {
    var id: String
    var description: String
    var completed: Int
}

// Read
let todos = try await pool.read { db in
    try Todo.fetchAll(db)
}

// Write
try await pool.write { db in
    var todo = Todo(id: UUID().uuidString, description: "Buy milk", completed: 0)
    try todo.insert(db)
}
```

See [GRDB Architecture](https://docs.powersync.com/client-sdks/orms/swift/grdb.md#architecture) for how the PowerSync + GRDB integration works.
