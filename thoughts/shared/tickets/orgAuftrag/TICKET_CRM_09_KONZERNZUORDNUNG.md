# CRM_09 — Konzern-/Filialen-Zuordnung

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | CRM_01 (Adressen) |
| **Complexity** | M |
| **Priority** | Mittlere Priorität |
| **New Models** | — (Self-Referenz in `CrmAddress`) |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. Adressen: Konzernzugehörigkeit für Auswertungen — eine Adresse kann einem "Konzern" (Muttergesellschaft) zugeordnet werden. Filialen und Tochtergesellschaften gruppiert unter dem Konzern. Ermöglicht aggregierte Auswertungen über den gesamten Firmenverbund.

---

## Terp aktuell

- CRM-Adressen sind flach, keine hierarchische Beziehung
- Filialstrukturen (z.B. Mercedes Stuttgart → Mercedes Werk Sindelfingen) können nicht abgebildet werden
- Umsatzauswertungen nur pro Einzeladresse, nicht über Firmenverbünde

---

## Goal

Eine hierarchische Parent-Child-Beziehung bei CRM-Adressen einführen. Eine Adresse kann eine "Konzernmutter" sein (Parent), andere Adressen können als "Filialen/Tochtergesellschaften" (Children) zugeordnet werden. Ermöglicht aggregierte Auswertungen und Konzernübersichten. Maximal 2 Ebenen (Konzern → Filiale).

---

## Schema-Änderungen

### CrmAddress Erweiterung

```prisma
model CrmAddress {
  // ... bestehende Felder ...
  parentAddressId  String?  @map("parent_address_id") @db.Uuid

  parentAddress    CrmAddress?  @relation("AddressHierarchy", fields: [parentAddressId], references: [id], onDelete: SetNull)
  childAddresses   CrmAddress[] @relation("AddressHierarchy")
}
```

---

## Validierungsregeln

- Maximal 2 Ebenen: Ein Kind darf nicht selbst Kinder haben → `parentAddressId` nur setzen wenn die Adresse selbst keine Children hat
- Zirkuläre Referenzen verhindern: Eine Adresse kann nicht ihr eigener Parent sein
- Parent muss zum gleichen Tenant gehören
- Parent muss vom gleichen Typ sein (Kunde kann nicht Filiale eines Lieferanten sein)

---

## Service Layer

**File:** Erweiterung von `src/lib/services/crm-address-service.ts`

```ts
export async function setParentAddress(prisma, tenantId, addressId, parentAddressId) {
  // 1. Beide Adressen laden + Tenant validieren
  // 2. Zirkuläre Referenz prüfen
  // 3. Tiefe prüfen (max. 2 Ebenen)
  // 4. Typ-Kompatibilität prüfen
  // 5. parentAddressId setzen
}

export async function getAddressWithHierarchy(prisma, tenantId, addressId) {
  // Adresse laden mit parent und children (1 Ebene)
}

export async function getGroupRevenue(prisma, tenantId, parentAddressId, dateRange) {
  // Aggregierter Umsatz über Parent + alle Children
}
```

---

## tRPC Router Erweiterungen

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `setParent` | mutation | `crm_addresses.edit` | `{ id, parentAddressId \| null }` | Konzernzuordnung setzen/entfernen |
| `getHierarchy` | query | `crm_addresses.view` | `{ id }` | Adresse mit Parent + Children |
| `getGroupStats` | query | `crm_addresses.view` | `{ parentId, dateFrom?, dateTo? }` | Aggregierte Umsätze über Konzern |

---

## UI Components

### Adressdetail — Konzern-Bereich

In `src/components/crm/address-detail.tsx`:
- Neuer Abschnitt "Firmenverbund" (nur wenn relevant)
- Wenn Filiale: "Gehört zu: [Konzernname]" mit Link
- Wenn Konzern: Liste der Filialen/Tochtergesellschaften
- Button "Konzernzuordnung ändern" → Adress-Suchfeld

