# Research: ZMI-TICKET-047 - Complete User Management UI

**Date:** 2026-02-03
**Ticket:** ZMI-TICKET-047
**Status:** Research complete

---

## 1. Existing Users Page Analysis

**File:** `apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx`

The current users page is a simple list-style admin page with the following characteristics:

- **Permission guard:** Uses `useHasPermission(['users.manage'])` with redirect to `/dashboard` if unauthorized.
- **Auth check:** Uses `useAuth()` for auth loading state.
- **Data fetching:** Uses `useUsers({ limit: 100, search })` for user list and `useUserGroups()` for group data.
- **Layout:** A flat card-based list (not a data table), with each user shown as a row in a `divide-y` container.
- **Current functionality:** Only supports changing a user's group assignment via inline Select dropdowns. No create, delete, edit, or password change functionality exists.
- **Translations:** Uses `useTranslations('adminUsers')` namespace.
- **State:** Manages `search`, `savingUserId`, and `error` state. No form sheet, delete dialog, or row actions state exists.
- **Components used:** `Card`, `CardContent`, `SearchInput`, `Skeleton`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `AlertTriangle`, `ShieldCheck`, `Users` icons.
- **No "Create User" button** exists in the header area.
- **No DropdownMenu / row actions** exist per user row.
- **User display:** Shows `display_name`, `email`, admin group badge (if user group has `is_admin`), and group selector.
- **No table structure** -- uses simple div-based list layout.

### Current Imports from hooks/api
```typescript
import { useUpdateUser, useUserGroups, useUsers } from '@/hooks/api'
```

### Missing Functionality (to be added)
- Create User button in toolbar
- Row actions (edit, delete, change password) via DropdownMenu per user
- User form sheet (create/edit)
- Delete confirmation dialog
- Change password dialog

---

## 2. Existing Users API Hook

### `use-users.ts`
**File:** `apps/web/src/hooks/api/use-users.ts`

Contains only `useUsers()` query hook:

```typescript
interface UseUsersOptions {
  limit?: number
  search?: string
  enabled?: boolean
}

export function useUsers(options: UseUsersOptions = {}) {
  const { limit = 100, search, enabled = true } = options
  return useApiQuery('/users', {
    params: { limit, search: search || undefined },
    enabled,
  })
}
```

**Missing mutations:** `useCreateUser`, `useDeleteUser`, `useChangeUserPassword` do not exist yet.

### `use-user.ts`
**File:** `apps/web/src/hooks/api/use-user.ts`

Contains `useUser(userId)` and `useUpdateUser()`:

```typescript
export function useUser(userId: string, enabled = true) {
  return useApiQuery('/users/{id}', {
    path: { id: userId },
    enabled: enabled && !!userId,
  })
}

export function useUpdateUser() {
  return useApiMutation('/users/{id}', 'patch', {
    invalidateKeys: [['/users/{id}'], ['/auth/me'], ['/users']],
  })
}
```

### hooks/api/index.ts Exports
**File:** `apps/web/src/hooks/api/index.ts`

Currently exports:
```typescript
export { useUser, useUpdateUser } from './use-user'
export { useUsers } from './use-users'
```

New hooks should be added to `use-users.ts` (for `useCreateUser`, `useDeleteUser`, `useChangeUserPassword`) and re-exported from the index.

---

## 3. Backend API Endpoints (from OpenAPI spec)

### OpenAPI Paths
**File:** `api/paths/users.yaml`

| Method | Path | Operation | Auth | Response |
|--------|------|-----------|------|----------|
| GET | `/users` | listUsers | users.manage | 200: UserList |
| POST | `/users` | createUser | users.manage | 201: User |
| GET | `/users/{id}` | getUser | users.manage | 200: User |
| PATCH | `/users/{id}` | updateUser | self or users.manage | 200: User |
| DELETE | `/users/{id}` | deleteUser | users.manage | 204: No Content |
| POST | `/users/{id}/password` | changeUserPassword | self or users.manage | 204: No Content |

### OpenAPI Schemas
**File:** `api/schemas/users.yaml`

#### CreateUserRequest
Required: `email`, `display_name`
Optional: `tenant_id`, `username`, `password`, `sso_id`, `user_group_id`, `employee_id`, `is_active`, `is_locked`, `data_scope_type` (enum: all|tenant|department|employee), `data_scope_tenant_ids`, `data_scope_department_ids`, `data_scope_employee_ids`

