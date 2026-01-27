# Implementation Plan: NOK-217 - Create Core Layout with Responsive Navigation

**Date**: 2026-01-25
**Ticket**: NOK-217
**Status**: Ready for Implementation

## Overview

This plan implements the core application layout with responsive navigation, including a collapsible sidebar for desktop, bottom tab bar for mobile, header with user menu and tenant selector, and accessibility features.

---

## Phase 1: Install Dependencies

### Description
Install required npm packages and shadcn/ui components before any component development.

### Tasks

1. **Install lucide-react for icons**
   - Package: `lucide-react`
   - Required by shadcn/ui configuration

2. **Install shadcn/ui components**
   - Components needed: `sheet`, `dropdown-menu`, `avatar`, `separator`, `scroll-area`, `tooltip`, `skeleton`, `breadcrumb`, `badge`

### Commands
```bash
cd apps/web
pnpm add lucide-react
npx shadcn@latest add sheet dropdown-menu avatar separator scroll-area tooltip skeleton breadcrumb badge
```

### Verification
```bash
# Verify lucide-react installed
cat apps/web/package.json | grep lucide-react

# Verify shadcn components created
ls -la apps/web/src/components/ui/
# Should see: sheet.tsx, dropdown-menu.tsx, avatar.tsx, separator.tsx,
#             scroll-area.tsx, tooltip.tsx, skeleton.tsx, breadcrumb.tsx, badge.tsx
```

### Success Criteria
- All packages installed without errors
- All shadcn component files exist in `src/components/ui/`

---

## Phase 2: Create Auth Context and Provider

### Description
Create authentication context to manage user state, which is required for user menu and role-based navigation filtering.

### Files to Create

1. **`apps/web/src/hooks/use-auth.ts`**
   - Custom hook for auth API calls
   - Uses existing API client patterns from `use-employees.ts`
   - Functions: `useCurrentUser()`, `useLogin()`, `useLogout()`

2. **`apps/web/src/providers/auth-provider.tsx`**
   - Auth context with user state
   - Loading and error states
   - Exports: `AuthProvider`, `useAuth()`
   - Interface:
     ```typescript
     interface AuthContextValue {
       user: User | null;
       isLoading: boolean;
       isAuthenticated: boolean;
       logout: () => Promise<void>;
       refetch: () => Promise<void>;
     }
     ```

3. **`apps/web/src/hooks/use-has-role.ts`**
   - Role checking utility hook
   - `useHasRole(roles: UserRole[]): boolean`

### File Paths
```
apps/web/src/
├── hooks/
│   ├── use-auth.ts           # NEW
│   └── use-has-role.ts       # NEW
└── providers/
    └── auth-provider.tsx     # NEW
```

### Verification
```bash
cd apps/web && pnpm build
# No TypeScript errors

# Manually test: Add AuthProvider to root layout temporarily and check browser console
```

### Success Criteria
- `useAuth()` hook provides user data when authenticated
- `useHasRole()` correctly filters based on user role
- No TypeScript errors

---

## Phase 3: Create Sidebar Context and Components

### Description
Build the sidebar with collapsed/expanded state management and navigation items.

### Files to Create

1. **`apps/web/src/components/layout/sidebar/sidebar-context.tsx`**
   - Context for sidebar collapsed state
   - Persist preference to localStorage
   - Interface:
     ```typescript
     interface SidebarContextValue {
       isCollapsed: boolean;
       toggle: () => void;
       collapse: () => void;
       expand: () => void;
     }
     ```

2. **`apps/web/src/components/layout/sidebar/sidebar-nav-config.ts`**
   - Navigation configuration with role-based filtering
   - Structure:
     ```typescript
     type NavItem = {
       title: string;
       href: string;
       icon: LucideIcon;
       roles?: UserRole[];
       badge?: number;
     };
     type NavSection = {
       title: string;
       roles?: UserRole[];
       items: NavItem[];
     };
     ```

3. **`apps/web/src/components/layout/sidebar/sidebar-nav-item.tsx`**
   - Individual navigation item component
   - Handles collapsed state (icon-only with tooltip)
   - Shows active state based on current route
   - Uses `next/link` for navigation

