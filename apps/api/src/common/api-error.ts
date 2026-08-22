import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { ErrorCode } from '@data-room/shared';

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
      return res
        .status(err.getStatus())
        .json({ code: 'VALIDATION_FAILED', message: err.message });
    }
    this.logger.error(err);
    return res.status(500).json({ code: 'VALIDATION_FAILED', message: 'Internal error' });
  }
}
