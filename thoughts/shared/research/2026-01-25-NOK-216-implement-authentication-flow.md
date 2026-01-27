# Research: NOK-216 - Implement Authentication Flow

**Date**: 2026-01-25
**Ticket**: NOK-216 - Implement authentication flow (login, logout, session management)

## Executive Summary

This document captures the existing codebase structure relevant to implementing authentication in the Next.js frontend. The backend auth system is fully implemented with JWT-based authentication, httpOnly cookie support, and a dev login mode for development testing.

---

## 1. Next.js Frontend Structure

### 1.1 Project Overview

**Location**: `/home/tolga/projects/terp/apps/web/`

**Key Technologies**:
- Next.js 16 with App Router
- React 19
- TypeScript 5.7
- Tailwind CSS 4 (CSS-first configuration)
- React Query (TanStack Query v5)
- openapi-fetch for type-safe API calls
- shadcn/ui (new-york style)

**Package Manager**: pnpm

### 1.2 Directory Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── layout.tsx        # Root layout with QueryProvider
│   │   ├── page.tsx          # Home page (placeholder)
│   │   └── globals.css       # Tailwind CSS theme configuration
│   ├── components/
│   │   ├── ui/
│   │   │   └── button.tsx    # shadcn Button component
│   │   ├── layout/           # Empty (.gitkeep)
│   │   └── forms/            # Empty (.gitkeep)
│   ├── hooks/
│   │   ├── index.ts          # Exports useApiQuery, useApiMutation
│   │   ├── use-api-query.ts  # Type-safe GET hook
│   │   ├── use-api-mutation.ts  # Type-safe POST/PUT/PATCH/DELETE hook
│   │   └── api/
│   │       ├── index.ts      # Domain hook exports
│   │       ├── use-employees.ts
│   │       └── use-bookings.ts
│   ├── lib/
│   │   ├── utils.ts          # cn() utility for class merging
│   │   └── api/
│   │       ├── index.ts      # API exports
│   │       ├── client.ts     # openapi-fetch client with middleware
│   │       ├── types.ts      # Generated OpenAPI types (282KB)
│   │       └── errors.ts     # Error handling utilities
│   ├── providers/
│   │   └── query-provider.tsx  # React Query setup
│   ├── config/
│   │   └── env.ts            # Environment configuration
│   └── types/
│       └── index.ts          # Custom types (currently empty)
├── components.json           # shadcn/ui configuration
├── package.json
├── tsconfig.json
├── next.config.ts
├── .env.example
└── .env.local
```

### 1.3 Environment Configuration

**File**: `/home/tolga/projects/terp/apps/web/src/config/env.ts`

```typescript
export const serverEnv = {
  apiUrl: process.env.API_URL ?? 'http://localhost:8080/api/v1',
} as const

export const clientEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Terp',
} as const
```

**File**: `/home/tolga/projects/terp/apps/web/.env.example`

```
API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_APP_NAME=Terp
```

---

## 2. Existing API Client Setup

### 2.1 Client Configuration

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

The API client uses `openapi-fetch` with two middleware:

1. **Auth Middleware**: Adds `Authorization: Bearer <token>` header from localStorage
2. **Tenant Middleware**: Adds `X-Tenant-ID` header from localStorage

**Token Storage Implementation**:
```typescript
export interface AuthTokenStorage {
  getToken: () => string | null
  setToken: (token: string) => void
  clearToken: () => void
}

// Uses localStorage with key 'auth_token'
export const authStorage: AuthTokenStorage = {
  getToken: tokenStorage.get,
  setToken: tokenStorage.set,
  clearToken: tokenStorage.clear,
}
```

**Note**: Current implementation stores token in localStorage. The backend also sets httpOnly cookies.

### 2.2 Error Handling

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/errors.ts`

Provides utilities:
- `parseApiError(error)` - Converts API errors to structured `ApiError` type
- `isAuthError(error)` - Checks if error is 401
- `isForbiddenError(error)` - Checks if error is 403
- `getErrorMessage(status)` - Returns user-friendly error messages

**ApiError Interface**:
```typescript
export interface ApiError {
  status: number
  title: string
  message: string
  fieldErrors?: Record<string, string>
  raw: ProblemDetails | unknown
}
```

### 2.3 Query/Mutation Hooks

**useApiQuery**: Type-safe wrapper for GET requests
- Supports path parameters and query parameters
- Automatic query key generation
- Returns React Query result

