import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { access, cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_ROOT = path.resolve(process.env.VISIONHUB_BACKUP_DIR ?? "/backups");
const LOGICAL_ROOT = path.join(BACKUP_ROOT, "logical");
const PHYSICAL_ROOT = path.join(BACKUP_ROOT, "physical");
const PGDATA = path.resolve(process.env.PGDATA ?? "/var/lib/postgresql/18/docker");
const PHYSICAL_ENABLED = process.env.DB_TOOLS_PHYSICAL_ENABLED === "true";
const DATABASE_URL = process.env.DATABASE_URL;

function usage() {
  console.log(`VisionHub database tools

Safe operations (available for any reachable PostgreSQL target):
  init                                      Create schema, apply migrations, seed catalog
  migrate                                   Apply pending Prisma migrations
  seed                                      Seed/upsert catalog data
  logical-backup                            Create an independent custom-format visionhub schema dump
  logical-list                              List schema dump files
  logical-restore-test <dump> [--keep]       Restore into a disposable database and verify it
  logical-restore <dump> --replace-schema    Replace the target visionhub schema (destructive)

Physical cluster operations (Compose-managed PostgreSQL 18 only):
  physical-init                              Validate this managed cluster for physical backups
  physical-backup-full                       Take a standalone full cluster backup
  physical-backup-incr                       Take an incremental backup based on the previous backup
  physical-list                              List full and incremental backups with their dependency chain
  physical-restore-test [backup-id|latest] [--keep]
                                             Reconstruct a full/incremental chain and boot it in isolation
  physical-restore [backup-id|latest] --apply --yes
                                             Replace managed PGDATA; database must be stopped first

Database URLs are read from DATABASE_URL inside the tools container. Dumps and physical backups
are written beneath ${BACKUP_ROOT}. Never delete a full backup while retained incrementals depend on it.`);
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.capture ? (result.stderr || result.stdout || "").trim() : "";
    throw new Error(`${program} exited with status ${result.status ?? "unknown"}${detail ? `: ${detail}` : ""}`);
  }
  return options.capture ? (result.stdout ?? "") : "";
}

function requiredDatabaseUrl() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required inside the db-tools container.");
  let url;
  try {
    url = new URL(DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("DATABASE_URL must use the postgresql:// or postgres:// scheme.");
  }
  // Prisma's schema= parameter is not a libpq parameter understood by PostgreSQL CLI tools.
  url.searchParams.delete("schema");
  return url.toString();
}

function databaseUrlFor(name) {
  const url = new URL(requiredDatabaseUrl());
  url.pathname = `/${name}`;
  return url.toString();
}

function restoreTestUrl() {
  const url = new URL(requiredDatabaseUrl());
  url.hostname = "127.0.0.1";
  url.port = "55432";
  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslcert");
  url.searchParams.delete("sslkey");
  url.searchParams.delete("sslrootcert");
  return url.toString();
}

function timestamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

async function ensureBackupDirectories() {
  await mkdir(LOGICAL_ROOT, { recursive: true });
  await mkdir(PHYSICAL_ROOT, { recursive: true });
}

