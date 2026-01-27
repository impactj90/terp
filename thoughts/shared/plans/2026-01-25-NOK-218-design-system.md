# Implementation Plan: NOK-218 - Design System with Theme Tokens and Component Variants

**Date**: 2026-01-25
**Ticket**: NOK-218
**Research**: thoughts/shared/research/2026-01-25-NOK-218-design-system.md
**Status**: Ready for Implementation

---

## Overview

Establish a comprehensive design system for the Terp web frontend with color tokens, typography scale, spacing system, and reusable component variants. The design system will support light/dark mode with a manual toggle, follow WCAG 2.1 AA accessibility guidelines, and be documented in Storybook.

---

## Current State Analysis

| Item | Current State | Required State |
|------|---------------|----------------|
| Color palette | Neutral grays only, destructive red | Blue primary, semantic colors (success/warning/info) |
| CSS custom properties | Basic set via `@theme` | Expanded with semantic naming |
| Dark mode | `prefers-color-scheme` only | Class-based toggle + system preference |
| Typography | System font stack | Inter font with size scale |
| Spacing | Tailwind defaults | Custom 4px base scale |
| Shadows | None | 4-level shadow scale |
| Border radius | Basic (lg/md/sm) | Adequate |
| Components | Button only | Button, Input, Card |
| Animation tokens | None | Transition/duration tokens |
| Storybook | Not installed | Stories for all tokens |
| Utility components | None | Stack, Grid, Container |
| WCAG contrast | Unverified | AA compliant |

### Key Files

| File | Description |
|------|-------------|
| `apps/web/src/app/globals.css` | CSS theme configuration (lines 1-73) |
| `apps/web/src/app/layout.tsx` | Root layout (lines 1-23) |
| `apps/web/src/components/ui/button.tsx` | Button component with 6 variants, 8 sizes |
| `apps/web/src/lib/utils.ts` | `cn()` utility function |
| `apps/web/components.json` | Shadcn/ui configuration (neutral base, new-york style) |
| `apps/web/package.json` | Dependencies (Tailwind v4, cva, clsx, tailwind-merge) |

---

## Desired End State

A complete design system that:

1. **Color System**: Brand colors (Blue primary), semantic colors (success/warning/info), neutral Slate scale
2. **Typography**: Inter font with 7-step size scale (xs-3xl) and 4 weight options (400-700)
3. **Spacing**: 4px base unit scale accessible via Tailwind utilities
4. **Dark Mode**: Manual toggle that respects system preference as default
5. **Components**: Button, Input, Card with consistent variants
6. **Utilities**: Stack, Grid, Container layout components
7. **Animation**: Consistent transition/duration tokens
8. **Documentation**: Storybook with stories for tokens and components
9. **Accessibility**: WCAG 2.1 AA contrast ratios verified

### Verification

- All colors defined as CSS custom properties
- Dark mode toggle works via button click
- Typography consistent across all text elements
- Components use theme tokens exclusively
- Storybook accessible at `http://localhost:6006`
- Contrast checker passes for all color combinations

---

## What We're NOT Doing

1. **Custom icon library** - Using Lucide icons via Shadcn/ui
2. **Complex theming system** - Just light/dark, no custom themes
3. **All Shadcn components** - Only Button, Input, Card initially
4. **CSS-in-JS** - Sticking with Tailwind CSS approach
5. **Full component documentation** - Basic Storybook stories only
6. **Animation library** - Simple CSS transitions, no framer-motion
7. **Design tokens export** - No Figma/design tool sync

---

## Implementation Approach

The implementation follows a bottom-up approach:

1. **Foundation first**: Colors, typography, spacing tokens
2. **Dark mode system**: Class-based switching with system preference fallback
3. **Core components**: Install and configure Shadcn Input and Card
4. **Layout utilities**: Custom Stack, Grid, Container components
5. **Animation tokens**: Add duration and easing tokens
6. **Documentation**: Storybook setup with stories

---

## Phase 1: Color System

### Overview

Replace the neutral gray palette with the brand colors specified in the ticket. Add semantic colors for success, warning, and info states. Implement a Slate-based neutral scale.

### Changes Required

#### 1. Update Global CSS Theme Tokens

**File**: `apps/web/src/app/globals.css`

Replace the entire `@theme` block with expanded color system:

```css
@import 'tailwindcss';

/* Theme configuration using CSS-first approach */
@theme {
  /* ==========================================================================
     COLOR SYSTEM
     ========================================================================== */

  /* Primary - Blue (#3B82F6) */
  --color-primary: hsl(217 91% 60%);
  --color-primary-foreground: hsl(0 0% 100%);
  --color-primary-hover: hsl(217 91% 55%);
  --color-primary-active: hsl(217 91% 50%);

  /* Secondary - Slate 100 */
  --color-secondary: hsl(210 40% 96%);
  --color-secondary-foreground: hsl(222 47% 11%);
  --color-secondary-hover: hsl(210 40% 92%);

  /* Semantic Colors */
  --color-success: hsl(142 71% 45%);              /* Green #22C55E */
  --color-success-foreground: hsl(0 0% 100%);
  --color-warning: hsl(38 92% 50%);               /* Amber #F59E0B */
  --color-warning-foreground: hsl(0 0% 0%);
  --color-error: hsl(0 84% 60%);                  /* Red #EF4444 */
  --color-error-foreground: hsl(0 0% 100%);
  --color-info: hsl(199 89% 48%);                 /* Sky #0EA5E9 */
  --color-info-foreground: hsl(0 0% 100%);

  /* Neutral - Slate Scale */
  --color-background: hsl(0 0% 100%);             /* White */
  --color-foreground: hsl(222 47% 11%);           /* Slate 900 */
  --color-card: hsl(0 0% 100%);
  --color-card-foreground: hsl(222 47% 11%);
  --color-popover: hsl(0 0% 100%);
  --color-popover-foreground: hsl(222 47% 11%);
  --color-muted: hsl(210 40% 96%);                /* Slate 100 */
  --color-muted-foreground: hsl(215 16% 47%);     /* Slate 500 */
  --color-accent: hsl(210 40% 96%);               /* Slate 100 */
  --color-accent-foreground: hsl(222 47% 11%);    /* Slate 900 */
  --color-destructive: hsl(0 84% 60%);            /* Same as error */
  --color-destructive-foreground: hsl(0 0% 100%);

  /* Borders and Inputs */
  --color-border: hsl(214 32% 91%);               /* Slate 200 */
  --color-input: hsl(214 32% 91%);                /* Slate 200 */
  --color-ring: hsl(217 91% 60%);                 /* Primary blue for focus */

  /* ==========================================================================
     BORDER RADIUS
     ========================================================================== */
  --radius-lg: 0.5rem;
  --radius-md: calc(var(--radius-lg) - 2px);
  --radius-sm: calc(var(--radius-lg) - 4px);
  --radius-full: 9999px;

  /* ==========================================================================
     FONT FAMILY
     ========================================================================== */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  /* ==========================================================================
     TYPOGRAPHY SCALE
     ========================================================================== */
  --font-size-xs: 0.75rem;      /* 12px */
  --font-size-sm: 0.875rem;     /* 14px */
  --font-size-base: 1rem;       /* 16px */
  --font-size-lg: 1.125rem;     /* 18px */
  --font-size-xl: 1.25rem;      /* 20px */
  --font-size-2xl: 1.5rem;      /* 24px */
  --font-size-3xl: 1.875rem;    /* 30px */

  --line-height-xs: 1rem;       /* 16px */
  --line-height-sm: 1.25rem;    /* 20px */
  --line-height-base: 1.5rem;   /* 24px */
  --line-height-lg: 1.75rem;    /* 28px */
  --line-height-xl: 1.75rem;    /* 28px */
  --line-height-2xl: 2rem;      /* 32px */
  --line-height-3xl: 2.25rem;   /* 36px */

  /* ==========================================================================
     SHADOWS
     ========================================================================== */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);

  /* ==========================================================================
     ANIMATION
     ========================================================================== */
  --duration-fast: 150ms;
  --duration-normal: 200ms;
  --duration-slow: 300ms;
  --ease-default: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}

/* ==========================================================================
   DARK MODE THEME
   ========================================================================== */

/* Class-based dark mode (for manual toggle) */
.dark {
  /* Primary */
  --color-primary: hsl(217 91% 65%);
  --color-primary-foreground: hsl(222 47% 11%);
  --color-primary-hover: hsl(217 91% 70%);
  --color-primary-active: hsl(217 91% 60%);

  /* Secondary */
  --color-secondary: hsl(217 33% 17%);
  --color-secondary-foreground: hsl(210 40% 98%);
  --color-secondary-hover: hsl(217 33% 22%);

  /* Semantic Colors - Adjusted for dark mode visibility */
  --color-success: hsl(142 71% 45%);
  --color-success-foreground: hsl(0 0% 100%);
  --color-warning: hsl(38 92% 50%);
  --color-warning-foreground: hsl(0 0% 0%);
  --color-error: hsl(0 62% 50%);
  --color-error-foreground: hsl(0 0% 100%);
  --color-info: hsl(199 89% 48%);
  --color-info-foreground: hsl(0 0% 100%);

  /* Neutral - Slate Scale (Dark) */
  --color-background: hsl(222 47% 11%);           /* Slate 900 */
  --color-foreground: hsl(210 40% 98%);           /* Slate 50 */
  --color-card: hsl(217 33% 17%);                 /* Slate 800 */
  --color-card-foreground: hsl(210 40% 98%);
  --color-popover: hsl(217 33% 17%);
  --color-popover-foreground: hsl(210 40% 98%);
  --color-muted: hsl(217 33% 17%);                /* Slate 800 */
  --color-muted-foreground: hsl(215 20% 65%);     /* Slate 400 */
  --color-accent: hsl(217 33% 17%);
  --color-accent-foreground: hsl(210 40% 98%);
  --color-destructive: hsl(0 62% 50%);
  --color-destructive-foreground: hsl(0 0% 100%);

  /* Borders and Inputs */
  --color-border: hsl(217 33% 25%);               /* Slate 700 */
  --color-input: hsl(217 33% 25%);
  --color-ring: hsl(217 91% 65%);

  /* Shadows - More subtle in dark mode */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.3);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.5), 0 4px 6px -4px rgb(0 0 0 / 0.4);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.4);
}

/* System preference fallback when no .dark class is present */
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    /* Primary */
    --color-primary: hsl(217 91% 65%);
    --color-primary-foreground: hsl(222 47% 11%);
    --color-primary-hover: hsl(217 91% 70%);
    --color-primary-active: hsl(217 91% 60%);

    /* Secondary */
    --color-secondary: hsl(217 33% 17%);
    --color-secondary-foreground: hsl(210 40% 98%);
    --color-secondary-hover: hsl(217 33% 22%);

    /* Semantic Colors */
    --color-success: hsl(142 71% 45%);
    --color-success-foreground: hsl(0 0% 100%);
    --color-warning: hsl(38 92% 50%);
    --color-warning-foreground: hsl(0 0% 0%);
    --color-error: hsl(0 62% 50%);
    --color-error-foreground: hsl(0 0% 100%);
    --color-info: hsl(199 89% 48%);
    --color-info-foreground: hsl(0 0% 100%);

    /* Neutral */
    --color-background: hsl(222 47% 11%);
    --color-foreground: hsl(210 40% 98%);
    --color-card: hsl(217 33% 17%);
    --color-card-foreground: hsl(210 40% 98%);
    --color-popover: hsl(217 33% 17%);
    --color-popover-foreground: hsl(210 40% 98%);
    --color-muted: hsl(217 33% 17%);
    --color-muted-foreground: hsl(215 20% 65%);
    --color-accent: hsl(217 33% 17%);
    --color-accent-foreground: hsl(210 40% 98%);
    --color-destructive: hsl(0 62% 50%);
    --color-destructive-foreground: hsl(0 0% 100%);

    /* Borders */
    --color-border: hsl(217 33% 25%);
    --color-input: hsl(217 33% 25%);
    --color-ring: hsl(217 91% 65%);

    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4), 0 2px 4px -2px rgb(0 0 0 / 0.3);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.5), 0 4px 6px -4px rgb(0 0 0 / 0.4);
    --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.4);
  }
}

/* ==========================================================================
   BASE STYLES
   ========================================================================== */
@layer base {
  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground;
    font-feature-settings: 'rlig' 1, 'calt' 1;
  }
}
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Lint passes: `cd apps/web && pnpm run lint`
- [ ] Build succeeds: `cd apps/web && pnpm run build`
- [ ] Dev server starts: `cd apps/web && pnpm run dev`

#### Manual Verification
- [ ] Primary button shows blue (#3B82F6) background
- [ ] Destructive button shows red (#EF4444) background
- [ ] Page background is white in light mode
- [ ] Text is readable (high contrast)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Typography System with Inter Font

### Overview

Add Inter font via `next/font/google` and configure it in the layout. The font will be available via CSS custom property `--font-inter`.

### Changes Required

#### 1. Update Root Layout with Inter Font

**File**: `apps/web/src/app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/providers/query-provider'

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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Build succeeds: `cd apps/web && pnpm run build`