#### UpdateUserRequest
All optional: `display_name`, `avatar_url`, `user_group_id`, `username`, `employee_id`, `sso_id`, `is_active`, `is_locked`, `data_scope_type`, `data_scope_tenant_ids`, `data_scope_department_ids`, `data_scope_employee_ids`

#### ChangePasswordRequest
Required: `new_password`
Optional: `current_password` (required when user changes own password)

#### User Schema
Required: `id`, `email`, `display_name`, `role`, `created_at`
Notable fields: `is_active`, `is_locked`, `data_scope_type`, `data_scope_tenant_ids`, `data_scope_department_ids`, `data_scope_employee_ids`, `employee_id`, `user_group_id`, `username`, `sso_id`

### Backend Route Registration
**File:** `apps/api/internal/handler/routes.go`

```go
r.With(authz.RequirePermission(permManage)).Post("/", h.Create)
r.With(authz.RequirePermission(permManage)).Delete("/{id}", h.Delete)
r.With(authz.RequireSelfOrPermission("id", permManage)).Post("/{id}/password", h.ChangePassword)
```

### Backend Self-Delete Prevention
**File:** `apps/api/internal/service/user.go`

The backend already prevents self-deletion:
```go
func (s *UserService) Delete(...) error {
    if requesterID == targetID {
        return ErrPermissionDenied
    }
    ...
}
```

### Backend Password Change Logic
- If `requesterID == targetID` and user is not admin/manager, current_password is verified.
- If admin changes another user's password, no current_password verification.
- `new_password` is always required.

---

## 4. Similar Form Sheet Patterns

The codebase has a consistent form sheet pattern used across all admin pages. Key examples:

### Pattern: UserGroupFormSheet (most relevant)
**File:** `apps/web/src/components/user-groups/user-group-form-sheet.tsx`

Structure:
1. **Props interface:** `{ open, onOpenChange, group?: UserGroup | null, onSuccess? }`
2. **Form state:** Manual `React.useState<FormState>` (no react-hook-form or zod)
3. **Reset on open:** `React.useEffect` resets form when `open` changes, populates from entity if editing
4. **Validation:** Inline validation in `handleSubmit`, collects error strings
5. **Mutations:** Separate create and update mutations, both called from `handleSubmit`
6. **Error handling:** `try/catch` with `apiError.detail ?? apiError.message ?? t('fallback')`
7. **Layout:** `Sheet > SheetContent(side="right") > SheetHeader > ScrollArea > SheetFooter`
8. **Footer:** Cancel (outline) + Submit (primary), both `flex-1` in `flex-row gap-2 border-t pt-4`
9. **Loading state:** `Loader2` spinner in submit button, `isSubmitting` disables all fields
10. **Sheet width:** `className="w-full sm:max-w-2xl"` (wider for complex forms)
11. **Section headers:** `<h3 className="text-sm font-medium text-muted-foreground">`

### Pattern: EmployeeFormSheet
**File:** `apps/web/src/components/employees/employee-form-sheet.tsx`

Similar structure with these additions:
- Uses `Select` components for reference data (departments, cost centers, etc.)
- Reference data loaded conditionally with `enabled: open`
- Uses `'__none__'` sentinel value for optional Select fields
- Validation function is extracted as a separate `validateForm()` function
- Grid layouts for side-by-side fields: `<div className="grid grid-cols-2 gap-4">`
- Sheet width: `sm:max-w-lg`

### Common Form Sheet Patterns Summary
- All use manual `React.useState` for form state (no form libraries)
- All use `React.useEffect` to reset/populate form on open
- Error displayed via `<Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>`
- Successful submission calls `onSuccess?.()` which parent uses to close sheet
- Component index file pattern: `components/user-groups/index.ts` re-exports the sheet component

---

## 5. Similar Delete Dialog Patterns

### Pattern 1: ConfirmDialog (reusable component)
**File:** `apps/web/src/components/ui/confirm-dialog.tsx`

A reusable confirmation dialog component used across the codebase:

```typescript
interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string      // default: "Confirm"
  cancelLabel?: string       // default: "Cancel"
  variant?: 'default' | 'destructive'
  isLoading?: boolean
  onConfirm: () => void | Promise<void>
}
```

- Uses `Sheet` with `side="bottom"` (not AlertDialog)
- Destructive variant shows `AlertTriangle` icon in red circle
- Cancel and Confirm buttons are `flex-1` in a row
- Loading state shows `Loader2` spinner in confirm button
- Does NOT auto-close -- parent handles closing

