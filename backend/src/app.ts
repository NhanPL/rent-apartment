import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import buildingsRoutes from './modules/buildings/buildings.routes';
import roomsRoutes from './modules/rooms/rooms.routes';
import tenantsRoutes from './modules/tenants/tenants.routes';
import contractsRoutes from './modules/contracts/contracts.routes';
import rentalRegistrationRoutes from './modules/rental-registration/rental-registration.routes';
import utilityRatesRoutes from './modules/utility-rates/utility-rates.routes';
import utilityReadingsRoutes from './modules/utility-readings/utility-readings.routes';
import invoicesRoutes from './modules/invoices/invoices.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import fixedChargesRoutes from './modules/fixed-charges/fixed-charges.routes';
import meRoutes from './modules/me/me.routes';
import uploadsRoutes from './modules/uploads/uploads.routes';
import documentAssetsRoutes, { documentDeliveryRoutes } from './modules/documents/document-assets.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import reportsRoutes from './modules/reports/reports.routes';
import monthlyBillingRoutes from './modules/monthly-billing/monthly-billing.routes';
import authRoutes from './modules/auth/auth.routes';
import auditLogsRoutes from './modules/audit-logs/audit-logs.routes';
import { requireAuth } from './shared/middleware/auth';
import { errorHandler } from './shared/middleware/error-handler';
import { env } from './config/env';
import { corsOptions } from './config/cors';
import { globalRateLimit } from './config/rate-limit';
import { securityHeaders } from './config/security';
import { rejectDirectFileUploads } from './shared/middleware/request-hardening';
import { auditRequestContext } from './shared/middleware/audit-context';
import { requestLogger } from './shared/middleware/request-logger';
import { AppError } from './shared/errors/app-error';
import openApiDocsRoutes from './openapi/docs.routes';
import operationsRoutes from './modules/operations/operations.routes';
import { checkApplicationReadiness } from './shared/services/readiness.service';
import notificationsRoutes from './modules/notifications/notifications.routes';
import importsRoutes from './modules/imports/imports.routes';
import invoiceBrandingRoutes from './modules/invoice-branding/invoice-branding.routes';
import featureFlagsRoutes from './modules/feature-flags/feature-flags.routes';
import preferencesRoutes from './modules/preferences/preferences.routes';

export const app = express();
const frontendDistPath = path.resolve(__dirname, '../../front-end/dist');
const frontendIndexPath = path.join(frontendDistPath, 'index.html');

if (env.TRUST_PROXY_HOPS > 0) {
  app.set('trust proxy', env.TRUST_PROXY_HOPS);
}

app.use(securityHeaders);
app.use(auditRequestContext);
app.use(requestLogger);
app.use(cors(corsOptions));
app.use('/api', globalRateLimit);
app.use('/api', rejectDirectFileUploads);
app.use(express.json({
  limit: `${env.JSON_BODY_LIMIT_KB}kb`,
  strict: true,
  type: ['application/json', 'application/*+json']
}));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.get('/ready', async (_req, res) => {
  const readiness = await checkApplicationReadiness();
  res.status(readiness.ready ? 200 : 503).json(readiness);
});
if (env.OPENAPI_DOCS_ENABLED) {
  app.use('/api-docs', globalRateLimit, openApiDocsRoutes);
}
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentDeliveryRoutes);
app.use('/api', requireAuth);
app.use('/api/buildings', buildingsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/rental-registration', rentalRegistrationRoutes);
app.use('/api/monthly-billing', monthlyBillingRoutes);
app.use('/api/utility-rates', utilityRatesRoutes);
app.use('/api/utility-readings', utilityReadingsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/fixed-charges', fixedChargesRoutes);
app.use('/api/me', meRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/documents', documentAssetsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);
app.use('/api/operations', operationsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/imports', importsRoutes);
app.use('/api/invoice-branding', invoiceBrandingRoutes);
app.use('/api/feature-flags', featureFlagsRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api', (_req, _res, next) => {
  next(new AppError(404, 'API route not found', 'ROUTE_NOT_FOUND'));
});

if (fs.existsSync(frontendIndexPath)) {
  app.use(express.static(frontendDistPath, { index: false }));
  app.get('*', (req, res, next) => {
    const isFileRequest = path.extname(req.path) !== '';
    if (req.path.startsWith('/api') || req.path === '/health' || isFileRequest || !req.accepts('html')) {
      next();
      return;
    }

    res.sendFile(frontendIndexPath);
  });
}

app.use(errorHandler);
