# ZMI-TICKET-302: Restructure lib + auth Directories

Status: Todo
Priority: P0
Depends on: ZMI-TICKET-301

## Goal
Reorganize `src/lib/` and `src/server/lib/` into the target structure matching workbook. Consolidate auth-related code into `src/lib/auth/`. Move server-only lib files into their proper locations.

## Scope
- **In scope:**
  - Create `src/lib/auth/` with consolidated auth files
  - Move `src/server/lib/` files to `src/lib/`
  - Move `src/server/middleware/` to `src/lib/auth/`
  - Move `src/config/env.ts` to `src/lib/config.ts`
  - Update all imports
- **Out of scope:**
  - Moving services (TICKET-303)
  - Moving routers (Phase 1)

## Implementation Steps

### 1. Create `src/lib/auth/` directory
Consolidate all auth-related code:

| Source | Destination |
|--------|-------------|
| `src/server/lib/permissions.ts` (98 lines) | `src/lib/auth/permissions.ts` |
| `src/server/lib/permission-catalog.ts` | `src/lib/auth/permission-catalog.ts` |
| `src/server/middleware/authorization.ts` (202 lines) | `src/lib/auth/middleware.ts` |

The authorization middleware contains:
- `requirePermission()` — checks any of specified permissions (OR logic)
- `requireSelfOrPermission()` — self-access or permission fallback
- `requireEmployeePermission()` — own vs all employee scoped access
- `applyDataScope()` — adds DataScope context for query filtering

### 2. Move server lib files to `src/lib/services/`
These are utility libraries used by services/routers:

| Source | Destination |
|--------|-------------|
| `src/server/lib/holiday-calendar.ts` | `src/lib/services/holiday-calendar.ts` |
| `src/server/lib/vacation-calculation.ts` | `src/lib/services/vacation-calculation.ts` |
| `src/server/lib/vacation-helpers.ts` | `src/lib/services/vacation-helpers.ts` |
| `src/server/lib/carryover-calculation.ts` | `src/lib/services/carryover-calculation.ts` |
| `src/server/lib/vacation-balance-output.ts` | `src/lib/services/vacation-balance-output.ts` |

### 3. Move environment config
| Source | Destination |
|--------|-------------|
| `src/config/env.ts` | `src/lib/config.ts` |

Delete empty `src/config/` directory after move.

### 4. Delete empty directories
```
rm -rf src/server/lib/
rm -rf src/server/middleware/
rm -rf src/config/
```

### 5. Update all imports
**Permission imports (used by ALL 68 routers):**
```typescript
// Before:
import { requirePermission, applyDataScope } from '@/server/middleware/authorization'
import { permissionIdByKey } from '@/server/lib/permission-catalog'
import { resolvePermissions } from '@/server/lib/permissions'

// After:
import { requirePermission, applyDataScope } from '@/lib/auth/middleware'
import { permissionIdByKey } from '@/lib/auth/permission-catalog'
import { resolvePermissions } from '@/lib/auth/permissions'
```

**Vacation/holiday imports (used by ~10 routers + services):**
```typescript
// Before:
import { calculateVacationEntitlement } from '@/server/lib/vacation-calculation'
import { getHolidaysForRange } from '@/server/lib/holiday-calendar'

// After:
import { calculateVacationEntitlement } from '@/lib/services/vacation-calculation'
import { getHolidaysForRange } from '@/lib/services/holiday-calendar'
```

**Config imports:**
```typescript
// Before:
import { env } from '@/config/env'
// After:
import { env } from '@/lib/config'
```

### 6. Update internal cross-references
The authorization middleware imports from trpc init. Update:
```typescript
// In src/lib/auth/middleware.ts
import { ... } from '@/trpc/init'  // Was @/server/trpc
```

## Verification
```bash
make typecheck
make lint
make test
make build
```

## Files Created
- `src/lib/auth/permissions.ts`
- `src/lib/auth/permission-catalog.ts`
- `src/lib/auth/middleware.ts`
- `src/lib/services/holiday-calendar.ts`
- `src/lib/services/vacation-calculation.ts`
- `src/lib/services/vacation-helpers.ts`
- `src/lib/services/carryover-calculation.ts`
- `src/lib/services/vacation-balance-output.ts`
- `src/lib/config.ts`

## Files Deleted
- `src/server/lib/` (entire directory)
- `src/server/middleware/` (entire directory)
- `src/config/` (entire directory)

## Files Modified (imports)
- All 68 router files
- Service files that reference vacation/holiday libs
- Cron route files
- Test files
- tRPC init (if it imports permissions)
