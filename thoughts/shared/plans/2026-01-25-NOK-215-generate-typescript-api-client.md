# NOK-215 Generate TypeScript API Client Implementation Plan

## Overview

Generate a type-safe TypeScript API client from the backend OpenAPI specification to ensure frontend-backend type consistency. This includes setting up type generation, configuring React Query for data fetching/caching, and creating custom hooks for common API operations.

## Current State Analysis

### What Exists

1. **Next.js 16 project** at `apps/web/` with TypeScript 5.7+, Tailwind v4, and Shadcn/ui
2. **Environment configuration** at `src/config/env.ts` with API URL settings
3. **Types placeholder** at `src/types/index.ts` prepared for generated API types
4. **OpenAPI spec** (Swagger 2.0) at `api/openapi.bundled.yaml` with 91 schema definitions
5. **Existing Makefile** with `swagger-bundle` command that generates `api/openapi.bundled.yaml`
6. **Path aliases** configured (`@/*` maps to `./src/*`)

### What Does Not Exist

1. No `openapi-typescript` or `openapi-fetch` packages
2. No React Query / TanStack Query
3. No API client wrapper or fetch utilities
4. No generated TypeScript types from OpenAPI
5. No custom hooks for API operations
6. No error handling utilities
7. No request/response interceptors

### Key Files

- **Package.json**: `/home/tolga/projects/terp/apps/web/package.json`
- **Environment config**: `/home/tolga/projects/terp/apps/web/src/config/env.ts`
- **OpenAPI spec**: `/home/tolga/projects/terp/api/openapi.bundled.yaml`
- **Types directory**: `/home/tolga/projects/terp/apps/web/src/types/`
- **Lib directory**: `/home/tolga/projects/terp/apps/web/src/lib/`
- **Hooks directory**: `/home/tolga/projects/terp/apps/web/src/hooks/`

## Desired End State

After implementation:

1. Running `pnpm run generate:api` produces TypeScript types from the OpenAPI spec
2. API calls are fully type-safe with autocomplete for paths, parameters, and responses
3. React Query is configured with sensible defaults for caching and refetching
4. Error handling provides user-friendly messages using RFC 7807 Problem Details
5. All requests automatically include `Authorization` and `X-Tenant-ID` headers
6. Custom hooks exist for common CRUD operations

### Directory Structure After Implementation

```
apps/web/src/
├── lib/
│   ├── api/
│   │   ├── client.ts         # Typed API client with interceptors
│   │   ├── types.ts          # Generated types (DO NOT EDIT)
│   │   ├── errors.ts         # Error handling utilities
│   │   └── index.ts          # Re-exports
│   └── utils.ts              # Existing utility
├── hooks/
│   ├── use-query.ts          # Custom query hook wrapper
│   ├── use-mutation.ts       # Custom mutation hook wrapper
│   └── api/                   # Domain-specific hooks
│       ├── use-employees.ts
│       ├── use-bookings.ts
│       └── index.ts
├── providers/
│   └── query-provider.tsx    # React Query provider
└── types/
    └── index.ts              # Custom types + re-exports
```

## What We're NOT Doing

1. **Not implementing all API hooks** - Only create example hooks for employees and bookings as templates
2. **Not adding authentication flow** - Auth will be a separate ticket; we just set up the header injection
3. **Not adding tenant selection UI** - Just the header injection mechanism
4. **Not converting OpenAPI 2.0 to 3.0** - `openapi-typescript` supports Swagger 2.0
5. **Not adding SSR data prefetching** - Will be added later when needed for specific pages
6. **Not adding optimistic updates** - Will be implemented per-feature as needed

## Implementation Approach

We'll use:
- **openapi-typescript v7** for type generation from Swagger 2.0 spec
- **openapi-fetch v0.13** for type-safe fetch client
- **@tanstack/react-query v5** for data fetching, caching, and state management

The approach:
1. Install dependencies
2. Set up type generation script
3. Create typed API client with auth/tenant interceptors
4. Configure React Query provider
5. Create reusable hook patterns
6. Add error handling utilities

---

## Phase 1: Install Dependencies

### Overview

Install the required npm packages for type generation, API client, and data fetching.

### Changes Required

#### 1. Install Production Dependencies

