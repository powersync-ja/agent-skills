---
name: powersync
description: Agent Skills for developing applications using PowerSync. 
---

# PowerSync

Best practices for building applications with PowerSync. Use this skill when implementing PowerSync in a project, configuring sync rules, troubleshooting sync or connectivity issues, or integrating a PowerSync client SDK. It covers correct patterns for schema design, client SDK usage, service configuration, and common debugging strategies.

## When to Use

Use the PowerSync Skill when:
- Configuring PowerSync 
- Connecting PowerSync to a source database
- Writing client-side code that integrates with the PowerSync SDK
- Debugging issues related to PowerSync
- Implementing Sync Rules or Sync Streams
- Migrating existing applications to PowerSync
- Gain understanding of the PowerSync architecture

Make sure to follow provided links for when additional context or information is required.

## References 

Contains references to specific components of PowerSync.

| Reference | Description |
|-----------|-------------|
| [sdks](references/sdks/) | Skills references for each supported PowerSync Client SDK. |
| [powersync-service.md](references/powersync-service.md) | Specific server configuration options and best practices for setting up the PowerSync service. |
| [powersync-debug.md](references/powersync-debug.md) | Skills references for debugging and troubleshooting PowerSync related issues across your application stack. |
| [powersync-overview.md](references/powersync-overview.md) | Skills references that provided information on the PowerSync architecture. |
| [sync-config.md](references/sync-config.md) | Skills reference for Sync Config (Sync Streams & Sync Rules(legacy)). |

## SDK Specific References

| SDK | Description |
|-----------|-------------|
| [powersync-dart](references/sdks/powersync-dart.md) | Apply this skill reference when working on Dart/Flutter apps. It also includes references for Drift (ORM support) and Flutter Web specifics. |
| [powersync-dotnet](references/sdks/powersync-dotnet.md) | (Under construction) Apply this skill reference if you're working on .NET applications. |
| [powersync-kotlin](references/sdks/powersync-kotlin.md) | (Under construction) Apply this skill reference if you're working on Kotlin applications. |
| [powersync-swift](references/sdks/powersync-swift.md) | Apply this skill reference if you're working on Swift applications. It also includes information for ORM support using GRDB. |

### JavaScript / TypeScript SDK References

Always load `powersync-js.md` as the foundation for any JS/TS project, then load the applicable framework file(s) alongside it.

| SDK File | Load when... |
|----------|-------------|
| [powersync-js](references/sdks/powersync-js.md) | Any JS/TS project — always load as the foundation. Covers schema, connector, transactions, sync status, raw tables, ORMs, debugging and internals. |
| [powersync-js-react](references/sdks/powersync-js-react.md) | React web app or Next.js. Covers `PowerSyncContext.Provider`, `useSuspenseQuery`, sync stream hooks, and Next.js-specific setup. |
| [powersync-js-react-native](references/sdks/powersync-js-react-native.md) | React Native, Expo, or Expo Go. Covers native SQLite adapters, Expo managed workflow, and the `@powersync/adapter-sql-js` Expo Go fallback. |
| [powersync-js-vue](references/sdks/powersync-js-vue.md) | Vue or Nuxt. Covers `@powersync/vue` composables, `@powersync/nuxt` module setup, Kysely composable, and the diagnostics panel. |
| [powersync-js-node](references/sdks/powersync-js-node.md) | Node.js CLI/server or Electron. Covers `@powersync/node` setup and the Electron renderer/main process split. |
| [powersync-js-tanstack](references/sdks/powersync-js-tanstack.md) | TanStack Query or TanStack DB (any framework). Covers `@powersync/tanstack-react-query` and `@tanstack/powersync-db-collection`. |