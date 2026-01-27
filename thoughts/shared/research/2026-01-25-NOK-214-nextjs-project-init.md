# Research: NOK-214 - Initialize Next.js Project with TypeScript, Tailwind CSS v4, and Shadcn/ui

**Ticket**: NOK-214
**Date**: 2026-01-25
**Status**: Research Complete

---

## 1. Current State of apps/web/

### 1.1 Existing Files

The `apps/web/` directory is a placeholder with minimal configuration:

**File: `/home/tolga/projects/terp/apps/web/README.md`**
- Contains planned tech stack documentation
- Notes the intention to use Next.js 16+ with App Router
- Mentions TypeScript, Tailwind CSS v4, Shadcn/ui, React Query, openapi-typescript
- Provides placeholder setup commands

**File: `/home/tolga/projects/terp/apps/web/package.json`**
```json
{
  "name": "@terp/web",
  "version": "0.0.1",
  "private": true,
  "description": "Terp frontend (placeholder - see README.md for setup)"
}
```

### 1.2 No Existing Configuration

The following do not exist in apps/web/:
- `tsconfig.json`
- `next.config.ts`
- `tailwind.config.js` / CSS configuration
- `.eslintrc.*`
- `.prettierrc.*`
- `src/` directory
- `app/` directory
- `components/` directory
- Any TypeScript files

---

## 2. Monorepo Structure

### 2.1 Workspace Configuration

**File: `/home/tolga/projects/terp/go.work`**
```
go 1.24.0
use ./apps/api
```

The Go workspace currently only includes the API. The web frontend will be a separate Node.js project not part of the Go workspace.

### 2.2 Docker Compose

**File: `/home/tolga/projects/terp/docker/docker-compose.yml`**

Currently defines two services:
- `postgres` - PostgreSQL 16 Alpine on port 5432
- `api` - Go API on port 8080

No web service is currently configured. The API expects the frontend at `http://localhost:3000` based on `FRONTEND_URL` in `.env.example`.

### 2.3 Environment Configuration

**File: `/home/tolga/projects/terp/.env.example`**
```bash
ENV=development
PORT=8080
DATABASE_URL=postgres://dev:dev@localhost:5432/terp?sslmode=disable
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRY=24h
LOG_LEVEL=debug
FRONTEND_URL=http://localhost:3000
```

The frontend URL is expected to be `http://localhost:3000` (Next.js default port).

### 2.4 EditorConfig

**File: `/home/tolga/projects/terp/.editorconfig`**
```editorconfig
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.go]
indent_style = tab
indent_size = 4

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
```

The frontend should follow the same conventions: 2-space indentation for JavaScript/TypeScript, LF line endings, UTF-8 charset.

### 2.5 Makefile

**File: `/home/tolga/projects/terp/Makefile`**

Currently Go-focused with commands:
- `make dev` - Start Docker Compose services
- `make test` - Run Go tests
- `make lint` - Run golangci-lint
- `make fmt` - Format Go code
- `make swagger-bundle` - Bundle OpenAPI spec
- `make generate` - Generate Go models from OpenAPI

No frontend commands exist yet.

### 2.6 Git Ignore

**File: `/home/tolga/projects/terp/.gitignore`**

Already includes Next.js patterns:
```
# Next.js
apps/web/.next/
apps/web/out/
apps/web/node_modules/
node_modules/

# Next.js build output
.vercel

# Environment files
.env
.env.local
.env.*.local
.env.development
.env.production
!.env.example
```

---

## 3. API Structure Patterns to Mirror

### 3.1 Directory Structure

**API structure in `/home/tolga/projects/terp/apps/api/internal/`**:
```
auth/           - Authentication logic
calculation/    - Business calculation logic
config/         - Configuration loading
handler/        - HTTP handlers (request/response)
middleware/     - HTTP middleware
model/          - Domain models (GORM structs)
repository/     - Data access layer
service/        - Business logic layer
testutil/       - Test utilities
timeutil/       - Time utility functions
```

**Equivalent frontend structure for `apps/web/src/`**:
```
app/           - Next.js App Router pages
components/    - UI components (Shadcn/ui + custom)
hooks/         - Custom React hooks
lib/           - Utility functions, API client
types/         - TypeScript type definitions
config/        - Configuration loading
```

### 3.2 Configuration Pattern

**API Pattern** (`/home/tolga/projects/terp/apps/api/internal/config/config.go`):
- Loads from environment variables
- Provides typed configuration struct
- Has `IsDevelopment()` / `IsProduction()` helpers
- Validates required fields in production

