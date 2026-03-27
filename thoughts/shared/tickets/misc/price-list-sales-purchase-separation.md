# Preislisten: Trennung Verkauf (Sales) vs. Einkauf (Purchase)

## Problem

Das aktuelle Preislisten-System (`BillingPriceList`) ist konzeptionell nur fuer **Verkaufspreise**
ausgelegt — also Preise, die wir unseren Kunden berechnen. Es gibt jedoch keinen klaren
Mechanismus fuer **Einkaufspreislisten**, also Preise, die uns Lieferanten fuer ihre Artikel nennen.

### Ist-Zustand

**Verkauf (funktioniert):**
- `BillingPriceList` + `BillingPriceListEntry` — Preislisten mit Staffelpreisen, Gueltigkeitszeitraum
- `CrmAddress.priceListId` — Kunde wird einer Verkaufspreisliste zugeordnet
- `lookupPrice()` — sucht Preis in Kundenpreisliste, Fallback auf Default-Liste
- `entriesForAddress()` — Autocomplete beim Erstellen von Rechnungspositionen
- UI: `/orders/price-lists` (Billing-Modul) und `/warehouse/prices` (Warehouse-Modul)

**Einkauf (lueckenhaft):**
- `WhArticleSupplier.buyPrice` — einzelner Einkaufspreis pro Lieferant-Artikel-Zuordnung
- Kein Gueltigkeitszeitraum, keine Staffelpreise, keine Preishistorie
- Kein Equivalent zu `lookupPrice()` fuer den Einkauf
- Kein Autocomplete beim Erstellen von Purchase-Order-Positionen basierend auf Lieferantenpreisen
- `/warehouse/prices` UI arbeitet mit `BillingPriceList` — konzeptionell verwirrend, weil
  das Verkaufspreise sind, nicht Einkaufspreise

### Kernproblem

Ein User der im Warehouse-Modul unter `/warehouse/prices` Preise pflegt, denkt er pflegt
Einkaufspreise (weil Warehouse = Einkauf/Lager). Tatsaechlich pflegt er aber Verkaufspreise
(`BillingPriceList`). Das ist verwirrend und fehleranfaellig.

## Loesung: `type`-Feld auf bestehender `BillingPriceList`

Statt zwei separate Tabellen zu erstellen, wird die bestehende `BillingPriceList` um ein
`type`-Feld erweitert. Das minimiert den Migrationsaufwand und nutzt die bestehende
Infrastruktur (Staffelpreise, Gueltigkeit, Bulk-Import, Audit-Trail).

### Alternative verworfen: Zwei getrennte Tabellen

Wurde verworfen, weil:
- 90% der Logik identisch waere (CRUD, Entries, Lookup, Bulk-Import)
- Doppelter Wartungsaufwand fuer Service, Repository, Router, Hooks, UI-Komponenten
- Ein `type`-Feld ist einfacher und erweiterbar (z.B. spaeter "transfer" fuer interne Verrechnungspreise)

## Anforderungen

### 1. Datenmodell-Erweiterung

**Migration: `billing_price_lists` um `type`-Spalte erweitern**

```sql
-- Neues Feld: type ('sales' oder 'purchase')
ALTER TABLE billing_price_lists
  ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'sales';

-- Bestehende Daten sind alle Verkaufspreislisten
-- Default 'sales' sorgt dafuer, dass Bestandsdaten korrekt sind

-- Index fuer typ-basierte Abfragen
CREATE INDEX idx_billing_price_lists_tenant_type
  ON billing_price_lists (tenant_id, type);

-- Separate Defaults pro Typ erlauben
DROP INDEX IF EXISTS idx_billing_price_lists_tenant_default;
CREATE UNIQUE INDEX uq_billing_price_lists_tenant_type_default
  ON billing_price_lists (tenant_id, type) WHERE is_default = true;
```

**Prisma-Schema Aenderung:**

