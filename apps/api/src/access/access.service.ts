import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/api-error';
import { ancestorIds } from '../common/path.util';
import type { Principal } from '../auth/auth.guard';

export type AccessNode = {
  id: string;
  dataRoomId: string;
  path: string;
  parentId: string | null;
  type: 'FOLDER' | 'FILE';
  name: string;
  deletedAt: Date | null;
};

export type Access = { node: AccessNode; role: 'OWNER' | 'VIEWER' };

@Injectable()
export class AccessService {
  constructor(private prisma: PrismaService) {}

  /**
   * A missing node and an inaccessible node are indistinguishable to the
   * caller by design: 403 would confirm the id exists.
   */
  async resolve(principal: Principal, nodeId: string): Promise<Access> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { dataRoom: { select: { ownerId: true } } },
    });
    if (!node) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);

    const isOwner = principal.kind === 'user' && principal.userId === node.dataRoom.ownerId;

    let role: 'OWNER' | 'VIEWER' | null = isOwner ? 'OWNER' : null;

    if (!role && principal.kind !== 'anonymous') {
      const scope = [...ancestorIds(node.path), node.id];
      const shares = await this.prisma.share.findMany({
        where: {
          nodeId: { in: scope },
          revokedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          ...(principal.kind === 'user'
            ? { granteeUserId: principal.userId }
            : { token: principal.shareToken }),
        },
        select: { role: true },
      });
      if (shares.length > 0) role = 'VIEWER';
    }

    if (!role) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
    if (node.deletedAt) throw new AppError('NODE_GONE', 'This item was deleted by the owner', 410);

    return { node, role };
  }

  async requireOwner(principal: Principal, nodeId: string): Promise<Access> {
    const access = await this.resolve(principal, nodeId);
    if (access.role !== 'OWNER') {
      throw new AppError('FORBIDDEN', 'Read-only access', 403);
    }
    return access;
  }
}