**Command** (run from `apps/web/`):
```bash
pnpm add openapi-fetch @tanstack/react-query
```

#### 2. Install Development Dependencies

**Command** (run from `apps/web/`):
```bash
pnpm add -D openapi-typescript
```

#### 3. Verify package.json

**File**: `/home/tolga/projects/terp/apps/web/package.json`

After installation, dependencies should include:
```json
{
  "dependencies": {
    "openapi-fetch": "^0.13.0",
    "@tanstack/react-query": "^5.64.0"
  },
  "devDependencies": {
    "openapi-typescript": "^7.5.0"
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] Packages install without errors: `cd apps/web && pnpm install`
- [ ] No peer dependency warnings for installed packages
- [ ] `pnpm ls openapi-typescript openapi-fetch @tanstack/react-query` shows all packages installed

#### Manual Verification:
- [ ] Verify `package.json` contains the new dependencies

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2.

---

## Phase 2: Set Up Type Generation

### Overview

Create an npm script that generates TypeScript types from the OpenAPI specification.

### Changes Required

#### 1. Add Generate Script to package.json

**File**: `/home/tolga/projects/terp/apps/web/package.json`

Add to `scripts` section:
```json
{
  "scripts": {
    "generate:api": "openapi-typescript ../../api/openapi.bundled.yaml -o src/lib/api/types.ts"
  }
}
```

#### 2. Create API Directory Structure

**Command**:
```bash
mkdir -p apps/web/src/lib/api
```

#### 3. Generate Initial Types

**Command** (run from `apps/web/`):
```bash
pnpm run generate:api
```

This will create `/home/tolga/projects/terp/apps/web/src/lib/api/types.ts` with all generated types.

#### 4. Add Generate Command to Root Makefile

**File**: `/home/tolga/projects/terp/Makefile`

Add after the `generate` target:
```makefile
## generate-web: Generate TypeScript API types for frontend
generate-web: swagger-bundle ## Generate TypeScript types for frontend from OpenAPI
	@echo "Generating TypeScript API types..."
	cd apps/web && pnpm run generate:api
	@echo "Done! Types generated in apps/web/src/lib/api/types.ts"

## generate-all: Generate all code from OpenAPI spec
generate-all: generate generate-web ## Generate Go models and TypeScript types
```

### Success Criteria

#### Automated Verification:
- [ ] Type generation runs successfully: `cd apps/web && pnpm run generate:api`
- [ ] Generated file exists: `test -f apps/web/src/lib/api/types.ts`
- [ ] TypeScript compiles without errors: `cd apps/web && pnpm run typecheck`
- [ ] Makefile command works: `make generate-web`

#### Manual Verification:
- [ ] Open `apps/web/src/lib/api/types.ts` and verify it contains type definitions for schemas like `Employee`, `Booking`, `DailyValue`, etc.
- [ ] Verify the `paths` type contains all API endpoints

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 3.

---

## Phase 3: Create Typed API Client

### Overview

Create a typed API client wrapper using `openapi-fetch` with interceptors for authentication and tenant headers.

### Changes Required

#### 1. Create API Client

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/client.ts`

```typescript
import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './types'
import { clientEnv } from '@/config/env'

/**
 * Auth token storage interface.
 * Allows different storage implementations (localStorage, cookies, etc.)
 */
export interface AuthTokenStorage {
  getToken: () => string | null
  setToken: (token: string) => void
  clearToken: () => void
}

/**
 * Tenant ID storage interface.
 * Allows different storage implementations.
 */
export interface TenantStorage {
  getTenantId: () => string | null
  setTenantId: (tenantId: string) => void
  clearTenantId: () => void
}

// Default implementations using localStorage (client-side only)
const createLocalStorage = (key: string) => ({
  get: (): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(key)
  },
  set: (value: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(key, value)
    }
  },
  clear: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(key)
    }
  },
})

const tokenStorage = createLocalStorage('auth_token')
const tenantStorage = createLocalStorage('tenant_id')

export const authStorage: AuthTokenStorage = {
  getToken: tokenStorage.get,
  setToken: tokenStorage.set,
  clearToken: tokenStorage.clear,
}

export const tenantIdStorage: TenantStorage = {
  getTenantId: tenantStorage.get,
  setTenantId: tenantStorage.set,
  clearTenantId: tenantStorage.clear,
}

/**
 * Auth middleware that adds Authorization header to all requests.
 */
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = authStorage.getToken()
    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`)
    }
    return request
  },
}

