---
date: 2026-04-22T21:40:48+02:00
researcher: Tolga
git_commit: 9b86c4de9760b757fc7ccea7f719b663ffbee388
branch: staging
repository: terp
topic: "Status-Audit: 7 Pro-Di Pre-Launch Pain Points + Datafox EVO Terminal-Integration"
tags: [research, audit, prodi-prelaunch, nachtschicht, datev, ueberstunden, probezeit, zeiten-nachfrage, vi-wochenenden, datafox, terminal]
status: complete
last_updated: 2026-04-22
last_updated_by: Tolga
---

# Research: Status-Audit der 7 Pro-Di Pre-Launch Pain Points + Datafox EVO

**Date**: 2026-04-22T21:40:48+02:00
**Researcher**: Tolga
**Git Commit**: 9b86c4de9760b757fc7ccea7f719b663ffbee388
**Branch**: staging
**Repository**: terp

## Research Question

Am 15.04.2026 wurden bei Pro-Di onsite 7 HR-Pain-Points identifiziert, die vor
Pro-Di-Launch als Pre-Launch-Tickets gelöst werden sollten. Plus: Status der
Datafox EVO 4.3 Terminal-Integration ist offen. Welche der 8 Punkte sind durch,
welche halb-durch, welche noch offen? Die Antwort muss auf tatsächlicher
Code-Inspektion basieren, nicht auf Memory-Einträgen.

## Summary

Von 8 geprüften Punkten sind **5 vollständig implementiert** (Nachtschicht,
DATEV-Zuschläge, Überstunden-Auszahlung, Probezeit, Überstundenantrag),
**3 offen** (Zeiten-Nachfrage, VI-Wochenenden, Datafox).

Pro-Di-spezifisch betrachtet: **alle 4 PFLICHT-Tickets (pflicht-01 bis
pflicht-04) sind implementiert und getestet**. Von den SOLL-Tickets ist
`soll-05` (Überstundenantrag, XL) überraschend fertig; `soll-06`
(Zeiten-Nachfrage) und `soll-07` (VI-Wochenenden) sind nicht angegangen.
`soll-08` (Zuschlagsvorlagen für Tarifverträge) steht im README-Graph, wurde
aber im Audit nicht als einer der 7 Pain Points behandelt (Pro-Di ist kein
Tarifkunde).

Die Datafox EVO 4.3-Integration hat **kein pre-launch-Ticket**, keine
Datafox-spezifische Implementation und keinen HTTP-Push-Endpoint. Was
existiert, ist ein generisches `RawTerminalBooking`-Modell plus tRPC-basiertes
Import-System (`terminalBookings.list`, `terminalBookings.import`) aus dem
allgemeinen ZMI-TICKET-027 Kontext. Für Hardware-Push-Integration wäre eine
eigene Feature-Spec nötig.

Nebenbefund: Bei den 5 implementierten Tickets fehlt bei Ticket 3
(Überstunden-Auszahlung) und Ticket 4 (Probezeit) noch der Handbuch-Abschnitt.
Bei Ticket 1 (Nachtschicht) existieren Unit-Tests für den neuen Helper, aber
keine dedizierten Integration-Tests, die absences-service mit `at_departure` /
`at_arrival` End-to-End prüfen.

## Status-Matrix

