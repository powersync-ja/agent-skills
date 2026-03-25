---
name: powersync-debug
description: PowerSync debugging and troubleshooting — sync status, JWT verification, PSYNC error codes, replication lag, and diagnostics tools
metadata:
  tags: debugging, troubleshooting, sync-status, jwt, psync-errors, replication-lag, ps-crud, diagnostics
---

# PowerSync Debug

These are debugging steps most frequently recommended by PowerSync, with an explanation of what problem each step helps identify and why it works.

Make sure to understand the [PowerSync Architecture](references/powersync-overview.md) before debugging.

## First Response When the UI Is Stuck on `Syncing...`

Before asking for console logs or editing app code, verify these in order:

1. The PowerSync endpoint URL returned by `fetchCredentials()` is correct (not the backend URL).
2. The PowerSync service has a valid source DB connection.
3. Sync config was deployed and starts with `config: edition: 3`.
4. Client auth is configured correctly (Supabase auth, custom JWKS, or other provider).
5. Source database replication/publication/CDC is set up for the synced tables.

Only inspect frontend connector code or SDK state after all five checks pass.

Before requesting browser console logs, ask the user to confirm:

- the instance exists
- the DB connection was configured
- sync config was deployed
- client auth was configured
- source database replication/publication/CDC was set up

## Check `SyncStatus` / `currentStatus` Before Investigating Further

What it identifies: Whether the SDK is actually connected, syncing, or has hit an error, before diving into logs.

Why: `SyncStatus` is the SDK's live view of its own state. It surfaces connection state, whether a first sync has completed, whether uploads are processing etc. Checking it first avoids chasing a perceived bug that is actually just "not yet connected."

How:

Each of the PowerSync Client SDKs have the SyncStatus class that can be used to access the client sync status.

