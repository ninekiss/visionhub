import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const packageDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(packageDirectory, "../../..");
const defaultConfigDirectory = resolve(repositoryRoot, "configs");

export const APP_CONFIG = Symbol.for("@visionhub/config:APP_CONFIG");

const environmentSchema = z.enum(["development", "production", "test"]);

const postgresUrlSchema = z.string().trim().min(1).refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      Boolean(url.hostname) && url.pathname.length > 1;
  } catch {
    return false;
  }
}, { message: "must be a valid PostgreSQL connection URL" });

const corsOriginSchema = z.string().url().refine((value) => {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}, { message: "must be an HTTP(S) origin without a path" });

export const appConfigSchema = z.object({
  app: z.object({
    name: z.string().trim().min(1),
    environment: environmentSchema,
    basePath: z.string().trim().startsWith("/").refine((value) => value.length > 1 || value === "/", {
      message: "must be an absolute URL path",
    }),
  }).strict(),
  server: z.object({
    host: z.string().trim().min(1),
    port: z.coerce.number().int().min(1).max(65535),
    corsOrigins: z.array(corsOriginSchema).max(50),
  }).strict(),
  web: z.object({
    title: z.string().trim().min(1),
    apiBaseUrl: z.string().trim().min(1),
  }).strict(),
  player: z.object({
    autoplay: z.boolean(),
    muted: z.boolean(),
    controls: z.array(z.string().trim().min(1)).max(32),
  }).strict(),
  catalog: z.object({
    pageSize: z.coerce.number().int().min(1).max(50),
  }).strict(),
  database: z.object({
    url: postgresUrlSchema,
  }).strict(),
  admin: z.object({
    username: z.string().trim().min(1).optional(),
    password: z.string().min(1).optional(),
    sessionSecret: z.string().min(32).optional(),
    cookieSecure: z.boolean().default(false),
  }).strict().superRefine((admin, context) => {
    const enabled = Boolean(admin.username || admin.password || admin.sessionSecret);
    if (!enabled) return;
    if (!admin.username) {
      context.addIssue({ code: "custom", path: ["username"], message: "is required when admin access is enabled" });
    }
    if (!admin.password) {
      context.addIssue({ code: "custom", path: ["password"], message: "is required when admin access is enabled" });
    }
    if (!admin.sessionSecret) {
      context.addIssue({ code: "custom", path: ["sessionSecret"], message: "is required when admin access is enabled" });
    }
  }),
}).strict();

export const desktopConfigSchema = z.object({
  desktop: z.object({
    apiBaseUrl: z.string().trim().url().refine((value) => {
      try {
        const url = new URL(value);
        return (
          (url.protocol === "http:" || url.protocol === "https:") &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    }, { message: "must be an HTTP(S) API base URL without credentials, query, or hash" }),
  }).strict(),
}).strict();

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergeDeep(target, source) {
  if (!isObject(target) || !isObject(source)) return source;
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    result[key] = isObject(value) && isObject(result[key])
      ? mergeDeep(result[key], value)
      : value;
  }
  return result;
}

function getEnvironment(env) {
  const value = env.NODE_ENV || "development";
  const parsed = environmentSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error('Invalid configuration: NODE_ENV must be "development", "test", or "production".');
  }
  return parsed.data;
}

function resolveConfigDirectory({ env, cwd, configDir }) {
  if (configDir) return resolve(cwd, configDir);
  if (env.APP_CONFIG_DIR && env.APP_CONFIG_DIR.trim()) return resolve(cwd, env.APP_CONFIG_DIR);
  return defaultConfigDirectory;
}

