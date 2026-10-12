import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { AppModule } from './app.module';

type AppConfig = {
  server?: { host?: string; port?: number; corsOrigins?: string[] };
};

async function loadConfig(): Promise<AppConfig> {
  const path = process.env.APP_CONFIG_PATH ?? 'configs/app.yaml';
  try {
    return parse(await readFile(path, 'utf8')) as AppConfig;
  } catch {
    return { server: { host: '0.0.0.0', port: 3000, corsOrigins: ['http://localhost:5173'] } };
  }
}

async function bootstrap() {
  const config = await loadConfig();
  const server = config.server ?? {};
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: server.corsOrigins ?? ['http://localhost:5173'] });
  const port = Number(process.env.PORT ?? server.port ?? 3000);
  await app.listen(port, server.host ?? '0.0.0.0');
  console.log(`VisionHub API listening on :${port}/api/v1`);
}
void bootstrap();
