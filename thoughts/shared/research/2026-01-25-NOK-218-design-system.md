---
date: 2026-01-25T20:50:00+01:00
researcher: Claude
git_commit: c1ad54c6f51f29c6288b20686cf383131f1b1c3f
branch: master
repository: terp
topic: "NOK-218: Design System with Theme Tokens and Component Variants"
tags: [research, design-system, tailwind, shadcn, css-variables, theming]
status: complete
last_updated: 2026-01-25
last_updated_by: Claude
---

# Research: NOK-218 - Design System with Theme Tokens and Component Variants

**Date**: 2026-01-25T20:50:00+01:00
**Researcher**: Claude
**Git Commit**: c1ad54c6f51f29c6288b20686cf383131f1b1c3f
**Branch**: master
**Repository**: terp

## Research Question

Document the current state of the design system in `apps/web/` to understand what exists for theme tokens, color palette, typography, spacing, and component variants before implementing NOK-218.

## Summary

The web frontend has a foundational design system established using **Tailwind CSS v4 with CSS-first configuration** and **Shadcn/ui**. The current implementation includes:

- Color tokens defined via `@theme` directive using HSL values (neutral/gray palette)
- Dark mode support via `prefers-color-scheme` media query
- Border radius tokens (`--radius-lg`, `--radius-md`, `--radius-sm`)
- System font stack (not Inter)
- One Shadcn/ui component installed (Button with 6 variants, 8 sizes)
- No custom spacing scale, shadow tokens, or animation tokens
- No Storybook or design documentation
- No utility components (Stack, Grid, Container)

---

## Detailed Findings

### 1. CSS Configuration

**File**: `/home/tolga/projects/terp/apps/web/src/app/globals.css`

The project uses Tailwind CSS v4's CSS-first approach with the `@theme` directive instead of a `tailwind.config.js` file.

**Current Theme Structure**:
```css
@import 'tailwindcss';

@theme {
  /* Colors */
  /* Border radius */
  /* Font family */
}

@media (prefers-color-scheme: dark) {
  @theme {
    /* Dark mode overrides */
  }
}

@layer base {
  /* Base styles */
}
```

### 2. Color Tokens

**Current Color Palette** (Light Mode):

| Token | Value | Description |
|-------|-------|-------------|
| `--color-background` | `hsl(0 0% 100%)` | White |
| `--color-foreground` | `hsl(0 0% 3.9%)` | Near black |
| `--color-card` | `hsl(0 0% 100%)` | White |
| `--color-card-foreground` | `hsl(0 0% 3.9%)` | Near black |
| `--color-popover` | `hsl(0 0% 100%)` | White |
| `--color-popover-foreground` | `hsl(0 0% 3.9%)` | Near black |
| `--color-primary` | `hsl(0 0% 9%)` | Dark gray |
| `--color-primary-foreground` | `hsl(0 0% 98%)` | Near white |
| `--color-secondary` | `hsl(0 0% 96.1%)` | Light gray |
| `--color-secondary-foreground` | `hsl(0 0% 9%)` | Dark gray |
| `--color-muted` | `hsl(0 0% 96.1%)` | Light gray |
| `--color-muted-foreground` | `hsl(0 0% 45.1%)` | Medium gray |
| `--color-accent` | `hsl(0 0% 96.1%)` | Light gray |
| `--color-accent-foreground` | `hsl(0 0% 9%)` | Dark gray |
| `--color-destructive` | `hsl(0 84.2% 60.2%)` | Red |
| `--color-destructive-foreground` | `hsl(0 0% 98%)` | Near white |
| `--color-border` | `hsl(0 0% 89.8%)` | Light gray |
| `--color-input` | `hsl(0 0% 89.8%)` | Light gray |
| `--color-ring` | `hsl(0 0% 3.9%)` | Near black |

**Dark Mode Color Palette**:

The dark mode uses inverted values with backgrounds at `hsl(0 0% 3.9%)` and foregrounds at `hsl(0 0% 98%)`.