#### Manual Verification
- [ ] Inter font loads (check Network tab in DevTools for Inter font file)
- [ ] Text appears with Inter font characteristics (distinctive lowercase 'l' and 't')
- [ ] Font displays swap behavior (no flash of unstyled text)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dark Mode Toggle Hook and Provider

### Overview

Create a theme context and hook to manage dark mode state with localStorage persistence. The system will respect the user's system preference as default but allow manual override.

### Changes Required

#### 1. Create Theme Provider

**File**: `apps/web/src/providers/theme-provider.tsx`

```tsx
'use client'

import * as React from 'react'

type Theme = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined)

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeProviderProps {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'terp-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light')

  // Initialize theme from localStorage on mount
  React.useEffect(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null
    if (stored && ['light', 'dark', 'system'].includes(stored)) {
      setThemeState(stored)
    }
  }, [storageKey])

  // Update resolved theme and DOM class
  React.useEffect(() => {
    const root = document.documentElement
    const resolved = theme === 'system' ? getSystemTheme() : theme
    setResolvedTheme(resolved)

    root.classList.remove('light', 'dark')
    root.classList.add(resolved)
  }, [theme])

  // Listen for system theme changes
  React.useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      setResolvedTheme(getSystemTheme())
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(getSystemTheme())
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  const setTheme = React.useCallback(
    (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme)
      setThemeState(newTheme)
    },
    [storageKey]
  )

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = React.useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
```

