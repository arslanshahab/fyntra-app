# Fyntra Phase 1.5 — Plan A: Foundational E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate to a pnpm monorepo, stand up a Fastify + Drizzle + Postgres backend, and prove an end-to-end tap-ingestion path that the existing Phase 1 frontend can consume over REST. By the end of this plan, the frontend talks to the real backend (MSW off), the parent home reflects a curl-triggered tap via polling, and the multi-tenancy + auth + attendance computation patterns are locked in.

**Architecture:** pnpm workspaces with `apps/web`, `apps/api`, `apps/bridge`, and `packages/schemas` (TS-source-only, no build). Fastify v5 with `fastify-type-provider-zod` using shared Zod schemas. Application-layer multi-tenancy via a `TenantContext` decorator. Drizzle + Postgres 16 in Docker. OTP via WhatsApp Cloud API (placeholder creds in dev). Tap ingestion → lazy attendance record creation → in-memory WS pub/sub broadcast → in-app notification log. `node-cron` per-school job creates absent records and fans out absent alerts at `startTime + absentThresholdMinutes`, with offline-device suppression.

**Tech Stack:** Node 20+, pnpm workspaces, TypeScript strict, Fastify v5, `fastify-type-provider-zod`, `@fastify/jwt`, `@fastify/websocket`, `@fastify/rate-limit`, `@fastify/cors`, Drizzle ORM + drizzle-kit, Postgres 16, Pino + `pino-pretty`, `node-cron`, `uuid` v9+ (v7 mode), `nanoid`, Zod, Vitest + supertest. WhatsApp Cloud API over `fetch`.

**Spec reference:** `docs/superpowers/specs/2026-05-13-fyntra-phase-1.5-backend-design.md`. This plan implements §15 slices 0–6 of that spec.

---

## File structure (after Plan A completes)

```
fyntra/
├── package.json                              # workspace root, private: true
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .gitignore                                # extended for monorepo
├── apps/
│   ├── web/                                  # existing frontend (git mv from root)
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── docker-compose.yml
│   │   ├── .env.example
│   │   ├── .nvmrc
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── server.ts                     # Fastify bootstrap
│   │       ├── config/env.ts                 # Zod-parsed env
│   │       ├── db/
│   │       │   ├── client.ts
│   │       │   ├── schema/
│   │       │   │   ├── auth.ts
│   │       │   │   ├── schools.ts
│   │       │   │   ├── students.ts
│   │       │   │   ├── cards.ts
│   │       │   │   ├── devices.ts
│   │       │   │   ├── attendance.ts
│   │       │   │   └── notifications.ts
│   │       │   ├── migrations/               # drizzle-kit output
│   │       │   └── seed.ts
│   │       ├── middleware/
│   │       │   ├── require-auth.ts
│   │       │   ├── require-role.ts
│   │       │   ├── tenant-context.ts
│   │       │   └── request-logging.ts
│   │       ├── modules/
│   │       │   ├── auth/{routes,service,repository,*.test}.ts
│   │       │   ├── students/{routes,service,repository,*.test}.ts
│   │       │   ├── readers/{routes,service,*.test}.ts
│   │       │   ├── tap-events/{routes,service,repository,*.test}.ts
│   │       │   ├── attendance/{service,repository,*.test}.ts
│   │       │   └── notifications/{service,repository,*.test}.ts
│   │       ├── services/
│   │       │   ├── whatsapp.ts
│   │       │   ├── realtime.ts
│   │       │   ├── attendance-jobs.ts
│   │       │   └── heartbeat-sweep.ts
│   │       ├── lib/
│   │       │   ├── logger.ts
│   │       │   ├── errors.ts
│   │       │   ├── ids.ts
│   │       │   └── time.ts
│   │       ├── types/tenant-context.ts
│   │       └── ws/routes.ts                  # /ws upgrade handler
│   └── bridge/                               # existing bridge (git mv from /bridge)
└── packages/
    └── schemas/
        ├── package.json
        ├── tsconfig.json
        └── src/index.ts                      # moved verbatim from apps/web/src/types/schemas.ts
```

Tests are co-located under `apps/api/src/modules/<name>/*.test.ts`. End-to-end tests live under `apps/api/tests/e2e/`.

---

## Conventions enforced throughout

- **No barrel files.** Import from the file directly.
- **Tenant filter first.** Every Drizzle `where(...)` predicate in a tenant-scoped repo starts with `eq(table.schoolId, ctx.schoolId)`.
- **Service signature:** `function <name>(ctx: TenantContext, ...args)`. Cross-tenant denials return **404**, never 403.
- **Errors:** Throw `AppError` from `lib/errors.ts`; Fastify error handler maps to the default `{ statusCode, error, message, requestId }` shape.
- **Commits:** `type: subject` (`chore:`, `feat:`, `fix:`, `refactor:`, `docs:`, `test:`). No Co-Author trailer, no AI attribution.
- **Test discipline:** Vitest. Every module has at least one cross-tenant negative test. Auth has dedicated tests for bad/expired/exhausted OTP. Tap ingestion has dedupe + manual override + absent suppression tests.

---

# Phase 0 — Monorepo migration (spec §15 slice 0)

Migration is a single commit cluster. The repo currently has the frontend at the root and a `bridge/` subdir. Both move; `apps/api/` and `packages/schemas/` are added skeleton-only (real content arrives in later phases).

## Task 0.1: Install pnpm globally if not present

**Files:** none (environment check).

- [ ] **Step 1: Verify pnpm available**

Run: `pnpm --version`
Expected: prints a version like `9.x.x`. If "command not found", run `npm install -g pnpm` and re-check.

## Task 0.2: Create workspace root files

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Modify: `package.json` (replace contents)
- Modify: `.gitignore`

- [ ] **Step 1: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": false
  }
}
```

- [ ] **Step 3: Save current frontend `package.json` aside, then replace root with workspace `package.json`**

```bash
mv package.json /tmp/fyntra-web-package.json.bak
```

Now create `package.json` at repo root:

```json
{
  "name": "fyntra",
  "private": true,
  "version": "0.0.0",
  "packageManager": "pnpm@9.15.0",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "dev:web": "pnpm -F web dev",
    "dev:api": "pnpm -F api dev",
    "dev:bridge": "pnpm -F bridge dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test"
  }
}
```

- [ ] **Step 4: Extend `.gitignore` for monorepo**

Append to `.gitignore`:

```
# Monorepo
pnpm-debug.log
**/node_modules
**/dist
**/.turbo
**/.vite
**/coverage
**/.env.local
**/.env
```

- [ ] **Step 5: Verify**

Run: `cat pnpm-workspace.yaml && cat tsconfig.base.json && cat package.json`
Expected: all three files print their new contents.

No commit yet — the move happens in Task 0.3.

## Task 0.3: Move frontend to `apps/web/` with `git mv`

**Files:** every existing frontend file moves under `apps/web/`.

- [ ] **Step 1: Create `apps/web/` directory**

```bash
mkdir -p apps/web
```

- [ ] **Step 2: Move frontend files using `git mv`**

```bash
git mv src apps/web/src
git mv public apps/web/public
git mv index.html apps/web/index.html
git mv vite.config.ts apps/web/vite.config.ts
git mv vitest.setup.ts apps/web/vitest.setup.ts
git mv tailwind.config.ts apps/web/tailwind.config.ts
git mv postcss.config.js apps/web/postcss.config.js
git mv tsconfig.json apps/web/tsconfig.json
git mv tsconfig.app.json apps/web/tsconfig.app.json
git mv tsconfig.node.json apps/web/tsconfig.node.json
git mv eslint.config.js apps/web/eslint.config.js
git mv .prettierrc.json apps/web/.prettierrc.json
git mv .prettierignore apps/web/.prettierignore
git mv .env.example apps/web/.env.example
git mv .env.local apps/web/.env.local
git mv .npmrc apps/web/.npmrc
```

- [ ] **Step 3: Install the frontend's saved package.json into `apps/web/`**

```bash
mv /tmp/fyntra-web-package.json.bak apps/web/package.json
```

- [ ] **Step 4: Rename the web package**

Edit `apps/web/package.json`: change `"name": "fyntra-app"` to `"name": "web"`.

- [ ] **Step 5: Delete the stale root `package-lock.json`**

```bash
rm package-lock.json
rm -rf node_modules
```

- [ ] **Step 6: Verify file moves are staged as renames**

Run: `git status --short`
Expected: many `R  src/... -> apps/web/src/...` lines (renames). No untracked source files. `package-lock.json` shown as deleted.

## Task 0.4: Move bridge to `apps/bridge/`

**Files:** entire `bridge/` directory moves.

- [ ] **Step 1: `git mv` the bridge**

```bash
git mv bridge apps/bridge
```

- [ ] **Step 2: Rename the bridge package**

Edit `apps/bridge/package.json`: change `"name": "fyntra-bridge"` to `"name": "bridge"`.

- [ ] **Step 3: Delete the bridge's stale lockfile**

```bash
rm -f apps/bridge/package-lock.json
rm -rf apps/bridge/node_modules
rm -rf apps/bridge/dist
```

- [ ] **Step 4: Verify**

Run: `git status --short | head -20`
Expected: `R  bridge/... -> apps/bridge/...` rename lines.

## Task 0.5: Create `packages/schemas/` shell (no schema content yet)

**Files:**
- Create: `packages/schemas/package.json`
- Create: `packages/schemas/tsconfig.json`
- Create: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write `packages/schemas/package.json`**

```json
{
  "name": "@fyntra/schemas",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "types": "./src/index.ts",
  "dependencies": {
    "zod": "^3.25.0"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "echo \"no tests\"",
    "lint": "echo \"no lint\"",
    "build": "echo \"no build\""
  }
}
```

- [ ] **Step 2: Write `packages/schemas/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write a stub `packages/schemas/src/index.ts`**

```ts
export {}
```

- [ ] **Step 4: Run `pnpm install` at root**

```bash
pnpm install
```

Expected: pnpm reads `pnpm-workspace.yaml`, resolves all three workspace packages, generates `pnpm-lock.yaml`, installs all dependencies. No errors.

- [ ] **Step 5: Verify the workspace resolves**

Run: `pnpm list --depth -1`
Expected: lists `web`, `bridge`, `@fyntra/schemas` as workspace packages.

## Task 0.6: Verify the frontend still works post-move (no schemas package import yet)

**Files:** none.

- [ ] **Step 1: Run web build**

Run: `pnpm -F web build`
Expected: Vite build completes; output in `apps/web/dist`. If failures involve missing tsbuildinfo paths, that's stale `node_modules/.tmp` — re-run after `rm -rf apps/web/node_modules/.tmp`.

- [ ] **Step 2: Run web typecheck**

Run: `pnpm -F web typecheck`
Expected: zero errors.

- [ ] **Step 3: Run web lint**

Run: `pnpm -F web lint`
Expected: zero errors.

- [ ] **Step 4: Run web tests**

Run: `pnpm -F web test`
Expected: all passing (or "no tests" exit 0 — `--passWithNoTests` is already in the script).

- [ ] **Step 5: Run bridge build**

Run: `pnpm -F bridge build`
Expected: `tsc` compiles `apps/bridge/dist/index.js`. (Don't start the bridge here — that requires a physical reader.)

## Task 0.7: Commit the migration

**Files:** all of the above moves and additions.

- [ ] **Step 1: Stage everything**

```bash
git add -A
```

- [ ] **Step 2: Verify staged contents are renames + the new top-level files**

Run: `git status`
Expected: renames for frontend + bridge, new files for `pnpm-workspace.yaml`, `tsconfig.base.json`, root `package.json`, `pnpm-lock.yaml`, `packages/schemas/*`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: restructure into pnpm monorepo for phase 1.5"
```

## Task 0.8: Extract Zod schemas into `@fyntra/schemas`

**Files:**
- Modify: `packages/schemas/src/index.ts` (full content from frontend)
- Modify: `apps/web/src/types/schemas.ts` (becomes a re-export)
- Modify: `apps/web/package.json` (add `@fyntra/schemas` dependency)

- [ ] **Step 1: Copy frontend schemas verbatim into the package**

Run: `cp apps/web/src/types/schemas.ts packages/schemas/src/index.ts`

Inspect `packages/schemas/src/index.ts` — it should now be the complete schemas content (≈218 lines including all the Zod definitions from §5 of the README).

- [ ] **Step 2: Add `@fyntra/schemas` as a workspace dependency in `apps/web/package.json`**

In `apps/web/package.json` `dependencies`, add (alphabetical position):

```json
"@fyntra/schemas": "workspace:*",
```

- [ ] **Step 3: Replace `apps/web/src/types/schemas.ts` with a re-export**

```ts
export * from '@fyntra/schemas'
```

- [ ] **Step 4: Reinstall to wire the workspace symlink**

Run: `pnpm install`
Expected: `apps/web/node_modules/@fyntra/schemas` is a symlink to `packages/schemas`.

- [ ] **Step 5: Verify web builds + tests still green**

Run in parallel: `pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test && pnpm -F web build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(schemas): extract zod schemas into @fyntra/schemas"
```

## Task 0.9: Rewrite web imports to consume `@fyntra/schemas` directly

**Files:** all files in `apps/web/src/` that import from `../types/schemas` or `@/types/schemas`.

- [ ] **Step 1: Find every import of the old path**

Run: `grep -rn "from .*types/schemas" apps/web/src`
Expected: a list of files importing from `types/schemas` (relative or aliased).

- [ ] **Step 2: Rewrite each import to `@fyntra/schemas`**

For each file in the grep output, change e.g. `from '../types/schemas'` to `from '@fyntra/schemas'`. Use sed for bulk rewrite if convenient:

```bash
grep -rl "from .*types/schemas" apps/web/src | xargs sed -i '' -E "s|from ['\"][^'\"]*types/schemas['\"]|from '@fyntra/schemas'|g"
```

Then re-grep to confirm zero matches: `grep -rn "types/schemas" apps/web/src` → empty.

- [ ] **Step 3: Delete the now-unused re-export shim**

```bash
rm apps/web/src/types/schemas.ts
```

If `apps/web/src/types/` is now empty, leave it for now (any future shared web-only types will live there).

- [ ] **Step 4: Verify**

Run: `pnpm -F web typecheck && pnpm -F web lint && pnpm -F web test && pnpm -F web build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web): import schemas from @fyntra/schemas"
```

## Task 0.10: Extend `attendanceStatusSchema` to include `unverified`

The spec §9/§11 introduces an `unverified` status for the absent-job when all entry devices are offline. The frontend's existing Zod schema only has the four Phase 1 statuses. Add the fifth value to the shared schema so the backend can emit it without breaking response validation.

**Files:**
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Add `'unverified'` to the enum**

In `packages/schemas/src/index.ts`, find:

```ts
export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'left_early'])
```

Replace with:

```ts
export const attendanceStatusSchema = z.enum(['present', 'absent', 'late', 'left_early', 'unverified'])
```

- [ ] **Step 2: Verify the web still types/tests/builds**

Run: `pnpm -F web typecheck && pnpm -F web test && pnpm -F web build`
Expected: zero errors. (The frontend renders status strings; an unknown enum value would simply display as-is via i18n fallback. Pretty-rendering of `unverified` in the parent home is intentionally out of scope for Plan A — covered in Plan B / Phase 2 UI polish.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(schemas): add 'unverified' attendance status for device-offline suppression"
```

End of Phase 0. The monorepo migration is complete and verified.

---

# Phase 1 — API scaffold (spec §15 slice 1)

