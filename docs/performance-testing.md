# Performance And Load Testing

The repository uses k6 for repeatable API smoke and read-load checks. Tests run
against an isolated PostgreSQL database seeded with deterministic E2E data. Do
not point these profiles at production without an approved capacity-test plan.

## Profiles

- `load-tests/api-smoke.js`: one virtual user for 30 seconds; checks health,
  dashboard, invoices, and payments.
- `load-tests/manager-read-load.js`: ramps to 20 virtual users by default and
  exercises the manager's common read path for three minutes.

Both profiles fail when the request error rate reaches 1%, check success falls
to 99%, or p95 latency for key endpoints reaches 750 ms. Treat these thresholds
as the initial service-level baseline and tighten them after collecting staging
traffic measurements.

## Local Run

Start a migrated and seeded backend, install k6, then run:

```powershell
$env:BASE_URL='http://127.0.0.1:4000'
$env:MANAGER_USERNAME='e2e-manager'
$env:MANAGER_PASSWORD='E2E secure passphrase 2026'
k6 run load-tests/api-smoke.js
k6 run -e PEAK_VUS=20 load-tests/manager-read-load.js
```

Credentials are environment inputs so shared environments never place them in
scripts. The default credentials exist only in the guarded `APP_ENV=test` E2E
seed.

## CI And Investigation

`.github/workflows/performance.yml` runs weekly and on manual dispatch. It
creates an ephemeral database, starts the backend, executes both profiles, and
uploads JSON summaries plus server logs for 14 days. A threshold failure blocks
that workflow. Compare p90/p95 duration, request rate, and failure rate with the
last successful run before changing a threshold or approving a performance
regression.
