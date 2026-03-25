# EK_02 — Freie Bestellpositionen

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_03 (Einkauf/Bestellungen) |
| **Complexity** | S |
| **Priority** | Mittlere Priorität |
| **New Models** | — (Erweiterung `WhPurchaseOrderPosition`) |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. 3.2: Positionen ohne Artikelstamm in Bestellungen (z.B. für einmalige Sonderbestellungen). Zusätzlich Text-Positionen für Hinweise (z.B. Garantiebedingungen).

---

## Terp aktuell

- Bestellpositionen müssen immer einen Artikel aus dem Stamm referenzieren (`articleId` ist Pflicht)
- Einmalige Sonderbestellungen erfordern erst das Anlegen eines Artikels
- Keine Text-Positionen (z.B. Lieferhinweise, Garantietexte)

---

## Goal

Zwei neue Positionstypen für Bestellungen einführen: "Freitext-Position" (ohne Artikelstamm, mit Preis) und "Text-Position" (ohne Preis, nur Textzeile). Dies folgt dem gleichen Muster wie bei den Verkaufsbelegen, wo bereits Freitext- und Text-Positionen existieren.

---

## Schema-Änderungen

### WhPurchaseOrderPosition Erweiterung

```prisma
enum WhPurchaseOrderPositionType {
  ARTICLE      // Standard: Artikel aus Stamm
  FREETEXT     // Freitext mit Preis (ohne Artikelstamm)
  TEXT         // Nur Textzeile (ohne Preis)

  @@map("wh_purchase_order_position_type")
}

model WhPurchaseOrderPosition {
  // ... bestehende Felder ...
  positionType  WhPurchaseOrderPositionType @default(ARTICLE) @map("position_type")
  articleId     String?  @map("article_id") @db.Uuid  // Nullable jetzt (war vorher Pflicht)
  freeText      String?  @map("free_text")             // Bezeichnung bei FREETEXT/TEXT
  // ...
}
```

### Migrationsschritte

1. Neues Enum `wh_purchase_order_position_type` erstellen
2. `position_type` Spalte hinzufügen (Default: `ARTICLE`)
3. `article_id` als nullable setzen
4. `free_text` Spalte hinzufügen

---

## Validierungsregeln

| Positionstyp | articleId | freeText | quantity | unitPrice | totalPrice |
|-------------|-----------|----------|----------|-----------|------------|
| ARTICLE | Pflicht | Optional | Pflicht | Optional | Berechnet |
| FREETEXT | null | Pflicht | Pflicht | Pflicht | Berechnet |
| TEXT | null | Pflicht | null | null | null |

---

## Service Layer Änderungen

**File:** Erweiterung von `src/lib/services/wh-purchase-order-service.ts`

```ts
export async function addPosition(prisma, tenantId, input) {
  switch (input.positionType) {
    case "ARTICLE":
      // Bestehende Logik: Artikel laden, Auto-Fill
      validateRequired(input.articleId, "articleId")
      break
    case "FREETEXT":
      // Kein Artikel nötig, Bezeichnung und Preis Pflicht
      validateRequired(input.freeText, "freeText")
      validateRequired(input.unitPrice, "unitPrice")
      break
    case "TEXT":
      // Nur Text, kein Preis, keine Menge
      validateRequired(input.freeText, "freeText")
      break
  }
  // ...
}
```

### Summenberechnung

Text-Positionen werden bei der Summenberechnung ignoriert (totalPrice = null).

---

## UI Components

### Position-Table Erweiterung

Erweiterung von `src/components/warehouse/purchase-order-position-table.tsx`:

- Dropdown "Positionstyp": Artikel / Freitext / Text
- Bei "Artikel": Artikelsuche wie bisher
- Bei "Freitext": Freitext-Bezeichnung (Textarea) + Menge + Preis
- Bei "Text": Nur Textfeld (kein Preis, keine Menge, schmaler dargestellt)

---

## Hooks

Keine neuen Hooks nötig — bestehende Mutations werden erweitert.

---

## Tests

### Unit Tests (Service)

**File:** Erweiterung von `src/lib/services/__tests__/wh-purchase-order-service.test.ts`

- `addPosition FREETEXT` — erstellt Position ohne articleId
- `addPosition FREETEXT` — rejects ohne freeText
- `addPosition FREETEXT` — rejects ohne unitPrice
- `addPosition TEXT` — erstellt Position ohne Preis und Menge
- `addPosition TEXT` — wird bei Summenberechnung ignoriert
- `addPosition ARTICLE` — weiterhin Pflicht: articleId
- Sortierung: alle Positionstypen korrekt sortierbar

### Router Tests

```ts
describe("warehouse.purchaseOrders.positions", () => {
  it("add FREETEXT — creates position without article", async () => { })
  it("add TEXT — creates text-only position", async () => { })
  it("totals — TEXT positions excluded from sum", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("add — rejects position for cross-tenant PO", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/54-ek-free-positions.spec.ts`

```ts
test.describe("UC-EK-02: Freie Bestellpositionen", () => {
  test("Freitext-Position hinzufügen", async ({ page }) => {
    // 1. Bestellung öffnen
    // 2. Position hinzufügen → Typ: Freitext
    // 3. Bezeichnung, Menge, Preis eingeben
    // 4. Position erscheint in Tabelle mit Preis
  })

  test("Text-Position hinzufügen", async ({ page }) => {
    // 1. Position hinzufügen → Typ: Text
    // 2. Nur Textfeld ausfüllen
    // 3. Position erscheint ohne Preis/Menge
    // 4. Gesamtsumme unverändert
  })

  test("Freitext-Position in PDF korrekt dargestellt", async ({ page }) => {
    // 1. Bestellung mit Freitext-Position → PDF generieren
    // 2. PDF enthält die Freitext-Bezeichnung + Preis
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

Bestehende Tenant-Isolation der Bestellungen (WH_03) greift automatisch — Positionen sind Sub-Entities der Bestellung.

---

## Acceptance Criteria

- [ ] Neues Enum `WhPurchaseOrderPositionType` mit ARTICLE, FREETEXT, TEXT
- [ ] `articleId` ist nullable (Migration)
- [ ] FREETEXT: Bezeichnung + Menge + Preis (ohne Artikelstamm)
- [ ] TEXT: Nur Textzeile (kein Preis, keine Menge)
- [ ] TEXT-Positionen werden bei Summenberechnung ignoriert
- [ ] UI: Positionstyp-Dropdown beim Hinzufügen
- [ ] PDF: Alle Positionstypen korrekt dargestellt
- [ ] Validierung: Pflichtfelder pro Positionstyp
- [ ] Cross-tenant isolation verified (Tests included)
