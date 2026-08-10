import { ApiError } from './apiClient'
import { translate } from '../i18n'
import type { FormInstance } from 'antd'
import type { NamePath } from 'antd/es/form/interface'

const errorMessages: Record<string, string> = {
  VALIDATION_ERROR: 'Some fields are invalid. Please review them and try again.',
  INVALID_CREDENTIALS: 'The username or password is incorrect. Please try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
  CURRENT_PASSWORD_INCORRECT: 'The current password is incorrect.',
  PASSWORD_LENGTH_INVALID: 'Password must contain between 12 and 128 characters.',
  PASSWORD_TOO_COMMON: 'This password is too common. Choose a less common password or a longer passphrase.',
  PASSWORD_CONFIRMATION_MISMATCH: 'The password confirmation does not match.',
  PASSWORD_REUSE_NOT_ALLOWED: 'The new password must be different from the current password.',
  BUILDING_NOT_FOUND: 'Building not found or you do not have access to it.',
  BUILDING_HAS_CONTRACTS: 'A building with contracts cannot be deleted.',
  ROOM_NOT_FOUND: 'Room not found or you do not have access to it.',
  ROOM_NOT_AVAILABLE: 'The room is not available for rent.',
  ROOM_ALREADY_OCCUPIED: 'The room has a current or future occupant.',
  ROOM_HAS_CONTRACTS: 'A room with contracts cannot be deleted.',
  ROOM_MAX_OCCUPANTS_EXCEEDED: 'The number of occupants exceeds the room capacity.',
  TENANT_NOT_FOUND: 'Tenant not found or you do not have access to them.',
  TENANT_DUPLICATE: 'The phone number or identity document already exists.',
  TENANT_ALREADY_EXISTS: 'This tenant already exists.',
  TENANT_BLACKLISTED: 'This tenant is restricted and cannot be activated.',
  TENANT_HAS_ACTIVE_CONTRACT: 'The tenant already has another active contract.',
  TENANT_NOT_AVAILABLE: 'The tenant has a current or future rental registration.',
  TENANT_HAS_UNPAID_INVOICE: 'The tenant has an unpaid invoice.',
  TENANT_EMAIL_REQUIRED: 'Email is required while the tenant has a login account.',
  TENANT_EMAIL_EXISTS: 'This email address is already used by another account.',
  TENANT_PHONE_EXISTS: 'This phone number is already used by another account.',
  TENANT_IDENTITY_EXISTS: 'This citizen ID number is already used by another tenant.',
  TENANT_UPDATE_FAILED: 'Unable to update tenant information. Please try again.',
  DUPLICATE_RECORD: 'The submitted information is already used by another record.',
  ACTIVATION_TOKEN_INVALID: 'This activation link is invalid, expired, or has already been used.',
  PASSWORD_RESET_TOKEN_INVALID: 'This password reset link is invalid, expired, or has already been used.',
  ACCOUNT_ALREADY_ACTIVE: 'This tenant account is already active.',
  ACCOUNT_ACTIVATION_NOT_PENDING: 'This tenant account cannot be activated.',
  CONTRACT_NOT_FOUND: 'Contract not found or you do not have access to it.',
  CONTRACT_DOCUMENT_NOT_FOUND: 'Contract document not found.',
  CONTRACT_NOT_DRAFT: 'Only draft contracts support this action.',
  CONTRACT_NOT_ACTIVE: 'The contract is not active.',
  CONTRACT_CLOSED: 'The contract is closed and cannot be changed.',
  CONTRACT_ACTIVE: 'End the active contract instead of cancelling it.',
  CONTRACT_TENANT_REQUIRED: 'The contract must have at least one tenant.',
  CONTRACT_PRIMARY_TENANT_REQUIRED: 'The contract must have exactly one primary tenant.',
  CONTRACT_PRIMARY_TENANT_CONFLICT: 'The contract can only have one primary tenant.',
  INVOICE_NOT_FOUND: 'Invoice not found.',
  INVOICE_ALREADY_EXISTS: 'An invoice already exists for this billing period.',
  INVOICE_CLOSED: 'The invoice is closed and cannot be changed.',
  INVOICE_PAID: 'The invoice has already been paid.',
  INVOICE_NOT_ISSUED: 'The invoice has not been issued.',
  INVOICE_NOT_DRAFT: 'Only draft invoices can be changed or issued.',
  INVOICE_DRAFT_REQUIRES_DELETE: 'Draft invoices must be deleted instead of voided.',
  INVOICE_ALREADY_VOID: 'This invoice has already been voided.',
  INVOICE_VOID_REASON_REQUIRED: 'Enter a reason before voiding the invoice.',
  INVOICE_NOT_VOID: 'Only a void invoice can be replaced.',
  INVOICE_REPLACEMENT_EXISTS: 'A replacement invoice already exists for this billing period.',
  INVOICE_REPLACEMENT_FAILED: 'The replacement invoice could not be created. Please try again.',
  INVOICE_DELETE_REQUIRES_VOID: 'Only draft invoices can be deleted. Void this invoice instead.',
  INVOICE_HAS_PAYMENT_HISTORY: 'This draft has payment history and cannot be permanently deleted.',
  INVOICE_NOT_PAYABLE: 'This invoice is not accepting payments.',
  BANK_ACCOUNT_REQUIRED: 'Enter the receiving bank account before issuing the invoice.',
  VIETQR_BANK_CODE_INVALID: 'Enter a valid VietQR bank code or six-digit bank BIN.',
  VIETQR_ACCOUNT_NO_INVALID: 'The bank account number must contain 6 to 19 digits.',
  VIETQR_ACCOUNT_NAME_INVALID: 'Enter the bank account holder name.',
  VIETQR_AMOUNT_INVALID: 'The transfer amount must be a positive whole number.',
  VIETQR_TRANSFER_NOTE_INVALID: 'Enter a valid transfer note for the VietQR payment.',
  APPROVED_READING_REQUIRED: 'An approved utility reading is required before creating an invoice.',
  UTILITY_READING_NOT_FOUND: 'Utility reading not found.',
  UTILITY_READING_NOT_SUBMITTED: 'The utility reading is not awaiting review.',
  UTILITY_READING_NOT_APPROVED: 'The utility reading has not been approved.',
  UTILITY_READING_LOCKED: 'The utility reading is locked and cannot be changed.',
  UTILITY_RATE_REQUIRED: 'Utility rates have not been configured for this period.',
  UTILITY_RATE_ALREADY_EXISTS: 'A utility rate already exists for this date range.',
  PAYMENT_FAILED: 'Payment failed. Please review the details and try again.',
  PAYMENT_CANCELLED: 'The payment request has been cancelled.',
  PAYMENT_NOT_FOUND: 'Payment not found or you do not have access to it.',
  PAYMENT_NOT_REVERSIBLE: 'Only a successful payment that has not been reversed can be reversed.',
  PAYMENT_LEDGER_INCONSISTENT: 'The payment ledger is inconsistent. No changes were made.',
  PAYMENT_EXCEEDS_INVOICE_BALANCE: 'The approved amount exceeds the remaining invoice balance.',
  IDEMPOTENCY_KEY_REUSED: 'This payment submission was already used for another request. Refresh and try again.',
  INVALID_AMOUNT: 'The amount is invalid.',
  INVALID_SIGNATURE: 'The verification signature is invalid.',
  CLOUDINARY_NOT_CONFIGURED: 'Cloudinary file storage has not been configured.',
  CLOUDINARY_DELETE_FAILED: 'The file could not be removed from Cloudinary. No data was deleted.',
  CLOUDINARY_ASSET_METADATA_MISSING: 'The Cloudinary file could not be identified for deletion.',
  UPLOAD_CONTEXT_FORBIDDEN: 'You do not have permission to upload a file here.',
  UPLOAD_MIME_INVALID: 'This file type is not supported.',
  UPLOAD_SIZE_INVALID: 'The file exceeds the allowed size.',
  UPLOAD_URL_INVALID: 'The uploaded file URL is invalid.',
  INTERNAL_ERROR: 'The system encountered an internal error. Please try again later.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
}

