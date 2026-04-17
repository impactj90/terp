---
date: 2026-04-17T19:00:43+02:00
researcher: impactj90
git_commit: c9ed7c24153ff78928581bbf5600ae0b44d76dac
branch: staging
repository: terp
topic: "Probezeit-Erkennung: Quick Research fuer Ticket 4"
tags: [research, codebase, employees, notifications, dashboard, cron, filters, probation]
status: complete
last_updated: 2026-04-17
last_updated_by: impactj90
---

# Research: Probezeit-Erkennung

**Date**: 2026-04-17T19:00:43+02:00
**Researcher**: impactj90
**Git Commit**: c9ed7c24153ff78928581bbf5600ae0b44d76dac
**Branch**: staging
**Repository**: terp

## Research Question

Kurzer Codebase-Check fuer Ticket 4 "Probezeit-Erkennung + Reminder" mit Fokus auf:

1. Employee-Modell / Probezeit-Felder
2. Notification-System
3. Dashboard
4. Cron-Job-Pattern
5. Mitarbeiterlisten-Filter

## Summary

- `Employee.entryDate` ist im Prisma-Modell ein nicht-nullbares `DateTime @db.Date`; `Employee.exitDate` ist nullable; `Employee.probationMonths` ist `Int? @db.SmallInt` ohne Default in Schema oder Einfuehrungs-Migration. Siehe [prisma/schema.prisma](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/prisma/schema.prisma#L1849-L1945) und [supabase/migrations/20260416100000_add_payroll_master_data.sql](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/supabase/migrations/20260416100000_add_payroll_master_data.sql#L89-L94).
- Aktuell gibt es im Code keine vorhandene Berechnung oder Modellspalte fuer `probationEndDate` und keinen `isProbation`-Computed-Field. `probationMonths` wird derzeit nur als Stammdatenfeld exponiert, vor allem im Employees-tRPC-Output und im Payroll-Tab "Compensation". Siehe [src/trpc/routers/employees.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/employees.ts#L50-L159) und [src/components/employees/payroll/compensation-tab.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/employees/payroll/compensation-tab.tsx#L29-L291).
- Ein bestehendes In-App-Notification-System ist vorhanden: Prisma-Modelle `Notification` und `NotificationPreference`, tRPC-Router fuer Liste/Read/Preferences, Header-Bell, `/notifications`-Seite und Realtime-Subscription `notifications.onEvent`. Siehe [prisma/schema.prisma](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/prisma/schema.prisma#L3373-L3426), [src/trpc/routers/notifications.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/notifications.ts#L1-L379) und [src/components/layout/notifications.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/layout/notifications.tsx#L1-L168).
- Das aktuelle `/dashboard` ist ein persoenliches Dashboard und besteht aus Quick Actions, vier KPI-Karten, Pending Actions, Recent Activity und einem HR-Widget (`PersonnelFileDashboardWidget`). Siehe [src/app/[locale]/(dashboard)/dashboard/page.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/%5Blocale%5D/%28dashboard%29/dashboard/page.tsx#L1-L80).
- Die Mitarbeiterliste filtert aktuell serverseitig ueber `useEmployees -> trpc.employees.list -> employeesService.list -> employeesRepository.findMany`. Die UI exponiert Suche, Status, Department und Location; im Router/Service existieren zusaetzlich `costCenterId`, `employmentTypeId` und `hasExitDate`. Siehe [src/app/[locale]/(dashboard)/admin/employees/page.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/%5Blocale%5D/%28dashboard%29/admin/employees/page.tsx#L31-L260), [src/hooks/use-employees.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-employees.ts#L6-L37), [src/trpc/routers/employees.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/employees.ts#L221-L233), [src/lib/services/employees-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/employees-service.ts#L81-L150) und [src/lib/services/employees-repository.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/employees-repository.ts#L12-L37).

## Detailed Findings

### 1. Employee-Modell

- `Employee.entryDate` ist in `model Employee` als `DateTime @map("entry_date") @db.Date` definiert und nicht nullable. `Employee.exitDate` ist `DateTime? @map("exit_date") @db.Date`. `Employee.probationMonths` ist `Int? @map("probation_months") @db.SmallInt`. Siehe [prisma/schema.prisma](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/prisma/schema.prisma#L1849-L1945).
- Die Einfuehrungs-Migration `20260416100000_add_payroll_master_data.sql` fuegt `probation_months SMALLINT` ohne `DEFAULT` hinzu; `contract_type`, `notice_period_employee` und `notice_period_employer` werden in derselben Gruppe angelegt. Siehe [supabase/migrations/20260416100000_add_payroll_master_data.sql](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/supabase/migrations/20260416100000_add_payroll_master_data.sql#L89-L94).
- Im Employees-Router ist `entryDate` bei `createEmployeeInputSchema` Pflichtfeld (`z.coerce.date()`), `exitDate` optional, und `probationMonths` erscheint nur im Update-Schema als `z.number().int().nullable().optional()`. Siehe [src/trpc/routers/employees.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/employees.ts#L235-L416).
- `employeesService.create()` verlangt `entryDate: Date`, validiert `exitDate >= entryDate` und speichert `exitDate ?? null`; `employeesService.update()` behandelt `entryDate`, `exitDate` und `probationMonths` als normale Felder ohne Probezeit-spezifische Folgelogik. Siehe [src/lib/services/employees-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/employees-service.ts#L170-L320) und [src/lib/services/employees-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/employees-service.ts#L374-L907).
- `employeesRepository.findByIdWithRelations()` laedt den Employee mit Department, CostCenter, EmploymentType, Location, Tariff, Contacts, Cards und HealthInsuranceProvider; es fuegt kein Probezeit-Feld oder berechnetes Datum hinzu. Siehe [src/lib/services/employees-repository.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/employees-repository.ts#L49-L84).
- `probationMonths` wird aktuell im Payroll-Detailtab `CompensationTab` gelesen und ueber `useUpdateEmployee()` geschrieben. Das Detail-Layout bindet diesen Tab in die Employee-Detailseite ein. Siehe [src/components/employees/payroll/compensation-tab.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/employees/payroll/compensation-tab.tsx#L29-L291) und [src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/%5Blocale%5D/%28dashboard%29/admin/employees/%5Bid%5D/page.tsx#L11-L19).
- Der aktuelle `StatusBadge` auf Liste und Detailseite wertet nur `isActive` und `exitDate` aus. Ein Probezeit-Badge ist dort nicht vorhanden. Siehe [src/components/employees/status-badge.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/employees/status-badge.tsx#L8-L55), [src/components/employees/employee-data-table.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/employees/employee-data-table.tsx#L183-L189) und [src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/%5Blocale%5D/%28dashboard%29/admin/employees/%5Bid%5D/page.tsx#L125-L130).
- Repository-weite Suche am 2026-04-17 ergab keine Vorkommen der Identifier `probationEndDate` oder `isProbation` unter `src/`, `prisma/` oder `supabase/`.

### 2. Notification-System

- Das Prisma-Datenmodell besteht aus `Notification` (`tenantId`, `userId`, `type`, `title`, `message`, `link`, `readAt`, Zeitstempel) und `NotificationPreference` (`approvalsEnabled`, `errorsEnabled`, `remindersEnabled`, `systemEnabled`). Siehe [prisma/schema.prisma](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/prisma/schema.prisma#L3373-L3426).
- `notificationsRouter` stellt `list`, `markRead`, `markAllRead`, `unreadCount`, `onEvent`, `preferences` und `updatePreferences` bereit. Die Operationen sind user-scoped; der Router kommentiert explizit, dass Notification-Creation intern bleibt. Siehe [src/trpc/routers/notifications.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/notifications.ts#L1-L379).
- `notificationService` kapselt Listen/Read/UnreadCount/Preferences; `notification-repository` kapselt Prisma-Zugriff fuer `findMany`, `markRead`, `markAllRead`, `countUnread`, `findPreferences`, `createPreferences` und `upsertPreferences`. Siehe [src/lib/services/notification-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/notification-service.ts#L1-L124) und [src/lib/services/notification-repository.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/notification-repository.ts#L1-L145).
- Das In-App-UI besteht aus:
  - `Notifications` im Header-Dropdown mit `useNotifications`, `useUnreadCount`, `useMarkNotificationRead`, `useMarkAllNotificationsRead`. Siehe [src/components/layout/notifications.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/layout/notifications.tsx#L1-L168).
  - der Route `/notifications` mit Type-/Unread-Filtern und `NotificationPreferencesCard`. Siehe [src/app/[locale]/(dashboard)/notifications/page.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/%5Blocale%5D/%28dashboard%29/notifications/page.tsx#L1-L220).
  - `AppLayout`, das `useGlobalNotifications(isAuthenticated)` einmal auf Layout-Ebene mountet. Siehe [src/components/layout/app-layout.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/layout/app-layout.tsx#L21-L24).
- `useGlobalNotifications()` subscribed auf `trpc.notifications.onEvent`, aktualisiert den React-Query-Cache fuer `notifications.unreadCount`, invalidiert `notifications.list` und loest bei Notification-Events Sound/Domain-Invalidierungen aus. Siehe [src/hooks/use-global-notifications.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-global-notifications.ts#L8-L62).
- Die PubSub-Topics fuer Realtime sind user-scoped ueber `userTopic(userId)`. Siehe [src/lib/pubsub/topics.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/pubsub/topics.ts#L1-L46).
- Notifications werden derzeit nicht ueber eine einzige zentrale `notificationService.create()`-Funktion angelegt. Stattdessen existieren mehrere domain-spezifische Create-Pfade:
  - `absences-repository.createNotification()` plus Aufrufe aus `absences-service`. Siehe [src/lib/services/absences-repository.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/absences-repository.ts#L425-L457) und [src/lib/services/absences-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/absences-service.ts#L572-L607), [src/lib/services/absences-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/absences-service.ts#L821-L845).
  - `employee-messages-repository.createNotification()`. Siehe [src/lib/services/employee-messages-repository.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/employee-messages-repository.ts#L138-L152).
  - direkte `prisma.notification.create()`-Aufrufe, z.B. in `inbound-invoice-approval-service.notifyUser()` und mehreren Cron-Routen. Siehe [src/lib/services/inbound-invoice-approval-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/inbound-invoice-approval-service.ts#L37-L58).
- Vorhandene Notification-Cron-Vorlagen:
  - `GET /api/cron/inbound-invoice-escalations` laeuft stuendlich, erstellt Reminder-Notifications fuer ueberfaellige Freigabeschritte und publiziert danach unread-count Updates. Siehe [src/app/api/cron/inbound-invoice-escalations/route.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/api/cron/inbound-invoice-escalations/route.ts#L1-L125).
  - `GET /api/cron/dunning-candidates` laeuft taeglich und erstellt Reminder-Summary-Notifications fuer Empfaenger mit `dunning.view`. Siehe [src/app/api/cron/dunning-candidates/route.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/api/cron/dunning-candidates/route.ts#L1-L179).
- Dedup-/Vermeidungs-Pattern fuer wiederholte Notifications ist aktuell domain-spezifisch:
  - `inbound-invoice-escalations` benutzt `step.lastReminderAt` plus 24h-Cooldown. Siehe [src/app/api/cron/inbound-invoice-escalations/route.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/api/cron/inbound-invoice-escalations/route.ts#L16-L18) und [src/app/api/cron/inbound-invoice-escalations/route.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/api/cron/inbound-invoice-escalations/route.ts#L60-L68).
  - `dunning-candidates` prueft vor Create eine bestehende Notification fuer `(tenantId, userId, type, link, createdAt >= startOfDay)`. Siehe [src/app/api/cron/dunning-candidates/route.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/api/cron/dunning-candidates/route.ts#L116-L129).
  - Im allgemeinen `Notification`-Modell gibt es keine dedup-spezifische Spalte oder Unique-Constraint.

### 3. Dashboard

- Das aktuelle Dashboard lebt unter `/dashboard` und rendert `DashboardHeader`, `QuickActions`, vier KPI-Karten (`TodayScheduleCard`, `HoursThisWeekCard`, `VacationBalanceCard`, `FlextimeBalanceCard`), `PendingActions`, `RecentActivity` und `PersonnelFileDashboardWidget`. Siehe [src/app/[locale]/(dashboard)/dashboard/page.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/%5Blocale%5D/%28dashboard%29/dashboard/page.tsx#L19-L78).
- Das derzeit vorhandene HR-nahe Widget auf dem Dashboard ist `PersonnelFileDashboardWidget`. Es zeigt Erinnerungen und bald ablaufende Eintraege und linkt nach `/hr/personnel-file`. Siehe [src/components/hr/personnel-file-dashboard-widget.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/hr/personnel-file-dashboard-widget.tsx#L13-L64).
- Der wiederverwendbare KPI-Karten-Baustein ist `StatsCard` mit Props `title`, `value`, `description`, `icon`, `trend`, `isLoading`, `error`, `onRetry`. Siehe [src/components/dashboard/stats-card.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/dashboard/stats-card.tsx#L9-L120).
- Aktuelle Dashboard-Komponenten und ihre Hooks/Queries:
  - `QuickActions` nutzt `useEmployeeDayView()`, `useCreateBooking()`, `useBookingTypes()`. Siehe [src/components/dashboard/quick-actions.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/dashboard/quick-actions.tsx#L22-L145).
  - `TodayScheduleCard` nutzt `useEmployeeDayView()`, das auf `trpc.employees.dayView` geht. Siehe [src/components/dashboard/today-schedule-card.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/dashboard/today-schedule-card.tsx#L20-L172) und [src/hooks/use-employee-day.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-employee-day.ts#L12-L43).
  - `HoursThisWeekCard` nutzt `useDailyValues()`, das auf `trpc.dailyValues.list` geht. Siehe [src/components/dashboard/hours-this-week-card.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/dashboard/hours-this-week-card.tsx#L26-L154), [src/hooks/use-daily-values.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-daily-values.ts#L160-L200) und [src/trpc/routers/dailyValues.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/dailyValues.ts#L164-L197).
  - `VacationBalanceCard` nutzt `useEmployeeVacationBalance()`, das auf `trpc.vacation.getBalance` geht. Siehe [src/components/dashboard/vacation-balance-card.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/dashboard/vacation-balance-card.tsx#L18-L140), [src/hooks/use-vacation-balance.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-vacation-balance.ts#L171-L195) und [src/trpc/routers/vacation.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/vacation.ts#L171-L213).
  - `FlextimeBalanceCard` nutzt `useMonthlyValues()`, das auf `trpc.monthlyValues.forEmployee` geht. Siehe [src/components/dashboard/flextime-balance-card.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/dashboard/flextime-balance-card.tsx#L19-L151), [src/hooks/use-monthly-values.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-monthly-values.ts#L118-L143) und [src/trpc/routers/monthlyValues.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/monthlyValues.ts#L352-L385).
  - `PendingActions` nutzt `useDailyValues()` fuer die letzten 14 Tage. Siehe [src/components/dashboard/pending-actions.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/dashboard/pending-actions.tsx#L31-L200).
  - `RecentActivity` nutzt `useBookings()`, das auf `trpc.bookings.list` geht. Siehe [src/components/dashboard/recent-activity.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/dashboard/recent-activity.tsx#L42-L229) und [src/hooks/use-bookings.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-bookings.ts#L16-L51).
  - `PersonnelFileDashboardWidget` nutzt `useHrPersonnelFileReminders()` und `useHrPersonnelFileExpiring()`, die auf `trpc.hr.personnelFile.entries.getReminders` bzw. `getExpiring` gehen. Siehe [src/hooks/use-hr-personnel-file.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-hr-personnel-file.ts#L110-L126), [src/trpc/routers/hr/personnelFile.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/hr/personnelFile.ts#L276-L304) und [src/lib/services/hr-personnel-file-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/hr-personnel-file-service.ts#L472-L495).

### 4. Cron-Jobs / Pattern

- Die Vercel-Registrierung liegt in `vercel.json` unter `crons`. Aktuell als taeglich konfigurierte Routen sind:
  - `/api/cron/calculate-days` um `0 2 * * *`
  - `/api/cron/recurring-invoices` um `0 4 * * *`
  - `/api/cron/platform-subscription-autofinalize` um `15 4 * * *`
  - `/api/cron/wh-corrections` um `0 6 * * *`
  - `/api/cron/expire-demo-tenants` um `0 1 * * *`
  - `/api/cron/dunning-candidates` um `0 5 * * *`
  - zusaetzlich stuendlich `/api/cron/inbound-invoice-escalations`, monatlich `/api/cron/calculate-months`, woechentlich `/api/cron/generate-day-plans` und mehrere minuetliche Crons. Siehe [vercel.json](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/vercel.json#L1-L56).
- Das bestehende Vercel-Cron-Pattern in aufwendigeren Jobs:
  - `export const runtime = "nodejs"`
  - `export const maxDuration = ...`
  - Validierung `Authorization: Bearer ${CRON_SECRET}`
  - Laden aktiver Tenants
  - sequentielle Tenant-Verarbeitung
  - Logging ueber `CronExecutionLogger`
  - optionales Resume/Dedupe ueber `cronCheckpoint`
  Siehe [src/app/api/cron/calculate-days/route.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/api/cron/calculate-days/route.ts#L1-L260).
- `CronExecutionLogger` kapselt `ensureSchedule()`, `startExecution()` und `completeExecution()` fuer `Schedule`, `ScheduleExecution` und `ScheduleTaskExecution`. Siehe [src/lib/services/cron-execution-logger.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/cron-execution-logger.ts#L18-L162).
- `calculate-days` nutzt `cronCheckpoint` mit `runKey` und `tenantId`, um bereits verarbeitete Tenants bei Wiederholung zu ueberspringen. Siehe [src/app/api/cron/calculate-days/route.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/api/cron/calculate-days/route.ts#L115-L133) und [src/app/api/cron/calculate-days/route.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/api/cron/calculate-days/route.ts#L228-L246).

### 5. Mitarbeiterliste / Filter

- Die Seite `/admin/employees` haelt Filterzustand fuer `search`, `activeFilter`, `departmentFilter` und `locationFilter` in React-State und ruft damit `useEmployees()` auf. Siehe [src/app/[locale]/(dashboard)/admin/employees/page.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/%5Blocale%5D/%28dashboard%29/admin/employees/page.tsx#L37-L77).
- Die sichtbare Filterleiste rendert:
  - SearchInput
  - Status-Select (`all` / `active` / `inactive`)
  - Department-Select
  - Location-Select
  - Clear-Filters-Button
  Siehe [src/app/[locale]/(dashboard)/admin/employees/page.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/app/%5Blocale%5D/%28dashboard%29/admin/employees/page.tsx#L168-L248).
- `useEmployees()` reicht die Filter ohne lokale Post-Filterung an `trpc.employees.list` weiter. Siehe [src/hooks/use-employees.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/hooks/use-employees.ts#L6-L37).
- `listEmployeesInputSchema` im Router unterstuetzt `search`, `departmentId`, `costCenterId`, `employmentTypeId`, `locationId`, `isActive` und `hasExitDate`. Die Router-Kommentare nennen die Filtermenge ebenfalls. Siehe [src/trpc/routers/employees.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/employees.ts#L221-L233) und [src/trpc/routers/employees.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/trpc/routers/employees.ts#L734-L785).
- `employeesService.list()` baut daraus serverseitig ein Prisma-`where`, inklusive `where.exitDate = input.hasExitDate ? { not: null } : null`. Siehe [src/lib/services/employees-service.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/employees-service.ts#L81-L150).
- `employeesRepository.findMany()` fuehrt die DB-Abfrage mit `skip`, `take`, `orderBy` und `include` fuer `department`, `location` und `tariff` aus. `EmployeeDataTable` rendert nur die gelieferten Datensaetze; dort findet keine zusaetzliche Client-Filterung statt. Siehe [src/lib/services/employees-repository.ts](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/lib/services/employees-repository.ts#L12-L37) und [src/components/employees/employee-data-table.tsx](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/src/components/employees/employee-data-table.tsx#L69-L227).

## Code References

- `prisma/schema.prisma` - `Employee`, `Notification`, `NotificationPreference`
- `supabase/migrations/20260416100000_add_payroll_master_data.sql` - Einfuehrung von `probation_months`
- `src/trpc/routers/employees.ts` - Employee Output-/Input-Schemas und `employees.list`
- `src/lib/services/employees-service.ts` - Listenfilter, Create-/Update-Logik fuer `entryDate`, `exitDate`, `probationMonths`
- `src/components/employees/payroll/compensation-tab.tsx` - bestehende UI fuer `probationMonths`
- `src/trpc/routers/notifications.ts` - Listen/Read/Realtime/Preferences fuer Notifications
- `src/lib/services/notification-service.ts` / `src/lib/services/notification-repository.ts` - Notification read/list/preferences
- `src/app/api/cron/inbound-invoice-escalations/route.ts` - Reminder-Notification-Cron mit Cooldown
- `src/app/api/cron/dunning-candidates/route.ts` - taeglicher Reminder-Cron mit Same-Day-Dedup
- `src/app/[locale]/(dashboard)/dashboard/page.tsx` - aktuelle Dashboard-Zusammensetzung
- `src/components/dashboard/stats-card.tsx` - wiederverwendbares KPI-Kartenmuster
- `src/app/[locale]/(dashboard)/admin/employees/page.tsx` - sichtbare Mitarbeiterlisten-Filter

## Architecture Documentation

- Employee-Stammdaten laufen ueber `employeesRouter` plus `employeesService` plus `employeesRepository`. `probationMonths` ist dort ein normales optionales Vertragsfeld.
- Das Notification-System trennt Reading/Preferences (`notificationService`, `notification-repository`, `notificationsRouter`) von domain-spezifischer Creation (`prisma.notification.create` oder lokale `createNotification`-Helper).
- Dashboard-Daten werden per Hook pro Widget geladen; es gibt keine zentrale Dashboard-Aggregations-Query.
- Cron-Jobs sind Vercel-HTTP-Routen mit `CRON_SECRET`-Absicherung; aufwendigere Jobs nutzen `CronExecutionLogger` und `cronCheckpoint`.
- Mitarbeiterlisten-Filter laufen serverseitig bis auf die lokale UI-State-Verwaltung.

## Historical Context (from thoughts/)

- [thoughts/shared/docs/admin-employees.md](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/thoughts/shared/docs/admin-employees.md#L1-L31) - beschreibt `/admin/employees` als Admin-Liste mit Suche/Statusfilter.
- [thoughts/shared/docs/dashboard.md](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/thoughts/shared/docs/dashboard.md#L1-L37) - dokumentiert den persoenlichen Dashboard-Zuschnitt und die aktuellen Karten.
- [thoughts/shared/docs/notifications.md](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/thoughts/shared/docs/notifications.md#L1-L28) - beschreibt `/notifications` und die vier Kategorien.
- [thoughts/shared/research/2026-03-05-ZMI-TICKET-214-employees-crud.md](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/thoughts/shared/research/2026-03-05-ZMI-TICKET-214-employees-crud.md#L20-L27) - fruehere Research zu Employees-CRUD und Daten-Scope.
- [thoughts/shared/research/2026-03-06-ZMI-TICKET-221-systemsettings-auditlogs-notifications.md](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/thoughts/shared/research/2026-03-06-ZMI-TICKET-221-systemsettings-auditlogs-notifications.md#L94-L125) - fruehere Research zum Notification-Backend.
- [thoughts/shared/research/2026-03-08-ZMI-TICKET-245-vercel-cron-calculate-days.md](https://github.com/impactj90/terp/blob/c9ed7c24153ff78928581bbf5600ae0b44d76dac/thoughts/shared/research/2026-03-08-ZMI-TICKET-245-vercel-cron-calculate-days.md#L115-L160) - fruehere Research zum Vercel-Cron-Pattern.

## Related Research

- `thoughts/shared/research/2026-03-05-ZMI-TICKET-214-employees-crud.md`
- `thoughts/shared/research/2026-03-06-ZMI-TICKET-221-systemsettings-auditlogs-notifications.md`
- `thoughts/shared/research/2026-03-08-ZMI-TICKET-245-vercel-cron-calculate-days.md`
- `thoughts/shared/research/2026-03-08-ZMI-TICKET-246-vercel-cron-monthly-dayplans-macros.md`

## Open Questions

- Im aktuellen Code wurden keine weiteren probezeit-spezifischen Artefakte ausser `probationMonths` gefunden.