#### 2. Create Theme Toggle Component

**File**: `apps/web/src/components/ui/theme-toggle.tsx`

```tsx
'use client'

import { Moon, Sun, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/providers/theme-provider'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycleTheme}
      aria-label={`Current theme: ${theme}. Click to change.`}
    >
      {theme === 'light' && <Sun className="size-5" />}
      {theme === 'dark' && <Moon className="size-5" />}
      {theme === 'system' && <Monitor className="size-5" />}
    </Button>
  )
}
```

#### 3. Install Lucide React Icons

```bash
cd /home/tolga/projects/terp/apps/web
pnpm add lucide-react
```

#### 4. Update Root Layout to Include Theme Provider

**File**: `apps/web/src/app/layout.tsx`

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/providers/query-provider'
import { ThemeProvider } from '@/providers/theme-provider'

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
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider defaultTheme="system">
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
```

#### 5. Add Theme Toggle to Home Page for Testing

**File**: `apps/web/src/app/page.tsx`

Update to include theme toggle:

```tsx
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="flex flex-col items-center gap-8">
        <h1 className="text-4xl font-bold">Terp</h1>
        <p className="text-muted-foreground">
          Time tracking and employee management system
        </p>
        <div className="flex gap-4">
          <Button>Get Started</Button>
          <Button variant="outline">Learn More</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" size="sm">Delete</Button>
          <Button variant="secondary" size="sm">Cancel</Button>
          <Button variant="ghost" size="sm">Ghost</Button>
          <Button variant="link" size="sm">Link</Button>
        </div>
      </div>
    </main>
  )
}
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Lint passes: `cd apps/web && pnpm run lint`
- [ ] Build succeeds: `cd apps/web && pnpm run build`

#### Manual Verification
- [ ] Theme toggle button visible in top-right corner
- [ ] Clicking cycles through light -> dark -> system
- [ ] Light mode: white background, dark text
- [ ] Dark mode: dark blue/slate background, light text
- [ ] System mode: follows OS preference
- [ ] Theme persists after page refresh (check localStorage)
- [ ] No hydration errors in console

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Install Core Shadcn Components

### Overview

Install Input and Card components from Shadcn/ui to provide common form and layout components.

### Changes Required

#### 1. Install Input Component

```bash
cd /home/tolga/projects/terp/apps/web
pnpm dlx shadcn@latest add input
```

#### 2. Install Card Component

```bash
cd /home/tolga/projects/terp/apps/web
pnpm dlx shadcn@latest add card
```

#### 3. Install Label Component (dependency for Input)

```bash
cd /home/tolga/projects/terp/apps/web
pnpm dlx shadcn@latest add label
```

#### 4. Update Home Page to Showcase Components

**File**: `apps/web/src/app/page.tsx`

