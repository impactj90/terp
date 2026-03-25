# HR_01 — Personalakte mit Anhängen

| Field | Value |
|-------|-------|
| **Module** | HR / Personal |
| **Dependencies** | Employees (Mitarbeiterstamm) |
| **Complexity** | L |
| **Priority** | Mittlere Priorität |
| **New Models** | `HrPersonnelFileCategory`, `HrPersonnelFileEntry`, `HrPersonnelFileAttachment` |

---

## ZMI-Referenz

ZMI Time Kap. 4.14: Vollständige Personalakte mit Aktengruppen, Dateianhängen, Rechtesteuerung und Wiedervorlagefunktion. Kategorien z.B.: Prüfungen, Zertifikate, Sonderführerscheine, Abmahnungen, Verträge. Anhänge können Dateien oder Verzeichnisverweise sein.

---

## Terp aktuell

- Keine Personalakte vorhanden
- Mitarbeiterdaten beschränken sich auf Kontaktdaten, Vertrag, Tarif
- Zertifikate, Prüfungen, Abmahnungen können nicht hinterlegt werden
- Keine Möglichkeit, HR-Dokumente pro Mitarbeiter zu archivieren

---

## Goal

Ein vollständiges Personalakten-System implementieren. Kategorisierte Einträge pro Mitarbeiter mit Dateianhängen, optionaler Wiedervorlage und Rechtesteuerung pro Kategorie. Relevant für Industriebetriebe mit Sicherheitsunterweisung, Zertifikats- und Schulungsnachweisen.

---

## Prisma Models

### HrPersonnelFileCategory

```prisma
model HrPersonnelFileCategory {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  name        String   // z.B. "Verträge", "Zertifikate", "Unterweisungen", "Abmahnungen"
  code        String   // z.B. "CONTRACTS", "CERTS", "SAFETY", "WARNINGS"
  description String?
  color       String?  // Hex-Farbe für UI
  sortOrder   Int      @default(0) @map("sort_order")
  isActive    Boolean  @default(true) @map("is_active")
  // Rechtesteuerung: Wer darf Einträge dieser Kategorie sehen?
  visibleToRoles String[] @default(["admin"]) @map("visible_to_roles")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant  Tenant                @relation(fields: [tenantId], references: [id])
  entries HrPersonnelFileEntry[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@map("hr_personnel_file_categories")
}
```

### HrPersonnelFileEntry

```prisma
model HrPersonnelFileEntry {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String    @map("tenant_id") @db.Uuid
  employeeId    String    @map("employee_id") @db.Uuid
  categoryId    String    @map("category_id") @db.Uuid
  title         String    // z.B. "Erstunterweisung Brandschutz", "Arbeitsvertrag 2024"
  description   String?
  entryDate     DateTime  @map("entry_date") @db.Date  // Datum des Vorfalls/Dokuments
  expiresAt     DateTime? @map("expires_at") @db.Date   // Ablaufdatum (z.B. Zertifikat gültig bis)
  reminderDate  DateTime? @map("reminder_date") @db.Date // Wiedervorlage
  reminderNote  String?   @map("reminder_note")
  isConfidential Boolean  @default(false) @map("is_confidential") // Besonders vertraulich
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?   @map("created_by_id") @db.Uuid

  tenant      Tenant                    @relation(fields: [tenantId], references: [id])
  employee    Employee                  @relation(fields: [employeeId], references: [id])
  category    HrPersonnelFileCategory   @relation(fields: [categoryId], references: [id])
  attachments HrPersonnelFileAttachment[]

  @@index([tenantId, employeeId])
  @@index([tenantId, categoryId])
  @@index([tenantId, reminderDate])
  @@index([tenantId, expiresAt])
  @@map("hr_personnel_file_entries")
}
```

### HrPersonnelFileAttachment

```prisma
model HrPersonnelFileAttachment {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  entryId     String   @map("entry_id") @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  filename    String
  storagePath String   @map("storage_path")
  mimeType    String   @map("mime_type")
  sizeBytes   Int      @map("size_bytes")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById String?  @map("created_by_id") @db.Uuid

  entry  HrPersonnelFileEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)
  tenant Tenant               @relation(fields: [tenantId], references: [id])

  @@index([entryId])
  @@map("hr_personnel_file_attachments")
}
```

