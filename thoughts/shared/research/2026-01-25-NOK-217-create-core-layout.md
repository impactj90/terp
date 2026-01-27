# Research: NOK-217 - Create Core Layout with Responsive Navigation

**Date**: 2026-01-25
**Ticket**: NOK-217
**Status**: Research Complete

## 1. Current Project Structure

### 1.1 Frontend Stack

The Next.js web app (`apps/web/`) is already initialized with:

| Technology | Version | Status |
|------------|---------|--------|
| Next.js | 16.1.x | Installed |
| React | 19.2.x | Installed |
| TypeScript | 5.9.x | Installed |
| Tailwind CSS | 4.x | Installed (CSS-first approach) |
| shadcn/ui | new-york style | Configured |
| React Query | 5.90.x | Installed |
| openapi-fetch | 0.15.x | Installed |

### 1.2 Directory Structure

```
apps/web/src/
├── app/
│   ├── globals.css         # Tailwind v4 theme with CSS variables
│   ├── layout.tsx          # Root layout (minimal - QueryProvider only)
│   └── page.tsx            # Home page (placeholder)
├── components/
│   ├── forms/              # Empty (.gitkeep only)
│   ├── layout/             # Empty (.gitkeep only) - TARGET FOR NEW COMPONENTS
│   └── ui/
│       └── button.tsx      # Only shadcn component installed so far
├── config/
│   └── env.ts              # Environment configuration
├── hooks/
│   ├── api/
│   │   ├── use-employees.ts
│   │   └── use-bookings.ts
│   ├── index.ts
│   ├── use-api-query.ts
│   └── use-api-mutation.ts
├── lib/
│   ├── api/
│   │   ├── client.ts       # openapi-fetch client with auth/tenant middleware
│   │   ├── errors.ts       # Error parsing utilities
│   │   ├── index.ts
│   │   └── types.ts        # Generated OpenAPI types
│   └── utils.ts            # cn() utility for Tailwind
├── providers/
│   └── query-provider.tsx  # React Query provider
└── types/
    └── index.ts            # Custom types (mostly empty)
```

### 1.3 Configuration Files

- **components.json**: shadcn/ui configured with:
  - Style: `new-york`
  - RSC: `true`
  - Icon library: `lucide` (NOTE: lucide-react not yet installed!)
  - Aliases: `@/components`, `@/lib`, `@/hooks`, etc.

- **tsconfig.json**: Path aliases configured (`@/*` -> `./src/*`)

- **globals.css**: Tailwind v4 with CSS-first theme using `@theme` directive

## 2. Existing Components and Patterns

### 2.1 Current Layout (Root)

```tsx
// apps/web/src/app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
```

**Observations**:
- Minimal root layout - only wraps children with QueryProvider
- No navigation, sidebar, or header components yet
- No auth context or tenant context providers

### 2.2 API Client Integration

The API client (`src/lib/api/client.ts`) already has:

1. **Auth token storage**: localStorage-based with `authStorage.getToken()/setToken()/clearToken()`
2. **Tenant ID storage**: localStorage-based with `tenantIdStorage.getTenantId()/setTenantId()/clearTenantId()`
3. **Middleware**: Automatically adds `Authorization` and `X-Tenant-ID` headers

**Available Auth Endpoints** (from types.ts):
- `GET /auth/me` - Get current user
- `POST /auth/login` - Login with credentials
- `POST /auth/logout` - Logout
- `GET /auth/dev/login` - Dev mode login (development only)
- `GET /auth/dev/users` - List dev users (development only)

**User Schema** (relevant fields):
```typescript
type User = {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string | null;
  role: "admin" | "manager" | "employee";
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}
```

### 2.3 Tenant API

**Available Tenant Endpoints**:
- `GET /tenants` - List tenants
- `GET /tenants/{id}` - Get tenant details
- `POST /tenants` - Create tenant
- `PATCH /tenants/{id}` - Update tenant

This supports the tenant/company selector requirement.

## 3. Missing Dependencies

### 3.1 Required for Layout Implementation

| Package | Purpose | Status |
|---------|---------|--------|
| `lucide-react` | Icons (specified in components.json) | NOT INSTALLED |

