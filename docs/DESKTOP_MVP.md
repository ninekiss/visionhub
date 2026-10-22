# VisionHub Desktop MVP — P4 decisions

> Status (2026-10-22): P4.1–P4.4 development-shell foundations and Windows Electron workflow acceptance are recorded. P4.5 is now prioritized for a Windows x64 NSIS installer and packaged-runtime acceptance; no installer has been created yet. macOS-specific native behavior, macOS ARM64 packaging, signing and notarization remain deferred. This is not currently a release-ready desktop build.

## Scope decisions (2026-10-13)

- **First package target:** Windows x64, using an NSIS `.exe` installer. macOS Apple Silicon (arm64) remains deferred; do not configure the Mac packaging/signing runner in this phase. Other architectures/operating systems are outside this first packaging slice.
- **Electron:** pin 44.7.0. The official stable release list at https://releases.electronjs.org/ showed 44.7.0 as stable on 2026-10-13, released on October 7, with Chromium 152.0.7977.130 and Node.js 24.21.0. This matches the repository's pinned Node.js 24.21.0 baseline; do not use a floating latest version.
- **P4.5 status — active for Windows:** implement the Windows x64 installer, resource/config packaging, repeatable CI artifact build and clean-machine acceptance. macOS packaging, Apple code signing/notarization and Mac release automation remain deferred.
- **Windows packaging direction:** use electron-builder v26.17.0 as the planning baseline only, and re-check the current stable release/compatibility when implementation begins. Add an exact dependency version, an NSIS Windows x64 installer, a repeatable Windows CI artifact job, versioned app identity/icon/output settings, and clean-machine install/uninstall tests. Ship editable runtime configuration without credentials; the packaged `desktop.apiBaseUrl` must be deliberately set to the intended deployment endpoint rather than accidentally retaining the development loopback address. Before public distribution, configure Windows Authenticode signing using CI secrets; an unsigned internal validation build may precede signing. Automatic updates are not part of the initial MVP.
- **API endpoint contract:** configs/desktop.yaml is the default desktop-only configuration. Existing loadDesktopConfig() validates desktop.apiBaseUrl; DESKTOP_API_BASE_URL overrides it and DESKTOP_CONFIG_PATH selects a specific file. The Electron main process loads and validates this contract before registering the packaged renderer protocol. In packaged mode, renderer requests under `/api/v1` are proxied through the main process to this configured endpoint, so the renderer remains same-origin and the API server does not need browser CORS for the custom protocol.
- **Architecture boundary:** Electron is a client only. Keep the NestJS API, existing PostgreSQL service, migrations and Docker deployment separate. The Web app remains independently buildable and deployable and continues to be the shared renderer source.

## Initial playback test candidates

No codec/container support is claimed beyond the existing Web and Windows Electron development acceptance. The following candidates must be checked in the packaged Windows x64 runtime first; macOS ARM64 testing is deferred.

| Candidate | Current source | Validation status | P4 acceptance checks |
|---|---|---|---|
| Existing catalog MP4 demo | https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4 | Playback and controls were user-accepted in Web and Windows Electron on 2026-10-13; exact codecs were not independently recorded; macOS remains untested | Retest source switching, seek/resume and error handling; do not infer support for every MP4 codec |
| Redistributable MP4 smoke fixture | https://raw.githubusercontent.com/bower-media-samples/big-buck-bunny-480p-30s/master/video.mp4 | CC BY 3.0 sample; newly added to the P5.4 matrix, manual playback verification pending | Verify real playback in Web and Windows Electron; record actual codecs, seek/resume and failure behavior |
| HLS playlist | `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8` | HLS playback/lifecycle and P5.3 Auto/manual quality switching user-accepted in Web and Windows Electron on 2026-10-13; exact codecs are not asserted | Regression check source switching, seek, pause/resume and cleanup; remote test stream availability/content may change |

Plyr is the player UI, not a decoder. Do not promise HEVC, MKV, HDR or subtitle support without explicit tests on the actual target runtime. HLS playback and P5.3 manual quality selection passed Web and Windows Electron acceptance; quality selection applies only to multi-rendition HLS streams handled by hls.js, not native HLS or single-file MP4 sources. The redistributable test fixture, codec-level matrix and error acceptance procedure are tracked in [`MEDIA_COMPATIBILITY.md`](./MEDIA_COMPATIBILITY.md).

## P4.1 development shell

- apps/desktop/src/main.cjs owns the BrowserWindow lifecycle and loads the local Vite renderer in development.
- apps/desktop/src/preload.cjs exposes only a typed getAppInfo() capability. It does not expose raw ipcRenderer, Node or filesystem APIs.
- apps/desktop/src/security.cjs centralizes secure renderer preferences, loopback development URL validation, exact packaged-file validation and HTTPS-only external links.
- The desktop build generates a separate renderer at `apps/desktop/renderer-dist` with app-root asset paths, leaving the browser Web build unchanged. Packaged content is served only through the secure `visionhub://app` protocol; path traversal and unknown hosts are rejected, and HTML responses carry the CSP. The protocol is used because Electron does not apply `webRequest` response-header CSP injection to `file://` documents. API runtime configuration now comes from `loadDesktopConfig()` with the documented environment overrides. P4.5 must copy both `configs/desktop.yaml` and `configs/playback-sources.yaml` into `resources/configs/`, validate the installed config lookup, and establish how the deployment API endpoint is set before an installer is distributed. Do not treat the current shell as a production release.

## P4.4 native window behavior

The P4.4 foundation adds a platform-aware native application menu, OS-native close/minimize/quit roles, reload and view-zoom/reset/fullscreen actions, and persistence of window bounds/maximized state in the OS user-data directory. Persisted bounds are normalized against current display work areas to avoid restoring a window outside the visible desktop. The state file is written atomically; malformed or missing state falls back to first-launch defaults.

Windows interactive acceptance passed on 2026-10-13 (menu actions/shortcuts, zoom, window-state restoration, narrow-window layout, live API/proxy, renderer resources and Plyr controls). Windows packaged acceptance is not yet complete and is the current P4.5 priority. macOS-specific acceptance remains deferred: verify the macOS application menu, close-last-window/Activate lifecycle, multi-display restoration, and packaged CSP/API behavior in a future Mac phase.

## Security/release acceptance still outstanding

- Packaged renderer HTML receives a restrictive CSP response header from the `visionhub://app` protocol handler. Unit tests cover script restrictions, resource classes, CSS/media/font MIME types, deep-link refresh, API proxy mapping and path traversal rejection. The renderer uses a same-origin API path; verify fonts/images/media and blocked script injection in an actual packaged Electron run.
- The CSP allows HTTPS `connect-src` requests so HLS.js can load manifests and media segments hosted on external HTTPS origins. Script sources remain self-only; remote HTTP stream origins are not globally enabled. Actual packaged macOS security acceptance remains outstanding.
- Verify runtime API configuration and same-origin API proxy against a live API in Electron, including API unavailability and invalid-config behavior.
- Test catalog/search/detail/playback and player lifecycle against a test API, including source failure and progress restore.
- **Deferred — macOS only:** build the macOS ARM64 DMG/ZIP, configure Apple Developer ID signing and notarization/stapling, and add Mac-runner release automation. These tasks remain outside the current Windows-first P4.5 scope.
