import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { loadAppConfig, loadEnvironmentFiles } from "@visionhub/config";
import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  loadEnvironmentFiles();
  // Validate runtime configuration before initializing application services or connecting to PostgreSQL.
  const config = await loadAppConfig();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const globalPrefix = config.app.basePath.replace(/^\/+|\/+$/g, "");
  if (globalPrefix) app.setGlobalPrefix(globalPrefix);
  app.enableCors({ origin: config.server.corsOrigins });

  await app.listen(config.server.port, config.server.host);
  console.log("VisionHub API listening on :" + config.server.port + config.app.basePath);
}

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected startup error.";
  console.error("VisionHub API failed to start:", message);
  process.exitCode = 1;
});
