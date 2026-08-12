import type { OpenApiSchema } from './helpers';

const nullableString = { type: ['string', 'null'] };
const date = { type: ['string', 'null'], format: 'date' };
const timestamp = { type: ['string', 'null'], format: 'date-time' };
const uuid = { type: 'string', format: 'uuid' };
const nullableUuid = { type: ['string', 'null'], format: 'uuid' };
const money = { type: 'number', minimum: 0 };

export const openApiSchemas: Record<string, OpenApiSchema> = {
  Error: {
    type: 'object',
    required: ['code', 'message', 'fieldErrors', 'requestId'],
    properties: {
      code: { type: 'string', example: 'VALIDATION_ERROR' },
      message: { type: 'string', example: 'Invalid request payload' },
      fieldErrors: {
        anyOf: [
          { type: 'object', additionalProperties: { type: 'array', items: { type: 'string' } } },
          { type: 'null' }
        ]
      },
      requestId: { type: 'string', example: '8cbfd8dc-ff10-48c2-9e88-c776c30c0cfe' }
    }
  },
  Success: {
    type: 'object', required: ['success'], properties: { success: { type: 'boolean', example: true } }
  },
  Message: {
    type: 'object', required: ['message'], properties: { message: { type: 'string' } }
  },
  User: {
    type: 'object',
    required: ['id', 'username', 'role'],
    properties: {
      id: uuid,
      username: { type: 'string' },
      email: nullableString,
      role: { type: 'string', enum: ['MANAGER', 'TENANT'] },
      account_status: { type: 'string', enum: ['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DELETED'] }
    },
    additionalProperties: true
  },
  LoginRequest: {
    type: 'object', required: ['identifier', 'password'],
    properties: {
      identifier: { type: 'string', minLength: 1 },
      password: { type: 'string', format: 'password', minLength: 1, maxLength: 128 },
      twoFactorCode: { type: 'string', pattern: '^\\d{6}$' }
    }
  },
  LoginResponse: {
    type: 'object', required: ['accessToken', 'user'],
    properties: { accessToken: { type: 'string', description: 'Short-lived JWT access token.' }, user: { $ref: '#/components/schemas/User' } }
  },
  AccessTokenResponse: {
    type: 'object', required: ['accessToken'], properties: { accessToken: { type: 'string' } }
  },
  AuthSession: {
    type: 'object',
    required: ['id', 'createdAt', 'lastUsedAt', 'expiresAt', 'current'],
    properties: {
      id: uuid,
      userAgent: nullableString,
      createdAt: { type: 'string', format: 'date-time' },
      lastUsedAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' },
      current: { type: 'boolean' }
    }
  },
  AuthSessionList: {
    type: 'object', required: ['items'], properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/AuthSession' } }
    }
  },
  AuthSessionRevokeResponse: {
    type: 'object', required: ['revokedCurrent'], properties: { revokedCurrent: { type: 'boolean' } }
  },
  TwoFactorStatus: {
    type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } }
  },
  TwoFactorSetup: {
    type: 'object', required: ['secret', 'otpauthUri'], properties: {
      secret: { type: 'string', minLength: 16 },
      otpauthUri: { type: 'string', pattern: '^otpauth://totp/' }
    }
  },
  TwoFactorCodeRequest: {
    type: 'object', required: ['code'], properties: { code: { type: 'string', pattern: '^\\d{6}$' } }
  },
  TwoFactorDisableRequest: {
    type: 'object', required: ['currentPassword', 'code'], properties: {
      currentPassword: { type: 'string', format: 'password', minLength: 1, maxLength: 128 },
      code: { type: 'string', pattern: '^\\d{6}$' }
    }
  },
  PasswordPair: {
    type: 'object', required: ['newPassword', 'confirmPassword'],
    properties: {
      newPassword: { type: 'string', format: 'password', minLength: 12, maxLength: 128 },
      confirmPassword: { type: 'string', format: 'password', minLength: 12, maxLength: 128 }
    }
  },
  ChangePasswordRequest: {
    allOf: [
      { $ref: '#/components/schemas/PasswordPair' },
      { type: 'object', required: ['currentPassword'], properties: { currentPassword: { type: 'string', format: 'password', minLength: 1, maxLength: 128 } } }
    ]
  },
  ActivationRequest: {
    allOf: [
      { $ref: '#/components/schemas/PasswordPair' },
      { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 32, maxLength: 256 } } }
    ]
  },
  ActivationStatus: {
    type: 'object', properties: { valid: { type: 'boolean' }, email: nullableString, expiresAt: timestamp }, additionalProperties: true
  },
  PasswordResetRequest: {
    type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email', maxLength: 320 } }
  },
  PasswordResetConfirmRequest: {
    allOf: [
      { $ref: '#/components/schemas/PasswordPair' },
      { type: 'object', required: ['token'], properties: { token: { type: 'string', minLength: 1, maxLength: 256 } } }
    ]
  },
  StoredDocumentInput: {
    type: 'object',
    required: ['file_url', 'mime_type', 'file_size'],
    properties: {
      file_name: nullableString,
      file_url: { type: 'string', format: 'uri' },
      mime_type: { type: 'string' },
      file_size: { type: 'integer', minimum: 1 },
      resource_type: { type: 'string', enum: ['image', 'raw'] },
      public_id: { type: 'string' },
      asset_id: { type: 'string' },
      version: { type: 'integer', minimum: 1 },
      format: { type: 'string', maxLength: 20 },
      delivery_type: { type: 'string', enum: ['authenticated', 'private', 'upload'] }
    }
  },
  Document: {
    type: 'object',
    properties: {
      id: uuid, file_name: nullableString, mime_type: nullableString, file_size: { type: ['integer', 'null'] },
      file_url: { type: ['string', 'null'], format: 'uri', description: 'Short-lived authorized delivery URL.' },
      expires_at: timestamp
    },
    additionalProperties: true
  },
  TenantInput: {
    type: 'object',
    required: ['full_name', 'identity_number', 'email', 'phone'],
    properties: {
      full_name: { type: 'string', minLength: 1 }, dob: date, gender: nullableString,
      identity_number: { type: 'string', minLength: 1 }, identity_issued_date: date,
      identity_issued_place: nullableString, email: { type: 'string', format: 'email' },
      phone: { type: 'string', minLength: 1 }, permanent_address: nullableString,
      status: { type: 'string', enum: ['ACTIVE', 'MOVED_OUT', 'BLACKLIST'] }, note: nullableString
    }
  },
  TenantUpdateFields: {
    type: 'object',
    properties: {
      full_name: { type: 'string', minLength: 1 }, dob: date, gender: nullableString,
      identity_number: { type: 'string', minLength: 1 }, identity_issued_date: date,
      identity_issued_place: nullableString, email: { type: ['string', 'null'], format: 'email' },
      phone: { type: 'string', minLength: 1 }, permanent_address: nullableString,
      status: { type: 'string', enum: ['ACTIVE', 'MOVED_OUT', 'BLACKLIST'] }, note: nullableString
    }
  },
  TenantContractInput: {
    type: 'object', required: ['room_id', 'start_date'], properties: {
      building_id: nullableUuid, room_id: uuid, status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'] },
      start_date: { type: 'string', format: 'date' }, end_date: date, move_in_date: date, move_out_date: date,
      rent_price: { type: ['number', 'null'], minimum: 0 }, deposit_amount: { type: ['number', 'null'], minimum: 0 },
      billing_day: { type: ['integer', 'null'], minimum: 1, maximum: 28 }, note: nullableString
    }
  },
  TenantCreateRequest: {
    oneOf: [
      { allOf: [
        { $ref: '#/components/schemas/TenantInput' },
        { type: 'object', required: ['privacy_consent'], properties: {
          contract: { anyOf: [{ $ref: '#/components/schemas/TenantContractInput' }, { type: 'null' }] },
          privacy_consent: { type: 'boolean', enum: [true] }, privacy_policy_version: { type: 'string', maxLength: 40 }
        } }
      ] },
      { type: 'object', required: ['tenant', 'privacy_consent'], properties: {
        tenant: { $ref: '#/components/schemas/TenantInput' },
        contract: { anyOf: [{ $ref: '#/components/schemas/TenantContractInput' }, { type: 'null' }] },
        privacy_consent: { type: 'boolean', enum: [true] }, privacy_policy_version: { type: 'string', maxLength: 40 }
      } }
    ]
  },
  TenantUpdateRequest: {
    oneOf: [
      { allOf: [{ $ref: '#/components/schemas/TenantUpdateFields' }, { type: 'object', properties: { contract: { anyOf: [{ $ref: '#/components/schemas/TenantContractInput' }, { type: 'null' }] } } }] },
      { type: 'object', required: ['tenant'], properties: { tenant: { $ref: '#/components/schemas/TenantUpdateFields' }, contract: { anyOf: [{ $ref: '#/components/schemas/TenantContractInput' }, { type: 'null' }] } } }
    ]
  },
  TenantAccountStatusRequest: {
    type: 'object', required: ['status'], additionalProperties: false,
    properties: { status: { type: 'string', enum: ['ACTIVE', 'DISABLED'] } }
  },
  Tenant: {
    allOf: [{ $ref: '#/components/schemas/TenantInput' }, { type: 'object', properties: {
      id: uuid, user_id: nullableUuid, account_status: { type: ['string', 'null'] }, current_room: { type: ['object', 'null'], additionalProperties: true },
      identity_documents: { type: 'object', properties: { front: { anyOf: [{ $ref: '#/components/schemas/Document' }, { type: 'null' }] }, back: { anyOf: [{ $ref: '#/components/schemas/Document' }, { type: 'null' }] } } }
    } }], additionalProperties: true
  },
  TenantPage: {
    type: 'object', required: ['items', 'total', 'page', 'pageSize'], properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/Tenant' } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }
    }
  },
  IdentityDocumentsUpdate: {
    type: 'object', minProperties: 1, properties: {
      front: { anyOf: [{ $ref: '#/components/schemas/StoredDocumentInput' }, { type: 'null' }] },
      back: { anyOf: [{ $ref: '#/components/schemas/StoredDocumentInput' }, { type: 'null' }] }
    }
  },
  ContractTenantInput: {
    type: 'object', required: ['tenant_id'], properties: {
      tenant_id: uuid, is_primary: { type: 'boolean' }, joined_at: date, left_at: date
    }
  },
  ContractInput: {
    type: 'object', required: ['room_id', 'start_date'], properties: {
      room_id: uuid, contract_code: nullableString,
      status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'] },
      start_date: { type: 'string', format: 'date' }, end_date: date, move_in_date: date, move_out_date: date,
      rent_price: { type: ['number', 'null'], minimum: 0 }, deposit_amount: { type: ['number', 'null'], minimum: 0 }, billing_day: { type: ['integer', 'null'], minimum: 1, maximum: 28 },
      note: nullableString, tenants: { type: 'array', items: { $ref: '#/components/schemas/ContractTenantInput' } }
    }
  },
  ContractUpdateRequest: {
    type: 'object', properties: {
      room_id: uuid, contract_code: nullableString, start_date: { type: 'string', format: 'date' }, end_date: date,
      move_in_date: date, move_out_date: date, rent_price: { type: ['number', 'null'], minimum: 0 }, deposit_amount: { type: ['number', 'null'], minimum: 0 },
      billing_day: { type: ['integer', 'null'], minimum: 1, maximum: 28 }, note: nullableString
    }
  },
  ContractTenantUpdateRequest: {
    type: 'object', properties: { is_primary: { type: 'boolean' }, joined_at: date, left_at: date }
  },
  Contract: {
    allOf: [{ $ref: '#/components/schemas/ContractInput' }, { type: 'object', properties: {
      id: uuid, business_stage: { type: 'string', enum: ['RESERVED', 'WAITING_SIGNATURE', 'WAITING_HANDOVER', 'ACTIVE', 'CANCELLED', 'ENDED'] },
      documents: { type: 'array', items: { $ref: '#/components/schemas/Document' } }
    } }], additionalProperties: true
  },
  ContractPage: {
    type: 'object', required: ['items', 'total', 'page', 'pageSize'], properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/Contract' } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }
    }
  },
  ContractCloseRequest: {
    type: 'object', properties: { end_date: date, move_out_date: date, note: nullableString }
  },
  ContractDocumentRequest: {
    allOf: [{ $ref: '#/components/schemas/StoredDocumentInput' }, { type: 'object', required: ['doc_type'], properties: {
      doc_type: { type: 'string', enum: ['SIGNED_SCAN', 'ADDENDUM', 'TERMINATION', 'OTHER'] }, note: nullableString
    } }]
  },
  UtilityRateInput: {
    type: 'object', required: ['building_id', 'effective_from', 'electricity_unit_price', 'water_unit_price'], properties: {
      building_id: uuid, effective_from: { type: 'string', format: 'date' }, electricity_unit_price: money, water_unit_price: money, note: nullableString
    }
  },
  UtilityRateUpdateRequest: {
    type: 'object', properties: {
      building_id: uuid, effective_from: { type: 'string', format: 'date' }, electricity_unit_price: money, water_unit_price: money, note: nullableString
    }
  },
  UtilityRate: { allOf: [{ $ref: '#/components/schemas/UtilityRateInput' }, { type: 'object', properties: { id: uuid } }], additionalProperties: true },
  UtilityReadingInput: {
    type: 'object', required: ['room_id', 'electricity_curr', 'water_curr'], properties: {
      room_id: uuid, month: { type: ['string', 'null'] },
      electricity_curr: { type: 'number', minimum: 0 }, water_curr: { type: 'number', minimum: 0 }, note: nullableString,
      electricity_meter_reset: { type: 'boolean', default: false },
      water_meter_reset: { type: 'boolean', default: false },
      meter_reset_note: nullableString,
      evidence: { type: 'object', required: ['electricity', 'water'], properties: {
        electricity: { $ref: '#/components/schemas/StoredDocumentInput' }, water: { $ref: '#/components/schemas/StoredDocumentInput' }
      } }
    }
  },
  UtilityReading: {
    allOf: [{ $ref: '#/components/schemas/UtilityReadingInput' }, { type: 'object', properties: {
      id: uuid, status: { type: 'string', enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED'] },
      electricity_prev: { type: ['number', 'null'] }, water_prev: { type: ['number', 'null'] },
      electricity_meter_reset: { type: 'boolean' }, water_meter_reset: { type: 'boolean' },
      meter_reset_note: nullableString,
      evidence: { type: 'array', items: { $ref: '#/components/schemas/Document' } }
    } }], additionalProperties: true
  },
  UtilityReadingPage: {
    type: 'object', required: ['items', 'total', 'page', 'pageSize'], properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/UtilityReading' } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }
    }
  },
  UtilityEvidenceRequest: {
    allOf: [{ $ref: '#/components/schemas/StoredDocumentInput' }, { type: 'object', required: ['evidence_type'], properties: {
      evidence_type: { type: 'string', enum: ['ELECTRIC', 'WATER', 'OTHER'] }, note: nullableString
    } }]
  },
  ReasonRequest: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } } },
  OptionalReasonRequest: { type: 'object', properties: { reason: { type: 'string', minLength: 1, maxLength: 500 } } },
  VoidReasonRequest: { type: 'object', required: ['reason'], properties: { reason: { type: 'string', minLength: 3, maxLength: 500 } } },
  InvoiceInput: {
    type: 'object', required: ['contract_id', 'room_id', 'month', 'discount', 'rent_amount', 'other_fees', 'electricity_prev', 'electricity_curr', 'water_prev', 'water_curr', 'electric_unit_price', 'water_unit_price'],
    properties: {
      contract_id: uuid, room_id: uuid, month: { type: 'string' }, status: { type: 'string', enum: ['DRAFT'], default: 'DRAFT' },
      issued_at: timestamp, due_date: date, note: nullableString, discount: money, rent_amount: money, other_fees: money,
      electricity_prev: money, electricity_curr: money, water_prev: money, water_curr: money,
      electric_unit_price: money, water_unit_price: money
    }
  },
  Invoice: {
    allOf: [{ $ref: '#/components/schemas/InvoiceInput' }, { type: 'object', properties: {
      id: uuid, status: { type: 'string', enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] },
      subtotal: money, total: money, paid_amount: money, building_name: { type: 'string' }, room_code: { type: 'string' }, tenant_name: nullableString
    } }], additionalProperties: true
  },
  InvoicePage: {
    type: 'object', required: ['items', 'total', 'page', 'pageSize'], properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }
    }
  },
  InvoiceSummary: {
    type: 'object', properties: { totalInvoices: { type: 'integer' }, paidInvoices: { type: 'integer' }, unpaidInvoices: { type: 'integer' }, totalRevenue: money }
  },
  InvoiceGenerateRequest: { type: 'object', required: ['month'], properties: { month: { type: 'string' }, room_id: uuid, building_id: uuid } },
  InvoiceGenerationResult: { type: 'object', properties: { month: { type: 'string' }, generated: { type: 'array', items: { $ref: '#/components/schemas/Invoice' } }, skipped: { type: 'array', items: { type: 'object', additionalProperties: true } }, total: { type: 'integer' } } },
  InvoiceIssueRequest: { type: 'object', properties: { bank_code: { type: 'string' }, bank_account_no: { type: 'string' }, bank_account_name: { type: 'string' }, transfer_note: { type: 'string', maxLength: 25 } } },
  InvoiceBulkIssueRequest: { type: 'object', required: ['invoice_ids'], properties: { invoice_ids: { type: 'array', minItems: 1, maxItems: 50, uniqueItems: true, items: uuid }, bank_code: { type: 'string' }, bank_account_no: { type: 'string' }, bank_account_name: { type: 'string' } } },
  InvoiceAdjustmentRequest: { type: 'object', required: ['amount', 'reason'], properties: { amount: { type: 'number', not: { const: 0 } }, reason: { type: 'string', minLength: 1 } } },
  PaymentRequestInput: {
    type: 'object', required: ['invoice_id'], properties: {
      invoice_id: uuid, amount: { type: ['number', 'null'], exclusiveMinimum: 0 }, currency: { type: 'string' },
      bank_code: nullableString, bank_account_no: nullableString, bank_account_name: nullableString, transfer_note: nullableString, expires_at: timestamp
    }
  },
  PaymentRequest: {
    allOf: [{ $ref: '#/components/schemas/PaymentRequestInput' }, { type: 'object', properties: {
      id: uuid, status: { type: 'string', enum: ['DRAFT', 'WAITING_TRANSFER', 'TRANSFER_SUBMITTED', 'VERIFIED', 'REJECTED', 'CANCELLED', 'EXPIRED'] },
      qr_image_url: nullableString, paid_amount: money, remaining_amount: money,
      proofs: { type: 'array', items: { $ref: '#/components/schemas/PaymentProof' } }, payments: { type: 'array', items: { $ref: '#/components/schemas/Payment' } }
    } }], additionalProperties: true
  },
  PaymentRequestPage: {
    type: 'object', required: ['items', 'total', 'page', 'pageSize'], properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/PaymentRequest' } }, total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }
    }
  },
  PaymentProofInput: {
    allOf: [{ $ref: '#/components/schemas/StoredDocumentInput' }, { type: 'object', properties: {
      transfer_amount: { type: ['number', 'null'], exclusiveMinimum: 0 }, transfer_time: timestamp, payer_note: nullableString
    } }]
  },
  PaymentProof: { allOf: [{ $ref: '#/components/schemas/PaymentProofInput' }, { type: 'object', properties: { id: uuid, status: { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED'] } } }], additionalProperties: true },
  Payment: { type: 'object', properties: { id: uuid, invoice_id: uuid, amount: money, entry_type: { type: 'string', enum: ['PAYMENT', 'REVERSAL'] }, status: { type: 'string' }, paid_at: timestamp }, additionalProperties: true },
  PaymentProofReviewResult: { type: 'object', properties: { proof: { $ref: '#/components/schemas/PaymentProof' }, payment: { $ref: '#/components/schemas/Payment' }, paid_amount: money, remaining_amount: money, invoice_status: { type: 'string' } } },
  PaymentBulkReviewRequest: { type: 'object', required: ['proof_ids', 'action'], properties: { proof_ids: { type: 'array', minItems: 1, maxItems: 50, uniqueItems: true, items: uuid }, action: { type: 'string', enum: ['APPROVE', 'REJECT'] }, reason: { type: 'string', maxLength: 500 } } },
  BulkActionResult: { type: 'object', required: ['action', 'succeeded', 'failed', 'total'], properties: { action: { type: 'string' }, succeeded: { type: 'array', items: uuid }, failed: { type: 'array', items: { type: 'object', required: ['id', 'code', 'message'], properties: { id: uuid, code: { type: 'string' }, message: { type: 'string' } } } }, total: { type: 'integer' } } },
  ImportRequest: { type: 'object', required: ['entity', 'rows'], properties: { entity: { type: 'string', enum: ['BUILDING', 'ROOM', 'TENANT'] }, rows: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'object', additionalProperties: true } } } },
  ImportPreview: { type: 'object', required: ['entity', 'valid', 'total', 'rows', 'errors'], properties: { entity: { type: 'string' }, valid: { type: 'boolean' }, total: { type: 'integer' }, rows: { type: 'array', items: { type: 'object', additionalProperties: true } }, errors: { type: 'array', items: { type: 'object', additionalProperties: true } } } },
  ImportResult: { type: 'object', required: ['entity', 'imported', 'ids', 'failed'], properties: { entity: { type: 'string' }, imported: { type: 'integer' }, ids: { type: 'array', items: uuid }, failed: { type: 'array', items: { type: 'object', additionalProperties: true } } } },
  InvoiceBranding: {
    type: 'object',
    required: ['display_name', 'business_address', 'tax_code', 'logo_url', 'accent_color', 'invoice_title', 'default_note'],
    properties: {
      display_name: { type: 'string', minLength: 1, maxLength: 120 },
      business_address: { type: ['string', 'null'], maxLength: 500 },
      tax_code: { type: ['string', 'null'], maxLength: 50 },
      logo_url: { type: ['string', 'null'], format: 'uri', pattern: '^https://' },
      accent_color: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
      invoice_title: { type: 'string', minLength: 1, maxLength: 100 },
      default_note: { type: ['string', 'null'], maxLength: 1000 }
    }
  },
  FeatureFlags: {
    type: 'object', required: ['CSV_IMPORTS', 'BULK_BILLING_ACTIONS', 'LIVE_DASHBOARD', 'INVOICE_BRANDING'],
    properties: {
      CSV_IMPORTS: { type: 'boolean' }, BULK_BILLING_ACTIONS: { type: 'boolean' },
      LIVE_DASHBOARD: { type: 'boolean' }, INVOICE_BRANDING: { type: 'boolean' }
    }
  },
  FeatureFlagUpdate: {
    type: 'object', required: ['key', 'enabled'], properties: {
      key: { type: 'string', enum: ['CSV_IMPORTS', 'BULK_BILLING_ACTIONS', 'LIVE_DASHBOARD', 'INVOICE_BRANDING'] },
      enabled: { type: 'boolean' }
    }
  }
};