4. **`apps/web/src/components/layout/sidebar/sidebar-nav.tsx`**
   - Navigation section list
   - Filters items based on user role
   - Uses `ScrollArea` for long lists

5. **`apps/web/src/components/layout/sidebar/sidebar.tsx`**
   - Desktop sidebar container
   - Fixed position, 240px width (64px when collapsed)
   - Collapse toggle button
   - Logo/branding at top

6. **`apps/web/src/components/layout/sidebar/index.ts`**
   - Barrel export for sidebar components

### File Paths
```
apps/web/src/components/layout/sidebar/
├── index.ts
├── sidebar.tsx
├── sidebar-context.tsx
├── sidebar-nav.tsx
├── sidebar-nav-item.tsx
└── sidebar-nav-config.ts
```

### CSS Variables to Add
Add to `apps/web/src/app/globals.css`:
```css
@theme {
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 64px;
  --header-height: 64px;
  --content-max-width: 1280px;
  --bottom-nav-height: 64px;
}
```

### Verification
```bash
cd apps/web && pnpm build
# No TypeScript errors

# Create test page to render sidebar in isolation
```

### Success Criteria
- Sidebar renders with navigation items
- Collapse toggle works and persists to localStorage
- Active route highlighting works
- Role-based filtering hides unauthorized items

---

## Phase 4: Create Header Components

### Description
Build the fixed header with user menu, notifications, tenant selector, and search.

### Files to Create

1. **`apps/web/src/components/layout/user-menu.tsx`**
   - User avatar and dropdown menu
   - Shows user name/email
   - Links: Profile, Settings
   - Logout action
   - Uses: `DropdownMenu`, `Avatar`

2. **`apps/web/src/components/layout/notifications.tsx`**
   - Notifications bell icon with badge count
   - Dropdown with notification list (placeholder for now)
   - Uses: `DropdownMenu`, `Badge`

3. **`apps/web/src/components/layout/tenant-selector.tsx`**
   - Company/tenant dropdown selector
   - Fetches tenants from API using existing client
   - Updates tenant context on selection
   - Uses: `DropdownMenu`

4. **`apps/web/src/components/layout/header.tsx`**
   - Fixed header container (64px height)
   - Left: Mobile menu trigger (hamburger), logo
   - Center: Search input (optional, can be placeholder)
   - Right: Tenant selector, notifications, user menu
   - Uses z-index layering for proper stacking

### File Paths
```
apps/web/src/components/layout/
├── header.tsx
├── user-menu.tsx
├── notifications.tsx
└── tenant-selector.tsx
```

### Verification
```bash
cd apps/web && pnpm build

# Render header in isolation to verify:
# - User menu shows current user
# - Logout works
# - Tenant selector lists tenants
```

### Success Criteria
- Header renders at fixed 64px height
- User menu shows authenticated user info
- Logout clears auth state
- Tenant selector changes active tenant

---

## Phase 5: Create Mobile Navigation

### Description
Build the bottom tab bar for mobile devices with 5 primary actions.

### Files to Create

1. **`apps/web/src/components/layout/mobile-nav.tsx`**
   - Fixed bottom tab bar (hidden on lg+ screens)
   - 5 primary navigation items with icons and labels
   - Active state indication
   - Items: Dashboard, Time, Timesheet, Absences, More (opens sheet)

2. **`apps/web/src/components/layout/mobile-sidebar-sheet.tsx`**
   - Sheet component for full navigation on mobile
   - Triggered by hamburger in header or "More" in bottom nav
   - Contains full navigation from sidebar
   - Uses: `Sheet`

### File Paths
```
apps/web/src/components/layout/
├── mobile-nav.tsx
└── mobile-sidebar-sheet.tsx
```

### Verification
```bash
cd apps/web && pnpm build

# Test in browser:
# - Resize to mobile width (<1024px)
# - Bottom nav should appear
# - Sidebar should be hidden
# - Sheet opens from hamburger/more button
```

### Success Criteria
- Bottom nav visible only on mobile (<lg breakpoint)
- Sheet slides in with full navigation
- Active route highlighted in bottom nav

