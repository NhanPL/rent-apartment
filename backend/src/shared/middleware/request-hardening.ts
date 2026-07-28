import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';

export const rejectDirectFileUploads = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (req.is('multipart/form-data')) {
    next(new AppError(
      415,
      'Direct file uploads are not supported. Request a signed Cloudinary upload instead.',
      'DIRECT_FILE_UPLOAD_NOT_SUPPORTED'
    ));
    return;
  }

  next();
};
