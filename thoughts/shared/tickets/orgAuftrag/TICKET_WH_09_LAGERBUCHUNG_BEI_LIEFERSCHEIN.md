# WH_09 — Automatische Lagerbuchung bei Lieferschein

| Field | Value |
|-------|-------|
| **Module** | Warehouse / Orders |
| **Dependencies** | WH_01 (Articles), WH_05 (Stock Movements), ORD_01 (Belegkette) |
| **Complexity** | M |
| **Priority** | Mittlere Priorität |
| **New Models** | — (Erweiterung bestehender Modelle) |

---

## ZMI-Referenz

ZMI orgAuftrag kann so konfiguriert werden, dass beim Drucken eines Lieferscheins automatisch die Lagerbestände reduziert werden (3 Optionen: nur bei vorhandener Buchung / Nachfrage / Automatisch). In Terp ist der Lieferschein ein reiner Beleg — die Lagerentnahme muss separat über das Entnahme-Terminal erfolgen.

---

## Terp aktuell

- Lieferschein (DELIVERY_NOTE) ist ein reiner Beleg ohne Lagerwirkung
- Lagerentnahmen erfolgen ausschließlich über das Entnahme-Terminal (WH_05)
- Kein automatischer Mechanismus, der beim Abschließen eines Lieferscheins den Bestand reduziert
- Mitarbeiter müssen manuell im Entnahme-Terminal die gleichen Artikel erneut erfassen

---

## Goal

Beim Abschließen (Festschreiben) eines Lieferscheins optional automatisch Lagerentnahmen für alle Artikelpositionen erstellen. Die Konfiguration erfolgt pro Mandant über die Systemeinstellungen. Drei Modi: "Manuell" (wie bisher), "Mit Bestätigung" (Dialog zeigt Positionen, Benutzer bestätigt), "Automatisch" (sofortige Buchung ohne Dialog).

---

## Änderungen an bestehenden Modellen

### SystemSettings Erweiterung

```prisma
// In SystemSettings oder als neue Tenant-Einstellung:
deliveryNoteStockMode  String  @default("MANUAL") @map("delivery_note_stock_mode")
// Werte: "MANUAL" | "CONFIRM" | "AUTO"
```

---

## Service Layer

**Files:**
- `src/lib/services/order-document-service.ts` (Erweiterung)
- `src/lib/services/wh-stock-withdrawal-service.ts` (Erweiterung)

### Key Logic — Automatische Lagerbuchung

```ts
export async function finalizeDeliveryNote(prisma, tenantId, documentId, userId) {
  return prisma.$transaction(async (tx) => {
    // 1. Beleg abschließen (bestehende Logik)
    const doc = await finalizeDocument(tx, tenantId, documentId, userId)

    // 2. Mandanteneinstellung prüfen
    const settings = await getSettings(tx, tenantId)
    if (settings.deliveryNoteStockMode === "MANUAL") return doc

    // 3. Für jede Artikelposition mit Bestandsführung:
    for (const pos of doc.positions.filter(p => p.article?.stockTracking)) {
      await createStockWithdrawal(tx, {
        tenantId,
        articleId: pos.articleId,
        quantity: pos.quantity,
        type: "DELIVERY_NOTE",
        referenceType: "DELIVERY_NOTE",
        referenceId: documentId,
        reason: `Lieferschein ${doc.number}`,
        createdById: userId,
      })
    }

    return doc
  })
}
```

### Modus "CONFIRM"

Bei Modus "CONFIRM" gibt der Service die Liste der zu buchenden Positionen zurück, ohne sie zu buchen. Der Frontend-Dialog zeigt diese an, der Benutzer bestätigt, und ein separater Endpoint führt die Buchung durch.

---

## tRPC Router Erweiterungen

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `documents.previewStockBookings` | query | `documents.view` | `{ documentId }` | Zeigt welche Lagerbuchungen bei Abschluss entstehen würden |
| `documents.confirmStockBookings` | mutation | `documents.finalize` | `{ documentId, positionIds[] }` | Führt die Lagerbuchungen für bestätigte Positionen durch |

### Settings

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `settings.updateDeliveryNoteStockMode` | mutation | `settings.edit` | `{ mode: "MANUAL" \| "CONFIRM" \| "AUTO" }` | Modus für Lagerbuchung bei LS |

---

## UI Components

### Einstellungen

In `Administration → Einstellungen → Lager`:
- Dropdown "Lagerbuchung bei Lieferschein": Manuell / Mit Bestätigung / Automatisch
- Hinweistext der den gewählten Modus erklärt

### Bestätigungsdialog (Modus "CONFIRM")

**Component:** `src/components/orders/delivery-note-stock-dialog.tsx`

- Tabelle mit Artikelpositionen: Artikel, Menge, Aktueller Bestand, Neuer Bestand
- Checkbox pro Position (alle vorausgewählt)
- Positionen ohne Bestandsführung sind ausgegraut
- Warnung bei negativem Bestand (rot hervorgehoben)
- Buttons: "Lagerbuchung durchführen" / "Überspringen"

### Automatischer Modus

