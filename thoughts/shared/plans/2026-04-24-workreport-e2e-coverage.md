# WorkReport E2E Coverage Expansion — Implementation Plan

## Overview

Die manuelle Akzeptanz-Session für WorkReport (Arbeitsschein) M-1 hat 10 Verifikations-Schritte durchlaufen und dabei zwei echte Bugs aufgedeckt (Duplicate-Employee-Assignment, Sign-Button-Disabled-Bug) plus einen Cache-Invalidation-Bug. Die bestehende Playwright-E2E-Spec (`src/e2e-browser/84-workreport-arbeitsschein.spec.ts`) deckt aktuell nur 3 Flows ab — Happy-Path, Sign-ohne-Pflicht-Checks, und VOID-Flow. Alle anderen Szenarien, inklusive Permissions, sind ungetestet. Dieser Plan erweitert die E2E-Coverage, so dass künftige Regressions der manuellen Verifikations-Schritte automatisch aufgefangen werden.

## Current State Analysis

**Bestehende E2E-Infrastruktur:**
- Playwright-Config auf Port 3001, Locale `de-DE`, Viewport 1280×1080, `workers: 1`, sequenziell
- Global-Setup (`src/e2e-browser/global-setup.ts`) per psql: cleanup by E2E-prefix + seed shared fixtures
- 4 Storage-States via `auth.setup.ts`: admin, user, approver, hr (alle über `login*`-Helper in `helpers/auth.ts`)
- Spec-Numbering: 85–98 sind frei; nächste logische Slots sind 85 und 86
- Multi-User-Pattern etabliert (siehe `61-payroll-security-kldb.spec.ts:72-133`, `80-overtime-requests.spec.ts:32-43`): `browser.newContext({ storageState })` pro Sub-Test

**Aktuelle WorkReport-Coverage (`84-workreport-arbeitsschein.spec.ts`):**

| Szenario | Status |
|---|---|
| Create DRAFT (required fields) | 🟡 teilweise — optional fields (travelMinutes, serviceObject) fehlen |
| Add Assignment | 🟡 teilweise — keine Duplicate-Rejection, kein Remove |
| Attachments | ❌ nicht |
| Sign Pre-Check (0 Assignments) | ✅ komplett |
| Sign Pre-Check (empty description) | ❌ nicht |
| Sign Post-State (Header-Buttons, Signatur-Card, Audit-Entry) | 🟡 teilweise — nur Status-Badge + PDF-Button-enable |
| Void Validation (min 10 chars) | 🟡 teilweise — whitespace-only-trim nicht getestet |
| Void Post-State (Banner, Stornieren weg, Audit) | 🟡 teilweise — nur Banner |
| STORNIERT-PDF-Overlay | ❌ nicht |
| Listenansicht (Tabs, URL, Row-Click, Empty-States) | ❌ nicht |
| Cross-Surface (Order-Tab, ServiceObject-Tab) | ❌ nicht |
| Cache-Invalidation (Void auf Detail → Liste ohne Reload) | ❌ nicht |
| Permissions (4 Perms × UI-Gating) | ❌ nicht |

**Permission-Infrastruktur:**
- 4 Work-Report-Permissions: `view`, `manage`, `sign`, `void` (siehe `src/lib/auth/permission-catalog.ts:269-272`)
- Seed-User haben **keine** Work-Report-Permissions (außer admin via `is_admin: true`)
- Permission-Gating im UI:
  - Sidebar-Entry: `work_reports.view` (`sidebar-nav-config.ts:436`)
  - List-Page: `useHasPermission(["work_reports.view", "work_reports.manage"])` → redirect on fail
  - Detail-Page: 4 separate `useHasPermission`-Calls für `canView` / `canManage` / `canSign` / `canVoid`
- `useCurrentPermissions` hat 5-Min-staleTime → Permission-Änderungen innerhalb einer Session werden nicht live reflektiert. Permission-Tests brauchen dedizierte User mit Login-Kontext.

### Key Discoveries:
- Seed-Pattern: User + Group + Employee-Link via `auth.users` + `public.users` + `public.user_groups` mit `ON CONFLICT DO NOTHING` (`supabase/seed.sql:51-225`)
- Permissions in Seed-Groups als **Key-Strings** (`"work_reports.view"`), nicht UUIDs (`permissions.ts:84-87` handled beide)
- E2E-Pool-Helper mit `pg` direkt, nicht Prisma (Prisma ist ESM-only, Playwright CJS) — siehe `work-report-fixtures.ts:8-26`
- Bestehender `createDraftWorkReport` in Fixtures nimmt `withAssignment` und `withDescription` Flags — für die neuen Tests brauchen wir einen zusätzlichen `createSignedWorkReport`-Helper
- Der manuelle Verifikations-Session-Fund „List-Cache-Invalidation bricht bei Void-from-Detail" (commit `d42dcc1d`) wurde gefixt via `refetchType: "all"` in `invalidateAllWorkReportLists` — die Regression-Test-Hypothese dafür ist konkret: voten aus Detail → zurück zu Liste → Status zeigt sofort „Storniert" ohne Reload

