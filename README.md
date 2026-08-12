# Rent Apartment Management System

Fullstack apartment rental management app built with React, TypeScript, Ant Design, Node.js, Express, and PostgreSQL.

## Prerequisites

- Node.js 22 (see `.nvmrc`)
- npm
- PostgreSQL 14 or newer
- PowerShell, Bash, or another terminal

## Project Structure

- `backend`: Express API, PostgreSQL access, auth, business rules
- `front-end`: Vite React app
- `migrations`: ordered SQL schema migrations and the database source of truth
- `seeds`: optional data for disposable local databases
- `.env.example`: combined environment reference

Start with [`docs/architecture.md`](docs/architecture.md) for the component
map, authentication/session lifecycle, business state machines, authorization,
file delivery, and major architectural decisions.

Production operators should use [`docs/runbooks.md`](docs/runbooks.md) for
deployments, migrations, recovery, integration incidents, reconciliation,
account containment, and secret rotation.

## Database Setup

Create a local database, configure `DATABASE_URL` in `backend/.env`, then run the
versioned migrations:

```bash
createdb rent_apartment
cd backend
npm run db:migrate
```

Use the same command for an existing, hosted PostgreSQL, or Supabase database.
The migration ledger skips versions that are already applied and rejects edits
to applied migrations.

## Backend Environment

Copy the backend example file:

```bash
cd backend
cp .env.example .env
```

For local PostgreSQL, the default values are a good starting point:

```env
PORT=4000
DATABASE_URL=postgres://user:pass@localhost:5432/rent_apartment
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=false
CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
ACCOUNT_ACTIVATION_EXPIRES_HOURS=48
```

Set strong values for:

```env
JWT_ACCESS_SECRET=<random_access_secret_at_least_32_characters>
JWT_REFRESH_SECRET=<different_random_refresh_secret_at_least_32_characters>
MFA_ENCRYPTION_SECRET=<random_mfa_encryption_secret_at_least_32_characters>
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
```

The environment contract is validated at startup. The most important groups
are:

| Group | Required | Optional / feature-gated |
| --- | --- | --- |
| Core | `APP_ENV`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | `PORT`, pool sizing, log level |
| Manager 2FA | `MFA_ENCRYPTION_SECRET` in staging/production | Falls back to the refresh secret only in local development/test |
| Browser security | `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL`, exact `TRUST_PROXY_HOPS` in staging/production | Refresh-cookie name/domain/SameSite |
| Database TLS | `DB_SSL=true` and verified certificates in staging/production | `DB_SSL_CA` when the provider CA is not publicly trusted |
| Private documents | `DOCUMENT_ACCESS_SECRET`, Cloudinary cloud/key/secret in shared environments | Retention/job intervals and upload-size limits |
| Payments | Manager-supplied bank details or deploy defaults | `DEFAULT_BANK_*`, VietQR base URL/template |
| Email | None when `SMTP_ENABLED=false` | Complete SMTP credentials when enabled; `EMAIL_NOTIFICATIONS_ENABLED` controls product notifications |
| Operations | `APP_VERSION` for immutable releases | Sentry DSN, metric thresholds, job cadence |

Use [`backend/.env.example`](backend/.env.example) as the canonical variable
list and [`docs/environments.md`](docs/environments.md) for environment-specific
requirements. Do not put production secrets in repository files.

The access and refresh secrets are both required, must contain at least 32
characters, and must be different. The refresh secret keys the HMAC stored for
opaque refresh tokens; changing it invalidates all existing refresh sessions.
Staging and production do not load `.env` files. Inject secrets with the deploy
platform's secret manager as described in
[`docs/security-operations.md`](docs/security-operations.md).

Staging and production also require certificate-verified PostgreSQL TLS:

```env
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
DB_SSL_CA=<trusted_ca_pem_only_when_the_provider_requires_it>
```

`DB_SSL_CA` accepts either a multiline PEM value or a secret-manager value with
encoded `\n` newlines. Never disable certificate verification to work around a
CA or hostname problem.

Refresh tokens are opaque values stored only in an `HttpOnly` cookie. Configure
the cookie and reverse-proxy behavior for each environment:

```env
APP_ENV=development
REFRESH_COOKIE_NAME=rent_refresh_token
REFRESH_COOKIE_DOMAIN=
REFRESH_COOKIE_SAME_SITE=
TRUST_PROXY_HOPS=0
SESSION_CLEANUP_INTERVAL_HOURS=6
SESSION_RETENTION_DAYS=30
```

When `APP_ENV` is `staging` or `production`, the refresh cookie automatically
uses `Secure`. If the frontend and API are deployed on different sites, leave
`REFRESH_COOKIE_SAME_SITE` blank to use the production default `None`; local
development defaults to `Lax`.

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact HTTP(S) origins.
Development and test default to `http://localhost:5173` when it is blank.
Staging and production require an explicit value and do not accept `*` because
credentialed requests are enabled. Configure it independently in each deployed
environment, for example:

