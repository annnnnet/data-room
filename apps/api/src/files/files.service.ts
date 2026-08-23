import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { OnConflict } from '@data-room/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { StorageService } from '../storage/storage.service';
import { NodesService } from '../nodes/nodes.service';
import { AppError } from '../common/api-error';
import { buildPath } from '../common/path.util';
import { nextAvailableName } from '../common/name.util';
import { toNodeDto } from '../nodes/node.mapper';
import type { Principal } from '../auth/auth.guard';

/** Bounds the version-number allocation retry loop below. */
const MAX_VERSION_ALLOCATION_ATTEMPTS = 5;

/**
 * True only for a P2002 on `FileVersion`'s `(nodeId, versionNumber)` unique
 * constraint — never for the unrelated `(parentId, lower(name))` name
 * conflict, which must keep surfacing as 409 NAME_CONFLICT via the generic
 * P2002 mapping in AllExceptionsFilter. Checked against `meta.target`
 * loosely (it may come back as either the field-name array Prisma reports
 * for a schema-declared `@@unique`, or a raw constraint-name string) so
 * detection doesn't depend on exactly which shape the driver returns.
 */
function isVersionNumberConflict(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  const targets = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
  return targets.some((t) => String(t).includes('versionNumber'));
}

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
    private storage: StorageService,
    private nodes: NodesService,
  ) {}

  async createUploadUrl(
    principal: Principal,
    input: { parentId: string; name: string; sizeBytes: number; mimeType: string; onConflict: OnConflict },
  ) {
    const { node: parent } = await this.access.requireOwner(principal, input.parentId);
    if (principal.kind !== 'user') throw new AppError('FORBIDDEN', 'Owner required', 403);
    const userId = principal.userId;

    const existing = await this.prisma.node.findFirst({
      where: { parentId: parent.id, deletedAt: null, name: { equals: input.name, mode: 'insensitive' } },
    });

    let targetNodeId: string;
    let finalName = input.name;

    if (!existing) {
      targetNodeId = randomUUID();
    } else if (input.onConflict === 'FAIL') {
      const taken = await this.nodes.takenNames(parent.id);
      throw new AppError('NAME_CONFLICT', `"${input.name}" already exists here`, 409, {
        suggestedName: nextAvailableName(input.name, taken),
        existingNodeId: existing.id,
      });
    } else if (input.onConflict === 'KEEP_BOTH') {
      const taken = await this.nodes.takenNames(parent.id);
      finalName = nextAvailableName(input.name, taken);
      targetNodeId = randomUUID();
    } else {
      // REPLACE reuses the existing node. Report the node's actual name
      // (its existing casing), not the caller's — uploading "MSA.PDF" over
      // "msa.pdf" must not claim the node is now called "MSA.PDF".
      if (existing.type !== 'FILE') {
        throw new AppError('NAME_CONFLICT', 'A folder with that name exists here', 409);
      }
      targetNodeId = existing.id;
      finalName = existing.name;
    }

    const versionId = randomUUID();
    const storageKey = this.storage.storageKey(parent.dataRoomId, versionId);

    // The whole transaction is retried (not just the version create) because
    // a P2002 mid-transaction aborts the underlying Postgres transaction —
    // any earlier statement in it (e.g. the node create for a brand-new
    // file) is rolled back too, so re-running the whole block from scratch
    // is both correct and the only thing that's safe to do.
    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const updated = await this.prisma.$transaction(async (tx) => {
          if (!existing || input.onConflict === 'KEEP_BOTH') {
            await tx.node.create({
              data: {
                id: targetNodeId,
                dataRoomId: parent.dataRoomId,
                parentId: parent.id,
                type: 'FILE',
                name: finalName,
                path: buildPath(parent.path, targetNodeId),
                depth: parent.path.split('/').filter(Boolean).length,
                createdById: userId,
              },
            });
          }
          const last = await tx.fileVersion.findFirst({
            where: { nodeId: targetNodeId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
          });
          await tx.fileVersion.create({
            data: {
              id: versionId,
              nodeId: targetNodeId,
              versionNumber: (last?.versionNumber ?? 0) + 1,
              storageKey,
              sizeBytes: BigInt(input.sizeBytes),
              mimeType: input.mimeType,
              status: 'PENDING',
              createdById: userId,
            },
          });
        });
        void updated;
        break;
      } catch (err) {
        if (isVersionNumberConflict(err) && attempt < MAX_VERSION_ALLOCATION_ATTEMPTS) continue;
        if (isVersionNumberConflict(err)) {
          // Retries exhausted under sustained contention on this exact node.
          // This was never about a name, so it must not masquerade as
          // NAME_CONFLICT (whose contract promises `details.suggestedName`,
          // which nothing here can honestly supply).
          throw new AppError(
            'INTERNAL',
            'Too many concurrent uploads to this file right now — please retry',
            500,
          );
        }
        throw err;
      }
    }

    return {
      nodeId: targetNodeId,
      versionId,
      uploadUrl: await this.storage.signedUploadUrl(storageKey),
      finalName,
    };
  }

  /** Until this runs, the node has no currentVersion and stays out of listings. */
  async complete(principal: Principal, nodeId: string, versionId: string) {
    await this.access.requireOwner(principal, nodeId);

    // Scope the version to the node before touching storage: owning the
    // node does not imply owning the version (see the transaction below),
    // and there's no reason to make a storage round trip for a version that
    // isn't even this node's.
    const version = await this.prisma.fileVersion.findFirst({ where: { id: versionId, nodeId } });
    if (!version) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);

    // A client can call `complete` without ever PUTting the bytes to the
    // signed URL. Without this check the version still flips to READY, the
    // node lists with its declared size, and every download 404s. Leave the
    // version PENDING when the object isn't actually there.
    const exists = await this.storage.objectExists(version.storageKey);
    if (!exists) {
      throw new AppError('UPLOAD_EXPIRED', 'The upload was not found in storage', 502);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Scope the version to the node in one atomic statement. Owning the
      // node does not imply owning the version: without this, an owner could
      // point their own node at another tenant's blob by passing its
      // versionId, and flip that tenant's PENDING upload to READY as a side
      // effect.
      const { count } = await tx.fileVersion.updateMany({
        where: { id: versionId, nodeId },
        data: { status: 'READY' },
      });
      if (count !== 1) {
        throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
      }
      return tx.node.update({
        where: { id: nodeId },
        data: { currentVersionId: versionId },
        include: {
          currentVersion: { select: { sizeBytes: true, mimeType: true } },
          _count: { select: { versions: true } },
        },
      });
    });
    return toNodeDto(updated);
  }

  async downloadUrl(principal: Principal, nodeId: string, disposition: 'inline' | 'attachment') {
    await this.access.resolve(principal, nodeId);
    // `resolve` already confirmed the node exists (and isn't soft-deleted);
    // `findFirst` + an explicit check avoids a second `...OrThrow` query
    // whose only extra job was to re-detect a case `resolve` just ruled out.
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId },
      include: { currentVersion: true },
    });
    if (!node) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
    if (!node.currentVersion) throw new AppError('NODE_NOT_FOUND', 'File has no content', 404);
    return {
      url: await this.storage.signedDownloadUrl(node.currentVersion.storageKey, node.name, disposition),
    };
  }

  /**
   * Owner-only. Version history is edit metadata — who uploaded each
   * version and when — not the file content itself. The sharing
   * requirement is "read-only access to the shared item"; it says nothing
   * about handing a link (or per-user) recipient the owner's edit history,
   * and there's no restore affordance for them to justify seeing it either.
   * A VIEWER still gets the current content via `download-url` — this only
   * withholds the *history* of how it got there.
   */
  async versions(principal: Principal, nodeId: string) {
    await this.access.requireOwner(principal, nodeId);
    const node = await this.prisma.node.findFirst({
      where: { id: nodeId },
      include: {
        versions: { where: { status: 'READY' }, orderBy: { versionNumber: 'desc' }, include: { createdBy: true } },
      },
    });
    if (!node) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
    return node.versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      sizeBytes: Number(v.sizeBytes),
      mimeType: v.mimeType,
      createdAt: v.createdAt.toISOString(),
      createdByName: v.createdBy.name ?? v.createdBy.email,
      isCurrent: v.id === node.currentVersionId,
    }));
  }

  /** Restore is additive — it copies the old blob reference into a new version. */
  async restore(principal: Principal, nodeId: string, versionNumber: number) {
    await this.access.requireOwner(principal, nodeId);
    if (principal.kind !== 'user') throw new AppError('FORBIDDEN', 'Owner required', 403);
    const userId = principal.userId;

    let attempt = 0;
    for (;;) {
      attempt++;
      try {
        const updated = await this.prisma.$transaction(async (tx) => {
          // Only a READY version has a real object behind it. Restoring a
          // PENDING one (requested but never uploaded, or still mid-upload)
          // would mint a new current version pointing at a storage key with
          // nothing there — the file would list but 404 on download.
          const source = await tx.fileVersion.findFirstOrThrow({
            where: { nodeId, versionNumber, status: 'READY' },
          });
          const last = await tx.fileVersion.findFirstOrThrow({
            where: { nodeId },
            orderBy: { versionNumber: 'desc' },
          });
          const copy = await tx.fileVersion.create({
            data: {
              nodeId,
              versionNumber: last.versionNumber + 1,
              storageKey: source.storageKey,
              sizeBytes: source.sizeBytes,
              mimeType: source.mimeType,
              status: 'READY',
              createdById: userId,
            },
          });
          return tx.node.update({
            where: { id: nodeId },
            data: { currentVersionId: copy.id },
            include: {
              currentVersion: { select: { sizeBytes: true, mimeType: true } },
              _count: { select: { versions: true } },
            },
          });
        });
        return toNodeDto(updated);
      } catch (err) {
        if (isVersionNumberConflict(err) && attempt < MAX_VERSION_ALLOCATION_ATTEMPTS) continue;
        if (isVersionNumberConflict(err)) {
          throw new AppError(
            'INTERNAL',
            'Too many concurrent changes to this file right now — please retry',
            500,
          );
        }
        throw err;
      }
    }
  }
}