### 3.2 shadcn/ui Components Needed

The following components should be installed via `npx shadcn@latest add`:

| Component | Purpose |
|-----------|---------|
| `sheet` | Mobile sidebar drawer |
| `dropdown-menu` | User menu, notifications menu |
| `avatar` | User avatar display |
| `separator` | Visual dividers |
| `scroll-area` | Scrollable sidebar content |
| `tooltip` | Icon-only sidebar tooltips |
| `skeleton` | Loading states |
| `breadcrumb` | Breadcrumb navigation |
| `badge` | Notification count badges |
| `command` | Search command palette (optional) |
| `dialog` | Modals for various actions |

## 4. Recommended Implementation Approach

### 4.1 Component Organization

```
src/components/layout/
├── app-layout.tsx          # Main layout wrapper (exported for app router)
├── header.tsx              # Fixed header with user menu, notifications, search
├── sidebar/
│   ├── sidebar.tsx         # Desktop sidebar container
│   ├── sidebar-nav.tsx     # Navigation items list
│   ├── sidebar-item.tsx    # Individual nav item
│   └── sidebar-context.tsx # Collapsed/expanded state
├── mobile-nav.tsx          # Bottom tab bar for mobile
├── breadcrumbs.tsx         # Breadcrumb component
├── tenant-selector.tsx     # Company/tenant dropdown
├── user-menu.tsx           # User dropdown with profile/logout
├── notifications.tsx       # Notifications dropdown
├── skip-link.tsx           # Skip-to-content accessibility link
└── loading-skeleton.tsx    # Layout loading state
```

### 4.2 State Management

For sidebar state (collapsed/expanded), consider:

1. **React Context** - Simple, works well for single-page state
2. **URL-based** - Store in search params for persistence (not ideal for layout)
3. **localStorage** - Persist user preference across sessions

**Recommendation**: Use React Context + localStorage for persistence:

```tsx
// src/components/layout/sidebar/sidebar-context.tsx
interface SidebarContextValue {
  isCollapsed: boolean;
  toggle: () => void;
  collapse: () => void;
  expand: () => void;
}
```

### 4.3 Responsive Design Pattern

```
┌─────────────────────────────────────────────────────────────────┐
│ Desktop (lg+): 1024px+                                          │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────────────────────────────────────────┐  │
│ │ Sidebar  │ │ Header (fixed, 64px)                         │  │
│ │ 240px    │ ├──────────────────────────────────────────────┤  │
│ │ or 64px  │ │ Content (max-w-screen-xl mx-auto)           │  │
│ │ collapsed│ │                                              │  │
│ └──────────┘ └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Mobile (<1024px)                                                │
├─────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────┐   │
│ │ Header (fixed, 64px) + hamburger menu                    │   │
│ ├──────────────────────────────────────────────────────────┤   │
│ │ Content (full width with padding)                        │   │
│ │                                                          │   │
│ ├──────────────────────────────────────────────────────────┤   │
│ │ Bottom Tab Bar (fixed, 5 primary actions)                │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 Navigation Structure

Based on ticket requirements:

```typescript
type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  roles?: ("admin" | "manager" | "employee")[];
  badge?: number; // For notifications/counts
};

