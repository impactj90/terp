# Complete User Management UI Implementation Plan

## Overview

Complete the existing `/admin/users` page by adding create user form, edit user form, delete user dialog, and change password dialog. This extends the current page which only supports changing a user's group assignment via inline Select dropdowns.

## Current State Analysis

**Existing page** (`apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx`):
- Simple div-based list layout (not a data table)
- Only supports changing user group via inline Select
- No create button, no row actions, no form sheet, no delete dialog, no password dialog
- Uses `useUsers`, `useUpdateUser`, `useUserGroups` hooks
- Permission guard: `useHasPermission(['users.manage'])`
- Translation namespace: `adminUsers`

**Existing hooks** (`apps/web/src/hooks/api/use-users.ts`):
- Only contains `useUsers()` query hook
- Missing: `useCreateUser`, `useDeleteUser`, `useChangeUserPassword`

**Backend API**: All endpoints exist and are functional:
- `POST /users` (create), `DELETE /users/{id}` (delete), `POST /users/{id}/password` (change password)
- Backend prevents self-deletion and enforces current_password for non-admin self password changes

## Desired End State

After implementation, the admin users page will support:
1. Creating new users with all fields including data scope configuration
2. Editing existing users (all fields except email)
3. Deleting users with confirmation (self-deletion prevented)
4. Changing user passwords (admin path and self path)
5. Row actions per user via DropdownMenu (edit, change password, delete)
6. "Create User" button in toolbar

### How to Verify
- `cd apps/web && npx next build` completes without errors
- Admin can create, edit, delete users and change passwords through the UI
- Self-deletion shows disabled delete option with tooltip
- Data scope type selector dynamically shows relevant scope ID checkboxes

### Key Discoveries
- **No role field in API**: The `CreateUserRequest` and `UpdateUserRequest` schemas do NOT contain a `role` field. Role is derived server-side from the user group's `is_admin` flag. The ticket mentions "Role (select: user | admin)" but this is controlled implicitly via user group assignment. We will skip the role selector.
- **No MultiSelect component**: Data scope ID selectors will use Checkbox lists in scrollable areas, following the permission checkbox pattern from `user-group-form-sheet.tsx`.
- **No Collapsible component**: Data scope section will use conditional rendering with a ChevronDown/ChevronUp toggle button.
- **No toast library**: Success feedback is implicit via mutation invalidation and sheet/dialog closing.
- **ConfirmDialog uses Sheet**: The project uses Sheet (side="bottom") for confirmation dialogs, not AlertDialog.
- **Tenants query**: No dedicated `use-tenants.ts` hook exists. Use `useApiQuery('/tenants')` directly for the data scope tenant selector.

## What We're NOT Doing

- **SSO integration UI** -- out of scope per ticket
- **Profile picture upload** -- out of scope per ticket
- **User group CRUD** -- already exists on separate page
- **Converting to DataTable** -- page stays as div-based list; we add DropdownMenu inline
- **Role selector field** -- role is derived from user group; no backend support for setting role directly
- **New routing** -- extends existing `/admin/users` page only

## Implementation Approach

Follow established codebase patterns:
- Form sheets: Manual `React.useState<FormState>` + `React.useEffect` reset (like `user-group-form-sheet.tsx`)
- Delete dialog: Inline `ConfirmDialog` usage in page (like `user-groups/page.tsx`)
- Password dialog: Dedicated component using Sheet with side="bottom"
- Row actions: `DropdownMenu` per user row (like `employee-data-table.tsx`)
- Hooks: `useApiMutation` with `invalidateKeys` (like `use-user-groups.ts`)
- Validation: Inline manual validation, no form libraries (like `employee-form-sheet.tsx`)

---

## Phase 1: API Hooks

### Overview
Add `useCreateUser`, `useDeleteUser`, and `useChangeUserPassword` mutation hooks to the existing `use-users.ts` file, and export them from the hooks barrel.

### Changes Required

#### 1. Extend use-users.ts
**File**: `apps/web/src/hooks/api/use-users.ts`
**Changes**: Add three mutation hooks following the `use-user-groups.ts` pattern.