Bring up a Fastify server with logging, env validation, Zod type provider, error handler, and a `/health` route. No DB yet (that's Phase 2).

## Task 1.1: Initialize `apps/api/` package

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/.nvmrc`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/.env.example`

- [ ] **Step 1: Write `apps/api/package.json`**

```json
{
  "name": "api",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "typecheck": "tsc --noEmit",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "lint": "eslint .",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed.ts",
    "db:reset": "tsx src/db/reset.ts"
  },
  "dependencies": {
    "@fastify/cors": "^10.0.1",
    "@fastify/jwt": "^9.0.1",
    "@fastify/rate-limit": "^10.1.0",
    "@fastify/websocket": "^11.0.1",
    "@fyntra/schemas": "workspace:*",
    "dotenv": "^16.4.5",
    "drizzle-orm": "^0.36.0",
    "fastify": "^5.1.0",
    "fastify-plugin": "^5.0.1",
    "fastify-type-provider-zod": "^4.0.2",
    "nanoid": "^5.0.9",
    "node-cron": "^3.0.3",
    "pg": "^8.13.0",
    "pino": "^9.5.0",
    "pino-pretty": "^11.3.0",
    "uuid": "^11.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/node-cron": "^3.0.11",
    "@types/pg": "^8.11.10",
    "drizzle-kit": "^0.28.0",
    "eslint": "^9.0.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.2",
    "tsx": "^4.19.0",
    "typescript": "~5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `apps/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "noEmit": false,
    "declaration": false
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write `apps/api/.nvmrc`**

```
20
```

- [ ] **Step 4: Write `apps/api/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 10000,
  },
})
```

- [ ] **Step 5: Write `apps/api/.env.example`**

```
# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug

# Database
DATABASE_URL=postgres://fyntra:fyntra@localhost:5433/fyntra

# JWT — generate with: openssl rand -base64 32
JWT_SECRET=replace-me-with-openssl-rand-base64-32

# Reader tokens — generate with: openssl rand -base64 32
READER_TOKEN_SECRET=replace-me-with-openssl-rand-base64-32

# WhatsApp Cloud API — placeholders for dev; real creds at deploy time
WHATSAPP_PHONE_NUMBER_ID=000000000000000
WHATSAPP_ACCESS_TOKEN=PLACEHOLDER_ACCESS_TOKEN
WHATSAPP_BUSINESS_ACCOUNT_ID=000000000000000
WHATSAPP_APP_SECRET=PLACEHOLDER_APP_SECRET
WHATSAPP_DRY_RUN=true

# CORS — allow the Vite dev server during local dev
CORS_ORIGIN=http://localhost:5173
```

- [ ] **Step 6: Copy `.env.example` to `.env` for dev**

```bash
cp apps/api/.env.example apps/api/.env
```

(The placeholder JWT secret is fine for dev — it's 32-plus chars of literal `replace-me-...` text. Regenerate before any deploy with `openssl rand -base64 32`.)

- [ ] **Step 7: Install**

Run: `pnpm install`
Expected: deps resolve under `apps/api/node_modules` via the workspace.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(api): scaffold api package with workspace dependencies"
```

## Task 1.2: Env configuration with Zod

**Files:**
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/config/env.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/config/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseEnv } from './env.js'

describe('parseEnv', () => {
  it('returns parsed config for a valid env', () => {
    const result = parseEnv({
      PORT: '3000',
      NODE_ENV: 'development',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgres://x:y@localhost/db',
      JWT_SECRET: 'a'.repeat(32),
      READER_TOKEN_SECRET: 'b'.repeat(32),
      WHATSAPP_PHONE_NUMBER_ID: '1',
      WHATSAPP_ACCESS_TOKEN: 't',
      WHATSAPP_BUSINESS_ACCOUNT_ID: '1',
      WHATSAPP_APP_SECRET: 's',
      WHATSAPP_DRY_RUN: 'true',
      CORS_ORIGIN: 'http://localhost:5173',
    })
    expect(result.PORT).toBe(3000)
    expect(result.NODE_ENV).toBe('development')
    expect(result.WHATSAPP_DRY_RUN).toBe(true)
  })

  it('throws on missing required vars', () => {
    expect(() => parseEnv({})).toThrow(/JWT_SECRET/)
  })

  it('rejects short JWT_SECRET', () => {
    expect(() =>
      parseEnv({
        PORT: '3000',
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug',
        DATABASE_URL: 'postgres://x:y@localhost/db',
        JWT_SECRET: 'short',
        READER_TOKEN_SECRET: 'b'.repeat(32),
        WHATSAPP_PHONE_NUMBER_ID: '1',
        WHATSAPP_ACCESS_TOKEN: 't',
        WHATSAPP_BUSINESS_ACCOUNT_ID: '1',
        WHATSAPP_APP_SECRET: 's',
        WHATSAPP_DRY_RUN: 'true',
        CORS_ORIGIN: 'http://localhost:5173',
      }),
    ).toThrow(/JWT_SECRET/)
  })
})
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `pnpm -F api test src/config/env.test.ts`
Expected: FAIL with import resolution error (`./env.js` not found).

- [ ] **Step 3: Implement `parseEnv`**

`apps/api/src/config/env.ts`:

```ts
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  READER_TOKEN_SECRET: z.string().min(32, 'READER_TOKEN_SECRET must be at least 32 chars'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1),
  WHATSAPP_ACCESS_TOKEN: z.string().min(1),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().min(1),
  WHATSAPP_APP_SECRET: z.string().min(1),
  WHATSAPP_DRY_RUN: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  CORS_ORIGIN: z.string().min(1),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(source: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const flat = result.error.flatten().fieldErrors
    const lines = Object.entries(flat)
      .map(([k, msgs]) => `  - ${k}: ${msgs?.join(', ')}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${lines}`)
  }
  return result.data
}

let cached: Env | null = null
export function env(): Env {
  if (!cached) cached = parseEnv(process.env)
  return cached
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `pnpm -F api test src/config/env.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): env parsing with zod"
```

## Task 1.3: Logger + request ID

**Files:**
- Create: `apps/api/src/lib/logger.ts`
- Create: `apps/api/src/lib/ids.ts`

- [ ] **Step 1: Write `apps/api/src/lib/ids.ts`**

```ts
import { v7 as uuidv7 } from 'uuid'
import { nanoid } from 'nanoid'

export const newId = () => uuidv7()
export const newRequestId = () => nanoid(10)
```

- [ ] **Step 2: Write `apps/api/src/lib/logger.ts`**

```ts
import pino, { type LoggerOptions } from 'pino'
import { env } from '../config/env.js'

export function buildLoggerOptions(): LoggerOptions {
  const { NODE_ENV, LOG_LEVEL } = env()
  const base: LoggerOptions = {
    level: LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.query.token',
        'res.headers["set-cookie"]',
      ],
      remove: false,
    },
  }
  if (NODE_ENV === 'development') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    }
  }
  return base
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `pnpm -F api typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): pino logger config with auth/token redaction"
```

## Task 1.4: AppError + Fastify error handler

**Files:**
- Create: `apps/api/src/lib/errors.ts`
- Create: `apps/api/src/lib/errors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { AppError, NotFoundError, UnauthorizedError, ConflictError } from './errors.js'

describe('errors', () => {
  it('AppError carries statusCode and code', () => {
    const e = new AppError('boom', { statusCode: 418, code: 'IM_A_TEAPOT' })
    expect(e.statusCode).toBe(418)
    expect(e.code).toBe('IM_A_TEAPOT')
    expect(e.message).toBe('boom')
  })

  it('NotFoundError defaults to 404', () => {
    const e = new NotFoundError('thing')
    expect(e.statusCode).toBe(404)
  })

  it('UnauthorizedError defaults to 401', () => {
    expect(new UnauthorizedError('nope').statusCode).toBe(401)
  })

  it('ConflictError defaults to 409', () => {
    expect(new ConflictError('dup').statusCode).toBe(409)
  })
})
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `pnpm -F api test src/lib/errors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export interface AppErrorOptions {
  statusCode?: number
  code?: string
  cause?: unknown
}

export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  constructor(message: string, opts: AppErrorOptions = {}) {
    super(message)
    this.name = 'AppError'
    this.statusCode = opts.statusCode ?? 500
    this.code = opts.code ?? 'INTERNAL_ERROR'
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, { statusCode: 404, code: 'NOT_FOUND' })
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, { statusCode: 401, code: 'UNAUTHORIZED' })
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, { statusCode: 403, code: 'FORBIDDEN' })
    this.name = 'ForbiddenError'
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, { statusCode: 409, code: 'CONFLICT' })
    this.name = 'ConflictError'
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed') {
    super(message, { statusCode: 400, code: 'VALIDATION_ERROR' })
    this.name = 'ValidationError'
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, { statusCode: 429, code: 'RATE_LIMITED' })
    this.name = 'RateLimitedError'
  }
}
```

- [ ] **Step 4: Run test, confirm pass**

Run: `pnpm -F api test src/lib/errors.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): app error classes"
```

## Task 1.5: Fastify bootstrap with `/health`

**Files:**
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/modules/health/routes.ts`
- Create: `apps/api/src/modules/health/routes.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/health/routes.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'

describe('GET /health', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  it('returns 200 with ok=true and a requestId header', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9_-]{10}$/)
  })
})
```

- [ ] **Step 2: Run the test, confirm it fails**

Run: `pnpm -F api test src/modules/health/routes.test.ts`
Expected: FAIL — imports unresolved. Make sure the test sets the required env vars before the import in a setup file or in-line. Add at the top of `vitest.config.ts`:

In `apps/api/vitest.config.ts`, add a `setupFiles` entry:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./tests/setup-env.ts'],
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 10000,
  },
})
```

Create `apps/api/tests/setup-env.ts`:

```ts
process.env.PORT ??= '3000'
process.env.NODE_ENV ??= 'test'
process.env.LOG_LEVEL ??= 'silent'
process.env.DATABASE_URL ??= 'postgres://fyntra:fyntra@localhost:5433/fyntra_test'
process.env.JWT_SECRET ??= 'a'.repeat(32)
process.env.READER_TOKEN_SECRET ??= 'b'.repeat(32)
process.env.WHATSAPP_PHONE_NUMBER_ID ??= '0'
process.env.WHATSAPP_ACCESS_TOKEN ??= 'dev'
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ??= '0'
process.env.WHATSAPP_APP_SECRET ??= 'dev'
process.env.WHATSAPP_DRY_RUN ??= 'true'
process.env.CORS_ORIGIN ??= 'http://localhost:5173'
```

- [ ] **Step 3: Implement `apps/api/src/modules/health/routes.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify'

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ ok: true }))
}
```

- [ ] **Step 4: Implement `apps/api/src/app.ts`**

```ts
import Fastify, { type FastifyInstance, type FastifyError, type FastifyRequest, type FastifyReply } from 'fastify'
import cors from '@fastify/cors'
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod'
import { env } from './config/env.js'
import { buildLoggerOptions } from './lib/logger.js'
import { newRequestId } from './lib/ids.js'
import { AppError } from './lib/errors.js'
import { healthRoutes } from './modules/health/routes.js'

export async function buildApp(): Promise<FastifyInstance> {
  const e = env()
  const app = Fastify({
    logger: buildLoggerOptions(),
    genReqId: () => newRequestId(),
  }).withTypeProvider<ZodTypeProvider>()

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(cors, { origin: e.CORS_ORIGIN, credentials: true })

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id)
  })

  app.setErrorHandler((err: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
    const requestId = _req.id
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.name,
        message: err.message,
        code: err.code,
        requestId,
      })
      return
    }
    if (err.statusCode && err.statusCode < 500) {
      reply.status(err.statusCode).send({
        statusCode: err.statusCode,
        error: err.name ?? 'Error',
        message: err.message,
        requestId,
      })
      return
    }
    _req.log.error({ err }, 'unhandled error')
    reply.status(500).send({
      statusCode: 500,
      error: 'InternalServerError',
      message: 'Internal Server Error',
      requestId,
    })
  })

  await app.register(healthRoutes)

  return app
}
```

- [ ] **Step 5: Implement `apps/api/src/server.ts`**

```ts
import 'dotenv/config'
import { buildApp } from './app.js'
import { env } from './config/env.js'

const start = async () => {
  const app = await buildApp()
  try {
    const e = env()
    await app.listen({ port: e.PORT, host: '0.0.0.0' })
    app.log.info(`api listening on :${e.PORT}`)
  } catch (err) {
    app.log.error({ err }, 'failed to start')
    process.exit(1)
  }
}

void start()
```

- [ ] **Step 6: Run the test, confirm pass**

Run: `pnpm -F api test src/modules/health/routes.test.ts`
Expected: 1 passing.

- [ ] **Step 7: Manually verify dev server boots**

Run in a separate terminal: `pnpm -F api dev`
Then: `curl -i http://localhost:3000/health`
Expected: `HTTP/1.1 200 OK`, body `{"ok":true}`, header `x-request-id: <10-char id>`.
Stop the dev server (Ctrl-C).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): fastify bootstrap with zod type provider and /health"
```

---

# Phase 2 — Postgres + Drizzle schema + seed (spec §15 slice 2)

Docker Compose for Postgres, Drizzle wired, all tables migrated, seed parity with MSW.

## Task 2.1: Postgres docker-compose

**Files:**
- Create: `apps/api/docker-compose.yml`

- [ ] **Step 1: Write the compose file**

`apps/api/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: fyntra-postgres
    environment:
      POSTGRES_DB: fyntra
      POSTGRES_USER: fyntra
      POSTGRES_PASSWORD: fyntra
    ports:
      - "5433:5432"
    volumes:
      - fyntra_pg:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fyntra -d fyntra"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  fyntra_pg:
```

- [ ] **Step 2: Start it**

```bash
cd apps/api
docker compose up -d
```

Expected: container starts; `docker compose ps` shows `healthy`.

- [ ] **Step 3: Verify connectivity**

Run: `psql postgres://fyntra:fyntra@localhost:5433/fyntra -c 'select 1;'`
Expected: prints `?column?` `1`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(api): postgres docker-compose on port 5433"
```

## Task 2.2: Drizzle client + config

**Files:**
- Create: `apps/api/drizzle.config.ts`
- Create: `apps/api/src/db/client.ts`

- [ ] **Step 1: Write `apps/api/drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema/*.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://fyntra:fyntra@localhost:5433/fyntra',
  },
  casing: 'snake_case',
})
```

- [ ] **Step 2: Write `apps/api/src/db/client.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '../config/env.js'

const pool = new Pool({ connectionString: env().DATABASE_URL, max: 10 })

export const db = drizzle(pool, { casing: 'snake_case' })
export type Db = typeof db
export { pool }
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm -F api typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): drizzle client + config"
```

## Task 2.3: Schema — schools and classes

**Files:**
- Create: `apps/api/src/db/schema/schools.ts`

- [ ] **Step 1: Write the schema file**

```ts
import { sql } from 'drizzle-orm'
import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core'

export const schools = pgTable('schools', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  timezone: text('timezone').notNull().default('Asia/Karachi'),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  lateThresholdMinutes: integer('late_threshold_minutes').notNull(),
  absentThresholdMinutes: integer('absent_threshold_minutes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const classes = pgTable(
  'classes',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    teacherId: uuid('teacher_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('classes_school_idx').on(t.schoolId, t.id),
  }),
)

export type SchoolRow = typeof schools.$inferSelect
export type ClassRow = typeof classes.$inferSelect
```

(Cross-table FK `teacherId → users` is added after `users` exists; we omit it here to keep migrations linear and add it via a later ALTER if desired. The application enforces it.)

## Task 2.4: Schema — users and otp_codes

**Files:**
- Create: `apps/api/src/db/schema/auth.ts`

- [ ] **Step 1: Write the schema**

```ts
import { pgTable, uuid, text, timestamp, integer, index, pgEnum } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'

export const roleEnum = pgEnum('user_role', ['parent', 'admin', 'teacher'])
export const localeEnum = pgEnum('locale', ['en', 'ur'])

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull().unique(),
    email: text('email'),
    preferredLanguage: localeEnum('preferred_language').notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('users_school_idx').on(t.schoolId, t.id),
    byPhone: index('users_phone_idx').on(t.phone),
  }),
)

export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey(),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    salt: text('salt').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byPhone: index('otp_phone_idx').on(t.phone, t.expiresAt),
  }),
)

export type UserRow = typeof users.$inferSelect
export type OtpRow = typeof otpCodes.$inferSelect
```

## Task 2.5: Schema — students and student_guardians

**Files:**
- Create: `apps/api/src/db/schema/students.ts`

- [ ] **Step 1: Write the schema**

```ts
import { pgTable, uuid, text, timestamp, index, pgEnum, primaryKey } from 'drizzle-orm/pg-core'
import { schools, classes } from './schools.js'
import { users } from './auth.js'

export const studentStatusEnum = pgEnum('student_status', ['active', 'inactive'])
export const guardianRelationshipEnum = pgEnum('guardian_relationship', [
  'father',
  'mother',
  'guardian',
  'driver',
  'other',
])

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'restrict' }),
    fullName: text('full_name').notNull(),
    rollNumber: text('roll_number').notNull(),
    photoUrl: text('photo_url'),
    status: studentStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('students_school_idx').on(t.schoolId, t.id),
    byClass: index('students_class_idx').on(t.schoolId, t.classId),
  }),
)

export const studentGuardians = pgTable(
  'student_guardians',
  {
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    relationship: guardianRelationshipEnum('relationship'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.studentId, t.userId] }),
    bySchool: index('sg_school_idx').on(t.schoolId, t.studentId),
    byUser: index('sg_user_idx').on(t.schoolId, t.userId),
  }),
)

export type StudentRow = typeof students.$inferSelect
```

## Task 2.6: Schema — cards + audit

**Files:**
- Create: `apps/api/src/db/schema/cards.ts`

- [ ] **Step 1: Write the schema**

```ts
import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'
import { students } from './students.js'
import { users } from './auth.js'

export const cardStatusEnum = pgEnum('card_status', ['active', 'lost', 'replaced', 'deactivated'])

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    rfidUid: text('rfid_uid').notNull(),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    status: cardStatusEnum('status').notNull().default('active'),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('cards_school_idx').on(t.schoolId, t.id),
    byUidActive: index('cards_uid_active_idx').on(t.schoolId, t.rfidUid, t.status),
  }),
)

export const cardAuditActionEnum = pgEnum('card_audit_action', [
  'issued',
  'assigned',
  'replaced',
  'lost',
  'deactivated',
  'reactivated',
])

export const cardAuditEntries = pgTable(
  'card_audit_entries',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').notNull().references(() => cards.id, { onDelete: 'cascade' }),
    byUserId: uuid('by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
    action: cardAuditActionEnum('action').notNull(),
    note: text('note'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byCard: index('card_audit_card_idx').on(t.schoolId, t.cardId, t.at),
  }),
)
```

## Task 2.7: Schema — devices + device_tokens

**Files:**
- Create: `apps/api/src/db/schema/devices.ts`

- [ ] **Step 1: Write the schema**

```ts
import { pgTable, uuid, text, timestamp, index, pgEnum } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'

export const deviceDirectionEnum = pgEnum('device_direction', ['in', 'out', 'both'])
export const deviceStatusEnum = pgEnum('device_status', ['online', 'offline'])

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    direction: deviceDirectionEnum('direction').notNull(),
    status: deviceStatusEnum('status').notNull().default('offline'),
    lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('devices_school_idx').on(t.schoolId, t.id),
  }),
)

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey(),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    label: text('label').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byHash: index('device_tokens_hash_idx').on(t.tokenHash),
    byDevice: index('device_tokens_device_idx').on(t.schoolId, t.deviceId),
  }),
)
```

## Task 2.8: Schema — attendance (tap_events, attendance_records)

**Files:**
- Create: `apps/api/src/db/schema/attendance.ts`

- [ ] **Step 1: Write the schema**

```ts
import { pgTable, uuid, text, timestamp, boolean, index, pgEnum, date, unique } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'
import { students } from './students.js'
import { cards } from './cards.js'
import { devices } from './devices.js'
import { users } from './auth.js'

export const tapDirectionEnum = pgEnum('tap_direction', ['in', 'out'])
export const tapSourceEnum = pgEnum('tap_source', ['device', 'manual'])
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'present',
  'absent',
  'late',
  'left_early',
  'unverified',
])

export const tapEvents = pgTable(
  'tap_events',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id').references(() => cards.id, { onDelete: 'set null' }),
    rfidUid: text('rfid_uid').notNull(),
    deviceId: uuid('device_id').notNull().references(() => devices.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    direction: tapDirectionEnum('direction').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    source: tapSourceEnum('source').notNull(),
    manualOverrideBy: uuid('manual_override_by').references(() => users.id, { onDelete: 'set null' }),
    manualReason: text('manual_reason'),
    deduplicated: boolean('deduplicated').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('taps_school_idx').on(t.schoolId, t.occurredAt),
    byStudent: index('taps_student_idx').on(t.schoolId, t.studentId, t.occurredAt),
    byDevice: index('taps_device_idx').on(t.schoolId, t.deviceId, t.occurredAt),
  }),
)

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    firstInAt: timestamp('first_in_at', { withTimezone: true }),
    lastOutAt: timestamp('last_out_at', { withTimezone: true }),
    status: attendanceStatusEnum('status').notNull(),
    isManual: boolean('is_manual').notNull().default(false),
    leftWithoutScan: boolean('left_without_scan').notNull().default(false),
    flaggedForReview: boolean('flagged_for_review').notNull().default(false),
    cardAnomaly: boolean('card_anomaly').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStudentDate: unique('ar_student_date_uniq').on(t.studentId, t.date),
    bySchool: index('ar_school_idx').on(t.schoolId, t.date),
  }),
)
```

## Task 2.9: Schema — notifications

**Files:**
- Create: `apps/api/src/db/schema/notifications.ts`

- [ ] **Step 1: Write the schema**

```ts
import { pgTable, uuid, text, timestamp, boolean, index, pgEnum, jsonb } from 'drizzle-orm/pg-core'
import { schools } from './schools.js'
import { users } from './auth.js'
import { tapEvents } from './attendance.js'

export const notificationChannelEnum = pgEnum('notification_channel', ['whatsapp', 'sms', 'in_app'])
export const notificationStatusEnum = pgEnum('notification_status', [
  'queued',
  'sent',
  'delivered',
  'failed',
])

export const notificationLogs = pgTable(
  'notification_logs',
  {
    id: uuid('id').primaryKey(),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull(),
    eventId: uuid('event_id').references(() => tapEvents.id, { onDelete: 'set null' }),
    status: notificationStatusEnum('status').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    payload: jsonb('payload').$type<{ title: string; body: string; errorMessage?: string }>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRecipient: index('notif_recipient_idx').on(t.schoolId, t.recipientUserId, t.createdAt),
  }),
)

export const notificationSettings = pgTable(
  'notification_settings',
  {
    userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
    whatsapp: boolean('whatsapp').notNull(),
    sms: boolean('sms').notNull(),
    inApp: boolean('in_app').notNull(),
    eventTapIn: boolean('event_tap_in').notNull(),
    eventTapOut: boolean('event_tap_out').notNull(),
    eventLate: boolean('event_late').notNull(),
    eventAbsent: boolean('event_absent').notNull(),
    eventManualOverride: boolean('event_manual_override').notNull(),
    eventDeviceOffline: boolean('event_device_offline').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bySchool: index('notif_settings_school_idx').on(t.schoolId, t.userId),
  }),
)
```

## Task 2.10: Generate and apply the initial migration

**Files:**
- Create: `apps/api/src/db/migrations/0000_*.sql` (drizzle-kit generated)
- Create: `apps/api/src/db/migrate.ts`

- [ ] **Step 1: Generate the migration**

```bash
pnpm -F api db:generate
```

Expected: drizzle-kit reads all schema files and emits a single `0000_*.sql` file under `apps/api/src/db/migrations/`. Inspect it — it should contain `CREATE TYPE` for every enum and `CREATE TABLE` for every table defined above.

- [ ] **Step 2: Write `apps/api/src/db/migrate.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { env } from '../config/env.js'

async function run() {
  const pool = new Pool({ connectionString: env().DATABASE_URL, max: 1 })
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  await pool.end()
  console.log('migrations applied')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 3: Apply the migration**

```bash
pnpm -F api db:migrate
```

Expected: prints `migrations applied`. Inspect the DB:

```bash
psql postgres://fyntra:fyntra@localhost:5433/fyntra -c '\dt'
```

Expected: lists all 11 tables (schools, classes, users, otp_codes, students, student_guardians, cards, card_audit_entries, devices, device_tokens, tap_events, attendance_records, notification_logs, notification_settings) plus `__drizzle_migrations`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): initial drizzle schema + migration"
```

## Task 2.11: Seed script — parity with MSW (1 school, 4 classes, 60 students, 60 parents, 3 admins, 4 teachers, 2 devices)

**Files:**
- Create: `apps/api/src/db/seed.ts`
- Create: `apps/api/src/db/reset.ts`
- Create: `apps/api/src/lib/tokens.ts`

- [ ] **Step 1: Write `apps/api/src/lib/tokens.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'

export const newDeviceToken = () => randomBytes(32).toString('base64url')
export const hashToken = (plaintext: string) =>
  createHash('sha256').update(plaintext).digest('hex')
```

- [ ] **Step 2: Write `apps/api/src/db/seed.ts`**

```ts
import 'dotenv/config'
import { db, pool } from './client.js'
import {
  schools,
  classes,
} from './schema/schools.js'
import { users, type UserRow } from './schema/auth.js'
import {
  students,
  studentGuardians,
} from './schema/students.js'
import { cards } from './schema/cards.js'
import { devices, deviceTokens } from './schema/devices.js'
import { notificationSettings } from './schema/notifications.js'
import { newId } from '../lib/ids.js'
import { hashToken, newDeviceToken } from '../lib/tokens.js'

async function seed() {
  // --- School
  const schoolId = newId()
  await db.insert(schools).values({
    id: schoolId,
    name: 'Beaconhouse Model School — Lahore',
    address: '123 Garden Town, Lahore',
    timezone: 'Asia/Karachi',
    startTime: '07:45',
    endTime: '13:30',
    lateThresholdMinutes: 10,
    absentThresholdMinutes: 30,
  })

  // --- Teachers (4), Admins (3), Parents (60)
  const teacherIds = Array.from({ length: 4 }, () => newId())
  const adminIds = Array.from({ length: 3 }, () => newId())
  const parentIds = Array.from({ length: 60 }, () => newId())

  const teacherRows = teacherIds.map((id, i) => ({
    id,
    schoolId,
    role: 'teacher' as const,
    fullName: `Teacher ${String(i + 1).padStart(2, '0')}`,
    phone: `+9230012000${String(i + 1).padStart(2, '0')}`,
    preferredLanguage: 'en' as const,
  }))
  const adminRows = adminIds.map((id, i) => ({
    id,
    schoolId,
    role: 'admin' as const,
    fullName: `Admin ${String(i + 1).padStart(2, '0')}`,
    phone: `+9230011000${String(i + 1).padStart(2, '0')}`,
    preferredLanguage: 'en' as const,
  }))
  const parentRows: Array<typeof users.$inferInsert> = parentIds.map((id, i) => ({
    id,
    schoolId,
    role: 'parent' as const,
    fullName: `Parent ${String(i + 1).padStart(2, '0')}`,
    phone: `+9230010000${String(i + 1).padStart(2, '0')}`,
    preferredLanguage: 'en' as const,
  }))
  await db.insert(users).values([...teacherRows, ...adminRows, ...parentRows])

  // --- Classes (4)
  const classIds = teacherIds.map((_t) => newId())
  await db.insert(classes).values(
    classIds.map((id, i) => ({
      id,
      schoolId,
      name: `Grade ${i + 1} — Section A`,
      teacherId: teacherIds[i]!,
    })),
  )

  // --- Students (60, 15 per class)
  const studentIds = Array.from({ length: 60 }, () => newId())
  const studentRows = studentIds.map((id, i) => ({
    id,
    schoolId,
    classId: classIds[Math.floor(i / 15)]!,
    fullName: `Student ${String(i + 1).padStart(2, '0')}`,
    rollNumber: String(i + 1).padStart(3, '0'),
    status: 'active' as const,
  }))
  await db.insert(students).values(studentRows)

  // 1:1 student → parent (60 of each)
  await db.insert(studentGuardians).values(
    studentIds.map((studentId, i) => ({
      studentId,
      userId: parentIds[i]!,
      schoolId,
      relationship: 'guardian' as const,
    })),
  )

  // --- Cards (one active per student)
  const cardIds = studentIds.map(() => newId())
  await db.insert(cards).values(
    cardIds.map((id, i) => ({
      id,
      schoolId,
      rfidUid: `SEED${String(i + 1).padStart(8, '0')}`,
      studentId: studentIds[i]!,
      status: 'active' as const,
    })),
  )

  // --- Devices (2) with plaintext tokens printed once
  const deviceA = newId()
  const deviceB = newId()
  await db.insert(devices).values([
    { id: deviceA, schoolId, label: 'Main Gate', direction: 'both', status: 'offline' },
    { id: deviceB, schoolId, label: 'Side Gate', direction: 'both', status: 'offline' },
  ])
  const plainA = newDeviceToken()
  const plainB = newDeviceToken()
  await db.insert(deviceTokens).values([
    { id: newId(), deviceId: deviceA, schoolId, tokenHash: hashToken(plainA), label: 'Main Gate dev token' },
    { id: newId(), deviceId: deviceB, schoolId, tokenHash: hashToken(plainB), label: 'Side Gate dev token' },
  ])

  // --- Notification settings (default per role) for every user
  const allUserRows: UserRow[] = [...teacherRows, ...adminRows, ...parentRows].map((r) => ({
    ...r,
    email: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as UserRow[]
  await db.insert(notificationSettings).values(
    allUserRows.map((u) => ({
      userId: u.id,
      schoolId,
      whatsapp: true,
      sms: false,
      inApp: true,
      eventTapIn: true,
      eventTapOut: true,
      eventLate: true,
      eventAbsent: true,
      eventManualOverride: true,
      eventDeviceOffline: u.role !== 'parent',
    })),
  )

  console.log('seed complete')
  console.log('')
  console.log('--- Device tokens (save these; not shown again) ---')
  console.log(`Main Gate (${deviceA}): ${plainA}`)
  console.log(`Side Gate (${deviceB}): ${plainB}`)
  console.log('')
}

seed()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => pool.end())
```

- [ ] **Step 3: Write `apps/api/src/db/reset.ts`**

```ts
import 'dotenv/config'
import { pool } from './client.js'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'

async function reset() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('db:reset is disabled in production')
  }
  if (process.env.CONFIRM !== 'yes') {
    throw new Error('refusing to drop. set CONFIRM=yes to proceed.')
  }
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;")
  const db = drizzle(pool)
  await migrate(db, { migrationsFolder: './src/db/migrations' })
  console.log('reset + migrated')
  await pool.end()
}

reset().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

- [ ] **Step 4: Run seed**

```bash
pnpm -F api db:seed
```

Expected: prints `seed complete`, prints two device-token lines. **Copy them somewhere** — they're needed in Phase 5.

- [ ] **Step 5: Verify counts**

```bash
psql postgres://fyntra:fyntra@localhost:5433/fyntra -c "
select 'schools' as t, count(*) from schools union all
select 'classes', count(*) from classes union all
select 'users', count(*) from users union all
select 'students', count(*) from students union all
select 'cards', count(*) from cards union all
select 'devices', count(*) from devices union all
select 'notification_settings', count(*) from notification_settings;
"
```

Expected: schools=1, classes=4, users=67, students=60, cards=60, devices=2, notification_settings=67.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): seed mirrors msw fixture (60/60/3/4/4/2)"
```

---

# Phase 3 — Auth + OTP (spec §15 slice 3)

OTP via WhatsApp Cloud API (dry-run by default in dev), JWT issuance, `/me`. Plus the `TenantContext` decorator and `require-auth` middleware.

## Task 3.1: Tenant context type + JWT plugin

**Files:**
- Create: `apps/api/src/types/tenant-context.ts`
- Create: `apps/api/src/middleware/tenant-context.ts`
- Create: `apps/api/src/middleware/require-auth.ts`
- Create: `apps/api/src/middleware/require-role.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write the tenant context type**

`apps/api/src/types/tenant-context.ts`:

```ts
import type { Role } from '@fyntra/schemas'

export interface TenantContext {
  schoolId: string
  userId: string
  role: Role
}

export interface JwtPayload {
  userId: string
  schoolId: string
  role: Role
}
```

- [ ] **Step 2: Declare module augmentation for Fastify decorators**

`apps/api/src/types/fastify.d.ts`:

```ts
import type { TenantContext, JwtPayload } from './tenant-context.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}
```

- [ ] **Step 3: Write `apps/api/src/middleware/require-auth.ts`**

```ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import { UnauthorizedError } from '../lib/errors.js'

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  try {
    await req.jwtVerify()
  } catch {
    throw new UnauthorizedError('Invalid or missing token')
  }
  const payload = req.user
  req.tenantContext = {
    schoolId: payload.schoolId,
    userId: payload.userId,
    role: payload.role,
  }
}
```

- [ ] **Step 4: Write `apps/api/src/middleware/require-role.ts`**

```ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Role } from '@fyntra/schemas'
import { ForbiddenError } from '../lib/errors.js'

export function requireRole(roles: Role[]) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!req.tenantContext) throw new ForbiddenError()
    if (!roles.includes(req.tenantContext.role)) throw new ForbiddenError()
  }
}
```

- [ ] **Step 5: Register `@fastify/jwt` in `app.ts`**

Modify `apps/api/src/app.ts` — add the JWT plugin right after CORS registration:

```ts
import jwt from '@fastify/jwt'
// ...
await app.register(jwt, { secret: e.JWT_SECRET })
```

- [ ] **Step 6: Typecheck**

Run: `pnpm -F api typecheck`
Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): tenant context types + jwt + auth/role middleware"
```

## Task 3.2: WhatsApp service (dry-run capable)

**Files:**
- Create: `apps/api/src/services/whatsapp.ts`
- Create: `apps/api/src/services/whatsapp.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/services/whatsapp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendTemplate } from './whatsapp.js'

const fetchMock = vi.fn()
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('sendTemplate', () => {
  it('returns dry-run when WHATSAPP_DRY_RUN=true', async () => {
    process.env.WHATSAPP_DRY_RUN = 'true'
    const result = await sendTemplate({
      to: '+923001000001',
      name: 'fyntra_otp',
      languageCode: 'en',
      variables: ['1234'],
    })
    expect(result.dryRun).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

(We're intentionally not testing the live path in unit tests — the auth integration test exercises it through `dryRun=true`.)

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm -F api test src/services/whatsapp.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement**

`apps/api/src/services/whatsapp.ts`:

```ts
import { env } from '../config/env.js'

export interface SendTemplateInput {
  to: string
  name: string
  languageCode: string
  variables: string[]
}

export interface SendResult {
  dryRun: boolean
  status: 'sent' | 'failed'
  messageId?: string
  errorMessage?: string
}

export async function sendTemplate(input: SendTemplateInput): Promise<SendResult> {
  const e = env()
  if (e.WHATSAPP_DRY_RUN) {
    return { dryRun: true, status: 'sent' }
  }
  const url = `https://graph.facebook.com/v22.0/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`
  const body = {
    messaging_product: 'whatsapp',
    to: input.to.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: input.name,
      language: { code: input.languageCode },
      components:
        input.variables.length > 0
          ? [
              {
                type: 'body',
                parameters: input.variables.map((text) => ({ type: 'text', text })),
              },
            ]
          : [],
    },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    return { dryRun: false, status: 'failed', errorMessage: `HTTP ${res.status}: ${text}` }
  }
  const json = (await res.json()) as { messages?: Array<{ id: string }> }
  return { dryRun: false, status: 'sent', messageId: json.messages?.[0]?.id }
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `pnpm -F api test src/services/whatsapp.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): whatsapp cloud api client with dry-run support"
```

## Task 3.3: OTP repository + service

**Files:**
- Create: `apps/api/src/modules/auth/repository.ts`
- Create: `apps/api/src/modules/auth/service.ts`
- Create: `apps/api/src/modules/auth/service.test.ts`
- Create: `apps/api/tests/helpers/db.ts` (test reset helper)

- [ ] **Step 1: Write the db reset helper**

`apps/api/tests/helpers/db.ts`:

```ts
import { db } from '../../src/db/client.js'
import {
  schools,
  classes,
} from '../../src/db/schema/schools.js'
import { users, otpCodes } from '../../src/db/schema/auth.js'
import { students, studentGuardians } from '../../src/db/schema/students.js'
import { cards, cardAuditEntries } from '../../src/db/schema/cards.js'
import { devices, deviceTokens } from '../../src/db/schema/devices.js'
import { tapEvents, attendanceRecords } from '../../src/db/schema/attendance.js'
import { notificationLogs, notificationSettings } from '../../src/db/schema/notifications.js'

export async function truncateAll() {
  // children first, then parents
  await db.delete(notificationLogs)
  await db.delete(notificationSettings)
  await db.delete(attendanceRecords)
  await db.delete(tapEvents)
  await db.delete(cardAuditEntries)
  await db.delete(cards)
  await db.delete(deviceTokens)
  await db.delete(devices)
  await db.delete(studentGuardians)
  await db.delete(students)
  await db.delete(otpCodes)
  await db.delete(users)
  await db.delete(classes)
  await db.delete(schools)
}
```

- [ ] **Step 2: Write `apps/api/src/modules/auth/repository.ts`**

```ts
import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { otpCodes, users } from '../../db/schema/auth.js'
import { newId } from '../../lib/ids.js'

export interface OtpInsert {
  phone: string
  codeHash: string
  salt: string
  expiresAt: Date
}

export const authRepo = {
  async insertOtp(input: OtpInsert) {
    const id = newId()
    await db.insert(otpCodes).values({ id, ...input })
    return id
  },
  async findActiveOtp(phone: string, now: Date) {
    const rows = await db
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.phone, phone),
          isNull(otpCodes.consumedAt),
          gt(otpCodes.expiresAt, now),
        ),
      )
      .orderBy(desc(otpCodes.createdAt))
      .limit(1)
    return rows[0]
  },
  async incrementOtpAttempts(id: string) {
    const row = await db
      .select()
      .from(otpCodes)
      .where(eq(otpCodes.id, id))
      .limit(1)
    const current = row[0]?.attempts ?? 0
    await db.update(otpCodes).set({ attempts: current + 1 }).where(eq(otpCodes.id, id))
    return current + 1
  },
  async markOtpConsumed(id: string, at: Date) {
    await db.update(otpCodes).set({ consumedAt: at }).where(eq(otpCodes.id, id))
  },
  async findUserByPhone(phone: string) {
    const rows = await db.select().from(users).where(eq(users.phone, phone)).limit(1)
    return rows[0]
  },
}
```

- [ ] **Step 3: Write `apps/api/src/modules/auth/service.ts`**

```ts
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { authRepo } from './repository.js'
import { sendTemplate } from '../../services/whatsapp.js'
import { UnauthorizedError, ValidationError } from '../../lib/errors.js'

const OTP_TTL_MS = 5 * 60 * 1000
const MAX_ATTEMPTS = 3

function generateOtp(): string {
  // 0000..9999, zero-padded
  return String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, '0')
}

function hashOtp(code: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${code}`).digest('hex')
}

export async function requestOtp(phone: string): Promise<{ ok: true }> {
  if (!/^\+\d{8,15}$/.test(phone)) throw new ValidationError('Invalid phone format')
  const code = generateOtp()
  const salt = randomBytes(16).toString('hex')
  const codeHash = hashOtp(code, salt)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS)
  await authRepo.insertOtp({ phone, codeHash, salt, expiresAt })

  await sendTemplate({
    to: phone,
    name: 'fyntra_otp',
    languageCode: 'en',
    variables: [code],
  })
  return { ok: true }
}

export interface VerifyOtpResult {
  userId: string
  schoolId: string
  role: 'parent' | 'admin' | 'teacher'
  user: {
    id: string
    role: 'parent' | 'admin' | 'teacher'
    fullName: string
    phone: string
    email?: string
    preferredLanguage: 'en' | 'ur'
    schoolId: string
  }
}

export async function verifyOtp(phone: string, otp: string): Promise<VerifyOtpResult> {
  if (!/^\d{4}$/.test(otp)) throw new ValidationError('Invalid OTP format')
  const now = new Date()
  const row = await authRepo.findActiveOtp(phone, now)
  if (!row) throw new UnauthorizedError('OTP invalid or expired')
  const candidateHash = hashOtp(otp, row.salt)
  const stored = Buffer.from(row.codeHash, 'hex')
  const candidate = Buffer.from(candidateHash, 'hex')
  const matches = stored.length === candidate.length && timingSafeEqual(stored, candidate)
  if (!matches) {
    const attempts = await authRepo.incrementOtpAttempts(row.id)
    if (attempts >= MAX_ATTEMPTS) await authRepo.markOtpConsumed(row.id, now)
    throw new UnauthorizedError('OTP invalid or expired')
  }
  await authRepo.markOtpConsumed(row.id, now)

  const user = await authRepo.findUserByPhone(phone)
  if (!user) throw new UnauthorizedError('No account for this phone')
  return {
    userId: user.id,
    schoolId: user.schoolId,
    role: user.role,
    user: {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email ?? undefined,
      preferredLanguage: user.preferredLanguage,
      schoolId: user.schoolId,
    },
  }
}
```

- [ ] **Step 4: Write the failing service test**

`apps/api/src/modules/auth/service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { newId } from '../../lib/ids.js'
import { requestOtp, verifyOtp } from './service.js'
import { authRepo } from './repository.js'

const phone = '+923001000099'

async function seedUser() {
  const schoolId = newId()
  const teacherId = newId()
  const userId = newId()
  await db.insert(schools).values({
    id: schoolId,
    name: 's',
    address: 'a',
    startTime: '07:45',
    endTime: '13:30',
    lateThresholdMinutes: 10,
    absentThresholdMinutes: 30,
  })
  await db.insert(users).values({
    id: teacherId,
    schoolId,
    role: 'teacher',
    fullName: 'T',
    phone: '+923001200099',
    preferredLanguage: 'en',
  })
  await db.insert(classes).values({
    id: newId(),
    schoolId,
    name: 'c',
    teacherId,
  })
  await db.insert(users).values({
    id: userId,
    schoolId,
    role: 'parent',
    fullName: 'P',
    phone,
    preferredLanguage: 'en',
  })
  return { schoolId, userId }
}

describe('auth service', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('issues OTP and verifies happy path', async () => {
    await seedUser()
    await requestOtp(phone)
    const row = await authRepo.findActiveOtp(phone, new Date())
    expect(row).toBeDefined()
    // Reconstruct the plaintext code by brute force (0000..9999) using the salt and hash.
    // For the test we accept that timing matters less than correctness:
    const { createHash } = await import('node:crypto')
    let code: string | null = null
    for (let i = 0; i < 10000; i++) {
      const candidate = String(i).padStart(4, '0')
      const hash = createHash('sha256').update(`${row!.salt}:${candidate}`).digest('hex')
      if (hash === row!.codeHash) {
        code = candidate
        break
      }
    }
    expect(code).not.toBeNull()
    const result = await verifyOtp(phone, code!)
    expect(result.user.phone).toBe(phone)
    expect(result.user.role).toBe('parent')
  })

  it('rejects wrong OTP and bumps attempts', async () => {
    await seedUser()
    await requestOtp(phone)
    await expect(verifyOtp(phone, '0000')).rejects.toThrow(/invalid or expired/i)
    const row = await authRepo.findActiveOtp(phone, new Date())
    expect(row?.attempts).toBe(1)
  })

  it('locks after 3 attempts', async () => {
    await seedUser()
    await requestOtp(phone)
    await expect(verifyOtp(phone, '0000')).rejects.toThrow()
    await expect(verifyOtp(phone, '0001')).rejects.toThrow()
    await expect(verifyOtp(phone, '0002')).rejects.toThrow()
    const row = await authRepo.findActiveOtp(phone, new Date())
    expect(row).toBeUndefined() // consumed after lockout
  })

  it('rejects unknown phone', async () => {
    await expect(verifyOtp('+923001000098', '1234')).rejects.toThrow(/invalid or expired/i)
  })
})
```

- [ ] **Step 5: Run the auth service tests**

Run: `pnpm -F api test src/modules/auth/service.test.ts`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): otp service with attempts + lockout"
```

## Task 3.4: Auth routes + rate limit + `/me`

**Files:**
- Create: `apps/api/src/modules/auth/routes.ts`
- Create: `apps/api/src/modules/me/routes.ts`
- Create: `apps/api/src/modules/me/service.ts`
- Create: `apps/api/src/modules/me/repository.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/tests/e2e/auth.test.ts`

- [ ] **Step 1: Write the failing e2e test**

`apps/api/tests/e2e/auth.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { buildApp } from '../../src/app.js'
import { truncateAll } from '../helpers/db.js'
import { db, pool } from '../../src/db/client.js'
import { schools, classes } from '../../src/db/schema/schools.js'
import { users } from '../../src/db/schema/auth.js'
import { otpCodes } from '../../src/db/schema/auth.js'
import { eq } from 'drizzle-orm'
import { newId } from '../../src/lib/ids.js'

let app: FastifyInstance

const parentPhone = '+923001000099'

async function seedParent() {
  const schoolId = newId()
  const teacherId = newId()
  await db.insert(schools).values({
    id: schoolId,
    name: 's',
    address: 'a',
    startTime: '07:45',
    endTime: '13:30',
    lateThresholdMinutes: 10,
    absentThresholdMinutes: 30,
  })
  await db.insert(users).values({
    id: teacherId,
    schoolId,
    role: 'teacher',
    fullName: 'T',
    phone: '+923001200099',
    preferredLanguage: 'en',
  })
  await db.insert(classes).values({ id: newId(), schoolId, name: 'c', teacherId })
  await db.insert(users).values({
    id: newId(),
    schoolId,
    role: 'parent',
    fullName: 'P',
    phone: parentPhone,
    preferredLanguage: 'en',
  })
}

async function readOtp(phone: string): Promise<string> {
  const rows = await db.select().from(otpCodes).where(eq(otpCodes.phone, phone))
  const row = rows[rows.length - 1]!
  for (let i = 0; i < 10000; i++) {
    const candidate = String(i).padStart(4, '0')
    if (createHash('sha256').update(`${row.salt}:${candidate}`).digest('hex') === row.codeHash) {
      return candidate
    }
  }
  throw new Error('could not find code')
}

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
  await pool.end()
})
beforeEach(async () => {
  await truncateAll()
})

describe('auth flow', () => {
  it('request-otp → verify-otp → /me', async () => {
    await seedParent()
    const req1 = await app.inject({
      method: 'POST',
      url: '/auth/request-otp',
      payload: { phone: parentPhone },
    })
    expect(req1.statusCode).toBe(200)
    expect(req1.json()).toEqual({ ok: true })

    const code = await readOtp(parentPhone)

    const req2 = await app.inject({
      method: 'POST',
      url: '/auth/verify-otp',
      payload: { phone: parentPhone, otp: code },
    })
    expect(req2.statusCode).toBe(200)
    const { token, user } = req2.json() as { token: string; user: { phone: string; role: string } }
    expect(user.phone).toBe(parentPhone)
    expect(user.role).toBe('parent')

    const req3 = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(req3.statusCode).toBe(200)
    const me = req3.json() as { user: { role: string }; school: { id: string } }
    expect(me.user.role).toBe('parent')
    expect(me.school.id).toBeTypeOf('string')
  })

  it('rejects /me without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm -F api test tests/e2e/auth.test.ts`
Expected: import failures for `routes.ts` files.

- [ ] **Step 3: Write `apps/api/src/modules/auth/routes.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  requestOtpRequestSchema,
  verifyOtpRequestSchema,
  verifyOtpResponseSchema,
  okResponseSchema,
} from '@fyntra/schemas'
import { requestOtp, verifyOtp } from './service.js'

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/auth/request-otp',
    {
      schema: {
        body: requestOtpRequestSchema,
        response: { 200: okResponseSchema },
      },
      config: {
        rateLimit: { max: 5, timeWindow: '1 hour', keyGenerator: (req) => (req.body as { phone?: string })?.phone ?? req.ip },
      },
    },
    async (req) => {
      const { phone } = req.body as z.infer<typeof requestOtpRequestSchema>
      return await requestOtp(phone)
    },
  )

  app.post(
    '/auth/verify-otp',
    {
      schema: {
        body: verifyOtpRequestSchema,
        response: { 200: verifyOtpResponseSchema },
      },
      config: {
        rateLimit: { max: 10, timeWindow: '15 minutes' },
      },
    },
    async (req) => {
      const { phone, otp } = req.body as z.infer<typeof verifyOtpRequestSchema>
      const result = await verifyOtp(phone, otp)
      const token = app.jwt.sign(
        { userId: result.userId, schoolId: result.schoolId, role: result.role },
        { expiresIn: '30d' },
      )
      return { token, user: result.user }
    },
  )
}
```

- [ ] **Step 4: Write `apps/api/src/modules/me/repository.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { users } from '../../db/schema/auth.js'
import type { TenantContext } from '../../types/tenant-context.js'

export const meRepo = {
  async user(ctx: TenantContext) {
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.schoolId, ctx.schoolId), eq(users.id, ctx.userId)))
      .limit(1)
    return rows[0]
  },
  async school(ctx: TenantContext) {
    const rows = await db.select().from(schools).where(eq(schools.id, ctx.schoolId)).limit(1)
    return rows[0]
  },
  async children(ctx: TenantContext) {
    return db
      .select({
        id: students.id,
        fullName: students.fullName,
        rollNumber: students.rollNumber,
        classId: students.classId,
        schoolId: students.schoolId,
        photoUrl: students.photoUrl,
        status: students.status,
      })
      .from(students)
      .innerJoin(
        studentGuardians,
        and(
          eq(studentGuardians.studentId, students.id),
          eq(studentGuardians.userId, ctx.userId),
        ),
      )
      .where(eq(students.schoolId, ctx.schoolId))
  },
  async assignedClass(ctx: TenantContext) {
    const rows = await db
      .select()
      .from(classes)
      .where(and(eq(classes.schoolId, ctx.schoolId), eq(classes.teacherId, ctx.userId)))
      .limit(1)
    return rows[0]
  },
}
```

- [ ] **Step 5: Write `apps/api/src/modules/me/service.ts`**

```ts
import { NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { meRepo } from './repository.js'

export async function getMe(ctx: TenantContext) {
  const [user, school] = await Promise.all([meRepo.user(ctx), meRepo.school(ctx)])
  if (!user || !school) throw new NotFoundError('Account not found')
  const out: {
    user: typeof user
    school: typeof school
    children?: Awaited<ReturnType<typeof meRepo.children>>
    assignedClass?: Awaited<ReturnType<typeof meRepo.assignedClass>>
  } = { user, school }
  if (ctx.role === 'parent') out.children = await meRepo.children(ctx)
  if (ctx.role === 'teacher') {
    const cls = await meRepo.assignedClass(ctx)
    if (cls) out.assignedClass = cls
  }
  return out
}
```

- [ ] **Step 6: Write `apps/api/src/modules/me/routes.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { getMe } from './service.js'

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const ctx = req.tenantContext!
    const result = await getMe(ctx)
    return {
      user: {
        id: result.user.id,
        role: result.user.role,
        fullName: result.user.fullName,
        phone: result.user.phone,
        email: result.user.email ?? undefined,
        preferredLanguage: result.user.preferredLanguage,
        schoolId: result.user.schoolId,
      },
      school: {
        id: result.school.id,
        name: result.school.name,
        address: result.school.address,
        timezone: 'Asia/Karachi' as const,
        startTime: result.school.startTime,
        endTime: result.school.endTime,
        lateThresholdMinutes: result.school.lateThresholdMinutes,
        absentThresholdMinutes: result.school.absentThresholdMinutes,
      },
      children: result.children?.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        rollNumber: c.rollNumber,
        classId: c.classId,
        schoolId: c.schoolId,
        guardianIds: [],
        photoUrl: c.photoUrl ?? undefined,
        status: c.status,
      })),
      assignedClass: result.assignedClass
        ? {
            id: result.assignedClass.id,
            name: result.assignedClass.name,
            teacherId: result.assignedClass.teacherId,
            schoolId: result.assignedClass.schoolId,
          }
        : undefined,
    }
  })
}
```

- [ ] **Step 7: Register routes + rate limit in `app.ts`**

Modify `apps/api/src/app.ts`. Add imports:

```ts
import rateLimit from '@fastify/rate-limit'
import { authRoutes } from './modules/auth/routes.js'
import { meRoutes } from './modules/me/routes.js'
```

Right after JWT registration:

```ts
await app.register(rateLimit, { global: true, max: 100, timeWindow: '1 minute' })
```

Right after `healthRoutes` registration:

```ts
await app.register(authRoutes)
await app.register(meRoutes)
```

- [ ] **Step 8: Run the e2e auth test**

Run: `pnpm -F api test tests/e2e/auth.test.ts`
Expected: 2 passing.

- [ ] **Step 9: Manual end-to-end with curl + dry-run WhatsApp**

In one terminal: `pnpm -F api dev`
In another:

```bash
# Pick a parent phone from the seeded list. Then:
curl -s -X POST http://localhost:3000/auth/request-otp \
  -H 'content-type: application/json' \
  -d '{"phone":"+923001000001"}'
# expect: {"ok":true}
```

Recover the OTP by querying the DB (dev only):

```bash
psql postgres://fyntra:fyntra@localhost:5433/fyntra -c \
  "select code_hash, salt from otp_codes order by created_at desc limit 1;"
```

(For local dev you can temporarily log the plaintext OTP from `service.ts` behind `if (env().NODE_ENV === 'development')` — optional polish, not part of this task.)

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(api): auth routes + /me with rate limits"
```

---

# Phase 4 — First tenant-scoped CRUD: `/students` (spec §15 slice 4)

Establishes the repo→service→route pattern with explicit cross-tenant negative test.

## Task 4.1: Students repository, service, routes, and tenant test

**Files:**
- Create: `apps/api/src/modules/students/repository.ts`
- Create: `apps/api/src/modules/students/service.ts`
- Create: `apps/api/src/modules/students/routes.ts`
- Create: `apps/api/src/modules/students/students.test.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write the failing test (includes tenant negative)**

`apps/api/src/modules/students/students.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../app.js'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db, pool } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { newId } from '../../lib/ids.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
  await pool.end()
})
beforeEach(async () => {
  await truncateAll()
})

async function seedTwoSchools() {
  const schoolA = newId()
  const schoolB = newId()
  const teacherA = newId()
  const teacherB = newId()
  await db.insert(schools).values([
    { id: schoolA, name: 'A', address: 'a', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
    { id: schoolB, name: 'B', address: 'b', startTime: '07:45', endTime: '13:30', lateThresholdMinutes: 10, absentThresholdMinutes: 30 },
  ])
  await db.insert(users).values([
    { id: teacherA, schoolId: schoolA, role: 'teacher', fullName: 'TA', phone: '+923001200090', preferredLanguage: 'en' },
    { id: teacherB, schoolId: schoolB, role: 'teacher', fullName: 'TB', phone: '+923001200091', preferredLanguage: 'en' },
  ])
  const classA = newId()
  const classB = newId()
  await db.insert(classes).values([
    { id: classA, schoolId: schoolA, name: 'CA', teacherId: teacherA },
    { id: classB, schoolId: schoolB, name: 'CB', teacherId: teacherB },
  ])
  const adminA = newId()
  await db.insert(users).values({
    id: adminA, schoolId: schoolA, role: 'admin', fullName: 'AdminA', phone: '+923001100090', preferredLanguage: 'en',
  })
  const studentA = newId()
  const studentB = newId()
  await db.insert(students).values([
    { id: studentA, schoolId: schoolA, classId: classA, fullName: 'SA', rollNumber: '001', status: 'active' },
    { id: studentB, schoolId: schoolB, classId: classB, fullName: 'SB', rollNumber: '001', status: 'active' },
  ])
  return { schoolA, schoolB, adminA, studentA, studentB }
}

function token(app: FastifyInstance, payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }) {
  return app.jwt.sign(payload, { expiresIn: '1h' })
}

describe('GET /students', () => {
  it('returns only students from the caller’s school', async () => {
    const { schoolA, adminA, studentA } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: '/students',
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Array<{ id: string }>
    expect(body.map((s) => s.id)).toEqual([studentA])
  })

  it('returns 404 when admin of school A fetches student of school B', async () => {
    const { schoolA, adminA, studentB } = await seedTwoSchools()
    const t = token(app, { userId: adminA, schoolId: schoolA, role: 'admin' })
    const res = await app.inject({
      method: 'GET',
      url: `/students/${studentB}`,
      headers: { authorization: `Bearer ${t}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm -F api test src/modules/students/students.test.ts`
Expected: import failures.

- [ ] **Step 3: Implement `apps/api/src/modules/students/repository.ts`**

```ts
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { users } from '../../db/schema/auth.js'
import type { TenantContext } from '../../types/tenant-context.js'

export interface ListStudentsFilters {
  classId?: string
  search?: string
  guardianId?: string
}

export const studentsRepo = {
  async list(ctx: TenantContext, filters: ListStudentsFilters) {
    const conditions = [eq(students.schoolId, ctx.schoolId)]
    if (filters.classId) conditions.push(eq(students.classId, filters.classId))
    if (filters.search) conditions.push(ilike(students.fullName, `%${filters.search}%`))

    let rows
    if (filters.guardianId) {
      const guardianId = filters.guardianId === 'me' ? ctx.userId : filters.guardianId
      const studentIdsSub = await db
        .select({ studentId: studentGuardians.studentId })
        .from(studentGuardians)
        .where(
          and(
            eq(studentGuardians.schoolId, ctx.schoolId),
            eq(studentGuardians.userId, guardianId),
          ),
        )
      const ids = studentIdsSub.map((r) => r.studentId)
      if (ids.length === 0) return []
      rows = await db
        .select()
        .from(students)
        .where(and(...conditions, inArray(students.id, ids)))
    } else {
      rows = await db
        .select()
        .from(students)
        .where(and(...conditions))
    }
    return rows
  },

  async findById(ctx: TenantContext, id: string) {
    const rows = await db
      .select()
      .from(students)
      .where(and(eq(students.schoolId, ctx.schoolId), eq(students.id, id)))
      .limit(1)
    return rows[0]
  },

  async guardians(ctx: TenantContext, studentId: string) {
    return db
      .select({
        id: users.id,
        role: users.role,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        preferredLanguage: users.preferredLanguage,
        schoolId: users.schoolId,
      })
      .from(users)
      .innerJoin(studentGuardians, eq(studentGuardians.userId, users.id))
      .where(
        and(
          eq(studentGuardians.schoolId, ctx.schoolId),
          eq(studentGuardians.studentId, studentId),
        ),
      )
  },

  async guardianIds(ctx: TenantContext, studentId: string) {
    const rows = await db
      .select({ userId: studentGuardians.userId })
      .from(studentGuardians)
      .where(
        and(
          eq(studentGuardians.schoolId, ctx.schoolId),
          eq(studentGuardians.studentId, studentId),
        ),
      )
    return rows.map((r) => r.userId)
  },
}
```

- [ ] **Step 4: Implement `apps/api/src/modules/students/service.ts`**

```ts
import { NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { studentsRepo, type ListStudentsFilters } from './repository.js'

export async function listStudents(ctx: TenantContext, filters: ListStudentsFilters) {
  const rows = await studentsRepo.list(ctx, filters)
  const out = await Promise.all(
    rows.map(async (s) => ({
      id: s.id,
      fullName: s.fullName,
      rollNumber: s.rollNumber,
      classId: s.classId,
      schoolId: s.schoolId,
      guardianIds: await studentsRepo.guardianIds(ctx, s.id),
      photoUrl: s.photoUrl ?? undefined,
      status: s.status,
    })),
  )
  return out
}

export async function getStudent(ctx: TenantContext, id: string) {
  const s = await studentsRepo.findById(ctx, id)
  if (!s) throw new NotFoundError('Student not found')
  const guardians = await studentsRepo.guardians(ctx, id)
  return {
    id: s.id,
    fullName: s.fullName,
    rollNumber: s.rollNumber,
    classId: s.classId,
    schoolId: s.schoolId,
    guardianIds: guardians.map((g) => g.id),
    photoUrl: s.photoUrl ?? undefined,
    status: s.status,
    guardians: guardians.map((g) => ({
      id: g.id,
      role: g.role,
      fullName: g.fullName,
      phone: g.phone,
      email: g.email ?? undefined,
      preferredLanguage: g.preferredLanguage,
      schoolId: g.schoolId,
    })),
  }
}
```

- [ ] **Step 5: Implement `apps/api/src/modules/students/routes.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../middleware/require-auth.js'
import { listStudents, getStudent } from './service.js'

const listQuery = z.object({
  classId: z.string().optional(),
  search: z.string().optional(),
  guardianId: z.string().optional(),
})

export const studentsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/students', { preHandler: requireAuth, schema: { querystring: listQuery } }, async (req) => {
    const ctx = req.tenantContext!
    const q = req.query as z.infer<typeof listQuery>
    return await listStudents(ctx, q)
  })

  app.get('/students/:id', { preHandler: requireAuth }, async (req) => {
    const ctx = req.tenantContext!
    const { id } = req.params as { id: string }
    return await getStudent(ctx, id)
  })
}
```

- [ ] **Step 6: Register in `app.ts`**

```ts
import { studentsRoutes } from './modules/students/routes.js'
// ...
await app.register(studentsRoutes)
```

- [ ] **Step 7: Run, confirm pass**

Run: `pnpm -F api test src/modules/students/students.test.ts`
Expected: 2 passing.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(api): students list/detail with cross-tenant 404"
```

---

# Phase 5 — Tap ingestion end-to-end (spec §15 slice 5)

The big slice. `/readers/tap` + `/readers/heartbeat`, attendance compute, dedupe rule, per-school absent scheduler, in-memory pub/sub broadcaster, in-app notification log. `/ws` upgrade with JWT query-param auth + token redaction in logs.

## Task 5.1: Time helpers + realtime broker

**Files:**
- Create: `apps/api/src/lib/time.ts`
- Create: `apps/api/src/services/realtime.ts`
- Create: `apps/api/src/services/realtime.test.ts`

- [ ] **Step 1: Write `apps/api/src/lib/time.ts`**

```ts
export function ymdInKarachi(d: Date): string {
  // Asia/Karachi is fixed UTC+5 (no DST).
  const shifted = new Date(d.getTime() + 5 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const day = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseTimeOfDay(hhmm: string): { hours: number; minutes: number } {
  const m = /^([0-2]\d):([0-5]\d)$/.exec(hhmm)
  if (!m) throw new Error(`bad time of day: ${hhmm}`)
  return { hours: Number(m[1]), minutes: Number(m[2]) }
}

export function dateAtKarachiTime(ymd: string, hhmm: string): Date {
  const { hours, minutes } = parseTimeOfDay(hhmm)
  // ymd is treated as Karachi local; subtract 5h to get UTC.
  const utcMillis = Date.UTC(
    Number(ymd.slice(0, 4)),
    Number(ymd.slice(5, 7)) - 1,
    Number(ymd.slice(8, 10)),
    hours,
    minutes,
  ) - 5 * 60 * 60 * 1000
  return new Date(utcMillis)
}
```

- [ ] **Step 2: Write realtime broker test**

`apps/api/src/services/realtime.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Broker } from './realtime.js'

describe('Broker', () => {
  it('delivers messages to subscribers of a channel', () => {
    const b = new Broker()
    const received: unknown[] = []
    const unsub = b.subscribe('x', (msg) => received.push(msg))
    b.publish('x', { a: 1 })
    b.publish('y', { a: 2 })
    expect(received).toEqual([{ a: 1 }])
    unsub()
    b.publish('x', { a: 3 })
    expect(received).toEqual([{ a: 1 }])
  })
})
```

- [ ] **Step 3: Implement broker**

`apps/api/src/services/realtime.ts`:

```ts
type Listener = (msg: unknown) => void

export class Broker {
  private channels = new Map<string, Set<Listener>>()

  subscribe(channel: string, listener: Listener): () => void {
    let set = this.channels.get(channel)
    if (!set) {
      set = new Set()
      this.channels.set(channel, set)
    }
    set.add(listener)
    return () => {
      set!.delete(listener)
      if (set!.size === 0) this.channels.delete(channel)
    }
  }

  publish(channel: string, msg: unknown): void {
    const set = this.channels.get(channel)
    if (!set) return
    for (const l of set) l(msg)
  }
}

export const broker = new Broker()

export const channels = {
  school: (schoolId: string) => `tap-events:school/${schoolId}`,
  student: (studentId: string) => `tap-events:student/${studentId}`,
}
```

- [ ] **Step 4: Run, confirm pass**

Run: `pnpm -F api test src/services/realtime.test.ts`
Expected: 1 passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): in-memory broker for ws pub/sub + time helpers"
```

## Task 5.2: Attendance compute service

**Files:**
- Create: `apps/api/src/modules/attendance/repository.ts`
- Create: `apps/api/src/modules/attendance/service.ts`
- Create: `apps/api/src/modules/attendance/service.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/modules/attendance/service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students } from '../../db/schema/students.js'
import { tapEvents } from '../../db/schema/attendance.js'
import { newId } from '../../lib/ids.js'
import { recomputeAttendanceForDay } from './service.js'

async function seedOne() {
  const schoolId = newId()
  const teacherId = newId()
  const studentId = newId()
  await db.insert(schools).values({
    id: schoolId,
    name: 's', address: 'a',
    startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values({ id: teacherId, schoolId, role: 'teacher', fullName: 'T', phone: '+923001200001', preferredLanguage: 'en' })
  const classId = newId()
  await db.insert(classes).values({ id: classId, schoolId, name: 'c', teacherId })
  await db.insert(students).values({ id: studentId, schoolId, classId, fullName: 'S', rollNumber: '001', status: 'active' })
  return { schoolId, studentId }
}

describe('recomputeAttendanceForDay', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('marks present when in-tap is within late threshold', async () => {
    const { schoolId, studentId } = await seedOne()
    // 2026-05-13 07:48 Karachi = 02:48 UTC
    const occurredAt = new Date('2026-05-13T02:48:00Z')
    await db.insert(tapEvents).values({
      id: newId(), schoolId, studentId, deviceId: newId(), rfidUid: 'X',
      direction: 'in', occurredAt, source: 'device',
    })
    const rec = await recomputeAttendanceForDay(schoolId, studentId, '2026-05-13')
    expect(rec!.status).toBe('present')
    expect(rec!.firstInAt).toEqual(occurredAt)
  })

  it('marks late when in-tap is past late threshold but within absent threshold', async () => {
    const { schoolId, studentId } = await seedOne()
    // 07:58 Karachi → past 07:55 lateThreshold
    const occurredAt = new Date('2026-05-13T02:58:00Z')
    await db.insert(tapEvents).values({
      id: newId(), schoolId, studentId, deviceId: newId(), rfidUid: 'X',
      direction: 'in', occurredAt, source: 'device',
    })
    const rec = await recomputeAttendanceForDay(schoolId, studentId, '2026-05-13')
    expect(rec!.status).toBe('late')
  })

  it('marks left_early when last out is before school endTime and not late', async () => {
    const { schoolId, studentId } = await seedOne()
    const inAt = new Date('2026-05-13T02:48:00Z')   // 07:48 Karachi
    const outAt = new Date('2026-05-13T07:00:00Z')  // 12:00 Karachi (before 13:30)
    await db.insert(tapEvents).values([
      { id: newId(), schoolId, studentId, deviceId: newId(), rfidUid: 'X', direction: 'in', occurredAt: inAt, source: 'device' },
      { id: newId(), schoolId, studentId, deviceId: newId(), rfidUid: 'X', direction: 'out', occurredAt: outAt, source: 'device' },
    ])
    const rec = await recomputeAttendanceForDay(schoolId, studentId, '2026-05-13')
    expect(rec!.status).toBe('left_early')
  })

  it('late beats left_early', async () => {
    const { schoolId, studentId } = await seedOne()
    const inAt = new Date('2026-05-13T02:58:00Z')   // late
    const outAt = new Date('2026-05-13T07:00:00Z')  // early
    await db.insert(tapEvents).values([
      { id: newId(), schoolId, studentId, deviceId: newId(), rfidUid: 'X', direction: 'in', occurredAt: inAt, source: 'device' },
      { id: newId(), schoolId, studentId, deviceId: newId(), rfidUid: 'X', direction: 'out', occurredAt: outAt, source: 'device' },
    ])
    const rec = await recomputeAttendanceForDay(schoolId, studentId, '2026-05-13')
    expect(rec!.status).toBe('late')
  })
})
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm -F api test src/modules/attendance/service.test.ts`
Expected: imports fail.

- [ ] **Step 3: Implement `apps/api/src/modules/attendance/repository.ts`**

```ts
import { and, asc, eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { tapEvents, attendanceRecords } from '../../db/schema/attendance.js'
import { schools } from '../../db/schema/schools.js'
import { newId } from '../../lib/ids.js'

export const attendanceRepo = {
  async school(schoolId: string) {
    const rows = await db.select().from(schools).where(eq(schools.id, schoolId)).limit(1)
    return rows[0]
  },
  async tapsForDay(schoolId: string, studentId: string, ymd: string) {
    // Karachi is UTC+5 (no DST). Midnight Karachi for `ymd` is `ymd - 5h` UTC.
    // Using ISO offset `+05:00` because that's the Karachi offset, not `-05:00`.
    const dayStart = new Date(`${ymd}T00:00:00+05:00`)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    return db
      .select()
      .from(tapEvents)
      .where(
        and(
          eq(tapEvents.schoolId, schoolId),
          eq(tapEvents.studentId, studentId),
        ),
      )
      .orderBy(asc(tapEvents.occurredAt))
      // filter in JS to avoid drizzle date column type juggling for this prototype
      .then((rows) =>
        rows.filter(
          (r) => r.occurredAt >= dayStart && r.occurredAt < dayEnd && !r.deduplicated,
        ),
      )
  },
  async findRecord(schoolId: string, studentId: string, ymd: string) {
    const rows = await db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.schoolId, schoolId),
          eq(attendanceRecords.studentId, studentId),
          eq(attendanceRecords.date, ymd),
        ),
      )
      .limit(1)
    return rows[0]
  },
  async upsertRecord(input: {
    schoolId: string
    studentId: string
    date: string
    firstInAt: Date | null
    lastOutAt: Date | null
    status: 'present' | 'absent' | 'late' | 'left_early' | 'unverified'
    isManual: boolean
  }) {
    const existing = await this.findRecord(input.schoolId, input.studentId, input.date)
    if (existing) {
      await db
        .update(attendanceRecords)
        .set({
          firstInAt: input.firstInAt,
          lastOutAt: input.lastOutAt,
          status: input.status,
          isManual: input.isManual,
          updatedAt: new Date(),
        })
        .where(eq(attendanceRecords.id, existing.id))
      return { ...existing, ...input }
    }
    const id = newId()
    await db.insert(attendanceRecords).values({
      id,
      schoolId: input.schoolId,
      studentId: input.studentId,
      date: input.date,
      firstInAt: input.firstInAt,
      lastOutAt: input.lastOutAt,
      status: input.status,
      isManual: input.isManual,
    })
    const rec = await this.findRecord(input.schoolId, input.studentId, input.date)
    return rec!
  },
}
```

- [ ] **Step 4: Implement `apps/api/src/modules/attendance/service.ts`**

```ts
import { dateAtKarachiTime } from '../../lib/time.js'
import { attendanceRepo } from './repository.js'

export async function recomputeAttendanceForDay(
  schoolId: string,
  studentId: string,
  ymd: string,
) {
  const school = await attendanceRepo.school(schoolId)
  if (!school) return null
  const taps = await attendanceRepo.tapsForDay(schoolId, studentId, ymd)
  if (taps.length === 0) return null

  const ins = taps.filter((t) => t.direction === 'in')
  const outs = taps.filter((t) => t.direction === 'out')
  const firstInAt = ins.length > 0 ? ins[0]!.occurredAt : null
  const lastOutAt = outs.length > 0 ? outs[outs.length - 1]!.occurredAt : null

  const startUtc = dateAtKarachiTime(ymd, school.startTime)
  const endUtc = dateAtKarachiTime(ymd, school.endTime)

  let status: 'present' | 'late' | 'left_early' = 'present'
  if (firstInAt) {
    const lateAtUtc = new Date(startUtc.getTime() + school.lateThresholdMinutes * 60 * 1000)
    if (firstInAt.getTime() > lateAtUtc.getTime()) status = 'late'
  }
  if (status !== 'late' && lastOutAt && lastOutAt.getTime() < endUtc.getTime()) {
    status = 'left_early'
  }

  const isManual = taps.some((t) => t.source === 'manual')

  return await attendanceRepo.upsertRecord({
    schoolId,
    studentId,
    date: ymd,
    firstInAt,
    lastOutAt,
    status,
    isManual,
  })
}
```

- [ ] **Step 5: Run, confirm pass**

Run: `pnpm -F api test src/modules/attendance/service.test.ts`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): attendance recompute service with late-beats-left-early"
```

## Task 5.3: Reader auth helper + tap ingestion service

**Files:**
- Create: `apps/api/src/modules/readers/service.ts`
- Create: `apps/api/src/modules/readers/service.test.ts`
- Create: `apps/api/src/modules/tap-events/repository.ts`
- Create: `apps/api/src/modules/notifications/repository.ts`

- [ ] **Step 1: Write `apps/api/src/modules/tap-events/repository.ts`**

```ts
import { and, desc, eq, gte } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { tapEvents } from '../../db/schema/attendance.js'
import { newId } from '../../lib/ids.js'

export const tapEventsRepo = {
  async findRecentSameDirection(input: {
    schoolId: string
    deviceId: string
    rfidUid: string
    direction: 'in' | 'out'
    windowStart: Date
  }) {
    const rows = await db
      .select()
      .from(tapEvents)
      .where(
        and(
          eq(tapEvents.schoolId, input.schoolId),
          eq(tapEvents.deviceId, input.deviceId),
          eq(tapEvents.rfidUid, input.rfidUid),
          eq(tapEvents.direction, input.direction),
          gte(tapEvents.occurredAt, input.windowStart),
        ),
      )
      .orderBy(desc(tapEvents.occurredAt))
      .limit(1)
    return rows[0]
  },
  async insert(input: {
    schoolId: string
    cardId: string | null
    rfidUid: string
    deviceId: string
    studentId: string | null
    direction: 'in' | 'out'
    occurredAt: Date
    source: 'device' | 'manual'
    deduplicated?: boolean
    manualOverrideBy?: string
    manualReason?: string
  }) {
    const id = newId()
    await db.insert(tapEvents).values({ id, ...input, deduplicated: input.deduplicated ?? false })
    return id
  },
}
```

- [ ] **Step 2: Write `apps/api/src/modules/notifications/repository.ts`**

```ts
import { eq } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { notificationLogs, notificationSettings } from '../../db/schema/notifications.js'
import { newId } from '../../lib/ids.js'

export const notificationsRepo = {
  async findSettings(userId: string) {
    const rows = await db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, userId))
      .limit(1)
    return rows[0]
  },
  async insertLog(input: {
    schoolId: string
    recipientUserId: string
    channel: 'whatsapp' | 'sms' | 'in_app'
    eventId: string | null
    status: 'queued' | 'sent' | 'delivered' | 'failed'
    payload: { title: string; body: string; errorMessage?: string }
    sentAt: Date | null
  }) {
    const id = newId()
    await db.insert(notificationLogs).values({ id, ...input })
    return id
  },
}
```

- [ ] **Step 3: Write the failing reader-service test**

`apps/api/src/modules/readers/service.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from '../../../tests/helpers/db.js'
import { db } from '../../db/client.js'
import { schools, classes } from '../../db/schema/schools.js'
import { users } from '../../db/schema/auth.js'
import { students, studentGuardians } from '../../db/schema/students.js'
import { cards } from '../../db/schema/cards.js'
import { devices, deviceTokens } from '../../db/schema/devices.js'
import { notificationSettings } from '../../db/schema/notifications.js'
import { newId } from '../../lib/ids.js'
import { hashToken } from '../../lib/tokens.js'
import { ingestTap, resolveDeviceByToken } from './service.js'

async function seed() {
  const schoolId = newId()
  const teacherId = newId()
  const parentId = newId()
  const studentId = newId()
  const classId = newId()
  const cardId = newId()
  const deviceId = newId()
  const tokenPlain = 'devplain123_x'.padEnd(43, 'X')
  await db.insert(schools).values({
    id: schoolId, name: 's', address: 'a', startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values([
    { id: teacherId, schoolId, role: 'teacher', fullName: 'T', phone: '+923001200001', preferredLanguage: 'en' },
    { id: parentId, schoolId, role: 'parent', fullName: 'P', phone: '+923001000001', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values({ id: classId, schoolId, name: 'c', teacherId })
  await db.insert(students).values({ id: studentId, schoolId, classId, fullName: 'S', rollNumber: '001', status: 'active' })
  await db.insert(studentGuardians).values({ studentId, userId: parentId, schoolId, relationship: 'guardian' })
  await db.insert(cards).values({ id: cardId, schoolId, rfidUid: 'AABBCCDD', studentId, status: 'active' })
  await db.insert(devices).values({ id: deviceId, schoolId, label: 'gate', direction: 'both', status: 'offline' })
  await db.insert(deviceTokens).values({
    id: newId(), schoolId, deviceId, tokenHash: hashToken(tokenPlain), label: 'dev',
  })
  await db.insert(notificationSettings).values({
    userId: parentId, schoolId,
    whatsapp: false, sms: false, inApp: true,
    eventTapIn: true, eventTapOut: true, eventLate: true, eventAbsent: true,
    eventManualOverride: true, eventDeviceOffline: false,
  })
  return { schoolId, deviceId, parentId, studentId, tokenPlain }
}

describe('reader service', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('resolves device by token', async () => {
    const { tokenPlain, deviceId } = await seed()
    const ctx = await resolveDeviceByToken(tokenPlain)
    expect(ctx?.deviceId).toBe(deviceId)
  })

  it('ingests a tap, creates record, writes in-app log', async () => {
    const { tokenPlain } = await seed()
    const result = await ingestTap({
      tokenPlain,
      rfidUid: 'AABBCCDD',
      direction: 'in',
      occurredAt: new Date('2026-05-13T02:48:00Z'),
    })
    expect(result.deduplicated).toBe(false)
    expect(result.record?.status).toBe('present')
    expect(result.notificationCount).toBeGreaterThan(0)
  })

  it('dedupes a same-direction tap within 30s', async () => {
    const { tokenPlain } = await seed()
    const t0 = new Date('2026-05-13T02:48:00Z')
    await ingestTap({ tokenPlain, rfidUid: 'AABBCCDD', direction: 'in', occurredAt: t0 })
    const dupe = await ingestTap({
      tokenPlain, rfidUid: 'AABBCCDD', direction: 'in',
      occurredAt: new Date(t0.getTime() + 10_000), // 10s later
    })
    expect(dupe.deduplicated).toBe(true)
  })

  it('returns 404 for unknown rfidUid', async () => {
    const { tokenPlain } = await seed()
    await expect(
      ingestTap({ tokenPlain, rfidUid: 'NOPE', direction: 'in', occurredAt: new Date() }),
    ).rejects.toThrow(/not found/i)
  })

  it('rejects bad device token', async () => {
    await seed()
    await expect(
      ingestTap({ tokenPlain: 'invalid', rfidUid: 'AABBCCDD', direction: 'in', occurredAt: new Date() }),
    ).rejects.toThrow(/unauthorized|invalid/i)
  })
})
```

- [ ] **Step 4: Run, confirm fail**

Run: `pnpm -F api test src/modules/readers/service.test.ts`
Expected: imports fail.

- [ ] **Step 5: Implement `apps/api/src/modules/readers/service.ts`**

```ts
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../db/client.js'
import { cards } from '../../db/schema/cards.js'
import { deviceTokens, devices } from '../../db/schema/devices.js'
import { studentGuardians } from '../../db/schema/students.js'
import { hashToken } from '../../lib/tokens.js'
import { NotFoundError, UnauthorizedError } from '../../lib/errors.js'
import { ymdInKarachi } from '../../lib/time.js'
import { tapEventsRepo } from '../tap-events/repository.js'
import { recomputeAttendanceForDay } from '../attendance/service.js'
import { notificationsRepo } from '../notifications/repository.js'
import { broker, channels } from '../../services/realtime.js'

export interface ResolvedDevice {
  schoolId: string
  deviceId: string
}

export async function resolveDeviceByToken(plain: string): Promise<ResolvedDevice | null> {
  const tokenHash = hashToken(plain)
  const rows = await db
    .select({ schoolId: deviceTokens.schoolId, deviceId: deviceTokens.deviceId, revokedAt: deviceTokens.revokedAt })
    .from(deviceTokens)
    .where(eq(deviceTokens.tokenHash, tokenHash))
    .limit(1)
  const row = rows[0]
  if (!row || row.revokedAt) return null
  return { schoolId: row.schoolId, deviceId: row.deviceId }
}

const DEDUP_WINDOW_MS = 30_000

export interface IngestTapInput {
  tokenPlain: string
  rfidUid: string
  direction: 'in' | 'out'
  occurredAt: Date
}

export interface IngestTapResult {
  deduplicated: boolean
  record: Awaited<ReturnType<typeof recomputeAttendanceForDay>>
  notificationCount: number
}

export async function ingestTap(input: IngestTapInput): Promise<IngestTapResult> {
  const dev = await resolveDeviceByToken(input.tokenPlain)
  if (!dev) throw new UnauthorizedError('Invalid device token')

  // Look up active card by rfidUid in school.
  const cardRows = await db
    .select()
    .from(cards)
    .where(
      and(
        eq(cards.schoolId, dev.schoolId),
        eq(cards.rfidUid, input.rfidUid),
        eq(cards.status, 'active'),
        isNull(cards.deletedAt),
      ),
    )
    .limit(1)
  const card = cardRows[0]
  if (!card || !card.studentId) {
    // Spec §9 calls for persisting an audit `tap_events` row with cardId=null on unknown UID.
    // Plan A keeps this lightweight (just throw 404). Plan B will add the audit insert when
    // the unknown-UID admin surface is built.
    throw new NotFoundError('Card not found or unassigned')
  }

  // Dedupe: same (rfidUid, deviceId, direction) within 30s.
  const recent = await tapEventsRepo.findRecentSameDirection({
    schoolId: dev.schoolId,
    deviceId: dev.deviceId,
    rfidUid: input.rfidUid,
    direction: input.direction,
    windowStart: new Date(input.occurredAt.getTime() - DEDUP_WINDOW_MS),
  })
  if (recent) {
    await tapEventsRepo.insert({
      schoolId: dev.schoolId,
      cardId: card.id,
      rfidUid: input.rfidUid,
      deviceId: dev.deviceId,
      studentId: card.studentId,
      direction: input.direction,
      occurredAt: input.occurredAt,
      source: 'device',
      deduplicated: true,
    })
    return { deduplicated: true, record: null, notificationCount: 0 }
  }

  await tapEventsRepo.insert({
    schoolId: dev.schoolId,
    cardId: card.id,
    rfidUid: input.rfidUid,
    deviceId: dev.deviceId,
    studentId: card.studentId,
    direction: input.direction,
    occurredAt: input.occurredAt,
    source: 'device',
  })

  // Heartbeat-ish: bump device last seen.
  await db
    .update(devices)
    .set({ lastHeartbeat: new Date(), status: 'online' })
    .where(eq(devices.id, dev.deviceId))

  const ymd = ymdInKarachi(input.occurredAt)
  const record = await recomputeAttendanceForDay(dev.schoolId, card.studentId, ymd)

  // Fan out in-app notifications to guardians.
  const guardianRows = await db
    .select({ userId: studentGuardians.userId })
    .from(studentGuardians)
    .where(
      and(
        eq(studentGuardians.schoolId, dev.schoolId),
        eq(studentGuardians.studentId, card.studentId),
      ),
    )

  const eventType = input.direction === 'in' ? 'tap_in' : 'tap_out'
  let notificationCount = 0
  for (const g of guardianRows) {
    const settings = await notificationsRepo.findSettings(g.userId)
    if (!settings || !settings.inApp) continue
    const eventEnabled =
      eventType === 'tap_in' ? settings.eventTapIn : settings.eventTapOut
    if (!eventEnabled) continue
    const title = input.direction === 'in' ? 'Arrived at school' : 'Left school'
    const body = `Tap at ${input.occurredAt.toISOString()}`
    await notificationsRepo.insertLog({
      schoolId: dev.schoolId,
      recipientUserId: g.userId,
      channel: 'in_app',
      eventId: null,
      status: 'sent',
      payload: { title, body },
      sentAt: new Date(),
    })
    notificationCount++
  }

  // Broadcast on WS.
  broker.publish(channels.school(dev.schoolId), {
    type: 'tap',
    schoolId: dev.schoolId,
    studentId: card.studentId,
    direction: input.direction,
    occurredAt: input.occurredAt.toISOString(),
  })
  broker.publish(channels.student(card.studentId), {
    type: 'tap',
    schoolId: dev.schoolId,
    studentId: card.studentId,
    direction: input.direction,
    occurredAt: input.occurredAt.toISOString(),
  })

  return { deduplicated: false, record, notificationCount }
}

export async function heartbeat(tokenPlain: string, occurredAt: Date): Promise<void> {
  const dev = await resolveDeviceByToken(tokenPlain)
  if (!dev) throw new UnauthorizedError('Invalid device token')
  await db
    .update(devices)
    .set({ lastHeartbeat: occurredAt, status: 'online' })
    .where(eq(devices.id, dev.deviceId))
}
```

- [ ] **Step 6: Run, confirm pass**

Run: `pnpm -F api test src/modules/readers/service.test.ts`
Expected: 5 passing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): tap ingestion with dedupe + in-app fan-out + ws broadcast"
```

## Task 5.4: Reader routes (`/readers/tap`, `/readers/heartbeat`)

**Files:**
- Create: `apps/api/src/modules/readers/routes.ts`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/tests/e2e/readers.test.ts`

- [ ] **Step 1: Write the failing e2e test**

`apps/api/tests/e2e/readers.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'
import { truncateAll } from '../helpers/db.js'
import { db, pool } from '../../src/db/client.js'
import { schools, classes } from '../../src/db/schema/schools.js'
import { users } from '../../src/db/schema/auth.js'
import { students, studentGuardians } from '../../src/db/schema/students.js'
import { cards } from '../../src/db/schema/cards.js'
import { devices, deviceTokens } from '../../src/db/schema/devices.js'
import { notificationSettings } from '../../src/db/schema/notifications.js'
import { newId } from '../../src/lib/ids.js'
import { hashToken } from '../../src/lib/tokens.js'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})
afterAll(async () => {
  await app.close()
  await pool.end()
})
beforeEach(async () => {
  await truncateAll()
})

async function seed() {
  const schoolId = newId()
  const teacherId = newId()
  const parentId = newId()
  const studentId = newId()
  const classId = newId()
  const cardId = newId()
  const deviceId = newId()
  const tokenPlain = 'plain'.repeat(8)
  await db.insert(schools).values({
    id: schoolId, name: 's', address: 'a', startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values([
    { id: teacherId, schoolId, role: 'teacher', fullName: 'T', phone: '+923001200001', preferredLanguage: 'en' },
    { id: parentId, schoolId, role: 'parent', fullName: 'P', phone: '+923001000001', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values({ id: classId, schoolId, name: 'c', teacherId })
  await db.insert(students).values({ id: studentId, schoolId, classId, fullName: 'S', rollNumber: '001', status: 'active' })
  await db.insert(studentGuardians).values({ studentId, userId: parentId, schoolId, relationship: 'guardian' })
  await db.insert(cards).values({ id: cardId, schoolId, rfidUid: 'AABBCCDD', studentId, status: 'active' })
  await db.insert(devices).values({ id: deviceId, schoolId, label: 'gate', direction: 'both', status: 'offline' })
  await db.insert(deviceTokens).values({ id: newId(), schoolId, deviceId, tokenHash: hashToken(tokenPlain), label: 'dev' })
  await db.insert(notificationSettings).values({
    userId: parentId, schoolId,
    whatsapp: false, sms: false, inApp: true,
    eventTapIn: true, eventTapOut: true, eventLate: true, eventAbsent: true,
    eventManualOverride: true, eventDeviceOffline: false,
  })
  return { tokenPlain }
}

describe('POST /readers/tap', () => {
  it('accepts a valid tap', async () => {
    const { tokenPlain } = await seed()
    const res = await app.inject({
      method: 'POST',
      url: '/readers/tap',
      payload: {
        rfidUid: 'AABBCCDD',
        direction: 'in',
        occurredAt: new Date('2026-05-13T02:48:00Z').toISOString(),
        deviceToken: tokenPlain,
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { deduplicated: boolean }
    expect(body.deduplicated).toBe(false)
  })

  it('rejects a bad device token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/readers/tap',
      payload: { rfidUid: 'X', direction: 'in', occurredAt: new Date().toISOString(), deviceToken: 'nope' },
    })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm -F api test tests/e2e/readers.test.ts`
Expected: route 404 / module not found.

- [ ] **Step 3: Implement `apps/api/src/modules/readers/routes.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { ingestTap, heartbeat } from './service.js'

const tapBody = z.object({
  rfidUid: z.string().min(1),
  direction: z.enum(['in', 'out']),
  occurredAt: z.string().datetime(),
  deviceToken: z.string().min(1),
})

const heartbeatBody = z.object({
  occurredAt: z.string().datetime(),
  deviceToken: z.string().min(1),
})

export const readerRoutes: FastifyPluginAsync = async (app) => {
  app.post('/readers/tap', { schema: { body: tapBody } }, async (req) => {
    const b = req.body as z.infer<typeof tapBody>
    const result = await ingestTap({
      tokenPlain: b.deviceToken,
      rfidUid: b.rfidUid,
      direction: b.direction,
      occurredAt: new Date(b.occurredAt),
    })
    return {
      deduplicated: result.deduplicated,
      recordStatus: result.record?.status ?? null,
      notifications: result.notificationCount,
    }
  })

  app.post('/readers/heartbeat', { schema: { body: heartbeatBody } }, async (req) => {
    const b = req.body as z.infer<typeof heartbeatBody>
    await heartbeat(b.deviceToken, new Date(b.occurredAt))
    return { ok: true }
  })
}
```

- [ ] **Step 4: Register in `app.ts`**

```ts
import { readerRoutes } from './modules/readers/routes.js'
// ...
await app.register(readerRoutes)
```

- [ ] **Step 5: Run, confirm pass**

Run: `pnpm -F api test tests/e2e/readers.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): /readers/tap and /readers/heartbeat routes"
```

## Task 5.5: Per-school absent scheduler (`node-cron`) and heartbeat sweep

**Files:**
- Create: `apps/api/src/services/attendance-jobs.ts`
- Create: `apps/api/src/services/attendance-jobs.test.ts`
- Create: `apps/api/src/services/heartbeat-sweep.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Write the failing test**

`apps/api/src/services/attendance-jobs.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from '../../tests/helpers/db.js'
import { db } from '../db/client.js'
import { schools, classes } from '../db/schema/schools.js'
import { users } from '../db/schema/auth.js'
import { students, studentGuardians } from '../db/schema/students.js'
import { cards } from '../db/schema/cards.js'
import { devices } from '../db/schema/devices.js'
import { attendanceRecords } from '../db/schema/attendance.js'
import { notificationSettings } from '../db/schema/notifications.js'
import { newId } from '../lib/ids.js'
import { runAbsentJobForSchool } from './attendance-jobs.js'
import { eq } from 'drizzle-orm'

async function seed(opts: { deviceStatus: 'online' | 'offline' }) {
  const schoolId = newId()
  const teacherId = newId()
  const parentId = newId()
  const studentId = newId()
  const classId = newId()
  const cardId = newId()
  await db.insert(schools).values({
    id: schoolId, name: 's', address: 'a', startTime: '07:45', endTime: '13:30',
    lateThresholdMinutes: 10, absentThresholdMinutes: 30,
  })
  await db.insert(users).values([
    { id: teacherId, schoolId, role: 'teacher', fullName: 'T', phone: '+923001200001', preferredLanguage: 'en' },
    { id: parentId, schoolId, role: 'parent', fullName: 'P', phone: '+923001000001', preferredLanguage: 'en' },
  ])
  await db.insert(classes).values({ id: classId, schoolId, name: 'c', teacherId })
  await db.insert(students).values({ id: studentId, schoolId, classId, fullName: 'S', rollNumber: '001', status: 'active' })
  await db.insert(studentGuardians).values({ studentId, userId: parentId, schoolId, relationship: 'guardian' })
  await db.insert(cards).values({ id: cardId, schoolId, rfidUid: 'X', studentId, status: 'active' })
  await db.insert(devices).values({ id: newId(), schoolId, label: 'gate', direction: 'in', status: opts.deviceStatus, lastHeartbeat: new Date() })
  await db.insert(notificationSettings).values({
    userId: parentId, schoolId,
    whatsapp: false, sms: false, inApp: true,
    eventTapIn: true, eventTapOut: true, eventLate: true, eventAbsent: true,
    eventManualOverride: true, eventDeviceOffline: false,
  })
  return { schoolId, studentId }
}

describe('runAbsentJobForSchool', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('creates absent record + notifies parent when device online and no tap', async () => {
    const { schoolId, studentId } = await seed({ deviceStatus: 'online' })
    const res = await runAbsentJobForSchool(schoolId, '2026-05-13')
    expect(res.markedAbsent).toBe(1)
    const recs = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.studentId, studentId))
    expect(recs[0]?.status).toBe('absent')
  })

  it('marks unverified (not absent) and suppresses notify when entry device is offline', async () => {
    const { schoolId, studentId } = await seed({ deviceStatus: 'offline' })
    const res = await runAbsentJobForSchool(schoolId, '2026-05-13')
    expect(res.markedAbsent).toBe(0)
    expect(res.markedUnverified).toBe(1)
    const recs = await db
      .select()
      .from(attendanceRecords)
      .where(eq(attendanceRecords.studentId, studentId))
    expect(recs[0]?.status).toBe('unverified')
  })
})
```

- [ ] **Step 2: Run, confirm fail**

Run: `pnpm -F api test src/services/attendance-jobs.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement `apps/api/src/services/attendance-jobs.ts`**

```ts
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '../db/client.js'
import { schools } from '../db/schema/schools.js'
import { students } from '../db/schema/students.js'
import { studentGuardians } from '../db/schema/students.js'
import { cards } from '../db/schema/cards.js'
import { devices } from '../db/schema/devices.js'
import { attendanceRecords } from '../db/schema/attendance.js'
import { notificationSettings } from '../db/schema/notifications.js'
import { notificationLogs } from '../db/schema/notifications.js'
import { newId } from '../lib/ids.js'
import { broker, channels } from './realtime.js'
import { ymdInKarachi } from '../lib/time.js'

export interface AbsentJobResult {
  markedAbsent: number
  markedUnverified: number
}

export async function runAbsentJobForSchool(schoolId: string, ymd: string): Promise<AbsentJobResult> {
  // Are entry devices online?
  const entryDevices = await db
    .select()
    .from(devices)
    .where(
      and(
        eq(devices.schoolId, schoolId),
        isNull(devices.deletedAt),
        or(eq(devices.direction, 'in'), eq(devices.direction, 'both')),
      ),
    )
  const anyEntryOnline = entryDevices.some((d) => d.status === 'online')

  // Active students with an active card and no record today.
  const activeStudents = await db
    .select({ id: students.id })
    .from(students)
    .innerJoin(cards, and(eq(cards.studentId, students.id), eq(cards.status, 'active'), isNull(cards.deletedAt)))
    .where(and(eq(students.schoolId, schoolId), eq(students.status, 'active')))

  if (activeStudents.length === 0) return { markedAbsent: 0, markedUnverified: 0 }

  const existing = await db
    .select({ studentId: attendanceRecords.studentId })
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.schoolId, schoolId), eq(attendanceRecords.date, ymd)))
  const have = new Set(existing.map((r) => r.studentId))
  const missing = activeStudents.filter((s) => !have.has(s.id))
  if (missing.length === 0) return { markedAbsent: 0, markedUnverified: 0 }

  const status: 'absent' | 'unverified' = anyEntryOnline ? 'absent' : 'unverified'
  const rows = missing.map((s) => ({
    id: newId(),
    schoolId,
    studentId: s.id,
    date: ymd,
    firstInAt: null,
    lastOutAt: null,
    status,
    isManual: false,
  }))
  await db.insert(attendanceRecords).values(rows)

  let count = { markedAbsent: 0, markedUnverified: 0 }
  if (status === 'absent') count.markedAbsent = rows.length
  else count.markedUnverified = rows.length

  if (status === 'absent') {
    // Fan out 'absent' notifications to guardians of these students.
    const guardians = await db
      .select({ userId: studentGuardians.userId, studentId: studentGuardians.studentId })
      .from(studentGuardians)
      .where(
        and(
          eq(studentGuardians.schoolId, schoolId),
          inArray(studentGuardians.studentId, missing.map((s) => s.id)),
        ),
      )
    for (const g of guardians) {
      const s = await db
        .select()
        .from(notificationSettings)
        .where(eq(notificationSettings.userId, g.userId))
        .limit(1)
      const settings = s[0]
      if (!settings?.inApp || !settings?.eventAbsent) continue
      await db.insert(notificationLogs).values({
        id: newId(),
        schoolId,
        recipientUserId: g.userId,
        channel: 'in_app',
        eventId: null,
        status: 'sent',
        payload: { title: 'Marked absent', body: `No tap by ${ymd} cutoff` },
        sentAt: new Date(),
      })
      broker.publish(channels.student(g.studentId), { type: 'absent', studentId: g.studentId, date: ymd })
    }
  }

  return count
}

const scheduled = new Map<string, cron.ScheduledTask>()

export async function bootstrapAbsentJobs(): Promise<void> {
  // For each school, schedule one cron at startTime + absentThresholdMinutes Karachi.
  const all = await db.select().from(schools)
  for (const s of all) {
    if (scheduled.has(s.id)) continue
    const [h, m] = s.startTime.split(':').map(Number) as [number, number]
    const totalMins = m + s.absentThresholdMinutes
    const cronH = h + Math.floor(totalMins / 60)
    const cronM = totalMins % 60
    const task = cron.schedule(
      `${cronM} ${cronH} * * 1-5`,
      () => {
        const ymd = ymdInKarachi(new Date())
        runAbsentJobForSchool(s.id, ymd).catch(() => {})
      },
      { timezone: 'Asia/Karachi' },
    )
    scheduled.set(s.id, task)
  }
}
```

- [ ] **Step 4: Implement `apps/api/src/services/heartbeat-sweep.ts`**

```ts
import { and, eq, lt } from 'drizzle-orm'
import cron from 'node-cron'
import { db } from '../db/client.js'
import { devices } from '../db/schema/devices.js'
import { broker, channels } from './realtime.js'

const HEARTBEAT_STALE_MS = 180_000

export async function sweepStaleDevices(now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - HEARTBEAT_STALE_MS)
  const stale = await db
    .select()
    .from(devices)
    .where(and(eq(devices.status, 'online'), lt(devices.lastHeartbeat, cutoff)))
  if (stale.length === 0) return
  for (const d of stale) {
    await db.update(devices).set({ status: 'offline' }).where(eq(devices.id, d.id))
    broker.publish(channels.school(d.schoolId), {
      type: 'device_status',
      deviceId: d.id,
      status: 'offline',
      lastHeartbeat: d.lastHeartbeat.toISOString(),
    })
  }
}

let task: cron.ScheduledTask | null = null
export function startHeartbeatSweep() {
  if (task) return
  task = cron.schedule('*/30 * * * * *', () => {
    sweepStaleDevices().catch(() => {})
  })
}
export function stopHeartbeatSweep() {
  task?.stop()
  task = null
}
```

- [ ] **Step 5: Wire bootstrap into the app**

In `apps/api/src/app.ts`, after all route registrations but before returning:

```ts
import { bootstrapAbsentJobs } from './services/attendance-jobs.js'
import { startHeartbeatSweep } from './services/heartbeat-sweep.js'
// ...
if (env().NODE_ENV !== 'test') {
  await bootstrapAbsentJobs()
  startHeartbeatSweep()
}
```

- [ ] **Step 6: Run the absent-job tests**

Run: `pnpm -F api test src/services/attendance-jobs.test.ts`
Expected: 2 passing.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(api): absent-scheduler + heartbeat-sweep jobs"
```