**useApiMutation**: Type-safe wrapper for POST/PUT/PATCH/DELETE
- Supports automatic query invalidation via `invalidateKeys` option
- Returns React Query mutation result

**Usage Pattern** (from existing hooks):
```typescript
// Query
const { data, isLoading } = useApiQuery('/employees', {
  params: { limit: 20 },
  enabled: true,
})

// Mutation
const createEmployee = useApiMutation('/employees', 'post', {
  invalidateKeys: [['/employees']],
})
createEmployee.mutate({ body: { ... } })
```

---

## 3. Existing Auth-Related Code

### 3.1 Frontend Auth Storage

The client exports `authStorage` and `tenantIdStorage` interfaces:
- Tokens stored in localStorage with key `auth_token`
- Tenant ID stored with key `tenant_id`
- Server-side safety: returns null when `window` is undefined

### 3.2 Auth Middleware

```typescript
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = authStorage.getToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
}
```

### 3.3 No Auth Context/Provider Exists Yet

Currently, there is no:
- AuthContext or AuthProvider
- Protected route wrapper
- Token refresh logic
- Session persistence logic

---

## 4. shadcn/ui Components Available

### 4.1 Configuration

**File**: `/home/tolga/projects/terp/apps/web/components.json`

```json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
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

### 4.2 Installed Components

Only `button.tsx` is currently installed:

**File**: `/home/tolga/projects/terp/apps/web/src/components/ui/button.tsx`

Variants available:
- `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`

Sizes available:
- `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`

### 4.3 Components to Add for Auth

The following shadcn components will be needed (not installed):
- `input` - For email/password fields
- `label` - For form labels
- `card` - For login form container
- `alert` - For error messages
- `spinner` or loading indicator

---

## 5. Backend Auth Endpoints (Detailed Analysis)

### 5.1 Endpoint Overview

| Endpoint | Method | Auth | Status | Description |
|----------|--------|------|--------|-------------|
| `/auth/login` | POST | No | **NOT IMPLEMENTED** | Returns 501 in prod, redirect message in dev |
| `/auth/refresh` | POST | Yes | Implemented | Refreshes JWT token |
| `/auth/me` | GET | Yes | Implemented | Get current user profile |
| `/auth/logout` | POST | Yes | Implemented | Clears cookie, returns 204 |
| `/auth/dev/login` | GET | No | Dev only | Quick login with role selection |
| `/auth/dev/users` | GET | No | Dev only | List available dev users |

### 5.2 Dev Login - Primary Auth Method for Development

**Endpoint**: `GET /api/v1/auth/dev/login?role=admin|user`

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/auth.go:35-82`

**Request**:
```
GET /api/v1/auth/dev/login?role=admin
```

**Response (200 OK)**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "ID": "00000000-0000-0000-0000-000000000001",
    "Email": "admin@dev.local",
    "DisplayName": "Dev Admin",
    "Role": "admin"
  }
}
```

**Cookie Set**:
```
Set-Cookie: token=<jwt>; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400
```

**Error Responses**:
- `403 Forbidden`: Dev mode not enabled (`ENV != development`)
- `400 Bad Request`: Invalid role parameter (must be "admin" or "user")
- `500 Internal Server Error`: Database sync or token generation failed

### 5.3 Dev Users List

**Endpoint**: `GET /api/v1/auth/dev/users`

**Response (200 OK)**:
```json
{
  "dev_mode": true,
  "users": {
    "admin": {
      "ID": "00000000-0000-0000-0000-000000000001",
      "Email": "admin@dev.local",
      "DisplayName": "Dev Admin",
      "Role": "admin"
    },
    "user": {
      "ID": "00000000-0000-0000-0000-000000000002",
      "Email": "user@dev.local",
      "DisplayName": "Dev User",
      "Role": "user"
    }
  }
}
```

### 5.4 Login Endpoint (NOT IMPLEMENTED)

**Endpoint**: `POST /api/v1/auth/login`

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/auth.go:100-121`

**Current Behavior**:
- In dev mode: Returns redirect message to use `/auth/dev/login`
- In production: Returns 501 Not Implemented

**Response (in dev mode)**:
```json
{
  "message": "You are in dev mode, please use /auth/dev/login instead."
}
```

**Response (in production)**:
```json
{
  "error": "Not Implemented",
  "message": "Login not yet implemented. Use dev mode for testing.",
  "status": 501
}
```

### 5.5 Token Refresh

**Endpoint**: `POST /api/v1/auth/refresh`