function resolveConfiguredPath(configuredPath, context) {
  if (isAbsolute(configuredPath)) return configuredPath;
  const candidates = [
    resolve(context.cwd, configuredPath),
    resolve(context.configDir, configuredPath),
    resolve(repositoryRoot, configuredPath),
    resolve(context.cwd, "../../", configuredPath),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || candidates[0];
}

async function readYamlFile(filePath, options = {}) {
  const optional = options.optional === true;
  if (!existsSync(filePath)) {
    if (optional) return undefined;
    throw new Error('Configuration file not found: "' + filePath + '". Check the configured path and mount.');
  }

  let content;
  try {
    content = await readFile(filePath, "utf8");
  } catch {
    throw new Error('Unable to read configuration file "' + filePath + '". Check file permissions and mount settings.');
  }

  let value;
  try {
    value = parseYaml(content);
  } catch {
    throw new Error('Invalid YAML syntax in "' + filePath + '". Correct the file syntax and restart.');
  }

  if (!isObject(value)) {
    throw new Error('Configuration file "' + filePath + '" must contain a YAML mapping at its root.');
  }
  return value;
}

function getEnvironmentOverrides(env) {
  const overrides = {};

  const set = (path, value) => {
    let current = overrides;
    for (const part of path.slice(0, -1)) {
      if (!current[part]) current[part] = {};
      current = current[part];
    }
    current[path[path.length - 1]] = value;
  };
  const nonEmpty = (name) => typeof env[name] === "string" && env[name].trim() !== "";
  const assign = (name, path, mapper = (value) => value) => {
    if (nonEmpty(name)) set(path, mapper(env[name]));
  };

  assign("NODE_ENV", ["app", "environment"]);
  assign("APP_NAME", ["app", "name"]);
  assign("API_BASE_PATH", ["app", "basePath"]);
  assign("HOST", ["server", "host"]);
  assign("PORT", ["server", "port"]);
  assign("CORS_ORIGINS", ["server", "corsOrigins"], (value) =>
    value.split(",").map((origin) => origin.trim()).filter(Boolean));
  assign("WEB_TITLE", ["web", "title"]);
  assign("WEB_API_BASE_URL", ["web", "apiBaseUrl"]);
  assign("CATALOG_PAGE_SIZE", ["catalog", "pageSize"]);
  assign("DATABASE_URL", ["database", "url"]);
  assign("ADMIN_USERNAME", ["admin", "username"], (value) => value.trim());
  assign("ADMIN_PASSWORD", ["admin", "password"]);
  assign("ADMIN_SESSION_SECRET", ["admin", "sessionSecret"]);

  if (nonEmpty("PORT") && !/^\d+$/.test(env.PORT.trim())) {
    throw new Error("Invalid configuration: PORT must be an integer between 1 and 65535.");
  }
  if (nonEmpty("ADMIN_COOKIE_SECURE")) {
    const value = env.ADMIN_COOKIE_SECURE.trim().toLowerCase();
    if (value !== "true" && value !== "false") {
      throw new Error('Invalid configuration: ADMIN_COOKIE_SECURE must be "true" or "false".');
    }
    set(["admin", "cookieSecure"], value === "true");
  }
  return overrides;
}

function baseDefaults(environment) {
  return {
    app: { name: "VisionHub", environment, basePath: "/api/v1" },
    server: {
      host: "0.0.0.0",
      port: environment === "production" ? 3000 : 3001,
      corsOrigins: environment === "production"
        ? []
        : ["http://localhost:5173", "http://127.0.0.1:5173"],
    },
    web: { title: "VisionHub", apiBaseUrl: "/api/v1" },
    player: {
      autoplay: false,
      muted: false,
      controls: [
        "play-large", "play", "progress", "current-time", "duration",
        "mute", "volume", "settings", "pip", "fullscreen",
      ],
    },
    catalog: { pageSize: 8 },
    database: {},
    admin: { cookieSecure: false },
  };
}

function formatValidationError(error, rawConfig) {
  const details = error.issues.map((issue) => {
    const field = issue.path.length ? issue.path.join(".") : "configuration";
    if (field === "database.url") {
      return rawConfig.database && rawConfig.database.url
        ? "database.url: must be a valid PostgreSQL connection URL"
        : "database.url: required; set DATABASE_URL or add database.url to configs/secrets.yaml";
    }
    return field + ": " + issue.message;
  });
  return "VisionHub configuration validation failed:\n- " + details.join("\n- ") +
    "\nReview the configuration files and environment variables. Secret values are not shown.";
}

function parseConfig(schema, rawConfig, kind) {
  const result = schema.safeParse(rawConfig);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const field = issue.path.length ? issue.path.join(".") : "configuration";
      return field + ": " + issue.message;
    });
    throw new Error(kind + " validation failed:\n- " + issues.join("\n- ") +
      "\nSensitive values are omitted from this message.");
  }
  return result.data;
}