## Desired End State

Nach diesem Plan sind die 10 manuellen Verifikations-Schritte durch E2E-Tests abgedeckt, plus der Permission-Test den wir manuell übersprungen haben. Die Suite läuft idempotent via `pnpm playwright test src/e2e-browser/84` / `85` / `86` und im CI als Teil von `pnpm playwright test`.

**Verifiable Outcomes:**
- Alle drei Spec-Files (84, 85, 86) laufen grün durch: `pnpm playwright test src/e2e-browser/8{4,5,6}-workreport*`
- Die Seed-User für Permission-Tests sind in `supabase/seed.sql` persistiert und idempotent (auf `db:reset` reproduzierbar)
- `auth.setup.ts` produziert 6 Storage-States (admin, user, approver, hr, wr-viewer, wr-manager)
- Die Playwright-Tests enthalten Assertions für jedes der 13 Szenarien aus der Coverage-Tabelle oben

## What We're NOT Doing

- **PDF-Inhaltsparsing**: Das PDF-Download-Happy-Path wird nur auf „URL öffnet sich, Response ist 200" getestet, nicht auf Inhalt. PDF-Parsing würde eine zusätzliche Dependency (pdf-parse o.ä.) brauchen und ist für die Regression-Absicherung übertrieben — wir vertrauen auf die bestehenden Unit-Tests in `src/lib/pdf/__tests__/work-report-pdf.test.ts`
- **Dashboard-Widget**: Es gibt kein WorkReport-Widget auf dem Dashboard (anders als bei ServiceSchedule). Kommt in einem späteren Milestone, falls überhaupt gewünscht.
- **Runtime-Permission-Revocation**: Edge-Case — der 5-Min-staleTime auf `useCurrentPermissions` würde's sowieso maskieren. Permission-Änderungen mitten in einer Session sind ein Produkt-Design-Thema, nicht ein Test-Thema.
- **Stress-Tests mit >100 Work-Reports**: Die Pagination-Logik (fixed page size 50) ist trivial genug und durch die Existenz des `<Pagination>`-Components gedeckt; eine >50-Entries-Seed würde die Suite ausbremsen ohne viel Erkenntnis-Gewinn.
- **E2E-Tests gegen Staging**: Die Suite läuft nur gegen lokales Supabase (Port 54322). Staging-Smoke-Tests sind ein separates Ticket.

## Implementation Approach

Der Plan ist in 4 Phasen strukturiert, jede als eigenständiger Commit:
1. **Phase 1 — Test-User-Seed + Storage-States**: Grundlage für Phase 4. Auch ohne weitere Änderungen unabhängig mergable.
2. **Phase 2 — `84` erweitern**: Core-Lifecycle-Abdeckung komplettieren (Attachments, Post-Sign/Void-Assertions, Duplicate-Rejection).
3. **Phase 3 — `85` neu**: Listenansicht + Cross-Surface + Cache-Invalidation-Regression.
4. **Phase 4 — `86` neu**: UI-Permission-Gating mit den neuen Test-Usern.

Jede Phase hat Automated + Manual Verification Criteria. Nach Phase 1 **muss manuell bestätigt werden** dass `pnpm db:reset` plus `pnpm playwright test src/e2e-browser/auth.setup.ts` 6 gültige Storage-States produziert, bevor Phase 4 implementiert werden kann.

---

## Phase 1: Test-User-Seed + Storage-States

### Overview

Zwei neue Test-User mit präzisen Permission-Subsets werden in den Dev-Seed aufgenommen. Auth-Helper und `auth.setup.ts` werden erweitert, um Storage-States für beide zu erzeugen. Keine Änderungen an bestehenden Usern, um andere Specs nicht zu beeinflussen.

### Changes Required:

#### 1. Seed User Groups + Users

**File**: `supabase/seed.sql`

**Changes**: Zwei neue tenant-scoped User-Groups + zwei neue Auth+Public-Users anfügen. Idempotent via `ON CONFLICT`.

