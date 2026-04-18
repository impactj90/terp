# AUDIT-005 — `loadAbsenceDay` und verwandte Raw-SQL um `tenant_id`-Filter erweitern

| Field               | Value                                            |
| ------------------- | ------------------------------------------------ |
| **Priority**        | P2                                               |
| **Category**        | 1. Tenant-Isolation                              |
| **Severity**        | MEDIUM (Defense-in-Depth)                         |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-005)               |
| **Estimated Scope** | 3 Repository-/Service-Files                       |

---

## Problem

Drei Raw-SQL-Queries im Tagesberechnungspfad filtern nur über `employee_id` / `user_id` / `bookingId`, aber nicht über `tenant_id`. Bei konsequenter UUIDv4-Verwendung ist ein praktischer Cross-Tenant-Leak unwahrscheinlich, aber die Defense-in-Depth fehlt: Sobald jemand (a) eine andere ID-Domain einführt (BIGINT, kurze IDs, importierte Legacy-IDs) oder (b) einen INSERT mit einer Kollisions-UUID erzwingt, liefern diese Queries ungeschützt Daten aus fremden Tenants. Der Code-Audit-Sprawl wird damit auch höher als nötig — jede neue Query, die dieses Muster kopiert, erhöht das Risiko.

## Root Cause

Fehlender `AND tenant_id = ${tenantId}`-Clause in Raw-SQL:

```ts
// ❌ src/lib/services/daily-calc.ts:419-434
const rows = await this.prisma.$queryRaw<AbsenceDayRow[]>`
  SELECT ad.*, at.portion as at_portion, at.priority as at_priority, at.code as at_code,
         cr.account_id as cr_account_id, cr.value as cr_value, cr.factor::text as cr_factor
  FROM absence_days ad
  LEFT JOIN absence_types at ON at.id = ad.absence_type_id
  LEFT JOIN calculation_rules cr ON cr.id = at.calculation_rule_id
  WHERE ad.employee_id = ${employeeId}::uuid
    AND ad.absence_date = ${date}::date
  LIMIT 1
`
```

## Required Fix

```ts
// ✅ src/lib/services/daily-calc.ts:419-434
const rows = await this.prisma.$queryRaw<AbsenceDayRow[]>`
  SELECT ad.*, at.portion as at_portion, at.priority as at_priority, at.code as at_code,
         cr.account_id as cr_account_id, cr.value as cr_value, cr.factor::text as cr_factor
  FROM absence_days ad
  LEFT JOIN absence_types at
    ON at.id = ad.absence_type_id
   AND at.tenant_id = ad.tenant_id
  LEFT JOIN calculation_rules cr
    ON cr.id = at.calculation_rule_id
   AND cr.tenant_id = at.tenant_id
  WHERE ad.tenant_id = ${tenantId}::uuid
    AND ad.employee_id = ${employeeId}::uuid
    AND ad.absence_date = ${date}::date
  LIMIT 1
`
```

Die Funktionssignatur `loadAbsenceDay(employeeId, date, context?)` muss zusätzlich `tenantId` erhalten — `context.tenant.id` ist im bestehenden `DailyCalcContext` vorhanden und kann als Fallback dienen.

## Affected Files

| File                                              | Line(s)  | Specific Issue                                                 |
| ------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `src/lib/services/daily-calc.ts`                  | 409-435  | `loadAbsenceDay` — kein `tenant_id`-Filter, Signatur erweitern |
| `src/lib/services/daily-value-repository.ts`      | 102-109  | `findUserIdForEmployee` — gleiches Pattern, bereits mit `tenantId` aber LEFT JOIN prüfen |
| `src/trpc/routers/bookings.ts`                    | 56-72    | `notifyTeamOfBookingChange` — Team-Mitglieder über `user_tenants` gefiltert, aber Team-Zugehörigkeit selbst nicht |

## Verification

### Automated

- [ ] Bestehende `daily-calc.helpers.test.ts` läuft unverändert grün
- [ ] Neuer Unit-Test: Zwei Tenants, identische `employee_id` per Test-Insert forcieren → `loadAbsenceDay(tenantA, empId, date)` liefert nur Tenant-A-Daten
- [ ] `pnpm test src/lib/services/__tests__/daily-calc.helpers.test.ts`
- [ ] `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Daily-Calc-Cron auf Staging mit realen Tenants laufen lassen → Ergebnisse identisch zur vorherigen Version
- [ ] Im SQL-Log keine neuen Fehler durch LEFT-JOIN-Erweiterung

## What NOT to Change

- Andere Raw-SQL-Queries mit bereits vorhandenem `tenant_id`-Filter — bleiben unangetastet
- `DailyCalcContext.absences.get(key)`-Cache-Pfad (L414-417) — der filtert bereits clientseitig pro Tenant
- Prisma-Schema — keine Migration nötig; die Spalten existieren bereits
- Andere Services, die Raw-SQL nutzen (`wh-*-repository.ts`, `reports-repository.ts` etc.) — diese wurden im Audit als OK bewertet

## Notes for Implementation Agent

- Der Daily-Calc-Pfad ist Hot-Path des Tagesabschlusses. Vor Merge Performance-Check: `EXPLAIN ANALYZE` der erweiterten Query vergleichen — zusätzlicher `tenant_id`-Filter sollte Index-Nutzung verbessern, nicht verschlechtern (Index `absence_days(tenant_id, employee_id, absence_date)` existiert typischerweise in Terp; falls nicht, separates Performance-Ticket anlegen, NICHT in diesem PR ändern).
- `tenantId` wird an `loadAbsenceDay` neu durchgereicht. Alle Callsites der Methode (innerhalb `daily-calc.ts`) anpassen. Falls öffentliche Signatur in Tests gemockt wird, Test-Mocks ebenfalls erweitern.
- Bei `notifyTeamOfBookingChange`: zusätzlich prüfen, ob `team_members.tenant_id` existiert und gefiltert werden sollte. Schema vor Änderung per `prisma/schema.prisma` oder `pnpm db:studio` verifizieren — nicht aus Erinnerung patchen.
- Nicht neue Queries erfinden. Nur die drei oben genannten File:Line-Stellen anpassen.
