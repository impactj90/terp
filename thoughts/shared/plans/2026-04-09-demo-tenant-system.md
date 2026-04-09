---
date: 2026-04-09
author: impactj90
git_commit: 8d1aac8961be4ac2e323822fe437ae7b00c55bc8
branch: staging
repository: terp
topic: "Demo-Tenant-System — gated Sales-Enablement-Sandbox"
tags: [plan, tenants, demo, multi-tenant, sales-enablement, cron, supabase-auth, templates]
status: draft
depends_on:
  - "PREREQ: Login-Gap-Fix in users-service.ts (separater Vorgänger-Ticket, siehe Phase 0)"
research: thoughts/shared/research/2026-04-09-demo-tenant-system.md
---

# Demo-Tenant-System Implementation Plan

## Overview

Ein gated Sales-Enablement-Sandbox-System auf der produktiven Terp-Infrastruktur: Ein Platform-Admin (heute via `tenants.manage` Permission) kann für einen Interessenten einen Demo-Tenant anlegen, der für 14 Tage (verlängerbar) mit einem Template vorbefüllt ist. Bei Ablauf wird der Tenant automatisch gesperrt (Cron, `0 1 * * *`). Der Interessent kann weiterhin einloggen, sieht aber eine dedizierte "Demo abgelaufen"-Seite. Der Admin kann Demos manuell verlängern, in echte Kunden konvertieren (mit Wahl "Daten behalten" oder "verwerfen") oder hart löschen.

## Current State Analysis

Komplette Ist-Analyse in `thoughts/shared/research/2026-04-09-demo-tenant-system.md`. Kernpunkte, die dieser Plan adressiert:

- **`Tenant` Model** hat keine Demo-Felder (`prisma/schema.prisma:94-163`). Muss um 5 Spalten erweitert werden.
- **`tenants.create`** schreibt Tenant + einen `user_tenants`-Row, aktiviert aber **kein** Modul (`src/trpc/routers/tenants.ts:243-377`). Demo-Tenants müssen explizit `core/crm/billing/warehouse` einschalten.
- **Login Gap** (`src/lib/services/users-service.ts:60-135`): `users.create` schreibt nur `public.users` + `user_tenants`, ruft **nie** `supabase.auth.admin.createUser`. Ohne Phase 0 (separater Vorgänger-Ticket) kann der Demo-Admin sich nicht einloggen.
- **Keine Seed-Factories**: Alles in `supabase/seed.sql` (~4400 Zeilen SQL). Demo-Templates müssen als neues Pattern `src/lib/demo/templates/*.ts` eingeführt werden.
- **Cron-Pattern existiert** (`src/app/api/cron/execute-macros/route.ts`): `Authorization: Bearer <CRON_SECRET>`, `CronCheckpoint`, `maxDuration: 300`. Neuer Expiration-Cron folgt diesem Pattern.
- **Admin-UI-Pattern existiert** (`src/app/[locale]/(dashboard)/admin/tenants/page.tsx`): `useHasPermission(['tenants.manage'])`, `TenantDataTable`, `TenantFormSheet`. Demo-Tenants bekommen eine eigene Sektion auf derselben Seite.
- **`tenant-service.ts` ist Dead Code** (verifiziert per Grep, 0 Source-Imports). Dieser Plan fasst ihn **nicht** an — neuer `demo-tenant-service.ts` lebt daneben.

## Desired End State

Nach Abschluss aller Phasen:

- `Tenant` hat 5 neue Nullable-Spalten (`is_demo`, `demo_expires_at`, `demo_template`, `demo_created_by`, `demo_notes`), mit Partial-Index auf `(demo_expires_at) WHERE is_demo = true`.
- Ein neuer Router `demo-tenants` exposet: `list`, `create`, `extend`, `convert`, `expireNow`, `delete`. Alle gated durch `tenants.manage`.
- `demoTenants.create` legt atomar an: Tenant (`is_demo=true`, `demo_expires_at=now()+14d`), alle 4 Demo-Module, einen Admin-User mit Supabase-Auth-Identity (via Phase 0), einen Template-Run (default `industriedienstleister_150`), Audit-Log-Eintrag `demo_create`.
- Der Cron `/api/cron/expire-demo-tenants` läuft täglich 01:00, findet Demos mit `is_demo=true AND demo_expires_at < now() AND isActive=true`, setzt `isActive=false`, schreibt Audit `demo_expired`.
- Das Admin-UI `/admin/tenants` zeigt über der normalen Tenant-Liste eine Card "Aktive Demos" mit Tabelle, Countdown (`days_remaining`), Actions: Extend (+7/+14), Convert, Expire Now, Delete (nur wenn abgelaufen). Create-Demo öffnet eine Sheet, Convert öffnet einen Dialog mit Radio "Daten behalten / Daten verwerfen".
- Wenn ein User sich in einen Demo-Tenant einloggt, der abgelaufen ist (`tenant.is_demo && tenant.demo_expires_at < now()`), leitet der Dashboard-Layout auf `/demo-expired` um (Session bleibt bestehen). Die Seite zeigt Kontakt-Info und einen "In echten Kunden konvertieren"-CTA, der intern Tolga benachrichtigt.

### Key Discoveries
- `prisma.$transaction` wird im Tenant-Create bereits verwendet (`src/trpc/routers/tenants.ts:286-342`) — Pattern wiederverwendbar für atomare Demo-Anlage mit Modul-Aktivierung
- `auditLog.log(...).catch(...)` ist der etablierte "fire-and-forget"-Audit-Pattern (`src/trpc/routers/tenants.ts:354`, `src/lib/services/users-service.ts:122-132`)
- `CronCheckpoint` Model existiert für Resumable-Cron-Runs (`src/app/api/cron/execute-macros/route.ts:80-98`) — Demo-Expiration-Cron nutzt denselben Pattern mit `runKey = YYYY-MM-DD`
- `tenant-module-repository.ts:33` ist der einzige Ort mit `prisma.tenantModule.upsert` — der Demo-Service ruft ihn 4× auf innerhalb der Transaction
- `createAdminClient()` (`src/lib/supabase/admin.ts:12-23`) liefert einen service-role Supabase-Client — Phase 0 verwendet ihn für `auth.admin.createUser` + `auth.admin.generateLink`
- `tenantIdStorage` + `TenantProvider` (`src/providers/tenant-provider.tsx`) lädt `tenants.list` bei Login — die Demo-Felder müssen im Tenant-Output-Schema enthalten sein, damit der Frontend-Gate-Check funktioniert

## What We're NOT Doing

Explizit **ausserhalb** des Scope dieses Plans (einige davon sind bewusst auf "später" vertagt):

- **Platform-Admin-Rolle** — existiert heute nicht, wird hier nicht eingeführt. Alles läuft über `tenants.manage`. Wenn Platform-Admin später kommt, wird der Permission-Check in `demo-tenants.ts` umgestellt.
- **Read-only-Mode für laufende Demos oder zahlungssäumige Kunden** — erfordert codebase-weite Read/Write-Differenzierung im tRPC-Middleware (heute existiert keine `opts.type`/`.meta()`-Nutzung). Bewusste Entscheidung: Kein Pattern auf Verdacht einführen. Expired Demos werden hart geblockt via `isActive=false` + Frontend-Gate.
- **Aufräumen von `tenant-service.ts`** — Dead Code existiert parallel zum Router-Inline-Pattern, wird **nicht** in diesem Plan angefasst. Separates Thema.
- **Weitere Demo-Templates** jenseits von `industriedienstleister_150` — erst wenn konkreter Bedarf (nicht auf Verdacht).
- **Self-Service-Signup** für Demos — Demos sind gated (Admin-only). Kein öffentliches Signup-Formular.
- **Auto-Billing-Trigger bei Konvertierung** — Billing-Infrastruktur existiert noch nicht (kein Stripe/Subscription-Code). Tolga triggert Billing manuell nach Convert-Notification.
- **Auto-Delete nach X Tagen** — Löschen ist destruktiv, bleibt manuell. Nach Convert bleibt der Tenant als normaler Tenant bestehen.
- **Anpassungen am bestehenden `users.create` Flow ausserhalb der Login-Gap-Fix** — Phase 0 fasst nur das Notwendige an.
- **Migration existierender Tenants auf Demo-Felder** — Default-Werte sind `null`/`false`, existierende Tenants bleiben unberührt.
- **`supabase/seed.sql` Anpassungen** — der Standard-Dev-Tenant bleibt wie er ist, keine Demo-Daten in `seed.sql`.

## Implementation Approach

**Sequenzierung:** Phase 0 (Login-Gap-Fix) ist ein separates Vorgänger-Ticket. Danach die Phasen 1→6 strikt sequentiell. Jede Phase hat automatisch-verifizierbare Kriterien und eine manuelle Verifikation am Ende; nach jeder Phase Pause für manuelle Bestätigung bevor die nächste beginnt.

**Code-Organisation:**
- DB-Änderungen: Prisma-Schema + Supabase-Migration (`supabase/migrations/20260410000000_add_tenant_demo_fields.sql`)
- Template-Engine: Neues `src/lib/demo/` Verzeichnis (neuer Patterns-Code, kein Service/Repository-Split — Templates sind pure Funktionen)
- Service-Layer: Neuer `src/lib/services/demo-tenant-service.ts` + `src/lib/services/demo-tenant-repository.ts` (folgt dem Standard-Service+Repository-Pattern der Codebase, **nicht** dem Router-Inline-Pattern des bestehenden Tenant-Routers)
- Router: Neuer `src/trpc/routers/demo-tenants.ts`, gemountet in `_app.ts`
- Cron: Neue Route `src/app/api/cron/expire-demo-tenants/route.ts`, registriert in `vercel.json`
- Frontend: Admin-Panel in bestehender `/admin/tenants`-Seite, neue Komponenten in `src/components/tenants/demo/`, neue Hook-Datei `src/hooks/use-demo-tenants.ts`, neue Seite `src/app/[locale]/(auth)/demo-expired/page.tsx` (im `(auth)`-Layout, da logged-in aber außerhalb Dashboard-Gates)

