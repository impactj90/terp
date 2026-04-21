---
date: 2026-04-17T23:29:30+02:00
researcher: impactj90
git_commit: 3101760fb139ea4fb5cd2257c6f813e2b7a4bf06
branch: staging
repository: terp
topic: "soll-05 Überstundenantrag — Ist-Zustand im Code (Approval-Workflow, Booking, DailyCalc, Korrekturassistent, Notifications, Permissions, ArbZG)"
tags: [research, codebase, overtime-request, approval-workflow, absences, correction-assistant, daily-calc, notifications, permissions, arbzg, pubsub]
status: complete
last_updated: 2026-04-18
last_updated_by: impactj90
last_updated_note: "Architektur-Entscheidungen ergänzt; Open Questions als resolved/deferred markiert"
---

# Research: soll-05 Überstundenantrag — Ist-Zustand im Code

**Date**: 2026-04-17T23:29:30+02:00
**Researcher**: impactj90
**Git Commit**: 3101760fb139ea4fb5cd2257c6f813e2b7a4bf06
**Branch**: staging
**Repository**: terp

## Research Question

Das Ticket `thoughts/shared/tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md` fordert einen neuen Überstundenantrag (Vorab + Reaktiv) mit Genehmigungs-Workflow, ArbZG-Validierung, Genehmiger-Konfiguration und Korrekturassistent-Integration. Diese Forschung dokumentiert den **aktuellen Ist-Zustand** aller Systemteile, auf die das Ticket aufbaut oder die es berührt — ohne Empfehlungen oder Wertungen.

## Summary