## Task 5.6: WebSocket `/ws` route

**Files:**
- Create: `apps/api/src/ws/routes.ts`
- Modify: `apps/api/src/app.ts`

- [ ] **Step 1: Implement the WS route**

`apps/api/src/ws/routes.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import websocket from '@fastify/websocket'
import { broker, channels } from '../services/realtime.js'
import { db } from '../db/client.js'
import { studentGuardians } from '../db/schema/students.js'
import { and, eq } from 'drizzle-orm'

export const wsRoutes: FastifyPluginAsync = async (app) => {
  await app.register(websocket)
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const tokenQ = (req.query as { token?: string })?.token
    if (!tokenQ) {
      socket.close(4001, 'missing token')
      return
    }
    let payload: { userId: string; schoolId: string; role: 'parent' | 'admin' | 'teacher' }
    try {
      payload = app.jwt.verify(tokenQ)
    } catch {
      socket.close(4001, 'invalid token')
      return
    }
    const unsubs: Array<() => void> = []
    const send = (m: unknown) => {
      try {
        socket.send(JSON.stringify(m))
      } catch {
        /* ignore */
      }
    }
    if (payload.role === 'admin' || payload.role === 'teacher') {
      unsubs.push(broker.subscribe(channels.school(payload.schoolId), send))
    } else {
      const rows = await db
        .select({ studentId: studentGuardians.studentId })
        .from(studentGuardians)
        .where(
          and(
            eq(studentGuardians.schoolId, payload.schoolId),
            eq(studentGuardians.userId, payload.userId),
          ),
        )
      for (const r of rows) {
        unsubs.push(broker.subscribe(channels.student(r.studentId), send))
      }
    }
    socket.on('close', () => {
      for (const u of unsubs) u()
    })
  })
}
```

