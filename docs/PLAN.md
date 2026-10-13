# VisionHub Development Plan

> Status date: 2026-10-13  
> Repository: [ninekiss/visionhub](https://github.com/ninekiss/visionhub)  
> Scope: retain the first-class Web client while evolving the shared foundation and adding an Electron desktop client  
> This document is a roadmap and current-state assessment. It does not claim that future-phase work is already implemented.

## 1. Product and architecture direction

VisionHub is intended to become a desktop-first media browsing and playback application with a reusable React UI, a NestJS API, a Plyr-based player, optional background processing, and configuration-driven deployment.

Core constraints:

1. Use stable versions and verify compatibility before upgrades. Do not upgrade solely to maximize version numbers.
2. Reuse the existing PostgreSQL service. Compose must not create, own, or automatically replace the database container.
3. Keep operational configuration outside business code. Validate required configuration at startup and fail with an actionable error rather than silently accepting malformed configuration.
4. Keep Plyr as the player UI. Add protocol adapters such as HTML5 and HLS as needed; do not treat Plyr as a video decoder.
5. Keep Web as a first-class, independently deployable client. Electron is an additional client, never a replacement for Web.
6. Keep shared contracts, UI, features and configuration reusable across both clients; prevent their workflows from drifting.
7. Prefer incremental, testable changes. Preserve working features and avoid broad rewrites without a migration need.

## 2. Current state snapshot

The following status is based on the repository code and lockfile on 2026-10-13.

| Area | Current state | Status against target |
|---|---|---|
| Web application | React + Vite + TypeScript; catalog browse, details, playback pages | Implemented foundation |
| Admin UI | Dashboard, catalog editor, episodes and category management; admin session API | Implemented foundation |
| Styling | Tailwind CSS 4.3.3, shared `packages/ui` tokens/primitives, and completed planned Phase 3 migration slices | Phase 3 browser regression sign-off recorded on 2026-10-13; feature-specific CSS remains where it serves page/player-specific behavior |
| API | NestJS 12.1.2; catalog and admin routes | Implemented foundation |
| Database | Prisma 7.10.0 and PostgreSQL; data lives in the separate `visionhub` schema | Implemented foundation |
| Database ownership | Compose has API and web services only; PostgreSQL is reached through an external Docker network | Aligned |
| Data changes | Explicit migration and seed commands; no migration on ordinary API startup | Aligned with safety constraint |
| Runtime baseline | Node.js 24.21.0 is pinned in `.nvmrc`, CI and Docker build stages; package engine requires `>=24.21.0 <25` | Verified in CI; aligned |
| Package manager | pnpm 12.11.2 with a committed lockfile | Implemented; retain reproducible installs |
| Configuration | `@visionhub/config` centralizes YAML/env loading, precedence and Zod validation; desktop has an independent config file | Phase 2 implemented; CI and both Docker builds passed |
| Secrets | Deployment credentials are passed through environment variables; no committed secret file | Partially aligned; clarify loading and validation |
| Player | Plyr 3.8.5 wrapper, playback status and local playback-progress persistence | Implemented foundation |
| HLS | No `hls.js` adapter is present | Not started |
| Desktop | `apps/desktop` provides the Electron main/preload shell and reuses the Web renderer | Windows Electron workflow acceptance reported passed on 2026-10-13; macOS-specific and packaged security acceptance remain open; P4.5 release packaging deferred until explicitly reactivated |
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
| Electron | 44.7.0 pinned in `apps/desktop`; macOS ARM64 development shell scaffold added; P4.5 release packaging intentionally deferred |
| hls.js | Not installed |

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
- Add hls.js only with the HLS player-adapter phase.

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
│   └── compose.yaml          # Application services only; external database network
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

Target deployment remains intentionally small:

- Compose runs application services only: API and, where needed, the web frontend/reverse proxy.
- No PostgreSQL or Redis service is added to Compose.
- The API uses the hostname or network alias of the existing PostgreSQL service on the configured external Docker network. Inside the API container, `localhost` refers to the API container itself.
- Prefer exposing the web/reverse-proxy port publicly and keeping the API internal. If a host API port is needed for debugging, bind it to loopback unless a deliberate network policy requires broader access.
- Move the Compose file to `infra/compose.yaml` in a separate, verified change; update build contexts, relative volume mounts, documentation and commands at the same time.
- Database migrations remain explicit deploy steps. Never run destructive schema changes automatically on normal API startup.
- Before any schema change, inspect the existing database and keep changes scoped to the `visionhub` schema. Do not modify unrelated schemas or tables.
- Use read-only configuration mounts where appropriate and never commit database credentials or signing keys.

Acceptance criteria:

- `docker compose config` resolves the intended external network and mounts.
- Compose has no database or Redis service.
- A clean API startup can connect to the existing database using a network-resolvable host.
- No production migration runs as a side effect of container boot.
- The API port is not exposed more broadly than intended.

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

Status: P4.0–P4.3 foundations are merged via [PR #31](https://github.com/ninekiss/visionhub/pull/31) and [PR #32](https://github.com/ninekiss/visionhub/pull/32); end-to-end P4.3 acceptance and actual packaged macOS security verification remain open. P4.4 native window behavior is being implemented on `phase-4/p44-native-window-behavior`. P4.5 release packaging is deliberately deferred until explicitly reactivated.

#### Product goal

Deliver a small, secure desktop shell that reuses the existing React screens, shared UI, API contracts and remote NestJS API. The first release should support the core media-library workflow and playback formats already verified in the current Plyr/Web implementation. It must not imply broader codec support than the Electron Chromium runtime can actually play.

#### P4.0 — Confirm scope and compatibility

- [x] Set the first packaged target to macOS Apple Silicon (`arm64`); defer Intel/universal and other operating systems until explicitly requested.
- [x] Pin Electron 44.7.0, the official stable release verified on 2026-10-13; its embedded Node.js 24.21.0 matches the repository runtime baseline. Do not use a floating `latest`.
- [x] Record the current public MP4 mock URL as a playback-test candidate and explicitly mark codec/container support unverified until tested on Electron/macOS ARM64; HLS remains a later adapter phase. See `docs/DESKTOP_MVP.md`.
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
- [ ] Verify the CSP behavior in an actual packaged Electron build on macOS ARM64 before marking P4.2 complete.
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

#### P4.5 — Package and verify a release candidate (DEFERRED — reactivate on request)

Decision recorded 2026-10-13: this phase is intentionally skipped for now. Do not build release artifacts, configure code signing/notarization, or add release-publishing automation until the user explicitly asks to reactivate P4.5. Keep the checklist below as the future plan; when reactivated, re-check current tool compatibility, runner availability, and signing/notarization credentials before starting.

- [x] Record electron-builder v26.17.0 as the planning baseline; revalidate the stable channel and compatibility when P4.5 is reactivated.
- [ ] Build a macOS ARM64 DMG/ZIP.
- [ ] Add reproducible package scripts and CI validation for desktop type checks/builds; run OS-specific packaging on supported runners when feasible.
- [ ] Configure Developer ID signing, Apple notarization/stapling and GitHub Releases publishing for macOS ARM64 on the self-hosted Apple Silicon runner; reference credentials only through GitHub Actions secrets.
- [ ] Set application name, version, product identity, icons and output locations through versioned project configuration.
- [ ] Test a clean packaged install/launch, API configuration, core browse/detail/play workflow, external-link handling, shutdown and upgrade/reinstall behavior on each target OS.
- [ ] Document build artifacts, configuration placement, log location, known media limitations and how to report a startup failure.
- Keep automatic updates out of scope for the first MVP unless a separate product requirement is approved.

Deliverable: a reproducible desktop release candidate and a short manual acceptance record.

#### Explicitly out of scope for P4

- [ ] Do not remove, bundle into Electron-only workflows, or stop independently deploying Web.
- [ ] Do not add a worker, download manager, FFmpeg pipeline, Redis, or a new database container.
- [ ] Do not run database migrations automatically from Electron or ordinary API startup.
- [ ] Do not promise MKV/HEVC/HDR/subtitle or other codec/container support without tests on the actual target runtime.
- [ ] Do not make HLS.js, subtitle preferences, or broad player refactoring a blocker for the desktop shell; track those under Phase 5 unless an agreed MVP acceptance test requires them.
- [ ] Do not implement auto-update, telemetry, tray mode or global hotkeys by default.

#### Phase 4 exit criteria

P4.5 is deferred. Keep release/packaged-install exit criteria unchecked until the phase is explicitly reactivated and the relevant acceptance checks are completed.

- [x] Phase 3 browser regression sign-off is recorded in `docs/UI.md` before desktop implementation begins (2026-10-13).
- [ ] Web and desktop have independent, documented development and production build paths.
- [ ] A packaged application launches on each agreed target OS and reads the configured API endpoint without hard-coded deployment URLs.
- [ ] Catalog/search, details and supported playback work against a test API; login/admin flows are verified if included in the agreed desktop MVP scope.
- [ ] Electron security defaults and navigation/IPC boundaries are reviewed; the renderer cannot access arbitrary Node APIs.
- [ ] Core playback loading, error, buffering, source switching and progress restoration behavior is verified for the supported sample media.
- [ ] No database service, worker, secret credential or automatic migration was introduced as a side effect of desktop packaging.
- [ ] CI passes for the merged commit, and the release candidate's manual acceptance results and known limitations are documented.

### Phase 5 — Player adapters and playback preferences

Status: P5.1 adapter foundation is implemented in the current PR; HLS and new playback preferences are intentionally separate follow-up slices. Plyr remains the player UI.

#### P5.1 — Separate media source, playback events and cleanup

- [x] Add a media-adapter contract and isolate HTML5 source attachment/release from the Plyr UI component.
- [x] Infer common source MIME types from URL paths while ignoring query strings; retain the existing MP4 fallback for extensionless/unknown URLs.
- [x] Extract media-event binding for playback state, resume position, progress throttling and error callbacks into a separately testable module.
- [x] Add unit tests for adapter selection, safe HLS-not-yet-supported errors, source attachment/release, state transitions, progress reporting and event-listener cleanup.
- [ ] Verify the refactor manually in Web and Windows Electron after CI passes, confirming the current MP4 playback UI/controls and progress restoration remain unchanged.
- Keep the adapter contract small. Do not add a runtime dependency or change the database/API contracts in this slice.

#### P5.2 — Add HLS support (follow-up)

- [ ] Add hls.js only after verifying the current stable version and compatibility with the selected Electron/Web targets.
- [ ] Route HLS sources through the HLS adapter, use native HLS only where capability checks show it is supported, and dispose HLS instances and event handlers on source changes.
- [ ] Test a redistributable sample HLS stream and errors including unavailable manifests and segment failures.

#### P5.3 — Playback preferences (follow-up)

- [ ] Review the current watch-history persistence before adding new storage; avoid duplicate progress stores.
- [ ] Add preferences such as playback speed/volume only with clear persistence semantics across Web and desktop.
- [ ] Prepare subtitle-track selection UI only when actual subtitle tracks can be exercised.

#### P5.4 — Media compatibility acceptance (follow-up)

- [ ] Test actual playback in Web and the target Electron runtime against a documented, redistributable media matrix.
- [ ] Record source switching, seek, buffering, error handling, progress restore and unsupported-format behavior.
- [ ] Claim support only for the formats and codecs actually tested; do not infer MKV/HEVC/HDR support from Plyr.

Exit criteria:
- [ ] The media adapter and playback-event modules have unit coverage and the Web/desktop production builds pass.
- [ ] Existing MP4/HTML5 playback, source switching, resume position, buffering and error states remain functional.
- [ ] HLS support is tested before being claimed; unsupported media fail with a clear message.
- [ ] Playback preferences are consistent across Web and desktop without duplicate storage.
- [ ] Supported formats are documented based on testing, not assumptions.

### Phase 6 — Deployment layout and operational hardening

Tasks:
- Move Compose to `infra/compose.yaml` with corrected relative contexts and mounts.
- Bind public traffic to the web/reverse proxy; keep API internal unless explicitly required.
- Apply the shared validated configuration to API and deployment setup.
- Review health checks, logs, restart behavior, graceful shutdown and secret mounts.
- Document safe migration, backup and rollback procedures for the existing PostgreSQL schema.

Exit criteria:
- Compose manages application services only and attaches to the existing external database network.
- The deployed API connects using the correct database hostname and secrets.
- No database or Redis service is created, and no automatic destructive migration occurs.
- A deployment and rollback can be performed from documented steps.

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

1. **P4.0 decisions are recorded.** macOS ARM64 is the first package target; Electron is pinned to 44.7.0; the endpoint configuration contract and MP4 test candidate/limitations are documented.
2. **P4.3 Windows workflow acceptance passed (2026-10-13).** Catalog/search/detail/playback, API proxy, renderer resources and Plyr controls were verified in the Windows Electron runtime. Packaged macOS acceptance remains outstanding.
3. **P4.4 Windows interactive acceptance passed (2026-10-13).** macOS-specific menu, lifecycle, and display-restoration checks are deferred until a Mac is available.
4. **P4.5 is intentionally deferred.** Do not start macOS ARM64 packaging, signing, notarization or GitHub Release automation until the user explicitly reactivates this phase. On reactivation, revalidate the toolchain and runner before following the recorded release plan.

Do not start a worker, add a database container, replace Plyr, or rewrite the whole UI before the corresponding need and acceptance criteria are clear.
