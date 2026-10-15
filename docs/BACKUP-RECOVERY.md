# VisionHub Backup Alerting and Disaster Recovery Runbook

This runbook covers the scheduled backup service, encrypted S3-compatible off-site copies, and recovery drills for a self-hosted VisionHub deployment.

## 1. Configure backup alerts

Set these values in the deployment host's private .env file. Do not commit the real webhook URL or token.

    BACKUP_ALERT_WEBHOOK_URL=https://alerts.example.invalid/visionhub-backup
    BACKUP_ALERT_WEBHOOK_TOKEN=

- BACKUP_ALERT_WEBHOOK_URL is optional. When blank, backup behavior is unchanged and webhook notifications are disabled.
- BACKUP_ALERT_WEBHOOK_TOKEN is optional. When set, the service sends it as an HTTP Bearer token in the Authorization header.
- Use HTTPS for internet-reachable webhook endpoints. The endpoint must accept a JSON POST. The token and URL are never included in the message body or application logs.
- The payload includes application, event, severity, occurredAt, mode, phase, message, consecutiveFailures, retryMinutes, failedAt, text, and content when applicable. Unknown fields can be ignored. text is compatible with common Slack-style webhooks; content supports Discord-style incoming webhooks. Check the chosen provider's expected payload schema before using it; not every vendor accepts a generic JSON body.
- Events: backup_failure for local backup, validation or encryption errors; remote_upload_failure for off-site encryption/upload failures; backup_recovered after a previously failed operation succeeds.
- Failure alerts are sent on each failed attempt with the persisted consecutive failure count. Alert transport errors and non-2xx responses do not replace or hide the original backup error. Backup retry scheduling continues even if webhook delivery fails.

After editing .env, recreate the service so it receives the new environment:

    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml up -d --force-recreate backup
    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml logs --tail=100 backup

Use the same Compose file list/overlays as the deployment. For an existing database network, use infra/compose.existing-db-network.yaml instead of the managed PostgreSQL overlay. Check that the service starts and the logs show "Backup alerts: webhook configured." The URL and token must not appear in logs.

## 2. Routine monitoring

A running container is not proof of a successful backup. Review the scheduler log and persistent state:

    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml ps backup
    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml logs --since 24h --tail=500 backup
    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml exec -T backup sh -c 'cat /backups/.scheduler-state.json'

The state file records successful local/off-site dates, uploaded object IDs, encryption version and an optional lastFailure. The scheduler persists failure details before waiting to retry, continues retrying after a container restart when work is pending, and clears failure state only after the required destination has recovered. Protect this file as operational metadata; it must not contain cloud credentials or private age identities.

## 3. Keep recovery keys and backups recoverable

1. Keep every private age identity needed for retained backups in a secure offline vault or another separately administered recovery location. The backup container and R2 must never receive private identities.
2. Keep matching public recipients with deployment documentation; a public key can encrypt new copies but cannot decrypt existing ones.
3. Restrict the R2 bucket and access token to the minimum required objects. Keep the bucket private and enable provider-side protections/versioning or lifecycle rules as appropriate.
4. Do not remove a physical full backup while any retained incremental depends on it. Keep every incremental in the selected restore chain.
5. Protect the on-host BACKUP_HOST_DIR: local .dump and physical backup files are plaintext. Encryption-before-upload protects the off-site archive, not the local backup volume.
6. Before changing age recipients, retain prior private identities until every archive encrypted to those identities has expired or has been deliberately re-encrypted and verified.
7. Schedule periodic isolated restore tests. A successful upload or checksum check alone is insufficient.

## 4. Restore drills before a disaster

Run these from the repository root on a trusted recovery machine. Use the actual Compose overlay, the persistent backup directory, the private key mounted read-only, and an environment that can reach the target PostgreSQL service.

### Test a logical schema dump