**Observations**:
- Uses Shadcn/ui's default "neutral" color base (gray scale)
- All colors are achromatic (no hue) except `--color-destructive`
- No semantic colors defined (success, warning, info)
- No primary brand color (ticket specifies Blue #3B82F6)

### 3. Dark Mode Implementation

**Current Approach**: Uses CSS `@media (prefers-color-scheme: dark)` for automatic switching based on system preference.

```css
@media (prefers-color-scheme: dark) {
  @theme {
    /* Dark mode overrides */
  }
}
```

**Observations**:
- No manual toggle mechanism exists
- No class-based theme switching (e.g., `.dark` class on `<html>`)
- Relies entirely on operating system preference

### 4. Typography

**Current Font Stack**:
```css
--font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

**Font Usage in Layout**:
```tsx
// apps/web/src/app/layout.tsx
<body className="min-h-screen bg-background font-sans antialiased">
```

**Observations**:
- Uses system font stack, not Inter (as specified in ticket)
- No `next/font` usage despite being mentioned in README
- No custom font sizes, weights, or line heights defined
- No typography scale (`--font-size-xs`, `--font-size-sm`, etc.)

**README vs Implementation Discrepancy**:

The README states:
> **Font**: Inter via next/font

But the implementation uses a system font stack without next/font integration.

### 5. Border Radius Tokens

**Current Tokens**:
```css
--radius-lg: 0.5rem;           /* 8px */
--radius-md: calc(var(--radius-lg) - 2px);  /* 6px */
--radius-sm: calc(var(--radius-lg) - 4px);  /* 4px */
```

**Usage**: The Button component uses `rounded-md` class.

### 6. Spacing Scale

**Current State**: No custom spacing scale defined in `@theme`.

The project relies on Tailwind's default spacing scale:
- `gap-4` (16px)
- `gap-8` (32px)
- `p-24` (96px)
- etc.

### 7. Shadow Tokens

**Current State**: No custom shadow tokens defined.

### 8. Animation/Transition Tokens

**Current State**: No custom animation or transition tokens defined.

The Button component uses Tailwind's built-in `transition-all` class.

### 9. Component Variants

**Existing Component**: Button

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/button.tsx`

**Variants** (6 total):
| Variant | Description |
|---------|-------------|
| `default` | Primary button (`bg-primary text-primary-foreground`) |
| `destructive` | Error/danger actions (`bg-destructive`) |
| `outline` | Bordered button with transparent background |
| `secondary` | Secondary action (`bg-secondary`) |
| `ghost` | No background, hover effect only |
| `link` | Underlined text link |

**Sizes** (8 total):
| Size | Height | Notes |
|------|--------|-------|
| `default` | `h-9` (36px) | Standard size |
| `xs` | `h-6` (24px) | Extra small |
| `sm` | `h-8` (32px) | Small |
| `lg` | `h-10` (40px) | Large |
| `icon` | `size-9` (36px square) | Icon-only |
| `icon-xs` | `size-6` (24px square) | Small icon |
| `icon-sm` | `size-8` (32px square) | Medium icon |
| `icon-lg` | `size-10` (40px square) | Large icon |

**Implementation Pattern**: Uses `class-variance-authority` (cva) for variant management.

### 10. Utility Functions

**File**: `/home/tolga/projects/terp/apps/web/src/lib/utils.ts`

```typescript
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

This is the standard Shadcn/ui utility for merging Tailwind classes.

### 11. Missing Components

The following are listed in the ticket but do not exist:

| Component | Status |
|-----------|--------|
| Input | Not installed |
| Card | Not installed |
| Stack | Does not exist |
| Grid | Does not exist |
| Container | Does not exist |

**Directory Structure**:
```
src/components/
  ui/
    button.tsx      # Only Shadcn component installed
    .gitkeep
  layout/
    .gitkeep        # Empty
  forms/
    .gitkeep        # Empty
```

### 12. Storybook

**Current State**: Not installed or configured.

No evidence of Storybook files, dependencies, or configuration.

---

## Code References

| File | Description |
|------|-------------|
| `apps/web/src/app/globals.css` | CSS theme configuration with color, radius, and font tokens |
| `apps/web/src/app/layout.tsx` | Root layout using `font-sans` and `bg-background` classes |
| `apps/web/src/components/ui/button.tsx` | Button component with 6 variants and 8 sizes |
| `apps/web/src/lib/utils.ts` | `cn()` utility function for class merging |
| `apps/web/components.json` | Shadcn/ui CLI configuration (new-york style, neutral base) |
| `apps/web/postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` plugin |
| `apps/web/package.json` | Dependencies including Tailwind v4, cva, clsx, tailwind-merge |

---

## Architecture Documentation

### Shadcn/ui Configuration

**File**: `/home/tolga/projects/terp/apps/web/components.json`

```json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",           // No tailwind.config.js (CSS-first)
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  },
  "iconLibrary": "lucide"
}
```

### Tailwind CSS v4 Approach

The project uses Tailwind's CSS-first configuration:

1. **No `tailwind.config.js`**: Configuration is done via `@theme` in CSS
2. **PostCSS Plugin**: Uses `@tailwindcss/postcss` instead of the older plugin
3. **Automatic Content Detection**: No need to specify content paths
4. **Modern CSS Features**: Uses CSS custom properties natively

### Component Pattern

Components follow the Shadcn/ui pattern:
- Use `cva` (class-variance-authority) for variant definitions
- Export `buttonVariants` alongside the component for flexibility
- Include data attributes (`data-slot`, `data-variant`, `data-size`)
- Support `asChild` prop via Radix `Slot` for composition

---

## Historical Context (from thoughts/)

**File**: `thoughts/shared/plans/2026-01-25-NOK-214-nextjs-project-init.md`

The Next.js project was initialized on 2026-01-25 with:
- Tailwind CSS v4 CSS-first configuration
- Shadcn/ui with "new-york" style
- Button as test component
- System font stack (not Inter as originally planned)

**File**: `thoughts/shared/research/2026-01-25-NOK-214-nextjs-project-init.md`

Research documented the decision to use:
- Tailwind v4 CSS-first approach
- React 19.2 with Next.js 16
- Shadcn/ui for component library

---

## Related Research

- `thoughts/shared/research/2026-01-25-NOK-214-nextjs-project-init.md` - Initial Next.js setup research
- `thoughts/shared/plans/2026-01-25-NOK-214-nextjs-project-init.md` - Implementation plan for frontend initialization

---

## Open Questions

1. **Inter Font**: The README mentions Inter via next/font, but implementation uses system font stack. Should Inter be added?

2. **Dark Mode Toggle**: Current implementation uses system preference only. Should a manual toggle be implemented?

3. **Semantic Colors**: The ticket specifies specific colors (Blue #3B82F6, Green #22C55E, etc.) but current implementation uses neutral grays. Should these be the new primary colors or additional semantic tokens?

4. **Storybook**: The ticket mentions documenting tokens in Storybook. Is Storybook a requirement or optional?

5. **Utility Components**: The ticket mentions Stack, Grid, Container. Should these be custom components or can Tailwind's flex/grid utilities suffice?

---

## Summary of Existing vs Ticket Requirements

| Requirement | Current State | Gap |
|-------------|---------------|-----|
| Color palette (primary, secondary, semantic) | Neutral grays only, destructive red | Need blue primary, success/warning/info colors |
| CSS custom properties for theme tokens | Basic set exists | Need expansion with semantic naming |
| Light and dark mode themes | Exists via `prefers-color-scheme` | May need class-based toggle |
| Typography scale | System font only | Need Inter, size scale, weights |
| Spacing scale (4px base) | Using Tailwind defaults | May need custom scale |
| Shadow tokens | None | Need to define |
| Border radius tokens | Basic set exists | Adequate |
| Common component variants | Button only | Need Input, Card |
| Animation/transition tokens | None | Need to define |
| Storybook documentation | None | Need to set up |
| Utility components (Stack, Grid, Container) | None | Need to create |
| WCAG 2.1 AA contrast | Unknown | Need to verify |
