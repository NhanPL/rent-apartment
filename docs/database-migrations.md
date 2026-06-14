# Database Migrations

Schema changes are versioned in `migrations/`. Demo data is kept separately in `seeds/` and only runs when explicitly requested.

## Local Setup

1. Create a PostgreSQL database.
2. Copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`.
3. From `backend/`, run:

```sh
npm run db:migrate
```

To load optional demo data after schema migrations:

```sh
npm run db:seed
```

Seed data is intended for disposable local databases. Do not run it against shared or production data.

The demo seed creates these local accounts:

- `manager@example.com` / `password`
- `tenant@example.com` / `password`

## How It Works

The runner applies SQL files by lexical order and records each applied file in `schema_migrations`. Seed files are tracked separately in `seed_migrations`.

Do not edit a migration after it has been applied to a shared database. Add a new file instead, using the naming pattern:

```text
YYYYMMDD_short_description.sql
```

For a local preview without applying changes:

```sh
npm run db:migrate -- --dry-run
npm run db:seed -- --dry-run
```

## Rollback And Restore

Rollback is intentionally manual for now. Before applying migrations to any non-local database, take a backup:

```sh
pg_dump "$DATABASE_URL" --format=custom --file=backup.dump
```

If a migration needs to be undone, prefer restoring the latest verified backup:

```sh
pg_restore --clean --if-exists --dbname="$DATABASE_URL" backup.dump
```

For small local mistakes, write a new forward migration that reverses the bad change. Avoid deleting rows from `schema_migrations` unless you are rebuilding a disposable local database.
