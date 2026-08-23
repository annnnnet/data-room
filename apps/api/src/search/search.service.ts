import { Injectable } from '@nestjs/common';
import { encodeCursor, decodeCursor, type SearchQuery, type SearchHit } from '@data-room/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/api-error';
import { toNodeDto } from '../nodes/node.mapper';
import type { Principal } from '../auth/auth.guard';

const INCLUDE = {
  currentVersion: { select: { sizeBytes: true, mimeType: true } },
  _count: { select: { versions: true } },
} as const;

/** Matches the Prisma schema's declared enum order — FOLDER sorts before FILE. */
const TYPE_ORDER = ['FOLDER', 'FILE'] as const;

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    // AccessService.resolve() only checks a single node — search needs the
    // *set* of subtrees a caller can see, so the scope is computed here
    // directly rather than reused from AccessService.
  ) {}

  /**
   * Scope resolution first: an owner searches the whole room, a viewer
   * searches only the subtrees they hold a live share on. Both collapse to
   * a set of materialized-path prefixes, so the query stays one indexed
   * statement rather than a per-row permission check. A caller with no
   * access to the room at all — stranger, anonymous, or a share on some
   * other room — gets the same 404 NODE_NOT_FOUND an unknown room id would,
   * never an empty result set and never 403 (which would confirm the room
   * exists).
   */
  private async scopePrefixes(principal: Principal, dataRoomId: string): Promise<string[]> {
    const room = await this.prisma.dataRoom.findUnique({
      where: { id: dataRoomId },
      include: { nodes: { where: { parentId: null }, select: { path: true } } },
    });
    if (!room || room.nodes.length === 0) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);

    if (principal.kind === 'user' && principal.userId === room.ownerId) {
      return [room.nodes[0].path];
    }
    // A missing/empty shareToken must never fall through as `token:
    // undefined` in the Prisma query below — that would omit the filter
    // entirely and match "any live share in the room" instead of "this
    // caller's share". Reject up front, same discipline as
    // AccessService.resolve.
    if (principal.kind === 'anonymous' || (principal.kind === 'link' && !principal.shareToken)) {
      throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
    }

    const shares = await this.prisma.share.findMany({
      where: {
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        node: { dataRoomId, deletedAt: null },
        ...(principal.kind === 'user'
          ? { granteeUserId: principal.userId }
          : { token: principal.shareToken }),
      },
      include: { node: { select: { path: true } } },
    });
    if (shares.length === 0) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
    return shares.map((s) => s.node.path);
  }

  async search(
    principal: Principal,
    input: SearchQuery,
  ): Promise<{ items: SearchHit[]; nextCursor: string | null }> {
    const prefixes = await this.scopePrefixes(principal, input.dataRoomId);
    const limit = Math.min(input.limit ?? 20, 50);

    let cursor = null as ReturnType<typeof decodeCursor>;
    if (input.cursor) {
      cursor = decodeCursor(input.cursor);
      if (!cursor) throw new AppError('VALIDATION_FAILED', 'Invalid cursor', 400);
    }
    const after = cursor
      ? {
          OR: [
            { type: { in: TYPE_ORDER.slice(TYPE_ORDER.indexOf(cursor.type) + 1) } },
            { type: cursor.type, name: { gt: cursor.name } },
            { type: cursor.type, name: cursor.name, id: { gt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.node.findMany({
      where: {
        dataRoomId: input.dataRoomId,
        deletedAt: null,
        // The room root itself is never a hit — it has no parent.
        parentId: { not: null },
        name: { contains: input.q, mode: 'insensitive' },
        AND: [
          // Access scoping happens in the query itself: a row must fall
          // under one of the caller's granted path prefixes. Never fetch
          // matches unscoped and filter afterwards in JS — that leaks
          // through pagination and count.
          { OR: prefixes.map((p) => ({ path: { startsWith: p } })) },
          // A FILE with a null currentVersionId is a half-uploaded
          // (PENDING) file and must stay invisible, same as NodesService.children.
          { OR: [{ type: 'FOLDER' }, { type: 'FILE', currentVersionId: { not: null } }] },
          after,
        ],
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: INCLUDE,
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];

    // One extra query resolves every ancestor label in the result set,
    // instead of N+1 breadcrumb lookups.
    const ancestorSet = new Set(items.flatMap((r) => r.path.split('/').filter(Boolean)));
    const labels = await this.prisma.node.findMany({
      where: { id: { in: [...ancestorSet] } },
      select: { id: true, name: true },
    });
    const byId = new Map(labels.map((l) => [l.id, l.name]));

    return {
      items: items.map((r) => ({
        ...toNodeDto(r),
        // Ancestor ids between the room root and the node itself, excluding
        // both — e.g. root/Legal/Contracts/nda.pdf -> "Legal / Contracts".
        breadcrumbLabel: r.path
          .split('/')
          .filter(Boolean)
          .slice(1, -1)
          .map((id) => byId.get(id) ?? '…')
          .join(' / '),
      })),
      nextCursor:
        hasMore && last ? encodeCursor({ type: last.type, name: last.name, id: last.id }) : null,
    };
  }
}
