export const APP_CONFIG: unique symbol;

export type RuntimeEnvironment = "development" | "production" | "test";

export interface PlaybackProviderConfig {
  id: string;
  name: string;
  urlTemplate: string;
  webEmbedUrlTemplate?: string;
  allowedOrigins: string[];
  playerSelector: string;
  readinessSelector?: string;
  timeoutMs: number;
}

export interface PlaybackSourcesConfig {
  playback: { providers: PlaybackProviderConfig[] };
}

export interface AppConfig {
  app: { name: string; environment: RuntimeEnvironment; basePath: string };
  server: { host: string; port: number; corsOrigins: string[] };
  web: { title: string; apiBaseUrl: string };
  player: { autoplay: boolean; muted: boolean; controls: string[] };
  catalog: { pageSize: number };
  database: { url: string };
  playback: { providers: PlaybackProviderConfig[] };
  admin: {
    username?: string;
    password?: string;
    sessionSecret?: string;
    cookieSecure: boolean;
  };
}

export interface DesktopConfig {
  desktop: { apiBaseUrl: string; extensionsDir?: string };
}

export interface ConfigLoaderOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
  configDir?: string;
}

export function loadEnvironmentFiles(options?: { cwd?: string; envPaths?: string[] }): string[];
export function loadAppConfig(options?: ConfigLoaderOptions): Promise<AppConfig>;
export function loadDesktopConfig(options?: ConfigLoaderOptions): Promise<DesktopConfig>;
export function loadPlaybackSourcesConfig(options?: ConfigLoaderOptions): Promise<PlaybackSourcesConfig>;
export const playbackSourcesConfigSchema: unknown;
export const appConfigSchema: unknown;
export const desktopConfigSchema: unknown;