- **Überstundenantrag-Modell, -Service und -Router existieren heute nicht.** Keine `OvertimeRequest`-Tabelle in `prisma/schema.prisma`, keine `overtime-request-service.ts`, keine zugehörigen tRPC-Prozeduren, kein Antragsformular-UI.
- **Die Referenz-Architektur (Absenzen-Flow) ist vollständig umgesetzt** und folgt einem klar reproduzierbaren Muster: `createRange()` → `findApproverUserIds()` (Raw-SQL gegen `user_groups.permissions` JSONB) → `prisma.notification.create` + PubSub → `updateIfStatus()` CAS → `approve()`/`reject()` mit Re-Calc + Audit. Dieses Muster existiert auch im `Correction`-Flow.
- **Statusübergänge werden atomar gesichert** über `absences-repository.ts:315-331` (`updateIfStatus`) bzw. `correction-repository.ts:150` — ein Pattern, das der Ticket-Architekturskizze entspricht.
- **Notifications** sind ein einfaches `Notification`-Modell (type, title, message, link) mit vier erlaubten `type`-Werten (`"approvals"`, `"errors"`, `"reminders"`, `"system"`); Realtime-Zustellung erfolgt über einen prozessweiten `PubSubHub` mit Supabase-Realtime-Broadcast und SSE an den Client (`notifications.onEvent`).
- **Rollen wie `SHIFT_LEADER`, `DEPARTMENT_MANAGER`, `HR` existieren NICHT** als Enum. Autorisierung geht ausschließlich über `UserGroup.permissions` (JSONB-Array mit Permission-Keys) + `isAdmin`-Flag. Die strukturellen Rollen "Schichtleiter" finden sich lediglich als `TeamMember.role ∈ {member, lead, deputy}` bzw. `Team.leaderEmployeeId` — nicht im Auth-Pfad verdrahtet.
- **Kein `ApprovalRule`-Tabellen-Pattern** existiert generisch; die Genehmiger-Ermittlung ist hardcoded auf `"absences.approve"`-Permission-Holder tenantweit ohne Department/Team-Filter. Ähnlich (aber anders) arbeitet `InboundInvoiceApprovalPolicy` mit amount-range-basierten Policy-Rows.
- **Das `Booking`-Modell hat kein Lock/Unlock-Konzept.** Tageszustand wird bei jedem Recalc stateless berechnet. Der einzige „Close"-Zustand existiert auf Monatsebene (`MonthlyValue.isClosed`) mit vollständigem Reopen-Flow inkl. Overtime-Payout-Rollback.
- **`Booking.bookingType.direction`** ist `'in' | 'out'` (DB-String); Pairing läuft durch `pairBookings()` mit 3-Pass-Algorithmus inklusive Cross-Midnight.
- **Überstunden-Berechnung**: `overtime = max(0, netTime - targetTime)` je Tag (ohne Schwellwert) in `breaks.ts:247-260`.
- **Die Verwertungs-Logik (Ticket-3-Abhängigkeit) ist umgesetzt**, jedoch _ohne_ per-Antrag-Verwertungswunsch (Konto/Auszahlung/Freizeitausgleich). Heute: Tarif-Regel triggert bei Monats-Close automatisch `OvertimePayout` (pending oder approved, je `overtimePayoutApprovalRequired`). Keine `OvertimeAccount`/`TimeAccount`-Modelle.
- **Der Korrekturassistent hat bereits eine Fehler-/Warnungs-Infrastruktur** mit Tenant-eigenem `CorrectionMessage`-Katalog, `DailyValue.errorCodes[]` / `DailyValue.warnings[]`, `DailyValue.hasError`, `listItems()`-View, und zwei parallelen `defaultCorrectionMessages()`-Katalogen (Service = Deutsch/37 Codes, Router = Englisch/24 Codes).
- **ArbZG-Validierung existiert heute NICHT** in `src/`. Der einzige ArbZG-artige Mechanismus ist das tenant-konfigurierbare `DayPlan.maxNetWorkTime` (UI-Label „Max. Arbeitszeit / 10 Stunden / ArbZG"). Kein `arbzg-validator.ts`, keine `DAILY_MAX_EXCEEDED`/`REST_TIME_VIOLATED`/`SUNDAY_WORK`-Codes.
- **Abhängige Tickets**: Ticket 1 (Nachtschicht) ist **done**; Ticket 3 (Überstunden-Auszahlung) ist implementiert (Commit `5316ef2f`, 2026-04-17), jedoch ohne Verwertungstyp-Enum.

## Detailed Findings

### 1. Absenz-Approval-Flow — der zu spiegelnde Referenz-Flow

#### AbsenceDay-Modell + State Machine
- `prisma/schema.prisma:4743-4789` — Felder: `status` (String(20), Kommentar bei Zeile 4733 listet die 4 Werte `'pending' | 'approved' | 'rejected' | 'cancelled'`), `approvedBy` (bare UUID ohne `@relation`), `approvedAt`, `rejectionReason`, `notes`, `createdBy`.
- DB-Level Partial Unique: `UNIQUE (employee_id, absence_date) WHERE status != 'cancelled'` (Kommentar Zeile 4737, nicht in Prisma modelliert).
- State Machine: `pending → approved` (approve), `pending → rejected` (reject), `approved → cancelled` (cancel). Keine Rückwärts-Übergänge.

#### Repository — `updateIfStatus` CAS-Pattern
- `src/lib/services/absences-repository.ts:315-331` — atomischer Statuswechsel via `prisma.absenceDay.updateMany({ where: { id, tenantId, status: expectedStatus }, data })`. `count === 0` ⇒ return `null` (Caller wirft `AbsenceValidationError`). Re-Fetch mit vollständigem Include nach Erfolg.
- Verwendet in `approve()` (expected `"pending"`), `reject()` (expected `"pending"`), `cancel()` (expected `"approved"`).

#### Approver-Ermittlung — `findApproverUserIds`
- `src/lib/services/absences-repository.ts:463-480` — Raw-SQL mit Prisma Tagged Template:
  ```sql
  SELECT DISTINCT u.id FROM users u
  JOIN user_tenants ut ON ut.user_id = u.id AND ut.tenant_id = $tenantId
  JOIN user_groups ug ON ug.id = u.user_group_id
  WHERE ug.is_admin = true OR ug.permissions @> '["absences.approve"]'::jsonb
  [AND u.id != $excludeUserId]
  ```
- Liefert **alle** Genehmiger tenantweit — kein Department/Team-Filter. `excludeUserId` filtert den Antragsteller heraus.

#### Service — `createRange` / `approve` / `reject`
- `src/lib/services/absences-service.ts:355-611` (`createRange`) — `$transaction`-Block für Tag-für-Tag-Einzelrows; `triggerRecalcRange()` + Audit + Notifications außerhalb der Transaktion; Notifications in `try/catch` (best-effort).
- `src/lib/services/absences-service.ts:747-849` (`approve`) — Signatur `(prisma, tenantId, id, dataScope, audit)`. Ruft `repo.updateIfStatus(..., "pending", { status: "approved", approvedBy: audit.userId, approvedAt: new Date() })`, triggert `triggerRecalc()` + optional `recalculateVacationTaken()` (wenn `absenceType.deductsVacation`), schreibt Audit-Log (`action: "approve"`), benachrichtigt Mitarbeiter via `repo.findUserIdForEmployee()` (Raw-SQL auf `user_tenants`) + `repo.createNotification()` + `publishUnreadCountUpdate()`.
- `src/lib/services/absences-service.ts:851-936` (`reject`) — zusätzlicher Parameter `reason: string | undefined` zwischen `id` und `dataScope`. Audit-Action `"reject"`. Kein Vacation-Recalc bei Reject.
- `src/lib/services/absences-service.ts:18-39` — `publishUnreadCountUpdate()`: zählt aktuelle Unread, ruft `hub.publish(userTopic(userId), { event: "notification", type, unread_count }, true)` — der `true`-Flag triggert Supabase-Realtime-Broadcast. Komplett in `try/catch`.

#### tRPC-Router
- `src/trpc/routers/absences.ts:508-529` (`approve`) — `tenantProcedure.use(requirePermission(ABSENCE_APPROVE)).use(applyDataScope())`, Zod `approveInputSchema = { id: z.string() }` (Zeilen 179-181), Output `absenceDayOutputSchema`, catch ⇒ `handleServiceError(err)`.
- `src/trpc/routers/absences.ts:545-567` (`reject`) — identische Struktur mit Input `{ id, reason?: max(2000) }`.
- Permission-Keys bei Zeilen 43-45: `ABSENCE_REQUEST`, `ABSENCE_APPROVE`, `ABSENCE_MANAGE` via `permissionIdByKey(...)`.
- Custom Middleware `requireOwnAbsenceOrPermission` bei Zeilen 57-81 für `update`/`cancel`: macht in `ctx.user.userGroup`-Check nach, ob User Eigentümer ist, ansonsten Permission-Check.

### 2. Correction-Flow — paralleles Approval-Modell

#### Correction-Modell
- `prisma/schema.prisma:4974-5003` — Felder: `correctionType` (CHECK auf `'time_adjustment' | 'balance_adjustment' | 'vacation_adjustment' | 'account_adjustment'`), `valueMinutes` (Int), `status` (CHECK auf `'pending' | 'approved' | 'rejected'`), `approvedBy`, `approvedAt`, `rejectionReason`, `createdBy`. Relationen zu `tenant`, `employee`, optional `account`.

#### Correction-Service/Repository
- `src/lib/services/correction-repository.ts:150` — `updateIfStatus()` identisches Pattern wie bei Absenzen.
- `src/lib/services/correction-service.ts:298-360` — `approve()`/`reject()` mit identischer 5-Schritt-Struktur (`findByIdFor<Action>` → `checkDataScope` → `updateIfStatus("pending", ...)` → `triggerRecalc` → audit/notify). `audit` ist optional.
- `remove()` bei Zeile 250 nutzt `deleteMany({ where: { id, tenantId, status: { not: "approved" } } })` — approved Corrections unlöschbar.

#### tRPC-Router
- `src/trpc/routers/corrections.ts:332-351` (`approve`) / `361-380` (`reject`) — inline Zod `z.object({ id: z.string() })`, identische Middleware-Kette `requirePermission(CORRECTIONS_MANAGE).use(applyDataScope())`. `reject` hat hier _kein_ `reason`-Feld.

### 3. Korrekturassistent + DailyValue-Error-Codes

#### DailyValue-Modell
- `prisma/schema.prisma:4632-4679` — Zeiten in Minuten (Int). Felder: `status` (default `"calculated"`), `grossTime`, `netTime`, `targetTime`, `overtime`, `undertime`, `breakTime`, `hasError` (bool, default false), `errorCodes` (Postgres `TEXT[]`), `warnings` (Postgres `TEXT[]`), `firstCome`, `lastGo`, `bookingCount`, `calculatedAt`, `calculationVersion`.
- Partial Index: `idx_daily_values_errors ON (employee_id, has_error) WHERE has_error = true` (Schema-Kommentar Zeile 4629).
- Unique: `(employeeId, valueDate)`.

#### Fehler-Code-Kataloge (drei unabhängige Orte)
- **Pure Engine** (`src/lib/calculation/errors.ts`): 14 `ERR_*`-Konstanten (MISSING_COME, MISSING_GO, UNPAIRED_BOOKING, EARLY_COME, LATE_COME, EARLY_GO, LATE_GO, MISSED_CORE_START, MISSED_CORE_END, BELOW_MIN_WORK_TIME, NO_BOOKINGS, INVALID_TIME, DUPLICATE_IN_TIME, NO_MATCHING_SHIFT) + 10 `WARN_*`. Das Set `ERROR_CODES` (Zeile 74) enthält alle ERR_*; `isError(code)` prüft dagegen.
- **Service-Level** (`src/lib/services/correction-assistant-service.ts:55-62`): 7 zusätzliche WARN_*-Codes (BOOKINGS_ON_OFF_DAY, WORKED_ON_HOLIDAY, ABSENCE_CREATED, ABSENCE_CREATION_FAILED, ORDER_BOOKING_CREATED, ORDER_BOOKING_FAILED, NO_DEFAULT_ORDER).
- **Legacy** (`correction-assistant-service.ts:65-67`): MISSING_CLOCK_OUT/IN/BREAK aus Go-Backend-Zeiten.
- **Informell** in `daily-calc.ts` (fallen im `mapCorrectionErrorType` durch in `"other"`): `OFF_DAY`, `HOLIDAY`, `ABSENCE_ON_HOLIDAY`, `NO_BOOKINGS_CREDITED`, `NO_BOOKINGS_DEDUCTED`, `VOCATIONAL_SCHOOL`.

#### CorrectionMessage-Katalog
- `prisma/schema.prisma:4528-4547` — `CorrectionMessage { tenantId, code, defaultText, customText?, severity (default "error"), description?, isActive }` mit Unique `(tenantId, code)`. Lazy-seed über `ensureDefaults()` bei erstem Aufruf von `listItems()`/`listMessages()`.
- **Zwei separate `defaultCorrectionMessages()`-Definitionen**:
  - `src/lib/services/correction-assistant-service.ts:106-147` — deutsch, 37 Codes
  - `src/trpc/routers/correctionAssistant.ts:93-122` — englisch, 24 Codes (Legacy, wird nur in router-lokalen Prozeduren aufgerufen)

#### listItems() — HR-Review-View
- `src/lib/services/correction-assistant-service.ts:271-406`:
  1. `ensureDefaults()` seedet Katalog falls leer / fügt fehlende Codes hinzu.
  2. `CorrectionMessage`-Rows mit `isActive: true` in `Map<code, message>` laden.
  3. `repo.findDailyValuesWithErrors()` — Prisma `findMany` auf `daily_values` gefiltert `hasError: true` + Datum/Employee/Department. Rows mit `hasError: false` aber nicht-leeren `warnings` werden nicht zurückgegeben.
  4. Pro Row: `errorCodes[]` + `warnings[]` iterieren, pro Code in `messageMap` lookup, filtern nach `severityFilter`/`codeFilter`, mappen zu `{ code, severity, customText, errorType }` via `mapCorrectionErrorType(code)` (Zeile 69).
  5. In-Memory-Pagination via `params.limit`/`params.offset`.

#### HR-UI
- `src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx` — Client-Component, Gate via `corrections.manage` Permission (Zeile 46), zwei Tabs: "corrections" + "messages".
- `src/components/correction-assistant/` — Data-Table, Detail-Sheet, Filter, Edit-Dialog, Notify-Dialog.
- Hooks: `src/hooks/use-correction-assistant.ts`.
- Router: `src/trpc/routers/correctionAssistant.ts` — Prozeduren `listMessages`, `getMessage`, `updateMessage`, `listItems`.

#### Wo `daily-calc.ts` errorCodes setzt
`src/lib/services/daily-calc.ts:114` (`calculateDay`) — 4 Branches:
- `handleOffDay` (Zeile 708): `hasError=false`, `warnings=["OFF_DAY"]`, optional `"BOOKINGS_ON_OFF_DAY"` bei Buchungen.
- `handleHolidayCredit` (Zeile 746): `hasError=false`, `warnings=["HOLIDAY"]`.
- `handleNoBookings` (Zeile 851): je `dayPlan.noBookingBehavior` — `"error"` setzt `errorCodes=["NO_BOOKINGS"]`, `status=DV_STATUS_ERROR`, sonst OK-Branches mit Warnings.
- `calculateWithBookings` (Zeile 1100): ruft pure `calculate()` aus `calculator.ts`; kopiert `result.errorCodes` und `result.warnings` via `resultToDailyValue()` (Zeile 1346) direkt in `DailyValue`.

### 4. Booking-Modell + DailyCalc + Überstunden-Berechnung

#### Booking-Modell
- `prisma/schema.prisma:4570-4615` — Felder: `tenantId`, `employeeId`, `bookingDate` (Date), `bookingTypeId`, `originalTime` (Int, Minuten von Mitternacht), `editedTime` (Int, verwendet), `calculatedTime` (Int?, nach Toleranz/Rundung), `pairId` (UUID?, expliziter Pairing-Hinweis), `source` (z.B. `"web"`, `"terminal"`, `"correction"`), `terminalId?`, `notes?`, `bookingReasonId?`, `isAutoGenerated`, `originalBookingId?` (Self-Relation `"DerivedBookings"`).

#### BookingType — direction
- `prisma/schema.prisma:2404-2432` — `direction String @db.VarChar(10)`, Kommentar Zeile 2402: `direction IN ('in', 'out')`. DB-CHECK, kein Prisma-Enum.
- `category`: `'work' | 'break' | 'business_trip' | 'other'`.
- Break-Erkennung: `BREAK_CODES = new Set(["P1", "P2", "BREAK_START", "BREAK_END"])` in `daily-calc.types.ts:73`.
- Im Calc-Build (`daily-calc.ts:1329-1337`): `direction: b.bookingType?.direction === "out" ? "out" : "in"`; bei Break-Types sind Semantiken invertiert — `"out"` = Pausenbeginn, `"in"` = Pausenende.

#### Pairing
- `src/lib/calculation/pairing.ts:23` (`pairBookings`), `pairing.ts:130-263` (`pairByCategory`):
  1. Split in `inBookings`/`outBookings`, sortiert nach Zeit.
  2. 1. Pass: explizite `pairId`-Paare.
  3. 2. Pass (work): unpaired IN → nächstes OUT nach IN.
  4. 3. Pass (work cross-midnight): OUT.time < IN.time ⇒ Pair mit `WARN_CROSS_MIDNIGHT`.
  5. Break-Pairing: OUT→IN statt IN→OUT.
- Unpaired IN ⇒ `ERR_MISSING_GO`; Unpaired OUT ⇒ `ERR_MISSING_COME` (`calculator.ts:85-90`).

**Kein Lock/Unlock-Konzept auf Booking-Ebene.** Ein Tag wird bei jedem Recalc komplett stateless neu berechnet. Kein „Reopen"-Pfad auf Tagesebene.

#### DailyCalc
- `src/lib/services/daily-calc.ts:114` (`calculateDay`) — einziger Entry-Point.
- Soll-Zeit (`targetTime`) via `resolveTargetHours()` (Zeile 367): wenn `dayPlan.fromEmployeeMaster` → `employee.dailyTargetHours`, sonst `dayPlan.regularHours`.
- Ist-Zeit (`netTime`) = `grossTime - breakTime`, gecapped auf `dayPlan.maxNetWorkTime` (`calculator.ts:124-134`). `grossTime` = Summe paired work-booking-Dauern (`pairing.ts:62`). `breakTime` via `calculateBreakDeduction()` (`breaks.ts:29`) mit fixed/variable/minimum break configs.
- Überstunden-Berechnung (`breaks.ts:247-260`):
  ```ts
  export function calculateOvertimeUndertime(netTime, targetTime) {
    const diff = netTime - targetTime
    if (diff > 0) return { overtime: diff, undertime: 0 }
    if (diff < 0) return { overtime: 0, undertime: -diff }
    return { overtime: 0, undertime: 0 }
  }
  ```
  Aufgerufen bei `calculator.ts:153`. **Kein Schwellwert** — jede Minute über Soll ist Überstunde.

#### Monatliches Close/Reopen
- `src/lib/services/monthly-values-service.ts:332-412` (`close`) — atomic `updateMany` mit `isClosed: false`-Guard, ruft danach `createPayoutForClosedMonth()` (best-effort).
- `src/lib/services/monthly-values-service.ts:414-492` (`reopen`) — lädt existierenden `OvertimePayout`, restauriert bei Status `"approved"` die ursprünglichen `flextimeEnd`/`flextimeCarryover` aus dem Snapshot, löscht Payout, setzt `isClosed=false`/`reopenedAt`/`reopenedBy`, triggert Recalc ab Folge-Monat.

### 5. Überstunden-Auszahlung (Ticket-3-Abhängigkeit)

**Commit `5316ef2f` (2026-04-17): "Implement configurable overtime payout workflows"** — Ticket 3 ist umgesetzt, aber _ohne_ Verwertungstyp-Enum.

#### Schema-Erweiterungen
- `Tariff` (`schema.prisma:2902-2908`): `overtimePayoutEnabled`, `overtimePayoutThresholdMinutes`, `overtimePayoutMode` (String: `"ALL_ABOVE_THRESHOLD" | "PERCENTAGE" | "FIXED_AMOUNT"`), `overtimePayoutPercentage`, `overtimePayoutFixedMinutes`, `overtimePayoutApprovalRequired` (default `false`).
- `OvertimePayout` (`schema.prisma:3010-3037`): `{ id, tenantId, employeeId, year, month, payoutMinutes, status ("pending"|"approved"|"rejected"), sourceFlextimeEnd, tariffRuleSnapshot (Json), approvedBy?, approvedAt?, rejectedBy?, rejectedAt?, rejectedReason? }`, Unique `(tenantId, employeeId, year, month)`.
- `EmployeeOvertimePayoutOverride` (`schema.prisma:3045-3063`): per-Employee override (`overtimePayoutEnabled`, `overtimePayoutMode?`, `notes?`, `isActive`), Unique `(tenantId, employeeId)`.

#### Service
- `src/lib/services/overtime-payout-service.ts`:
  - `calculatePayout(flextimeEnd, rule)` (Zeilen 49-78) — 3 Modi implementiert.
  - `resolveEffectiveRule(tariff, override?)` (Zeilen 80-109) — override nur bei `isActive=true`.
  - `buildTariffRuleSnapshot(rule)` (Zeilen 111-122) — JSON-Snapshot für Audit.
  - `approve()` (Zeilen 158-214) — in `$transaction`: Payout→approved, `flextimeEnd`/`flextimeCarryover` reduzieren, `recalculateFromMonth(employeeId, year+1month)`.
  - `reject()` (Zeilen 217-251) — keine Saldo-Änderung.

#### Bei Monats-Close
- `monthly-values-service.ts:234` (`createPayoutForClosedMonth`) — nach erfolgreichem Close: Tarif+Override laden, `calculatePayout` aufrufen, bei `payoutMinutes > 0`: wenn `!overtimePayoutApprovalRequired` ⇒ `status="approved"` + Saldo-Reduktion in einer Transaktion; sonst ⇒ `status="pending"` ohne Saldo-Änderung.

**Verwertungswunsch (ACCOUNT/PAYOUT/TIME_OFF) existiert NICHT.** Der Payout ist heute vollautomatisch, regel-getrieben, ohne per-Antrag-Wahlmöglichkeit. Keine `OvertimeAccount`/`TimeAccount`-Modelle.

### 6. Notification-Infrastruktur

#### Notification-Modell
- `prisma/schema.prisma:3384-3405`: `{ id, tenantId, userId (recipient), type VarChar(20), title VarChar(255), message Text, link Text?, readAt Timestamptz?, createdAt, updatedAt }`. Kein JSONB-Payload.
- Indexes: `(userId, readAt)`, `(userId, createdAt DESC)`, `(tenantId, userId, createdAt DESC)`.

#### Erlaubte type-Werte
Kein DB-Enum. Anwendungsseitig in `src/trpc/routers/notifications.ts:60-65`:
```ts
const NOTIFICATION_TYPES = ["approvals", "errors", "reminders", "system"] as const
```
Gleiches in `src/hooks/use-notifications.ts:4`. Der Absenz-Flow setzt durchgängig `type: "approvals"`.

#### Call-Pattern
Jeder Consumer hat eigenen `repo.createNotification`-Wrapper mit identischer Signatur:
```ts
prisma.notification.create({ data: { tenantId, userId, type, title, message, link } })
```
Unmittelbar danach `publishUnreadCountUpdate()` in `try/catch`.

Bekannte Call-Sites: `absences-service.ts:595-602` (neuer Antrag, `approvals`), `absences-service.ts:834-841` (approve, `approvals`), `absences-service.ts:921-928` (reject, `approvals`), `daily-calc.ts:1810` (`errors`), `daily-value-service.ts:282-291` (`approvals`), `crm-task-service.ts:441-449` (`reminders`), `employee-messages-service.ts:219-226` (`system`), `probation-reminder-service.ts:302-311` (`reminders`), `inbound-invoice-approval-service.ts:44-53`, `app/api/cron/dunning-candidates/route.ts:135`.

#### Realtime / PubSub
- `src/lib/pubsub/singleton.ts` — `getHub()` Singleton per `globalThis[Symbol.for('terp.pubsub.hub')]`.
- `src/lib/pubsub/hub.ts` — `PubSubHub` mit In-Memory `Map<topic, Map<subId, Subscription>>`. `publish(topic, payload, broadcast=true)` liefert lokal aus und sendet zusätzlich via Supabase-Realtime-Channel `"pubsub"` / Event `"msg"` an andere Instanzen; dort wird `deliverFromPeer()` aufgerufen, `origin`-Filter verhindert Echo (`hub.ts:75`).
- `src/lib/pubsub/topics.ts` — `userTopic(userId) = "user:{userId}"`.
- Client-Transport: `httpSubscriptionLink` (SSE), **nicht** WebSocket.
- `src/trpc/routers/notifications.ts:280-331` (`notifications.onEvent`) — `async function*` Generator: initial `{ type: 'connected', unread_count }`, dann Stream aus `hub.subscribe()`, beim Abort-Signal `unsubscribe`.

#### Notification-Prozeduren
Alle `tenantProcedure` (user-scoped), keine weitere `requirePermission`:
- `list`, `markRead`, `markAllRead`, `unreadCount`, `onEvent` (SSE subscription), `preferences` (getOrCreate), `updatePreferences`.

#### NotificationPreference
- `prisma/schema.prisma:3414-3432`: `(tenantId, userId)` Unique, 4 boolean Toggles (`approvalsEnabled`, `errorsEnabled`, `remindersEnabled`, `systemEnabled`), default `true`. **Services checken Preferences NICHT vor dem Create** — sie erzeugen bedingungslos.

### 7. Permissions & Rollen

#### Es gibt KEIN Rollen-Enum
Weder `SHIFT_LEADER`, `DEPARTMENT_MANAGER`, `HR`, `SCHICHTLEITER` noch `ABTEILUNGSLEITER` existieren als Enum in `src/` oder `prisma/schema.prisma`.

#### UserGroup-basierte Permissions
- `UserGroup` (`schema.prisma:1417-1441`): `{ id, tenantId? (nullable=system-wide), name, code, permissions Json? (JSONB Array), isAdmin Boolean?, isSystem, isActive }`.
- Jeder `User.userGroupId` → FK auf `UserGroup`. Effektive Permissions = `userGroup.permissions` (Array aus Permission-Key-Strings).

#### UserTenant.role = NICHT autorisierungsrelevant
- `UserTenant` (`schema.prisma:1450-1463`): `role String @default("member")`. Werte im Code: `"member"`, `"owner"`, `"support"` (Impersonation). **Nur Metadaten**, kein Auth-Check darauf.

#### Admin-Bypass
- `src/lib/auth/permissions.ts:56-61`: Admin ⇔ `user.userGroup?.isAdmin === true` ODER `user.role === "admin"` (Fallback).
- `hasPermission()` gibt bei Admin unconditionally `true` zurück.

#### Approval-relevante Permission-Keys
Aus `src/lib/auth/permission-catalog.ts`:
- Zeile 69: `time_tracking.approve`
- Zeile 97: `absences.request`
- Zeile 98: `absences.approve`
- Zeile 99: `absences.manage`
- Zeile 210: `corrections.manage`
- Zeile 353: `inbound_invoices.approve`
- Zeile 405: `overtime_payouts.manage`

#### Middleware
- `requirePermission(...permissionIds)` (`middleware.ts:40`) — OR-Logik, Admin-Bypass.
- `requireSelfOrPermission(userIdGetter, permissionId)` (`middleware.ts:73`) — self oder Permission.
- `requireEmployeePermission(employeeIdGetter, ownPermission, allPermission)` (`middleware.ts:125`) — 3-Wege-Check; bei foreign employee fällt es zurück auf Team-Membership-Query gegen `TeamMember` (Zeilen 170-184).
- `applyDataScope()` (`middleware.ts:219`) — injiziert `DataScope` aus `user.dataScope*`-Feldern in ctx. Typen: `"all" | "tenant" | "department" | "employee"`.

### 8. Employee / Department / Team-Struktur

- `Department` (`schema.prisma:1754-1780`): `{ parentId? (tree), managerEmployeeId? }`. Beziehung `@relation("DepartmentManager")` zu `Employee`.
- `Team` (`schema.prisma:1788-1811`): `{ departmentId?, leaderEmployeeId? }`.
- `TeamMember` (`schema.prisma:1822-1837`): `{ teamId, employeeId, joinedAt, role (default "member") }`. Kommentar Zeile 1821: `Role values: 'member' (default), 'lead', 'deputy'`.

**„Schichtleiter pro Abteilung" existiert nicht als First-Class-Konzept.** Nächstliegende Struktur: `Team.leaderEmployeeId` + `TeamMember.role = 'lead' | 'deputy'`. Diese strukturellen Rollen sind nicht in den `requirePermission`-Auth-Pfad eingebunden — sie werden nur für Anzeige und im Team-Fallback von `requireEmployeePermission` genutzt.

### 9. Tenant-Config-Patterns

Drei existierende Patterns:

**A) Singleton-per-Tenant** (`tenantId UNIQUE`, Access via `findUnique`/`upsert`):
- `SystemSetting` (`schema.prisma:3308-3341`) — ~18 Spalten, general system-wide.
- `BillingTenantConfig` (`schema.prisma:1017-1046`) — Letterhead/IBAN.
- `ReminderSettings` (`schema.prisma:1307-1323`) — Dunning.
- `TenantSmtpConfig` (`schema.prisma:5726-5745`), `TenantImapConfig` (`schema.prisma:5839-5858`).

