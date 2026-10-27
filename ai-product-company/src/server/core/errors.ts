/** Domain errors. Each one carries whether a retry could help. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
    readonly retryable = false,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`${what} not found`, 'NOT_FOUND', 404);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION', 422);
  }
}

export class PermissionDeniedError extends AppError {
  constructor(message: string) {
    super(message, 'PERMISSION_DENIED', 403);
  }
}

/** Thrown when a capability needs an external connector that is not configured. Never retried. */
export class IntegrationRequiredError extends AppError {
  constructor(readonly integration: string, message: string) {
    super(`INTEGRATION_REQUIRED [${integration}]: ${message}`, 'INTEGRATION_REQUIRED', 424);
  }
}

/** Transient failure (network, rate limit, overloaded) — safe to retry. */
export class TransientError extends AppError {
  constructor(message: string) {
    super(message, 'TRANSIENT', 503, true);
  }
}

export class BudgetExceededError extends AppError {
  constructor(message: string) {
    super(message, 'BUDGET_EXCEEDED', 429);
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof AppError) return err.retryable;
  // Unknown errors (bugs, malformed model output…) get a bounded retry.
  return true;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
