# Backup And Disaster Recovery

## Objectives

The initial production target is **RPO 24 hours** and **RTO 4 hours**. Database
backups run daily at 18:17 UTC. A weekly restore test runs on Sunday; operators
must investigate the same day when backup, upload verification, or restore
verification fails. Tighten the RPO with provider point-in-time recovery before
the business accepts more than one day of unrecoverable writes.

## Storage And Retention

Use a dedicated backup AWS account and a bucket in a region different from the
database. Enable versioning, block all public access, enforce TLS, default
SSE-KMS with a backup-only key, object lock when available, access logging, and
cross-region replication. The GitHub `production-backup` environment should
hold a backup principal limited to write/read verification and KMS
encrypt/decrypt, without object or bucket deletion; application runtime
credentials must not access backups.

`database-backup.yml` creates a PostgreSQL custom archive, validates its table
of contents, encrypts it locally with AES-256/PBKDF2, uploads it with SSE-KMS,
and verifies the object. Sunday backups are restored into an ephemeral
PostgreSQL 17 container and queried before success is reported. The workflow
stores no unencrypted artifact.

Apply `ops/s3-backup-lifecycle.json` after replacing the prefix when needed:

```sh
aws s3api put-bucket-lifecycle-configuration \
  --bucket "$BACKUP_S3_BUCKET" \
  --lifecycle-configuration file://ops/s3-backup-lifecycle.json
```

Retention is 35 daily backups, 14 weekly backups (98 days), and 84 monthly
backups (seven years). Legal/accounting owners must approve the monthly period.
The workflow deliberately fails when bucket versioning, encryption, or a
lifecycle policy is absent.

## Cloudinary Recovery

Enable Cloudinary automatic backup for the production product environment and
restrict restore/delete access to a separate operator role. Retain the database
metadata (`public_id`, resource type, version, delivery type, checksum/size when
available) in PostgreSQL backups. Test quarterly that an authenticated tenant
document can be restored to a non-production Cloudinary environment and served
only through the backend signed-delivery authorization path. For regional
outage requirements, contract Cloudinary multi-region storage/backup rather
than copying private documents into a public bucket.

## Database Loss Runbook

1. Declare an incident, stop writes, put the API out of rotation, and record the UTC incident time.
2. Confirm whether provider point-in-time recovery gives a better RPO than the latest archive.
3. Create a new isolated PostgreSQL instance with certificate-verified TLS; never restore over the only remaining copy.
4. Download the selected object and checksum from the backup account, verify SSE-KMS metadata and SHA-256, then decrypt in an encrypted temporary workspace.
5. Run `pg_restore --list`, restore with `--exit-on-error --no-owner --no-acl`, and apply any later forward migrations.
6. Validate `schema_migrations`, account counts, active contracts, invoice/payment ledger totals, audit logs, and sampled signed-document access.
7. Rotate database credentials, deploy the recovered URL, run `/ready` and business smoke tests, then restore traffic gradually.
8. Record the actual recovery point, lost-write window, recovery duration, validation evidence, and follow-up actions.

## Failed Deploy Runbook

1. Stop traffic shifting and preserve logs, release ID, migration version, and request IDs.
2. If the schema change is backward-compatible, redeploy the previous image and prepare a forward fix.
3. If a committed breaking migration prevents rollback, stop writes and follow the documented restore point or complete the prepared contract-compatible forward fix.
4. Run `npm run db:migrate:verify`, `/health`, `/ready`, login, tenant document, invoice, and payment smoke tests.
5. Resume traffic only when error rate, latency, and pool pressure remain within thresholds.

## Secret Rotation Runbook

1. Create a replacement secret at the provider and store it in the platform secret manager.
2. Deploy consumers that accept the replacement; for database credentials, validate TLS and `/ready` before traffic shifts.
3. Revoke the old credential at PostgreSQL, AWS/KMS, Cloudinary, SMTP, Sentry, or the owning provider.
4. JWT secret rotation signs users out; rotate access and refresh secrets independently and communicate the impact.
5. Review audit/application/provider logs for old-secret use and record only the secret identifier and rotation time, never its value.