## Phase 0: Prerequisite — Login Gap Fix

**Note:** Dieser Phase ist **kein** Teil dieses Plans, sondern ein separater Vorgänger-Ticket (`thoughts/shared/tickets/fix-login-gap-user-creation.md`, anzulegen). Der Demo-Tenant-Plan ist **hart abhängig** davon, weil Phase 3 (Demo-Admin-Anlage) den Supabase-Auth-Code-Path benötigt.

### Scope des Vorgänger-Tickets

**Problem 1 — Trigger-Konflikt vorab lösen.** Der bestehende `handle_new_user` Trigger (`supabase/migrations/20260101000002_handle_new_user_trigger.sql`) feuert bei jedem `INSERT INTO auth.users` und sync't automatisch nach `public.users`. Wenn unser Service vor dem Supabase-Auth-Insert bereits einen `public.users`-Row mit derselben ID angelegt hat, wirft der Trigger eine Unique-Violation. Auch die umgekehrte Reihenfolge (Supabase-Insert zuerst, Prisma danach) kollidiert, weil der Trigger zuerst einen Row mit Default-Werten anlegt, den unser Service dann mit den echten Feldern überschreiben müsste — unnötig fragil.

**Lösung:** Trigger um einen Skip-Pfad erweitern, der auf ein Flag in `auth.users.raw_user_meta_data` reagiert. Neue Migration als Teil von Phase 0:

```sql
-- supabase/migrations/20260409000000_handle_new_user_skip_flag.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Skip sync when caller (e.g. users-service.ts) will create the public.users row
  -- itself with the correct fields. Caller is responsible for atomicity.
  IF NEW.raw_user_meta_data->>'skip_public_sync' = 'true' THEN
    RETURN NEW;
  END IF;

  -- Existing behavior for external inserts (Supabase Dashboard, etc.)
  INSERT INTO public.users (id, email, username, display_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    'user',
    true
  );
  RETURN NEW;
END;
$$;
```

Diese Variante hält den Trigger für externe Inserts (Supabase Dashboard) funktionsfähig und bietet unserem Service einen sauberen Opt-out.

**Problem 2 — `users-service.ts` Create-Flow erweitern:**
1. Rufe `createAdminClient().auth.admin.createUser({ email, email_confirm: false, user_metadata: { display_name, skip_public_sync: 'true' } })` **vor** dem Prisma-Insert
2. Verwende den von Supabase zurückgegebenen `id` als `user.id` im Prisma-Insert (statt Prisma-generierter UUID). Durch das `skip_public_sync`-Flag feuert der Trigger nicht — der Prisma-Insert schreibt den Row erstmalig
3. Rufe `createAdminClient().auth.admin.generateLink({ type: 'invite', email })` — gibt einen Invite-Link zurück, der aus dem Service propagiert wird
4. Rollback-Logik: Wenn der Prisma-Insert fehlschlägt, `auth.admin.deleteUser(authUser.id)` im catch-Block aufrufen
5. `password` aus dem Input-Schema **entfernen** (wird ohnehin nie verwendet, irreführend)
6. **Service-Signatur erweitern:** Erster Parameter von `PrismaClient` auf `PrismaClient | Prisma.TransactionClient` ändern, damit Phase 3 den Service innerhalb einer Outer-Transaction aufrufen kann ohne Typ-Cast. Intern wird `prisma.user.create` sowohl auf dem Client als auch auf dem Tx-Handle unterstützt — die bestehende Prisma-API ist identisch.
7. **Rückgabewert erweitern:** Aktuell gibt `create` nur `user` zurück. Neu: `{ user, inviteLink }`. Router erweitert Output-Schema entsprechend.

### Success Criteria für Phase 0 (Vorgänger-Ticket)
- Ein via `users.create` angelegter User kann sich via `supabase.auth.signInWithPassword` einloggen (nachdem er den Invite-Link eingelöst hat)
- Der Rückgabewert von `users.create` enthält das Feld `inviteLink`
- Der `handle_new_user` Trigger erzeugt **keinen** Duplikat-Row in `public.users` — verifiziert per Integration-Test: `auth.admin.createUser` mit `skip_public_sync: 'true'` legt nur `auth.users` an, `SELECT count(*) FROM public.users WHERE id = <new>` = 0 bis zum expliziten Service-Call
- Der Trigger feuert für externe Inserts weiterhin — verifiziert per SQL-Test: `INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ext@test.local')` (ohne skip-Flag) erzeugt einen `public.users`-Row
- Service-Signatur akzeptiert sowohl `PrismaClient` als auch `Prisma.TransactionClient` ohne Cast
- Rollback-Pfad verifiziert: Wenn Prisma-Insert forciert fehlschlägt, existiert der `auth.users`-Row nicht mehr

**Dieser Plan beginnt formal mit Phase 1 und setzt voraus, dass Phase 0 fertig ist.**

---

## Phase 1: Schema & Migration

### Overview
Erweitere das `Tenant`-Model um 5 Demo-Felder. Keine Daten-Migration nötig — existierende Tenants bleiben mit `is_demo = false` (default).

### Changes Required

#### 1. Prisma Schema
**File**: `prisma/schema.prisma`
**Changes**: Neue Felder in `model Tenant` einfügen (nach `vacationBasis`, Zeile 110), und einen Index am Ende des Models.

```prisma
model Tenant {
  // ... existing fields unchanged ...
  vacationBasis         String    @default("calendar_year") @map("vacation_basis") @db.VarChar(20)

  // Demo-Tenant fields (see plan 2026-04-09-demo-tenant-system.md)
  isDemo                Boolean   @default(false) @map("is_demo")
  demoExpiresAt         DateTime? @map("demo_expires_at") @db.Timestamptz(6)
  demoTemplate          String?   @map("demo_template") @db.VarChar(100)
  demoCreatedById       String?   @map("demo_created_by") @db.Uuid
  demoNotes             String?   @map("demo_notes") @db.Text

  // Relations
  demoCreatedBy         User?     @relation("DemoTenantCreatedBy", fields: [demoCreatedById], references: [id], onDelete: SetNull)
  // ... existing relations unchanged ...

  @@index([isDemo, demoExpiresAt], name: "idx_tenant_demo_expiration")
}
```

Und in `model User` die inverse Relation:
```prisma
model User {
  // ... existing ...
  demoTenantsCreated   Tenant[] @relation("DemoTenantCreatedBy")
}
```

#### 2. Supabase Migration
**File**: `supabase/migrations/20260410000000_add_tenant_demo_fields.sql` (neu)

```sql
-- Demo-Tenant-System: Add is_demo flag + expiration + template + audit fields to tenants.
-- See thoughts/shared/plans/2026-04-09-demo-tenant-system.md

ALTER TABLE public.tenants
  ADD COLUMN is_demo          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN demo_expires_at  TIMESTAMPTZ NULL,
  ADD COLUMN demo_template    VARCHAR(100) NULL,
  ADD COLUMN demo_created_by  UUID        NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN demo_notes       TEXT        NULL;

-- Partial index: only demo rows are indexed, keeps the index small and the
-- expiration cron scan fast.
CREATE INDEX idx_tenant_demo_expiration
  ON public.tenants (demo_expires_at)
  WHERE is_demo = true;

-- Data-integrity guard: demo_expires_at must be set iff is_demo = true.
ALTER TABLE public.tenants
  ADD CONSTRAINT tenants_demo_expiration_consistency
  CHECK (
    (is_demo = false AND demo_expires_at IS NULL AND demo_template IS NULL)
    OR
    (is_demo = true  AND demo_expires_at IS NOT NULL)
  );

COMMENT ON COLUMN public.tenants.is_demo IS 'True if this tenant is a sales-enablement demo sandbox (plan 2026-04-09-demo-tenant-system.md).';
COMMENT ON COLUMN public.tenants.demo_expires_at IS 'When is_demo=true: point in time after which the cron flips isActive=false.';
COMMENT ON COLUMN public.tenants.demo_template IS 'Template key used for seeding; e.g. "industriedienstleister_150".';
COMMENT ON COLUMN public.tenants.demo_created_by IS 'User id of the admin who created this demo; FK to users.id.';
COMMENT ON COLUMN public.tenants.demo_notes IS 'Free-text notes from the creating admin (prospect, deal context, etc).';
```

#### 3. Regenerate Prisma Client
Run `pnpm db:generate` after migration.

### Success Criteria

#### Automated Verification
- [x] Migration applies cleanly: `pnpm db:reset`
- [x] Prisma schema validates: `pnpm db:generate`
- [x] Type check passes: `pnpm typecheck` (no new errors beyond the ~1463 baseline)
- [x] Lint passes: `pnpm lint`
- [x] Direct SQL probe confirms check-constraint works — both expected-reject and expected-accept cases via `psql`:
  ```sql
  -- must fail
  INSERT INTO tenants (name, slug, is_demo) VALUES ('x', 'test-x', true);
  -- must succeed
  INSERT INTO tenants (name, slug, is_demo, demo_expires_at) VALUES ('x', 'test-x2', true, now() + interval '14 days');
  ```

#### Manual Verification
- [x] `pnpm db:studio` zeigt die neuen Spalten im Tenant-Model
- [x] Bestehende Tenant-CRUD in `/admin/tenants` funktioniert unverändert (keine Regression)

**Implementation Note**: Nach dieser Phase pausieren für manuelle Bestätigung.

---

## Phase 2: Demo Template Engine

### Overview
Neuer Code-Bereich `src/lib/demo/` mit Template-Registry + Runner + einem ersten Template `industriedienstleister_150`. Templates sind reine TS-Funktionen, die eine Prisma-Transaction (oder den externen tx-Parameter) bekommen und tenant-scoped Daten schreiben.

### Changes Required

#### 1. Template Types
**File**: `src/lib/demo/types.ts` (neu)

