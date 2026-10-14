ARG POSTGRES_IMAGE=postgres:18-alpine
FROM ${POSTGRES_IMAGE}

COPY --chmod=755 deploy/postgres-entrypoint.sh /usr/local/bin/visionhub-postgres-entrypoint.sh
COPY --chmod=755 deploy/90-enable-replication.sh /docker-entrypoint-initdb.d/90-enable-replication.sh

ENTRYPOINT ["/usr/local/bin/visionhub-postgres-entrypoint.sh"]
