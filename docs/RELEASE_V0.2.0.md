# v0.2.0 Release Plan

Status: Prerelease automation prepared

Target: `v0.2.0`

This release completes the Electron-to-Tauri 2 migration and introduces the iOS build target. The previous public release is `v0.1.0`.

## Release scope

- Tauri 2 desktop application replacing Electron.
- Existing PromptTrail SQLite data and Claude Code hooks preserved.
- Native Rust capture path, database queries, hook management, and sharing.
- Linux AppImage and Debian package.
- Universal macOS DMG for Apple silicon and Intel.
- Unsigned iOS IPA for development and signing by an Apple Developer team.
- Full-bleed macOS window styling with a native overlay title bar.

## Readiness checklist

### Code and compatibility

- [x] JavaScript tests pass.
- [x] Rust tests, formatting, checks, and Clippy pass locally.
- [x] macOS universal binary contains `arm64` and `x86_64` architectures.
- [x] The macOS bundle passes local code-signature verification.
- [x] The unsigned iOS IPA builds locally.
- [x] Update the tag workflow to build one universal macOS DMG and publish verified release assets.
- [ ] Protected GitHub Actions checks pass for the release commit.
- [ ] Smoke-test database migration using a copy of an existing Electron database.
- [ ] Smoke-test hook capture and uninstall/reinstall from the packaged app.
- [ ] Smoke-test Linux AppImage and Debian packages produced by CI.

### Apple distribution

- [ ] Install a Developer ID Application certificate in the release keychain.
- [ ] Configure Apple notarization credentials as GitHub Actions secrets.
- [ ] Sign the macOS application with hardened runtime enabled.
- [ ] Notarize and staple the macOS application or DMG.
- [ ] Confirm Gatekeeper accepts the DMG on a clean Mac.
- [ ] Decide whether the unsigned IPA is attached to the GitHub release or kept as a CI artifact.
- [ ] For device distribution, sign the iOS app with an Apple Distribution certificate and provisioning profile, then publish through TestFlight or the App Store.

## GitHub workflow

1. Create a release branch from `main`, for example `release/v0.2.0`.
2. Commit only the migration, documentation, build workflow, and generated Tauri/iOS project files.
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
| macOS Apple silicon and Intel | `Prompt Contribution Graph_0.2.0_universal.dmg` |
| Linux x64 | AppImage |
| Ubuntu/Debian x64 | `.deb` package |
| iOS arm64 | Unsigned `Prompt Contribution Graph.ipa` development artifact |

The locally verified universal DMG is 7.7 MB and has SHA-256 `16a4b035efa9bcced6e9ede544391e22b0a389f122fff23aa12e327b9cd3d11c`. Release checksums must be regenerated from the final tagged build.

## Draft release notes

### Prompt Contribution Graph v0.2.0

This release replaces Electron with Tauri 2, significantly reducing the macOS application package while preserving existing local data and Claude Code hooks.

Highlights:

- Native Tauri desktop builds for macOS and Linux.
- Universal macOS support for Apple silicon and Intel.
- Rust-based SQLite access and low-overhead Claude Code hook capture.
- Automatic compatibility with existing PromptTrail databases and hook settings.
- Private activity sharing based only on aggregate statistics.
- An iOS application target and unsigned IPA build for Apple Developer signing.
- A refined macOS interface that blends into the native window.

Known limitations:

- iOS stores data in its own sandbox and does not run Mac Claude Code hooks.
- iOS sync/import is not included in this release.
- The iOS IPA requires Apple Developer signing before device distribution.

Upgrade note:

The app keeps the legacy `prompttrail` command, data paths, hook marker, and application identifier so existing installations continue to work. A database backup is created before the first schema migration.