```sql
-- =================================================================
-- WorkReport E2E test users (plan 2026-04-24-workreport-e2e-coverage)
-- =================================================================

-- User-Groups
INSERT INTO public.user_groups (id, tenant_id, code, name, permissions, is_admin, is_active)
VALUES
  (
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'wr-viewer',
    'WR Viewer (E2E)',
    '["work_reports.view"]'::jsonb,
    false,
    true
  ),
  (
    '20000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    'wr-manager',
    'WR Manager (E2E)',
    '["work_reports.view", "work_reports.manage", "work_reports.sign"]'::jsonb,
    false,
    true
  )
ON CONFLICT (id) DO UPDATE SET
  permissions = EXCLUDED.permissions,
  name = EXCLUDED.name;

-- Auth-Users (identisches Pattern wie admin/user/approver/hr oben in seed.sql)
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_sso_user
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000005',
    'authenticated', 'authenticated',
    'wr-viewer@dev.local',
    crypt('dev-password-wr-viewer', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000000006',
    'authenticated', 'authenticated',
    'wr-manager@dev.local',
    crypt('dev-password-wr-manager', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(), now(), false
  )
ON CONFLICT (id) DO NOTHING;

-- Auth-Identities (erforderlich, damit supabase.auth.signInWithPassword klappt)
INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
VALUES
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000005',
    '{"sub":"00000000-0000-0000-0000-000000000005","email":"wr-viewer@dev.local"}'::jsonb,
    'email',
    'wr-viewer@dev.local',
    now(), now(), now()
  ),
  (
    gen_random_uuid(),
    '00000000-0000-0000-0000-000000000006',
    '{"sub":"00000000-0000-0000-0000-000000000006","email":"wr-manager@dev.local"}'::jsonb,
    'email',
    'wr-manager@dev.local',
    now(), now(), now()
  )
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Public-Users mit Group-Link
INSERT INTO public.users (id, user_group_id, tenant_id, email, display_name, is_active, created_at, updated_at)
VALUES
  (
    '00000000-0000-0000-0000-000000000005',
    '20000000-0000-0000-0000-000000000005',
    '10000000-0000-0000-0000-000000000001',
    'wr-viewer@dev.local',
    'WR Viewer (E2E)',
    true,
    now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    '20000000-0000-0000-0000-000000000006',
    '10000000-0000-0000-0000-000000000001',
    'wr-manager@dev.local',
    'WR Manager (E2E)',
    true,
    now(), now()
  )
ON CONFLICT (id) DO NOTHING;

-- User-Tenants (erforderlich für tenantProcedure-Middleware)
INSERT INTO public.user_tenants (user_id, tenant_id, role, is_active, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'member', true, now()),
  ('00000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', 'member', true, now())
ON CONFLICT (user_id, tenant_id) DO NOTHING;
```

**Implementation Note**: Die exakte Spalten-Reihenfolge + Default-Werte in `auth.users` / `auth.identities` / `public.users` **müssen aus dem bestehenden Block in `seed.sql` Zeile ~51–225 kopiert werden**, nicht raten. Der Implementer sollte die Block-Struktur für `admin@dev.local` und `user@dev.local` 1:1 als Vorlage nehmen und die Werte tauschen.

#### 2. Auth-Helper um 2 User erweitern

**File**: `src/e2e-browser/helpers/auth.ts`

**Changes**: Neue SEED-Einträge + Storage-Pfade + Login-Wrapper.

```ts
// Am Anfang der Datei ergänzen
export const WR_VIEWER_STORAGE = ".auth/wr-viewer.json"
export const WR_MANAGER_STORAGE = ".auth/wr-manager.json"

// In SEED ergänzen
export const SEED = {
  // ... bestehende Felder ...
  WR_VIEWER_EMAIL: "wr-viewer@dev.local",
  WR_VIEWER_PASSWORD: "dev-password-wr-viewer",
  WR_MANAGER_EMAIL: "wr-manager@dev.local",
  WR_MANAGER_PASSWORD: "dev-password-wr-manager",
} as const

// Am Ende der Datei ergänzen
export async function loginAsWrViewer(page: Page): Promise<void> {
  await login(page, SEED.WR_VIEWER_EMAIL, SEED.WR_VIEWER_PASSWORD)
}

export async function loginAsWrManager(page: Page): Promise<void> {
  await login(page, SEED.WR_MANAGER_EMAIL, SEED.WR_MANAGER_PASSWORD)
}
```

#### 3. Auth-Setup um 2 Setups erweitern

**File**: `src/e2e-browser/auth.setup.ts`

**Changes**: Zwei neue `setup(...)`-Calls am Ende der Datei.

