# Security Operations

## Secret Storage

`.env` files and private keys are ignored at the repository root and in each
application. Only `.env.example` templates may be committed. Do not put a real
credential in an example, test fixture, issue, pull request, build log, or
frontend `VITE_*` variable.

Staging and production must inject secrets through the deployment platform:

- Render: use Environment Groups or the service's secret environment values.
- Vercel: use encrypted Environment Variables scoped separately to Preview and
  Production. Backend-only secrets must never use the `VITE_` prefix.
- Supabase: store database credentials in the backend deployment platform and
  use Supabase project secrets only for Supabase-hosted server functions.
- GitHub Actions: use repository or environment secrets; use environment
  protection rules for production deployment jobs.

At minimum, treat these values as secrets: `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `MFA_ENCRYPTION_SECRET`, `DOCUMENT_ACCESS_SECRET`,
`CLOUDINARY_API_SECRET`, `SMTP_PASS`, and any provider token. Generate JWT
secrets from a cryptographically secure random source with at least 32 random
bytes and store the two values separately.

## PostgreSQL TLS

`APP_ENV=staging` and `APP_ENV=production` enforce:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
```

If the provider uses a CA that is not in the Node.js trust store, inject its PEM
certificate as `DB_SSL_CA`. Both literal multiline PEM and `\n`-encoded values
are accepted. Keep certificate verification enabled and verify that the
hostname in `DATABASE_URL` matches the certificate.

## Rotation Procedure

1. Create the replacement credential in the provider or secret manager.
2. Deploy consumers with the replacement credential.
3. Revoke the previous credential at the provider.
4. Confirm login, database, upload, and email health checks as applicable.
5. Review logs and GitHub security alerts for unexpected use of the old value.
6. Record the rotation date without recording the credential itself.

Changing `JWT_ACCESS_SECRET` invalidates access tokens. Changing
`JWT_REFRESH_SECRET` invalidates every refresh token and requires users to sign
in again. Rotate both after any suspected disclosure. Database, Cloudinary, and
SMTP credentials must also be revoked at their owning provider, not merely
changed in the application configuration.

Changing `MFA_ENCRYPTION_SECRET` without first re-encrypting stored TOTP
secrets prevents managers with 2FA enabled from signing in. Treat its rotation
as a data migration: deploy dual-key decryption, re-encrypt every manager TOTP
secret, then remove the previous key.

## Repository Scanning

The SEC-006 review checked all Git history for tracked `.env`, private-key, and
common credential patterns. No committed runtime `.env` or private key was
found; matches were limited to placeholders and test-only values, so no
provider credential rotation was indicated by that scan.

Gitleaks scans full history on push, pull request, schedule, and manual runs.
Dependabot monitors both npm projects and GitHub Actions. CodeQL runs the
`security-extended` JavaScript/TypeScript query suite. CI installs committed
lockfiles and fails when `npm audit` reports a high or critical vulnerability.

In repository **Settings > Code security**, enable GitHub Secret Protection,
secret scanning, and push protection when the repository plan supports them.
Repository administrators should treat a native GitHub or Gitleaks alert as a
potential disclosure until the owning provider confirms the credential is
revoked.