```typescript
import { useApiQuery, useApiMutation } from '@/hooks'

interface UseUsersOptions {
  limit?: number
  search?: string
  enabled?: boolean
}

export function useUsers(options: UseUsersOptions = {}) {
  const { limit = 100, search, enabled = true } = options

  return useApiQuery('/users', {
    params: {
      limit,
      search: search || undefined,
    },
    enabled,
  })
}

export function useCreateUser() {
  return useApiMutation('/users', 'post', {
    invalidateKeys: [['/users']],
  })
}

export function useDeleteUser() {
  return useApiMutation('/users/{id}', 'delete', {
    invalidateKeys: [['/users']],
  })
}

export function useChangeUserPassword() {
  return useApiMutation('/users/{id}/password', 'post')
}
```

#### 2. Update hooks barrel export
**File**: `apps/web/src/hooks/api/index.ts`
**Changes**: Update the Users section to export new hooks from `use-users.ts`.

Replace:
```typescript
// Users
export { useUser, useUpdateUser } from './use-user'
export { useUsers } from './use-users'
```

With:
```typescript
// Users
export { useUser, useUpdateUser } from './use-user'
export { useUsers, useCreateUser, useDeleteUser, useChangeUserPassword } from './use-users'
```

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] No lint errors: `cd apps/web && npx next lint`
- [ ] Hooks are properly exported: verify `useCreateUser`, `useDeleteUser`, `useChangeUserPassword` are importable from `@/hooks/api`

---

## Phase 2: User Form Sheet

### Overview
Create the user create/edit form sheet component with all fields including data scope configuration. Follows the `user-group-form-sheet.tsx` pattern (manual state, sections, validation, Sheet side="right").

### Changes Required

#### 1. Create user-form-sheet.tsx
**File**: `apps/web/src/components/users/user-form-sheet.tsx`
**Pattern**: `apps/web/src/components/user-groups/user-group-form-sheet.tsx`

**Props interface:**
```typescript
interface UserFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: User | null
  onSuccess?: () => void
}
```

**FormState interface:**
```typescript
interface FormState {
  email: string
  username: string
  displayName: string
  password: string
  userGroupId: string
  employeeId: string
  isActive: boolean
  isLocked: boolean
  dataScopeType: string
  dataScopeTenantIds: string[]
  dataScopeDepartmentIds: string[]
  dataScopeEmployeeIds: string[]
}
```

**Initial state:**
```typescript
const INITIAL_STATE: FormState = {
  email: '',
  username: '',
  displayName: '',
  password: '',
  userGroupId: '',
  employeeId: '',
  isActive: true,
  isLocked: false,
  dataScopeType: 'all',
  dataScopeTenantIds: [],
  dataScopeDepartmentIds: [],
  dataScopeEmployeeIds: [],
}
```

**Implementation details:**

1. **Mutations**: Use `useCreateUser()` and `useUpdateUser()` (from `use-user.ts` for update, `use-users.ts` for create).

2. **Reference data (loaded conditionally with `enabled: open`)**:
   - `useUserGroups({ enabled: open })` -- for user group selector
   - `useEmployees({ limit: 100, enabled: open })` -- for employee link selector
   - `useApiQuery('/tenants', { enabled: open && form.dataScopeType === 'tenant' })` -- for tenant scope IDs
   - `useDepartments({ enabled: open && form.dataScopeType === 'department' })` -- for department scope IDs
   - `useEmployees({ limit: 100, enabled: open && form.dataScopeType === 'employee' })` -- reuse for employee scope IDs

3. **Reset effect**: `React.useEffect` on `[open, user]` -- populate form from user if editing, reset to INITIAL_STATE if creating.

4. **Validation function** (extracted, following employee-form-sheet pattern):
   ```typescript
   function validateForm(form: FormState, isEdit: boolean): string[] {
     const errorKeys: string[] = []
     if (!isEdit && !form.email.trim()) errorKeys.push('validationEmailRequired')
     if (!isEdit && form.email && !form.email.includes('@')) errorKeys.push('validationEmailInvalid')
     if (!form.displayName.trim()) errorKeys.push('validationDisplayNameRequired')
     if (form.displayName.trim().length < 2) errorKeys.push('validationDisplayNameMinLength')
     if (form.displayName.trim().length > 255) errorKeys.push('validationDisplayNameMaxLength')
     if (!isEdit && !form.password.trim()) errorKeys.push('validationPasswordRequired')
     if (form.password && form.password.length < 8) errorKeys.push('validationPasswordMinLength')
     return errorKeys
   }
   ```

