# Observability

## Error Monitoring

Set `SENTRY_DSN`, `APP_VERSION`, and `APP_ENV` in the deployment secret manager.
When no DSN is configured, error reporting is disabled without affecting API
requests. Production releases should use an immutable Git SHA or release tag for
`APP_VERSION` so regressions can be tied to a deploy.

The integration sets `sendDefaultPii=false` and strips request URLs, headers,
bodies, cookies, email addresses, IP addresses, passwords, tokens, identity
numbers, Cloudinary URLs, and signed document URLs before sending an event.
Only the internal user ID, role, request ID, HTTP method, and bounded feature
name are attached for correlation. Sentry access must be limited to production
operators and follow the same retention policy as application logs.

## Runtime Metrics

Managers can inspect `GET /api/operations/metrics`. The endpoint returns:

- HTTP request/error totals, error percentage, average/maximum latency, and
  cumulative latency buckets.
- Failed login, upload, invoice, and payment request counts.
- PostgreSQL pool capacity, total/idle connections, waiting clients, and
  utilization.

Metrics use bounded feature labels and never store a raw URL, query string,
request body, account identifier, or document ID. Values are process-local and
reset on restart; the deployment platform should scrape or poll them if durable
history is required.

## Alert Thresholds

Configure thresholds per environment:

| Variable | Default | Trigger |
| --- | ---: | --- |
| `METRICS_ALERT_MIN_REQUESTS` | `20` | Minimum sample before error-rate alerting |
| `METRICS_ALERT_ERROR_RATE_PERCENT` | `10` | Overall HTTP error percentage |
| `METRICS_ALERT_LATENCY_MS` | `2000` | Individual slow response |
| `METRICS_ALERT_DB_POOL_PERCENT` | `90` | Pool utilization or any waiting client |
| `METRICS_ALERT_LOGIN_FAILURES` | `10` | Failed login count |
| `METRICS_ALERT_COOLDOWN_MINUTES` | `5` | Minimum repeat interval per alert type |

Threshold crossings emit a structured warning with a stable `alert` code. Route
those warnings to the platform log alerting system. Start with staging traffic,
then tune production thresholds from observed baselines. Every alert should
include the release and environment fields supplied by the structured logger.