### Pattern 2: UserGroups page inline delete
**File:** `apps/web/src/app/[locale]/(dashboard)/admin/user-groups/page.tsx`

Usage pattern:
```tsx
const [deleteGroup, setDeleteGroup] = React.useState<UserGroup | null>(null)
const deleteMutation = useDeleteUserGroup()

const handleConfirmDelete = async () => {
  if (!deleteGroup) return
  try {
    await deleteMutation.mutateAsync({ path: { id: deleteGroup.id } })
    setDeleteGroup(null)
  } catch {
    // error handled by mutation
  }
}

<ConfirmDialog
  open={!!deleteGroup}
  onOpenChange={(open) => { if (!open) setDeleteGroup(null) }}
  title={t('deleteGroup')}
  description={deleteGroup ? t('deleteDescription', { name: deleteGroup.name }) : ''}
  confirmLabel={tCommon('delete')}
  variant="destructive"
  isLoading={deleteMutation.isPending}
  onConfirm={handleConfirmDelete}
/>
```

### Pattern 3: TariffAssignmentDeleteDialog (dedicated component)
**File:** `apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx`

Wraps `ConfirmDialog` in a dedicated component:
```typescript
interface TariffAssignmentDeleteDialogProps {
  assignment: TariffAssignment | null
  employeeId: string
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}
```
- `open` is derived from `!!assignment`
- Calls `onSuccess?.()` and `onOpenChange(false)` after successful deletion

---

## 6. Data Scope Implementation

### Backend Model
**File:** `apps/api/internal/model/user.go`

```go
type DataScopeType string

const (
  DataScopeAll        DataScopeType = "all"
  DataScopeTenant     DataScopeType = "tenant"
  DataScopeDepartment DataScopeType = "department"
  DataScopeEmployee   DataScopeType = "employee"
)
```

User model fields:
```go
DataScopeType          DataScopeType  `gorm:"type:varchar(20);not null;default:'all'"`
DataScopeTenantIDs     pq.StringArray `gorm:"type:uuid[];default:'{}'"`
DataScopeDepartmentIDs pq.StringArray `gorm:"type:uuid[];default:'{}'"`
DataScopeEmployeeIDs   pq.StringArray `gorm:"type:uuid[];default:'{}'"`
```

### Backend Scope Application
**File:** `apps/api/internal/access/scope.go`

The `Scope` struct is used to filter data based on user's data scope:
- `DataScopeAll`: No filtering, user sees everything
- `DataScopeTenant`: Filters by tenant IDs
- `DataScopeDepartment`: Filters employees by department IDs
- `DataScopeEmployee`: Filters by specific employee IDs

`ApplyEmployeeScope()` applies WHERE clauses to GORM queries based on scope type.

### Frontend Schema (API types)
The `User` type in the generated types includes:
- `data_scope_type`: string enum (all | tenant | department | employee)
- `data_scope_tenant_ids`: string[] (UUIDs)
- `data_scope_department_ids`: string[] (UUIDs)
- `data_scope_employee_ids`: string[] (UUIDs)

### No existing frontend data scope UI
There is no existing data scope configuration component in the frontend. This will be a new UI pattern.

---

## 7. Related API Hooks (user groups, employees, departments)

### User Groups Hook
**File:** `apps/web/src/hooks/api/use-user-groups.ts`

```typescript
export function useUserGroups(options: { active?: boolean; enabled?: boolean } = {})
export function useUserGroup(id: string, enabled = true)
export function useCreateUserGroup()
export function useUpdateUserGroup()
export function useDeleteUserGroup()
```

### Employees Hook
**File:** `apps/web/src/hooks/api/use-employees.ts`

```typescript
export function useEmployees(options: {
  limit?: number; page?: number; search?: string;
  departmentId?: string; active?: boolean; enabled?: boolean
} = {})
export function useEmployee(id: string, enabled = true)
export function useCreateEmployee()
export function useUpdateEmployee()
export function useDeleteEmployee()
export function useBulkAssignTariff()
```

### Departments Hook
**File:** `apps/web/src/hooks/api/use-departments.ts`

```typescript
export function useDepartments(options: {
  enabled?: boolean; active?: boolean; parentId?: string
} = {})
export function useDepartment(id: string, enabled = true)
export function useDepartmentTree(options: { enabled?: boolean } = {})
export function useCreateDepartment()
export function useUpdateDepartment()
export function useDeleteDepartment()
```

