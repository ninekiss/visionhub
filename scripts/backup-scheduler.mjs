#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { access, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeAlertMessage, sendBackupAlert } from "./backup-alerts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOLS = path.join(ROOT, "scripts", "db-tools.mjs");
const BACKUP_ROOT = path.resolve(process.env.VISIONHUB_BACKUP_DIR || "/backups");
const STATE_PATH = path.join(BACKUP_ROOT, ".scheduler-state.json");
const ENCRYPTED_PENDING_ROOT = path.join(BACKUP_ROOT, ".encrypted-pending");
const MODE = process.env.BACKUP_DATABASE_MODE || "direct";
const SCHEDULE_TIME = process.env.BACKUP_SCHEDULE_TIME || "02:30";
const TIME_ZONE = process.env.BACKUP_TIMEZONE || "UTC";
const RETRY_MINUTES = Number.parseInt(process.env.BACKUP_RETRY_MINUTES || "15", 10);
const REMOTE = (process.env.BACKUP_REMOTE || "").replace(/\/+$/, "");
const AGE_RECIPIENTS = (process.env.BACKUP_AGE_RECIPIENTS || "").split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
const ONCE = process.argv.includes("--once");
const ALERT_WEBHOOK_ENABLED = Boolean((process.env.BACKUP_ALERT_WEBHOOK_URL || "").trim());
let currentPhase = "scheduled_backup";

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

function normalizeLastFailure(value) {
  if (!value || typeof value !== "object" || typeof value.phase !== "string") return null;
  return {
    phase: value.phase,
    occurredAt: typeof value.occurredAt === "string" ? value.occurredAt : "",
    message: sanitizeAlertMessage(value.message ?? ""),
    consecutiveFailures: Number.isInteger(value.consecutiveFailures) && value.consecutiveFailures > 0
      ? value.consecutiveFailures
      : 1,
    backupDate: typeof value.backupDate === "string" ? value.backupDate : "",
  };
}

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
      encryptionVersion: state.encryptionVersion === 1 ? 1 : 0,
      uploadedLogicalIds: Array.isArray(state.uploadedLogicalIds) ? state.uploadedLogicalIds.filter((value) => typeof value === "string") : [],
      uploadedPhysicalIds: Array.isArray(state.uploadedPhysicalIds) ? state.uploadedPhysicalIds.filter((value) => typeof value === "string") : [],
      lastFailure: normalizeLastFailure(state.lastFailure),
    };
  } catch (error) {
    if (error && error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
    return {
      localBackupDate: "",
      remoteUploadDate: "",
      encryptionVersion: 0,
      uploadedLogicalIds: [],
      uploadedPhysicalIds: [],
      lastFailure: null,
    };
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
  currentPhase = "logical_backup";
  runDbTool("logical-backup");

  if (MODE === "managed") {
    currentPhase = "physical_backup_preflight";
    runDbTool("physical-init");
    const makeFull = !(await hasPhysicalFullBackup()) || parts.weekday === "Sun";
    currentPhase = makeFull ? "physical_backup_full" : "physical_backup_incremental";
    runDbTool(makeFull ? "physical-backup-full" : "physical-backup-incr");
  }

  console.log("Local backup completed for " + parts.date + ".");
}

function waitForChild(child, label) {
  return new Promise((resolve, reject) => {
    child.once("error", (error) => reject(new Error(label + " failed to start: " + error.message)));
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(label + " exited with code " + (code === null ? "null" : code) + (signal ? " (signal " + signal + ")" : "")));
    });
  });
}

async function encryptArchive(sourceDirectory, members, targetPath) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  await rm(targetPath, { force: true });
  const tar = spawn("tar", ["-cf", "-", "-C", sourceDirectory, ...members], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const ageArgs = [
    "--encrypt",
    ...AGE_RECIPIENTS.flatMap((recipient) => ["--recipient", recipient]),
    "--output", targetPath,
  ];
  // Only public recipients are supplied to age. The private identity never
  // enters the cloud VM or the upload container.
  const age = spawn("age", ageArgs, { stdio: ["pipe", "ignore", "inherit"] });
  const tarDone = waitForChild(tar, "tar");
  const ageDone = waitForChild(age, "age encryption");
  const streamDone = pipeline(tar.stdout, age.stdin);
  try {
    await Promise.all([tarDone, ageDone, streamDone]);
  } catch (error) {
    tar.kill();
    age.kill();
    await Promise.allSettled([tarDone, ageDone, streamDone]);
    await rm(targetPath, { force: true });
    throw error;
  }
}