The encrypted object is under BACKUP_REMOTE/encrypted/logical/. Download it with rclone, decrypt with the matching private identity, and extract both the .dump and its .dump.json metadata into the container's /backups/logical directory. Then run:

    docker compose --env-file .env --profile tools -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools logical-list
    docker compose --env-file .env --profile tools -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools logical-restore-test /backups/logical/visionhub-schema-YYYYMMDDTHHMMSSZ.dump

Replace the example filename with the extracted dump's actual name. The test creates a disposable database, restores into it, checks visionhub.catalog_items, and drops the test database. Make sure the target PostgreSQL user can create and drop databases.

### Test a physical full/incremental chain

Restore each needed encrypted archive into /backups/physical in dependency order, preserving each top-level full-... or incr-... directory and its metadata.json and pgdata contents. Download the full root and every incremental from that root through the selected snapshot. Then inspect the chain and test the newest point:

    docker compose --env-file .env --profile tools -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools physical-list
    docker compose --env-file .env --profile tools -f infra/compose.yaml -f infra/compose.database.yaml run --rm db-tools physical-restore-test latest

The isolated restore test reconstructs the chain, runs pg_verifybackup, starts a separate PostgreSQL process on an internal test port, verifies the catalog table and row count, then stops and removes the temporary copy. Use this before any production restore.

## 5. Production disaster recovery

### Recovery to a new managed PostgreSQL host

1. Provision a replacement host and storage with sufficient capacity. Install Docker Engine/Compose and retrieve the reviewed VisionHub repository revision, configuration and private deployment secrets from the approved secret store.
2. Restore the backup directory from the R2 objects using a trusted recovery environment. The private age identity should be mounted read-only only into the container performing decryption; never bake it into the image or copy it to the cloud backup service.
3. Decrypt the chosen full archive and every incremental in its parent chain. Keep the directory structure unchanged beneath /backups/physical.
4. Run physical-list and physical-restore-test latest. Do not proceed if either fails.
5. Stop the scheduler, API and managed PostgreSQL service before replacing data. Take a snapshot/copy of the current target volume first if any target data needs to be preserved:

    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml stop backup api postgres
    docker compose --env-file .env --profile tools -f infra/compose.yaml -f infra/compose.database.yaml run --rm --no-deps db-tools physical-restore latest --apply --yes

6. Start PostgreSQL alone and verify database logs/health before starting the API:

    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml up -d postgres
    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml logs --tail=200 postgres
    docker compose --env-file .env --profile backup -f infra/compose.yaml -f infra/compose.database.yaml up -d api web

7. Confirm PostgreSQL health is healthy, API health succeeds, the catalog loads in Web, and application-specific playback/source records look correct. Retain the recovery source copy until post-restore verification and a fresh backup have succeeded.

The physical-restore ... --apply --yes command is destructive: it replaces the managed PostgreSQL data directory. Do not run it against a live PostgreSQL service, and do not use this procedure for a direct/external PostgreSQL deployment.

### Restore a logical schema into an existing/external PostgreSQL service

1. Confirm the exact DATABASE_URL/container URL points at the intended recovery target, not the production database by accident.
2. Prefer restoring into a newly created disposable or replacement database first; validate it and only then decide how to cut over.
3. For an intentional schema replacement, logical-restore <dump> --replace-schema replaces the visionhub schema in the selected target. Confirm the target and take a separate pre-restore backup first. Do not run this against a live production target as a test.
4. After cutover, verify catalog queries, API health, login/admin behavior if enabled, and a representative playback workflow; then take and test a new backup.

## 6. Incident checklist

- [ ] Alert received; capture event, phase, consecutive failures and last successful timestamps.
- [ ] Read scheduler logs and .scheduler-state.json; identify database, filesystem, encryption or remote-provider failure.
- [ ] Check local free space and R2 credentials/permissions without pasting secrets into tickets or chats.
- [ ] Confirm the needed private age identity exists in the secure recovery vault.
- [ ] Verify the selected logical dump or full/incremental chain in an isolated instance.
- [ ] Do not delete parent physical backups or run destructive restore commands until the recovery target and plan are reviewed.
- [ ] After recovery, confirm a backup_recovered event and create a fresh verified off-site backup.