```ts
import {
  // ... bestehende Imports ...
  WR_VIEWER_STORAGE,
  WR_MANAGER_STORAGE,
  loginAsWrViewer,
  loginAsWrManager,
} from "./helpers/auth"

// Am Ende der Datei:
setup("authenticate as wr-viewer", async ({ page }) => {
  await loginAsWrViewer(page)
  await persistTenant(page)
  await page.context().storageState({ path: WR_VIEWER_STORAGE })
})

setup("authenticate as wr-manager", async ({ page }) => {
  await loginAsWrManager(page)
  await persistTenant(page)
  await page.context().storageState({ path: WR_MANAGER_STORAGE })
})
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm db:reset` läuft ohne Fehler durch: `pnpm db:reset 2>&1 | tail -5`
- [x] Neue User existieren in DB: `PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -c "SELECT email FROM auth.users WHERE email LIKE 'wr-%@dev.local'"` liefert 2 Zeilen
- [x] Neue Groups existieren mit korrekten Permissions: `psql ... -c "SELECT code, permissions FROM public.user_groups WHERE code LIKE 'wr-%'"` zeigt `["work_reports.view"]` und `["work_reports.view", "work_reports.manage", "work_reports.sign"]`
- [x] Auth-Setup läuft grün: `pnpm playwright test src/e2e-browser/auth.setup.ts`
- [x] 6 Storage-State-Dateien entstanden: `ls .auth/` zeigt `admin.json`, `user.json`, `approver.json`, `hr.json`, `wr-viewer.json`, `wr-manager.json`
- [x] Typecheck sauber (keine neuen Errors): `pnpm typecheck`

#### Manual Verification:
- [ ] Mit `wr-viewer@dev.local` / `dev-password-wr-viewer` manuell auf `/login` einloggen → landet auf `/dashboard` ohne Fehler
- [ ] Gleicher Login für `wr-manager@dev.local`
- [ ] `/admin/work-reports` als `wr-viewer` lädt die Liste, zeigt aber **keinen** „+ Neu"-Button
- [ ] `/admin/work-reports` als `wr-manager` zeigt den Button

**Implementation Note**: Nach Phase 1 und bestätigten automatisierten + manuellen Criteria pausieren. Phase 2 und 3 können parallel zu Phase 4 starten, aber Phase 4 blockt ohne Phase 1.

---

## Phase 2: Core-Lifecycle-Coverage erweitern (`84-workreport-arbeitsschein.spec.ts`)

### Overview

Den bestehenden Spec um die fehlenden Core-Lifecycle-Scenarios ergänzen. Kein neuer Spec-File — alle Tests laufen im existierenden `describe.serial`-Block.

### Changes Required:

#### 1. Fixtures-Helper erweitern

**File**: `src/e2e-browser/helpers/work-report-fixtures.ts`

**Changes**: Neuen Helper `createSignedWorkReport` hinzufügen (für die VOID-Sub-Tests, die bisher inline `new Pool()` machen — verschlechterter Pattern). Auch einen `countAttachments`-Helper.

```ts
export async function createSignedWorkReport(params: {
  orderId: string
  signerName?: string
  signerRole?: string
}): Promise<{ id: string; code: string }> {
  const draft = await createDraftWorkReport({
    orderId: params.orderId,
    withAssignment: true,
    withDescription: true,
  })
  await pool().query(
    `UPDATE work_reports
     SET status = 'SIGNED',
         signed_at = NOW(),
         signer_name = $2,
         signer_role = $3,
         signer_ip_hash = 'e2e-test-hash',
         signature_path = 'e2e/test/signature.png'
     WHERE id = $1`,
    [draft.id, params.signerName ?? "E2E Signer", params.signerRole ?? "Tester"],
  )
  return draft
}
```

#### 2. Zusätzliche Tests im `84`-Spec

**File**: `src/e2e-browser/84-workreport-arbeitsschein.spec.ts`

**Changes**: Weitere `test(...)`-Blöcke an passenden Stellen hinzufügen. Tests folgen der bestehenden Struktur.

**Neue Tests (Kurzbeschreibung — der Implementer schreibt die vollständigen Assertions):**