```prisma
model BillingPriceList {
  // ... bestehende Felder ...
  type        String   @default("sales") @db.VarChar(20)  // 'sales' | 'purchase'

  @@index([tenantId, type])
  // unique constraint: nur eine Default-Liste pro Typ
}
```

**Umbenennung (optional, aber empfohlen):**

Da die Tabelle jetzt nicht mehr nur fuer Billing ist, koennte man das Prisma-Model
zu `PriceList` umbenennen (DB-Tabelle kann `billing_price_lists` bleiben via `@@map`).
Das ist allerdings ein grosses Refactoring und kann als separates Ticket erfolgen.

### 2. CrmAddress: Zwei Preislisten-Zuordnungen

Aktuell hat `CrmAddress` ein einzelnes `priceListId`-Feld. Fuer die Trennung brauchen wir:

```prisma
model CrmAddress {
  // ... bestehende Felder ...
  salesPriceListId    String? @map("sales_price_list_id") @db.Uuid
  purchasePriceListId String? @map("purchase_price_list_id") @db.Uuid

  // Altes Feld 'priceListId' migrieren zu 'salesPriceListId', dann entfernen
}
```

**Migration:**
```sql
-- Neues Feld fuer Einkaufspreisliste
ALTER TABLE crm_addresses
  ADD COLUMN purchase_price_list_id UUID REFERENCES billing_price_lists(id);

-- Bestehende Zuordnungen sind Verkaufspreislisten → umbenennen
ALTER TABLE crm_addresses
  RENAME COLUMN price_list_id TO sales_price_list_id;

CREATE INDEX idx_crm_addresses_purchase_price_list
  ON crm_addresses (tenant_id, purchase_price_list_id);
```

### 3. Service-Aenderungen

**`billing-price-list-service.ts`:**

Alle Funktionen um `type`-Parameter erweitern:

```typescript
// Bisherig:
export async function list(prisma, tenantId, params: { isActive?, search?, page, pageSize })

// Neu:
export async function list(prisma, tenantId, params: { type: 'sales' | 'purchase', isActive?, search?, page, pageSize })
```

Betroffene Funktionen:
- `list()` — filtern nach type
- `create()` — type als Pflichtfeld
- `setDefault()` — Default nur innerhalb desselben Typs setzen/unsetten
- `lookupPrice()` — fuer Verkauf: `salesPriceListId` nutzen, fuer Einkauf: `purchasePriceListId`
- `entriesForAddress()` — type-Parameter um richtige Preisliste zu waehlen

**`wh-article-price-service.ts`:**

Sollte standardmaessig mit `type: 'purchase'` arbeiten, da es aus dem Warehouse-Kontext aufgerufen wird.

### 4. Router-Aenderungen

**`billing/priceLists.ts`:**
- Alle Procedures bekommen optionalen `type`-Input (default: `'sales'`)
- Oder: Separater Router `billing.purchasePriceLists` (klarer, aber mehr Code)

**`warehouse/articlePrices.ts`:**
- Filtert automatisch auf `type: 'purchase'`
- Erstellt neue Preislisten mit `type: 'purchase'`

### 5. UI-Aenderungen

**`/orders/price-lists` (Billing-Modul):**
- Zeigt nur `type: 'sales'` Preislisten
- Label: "Verkaufspreislisten"
- Keine Aenderung an der grundlegenden Funktionalitaet

**`/warehouse/prices` (Warehouse-Modul):**
- Zeigt nur `type: 'purchase'` Preislisten
- Label: "Einkaufspreislisten"
- Gleiche 3-Panel-UI, aber kontextbezogen auf Einkauf

**CRM Adress-Formular (`address-form-sheet.tsx`):**
- Zwei Dropdowns statt eines:
  - "Verkaufspreisliste" (nur `type: 'sales'` Listen)
  - "Einkaufspreisliste" (nur `type: 'purchase'` Listen, nur bei Lieferanten relevant)
- Einkaufspreislisten-Dropdown nur anzeigen wenn Adresse vom Typ "Lieferant" ist

