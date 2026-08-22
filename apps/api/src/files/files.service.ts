import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
    const userId = (principal as { userId: string }).userId;

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
      // REPLACE
      if (existing.type !== 'FILE') {
        throw new AppError('NAME_CONFLICT', 'A folder with that name exists here', 409);
      }
      targetNodeId = existing.id;
    }

    const versionId = randomUUID();
    const storageKey = this.storage.storageKey(parent.dataRoomId, versionId);

    await this.prisma.$transaction(async (tx) => {
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
    const updated = await this.prisma.$transaction(async (tx) => {
      // Scope the version to the node in one atomic statement. Owning the node
      // does not imply owning the version: without this, an owner could point
      // their own node at another tenant's blob by passing its versionId, and
      // flip that tenant's PENDING upload to READY as a side effect.
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
    const node = await this.prisma.node.findUniqueOrThrow({
      where: { id: nodeId },
      include: { currentVersion: true },
    });
    if (!node.currentVersion) throw new AppError('NODE_NOT_FOUND', 'File has no content', 404);
    return {
      url: await this.storage.signedDownloadUrl(node.currentVersion.storageKey, node.name, disposition),
    };
  }

  async versions(principal: Principal, nodeId: string) {
    await this.access.resolve(principal, nodeId);
    const node = await this.prisma.node.findUniqueOrThrow({
      where: { id: nodeId },
      include: {
        versions: { where: { status: 'READY' }, orderBy: { versionNumber: 'desc' }, include: { createdBy: true } },
      },
    });
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
    const userId = (principal as { userId: string }).userId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const source = await tx.fileVersion.findFirstOrThrow({ where: { nodeId, versionNumber } });
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
  }
}
