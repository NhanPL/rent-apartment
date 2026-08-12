import {
  arrayOf,
  headerParameter,
  jsonResponse,
  monthQuery,
  operation,
  paginationParameters,
  pathParameter,
  queryParameter,
  requestBody,
  schemaRef,
  uuidPath
} from './helpers';

const ok = (schema: string, description = 'Successful response') => ({
  '200': jsonResponse(description, schemaRef(schema))
});
const created = (schema: string, description = 'Resource created') => ({
  '201': jsonResponse(description, schemaRef(schema))
});
const noContent = { '204': { description: 'Operation completed; no response body.' } };
const id = uuidPath();
const tenantId = uuidPath('tenantId');
const documentId = uuidPath('documentId');
const invoiceId = uuidPath('invoiceId');
const paymentId = uuidPath('paymentId');
const sessionId = uuidPath('sessionId');
const uuidQuery = (name: string, description: string) => queryParameter(name, { type: 'string', format: 'uuid' }, description);
const searchQuery = queryParameter('search', { type: 'string', maxLength: 200 }, 'Case-insensitive search text.');

const authPaths = {
  '/auth/login': {
    post: operation('Auth', 'Log in', 'PUBLIC', {
      description: 'Authenticates by username or email. Returns a short-lived access token and sets the refresh token as an HttpOnly cookie.',
      body: requestBody('LoginRequest'),
      responses: ok('LoginResponse'),
      errorCodes: ['INVALID_CREDENTIALS', 'LOGIN_TEMPORARILY_LOCKED', 'LOGIN_RATE_LIMIT_EXCEEDED']
    })
  },
  '/auth/refresh': {
    post: operation('Auth', 'Rotate refresh token', 'PUBLIC', {
      description: 'Rotates the refresh token cookie and returns a new access token. Reuse revokes the token family.',
      security: [{ refreshCookie: [] }],
      responses: ok('AccessTokenResponse'),
      errorCodes: ['INVALID_REFRESH_TOKEN', 'TOKEN_REUSE_DETECTED', 'REFRESH_RATE_LIMIT_EXCEEDED']
    })
  },
  '/auth/logout': {
    post: operation('Auth', 'Log out', 'PUBLIC', {
      security: [{ refreshCookie: [] }], responses: ok('Success'), errorCodes: ['INVALID_REFRESH_TOKEN']
    })
  },
  '/auth/activation': {
    get: operation('Auth', 'Validate activation token', 'PUBLIC', {
      parameters: [queryParameter('token', { type: 'string', minLength: 32, maxLength: 256 }, 'Tenant activation token.', true)],
      responses: ok('ActivationStatus'), errorCodes: ['ACTIVATION_TOKEN_INVALID', 'ACCOUNT_ALREADY_ACTIVE']
    })
  },
  '/auth/activate': {
    post: operation('Auth', 'Activate tenant account', 'PUBLIC', {
      body: requestBody('ActivationRequest'), responses: ok('Success'),
      errorCodes: ['ACTIVATION_TOKEN_INVALID', 'ACCOUNT_ACTIVATION_NOT_PENDING', 'PASSWORD_CONFIRMATION_MISMATCH', 'PASSWORD_LENGTH_INVALID', 'PASSWORD_TOO_COMMON']
    })
  },
  '/auth/password-reset/request': {
    post: operation('Auth', 'Request password reset', 'PUBLIC', {
      description: 'Always returns the same accepted response whether the email exists or not.',
      body: requestBody('PasswordResetRequest'),
      responses: { '202': jsonResponse('Reset request accepted.', schemaRef('Message')) },
      errorCodes: ['PASSWORD_RESET_RATE_LIMIT_EXCEEDED']
    })
  },
  '/auth/password-reset/confirm': {
    post: operation('Auth', 'Confirm password reset', 'PUBLIC', {
      body: requestBody('PasswordResetConfirmRequest'), responses: ok('Success'),
      errorCodes: ['PASSWORD_RESET_TOKEN_INVALID', 'PASSWORD_CONFIRMATION_MISMATCH', 'PASSWORD_LENGTH_INVALID', 'PASSWORD_TOO_COMMON']
    })
  },
  '/auth/me': {
    get: operation('Auth', 'Get current user', 'AUTHENTICATED', {
      responses: ok('User'), errorCodes: ['UNAUTHORIZED', 'USER_NOT_FOUND']
    })
  },
  '/auth/password': {
    put: operation('Auth', 'Change password', 'AUTHENTICATED', {
      description: 'Revokes all sessions after a successful password change.', body: requestBody('ChangePasswordRequest'), responses: ok('Success'),
      errorCodes: ['CURRENT_PASSWORD_INCORRECT', 'PASSWORD_CONFIRMATION_MISMATCH', 'PASSWORD_REUSE_NOT_ALLOWED', 'PASSWORD_LENGTH_INVALID', 'PASSWORD_TOO_COMMON']
    })
  },
  '/auth/sessions/revoke-all': {
    post: operation('Auth', 'Revoke all sessions', 'AUTHENTICATED', {
      responses: ok('Success'), errorCodes: ['UNAUTHORIZED']
    })
  },
  '/auth/sessions': {
    get: operation('Auth', 'List active sessions', 'AUTHENTICATED', {
      description: 'Lists active, unexpired browser/device sessions owned by the authenticated user.',
      responses: ok('AuthSessionList'), errorCodes: ['UNAUTHORIZED']
    })
  },
  '/auth/sessions/{sessionId}': {
    delete: operation('Auth', 'Revoke a session', 'AUTHENTICATED', {
      description: 'Revokes one browser/device session owned by the authenticated user.',
      parameters: [sessionId],
      responses: ok('AuthSessionRevokeResponse'),
      errorCodes: ['UNAUTHORIZED', 'AUTH_SESSION_NOT_FOUND', 'VALIDATION_ERROR']
    })
  }
};