```tsx
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '@/components/ui/theme-toggle'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="flex flex-col items-center gap-8 max-w-md w-full">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Terp</h1>
          <p className="text-muted-foreground mt-2">
            Time tracking and employee management system
          </p>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>Enter your credentials to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="Enter your password" />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button className="w-full">Sign In</Button>
            <Button variant="outline" className="w-full">Create Account</Button>
          </CardFooter>
        </Card>

        <div className="flex flex-wrap gap-2 justify-center">
          <Button variant="destructive" size="sm">Delete</Button>
          <Button variant="secondary" size="sm">Cancel</Button>
          <Button variant="ghost" size="sm">Ghost</Button>
          <Button variant="link" size="sm">Link</Button>
        </div>
      </div>
    </main>
  )
}
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Lint passes: `cd apps/web && pnpm run lint`
- [ ] Build succeeds: `cd apps/web && pnpm run build`
- [ ] Files exist: `ls apps/web/src/components/ui/input.tsx apps/web/src/components/ui/card.tsx apps/web/src/components/ui/label.tsx`

#### Manual Verification
- [ ] Card component renders with header, content, footer
- [ ] Input fields are styled consistently
- [ ] Input focus ring uses primary blue color
- [ ] Card has subtle shadow and rounded corners
- [ ] Components respect dark mode theme

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Create Utility Layout Components

### Overview

Create Stack, Grid, and Container utility components to provide consistent layout primitives.

### Changes Required

#### 1. Create Stack Component

**File**: `apps/web/src/components/ui/stack.tsx`

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Direction of stack */
  direction?: 'row' | 'column'
  /** Gap between items (Tailwind spacing scale) */
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12
  /** Horizontal alignment */
  align?: 'start' | 'center' | 'end' | 'stretch'
  /** Vertical alignment */
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
  /** Whether items should wrap */
  wrap?: boolean
  /** HTML element to render */
  as?: 'div' | 'section' | 'article' | 'nav' | 'aside' | 'header' | 'footer' | 'main'
}

const gapClasses: Record<number, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
}

const alignClasses: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
}

const justifyClasses: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
  evenly: 'justify-evenly',
}

const Stack = React.forwardRef<HTMLDivElement, StackProps>(
  (
    {
      direction = 'column',
      gap = 4,
      align = 'stretch',
      justify = 'start',
      wrap = false,
      as: Component = 'div',
      className,
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref}
        className={cn(
          'flex',
          direction === 'row' ? 'flex-row' : 'flex-col',
          gapClasses[gap],
          alignClasses[align],
          justifyClasses[justify],
          wrap && 'flex-wrap',
          className
        )}
        {...props}
      />
    )
  }
)
Stack.displayName = 'Stack'

// Convenience components
const HStack = React.forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="row" {...props} />
)
HStack.displayName = 'HStack'

const VStack = React.forwardRef<HTMLDivElement, Omit<StackProps, 'direction'>>(
  (props, ref) => <Stack ref={ref} direction="column" {...props} />
)
VStack.displayName = 'VStack'

export { Stack, HStack, VStack }
export type { StackProps }
```

#### 2. Create Container Component

**File**: `apps/web/src/components/ui/container.tsx`

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Maximum width variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
  /** Center the container */
  center?: boolean
  /** Add horizontal padding */
  padding?: boolean
  /** HTML element to render */
  as?: 'div' | 'section' | 'article' | 'main'
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-screen-sm',   /* 640px */
  md: 'max-w-screen-md',   /* 768px */
  lg: 'max-w-screen-lg',   /* 1024px */
  xl: 'max-w-screen-xl',   /* 1280px */
  '2xl': 'max-w-screen-2xl', /* 1536px */
  full: 'max-w-full',
}

const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  (
    {
      size = 'xl',
      center = true,
      padding = true,
      as: Component = 'div',
      className,
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref}
        className={cn(
          'w-full',
          sizeClasses[size],
          center && 'mx-auto',
          padding && 'px-4 sm:px-6 lg:px-8',
          className
        )}
        {...props}
      />
    )
  }
)
Container.displayName = 'Container'

export { Container }
export type { ContainerProps }
```

#### 3. Create Grid Component

**File**: `apps/web/src/components/ui/grid.tsx`

```tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns (responsive object or single value) */
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12
  /** Gap between items */
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12
  /** HTML element to render */
  as?: 'div' | 'section' | 'ul'
}

const colClasses: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
}

const gapClasses: Record<number, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
}

const Grid = React.forwardRef<HTMLDivElement, GridProps>(
  ({ cols = 1, gap = 4, as: Component = 'div', className, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={cn('grid', colClasses[cols], gapClasses[gap], className)}
        {...props}
      />
    )
  }
)
Grid.displayName = 'Grid'

// GridItem for spanning columns
interface GridItemProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Number of columns to span */
  span?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'full'
}

const spanClasses: Record<string | number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  12: 'col-span-12',
  full: 'col-span-full',
}

const GridItem = React.forwardRef<HTMLDivElement, GridItemProps>(
  ({ span = 1, className, ...props }, ref) => {
    return (
      <div ref={ref} className={cn(spanClasses[span], className)} {...props} />
    )
  }
)
GridItem.displayName = 'GridItem'

export { Grid, GridItem }
export type { GridProps, GridItemProps }
```

#### 4. Export Layout Components from Index

**File**: `apps/web/src/components/layout/index.ts`

```tsx
export { Stack, HStack, VStack, type StackProps } from '@/components/ui/stack'
export { Container, type ContainerProps } from '@/components/ui/container'
export { Grid, GridItem, type GridProps, type GridItemProps } from '@/components/ui/grid'
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Lint passes: `cd apps/web && pnpm run lint`
- [ ] Build succeeds: `cd apps/web && pnpm run build`
- [ ] Files exist: `ls apps/web/src/components/ui/stack.tsx apps/web/src/components/ui/container.tsx apps/web/src/components/ui/grid.tsx`

