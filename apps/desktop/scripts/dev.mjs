import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(desktopDirectory, "../..");
const rendererUrl = "http://127.0.0.1:5174";
const pnpmExecutable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const windowsShell = process.platform === "win32";

const vite = spawn(
  pnpmExecutable,
  ["--filter", "@visionhub/web", "exec", "vite", "--host", "127.0.0.1", "--port", "5174", "--strictPort"],
  { cwd: workspaceRoot, stdio: "inherit", shell: windowsShell },
);

let electron = null;
let stopping = false;

function terminate(child) {
  if (child && child.exitCode === null && !child.killed) child.kill("SIGTERM");
}

function cleanup() {
  if (stopping) return;
  stopping = true;
  terminate(electron);
  terminate(vite);
}

process.once("SIGINT", cleanup);
process.once("SIGTERM", cleanup);

async function waitForRenderer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (stopping || vite.exitCode !== null) {
      throw new Error("Vite exited before the Electron renderer became ready.");
    }
    try {
      const response = await fetch(rendererUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for the Vite renderer at " + rendererUrl);
}

try {
  vite.once("error", (error) => {
    console.error("Unable to launch Vite:", error);
    cleanup();
  });
  await waitForRenderer();
  if (stopping) process.exit(1);

  electron = spawn(
    process.execPath,
    [resolve(desktopDirectory, "node_modules/electron/cli.js"), "."],
    {
      cwd: desktopDirectory,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "development", VITE_DEV_SERVER_URL: rendererUrl },
    },
  );

  electron.once("error", (error) => {
    console.error("Unable to launch Electron:", error);
    cleanup();
  });
  const exitCode = await new Promise((resolveExit) => electron.once("exit", resolveExit));
  if (!stopping) {
    stopping = true;
    terminate(vite);
    process.exitCode = typeof exitCode === "number" ? exitCode : 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  cleanup();
  process.exitCode = 1;
}
