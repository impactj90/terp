# NOK-224: Employee Profile Page Implementation Plan

## Summary

Build a comprehensive self-service profile page where employees can view their personal and employment information, manage emergency contacts, view access cards, and update editable account settings. The page will use a card-based layout with clearly delineated read-only and editable sections.

## Research Reference

See: [thoughts/shared/research/2026-01-26-NOK-224-employee-profile-page.md](../research/2026-01-26-NOK-224-employee-profile-page.md)

## API Endpoint Analysis

### Available Endpoints
| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/auth/me` | GET | Get current user | Exists |
| `/employees/{id}` | GET | Get employee details (includes contacts, cards) | Exists |
| `/employees/{id}` | PUT | Update employee (name, email, phone) | Exists |
| `/employees/{id}/contacts` | GET | List contacts | Exists |
| `/employees/{id}/contacts` | POST | Create contact | Exists |
| `/employees/{id}/contacts/{contactId}` | DELETE | Delete contact | Exists |
| `/employees/{id}/cards` | GET | List cards | Exists |
| `/users/{id}` | PATCH | Update user (display_name, avatar_url) | Exists |

### Not Available (Out of Scope)
- Password change endpoint (not in current API)
- Notification preferences endpoint (not in current API)

**Note**: Password change and notification preferences will show placeholder UI with "Coming Soon" message.

---

## Implementation Phases

### Phase 1: API Hooks Setup

**Files to create:**
- `apps/web/src/hooks/api/use-employee-contacts.ts`
- `apps/web/src/hooks/api/use-employee-cards.ts`
- `apps/web/src/hooks/api/use-user.ts`

**Tasks:**
1. Create `useEmployeeContacts(employeeId)` hook for fetching contacts
2. Create `useCreateEmployeeContact()` mutation hook
3. Create `useDeleteEmployeeContact()` mutation hook
4. Create `useEmployeeCards(employeeId)` hook for fetching cards
5. Create `useUpdateUser()` mutation hook for user profile updates
6. Export all hooks from `apps/web/src/hooks/api/index.ts`

**Code Pattern (from use-employees.ts):**
```tsx
export function useEmployeeContacts(employeeId: string, enabled = true) {
  return useApiQuery('/employees/{id}/contacts', {
    path: { id: employeeId },
    enabled: enabled && !!employeeId,
  })
}

export function useCreateEmployeeContact() {
  return useApiMutation('/employees/{id}/contacts', 'post', {
    invalidateKeys: [['/employees/{id}/contacts']],
  })
}
```

**Verification:**
- [ ] All hooks compile without TypeScript errors
- [ ] Test imports in a temporary component

---

### Phase 2: Profile Page Route and Layout

**Files to create:**
- `apps/web/src/app/(dashboard)/profile/page.tsx`
- `apps/web/src/app/(dashboard)/profile/loading.tsx` (optional skeleton)

**Tasks:**
1. Create profile page with 'use client' directive
2. Implement loading skeleton component
3. Implement "no employee linked" state (reuse pattern from dashboard)
4. Set up basic page structure with header
5. Fetch user via `useAuth()` and employee via `useEmployee(employeeId)`

**Code Pattern (from dashboard/page.tsx):**
```tsx
'use client'

import { useAuth } from '@/providers/auth-provider'
import { useEmployee } from '@/hooks/api'
import { Skeleton } from '@/components/ui/skeleton'

export default function ProfilePage() {
  const { user, isLoading: authLoading } = useAuth()
  const employeeId = user?.employee_id

  const { data: employee, isLoading: employeeLoading } = useEmployee(employeeId ?? '', !!employeeId)

  if (authLoading || employeeLoading) {
    return <ProfileLoadingSkeleton />
  }

  if (!employeeId) {
    return <NoEmployeeLinkedMessage />
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground">View and manage your personal information</p>
      </div>

      {/* Profile sections will go here */}
    </div>
  )
}
```

**Verification:**
- [ ] Navigate to `/profile` from user menu dropdown
- [ ] Loading skeleton displays while fetching
- [ ] No-employee message shows when employee_id is null
- [ ] Page renders with header when data loads

---

### Phase 3: Profile Header Component

**Files to create:**
- `apps/web/src/components/profile/profile-header.tsx`
- `apps/web/src/components/profile/index.ts`

**Tasks:**
1. Create profile header with avatar, full name, and role badge
2. Show personnel number and email beneath name
3. Add avatar upload placeholder (UI only, API not available)
4. Use existing Avatar component from ui/avatar

**Component Props:**
```tsx
interface ProfileHeaderProps {
  user: User
  employee: Employee
}
```

**UI Elements:**
- Large avatar (h-24 w-24)
- Full name: `${employee.first_name} ${employee.last_name}`
- Role badge using `Badge` component
- Personnel number: `#${employee.personnel_number}`
- Email address
- Upload avatar button (disabled with tooltip "Coming soon")