- [ ] **Step 2: Register in `app.ts`**

```ts
import { wsRoutes } from './ws/routes.js'
// ...
await app.register(wsRoutes)
```

- [ ] **Step 3: Manual verify**

Run dev: `pnpm -F api dev`. In a separate terminal, get a parent JWT (curl the auth flow), then:

```bash
# Use a tool like `websocat` or a small Node one-liner:
npx --yes wscat -c "ws://localhost:3000/ws?token=$JWT"
```

Then in another shell, post a tap to `/readers/tap` for that parent's child. Expected: the wscat session prints the `{"type":"tap",...}` message.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(api): /ws route with jwt query-param auth + channel subscribe"
```

---

# Phase 6 — Frontend cutover (REST polling) (spec §15 slice 6)

Disable MSW, point the frontend at the real backend, verify the parent home reflects a curl-triggered tap.

## Task 6.1: Env switch + MSW disabled

**Files:**
- Modify: `apps/web/.env.local`
- Modify: `apps/web/src/main.tsx` (MSW boot gate) — read first, then patch

- [ ] **Step 1: Update env**

In `apps/web/.env.local`:

```
VITE_API_BASE_URL=http://localhost:3000
VITE_USE_MOCKS=false
VITE_DEFAULT_LOCALE=en
```

- [ ] **Step 2: Confirm MSW boot already gates on `VITE_USE_MOCKS`**

Inspect `apps/web/src/main.tsx`. The existing code from Phase 1 should already have:

```ts
if (import.meta.env.VITE_USE_MOCKS === 'true') {
  await startMsw()
}
```

If the gate uses a different sentinel (`true` literal, presence check, etc.), adjust to compare strictly against the string `'true'`. The README §11 documents that "anything other than `'true'` disables the worker."

- [ ] **Step 3: Confirm the axios/fetch base URL is read from `VITE_API_BASE_URL`**

Inspect `apps/web/src/services/api/` — wherever the HTTP client is constructed. It should already use `import.meta.env.VITE_API_BASE_URL`. If it's hardcoded, change it to read from env.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(web): point env at real api, disable msw"
```