5. **handleSubmit**: Create calls `createMutation.mutateAsync({ body: {...} })`, edit calls `updateMutation.mutateAsync({ path: { id: user.id }, body: {...} })`. On success calls `onSuccess?.()`. On error sets error string (API error pattern).

6. **Form sections** (using `<h3 className="text-sm font-medium text-muted-foreground">` headers):

   **Section: Account Information**
   - Email (Input, type="email", required on create, disabled on edit with hint "cannotBeChanged")
   - Username (Input, optional)
   - Display Name (Input, required, min 2, max 255)
   - Password (Input, type="password" with Eye/EyeOff visibility toggle, required on create only, not shown on edit)

   **Section: Assignment**
   - User Group (Select with `'__none__'` sentinel, from `useUserGroups`)
   - Employee Link (Select with `'__none__'` sentinel, from `useEmployees`, shows `personnel_number - first_name last_name`)

   **Section: Status** (only shown on edit, following user-group-form-sheet pattern)
   - Active (Switch in bordered row, default true)
   - Locked (Switch in bordered row, default false)

   **Section: Data Scope** (collapsible via ChevronDown/ChevronUp toggle)
   - Scope Type (Select: all | tenant | department | employee)
   - Scope IDs (conditional, shown only when type is not "all"):
     - For "tenant": Checkbox list of tenants (scrollable, like permission checkboxes in user-group-form-sheet)
     - For "department": Checkbox list of departments
     - For "employee": Checkbox list of employees (shows personnel_number + name)

7. **Sheet layout**: `Sheet > SheetContent(side="right", className="w-full sm:max-w-2xl flex h-full flex-col") > SheetHeader > ScrollArea > SheetFooter`

8. **Footer**: Cancel (outline) + Submit (primary), both `flex-1`, `flex-row gap-2 border-t pt-4`, Loader2 spinner when submitting.

9. **Password visibility toggle**: Use a small Button (variant="ghost", size="icon-sm") with Eye/EyeOff icon inside the password Input's container. Toggle between `type="password"` and `type="text"`.

**Key imports:**
```typescript
import { ChevronDown, ChevronUp, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useApiQuery } from '@/hooks'
import {
  useCreateUser,
  useUpdateUser,
  useUserGroups,
  useEmployees,
  useDepartments,
} from '@/hooks/api'
```

#### 2. Create barrel export
**File**: `apps/web/src/components/users/index.ts`

```typescript
export { UserFormSheet } from './user-form-sheet'
export { UserDeleteDialog } from './user-delete-dialog'
export { ChangePasswordDialog } from './change-password-dialog'
```

Note: Create this file now with only `UserFormSheet`, then add the other exports in subsequent phases.

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] No lint errors: `cd apps/web && npx next lint`
- [ ] Component file exists at `apps/web/src/components/users/user-form-sheet.tsx`

#### Manual Verification:
- [ ] Form sheet opens for create (empty fields) and edit (pre-filled fields)
- [ ] Validation errors display for missing required fields
- [ ] Data scope section toggles open/closed
- [ ] Scope type selector dynamically shows relevant checkboxes
- [ ] Password visibility toggle works
- [ ] Email field disabled with hint on edit mode

---

## Phase 3: Delete User Dialog

### Overview
Create a dedicated delete dialog component that wraps `ConfirmDialog` with self-deletion prevention logic.

### Changes Required

#### 1. Create user-delete-dialog.tsx
**File**: `apps/web/src/components/users/user-delete-dialog.tsx`
**Pattern**: `apps/web/src/components/employees/tariff-assignments/tariff-assignment-delete-dialog.tsx` (dedicated dialog wrapping ConfirmDialog)

```typescript
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useDeleteUser } from '@/hooks/api'
import type { components } from '@/lib/api/types'

type User = components['schemas']['User']

interface UserDeleteDialogProps {
  user: User | null
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

export function UserDeleteDialog({ user, onOpenChange, onSuccess }: UserDeleteDialogProps) {
  const t = useTranslations('adminUsers')
  const tCommon = useTranslations('common')
  const deleteMutation = useDeleteUser()

  const handleConfirm = async () => {
    if (!user) return
    try {
      await deleteMutation.mutateAsync({ path: { id: user.id } })
      onSuccess?.()
      onOpenChange(false)
    } catch {
      // error handled by mutation
    }
  }

  return (
    <ConfirmDialog
      open={!!user}
      onOpenChange={onOpenChange}
      title={t('deleteUser')}
      description={user ? t('deleteDescription', { name: user.display_name, email: user.email }) : ''}
      confirmLabel={tCommon('delete')}
      cancelLabel={tCommon('cancel')}
      variant="destructive"
      isLoading={deleteMutation.isPending}
      onConfirm={handleConfirm}
    />
  )
}
```

