---
date: 2026-04-20
planner: impactj90
git_commit: bef008ba
branch: staging
repository: terp
parent_ticket: thoughts/shared/tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md
parent_plan: thoughts/shared/plans/2026-04-18-soll-05-ueberstundenantrag.md
status: ready-for-implementation
t_shirt: S
tags: [plan, overtime-request, reopen, config-toggle]
---

# soll-05 Follow-Up: Konfigurierbares Reopen-Gate — Implementation Plan

## Overview

Das in soll-05 eingebaute Reopen-Gate (`bookings-service.createBooking` blockiert einen zweiten IN-Work-Booking an einem Tag, an dem schon ein OUT-Work-Booking existiert, außer es gibt einen aktiven approved REOPEN-Antrag) ist heute hart aktiviert.

Ziel: Tenant-weites Toggle auf `OvertimeRequestConfig.reopenRequired` (Default `true` = bisheriges Verhalten). Wenn `false`:

1. Das `createBooking`-Gate wird übersprungen — die Stempeluhr bleibt offen.
2. Neue `REOPEN`-Anträge werden vom Service abgelehnt (Validation-Error).
3. Im MA-Antragsformular wird die REOPEN-Radio-Option ausgeblendet.

Historische Daten (bereits approved REOPEN-Anträge, Pending-Anträge, bereits angelegte Bookings) bleiben unberührt.

`UNAPPROVED_OVERTIME`-Erkennung im Korrekturassistent bleibt in **beiden** Modi aktiv — HR sieht Fälle mit `overtime > 0` ohne genehmigten Antrag unabhängig vom Gate-Modus.

## Current State Analysis

Verifiziert gegen den Code nach Merge des soll-05-Hauptplans:

- `OvertimeRequestConfig` Singleton-Modell: `prisma/schema.prisma` (5 Felder — `approvalRequired`, `leadTimeHours`, `monthlyWarnThresholdMinutes`, `escalationThresholdMinutes`, plus `id`/`tenantId`/Timestamps). `reopenRequired` existiert heute nicht.
- Reopen-Gate lebt in `src/lib/services/bookings-service.ts` innerhalb `createBooking`, zwischen `assertMonthNotClosed` und `repo.create`. Lädt kein Config, ruft nur `overtimeRequestRepo.hasActiveReopen`.
- `REOPEN` als gültiger `requestType`-Wert wird heute im Service (`create`) und via Zod-Enum im Router durchgereicht, ohne Config-Check.
- MA-Antragsformular (`src/components/overtime-requests/overtime-request-form.tsx`) rendert beide Radio-Optionen (PLANNED + REOPEN) unconditionally.
- Admin-Config-Seite (`src/app/[locale]/(dashboard)/admin/overtime-request-config/page.tsx`) hat vier Input-Controls; der Switch für `approvalRequired` ist das direkte Vorbild für den neuen Switch.
- `overtime_requests_active_reopen` Partial Unique Index bleibt korrekt — auch wenn `reopenRequired=false` werden keine neuen REOPEN-Anträge erzeugt; der Index schützt nur bestehende Daten.

## Desired End State

- `OvertimeRequestConfig.reopenRequired: boolean` (Default `true`).
- Admin kann das Toggle in `/admin/overtime-request-config` setzen und speichern.
- Wenn `reopenRequired=true`: unverändertes Verhalten aus soll-05.
- Wenn `reopenRequired=false`:
  - MA-Antragsformular zeigt **nur** die PLANNED-Option; REOPEN ist nicht wählbar.
  - Service lehnt `create({ requestType: "REOPEN" })` mit `OvertimeRequestValidationError("reopen_disabled")` ab.
  - `createBooking` überspringt den Gate-Check komplett — ein zweiter IN-Booking nach einem OUT geht durch.
- Bestehende approved/pending REOPEN-Anträge bleiben lesbar und historisch erhalten.

### Verification
- `pnpm typecheck && pnpm lint && pnpm vitest run src/lib/services/__tests__ src/trpc/routers/__tests__` alle grün.
- Manuelle Schritte aus §4 dieses Plans.

## Key Discoveries