---

## Phase 6: Create Breadcrumbs Component

### Description
Build breadcrumb navigation that reflects current route hierarchy.

### Files to Create

1. **`apps/web/src/components/layout/breadcrumbs.tsx`**
   - Generates breadcrumbs from current pathname
   - Configuration for route-to-label mapping
   - Uses shadcn `Breadcrumb` component
   - Responsive: truncates on mobile

### File Paths
```
apps/web/src/components/layout/
└── breadcrumbs.tsx
```

### Verification
```bash
cd apps/web && pnpm build

# Test breadcrumbs render correctly for nested routes like /admin/employees/123
```

### Success Criteria
- Breadcrumbs show correct hierarchy
- Links navigate to parent routes
- Truncation works on small screens

---

## Phase 7: Create Accessibility Components

### Description
Add accessibility features required by ticket.

### Files to Create

1. **`apps/web/src/components/layout/skip-link.tsx`**
   - "Skip to main content" link
   - Visually hidden until focused
   - First focusable element in DOM

### File Paths
```
apps/web/src/components/layout/
└── skip-link.tsx
```

### Verification
```bash
# Test in browser:
# - Tab into page, skip link should appear
# - Activating skip link focuses main content area
```

### Success Criteria
- Skip link appears on first Tab press
- Focus moves to main content when activated

---

## Phase 8: Create Loading Skeleton

### Description
Build loading skeleton that shows layout structure while content loads.

### Files to Create

1. **`apps/web/src/components/layout/loading-skeleton.tsx`**
   - Skeleton version of full layout
   - Sidebar skeleton (items as skeleton bars)
   - Header skeleton (avatar, buttons as circles)
   - Content area skeleton

### File Paths
```
apps/web/src/components/layout/
└── loading-skeleton.tsx
```

### Verification
```bash
cd apps/web && pnpm build

# Visually verify skeleton matches layout structure
```

### Success Criteria
- Skeleton mimics real layout structure
- Animation works (pulse effect)

---

## Phase 9: Create App Layout Wrapper

### Description
Combine all components into the main layout wrapper.

### Files to Create

1. **`apps/web/src/components/layout/app-layout.tsx`**
   - Main layout component combining all pieces
   - Props: `children: React.ReactNode`
   - Structure:
     ```
     <SidebarProvider>
       <SkipLink />
       <div className="flex min-h-screen">
         <Sidebar className="hidden lg:flex" />
         <div className="flex-1 flex flex-col">
           <Header />
           <main id="main-content" className="flex-1 p-4 lg:p-6">
             <Breadcrumbs />
             {children}
           </main>
         </div>
       </div>
       <MobileNav className="lg:hidden" />
       <MobileSidebarSheet />
     </SidebarProvider>
     ```

2. **`apps/web/src/components/layout/index.ts`**
   - Barrel export for all layout components

### File Paths
```
apps/web/src/components/layout/
├── app-layout.tsx
└── index.ts
```

### Verification
```bash
cd apps/web && pnpm build
```

### Success Criteria
- Layout renders without errors
- All sub-components integrated correctly
- Responsive behavior works

---

## Phase 10: Set Up Route Groups

### Description
Organize app routes with proper layouts using Next.js route groups.

### Files to Create/Modify

1. **`apps/web/src/app/(dashboard)/layout.tsx`**
   - Protected layout using AppLayout
   - Wraps children with auth check

2. **`apps/web/src/app/(dashboard)/dashboard/page.tsx`**
   - Simple dashboard placeholder page

3. **`apps/web/src/app/(auth)/layout.tsx`**
   - Auth pages layout (no sidebar)
   - Centered content

4. **`apps/web/src/app/(auth)/login/page.tsx`**
   - Login page placeholder

5. **Modify `apps/web/src/app/layout.tsx`**
   - Add AuthProvider to provider stack
   - Keep minimal (providers only)

### File Paths
```
apps/web/src/app/
├── (auth)/
│   ├── layout.tsx
│   └── login/
│       └── page.tsx
├── (dashboard)/
│   ├── layout.tsx
│   └── dashboard/
│       └── page.tsx
├── layout.tsx          # Modified
└── page.tsx            # Redirect to /dashboard or /login
```