/**
 * Tenant middleware that adds X-Tenant-ID header to all requests.
 */
const tenantMiddleware: Middleware = {
  async onRequest({ request }) {
    const tenantId = tenantIdStorage.getTenantId()
    if (tenantId) {
      request.headers.set('X-Tenant-ID', tenantId)
    }
    return request
  },
}

/**
 * Create the typed API client with all middleware.
 */
function createApiClient() {
  const client = createClient<paths>({
    baseUrl: clientEnv.apiUrl,
  })

  // Register middleware
  client.use(authMiddleware)
  client.use(tenantMiddleware)

  return client
}

/**
 * The main API client instance.
 * Use this for all API calls.
 *
 * @example
 * ```ts
 * const { data, error } = await api.GET('/employees')
 * if (error) {
 *   console.error(error)
 *   return
 * }
 * console.log(data.items)
 * ```
 */
export const api = createApiClient()

/**
 * Type helper to extract response data type from an endpoint.
 */
export type ApiResponse<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = paths[Path][Method] extends { responses: { 200: { schema: infer R } } }
  ? R
  : never

/**
 * Type helper to extract request body type from an endpoint.
 */
export type ApiRequestBody<
  Path extends keyof paths,
  Method extends keyof paths[Path],
> = paths[Path][Method] extends { parameters: { body: infer B } } ? B : never
```

#### 2. Create API Index File

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/index.ts`

```typescript
// API Client
export { api, authStorage, tenantIdStorage } from './client'
export type { AuthTokenStorage, TenantStorage, ApiResponse, ApiRequestBody } from './client'

// Generated Types
export type { paths, components, operations } from './types'

// Error utilities (will be created in Phase 6)
// export * from './errors'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`
- [ ] File exists: `test -f apps/web/src/lib/api/client.ts`
- [ ] File exists: `test -f apps/web/src/lib/api/index.ts`

#### Manual Verification:
- [ ] In VS Code, verify that `api.GET('/employees')` shows autocomplete for all endpoints
- [ ] Verify that response types are correctly inferred

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 4.

---

## Phase 4: Configure React Query Provider

### Overview

Set up the React Query provider with sensible default configurations for the application.

### Changes Required

#### 1. Create Query Provider

**File**: `/home/tolga/projects/terp/apps/web/src/providers/query-provider.tsx`

```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, type ReactNode } from 'react'

interface QueryProviderProps {
  children: ReactNode
}

/**
 * Creates a QueryClient with sensible defaults.
 * - 5 minute stale time for most queries
 * - 30 minute garbage collection time
 * - Disabled refetch on window focus by default (can be overridden per-query)
 * - 1 retry on failure
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data is considered fresh for 5 minutes
        staleTime: 5 * 60 * 1000,
        // Cached data is kept for 30 minutes
        gcTime: 30 * 60 * 1000,
        // Don't refetch on window focus by default
        refetchOnWindowFocus: false,
        // Retry failed requests once
        retry: 1,
        // Don't retry on 4xx errors (except 408, 429)
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      mutations: {
        // Don't retry mutations by default
        retry: false,
      },
    },
  })
}

// Browser: Create a single client instance
let browserQueryClient: QueryClient | undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: Always create a new client
    return makeQueryClient()
  }
  // Browser: Reuse the same client
  if (!browserQueryClient) {
    browserQueryClient = makeQueryClient()
  }
  return browserQueryClient
}

/**
 * React Query provider component.
 * Wrap your app with this to enable data fetching hooks.
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * <QueryProvider>
 *   {children}
 * </QueryProvider>
 * ```
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  )
}
```

#### 2. Install React Query DevTools

**Command** (run from `apps/web/`):
```bash
pnpm add @tanstack/react-query-devtools
```

#### 3. Update Root Layout

**File**: `/home/tolga/projects/terp/apps/web/src/app/layout.tsx`

Update to wrap children with QueryProvider:

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { QueryProvider } from '@/providers/query-provider'

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Terp - Time & Resource Planning',
  description: 'Modern time tracking and resource planning solution',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  )
}
```

