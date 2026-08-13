# Production Runbooks

These runbooks are the operator-facing procedures for the Rent Apartment
service. Replace placeholders such as `<release>`, `<api-host>`, and `<user-id>`
with reviewed values. Run production commands from an audited operator session,
record all times in UTC, and never paste credentials or sensitive document URLs
into tickets or chat.

## Common Incident Rules

1. Name an incident owner and record the start time, environment, release ID,
   request IDs, affected users, and observed impact.
2. Prefer reversible containment: stop traffic shifting, disable a failing
   integration, or put writes into maintenance mode before changing data.
3. Preserve logs and database evidence before remediation.
4. Use the platform secret manager and a temporary encrypted workspace. Do not
   place production secrets in shell history or repository files.
5. Close an incident only after `/health`, `/ready`, the affected business flow,
   logs, metrics, and queued jobs are healthy.

## Deploy A New Release

### Before deployment

1. Confirm CI typecheck, lint, unit, integration, build, dependency audit,
   secret scan, and CodeQL checks passed for the immutable Git SHA.
2. Review included migrations. Classify each as backward-compatible or breaking,
   name the migration owner, and rehearse it against a restored production-sized
   database.
3. Verify the latest encrypted database backup and restore test. Take an
   additional pre-deploy backup for a breaking or high-risk migration.
4. Confirm environment variables against `backend/.env.example`, with
   `APP_ENV=production`, certificate-verified PostgreSQL TLS, exact CORS origins,
   secure cookies, and an immutable `APP_VERSION`.
5. Build the exact release image from the repository root:

   ```sh
   docker build -f backend/Dockerfile -t rent-apartment-api:<release> .
   ```

### Deployment

1. Deploy the image as a one-off release job and apply migrations before sending
   application traffic to the new instances:

   ```sh
   docker run --rm --env-file /secure/backend.env \
     rent-apartment-api:<release> npm run db:migrate
   docker run --rm --env-file /secure/backend.env \
     rent-apartment-api:<release> npm run db:migrate:verify
   ```

2. Start the new API instances without terminating the old pool. Wait for both
   probes to pass:

   ```sh
   curl --fail https://<api-host>/health
   curl --fail https://<api-host>/ready
   ```

3. Shift a small traffic percentage. Check error rate, p95 latency, database pool
   pressure, background jobs, login failures, and Sentry before full rollout.
4. Smoke test manager login, tenant login, private-document access, rental
   registration, utility submission, invoice issue, payment proof submission,
   and manager approval with staging/test records appropriate to production.

### Completion

Record the release SHA, image digest, migrations, deployment times, smoke-test
request IDs, and dashboard links. Keep the previous compatible image available
until the observation window closes.

## Run Database Migrations

1. Read `docs/database-migrations.md`; never edit an applied migration or run a
   handwritten `database.sql` against a new environment.
2. Set `DATABASE_URL`, `DB_SSL=true`, `DB_SSL_REJECT_UNAUTHORIZED=true`, the CA
   when required, and the release `APP_VERSION` through the secret manager.
3. Check pending work without writes:

   ```sh
   cd backend
   npm run db:migrate -- --dry-run
   ```

4. Check active sessions, long-running queries, lock waiters, disk space, and
   replica lag. Pause if the expected lock cannot be acquired within the planned
   window.
5. Apply from the release image or checked-out release, once only:

   ```sh
   npm run db:migrate
   npm run db:migrate:verify
   ```

6. Confirm the newest `schema_migrations` rows carry the expected checksum and
   application version. Validate `/ready` and the changed read/write path.
7. Do not run `npm run db:seed` in staging or production; the runner blocks it by
   design.

## Rollback Or Forward-Fix

Use a forward-fix for every committed migration unless restoring data is the
only safe recovery. The migration runner wraps ordinary migration files in a
transaction, so a failed uncommitted migration can be corrected and rerun.