```ts
import type { Prisma } from "@/generated/prisma/client"

/** Subset of PrismaClient methods available inside a transaction. */
export type DemoTx = Prisma.TransactionClient

export interface DemoTemplateContext {
  tenantId: string
  /** The admin user created alongside this demo tenant (for audit/ownership fields). */
  adminUserId: string
  /** Shared tx handle — all writes happen inside the outer tenant-create transaction. */
  tx: DemoTx
}

export interface DemoTemplate {
  /** Stable key stored in `tenants.demo_template`. */
  key: string
  /** Human label for admin UI. */
  label: string
  /** Short description surfaced in the create-demo sheet. */
  description: string
  /**
   * Applies this template's data to the given tenant.
   * Must be fully idempotent-per-tx (no external side effects).
   */
  apply: (ctx: DemoTemplateContext) => Promise<void>
}
```

#### 2. Template Registry
**File**: `src/lib/demo/registry.ts` (neu)

```ts
import type { DemoTemplate } from "./types"
import { industriedienstleister150 } from "./templates/industriedienstleister_150"

const REGISTRY: Record<string, DemoTemplate> = {
  [industriedienstleister150.key]: industriedienstleister150,
}

export function getDemoTemplate(key: string): DemoTemplate {
  const tpl = REGISTRY[key]
  if (!tpl) {
    throw new Error(`Unknown demo template: ${key}`)
  }
  return tpl
}

export function listDemoTemplates(): Array<Pick<DemoTemplate, "key" | "label" | "description">> {
  return Object.values(REGISTRY).map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
  }))
}

export const DEFAULT_DEMO_TEMPLATE = industriedienstleister150.key
```

#### 3. First Template
**File**: `src/lib/demo/templates/industriedienstleister_150.ts` (neu)

```ts
import type { DemoTemplate, DemoTemplateContext } from "../types"

/**
 * "Industriedienstleister 150" — nah an Pro-Di, primärer Zielmarkt.
 *
 * Seed profile:
 * - 150 Mitarbeiter über 4 Departments (Produktion, Lager, Verwaltung, Außendienst)
 * - 12 Tariffs mit 3 Schichtmodellen (FS/SS/NS)
 * - Day/Week-Plans für die kommenden 30 Tage
 * - 20 Holidays (Bayern 2026, 2027)
 * - 8 Booking Types (Arbeit, Pause, Dienstgang, Krank, Urlaub, Sonderurlaub, Überstundenabbau, Homeoffice)
 * - Default Account chart (~30 accounts)
 * - 5 Kunden-Demo-Rechnungen (Billing-Modul)
 * - 30 Warehouse-Artikel mit Initial-Bestand
 *
 * Alle Writes laufen innerhalb der übergebenen Transaction (ctx.tx).
 * Keine externen Seitenwirkungen, kein I/O außerhalb der DB.
 */
async function apply(ctx: DemoTemplateContext): Promise<void> {
  const { tx, tenantId, adminUserId } = ctx

  // 1. Departments (4 rows)
  const departments = await seedDepartments(tx, tenantId)

  // 2. Tariffs (12 rows, 3 shift models)
  const tariffs = await seedTariffs(tx, tenantId)

  // 3. Holidays (20 rows, Bayern 2026/2027)
  await seedHolidays(tx, tenantId)

  // 4. Booking types (8 rows)
  const bookingTypes = await seedBookingTypes(tx, tenantId)

  // 5. Absence types (6 rows: Urlaub, Krank, Sonderurlaub, Fortbildung, Mutterschutz, Unbezahlt)
  await seedAbsenceTypes(tx, tenantId)

  // 6. Default accounts (~30 rows)
  await seedAccounts(tx, tenantId)

  // 7. 150 employees split across departments
  const employees = await seedEmployees(tx, tenantId, departments, tariffs)

  // 8. Week/Day plans for next 30 days for each employee
  await seedPlansForEmployees(tx, tenantId, employees, new Date(), 30)

  // 9. Demo billing documents (5 invoices, Billing module)
  await seedBillingDocuments(tx, tenantId, adminUserId)

  // 10. Demo warehouse articles (30 items)
  await seedWarehouseArticles(tx, tenantId)
}

// Helper seed functions live in the same file to keep the template self-contained.
// Each helper uses tx.<model>.createMany where possible to minimize roundtrips.
// Detailed implementation of seedDepartments/...

export const industriedienstleister150: DemoTemplate = {
  key: "industriedienstleister_150",
  label: "Industriedienstleister (150 MA)",
  description: "150 Mitarbeiter, 4 Abteilungen, Schichtmodell FS/SS/NS, Demo-Rechnungen, Warehouse-Bestand. Nah an Pro-Di-Profil.",
  apply,
}
```

**Note on helper implementation:** Die `seedDepartments`, `seedTariffs`, etc. Helper-Funktionen sind im ersten Commit mit minimalem aber realistischem Fake-Daten-Set implementiert. Kriterium: das Template muss so viele Daten liefern, dass jede Demo-Dashboard-Seite *nicht leer* aussieht, aber nicht so viele, dass die Seed-Dauer > 30s ist. Richtwerte: `createMany` für Batch-Inserts, `faker-js` für Namen/Adressen, deterministischer Seed (`faker.seed(42)`) damit zwei Demo-Tenants nicht exakt identisch aber reproduzierbar sind.

#### 4. Add `@faker-js/faker` dependency
**File**: `package.json`
**Changes**: Add `"@faker-js/faker": "^9.x"` to `dependencies` (nicht devDeps — Templates laufen in Production via Router-Request).

```bash
pnpm add @faker-js/faker
```

### Success Criteria

#### Automated Verification
- [ ] Type check passes: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Unit test `src/lib/demo/__tests__/registry.test.ts` runs green:
  ```ts
  import { getDemoTemplate, listDemoTemplates, DEFAULT_DEMO_TEMPLATE } from "../registry"
  test("DEFAULT_DEMO_TEMPLATE is registered", () => {
    expect(getDemoTemplate(DEFAULT_DEMO_TEMPLATE)).toBeDefined()
  })
  test("listDemoTemplates returns at least one entry", () => {
    expect(listDemoTemplates().length).toBeGreaterThan(0)
  })
  test("unknown key throws", () => {
    expect(() => getDemoTemplate("nonexistent")).toThrow()
  })
  ```
- [ ] Integration test `src/lib/demo/__tests__/industriedienstleister_150.integration.test.ts` seeds a throwaway tenant in a rollback-transaction and asserts counts:
  ```ts
  // Transaction rolls back at end — no persistent effect.
  await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({ data: { name: "test", slug: `demo-${Date.now()}`, /* required fields */ } })
    await industriedienstleister150.apply({ tx, tenantId: t.id, adminUserId: seedAdminUserId })
    expect(await tx.employee.count({ where: { tenantId: t.id } })).toBe(150)
    expect(await tx.department.count({ where: { tenantId: t.id } })).toBe(4)
    expect(await tx.bookingType.count({ where: { tenantId: t.id } })).toBe(8)
    throw new Error("rollback") // intentional rollback
  }).catch(() => {})
  ```
- [ ] Template-apply unter Last: integrations test wall-clock < 30s on dev machine

#### Manual Verification
- [ ] Nach Ausführung ist in Prisma-Studio ein voll-befüllter Tenant sichtbar mit 150 Employees, 4 Departments, realistischen Namen
- [ ] `faker.seed(42)` produziert zwei identische Runs (Determinismus-Check)

**Implementation Note**: Nach dieser Phase pausieren für manuelle Bestätigung.

---

## Phase 3: Demo Tenant Service + Router

### Overview
Der Kern-Orchestrator. Eine `create`-Transaction kettet: Tenant-Insert → Modul-Aktivierung (4 Module) → Admin-User-Anlage via Phase-0-Flow → Template-Apply → Audit-Log. Plus `list`, `extend`, `convert`, `expireNow`, `delete` Procedures.

### Changes Required

#### 0. Demo Admin UserGroup — seed via migration
**File**: `supabase/migrations/20260410000001_seed_demo_admin_group.sql` (neu)

Die bestehende `UserGroup`-Tabelle erlaubt `tenantId = NULL` für system-weite Gruppen (`prisma/schema.prisma:1111-1135`). Wir legen eine system-weite "Demo Admin"-Group einmalig per Migration an, die jeder Demo-Admin-User beim Create als `userGroupId` referenziert. Dadurch:
- Alle Demo-Admins haben volle Permissions in ihrem Tenant (via `isAdmin = true`)
- Kein Per-Tenant-Group-Bootstrapping nötig
- `users-service.create`-Flow bleibt unverändert (akzeptiert `userGroupId` als Parameter)

```sql
-- Demo-Tenant-System: System-wide user group assigned to every demo admin user.
-- See thoughts/shared/plans/2026-04-09-demo-tenant-system.md

INSERT INTO public.user_groups (
  id, tenant_id, name, description, permissions, is_admin, is_system, is_active, created_at, updated_at
) VALUES (
  'dd000000-0000-0000-0000-000000000001'::uuid,  -- stable id for lookups
  NULL,                                            -- system-wide
  'Demo Admin',
  'System group for admin users of demo tenants (plan 2026-04-09). Full tenant-level permissions via is_admin bypass. Do not assign to non-demo users.',
  '[]'::jsonb,                                     -- empty explicit permissions — is_admin bypass grants everything
  true,                                            -- is_admin
  true,                                            -- is_system — cannot be deleted by UI
  true,                                            -- is_active
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
```

Helper in `demo-tenant-repository.ts`:
```ts
const DEMO_ADMIN_GROUP_ID = "dd000000-0000-0000-0000-000000000001"

export async function findSystemDemoAdminGroup(tx: Tx) {
  const group = await tx.userGroup.findUnique({ where: { id: DEMO_ADMIN_GROUP_ID } })
  if (!group) {
    throw new Error(
      "System 'Demo Admin' user group not found — migration 20260410000001_seed_demo_admin_group.sql has not been applied",
    )
  }
  return group
}
```

#### 1. Demo Tenant Repository
**File**: `src/lib/services/demo-tenant-repository.ts` (neu)

