import { Router } from 'express';
import { asyncHandler } from '../../shared/middleware/async-handler';
import { handleVnpayIpn, verifyVnpayReturn } from './vnpay.service';

const router = Router();

router.get('/return', asyncHandler(async (req, res) => {
  res.json(await verifyVnpayReturn(req.query));
}));

router.get('/ipn', asyncHandler(async (req, res) => {
  res.json(await handleVnpayIpn(req.query));
}));

export default router;