**Verification:**
- [ ] Avatar displays correctly with initials fallback
- [ ] Name, role, and personnel number display
- [ ] Upload button is disabled with tooltip

---

### Phase 4: Personal Information Card

**Files to create:**
- `apps/web/src/components/profile/personal-info-card.tsx`

**Tasks:**
1. Create card with editable fields: first_name, last_name, email, phone
2. Implement edit/save/cancel toggle pattern
3. Use `useUpdateEmployee()` mutation for saves
4. Show validation errors inline
5. Display success toast on save

**Editable Fields:**
| Field | Type | Validation |
|-------|------|------------|
| First Name | text | Required, 1-100 chars |
| Last Name | text | Required, 1-100 chars |
| Email | email | Valid email format |
| Phone | text | Optional |

**State Management:**
```tsx
const [isEditing, setIsEditing] = useState(false)
const [formData, setFormData] = useState({ first_name: '', last_name: '', email: '', phone: '' })
const updateEmployee = useUpdateEmployee()

const handleSave = async () => {
  try {
    await updateEmployee.mutateAsync({
      path: { id: employeeId },
      body: formData
    })
    setIsEditing(false)
    // Show success toast
  } catch (error) {
    // Show error
  }
}
```

**Verification:**
- [ ] Card displays current values
- [ ] Edit button toggles to edit mode
- [ ] Save persists changes via API
- [ ] Cancel reverts changes
- [ ] Validation errors display inline
- [ ] Success feedback shows after save

---

### Phase 5: Employment Details Card (Read-Only)

**Files to create:**
- `apps/web/src/components/profile/employment-details-card.tsx`

**Tasks:**
1. Create read-only card displaying employment information
2. Show department, cost center, employment type
3. Display entry date and exit date (if set)
4. Show weekly hours and vacation days per year

**Fields to Display:**
| Field | Value Source |
|-------|--------------|
| Department | employee.department?.name |
| Cost Center | employee.cost_center?.name |
| Employment Type | employee.employment_type?.name |
| Entry Date | format(employee.entry_date) |
| Exit Date | employee.exit_date (or "Active") |
| Weekly Hours | employee.weekly_hours |
| Annual Vacation | employee.vacation_days_per_year |

**Verification:**
- [ ] All employment fields display correctly
- [ ] Null values show placeholder (e.g., "Not assigned")
- [ ] Dates are formatted correctly

---

### Phase 6: Emergency Contacts Card (CRUD)

**Files to create:**
- `apps/web/src/components/profile/emergency-contacts-card.tsx`
- `apps/web/src/components/profile/contact-form-dialog.tsx`
- `apps/web/src/components/profile/contact-list-item.tsx`

**Tasks:**
1. Create card showing list of emergency contacts
2. Add "Add Contact" button opening a dialog/form
3. Implement contact creation with `useCreateEmployeeContact()`
4. Add delete button per contact with confirmation
5. Show contact type badge (email, phone, mobile, emergency)
6. Handle empty state with helpful message

**Contact Form Fields:**
| Field | Type | Validation |
|-------|------|------------|
| Type | select | Required (email/phone/mobile/emergency) |
| Value | text | Required, 1-255 chars |
| Label | text | Optional, 0-100 chars |
| Primary | checkbox | Optional |

**Contact List Item:**
```tsx
interface ContactListItemProps {
  contact: EmployeeContact
  onDelete: (id: string) => void
  isDeleting: boolean
}
```

**Verification:**
- [ ] Contacts list displays all contacts
- [ ] Add button opens form dialog
- [ ] New contact appears in list after creation
- [ ] Delete removes contact with confirmation
- [ ] Empty state shows "No contacts added"
- [ ] Contact type badge shows correctly

---

### Phase 7: Access Cards Card (Read-Only)

**Files to create:**
- `apps/web/src/components/profile/access-cards-card.tsx`

**Tasks:**
1. Create read-only card showing assigned access cards
2. Fetch cards via `useEmployeeCards(employeeId)`
3. Show card number, type badge, validity period
4. Indicate active/inactive status
5. Handle empty state

**Card Display Fields:**
| Field | Display |
|-------|---------|
| Card Number | Primary text |
| Card Type | Badge (RFID/Barcode/PIN) |
| Valid From | Date |
| Valid To | Date or "No expiry" |
| Status | Active/Inactive indicator |

**Verification:**
- [ ] All cards display with correct information
- [ ] Active/inactive status shows correctly
- [ ] Card type badges display
- [ ] Empty state shows "No cards assigned"

---

### Phase 8: Time Plan Card (Read-Only Placeholder)

**Files to create:**
- `apps/web/src/components/profile/time-plan-card.tsx`

**Tasks:**
1. Create placeholder card for time plan information
2. Show "Coming Soon" message or static placeholder
3. This will be populated when time plan APIs are connected

**Note:** The employee day plan assignment is in the `employee_day_plans` table which requires additional API work. For now, show placeholder.

