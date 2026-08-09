# Data Retention and Privacy Policy

This document defines the application defaults. Deployments must have the policy reviewed for their jurisdiction and contracts before production use.

## Retention schedule

| Data | Default retention | Disposal |
| --- | --- | --- |
| Citizen ID images | While the tenant profile is active; purge when an eligible erasure request is processed | Delete the Cloudinary asset and document row |
| Contract documents | 10 years after the contract ends (or after creation when no end date exists) | Delete the Cloudinary asset; keep non-sensitive metadata and the contract record |
| Payment proofs | 10 years after submission | Delete the Cloudinary asset; keep proof metadata and immutable payment ledger |
| Utility evidence | 2 years after upload | Delete the Cloudinary asset and evidence row |
| Invoices, invoice items, payment requests, payment ledger and audit logs | At least 10 years | Never cascade-delete through tenant deletion; restrict access or anonymize tenant PII |

The durations are configurable with environment variables. Financial records use `FINANCIAL_RECORD_RETENTION_DAYS`; reducing it requires legal and accounting review.

## Tenant erasure and anonymization

1. A manager requests deletion only after active contracts are ended and open invoices are resolved.
2. Login access is revoked immediately and Citizen ID assets are queued for deletion.
3. If no financial/legal history exists, direct identifiers are anonymized immediately.
4. If retained records exist, the request is scheduled for the end of the financial retention period. Financial rows and stable tenant IDs remain unchanged.
5. When eligible, name, contact details, address, birth details and Citizen ID number are replaced or cleared. Audit logs record the request and completion without copying sensitive values.

## Consent and access

New tenant profiles require a recorded consent assertion and policy version. Consent history is append-only. List APIs return a masked Citizen ID; full identity data is limited to manager-owned tenant detail, explicit contract export, and the tenant's own data export. Exports omit signed URLs, Cloudinary identifiers, tokens and secrets.
