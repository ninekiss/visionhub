ARG POSTGRES_IMAGE=postgres:18-alpine
FROM ${POSTGRES_IMAGE}

COPY --chmod=755 deploy/postgres-entrypoint.sh /usr/local/bin/visionhub-postgres-entrypoint.sh
COPY --chmod=755 deploy/90-enable-replication.sh /docker-entrypoint-initdb.d/90-enable-replication.sh

# Windows checkouts may convert shell scripts to CRLF. Linux then looks for
# an interpreter named "/bin/sh\r" and reports a misleading "not found".
# Normalize both scripts inside the image, independent of host Git settings.
RUN sed -i 's/\r$//' \
      /usr/local/bin/visionhub-postgres-entrypoint.sh \
      /docker-entrypoint-initdb.d/90-enable-replication.sh

ENTRYPOINT ["/usr/local/bin/visionhub-postgres-entrypoint.sh"]
CMD ["postgres"]
