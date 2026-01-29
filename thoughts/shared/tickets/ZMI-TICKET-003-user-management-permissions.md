# ZMI-TICKET-003: User Management and Permissions Model

Status: Proposed
Priority: P1
Owner: TBD
Manual references: 3.3 User Management, 3.3.3 User Groups and module/tab permissions

## Goal
Implement ZMI-style user accounts, user groups, and granular permissions that control API access and data visibility.

## Scope
- In scope: Users, user groups, role permissions by module/tab/action, data access scoping, auditing, OpenAPI coverage.
- Out of scope: UI screens.

## Requirements
### Data model
- User fields:
  - Username (unique)
  - Display name
  - Password hash (or external auth mapping)
  - Optional Windows/SSO identifier
  - User group assignment
  - Associated employee (optional)
  - Active/locked flags
- User group fields:
  - Group name
  - Module permissions: read/write/delete per module
  - Tab permissions within modules (personnel tabs, booking overview tabs, system settings tabs, report types)
  - Function-level permissions for booking overview (e.g., change day plan, calculate day/month, delete bookings)
- Data access scopes per user:
  - All employees
  - Specific mandants only
  - Specific departments only
  - Specific employees only

### Business rules
- Users inherit permissions from assigned group.
- A user cannot access modules or tabs without explicit permission.
- If a module has no permission checkbox enabled, it is treated as hidden/unavailable.
- Data access filters must be applied to all relevant list endpoints.

### API / OpenAPI
- Endpoints:
  - CRUD users
  - CRUD user groups
  - Assign user to group
  - Change password
  - List effective permissions for current user
- OpenAPI must document permission scopes and any authorization errors.

## Acceptance criteria
- Permission checks enforce module/tab/action restrictions on API endpoints.
- Data access scope limits list results and detail access.
- Audit logs capture user identity for create/update/delete actions.
- OpenAPI describes all fields and permission-related responses.

## Tests
### Unit tests
- Permission evaluation matrix for module/tab/action combinations.
- Data scope filters: all employees vs specific mandants/departments/employees.
- Audit log payload includes user ID and action metadata.

### API tests
- Create user, assign group, verify effective permissions endpoint.
- Access denied for modules/tabs without permission.
- List endpoints return only scoped records based on user data access.
- Change password flow enforces security constraints.
- Booking overview function permissions: user without “calculate day” cannot call the recalculation endpoint.

### Integration tests
- Booking and absence create/update endpoints enforce permission checks.


## Test Case Pack
1) User group with module hidden
   - Input: group with no permissions for Booking Overview module
   - Expected: API denies booking endpoints; permissions show module hidden
2) Data access scope: specific department
   - Input: user scoped to Department A
   - Expected: list endpoints return only Department A employees
3) Booking overview function permission
   - Input: user lacks "calculate day" function permission
   - Expected: recalculation endpoint returns forbidden
4) Change password
   - Input: valid current password + new password
   - Expected: password updated; old password rejected


## Dependencies
- Mandant master data (ZMI-TICKET-001).
- Employee master data (ZMI-TICKET-004) for optional user-employee link.