| # | Thema | Status | Thoughts-Dokumente | Code-Evidenz | Tests | Manuelle Verifikation nötig? |
|---|-------|--------|---------------------|--------------|-------|------------------------------|
| 1 | Nachtschicht-Bewertung | ✅ | [ticket DONE](../tickets/prodi-prelaunch/pflicht-01-nachtschicht-bewertungslogik-DONE.md), [plan](../plans/2026-04-16-pflicht-01-nachtschicht-bewertungslogik.md), [research](../research/2026-04-16-nachtschicht-bewertungslogik.md) | `shift-day-resolver.ts`, `absences-service.ts:109-469`, `daily-calc.helpers.ts:23`, UI-Warning `day-plan-form-sheet.tsx:867-878` | Unit-Tests `shift-day-resolver.test.ts` (439 LOC, 20+ Cases); **keine dedizierten absences-service Integration-Tests** mit `at_departure`/`at_arrival` gefunden | nein, aber Integration-Test-Lücke vor Launch schließen sinnvoll |
| 2 | DATEV-Zuschläge | ✅ | [ticket DONE](../tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege-DONE.md), [plan](../plans/2026-04-17-pflicht-02-datev-zuschlaege.md), [research](../research/2026-04-17-datev-zuschlaege.md) | `export-context-builder.ts:166` (accountValues), `liquid-engine.ts:100-122` (account:-Prefix), `day-plans-repository.ts:165-174` (updateBonus), `dayPlans.ts:686-720` (tRPC), `day-plan-detail-sheet.tsx:116-171` (Edit-UI), `seed.sql:557-559` (payrollCode) | `datev-zuschlaege.integration.test.ts`, `dayPlans-router.test.ts`, `day-plans-service.test.ts` | nein |
| 3 | Überstunden-Auszahlung | ✅ | [ticket](../tickets/prodi-prelaunch/pflicht-03-ueberstunden-auszahlung.md), [plan](../plans/2026-04-17-pflicht-03-ueberstunden-auszahlung.md), [research](../research/2026-04-17-ueberstunden-auszahlung.md), [impact-map](../research/2026-04-17-pflicht-03-ueberstunden-auszahlung-impact-map.md) | `OvertimePayout` Model `schema.prisma:3244`, `overtime-payout-service.ts` (274 LOC), `overtimePayouts.ts` (tRPC), `/admin/overtime-payouts/page.tsx`, Tariff-Form, Monthly-Values-Table erweitert, Lohnart `1010` in `payroll-export-service.ts:149` | `overtime-payout-service.test.ts` Unit, `.integration.test.ts` (343 LOC), `overtime-payout-close-flow.integration.test.ts` (729 LOC), E2E `67-overtime-payouts.spec.ts` (783 LOC) | nein; **Handbuch-Abschnitt fehlt** |
| 4 | Probezeit | ✅ | [ticket](../tickets/prodi-prelaunch/pflicht-04-probezeit-erkennung.md), [plan](../plans/2026-04-17-probezeit-erkennung-reminder.md), [research](../research/2026-04-17-probezeit-erkennung.md) | `probation-service.ts`, `probation-reminder-service.ts`, Cron `probation-reminders/route.ts` (05:15 UTC), Dashboard-Widget `probation-dashboard-widget.tsx`, Badge `probation-badge.tsx`, Employees-Filter `employees.ts:255`, Settings-Form `system-settings-form.tsx` | Unit `probation-service.test.ts`, `probation-reminder-service.test.ts`, Integration `employees-service.probation.integration.test.ts`, Cron Integration `580 LOC`, E2E `55-probezeit.spec.ts` (144 LOC) | nein; **Handbuch-Abschnitt fehlt** |
| 5 | Überstundenantrag | ✅ | [ticket](../tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md), [research](../research/2026-04-17-soll-05-ueberstundenantrag.md), [plan v2](../plans/2026-04-18-soll-05-ueberstundenantrag.md), [reopen-plan](../plans/2026-04-20-soll-05-reopen-required-toggle.md) | `OvertimeRequest` Model `schema.prisma:3317`, `OvertimeRequestConfig` `schema.prisma:3354`, `overtime-request-service.ts`, `arbzg-validator.ts`, `overtimeRequests.ts` (tRPC), 3 UI-Pages (`/overtime-requests`, `/admin/overtime-approvals`, `/admin/overtime-request-config`), Korrekturassistent-Integration (`daily-calc.ts:31`) | E2E `80-overtime-requests.spec.ts` (915 LOC, 33+ Tests, UC-OT-01..13) | nein; Handbuch + 4 separate Benutzerhandbücher vorhanden |
| 6 | Zeiten-Nachfrage | ❌ | [ticket](../tickets/prodi-prelaunch/soll-06-zeiten-nachfrage-workflow.md) nur | keine (kein `MissingTimeInquiry`-Model, kein Service, kein Cron, kein Router, keine UI) | keine | ja — Feature nicht implementiert, Pro-Di-Klärung zu offenen Fragen im Ticket |
| 7 | VI-Wochenenden | ❌ | [ticket](../tickets/prodi-prelaunch/soll-07-vi-wochenenden-optional.md) nur | keine (ShiftAssignment ohne `assignmentType`/`responseStatus`, kein `respond()`-Service, keine UI) | keine | ja — Feature nicht implementiert |
| 8 | Datafox EVO 4.3 | 🟡 | kein Pre-Launch-Ticket; nur allgemeiner ZMI-TICKET-027 (generisch) | Generisches `RawTerminalBooking` Model `schema.prisma:4570-4601`, `terminal-booking-service.ts`, `terminalBookings` tRPC-Router (List + Import-Batches). **Kein HTTP-Push-Endpoint, kein Datafox-spezifischer Parser, keine `DATAFOX_*` ENV-Vars** | `terminalBookings-router.test.ts` (nur für Import-CRUD) | ja — Hardware-Integration nicht gebaut; Entscheidung "Push vs. Import-Batch" wäre neu zu treffen |

**Status-Legende**:
- ✅ Durch: Code vorhanden, Tests vorhanden, Feature funktional
- 🟡 Halb-durch: Teilweise vorhanden (z.B. generisches Grundgerüst ohne spezifische Integration)
- ❌ Offen: Weder Code noch Plan über Ticket hinaus

## Detailed Findings

### 1. Nachtschicht-Bewertung — ✅ DONE

