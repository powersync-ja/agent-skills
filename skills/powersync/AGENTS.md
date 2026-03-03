# PowerSync Skills

Best practices and expertise for building applications with PowerSync.

## Directory Structure

```plaintext
powersync/
├── AGENTS.md                       # PowerSync skill file
├── CLAUDE.md                       # Links to AGENTS.md
├── SKILL.md                        # Main skill file
└── references/                     # Detailed references
    ├── powersync-debug.md
    ├── powersync-overview.md
    ├── powersync-service.md
    ├── sdks/                       # Detailed SDK references
    │   ├── powersync-dart.md
    │   ├── powersync-dotnet.md
    │   ├── powersync-js.md              # JS/TS core — always load for any JS/TS project
    │   ├── powersync-js-react.md        # React web + Next.js
    │   ├── powersync-js-react-native.md # React Native + Expo + Expo Go
    │   ├── powersync-js-vue.md          # Vue + Nuxt
    │   ├── powersync-js-node.md         # Node.js + Electron
    │   ├── powersync-js-tanstack.md     # TanStack Query + TanStack DB
    │   ├── powersync-kotlin.md
    │   ├── powersync-swift.md
    ├── sync-config.md
```

## Usage

1. Read [SKILL.md](SKILL.md) first.
2. Use `references/` when looking for detailed information on specific topics such as the common debugging scenarios, architecture overview to gain an overall understanding of PowerSync, the PowerSync Service or sync config (Sync Streams and Sync Rules). 
3. Use the `references/sdks` when looking for client-side specific topics for each of the supported SDKs.
4. For JavaScript/TypeScript projects, the JS SDK reference is split across multiple files. Always load `powersync-js.md` as the foundation, then load the applicable framework file(s) alongside it. The framework files are additive — they do not repeat core content.