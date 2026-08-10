import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import { env, type AppEnvironment } from '../../config/env';
import { buildErrorResponse } from '../errors/error-contract';

interface DatabaseError {
  code?: string;
  constraint?: string;
  column?: string;
}

interface RequestParserError extends Error {
  status?: number;
  type?: string;
}

const isDatabaseError = (error: unknown): error is DatabaseError => (
  Boolean(error && typeof error === 'object' && 'code' in error)
);

const isRequestParserError = (error: unknown): error is RequestParserError => (
  error instanceof Error && 'type' in error
);

interface MappedDatabaseError {
  statusCode: number;
  message: string;
  code: string;
  field?: string;
}

const uniqueConstraintErrors: Record<string, Omit<MappedDatabaseError, 'statusCode'>> = {
  uq_tenant_identity: {
    message: 'This citizen ID number is already used by another tenant.',
    code: 'TENANT_IDENTITY_EXISTS',
    field: 'identity_number'
  },
  app_user_email_key: {
    message: 'This email address is already used by another account.',
    code: 'TENANT_EMAIL_EXISTS',
    field: 'email'
  },
  app_user_username_key: {
    message: 'This email address is already used by another account.',
    code: 'TENANT_EMAIL_EXISTS',
    field: 'email'
  },
  app_user_phone_key: {
    message: 'This phone number is already used by another account.',
    code: 'TENANT_PHONE_EXISTS',
    field: 'phone'
  },
  uq_contract_code: {
    message: 'This contract code is already used by another contract.',
    code: 'CONTRACT_CODE_EXISTS',
    field: 'contract_code'
  },
  uq_room_active_contract: {
    message: 'This room already has an active contract.',
    code: 'ROOM_ALREADY_OCCUPIED'
  },
  uq_contract_primary_tenant: {
    message: 'This contract already has a primary tenant.',
    code: 'CONTRACT_PRIMARY_TENANT_CONFLICT'
  },
  contract_tenant_pkey: {
    message: 'This tenant is already assigned to the contract.',
    code: 'CONTRACT_TENANT_EXISTS'
  },
  uq_reading_room_month: {
    message: 'A utility reading already exists for this room and month.',
    code: 'UTILITY_READING_ALREADY_EXISTS',
    field: 'month'
  },
  uq_invoice_contract_month_active: {
    message: 'An invoice already exists for this contract and month.',
    code: 'INVOICE_ALREADY_EXISTS',
    field: 'month'
  },
  uq_invoice_replaces_invoice: {
    message: 'A replacement invoice already exists for this invoice.',
    code: 'INVOICE_REPLACEMENT_EXISTS'
  },
  uq_payment_request_invoice_active: {
    message: 'An active payment request already exists for this invoice.',
    code: 'PAYMENT_REQUEST_ALREADY_EXISTS',
    field: 'invoice_id'
  },
  uq_payment_proof_pending: {
    message: 'A payment proof is already pending review for this request.',
    code: 'PAYMENT_PROOF_PENDING'
  },
  uq_payment_proof_submit_idempotency: {
    message: 'This payment proof request has already been submitted.',
    code: 'PAYMENT_PROOF_ALREADY_SUBMITTED'
  },
  payment_payment_proof_id_key: {
    message: 'This payment proof has already been approved.',
    code: 'PAYMENT_PROOF_ALREADY_APPROVED'
  },
  uq_payment_idempotency_key: {
    message: 'This payment operation has already been processed.',
    code: 'PAYMENT_ALREADY_PROCESSED'
  },
  uq_payment_original_reversal: {
    message: 'This payment has already been reversed.',
    code: 'PAYMENT_ALREADY_REVERSED'
  }
};

const foreignKeyConstraintErrors: Record<string, MappedDatabaseError> = {
  room_building_id_fkey: {
    statusCode: 404,
    message: 'The selected building does not exist or is no longer available.',
    code: 'BUILDING_NOT_FOUND',
    field: 'building_id'
  },
  contract_room_id_fkey: {
    statusCode: 404,
    message: 'The selected room does not exist or is no longer available.',
    code: 'ROOM_NOT_FOUND',
    field: 'room_id'
  },
  contract_tenant_tenant_id_fkey: {
    statusCode: 404,
    message: 'The selected tenant does not exist or is no longer available.',
    code: 'TENANT_NOT_FOUND',
    field: 'tenant_id'
  },
  invoice_contract_id_fkey: {
    statusCode: 404,
    message: 'The selected contract does not exist or is no longer available.',
    code: 'CONTRACT_NOT_FOUND',
    field: 'contract_id'
  },
  payment_request_invoice_id_fkey: {
    statusCode: 404,
    message: 'The selected invoice does not exist or is no longer available.',
    code: 'INVOICE_NOT_FOUND',
    field: 'invoice_id'
  }
};

