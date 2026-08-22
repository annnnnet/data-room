import { Prisma } from '@prisma/client';
import { FilesService } from './files.service';
import { AppError } from '../common/api-error';

/** P2002 on FileVersion's real `(nodeId, versionNumber)` unique constraint. */
function versionNumberConflict() {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields: (`nodeId`,`versionNumber`)',
    { code: 'P2002', clientVersion: 'test', meta: { target: ['nodeId', 'versionNumber'] } },
  );
}

/** P2002 on the unrelated `(parentId, lower(name))` name-conflict index. */
function nameConflict() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: 'node_parent_name_unique' },
  });
}

describe('FilesService.createUploadUrl — version-number allocation race', () => {
  const principal = { kind: 'user' as const, userId: 'owner-1' };
  const parent = { id: 'parent-1', dataRoomId: 'room-1', path: '/parent-1/' };

  function makeService(transactionImpl: jest.Mock) {
    const prisma = {
      node: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: transactionImpl,
    };
    const access = { requireOwner: jest.fn().mockResolvedValue({ node: parent, role: 'OWNER' }) };
    const storage = {
      storageKey: jest.fn().mockReturnValue('room-1/version-1'),
      signedUploadUrl: jest.fn().mockResolvedValue('https://fake.storage.test/upload'),
    };
    const nodes = { takenNames: jest.fn().mockResolvedValue([]) };
    return new FilesService(prisma as any, access as any, storage as any, nodes as any);
  }

  const input = {
    parentId: parent.id,
    name: 'a.pdf',
    sizeBytes: 10,
    mimeType: 'application/pdf',
    onConflict: 'FAIL' as const,
  };

  it('retries the whole transaction on a version-number collision and eventually succeeds', async () => {
    const transactionImpl = jest
      .fn()
      .mockRejectedValueOnce(versionNumberConflict())
      .mockRejectedValueOnce(versionNumberConflict())
      .mockResolvedValueOnce(undefined);
    const service = makeService(transactionImpl);

    const result = await service.createUploadUrl(principal, input);

    expect(transactionImpl).toHaveBeenCalledTimes(3);
    expect(result.uploadUrl).toBe('https://fake.storage.test/upload');
  });

  it('fails with an honest error, not NAME_CONFLICT, once retries are exhausted', async () => {
    const transactionImpl = jest.fn().mockRejectedValue(versionNumberConflict());
    const service = makeService(transactionImpl);

    await expect(service.createUploadUrl(principal, input)).rejects.toMatchObject({
      code: expect.stringMatching(/^(?!NAME_CONFLICT$).*/),
    });
    try {
      await service.createUploadUrl(principal, input);
      fail('expected createUploadUrl to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).not.toBe('NAME_CONFLICT');
      expect((err as AppError).message.toLowerCase()).not.toContain('name');
    }
  });

  it('never retries — and never masks — a real name-conflict P2002', async () => {
    const conflict = nameConflict();
    const transactionImpl = jest.fn().mockRejectedValueOnce(conflict);
    const service = makeService(transactionImpl);

    await expect(service.createUploadUrl(principal, input)).rejects.toBe(conflict);
    expect(transactionImpl).toHaveBeenCalledTimes(1);
  });
});
