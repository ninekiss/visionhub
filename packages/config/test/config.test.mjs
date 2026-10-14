import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadAppConfig, loadDesktopConfig, loadPlaybackSourcesConfig } from "../src/index.mjs";

async function createConfigDirectory(files) {
  const directory = await mkdtemp(join(tmpdir(), "visionhub-config-"));
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(directory, name), content, "utf8");
  }
  return directory;
}

const commonYaml = [
  "app:", "  name: VisionHub", "  basePath: /api/v1",
  "server:", "  host: 127.0.0.1", "  port: 3000",
  "  corsOrigins:", "    - http://localhost:5173",
  "web:", "  title: VisionHub", "  apiBaseUrl: /api/v1",
  "catalog:", "  pageSize: 8", ""
].join("\n");

const developmentYaml = [
  "app:", "  environment: development",
  "server:", "  port: 3001", ""
].join("\n");

const databaseUrl = "postgresql://visionhub-test:unused@127.0.0.1:5432/visionhub?schema=visionhub";

test("merges defaults, common YAML, environment YAML, and environment variables in order", async () => {
  const configDir = await createConfigDirectory({
    "app.defaults.yaml": commonYaml,
    "app.yaml": "catalog:\n  pageSize: 9\n",
    "app.development.yaml": developmentYaml + "catalog:\n  pageSize: 10\n",
  });
  try {
    const config = await loadAppConfig({
      cwd: configDir,
      configDir,
      env: {
        NODE_ENV: "development",
        APP_CONFIG_PATH: "app.development.yaml",
        DATABASE_URL: databaseUrl,
        PORT: "3100",
        CATALOG_PAGE_SIZE: "12",
        CORS_ORIGINS: "http://localhost:5173,https://example.test",
      },
    });
    assert.equal(config.app.environment, "development");
    assert.equal(config.server.port, 3100);
    assert.deepEqual(config.server.corsOrigins, ["http://localhost:5173", "https://example.test"]);
    assert.equal(config.catalog.pageSize, 12);
    assert.equal(config.database.url, databaseUrl);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test("fails when the explicitly selected YAML file is missing", async () => {
  const configDir = await createConfigDirectory({ "app.defaults.yaml": commonYaml });
  try {
    await assert.rejects(
      loadAppConfig({
        cwd: configDir,
        configDir,
        env: { NODE_ENV: "production", APP_CONFIG_PATH: "missing-production.yaml", DATABASE_URL: databaseUrl },
      }),
      /Configuration file not found.*missing-production\.yaml/,
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test("rejects missing or malformed database configuration without exposing a supplied value", async () => {
  const configDir = await createConfigDirectory({
    "app.defaults.yaml": commonYaml,
    "app.development.yaml": developmentYaml,
  });
  try {
    await assert.rejects(
      loadAppConfig({ cwd: configDir, configDir, env: { NODE_ENV: "development" } }),
      /database\.url: required; set DATABASE_URL/,
    );
    await assert.rejects(
      loadAppConfig({
        cwd: configDir,
        configDir,
        env: { NODE_ENV: "development", DATABASE_URL: "not-a-real-password-or-url" },
      }),
      (error) => {
        assert.match(error.message, /database\.url: must be a valid PostgreSQL connection URL/);
        assert.doesNotMatch(error.message, /not-a-real-password-or-url/);
        return true;
      },
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test("rejects a short admin secret without displaying its value", async () => {
  const configDir = await createConfigDirectory({
    "app.defaults.yaml": commonYaml,
    "app.development.yaml": developmentYaml,
  });
  try {
    await assert.rejects(
      loadAppConfig({
        cwd: configDir,
        configDir,
        env: {
          NODE_ENV: "development",
          DATABASE_URL: databaseUrl,
          ADMIN_USERNAME: "admin",
          ADMIN_PASSWORD: "example-password",
          ADMIN_SESSION_SECRET: "short-secret-never-log",
        },
      }),
      (error) => {
        assert.match(error.message, /admin\.sessionSecret/);
        assert.doesNotMatch(error.message, /short-secret-never-log/);
        return true;
      },
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test("loads an independent desktop API endpoint and allows an environment override", async () => {
  const configDir = await createConfigDirectory({
    "desktop.yaml": "desktop:\n  apiBaseUrl: http://127.0.0.1:3000/api/v1\n",
  });
  try {
    assert.equal(
      (await loadDesktopConfig({ cwd: configDir, configDir, env: {} })).desktop.apiBaseUrl,
      "http://127.0.0.1:3000/api/v1",
    );
    assert.equal(
      (await loadDesktopConfig({
        cwd: configDir,
        configDir,
        env: { DESKTOP_API_BASE_URL: "https://media.example.test/api/v1" },
      })).desktop.apiBaseUrl,
      "https://media.example.test/api/v1",
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test("rejects desktop API endpoints containing credentials, query strings, fragments, or unsupported schemes", async () => {
  const configDir = await createConfigDirectory({
    "desktop.yaml": "desktop:\n  apiBaseUrl: http://127.0.0.1:3001/api/v1\n",
  });
  try {
    for (const apiBaseUrl of [
      "https://user:secret@api.example.test/api/v1",
      "https://api.example.test/api/v1?token=secret",
      "https://api.example.test/api/v1#fragment",
      "file:///tmp/api",
      "javascript:alert(1)",
    ]) {
      await assert.rejects(
        loadDesktopConfig({
          cwd: configDir,
          configDir,
          env: { DESKTOP_API_BASE_URL: apiBaseUrl },
        }),
        /must be an HTTP\(S\) API base URL without credentials, query, or hash/,
      );
    }
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

const validPlaybackSourcesYaml = `playback:
  providers:
    - id: example-source
      name: Example Source
      urlTemplate: https://player.example.test/watch/{contentId}
      webEmbedUrlTemplate: https://embed.example.test/player/{contentId}
      allowedOrigins:
        - https://player.example.test
        - https://embed.example.test
      playerSelector: ".player-container"
      readinessSelector: ".player-container video"
      timeoutMs: 15000
`;

test("loads playback provider configuration and validates URL templates against the HTTPS allowlist", async () => {
  const configDir = await createConfigDirectory({
    "playback-sources.yaml": validPlaybackSourcesYaml,
  });
  try {
    const config = await loadPlaybackSourcesConfig({ cwd: configDir, configDir, env: {} });
    assert.equal(config.playback.providers.length, 1);
    assert.equal(config.playback.providers[0].id, "example-source");
    assert.deepEqual(config.playback.providers[0].allowedOrigins, [
      "https://player.example.test",
      "https://embed.example.test",
    ]);
    assert.equal(config.playback.providers[0].timeoutMs, 15000);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test("defaults the playback provider timeout to 60 seconds when omitted", async () => {
  const configDir = await createConfigDirectory({
    "playback-sources.yaml": validPlaybackSourcesYaml.replace("      timeoutMs: 15000\n", ""),
  });
  try {
    const config = await loadPlaybackSourcesConfig({ cwd: configDir, configDir, env: {} });
    assert.equal(config.playback.providers[0].timeoutMs, 60000);
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test("rejects provider templates outside allowlisted origins, duplicate IDs, and non-HTTPS origins", async () => {
  const configDir = await createConfigDirectory({
    "playback-sources.yaml": validPlaybackSourcesYaml
      .replace("https://player.example.test/watch/{contentId}", "https://outside.example.test/watch/{contentId}"),
  });
  try {
    await assert.rejects(
      loadPlaybackSourcesConfig({ cwd: configDir, configDir, env: {} }),
      /must resolve to an HTTPS URL on one of allowedOrigins/,
    );
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }

  const duplicateDir = await createConfigDirectory({});
  try {
    const duplicateProvider = [
      "    - id: example-source",
      "      name: Duplicate",
      "      urlTemplate: https://player.example.test/watch/{contentId}",
      "      allowedOrigins:",
      "        - https://player.example.test",
      "      playerSelector: .player",
    ].join("\n");
    const duplicateYaml = validPlaybackSourcesYaml + duplicateProvider + "\n";
    await writeFile(join(duplicateDir, "playback-sources.yaml"), duplicateYaml, "utf8");
    await assert.rejects(
      loadPlaybackSourcesConfig({ cwd: duplicateDir, configDir: duplicateDir, env: {} }),
      /provider IDs must be unique/,
    );
  } finally {
    await rm(duplicateDir, { recursive: true, force: true });
  }

  const insecureDir = await createConfigDirectory({
    "playback-sources.yaml": validPlaybackSourcesYaml.replace(
      "        - https://player.example.test",
      "        - http://player.example.test",
    ),
  });
  try {
    await assert.rejects(
      loadPlaybackSourcesConfig({ cwd: insecureDir, configDir: insecureDir, env: {} }),
      /must be an HTTPS origin/,
    );
  } finally {
    await rm(insecureDir, { recursive: true, force: true });
  }
});
