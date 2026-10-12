# VisionHub Development Plan

> Status date: 2026-10-12  
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

The following status is based on the repository code and lockfile on 2026-10-12.

| Area | Current state | Status against target |
|---|---|---|
| Web application | React + Vite + TypeScript; catalog browse, details, playback pages | Implemented foundation |
| Admin UI | Dashboard, catalog editor, episodes and category management; admin session API | Implemented foundation |
| Styling | Tailwind CSS 4.3.3, shared `packages/ui` tokens/primitives, and first admin component migrations | Phase 3 in progress; feature-specific legacy CSS remains to migrate incrementally |
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
| Desktop | No `apps/desktop` or Electron shell | Not started |
| Shared packages | `packages/contracts`, `packages/config`, and `packages/ui` provide shared API contracts, validated config, tokens and React primitives | Shared UI foundation implemented; screen migration in progress |
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
| Electron | Not installed |
| hls.js | Not installed |

### 3.2 Target baseline

- Node.js: 24.21.0 LTS selected as the verified maintenance baseline for this implementation; update deliberately after checking official release notes.
- Electron: target 44.6.0 as listed in the project specification; verify the then-current stable release and compatibility before installing.
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

Status: implemented on `phase-2/config-contracts` and submitted as [PR #1](https://github.com/ninekiss/visionhub/pull/1). CI run 53 passed, including both application Docker builds.

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

Status: shared UI foundation, admin migration slices, public catalog/detail/history, accessible confirmation dialog and playback navigation controls are merged into `main`. Remaining detail/player empty-state back actions are being aligned with shared buttons; final responsive acceptance checks remain.

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
- [ ] Continue reviewing remaining playback states and other non-destructive interaction flows in manageable chunks.
- [x] Keep Plyr styles and complex player-specific styling in feature CSS during the incremental migration.

Exit criteria:
- [x] New shared primitive work follows the shared component and Tailwind conventions.
- [x] Duplicate styling for migrated admin navigation, filters, table cells, basic form controls, public category chips, pagination, catalog/related cards, episode cards, continue-watching cards and playback navigation controls is removed from legacy CSS.
- [ ] Admin forms, tables, navigation and confirmation dialog are visually verified at supported desktop and mobile widths.
- [ ] No regression in catalog, login, CRUD or player navigation after the full migration and CI validation.

### Phase 4 — Electron desktop MVP

Tasks:
- Add `apps/desktop` with Electron main process, preload and React renderer.
- Configure secure defaults: `contextIsolation: true`, `nodeIntegration: false`, and a narrow preload API.
- Reuse shared UI components and contracts; avoid duplicating the domain/API layer.
- Resolve the API address from validated desktop configuration rather than hard-coding a deployment host.
- Implement a desktop development command, packaging pipeline, app identity and environment-specific settings.
- Define how local development, packaged desktop builds and the remote API communicate.

Exit criteria:
- A packaged desktop application launches on the agreed target OS.
- It can connect to a configured API endpoint, browse/search the catalog, display details and play supported media.
- Renderer code cannot access arbitrary Node APIs.
- Web remains buildable during the desktop MVP rollout.

### Phase 5 — Player adapters and playback preferences

Tasks:
- Split the current Plyr wrapper into player UI, adapter selection and progress/settings hooks.
- Add hls.js as the HLS adapter and define fallback behavior for unsupported sources.
- Implement playback preference persistence and prepare subtitle selection UI.
- Test the Electron Chromium runtime against a documented sample media matrix.

Exit criteria:
- MP4/HTML5 playback and supported HLS playback both have repeatable tests.
- Source changes properly dispose old players and adapters.
- Resume behavior, seeking, buffering, errors and unsupported media states are handled predictably.
- Supported formats are documented based on testing, not assumptions.

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

The recommended next slice is:

1. **Phase 0/1:** complete for the current Web/API baseline. Keep the configuration/catalog tests and Node 24.21.0 build gates in CI.
2. **Next: Phase 2:** implement shared configuration loading and strict Zod validation before adding desktop-specific settings.
3. **Phase 3 and 4:** prepare reusable UI/contracts, then create the Electron desktop shell while keeping Web independently deployable and its shared workflows in sync.
4. Continue to the HLS adapter and deployment layout once the shared foundation is stable.

Do not start a worker, add a database container, replace Plyr, or rewrite the whole UI before the corresponding need and acceptance criteria are clear.
