# v0.3.0 Release Record

Target: `v0.3.0`

This release adds Codex activity tracking to the Tauri desktop application released in v0.2.0.

## Release scope

- Official Codex lifecycle-hook integration alongside Claude Code.
- Non-destructive hook installation, status reporting, and removal for both agents.
- Agent attribution in the database, API, and dashboard.
- Backward-compatible SQLite migration with a pre-migration backup.
- Universal macOS DMG for Apple silicon and Intel.
- Ubuntu/Debian x86-64 package and portable x86-64 AppImage.
- Stable GitHub release publication from the protected tag workflow.

## Verification

- JavaScript syntax checks and automated tests.
- Rust formatting, checks, Clippy with warnings denied, and automated tests.
- Release-mode Tauri build on macOS.
- Isolated install, status, capture, and uninstall smoke tests.
- Live Codex CLI prompt and completion capture.
- GitHub Actions test, universal macOS, and Ubuntu build jobs.

## Distribution notes

The macOS package is ad-hoc signed rather than Apple-notarized, so Gatekeeper may warn on first launch. Windows, iPhone, and iPad builds remain outside this release scope.
