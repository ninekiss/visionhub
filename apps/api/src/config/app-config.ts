import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

export interface AppConfig {
  app?: {
    name?: string;
    environment?: string;
    basePath?: string;
  };
  server?: {
    host?: string;
    port?: number;
    corsOrigins?: string[];
  };
  web?: {
    title?: string;
    apiBaseUrl?: string;
  };
  catalog?: {
    pageSize?: number;
    mockData?: boolean;
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');

const DEFAULT_CONFIG: AppConfig = {
  app: {
    name: 'VisionHub',
    environment: 'development',
    basePath: '/api/v1',
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    corsOrigins: ['http://localhost:5173'],
  },
  web: {
    title: 'VisionHub',
    apiBaseUrl: '/api/v1',
  },
  catalog: {
    pageSize: 8,
    mockData: true,
  },
};

export async function loadAppConfig(): Promise<AppConfig> {
  const configPath = process.env.APP_CONFIG_PATH ?? 'configs/app.yaml';

  try {
    const parsed = parse(await readFile(configPath, 'utf8')) as AppConfig | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return DEFAULT_CONFIG;
    }

    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      app: { ...DEFAULT_CONFIG.app, ...parsed.app },
      server: { ...DEFAULT_CONFIG.server, ...parsed.server },
      web: { ...DEFAULT_CONFIG.web, ...parsed.web },
      catalog: { ...DEFAULT_CONFIG.catalog, ...parsed.catalog },
    };
  } catch {
    // Local development remains runnable before configs/app.yaml is created.
    return DEFAULT_CONFIG;
  }
}
