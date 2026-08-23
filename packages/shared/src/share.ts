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

export const createShareSchema = z
  .object({
    kind: ShareKind,
    email: z.string().email().optional(),
    expiresAt: z.string().datetime().optional(),
  })
  .superRefine((data, ctx) => {
    // A LINK share's credential is the token itself — anyone holding it
    // gets access. Also naming a grantee email would produce a share
    // AccessService matches on *either* credential (see
    // AccessService.resolve), letting the named person in even without the
    // token. Reject the combination outright rather than silently ignoring
    // one half of it.
    if (data.kind === 'LINK' && data.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['email'],
        message: 'A LINK share cannot also be addressed to a grantee email',
      });
    }
    if (data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt must be in the future',
      });
    }
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