async function resolveBackupFile(value) {
  if (!value) throw new Error("Provide a backup file path under /backups.");
  const file = path.resolve(value);
  const relative = path.relative(BACKUP_ROOT, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Backup file must be inside ${BACKUP_ROOT}.`);
  }
  await access(file);
  return file;
}

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function logicalBackup() {
  await ensureBackupDirectories();
  const file = path.join(LOGICAL_ROOT, `visionhub-schema-${timestamp()}.dump`);
  const url = requiredDatabaseUrl();
  const serverVersion = run("psql", ["--dbname", url, "--no-psqlrc", "--tuples-only", "--no-align", "--command", "SHOW server_version"], { capture: true }).trim();
  run("pg_dump", [
    "--format=custom",
    "--compress=9",
    "--schema=visionhub",
    "--no-owner",
    "--no-privileges",
    "--file", file,
    "--dbname", url,
  ]);
  run("pg_restore", ["--list", file], { capture: true });
  const checksum = await hashFile(file);
  const metadata = {
    kind: "logical-schema",
    schema: "visionhub",
    createdAt: new Date().toISOString(),
    serverVersion,
    file: path.basename(file),
    sha256: checksum,
  };
  await writeFile(`${file}.json`, `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
  await pruneLogicalBackups(Number.parseInt(process.env.LOGICAL_RETENTION_DAYS ?? "30", 10));
  console.log(`Logical backup verified: ${file}`);
  console.log(`SHA-256: ${checksum}`);
}

async function pruneLogicalBackups(keepDays) {
  if (!Number.isInteger(keepDays) || keepDays < 1) throw new Error("LOGICAL_RETENTION_DAYS must be an integer >= 1.");
  await mkdir(LOGICAL_ROOT, { recursive: true });
  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  for (const name of await readdir(LOGICAL_ROOT)) {
    if (!/^visionhub-schema-.*\.dump(?:\.json)?$/.test(name)) continue;
    const fullPath = path.join(LOGICAL_ROOT, name);
    const details = await stat(fullPath);
    if (details.mtimeMs < cutoff) await rm(fullPath, { force: true });
  }
}

async function logicalList() {
  await ensureBackupDirectories();
  const files = (await readdir(LOGICAL_ROOT))
    .filter((name) => /^visionhub-schema-.*\.dump$/.test(name))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.log("No logical backups found.");
    return;
  }
  for (const name of files) {
    const file = path.join(LOGICAL_ROOT, name);
    const metadataPath = `${file}.json`;
    let metadata;
    try {
      metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    } catch {
      metadata = null;
    }
    const checksum = metadata?.sha256 ?? await hashFile(file);
    console.log(`${name}\t${metadata?.createdAt ?? "metadata unavailable"}\tSHA-256 ${checksum}`);
  }
}

async function validateLogicalDump(value) {
  const file = await resolveBackupFile(value);
  if (!file.endsWith(".dump")) throw new Error("Logical backup must be a .dump file created by VisionHub db-tools.");
  run("pg_restore", ["--list", file], { capture: true });
  const metadataPath = `${file}.json`;
  try {
    const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
    const actual = await hashFile(file);
    if (metadata.sha256 && metadata.sha256 !== actual) throw new Error("Backup SHA-256 does not match its metadata; refusing to restore a damaged or modified dump.");
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Backup metadata is invalid; refusing to restore.");
    if (error?.code !== "ENOENT") throw error;
  }
  return file;
}

async function logicalRestoreTest(value, keep) {
  const file = await validateLogicalDump(value);
  const suffix = timestamp().toLowerCase().replace(/[^a-z0-9]/g, "");
  const databaseName = `visionhub_restore_test_${suffix}`;
  const maintenanceUrl = databaseUrlFor("postgres");
  const testUrl = databaseUrlFor(databaseName);
  let created = false;
  try {
    run("psql", ["--dbname", maintenanceUrl, "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--command", `CREATE DATABASE "${databaseName}" TEMPLATE template0`]);
    created = true;
    run("pg_restore", ["--exit-on-error", "--no-owner", "--no-privileges", "--dbname", testUrl, file]);
    const hasCatalog = run("psql", ["--dbname", testUrl, "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", "SELECT to_regclass('visionhub.catalog_items') IS NOT NULL"], { capture: true }).trim();
    if (hasCatalog !== "t") throw new Error("Restore completed, but visionhub.catalog_items was not found in the restored database.");
    const itemCount = run("psql", ["--dbname", testUrl, "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", "SELECT count(*) FROM visionhub.catalog_items"], { capture: true }).trim();
    console.log(`Logical restore verified in disposable database ${databaseName}; catalog_items rows: ${itemCount}.`);
    if (keep) console.log(`The test database was retained as ${databaseName}.`);
  } finally {
    if (created && !keep) {
      try {
        run("psql", ["--dbname", maintenanceUrl, "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--command", `DROP DATABASE IF EXISTS "${databaseName}"`]);
        console.log(`Removed disposable database ${databaseName}.`);
      } catch (error) {
        console.error(`Could not drop disposable database ${databaseName}: ${error.message}`);
      }
    }
  }
}

async function logicalRestore(value, replaceConfirmed) {
  if (!replaceConfirmed) throw new Error("This replaces the entire visionhub schema in the target database. Re-run with --replace-schema after verifying DATABASE_URL points to the intended target.");
  const file = await validateLogicalDump(value);
  console.warn("Replacing schema visionhub in the DATABASE_URL target. No other schema is intentionally selected.");
  run("pg_restore", [
    "--exit-on-error",
    "--single-transaction",
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    "--dbname", requiredDatabaseUrl(),
    file,
  ]);
  console.log("Logical schema restore completed.");
}

