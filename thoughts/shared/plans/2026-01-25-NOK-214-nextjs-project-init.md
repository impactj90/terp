# Implementation Plan: NOK-214 - Initialize Next.js Project

**Date**: 2026-01-25
**Ticket**: NOK-214
**Research**: thoughts/shared/research/2026-01-25-NOK-214-nextjs-project-init.md
**Status**: Ready for Implementation

---

## Overview

Initialize the Next.js 16+ frontend project in `apps/web/` with TypeScript strict mode, Tailwind CSS v4 (CSS-first configuration), Shadcn/ui component library, ESLint, Prettier, and proper folder structure following the monorepo conventions established by the API.

---

## Current State

| Item | Status | Notes |
|------|--------|-------|
| `apps/web/package.json` | Placeholder | Name: `@terp/web`, version: `0.0.1` |
| `apps/web/README.md` | Placeholder | Contains planned tech stack |
| TypeScript config | Missing | Needs creation |
| Tailwind CSS | Missing | Needs v4 CSS-first setup |
| Shadcn/ui | Missing | Needs initialization |
| ESLint/Prettier | Missing | Needs configuration |
| Folder structure | Missing | Needs `src/app/`, `src/components/`, etc. |

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/package.json` | Replace | Full Next.js 16 dependencies |
| `apps/web/tsconfig.json` | Create | TypeScript strict mode config |
| `apps/web/next.config.ts` | Create | Next.js configuration |
| `apps/web/postcss.config.mjs` | Create | PostCSS with Tailwind v4 |
| `apps/web/components.json` | Create | Shadcn/ui configuration |
| `apps/web/.eslintrc.cjs` | Create | ESLint configuration |
| `apps/web/.prettierrc` | Create | Prettier configuration |
| `apps/web/.env.example` | Create | Environment variables template |
| `apps/web/.env.local` | Create | Local environment variables |
| `apps/web/src/app/layout.tsx` | Create | Root layout with Inter font |
| `apps/web/src/app/page.tsx` | Create | Home page placeholder |
| `apps/web/src/app/globals.css` | Create | Tailwind v4 CSS-first config |
| `apps/web/src/lib/utils.ts` | Create | Utility functions (cn helper) |
| `apps/web/src/config/env.ts` | Create | Environment variable access |
| `apps/web/src/types/index.ts` | Create | Type definitions placeholder |
| `apps/web/src/hooks/.gitkeep` | Create | Hooks directory placeholder |
| `apps/web/src/components/ui/.gitkeep` | Create | Shadcn UI directory |

---

## Phase 1: Initialize Next.js Project

**Goal**: Create Next.js 16 project with TypeScript and App Router.

### 1.1 Remove Placeholder Files

The existing `package.json` will be replaced by the Next.js init.

```bash
cd /home/tolga/projects/terp/apps/web
rm -f package.json
```

### 1.2 Initialize Next.js Project

```bash
cd /home/tolga/projects/terp/apps/web
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-git --use-pnpm
```

**Interactive prompts** (expected answers):
- Would you like to use TypeScript? **Yes**
- Would you like to use ESLint? **Yes**
- Would you like to use Tailwind CSS? **Yes**
- Would you like your code inside a `src/` directory? **Yes**
- Would you like to use App Router? **Yes**
- Would you like to use Turbopack? **Yes**
- Would you like to customize the import alias? **Yes** (`@/*`)

### 1.3 Update package.json

After initialization, update `package.json` to use the scoped package name:

**File**: `apps/web/package.json`

```json
{
  "name": "@terp/web",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint . --ext .ts,.tsx",
    "lint:fix": "eslint . --ext .ts,.tsx --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,css}\"",
    "format:check": "prettier --check \"src/**/*.{ts,tsx,css}\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.1.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.5.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^16.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "prettier": "^3.4.0"
  }
}
```

### 1.4 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm install
pnpm run typecheck
```

- [ ] `package.json` has name `@terp/web`
- [ ] Dependencies installed successfully
- [ ] TypeScript compiles without errors

---

## Phase 2: Configure TypeScript Strict Mode

**Goal**: Enable TypeScript strict mode with additional safety checks.

### 2.1 Update tsconfig.json

**File**: `apps/web/tsconfig.json`

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

