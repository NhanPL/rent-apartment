export type OpenApiSchema = Record<string, unknown>;
export type ApiRole = 'PUBLIC' | 'AUTHENTICATED' | 'MANAGER' | 'TENANT';

export const schemaRef = (name: string): OpenApiSchema => ({
  $ref: `#/components/schemas/${name}`
});

export const arrayOf = (name: string): OpenApiSchema => ({
  type: 'array',
  items: schemaRef(name)
});

export const jsonResponse = (description: string, schema?: OpenApiSchema) => ({
  description,
  ...(schema ? {
    content: { 'application/json': { schema } }
  } : {})
});

export const requestBody = (schemaName: string, required = true) => ({
  required,
  content: {
    'application/json': { schema: schemaRef(schemaName) }
  }
});

export const pathParameter = (name: string, description?: string) => ({
  name,
  in: 'path',
  required: true,
  description,
  schema: { type: 'string', format: 'uuid' }
});

export const queryParameter = (
  name: string,
  schema: OpenApiSchema,
  description?: string,
  required = false
) => ({ name, in: 'query', required, description, schema });

export const headerParameter = (name: string, schema: OpenApiSchema, description: string) => ({
  name,
  in: 'header',
  required: false,
  description,
  schema
});

const errorResponses = {
  '400': { $ref: '#/components/responses/BadRequest' },
  '401': { $ref: '#/components/responses/Unauthorized' },
  '403': { $ref: '#/components/responses/Forbidden' },
  '404': { $ref: '#/components/responses/NotFound' },
  '409': { $ref: '#/components/responses/Conflict' },
  '429': { $ref: '#/components/responses/RateLimited' },
  '500': { $ref: '#/components/responses/InternalError' }
};

interface OperationOptions {
  description?: string;
  parameters?: unknown[];
  body?: unknown;
  responses?: Record<string, unknown>;
  errorCodes?: string[];
  security?: Array<Record<string, string[]>>;
}

export const operation = (
  tag: string,
  summary: string,
  role: ApiRole,
  options: OperationOptions = {}
) => ({
  tags: [tag],
  summary,
  description: options.description,
  operationId: `${tag.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${summary.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
  'x-required-role': role,
  'x-error-codes': options.errorCodes ?? [],
  security: options.security ?? (role === 'PUBLIC' ? [] : [{ bearerAuth: [] }]),
  ...(options.parameters ? { parameters: options.parameters } : {}),
  ...(options.body ? { requestBody: options.body } : {}),
  responses: {
    ...(options.responses ?? { '200': jsonResponse('Successful response') }),
    ...errorResponses
  }
});

export const uuidPath = (name = 'id') => pathParameter(name, `${name} UUID`);
export const monthQuery = queryParameter('month', {
  type: 'string',
  pattern: '^\\d{4}-(0[1-9]|1[0-2])$'
}, 'Billing month in YYYY-MM format');

export const paginationParameters = (sortValues: string[] = []) => [
  queryParameter('page', { type: 'integer', minimum: 1, default: 1 }),
  queryParameter('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 20 }),
  queryParameter('sortBy', sortValues.length ? { type: 'string', enum: sortValues } : { type: 'string' }),
  queryParameter('sortOrder', { type: 'string', enum: ['asc', 'desc'], default: 'desc' })
];
