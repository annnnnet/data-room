import { z } from 'zod';

export const ErrorCode = z.enum([
  'NODE_NOT_FOUND',
  'NODE_GONE',
  'NAME_CONFLICT',
  'INVALID_MOVE',
  'SHARE_REVOKED',
  'UPLOAD_EXPIRED',
  'FORBIDDEN',
  'VALIDATION_FAILED',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const apiErrorSchema = z.object({
  code: ErrorCode,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;
