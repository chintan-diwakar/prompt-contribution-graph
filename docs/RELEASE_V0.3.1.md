# v0.3.1 Release Record

Target: `v0.3.1`

This release updates desktop dependencies. Application behavior is unchanged from v0.3.0.

## Release scope

- Tauri 2.12.1, Tauri CLI 2.12.0, and tauri-build 2.7.1.
- tauri-plugin-opener 2.7.0 and tauri-plugin-single-instance 2.5.2.
- uuid 1.26.1, base64 0.23.1, and rusqlite 0.40.2.
- GitHub Actions `actions/download-artifact` v8 for release asset publishing.
- Universal macOS DMG, Ubuntu/Debian x86-64 package, and x86-64 AppImage.

## Distribution notes

The macOS package remains ad-hoc signed rather than Apple-notarized, so Gatekeeper may warn on first launch. Windows, iPhone, and iPad builds remain outside this release scope.