### Adressliste — Konzern-Indikator

- Kleines Icon in der Adressliste wenn Adresse Filialen hat (Baum-Icon)
- Tooltip: "Konzern mit X Filialen"

### Konzern-Übersicht

Optional: In CRM-Auswertungen ein Tab "Konzerne":
- Liste aller Konzernmütter mit Anzahl Filialen
- Aggregierter Umsatz pro Konzerngruppe
- Aufklappbar: Filialen mit Einzelumsätzen

---

## Hooks

**File:** Erweiterung von `src/hooks/use-crm-addresses.ts`

```ts
export function useCrmAddressHierarchy(id: string) { /* getHierarchy */ }
export function useSetCrmAddressParent() { /* setParent mutation */ }
export function useCrmGroupStats(parentId: string, dateRange?) { /* getGroupStats */ }
```

---

## Tests

### Unit Tests (Service)

**File:** Erweiterung von `src/lib/services/__tests__/crm-address-service.test.ts`

- `setParent` — setzt parentAddressId korrekt
- `setParent` — rejects zirkuläre Referenz (A → B → A)
- `setParent` — rejects wenn Kind bereits Kinder hat (max. 2 Ebenen)
- `setParent` — rejects Cross-Tenant-Zuordnung
- `setParent` — null entfernt die Zuordnung
- `getHierarchy` — gibt Parent und Children zurück
- `getGroupRevenue` — aggregiert Umsätze korrekt

### Router Tests

```ts
describe("crm.addresses.hierarchy", () => {
  it("setParent — creates parent-child relationship", async () => { })
  it("setParent — rejects circular reference", async () => { })
  it("getHierarchy — returns full hierarchy", async () => { })
  it("getGroupStats — returns aggregated revenue", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("setParent — Mandant A kann keinen Parent aus Mandant B zuweisen", async () => { })
  it("getHierarchy — zeigt nur eigene Adressen", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/58-crm-group-hierarchy.spec.ts`

```ts
test.describe("UC-CRM-09: Konzernzuordnung", () => {
  test("Filiale einem Konzern zuordnen", async ({ page }) => {
    // 1. Konzern-Adresse und Filial-Adresse anlegen
    // 2. Filiale öffnen → Konzernzuordnung → Konzern suchen und zuweisen
    // 3. Bei Filiale: "Gehört zu: Konzernname"
    // 4. Bei Konzern: Filiale in Liste sichtbar
  })

  test("Konzernzuordnung entfernen", async ({ page }) => {
    // 1. Filiale öffnen → Konzernzuordnung entfernen
    // 2. "Gehört zu" verschwindet
  })

  test("Konzern-Übersicht zeigt aggregierte Daten", async ({ page }) => {
    // 1. CRM Auswertungen → Konzerne
    // 2. Konzern aufklappen → Filialen mit Umsätzen sichtbar
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Repository Layer
- Parent-Child-Beziehungen MÜSSEN innerhalb eines Tenants bleiben
- `setParent` MUSS validieren dass beide Adressen zum gleichen Tenant gehören

### Service Layer
- Aggregationsqueries MÜSSEN `tenantId` filtern
- Keine Cross-Tenant-Hierarchien möglich

### Tests (MANDATORY)
- Cross-Tenant Parent-Zuweisung MUSS fehlschlagen

---

## Acceptance Criteria

- [ ] `parentAddressId` Feld in `CrmAddress` (Self-Referenz, Migration)
- [ ] Maximal 2 Ebenen (Konzern → Filiale)
- [ ] Zirkuläre Referenzen verhindert
- [ ] Parent muss zum gleichen Tenant gehören
- [ ] UI: "Firmenverbund" Bereich in Adressdetail
- [ ] UI: Konzern-Indikator in Adressliste
- [ ] Aggregierte Umsatzauswertung pro Konzerngruppe
- [ ] Cross-tenant isolation verified (Tests included)
