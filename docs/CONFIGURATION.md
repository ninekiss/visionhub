# Configuration

Runtime configuration is loaded through `@visionhub/config`. The package is shared by the API runtime and the future Electron client. Web stays independently buildable and retains its Vite build-time setting, `VITE_API_BASE_URL`.

## Merge order

For API configuration, layers are merged in this exact order; later values override earlier values:

1. Built-in defaults.
2. `configs/app.defaults.yaml` — committed, non-secret defaults.
3. `configs/app.yaml` — optional local override, ignored by Git and Docker build context.
4. Environment-specific YAML: `configs/app.development.yaml`, `configs/app.production.yaml`, or `configs/app.test.yaml`. `APP_CONFIG_PATH` can select a specific file. If an explicitly selected file is missing, loading fails.
5. `configs/secrets.yaml` — optional local secret file. `APP_SECRETS_PATH` can select another file; an explicitly selected file must exist.
6. Environment variables and deployment-injected secrets.

Nested objects merge recursively. Arrays replace the prior array as a whole. Unknown keys, invalid YAML, absent selected files, malformed values, or missing required database configuration stop startup. Errors identify fields and remediation but never echo secret values.

## Runtime variables

| Variable | Resolved field | Notes |
|---|---|---|
| `NODE_ENV` | `app.environment` | `development`, `test`, or `production` |
| `APP_CONFIG_DIR` | — | Overrides the configuration directory |
| `APP_CONFIG_COMMON_PATH` | — | Selects shared default YAML |
| `APP_CONFIG_PATH` | — | Selects environment YAML; missing file is fatal |
| `APP_SECRETS_PATH` | — | Selects secret YAML; selected-but-missing file is fatal |
| `APP_NAME` | `app.name` | Display name |
| `API_BASE_PATH` | `app.basePath` | API URL path prefix; defaults to `/api/v1` |
| `HOST` / `PORT` | `server.host` / `server.port` | Port must be an integer between 1 and 65535 |
| `CORS_ORIGINS` | `server.corsOrigins` | Comma-separated HTTP(S) origins without path/query |
| `WEB_TITLE` / `WEB_API_BASE_URL` | `web.title` / `web.apiBaseUrl` | Web metadata/configuration |
| `CATALOG_PAGE_SIZE` | `catalog.pageSize` | Integer between 1 and 50 |
| `DATABASE_URL` | `database.url` | Required PostgreSQL URL for the API process and Prisma CLI; the host or container must be able to reach the configured address |
| `ADMIN_USERNAME` | `admin.username` | All three admin variables blank means admin access is not configured |
| `ADMIN_PASSWORD` | `admin.password` | Required when admin authentication is configured |
| `ADMIN_SESSION_SECRET` | `admin.sessionSecret` | At least 32 characters when admin authentication is configured |
| `ADMIN_COOKIE_SECURE` | `admin.cookieSecure` | Strict `true`/`false`; use true behind HTTPS |
| `DESKTOP_API_BASE_URL` | `desktop.apiBaseUrl` | Electron-only override; leaves Web/API settings untouched |
| `PLAYBACK_SOURCES_CONFIG_PATH` | — | Selects provider URLs, exact HTTPS origin allowlists, player selectors and startup timeout; selected file must exist |
| `DATABASE_URL_DOCKER` | Compose override for `DATABASE_URL` | Optional connection URL used by the API container; it can point to a direct DNS/IP address or a service alias on a Docker network |
| `EXISTING_DB_NETWORK` | Compose network overlay | Used only with `infra/compose.existing-db-network.yaml` to attach the API to a pre-existing database network |
| `POSTGRES_*` | Optional Compose PostgreSQL service | Used only with `infra/compose.database.yaml`; that file is not included by default |
| `API_PORT` | Optional host port mapping | Used only with `infra/compose.api-published.yaml`; the API is not published to the host by default |

The development launcher loads a workspace-local `.env` first and then the repository-root `.env`, without replacing values already set by the process/container.

## External playback providers

External source-site rules are kept separately in `configs/playback-sources.yaml`; this file is loaded by the API and the Electron main process. The committed file intentionally starts with an empty provider list, so no source site is assumed or opened until a real provider has been explicitly configured.

Example only — replace the example domains and selectors with values verified for a source site you are authorized to use:

```yaml
playback:
  providers:
    - id: example-source
      name: Example Source
      urlTemplate: "https://player.example.test/watch/{contentId}"
      # Optional official embed URL; without it, Web offers an external-open fallback.
      webEmbedUrlTemplate: "https://embed.example.test/player/{contentId}"
      # Every main-frame and sub-frame navigation must remain within this exact HTTPS origin allowlist.
      allowedOrigins:
        - https://player.example.test
        - https://embed.example.test
      # Local CSS selectors only; metadata must never contain executable scripts.
      playerSelector: ".player-container"
      readinessSelector: ".player-container video"
      timeoutMs: 60000
```

