import express from 'express';
import buildingsRoutes from './modules/buildings/buildings.routes';
import roomsRoutes from './modules/rooms/rooms.routes';
import tenantsRoutes from './modules/tenants/tenants.routes';
import contractsRoutes from './modules/contracts/contracts.routes';
import utilityRatesRoutes from './modules/utility-rates/utility-rates.routes';
import utilityReadingsRoutes from './modules/utility-readings/utility-readings.routes';
import invoicesRoutes from './modules/invoices/invoices.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import vnpayPublicRoutes from './modules/payments/vnpay.routes';
import fixedChargesRoutes from './modules/fixed-charges/fixed-charges.routes';
import meRoutes from './modules/me/me.routes';
import uploadsRoutes from './modules/uploads/uploads.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import reportsRoutes from './modules/reports/reports.routes';
import authRoutes from './modules/auth/auth.routes';
import { requireAuth } from './shared/middleware/auth';
import { errorHandler } from './shared/middleware/error-handler';
import { env } from './config/env';

export const app = express();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', env.CLIENT_ORIGIN);
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/payments/vnpay', vnpayPublicRoutes);

app.use('/api', requireAuth);
app.use('/api/buildings', buildingsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/utility-rates', utilityRatesRoutes);
app.use('/api/utility-readings', utilityReadingsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/fixed-charges', fixedChargesRoutes);
app.use('/api/me', meRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);

app.use(errorHandler);
