import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ErrorCode } from '@data-room/shared';

function statusToCode(status: number): ErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NODE_NOT_FOUND';
    case 400:
    case 422:
      return 'VALIDATION_FAILED';
    default:
      return 'INTERNAL';
  }
}

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();

    if (err instanceof AppError) {
      return res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
    if (err instanceof HttpException) {
      const status = err.getStatus();
      return res.status(status).json({ code: statusToCode(status), message: err.message });
    }
    this.logger.error(err);
    return res.status(500).json({ code: 'INTERNAL', message: 'Internal error' });
  }
}
