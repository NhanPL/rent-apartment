import { Router } from 'express';
import { asyncHandler } from '../../shared/middleware/async-handler';

const router = Router();

// Storage abstraction placeholder: client uploads file elsewhere and sends metadata/url.
router.post('/metadata', asyncHandler(async (req, res) => {
  res.status(201).json({
    file_name: req.body.file_name ?? null,
    file_url: req.body.file_url,
    mime_type: req.body.mime_type ?? null,
    file_size: req.body.file_size ?? null,
    note: 'Metadata accepted; actual storage integration can be added later.'
  });
}));

export default router;
