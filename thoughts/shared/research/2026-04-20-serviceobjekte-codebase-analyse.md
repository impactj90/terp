---
date: 2026-04-20T22:54:49+02:00
researcher: impactj90
git_commit: bef008ba7e3e217a5ed8be497ba67b072791bc2d
branch: staging
repository: terp
topic: "Serviceobjekte — Datenmodell-Vorbereitung (IST-Zustand)"
tags: [research, codebase, serviceobjekte, prisma-schema, stock-movement, attachments, permissions, multi-tenancy, platform-isolation, vocabulary]
status: complete
last_updated: 2026-04-20
last_updated_by: impactj90
---

# Research: Serviceobjekte — Codebase-Analyse (IST-Zustand)

**Date**: 2026-04-20T22:54:49+02:00
**Researcher**: impactj90
**Git Commit**: bef008ba7e3e217a5ed8be497ba67b072791bc2d
**Branch**: staging
**Repository**: terp

## Research Question

Vor einem Plan für das neue **Serviceobjekte-Modul** (zentrale Anlagen-/
Objekt-Stammdaten für mobile Service-Dienstleister — Anker Pro-Di
industrielle Wartung, plus Gebäudereinigung, DGUV-V3, Aufzugs-Service,
Brandschutz, TGA/Kälte-Klima, Tor-Service, Schädlingsbekämpfung,
Sicherheitstechnik, Medizintechnik, Grünpflege) ist der IST-Zustand des
Codes vollständig zu dokumentieren:

1. **Implizite Objekt-Referenzen** im bestehenden Code (Prisma-Schema,
   tRPC-Router, UI, Migrations, i18n, E2E-Tests)
2. **Entitäten, an die sich Serviceobjekte anbinden werden**
   (CrmCompany/CrmAddress, Order, WarehouseItem/WhArticle, StockMovement,
   Attachment, InboundInvoice)
3. **Wiederverwendbare Muster** (Multi-Tenancy, Hierarchien, Berechtigungen,
   Attachments, Audit-Log, Seed-Mechanismus, QR-Codes, Service+Repository)
4. **Platform-Isolation** (pure-Terp-Modul ohne Platform-Abhängigkeit)
5. **Vokabel-Audit** (deutsche Terminologie für objekt-bezogene Konzepte)

Kein Plan, keine Empfehlungen, keine Architektur-Entscheidungen — nur
IST-Zustand als Grundlage für den nachfolgenden `/create_plan`-Lauf.

## Summary

Der Terp-Code enthält **genau eine persistierte Objekt-Referenz** heute:
die Spalte `WhStockMovement.machineId` (nullable `TEXT`, kein FK, kein
UUID — reines Freitext-Feld). Sie existiert ausschließlich im
Warehouse-Modul zur Zuordnung von Lagerentnahmen zu einer externen
Maschinen-/Geräte-Kennung. Alle anderen Treffer sind Labels, Enum-Werte
des tRPC-/UI-Layers (`"MACHINE"` in `referenceTypeEnum`) oder
Test-Assertions.

Zentrale Parent-Entität für eine Serviceobjekt-Hierarchie ist
**`CrmAddress`** (es gibt **kein** Modell `CrmCompany` — die Terp-CRM
nutzt `CrmAddress` mit `type: CUSTOMER | SUPPLIER | BOTH`).
`CrmAddress` hat bereits Self-Referencing via `parentAddressId`
(Adjacency-List, Relation-Name `"AddressHierarchy"`). `Order` hat heute
keine Objekt-Referenz. `WhArticle` hat ein N:M-BOM (`WhBillOfMaterial`)
als Stückliste. `InboundInvoice` kennt heute `orderId` und
`costCenterId`, aber keine Objekt-Referenz.

**Attachments sind nicht polymorph** — Terp nutzt pro Entität eine
eigene Tabelle (`CrmCorrespondenceAttachment`, `HrPersonnelFileAttachment`,
`EmailDefaultAttachment`, `WhArticleImage`). Ein zentrales
`Attachment`-Modell existiert nicht.

**Multi-Tenancy** ist App-Layer-Enforcement: `tenantId` auf jedem
Top-Level-Modell; `x-tenant-id`-Header wird in `src/trpc/init.ts`
gelesen und von `tenantProcedure` (`src/trpc/init.ts:354`) gegen
`user.userTenants` validiert. Keine Postgres-RLS-Policies aktiv.

**Hierarchien** werden durchgängig als **Adjacency-List** modelliert
(parent-FK + Relation-Name). Beispiele: `Department.DepartmentTree`
(`schema.prisma:1768-1794`), `WhArticleGroup.ArticleGroupTree`
(`schema.prisma:5139-5155`), `CrmAddress.AddressHierarchy`
(`schema.prisma:465-533`). Keine Materialized-Path-, Closure-Table-
oder Nested-Set-Implementierungen.

**Berechtigungen** folgen `<namespace>.<action>` (z. B. `crm_addresses.view`,
`wh_stock.manage`). Namensräume sind in
`src/lib/auth/permission-catalog.ts` katalogisiert; IDs sind
deterministische UUID v5 (Namespace
`f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`). Die Module-Permissions-Map
in `ALL_PERMISSIONS` enthält aktuell über 100 Einträge verteilt auf
~70 Namensräume.

**Seed-Mechanismus** ist zweistufig: `supabase/seed.sql` setzt die
Dev-Datenbank auf; zur Tenant-Erstellung werden per
`src/lib/tenant-templates/seed-universal-defaults.ts:49-93` Defaults
(Reminder-Templates, Email-Templates, Reminder-Settings) in einer
Transaktion über Terp-Services gesetzt. Krankenkassen, Lohnarten,
Personengruppenschlüssel werden nicht in aktuellem TypeScript-Code
geseedet — entweder über Migrations oder außerhalb des Terp-Scopes.

**QR-Codes** werden serverseitig mit `qrcode`
(`wh-qr-service.ts:9`) erzeugt und clientseitig mit `html5-qrcode`
(`qr-scanner.tsx:94`) gescannt. Payload-Schema:
`TERP:ART:{tenantIdFirst6Chars}:{articleNumber}` (validiert in
`wh-qr-service.ts:40-52`).

**Platform-Isolation** ist verifiziert: `src/trpc/routers/` und
`src/lib/services/` haben **null Imports** aus `@/lib/platform` oder
`@/trpc/platform`. Ein neues reines Terp-Modul (wie das vorhandene
`overtime-requests` auf Staging) kommt ohne Platform-Layer-Änderungen
aus.

**Vokabel-Audit**: Die deutschen Begriffe **Anlage** (8×), **Maschine**
(17×, meist als Teil von „Maschinenbau GmbH" in Beispielen),
**Gerät** (3×, stets gepaart mit Maschine), **Objekt** (27× über alle
Handbücher), **Referenztyp** (4×), **Einrichtung** (2× in Prosa).
Komplett unbenutzt: `Serviceobjekt`, `Prüfobjekt`, `Wartungsobjekt`,
`Kundenobjekt`, `Anlagenverzeichnis`. „Anlage" ist homonym (Erstellung
vs. Anlageform vs. Regulatorik) und kollidiert nicht mit
Objekt-Semantik.

## Detailed Findings

### 1. Implizite Objekt-Referenzen im bestehenden Code

#### 1.1 Prisma-Schema

