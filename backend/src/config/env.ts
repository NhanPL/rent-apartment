import dotenv from 'dotenv';
import { z } from 'zod';

const initialAppEnvironment = process.env.APP_ENV
  ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development');
if (initialAppEnvironment !== 'production' && initialAppEnvironment !== 'staging') {
  dotenv.config();
}

const optionalString = z.string().optional().default('');
const optionalEmail = z.union([z.string().email(), z.literal('')]).optional().default('');
const defaultAppEnv = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const optionalSameSite = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.enum(['strict', 'lax', 'none']).optional()
);
const optionalProxyHops = z.preprocess(
  (value) => value === '' || value === undefined ? undefined : value,
  z.coerce.number().int().min(0).max(10).optional()
);

export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';
export const JWT_SECRET_MIN_LENGTH = 32;
const JWT_SECRET_PLACEHOLDER = /^(change-me|replace-with-|<)/i;

export const assertSecureJwtSecrets = (accessSecret: string, refreshSecret: string): void => {
  if (accessSecret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(`JWT_ACCESS_SECRET must contain at least ${JWT_SECRET_MIN_LENGTH} characters`);
  }
  if (refreshSecret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(`JWT_REFRESH_SECRET must contain at least ${JWT_SECRET_MIN_LENGTH} characters`);
  }
  if (JWT_SECRET_PLACEHOLDER.test(accessSecret)) {
    throw new Error('JWT_ACCESS_SECRET must not use an example placeholder');
  }
  if (JWT_SECRET_PLACEHOLDER.test(refreshSecret)) {
    throw new Error('JWT_REFRESH_SECRET must not use an example placeholder');
  }
  if (accessSecret === refreshSecret) {
    throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }
};

export const resolveDatabaseTlsSettings = (
  appEnvironment: AppEnvironment,
  databaseUrl: string,
  configuredSsl?: 'true' | 'false',
  configuredRejectUnauthorized?: 'true' | 'false'
): { dbSsl: 'true' | 'false'; rejectUnauthorized: 'true' | 'false' } => {
  const isDeployed = appEnvironment === 'staging' || appEnvironment === 'production';
  const isSupabaseHost = (() => {
    try {
      return new URL(databaseUrl).hostname.endsWith('.supabase.co');
    } catch {
      return false;
    }
  })();
  const dbSsl = configuredSsl ?? (isDeployed || isSupabaseHost ? 'true' : 'false');
  const rejectUnauthorized = configuredRejectUnauthorized ?? (dbSsl === 'true' ? 'true' : 'false');

  if (isDeployed && dbSsl !== 'true') {
    throw new Error(`DB_SSL must be true when APP_ENV=${appEnvironment}`);
  }
  if (isDeployed && rejectUnauthorized !== 'true') {
    throw new Error(
      `DB_SSL_REJECT_UNAUTHORIZED must be true when APP_ENV=${appEnvironment}`
    );
  }
  if (dbSsl === 'false' && rejectUnauthorized === 'true') {
    throw new Error('DB_SSL_REJECT_UNAUTHORIZED cannot be true when DB_SSL is false');
  }

  return { dbSsl, rejectUnauthorized };
};

export const resolveCorsAllowedOrigins = (
  appEnvironment: AppEnvironment,
  configuredOrigins: string
): string => {
  const configured = configuredOrigins.trim();
  if (configured) return configured;
  if (appEnvironment === 'development' || appEnvironment === 'test') {
    return 'http://localhost:5173';
  }
  throw new Error(
    `CORS_ALLOWED_ORIGINS is required when APP_ENV=${appEnvironment}`
  );
};

export const resolveTrustProxyHops = (
  appEnvironment: AppEnvironment,
  configuredHops?: number
): number => {
  if (configuredHops !== undefined) return configuredHops;
  if (appEnvironment === 'development' || appEnvironment === 'test') return 0;
  throw new Error(
    `TRUST_PROXY_HOPS is required when APP_ENV=${appEnvironment}`
  );
};

export const resolveDocumentDeliveryBaseUrl = (
  appEnvironment: AppEnvironment,
  configuredUrl: string
): string => {
  const configured = configuredUrl.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (appEnvironment === 'development' || appEnvironment === 'test') return '';
  throw new Error(
    `DOCUMENT_DELIVERY_BASE_URL is required when APP_ENV=${appEnvironment}`
  );
};

