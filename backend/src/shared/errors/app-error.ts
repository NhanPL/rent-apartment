export type FieldErrors = Record<string, string[]>;

const defaultCodeForStatus = (statusCode: number): string => {
  switch (statusCode) {
    case 400: return 'BAD_REQUEST';
    case 401: return 'UNAUTHORIZED';
    case 403: return 'FORBIDDEN';
    case 404: return 'NOT_FOUND';
    case 409: return 'CONFLICT';
    case 410: return 'GONE';
    case 413: return 'PAYLOAD_TOO_LARGE';
    case 429: return 'RATE_LIMITED';
    default: return statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED';
  }
};

export class AppError extends Error {
  public readonly code: string;
  public readonly fieldErrors: FieldErrors | null;

  constructor(
    public statusCode: number,
    message: string,
    code?: string,
    fieldErrors: FieldErrors | null = null
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code ?? defaultCodeForStatus(statusCode);
    this.fieldErrors = fieldErrors;
  }
}
