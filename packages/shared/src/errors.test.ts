import { describe, it, expect } from 'vitest';
import { ErrorCode } from './errors';

describe('ErrorCode', () => {
  it('includes UNAUTHORIZED and INTERNAL alongside the existing codes', () => {
    expect(ErrorCode.options).toEqual([
      'NODE_NOT_FOUND',
      'NODE_GONE',
      'NAME_CONFLICT',
      'INVALID_MOVE',
      'SHARE_REVOKED',
      'UPLOAD_EXPIRED',
      'FORBIDDEN',
      'VALIDATION_FAILED',
      'UNAUTHORIZED',
      'INTERNAL',
    ]);
  });
});
