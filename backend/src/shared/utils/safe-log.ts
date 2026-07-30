const SENSITIVE_FIELD = '(?:currentPassword|newPassword|confirmPassword|password|file_url|signed_url|access_token|documentAccessToken)';
const QUOTED_SENSITIVE_VALUE_PATTERN = new RegExp(
  `(["']?${SENSITIVE_FIELD}["']?\\s*[:=]\\s*)(["'])(.*?)\\2`,
  'gi'
);
const UNQUOTED_SENSITIVE_VALUE_PATTERN = new RegExp(
  `(["']?${SENSITIVE_FIELD}["']?\\s*[:=]\\s*)([^,}\\s]+)`,
  'gi'
);
const CLOUDINARY_URL_PATTERN = /https:\/\/(?:res|api)[.]cloudinary[.]com\/[^\s"'<>]+/gi;
const DOCUMENT_DELIVERY_URL_PATTERN = /\/api\/documents\/delivery\/[A-Za-z0-9._-]+/gi;

const redactSensitiveValues = (message: string): string => (
  message
    .replace(QUOTED_SENSITIVE_VALUE_PATTERN, '$1$2[REDACTED]$2')
    .replace(UNQUOTED_SENSITIVE_VALUE_PATTERN, '$1[REDACTED]')
    .replace(CLOUDINARY_URL_PATTERN, '[REDACTED_CLOUDINARY_URL]')
    .replace(DOCUMENT_DELIVERY_URL_PATTERN, '/api/documents/delivery/[REDACTED]')
);

export interface SafeErrorLog {
  name: string;
  message: string;
}

export const toSafeErrorLog = (error: unknown): SafeErrorLog => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactSensitiveValues(error.message)
    };
  }

  return {
    name: 'UnknownError',
    message: 'An unexpected non-error value was thrown'
  };
};
