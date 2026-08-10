import pino from 'pino';
import { env } from '../../config/env';
import { toSafeErrorLog } from '../utils/safe-log';

const sensitiveKeyPattern = /(?:password|token|secret|authorization|cookie|identity_number|citizen_id|cccd|signed_url|file_url)/i;
const sensitiveUrlPattern = /(?:https:\/\/(?:res|api)\.cloudinary\.com\/|\/api\/documents\/delivery\/)/i;

export type LogBindings = Record<string, unknown>;

export const sanitizeLogValue = (value: unknown, seen = new WeakSet<object>()): unknown => {
  if (typeof value === 'string') {
    return sensitiveUrlPattern.test(value) ? '[REDACTED_URL]' : value;
  }
  if (value instanceof Error) return toSafeErrorLog(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeLogValue(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';

  seen.add(value);
  const sanitized = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeyPattern.test(key) ? '[REDACTED]' : sanitizeLogValue(item, seen)
    ])
  );
  seen.delete(value);
  return sanitized;
};

const pinoLogger = pino({
  name: 'rent-apartment-api',
  level: env.LOG_LEVEL,
  base: {
    service: 'rent-apartment-api',
    environment: env.APP_ENV,
    applicationVersion: env.APP_VERSION
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label })
  }
});

const write = (level: 'debug' | 'info' | 'warn' | 'error', bindings: LogBindings, message: string): void => {
  pinoLogger[level](sanitizeLogValue(bindings) as LogBindings, message);
};

export const logger = {
  debug: (bindings: LogBindings, message: string): void => write('debug', bindings, message),
  info: (bindings: LogBindings, message: string): void => write('info', bindings, message),
  warn: (bindings: LogBindings, message: string): void => write('warn', bindings, message),
  error: (bindings: LogBindings, message: string): void => write('error', bindings, message),
  flush: (): void => pinoLogger.flush()
};
