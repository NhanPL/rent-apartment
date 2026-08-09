# Database Constraint And Index Audit

This document records the DB-002 decisions implemented by
`20260809b_constraint_index_audit.sql`. `migrations/` remains the schema source
of truth; this file explains the business intent and index replacement choices.

## Business Constraints

| Rule | Database enforcement |
| --- | --- |
| One active contract per room | Partial unique index `uq_room_active_contract` on `contract(room_id)` where status is `ACTIVE`. |
| One primary tenant per contract | Partial unique index `uq_contract_primary_tenant` on `contract_tenant(contract_id)` where `is_primary=true`. |
| One utility reading per room/month | Unique constraint `uq_reading_room_month`; `month` must be the first day of the month. |
| One valid invoice per contract/month | Partial unique index `uq_invoice_contract_month_active` where status is not `VOID`; historical void invoices remain available. |
| Positive payment amounts | Check constraints cover `payment_request.amount`, optional `payment_proof.transfer_amount`, `payment.amount`, and `payment_transaction.amount`. |
| Non-decreasing meter readings | `ck_reading_elec` and `ck_reading_water` allow a decrease only when that meter's reset flag is true. A reset requires `meter_reset_note`. All readings remain nonnegative. |
| Valid contract dates | `ck_contract_dates` orders end after start, move-in after start, and move-out after move-in/start. Pre-start cancellations do not record a move-out date. |
| Valid invoice due date | `ck_invoice_due_date` requires due date on/after the UTC issue date. Draft invoices may have a provisional due date before issue; legacy invalid due dates are moved to their issue date during migration. |

For a reset month, usage is defined as the new meter's current reading because
the replacement meter starts from zero. The reset reason is retained on the
utility reading and is reviewed with the existing evidence workflow.

## Added Or Retained Indexes

| Access path | Index |
| --- | --- |
| Manager building to room/status join | `idx_room_building_status` |
| Room to contract/status join | `idx_contract_room_status` |
| Tenant manager ownership/status | `idx_tenant_manager_status` |
| Invoice month/status pages | `idx_invoice_status_month_created_page` |
| Utility month/status pages | `idx_utility_reading_status_month_created_page` |
| Payment request by invoice/history | `idx_payment_request_invoice_created_page` and `uq_payment_request_invoice_active` |
| Payment proof by request/history | `idx_payment_proof_request_created_page` and `uq_payment_proof_pending` |

## Removed Redundant Indexes

The migration removes only structurally redundant indexes. It does not guess at
production usage from a development database.

| Removed index | Replacement |
| --- | --- |
| `idx_tenant_user_id` | Unique index backing `tenant.user_id`. |
| `idx_tenant_manager` | Left prefix of `idx_tenant_manager_status`. |
| `idx_room_building` | Left prefix of `idx_room_building_status`. |
| `idx_contract_room` | Left prefix of `idx_contract_room_status`. |
| `idx_contract_tenant_primary` | Contract-tenant primary key plus partial primary indexes. |
| `idx_utility_reading_room_month` | Unique index backing `uq_reading_room_month`. |
| `idx_utility_reading_status` | Left prefix of `idx_utility_reading_status_month_created_page`. |
| `idx_invoice_status` | Left prefix of `idx_invoice_status_month_created_page`. |
| `idx_payment_request_status` | Left prefix of `idx_payment_request_status_created_page`. |
| `idx_payment_proof_request` | Left prefix of `idx_payment_proof_request_created_page`. |
| `idx_payment_invoice` | Left prefix of `idx_payment_invoice_status_created_page`. |
| `idx_payment_proof_id` | Unique index backing `payment.payment_proof_id`. |

After deployment, use `pg_stat_user_indexes` and `EXPLAIN (ANALYZE, BUFFERS)` on
representative production-sized data before removing any additional index.