### Success Criteria

#### Automated Verification:
- [ ] DevTools package installs: `cd apps/web && pnpm add @tanstack/react-query-devtools`
- [ ] TypeScript compiles without errors: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`
- [ ] Build succeeds: `cd apps/web && pnpm run build`

#### Manual Verification:
- [ ] Run `pnpm dev` and verify the app loads without errors
- [ ] In development mode, verify React Query DevTools button appears in bottom-left corner

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 5.

---

## Phase 5: Create Custom Hooks

### Overview

Create reusable hook wrappers and domain-specific hooks for common API operations.

### Changes Required

#### 1. Create Query Hook Wrapper

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-query.ts`

```typescript
import { useQuery, type UseQueryOptions, type QueryKey } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { paths } from '@/lib/api/types'
import type { ApiError } from '@/lib/api/errors'

/**
 * Type helper for GET endpoint paths
 */
type GetPaths = {
  [P in keyof paths]: paths[P] extends { get: unknown } ? P : never
}[keyof paths]

/**
 * Type helper to extract query parameters from a GET endpoint
 */
type QueryParams<Path extends GetPaths> = paths[Path]['get'] extends {
  parameters: { query?: infer Q }
}
  ? Q
  : undefined

/**
 * Type helper to extract path parameters from a GET endpoint
 */
type PathParams<Path extends GetPaths> = paths[Path]['get'] extends {
  parameters: { path: infer P }
}
  ? P
  : undefined

/**
 * Type helper to extract success response from a GET endpoint
 */
type SuccessResponse<Path extends GetPaths> = paths[Path]['get'] extends {
  responses: { 200: { schema: infer R } }
}
  ? R
  : unknown

/**
 * Options for useApiQuery hook
 */
interface UseApiQueryOptions<Path extends GetPaths>
  extends Omit<
    UseQueryOptions<SuccessResponse<Path>, ApiError, SuccessResponse<Path>, QueryKey>,
    'queryKey' | 'queryFn'
  > {
  params?: QueryParams<Path>
  path?: PathParams<Path>
}

/**
 * Type-safe query hook for GET endpoints.
 *
 * @example
 * ```ts
 * // Simple query
 * const { data, isLoading } = useApiQuery('/employees')
 *
 * // With query parameters
 * const { data } = useApiQuery('/employees', {
 *   params: { limit: 20, cursor: 'abc' }
 * })
 *
 * // With path parameters
 * const { data } = useApiQuery('/employees/{id}', {
 *   path: { id: '123' }
 * })
 * ```
 */
export function useApiQuery<Path extends GetPaths>(
  path: Path,
  options?: UseApiQueryOptions<Path>
) {
  const { params, path: pathParams, ...queryOptions } = options ?? {}

  return useQuery({
    queryKey: [path, params, pathParams],
    queryFn: async () => {
      const { data, error } = await api.GET(path as never, {
        params: {
          query: params,
          path: pathParams,
        },
      } as never)

      if (error) {
        throw error
      }

      return data as SuccessResponse<Path>
    },
    ...queryOptions,
  })
}
```

#### 2. Create Mutation Hook Wrapper

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/use-api-mutation.ts`

```typescript
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { paths } from '@/lib/api/types'
import type { ApiError } from '@/lib/api/errors'

/**
 * Type helper for POST endpoint paths
 */
type PostPaths = {
  [P in keyof paths]: paths[P] extends { post: unknown } ? P : never
}[keyof paths]

/**
 * Type helper for PUT endpoint paths
 */
type PutPaths = {
  [P in keyof paths]: paths[P] extends { put: unknown } ? P : never
}[keyof paths]

/**
 * Type helper for PATCH endpoint paths
 */
type PatchPaths = {
  [P in keyof paths]: paths[P] extends { patch: unknown } ? P : never
}[keyof paths]

/**
 * Type helper for DELETE endpoint paths
 */
type DeletePaths = {
  [P in keyof paths]: paths[P] extends { delete: unknown } ? P : never
}[keyof paths]

/**
 * All mutation paths
 */
type MutationPaths = PostPaths | PutPaths | PatchPaths | DeletePaths

