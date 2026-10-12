import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "prisma/config";

const localEnvPath = resolve(process.cwd(), ".env");
const rootEnvPath = resolve(process.cwd(), "../../.env");

if (existsSync(localEnvPath)) process.loadEnvFile(localEnvPath);
if (existsSync(rootEnvPath)) process.loadEnvFile(rootEnvPath);

function useVisionHubSchema(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set("schema", "visionhub");
  return url.toString();
}

const datasourceUrl = useVisionHubSchema(
  process.env.DATABASE_URL ??
    "postgresql://build:build@127.0.0.1:5432/visionhub?schema=visionhub",
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