const navigation: NavSection[] = [
  {
    title: "Employee",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Time Tracking", href: "/time-tracking", icon: Clock },
      { title: "My Timesheet", href: "/timesheet", icon: Calendar },
      { title: "Absences", href: "/absences", icon: CalendarOff },
      { title: "Calendar", href: "/calendar", icon: CalendarDays },
    ],
  },
  {
    title: "Manager",
    roles: ["admin", "manager"],
    items: [
      { title: "Team Overview", href: "/team", icon: Users },
      { title: "Approvals", href: "/approvals", icon: CheckSquare },
      { title: "Reports", href: "/reports", icon: BarChart },
    ],
  },
  {
    title: "Admin",
    roles: ["admin"],
    items: [
      { title: "Employees", href: "/admin/employees", icon: UserCog },
      { title: "Organization", href: "/admin/organization", icon: Building2 },
      { title: "Time Plans", href: "/admin/time-plans", icon: ClipboardList },
      { title: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];
```

### 4.5 Auth Context Needed

A new auth context provider is needed for:
- Current user state
- User role for navigation filtering
- Auth status (authenticated/loading/unauthenticated)

```tsx
// src/providers/auth-provider.tsx
interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}
```

## 5. Implementation Gaps

### 5.1 Missing Infrastructure

1. **Auth Context/Provider**: Need to create for managing user state
2. **Tenant Context/Provider**: Need for tenant selector state
3. **Protected Route Wrapper**: For auth-gated pages
4. **Role-Based Access Hook**: `useHasRole()` or similar

### 5.2 Missing shadcn Components

Need to install via CLI before implementation:
```bash
cd apps/web
npx shadcn@latest add sheet dropdown-menu avatar separator scroll-area tooltip skeleton breadcrumb badge
pnpm add lucide-react
```

### 5.3 Missing App Router Structure

The `app/` directory needs route groups for layout organization:
```
app/
├── (auth)/              # Public auth pages (no sidebar)
│   ├── login/page.tsx
│   └── layout.tsx
├── (dashboard)/         # Protected pages with full layout
│   ├── dashboard/page.tsx
│   ├── time-tracking/page.tsx
│   ├── ...
│   └── layout.tsx       # Uses AppLayout component
└── layout.tsx           # Root layout (providers only)
```

## 6. CSS/Styling Considerations

### 6.1 Tailwind v4 Theme Variables

The `globals.css` already has theme variables defined using `@theme`:
- `--color-background`, `--color-foreground`
- `--color-primary`, `--color-secondary`, etc.
- `--radius-lg`, `--radius-md`, `--radius-sm`

These map to Tailwind classes like `bg-background`, `text-foreground`, etc.

### 6.2 Sidebar Dimensions (from ticket)

```css
/* Desktop */
--sidebar-width: 240px;
--sidebar-collapsed-width: 64px;
--header-height: 64px;
--content-max-width: 1280px;

/* Mobile */
--bottom-nav-height: 64px;
```

### 6.3 Z-Index Layering

```css
--z-sidebar: 40;
--z-header: 50;
--z-mobile-nav: 50;
--z-overlay: 100;
--z-modal: 200;
```

## 7. Accessibility Requirements

From ticket:
- Skip-to-content link (first focusable element)
- Keyboard navigation support (Tab, Arrow keys in menus)
- ARIA labels for icon-only buttons
- Focus management when sidebar opens/closes
- Reduced motion support for animations

## 8. Recommended Implementation Order

1. **Install dependencies** (lucide-react, shadcn components)
2. **Create auth context/provider** (needed for user menu and role-based nav)
3. **Create sidebar context** (collapsed state management)
4. **Build sidebar components** (desktop sidebar)
5. **Build header component** (with user menu, notifications)
6. **Build mobile navigation** (bottom tab bar)
7. **Create AppLayout wrapper** (combines all pieces)
8. **Add breadcrumbs component**
9. **Add tenant selector** (if multi-tenant switching needed)
10. **Add loading skeleton**
11. **Set up route groups** (auth vs dashboard layouts)
12. **Test responsive behavior**
13. **Test keyboard navigation**

## 9. Risks and Considerations

1. **Auth Flow**: Need to decide on auth flow before implementing protected routes
2. **SSR vs Client**: Layout components need to be client components for interactivity
3. **Performance**: Sidebar state changes shouldn't cause unnecessary re-renders
4. **Mobile First**: Consider mobile-first implementation for responsive design
5. **Dark Mode**: Theme already supports dark mode via `prefers-color-scheme`

## 10. Related Files

Key files to reference during implementation:

- `/home/tolga/projects/terp/apps/web/src/app/layout.tsx` - Root layout to modify
- `/home/tolga/projects/terp/apps/web/src/app/globals.css` - Theme variables
- `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts` - Auth/tenant storage
- `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` - User type definition
- `/home/tolga/projects/terp/apps/web/src/providers/query-provider.tsx` - Provider pattern reference
- `/home/tolga/projects/terp/apps/web/src/components/ui/button.tsx` - shadcn component example
- `/home/tolga/projects/terp/apps/web/components.json` - shadcn configuration