```ts
// Nach dem bestehenden "Happy-Path"-Test:

test("Duplicate-Assignment-Test: gleicher Mitarbeiter wird abgelehnt", async ({ page }) => {
  // Given: DRAFT mit 1 Assignment (EMPLOYEE_ID Admin)
  // When: gleichen Mitarbeiter nochmal via UI zuweisen
  // Then: Error-Toast "Employee is already assigned" erscheint,
  //       Liste bleibt bei 1 Assignment
})

test("Remove-Assignment: Papierkorb entfernt Zeile", async ({ page }) => {
  // Given: DRAFT mit 1 Assignment
  // When: Papierkorb-Button + Confirm-Dialog
  // Then: Zeile verschwindet, Toast "Mitarbeiter entfernt"
})

test("Attachment: JPEG-Upload + Download-URL + Remove", async ({ page }) => {
  // Given: DRAFT, Tab "Fotos"
  // When: setInputFiles mit Test-JPEG (z.B. via fs.readFileSync)
  // Then: Zeile erscheint mit Dateiname, Größe, MIME-Type
  //       Download-Button öffnet signed URL (assert page.waitForResponse)
  // When: Papierkorb + Confirm
  // Then: Zeile weg
})

test("Attachment: Falscher MIME wird abgelehnt (Client)", async ({ page }) => {
  // Given: DRAFT, Tab "Fotos"
  // When: setInputFiles mit .txt-Datei
  // Then: Toast "Dateityp nicht erlaubt" — kein Upload erfolgt
})

test("Sign-Pre-Check: leere workDescription disabled Button", async ({ page }) => {
  // Given: DRAFT mit Assignment, aber ohne workDescription (via createDraftWorkReport({ withDescription: false }))
  // When: Sign-Dialog öffnen
  // Then: "Arbeitsbeschreibung fehlt" rot, Signieren-Button disabled
})

test("Post-Sign-Zustand: Header + Signatur-Card + Read-Only-Tabs", async ({ page }) => {
  // Given: Frischer DRAFT + Sign-Canvas-Flow (wie Happy-Path, aber danach assertions)
  // Then nach Sign:
  //   - Header: "Bearbeiten", "Löschen", "Signieren" nicht mehr sichtbar
  //   - Signatur-Card zeigt signer name/role + Signiert am
  //   - Mitarbeiter-Tab: keine "Mitarbeiter zuweisen"-Card mehr
  //   - Fotos-Tab: keine Upload-Card mehr
  //   - Audit-Tab: >= 1 Eintrag mit Aktion "signed"
})

test("Post-Void: STORNIERT-PDF-Download (nur URL-Response)", async ({ page }) => {
  // Given: createSignedWorkReport + UI-Void
  // When: PDF-Download-Button klicken
  // Then: neuer Tab öffnet sich, Response-Status 200, Content-Type application/pdf
  //       (PDF-Inhalt nicht geprüft — explizit out-of-scope)
})

test("Post-Void: Audit-Eintrag mit Aktion voided", async ({ page }) => {
  // Given: SIGNED → Void via UI
  // When: Tab "Audit"
  // Then: mindestens 1 Eintrag "voided" mit heutigem Datum
})
```

### Success Criteria:

#### Automated Verification:
- [x] `84`-Spec läuft grün komplett durch: `pnpm playwright test src/e2e-browser/84-workreport-arbeitsschein.spec.ts`
- [ ] Tests sind deterministisch (3× hintereinander grün ohne Flakes): `for i in 1 2 3; do pnpm playwright test src/e2e-browser/84-workreport-arbeitsschein.spec.ts || break; done`
- [x] Keine neuen Typecheck-Errors: `pnpm typecheck`

#### Manual Verification:
- [ ] `pnpm playwright test --headed src/e2e-browser/84-workreport-arbeitsschein.spec.ts` einmal im Browser anschauen — Tests sollten sichtbar die UI-Interaktionen durchlaufen
- [ ] Nach Abschluss: `resetWorkReports()` hat alle Test-Rows korrekt aufgeräumt (`psql ... -c "SELECT COUNT(*) FROM work_reports WHERE code LIKE 'AS-%'"` = 0)

---

## Phase 3: Listenansicht + Cross-Surface + Cache-Invalidation-Regression (`85-workreport-list-crosssurface.spec.ts`)

### Overview

Neuer Spec-File. Deckt Listenansicht (Filter, URL, Row-Click, Empty-States), Cross-Surface-Integration (Order-Tab, ServiceObject-Tab) und die Cache-Invalidation-Regression (aus commit `d42dcc1d`) ab.

### Changes Required:

#### 1. Neuer Spec-File

**File**: `src/e2e-browser/85-workreport-list-crosssurface.spec.ts`

**Changes**: Komplett neu. Struktur analog zu `84-`.

