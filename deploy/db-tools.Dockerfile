FROM node:24.21.0-alpine AS node-runtime

FROM postgres:18-alpine
USER root

# PostgreSQL 18 CLI tools provide pg_dump/pg_restore plus physical
# incremental backup/restore utilities (pg_basebackup, pg_combinebackup).
COPY --from=node-runtime /usr/local/ /usr/local/
RUN apk add --no-cache su-exec rclone age tzdata \
    && corepack enable pnpm \
    && node --version \
    && pnpm --version \
    && pg_basebackup --version \
    && pg_combinebackup --version \
    && rclone version \
    && age --version \
    && age-keygen --version \
    && mkdir -p /app /backups

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile --filter @visionhub/api...

COPY apps/api apps/api
COPY packages/config packages/config
COPY packages/contracts packages/contracts
COPY configs configs
COPY scripts scripts

RUN pnpm --filter @visionhub/api db:generate \
    && node --check scripts/db-tools.mjs \
    && node --check scripts/backup-alerts.mjs \
    && node --check scripts/backup-alerts.test.mjs \
    && node --check scripts/backup-scheduler.mjs

ENV VISIONHUB_BACKUP_DIR=/backups
ENTRYPOINT ["node", "scripts/db-tools.mjs"]
CMD ["help"]