---

## Supabase Storage

```
hr-personnel-files/{tenantId}/{employeeId}/{entryId}/{filename}
```

- Bucket: `hr-personnel-files` (private, authenticated access)
- Max. Dateigröße: 20 MB (größer als CRM, da Verträge/Scans)
- Erlaubte Formate: PDF, JPEG, PNG, WebP, DOCX, XLSX

---

## Permissions

```ts
p("hr_personnel_file.view", "hr_personnel_file", "view", "View personnel file entries"),
p("hr_personnel_file.create", "hr_personnel_file", "create", "Create personnel file entries"),
p("hr_personnel_file.edit", "hr_personnel_file", "edit", "Edit personnel file entries"),
p("hr_personnel_file.delete", "hr_personnel_file", "delete", "Delete personnel file entries"),
p("hr_personnel_file.view_confidential", "hr_personnel_file", "view_confidential", "View confidential entries"),
p("hr_personnel_file_categories.manage", "hr_personnel_file_categories", "manage", "Manage personnel file categories"),
```

---

## tRPC Router

**File:** `src/trpc/routers/hr/personnelFile.ts`

### Category Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `categories.list` | query | `hr_personnel_file.view` | `{}` | Alle Kategorien |
| `categories.create` | mutation | `hr_personnel_file_categories.manage` | `{ name, code, color?, visibleToRoles? }` | Neue Kategorie |
| `categories.update` | mutation | `hr_personnel_file_categories.manage` | `{ id, ...fields }` | Kategorie bearbeiten |
| `categories.delete` | mutation | `hr_personnel_file_categories.manage` | `{ id }` | Kategorie löschen (nur wenn leer) |

### Entry Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `entries.list` | query | `hr_personnel_file.view` | `{ employeeId, categoryId?, search?, page, pageSize }` | Alle Einträge eines MA |
| `entries.getById` | query | `hr_personnel_file.view` | `{ id }` | Einzelner Eintrag mit Anhängen |
| `entries.create` | mutation | `hr_personnel_file.create` | `{ employeeId, categoryId, title, ... }` | Neuer Eintrag |
| `entries.update` | mutation | `hr_personnel_file.edit` | `{ id, ...fields }` | Eintrag bearbeiten |
| `entries.delete` | mutation | `hr_personnel_file.delete` | `{ id }` | Eintrag löschen (mit Anhängen) |
| `entries.getReminders` | query | `hr_personnel_file.view` | `{ from?, to? }` | Fällige Wiedervorlagen |
| `entries.getExpiring` | query | `hr_personnel_file.view` | `{ withinDays: number }` | Bald ablaufende Einträge |

### Attachment Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `attachments.getUploadUrl` | mutation | `hr_personnel_file.create` | `{ entryId, filename, mimeType }` | Signed Upload URL |
| `attachments.confirm` | mutation | `hr_personnel_file.create` | `{ entryId, ... }` | Upload bestätigen |
| `attachments.delete` | mutation | `hr_personnel_file.delete` | `{ id }` | Anhang löschen |
| `attachments.getDownloadUrl` | query | `hr_personnel_file.view` | `{ id }` | Signed Download URL |

---

## Service Layer

**Files:**
- `src/lib/services/hr-personnel-file-service.ts`
- `src/lib/services/hr-personnel-file-repository.ts`

### Key Logic

#### Rechtesteuerung

```ts
export async function listEntries(prisma, tenantId, userId, employeeId, categoryId?) {
  // 1. Benutzerrolle laden
  // 2. Kategorien filtern: nur solche wo Benutzerrolle in visibleToRoles
  // 3. Vertrauliche Einträge nur mit hr_personnel_file.view_confidential Permission
  // 4. Einträge laden mit Kategorien- und Rollenfilter
}
```

#### Wiedervorlage

```ts
export async function getReminders(prisma, tenantId, from, to) {
  return prisma.hrPersonnelFileEntry.findMany({
    where: {
      tenantId,
      reminderDate: { gte: from, lte: to },
      // Kein Statusfilter — abgelaufene bleiben sichtbar
    },
    include: { employee: true, category: true },
    orderBy: { reminderDate: "asc" },
  })
}
```