**Purchase-Order Erstellung:**
- Beim Hinzufuegen einer Position: Autocomplete basierend auf `purchasePriceListId` des Lieferanten
- Fallback: `WhArticleSupplier.buyPrice` wenn keine Einkaufspreisliste zugewiesen
- Analog zu `lookupPrice()` aber mit `type: 'purchase'`

### 6. Lookup-Logik Einkauf (neu)

```
lookupPurchasePrice(tenantId, supplierId, articleId, quantity?)
  1. Lieferant hat purchasePriceListId?
     → Eintrag suchen (Artikel + Gueltigkeit + Staffel)
  2. Kein Treffer? → Default-Einkaufspreisliste des Mandanten
  3. Kein Treffer? → WhArticleSupplier.buyPrice als letzter Fallback
  4. Nichts? → null (manuell eingeben)
```

### 7. Migration bestehender WhArticleSupplier.buyPrice Daten

Optional aber empfohlen: Bestehende `WhArticleSupplier.buyPrice`-Werte koennen in
Einkaufspreislisten migriert werden:

```sql
-- Pro Lieferant eine Einkaufspreisliste erstellen
-- Bestehende buyPrice-Werte als Entries importieren
-- buyPrice-Feld auf WhArticleSupplier perspektivisch deprecaten
```

Dies ist ein separater Migrationsschritt und kann spaeter erfolgen.

## Betroffene Dateien

### Backend
- `prisma/schema.prisma` — type-Feld auf BillingPriceList, zwei FK auf CrmAddress
- `supabase/migrations/` — neue Migration
- `src/lib/services/billing-price-list-service.ts` — type-Parameter ueberall
- `src/lib/services/billing-price-list-repository.ts` — type in Queries
- `src/lib/services/wh-article-price-service.ts` — default type 'purchase'
- `src/trpc/routers/billing/priceLists.ts` — type-Input
- `src/trpc/routers/warehouse/articlePrices.ts` — type 'purchase' hardcoded

### Frontend
- `src/components/billing/price-list-list.tsx` — Header "Verkaufspreislisten"
- `src/components/billing/price-list-form-sheet.tsx` — type mitgeben
- `src/components/warehouse/price-management.tsx` — Label "Einkaufspreislisten"
- `src/components/warehouse/price-list-selector.tsx` — filtert auf purchase
- `src/components/crm/address-form-sheet.tsx` — zwei Dropdowns
- `src/hooks/use-billing-price-lists.ts` — type-Parameter
- `src/hooks/use-wh-article-prices.ts` — type 'purchase' default

### i18n
- Neue Keys: `priceLists.sales.title`, `priceLists.purchase.title`, etc.
- Bestehende Keys anpassen wo noetig

## Nicht im Scope

- Umbenennung `BillingPriceList` → `PriceList` (separates Refactoring-Ticket)
- Migration von `WhArticleSupplier.buyPrice` in Einkaufspreislisten (separates Ticket)
- Preisvergleich zwischen Lieferanten (Feature-Ticket)
- Waehrungsunterstuetzung (separates Ticket)

## Risiken

- **Bestehende Daten:** Alle existierenden Preislisten bekommen `type: 'sales'` via Default.
  Kein Datenverlust, aber Admins muessen Einkaufspreislisten manuell neu anlegen.
- **CrmAddress.priceListId Rename:** Das Umbenennen der Spalte zu `sales_price_list_id`
  erfordert, dass alle Referenzen im Code aktualisiert werden. Sorgfaeltig testen.
- **Warehouse `/prices` UI:** User die bisher dort Verkaufspreise gepflegt haben,
  sehen diese nach der Aenderung dort nicht mehr (weil jetzt `type: 'purchase'` gefiltert wird).
  → Klare Kommunikation / Release Notes noetig.

## Schaetzung

- Migration + Schema: ~0.5 Tage
- Service + Repository Anpassungen: ~1 Tag
- Router Anpassungen: ~0.5 Tage
- Frontend (UI, Hooks, i18n): ~1-1.5 Tage
- Tests: ~0.5 Tage
- **Gesamt: ~3-4 Tage**
