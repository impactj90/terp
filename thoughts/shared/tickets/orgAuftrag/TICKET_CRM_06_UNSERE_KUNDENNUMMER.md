# CRM_06 — "Unsere Kundennummer" beim Lieferanten

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | CRM_01 (Adressen), WH_03 (Einkauf) |
| **Complexity** | S |
| **Priority** | Mittlere Priorität |
| **New Models** | — (Felderweiterung `CrmAddress`) |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. Lieferant: ZMI speichert die eigene Kundennummer beim Lieferanten, damit sie auf Bestellungen gedruckt werden kann. Wichtig für die Identifizierung bei Bestellprozessen.

---

## Terp aktuell

- CRM-Adressen (Lieferanten) haben kein Feld für "Unsere Kundennummer"
- Auf Bestellungen fehlt diese Information
- Lieferanten können unsere Bestellungen nicht eindeutig ihrem Kundenstamm zuordnen

---

## Goal

Ein neues Feld `ourCustomerNumber` bei CRM-Adressen hinzufügen, das die eigene Kundennummer beim Lieferanten speichert. Dieses Feld wird auf Bestellungen und Bestelldrucken (PDF) angezeigt.

---

## Schema-Änderungen

### CrmAddress Erweiterung

```prisma
model CrmAddress {
  // ... bestehende Felder ...
  ourCustomerNumber  String?  @map("our_customer_number") // Unsere Kd-Nr. beim Lieferanten
}
```

---

## UI Änderungen

### Adressdetail (Lieferant)

In `src/components/crm/address-form.tsx`:
- Neues Feld "Unsere Kundennummer" im Abschnitt "Lieferantendaten"
- Nur sichtbar wenn Adresstyp SUPPLIER oder BOTH
- Freitextfeld (max. 50 Zeichen)

### Bestelldetail

In `src/components/warehouse/purchase-order-detail.tsx`:
- "Unsere Kundennummer: ABC-1234" unter der Lieferantenadresse anzeigen
- Nur wenn Wert vorhanden

### Bestelldruck (PDF) — siehe EK_01

- "Unsere Kundennr.: ABC-1234" im Kopfbereich des Bestelldrucks

---

## Service Layer

Minimale Änderung in `src/lib/services/crm-address-service.ts`:
- `ourCustomerNumber` in Create/Update Schema aufnehmen
- Keine spezielle Geschäftslogik nötig

---

## Tests

### Unit Tests

- `updateAddress` — `ourCustomerNumber` wird gespeichert und zurückgegeben
- `updateAddress` — Feld ist optional (null erlaubt)

### Router Tests

```ts
describe("crm.addresses", () => {
  it("update — saves ourCustomerNumber", async () => { })
  it("getById — returns ourCustomerNumber", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("ourCustomerNumber — Mandant A sieht Feld nur für eigene Adressen", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/55-crm-our-customer-number.spec.ts`

```ts
test.describe("UC-CRM-06: Unsere Kundennummer", () => {
  test("Kundennummer beim Lieferanten hinterlegen", async ({ page }) => {
    // 1. Lieferant öffnen
    // 2. "Unsere Kundennummer" ausfüllen
    // 3. Speichern → Wert bleibt erhalten
  })

  test("Kundennummer auf Bestellung sichtbar", async ({ page }) => {
    // 1. Bestellung für Lieferant mit Kundennummer erstellen
    // 2. In Bestelldetail prüfen: Kundennummer angezeigt
  })

  test("Feld nur bei Lieferanten sichtbar", async ({ page }) => {
    // 1. Reinen Kunden (kein Lieferant) öffnen
    // 2. Feld "Unsere Kundennummer" ist nicht sichtbar
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

Bestehende Tenant-Isolation der CRM-Adressen greift automatisch.

---

## Acceptance Criteria

- [ ] Feld `ourCustomerNumber` in `CrmAddress` Model (Migration)
- [ ] UI: Feld "Unsere Kundennummer" bei Lieferanten sichtbar
- [ ] UI: Feld bei reinen Kunden ausgeblendet
- [ ] Wert auf Bestelldetailseite angezeigt
- [ ] Wert im Bestelldruck (PDF) enthalten (wenn vorhanden)
- [ ] Cross-tenant isolation verified (Tests included)