### Tenants
The tenant provider (`apps/web/src/providers/tenant-provider.tsx`) uses `useApiQuery('/tenants')` to fetch available tenants. There is no dedicated `use-tenants.ts` hook file, but the query is already available through the provider's context via `useTenant()`.

For data scope tenant selector, the `/tenants` endpoint can be queried via `useApiQuery('/tenants')` directly.

---

## 8. Auth Context & Current User

### AuthProvider
**File:** `apps/web/src/providers/auth-provider.tsx`

Provides `useAuth()` hook returning:
```typescript
interface AuthContextValue {
  user: User | null          // Current authenticated user (has .id, .email, .role, etc.)
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  logout: () => Promise<void>
  refetch: () => Promise<void>
}
```

### User Type
**File:** `apps/web/src/hooks/use-auth.ts`

```typescript
export type User = components['schemas']['User']
```

The `User` type includes `id`, `email`, `display_name`, `role`, and all data scope fields.

### Getting Current User ID
For self-deletion prevention:
```typescript
const { user } = useAuth()
const isSelf = user?.id === targetUser.id
```

This is already used in the existing users page:
```typescript
const { isLoading: authLoading } = useAuth()
```

### Permission Check
**File:** `apps/web/src/hooks/use-has-permission.ts`

```typescript
const { allowed: canManageUsers } = useHasPermission(['users.manage'])
```

### Role Check
**File:** `apps/web/src/hooks/use-has-role.ts`

```typescript
const { hasRole } = useHasRole()
const isAdmin = hasRole('admin')
```

---

## 9. Form Validation Patterns

### No Zod or react-hook-form
The codebase does **not** use zod, react-hook-form, or any form validation library. All validation is manual.

### Validation Pattern (from EmployeeFormSheet)
```typescript
function validateForm(form: FormState, isEdit: boolean): string[] {
  const errorKeys: string[] = []
  if (!isEdit) {
    if (!form.personnelNumber.trim()) {
      errorKeys.push('validationPersonnelNumberRequired')
    }
  }
  if (!form.firstName.trim()) {
    errorKeys.push('validationFirstNameRequired')
  }
  if (form.email && !form.email.includes('@')) {
    errorKeys.push('validationInvalidEmail')
  }
  return errorKeys
}

// In handleSubmit:
const errorKeys = validateForm(form, isEdit)
if (errorKeys.length > 0) {
  setError(errorKeys.map((key) => t(key as Parameters<typeof t>[0])).join('. '))
  return
}
```

### Validation Pattern (from UserGroupFormSheet)
```typescript
const errors: string[] = []
if (!form.name.trim()) errors.push(t('validationNameRequired'))
else if (form.name.trim().length > 255) errors.push(t('validationNameMaxLength'))
if (!isEdit) {
  if (!form.code.trim()) errors.push(t('validationCodeRequired'))
}
if (errors.length > 0) {
  setError(errors.join('. '))
  return
}
```

### API Error Handling Pattern
```typescript
} catch (err) {
  const apiError = err as { detail?: string; message?: string }
  setError(apiError.detail ?? apiError.message ?? (isEdit ? t('failedUpdate') : t('failedCreate')))
}
```

---

## 10. Translation Patterns

### File Structure
Translations are in single JSON files per locale:
- `apps/web/messages/en.json`
- `apps/web/messages/de.json`

### Namespace Convention
Each admin page uses a namespace like `adminUsers`, `adminUserGroups`, `adminDepartments`, `adminEmployees`.

### Current adminUsers Keys
```json
"adminUsers": {
  "title": "Users",
  "subtitle": "Assign users to permission groups",
  "searchPlaceholder": "Search users...",
  "failedUpdate": "Failed to update user",
  "adminGroupBadge": "Admin group",
  "selectGroup": "Select group",
  "noGroup": "No group",
  "systemGroupHint": "System group is protected",
  "saving": "Saving...",
  "emptyTitle": "No users found",
  "emptyFilterHint": "Try adjusting your search",
  "emptyGetStarted": "Users will appear here once created"
}
```

### Translation Usage Pattern
```typescript
const t = useTranslations('adminUsers')
const tCommon = useTranslations('common')
```

