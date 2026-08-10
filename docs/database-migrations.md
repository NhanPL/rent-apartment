# Database Migrations

`migrations/` is the only source of truth for the database schema. Demo data is
kept separately in `seeds/` and only runs when explicitly requested.

## Local Setup

1. Create a PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`.
3. From `backend/`, run:

```sh
npm run db:migrate
```

For staging and production, inject `DATABASE_URL` and `DB_SSL_CA` through the
deployment secret manager. The migration runner does not load `.env` files in
those environments and requires both `DB_SSL=true` and
`DB_SSL_REJECT_UNAUTHORIZED=true`.

To load optional demo data after schema migrations:

```sh
npm run db:seed
```

Seed data is intended for disposable local databases. Do not run it against shared or production data.

The current local seed creates these accounts:

- `manager@example.com` / `Local Manager 2026!`
- `tenant@example.com` / `Local Tenant 2026!`

## How It Works

The runner applies SQL files by lexical order and records each applied file in
`schema_migrations`. Seed files are tracked separately in `seed_migrations`.

Do not edit, rename, or delete a migration after it has been applied. Every
schema change must be a new forward migration using the naming pattern:

```text
YYYYMMDD_short_description.sql
```

For a local preview without applying changes:

```sh
npm run db:migrate -- --dry-run
npm run db:seed -- --dry-run
```

## Migration Classification

Every migration must be classified in its pull request and deploy ticket:

- **Backward-compatible**: additive nullable columns, new tables, concurrent
  indexes, or code that continues to work with both old and new schemas. These
  may ship with the application after rehearsal.
- **Breaking**: column removal/rename, type narrowing, new non-null guarantees,
  or behavior that old application instances cannot use. Use
  **expand-migrate-contract** across separate releases: add the new shape,
  deploy dual-read/dual-write code, backfill in bounded batches, switch reads,
  and remove the old shape only after rollback is no longer required.

Do not combine expand and contract phases in one migration. Large backfills
must run separately in restartable batches, outside peak traffic. Indexes on
large live tables should use `CREATE INDEX CONCURRENTLY` in a dedicated
non-transactional operational step; document that exception because the normal
runner intentionally wraps migrations in transactions.

The runner applies a configurable PostgreSQL lock timeout and statement timeout
to each migration. Defaults are `5s` and `15m`; override
`MIGRATION_LOCK_TIMEOUT_MS` or `MIGRATION_STATEMENT_TIMEOUT_MS` only in the
deploy environment after reviewing the expected query plan and lock impact.

## Deployment Checklist

Before a staging or production migration:

1. Record the migration classification, owner, expected duration and forward-fix plan.
2. Take a database backup and verify that the artifact is readable and encrypted.
3. Restore the latest backup into an isolated rehearsal database whose size and data distribution are close to production.
4. Run `npm run db:migrate -- --dry-run`, then time the real migration on that rehearsal database.
5. Inspect long-running queries, table locks, disk headroom and affected query plans.
6. Schedule breaking or lock-heavy work outside peak traffic and notify the rollback owner.
7. Set `APP_VERSION` to the immutable release identifier, preferably the Git SHA or release tag.

After deployment, run:

```sh
npm run db:migrate:verify
```

The command is read-only and fails when a local migration is missing from the
database or an applied checksum differs. Confirm the application `/ready`
endpoint, key write/read flows and error rate before closing the deploy. The
`schema_migrations.application_version` column links each newly applied schema
version to the release that installed it.

## Generated Schema Snapshot

No manually maintained `database.sql` is committed or used to create a new
database. If a tool requires one SQL file, generate a temporary snapshot from
the migrations:

```sh
cd backend
npm run db:schema:export
```

The generated repository-root `database.sql` is ignored by Git and starts with
a generated-file warning. It is an inspection/tooling artifact only; do not edit
it or use it instead of `npm run db:migrate`.

## Rollback And Restore

Rollback is intentionally manual for now. Before applying migrations to any non-local database, take a backup:

```sh
pg_dump "$DATABASE_URL" --format=custom --file=backup.dump
```

For a failed migration that has not committed, fix the cause and rerun it. For a
committed backward-compatible change, prefer a new forward migration and a
forward-fix application release. Avoid ad-hoc down migrations because data loss
often cannot be reversed safely.

If a breaking migration corrupts data or prevents the previous release from
starting, stop writes and restore the latest verified backup:

```sh
pg_restore --clean --if-exists --dbname="$DATABASE_URL" backup.dump
```

Record the restore point, lost-write window, validation results and incident
owner. For small local mistakes, write a new forward migration that reverses the
bad change. Avoid deleting rows from `schema_migrations` unless you are
rebuilding a disposable local database.
