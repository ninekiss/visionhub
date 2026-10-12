import { spawn } from "node:child_process";
import { loadEnvironmentFiles } from "@visionhub/config";

loadEnvironmentFiles();

const env = {
  ...process.env,
  NODE_ENV: "development",
  PORT: process.env.API_DEV_PORT || "3001",
  APP_CONFIG_PATH: process.env.APP_CONFIG_PATH_DEV || "configs/app.development.yaml",
};

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(command, ["exec", "tsx", "watch", "src/main.ts"], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("Unable to start the development API:", error.message);
  process.exitCode = 1;
});

child.on("close", (code) => {
  process.exitCode = code ?? 1;
});
