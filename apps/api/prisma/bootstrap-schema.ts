import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

function loadEnvironment(): void {
  const localEnvPath = resolve(process.cwd(), ".env");
  const rootEnvPath = resolve(process.cwd(), "../../.env");
  if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);
  if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);
}

async function bootstrapSchema(): Promise<void> {
  loadEnvironment();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required before creating the VisionHub schema.");
  }

  const pool = new Pool({ connectionString });
  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS "visionhub"');
    console.log('PostgreSQL schema "visionhub" is ready.');
  } finally {
    await pool.end();
  }
}

void bootstrapSchema().catch((error: unknown) => {
  console.error("Could not prepare the VisionHub PostgreSQL schema:", error);
  process.exitCode = 1;
});