**Key behavior:**
- `open` is derived from `!!user` (null means closed)
- Self-delete prevention is handled at the PAGE level (delete option disabled in DropdownMenu when `user.id === currentUser.id`), not inside this component
- On success: calls `onSuccess?.()` then closes via `onOpenChange(false)`
- Error handling: ConfirmDialog stays open on error so user can retry

#### 2. Update barrel export
**File**: `apps/web/src/components/users/index.ts`
**Changes**: Add `UserDeleteDialog` export (if not already included in Phase 2).

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Component file exists at `apps/web/src/components/users/user-delete-dialog.tsx`

---

## Phase 4: Change Password Dialog

### Overview
Create a dialog for changing a user's password, with conditional current password field (required for self, hidden for admin changing another user).

### Changes Required

#### 1. Create change-password-dialog.tsx
**File**: `apps/web/src/components/users/change-password-dialog.tsx`
**Pattern**: Hybrid of `confirm-dialog.tsx` (Sheet side="bottom") and `user-group-form-sheet.tsx` (form state, validation, error handling)

**Props interface:**
```typescript
interface ChangePasswordDialogProps {
  user: User | null
  isSelf: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}
```

**FormState:**
```typescript
interface PasswordFormState {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}
```

**Implementation details:**

1. **Layout**: Sheet with `side="bottom"`, `className="sm:max-w-lg sm:mx-auto sm:rounded-t-lg"` (following ConfirmDialog pattern but wider for form fields).

2. **Fields:**
   - Current Password (Input type="password", only shown when `isSelf === true`)
   - New Password (Input type="password", always shown, with password strength indicator below)
   - Confirm Password (Input type="password", always shown)
   - All password fields have Eye/EyeOff visibility toggle

3. **Password strength indicator**: Simple inline component below new password field:
   ```typescript
   function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
     if (!password || password.length < 8) return 'weak'
     const hasLower = /[a-z]/.test(password)
     const hasUpper = /[A-Z]/.test(password)
     const hasDigit = /[0-9]/.test(password)
     const hasSpecial = /[^a-zA-Z0-9]/.test(password)
     const typeCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length
     if (password.length >= 12 && typeCount >= 3) return 'strong'
     if (password.length >= 8 && typeCount >= 2) return 'medium'
     return 'weak'
   }
   ```
   Visual: Three colored bar segments + text label. Colors:
   - weak: `bg-destructive` (1 bar lit)
   - medium: `bg-yellow-500` (2 bars lit)
   - strong: `bg-green-500` (3 bars lit)

4. **Validation:**
   ```typescript
   const errors: string[] = []
   if (isSelf && !form.currentPassword.trim()) errors.push(t('validationCurrentPasswordRequired'))
   if (!form.newPassword.trim()) errors.push(t('validationNewPasswordRequired'))
   if (form.newPassword.length < 8) errors.push(t('validationPasswordMinLength'))
   if (form.newPassword !== form.confirmPassword) errors.push(t('validationPasswordMismatch'))
   ```

5. **Submit**: Calls `changePasswordMutation.mutateAsync({ path: { id: user.id }, body: { current_password: isSelf ? form.currentPassword : undefined, new_password: form.newPassword } })`. On success calls `onSuccess?.()` and `onOpenChange(false)`.

6. **Reset**: `React.useEffect` on `[open/user]` resets form state when dialog opens.

7. **Header**: Shows "Change Password" title with user's display name in description.

8. **Footer**: Cancel (outline) + Submit (primary), both `flex-1`, following ConfirmDialog pattern.

#### 2. Update barrel export
**File**: `apps/web/src/components/users/index.ts`
**Changes**: Add `ChangePasswordDialog` export.

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Component file exists at `apps/web/src/components/users/change-password-dialog.tsx`

#### Manual Verification:
- [ ] Dialog shows current password field only for self
- [ ] Dialog hides current password field when admin changes another user's password
- [ ] Password strength indicator updates in real-time
- [ ] Confirm password mismatch shows error
- [ ] Successful password change closes dialog

---

## Phase 5: Page Integration

