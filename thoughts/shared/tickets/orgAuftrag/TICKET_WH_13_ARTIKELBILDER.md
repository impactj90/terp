# WH_13 — Artikelbilder

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_01 (Articles) |
| **Complexity** | M |
| **Priority** | Mittlere Priorität |
| **New Models** | `WhArticleImage` |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. 2.4.1: Mehrere Bilder pro Artikel hinterlegen. Bilder werden beim Artikel angezeigt und können in Belegen und Reports verwendet werden.

---

## Terp aktuell

- Keine Bildunterstützung im Artikelstamm
- Lagermitarbeiter müssen Artikel anhand von Nummer und Bezeichnung identifizieren
- In Belegen und Reports keine Produktbilder

---

## Goal

Mehrere Bilder pro Artikel hochladen und verwalten. Ein Hauptbild wird in Listen und Belegen angezeigt. Bilder werden in Supabase Storage gespeichert. Thumbnail-Generierung für schnelle Ladezeiten.

---

## Prisma Models

### WhArticleImage

```prisma
model WhArticleImage {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  articleId   String   @map("article_id") @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  filename    String                     // Originaler Dateiname
  storagePath String   @map("storage_path") // Pfad in Supabase Storage
  thumbnailPath String? @map("thumbnail_path") // Thumbnail-Pfad
  mimeType    String   @map("mime_type") // image/jpeg, image/png, image/webp
  sizeBytes   Int      @map("size_bytes")
  sortOrder   Int      @default(0) @map("sort_order")
  isPrimary   Boolean  @default(false) @map("is_primary") // Hauptbild
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById String?  @map("created_by_id") @db.Uuid

  article WhArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)
  tenant  Tenant    @relation(fields: [tenantId], references: [id])

  @@index([articleId, sortOrder])
  @@index([tenantId])
  @@map("wh_article_images")
}
```

---

## Supabase Storage

### Bucket

```
wh-article-images/{tenantId}/{articleId}/{imageId}.{ext}
wh-article-images/{tenantId}/{articleId}/{imageId}_thumb.webp
```

- Bucket: `wh-article-images` (private, authenticated access)
- Max. Dateigröße: 5 MB
- Erlaubte Formate: JPEG, PNG, WebP
- Thumbnail: 200×200px WebP (automatisch generiert)

### Storage Policy

```sql
-- Nur authentifizierte Benutzer mit korrektem Tenant können Bilder lesen
CREATE POLICY "tenant_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'wh-article-images'
    AND (storage.foldername(name))[1] = (current_setting('request.jwt.claims')::json ->> 'tenant_id')
  );
```

---

## Permissions

```ts
p("wh_articles.upload_image", "wh_articles", "upload_image", "Upload article images"),
p("wh_articles.delete_image", "wh_articles", "delete_image", "Delete article images"),
```

---

## tRPC Router

**File:** Erweiterung von `src/trpc/routers/warehouse/articles.ts`

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `images.list` | query | `wh_articles.view` | `{ articleId }` | Alle Bilder eines Artikels |
| `images.getUploadUrl` | mutation | `wh_articles.upload_image` | `{ articleId, filename, mimeType }` | Signed Upload URL für Supabase Storage |
| `images.confirm` | mutation | `wh_articles.upload_image` | `{ articleId, storagePath, filename, mimeType, sizeBytes }` | Upload bestätigen, DB-Eintrag erstellen, Thumbnail generieren |
| `images.setPrimary` | mutation | `wh_articles.upload_image` | `{ imageId }` | Bild als Hauptbild setzen |
| `images.reorder` | mutation | `wh_articles.upload_image` | `{ imageIds: string[] }` | Reihenfolge ändern |
| `images.delete` | mutation | `wh_articles.delete_image` | `{ imageId }` | Bild löschen (Storage + DB) |

---

## Service Layer

**Files:**
- `src/lib/services/wh-article-image-service.ts`

### Key Logic

#### Upload-Flow

```ts
// 1. Client ruft getUploadUrl → erhält Signed URL
// 2. Client lädt Bild direkt zu Supabase Storage hoch
// 3. Client ruft confirm → Service erstellt DB-Eintrag + Thumbnail
```

#### Thumbnail-Generierung

```ts
export async function generateThumbnail(supabase, storagePath) {
  // 1. Original aus Storage laden
  // 2. Mit sharp (oder Supabase Image Transformations) auf 200x200 resizen
  // 3. Als WebP speichern
  // 4. Thumbnail-Pfad zurückgeben
}
```

#### Hauptbild setzen

```ts
export async function setPrimaryImage(prisma, tenantId, imageId) {
  // 1. Validieren: Image gehört zum Tenant
  // 2. Alle anderen Bilder des Artikels: isPrimary = false
  // 3. Dieses Bild: isPrimary = true
}
```

---

## UI Components

### Artikeldetail — Bilder-Tab

**Component:** `src/components/warehouse/article-images-tab.tsx`