/**
 * HTTP methods for mutations
 */
type MutationMethod = 'post' | 'put' | 'patch' | 'delete'

/**
 * Type helper to extract request body from a mutation endpoint
 */
type RequestBody<Path extends MutationPaths, Method extends MutationMethod> =
  paths[Path] extends { [K in Method]: { parameters: { body: infer B } } }
    ? B
    : undefined

/**
 * Type helper to extract path parameters from a mutation endpoint
 */
type MutationPathParams<
  Path extends MutationPaths,
  Method extends MutationMethod,
> = paths[Path] extends { [K in Method]: { parameters: { path: infer P } } }
  ? P
  : undefined

/**
 * Type helper to extract success response from a mutation endpoint
 */
type MutationResponse<
  Path extends MutationPaths,
  Method extends MutationMethod,
> = paths[Path] extends {
  [K in Method]: { responses: { 200: { schema: infer R } } | { 201: { schema: infer R } } }
}
  ? R
  : void

/**
 * Variables for mutation hook
 */
interface MutationVariables<
  Path extends MutationPaths,
  Method extends MutationMethod,
> {
  body?: RequestBody<Path, Method>
  path?: MutationPathParams<Path, Method>
}

/**
 * Options for useApiMutation hook
 */
interface UseApiMutationOptions<
  Path extends MutationPaths,
  Method extends MutationMethod,
> extends Omit<
    UseMutationOptions<
      MutationResponse<Path, Method>,
      ApiError,
      MutationVariables<Path, Method>
    >,
    'mutationFn'
  > {
  /** Query keys to invalidate on success */
  invalidateKeys?: unknown[][]
}

/**
 * Type-safe mutation hook for POST/PUT/PATCH/DELETE endpoints.
 *
 * @example
 * ```ts
 * // POST mutation
 * const createEmployee = useApiMutation('/employees', 'post', {
 *   invalidateKeys: [['/employees']],
 *   onSuccess: () => toast.success('Employee created'),
 * })
 *
 * // Use it
 * createEmployee.mutate({
 *   body: { name: 'John', email: 'john@example.com' }
 * })
 *
 * // PUT mutation with path params
 * const updateEmployee = useApiMutation('/employees/{id}', 'put')
 * updateEmployee.mutate({
 *   path: { id: '123' },
 *   body: { name: 'Updated Name' }
 * })
 *
 * // DELETE mutation
 * const deleteEmployee = useApiMutation('/employees/{id}', 'delete')
 * deleteEmployee.mutate({ path: { id: '123' } })
 * ```
 */
export function useApiMutation<
  Path extends MutationPaths,
  Method extends MutationMethod,
>(path: Path, method: Method, options?: UseApiMutationOptions<Path, Method>) {
  const queryClient = useQueryClient()
  const { invalidateKeys, ...mutationOptions } = options ?? {}

  return useMutation({
    mutationFn: async (variables: MutationVariables<Path, Method>) => {
      const fetchMethod = method.toUpperCase() as 'POST' | 'PUT' | 'PATCH' | 'DELETE'

      const { data, error } = await (api as Record<string, Function>)[fetchMethod](
        path,
        {
          params: { path: variables.path },
          body: variables.body,
        }
      )

      if (error) {
        throw error
      }

      return data as MutationResponse<Path, Method>
    },
    onSuccess: async (data, variables, context) => {
      // Invalidate specified query keys
      if (invalidateKeys?.length) {
        await Promise.all(
          invalidateKeys.map((key) => queryClient.invalidateQueries({ queryKey: key }))
        )
      }

      // Call custom onSuccess if provided
      mutationOptions.onSuccess?.(data, variables, context)
    },
    ...mutationOptions,
  })
}
```

#### 3. Create Hooks Index

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/index.ts`

```typescript
// API hooks
export { useApiQuery } from './use-api-query'
export { useApiMutation } from './use-api-mutation'
```

#### 4. Create Example Domain Hooks - Employees

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-employees.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'
import type { components } from '@/lib/api/types'

// Type aliases for readability
type Employee = components['schemas']['Employee']
type EmployeeSummary = components['schemas']['EmployeeSummary']
type CreateEmployeeRequest = components['schemas']['CreateEmployeeRequest']
type UpdateEmployeeRequest = components['schemas']['UpdateEmployeeRequest']