**Key strict settings**:
- `strict: true` - Enable all strict type-checking options
- `noUncheckedIndexedAccess: true` - Add `undefined` to array/object index access
- `noImplicitReturns: true` - Ensure all code paths return
- `noFallthroughCasesInSwitch: true` - Ensure switch cases have break/return
- `forceConsistentCasingInFileNames: true` - Enforce consistent file casing

### 2.2 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run typecheck
```

- [ ] TypeScript compiles with strict mode
- [ ] Path alias `@/*` resolves correctly

---

## Phase 3: Configure Tailwind CSS v4

**Goal**: Set up Tailwind CSS v4 with CSS-first configuration (no tailwind.config.js).

### 3.1 Create PostCSS Configuration

**File**: `apps/web/postcss.config.mjs`

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
```

### 3.2 Create Global Styles with Tailwind v4

**File**: `apps/web/src/app/globals.css`

```css
@import "tailwindcss";

/* Theme configuration using CSS-first approach */
@theme {
  /* Colors - using HSL for Shadcn/ui compatibility */
  --color-background: hsl(0 0% 100%);
  --color-foreground: hsl(0 0% 3.9%);
  --color-card: hsl(0 0% 100%);
  --color-card-foreground: hsl(0 0% 3.9%);
  --color-popover: hsl(0 0% 100%);
  --color-popover-foreground: hsl(0 0% 3.9%);
  --color-primary: hsl(0 0% 9%);
  --color-primary-foreground: hsl(0 0% 98%);
  --color-secondary: hsl(0 0% 96.1%);
  --color-secondary-foreground: hsl(0 0% 9%);
  --color-muted: hsl(0 0% 96.1%);
  --color-muted-foreground: hsl(0 0% 45.1%);
  --color-accent: hsl(0 0% 96.1%);
  --color-accent-foreground: hsl(0 0% 9%);
  --color-destructive: hsl(0 84.2% 60.2%);
  --color-destructive-foreground: hsl(0 0% 98%);
  --color-border: hsl(0 0% 89.8%);
  --color-input: hsl(0 0% 89.8%);
  --color-ring: hsl(0 0% 3.9%);

  /* Border radius */
  --radius-lg: 0.5rem;
  --radius-md: calc(var(--radius-lg) - 2px);
  --radius-sm: calc(var(--radius-lg) - 4px);

  /* Font family - Inter via next/font */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}

/* Dark mode theme */
@media (prefers-color-scheme: dark) {
  @theme {
    --color-background: hsl(0 0% 3.9%);
    --color-foreground: hsl(0 0% 98%);
    --color-card: hsl(0 0% 3.9%);
    --color-card-foreground: hsl(0 0% 98%);
    --color-popover: hsl(0 0% 3.9%);
    --color-popover-foreground: hsl(0 0% 98%);
    --color-primary: hsl(0 0% 98%);
    --color-primary-foreground: hsl(0 0% 9%);
    --color-secondary: hsl(0 0% 14.9%);
    --color-secondary-foreground: hsl(0 0% 98%);
    --color-muted: hsl(0 0% 14.9%);
    --color-muted-foreground: hsl(0 0% 63.9%);
    --color-accent: hsl(0 0% 14.9%);
    --color-accent-foreground: hsl(0 0% 98%);
    --color-destructive: hsl(0 62.8% 30.6%);
    --color-destructive-foreground: hsl(0 0% 98%);
    --color-border: hsl(0 0% 14.9%);
    --color-input: hsl(0 0% 14.9%);
    --color-ring: hsl(0 0% 83.1%);
  }
}

/* Base styles */
@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

### 3.3 Remove tailwind.config.ts (if created by create-next-app)

```bash
cd /home/tolga/projects/terp/apps/web
rm -f tailwind.config.ts tailwind.config.js
```

### 3.4 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run build
```

- [ ] No `tailwind.config.js` or `tailwind.config.ts` exists
- [ ] Tailwind v4 processes CSS via PostCSS
- [ ] Build completes without Tailwind errors

---

## Phase 4: Configure Inter Font

**Goal**: Set up Inter font via next/font with Tailwind integration.

### 4.1 Create Root Layout with Font

**File**: `apps/web/src/app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'Terp',
  description: 'Time tracking and employee management system',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