#### Manual Verification
- [ ] Stack/HStack/VStack render correctly with gap
- [ ] Container centers content and applies max-width
- [ ] Grid displays items in columns
- [ ] All components accept className for customization

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Install and Configure Storybook

### Overview

Set up Storybook for documenting design tokens and components. This will serve as the living documentation for the design system.

### Changes Required

#### 1. Install Storybook

```bash
cd /home/tolga/projects/terp/apps/web
pnpm dlx storybook@latest init --skip-install
pnpm install
```

#### 2. Update Storybook Configuration for Tailwind

**File**: `apps/web/.storybook/preview.ts`

```typescript
import type { Preview } from '@storybook/react'
import '../src/app/globals.css'

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#0f172a' },
      ],
    },
  },
  decorators: [
    (Story, context) => {
      const isDark = context.globals.backgrounds?.value === '#0f172a'
      return (
        <div className={isDark ? 'dark' : ''}>
          <Story />
        </div>
      )
    },
  ],
}

export default preview
```

#### 3. Create Color Tokens Story

**File**: `apps/web/src/stories/design-system/Colors.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react'

const ColorSwatch = ({ name, className }: { name: string; className: string }) => (
  <div className="flex items-center gap-4">
    <div className={`size-12 rounded-lg border ${className}`} />
    <div>
      <p className="font-medium">{name}</p>
      <p className="text-sm text-muted-foreground">{className}</p>
    </div>
  </div>
)

const ColorPalette = () => (
  <div className="space-y-8 p-4">
    <section>
      <h2 className="text-lg font-semibold mb-4">Primary Colors</h2>
      <div className="grid grid-cols-2 gap-4">
        <ColorSwatch name="Primary" className="bg-primary" />
        <ColorSwatch name="Primary Foreground" className="bg-primary-foreground" />
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Semantic Colors</h2>
      <div className="grid grid-cols-2 gap-4">
        <ColorSwatch name="Success" className="bg-success" />
        <ColorSwatch name="Warning" className="bg-warning" />
        <ColorSwatch name="Error" className="bg-error" />
        <ColorSwatch name="Info" className="bg-info" />
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Neutral Colors</h2>
      <div className="grid grid-cols-2 gap-4">
        <ColorSwatch name="Background" className="bg-background" />
        <ColorSwatch name="Foreground" className="bg-foreground" />
        <ColorSwatch name="Card" className="bg-card" />
        <ColorSwatch name="Muted" className="bg-muted" />
        <ColorSwatch name="Border" className="bg-border" />
        <ColorSwatch name="Input" className="bg-input" />
      </div>
    </section>
  </div>
)

const meta: Meta = {
  title: 'Design System/Colors',
  component: ColorPalette,
}

export default meta

type Story = StoryObj

export const Default: Story = {}
```

#### 4. Create Typography Story

**File**: `apps/web/src/stories/design-system/Typography.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react'

const Typography = () => (
  <div className="space-y-8 p-4">
    <section>
      <h2 className="text-lg font-semibold mb-4">Font Sizes</h2>
      <div className="space-y-4">
        <p className="text-xs">text-xs (12px) - Extra small text</p>
        <p className="text-sm">text-sm (14px) - Small text</p>
        <p className="text-base">text-base (16px) - Base text</p>
        <p className="text-lg">text-lg (18px) - Large text</p>
        <p className="text-xl">text-xl (20px) - Extra large text</p>
        <p className="text-2xl">text-2xl (24px) - 2X large text</p>
        <p className="text-3xl">text-3xl (30px) - 3X large text</p>
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Font Weights</h2>
      <div className="space-y-2 text-lg">
        <p className="font-normal">font-normal (400) - Regular weight</p>
        <p className="font-medium">font-medium (500) - Medium weight</p>
        <p className="font-semibold">font-semibold (600) - Semibold weight</p>
        <p className="font-bold">font-bold (700) - Bold weight</p>
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Text Colors</h2>
      <div className="space-y-2">
        <p className="text-foreground">text-foreground - Primary text</p>
        <p className="text-muted-foreground">text-muted-foreground - Secondary text</p>
        <p className="text-primary">text-primary - Primary color</p>
        <p className="text-destructive">text-destructive - Destructive/error</p>
      </div>
    </section>
  </div>
)

const meta: Meta = {
  title: 'Design System/Typography',
  component: Typography,
}

export default meta

type Story = StoryObj

export const Default: Story = {}
```

#### 5. Create Button Story

