# PowerSync JavaScript/TypeScript SDK

Best practices and guidance for building apps with the PowerSync JavaScript/TypeScript SDK. Use this reference when setting up PowerSync in a JS/TS project, selecting the right package for a target platform (web, React Native, Node.js, Capacitor, Vue), configuring the client, defining schemas, writing queries, or handling sync lifecycle events.

## Package Coverage

| Need | Package |
|------|---------|
| Web browser | `@powersync/web` |
| React Native | `@powersync/react-native` |
| Node.js/CLI | `@powersync/node` |
| Capacitor | `@powersync/capacitor` |
| React hooks | `@powersync/react` |
| Vue composables | `@powersync/vue` |
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
```

### 2. Define Schema

```typescript
// schema.ts
import { Schema, Table, Column, ColumnType } from '@powersync/web';

export const schema = new Schema([
  new Table({
    name: 'todos',
    columns: [
      new Column({ name: 'description', type: ColumnType.TEXT }),
      new Column({ name: 'completed', type: ColumnType.INTEGER }),
      new Column({ name: 'created_at', type: ColumnType.TEXT }),
      new Column({ name: 'list_id', type: ColumnType.TEXT })
    ]
  }),
  new Table({
    name: 'lists',
    columns: [
      new Column({ name: 'name', type: ColumnType.TEXT }),
      new Column({ name: 'owner_id', type: ColumnType.TEXT })
    ]
  })
]);
```

### 3. Create Backend Connector

```typescript
// connector.ts
import { AbstractPowerSyncDatabase, PowerSyncBackendConnector } from '@powersync/web';

