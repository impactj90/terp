---
topic: VacationBalance-Lücke im Showcase-Template fixen
status: backlog
source_plan: thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md
flag: K5 (Research), Scope-Cut in Phase 9 (Plan)
---

# VacationBalance-Lücke im Showcase-Template fixen

## Problem

Das Showcase-Template `industriedienstleister_150` seedet 150 Employees, legt
aber KEINE `VacationBalance`-Rows für diese Employees an. In der Urlaubs-UI
führt das zu `VacationBalanceNotFoundError` (aka `NOT_FOUND` im Client),
sobald ein Demo-Admin sich einen Mitarbeiter anzeigen lässt.

Der Bug existiert seit Phase 10b (Demo-Tenant-Migration); er ist unabhängig
vom Starter-Thema und wurde aus dem Starter-Plan bewusst herausgecuttet
(Plan-Scope-Cut Phase 9).

## Lösung

Im `applySeedData`-Body des `industriedienstleisterShowcase`-Templates
(`src/lib/tenant-templates/templates/industriedienstleister/showcase.ts`)
nach `seedEmployees` einen neuen Helper `seedVacationBalances(tx, tenantId,
employees, currentYear)` aufrufen, der für jeden Employee eine Row in
`vacation_balances` mit `year=currentYear, baseDays=30, usedDays=0,
remainingDays=30` anlegt.

## Akzeptanzkriterien

- [ ] Showcase-Integration-Test `industriedienstleister_150.integration.test.ts`
      erweitert sich um `expect(c.vacationBalances).toBe(150)`.
- [ ] Demo-Tenant-Login → Mitarbeiter-Detail → Urlaub-Tab wirft KEIN
      `NOT_FOUND` mehr.
- [ ] Bestehende Counts bleiben unverändert.

## Referenzen

- Research: `thoughts/shared/research/2026-04-14-demo-template-starter-variant.md` (K5)
- Plan: `thoughts/shared/plans/2026-04-14-tenant-template-starter-variant.md` (Phase 9 Scope-Cut)
