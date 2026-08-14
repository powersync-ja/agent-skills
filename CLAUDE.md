See [AGENTS.md](AGENTS.md) for guidance. For PowerSync work, follow [skills/powersync/AGENTS.md](skills/powersync/AGENTS.md) in full — including **Agent compliance**. **`powersync login`** = PowerSync Cloud only.

## Verifying changes

After changing any file under `skills/`, you must verify the skill still passes Snyk's security scanner (`snyk-agent-scan`) before considering the work done. Run the scan as described in "Verifying changes with snyk-agent-scan" in [README.md](README.md) and confirm it reports zero issues. The usual false-positive triggers are `user:password@` connection strings, hex strings of 20+ characters (commit SHAs, realistic example IDs), literal credential values, and wording that reads as credential harvesting. That README section lists the safe alternatives for each.