**Requires**: Valid JWT (in header or cookie)

**Response (200 OK)**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Also sets new cookie** with refreshed token.

### 5.6 Get Current User

**Endpoint**: `GET /api/v1/auth/me`

**Requires**: Valid JWT

**Response (200 OK)**:
```json
{
  "user": {
    "ID": "00000000-0000-0000-0000-000000000001",
    "Email": "admin@dev.local",
    "DisplayName": "Dev Admin",
    "Role": "admin"
  }
}
```

### 5.7 Logout

**Endpoint**: `POST /api/v1/auth/logout`

**Requires**: Valid JWT

**Response**: `204 No Content` (empty body)

**Cookie Cleared**:
```
Set-Cookie: token=; Path=/; MaxAge=-1; HttpOnly
```

### 5.8 Auth Middleware - Token Extraction

**File**: `/home/tolga/projects/terp/apps/api/internal/middleware/auth.go:14-49`

**Token extraction priority**:
1. **Authorization header** (checked first): `Authorization: Bearer <token>`
2. **Cookie** (fallback): Cookie named `token`

**Error Response (401)**:
```json
{
  "error": "unauthorized",
  "message": "missing authentication token"
}
```

### 5.9 JWT Configuration

**File**: `/home/tolga/projects/terp/apps/api/internal/auth/jwt.go`

- **Algorithm**: HMAC-SHA256
- **Default Expiry**: 24 hours
- **Issuer**: "terp-api"

**JWT Claims Structure**:
```go
type Claims struct {
    jwt.RegisteredClaims
    UserID      uuid.UUID `json:"user_id"`
    Email       string    `json:"email"`
    DisplayName string    `json:"display_name"`
    Role        string    `json:"role"`
}
```

### 5.10 Cookie Configuration

**File**: `/home/tolga/projects/terp/apps/api/internal/handler/auth.go:68-76`

| Property | Dev Mode | Production |
|----------|----------|------------|
| Name | `token` | `token` |
| Path | `/` | `/` |
| HttpOnly | `true` | `true` |
| Secure | `false` | `true` |
| SameSite | `Lax` | `Lax` |
| MaxAge | 86400 (24h) | JWT expiry |

### 5.11 Route Protection Hierarchy

```
/api/v1
├── /auth (mostly public)
│   ├── POST /login (public, NOT IMPLEMENTED)
│   ├── POST /refresh (public endpoint, but requires valid token in request)
│   ├── GET /dev/login (dev only, public)
│   ├── GET /dev/users (dev only, public)
│   ├── GET /me (requires AuthMiddleware)
│   └── POST /logout (requires AuthMiddleware)
│
└── Protected Routes (all require AuthMiddleware)
    ├── /users
    ├── /tenants
    └── Tenant-scoped (require AuthMiddleware + TenantMiddleware)
        ├── /accounts
        ├── /holidays
        ├── /employees
        ├── /bookings
        └── ... (all other resources)
```

---

## 6. Dev Login System

### 6.1 How It Works

**Endpoint**: `GET /api/v1/auth/dev/login?role=admin|user`

**Only available when**: `ENV=development` (checks `authConfig.IsDevMode()`)

**Returns**:
```json
{
  "token": "jwt-token-string",
  "user": {
    "id": "00000000-0000-0000-0000-000000000001",
    "email": "admin@dev.local",
    "display_name": "Dev Admin",
    "role": "admin"
  }
}
```

Also sets httpOnly cookie with the token.

### 6.2 Dev User Configuration

**File**: `/home/tolga/projects/terp/apps/api/internal/auth/devusers.go`

```go
var DevUsers = map[string]DevUser{
    "admin": {
        ID:          uuid.MustParse("00000000-0000-0000-0000-000000000001"),
        Email:       "admin@dev.local",
        DisplayName: "Dev Admin",
        Role:        "admin",
    },
    "user": {
        ID:          uuid.MustParse("00000000-0000-0000-0000-000000000002"),
        Email:       "user@dev.local",
        DisplayName: "Dev User",
        Role:        "user",
    },
}
```

### 6.3 Dev Users Endpoint

**Endpoint**: `GET /api/v1/auth/dev/users`

Lists available dev users for testing.

---

## 7. Generated TypeScript Types