1. Stop traffic shifting and capture release, migration, error, request IDs, and
   database lock state.
2. If schema and previous code remain compatible, redeploy the previous image.
   Leave additive schema in place and prepare a new migration/application fix.
3. If a committed data transform is wrong, stop affected writes. Create a new,
   reviewed migration that repairs data in restartable bounded batches.
4. If a breaking migration makes both code versions unsafe or corrupts data,
   declare database recovery and follow the restore runbook below. Never delete
   rows from `schema_migrations` to pretend a production migration did not run.
5. After recovery, run migration verification, health/readiness probes, and the
   affected smoke tests. Record whether writes were lost and reconcile any
   external actions made during the incident window.

## Restore PostgreSQL

The target is RPO 24 hours and RTO 4 hours until provider point-in-time recovery
is enabled with a stricter objective.

1. Stop all writes and remove API/background-job instances from traffic.
2. Choose the latest valid provider recovery point or encrypted archive before
   the incident. Record its timestamp and expected lost-write interval.
3. Create a new isolated PostgreSQL instance with certificate-verified TLS. Do
   not restore over the only remaining copy.
4. Download the backup and checksum into an encrypted temporary workspace.
   Verify S3/KMS metadata, SHA-256, decrypt it, then inspect it:

   ```sh
   pg_restore --list backup.dump
   pg_restore --exit-on-error --no-owner --no-acl \
     --dbname="$RECOVERY_DATABASE_URL" backup.dump
   ```

5. Run current forward migrations and `npm run db:migrate:verify` against the
   recovery database.
6. Compare account, active-contract, invoice, payment/reversal, and audit-log
   counts. Reconcile ledger net totals and test sampled authenticated documents.
7. Rotate database credentials, deploy the recovered URL, pass `/ready` and
   business smoke tests, then restore traffic gradually.
8. Securely remove decrypted temporary files and document the actual RPO/RTO,
   validation evidence, data loss, and follow-up work.

## Cloudinary Failure

### Detect and contain

1. Confirm Cloudinary provider status and whether upload, authenticated delivery,
   delete, list, or signature operations are affected. Use request IDs and
   redacted `public_id` hashes; never log signed URLs.
2. Keep core database workflows available where they do not require documents.
   Tell users an upload is pending rather than repeatedly accepting duplicate
   files. Do not switch private assets to public delivery.
3. Inspect `GET /api/operations/jobs?limit=50`, Sentry, and document asset job
   tables for retry counts and exhausted jobs.

### Recover

1. Restore valid Cloudinary credentials through the secret manager if auth is
   the issue. Test with a non-sensitive asset in the correct product environment.
2. Restart or allow the coordinated background scheduler to retry queued
   post-commit deletes and retention operations. Do not manually remove database
   metadata before provider deletion succeeds.
3. Run or observe the daily document reconciliation job. Investigate orphan
   assets and orphan database records one at a time; verify ownership and audit
   history before deleting either side.
4. Sample tenant documents, contract files, utility evidence, and payment proofs
   through backend-signed delivery. Confirm expiry, role checks, and `no-store`
   responses.
5. For lost assets, use Cloudinary backup restore into a non-production product
   environment first, validate metadata/version, then restore production access.

## Email Delivery Failure

1. Confirm `SMTP_ENABLED`, provider status, DNS/authentication, sender identity,
   quotas, and whether failures affect activation, password reset, or durable
   notification outbox messages.
2. Check recent job runs and `email_outbox` statuses (`PENDING`, `PROCESSING`,
   `SENT`, `FAILED`), attempts, and `next_attempt_at`. Do not expose token-bearing
   email payloads in incident notes.
3. If credentials are invalid, rotate them in the provider and secret manager,
   redeploy, and send a test message to an operator-controlled address.
4. The scheduler retries durable notifications with backoff. After the provider
   recovers, reset only confirmed transient failures to `PENDING` in a reviewed
   transaction, preserving attempts and incident evidence. Activation/reset
   requests can be safely reissued through their normal UI, which revokes the
   previous one-time token.