/**
 * Load .env files without overriding variables already provided by the process/container.
 * A workspace-local .env is considered before the repository-root .env.
 */
export function loadEnvironmentFiles(options = {}) {
  const cwd = resolve(options.cwd || process.cwd());
  const paths = options.envPaths || [resolve(cwd, ".env"), resolve(repositoryRoot, ".env")];
  const loaded = [];
  for (const filePath of [...new Set(paths)]) {
    if (!existsSync(filePath)) continue;
    process.loadEnvFile(filePath);
    loaded.push(filePath);
  }
  return loaded;
}

/**
 * Merge order:
 * built-in defaults -> app.defaults.yaml -> optional app.yaml -> environment YAML
 * -> optional secrets YAML -> environment variables.
 * Nested objects merge recursively; arrays replace the previous array as a whole.
 */
export async function loadAppConfig(options = {}) {
  const env = options.env || process.env;
  const cwd = resolve(options.cwd || process.cwd());
  const configDir = resolve(options.configDir ? resolve(cwd, options.configDir) :
    (env.APP_CONFIG_DIR ? resolve(cwd, env.APP_CONFIG_DIR) : defaultConfigDirectory));
  const environment = getEnvironment(env);
  const context = { cwd, configDir };

  const commonFile = env.APP_CONFIG_COMMON_PATH
    ? resolveConfiguredPath(env.APP_CONFIG_COMMON_PATH, context)
    : resolve(configDir, "app.defaults.yaml");
  const environmentFile = env.APP_CONFIG_PATH
    ? resolveConfiguredPath(env.APP_CONFIG_PATH, context)
    : resolve(configDir, "app." + environment + ".yaml");
  const secretsFile = env.APP_SECRETS_PATH
    ? resolveConfiguredPath(env.APP_SECRETS_PATH, context)
    : resolve(configDir, "secrets.yaml");

  const layers = [
    baseDefaults(environment),
    await readYamlFile(commonFile),
    await readYamlFile(resolve(configDir, "app.yaml"), { optional: true }),
    await readYamlFile(environmentFile),
    await readYamlFile(secretsFile, { optional: !env.APP_SECRETS_PATH }),
    getEnvironmentOverrides(env),
  ];

  const rawConfig = layers.reduce((current, layer) => mergeDeep(current, layer || {}), {});
  const result = appConfigSchema.safeParse(rawConfig);
  if (!result.success) throw new Error(formatValidationError(result.error, rawConfig));
  return result.data;
}

/**
 * Desktop settings are validated independently from Web/API server settings.
 */
export async function loadDesktopConfig(options = {}) {
  const env = options.env || process.env;
  const cwd = resolve(options.cwd || process.cwd());
  const configDir = resolve(options.configDir ? resolve(cwd, options.configDir) :
    (env.APP_CONFIG_DIR ? resolve(cwd, env.APP_CONFIG_DIR) : defaultConfigDirectory));
  const context = { cwd, configDir };
  const filePath = env.DESKTOP_CONFIG_PATH
    ? resolveConfiguredPath(env.DESKTOP_CONFIG_PATH, context)
    : resolve(configDir, "desktop.yaml");

  const rawConfig = await readYamlFile(filePath);
  if (env.DESKTOP_API_BASE_URL && env.DESKTOP_API_BASE_URL.trim()) {
    if (!rawConfig.desktop) rawConfig.desktop = {};
    rawConfig.desktop.apiBaseUrl = env.DESKTOP_API_BASE_URL.trim();
  }
  return parseConfig(desktopConfigSchema, rawConfig, "VisionHub desktop configuration");
}