```ts
import type { PrismaClient, Prisma } from "@/generated/prisma/client"

type Tx = Prisma.TransactionClient | PrismaClient

export async function createDemoTenant(
  tx: Tx,
  data: {
    name: string
    slug: string
    addressStreet: string
    addressZip: string
    addressCity: string
    addressCountry: string
    notes: string | null
    demoExpiresAt: Date
    demoTemplate: string
    demoCreatedById: string
    demoNotes: string | null
  }
) {
  return tx.tenant.create({
    data: {
      ...data,
      isActive: true,
      isDemo: true,
    },
  })
}

export async function findActiveDemos(prisma: PrismaClient) {
  return prisma.tenant.findMany({
    where: { isDemo: true, isActive: true },
    orderBy: { demoExpiresAt: "asc" },
    include: {
      demoCreatedBy: { select: { id: true, email: true, displayName: true } },
    },
  })
}

export async function findExpiredActiveDemos(prisma: PrismaClient, cutoff: Date) {
  return prisma.tenant.findMany({
    where: {
      isDemo: true,
      isActive: true,
      demoExpiresAt: { lt: cutoff },
    },
    select: { id: true, name: true, demoExpiresAt: true },
  })
}

export async function extendDemoExpiration(
  prisma: PrismaClient,
  tenantId: string,
  newExpiresAt: Date
) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: { demoExpiresAt: newExpiresAt },
  })
}

export async function markDemoExpired(prisma: PrismaClient, tenantId: string) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: false },
  })
}

/** Convert: keep data — strip demo flags only. */
export async function convertDemoKeepData(prisma: PrismaClient, tenantId: string) {
  return prisma.tenant.update({
    where: { id: tenantId },
    data: {
      isDemo: false,
      demoExpiresAt: null,
      demoTemplate: null,
      demoCreatedById: null,
      demoNotes: null,
    },
  })
}
```

#### 2. Demo Tenant Service
**File**: `src/lib/services/demo-tenant-service.ts` (neu)

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { createAdminClient } from "@/lib/supabase/admin"
import { getDemoTemplate, DEFAULT_DEMO_TEMPLATE } from "@/lib/demo/registry"
import * as repo from "./demo-tenant-repository"
import * as auditLog from "./audit-logs-service"
import type { AuditContext } from "./audit-logs-service"
import { create as createUser } from "./users-service" // Phase 0 — returns { user, inviteLink }

const DEMO_DEFAULT_DURATION_DAYS = 14
const DEMO_MODULES = ["core", "crm", "billing", "warehouse"] as const

export class DemoTenantValidationError extends Error {
  constructor(message: string) { super(message); this.name = "DemoTenantValidationError" }
}
export class DemoTenantNotFoundError extends Error {
  constructor() { super("Demo tenant not found"); this.name = "DemoTenantNotFoundError" }
}
export class DemoTenantForbiddenError extends Error {
  constructor(message: string) { super(message); this.name = "DemoTenantForbiddenError" }
}

export interface CreateDemoInput {
  tenantName: string
  tenantSlug: string
  addressStreet: string
  addressZip: string
  addressCity: string
  addressCountry: string
  adminEmail: string
  adminDisplayName: string
  demoTemplate?: string
  demoDurationDays?: number
  notes?: string | null
}

export interface CreateDemoResult {
  tenantId: string
  adminUserId: string
  inviteLink: string
  demoExpiresAt: Date
  demoTemplate: string
}

/**
 * Orchestrates the full demo-tenant creation flow atomically.
 *
 * Phases inside one prisma.$transaction:
 *   1. Insert tenant row with is_demo=true, demo_expires_at=now+14d
 *   2. Enable all 4 demo modules (core/crm/billing/warehouse)
 *   3. Create admin user via Phase 0 Supabase-Auth flow (returns inviteLink)
 *   4. Apply selected demo template
 *   5. Audit-log `demo_create`
 *
 * On any failure, the outer transaction rolls back the Prisma writes.
 * Supabase Auth side effects (step 3) are compensated via try/catch +
 * `auth.admin.deleteUser(createdAuthUserId)` in the catch block.
 */
export async function createDemo(
  prisma: PrismaClient,
  creatingUserId: string,
  input: CreateDemoInput,
  audit: AuditContext
): Promise<CreateDemoResult> {
  const templateKey = input.demoTemplate ?? DEFAULT_DEMO_TEMPLATE
  const template = getDemoTemplate(templateKey) // throws if unknown

  const durationDays = input.demoDurationDays ?? DEMO_DEFAULT_DURATION_DAYS
  if (durationDays < 1 || durationDays > 90) {
    throw new DemoTenantValidationError("demoDurationDays must be 1..90")
  }

  const demoExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)

  // Track Supabase Auth user id for rollback
  let createdAuthUserId: string | null = null

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Insert tenant
      const tenant = await repo.createDemoTenant(tx, {
        name: input.tenantName.trim(),
        slug: input.tenantSlug.trim().toLowerCase(),
        addressStreet: input.addressStreet.trim(),
        addressZip: input.addressZip.trim(),
        addressCity: input.addressCity.trim(),
        addressCountry: input.addressCountry.trim(),
        notes: null,
        demoExpiresAt,
        demoTemplate: templateKey,
        demoCreatedById: creatingUserId,
        demoNotes: input.notes?.trim() ?? null,
      })

      // 2. Enable demo modules (4 rows)
      for (const mod of DEMO_MODULES) {
        await tx.tenantModule.upsert({
          where: { tenantId_module: { tenantId: tenant.id, module: mod } },
          create: { tenantId: tenant.id, module: mod, enabledById: creatingUserId },
          update: {},
        })
      }

      // 3. Resolve the system-wide "Demo Admin" group. Seeded once by a migration
      //    (see Phase 3 → "Demo Admin UserGroup seed") and referenced by id here.
      //    A helper findSystemDemoAdminGroup(tx) returns it or throws if not seeded.
      const demoAdminGroup = await repo.findSystemDemoAdminGroup(tx)

      // 4. Create admin user via Phase 0 flow — this calls supabase.auth.admin.createUser
      //    internally, which is an external side effect. We capture the id for rollback.
      //    NOTE: createUser's signature was widened in Phase 0 to accept
      //    Prisma.TransactionClient in addition to PrismaClient, so no cast is needed.
      const { user: adminUser, inviteLink } = await createUser(
        tx,
        tenant.id,
        {
          email: input.adminEmail.trim().toLowerCase(),
          displayName: input.adminDisplayName.trim(),
          userGroupId: demoAdminGroup.id,
          isActive: true,
          isLocked: false,
        },
        audit
      )
      createdAuthUserId = adminUser.id

      // 5. Apply template
      await template.apply({
        tx,
        tenantId: tenant.id,
        adminUserId: adminUser.id,
      })

      return {
        tenant,
        adminUserId: adminUser.id,
        inviteLink,
      }
    }, {
      timeout: 60_000, // 60s — template apply may take up to 30s
    })

    // 6. Audit log — AFTER the transaction, matching existing pattern in
    //    tenants.ts:344. On audit failure we log and move on; the demo
    //    itself is already committed.
    await auditLog.log(prisma, {
      tenantId: result.tenant.id,
      userId: creatingUserId,
      action: "demo_create",
      entityType: "tenant",
      entityId: result.tenant.id,
      entityName: result.tenant.name,
      changes: null,
      metadata: {
        demoTemplate: templateKey,
        demoExpiresAt: demoExpiresAt.toISOString(),
        durationDays,
        adminUserId: result.adminUserId,
        adminEmail: input.adminEmail,
      },
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    }).catch((err) => console.error("[AuditLog] demo_create failed:", err))

    return {
      tenantId: result.tenant.id,
      adminUserId: result.adminUserId,
      inviteLink: result.inviteLink,
      demoExpiresAt,
      demoTemplate: templateKey,
    }
  } catch (err) {
    // Rollback Supabase Auth side effect if prisma tx failed after auth user creation
    if (createdAuthUserId) {
      try {
        const admin = createAdminClient()
        await admin.auth.admin.deleteUser(createdAuthUserId)
      } catch (rollbackErr) {
        console.error("[demo-tenant] Failed to rollback Supabase Auth user:", rollbackErr)
      }
    }
    throw err
  }
}

export async function listActiveDemos(prisma: PrismaClient) {
  const demos = await repo.findActiveDemos(prisma)
  const now = Date.now()
  return demos.map((d) => ({
    ...d,
    daysRemaining: d.demoExpiresAt
      ? Math.ceil((d.demoExpiresAt.getTime() - now) / (24 * 60 * 60 * 1000))
      : 0,
  }))
}

/**
 * Extend a demo's expiration window.
 *
 * **Intentional behavior — reactivation of already-expired demos:**
 * If the demo has already been expired by the cron (isActive=false, user has been
 * redirected to /demo-expired), calling extend sets isActive=true again. The user's
 * next page-load will find demo_expires_at in the future, the gate-check will no
 * longer redirect, and they can resume working. This is deliberate: sales wants the
 * option to "rescue" a demo after a last-minute deal conversation. Without this,
 * an admin would have to manually flip isActive in the DB after an extend.
 *
 * The reactivation is logged as part of the demo_extend audit entry (changes.isActive).
 */
