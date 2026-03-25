# WH_10 — Artikelreservierungen bei Auftragsbestätigung

| Field | Value |
|-------|-------|
| **Module** | Warehouse / Orders |
| **Dependencies** | WH_01 (Articles), ORD_01 (Belegkette) |
| **Complexity** | L |
| **Priority** | Mittlere Priorität |
| **New Models** | `WhStockReservation` |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. 2.4.6: ZMI reserviert Artikel automatisch, sobald eine Auftragsbestätigung (AB) erstellt wird. Der Bestand zeigt dann "verfügbar" vs. "reserviert". Bei Lieferschein-Erstellung wird die Reservierung aufgelöst und in eine Entnahme umgewandelt.

---

## Terp aktuell

- Kein Reservierungssystem vorhanden
- `WhArticle.currentStock` zeigt nur den physischen Bestand
- Keine Unterscheidung zwischen "verfügbar" und "reserviert"
- Bei parallelen Aufträgen kann derselbe Artikel mehrfach "verkauft" werden, obwohl der Bestand nicht ausreicht

---

## Goal

Beim Abschließen einer Auftragsbestätigung (ORDER_CONFIRMATION) werden die enthaltenen Artikelpositionen automatisch reserviert. Der Artikelbestand zeigt dann: Physischer Bestand, Reserviert, Verfügbar (= Physisch - Reserviert). Reservierungen werden aufgelöst bei: Lieferschein-Erstellung, AB-Stornierung, oder manueller Freigabe.

---

## Prisma Models

### WhStockReservation

```prisma
model WhStockReservation {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  articleId     String   @map("article_id") @db.Uuid
  documentId    String   @map("document_id") @db.Uuid    // The ORDER_CONFIRMATION
  positionId    String   @map("position_id") @db.Uuid    // The specific position
  quantity      Float                                      // Reserved quantity
  status        String   @default("ACTIVE")               // ACTIVE, RELEASED, FULFILLED
  releasedAt    DateTime? @map("released_at") @db.Timestamptz(6)
  releasedById  String?  @map("released_by_id") @db.Uuid
  releaseReason String?  @map("release_reason")           // "DELIVERY_NOTE", "CANCELLED", "MANUAL"
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?  @map("created_by_id") @db.Uuid

  tenant  Tenant    @relation(fields: [tenantId], references: [id])
  article WhArticle @relation(fields: [articleId], references: [id])

  @@index([tenantId, articleId, status])
  @@index([tenantId, documentId])
  @@map("wh_stock_reservations")
}
```

### WhArticle Erweiterung

```prisma
// Computed fields (nicht in DB, berechnet im Service):
// reservedStock = SUM(reservations WHERE status=ACTIVE AND articleId=this.id)
// availableStock = currentStock - reservedStock
```

---

## Permissions