```

### 4.2 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run dev &
# Open http://localhost:3000 and verify Inter font is applied
```

- [ ] Inter font loads via next/font
- [ ] `--font-inter` CSS variable is set
- [ ] Body uses Inter via `font-sans`

---

## Phase 5: Set Up Utility Functions

**Goal**: Create utility functions needed for Shadcn/ui components.

### 5.1 Create Utils File

**File**: `apps/web/src/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combines class names using clsx and merges Tailwind classes intelligently.
 * Used by Shadcn/ui components for conditional class application.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### 5.2 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run typecheck
```

- [ ] `cn` function exports correctly
- [ ] TypeScript recognizes ClassValue type

---

## Phase 6: Configure Shadcn/ui

**Goal**: Initialize Shadcn/ui with Tailwind v4 support.

### 6.1 Create Shadcn Configuration

**File**: `apps/web/components.json`

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

### 6.2 Create UI Components Directory

```bash
mkdir -p /home/tolga/projects/terp/apps/web/src/components/ui
touch /home/tolga/projects/terp/apps/web/src/components/ui/.gitkeep
```

### 6.3 Install a Test Component

```bash
cd /home/tolga/projects/terp/apps/web
pnpm dlx shadcn@latest add button
```

### 6.4 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run typecheck
ls src/components/ui/
```

- [ ] `components.json` created
- [ ] `src/components/ui/button.tsx` exists
- [ ] Button component imports without errors

---

## Phase 7: Configure ESLint

**Goal**: Set up ESLint with TypeScript and Next.js rules.

### 7.1 Create ESLint Configuration

**File**: `apps/web/.eslintrc.cjs`

```javascript
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports' },
    ],
    'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
  },
  ignorePatterns: [
    'node_modules/',
    '.next/',
    'out/',
    '*.config.js',
    '*.config.mjs',
  ],
}
```

### 7.2 Remove Old ESLint Config (if exists)

```bash
cd /home/tolga/projects/terp/apps/web
rm -f .eslintrc.json eslint.config.mjs
```

### 7.3 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run lint
```

- [ ] ESLint runs without configuration errors
- [ ] TypeScript-ESLint rules are applied

---

## Phase 8: Configure Prettier

**Goal**: Set up Prettier formatting aligned with monorepo conventions.

### 8.1 Create Prettier Configuration

**File**: `apps/web/.prettierrc`

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "useTabs": false,
  "endOfLine": "lf",
  "arrowParens": "always",
  "bracketSpacing": true,
  "jsxSingleQuote": false
}
```

### 8.2 Create Prettier Ignore File

**File**: `apps/web/.prettierignore`

```
node_modules/
.next/
out/
pnpm-lock.yaml
```

### 8.3 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run format:check
```

- [ ] Prettier runs without errors
- [ ] Settings match `.editorconfig` (2-space indent, LF line endings)

---

## Phase 9: Configure Environment Variables

**Goal**: Set up environment variable handling for API integration.

### 9.1 Create Environment Example File

**File**: `apps/web/.env.example`

```bash
# API Configuration
# Server-side only (not exposed to browser)
API_URL=http://localhost:8080/api/v1

# Public API URL (exposed to browser via NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1

# Application
NEXT_PUBLIC_APP_NAME=Terp
```

### 9.2 Create Local Environment File

**File**: `apps/web/.env.local`

```bash
# API Configuration
API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_APP_NAME=Terp
```

### 9.3 Create Environment Config Module

**File**: `apps/web/src/config/env.ts`

```typescript
/**
 * Environment configuration with type safety.
 * Server-side variables (without NEXT_PUBLIC_) are only available in Server Components.
 * Client-side variables (with NEXT_PUBLIC_) are available everywhere.
 */

// Server-side only
export const serverEnv = {
  apiUrl: process.env.API_URL ?? 'http://localhost:8080/api/v1',
} as const

// Client-side accessible
export const clientEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Terp',
} as const

/**
 * Validates that required environment variables are set.
 * Call this in server startup or build.
 */
export function validateEnv() {
  const required = ['NEXT_PUBLIC_API_URL']
  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
```

