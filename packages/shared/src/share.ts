import { z } from 'zod';

export const ShareKind = z.enum(['LINK', 'USER']);
export type ShareKind = z.infer<typeof ShareKind>;

export const shareDtoSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  kind: ShareKind,
  token: z.string().nullable(),
  granteeEmail: z.string().nullable(),
  granteeName: z.string().nullable(),
  role: z.literal('VIEWER'),
  expiresAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ShareDto = z.infer<typeof shareDtoSchema>;

export const createShareSchema = z.object({
  kind: ShareKind,
  email: z.string().email().optional(),
  expiresAt: z.string().datetime().optional(),
});
export type CreateShareInput = z.infer<typeof createShareSchema>;

/**
 * The token is the entire credential for an anonymous visitor, so it must be
 * present and a non-empty string. Prisma treats an `undefined` filter as
 * "omit this condition", which would turn a missing token into "match the
 * first live share in the database" — see AccessService for the same hazard.
 */
export const shareContextQuerySchema = z.object({
  token: z.string().min(1),
});

export const shareContextSchema = z.object({
  rootNodeId: z.string(),
  nodeName: z.string(),
  dataRoomName: z.string(),
});
export type ShareContext = z.infer<typeof shareContextSchema>;
