<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

## E2E test database

The e2e suite (`pnpm test:e2e`) runs against a dedicated local Postgres
container, never against the shared Supabase database used in dev/prod.
`test/helpers.ts` refuses to run — throwing a clear error instead of
silently falling back to `DATABASE_URL` — if `DATABASE_URL_TEST` isn't set.

### Prerequisites

- Docker Desktop (or another Docker-compatible engine) running locally.

### One-time setup

1. Copy `apps/api/.env.example` to `apps/api/.env` and fill in `DATABASE_URL`
   / `DIRECT_URL` (Supabase, for the app itself) — `DATABASE_URL_TEST` /
   `DIRECT_URL_TEST` already point at the local container and normally don't
   need to change.
2. Bring up the container and apply migrations:

   ```bash
   pnpm --filter @data-room/api test:e2e:setup
   ```

   This starts Postgres 15 in Docker (`docker-compose.yml` at the repo
   root, published on **host port 5434** — 5432/5433 are often already
   taken), waits for it to report healthy, runs `prisma migrate deploy`
   against `DATABASE_URL_TEST`, and verifies the `pg_trgm` extension and
   the two raw-SQL indexes (`node_parent_name_unique`, `node_name_trgm`)
   from the init migration actually exist.

### Running the suite

```bash
pnpm --filter @data-room/api test:e2e          # just the tests (container must already be up + migrated)
pnpm --filter @data-room/api test:e2e:full      # up + migrate + verify + run tests, in one go
```

Equivalent scripts exist at the repo root: `pnpm test:e2e:db:up` /
`pnpm test:e2e:db:down` / `pnpm test:e2e`.

### Other useful scripts

| Script | What it does |
| --- | --- |
| `test:e2e:db:up` | `docker compose up -d --wait` for the test database |
| `test:e2e:db:down` | Stops and removes the test database container |
| `test:e2e:db:migrate` | Runs `prisma migrate deploy` against `DATABASE_URL_TEST` |
| `test:e2e:db:verify` | Confirms `pg_trgm` + both raw-SQL indexes exist |
| `test:e2e:setup` | up + migrate + verify |
| `test:e2e:full` | setup + run the e2e suite |

The container's credentials (`data_room_test` / `data_room_test`,
database `data_room_test`) are local-only throwaway values — safe to keep
in `docker-compose.yml` and `.env.example`.
