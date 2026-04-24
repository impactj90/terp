---
date: 2026-04-22
author: tolga
topic: WorkReport — Arbeitsschein mit Signatur und PDF (M-1)
tags: [plan, workreport, arbeitsschein, signature, pdf, storage, audit]
status: draft
research: thoughts/shared/research/2026-04-22-workreport-arbeitsschein-m1-codebase-analyse.md
---

# WorkReport — Arbeitsschein mit Signatur und PDF (M-1) — Implementation Plan

## Overview

Einführung einer neuen `WorkReport`-Entität (Arbeitsschein) mit 1:n-
Beziehung zu `Order`, optionalem FK auf `ServiceObject`, inkrementellen
Mitarbeiter-Zuweisungen, Foto-Anhängen, Canvas-basierter Kundensignatur
und `@react-pdf/renderer`-PDF. Status-Lifecycle `DRAFT → SIGNED → VOID`,
wobei SIGNED atomar und unveränderlich ist und die signierte PDF als
rechtliches Archiv persistiert wird.

M-1 liefert den vollständigen Desktop-Workflow: Schema, Backend-APIs,
Upload-Pipeline, PDF-Pipeline, Signatur-Capture im Browser-Canvas,
VOID-Flow und Browser-E2E-Abdeckung. Mobile-optimierte UI (M-2) und
Offline-Queue (M-3) sind ausdrücklich ausgelagert.

## Current State Analysis

Stand vor M-1 ist umfassend in
`thoughts/shared/research/2026-04-22-workreport-arbeitsschein-m1-codebase-analyse.md`
dokumentiert. Zusammenfassung der für den Plan relevantesten Befunde:

- **Kein `WorkReport`-ähnliches Modell existiert.** `Order` dient bis
  heute als alleiniger Vertragsbehälter; Mitarbeiter sind via
  `OrderAssignment` zugeordnet, Zeitbuchungen via `OrderBooking`.
  Abschluss läuft über generisches `Order.update({ status: "completed" })`.
- **`ServiceObject.serviceObjectId`** ist auf `Order` bereits verdrahtet
  (T-1, Nullable-FK, SetNull). Eine neue Entität kann auf beide FKs
  referenzieren.
- **Canvas-UI existiert nirgends** (`src/` enthält keine
  `<canvas>`-Nutzung, keine Signatur-Library in `package.json`).
  Neue Dependency (`react-signature-canvas`) und neue Komponente
  (`<SignaturePad>`) werden eingeführt.
- **DRAFT-Atomic-Guard** ist etabliertes Muster
  (`billing-document-service.ts:427-442`) — `updateMany` mit
  Status-Condition plus Re-Fetch zur Unterscheidung
  "not found" vs. "status changed".
- **3-Step-Upload** ist etabliertes Muster
  (`service-object-attachment-service.ts`) — `getUploadUrl` →
  direkter PUT → `confirmUpload` mit MIME-/Size-Validation und
  Path-Traversal-Guard.
- **PDF-Pipeline** nutzt `@react-pdf/renderer` v4.3.2 (synchron im
  Request), `renderToBuffer()` → `storage.upload()` → Signed-URL.
  Shared Sub-Components (`FusszeilePdf`, `PurchaseOrderPositionTablePdf`).
  Tenant-Branding via `BillingTenantConfig`. **Komplett Deutsch
  hartkodiert.**
- **Permission-Catalog** nutzt deterministische UUID-v5 aus Key-String
  (`permission-catalog.ts:28`, Namespace `f68a2ad7-...`). Hinzufügen
  erfolgt via neue `p(...)`-Einträge im `ALL_PERMISSIONS`-Array plus
  SQL-Migration, die die neuen UUIDs den System-Gruppen
  (`tenant_id IS NULL`) zuweist.
- **Audit-Log-Actions** folgen snake_case-Konvention (`"create"`,
  `"update"`, `"delete"`, plus Domain-spezifische zwei-Wort-Actions
  wie `"generate_order"`, `"record_completion"`, `"payment_create"`).
  Dot-Prefix `"impersonation.*"` wird vom Audit-Service selbst
  automatisch bei aktiver Platform-Impersonation appliziert.
- **Numbering-Service** existiert (`number-sequence-service.ts:92`),
  `getNextNumber(prisma, tenantId, key)` plus `DEFAULT_PREFIXES`-Map.
  Alle Sequenzen laufen innerhalb der Create-Transaction.

## Desired End State

Nach Abschluss aller 8 Phasen:

1. **Schema** — `WorkReport`, `WorkReportAssignment`, `WorkReportAttachment`,
   `WorkReportStatus`-Enum, `Order.workReports`-Relation und neuer
   `workReportId`-FK auf `WhStockMovement` sind in Prisma und im
   SQL-Schema vorhanden. Alle Migrations-Tests grün.
2. **Backend** — tRPC-Router `workReports.*` mit folgenden Procedures:
   - `list`, `getById`, `listByOrder`, `listByServiceObject`
   - `create`, `update`, `delete` (nur DRAFT)
   - `assignments.add`, `assignments.remove`, `assignments.list`
   - `attachments.getUploadUrl`, `attachments.confirmUpload`,
     `attachments.getDownloadUrl`, `attachments.remove`,
     `attachments.list`
   - `sign` — atomare DRAFT→SIGNED-Transition mit Pflichtfeld-
     Validation, Signatur-PNG-Upload, IP-Hash, PDF-Generation und
     Audit-Log
   - `void` — SIGNED→VOID mit Grund-Pflicht und separater Permission
   - `downloadPdf` — liefert Signed-URL; frisches Render für DRAFT
     und VOID-Overlay, archivierte PDF für SIGNED
3. **UI** — Desktop-Routen unter `/workreports`:
   - Liste mit Status-Filter
   - Detail-Seite mit 4 Tabs (Details, Mitarbeiter, Fotos, Audit)
   - Create/Edit-Sheet
   - Signatur-Dialog mit Canvas + Meta-Formular
   - VOID-Dialog mit Begründungs-Pflicht
   - Integration als neuer Tab in Order-Detail und ServiceObject-Detail
4. **Tests** — Unit- (Vitest), Integration- (lokale Postgres-Dev-DB)
   und Browser-E2E- (Playwright) Coverage pro Phase, alle grün.
5. **Permissions** — 4 neue Permission-Keys im Catalog, Default-
   Role-Mapping via SQL-Migration.
6. **Audit** — Alle Mutationen loggen nach `audit_logs`; Platform-
   Impersonation triggert Doppel-Write via existierendem
   `getImpersonation()`-Pattern.
7. **Handbuch** — Neuer Abschnitt `## 12c. Arbeitsscheine` in
   `docs/TERP_HANDBUCH.md` im identischen Stil zu §12a/§12b/§22.
8. **Storage** — Zwei neue Supabase-Buckets
   (`workreport-signatures`, `workreport-attachments`), signierte
   PDF im existierenden `documents`-Bucket unter Pfad
   `arbeitsscheine/{tenantId}/{workReportId}.pdf`.

### Verification

- `pnpm typecheck` — grün (keine neuen Typescript-Errors über Baseline
  von ~1463)
- `pnpm lint` — grün
- `pnpm vitest run src/lib/services/__tests__/work-report-*` —
  alle neuen Unit- und Integration-Tests grün
- `pnpm playwright test src/e2e-browser/NN-workreport-arbeitsschein.spec.ts` —
  Browser-E2E grün (NN = nächste freie Nummer)
- Vollständiger manueller Durchlauf des Praxisbeispiels im Handbuch-
  Abschnitt ohne UI-Fehler

## Key Discoveries

### Schema-Erkenntnisse

- **`WhWithdrawal` existiert nicht** — das Ticket nennt diese Tabelle
  für den neuen `workReportId`-FK, aber `schema.prisma` hat nur
  `WhStockMovement` (Zeile 5599), in dem Withdrawals als Rows mit
  `type: "WITHDRAWAL"` abgelegt werden. `WhStockMovement` besitzt
  bereits `orderId` und `serviceObjectId` als Nullable-FKs — das neue
  Feld `workReportId` wird nach identischem Muster dort eingefügt.
  **Diese Interpretation wird in Phase 1 umgesetzt und ist im Plan
  festgehalten — bei Review bitte bestätigen oder korrigieren.**
