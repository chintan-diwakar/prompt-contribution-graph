Prompt Contribution Graph v0.3.0 adds first-class Codex activity tracking alongside Claude Code.

## Highlights

- Captures Codex prompts, final responses, and supported local tool activity through official lifecycle hooks.
- Installs Claude Code and Codex hooks automatically on the first packaged launch.
- Preserves existing unrelated hooks and creates a settings backup before each change.
- Labels activity by coding agent in the dashboard and stores the source in SQLite.
- Migrates existing databases safely, retaining earlier activity as Claude Code data.
- Includes a universal macOS DMG for Apple silicon and Intel, plus Ubuntu/Debian x86-64 packages.

## Codex setup

After installing and opening the app, run `/hooks` once in Codex and trust the Prompt Contribution Graph hooks. Codex will then record new activity in the same local dashboard as Claude Code.

## Known limitations

- The macOS build is ad-hoc signed and not Apple-notarized, so macOS may display a Gatekeeper warning.
- Hosted Codex tools are not exposed to local lifecycle hooks.
- Windows, iPhone, and iPad builds are not included.

## Upgrade note

The database migration is additive and creates a backup before changing the schema. Existing PromptTrail data paths, application identifiers, and the `prompttrail` command remain compatible.