```env
# staging
CORS_ALLOWED_ORIGINS=https://staging.rent-apartment.example

# production
CORS_ALLOWED_ORIGINS=https://rent-apartment.example,https://www.rent-apartment.example
```

The API applies a global limiter and stricter limits to login, token refresh,
password reset, upload signatures, and payment-proof submissions. Login
failures are additionally tracked in PostgreSQL by HMAC-hashed IP and account
identifier. Repeated failures cause temporary, progressively longer lockouts
and write an `AUTH_LOGIN_BRUTE_FORCE_SUSPECTED` audit event.

```env
RATE_LIMIT_GLOBAL_WINDOW_MINUTES=15
RATE_LIMIT_GLOBAL_MAX=300
RATE_LIMIT_LOGIN_WINDOW_MINUTES=15
RATE_LIMIT_LOGIN_MAX=10
RATE_LIMIT_REFRESH_WINDOW_MINUTES=5
RATE_LIMIT_REFRESH_MAX=30
RATE_LIMIT_PASSWORD_RESET_WINDOW_MINUTES=15
RATE_LIMIT_PASSWORD_RESET_MAX=10
RATE_LIMIT_UPLOAD_SIGNATURE_WINDOW_MINUTES=1
RATE_LIMIT_UPLOAD_SIGNATURE_MAX=30
RATE_LIMIT_PAYMENT_PROOF_WINDOW_MINUTES=15
RATE_LIMIT_PAYMENT_PROOF_MAX=10
LOGIN_FAILURE_WINDOW_MINUTES=15
LOGIN_FAILURE_MAX_PER_IDENTIFIER=5
LOGIN_FAILURE_MAX_PER_IP=20
LOGIN_LOCK_BASE_SECONDS=30
LOGIN_LOCK_MAX_MINUTES=15
```

For direct local development, use `TRUST_PROXY_HOPS=0`. Staging and production
must set the exact number of trusted reverse-proxy hops, commonly `1` for a
single Render/Vercel ingress. Do not set a larger value than the real topology:
Express uses this setting to derive `req.ip`, which is part of rate-limit and
brute-force keys.

Security headers are applied with Helmet. The CSP allows the application,
Ant Design inline styles, direct uploads to Cloudinary, Cloudinary assets, and
VietQR images while blocking framing and browser plugins. HSTS is enabled only
when `APP_ENV=production`; development and test remain HTTP-compatible. HSTS
does not include subdomains or preload by default, avoiding accidental policy
for hosts that may not be HTTPS-ready.

The API accepts JSON metadata only and rejects direct multipart uploads. Files
are uploaded directly to a signed Cloudinary endpoint, with format, resource
type, context folder, and per-context size limits validated by the API:

```env
JSON_BODY_LIMIT_KB=256
UPLOAD_MAX_TENANT_DOCUMENT_MB=10
UPLOAD_MAX_UTILITY_EVIDENCE_MB=5
UPLOAD_MAX_PAYMENT_PROOF_MB=5
UPLOAD_MAX_CONTRACT_DOCUMENT_MB=15
DOCUMENT_ACCESS_SECRET=<separate_long_random_secret>
DOCUMENT_DELIVERY_BASE_URL=http://localhost:4000
DOCUMENT_ACCESS_TTL_SECONDS=300
DOCUMENT_JOB_INTERVAL_MINUTES=15
DOCUMENT_JOB_MAX_ATTEMPTS=8
DOCUMENT_RECONCILIATION_INTERVAL_HOURS=24
TENANT_DOCUMENT_RETENTION_DAYS=3650
PAYMENT_PROOF_RETENTION_DAYS=1825
UTILITY_EVIDENCE_RETENTION_DAYS=730
CONTRACT_DOCUMENT_RETENTION_DAYS=3650
```

Tenant documents, payment proofs, utility evidence, and contract documents are
uploaded with Cloudinary `authenticated` delivery. API responses replace
Cloudinary URLs with short-lived application-signed URLs; the delivery endpoint
rechecks ownership before proxying file bytes. Apply
`migrations/20260730_private_document_assets.sql` before deployment. Its
durable asset jobs migrate legacy public assets, retry post-commit deletion,
enforce retention, and record Cloudinary/database orphan findings.
Reverse-proxy and analytics logging should redact the
`/api/documents/delivery/*` path because it contains a short-lived bearer link.

If the architecture later changes so the API receives file bytes directly,
add server-side magic-byte inspection before persisting any upload. A browser
MIME type or filename extension must never be treated as proof of file content.