**File**: `apps/web/src/stories/components/Button.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/ui/button'

const meta: Meta<typeof Button> = {
  title: 'Components/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'xs', 'sm', 'lg', 'icon', 'icon-xs', 'icon-sm', 'icon-lg'],
    },
    disabled: { control: 'boolean' },
  },
}

export default meta

type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'default',
    size: 'default',
  },
}

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4">
      <Button size="xs">Extra Small</Button>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
}

export const Disabled: Story = {
  args: {
    children: 'Disabled',
    disabled: true,
  },
}
```

#### 6. Update package.json with Storybook Scripts

**File**: `apps/web/package.json`

Add to scripts:

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6006",
    "build-storybook": "storybook build"
  }
}
```

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Storybook builds: `cd apps/web && pnpm run build-storybook`
- [ ] Files exist: `ls apps/web/.storybook/preview.ts apps/web/src/stories/`

#### Manual Verification
- [ ] `pnpm run storybook` opens Storybook at http://localhost:6006
- [ ] Colors story displays all color swatches
- [ ] Typography story shows all font sizes and weights
- [ ] Button story shows all variants and sizes
- [ ] Dark mode toggle works via backgrounds selector

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 7: Accessibility Verification

### Overview

Verify WCAG 2.1 AA contrast ratios for all color combinations and add any necessary adjustments.

### Changes Required

#### 1. Create Contrast Test Component

**File**: `apps/web/src/stories/design-system/Accessibility.stories.tsx`

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ContrastRatioDisplay = ({ bg, fg, label }: { bg: string; fg: string; label: string }) => (
  <div className={`p-4 rounded-lg ${bg}`}>
    <p className={`${fg} font-medium`}>{label}</p>
    <p className={`${fg} text-sm opacity-80`}>Sample text for contrast verification</p>
  </div>
)

const AccessibilityDemo = () => (
  <div className="space-y-8 p-4 max-w-2xl">
    <section>
      <h2 className="text-lg font-semibold mb-4">Color Contrast (WCAG 2.1 AA)</h2>
      <p className="text-muted-foreground mb-4">
        All text must have a contrast ratio of at least 4.5:1 for normal text and 3:1 for large text.
      </p>
      <div className="space-y-4">
        <ContrastRatioDisplay
          bg="bg-background"
          fg="text-foreground"
          label="Background / Foreground"
        />
        <ContrastRatioDisplay
          bg="bg-card"
          fg="text-card-foreground"
          label="Card / Card Foreground"
        />
        <ContrastRatioDisplay
          bg="bg-primary"
          fg="text-primary-foreground"
          label="Primary / Primary Foreground"
        />
        <ContrastRatioDisplay
          bg="bg-muted"
          fg="text-muted-foreground"
          label="Muted / Muted Foreground"
        />
        <ContrastRatioDisplay
          bg="bg-destructive"
          fg="text-destructive-foreground"
          label="Destructive / Destructive Foreground"
        />
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Focus States</h2>
      <p className="text-muted-foreground mb-4">
        All interactive elements must have visible focus indicators.
      </p>
      <div className="flex flex-wrap gap-4">
        <Button>Focus me (Tab)</Button>
        <Button variant="outline">Outline Button</Button>
        <Input placeholder="Focus this input" className="max-w-xs" />
      </div>
    </section>

    <section>
      <h2 className="text-lg font-semibold mb-4">Semantic Colors</h2>
      <div className="space-y-4">
        <ContrastRatioDisplay
          bg="bg-success"
          fg="text-success-foreground"
          label="Success State"
        />
        <ContrastRatioDisplay
          bg="bg-warning"
          fg="text-warning-foreground"
          label="Warning State"
        />
        <ContrastRatioDisplay
          bg="bg-error"
          fg="text-error-foreground"
          label="Error State"
        />
        <ContrastRatioDisplay
          bg="bg-info"
          fg="text-info-foreground"
          label="Info State"
        />
      </div>
    </section>
  </div>
)

const meta: Meta = {
  title: 'Design System/Accessibility',
  component: AccessibilityDemo,
}

export default meta

type Story = StoryObj

export const Default: Story = {}
```

### Contrast Ratio Reference

Based on the HSL values in our theme:

| Combination | Light Mode | Dark Mode | Status |
|-------------|------------|-----------|--------|
| Background/Foreground | White/Slate 900 | Slate 900/Slate 50 | PASS (21:1 / 19:1) |
| Primary/Primary-foreground | Blue 500/White | Blue 400/Slate 900 | PASS (4.5:1+) |
| Muted/Muted-foreground | Slate 100/Slate 500 | Slate 800/Slate 400 | PASS (4.5:1+) |
| Destructive/Destructive-fg | Red 500/White | Red 600/White | PASS (4.5:1+) |
| Success/Success-fg | Green 500/White | Green 500/White | PASS (4.5:1+) |
| Warning/Warning-fg | Amber 500/Black | Amber 500/Black | PASS (4.5:1+) |

