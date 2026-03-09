# ZMI-TICKET-300: Flatten Monorepo — Move apps/web/ to Root

Status: Todo
Priority: P0 (blocker for all restructuring)
Depends on: None

## Goal
Move all content from `apps/web/` to the repository root, eliminating the monorepo wrapper. Delete the legacy Go backend files (`apps/api/`, `api/`, `.golangci.yml`). After this ticket, the project structure matches workbook's flat layout.

## Scope
- **In scope:**
  - Move apps/web/ contents to root
  - Commit deletion of Go backend files (already staged as deletions)
  - Update Makefile, Docker, scripts, CLAUDE.md
  - Verify all tools work (typecheck, lint, test, build)
- **Out of scope:**
  - Any code changes within src/
  - tRPC restructuring (TICKET-301)

## Implementation Steps

### 1. Commit Go backend deletion
The git status shows hundreds of deleted files under `apps/api/`, `api/`, and `.golangci.yml`. These are already staged. Commit them first to have a clean state.

### 2. Move apps/web/ contents to root
Files/directories to move from `apps/web/` to repo root:
```
apps/web/src/                    → src/
apps/web/prisma/                 → prisma/
apps/web/package.json            → package.json (MERGE with root if exists)
apps/web/tsconfig.json           → tsconfig.json
apps/web/next.config.ts          → next.config.ts
apps/web/vitest.config.ts        → vitest.config.ts
apps/web/vitest.setup.ts         → vitest.setup.ts
apps/web/prisma.config.ts        → prisma.config.ts
apps/web/eslint.config.mjs       → eslint.config.mjs
apps/web/postcss.config.mjs      → postcss.config.mjs
apps/web/components.json         → components.json
apps/web/instrumentation.ts      → instrumentation.ts
apps/web/vercel.json             → vercel.json
apps/web/messages/               → messages/
apps/web/global.d.ts             → global.d.ts
apps/web/.env.local              → .env.local (merge if exists)
apps/web/.storybook/             → .storybook/
apps/web/node_modules/           → (use root node_modules, reinstall)
apps/web/pnpm-lock.yaml          → pnpm-lock.yaml (if not at root)
```

### 3. Delete empty directories
```
rm -rf apps/web/
rm -rf apps/api/   (should already be empty after step 1)
rm -rf apps/       (if empty)
rm -rf api/        (OpenAPI specs, already deleted)
```

### 4. Update Makefile
Current Makefile has commands like `cd apps/web && pnpm ...`. Remove all `cd apps/web &&` prefixes.

Key commands to update:
```makefile
# Before:
install:
	cd apps/web && pnpm install
dev:
	cd apps/web && pnpm dev
# After:
install:
	pnpm install
dev:
	pnpm dev
```

### 5. Update docker/docker-compose.yml
Update build context and volume mounts:
```yaml
# Before:
build:
  context: ../apps/web
  dockerfile: ../../docker/web.Dockerfile
volumes:
  - ../apps/web/src:/app/src

# After:
build:
  context: ..
  dockerfile: docker/web.Dockerfile
volumes:
  - ../src:/app/src
```

### 6. Update docker/web.Dockerfile
Change COPY paths:
```dockerfile
# Paths should reference root, not apps/web/
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/
COPY src ./src/
```

### 7. Update scripts/create-tenant.sh
Check for any `apps/web` path references and update.

### 8. Update .gitignore
- Remove any `apps/web` specific patterns
- Add root-level patterns if needed (`.next/`, `node_modules/`, etc.)

### 9. Update CLAUDE.md
Update the project structure section to reflect the flat layout.

### 10. Verify tsconfig.json path alias
The `@/*` alias should resolve correctly since it's relative:
```json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] }
  }
}
```
This should work from root without changes.

### 11. Reinstall dependencies
```bash
pnpm install
```

### 12. Regenerate Prisma client
```bash
pnpm prisma generate
```

## Verification
```bash
make typecheck   # No type errors
make lint        # No new lint errors
make test        # All tests pass
make build       # Next.js builds
make dev         # Dev server starts
```

## Files Modified
- `Makefile`
- `docker/docker-compose.yml`
- `docker/web.Dockerfile`
- `scripts/create-tenant.sh`
- `.gitignore`
- `CLAUDE.md`
- All config files moved to root