- Bildergalerie mit Drag-and-Drop-Sortierung
- Hauptbild mit Stern-Badge markiert
- Upload-Bereich (Drag & Drop oder Dateiauswahl)
- Bildervorschau mit Lightbox bei Klick
- Aktionen pro Bild: Als Hauptbild setzen / Löschen

### Artikelliste — Thumbnail

- In der Artikelliste: Kleine Vorschau (Thumbnail) des Hauptbilds in der ersten Spalte
- Fallback: Platzhalter-Icon wenn kein Bild vorhanden

### Upload-Dialog

**Component:** `src/components/warehouse/article-image-upload.tsx`

- Drag & Drop Zone
- Mehrere Dateien gleichzeitig
- Fortschrittsanzeige pro Datei
- Vorschau vor dem Upload
- Validierung: Format, Größe

---

## Hooks

**File:** `src/hooks/use-wh-article-images.ts`

```ts
export function useWhArticleImages(articleId: string) { /* list query */ }
export function useUploadWhArticleImage() { /* getUploadUrl + upload + confirm */ }
export function useSetPrimaryWhArticleImage() { /* setPrimary mutation */ }
export function useDeleteWhArticleImage() { /* delete mutation */ }
export function useReorderWhArticleImages() { /* reorder mutation */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-article-image-service.test.ts`

- `confirm` — erstellt DB-Eintrag mit korrekten Metadaten
- `confirm` — erstes Bild wird automatisch isPrimary
- `setPrimary` — setzt isPrimary auf true, alle anderen auf false
- `reorder` — aktualisiert sortOrder korrekt
- `delete` — entfernt DB-Eintrag und Storage-Objekte
- `delete` — wenn Hauptbild gelöscht: nächstes Bild wird Hauptbild
- `getUploadUrl` — validiert Dateityp (nur JPEG/PNG/WebP)
- `getUploadUrl` — generiert korrekte Storage-Pfade

### Router Tests

**File:** `src/trpc/routers/__tests__/whArticleImages-router.test.ts`

```ts
describe("warehouse.articles.images", () => {
  it("list — returns images sorted by sortOrder", async () => { })
  it("getUploadUrl — requires wh_articles.upload_image", async () => { })
  it("setPrimary — marks correct image", async () => { })
  it("delete — removes image and storage object", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("list — Mandant A sieht keine Bilder von Mandant B", async () => { })
  it("delete — Mandant A kann Bilder von Mandant B nicht löschen", async () => { })
  it("setPrimary — Mandant A kann Bilder von Mandant B nicht ändern", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/52-wh-article-images.spec.ts`

```ts
test.describe("UC-WH-13: Artikelbilder", () => {
  test("Bild hochladen und als Hauptbild anzeigen", async ({ page }) => {
    // 1. Artikeldetail öffnen
    // 2. Tab "Bilder" → Datei hochladen
    // 3. Bild erscheint in Galerie mit Stern-Badge (Hauptbild)
  })

  test("Mehrere Bilder hochladen und sortieren", async ({ page }) => {
    // 1. 3 Bilder hochladen
    // 2. Reihenfolge per Drag & Drop ändern
    // 3. Anderes Bild als Hauptbild setzen
    // 4. Sortierung und Hauptbild korrekt gespeichert
  })

  test("Bild löschen", async ({ page }) => {
    // 1. Bild auswählen → Löschen
    // 2. Bestätigungsdialog → Bestätigen
    // 3. Bild verschwindet aus Galerie
  })

  test("Thumbnail in Artikelliste sichtbar", async ({ page }) => {
    // 1. Artikel mit Hauptbild in Artikelliste finden
    // 2. Thumbnail in erster Spalte sichtbar
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Storage Layer
- Bilder werden unter `{tenantId}/` im Storage abgelegt
- Storage Policy prüft Tenant-Zugehörigkeit
- Signed URLs sind zeitlich begrenzt (1h)

### Repository Layer
- Jede Query MUSS `tenantId` filtern
- Bilder-Abfragen joinen über `article.tenantId`

### Service Layer
- Upload-URL enthält tenantId im Pfad
- Delete löscht nur wenn Bild zum Tenant gehört

### Tests (MANDATORY)
- Cross-Tenant Zugriff auf Bilder muss fehlschlagen
- Signed URLs nur für eigenen Tenant generierbar

---

## Acceptance Criteria

- [ ] `WhArticleImage` Model mit Migration erstellt
- [ ] Supabase Storage Bucket `wh-article-images` eingerichtet
- [ ] Bilder-Upload via Signed URL (direkt zu Storage)
- [ ] Thumbnail-Generierung (200×200 WebP)
- [ ] Hauptbild pro Artikel (isPrimary)
- [ ] Sortierung per Drag & Drop
- [ ] Bilder in Artikelliste als Thumbnail angezeigt
- [ ] Lightbox-Vorschau bei Klick auf Bild
- [ ] Bilder löschen (Storage + DB)
- [ ] Max. 5 MB, nur JPEG/PNG/WebP
- [ ] Cross-tenant isolation verified (Tests included)
