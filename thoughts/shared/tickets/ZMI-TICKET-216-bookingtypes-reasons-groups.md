# ZMI-TICKET-216: Booking Types, Reasons, Groups

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Buchungstypen, Buchungsgründe, Buchungstyp-Gruppen, Abwesenheitstyp-Gruppen und Berechnungsregeln implementieren. Diese Konfigurationsentitäten definieren, wie Buchungen klassifiziert und berechnet werden.

## Scope
- **In scope:**
  - tRPC `bookingTypes` Router (CRUD)
  - tRPC `bookingReasons` Router (CRUD)
  - tRPC `bookingTypeGroups` Router (CRUD mit Members)
  - tRPC `absenceTypeGroups` Router (CRUD)
  - tRPC `calculationRules` Router (CRUD)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Absence Types (TICKET-218, abhängig von Calculation Rules)
  - Booking CRUD (TICKET-232)

## Requirements

### tRPC Router: `bookingTypes`
- **Procedures:**
  - `bookingTypes.list` (query)
    - Input: `{ is_active? }`
    - Output: `BookingType[]`
    - Middleware: `tenantProcedure` + `requirePermission("booking_types.read")`
  - `bookingTypes.getById/create/update/delete`
  - Middleware: `requirePermission("booking_types.write")` für Mutationen

### tRPC Router: `bookingReasons`
- **Procedures:**
  - `bookingReasons.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("booking_reasons.*")`

### tRPC Router: `bookingTypeGroups`
- **Procedures:**
  - `bookingTypeGroups.list` (query)
    - Output: `BookingTypeGroup[]` (mit Members/BookingTypes)
  - `bookingTypeGroups.getById` (query)
    - Output: `BookingTypeGroup` (mit Members)
  - `bookingTypeGroups.create` (mutation)
    - Input: `{ name, member_ids? }`
  - `bookingTypeGroups.update` (mutation)
    - Input: `{ id, name?, member_ids? }`
  - `bookingTypeGroups.delete` (mutation)

### tRPC Router: `absenceTypeGroups`
- **Procedures:**
  - `absenceTypeGroups.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("absence_types.*")`

### tRPC Router: `calculationRules`
- **Procedures:**
  - `calculationRules.list` (query)
    - Output: `CalculationRule[]`
  - `calculationRules.getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("calculation_rules.*")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-booking-types.ts` → `trpc.bookingTypes.*`
- `apps/web/src/hooks/api/use-booking-type-groups.ts` → `trpc.bookingTypeGroups.*`
- `apps/web/src/hooks/api/use-absence-type-groups.ts` → `trpc.absenceTypeGroups.*`
- `apps/web/src/hooks/api/use-calculation-rules.ts` → `trpc.calculationRules.*`
- Hinweis: `bookingReasons` Frontend-Hook existiert noch nicht im Hook-Index

### Business Logic (aus Go portiert)
- `apps/api/internal/service/bookingtype.go` (262 Zeilen)
- `apps/api/internal/service/bookingreason.go` (206 Zeilen)
- `apps/api/internal/service/bookingtypegroup.go` (174 Zeilen)
- `apps/api/internal/service/absencetypegroup.go` (145 Zeilen)
- `apps/api/internal/service/calculationrule.go` (214 Zeilen)

## Acceptance Criteria
- [ ] BookingTypeGroup mit Member-Management (Zuordnung von BookingTypes)
- [ ] Alle 5 Entitäten haben vollständige CRUD-Operationen
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: BookingTypeGroup mit Members erstellen/aktualisieren
- Integration-Test: CRUD-Flow für alle 5 Entitäten

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/bookingtype.go` (262 Zeilen)
- `apps/api/internal/handler/bookingtype.go` (241 Zeilen)
- `apps/api/internal/repository/bookingtype.go` (179 Zeilen)
- `apps/api/internal/service/bookingreason.go` (206 Zeilen)
- `apps/api/internal/handler/bookingreason.go` (254 Zeilen)
- `apps/api/internal/repository/bookingreason.go` (91 Zeilen)
- `apps/api/internal/service/bookingtypegroup.go` (174 Zeilen)
- `apps/api/internal/handler/bookingtypegroup.go` (243 Zeilen)
- `apps/api/internal/repository/bookingtypegroup.go` (141 Zeilen)
- `apps/api/internal/service/absencetypegroup.go` (145 Zeilen)
- `apps/api/internal/handler/absencetypegroup.go` (179 Zeilen)
- `apps/api/internal/repository/absencetypegroup.go` (79 Zeilen)
- `apps/api/internal/service/calculationrule.go` (214 Zeilen)
- `apps/api/internal/handler/calculationrule.go` (294 Zeilen)
- `apps/api/internal/repository/calculationrule.go` (122 Zeilen)
- `apps/web/src/hooks/api/use-booking-types.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-booking-type-groups.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-absence-type-groups.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-calculation-rules.ts` (Frontend-Hook)
