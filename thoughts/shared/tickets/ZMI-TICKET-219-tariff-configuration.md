# ZMI-TICKET-219: Tariff Configuration

Status: Proposed
Priority: P2
Owner: TBD

## Goal
tRPC-Router für die vollständige Tarifkonfiguration implementieren: Tarife mit Pausen, Wochenplänen, Tagesplänen, Rhythmus und Urlaubs-Konfiguration. Der TariffService ist mit 757 Zeilen einer der komplexesten Konfigurations-Services.

## Scope
- **In scope:**
  - tRPC `tariffs` Router (CRUD + Breaks + WeekPlan/DayPlan-Zuordnungen)
  - Tariff-Rhythmus-Konfiguration
  - Tariff-Vacation-Konfiguration
  - Frontend-Hooks Migration
- **Out of scope:**
  - Employee Tariff Assignments (bereits in TICKET-214)
  - Vacation-Berechnung basierend auf Tarif (TICKET-241)

## Requirements

### tRPC Router: `tariffs`
- **Procedures:**
  - `tariffs.list` (query)
    - Input: `{ is_active? }`
    - Output: `Tariff[]`
    - Middleware: `tenantProcedure` + `requirePermission("tariffs.read")`
  - `tariffs.getById` (query)
    - Input: `{ id }`
    - Output: `Tariff` (mit Breaks, WeekPlans, DayPlans, Rhythm, VacationConfig)
  - `tariffs.create` (mutation)
    - Input: `{ name, description?, weekly_hours, daily_hours, week_plan_ids?, vacation_days?, rhythm_type?, rhythm_config? }`
    - Output: `Tariff`
    - Middleware: `requirePermission("tariffs.write")`
  - `tariffs.update` (mutation)
    - Input: `{ id, ...partialFields }`
  - `tariffs.delete` (mutation)
    - Input: `{ id }`
    - Logik: Prüfe ob Tariff in EmployeeTariffAssignments verwendet
  - `tariffs.createBreak` (mutation)
    - Input: `{ tariffId, start_time, end_time, duration_minutes, is_paid }`
    - Output: `TariffBreak`
  - `tariffs.deleteBreak` (mutation)
    - Input: `{ tariffId, breakId }`

### Prisma Schema (Erweiterung)
```prisma
model Tariff {
  id              String    @id @default(uuid())
  tenant_id       String    @db.Uuid
  name            String
  description     String?
  weekly_hours    Decimal   @db.Decimal(10,2)
  daily_hours     Decimal   @db.Decimal(10,2)
  vacation_days   Decimal?  @db.Decimal(10,2)
  rhythm_type     String?
  rhythm_config   Json?
  vacation_config Json?
  is_active       Boolean   @default(true)
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt
  deleted_at      DateTime?

  breaks          TariffBreak[]
  week_plans      TariffWeekPlan[]
  day_plans       TariffDayPlan[]
  assignments     EmployeeTariffAssignment[]

  @@map("tariffs")
}

model TariffBreak {
  id               String  @id @default(uuid())
  tariff_id        String  @db.Uuid
  start_time       String
  end_time         String
  duration_minutes Int
  is_paid          Boolean @default(false)

  tariff           Tariff  @relation(fields: [tariff_id], references: [id])

  @@map("tariff_breaks")
}

model TariffWeekPlan {
  id           String @id @default(uuid())
  tariff_id    String @db.Uuid
  week_plan_id String @db.Uuid
  sort_order   Int    @default(0)

  tariff       Tariff   @relation(fields: [tariff_id], references: [id])
  week_plan    WeekPlan @relation(fields: [week_plan_id], references: [id])

  @@map("tariff_week_plans")
}

model TariffDayPlan {
  id          String @id @default(uuid())
  tariff_id   String @db.Uuid
  day_plan_id String @db.Uuid
  day_of_week Int

  tariff      Tariff  @relation(fields: [tariff_id], references: [id])
  day_plan    DayPlan @relation(fields: [day_plan_id], references: [id])

  @@map("tariff_day_plans")
}
```

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-tariffs.ts` → `trpc.tariffs.*`

### Business Logic (aus Go portiert)
- `apps/api/internal/service/tariff.go` (757 Zeilen) — Komplettes Tariff-Management
- Tariff-Model mit Sub-Entitäten: `apps/api/internal/model/tariff.go` (417 Zeilen)

## Acceptance Criteria
- [ ] Tariff CRUD mit allen Sub-Entitäten (Breaks, WeekPlans, DayPlans)
- [ ] Tariff-Löschung verhindert bei aktiven Assignments
- [ ] Rhythm-Konfiguration (JSON) wird korrekt gespeichert
- [ ] Frontend-Hooks nutzen tRPC statt fetch
- [ ] Bestehende Tests portiert

## Tests
- Unit-Test: Tariff mit Breaks erstellen
- Unit-Test: Tariff-Löschung mit Assignments verhindert
- Unit-Test: WeekPlan/DayPlan-Zuordnungen
- Integration-Test: Kompletter Tariff-Konfigurations-Flow

## Dependencies
- ZMI-TICKET-204 (Prisma Schema: Org-Tabellen)
- ZMI-TICKET-217 (Day Plans + Week Plans — DayPlan/WeekPlan Modelle)
- ZMI-TICKET-210 (Tenants — tenantProcedure)

## Go-Dateien die ersetzt werden
- `apps/api/internal/service/tariff.go` (757 Zeilen)
- `apps/api/internal/handler/tariff.go` (538 Zeilen)
- `apps/api/internal/repository/tariff.go` (316 Zeilen)
- `apps/api/internal/model/tariff.go` (417 Zeilen)
- `apps/web/src/hooks/api/use-tariffs.ts` (Frontend-Hook)
