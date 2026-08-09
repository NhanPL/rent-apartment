export type DatabaseNumeric = string | number;
export type DatabaseDate = string | Date;
export type DatabaseTimestamp = string | Date;

export const USER_ROLES = ['MANAGER', 'TENANT'] as const;
export type UserRole = typeof USER_ROLES[number];

export const ACCOUNT_STATUSES = ['PENDING_ACTIVATION', 'ACTIVE', 'DISABLED'] as const;
export type AccountStatus = typeof ACCOUNT_STATUSES[number];

export const ROOM_STATUSES = ['ACTIVE', 'MAINTENANCE', 'INACTIVE'] as const;
export type RoomStatus = typeof ROOM_STATUSES[number];

export const TENANT_STATUSES = ['ACTIVE', 'MOVED_OUT', 'BLACKLIST', 'DELETED'] as const;
export type TenantStatus = typeof TENANT_STATUSES[number];
export const TENANT_WRITABLE_STATUSES = ['ACTIVE', 'MOVED_OUT', 'BLACKLIST'] as const;
export type TenantWritableStatus = typeof TENANT_WRITABLE_STATUSES[number];

export const CONTRACT_STATUSES = ['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'] as const;
export type ContractStatus = typeof CONTRACT_STATUSES[number];

export const UTILITY_READING_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED'] as const;
export type UtilityReadingStatus = typeof UTILITY_READING_STATUSES[number];

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;
export type InvoiceStatus = typeof INVOICE_STATUSES[number];

export const PAYMENT_STATUSES = ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];
export const PAYMENT_ENTRY_TYPES = ['PAYMENT', 'REVERSAL'] as const;
export type PaymentEntryType = typeof PAYMENT_ENTRY_TYPES[number];

export const PAYMENT_REQUEST_STATUSES = [
  'DRAFT', 'WAITING_TRANSFER', 'TRANSFER_SUBMITTED', 'VERIFIED', 'REJECTED', 'CANCELLED', 'EXPIRED'
] as const;
export type PaymentRequestStatus = typeof PAYMENT_REQUEST_STATUSES[number];

export const PAYMENT_PROOF_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type PaymentProofStatus = typeof PAYMENT_PROOF_STATUSES[number];

export const CHARGE_TYPES = ['FLAT', 'PER_PERSON', 'PER_VEHICLE'] as const;
export type ChargeType = typeof CHARGE_TYPES[number];

export const toDatabaseNumber = (value: DatabaseNumeric | null | undefined): number => {
  const mapped = Number(value ?? 0);
  if (!Number.isFinite(mapped)) throw new TypeError(`Invalid PostgreSQL numeric value: ${String(value)}`);
  return mapped;
};

export const toDateString = (value: DatabaseDate | null | undefined): string | null => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

export const toIsoTimestamp = (value: DatabaseTimestamp | null | undefined): string | null => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
};

export const assertNever = (value: never, message = 'Unsupported status'): never => {
  throw new Error(`${message}: ${String(value)}`);
};