#### Ablauf-Check

```ts
export async function getExpiringEntries(prisma, tenantId, withinDays = 30) {
  const deadline = addDays(new Date(), withinDays)
  return prisma.hrPersonnelFileEntry.findMany({
    where: {
      tenantId,
      expiresAt: { lte: deadline, gte: new Date() },
    },
    include: { employee: true, category: true },
    orderBy: { expiresAt: "asc" },
  })
}
```

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/hr/personnel-file` | `HrPersonnelFilePage` | Übersicht: Wiedervorlagen + ablaufende Einträge |
| `/hr/personnel-file/categories` | `HrPersonnelFileCategoriesPage` | Kategorienverwaltung |

### Mitarbeiterdetail — Tab "Personalakte"

**Component:** `src/components/hr/personnel-file-tab.tsx`

- Kategorie-Filter (Buttons oder Tabs)
- Einträge als Karten oder Tabelle:
  - Titel, Kategorie (Farbdot), Datum, Ablaufdatum (gelb/rot wenn bald/abgelaufen)
  - Anhänge-Icons (Büroklammer + Anzahl)
  - Vertraulich-Badge (Schloss-Icon)
- Button "Neuer Eintrag" → Formular-Dialog
- Such-/Filterfeld

### Eintrag-Detail Dialog

**Component:** `src/components/hr/personnel-file-entry-dialog.tsx`

- Kategorie (Dropdown)
- Titel (Pflicht)
- Beschreibung (optional, mehrzeilig)
- Datum des Vorfalls/Dokuments
- Ablaufdatum (optional)
- Wiedervorlage (optional, Datum + Notiz)
- Vertraulich (Checkbox)
- Anhänge (Drag & Drop, max. 10 Dateien)

### Dashboard-Widget

- Auf dem HR-Dashboard: Karte "Personalakte"
  - X fällige Wiedervorlagen
  - X ablaufende Zertifikate (nächste 30 Tage)

---

## Hooks

**File:** `src/hooks/use-hr-personnel-file.ts`

```ts
export function useHrPersonnelFileEntries(employeeId: string, categoryId?: string) { /* ... */ }
export function useHrPersonnelFileEntry(id: string) { /* ... */ }
export function useCreateHrPersonnelFileEntry() { /* ... */ }
export function useHrPersonnelFileReminders(dateRange?) { /* ... */ }
export function useHrPersonnelFileExpiring(withinDays?) { /* ... */ }
export function useHrPersonnelFileCategories() { /* ... */ }
```

---

## Default-Kategorien

Beim ersten Setup (Seed oder bei Tenant-Erstellung):

| Code | Name | Farbe | Beschreibung |
|------|------|-------|-------------|
| `CONTRACTS` | Verträge | #3B82F6 | Arbeitsverträge, Ergänzungen, Kündigungen |
| `CERTS` | Zertifikate & Qualifikationen | #10B981 | Schweißerscheine, Staplerschein, Ersthelfer |
| `SAFETY` | Unterweisungen | #F59E0B | Sicherheitsunterweisungen, Brandschutz |
| `WARNINGS` | Abmahnungen | #EF4444 | Abmahnungen, Verwarnungen |
| `TRAINING` | Weiterbildung | #8B5CF6 | Schulungen, Seminare |
| `MEDICAL` | Arbeitsmedizin | #06B6D4 | G-Untersuchungen, Eignungsnachweise |
| `OTHER` | Sonstiges | #6B7280 | Alle übrigen Dokumente |

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/hr-personnel-file-service.test.ts`

- `createEntry` — erstellt Eintrag mit korrekten Daten
- `createEntry` — validiert Mitarbeiter gehört zum Tenant
- `createEntry` — validiert Kategorie gehört zum Tenant
- `listEntries` — filtert nach Kategorie-Sichtbarkeit (visibleToRoles)
- `listEntries` — versteckt vertrauliche Einträge ohne view_confidential Permission
- `getReminders` — gibt Einträge mit fälligem reminderDate zurück
- `getExpiring` — gibt Einträge zurück die innerhalb X Tagen ablaufen
- `deleteEntry` — löscht Eintrag + Anhänge aus Storage