- **Config-Load-Cost im Booking-Pfad**: Die `configService.getOrCreate()`-Query fällt nur an, wenn `bookingType.direction === "in" && category === "work"` und `dayOuts > 0` — also exakt im "Reopen-Attempt"-Hot-Path. Kein Overhead für normale erste IN-Buchungen pro Tag. Trotzdem: Query hinter das `dayOuts > 0`-Check stellen, damit wir Config nur lesen, wenn das Gate überhaupt relevant wäre.
- **Kein `$transaction`-Wrapper nötig**: Config-Read ist außerhalb der Booking-Transaktion OK — Race zwischen Admin-Config-Flip und gleichzeitigem Clock-In ist akzeptabel (Worst Case: ein Clock-In wird kurz nach Flip noch einmal geblockt oder durchgelassen, beides nicht datenintegritätskritisch).
- **Historische REOPEN-Rows schützen**: Wenn `reopenRequired=false` gesetzt wird während pending REOPEN-Anträge existieren, sollen diese nicht auto-cancelled werden. Der Approver kann sie manuell durchwinken oder ablehnen; Status-Transitions werden nicht vom Config-Feld beeinflusst. Nur **neue** Create-Calls werden gesperrt.
- **`pendingCount`-Zahl im Approver-Badge** bleibt korrekt: Pending REOPEN-Rows aus Zeit-vor-Flip werden weiterhin mitgezählt. Akzeptabel.
- **Permission-Semantik unverändert**: `overtime.request` reicht weiterhin für PLANNED-Anträge. `overtime.approve` approved weiterhin beide Typen. Keine neue Permission.

## What We're NOT Doing

- **Keine Auto-Cancellation** existierender pending REOPEN-Anträge beim Flip false → true oder true → false.
- **Keine Migration** von historischen Daten. Das neue Feld erhält Default `true` via Prisma + SQL, was für alle existierenden Tenants das Verhalten vor diesem Plan reproduziert.
- **Kein Per-Employee/Per-Department-Override** — tenant-weites Toggle reicht.
- **Kein dritter Modus** wie `WARN_ONLY` (loggen aber nicht blockieren) — nur binary true/false.
- **Kein Audit-Trail-Eintrag für historische REOPENs** beim Flip — der bestehende `update`-Audit auf `OvertimeRequestConfig` reicht als Änderungsnachweis.
- **Keine Änderung am `UNAPPROVED_OVERTIME`-Pfad** — bleibt in beiden Modi aktiv, wie oben begründet.

## Implementation Approach

Vier Phasen, alle landen in einem PR:

1. Schema + Migration (Feld `reopen_required`, Default `true`).
2. Service + Router (Config-Feld durchreichen, REOPEN-Create-Gate, Booking-Gate-Skip).
3. UI (Admin-Switch + MA-Form-Conditional).
4. Tests + Manuelle Verifikation.

---

## Phase 1: Schema + Migration

### Changes Required

#### 1. `prisma/schema.prisma`

`OvertimeRequestConfig`-Model erweitern (nach `escalationThresholdMinutes`):

```prisma
model OvertimeRequestConfig {
  // ... bestehende Felder ...
  reopenRequired              Boolean  @default(true) @map("reopen_required")
  // ... bestehende Timestamps ...
}
```

#### 2. Neue Supabase-Migration

**File**: `supabase/migrations/<timestamp>_add_reopen_required_to_overtime_request_config.sql`

```sql
ALTER TABLE overtime_request_config
  ADD COLUMN reopen_required BOOLEAN NOT NULL DEFAULT true;
```

Kein Backfill nötig — Default `true` deckt alle bestehenden Zeilen ab.

### Success Criteria

#### Automated Verification
- [ ] `pnpm db:generate` grün.
- [ ] `pnpm db:reset` appliziert die neue Migration sauber.
- [ ] `pnpm typecheck` grün.

#### Manual Verification
- [ ] In psql: `\d overtime_request_config` zeigt Spalte `reopen_required BOOLEAN NOT NULL DEFAULT true`.
- [ ] `SELECT reopen_required FROM overtime_request_config;` für existierende Rows = `true`.

---

## Phase 2: Service + Router

### Changes Required

#### 1. `src/lib/services/overtime-request-config-service.ts`

- `OvertimeRequestConfigRow`-Interface: Feld `reopenRequired: boolean` ergänzen.
- `getOrCreate` + `update`: `reopenRequired` in `toRow()`-Mapper übernehmen.
- `update()`-Input-Interface: `reopenRequired?: boolean` als optionaler Parameter.
- `update()`-Body: wenn `input.reopenRequired !== undefined`, in `data` übernehmen.

#### 2. `src/lib/services/overtime-request-service.ts`

In `create()`, direkt **nach** dem `configService.getOrCreate()`-Call (wo heute schon `autoApprove` + `leadTimeHours` ausgewertet werden), neues Check:

```ts
if (input.requestType === "REOPEN" && !config.reopenRequired) {
  throw new OvertimeRequestValidationError("reopen_disabled")
}
```

Reihenfolge: Diese Prüfung steht **vor** der ArbZG-Validierung — wenn REOPEN ohnehin nicht erlaubt ist, macht das Warnings-Compute keinen Sinn.

#### 3. `src/lib/services/bookings-service.ts`

Das bestehende Gate in `createBooking` (nach `assertMonthNotClosed`) umbauen. Heute:

```ts
if (bookingType.direction === "in" && bookingType.category === "work") {
  const dayOuts = await prisma.booking.count({ ... })
  if (dayOuts > 0) {
    const allowed = await overtimeRequestRepo.hasActiveReopen(...)
    if (!allowed) throw new BookingValidationError("reopen_not_approved")
  }
}
```

Neu: Config-Read **nach** dem `dayOuts > 0`-Check (nur wenn das Gate überhaupt in Frage kommt):

```ts
if (bookingType.direction === "in" && bookingType.category === "work") {
  const dayOuts = await prisma.booking.count({ ... })
  if (dayOuts > 0) {
    const config = await configService.getOrCreate(prisma, tenantId)
    if (config.reopenRequired) {
      const allowed = await overtimeRequestRepo.hasActiveReopen(...)
      if (!allowed) throw new BookingValidationError("reopen_not_approved")
    }
  }
}
```

Import: `import * as overtimeRequestConfigService from "./overtime-request-config-service"` (Alias frei wählbar; Konvention in diesem File ist `configService` passend).

#### 4. `src/trpc/routers/overtimeRequestConfig.ts`

- `configOutputSchema`: `reopenRequired: z.boolean()` ergänzen.
- `update`-Input-Schema: `reopenRequired: z.boolean().optional()` ergänzen.

### Success Criteria

#### Automated Verification
- [ ] `pnpm typecheck` grün.
- [ ] `pnpm vitest run src/lib/services/__tests__ src/trpc/routers/__tests__` grün (bestehende Tests).
- [ ] Neue Tests siehe Phase 4.

---

## Phase 3: UI

### Changes Required

#### 1. Admin-Config-Seite

**File**: `src/app/[locale]/(dashboard)/admin/overtime-request-config/page.tsx`

Neuer Switch zwischen `approvalRequired` und `leadTimeHours`:

- State-Variable `reopenRequired: boolean`, default aus `config.reopenRequired`, sonst `true`.
- UI: Label "Reopen-Antragspflicht", Hint-Text "Erzwingt einen genehmigten Reopen-Antrag, bevor nach dem Ausstempeln erneut eingestempelt werden darf.".
- In `handleSave` die neue Property an `update.mutateAsync(...)` durchreichen.

#### 2. MA-Antragsformular

**File**: `src/components/overtime-requests/overtime-request-form.tsx`

- Neuen Hook-Call: `const { data: config } = useOvertimeRequestConfig()`. Read-only — MA braucht kein Write.
- Wenn `config.reopenRequired === false`: REOPEN-Radio-Option nicht rendern, initialer `requestType`-State bleibt `PLANNED`.
- Wenn Formular mit vorhandenem State geöffnet wird und Config-Flip passiert war: beim Open Effekt auf `config.reopenRequired` reagieren und zurück auf `PLANNED` setzen.

**Permission-Frage**: `useOvertimeRequestConfig` ruft den Admin-Getter auf, der durch `settings.manage` gegated ist. Der normale MA hat das nicht. Lösung:

- Entweder eine neue public `overtimeRequestConfig.getPublic`-Prozedur einführen, die nur die für MA relevanten Flags (`reopenRequired`, `approvalRequired`) zurückgibt und **ohne** `settings.manage` aufrufbar ist (nur `tenantProcedure`).
- Oder die Feature-Gate in den Service verlagern: MA kann REOPEN-Antrag einreichen, Service wirft `reopen_disabled`-Error, Form zeigt Fehler-Toast. Weniger sauber für UX.

**Empfehlung**: Variante 1 — neue Procedure `overtimeRequestConfig.getPublic`, gibt `{ reopenRequired, approvalRequired }` zurück, nur für eingeloggte Tenant-Member. Hook `useOvertimeRequestConfigPublic` (oder `useOvertimeRequestPolicy`) dazu.

#### 3. i18n-Strings

`messages/de.json` + `messages/en.json` im `overtime_requests.admin.config`-Namespace:

```json
"reopenRequired": "Reopen-Antragspflicht",
"reopenRequiredHint": "Erzwingt einen genehmigten Reopen-Antrag, bevor nach dem Ausstempeln erneut eingestempelt werden kann. Deaktiviert: Stempeluhr bleibt offen."
```

Analog EN:

```json
"reopenRequired": "Require reopen approval",
"reopenRequiredHint": "Requires an approved reopen request before clocking in again after clocking out. When disabled, the time clock stays open."
```

Optional: ein neuer Key `overtime_requests.form.requestType.reopenDisabled` für eine Info-Zeile im Formular, wenn REOPEN ausgeblendet wird. Kann auch ohne sichtbaren Hinweis laufen (das Feature ist dann einfach weg).