**B) Multi-Row-Policy** (one-to-many, threshold-basiert):
- `InboundInvoiceApprovalPolicy` (`schema.prisma:6008-6026`): mehrere Rows pro Tenant, `amountMin`/`amountMax`/`stepOrder`, `approverGroupId` oder `approverUserId`. Service `findForAmount(prisma, tenantId, grossAmount)`.

**C) Per-Employee-Override** (one row per employee):
- `EmployeeOvertimePayoutOverride` (siehe oben, Section 5).

**Kein existierender `ApprovalRule`/`OvertimeRequestConfig`-Tabellentyp.**

### 10. ArbZG-Validierung — verifiziert NICHT vorhanden

Die Behauptung des Tickets „Keine ArbZG-Validierung implementiert" wurde vollständig verifiziert.

#### Was in `src/` NICHT existiert
Keinerlei Treffer für: `ArbZG`, `Arbeitszeitgesetz`, `arbzg-validator`, `ArbZGValidator`, `DAILY_MAX_EXCEEDED`, `REST_TIME_VIOLATED`, `SUNDAY_WORK`, `WEEKLY_MAX`, `Ruhezeit`, `Sonntagsverbot`, `maxDailyHours`, `max_daily_hours`, `weeklyMax`. Keine Datei `*arbzg*`.

