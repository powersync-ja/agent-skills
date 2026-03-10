---
name: powersync-js
description: PowerSync JavaScript/TypeScript SDK — schema, backend connector, queries, transactions, sync status, raw tables, Drizzle/Kysely ORM, and debugging
metadata:
  tags: javascript, typescript, web, sqlite, offline-first, drizzle, kysely
---

# PowerSync JavaScript/TypeScript SDK

Core patterns and guidance shared across all PowerSync JavaScript/TypeScript targets. Use this reference for any JS/TS project — it covers schema design, the backend connector, database initialization, transactions, imperative queries, sync status, raw tables, and debugging. Always load this file as the foundation, then load the applicable framework-specific file alongside it.

| Resource | Description |
|----------|-------------|
| [JS/TS Reference](https://docs.powersync.com/client-sdks/reference/javascript-web.md) | Full SDK documentation for Web, consult for details beyond the inline examples. |
| [Web SDK API Reference](https://powersync-ja.github.io/powersync-js/web-sdk) | Full API reference for `@powersync/web`, consult only when the inline examples don't cover your case. |
| [React Native Reference](https://docs.powersync.com/client-sdks/reference/react-native.md) | Full SDK documentation for React Native, consult for details beyond the inline examples. |
| [React Native SDK API Reference](https://powersync-ja.github.io/powersync-js/react-native-sdk) | Full API reference for `@powersync/react-native`, consult only when the inline examples don't cover your case. |
| [Capacitor Reference](https://docs.powersync.com/client-sdks/reference/capacitor.md) | Full SDK documentation for Capacitor, consult for details beyond the inline examples. |
| [Capacitor SDK API Reference](https://powersync-ja.github.io/powersync-js/capacitor-sdk) | Full API reference for `@powersync/capacitor`, consult only when the inline examples don't cover your case. |
| [Node.js Reference](https://docs.powersync.com/client-sdks/reference/node.md) | Full SDK documentation for Node.js, consult for details beyond the inline examples. |
| [Node.js SDK API Reference](https://powersync-ja.github.io/powersync-js/node-sdk) | Full API reference for `@powersync/node`, consult only when the inline examples don't cover your case. |
| [Supported Platforms - JS SDK](https://docs.powersync.com/resources/supported-platform.md#javascript-web-sdk) | Supported platforms and features, consult for compatibility details. |

Framework-specific files (load alongside this file):

| File | Use when... |
|------|-------------|
| `references/sdks/powersync-js-react.md` | React web app or Next.js |
| `references/sdks/powersync-js-react-native.md` | React Native, Expo, or Expo Go |
| `references/sdks/powersync-js-vue.md` | Vue or Nuxt |
| `references/sdks/powersync-js-node.md` | Node.js CLI/server or Electron |
| `references/sdks/powersync-js-tanstack.md` | TanStack Query or TanStack DB (any framework) |

## Package Coverage

| Need | Package |
|------|---------|
| Web browser | `@powersync/web` |
| React Native | `@powersync/react-native` |
| Node.js/CLI | `@powersync/node` |
| Capacitor | `@powersync/capacitor` |
| React hooks | `@powersync/react` |
| Vue composables | `@powersync/vue` |
| Nuxt module | `@powersync/nuxt` |
| TanStack Query (React) | `@powersync/tanstack-react-query` |
| TanStack DB (multi-framework) | `@tanstack/powersync-db-collection` |
| ORM | `@powersync/drizzle-driver` or `@powersync/kysely-driver` |

## Quick Setup

### 1. Install

```bash
# Web
npm install @powersync/web
npm install @journeyapps/wa-sqlite # Needed (peer-dependency)

# React Native
npm install @powersync/react-native
npm install @powersync/powersync-op-sqlite  # Needed (peer-dependency)

# Node.js
npm install @powersync/node
npm install better-sqlite3 # Needed (peer-dependency)

# React integration
npm install @powersync/react

# Vue
npm install @powersync/vue

# Nuxt (includes @powersync/vue — npm v7+ installs peers automatically)
npm install @powersync/nuxt

# TanStack Query (React)
npm install @powersync/tanstack-react-query

# TanStack DB
npm install @tanstack/powersync-db-collection
```

Always install packages by running these commands rather than writing versions into `package.json` manually. Using `"latest"` as a version string in `package.json` is incorrect — it bypasses the lockfile and can pull in breaking changes at any install.

See the framework-specific files for full setup instructions per target.

### 2. Define Schema

```ts
import { column, Schema, Table } from '@powersync/web'; // or @powersync/react-native / @powersync/common

const todos = new Table(
  {
    // Do NOT define 'id' — PowerSync creates it automatically as TEXT PRIMARY KEY
    list_id: column.text,
    created_at: column.text,   // Store dates as ISO strings — no date type
    description: column.text,
    completed: column.integer, // Store booleans as 0/1 — no boolean type
  },
  {
    indexes: { list: ['list_id'] }, // Optional SQLite index
  }
);

export const AppSchema = new Schema({ todos, lists });
export type Database = (typeof AppSchema)['types'];
export type Todo = Database['todos']; // Auto-generated row type
```

Column types: only `column.text`, `column.integer`, `column.real`. No boolean, no date, no JSON native type — store those as text/integer.

No migrations — schema changes apply automatically on next open. Removed columns become inaccessible (data still in DB). New columns start null. Renaming = adding new + removing old (data loss). See [Define the Client-Side Schema](https://docs.powersync.com/client-sdks/reference/javascript-web.md#1-define-the-client-side-schema) for more information.

### Special Table Types

See [Local-Only Tables](https://docs.powersync.com/usage/use-case-examples/local-only-tables.md) and [Insert-Only Tables](https://docs.powersync.com/usage/use-case-examples/insert-only-tables.md) for more information.

```ts
// Local-only — not synced from server, not uploaded, persists across restarts
const drafts = new Table({ title: column.text }, { localOnly: true });

// Insert-only — writes are uploaded but server never sends deletes
const logs = new Table({ message: column.text }, { insertOnly: true });

// Track previous values — available as op.previousValues in uploadData
const todos = new Table(
  { description: column.text, completed: column.integer },
  {
    trackPreviousValues: true,
    // or: trackPreviousValues: { columns: ['completed'] }
    // or: trackPreviousValues: { columns: ['completed'], onlyWhenChanged: true }
  }
);

// Track metadata attached to individual writes
const tasks = new Table(
  { title: column.text },
  { trackMetadata: true }  // Adds _metadata column, available as op.metadata in uploadData
);
```

### 3. Create Backend Connector

See [Integrate with your Backend](https://docs.powersync.com/client-sdks/reference/javascript-web.md#3-integrate-with-your-backend) and [Client-Side Integration](https://docs.powersync.com/configuration/app-backend/client-side-integration.md) for more information.

**IMPORTANT:** `PowerSyncBackendConnector`, `PowerSyncCredentials`, and `AbstractPowerSyncDatabase` are **type-only exports**. Always use `import type` for these — importing them as values (without `type`) causes runtime errors in bundlers like Vite. Only `UpdateType` is a runtime value (enum) and uses a regular import.

```ts
import type { PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/web'
async fetchCredentials(): Promise<PowerSyncCredentials> {
  return {
    endpoint: 'https://your-instance.powersync.journeyapps.com',
    token: await getJwtFromAuthService(),
    expiresAt: new Date(Date.now() + 3600_000), // optional hint for refresh timing
  };
}
```

`fetchCredentials` is called automatically every few minutes when the sync stream reconnects. Must always return fresh credentials — do not return stale cached tokens.

`PowerSyncCredentials` interface: `{ endpoint: string; token: string; expiresAt?: Date }`. See [Authentication Setup](https://docs.powersync.com/configuration/auth/overview.md) for configuring JWT authentication.

### uploadData

Called automatically whenever local writes are pending. Must be synchronous with the actual backend write — do not queue operations for async processing elsewhere. If it throws, PowerSync backs off and retries automatically. See [Writing Client-Side Changes to your Backend](https://docs.powersync.com/usage/writing-client-side-changes-to-your-backend.md) for more information.

```ts
import { UpdateType } from '@powersync/web'
import type { AbstractPowerSyncDatabase, PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/web'

async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
  const transaction = await database.getNextCrudTransaction();
  if (!transaction) return;

  try {
    for (const op of transaction.crud) {
      switch (op.op) {
        case UpdateType.PUT:
          await api.create(op.table, { id: op.id, ...op.opData });
          break;
        case UpdateType.PATCH:
          await api.update(op.table, op.id, op.opData);
          break;
        case UpdateType.DELETE:
          await api.delete(op.table, op.id);
          break;
      }
    }
    // MUST call complete() to advance the queue to the next transaction
    await transaction.complete();
  } catch (ex) {
    // Throw to retry later — PowerSync will back off and retry
    throw ex;
  }
}
```

If `transaction.complete()` is never called, `getNextCrudTransaction()` returns the same transaction forever — the upload queue stalls permanently.

Note: When uploading to backends with native boolean columns (e.g. PostgreSQL via Supabase or MongoDB), op.opData will contain 0/1. Convert before writing.

#### HTTP Status Code Handling

- Return 2xx from backend even for validation errors — a 4xx blocks the upload queue permanently
- 5xx → PowerSync retries automatically with backoff
- Surface validation errors by writing them to a local-only table and showing in the UI — never let them block the queue

#### getCrudBatch vs getNextCrudTransaction

Two ways to consume the upload queue:

```ts
// getNextCrudTransaction — exactly one transaction's worth, all entries share transactionId
const tx = await db.getNextCrudTransaction();
if (tx) {
  for (const op of tx.crud) { /* op.transactionId is the same for all */ }
  await tx.complete();
}

// getCrudBatch — up to N entries, may span multiple transactions
const batch = await db.getCrudBatch(100);
if (batch) {
  for (const op of batch.crud) { /* may have different transactionIds */ }
  await batch.complete();
  // batch.haveMore === true means there are more entries waiting
}
```

`getNextCrudTransaction` is used in most connector examples — simpler, guarantees atomicity per write transaction. `getCrudBatch` is useful when you want to batch across transaction boundaries for backend throughput.

#### CrudEntry Fields

```ts
interface CrudEntry {
  clientId: number;                     // Auto-incrementing local ID
  id: string;                           // Row ID
  op: UpdateType;                       // PUT | PATCH | DELETE
  opData?: Record<string, any>;         // Changed columns — undefined for DELETE
  previousValues?: Record<string, any>; // Previous values — requires trackPreviousValues on table
  table: string;                        // Table name
  transactionId?: number;               // Groups ops from the same writeTransaction()
  metadata?: string;                    // Custom metadata — requires trackMetadata on table
}
```

Op types (`UpdateType` enum):
- `PUT` — full insert or replace (new row, or complete overwrite)
- `PATCH` — partial update (`opData` contains only the changed columns)
- `DELETE` — deletion (`opData` is undefined)

`previousValues` is populated for PATCH and DELETE ops when the table has `trackPreviousValues: true`. Useful for implementing last-write-wins conflict resolution on the backend.

### 4. Initialize Database and Connect

See [Instantiate the PowerSync Database](https://docs.powersync.com/client-sdks/reference/javascript-web.md#2-instantiate-the-powersync-database) for more information.

```ts
// 1. Instantiate — schema applied at construction, no migrations
const db = new PowerSyncDatabase({ schema, database: { dbFilename: 'app.db' } });

// 2. Connect — starts sync stream and uploadData loop in background
db.connect(connector);

// 3. Optionally wait for first sync before rendering data
await db.waitForFirstSync();
```

`connect()` does not block — sync happens in the background. Do NOT `await connect()` thinking data is ready after it returns.

### 5. Provider / Plugin Setup

Framework-specific setup (React `PowerSyncContext.Provider`, Vue plugin, Nuxt plugin) is covered in the framework files. See `references/sdks/powersync-js-react.md`, `references/sdks/powersync-js-vue.md`, etc.

### Web-Specific Options

```ts
const db = new PowerSyncDatabase({
  schema,
  database: {
    dbFilename: 'app.db',
    debugMode: true        // Logs all SQL to Chrome DevTools Performance timeline
  },
  flags: {
    useWebWorker: true,    // Default true — runs DB in a web worker
    enableMultiTabs: true  // Default true — shares sync worker across tabs
  }
});
```

Multi-tab behavior: By default the web SDK uses a shared sync worker so all tabs share sync state. Only the most recently opened tab runs `fetchCredentials` and `uploadData`. Disable with `enableMultiTabs: false` if causing issues — but then only the oldest tab syncs.

#### VFS Options

| VFS Option                | Description         | Reference URL                                                                                           |
|---------------------------|---------------------|---------------------------------------------------------------------------------------------------------|
| IDBBatchAtomicVFS         | Default             | [Link](https://docs.powersync.com/client-sdks/reference/javascript-web.md#1-idbbatchatomicvfs-default)     |
| OPFSCoopSyncVFS           | Recommended         | [Link](https://docs.powersync.com/client-sdks/reference/javascript-web.md#2-opfs-based-alternatives)       |

```ts
// Recommended — more reliable across browsers including Safari
import { WASQLiteOpenFactory, WASQLiteVFS } from '@powersync/web'

const db = new PowerSyncDatabase({
  schema,
  database: new WASQLiteOpenFactory({
    dbFilename: 'app.db',
    vfs: WASQLiteVFS.OPFSCoopSyncVFS, // default: IDBBatchAtomicVFS
  }),
})
```

Safari: Requires `OPFSCoopSyncVFS` for stable multi-tab, or set `useWebWorker: false`. See [Web SDK Reference](https://docs.powersync.com/client-sdks/reference/javascript-web.md) for full configuration options.

## Query Patterns

See [Using PowerSync: CRUD functions](https://docs.powersync.com/client-sdks/reference/javascript-web.md#using-powersync-crud-functions) for the full API reference.

### useQuery

```ts
useQuery<RowType>(
  query: string | CompilableQuery<RowType>,
  parameters?: any[],
  options?: {
    rowComparator?: { keyBy, compareBy },
    reportFetching?: boolean,
    throttleMs?: number,
    runQueryOnce?: boolean,
    streams?: QuerySyncStreamOptions[],
  }
): { data, isLoading, isFetching, error }
```

Parameters are compared by `JSON.stringify` value, not by reference — so `[userId]` across renders are considered equal even as different array instances.

Pitfall: Avoid passing objects that serialize differently between renders (e.g. objects with changing key order).

#### rowComparator — Differential Mode

Without `rowComparator`: every change to any watched table re-runs the query and returns a new array reference — all children re-render regardless of whether their row changed.

With `rowComparator`: uses differential watch internally. Only rows that actually changed get new object references. Unchanged rows keep the same object reference, so `React.memo` can skip re-rendering them.

```tsx
const { data: lists } = useQuery('SELECT * FROM lists', [], {
  rowComparator: {
    keyBy: (row) => row.id,
    compareBy: (row) => JSON.stringify(row)
  }
});

const ListItem = React.memo(({ list }) => <Text>{list.name}</Text>);
// Only re-renders when list.name or other fields actually change
```

#### runQueryOnce

Runs the query once after sync completes — no live watch. Useful for aggregations or reports.

```ts
const { data } = useQuery('SELECT COUNT(*) as total FROM lists', [], { runQueryOnce: true });
```

#### streams option

Gates the query on specific named sync streams having synced before executing.

```ts
const { data } = useQuery('SELECT * FROM lists', [], {
  streams: [{ name: 'lists', parameters: { userId }, waitForStream: true }]
});
// Returns isLoading: true until the 'lists' stream has synced
```

### Compiling Queries (CompilableQuery)

Both hooks accept a `CompilableQuery` object in addition to a plain SQL string. This is useful when using [Drizzle](https://docs.powersync.com/client-sdks/orms/javascript-web/drizzle.md) or [Kysely](https://docs.powersync.com/client-sdks/orms/javascript-web/kysely.md) integrations:

```ts
// With Drizzle
const query = db.select().from(lists).where(eq(lists.ownerId, userId));
const { data } = useQuery(query);

// With Kysely
const query = db.selectFrom('lists').selectAll().where('owner_id', '=', userId);
const { data } = useQuery(query);
```

### One-Time Queries (Imperative)

```ts
// Get all
const todos = await db.getAll('SELECT * FROM todos WHERE list_id = ?', [listId]);

// Get one (throws if not found)
const todo = await db.get('SELECT * FROM todos WHERE id = ?', [id]);

// Get optional (returns null if not found)
const todo = await db.getOptional('SELECT * FROM todos WHERE id = ?', [id]);
```

### Watch Queries (Imperative)

Outside of React, use the async generator API directly:

```ts
for await (const result of db.watchWithAsyncGenerator('SELECT * FROM lists')) {
  console.log(result.rows._array);
}

// Or with a differential watch (only emits on actual changes)
const watchedQuery = db.customQuery({
  compile: () => ({ sql: 'SELECT * FROM lists', parameters: [] }),
  execute: () => db.getAll('SELECT * FROM lists')
}).watch({ reportFetching: true });

const dispose = watchedQuery.registerListener({
  onData: (data) => console.log(data),
  onError: (err) => console.error(err)
});

// Later:
dispose();
```

## Writes & Transactions

### Single Operation

```ts
await db.execute(
  'INSERT INTO lists (id, created_at, name, owner_id) VALUES (uuid(), datetime(), ?, ?)',
  ['My List', userId]
);
```

### writeTransaction — Multiple Related Operations

Use when multiple operations must be atomic. Auto-commits on success, auto-rollbacks if an exception is thrown.

```ts
await db.writeTransaction(async (tx) => {
  await tx.execute('DELETE FROM lists WHERE id = ?', [listId]);
  await tx.execute('DELETE FROM todos WHERE list_id = ?', [listId]);
  // No need to call commit() — it's automatic
});
```

When to use `writeTransaction`:
- Multiple operations that must succeed or fail together
- Cascading deletes, multi-table updates
- Any situation where partial completion would leave data inconsistent

When NOT to use:
- Single operations — `db.execute()` is simpler and faster
- Read-only queries — use `readTransaction` or `getAll`/`get`

### readTransaction

```ts
const result = await db.readTransaction(async (tx) => {
  const lists = await tx.getAll('SELECT * FROM lists');
  const count = await tx.get('SELECT COUNT(*) as n FROM todos');
  return { lists, count };
});
```

### ID Generation

PowerSync auto-creates an `id TEXT` column on every table — do not declare it in the schema. Generate UUIDs client-side:

```ts
// SQLite uuid() function is available
await db.execute('INSERT INTO todos (id, description) VALUES (uuid(), ?)', ['Buy milk']);

// Or generate in JS
import { v4 as uuidv4 } from 'uuid';
await db.execute('INSERT INTO todos (id, description) VALUES (?, ?)', [uuidv4(), 'Buy milk']);
```

### Lock Behavior

- Only ONE write transaction executes at a time (global write mutex)
- Default lock timeout: 120 seconds — increase only if operations genuinely take longer
- `writeTransaction()` takes the lock for the entire callback duration
- Multiple rapid writes are more efficient when batched inside a single `writeTransaction`

## Sync Status, Priorities & Sync Streams

### useStatus Hook

```ts
const status = useStatus();
// {
//   connected: boolean,
//   connecting: boolean,
//   lastSyncedAt: Date | null,
//   hasSynced: boolean,          // true after first full sync, persists across restarts
//   isSyncing: boolean,
//   downloadProgress: DownloadProgress | null,
//   dataFlowStatus: {
//     uploading: boolean,
//     downloading: boolean,
//     uploadError: Error | undefined,    // set on upload failure, cleared on next success
//     downloadError: Error | undefined,  // set on download/connect failure, cleared on next success
//     downloadProgress: ...
//   }
// }
```

#### uploadError and downloadError

`status.dataFlowStatus.uploadError` and `status.dataFlowStatus.downloadError` are the primary way to surface sync failures to users or logging systems.

- `uploadError` — set when an exception occurs during the CRUD upload loop. Cleared automatically on the next successful upload.
- `downloadError` — set when an exception occurs during the streaming sync (including connection failures). Cleared on the next successful data download or checkpoint completion.

```tsx
const status = useStatus();

if (status.dataFlowStatus?.uploadError) {
  return <Banner>Failed to save changes: {status.dataFlowStatus.uploadError.message}</Banner>;
}
if (status.dataFlowStatus?.downloadError) {
  return <Banner>Sync error: {status.dataFlowStatus.downloadError.message}</Banner>;
}
```

Register a status listener imperatively (useful for logging, not just UI):

```ts
db.registerListener({
  statusChanged: (status) => {
    if (status.dataFlowStatus?.downloadError) {
      logger.error('PowerSync download failed', {
        error: status.dataFlowStatus.downloadError,
        lastSyncedAt: status.lastSyncedAt,
        connected: status.connected,
      });
    }
    if (status.dataFlowStatus?.uploadError) {
      logger.error('PowerSync upload failed', {
        error: status.dataFlowStatus.uploadError,
        lastSyncedAt: status.lastSyncedAt,
        connected: status.connected,
      });
    }
  }
});
```

### waitForFirstSync

`db.waitForFirstSync()` resolves when all data has been downloaded at least once. After that, `db.currentStatus.hasSynced` is `true` and persists across app restarts (stored in the local DB).

```ts
// Standard usage — gate app rendering behind first sync
db.connect(connector);
await db.waitForFirstSync();
// Now safe to render data-dependent screens

// With abort signal (e.g. timeout after 10s)
const controller = new AbortController();
setTimeout(() => controller.abort(), 10_000);
await db.waitForFirstSync(controller.signal);
```

### Sync Priorities

Streams (or buckets in legacy Sync Rules) can be assigned priorities (0-3). Lower numbers = higher priority. Higher-priority data syncs first, allowing partial data to appear before the full sync completes. See [Prioritized Sync](https://docs.powersync.com/usage/use-case-examples/prioritized-sync.md) for more information.

Priority 0 is special: it syncs regardless of pending uploads — use carefully as it can cause temporary inconsistencies.

Consistency caveat: Full PowerSync consistency guarantees (including deletes) only apply once ALL buckets at all priorities have synced. Higher-priority partial syncs may have stale deletes until lower-priority buckets complete.

#### waitForFirstSync with Priority

```ts
// Wait only for priority-1 buckets (faster — show UI sooner)
await db.waitForFirstSync({ priority: 1 });

// With abort signal + priority
const controller = new AbortController();
setTimeout(() => controller.abort(), 10_000);
await db.waitForFirstSync({ signal: controller.signal, priority: 1 });
```

#### Download Progress UI

```tsx
const status = useStatus();
const progress = status.downloadProgress;

// Overall progress
if (progress) {
  return <ProgressBar value={progress.downloadedFraction} />;
  // progress.downloadedOperations / progress.totalOperations also available
}

// Progress up to a specific priority only
const priorityProgress = progress?.untilPriority(1);
if (priorityProgress) {
  return <ProgressBar value={priorityProgress.downloadedFraction} />;
}
```

#### Per-Priority Status

```ts
// Check if a specific priority has synced
const p1Status = db.currentStatus.statusForPriority(1);
// p1Status.hasSynced, p1Status.lastSyncedAt

// List all priority statuses seen
const entries = db.currentStatus.priorityStatusEntries();
// [{ priority: 1, hasSynced: true, lastSyncedAt: Date }, ...]
```

### Sync Streams

Sync Streams are the recommended way to define what data syncs to each client. They provide on-demand subscriptions with parameters and TTL-based expiry. See [sync-config.md](references/sync-config.md) for server-side configuration (YAML definitions, parameters, CTEs).

Requires the service to be configured with Sync Streams (edition 3 config). See [Sync Streams Overview](https://docs.powersync.com/sync/streams/overview.md) and [Client-Side Usage](https://docs.powersync.com/sync/streams/client-usage.md) for more information.

The `streams` option in `useQuery` (see below) and the imperative API work across all JS/TS frameworks. Framework-specific Sync Stream hooks are covered in the respective framework files where available — for example, `useSyncStream` and `useSuspenseSyncStream` in `references/sdks/powersync-js-react.md`.

#### Streams in useQuery

Gate a query on a specific stream having synced, without managing the subscription manually:

```ts
const { data: lists } = useQuery('SELECT * FROM lists', [], {
  streams: [
    {
      name: 'lists',
      parameters: { userId },
      waitForStream: true,  // hold isLoading: true until this stream syncs
      priority: 1,
      ttl: 3600,
    }
  ]
});
```

#### Imperative API

```ts
// Subscribe directly
const subscription = await db.syncStream('lists', { userId }).subscribe({
  priority: 1,
  ttl: 3600
});

// Wait for this specific stream to sync
await subscription.waitForFirstSync();

// Check status
const streamStatus = db.currentStatus.forStream(subscription);
console.log(streamStatus.subscription.hasSynced);

// Unsubscribe when done
subscription.unsubscribe();
```

#### Stream Gotchas

- Parameters as identity: same stream name with different parameters = separate subscriptions
- Partial checkpoints: only the Rust sync client supports partial checkpoints (priority-level consistency)
- Default streams: server may configure streams as default — these subscribe automatically without a client call
- TTL eviction: after TTL expires with no active subscriber, the stream's data may be removed from the local DB

## Raw Tables

Raw tables let PowerSync sync data directly into native SQLite tables you define, instead of storing data as JSON in `ps_data__<table>` and exposing it via views. This gives full SQLite control and better query performance. See [Raw Tables](https://docs.powersync.com/usage/use-case-examples/raw-tables.md) for more information.

Requires: The Rust sync client (now the default). Will not work with the legacy JavaScript client.

Status: Experimental — not covered by semver stability guarantees.

### When to Use Raw Tables

- Complex queries that benefit from native column types (e.g. `SUM`, `GROUP BY` on typed columns)
- Tables with many rows where JSON extraction overhead is significant
- Need for SQLite constraints (foreign keys, `NOT NULL`, `GENERATED` columns)
- Custom indexes on expressions or generated columns

### Defining a Raw Table

```ts
import { Schema, RawTable } from '@powersync/common';

const schema = new Schema({
  // Regular PowerSync-managed tables here
});

schema.withRawTables({
  // The key name ('todo_lists') matches the table name in the backend database
  // as sent by the PowerSync service — NOT necessarily the local SQLite table name
  todo_lists: {
    put: {
      sql: 'INSERT OR REPLACE INTO todo_lists (id, created_by, title, content) VALUES (?, ?, ?, ?)',
      params: ['Id', { Column: 'created_by' }, { Column: 'title' }, { Column: 'content' }]
    },
    delete: {
      sql: 'DELETE FROM todo_lists WHERE id = ?',
      params: ['Id']
    }
  }
});
```

Parameter types:
- `'Id'` — replaced with the object ID from the sync service
- `{ Column: 'fieldName' }` — replaced with the value of that column from the synced row data
- For `delete` statements, only `'Id'` is supported

You must also create the actual SQLite table separately (e.g. in app init):

```ts
await db.execute(`
  CREATE TABLE IF NOT EXISTS todo_lists (
    id TEXT NOT NULL PRIMARY KEY,
    created_by TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT
  ) STRICT
`);
```

### Triggers for Local Writes

Raw tables require manual triggers to capture local writes into PowerSync's upload queue (`powersync_crud` virtual table):

```sql
CREATE TRIGGER todo_lists_insert
  AFTER INSERT ON todo_lists FOR EACH ROW
  BEGIN
    INSERT INTO powersync_crud (op, id, type, data)
    VALUES ('PUT', NEW.id, 'todo_lists', json_object(
      'created_by', NEW.created_by,
      'title', NEW.title,
      'content', NEW.content
    ));
  END;

CREATE TRIGGER todo_lists_update
  AFTER UPDATE ON todo_lists FOR EACH ROW
  BEGIN
    SELECT CASE
      WHEN (OLD.id != NEW.id) THEN RAISE(FAIL, 'Cannot update id')
    END;
    INSERT INTO powersync_crud (op, id, type, data)
    VALUES ('PATCH', NEW.id, 'todo_lists', json_object(
      'created_by', NEW.created_by,
      'title', NEW.title,
      'content', NEW.content
    ));
  END;

CREATE TRIGGER todo_lists_delete
  AFTER DELETE ON todo_lists FOR EACH ROW
  BEGIN
    INSERT INTO powersync_crud (op, id, type)
    VALUES ('DELETE', OLD.id, 'todo_lists');
  END;
```

The `powersync_crud` virtual table fields:
- `op` — `'PUT'`, `'PATCH'`, or `'DELETE'`
- `id` — row ID
- `type` — table name (as the backend knows it)
- `data` — JSON object of column values (omit for DELETE)
- `old_values` — optional previous values for conflict resolution
- `metadata` — optional metadata string

### Migrating from ps_untyped

If PowerSync has already synced data for a table before you added it as a raw table, it's stored in `ps_untyped`. After creating the raw table and defining it in the schema, run:

```sql
INSERT INTO my_table (id, col1, col2)
  SELECT id, data ->> 'col1', data ->> 'col2'
  FROM ps_untyped WHERE type = 'my_table';
DELETE FROM ps_untyped WHERE type = 'my_table';
```

Not needed if the raw table definition was present from the very first `connect()` call.

### Raw Table Caveats

- Rust client only — the JavaScript sync client logs a warning and ignores raw tables
- No automatic column migration — adding columns requires deleting all data and resyncing, or a manual workaround
- Foreign keys — must use `DEFERRABLE INITIALLY DEFERRED`; enable with `PRAGMA foreign_keys = ON`; avoid FK references from high-priority to lower-priority raw tables (priorities sync in separate transactions)
- `disconnectAndClear()` won't clear raw tables by default — add a `clear` statement to `RawTable` if needed
- The `name` property matches the backend table name, not the local SQLite table name — `put`/`delete` can target any local table

## Drizzle ORM Integration

See [Drizzle ORM Setup](https://docs.powersync.com/client-sdks/orms/javascript-web/drizzle.md) for full setup instructions.

```ts
import { drizzle } from '@powersync/drizzle-driver';
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { eq } from 'drizzle-orm';

// Define Drizzle schema
export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  description: text('description').notNull(),
  completed: integer('completed').notNull().default(0),
  listId: text('list_id')
});

// Create Drizzle instance
const drizzleDb = drizzle(db);

// Type-safe queries
const activeTodos = await drizzleDb
  .select()
  .from(todos)
  .where(eq(todos.completed, 0));
```

## Debugging

See [Debugging Overview](https://docs.powersync.com/debugging/tools-and-techniques.md) for the full list of tools and techniques.

### Diagnostics App

https://diagnostics-app.powersync.com

Connect this to a running PowerSync instance to inspect tables, rows, sync buckets, and run arbitrary SQL against the local database. This is the fastest way to isolate whether a problem is in the PowerSync service or in the client:

- If the diagnostics app shows the correct data → the service is syncing correctly → the issue is in your client code (query, schema, rendering)
- If the diagnostics app shows incorrect or missing data → the issue is in the PowerSync service configuration (sync rules, backend connector, permissions)

### Enable SDK Logging (Development)

```ts
import { createBaseLogger, LogLevel } from '@powersync/react'; // or @powersync/common

const logger = createBaseLogger();
logger.useDefaults(); // output to console
logger.setLevel(LogLevel.DEBUG); // DEBUG | INFO | WARN | ERROR | TRACE | OFF
```

### Production Logging

Enable PowerSync logging in production — it is extremely helpful for debugging sync issues reported by users. Use whatever logging provider your app already uses (Sentry, Datadog, Firebase Crashlytics, etc.).

The key pattern is: use `WARN` level in production (captures errors and warnings without noise), and pipe warnings/errors to your log aggregation service. Capture all levels as breadcrumbs so you have context leading up to an error.

Example using Sentry (substitute your own provider):

```ts
import { createBaseLogger, LogLevel } from '@powersync/react-native';

const logger = createBaseLogger();
logger.useDefaults();
logger.setLevel(LogLevel.WARN); // WARN and above in production

logger.setHandler((messages, context) => {
  if (!context?.level) return;

  const messageArray = Array.from(messages);
  const mainMessage = String(messageArray[0] || '');
  const extra = messageArray.slice(1).reduce((acc, curr) => ({ ...acc, ...curr }), {});
  const level = context.level.name.toLowerCase();

  // Capture everything as breadcrumbs for pre-error context
  Sentry.addBreadcrumb({
    message: mainMessage,
    level: level as Sentry.SeverityLevel,
    data: extra,
    timestamp: Date.now()
  });

  // Only send warn/error to the logging service
  if (level === 'warn' || level === 'error') {
    Sentry.logger[level](mainMessage, extra);
  }
});
```

Also register a status listener to capture `uploadError` and `downloadError` — these won't appear in the SDK logger automatically:

```ts
db.registerListener({
  statusChanged: (status) => {
    if (status.dataFlowStatus?.downloadError) {
      logger.error('PowerSync download error', {
        error: status.dataFlowStatus.downloadError,
        lastSyncedAt: status.lastSyncedAt,
        connected: status.connected,
        sdkVersion: db.sdkVersion,
      });
    }
    if (status.dataFlowStatus?.uploadError) {
      logger.error('PowerSync upload error', {
        error: status.dataFlowStatus.uploadError,
        lastSyncedAt: status.lastSyncedAt,
        connected: status.connected,
        sdkVersion: db.sdkVersion,
      });
    }
  }
});
```

Context to include in logs: user/session ID, SDK version (`db.sdkVersion`), `lastSyncedAt`, `connected` status. Avoid logging sensitive row data.

### Web: SQL Logging to Chrome Performance Timeline

```ts
const db = new PowerSyncDatabase({
  schema,
  database: { dbFilename: 'app.db', debugMode: true }
});
// All SQL appears in Chrome DevTools → Performance tab timeline
```

### Check Sync Status Imperatively

```ts
console.log(db.currentStatus);
// { connected, connecting, lastSyncedAt, hasSynced, isSyncing, downloadProgress }
```

## Internals

> Load this section only when debugging QueryStore eviction behaviour, investigating sync client implementation differences, or working with internal op types. Not needed for typical integration, setup, or feature work.

### Sync Client Implementations

The Rust-based sync client is now the default:

```ts
// Default — Rust client (no config needed)
const db = new PowerSyncDatabase({ schema, database: { dbFilename: 'app.db' } });

// Explicit (not needed unless reverting to legacy)
import { SyncClientImplementation } from '@powersync/common';
const db = new PowerSyncDatabase({
  schema,
  database: { dbFilename: 'app.db' },
  sync: { implementation: SyncClientImplementation.RUST } // now default
});
```

The Rust client:
- More performant — offloads sync line decoding to native extension
- Required for raw tables and partial checkpoints by priority
- Stores sync data in a slightly different format than the old JS client
- Auto-migrates from JS format on first use

Do not downgrade the SDK after using the Rust client — older SDK versions using the JS client can't read the Rust format.

The legacy JS client (`SyncClientImplementation.JAVASCRIPT`) is deprecated and will be removed in a future version.

### QueryStore

`useSuspenseQuery` uses a `QueryStore` (one per `PowerSyncDatabase` instance, stored in a `WeakMap`). The store caches `WatchedQuery` instances keyed by:

```
"${sql} -- ${JSON.stringify(params)} -- ${JSON.stringify(options)}"
```

A query is evicted (closed) when the count of `ON_DATA + ON_STATE_CHANGE + ON_ERROR` listeners reaches 0.

Implication: `useSuspenseQuery` and `useQuery` with the same SQL/params/options share the same underlying `WatchedQuery`. If one component unmounts but another with the same query is still mounted, the query stays alive and is not re-fetched.

### Op Types (Internal Sync vs CRUD)

Internal bucket ops (`OpTypeEnum`) — used inside sync protocol, not exposed to userland:
- `CLEAR=1`, `MOVE=2`, `PUT=3`, `REMOVE=4`

CRUD upload ops (`UpdateType`) — what you see in `uploadData`:
- `PUT`, `PATCH`, `DELETE`

These are separate enumerations. Don't confuse the sync-level `REMOVE` with the CRUD-level `DELETE`.

## Common Pitfalls

See also [Error Codes Reference](https://docs.powersync.com/debugging/error-codes.md#error-codes-reference) for PowerSync service error codes.

### 1. All children re-render on every table change

Without `rowComparator`, every write to a watched table returns a new array — all children re-render even if their row didn't change.

```ts
// BAD — all ListItem components re-render on any lists write
const { data: lists } = useQuery('SELECT * FROM lists');
return lists.map(l => <ListItem list={l} />);

// GOOD — only changed rows get new references, React.memo skips the rest
const { data: lists } = useQuery('SELECT * FROM lists', [], {
  rowComparator: { keyBy: r => r.id, compareBy: r => JSON.stringify(r) }
});
const ListItem = React.memo(({ list }) => <Text>{list.name}</Text>);
```

### 2. Awaiting connect() thinking data is ready

```ts
// WRONG — connect() is fire-and-forget, data is NOT available after await
await db.connect(connector);
renderApp(); // may show empty data

// CORRECT
db.connect(connector);
await db.waitForFirstSync(); // wait for data
renderApp();
```

### 3. Schema ID column

```ts
// WRONG
const todos = new Table({ id: column.text, description: column.text });

// RIGHT — 'id' is auto-created by PowerSync
const todos = new Table({ description: column.text });
```

### 4. uploadData queue stuck

If `transaction.complete()` is never called, `getNextCrudTransaction()` returns the same transaction forever. The upload queue stalls permanently. Always call `complete()`, even on partial failure if you want to skip a bad transaction.

### 5. Web: SQLite library conflicts

If another SQLite package exists in the project (`sql.js`, `better-sqlite3`, etc.), it can conflict with PowerSync's SQLite engine. Remove all other SQLite libraries. Symptom: "Could not load extension" error.

### 6. useQuery data seems stale / not updating

- Verify the table name in SQL exactly matches the schema key (case-sensitive)
- Writes must go through `db.execute()` or `writeTransaction()` — writes via raw SQLite connections bypass PowerSync's change tracking
- Check `db.currentStatus.connected` — if false, sync isn't running
