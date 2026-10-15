#!/bin/sh
set -eu

if ! grep -Eq '^[[:space:]]*host[[:space:]]+replication[[:space:]]+all[[:space:]]+all[[:space:]]+scram-sha-256([[:space:]]|$)' "$PGDATA/pg_hba.conf"; then
  printf '\nhost replication all all scram-sha-256\n' >> "$PGDATA/pg_hba.conf"
fi