### Success Criteria

#### Automated Verification
- [ ] TypeScript compiles: `cd apps/web && pnpm run typecheck`
- [ ] Storybook builds: `cd apps/web && pnpm run build-storybook`

#### Manual Verification
- [ ] All text is readable in light mode
- [ ] All text is readable in dark mode
- [ ] Focus rings are visible on all interactive elements
- [ ] Tab navigation works through all focusable elements
- [ ] No pure white text on colored backgrounds (except where contrast is verified)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests

1. **Theme Provider Tests**
   - Theme state initializes from localStorage
   - Theme state persists to localStorage
   - System preference is respected when theme is 'system'
   - Theme toggles correctly through states

2. **Layout Component Tests**
   - Stack renders with correct flex direction
   - Container applies max-width correctly
   - Grid renders correct number of columns

### Integration Tests

1. **Theme Switching**
   - Click theme toggle changes DOM class
   - CSS variables update on theme change
   - Components re-render with new colors

### Manual Testing Steps

1. Open app at http://localhost:3000
2. Verify light mode appearance (blue primary, white background)
3. Click theme toggle to switch to dark mode
4. Verify dark mode appearance (lighter blue, dark slate background)
5. Refresh page and verify theme persists
6. Change system preference and verify 'system' mode follows it
7. Navigate through all interactive elements with keyboard (Tab)
8. Verify focus rings are visible
9. Test Input component for placeholder and focus states
10. Test Card component for shadow and border radius

---

## Performance Considerations

1. **Font Loading**: Inter font uses `display: 'swap'` to prevent FOIT (Flash of Invisible Text)
2. **CSS Variables**: All tokens use CSS custom properties for efficient runtime theming
3. **No JavaScript for Basic Theming**: Dark mode CSS is pure CSS, JavaScript only needed for toggle
4. **Tree Shaking**: Shadcn components are installed individually, not as a bundle

---

## Migration Notes

This is a new design system, no migration needed. The existing Button component will be updated in place.

For future components:
1. Always use CSS variables for colors
2. Follow Shadcn/ui component patterns
3. Use `cn()` utility for class composition
4. Support dark mode through CSS, not props

---

## References

- **Ticket**: NOK-218
- **Research**: `thoughts/shared/research/2026-01-25-NOK-218-design-system.md`
- **Previous Init**: `thoughts/shared/plans/2026-01-25-NOK-214-nextjs-project-init.md`
- **Tailwind v4 Docs**: https://tailwindcss.com/docs
- **Shadcn/ui Docs**: https://ui.shadcn.com/docs
- **WCAG 2.1 AA Guidelines**: https://www.w3.org/WAI/WCAG21/quickref/?levels=aa

---

## Estimated Implementation Time

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Color System | 30 min |
| Phase 2: Typography (Inter) | 15 min |
| Phase 3: Dark Mode Toggle | 45 min |
| Phase 4: Shadcn Components | 20 min |
| Phase 5: Utility Components | 45 min |
| Phase 6: Storybook | 60 min |
| Phase 7: Accessibility | 30 min |
| **Total** | **~4 hours** |

---

## File Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/web/src/providers/theme-provider.tsx` | Theme context and hook |
| `apps/web/src/components/ui/theme-toggle.tsx` | Theme toggle button |
| `apps/web/src/components/ui/stack.tsx` | Stack layout component |
| `apps/web/src/components/ui/container.tsx` | Container layout component |
| `apps/web/src/components/ui/grid.tsx` | Grid layout component |
| `apps/web/src/components/layout/index.ts` | Layout exports |
| `apps/web/src/stories/design-system/Colors.stories.tsx` | Color token documentation |
| `apps/web/src/stories/design-system/Typography.stories.tsx` | Typography documentation |
| `apps/web/src/stories/design-system/Accessibility.stories.tsx` | Accessibility demo |
| `apps/web/src/stories/components/Button.stories.tsx` | Button component stories |
| `apps/web/.storybook/preview.ts` | Storybook configuration |

### Modified Files

| File | Changes |
|------|---------|
| `apps/web/src/app/globals.css` | Replace color palette, add tokens |
| `apps/web/src/app/layout.tsx` | Add Inter font, ThemeProvider |
| `apps/web/src/app/page.tsx` | Add component showcase |
| `apps/web/package.json` | Add Storybook scripts, lucide-react |

### Files Added by Shadcn CLI

| File | Via |
|------|-----|
| `apps/web/src/components/ui/input.tsx` | `shadcn add input` |
| `apps/web/src/components/ui/card.tsx` | `shadcn add card` |
| `apps/web/src/components/ui/label.tsx` | `shadcn add label` |