export async function extendDemo(
  prisma: PrismaClient,
  tenantId: string,
  additionalDays: 7 | 14,
  audit: AuditContext
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  // Extension base: if still-valid, extend from current expiry; if already
  // expired, extend from "now" so you always get at least `additionalDays` of runway.
  const base = existing.demoExpiresAt && existing.demoExpiresAt > new Date()
    ? existing.demoExpiresAt
    : new Date()
  const newExpiresAt = new Date(base.getTime() + additionalDays * 24 * 60 * 60 * 1000)

  // Reactivate if extending past-expiry — see JSDoc above.
  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      demoExpiresAt: newExpiresAt,
      isActive: true,
    },
  })

  await auditLog.log(prisma, {
    tenantId: tenantId,
    userId: audit.userId,
    action: "demo_extend",
    entityType: "tenant",
    entityId: tenantId,
    entityName: existing.name,
    changes: {
      demoExpiresAt: { old: existing.demoExpiresAt, new: newExpiresAt },
      isActive: existing.isActive !== true ? { old: existing.isActive, new: true } : undefined,
    },
    metadata: { additionalDays },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch((err) => console.error("[AuditLog] demo_extend failed:", err))

  return updated
}

export async function convertDemo(
  prisma: PrismaClient,
  tenantId: string,
  input: { discardData: boolean },
  audit: AuditContext
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  await prisma.$transaction(async (tx) => {
    if (input.discardData) {
      // Wipe only content tables — keep users, user_groups, user_tenants so the
      // prospect's admin account and their permissions survive the conversion.
      // See wipeTenantData docs below for the exact table categorization.
      await wipeTenantData(tx, tenantId, { keepAuth: true })
    }

    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        isDemo: false,
        demoExpiresAt: null,
        demoTemplate: null,
        demoCreatedById: null,
        demoNotes: null,
      },
    })
  }, { timeout: 60_000 })

  await auditLog.log(prisma, {
    tenantId: tenantId,
    userId: audit.userId,
    action: "demo_convert",
    entityType: "tenant",
    entityId: tenantId,
    entityName: existing.name,
    changes: {
      isDemo: { old: true, new: false },
    },
    metadata: {
      discardData: input.discardData,
      originalTemplate: existing.demoTemplate,
    },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch((err) => console.error("[AuditLog] demo_convert failed:", err))

  // Notify Tolga (internal convert-notification webhook/email)
  // Implemented as a fire-and-forget call to a new helper:
  await notifyConvertRequest(existing, audit.userId).catch((err) =>
    console.error("[demo-tenant] convert notification failed:", err)
  )

  return { ok: true }
}

export async function expireDemoNow(
  prisma: PrismaClient,
  tenantId: string,
  audit: AuditContext
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: false, demoExpiresAt: new Date() },
  })

  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "demo_manual_expire",
    entityType: "tenant",
    entityId: tenantId,
    entityName: existing.name,
    changes: { isActive: { old: true, new: false } },
    metadata: null,
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch((err) => console.error("[AuditLog] demo_manual_expire failed:", err))

  return { ok: true }
}

export async function deleteDemo(
  prisma: PrismaClient,
  tenantId: string,
  audit: AuditContext
) {
  const existing = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!existing || !existing.isDemo) throw new DemoTenantNotFoundError()
  if (existing.isActive !== false) {
    throw new DemoTenantForbiddenError("Cannot delete an active demo — expire first")
  }

  // Audit BEFORE delete — audit_logs.tenant_id is a FK to tenants; logging after the
  // delete would either fail or leave a dangling row. The audit entry describes intent.
  await auditLog.log(prisma, {
    tenantId,
    userId: audit.userId,
    action: "demo_delete",
    entityType: "tenant",
    entityId: tenantId,
    entityName: existing.name,
    changes: null,
    metadata: {
      originalTemplate: existing.demoTemplate,
      createdAt: existing.createdAt,
      demoExpiredAt: existing.demoExpiresAt,
    },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch((err) => console.error("[AuditLog] demo_delete failed:", err))

  // Hard delete: wipe all tenant content, then auth join, then the tenant row itself.
  // keepAuth: false = include users + user_groups + user_tenants in the wipe.
  await prisma.$transaction(async (tx) => {
    await wipeTenantData(tx, tenantId, { keepAuth: false })
    await tx.tenant.delete({ where: { id: tenantId } })
  }, { timeout: 120_000 })

  return { ok: true }
}

/**
 * Deletes all tenant-scoped content in FK-safe order.
 *
 * Two modes:
 *   - keepAuth: true  → Convert flow. Wipes "content" only. Preserves users,
 *                        user_groups, user_tenants so the prospect's admin account
 *                        survives and they can keep logging in after conversion.
 *   - keepAuth: false → Delete flow. Wipes everything including auth join rows.
 *                        Caller is responsible for the final tenant.delete().
 *
 * The delete order is grouped into 4 levels, deleted in order L1 → L2 → L3 → L4.
 * Within a level, order does not matter because rows at the same level do not
 * reference each other. Auth tables (L4) are skipped entirely when keepAuth=true.
 *
 * IMPORTANT: This helper assumes the caller already acquired a transaction handle
 * with a generous timeout (≥60s). Cascading through ~80 tables with deleteMany is
 * expected to take several seconds on a fully-seeded 150-employee demo.
 */
async function wipeTenantData(
  tx: Prisma.TransactionClient,
  tenantId: string,
  opts: { keepAuth: boolean },
): Promise<void> {
  const where = { tenantId }

  // ----------------------------------------------------------------------
  // L1 — Leaf tables: rows here are only referenced from outside the tenant
  //      scope or not at all. Safe to delete first.
  // ----------------------------------------------------------------------
  await tx.booking.deleteMany({ where })
  await tx.dailyValue.deleteMany({ where })
  await tx.dailyAccountValue.deleteMany({ where })
  await tx.absenceDay.deleteMany({ where })
  await tx.orderBooking.deleteMany({ where })
  await tx.employeeDayPlan.deleteMany({ where })
  await tx.shiftAssignment.deleteMany({ where })
  await tx.employeeCappingException.deleteMany({ where })
  await tx.employeeAccessAssignment.deleteMany({ where })
  await tx.vacationBalance.deleteMany({ where })
  await tx.employeeTariffAssignment.deleteMany({ where })
  await tx.correctionMessage.deleteMany({ where })
  await tx.correction.deleteMany({ where })
  await tx.scheduleExecution.deleteMany({ where })
  await tx.notification.deleteMany({ where })
  await tx.notificationPreference.deleteMany({ where })
  await tx.employeeMessage.deleteMany({ where })
  await tx.macroExecution.deleteMany({ where })
  await tx.macroAssignment.deleteMany({ where })
  await tx.rawTerminalBooking.deleteMany({ where })
  await tx.importBatch.deleteMany({ where })
  await tx.tripRecord.deleteMany({ where })
  await tx.vehicleRoute.deleteMany({ where })
  await tx.payrollExport.deleteMany({ where })
  await tx.report.deleteMany({ where })
  await tx.monthlyValue.deleteMany({ where })
  await tx.cronCheckpoint.deleteMany({ where })
  await tx.orderAssignment.deleteMany({ where })
  await tx.employeeCard.deleteMany({ where })

  // ----------------------------------------------------------------------
  // L2 — Entities referenced by L1 (employees, orders, shifts, plans, macros)
  // ----------------------------------------------------------------------
  await tx.employee.deleteMany({ where })
  await tx.order.deleteMany({ where })
  await tx.shift.deleteMany({ where })
  await tx.dayPlan.deleteMany({ where })
  await tx.weekPlan.deleteMany({ where })
  await tx.macro.deleteMany({ where })
  await tx.vehicle.deleteMany({ where })
  await tx.schedule.deleteMany({ where })
  await tx.absenceType.deleteMany({ where })
  await tx.bookingType.deleteMany({ where })
  await tx.bookingReason.deleteMany({ where })

  // ----------------------------------------------------------------------
  // L3 — Master data, references, config
  // ----------------------------------------------------------------------
  await tx.department.deleteMany({ where })
  await tx.team.deleteMany({ where })
  await tx.employmentType.deleteMany({ where })
  await tx.tariff.deleteMany({ where })
  await tx.activity.deleteMany({ where })
  await tx.activityGroup.deleteMany({ where })
  await tx.account.deleteMany({ where })
  await tx.accountGroup.deleteMany({ where })
  await tx.costCenter.deleteMany({ where })
  await tx.location.deleteMany({ where })
  await tx.holiday.deleteMany({ where })
  await tx.workflowGroup.deleteMany({ where })
  await tx.employeeGroup.deleteMany({ where })
  await tx.calculationRule.deleteMany({ where })
  await tx.crmAddress.deleteMany({ where })
  await tx.contactType.deleteMany({ where })
  await tx.contactKind.deleteMany({ where })
  await tx.travelAllowanceRuleSet.deleteMany({ where })
  await tx.localTravelRule.deleteMany({ where })
  await tx.extendedTravelRule.deleteMany({ where })
  await tx.vacationSpecialCalculation.deleteMany({ where })
  await tx.vacationCalculationGroup.deleteMany({ where })
  await tx.vacationCappingRule.deleteMany({ where })
  await tx.vacationCappingRuleGroup.deleteMany({ where })
  await tx.bookingTypeGroup.deleteMany({ where })
  await tx.absenceTypeGroup.deleteMany({ where })
  await tx.numberSequence.deleteMany({ where })
  await tx.accessZone.deleteMany({ where })
  await tx.accessProfile.deleteMany({ where })
  await tx.exportInterface.deleteMany({ where })
  await tx.monthlyEvaluationTemplate.deleteMany({ where })
  await tx.tenantModule.deleteMany({ where })
  await tx.systemSetting.deleteMany({ where })

  // Billing / Warehouse / Inbound Invoices — module-specific tables
  // (full list to be verified against prisma schema during implementation)
  // e.g. await tx.billingDocument.deleteMany({ where })
  //      await tx.warehouseArticle.deleteMany({ where })
  //      await tx.inboundInvoice.deleteMany({ where })

  // ----------------------------------------------------------------------
  // L4 — Auth (only when keepAuth=false)
  // ----------------------------------------------------------------------
  if (!opts.keepAuth) {
    // Delete tenant-scoped users first, then the join, then user_groups.
    // Note: user_tenants has a composite PK on (userId, tenantId), so deleting
    // the join does not cascade-delete the user itself — we explicitly remove
    // users whose tenantId matches (per users.tenantId column) and whose
    // user_tenants rows reference only this tenant (to avoid breaking shared users).
    //
    // For delete flow: this is a demo tenant, the admin user was created exclusively
    // for this demo (never shared across tenants), so removing is safe. Still, guard
    // with `where: { tenantId, userTenants: { every: { tenantId } } }` to be safe.
    await tx.userTenant.deleteMany({ where: { tenantId } })
    await tx.user.deleteMany({
      where: {
        tenantId,
        // Only delete users that had no other tenant memberships
        userTenants: { none: {} },
      },
    })
    await tx.userGroup.deleteMany({ where })

    // Finally, audit logs for this tenant (tenant_id FK — must go before tenant.delete)
    await tx.auditLog.deleteMany({ where })
  }
}

async function notifyConvertRequest(
  tenant: { id: string; name: string; demoTemplate: string | null },
  triggeringUserId: string,
): Promise<void> {
  // Writes a row into email_send_log. The cron /api/cron/email-retry picks it up.
  // ENV: DEMO_CONVERT_NOTIFICATION_EMAIL (fallback: a hardcoded sales@terp.dev)
  const recipient =
    process.env.DEMO_CONVERT_NOTIFICATION_EMAIL ?? "sales@terp.dev"
  // Implementation detail: use the existing email-service writeLog helper
  // (src/lib/services/email-send-log-service.ts if present). Full import path
  // to be confirmed during implementation.
}
```

**Note on `wipeTenantData`:** Vollständig unten in diesem Abschnitt implementiert (4 Level, FK-safe order). Der `keepAuth: boolean` Parameter unterscheidet Convert (`true` — preserve users + user_groups + user_tenants) von Delete (`false` — full wipe). Modul-spezifische Tabellen (Billing, Warehouse, Inbound Invoices) sind als TODO markiert — ihre Liste wird während der Implementierung gegen das Prisma-Schema verifiziert und ergänzt. Die Implementierung wird per Integration-Test mit einem frisch-geseedeten 150-Employee-Demo validiert (post-wipe row counts = 0 für alle Content-Tabellen).

**Note on `notifyConvertRequest`:** Verwendet die bestehende Email-Infrastruktur — schreibt einen Row in `email_send_log` mit `recipient = process.env.DEMO_CONVERT_NOTIFICATION_EMAIL` (fallback `sales@terp.dev`), der Cron `email-retry` versendet. Kein neuer Mail-Stack nötig.

#### 3. Demo Tenant Router
**File**: `src/trpc/routers/demo-tenants.ts` (neu)

```ts
import { z } from "zod"
import { createTRPCRouter, protectedProcedure } from "@/trpc/init"
import { requirePermission } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import { handleServiceError } from "@/trpc/errors"
import * as demoService from "@/lib/services/demo-tenant-service"
import { listDemoTemplates, DEFAULT_DEMO_TEMPLATE } from "@/lib/demo/registry"

const TENANTS_MANAGE = permissionIdByKey("tenants.manage")!

const createDemoInputSchema = z.object({
  tenantName: z.string().min(1).max(255),
  tenantSlug: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/),
  addressStreet: z.string().min(1),
  addressZip: z.string().min(1),
  addressCity: z.string().min(1),
  addressCountry: z.string().min(1),
  adminEmail: z.string().email(),
  adminDisplayName: z.string().min(1),
  demoTemplate: z.string().optional().default(DEFAULT_DEMO_TEMPLATE),
  demoDurationDays: z.number().int().min(1).max(90).optional(),
  notes: z.string().nullish(),
})

