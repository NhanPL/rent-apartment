import express, { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppError } from '../src/shared/errors/app-error';
import { auditRequestContext } from '../src/shared/middleware/audit-context';
import { createErrorHandler } from '../src/shared/middleware/error-handler';
import { asyncHandler } from '../src/shared/middleware/async-handler';
import { parseBody, parseEmptyBody, registerUuidParams } from '../src/shared/utils/validation';

const createTestApp = () => {
  const testApp = express();
  const router = Router();
  registerUuidParams(router, ['id']);

  testApp.use(auditRequestContext);
  testApp.use(express.json());

  router.post('/:id', asyncHandler(async (req, res) => {
    const body = parseBody(z.object({
      email: z.string().email(),
      displayName: z.string().trim().min(2)
    }).strict(), req.body);
    res.status(201).json(body);
  }));
  router.post('/:id/action', asyncHandler(async (req, res) => {
    parseEmptyBody(req.body);
    res.status(204).send();
  }));

  testApp.use('/resources', router);
  testApp.get('/status/:status', (req, _res, next) => {
    const status = Number(req.params.status);
    next(new AppError(status, `HTTP ${status}`));
  });
  testApp.get('/database-error/:code', (req, _res, next) => {
    next(Object.assign(new Error('sensitive SQL detail'), {
      code: req.params.code,
      constraint: req.query.constraint,
      column: req.query.column
    }));
  });
  testApp.get('/internal-error', () => {
    throw new Error('SELECT password_hash FROM app_user');
  });
  testApp.use(createErrorHandler('development'));
  return testApp;
};

describe('API error contract', () => {
  const testApp = createTestApp();
  const requestId = 'be-003-contract-test';
  const validId = '00000000-0000-4000-8000-000000000001';

  it('returns field-level Zod errors with the request ID', async () => {
    const response = await request(testApp)
      .post(`/resources/${validId}`)
      .set('X-Request-ID', requestId)
      .send({ email: 'invalid', unexpected: true })
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid request payload',
      fieldErrors: {
        email: ['Invalid email'],
        displayName: ['Required'],
        body: ["Unrecognized key(s) in object: 'unexpected'"]
      },
      requestId
    });
  });

  it('validates UUID route parameters with the same contract', async () => {
    const response = await request(testApp)
      .post('/resources/not-a-uuid')
      .set('X-Request-ID', requestId)
      .send({ email: 'person@example.com', displayName: 'Person' })
      .expect(400);

    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Invalid route parameters',
      fieldErrors: { id: ['Must be a valid UUID'] },
      requestId
    });
  });

  it('rejects unexpected payloads on bodyless mutations', async () => {
    const response = await request(testApp)
      .post(`/resources/${validId}/action`)
      .set('X-Request-ID', requestId)
      .send({ force: true })
      .expect(400);

    expect(response.body).toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: { body: ["Unrecognized key(s) in object: 'force'"] },
      requestId
    });
  });

  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND'],
    [409, 'CONFLICT']
  ])('uses the stable default code for HTTP %i', async (status, code) => {
    const response = await request(testApp)
      .get(`/status/${status}`)
      .set('X-Request-ID', requestId)
      .expect(status);

    expect(response.body).toEqual({
      code,
      message: `HTTP ${status}`,
      fieldErrors: null,
      requestId
    });
  });

  it.each([
    ['23505', 'uq_tenant_identity', 409, 'TENANT_IDENTITY_EXISTS', 'identity_number'],
    ['23503', 'contract_room_id_fkey', 404, 'ROOM_NOT_FOUND', 'room_id'],
    ['23514', undefined, 400, 'BUSINESS_RULE_VIOLATION', undefined],
    ['23502', undefined, 400, 'REQUIRED_FIELD_MISSING', 'email'],
    ['22P02', undefined, 400, 'INVALID_FIELD_VALUE', undefined],
    ['40001', undefined, 409, 'CONCURRENT_MODIFICATION', undefined]
  ])(
    'maps PostgreSQL %s to %s without exposing database details',
    async (databaseCode, constraint, status, expectedCode, field) => {
      const query = new URLSearchParams();
      if (constraint) query.set('constraint', constraint);
      if (databaseCode === '23502') query.set('column', 'email');
      const response = await request(testApp)
        .get(`/database-error/${databaseCode}?${query.toString()}`)
        .set('X-Request-ID', requestId)
        .expect(status);

      expect(response.body.code).toBe(expectedCode);
      expect(response.body.requestId).toBe(requestId);
      expect(JSON.stringify(response.body)).not.toContain('SQL');
      if (field) expect(response.body.fieldErrors).toHaveProperty(field);
    }
  );

  it('never exposes internal messages or stack traces outside the server', async () => {
    const response = await request(testApp)
      .get('/internal-error')
      .set('X-Request-ID', requestId)
      .expect(500);

    expect(response.body).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      fieldErrors: null,
      requestId
    });
    expect(response.body).not.toHaveProperty('stack');
    expect(JSON.stringify(response.body)).not.toContain('password_hash');
  });
});