| SDK             | Link                                                                                                                                                                                                |
|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Flutter         | [SyncStatus Class](https://pub.dev/documentation/powersync/latest/powersync/SyncStatus-class.html)                                                                                                  |
| Kotlin          | [SyncStatus Class](https://powersync-ja.github.io/powersync-kotlin/core/com.powersync.sync/-sync-status/index.html?query=data%20class%20SyncStatus%20:%20SyncStatusData)                            |
| Swift           | [SyncStatusData](https://powersync-ja.github.io/powersync-swift/documentation/powersync/syncstatusdata)                                                                                            |
| Web             | [SyncStatus Class](https://powersync-ja.github.io/powersync-js/web-sdk/classes/SyncStatus)                                                                                                          |
| React Native    | [SyncStatus Class](https://powersync-ja.github.io/powersync-js/react-native-sdk/classes/SyncStatus)                                                                                                |
| Node.js         | [SyncStatus Class](https://powersync-ja.github.io/powersync-js/node-sdk/classes/SyncStatus)                                                                                                         |
| .NET (Alpha)    | [SyncStatus.cs](https://github.com/powersync-ja/powersync-dotnet/blob/2728eab0d13849686ff3f9a603040940744599e1/PowerSync/PowerSync.Common/DB/Crud/SyncStatus.cs)                                   |

Key fields to check: `connected`, `downloading`, `uploading`, `lastSyncedAt`, `hasSynced`, `downloadError`, `uploadError`.

## Enable `newClientImplementation: false` (Swift SDK only)

What it identifies: Authentication failures, JWT errors, and endpoint misconfigurations that are silently swallowed by the default WebSocket client on Apple platforms.

Why: The default WebSocket-based sync client on iOS/macOS restricts logging due to platform constraints. Switching to `newClientImplementation: false` uses the HTTP streaming client instead, which produces full request/response logs including headers, status codes, and error bodies. The actual 401 + `PSYNC_S2101` error that pointed to a JWT key mismatch was only visible after this switch.

How: In the `connect` function for each of the PowerSync Client SDKs, disable the Rust Sync Client / disable `newClientImplementation`.

Revert after debugging: The default WebSocket client is preferred for production.

## Enable the Request Logger (Swift SDK)

What it identifies: The exact HTTP request being made to the PowerSync Service to inspect the URL, method, headers, authorization token, and response status code.

Why: Even with `newClientImplementation: false`, request details aren't logged by default. Adding a `SyncRequestLoggerConfiguration` gives you a full audit trail of every sync stream request, which lets you verify the `endpoint` URL is correct and the JWT is being sent.

How:
```swift
try await db.connect(
    connector: connector,
    options: ConnectOptions(
        newClientImplementation: false,
        clientConfiguration: SyncClientConfiguration(
            requestLogger: SyncRequestLoggerConfiguration(
                requestLevel: .headers
            ) { message in
                print("[SyncRequest] \(message)")
            }
        )
    )
)
```

Look for: The `Authorization: Token <jwt>` header and the response status (`200`, `401`, `404`). A `401` with `PSYNC_S2101` in the response body means JWT key ID mismatch.

## Use the Sync Diagnostics Client

What it identifies: Whether the PowerSync Service is processing your sync rules correctly, what data is in each bucket for a given user, and whether parameter queries are resolving as expected.

Why: Most "data not showing up on the client" issues are actually server-side: wrong Sync Rules / Sync Streams, parameter query not matching etc. The Diagnostics Client lets you verify this without touching client code. It runs entirely in the browser against your real instance.

How: Go to [diagnostics-app.powersync.com](https://diagnostics-app.powersync.com/), connect to your PowerSync instance, and:
1. Check the Client Parameters page to configure client parameters to test buckets that use parameter queries.
2. Run queries directly in the SQL Console to confirm row counts.
3. Check bucket and Sync Streams subscriptions contents to see exactly what data will be synced to a given user.
4. Use the SQLite File Inspector to drag-and-drop a local `.db` file and inspect its contents directly in the browser.

The Sync Diagnostics Client is also self-hostable and the Docker image is available on [Docker hub](https://hub.docker.com/r/journeyapps/powersync-diagnostics-app).


## Inspect `ps_crud` Directly

What it identifies: Whether local writes are reaching the upload queue, how many are pending, and what operation/data they contain.

Why: `ps_crud` is the raw upload queue table in the local SQLite database. It is the ground truth for "has this write been recorded by PowerSync?". This is distinct from whether it has been uploaded to the backend. If `ps_crud` is empty after a write, the write either didn't go through the PowerSync managed table, or `transaction.complete()` was called prematurely.

How:
```sqlite
SELECT * FROM ps_crud ORDER BY id
```

What to look for: `op` (PUT/PATCH/DELETE), `type` (table name), `id`, `opData` (changed columns). If a column you updated is missing from `opData`, it means its value didn't change from the previous row (PowerSync intentionally omits unchanged values).

## Log the Actual `endpoint` URL in `fetchCredentials()`

What it identifies: Whether the `endpoint` value returned by your connector is pointing at the PowerSync Service, not your app backend.

Why: The most common cause of `404 Not Found` on `/write-checkpoint2.json` and `/sync/stream` is passing the wrong URL as `endpoint`. PowerSync builds its own request URLs by appending paths to whatever `endpoint` returns, if that's your app backend, every internal PowerSync request 404s. Adding a log statement catches this immediately.

How: Adding a log statement or set breakpoints to catch the endpoint before fetchCredentials() returns.

## Run `EXPLAIN QUERY PLAN` for Slow Queries

What it identifies: Full table scans, missing indexes, and inefficient joins in client-side SQLite queries.

Why: PowerSync's default JSON-based views extract column values on every row scan, which compounds in joins. Without indexes on join columns, SQLite performs a full scan of every row. `EXPLAIN QUERY PLAN` makes this visible. A `SCAN TABLE` without `USING INDEX` is a red flag.

How:
```sqlite
EXPLAIN QUERY PLAN SELECT ...
```

What to look for: `SCAN TABLE <name>` (bad / no index used) vs. `SEARCH TABLE <name> USING INDEX` (good). If your PowerSync tables show a SCAN, switch to [raw tables](https://docs.powersync.com/usage/use-case-examples/raw-tables.md). If your non-PowerSync tables show a SCAN, add an index on the join column.

## Check Package Versions and Duplicate Dependencies

What it identifies: Version mismatches between PowerSync packages and their peers (Drizzle, TanStack, op-sqlite), or duplicate transitive dependencies causing type conflicts.

Why: TypeScript errors with `@tanstack/react-db` and `@powersync/drizzle-driver` are often caused by multiple versions of `@powersync/common` or `@tanstack/db` installed across direct and transitive dependencies. The packages reference internal types that clash when versions differ.

How:
```bash
# Check for multiple PowerSync common versions
npm ls @powersync/common

# Check TanStack version alignment
npm ls @tanstack/react-db @tanstack/powersync-db-collection @tanstack/db

# Check op-sqlite peer dependency
npm ls @powersync/op-sqlite
```

Also try: Deleting `node_modules` and the lock file, then reinstalling — stale cached resolutions can cause phantom mismatches.

## Verify JWT Claims

What it identifies: Whether your JWT contains the expected `sub`, `aud`, `iss`, `exp`, `kid`, and custom claims that PowerSync uses for auth and parameter queries.

Why: JWT issues are the most common connection failure cause. The PowerSync Service validates the `kid` (key ID) against its configured keystore. A mismatch gives `PSYNC_S2101` (See [Error Codes Reference](https://docs.powersync.com/debugging/error-codes.md#error-codes-reference)). It also enforces `exp` ≤ 86400s (`PSYNC_S2104`). Custom claims used in parameter queries (e.g. `app_metadata`) must be present and structured exactly as the sync rules expect.

How: Paste your JWT into [jwt.io](https://jwt.io) or decode it in your debugger.

Check:
- `sub` — user ID used in `request.user_id()`
- `kid` — must match a key in PowerSync's keystore (Supabase: legacy vs. JWKS)
- `exp` — must be ≤ `iat + 86400`
- `aud` — must match your configured audience
- Custom claims e.g. `app_metadata.my_field` must use `$.app_metadata.my_field` in sync rules

The Sync Diagnostics Client also decodes and displays the active JWT automatically.

## Call `disconnectAndClear()` When Data Looks Wrong After User Switch

What it identifies: Whether stale data from a previous user is polluting the local SQLite database.

Why: `disconnect()` closes the sync connection but keeps all local data. If you call `disconnect()` on logout and then `connect()` with a new user, the new user's UI will initially display the old user's data until sync completes. `disconnectAndClear()` wipes the local database first, so the new user starts from a clean state.

When to use each:
- `disconnect()` — temporary offline, token refresh, app backgrounding. Safe to reconnect as the same user.
- `disconnectAndClear()` — user logout, user account switch. Required to prevent data leakage between users.

## PSYNC Error Codes

PowerSync has a documented list of error codes with corresponding descriptions. 

These error codes are prefixed with `PSYNC_`, indicating a specific PowerSync related error.

Use them to help drill into specific errors to help debug an issue.

See [Error Codes Reference](https://docs.powersync.com/debugging/error-codes.md#error-codes-reference) for more information.

# Replication Lag Debugging (Postgres)

What it identifies:
- Sync rules deployment stuck in “processing” for many hours or days (e.g. 24–48+ hours)
- Replication logs show: Replication slot powersync_* is not valid anymore. invalidation_reason: unknown
- Slot version numbers keep increasing (e.g. _27_, _28_, _30_) as reprocessing restarts
- Storage usage spikes during reprocessing (expected, but can trigger limit alerts)
- Source DB is Supabase or another Postgres with default max_slot_wal_keep_size (often 4 GB)

Why:
- `max_slot_wal_keep_size` limits how much WAL Postgres keeps for replication slots
- During initial replication, WAL grows quickly because: (1) full snapshot of all tables in sync rules, (2) ongoing writes on the source DB
- If replication lag exceeds `max_slot_wal_keep_size`, Postgres invalidates the slot (`wal_status = 'lost'`)
- PowerSync detects the invalid slot, creates a new one, and restarts reprocessing
- With the same limit, the new slot is invalidated again, causing a loop
- Supabase’s default 4 GB is often too small for large datasets (e.g. 9+ hour initial replication)

How:
Confirm the cause: Check replication slot status and lag.

See [Production Readiness Best Practices](https://docs.powersync.com/maintenance-ops/production-readiness-guide.md#managing-&-monitoring-replication-lag) for the queries and guidance on how to resolve this.
