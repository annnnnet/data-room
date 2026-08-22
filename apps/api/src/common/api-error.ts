import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    // A read-then-write race (assertNameFree passes, then two concurrent
    // creates/updates both attempt the same (parentId, lower(name)) pair)
    // can only be caught by the DB's unique index at write time. Translate
    // that specific violation into the same 409 NAME_CONFLICT contract the
    // pre-check gives the non-racing caller, instead of leaking it as a raw
    // 500. Keep this narrow to P2002 — every other Prisma error code (FK
    // violations, connection errors, etc.) must still fall through below.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return res.status(409).json({ code: 'NAME_CONFLICT', message: 'Name already exists' });
    }
    // P2025 is Prisma's "record required for this operation was not found"
    // (findFirstOrThrow/findUniqueOrThrow with no match, an update/delete
    // whose `where` matches nothing, ...). An unknown versionId or a
    // restore of a nonexistent version number both surface this way — map
    // it to the same 404 contract a manual existence check would give,
    // instead of letting it fall through as an opaque 500. Keep this narrow
    // to P2025 — every other Prisma error code must still fall through.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return res.status(404).json({ code: 'NODE_NOT_FOUND', message: 'Not found' });
    }
    if (err instanceof HttpException) {
      const status = err.getStatus();
      return res.status(status).json({ code: statusToCode(status), message: err.message });
    }
    this.logger.error(err);
    return res.status(500).json({ code: 'INTERNAL', message: 'Internal error' });
  }
}