export const demoTenantsRouter = createTRPCRouter({
  templates: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .query(() => listDemoTemplates()),

  list: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .query(async ({ ctx }) => {
      try {
        return await demoService.listActiveDemos(ctx.prisma)
      } catch (err) { handleServiceError(err) }
    }),

  create: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(createDemoInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.createDemo(
          ctx.prisma,
          ctx.user!.id,
          input,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) { handleServiceError(err) }
    }),

  extend: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ tenantId: z.string().uuid(), additionalDays: z.union([z.literal(7), z.literal(14)]) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.extendDemo(
          ctx.prisma, input.tenantId, input.additionalDays,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) { handleServiceError(err) }
    }),

  convert: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ tenantId: z.string().uuid(), discardData: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.convertDemo(
          ctx.prisma, input.tenantId, { discardData: input.discardData },
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) { handleServiceError(err) }
    }),

  expireNow: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.expireDemoNow(
          ctx.prisma, input.tenantId,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) { handleServiceError(err) }
    }),

  delete: protectedProcedure
    .use(requirePermission(TENANTS_MANAGE))
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.deleteDemo(
          ctx.prisma, input.tenantId,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) { handleServiceError(err) }
    }),

  /**
   * Called by the /demo-expired page CTA.
   *
   * Deliberately NOT gated by `tenants.manage` — the demo admin user does not
   * have that permission, they only have access to their own demo tenant via
   * `user_tenants`. Authorization rules:
   *   - ctx.user must have a user_tenants row for input.tenantId
   *   - target tenant must be is_demo=true AND expired (demo_expires_at < now())
   *
   * Effect: writes an audit entry `demo_convert_requested` and fires
   * notifyConvertRequest (same helper as the admin convert flow).
   */
  requestConvertFromExpired: protectedProcedure
    .input(z.object({ tenantId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await demoService.requestConvertFromExpired(
          ctx.prisma,
          ctx.user!.id,
          input.tenantId,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) { handleServiceError(err) }
    }),
})
```

And the matching service function in `demo-tenant-service.ts`:

```ts
export async function requestConvertFromExpired(
  prisma: PrismaClient,
  requestingUserId: string,
  tenantId: string,
  audit: AuditContext,
): Promise<{ ok: true }> {
  // 1. Verify membership
  const membership = await prisma.userTenant.findUnique({
    where: { userId_tenantId: { userId: requestingUserId, tenantId } },
  })
  if (!membership) {
    throw new DemoTenantForbiddenError("No access to this tenant")
  }

  // 2. Verify tenant is a demo AND expired
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant || !tenant.isDemo) {
    throw new DemoTenantNotFoundError()
  }
  if (!tenant.demoExpiresAt || tenant.demoExpiresAt > new Date()) {
    throw new DemoTenantForbiddenError("Demo is not expired")
  }

  // 3. Fire-and-forget notification
  await notifyConvertRequest(
    { id: tenant.id, name: tenant.name, demoTemplate: tenant.demoTemplate },
    requestingUserId,
  ).catch((err) => console.error("[demo-tenant] convert-request notification failed:", err))

  // 4. Audit
  await auditLog.log(prisma, {
    tenantId,
    userId: requestingUserId,
    action: "demo_convert_requested",
    entityType: "tenant",
    entityId: tenantId,
    entityName: tenant.name,
    changes: null,
    metadata: { requestedBy: requestingUserId, expiredAt: tenant.demoExpiresAt },
    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,
  }).catch((err) => console.error("[AuditLog] demo_convert_requested failed:", err))

  return { ok: true }
}
```

#### 4. Mount in root router
**File**: `src/trpc/routers/_app.ts`
**Changes**: Add `demoTenants: demoTenantsRouter` to the merged router.

#### 5. Tenants output schema needs demo fields
**File**: `src/trpc/routers/tenants.ts`
**Changes**: Extend `tenantOutputSchema` (line 33-50) with `isDemo`, `demoExpiresAt`, `demoTemplate`, `demoCreatedById`, `demoNotes` fields (all nullable). Extend the mapper in `list`, `getById`, `create`, `update` to project these fields. Reason: Frontend `TenantProvider` reads `tenants.list` and needs `isDemo` + `demoExpiresAt` for the gate check in Phase 5.

### Success Criteria

#### Automated Verification
- [ ] Type check passes: `pnpm typecheck`
- [ ] Lint passes: `pnpm lint`
- [ ] Unit tests for service error paths:
  - `DemoTenantValidationError` on `demoDurationDays = 0`
  - `DemoTenantNotFoundError` on `extend` against non-existent tenant
  - `DemoTenantForbiddenError` on `delete` against active demo
  - `DemoTenantForbiddenError` on `requestConvertFromExpired` when user lacks `user_tenants` membership
  - `DemoTenantForbiddenError` on `requestConvertFromExpired` when demo is still within window
- [ ] Integration test `src/lib/services/__tests__/demo-tenant-service.integration.test.ts`:
  - Creates a demo end-to-end, asserts: tenant row has `is_demo=true`, `demo_expires_at ≈ now+14d`, 4 `tenant_modules` rows exist, 1 `user_tenants` row for the admin with the Demo Admin group, 150 employees from the template, 1 `audit_logs` entry with `action='demo_create'`
  - `extend` with `additionalDays=7` bumps expiration by 7 days
  - `extend` on an already-expired demo reactivates it: `isActive` back to `true`, `demo_expires_at` in the future, audit entry records the reactivation in its `changes` field
  - `convert` with `discardData=true` empties content tables (employees, bookings, orders, warehouse articles) BUT preserves the admin user, user_tenants row, and user_groups — verified by logging in as the admin after convert
  - `convert` with `discardData=false` keeps all 150 employees + sets `is_demo=false`
  - `expireNow` sets `isActive=false` + `demoExpiresAt ≈ now`
  - `delete` against active demo throws; against expired demo removes the tenant; `audit_logs` entry with `action='demo_delete'` exists (logged before the delete)
  - `requestConvertFromExpired` succeeds for the demo admin after expiry; writes `email_send_log` row; creates `demo_convert_requested` audit entry
- [ ] Transaction rollback test: force template-apply to throw, assert tenant/modules/user are all rolled back AND Supabase Auth user was deleted via the catch-block compensation
- [ ] **`tenantOutputSchema` extension regression check**: the existing `tenants.list`, `tenants.getById`, `tenants.create`, `tenants.update` procedures return the 5 new demo fields (`isDemo`, `demoExpiresAt`, `demoTemplate`, `demoCreatedById`, `demoNotes`) without breaking existing consumers. Verify by running the full existing tenants test suite (`pnpm vitest run src/trpc/routers/__tests__/tenants.test.ts`) and the `TenantProvider` hook tests unchanged.
- [ ] **Demo Admin Group seed verification**: `findSystemDemoAdminGroup` returns the seeded row with id `dd000000-0000-0000-0000-000000000001` after `pnpm db:reset`. Test that it throws with a descriptive error if the migration was not applied.

#### Manual Verification
- [ ] `pnpm dev` + tRPC panel: manually invoke `demoTenants.create`, verify inviteLink is returned, log in as the new admin user via the invite link
- [ ] Create → extend → convert (keep data) flow works end-to-end in Prisma Studio
- [ ] Audit-log entries visible in `audit_logs` table with all expected actions

**Implementation Note**: Nach dieser Phase pausieren für manuelle Bestätigung.

---

## Phase 4: Expiration Cron

### Overview
Neuer daily cron `/api/cron/expire-demo-tenants` um 01:00 UTC. Findet alle `is_demo=true AND isActive=true AND demo_expires_at < now()`, flipped `isActive=false`, schreibt Audit-Log `demo_expired`. Folgt exakt dem existierenden Cron-Pattern inkl. `CronCheckpoint`.

### Changes Required

#### 1. Cron Route
**File**: `src/app/api/cron/expire-demo-tenants/route.ts` (neu)

```ts
/**
 * Vercel Cron Route: /api/cron/expire-demo-tenants
 *
 * Runs daily at 01:00 UTC (configured in vercel.json).
 * Finds active demo tenants with demo_expires_at < now() and flips
 * isActive=false. Writes a demo_expired audit-log entry per tenant.
 *
 * @see thoughts/shared/plans/2026-04-09-demo-tenant-system.md
 */

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import * as repo from "@/lib/services/demo-tenant-repository"
import * as auditLog from "@/lib/services/audit-logs-service"