Each catalog movie or episode may store a `playbackSources` JSON array alongside the optional legacy `videoUrl`. A source is either:

```json
[
  { "id": "official", "label": "源站", "kind": "provider", "providerId": "example-source", "contentId": "12345" },
  { "id": "direct", "label": "直连", "kind": "direct", "url": "https://media.example.test/video.mp4" }
]
```

The provider ID must match a configured provider. URL templates may contain only `{contentId}`; the generated URL must be HTTPS and match an exact allowed origin. Selectors, URL templates and the allowlist remain local configuration and are not exposed to the Web client; the public provider response includes only the display name, browser-open/embed templates, and `timeoutMs`.

The desktop client uses an isolated Electron `WebContentsView` with Node integration disabled, context isolation and sandboxing enabled, plus a dedicated source-player preload that exposes no IPC or Node API to the remote page. The preload tracks native HTML5 video positions, suppresses JavaScript pause calls only during window-focus transitions for videos that were already playing, and attempts bounded position recovery when a source resets its timeline on focus loss. When the actual video lives in a child frame, Electron injects a fixed DOM-only bridge only into exact HTTPS origins listed in that provider's `allowedOrigins`; the frame relays progress through a token/request-scoped `postMessage`, and the top preload/main process validate the source origin, session token, request ID and numeric progress before storing it. Resume seeks target the configured player/readiness selectors and wait for a real `seeked` confirmation before lifting the progress-preservation guard. This is best-effort compatibility behavior and does not override deliberate in-player pause actions. Do not enable `nodeIntegrationInSubFrames` for this feature. The normal Web client uses only a provider's explicitly configured official embed URL. The browser extension can inspect native HTML5 video readiness only on source origins the user has explicitly authorized; once ready, it visually isolates the detected player container and hides other source-page UI while keeping the DOM in place so the player scripts and controls continue working. Custom canvas players or source pages whose structure cannot be identified may not support this mode. This is not a bypass for DRM, login restrictions or anti-embedding headers. When no approved embed is configured, Web offers an external-open link instead of injecting code into a cross-origin page.

The provider `timeoutMs` configures the playback-readiness wait in both Desktop and Web. It defaults to `60000` (60 seconds) and may be set from `1000` to `300000` milliseconds. Web falls back to normal embedding quickly when the extension is not connected; the configured timeout applies after the extension connects but the native player has not reported ready.

Set `PLAYBACK_SOURCES_CONFIG_PATH` to select a non-default file. When that variable is explicitly set, the selected file must exist. Provider selectors and allowed origins are security-sensitive configuration: only configure source sites you are authorized to embed or automate, and do not attempt to bypass DRM, account restrictions, paywalls or anti-embedding protections.

## Desktop configuration isolation

`configs/desktop.yaml` is loaded separately by `loadDesktopConfig()`. It contains only the Electron API endpoint and is not merged into the API server configuration. Override it with `DESKTOP_API_BASE_URL` or select a different file with `DESKTOP_CONFIG_PATH`.

## Secrets and database safety

- Never commit `.env`, `configs/app.yaml`, or `configs/secrets.yaml`.
- Do not put credentials in committed defaults or production YAML.
- `infra/compose.yaml` starts only the Web and API services. It uses `DATABASE_URL_DOCKER` when set, otherwise `DATABASE_URL`; the chosen address must be reachable from inside the API container. A direct hostname/IP does not require joining an external Docker network.
- To resolve a PostgreSQL container by its network alias, include `infra/compose.existing-db-network.yaml` and set `EXISTING_DB_NETWORK`. To start an optional local PostgreSQL container, explicitly include `infra/compose.database.yaml`; it persists data in a named volume and is not started by default.
- The API host port is internal by default. Include `infra/compose.api-published.yaml` only when direct host access is needed.
- Configuration loading does not run migrations. Database schema changes remain explicit deployment steps.

## Validation matrix

| Scenario | Expected result |
|---|---|
| Development YAML + valid `DATABASE_URL` | Starts on configured development port |
| Production YAML + valid `DATABASE_URL` | Starts on configured production port |
| Missing or malformed `DATABASE_URL` | Fails before service startup; field and remedy are shown |
| Explicit config path points to missing file | Fails with selected path; no default fallback |
| Invalid port, CORS origin, page size, or cookie flag | Fails Zod validation |
| Partial admin credentials or short session secret | Fails Zod validation without printing secrets |
| Valid desktop endpoint / env override | Loads independently from API config |
