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
CLIENT_ORIGIN=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

Set strong values for:

```env
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me
```

SMTP is optional in local development. If these values are blank, tenant welcome emails are skipped and the API keeps running:

```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM_NAME=
SMTP_FROM_EMAIL=
```

For production or a shared staging environment, configure all SMTP variables so account invitation emails can be sent.

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