async function pathExists(value) {
  try {
    await access(value);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function logicalBackupNames() {
  await mkdir(path.join(BACKUP_ROOT, "logical"), { recursive: true });
  return (await readdir(path.join(BACKUP_ROOT, "logical")))
    .filter((name) => /^visionhub-schema-.*\.dump$/.test(name))
    .sort();
}

async function physicalBackupNames() {
  if (MODE !== "managed") return [];
  const root = path.join(BACKUP_ROOT, "physical");
  let names;
  try {
    names = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }
  const result = [];
  for (const entry of names) {
    if (!entry.isDirectory() || !/^(full|incr)-/.test(entry.name)) continue;
    try {
      const metadata = JSON.parse(await readFile(path.join(root, entry.name, "metadata.json"), "utf8"));
      if (metadata.id === entry.name && (metadata.type === "full" || metadata.type === "incremental")) {
        result.push(entry.name);
      }
    } catch {
      // Incomplete folders from interrupted backups are not upload candidates.
    }
  }
  return result.sort();
}

async function prepareEncryptedArtifacts(state) {
  if (!AGE_RECIPIENTS.length) {
    throw new Error("BACKUP_REMOTE is set, but BACKUP_AGE_RECIPIENTS is empty. Refusing to upload unencrypted backups.");
  }
  const invalid = AGE_RECIPIENTS.filter((recipient) => !recipient.startsWith("age1"));
  if (invalid.length) {
    throw new Error("BACKUP_AGE_RECIPIENTS must contain age public recipients (age1...). Keep private identity files off the cloud server.");
  }

  const logicalPending = path.join(ENCRYPTED_PENDING_ROOT, "logical");
  const physicalPending = path.join(ENCRYPTED_PENDING_ROOT, "physical");
  await mkdir(logicalPending, { recursive: true });
  await mkdir(physicalPending, { recursive: true });

  const uploadedLogical = new Set(state.uploadedLogicalIds);
  for (const dumpName of await logicalBackupNames()) {
    if (uploadedLogical.has(dumpName)) continue;
    const archiveName = dumpName + ".tar.age";
    const archivePath = path.join(logicalPending, archiveName);
    if (await pathExists(archivePath)) continue;
    const members = [dumpName];
    if (await pathExists(path.join(BACKUP_ROOT, "logical", dumpName + ".json"))) {
      members.push(dumpName + ".json");
    }
    console.log("Encrypting logical backup archive: " + archiveName);
    await encryptArchive(path.join(BACKUP_ROOT, "logical"), members, archivePath);
  }

  const uploadedPhysical = new Set(state.uploadedPhysicalIds);
  for (const backupId of await physicalBackupNames()) {
    if (uploadedPhysical.has(backupId)) continue;
    const archiveName = backupId + ".tar.age";
    const archivePath = path.join(physicalPending, archiveName);
    if (await pathExists(archivePath)) continue;
    console.log("Encrypting physical backup archive: " + archiveName);
    await encryptArchive(path.join(BACKUP_ROOT, "physical"), [backupId], archivePath);
  }
}

async function uploadPendingCategory(category, state, stateKey) {
  const pendingDirectory = path.join(ENCRYPTED_PENDING_ROOT, category);
  await mkdir(pendingDirectory, { recursive: true });
  const uploaded = new Set(state[stateKey]);
  const entries = (await readdir(pendingDirectory)).filter((name) => name.endsWith(".tar.age")).sort();
  for (const archiveName of entries) {
    const backupId = archiveName.slice(0, -".tar.age".length);
    const archivePath = path.join(pendingDirectory, archiveName);
    if (uploaded.has(backupId)) {
      await rm(archivePath, { force: true });
      continue;
    }
    const destination = REMOTE + "/encrypted/" + category + "/" + archiveName;
    currentPhase = "remote_upload_" + category;
    // copyto does not delete unrelated remote objects. Upload only authenticated
    // age-encrypted archives; never pass the plaintext backup directories to rclone.
    run("rclone", ["copyto", archivePath, destination, "--log-level", "INFO"]);
    uploaded.add(backupId);
    state[stateKey] = [...uploaded];
    await saveState(state);
    await rm(archivePath, { force: true });
    console.log("Encrypted off-site backup uploaded: " + category + "/" + archiveName);
  }
}

async function uploadOffsiteBackups(state) {
  if (!REMOTE) return;
  currentPhase = "offsite_backup_prepare";
  // Encryption happens before rclone can see the backup payload. Failed uploads
  // leave only encrypted pending artifacts for retry; private identities never
  // enter the container. The new "encrypted" prefix also avoids overwriting
  // or mixing with old plaintext objects from earlier deployments.
  await prepareEncryptedArtifacts(state);
  await uploadPendingCategory("logical", state, "uploadedLogicalIds");
  await uploadPendingCategory("physical", state, "uploadedPhysicalIds");
  state.remoteUploadDate = state.localBackupDate;
  state.encryptionVersion = 1;
  await saveState(state);
  console.log("Encrypted off-site backup upload completed to " + REMOTE + "/encrypted.");
}

async function runDailyJob(force = false) {
  const parts = nowParts();
  const state = await readState();
  currentPhase = "prepare_backup";

  if (force || state.localBackupDate !== parts.date) {
    await createLocalBackups(parts);
    state.localBackupDate = parts.date;
    currentPhase = "persist_local_backup_state";
    await saveState(state);
  } else {
    console.log("Local backup already succeeded today (" + parts.date + "); skipping duplicate creation.");
  }

  if (REMOTE && (force || state.remoteUploadDate !== state.localBackupDate || state.encryptionVersion !== 1)) {
    await uploadOffsiteBackups(state);
    state.remoteUploadDate = state.localBackupDate;
    await saveState(state);
  } else if (!REMOTE) {
    console.log("BACKUP_REMOTE is empty; off-site upload is disabled.");
  } else {
    console.log("Off-site backup upload already succeeded for " + state.remoteUploadDate + ".");
  }

  await reportRecoveryIfNeeded(state);
  currentPhase = "idle";
}

async function tick() {
  const parts = nowParts();
  const state = await readState();
  const localPending = state.localBackupDate !== parts.date;
  const remotePending = Boolean(REMOTE) && (state.remoteUploadDate !== state.localBackupDate || state.encryptionVersion !== 1);
  if (!localPending && !remotePending) {
    // A completed job may only need its persisted failure marker cleared after a
    // restart (for example, if a previous state-file write was interrupted).
    if (state.lastFailure) await reportRecoveryIfNeeded(state);
    return;
  }
  // A persisted failure can be retried immediately after a process/container restart,
  // even when the daily schedule time has not yet arrived.
  if (parts.time < SCHEDULE_TIME && !state.lastFailure) return;
  await runDailyJob(false);
}

async function reportRecoveryIfNeeded(state) {
  const previousFailure = state.lastFailure;
  if (!previousFailure) return;

  const previousOffsiteFailure =
    previousFailure.phase.startsWith("offsite_") ||
    previousFailure.phase.startsWith("remote_upload_");
  const offsiteHealthy = REMOTE
    ? state.remoteUploadDate === state.localBackupDate && state.encryptionVersion === 1
    : !previousOffsiteFailure;
  if (!state.localBackupDate || !offsiteHealthy) return;

  state.lastFailure = null;
  currentPhase = "persist_recovery_state";
  await saveState(state);
  await sendBackupAlert("backup_recovered", {
    mode: MODE,
    phase: previousFailure.phase,
    message: `Backup recovered after ${previousFailure.consecutiveFailures} failed attempt(s).`,
    consecutiveFailures: previousFailure.consecutiveFailures,
    retryMinutes: RETRY_MINUTES,
    failedAt: previousFailure.occurredAt,
  });
}

async function recordFailure(error) {
  const parts = nowParts();
  const message = sanitizeAlertMessage(error instanceof Error ? error.message : String(error));
  console.error("Backup attempt failed: " + message);

  let consecutiveFailures = 1;
  const occurredAt = new Date().toISOString();
  try {
    const state = await readState();
    consecutiveFailures = state.lastFailure
      ? state.lastFailure.consecutiveFailures + 1
      : 1;
    state.lastFailure = {
      phase: currentPhase,
      occurredAt,
      message,
      consecutiveFailures,
      backupDate: parts.date,
    };
    await saveState(state);
  } catch (stateError) {
    console.error("Could not persist backup failure state: " + sanitizeAlertMessage(stateError instanceof Error ? stateError.message : String(stateError)));
  }

  const offsiteFailure = currentPhase.startsWith("offsite_") || currentPhase.startsWith("remote_upload_");
  await sendBackupAlert(offsiteFailure ? "remote_upload_failure" : "backup_failure", {
    mode: MODE,
    phase: currentPhase,
    message,
    consecutiveFailures,
    retryMinutes: RETRY_MINUTES,
    occurredAt,
  });
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
  console.log("Backup alerts: " + (ALERT_WEBHOOK_ENABLED ? "webhook configured." : "webhook not configured."));
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
        await recordFailure(error);
        retryAt = Date.now() + RETRY_MINUTES * 60_000;
        console.error("Retrying in " + RETRY_MINUTES + " minutes.");
      }
    }
    running = true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    running = false;
  }
}

main().catch(async (error) => {
  await recordFailure(error);
  process.exitCode = 1;
});
