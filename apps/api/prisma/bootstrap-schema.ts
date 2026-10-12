import { Pool } from "pg";
import { loadEnvironmentFiles } from "@visionhub/config";

async function bootstrapSchema(): Promise<void> {
  loadEnvironmentFiles();
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
  const message = error instanceof Error ? error.message : "Unexpected database setup error.";
  console.error("Could not prepare the VisionHub PostgreSQL schema:", message);
  process.exitCode = 1;
});