```ts
import { test, expect } from "@playwright/test"
import { navigateTo } from "./helpers/nav"
import {
  createDraftWorkReport,
  createSignedWorkReport,  // aus Phase 2
  disconnect,
  ensureSeedOrderForWorkReport,
  resetWorkReports,
} from "./helpers/work-report-fixtures"

test.describe.serial("UC-WR-02: Liste + Cross-Surface", () => {
  test.beforeAll(async () => {
    await resetWorkReports()
    await ensureSeedOrderForWorkReport()
  })
  test.afterAll(async () => {
    await resetWorkReports()
    await disconnect()
  })

  // ─── Liste ────────────────────────────────────────
  test("Liste zeigt 4 Status-Tabs und Total-Count", async ({ page }) => {
    // 1 DRAFT + 1 SIGNED + 1 VOID seed, navigate to /admin/work-reports
    // assert Tab-Count = 4 (Alle/Entwurf/Signiert/Storniert)
    // assert "3 Arbeitsscheine" Count
  })

  test("Status-Filter-Tabs setzen URL-Param", async ({ page }) => {
    // click Tab "Storniert" → URL contains ?status=VOID
    // click Tab "Alle" → URL does NOT contain status param
  })

  test("URL-Persistenz: Reload behält Filter", async ({ page }) => {
    // navigate to /admin/work-reports?status=SIGNED
    // page.reload()
    // assert Tab "Signiert" is active
    // assert Tabelle zeigt nur SIGNED-Rows
  })

  test("Invalid URL-Status fällt auf Alle zurück", async ({ page }) => {
    // navigate to /admin/work-reports?status=FOOBAR
    // assert Tab "Alle" is active
    // assert all rows visible
  })

  test("Row-Click navigiert zum Detail", async ({ page }) => {
    // click first row
    // assert URL matches /admin/work-reports/[uuid]
    // assert h1 with code is visible
  })

  test("Empty-State bei gefiltertem Tab ohne Matches", async ({ page }) => {
    // reset to 0 work reports, go to ?status=DRAFT
    // assert "In der gewählten Status-Ansicht sind keine Arbeitsscheine vorhanden."
    // assert "+ Neu"-Button in Empty-State NICHT sichtbar
  })

  test("Empty-State bei leerer Alle-Liste zeigt '+ Neu'-Button", async ({ page }) => {
    // reset to 0, go to /admin/work-reports
    // assert "Noch keine Arbeitsscheine" text
    // assert "Neuer Arbeitsschein"-Button visible
  })

  // ─── Cross-Surface ────────────────────────────────
  test("Order-Detail zeigt Arbeitsscheine-Tab mit zugehörigen Rows", async ({ page }) => {
    // 1 DRAFT at seed order + 1 DRAFT at another order (needs ensureSecondSeedOrder helper)
    // navigate to /admin/orders/<seed-order-id>, click Tab "Arbeitsscheine"
    // assert only the seed-order-WorkReport is listed
  })

  test("ServiceObject-Detail zeigt Arbeitsscheine-Tab", async ({ page }) => {
    // ensure 1 ServiceObject + 1 WorkReport linking to it
    // navigate to /serviceobjects/<so-id>, click Tab "Arbeitsscheine"
    // assert WorkReport is listed
  })

  // ─── Cache-Invalidation-Regression ────────────────
  test("Void auf Detail → Liste aktualisiert Status sofort ohne Reload", async ({ page }) => {
    // Given: 1 SIGNED WorkReport via createSignedWorkReport
    // Navigate to /admin/work-reports (Liste), check status-Badge "Signiert"
    // Click row → Detail page
    // Open Void-Dialog, fill valid reason, submit
    // page.goBack() OR navigate back via Link (NOT page.reload())
    // assert status-Badge in Liste ist "Storniert" — OHNE Reload
  })
})
```

**Zusätzlicher Fixture-Helper** in `work-report-fixtures.ts` für den Cross-Surface-Test:

```ts
export async function ensureSecondSeedOrder(): Promise<{ id: string; code: string }> {
  // SELECT-or-INSERT für code 'E2E-WR-AUFTRAG-2' analog zu ensureSeedOrderForWorkReport
}

export async function ensureSeedServiceObject(): Promise<{ id: string; number: string }> {
  // SELECT-or-INSERT für ServiceObject mit number 'E2E-WR-SO-1'
}

export async function createDraftWorkReportWithServiceObject(params: {
  orderId: string
  serviceObjectId: string
}): Promise<{ id: string; code: string }> {
  // Extended createDraftWorkReport mit service_object_id
}
```

### Success Criteria:

#### Automated Verification:
- [x] `85`-Spec läuft grün komplett durch: `pnpm playwright test src/e2e-browser/85-workreport-list-crosssurface.spec.ts`
- [ ] 3× hintereinander grün: keine Flakes
- [ ] Cache-Invalidation-Test würde OHNE den Fix aus commit `d42dcc1d` scheitern — die Implementierung kann das verifizieren indem sie testweise auf Commit `2f733adc` cherry-pickt und den Test laufen lässt (sollte rot sein) und dann auf `d42dcc1d` (sollte grün sein). Nicht in die Suite einchecken, nur zur Einmal-Verifikation.

#### Manual Verification:
- [ ] Spec einmal `--headed` durchlaufen lassen, visuelle Korrektheit der Browser-Klicks bestätigen
- [ ] Empty-State-Tests sehen korrekt gerendert aus (Icon + Text an den richtigen Stellen)

---

## Phase 4: Permission-UI-Gating (`86-workreport-permissions.spec.ts`)

### Overview

Neuer Spec-File, testet das UI-Gating für alle 4 WorkReport-Permissions mit den Storage-States aus Phase 1. Nutzt das Multi-User-Pattern (`browser.newContext({ storageState })`) bereits etabliert in `61-` und `80-`.

