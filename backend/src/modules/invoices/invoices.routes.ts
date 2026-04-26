import { Router } from 'express';
import { requireRole } from '../../shared/middleware/auth';
import { addInvoiceAdjustment, createInvoiceFromReading, getInvoiceDetail, listInvoices } from './invoices.service';

const router = Router();

router.get('/', async (_req, res) => {
  res.json(await listInvoices());
});

router.get('/:id', async (req, res) => {
  res.json(await getInvoiceDetail(req.params.id));
});

router.post('/from-reading/:utilityReadingId', requireRole('MANAGER'), async (req, res) => {
  res.status(201).json(await createInvoiceFromReading(req.params.utilityReadingId, req.auth!.userId));
});

router.post('/:id/adjustments', requireRole('MANAGER'), async (req, res) => {
  const { amount, reason } = req.body;
  res.json(await addInvoiceAdjustment(req.params.id, Number(amount), reason, req.auth!.userId));
});

export default router;
