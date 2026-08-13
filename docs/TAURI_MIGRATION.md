# Future Desktop Migration: Electron to Tauri

Status: Proposed

Target release: Not scheduled

This document defines a future migration from Electron to Tauri 2. The migration is not part of the current release.

The public project name changed from PromptTrail to Prompt Contribution Graph. Legacy identifiers will remain during this migration to preserve existing installations.

## Why migrate

Prompt Contribution Graph packages a complete Electron runtime. Electron includes Chromium and Node.js with every desktop application.

The Prompt Contribution Graph application code is small. The runtime accounts for almost all package size.

| v0.2.0 Linux artifact | Measured size |
| --- | ---: |
| Prompt Contribution Graph `app.asar` | 87,904 bytes |
| Unpacked Electron application | 313 MB |
| AppImage | 127.7 MB |
| Ubuntu `.deb` | 100.3 MB |

One language pack and maximum compression reduce the AppImage to 90.3 MB. The same settings reduce the `.deb` to 90.8 MB.

These settings are useful for an Electron maintenance release. They do not remove the Electron runtime.

Tauri uses the native webview of each operating system. It does not package a browser engine with each application.

## Goals

- Reduce each desktop download by at least 70 percent from the v0.2.0 baseline.
- Keep the current HTML, CSS, and JavaScript interface.
- Keep all activity data on the local device.
- Open the existing SQLite database without data loss.
- Preserve the current Claude Code hook behavior.
- Keep the hook capture path below the five-second hook timeout.
- Preserve the activity view, history view, insights, and private sharing.
- Build Intel and Apple silicon DMGs.
- Build an x64 AppImage and an x64 Ubuntu `.deb` package.
- Keep the command-line dashboard available during the transition.

## Non-goals

- This migration does not add accounts, cloud storage, analytics, or telemetry.
- This migration does not redesign the activity interface.
- This migration does not change the privacy policy.
- This migration does not require a new database from existing users.
- This migration does not combine the Codex adapter with the desktop rewrite.

The provider interface will support Claude Code and future providers. Provider work can proceed in a separate release.

## Current architecture

The current application uses these components:

- `src/capture.js` reads hook events from standard input.
- `src/database.js` stores activity with `node:sqlite`.
- `src/hooks.js` installs and removes Claude Code hooks.
- `src/server.js` serves the browser dashboard on `127.0.0.1`.
- `desktop/main.js` creates the Electron window and system share flow.
- `src/public/` contains the interface that both desktop and browser modes use.

The packaged Electron executable also handles `--capture-hook`. This mode writes one event and exits without opening a window.

## Target architecture

The target repository will use a Rust workspace with three clear boundaries.

```text
crates/prompttrail-core/   Event models, SQLite, paths, and queries
crates/prompttrail-cli/    Hook capture, hook installation, status, and browser server
src-tauri/                 Tauri commands, windows, menus, and sharing
src/public/                Shared HTML, CSS, and JavaScript interface
```

### Rust core

`prompttrail-core` will own all data and hook rules.

It will provide these functions:

- Normalize provider events into one internal event model.
- Store prompts, responses, and safe tool metadata.
- Calculate totals, streaks, daily activity, and project lists.
- Search and delete prompt records.
- Resolve the current data directory on each operating system.
- Run additive database migrations.

The core will not contain a window, webview, HTTP server, or provider settings writer.

### Hook capture

The Rust executable will inspect its arguments before Tauri starts.

If `--capture-hook` is present, the executable will use this sequence:

1. Read a size-limited JSON event from standard input.
2. Normalize the event.
3. Write one SQLite transaction.
4. Write `{}` to standard output.
5. Exit without starting a webview.

The capture path will never write prompt content to a log. An error will not stop the provider from processing the prompt.

Hook installation will continue to use the legacy `prompttrail` marker. Uninstallation will remove only marked entries.

### Tauri desktop

Tauri will package the files in `src/public/`. The desktop mode will not start a local HTTP server.

The interface will call a small set of typed Tauri commands:

- `get_summary`
- `list_projects`
- `list_prompts`
- `delete_prompt`
- `share_activity`
- `get_hook_status`
- `install_hooks`

The webview will not receive raw SQL access or general file-system access.

### Browser dashboard

The command-line application will keep the local HTTP server during the transition.

The frontend will use a `dataClient` boundary with two implementations:

- The browser implementation will call the existing local API.
- The desktop implementation will call Tauri commands.

This boundary will prevent duplicate interface logic.

### Private sharing

The new share flow will generate a dedicated image from aggregate activity data.

It will not capture prompt text, response text, project names, tool details, or hidden windows.

On macOS, the Rust layer will open the native share service. On Linux, it will copy the image and open the X intent.

## Database compatibility

The Tauri release must use the current database locations.

