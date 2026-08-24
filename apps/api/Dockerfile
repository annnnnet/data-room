# syntax=docker/dockerfile:1
#
# Build context MUST be the repo root (pnpm-workspace.yaml, the root
# lockfile, and packages/shared all need to be visible), e.g.:
#   docker build -f apps/api/Dockerfile -t data-room-api .

ARG NODE_VERSION=20-slim

# ---------------------------------------------------------------------------
# deps: install the full workspace dependency graph once, with a frozen
# lockfile, so both the "generate prisma client" step and the "build"
# step can reuse node_modules without reinstalling.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: generate the Prisma client, then build packages/shared (CJS +
# declarations) before building the API — the API's own prebuild hook also
# does this, but doing it explicitly here keeps stage boundaries clear.
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /repo

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @data-room/shared build
RUN pnpm --filter @data-room/api exec prisma generate --schema prisma/schema.prisma
RUN pnpm --filter @data-room/api exec nest build

# ---------------------------------------------------------------------------
# prod-deps: a second, production-only install so the runtime image doesn't
# carry devDependencies (nest cli, typescript, jest, ts-node, etc.).
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS prod-deps
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile --prod

# ---------------------------------------------------------------------------
# runtime: lean image — only the built artifacts, production node_modules,
# and the Prisma schema/migrations needed for `prisma migrate deploy`.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
ENV NODE_ENV=production
# @supabase/supabase-js's realtime client requires a native `WebSocket`
# global, stable only from Node 22. Node 20 ships it behind this flag —
# enable it instead of bumping the base image, so StorageService (built on
# createClient) can construct without patching apps/api/src.
ENV NODE_OPTIONS=--experimental-websocket
WORKDIR /repo

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=prod-deps /repo/packages/shared/node_modules ./packages/shared/node_modules

COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json

COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
# prod-deps installed @prisma/client and the prisma CLI (a production
# dependency, needed here for the release-command `migrate deploy`) but has
# no generated client/query-engine yet — generate it now, invoking the CLI
# binary directly so this doesn't require the full pnpm workspace context.
RUN ./apps/api/node_modules/.bin/prisma generate --schema apps/api/prisma/schema.prisma

WORKDIR /repo/apps/api
EXPOSE 4000

CMD ["node", "dist/src/main.js"]