### 3.3 OpenAPI Integration

**API Pattern**:
- OpenAPI spec defined in `/home/tolga/projects/terp/api/openapi.yaml`
- Multi-file structure with `paths/`, `schemas/`, `responses/`
- Bundled to `api/openapi.bundled.yaml`
- Go models generated to `apps/api/gen/models/`

**Frontend Equivalent**:
- Use `openapi-typescript` to generate TypeScript types from the bundled spec
- Types generated to `apps/web/src/types/api.ts` or similar

### 3.4 API Base URL

The API serves at:
- Base path: `/api/v1`
- Auth endpoints: `/api/v1/auth/*`
- Protected endpoints require `Authorization: Bearer <token>` header
- Tenant-scoped endpoints require `X-Tenant-ID` header

---

## 4. Next.js 16 Best Practices (2026)

### 4.1 Key Features

**Source**: [Next.js 16 Blog](https://nextjs.org/blog/next-16)

- **React 19.2**: Latest React with View Transitions, `useEffectEvent()`
- **Turbopack Default**: Now the default bundler (2-5x faster production builds, 10x faster Fast Refresh)
- **Cache Components**: New `"use cache"` directive for explicit caching
- **proxy.ts**: Replaces `middleware.ts` for network boundary logic
- **TypeScript-first**: Default configuration is TypeScript

### 4.2 Version Requirements

- Node.js: 20.9+ (18 no longer supported)
- TypeScript: 5.1.0+
- Modern browsers only (Safari 16.4+, Chrome 111+, Firefox 111+)

### 4.3 Breaking Changes from 15

- `middleware.ts` renamed to `proxy.ts`
- Sync access to `params`, `searchParams`, `cookies()`, `headers()` removed (must use `await`)
- Parallel routes require explicit `default.js` files
- `next lint` command removed

### 4.4 Recommended Project Setup

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir
```

Default structure:
```
src/
  app/
    layout.tsx
    page.tsx
    globals.css
  components/
  lib/
```

---

## 5. Tailwind CSS v4 Configuration

### 5.1 Key Changes from v3

**Source**: [Tailwind CSS v4 Blog](https://tailwindcss.com/blog/tailwindcss-v4)

- **CSS-First Configuration**: No more `tailwind.config.js` required
- **`@theme` Directive**: Configure in CSS file directly
- **Automatic Content Detection**: No need to specify content paths
- **Performance**: Full builds 5x faster, incremental builds 100x faster
- **Modern CSS**: Uses `@property`, `color-mix()`, cascade layers

### 5.2 Basic Setup

**CSS Configuration** (`globals.css`):
```css
@import "tailwindcss";

@theme {
  --color-primary: hsl(49, 100%, 7%);
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(0 0% 3.9%);
}
```

### 5.3 Vite Plugin

For Next.js projects, Tailwind v4 uses the `@tailwindcss/postcss` plugin or `@tailwindcss/vite` plugin.

### 5.4 Browser Compatibility

Requires modern browsers:
- Safari 16.4+
- Chrome 111+
- Firefox 128+

Not compatible with older browsers. If legacy support needed, use Tailwind v3.4.

---

## 6. Shadcn/ui Configuration

### 6.1 Installation Process

**Source**: [shadcn/ui Next.js Installation](https://ui.shadcn.com/docs/installation/next)

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button
```

### 6.2 Directory Structure Created

- `components/ui/` - Shadcn components installed here
- `components.json` - CLI configuration
- `lib/utils.ts` - Utility functions (`cn` helper)

### 6.3 Tailwind v4 Compatibility

**Source**: [shadcn/ui Tailwind v4](https://ui.shadcn.com/docs/tailwind-v4)

Shadcn/ui supports Tailwind v4 with specific changes:

**CSS Variables** (use `@theme inline`):
```css
:root {
  --background: hsl(0 0% 100%);
  --foreground: hsl(0 0% 3.9%);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
}
```

**Key Differences**:
- HSL colors converted to OKLCH
- `forwardRef` no longer used, replaced with `data-slot` attributes
- `tailwindcss-animate` deprecated in favor of `tw-animate-css`

### 6.4 Component Import Pattern

```typescript
import { Button } from "@/components/ui/button"

export default function Home() {
  return <Button>Click me</Button>
}
```

---

## 7. ESLint and Prettier Configuration

### 7.1 Next.js 16 ESLint

The `next lint` command has been removed in Next.js 16. ESLint is now configured manually:

```bash
pnpm add -D eslint eslint-config-next @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

### 7.2 Recommended ESLint Config

**File: `.eslintrc.cjs`**
```javascript
module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/no-explicit-any': 'warn',
  },
}
```

### 7.3 Prettier Configuration

**File: `.prettierrc`**
```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

