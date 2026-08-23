import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CanActivate, ExecutionContext, INestApplication, Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthGuard } from '../src/auth/auth.guard';
import { AllExceptionsFilter } from '../src/common/api-error';
import { PrismaService } from '../src/prisma/prisma.service';
import { buildPath } from '../src/common/path.util';
import { StorageService } from '../src/storage/storage.service';

/**
 * `apps/api/.env` is never loaded automatically for a plain `jest --config
 * test/jest-e2e.json` run (only Nest's ConfigModule.forRoot loads it, and
 * only once the app is already bootstrapping — too late for PrismaService,
 * which reads DATABASE_URL/DIRECT_URL from process.env at construction
 * time). Parse the file ourselves before anything else touches Prisma.
 */
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/**
 * The e2e suite must never run against the shared Supabase database — a
 * crashed worker there leaks rows into real application data. Once loadEnv()
 * has populated process.env from .env, redirect DATABASE_URL/DIRECT_URL to
 * the local test-database URLs *before* PrismaService (or anything else)
 * constructs a PrismaClient, since Prisma reads those vars at construction
 * time, not per-query.
 *
 * If DATABASE_URL_TEST is missing, fail loudly instead of silently falling
 * back to whatever DATABASE_URL already points at (Supabase, in dev).
 */
function useTestDatabase() {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error(
      'DATABASE_URL_TEST is not set. The e2e suite refuses to fall back to ' +
        'DATABASE_URL (the shared Supabase database). Start the local test ' +
        'database with `pnpm --filter @data-room/api test:e2e:db:up` and set ' +
        'DATABASE_URL_TEST / DIRECT_URL_TEST in apps/api/.env (see .env.example).',
    );
  }
  process.env.DATABASE_URL = testUrl;
  process.env.DIRECT_URL = process.env.DIRECT_URL_TEST ?? testUrl;
}

/**
 * Stub that stands in for the real AuthGuard in e2e tests: reads
 * `x-test-user` / `x-share-token` headers directly into a Principal instead
 * of verifying a Supabase JWT, so tests never need to mint real tokens.
 */
@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const testUser = req.headers['x-test-user'];
    const shareToken = req.headers['x-share-token'];
    if (testUser) {
      req.principal = { kind: 'user', userId: String(testUser) };
    } else if (shareToken) {
      req.principal = { kind: 'link', shareToken: String(shareToken) };
    } else {
      req.principal = { kind: 'anonymous' };
    }
    return true;
  }
}

/**
 * Stands in for the real StorageService in e2e tests: the e2e suite runs
 * against local Postgres only and must never call out to Supabase Storage.
 * Keeps the exact same interface as the real service (same method
 * signatures, deterministic-but-realistic-looking URLs) so substituting it
 * doesn't prove anything false about the code under test — in particular
 * the returned upload URL contains "signed", which the e2e spec asserts on.
 */
@Injectable()
class FakeStorageService
  implements Pick<StorageService, 'storageKey' | 'signedUploadUrl' | 'signedDownloadUrl' | 'objectExists'>
{
  // Keyed honestly: a key only lands here once something has told the fake
  // the bytes actually landed (see `markUploaded` below) — never just
  // because an upload URL was requested for it. That's what makes
  // `objectExists` a real stand-in for "did the client actually PUT the
  // file", not a tautology.
  private uploaded = new Set<string>();

  storageKey(dataRoomId: string, versionId: string) {
    return `${dataRoomId}/${versionId}`;
  }
  async signedUploadUrl(key: string): Promise<string> {
    return `https://fake.storage.test/upload/${encodeURIComponent(key)}?signed=1`;
  }
  async signedDownloadUrl(key: string, filename: string, disposition: 'inline' | 'attachment') {
    return `https://fake.storage.test/download/${encodeURIComponent(key)}?signed=1&disposition=${disposition}&filename=${encodeURIComponent(filename)}`;
  }
  async objectExists(key: string): Promise<boolean> {
    return this.uploaded.has(key);
  }
  /** Test-only: simulates the browser's PUT to the signed URL completing. */
  markUploaded(key: string) {
    this.uploaded.add(key);
  }
}

type Agent = {
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  put: (url: string) => request.Test;
  delete: (url: string) => request.Test;
};

function agentWithHeader(server: unknown, headers: Record<string, string>): Agent {
  const withHeader = (req: request.Test) => req.set(headers);
  return {
    get: (url) => withHeader(request(server as any).get(url)),
    post: (url) => withHeader(request(server as any).post(url)),
    patch: (url) => withHeader(request(server as any).patch(url)),
    put: (url) => withHeader(request(server as any).put(url)),
    delete: (url) => withHeader(request(server as any).delete(url)),
  };
}

