# Research: NOK-215 Generate TypeScript API Client from OpenAPI Spec

**Date**: 2026-01-25
**Ticket**: NOK-215 - Generate TypeScript API client from OpenAPI spec

## Overview

This document captures the current state of the codebase relevant to generating a TypeScript API client from the existing OpenAPI specification.

---

## 1. Next.js Frontend Structure (apps/web/)

### 1.1 Project Configuration

**Framework**: Next.js 16.1 with Turbopack
**Package Manager**: pnpm
**TypeScript**: 5.7+

**File**: `/home/tolga/projects/terp/apps/web/package.json`
```json
{
  "name": "@terp/web",
  "version": "0.0.1",
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
    "@radix-ui/react-slot": "^1.2.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "next": "^16.1.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "tailwind-merge": "^2.6.0"
  }
}
```

**Note**: No API client packages are currently installed (no openapi-typescript, openapi-fetch, react-query/tanstack-query, axios, or similar).

### 1.2 Directory Structure

```
apps/web/
├── src/
│   ├── app/
│   │   ├── globals.css       # Tailwind v4 CSS-first theme
│   │   ├── layout.tsx        # Root layout with Inter font
│   │   └── page.tsx          # Home page (placeholder)
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx    # Shadcn/ui Button component
│   │   │   └── .gitkeep
│   │   ├── layout/.gitkeep
│   │   └── forms/.gitkeep
│   ├── config/
│   │   └── env.ts            # Environment configuration
│   ├── hooks/.gitkeep
│   ├── lib/
│   │   └── utils.ts          # cn() utility for Tailwind
│   └── types/
│       └── index.ts          # Type definitions (placeholder)
├── components.json           # Shadcn/ui configuration
├── next.config.ts            # Next.js config (empty)
├── tsconfig.json             # TypeScript configuration
├── .env.example              # Example environment variables
└── .env.local                # Local environment variables
```

### 1.3 TypeScript Configuration

**File**: `/home/tolga/projects/terp/apps/web/tsconfig.json`

Key settings:
- `target`: ES2022
- `strict`: true
- `noUncheckedIndexedAccess`: true
- Path alias: `@/*` maps to `./src/*`

### 1.4 Environment Configuration

**File**: `/home/tolga/projects/terp/apps/web/src/config/env.ts`

```typescript
// Server-side only
export const serverEnv = {
  apiUrl: process.env.API_URL ?? 'http://localhost:8080/api/v1',
} as const

// Client-side accessible
export const clientEnv = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'Terp',
} as const
```

**File**: `/home/tolga/projects/terp/apps/web/.env.local`
```
API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
NEXT_PUBLIC_APP_NAME=Terp
```

### 1.5 Types Placeholder

**File**: `/home/tolga/projects/terp/apps/web/src/types/index.ts`

```typescript
/**
 * Custom type definitions for the application.
 * API types will be generated from OpenAPI spec and placed in api.ts
 */

export type {}

// Placeholder for future API types
// export type * from './api'
```

---

## 2. OpenAPI Specification

### 2.1 Specification Details

**Format**: Swagger 2.0 (OpenAPI 2.0)
**Location**: `/home/tolga/projects/terp/api/openapi.bundled.yaml`
**Source**: Multi-file spec bundled from `/home/tolga/projects/terp/api/openapi.yaml`

**Base Configuration**:
- Host: `localhost:8080`
- Base Path: `/api/v1`
- Schemes: http, https
- Content-Type: application/json

### 2.2 Authentication

```yaml
securityDefinitions:
  BearerAuth:
    type: apiKey
    name: Authorization
    in: header
    description: JWT token. Format "Bearer <token>"
```

All endpoints except `/health` and `/auth/*` require Bearer token authentication.

### 2.3 API Tags (Domain Areas)

