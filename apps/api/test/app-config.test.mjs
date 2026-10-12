import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { loadAppConfig } from '../dist/config/app-config.js';

const envKeys = [
  'NODE_ENV', 'APP_CONFIG_PATH', 'DATABASE_URL', 'PORT', 'HOST', 'CORS_ORIGINS',
  'CATALOG_PAGE_SIZE', 'APP_CONFIG_COMMON_PATH', 'APP_SECRETS_PATH',
  'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'ADMIN_SESSION_SECRET', 'ADMIN_COOKIE_SECURE',
];
const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const testDatabaseUrl = 'postgresql://test:unused@127.0.0.1:5432/visionhub?schema=visionhub';

function resetEnvironment() {
  for (const key of envKeys) delete process.env[key];
}
function restoreEnvironment() {
  for (const key of envKeys) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
}

test('loads development configuration from YAML', async () => {
  try {
    resetEnvironment();
    process.env.NODE_ENV = 'development';
    process.env.APP_CONFIG_PATH = resolve(process.cwd(), '../../configs/app.development.yaml');
    process.env.DATABASE_URL = testDatabaseUrl;
    const config = await loadAppConfig();
    assert.equal(config.app.environment, 'development');
    assert.equal(config.server.port, 3001);
    assert.deepEqual(config.server.corsOrigins, ['http://localhost:5173', 'http://127.0.0.1:5173']);
    assert.equal(config.catalog.pageSize, 8);
    assert.equal(config.database.url, testDatabaseUrl);
  } finally {
    restoreEnvironment();
  }
});

test('loads production configuration from YAML', async () => {
  try {
    resetEnvironment();
    process.env.NODE_ENV = 'production';
    process.env.APP_CONFIG_PATH = resolve(process.cwd(), '../../configs/app.production.yaml');
    process.env.DATABASE_URL = testDatabaseUrl;
    const config = await loadAppConfig();
    assert.equal(config.app.environment, 'production');
    assert.equal(config.server.port, 3000);
    assert.deepEqual(config.server.corsOrigins, []);
  } finally {
    restoreEnvironment();
  }
});

test('fails early with a field-specific error when required database configuration is missing', async () => {
  try {
    resetEnvironment();
    process.env.NODE_ENV = 'production';
    process.env.APP_CONFIG_PATH = resolve(process.cwd(), '../../configs/app.production.yaml');
    await assert.rejects(loadAppConfig(), /database\.url: required; set DATABASE_URL/);
  } finally {
    restoreEnvironment();
  }
});
