# rent-apartment

Apartment rental management system.

## Database

Versioned schema migrations live in `migrations/`. Optional demo seed data lives in `seeds/`.

From `backend/`, configure `DATABASE_URL` in `.env`, then run:

```sh
npm run db:migrate
```

To also load local demo accounts and sample rental data:

```sh
npm run db:seed
```

See `docs/database-migrations.md` for migration naming, dry-run, rollback, and restore notes.
