import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { loadAppConfig } from '../dist/config/app-config.js';

const previousNodeEnv = process.env.NODE_ENV;
const previousConfigPath = process.env.APP_CONFIG_PATH;

function restoreEnvironment() {
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  if (previousConfigPath === undefined) delete process.env.APP_CONFIG_PATH;
  else process.env.APP_CONFIG_PATH = previousConfigPath;
}

test('loads development configuration from YAML', async () => {
  try {
    process.env.NODE_ENV = 'development';
    process.env.APP_CONFIG_PATH = resolve(process.cwd(), '../../configs/app.development.yaml');
    const config = await loadAppConfig();
    assert.equal(config.app?.environment, 'development');
    assert.equal(config.server?.port, 3001);
    assert.deepEqual(config.server?.corsOrigins, ['http://localhost:5173', 'http://127.0.0.1:5173']);
    assert.equal(config.catalog?.pageSize, 8);
  } finally {
    restoreEnvironment();
  }
});

test('loads production configuration from YAML', async () => {
  try {
    process.env.NODE_ENV = 'production';
    process.env.APP_CONFIG_PATH = resolve(process.cwd(), '../../configs/app.production.yaml');
    const config = await loadAppConfig();
    assert.equal(config.app?.environment, 'production');
    assert.equal(config.server?.port, 3000);
    assert.deepEqual(config.server?.corsOrigins, []);
  } finally {
    restoreEnvironment();
  }
});
