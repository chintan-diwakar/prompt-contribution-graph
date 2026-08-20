Prompt Contribution Graph v0.2.0 replaces Electron with Tauri 2, substantially reducing the macOS package while preserving existing local data and Claude Code hooks.

## Highlights

- Native Tauri desktop builds for macOS and Linux.
- One universal macOS DMG for Apple silicon and Intel.
- Rust-based SQLite access and low-overhead Claude Code hook capture.
- Automatic compatibility with existing PromptTrail databases and hook settings.
- Private activity sharing based only on aggregate statistics.
- An iOS application target and unsigned IPA build for Apple Developer signing.
- A refined macOS interface that blends into the native window.

## Known limitations

- This prerelease is ad-hoc signed and not notarized. macOS will display a Gatekeeper warning.
- iOS stores data in its own sandbox and does not run Mac Claude Code hooks.
- iOS sync/import is not included in this release.
- The iOS IPA is a development artifact and requires Apple Developer signing before it can be installed or distributed.

## Upgrade note

The app keeps the legacy `prompttrail` command, data paths, hook marker, and application identifier so existing installations continue to work. A database backup is created before the first schema migration.
