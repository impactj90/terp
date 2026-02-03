# ZMI-TICKET-047: Complete User Management UI

Status: Proposed
Priority: P2
Owner: TBD
Backend tickets: ZMI-TICKET-003

## Goal
Complete the existing users admin page by adding create user form, delete user confirmation, and change password dialog functionality.

## Scope
- In scope: Create user form sheet, delete user dialog, change password dialog, data scope configuration in user form.
- Out of scope: User group CRUD (existing separate page), SSO integration UI, profile picture upload.

## Requirements

### Pages & routes
- **Extend existing page**: `apps/web/src/app/[locale]/(dashboard)/admin/users/page.tsx`
  - No new route — extends existing `/admin/users` page
  - Add "Create User" button to toolbar
  - Add delete and change password to row actions

### Components
- `apps/web/src/components/users/user-form-sheet.tsx`
  - Sheet form for creating and editing users
  - Fields:
    - Email (email input, required for create)
    - Username (text input, optional)
    - Display Name (text input, required, min 2, max 255)
    - Password (password input, required for create only — with visibility toggle)
    - Role (select: user | admin)
    - User Group (select from useUserGroups hook, optional)
    - Employee Link (select from useEmployees hook, optional — links user to employee record)
    - Active (switch, default true)
    - Locked (switch, default false)
    - Data Scope section (collapsible):
      - Scope Type (select: all | tenant | department | employee)
      - Scope IDs (multi-select, changes based on type: tenants/departments/employees)
  - Validation: email format, display_name min 2 chars, password required on create
  - Uses POST `/users` for create, PATCH `/users/{id}` for edit
- `apps/web/src/components/users/user-delete-dialog.tsx`
  - Confirmation dialog: "Permanently delete user '{display_name}' ({email})?"
  - Warning text: "This action cannot be undone. The user will lose all access."
  - Self-delete prevention: disable if deleting the current logged-in user
  - Uses DELETE `/users/{id}`
- `apps/web/src/components/users/change-password-dialog.tsx`
  - Dialog for changing a user's password
  - Fields:
    - Current Password (required only if user is changing their own password)
    - New Password (password input, required, with strength indicator)
    - Confirm Password (must match new password)
  - Uses POST `/users/{id}/password`, body: `{ current_password?, new_password }`
  - Admin changing another user's password: current_password not required
  - User changing own password: current_password required

### API hooks
- `apps/web/src/hooks/api/use-users.ts` (extend existing)
  - Add `useCreateUser()` — POST `/users`, body: `{ email, display_name, password?, username?, role?, user_group_id?, employee_id?, is_active?, is_locked?, data_scope_type?, data_scope_*_ids? }`, invalidates `[['/users']]`
  - Add `useDeleteUser()` — DELETE `/users/{id}`, invalidates `[['/users']]`
  - Add `useChangeUserPassword()` — POST `/users/{id}/password`, body: `{ current_password?, new_password }`

### UI behavior
- Create user: on success, close form sheet, show success toast, refresh user list
- Email uniqueness: if backend returns 400/409 for duplicate email, show inline form error
- Data scope configuration: scope type selection dynamically shows the relevant ID multi-select (tenants for "tenant", departments for "department", employees for "employee", none for "all")
- Delete: cannot delete self (button disabled with tooltip explaining why)
- Change password: admin path skips current_password; self path requires it
- Password strength: visual indicator (weak/medium/strong) based on length and character variety
- Locked users: show lock icon in table, locked users cannot log in
- Active/inactive: deactivated users shown with muted styling in table

### Navigation & translations
- No new sidebar entry (extends existing users page)
- Translation namespace: `users` (extend existing)
  - New key groups: `form.*` (create/edit fields), `delete.*`, `password.*`, `data-scope.*`

## Acceptance criteria
- Admin can create a new user with email, display name, password, role, and optional data scope
- Admin can edit existing user details (except email on edit)
- Admin can delete a user with confirmation (cannot delete self)
- Admin can change any user's password (without current password)
- User can change their own password (requires current password)
- Data scope type dynamically shows relevant scope ID selector
- Password strength indicator provides visual feedback

## Tests

### Component tests
- Create form validates required fields (email, display_name, password)
- Edit form pre-fills existing user data
- Data scope type change updates visible scope ID selectors
- Delete dialog prevents self-deletion
- Change password validates new password matches confirmation
- Admin password change omits current_password field

### Integration tests
- Create user, verify appears in user list
- Edit user display name, verify update persists
- Delete user, verify removed from list
- Change own password with correct current password
- Change another user's password as admin
- Attempt to create user with duplicate email, verify error handling

## Test case pack
1) Create user with full details
   - Input: email "new@example.com", display name "New User", password "securePass123!", role "user", data_scope_type "department"
   - Expected: User created, appears in list with role badge
2) Delete user
   - Input: Click delete on user, confirm
   - Expected: User removed from list
3) Cannot delete self
   - Input: Attempt to delete the currently logged-in user
   - Expected: Delete button disabled with tooltip "Cannot delete your own account"
4) Change own password
   - Input: Enter current password, new password, confirm password
   - Expected: Password changed, current_password validated
5) Admin reset password
   - Input: Admin changes another user's password without current password
   - Expected: Password reset successfully, no current_password required
6) Data scope configuration
   - Input: Set scope type to "department", select 2 departments
   - Expected: data_scope_type = "department", data_scope_department_ids contains 2 IDs

## Dependencies
- ZMI-TICKET-003 (User Management backend)
- User Groups API (for user group selector)
- Employees API (for employee link selector)
- Departments API (for data scope department selector)
