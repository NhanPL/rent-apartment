# Background Jobs

## Execution Model

The current scale uses an in-process scheduler coordinated by a PostgreSQL
session advisory lock. Every API instance may start the scheduler, but only the
instance holding `rent-apartment:background-jobs:v1` runs a cycle. Each job also
inserts a unique `(job_name, scheduled_for)` run record, so process restarts and
request retries cannot execute the same time bucket twice.

This model avoids another infrastructure dependency while workloads remain
small. Move the same job functions into a dedicated worker/queue before jobs
become CPU-heavy, require sub-minute latency, or can exhaust the API database
pool. Keep the PostgreSQL idempotency records even after that move.

`BACKGROUND_JOB_POLL_SECONDS` controls only how often an instance looks for due
work. Individual job intervals are fixed or use their existing settings:

| Job | Behavior |
| --- | --- |
| `PAYMENT_REQUEST_EXPIRY` | Expires elapsed transfer requests without a pending proof |
| `PAYMENT_REMINDER_ENQUEUE` | Dedupe-enqueues before/after due reminders |
| `EMAIL_OUTBOX_DELIVERY` | Claims with `SKIP LOCKED`, retries exponentially, then fails permanently |
| `AUTH_DATA_CLEANUP` | Removes expired sessions, activation/reset tokens, and reset rate-limit records after retention |
| `DOCUMENT_MAINTENANCE` | Runs tenant anonymization, retention deletion, and Cloudinary asset retries |
| `CLOUDINARY_RECONCILIATION` | Detects orphan assets/records and legacy public delivery |

Invoice overdue state is deliberately calculated from `due_date`, outstanding
ledger balance, and the current UTC date in dashboard/report queries. It is not
written into the invoice status enum, preventing a scheduled job from racing
payment approval or confusing financial lifecycle states.

## Email Delivery

Only payment reminders use the durable email outbox. Activation and password
reset links continue to send synchronously because the database stores only
their token hashes; raw security tokens must not be placed in an outbox. A
failed activation invitation can be resent by the manager, which creates a new
token and revokes the old one.

Reminder rows store a template code and bounded JSON payload, not HTML or a
signed URL. `deduplication_key` prevents duplicate reminders when scheduling is
retried. Delivery increments attempts while claiming a row, retries after an
exponential delay capped at 60 minutes, and becomes `FAILED` after
`EMAIL_OUTBOX_MAX_ATTEMPTS`. A process crash leaves `PROCESSING` rows eligible
for recovery after 15 minutes.

## Operations

Managers can query `GET /api/operations/jobs?limit=50` for recent status,
duration timestamps, result counts, and stable error codes. Raw exception
messages, recipient addresses, tokens, and document URLs are not stored in job
runs or emitted to logs. Alert on any failed critical job, repeated stale runs,
or a growing pending/failed outbox. During shutdown, the scheduler stops
polling before the HTTP listener and database pool are drained.
