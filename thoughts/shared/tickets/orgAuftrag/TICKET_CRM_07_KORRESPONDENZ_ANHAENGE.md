# CRM_07 — Anhänge bei Korrespondenz

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | CRM_02 (Korrespondenz) |
| **Complexity** | M |
| **Priority** | Mittlere Priorität |
| **New Models** | `CrmCorrespondenceAttachment` |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. 2.3.4: Dateien (PDFs, Bilder) an Korrespondenzeinträge anhängen. Sogar Scanner-Integration für direktes Einscannen. Für die Dokumentation von Briefen, Verträgen und Lieferantenkorrespondenz.

---

## Terp aktuell

- Korrespondenz hat Betreff + Inhalt (Text)
- Keine Möglichkeit, Dateien an Korrespondenzeinträge anzuhängen
- Verträge, Angebots-PDFs, Briefe können nicht archiviert werden

---

## Goal

Dateianhänge für Korrespondenzeinträge ermöglichen. Unterstützte Formate: PDF, Bilder (JPEG/PNG), Office-Dokumente. Upload via Supabase Storage. Maximal 5 Anhänge pro Korrespondenz, je max. 10 MB.

---

## Prisma Models

### CrmCorrespondenceAttachment

```prisma
model CrmCorrespondenceAttachment {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  correspondenceId  String   @map("correspondence_id") @db.Uuid
  tenantId          String   @map("tenant_id") @db.Uuid
  filename          String
  storagePath       String   @map("storage_path")
  mimeType          String   @map("mime_type")
  sizeBytes         Int      @map("size_bytes")
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById       String?  @map("created_by_id") @db.Uuid

  correspondence CrmCorrespondence @relation(fields: [correspondenceId], references: [id], onDelete: Cascade)
  tenant         Tenant            @relation(fields: [tenantId], references: [id])

  @@index([correspondenceId])
  @@index([tenantId])
  @@map("crm_correspondence_attachments")
}
```

---

## Supabase Storage

### Bucket

```
crm-attachments/{tenantId}/{correspondenceId}/{filename}
```

- Bucket: `crm-attachments` (private, authenticated access)
- Max. Dateigröße: 10 MB
- Erlaubte Formate: PDF, JPEG, PNG, WebP, DOCX, XLSX
- Max. 5 Anhänge pro Korrespondenz

---

## Permissions

```ts
p("crm_correspondence.upload", "crm_correspondence", "upload", "Upload attachments to correspondence"),
```

---

## tRPC Router

Erweiterung von `src/trpc/routers/crm/correspondence.ts`:

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `attachments.list` | query | `crm_correspondence.view` | `{ correspondenceId }` | Alle Anhänge |
| `attachments.getUploadUrl` | mutation | `crm_correspondence.upload` | `{ correspondenceId, filename, mimeType }` | Signed Upload URL |
| `attachments.confirm` | mutation | `crm_correspondence.upload` | `{ correspondenceId, storagePath, filename, mimeType, sizeBytes }` | Upload bestätigen |
| `attachments.delete` | mutation | `crm_correspondence.upload` | `{ id }` | Anhang löschen |
| `attachments.getDownloadUrl` | query | `crm_correspondence.view` | `{ id }` | Signed Download URL |

---

## Service Layer

**File:** `src/lib/services/crm-correspondence-attachment-service.ts`

### Key Logic

```ts
export async function confirmUpload(prisma, tenantId, input) {
  // 1. Korrespondenz validieren (gehört zum Tenant)
  // 2. Anhang-Limit prüfen (max. 5)
  // 3. Dateigröße prüfen (max. 10 MB)
  // 4. MIME-Type prüfen (Whitelist)
  // 5. DB-Eintrag erstellen
}

export async function deleteAttachment(prisma, tenantId, attachmentId) {
  // 1. Anhang laden + Tenant validieren
  // 2. Datei aus Storage löschen
  // 3. DB-Eintrag löschen
}
```

---

## UI Components

### Korrespondenz-Formular

Erweiterung von `src/components/crm/correspondence-form.tsx`:

- Neuer Bereich "Anhänge" unter dem Inhalt-Textfeld
- Drag & Drop Zone für Datei-Upload
- Dateiliste mit: Dateiname, Größe, Typ-Icon, Löschen-Button
- Dateivorschau: PDFs inline anzeigen, Bilder als Thumbnail
- Download-Button pro Anhang

### Korrespondenz-Detailansicht

- Anhänge-Bereich mit Dateiliste
- Klick auf Datei → Download oder Vorschau (bei PDFs/Bildern)

---

## Hooks

**File:** `src/hooks/use-crm-correspondence-attachments.ts`

```ts
export function useCrmCorrespondenceAttachments(correspondenceId: string) { /* list */ }
export function useUploadCrmCorrespondenceAttachment() { /* getUploadUrl + upload + confirm */ }
export function useDeleteCrmCorrespondenceAttachment() { /* delete */ }
export function useCrmCorrespondenceDownloadUrl(id: string) { /* getDownloadUrl */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/crm-correspondence-attachment-service.test.ts`

- `confirmUpload` — erstellt DB-Eintrag
- `confirmUpload` — rejects wenn Limit (5) überschritten
- `confirmUpload` — rejects bei ungültigem MIME-Type
- `confirmUpload` — rejects bei Datei > 10 MB
- `deleteAttachment` — löscht DB-Eintrag und Storage
- `deleteAttachment` — rejects bei Cross-Tenant-Zugriff

### Router Tests

```ts
describe("crm.correspondence.attachments", () => {
  it("getUploadUrl — requires crm_correspondence.upload", async () => { })
  it("confirm — creates attachment record", async () => { })
  it("delete — removes attachment", async () => { })
  it("getDownloadUrl — returns signed URL", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("list — Mandant A sieht keine Anhänge von Mandant B", async () => { })
  it("delete — Mandant A kann Anhänge von Mandant B nicht löschen", async () => { })
  it("getDownloadUrl — Mandant A kann Anhänge von Mandant B nicht herunterladen", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/56-crm-correspondence-attachments.spec.ts`

```ts
test.describe("UC-CRM-07: Korrespondenz-Anhänge", () => {
  test("Datei an Korrespondenz anhängen", async ({ page }) => {
    // 1. Korrespondenz öffnen
    // 2. Datei hochladen (Drag & Drop oder Dateiauswahl)
    // 3. Anhang erscheint in Dateiliste
  })

  test("Anhang herunterladen", async ({ page }) => {
    // 1. Korrespondenz mit Anhang öffnen
    // 2. Download-Button klicken
    // 3. Datei wird heruntergeladen
  })

  test("Anhang löschen", async ({ page }) => {
    // 1. Löschen-Button klicken
    // 2. Bestätigungsdialog → Bestätigen
    // 3. Anhang verschwindet
  })

  test("Limit von 5 Anhängen wird durchgesetzt", async ({ page }) => {
    // 1. 5 Dateien hochladen
    // 2. 6. Upload → Fehlermeldung "Maximum 5 Anhänge"
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Storage Layer
- Dateien unter `{tenantId}/` im Bucket
- Storage Policy prüft Tenant-Zugehörigkeit
- Signed URLs zeitlich begrenzt (1h)

### Repository Layer
- Jede Query MUSS `tenantId` filtern
- Anhänge joinen über `correspondence.tenantId`

### Service Layer
- Upload-URL enthält tenantId im Pfad
- Delete validiert Tenant-Zugehörigkeit

### Tests (MANDATORY)
- Cross-Tenant-Zugriff MUSS fehlschlagen

---

## Acceptance Criteria

- [ ] `CrmCorrespondenceAttachment` Model mit Migration
- [ ] Supabase Storage Bucket `crm-attachments` eingerichtet
- [ ] Upload via Signed URL (direkt zu Storage)
- [ ] Max. 5 Anhänge pro Korrespondenz
- [ ] Max. 10 MB pro Datei
- [ ] Erlaubte Formate: PDF, JPEG, PNG, WebP, DOCX, XLSX
- [ ] Anhänge in Korrespondenz-UI angezeigt
- [ ] Download via Signed URL
- [ ] Löschen entfernt DB-Eintrag + Storage-Datei
- [ ] Cross-tenant isolation verified (Tests included)