### Changes Required:

#### 1. Neuer Spec-File

**File**: `src/e2e-browser/86-workreport-permissions.spec.ts`

**Changes**: Komplett neu. Nutzt `browser`-Fixture statt `page`-Fixture, um pro Test einen Kontext mit anderem Storage-State zu öffnen.

```ts
import { test, expect } from "@playwright/test"
import {
  ADMIN_STORAGE,
  USER_STORAGE,
  WR_VIEWER_STORAGE,
  WR_MANAGER_STORAGE,
} from "./helpers/auth"
import {
  createDraftWorkReport,
  createSignedWorkReport,
  disconnect,
  ensureSeedOrderForWorkReport,
  resetWorkReports,
} from "./helpers/work-report-fixtures"

test.describe.serial("UC-WR-03: Permissions", () => {
  let orderId: string
  let draftId: string
  let signedId: string

  test.beforeAll(async () => {
    await resetWorkReports()
    const order = await ensureSeedOrderForWorkReport()
    orderId = order.id
    const draft = await createDraftWorkReport({ orderId })
    draftId = draft.id
    const signed = await createSignedWorkReport({ orderId })
    signedId = signed.id
  })
  test.afterAll(async () => {
    await resetWorkReports()
    await disconnect()
  })

  // ─── user@dev.local (keine work_reports-Permissions) ──
  test("User ohne Perms: Sidebar-Entry NICHT sichtbar", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: USER_STORAGE })
    const p = await ctx.newPage()
    await p.goto("/dashboard")
    await expect(
      p.locator('nav[aria-label="Main navigation"] a[href*="/admin/work-reports"]'),
    ).toHaveCount(0)
    await ctx.close()
  })

  test("User ohne Perms: Direkt-URL redirected auf /dashboard", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: USER_STORAGE })
    const p = await ctx.newPage()
    await p.goto("/admin/work-reports")
    await p.waitForURL(/dashboard/, { timeout: 10_000 })
    await ctx.close()
  })

  // ─── wr-viewer (nur view) ──
  test("Viewer: Sidebar-Entry sichtbar, kann Liste + Detail lesen", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: WR_VIEWER_STORAGE })
    const p = await ctx.newPage()
    await p.goto("/admin/work-reports")
    await expect(p.locator("h1:has-text('Arbeitsscheine')")).toBeVisible()
    // Row-Click möglich
    await p.locator("table tbody tr").first().click()
    await expect(p).toHaveURL(/work-reports\/[0-9a-f-]+/)
    await ctx.close()
  })

  test("Viewer: kein '+ Neu'-Button auf Liste", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: WR_VIEWER_STORAGE })
    const p = await ctx.newPage()
    await p.goto("/admin/work-reports")
    await expect(p.getByRole("button", { name: /\+\s*Neu/ })).toHaveCount(0)
    await ctx.close()
  })

  test("Viewer: keine Bearbeiten/Löschen/Signieren-Buttons auf DRAFT-Detail", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: WR_VIEWER_STORAGE })
    const p = await ctx.newPage()
    await p.goto(`/admin/work-reports/${draftId}`)
    await expect(p.getByRole("button", { name: /Bearbeiten/ })).toHaveCount(0)
    await expect(p.getByRole("button", { name: /Signieren/ })).toHaveCount(0)
    await expect(p.locator('[aria-label="Löschen"]')).toHaveCount(0)
    await ctx.close()
  })

  test("Viewer: keine 'Mitarbeiter zuweisen'- und 'Hochladen'-Cards", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: WR_VIEWER_STORAGE })
    const p = await ctx.newPage()
    await p.goto(`/admin/work-reports/${draftId}`)
    await p.getByRole("tab", { name: "Mitarbeiter" }).click()
    await expect(p.locator('text=Mitarbeiter zuweisen')).toHaveCount(0)
    await p.getByRole("tab", { name: "Fotos" }).click()
    await expect(p.getByRole("button", { name: /Hochladen/ })).toHaveCount(0)
    await ctx.close()
  })

  // ─── wr-manager (view + manage + sign, KEIN void) ──
  test("Manager: kann Neu + Bearbeiten + Signieren", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: WR_MANAGER_STORAGE })
    const p = await ctx.newPage()
    await p.goto("/admin/work-reports")
    await expect(p.getByRole("button", { name: /\+\s*Neu/ })).toBeVisible()
    // Detail auf DRAFT
    await p.goto(`/admin/work-reports/${draftId}`)
    await expect(p.getByRole("button", { name: /Bearbeiten/ })).toBeVisible()
    await expect(p.getByRole("button", { name: /Signieren/ })).toBeVisible()
    await ctx.close()
  })

  test("Manager: kein 'Stornieren'-Button auf SIGNED", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: WR_MANAGER_STORAGE })
    const p = await ctx.newPage()
    await p.goto(`/admin/work-reports/${signedId}`)
    await expect(p.getByRole("button", { name: /Stornieren/ })).toHaveCount(0)
    await ctx.close()
  })

  // ─── admin (all) ──
  test("Admin: 'Stornieren'-Button auf SIGNED sichtbar", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: ADMIN_STORAGE })
    const p = await ctx.newPage()
    await p.goto(`/admin/work-reports/${signedId}`)
    await expect(p.getByRole("button", { name: /Stornieren/ })).toBeVisible()
    await ctx.close()
  })
})
```

