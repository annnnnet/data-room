import { Injectable, PipeTransform } from '@nestjs/common';
import { AppError } from './api-error';

/**
 * Nest's built-in ParseIntPipe accepts negative integers (and zero) — fine
 * for most route params, but a version number is 1-based, so `-1` or `0`
 * would otherwise sail through into a query that Prisma can only reject
 * with a raw "not found".
 */
@Injectable()
export class ParsePositiveIntPipe implements PipeTransform {
  transform(value: string): number {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) {
      throw new AppError('VALIDATION_FAILED', 'Must be a positive integer', 400);
    }
    return n;
  }
}