export interface TestApp {
  nest: INestApplication;
  prisma: PrismaService;
  /** Owner of the most recent seedTree() call — asOwner() reads this. */
  ownerId: string;
  /** @internal room ids created by seedTree(), cleaned up on close(). */
  _roomIds: string[];
  /** @internal user ids created by seedTree(), cleaned up on close(). */
  _userIds: string[];
  asOwner(): Agent;
  asUser(userId: string): Agent;
  asStranger(): Agent;
  asLink(token: string): Agent;
  /** No auth header at all — an anonymous caller, not even a stranger id. */
  asAnonymous(): Agent;
  /**
   * Simulates the browser's PUT of the file bytes to the signed upload URL
   * for the given `versionId` — the one step the real flow never lets the
   * API see. Call this before `POST /files/:id/complete` in any test that
   * expects `complete` to succeed, now that `complete` actually checks the
   * object is there.
   */
  uploadBytes(versionId: string): Promise<void>;
  close(): Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  loadEnv();
  useTestDatabase();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideGuard(AuthGuard)
    .useClass(TestAuthGuard)
    .overrideProvider(StorageService)
    .useClass(FakeStorageService)
    .compile();

  const nest = moduleRef.createNestApplication();
  nest.setGlobalPrefix('api');
  nest.useGlobalFilters(new AllExceptionsFilter());
  await nest.init();

  const prisma = moduleRef.get(PrismaService);
  const server = nest.getHttpServer();
  const fakeStorage = moduleRef.get(StorageService) as unknown as FakeStorageService;