5. Verify new mail delivery, queue depth reduction, bounce/complaint rate, and
   that no recipient receives duplicate financial notifications.

## Payment Reconciliation

1. Freeze approvals for the affected period if ledger totals or bank deposits do
   not agree. Keep proof submissions available unless they worsen the incident.
2. Export the manager reconciliation report for an explicit UTC date/month range.
   Compare bank transaction reference, amount, paid timestamp, invoice, payment
   request, proof, and immutable ledger entry.
3. Classify each difference as timing, missing proof, duplicate bank transfer,
   incorrect approval, reversal, overpayment, or bank fee. Never update/delete an
   approved payment row.
4. For an incorrect approval, use the manager reversal action with a required
   reason. Confirm it links to the original payment and changes net payment only
   once. For a valid replacement, approve the correct proof as a new ledger row.
5. Confirm an invoice never receives approved net payment above its business
   limit and its status matches net payment (`ISSUED`, `PARTIALLY_PAID`, `PAID`,
   or `VOID`). Voided invoices retain ledger and proof history.
6. Re-export reconciliation, compare net totals to the bank statement, and attach
   the report checksum and relevant audit action IDs to the incident record.

## Lock A Compromised Account

1. Verify the report using a second trusted channel. Record the user ID and role,
   not password, token, Citizen ID, or private file URL.
2. A manager can deactivate a managed tenant account through the account-status
   action. For a compromised manager, an authorized database/security operator
   must atomically set `is_active=false`, set `account_status='DISABLED'`,
   increment `session_version`, and revoke all active `auth_session` rows.
3. Rotate any application/provider credential exposed through that account. If a
   refresh token is suspected, revoke the token family; if scope is unknown,
   revoke every session for the user.
4. Review audit logs, login throttle events, session device metadata, private
   document views, tenant changes, invoice issue/void actions, and payment
   approvals from the suspected window.
5. Reverse incorrect approved payments rather than editing them. Void affected
   issued invoices only with a reason. Preserve forensic records.
6. Restore access only after identity verification and password reset. Require a
   new login on all devices, then monitor authentication and financial actions.

## Rotate Secrets

Never rotate by only changing application configuration. Create the replacement,
deploy it safely, revoke the old credential at its owner, and review old-key use.

### JWT access and refresh secrets

1. Generate two distinct values with at least 32 cryptographically random bytes.
2. Schedule a maintenance window because a single-secret deployment invalidates
   current access and refresh tokens. Update both secret-manager values and
   restart all API instances together.
3. Verify old refresh cookies fail, login creates a new session, refresh rotates
   once, and logout revokes it. Communicate that all users must sign in again.

### Cloudinary

1. Create/enable the replacement API credential with the minimum required scope.
2. Update `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET`, deploy, then test a
   private upload, signed delivery, and queued delete.
3. Revoke the old credential in Cloudinary and inspect provider logs for reuse.

### SMTP

1. Create a replacement SMTP credential restricted to the approved sender.
2. Update `SMTP_USER`/`SMTP_PASS`, deploy, and send an operator test email.
3. Revoke the old credential, then monitor authentication failures, bounce rate,
   and outbox recovery.

### PostgreSQL

1. Create a new least-privilege application role/password and grant the existing
   schema/table/sequence privileges. Keep TLS certificate verification enabled.
2. Update `DATABASE_URL`, deploy a canary, and confirm `/ready`, migrations
   verification, and representative read/write transactions.
3. Roll all instances, terminate old-role sessions after graceful drain, then
   revoke/drop the old role when no active connection uses it.
4. Monitor connection errors, pool saturation, locks, and background jobs.

For every rotation, record the secret identifier/version, operator, UTC times,
affected services, validation evidence, and revocation confirmation. Never
record the secret value.