#### Was es gibt (ähnlich, aber nicht gesetzlich)
- `maxNetWorkTime` — konfigurierbarer Tages-Cap pro DayPlan (`src/lib/calculation/capping.ts`, `breaks.ts:217`, `calculator.ts:130`, `daily-calc.ts:1281`, `day-plans-service.ts:186`). UI-Label `"Max. Arbeitszeit / 10 Stunden / ArbZG"` in `docs/benutzerhandbuecher/einstellungen.md:106-108` — aber kein Code-Enforcement von §3 ArbZG; es ist nur ein Tenant-Tuning.
- Bestehendes `warnings: string[]` Array in `DailyValue` (`daily-calc.types.ts:130`) und die Push-Sites in `daily-calc.ts` (Zeilen 726, 735, 784, 836, 889, 912, 922, 957, 968, 1057, 1169). Aktuell nur Scheduling-State-Warnings (`OFF_DAY`, `HOLIDAY`, `BOOKINGS_ON_OFF_DAY`, `WORKED_ON_HOLIDAY`, `NO_BOOKINGS_CREDITED` etc.).

#### Planning-Docs referenzieren ArbZG
- `docs/TERP_HANDBUCH.md:1469` — §4 ArbZG Pausen-Regel erwähnt.
- `docs/ZMI_TIME_vs_TERP_ABGLEICH.md:93` — §4 ArbZG via konfigurierbare Minimum-Pausen.
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` — ZMI-Referenz mit ArbZG-Regeln.

## Code References

### Absenz-Approval-Flow
- `src/lib/services/absences-repository.ts:315-331` — `updateIfStatus()` CAS
- `src/lib/services/absences-repository.ts:463-480` — `findApproverUserIds()` Raw-SQL
- `src/lib/services/absences-service.ts:355-611` — `createRange()`
- `src/lib/services/absences-service.ts:747-849` — `approve()`
- `src/lib/services/absences-service.ts:851-936` — `reject()`
- `src/lib/services/absences-service.ts:938-1011` — `cancel()`
- `src/lib/services/absences-service.ts:18-39` — `publishUnreadCountUpdate()`
- `src/trpc/routers/absences.ts:508-529` — `approve` procedure
- `src/trpc/routers/absences.ts:545-567` — `reject` procedure

### Correction-Flow
- `src/lib/services/correction-repository.ts:150` — `updateIfStatus()`
- `src/lib/services/correction-service.ts:298-360` — `approve()`/`reject()`
- `src/trpc/routers/corrections.ts:332-351` — `approve` procedure
- `src/trpc/routers/corrections.ts:361-380` — `reject` procedure

### Korrekturassistent + DailyValue
- `prisma/schema.prisma:4632-4679` — `DailyValue`
- `prisma/schema.prisma:4528-4547` — `CorrectionMessage`
- `src/lib/services/correction-assistant-service.ts:55-62` — Service-Warning-Codes
- `src/lib/services/correction-assistant-service.ts:69-104` — `mapCorrectionErrorType`
- `src/lib/services/correction-assistant-service.ts:106-147` — deutscher Default-Katalog
- `src/lib/services/correction-assistant-service.ts:271-406` — `listItems()`
- `src/trpc/routers/correctionAssistant.ts:93-122` — englischer Default-Katalog (Legacy)
- `src/lib/calculation/errors.ts:11-89` — Engine Fehler-Konstanten
- `src/lib/services/daily-calc.ts:114-253` — `calculateDay()` mit 4 Branches
- `src/lib/services/daily-calc.ts:1100-1188` — `calculateWithBookings`
- `src/lib/calculation/calculator.ts:41-161` — pure `calculate()`

### Booking / DailyCalc / Überstunden
- `prisma/schema.prisma:4570-4615` — `Booking`
- `prisma/schema.prisma:2404-2432` — `BookingType`
- `src/lib/calculation/pairing.ts:130-263` — Pairing-Logik
- `src/lib/calculation/breaks.ts:247-260` — `calculateOvertimeUndertime`
- `src/lib/services/daily-calc.ts:367` — `resolveTargetHours()`
- `src/lib/services/daily-calc.types.ts:40-73` — Break-Codes

### Überstunden-Auszahlung (Ticket 3)
- `prisma/schema.prisma:2902-2908` — Tariff-Felder
- `prisma/schema.prisma:3010-3037` — `OvertimePayout`
- `prisma/schema.prisma:3045-3063` — `EmployeeOvertimePayoutOverride`
- `src/lib/services/overtime-payout-service.ts:49-78` — `calculatePayout`
- `src/lib/services/overtime-payout-service.ts:80-109` — `resolveEffectiveRule`
- `src/lib/services/overtime-payout-service.ts:158-251` — `approve`/`reject`
- `src/lib/services/monthly-values-service.ts:234-330` — `createPayoutForClosedMonth`

### Notifications / PubSub
- `prisma/schema.prisma:3384-3405` — `Notification`
- `prisma/schema.prisma:3414-3432` — `NotificationPreference`
- `src/trpc/routers/notifications.ts:60-65` — `NOTIFICATION_TYPES`
- `src/trpc/routers/notifications.ts:280-331` — `onEvent` SSE subscription
- `src/lib/pubsub/hub.ts:75` — `deliverFromPeer`
- `src/lib/pubsub/topics.ts` — `userTopic()`

### Permissions / Middleware / Strukturelle Rollen
- `prisma/schema.prisma:1417-1441` — `UserGroup`
- `prisma/schema.prisma:1450-1463` — `UserTenant`
- `prisma/schema.prisma:1754-1780` — `Department`
- `prisma/schema.prisma:1788-1811` — `Team`
- `prisma/schema.prisma:1822-1837` — `TeamMember`
- `src/lib/auth/permissions.ts:56-61` — Admin-Check
- `src/lib/auth/permission-catalog.ts:97-99` — Absenz-Keys
- `src/lib/auth/permission-catalog.ts:405` — `overtime_payouts.manage`
- `src/lib/auth/middleware.ts:40-219` — 4 Middleware-Funktionen

### Tenant-Config-Patterns
- `prisma/schema.prisma:3308-3341` — `SystemSetting` (Singleton-Pattern A)
- `prisma/schema.prisma:6008-6026` — `InboundInvoiceApprovalPolicy` (Multi-Row-Pattern B)

### ArbZG — NICHT-vorhandene Stellen
- `src/lib/calculation/capping.ts` — `maxNetWorkTime` Cap (Tenant-Cap, nicht ArbZG)
- `src/lib/services/day-plans-service.ts:186` — `maxNetWorkTime` Field

## Architecture Documentation

### Service + Repository Pattern
Alle neuen Approval-Flows folgen dem gleichen Schnittmuster:
1. **Router** (`src/trpc/routers/*.ts`): `tenantProcedure.use(requirePermission(X)).use(applyDataScope())`, Zod-Schema, Service-Call im `try`, `handleServiceError(err)` im `catch`.
2. **Service** (`src/lib/services/*-service.ts`): Signatur `(prisma, tenantId, ..., dataScope, audit)`. Domain-Error-Klassen mit `.name`-Konvention (suffix `NotFoundError`/`ValidationError`/`ForbiddenError`) für automatisches Mapping in `handleServiceError`. 5-Schritt-Struktur: `findById` → `checkDataScope` → `updateIfStatus(expected, data)` → `triggerRecalc` (best-effort) → audit + notify (best-effort).
3. **Repository** (`src/lib/services/*-repository.ts`): Prisma-Zugriff + das atomische `updateIfStatus()`-Pattern für Statusübergänge.

### Atomische Statusübergänge (CAS)
```ts
const { count } = await prisma.model.updateMany({
  where: { id, tenantId, status: expectedStatus },
  data,
})
if (count === 0) return null
return prisma.model.findFirst({ where: { id, tenantId }, include })
```
Das Pattern verhindert Double-Approval-Races ohne `SELECT FOR UPDATE` — der `WHERE status = expected` ist Teil des SQL-UPDATE. Verwendet in `absences-repository.ts:315`, `correction-repository.ts:150`, monthly-close in `monthly-calc.ts:378-438`.

### Approver-Resolution
Heute existiert exakt **eine** Approver-Resolution (`findApproverUserIds` in Absenzen): JSONB-Containment gegen `user_groups.permissions`. Keine Department/Team-Filterung, kein Fallback bei Abwesenheit des Genehmigers, keine Mehrstufigkeit.

Alternatives Pattern in `InboundInvoiceApprovalPolicy`: Policy-Tabelle mit `amountMin`/`amountMax`/`stepOrder` + direkter FK auf `approverUserId` oder `approverGroupId`.

### Notifications-Flow
Jede State-Transition ruft drei Hooks (best-effort, je in `try/catch`):
1. `prisma.notification.create({ data: { tenantId, userId, type, title, message, link } })`.
2. `publishUnreadCountUpdate(ctx, userId, subtype)` → Zählt Unread, veröffentlicht via `hub.publish(userTopic(userId), payload, broadcast=true)` an Supabase-Realtime.
3. Empfänger-Client erhält Event über SSE `notifications.onEvent`-Subscription.

### Error-Mapping
`src/trpc/errors.ts:10-105` (`handleServiceError`) mappt per `err.name`-Suffix (nicht `err.constructor.name`, wegen Minification-Resistenz): `NotFoundError → NOT_FOUND`, `ValidationError/InvalidError → BAD_REQUEST`, `ConflictError/DuplicateError → CONFLICT`, `ForbiddenError/AccessDeniedError → FORBIDDEN`. Prisma `P2025 → NOT_FOUND`, `P2002 → CONFLICT`, `P2003 → BAD_REQUEST`.

## Historical Context (from thoughts/)

### Direkt bezogene Pläne / Research
- `thoughts/shared/tickets/prodi-prelaunch/pflicht-03-ueberstunden-auszahlung.md` — Ticket 3, direkte Abhängigkeit (Verwertungswunsch-Default)
- `thoughts/shared/plans/2026-04-17-pflicht-03-ueberstunden-auszahlung.md` — Implementierungsplan Ticket 3
- `thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md` — Ist-Zustand-Research zu Ticket 3
- `thoughts/shared/research/2026-04-17-pflicht-03-ueberstunden-auszahlung-impact-map.md` — Impact-Map
- `thoughts/shared/tickets/prodi-prelaunch/pflicht-01-nachtschicht-bewertungslogik-DONE.md` — Ticket 1, abgeschlossen, dayChangeBehavior jetzt vorhanden
- `thoughts/shared/plans/2026-04-16-pflicht-01-nachtschicht-bewertungslogik.md` — Plan Ticket 1
- `thoughts/shared/research/2026-04-16-nachtschicht-bewertungslogik.md` — Research Ticket 1
- `thoughts/shared/reference/zmi-calculation-manual-reference.md` — Referenz für ArbZG-Regeln + Überstunden-Logik aus ZMI-Zeit

### Absenz-/Approval-Muster (direkt anwendbar)
- `thoughts/shared/plans/2026-01-26-NOK-222-absence-request-form.md` — Absence-Request-Form
- `thoughts/shared/plans/2026-01-27-NOK-235-manager-approval-dashboard.md` / `2026-01-28-manager-approvals-dashboard.md` — Manager Approvals Dashboard
- `thoughts/shared/plans/2026-03-08-ZMI-TICKET-240-absence-service-router.md` + Research — Absence Service + Router (Approve/Reject)
- `thoughts/shared/plans/2026-01-29-ZMI-TICKET-008-absence-days-lifecycle-gaps.md` + Research — Absence Lifecycle

### Korrekturassistent
- `thoughts/shared/plans/2026-01-29-ZMI-TICKET-012-correction-assistant-and-errors.md` — Korrekturassistent Backbone
- `thoughts/shared/plans/2026-02-02-zmi-ticket-040-correction-assistant-ui.md` — UI
- `thoughts/shared/plans/2026-03-25-WH_11-korrekturassistent-ww.md` — Pattern-Referenz für WW-Domain
- `thoughts/shared/plans/2026-03-07-ZMI-TICKET-227-monthly-eval-templates-correction-messages.md` — Message-Catalog

### DailyCalc-Port
- `thoughts/shared/plans/2026-03-08-ZMI-TICKET-234-daily-calc-service-port.md` — DailyCalcService Go→TS
- `thoughts/shared/plans/2026-03-08-ZMI-TICKET-236-daily-values-router.md` — DailyValues-Router
- `thoughts/shared/tickets/ZMI-TICKET-233-calculation-engine-pure-math.md` — Pure-Math-Engine

### Geschwister-Tickets (Pro-Di Pre-Launch)
- `thoughts/shared/tickets/prodi-prelaunch/soll-06-zeiten-nachfrage-workflow.md` — „Keine Zeiten erfasst"-Workflow (ähnliches Approval-Muster)
- `thoughts/shared/tickets/prodi-prelaunch/soll-07-vi-wochenenden-optional.md`
- `thoughts/shared/tickets/prodi-prelaunch/soll-08-zuschlagsvorlagen-tarifvertraege.md`
- `thoughts/shared/tickets/prodi-prelaunch/pflicht-04-probezeit-erkennung.md`

### Status / Overview
- `thoughts/shared/tickets/prodi-prelaunch/README.md` — Pre-Launch-Roadmap
- `thoughts/shared/status/2026-04-13-stand.md` — Projekt-Status
- `thoughts/shared/docs/admin-approvals.md` — Bestehende Approvals-Admin-UI
- `thoughts/shared/docs/absences.md` — Absence-UI-Spec

## Related Research

- `thoughts/shared/research/2026-04-17-ueberstunden-auszahlung.md` — Ticket 3 (Abhängigkeit)
- `thoughts/shared/research/2026-04-17-pflicht-03-ueberstunden-auszahlung-impact-map.md` — Ticket 3 Impact-Map
- `thoughts/shared/research/2026-04-16-nachtschicht-bewertungslogik.md` — Ticket 1 (Abhängigkeit)
- `thoughts/shared/research/2026-01-28-manager-approvals-dashboard.md` — Manager-Approval-UI-Patterns
- `thoughts/shared/research/2026-01-26-NOK-222-absence-request-form.md` — Absence-Request-Lifecycle
- `thoughts/shared/research/2026-03-08-ZMI-TICKET-240-absence-service-router.md` — Absence-Service-Struktur
- `thoughts/shared/research/2026-01-29-ZMI-TICKET-012-correction-assistant-and-errors.md` — Korrekturassistent-Struktur

## Architektur-Entscheidungen (2026-04-18, verbindlich für den Plan)

Die folgenden Entscheidungen wurden nach Abschluss des Research getroffen und reduzieren den Ticket-Scope von XL auf L.

### D1 — Approver-Modell: Permission-basiert, tenantweit
- Neuer Permission-Key `overtime.approve` in `src/lib/auth/permission-catalog.ts` (nach Zeile 99), analog zu `absences.approve`.
- `findOvertimeApproverUserIds()` als 1:1-Spiegelung von `absences-repository.ts:463-480` — JSONB-Containment (`ug.permissions @> '["overtime.approve"]'::jsonb`) tenantweit, ohne Department/Team-Filter.
- **Kein `approverRole`-Enum**, kein Team-Scope in Phase 1.
- **`ApprovalRule` entfällt als eigenständiges Modell in Phase 1.** Mehrstufigkeit (z.B. „ab 4h auch HR") wird umgesetzt über:
  - zweiten Permission-Key `overtime.approve.escalated`
  - Threshold-Feld `escalationThresholdMinutes Int?` auf `OvertimeRequestConfig` (Singleton-Pattern, `@@unique([tenantId])`, analog zu `SystemSetting`/`BillingTenantConfig`)
- Keine Policy-Tabelle wie `InboundInvoiceApprovalPolicy`.

### D2 — Verwertungswunsch: NICHT Teil dieses Tickets
- `OvertimeRequest` hat **kein** `utilizationType`-Feld.
- Modell-Felder in Phase 1: `requestType (PLANNED|REOPEN)`, `requestDate`, `plannedMinutes`, `actualMinutes?`, `reason String`, `status`, `approvedBy?`, `approvedAt?`, `rejectionReason?`, `arbzgWarnings String[]`, `arbzgOverrideReason String?`.
- Verwertung bleibt tarifregel-getrieben und monats-final über den bestehenden Ticket-3-Pfad (Commit `5316ef2f`).
- MA-Antrag enthält nur `reason`, keine Verwertungswahl.
- Ein per-Antrag-Verwertungswunsch ist **Post-Launch (Ticket 3.1)** und nicht Bestandteil dieses Plans.
- Ticket-Akzeptanzkriterium 1 (Verwertungswunsch im Antragsformular) **entfällt**.

### D3 — ArbZG Phase 1: §3 Tages-10h, §5 11h-Ruhezeit, §9 Sonn-/Feiertag
- `ArbZGValidator.validate(employeeId, date, plannedAdditionalMinutes) → Warnings[]` implementiert **drei** Regeln:
  - §3 ArbZG Tages-10h: gelesen aus `empDayPlan.dayPlan.maxNetWorkTime` (bestehender Tenant-Cap in `day-plans-service.ts:186`), **nicht hardcoded**.
  - §5 ArbZG 11h-Ruhezeit: letzte Ausstempelung aus `Booking`-Range des Vortages vs. erste geplante Zusatz-Arbeit.
  - §9 ArbZG Sonn-/Feiertag: Wochentag + `Holiday`-Flag-Check.
- **48h/6-Monats-Schnitt (§3 Abs. 2 ArbZG) ist explizit Out of Scope** — eigenes Post-Launch-Ticket; kein Rolling-Window-Aggregat auf `MonthlyValue`-Ebene.
- Keine Sondergruppen-Regeln (JArbSchG/Jugendliche, MuSchG/Mutterschutz) in Phase 1.
- ArbZG-Warnings sind **reine Warnungen**, kein harter Block. Override durch Genehmiger mit Pflicht-`arbzgOverrideReason`.
- Ticket-Akzeptanzkriterium 5 reduziert von vier auf drei Regeln.

### Abgeleitete Implementierungs-Punkte
- **UNAPPROVED_OVERTIME**-Code: ergänzt an vier Stellen (`src/lib/calculation/errors.ts`, `correction-assistant-service.ts:55-62` Warning-Liste, `mapCorrectionErrorType` Case, beide `defaultCorrectionMessages` DE+EN). **Additiv**, kein Aufräumen der bestehenden Doppelkatalog-Struktur in diesem Ticket.
- **`daily-calc.ts`-Integration**: in `calculateWithBookings()` nach `result.overtime`-Compute (`calculator.ts:153`), vor `resultToDailyValue()` (`daily-calc.ts:1346`), prüfen: wenn `overtime > 0` UND kein `OvertimeRequest` mit `status="approved"` für `(tenantId, employeeId, requestDate)` ⇒ `"UNAPPROVED_OVERTIME"` in `errorCodes` pushen. Batch-Lookup im `buildCalcInput`-Pfad, um N+1 zu vermeiden.
- **Status-State-Machine**: strikt nach `absences-repository.ts:315-331`-Pattern — `updateIfStatus(expectedStatus, data)` mit `updateMany`-CAS; `count === 0 ⇒ ValidationError`.
- **Notifications**: nach `absences-service.ts:18-39`-Pattern — `prisma.notification.create` mit `type: "approvals"` + `publishUnreadCountUpdate()` in best-effort `try/catch`.
- **Reopen-Pre-Insert-Check**: kein Lock-Konzept auf Booking. Umsetzung als Pre-Insert-Check in `bookings-service.create` (oder Repository) vor Insert eines `direction="in"`-Bookings auf einen Tag mit bereits vorhandenem OUT-Booking ⇒ `overtimeRequestRepo.hasActiveReopen(tenantId, employeeId, bookingDate)` muss `true` liefern, sonst `BookingValidationError`.

### Deferred / Post-Launch (nicht Bestandteil dieses Plans)
- **Vertretungsregel bei Abwesenheit des Genehmigers**: Heute gibt es keine aktive „Abwesend"-Prüfung im `findApproverUserIds`-Flow. Post-Launch, ggf. mit Live-Query gegen `AbsenceDay`.
- **Department-/Team-spezifische Approver** („Schichtleiter genau dieser Abteilung"): Tenantweite Permission-Liste reicht in Phase 1.
- **Per-Antrag-Verwertungswunsch (ACCOUNT/PAYOUT/TIME_OFF)**: siehe D2 — Ticket 3.1.
- **§3 Abs. 2 ArbZG 48h/6-Monats-Schnitt**: siehe D3 — eigenes Ticket.
- **Echte Policy-Tabelle (`ApprovalRule`)** für Mehrstufigkeit: siehe D1 — Threshold-Feld auf Singleton-Config reicht in Phase 1.
