import { loadEnvironmentFiles } from "@visionhub/config";
import { defineConfig } from "prisma/config";

loadEnvironmentFiles();

function useVisionHubSchema(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("schema", "visionhub");
  return url.toString();
}

// Used only by Prisma CLI schema-generation/validation commands when no DB is supplied.
// API runtime startup does not use this placeholder; it requires DATABASE_URL via Zod.
const datasourceUrl = useVisionHubSchema(
  process.env.DATABASE_URL ?? "postgresql://build:build@127.0.0.1:5432/visionhub?schema=visionhub",
);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: datasourceUrl,
  },
});
