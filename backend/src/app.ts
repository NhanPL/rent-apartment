import express from 'express';
import buildingsRoutes from './modules/buildings/buildings.routes';
import roomsRoutes from './modules/rooms/rooms.routes';
import tenantsRoutes from './modules/tenants/tenants.routes';
import contractsRoutes from './modules/contracts/contracts.routes';
import utilityReadingsRoutes from './modules/utility-readings/utility-readings.routes';
import invoicesRoutes from './modules/invoices/invoices.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import meRoutes from './modules/me/me.routes';
import uploadsRoutes from './modules/uploads/uploads.routes';
import { requireAuth } from './shared/middleware/auth';
import { errorHandler } from './shared/middleware/error-handler';

export const app = express();
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api', requireAuth);
app.use('/api/buildings', buildingsRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/utility-readings', utilityReadingsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/me', meRoutes);
app.use('/api/uploads', uploadsRoutes);

app.use(errorHandler);
