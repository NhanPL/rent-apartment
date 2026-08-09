# API Pagination Query Plans

BE-004 adds bounded database pagination to invoices, payment requests, utility readings, and report detail tables. Apply `migrations/20260809_api_pagination_indexes.sql` before evaluating plans.

## Contract

Every paginated endpoint accepts:

- `page`: positive integer, default `1`.
- `pageSize`: positive integer, default `20`, maximum `100`.
- `sortBy`: endpoint-specific allowlisted field.
- `sortOrder`: `asc` or `desc`, default `desc`.

Every response has this shape:

```json
{
  "total": 125,
  "page": 2,
  "pageSize": 20,
  "items": []
}
```

## Endpoints

| Endpoint | Default sort | Main filters |
| --- | --- | --- |
| `GET /api/invoices` | `month desc` | search, month, invoice/payment status, building, room, tenant |
| `GET /api/payments/requests` | `createdAt desc` | search, month, request/proof status, building, room, tenant |
| `GET /api/utility-readings` | `month desc` | search, month, status, building, room |
| `GET /api/reports/details` | section-specific | month range, building, invoice status, section |

Report detail sections are `revenue`, `debt`, and `occupancy`. The summary endpoint returns only aggregate values and the bounded month series; CSV remains the explicit full-export path.

## Plan Verification

Run plans against staging or a production-like snapshot after running `ANALYZE`. Tiny development tables may correctly use sequential scans because reading the table is cheaper than using an index.

```sql
ANALYZE invoice;
ANALYZE payment_request;
ANALYZE payment_proof;
ANALYZE payment;
ANALYZE utility_reading;
ANALYZE contract_tenant;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, month, created_at
FROM invoice
WHERE status = 'ISSUED'
ORDER BY month DESC, created_at DESC, id
LIMIT 20 OFFSET 0;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, status, created_at
FROM payment_request
WHERE status = 'WAITING_TRANSFER'
ORDER BY created_at DESC, id
LIMIT 20 OFFSET 0;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT id, month, created_at
FROM utility_reading
WHERE status = 'SUBMITTED'
ORDER BY month DESC, created_at DESC, id
LIMIT 20 OFFSET 0;
```

Expected index candidates are `idx_invoice_status_month_created_page`, `idx_payment_request_status_created_page`, and `idx_utility_reading_status_month_created_page`. Verify that:

1. Large filtered tables use an index or bitmap index scan where selective.
2. Sort nodes do not process the complete table for the default sort paths.
3. Estimated and actual row counts are reasonably close after `ANALYZE`.
4. Buffer reads and execution time remain stable when moving from page 1 to representative later pages.
5. Count queries are measured separately because exact totals must scan all matching rows.

Offset pagination is intentionally used for predictable Ant Design table navigation. If production tables grow enough that deep-page offsets become expensive, add cursor pagination as a separate API version rather than changing this response contract silently.