### Overview
Wire all new components into the existing users page: add "Create User" button, DropdownMenu row actions (edit, change password, delete), and integrate form sheet, delete dialog, and change password dialog.

### Changes Required

#### 1. Update users page
**File**: `apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx`
**Pattern**: `apps/web/src/app/[locale]/(dashboard)/admin/user-groups/page.tsx` (Create button + form sheet + delete dialog integration)

**New state variables:**
```typescript
const [createOpen, setCreateOpen] = React.useState(false)
const [editUser, setEditUser] = React.useState<User | null>(null)
const [deleteUser, setDeleteUser] = React.useState<User | null>(null)
const [passwordUser, setPasswordUser] = React.useState<User | null>(null)
```

**Auth context** (for self-detection):
```typescript
const { user: currentUser, isLoading: authLoading } = useAuth()
```

**New imports:**
```typescript
import { Edit, Key, Lock, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { UserFormSheet, UserDeleteDialog, ChangePasswordDialog } from '@/components/users'
import { useCreateUser, useDeleteUser, useChangeUserPassword } from '@/hooks/api'
```

**Changes to header area** -- add Create User button:
```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
    <p className="text-muted-foreground">{t('subtitle')}</p>
  </div>
  <Button onClick={() => setCreateOpen(true)}>
    <Plus className="mr-2 h-4 w-4" />
    {t('newUser')}
  </Button>
</div>
```

**Changes to user row** -- add status indicators and DropdownMenu:

Each user row gets:
1. **Lock icon** next to name if `user.is_locked` (small lock icon before display_name)
2. **Muted styling** if `!user.is_active` (add `opacity-60` class)
3. **DropdownMenu** at the end of the row:

```tsx
<div className="flex items-center gap-2">
  {/* Keep existing group selector */}
  <div className="w-full sm:w-64">
    {/* existing Select for group */}
  </div>

  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm">
        <MoreHorizontal className="h-4 w-4" />
        <span className="sr-only">{tCommon('actions')}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onClick={() => setEditUser(user)}>
        <Edit className="mr-2 h-4 w-4" />
        {tCommon('edit')}
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setPasswordUser(user)}>
        <Key className="mr-2 h-4 w-4" />
        {t('changePassword')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      {currentUser?.id === user.id ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuItem disabled>
                <Trash2 className="mr-2 h-4 w-4" />
                {tCommon('delete')}
              </DropdownMenuItem>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('cannotDeleteSelf')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <DropdownMenuItem variant="destructive" onClick={() => setDeleteUser(user)}>
          <Trash2 className="mr-2 h-4 w-4" />
          {tCommon('delete')}
        </DropdownMenuItem>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
</div>
```

**Add component instances at end of JSX** (before closing `</div>`):
```tsx
<UserFormSheet
  open={createOpen || !!editUser}
  onOpenChange={(open) => {
    if (!open) {
      setCreateOpen(false)
      setEditUser(null)
    }
  }}
  user={editUser}
  onSuccess={() => {
    setCreateOpen(false)
    setEditUser(null)
  }}
/>

<UserDeleteDialog
  user={deleteUser}
  onOpenChange={(open) => { if (!open) setDeleteUser(null) }}
  onSuccess={() => setDeleteUser(null)}
/>

<ChangePasswordDialog
  user={passwordUser}
  isSelf={!!passwordUser && currentUser?.id === passwordUser.id}
  onOpenChange={(open) => { if (!open) setPasswordUser(null) }}
  onSuccess={() => setPasswordUser(null)}
/>
```

**Cleanup**: Remove the inline `error` state and `handleGroupChange` error display since the form sheet handles its own errors. Keep the group change inline error for the group selector that stays on the page.

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] No lint errors: `cd apps/web && npx next lint`
- [ ] Build succeeds: `cd apps/web && npx next build`

#### Manual Verification:
- [ ] "Create User" button visible in toolbar
- [ ] Click opens form sheet in create mode
- [ ] Row actions menu (three dots) appears for each user
- [ ] Edit opens form sheet pre-filled with user data
- [ ] Delete opens confirmation dialog (disabled for self with tooltip)
- [ ] Change password opens password dialog
- [ ] Lock icon shown for locked users
- [ ] Inactive users shown with muted styling

---

## Phase 6: Translations

### Overview
Add all new translation keys to both English and German translation files under the `adminUsers` namespace.

### Changes Required