### Success Criteria:

#### Automated Verification:
- [x] `86`-Spec läuft grün komplett durch: `pnpm playwright test src/e2e-browser/86-workreport-permissions.spec.ts`
- [ ] 3× hintereinander grün ohne Flakes
- [x] Keine neuen Typecheck-Errors: `pnpm typecheck`

#### Manual Verification:
- [ ] Spec einmal `--headed` durchlaufen lassen — visuell bestätigen dass die Buttons wirklich ausgeblendet sind (nicht nur disabled) für die Viewer/Manager-Kontexte
- [ ] Bestätigen dass der Test nach Verschieben auf andere Staging-Env weiterhin funktioniert (Seed-User sind lokal-only, aber die Test-Logik ist environment-agnostisch — wenn auf Staging die gleichen User erzeugt werden, würden die Tests auch dort laufen)

---

## Testing Strategy

### Unit Tests (nicht Teil dieses Plans):
- Bestehen bereits in `src/lib/services/__tests__/work-report-*.unit.test.ts`
- Bestehen bereits in `src/lib/auth/__tests__/permission-catalog.test.ts`

### Integration Tests (nicht Teil dieses Plans):
- Bestehen bereits in `src/lib/services/__tests__/work-report-*.integration.test.ts` (inkl. der in commit `2f733adc` hinzugefügten 2 Duplicate-Tests)

### E2E Manual Testing Steps (zur Verifikation dieses Plans):
1. `pnpm db:reset` — Seed-User anlegen lassen
2. `pnpm playwright test src/e2e-browser/auth.setup.ts` — 6 Storage-States erzeugen
3. `pnpm playwright test src/e2e-browser/84-workreport-arbeitsschein.spec.ts` — Core-Lifecycle grün
4. `pnpm playwright test src/e2e-browser/85-workreport-list-crosssurface.spec.ts` — List + Cross-Surface grün
5. `pnpm playwright test src/e2e-browser/86-workreport-permissions.spec.ts` — Permissions grün
6. `pnpm playwright test src/e2e-browser/` — **komplette Suite** grün, keine Regressions in anderen Specs

## Performance Considerations

- Die gesamte Suite läuft mit `workers: 1` sequenziell. Jeder neue Spec-File verlängert die CI-Laufzeit. Geschätzte Dauer für Phase 2+3+4 zusammen: ~5–8 Min zusätzlich (bei aktueller Baseline von ~25 Min für die volle Suite).
- Die Auth-Setup-Phase hat 4 → 6 User-Logins, aber jeder Login dauert < 2 Sek, also +4 Sek pro Setup-Run.

## Migration Notes

- Keine DB-Migration. Alles lebt in `supabase/seed.sql` und ist nur via `db:reset` wirksam.
- Für Staging: falls Permission-Tests später mal auf Staging laufen sollen, müssten die 2 neuen User dort manuell via psql angelegt werden (gleiche SQL wie in Phase 1, aber gegen Staging-Connection-String). Nicht Teil dieses Plans — E2E-Tests bleiben local-only.

## References

- Original-Feature-Plan: `thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md`
- Bugs aus manueller Verifikation: commits `a6a25481` (Feature-Base), `2f733adc` (Duplicate-Assignment-Fix), `d42dcc1d` (List-Cache-Invalidation-Fix)
- Bestehender Spec-File (wird erweitert): `src/e2e-browser/84-workreport-arbeitsschein.spec.ts`
- Fixture-Helper-Referenz: `src/e2e-browser/helpers/work-report-fixtures.ts`
- Auth-Helper-Referenz: `src/e2e-browser/helpers/auth.ts`
- Multi-User-Pattern-Beispiele: `src/e2e-browser/61-payroll-security-kldb.spec.ts:72-133`, `src/e2e-browser/80-overtime-requests.spec.ts:32-43`
- Permission-Catalog: `src/lib/auth/permission-catalog.ts:269-272`
- Sidebar-Gating: `src/components/layout/sidebar/sidebar-nav-config.ts:436`
- Detail-Page-Gating: `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx:114-120`
