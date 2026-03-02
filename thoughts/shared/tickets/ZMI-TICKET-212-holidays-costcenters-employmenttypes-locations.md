# ZMI-TICKET-212: Holidays, Cost Centers, Employment Types, Locations

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für vier einfache Stammdaten-Entitäten: Holidays (mit Generate/Copy), Cost Centers, Employment Types und Locations. Diese sind strukturell ähnliche CRUD-Domains mit wenig Business-Logik.

## Scope
- **In scope:**
  - tRPC `holidays` Router (CRUD + Generate + Copy)
  - tRPC `costCenters` Router (CRUD)
  - tRPC `employmentTypes` Router (CRUD)
  - tRPC `locations` Router (CRUD)
  - Frontend-Hooks Migration
- **Out of scope:**
  - Holiday-Referenzierung in Tagesberechnung (TICKET-234)

## Requirements

### tRPC Router: `holidays`
- **Procedures:**
  - `holidays.list` (query) — Gefiltert nach Jahr, Bundesland
    - Input: `{ year?, state? }`
    - Output: `Holiday[]`
    - Middleware: `tenantProcedure` + `requirePermission("holidays.read")`
  - `holidays.getById` (query)
    - Input: `{ id }`
    - Output: `Holiday`
  - `holidays.create` (mutation)
    - Input: `{ name, date, half_day?, state?, year }`
    - Output: `Holiday`
    - Middleware: `requirePermission("holidays.write")`
  - `holidays.update` (mutation)
    - Input: `{ id, name?, date?, half_day?, state? }`
    - Output: `Holiday`
  - `holidays.delete` (mutation)
    - Input: `{ id }`
  - `holidays.generate` (mutation) — Gesetzliche Feiertage für Bundesland/Jahr generieren
    - Input: `{ year, state }`
    - Output: `{ created: number }`
    - Middleware: `requirePermission("holidays.write")`
    - Logik: Berechnung beweglicher Feiertage (Ostern-basiert)
  - `holidays.copy` (mutation) — Feiertage von einem Jahr ins andere kopieren
    - Input: `{ sourceYear, targetYear }`
    - Output: `{ copied: number }`

### tRPC Router: `costCenters`
- **Procedures:**
  - `costCenters.list` (query) — `{ items: CostCenter[] }`
  - `costCenters.getById` (query)
  - `costCenters.create` (mutation) — Input: `{ name, code }`
  - `costCenters.update` (mutation)
  - `costCenters.delete` (mutation)
  - Middleware: `tenantProcedure` + `requirePermission("cost_centers.*")`

### tRPC Router: `employmentTypes`
- **Procedures:** Identische Struktur wie `costCenters`
  - `employmentTypes.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("employment_types.*")`

### tRPC Router: `locations`
- **Procedures:** Identische Struktur wie `costCenters`
  - `locations.list/getById/create/update/delete`
  - Middleware: `tenantProcedure` + `requirePermission("locations.*")`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-holidays.ts` → `trpc.holidays.*`
- `apps/web/src/hooks/api/use-cost-centers.ts` → `trpc.costCenters.*`
- `apps/web/src/hooks/api/use-employment-types.ts` → `trpc.employmentTypes.*`
- `apps/web/src/hooks/api/use-locations.ts` → `trpc.locations.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/holiday.go` (453 Zeilen) — CRUD + Generate (Feiertags-Berechnung) + Copy
- `apps/api/internal/service/costcenter.go` (166 Zeilen)
- `apps/api/internal/service/employmenttype.go` (176 Zeilen)
- `apps/api/internal/service/location.go` (157 Zeilen)

## Acceptance Criteria
- [ ] Holiday Generate berechnet bewegliche Feiertage korrekt (Ostern etc.)
- [ ] Holiday Copy kopiert Feiertage zwischen Jahren
- [ ] Alle 4 Entitäten haben vollständige CRUD-Operationen
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Feiertags-Generierung für verschiedene Bundesländer
- Unit-Test: Feiertags-Kopie zwischen Jahren
- Integration-Test: CRUD-Flow für alle 4 Entitäten
- E2E-Test: Frontend Holiday-Verwaltung

## Dependencies
- ZMI-TICKET-203 (Authorization Middleware)
- ZMI-TICKET-204 (Prisma Schema: Org-Tabellen)
- ZMI-TICKET-210 (Tenants, Users — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/holiday.go` (453 Zeilen)
- `apps/api/internal/handler/holiday.go` (371 Zeilen)
- `apps/api/internal/repository/holiday.go` (132 Zeilen)
- `apps/api/internal/service/costcenter.go` (166 Zeilen)
- `apps/api/internal/handler/costcenter.go` (184 Zeilen)
- `apps/api/internal/repository/costcenter.go` (109 Zeilen)
- `apps/api/internal/service/employmenttype.go` (176 Zeilen)
- `apps/api/internal/handler/employmenttype.go` (200 Zeilen)
- `apps/api/internal/repository/employmenttype.go` (110 Zeilen)
- `apps/api/internal/service/location.go` (157 Zeilen)
- `apps/api/internal/handler/location.go` (243 Zeilen)
- `apps/api/internal/repository/location.go` (94 Zeilen)
- `apps/web/src/hooks/api/use-holidays.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-cost-centers.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-employment-types.ts` (Frontend-Hook)
- `apps/web/src/hooks/api/use-locations.ts` (Frontend-Hook)