#### 1. English translations
**File**: `apps/web/messages/en.json`
**Changes**: Extend `adminUsers` namespace.

Replace the existing `adminUsers` block with:
```json
"adminUsers": {
  "title": "Users",
  "subtitle": "Manage user accounts and permissions",
  "searchPlaceholder": "Search users...",
  "failedUpdate": "Failed to update user",
  "adminGroupBadge": "Admin group",
  "selectGroup": "Select group",
  "noGroup": "No group",
  "systemGroupHint": "System group is protected",
  "saving": "Saving...",
  "emptyTitle": "No users found",
  "emptyFilterHint": "Try adjusting your search",
  "emptyGetStarted": "Users will appear here once created",

  "newUser": "New User",
  "editUser": "Edit User",
  "createUser": "Create User",
  "saveChanges": "Save Changes",
  "createDescription": "Create a new user account",
  "editDescription": "Update user account details",
  "changePassword": "Change Password",
  "cannotDeleteSelf": "Cannot delete your own account",
  "deleteUser": "Delete User",
  "deleteDescription": "Permanently delete user \"{name}\" ({email})? This action cannot be undone. The user will lose all access.",
  "failedCreate": "Failed to create user",
  "lockedBadge": "Locked",
  "inactiveHint": "Inactive",

  "sectionAccount": "Account Information",
  "sectionAssignment": "Assignment",
  "sectionStatus": "Status",
  "sectionDataScope": "Data Scope",

  "fieldEmail": "Email",
  "fieldUsername": "Username",
  "fieldDisplayName": "Display Name",
  "fieldPassword": "Password",
  "fieldUserGroup": "User Group",
  "fieldEmployeeLink": "Employee Link",
  "fieldActive": "Active",
  "fieldActiveDescription": "Inactive users cannot log in",
  "fieldLocked": "Locked",
  "fieldLockedDescription": "Locked users are temporarily prevented from logging in",
  "fieldDataScopeType": "Scope Type",
  "fieldDataScopeIds": "Scope Entities",

  "placeholderEmail": "user@example.com",
  "placeholderUsername": "jdoe",
  "placeholderDisplayName": "John Doe",
  "placeholderPassword": "Minimum 8 characters",
  "selectUserGroup": "Select user group",
  "selectEmployee": "Select employee",
  "selectScopeType": "Select scope type",
  "noUserGroup": "No group",
  "noEmployee": "No employee link",

  "scopeAll": "All (no restrictions)",
  "scopeTenant": "Tenant",
  "scopeDepartment": "Department",
  "scopeEmployee": "Employee",
  "scopeHint": "Restrict which data this user can access",
  "scopeIdsHint": "Select the entities this user can access",
  "showDataScope": "Configure data scope",
  "hideDataScope": "Hide data scope",

  "emailCannotBeChanged": "Email cannot be changed after creation",

  "validationEmailRequired": "Email is required",
  "validationEmailInvalid": "Please enter a valid email address",
  "validationDisplayNameRequired": "Display name is required",
  "validationDisplayNameMinLength": "Display name must be at least 2 characters",
  "validationDisplayNameMaxLength": "Display name must not exceed 255 characters",
  "validationPasswordRequired": "Password is required for new users",
  "validationPasswordMinLength": "Password must be at least 8 characters",

  "passwordTitle": "Change Password",
  "passwordDescription": "Change password for {name}",
  "passwordDescriptionSelf": "Change your password",
  "fieldCurrentPassword": "Current Password",
  "fieldNewPassword": "New Password",
  "fieldConfirmPassword": "Confirm Password",
  "placeholderCurrentPassword": "Enter your current password",
  "placeholderNewPassword": "Enter new password",
  "placeholderConfirmPassword": "Re-enter new password",
  "validationCurrentPasswordRequired": "Current password is required",
  "validationNewPasswordRequired": "New password is required",
  "validationPasswordMismatch": "Passwords do not match",
  "passwordChangeSuccess": "Password changed successfully",
  "failedPasswordChange": "Failed to change password",
  "changePasswordButton": "Change Password",

  "strengthWeak": "Weak",
  "strengthMedium": "Medium",
  "strengthStrong": "Strong"
}
```

#### 2. German translations
**File**: `apps/web/messages/de.json`
**Changes**: Extend `adminUsers` namespace with German equivalents.

