import { PipeTransform, Injectable } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { AppError } from './api-error';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError('VALIDATION_FAILED', 'Invalid request body', 400, {
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