```ts
p("wh_reservations.view", "wh_reservations", "view", "View stock reservations"),
p("wh_reservations.manage", "wh_reservations", "manage", "Manage/release stock reservations"),
```

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/reservations.ts`

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `wh_reservations.view` | `{ articleId?, documentId?, status?, page, pageSize }` | Alle Reservierungen |
| `getByArticle` | query | `wh_reservations.view` | `{ articleId }` | Reservierungen + verfügbarer Bestand für einen Artikel |
| `release` | mutation | `wh_reservations.manage` | `{ id, reason? }` | Einzelne Reservierung manuell freigeben |
| `releaseBulk` | mutation | `wh_reservations.manage` | `{ documentId }` | Alle Reservierungen eines Belegs freigeben |

---

## Service Layer

**Files:**
- `src/lib/services/wh-reservation-service.ts`
- `src/lib/services/wh-reservation-repository.ts`

### Key Logic

#### Reservierung bei AB-Abschluss

```ts
export async function createReservationsForDocument(prisma, tenantId, documentId, userId) {
  return prisma.$transaction(async (tx) => {
    const doc = await getDocument(tx, tenantId, documentId)
    // Nur für ORDER_CONFIRMATION
    if (doc.type !== "ORDER_CONFIRMATION") return

    for (const pos of doc.positions.filter(p => p.articleId && p.article?.stockTracking)) {
      await tx.whStockReservation.create({
        data: {
          tenantId,
          articleId: pos.articleId,
          documentId,
          positionId: pos.id,
          quantity: pos.quantity,
          createdById: userId,
        }
      })
    }
  })
}
```

#### Freigabe bei Lieferschein

```ts
export async function releaseReservationsForDeliveryNote(prisma, tenantId, deliveryNoteId, userId) {
  // 1. Finde die Vorgänger-AB des Lieferscheins
  // 2. Für jede LS-Position: finde die zugehörige Reservierung
  // 3. Setze status=FULFILLED, releasedAt, releaseReason="DELIVERY_NOTE"
}
```

#### Verfügbaren Bestand berechnen

```ts
export async function getAvailableStock(prisma, tenantId, articleId): Promise<{
  currentStock: number,
  reservedStock: number,
  availableStock: number,
}> {
  const article = await getArticle(prisma, tenantId, articleId)
  const reserved = await prisma.whStockReservation.aggregate({
    where: { tenantId, articleId, status: "ACTIVE" },
    _sum: { quantity: true },
  })
  return {
    currentStock: article.currentStock,
    reservedStock: reserved._sum.quantity || 0,
    availableStock: article.currentStock - (reserved._sum.quantity || 0),
  }
}
```

---

## UI Components

### Artikeldetail — Bestandsanzeige erweitert

In `src/components/warehouse/article-stock-info.tsx`:
- Aktuell: "Bestand: 150"
- Neu: "Physisch: 150 | Reserviert: 30 | Verfügbar: 120"
- Reserviert als Badge (orange) neben dem Bestandswert

### Reservierungen-Tab im Artikeldetail

**Component:** `src/components/warehouse/article-reservations-tab.tsx`
- Tabelle: Beleg-Nr, Kunde, Menge, Datum, Status
- Aktion: "Freigeben" Button pro Reservierung (mit Grund-Dialog)

### Hinweis in Belegpositionen

- Beim Hinzufügen einer Artikelposition in einen Beleg: Verfügbaren Bestand anzeigen
- Warnung wenn reservierte + neue Menge > physischer Bestand

### Reservierungen-Übersicht

**Route:** `/warehouse/reservations`
- Globale Übersicht aller aktiven Reservierungen
- Filter: Artikel, Beleg, Kunde
- Massenfreigabe möglich

---

## Hooks

**File:** `src/hooks/use-wh-reservations.ts`

```ts
export function useWhReservations(filters) { /* list query */ }
export function useWhArticleAvailableStock(articleId: string) { /* getByArticle query */ }
export function useReleaseWhReservation() { /* release mutation */ }
export function useReleaseWhReservationsBulk() { /* releaseBulk mutation */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-reservation-service.test.ts`

- `createReservationsForDocument` — erstellt Reservierung pro Artikelposition
- `createReservationsForDocument` — ignoriert Positionen ohne Bestandsführung
- `createReservationsForDocument` — nur für ORDER_CONFIRMATION
- `getAvailableStock` — berechnet korrekt: physisch - reserviert
- `getAvailableStock` — zählt nur ACTIVE Reservierungen
- `release` — setzt status=RELEASED mit Grund und Zeitstempel
- `releaseReservationsForDeliveryNote` — setzt status=FULFILLED
- `releaseReservationsForDeliveryNote` — matched Positionen über Belegkette

### Router Tests

**File:** `src/trpc/routers/__tests__/whReservations-router.test.ts`

```ts
describe("warehouse.reservations", () => {
  it("list — requires wh_reservations.view", async () => { })
  it("getByArticle — returns correct available stock", async () => { })
  it("release — sets RELEASED with reason", async () => { })
  it("releaseBulk — releases all reservations for document", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("list — Mandant A sieht keine Reservierungen von Mandant B", async () => { })
  it("release — Mandant A kann Reservierung von Mandant B nicht freigeben", async () => { })
  it("getByArticle — zeigt nur eigene Reservierungen", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/49-wh-reservations.spec.ts`

```ts
test.describe("UC-WH-10: Artikelreservierungen", () => {
  test("AB abschließen reserviert Artikel automatisch", async ({ page }) => {
    // 1. Artikel mit Bestand 100 anlegen
    // 2. AB mit 30 Stück erstellen und abschließen
    // 3. Artikeldetail prüfen: Reserviert=30, Verfügbar=70
  })

  test("Lieferschein aus AB löst Reservierung auf", async ({ page }) => {
    // 1. AB mit Reservierung → Lieferschein erstellen
    // 2. Reservierung prüfen: Status=FULFILLED
    // 3. Verfügbarer Bestand unverändert (Entnahme separat)
  })

  test("Manuelle Freigabe einer Reservierung", async ({ page }) => {
    // 1. Reservierungs-Übersicht öffnen
    // 2. Reservierung auswählen → Freigeben mit Grund
    // 3. Verfügbarer Bestand erhöht sich
  })

  test("Warnung bei unzureichendem verfügbarem Bestand", async ({ page }) => {
    // 1. Artikel: Bestand 100, Reserviert 80 → Verfügbar 20
    // 2. Neuen Beleg mit 30 Stück erstellen
    // 3. Warnung erscheint: "Nur 20 verfügbar"
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Repository Layer
- Jede Query auf `wh_stock_reservations` MUSS `tenantId` filtern
- Aggregationen (`_sum`) MÜSSEN `tenantId` im WHERE haben
- Freigabe-Operationen MÜSSEN `tenantId` validieren

### Service Layer
- `createReservationsForDocument` erbt `tenantId` aus dem Beleg
- `getAvailableStock` filtert Reservierungen nach `tenantId`
- Kein Cross-Tenant-Zugriff möglich

### Tests (MANDATORY)
- `describe("tenant isolation")` Block in Service-Tests
- Mindestens: list, getByArticle, release für Cross-Tenant-Rejection

### Pattern Reference
See `src/lib/services/wh-article-service.ts` for canonical tenant isolation pattern.

---

## Acceptance Criteria

- [ ] `WhStockReservation` Model mit Migration erstellt
- [ ] Beim Abschließen einer AB werden Reservierungen automatisch erstellt
- [ ] Artikelbestandsanzeige zeigt: Physisch, Reserviert, Verfügbar
- [ ] Reservierungen werden bei LS-Erstellung aufgelöst (FULFILLED)
- [ ] Reservierungen werden bei AB-Stornierung aufgelöst (RELEASED)
- [ ] Manuelle Freigabe einzelner Reservierungen mit Grund möglich
- [ ] Massenfreigabe pro Beleg möglich
- [ ] Warnung bei Beleg-Erstellung wenn verfügbarer Bestand nicht ausreicht
- [ ] Nur Artikel mit `stockTracking=true` werden reserviert
- [ ] Cross-tenant isolation verified (Tests included)
