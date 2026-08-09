import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import { resolveOpenApiDocsSettings } from '../src/config/env';
import { createOpenApiDocsRouter } from '../src/openapi/docs.routes';
import { openApiDocument } from '../src/openapi/document';

const documentedOperations: Record<string, string[]> = {
  '/auth/login': ['post'], '/auth/refresh': ['post'], '/auth/logout': ['post'],
  '/auth/activation': ['get'], '/auth/activate': ['post'],
  '/auth/password-reset/request': ['post'], '/auth/password-reset/confirm': ['post'],
  '/auth/me': ['get'], '/auth/password': ['put'], '/auth/sessions/revoke-all': ['post'],
  '/tenants': ['get', 'post'], '/tenants/{id}': ['get', 'patch', 'delete'],
  '/tenants/{id}/resend-activation': ['post'], '/tenants/{id}/identity-documents': ['put'],
  '/tenants/{id}/data-export': ['get'], '/tenants/{id}/contracts': ['get'],
  '/tenants/{id}/invoices': ['get'], '/tenants/{id}/payments': ['get'], '/tenants/{id}/export-contract': ['post'],
  '/contracts': ['get', 'post'], '/contracts/{id}': ['get', 'patch'],
  '/contracts/{id}/documents': ['post'], '/contracts/{id}/documents/{documentId}': ['delete'],
  '/contracts/{id}/activate': ['post'], '/contracts/{id}/end': ['post'], '/contracts/{id}/cancel': ['post'],
  '/contracts/{id}/tenants': ['post'], '/contracts/{id}/tenants/{tenantId}': ['patch', 'delete'],
  '/utility-rates': ['get', 'post'], '/utility-rates/{id}': ['get', 'patch', 'delete'],
  '/utility-readings': ['get', 'post'], '/utility-readings/{id}': ['get'],
  '/utility-readings/{id}/evidence': ['post'], '/utility-readings/{id}/approve': ['post'],
  '/utility-readings/{id}/reject': ['post'], '/utility-readings/{id}/request-correction': ['post'],
  '/invoices': ['get', 'post'], '/invoices/summary': ['get'], '/invoices/prefill': ['get'],
  '/invoices/{id}': ['get', 'put', 'delete'], '/invoices/from-reading/{utilityReadingId}': ['post'],
  '/invoices/generate/room': ['post'], '/invoices/generate/building': ['post'], '/invoices/generate/all': ['post'],
  '/invoices/{id}/issue': ['post'], '/invoices/{id}/void': ['post'],
  '/invoices/{id}/replacement': ['post'], '/invoices/{id}/adjustments': ['post'],
  '/payments/requests': ['get', 'post'], '/payments/requests/{id}': ['get'],
  '/payments/invoices/{invoiceId}/request': ['get'], '/payments/requests/{id}/cancel': ['post'],
  '/payments/requests/{id}/expire': ['post'], '/payments/requests/{id}/proofs': ['post'],
  '/payments/proofs/{id}/approve': ['post'], '/payments/proofs/{id}/reject': ['post'],
  '/payments/ledger/{paymentId}/reverse': ['post']
};

const routeSources = [
  ['auth', '../src/modules/auth/auth.routes.ts'],
  ['tenants', '../src/modules/tenants/tenants.routes.ts'],
  ['contracts', '../src/modules/contracts/contracts.routes.ts'],
  ['utility-rates', '../src/modules/utility-rates/utility-rates.routes.ts'],
  ['utility-readings', '../src/modules/utility-readings/utility-readings.routes.ts'],
  ['invoices', '../src/modules/invoices/invoices.routes.ts'],
  ['payments', '../src/modules/payments/payments.routes.ts']
] as const;

