# VisionHub Development Plan

> Status date: 2026-10-22  
> Repository: [ninekiss/visionhub](https://github.com/ninekiss/visionhub)  
> Scope: retain the first-class Web client while evolving the shared foundation and adding an Electron desktop client  
> This document is a roadmap and current-state assessment. It does not claim that future-phase work is already implemented.

## 1. Product and architecture direction

VisionHub is intended to become a desktop-first media browsing and playback application with a reusable React UI, a NestJS API, a Plyr-based player, optional background processing, and configuration-driven deployment.

Core constraints:

1. Use stable versions and verify compatibility before upgrades. Do not upgrade solely to maximize version numbers.
2. Reuse the existing PostgreSQL service by default. The Compose PostgreSQL service is opt-in only, never replaces an existing service, and never starts or migrates automatically.
3. Keep operational configuration outside business code. Validate required configuration at startup and fail with an actionable error rather than silently accepting malformed configuration.
4. Keep Plyr as the player UI. Add protocol adapters such as HTML5 and HLS as needed; do not treat Plyr as a video decoder.
5. Keep Web as a first-class, independently deployable client. Electron is an additional client, never a replacement for Web.
6. Keep shared contracts, UI, features and configuration reusable across both clients; prevent their workflows from drifting.
7. Prefer incremental, testable changes. Preserve working features and avoid broad rewrites without a migration need.

## 2. Current state snapshot

The following status is based on the repository code and lockfile on 2026-10-14.

| Area | Current state | Status against target |
|---|---|---|
| Web application | React + Vite + TypeScript; catalog browse, details, playback pages | Implemented foundation |
| Admin UI | Dashboard, catalog editor, episodes and category management; admin session API | Implemented foundation |
| Styling | Tailwind CSS 4.3.3, shared `packages/ui` tokens/primitives, and completed planned Phase 3 migration slices | Phase 3 browser regression sign-off recorded on 2026-10-13; feature-specific CSS remains where it serves page/player-specific behavior |
| API | NestJS 12.1.2; catalog and admin routes | Implemented foundation |
| Database | Prisma 7.10.0 and PostgreSQL; data lives in the separate `visionhub` schema | Implemented foundation |
| Database connectivity | Use a direct database host/IP or join an existing Docker data network; an optional Compose PostgreSQL service is available only through an explicit overlay | Multiple connection modes; no external network is required for a directly reachable address |
| Data changes | Explicit migration and seed commands; no migration on ordinary API startup | Aligned with safety constraint |
| Runtime baseline | Node.js 24.21.0 is pinned in `.nvmrc`, CI and Docker build stages; package engine requires `>=24.21.0 <25` | Verified in CI; aligned |
| Package manager | pnpm 12.11.2 with a committed lockfile | Implemented; retain reproducible installs |
| Configuration | `@visionhub/config` centralizes YAML/env loading, precedence and Zod validation; desktop has an independent config file | Phase 2 implemented; CI and both Docker builds passed |
| Secrets | Deployment credentials are passed through environment variables; no committed secret file | Partially aligned; clarify loading and validation |
| Player | Plyr 3.8.5 wrapper, playback status/progress, client-local volume/speed preferences, hls.js multi-rendition quality selection, and configured external-source playback | Direct MP4/HLS and P5.3 behavior were accepted in Web and Windows Electron; external-source implementation across PRs #41, #43, #45 and #46 is merged with CI passing. Real-provider end-to-end acceptance remains pending because the example provider list is intentionally empty until an authorized source is configured |
| HLS | hls.js 1.7.3 adapter with bounded network/media recovery and cleanup; playback and P5.3 quality switching manually accepted in Web and Windows Electron | Implemented for the tested source; do not infer support for untested media/container combinations |
| Desktop | `apps/desktop` provides the Electron main/preload shell and reuses the Web renderer | Windows Electron development workflow acceptance passed; Windows x64 installer packaging is now the P4.5 priority but is not implemented yet; macOS packaging remains deferred |
| Shared packages | `packages/contracts`, `packages/config`, and `packages/ui` provide shared API contracts, validated config, tokens and React primitives | Shared UI foundation and planned Phase 3 migration slices implemented; Web remains first-class |
| Worker/downloads | No background worker or download task pipeline | Not started; optional later phase |
| CI | Frozen install, Prisma validation, type checks, config/catalog unit tests, production build and both Docker image builds | Passed on Node.js 24.21.0 |

The current implementation is useful and should be retained. It is a browser-based product foundation, not yet the complete Electron desktop application described by the target architecture. The Web product remains supported after desktop ships; the target is shared implementation and synchronized feature behavior, not a forced replacement or a second divergent UI codebase.

## 3. Version baseline and upgrade policy

### 3.1 Versions currently resolved by the lockfile

| Dependency | Current resolved version / baseline |
|---|---:|
| Node.js in CI and Docker images | 24.21.0; repository engine range is `>=24.21.0 <25` |
| pnpm | 12.11.2 |
| React / React DOM | 19.3.0 |
| Vite | 8.3.4 |
| TypeScript | 7.0.2 |
| Tailwind CSS / PostCSS integration | 4.3.3 |
| Plyr | 3.8.5 |
| NestJS packages | 12.1.2 |
| Prisma ORM / Prisma Client / PostgreSQL adapter | 7.10.0 |
| Zod | 4.6.6 in `packages/config` |
| Electron | 44.7.0 pinned in `apps/desktop`; Windows x64 is the first planned packaged target; macOS ARM64 package work remains deferred |
| hls.js | 1.7.3 pinned; HLS adapter manually accepted in Web and Windows Electron |

### 3.2 Target baseline

- Node.js: 24.21.0 LTS selected as the verified maintenance baseline for this implementation; update deliberately after checking official release notes.
- Electron: pin 44.7.0 after verifying the [official stable release list](https://releases.electronjs.org/) on 2026-10-13. It ships Chromium 152.0.7977.130 and Node.js 24.21.0, matching the repository's pinned Node runtime.
- React: 19.3.0 baseline.
- Vite: 8.3.4 baseline.
- TypeScript: 7.0.2 baseline; validate the entire build, test, lint and plugin chain.
- Tailwind CSS: 4.3.3 baseline.
- Plyr: keep the current compatible 3.8.x release line; currently locked to 3.8.5.
- NestJS: keep the stable 12.x line after compatibility validation.
- Prisma: retain 7.10.0 until a later major is stable and its migration path is verified.
- Add Zod for configuration schemas.
- Keep hls.js pinned to the tested 1.7.3 release until an intentional compatibility review; it is used by the Phase 5 HLS adapter.

The versions above are planning baselines, not a promise that each number will remain the latest stable release forever. Before upgrading, check official release information, lock exact dependency versions using the chosen repository policy, regenerate the lockfile intentionally, and run validation, type checks, tests and production builds. Avoid relying on `latest` as the only version policy.

## 4. Target repository structure

Evolve toward the following structure in small steps:

```text
visionhub/
├── apps/
│   ├── desktop/              # Electron main process, preload and React renderer
│   ├── web/                  # First-class browser client; stays independently buildable/deployable
│   ├── api/                  # NestJS API
│   └── worker/               # Optional background jobs, introduced only when needed
├── packages/
│   ├── ui/                   # Shared React UI primitives and design tokens
│   ├── contracts/            # API/domain contracts shared by web, desktop and API
│   └── config/               # YAML/env loading, merge rules and Zod schemas
├── configs/
│   ├── app.defaults.yaml     # Committed non-secret shared defaults
│   ├── app.yaml              # Optional local override; ignored by Git
│   ├── app.development.yaml  # Development overrides
│   ├── app.production.yaml   # Production overrides
│   ├── secrets.yaml          # Optional secret file; never committed
│   └── desktop.yaml          # Desktop API endpoint; independent of API settings
├── infra/
│   ├── compose.yaml          # Default Web/API services, no database or published API port
│   ├── compose.database.yaml # Opt-in local PostgreSQL service
│   ├── compose.existing-db-network.yaml # Opt-in existing PostgreSQL network
│   └── compose.api-published.yaml # Opt-in host API port for local access
├── .gitignore
├── pnpm-workspace.yaml
└── README.md
```

Migration principles:

- Move `contracts/` to `packages/contracts/` only with a coordinated import and workspace update; do not leave multiple conflicting sources of truth.
- Extract UI components when they are truly shared, rather than creating a UI package that only wraps one-off page markup.
- Keep `apps/web` as a permanent, independently buildable and deployable first-class client; adding Electron must not remove or downgrade Web.
- Keep shared React screens, UI primitives, domain workflows and API contracts in one maintained source where practical. Extract shared code into `packages/ui` and feature packages rather than copy/pasting Web pages into desktop.
- For changes to shared flows, verify Web and desktop behavior against the same acceptance criteria. Platform-specific capabilities must sit behind adapters so shared screens stay aligned without forcing platform-specific code into the browser.
- Keep Web and desktop releases independently deployable, while maintaining feature parity for agreed common workflows. Web-only or desktop-only capabilities must be intentional and documented.
- Keep environment-specific files and secrets out of the source code. Secret files must be ignored by Git, mounted read-only if used, and never logged.
- The optional worker is not a prerequisite for the first desktop release.

## 5. Configuration design

### 5.1 Responsibilities

| File / mechanism | Responsibility |
|---|---|
| `configs/app.defaults.yaml` | Committed non-secret shared defaults |
| `configs/app.yaml` | Optional local override; ignored by Git and Docker build context |
| `configs/app.production.yaml` | Production-only overrides |
| `configs/secrets.yaml` | Optional local secret source; ignored by Git |
| `configs/desktop.yaml` | Desktop API base URL; validated independently from API settings |
| Environment variables / deployment secrets | Override or supply secrets without committing them |
| `packages/config` | Load, merge, validate and type resolved configuration |
| `infra/compose.yaml` | Container topology, mounts, port binding, restart policy and networks |

### 5.2 Required behavior

1. Load configuration in a deterministic order: defaults → common YAML → environment-specific YAML → environment variables / deployment secrets.
2. Validate the final configuration with Zod before starting a service.
3. Fail startup when a required value is missing or invalid; report the field name and remediation without printing secret values.
4. Keep API port, browser API base URL, desktop API base URL, database URL, media locations and request limits out of hard-coded business logic wherever they are operational settings.
5. Test the configuration package independently and test the API startup path with missing, malformed and valid configuration.
6. Do not silently fall back to a default configuration in production if an explicitly selected configuration file cannot be read.

The existing environment-specific YAML files and `.env.example` are a starting point, not the final shared configuration system.

## 6. Deployment and existing database boundary

Deployment defaults to using the existing PostgreSQL instance. Database connectivity is configurable for every application environment, with three supported deployment choices:

- Direct connection: set `DATABASE_URL` for a host process and optionally `DATABASE_URL_DOCKER` for a different address reachable from the API container. A direct IP/hostname does not need a Docker network overlay.
- Existing database network: include `infra/compose.existing-db-network.yaml` only when the database hostname is resolvable exclusively on an already-existing Docker network.
- Optional Compose database: include `infra/compose.database.yaml` explicitly to run the local PostgreSQL service with a named data volume. The default Compose configuration must never start this service.

Other deployment constraints:

- The base `infra/compose.yaml` contains Web and API only. It publishes Web and keeps the API internal by default.
- Bind public traffic to the Web/Nginx reverse proxy. If host-side API access is needed, use `infra/compose.api-published.yaml`, which binds only to loopback.
- Database migrations remain explicit deploy steps. Never run schema changes automatically on ordinary API startup or as a side effect of `docker compose up`.
- Keep all schema changes scoped to `visionhub`; do not modify unrelated schemas or tables.
- Use read-only configuration mounts where appropriate and inject credentials through environment variables or deployment secrets.
- Keep Compose paths, database URL behavior and operating procedures aligned across local development, tests, and production.

Acceptance criteria:

- Each Compose overlay passes `docker compose config` validation in CI.
- Default Compose does not publish the API port or start a PostgreSQL service.
- A direct host/IP connection works without an external Docker network; joining an existing network is an explicit alternative.
- A Compose-managed PostgreSQL service starts only when the database overlay is selected and persists data in a named volume.
- No production migration runs during container boot.
- A schema-scoped backup, deployment and rollback procedure is documented and tested against a disposable database before claiming full deployment acceptance.

## 7. Player architecture

Keep Plyr as the UI and retain the existing working player during refactoring.

Target layout:

```text
apps/desktop/src/features/player/
├── components/
│   ├── VideoPlayer.tsx
│   ├── PlayerControls.tsx
│   └── SubtitleSelector.tsx
├── adapters/
│   ├── html5.adapter.ts
│   └── hls.adapter.ts
├── hooks/
│   ├── usePlaybackProgress.ts
│   └── usePlayerSettings.ts
└── types.ts
```

Implementation rules:

- HTML5 video remains the first adapter for browser/Electron Chromium-supported formats.
- Add hls.js for HLS playback where native playback is unavailable; use the native path when it is supported and appropriate.
- Plyr provides the player UI, not a universal decoder.
- Test actual media files and target Electron/Chromium builds before claiming support for MKV, HEVC, HDR, unusual subtitles or other codec/container combinations.
- Keep playback progress and user settings behind hooks/services so they can be reused by web and desktop.
- Test source changes, cleanup/disposal, buffering/error states, seeking, progress restoration and unsupported media behavior.

## 8. Phased execution plan

### Phase 0 — Stabilize the existing baseline

Status: core baseline complete. Browser-based player interaction tests are intentionally deferred to the player-adapter phase, where they can target the final shared player implementation.

Tasks:
- [x] Preserve the current browse, details, playback, playback history, admin and database behaviors while adding baseline checks.
- [x] Replace broad `latest` direct dependency declarations with exact versions matching the current lockfile; align lockfile importer specifiers.
- [x] Add Node built-in unit tests for development/production configuration loading and catalog episode API behavior without requiring a live database.
- [x] Run frozen install, Prisma validation, type checks, unit tests and production builds in CI.
- [x] Build both API and Web Docker images in CI.

Exit criteria:
- [x] CI is green from a clean checkout.
- [x] Supported local development and Compose startup commands are documented and repeatable.
- [x] Existing database data remains untouched by ordinary startup.

### Phase 1 — Runtime and dependency baseline

Status: complete for the current Web/API foundation; future runtime updates must follow the same verification gates.

Tasks:
- [x] Move CI and both Docker build stages from Node 22 to Node 24 LTS; pin Node.js 24.21.0 in CI, Docker and `.nvmrc`.
- [x] Confirm pnpm 12.11.2 and Prisma 7.10.0 compatibility with the selected Node release through CI.
- [x] Replace broad `latest` direct dependency declarations with exact versions matching the current lockfile and verify frozen installation.
- [x] Validate Vite, TypeScript 7 and NestJS with CI type checks and production builds.
- [x] Build both Docker images and document the tested Node/pnpm versions and test commands.

Exit criteria:
- [x] CI, API Docker and Web Docker build on the Node 24.21.0 baseline.
- [x] Prisma validation, type checks, unit tests and production builds pass.
- [x] The lockfile and exact manifest versions provide reproducible installation.

### Phase 2 — Shared configuration and contracts

Status: complete and merged into `main` via [PR #1](https://github.com/ninekiss/visionhub/pull/1) on 2026-10-12. CI run 53 passed, including both application Docker builds.

Tasks:
- [x] Create `packages/config` with deterministic YAML/env precedence, recursive object merge and Zod schemas.
- [x] Route API runtime config through the shared package and fail startup on missing/invalid required settings.
- [x] Add independent `configs/desktop.yaml` loading and validate the Electron API URL without changing Web/API settings.
- [x] Move catalog types to `packages/contracts` and wire both Web and API to the workspace package.
- [x] Ignore local secret files and document precedence, variable mapping and secret handling.
- [x] Add config tests for precedence, missing files, invalid database/admin values and desktop endpoint overrides.
- [x] CI run 53 passed frozen install, Prisma validation, type checks, unit tests, production builds and both Docker builds.

Exit criteria:
- [x] Invalid or missing required config fails with a field-specific message that omits secret values.
- [x] Web and API reference one maintained contracts package.
- [x] Secret file paths are ignored, and config validation does not print secret values.
- [x] CI and both application Docker images pass with the new workspace layout.
- [x] No database service was added, and migrations remain explicit commands.

### Phase 3 — Public UI package and Tailwind migration

Status: complete for the planned shared UI migration and the user-confirmed P3 browser regression scope (2026-10-13). The current closeout verifies long detail text/layout, Admin catalog pagination loading stability, and Plyr custom controls in development. Feature-specific CSS remains intentional where it owns specialized layout or player behavior. See `docs/UI.md` for the acceptance record and its evidence limits.

Tasks:
- [x] Establish shared semantic tokens and reusable Button, Field, Message, Badge and Panel primitives in `packages/ui`.
- [x] Add shared NavigationItem, SearchField, SelectControl, TextInput, TextAreaControl, ChoiceChip, table primitives, IconButton and PaginationBar.
- [x] Add compact/surface button and pill-chip variants for the public catalog without changing the admin defaults.
- [x] Make Tailwind CSS v4 scan the shared UI package and use utility classes for migrated primitives.
- [x] Migrate admin buttons, field labels, feedback messages, media badges, navigation, catalog filters, catalog table, pagination, form inputs and category chips.
- [x] Migrate the Web catalog category filters and pagination buttons to shared primitives; keep hero, media cards and Plyr layout feature-specific.
- [x] Migrate the Web top navigation links and search field to shared navigation/search variants while preserving mobile collapse and route semantics.
- [x] Migrate the Web Hero play/details actions to shared Button variants; keep the Hero layout and media artwork feature-specific.
- [x] Add a shared `MediaCard` component for both the public catalog and related-content sections; migrate card layout, metadata, hover zoom, numbering and play affordance to Tailwind utilities while retaining the poster gradient as specialized CSS.
- [x] Remove legacy CSS rules that duplicated the styling now owned by shared Tailwind primitives.
- [x] Add a shared accessible `ConfirmDialog` with dialog semantics, Escape-to-cancel, focus containment/restoration and busy-state handling; replace native confirms for item, episode and category deletion.
- [x] Migrate detail-page episode cards and continue-watching history cards to Tailwind utilities; keep the poster gradient and Plyr-specific player internals in feature CSS.
- [x] Migrate playback-page back/details actions, episode rows and previous/next controls to shared Button/Tailwind utilities while preserving episode routing and disabled-state logic.
- [x] Migrate detail-page and player not-found return-to-catalog actions to shared Button variants while preserving route behavior.
- [x] Migrate the catalog reset/return action to the shared ghost Button and remove its duplicated legacy CSS.
- [x] Remove unused pre-migration watch-sidebar and episode-row CSS after confirming those classes are no longer present in the public Web source.
- [x] Migrate admin item-editor and episode-manager back actions to shared Button variants and remove duplicated legacy CSS.
- [x] Ensure shared sidebar navigation links keep accessible names and titles when the admin sidebar collapses to icon-only mode.
- [x] Restore a keyboard-accessible expandable search field on mobile, where the previous responsive CSS hid the input without providing a way to reveal it.
- [x] Restore access to primary discovery/library/series navigation on mobile via an accessible collapsible menu.
- [x] Keep keyboard focus predictable for mobile navigation/search: focus the first nav link on open and restore focus to the trigger on Escape/close.
- [x] Expose the selected state of admin media-type choice buttons to assistive technology.
- [x] Standardize admin icon-only actions for logout, edit, episode management and delete flows on the shared IconButton primitive.
- [x] Remove the inert public-header notification button because no notification behavior or backend exists yet.
- [x] Add live announcements for player loading and no-source states, and alert semantics for missing content and playback request errors.
- [x] Complete the user-confirmed P3 browser regression pass: bound long detail titles/descriptions, stable Admin catalog pagination loading, and custom Plyr controls in development (2026-10-13); keep future interaction review incremental.
- [x] Keep Plyr styles and complex player-specific styling in feature CSS during the incremental migration.

Exit criteria:
- [x] New shared primitive work follows the shared component and Tailwind conventions.
- [x] Duplicate styling for migrated admin navigation, filters, table cells, basic form controls, public category chips, pagination, catalog/related cards, episode cards, continue-watching cards and playback navigation controls is removed from legacy CSS.
- [x] User confirmed P3 UI browser verification passed on 2026-10-13; documented the confirmed regression cases in `docs/UI.md` without inventing per-viewport results.
- [x] Latest `main` CI passed after the fixes, and no regression was reported in the user-confirmed P3 browser test scope.

### Phase 4 — Electron desktop MVP

Status: P4.0–P4.3 foundations are merged via [PR #31](https://github.com/ninekiss/visionhub/pull/31) and [PR #32](https://github.com/ninekiss/visionhub/pull/32); development-mode Windows workflow acceptance is recorded. P4.5 is now prioritized for a Windows x64 installer and packaged-runtime acceptance. macOS-specific native verification and macOS ARM64 packaging/signing/notarization remain deferred.

#### Product goal

Deliver a small, secure desktop shell that reuses the existing React screens, shared UI, API contracts and remote NestJS API. The first release should support the core media-library workflow and playback formats already verified in the current Plyr/Web implementation. It must not imply broader codec support than the Electron Chromium runtime can actually play.

#### P4.0 — Confirm scope and compatibility

- [x] Set Windows x64 as the first packaged target; prioritize a Windows installer and packaged-runtime acceptance. Keep macOS Apple Silicon (`arm64`) packaging, signing and notarization deferred.
- [x] Pin Electron 44.7.0, the official stable release verified on 2026-10-13; its embedded Node.js 24.21.0 matches the repository runtime baseline. Do not use a floating `latest`.
- [x] Record the current public MP4 mock URL as a playback-test candidate and explicitly mark codec/container support unverified until tested in the packaged Windows x64 Electron runtime; macOS ARM64 playback verification remains deferred. See `docs/DESKTOP_MVP.md`.
- [x] Define the desktop endpoint contract and load it via `loadDesktopConfig()` in the Electron main process. `DESKTOP_API_BASE_URL` overrides the endpoint; `DESKTOP_CONFIG_PATH` selects a config file. Packaged `/api/v1` requests are proxied through the configured endpoint and stay same-origin in the renderer.

Deliverable: target OS, exact Electron version, initial media-test candidate/known limitations, and the validated desktop configuration contract are recorded in `docs/DESKTOP_MVP.md`.

Deliverable: a short compatibility decision in the PR description or docs, including the chosen OS target(s), Electron version and API configuration approach.

#### P4.1 — Add the minimal Electron workspace

- [x] Create `apps/desktop` with the Electron main process, a sandboxed preload bridge, URL/security helpers and tests; leave `apps/web` as the same renderer.
- [x] Add workspace commands for Electron development (`pnpm dev:desktop`), shell checks, and security tests. Packaging commands are intentionally deferred to P4.5.
- [x] Reuse the existing `apps/web` React/Vite renderer instead of duplicating screens or contracts.
- [x] Load a loopback Vite server in development and build a dedicated renderer into `apps/desktop/renderer-dist` with app-root asset paths; serve packaged assets through `visionhub://app` so CSP response headers are honored, while keeping the browser Web build unchanged.
- [x] Keep API and database services separate. Electron is a client and does not bundle or start the NestJS API, PostgreSQL, or migrations.

Deliverable: the development Electron window opens the existing Web renderer on its own Vite port, while Web remains independently buildable. The app is a development scaffold, not yet a production-ready desktop release.

#### P4.2 — Establish the security boundary

- [x] Set `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and `webSecurity: true` in the Electron renderer preferences.
- [x] Expose only a narrow, typed `getAppInfo()` method through preload; never expose raw `ipcRenderer`, arbitrary Node APIs, filesystem access or unrestricted shell execution.
- [x] Validate the sender URL for the single IPC handler; the handler accepts no renderer payload arguments.
- [x] Block unexpected navigation and all new windows; only validated HTTPS URLs may be handed to the operating system.
- [x] Serve packaged renderer assets through `visionhub://app`; attach CSP to HTML, reject traversal/unknown hosts, and verify resource MIME types and that the built Plyr/player CSS asset exists.
- [ ] Verify CSP behavior, API proxying, configuration-resource loading and navigation restrictions in the packaged Windows x64 application. macOS-specific packaged CSP verification remains deferred.
- [x] Keep secrets out of renderer bundles and source; API endpoint configuration remains separate from credentials.

Deliverable: a documented threat-boundary review and automated or repeatable checks for the chosen Electron security defaults.

#### P4.3 — Reuse the core media workflow

- [ ] Reuse the existing catalog, search/filter, detail, login/admin route behavior and shared UI wherever applicable; do not duplicate domain logic or API contracts.
- [x] Load the validated desktop API endpoint via `loadDesktopConfig()` (`configs/desktop.yaml`), with `DESKTOP_API_BASE_URL` and `DESKTOP_CONFIG_PATH` overrides; fail with a clear error rather than silently choosing a fallback.
- [x] Verify catalog browsing, search/filter, details and playback against a live test API in the Windows Electron runtime (user acceptance, 2026-10-13); login/admin remains conditional on configured scope.
- [x] Verify Plyr controls and the tested playback workflow on Windows Electron, including loading, buffering/error handling, seeking and playback state (user acceptance, 2026-10-13). This does not establish macOS decoder behavior or support for untested formats such as MKV/HEVC/HLS.
- [ ] Keep browser-only behavior functional and buildable. Put platform-specific operations behind a small adapter instead of branching shared components throughout the UI.

Deliverable: the core browse → detail → play workflow works in a desktop build without a second implementation of the Web UI.

#### P4.4 — Add desktop-native behavior selectively

- [x] Add a minimal platform-aware application menu with native close/minimize/quit roles and view zoom/reset/fullscreen actions; retain standard operating-system shortcuts.
- [x] Persist window size/position and maximized state in the OS user-data directory using atomic writes; validate saved bounds and clamp them to a connected display work area.
- [x] Keep close/minimize behavior OS-native: minimizing does not quit the app, closing the final window follows the existing platform lifecycle, and macOS can reopen a window through Activate. Do not add tray residency, auto-start, global shortcuts or background services without a concrete requirement.
- [x] Verify the interactive Electron workflow on Windows: menu actions/shortcuts, zoom, window-state restoration and narrow-window layout (user acceptance, 2026-10-13).
- [ ] Verify macOS-specific native menu behavior, closing/reopening the last window, display restoration and focus behavior on an actual macOS runtime (deferred; macOS acceptance has not been performed).
- [x] Keep settings limited to the existing desktop API configuration and basic window behavior; do not introduce a second configuration UI without a concrete requirement.

Deliverable: predictable desktop window lifecycle and basic native integration, with no unrelated background features.

#### P4.5 — Windows-first packaging and packaged-runtime acceptance (ACTIVE)

Decision updated 2026-10-22: prioritize a Windows x64 desktop installer. This activates the Windows packaging plan only; macOS Apple Silicon packaging, code signing, notarization, and macOS-specific release automation remain deferred. The current Electron shell is not yet a distributable installer, so these tasks must be completed before claiming a Windows package is available.

- [x] Record Windows x64 as the first packaged target; retain macOS ARM64 as a later, explicitly deferred target.
- [ ] Re-check the stable `electron-builder` release and compatibility with pinned Electron 44.7.0, then add an exact dependency version rather than a floating `latest`.
- [ ] Add a reproducible Windows x64 packaging command and configure an NSIS `.exe` installer, application ID/name/version, icons, file inclusion, artifact output and install/uninstall behavior.
- [ ] Ensure the packaged main process, `@visionhub/config`, YAML/Zod runtime dependencies, preloads and renderer assets are included and load correctly from the installed application.
- [ ] Copy `configs/desktop.yaml` and `configs/playback-sources.yaml` to `resources/configs/` in the installer. Define how the production `desktop.apiBaseUrl` is supplied or edited; do not publish a distributable installer that silently points to `127.0.0.1:3001` by accident. Keep credentials out of the package.
- [ ] Add a Windows GitHub Actions packaging job (or equivalent repeatable Windows runner process) and upload the installer as a build artifact. Keep packaging separate from the existing cross-platform typecheck/test/build checks.
- [ ] Test install, launch, upgrade/reinstall and uninstall on a clean Windows environment; verify valid/invalid API config, remote API reachability, API-unavailable errors, catalog/search/detail/playback, source switching, progress restore, external-player focus behavior, fullscreen, external-link policy and CSP.
- [ ] Verify that the installer uses only explicitly configured API/provider origins and that the default empty provider list does not imply a ready-to-use source site.
- [ ] Document the installed config location, log/debug entry points, how to change the API endpoint, supported test media and known limitations.
- [ ] Decide and configure Windows Authenticode signing before public distribution. For initial internal validation, an unsigned installer may be used if Windows SmartScreen warnings are documented; signing credentials must be stored only in CI secrets.
- [ ] Keep macOS ARM64 DMG/ZIP, Apple Developer ID signing, notarization/stapling and a self-hosted Mac release runner out of this phase. Re-plan them separately when macOS is reactivated.
- Keep automatic updates out of scope for the first MVP unless a separate product requirement is approved.

Deliverable: a reproducible installable Windows x64 package, successful clean-machine manual acceptance, and a documented API configuration path. This does not imply macOS readiness.

#### Explicitly out of scope for P4

- [ ] Do not remove, bundle into Electron-only workflows, or stop independently deploying Web.
- [ ] Do not add a worker, download manager, FFmpeg pipeline, or Redis; any optional PostgreSQL container belongs to Phase 6 and must stay opt-in.
- [ ] Do not run database migrations automatically from Electron or ordinary API startup.
- [ ] Do not promise MKV/HEVC/HDR/subtitle or other codec/container support without tests on the actual target runtime.
- [ ] Do not make HLS.js, subtitle preferences, or broad player refactoring a blocker for the desktop shell; track those under Phase 5 unless an agreed MVP acceptance test requires them.
- [ ] Do not implement auto-update, telemetry, tray mode or global hotkeys by default.

#### Phase 4 exit criteria

P4.5 is active for Windows x64 packaging. Keep the packaged-install exit criteria unchecked until the installer and clean-machine acceptance tasks above pass; macOS criteria remain deferred.

- [x] Phase 3 browser regression sign-off is recorded in `docs/UI.md` before desktop implementation begins (2026-10-13).
- [ ] Web and desktop have independent, documented development and production build paths.
- [ ] A packaged application launches on each agreed target OS and reads the configured API endpoint without hard-coded deployment URLs.
- [ ] Catalog/search, details and supported playback work against a test API; login/admin flows are verified if included in the agreed desktop MVP scope.
- [ ] Electron security defaults and navigation/IPC boundaries are reviewed; the renderer cannot access arbitrary Node APIs.
- [ ] Core playback loading, error, buffering, source switching and progress restoration behavior is verified for the supported sample media.
- [ ] No database service, worker, secret credential or automatic migration was introduced as a side effect of desktop packaging.
- [ ] CI passes for the merged commit, and the release candidate's manual acceptance results and known limitations are documented.

### Phase 5 — Player adapters and playback preferences

Status: P5.1–P5.4 are implemented and accepted in Web and Windows Electron. P5.4 media compatibility acceptance was confirmed by the user on 2026-10-14. Retain the limits in `docs/MEDIA_COMPATIBILITY.md`: do not claim codec/container combinations that were not actually identified and tested. External-source playback from [Issue #40](https://github.com/ninekiss/visionhub/issues/40) is implemented and merged through PRs [#41](https://github.com/ninekiss/visionhub/pull/41), [#43](https://github.com/ninekiss/visionhub/pull/43), [#45](https://github.com/ninekiss/visionhub/pull/45), and [#46](https://github.com/ninekiss/visionhub/pull/46); CI passed. Real-provider end-to-end acceptance remains separate and requires an explicitly configured, authorized provider. Plyr remains the player UI; macOS-specific acceptance remains deferred.

#### P5.1 — Separate media source, playback events and cleanup

- [x] Add a media-adapter contract and isolate HTML5 source attachment/release from the Plyr UI component.
- [x] Infer common source MIME types from URL paths while ignoring query strings; retain the existing MP4 fallback for extensionless/unknown URLs.
- [x] Extract media-event binding for playback state, resume position, progress throttling and error callbacks into a separately testable module.
- [x] Add unit tests for adapter selection, source attachment/release, state transitions, progress reporting and event-listener cleanup.
- [x] Verify the refactor in Web and Windows Electron: MP4 playback and controls, resource release after source switching, progress recording and resume positioning (user acceptance, 2026-10-13).
- Keep the adapter contract small. Do not add unrelated dependencies or change database/API contracts for this slice.

#### P5.2 — Add HLS support

- [x] Pin hls.js 1.7.3, the stable release verified for this implementation, as a Web runtime dependency.
- [x] Route .m3u8 sources through the HLS adapter; prefer native HLS only when both canPlayType and ManagedMediaSource are available, otherwise use hls.js when MSE is supported.
- [x] Handle fatal network/media errors with at most one recovery attempt per category, report exhausted fatal errors and release HLS instances/listeners on source changes.
- [x] Permit HTTPS HLS manifest/segment requests through the packaged Electron CSP, while keeping scripts self-hosted and HTTP connections restricted to the configured API origin.
- [x] Add unit tests for native-HLS capability selection, hls.js attachment, fatal network/media recovery, unsupported-runtime messaging and idempotent cleanup.
- [x] Verify the public HLS source in Web and Windows Electron: playback, pause/resume, seeking, error handling, source switching and resource cleanup (user acceptance, 2026-10-13).

Public test source (Mux-hosted HLS test stream; requires network access and cross-origin requests to remain permitted): `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`.

#### P5.3 — Playback preferences and quality switching

- [x] Review the current watch-history persistence: playback progress remains in its existing watch-history path; settings are stored separately and do not create a second progress store.
- [x] Persist volume and playback speed in a versioned, client-local storage entry; restore them on player creation and source changes, with safe defaults when storage is unavailable. Web and Electron use the same behavior; settings are local to each browser/app profile and are not cloud-synced.
- [x] Add a quality selector with Auto plus distinct known-height renditions for hls.js-managed multi-rendition HLS master playlists.
- [x] Choose the highest-bitrate rendition when a manifest contains duplicate entries at the same height; keep Auto as the default and let hls.js continue adaptive selection unless a manual rendition is chosen.
- [x] Hide the quality selector for single-rendition HLS, native HLS, and fixed-source MP4/other HTML5 media where this adapter cannot enumerate switchable renditions.
- [x] Add automated tests for preference merge/sanitization/storage failures and HLS quality discovery/manual/automatic selection.
- [x] Verify volume and speed persistence, plus HLS Auto/manual quality changes, in Web and Windows Electron. Test seeking and pause/resume after switching quality (user acceptance, 2026-10-13; PR #38). macOS acceptance remains deferred.
- [ ] Prepare subtitle-track selection UI only when actual subtitle tracks can be exercised.

#### External-source playback integration — Issue #40 (completed)

**Status: implementation merged.** The feature was delivered incrementally through [PR #41](https://github.com/ninekiss/visionhub/pull/41) (provider/source contracts and playback entry points), [PR #43](https://github.com/ninekiss/visionhub/pull/43) (desktop external-player behavior), [PR #45](https://github.com/ninekiss/visionhub/pull/45) (Web progress bridge), and [PR #46](https://github.com/ninekiss/visionhub/pull/46) (readiness handshake, configurable timeout, and player-only extension mode). CI passed on the latest implementation. [Issue #40](https://github.com/ninekiss/visionhub/issues/40) is closed as completed. Provider examples intentionally remain unconfigured until an authorized source site and its selectors/origins are supplied. Manual real-provider verification remains an explicit acceptance task, not a claim of universal source-site compatibility.

Goal: support a catalog item or episode that has no direct media-file URL but has an authorized source-site page capable of playing the content. The user chooses a configured source ID; VisionHub resolves the associated source page from metadata and temporarily presents its player in the existing video-panel area, with a loading/transition state while the source player becomes ready.

Implementation and safety record:

- [x] Define a typed playback-source contract that distinguishes direct media URLs (existing Plyr/HTML5/HLS flow) from external source-site references. Keep a stable source ID, provider/site ID, and external content ID in catalog/episode metadata; do not overload `videoUrl` with multiple unrelated meanings.
- [x] Keep provider rules in validated external configuration: allowed HTTPS origins, URL template, player selector, optional readiness selector, and narrowly scoped visibility/cleanup rules. Metadata may select a configured provider/content ID but must not provide arbitrary executable JavaScript.
- [x] Preserve the player panel's geometry, show a loading state while the external player is checked, use a bounded configurable readiness timeout (default 60 seconds), and clean up when the source/episode/route/window changes.
- [x] Web uses a configured official/authorized embed URL when allowed; it does not attempt to bypass source-site anti-embedding protections.
- [x] Use Electron `WebContentsView` with isolation enabled, validate destinations against configured origins, block unexpected popups/navigation, and expose only the minimum validated IPC operations.
- [x] The issue attachment's `content.js` could not be retrieved. The implementation was authored independently; do not execute code supplied by catalog metadata or load arbitrary remote scripts.
- [x] Do not bypass DRM, paywalls, authentication, anti-embedding protections, or other access controls; do not add stream extraction/download behavior.
- [x] Keep Web independently buildable and preserve the existing Plyr path; typecheck, tests, production builds and API/Web Docker image builds passed in CI for PR #46.
- [ ] Configure at least one authorized test provider, then verify player readiness, timeout/fallback, progress reporting, source switching, navigation restrictions and player-only layout in Web and Windows Electron. Record the tested origin/provider config and observed limitations; do not generalize beyond the tested site.

#### Desktop source-player focus, resume and UI parity — PRs #54 and #56

**Implementation and documentation are merged through the desktop external-player work, while provider-specific visual acceptance remains open.** See [`docs/DESKTOP-EXTERNAL-PLAYER.md`](./DESKTOP-EXTERNAL-PLAYER.md) for the behavior contract, security boundaries, test commands, and known limitations.

- [x] Align desktop resume with Web extension behavior: wait for valid metadata/duration; choose the largest visible video with metadata-ready tie-breaker; retry seeking at roughly 400 ms intervals, bounded by 24 attempts / 15 seconds; require a 2.5-second stable match within about 3 seconds of the target; protect saved progress until restoration succeeds or the user seeks manually. Merged in [PR #54](https://github.com/ninekiss/visionhub/pull/54).
- [x] For configured cross-origin iframe players, run media restore/progress logic in the child frame through the DOM-only bridge; restrict injection to exact configured HTTPS origins and validate session/token messages.
- [x] Preserve focus behavior: prevent source-page blur/visibility handlers from interrupting playback that was active on focus loss, while preserving deliberate in-player pause intent.
- [x] Port extension player-only mode into desktop: select the primary visible player, retain the player ancestor path, mark unrelated sibling subtrees instead of deleting DOM or mutating each sibling's inline display style, and re-check after page mutations.
- [x] Port control-bar auto-hide/reveal (1.8-second idle timeout), keep open menus visible, and suppress only positively identified fast-forward/rewind controls.
- [x] Port the Plyr dark menu / lime-green accent / light control-glyph theme and add build syntax checking plus generated-script/UI/security regression tests. Implemented by [PR #56](https://github.com/ninekiss/visionhub/pull/56).
- [ ] Verify the completed behavior manually against at least one authorized real provider, including strict-CSP styling, settings menus, skip controls, source switching, progress restoration, and native fullscreen. Record the exact provider/origin and observed limitations; automated CI success alone is not source-provider acceptance.
- [ ] Perform packaged macOS ARM64 acceptance in a separate future phase; Windows package acceptance does not prove macOS/CSP behavior.


#### P5.4 — Media compatibility acceptance

Status: user acceptance completed in Web and Windows Electron (2026-10-14). See [`docs/MEDIA_COMPATIBILITY.md`](./MEDIA_COMPATIBILITY.md) for fixture observations and limitations. Playback behavior is accepted, but an acceptance does not imply support for codec/container combinations whose exact metadata has not been recorded.

- [x] Add a compatibility matrix that distinguishes observed playback from unverified codec/container support.
- [x] Add a short, redistributable CC BY 3.0 MP4 fixture and record its required attribution.
- [x] Map HTMLMediaElement abort, network, decode and unsupported-source errors to actionable messages without leaking source URLs; add deterministic unit coverage.
- [x] Add and test a cancellable 15-second HTML5 startup timeout so unreachable hosts that never dispatch a browser error event do not leave the player indefinitely loading.
- [x] Verify the unreachable-host timeout prompt and confirm normal MP4/HLS playback still works in Web and Windows Electron (user acceptance, 2026-10-13; PR #39).
- [x] Verify the redistributable fixture and P5.4 playback/error/source-switching behavior in Web and Windows Electron (user acceptance confirmed 2026-10-14). Exact OS/browser version and codec metadata are not inferred where they were not recorded; retain the no-unverified-codec-claims rule.
- [x] Verify source switching, seek, buffering, progress restoration, network failure and unsupported-format behavior in both clients (P5.4 user acceptance confirmed 2026-10-14).
- [x] Claim support only for the exact fixtures and codec/container combinations actually tested; do not infer MKV/HEVC/HDR/subtitle support from Plyr.

Exit criteria:
- [x] The media adapter and playback-event modules have unit coverage and the Web/desktop production builds pass (CI run [38400679707](https://github.com/ninekiss/visionhub/actions/runs/38400679707)).
- [x] Existing MP4/HTML5 playback, source switching, resume position, buffering and error states remain functional (Windows manual acceptance, 2026-10-13).
- [x] HLS playback and P5.3 quality switching are user-accepted in Web and Windows Electron (2026-10-13); retain the source/version evidence in `docs/MEDIA_COMPATIBILITY.md`.
- [x] The redistributable MP4 fixture and user-facing unsupported-media/network errors are accepted in Web and Windows Electron (2026-10-14).
- [x] Playback preferences restore consistently within each Web/browser and Electron app profile without creating a second watch-progress store (P5.3 acceptance, PR #38).
- [x] Multi-rendition HLS quality selection works in Web and Windows Electron, including Auto/manual changes, seek and pause/resume; fixed-source files do not show fake quality choices (P5.3 acceptance, PR #38).
- [x] Supported-format guidance is constrained to observed tests; unverified codec/container combinations remain explicitly unclaimed.

### Phase 6 — Deployment layout and operational hardening

**Scope: configuration-driven deployment for every database connection mode.** The existing PostgreSQL remains the default. Direct host/IP connections and an existing Docker database network are both user-accepted. A Compose-managed PostgreSQL service is optional and must not start unless its separate overlay is explicitly included. Logical and PostgreSQL 18 full/incremental physical backup/restore flows, plus Discord/Telegram alert delivery, are user-accepted.

Implementation:
- [x] Move the base application Compose file to `infra/compose.yaml` and update build/mount paths.
- [x] Keep the base Compose file limited to Web and API. Do not require an external network when the configured database host/IP is directly reachable from the API container.
- [x] Support a direct database URL in every application environment through the shared `DATABASE_URL` contract. Compose uses optional `DATABASE_URL_DOCKER` when the container needs a different reachable address.
- [x] Add `infra/compose.existing-db-network.yaml` to attach the API and one-shot database tools to an already-existing database network when host aliases require it.
- [x] Add `infra/compose.database.yaml` as an explicit opt-in PostgreSQL service overlay, with a persistent named volume, a host port bound to loopback, and API/tools startup waiting for database readiness.
- [x] Keep the API port internal by default. An optional `infra/compose.api-published.yaml` overlay exposes it only on host loopback when direct host access is needed.
- [x] Add API/Web health checks, restart policy and NestJS shutdown hooks; retain Prisma disconnection on shutdown.
- [x] Add an on-demand `db-tools` profile for init, migration and seed operations, plus checksummed, schema-scoped logical backups and disposable-database restore tests.
- [x] Add PostgreSQL 18 full and incremental physical backup chains for the managed database, chain-aware restore/test, integrity verification and retention of complete full-backup roots.
- [x] Add a Windows Task Scheduler runner with daily logical backups, weekly physical full backups and daily physical increments for managed PostgreSQL.
- [x] Document deployment modes, explicit migration, backup strategy and restore safeguards in [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md). No migrations run automatically on API startup.
- [x] Validate Compose deployment modes and build the db-tools image in CI.
- [x] Add a Cloudflare Worker alert receiver compatible with the original VisionHub backup-scheduler JSON payload; default to Discord and allow explicit `platform=discord` / `platform=telegram` selection.
- [x] Preserve the existing `BACKUP_ALERT_WEBHOOK_URL` and `BACKUP_ALERT_WEBHOOK_TOKEN` integration; document Worker secrets, deployment, payload mapping, and manual verification in [`docs/CLOUDFLARE-BACKUP-ALERTS.md`](./CLOUDFLARE-BACKUP-ALERTS.md).
- [x] Link the Cloudflare alert guide and Worker example from [`docs/BACKUP-RECOVERY.md`](./BACKUP-RECOVERY.md); implementation and documentation are merged via [PR #48](https://github.com/ninekiss/visionhub/pull/48).
- [x] User acceptance confirmed: deployed the Worker and ran the original VisionHub backup alert test end-to-end; default Discord delivery and explicit Telegram delivery passed. Do not record tokens or webhook URLs.
- [x] User acceptance confirmed: direct-address deployment and external Docker-network deployment both passed against PostgreSQL.
- [x] User acceptance confirmed: logical backup/restore and PostgreSQL 18 full/incremental physical backup/restore passed against a disposable database.

Exit criteria:
- The default Compose file starts Web/API only; the database service is started only when its overlay is selected.
- Both a direct reachable database URL and an existing-network alias are documented and supported.
- Public browser traffic reaches the API through Web/Nginx by default; direct API host publication is opt-in.
- Health status reflects API/database readiness; container shutdown disconnects Prisma cleanly.
- A deployment, schema-scoped backup and rollback procedure is documented and has been exercised against a disposable database.
- No Redis or worker is added, and no automatic database migration or destructive operation occurs at application startup.

### Phase 7 — Optional worker, downloads and media processing

Start only when a concrete user-facing requirement justifies it.

Potential tasks:
- Add `apps/worker` for long-running download or media-processing jobs.
- Define persisted job states, retry rules, cancellation, progress reporting and bounded concurrency.
- Add FFmpeg only if the chosen media workflow requires it; do not add Redis or other infrastructure by default.
- Reuse the current PostgreSQL only where the data model and workload make that appropriate; evaluate separate queue infrastructure only with measured need.

Exit criteria:
- Jobs survive API restarts and expose observable states.
- Retries and cancellation are safe and idempotent.
- Resource consumption is bounded and job failures do not compromise normal catalog/API operations.

## 9. Cross-phase quality gates

Every phase should meet these gates before merge:

- Clean dependency install using the committed lockfile.
- Prisma schema validation whenever database schema/client changes.
- Type checks and production builds for all affected workspaces.
- Unit/integration tests for changed behavior, including error paths.
- No credentials, tokens, secret files or real connection strings in Git.
- No accidental changes to schemas/tables outside `visionhub`.
- A concise README update for any changed command, config path, port, migration or deployment behavior.
- CI result recorded on the merge commit; do not report success until the run completes successfully.

## 10. Immediate next actions

1. **P4.0 decisions are recorded.** Windows x64 is the first package target; Electron is pinned to 44.7.0; the endpoint configuration contract and media limitations are documented.
2. **P4.3 Windows workflow acceptance passed (2026-10-13).** Catalog/search/detail/playback, API proxy, renderer resources and Plyr controls were verified in the Windows Electron runtime. Packaged macOS acceptance remains outstanding.
3. **P4.4 Windows interactive acceptance passed (2026-10-13).** macOS-specific menu, lifecycle, and display-restoration checks are deferred until a Mac is available.
4. **P4.5 Windows packaging is now the priority.** Complete the Windows x64 installer, packaged configuration/API verification, Windows CI artifact, and clean-machine acceptance. Keep macOS ARM64 packaging/signing/notarization and Mac runner automation deferred.
5. **P5.4 acceptance is complete (2026-10-14).** Preserve the documented codec/container limitations; do not repeat the accepted playback checklist unless a regression is introduced.
6. **Phase 6 operational acceptance is complete.** Base Compose runs only Web/API; direct database-address and existing data-network deployment modes have been accepted, as have logical backup/restore, PostgreSQL 18 full/incremental physical backup/restore, and Discord/Telegram alert delivery. Keep the opt-in PostgreSQL overlay and API port overlay explicit; do not start the optional database service by default.
7. **Backup alert delivery is accepted.** PR #48 adds `examples/cloudflare/visionhub-alert-worker.js` and `docs/CLOUDFLARE-BACKUP-ALERTS.md`; user confirmed end-to-end alert acceptance for default Discord and explicit Telegram delivery.

Do not start the optional database container by default, add a worker, replace Plyr, or rewrite the whole UI before the corresponding need and acceptance criteria are clear.
