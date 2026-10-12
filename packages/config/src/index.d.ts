export const APP_CONFIG: unique symbol;

export type RuntimeEnvironment = "development" | "production" | "test";

export interface AppConfig {
  app: { name: string; environment: RuntimeEnvironment; basePath: string };
  server: { host: string; port: number; corsOrigins: string[] };
  web: { title: string; apiBaseUrl: string };
  player: { autoplay: boolean; muted: boolean; controls: string[] };
  catalog: { pageSize: number };
  database: { url: string };
  admin: {
    username?: string;
    password?: string;
    sessionSecret?: string;
    cookieSecure: boolean;
  };
}

export interface DesktopConfig {
  desktop: { apiBaseUrl: string };
}

export interface ConfigLoaderOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
  configDir?: string;
}

export function loadEnvironmentFiles(options?: { cwd?: string; envPaths?: string[] }): string[];
export function loadAppConfig(options?: ConfigLoaderOptions): Promise<AppConfig>;
export function loadDesktopConfig(options?: ConfigLoaderOptions): Promise<DesktopConfig>;
export const appConfigSchema: unknown;
export const desktopConfigSchema: unknown;