export const runtime = "nodejs"
export const maxDuration = 300

const TASK_TYPE = "expire_demo_tenants"

interface DemoExpireResult {
  tenantId: string
  name: string
  expiredAt: Date
  success: boolean
  error?: string
}

export async function executeExpireDemoTenants(now: Date = new Date()) {
  const runKey = now.toISOString().slice(0, 10) // YYYY-MM-DD
  console.log(`[expire-demo-tenants] Starting: runKey=${runKey}`)

  // Find expired active demos
  const expired = await repo.findExpiredActiveDemos(prisma, now)
  console.log(`[expire-demo-tenants] Found ${expired.length} expired demos`)

  // Load already-completed checkpoints for this runKey (idempotency for re-runs)
  const completed = await prisma.cronCheckpoint.findMany({
    where: { cronName: TASK_TYPE, runKey },
    select: { tenantId: true },
  })
  const completedIds = new Set(completed.map((c) => c.tenantId).filter((x): x is string => x !== null))

  const results: DemoExpireResult[] = []
  let processed = 0
  let failed = 0

  for (const demo of expired) {
    if (completedIds.has(demo.id)) {
      console.log(`[expire-demo-tenants] Tenant ${demo.id}: checkpoint hit, skip`)
      continue
    }

    const start = Date.now()
    try {
      await repo.markDemoExpired(prisma, demo.id)

      // System-level audit (no authenticated user — use the system NULL userId pattern)
      await auditLog.log(prisma, {
        tenantId: demo.id,
        userId: null as unknown as string, // audit-logs-service allows null
        action: "demo_expired",
        entityType: "tenant",
        entityId: demo.id,
        entityName: demo.name,
        changes: { isActive: { old: true, new: false } },
        metadata: { trigger: "cron", demoExpiresAt: demo.demoExpiresAt },
        ipAddress: null,
        userAgent: "cron/expire-demo-tenants",
      }).catch((err) => console.error("[AuditLog] demo_expired failed:", err))

      await prisma.cronCheckpoint.upsert({
        where: { cronName_runKey_tenantId: { cronName: TASK_TYPE, runKey, tenantId: demo.id } },
        create: {
          cronName: TASK_TYPE,
          runKey,
          tenantId: demo.id,
          status: "completed",
          durationMs: Date.now() - start,
        },
        update: { status: "completed", durationMs: Date.now() - start },
      })

      results.push({ tenantId: demo.id, name: demo.name, expiredAt: demo.demoExpiresAt!, success: true })
      processed++
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      console.error(`[expire-demo-tenants] Tenant ${demo.id} failed: ${errorMessage}`)
      failed++
      results.push({
        tenantId: demo.id,
        name: demo.name,
        expiredAt: demo.demoExpiresAt!,
        success: false,
        error: errorMessage,
      })
    }
  }

  return { ok: failed === 0, runKey, processed, failed, results }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("[expire-demo-tenants] CRON_SECRET is not configured")
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await executeExpireDemoTenants()
    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    console.error(`[expire-demo-tenants] Fatal: ${errorMessage}`)
    return NextResponse.json({ error: "Internal server error", message: errorMessage }, { status: 500 })
  }
}
```

#### 2. Register in vercel.json
**File**: `vercel.json`
**Changes**: Add one entry to the `crons` array:

```json
{
  "path": "/api/cron/expire-demo-tenants",
  "schedule": "0 1 * * *"
}
```

#### 3. Audit logs service accepts `userId: null`
**File**: `src/lib/services/audit-logs-service.ts`
**Changes**: Check if `AuditLogCreateInput.userId` allows `null` for system actions. If not, relax the type (audit log DB column is already nullable per `audit-logs-repository.ts`).

### Success Criteria

#### Automated Verification
- [ ] Type check + lint pass
- [ ] Integration test `src/app/api/cron/expire-demo-tenants/__tests__/integration.test.ts`:
  - Seed: create 3 tenants — (a) active demo expiring in 1 day, (b) active demo expired 1 day ago, (c) normal non-demo tenant that is expired via an unrelated flag
  - Call `executeExpireDemoTenants(now)`
  - Assert: tenant (b) is now `isActive=false`; (a) and (c) are unchanged
  - Assert: one `audit_logs` row with `action='demo_expired'` for tenant (b)
  - Assert: one `cron_checkpoints` row with `cronName='expire_demo_tenants'`
  - Re-run: asserts idempotency (no duplicate audit log, checkpoint hit)
- [ ] Auth header test: GET without `Bearer CRON_SECRET` returns 401

#### Manual Verification
- [ ] Deploy to staging, trigger cron manually via `curl -H "Authorization: Bearer $CRON_SECRET" https://staging.terp.dev/api/cron/expire-demo-tenants`
- [ ] Vercel dashboard shows the new cron is scheduled
- [ ] A test demo created with `demoDurationDays=0` (or seeded with past `demo_expires_at`) gets flipped after the next run

**Implementation Note**: Nach dieser Phase pausieren für manuelle Bestätigung.

---

## Phase 5: Frontend — Admin Panel + Demo-Expired Page

### Overview
Zwei UI-Bereiche: (1) ein neues Admin-Panel in `/admin/tenants` für Demo-Management, (2) eine `/demo-expired`-Seite + Gate-Check im Dashboard-Layout, der eingeloggte User eines abgelaufenen Demo-Tenants dorthin umleitet.

### Changes Required

#### 1. New hooks
**File**: `src/hooks/use-demo-tenants.ts` (neu)

```ts
"use client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "@/trpc"

export function useDemoTenants(opts?: { enabled?: boolean }) {
  const trpc = useTRPC()
  return useQuery(trpc.demoTenants.list.queryOptions(undefined, opts))
}

export function useDemoTemplates(opts?: { enabled?: boolean }) {
  const trpc = useTRPC()
  return useQuery(trpc.demoTenants.templates.queryOptions(undefined, opts))
}

export function useCreateDemoTenant() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.demoTenants.create.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [["demoTenants", "list"]] })
      qc.invalidateQueries({ queryKey: [["tenants", "list"]] })
    },
  })
}

// Similar hooks for: useExtendDemo, useConvertDemo, useExpireDemoNow, useDeleteDemo
```

#### 2. New components
**Files** (all new):
- `src/components/tenants/demo/demo-tenants-panel.tsx` — Card with "Aktive Demos" header + table + "Neue Demo anlegen" button
- `src/components/tenants/demo/demo-tenants-table.tsx` — Columns: Name (mono), Template, Creator, Created, Days Remaining (badge color by threshold: green >7, yellow 3-7, red <3, dark-red expired), Actions dropdown (Extend +7, Extend +14, Convert, Expire Now, Delete when expired)
- `src/components/tenants/demo/demo-create-sheet.tsx` — Right-side sheet form: Tenant identity (name, slug auto-generated from name), address, admin email/name, template select (from `useDemoTemplates`), duration input (default 14, 1-90), notes textarea. On submit: invoke `useCreateDemoTenant`, show returned `inviteLink` in a copyable toast/dialog after success
- `src/components/tenants/demo/demo-convert-dialog.tsx` — Confirm dialog with RadioGroup: (a) "Demo-Daten verwerfen (Standard)" — description: "Nur Tenant-Hülle + Admin-User bleiben" — DEFAULT selected, (b) "Demo-Daten behalten" — description: "Nahtloser Übergang, Kunde nutzt bestehende Daten weiter"
- `src/components/tenants/demo/demo-extend-dropdown.tsx` — Dropdown submenu "+7 Tage", "+14 Tage"

#### 3. Mount panel in admin page
**File**: `src/app/[locale]/(dashboard)/admin/tenants/page.tsx`
**Changes**: Render `<DemoTenantsPanel />` above the existing filters/table (between line 118 `</div>` and line 121 `{/* Filters bar */}`). Panel is self-contained — owns its own create-sheet, dialog state, etc.

#### 4. Demo-expired page
**File**: `src/app/[locale]/demo-expired/page.tsx` (neu — outside `(dashboard)` group, accessible to logged-in users without tenant context guard)

```tsx
"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useTenant } from "@/providers/tenant-provider"
import { useMutation } from "@tanstack/react-query"
import { useTRPC } from "@/trpc"

export default function DemoExpiredPage() {
  const { tenant } = useTenant()
  const trpc = useTRPC()
  const requestConvert = useMutation({
    // New procedure: demoTenants.requestConvertFromExpired
    // — notifies Tolga without requiring tenants.manage permission,
    //   gated only to the demo's admin user
    ...trpc.demoTenants.requestConvertFromExpired.mutationOptions(),
  })

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Demo abgelaufen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>Ihre 14-tägige Testphase von Terp ist abgelaufen.</p>
          <p>Wenn Sie Terp produktiv nutzen möchten, kontaktieren Sie uns:</p>
          <ul className="list-disc pl-5 text-sm">
            <li>E-Mail: sales@terp.dev</li>
            <li>Telefon: +49 xxx xxx xxx</li>
          </ul>
          <Button
            className="w-full"
            onClick={() => tenant && requestConvert.mutate({ tenantId: tenant.id })}
            disabled={requestConvert.isPending || requestConvert.isSuccess}
          >
            {requestConvert.isSuccess ? "Anfrage gesendet" : "In echten Kunden konvertieren"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Ihre Daten bleiben erhalten, bis Sie entscheiden.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
```