### Router Tests

**File:** `src/trpc/routers/__tests__/hrPersonnelFile-router.test.ts`

```ts
describe("hr.personnelFile", () => {
  it("entries.list — requires hr_personnel_file.view", async () => { })
  it("entries.create — creates entry with category", async () => { })
  it("entries.list — hides confidential entries without permission", async () => { })
  it("categories.create — requires manage permission", async () => { })
  it("entries.getReminders — returns due reminders", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("entries.list — Mandant A sieht keine Einträge von Mandant B", async () => { })
  it("entries.create — Mandant A kann keinen Eintrag für MA von Mandant B erstellen", async () => { })
  it("attachments — Mandant A kann keine Dateien von Mandant B herunterladen", async () => { })
  it("categories — Mandant A sieht keine Kategorien von Mandant B", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/59-hr-personnel-file.spec.ts`

```ts
test.describe("UC-HR-01: Personalakte", () => {
  test("Eintrag zur Personalakte hinzufügen", async ({ page }) => {
    // 1. Mitarbeiter öffnen → Tab "Personalakte"
    // 2. "Neuer Eintrag" → Kategorie, Titel, Datum, Datei hochladen
    // 3. Eintrag erscheint in Liste
  })

  test("Eintrag mit Ablaufdatum und Wiedervorlage", async ({ page }) => {
    // 1. Eintrag erstellen: Zertifikat mit Ablauf in 30 Tagen + Wiedervorlage in 7 Tagen
    // 2. HR-Dashboard prüfen: "1 ablaufendes Zertifikat"
  })

  test("Vertraulicher Eintrag nur mit Permission sichtbar", async ({ page }) => {
    // 1. Vertraulichen Eintrag erstellen (Abmahnung)
    // 2. Als User ohne view_confidential: Eintrag nicht sichtbar
    // 3. Als Admin: Eintrag sichtbar
  })

  test("Anhang hochladen und herunterladen", async ({ page }) => {
    // 1. Eintrag öffnen → Datei hochladen
    // 2. Anhang in Liste sichtbar
    // 3. Download → Datei korrekt heruntergeladen
  })

  test("Kategorienverwaltung", async ({ page }) => {
    // 1. Neue Kategorie anlegen
    // 2. Eintrag mit neuer Kategorie erstellen
    // 3. Filterung nach Kategorie funktioniert
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Storage Layer
- Dateien unter `{tenantId}/{employeeId}/` im Bucket
- Storage Policy prüft Tenant-Zugehörigkeit

### Repository Layer
- Jede Query MUSS `tenantId` filtern
- Kategorien sind Tenant-spezifisch
- Einträge joinen über `employee.tenantId`

### Service Layer
- Alle Operationen erhalten `tenantId` aus Context
- Rechtesteuerung berücksichtigt `visibleToRoles` pro Kategorie
- Vertraulichkeitsfilter auf Service-Ebene

### Tests (MANDATORY)
- Cross-Tenant-Zugriff auf Einträge, Kategorien und Anhänge MUSS fehlschlagen
- Rechtesteuerung: Benutzer sieht nur Kategorien die seiner Rolle zugeordnet sind

### Pattern Reference
See `src/lib/services/wh-article-service.ts` for canonical tenant isolation pattern.

---

## Acceptance Criteria

- [ ] 3 Models mit Migration: Category, Entry, Attachment
- [ ] Default-Kategorien bei Tenant-Setup erstellt
- [ ] Einträge pro Mitarbeiter mit Kategorie, Datum, Beschreibung
- [ ] Dateianhänge via Supabase Storage (max. 20 MB, PDF/Bilder/Office)
- [ ] Ablaufdatum mit automatischer "Bald ablaufend"-Anzeige
- [ ] Wiedervorlage-System (Datum + Notiz)
- [ ] Vertrauliche Einträge nur mit spezieller Permission sichtbar
- [ ] Rechtesteuerung pro Kategorie (`visibleToRoles`)
- [ ] Tab "Personalakte" im Mitarbeiterdetail
- [ ] Dashboard-Widget: fällige Wiedervorlagen + ablaufende Einträge
- [ ] Cross-tenant isolation verified (Tests included)
