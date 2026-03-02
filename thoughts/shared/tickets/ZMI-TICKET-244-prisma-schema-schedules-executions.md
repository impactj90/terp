# ZMI-TICKET-244: Prisma Schema: schedules, executions

Status: Proposed
Priority: P2
Owner: TBD

## Goal
Prisma-Schema um Schedules (geplante Aufgaben), Schedule Tasks (Aufgaben-Konfiguration) und Executions (Ausführungs-Protokoll) erweitern. Diese Tabellen unterstützen das Background-Job-System.

## Scope
- **In scope:**
  - Prisma-Modelle: Schedule, ScheduleTask, ScheduleExecution, ScheduleTaskExecution
  - Relationen und Indizes
- **Out of scope:**
  - Schedule Router (TICKET-247)
  - Vercel Cron Integration (TICKET-245, 246)

## Requirements

### Prisma Schema
```prisma
model Schedule {
  id          String    @id @default(uuid())
  tenant_id   String    @db.Uuid
  name        String
  description String?
  cron_expr   String?
  is_active   Boolean   @default(true)
  last_run_at DateTime?
  next_run_at DateTime?
  created_at  DateTime  @default(now())
  updated_at  DateTime  @updatedAt
  deleted_at  DateTime?

  tasks       ScheduleTask[]
  executions  ScheduleExecution[]

  @@map("schedules")
}

model ScheduleTask {
  id          String   @id @default(uuid())
  schedule_id String   @db.Uuid
  task_type   String   // "calculate_days", "calculate_months", "generate_day_plans", "execute_macros"
  config      Json?
  sort_order  Int      @default(0)
  is_active   Boolean  @default(true)
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt

  schedule    Schedule @relation(fields: [schedule_id], references: [id])
  executions  ScheduleTaskExecution[]

  @@map("schedule_tasks")
}

model ScheduleExecution {
  id           String    @id @default(uuid())
  schedule_id  String    @db.Uuid
  status       String    @default("running") // running, completed, failed
  started_at   DateTime  @default(now())
  completed_at DateTime?
  error        String?
  result       Json?

  schedule     Schedule  @relation(fields: [schedule_id], references: [id])
  task_executions ScheduleTaskExecution[]

  @@index([schedule_id, started_at])
  @@map("schedule_executions")
}

model ScheduleTaskExecution {
  id            String    @id @default(uuid())
  execution_id  String    @db.Uuid
  task_id       String    @db.Uuid
  status        String    @default("running")
  started_at    DateTime  @default(now())
  completed_at  DateTime?
  error         String?
  result        Json?
  affected_rows Int?

  execution     ScheduleExecution @relation(fields: [execution_id], references: [id])
  task          ScheduleTask      @relation(fields: [task_id], references: [id])

  @@map("schedule_task_executions")
}
```

## Acceptance Criteria
- [ ] Alle 4 Modelle definiert mit korrekten Relationen
- [ ] Schedule → Tasks → TaskExecutions Hierarchie
- [ ] Indizes für performante Queries
- [ ] `prisma generate` erfolgreich

## Tests
- Unit-Test: Schedule mit Tasks und Executions laden

## Dependencies
- ZMI-TICKET-200 (Prisma Schema: Core Foundation)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/schedule.go` (144 Zeilen — Schedule, ScheduleTask, ScheduleExecution, ScheduleTaskExecution)
