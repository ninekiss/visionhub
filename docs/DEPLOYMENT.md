# Deployment, database maintenance and backups

## Database modes

Copy `.env.example` to the repository-root `.env`. The one-shot `db-tools` service is in the `tools` profile: it is not started by ordinary `docker compose up`, and has no published ports.

- **Direct address:** use `infra/compose.yaml`. `DATABASE_URL_DOCKER` takes priority for both API and tools; if it is unset, they use `DATABASE_URL`. That address must be reachable from a container.
- **Existing Docker network:** set `EXISTING_DB_NETWORK`, point `DATABASE_URL_DOCKER` at the database alias, and include `infra/compose.existing-db-network.yaml`. Both API and db-tools join the external network.
- **Compose-managed PostgreSQL:** include `infra/compose.database.yaml`. That overlay sets the API and db-tools URL to `postgres:5432` based on `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`, so an old `DATABASE_URL_DOCKER` value cannot redirect this mode. `DATABASE_URL` remains the host-side URL, usually `127.0.0.1:5433`.

Use a URL-safe `POSTGRES_PASSWORD` (letters, digits, hyphens and underscores are safe choices), because the Compose overlay interpolates it into a PostgreSQL URI. Keep `.env` secret and out of Git.

## Start, stop and inspect application containers

Run these commands from the repository root after copying `.env.example` to `.env` and setting the database connection. The default deployment uses an external PostgreSQL instance reachable from the API container:

```powershell
docker compose --env-file .env -f infra/compose.yaml up --build -d
docker compose --env-file .env -f infra/compose.yaml ps
docker compose --env-file .env -f infra/compose.yaml logs -f --tail=200 web api
```

Choose the Compose files to match the database mode used when starting the stack, and use that same file list for later operations:

- Existing Docker database network: add `-f infra/compose.existing-db-network.yaml`.
- Compose-managed PostgreSQL: add `-f infra/compose.database.yaml`. On first use, start `postgres` and run `db-tools init` as shown below before starting the full stack.
- Local API port for debugging: optionally add `-f infra/compose.api-published.yaml`.

For example, with the default external-database mode:

```powershell
# Restart only the application services
docker compose --env-file .env -f infra/compose.yaml restart api web

# Stop the services without deleting containers or data
docker compose --env-file .env -f infra/compose.yaml stop

# Start previously stopped services
docker compose --env-file .env -f infra/compose.yaml start

# Remove the containers and Compose network; persistent volumes are kept
docker compose --env-file .env -f infra/compose.yaml down
```

Use `logs -f --tail=200 api` or `logs -f --tail=200 web` to inspect one service. Do not use `down -v` unless you deliberately intend to delete Compose-managed database volumes and their data. The old root-level Compose command is now expressed as `docker compose --env-file .env -f infra/compose.yaml up --build -d` because the Compose file moved under `infra/`.

## Initialization and seed

Initialize a new database from inside the tools container. In managed mode, Compose starts the PostgreSQL dependency automatically:

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml up --build -d postgres
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools init
```

`init` creates the `visionhub` schema, applies migrations and seeds the catalog. For an already initialized production database, use `migrate` for normal releases; do not run initialization just to deploy a new application build:

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools migrate
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools seed
```

Remove the `-f infra/compose.database.yaml` argument for direct connections. For a database reached by a container alias on an existing Docker network, include `-f infra/compose.existing-db-network.yaml`. The tool container uses the same selected connection URL as the API. `seed` uses stable IDs/upserts; it is intended for seed records, not as a general import path.

## Logical schema backups (all database modes)

`logical-backup` creates a standalone custom-format dump of **only** the `visionhub` schema. It verifies the archive list and writes a SHA-256 sidecar. By default, logical dumps older than `LOGICAL_RETENTION_DAYS` (30) are pruned automatically. Files are kept on the host in the repository-root `backups/logical/` directory, which is Git-ignored.

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools logical-backup
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools logical-list
```

Before overwriting a real schema, test the dump in a disposable database on the same PostgreSQL instance. This requires permission to create and drop databases:

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools logical-restore-test /backups/logical/visionhub-schema-YYYYMMDDTHHMMSSZ.dump
```

The test restores the dump into a temporary database, checks that `visionhub.catalog_items` exists and can be queried, then drops the temporary database. Add `--keep` to retain it for manual inspection. For direct/network modes, use the corresponding Compose file list; these logical backup commands work with any reachable PostgreSQL that supports the selected schema and grants the needed permissions.