## Task 6.2: CORS sanity + end-to-end smoke

**Files:** none code; this is verification.

- [ ] **Step 1: Start backend**

Run: `pnpm -F api dev`

- [ ] **Step 2: Start frontend**

Run: `pnpm -F web dev`

- [ ] **Step 3: Open browser to `http://localhost:5173`**

Expected: login page renders.

- [ ] **Step 4: Log in as a seeded parent**

Use the phone of the first seeded parent: `+923001000001`. Submit. The API logs an OTP in dry-run mode; recover from DB:

```bash
psql postgres://fyntra:fyntra@localhost:5433/fyntra -c \
  "select code_hash, salt from otp_codes where phone='+923001000001' order by created_at desc limit 1;"
```

Brute-force the plaintext code (10k iterations is instant):

```bash
node -e "
const { createHash } = require('crypto');
const [hash, salt] = process.argv.slice(1);
for (let i=0;i<10000;i++) {
  const c = String(i).padStart(4,'0');
  if (createHash('sha256').update(salt+':'+c).digest('hex') === hash) { console.log(c); break; }
}" '<paste-hash>' '<paste-salt>'
```

Enter the OTP. Expected: redirected to the parent home, list of children renders.

- [ ] **Step 5: Curl a tap for a seeded student**

Grab one of the device tokens printed in Phase 2.11. Find the rfidUid of the first parent's child:

```bash
psql postgres://fyntra:fyntra@localhost:5433/fyntra -c "
select c.rfid_uid from cards c
join student_guardians sg on sg.student_id = c.student_id
join users u on u.id = sg.user_id
where u.phone='+923001000001' limit 1;"
```

Then:

```bash
curl -s -X POST http://localhost:3000/readers/tap \
  -H 'content-type: application/json' \
  -d "{
    \"rfidUid\":\"<UID-from-above>\",
    \"direction\":\"in\",
    \"occurredAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
    \"deviceToken\":\"<paste-device-token>\"
  }"
```

Expected: response `{ "deduplicated": false, "recordStatus": "present", "notifications": 1 }`.

- [ ] **Step 6: Watch the parent home update**

Within 15s (polling interval), the parent home's hero line should update to reflect today's arrival. If it doesn't:
- Check the browser network tab for failed requests.
- Check the API logs.
- Check that the frontend's polling lifecycle (active window) is on — README §6 says "polling pauses outside `[startTime − 30min, endTime + 30min]`." If you're testing outside school hours, the timestamp on the tap is fine but the *home's* polling window is gated on **now**. Override by stubbing `useRealtime`'s active-window guard for the duration of testing, OR temporarily set the seeded school's `startTime`/`endTime` to bracket the current Karachi time.

