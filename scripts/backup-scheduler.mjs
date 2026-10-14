#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = path.join(ROOT, "scripts", "db-tools.mjs");
const BACKUP_ROOT = path.resolve(process.env.VISIONHUB_BACKUP_DIR || "/backups");
const STATE_PATH = path.join(BACKUP_ROOT, ".scheduler-state.json");
const MODE = process.env.BACKUP_DATABASE_MODE || "direct";
const SCHEDULE_TIME = process.env.BACKUP_SCHEDULE_TIME || "02:30";
const TIME_ZONE = process.env.BACKUP_TIMEZONE || "UTC";
const RETRY_MINUTES = Number.parseInt(process.env.BACKUP_RETRY_MINUTES || "15", 10);
const REMOTE = (process.env.BACKUP_REMOTE || "").replace(/\/+$/, "");
const ONCE = process.argv.includes("--once");

if (!["managed", "direct", "network"].includes(MODE)) {
  throw new Error("BACKUP_DATABASE_MODE must be managed, direct, or network.");
}
if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(SCHEDULE_TIME)) {
  throw new Error("BACKUP_SCHEDULE_TIME must use 24-hour HH:mm format, for example 02:30.");
}
if (!Number.isInteger(RETRY_MINUTES) || RETRY_MINUTES < 1) {
  throw new Error("BACKUP_RETRY_MINUTES must be an integer >= 1.");
}
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function nowParts(date = new Date()) {
  const result = {};
  for (const part of dateFormatter.formatToParts(date)) {
    if (part.type !== "literal") result[part.type] = part.value;
  }
  result.date = result.year + "-" + result.month + "-" + result.day;
  result.time = result.hour + ":" + result.minute;
  return result;
}

async function readState() {
  try {
    const state = JSON.parse(await readFile(STATE_PATH, "utf8"));
    return {
      localBackupDate: typeof state.localBackupDate === "string" ? state.localBackupDate : "",
      remoteUploadDate: typeof state.remoteUploadDate === "string" ? state.remoteUploadDate : "",
    };
  } catch (error) {
    if (error && error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return { localBackupDate: "", remoteUploadDate: "" };
  }
}

async function saveState(state) {
  await mkdir(BACKUP_ROOT, { recursive: true });
  const temp = STATE_PATH + ".tmp";
  await writeFile(temp, JSON.stringify(state, null, 2) + "\n");
  await rename(temp, STATE_PATH);
}

function run(program, args) {
  console.log("==> " + program + " " + args.join(" "));
  const result = spawnSync(program, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(program + " exited with status " + (result.status === null ? "unknown" : result.status));
  }
}

function runDbTool(command) {
  run(process.execPath, [TOOLS, command]);
}

async function hasPhysicalFullBackup() {
  const root = path.join(BACKUP_ROOT, "physical");
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("full-")) continue;
    const metadataPath = path.join(root, entry.name, "metadata.json");
    try {
      const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
      if (metadata.id === entry.name && metadata.type === "full") return true;
    } catch {
      // Incomplete folders are ignored; the backup command will create a new full root if needed.
    }
  }
  return false;
}

async function createLocalBackups(parts) {
  console.log("Starting VisionHub backup for " + parts.date + " (" + MODE + ", " + TIME_ZONE + ").");
  runDbTool("logical-backup");

  if (MODE === "managed") {
    runDbTool("physical-init");
    const makeFull = !(await hasPhysicalFullBackup()) || parts.weekday === "Sun";
    runDbTool(makeFull ? "physical-backup-full" : "physical-backup-incr");
  }

  console.log("Local backup completed for " + parts.date + ".");
}

function uploadDirectory(source, destination) {
  run("rclone", [
    "copy",
    source,
    destination,
    "--create-empty-src-dirs",
    "--checkers", "8",
    "--transfers", "4",
    "--log-level", "INFO",
  ]);
}

async function uploadOffsiteBackups() {
  if (!REMOTE) return;
  // Copy rather than sync: a local retention cleanup or local disk loss must
  // never silently delete the only off-host copy. Apply remote lifecycle rules
  // at the object-storage provider after choosing a chain-safe retention period.
  uploadDirectory(path.join(BACKUP_ROOT, "logical"), REMOTE + "/logical");
  if (MODE === "managed") {
    uploadDirectory(path.join(BACKUP_ROOT, "physical"), REMOTE + "/physical");
  }
  console.log("Off-site backup upload completed to " + REMOTE + ".");
}

async function runDailyJob(force = false) {
  const parts = nowParts();
  const state = await readState();

  if (force || state.localBackupDate !== parts.date) {
    await createLocalBackups(parts);
    state.localBackupDate = parts.date;
    await saveState(state);
  } else {
    console.log("Local backup already succeeded today (" + parts.date + "); skipping duplicate creation.");
  }

  if (REMOTE && state.remoteUploadDate !== state.localBackupDate) {
    await uploadOffsiteBackups();
    state.remoteUploadDate = state.localBackupDate;
    await saveState(state);
  } else if (!REMOTE) {
    console.log("BACKUP_REMOTE is empty; off-site upload is disabled.");
  } else {
    console.log("Off-site backup upload already succeeded for " + state.remoteUploadDate + ".");
  }
}

async function tick() {
  const parts = nowParts();
  if (parts.time < SCHEDULE_TIME) return;
  const state = await readState();
  const localPending = state.localBackupDate !== parts.date;
  const remotePending = Boolean(REMOTE) && state.remoteUploadDate !== state.localBackupDate;
  if (!localPending && !remotePending) return;
  await runDailyJob(false);
}

async function main() {
  // Validate the configured timezone before entering the permanent loop.
  const parts = nowParts();
  await mkdir(BACKUP_ROOT, { recursive: true });

  if (ONCE) {
    await runDailyJob(true);
    return;
  }

  console.log("VisionHub backup scheduler started.");
  console.log("Mode: " + MODE + "; daily time: " + SCHEDULE_TIME + "; timezone: " + TIME_ZONE + "; retry interval: " + RETRY_MINUTES + " minutes.");
  console.log(REMOTE ? "Off-site destination configured: " + REMOTE : "Off-site destination not configured; backups remain on the host volume.");
  console.log("A missed schedule is caught up after startup; failed runs are retried.");

  let retryAt = 0;
  let running = false;
  const intervalMs = 30_000;
  for (;;) {
    if (!running && Date.now() >= retryAt) {
      try {
        await tick();
        retryAt = 0;
      } catch (error) {
        console.error("Backup attempt failed: " + (error instanceof Error ? error.stack || error.message : String(error)));
        retryAt = Date.now() + RETRY_MINUTES * 60_000;
        console.error("Retrying in " + RETRY_MINUTES + " minutes.");
      }
    }
    running = true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    running = false;
  }
}

main().catch((error) => {
  console.error("Backup scheduler failed: " + (error instanceof Error ? error.stack || error.message : String(error)));
  process.exitCode = 1;
});
