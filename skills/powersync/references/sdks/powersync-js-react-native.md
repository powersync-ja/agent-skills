---
name: powersync-js-react-native
description: PowerSync React Native, Expo, and Expo Go integration — native SQLite adapters, managed workflow setup, and Expo Go sql-js fallback
metadata:
  tags: react-native, expo, devtools, rozenite, usePowerSyncDevTools, @powersync/diagnostics, expo-go, mobile, op-sqlite, javascript, typescript, offline-first
---

# PowerSync React Native, Expo & Expo Go

> **Load this when** building a React Native app, Expo app (managed or bare), or Expo Go sandbox. Always load `powersync-js.md` first.

React Native-specific integration for the PowerSync JavaScript SDK. Use this reference alongside `references/sdks/powersync-js.md` when building React Native apps, Expo apps (managed or bare workflow), or Expo Go sandboxes.

The React hooks API (`useQuery`, `useStatus`, `usePowerSync`, `useSuspenseQuery`) from `@powersync/react-native` is identical to `@powersync/react` — see `references/sdks/powersync-js.md` for full hook patterns and `references/sdks/powersync-js-react.md` for `useSuspenseQuery` and sync stream hooks.

| Resource | Description |
|----------|-------------|
| [React Native & Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo.md) | Full SDK documentation for React Native, consult for details beyond the inline examples. |
| [React Native SDK API Reference](https://powersync-ja.github.io/powersync-js/react-native-sdk) | Full API reference for `@powersync/react-native`, consult only when the inline examples don't cover your case. |
| [Expo Go Support](https://docs.powersync.com/client-sdks/frameworks/expo-go-support.md) | Expo Go adapter guide, consult for details beyond the inline examples. |

## 1. Install

Requires React Native 0.72 or later.

### Standard React Native

```bash
npm install @powersync/react-native@latest
npm install @op-engineering/op-sqlite  # Required peer dependency
```

After installing native dependencies, rebuild your native app:

```bash
npx expo prebuild   # Expo managed/bare
# or
npx react-native run-ios / run-android
```

## 2. Provider Setup

The provider pattern is identical to React web. Import from `@powersync/react-native`:

```tsx
import { PowerSyncContext } from '@powersync/react-native';

export function App() {
  return (
    <PowerSyncContext.Provider value={db}>
      <YourApp />
    </PowerSyncContext.Provider>
  );
}
```

## 3. Database Initialization

```ts
import { PowerSyncDatabase } from '@powersync/react-native';
import { AppSchema } from './AppSchema';

export const db = new PowerSyncDatabase({
  schema: AppSchema,
  database: {
    dbFilename: 'app.db'
  }
});
```

The `database: { dbFilename: '...' }` config uses OP-SQLite via the `@op-engineering/op-sqlite` peer dependency. No additional configuration is needed.

## Expo

Requires Expo 49 or later. If the Expo version is 49, configure `expo-build-properties` to set `minSdkVersion: 24` and add `'mjs'` to Metro `sourceExts`. If the version is 50 or 51, set only `minSdkVersion: 24` in `expo-build-properties`. Expo 52 and later configure both settings automatically.

### Managed Workflow

PowerSync works with Expo managed workflow. Native adapters (recommended) require a development build because they use native modules. If you need to run in Expo Go, use the JavaScript-only adapter instead. See the Expo Go section below.

```bash
npx expo install @powersync/react-native @op-engineering/op-sqlite
npx expo prebuild
npx expo run:ios   # or run:android
```

Use [EAS Build](https://docs.expo.dev/build/introduction/) for CI/CD builds.

### Bare Workflow

Same as standard React Native above. Run `npx react-native run-ios` / `run-android` after installing native dependencies.

## Expo Go

Expo Go is a sandbox that does not support native modules. To run PowerSync in Expo Go, use the JavaScript-only adapter `@powersync/adapter-sql-js`.

> Alpha: `@powersync/adapter-sql-js` is in alpha. Do not use in production.

### Limitations

- No SQLite consistency guarantees — every write triggers a full rewrite of the entire database file; the app may end up with missing data or a corrupted file if killed mid-write
- Significantly slower than native adapters
- Default mode is in-memory; persistence requires a custom `persister` option

### Install

```bash
npm install @powersync/react-native@latest @powersync/adapter-sql-js@latest
```

### Usage

```tsx
import { SQLJSOpenFactory } from '@powersync/adapter-sql-js';
import { PowerSyncDatabase, Schema } from '@powersync/react-native';

export const powerSync = new PowerSyncDatabase({
  schema: new Schema({}), // define your schema here
  factory: new SQLJSOpenFactory({
    dbFilename: 'app.db',
  }),
});
```

### Switching Between Expo Go and Native Adapters

Use `Constants.executionEnvironment` to select the adapter at runtime, allowing the same codebase to run in both Expo Go and development/production builds:

```tsx
import { SQLJSOpenFactory } from '@powersync/adapter-sql-js';
import { DatabaseSource, PowerSyncDatabase } from '@powersync/react-native';
import Constants from 'expo-constants';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

const source: DatabaseSource = isExpoGo
  ? { factory: new SQLJSOpenFactory({ dbFilename: 'app.db' }) }
  : { database: { dbFilename: 'sqlite.db' } };

export const powerSync = new PowerSyncDatabase({ schema: AppSchema, ...source });
```

### Moving Beyond Expo Go

When moving to development builds or production, switch to a native adapter:

- OP-SQLite (`@op-engineering/op-sqlite`) — recommended; encryption support, New Architecture compatible

This requires native compilation and cannot run inside Expo Go's prebuilt container.

## DevTools (Development Only)

> Load this section only when the user wants to inspect the local database or sync state of a running React Native or Expo app, or give a coding agent access to it.

If the user wants to inspect the app, use `@powersync/diagnostics`, a Rozenite plugin that adds a PowerSync panel to React Native DevTools. It needs React Native 0.76+ and Rozenite 2.5.0+.

1. Install as dev dependencies in the app's own `package.json` (Rozenite finds plugins only there, so in a monorepo do not rely on a shared package):

```bash
npm install -D @powersync/diagnostics @rozenite/metro @rozenite/plugin-bridge @rozenite/agent-bridge
```

2. Wrap the Metro config with `withRozenite()`. For Expo (`projectType: 'expo'` is required if the app uses `app.config.ts` or `app.config.js`; Rozenite detects Expo only from `app.json`):

```javascript
const { getDefaultConfig } = require('expo/metro-config');
const { withRozenite } = require('@rozenite/metro');

module.exports = withRozenite(getDefaultConfig(__dirname), {
  enabled: process.env.WITH_ROZENITE === 'true',
  projectType: 'expo'
});
```

For bare React Native, wrap `mergeConfig(getDefaultConfig(__dirname), config)` from `@react-native/metro-config` and omit `projectType`.

3. Call the hook once in a component that stays mounted, such as the root layout. If the database is created later, pass `null` until it exists. In production builds the hook does nothing, so it can stay in the code:

```tsx
import { usePowerSyncDevTools } from '@powersync/diagnostics/react-native';

usePowerSyncDevTools(db);
```

4. Start Metro with `WITH_ROZENITE=true` (for example `WITH_ROZENITE=true npx expo run:ios`), press `j` in the Metro terminal, then open the **PowerSync** entry in the **Rozenite** tab.

- If the user wants per-bucket operation totals in the Buckets tab, connect with `db.connect(connector, { diagnostics: __DEV__ })` (needs `@powersync/react-native` 2.4.1+).
- If the Rozenite tab is missing, check that Metro started with `WITH_ROZENITE=true` and, for Expo with a JS or TS config, that `projectType: 'expo'` is set. Restart Metro after config changes.
- If the Android emulator app talks to a service on `localhost`, run `adb reverse tcp:<port> tcp:<port>` for each port.
- If a coding agent needs the app's live client, use the Rozenite agent CLI from the app folder: `npx rozenite agent powersync/diagnostics` lists the tools (`query`, `schema`, `info`, `status`, `upload-queue`, `action`), inputs are named flags such as `--sql`, and `npx rozenite agent session stop` releases the debugger connection when done. `query` writes go into the upload queue, and `action` with `clearData` deletes local data including queued changes, so confirm with the user first.

## Common Pitfalls

### Forgetting to rebuild after installing native deps

Any change to native dependencies requires a rebuild. Running `npx expo start` without rebuilding will use the old native bundle and the new package won't be linked.

### Using Expo Go without the sql-js adapter

Expo Go does not support native modules. Attempting to use `@powersync/react-native` with the default OP-SQLite adapter in Expo Go will throw a native module not found error. Use `@powersync/adapter-sql-js` for Expo Go.