function assertPhysicalEnabled() {
  if (!PHYSICAL_ENABLED) {
    throw new Error("Physical backups are enabled only for the Compose-managed PostgreSQL 18 service. Use logical-backup for direct/existing-network database modes.");
  }
}

async function serverVersionMajor() {
  const result = run("psql", ["--dbname", requiredDatabaseUrl(), "--no-psqlrc", "--tuples-only", "--no-align", "--command", "SHOW server_version_num"], { capture: true }).trim();
  const major = Math.floor(Number(result) / 10000);
  if (!Number.isInteger(major)) throw new Error("Could not determine PostgreSQL server version.");
  if (major !== 18) {
    throw new Error(`Physical incremental backups require PostgreSQL 18 in this deployment (server reports major ${major}). Logical schema backups remain available.`);
  }
  return major;
}

async function readPhysicalBackups() {
  await mkdir(PHYSICAL_ROOT, { recursive: true });
  const entries = [];
  for (const name of await readdir(PHYSICAL_ROOT, { withFileTypes: true })) {
    if (!name.isDirectory() || !/^(full|incr)-/.test(name.name)) continue;
    try {
      const metadata = JSON.parse(await readFile(path.join(PHYSICAL_ROOT, name.name, "metadata.json"), "utf8"));
      if (metadata.id === name.name && (metadata.type === "full" || metadata.type === "incremental")) {
        entries.push(metadata);
      }
    } catch {
      // Ignore incomplete folders from an interrupted backup; the next successful backup is independent.
    }
  }
  return entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function chainFor(id, entries) {
  const lookup = new Map(entries.map((entry) => [entry.id, entry]));
  const selectedId = id && id !== "latest" ? id : entries.at(-1)?.id;
  if (!selectedId) throw new Error("No physical backups found. Create one with physical-backup-full first.");
  const chain = [];
  const seen = new Set();
  let current = lookup.get(selectedId);
  if (!current) throw new Error(`Physical backup not found: ${selectedId}`);
  while (current) {
    if (seen.has(current.id)) throw new Error("Physical backup metadata contains a dependency cycle.");
    seen.add(current.id);
    chain.unshift(current);
    if (current.type === "full") break;
    if (!current.parentId) throw new Error(`Incremental backup ${current.id} has no parent backup.`);
    current = lookup.get(current.parentId);
    if (!current) throw new Error(`Required parent backup is missing for ${chain[0].id}; the backup chain cannot be restored.`);
  }
  if (chain[0]?.type !== "full") throw new Error("Backup dependency chain does not terminate at a full backup.");
  return chain;
}

async function physicalList() {
  assertPhysicalEnabled();
  const entries = await readPhysicalBackups();
  if (entries.length === 0) {
    console.log("No physical backups found. Run physical-init, then physical-backup-full.");
    return;
  }
  for (const entry of entries) {
    console.log(`${entry.id}\t${entry.type}\t${entry.createdAt}\troot=${entry.rootId}\tparent=${entry.parentId ?? "-"}`);
  }
}

async function physicalInit() {
  assertPhysicalEnabled();
  await serverVersionMajor();
  const dataDir = await stat(PGDATA).catch(() => null);
  if (!dataDir?.isDirectory() || !(await access(path.join(PGDATA, "PG_VERSION")).then(() => true).catch(() => false))) {
    throw new Error(`Managed PostgreSQL data directory not found at ${PGDATA}. Start the Compose PostgreSQL service first.`);
  }
  await ensureBackupDirectories();
  console.log("Physical backup prerequisites verified for the Compose-managed PostgreSQL 18 cluster.");
  console.log("This uses PostgreSQL replication-protocol base backups; the database role must have REPLICATION or superuser privileges.");
}

async function prunePhysicalBackups(keepFullCount) {
  if (!Number.isInteger(keepFullCount) || keepFullCount < 1) throw new Error("PHYSICAL_KEEP_FULL must be an integer >= 1.");
  const entries = await readPhysicalBackups();
  const fulls = entries.filter((entry) => entry.type === "full");
  const keepIds = new Set(fulls.slice(-keepFullCount).map((entry) => entry.id));
  const keepRoots = new Set(keepIds);
  const removableRoots = new Set(fulls.filter((entry) => !keepRoots.has(entry.id)).map((entry) => entry.id));
  if (removableRoots.size === 0) return;
  for (const entry of entries) {
    if (removableRoots.has(entry.rootId)) {
      await rm(path.join(PHYSICAL_ROOT, entry.id), { recursive: true, force: true });
      console.log(`Expired physical backup chain item: ${entry.id}`);
    }
  }
}

async function physicalBackup(type) {
  assertPhysicalEnabled();
  const major = await serverVersionMajor();
  await ensureBackupDirectories();
  const entries = await readPhysicalBackups();
  let parent = null;
  let rootId;
  if (type === "incremental") {
    parent = entries.at(-1) ?? null;
    if (!parent) throw new Error("No previous physical backup. Run physical-backup-full first.");
    chainFor(parent.id, entries);
    rootId = parent.rootId;
  }
  const id = `${type === "full" ? "full" : "incr"}-${timestamp()}`;
  const directory = path.join(PHYSICAL_ROOT, id);
  const dataDirectory = path.join(directory, "pgdata");
  await mkdir(directory, { recursive: false });
  try {
    const args = [
      "--dbname", requiredDatabaseUrl(),
      "--pgdata", dataDirectory,
      "--wal-method=stream",
      "--checkpoint=fast",
      "--progress",
      "--verbose",
      "--manifest-checksums=SHA256",
    ];
    if (type === "incremental") args.push(`--incremental=${path.join(PHYSICAL_ROOT, parent.id, "pgdata", "backup_manifest")}`);
    run("pg_basebackup", args);
    if (type === "full") {
      run("pg_verifybackup", [dataDirectory]);
    } else {
      // Incremental directories are not standalone backups. Reconstruct the full
      // chain before verifying the result against its combined backup manifest.
      const verificationDirectory = path.join(directory, "combined-verification");
      const parentChain = chainFor(parent.id, entries);
      const inputs = [
        ...parentChain.map((entry) => path.join(PHYSICAL_ROOT, entry.id, "pgdata")),
        dataDirectory,
      ];
      try {
        run("pg_combinebackup", ["--output", verificationDirectory, ...inputs]);
        run("pg_verifybackup", [verificationDirectory]);
      } finally {
        await rm(verificationDirectory, { recursive: true, force: true });
      }
    }
    const metadata = {
      id,
      type,
      parentId: parent?.id ?? null,
      rootId: rootId ?? id,
      createdAt: new Date().toISOString(),
      serverMajor: major,
      pgBasebackupVersion: run("pg_basebackup", ["--version"], { capture: true }).trim(),
    };
    await writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { flag: "wx" });
    console.log(`Physical ${type} backup verified: ${directory}`);
    if (type === "full") {
      console.log("This full backup can be restored without any other physical backup.");
    } else {
      console.log(`This incremental depends on the chain rooted at ${rootId}; keep every backup in that chain.`);
    }
    const keepFull = Number.parseInt(process.env.PHYSICAL_KEEP_FULL ?? "4", 10);
    await prunePhysicalBackups(keepFull);
  } catch (error) {
    // Leave no half-written backup directory that could be selected as a parent.
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function reconstructPhysicalBackup(id, keep) {
  assertPhysicalEnabled();
  await serverVersionMajor();
  const entries = await readPhysicalBackups();
  const chain = chainFor(id, entries);
  const selected = chain.at(-1);
  const output = path.join(PHYSICAL_ROOT, `restore-${selected.id}-${timestamp()}`);
  const inputDirectories = chain.map((entry) => path.join(PHYSICAL_ROOT, entry.id, "pgdata"));
  try {
    if (chain.length === 1) {
      await cp(inputDirectories[0], output, { recursive: true, errorOnExist: true, force: false });
    } else {
      run("pg_combinebackup", ["--output", output, ...inputDirectories]);
    }
    run("pg_verifybackup", [output]);
    return { output, selected, chain, keep };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

async function physicalRestoreTest(id, keep) {
  const { output, selected, chain } = await reconstructPhysicalBackup(id, keep);
  const logPath = path.join(output, "restore-test.log");
  let started = false;
  let passed = false;
  try {
    run("chown", ["-R", "postgres:postgres", output]);
    const serverOptions = "-h 127.0.0.1 -p 55432 -c archive_mode=off";
    run("su-exec", ["postgres", "pg_ctl", "-D", output, "-l", logPath, "-o", serverOptions, "-w", "start"]);
    started = true;
    const testUrl = restoreTestUrl();
    const hasCatalog = run("psql", ["--dbname", testUrl, "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", "SELECT to_regclass('visionhub.catalog_items') IS NOT NULL"], { capture: true }).trim();
    if (hasCatalog !== "t") throw new Error("Physical restore started, but visionhub.catalog_items was not found.");
    const count = run("psql", ["--dbname", testUrl, "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align", "--command", "SELECT count(*) FROM visionhub.catalog_items"], { capture: true }).trim();
    console.log(`Physical restore verified by starting an isolated PostgreSQL server. Backup: ${selected.id}; chain length: ${chain.length}; catalog_items rows: ${count}.`);
    passed = true;
    if (keep) console.log(`Restored test data retained at ${output}`);
  } finally {
    if (started) {
      try {
        run("su-exec", ["postgres", "pg_ctl", "-D", output, "-m", "fast", "-w", "stop"]);
      } catch {
        try { run("su-exec", ["postgres", "pg_ctl", "-D", output, "-m", "immediate", "-w", "stop"]); } catch {}
      }
    }
    if (!keep && passed) await rm(output, { recursive: true, force: true });
    else console.log(`Retained physical restore-test data directory for inspection: ${output}`);
  }
}

async function physicalRestore(id, apply, yes) {
  assertPhysicalEnabled();
  if (!apply || !yes) throw new Error("Replacing the managed PGDATA volume is destructive. Stop the api/web/postgres services, then rerun physical-restore [backup-id|latest] --apply --yes.");
  const connection = requiredDatabaseUrl();
  const ready = spawnSync("pg_isready", ["--dbname", connection, "--timeout=2"], { stdio: "ignore", env: process.env });
  if (ready.status !== 2) throw new Error(`Could not prove PostgreSQL is stopped (pg_isready exit code: ${ready.status ?? "unknown"}). Refusing to replace PGDATA; stop the postgres service and use docker compose run --no-deps db-tools.`);
  if (!(await access(path.join(PGDATA, "PG_VERSION")).then(() => true).catch(() => false))) {
    throw new Error(`Expected an initialized managed data directory at ${PGDATA}; refusing to overwrite an unknown target.`);
  }
  const { output, selected, chain } = await reconstructPhysicalBackup(id, true);
  try {
    console.warn(`Restoring backup ${selected.id} from ${chain.length} physical backup component(s) into ${PGDATA}.`);
    for (const entry of await readdir(PGDATA)) await rm(path.join(PGDATA, entry), { recursive: true, force: true });
    await cp(output, PGDATA, { recursive: true, errorOnExist: true, force: false });
    run("chown", ["-R", "postgres:postgres", PGDATA]);
    console.log("Physical restore files installed. PostgreSQL remains stopped; start the postgres service and verify API health before removing the prepared recovery directory.");
    console.log(`Prepared recovery copy retained at ${output}`);
  } catch (error) {
    console.error(`Restore did not finish cleanly. Recovery source remains at ${output}.`);
    throw error;
  }
}

function parseFlags(args) {
  return {
    positional: args.filter((arg) => !arg.startsWith("--")),
    flags: new Set(args.filter((arg) => arg.startsWith("--"))),
  };
}

async function main() {
  const [command = "help", ...args] = process.argv.slice(2);
  const parsed = parseFlags(args);
  const value = parsed.positional[0];
  const keep = parsed.flags.has("--keep");
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      usage();
      return;
    case "init":
      run("pnpm", ["db:setup"]);
      return;
    case "migrate":
      run("pnpm", ["db:migrate"]);
      return;
    case "seed":
      run("pnpm", ["db:seed"]);
      return;
    case "logical-backup":
      await logicalBackup();
      return;
    case "logical-list":
      await logicalList();
      return;
    case "logical-restore-test":
      await logicalRestoreTest(value, keep);
      return;
    case "logical-restore":
      await logicalRestore(value, parsed.flags.has("--replace-schema"));
      return;
    case "physical-init":
      await physicalInit();
      return;
    case "physical-list":
      await physicalList();
      return;
    case "physical-backup-full":
      await physicalBackup("full");
      return;
    case "physical-backup-incr":
      await physicalBackup("incremental");
      return;
    case "physical-restore-test":
      await physicalRestoreTest(value, keep);
      return;
    case "physical-restore":
      await physicalRestore(value, parsed.flags.has("--apply"), parsed.flags.has("--yes"));
      return;
    default:
      throw new Error(`Unknown database tool command: ${command}. Run db-tools help for usage.`);
  }
}

main().catch((error) => {
  console.error(`Database tool failed: ${error instanceof Error ? error.message : "Unexpected error"}`);
  process.exitCode = 1;
});