**Verification:**
- [ ] Card renders with placeholder content
- [ ] Indicates time plan feature coming soon

---

### Phase 9: Account Settings Card

**Files to create:**
- `apps/web/src/components/profile/account-settings-card.tsx`

**Tasks:**
1. Create card with display name edit (uses `useUpdateUser()`)
2. Add password change section (placeholder - API not available)
3. Add notification preferences section (placeholder - API not available)
4. Show user email (read-only)
5. Show user role (read-only)

**Sections:**
1. **Display Name** - Editable via PATCH /users/{id}
2. **Password** - Placeholder with "Coming Soon"
3. **Notifications** - Placeholder with "Coming Soon"

**Verification:**
- [ ] Display name edits save via API
- [ ] Password section shows placeholder
- [ ] Notifications section shows placeholder
- [ ] User role displays correctly

---

### Phase 10: Integration and Polish

**Files to modify:**
- `apps/web/src/app/(dashboard)/profile/page.tsx` (integrate all components)
- `apps/web/src/components/profile/index.ts` (export all components)

**Tasks:**
1. Integrate all card components into profile page
2. Arrange in logical order with proper spacing
3. Add success/error toast notifications
4. Ensure consistent loading states
5. Test responsive layout on mobile
6. Add error boundaries for individual cards

**Final Layout:**
```tsx
<div className="space-y-6">
  <ProfileHeader user={user} employee={employee} />

  <div className="grid gap-6 lg:grid-cols-2">
    <PersonalInfoCard employee={employee} />
    <EmploymentDetailsCard employee={employee} />
  </div>

  <div className="grid gap-6 lg:grid-cols-2">
    <EmergencyContactsCard employeeId={employeeId} />
    <AccessCardsCard employeeId={employeeId} />
  </div>

  <div className="grid gap-6 lg:grid-cols-2">
    <TimePlanCard employeeId={employeeId} />
    <AccountSettingsCard user={user} />
  </div>
</div>
```

**Verification:**
- [ ] All cards render without errors
- [ ] Layout is responsive (2-column on desktop, 1-column on mobile)
- [ ] Loading states work for async operations
- [ ] Toast notifications appear for success/error
- [ ] No console errors

---

## File Summary

### New Files to Create

```
apps/web/src/
├── app/(dashboard)/profile/
│   ├── page.tsx
│   └── loading.tsx (optional)
├── components/profile/
│   ├── index.ts
│   ├── profile-header.tsx
│   ├── personal-info-card.tsx
│   ├── employment-details-card.tsx
│   ├── emergency-contacts-card.tsx
│   ├── contact-form-dialog.tsx
│   ├── contact-list-item.tsx
│   ├── access-cards-card.tsx
│   ├── time-plan-card.tsx
│   └── account-settings-card.tsx
└── hooks/api/
    ├── use-employee-contacts.ts
    ├── use-employee-cards.ts
    └── use-user.ts
```

### Files to Modify

```
apps/web/src/hooks/api/index.ts  # Add new hook exports
```

---

## Success Criteria

From ticket acceptance criteria:

- [ ] All data displays correctly
  - Personal info, employment details, contacts, cards all render
- [ ] Editable fields save successfully
  - Personal info (name, email, phone) saves via PUT /employees/{id}
  - Display name saves via PATCH /users/{id}
- [ ] Contact management works (CRUD)
  - Add contact creates via POST
  - Delete contact removes via DELETE
  - List refreshes after mutations
- [ ] Validation prevents invalid data
  - Required fields validated
  - Email format validated
  - Error messages display inline
- [ ] Changes show confirmation feedback
  - Success toasts after saves
  - Error messages on failure

---

## Out of Scope

The following features require backend API work and are deferred:

1. **Password Change** - No endpoint exists, show placeholder
2. **Notification Preferences** - No endpoint exists, show placeholder
3. **Avatar Upload** - Endpoint exists (PATCH /users) but file upload infrastructure needed
4. **Time Plan Display** - Requires employee day plan API integration
5. **Contact Edit** - Only add/delete supported, no PATCH endpoint

---

## Dependencies

- Existing UI components: Card, Button, Input, Label, Select, Avatar, Badge, Skeleton, Dialog
- Existing hooks: useAuth, useApiQuery, useApiMutation, useEmployee
- Toast notification system (may need to add if not exists)

---

## Estimated Implementation Time

| Phase | Estimated Time |
|-------|---------------|
| Phase 1: API Hooks | 30 min |
| Phase 2: Page Route | 30 min |
| Phase 3: Profile Header | 30 min |
| Phase 4: Personal Info Card | 45 min |
| Phase 5: Employment Details | 30 min |
| Phase 6: Emergency Contacts | 1 hour |
| Phase 7: Access Cards | 30 min |
| Phase 8: Time Plan Placeholder | 15 min |
| Phase 9: Account Settings | 45 min |
| Phase 10: Integration | 30 min |
| **Total** | **~5.5 hours** |
