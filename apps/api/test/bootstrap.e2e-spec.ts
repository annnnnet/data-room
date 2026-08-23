import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { loadEnv, useTestDatabase } from './helpers';

/**
 * Every other e2e spec builds its app via `createTestApp()`, which calls
 * `.overrideGuard(AuthGuard).useClass(TestAuthGuard)` — so no spec in this
 * suite ever constructs the real `AuthGuard` -> `JwtVerifierService`
 * dependency graph. That let a broken `AuthModule.exports` (missing
 * `JwtVerifierService`) ship undetected: 162 tests green, but `node
 * dist/main.js` and `nest start` both crashed with
 * `UnknownDependenciesException` on boot.
 *
 * This spec closes that gap: it compiles the unmodified `AppModule` with NO
 * provider or guard overrides, so it exercises the exact graph production
 * boots with, `AuthGuard` included. `nest.init()` instantiates every
 * provider — including `JwtVerifierService`, which must not make a network
 * call merely by being constructed (its JWKS client is built lazily on
 * first `verify()` call, not in its constructor) — so this test proves the
 * app can start without reaching Supabase Auth.
 *
 * It does talk to Postgres: `PrismaService.onModuleInit` calls `$connect()`,
 * so this still needs the local test database up (same as every other e2e
 * spec — see test:e2e:db:up).
 */
describe('AppModule bootstrap (no overrides)', () => {
  it('constructs the real provider graph, including AuthGuard -> JwtVerifierService, and initializes', async () => {
    loadEnv();
    useTestDatabase();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nest: INestApplication = moduleRef.createNestApplication();

    await nest.init();
    await nest.close();
  });
});
