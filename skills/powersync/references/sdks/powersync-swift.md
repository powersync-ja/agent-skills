# PowerSync Swift SDK

Best practices and guidance for building apps with the PowerSync Swift SDK. Use this reference when setting up PowerSync in a Swift project.

| Resource                                    | Description                                                    |
|----------------------------------------------|----------------------------------------------------------------|
| [Swift API reference](https://powersync-ja.github.io/powersync-swift/documentation/powersync/) | View all available APIs for PowerSync Swift.                   |
| [Supported Platforms - Swift SDK](http:///docs.powersync.com/resources/supported-platform.md#swift-sdk) | See supported platforms and features for the Swift SDK.         |

## Example Projects

To see example implementations of the PowerSync Swift SDK, see the projects listed below:

| Example Project            | Link                                                                                                                 |
|---------------------------|----------------------------------------------------------------------------------------------------------------------|
| PowerSync + Supabase      | [PowerSyncExample](https://github.com/powersync-ja/powersync-swift/tree/main/Demos/PowerSyncExample)                 |
| GRDB Demo                 | [GRDBDemo](https://github.com/powersync-ja/powersync-swift/tree/main/Demos/GRDBDemo)                                 |
| Encryption Demo           | [SwiftEncryptionDemo](https://github.com/powersync-ja/powersync-swift/tree/main/Demos/SwiftEncryptionDemo)           |

## Installation

Choose which fits best with your project.

| Installation Method      | Instructions |
|-------------------------|--------------|
| Using `Package.swift`   | See [Installation - Package.swift](https://docs.powersync.com/client-sdks/reference/swift.md#package-swift) for information. |
| Using `Xcode`           | See [Installation - Xcode](https://docs.powersync.com/client-sdks/reference/swift.md#xcode) for information. |

## Setup

### Define App Schema

```swift
import Foundation
import PowerSync

let LISTS_TABLE = "lists"
let TODOS_TABLE = "todos"

let lists = Table(
    name: LISTS_TABLE,
    columns: [
        // ID column is automatically included
        .text("name"),
        .text("created_at"),
        .text("owner_id")
    ]
)

let todos = Table(
    name: TODOS_TABLE,
    // ID column is automatically included
    columns: [
        .text("list_id"),
        .text("photo_id"),
        .text("description"),
        // 0 or 1 to represent false or true
        .integer("completed"),
        .text("created_at"),
        .text("completed_at"),
        .text("created_by"),
        .text("completed_by")
    ],
    indexes: [
        Index(
            name: "list_id",
            columns: [
                IndexedColumn.ascending("list_id")
            ]
        )
    ]
)
```

See [Define the Client-Side Schema](https://docs.powersync.com/client-sdks/reference/swift.md#1-define-the-client-side-schema) for more information.

### Create Backend Connector

```swift
import PowerSync

@Observable
@MainActor // _session is mutable, limiting to the MainActor satisfies Sendable constraints
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

        var lastEntry: CrudEntry?
        do {
            for entry in transaction.crud {
                lastEntry = entry
                let tableName = entry.table

                let table = client.from(tableName)

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
            print("Data upload error - retrying last entry: \(lastEntry!), \(error)")
            throw error
        }
    }
}
```

See [Integrate with your Backend](https://docs.powersync.com/client-sdks/reference/swift.md#3-integrate-with-your-backend) for more information.

**Note** use `getCrudBatch` when handling large numbers of mutations that need to be uploaded in bulk to the backend API.

### Instantiate the Database and Connect

```swift
/// We use the MainActor MyConnector synchronously here, this requires specifying that SystemManager runs on the MainActor
/// We don't actually block the MainActor with anything
@Observable
@MainActor
final class SystemManager {
    let connector = MyConnector()
    let schema = AppSchema
    let db: PowerSyncDatabaseProtocol

    init() {
        db = PowerSyncDatabase(
            schema: schema,
            dbFilename: "powersync-swift.sqlite"
        )
    }

    func connect() async {
        do {
            try await db.connect(
                connector: connector,
                options: ConnectOptions(
                    clientConfiguration: SyncClientConfiguration(
                        requestLogger: SyncRequestLoggerConfiguration(
                            requestLevel: .headers
                        ) { message in
                            self.db.logger.debug(message, tag: "SyncRequest")
                        }
                    )
                )
            )
        } catch {
            print("Unexpected error: \(error.localizedDescription)") // Catches any other error
        }
    }
}
```

See [Instantiate the PowerSync Database](https://docs.powersync.com/client-sdks/reference/swift.md#2-instantiate-the-powersync-database) for more information.

## Sync Streams

See [Client Usage](/skills/powersync/references/sync-config.md) for information on how to subscribe to Sync Streams if `auto_subscribe` is not set to `true` in the `sync_config` on the PowerSync Service instance config.

## Query Patterns

There are various functions that you can use to query data in the SQLite database. Each sub-section below covers how they work.

See [Using PowerSync: CRUD](https://docs.powersync.com/client-sdks/reference/swift.md#using-powersync-crud-functions) functions for more information.

### One-Time Queries

Use the following queries for once-off queries when reading data from the SQLite database.

| Query Type                                                                                                    | Example Code                                                                                     | Description                        |
|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|------------------------------------|
| [Get all](https://powersync-ja.github.io/powersync-swift/documentation/powersync/queries/getall(sql:parameters:mapper:))        | `let todos = try await db.getAll("SELECT * FROM todos WHERE list_id = ?", parameters: [listId])` | Fetch all matching results.         |
| [Get single](https://powersync-ja.github.io/powersync-swift/documentation/powersync/queries/get(sql:parameters:mapper:))     | `let todo = try await db.get("SELECT * FROM todos WHERE id = ?", parameters: [id])`             | Fetch a single, throws if not found. |
| [Get optional](https://powersync-ja.github.io/powersync-swift/documentation/powersync/queries/getoptional(sql:parameters:mapper:))   | `let todo = try await db.getOptional("SELECT * FROM todos WHERE id = ?", parameters: [id])`     | Fetch single, returns nil if absent. |

### Reactive Queries

Use the `watch` function to listen to changes whenever tables change.

| Query Type                                                                                                    | Example Code                                                                                     | Description                        |
|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|------------------------------------|
| [Watch](https://powersync-ja.github.io/powersync-swift/documentation/powersync/queries/watch(sql:parameters:mapper:))        | `db.watch(sql: "SELECT * FROM lists WHERE state = ?", parameters: ["pending"],` | Watch SQLite tables for changes and update. Use when needing reactive UI components.         |

### Writing Data

See the functions below when needed to mutate data in the SQLite database.

| Query Type                                                                                                    | Example Code                                                                                     | Description                        |
|--------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------|------------------------------------|
| [Execute](https://powersync-ja.github.io/powersync-swift/documentation/powersync/queries/execute(sql:parameters:))        | `try await db.execute("INSERT INTO todos (description, completed) VALUES (uuid(), ?, ?)", parameters: ["New todo", 0])` | Execute INSERT, UPDATE or DELETE statements. Best used for single mutations.         |
| [Write transaction](https://powersync-ja.github.io/powersync-swift/documentation/powersync/queries/writetransaction(callback:)) | `try await db.writeTransaction { tx in try await tx.execute("INSERT INTO lists (id, name) VALUES (?, ?)", parameters: [listId, "Shopping"]) }` | Executes a write transaction against the database. Used when you need to perform multiple related operations as a single unit. Transactions help maintain consistency and can improve performance for bulk operations. |

## ORM

PowerSync supports GRDB for ORM integration in the PowerSync Swift SDK. See [Architecture](https://docs.powersync.com/client-sdks/orms/swift/grdb#architecture) to gain an understanding of the overall architecture of the PowerSync Swift SDK GRDB integration.

### Requirements 
- PowerSync Swift v1.9.0

### Setup

Using GRDB requires a `DatabasePool` with PowerSync config. See [Setup](http:/docs.powersync.com/client-sdks/orms/swift/grdb.md#setup) for instructions.

### Usage

```swift
// Define a GRDB record type
struct Users: Codable, Identifiable, FetchableRecord, PersistableRecord {
    var id: String
    var name: String
    var count: Int

    enum Columns {
        static let name = Column(CodingKeys.name)
        static let count = Column(CodingKeys.count)
    }
}

// Fetch Users
let grdbUsers = try await pool.read { db in
    try Users.fetchAll(db)
}
```