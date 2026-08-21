Prompt Contribution Graph v0.2.0 replaces Electron with Tauri 2, substantially reducing the macOS package while preserving existing local data and Claude Code hooks.

## Highlights

- Native Tauri desktop builds for macOS and Linux.
- One universal macOS DMG for Apple silicon and Intel.
- Ubuntu/Debian x86-64 package and a portable x86-64 AppImage.
- Rust-based SQLite access and low-overhead Claude Code hook capture.
- Automatic compatibility with existing PromptTrail databases and hook settings.
- Private activity sharing based only on aggregate statistics.
- A refined macOS interface that blends into the native window.

## Known limitations

- This release is ad-hoc signed and not notarized. macOS will display a Gatekeeper warning.
- Windows, iPhone, and iPad builds are not included.

## Upgrade note

The app keeps the legacy `prompttrail` command, data paths, hook marker, and application identifier so existing installations continue to work. A database backup is created before the first schema migration.
