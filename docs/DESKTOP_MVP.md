# VisionHub Desktop MVP — P4 decisions

> Status: P4.0 scope decisions recorded; P4.1 development shell scaffold is in review. This is not a release-ready desktop build.

## Scope decisions (2026-10-13)

- **First release target:** macOS Apple Silicon (arm64). Use the planned self-hosted Apple Silicon Mac runner for platform-specific build and release work. Intel/universal and Windows/Linux packages are not part of the initial release target.
- **Electron:** pin 44.7.0. The official stable release list at https://releases.electronjs.org/ showed 44.7.0 as stable on 2026-10-13, released on October 7, with Chromium 152.0.7977.130 and Node.js 24.21.0. This matches the repository's pinned Node.js 24.21.0 baseline; do not use a floating latest version.
- **Packaging/release direction:** use pinned stable electron-builder v26.17.0 for P4.5, after a fresh compatibility check before install. The required release path is macOS ARM64 DMG/ZIP, Developer ID code signing, Apple notarization/stapling and GitHub Releases publishing from the self-hosted Mac runner. Keep Apple credentials and certificate passwords in GitHub Actions secrets, never in source or renderer configuration. Automatic updates are not part of the initial MVP.
- **API endpoint contract:** configs/desktop.yaml is the default desktop-only configuration. Existing loadDesktopConfig() validates desktop.apiBaseUrl; DESKTOP_API_BASE_URL overrides it and DESKTOP_CONFIG_PATH selects a specific file. The Electron bridge/runtime has not yet wired this contract into the renderer; that is P4.3.
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
- The desktop build generates a dedicated relative-base renderer at apps/desktop/renderer-dist/index.html, separate from the browser Web build. This avoids treating root-relative Web assets as if they were loadable from a file URL. Production API configuration still needs P4.3 and installer/signing workflows are P4.5. Do not treat the current shell as a production release.

## Security/release acceptance still outstanding

- Add a restrictive packaged-renderer Content Security Policy and verify current external fonts/images/media/API needs against it.
- Wire loadDesktopConfig() into the desktop runtime and bridge only the validated endpoint needed by Web.
- Test catalog/search/detail/playback and player lifecycle against a test API, including source failure and progress restore.
- Configure reproducible ARM64 packaging, signatures, notarization/stapling verification, GitHub Release upload and a secret-only signing path on the self-hosted Mac runner.
