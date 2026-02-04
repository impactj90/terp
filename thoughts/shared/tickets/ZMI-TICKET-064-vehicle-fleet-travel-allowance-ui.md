# ZMI-TICKET-064: Vehicle Fleet & Travel Allowance UI

Status: Proposed
Priority: P3
Owner: TBD
Backend tickets: ZMI-TICKET-029, ZMI-TICKET-030

## Goal
Provide admin pages for vehicle fleet management (vehicles, routes, trip records) and travel allowance rule configuration (rule sets, local rules, extended rules) with a preview calculator.

## Scope
- In scope: Vehicles CRUD, vehicle routes CRUD, trip records CRUD, travel allowance rule sets CRUD, local and extended travel rules CRUD, preview calculator.
- Out of scope: GPS tracking, automated mileage recording, expense reimbursement processing.

## Requirements

### Pages & routes
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/vehicles/page.tsx`
  - Route: `/admin/vehicles`
  - Tabs: "Vehicles", "Routes", "Trip Records"
- **New page**: `apps/web/src/app/[locale]/(dashboard)/admin/travel-allowance/page.tsx`
  - Route: `/admin/travel-allowance`
  - Tabs: "Rule Sets", "Local Rules", "Extended Rules", "Preview"

### Components

#### Vehicles
- `apps/web/src/components/vehicles/vehicle-data-table.tsx`
  - Columns: Code, Name, License Plate, Sort Order, Active, Actions
- `apps/web/src/components/vehicles/vehicle-form-sheet.tsx`
  - Fields: code (unique), name, license_plate, description, sort_order, active
- `apps/web/src/components/vehicles/vehicle-route-data-table.tsx`
  - Columns: Code, Name, Distance (km), Active, Actions
- `apps/web/src/components/vehicles/vehicle-route-form-sheet.tsx`
  - Fields: code (unique), name, distance_km (decimal), description, active
- `apps/web/src/components/vehicles/trip-record-data-table.tsx`
  - Columns: Date, Vehicle, Route, Start Mileage, End Mileage, Distance (km), Notes, Actions
  - Filters: vehicle_id, date range
- `apps/web/src/components/vehicles/trip-record-form-sheet.tsx`
  - Fields: vehicle_id (select), route_id (select, optional), trip_date, start_mileage, end_mileage, distance_km (auto-calculated from mileage or manual), notes

#### Travel Allowance
- `apps/web/src/components/travel-allowance/rule-set-data-table.tsx`
  - Columns: Name, Calculation Basis (badge: per_day/per_booking), Distance Rule (badge), Active, Actions
- `apps/web/src/components/travel-allowance/rule-set-form-sheet.tsx`
  - Fields: name, code, calculation_basis (select), distance_rule (select: longest/shortest/first/last), description, active
- `apps/web/src/components/travel-allowance/local-rule-data-table.tsx`
  - Columns: Name, Min Distance, Max Distance, Duration Threshold, Tax-Free Amount, Taxable Amount, Active, Actions
- `apps/web/src/components/travel-allowance/local-rule-form-sheet.tsx`
  - Fields: name, code, rule_set_id (select), min_distance_km, max_distance_km, duration_minutes_threshold, tax_free_amount (currency), taxable_amount (currency), active
- `apps/web/src/components/travel-allowance/extended-rule-data-table.tsx`
  - Columns: Name, Arrival Rate, Departure Rate, Intermediate Rate, 3-Month Rule, Active, Actions
- `apps/web/src/components/travel-allowance/extended-rule-form-sheet.tsx`
  - Fields: name, code, rule_set_id (select), arrival_day_rate, departure_day_rate, intermediate_day_rate, three_month_enabled (switch), three_month_max_days, description, active
- `apps/web/src/components/travel-allowance/travel-allowance-preview.tsx`
  - Preview calculator:
    - Input: employee_id, date range, rule_set_id, trip records (or select from recorded)
    - Output: breakdown of daily allowances with local/extended rules applied, totals for tax-free and taxable amounts

### API hooks
- `apps/web/src/hooks/api/use-vehicles.ts`
  - Vehicles: `useVehicles()`, `useCreateVehicle()`, `useUpdateVehicle()`, `useDeleteVehicle()`
  - Routes: `useVehicleRoutes()`, `useCreateVehicleRoute()`, `useUpdateVehicleRoute()`, `useDeleteVehicleRoute()`
  - Trips: `useTripRecords()`, `useCreateTripRecord()`, `useUpdateTripRecord()`, `useDeleteTripRecord()`
- `apps/web/src/hooks/api/use-travel-allowance.ts`
  - Rule Sets: `useTravelAllowanceRuleSets()`, `useCreateTravelAllowanceRuleSet()`, `useUpdateTravelAllowanceRuleSet()`, `useDeleteTravelAllowanceRuleSet()`
  - Local Rules: `useLocalTravelRules()`, `useCreateLocalTravelRule()`, `useUpdateLocalTravelRule()`, `useDeleteLocalTravelRule()`
  - Extended Rules: `useExtendedTravelRules()`, `useCreateExtendedTravelRule()`, `useUpdateExtendedTravelRule()`, `useDeleteExtendedTravelRule()`
  - Preview: `useTravelAllowancePreview()`

### UI behavior
- Trip record distance: auto-calculated from end_mileage - start_mileage, or manual entry if no mileage
- Currency amounts: displayed with 2 decimal places and currency symbol
- Travel allowance preview: detailed breakdown table with daily rates and totals
- Local vs Extended rules: local (Nahmontage) for short-distance, extended (Fernmontage) for long-distance

### Navigation & translations
- Sidebar entries: `{ titleKey: 'nav.vehicles', href: '/admin/vehicles', icon: Car, roles: ['admin'] }`, `{ titleKey: 'nav.travel-allowance', href: '/admin/travel-allowance', icon: Route, roles: ['admin'] }`
- Translation namespaces: `vehicles`, `travel-allowance`

## Acceptance criteria
- Admin can CRUD vehicles, routes, and trip records
- Admin can CRUD travel allowance rule sets, local rules, and extended rules
- Trip distance auto-calculates from mileage readings
- Travel allowance preview shows calculation breakdown
- Currency amounts formatted correctly

## Tests

### Component tests
- Trip record distance auto-calculation
- Currency formatting for allowance amounts
- Preview calculator sends correct request

### Integration tests
- Create vehicle → create route → record trip
- Configure rule set → add rules → run preview

## Test case pack
1) Record trip
   - Input: Vehicle "VAN-001", start_mileage=10000, end_mileage=10150
   - Expected: Distance auto-calculated as 150 km
2) Travel allowance preview
   - Input: Employee, date range, rule set with local rules
   - Expected: Breakdown shows daily allowances with totals

## Dependencies
- ZMI-TICKET-029 (Vehicle Data backend)
- ZMI-TICKET-030 (Travel Allowance backend)
- Employees API (for selectors)