export interface OpenApiDocsSettings {
  enabled: boolean;
  requireBasicAuth: boolean;
  username: string;
  password: string;
}

export const resolveOpenApiDocsSettings = (
  appEnvironment: AppEnvironment,
  configuredEnabled?: 'true' | 'false',
  username = '',
  password = ''
): OpenApiDocsSettings => {
  const enabled = configuredEnabled
    ? configuredEnabled === 'true'
    : appEnvironment === 'development' || appEnvironment === 'staging';
  const requireBasicAuth = appEnvironment === 'production' && enabled;

  if (requireBasicAuth && (!username.trim() || password.length < 16)) {
    throw new Error(
      'Production OpenAPI docs require OPENAPI_DOCS_USERNAME and an OPENAPI_DOCS_PASSWORD of at least 16 characters'
    );
  }

  return { enabled, requireBasicAuth, username: username.trim(), password };
};

export interface SmtpSettings {
  enabled: boolean;
  host: string;
  user: string;
  password: string;
  fromEmail: string;
}

export const resolveSmtpSettings = (input: {
  enabled: 'true' | 'false';
  host: string;
  user: string;
  password: string;
  fromEmail: string;
}): SmtpSettings => {
  const values = [input.host, input.user, input.password, input.fromEmail];
  const hasAnyCredentials = values.some((value) => value.trim().length > 0);
  if (input.enabled === 'false' && hasAnyCredentials) {
    throw new Error('SMTP_ENABLED must be true when SMTP credentials are configured');
  }
  if (input.enabled === 'true' && values.some((value) => value.trim().length === 0)) {
    throw new Error(
      'SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM_EMAIL are required when SMTP_ENABLED=true'
    );
  }
  return {
    enabled: input.enabled === 'true',
    host: input.host.trim(),
    user: input.user.trim(),
    password: input.password,
    fromEmail: input.fromEmail.trim()
  };
};

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default(defaultAppEnv),
  APP_VERSION: z.string().trim().min(1).max(100).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .optional(),
  SENTRY_DSN: z.union([z.string().trim().url(), z.literal('')]).optional().default(''),
  METRICS_ALERT_MIN_REQUESTS: z.coerce.number().int().min(1).default(20),
  METRICS_ALERT_ERROR_RATE_PERCENT: z.coerce.number().min(0).max(100).default(10),
  METRICS_ALERT_LATENCY_MS: z.coerce.number().int().min(1).default(2000),
  METRICS_ALERT_DB_POOL_PERCENT: z.coerce.number().min(1).max(100).default(90),
  METRICS_ALERT_LOGIN_FAILURES: z.coerce.number().int().min(1).default(10),
  METRICS_ALERT_COOLDOWN_MINUTES: z.coerce.number().int().min(1).default(5),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(10000),
  READINESS_DB_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(2000),
  BACKGROUND_JOB_POLL_SECONDS: z.coerce.number().int().min(10).max(3600).default(60),
  EMAIL_OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  EMAIL_OUTBOX_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
  EMAIL_NOTIFICATIONS_ENABLED: z.enum(['true', 'false']).default('true'),
  PAYMENT_REMINDER_BEFORE_DAYS: z.coerce.number().int().min(0).max(30).default(3),
  PAYMENT_REMINDER_AFTER_DAYS: z.coerce.number().int().min(0).max(30).default(3),
  AUTH_TOKEN_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DB_SSL: z.enum(['true', 'false']).optional(),
  DB_SSL_REJECT_UNAUTHORIZED: z.enum(['true', 'false']).optional(),
  DB_SSL_CA: optionalString,
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  MFA_ENCRYPTION_SECRET: optionalString,
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  REFRESH_COOKIE_NAME: z.string().trim().min(1).default('rent_refresh_token'),
  REFRESH_COOKIE_DOMAIN: optionalString,
  REFRESH_COOKIE_SAME_SITE: optionalSameSite,
  SESSION_CLEANUP_INTERVAL_HOURS: z.coerce.number().int().min(1).max(168).default(6),
  SESSION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  ACCOUNT_ACTIVATION_EXPIRES_HOURS: z.coerce.number().int().min(1).max(168).default(48),
  PASSWORD_RESET_EXPIRES_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  PASSWORD_RESET_RATE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  PASSWORD_RESET_MAX_PER_IDENTIFIER: z.coerce.number().int().min(1).max(20).default(3),
  PASSWORD_RESET_MAX_PER_IP: z.coerce.number().int().min(1).max(100).default(10),
  TRUST_PROXY_HOPS: optionalProxyHops,
  RATE_LIMIT_GLOBAL_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().min(1).max(100000).default(300),
  RATE_LIMIT_LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().min(1).max(10000).default(10),
  RATE_LIMIT_REFRESH_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(5),
  RATE_LIMIT_REFRESH_MAX: z.coerce.number().int().min(1).max(10000).default(30),
  RATE_LIMIT_PASSWORD_RESET_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  RATE_LIMIT_PASSWORD_RESET_MAX: z.coerce.number().int().min(1).max(10000).default(10),
  RATE_LIMIT_UPLOAD_SIGNATURE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(1),
  RATE_LIMIT_UPLOAD_SIGNATURE_MAX: z.coerce.number().int().min(1).max(10000).default(30),
  RATE_LIMIT_PAYMENT_PROOF_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  RATE_LIMIT_PAYMENT_PROOF_MAX: z.coerce.number().int().min(1).max(10000).default(10),
  LOGIN_FAILURE_WINDOW_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  LOGIN_FAILURE_MAX_PER_IDENTIFIER: z.coerce.number().int().min(2).max(100).default(5),
  LOGIN_FAILURE_MAX_PER_IP: z.coerce.number().int().min(2).max(1000).default(20),
  LOGIN_LOCK_BASE_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
  LOGIN_LOCK_MAX_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  JSON_BODY_LIMIT_KB: z.coerce.number().int().min(16).max(1024).default(256),
  UPLOAD_MAX_TENANT_DOCUMENT_MB: z.coerce.number().int().min(1).max(50).default(10),
  UPLOAD_MAX_UTILITY_EVIDENCE_MB: z.coerce.number().int().min(1).max(20).default(5),
  UPLOAD_MAX_PAYMENT_PROOF_MB: z.coerce.number().int().min(1).max(20).default(5),
  UPLOAD_MAX_CONTRACT_DOCUMENT_MB: z.coerce.number().int().min(1).max(50).default(15),
  DOCUMENT_ACCESS_SECRET: optionalString,
  AUDIT_IP_HASH_SECRET: optionalString,
  DOCUMENT_DELIVERY_BASE_URL: z.union([z.string().trim().url(), z.literal('')]).optional().default(''),
  DOCUMENT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  DOCUMENT_JOB_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  DOCUMENT_JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(8),
  DOCUMENT_RECONCILIATION_INTERVAL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  TENANT_DOCUMENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(36500).default(3650),
  PAYMENT_PROOF_RETENTION_DAYS: z.coerce.number().int().min(1).max(36500).default(3650),
  UTILITY_EVIDENCE_RETENTION_DAYS: z.coerce.number().int().min(1).max(36500).default(730),
  CONTRACT_DOCUMENT_RETENTION_DAYS: z.coerce.number().int().min(1).max(36500).default(3650),
  FINANCIAL_RECORD_RETENTION_DAYS: z.coerce.number().int().min(1825).max(36500).default(3650),
  PRIVACY_POLICY_VERSION: z.string().trim().min(1).max(40).default('2026-08-06'),
  OPENAPI_DOCS_ENABLED: z.enum(['true', 'false']).optional(),
  OPENAPI_DOCS_USERNAME: optionalString,
  OPENAPI_DOCS_PASSWORD: optionalString,
  CORS_ALLOWED_ORIGINS: optionalString,
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  DEFAULT_BANK_CODE: z.string().optional(),
  DEFAULT_BANK_ACCOUNT_NO: z.string().optional(),
  DEFAULT_BANK_ACCOUNT_NAME: z.string().optional(),
  VIETQR_IMAGE_BASE_URL: z.string().trim().url().default('https://img.vietqr.io/image'),
  VIETQR_TEMPLATE: z.string().trim().min(1).default('compact2'),
  CLOUDINARY_CLOUD_NAME: z.string().trim().optional(),
  CLOUDINARY_API_KEY: z.string().trim().optional(),
  CLOUDINARY_API_SECRET: z.string().trim().optional(),
  CLOUDINARY_UPLOAD_ROOT_FOLDER: z.string().trim().default('rent-apartment'),
  SMTP_ENABLED: z.enum(['true', 'false']).default('false'),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_FROM_NAME: optionalString,
  SMTP_FROM_EMAIL: optionalEmail
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment variables: ${parsed.error.message}`);
}

assertSecureJwtSecrets(parsed.data.JWT_ACCESS_SECRET, parsed.data.JWT_REFRESH_SECRET);
if (
  (parsed.data.APP_ENV === 'staging' || parsed.data.APP_ENV === 'production')
  && parsed.data.MFA_ENCRYPTION_SECRET.length < JWT_SECRET_MIN_LENGTH
) {
  throw new Error(`MFA_ENCRYPTION_SECRET must contain at least ${JWT_SECRET_MIN_LENGTH} characters in deployed environments`);
}

const databaseTls = resolveDatabaseTlsSettings(
  parsed.data.APP_ENV,
  parsed.data.DATABASE_URL,
  parsed.data.DB_SSL,
  parsed.data.DB_SSL_REJECT_UNAUTHORIZED
);

const corsAllowedOrigins = resolveCorsAllowedOrigins(
  parsed.data.APP_ENV,
  parsed.data.CORS_ALLOWED_ORIGINS
);
const trustProxyHops = resolveTrustProxyHops(
  parsed.data.APP_ENV,
  parsed.data.TRUST_PROXY_HOPS
);
const documentDeliveryBaseUrl = resolveDocumentDeliveryBaseUrl(
  parsed.data.APP_ENV,
  parsed.data.DOCUMENT_DELIVERY_BASE_URL
);
const openApiDocs = resolveOpenApiDocsSettings(
  parsed.data.APP_ENV,
  parsed.data.OPENAPI_DOCS_ENABLED,
  parsed.data.OPENAPI_DOCS_USERNAME,
  parsed.data.OPENAPI_DOCS_PASSWORD
);
const smtp = resolveSmtpSettings({
  enabled: parsed.data.SMTP_ENABLED,
  host: parsed.data.SMTP_HOST,
  user: parsed.data.SMTP_USER,
  password: parsed.data.SMTP_PASS,
  fromEmail: parsed.data.SMTP_FROM_EMAIL
});

export const env = {
  ...parsed.data,
  LOG_LEVEL: parsed.data.LOG_LEVEL
    ?? (parsed.data.APP_ENV === 'test' ? 'silent' : parsed.data.APP_ENV === 'development' ? 'debug' : 'info'),
  DB_SSL: databaseTls.dbSsl,
  DB_SSL_REJECT_UNAUTHORIZED: databaseTls.rejectUnauthorized,
  DB_SSL_CA: parsed.data.DB_SSL_CA.replace(/\\n/g, '\n').trim(),
  CORS_ALLOWED_ORIGINS: corsAllowedOrigins,
  TRUST_PROXY_HOPS: trustProxyHops,
  DOCUMENT_DELIVERY_BASE_URL: documentDeliveryBaseUrl,
  OPENAPI_DOCS_ENABLED: openApiDocs.enabled,
  OPENAPI_DOCS_REQUIRE_AUTH: openApiDocs.requireBasicAuth,
  SMTP_ENABLED: smtp.enabled,
  SMTP_HOST: smtp.host,
  SMTP_USER: smtp.user,
  SMTP_PASS: smtp.password,
  SMTP_FROM_EMAIL: smtp.fromEmail,
  AUDIT_IP_HASH_SECRET: parsed.data.AUDIT_IP_HASH_SECRET || parsed.data.JWT_ACCESS_SECRET,
  MFA_ENCRYPTION_SECRET: parsed.data.MFA_ENCRYPTION_SECRET || parsed.data.JWT_REFRESH_SECRET
};
