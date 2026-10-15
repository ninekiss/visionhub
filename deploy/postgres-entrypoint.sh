#!/bin/sh
set -eu

PGDATA_PATH="${PGDATA:-/var/lib/postgresql/18/docker}"
# Existing named volumes do not rerun /docker-entrypoint-initdb.d scripts.
# Ensure the managed PostgreSQL 18 cluster permits password-authenticated
# replication-protocol connections from the private Compose network.
if [ -s "${PGDATA_PATH}/PG_VERSION" ] && [ -f "${PGDATA_PATH}/pg_hba.conf" ]; then
  if ! grep -Eq '^[[:space:]]*host[[:space:]]+replication[[:space:]]+all[[:space:]]+all[[:space:]]+scram-sha-256([[:space:]]|$)' "${PGDATA_PATH}/pg_hba.conf"; then
    printf '\nhost replication all all scram-sha-256\n' >> "${PGDATA_PATH}/pg_hba.conf"
  fi
fi

exec /usr/local/bin/docker-entrypoint.sh "$@"
