import type { CookieOptions, Request, Response } from 'express';
import { env } from '../../config/env';

type AppEnvironment = typeof env.APP_ENV;
type SameSitePolicy = 'strict' | 'lax' | 'none';

export const resolveRefreshCookiePolicy = (
  appEnvironment: AppEnvironment,
  sameSiteOverride?: SameSitePolicy
): { secure: boolean; sameSite: SameSitePolicy } => {
  const secure = appEnvironment === 'staging' || appEnvironment === 'production';
  return {
    secure,
    sameSite: sameSiteOverride ?? (secure ? 'none' : 'lax')
  };
};

const cookiePolicy = resolveRefreshCookiePolicy(
  env.APP_ENV,
  env.REFRESH_COOKIE_SAME_SITE
);

const cookieOptions = (maxAge?: number): CookieOptions => ({
  httpOnly: true,
  secure: cookiePolicy.secure,
  sameSite: cookiePolicy.sameSite,
  path: '/api/auth',
  ...(env.REFRESH_COOKIE_DOMAIN ? { domain: env.REFRESH_COOKIE_DOMAIN } : {}),
  ...(maxAge === undefined ? {} : { maxAge })
});

const parseCookies = (header: string | undefined): Record<string, string> => {
  if (!header) return {};
  return header.split(';').reduce<Record<string, string>>((cookies, item) => {
    const separator = item.indexOf('=');
    if (separator < 0) return cookies;
    const name = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (!name) return cookies;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});
};

export const getRefreshTokenCookie = (req: Request): string | null => (
  parseCookies(req.header('cookie'))[env.REFRESH_COOKIE_NAME] ?? null
);

export const setRefreshTokenCookie = (
  res: Response,
  refreshToken: string,
  expiresAt: Date
): void => {
  const maxAge = Math.max(0, expiresAt.getTime() - Date.now());
  res.cookie(env.REFRESH_COOKIE_NAME, refreshToken, cookieOptions(maxAge));
};

export const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(env.REFRESH_COOKIE_NAME, cookieOptions());
};
