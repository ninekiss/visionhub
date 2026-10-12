import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadAppConfig } from './config/app-config';

async function bootstrap() {
  const config = await loadAppConfig();
  const server = config.server ?? {};
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: server.corsOrigins ?? ['http://localhost:5173'],
  });

  const port = Number(process.env.PORT ?? server.port ?? 3000);
  await app.listen(port, server.host ?? '0.0.0.0');
  console.log(`VisionHub API listening on :${port}/api/v1`);
}

void bootstrap();
