# VisionHub Desktop MVP — P4 decisions

> Status (2026-10-13): P4.1–P4.3 foundations are merged via PRs #31/#32. The user verified the live-API/core playback workflow and P4.4 interactive behavior in the Windows Electron runtime on 2026-10-13. macOS-specific native behavior and packaged macOS ARM64 security/acceptance testing remain outstanding. P4.5 (release packaging, signing, notarization, and GitHub Release automation) is intentionally deferred until explicitly reactivated. This is not a release-ready desktop build.

## Scope decisions (2026-10-13)

- **First release target:** macOS Apple Silicon (arm64). Use the planned self-hosted Apple Silicon Mac runner for platform-specific build and release work. Intel/universal and Windows/Linux packages are not part of the initial release target.
- **Electron:** pin 44.7.0. The official stable release list at https://releases.electronjs.org/ showed 44.7.0 as stable on 2026-10-13, released on October 7, with Chromium 152.0.7977.130 and Node.js 24.21.0. This matches the repository's pinned Node.js 24.21.0 baseline; do not use a floating latest version.
- **P4.5 status — deferred:** the user chose to skip release packaging for now and reactivate it only when needed. Do not run packaging, signing, notarization or release-publishing work until explicitly requested.
- **Packaging/release direction for later activation:** use electron-builder v26.17.0 as the current planning baseline, but re-check stable versions and compatibility before work begins. The intended release path is macOS ARM64 DMG/ZIP, Developer ID code signing, Apple notarization/stapling and GitHub Releases publishing from the self-hosted Mac runner. Keep Apple credentials and certificate passwords in GitHub Actions secrets, never in source or renderer configuration. Automatic updates are not part of the initial MVP.
- **API endpoint contract:** configs/desktop.yaml is the default desktop-only configuration. Existing loadDesktopConfig() validates desktop.apiBaseUrl; DESKTOP_API_BASE_URL overrides it and DESKTOP_CONFIG_PATH selects a specific file. The Electron main process loads and validates this contract before registering the packaged renderer protocol. In packaged mode, renderer requests under `/api/v1` are proxied through the main process to this configured endpoint, so the renderer remains same-origin and the API server does not need browser CORS for the custom protocol.
- **Architecture boundary:** Electron is a client only. Keep the NestJS API, existing PostgreSQL service, migrations and Docker deployment separate. The Web app remains independently buildable and deployable and continues to be the shared renderer source.

## Initial playback test candidates

No codec/container support is claimed yet. The following candidate must be tested against the pinned Electron version on macOS ARM64 before it can be marked supported.

| Candidate | Current source | Validation status | P4 acceptance checks |
|---|---|---|---|
| MP4 demo used by existing mock catalog | https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4 | Candidate only; Electron/macOS decode has not been tested in this branch | Load, play, pause, seek, progress restore, buffering/error behavior |
| HLS playlist | Not currently used in the Web mock catalog | Out of initial P4.1 scope; no adapter currently installed | Evaluate in Phase 5 only if the supported playback matrix requires it |
| Local owned test fixture | Not yet committed | Open item for P4.3 playback verification; avoid adding large copyrighted samples to Git | Choose a small redistributable sample and record container/codec/audio details before declaring support |

Plyr is the player UI, not a decoder. Do not promise HEVC, MKV, HDR, subtitle or HLS support without explicit tests on the actual Electron/macOS runtime.

## P4.1 development shell

- apps/desktop/src/main.cjs owns the BrowserWindow lifecycle and loads the local Vite renderer in development.
- apps/desktop/src/preload.cjs exposes only a typed getAppInfo() capability. It does not expose raw ipcRenderer, Node or filesystem APIs.
- apps/desktop/src/security.cjs centralizes secure renderer preferences, loopback development URL validation, exact packaged-file validation and HTTPS-only external links.
- The desktop build generates a separate renderer at `apps/desktop/renderer-dist` with app-root asset paths, leaving the browser Web build unchanged. Packaged content is served only through the secure `visionhub://app` protocol; path traversal and unknown hosts are rejected, and HTML responses carry the CSP. The protocol is used because Electron does not apply `webRequest` response-header CSP injection to `file://` documents. API runtime configuration now comes from `loadDesktopConfig()` with the documented environment overrides. When P4.5 is reactivated, it must copy `configs/desktop.yaml` to `resources/configs/desktop.yaml` and finish installer/signing workflows. Do not treat the current shell as a production release.

## P4.4 native window behavior

The P4.4 foundation adds a platform-aware native application menu, OS-native close/minimize/quit roles, reload and view-zoom/reset/fullscreen actions, and persistence of window bounds/maximized state in the OS user-data directory. Persisted bounds are normalized against current display work areas to avoid restoring a window outside the visible desktop. The state file is written atomically; malformed or missing state falls back to first-launch defaults.

Windows interactive acceptance passed on 2026-10-13 (menu actions/shortcuts, zoom, window-state restoration, narrow-window layout, live API/proxy, renderer resources and Plyr controls). macOS-specific acceptance remains deferred until a Mac is available: verify the macOS application menu, close-last-window/Activate lifecycle, multi-display restoration, and packaged CSP/API behavior. P4.5 installer packaging/signing/notarization remains deferred and must not be started until reactivated.

## Security/release acceptance still outstanding

- Packaged renderer HTML receives a restrictive CSP response header from the `visionhub://app` protocol handler. Unit tests cover script restrictions, resource classes, CSS/media/font MIME types, deep-link refresh, API proxy mapping and path traversal rejection. The renderer uses a same-origin API path; verify fonts/images/media and blocked script injection in an actual packaged Electron run.
- Verify runtime API configuration and same-origin API proxy against a live API in Electron, including API unavailability and invalid-config behavior.
- Test catalog/search/detail/playback and player lifecycle against a test API, including source failure and progress restore.
- **Deferred (P4.5; do not execute until reactivated):** configure reproducible ARM64 packaging, signatures, notarization/stapling verification, GitHub Release upload and a secret-only signing path on the self-hosted Mac runner.
