# PowerSync Skills

Best practices and expertise for building applications with PowerSync.

## Architecture

```mermaid
flowchart LR

  subgraph BACKEND["Your Backend"]
    direction TB
    DB["Backend Database (Postgres | MongoDB | MySQL | Supabase | …)"]
    API["Backend API (Your server / cloud functions)"]
    API -- "Applies writes" --> DB
  end

  subgraph PS_SERVICE["PowerSync Service"]
    direction TB
    SYNC["Partial Sync (sync rules filter data per user)"]
  end

  subgraph APP["Your App"]
    direction TB
    SDK["PowerSync SDK"]
    SQLITE["In-app SQLite (local replica — reads are instant)"]
    QUEUE["Upload Queue (offline write buffer)"]
    UI["UI"]
    SDK --- SQLITE
    SDK --- QUEUE
    SQLITE <--> UI
    QUEUE <--> UI
  end

  DB -- "Replicates changes (CDC / logical replication)" --> PS_SERVICE
  PS_SERVICE -- "Streams changes (real-time sync)" --> SDK
  QUEUE -- "Uploads writes (when connectivity resumes)" --> API
```

Key rule: **client writes never go through PowerSync** — they go directly from the app's upload queue to your backend API. PowerSync only handles the read/sync path.

## What to Load for Your Task

| Task | Load these files |
|------|-----------------|
| New project setup | See SDK Reference Files below for your platform |
| Debugging sync / connection issues | `powersync-debug.md` |
| Writing or migrating sync config | `sync-config.md` |
| Configuring the service / self-hosting | `powersync-service.md` |
| Understanding the overall architecture | This file is sufficient; see `powersync-overview.md` for deep links |

## SDK Reference Files

### JavaScript / TypeScript

Always load `references/sdks/powersync-js.md` as the foundation for any JS/TS project, then load the applicable framework file alongside it.

| Framework file | Load when… |
|----------------|-----------|
| `powersync-js-react.md` | React web app or Next.js |
| `powersync-js-react-native.md` | React Native, Expo, or Expo Go |
| `powersync-js-vue.md` | Vue or Nuxt |
| `powersync-js-node.md` | Node.js CLI/server or Electron |
| `powersync-js-tanstack.md` | TanStack Query or TanStack DB (any framework) |

### Other SDKs

| File | Use when… |
|------|----------|
| `powersync-dart.md` | Dart / Flutter (includes Drift ORM + Flutter Web) |
| `powersync-dotnet.md` | .NET (MAUI, WPF, Console) |
| `powersync-kotlin.md` | Kotlin Multiplatform (Android, JVM, iOS, macOS, watchOS, tvOS) |
| `powersync-swift.md` | Swift / iOS / macOS (includes GRDB ORM) |

## Key Rules to Apply Without Being Asked

- **Sync Streams over Sync Rules** — new projects must use Sync Streams (edition 3 config). Sync Rules are legacy; only use them when an existing project already has them.
- **`id` column** — never define `id` in a PowerSync table schema; it is created automatically as `TEXT PRIMARY KEY`.
- **No boolean/date column types** — use `column.integer` (0/1) for booleans and `column.text` (ISO string) for dates.
- **`connect()` is fire-and-forget** — do not `await connect()` expecting data to be ready. Use `waitForFirstSync()` if you need to wait.
- **`transaction.complete()` is mandatory** — if it is never called, the upload queue stalls permanently.
- **`disconnectAndClear()` on logout** — `disconnect()` keeps local data; `disconnectAndClear()` wipes it. Always use `disconnectAndClear()` when switching users.
- **Backend must return 2xx for validation errors** — a 4xx response from `uploadData` blocks the upload queue permanently.