| Operating system | Database path |
| --- | --- |
| Linux | `~/.local/share/prompttrail/prompts.sqlite` |
| macOS | `~/Library/Application Support/PromptTrail/prompts.sqlite` |
| Windows | `%APPDATA%\PromptTrail\prompts.sqlite` |

The Rust schema will preserve the current `prompts` and `tool_events` tables.

Before the first schema change, the application will create a timestamped SQLite backup. The backup process will include active WAL data.

All migrations will be additive for at least two releases. The Electron version must remain able to read the database during rollback.

Database tests will use copies of v0.1 and v0.2 database fixtures. Each test will compare records before and after migration.

## Migration phases

### Phase 0: Reduce Electron packages

1. Keep only the `en-US` Electron language pack.
2. Use maximum package compression.
3. Measure every artifact in CI.

This phase is independent from the Tauri migration.

### Phase 1: Add a frontend data boundary

1. Move all current `fetch()` calls behind `dataClient`.
2. Keep the HTTP implementation as the default.
3. Add contract tests for every data operation.

The application behavior must remain unchanged in this phase.

### Phase 2: Build the Rust core

1. Implement the existing SQLite schema and queries in Rust.
2. Implement the current safe tool-target rules.
3. Add fixture tests for every supported hook event.
4. Compare Rust results with the current Node.js results.

### Phase 3: Build the capture and hook path

1. Add `--capture-hook` before Tauri initialization.
2. Preserve atomic settings updates and backups.
3. Measure capture latency on Linux and macOS.
4. Run repeated hook tests with concurrent SQLite writes.

### Phase 4: Add the Tauri shell

1. Package the existing interface with Tauri 2.
2. Add the typed command allowlist.
3. Match the current window size, materials, menus, and navigation.
4. Add the browser and Tauri `dataClient` implementations.

### Phase 5: Restore desktop integrations

1. Add the dedicated share-image renderer.
2. Add the macOS share service.
3. Add Linux clipboard and X sharing.
4. Install hooks after the first packaged launch.
5. Preserve single-instance behavior.

### Phase 6: Build and release

1. Add Rust formatting, lint, and test jobs to CI.
2. Build Linux packages on Ubuntu.
3. Build Intel and Apple silicon DMGs on macOS.
4. Record artifact sizes for every build.
5. Sign and notarize the macOS release.
6. Publish a preview release before the stable release.

## Acceptance gates

### Gate 1: Package size

- Each desktop artifact is at least 70 percent smaller than its v0.2.0 counterpart.
- CI records the compressed and installed sizes.

### Gate 2: Data safety

- The new version opens a copy of every supported database fixture.
- The migration preserves every prompt, response, tool event, timestamp, and project value.
- The previous stable version can read the migrated database.

### Gate 3: Hook reliability

- Each supported hook event produces the same stored result as v0.2.0.
- The capture process always exits within five seconds.
- Concurrent events do not lose or duplicate records.
- Errors never include prompt or response content.

### Gate 4: Interface parity

- Activity totals and streaks match the Node.js implementation.
- Search, filters, deletion, history, insights, and sharing work on Linux and macOS.
- Keyboard navigation and reduced-motion behavior remain available.

### Gate 5: Privacy

- The application makes no unexpected network requests.
- Tauri capabilities expose only the required commands.
- Shared images contain aggregate activity only.
- The application does not add telemetry or crash uploads.

## Risks and controls

| Risk | Control |
| --- | --- |
| Linux webview differences | Test the supported Ubuntu versions and document required system packages. |
| SQLite incompatibility | Use fixture tests, additive migrations, transactions, and a backup. |
| Slow hook startup | Enter capture mode before Tauri initialization and measure every build. |
| macOS share differences | Keep a save-and-copy fallback for every Mac release. |
| Visual differences | Use screenshot comparisons on Linux and macOS. |
| Signing delay | Keep preview builds separate from stable signed releases. |
| Rollback failure | Preserve the old schema and keep the Electron downloads available. |

## Rollback plan

The project will keep the last Electron release available during the first two Tauri releases.

If a critical error occurs, users can reinstall the Electron release. It will open the same database without conversion.

The hook installer will keep its settings backup. A rollback will restore only marked Prompt Contribution Graph hook entries.

No stable Tauri release will delete an old column or table during the rollback window.

## Release decision

The migration can enter a stable release only after all five acceptance gates pass on protected CI.

The maintainer will publish measured artifact sizes and known limitations with the preview release.

## Official references

- [Tauri overview and native-webview size model](https://tauri.app/start/)
- [Calling Rust commands from the frontend](https://v2.tauri.app/develop/calling-rust/)
- [Tauri distribution formats](https://v2.tauri.app/distribute/)
- [macOS signing and notarization](https://v2.tauri.app/distribute/sign/macos/)
