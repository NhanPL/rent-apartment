# Financial Reporting

## Scope

Reports are scoped to buildings owned by the authenticated manager. The month
range is an inclusive range of invoice months. Building, room, tenant, and
invoice-status filters further restrict the invoice set. Historical tenant
assignment is resolved against the invoice month rather than the tenant's
current room.

All monetary values are Vietnamese dong (`VND`). Dates used for overdue logic
and timestamps shown in reconciliation exports use `UTC`.

## Formulas

- **Billed revenue** is the sum of invoice totals whose status is `ISSUED`,
  `PARTIALLY_PAID`, or `PAID`. Draft and void invoices are excluded.
- **Gross payments** is the sum of successful `PAYMENT` ledger entries linked
  to the scoped invoices.
- **Reversals** is the sum of successful `REVERSAL` ledger entries.
- **Collected cash** or **net payments** is gross payments minus reversals. It
  is allocated to the related invoice month in the revenue report. The
  reconciliation report retains the actual `paid_at` timestamp for cash timing.
- **Outstanding** is the invoice total minus net successful payments, with a
  minimum of zero. Only issued or partially paid invoices contribute to debt.
- **Overdue** means an issued invoice has a positive outstanding amount and a
  due date earlier than the current UTC date.
- **Void** invoice count and amount are displayed separately. Void invoices do
  not contribute to billed revenue or outstanding debt, while their immutable
  payment and reversal history remains visible in reconciliation.

## Reconciliation

The reconciliation view exposes each successful immutable ledger entry. A
payment has a positive net amount; a reversal has a negative net amount and
references its original payment. Filters and CSV exports use the same manager
ownership rules as the on-screen report.

CSV is UTF-8 with BOM, sanitizes every cell against spreadsheet formula
injection, and labels monetary columns as VND. XLSX export is intentionally
deferred until a concrete business requirement needs formatting or workbook
features that CSV cannot provide.