- **BillingDocument-Enum-Pattern** (`@@map("billing_document_status")` +
  SQL `CREATE TYPE`) ist die konsistente Wahl für `WorkReportStatus`,
  abgeleitet aus der Verbindlichkeit des Tickets ("als Prisma-Enum
  `WorkReportStatus`").
- **Storage-Path-Konvention** `{tenantId}/{parentEntityId}/{uuid}.{ext}`
  ist etabliert für Attachments (siehe
  `service-object-attachment-service.ts:130`) und wird 1:1 übernommen.
- **PDF-Pfad mit `tenantId`** ist beim Reminder-Muster vorhanden
  (`reminders/{tenantId}/{reminderId}.pdf`) und erhöht die Multi-
  Tenant-Robustheit. Gleiche Konvention für Arbeitsscheine:
  `arbeitsscheine/{tenantId}/{workReportId}.pdf`.

### Service-Pattern-Erkenntnisse

- **Error-Klassen** müssen explizit `this.name` setzen, weil
  `handleServiceError` (`src/trpc/errors.ts:24-58`) auf `err.name`
  mapped (Minification würde `constructor.name` zerstören).
- **Atomic DRAFT-Guard** nutzt Pattern aus
  `billing-document-service.ts:427-442`:
  ```ts
  const { count } = await prisma.workReport.updateMany({
    where: { id, tenantId, status: "DRAFT" },
    data,
  })
  if (count === 0) {
    if (existing.status !== "DRAFT") throw new WorkReportValidationError(...)
    throw new WorkReportConflictError("Status changed concurrently")
  }
  ```
- **PDF-Generation als Best-Effort nach Transaction** ist das
  universelle Pattern (`billing-document-service.ts:582-590`). Für
  `sign()` werden PDF und Signatur-Upload allerdings **innerhalb**
  der Atomic-Guard-Logik synchronisiert, damit die archivierte PDF
  rechtssicher zum SIGNED-Commit gehört.

### Test-Erkenntnisse

- **Integration-Tests** laufen gegen shared dev DB mit
  Transaction-Rollback-Isolation — kein Mocking von Prisma, keine
  separaten Testcontainers. Vorlage:
  `src/lib/services/__tests__/wh-withdrawal-service.test.ts` und
  `service-object-service-history.test.ts`.
- **Playwright-E2E** nutzt `describe.serial` (alle Specs laufen
  sequentiell, `workers: 1`). `auth.setup.ts` fixtured
  `.auth/admin.json` und `.auth/user.json`. File-Upload läuft über
  `page.setInputFiles` mit In-Memory-Buffer. Datenbereinigung via
  direktem `pg.Pool` gegen Dev-DB im `beforeAll`/`afterAll` plus
  globalem `global-setup.ts` Delete-by-Prefix.

### Permission-Erkenntnisse

- **Deterministische UUIDs** werden über
  `uuidv5(key, PERMISSION_NAMESPACE)` berechnet — einmal im
  Catalog-File deklariert, die UUID wird dann im Migrations-SQL
  hartkodiert. Beispiel:
  `supabase/migrations/20260505000002_service_objects_schedules_default_groups.sql`
  (Kommentar-Block zeigt UUID-Berechnung externs).
- **Additive Migration** nutzt `jsonb_agg(DISTINCT val)` über
  `jsonb_array_elements(permissions) UNION ALL` statt harter
  Überschreibung — erlaubt idempotentes Re-Run.

## What We're NOT Doing (M-1 Scope-Guardrails)

Explizit außerhalb von M-1:

- **Mobile-optimierte UI** (Touch-Targets, Responsive-Breakpoints,
  Full-Screen-Canvas) — M-2
- **Offline-Fähigkeit** (Service Worker, IndexedDB, Sync-Queue) — M-3
- **UI-Integration von `WhStockMovement.workReportId`** (Entnahme-
  Buchung auf WorkReport im UI) — späteres Ticket. M-1 liefert nur
  das Schema-Feld.
- **Checklisten pro Anlagentyp** (wiederkehrende Wartungs-Checks) —
  eigenes Ticket
- **Qualifizierte elektronische Signatur (eIDAS QES)** — bewusst
  nicht
- **Bilinguale PDFs** — Deutsch-only, konsistent mit allen
  existierenden PDFs
- **E-Mail-Versand der signierten PDF an Kunden** — separates Ticket,
  kann aber auf den Audit-Trail-Hook aus M-1 aufsetzen
- **Automatische Rechnungs-Übernahme** (WorkReport-Leistungen →
  BillingDocument-Positionen) — eigenes Ticket in Billing-Domain
- **Änderung der Order-Lifecycle-Logik** — M-1 ist additiv, `Order`
  und `OrderAssignment` bleiben unverändert

## Implementation Approach

Strikt additiver Ansatz: Keine bestehenden Services, Router oder
Komponenten werden modifiziert. Zwei Ausnahmen:

1. `prisma/schema.prisma`: neue Modelle, neue Enum, ein neues
   optionales Feld auf `WhStockMovement` und `Order.workReports` als
   Back-Relation — keine Änderung an bestehenden Feldern.
2. `docs/TERP_HANDBUCH.md`: neuer Abschnitt §12c, keine Änderung
   bestehender Abschnitte.
3. `src/lib/auth/permission-catalog.ts`: 4 neue Einträge in
   `ALL_PERMISSIONS`, keine Änderung bestehender Einträge.
4. `src/trpc/routers/_app.ts`: neuer `workReports`-Router-Eintrag.
5. `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`: neuer
   Tab „Arbeitsscheine" — additive JSX-Ergänzung, keine Änderung
   bestehender Tabs.
6. `src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx`: neuer
   Tab „Arbeitsscheine" analog Historie-Tab.

Alle anderen Änderungen sind neue Files.

Zwischen jeder Phase eine **manuelle Verification-Pause** — nach
Abschluss einer Phase hält die Implementation an, der User prüft
manuell und gibt Freigabe für die nächste Phase. Keine Phase startet
automatisch.

Pro Phase: drei Test-Ebenen (Unit, Integration, Browser-E2E wo
relevant) als konkrete Szenarien-Liste, nicht generisches „Tests".

---

## Phase 1: Foundation (Schema, Migration, Permissions, Buckets)

### Overview

Datenmodell in Prisma und SQL verankern, Storage-Buckets anlegen,
Permissions im Catalog registrieren und in System-Gruppen einpflegen.
Keine Business-Logik, keine Router, keine UI.

### Changes Required

#### 1. Prisma-Schema — `prisma/schema.prisma`

**Neue Enum**, ab Zeile 655 (nach `BillingDocumentStatus`) einfügen:

```prisma
enum WorkReportStatus {
  DRAFT
  SIGNED
  VOID

  @@map("work_report_status")
}
```

**Drei neue Modelle**, am Ende des Order-Blocks (nach Zeile 2620)
einfügen:

```prisma
model WorkReport {
  id                String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String           @map("tenant_id") @db.Uuid
  orderId           String           @map("order_id") @db.Uuid
  serviceObjectId   String?          @map("service_object_id") @db.Uuid

  code              String           @db.VarChar(50)
  visitDate         DateTime         @map("visit_date") @db.Date
  travelMinutes     Int?             @map("travel_minutes")
  workDescription   String?          @map("work_description") @db.Text

  status            WorkReportStatus @default(DRAFT)

  signedAt          DateTime?        @map("signed_at") @db.Timestamptz(6)
  signedById        String?          @map("signed_by_id") @db.Uuid
  signerName        String?          @map("signer_name") @db.VarChar(255)
  signerRole        String?          @map("signer_role") @db.VarChar(100)
  signerIpHash      String?          @map("signer_ip_hash") @db.VarChar(100)
  signaturePath     String?          @map("signature_path") @db.Text
  pdfUrl            String?          @map("pdf_url") @db.Text

  voidedAt          DateTime?        @map("voided_at") @db.Timestamptz(6)
  voidedById        String?          @map("voided_by_id") @db.Uuid
  voidReason        String?          @map("void_reason") @db.Text

  createdAt         DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime         @default(now()) @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById       String?          @map("created_by_id") @db.Uuid

  tenant        Tenant                   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  order         Order                    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  serviceObject ServiceObject?           @relation(fields: [serviceObjectId], references: [id], onDelete: SetNull)
  signedBy      User?                    @relation("WorkReportSignedBy", fields: [signedById], references: [id], onDelete: SetNull)
  voidedBy      User?                    @relation("WorkReportVoidedBy", fields: [voidedById], references: [id], onDelete: SetNull)
  createdBy     User?                    @relation("WorkReportCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
  assignments   WorkReportAssignment[]
  attachments   WorkReportAttachment[]
  stockMovements WhStockMovement[]

  @@unique([tenantId, code], map: "work_reports_tenant_id_code_key")
  @@index([tenantId, status], map: "idx_work_reports_tenant_status")
  @@index([tenantId, orderId], map: "idx_work_reports_tenant_order")
  @@index([tenantId, serviceObjectId], map: "idx_work_reports_tenant_service_object")
  @@index([tenantId, visitDate], map: "idx_work_reports_tenant_visit_date")
  @@map("work_reports")
}

model WorkReportAssignment {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  workReportId String   @map("work_report_id") @db.Uuid
  employeeId   String   @map("employee_id") @db.Uuid
  role         String?  @db.VarChar(50)
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant     Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  workReport WorkReport @relation(fields: [workReportId], references: [id], onDelete: Cascade)
  employee   Employee   @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@unique([workReportId, employeeId, role], map: "work_report_assignments_work_report_id_employee_id_role_key")
  @@index([tenantId], map: "idx_work_report_assignments_tenant")
  @@index([workReportId], map: "idx_work_report_assignments_work_report")
  @@index([employeeId], map: "idx_work_report_assignments_employee")
  @@map("work_report_assignments")
}

model WorkReportAttachment {
  id             String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String   @map("tenant_id") @db.Uuid
  workReportId   String   @map("work_report_id") @db.Uuid

  filename       String   @db.VarChar(255)
  storagePath    String   @map("storage_path") @db.Text
  mimeType       String   @map("mime_type") @db.VarChar(100)
  sizeBytes      Int      @map("size_bytes")

  createdAt      DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById    String?  @map("created_by_id") @db.Uuid

  tenant     Tenant     @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  workReport WorkReport @relation(fields: [workReportId], references: [id], onDelete: Cascade)

  @@index([tenantId, workReportId], map: "idx_work_report_attachments_tenant_report")
  @@map("work_report_attachments")
}
```

**Änderungen an bestehenden Modellen:**

- `Order` (um Zeile 2580): Back-Relation `workReports WorkReport[]`
  hinzufügen.
- `ServiceObject`: Back-Relation `workReports WorkReport[]` hinzufügen.
- `WhStockMovement` (Zeile 5599): neues Feld und Relation einfügen:
  ```prisma
  workReportId             String?             @map("work_report_id") @db.Uuid
  workReport               WorkReport?         @relation(fields: [workReportId], references: [id], onDelete: SetNull)
  ```
  plus neuer Index `@@index([tenantId, workReportId], map: "idx_wh_stock_movements_tenant_work_report")`.
- `User`: drei Back-Relationen
  `workReportsSigned WorkReport[] @relation("WorkReportSignedBy")`,
  `workReportsVoided WorkReport[] @relation("WorkReportVoidedBy")`,
  `workReportsCreated WorkReport[] @relation("WorkReportCreatedBy")`.
- `Employee`: Back-Relation `workReportAssignments WorkReportAssignment[]`.

#### 2. SQL-Migrationen — `supabase/migrations/`

Drei Migrationsdateien in dieser Reihenfolge (Datum wird bei Erstellung
via `pnpm db:migrate:new <name>` gesetzt):

**Migration A: `<ts>_create_work_report_enum_and_tables.sql`**

```sql
-- Enum type
CREATE TYPE work_report_status AS ENUM ('DRAFT', 'SIGNED', 'VOID');

-- work_reports
CREATE TABLE work_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    service_object_id UUID REFERENCES service_objects(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    visit_date DATE NOT NULL,
    travel_minutes INTEGER,
    work_description TEXT,
    status work_report_status NOT NULL DEFAULT 'DRAFT',
    signed_at TIMESTAMPTZ,
    signed_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    signer_name VARCHAR(255),
    signer_role VARCHAR(100),
    signer_ip_hash VARCHAR(100),
    signature_path TEXT,
    pdf_url TEXT,
    voided_at TIMESTAMPTZ,
    voided_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_work_reports_tenant_code UNIQUE (tenant_id, code)
);

CREATE INDEX idx_work_reports_tenant_status ON work_reports(tenant_id, status);
CREATE INDEX idx_work_reports_tenant_order ON work_reports(tenant_id, order_id);
CREATE INDEX idx_work_reports_tenant_service_object ON work_reports(tenant_id, service_object_id);
CREATE INDEX idx_work_reports_tenant_visit_date ON work_reports(tenant_id, visit_date);

CREATE TRIGGER update_work_reports_updated_at
    BEFORE UPDATE ON work_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE work_reports ENABLE ROW LEVEL SECURITY;

-- work_report_assignments
CREATE TABLE work_report_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    role VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_work_report_assignments_report_employee_role UNIQUE (work_report_id, employee_id, role)
);

CREATE INDEX idx_work_report_assignments_tenant ON work_report_assignments(tenant_id);
CREATE INDEX idx_work_report_assignments_work_report ON work_report_assignments(work_report_id);
CREATE INDEX idx_work_report_assignments_employee ON work_report_assignments(employee_id);

ALTER TABLE work_report_assignments ENABLE ROW LEVEL SECURITY;

-- work_report_attachments
CREATE TABLE work_report_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    work_report_id UUID NOT NULL REFERENCES work_reports(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    storage_path TEXT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_work_report_attachments_tenant_report ON work_report_attachments(tenant_id, work_report_id);

ALTER TABLE work_report_attachments ENABLE ROW LEVEL SECURITY;

-- Add nullable FK to wh_stock_movements
ALTER TABLE wh_stock_movements
    ADD COLUMN work_report_id UUID REFERENCES work_reports(id) ON DELETE SET NULL;

CREATE INDEX idx_wh_stock_movements_tenant_work_report
    ON wh_stock_movements(tenant_id, work_report_id);
```

**Migration B: `<ts>_create_work_report_storage_buckets.sql`**

```sql
-- Signature bucket (private, small PNGs from canvas)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'workreport-signatures',
    'workreport-signatures',
    false,
    1048576, -- 1 MiB (signatures are PNG, typically <50 KB)
    ARRAY['image/png']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Attachment bucket (photos)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'workreport-attachments',
    'workreport-attachments',
    false,
    10485760, -- 10 MiB
    ARRAY[
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/heic',
        'application/pdf'
    ]::text[]
)
ON CONFLICT (id) DO NOTHING;
```

**Migration C: `<ts>_add_work_report_permissions_to_groups.sql`**

Namespace ist `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`. Die vier UUIDs
werden durch `uuidv5(key, NAMESPACE)` berechnet und im Commentar-Block
der Migration dokumentiert, damit Review-Leser die Herkunft
nachvollziehen kann. Der Migrations-SQL-Pattern folgt
`20260505000002_service_objects_schedules_default_groups.sql`:

```sql
-- Permissions (keys → deterministic UUID-v5 in namespace f68a2ad7-...)
--   work_reports.view   → <uuid-v5>
--   work_reports.manage → <uuid-v5>
--   work_reports.sign   → <uuid-v5>
--   work_reports.void   → <uuid-v5>

UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<uuid-view>"'::jsonb
    UNION ALL SELECT '"<uuid-manage>"'::jsonb
    UNION ALL SELECT '"<uuid-sign>"'::jsonb
    UNION ALL SELECT '"<uuid-void>"'::jsonb
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<uuid-view>"'::jsonb
    UNION ALL SELECT '"<uuid-manage>"'::jsonb
    UNION ALL SELECT '"<uuid-sign>"'::jsonb
  ) sub
) WHERE code IN ('PERSONAL','VERTRIEB','MITARBEITER') AND tenant_id IS NULL;
```

Default-Zuweisung:
- **ADMIN**: alle 4 (`view`, `manage`, `sign`, `void`)
- **PERSONAL, VERTRIEB, MITARBEITER**: `view` + `manage` + `sign`
  (NICHT `void` — nur Admin darf signierte Scheine stornieren)
- **VORGESETZTER**: wird nicht berechtigt (fachlich übliche Büro-
  Abgrenzung, VORGESETZTER ist Schichtplanung-Rolle)

#### 3. Permission-Catalog — `src/lib/auth/permission-catalog.ts`

Vier neue `p(...)`-Einträge ans Ende des `ALL_PERMISSIONS`-Arrays
(nach dem `service_schedules`-Block, ab Zeile 266):

```ts
p("work_reports.view", "work_reports", "view", "Arbeitsscheine anzeigen"),
p("work_reports.manage", "work_reports", "manage", "Arbeitsscheine erstellen und bearbeiten"),
p("work_reports.sign", "work_reports", "sign", "Arbeitsschein signieren"),
p("work_reports.void", "work_reports", "void", "Signierten Arbeitsschein stornieren"),
```

#### 4. `supabase/config.toml`

Neue Bucket-Einträge für lokale Dev-Umgebung (Parität zur
Migration B):

```toml
[storage.buckets.workreport-signatures]
public = false
file_size_limit = "1MiB"
allowed_mime_types = ["image/png"]

[storage.buckets.workreport-attachments]
public = false
file_size_limit = "10MiB"
allowed_mime_types = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]
```

### Success Criteria

#### Automated Verification

- [x] Migration applies cleanly: `pnpm db:reset` (wendet alle
      Migrations + Seed an)
- [x] Prisma-Client-Generation grün: `pnpm db:generate`
- [x] Typecheck-Baseline nicht verschlechtert: `pnpm typecheck`
      (neue Errors = 0 gegenüber Baseline)
- [x] Neue Unit-Tests grün:
      `pnpm vitest run src/lib/auth/__tests__/permission-catalog.test.ts`
      (prüft Existenz + deterministische UUIDs der 4 neuen Keys)
- [x] Neue Integration-Tests grün:
      `pnpm vitest run src/lib/services/__tests__/work-report-migration.test.ts`
      (prüft: Tabellen existieren, Indexes existieren, zwei Buckets
      existieren über `supabase-admin`-Client, User-Group-Updates
      idempotent beim zweiten `pnpm db:reset`)

#### Manual Verification

- [x] `pnpm db:reset` läuft durch ohne Fehler
- [x] `pnpm db:studio` zeigt die drei neuen Tabellen mit korrekten
      Spalten und Indexen
- [x] Supabase-Dashboard (lokal: `http://localhost:54323`) zeigt
      beide neuen Buckets als privat mit korrekten MIME-Limits
- [x] System-Gruppen (ADMIN/PERSONAL/VERTRIEB/MITARBEITER) haben
      die neuen Permission-UUIDs im `permissions`-JSONB-Array
- [x] Rollback-Test: Migration lässt sich per manueller `DROP TABLE`-
      Sequenz reversieren ohne FK-Verletzungen

### Unit Tests

- **`permission-catalog.test.ts`**:
  - `permissionIdByKey("work_reports.view")` liefert konsistente
    UUID (mehrere Aufrufe identisch)
  - Alle 4 Keys liefern unterschiedliche UUIDs
  - UUID-v5-Format (36 Zeichen, Version `5` im 15. Zeichen)

### Integration Tests

- **`work-report-migration.test.ts`**:
  - `SELECT to_regclass('public.work_reports')` gibt nicht-NULL
    zurück (analog für `work_report_assignments`,
    `work_report_attachments`)
  - `SELECT 1 FROM pg_indexes WHERE indexname = 'idx_work_reports_tenant_status'`
    → 1 Row
  - Supabase-Admin-Client: `listBuckets()` enthält
    `workreport-signatures` und `workreport-attachments`
  - Nach `pnpm db:reset`: ADMIN-Gruppe (tenant_id IS NULL) hat alle 4
    WorkReport-Permission-UUIDs; MITARBEITER hat 3 (ohne void)
  - Cross-Tenant-Isolation: `INSERT INTO work_reports` mit
    `tenant_id` aus Tenant A und `order_id` aus Tenant B schlägt mit
    Constraint-Verletzung (FK erzwingt via CASCADE die
    Tenant-Konsistenz nicht — das ist App-Layer-Verantwortung, der
    Test dokumentiert das explizit)

### Browser E2E

— (keine UI in dieser Phase)

**Implementation Note**: Nach Abschluss dieser Phase und grünen
automatischen Verifikationen: Pause. Manuelle Freigabe durch User
bevor Phase 2 startet.

---

## Phase 2: Service-Layer + tRPC-Router (DRAFT-CRUD)

### Overview

Basis-CRUD für WorkReports im DRAFT-Status. Create, Read (list,
getById, listByOrder, listByServiceObject), Update und Delete. Sign,
Void, Assignments und Attachments folgen in separaten Phasen.

### Changes Required

#### 1. Numbering — `src/lib/services/number-sequence-service.ts`

Zeile 37–68 (`DEFAULT_PREFIXES`-Map) um einen neuen Eintrag ergänzen:

```ts
work_report: "AS-",
```

#### 2. Repository — `src/lib/services/work-report-repository.ts` (NEU)

Signaturen (Implementierung nach `order-repository.ts`-Muster, inkl.
`tenantScopedUpdate`-Helper):

```ts
export const workReportInclude = {
  order: { select: { id: true, code: true, name: true } },
  serviceObject: { select: { id: true, number: true, name: true, kind: true } },
  assignments: {
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, personnelNumber: true } },
    },
  },
  attachments: { orderBy: { createdAt: "desc" as const } },
} as const

export function findMany(prisma, tenantId, params?: { status?, orderId?, serviceObjectId?, limit?, offset? }): Promise<...>
export function count(prisma, tenantId, params?: {...}): Promise<number>
export function findById(prisma, tenantId, id): Promise<... | null>
export function findByIdSimple(prisma, tenantId, id): Promise<{ id, status, tenantId } | null>
export function findByCode(prisma, tenantId, code): Promise<... | null>
export function findManyByOrder(prisma, tenantId, orderId): Promise<...>
export function findManyByServiceObject(prisma, tenantId, serviceObjectId, limit?): Promise<...>

export function create(prisma, data: { tenantId, orderId, serviceObjectId?, code, visitDate, travelMinutes?, workDescription?, createdById? }): Promise<...>
export function update(prisma, tenantId, id, data): Promise<...>   // uses tenantScopedUpdate
export function deleteById(prisma, tenantId, id): Promise<boolean>

export function atomicUpdateDraft(prisma, tenantId, id, data): Promise<number>
  // returns count of rows updated, for the atomic DRAFT guard pattern
```

#### 3. Service — `src/lib/services/work-report-service.ts` (NEU)

Error-Klassen zuerst:

```ts
export class WorkReportNotFoundError extends Error {
  constructor(message = "WorkReport not found") { super(message); this.name = "WorkReportNotFoundError" }
}
export class WorkReportValidationError extends Error {
  constructor(message: string) { super(message); this.name = "WorkReportValidationError" }
}
export class WorkReportConflictError extends Error {
  constructor(message: string) { super(message); this.name = "WorkReportConflictError" }
}
export class WorkReportNotEditableError extends Error {
  constructor(message = "WorkReport is not editable in its current status") { super(message); this.name = "WorkReportValidationError" }
}
```

Hinweis: `WorkReportNotEditableError` nutzt `this.name = "WorkReportValidationError"` um vom `handleServiceError`-Mapper (`err.name`-basiert) als `BAD_REQUEST` klassifiziert zu werden. Spätere Sign/Void-Phasen ergänzen `WorkReportAlreadySignedError` und `WorkReportAlreadyVoidedError`.

Funktions-Signaturen:

```ts
export function list(prisma, tenantId, params?: { status?, orderId?, serviceObjectId?, limit?, offset? }): Promise<...>
export function getById(prisma, tenantId, id): Promise<...>
export function listByOrder(prisma, tenantId, orderId): Promise<...>
export function listByServiceObject(prisma, tenantId, serviceObjectId, limit?: number): Promise<...>

export function create(
  prisma, tenantId, input: { orderId, serviceObjectId?, visitDate, travelMinutes?, workDescription? },
  audit?: AuditContext,
): Promise<...>

export function update(
  prisma, tenantId, input: { id, visitDate?, travelMinutes?, workDescription?, serviceObjectId? },
  audit?: AuditContext,
): Promise<...>

export function remove(prisma, tenantId, id, audit?: AuditContext): Promise<void>
```

Verhaltens-Eckpunkte:

- **Create**:
  - `input.orderId` Ownership prüfen (Order existiert, `tenantId`
    stimmt — neue Utility `assertOrderInTenant()` im Service-File)
  - `input.serviceObjectId` Ownership prüfen (nullable, analog)
  - In `$transaction`:
    - `code = await numberSeqService.getNextNumber(tx, tenantId, "work_report")`
    - `created = repo.create(tx, { ... })`
  - Audit `action: "create"`, `entityType: "work_report"`,
    `entityName: code`.
- **Update**: 
  - Bestehenden Record via `repo.findByIdSimple` laden → wenn nicht
    gefunden, `WorkReportNotFoundError`
  - Status-Guard via atomic `updateMany` (`where: { id, tenantId, status: "DRAFT" }`)
    plus Re-Fetch bei `count === 0` (Pattern aus
    `billing-document-service.ts:427-442`)
  - `ValidationError("WorkReport is not editable in its current status")`
    wenn Status !== DRAFT
  - `ConflictError("Status changed concurrently")` bei Race
  - Audit `action: "update"` mit `computeChanges(before, after, TRACKED_FIELDS)` 
    — `TRACKED_FIELDS` enthält `["visitDate", "travelMinutes", "workDescription", "serviceObjectId"]`
- **Remove**:
  - Status-Guard: nur DRAFT löschbar
  - Audit `action: "delete"` inkl. `entityName: code`
  - Cascade-Delete von Assignments/Attachments läuft automatisch
    per DB-FK (`onDelete: Cascade`)

#### 4. tRPC-Router — `src/trpc/routers/workReports.ts` (NEU)

Struktur-Template folgt `src/trpc/routers/orders.ts`:

```ts
const WORK_REPORTS_VIEW = permissionIdByKey("work_reports.view")!
const WORK_REPORTS_MANAGE = permissionIdByKey("work_reports.manage")!

export const workReportsRouter = createTRPCRouter({
  list: tenantProcedure
    .use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(z.object({
      status: z.enum(["DRAFT","SIGNED","VOID"]).optional(),
      orderId: z.string().uuid().optional(),
      serviceObjectId: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .output(WorkReportListOutput)
    .query(async ({ ctx, input }) => { try { ... } catch (err) { handleServiceError(err) } }),

  getById: tenantProcedure.use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))...,
  listByOrder: tenantProcedure.use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))...,
  listByServiceObject: tenantProcedure.use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))...,

  create: tenantProcedure.use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({
      orderId: z.string().uuid(),
      serviceObjectId: z.string().uuid().optional(),
      visitDate: z.string().date(), // ISO-Date
      travelMinutes: z.number().int().min(0).max(1440).optional(),
      workDescription: z.string().max(5000).optional(),
    })).mutation(...),

  update: tenantProcedure.use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({
      id: z.string().uuid(),
      visitDate: z.string().date().optional(),
      travelMinutes: z.number().int().min(0).max(1440).nullable().optional(),
      workDescription: z.string().max(5000).optional(),
      serviceObjectId: z.string().uuid().nullable().optional(),
    })).mutation(...),

  delete: tenantProcedure.use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({ id: z.string().uuid() })).mutation(...),
})
```

Output-Mapper `mapWorkReportToOutput` konvertiert Date → ISO-String,
`Prisma.Decimal` → Number (falls später Decimal-Felder zukommen) analog
zu `orders.ts`.

#### 5. Router-Registrierung — `src/trpc/routers/_app.ts`

```ts
import { workReportsRouter } from "./workReports"

export const appRouter = createTRPCRouter({
  // ...existing routers...
  workReports: workReportsRouter,
})
```

### Success Criteria

#### Automated Verification

- [x] Typecheck grün: `pnpm typecheck`
- [x] Lint grün: `pnpm lint`
- [x] Unit-Tests grün:
      `pnpm vitest run src/lib/services/__tests__/work-report-service.unit.test.ts`
- [x] Integration-Tests grün:
      `pnpm vitest run src/lib/services/__tests__/work-report-service.integration.test.ts`

#### Manual Verification

- [ ] tRPC-Playground bzw. Dev-Client kann DRAFT-WorkReport anlegen
- [ ] `list` liefert korrekte Filter-Ergebnisse für `orderId` und
      `serviceObjectId`
- [ ] Delete auf künstlich via DB-Direct auf SIGNED gesetzten Record
      liefert `BAD_REQUEST` (nicht `OK`, nicht `INTERNAL_SERVER_ERROR`)
- [ ] Cross-Tenant: User aus Tenant A kann WorkReport aus Tenant B
      nicht via `getById` abrufen (liefert `NOT_FOUND`)

### Unit Tests

- **`work-report-service.unit.test.ts`**:
  - `create` wirft `WorkReportValidationError` wenn `orderId` leer/
    falsch-formatiert (Zod fängt das vor dem Service, aber der Service
    validiert zusätzlich Order-Tenant-Ownership)
  - `create` wirft wenn `serviceObjectId` aus anderem Tenant stammt
  - `update` wirft `WorkReportValidationError` wenn Record SIGNED
    (Mock: Repo liefert `{ status: "SIGNED" }`)
  - `update` wirft `WorkReportConflictError` wenn atomic-updateMany
    `count: 0` UND `existing.status === "DRAFT"` zurückliefert
  - `remove` wirft wenn Status !== DRAFT
  - Audit-Log wird mit korrekten Feldern aufgerufen
    (`entityType: "work_report"`, `action: "create"|"update"|"delete"`,
    `entityName: code`)

### Integration Tests

- **`work-report-service.integration.test.ts`** (gegen lokale Postgres,
  Transaction-Rollback-Isolation wie in
  `service-object-service-history.test.ts`):
  - Full-Create-Flow: Create → `list({ orderId })` enthält Record →
    `getById` liefert ihn mit Order+ServiceObject-Includes
  - Numbering: zwei aufeinanderfolgende Creates liefern Codes `AS-1`
    und `AS-2` (bzw. next-from-sequence-state)
  - Update auf DRAFT: `workDescription` ändern → Audit-Log-Row hat
    `changes.workDescription.{old,new}`
  - Update-Race-Simulation: zwei parallele `update`-Calls via
    `Promise.all` → einer gewinnt, der andere wirft `CONFLICT`
    (liefert `err.name === "WorkReportConflictError"`)
  - Delete löscht Assignments und Attachments per Cascade (setup:
    einen Record + eine Assignment + einen Attachment-DB-Eintrag über
    direktes Prisma, dann Delete, dann Row-Counts in `work_report_*`
    Tabellen = 0)
  - Permission-Gate: simulierter User ohne `work_reports.manage`
    → `FORBIDDEN` (`create` + `update` + `delete`)
  - Permission-Gate: User mit `view` aber ohne `manage` kann `list`
    und `getById`, aber nicht `create`
  - Cross-Tenant: `getById` mit falschem `ctx.tenantId` → `NOT_FOUND`

### Browser E2E

— (keine UI in dieser Phase)

**Implementation Note**: Pause nach Phase 2. User testet manuell via
tRPC-Playground (oder temporärem Seed-Skript), bevor Phase 3 startet.

---

## Phase 3: Assignment-Flow

### Overview

Mitarbeiter-Zuweisungen zu WorkReports: inkrementelles Add/Remove-
Muster analog `OrderAssignment`. Rollen-Feld ist im Schema vorgesehen,
aber in M-1 optional (UI gibt optional eine Rolle mit, das Pflichtfeld
kommt später).

### Changes Required

#### 1. Repository — `src/lib/services/work-report-assignment-repository.ts` (NEU)

```ts
export const workReportAssignmentInclude = {
  workReport: { select: { id: true, code: true, status: true } },
  employee: { select: { id: true, firstName: true, lastName: true, personnelNumber: true } },
} as const

export function findByIdSimple(prisma, tenantId, id): Promise<{ id, workReportId, employeeId, role } | null>
export function findByIdWithIncludes(prisma, tenantId, id): Promise<...>
export function findMany(prisma, tenantId, workReportId): Promise<...>
export function create(prisma, data): Promise<...>
export function deleteById(prisma, tenantId, id): Promise<boolean>
```

#### 2. Service — `src/lib/services/work-report-assignment-service.ts` (NEU)

Error-Klassen:
```ts
export class WorkReportAssignmentNotFoundError extends Error { ... }
export class WorkReportAssignmentConflictError extends Error { ... }  // P2002
```

Signaturen:
```ts
export function listByWorkReport(prisma, tenantId, workReportId): Promise<...>

export function add(
  prisma, tenantId, input: { workReportId, employeeId, role?: string | null },
  audit?: AuditContext,
): Promise<...>

export function remove(prisma, tenantId, id, audit?: AuditContext): Promise<void>
```

Verhaltens-Eckpunkte:
- **add**:
  - Parent-WorkReport-Existenz + Tenant-Check
  - Parent-Status-Guard: `WorkReportValidationError("WorkReport is not editable in its current status")` wenn WorkReport nicht in DRAFT
  - Employee-Tenant-Ownership-Check (`employeeService.findById` mit Tenant-Scope)
  - `repo.create()` — bei `Prisma.PrismaClientKnownRequestError` mit
    `code === "P2002"` → `WorkReportAssignmentConflictError("Assignment already exists for this employee+role")`
  - Audit `action: "assignment_added"`, `entityType: "work_report"`,
    `entityId: workReportId` (parent-bezogen!), `metadata: { assignmentId, employeeId, role }`
- **remove**:
  - Parent-Status-Guard analog
  - Audit `action: "assignment_removed"`, gleiche Attribution

#### 3. Router-Extensions — `src/trpc/routers/workReports.ts`

Eine sub-Router-Gruppe `assignments`:

```ts
assignments: createTRPCRouter({
  list: tenantProcedure.use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(z.object({ workReportId: z.string().uuid() }))
    .query(...),
  add: tenantProcedure.use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({
      workReportId: z.string().uuid(),
      employeeId: z.string().uuid(),
      role: z.string().max(50).nullable().optional(),
    })).mutation(...),
  remove: tenantProcedure.use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({ id: z.string().uuid() })).mutation(...),
}),
```

### Success Criteria

#### Automated Verification

- [x] Typecheck + Lint grün
- [x] Unit:
      `pnpm vitest run src/lib/services/__tests__/work-report-assignment-service.unit.test.ts`
- [x] Integration:
      `pnpm vitest run src/lib/services/__tests__/work-report-assignment-service.integration.test.ts`

#### Manual Verification

- [ ] Assignment-Add auf SIGNED-WorkReport via tRPC-Playground
      → `BAD_REQUEST`
- [ ] Zwei Add-Calls mit identischem `(employeeId, role)` → zweiter
      liefert `CONFLICT`
- [ ] Delete des Parent-WorkReports (im DRAFT) löscht Assignments
      automatisch (DB-State prüfen)

### Unit Tests

- Add wirft `WorkReportValidationError` wenn Parent SIGNED/VOID
- Add wirft `WorkReportNotFoundError` wenn Parent nicht im Tenant
- Add wirft `WorkReportAssignmentConflictError` bei P2002-Simulation
- Employee-Cross-Tenant-Check schlägt

### Integration Tests

- Full-Create-Flow: Add → `listByWorkReport` enthält Row mit
  Employee-Include
- Parallel-Add-Race: zwei identische `add({ workReportId, employeeId, role })`
  via `Promise.all` → genau einer gewinnt (DB-Unique-Constraint greift)
- Cascade: WorkReport löschen entfernt alle Assignments in der selben
  Tenant-Scope
- Cross-Tenant: `add` mit `employeeId` aus anderem Tenant schlägt

### Browser E2E

— (keine UI in dieser Phase)

**Implementation Note**: Pause nach Phase 3.

---

## Phase 4: Attachment-Upload (Fotos)

### Overview

3-Step-Upload-Pipeline für Fotos auf WorkReports. Exakt identisch zum
`service-object-attachment-service.ts`-Muster, nur mit anderem Bucket
und anderer Parent-Entität.

### Changes Required

#### 1. Repository-Extensions — `src/lib/services/work-report-repository.ts`

Neue Attachment-Funktionen (alternativ in
`work-report-attachment-repository.ts` — wir nutzen
`work-report-attachment-repository.ts` als separate Datei für
Konsistenz mit `service-object-attachment`-Pattern, wobei dort die
Attachment-Funktionen im `service-object-repository.ts:279-334`
leben. Entscheidung: **separate Datei** für bessere Trennung, da
`work-report-repository.ts` sonst zu fett wird):

#### 2. Repository — `src/lib/services/work-report-attachment-repository.ts` (NEU)

```ts
export function findMany(prisma, tenantId, workReportId): Promise<Attachment[]>
export function findById(prisma, tenantId, id): Promise<... | null>
export function count(prisma, tenantId, workReportId): Promise<number>
export function create(prisma, data: { tenantId, workReportId, filename, storagePath, mimeType, sizeBytes, createdById? }): Promise<...>
export function deleteById(prisma, tenantId, id): Promise<boolean>
```

#### 3. Service — `src/lib/services/work-report-attachment-service.ts` (NEU)

Konstanten (analog `service-object-attachment-service.ts:18-29`):

```ts
const BUCKET = "workreport-attachments"
const SIGNED_URL_EXPIRY_SECONDS = 300
const MAX_ATTACHMENTS_PER_REPORT = 30
const MAX_SIZE_BYTES = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = ["image/jpeg","image/png","image/webp","image/heic","application/pdf"]
```

Error-Klassen:
```ts
export class WorkReportAttachmentNotFoundError extends Error { ... }
export class WorkReportAttachmentValidationError extends Error { ... }
```

Signaturen (1:1 zum ServiceObject-Muster):

```ts
export function listAttachments(prisma, tenantId, workReportId): Promise<(Attachment & { downloadUrl: string })[]>

export function getUploadUrl(
  prisma, tenantId, workReportId, _filename: string, mimeType: string
): Promise<{ signedUrl: string; storagePath: string; token: string }>

export function confirmUpload(
  prisma, tenantId, workReportId,
  storagePath: string, filename: string, mimeType: string, sizeBytes: number,
  createdById?: string, audit?: AuditContext,
): Promise<Attachment>

export function getDownloadUrl(prisma, tenantId, attachmentId): Promise<{ signedUrl: string }>

export function remove(prisma, tenantId, attachmentId, audit?: AuditContext): Promise<{ success: true }>
```

Verhaltens-Eckpunkte:
- **getUploadUrl + confirmUpload**: beide validieren Parent-Status
  (nur DRAFT darf neue Fotos empfangen). Pfad-Traversal-Guard
  (`${tenantId}/${workReportId}/` Prefix-Check) exakt wie
  `service-object-attachment-service.ts:172-177`.
- **remove**: Auf SIGNED/VOID-WorkReport nicht erlaubt. Bei Delete
  wird erst DB-Row entfernt, danach Storage-Objekt via
  `storage.remove(BUCKET, [storagePath])` (best-effort — Storage-Fehler
  werden geloggt, nicht re-thrown).
- **Alle Audit-Calls** via `action: "attachment_added"` /
  `"attachment_removed"`, `entityType: "work_report"`,
  `entityId: workReportId` (Parent-Attribution).

#### 4. Router-Extensions — `src/trpc/routers/workReports.ts`

```ts
attachments: createTRPCRouter({
  list: tenantProcedure.use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(z.object({ workReportId: z.string().uuid() }))
    .query(...),

  getUploadUrl: tenantProcedure.use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({
      workReportId: z.string().uuid(),
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
    })).mutation(...),

  confirmUpload: tenantProcedure.use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({
      workReportId: z.string().uuid(),
      storagePath: z.string().min(1).max(500),
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(100),
      sizeBytes: z.number().int().positive(),
    })).mutation(...),

  getDownloadUrl: tenantProcedure.use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
    .input(z.object({ attachmentId: z.string().uuid() })).mutation(...),

  remove: tenantProcedure.use(requirePermission(WORK_REPORTS_MANAGE))
    .input(z.object({ attachmentId: z.string().uuid() })).mutation(...),
}),
```

### Success Criteria

#### Automated Verification

- [x] Typecheck + Lint grün
- [x] Unit:
      `pnpm vitest run src/lib/services/__tests__/work-report-attachment-service.unit.test.ts`
- [x] Integration:
      `pnpm vitest run src/lib/services/__tests__/work-report-attachment-service.integration.test.ts`

#### Manual Verification

- [ ] Upload via curl (Presigned-PUT) mit JPEG funktioniert
- [ ] `getDownloadUrl` liefert klickbaren Signed-Download-Link
      (5 Min Expiry)
- [ ] `remove` löscht DB-Row UND Storage-Objekt (Supabase-Dashboard
      prüft Bucket leer)
- [ ] Upload auf SIGNED-Record → `BAD_REQUEST`

### Unit Tests

- MIME-Rejection: `application/x-sh` → `WorkReportAttachmentValidationError`
- Size-Limit-Rejection: 11 MB → `WorkReportAttachmentValidationError`
- Path-Traversal-Rejection: `storagePath = "../../etc/passwd"` →
  `WorkReportAttachmentValidationError`
- Count-Limit: 31. Upload-Versuch (bei bereits 30 vorhandenen)
  → `WorkReportAttachmentValidationError`
- Parent-DRAFT-Guard: `getUploadUrl` auf SIGNED-Parent
  → `WorkReportValidationError`

### Integration Tests

- End-to-End Upload-Flow gegen lokalen Supabase-Storage:
  1. `getUploadUrl` liefert Signed URL mit Pfad
     `${tenantId}/${workReportId}/${uuid}.jpg`
  2. HTTP-PUT mit JPEG-Buffer gegen die Signed URL → 200
  3. `confirmUpload` erzeugt DB-Row
  4. `listAttachments` enthält die Row inkl. `downloadUrl`
  5. `getDownloadUrl(id)` liefert Signed-Read-URL; HTTP-GET liefert
     den JPEG-Buffer zurück
  6. `remove(id)` — DB-Row weg, Storage-Listing leer
- Cross-Tenant: `confirmUpload` mit `storagePath` aus Tenant-B-Prefix
  schlägt (Pfad-Traversal-Guard)

### Browser E2E

— (keine UI in dieser Phase)

**Implementation Note**: Pause nach Phase 4.

---

## Phase 5: PDF-Generierung (DRAFT-Mode)

### Overview

PDF-Template und on-Demand-Render-Service für DRAFT-WorkReports.
`pdfUrl` bleibt NULL — jede Download-Anfrage rendert frisch. Die
persistierte PDF kommt erst in Phase 6 beim `sign()`-Commit.

### Changes Required

#### 1. PDF-Template — `src/lib/pdf/work-report-pdf.tsx` (NEU)

Struktur nach `purchase-order-pdf.tsx`-Vorbild:

```tsx
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer"
import { FusszeilePdf } from "./fusszeile-pdf"
import { formatDateDe } from "./date-utils"

const MM = 2.83465

export interface WorkReportPdfProps {
  report: {
    code: string
    visitDate: Date | string
    travelMinutes: number | null
    workDescription: string | null
    status: "DRAFT" | "SIGNED" | "VOID"
    signedAt: Date | string | null
    signerName: string | null
    signerRole: string | null
    signerIpHash: string | null
    voidedAt: Date | string | null
    voidReason: string | null
  }
  order: { code: string; name: string; customer: string | null } | null
  serviceObject: { number: string; name: string; kind: string } | null
  assignments: { firstName: string; lastName: string; personnelNumber: string | null; role: string | null }[]
  signatureDataUrl: string | null  // base64 PNG für SIGNED
  tenantConfig: BillingTenantConfigShape | null  // gleiche Shape wie purchase-order-pdf
}

export function WorkReportPdf(props: WorkReportPdfProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header: Logo top-right */}
        {props.tenantConfig?.logoUrl && <Image src={props.tenantConfig.logoUrl} style={styles.logo} />}
        {/* Sender-Zeile oberhalb des Empfänger-Blocks */}
        {/* Kunden-Block */}
        {/* Title: "ARBEITSSCHEIN" + Code */}
        {/* Meta-Block: Auftrag-Referenz, Serviceobjekt, Einsatzdatum, Anfahrt-Minuten */}
        {/* Mitarbeiter-Liste */}
        {/* Arbeitsbeschreibung (RichText oder plain) */}
        {/* Signatur-Block (absolut positioniert, bottom: 50mm) */}
        {/* Fusszeile */}
        {props.tenantConfig && <FusszeilePdf config={props.tenantConfig} />}
      </Page>
    </Document>
  )
}
```

Signatur-Block-Logik:
- `status === "DRAFT"`: Leeres Feld mit Unterschriftslinie + Labels
  "Ort, Datum" und "Unterschrift" (wie `purchase-order-pdf.tsx:194-201`)
- `status === "SIGNED"`: `<Image src={signatureDataUrl}>` mit
  `maxHeight: 40, maxWidth: 200` über der Unterschriftslinie, darunter
  Meta-Block mit `signerName`, `signerRole`, `signedAt` formatiert als
  `DD.MM.YYYY HH:mm`, und "Signatur erfasst von Gerät mit IP-Hash
  {signerIpHash.slice(0,8)}…"
- `status === "VOID"`: Große rote Diagonal-Überlagerung mit Text
  "STORNIERT am {voidedAt} — Grund: {voidReason}" in
  `View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, transform: 'rotate(-30deg)' }}`.
  Details: `color: '#dc2626'`, `fontSize: 48`, `opacity: 0.5`,
  `textAlign: 'center'`, vertikal zentriert.

Styles für Signatur-Block:
```ts
signatureBlock: { position: "absolute", bottom: 50 * MM, left: 25 * MM, right: 25 * MM },
signatureLine: { borderBottomWidth: 0.5, width: 250 },
signatureLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
signatureLabel: { fontSize: 7, color: "#666" },
signatureMeta: { marginTop: 6, fontSize: 8 },
voidOverlay: { position: "absolute", top: "30%", left: 0, right: 0, fontSize: 48, color: "#dc2626", opacity: 0.5, textAlign: "center", transform: "rotate(-30deg)" },
```

#### 2. PDF-Service — `src/lib/services/work-report-pdf-service.ts` (NEU)

```ts
const BUCKET = "documents"
const SIGNED_URL_EXPIRY_SECONDS = 300

export async function generateAndGetDownloadUrl(
  prisma: PrismaClient, tenantId: string, workReportId: string,
): Promise<{ signedUrl: string; filename: string }>
// Frisch-Rendering für DRAFT, liefert signed URL (kein Persist auf Record)

export async function getPersistedDownloadUrl(
  prisma: PrismaClient, tenantId: string, workReportId: string,
): Promise<{ signedUrl: string; filename: string } | null>
// Lookup auf work_report.pdfUrl; nur für SIGNED aufrufbar

export async function generateSignedAndStore(
  prisma: PrismaClient, tenantId: string, workReportId: string, signatureDataUrl: string,
): Promise<{ storagePath: string }>
// Einmalige Render-und-Persist-Operation, in sign() aufgerufen

export async function generateVoidedOverlay(
  prisma: PrismaClient, tenantId: string, workReportId: string,
): Promise<{ signedUrl: string; filename: string }>
// Overlay-Render auf-Demand, nicht persistiert (Phase 7)
```

Interne Helper:
```ts
async function buildPdfProps(prisma, tenantId, workReportId): Promise<WorkReportPdfProps>
// Lädt alle nötigen Relations + BillingTenantConfig + Signatur-PNG-Base64 (für SIGNED)

async function render(props): Promise<Buffer>
// React.createElement(WorkReportPdf, props) → renderToBuffer(el as any)

function storagePath(tenantId, workReportId): string
// → `arbeitsscheine/${tenantId}/${workReportId}.pdf`
```

#### 3. Router-Extension — `src/trpc/routers/workReports.ts`

```ts
downloadPdf: tenantProcedure.use(requirePermission(WORK_REPORTS_VIEW, WORK_REPORTS_MANAGE))
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const report = await workReportService.getById(ctx.prisma, ctx.tenantId!, input.id)
    if (report.status === "SIGNED") {
      const persisted = await pdfService.getPersistedDownloadUrl(ctx.prisma, ctx.tenantId!, input.id)
      if (persisted) return persisted
      // Fallback nur wenn PDF-Gen zum Sign-Zeitpunkt fehlschlug — frisch rendern
    }
    if (report.status === "VOID") {
      return await pdfService.generateVoidedOverlay(ctx.prisma, ctx.tenantId!, input.id)
    }
    return await pdfService.generateAndGetDownloadUrl(ctx.prisma, ctx.tenantId!, input.id)
  }),
```

Hinweis: `downloadPdf` ist als Mutation (nicht Query) deklariert, weil
sie intern einen Storage-Write auslösen kann (Fresh-Render auf DRAFT
speichert nicht, aber React Query sollte die URL nicht cachen).

### Success Criteria

#### Automated Verification

- [x] Typecheck + Lint grün
- [x] Unit:
      `pnpm vitest run src/lib/pdf/__tests__/work-report-pdf.test.ts`
- [x] Integration:
      `pnpm vitest run src/lib/services/__tests__/work-report-pdf-service.integration.test.ts`

#### Manual Verification

- [ ] DRAFT-PDF lässt sich via tRPC `downloadPdf` laden
- [ ] PDF enthält: Code, Auftrag-Referenz, Mitarbeiter-Namen,
      Arbeitsbeschreibung, leeres Signatur-Feld mit Linie
- [ ] Fusszeile enthält Tenant-Branding (Logo, IBAN, USt-IdNr., GF)
- [ ] Leer-Fälle: PDF rendert ohne Mitarbeiter, ohne ServiceObject,
      ohne workDescription — keine Exceptions, keine leeren
      Abschnitte

### Unit Tests

- **`work-report-pdf.test.tsx`** (React-Component via
  `@testing-library/react` nur für strukturelle Snapshots, da
  `@react-pdf/renderer` kein DOM produziert):
  - Snapshot-Test mit Fixture „vollständiger DRAFT"
  - Snapshot-Test mit „leer-Attachments + leer-Assignments +
    kein-ServiceObject"
  - Snapshot-Test mit „SIGNED mit Signatur-PNG"
  - Snapshot-Test mit „VOID (mit Overlay)"

### Integration Tests

- **`work-report-pdf-service.integration.test.ts`**:
  - Seed DRAFT-WorkReport + zwei Assignments + ein
    `BillingTenantConfig` mit `logoUrl = null` → `renderToBuffer`
    liefert Non-Empty-Buffer (>1 KB)
  - Header-Bytes: erste 4 Bytes sind `%PDF`
  - PDF-Text-Extraction (via `pdf-parse` oder Inline-Buffer-Scan
    nach ASCII-Strings) enthält:
    - WorkReport-Code (`AS-…`)
    - Order-Code
    - Mindestens einen Employee-Lastname
  - Ohne `BillingTenantConfig`: PDF rendert, Fusszeile ist leer
    (oder fehlt), kein Crash

### Browser E2E

— (keine UI in dieser Phase)

**Implementation Note**: Pause nach Phase 5.

---

## Phase 6: Signatur-Flow (Canvas + Sign-Transition)

### Overview

Kritischste Phase. Neue Dependency `react-signature-canvas`, neue
Canvas-Component, atomare DRAFT→SIGNED-Transition mit Signatur-Upload,
PDF-Persist und vollständiger Audit-Trail. Integration-Test für
Race-Condition ist Pflicht.

### Changes Required

#### 1. Dependency — `package.json`

Neue Zeile unter `dependencies` (alphabetisch einsortieren):

```json
"react-signature-canvas": "1.0.6"
```

Version wird gepinnt (keine Caret-Range). Installieren via
`pnpm install react-signature-canvas`.

#### 2. Canvas-Component — `src/components/work-reports/signature-pad.tsx` (NEU)

```tsx
'use client'
import { useRef, useImperativeHandle, forwardRef } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'

export interface SignaturePadHandle {
  isEmpty: () => boolean
  toPng: () => string | null  // base64 data URL
  clear: () => void
}

interface Props {
  width?: number
  height?: number
  disabled?: boolean
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(
  ({ width = 600, height = 200, disabled }, ref) => {
    const canvasRef = useRef<SignatureCanvas | null>(null)

    useImperativeHandle(ref, () => ({
      isEmpty: () => canvasRef.current?.isEmpty() ?? true,
      toPng: () => {
        const sig = canvasRef.current
        if (!sig || sig.isEmpty()) return null
        // Min-Stroke-Check: weniger als 5 Punkte = nicht genug
        const data = sig.toData()
        if (!data.length || data.every(stroke => stroke.length < 3)) return null
        return sig.toDataURL('image/png')
      },
      clear: () => canvasRef.current?.clear(),
    }))

    return (
      <div className="rounded-md border bg-background">
        <SignatureCanvas
          ref={canvasRef as any}
          canvasProps={{ width, height, className: 'w-full touch-none' }}
          penColor="black"
          backgroundColor="white"
        />
        <div className="border-t p-2 flex justify-end">
          <Button type="button" variant="ghost" size="sm"
            disabled={disabled}
            onClick={() => canvasRef.current?.clear()}>
            <Trash2 className="h-4 w-4 mr-2" />
            Signatur löschen
          </Button>
        </div>
      </div>
    )
  }
)
SignaturePad.displayName = 'SignaturePad'
```

#### 3. Service-Method — `src/lib/services/work-report-service.ts`

Neue Error-Klasse:
```ts
export class WorkReportAlreadySignedError extends Error {
  constructor() { super("WorkReport is already signed"); this.name = "WorkReportConflictError" }
}
```

Neue Signatur:
```ts
export async function sign(
  prisma: PrismaClient, tenantId: string,
  input: {
    id: string
    signerName: string
    signerRole: string
    signatureDataUrl: string  // base64 "data:image/png;base64,..."
  },
  audit?: AuditContext,
): Promise<...>
```

Ablauf (streng sequenziell, weil mehrere Seiten-Effekte synchronisiert
werden müssen):

1. **Pflichtfeld-Validierung**:
   - `input.signerName.trim().length >= 2` und `<= 255`
   - `input.signerRole.trim().length >= 2` und `<= 100`
   - `input.signatureDataUrl.startsWith("data:image/png;base64,")`

2. **Pre-Fetch + Business-Validierung**:
   - `existing = repo.findById(prisma, tenantId, input.id)`
   - Wenn `null` → `WorkReportNotFoundError`
   - Wenn `existing.status !== "DRAFT"` → `WorkReportAlreadySignedError`
   - `existing.workDescription?.trim()` muss non-empty sein → sonst
     `WorkReportValidationError("Arbeitsbeschreibung ist Pflicht beim Signieren")`
   - `existing.assignments.length >= 1` → sonst
     `WorkReportValidationError("Mindestens ein Mitarbeiter muss zugewiesen sein")`

3. **Signatur-PNG dekodieren und hochladen**:
   - `const base64 = input.signatureDataUrl.replace(/^data:image\/png;base64,/, "")`
   - `const buffer = Buffer.from(base64, "base64")`
   - Größen-Check: `buffer.length` ≤ 1 MB (sonst
     `WorkReportValidationError`)
   - `const signaturePath = \`${tenantId}/${input.id}.png\``
   - `await storage.upload("workreport-signatures", signaturePath, buffer, { contentType: "image/png", upsert: true })`

4. **IP-Hash**:
   - `const ipHash = audit?.ipAddress ? hashField(audit.ipAddress) : null`

5. **Atomic DRAFT→SIGNED**:
   ```ts
   const { count } = await prisma.workReport.updateMany({
     where: { id: input.id, tenantId, status: "DRAFT" },
     data: {
       status: "SIGNED",
       signedAt: new Date(),
       signedById: audit?.userId ?? null,
       signerName: input.signerName.trim(),
       signerRole: input.signerRole.trim(),
       signerIpHash: ipHash,
       signaturePath,
     },
   })
   if (count === 0) {
     // Konkurrierender Sign? Re-Fetch
     const refetch = await repo.findByIdSimple(prisma, tenantId, input.id)
     if (!refetch) throw new WorkReportNotFoundError()
     if (refetch.status !== "DRAFT") throw new WorkReportAlreadySignedError()
     throw new WorkReportConflictError("Status changed concurrently during sign")
   }
   ```

6. **PDF generieren und persistieren**:
   - `const { storagePath: pdfPath } = await pdfService.generateSignedAndStore(prisma, tenantId, input.id, input.signatureDataUrl)`
   - `await repo.update(prisma, tenantId, input.id, { pdfUrl: pdfPath })`
   - Bei PDF-Fehler: `console.error(...)`, aber SIGNED-Status bleibt
     (PDF ist best-effort analog zu BillingDocument-Finalize). Der
     User kann später via `downloadPdf` Fresh-Render triggern.

7. **Audit-Log**:
   ```ts
   await auditLog.log(prisma, {
     tenantId,
     userId: audit?.userId,
     action: "sign",
     entityType: "work_report",
     entityId: input.id,
     entityName: existing.code,
     changes: null,
     metadata: {
       signerName: input.signerName,
       signerRole: input.signerRole,
       signerIpHash: ipHash,
       assignmentCount: existing.assignments.length,
       signatureBufferSize: buffer.length,
     },
     ipAddress: audit?.ipAddress,
     userAgent: audit?.userAgent,
   }).catch(err => console.error('[AuditLog] Failed:', err))
   ```

8. **Rückgabe**: Der aktualisierte `WorkReport` via
   `repo.findById(prisma, tenantId, input.id)`.

#### 4. Router-Procedure — `src/trpc/routers/workReports.ts`

```ts
const WORK_REPORTS_SIGN = permissionIdByKey("work_reports.sign")!

sign: tenantProcedure.use(requirePermission(WORK_REPORTS_SIGN))
  .input(z.object({
    id: z.string().uuid(),
    signerName: z.string().min(2).max(255),
    signerRole: z.string().min(2).max(100),
    signatureDataUrl: z.string().regex(/^data:image\/png;base64,/).max(2_000_000),
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      const result = await workReportService.sign(
        ctx.prisma, ctx.tenantId!, input,
        { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
      )
      return mapWorkReportToOutput(result)
    } catch (err) { handleServiceError(err) }
  }),
```

### Success Criteria

#### Automated Verification

- [x] Typecheck + Lint grün (`@types/react-signature-canvas@1.0.7`
      installiert; `react-signature-canvas@1.0.6` gepinnt — React-19 peer
      warning wird akzeptiert, die Class-Komponente funktioniert in
      jsdom-Tests und wird in Phase 8 Playwright-end-to-end verifiziert)
- [x] Unit:
      - `pnpm vitest run src/lib/services/__tests__/work-report-service-sign.unit.test.ts` — 15 tests
      - `pnpm vitest run src/components/work-reports/__tests__/signature-pad.test.tsx` — 9 tests
- [x] Integration-KRITISCH:
      `pnpm vitest run src/lib/services/__tests__/work-report-service-sign.integration.test.ts` — 6 tests (inkl. Race-Condition)

#### Manual Verification

- [ ] Sign-Call via tRPC-Playground mit manuellem Base64-PNG-String
      setzt Status auf SIGNED
- [ ] `pdfUrl` ist in der DB-Row gesetzt
- [ ] Signatur-PNG im Bucket unter
      `{tenantId}/{workReportId}-{uuid}.png` vorhanden
- [ ] PDF-Download der SIGNED-Version zeigt Signatur sichtbar
- [ ] Folge-Update auf SIGNED-Record schlägt mit `BAD_REQUEST`

### Unit Tests

- **`work-report-service-sign.unit.test.ts`** (Prisma gemockt):
  - Fehlende workDescription → `WorkReportValidationError`
  - 0 Assignments → `WorkReportValidationError`
  - Leerer `signatureDataUrl` → Zod-Reject (Router-Ebene, aber Service
    wirft zusätzlich `ValidationError` auf kaputtem Prefix)
  - Base64 > 1 MB (Buffer-Länge) → `WorkReportValidationError`
  - `signerName = "a"` (nur 1 Zeichen) → Zod-Reject
  - Status bereits SIGNED (Pre-Fetch) → `WorkReportAlreadySignedError`
  - `hashField` wird mit `audit.ipAddress` aufgerufen wenn gesetzt
- **`signature-pad.test.tsx`** (React-Testing-Library):
  - Mount rendert Canvas-Element
  - `ref.current.isEmpty()` initial `true`
  - `ref.current.toPng()` bei leerem Canvas → `null`
  - Clear-Button triggert `clear()`
  - (Hinweis: Canvas-Drawing lässt sich in JSDom nicht simulieren;
    der volle Pen-Flow wird in Phase 8 via Playwright getestet)

### Integration Tests — KRITISCH

- **`work-report-service-sign.integration.test.ts`** (echte DB +
  echter Storage-Bucket):
  1. **Happy-Path**: Seed DRAFT + workDescription + 1 Assignment →
     `sign()` mit gültigem Base64-PNG → Status ist SIGNED, `signedAt`
     gesetzt, `signedById` = userId, `signerIpHash` ist Non-Empty-
     String, `signaturePath` = `${tenantId}/${id}.png`, `pdfUrl` ist
     gesetzt, Storage-GET auf `workreport-signatures` liefert
     denselben Buffer, Storage-GET auf `documents/arbeitsscheine/…pdf`
     liefert PDF-Buffer (>1 KB, `%PDF`-Header)
  2. **Audit-Row**: genau eine Row mit `action: "sign"` +
     `metadata.assignmentCount === 1`
  3. **Pflichtfeld-Validation**: Seed ohne workDescription → `sign`
     schlägt mit ValidationError, Status bleibt DRAFT, kein Upload
  4. **Race-Condition (KRITISCH)**: Seed DRAFT + Vorbedingungen →
     `Promise.all([sign(A), sign(B)])` wobei A und B unterschiedliche
     `signerName` und unterschiedliche `signatureDataUrl` (distinct
     byte content) verwenden. Genau einer gewinnt (Promise resolved),
     der andere rejected mit `WorkReportAlreadySignedError` oder
     `WorkReportConflictError` (`err.name` wird auf beide Varianten
     geprüft). DB-Status ist SIGNED. Nur **ein** Bucket-Objekt
     existiert (Storage-Listing hat Count 1) — das gehört zum
     gewinnenden Call, identifizierbar über `signerName` und
     über den Signatur-Buffer-Vergleich (SHA256-Hash).

     Hinweis: Wegen `upsert: true` beim Signatur-Upload ist ein
     Bucket-Doppel-Write theoretisch möglich, falls A hochlädt, B
     überschreibt, aber nur A's `updateMany` gewinnt. Der Test muss
     dies dokumentieren und die finale Signatur-Datei mit
     `signatureHash-der-DB-Metadaten` abgleichen. Absicherung:
     Signatur-Upload kommt in Schritt 3 VOR dem atomic updateMany —
     wenn A's updateMany gewinnt, aber B's Upload später
     abgeschlossen wurde, dann hat der Bucket B's Bytes, aber die DB
     speichert A's signerName. Dies ist inkonsistent und muss durch
     eine Sicherung abgefangen werden:
     → **Designentscheidung in Phase 6**: Signatur-Upload nutzt
     `upsert: false` (nicht `true`) auf neuen Pfad
     `${tenantId}/${id}-${uuid}.png`, plus Cleanup der Verlierer-Datei
     in der Catch-Logic des Race-Verlierers. Der DB-signaturePath
     zeigt auf die Gewinner-Datei. Test verifiziert diese
     Konsistenz explizit.
  5. **PDF-Rendering enthält Signatur**: SHA256 des `<Image>`-Bytes
     im rendered PDF matcht SHA256 des Upload-Buffers (via
     `pdf-parse`-Bild-Extraction)
  6. **Permission-Gate**: User mit `manage` aber ohne `sign` →
     Router-Call liefert `FORBIDDEN`

### Browser E2E

— (keine UI-Integration in dieser Phase — Canvas-Flow wird Phase 8
abgedeckt)

**Implementation Note**: Pause nach Phase 6 — besonders kritisch,
weil Race-Condition-Test der einzige ist, der die Sign-Logik
tatsächlich validiert.

---

## Phase 7: VOID-Flow

### Overview

SIGNED → VOID Transition. Signierte PDF bleibt im Storage (rechtliche
Archivierung); zusätzliches Overlay-Render on-Demand.

### Changes Required

#### 1. Service-Method — `src/lib/services/work-report-service.ts`

Neue Error-Klasse:
```ts
export class WorkReportAlreadyVoidedError extends Error {
  constructor() { super("WorkReport is already voided"); this.name = "WorkReportConflictError" }
}
```

Neue Signatur:
```ts
export async function voidReport(
  prisma: PrismaClient, tenantId: string,
  input: { id: string; reason: string },
  audit?: AuditContext,
): Promise<...>
```

Ablauf:
1. **Pflichtfeld-Validierung**: `input.reason.trim().length >= 10`
2. **Pre-Fetch**: `existing = repo.findByIdSimple(prisma, tenantId, input.id)`
3. Wenn `null` → `WorkReportNotFoundError`
4. Wenn `existing.status === "DRAFT"` →
   `WorkReportValidationError("Nur signierte Arbeitsscheine können storniert werden")`
5. Wenn `existing.status === "VOID"` → `WorkReportAlreadyVoidedError`
6. **Atomic SIGNED→VOID**:
   ```ts
   const { count } = await prisma.workReport.updateMany({
     where: { id, tenantId, status: "SIGNED" },
     data: {
       status: "VOID",
       voidedAt: new Date(),
       voidedById: audit?.userId ?? null,
       voidReason: input.reason.trim(),
     },
   })
   if (count === 0) { /* Re-fetch + passende Errors wie bei sign() */ }
   ```
7. **Audit**: `action: "void"`, `entityType: "work_report"`,
   `entityId: id`, `entityName: existing.code`,
   `metadata: { reason: input.reason }`
8. **Rückgabe**: aktualisierter Record via `repo.findById(...)`

#### 2. PDF-Service — `src/lib/services/work-report-pdf-service.ts`

```ts
export async function generateVoidedOverlay(
  prisma: PrismaClient, tenantId: string, workReportId: string,
): Promise<{ signedUrl: string; filename: string }>
```

Logik:
- Lädt den WorkReport inkl. SIGNED-Metadaten + Signatur-PNG aus
  Bucket
- Baut `props.status = "VOID"` (triggert Overlay-Rendering in
  `WorkReportPdf`)
- Rendert frisch, lädt in einen temporären Pfad
  `arbeitsscheine/{tenantId}/{workReportId}.voided.pdf` (NICHT in
  der DB gespeichert als `pdfUrl`, das bleibt auf der archivierten
  SIGNED-Version), oder returniert per In-Memory-Signed-URL via
  `storage.upload` mit `upsert: true`
- Signed-URL hat kurze Expiry (60s)

Alternative Entscheidung: Nicht in Storage ablegen, sondern direkten
PDF-Response via `response.send(buffer)` im tRPC-Handler — geht aber
am etablierten Pattern vorbei. Wir nutzen Storage-Path mit
`upsert: true` für Konsistenz.

#### 3. Router — `src/trpc/routers/workReports.ts`

```ts
const WORK_REPORTS_VOID = permissionIdByKey("work_reports.void")!

void: tenantProcedure.use(requirePermission(WORK_REPORTS_VOID))
  .input(z.object({
    id: z.string().uuid(),
    reason: z.string().min(10).max(2000),
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      const result = await workReportService.voidReport(
        ctx.prisma, ctx.tenantId!, input,
        { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent },
      )
      return mapWorkReportToOutput(result)
    } catch (err) { handleServiceError(err) }
  }),
```

`downloadPdf` wird aus Phase 5 aktualisiert: VOID-Branch ruft jetzt
`generateVoidedOverlay` auf (war in Phase 5 als Stub vorgesehen).

### Success Criteria

#### Automated Verification

- [x] Typecheck + Lint grün (keine neuen Errors gegenüber Baseline)
- [x] Unit:
      `pnpm vitest run src/lib/services/__tests__/work-report-service-void.unit.test.ts` — 13 Tests grün
- [x] Integration:
      `pnpm vitest run src/lib/services/__tests__/work-report-service-void.integration.test.ts` — 8 Tests grün (inkl. Race-Condition + Overlay-PDF)

#### Manual Verification

- [ ] Void-Action auf DRAFT schlägt mit `BAD_REQUEST`
- [ ] Void-Action auf SIGNED setzt Status + Reason + Timestamp
- [ ] Folge-`downloadPdf` liefert PDF mit sichtbarem Storno-
      Diagonalstempel
- [ ] Archivierte SIGNED-PDF bleibt unter dem Originalpfad (Storage-
      Check via Supabase-Dashboard)
- [ ] User mit `manage` aber ohne `void` Permission sieht `FORBIDDEN`

### Unit Tests

- Reason < 10 Zeichen → `WorkReportValidationError`
- Status = DRAFT → `WorkReportValidationError("Nur signierte …")`
- Status = VOID → `WorkReportAlreadyVoidedError`
- Race-Condition: zwei parallele `voidReport`-Calls → einer gewinnt

### Integration Tests

- Seed SIGNED → `voidReport` erfolgreich → DB-Felder korrekt gesetzt
- Seed SIGNED → `voidReport` → `generateVoidedOverlay` liefert
  Signed-URL; Download liefert PDF mit "STORNIERT"-Text (via
  Buffer-Scan oder pdf-parse)
- Archivierte PDF existiert weiter unter
  `arbeitsscheine/{tenantId}/{id}.pdf` nach Void
- Permission-Separation: User mit `manage` aber ohne `void` →
  `FORBIDDEN`

### Browser E2E

— (keine UI in dieser Phase)

**Implementation Note**: Pause nach Phase 7.

---

## Phase 8: Desktop-UI + Handbuch + Browser-E2E

### Overview

Vollständiger UI-Bau: Liste, Detail, Create/Edit-Sheet, Signatur-
Dialog, Void-Dialog, Integration als Tab in Order- und ServiceObject-
Detail-Seiten. Handbuch-Abschnitt. Playwright-E2E-Spec mit Happy-Path
und zwei Error-Cases.

### Changes Required

#### 1. Hooks — `src/hooks/use-work-reports.ts` (NEU)

Exports (nach Muster von `use-service-objects.ts`):

```ts
export function useWorkReports(params, enabled)
export function useWorkReport(id, enabled)
export function useWorkReportsByOrder(orderId, enabled)
export function useWorkReportsByServiceObject(serviceObjectId, enabled)

export function useCreateWorkReport()   // invalidates list + byOrder + byServiceObject
export function useUpdateWorkReport()   // invalidates list + getById + byOrder + byServiceObject
export function useDeleteWorkReport()   // invalidates all four

export function useWorkReportAssignments(workReportId, enabled)
export function useAddWorkReportAssignment()    // invalidates assignments + getById
export function useRemoveWorkReportAssignment() // same

export function useWorkReportAttachments(workReportId, enabled)
export function useGetWorkReportAttachmentUploadUrl()
export function useConfirmWorkReportAttachmentUpload()  // invalidates attachments
export function useGetWorkReportAttachmentDownloadUrl()
export function useRemoveWorkReportAttachment()  // invalidates attachments

export function useSignWorkReport()  // invalidates list + getById (Status-Wechsel)
export function useVoidWorkReport()  // invalidates list + getById
export function useDownloadWorkReportPdf()  // no invalidation, returns signed URL
```

Ergänzung in `src/hooks/index.ts` (Barrel-Export).

#### 2. List-Seite — `src/app/[locale]/(dashboard)/admin/work-reports/page.tsx` (NEU)

Struktur nach `admin/orders/page.tsx`:
- `<h1>` + `<p>` als Title-Block
- `<Button onClick={navigate('/work-reports/new')}>` mit Plus-Icon
- `<Tabs value={statusFilter} onValueChange={...}>` mit 4 Tabs:
  "Alle" / "Entwurf" / "Signiert" / "Storniert" (URL-driven wie
  `serviceobjects/schedules/page.tsx`)
- `<Card><CardContent className="p-0">` → `<WorkReportsDataTable>`
- `<Pagination>` am Boden (Server-Side)

Tabellen-Spalten: Code, Einsatzdatum, Auftrag (Code+Name), Kunde,
Serviceobjekt, Status-Badge, Aktionen (View / Edit (nur DRAFT) /
Delete (nur DRAFT)).

#### 3. Neu-Seite — `src/app/[locale]/(dashboard)/admin/work-reports/new/page.tsx` (NEU)

Kleines Formular für Create-Felder (orderId Picker, serviceObjectId
Picker, visitDate, travelMinutes, initial workDescription). Nach
Submit Navigation zur Detail-Seite im Edit-Mode.

#### 4. Detail-Seite — `src/app/[locale]/(dashboard)/admin/work-reports/[id]/page.tsx` (NEU)

Header mit Back-Button + Code + Status-Badge + Aktionen:
- "Bearbeiten" (nur DRAFT)
- "PDF herunterladen" (alle Status)
- "Signieren" (nur DRAFT, und nur wenn `hasPermission("work_reports.sign")`)
- "Stornieren" (nur SIGNED, und nur wenn `hasPermission("work_reports.void")`)
- "Löschen" (nur DRAFT)

Tabs (4):
1. **Details** — Card-Grid mit DetailRows (Einsatzdatum, Anfahrt-
   Minuten, workDescription, Auftrag-Ref, ServiceObject-Ref, Created-/
   Signed-/Voided-Meta)
2. **Mitarbeiter** — Liste der Assignments + Add-Button
   (`EmployeePicker` + optional Role-Input) — disabled wenn Status
   !== DRAFT
3. **Fotos** — `AttachmentUploader` + Grid von `AttachmentCard`s;
   Upload-Button disabled wenn Status !== DRAFT; Delete-Action
   disabled gleich
4. **Audit** — Read-Only-Liste aus `auditLogs.listByEntity` für
   `entityType: "work_report"` (Fallback: komplett ausgegraut wenn
   keine Permission)

#### 5. Sheet/Dialog-Komponenten

**`src/components/work-reports/work-report-form-sheet.tsx`** (NEU):
- Sheet analog `OrderFormSheet` (Create + Edit gleichzeitig)
- Felder: Auftrag (Picker, required), Serviceobjekt (Picker,
  optional), Einsatzdatum (DatePicker, required), Anfahrt-Minuten
  (NumberInput, optional), Arbeitsbeschreibung (Textarea, optional)

**`src/components/work-reports/signature-dialog.tsx`** (NEU):
- Sheet (side="right", max-w-2xl)
- ScrollArea mit:
  - Kurz-Summary des WorkReports (Code, Einsatzdatum, Auftrag-Ref)
  - Pflicht-Checks-Panel (zeigt Rot wenn Description leer ist oder
    0 Assignments, verhindert Sign-Submit)
  - Input-Felder: `signerName` (required), `signerRole` (required)
  - `<SignaturePad ref={...}>` Component
  - Hinweis-Text: „Mit dem Klick auf 'Signieren' bestätigen Sie, dass
    der Arbeitsschein korrekt ist. Nach dem Signieren kann der
    Arbeitsschein nicht mehr bearbeitet werden."
- Footer: Cancel + "Signieren"-Button (disabled wenn Felder leer oder
  Canvas leer)
- `onSubmit` → `useSignWorkReport().mutateAsync({ id, signerName, signerRole, signatureDataUrl: padRef.current!.toPng()! })`
- onSuccess: Sheet schließt, Status-Invalidation

**`src/components/work-reports/void-dialog.tsx`** (NEU):
- Dialog (nicht Sheet, da einfacheres Formular)
- Alert-Warnung „Achtung: Dies storniert den signierten
  Arbeitsschein. Die archivierte PDF bleibt erhalten."
- Textarea `reason` (required, min 10)
- Footer: Cancel + "Stornieren" (variant="destructive")
- onSubmit → `useVoidWorkReport().mutateAsync({ id, reason })`

**`src/components/work-reports/work-report-status-badge.tsx`** (NEU):
- Kleiner Helper analog `OrderStatusBadge`
- DRAFT: `<Badge variant="secondary">Entwurf</Badge>`
- SIGNED: `<Badge variant="default">Signiert</Badge>` (Haken-Icon)
- VOID: `<Badge variant="destructive">Storniert</Badge>`

#### 6. Integration in bestehenden Pages

**`src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`**:
- Ein neuer `<TabsTrigger value="workreports">` zwischen
  "assignments" und "bookings"
- Neuer `<TabsContent value="workreports" className="mt-6 space-y-4">`
  mit Card → Liste via `useWorkReportsByOrder(orderId)` + "Neu"-
  Button → navigiert zu `/work-reports/new?orderId=...`

**`src/app/[locale]/(dashboard)/serviceobjects/[id]/page.tsx`**:
- Analog: neuer Tab `workreports` zwischen `history` und `schedule`
- Liste via `useWorkReportsByServiceObject(id, limit=20)`

#### 7. Handbuch — `docs/TERP_HANDBUCH.md`

Neuer Abschnitt **`## 12c. Arbeitsscheine — Mobile Einsatzdokumentation mit Signatur`**
zwischen §12b (Wartungspläne) und §13 (Belege & Fakturierung).

Struktur analog §12a (vollständige Einrückung, gleiche Emojis,
identische Listen-/Tabellen-Muster):

- **Opener-Block**: `**Was ist es?**` / `**Wozu dient es?**` / ⚠️
  Modul / ⚠️ Berechtigung / 📍 Navigation
- **12c.1 Lebenszyklus** — Tabellen-Darstellung der 3 Status
  (analog §12b.2 Status-Workflow-Tabelle), keine Diagramme
- **12c.2 Felder und Pflichtfelder** — Tabelle (Feld | Beschreibung |
  Pflicht-ab-Status)
- **12c.3 Permissions** — Tabelle (Permission-Key | Default-Gruppen)
- **12c.4 Praxisbeispiel: Arbeitsschein vor Ort erfassen** —
  nummerierte Schritte mit 📍-Navigation-Hints und ✅-Ergebnis-
  Hinweisen, auf Desktop-Workflow bezogen
- **12c.5 Praxisbeispiel: Signatur erfassen und signieren**
- **12c.6 Praxisbeispiel: Signierten Arbeitsschein stornieren**
- **12c.7 Technische Integration**: Beziehungen zu Order,
  ServiceObject, WhStockMovement (Schema-Only in M-1), AuditLog —
  mit 💡-Unter-der-Haube-Callouts wie in §12a
- **12c.8 Dateien und Storage**: Tabelle der 3 Buckets (Name | Pfad-
  Konvention | MIME | Zweck)
- **12c.9 PDF-Archivierung und GoBD**: einmalige Signatur,
  unveränderliche PDF, 10 Jahre
- **12c.10 Offene Erweiterungen**: expliziter Hinweis auf M-2
  (Mobile-UX) und M-3 (Offline) als kommende Phasen

**Vorgehen bei Erstellung**:
1. Vor dem Schreiben: §12a (Zeile 5637-5921) und §22 (Zeile 11110-
   12227) vollständig lesen
2. Tonalität (Sie-Form), Hierarchie (H2 → H3 → H4), Praxisbeispiel-
   Struktur (nummerierte Schritte mit 📍/✅/⚠️/💡) exakt übernehmen
3. Keine Mermaid-Diagramme (konsistent mit Rest des Handbuchs)
4. TOC-Eintrag in `## Inhaltsverzeichnis` (Zeile 12) einfügen mit
   Nested-Sub-Items

#### 8. Browser-E2E — `src/e2e-browser/84-workreport-arbeitsschein.spec.ts` (NEU)

Neue Spec-Datei, Namens-Konvention: `84-` kommt als nächste nach
`83-service-object-schedules.spec.ts`.

Helper-Datei: **`src/e2e-browser/helpers/work-report-fixtures.ts`** (NEU)
— `resetWorkReports`, `createDraftWorkReport` (inline SQL), Setup-
Helper wie in `service-object-fixtures.ts`.

Import:
```ts
import { test, expect } from "@playwright/test"
import { navigateTo } from "./helpers/nav"
import {
  resetWorkReports, ensureSeedOrder, ensureSeedServiceObject,
  createDraftWorkReport, exists, disconnect,
} from "./helpers/work-report-fixtures"
import { loginAsUser } from "./helpers/auth"
```

Happy-Path-Test:
```ts
test.describe.serial("WorkReport — Arbeitsschein (M-1)", () => {
  test.beforeAll(async () => { await resetWorkReports(); await ensureSeedOrder(); await ensureSeedServiceObject() })
  test.afterAll(async () => { await resetWorkReports(); await disconnect() })

  test("Happy-Path: create → attachments → assignments → sign → PDF", async ({ page }) => {
    await navigateTo(page, "/orders/{seedOrderId}")
    await page.getByRole("tab", { name: "Arbeitsscheine" }).click()
    await page.getByRole("button", { name: /Neu/ }).click()
    // Fill date, description
    await page.locator("#visitDate").fill("2026-04-22")
    await page.locator("#workDescription").fill("Filter gewechselt, Dichtung erneuert")
    await submitSheet(page)
    await expect(page.getByText(/AS-\d+/)).toBeVisible()
    // Upload photo
    await page.getByRole("tab", { name: "Fotos" }).click()
    await page.setInputFiles('input[type="file"]', {
      name: "foto.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, /* minimal JPEG header */]),
    })
    // Wait for upload complete
    await expect(page.getByText("foto.jpg")).toBeVisible()
    // Add 2 assignments
    await page.getByRole("tab", { name: "Mitarbeiter" }).click()
    await page.getByRole("button", { name: /Mitarbeiter hinzufügen/ }).click()
    // EmployeePicker interactions...
    // Sign
    await page.getByRole("button", { name: /Signieren/ }).click()
    await page.locator("#signerName").fill("Max Müller")
    await page.locator("#signerRole").fill("Werkmeister")
    // Canvas-Drawing via mouse.move/down/up
    const canvas = page.locator("canvas").first()
    const box = await canvas.boundingBox()
    await page.mouse.move(box!.x + 20, box!.y + 50)
    await page.mouse.down()
    await page.mouse.move(box!.x + 150, box!.y + 80)
    await page.mouse.move(box!.x + 280, box!.y + 60)
    await page.mouse.up()
    // Submit
    await page.getByRole("button", { name: /^Signieren$/ }).click()
    // Assertion
    await expect(page.getByText("Signiert")).toBeVisible()
    await expect(page.getByRole("button", { name: /PDF herunterladen/ })).toBeEnabled()
    // Reload persistence check
    await page.reload()
    await expect(page.getByText("Signiert")).toBeVisible()
  })

  test("Error: Sign ohne Assignment wirft Toast-Error", async ({ page }) => {
    // Seed via fixture a DRAFT with description but 0 assignments
    const id = await createDraftWorkReport({ withAssignment: false })
    await navigateTo(page, `/work-reports/${id}`)
    await page.getByRole("button", { name: /Signieren/ }).click()
    // Dialog bleibt offen, Error-Toast sichtbar
    await expect(page.getByText(/Mindestens ein Mitarbeiter/)).toBeVisible()
    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })

  test("Error: User ohne void-Permission sieht Storno-Button nicht", async ({ page }) => {
    // Switch to a non-admin user fixture
    await loginAsUser(page) // role without work_reports.void
    // Seed SIGNED
    const id = await createDraftWorkReport({ withAssignment: true, signed: true })
    await navigateTo(page, `/work-reports/${id}`)
    await expect(page.getByRole("button", { name: /Stornieren/ })).not.toBeVisible()
  })
})
```

Die Fixture `createDraftWorkReport` seedet direkt via SQL, nicht via
UI (analog `service-object-fixtures.ts:createOrderForServiceObject`).

### Success Criteria

#### Automated Verification

- [x] Typecheck grün (keine neuen Errors gegenüber Baseline):
      `pnpm typecheck` — alle work-report-Dateien sauber; verbleibende
      Errors sind pre-existing (scripts/generate-camt-test-fixture.ts,
      bankStatements-router.test.ts, bankStatements.ts,
      scanner-terminal.tsx)
- [x] Lint grün für alle neuen WorkReport-Dateien:
      `pnpm eslint src/hooks/use-work-reports.ts src/components/work-reports/ src/app/[locale]/(dashboard)/admin/work-reports/ src/e2e-browser/84-workreport-arbeitsschein.spec.ts src/e2e-browser/helpers/work-report-fixtures.ts` — EXIT 0
- [x] Unit-Tests grün (Phase 2–7, keine Regression):
      `pnpm vitest run src/lib/services/__tests__/work-report-service.unit.test.ts src/lib/services/__tests__/work-report-service-sign.unit.test.ts src/lib/services/__tests__/work-report-service-void.unit.test.ts src/lib/services/__tests__/work-report-assignment-service.unit.test.ts src/lib/services/__tests__/work-report-attachment-service.unit.test.ts` — 83 tests grün
- [x] Signature-Pad-Test grün:
      `pnpm vitest run src/components/work-reports/__tests__/signature-pad.test.tsx` — 9 tests grün
- [ ] Browser-E2E grün:
      `pnpm playwright test src/e2e-browser/84-workreport-arbeitsschein.spec.ts`
      (erwartet lokalen Supabase + dev server)
- [ ] Gesamter E2E-Lauf grün (keine Regression):
      `pnpm playwright test`

#### Manual Verification

- [ ] Vollständiger UI-Flow auf Desktop (1280x1080) — Create → Edit
      → Fotos → Mitarbeiter → Sign → PDF öffnen → Void → PDF mit
      Stempel
- [ ] Handbuch-Abschnitt §12c liest sich konsistent zu §12a/§22 (Sie-
      Form, Emojis, Praxisbeispiele step-by-step clickable)
- [ ] Integration in Order-Detail und ServiceObject-Detail: neuer Tab
      „Arbeitsscheine" mit funktionierender Liste
- [ ] Status-Badges korrekt: DRAFT grau, SIGNED grün, VOID rot
- [ ] Keine ESLint-Warnings in neuen Files
- [ ] PDF-Download-Link im Browser öffnet PDF (nicht Download)

### Unit Tests

- **`signature-dialog.test.tsx`** (React-Testing-Library):
  - Render: signerName + signerRole sind Pflichtfelder
  - Button "Signieren" disabled initial (leerer Name + leere Role)
  - Mit ausgefüllten Text-Feldern + Canvas-leer → disabled
  - Validation-Panel zeigt Fehler wenn Pflicht-Checks fail
- **`void-dialog.test.tsx`**:
  - Reason min 10 Zeichen wird clientseitig gegen Zod validiert
  - Submit-Button disabled bei <10 Zeichen

### Integration Tests

— (Abdeckung bereits durch Phase 2-7 erreicht)

### Browser E2E

- **`84-workreport-arbeitsschein.spec.ts`**:
  - **Happy-Path** (wie oben): Create → Foto-Upload → 2 Assignments
    → Canvas-Sign → PDF-Download verfügbar → Reload-Persistenz
  - **Error-Case 1**: Sign-Versuch ohne Assignment → Dialog bleibt
    offen, Error-Toast sichtbar
  - **Error-Case 2**: User-Role ohne `work_reports.void` sieht
    Void-Button nicht (Role-Switching via `loginAsUser`)
  - Cleanup via `resetWorkReports()` im `afterAll`
- Global-Setup ergänzt um WorkReport-Delete-Prefixes in
  `src/e2e-browser/global-setup.ts`:
  ```sql
  DELETE FROM work_reports WHERE code LIKE 'AS-%';
  ```

**Implementation Note**: Abschluss-Phase. Nach grünen Tests User-
Freigabe für Merge zu Staging.

---

## Testing Strategy (Gesamt-Zusammenfassung)

Drei Test-Ebenen pro Phase, verbindlich:

**Unit (Vitest, ~100 ms/Test)**:
- Pure Service-Logic mit Prisma-Mocks
- Zod-Schema-Validation-Checks
- React-Component-Tests mit `@testing-library/react`
- Schnell, deterministisch, kein I/O

**Integration (Vitest gegen lokale Supabase-Postgres-Dev-DB,
~500 ms/Test)**:
- DB-Constraints (Unique, FK, Cascade)
- Atomare Status-Transitions (Race-Conditions)
- Storage-Integration (echter Supabase-Admin-Client)
- Transaction-Rollback-Isolation zwischen Tests
- **Kritisch** für Phase 6 (Sign) — Race-Condition muss in
  Integration, nicht Unit getestet werden

**Browser-E2E (Playwright, ~10-30 s/Test)**:
- Nur Phase 8
- Vollständige UI-Flows, inkl. Canvas-Drawing via `page.mouse.*`
- `describe.serial`, `workers: 1`
- Fixture-Cleanup via direktem pg (kein transaktions-basierter
  Rollback im Browser möglich)

Pro Phase-Abschluss prüft die Verification-Pause:
(a) neue Unit-Tests grün,
(b) neue Integration-Tests grün,
(c) vorhandene Test-Suites (alle Vitest + alle Playwright) weiter
    grün — keine Regressionen zum Baseline.

## Performance Considerations

- **PDF-Rendering ist synchron** (`renderToBuffer`) im HTTP-Request —
  übliches Pattern für alle Terp-PDFs. Bei DRAFT-Downloads akzeptabel,
  weil Einzel-Record und kein Bulk-Trigger.
- **Signatur-PNG ≤ 1 MB** — Base64-Overhead ca. 33 %, d.h.
  Request-Body kann auf 1.4 MB kommen. Next.js/tRPC-Defaults erlauben
  4 MB, also unkritisch. Zod-Max auf `2_000_000` als zusätzliche
  Guard.
- **Upload-Concurrency auf gleichen Bucket-Path** — durch Random-UUID-
  Dateinamen ausgeschlossen bei Attachments, durch
  Race-Resolution-Pattern bei Signaturen (siehe Phase 6).
- **Indexe**: Alle Query-Pfade (`tenantId+status`, `tenantId+orderId`,
  `tenantId+serviceObjectId`, `tenantId+visitDate`) sind mit B-Tree-
  Indexes abgedeckt. Keine Full-Table-Scans erwartet.
- **Cascade-Delete**: `DELETE FROM work_reports WHERE id = ?` löscht
  Assignments + Attachments automatisch. Bei großen Assignments-
  Listen (100+) bleibt O(n) an PG-Side, wird aber als atomare Row-
  Cascade optimiert.

## Migration Notes

Keine bestehenden Daten zu migrieren — `WorkReport` ist ein
komplett neues Feature. Existierende Orders bleiben unberührt,
keine Back-Fill-Logik nötig.

`WhStockMovement.workReportId` bleibt NULL für alle existierenden
Stock-Movements (Default, kein Back-Fill).

Rollback-Strategie: Die drei Migrationen (Schema, Buckets,
Permissions) sind in umgekehrter Reihenfolge reversierbar:
1. User-Groups: Permissions manuell aus JSONB entfernen (SQL-Skript
   im Rollback-Kommentar)
2. Buckets: `DELETE FROM storage.buckets WHERE id IN (...)` plus
   Manual-Cleanup der Objekte
3. Schema: `DROP TABLE work_report_attachments`,
   `DROP TABLE work_report_assignments`, `ALTER TABLE
   wh_stock_movements DROP COLUMN work_report_id`,
   `DROP TABLE work_reports`, `DROP TYPE work_report_status`.

Rollback wird nicht automatisiert, weil Post-Sign-Daten rechtlich
nicht einfach verworfen werden dürfen. Stattdessen: Feature via
Permission-Entzug deaktivieren, Daten in-place belassen.

## References

- **Research-Dokument (verbindliche Baseline)**:
  `thoughts/shared/research/2026-04-22-workreport-arbeitsschein-m1-codebase-analyse.md`
- **Ticket/Auftragsbeschreibung**: User-Input zum
  `/create_plan`-Call vom 2026-04-22
- **Analoge Tickets (Kontext, nicht implementiert)**:
  - `thoughts/shared/tickets/ZMI-TICKET-154-digitale-unterschriften.md`
  - `thoughts/shared/tickets/ZMI-TICKET-153-abnahmeprotokoll.md`
  - `thoughts/shared/tickets/ZMI-TICKET-152-regiebericht.md`
  - `thoughts/shared/tickets/ZMI-TICKET-151-bautagesbericht.md`
- **Vorgänger-Pläne (T-1/T-2/T-3)**:
  - `thoughts/shared/plans/2026-04-21-serviceobjekte-stammdaten.md`
  - `thoughts/shared/plans/2026-04-21-serviceobjekte-historie.md`
  - `thoughts/shared/plans/2026-04-22-serviceobjekte-wartungsintervalle.md`
- **Pattern-Referenzen im Codebase**:
  - Atomic-DRAFT-Guard: `src/lib/services/billing-document-service.ts:82-88,427-442,537-590`
  - 3-Step-Upload: `src/lib/services/service-object-attachment-service.ts:105-206`
  - PDF-Pipeline: `src/lib/services/billing-document-pdf-service.ts:29-130`
  - Signatur-Block im PDF: `src/lib/pdf/purchase-order-pdf.tsx:194-201`
  - Permission-Catalog: `src/lib/auth/permission-catalog.ts:28,44,440-445`
  - Numbering-Service: `src/lib/services/number-sequence-service.ts:37-105`
  - OrderAssignment-Pattern: `src/lib/services/order-assignment-service.ts:83,132,188`
  - E2E-Helper-Pattern: `src/e2e-browser/helpers/service-object-fixtures.ts`
  - Handbuch-Stil: `docs/TERP_HANDBUCH.md:5637-5921` (§12a), `:11110-12227` (§22)

## Known Open Decision (Phase 1 Review)

**Ticket sagt "WhWithdrawal", Schema hat nur "WhStockMovement"**.
Die Implementation im Plan fügt `workReportId` auf `WhStockMovement`
hinzu (die Tabelle, die Withdrawals als `type: "WITHDRAWAL"`-Rows
enthält). Bei Plan-Review bitte bestätigen oder korrigieren. Falls
eine separate `WhWithdrawal`-Tabelle beabsichtigt ist, die es noch
nicht gibt, wäre das ein zusätzliches Phase-0-Ticket vor M-1 (wird
aber nicht empfohlen, weil die generische Stock-Movement-Tabelle
den Zweck heute bereits abdeckt).