const operationsFromRoutes = () => {
  const operations: Record<string, string[]> = {};
  for (const [prefix, relativeFile] of routeSources) {
    const source = fs.readFileSync(path.resolve(__dirname, relativeFile), 'utf8');
    const routePattern = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
    for (const match of source.matchAll(routePattern)) {
      const routePath = match[2] === '/' ? '' : match[2];
      const openApiPath = `/${prefix}${routePath}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      operations[openApiPath] ??= [];
      operations[openApiPath].push(match[1]);
    }
  }
  return operations;
};

describe('OpenAPI contract', () => {
  it('is a valid OpenAPI document with resolvable references', async () => {
    await expect(SwaggerParser.validate(
      JSON.parse(JSON.stringify(openApiDocument))
    )).resolves.toBeDefined();
  });

  it('documents every endpoint in the BE-005 module scope', () => {
    const sourceOperations = operationsFromRoutes();
    expect(sourceOperations).toEqual(documentedOperations);
    expect(Object.keys(openApiDocument.paths).sort()).toEqual(Object.keys(documentedOperations).sort());
    for (const [path, methods] of Object.entries(documentedOperations)) {
      expect(Object.keys(openApiDocument.paths[path as keyof typeof openApiDocument.paths]).sort()).toEqual(methods.sort());
    }
  });

  it('declares role, stable errors, security and responses on every operation', () => {
    const operationIds = new Set<string>();
    for (const pathItem of Object.values(openApiDocument.paths)) {
      for (const operation of Object.values(pathItem)) {
        expect(['PUBLIC', 'AUTHENTICATED', 'MANAGER', 'TENANT']).toContain(operation['x-required-role']);
        expect(Array.isArray(operation['x-error-codes'])).toBe(true);
        expect(operation['x-error-codes'].length).toBeGreaterThan(0);
        expect(operation.security).toBeDefined();
        expect(operation.responses).toHaveProperty('400');
        expect(operation.responses).toHaveProperty('401');
        expect(operation.responses).toHaveProperty('403');
        expect(operation.responses).toHaveProperty('500');
        expect(operationIds.has(operation.operationId)).toBe(false);
        operationIds.add(operation.operationId);
        const successfulResponses = Object.entries(operation.responses)
          .filter(([status]) => status.startsWith('2'));
        expect(successfulResponses.length).toBeGreaterThan(0);
        for (const [status, response] of successfulResponses) {
          if (status !== '204') {
            expect(response).toHaveProperty('content.application/json.schema');
          }
        }
      }
    }
  });

  it('serves JSON and Swagger UI when documentation is enabled', async () => {
    const app = express();
    app.use('/api-docs', createOpenApiDocsRouter({ requireBasicAuth: false, username: '', password: '' }));

    const specification = await request(app).get('/api-docs/openapi.json').expect(200);
    expect(specification.body.openapi).toBe('3.1.0');
    expect(specification.headers['cache-control']).toBe('no-store');
    await request(app).get('/api-docs/').expect(200).expect(/id="swagger-ui"/);
  });

  it('requires valid Basic Auth when production docs are enabled', async () => {
    const app = express();
    app.use('/api-docs', createOpenApiDocsRouter({
      requireBasicAuth: true,
      username: 'docs-manager',
      password: 'a-strong-docs-password'
    }));

    await request(app).get('/api-docs/openapi.json').expect(401).expect('WWW-Authenticate', /Basic/);
    await request(app).get('/api-docs/openapi.json').auth('docs-manager', 'wrong').expect(401);
    await request(app).get('/api-docs/openapi.json').auth('docs-manager', 'a-strong-docs-password').expect(200);
  });

  it('enables docs by default only in development and staging', () => {
    expect(resolveOpenApiDocsSettings('development').enabled).toBe(true);
    expect(resolveOpenApiDocsSettings('staging').enabled).toBe(true);
    expect(resolveOpenApiDocsSettings('test').enabled).toBe(false);
    expect(resolveOpenApiDocsSettings('production').enabled).toBe(false);
    expect(() => resolveOpenApiDocsSettings('production', 'true', '', '')).toThrow(/require OPENAPI_DOCS_USERNAME/);
    expect(resolveOpenApiDocsSettings('production', 'true', 'docs', '1234567890123456')).toMatchObject({
      enabled: true,
      requireBasicAuth: true
    });
  });
});
