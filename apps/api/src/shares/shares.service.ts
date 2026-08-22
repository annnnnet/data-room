import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AppError } from '../common/api-error';
import type { Principal } from '../auth/auth.guard';
import type { CreateShareInput, ShareContext, ShareDto } from '@data-room/shared';

@Injectable()
export class SharesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  private toDto(s: any): ShareDto {
    return {
      id: s.id,
      nodeId: s.nodeId,
      kind: s.kind,
      token: s.token,
      granteeEmail: s.granteeEmail,
      granteeName: s.granteeUser?.name ?? null,
      role: s.role,
      expiresAt: s.expiresAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
    };
  }

  async list(principal: Principal, nodeId: string): Promise<ShareDto[]> {
    await this.access.requireOwner(principal, nodeId);
    const rows = await this.prisma.share.findMany({
      where: { nodeId, revokedAt: null },
      include: { granteeUser: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((s) => this.toDto(s));
  }

  async create(principal: Principal, nodeId: string, input: CreateShareInput): Promise<ShareDto> {
    await this.access.requireOwner(principal, nodeId);
    const userId = (principal as { userId: string }).userId;

    if (input.kind === 'USER' && !input.email) {
      throw new AppError('VALIDATION_FAILED', 'An email is required for a permissioned share', 400);
    }

    // An invited email may not have signed up yet — granteeUserId fills in
    // on their first sign-in via UserService.reconcilePendingShares.
    const grantee = input.email
      ? await this.prisma.user.findUnique({ where: { email: input.email } })
      : null;

    const share = await this.prisma.share.create({
      data: {
        nodeId,
        kind: input.kind,
        // A link token is a credential: anyone holding it reads the whole
        // subtree, so it must come from a CSPRNG at a length that makes
        // guessing infeasible, never derived from the node id, name, or
        // time. 32 random bytes (256 bits) base64url-encoded.
        token: input.kind === 'LINK' ? randomBytes(32).toString('base64url') : null,
        granteeEmail: input.email ?? null,
        granteeUserId: grantee?.id ?? null,
        role: 'VIEWER',
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdById: userId,
      },
      include: { granteeUser: true },
    });
    return this.toDto(share);
  }

  async revoke(principal: Principal, shareId: string): Promise<{ ok: true }> {
    const share = await this.prisma.share.findUnique({ where: { id: shareId } });
    if (!share) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
    await this.access.requireOwner(principal, share.nodeId);
    await this.prisma.share.update({ where: { id: shareId }, data: { revokedAt: new Date() } });
    return { ok: true as const };
  }

  /** Powers the /s/[token] landing page before any node id is known. */
  async context(token: string): Promise<ShareContext> {
    const share = await this.prisma.share.findFirst({
      where: {
        token,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { node: { include: { dataRoom: true } } },
    });
    if (!share) throw new AppError('SHARE_REVOKED', 'This link is no longer active', 404);
    if (share.node.deletedAt) {
      throw new AppError('NODE_GONE', 'This item was deleted by the owner', 410);
    }
    return {
      rootNodeId: share.node.id,
      nodeName: share.node.name,
      dataRoomName: share.node.dataRoom.name,
    };
  }
}
