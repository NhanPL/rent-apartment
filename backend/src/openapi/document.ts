import { openApiPaths } from './paths';
import { openApiSchemas } from './schemas';

const errorResponse = (description: string, code: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/Error' },
      example: { code, message: description, fieldErrors: null, requestId: '8cbfd8dc-ff10-48c2-9e88-c776c30c0cfe' }
    }
  }
});

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Rent Apartment API',
    version: '1.0.0-internal',
    description: [
      'Internal API for apartment rental management.',
      'Every operation declares its required role through `x-required-role` and stable domain errors through `x-error-codes`.',
      'The current unversioned `/api` base remains for the first-party frontend. External clients must use the future `/api/v1` base described in `docs/api-versioning.md`.'
    ].join('\n\n')
  },
  servers: [
    { url: '/api', description: 'Current first-party API base' }
  ],
  externalDocs: {
    description: 'Stable error-code catalog and client handling rules',
    url: 'https://github.com/NhanPL/rent-apartment/blob/main/docs/error-codes.md'
  },
  tags: [
    { name: 'Auth', description: 'Authentication, activation, password and session lifecycle.' },
    { name: 'Tenants', description: 'Manager-owned tenant profiles, identity documents and privacy exports.' },
    { name: 'Contracts', description: 'Contract lifecycle, participants and protected documents.' },
    { name: 'Utilities', description: 'Utility rates, monthly readings and evidence.' },
    { name: 'Invoices', description: 'Invoice generation, issue, adjustment, void and replacement.' },
    { name: 'Payments', description: 'Bank-transfer requests, proofs and immutable payment ledger reversals.' }
  ],
  paths: openApiPaths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Short-lived access token returned by POST /auth/login or POST /auth/refresh.'
      },
      refreshCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'rent_refresh_token',
        description: 'HttpOnly refresh cookie. The configured cookie name may differ by deployment.'
      }
    },
    schemas: openApiSchemas,
    responses: {
      BadRequest: errorResponse('Request validation or business rule failed.', 'VALIDATION_ERROR'),
      Unauthorized: errorResponse('Authentication is missing, invalid or expired.', 'UNAUTHORIZED'),
      Forbidden: errorResponse('The current role or ownership scope is not allowed.', 'FORBIDDEN'),
      NotFound: errorResponse('The owned resource does not exist.', 'NOT_FOUND'),
      Conflict: errorResponse('The request conflicts with current resource state.', 'CONFLICT'),
      RateLimited: {
        ...errorResponse('Rate limit exceeded.', 'GLOBAL_RATE_LIMIT_EXCEEDED'),
        headers: {
          'Retry-After': { description: 'Seconds until the caller may retry.', schema: { type: 'integer' } }
        }
      },
      InternalError: errorResponse('Unexpected server error. Report requestId to support.', 'INTERNAL_ERROR')
    }
  },
  'x-api-versioning': {
    currentStatus: 'internal-unversioned',
    externalBasePath: '/api/v1',
    strategy: 'URL major versioning; additive changes remain within a major version; breaking changes require a new major version.'
  }
} as const;

export type OpenApiDocument = typeof openApiDocument;
