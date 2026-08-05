# DATA-004 Transaction Review

This review covers application flows that perform two or more related database writes.

| Flow | Transaction boundary | Concurrency guard | Idempotency / uniqueness |
| --- | --- | --- | --- |
| Tenant account creation and activation invitation | `withTransaction` | Tenant/account unique keys | Identity, email, username and active token constraints |
| Account activation and password reset/change | `withTransaction` | Token/user row locks | One active token and session revocation |
| Contract creation and tenant assignment | `withTransaction` | Room, contract and tenant row locks | Contract code, active room, primary tenant and assignment constraints |
| Rental reservation, handover, end and cancellation | `withTransaction` | Room and contract row locks | Active room and monthly reading constraints |
| Utility submission with evidence | `withTransaction` | Contract then reading row lock | One reading per room/month |
| Utility approval, rejection and correction | `withTransaction` | Reading row lock | State transition checks |
| Monthly/manual invoice generation and line items | `withTransaction` | Contract then reading row lock | One non-void invoice per contract/month |
| Invoice issue and payment request creation | `withTransaction` | Invoice row lock | One active request per invoice; repeated issue returns current result |
| Invoice adjustment, replacement, void and draft deletion | `withTransaction` | Invoice row lock | One replacement per void invoice |
| Payment proof submission | `withTransaction` | Payment request and invoice row locks | Idempotency key and one pending proof per request |
| Payment proof approval and invoice status update | `withTransaction` | Proof, request and invoice row locks | One ledger payment per proof and payment idempotency key |
| Payment reversal | `withTransaction` | Payment and invoice row locks | One reversal per original payment |
| Tenant identity document replacement/deletion | `withTransaction` | Document row locks | Durable Cloudinary cleanup outbox |
| Fixed charge and utility rate replacement | `withTransaction` | Current configuration row locks | Effective-date unique constraints |
| Cloudinary cleanup jobs | `withTransaction` | `FOR UPDATE SKIP LOCKED` | Durable job status and bounded retries |

Read-only flows and isolated single-row writes do not need a transaction. Authentication telemetry such as
`last_login_at` and cleared failed-login counters is intentionally best-effort: failure does not invalidate a
successfully created session or alter financial/business data.