  const app: TestApp = {
    nest,
    prisma,
    ownerId: '',
    _roomIds: [],
    _userIds: [],
    asOwner: () => agentWithHeader(server, { 'x-test-user': app.ownerId }),
    asUser: (userId: string) => agentWithHeader(server, { 'x-test-user': userId }),
    // A random id with no row in the DB at all: exercises the "authenticated
    // but no relationship to this room" path, not just "anonymous".
    asStranger: () => agentWithHeader(server, { 'x-test-user': randomUUID() }),
    asLink: (token: string) => agentWithHeader(server, { 'x-share-token': token }),
    asAnonymous: () => agentWithHeader(server, {}),
    uploadBytes: async (versionId: string) => {
      const version = await prisma.fileVersion.findUniqueOrThrow({ where: { id: versionId } });
      fakeStorage.markUploaded(version.storageKey);
    },
    close: async () => {
      // User-scoped cleanup only — never touch tables globally, and never
      // touch the seeded demo room, which isn't owned by any tracked user.
      // Delete every room owned by a tracked test user (not just the rooms
      // seedTree() itself created — a test may also POST /api/data-rooms
      // and create an untracked room under a tracked owner) before deleting
      // the users, since Node.createdById is ON DELETE RESTRICT against
      // User and a room's cascade removes its Node/FileVersion/Share rows.
      // Run inside try/finally so nest.close() always happens, and let a
      // cleanup failure surface loudly (fail the test) instead of being
      // swallowed — a silently-eaten failure is exactly what leaks rows.
      try {
        if (app._userIds.length > 0) {
          await prisma.dataRoom.deleteMany({ where: { ownerId: { in: app._userIds } } });
        }
        if (app._roomIds.length > 0) {
          await prisma.dataRoom.deleteMany({ where: { id: { in: app._roomIds } } });
        }
        if (app._userIds.length > 0) {
          await prisma.user.deleteMany({ where: { id: { in: app._userIds } } });
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('e2e cleanup failed — test rows may have leaked:', err);
        throw err;
      } finally {
        await nest.close();
      }
    },
  };

  return app;
}

type FileSpec = { name: string; size?: number; mimeType?: string };

export interface SeedSpec {
  roomName?: string;
  folders?: string[];
  files?: (string | FileSpec)[];
  /** A two-level chain of folders under the root: [child name, nested name]. */
  nested?: [string, string];
  /** Files created inside the deepest `nested` folder. */
  nestedFiles?: (string | FileSpec)[];
  /** Extra versions to add on top of the first seeded file's version 1. */
  versions?: number;
  /** Grants the given user VIEWER access on the root node. */
  shareRootWith?: string;
  /** Grants the given user VIEWER access on the `nested` node. */
  shareNestedWith?: string;
  /**
   * Opt-in: attaches a standing LINK share on the root node so tests can use
   * `asLink()` without creating their own share. Off by default — a test
   * exercising "no share exists" must not run inside a room that already
   * has a live one.
   */
  shareRootWithLink?: boolean;
}

export interface SeedResult {
  roomId: string;
  ownerId: string;
  root: string;
  /**
   * First top-level node under the root. When `spec.nested` is set, this is
   * the `nested` chain's own child (unshifted ahead of `spec.folders`/
   * `spec.files`), not necessarily the first folder/file spec listed.
   */
  child: string | null;
  /** Second top-level node under the root, by the same ordering as `child`. */
  second: string | null;
  /** Deepest node of the `nested` chain (e.g. "Contracts" in ['Legal', 'Contracts']). */
  nested: string | null;
  /** First node created inside `nested` (e.g. the first `nestedFiles` entry). */
  nestedChild: string | null;
  /** First file node created anywhere in the tree, if any. */
  fileId: string | null;
  /**
   * Token of a standing LINK share on the root node, for asLink() tests —
   * null (never '') when `shareRootWithLink` wasn't set, so `asLink('')`
   * can't silently be called with an empty-string "token" that would slip
   * past validation as a real, if wrong, credential.
   */
  viewerToken: string | null;
}

function toFileSpec(f: string | FileSpec): Required<FileSpec> {
  const spec = typeof f === 'string' ? { name: f } : f;
  return { name: spec.name, size: spec.size ?? 1024, mimeType: spec.mimeType ?? 'application/pdf' };
}

async function createFileNode(
  prisma: PrismaService,
  opts: {
    dataRoomId: string;
    parentId: string;
    parentPath: string;
    depth: number;
    ownerId: string;
    spec: Required<FileSpec>;
  },
): Promise<string> {
  const id = randomUUID();
  const nodePath = buildPath(opts.parentPath, id);
  await prisma.node.create({
    data: {
      id,
      dataRoomId: opts.dataRoomId,
      parentId: opts.parentId,
      type: 'FILE',
      name: opts.spec.name,
      path: nodePath,
      depth: opts.depth,
      createdById: opts.ownerId,
    },
  });
  const version = await prisma.fileVersion.create({
    data: {
      nodeId: id,
      versionNumber: 1,
      storageKey: `test/${id}/v1`,
      sizeBytes: BigInt(opts.spec.size),
      mimeType: opts.spec.mimeType,
      status: 'READY',
      createdById: opts.ownerId,
    },
  });
  await prisma.node.update({ where: { id }, data: { currentVersionId: version.id } });
  return id;
}

/**
 * Ensures a User row exists with exactly the given id, so a share's
 * `granteeUserId` matches the literal id a test passes to `asUser(id)` (the
 * TestAuthGuard puts that literal string straight onto `principal.userId` —
 * it never gets translated to a real database id). Idempotent per id and
 * tracked for cleanup.
 */
async function ensureTestUser(prisma: PrismaService, app: TestApp, id: string): Promise<string> {
  await prisma.user.upsert({
    where: { id },
    update: {},
    create: { id, supabaseSub: `test-${id}-${randomUUID()}`, email: `${id}-${randomUUID()}@test.local` },
  });
  if (!app._userIds.includes(id)) app._userIds.push(id);
  return id;
}

/**
 * Inserts a fresh data room (with its own owner user) directly via Prisma,
 * following the same materialized-path rules the app itself enforces
 * (buildPath from parent path + generated id, depth = parent depth + 1).
 * Every call gets its own room so tests never interfere with each other or
 * with the seeded demo room; helpers.close() deletes only rooms it created.
 */
export async function seedTree(app: TestApp, spec: SeedSpec): Promise<SeedResult> {
  const prisma = app.prisma;
  const roomName = spec.roomName ?? 'Acme Acquisition';

  const owner = await prisma.user.create({
    data: {
      supabaseSub: `test-${randomUUID()}`,
      email: `owner-${randomUUID()}@test.local`,
      name: 'Test Owner',
    },
  });
  app.ownerId = owner.id;
  app._userIds.push(owner.id);

  const rootId = randomUUID();
  const rootPath = buildPath(null, rootId);
  const room = await prisma.dataRoom.create({
    data: {
      name: roomName,
      ownerId: owner.id,
      nodes: {
        create: {
          id: rootId,
          type: 'FOLDER',
          name: roomName,
          path: rootPath,
          depth: 0,
          createdById: owner.id,
        },
      },
    },
  });
  app._roomIds.push(room.id);

  let fileId: string | null = null;

  // Sequential on purpose: the pooled Supabase connection this app uses has
  // a connection limit of 1, so concurrent requests just queue and can trip
  // the pool's own wait timeout instead of the DB doing anything faster.
  const folderIds: string[] = [];
  for (const name of spec.folders ?? []) {
    const id = randomUUID();
    await prisma.node.create({
      data: {
        id,
        dataRoomId: room.id,
        parentId: rootId,
        type: 'FOLDER',
        name,
        path: buildPath(rootPath, id),
        depth: 1,
        createdById: owner.id,
      },
    });
    folderIds.push(id);
  }

  const fileIds: string[] = [];
  for (const f of spec.files ?? []) {
    const id = await createFileNode(prisma, {
      dataRoomId: room.id,
      parentId: rootId,
      parentPath: rootPath,
      depth: 1,
      ownerId: owner.id,
      spec: toFileSpec(f),
    });
    fileIds.push(id);
  }
  fileId = fileIds[0] ?? null;

  const topLevelIds: string[] = [...folderIds, ...fileIds];

  let nested: string | null = null;
  let nestedChild: string | null = null;

  if (spec.nested) {
    const [childName, nestedName] = spec.nested;
    const childId = randomUUID();
    const childPath = buildPath(rootPath, childId);
    await prisma.node.create({
      data: {
        id: childId,
        dataRoomId: room.id,
        parentId: rootId,
        type: 'FOLDER',
        name: childName,
        path: childPath,
        depth: 1,
        createdById: owner.id,
      },
    });
    // Unshifted rather than pushed: when a spec also seeds top-level
    // `folders`/`files`, this keeps `second` (a plain sibling folder)
    // distinct from `nested`'s actual parent, so a test that moves `nested`
    // to `second` exercises a real reparent rather than a same-parent no-op.
    topLevelIds.unshift(childId);

    const nestedId = randomUUID();
    const nestedPath = buildPath(childPath, nestedId);
    await prisma.node.create({
      data: {
        id: nestedId,
        dataRoomId: room.id,
        parentId: childId,
        type: 'FOLDER',
        name: nestedName,
        path: nestedPath,
        depth: 2,
        createdById: owner.id,
      },
    });
    nested = nestedId;

    for (const nf of spec.nestedFiles ?? []) {
      const id = await createFileNode(prisma, {
        dataRoomId: room.id,
        parentId: nestedId,
        parentPath: nestedPath,
        depth: 3,
        ownerId: owner.id,
        spec: toFileSpec(nf),
      });
      nestedChild = nestedChild ?? id;
      fileId = fileId ?? id;
    }

    if (spec.shareNestedWith) {
      const granteeId = await ensureTestUser(prisma, app, spec.shareNestedWith);
      await prisma.share.create({
        data: {
          nodeId: nestedId,
          kind: 'USER',
          granteeUserId: granteeId,
          role: 'VIEWER',
          createdById: owner.id,
        },
      });
    }
  }

  if (spec.versions && fileId) {
    for (let n = 2; n <= spec.versions; n++) {
      const version = await prisma.fileVersion.create({
        data: {
          nodeId: fileId,
          versionNumber: n,
          storageKey: `test/${fileId}/v${n}`,
          // Distinguishable per version (1024 * n) rather than a shared
          // constant: a restore test asserting only on versionNumber would
          // still pass if the implementation copied the wrong source
          // version, since every version would look identical otherwise.
          sizeBytes: BigInt(1024 * n),
          mimeType: 'application/pdf',
          status: 'READY',
          createdById: owner.id,
        },
      });
      await prisma.node.update({ where: { id: fileId }, data: { currentVersionId: version.id } });
    }
  }

  if (spec.shareRootWith) {
    const granteeId = await ensureTestUser(prisma, app, spec.shareRootWith);
    await prisma.share.create({
      data: {
        nodeId: rootId,
        kind: 'USER',
        granteeUserId: granteeId,
        role: 'VIEWER',
        createdById: owner.id,
      },
    });
  }

  // A standing LINK share on the root, opt-in via spec.shareRootWithLink, so
  // a test can exercise asLink() without creating its own share — but a test
  // that expects "no share" to yield 404 doesn't silently run inside a room
  // that already has a live one.
  let viewerToken: string | null = null;
  if (spec.shareRootWithLink) {
    viewerToken = randomUUID();
    await prisma.share.create({
      data: {
        nodeId: rootId,
        kind: 'LINK',
        token: viewerToken,
        role: 'VIEWER',
        createdById: owner.id,
      },
    });
  }

  return {
    roomId: room.id,
    ownerId: owner.id,
    root: rootId,
    child: topLevelIds[0] ?? null,
    second: topLevelIds[1] ?? null,
    nested,
    nestedChild,
    fileId,
    viewerToken,
  };
}
