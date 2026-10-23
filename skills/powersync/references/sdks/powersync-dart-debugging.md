---
name: powersync-dart-debugging
description: Inspect and query the local PowerSync database of a running Dart or Flutter app through the PowerSync VM service extensions (via the Dart MCP server). Use when debugging sync state, checking what data is on the device, inspecting the schema, or verifying that local writes landed, while the app runs in debug or profile mode.
---

# Inspecting a live PowerSync database

> **Load this when** Inspecting PowerSync functionality in a running Dart/Flutter app.

Apps that use `package:powersync` register VM service extensions on their main
isolate in debug and profile builds. The PowerSync DevTools extension uses
them, and you can call them yourself with the Dart MCP server's `vm_service`
tool.

## Prerequisites

- The Dart MCP server must be available to you (tools named `dtd` and
  `vm_service`). If it isn't, ask the user to add it, you can't connect
  to the app without it.
- The app must run in debug or profile mode and be registered with the Dart
  Tooling Daemon (DTD). Apps started from an IDE or with `flutter run` are.

## Connecting

1. `dtd` → `listDtdUris`. Pick the instance whose workspace root matches the
   app, then `dtd` → `connect`. The result lists the connected apps. Apps
   launched from an IDE may instead be listed under an IDE instance whose
   workspace root is `/` or a home directory. If no instance matches, try
   those.
2. `vm_service` → `callMethod`, method `getVM`. Find the isolate named `main`
   and note its id (`isolates/<number>`). Pass that id as `isolateId` to every
   extension call below.
   - Ignore other isolates, a `PowerSyncDatabase` instance must exist on an
     isolate for the extensions to be available, and in most apps that only
     happens on `main`.
   - Isolate ids change after every hot restart, so call `getVM` again after a
     restart. Old isolates can stay around for a while. Use the `main` isolate
     from the newest isolate group.
   - Don't call `getIsolate` just to check the extensions: its response is very
     large. If you need to, look at the `extensionRPCs` field only.
3. Call `ext.powersync.list` (no arguments) to find database ids:

   ```json
   {"databases": [{"id": 0, "name": "powersync-demo.db", "path": "...",
     "lastCredentials": {"endpoint": "https://..."},
     "options": {"params": {}, "metadata": {}}}]}
   ```

## Running commands

All database commands go through `ext.powersync.database`. **All arguments
are strings.** `db` is the id from `list` as a string, and `params` is a
JSON-encoded array. Blobs are encoded as `{"binary": "<base64>"}`, both in
parameters and in results.

```json
{"command": "select", "db": "0", "sql": "SELECT * FROM lists WHERE id = ?", "params": "[\"<uuid>\"]"}
```

A successful call returns `{"ok": <result>}`. A failed call returns an error
whose JSON has `error` and `trace` fields.

### Read-only commands (safe to use freely)

| command | arguments | result |
|---|---|---|
| `select` | `sql`, `params` | `{"columnNames": [...], "rows": [[...], ...]}` |
| `schema` | none | the app's PowerSync schema as JSON |

Useful queries:

- Pending uploads: `SELECT * FROM ps_crud ORDER BY id`.
- Bucket and sync state: `SELECT * FROM ps_buckets`. Main columns: `name`,
  `last_applied_op`, `last_op`, `count_at_last`, `count_since_last`,
  `downloaded_size`. If you're unsure of a column, use `SELECT *` instead of guessing.
- Core extension version: `SELECT powersync_rs_version()`.

`select` currently runs inside a **write lock**, so it blocks writes from the
app and from sync while it runs. Keep queries small: use `LIMIT` and select
only the columns you need. Don't poll in a tight loop.

### State-changing commands (ask the user first)

Use these only when the user asked for them, or after confirming with them:

| command | effect |
|---|---|
| `execute` (`sql`, `params`) | Runs a statement against the local database. **Writes to synced tables are recorded in `ps_crud` and will be uploaded to the user's backend** through the app's connector. Treat them like real user actions. |
| `reconnect` | Reconnects the sync client. |
| `disconnect` | Stops syncing. |
| `request-checkpoint` | Asks the sync service for a new checkpoint (requires the app to be connected with `RequestsCheckpointMode`). |
| `clear-data` | **Destructive.** Disconnects and deletes all local data, including uploads that haven't been sent yet. |
| `sync-subscribe` / `sync-unsubscribe` (`name`, `params` as a JSON object (pass `{}` if there are none), `ttl` in seconds, `priority`) | Subscribes to or unsubscribes from a Sync Stream. |

### Other commands

Other commands are not typically necessary for agents.
If needed, you can find the full list of commands and their definitions in `package:powersync/src/devtools/extension.dart`
(which you can read using the `read_package_uris` tool from the Dart MCP server).
