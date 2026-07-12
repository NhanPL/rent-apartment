import { ApiError } from './apiClient'

const errorMessages: Record<string, string> = {
  VALIDATION_ERROR: 'Some fields are invalid. Please review them and try again.',
  UNAUTHORIZED: 'Your session has expired. Please sign in again.',
  FORBIDDEN: 'You do not have permission to perform this action.',
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
  APPROVED_READING_REQUIRED: 'An approved utility reading is required before creating an invoice.',
  UTILITY_READING_NOT_FOUND: 'Utility reading not found.',
  UTILITY_READING_NOT_SUBMITTED: 'The utility reading is not awaiting review.',
  UTILITY_READING_NOT_APPROVED: 'The utility reading has not been approved.',
  UTILITY_READING_LOCKED: 'The utility reading is locked and cannot be changed.',
  UTILITY_RATE_REQUIRED: 'Utility rates have not been configured for this period.',
  UTILITY_RATE_ALREADY_EXISTS: 'A utility rate already exists for this date range.',
  PAYMENT_FAILED: 'Payment failed. Please review the details and try again.',
  PAYMENT_CANCELLED: 'The payment request has been cancelled.',
  INVALID_AMOUNT: 'The amount is invalid.',
  INVALID_SIGNATURE: 'The verification signature is invalid.',
  VNPAY_NOT_CONFIGURED: 'The VNPAY payment gateway has not been configured.',
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

export function getUserErrorMessage(error: unknown, fallback = 'Unable to complete this action. Please try again.'): string {
  if (error instanceof ApiError) {
    return errorMessages[error.code] ?? (error.status ? statusMessages[error.status] : undefined) ?? error.message ?? fallback
  }

  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) {
    return 'Unable to connect to the system. Check your network connection or the backend service.'
  }

  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}
