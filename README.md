# PowerSync Agent Skills

[![skills.sh installs](https://skills.sh/b/powersync-ja/agent-skills)](https://skills.sh/powersync-ja/agent-skills)

Agent skills that help developers build applications with [PowerSync](https://powersync.com).

![PowerSync Agent Skills](assets/sync-dino.png)

## Available Skills

| Skill                  | Description|
|----------------------|-----------------------|
| PowerSync |Comprehensive best practices for PowerSync Agent Skills. It includes all of the necessary topics from the SDKs, Service and debugging|

PowerSync skills follow the [Agent Skills](https://agentskills.io/) specification.

## `.well-known` discovery

Every GitHub Release includes two machine-readable assets for the [Agent Skills Discovery specification](https://github.com/cloudflare/agent-skills-discovery-rfc):

- `index.json`, which lists each published skill, its archive URL, and SHA-256 digest.
- `powersync.tar.gz`, a self-contained archive with `SKILL.md` at its root.

Release Please keeps the repository's versions aligned and the release workflow builds both assets from the tagged commit. A website can expose the latest `index.json` at `/.well-known/agent-skills/index.json`; the archive itself remains an immutable GitHub Release asset, so it does not need to be copied into the website repository.

## Installation

### skills.sh (Cursor, Codex, Copilot, Windsurf, and most other agents)

```
npx skills add powersync-ja/agent-skills
```

The installer detects your agent. To target a specific agent:

```
npx skills add powersync-ja/agent-skills --agent cursor
npx skills add powersync-ja/agent-skills --agent codex
npx skills add powersync-ja/agent-skills --agent github-copilot
npx skills add powersync-ja/agent-skills --agent claude-code
```

### Claude Code (plugin)

```
/plugin marketplace add powersync-ja/agent-skills
/plugin install powersync-skills@powersync
```

### Gemini CLI

```
gemini skills install https://github.com/powersync-ja/agent-skills.git --path skills/powersync
```

## Updating

Installed skills do not update themselves. To get the latest release:

- skills.sh installs: `npx skills update`
- Claude Code plugin: `/plugin marketplace update powersync`, then `/plugin update powersync-skills@powersync`
- Gemini CLI: `gemini skills uninstall powersync`, then reinstall

## Usage

Once skills are installed, agents will automatically use relevant information when working on tasks relating to PowerSync. 

A few examples:
```
Migrate my sync rules to sync streams.
```
```
Write sync streams that download all user tasks and make sure the data is only available on the device for one week.
```
```
Update my list to use a reactive watch query so users can see updates in real-time.
```
```
Suggest sync streams based on my current schema, where the user should only sync projects for tenant that they belong to.
```
```
Add an upload endpoint to my backend API that accepts write operations from client applications.
```

## Contributing
We welcome contributions from the community to improve PowerSync AX. Please see [CONTRIBUTING.md](/CONTRIBUTING.md) for details.

### Verifying changes with snyk-agent-scan

skills.sh surfaces third-party security audits for this skill (Snyk, Socket, Gen Agent Trust Hub). Snyk's [agent-scan](https://github.com/snyk/agent-scan) flags secret-looking strings and credential-handling wording, so after changing any file under `skills/`, run it and confirm it reports zero issues.

With a free Snyk account (get a token at [app.snyk.io/account](https://app.snyk.io/account); requires [uv](https://docs.astral.sh/uv/)):

```bash
export SNYK_TOKEN=<your-token>
uvx snyk-agent-scan@latest scan skills/powersync --json
```

Without a Snyk account, use the rate-limited demo endpoint behind Snyk's [Skill Inspector](https://labs.snyk.io/experiments/skill-scan/):

```bash
SNYK_CLI_USE=true uvx snyk-agent-scan@latest scan skills/powersync \
  --analysis-url "https://labs.snyk.io/experiments/skill-scan/api/agent-scan/analysis-machine" \
  --json
```

If `uv` is not available, `pip install snyk-agent-scan` into a virtualenv and run the same `snyk-agent-scan scan ...` command.

The scan passes when the JSON output contains an empty `issues` array. Known false-positive triggers to avoid in skill content:

- Connection strings with an inline password, i.e. `user:password@` between the scheme and the host. Placeholders such as `<user>` or `{user}` still trigger it. Use `user@host` URIs and supply the password via a separate `password: !env ...` field.
- Hex strings of 20+ characters. Link to `main` or a tag instead of pinning commit SHAs, and zero out most characters in example IDs (e.g. `69c3d0350000000000000001`).
- Literal credential values, even public defaults such as `password: postgres`. Use `!env` references.
- Wording that reads as credential harvesting, such as "persist credentials immediately" or "write all keys to disk". Frame the same guidance as keeping credentials in `.env` instead of hardcoding them.

Also run `node scripts/validate.mjs` before pushing. CI enforces it, and it includes its own check for inline credentials in example URIs.