Should match the `.editorconfig` settings (2-space indentation).

---

## 8. TypeScript Configuration

### 8.1 Strict Mode

**File: `tsconfig.json`**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 8.2 Path Aliases

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

This enables imports like:
```typescript
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
```

---

## 9. Environment Variables

### 9.1 Next.js Environment Variables

Next.js has specific naming conventions:
- `NEXT_PUBLIC_*` - Exposed to browser
- Other variables - Server-side only

### 9.2 Required Variables

```bash
# API URL (server-side)
API_URL=http://localhost:8080/api/v1

# Public API URL (client-side)
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
```

---

## 10. Font Configuration

### 10.1 Next.js Font Optimization

Next.js has built-in font optimization via `next/font`:

```typescript
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})
```

### 10.2 Tailwind Integration

```css
@theme {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}
```

---

## 11. Recommended Folder Structure

Based on API patterns and Next.js best practices:

```
apps/web/
  src/
    app/                    # Next.js App Router
      layout.tsx            # Root layout
      page.tsx              # Home page
      globals.css           # Global styles with Tailwind
      (auth)/               # Auth route group
        login/page.tsx
      (dashboard)/          # Dashboard route group
        layout.tsx
        employees/page.tsx
        bookings/page.tsx
    components/
      ui/                   # Shadcn/ui components
      layout/               # Layout components (header, sidebar)
      forms/                # Form components
      tables/               # Table components
    hooks/
      use-auth.ts           # Authentication hook
      use-api.ts            # API query hooks
    lib/
      api.ts                # API client configuration
      utils.ts              # Utility functions (cn helper)
    types/
      api.ts                # Generated OpenAPI types
      index.ts              # Custom type definitions
    config/
      env.ts                # Environment variable access
  public/
    favicon.ico
  next.config.ts
  tsconfig.json
  components.json           # Shadcn/ui config
  package.json
  .env.local
  .env.example
```

---

## 12. Dependencies Overview

### 12.1 Core Dependencies

```json
{
  "dependencies": {
    "next": "^16.1.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "@tanstack/react-query": "^5.x",
    "class-variance-authority": "^0.7.x",
    "clsx": "^2.x",
    "tailwind-merge": "^2.x"
  }
}
```

### 12.2 Dev Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.7.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.x",
    "eslint": "^9.x",
    "eslint-config-next": "^16.x",
    "@typescript-eslint/parser": "^8.x",
    "@typescript-eslint/eslint-plugin": "^8.x",
    "prettier": "^3.x",
    "openapi-typescript": "^7.x"
  }
}
```

---

## 13. Summary

### 13.1 What Exists

- Placeholder `package.json` with name `@terp/web`
- README with planned tech stack
- Git ignore patterns for Next.js
- EditorConfig with 2-space indentation standard
- API expecting frontend at `http://localhost:3000`

### 13.2 What Needs to Be Created

- Next.js 16 project with App Router
- TypeScript configuration with strict mode
- Tailwind CSS v4 with `@theme` directive
- Shadcn/ui component library
- ESLint and Prettier configuration
- Path aliases (`@/` for src)
- Environment variable configuration
- Font setup (Inter)
- Folder structure: `src/app/`, `src/components/`, `src/lib/`, `src/hooks/`, `src/types/`

### 13.3 Key Technical Decisions

1. **Tailwind v4 CSS-first** - No `tailwind.config.js`, use `@theme` in CSS
2. **Turbopack** - Default bundler in Next.js 16
3. **TypeScript strict mode** - Match API type safety standards
4. **OpenAPI types** - Generate from bundled spec for API consistency
5. **React Query** - Data fetching and caching
6. **Shadcn/ui** - Component library with Tailwind v4 support

---

## Sources

- [Next.js 16 Blog](https://nextjs.org/blog/next-16)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS v4](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind CSS Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [shadcn/ui Installation](https://ui.shadcn.com/docs/installation/next)
- [shadcn/ui Tailwind v4 Guide](https://ui.shadcn.com/docs/tailwind-v4)