Replace the existing `adminUsers` block with:
```json
"adminUsers": {
  "title": "Benutzer",
  "subtitle": "Benutzerkonten und Berechtigungen verwalten",
  "searchPlaceholder": "Benutzer suchen...",
  "failedUpdate": "Benutzer konnte nicht aktualisiert werden",
  "adminGroupBadge": "Admin-Gruppe",
  "selectGroup": "Gruppe auswählen",
  "noGroup": "Keine Gruppe",
  "systemGroupHint": "Systemgruppe ist geschützt",
  "saving": "Speichern...",
  "emptyTitle": "Keine Benutzer gefunden",
  "emptyFilterHint": "Versuchen Sie, Ihre Suche anzupassen",
  "emptyGetStarted": "Benutzer erscheinen hier, sobald sie erstellt wurden",

  "newUser": "Neuer Benutzer",
  "editUser": "Benutzer bearbeiten",
  "createUser": "Benutzer erstellen",
  "saveChanges": "Änderungen speichern",
  "createDescription": "Neues Benutzerkonto erstellen",
  "editDescription": "Benutzerkonto-Details aktualisieren",
  "changePassword": "Passwort ändern",
  "cannotDeleteSelf": "Das eigene Konto kann nicht gelöscht werden",
  "deleteUser": "Benutzer löschen",
  "deleteDescription": "Benutzer \"{name}\" ({email}) dauerhaft löschen? Diese Aktion kann nicht rückgängig gemacht werden. Der Benutzer verliert den gesamten Zugang.",
  "failedCreate": "Benutzer konnte nicht erstellt werden",
  "lockedBadge": "Gesperrt",
  "inactiveHint": "Inaktiv",

  "sectionAccount": "Kontoinformationen",
  "sectionAssignment": "Zuordnung",
  "sectionStatus": "Status",
  "sectionDataScope": "Datenbereich",

  "fieldEmail": "E-Mail",
  "fieldUsername": "Benutzername",
  "fieldDisplayName": "Anzeigename",
  "fieldPassword": "Passwort",
  "fieldUserGroup": "Benutzergruppe",
  "fieldEmployeeLink": "Mitarbeiter-Verknüpfung",
  "fieldActive": "Aktiv",
  "fieldActiveDescription": "Inaktive Benutzer können sich nicht anmelden",
  "fieldLocked": "Gesperrt",
  "fieldLockedDescription": "Gesperrte Benutzer werden vorübergehend an der Anmeldung gehindert",
  "fieldDataScopeType": "Bereichstyp",
  "fieldDataScopeIds": "Bereichsentitäten",

  "placeholderEmail": "benutzer@beispiel.de",
  "placeholderUsername": "jmuster",
  "placeholderDisplayName": "Max Mustermann",
  "placeholderPassword": "Mindestens 8 Zeichen",
  "selectUserGroup": "Benutzergruppe auswählen",
  "selectEmployee": "Mitarbeiter auswählen",
  "selectScopeType": "Bereichstyp auswählen",
  "noUserGroup": "Keine Gruppe",
  "noEmployee": "Keine Mitarbeiter-Verknüpfung",

  "scopeAll": "Alle (keine Einschränkungen)",
  "scopeTenant": "Mandant",
  "scopeDepartment": "Abteilung",
  "scopeEmployee": "Mitarbeiter",
  "scopeHint": "Einschränken, auf welche Daten dieser Benutzer zugreifen kann",
  "scopeIdsHint": "Entitäten auswählen, auf die dieser Benutzer zugreifen kann",
  "showDataScope": "Datenbereich konfigurieren",
  "hideDataScope": "Datenbereich ausblenden",

  "emailCannotBeChanged": "E-Mail kann nach der Erstellung nicht geändert werden",

  "validationEmailRequired": "E-Mail ist erforderlich",
  "validationEmailInvalid": "Bitte geben Sie eine gültige E-Mail-Adresse ein",
  "validationDisplayNameRequired": "Anzeigename ist erforderlich",
  "validationDisplayNameMinLength": "Anzeigename muss mindestens 2 Zeichen lang sein",
  "validationDisplayNameMaxLength": "Anzeigename darf maximal 255 Zeichen lang sein",
  "validationPasswordRequired": "Passwort ist für neue Benutzer erforderlich",
  "validationPasswordMinLength": "Passwort muss mindestens 8 Zeichen lang sein",

  "passwordTitle": "Passwort ändern",
  "passwordDescription": "Passwort für {name} ändern",
  "passwordDescriptionSelf": "Eigenes Passwort ändern",
  "fieldCurrentPassword": "Aktuelles Passwort",
  "fieldNewPassword": "Neues Passwort",
  "fieldConfirmPassword": "Passwort bestätigen",
  "placeholderCurrentPassword": "Aktuelles Passwort eingeben",
  "placeholderNewPassword": "Neues Passwort eingeben",
  "placeholderConfirmPassword": "Neues Passwort erneut eingeben",
  "validationCurrentPasswordRequired": "Aktuelles Passwort ist erforderlich",
  "validationNewPasswordRequired": "Neues Passwort ist erforderlich",
  "validationPasswordMismatch": "Passwörter stimmen nicht überein",
  "passwordChangeSuccess": "Passwort erfolgreich geändert",
  "failedPasswordChange": "Passwort konnte nicht geändert werden",
  "changePasswordButton": "Passwort ändern",

  "strengthWeak": "Schwach",
  "strengthMedium": "Mittel",
  "strengthStrong": "Stark"
}
```