#### 5. Gate-check in dashboard layout
**File**: `src/app/[locale]/(dashboard)/layout.tsx` (assumed exists per directory listing)
**Changes**: After the tenant is loaded in `TenantProvider`, add a redirect:

```tsx
"use client"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { useTenant } from "@/providers/tenant-provider"

// Inside the DashboardLayout component, after TenantProvider is mounted:
function DemoExpirationGate({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant()
  const router = useRouter()

  useEffect(() => {
    if (!tenant) return
    const isDemoTenant = (tenant as { isDemo?: boolean }).isDemo === true
    const demoExpiresAt = (tenant as { demoExpiresAt?: string | Date | null }).demoExpiresAt
    if (!isDemoTenant || !demoExpiresAt) return

    const expiresMs = typeof demoExpiresAt === "string"
      ? Date.parse(demoExpiresAt)
      : demoExpiresAt.getTime()

    if (expiresMs < Date.now()) {
      router.replace("/demo-expired")
    }
  }, [tenant, router])

  return <>{children}</>
}
```

Mount `<DemoExpirationGate>` around the dashboard children. Session stays intact (no logout), only navigation is redirected.

**CRITICAL** (from user feedback): The gate check is `isDemo && demo_expires_at < now()` — NOT `isDemo && !isActive`. A regular soft-deleted tenant via `tenants.deactivate` would otherwise be misclassified as "demo expired".

#### 6. Optional: demo banner on active demos
**File**: `src/components/layout/demo-banner.tsx` (neu, mounted inside dashboard layout)

A yellow sticky banner at the top of the dashboard showing "Demo-Modus: noch X Tage verbleibend" when `tenant.isDemo && daysRemaining > 0`. Does NOT redirect — informational only.

#### 7. i18n strings for the whole feature
**Files**: `messages/de.json`, `messages/en.json`

Committed together with the components that use them, NOT deferred to Phase 6. New keys:
- `adminTenants.demo.panelTitle`, `.newDemoButton`, `.table.*`, `.daysRemaining.*`
- `adminTenants.demo.createSheet.*` (form labels, validation messages, success toast)
- `adminTenants.demo.convertDialog.*` (radio labels, descriptions, confirmation text)
- `adminTenants.demo.extendDropdown.*`, `.expireNowConfirm`, `.deleteConfirm`
- `adminTenants.demo.banner.*` (days-remaining text)
- `demoExpired.title`, `.body`, `.contact`, `.convertCta`, `.convertCtaSuccess`

Phase 6 will only add the **handbook entry**, not i18n strings — those ship with Phase 5.

### Success Criteria

#### Automated Verification
- [ ] Type check + lint pass
- [ ] Component unit tests with mock tRPC:
  - `demo-create-sheet` submits with valid input and shows invite link on success
  - `demo-convert-dialog` defaults to "discardData=true"
  - `demo-tenants-table` renders days-remaining badges with correct color thresholds

#### Manual Verification
- [ ] End-to-end in browser:
  1. Log in as admin
  2. Navigate to `/admin/tenants`
  3. See the new "Aktive Demos" panel above the regular tenant table
  4. Click "Neue Demo anlegen", fill form with template `industriedienstleister_150`, submit
  5. Copy invite link from success toast
  6. In an incognito window, open invite link → set password → log into the demo tenant
  7. Verify dashboard shows demo banner "noch 14 Tage verbleibend"
  8. Back as admin: open the demo row, click "Extend +7" → banner updates to 21 days
  9. Click "Expire Now" → banner disappears from admin; in incognito tab, reload → gets redirected to `/demo-expired`
  10. On `/demo-expired`, click "In echten Kunden konvertieren" → see success state; verify Tolga gets notification row in `email_send_log`
- [ ] Verify that a regular (non-demo) deactivated tenant does NOT redirect to `/demo-expired` (gate-check correctness)
- [ ] Convert flow: (a) with `discardData=true` — after convert, employees list in the converted tenant is empty, admin user + tenant remain; (b) with `discardData=false` — all 150 employees remain
- [ ] E2E Playwright spec `src/e2e-browser/demo-tenants.spec.ts` added covering steps 1-6 and 9

**Implementation Note**: Nach dieser Phase pausieren für manuelle Bestätigung.

---

## Phase 6: Tests + Documentation

### Overview
Konsolidierte Test-Suite und Handbuch-Eintrag. (i18n-Strings sind bereits in Phase 5 committet worden.)

### Changes Required

#### 1. Handbook entry
**File**: `TERP_HANDBUCH_V2.md` (assumed exists per project convention)
**Changes**: New section "Demo-Tenant-System" with:
- Kurzbeschreibung + Use Case (Sales-Enablement)
- Praxisbeispiel (Step-by-step clickable, per Handbook-Konvention): "Neuen Demo-Tenant für Interessent anlegen"
- Praxisbeispiel: "Demo-Tenant in echten Kunden konvertieren"
- Praxisbeispiel: "Abgelaufene Demo löschen"
- Admin-Permissions-Tabelle: `tenants.manage` + was sie erlaubt
- Cron-Übersicht: `expire-demo-tenants` in der Cron-Liste ergänzen

#### 2. Full test matrix
All tests listed in Phases 1-5 are actually implemented in this phase if deferred earlier. Final test matrix:

- Unit: `demo-tenant-service.ts` error paths (5 tests)
- Unit: `registry.ts` (3 tests)
- Unit: Frontend components (3-5 tests)
- Integration: `demo-tenant-service.integration.test.ts` full lifecycle (create/extend/convert/expire/delete)
- Integration: `industriedienstleister_150.integration.test.ts` template counts + determinism
- Integration: `expire-demo-tenants/integration.test.ts` cron behavior
- Integration: Transaction rollback on template failure
- E2E: `demo-tenants.spec.ts` browser flow

### Success Criteria

#### Automated Verification
- [ ] All tests pass: `pnpm test`
- [ ] E2E passes: `pnpm exec playwright test src/e2e-browser/demo-tenants.spec.ts`
- [ ] i18n lint (if configured) passes — no missing keys in `de.json`/`en.json`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification
- [ ] Handbook Praxisbeispiele sind Step-by-step ausführbar (Feedback `handbook_verification`)
- [ ] Beide Sprachen (de/en) in UI korrekt
- [ ] Production-Smoke-Test auf Staging: vollständiger Create→Convert Flow mit echtem Supabase Auth

---

## Testing Strategy

### Unit Tests
- Service error paths (validation, not-found, forbidden)
- Template registry lookup
- Frontend component rendering with mock data
- Days-remaining badge thresholds

### Integration Tests
- Service lifecycle: create → list → extend → convert → (convert with discardData variant) → expireNow → delete
- Template application: counts, determinism (same seed = same output)
- Cron execution: finds expired, marks inactive, skips already-completed via checkpoint
- Transaction rollback: if template throws, tenant + modules + user are all gone AND Supabase Auth user is deleted
- Gate-check correctness: normal deactivated tenant is NOT misclassified as demo-expired

### Manual Testing Steps
1. Create demo → receive invite link → log in as demo admin → verify template data is visible
2. Create demo → manually `UPDATE tenants SET demo_expires_at = now() - interval '1 day' WHERE id = '...'` → trigger cron → verify `isActive=false` → log in as demo admin → verify redirect to `/demo-expired`
3. Extend expired demo → verify `isActive` flipped back to true
4. Convert with `discardData=true` → verify employees wiped, tenant + admin user remain
5. Convert with `discardData=false` → verify all 150 employees remain
6. Delete only works on expired demos (test active-demo delete is forbidden)
7. Request-convert from `/demo-expired` page creates `email_send_log` row for Tolga
8. Regular (non-demo) deactivated tenant does not redirect to `/demo-expired`

## Performance Considerations

- **Template apply duration**: Target < 30s for `industriedienstleister_150`. Use `createMany` over `create` loops wherever possible. If tests show > 30s, raise transaction timeout to 90s in the service.
- **Cron iteration**: Daily, 1 row per expired demo. Even with 100 expired demos, expected wall-clock < 10s. No tenant-iterating-all-tenants pattern here (only the expired subset).
- **`idx_tenant_demo_expiration` partial index**: Keeps the index small because most tenants are not demos.
- **Prisma transaction timeout**: Set to 60s for create (template apply can take 20-30s), 120s for delete (wipe cascade).

## Migration Notes

- **Existing tenants**: Default `is_demo=false`, no data changes. Zero migration risk.
- **Existing crons**: Unchanged. The new cron is additive.
- **`tenants.list` output schema**: Extended with 5 new nullable fields. Frontend consumers already ignore unknown fields — no break. TypeScript types regenerate from `tenants.ts` router output.
- **Rollback plan**: If the feature needs to be disabled, (a) remove the cron entry from `vercel.json`, (b) hide the demo panel in admin UI behind a feature flag, (c) set all demos to `isDemo=false, demoExpiresAt=null` via one-off SQL — data is preserved.

## References

- Research document: `thoughts/shared/research/2026-04-09-demo-tenant-system.md`
- Tenant router: `src/trpc/routers/tenants.ts:243-377` (create pattern to mirror)
- Cron pattern: `src/app/api/cron/execute-macros/route.ts`
- Login Gap context: `src/lib/services/users-service.ts:60-135`
- Existing tenant admin UI: `src/app/[locale]/(dashboard)/admin/tenants/page.tsx`
- Audit log pattern: `src/lib/services/users-service.ts:122-132`
- Supabase admin client: `src/lib/supabase/admin.ts:12-23`
- Tenant model: `prisma/schema.prisma:94-188`
- Permission catalog: `src/lib/auth/permission-catalog.ts` (using existing `tenants.manage`)
- CronCheckpoint: `prisma/schema.prisma` (search for `model CronCheckpoint`)
- Dead code note: `src/lib/services/tenant-service.ts` (NOT touched by this plan)