### Success Criteria

#### Automated Verification
- [ ] `pnpm typecheck` + `pnpm lint` grün.
- [ ] JSON-Validität der Message-Files.

#### Manual Verification
- [ ] Admin setzt `reopenRequired=false`, speichert, lädt neu → Switch bleibt aus.
- [ ] MA öffnet Antragsformular → nur PLANNED-Radio sichtbar.
- [ ] Admin setzt zurück auf `true` → MA-Formular zeigt wieder beide Optionen (ggf. nach Reload).

---

## Phase 4: Tests + Verifikation

### Automated Tests (neu)

1. **`overtime-request-config-service.test.ts`** (falls noch nicht existiert, sonst extend):
   - `getOrCreate` liefert `reopenRequired: true` per Default.
   - `update({ reopenRequired: false })` schreibt Feld, nächster `getOrCreate` liest `false`.

2. **`overtime-request-service.test.ts`** (existiert noch nicht, sinnvoll jetzt einzuführen oder in Form von 1-2 gezielten Cases):
   - `create({ requestType: "REOPEN" })` wirft `OvertimeRequestValidationError("reopen_disabled")` wenn `reopenRequired=false`.
   - `create({ requestType: "PLANNED" })` geht unverändert durch bei `reopenRequired=false`.
   - `create({ requestType: "REOPEN" })` geht durch bei `reopenRequired=true` (Regression).

3. **`bookings-service.test.ts`** (Gate-Pfad):
   - IN-Work nach OUT-Work, `reopenRequired=true`, kein Approved REOPEN → Error.
   - IN-Work nach OUT-Work, `reopenRequired=false` → succeeds.
   - IN-Work ohne vorheriges OUT → succeeds in beiden Modi.

### Manual Verification

- [ ] Flip `reopenRequired=false` → Stempeluhr nach Ausstempeln erlaubt erneutes Einstempeln (kein Error-Toast).
- [ ] Derselbe Tag: `DailyValue.errorCodes` enthält weiterhin `UNAPPROVED_OVERTIME` wenn Gesamtzeit > Soll und kein Antrag existiert.
- [ ] Flip zurück auf `true` → neuer Clock-In nach Clock-Out blockt wieder mit `reopen_not_approved`.
- [ ] Versuche als MA, via tRPC-Devtool direkt `overtimeRequests.create({ requestType: "REOPEN" })` zu schicken während `reopenRequired=false` → Error `reopen_disabled`.
- [ ] Bestehende pending REOPEN-Rows aus der Zeit vor dem Flip sind im Approver-Queue weiterhin sicht- und bearbeitbar.

---

## Migration Notes

- Default `true` → Verhalten existierender Tenants unverändert. Kein Communication-Overhead zu Bestandskunden.
- Für Neukunden, die das Gate nicht haben wollen: Admin setzt `reopenRequired=false` in der Config-Seite nach Tenant-Setup.
- Rollback: `ALTER TABLE overtime_request_config DROP COLUMN reopen_required;` — die Service/Router/UI-Referenzen auf das Feld müssen entfernt werden, weshalb Rollback am PR-Level (nicht nur Migration) erfolgen muss.

## Open Questions (zu klären vor Implementation)

1. **Public Config-Endpoint vs. Service-Level-Gate**: Soll der MA beim Öffnen des Formulars Tenant-Config-Flags lesen dürfen (neue `getPublic`-Procedure), oder leben wir mit einem Service-Error-Toast und rendern immer beide Optionen? — Empfehlung oben: Variante 1.
2. **Soll `reopenRequired=false` auch approved REOPENs aus der Liste/Detail-Ansicht verbergen?** — Empfehlung: nein, historisch sichtbar lassen; keine Datenmanipulation am Config-Flip.
3. **Brauchen wir einen zusätzlichen Hinweis im Approver-Queue**, dass REOPEN-Anträge aus Zeit-vor-Flip evtl. "verwaist" sind? — Empfehlung: nein, reine Statusanzeige reicht.

## References

- Parent plan: `thoughts/shared/plans/2026-04-18-soll-05-ueberstundenantrag.md`
- Ticket: `thoughts/shared/tickets/prodi-prelaunch/soll-05-ueberstundenantrag.md`
- Gate-Code-Site: `src/lib/services/bookings-service.ts` (Funktion `createBooking`, post-`assertMonthNotClosed`)
- Config-Service: `src/lib/services/overtime-request-config-service.ts`
- Create-Service: `src/lib/services/overtime-request-service.ts` (Funktion `create`)
- MA-Form: `src/components/overtime-requests/overtime-request-form.tsx`
- Admin-Config-UI: `src/app/[locale]/(dashboard)/admin/overtime-request-config/page.tsx`
