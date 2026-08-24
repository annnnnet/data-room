# Deploying the API (Railway)

The API deploys as a Docker image built from `apps/api/Dockerfile`. The web
app (Next.js) deploys separately on Vercel and is out of scope here.

## Railway project settings

Create a new Railway service from this GitHub repo and set:

| Setting | Value |
|---|---|
| Root directory | `/` (**repo root** — not `apps/api`) |
| Dockerfile path | `apps/api/Dockerfile` |
| Start command | `node dist/src/main.js` (already set in `railway.json`) |
| Release command | `node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma` (already set in `railway.json`; runs before each deploy) |

The root directory must be the monorepo root because the Dockerfile needs
`pnpm-workspace.yaml`, the root lockfile, and `packages/shared` to resolve
the pnpm workspace — `apps/api` alone is not a buildable context.

`railway.json` lives at the **repo root**, not in `apps/api`. Railway reads
its config file from the top of the service's root directory, so a
`railway.json` inside `apps/api` is silently ignored when the root directory
is `/` — Railway then falls back to its Railpack auto-detector, which finds
a 3-package pnpm workspace, cannot tell which package to run, and fails the
build with "No start command detected". That failure mode looks like a
missing start script; the actual cause is a config file Railway never read.

## Environment variables

Set these on the Railway service:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Pooled Postgres connection string (Prisma's runtime connection) |
| `DIRECT_URL` | Direct (non-pooled) Postgres connection string, used for migrations |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_JWKS_URL` | Supabase JWKS endpoint, used to verify access tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-side only) |
| `STORAGE_BUCKET` | Supabase Storage bucket name |
| `WEB_ORIGIN` | Allowed CORS origin(s) — comma-separated if more than one, e.g. `https://app.example.com,https://staging.example.com` |
| `PORT` | Injected automatically by Railway — no action needed |

**`WEB_ORIGIN` must be updated once the Vercel URL exists.** The API reads
it at boot and fails to start if it's unset (`process.env.WEB_ORIGIN!.split`
throws), so this can't be silently forgotten — but it defaults to nothing
useful for a URL that doesn't exist yet at first deploy. Until it's set to
the real Vercel origin (or list of origins), every browser request from the
web app will fail CORS. Update it in the Railway dashboard and redeploy (or
just restart — no rebuild needed) whenever the Vercel URL changes.

## What the Dockerfile does

Multi-stage build, context = repo root:

1. `deps` — installs the full workspace with `pnpm install --frozen-lockfile`.
2. `build` — builds `packages/shared` (CJS + `.d.ts`) first, generates the
   Prisma client, then runs `nest build` for the API. `packages/shared`
   must build before the API build/boot — this is also enforced by the
   API's own `prebuild`/`prestart*` hooks.
3. `prod-deps` — a second, production-only install (`--prod`), so the
   runtime image excludes `nest`, `typescript`, `jest`, etc. `prisma` (the
   CLI) is a production dependency of `apps/api`, since the release command
   needs it at runtime for `migrate deploy`.
4. `runtime` — copies only the built `dist/` output, production
   `node_modules`, and the Prisma schema/migrations; regenerates the Prisma
   client against the production `node_modules` (the query engine binary
   must be generated in-image, not copied from another install layer).

Base image is `node:20-slim` with `openssl` installed (required by Prisma's
query engine). `NODE_OPTIONS=--experimental-websocket` is set because
`@supabase/supabase-js`'s realtime client requires a native `WebSocket`
global that's stable only from Node 22 — Node 20 has it behind this flag.

## Local verification

```
docker build -f apps/api/Dockerfile -t data-room-api .
```

from the repo root. See `.superpowers/sdd/task-18-report.md` for the full
verification record (migrations against a fresh database, index/extension
checks, the 401 response proving the auth guard and exception filter are
live, and image size).