| Tag | Description |
|-----|-------------|
| Health | Health check endpoints |
| Auth | Authentication endpoints |
| Users | User management |
| Tenants | Tenant management |
| Employees | Employee management |
| Departments | Department management |
| Locations | Location management |
| Cost Centers | Cost center management |
| Employment Types | Employment type management |
| User Groups | User group and permission management |
| Day Plans | Day plan configuration |
| Week Plans | Week plan configuration |
| Tariffs | Tariff configuration |
| Booking Types | Booking type management |
| Bookings | Time bookings (clock in/out) |
| Daily Values | Daily calculated values |
| Holidays | Holiday management |
| Absence Types | Absence type management |
| Absences | Absence management |
| Vacation | Vacation balance management |
| Monthly Values | Monthly aggregated values |
| Corrections | Time corrections |
| Accounts | Time account management |
| Audit Logs | Audit log viewing |
| Reports | Report generation |
| Payroll | Payroll export |
| Teams | Team management |
| Employee Day Plans | Employee day plan assignments |
| Monthly Evaluations | Monthly evaluation configuration |

### 2.4 Schema Definitions (91 total)

**Common Types**:
- UUID
- Timestamp
- ProblemDetails
- PaginationMeta

**Entity Types** (Sample):
- User, UserSummary, UserList, UpdateUserRequest
- Tenant, CreateTenantRequest, UpdateTenantRequest, TenantList
- Employee, EmployeeSummary, EmployeeList, CreateEmployeeRequest, UpdateEmployeeRequest
- Department, DepartmentSummary, DepartmentList
- DayPlan, DayPlanSummary, DayPlanBreak, DayPlanBonus, DayPlanList
- WeekPlan, WeekPlanSummary, WeekPlanList
- Booking, BookingList, CreateBookingRequest, UpdateBookingRequest
- DailyValue, DailyValueList, DailyValueSummary, DailyError
- Absence, AbsenceList, CreateAbsenceRangeRequest
- MonthlyValue, MonthlyValueList
- VacationBalance, VacationBalanceList
- And many more...

### 2.5 Key Endpoints

**Authentication**:
- `POST /auth/login` - Login with credentials
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - Logout
- `GET /auth/me` - Get current user
- `GET /auth/dev/login` - Dev mode login (development only)
- `GET /auth/dev/users` - List dev users (development only)

**Core CRUD Operations** (pattern for most entities):
- `GET /{resource}` - List with pagination
- `POST /{resource}` - Create
- `GET /{resource}/{id}` - Get by ID
- `PUT|PATCH /{resource}/{id}` - Update
- `DELETE /{resource}/{id}` - Delete

**Employee-specific**:
- `GET /employees/{id}/day/{date}` - Get employee day view
- `POST /employees/{id}/day/{date}/calculate` - Recalculate day
- `GET /employees/{id}/absences` - List employee absences
- `POST /employees/{id}/absences` - Create absence range
- `GET /employees/{id}/vacation-balance` - Get vacation balance
- `GET /employees/{id}/contacts` - List employee contacts
- `GET /employees/{id}/cards` - List employee cards

**Time Tracking**:
- Bookings: CRUD operations for time entries
- Daily Values: Calculated values per day
- Monthly Values: Aggregated monthly data
- Corrections: Time correction requests

**Administration**:
- Day Plans, Week Plans, Tariffs configuration
- Absence Types, Booking Types management
- Accounts, Reports, Payroll exports
- Audit logs

### 2.6 Pagination Pattern

List endpoints support cursor-based pagination:
- `limit`: Number of items (default: 20, max: 100)
- `cursor`: Cursor for next page
- Response includes `meta` with `has_more` and `next_cursor`

Some endpoints use page-based pagination:
- `limit`: Items per page
- `page`: Page number

### 2.7 Error Response Format

RFC 7807 Problem Details:
```yaml
ProblemDetails:
  type: object
  required:
    - type
    - title
    - status
  properties:
    type:
      type: string
      format: uri
    title:
      type: string
    status:
      type: integer
    detail:
      type: string
    instance:
      type: string
      format: uri
    errors:
      type: array
      items:
        type: object
        properties:
          field:
            type: string
          message:
            type: string
```

---

## 3. Existing Patterns for API Configuration

### 3.1 Environment-based Configuration

The frontend uses `src/config/env.ts` to manage API URLs:
- `serverEnv.apiUrl` for server-side requests
- `clientEnv.apiUrl` for client-side requests

Both default to `http://localhost:8080/api/v1`.

### 3.2 No Existing API Client

There is currently:
- No API client implementation
- No generated types from OpenAPI
- No data fetching library (React Query, SWR, etc.)
- No HTTP client wrapper

