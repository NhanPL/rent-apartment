import { Router } from 'express';
import { requireRole } from '../../shared/middleware/auth';
import { asyncHandler } from '../../shared/middleware/async-handler';
import {
  approveUtilityReading,
  attachUtilityReadingEvidence,
  createUtilityReading,
  getUtilityReadingById,
  listUtilityReadings,
  rejectUtilityReading
} from './utility-readings.service';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const roomId = req.query.roomId as string | undefined;
  res.json(await listUtilityReadings(roomId));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  res.json(await getUtilityReadingById(req.params.id));
}));

router.post('/', requireRole('TENANT'), asyncHandler(async (req, res) => {
  res.status(201).json(await createUtilityReading(req.body, req.auth!.userId));
}));

router.post('/:id/evidence', asyncHandler(async (req, res) => {
  res.status(201).json(await attachUtilityReadingEvidence(req.params.id, req.body, req.auth!.userId));
}));

router.post('/:id/approve', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await approveUtilityReading(req.params.id, req.auth!.userId));
}));

router.post('/:id/reject', requireRole('MANAGER'), asyncHandler(async (req, res) => {
  res.json(await rejectUtilityReading(req.params.id, req.auth!.userId, req.body.reason));
}));

export default router;