export class MyConnector implements PowerSyncBackendConnector {
  async fetchCredentials() {
    const response = await fetch('/api/powersync-token');
    const { token, expiresAt } = await response.json();

    return {
      endpoint: process.env.POWERSYNC_URL!,
      token,
      expiresAt: new Date(expiresAt)
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch();
    if (!batch) return;

    for (const op of batch.crud) {
      const { table, opData, id } = op;

      switch (op.op) {
        case 'PUT':
          await fetch(`/api/${table}`, {
            method: 'POST',
            body: JSON.stringify({ id, ...opData })
          });
          break;
        case 'PATCH':
          await fetch(`/api/${table}/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(opData)
          });
          break;
        case 'DELETE':
          await fetch(`/api/${table}/${id}`, { method: 'DELETE' });
          break;
      }
    }

    await batch.complete();
  }
}
```

### 4. Initialize Database

```typescript
// db.ts
import { PowerSyncDatabase } from '@powersync/web';
import { schema } from './schema';
import { MyConnector } from './connector';

export const db = new PowerSyncDatabase({
  schema,
  database: { dbFilename: 'app.db' }
});

export async function initPowerSync() {
  await db.connect(new MyConnector());
}
```

### 5. PowerSync 

## Query Patterns

### One-Time Queries

```typescript
// Get all
const todos = await db.getAll('SELECT * FROM todos WHERE list_id = ?', [listId]);

// Get one (throws if not found)
const todo = await db.get('SELECT * FROM todos WHERE id = ?', [id]);

// Get optional (returns null if not found)
const todo = await db.getOptional('SELECT * FROM todos WHERE id = ?', [id]);

// Execute (INSERT/UPDATE/DELETE)
await db.execute(
  'INSERT INTO todos (id, description, completed) VALUES (uuid(), ?, ?)', 'New todo', 0]
);
```

### Reactive Queries (watch)

```typescript
// Basic watch
const unsubscribe = db.watch(
  'SELECT * FROM todos WHERE completed = ?',
  [0],
  {
    onResult: (results) => {
      console.log('Active todos:', results.rows._array);
    }
  }
);
```

### Incremental Watch (v1.4.0+)

For large datasets, only changed rows are emitted:

```typescript
const unsubscribe = db.watch(
  'SELECT * FROM todos',
  [],
  {
    onResult: (results) => updateUI(results.rows._array),
    incremental: true
  }
);
```

### Transactions

```typescript
await db.writeTransaction(async (tx) => {
  await tx.execute('INSERT INTO lists (id, name) VALUES (?, ?)', [listId, 'Shopping']);
  await tx.execute('INSERT INTO todos (id, list_id, description) VALUES (uuid(), ?, ?)', listId, 'Buy milk']);
});
```

## React Integration

### Setup Provider

```tsx
// App.tsx
import { PowerSyncContext } from '@powersync/react';
import { db, initPowerSync } from './db';

function App() {
  useEffect(() => {
    initPowerSync();
  }, []);

  return (
    <PowerSyncContext.Provider value={db}>
      <MyApp />
    </PowerSyncContext.Provider>
  );
}
```

### Use Hooks

```tsx
import { useQuery, useStatus, usePowerSync } from '@powersync/react';

function TodoList({ listId }: { listId: string }) {
  // Reactive query - auto-updates on changes
  const { data: todos, isLoading } = useQuery(
    'SELECT * FROM todos WHERE list_id = ?',
    [listId]
  );

  // Connection status
  const status = useStatus();

  // Database instance for writes
  const db = usePowerSync();

  const addTodo = async (text: string) => {
    await db.execute(
      'INSERT INTO todos (id, list_id, description, completed) VALUES (?, ?, ?, ?)',
      [crypto.randomUUID(), listId, text, 0]
    );
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      <div>{status.connected ? '🟢 Online' : '🔴 Offline'}</div>
      {todos?.map(todo => (
        <TodoItem key={todo.id} todo={todo} />
      ))}
    </div>
  );
}
```

## Drizzle ORM Integration

```typescript
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

## Sync Status

```typescript
// Listen to changes
db.registerListener({
  statusChanged: (status) => {
    console.log('Connected:', status.connected);
    console.log('Uploading:', status.uploading);
    console.log('Downloading:', status.downloading);
    console.log('Last synced:', status.lastSyncedAt);
  }
});

// Current status
const status = db.currentStatus;
```

## Error Handling

```typescript
import { PowerSyncConnectionError } from '@powersync/web';

try {
  await db.connect(connector);
} catch (error) {
  if (error instanceof PowerSyncConnectionError) {
    console.error('Connection failed:', error.message);
    // Show offline UI
  }
}
```

## Local-First Patterns

### Optimistic UI - Instant Feedback

```typescript
// Writes are instant - no loading states needed
async function addTodo(text: string) {
  await db.execute(
    'INSERT INTO todos (id, description, completed) VALUES (uuid(), ?, ?)', [text, 0]
  );
  // UI updates automatically via reactive query
  // No spinner, no "saving...", no refresh needed
}
```

### Sync Status Indicator

```tsx
function SyncBadge() {
  const status = useStatus();
  const { data } = useQuery('SELECT COUNT(*) as count FROM ps_crud');
  const pending = data?.[0]?.count ?? 0;

  if (!status.connected) {
    return <Badge color="orange">Offline {pending > 0 && `(${pending})`}</Badge>;
  }
  if (status.uploading || status.downloading) {
    return <Badge color="blue">Syncing...</Badge>;
  }
  return <Badge color="green">Synced</Badge>;
}
```

### Pending Changes Indicator

```tsx
function usePendingIds(table: string) {
  const { data } = useQuery(
    `SELECT json_extract(data, '$.id') as id FROM ps_crud WHERE table_name = ?`,
    [table]
  );
  return new Set(data?.map(r => r.id) ?? []);
}

function TodoItem({ todo }: { todo: Todo }) {
  const pendingIds = usePendingIds('todos');
  return (
    <div className={pendingIds.has(todo.id) ? 'opacity-70' : ''}>
      {todo.description}
      {pendingIds.has(todo.id) && <SyncIcon className="animate-pulse" />}
    </div>
  );
}
```

### Offline-Ready App Shell

```tsx
function App() {
  const status = useStatus();
  const { data: hasData } = useQuery('SELECT COUNT(*) as c FROM todos');

  // First launch - no cached data yet
  if (!status.hasSynced && (hasData?.[0]?.c ?? 0) === 0) {
    return <InitialSyncScreen />;
  }

  // Normal operation - works offline
  return (
    <>
      {!status.connected && <OfflineBanner />}
      <MainContent />
    </>
  );
}
```

## Performance Tips

1. **Use OP SQLite on React Native** - 2-10x faster than default
2. **Batch writes in transactions** - Fewer round-trips
3. **Index frequently queried columns** - Add in schema
4. **Use incremental watch** - For lists with 100+ items
5. **Paginate large results** - Use LIMIT/OFFSET

## Common Issues

| Issue | Solution |
|-------|----------|
| "Database not connected" | Call `db.connect(connector)` before queries |
| "Schema mismatch" | Ensure client schema matches sync rules |
| Upload queue growing | Check `uploadData` calls `batch.complete()` |
| Slow initial sync | Review bucket sizes |
