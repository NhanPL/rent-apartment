# Deployment Environments

The backend supports four explicit environments. `APP_ENV` controls security
behavior; `NODE_ENV` controls Node.js dependency/runtime behavior. Staging and
production must set both values through the deployment platform.

| Environment | Configuration source | PostgreSQL TLS | Secure refresh cookie | API docs | Seed data |
| --- | --- | --- | --- | --- | --- |
| Development | Local `backend/.env` | Optional | No | Enabled | Allowed explicitly |
| Test | Test process environment | Optional | No | Disabled by tests | Disposable only |
| Staging | Platform secrets/settings | Required, certificate verified | Yes | Enabled | Blocked |
| Production | Platform secrets/settings | Required, certificate verified | Yes | Disabled by default | Blocked |

Staging must use the same topology as production: the same proxy hop count,
cookie site relationship, PostgreSQL TLS verification, Cloudinary authenticated
delivery, migration command, container image, and secret injection mechanism.
Use separate credentials, databases, Cloudinary folders, email recipients, and
Sentry environments so staging cannot modify or notify production users.

## Required Variables

Every environment requires `DATABASE_URL`, `JWT_ACCESS_SECRET`, and
`JWT_REFRESH_SECRET`. Staging and production additionally require explicit
`MFA_ENCRYPTION_SECRET`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, `DOCUMENT_DELIVERY_BASE_URL`,
`DB_SSL=true`, and `DB_SSL_REJECT_UNAUTHORIZED=true`. Supply `DB_SSL_CA` when
the database provider's CA is not in the Node.js trust store.

Set `APP_VERSION` to an immutable release identifier. Production deployments
should also set `FRONTEND_URL`, document-access/audit secrets, Cloudinary
credentials, bank/VietQR details, retention periods, and alert thresholds to
reviewed values instead of relying on development defaults.

## Optional Integrations

Sentry is disabled when `SENTRY_DSN` is blank. Email is explicitly controlled by
`SMTP_ENABLED`. Keep it `false` with all SMTP values blank, or set it to `true`
and provide `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM_EMAIL`.
Partial SMTP configuration fails startup. Shared staging and production should
enable SMTP when tenant activation or password reset email is part of the
supported workflow.

## Container Build

Build from the repository root so the image includes the migration source:

```sh
docker build -f backend/Dockerfile -t rent-apartment-api:${APP_VERSION} .
docker run --rm -p 4000:4000 --env-file /secure/path/backend.env rent-apartment-api:${APP_VERSION}
```

The image pins Node 22, compiles in a separate stage, installs only production
dependencies in the runtime stage, and runs as the built-in non-root `node`
user. Run `npm run db:migrate` as a one-off release job using the same image
before shifting traffic. The image healthcheck targets `/ready`; orchestration
liveness should target `/health` separately.