**Einzige persistierte Objekt-Referenz**: `WhStockMovement.machineId`
([`prisma/schema.prisma:5395`](prisma/schema.prisma#L5395))

```prisma
machineId                String?             @map("machine_id")
```

- Nullable `TEXT` (kein `@db.Uuid`, kein `@relation`, kein FK)
- Index: `@@index([tenantId, machineId])` ([`schema.prisma:5411`](prisma/schema.prisma#L5411))
- Koexistiert mit anderen Referenz-Feldern (`orderId`, `documentId`,
  `purchaseOrderId`, `inventorySessionId`) — Non-polymorphic:
  mehrere nullable FK-Spalten nebeneinander statt
  `entityType`+`entityId`-Muster

**Stockmovement-Enum** (nicht objekt-bezogen, aber Kontext):
`WhStockMovementType` ([`schema.prisma:5269-5278`](prisma/schema.prisma#L5269-L5278)):
`GOODS_RECEIPT | WITHDRAWAL | ADJUSTMENT | INVENTORY | RETURN | DELIVERY_NOTE` — enthält **keinen** MACHINE/DEVICE-Wert (Maschine ist Referenztyp, nicht Bewegungstyp).

**Keine anderen Prisma-Spalten/-Enums mit Namen** wie
`machineRef`, `machineNumber`, `equipmentId`, `assetId`, `objectRef`,
`objectName`, `locationRef`, `deviceId`, `anlage`, `geraet`,
`referenceType`, `refType` gefunden. Keine Enum-Werte `MACHINE`,
`DEVICE`, `ASSET`, `OBJECT`, `EQUIPMENT` im Prisma-Schema.

#### 1.2 Datenbank-Migrationen

**Einzige relevante Migration**: `supabase/migrations/20260326100000_wh_stock_movement_machine_id.sql`
```sql
-- WH_05: Add machine_id column for equipment/machine withdrawal references
ALTER TABLE wh_stock_movements ADD COLUMN machine_id TEXT;
CREATE INDEX idx_wh_stock_movements_tenant_machine
  ON wh_stock_movements (tenant_id, machine_id) WHERE machine_id IS NOT NULL;
```
Partieller Index (nur wenn `machine_id IS NOT NULL`). Keine zurückgerollten/ersetzten Migrationsversuche für Maschinen-/Objekt-Entitäten in der Historie.

#### 1.3 tRPC-Router

`src/trpc/routers/warehouse/withdrawals.ts`:

- **`referenceTypeEnum` (Line 24)**: `z.enum(["ORDER", "DOCUMENT", "MACHINE", "NONE"])` — Client-seitige Abstraktion; der Service-Layer mapt den gewählten Typ auf die entsprechenden FK-Spalten in `WhStockMovement`
- **`create`-Input (Line 34-36)**:
  ```ts
  referenceType: referenceTypeEnum,
  referenceId: z.string().optional(),
  machineId: z.string().optional(),
  ```
- **`createBatch`-Input (Line 63-65)**: gleiche drei Felder
- **`list`-Filter (Line 124)**: `machineId: z.string().optional()` als Query-Parameter

#### 1.4 Service-Layer

`src/lib/services/wh-withdrawal-service.ts`:

- **Type (Line 31)**: `type ReferenceType = "ORDER" | "DOCUMENT" | "MACHINE" | "NONE"`
- **`CreateWithdrawalInput.machineId?` (Line 38)**, **`CreateBatchWithdrawalInput.machineId?` (Line 45)**
- **`resolveReferences()` (Line 52-57)** — Map-Logik:
  ```ts
  machineId: referenceType === "MACHINE"
    ? (machineId || referenceId || null)
    : null
  ```
- **`create()` (Line 95, 108)** setzt `machineId: refs.machineId` auf der `WhStockMovement`-Zeile
- **`list()` (Line 369-370)** filtert nach `where.machineId = params.machineId`

#### 1.5 UI-Komponenten

`src/components/warehouse/withdrawal-terminal.tsx`:

- **Type (Line 30)**: `type ReferenceType = 'ORDER' | 'DOCUMENT' | 'MACHINE' | 'NONE'`
- **State-Feld (Line 42)**: `machineId: string`
- **`REF_TYPE_CONFIG` (Line 53-83)**: Array von 4 Referenztyp-Karten mit Icons (Wrench für MACHINE) und i18n-Keys
- **Validation (Line 109)**: Bei `MACHINE` muss `machineId` nicht-leer sein
- **Submit-Payload (Line 163)**: `machineId: state.referenceType === 'MACHINE' ? state.machineId || undefined : undefined`
- **Dynamische Labels (Line 189, 200, 319-325)**: Zeigen `"Maschinen-ID"` vs. `"Referenz"` je nach Typ

`src/components/warehouse/withdrawal-history.tsx`:
- **Line 38**: Prop-Type `movement: { orderId?, documentId?, machineId? }`
- **Line 56-62**: Display-Logik — zeigt Wrench-Icon + Machine-ID (amber-500) bei `machineId`

`src/components/warehouse/scanner-terminal.tsx`:
- **Line 238, 542**: Quick-Withdrawal-Flow nutzt denselben `referenceType`-Mechanismus

#### 1.6 i18n-Messages

`messages/de.json`:
- **Line 6473**: `"labelReferenceType": "Referenztyp"`
- **Line 6475**: `"labelMachineId": "Maschinen-/Geräte-ID"`
- **Line 6479**: `"refTypeMachine": "Maschine/Gerät"`
- **Line 6483**: `"refTypeMachineDesc": "Entnahme einer Maschine oder einem Gerät zuordnen"`
- **Line 6487**: `"refPlaceholderMachine": "Maschinen-ID eingeben..."`

`messages/en.json` (Zeilen spiegeln de.json):
- **Line 6475**: `"Machine/Equipment ID"`
- **Line 6479**: `"Machine/Equipment"`
- **Line 6483**: `"Assign withdrawal to a machine or device"`

#### 1.7 E2E-Tests

`src/e2e-browser/44-wh-withdrawals.spec.ts`:
- **Line 36**: `expect(main.getByRole("button", { name: /Maschine/i })...)`
- **Line 169**: Comment `// Step 1: Select "Maschine/Gerät" reference type`
- **Line 170**: `main.getByRole("button", { name: /Maschine/i }).first()`
- **Line 177**: `main.locator('input[placeholder*="Maschinen-ID"]').first()`
- **Line 180**: `machineInput.fill("M-001")`

#### 1.8 Zusammenfassungstabelle

| Konzept | Datei:Zeile | Art | Persistiert? | Hinweis |
|---------|-------------|-----|-------------|---------|
| `machineId` (Spalte) | `prisma/schema.prisma:5395` | Column | **Ja** | `String?`, kein FK, kein UUID |
| `@@index([tenantId, machineId])` | `prisma/schema.prisma:5411` | Index | Ja | DB-Index |
| Migration `add machine_id` | `supabase/migrations/20260326100000_wh_stock_movement_machine_id.sql` | Migration | Ja | Partieller Index |
| `referenceTypeEnum` (Zod) | `src/trpc/routers/warehouse/withdrawals.ts:24` | Zod-Enum | Nein | Values: ORDER\|DOCUMENT\|MACHINE\|NONE |
| `machineId` (create input) | `src/trpc/routers/warehouse/withdrawals.ts:36` | Input-Feld | → Ja | Gemapt auf Spalte |
| `machineId` (createBatch) | `src/trpc/routers/warehouse/withdrawals.ts:65` | Input-Feld | → Ja | |
| `machineId` (list filter) | `src/trpc/routers/warehouse/withdrawals.ts:124` | Query-Param | Nein | Filter |
| `ReferenceType` (Service-Type) | `src/lib/services/wh-withdrawal-service.ts:31` | TS-Type | Nein | Interner Typ |
| `resolveReferences()` | `src/lib/services/wh-withdrawal-service.ts:52-57` | Helper | Nein | Maps Type → DB-FK |
| `ReferenceType` (UI-Type) | `src/components/warehouse/withdrawal-terminal.tsx:30` | TS-Type | Nein | UI-State |
| `REF_TYPE_CONFIG` | `src/components/warehouse/withdrawal-terminal.tsx:53-83` | Config-Array | Nein | Karten-Auswahl |
| `machineId` (UI-State) | `src/components/warehouse/withdrawal-terminal.tsx:42` | State | Nein | Client-only |
| `labelMachineId` | `messages/de.json:6475` | i18n-Label | Nein | "Maschinen-/Geräte-ID" |
| `refTypeMachine` | `messages/de.json:6479` | i18n-Label | Nein | "Maschine/Gerät" |
| `refTypeMachineDesc` | `messages/de.json:6483` | i18n-Label | Nein | Beschreibung |
| `refPlaceholderMachine` | `messages/de.json:6487` | i18n-Label | Nein | Placeholder |
| E2E-Assertions (Maschine) | `src/e2e-browser/44-wh-withdrawals.spec.ts:36,170,177,180` | Test-Code | Nein | Testdaten |

**Kernerkenntnis**: Nur **ein** persistiertes Feld
(`WhStockMovement.machineId`) trägt heute das Konzept „Maschine/Gerät".
Es ist ein Freitext-TEXT ohne Entitäts-Bindung. Kein Modul außer dem
Warehouse-Withdrawal-Flow referenziert Maschinen/Objekte/Anlagen.

### 2. Entitäten, an die sich Serviceobjekte anbinden werden

#### 2.1 `CrmAddress` (parent der CRM-Hierarchie; **`CrmCompany` existiert nicht**)

**Hinweis**: Der Forschungsauftrag nannte `CrmCompany`. Im Schema existiert
**kein** `CrmCompany`-Modell. Kunde und Lieferant sind `CrmAddress` mit
`type` im Enum `CrmAddressType` (`CUSTOMER | SUPPLIER | BOTH`).

**Prisma-Modell**: [`prisma/schema.prisma:465-533`](prisma/schema.prisma#L465-L533)

Wesentliche Felder:
- `id`, `tenantId`, `number` (VarChar(50), eindeutig pro Tenant)
- `type: CrmAddressType`, `company`, `street`, `zip`, `city`, `country`
- `phone`, `fax`, `email`, `website`, `taxNumber`, `vatId`, `leitwegId`, `matchCode`
- `paymentTermDays`, `discountPercent`, `discountDays`, `discountGroup`
- `salesPriceListId`, `purchasePriceListId`, `dunningBlocked`, `dunningBlockReason`
- `parentAddressId` — **Self-Referencing via Relation-Name `"AddressHierarchy"`**
- Audit-Felder: `isActive`, `createdAt`, `updatedAt`, `createdById`

**Outbound-Relations**: `tenant`, `parentAddress`, `childAddresses`, `contacts`, `bankAccounts`, `correspondences`, `inquiries`, `tasks`, `billingDocuments` (+ 2 Varianten), `billingServiceCases`, `billingRecurringInvoices`, `salesPriceList`, `purchasePriceList`, `articleSuppliers`, `purchaseOrders`, `supplierInvoices`, `inboundInvoices`, `reminders`, `bankTransactionSuggestions`

**Indizes**: `uq_crm_addresses_tenant_number`, `idx_crm_addresses_tenant_id`, `idx_crm_addresses_tenant_type`, `idx_crm_addresses_tenant_match_code`, `idx_crm_addresses_tenant_company`, `idx_crm_addresses_parent_address`

**tRPC**: `src/trpc/routers/crm/addresses.ts` — Prozeduren: `list`, `getById`, `create`, `update`, `delete`, `getBankAccounts`, `createBankAccount`, `updateBankAccount`, `deleteBankAccount`, `getContacts`, `createContact`, `updateContact`, `deleteContact`

**Service**: `src/lib/services/crm-address-service.ts`
**Repository**: `src/lib/services/crm-address-repository.ts`

**UI-Pfade**:
- Liste: `src/app/[locale]/(dashboard)/crm/addresses/page.tsx`
- Detail: `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx`
- Form-Sheet: `src/components/crm/address-form-sheet.tsx`

#### 2.2 `Order`

**Prisma-Modell**: [`prisma/schema.prisma:2335-2368`](prisma/schema.prisma#L2335-L2368)

Wesentliche Felder:
- `id`, `tenantId`, `code` (VarChar(50), eindeutig pro Tenant), `name`, `description`
- `status` (VarChar(20), default `"active"`), `customer` (VarChar(255) — **freier Text, keine FK zu CrmAddress**)
- `costCenterId` (nullable FK zu CostCenter), `billingRatePerHour` (Decimal(10,2))
- `validFrom`, `validTo` (Dates), `isActive`
- Audit: `createdAt`, `updatedAt`

**Relations**:
- `tenant: Tenant @relation(...)` 
- `costCenter: CostCenter? @relation(fields: [costCenterId]...)`
- `assignments: OrderAssignment[]`
- `defaultForEmployees: Employee[] @relation("EmployeeDefaultOrder")`
- `orderBookings: OrderBooking[]`
- `crmInquiries: CrmInquiry[]`
- `billingDocuments: BillingDocument[]`
- `billingServiceCases: BillingServiceCase[]`
- `inboundInvoices: InboundInvoice[]`

**Indizes**: `orders_tenant_id_code_key`, `idx_orders_tenant`, `idx_orders_tenant_active`, `idx_orders_tenant_status`, `idx_orders_cost_center`

**Keine bestehende Referenz** zu einem Serviceobjekt/Maschine/Anlage/Gerät.
Der Kunde wird als Freitext-`customer`-Feld geführt, nicht als FK zu
`CrmAddress`.

**tRPC**: `src/trpc/routers/orders.ts` — `list`, `getById`, `create`, `update`, `delete`

**Service**: `src/lib/services/order-service.ts` + `order-repository.ts`

**UI-Pfade**:
- Liste: `src/app/[locale]/(dashboard)/admin/orders/page.tsx`
- Detail: `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`
- Form-Sheet: `src/components/orders/order-form-sheet.tsx`

#### 2.3 `WhArticle` (Artikelstamm)

**Prisma-Modell**: [`prisma/schema.prisma:5157-5198`](prisma/schema.prisma#L5157-L5198)

Wesentliche Felder:
- `id`, `tenantId`, `number` (eindeutig pro Tenant), `name`, `description`, `descriptionAlt`
- `groupId` (nullable FK zu `WhArticleGroup`), `matchCode`, `unit` (default `"Stk"`)
- `vatRate` (default 19.0), `sellPrice`, `buyPrice`, `discountGroup`, `orderType`
- `stockTracking`, `currentStock`, `minStock`, `warehouseLocation`, `images` (JsonB)
- `isActive`, Audit-Felder

**N:M-Stückliste vorhanden**: `WhBillOfMaterial` ([`schema.prisma:5245-5259`](prisma/schema.prisma#L5245-L5259)) mit `parentArticleId`, `childArticleId`, `quantity`, `sortOrder`, optional `notes`. Relation-Namen: `"BomParent"` und `"BomChild"`.

**Indizes**: `uq_wh_articles_tenant_number`, `[tenantId, groupId]`, `[tenantId, matchCode]`, `[tenantId, name]`, `[tenantId, isActive]`

**tRPC**: `src/trpc/routers/warehouse/articles.ts` — `list`, `getById`, `create`, `update`, `delete`, + Group-Prozeduren, + Image-Prozeduren

**Service**: `src/lib/services/wh-article-service.ts`, `wh-article-group-service.ts`, `wh-article-image-service.ts`

**UI-Pfade**:
- Liste: `src/app/[locale]/(dashboard)/warehouse/articles/page.tsx`
- Detail: `src/app/[locale]/(dashboard)/warehouse/articles/[id]/page.tsx`
- Components: `src/components/warehouse/article-form-sheet.tsx`, `article-detail.tsx`

#### 2.4 `WhStockMovement` (Lagerbewegung)

**Prisma-Modell**: [`prisma/schema.prisma:5380-5413`](prisma/schema.prisma#L5380-L5413)

Felder (vollständig):
```prisma
id                      String @id
tenantId                String
articleId               String               // FK zu WhArticle
type                    WhStockMovementType  // Enum
quantity                Float
previousStock           Float
newStock                Float
date                    DateTime

purchaseOrderId         String?   // FK zu WhPurchaseOrder (nullable)
purchaseOrderPositionId String?   // keine explizite Relation
documentId              String?   // FK zu BillingDocument (keine @relation)
orderId                 String?   // FK zu Order (keine @relation)
inventorySessionId      String?   // FK zu WhStocktake (nullable)
machineId               String?   // @map("machine_id") — TEXT, KEIN UUID, KEIN FK
reason                  String?
notes                   String?
createdById             String?
createdAt               DateTime
```

**Enum `WhStockMovementType`**: `GOODS_RECEIPT | WITHDRAWAL | ADJUSTMENT | INVENTORY | RETURN | DELIVERY_NOTE`

**Relations**: `tenant`, `article`, `purchaseOrder`, `stocktake` (nur für `inventorySessionId`). Die Felder `documentId` und `orderId` haben **keine `@relation`-Declarations** — sie sind nur SQL-Level-FKs ohne Prisma-Navigation.

**Referenztyp-Enkodierung**: Das `referenceType` aus dem tRPC-Input existiert **nicht als DB-Spalte**; der Service wählt anhand des Typs die passende der vier nullable FK-Spalten (`orderId`, `documentId`, `machineId`) bzw. keine (`NONE`).

**Immutabilität**: Kein `updatedAt` — Bewegungen sind append-only.

**Indizes**: `[tenantId, articleId]`, `[tenantId, type]`, `[tenantId, date]`, `[tenantId, purchaseOrderId]`, `[tenantId, machineId]`

**tRPC-Input für Create-Withdrawal** (`src/trpc/routers/warehouse/withdrawals.ts`):
```ts
z.object({
  articleId: z.string().uuid(),
  quantity: z.number().positive(),
  referenceType: z.enum(["ORDER", "DOCUMENT", "MACHINE", "NONE"]),
  referenceId: z.string().optional(),
  machineId: z.string().optional(),
  notes: z.string().optional(),
})
```

**Services**: `src/lib/services/wh-stock-movement-service.ts`, `wh-withdrawal-service.ts`
**Repository**: `src/lib/services/wh-stock-movement-repository.ts`

**UI-Pfade**:
- Bewegungsliste: `src/app/[locale]/(dashboard)/warehouse/stock-movements/page.tsx`
- Goods Receipt: `src/app/[locale]/(dashboard)/warehouse/goods-receipt/page.tsx`
- Withdrawals: `src/app/[locale]/(dashboard)/warehouse/withdrawals/page.tsx`

#### 2.5 `Attachment`

**Wichtige Feststellung**: Terp hat **kein zentrales polymorphes Attachment-Modell**. Die Attachment-Architektur ist **per-Entität**.

**Existierende Attachment-/Image-Modelle**:

1. **`CrmCorrespondenceAttachment`** ([`schema.prisma:735-752`](prisma/schema.prisma#L735-L752))
   - Direkter FK `correspondenceId` → `CrmCorrespondence`
   - Felder: `filename`, `storagePath`, `mimeType`, `sizeBytes`, Audit
   - Supabase-Storage-Bucket: `crm-attachments`
   - Signed-URL-TTL: 3600 Sekunden (in `crm-correspondence-attachment-service.ts`)
   - Max-Size: 10 MB; erlaubte MIMEs: PDF, JPEG, PNG, WebP, DOCX, XLSX
   - Max 5 Attachments pro Correspondence (Service-Layer-Enforcement)
   - Cascade-Delete über Parent
2. **`HrPersonnelFileAttachment`** ([`schema.prisma:5734-5752`](prisma/schema.prisma#L5734-L5752))
   - FK `entryId` → `HrPersonnelFileEntry`
   - Gleiches Schema (filename, storagePath, mimeType, sizeBytes)
3. **`EmailDefaultAttachment`** ([`schema.prisma:5865-5885`](prisma/schema.prisma#L5865-L5885))
   - Für Email-Templates: `documentType` (nullable = für alle Typen), `storageBucket`, `isActive`, `sortOrder`
4. **`WhArticleImage`** ([`schema.prisma:5200-5218`](prisma/schema.prisma#L5200-L5218))
   - Bilder für Artikel (separates Modell neben `WhArticle.images` JsonB-Feld)

**Kein generisches `Attachment`-Modell**. Keine polymorphen
`entityType`+`entityId`-Spalten. Jeder neue Attachment-Kontext
bekommt historisch sein eigenes Modell mit expliziter FK-Spalte.

#### 2.6 `InboundInvoice` (Eingangsrechnung, Accounting-Seite)

**Prisma-Modell**: [`prisma/schema.prisma:5986-6056`](prisma/schema.prisma#L5986-L6056)

Wesentliche Felder:
- `id`, `tenantId`, `number`, `source` (default `"manual"`), `sourceEmailLogId`, `sourceMessageId`
- `supplierId` (nullable FK zu `CrmAddress`), `supplierStatus` (default `"matched"`)
- `invoiceNumber`, `invoiceDate`, `dueDate`, `totalNet/Vat/Gross`, `currency`, `paymentTermDays`
- Seller-Snapshot: `sellerName`, `sellerVatId`, `sellerTaxNumber`, Address-Felder, IBAN/BIC
- Buyer-Snapshot: `buyerName`, `buyerVatId`, `buyerReference`
- ZUGFeRD: `zugferdProfile`, `zugferdRawXml`; PDF: `pdfStoragePath`, `pdfOriginalFilename`
- Workflow: `status` (default `"DRAFT"`), `approvalVersion`, `submittedBy`, `submittedAt`
- DATEV: `datevExportedAt`, `datevExportedBy`
- **`orderId`** (nullable FK zu `Order`), **`costCenterId`** (nullable FK)
- Payment: `paymentStatus: InboundInvoicePaymentStatus` (Enum `UNPAID | PARTIAL | PAID | OVERPAID`), `paidAt`, `paidAmount`
- Audit: `createdAt`, `updatedAt`, `createdBy`

**Wichtig**: **Keine** Referenz zu Maschine/Anlage/Objekt. Die einzige
kontierende Dimension neben Lieferant ist heute `Order` und
`CostCenter`.

**Relations**: `tenant`, `supplier (CrmAddress?)`, `sourceEmailLog`, `submitter`, `datevExporter`, `createdByUser`, `order`, `costCenter`, `lineItems (InboundInvoiceLineItem[])`, `approvals`, `paymentRunItems`, `inboundPayments`, `bankAllocations`

**Indizes**: `[tenantId, status]`, `[tenantId, supplierId]`, `[tenantId, invoiceDate desc]`, `[tenantId, orderId]`, `[tenantId, costCenterId]`, `[tenantId, paymentStatus]`

**Unterscheidung `InboundInvoice` vs. `BillingDocument`**:
- **InboundInvoice** = eingehende Lieferantenrechnung (Accounting/Zahlung), ZUGFeRD-fähig, Approval-Workflow, DATEV-Export. Modul: „Eingangsrechnungen".
- **BillingDocument** = ausgehender Beleg (Angebot, Auftrag, Lieferschein, Rechnung, Gutschrift etc.) aus der eigenen Fakturierung. Modul: „Belege & Fakturierung".
- **`WhSupplierInvoice`** ist eine **dritte** Entität im Warehouse-Modul für supplier-invoice-matching — getrennt von `InboundInvoice`; das Warehouse-Dokument trägt vor allem Zahlungs-/Skonto-Felder.

**tRPC**: `src/trpc/routers/invoices/inbound.ts` — `list`, `getById`, `getUploadUrl`, `createFromUpload`, `update`, `assignSupplier`, `updateLineItems`, `submit`, `approve`, `reject`, `datevExport`, `recordPayment`, `unrecordPayment`, `searchSuppliers`

**Services**:
- `src/lib/services/inbound-invoice-service.ts`
- `inbound-invoice-approval-service.ts`
- `inbound-invoice-datev-export-service.ts`
- `inbound-invoice-payment-service.ts`
- `inbound-invoice-supplier-matcher.ts`

**Repositories**:
- `inbound-invoice-repository.ts`
- `inbound-invoice-line-item-repository.ts`
- `inbound-invoice-approval-repository.ts`
- `inbound-invoice-payment-repository.ts`

**UI-Pfade**:
- Liste: `src/app/[locale]/(dashboard)/invoices/inbound/page.tsx`
- Detail: `src/app/[locale]/(dashboard)/invoices/inbound/[id]/page.tsx`
- Approvals: `/invoices/inbound/approvals/page.tsx`
- Payment Runs: `/invoices/inbound/payment-runs/page.tsx`
- Settings: `/invoices/inbound/settings/page.tsx`
- Components: `src/components/invoices/inbound-invoice-detail.tsx`, `inbound-invoice-payment-form-dialog.tsx`

#### 2.7 `Location` (Randnotiz — Bestands-Entität für Standort-Konzept)

**Prisma-Modell**: [`prisma/schema.prisma:1593-1615`](prisma/schema.prisma#L1593-L1615)

```prisma
model Location {
  id, tenantId, code (unique per tenant), name, description
  address, city, country, timezone, isActive, createdAt, updatedAt
  // Relations: tenant, employees (Employee[])
}
```

Wird aktuell nur für die **Zuordnung von Employees zu einem Standort** genutzt (`@@unique([tenantId, code], "locations_tenant_id_code_key")`). Keine Verknüpfung zu CRM, Aufträgen oder Warehouse.

### 3. Wiederverwendbare Muster

#### 3.1 Multi-Tenancy

**Enforcement-Ebene**: **App-Layer** (nicht DB-Layer). Kein
`CREATE POLICY` / `ENABLE ROW LEVEL SECURITY` in aktiven
Supabase-Migrationen.

**Header-Propagation**: `src/trpc/init.ts:59-60` liest `x-tenant-id` aus HTTP-Header;
zusätzlich SSE-Connection-Param-Fallback (`src/trpc/init.ts:93-96`).

**`tenantProcedure`** (`src/trpc/init.ts:354-382`):
```ts
export const tenantProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.tenantId) throw FORBIDDEN("Tenant ID required")
  const hasAccess = ctx.user.userTenants.some(ut => ut.tenantId === ctx.tenantId)
  if (!hasAccess) throw FORBIDDEN("Access to tenant denied")
  return next({ ctx: { ...ctx, tenantId: ctx.tenantId } })
})
```

Zugriffsprüfung erfolgt gegen `ctx.user.userTenants` (in-memory, vorab
geladen). Platform-Impersonation via `platform-session`-JWT-Cookie +
`x-support-session-id`-Header erlaubt Zugang mit
`PLATFORM_SYSTEM_USER_ID` als synthetischem User
(`src/trpc/init.ts:145-249`).

**Service-Signatur** (kanonisch):
```ts
findMany(prisma: PrismaClient, tenantId: string, params?: {...})
create(prisma: PrismaClient, tenantId: string, input: {...}, auditCtx: AuditContext)
```

Beispiel: `src/lib/services/absence-type-repository.ts:10-36` — WHERE
`OR: [{ tenantId }, { tenantId: null }]` für System-Defaults + Tenant-Daten.

#### 3.2 Hierarchische Modelle

**Durchgängiges Muster: Adjacency-List** (parentId-FK +
Self-Relation-Name). **Keine** Materialized-Path, Closure-Table, Nested-Set.

Drei konkrete Beispiele:

1. **`Department` — `"DepartmentTree"`** ([`schema.prisma:1768-1794`](prisma/schema.prisma#L1768-L1794))
   ```prisma
   parent   Department?  @relation("DepartmentTree", fields: [parentId], references: [id], onDelete: SetNull)
   children Department[] @relation("DepartmentTree")
   @@index([parentId], map: "idx_departments_parent")
   ```

2. **`WhArticleGroup` — `"ArticleGroupTree"`** ([`schema.prisma:5139-5155`](prisma/schema.prisma#L5139-L5155))
   ```prisma
   parent   WhArticleGroup?  @relation("ArticleGroupTree", fields: [parentId], references: [id], onDelete: SetNull)
   children WhArticleGroup[] @relation("ArticleGroupTree")
   ```

3. **`CrmAddress` — `"AddressHierarchy"`** ([`schema.prisma:465-533`](prisma/schema.prisma#L465-L533))
   ```prisma
   parentAddress  CrmAddress?   @relation("AddressHierarchy", fields: [parentAddressId], references: [id], onDelete: SetNull)
   childAddresses CrmAddress[]  @relation("AddressHierarchy")
   ```

**Tree-Rendering (UI)**: Client-seitig. Beispiel:
`src/components/departments/department-tree-view.tsx` — rekursive
`DepartmentNode[]`-Struktur, Expand/Collapse-State in `useState`, keine
Pfad-Breadcrumb-Berechnung im Code gefunden (Tiefe implizit).

#### 3.3 Berechtigungssystem

**Katalog-Datei**: `src/lib/auth/permission-catalog.ts`

**Naming-Convention**: `<resource>.<action>` oder `<resource>.<sub-resource>.<action>` (z. B. `personnel.payroll_data.view`).

**Struktur einer Permission** (`permission-catalog.ts:14-38`):
```ts
export interface Permission {
  id: string         // UUID v5, deterministic from key
  key: string        // "employees.view"
  resource: string   // "employees"
  action: string     // "view"
  description: string
}

function p(key, resource, action, description): Permission {
  return { id: permissionId(key), key, resource, action, description }
}
```

UUID-v5-Namespace: `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1` (deterministisch, matcht Go-Backend).

**Registrierung**: Alle Einträge in `ALL_PERMISSIONS: Permission[]`
(`permission-catalog.ts:44-426`).

**Bestehende Namensräume** (Auszug): `employees`, `time_tracking`,
`booking_overview`, `absences`, `overtime`, `day_plans`, `week_plans`,
`tariffs`, `departments`, `teams`, `booking_types`, `absence_types`,
`holidays`, `accounts`, `notifications`, `groups`, `reports`, `users`,
`tenants`, `settings`, `time_plans`, `activities`, `orders`,
`order_assignments`, `order_bookings`, `payroll`, `schedules`,
`contact_management`, `terminal_bookings`, `access_control`,
`vehicle_data`, `travel_allowance`, `shift_planning`, `macros`,
`locations`, `cost_centers`, `employment_types`, `corrections`,
`monthly_evaluations`, `vacation_config`, **CRM**: `crm_addresses`,
`crm_correspondence`, `crm_inquiries`, `crm_tasks`; **Billing**:
`billing_documents`, `billing_service_cases`, `billing_payments`,
`billing_price_lists`, `billing_recurring`, `outgoing_invoice_book`,
`dunning`; **Warehouse**: `wh_articles`, `wh_article_groups`,
`wh_purchase_orders`, `wh_stock`, `wh_supplier_invoices`,
`wh_corrections`, `wh_reservations`, `wh_qr`, `wh_stocktake`; **HR**:
`hr_personnel_file`, `hr_personnel_file_categories`, `dsgvo`,
`documents`, `email_templates`, `email_smtp`; **Inbound/Bank**:
`inbound_invoices`, `inbound_invoice_payments`, `payment_runs`,
`bank_transactions`, `email_imap`, `audit_log`; **Personnel-Nested**:
`personnel.payroll_data`, `personnel.garnishment`,
`personnel.foreign_assignment`; **Sonstige**: `export_template`,
`overtime_payouts`, `platform.support_access`.

**Keine bestehenden Namensräume** mit Tokens
`serviceobjekt`, `asset`, `equipment`, `machine`, `anlage`, `device` —
ein neuer Namensraum für Serviceobjekte wäre frei.

**Middleware** (`src/lib/auth/middleware.ts`):
- `requirePermission(...permissionIds)` (Line 40-59): OR-Logik
- `requireSelfOrPermission(userIdGetter, permissionId)` (Line 73-109)
- `requireEmployeePermission(employeeIdGetter, ownPerm, allPerm)` (Line 125-192)
- `applyDataScope()` (Line 219-234): liefert
  `DataScope = { type: "all"|"tenant"|"department"|"employee", tenantIds[], departmentIds[], employeeIds[] }`

**Router-Beispiel** (`src/trpc/routers/absenceTypes.ts:219-236`):
```ts
const ABSENCE_TYPES_MANAGE = permissionIdByKey("absence_types.manage")!
export const absenceTypesRouter = createTRPCRouter({
  create: tenantProcedure
    .use(requirePermission(ABSENCE_TYPES_MANAGE))
    .input(...).output(...).mutation(async ({ ctx, input }) => {
      try {
        return mapToOutput(await absenceTypeService.create(...))
      } catch (err) { handleServiceError(err) }
    }),
})
```

#### 3.4 Attachments

Siehe Abschnitt **2.5** oben. Zusammenfassung: **pro-Entität-Muster**,
kein polymorphes `Attachment`-Modell. Dateien in Supabase-Storage
(`crm-attachments`-Bucket für CRM), Metadaten in Prisma-Tabelle
mit direktem FK, Signed-URL-Ablauf 1 Stunde, Max 10 MB (Service-Layer).

#### 3.5 Audit-Log-Pattern

**Zwei getrennte Tabellen**:

1. **`AuditLog`** / `audit_logs` (tenant-scoped) ([`schema.prisma:3436-3461`](prisma/schema.prisma#L3436-L3461)):
   ```prisma
   model AuditLog {
     id, tenantId, userId (nullable FK),
     action (VarChar(20)), entityType, entityId,
     entityName (optional), changes (JsonB), metadata (JsonB),
     ipAddress, userAgent, performedAt (default now())
     // Indizes: tenantId, userId, [entityType, entityId], action, performedAt, [tenantId, performedAt]
   }
   ```

2. **`PlatformAuditLog`** / `platform_audit_logs` (operator-scoped) ([`schema.prisma:1525-1543`](prisma/schema.prisma#L1525-L1543)):
   ```prisma
   model PlatformAuditLog {
     id, platformUserId, action,
     entityType?, entityId?, targetTenantId?, supportSessionId?,
     changes, metadata, ipAddress, userAgent, performedAt
   }
   ```

**Audit-Service**: `src/lib/services/audit-logs-service.ts`

- Exportiert `AuditContext { userId, ipAddress?, userAgent? }`
- `computeChanges(before, after, fieldsToTrack?)` — liefert
  `{ [field]: { old, new } }` oder `null` wenn nichts geändert.
  Normalisiert Date→ISO, Decimal→number, deep-equality-Vergleich.

**Impersonation-Dual-Write**: `src/lib/platform/impersonation-context.ts`
setzt AsyncLocalStorage. Der Audit-Service prüft
`getImpersonation()` und schreibt bei aktiver Session zusätzlich in
`platform_audit_logs` (siehe CLAUDE.md „Audit split"-Regel).

**Service-Beispiel** (`src/lib/services/absence-type-service.ts`):
```ts
const TRACKED_FIELDS = ["name", "code", "category", "portion", "priority",
                        "isActive", "deductsVacation", "requiresApproval"]
await auditLog.log({
  tenantId, userId, action: "create|update|delete",
  entityType: "AbsenceType", entityId: id, entityName: name,
  changes: computeChanges(before, after, TRACKED_FIELDS),
  ipAddress, userAgent,
})
```

Domain-Error-Klassen heißen pro Service:
`AbsenceTypeNotFoundError`, `AbsenceTypeValidationError`,
`AbsenceTypeConflictError` — `handleServiceError` mappt nach Name-Suffix
auf `NOT_FOUND | BAD_REQUEST | CONFLICT | FORBIDDEN`.

#### 3.6 Seed-Mechanismus

**Stufen**:

1. **`supabase/seed.sql`** — Dev-Datenbank-Seed
   (Reihenfolge: Auth-User → Dev-Tenant → Admin-Gruppe → Public-User →
   `user_tenants` → Employees/Departments/Teams → Tariffs/Day-/WeekPlans →
   Holidays → Bookings/Daily/Monthly Values → Vacation → Billing →
   Warehouse → HR-Personalakte). Ausgeführt via `pnpm db:reset`.
2. **Universelle Defaults** (`src/lib/tenant-templates/seed-universal-defaults.ts:49-93`):
   ```ts
   export async function seedUniversalDefaults(tx: Prisma.TransactionClient, tenantId: string) {
     const client = tx as unknown as PrismaClient
     await reminderTemplateService.seedDefaultsForTenant(client, tenantId)
     await seedEmailTemplateDefaultsInline(tx, tenantId)
     await reminderSettingsService.updateSettings(client, tenantId, {
       enabled: true, maxLevel: 3,
       gracePeriodDays: [7, 14, 21], interestRatePercent: 9,  // BGB §288 Abs. 2
     })
   }
   ```
   Idempotent (Services prüfen Existenz).
3. **Tenant-Erstellung** (`src/lib/services/tenant-service.ts:76-149`):
   - `repo.create(prisma, {...})` legt den Tenant an.
   - `repo.upsertUserTenant(prisma, userId, tenant.id, "owner")` vergibt Owner-Rolle.
   - **Keine automatische Seed-Logik im Standard-Create** — Universelle
     Defaults laufen aus Platform-Starter-Template- oder Demo-Flows.

**Krankenkassen, Personengruppenschlüssel, Lohnarten** erscheinen nicht
als gesonderter TS-Seed; ihr Ursprung liegt entweder in Migrations oder
außerhalb des geprüften Codes. Kein Beweis für Lazy-Seed bei erstem
Seitenaufruf gefunden.

#### 3.7 QR-Codes

**Generation (server-side)**: `src/lib/services/wh-qr-service.ts`
```ts
import QRCode from "qrcode"     // Line 9
// Generation:
generateQrDataUrl(content, size?): Promise<string>
  // → QRCode.toDataURL(content, { width: size ?? 150, margin: 1 })
```

**Payload-Format** (deterministisch, `wh-qr-service.ts:40-52`):
```
TERP:ART:{tenantIdFirst6Chars}:{articleNumber}
Example:   TERP:ART:10abcd:ART-001
Regex:     /^TERP:ART:([a-f0-9]{6}):(.+)$/
```
Tenant-Validation: `if (!tenantId.startsWith(tenantShort)) throw WhQrForbiddenError(...)`.
Artikel-Lookup: `findFirst({ where: { tenantId, number: articleNumber, isActive: true } })`.

**Print/PDF**: Separate PDF-Label via `@react-pdf/renderer`
(`src/lib/pdf/qr-label-pdf.ts` — `QrLabelPdf`, `LabelFormat`).

**Scanning (client-side)**: `src/components/warehouse/qr-scanner.tsx:94`
```ts
const { Html5Qrcode } = await import('html5-qrcode')
```
Dynamischer Import (SSR-Schutz).

**Konsum**: Mobile-Scanner-Flow (`src/components/warehouse/scanner-terminal.tsx`), Goods-Receipt, Withdrawals, Stocktake.

**Weitere QR-Nutzung**: `src/app/platform/login/page.tsx` — MFA-Secret-QR für Platform-Login (nicht Artikel-QR).

#### 3.8 Service + Repository Convention

**Datei-Naming**: `{entity}-service.ts` + `{entity}-repository.ts` in `src/lib/services/`.

**Signaturen**:
```ts
// Service (Business Logic)
async list(prisma: PrismaClient, tenantId: string, params?: {...})
async getById(prisma: PrismaClient, tenantId: string, id: string)
async create(prisma: PrismaClient, tenantId: string, input: {...}, auditCtx: AuditContext)

// Repository (reine Prisma-Queries)
async findMany(prisma: PrismaClient, tenantId: string, params?: {...})
async findById(prisma: PrismaClient, tenantId: string, id: string)
async create(prisma: PrismaClient, data: { tenantId, ...fields })
```

**Error-Klassen** werden pro Entität definiert (`*NotFoundError`,
`*ValidationError`, `*ConflictError`, `*ForbiddenError`) und im Router
mit `handleServiceError(err)` (aus `src/trpc/errors.ts`) gefangen:

```ts
try {
  const res = await service.method(...)
  return mapToOutput(res)
} catch (err) {
  handleServiceError(err)  // mapped by Error name suffix
}
```

### 4. Platform-Isolation

**Verzeichnisstruktur** (Trennung bestätigt):

- **Terp-Router**: `src/trpc/routers/` (~70 Dateien, tenant-scoped)
- **Platform-Router**: `src/trpc/platform/routers/` (8 Dateien: `auth.ts`, `demoTenantManagement.ts`, `demoConvertRequests.ts`, `tenantManagement.ts`, `platformUsers.ts`, `supportSessions.ts`, `tenants.ts`, `auditLogs.ts`)
- **Terp-Services**: `src/lib/services/` (~146 Dateien)
- **Platform-Services**: `src/lib/platform/` (8 Dateien: `module-pricing.ts`, `subscription-service.ts`, `subscription-autofinalize-service.ts`, `audit-service.ts`, `jwt.ts`, `cookie.ts`, `login-service.ts`, `rate-limit.ts`, `impersonation-context.ts`)
- **Terp-UI**: `src/app/[locale]/(dashboard)/` (116 Seiten)
- **Platform-UI**: `src/app/platform/(authed)/` (11 Seiten)

**tRPC-Procedures-Trennung**:

Terp-Seite (`src/trpc/init.ts`):
- `publicProcedure` (Line 323) — keine Auth
- `protectedProcedure` (Line 329) — Supabase-Session erforderlich
- `tenantProcedure` (Line 354) — + `x-tenant-id` + userTenants-Check

Platform-Seite (`src/trpc/platform/init.ts`):
- `platformPublicProcedure` (Line 179) — keine Auth (nur Login-Endpoints)
- `platformAuthedProcedure` (Line 185) — Platform-JWT + MFA verifiziert
- `platformImpersonationProcedure` (Line 218) — + aktive `SupportSession`

**Cross-Layer-Rules (verifiziert)**:

CLAUDE.md (lines 105-111): „Terp-side code must not be modified by platform features. Platform code may READ Terp models directly via Prisma, but all WRITES to Terp tables go through the existing Terp services with `(prisma, tenantId, ...)`. Prisma relations from platform models to Terp models are defined at the SQL level only — no `@relation` declarations in `schema.prisma`."

**Grep-Evidenz**:
```
grep -r "from @/lib/platform" src/lib/services/    → 0 Treffer
grep -r "from @/lib/platform" src/trpc/routers/    → 0 Treffer
```

**Platform→Terp-Write-Beispiele** (durch Terp-Service, nicht direkt):

`src/lib/platform/subscription-service.ts:240-255`:
```ts
const newAddress = await crmAddressService.create(
  prisma as PrismaClient,
  operatorTenantId,            // operator tenant (normale Terp-Tenant)
  { type: "CUSTOMER", company: customerTenant.name, ... },
  PLATFORM_SYSTEM_USER_ID,     // audit userId
)
```

`src/trpc/platform/routers/tenantManagement.ts:879-887`:
```ts
subscriptionResult = await subscriptionService.createSubscription(
  ctx.prisma,
  { customerTenantId, module: input.moduleKey, billingCycle: input.billingCycle },
  ctx.platformUser.id,
)
```

**Schema-Level-Separation**: Platform-Modelle ohne `@relation`
zu Terp-Modellen. Beispiel `PlatformSubscription`
([`schema.prisma:373-398`](prisma/schema.prisma#L373-L398)):
```prisma
operatorCrmAddressId       String? @map("operator_crm_address_id") @db.Uuid
billingRecurringInvoiceId  String? @map("billing_recurring_invoice_id") @db.Uuid
lastGeneratedInvoiceId     String? @map("last_generated_invoice_id") @db.Uuid
// KEINE @relation-Deklarationen
```

SQL-Migration setzt FKs nur auf DB-Ebene:
`supabase/migrations/20260422000000_create_platform_subscriptions.sql:20-22`:
```sql
operator_crm_address_id  UUID REFERENCES public.crm_addresses(id) ON DELETE SET NULL,
billing_recurring_invoice_id UUID REFERENCES public.billing_recurring_invoices(id) ON DELETE SET NULL,
last_generated_invoice_id UUID REFERENCES public.billing_documents(id) ON DELETE SET NULL,
```

**Pure-Terp-Referenzmodul**: `overtime-requests` (Staging) ist ein
aktuelles Beispiel. Footprint:
```
supabase/migrations/20260501000000_overtime_payout.sql
supabase/migrations/20260503000000_create_overtime_requests.sql
supabase/migrations/20260503000001_add_reopen_required_to_overtime_request_config.sql
src/lib/services/overtime-request-*.ts
src/lib/services/overtime-payout-*.ts
src/lib/services/employee-overtime-payout-override-*.ts
src/lib/services/arbzg-validator.ts
src/lib/services/overtime-request-config-service.ts
src/trpc/routers/overtimeRequests.ts
src/trpc/routers/overtimeRequestConfig.ts
src/lib/services/overtime-request-repository.ts
src/app/[locale]/(dashboard)/overtime-requests/
src/app/[locale]/(dashboard)/admin/overtime-approvals/
src/app/[locale]/(dashboard)/admin/overtime-request-config/
src/components/overtime-requests/
src/hooks/use-overtime-requests.ts
```
Null Einträge in `src/lib/platform/*`, `src/trpc/platform/*`, `src/app/platform/*`.

### 5. Vokabel-Audit

Quellen: `docs/TERP_HANDBUCH.md` (12.011 Zeilen), `docs/benutzerhandbuecher/*.md` (46 Dateien), `messages/de.json` (8.790 Zeilen), `messages/en.json`, `src/components/**/*.tsx` (583 Dateien).

#### Häufigkeitstabelle

| Term | de.json | Handbuch | Benutzerhandbücher | Components |
|------|---------|----------|---------------------|------------|
| Anlage | 1 | 8 | 0 | 0 |
| Maschine | 4 | 17 | 0 | 0 |
| Gerät | 3 | 2 | 0 | 0 |
| Objekt | 11 | 6 | 10 | 0 |
| Referenztyp | 1 | 3 | 0 | 0 |
| Einrichtung | 0 | 2 | 0 | 0 |
| Serviceobjekt | 0 | 0 | 0 | 0 |
| Prüfobjekt | 0 | 0 | 0 | 0 |
| Wartungsobjekt | 0 | 0 | 0 | 0 |
| Kundenobjekt | 0 | 0 | 0 | 0 |
| Anlagenverzeichnis | 0 | 0 | 0 | 0 |
| Equipment (de. Text) | 0 | 0 | 0 | 0 |
| Asset (de. Text) | 0 | 0 | 0 | 0 |
| Device (de. Text) | 0 | 0 | 0 | 0 |

#### Kontexte pro Term

**Anlage** (8 Treffer im Handbuch; 1 im i18n) — **homonym**:

Bedeutung A: „Erstellung/Anlegen" (Zeit- oder Zustands-Referenz):
- `docs/TERP_HANDBUCH.md:4364` — „Code … nach Anlage nicht mehr änderbar"
- `docs/TERP_HANDBUCH.md:4385` — identisch
- `docs/TERP_HANDBUCH.md:8977` — „Datum der Anlage" (Inventur)
- `docs/TERP_HANDBUCH.md:5567` — „Anlage und Abschluss" (CRM-Analytics)
- `docs/TERP_HANDBUCH.md:5581` — „Anlage und Erledigung"
- `docs/TERP_HANDBUCH.md:9797` — „v1 → erste Anlage" (Export-Template-Versionen)

Bedeutung B: „Anlageform" (Investmentform bei VWL):
- `messages/de.json:8299` — `"investmentType": "Anlageform"`
- `docs/TERP_HANDBUCH.md:9464` — „Anlageform (Bausparen/Fondssparen/Banksparen)"

Bedeutung C: Regulatorische Referenz:
- `docs/TERP_HANDBUCH.md:11889` — „nach DEÜV Anlage 2"

Keine Verwendung im Sinne „technische Anlage/Asset".

**Maschine** (17 Handbuch + 4 i18n):

Warehouse-Kontext:
- `docs/TERP_HANDBUCH.md:8157` — „… einem Auftrag, einem Lieferschein oder einer Maschine zugeordnet"
- `docs/TERP_HANDBUCH.md:8173` — Tabelle: „Maschine/Gerät | Entnahme einer Maschine oder einem Gerät zuordnen"
- `docs/TERP_HANDBUCH.md:8176`, `8224`, `11876` — Workflow-Verweise
- `messages/de.json:6475, 6479, 6483, 6487` — UI-Labels (Maschinen-/Geräte-ID, Maschine/Gerät)

Template-/Business-Kontext:
- `docs/TERP_HANDBUCH.md:6651` — Beispiel-Recurring-Template „Wartungsvertrag CNC-Maschinen (monatlich)"

Nominal-Namensbildungen (gehören **nicht** zum Objekt-Konzept):
- 8 weitere Treffer sind Firmennamen-Beispiele („Müller Maschinenbau GmbH") in CRM-Beispielen, Zeilen 4996-5355
- 1 Treffer (Zeile 9544) „Maschinenbau-Fachkraft" (Berufsbezeichnung)

**Gerät** (3 Handbuch + 1 i18n; stets an Maschine gepaart):
- `docs/TERP_HANDBUCH.md:4453` — „über physische Geräte" (Terminal-Hardware)
- `docs/TERP_HANDBUCH.md:8173` — „Maschine/Gerät" (Tabellenzeile)
- `messages/de.json:6475` — „Maschinen-/Geräte-ID"
- `messages/de.json:6483` — „… oder einem Gerät zuordnen"

**Objekt** (11 i18n + 6 Handbuch + 10 Benutzerhandbücher):

Technische Bedeutung (JSON-Objekt in Templates):
- `messages/de.json:5145` — „taskParametersHelp": "JSON-Objekt mit aufgabenspezifischen Parametern"
- `messages/de.json:5196` — „fieldActionParamsHelp": „JSON-Objekt mit aktionsspezifischen Parametern"
- `docs/TERP_HANDBUCH.md:9687, 9712, 9727, 9872, 10018` — „Kontext-Objekt", „Sparse-Objekt" (Export-Template-Doku)

Audit-Log-Bedeutung (betroffene Entität):
- `messages/de.json:3681-3682` — „entityType": "Objekttyp", „Alle Objekttypen"
- `messages/de.json:3758-3781` — „Objektname", „Objekt-ID" (Automation-Trigger)
- `docs/benutzerhandbuecher/audit-protokolle.md:32, 42, 43, 77, 79, 80, 81, 142` — Audit-Tabellen und -Filter
- `docs/benutzerhandbuecher/auswertungen.md:88` — „Objekt | Betroffener Antrag" (Reports)

**Referenztyp** (1 i18n + 3 Handbuch):
- `messages/de.json:6473` — „labelReferenceType": "Referenztyp"
- `docs/TERP_HANDBUCH.md:8167, 8169, 8765` — Handbuch-Schritte im Withdrawal-Wizard

**Einrichtung** (2 Handbuch, nur Prosa):
- `docs/TERP_HANDBUCH.md:9636` — „einmalig pro Mandant eingerichtet"
- `docs/TERP_HANDBUCH.md:10102` — „empfohlene Einrichtungs-Reihenfolge"

**Unbenutzt** (0 Treffer in allen Quellen): `Serviceobjekt`, `Prüfobjekt`, `Wartungsobjekt`, `Kundenobjekt`, `Anlagenverzeichnis`; `Equipment`, `Asset`, `Device` als deutsche Texte.

#### Synonym-Cluster

- **Physisch-technische Ausrüstung**: `Maschine` ↔ `Gerät` — in der UI als kombiniertes Label „Maschine/Gerät" genutzt (`refTypeMachine` in de.json); keine separate Auswahl.
- **Entität im Audit-/Report-Kontext**: `Objekt` (+ Komposita `Objekttyp`, `Objekt-ID`, `Objektname`) — stabil und einheitlich in Audit-Log-Doku; im Export-Template-Kontext meint „Objekt" jedoch JSON-Struktur.
- **Workflow-Referenzklassifikation**: `Referenztyp` — ausschließlich Warehouse-Withdrawals, kein anderes Modul.

**„Anlage" ist homonym** zwischen „Erstellung" (Zeitpunkt), „Anlageform" (VWL) und Regulatorik („Anlage 2 DEÜV"). Keine aktuelle Verwendung als „technische Anlage/Asset".

## Code References

- `prisma/schema.prisma:465-533` — CrmAddress (Parent der CRM-Hierarchie, self-referencing AddressHierarchy)
- `prisma/schema.prisma:735-752` — CrmCorrespondenceAttachment (pro-Entität-Attachment-Muster)
- `prisma/schema.prisma:1525-1543` — PlatformAuditLog (operator-scoped)
- `prisma/schema.prisma:1593-1615` — Location (Standort, aktuell nur Employee-Bezug)
- `prisma/schema.prisma:1768-1794` — Department (Adjacency-List DepartmentTree)
- `prisma/schema.prisma:2335-2368` — Order (keine Objekt-Referenz)
- `prisma/schema.prisma:3436-3461` — AuditLog (tenant-scoped)
- `prisma/schema.prisma:5139-5155` — WhArticleGroup (Adjacency-List ArticleGroupTree)
- `prisma/schema.prisma:5157-5198` — WhArticle (Artikelstamm)
- `prisma/schema.prisma:5200-5218` — WhArticleImage
- `prisma/schema.prisma:5245-5259` — WhBillOfMaterial (N:M-Stückliste via BomParent/BomChild)
- `prisma/schema.prisma:5269-5278` — WhStockMovementType-Enum
- `prisma/schema.prisma:5380-5413` — WhStockMovement (+ machineId-Spalte 5395, Index 5411)
- `prisma/schema.prisma:5731-5760` — HrPersonnelFileAttachment
- `prisma/schema.prisma:5859-5885` — EmailDefaultAttachment
- `prisma/schema.prisma:5986-6056` — InboundInvoice
- `supabase/migrations/20260326100000_wh_stock_movement_machine_id.sql` — machineId-Migration
- `supabase/migrations/20260422000000_create_platform_subscriptions.sql:20-22` — SQL-only FKs Platform→Terp
- `supabase/migrations/20260501000000_overtime_payout.sql` — Pure-Terp-Modul-Migration
- `supabase/migrations/20260503000000_create_overtime_requests.sql` — Pure-Terp-Modul-Migration
- `supabase/seed.sql` — Dev-Datenbank-Seed
- `src/lib/auth/permission-catalog.ts:14-38` — Permission-Interface + `p()`-Helper
- `src/lib/auth/permission-catalog.ts:44-426` — `ALL_PERMISSIONS`-Katalog
- `src/lib/auth/middleware.ts:40-59` — `requirePermission`
- `src/lib/auth/middleware.ts:73-109` — `requireSelfOrPermission`
- `src/lib/auth/middleware.ts:125-192` — `requireEmployeePermission`
- `src/lib/auth/middleware.ts:219-234` — `applyDataScope`
- `src/lib/services/audit-logs-service.ts` — `log()`, `computeChanges()`, `AuditContext`
- `src/lib/services/crm-correspondence-attachment-service.ts` — Attachment-Service (Bucket, Signed-URL, Limits)
- `src/lib/services/wh-qr-service.ts:9` — `import QRCode from "qrcode"`
- `src/lib/services/wh-qr-service.ts:40-52` — QR-Regex + Tenant-Validation
- `src/lib/services/wh-qr-service.ts:57-62` — `generateQrDataUrl()`
- `src/lib/services/wh-stock-movement-repository.ts` — `create()` setzt machineId
- `src/lib/services/wh-stock-movement-service.ts` — Goods-Receipt-Transaktion
- `src/lib/services/wh-withdrawal-service.ts:31` — `ReferenceType`-Typ
- `src/lib/services/wh-withdrawal-service.ts:52-57` — `resolveReferences()` mappt type→FK
- `src/lib/services/wh-withdrawal-service.ts:95, 108` — persistiert `machineId`
- `src/lib/services/wh-withdrawal-service.ts:369-370` — Filter nach `machineId`
- `src/lib/services/absence-type-service.ts:38-59` — Error-Klassen-Muster
- `src/lib/services/absence-type-repository.ts:10-36` — Tenant-Filter-Beispiel
- `src/lib/platform/subscription-service.ts:222-232` — Platform liest Terp-Modell direkt
- `src/lib/platform/subscription-service.ts:240-255` — Platform ruft `crmAddressService.create()`
- `src/lib/platform/subscription-service.ts:449-463` — Platform ruft `billingRecurringService.create()`
- `src/lib/tenant-templates/seed-universal-defaults.ts:49-93` — `seedUniversalDefaults()`
- `src/trpc/init.ts:34` — `PLATFORM_SYSTEM_USER_ID = "00000000-0000-0000-0000-00000000beef"`
- `src/trpc/init.ts:59-60, 93-96` — `x-tenant-id`-Header-Extraktion
- `src/trpc/init.ts:145-249` — Platform-Impersonation-Aufbau
- `src/trpc/init.ts:300-314` — `impersonationBoundary`
- `src/trpc/init.ts:323-382` — `publicProcedure`, `protectedProcedure`, `tenantProcedure`
- `src/trpc/platform/init.ts:176-249` — Platform-Procedures
- `src/trpc/routers/warehouse/withdrawals.ts:24` — `referenceTypeEnum`
- `src/trpc/routers/warehouse/withdrawals.ts:34-36, 63-65, 124` — Inputs mit `machineId`
- `src/trpc/routers/absenceTypes.ts:219-236` — Router-Muster mit `requirePermission`
- `src/trpc/platform/routers/tenantManagement.ts:818-824, 879-887, 905-923` — Platform→Terp-Service-Calls + Platform-Audit
- `src/components/warehouse/withdrawal-terminal.tsx:30, 42, 53-83, 109, 163, 189, 200, 319-325` — UI-Logik für Referenztyp
- `src/components/warehouse/withdrawal-history.tsx:38, 56-62` — Machine-Icon-Anzeige
- `src/components/warehouse/scanner-terminal.tsx:238, 542` — Quick-Withdrawal mit Referenztyp
- `src/components/warehouse/qr-scanner.tsx:94` — Dynamic-Import `html5-qrcode`
- `src/components/departments/department-tree-view.tsx:1-100` — Tree-Rendering-Muster
- `src/e2e-browser/44-wh-withdrawals.spec.ts:36, 169-180` — E2E-Assertions Maschine
- `messages/de.json:3681-3682, 3758-3781, 5145, 5196, 6473-6487, 8299` — relevante i18n-Keys
- `messages/en.json:6475, 6479, 6483` — englische Pendants
- `docs/TERP_HANDBUCH.md:8151-8286` — Handbuch-Abschnitt 18 (Lagerentnahmen mit Referenztyp „Maschine/Gerät")

## Architecture Documentation

Siehe Abschnitt **3. Wiederverwendbare Muster** für alle bestehenden
architektonischen Konventionen (Multi-Tenancy App-Layer, Adjacency-List-
Hierarchien, `<namespace>.<action>`-Permission-Schema, pro-Entität-
Attachment-Muster, Dual-Audit-Log, zweistufiger Seed-Mechanismus,
deterministisches QR-Payload-Format, Service+Repository-Konvention).

Siehe Abschnitt **4. Platform-Isolation** für Layer-Grenzen, Procedure-
Hierarchien und Evidenz, dass reine Terp-Module (`overtime-requests`
auf Staging) ohne Platform-Layer-Änderungen auskommen.

## Historical Context (from thoughts/)

- `thoughts/shared/plans/2026-03-24-WH_05-lagerentnahmen.md` — Der
  Entstehungsplan für `WhStockMovement.machineId`. Zitat aus dem
  „Overview": „Articles are withdrawn from inventory by reference to
  a Terp order, a delivery note, or a machine/equipment ID.
  Withdrawals create stock movements of type WITHDRAWAL with negative
  quantity. […] No new Prisma models needed — extends the existing
  `WhStockMovement` model with a new `machineId` field." Der Plan
  bestätigt, dass `machineId` bewusst als freier Text ohne FK angelegt
  wurde (Stand 2026-03-24), mit Upgrade-Pfad offen.
- `thoughts/shared/plans/2026-03-16-CRM_02-korrespondenz.md` — Plan
  für `CrmCorrespondence` + `CrmCorrespondenceAttachment` (Ursprung
  des pro-Entität-Attachment-Musters im CRM-Kontext).
- `thoughts/shared/plans/2026-03-17-CRM_03-vorgaenge.md` — Plan für
  `CrmInquiry` (CRM-Vorgänge/Anfragen), FK zu `CrmAddress` + optional
  zu `Order` (zeigt bestehende Verknüpfungsmuster zwischen CRM und
  Auftrag).
- `thoughts/shared/research/2026-04-14-demo-template-starter-variant.md`
  — Kontext zu Demo-Tenant-Starter-Templates (Phase 10b). Relevant für
  das Verständnis, wie Starter-Templates per-Tenant-Seeds (inkl.
  universeller Defaults) triggern.

## Related Research

Keine bestehenden Research-Dokumente mit Bezug zu Serviceobjekten,
Wartung, Asset-Management oder Equipment-Tracking. Das vorliegende
Dokument ist der erste IST-Aufriss.

## Open Questions

Aufgrund des Auftrags (IST-Zustand ohne Bewertung) werden keine offenen
Fragen zur Architektur/Empfehlung formuliert. Falls für den
nachfolgenden Plan weitere Information nötig ist, gehören zu den noch
nicht gesichteten Bereichen (nicht Teil des Forschungsauftrags):

- Details zu `WhSupplierInvoice` (Warehouse-interne Lieferanten­rechnung) vs. `InboundInvoice` (Accounting-Lieferantenrechnung) jenseits der hier dokumentierten Modell-Distinktion.
- Vollständiger Lifecycle der `supabase/seed.sql` und tenant-spezifische Seed-Pfade außerhalb `seed-universal-defaults.ts` (z. B. Krankenkassen-Herkunft).
- Detail der Row-Level-Security-Historie (Migrationen enthalten ~187 RLS-bezogene Zeilen, aktuell aber keine aktiven `CREATE POLICY`-Statements — Audit dieser Historie wurde nicht durchgeführt).
- Das Modul `Location` wurde als vorhandenes Modell dokumentiert; seine Nutzbarkeit als Standort-Anker für Serviceobjekte ist nicht Teil dieser Forschung.