const checkConstraintErrors: Record<string, Omit<MappedDatabaseError, 'statusCode'>> = {
  ck_contract_dates: {
    message: 'Contract dates must follow their chronological order.',
    code: 'CONTRACT_DATES_INVALID'
  },
  ck_invoice_due_date: {
    message: 'Invoice due date cannot be earlier than its issue date.',
    code: 'INVOICE_DUE_DATE_INVALID',
    field: 'due_date'
  },
  ck_reading_elec: {
    message: 'Electricity reading cannot decrease unless the meter was reset.',
    code: 'UTILITY_METER_READING_DECREASED',
    field: 'electricity_curr'
  },
  ck_reading_water: {
    message: 'Water reading cannot decrease unless the meter was reset.',
    code: 'UTILITY_METER_READING_DECREASED',
    field: 'water_curr'
  },
  ck_reading_nonnegative: {
    message: 'Utility meter readings cannot be negative.',
    code: 'INVALID_UTILITY_READING'
  },
  ck_reading_meter_reset_note: {
    message: 'A meter reset reason is required.',
    code: 'METER_RESET_NOTE_REQUIRED',
    field: 'meter_reset_note'
  },
  ck_payment_request_amount: {
    message: 'Payment request amount must be greater than zero.',
    code: 'PAYMENT_AMOUNT_INVALID',
    field: 'amount'
  },
  ck_payment_proof_amount: {
    message: 'Payment proof amount must be greater than zero.',
    code: 'PAYMENT_AMOUNT_INVALID',
    field: 'transfer_amount'
  },
  ck_payment_amount: {
    message: 'Payment amount must be greater than zero.',
    code: 'PAYMENT_AMOUNT_INVALID',
    field: 'amount'
  },
  ck_txn_amount: {
    message: 'Payment transaction amount must be greater than zero.',
    code: 'PAYMENT_AMOUNT_INVALID',
    field: 'amount'
  }
};

const mappedFieldErrors = (mapped: { field?: string; message: string }) => (
  mapped.field ? { [mapped.field]: [mapped.message] } : null
);

export const createErrorHandler = (appEnvironment: AppEnvironment) => (
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  void appEnvironment;
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json(buildErrorResponse(
      res,
      err.code,
      err.message,
      err.fieldErrors
    ));
    return;
  }

  if (isRequestParserError(err) && err.type === 'entity.too.large') {
    res.status(413).json(buildErrorResponse(res, 'PAYLOAD_TOO_LARGE', 'Request body is too large.'));
    return;
  }

  if (isRequestParserError(err) && err.type === 'entity.parse.failed') {
    res.status(400).json(buildErrorResponse(res, 'INVALID_JSON', 'Request body contains invalid JSON.'));
    return;
  }

  if (isDatabaseError(err) && err.code === '23505') {
    const mapped = uniqueConstraintErrors[err.constraint ?? ''] ?? {
      message: 'The submitted information is already used by another record.',
      code: 'DUPLICATE_RECORD'
    };
    res.status(409).json(buildErrorResponse(
      res,
      mapped.code,
      mapped.message,
      mappedFieldErrors(mapped)
    ));
    return;
  }

  if (isDatabaseError(err) && err.code === '23503') {
    const mapped = foreignKeyConstraintErrors[err.constraint ?? ''] ?? {
      statusCode: 409,
      message: 'A related record does not exist or prevents this operation.',
      code: 'RELATED_RECORD_CONFLICT'
    };
    res.status(mapped.statusCode).json(buildErrorResponse(
      res,
      mapped.code,
      mapped.message,
      mappedFieldErrors(mapped)
    ));
    return;
  }

  if (isDatabaseError(err) && err.code === '23514') {
    const mapped = checkConstraintErrors[err.constraint ?? ''] ?? {
      message: 'The submitted values violate a business rule.',
      code: 'BUSINESS_RULE_VIOLATION'
    };
    res.status(400).json(buildErrorResponse(
      res,
      mapped.code,
      mapped.message,
      mappedFieldErrors(mapped)
    ));
    return;
  }

  if (isDatabaseError(err) && err.code === '23502') {
    res.status(400).json(buildErrorResponse(
      res,
      'REQUIRED_FIELD_MISSING',
      'A required value is missing.',
      err.column ? { [err.column]: ['This field is required'] } : null
    ));
    return;
  }

  if (isDatabaseError(err) && err.code === '22P02') {
    res.status(400).json(buildErrorResponse(
      res,
      'INVALID_FIELD_VALUE',
      'One or more submitted values are invalid.'
    ));
    return;
  }

  if (isDatabaseError(err) && (err.code === '40001' || err.code === '40P01')) {
    res.status(409).json(buildErrorResponse(
      res,
      'CONCURRENT_MODIFICATION',
      'The record was changed by another request. Please retry.'
    ));
    return;
  }

  res.status(500).json(buildErrorResponse(
    res,
    'INTERNAL_ERROR',
    'Internal server error'
  ));
};

export const errorHandler = createErrorHandler(env.APP_ENV);