### 3.3 Shadcn/ui Configuration

**File**: `/home/tolga/projects/terp/apps/web/components.json`

```json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

This establishes the convention for path aliases used throughout the project.

---

## 4. Multi-File OpenAPI Structure

### 4.1 Source Files

The bundled spec is generated from:

**Main file**: `/home/tolga/projects/terp/api/openapi.yaml`

**Paths** (58 files):
- `api/paths/auth.yaml`
- `api/paths/users.yaml`
- `api/paths/tenants.yaml`
- `api/paths/employees.yaml`
- `api/paths/departments.yaml`
- `api/paths/locations.yaml`
- `api/paths/cost-centers.yaml`
- `api/paths/employment-types.yaml`
- `api/paths/user-groups.yaml`
- `api/paths/day-plans.yaml`
- `api/paths/week-plans.yaml`
- `api/paths/tariffs.yaml`
- `api/paths/booking-types.yaml`
- `api/paths/bookings.yaml`
- `api/paths/daily-values.yaml`
- `api/paths/holidays.yaml`
- `api/paths/absence-types.yaml`
- `api/paths/absences.yaml`
- `api/paths/vacation-balances.yaml`
- `api/paths/monthly-values.yaml`
- `api/paths/corrections.yaml`
- `api/paths/accounts.yaml`
- `api/paths/audit-logs.yaml`
- `api/paths/reports.yaml`
- `api/paths/payroll-exports.yaml`
- `api/paths/teams.yaml`
- `api/paths/employee-day-plans.yaml`
- `api/paths/monthly-evaluations.yaml`
- `api/paths/health.yaml`

**Schemas** (29 files):
- `api/schemas/common.yaml`
- `api/schemas/users.yaml`
- `api/schemas/tenants.yaml`
- `api/schemas/holidays.yaml`
- `api/schemas/employees.yaml`
- `api/schemas/departments.yaml`
- `api/schemas/locations.yaml`
- `api/schemas/cost-centers.yaml`
- `api/schemas/employment-types.yaml`
- `api/schemas/user-groups.yaml`
- `api/schemas/day-plans.yaml`
- `api/schemas/week-plans.yaml`
- `api/schemas/tariffs.yaml`
- `api/schemas/booking-types.yaml`
- `api/schemas/bookings.yaml`
- `api/schemas/daily-values.yaml`
- `api/schemas/absence-types.yaml`
- `api/schemas/absences.yaml`
- `api/schemas/vacation-balances.yaml`
- `api/schemas/monthly-values.yaml`
- `api/schemas/corrections.yaml`
- `api/schemas/accounts.yaml`
- `api/schemas/audit-logs.yaml`
- `api/schemas/reports.yaml`
- `api/schemas/payroll-exports.yaml`
- `api/schemas/teams.yaml`
- `api/schemas/employee-day-plans.yaml`
- `api/schemas/monthly-evaluations.yaml`

**Responses**:
- `api/responses/errors.yaml`

### 4.2 Bundling Command

From Makefile:
```bash
make swagger-bundle  # Bundle multi-file OpenAPI into single file
```

Output: `api/openapi.bundled.yaml`

---

## 5. Summary of Current State

### What Exists

1. **Next.js 16 project** with TypeScript, Tailwind v4, and Shadcn/ui
2. **Environment configuration** with API URL settings
3. **Types placeholder** prepared for generated API types
4. **Comprehensive OpenAPI spec** (Swagger 2.0) with 91 schema definitions
5. **Multi-file API structure** with bundling support
6. **Path aliases** configured (`@/*` to `./src/*`)

### What Does Not Exist

1. No `openapi-typescript` or `openapi-fetch` packages
2. No React Query / TanStack Query
3. No API client wrapper or fetch utilities
4. No generated TypeScript types from OpenAPI
5. No custom hooks for API operations
6. No error handling utilities
7. No request/response interceptors

### Key Headers Required

Per ticket requirements:
- `Authorization: Bearer <token>`
- `X-Tenant-ID: <tenant-uuid>`

Note: The `X-Tenant-ID` header is mentioned in the ticket but not explicitly defined in the OpenAPI spec's security definitions. It is handled by the API's tenant middleware.
