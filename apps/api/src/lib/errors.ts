export interface AppErrorOptions {
  statusCode?: number
  code?: string
  cause?: unknown
}

export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    this.statusCode = opts.statusCode ?? 500
    this.code = opts.code ?? 'INTERNAL_ERROR'
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' })
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED' })
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' })
    this.name = 'ForbiddenError'
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict', code = 'CONFLICT') {
    super(message, { statusCode: 409, code })
    this.name = 'ConflictError'
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', code = 'VALIDATION_ERROR') {
    super(message, { statusCode: 400, code })
    this.name = 'ValidationError'
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, { statusCode: 429, code: 'RATE_LIMITED' })
    this.name = 'RateLimitedError'
  }
}
