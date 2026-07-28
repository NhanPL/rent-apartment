import type { Request } from 'express';
import {
  ipKeyGenerator,
  rateLimit
} from 'express-rate-limit';
import { env } from './env';

interface RateLimitPolicy {
  windowMinutes: number;
  max: number;
  code: string;
  message: string;
  keyGenerator?: (request: Request) => string;
}

const minutes = (value: number): number => value * 60 * 1000;

export const createRateLimitMiddleware = ({
  windowMinutes,
  max,
  code,
  message,
  keyGenerator
}: RateLimitPolicy) => rateLimit({
  windowMs: minutes(windowMinutes),
  limit: max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator,
  handler: (_request, response) => {
    response.status(429).json({ code, message });
  }
});

const authenticatedUserOrIp = (request: Request): string => (
  request.auth?.userId
  ?? ipKeyGenerator(request.ip ?? request.socket.remoteAddress ?? 'unknown')
);

export const globalRateLimit = createRateLimitMiddleware({
  windowMinutes: env.RATE_LIMIT_GLOBAL_WINDOW_MINUTES,
  max: env.RATE_LIMIT_GLOBAL_MAX,
  code: 'GLOBAL_RATE_LIMIT_EXCEEDED',
  message: 'Too many requests. Please wait and try again.'
});

export const loginRateLimit = createRateLimitMiddleware({
  windowMinutes: env.RATE_LIMIT_LOGIN_WINDOW_MINUTES,
  max: env.RATE_LIMIT_LOGIN_MAX,
  code: 'LOGIN_RATE_LIMIT_EXCEEDED',
  message: 'Too many login attempts. Please wait and try again.'
});

export const refreshRateLimit = createRateLimitMiddleware({
  windowMinutes: env.RATE_LIMIT_REFRESH_WINDOW_MINUTES,
  max: env.RATE_LIMIT_REFRESH_MAX,
  code: 'REFRESH_RATE_LIMIT_EXCEEDED',
  message: 'Too many session refresh requests. Please wait and try again.'
});

export const passwordResetRateLimit = createRateLimitMiddleware({
  windowMinutes: env.RATE_LIMIT_PASSWORD_RESET_WINDOW_MINUTES,
  max: env.RATE_LIMIT_PASSWORD_RESET_MAX,
  code: 'PASSWORD_RESET_RATE_LIMIT_EXCEEDED',
  message: 'Too many password reset requests. Please wait and try again.'
});

export const uploadSignatureRateLimit = createRateLimitMiddleware({
  windowMinutes: env.RATE_LIMIT_UPLOAD_SIGNATURE_WINDOW_MINUTES,
  max: env.RATE_LIMIT_UPLOAD_SIGNATURE_MAX,
  code: 'UPLOAD_SIGNATURE_RATE_LIMIT_EXCEEDED',
  message: 'Too many upload requests. Please wait and try again.',
  keyGenerator: authenticatedUserOrIp
});

export const paymentProofRateLimit = createRateLimitMiddleware({
  windowMinutes: env.RATE_LIMIT_PAYMENT_PROOF_WINDOW_MINUTES,
  max: env.RATE_LIMIT_PAYMENT_PROOF_MAX,
  code: 'PAYMENT_PROOF_RATE_LIMIT_EXCEEDED',
  message: 'Too many payment proof submissions. Please wait and try again.',
  keyGenerator: authenticatedUserOrIp
});