const statusMessages: Record<number, string> = {
  400: 'The request is invalid. Please review the submitted data.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  404: 'The requested data could not be found.',
  409: 'This action conflicts with current data. Reload and try again.',
  413: 'The uploaded data exceeds the allowed size.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'The system encountered an internal error. Please try again later.',
  502: 'An external service is unavailable. Please try again later.',
  503: 'The system is temporarily unavailable. Please try again later.',
}

interface FormValidationError {
  errorFields?: Array<{
    errors?: unknown[]
  }>
}

export function isFormValidationError(error: unknown): error is FormValidationError {
  return Boolean(
    error
    && typeof error === 'object'
    && Array.isArray((error as FormValidationError).errorFields),
  )
}

export function getUserErrorMessage(error: unknown, fallback = 'Unable to complete this action. Please try again.'): string {
  if (error instanceof ApiError) {
    return translate(errorMessages[error.code] ?? (error.status ? statusMessages[error.status] : undefined) ?? fallback)
  }

  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return translate('Unable to connect to the system. Check your network connection or the backend service.')
  }

  if (error instanceof Error && error.message.trim() && !looksLikeInternalError(error.message)) {
    return translate(error.message)
  }
  return translate(fallback)
}

const internalErrorPattern = /(?:\b(?:select|insert|update|delete)\b.+\bfrom\b|sqlstate|postgres|stack trace|\bat\s+\w+\s*\(|relation\s+["']?.+["']?\s+does not exist|violates?\s+.+constraint)/i

function looksLikeInternalError(message: string) {
  return internalErrorPattern.test(message)
}

export function applyApiFieldErrors(
  form: Pick<FormInstance, 'setFields'>,
  error: unknown,
  fieldMap: Record<string, NamePath> = {},
): boolean {
  if (!(error instanceof ApiError) || !error.fieldErrors) return false

  const fields = Object.entries(error.fieldErrors)
    .filter(([name, errors]) => name !== 'body' && errors.length > 0)
    .map(([name, errors]) => ({
      name: fieldMap[name] ?? name,
      errors: errors.map((fieldError) => translate(fieldError)),
    }))

  if (fields.length === 0) return false
  form.setFields(fields)
  return true
}

export function getFormErrorMessage(
  error: unknown,
  fallback = 'Please review the highlighted fields and try again.',
): string {
  if (!isFormValidationError(error)) return getUserErrorMessage(error, fallback)

  const firstError = error.errorFields
    ?.flatMap((field) => field.errors ?? [])
    .find((item) => (typeof item === 'string' && item.trim()) || item instanceof Error)

  if (typeof firstError === 'string') return translate(firstError)
  if (firstError instanceof Error && firstError.message.trim()) return translate(firstError.message)
  return translate(fallback)
}