const tenantPaths = {
  '/tenants': {
    get: operation('Tenants', 'List tenants', 'MANAGER', {
      parameters: [
        ...paginationParameters(), searchQuery,
        queryParameter('status', { type: 'string', enum: ['ACTIVE', 'MOVED_OUT', 'BLACKLIST'] }),
        uuidQuery('building_id', 'Filter by current building.'), uuidQuery('room_id', 'Filter by current room.')
      ],
      responses: ok('TenantPage'), errorCodes: ['VALIDATION_ERROR']
    }),
    post: operation('Tenants', 'Create tenant', 'MANAGER', {
      description: 'Creates the tenant and a pending-activation user account. Sends an invitation when SMTP is configured.',
      body: requestBody('TenantCreateRequest'),
      responses: { '201': jsonResponse('Tenant created.', {
        type: 'object', properties: { message: { type: 'string' }, tenantId: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' }, emailSent: { type: 'boolean' } }
      }) },
      errorCodes: ['PRIVACY_CONSENT_REQUIRED', 'TENANT_EMAIL_EXISTS', 'TENANT_PHONE_EXISTS', 'TENANT_IDENTITY_EXISTS']
    })
  },
  '/tenants/{id}': {
    get: operation('Tenants', 'Get tenant', 'MANAGER', { parameters: [id], responses: ok('Tenant'), errorCodes: ['TENANT_NOT_FOUND'] }),
    patch: operation('Tenants', 'Update tenant', 'MANAGER', { parameters: [id], body: requestBody('TenantUpdateRequest'), responses: ok('Tenant'), errorCodes: ['TENANT_NOT_FOUND', 'TENANT_UPDATE_FAILED', 'TENANT_EMAIL_EXISTS', 'TENANT_PHONE_EXISTS', 'TENANT_IDENTITY_EXISTS'] }),
    delete: operation('Tenants', 'Request tenant deletion', 'MANAGER', {
      description: 'Anonymizes immediately when eligible, otherwise schedules erasure according to retention policy.', parameters: [id],
      responses: { '200': jsonResponse('Tenant deletion/anonymization result.', { type: 'object', additionalProperties: true }) },
      errorCodes: ['TENANT_NOT_FOUND', 'TENANT_HAS_ACTIVE_CONTRACT', 'TENANT_HAS_UNPAID_INVOICE']
    })
  },
  '/tenants/{id}/resend-activation': {
    post: operation('Tenants', 'Resend activation invitation', 'MANAGER', { parameters: [id], responses: { '200': jsonResponse('Activation invitation renewed.', { type: 'object', properties: { message: { type: 'string' }, emailSent: { type: 'boolean' }, expiresAt: { type: 'string', format: 'date-time' } } }) }, errorCodes: ['TENANT_NOT_FOUND', 'ACCOUNT_ALREADY_ACTIVE'] })
  },
  '/tenants/{id}/account-status': {
    patch: operation('Tenants', 'Activate or deactivate tenant login', 'MANAGER', {
      description: 'Changes login access without deleting the tenant profile or rental and financial history. Deactivation revokes every session.',
      parameters: [id],
      body: requestBody('TenantAccountStatusRequest'),
      responses: { '200': jsonResponse('Tenant account status updated.', {
        type: 'object', required: ['accountStatus'], properties: { accountStatus: { type: 'string', enum: ['ACTIVE', 'DISABLED'] } }
      }) },
      errorCodes: ['TENANT_NOT_FOUND', 'TENANT_ACCOUNT_NOT_FOUND', 'TENANT_ACCOUNT_PENDING_ACTIVATION', 'TENANT_ACCOUNT_PASSWORD_REQUIRED']
    })
  },
  '/tenants/{id}/identity-documents': {
    put: operation('Tenants', 'Replace identity documents', 'MANAGER', {
      parameters: [id], body: requestBody('IdentityDocumentsUpdate'),
      responses: { '200': jsonResponse('Current identity documents.', { type: 'object', properties: { front: { anyOf: [schemaRef('Document'), { type: 'null' }] }, back: { anyOf: [schemaRef('Document'), { type: 'null' }] } } }) },
      errorCodes: ['TENANT_NOT_FOUND', 'UPLOAD_MIME_INVALID', 'UPLOAD_SIZE_INVALID', 'CLOUDINARY_ASSET_METADATA_MISSING']
    })
  },
  '/tenants/{id}/data-export': {
    get: operation('Tenants', 'Export tenant personal data', 'MANAGER', { parameters: [id], responses: { '200': jsonResponse('Tenant data export.', { type: 'object', additionalProperties: true }) }, errorCodes: ['TENANT_NOT_FOUND', 'EXPORT_DATA_MISSING'] })
  },
  '/tenants/{id}/contracts': {
    get: operation('Tenants', 'List tenant contracts', 'MANAGER', { parameters: [id], responses: { '200': jsonResponse('Tenant contracts.', arrayOf('Contract')) }, errorCodes: ['TENANT_NOT_FOUND'] })
  },
  '/tenants/{id}/invoices': {
    get: operation('Tenants', 'List tenant invoices', 'MANAGER', { parameters: [id], responses: { '200': jsonResponse('Tenant invoices.', arrayOf('Invoice')) }, errorCodes: ['TENANT_NOT_FOUND'] })
  },
  '/tenants/{id}/payments': {
    get: operation('Tenants', 'List tenant payments', 'MANAGER', { parameters: [id], responses: { '200': jsonResponse('Tenant payments.', arrayOf('Payment')) }, errorCodes: ['TENANT_NOT_FOUND'] })
  },
  '/tenants/{id}/export-contract': {
    post: operation('Tenants', 'Export current tenant contract', 'MANAGER', { parameters: [id], responses: { '200': jsonResponse('Contract export payload.', { type: 'object', additionalProperties: true }) }, errorCodes: ['TENANT_NOT_FOUND', 'CONTRACT_NOT_FOUND', 'EXPORT_DATA_MISSING'] })
  }
};

const contractPaths = {
  '/contracts': {
    get: operation('Contracts', 'List contracts', 'MANAGER', {
      parameters: [
        ...paginationParameters(), searchQuery,
        uuidQuery('building_id', 'Filter by building.'), uuidQuery('room_id', 'Filter by room.'), uuidQuery('tenant_id', 'Filter by tenant.'),
        queryParameter('status', { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED'] }),
        queryParameter('business_stage', { type: 'string', enum: ['RESERVED', 'WAITING_SIGNATURE', 'WAITING_HANDOVER', 'ACTIVE', 'CANCELLED', 'ENDED'] })
      ], responses: ok('ContractPage'), errorCodes: ['VALIDATION_ERROR']
    }),
    post: operation('Contracts', 'Create contract', 'MANAGER', { body: requestBody('ContractInput'), responses: created('Contract'), errorCodes: ['ROOM_NOT_AVAILABLE', 'CONTRACT_CODE_EXISTS', 'CONTRACT_PRIMARY_TENANT_CONFLICT'] })
  },
  '/contracts/{id}': {
    get: operation('Contracts', 'Get contract', 'MANAGER', { parameters: [id], responses: ok('Contract'), errorCodes: ['CONTRACT_NOT_FOUND'] }),
    patch: operation('Contracts', 'Update contract', 'MANAGER', { parameters: [id], body: requestBody('ContractUpdateRequest'), responses: ok('Contract'), errorCodes: ['CONTRACT_NOT_FOUND', 'CONTRACT_NOT_DRAFT', 'ROOM_NOT_AVAILABLE', 'CONCURRENT_MODIFICATION'] })
  },
  '/contracts/{id}/documents': {
    post: operation('Contracts', 'Add contract document', 'MANAGER', { parameters: [id], body: requestBody('ContractDocumentRequest'), responses: created('Document'), errorCodes: ['CONTRACT_NOT_FOUND', 'UPLOAD_SIZE_INVALID', 'UPLOAD_MIME_INVALID'] })
  },
  '/contracts/{id}/documents/{documentId}': {
    delete: operation('Contracts', 'Delete contract document', 'MANAGER', { parameters: [id, documentId], responses: noContent, errorCodes: ['CONTRACT_NOT_FOUND', 'CONTRACT_DOCUMENT_NOT_FOUND', 'CLOUDINARY_DELETE_FAILED'] })
  },
  '/contracts/{id}/activate': {
    post: operation('Contracts', 'Activate contract', 'MANAGER', { parameters: [id], responses: ok('Contract'), errorCodes: ['CONTRACT_NOT_FOUND', 'CONTRACT_NOT_DRAFT', 'CONTRACT_PRIMARY_TENANT_REQUIRED', 'ROOM_ALREADY_OCCUPIED'] })
  },
  '/contracts/{id}/end': {
    post: operation('Contracts', 'End contract', 'MANAGER', { parameters: [id], body: requestBody('ContractCloseRequest', false), responses: ok('Contract'), errorCodes: ['CONTRACT_NOT_FOUND', 'CONTRACT_NOT_ACTIVE'] })
  },
  '/contracts/{id}/cancel': {
    post: operation('Contracts', 'Cancel contract', 'MANAGER', { parameters: [id], body: requestBody('ContractCloseRequest', false), responses: ok('Contract'), errorCodes: ['CONTRACT_NOT_FOUND', 'CONTRACT_ACTIVE', 'CONTRACT_ENDED'] })
  },
  '/contracts/{id}/tenants': {
    post: operation('Contracts', 'Add contract tenant', 'MANAGER', { parameters: [id], body: requestBody('ContractTenantInput'), responses: { '201': jsonResponse('Tenant assigned.', { type: 'object', additionalProperties: true }) }, errorCodes: ['CONTRACT_NOT_FOUND', 'TENANT_NOT_FOUND', 'CONTRACT_TENANT_EXISTS', 'TENANT_HAS_ACTIVE_CONTRACT'] })
  },
  '/contracts/{id}/tenants/{tenantId}': {
    patch: operation('Contracts', 'Update contract tenant', 'MANAGER', { parameters: [id, tenantId], body: requestBody('ContractTenantUpdateRequest'), responses: { '200': jsonResponse('Contract tenant updated.', { type: 'object', additionalProperties: true }) }, errorCodes: ['CONTRACT_TENANT_NOT_FOUND', 'CONTRACT_PRIMARY_TENANT_CONFLICT'] }),
    delete: operation('Contracts', 'Remove contract tenant', 'MANAGER', {
      parameters: [id, tenantId, queryParameter('left_at', { type: 'string', format: 'date' }, 'Participant departure date.')],
      responses: noContent, errorCodes: ['CONTRACT_TENANT_NOT_FOUND', 'CONTRACT_PRIMARY_TENANT_REQUIRED']
    })
  }
};

const utilityPaths = {
  '/utility-rates': {
    get: operation('Utilities', 'List utility rates', 'MANAGER', { parameters: [uuidQuery('building_id', 'Filter by building.')], responses: { '200': jsonResponse('Utility rates.', arrayOf('UtilityRate')) }, errorCodes: ['VALIDATION_ERROR'] }),
    post: operation('Utilities', 'Create utility rate', 'MANAGER', { body: requestBody('UtilityRateInput'), responses: created('UtilityRate'), errorCodes: ['BUILDING_NOT_FOUND', 'UTILITY_RATE_ALREADY_EXISTS'] })
  },
  '/utility-rates/{id}': {
    get: operation('Utilities', 'Get utility rate', 'MANAGER', { parameters: [id], responses: ok('UtilityRate'), errorCodes: ['UTILITY_RATE_NOT_FOUND'] }),
    patch: operation('Utilities', 'Update utility rate', 'MANAGER', { parameters: [id], body: requestBody('UtilityRateUpdateRequest'), responses: ok('UtilityRate'), errorCodes: ['UTILITY_RATE_NOT_FOUND', 'UTILITY_RATE_ALREADY_EXISTS'] }),
    delete: operation('Utilities', 'Delete utility rate', 'MANAGER', { parameters: [id], responses: noContent, errorCodes: ['UTILITY_RATE_NOT_FOUND', 'RELATED_RECORD_CONFLICT'] })
  },
  '/utility-readings': {
    get: operation('Utilities', 'List utility readings', 'AUTHENTICATED', {
      parameters: [
        ...paginationParameters(['month', 'createdAt', 'submittedAt', 'status', 'building', 'room', 'tenant']), searchQuery,
        uuidQuery('building_id', 'Filter by building.'), uuidQuery('room_id', 'Filter by room.'),
        queryParameter('month', { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])(?:-01)?$' }, 'Billing month in YYYY-MM or YYYY-MM-01 format.'),
        queryParameter('status', { type: 'string', enum: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'INVOICED'] })
      ], responses: ok('UtilityReadingPage'), errorCodes: ['VALIDATION_ERROR']
    }),
    post: operation('Utilities', 'Submit utility reading', 'TENANT', { body: requestBody('UtilityReadingInput'), responses: created('UtilityReading'), errorCodes: ['TENANT_ROOM_FORBIDDEN', 'INVALID_UTILITY_READING', 'UTILITY_METER_READING_DECREASED', 'METER_RESET_NOTE_REQUIRED', 'UTILITY_READING_LOCKED', 'UTILITY_READING_ALREADY_EXISTS'] })
  },
  '/utility-readings/{id}': {
    get: operation('Utilities', 'Get utility reading', 'AUTHENTICATED', { parameters: [id], responses: ok('UtilityReading'), errorCodes: ['UTILITY_READING_NOT_FOUND', 'FORBIDDEN'] })
  },
  '/utility-readings/{id}/evidence': {
    post: operation('Utilities', 'Add utility evidence', 'AUTHENTICATED', { parameters: [id], body: requestBody('UtilityEvidenceRequest'), responses: created('Document'), errorCodes: ['UTILITY_READING_NOT_FOUND', 'UTILITY_READING_LOCKED', 'UPLOAD_SIZE_INVALID', 'UPLOAD_MIME_INVALID'] })
  },
  '/utility-readings/{id}/approve': {
    post: operation('Utilities', 'Approve utility reading', 'MANAGER', { parameters: [id], responses: ok('UtilityReading'), errorCodes: ['UTILITY_READING_NOT_FOUND', 'UTILITY_READING_NOT_SUBMITTED'] })
  },
  '/utility-readings/{id}/reject': {
    post: operation('Utilities', 'Reject utility reading', 'MANAGER', { parameters: [id], body: requestBody('ReasonRequest'), responses: ok('UtilityReading'), errorCodes: ['UTILITY_READING_NOT_FOUND', 'UTILITY_READING_NOT_SUBMITTED'] })
  },
  '/utility-readings/{id}/request-correction': {
    post: operation('Utilities', 'Request utility correction', 'MANAGER', { parameters: [id], body: requestBody('ReasonRequest'), responses: ok('UtilityReading'), errorCodes: ['UTILITY_READING_NOT_FOUND', 'UTILITY_READING_NOT_APPROVED'] })
  }
};

const invoicePaths = {
  '/invoices': {
    get: operation('Invoices', 'List invoices', 'AUTHENTICATED', {
      parameters: [
        ...paginationParameters(['month', 'createdAt', 'dueDate', 'total', 'status', 'building', 'room', 'tenant']), searchQuery, monthQuery,
        queryParameter('invoice_status', { type: 'string', enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID'] }),
        queryParameter('payment_status', { type: 'string', enum: ['PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'CANCELLED'] }),
        uuidQuery('building_id', 'Filter by building.'), uuidQuery('room_id', 'Filter by room.'), uuidQuery('tenant_id', 'Filter by tenant.')
      ], responses: ok('InvoicePage'), errorCodes: ['VALIDATION_ERROR']
    }),
    post: operation('Invoices', 'Create draft invoice', 'MANAGER', { body: requestBody('InvoiceInput'), responses: created('Invoice'), errorCodes: ['CONTRACT_NOT_FOUND', 'CONTRACT_NOT_ACTIVE', 'INVOICE_ALREADY_EXISTS', 'INVALID_UTILITY_READING'] })
  },
  '/invoices/summary': {
    get: operation('Invoices', 'Get invoice summary', 'AUTHENTICATED', { parameters: [monthQuery], responses: ok('InvoiceSummary'), errorCodes: ['VALIDATION_ERROR'] })
  },
  '/invoices/prefill': {
    get: operation('Invoices', 'Get invoice prefill', 'MANAGER', {
      parameters: [queryParameter('room_id', { type: 'string', format: 'uuid' }, 'Room to invoice.', true), queryParameter('month', { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])(?:-01)?$' }, 'Billing month.', true)],
      responses: { '200': jsonResponse('Invoice prefill values.', { type: 'object', additionalProperties: true }) },
      errorCodes: ['ROOM_NOT_FOUND', 'CONTRACT_NOT_FOUND', 'UTILITY_RATE_REQUIRED']
    })
  },
  '/invoices/{id}': {
    get: operation('Invoices', 'Get invoice', 'AUTHENTICATED', { parameters: [id], responses: ok('Invoice'), errorCodes: ['INVOICE_NOT_FOUND', 'FORBIDDEN'] }),
    put: operation('Invoices', 'Update draft invoice', 'MANAGER', { parameters: [id], body: requestBody('InvoiceInput'), responses: ok('Invoice'), errorCodes: ['INVOICE_NOT_FOUND', 'INVOICE_NOT_DRAFT', 'INVOICE_ALREADY_EXISTS'] }),
    delete: operation('Invoices', 'Delete draft invoice', 'MANAGER', { description: 'Hard-delete is limited to draft invoices without payment history.', parameters: [id], responses: noContent, errorCodes: ['INVOICE_NOT_FOUND', 'INVOICE_DELETE_REQUIRES_VOID', 'INVOICE_HAS_PAYMENT_HISTORY'] })
  },
  '/invoices/from-reading/{utilityReadingId}': {
    post: operation('Invoices', 'Create invoice from utility reading', 'MANAGER', { parameters: [uuidPath('utilityReadingId')], responses: created('Invoice'), errorCodes: ['UTILITY_READING_NOT_FOUND', 'APPROVED_READING_REQUIRED', 'INVOICE_ALREADY_EXISTS'] })
  },
  '/invoices/generate/room': {
    post: operation('Invoices', 'Generate room invoice', 'MANAGER', { body: requestBody('InvoiceGenerateRequest'), responses: created('InvoiceGenerationResult'), errorCodes: ['ROOM_NOT_FOUND', 'INVOICE_ALREADY_EXISTS', 'UTILITY_RATE_REQUIRED'] })
  },
  '/invoices/generate/building': {
    post: operation('Invoices', 'Generate building invoices', 'MANAGER', { body: requestBody('InvoiceGenerateRequest'), responses: created('InvoiceGenerationResult'), errorCodes: ['BUILDING_NOT_FOUND', 'UTILITY_RATE_REQUIRED'] })
  },
  '/invoices/generate/all': {
    post: operation('Invoices', 'Generate all invoices', 'MANAGER', { body: requestBody('InvoiceGenerateRequest'), responses: created('InvoiceGenerationResult'), errorCodes: ['UTILITY_RATE_REQUIRED'] })
  },
  '/invoices/{id}/issue': {
    post: operation('Invoices', 'Issue invoice and payment request', 'MANAGER', { parameters: [id], body: requestBody('InvoiceIssueRequest', false), responses: ok('Invoice'), errorCodes: ['INVOICE_NOT_FOUND', 'INVOICE_NOT_DRAFT', 'BANK_ACCOUNT_REQUIRED'] })
  },
  '/invoices/{id}/void': {
    post: operation('Invoices', 'Void issued invoice', 'MANAGER', { parameters: [id], body: requestBody('VoidReasonRequest'), responses: ok('Invoice'), errorCodes: ['INVOICE_NOT_FOUND', 'INVOICE_DRAFT_REQUIRES_DELETE', 'INVOICE_ALREADY_VOID', 'INVOICE_VOID_REASON_REQUIRED'] })
  },
  '/invoices/{id}/replacement': {
    post: operation('Invoices', 'Create replacement invoice', 'MANAGER', { parameters: [id], responses: created('Invoice'), errorCodes: ['INVOICE_NOT_FOUND', 'INVOICE_NOT_VOID', 'INVOICE_REPLACEMENT_EXISTS'] })
  },
  '/invoices/{id}/adjustments': {
    post: operation('Invoices', 'Add invoice adjustment', 'MANAGER', { parameters: [id], body: requestBody('InvoiceAdjustmentRequest'), responses: ok('Invoice'), errorCodes: ['INVOICE_NOT_FOUND', 'INVOICE_PAID', 'INVOICE_ALREADY_VOID'] })
  }
};

const paymentPaths = {
  '/payments/requests': {
    get: operation('Payments', 'List payment requests', 'AUTHENTICATED', {
      parameters: [
        ...paginationParameters(['createdAt', 'month', 'amount', 'status', 'building', 'room', 'tenant', 'latestProofSubmittedAt']),
        searchQuery, monthQuery, uuidQuery('building_id', 'Filter by building.'), uuidQuery('room_id', 'Filter by room.'), uuidQuery('tenant_id', 'Filter by tenant.'),
        queryParameter('request_status', { type: 'string', enum: ['DRAFT', 'WAITING_TRANSFER', 'TRANSFER_SUBMITTED', 'VERIFIED', 'REJECTED', 'CANCELLED', 'EXPIRED'] }),
        queryParameter('latest_proof_status', { type: 'string', enum: ['PENDING', 'APPROVED', 'REJECTED', 'NONE'] })
      ], responses: ok('PaymentRequestPage'), errorCodes: ['VALIDATION_ERROR']
    }),
    post: operation('Payments', 'Create payment request', 'MANAGER', { body: requestBody('PaymentRequestInput'), responses: created('PaymentRequest'), errorCodes: ['INVOICE_NOT_FOUND', 'INVOICE_NOT_ISSUED', 'PAYMENT_REQUEST_ALREADY_EXISTS', 'BANK_ACCOUNT_REQUIRED'] })
  },
  '/payments/requests/{id}': {
    get: operation('Payments', 'Get payment request', 'AUTHENTICATED', { parameters: [id], responses: ok('PaymentRequest'), errorCodes: ['PAYMENT_NOT_FOUND', 'FORBIDDEN'] })
  },
  '/payments/invoices/{invoiceId}/request': {
    get: operation('Payments', 'Get invoice payment request', 'AUTHENTICATED', {
      parameters: [invoiceId], responses: { '200': jsonResponse('Payment request or null.', { anyOf: [schemaRef('PaymentRequest'), { type: 'null' }] }) }, errorCodes: ['INVOICE_NOT_FOUND', 'FORBIDDEN']
    })
  },
  '/payments/requests/{id}/cancel': {
    post: operation('Payments', 'Cancel payment request', 'MANAGER', { parameters: [id], responses: ok('PaymentRequest'), errorCodes: ['PAYMENT_NOT_FOUND', 'CONFLICT'] })
  },
  '/payments/requests/{id}/expire': {
    post: operation('Payments', 'Expire payment request', 'MANAGER', { parameters: [id], responses: ok('PaymentRequest'), errorCodes: ['PAYMENT_NOT_FOUND', 'CONFLICT'] })
  },
  '/payments/requests/{id}/proofs': {
    post: operation('Payments', 'Submit payment proof', 'TENANT', {
      parameters: [id, headerParameter('Idempotency-Key', { type: 'string', minLength: 8, maxLength: 200 }, 'Optional retry-safe idempotency key.')],
      body: requestBody('PaymentProofInput'), responses: created('PaymentProof'),
      errorCodes: ['PAYMENT_NOT_FOUND', 'PAYMENT_PROOF_ALREADY_SUBMITTED', 'PAYMENT_PROOF_PENDING', 'IDEMPOTENCY_KEY_REUSED', 'PAYMENT_PROOF_RATE_LIMIT_EXCEEDED']
    })
  },
  '/payments/proofs/{id}/approve': {
    post: operation('Payments', 'Approve payment proof', 'MANAGER', { parameters: [id], responses: ok('PaymentProofReviewResult'), errorCodes: ['PAYMENT_NOT_FOUND', 'PAYMENT_PROOF_ALREADY_APPROVED', 'PAYMENT_EXCEEDS_INVOICE_BALANCE', 'CONCURRENT_MODIFICATION'] })
  },
  '/payments/proofs/{id}/reject': {
    post: operation('Payments', 'Reject payment proof', 'MANAGER', { parameters: [id], body: requestBody('OptionalReasonRequest', false), responses: ok('PaymentProof'), errorCodes: ['PAYMENT_NOT_FOUND', 'PAYMENT_PROOF_ALREADY_APPROVED'] })
  },
  '/payments/ledger/{paymentId}/reverse': {
    post: operation('Payments', 'Reverse approved payment', 'MANAGER', { parameters: [paymentId], body: requestBody('ReasonRequest'), responses: created('Payment'), errorCodes: ['PAYMENT_NOT_FOUND', 'PAYMENT_NOT_REVERSIBLE', 'PAYMENT_ALREADY_REVERSED', 'CONCURRENT_MODIFICATION'] })
  }
};

export const openApiPaths = {
  ...authPaths,
  ...tenantPaths,
  ...contractPaths,
  ...utilityPaths,
  ...invoicePaths,
  ...paymentPaths
};
