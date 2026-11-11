---
name: powersync-rust
description: Setup, schema, CRUD, upload queue, checkpoint requests, and footguns for the PowerSync Rust SDK (beta).
metadata:
  tags: rust, cargo, powersync-rust, PowerSyncDatabase, BackendConnector, Authenticator, MutationUploader, resolve_credentials, invalidate_credentials, download_only, upload_only, fetch_credentials, upload_data, watch_statement, checkpoint, request_checkpoint, SyncOptions, PowerSyncEnvironment, tokio, smol, CheckpointError, crud_transactions
---

# PowerSync Rust SDK

> Load this file when the project depends on the `powersync` crate (`Cargo.toml`).

The Rust SDK is in **beta**: APIs are stable and the SDK is production-ready for tested use cases. Breaking changes will be communicated clearly.

- **Crate:** [powersync on crates.io](https://crates.io/crates/powersync)
- **API reference:** [docs.rs/powersync](https://docs.rs/powersync/latest/powersync/)
- **Source:** [powersync-native on GitHub](https://github.com/powersync-ja/powersync-native/)
- **Changelog:** [releases.powersync.com](https://releases.powersync.com/announcements/powersync-rust-sdk)
- **Examples:** [egui To-Do List](https://github.com/powersync-ja/powersync-native/blob/main/README.md)

## 1. Process Setup

Call this once early in `main()`, before any other SDK use:

```rust
PowerSyncEnvironment::powersync_auto_extension()
    .expect("could not load PowerSync core extension");
```

If you skip this call, the SDK panics or produces undefined behavior.

## 2. Open a Connection Pool

For a file-backed database with WAL mode:

```rust
fn open_pool() -> Result<ConnectionPool, PowerSyncError> {
    ConnectionPool::open("database.db")
}
```

For in-memory (tests or ephemeral use):

```rust
fn open_pool() -> Result<ConnectionPool, PowerSyncError> {
    let connection = Connection::open_in_memory()?;
    Ok(ConnectionPool::single_connection(connection))
}
```

## 3. Create the Environment and Database

### Tokio (enable the `tokio` feature on the `powersync` crate)

```rust
#[tokio::main]
async fn main() {
    PowerSyncEnvironment::powersync_auto_extension()
        .expect("could not load PowerSync core extension");

    let pool = open_pool().expect("open pool");
    let env = PowerSyncEnvironment::custom(
        reqwest::Client::new(),
        pool,
        PowerSyncEnvironment::tokio(),
    );
    let db = PowerSyncDatabase::new(env, schema::app_schema());
}
```

### smol (enable the `smol` feature; pass the executor explicitly)

```rust
async fn start_app(executor: Arc<Executor<'static>>) {
    let pool = open_pool().expect("open pool");
    let env = PowerSyncEnvironment::custom(
        reqwest::Client::new(),
        pool,
        PowerSyncEnvironment::async_io(executor),
    );
    let db = PowerSyncDatabase::new(env, schema::app_schema());
}

fn main() {
    PowerSyncEnvironment::powersync_auto_extension()
        .expect("could not load PowerSync core extension");
    let ex = Arc::new(Executor::new());
    smol::block_on(start_app(ex));
}
```

**Breaking change in 0.1.0:** `PowerSyncEnvironment::tokio_timer()` and `async_io_timer()` were replaced by `tokio()` and `async_io(executor)`. The old `db.async_tasks().spawn_with_tokio()` / `spawn_with()` calls are no longer needed. The SDK spawns internal sync tasks automatically on connect.

## 4. Define the Client-Side Schema

```rust
use powersync::schema::{Column, Schema, Table};

pub fn app_schema() -> Schema {
    let mut schema = Schema::default();
    schema.tables.push(Table::create(
        "todos",
        vec![
            Column::text("list_id"),
            Column::text("created_at"),
            Column::text("description"),
            Column::integer("completed"),  // booleans: integer (0/1)
            Column::text("completed_at"), // dates: text (ISO string)
        ],
        |_| {},
    ));
    schema
}
```

Never declare an `id` column. PowerSync creates it automatically. Use `Column::integer` for booleans and `Column::text` for ISO date strings.

## 5. Connect

```rust
db.connect(SyncOptions::new(
    "https://your-instance.powersync.com",
    MyAuthenticator,
    MyMutationUploader { db: db.clone() },
)).await;
```

In powersync 0.2.0 and later, `SyncOptions::new` takes the endpoint, an `Authenticator`, and a `MutationUploader`. If the project is on 0.1.x and still uses a single `BackendConnector`, `SyncOptions::new(my_backend_connector)` applies until it upgrades. For a read-only client, use `SyncOptions::download_only(endpoint, authenticator)`. For a client that only uploads, use `SyncOptions::upload_only`, which needs no endpoint or authenticator.

`connect()` is fire-and-forget. Do not await it expecting data to be ready. If you need to wait for the first sync, use `db.wait_for_first_sync().await`.

## 6. Authenticator and Mutation Uploader

In powersync 0.2.0 and later, the single `BackendConnector` is split in two. Implement `Authenticator` to supply the token, and `MutationUploader` to upload local writes. If the app never writes locally, connect with `SyncOptions::download_only` and skip the uploader. Local writes made in download-only mode cause a download error in the sync status.

`resolve_credentials` can be called several times while connected, so return a cached token. Implement `invalidate_credentials` to clear that cache. The SDK calls it on a 401 or when the token has expired or is about to expire.

```rust
#[async_trait]
impl Authenticator for MyAuthenticator {
    async fn resolve_credentials(&self) -> Result<Arc<String>, PowerSyncError> {
        Ok(Arc::new("your-jwt-token".to_string()))
    }

    fn invalidate_credentials(&self) {
        // clear the cached token
    }
}

#[async_trait]
impl MutationUploader for MyMutationUploader {
    async fn upload(&self) -> Result<(), PowerSyncError> {
        let mut local_writes = self.db.crud_transactions();
        while let Some(tx) = local_writes.try_next().await? {
            // send tx.crud to your backend here
            tx.complete().await?; // MUST call complete() or the queue stalls permanently
        }
        Ok(())
    }
}
```

Key rules:
- Always call `tx.complete()`. Omitting it stalls the upload queue permanently.
- If your backend returns a 4xx, the upload queue blocks permanently. Return 2xx for validation errors.

## CRUD Operations

### Reads

```rust
async fn find_list(db: &PowerSyncDatabase, id: &str) -> Result<(), PowerSyncError> {
    let reader = db.reader().await?;
    let mut stmt = reader.prepare("SELECT id, name FROM lists WHERE id = ?")?;
    let mut rows = stmt.query(params![id])?;
    while let Some(row) = rows.next()? {
        let id: String = row.get("id")?;
        let name: String = row.get("name")?;
        println!("{id}: {name}");
    }
    Ok(())
}
```

### Watching Queries

`watch_statement` re-runs the query whenever a dependent table changes:

```rust
let mut stream = db.watch_statement("SELECT * FROM todos ORDER BY created_at", params![]);
while let Some(result) = stream.next().await {
    let rows = result?;
    // update UI with rows
}
```

### Writes

```rust
async fn insert_todo(db: &PowerSyncDatabase, description: &str) -> Result<(), PowerSyncError> {
    let mut writer = db.writer().await?;
    writer.execute(
        "INSERT INTO todos (id, description) VALUES (uuid(), ?)",
        params![description],
    )?;
    Ok(())
}
```

For transactions, use the `transaction` method from `rusqlite` on the writer.

## Checkpoint Requests

Checkpoint requests let you wait until the local database has caught up to a specific server state, including confirming that local writes have been uploaded and their results synced back.

Requires PowerSync Service 1.24.0 or later. Enable with `CheckpointMode::Requests` in `SyncOptions`:

```rust
let mut options = SyncOptions::new(endpoint, authenticator, uploader);
options.with_checkpoint_mode(CheckpointMode::Requests(Default::default()));
db.connect(options).await;
```

To request and wait for a checkpoint:

```rust
async fn refresh_local_data(db: &PowerSyncDatabase) -> Result<(), CheckpointError> {
    let checkpoint = db.request_checkpoint().await?;
    checkpoint.wait_for_sync().await
}
```

Error handling:

```rust
if let Err(e) = refresh_local_data(db).await {
    match e {
        CheckpointError::Disabled => panic!("CheckpointMode::Requests not enabled"),
        CheckpointError::Disconnected => { /* device offline */ }
        CheckpointError::InstanceNotSupported
        | CheckpointError::CouldNotRequest { cause: _ } => { /* could not reach Service */ }
        CheckpointError::StatusError { cause: _ } => { /* error while waiting */ }
    }
}
```

For custom checkpoint routing through your own backend, implement `Authenticator::post_checkpoint_request` on your `Authenticator` (for Tauri, `BackendConnector::post_checkpoint_request`):

```rust
// inside `impl Authenticator for ...`
fn post_checkpoint_request<'a>(
    &'a self,
    client_id: &'a str,
    request_id: i64,
) -> Option<Pin<Box<dyn Future<Output = Result<i64, PowerSyncError>> + Send + 'a>>> {
    Some(
        async move {
            let response = self
                .backend
                .create_checkpoint_request(client_id, request_id)
                .await?;
            Ok(response.request_id)
        }
        .boxed(),
    )
}
```

## Logging

The SDK uses the `log` crate. Configure any backend, for example `env_logger`:

```rust
env_logger::init();
```

## Key Footguns

- If you skip `powersync_auto_extension()`, the SDK panics or produces undefined behavior.
- For smol (0.1.0+), pass the executor to `async_io(executor)`. The old `spawn_with` / `spawn_with_tokio` API is removed.
- `connect()` is fire-and-forget. Use `wait_for_first_sync()` if you need readiness.
- `tx.complete()` is mandatory. Omitting it stalls the upload queue permanently.
- Backend must return 2xx for validation errors. A 4xx blocks the upload queue permanently.
- Never declare `id` in the schema. PowerSync creates it automatically.
- `request_checkpoint()` requires the database to be connected. If offline, the call waits until the Service is reachable.
