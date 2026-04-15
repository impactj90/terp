---
topic: employees-service.create soll VacationBalance automatisch erzeugen
status: backlog
source_plan: thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md
---

# VacationBalance Lazy-Create in employees-service.create

## Problem

Aktuell wird eine `VacationBalance`-Row nur implizit erzeugt, wenn der
Urlaubs-Flow sie das erste Mal explizit braucht. Das führt zu
`VacationBalanceNotFoundError`, wenn ein Employee in der UI angezeigt
wird, bevor der erste Urlaubsantrag läuft.

## Lösung

`employees-service.create(...)` erzeugt am Ende der Transaktion eine
`VacationBalance` für das aktuelle Kalenderjahr mit den Default-Werten
aus den Tenant-Settings (z.B. 30 Urlaubstage) oder dem Employee-Tariff.

## Akzeptanzkriterien

- [ ] Neue Employees haben direkt nach `employees-service.create` eine
      Row in `vacation_balances`.
- [ ] Unit-Test im `employees-service.test.ts`.
- [ ] Kein Verhaltens-Regress beim bestehenden Urlaubs-Flow.
- [ ] Migration oder One-Off-Backfill für bestehende Employees ohne
      VacationBalance.

## Referenzen

- Plan: `thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md`
- Related: `vacation-balance-showcase-fix.md` (würde mit diesem Fix automatisch mitgezogen)