Account passwords use a consistent 12 to 128 character policy across the API
and frontend. Long passphrases are supported by hashing the complete UTF-8
password with SHA-256 before bcrypt; existing bcrypt and PostgreSQL `crypt`
hashes are upgraded after a successful login. A local common-password denylist
is used so password values are never sent to an external breach-checking
service. Authentication request bodies and password values must not be written
to application logs.

SMTP is optional in local development. If these values are blank, account activation and password reset emails are skipped and the API keeps running. Managers can resend the invitation after SMTP is configured:

```env
SMTP_ENABLED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=
SMTP_FROM_EMAIL=
EMAIL_NOTIFICATIONS_ENABLED=true
```

Set `SMTP_ENABLED=true` only with `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, and
`SMTP_FROM_EMAIL`; partial configuration fails startup. Shared staging and
production should enable SMTP when account invitation and password reset email
are supported. Activation links are single-use and expire after
`ACCOUNT_ACTIVATION_EXPIRES_HOURS` (48 hours by default). The complete
environment matrix and container workflow are documented in
[`docs/environments.md`](docs/environments.md).

## Performance Testing

Repeatable k6 smoke and ramping read-load profiles are documented in
[`docs/performance-testing.md`](docs/performance-testing.md). The dedicated
GitHub Actions workflow runs against an isolated, seeded PostgreSQL database
and uploads machine-readable summaries.

## API Documentation

OpenAPI JSON and Swagger UI cover auth, tenants, contracts, utility rates/readings,
invoices, and payments. Documentation is enabled by default in development and
staging:

- Swagger UI: `http://localhost:4000/api-docs/`
- OpenAPI JSON: `http://localhost:4000/api-docs/openapi.json`

Production documentation is disabled by default. If operational access is
required, protect it with dedicated credentials:

```env
OPENAPI_DOCS_ENABLED=true
OPENAPI_DOCS_USERNAME=<documentation_user>
OPENAPI_DOCS_PASSWORD=<random_password_at_least_16_characters>
```

Do not reuse application or database credentials. The API major-version policy,
compatibility rules and external-client migration gate are documented in
[`docs/api-versioning.md`](docs/api-versioning.md).

## Frontend Environment

Create `front-end/.env`:

```bash
cd front-end
cp .env.example .env
```

The local API URL should point to the backend port:

```env
VITE_API_BASE_URL=http://localhost:4000/api
```

## Install Dependencies

Install backend dependencies:

```bash
cd backend
npm install
```

Install frontend dependencies:

```bash
cd front-end
npm install
```

## Run Locally

Start the backend API:

```bash
cd backend
npm run dev
```

The backend listens on `http://localhost:4000` and exposes the API under `/api`.

Start the frontend app in another terminal:

```bash
cd front-end
npm run dev
```

The frontend runs at `http://localhost:5173`.

## Optional Local Seed Data

After configuring `backend/.env`, load the idempotent local demo data through the
seed runner:

```bash
cd backend
npm run db:seed
```

This applies pending migrations first and then creates these local-only accounts:

```text
Manager: manager@example.com / Local Manager 2026!
Tenant: tenant@example.com / Local Tenant 2026!
```

Seed data is blocked in staging and production. Use it only with a disposable
local database.

## Useful Commands

Backend:

```bash
cd backend
npm run db:migrate
npm run db:seed
npm run check
npm test
npm run build
npm start
```

Frontend:

```bash
cd front-end
npm run lint
npm test
npm run build
npm run bundle:check
npm run preview
```

## Production Build And Deployment

Build both applications from clean dependency installs:

```bash
cd backend
npm ci
npm run check
npm test
npm run build

cd ../front-end
npm ci
npm run lint
npm test
npm run build
npm run bundle:check
```

The frontend artifact is `front-end/dist`. The API runs with
`node backend/dist/server.js`. For containers, build from the repository root
so migrations are included:

```bash
docker build -f backend/Dockerfile -t rent-apartment-api:<version> .
docker run --rm -p 4000:4000 --env-file <secure-backend-env> rent-apartment-api:<version>
```

Before shifting traffic, run `npm run db:migrate` as a one-off release job using
the same release image. Never run local seed data in staging or production.
Detailed deployment, migration, rollback, backup, and recovery procedures live
in [`docs/environments.md`](docs/environments.md),
[`docs/database-migrations.md`](docs/database-migrations.md), and
[`docs/disaster-recovery.md`](docs/disaster-recovery.md).

After deployment, verify:

```bash
curl --fail https://<api-host>/health
curl --fail https://<api-host>/ready
```

`/health` is the liveness probe. `/ready` checks database readiness and should
only receive traffic when it returns HTTP 200.

## Environment Reference

The root `.env.example` contains the combined backend and frontend variables. Backend runtime variables belong in `backend/.env`; Vite variables belong in `front-end/.env`.