### Verification
```bash
cd apps/web && pnpm build
pnpm dev

# Test in browser:
# - Navigate to /dashboard - should see full layout
# - Navigate to /login - should see auth layout (no sidebar)
```

### Success Criteria
- Dashboard routes use AppLayout with sidebar
- Auth routes use minimal layout
- Root page redirects appropriately

---

## Phase 11: Final Integration and Testing

### Description
Test all functionality end-to-end.

### Tasks

1. **Responsive testing**
   - Desktop (1280px+): Full sidebar visible
   - Tablet (768-1024px): Collapsed sidebar or sheet
   - Mobile (<768px): Bottom nav, sheet for full menu

2. **Keyboard navigation testing**
   - Tab through all interactive elements
   - Arrow keys work in dropdown menus
   - Escape closes dropdowns/sheets
   - Skip link works

3. **Role-based navigation testing**
   - Employee sees only employee nav items
   - Manager sees employee + manager items
   - Admin sees all items

4. **State persistence testing**
   - Sidebar collapse state persists across page reloads
   - Tenant selection persists

### Verification Commands
```bash
cd apps/web && pnpm build && pnpm start

# Run Lighthouse accessibility audit
# Check all WCAG 2.1 AA requirements
```

### Success Criteria
- All responsive breakpoints work correctly
- Keyboard navigation fully functional
- Role-based filtering accurate
- No accessibility violations

---

## Summary of All Files to Create

```
apps/web/src/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   └── login/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   └── dashboard/
│   │       └── page.tsx
│   ├── globals.css           # Modified (add CSS variables)
│   └── layout.tsx            # Modified (add AuthProvider)
├── components/
│   └── layout/
│       ├── index.ts
│       ├── app-layout.tsx
│       ├── header.tsx
│       ├── user-menu.tsx
│       ├── notifications.tsx
│       ├── tenant-selector.tsx
│       ├── breadcrumbs.tsx
│       ├── mobile-nav.tsx
│       ├── mobile-sidebar-sheet.tsx
│       ├── skip-link.tsx
│       ├── loading-skeleton.tsx
│       └── sidebar/
│           ├── index.ts
│           ├── sidebar.tsx
│           ├── sidebar-context.tsx
│           ├── sidebar-nav.tsx
│           ├── sidebar-nav-item.tsx
│           └── sidebar-nav-config.ts
├── hooks/
│   ├── use-auth.ts
│   └── use-has-role.ts
└── providers/
    └── auth-provider.tsx
```

**Total new files**: 24
**Modified files**: 2 (globals.css, layout.tsx)

---

## Dependencies Summary

### NPM Packages
- `lucide-react` - Icons

### shadcn/ui Components
- `sheet` - Mobile sidebar drawer
- `dropdown-menu` - User menu, notifications, tenant selector
- `avatar` - User avatar
- `separator` - Visual dividers
- `scroll-area` - Scrollable sidebar
- `tooltip` - Icon tooltips when sidebar collapsed
- `skeleton` - Loading states
- `breadcrumb` - Breadcrumb navigation
- `badge` - Notification badges

---

## Estimated Implementation Order

| Phase | Description | Depends On | Est. Time |
|-------|-------------|------------|-----------|
| 1 | Install dependencies | - | 10 min |
| 2 | Auth context/provider | Phase 1 | 45 min |
| 3 | Sidebar components | Phase 1, 2 | 90 min |
| 4 | Header components | Phase 1, 2 | 60 min |
| 5 | Mobile navigation | Phase 1, 3 | 45 min |
| 6 | Breadcrumbs | Phase 1 | 30 min |
| 7 | Accessibility (skip link) | - | 15 min |
| 8 | Loading skeleton | Phase 1 | 30 min |
| 9 | App layout wrapper | Phase 3-8 | 30 min |
| 10 | Route groups | Phase 9 | 45 min |
| 11 | Testing | Phase 10 | 60 min |

**Total estimated time**: ~7-8 hours