### 9.4 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run typecheck
```

- [ ] `env.ts` compiles without errors
- [ ] `.env.local` is created (and gitignored)
- [ ] `.env.example` is created for reference

---

## Phase 10: Create Folder Structure

**Goal**: Create the standard folder structure for the frontend.

### 10.1 Create Directory Structure

```bash
cd /home/tolga/projects/terp/apps/web/src

# Create directories
mkdir -p components/ui
mkdir -p components/layout
mkdir -p components/forms
mkdir -p hooks
mkdir -p lib
mkdir -p types
mkdir -p config
```

### 10.2 Create Types Placeholder

**File**: `apps/web/src/types/index.ts`

```typescript
/**
 * Custom type definitions for the application.
 * API types will be generated from OpenAPI spec and placed in api.ts
 */

export type { }

// Placeholder for future API types
// export type * from './api'
```

### 10.3 Create Hooks Directory Placeholder

**File**: `apps/web/src/hooks/.gitkeep`

(Empty file to ensure directory is tracked)

### 10.4 Verification

```bash
ls -la /home/tolga/projects/terp/apps/web/src/
```

Expected structure:
```
src/
  app/
    globals.css
    layout.tsx
    page.tsx
  components/
    ui/
      button.tsx
      .gitkeep
    layout/
    forms/
  hooks/
    .gitkeep
  lib/
    utils.ts
  types/
    index.ts
  config/
    env.ts
```

- [ ] All directories created
- [ ] Placeholder files in place

---

## Phase 11: Create Home Page

**Goal**: Create a basic home page to verify the setup.

### 11.1 Create Home Page

**File**: `apps/web/src/app/page.tsx`

```tsx
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="flex flex-col items-center gap-8">
        <h1 className="text-4xl font-bold">Terp</h1>
        <p className="text-muted-foreground">
          Time tracking and employee management system
        </p>
        <div className="flex gap-4">
          <Button>Get Started</Button>
          <Button variant="outline">Learn More</Button>
        </div>
      </div>
    </main>
  )
}
```

### 11.2 Verification

```bash
cd /home/tolga/projects/terp/apps/web
pnpm run dev
```

Open http://localhost:3000 and verify:
- [ ] Page renders without errors
- [ ] Inter font is applied
- [ ] Tailwind classes work
- [ ] Shadcn Button component renders correctly
- [ ] Dark mode works (if system preference is dark)

---

## Phase 12: Update README

**Goal**: Update README with actual setup instructions.

### 12.1 Update README.md

**File**: `apps/web/README.md`

```markdown
# Terp Web Frontend

Next.js 16 frontend for Terp time tracking system.

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 (CSS-first configuration)
- **Components**: Shadcn/ui
- **Font**: Inter via next/font

## Development

```bash
# Install dependencies
pnpm install

# Start development server (with Turbopack)
pnpm run dev

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run format
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

| Variable | Description | Default |
|----------|-------------|---------|
| `API_URL` | Backend API URL (server-side) | `http://localhost:8080/api/v1` |
| `NEXT_PUBLIC_API_URL` | Backend API URL (client-side) | `http://localhost:8080/api/v1` |
| `NEXT_PUBLIC_APP_NAME` | Application name | `Terp` |

## Project Structure

```
src/
  app/              # Next.js App Router pages
  components/
    ui/             # Shadcn/ui components
    layout/         # Layout components
    forms/          # Form components
  hooks/            # Custom React hooks
  lib/              # Utility functions
  types/            # TypeScript type definitions
  config/           # Configuration modules
```

## Adding Shadcn Components

```bash
pnpm dlx shadcn@latest add [component-name]
```

Example:
```bash
pnpm dlx shadcn@latest add card dialog input
```

## Building for Production

```bash
pnpm run build
pnpm run start
```
```

### 12.2 Verification

- [ ] README reflects actual setup
- [ ] Commands are accurate

---

## Phase 13: Final Verification

### 13.1 Run All Checks

```bash
cd /home/tolga/projects/terp/apps/web

# Install dependencies
pnpm install

# Type check
pnpm run typecheck

# Lint
pnpm run lint

# Format check
pnpm run format:check

# Build
pnpm run build