- [ ] **Step 7: Commit (no code changes — but mark milestone)**

There's nothing new to commit if the smoke test passed. If you adjusted seed times for testing, revert and reseed before committing anything.

## Task 6.3: Plan A done; tag the milestone

**Files:** none.

- [ ] **Step 1: Tag the milestone commit**

```bash
git tag -a v1.5-foundational-e2e -m "Phase 1.5 Plan A complete: monorepo + api scaffold + auth + students + tap ingestion + frontend REST cutover"
```

- [ ] **Step 2: Verify**

Run: `git log --oneline -20`
Expected: a clean linear history of the slices, ending with the milestone tag visible via `git tag -l`.

---

# Verification matrix (run before declaring Plan A done)

Run all of the following and confirm they pass:

```bash
pnpm -r typecheck                 # all packages strict
pnpm -F web build && pnpm -F web test
pnpm -F api test                  # all api tests
pnpm -F bridge build              # bridge still compiles
pnpm -F api db:migrate            # idempotent
curl -s http://localhost:3000/health    # {"ok":true}
```

Manual:
- Parent login → home renders children.
- Curl tap → parent home updates within 15s.
- DB shows `attendance_records` row with `status='present'` (or `late`).
- DB shows `notification_logs` row for the parent (channel=`in_app`, status=`sent`).
- WS connection (via `wscat`) receives the `{"type":"tap",...}` message in real time.

---

# What Plan B will cover (preview, not in this plan)

Slices 7–11 from the spec:
- **Slice 7:** All remaining §6 endpoints (classes, cards + audit, devices + heartbeat detail, tap-events history, attendance reports + CSV, notifications log + settings + retry, manual override). Each module with its own tenant-isolation test.
- **Slice 8:** WhatsApp template fan-out on tap events (live, non-dry-run on whitelisted recipients).
- **Slice 9:** Replace `useRealtime` body in the frontend with a WebSocket client; remove the polling lifecycle.
- **Slice 10:** Update `apps/bridge/` to dual-emit: keep WS for the Simulate Tap page, add `POST /readers/tap` with the seeded device token.
- **Slice 11:** `apps/api/README.md` — env vars, setup, run, troubleshooting, WhatsApp whitelist howto.

Plan B will be written once Plan A executes successfully — the pattern lock-in from slices 0–6 makes Plan B substantially shorter.