interface UseEmployeesOptions {
  limit?: number
  cursor?: string
  search?: string
  departmentId?: string
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of employees.
 *
 * @example
 * ```tsx
 * const { data, isLoading, fetchNextPage } = useEmployees({
 *   limit: 20,
 *   search: 'John',
 * })
 * ```
 */
export function useEmployees(options: UseEmployeesOptions = {}) {
  const { limit = 20, cursor, search, departmentId, enabled = true } = options

  return useApiQuery('/employees', {
    params: {
      limit,
      cursor,
      search,
      department_id: departmentId,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single employee by ID.
 *
 * @example
 * ```tsx
 * const { data: employee, isLoading } = useEmployee(employeeId)
 * ```
 */
export function useEmployee(id: string, enabled = true) {
  return useApiQuery('/employees/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new employee.
 *
 * @example
 * ```tsx
 * const createEmployee = useCreateEmployee()
 * createEmployee.mutate({
 *   body: { first_name: 'John', last_name: 'Doe', ... }
 * })
 * ```
 */
export function useCreateEmployee() {
  return useApiMutation('/employees', 'post', {
    invalidateKeys: [['/employees']],
  })
}

/**
 * Hook to update an existing employee.
 *
 * @example
 * ```tsx
 * const updateEmployee = useUpdateEmployee()
 * updateEmployee.mutate({
 *   path: { id: employeeId },
 *   body: { first_name: 'Updated' }
 * })
 * ```
 */
export function useUpdateEmployee() {
  return useApiMutation('/employees/{id}', 'put', {
    invalidateKeys: [['/employees']],
  })
}

/**
 * Hook to delete an employee.
 *
 * @example
 * ```tsx
 * const deleteEmployee = useDeleteEmployee()
 * deleteEmployee.mutate({ path: { id: employeeId } })
 * ```
 */
export function useDeleteEmployee() {
  return useApiMutation('/employees/{id}', 'delete', {
    invalidateKeys: [['/employees']],
  })
}
```

#### 5. Create Example Domain Hooks - Bookings

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/use-bookings.ts`

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'
import type { components } from '@/lib/api/types'

// Type aliases for readability
type Booking = components['schemas']['Booking']
type CreateBookingRequest = components['schemas']['CreateBookingRequest']
type UpdateBookingRequest = components['schemas']['UpdateBookingRequest']

interface UseBookingsOptions {
  employeeId?: string
  dateFrom?: string
  dateTo?: string
  limit?: number
  cursor?: string
  enabled?: boolean
}

/**
 * Hook to fetch paginated list of bookings.
 *
 * @example
 * ```tsx
 * const { data } = useBookings({
 *   employeeId: '123',
 *   dateFrom: '2026-01-01',
 *   dateTo: '2026-01-31',
 * })
 * ```
 */
export function useBookings(options: UseBookingsOptions = {}) {
  const {
    employeeId,
    dateFrom,
    dateTo,
    limit = 50,
    cursor,
    enabled = true,
  } = options

  return useApiQuery('/bookings', {
    params: {
      employee_id: employeeId,
      date_from: dateFrom,
      date_to: dateTo,
      limit,
      cursor,
    },
    enabled,
  })
}

/**
 * Hook to fetch a single booking by ID.
 */
export function useBooking(id: string, enabled = true) {
  return useApiQuery('/bookings/{id}', {
    path: { id },
    enabled: enabled && !!id,
  })
}

/**
 * Hook to create a new booking (clock in/out).
 */
export function useCreateBooking() {
  return useApiMutation('/bookings', 'post', {
    invalidateKeys: [['/bookings'], ['/daily-values']],
  })
}

/**
 * Hook to update an existing booking.
 */
export function useUpdateBooking() {
  return useApiMutation('/bookings/{id}', 'put', {
    invalidateKeys: [['/bookings'], ['/daily-values']],
  })
}

/**
 * Hook to delete a booking.
 */
export function useDeleteBooking() {
  return useApiMutation('/bookings/{id}', 'delete', {
    invalidateKeys: [['/bookings'], ['/daily-values']],
  })
}
```

#### 6. Create API Hooks Index

**File**: `/home/tolga/projects/terp/apps/web/src/hooks/api/index.ts`

```typescript
// Domain-specific API hooks

// Employees
export {
  useEmployees,
  useEmployee,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
} from './use-employees'

// Bookings
export {
  useBookings,
  useBooking,
  useCreateBooking,
  useUpdateBooking,
  useDeleteBooking,
} from './use-bookings'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`
- [ ] All hook files exist:
  - `test -f apps/web/src/hooks/use-api-query.ts`
  - `test -f apps/web/src/hooks/use-api-mutation.ts`
  - `test -f apps/web/src/hooks/api/use-employees.ts`
  - `test -f apps/web/src/hooks/api/use-bookings.ts`

#### Manual Verification:
- [ ] Verify hooks have proper TypeScript inference in IDE
- [ ] Confirm `useEmployees()` shows autocomplete for `params` options

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 6.

---

## Phase 6: Add Error Handling Utilities

### Overview

Create error handling utilities that parse RFC 7807 Problem Details responses into user-friendly formats.

### Changes Required

#### 1. Create Error Utilities

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/errors.ts`

```typescript
/**
 * RFC 7807 Problem Details response from the API.
 */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
  errors?: Array<{
    field: string
    message: string
  }>
}

/**
 * Structured API error for use in the application.
 */
export interface ApiError {
  status: number
  title: string
  message: string
  fieldErrors?: Record<string, string>
  raw: ProblemDetails | unknown
}

/**
 * Check if an error is a ProblemDetails response.
 */
function isProblemDetails(error: unknown): error is ProblemDetails {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'title' in error &&
    'status' in error
  )
}

/**
 * Parse an API error response into a structured ApiError.
 *
 * @example
 * ```ts
 * const { data, error } = await api.GET('/employees')
 * if (error) {
 *   const apiError = parseApiError(error)
 *   console.log(apiError.message)
 *   console.log(apiError.fieldErrors)
 * }
 * ```
 */
export function parseApiError(error: unknown): ApiError {
  if (isProblemDetails(error)) {
    // Convert field errors array to object for easier access
    const fieldErrors = error.errors?.reduce<Record<string, string>>(
      (acc, { field, message }) => {
        acc[field] = message
        return acc
      },
      {}
    )

    return {
      status: error.status,
      title: error.title,
      message: error.detail ?? error.title,
      fieldErrors,
      raw: error,
    }
  }

  // Handle generic errors
  if (error instanceof Error) {
    return {
      status: 0,
      title: 'Error',
      message: error.message,
      raw: error,
    }
  }

  // Handle unknown errors
  return {
    status: 0,
    title: 'Unknown Error',
    message: 'An unexpected error occurred',
    raw: error,
  }
}

/**
 * Get a user-friendly error message for common HTTP status codes.
 */
export function getErrorMessage(status: number, fallback?: string): string {
  const messages: Record<number, string> = {
    400: 'Invalid request. Please check your input.',
    401: 'Please log in to continue.',
    403: 'You do not have permission to perform this action.',
    404: 'The requested resource was not found.',
    409: 'This operation conflicts with existing data.',
    422: 'The provided data is invalid.',
    429: 'Too many requests. Please try again later.',
    500: 'An internal server error occurred. Please try again.',
    502: 'The server is temporarily unavailable. Please try again.',
    503: 'The service is currently unavailable. Please try again.',
  }

  return messages[status] ?? fallback ?? 'An error occurred. Please try again.'
}

/**
 * Check if an error is a specific HTTP status.
 */
export function isHttpStatus(error: ApiError, status: number): boolean {
  return error.status === status
}

/**
 * Check if an error is an authentication error (401).
 */
export function isAuthError(error: ApiError): boolean {
  return error.status === 401
}

/**
 * Check if an error is a permission error (403).
 */
export function isForbiddenError(error: ApiError): boolean {
  return error.status === 403
}

/**
 * Check if an error is a validation error (400 or 422).
 */
export function isValidationError(error: ApiError): boolean {
  return error.status === 400 || error.status === 422
}

/**
 * Check if an error is a not found error (404).
 */
export function isNotFoundError(error: ApiError): boolean {
  return error.status === 404
}
```

#### 2. Update API Index to Export Errors

**File**: `/home/tolga/projects/terp/apps/web/src/lib/api/index.ts`

Update to include error exports:

```typescript
// API Client
export { api, authStorage, tenantIdStorage } from './client'
export type { AuthTokenStorage, TenantStorage, ApiResponse, ApiRequestBody } from './client'

// Generated Types
export type { paths, components, operations } from './types'

// Error utilities
export {
  parseApiError,
  getErrorMessage,
  isHttpStatus,
  isAuthError,
  isForbiddenError,
  isValidationError,
  isNotFoundError,
} from './errors'
export type { ProblemDetails, ApiError } from './errors'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles without errors: `cd apps/web && pnpm run typecheck`
- [ ] Linting passes: `cd apps/web && pnpm run lint`
- [ ] Error utilities file exists: `test -f apps/web/src/lib/api/errors.ts`

#### Manual Verification:
- [ ] Verify error types are properly exported and usable in components

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 7.

---

## Phase 7: Update Makefile and Documentation

### Overview

Add convenience commands to the Makefile and ensure the type generation is documented.

### Changes Required

#### 1. Update Root Makefile

**File**: `/home/tolga/projects/terp/Makefile`

The Makefile updates were already specified in Phase 2. Ensure these targets exist:

```makefile
## generate-web: Generate TypeScript API types for frontend
generate-web: swagger-bundle ## Generate TypeScript types for frontend from OpenAPI
	@echo "Generating TypeScript API types..."
	cd apps/web && pnpm run generate:api
	@echo "Done! Types generated in apps/web/src/lib/api/types.ts"

## generate-all: Generate all code from OpenAPI spec
generate-all: generate generate-web ## Generate Go models and TypeScript types
```

#### 2. Add Type Check to CI/Lint Flow (optional enhancement)

If desired, add a combined check command to `apps/web/package.json`:

```json
{
  "scripts": {
    "check": "pnpm run typecheck && pnpm run lint"
  }
}
```

### Success Criteria

#### Automated Verification:
- [ ] `make generate-all` runs successfully
- [ ] `make generate-web` runs successfully
- [ ] Type generation produces valid TypeScript: `cd apps/web && pnpm run typecheck`

#### Manual Verification:
- [ ] `make help` shows the new generate commands

**Implementation Note**: This completes the implementation plan.

---

## Testing Strategy

### Unit Tests

For this infrastructure phase, unit tests are not required. The type-safety is verified at compile time.

### Integration Tests

Not applicable for this phase - integration will be tested when actual features use the API client.

### Manual Testing Steps

1. **Verify type generation**:
   ```bash
   make generate-web
   cat apps/web/src/lib/api/types.ts | head -100
   ```

2. **Verify TypeScript compilation**:
   ```bash
   cd apps/web && pnpm run typecheck
   ```

3. **Verify development server**:
   ```bash
   cd apps/web && pnpm dev
   # Open http://localhost:3000
   # Check browser console for errors
   # Check React Query DevTools appears
   ```

4. **Verify IDE autocomplete**:
   - Open `apps/web/src/hooks/api/use-employees.ts` in VS Code
   - Hover over `useApiQuery('/employees')` - should show type info
   - Type `useApiQuery('/` - should show autocomplete for all endpoints

---

## Performance Considerations

1. **Bundle Size**: `openapi-fetch` is lightweight (~2KB gzipped). React Query adds ~12KB gzipped.

2. **Type Generation**: The generated `types.ts` file may be large (the OpenAPI spec has 91 schemas). This is dev-time only and tree-shaken in production.

3. **Query Caching**: Default 5-minute stale time and 30-minute garbage collection balance freshness with network efficiency.

---

## Migration Notes

No data migration required. This is a greenfield frontend implementation.

---

## References

- Linear Ticket: NOK-215
- Research Document: `thoughts/shared/research/2026-01-25-NOK-215-generate-typescript-api-client.md`
- OpenAPI Spec: `api/openapi.bundled.yaml`
- openapi-typescript docs: https://openapi-ts.dev/
- openapi-fetch docs: https://openapi-ts.dev/openapi-fetch/
- TanStack Query docs: https://tanstack.com/query/latest
