import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { encodeCursor, decodeCursor, type NodeDetail, type NodeStats } from '@data-room/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AppError } from '../common/api-error';
import { ancestorIds, subtreePrefix, buildPath, isSelfOrDescendant } from '../common/path.util';
import { nextAvailableName } from '../common/name.util';
import { toNodeDto } from './node.mapper';
import type { Principal } from '../auth/auth.guard';

const INCLUDE = {
  currentVersion: { select: { sizeBytes: true, mimeType: true } },
  _count: { select: { versions: true } },
} as const;

/** Matches the Prisma schema's declared enum order — FOLDER sorts before FILE. */
const TYPE_ORDER = ['FOLDER', 'FILE'] as const;

@Injectable()
export class NodesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async detail(principal: Principal, id: string): Promise<NodeDetail> {
    const { role } = await this.access.resolve(principal, id);
    const node = await this.prisma.node.findUnique({ where: { id }, include: INCLUDE });
    if (!node) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);

    const chain = [...ancestorIds(node.path), node.id];
    const rows = await this.prisma.node.findMany({
      where: { id: { in: chain } },
      select: { id: true, name: true },
    });
    const breadcrumbs = chain.map((cid) => {
      const r = rows.find((x) => x.id === cid);
      if (!r) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
      return { id: r.id, name: r.name };
    });

    return { ...toNodeDto(node), breadcrumbs, myRole: role };
  }

  /**
   * Keyset pagination over (type, name, id) — the exact tuple the
   * (parentId, type, name) index sorts by. FOLDER sorts before FILE.
   *
   * Prisma's generated enum filter has no `gt`/`lt` (only
   * equals/in/notIn/not — enums aren't treated as ordinal), so the first OR
   * branch is expressed as `type in <types after cursor.type>` instead of
   * `type gt cursor.type`. Same tuple comparison, just phrased in a filter
   * Prisma actually accepts.
   */
  async children(
    principal: Principal,
    id: string,
    opts: { cursor?: string; limit?: number },
  ) {
    await this.access.resolve(principal, id);
    const limit = Math.min(opts.limit ?? 50, 100);

    let cursor = null as ReturnType<typeof decodeCursor>;
    if (opts.cursor) {
      cursor = decodeCursor(opts.cursor);
      if (!cursor) {
        throw new AppError('VALIDATION_FAILED', 'Invalid cursor', 400);
      }
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
      where: { parentId: id, deletedAt: null, ...after },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: INCLUDE,
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];

    return {
      items: items.map(toNodeDto),
      nextCursor:
        hasMore && last ? encodeCursor({ type: last.type, name: last.name, id: last.id }) : null,
    };
  }

  /** One prefix query over the materialized path — no recursive CTE. */
  async stats(principal: Principal, id: string): Promise<NodeStats> {
    const { node } = await this.access.resolve(principal, id);
    const prefix = subtreePrefix(node.path);

    const [agg] = await this.prisma.$queryRaw<
      { file_count: bigint; folder_count: bigint; total_bytes: Prisma.Decimal }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE n."type" = 'FILE')   AS file_count,
        COUNT(*) FILTER (WHERE n."type" = 'FOLDER') AS folder_count,
        COALESCE(SUM(v."sizeBytes"), 0)             AS total_bytes
      FROM "Node" n
      LEFT JOIN "FileVersion" v ON v."id" = n."currentVersionId"
      WHERE n."path" LIKE ${prefix + '%'}
        AND n."id" <> ${id}
        AND n."deletedAt" IS NULL
    `;

    return {
      fileCount: Number(agg.file_count),
      folderCount: Number(agg.folder_count),
      totalBytes: Number(agg.total_bytes),
    };
  }

  async takenNames(
    parentId: string,
    excludeId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<string[]> {
    const rows = await client.node.findMany({
      where: { parentId, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { name: true },
    });
    return rows.map((r) => r.name);
  }

  /**
   * Reads via `client` (defaults to `this.prisma`) so a caller inside a
   * `$transaction` can pass the transaction client and see uncommitted
   * writes from earlier in that same transaction — reading through
   * `this.prisma` instead would see only committed state and could pass a
   * name that the transaction itself already claimed.
   */
  private async assertNameFree(
    parentId: string,
    name: string,
    excludeId?: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const taken = await this.takenNames(parentId, excludeId, client);
    const suggested = nextAvailableName(name, taken);
    if (suggested !== name) {
      throw new AppError('NAME_CONFLICT', `"${name}" already exists here`, 409, {
        suggestedName: suggested,
      });
    }
  }

  async createFolder(principal: Principal, input: { parentId: string; name: string }) {
    const { node: parent } = await this.access.requireOwner(principal, input.parentId);
    // requireOwner only grants OWNER to a 'user' principal (see AccessService.resolve).
    if (principal.kind !== 'user') throw new AppError('FORBIDDEN', 'Owner required', 403);
    if (parent.type !== 'FOLDER') {
      throw new AppError('INVALID_MOVE', 'Parent is not a folder', 400);
    }
    await this.assertNameFree(parent.id, input.name);

    const id = randomUUID();
    const created = await this.prisma.node.create({
      data: {
        id,
        dataRoomId: parent.dataRoomId,
        parentId: parent.id,
        type: 'FOLDER',
        name: input.name,
        path: buildPath(parent.path, id),
        depth: parent.path.split('/').filter(Boolean).length,
        createdById: principal.userId,
      },
      include: INCLUDE,
    });
    return toNodeDto(created);
  }

  async update(principal: Principal, id: string, input: { name?: string; parentId?: string }) {
    const { node } = await this.access.requireOwner(principal, id);
    if (node.parentId === null) {
      throw new AppError('INVALID_MOVE', 'The data room root cannot be renamed or moved', 400);
    }

    return this.prisma.$transaction(async (tx) => {
      let path = node.path;
      let parentId = node.parentId;
      let depth: number | undefined;
      let parentChanged = false;

      if (input.parentId && input.parentId !== node.parentId) {
        const dest = await tx.node.findUnique({ where: { id: input.parentId } });
        // A nonexistent id and an id that exists but belongs to someone
        // else's data room must be indistinguishable (see AccessService.resolve)
        // — otherwise the response status itself becomes an existence oracle
        // for ids outside the caller's own room. Only `dest.type` (a property
        // of a node the caller already knows exists, in their own room) gets
        // the more specific INVALID_MOVE.
        if (!dest || dest.deletedAt || dest.dataRoomId !== node.dataRoomId) {
          throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
        }
        if (dest.type !== 'FOLDER') throw new AppError('INVALID_MOVE', 'Destination is not a folder', 400);
        if (isSelfOrDescendant(dest.path, node.path)) {
          throw new AppError('INVALID_MOVE', 'A folder cannot be moved into itself', 400);
        }

        const newPath = buildPath(dest.path, node.id);
        const oldDepth = node.path.split('/').filter(Boolean).length - 1;
        const newDepth = newPath.split('/').filter(Boolean).length - 1;
        const depthDelta = newDepth - oldDepth;
        // Rewrite every descendant path (and keep `depth` consistent with it)
        // in one statement. The `substring(... from N)` offset is safe only
        // because `path` is pure ASCII (UUIDs and slashes) — JS string
        // `.length` and Postgres's character offset agree exactly. If `path`
        // ever contained multi-byte characters (e.g. a user-supplied name),
        // this arithmetic would silently corrupt every descendant's path.
        await tx.$executeRaw`
          UPDATE "Node"
          SET "path" = ${newPath} || substring("path" from ${node.path.length + 1}::int),
              "depth" = "depth" + ${depthDelta}
          WHERE "path" LIKE ${node.path + '%'} AND "id" <> ${node.id}
        `;
        path = newPath;
        parentId = dest.id;
        depth = newDepth;
        parentChanged = true;
      }

      const nameChanged = !!input.name && input.name !== node.name;
      if (parentChanged || nameChanged) {
        // Every reparent must recheck the destination for a name conflict,
        // not just an explicit rename — a bare `{ parentId }` move still
        // lands the node's existing name in a new folder, which can collide.
        await this.assertNameFree(parentId!, input.name ?? node.name, node.id, tx);
      }

      const updated = await tx.node.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.parentId ? { parentId, path, depth } : {}),
        },
        include: INCLUDE,
      });
      return toNodeDto(updated);
    });
  }

  /** One prefix UPDATE stamps the node and every descendant. */
  async softDelete(principal: Principal, id: string) {
    const { node } = await this.access.requireOwner(principal, id);
    if (node.parentId === null) {
      throw new AppError('INVALID_MOVE', 'Delete the data room instead of its root folder', 400);
    }
    const deletedCount = await this.prisma.$executeRaw`
      UPDATE "Node" SET "deletedAt" = now()
      WHERE "path" LIKE ${subtreePrefix(node.path) + '%'} AND "deletedAt" IS NULL
    `;
    return { deletedCount };
  }
}
