# Business Rules

## Contract status semantics

- `DRAFT`: preparation state only. It does not count as current occupancy, current room, invoice eligibility, or utility-reading eligibility.
- `ACTIVE`: the only status that counts as current occupancy and the tenant current room. Utility submissions and invoice generation use active contracts only.
- `ENDED`: historical contract. It is retained for reporting but does not count as current occupancy.
- `CANCELLED`: voided contract. It is retained for audit/history but does not count as current occupancy.

## Tenant status updates

- Managers may set tenant status to `ACTIVE`, `MOVED_OUT`, or `BLACKLIST` through `PATCH /tenants/:id`.
- `DELETED` is reserved for `DELETE /tenants/:id` soft delete and cannot be set through PATCH.
- A tenant cannot be marked `MOVED_OUT` while still attached to an active contract.

## Room occupancy

- A room can have at most one `ACTIVE` contract at a time.
- `max_occupants` is enforced when creating an active contract with tenants.
- `max_occupants` cannot be lowered below the number of tenants currently attached to the room's active contract.

## Invoice lifecycle and financial history

- Invoice status is limited to `DRAFT`, `ISSUED`, `PARTIALLY_PAID`, `PAID`, and `VOID`.
- Overdue is derived from an unpaid invoice's `due_date`; it is not a stored invoice status.
- A `DRAFT` invoice can be permanently deleted only when it has no payment or payment-request history.
- An `ISSUED`, `PARTIALLY_PAID`, or `PAID` invoice cannot be deleted. A manager must void it and provide a reason.
- Voiding records `void_reason`, `voided_by_user_id`, and `voided_at`. It never deletes payments, payment requests, or payment proofs.
- Voiding closes active payment requests and rejects pending proofs with the void reason. Completed payments and reviewed proofs remain unchanged for reconciliation.
- A utility reading referenced by an issued or void invoice remains `INVOICED`; voiding never returns it to `APPROVED`.
- A void invoice can be corrected only through an explicit replacement invoice. The replacement is a new `DRAFT`, references the original through `replaces_invoice_id`, and may reuse the original utility reading.
- A clean draft deletion may return its utility reading to `APPROVED` only when no invoice still references that reading.
- Dashboard billed totals and invoice counts exclude `VOID` invoices. Debt and outstanding totals exclude `VOID`, while successful payments remain in collected totals for historical reconciliation.

## Immutable payment ledger

- A successful `PAYMENT` entry is immutable. It cannot be updated or deleted through the application or directly in the database.
- An incorrect successful payment is corrected by appending one full `REVERSAL` entry linked through `original_payment_id`; the original payment remains unchanged.
- Every ledger amount is stored as a positive value. Net paid is calculated as successful payments minus successful reversals.
- A proof approval cannot make net paid exceed the invoice total. The proof, payment request, and invoice are locked while approval is processed.
- Repeated proof submissions and approvals are idempotent and cannot create duplicate proofs or payment entries.
- Reversing a payment recalculates the invoice balance and reopens its verified payment request when the invoice is still payable. A void invoice remains void.
- Submit, reject, approve, and reverse operations are recorded in the audit log.
- Financial reports expose gross payments, reversals, and net payments separately.
