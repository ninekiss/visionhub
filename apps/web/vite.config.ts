import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const configDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(configDirectory, "../..");

export default defineConfig(({ mode }) => {
  // Read the repository-level .env so local Vite uses the same configured API dev port.
  const env = loadEnv(mode, repositoryRoot, "");
  const apiPort = env.API_DEV_PORT || "3001";
  const proxyTarget = env.API_DEV_PROXY_TARGET || `http://127.0.0.1:${apiPort}`;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: "0.0.0.0",
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