To restore the actual `visionhub` schema, first verify the resolved database target and retain a recent backup. This is destructive to the current `visionhub` schema only; other schemas are not selected:

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools logical-restore /backups/logical/visionhub-schema-YYYYMMDDTHHMMSSZ.dump --replace-schema
```

`--replace-schema` is required as an explicit acknowledgement. The dump does not include database roles or unrelated schemas. Stop application writes or use a maintenance window when restoring a live database.

## Physical full and incremental backups (managed PostgreSQL 18 only)

The `physical-backup-*` commands are deliberately enabled only by `infra/compose.database.yaml`, where the tools container can access the managed PostgreSQL 18 data volume. They use PostgreSQL's `pg_basebackup`, `pg_combinebackup` and `pg_verifybackup`. The source role must have `REPLICATION` permission or be a superuser, and `pg_hba.conf` must allow replication connections.

**Physical backups cover the whole PostgreSQL cluster**, not only the `visionhub` schema. Use this mode only for the dedicated Compose-managed database in this project; for a shared external PostgreSQL instance, use schema-scoped logical backups unless its DBA has deliberately configured cluster-wide backup operations.

Run one full backup first; after that, the incremental backup uses the most recent successful full or incremental backup as its parent:

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools physical-init
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools physical-backup-full
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools physical-backup-incr
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools physical-list
```

Each backup directory contains PostgreSQL's `backup_manifest`; VisionHub's dependency metadata is stored beside the data directory so it does not interfere with manifest verification. `physical-backup-full` is standalone. An incremental backup is **not** standalone: its parent may itself be incremental, so every link back to the full backup must be retained. A failed or missing parent makes the dependent chain unrestorable. `physical-list` shows the parent and full-chain root for each backup. To verify an incremental, the tool temporarily reconstructs the full chain with `pg_combinebackup`, runs `pg_verifybackup` on that combined backup, then removes the temporary verification directory. This is intentionally more disk-intensive than taking an incremental alone; leave enough free space for a reconstructed full backup. PostgreSQL's official guidance distinguishes combination (chain consistency) from backup-integrity checking, so the tools do both. <https://www.postgresql.org/docs/18/app-pgcombinebackup.html> <https://www.postgresql.org/docs/18/app-pgverifybackup.html>

By default, the latest four full backup roots and all increments depending on those roots are retained (`PHYSICAL_KEEP_FULL=4`). When a new full is taken, older roots and their dependent increments are removed together. The daily logical dumps have independent retention and are not part of this physical chain.

### Verify a full-only or full-plus-incremental restore

Restore testing builds the selected backup chain into a temporary directory, runs `pg_verifybackup`, starts a separate PostgreSQL instance inside the one-shot tools container and verifies the catalog table. It does not touch the live data volume:

```powershell
# Use a full backup ID to test the full backup by itself.
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools physical-restore-test full-YYYYMMDDTHHMMSSZ

# Use an incremental ID or 'latest' to combine the full backup and every required increment.
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools physical-restore-test latest
```

Add `--keep` to retain the reconstructed test data directory. If the isolated PostgreSQL server fails to start, the script preserves that directory for diagnosis.

### Apply a physical restore

An in-place physical restore replaces the managed PostgreSQL data directory. Test the selected backup first and stop the application and database before proceeding. `--no-deps` is essential here: it prevents Compose from starting PostgreSQL while its files are being replaced.

```powershell
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml stop api web postgres
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml run --rm --no-deps db-tools physical-restore latest --apply --yes
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml up -d postgres
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml up --build -d api web
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml ps
```

The restore command refuses to proceed unless `--apply --yes` is present and PostgreSQL is not accepting connections. It prepares and verifies a reconstructed chain before replacing `PGDATA`, and retains the prepared copy under `backups/physical/` for recovery. Do not delete that directory until the restored database and API have been verified.

These physical backups restore to the selected backup snapshot; they do not provide arbitrary point-in-time recovery between snapshots. PITR requires continuous WAL archiving and a separately planned WAL retention policy.

## Suggested schedule and off-host protection

Baseline policy:

- **Every day:** create a logical `visionhub` schema dump. Each dump is independent and can restore without other dump files.
- **Sunday:** create a physical full backup of the managed PostgreSQL 18 cluster.
- **Other days:** create a physical incremental backup, depending on the most recent backup chain.
- **Retention:** 30 days of logical dumps and the latest four physical full chains by default.
- **After a successful run:** copy completed backups to a second device or remote/object-storage repository. `backups/` on the same host does not protect against disk loss, host loss or ransomware.

On Windows, `scripts/backup-schedule.ps1` performs the daily logical backup and, in managed mode, selects a weekly full or daily incremental backup. Create a Windows Task Scheduler job to run it daily at a quiet time, for example:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Path\To\visionhub\scripts\backup-schedule.ps1" -DatabaseMode managed
```

For direct or existing-network deployments, pass `-DatabaseMode direct` or `-DatabaseMode network`; the script then performs logical backups only. Use `-ForceFull` to trigger a full physical backup manually. Configure Task Scheduler not to start a second instance while a prior run is still active.

Treat dumps and physical backups as sensitive data. Limit filesystem access, do not commit backup files, and regularly test restore rather than relying only on a successful backup exit code.

## Runtime behavior

- API and Web restart unless explicitly stopped; the API health check queries the database-backed catalog endpoint.
- The API port is internal by default; Web/Nginx proxies browser requests to the API.
- Migrations remain explicit: neither API startup nor `docker compose up` runs migrations automatically.