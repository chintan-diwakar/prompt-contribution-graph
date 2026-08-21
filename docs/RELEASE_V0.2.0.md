# v0.2.0 Release Plan

Status: [Stable GitHub release published](https://github.com/chintan-diwakar/prompt-contribution-graph/releases/tag/v0.2.0) on August 21, 2026

Target: `v0.2.0`

This release completes the Electron-to-Tauri 2 migration for macOS and Linux. The previous public release is `v0.1.0`.

## Release scope

- Tauri 2 desktop application replacing Electron.
- Existing PromptTrail SQLite data and Claude Code hooks preserved.
- Native Rust capture path, database queries, hook management, and sharing.
- Ubuntu/Debian x86-64 package and a portable x86-64 AppImage.
- Universal macOS DMG for Apple silicon and Intel.
- Full-bleed macOS window styling with a native overlay title bar.

## Readiness checklist

### Code and compatibility

- [x] JavaScript tests pass.
- [x] Rust tests, formatting, checks, and Clippy pass locally.
- [x] macOS universal binary contains `arm64` and `x86_64` architectures.
- [x] The macOS bundle passes local code-signature verification.
- [x] Update the tag workflow to build one universal macOS DMG and publish verified release assets.
- [x] Build the Linux AppImage and Ubuntu/Debian packages from the release tag in CI.
- [x] Verify the published Linux package metadata, checksums, and packaged hook capture on Ubuntu.
- [x] Protected GitHub Actions checks pass for the release commit.
- [ ] Smoke-test database migration using a copy of an existing Electron database.
- [ ] Smoke-test hook capture and uninstall/reinstall from the packaged app.

### Apple distribution

- [ ] Install a Developer ID Application certificate in the release keychain.
- [ ] Configure Apple notarization credentials as GitHub Actions secrets.
- [ ] Sign the macOS application with hardened runtime enabled.
- [ ] Notarize and staple the macOS application or DMG.
- [ ] Confirm Gatekeeper accepts the DMG on a clean Mac.

## GitHub workflow

1. Create a release branch from `main`, for example `release/v0.2.0`.
2. Commit only the migration, documentation, build workflow, and Tauri project files.
3. Open a draft pull request into `main` with the migration summary and test evidence.
4. Wait for the complete desktop workflow to pass on Ubuntu and macOS.
5. Download and smoke-test every CI artifact.
6. Merge the approved pull request.
7. Create and push the annotated tag `v0.2.0` from the merge commit.
8. Confirm the tag workflow produces the expected release artifacts, including the universal macOS DMG.
9. Create a GitHub release for `v0.2.0`, attach the verified packages, and publish the notes below.
10. Keep `v0.1.0` available as the Electron rollback release during the first two Tauri releases.

Git staging, committing, pushing, pull-request creation, tagging, and release publication are separate maintainer-authorized actions. Planning this release does not perform any of them.

## Expected artifacts

| Platform | Artifact |
| --- | --- |
| macOS Apple silicon and Intel | `Prompt.Contribution.Graph_0.2.0_universal.dmg` |
| Ubuntu/Debian x86-64 | `Prompt.Contribution.Graph_0.2.0_amd64.deb` |
| Linux x86-64 | `Prompt.Contribution.Graph_0.2.0_amd64.AppImage` |

The published packages have these sizes and SHA-256 digests:

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| macOS DMG | 7.7 MiB | `171cdd7d4408486d3b48034a89df3db9b20c18e452671aead6cc904679e04c5f` |
| Ubuntu/Debian package | 5.2 MiB | `5d40886af50a095da2e4f83882681252caeabedd00e589bd580d6ad9725c9674` |
| Linux AppImage | 78.9 MiB | `96e344c28e80632309ad5c4eb029f4b6c44b4893e9c6a2703828dd48dd0f4480` |

## Draft release notes

### Prompt Contribution Graph v0.2.0

This release replaces Electron with Tauri 2, significantly reducing the macOS application package while preserving existing local data and Claude Code hooks.

Highlights:

- Native Tauri desktop builds for macOS and Linux.
- Universal macOS support for Apple silicon and Intel.
- Ubuntu/Debian x86-64 package and a portable x86-64 AppImage.
- Rust-based SQLite access and low-overhead Claude Code hook capture.
- Automatic compatibility with existing PromptTrail databases and hook settings.
- Private activity sharing based only on aggregate statistics.
- A refined macOS interface that blends into the native window.

Known limitations:

- Windows, iPhone, and iPad builds are not included.

Upgrade note:

The app keeps the legacy `prompttrail` command, data paths, hook marker, and application identifier so existing installations continue to work. A database backup is created before the first schema migration.
