import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/api-error';
import { ancestorIds } from '../common/path.util';
import { liveShareForPrincipal } from './share-scope';
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
  async resolve(
    principal: Principal,
    nodeId: string,
    opts?: { allowDeleted?: boolean },
  ): Promise<Access> {
    const node = await this.prisma.node.findUnique({
      where: { id: nodeId },
      include: { dataRoom: { select: { ownerId: true } } },
    });
    if (!node) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);

    const isOwner = principal.kind === 'user' && principal.userId === node.dataRoom.ownerId;

    let role: 'OWNER' | 'VIEWER' | null = isOwner ? 'OWNER' : null;

    if (!role && principal.kind !== 'anonymous') {
      // Defensive guard: if principal.kind were ever anything other than
      // 'user' here, it must be 'link', and a missing/empty shareToken must
      // never be allowed to fall through as `token: undefined` — in Prisma,
      // an `undefined` value on a where clause means "omit this filter",
      // which would degrade the query to "any live share on the subtree"
      // and grant every such caller VIEWER on everything shared.
      if (principal.kind === 'link' && !principal.shareToken) {
        throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
      }

      const scope = [...ancestorIds(node.path), node.id];
      const shares = await this.prisma.share.findMany({
        where: {
          nodeId: { in: scope },
          ...liveShareForPrincipal(principal),
        },
        select: { id: true },
        take: 1,
      });
      if (shares.length > 0) role = 'VIEWER';
    }

    if (!role) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
    // The role check MUST precede the deletedAt check: returning 410 before
    // confirming access would let a stranger learn the id exists (and was
    // deleted) purely from the ordering of errors, defeating the 404 disguise.
    //
    // `allowDeleted` lets an OWNER through regardless (e.g. revoking a
    // share on a soft-deleted node is legitimate — the deletion itself
    // doesn't need to be undone to manage who could see the content while
    // it existed). It never relaxes anything for a VIEWER: their access is
    // still cut off the moment the node is gone.
    if (node.deletedAt && !(opts?.allowDeleted && role === 'OWNER')) {
      throw new AppError('NODE_GONE', 'This item was deleted by the owner', 410);
    }

    const projectedNode: AccessNode = {
      id: node.id,
      dataRoomId: node.dataRoomId,
      path: node.path,
      parentId: node.parentId,
      type: node.type,
      name: node.name,
      deletedAt: node.deletedAt,
    };

    return { node: projectedNode, role };
  }

  async requireOwner(
    principal: Principal,
    nodeId: string,
    opts?: { allowDeleted?: boolean },
  ): Promise<Access> {
    const access = await this.resolve(principal, nodeId, opts);
    if (access.role !== 'OWNER') {
      throw new AppError('FORBIDDEN', 'Read-only access', 403);
    }
    return access;
  }
}
