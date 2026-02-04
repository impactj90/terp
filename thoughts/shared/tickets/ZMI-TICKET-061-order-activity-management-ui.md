# ZMI-TICKET-061: Order & Activity Management UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-017

## Goal
Provide CRUD pages for orders (projects/work packages), activities, order assignments, and order bookings for project-based time tracking.

## Scope
- In scope: Orders CRUD, activities CRUD, order assignments CRUD, order bookings list/CRUD.
- Out of scope: Order reporting (ZMI-TICKET-051), billing/invoicing, project budgeting.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/orders/page.tsx`
  - Route: `/admin/orders`
  - Tabs: "Orders", "Activities"
- **Order detail**: `apps/web/src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`
  - Route: `/admin/orders/{id}`
  - Tabs: "Details", "Assignments", "Bookings"

### Components
- `apps/web/src/components/orders/order-data-table.tsx`
  - Columns: Code, Name, Status (badge: planned/active/completed/cancelled), Customer, Cost Center, Valid From/To, Actions
- `apps/web/src/components/orders/order-form-sheet.tsx`
  - Fields: code (unique), name, description, status (select), customer, cost_center_id (select), billing_rate_per_hour, valid_from, valid_to, active
- `apps/web/src/components/orders/order-detail-page.tsx`
  - Detail view with assignments and bookings tabs
- `apps/web/src/components/orders/order-assignment-data-table.tsx`
  - Columns: Employee, Role (badge: worker/leader/sales), Valid From/To, Actions
- `apps/web/src/components/orders/order-assignment-form-dialog.tsx`
  - Fields: employee_id (select), role (select), valid_from, valid_to
- `apps/web/src/components/orders/order-booking-data-table.tsx`
  - Columns: Date, Employee, Activity, Time (HH:MM), Description, Source, Actions
- `apps/web/src/components/orders/order-booking-form-sheet.tsx`
  - Fields: employee_id, order_id (locked), activity_id (select), booking_date, time_minutes (duration input), description
- `apps/web/src/components/activities/activity-data-table.tsx`
  - Columns: Code, Name, Description, Active, Actions
- `apps/web/src/components/activities/activity-form-sheet.tsx`
  - Fields: code (unique), name, description, active

### API hooks
- `apps/web/src/hooks/api/use-orders.ts`
  - Orders: `useOrders()`, `useOrder()`, `useCreateOrder()`, `useUpdateOrder()`, `useDeleteOrder()`
  - Assignments: `useOrderAssignments()`, `useCreateOrderAssignment()`, `useUpdateOrderAssignment()`, `useDeleteOrderAssignment()`
  - Bookings: `useOrderBookings()`, `useCreateOrderBooking()`, `useUpdateOrderBooking()`, `useDeleteOrderBooking()`
- `apps/web/src/hooks/api/use-activities.ts`
  - `useActivities()`, `useCreateActivity()`, `useUpdateActivity()`, `useDeleteActivity()`

### UI behavior
- Order status flow: planned → active → completed/cancelled
- Order detail page: tabs for assignments and bookings
- Bookings time displayed as HH:MM (stored as minutes)
- Cost center selector links orders to budget tracking
- Activity selector in booking form

### Navigation & translations
- Sidebar entry: `{ titleKey: 'nav.orders', href: '/admin/orders', icon: Package, roles: ['admin'] }`
- Breadcrumb: `'orders': 'orders'`
- Translation namespace: `orders`, `activities`

## Acceptance criteria
- Admin can CRUD orders with status management
- Admin can CRUD activities
- Admin can assign employees to orders with roles
- Admin can record order bookings with activity and duration
- Order detail page shows assignments and bookings

## Tests

### Component tests
- Order status badges render correctly
- Assignment role badges display
- Booking time formatted as HH:MM

### Integration tests
- Create order → assign employee → record booking

## Test case pack
1) Create order
   - Input: Code "PRJ-001", name "Website Redesign", status=active
   - Expected: Order created with active badge
2) Assign employee as leader
   - Input: Assign employee with role=leader
   - Expected: Assignment created with "Leader" badge
3) Record booking
   - Input: Activity "Development", 120 minutes, description "Frontend work"
   - Expected: Booking created showing "2:00" in time column

## Dependencies
- ZMI-TICKET-017 (ZMI Auftrag Module backend)
- Cost Centers API (for order cost center selector)
- Employees API (for assignments)