### Success Criteria

#### Automated Verification:
- [ ] Both JSON files are valid JSON: `node -e "JSON.parse(require('fs').readFileSync('apps/web/messages/en.json'))"` (and de.json)
- [ ] All referenced keys exist in both locales
- [ ] Build succeeds: `cd apps/web && npx next build`

---

## Phase 7: Verification

### Overview
Run full build, lint, and type checking to verify everything works together.

### Verification Steps

#### Automated Verification:
- [ ] TypeScript compiles: `cd apps/web && npx tsc --noEmit`
- [ ] Lint passes: `cd apps/web && npx next lint`
- [ ] Build succeeds: `cd apps/web && npx next build`

#### Manual Verification:
- [ ] Admin can create a new user with email, display name, password, and optional data scope
- [ ] Admin can edit existing user details (email field disabled on edit)
- [ ] Admin can delete a user with confirmation (cannot delete self -- delete option disabled with tooltip)
- [ ] Admin can change any user's password (without current password)
- [ ] User can change their own password (requires current password)
- [ ] Data scope type dynamically shows relevant scope ID checkboxes
- [ ] Password strength indicator provides visual feedback (weak/medium/strong)
- [ ] Lock icon shown for locked users in the list
- [ ] Inactive users shown with muted styling in the list
- [ ] All translations render correctly in English and German

---

## File Summary

### Files to Create
| File | Phase |
|------|-------|
| `apps/web/src/components/users/user-form-sheet.tsx` | Phase 2 |
| `apps/web/src/components/users/user-delete-dialog.tsx` | Phase 3 |
| `apps/web/src/components/users/change-password-dialog.tsx` | Phase 4 |
| `apps/web/src/components/users/index.ts` | Phase 2 |

### Files to Modify
| File | Phase |
|------|-------|
| `apps/web/src/hooks/api/use-users.ts` | Phase 1 |
| `apps/web/src/hooks/api/index.ts` | Phase 1 |
| `apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx` | Phase 5 |
| `apps/web/messages/en.json` | Phase 6 |
| `apps/web/messages/de.json` | Phase 6 |

### Key Reference Files
| File | Used for |
|------|----------|
| `apps/web/src/components/user-groups/user-group-form-sheet.tsx` | Form sheet pattern, sections, switches, validation, collapsible sections |
| `apps/web/src/components/employees/employee-form-sheet.tsx` | Select dropdowns for reference data, `__none__` sentinel |
| `apps/web/src/components/ui/confirm-dialog.tsx` | Delete dialog base component |
| `apps/web/src/app/[locale]/(dashboard)/admin/user-groups/page.tsx` | Page integration: create button, form sheet, delete dialog |
| `apps/web/src/components/employees/employee-data-table.tsx` | DropdownMenu row actions pattern |
| `apps/web/src/components/accounts/account-data-table.tsx` | Tooltip on disabled DropdownMenuItem |
| `apps/web/src/hooks/api/use-user-groups.ts` | CRUD hook pattern with invalidateKeys |

## References

- Ticket: `thoughts/shared/tickets/ZMI-TICKET-047-complete-user-management-ui.md`
- Research: `thoughts/shared/research/2026-02-03-ZMI-TICKET-047-complete-user-management-ui.md`
- OpenAPI spec: `api/paths/users.yaml`, `api/schemas/users.yaml`
