# EK_01 — Bestelldruck (PDF)

| Field | Value |
|-------|-------|
| **Module** | Warehouse / Orders |
| **Dependencies** | WH_03 (Einkauf/Bestellungen), CRM_01 (Adressen) |
| **Complexity** | M |
| **Priority** | Mittlere Priorität |
| **New Models** | — (Erweiterung bestehender Modelle) |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. 3.2: Bestellung als Report drucken. PDF-Generierung mit Firmenlogo, Kopf- und Fußdaten, Positionen, Unterschriftenzeile. Versand per Druck, Fax oder E-Mail.

---

## Terp aktuell

- Bestellungen können angelegt und verwaltet werden (WH_03)
- Kein PDF-Export oder Druckfunktion für Bestellungen
- Bestellungen werden nur im System angezeigt, nicht als Dokument versendbar
- PDF-Generierung existiert bereits für Verkaufsbelege (TICKET_140)

---

## Goal

PDF-Generierung für Bestellungen (Purchase Orders) implementieren. Das PDF folgt dem gleichen Layout-System wie die Verkaufsbelege. Enthält: Firmenlogo, Lieferantenadresse, Bestellnummer, Datum, Positionen mit Preis, Gesamtsumme, Bemerkungen, Unterschriftenfeld. "Unsere Kundennummer beim Lieferanten" wird auf dem Bestelldokument angezeigt (wenn hinterlegt, siehe CRM_06).

---

## PDF-Layout

### Kopfbereich
- Eigenes Firmenlogo (links)
- Firmenname und Adresse (rechts)
- "BESTELLUNG" als Dokumenttitel
- Bestellnummer, Bestelldatum
- Lieferant: Name, Adresse, Ansprechpartner
- "Unsere Kundennummer": Feld aus CRM-Adresse (wenn vorhanden)
- Gewünschter Liefertermin
- Bestätigter Liefertermin (wenn vorhanden)

### Positionstabelle
| Pos | Art.-Nr. (Lieferant) | Bezeichnung | Menge | Einheit | Einzelpreis | Fixkosten | Gesamtpreis |
|-----|---------------------|-------------|-------|---------|-------------|-----------|-------------|

### Fußbereich
- Summe Netto
- MwSt-Betrag
- Gesamtbetrag Brutto
- Bestellmethode (Telefon/E-Mail/Fax/Druck)
- Bemerkungen
- Unterschriftenzeile: Ort, Datum, Unterschrift

---

## tRPC Router Erweiterungen

Erweiterung von `src/trpc/routers/warehouse/purchaseOrders.ts`:

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `generatePdf` | query | `wh_purchase_orders.view` | `{ id }` | PDF als Base64-String zurückgeben |
| `downloadPdf` | query | `wh_purchase_orders.view` | `{ id }` | PDF als Download (Content-Disposition) |

---

## Service Layer

**File:** `src/lib/services/wh-purchase-order-pdf-service.ts`

### Key Logic

```ts
export async function generatePurchaseOrderPdf(prisma, tenantId, purchaseOrderId) {
  // 1. Bestellung mit Positionen laden
  // 2. Lieferant mit Adresse laden
  // 3. Mandanteneinstellungen laden (Logo, Adresse, Bankdaten)
  // 4. PDF generieren mit @react-pdf/renderer oder pdfkit
  //    (gleiche Engine wie Verkaufsbelege)
  // 5. Buffer zurückgeben
}
```

### Wiederverwendung

- Nutzt das gleiche PDF-Template-System wie die Verkaufsbelege (TICKET_140)
- Shared Components: Logo-Header, Adressblock, Positionstabelle, Summenblock, Fußzeile

---

## UI Components

### Bestelldetail-Seite

Erweiterung von `src/components/warehouse/purchase-order-detail.tsx`:

- Button "PDF herunterladen" (Download-Icon)
- Button "PDF Vorschau" (Augen-Icon) → Modal mit PDF-Anzeige
- Bei Modus "Bestellt": PDF automatisch generiert und gespeichert

### PDF-Vorschau-Modal

**Component:** `src/components/warehouse/purchase-order-pdf-preview.tsx`

- Eingebetteter PDF-Viewer (react-pdf)
- Buttons: Herunterladen / Drucken / Schließen

---

## Hooks

**File:** Erweiterung von `src/hooks/use-wh-purchase-orders.ts`

```ts
export function useWhPurchaseOrderPdf(id: string) {
  // query: generatePdf (lazy, triggered by button)
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-purchase-order-pdf-service.test.ts`

- `generatePdf` — gibt einen Buffer zurück der mit %PDF beginnt
- `generatePdf` — enthält Bestellnummer im Text
- `generatePdf` — enthält alle Positionen
- `generatePdf` — enthält Lieferantenadresse
- `generatePdf` — enthält "Unsere Kundennummer" wenn vorhanden
- `generatePdf` — enthält Firmendaten des Mandanten
- `generatePdf` — rejects wenn Bestellung nicht existiert

### Router Tests

**File:** `src/trpc/routers/__tests__/whPurchaseOrderPdf-router.test.ts`

```ts
describe("warehouse.purchaseOrders.generatePdf", () => {
  it("returns PDF buffer for valid PO", async () => { })
  it("requires wh_purchase_orders.view permission", async () => { })
  it("returns 404 for non-existent PO", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("generatePdf — Mandant A kann kein PDF für Bestellung von Mandant B generieren", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/53-ek-purchase-order-pdf.spec.ts`

```ts
test.describe("UC-EK-01: Bestelldruck PDF", () => {
  test("PDF herunterladen aus Bestelldetail", async ({ page }) => {
    // 1. Bestellung öffnen
    // 2. "PDF herunterladen" klicken
    // 3. Download startet (PDF-Datei)
  })

  test("PDF Vorschau anzeigen", async ({ page }) => {
    // 1. Bestellung öffnen
    // 2. "PDF Vorschau" klicken
    // 3. Modal mit PDF-Anzeige erscheint
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Service Layer
- PDF-Generierung MUSS `tenantId` validieren
- Nur Bestellungen des eigenen Mandanten können als PDF exportiert werden
- Firmenlogo und -daten werden tenant-spezifisch geladen

### Tests (MANDATORY)
- Cross-Tenant-PDF-Generierung MUSS fehlschlagen

---

## Acceptance Criteria

- [ ] PDF-Generierung für Bestellungen implementiert
- [ ] PDF enthält: Logo, Firmenadresse, Lieferantenadresse, Bestellnummer, Positionen, Summen
- [ ] "Unsere Kundennummer" wird angezeigt (wenn im Lieferanten hinterlegt)
- [ ] PDF-Vorschau im Browser (Modal)
- [ ] PDF-Download als Datei
- [ ] Gleiche PDF-Engine wie Verkaufsbelege (Konsistenz)
- [ ] Cross-tenant isolation verified (Tests included)