# Start dev server
pnpm run dev
```

### 13.2 Acceptance Criteria Checklist

- [ ] Next.js 16+ project initialized in `apps/web/`
- [ ] Package name is `@terp/web`
- [ ] TypeScript strict mode enabled
- [ ] `noUncheckedIndexedAccess` enabled
- [ ] Tailwind CSS v4 with CSS-first configuration
- [ ] No `tailwind.config.js` or `tailwind.config.ts`
- [ ] Shadcn/ui installed and configured
- [ ] Button component works
- [ ] ESLint configured with TypeScript rules
- [ ] Prettier configured with 2-space indent
- [ ] Path alias `@/*` configured and working
- [ ] Environment variables configured
- [ ] Inter font configured via next/font
- [ ] Folder structure: `app/`, `components/`, `hooks/`, `lib/`, `types/`, `config/`
- [ ] `pnpm run typecheck` passes
- [ ] `pnpm run lint` passes
- [ ] `pnpm run build` succeeds
- [ ] Dev server starts on port 3000

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/web/package.json` | Full dependencies (replaces placeholder) |
| `apps/web/tsconfig.json` | TypeScript strict config |
| `apps/web/next.config.ts` | Next.js configuration |
| `apps/web/postcss.config.mjs` | Tailwind v4 via PostCSS |
| `apps/web/components.json` | Shadcn/ui configuration |
| `apps/web/.eslintrc.cjs` | ESLint configuration |
| `apps/web/.prettierrc` | Prettier configuration |
| `apps/web/.prettierignore` | Prettier ignore patterns |
| `apps/web/.env.example` | Environment template |
| `apps/web/.env.local` | Local environment |
| `apps/web/src/app/layout.tsx` | Root layout with Inter font |
| `apps/web/src/app/page.tsx` | Home page |
| `apps/web/src/app/globals.css` | Tailwind v4 CSS-first config |
| `apps/web/src/lib/utils.ts` | cn() utility function |
| `apps/web/src/config/env.ts` | Environment config |
| `apps/web/src/types/index.ts` | Types placeholder |
| `apps/web/src/components/ui/button.tsx` | Shadcn Button (via CLI) |

### Files to Remove

| File | Reason |
|------|--------|
| `apps/web/tailwind.config.ts` | Not needed with Tailwind v4 CSS-first |
| `apps/web/tailwind.config.js` | Not needed with Tailwind v4 CSS-first |
| `apps/web/.eslintrc.json` | Replaced by `.eslintrc.cjs` |
| `apps/web/eslint.config.mjs` | Replaced by `.eslintrc.cjs` |

---

## Implementation Notes

### Key Technical Decisions

1. **Tailwind v4 CSS-First**: Using `@theme` directive in CSS instead of `tailwind.config.js`. This is the modern approach recommended by Tailwind v4.

2. **Shadcn/ui "new-york" Style**: Using the new-york style variant which has a cleaner aesthetic. The style is defined in `components.json`.

3. **pnpm Package Manager**: Using pnpm for faster installs and better monorepo support. The project uses pnpm workspaces.

4. **Turbopack**: Using Turbopack as the default bundler via `--turbopack` flag for faster development builds.

5. **TypeScript Strict**: All strict options plus additional safety with `noUncheckedIndexedAccess`.

6. **Path Aliases**: Using `@/*` for src directory imports, consistent with Shadcn/ui conventions.

### Browser Compatibility

Tailwind CSS v4 requires modern browsers:
- Safari 16.4+
- Chrome 111+
- Firefox 128+

This matches Next.js 16 requirements.

### Future Work

- [ ] React Query setup
- [ ] OpenAPI TypeScript generation
- [ ] API client configuration
- [ ] Authentication hooks
- [ ] Route protection

---

## Estimated Implementation Time

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Initialize Next.js | 10 min |
| Phase 2: TypeScript Strict | 5 min |
| Phase 3: Tailwind CSS v4 | 10 min |
| Phase 4: Inter Font | 5 min |
| Phase 5: Utility Functions | 5 min |
| Phase 6: Shadcn/ui | 10 min |
| Phase 7: ESLint | 5 min |
| Phase 8: Prettier | 5 min |
| Phase 9: Environment Variables | 5 min |
| Phase 10: Folder Structure | 5 min |
| Phase 11: Home Page | 5 min |
| Phase 12: Update README | 5 min |
| Phase 13: Final Verification | 10 min |
| **Total** | **~1.5 hours** |