**Plan-Status in thoughts/**
- Ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-01-nachtschicht-bewertungslogik-DONE.md` (Dateiname markiert DONE)
- Plan: `thoughts/shared/plans/2026-04-16-pflicht-01-nachtschicht-bewertungslogik.md`
- Research: `thoughts/shared/research/2026-04-16-nachtschicht-bewertungslogik.md`
- README im prodi-prelaunch-Ordner listet es als durchgezogen.

**Code-Status**
- `src/lib/services/shift-day-resolver.ts` — Pure Function `resolveEffectiveWorkDay()` (Zeilen 58–132) plus `isNightShiftDayPlan()` (Zeilen 30–36). Exportiert auch die Interfaces `DayPlanInfo`, `EffectiveWorkDayResult`.
- `src/lib/services/absences-service.ts:109` — Import `resolveEffectiveWorkDay, type DayPlanInfo`.
- `src/lib/services/absences-service.ts:113-114` — JSDoc beschreibt explizit "Consumes dayChangeBehavior via resolveEffectiveWorkDay()".
- `src/lib/services/absences-service.ts:118-134` — `shouldSkipDate()` nutzt den neuen Helper.
- `src/lib/services/absences-service.ts:422` — Lädt `dp.dayPlan?.dayChangeBehavior`.
- `src/lib/services/absences-service.ts:469` — Aufruf in `createRange()`.
- `src/lib/services/daily-calc.helpers.ts:23` — Re-Export von `isNightShiftDayPlan` (gemeinsamer Helper wie im Plan vorgesehen).
- `src/components/day-plans/day-plan-form-sheet.tsx:867-878` — UI-Warning bei `auto_complete` über i18n-Key `dayChangeAutoCompleteWarning`.

**Test-Status**
- `src/lib/services/__tests__/shift-day-resolver.test.ts` — 439 Zeilen, Test-Cases für `isNightShiftDayPlan()` (5) und `resolveEffectiveWorkDay()` über alle 4 Modi (`none`, `at_departure`, `at_arrival`, 20+ Cases).
- **Lücke**: Der Agent meldet "Keine separaten Integrationstests für `absences-service` mit `at_departure`/`at_arrival` gefunden" — die Akzeptanzkriterien AK 7 und 12 im Ticket fordern explizite End-to-End-Tests für das Urlaubskonto und die Urlaubsstunden-Gutschrift (`vacation_balances.taken` UND `monthly_values.vacation_taken` müssen konsistent sein).
- Handbuch `docs/TERP_HANDBUCH.md` Abschnitt 6.5 (Zeilen 2702–2753) erweitert — Tabelle "Auswirkung auf Urlaubstage" für alle vier Modi, Praxisbeispiel (Zeilen 2742–2752), Hinweis zu `at_arrival` mit Beispiel-Urlaubswoche (Zeilen 2726–2740).

**Git-Log**
- Commit `021aa0aa` "Fix night-shift absence day assignment: consume dayChangeBehavior"
- Commit `c9ed7c24` "Fix cross-midnight surcharge & fixed-break overlap for night shifts" (Folge-Fix mit Surcharge-Kontext)

**Lücken**
- Integration-Tests für absences-service End-to-End pro `dayChangeBehavior`-Modus fehlen.
- Die duale vacationTaken-Konsistenz (`vacation_balances` vs. `monthly_values`) aus dem Ticket ist nicht explizit getestet.

**Empfohlene nächste Schritte**
- Integration-Test-Lücke vor Pro-Di-Go-Live schließen (Ticket zur Nachschärfung anlegen).

---

### 2. DATEV-Zuschläge — ✅ DONE

**Plan-Status in thoughts/**
- Ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-02-datev-zuschlaege-DONE.md` (DONE)
- Plan: `thoughts/shared/plans/2026-04-17-pflicht-02-datev-zuschlaege.md`
- Research: `thoughts/shared/research/2026-04-17-datev-zuschlaege.md`
- Ergänzend: `thoughts/shared/research/2026-04-17-datev-lodas-buchung-stunden-migration.md`, `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md`

**Code-Status**
- Block A (Export-Context):
  - `src/lib/services/export-context-builder.ts:166` — `accountValues: Record<string, number>` am `ExportContextEmployee`.
  - `src/lib/services/payroll-export-repository.ts:222-259` — `aggregateAccountValuesForContext()` (Shared Helper).
  - `src/lib/services/liquid-engine.ts:100-122` — `terp_value`-Filter mit `account:`-Prefix-Auflösung.
- Block B (updateBonus CRUD):
  - `src/lib/services/day-plans-repository.ts:165-174` — `updateBonus(prisma, bonusId, data)`.
  - `src/trpc/routers/dayPlans.ts:686-720` — tRPC Procedure mit `updateBonusInputSchema` (Zeile 294).
  - `src/hooks/use-day-plans.ts:199-216` — `useUpdateDayPlanBonus` mit Cache-Invalidierung.
  - `src/components/day-plans/day-plan-detail-sheet.tsx:116-171` — Edit-Mode (`editingBonusId`-State, `handleStartEditBonus`, `handleSaveEditBonus`).
- Block C (Seed + Handbuch):
  - `supabase/seed.sql:557-559` — NIGHT (1015), SAT (1020), SUN (1025) mit `payrollCode`.
  - `docs/TERP_HANDBUCH.md:1088, 1139-1160, 1162-1178` — Onboarding-Text, Praxisbeispiele Sonntagszuschlag und Feiertagszuschlag.

**Test-Status**
- `src/lib/services/__tests__/datev-zuschlaege.integration.test.ts` — End-to-End-Flow
- `src/trpc/routers/__tests__/dayPlans-router.test.ts`
- `src/lib/services/__tests__/day-plans-service.test.ts`

**Git-Log**
- Commit `d66366d3` "Add DATEV-Zuschläge end-to-end: surcharges in export templates + bonus update flow"

**Lücken**
- Keine erkennbaren Lücken gegenüber dem Plan.
- Block D (Post-Launch-Stubs) aus dem Plan existiert in `thoughts/shared/tickets/post-launch/` und `prodi-prelaunch/soll-08-zuschlagsvorlagen-tarifvertraege.md`.

**Empfohlene nächste Schritte**
- Ticket ist geschlossen. Vor Go-Live externen Onboarding-Task (Pro-Di-Steuerberater liefert finale Lohnarten-Codes) abarbeiten.

---

### 3. Überstunden-Auszahlung — ✅ DONE

**Plan-Status in thoughts/**
- Ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-03-ueberstunden-auszahlung.md` (**KEIN "-DONE" im Dateinamen**, obwohl Code fertig)
- Plan: `thoughts/shared/plans/2026-04-17-pflicht-03-ueberstunden-auszahlung.md`
- Research: `thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md` + Impact-Map `2026-04-17-pflicht-03-ueberstunden-auszahlung-impact-map.md`

**Code-Status**
- Prisma: `model OvertimePayout` `prisma/schema.prisma:3244`, `model EmployeeOvertimePayoutOverride` `:3279`, plus alle 6 `Tariff.overtimePayout*`-Felder.
- Services: `src/lib/services/overtime-payout-service.ts` (274 LOC), `overtime-payout-repository.ts` (153 LOC), `employee-overtime-payout-override-service.ts`, `employee-overtime-payout-override-repository.ts`.
- `src/lib/services/monthly-values-service.ts:20-25` — `close()` ruft Payout-Berechnung auf.
- tRPC: `src/trpc/routers/overtimePayouts.ts` (Output-Schema + procedures); `tariffs.ts:117-122` (Read) und `:182-185` (Update) um 6 Payout-Felder erweitert; in `_app.ts` registriert.
- UI: `src/app/[locale]/(dashboard)/admin/overtime-payouts/page.tsx` (Freigabe-Übersicht); Hooks `use-overtime-payouts.ts`, `use-employee-overtime-payout-overrides.ts`; `tariff-form-sheet.tsx` um 139+ Zeilen erweitert; `monthly-values-data-table.tsx` erweitert.
- DATEV-Export: Lohnart `1010` in `payroll-export-service.ts:149`, `overtimePayoutHours` in `ExportLine`-Interface Zeile 261, `payoutAgg`-Aggregation Zeile 421.

**Test-Status**
- Unit: `src/lib/services/__tests__/overtime-payout-service.test.ts`
- Integration: `overtime-payout-service.integration.test.ts` (343 LOC), `overtime-payout-close-flow.integration.test.ts` (729 LOC)
- E2E: `src/e2e-browser/67-overtime-payouts.spec.ts` (783 LOC)

**Git-Log**
- Commit `5316ef2f` "Implement configurable overtime payout workflows"
- Commit `e18f63e2` "Mark prodi-prelaunch pflicht-01/02 done, add pflicht-03 research + plan" (hat den Plan + Research angelegt, bevor Implementation kam)

**Lücken**
- **Handbuch-Abschnitt fehlt**: Der Research-Agent meldet "Abschnitt nicht in TERP_HANDBUCH.md nachweisbar". Das Ticket fordert explizit eine Handbuch-Erweiterung (Block E, AK 18).
- Ticket-Datei im prodi-prelaunch-Ordner trägt noch kein "-DONE"-Suffix (Dokumentations-/Housekeeping-Lücke).

**Empfohlene nächste Schritte**
- Handbuch-Abschnitt "Überstunden-Auszahlung konfigurieren" nachholen.
- Ticket umbenennen auf `-DONE`-Suffix.

---

### 4. Probezeit — ✅ DONE

**Plan-Status in thoughts/**
- Ticket: `thoughts/shared/tickets/prodi-prelaunch/pflicht-04-probezeit-erkennung.md` (KEIN "-DONE" im Dateinamen)
- Plan: `thoughts/shared/plans/2026-04-17-probezeit-erkennung-reminder.md`
- Research: `thoughts/shared/research/2026-04-17-probezeit-erkennung.md`

**Code-Status**
- Services: `src/lib/services/probation-service.ts` mit `computeProbationEndDate()` (Zeile 96), `DEFAULT_PROBATION_MONTHS = 6` (Zeile 3), `DEFAULT_PROBATION_REMINDER_DAYS = [28, 14, 7]` (Zeile 4). Repository `probation-repository.ts`, Reminder `probation-reminder-service.ts`.
- Cron: `src/app/api/cron/probation-reminders/route.ts` — täglich um 05:15 UTC (Zeile 76), Notification-Kategorie `"reminders"` (Zeile 19).
- Schema: `model EmployeeProbationReminder` mit Unique-Constraint `(tenant, employee, reminderDaysBefore, probationEndDate)` — erfüllt AK 6 (Dedupe pro berechnetem Enddatum).
- Dashboard-Widget: `src/components/dashboard/probation-dashboard-widget.tsx`, verwendet in `src/app/[locale]/(dashboard)/dashboard/page.tsx`, Hook `use-probation-dashboard.ts`.
- Badge: `src/components/employees/probation-badge.tsx` — zeigt `'in_probation'` oder `'ends_in_30_days'`.
- Filter: `src/trpc/routers/employees.ts:255` — `probationStatus: z.enum(PROBATION_FILTERS)` mit Werten `"ALL" | "IN_PROBATION" | "ENDS_IN_30_DAYS" | "ENDED"` (serverseitig).
- Admin-Settings: `src/components/settings/system-settings-form.tsx:32-34, 59-61, 153-155` — `probationDefaultMonths`, `probationRemindersEnabled`, `probationReminderDays[]`.

**Test-Status**
- Unit: `probation-service.test.ts`, `probation-reminder-service.test.ts`
- Integration: `employees-service.probation.integration.test.ts`, `cron/probation-reminders/__tests__/integration.test.ts` (580 LOC), `route.test.ts` (164 LOC)
- E2E: `src/e2e-browser/55-probezeit.spec.ts` (144 LOC, seeded Employee E2EPROB-001)

**Git-Log**
- Commit `3101760f` "Add probation detection + reminder feature" — 17 Files (service/*probation*, cron, dashboard-widget, badge, settings-form)

**Lücken**
- **Handbuch-Abschnitt fehlt** (Agent: grep ohne Treffer).
- Ticket-Datei ohne `-DONE`-Suffix (Housekeeping).

**Empfohlene nächste Schritte**
- Handbuch-Abschnitt ergänzen.
- Ticket auf `-DONE` umbenennen.

---

### 5. Überstundenantrag — ✅ DONE

**Plan-Status in thoughts/**
- Ticket: `thoughts/shared/tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md` (KEIN "-DONE")
- Research: `thoughts/shared/research/2026-04-17-soll-05-ueberstundenantrag.md`
- Plan v2: `thoughts/shared/plans/2026-04-18-soll-05-ueberstundenantrag.md` (status: ready-for-implementation, revision 2 vom 2026-04-20)
- Reopen-Toggle-Plan: `thoughts/shared/plans/2026-04-20-soll-05-reopen-required-toggle.md`

**Code-Status**
- Schema: `model OvertimeRequest` `schema.prisma:3317-3343` (alle im Ticket geforderten Felder inkl. `arbzgWarnings String[]`, `arbzgOverrideReason`). `model OvertimeRequestConfig` `:3354-3366` als Singleton pro Tenant mit `approvalRequired` (Default `true`), `leadTimeHours`, `monthlyWarnThresholdMinutes`, `escalationThresholdMinutes`, **`reopenRequired`** (Boolean, Default `true`).
- Services:
  - `src/lib/services/overtime-request-service.ts` (create, approve, reject, cancel, cancelReopen)
  - `src/lib/services/arbzg-validator.ts` — Phase 1: §3 `DAILY_MAX_EXCEEDED`, §5 `REST_TIME_VIOLATED`, §9 `SUNDAY_WORK`
  - `src/lib/services/overtime-request-repository.ts`
  - `src/lib/services/overtime-request-config-service.ts`
- DailyCalc: `src/lib/services/daily-calc.ts:31` führt `ERR_UNAPPROVED_OVERTIME` ein, Zeile 1173-1192 validiert "overtime > 0 ohne genehmigten OvertimeRequest".
- tRPC: `src/trpc/routers/overtimeRequests.ts` (create, approve, reject, list, getById, pending, cancel, cancelReopen), `overtimeRequestConfig.ts` (Admin-CRUD), in `_app.ts` registriert. Permissions: `overtime.request`, `overtime.approve`, `overtime.approve_escalated`.
- UI: 3 Pages (`/overtime-requests`, `/admin/overtime-approvals`, `/admin/overtime-request-config`) + Components `overtime-request-form.tsx`, `overtime-request-list.tsx`, `overtime-approval-dialogs.tsx` (mit ArbZG-Override-Dialog).
- Korrekturassistent: `correction-assistant-detail-sheet.tsx:74+` mit CTA "Als Überstunden genehmigen".

**Test-Status**
- E2E: `src/e2e-browser/80-overtime-requests.spec.ts` — 915 LOC, 33+ Tests für UC-OT-01..13 (config toggles, create/cancel, approve/reject, ArbZG overrides, escalation gate, reopen gate, race conditions). Seed-Fixtures: `approver@dev.local`, `hr@dev.local`.
- Helper: `src/e2e-browser/helpers/overtime-fixtures.ts`.
- Unit/Integration-Tests im `__tests__/`-Konvention, nicht vom Agent explizit enumeriert.

**Git-Log**
- Commit `4ce006b2` "Add Überstundenanträge (soll-05) + reopen-required toggle" (21.04.2026). Änderte u.a. `schema.prisma` (+76), Pages + Components, i18n (+132/+132 de/en), 4× `docs/benutzerhandbuecher/*.md`.

**Bewusste Deferments aus Plan v2**
- `ApprovalRule`-Tabelle — **Deferred D1**: Approver-Ermittlung läuft über Permissions-RBAC (`overtime.approve`, `overtime.approve_escalated`), nicht über konfigurierbare Rollen-Tabelle.
- `utilizationType`-Field — **Deferred D2**: Post-launch mit Ticket 3.1.
- 48h/6-Monats-Schnitt ArbZG — **Deferred D3**: Phase-2.
- Diese Verkleinerung hat den T-Shirt-Scope von XL auf L reduziert.

**Lücken**
- Laut Ticket (AK 10): "Mehrstufige Genehmigung als Konfigurations-Option". Plan D1 verwirft die konfigurierbare `ApprovalRule`-Tabelle zugunsten von Permissions. Mehrstufigkeit existiert in Form von `overtime.approve_escalated`-Permission und `escalationThresholdMinutes`-Config; eine generische Stage-Liste wie im Ticket-Entwurf gibt es nicht. Das ist bewusste Plan-Entscheidung und kein Bug.
- Handbuch: TERP_HANDBUCH.md erweitert (Zeile 340, 591, 3322+, 3390+) **plus** 4 separate Benutzerhandbücher (`ueberstundenantraege.md`, `ueberstunden-genehmigungen.md`, `ueberstundenantrag-konfiguration.md`, `korrekturassistent.md` +28 LOC).

**Empfohlene nächste Schritte**
- Ticket auf `-DONE` umbenennen.
- Die Deferments D1/D2/D3 nachverfolgen, falls ein Tarifkunde eine mehrstufige Rollen-Tabelle oder 6-Monats-Schnitt braucht.

---

### 6. Zeiten-Nachfrage — ❌ OPEN

**Plan-Status in thoughts/**
- Nur das Ticket selbst: `thoughts/shared/tickets/prodi-prelaunch/soll-06-zeiten-nachfrage-workflow.md` (detailliert, T-Shirt M, Akzeptanzkriterien + Tests + technische Skizze).
- **Kein** Plan, **keine** Research-Datei.

**Code-Status**
- **Kein** `MissingTimeInquiry`, `MissingTimeConfig`, `MissingTimeOption`-Model in `prisma/schema.prisma`.
- **Kein** `src/lib/services/missing-time-service.ts`.
- **Keine** Cron-Route `src/app/api/cron/missing-time-check/route.ts`.
- **Kein** tRPC-Router `missingTimeInquiries.ts`.
- **Keine** UI-Komponenten (Schnellauswahl-Dialog, Dashboard-Widget, Admin-Settings).

**Test-Status**
- Keine Tests.

**Git-Log**
- Keine Commits mit "missing-time", "Nachfrage", "soll-06" in den letzten 4 Wochen.

**Lücken**
- Das Ticket hat im README 6 offene Pro-Di-Fragen (Check-Frequenz, Eskalationsfrist, Optionen, Auto-Approve bei Krank, Empfänger, Nachtragung durch MA selbst). Das ist der Blocker — vor Implementation braucht es Pro-Di-Klärung.

**Empfohlene nächste Schritte**
- Ticket zur Klärung mit Pro-Di planen (Fragen 17–19 aus README).
- Danach /create_plan oder als Post-Launch klassifizieren, falls nicht Launch-kritisch.

---

### 7. VI-Wochenenden — ❌ OPEN

**Plan-Status in thoughts/**
- Nur das Ticket: `thoughts/shared/tickets/prodi-prelaunch/soll-07-vi-wochenenden-optional.md` (detailliert, T-Shirt M, Design-Entscheidungen vorbereitet).
- **Kein** Plan, **keine** Research-Datei.
- "VI" im Ticket = "Verfügbarkeitsabsicherung" (Wochenend-Schichten als optionales Angebot).

**Code-Status**
- `ShiftAssignment` in `prisma/schema.prisma` hat nur `id`, `tenantId`, `employeeId`, `shiftId`, `validFrom`, `validTo`, `notes`, `isActive`, `createdAt`, `updatedAt`. **Keine** Felder `assignmentType`, `responseStatus`, `responseAt`, `responseDeadline`.
- Migration `supabase/migrations/20260101000077_create_shift_planning.sql` zeigt das gleiche Schema — nichts erweitert.
- `src/lib/services/shift-service.ts` hat nur CRUD (list, getById, create, update, delete). **Keine** `respond()`-Methode.
- `src/trpc/routers/shifts.ts` hat keine `respondToOptionalShift`-Procedure.
- Keine UI-Komponenten `OptionalShiftBadge`, `ShiftResponseButton`, `ShiftResponseSummary`.

**Test-Status**
- Keine Tests.

**Git-Log**
- Keine Commits mit "optional shift", "OPTIONAL_OFFER", "vi-wochen", "soll-07".

**Lücken**
- Das Ticket hat 6 offene Pro-Di-Fragen (Antwortfrist, Mindestbesetzung, Zuschläge für Annehmende, Wiederholungsmuster, Absage nach Annahme). Das ist der Blocker.

**Empfohlene nächste Schritte**
- Ticket zur Klärung mit Pro-Di planen (Fragen 20–22 aus README).
- Klassifizierung nach Klärung: echtes Launch-Blocker oder Post-Launch (Pro-Di kann die Schichten auch manuell in WhatsApp anbieten, bis das Feature da ist).

---

### 8. Datafox EVO 4.3 Terminal-Integration — 🟡 NICHT DATAFOX-SPEZIFISCH

**Plan-Status in thoughts/**
- **Kein** Pre-Launch-Ticket im `prodi-prelaunch/`-Ordner.
- Existierende Tickets zum Thema: `ZMI-TICKET-027-terminal-integration.md` (generisch) und `ZMI-TICKET-225-terminal-bookings-vehicles-trip-records.md` — beides ZMI-Herkunft, **kein Hersteller-Bezug**, kein "Datafox" oder "EVO" im Text.

**Code-Status**
- `model RawTerminalBooking` `prisma/schema.prisma:4570-4601` — generisches Rohdaten-Modell.
- `src/lib/services/terminal-booking-service.ts`, `terminal-booking-repository.ts` — allgemeine Import/List-Verwaltung.
- tRPC: `src/trpc/routers/terminalBookings.ts` mit `list`, `import`, `batches` Procedures — **tRPC-basiertes Import-System, KEIN HTTP-Push-Endpoint**.
- **Keine** Datafox-spezifischen Parser (XML/JSON-Payload vom Datafox-Terminal).
- **Keine** `/api/terminal/`, `/api/datafox/`, `/api/webhooks/terminal/` HTTP-Routen.
- **Keine** `DATAFOX_*`- oder `TERMINAL_*`-ENV-Variablen in `.env*` oder `src/lib/config.ts`.

**Test-Status**
- `src/trpc/routers/__tests__/terminalBookings-router.test.ts` — nur für die List/Import-Prozeduren, nicht für Hardware-Push.

**Git-Log**
- Historie: 0 Commits mit "datafox" oder "Datafox". Auch in den letzten 4 Wochen nichts.
- Referenz: Commit `f9092a10` "Implement contact management, employee messages, and terminal integration (ZMI-TICKET-025, 026, 027)" — generisch, kein Datafox.

**Lücken**
- **Kein HTTP-Push-Endpoint** — Datafox EVO 4.3 kann per HTTP POST pushen, aber Terp hat nichts zum Empfangen.
- Keine Datafox-Payload-Parser.
- Keine Device-Discovery-Integration (`arp-scan`).
- Kein DatafoxStudio-Config-Hinweis.
- Memory-Eintrag über "HTTP-Push-Endpoint-Ansatz gewählt" deckt sich nicht mit der Code-Realität.

**Empfohlene nächste Schritte**
- Pre-Launch-Ticket für Datafox-Integration neu schreiben (Research + Design-Entscheidung Push vs. Batch-Import).
- Vor Pro-Di-Go-Live klären: Nutzt Pro-Di wirklich das Datafox EVO 4.3, oder wird die Erfassung in der Anfangszeit rein über Terp-Web-UI laufen?

## Code References

### Pain Point 1 (Nachtschicht)
- `src/lib/services/shift-day-resolver.ts:58-132` — `resolveEffectiveWorkDay()` Pure Function
- `src/lib/services/absences-service.ts:109,113-114,118-134,422,469` — Konsumierung des Helpers
- `src/lib/services/daily-calc.helpers.ts:23` — Re-Export `isNightShiftDayPlan`
- `src/components/day-plans/day-plan-form-sheet.tsx:867-878` — i18n-Warning
- `src/lib/services/__tests__/shift-day-resolver.test.ts` — 439 LOC Unit-Tests
- `docs/TERP_HANDBUCH.md:2702-2753` — Abschnitt 6.5 erweitert

### Pain Point 2 (DATEV)
- `src/lib/services/export-context-builder.ts:166` — `accountValues` Property
- `src/lib/services/payroll-export-repository.ts:222-259` — `aggregateAccountValuesForContext`
- `src/lib/services/liquid-engine.ts:100-122` — `terp_value`-Filter mit `account:`-Prefix
- `src/lib/services/day-plans-repository.ts:165-174` — `updateBonus`
- `src/trpc/routers/dayPlans.ts:686-720` — tRPC Procedure, Schema Zeile 294
- `src/hooks/use-day-plans.ts:199-216` — `useUpdateDayPlanBonus`
- `src/components/day-plans/day-plan-detail-sheet.tsx:116-171` — Edit-UI
- `supabase/seed.sql:557-559` — payrollCodes
- `docs/TERP_HANDBUCH.md:1088,1139-1160,1162-1178` — Handbuch-Erweiterung

### Pain Point 3 (Überstunden-Auszahlung)
- `prisma/schema.prisma:3244,3279` — `OvertimePayout`, `EmployeeOvertimePayoutOverride`
- `src/lib/services/overtime-payout-service.ts` — 274 LOC
- `src/lib/services/overtime-payout-repository.ts` — 153 LOC
- `src/lib/services/monthly-values-service.ts:20-25` — Close-Integration
- `src/trpc/routers/overtimePayouts.ts` — Router
- `src/app/[locale]/(dashboard)/admin/overtime-payouts/page.tsx` — Freigabe-Seite
- `src/lib/services/payroll-export-service.ts:149,261,421` — Lohnart `1010` Integration
- E2E: `src/e2e-browser/67-overtime-payouts.spec.ts` — 783 LOC

### Pain Point 4 (Probezeit)
- `src/lib/services/probation-service.ts:3,4,96` — Defaults + `computeProbationEndDate()`
- `src/lib/services/probation-reminder-service.ts` — Reminder-Logik
- `src/app/api/cron/probation-reminders/route.ts:19,76` — Cron 05:15 UTC
- `prisma/schema.prisma:3743` — `EmployeeProbationReminder` Model mit Unique-Constraint
- `src/components/dashboard/probation-dashboard-widget.tsx` — Widget
- `src/components/employees/probation-badge.tsx` — Badge
- `src/trpc/routers/employees.ts:255` — Filter
- `src/components/settings/system-settings-form.tsx:32-34,59-61,153-155` — Admin-Settings
- E2E: `src/e2e-browser/55-probezeit.spec.ts` — 144 LOC

### Pain Point 5 (Überstundenantrag)
- `prisma/schema.prisma:3317-3343,3354-3366` — Models
- `src/lib/services/overtime-request-service.ts`
- `src/lib/services/arbzg-validator.ts` — Phase 1 ArbZG §3, §5, §9
- `src/lib/services/daily-calc.ts:31,1173-1192` — `ERR_UNAPPROVED_OVERTIME`
- `src/trpc/routers/overtimeRequests.ts`, `overtimeRequestConfig.ts`
- UI: `/overtime-requests`, `/admin/overtime-approvals`, `/admin/overtime-request-config`
- `src/components/overtime-requests/overtime-approval-dialogs.tsx` — ArbZG-Override
- `src/components/correction-assistant/correction-assistant-detail-sheet.tsx:74+` — CTA
- E2E: `src/e2e-browser/80-overtime-requests.spec.ts` — 915 LOC, 33+ Tests
- `docs/benutzerhandbuecher/ueberstundenantraege.md` (11.969 B), `ueberstunden-genehmigungen.md` (9.783 B), `ueberstundenantrag-konfiguration.md` (10.614 B)

### Pain Point 8 (Datafox)
- `prisma/schema.prisma:4570-4601` — Generisches `RawTerminalBooking`
- `src/lib/services/terminal-booking-service.ts`, `terminal-booking-repository.ts`
- `src/trpc/routers/terminalBookings.ts` — tRPC-basierter Import
- `src/trpc/routers/__tests__/terminalBookings-router.test.ts`

## Architecture Documentation

Beobachtung zu den 5 implementierten Tickets: Das Team arbeitet nach einem
konsistenten **Thoughts-getriebenen Prozess**:

1. Ticket im `thoughts/shared/tickets/prodi-prelaunch/`-Ordner definiert (mit
   Akzeptanzkriterien und Test-Anforderungen bereits pflicht-granular).
2. Research-Datei in `thoughts/shared/research/YYYY-MM-DD-<topic>.md` — prüft
   Ist-Zustand des Codes.
3. Plan in `thoughts/shared/plans/YYYY-MM-DD-<topic>.md` — konkretisiert Blöcke,
   Test-Setups, Deferments.
4. Implementation per Single-Commit (z.B. `4ce006b2`, `5316ef2f`, `3101760f`,
   `d66366d3`, `021aa0aa`).
5. Wenn Ticket fertig: Datei auf `-DONE.md` umbenennen (noch **nicht einheitlich**
   umgesetzt — pflicht-03, pflicht-04, soll-05 fehlen das Suffix trotz fertigem
   Code).

Das erklärt, warum der README-Graph im `prodi-prelaunch/`-Ordner bereits die
serielle Reihenfolge 1 → 2 → 3 → 5 abgebildet hat (siehe
`thoughts/shared/tickets/prodi-prelaunch/README.md:44-52`) und warum die
Deferments in `soll-05` (D1 ApprovalRule, D2 utilizationType, D3 48h-Schnitt)
explizit im Plan dokumentiert sind, nicht nur im Code vorausgesetzt.

## Historical Context (from thoughts/)

### Relevante Research-Dokumente

- `thoughts/shared/research/2026-04-16-nachtschicht-bewertungslogik.md` — Code-Audit vor Implementation pflicht-01
- `thoughts/shared/research/2026-04-17-datev-zuschlaege.md` — Research vor pflicht-02 (zeigt End-to-End-Flow)
- `thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md` — Hauptresearch pflicht-03
- `thoughts/shared/research/2026-04-17-pflicht-03-ueberstunden-auszahlung-impact-map.md` — Secondary Research
- `thoughts/shared/research/2026-04-17-probezeit-erkennung.md` — Research pflicht-04
- `thoughts/shared/research/2026-04-17-soll-05-ueberstundenantrag.md` — Research soll-05
- `thoughts/shared/research/2026-04-08-datev-lohn-vollstaendiger-datenlieferant.md` — Kontext für Lohn-Export

### Relevante Pläne

- `thoughts/shared/plans/2026-04-16-pflicht-01-nachtschicht-bewertungslogik.md`
- `thoughts/shared/plans/2026-04-17-pflicht-02-datev-zuschlaege.md`
- `thoughts/shared/plans/2026-04-17-pflicht-03-ueberstunden-auszahlung.md`
- `thoughts/shared/plans/2026-04-17-probezeit-erkennung-reminder.md`
- `thoughts/shared/plans/2026-04-18-soll-05-ueberstundenantrag.md` (status: ready-for-implementation, rev 2)
- `thoughts/shared/plans/2026-04-20-soll-05-reopen-required-toggle.md` — Folge-Iteration

### Relevante Commits (Pro-Di Pre-Launch Arbeit)

- `e18f63e2` — Mark prodi-prelaunch pflicht-01/02 done, add pflicht-03 research + plan
- `021aa0aa` — Fix night-shift absence day assignment: consume dayChangeBehavior (Pain Point 1)
- `c9ed7c24` — Fix cross-midnight surcharge & fixed-break overlap for night shifts (Folge-Fix)
- `d66366d3` — Add DATEV-Zuschläge end-to-end: surcharges in export templates + bonus update flow (Pain Point 2)
- `5316ef2f` — Implement configurable overtime payout workflows (Pain Point 3)
- `3101760f` — Add probation detection + reminder feature (Pain Point 4)
- `4ce006b2` — Add Überstundenanträge (soll-05) + reopen-required toggle (Pain Point 5)

## Gesamt-Empfehlung

**Überraschend offen und priorisierungs-relevant:**

1. **Datafox EVO** (🟡) — Kein Ticket, kein Code, kein Plan. Wenn Pro-Di
   tatsächlich am Launch-Tag mit EVO 4.3-Hardware erfassen soll, ist das der
   größte ungeplante Brocken. Entscheidung vor Ticket-Schreibung: Push vs.
   Batch-Import, Datafox-Studio-Config-Weg, Device-Discovery.
2. **Handbuch-Lücken bei pflicht-03 und pflicht-04** — Code fertig, aber die
   im Ticket geforderten Handbuch-Abschnitte fehlen. Nicht Launch-Blocker,
   aber für das interne "Handbuch als Acceptance-Test"-Prinzip (siehe
   Memory `feedback_handbook_verification.md`) relevant.
3. **Integration-Test-Lücke bei pflicht-01** — Der neue Helper ist Unit-
   getestet, aber das End-to-End-Verhalten über `absences-service` mit
   `at_departure`/`at_arrival` hat keine dedizierten Integration-Tests; die
   im Ticket AK 7/12 geforderten `vacation_balances`- vs. `monthly_values`-
   Konsistenz-Tests sind nicht auffindbar.

**Offen, aber nicht Pro-Di-Launch-kritisch:**

4. **soll-06 (Zeiten-Nachfrage)** und **soll-07 (VI-Wochenenden)** — beides
   SOLL-Tickets (nicht PFLICHT), und beide haben offene Pro-Di-Fragen im
   README (Fragen 17–22). Bis zur Klärung mit Pro-Di ist /create_plan
   verfrüht. Pro-Di kann diese Prozesse in der Anfangszeit manuell (WhatsApp/
   Telefon) fahren, wie sie es heute bereits tun.

**Bündelung:**

- Tickets für Handbuch-Nachtrag pflicht-03 + pflicht-04 **bündeln** — beides
  sind dokumentationsgetriebene Nachschärfungen, beide betreffen HR-Workflows,
  beide können in einem Sprint zusammengezogen werden.
- Housekeeping-Ticket "Dateinamen auf `-DONE` umbenennen" für pflicht-03,
  pflicht-04, soll-05 — trivial, aber unterstützt das Ticket-Tracking.
- Datafox **einzeln** angehen — bedarf Research + Design + Hardware-Zugang;
  nicht mit anderen Themen vermischen.
- soll-06 und soll-07 **gemeinsam** in einem Pro-Di-Klärungsgespräch lösen
  (beide blockiert durch offene Fragen, beide SOLL-Scope).

## Open Questions

- Ist Datafox EVO 4.3-Integration wirklich zum Go-Live nötig, oder kann Pro-Di
  mit Web-UI-Erfassung starten und die Terminal-Hardware nachträglich
  dazukommen?
- Gilt Pro-Di-Cutover als "Frischstart" ohne historischen Stundenübertrag, oder
  braucht es Daten-Migration aus ZMI-orgAuftrag? (Im pflicht-01-Ticket als
  "Out of Scope: separates Ticket zum Cutover-Planungszeitpunkt" markiert.)
- Welche Bedeutung haben soll-06/soll-07 für Pro-Di wirklich? Der
  Pro-Di-Klärungsfragen-Block im README suggeriert, dass Pro-Di selbst noch
  nicht klar hat, wie sie diese Workflows haben wollen.
