# Desktop External Player

This document describes the Electron external-source player behavior, the extension UI behavior ported to desktop, security boundaries, verification, and remaining manual acceptance. It covers the already-merged resume/focus work and the UI-parity change in [PR #56](https://github.com/ninekiss/visionhub/pull/56).

## Scope and source of truth

- The feature is for configured, authorized external source pages used when a catalog item or episode does not have a direct media URL. Direct MP4/HTML5/HLS playback continues to use the existing Plyr/media-adapter path.
- Provider definitions supply a URL template, exact allowed HTTPS origins, player selector, optional readiness selector, and timeout. Catalog metadata selects a configured provider/content ID; it must not supply executable code.
- The browser extension remains under `apps/web/extensions/source-progress/`. This implementation ports the relevant player-only layout, control behavior, and theme to Electron; it does not replace the extension or change the shared Web player.
- Implementation entry points: `apps/desktop/src/external-player.cjs`, `apps/desktop/src/source-player-ui.cjs`, `apps/desktop/src/external-player-preload.cjs`, and `apps/desktop/src/main.cjs`.

## Runtime behavior

### Loading and player readiness

- Keep the native external-player view hidden while its configured player is not ready; show it only after the readiness check succeeds. A selector merely existing in the DOM is not sufficient: the target must be visible and laid out, and a directly selected video must have current frame data and non-zero video dimensions.
- For iframe-backed sources, the top frame uses the configured iframe as a coarse readiness signal; the allowlisted child frame reports media readiness through the DOM-only bridge.
- The existing player panel geometry and native fullscreen flow are retained. Do not add an app-level fullscreen button or CSS intended to force the player to fill unrelated application layout.
- The readiness timeout remains bounded and configurable (60 seconds by default). Source, episode, route, or window changes must clean up the active external-player session.

### Resume and progress reporting

The desktop resume bridge is aligned with the Web extension's source-progress behavior (resume fix merged in [PR #54](https://github.com/ninekiss/visionhub/pull/54)):

- Select the primary visible video by rendered area, using metadata readiness as a tie-breaker when areas are equal.
- Do not begin restoration until duration and media metadata are valid. Ignore a target that is not a meaningful in-video resume point.
- Retry seeking roughly every 400 ms, bounded by 24 attempts and a 15-second maximum restoration window. Consider restoration stable only when the actual current time is within about 3 seconds of the target for 2.5 seconds; this does not rely solely on receiving a `seeked` event.
- Avoid overwriting saved progress with a source player’s temporary initial time while restoration is unresolved. A deliberate user seek interrupts restoration; if the source has already advanced beyond the target, do not force playback backwards.
- For cross-origin iframe video, the child frame performs DOM-only media operations and reports progress/readiness to the parent using the existing session/token message contract. Only configured, exact HTTPS origins are eligible.

### Window focus and intentional pause

- If source playback was active when the desktop window loses focus, the restricted source preload guards against source-page blur/visibility handlers accidentally pausing it and checks playback again after focus returns.
- Explicit pause intent from the player itself must still be honored. Focus recovery must not convert an intentional pause into autoplay.
- The focus guard, progress restoration, and UI helper do not expose Node.js or Electron APIs to source-page scripts.

### Player-only layout

- The UI helper chooses the largest visible video as the primary video, with metadata readiness breaking equal-area ties. It searches known player wrappers (including Plyr, DPlayer, Video.js, JW Player, Artplayer, xgplayer and common custom player containers).
- Player-only mode keeps the player root and its ancestor path visible and marks unrelated sibling subtrees as hidden. It does not delete source DOM nodes or set inline `display:none` on each sibling; source page scripts and custom controls therefore remain in the DOM.
- The script uses marker attributes (`data-vh-sp-active`, `data-vh-sp-hidden`, `data-vh-sp-path`, and `data-vh-sp-root`) and a `MutationObserver` to re-evaluate the player when the page mutates. Existing markers are tracked so the script can refresh without repeatedly rebuilding its state.

### Controls and theme parity

- While playback is running, recognized control bars auto-hide after 1.8 seconds of idle time. Pointer movement/press, touch, keyboard input, or focus activity reveals them. Paused/waiting/seeking states keep controls accessible, and open settings/menu surfaces remain visible.
- Hide only controls confidently identified as fast-forward/rewind or skip actions. Do not hide settings, menus, or the control container just because their text/class contains a broad match.
- Port the extension's Plyr styling: lime accent `#c7f36b`, dark settings menus `#151820`, light control glyphs `#f5f6f8`, dark progress tracks, focused range outlines and active menu-item states.
- This is a best-effort DOM/CSS integration with different source players; controls and selectors can vary between provider sites.

## Security boundaries

- External page navigation is restricted to exact configured HTTPS origins; unexpected navigation and popup/new-window creation are blocked.
- The source view retains `sandbox: true`, `nodeIntegration: false`, `contextIsolation: true`, and `webSecurity: true`. Do not enable Node integration or `nodeIntegrationInSubFrames`.
- The page-side scripts are serialized DOM-only helpers. Do not evaluate provider-supplied JavaScript, expose arbitrary IPC, or pass arbitrary URLs to privileged APIs.
- Cross-frame messages must be bound to the active session/token and expected origins/source window. Only validated progress/readiness events are accepted.
- Do not bypass DRM, authentication, paywalls, anti-embedding protections, or other source access controls; do not add stream extraction or download behavior.
- Player-only mode hides the surrounding page visually but is not a security boundary and must not be treated as one.

## Build and automated verification

Run from the repository root:

```sh
pnpm --filter @visionhub/desktop build
pnpm --filter @visionhub/desktop test
```

The build syntax-checks `src/source-player-ui.cjs` along with the existing main/preload/external-player scripts. Tests cover validated provider URLs and exact HTTPS origin checks, source-player readiness, marker-based isolation, mutation handling, generated script syntax, theme/control logic, iframe bridge behavior, progress restoration boundaries and the restricted preload/security defaults. CI for PR #56 passed typecheck, tests, production build, Compose validation, container builds, and database backup/restore integration.

## Acceptance status and known limitations

Automated validation is green, but it does not prove the UI works identically on every provider:

- Real-provider end-to-end visual acceptance is still required for loading, player-only layout, auto-hide/reveal, menus, identifying skip controls, progress restoration and source switching.
- Verify native fullscreen on an actual configured provider; ensure the player does not acquire an unwanted black strip or become constrained by application layout.
- Sites with strict Content Security Policy may reject the injected `<style>` element; verify styling per provider and choose a compatible injection mechanism if it is blocked.
- Provider DOM changes can invalidate player/control heuristics. Record the tested provider origin and selector set when manual acceptance is performed.
- Windows Electron acceptance does not establish macOS behavior. Packaged macOS ARM64 and packaged-CSP checks remain deferred with P4.5 / desktop packaging.
- Do not describe a provider as manually verified, or claim universal external-source compatibility, until that exact configured source has been tested.

Related records: [desktop MVP](./DESKTOP_MVP.md), [media compatibility](./MEDIA_COMPATIBILITY.md), [implementation plan](./PLAN.md), [PR #54](https://github.com/ninekiss/visionhub/pull/54), [PR #56](https://github.com/ninekiss/visionhub/pull/56).