### 7.1 Auth Operations

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts`

**authLogin** operation:
```typescript
authLogin: {
    requestBody: {
        content: {
            "application/json": {
                email: string;
                password: string;
            };
        };
    };
    responses: {
        200: {
            content: {
                "application/json": {
                    token?: string;
                    user?: components["schemas"]["User"];
                };
            };
        };
        401: components["responses"]["Unauthorized"];
        500: components["responses"]["InternalError"];
    };
};
```

**devLogin** operation:
```typescript
devLogin: {
    parameters: {
        query?: {
            role?: "admin" | "user";
        };
    };
    responses: {
        200: {
            content: {
                "application/json": {
                    token?: string;
                    user?: components["schemas"]["User"];
                };
            };
        };
        400: components["responses"]["BadRequest"];
        403: components["responses"]["Forbidden"];
    };
};
```

**getCurrentUser** operation:
```typescript
getCurrentUser: {
    responses: {
        200: {
            content: {
                "application/json": components["schemas"]["User"];
            };
        };
        401: components["responses"]["Unauthorized"];
    };
};
```

**authLogout** operation:
```typescript
authLogout: {
    responses: {
        204: {
            content?: never;
        };
        401: components["responses"]["Unauthorized"];
    };
};
```

**authRefresh** operation:
```typescript
authRefresh: {
    responses: {
        200: {
            content: {
                "application/json": {
                    token?: string;
                };
            };
        };
        401: components["responses"]["Unauthorized"];
    };
};
```

### 7.2 User Schema

```typescript
User: {
    id: string;                    // Format: uuid
    email: string;                 // Format: email
    display_name: string;
    avatar_url?: string | null;    // Format: uri
    role: "user" | "admin";
    created_at: string;            // Format: date-time
    updated_at?: string;           // Format: date-time
};
```

---

## 8. Current App Layout

**File**: `/home/tolga/projects/terp/apps/web/src/app/layout.tsx`

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
```

**Note**: Auth provider needs to be added here.

---

## 9. Styling Configuration

### 9.1 Tailwind CSS 4

**File**: `/home/tolga/projects/terp/apps/web/src/app/globals.css`

Uses CSS-first approach with `@theme` directive:
- HSL color variables for shadcn compatibility
- Light/dark mode support via `prefers-color-scheme`
- Custom border-radius tokens
- System font stack

### 9.2 Available CSS Variables

```css
--color-background
--color-foreground
--color-primary / --color-primary-foreground
--color-secondary / --color-secondary-foreground
--color-muted / --color-muted-foreground
--color-accent / --color-accent-foreground
--color-destructive / --color-destructive-foreground
--color-border
--color-input
--color-ring
--radius-lg / --radius-md / --radius-sm
```

---

## 10. React Query Setup

**File**: `/home/tolga/projects/terp/apps/web/src/providers/query-provider.tsx`

Default configuration:
- Stale time: 5 minutes
- GC time: 30 minutes
- Refetch on window focus: disabled
- Retry: 1 attempt (queries), none (mutations)
- Dev tools included in development mode

---

## Summary of What Exists vs What Needs Implementation

| Component | Exists | Notes |
|-----------|--------|-------|
| Backend auth endpoints | Partial | **POST /auth/login is NOT IMPLEMENTED** |
| Dev login endpoint | Yes | Primary auth method for development |
| JWT token generation | Yes | HS256, 24h expiry |
| httpOnly cookies | Yes | Set by backend on login/refresh |
| Token refresh endpoint | Yes | POST /auth/refresh |
| Get current user | Yes | GET /auth/me |
| Logout | Yes | POST /auth/logout clears cookie |
| API client | Yes | openapi-fetch with middleware |
| Auth token storage | Yes | localStorage-based |
| Generated TypeScript types | Yes | All auth operations typed |
| Auth context/provider | No | Needs implementation |
| Protected route wrapper | No | Needs implementation |
| Token refresh logic | No | Needs implementation |
| Login page/form | No | **Use dev login for now** |
| Error handling UI | No | Needs implementation |
| shadcn input/card/etc | No | Need to add components |

### Critical Note for Implementation

Since `POST /auth/login` is not implemented on the backend, the frontend should:
1. **For development**: Use the dev login shortcut (`GET /auth/dev/login?role=admin|user`)
2. **For production**: The login form will need to show "Coming soon" or wait for backend implementation

The dev login flow is:
1. Call `GET /api/v1/auth/dev/login?role=admin`
2. Backend returns `{ token, user }` and sets httpOnly cookie
3. Store token in localStorage for Authorization header
4. Cookie is automatically sent with subsequent requests as fallback
