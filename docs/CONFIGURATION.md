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
| `DATABASE_URL` | `database.url` | Required PostgreSQL URL; Compose points it at the existing DB network |
| `ADMIN_USERNAME` | `admin.username` | All three admin variables blank means admin access is not configured |
| `ADMIN_PASSWORD` | `admin.password` | Required when admin authentication is configured |
| `ADMIN_SESSION_SECRET` | `admin.sessionSecret` | At least 32 characters when admin authentication is configured |
| `ADMIN_COOKIE_SECURE` | `admin.cookieSecure` | Strict `true`/`false`; use true behind HTTPS |
| `DESKTOP_API_BASE_URL` | `desktop.apiBaseUrl` | Electron-only override; leaves Web/API settings untouched |
| `PLAYBACK_SOURCES_CONFIG_PATH` | — | Selects provider URLs, exact HTTPS origin allowlists, player selectors and startup timeout; selected file must exist |

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
      timeoutMs: 15000
```

Each catalog movie or episode may store a `playbackSources` JSON array alongside the optional legacy `videoUrl`. A source is either:

```json
[
  { "id": "official", "label": "源站", "kind": "provider", "providerId": "example-source", "contentId": "12345" },
  { "id": "direct", "label": "直连", "kind": "direct", "url": "https://media.example.test/video.mp4" }
]
```

The provider ID must match a configured provider. URL templates may contain only `{contentId}`; the generated URL must be HTTPS and match an exact allowed origin. Selectors, URL templates and the allowlist remain local configuration and are not exposed to the Web client.

The desktop client uses a DOM-mounted Electron `<webview>` without Node integration or a preload bridge. The main process validates the initial URL, enforces the provider's exact HTTPS Origin allowlist for navigation and redirects, blocks popups, and injects only the fixed selector-based layout/readiness script from local configuration. The normal Web client uses only a provider's explicitly configured official embed URL. The Web iframe's `load` event cannot prove that an internal cross-origin player is actually ready; provider-specific readiness introspection is available only to the isolated desktop view. When no approved embed is configured, Web offers a safe external-open link instead of injecting code into a cross-origin page.

Set `PLAYBACK_SOURCES_CONFIG_PATH` to select a non-default file. When that variable is explicitly set, the selected file must exist. Provider selectors and allowed origins are security-sensitive configuration: only configure source sites you are authorized to embed or automate, and do not attempt to bypass DRM, account restrictions, paywalls or anti-embedding protections.

## Desktop configuration isolation

`configs/desktop.yaml` is loaded separately by `loadDesktopConfig()`. It contains only the Electron API endpoint and is not merged into the API server configuration. Override it with `DESKTOP_API_BASE_URL` or select a different file with `DESKTOP_CONFIG_PATH`.

## Secrets and database safety

- Never commit `.env`, `configs/app.yaml`, or `configs/secrets.yaml`.
- Do not put credentials in committed defaults or production YAML.
- Compose continues to run application services only and joins the already-existing PostgreSQL network. It does not create a database service.
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