### Common Translation Keys Available
```json
"common": {
  "save", "cancel", "delete", "edit", "create", "loading",
  "retry", "error", "search", "noResults", "confirm", "close",
  "back", "next", "yes", "no", "all", "actions", "details",
  "status", "description", "name", "active", "inactive", "more", "clear"
}
```

### Parameterized Translations
```typescript
t('deleteDescription', { name: deleteGroup.name })
t('groupsCount', { count: filteredGroups.length })
```

---

## 11. Key Files Reference List

### Files to Modify
| File | Purpose |
|------|---------|
| `apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx` | Add create button, row actions, integrate form sheet/delete dialog/password dialog |
| `apps/web/src/hooks/api/use-users.ts` | Add `useCreateUser`, `useDeleteUser`, `useChangeUserPassword` |
| `apps/web/src/hooks/api/index.ts` | Export new hooks |
| `apps/web/messages/en.json` | Extend `adminUsers` namespace with form/delete/password keys |
| `apps/web/messages/de.json` | Extend `adminUsers` namespace (German translations) |

### Files to Create
| File | Purpose |
|------|---------|
| `apps/web/src/components/users/user-form-sheet.tsx` | Create/edit user sheet form |
| `apps/web/src/components/users/user-delete-dialog.tsx` | Delete user confirmation dialog |
| `apps/web/src/components/users/change-password-dialog.tsx` | Change password dialog |
| `apps/web/src/components/users/index.ts` | Component barrel export |

### Key Reference Files (patterns to follow)
| File | Pattern |
|------|---------|
| `apps/web/src/components/user-groups/user-group-form-sheet.tsx` | Form sheet with sections, switches, validation |
| `apps/web/src/components/employees/employee-form-sheet.tsx` | Form sheet with Select dropdowns for reference data |
| `apps/web/src/components/ui/confirm-dialog.tsx` | Reusable confirmation dialog |
| `apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx` | Dedicated delete dialog component |
| `apps/web/src/app/[locale]/(dashboard)/admin/user-groups/page.tsx` | Admin page with create button, form sheet, delete dialog, row actions |
| `apps/web/src/components/departments/department-data-table.tsx` | Data table with DropdownMenu row actions |
| `apps/web/src/providers/auth-provider.tsx` | Auth context with current user |
| `apps/web/src/hooks/api/use-user-groups.ts` | CRUD hook pattern with invalidateKeys |
| `apps/web/src/hooks/api/use-api-mutation.ts` | Core mutation hook (type-safe, auto-invalidation) |

### API & Backend Reference
| File | Purpose |
|------|---------|
| `api/paths/users.yaml` | OpenAPI endpoint definitions |
| `api/schemas/users.yaml` | Request/response schemas (CreateUserRequest, UpdateUserRequest, ChangePasswordRequest) |
| `apps/api/internal/handler/user.go` | Backend handler (Create, Delete, ChangePassword) |
| `apps/api/internal/service/user.go` | Business logic (self-delete prevention, password change logic) |
| `apps/api/internal/model/user.go` | User model with DataScopeType |
| `apps/api/internal/access/scope.go` | Scope application logic |
| `apps/api/internal/handler/routes.go` | Route registration with permission middleware |

### UI Component Reference
| File | Purpose |
|------|---------|
| `apps/web/src/components/ui/confirm-dialog.tsx` | Reusable ConfirmDialog |
| `apps/web/src/components/ui/switch.tsx` | Switch toggle component |
| `apps/web/src/components/ui/tooltip.tsx` | Tooltip component (for disabled button hints) |
| `apps/web/src/components/ui/sheet.tsx` | Sheet component (used for form sheets) |

### Notable Findings
- No `Collapsible` UI component exists -- data scope section will need to use a different pattern (e.g., conditional rendering with a toggle button, similar to the permission category expand/collapse in `user-group-form-sheet.tsx`)
- No `MultiSelect` UI component exists -- data scope ID selectors may need to use checkboxes in a scrollable list, or a custom multi-select built from existing primitives
- No toast library is used -- success feedback is handled implicitly via mutation invalidation and sheet closing
- The `role` field on User is derived from the user group (`is_admin` on group sets role to "admin") -- the backend sets this automatically when user_group_id is changed. The ticket mentions a "role select" but the backend derives role from group assignment.
- The backend's `CreateUserRequest` does not have a `role` field -- role is set based on user group's `is_admin` flag.
- The existing users page uses a simple div-based list, not a Table/DataTable component. The ticket doesn't require converting to DataTable, but row actions will need to be added to each user row.
