# Rent Apartment Management System

Fullstack apartment rental management app built with React, TypeScript, Ant Design, Node.js, Express, and PostgreSQL.

## Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL 14 or newer
- PowerShell, Bash, or another terminal

## Project Structure

- `backend`: Express API, PostgreSQL access, auth, business rules
- `front-end`: Vite React app
- `database.sql`: current schema bootstrap script
- `.env.example`: combined environment reference

## Database Setup

Create a local database, then apply the schema from the repository root:

```bash
createdb rent_apartment
psql -d rent_apartment -f database.sql
```

If your database already exists, run only the schema step. For hosted PostgreSQL or Supabase, use the provider connection string in `DATABASE_URL` and run the same SQL through `psql` or the provider SQL editor.

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
JWT_ACCESS_SECRET=change-me
JWT_ACCESS_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_DAYS=7
```

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
```

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
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=
SMTP_FROM_EMAIL=
```

For production or a shared staging environment, configure all SMTP variables so account invitation emails can be sent. Activation links are single-use and expire after `ACCOUNT_ACTIVATION_EXPIRES_HOURS` (48 hours by default).

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

## Demo Account And Seed Data

The repository currently does not include an automated seed script or committed demo account. After applying `database.sql`, create a manager account manually.

Generate a bcrypt password hash:

```bash
cd backend
node -e "const bcrypt=require('bcrypt'); bcrypt.hash('Admin@123', 10).then(console.log)"
```

Use the generated hash in SQL:

```sql
INSERT INTO app_user(role, email, username, password_hash, is_active)
VALUES ('MANAGER', 'admin@example.com', 'admin@example.com', '<bcrypt_hash>', true)
RETURNING id;

INSERT INTO manager_profile(user_id, full_name)
VALUES ('<returned_user_id>', 'Demo Manager');
```

Then log in with:

```text
Identifier: admin@example.com
Password: Admin@123
```

## Useful Commands

Backend:

```bash
cd backend
npm run check
npm run build
npm start
```

Frontend:

```bash
cd front-end
npm run lint
npm run build
npm run preview
```

## Environment Reference

The root `.env.example` contains the combined backend and frontend variables. Backend runtime variables belong in `backend/.env`; Vite variables belong in `front-end/.env`.
