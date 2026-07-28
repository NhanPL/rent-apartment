import helmet, { type HelmetOptions } from 'helmet';
import { env, type AppEnvironment } from './env';

const cloudinaryApi = 'https://api.cloudinary.com';
const cloudinaryAssets = 'https://res.cloudinary.com';

export const buildSecurityHeadersOptions = (
  appEnvironment: AppEnvironment,
  vietQrImageBaseUrl = env.VIETQR_IMAGE_BASE_URL
): HelmetOptions => {
  const isProduction = appEnvironment === 'production';
  const vietQrAssets = new URL(vietQrImageBaseUrl).origin;

  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", cloudinaryApi],
        fontSrc: ["'self'", 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', cloudinaryAssets, vietQrAssets],
        mediaSrc: ["'self'", cloudinaryAssets],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: isProduction ? [] : null
      }
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    hsts: isProduction
      ? {
          maxAge: 31_536_000,
          includeSubDomains: false,
          preload: false
        }
      : false,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
  };
};

export const securityHeaders = helmet(buildSecurityHeadersOptions(env.APP_ENV));
