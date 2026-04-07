# PowerSync Agent Skills

If you are building or modifying anything that uses **PowerSync**, you **must** follow the playbook in **[skills/powersync/AGENTS.md](skills/powersync/AGENTS.md)** — not a condensed summary.

That file includes:

- **Agent compliance (non-negotiable):** ask Cloud vs self-hosted, ask backend if unspecified, CLI-first, no silent shortcuts.
- Full onboarding sequence, setup paths, SDK references, and debugging.

**Do not** assume Supabase, assume self-hosted Docker, or skip CLI steps unless the user **explicitly** opts out.

**`powersync login`** is **PowerSync Cloud only**. Self-hosted does not use it — see `skills/powersync/references/powersync-cli.md` § “Authentication”.

When editing files under `skills/powersync/`, preserve and strengthen playbook language so agents cannot reasonably treat references as optional recipes.