- Toast-Nachricht: "Lagerbuchung für X Artikel durchgeführt"
- Bei Fehler: Beleg wird trotzdem abgeschlossen, Fehlermeldung zeigt welche Artikel nicht gebucht werden konnten

---

## Hooks

**File:** `src/hooks/use-delivery-note-stock.ts`

```ts
export function usePreviewStockBookings(documentId: string) {
  return useQuery(trpc.documents.previewStockBookings.queryOptions({ documentId }))
}

export function useConfirmStockBookings() {
  // mutation mit Invalidierung der Artikelbestände
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/delivery-note-stock-service.test.ts`

- `finalizeDeliveryNote` — Modus MANUAL: keine Lagerbuchung
- `finalizeDeliveryNote` — Modus AUTO: erstellt Withdrawal für jede Artikelposition
- `finalizeDeliveryNote` — Modus CONFIRM: gibt Preview zurück ohne Buchung
- `confirmStockBookings` — erstellt Withdrawals für bestätigte Positionen
- `confirmStockBookings` — überspringt nicht-bestätigte Positionen
- Artikel ohne Bestandsführung (`stockTracking=false`) werden übersprungen
- Lagerbewegung hat Typ DELIVERY_NOTE und Referenz auf Beleg
- Bestand wird korrekt reduziert (previousStock → newStock)
- Negativer Bestand wird erlaubt (kein Fehler, aber Warnung)
- Transaction: bei Fehler werden alle Buchungen zurückgerollt

### Router Tests

**File:** `src/trpc/routers/__tests__/deliveryNoteStock-router.test.ts`

```ts
describe("documents.deliveryNoteStock", () => {
  it("previewStockBookings — returns positions with stock info", async () => { })
  it("confirmStockBookings — creates stock withdrawals", async () => { })
  it("confirmStockBookings — requires documents.finalize permission", async () => { })
  it("finalizeDeliveryNote AUTO — auto-creates withdrawals", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("previewStockBookings — rejects cross-tenant document", async () => { })
  it("confirmStockBookings — rejects cross-tenant document", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/48-wh-delivery-note-stock.spec.ts`

```ts
test.describe("UC-WH-09: Lagerbuchung bei Lieferschein", () => {
  test("Modus AUTO — Bestand wird bei LS-Abschluss automatisch reduziert", async ({ page }) => {
    // 1. Einstellung auf AUTO setzen
    // 2. Lieferschein mit Artikelpositionen erstellen
    // 3. Lieferschein abschließen
    // 4. Artikel prüfen: Bestand reduziert
    // 5. Bestandsbewegung prüfen: Typ DELIVERY_NOTE
  })

  test("Modus CONFIRM — Dialog zeigt Positionen, Benutzer bestätigt", async ({ page }) => {
    // 1. Einstellung auf CONFIRM setzen
    // 2. Lieferschein abschließen → Dialog erscheint
    // 3. Positionen prüfen, eine abwählen
    // 4. Bestätigen → nur gewählte Positionen gebucht
  })

  test("Modus MANUAL — keine Lagerbuchung", async ({ page }) => {
    // 1. Einstellung auf MANUAL setzen
    // 2. Lieferschein abschließen → kein Dialog
    // 3. Artikel prüfen: Bestand unverändert
  })

  test("Artikel ohne Bestandsführung werden übersprungen", async ({ page }) => {
    // Artikel mit stockTracking=false im LS → nicht in Buchungsliste
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Repository Layer
- Settings-Abfrage MUSS `tenantId` filtern
- Lagerbuchungen MÜSSEN `tenantId` des Belegs erben
- Preview-Query MUSS `tenantId` des Dokuments validieren

### Service Layer
- `finalizeDeliveryNote` erhält `tenantId` aus Router-Context
- Settings werden tenant-spezifisch geladen
- Alle Stock-Withdrawal-Operationen erben `tenantId`

### Tests (MANDATORY)
- `describe("tenant isolation")` Block in Service-Tests
- Mandant A kann keine Lagerbuchungen für Belege von Mandant B auslösen
- Settings von Mandant A beeinflussen nicht Mandant B

### Pattern Reference
See `src/lib/services/wh-article-service.ts` for canonical tenant isolation pattern.

---

## Acceptance Criteria

- [ ] Systemeinstellung "Lagerbuchung bei Lieferschein" mit 3 Modi (MANUAL/CONFIRM/AUTO)
- [ ] Modus AUTO: Beim Abschließen eines LS werden automatisch Lagerentnahmen erstellt
- [ ] Modus CONFIRM: Dialog zeigt betroffene Positionen, Benutzer kann einzeln bestätigen
- [ ] Modus MANUAL: Kein automatisches Verhalten (wie bisher)
- [ ] Nur Artikel mit `stockTracking=true` werden berücksichtigt
- [ ] Lagerbewegungen haben Typ DELIVERY_NOTE und Referenz auf den Beleg
- [ ] Bestand wird korrekt reduziert
- [ ] Transaction: bei Fehler alle Buchungen zurückgerollt, Beleg trotzdem abgeschlossen
- [ ] Cross-tenant isolation verified (Tests included)
