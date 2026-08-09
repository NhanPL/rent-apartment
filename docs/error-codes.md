# API Error Contract and Codes

All API errors use the same JSON shape:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Invalid request payload",
  "fieldErrors": {
    "email": ["Invalid email"]
  },
  "requestId": "01J..."
}
```

- `code` is a stable machine-readable identifier. Frontend behavior must branch on this value, not on `message`.
- `message` is safe to display to a user. It must not contain SQL, stack traces, tokens, secrets, or internal paths.
- `fieldErrors` is either `null` or a map from request field paths to one or more messages.
- `requestId` matches the `X-Request-ID` response header and should be included in support reports.

## HTTP Semantics

| Status | Meaning |
| --- | --- |
| `400` | Invalid input or a business rule rejected the submitted values. |
| `401` | Authentication is missing, invalid, or expired. |
| `403` | The authenticated user is not allowed to perform the operation. |
| `404` | The requested route or owned resource does not exist. |
| `409` | The request conflicts with current data or state and may require user action or a refresh. |
| `410` | A time-limited resource existed but has expired. |
| `413` | The request payload exceeds the configured limit. |
| `415` | The submitted content type is not supported. |
| `429` | The caller exceeded a rate limit. |
| `500` | An unexpected server error occurred. Internal details are never returned. |

## Common Codes

| Code | Meaning |
| --- | --- |
| `VALIDATION_ERROR` | Body, query, or route params failed Zod validation. Inspect `fieldErrors`. |
| `BAD_REQUEST` | Generic invalid request when a more specific code is unavailable. |
| `UNAUTHORIZED` | Authentication is required or invalid. |
| `FORBIDDEN` | The current account lacks permission. |
| `NOT_FOUND` | Generic resource-not-found response. |
| `CONFLICT` | Generic state conflict response. |
| `ROUTE_NOT_FOUND` | The requested API route does not exist. |
| `INVALID_JSON` | The JSON request body cannot be parsed. |
| `PAYLOAD_TOO_LARGE` | The JSON request body exceeds the global limit. |
| `DIRECT_FILE_UPLOAD_NOT_SUPPORTED` | Multipart upload was sent to an API that accepts signed-upload metadata only. |
| `REQUEST_FAILED` | Generic non-server failure for an unmapped status. |
| `INTERNAL_ERROR` | Unexpected server failure; use `requestId` for investigation. |

## Database Boundary Codes

| Code | Meaning |
| --- | --- |
| `DUPLICATE_RECORD` | An unmapped unique constraint was violated. |
| `RELATED_RECORD_CONFLICT` | An unmapped foreign-key constraint prevents the operation. Known missing relations use a domain `*_NOT_FOUND` code with HTTP 404. |
| `BUSINESS_RULE_VIOLATION` | A PostgreSQL check constraint was violated. |
| `REQUIRED_FIELD_MISSING` | A required database value was missing. |
| `INVALID_FIELD_VALUE` | PostgreSQL rejected a value representation. |
| `CONCURRENT_MODIFICATION` | Serialization failure or deadlock; the operation can be retried after refreshing state. |

Known constraints are mapped to domain codes such as `TENANT_IDENTITY_EXISTS`, `TENANT_EMAIL_EXISTS`, `TENANT_PHONE_EXISTS`, `CONTRACT_CODE_EXISTS`, `ROOM_ALREADY_OCCUPIED`, `CONTRACT_PRIMARY_TENANT_CONFLICT`, `CONTRACT_TENANT_EXISTS`, `UTILITY_READING_ALREADY_EXISTS`, `INVOICE_ALREADY_EXISTS`, `INVOICE_REPLACEMENT_EXISTS`, `PAYMENT_REQUEST_ALREADY_EXISTS`, `PAYMENT_PROOF_PENDING`, `PAYMENT_PROOF_ALREADY_SUBMITTED`, `PAYMENT_PROOF_ALREADY_APPROVED`, `PAYMENT_ALREADY_PROCESSED`, and `PAYMENT_ALREADY_REVERSED`.

## Authentication and Security Codes

| Code | Meaning |
| --- | --- |
| `INVALID_CREDENTIALS` | Login identifier or password is invalid; the response does not reveal account existence. |
| `INVALID_REFRESH_TOKEN` | Refresh token is absent, invalid, expired, revoked, or reused. |
| `LOGIN_TEMPORARILY_LOCKED` | Login is temporarily delayed after repeated failures. |
| `ACTIVATION_TOKEN_INVALID` | Activation token is invalid, expired, or already used. |
| `ACCOUNT_ALREADY_ACTIVE` | The account has already completed activation. |
| `ACCOUNT_ACTIVATION_NOT_PENDING` | The account is not eligible for activation. |
| `PASSWORD_RESET_TOKEN_INVALID` | Reset token is invalid, expired, or already used. |
| `CURRENT_PASSWORD_INCORRECT` | The supplied current password is incorrect. |
| `PASSWORD_CONFIRMATION_MISMATCH` | Password confirmation differs from the new password. |
| `PASSWORD_REUSE_NOT_ALLOWED` | The new password matches the current password. |
| `PASSWORD_LENGTH_INVALID` | Password length is outside the configured range. |
| `PASSWORD_TOO_COMMON` | Password appears in the blocked common-password set. |
| `SESSION_CREATE_FAILED` | A new authenticated session could not be created. |
| `TOKEN_REUSE_DETECTED` | Refresh-token reuse was detected and the token family was revoked. |
| `CORS_ORIGIN_DENIED` | Browser origin is not in the configured allowlist. |

Rate limit codes are `GLOBAL_RATE_LIMIT_EXCEEDED`, `LOGIN_RATE_LIMIT_EXCEEDED`, `REFRESH_RATE_LIMIT_EXCEEDED`, `PASSWORD_RESET_RATE_LIMIT_EXCEEDED`, `UPLOAD_SIGNATURE_RATE_LIMIT_EXCEEDED`, and `PAYMENT_PROOF_RATE_LIMIT_EXCEEDED`.

## Resource and Tenant Codes

- Not found: `USER_NOT_FOUND`, `TENANT_NOT_FOUND`, `BUILDING_NOT_FOUND`, `ROOM_NOT_FOUND`, `CONTRACT_NOT_FOUND`, `CONTRACT_DOCUMENT_NOT_FOUND`, `UTILITY_READING_NOT_FOUND`, `UTILITY_RATE_NOT_FOUND`, `INVOICE_NOT_FOUND`, `PAYMENT_NOT_FOUND`, `CHARGE_NOT_FOUND`, `BUILDING_CHARGE_NOT_FOUND`, `ROOM_CHARGE_NOT_FOUND`, `CONTRACT_CHARGE_NOT_FOUND`, `ROOM_MONTH_EXTRA_NOT_FOUND`, `DOCUMENT_NOT_FOUND`.
- Tenant conflicts: `TENANT_ALREADY_EXISTS`, `TENANT_DUPLICATE`, `TENANT_NOT_AVAILABLE`, `TENANT_HAS_ACTIVE_CONTRACT`, `TENANT_HAS_UNPAID_INVOICE`, `TENANT_BLACKLISTED`, `TENANT_EMAIL_REQUIRED`, `TENANT_UPDATE_FAILED`, `PRIVACY_CONSENT_REQUIRED`, `EXPORT_DATA_MISSING`.
- Building and room conflicts: `BUILDING_HAS_CONTRACTS`, `ROOM_HAS_CONTRACTS`, `ROOM_NOT_AVAILABLE`, `ROOM_BUILDING_MISMATCH`, `ROOM_MAX_OCCUPANTS_EXCEEDED`.

## Contract and Billing Codes

- Contract: `CONTRACT_CODE_ERROR`, `CONTRACT_DATES_INVALID`, `CONTRACT_ACTIVE`, `CONTRACT_CANCELLED`, `CONTRACT_ENDED`, `CONTRACT_CLOSED`, `CONTRACT_NOT_DRAFT`, `CONTRACT_NOT_ACTIVE`, `CONTRACT_PRIMARY_TENANT_REQUIRED`, `CONTRACT_PRIMARY_TENANT_CONFLICT`, `CONTRACT_TENANT_REQUIRED`, `CONTRACT_TENANT_EXISTS`, `CONTRACT_TENANT_NOT_FOUND`, `CONTRACT_TENANT_INACTIVE`, `TENANT_HAS_ACTIVE_CONTRACT`.
- Utility readings: `INVALID_UTILITY_READING`, `UTILITY_METER_READING_DECREASED`, `METER_RESET_NOTE_REQUIRED`, `UTILITY_READING_ALREADY_EXISTS`, `UTILITY_READING_LOCKED`, `UTILITY_READING_NOT_SUBMITTED`, `UTILITY_READING_NOT_APPROVED`, `APPROVED_READING_REQUIRED`, `UTILITY_RATE_REQUIRED`, `UTILITY_RATE_ALREADY_EXISTS`.
- Fixed charges: `INVALID_EFFECTIVE_DATE_RANGE`, `CHARGE_CODE_EXISTS`, `BUILDING_CHARGE_EXISTS`, `ROOM_CHARGE_EXISTS`, `CONTRACT_CHARGE_EXISTS`, `ROOM_MONTH_EXTRA_EXISTS`.
- Invoices: `INVOICE_ALREADY_EXISTS`, `INVOICE_DUE_DATE_INVALID`, `INVOICE_NOT_DRAFT`, `INVOICE_NOT_VOID`, `INVOICE_PAID`, `INVOICE_ALREADY_VOID`, `INVOICE_VOID_REASON_REQUIRED`, `INVOICE_DRAFT_REQUIRES_DELETE`, `INVOICE_DELETE_REQUIRES_VOID`, `INVOICE_HAS_PAYMENT_HISTORY`, `INVOICE_REPLACEMENT_EXISTS`, `INVOICE_REPLACEMENT_FAILED`.
- Payments: `BANK_ACCOUNT_REQUIRED`, `INVOICE_NOT_ISSUED`, `INVOICE_NOT_PAYABLE`, `PAYMENT_AMOUNT_INVALID`, `PAYMENT_REQUEST_ALREADY_EXISTS`, `PAYMENT_PROOF_PENDING`, `PAYMENT_PROOF_ALREADY_SUBMITTED`, `PAYMENT_PROOF_ALREADY_APPROVED`, `PAYMENT_LEDGER_INCONSISTENT`, `PAYMENT_EXCEEDS_INVOICE_BALANCE`, `PAYMENT_NOT_REVERSIBLE`, `PAYMENT_ALREADY_PROCESSED`, `PAYMENT_ALREADY_REVERSED`, `IDEMPOTENCY_KEY_REUSED`.

## Upload and Document Codes

- Upload validation: `UPLOAD_CONTEXT_FORBIDDEN`, `UPLOAD_FOLDER_INVALID`, `UPLOAD_MIME_INVALID`, `UPLOAD_RESOURCE_TYPE_INVALID`, `UPLOAD_SIZE_INVALID`, `UPLOAD_URL_INVALID`, `UPLOAD_DELIVERY_TYPE_INVALID`, `UPLOAD_PUBLIC_ID_INVALID`, `UPLOAD_VERSION_INVALID`.
- Cloudinary: `CLOUDINARY_NOT_CONFIGURED`, `CLOUDINARY_ASSET_METADATA_MISSING`, `CLOUDINARY_LIST_FAILED`, `CLOUDINARY_RESOURCE_LOOKUP_FAILED`, `CLOUDINARY_MIGRATION_FAILED`, `CLOUDINARY_DELETE_FAILED`.
- Protected delivery: `DOCUMENT_ACCESS_INVALID`, `DOCUMENT_ACCESS_EXPIRED`, `DOCUMENT_ACCESS_FORBIDDEN`, `DOCUMENT_DELIVERY_NOT_CONFIGURED`, `DOCUMENT_DELIVERY_FAILED`, `DOCUMENT_DELIVERY_TOO_LARGE`.
- VietQR: `VIETQR_BANK_CODE_INVALID`, `VIETQR_ACCOUNT_NO_INVALID`, `VIETQR_ACCOUNT_NAME_INVALID`, `VIETQR_AMOUNT_INVALID`, `VIETQR_TRANSFER_NOTE_INVALID`.

## Client Handling Rules

1. Use HTTP status for the broad response path and `code` for the exact UI behavior.
2. Bind `fieldErrors` to matching form fields; show `message` as the form-level fallback.
3. On `401`, attempt the normal refresh flow only where appropriate. Do not retry `INVALID_REFRESH_TOKEN` indefinitely.
4. On `409` and `CONCURRENT_MODIFICATION`, refresh server state before offering a retry.
5. For `429`, preserve the user's input and respect `Retry-After`.
6. For `INTERNAL_ERROR`, show the safe message and make `requestId` available to support staff.
