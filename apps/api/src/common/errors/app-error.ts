export type ErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "AUTH_ERROR"
  | "TRANSIENT_PROVIDER_ERROR"
  | "PERMANENT_FILE_ERROR"
  | "INTERNAL_ERROR";

/**
 * Base class for all errors that should be translated into a structured
 * HTTP response. Anything else thrown is treated as an unexpected 500.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = "The request payload is invalid.", details?: unknown) {
    super("VALIDATION_ERROR", 400, message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super("NOT_FOUND", 404, id ? `${resource} "${id}" was not found.` : `${resource} was not found.`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", 409, message);
  }
}

/** Expired/invalid credentials, revoked share access, etc. */
export class AuthError extends AppError {
  constructor(message = "The connection's credentials are no longer valid.") {
    super("AUTH_ERROR", 401, message);
  }
}

/** Network timeout, rate limiting, transient 5xx from a provider — safe to retry. */
export class TransientProviderError extends AppError {
  constructor(message = "The provider is temporarily unavailable.") {
    super("TRANSIENT_PROVIDER_ERROR", 502, message);
  }
}

/** File deleted at source, quota exceeded, corrupt read — not retryable. */
export class PermanentFileError extends AppError {
  constructor(message: string) {
    super("PERMANENT_FILE_ERROR", 422, message);
  }
}
