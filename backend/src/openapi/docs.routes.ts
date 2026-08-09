import crypto from 'crypto';
import { Router, type RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env';
import { openApiDocument } from './document';

const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export interface OpenApiDocsAccess {
  requireBasicAuth: boolean;
  username: string;
  password: string;
}

export const createOpenApiDocsRouter = (access: OpenApiDocsAccess = {
  requireBasicAuth: env.OPENAPI_DOCS_REQUIRE_AUTH,
  username: env.OPENAPI_DOCS_USERNAME,
  password: env.OPENAPI_DOCS_PASSWORD
}) => {
  const router = Router();
  const requireDocsBasicAuth: RequestHandler = (req, res, next) => {
    if (!access.requireBasicAuth) {
      next();
      return;
    }

    const authorization = req.header('authorization');
    const encoded = authorization?.startsWith('Basic ') ? authorization.slice(6).trim() : '';
    let username = '';
    let password = '';
    try {
      const decoded = Buffer.from(encoded, 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      if (separator >= 0) {
        username = decoded.slice(0, separator);
        password = decoded.slice(separator + 1);
      }
    } catch {
      // Invalid credentials follow the same response as missing credentials.
    }

    if (constantTimeEqual(username, access.username)
      && constantTimeEqual(password, access.password)) {
      next();
      return;
    }

    res.setHeader('WWW-Authenticate', 'Basic realm="Rent Apartment API documentation", charset="UTF-8"');
    res.status(401).json({ message: 'API documentation authentication required.' });
  };

  router.use(requireDocsBasicAuth);
  router.get('/openapi.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(openApiDocument);
  });
  router.use(...swaggerUi.serve);
  router.get('/', swaggerUi.setup(openApiDocument, {
    customSiteTitle: 'Rent Apartment API',
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: false,
      tryItOutEnabled: true
    }
  }));
  return router;
};

export default createOpenApiDocsRouter();
