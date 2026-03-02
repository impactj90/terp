# ZMI-TICKET-213: Accounts, Account Groups, Contact Types

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für Accounts (Zeitkonten mit Usage-Referenz), Account Groups, Contact Types und Contact Kinds implementieren. Accounts sind die Kernentitäten des Zeiterfassungssystems und werden in Daily Values und Monthly Values referenziert.

## Scope
- **In scope:**
  - tRPC `accounts` Router (CRUD + Usage Query)
  - tRPC `accountGroups` Router (CRUD)
  - tRPC `contactTypes` Router (CRUD)
  - tRPC `contactKinds` Router (CRUD)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Account-Werte in Daily/Monthly Values (spätere Phasen)
  - Account-Zuordnung in Export-Interfaces (TICKET-224)

## Requirements

### tRPC Router: `accounts`
- **Procedures:**
  - `accounts.list` (query) — Mit optionalem Filter nach account_type
    - Input: `{ account_type?, is_active?, account_group_id? }`
    - Output: `Account[]`
    - Middleware: `tenantProcedure` + `requirePermission("accounts.read")`
  - `accounts.getById` (query)
    - Input: `{ id }`
    - Output: `Account` (mit AccountGroup)
  - `accounts.usage` (query) — Wo wird ein Account verwendet (DayPlans etc.)
    - Input: `{ id }`
    - Output: `{ day_plans: AccountUsageDayPlan[] }`
  - `accounts.create` (mutation)
    - Input: `{ name, code, description?, account_type, unit?, is_system?, account_group_id? }`
    - Output: `Account`
    - Middleware: `requirePermission("accounts.write")`
  - `accounts.update` (mutation)
    - Input: `{ id, name?, code?, description?, account_type?, unit?, is_system?, account_group_id?, is_active? }`
  - `accounts.delete` (mutation)
    - Input: `{ id }`
    - Logik: Prüfe ob Account in Verwendung (Usage Query)

### tRPC Router: `accountGroups`
- **Procedures:**
  - `accountGroups.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("accounts.*")`

### tRPC Router: `contactTypes`
- **Procedures:**
  - `contactTypes.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("contact_types.*")`

### tRPC Router: `contactKinds`
- **Procedures:**
  - `contactKinds.list/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("contact_types.*")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-accounts.ts` → `trpc.accounts.*`
- `apps/web/src/hooks/api/use-account-groups.ts` → `trpc.accountGroups.*`
- `apps/web/src/hooks/api/use-contact-types.ts` → `trpc.contactTypes.*`
- `apps/web/src/hooks/api/use-contact-kinds.ts` → `trpc.contactKinds.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/account.go` (256 Zeilen) — CRUD + Usage Query
- `apps/api/internal/service/accountgroup.go` (151 Zeilen)
- `apps/api/internal/service/contacttype.go` (176 Zeilen)
- `apps/api/internal/service/contactkind.go` (160 Zeilen)

## Acceptance Criteria
- [ ] Account Usage-Query zeigt DayPlan-Referenzen
- [ ] Account-Löschung verhindert wenn in Verwendung
- [ ] Alle 4 Entitäten haben vollständige CRUD-Operationen
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Account Usage Query findet Referenzen
- Unit-Test: Account-Löschung mit Referenzen wird verhindert
- Integration-Test: CRUD-Flow für alle 4 Entitäten

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-204 (Prisma Schema: Org-Tabellen — Account, AccountGroup Modelle)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/account.go` (256 Zeilen)
- `apps/api/internal/handler/account.go` (331 Zeilen)
- `apps/api/internal/repository/account.go` (231 Zeilen)
- `apps/api/internal/service/accountgroup.go` (151 Zeilen)
- `apps/api/internal/handler/accountgroup.go` (182 Zeilen)
- `apps/api/internal/repository/accountgroup.go` (79 Zeilen)
- `apps/api/internal/service/contacttype.go` (176 Zeilen)
- `apps/api/internal/handler/contacttype.go` (204 Zeilen)
- `apps/api/internal/repository/contacttype.go` (103 Zeilen)
- `apps/api/internal/service/contactkind.go` (160 Zeilen)
- `apps/api/internal/handler/contactkind.go` (220 Zeilen)
- `apps/api/internal/repository/contactkind.go` (103 Zeilen)
- `apps/web/src/hooks/api/use-accounts.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-account-groups.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-contact-types.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-contact-kinds.ts` (Frontend-Hook)
