---
name: powersync-js-react-native
description: PowerSync React Native, Expo, and Expo Go integration — native SQLite adapters, managed workflow setup, and Expo Go sql-js fallback
metadata:
  tags: react-native, expo, expo-go, mobile, op-sqlite, javascript, typescript, offline-first
---

# PowerSync React Native, Expo & Expo Go

React Native-specific integration for the PowerSync JavaScript SDK. Use this reference alongside `references/sdks/powersync-js.md` when building React Native apps, Expo apps (managed or bare workflow), or Expo Go sandboxes.

The React hooks API (`useQuery`, `useStatus`, `usePowerSync`, `useSuspenseQuery`) from `@powersync/react-native` is identical to `@powersync/react` — see `references/sdks/powersync-js.md` for full hook patterns and `references/sdks/powersync-js-react.md` for `useSuspenseQuery` and sync stream hooks.

| Resource | Description |
|----------|-------------|
| [React Native & Expo SDK](https://docs.powersync.com/client-sdks/reference/react-native-and-expo.md) | Full SDK documentation for React Native, consult for details beyond the inline examples. |
| [React Native SDK API Reference](https://powersync-ja.github.io/powersync-js/react-native-sdk) | Full API reference for `@powersync/react-native`, consult only when the inline examples don't cover your case. |
| [Expo Go Support](https://docs.powersync.com/client-sdks/frameworks/expo-go-support.md) | Expo Go adapter guide, consult for details beyond the inline examples. |

## 1. Install

### Standard React Native (Recommended)

```bash
npm install @powersync/react-native
```

Then install a native SQLite adapter (required peer dependency):

```bash
# OP-SQLite — recommended: built-in encryption, React Native New Architecture support
npm install @powersync/op-sqlite

# OR: React Native Quick SQLite — original adapter
npm install @journeyapps/react-native-quick-sqlite
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

By default, `@powersync/react-native` uses OP-SQLite if installed, falling back to React Native Quick SQLite. No additional configuration is needed to select the adapter — the SDK detects which peer is present.

## Expo

### Managed Workflow

PowerSync works with Expo managed workflow. Native adapters (recommended) require a development build because they use native modules. If you need to run in Expo Go, use the JavaScript-only adapter instead. See the Expo Go section below.

```bash
npx expo install @powersync/react-native @powersync/op-sqlite
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
npm install @powersync/react-native @powersync/adapter-sql-js
```

### Usage

```tsx
import { SQLJSOpenFactory } from '@powersync/adapter-sql-js';
import { PowerSyncDatabase, Schema } from '@powersync/react-native';

export const powerSync = new PowerSyncDatabase({
  schema: new Schema({}), // define your schema here
  database: new SQLJSOpenFactory({
    dbFilename: 'app.db',
  }),
});
```

### Switching Between Expo Go and Native Adapters

Use `Constants.executionEnvironment` to select the adapter at runtime, allowing the same codebase to run in both Expo Go and development/production builds:

```tsx
import { SQLJSOpenFactory } from '@powersync/adapter-sql-js';
import { PowerSyncDatabase } from '@powersync/react-native';
import Constants from 'expo-constants';

const isExpoGo = Constants.executionEnvironment === 'storeClient';

export const powerSync = new PowerSyncDatabase({
  schema: AppSchema,
  database: isExpoGo
    ? new SQLJSOpenFactory({ dbFilename: 'app.db' })
    : { dbFilename: 'sqlite.db' }, // uses native adapter
});
```

### Moving Beyond Expo Go

When moving to development builds or production, switch to a native adapter:

- OP-SQLite (`@powersync/op-sqlite`) — recommended; encryption support, New Architecture compatible
- React Native Quick SQLite (`@journeyapps/react-native-quick-sqlite`) — original adapter

These require native compilation and cannot run inside Expo Go's prebuilt container.

## Common Pitfalls

### Forgetting to rebuild after installing native deps

Any change to native dependencies requires a rebuild. Running `npx expo start` without rebuilding will use the old native bundle and the new package won't be linked.

### Using Expo Go without the sql-js adapter

Expo Go does not support native modules. Attempting to use `@powersync/react-native` with the default OP-SQLite adapter in Expo Go will throw a native module not found error. Use `@powersync/adapter-sql-js` for Expo Go.
