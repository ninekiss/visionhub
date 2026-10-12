import "reflect-metadata";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { loadAppConfig } from "./config/app-config.js";

function loadEnvironment(): void {
  const localEnvPath = resolve(process.cwd(), ".env");
  const rootEnvPath = resolve(process.cwd(), "../../.env");
  if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}

async function bootstrap(): Promise<void> {
  loadEnvironment();
  const config = await loadAppConfig();
  const server = config.server ?? {};
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api/v1");
  app.enableCors({
    origin: server.corsOrigins ?? ["http://localhost:5173"],
  });

  const port = Number(process.env.PORT ?? server.port ?? 3000);
  await app.listen(port, server.host ?? "0.0.0.0");
  console.log(`VisionHub API listening on :${port}/api/v1`);
}

void bootstrap().catch((error: unknown) => {
  console.error("VisionHub API failed to start:", error);
  process.exitCode = 1;
});
