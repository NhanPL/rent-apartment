import type { RequestHandler } from 'express';
import { asyncHandler } from './async-handler';
import { assertFeatureEnabled, type FeatureKey } from '../../modules/feature-flags/feature-flags.service';

export const requireFeatureFlag = (key: FeatureKey): RequestHandler => asyncHandler(async (req, _res, next) => {
  await assertFeatureEnabled(req.auth!.userId, key);
  next();
});
