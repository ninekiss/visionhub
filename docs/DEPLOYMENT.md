# Deployment and database operations

## Deployment options

Create the repository-root `.env` from `.env.example` and set the connection URL for the environment where each process runs. The API requires a reachable PostgreSQL database and uses only the `visionhub` schema.

### Direct database address

The default `infra/compose.yaml` starts only Web and API. Set `DATABASE_URL_DOCKER` to a host name or IP reachable from inside the API container; if it is unset, the container uses `DATABASE_URL`. No extra Docker network is needed when the address is directly routable.

```sh
docker compose --env-file .env -f infra/compose.yaml up --build -d
```

Do not use `localhost` in a container's connection URL unless PostgreSQL is in that same container. `localhost` always refers to the current container/process environment.

### Existing PostgreSQL on a Docker network

If the database is reachable by its container name or network alias, set `EXISTING_DB_NETWORK` to the already-existing network name and point `DATABASE_URL_DOCKER` at that alias. Then run:

```sh
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.existing-db-network.yaml up --build -d
```

The overlay adds only the API service to that external network. The network must already exist; this mode does not create or manage the existing database container.

### Optional PostgreSQL service in Compose

The database service is deliberately separate and is not started by the default Compose file. To opt in, set `POSTGRES_PASSWORD`. This overlay explicitly points the API at `postgres:5432` and builds its connection URL from `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`, so a `DATABASE_URL_DOCKER` left over from another deployment mode is ignored. Host-side migration commands still use `DATABASE_URL`, which should point to `127.0.0.1:5433` by default. Use a URL-safe password (letters, digits, hyphens and underscores are safe choices), because the overlay interpolates `POSTGRES_PASSWORD` into the connection URI, then start PostgreSQL by itself:

```sh
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml up -d postgres
pnpm db:setup
```

After the migration and seed step succeeds, start the application with the same files:

```sh
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.database.yaml up --build -d
```

The service uses a named `postgres_data` volume. Its host port is bound to `127.0.0.1:5433` by default so it is not exposed to the LAN. The API connects over the Compose app network using `postgres:5432`; host-side commands such as `pnpm db:setup` should use `DATABASE_URL` pointing to `127.0.0.1:5433`.

To stop this deployment, use the same Compose file list and run `down`. The named volume remains. Do not remove the volume unless the intent is to permanently delete this database's data.

### Optional API host port

The API is not published to the host by default; browsers reach it through the Web/Nginx reverse proxy. When a local tool needs direct API access, include `infra/compose.api-published.yaml`:

```sh
docker compose --env-file .env -f infra/compose.yaml -f infra/compose.api-published.yaml up --build -d
```

The optional mapping binds only to `127.0.0.1` and can be combined with either database mode. The local PostgreSQL overlay and existing-database-network overlay are alternative database choices; do not enable them together.

## Database migration procedure

1. Confirm `DATABASE_URL` points to the intended database and that the account has permission to create/update objects in the `visionhub` schema.
2. Take a schema-only backup before a schema change (instructions below).
3. Run migrations explicitly from the repository root with `pnpm db:migrate`. For a new local database, `pnpm db:setup` also seeds the catalog; do not run setup against a production database merely to deploy an application version.
4. Deploy/restart the application version and check the Web UI and API health.
5. Keep the backup until the new version has been accepted.

Neither API startup nor `docker compose up` runs Prisma migrations automatically.

## Backup and rollback

Use PostgreSQL client tools compatible with the server version. Run these commands from a machine that can reach the database, and use a connection URI with the real host, port, user and database name. For `pg_dump`/`pg_restore`, omit Prisma's `?schema=visionhub` query parameter from the URI; select the application schema with the command-line option instead.

Create a custom-format backup of only VisionHub's schema:

```sh
pg_dump --format=custom --schema=visionhub --file=visionhub-before-change.dump --dbname="postgresql://USER@HOST:PORT/visionhub"
```

The client prompts for the password when needed. Keep backup files outside the repository and limit access to them. Check the archive before relying on it:

```sh
pg_restore --list visionhub-before-change.dump
```

For rollback, stop the application first. Prefer testing the archive against a separate empty database before touching the existing schema. Restoring in place replaces objects from the selected schema and can discard data written since the backup; do it only after verifying the target connection and coordinating a maintenance window:

```sh
pg_restore --clean --if-exists --no-owner --no-privileges --schema=visionhub --dbname="postgresql://USER@HOST:PORT/visionhub" visionhub-before-change.dump
```

These examples target only the `visionhub` schema, not other schemas or PostgreSQL roles. They do not replace an infrastructure-level backup for the whole database cluster.

## Operational behavior

- API and Web containers restart unless explicitly stopped.
- API readiness checks a catalog request, which also exercises its database path; Web waits for API health before starting.
- NestJS listens for termination signals so it can finish shutdown and disconnect Prisma cleanly.
- Admin credentials and session secrets are injected through environment variables. Keep real `.env` files out of Git.
- The API container port is internal by default. Only Web publishes a host port unless the API port overlay is selected.
