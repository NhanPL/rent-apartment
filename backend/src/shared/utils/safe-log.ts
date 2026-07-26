const SENSITIVE_FIELD = '(?:currentPassword|newPassword|confirmPassword|password)';
const QUOTED_SENSITIVE_VALUE_PATTERN = new RegExp(
  `(["']?${SENSITIVE_FIELD}["']?\\s*[:=]\\s*)(["'])(.*?)\\2`,
  'gi'
);
const UNQUOTED_SENSITIVE_VALUE_PATTERN = new RegExp(
  `(["']?${SENSITIVE_FIELD}["']?\\s*[:=]\\s*)([^,}\\s]+)`,
  'gi'
);

const redactSensitiveValues = (message: string): string => (
  message
    .replace(QUOTED_SENSITIVE_VALUE_PATTERN, '$1$2[REDACTED]$2')
    .replace(UNQUOTED_SENSITIVE_VALUE_PATTERN, '$1[REDACTED]')
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
