# Eingangsrechnungen: Order/CostCenter-Zuordnung + DATEV-Export-Erweiterung

## Overview

Eingangsrechnungen (InboundInvoice) erhalten zwei neue optionale Felder: `orderId` (Auftrag) und `costCenterId` (Kostenstelle). Diese Zuordnung wird im Service, Router, UI und DATEV-Export durchgängig implementiert. In Phase 2 wird der DATEV-Buchungsstapel-Export von 14 auf 39 Spalten erweitert, um KOST1 und KOST2 korrekt nach DATEV-Spezifikation auszugeben.

**Basis-Recherche**: `thoughts/shared/research/2026-04-12_15-34-14_inbound-invoice-order-costcenter-bestandsaufnahme.md`

## Current State Analysis

- **InboundInvoice** (`prisma/schema.prisma:5594-5651`): 30+ Felder, FK zu Tenant, CrmAddress (supplier), InboundEmailLog, User (3x). Kein FK zu Order oder CostCenter.
- **Order** (`prisma/schema.prisma:2110-2142`): Hat bereits 6 inverse Relationen (OrderAssignment, Employee, OrderBooking, CrmInquiry, BillingDocument, BillingServiceCase) und `costCenterId` FK.
- **CostCenter** (`prisma/schema.prisma:1344-1364`): Hat 2 inverse Relationen (Employee, Order).
- **DATEV-Export** (`src/lib/services/inbound-invoice-datev-export-service.ts`): 14 Spalten, kein KOST1/KOST2, CSV direkt im Code (kein Template).
- **UI**: Inline-Form in `inbound-invoice-detail.tsx:43-501`, kein suchbarer Combobox für Entity-Auswahl.
- **Order-Detail**: 3 Tabs (Details, Assignments, Bookings) in `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx:188-302`. Kein Eingangsrechnungs-Tab.

### Key Discoveries

- `MATERIAL_FIELDS` in `inbound-invoice-service.ts:18`: `["totalNet", "totalVat", "totalGross", "supplierId", "dueDate"]` — orderId/costCenterId gehören NICHT dazu.
- `TRACKED_FIELDS` in `inbound-invoice-service.ts:20-23`: Muss um orderId/costCenterId ergänzt werden für Audit-Logging.
- `updateSchema` in `src/trpc/routers/invoices/inbound.ts:44-54`: SupplierId wird via separater `assignSupplier`-Mutation gesetzt. Für orderId/costCenterId nutzen wir stattdessen das update-Schema direkt — es gibt keinen komplexen Matching-Workflow wie bei Suppliers.
- `useOrders()` und `useCostCenters()` Hooks laden vollständige Listen (keine Server-Suche). Client-seitige Filterung im Popover ist ausreichend — typische Tenant-Listen < 500 Einträge.
- `DEFAULT_INCLUDE` in `inbound-invoice-repository.ts:4-10`: Muss um order/costCenter select ergänzt werden.
- `findMany` in `inbound-invoice-repository.ts:34-87`: Leichtgewichtiger include (nur supplier). Muss um order/costCenter für List-Ansicht erweitert werden.

## Desired End State

**Nach Phase 1:**
- InboundInvoice hat optionale Felder `orderId` und `costCenterId` mit FK
- Im Detail-Formular (DRAFT/REJECTED) können Auftrag und Kostenstelle per suchbarem Popover zugewiesen werden
- Im Read-only-Modus werden zugewiesene Entitäten als Links angezeigt
- In der Order-Detail-Page gibt es einen neuen Tab "Eingangsrechnungen" mit Tabelle
- Alle Tests grün, typecheck + lint bestanden

**Nach Phase 2:**
- DATEV-Export hat 39 Spalten gemäß Buchungsstapel-Standard
- KOST1 = Order.code, KOST2 = CostCenter.code
- Leere Spalten an korrekten Positionen
- Alle DATEV-Tests grün

### Verifikation

- Phase 1: Eingangsrechnung im DRAFT anlegen → Auftrag zuordnen → speichern → Order-Detail-Tab zeigt die Rechnung → `pnpm typecheck && pnpm lint && pnpm vitest run` grün
- Phase 2: DATEV-Export mit zugeordneter Rechnung → CSV öffnen → KOST1/KOST2 an Position 37/38 korrekt → Tests grün

## What We're NOT Doing

- Pflichtfeld-Schalter pro Mandant (wartet auf TenantSettings-Konzept)
- Auftrags-/Kostenstellen-abhängige Approval-Policies
- Refactoring der Inline-Form auf wiederverwendbare Form-Komponente
- Nachrüsten des suchbaren Combobox-Patterns im Order-Form für CostCenter
- Backfill bestehender InboundInvoices
- CostCenter-Detail-Tab mit Eingangsrechnungen (nicht im Scope, kann separat nachgeholt werden)
- DATEV-Spalten > 39 (EU-Land, Zusatzinformationen, etc.)
- Berater-Nr / Mandanten-Nr in DATEV-Header (bleiben leer, wie bisher)

## Design-Entscheidungen

### E1: Inverse Relations auf Order/CostCenter → JA

Order und CostCenter sind Terp-Modelle, keine Platform-Modelle. Die CLAUDE.md-Einschränkung ("Prisma relations from platform models to Terp models are defined at the SQL level only — no `@relation` declarations in `schema.prisma`") betrifft nur Platform→Terp-Richtung. Order hat bereits 6 inverse Relationen, CostCenter hat 2 — eine weitere ist unproblematisch.

**Umsetzung**: `inboundInvoices InboundInvoice[]` auf Order und CostCenter anlegen.

### E2: orderId/costCenterId im updateSchema → JA

`supplierId` hat eine eigene `assignSupplier`-Mutation wegen des komplexen Matching-Workflows (ZUGFeRD-Parsing, Status-Tracking). Für orderId/costCenterId gibt es keinen solchen Workflow — es ist eine einfache optionale Zuordnung. Die Felder werden direkt in `updateSchema` aufgenommen.

**Umsetzung**: `orderId: z.string().uuid().nullable().optional()` und `costCenterId: z.string().uuid().nullable().optional()` in updateSchema.

### E3: Client-seitige Filterung statt Server-Suche → JA

`useOrders({ isActive: true })` und `useCostCenters({ isActive: true })` laden alle aktiven Einträge. Bei typischen Tenant-Größen (< 500 Orders/CostCenters) ist Client-seitige Filterung im Popover performant genug. Ein neuer Server-Suche-Endpoint wäre Over-Engineering.

**Umsetzung**: Popover-Komponente lädt alle Items via Hook, filtert lokal per Input.

### E4: DATEV-Spalten bis Position 39 → JA

KOST1 ist DATEV-Position 37, KOST2 ist Position 38. Wir erweitern bis Position 39 (KOST-Menge, leer), damit DATEV-Import-Tools die Positionen korrekt erkennen. Spalten 15-36: Werte bleiben leer (Terp füllt sie nicht), aber die Header-Namen sind Pflicht.

**Umsetzung**: 22 benannte Spalten zwischen Buchungstext (Position 14) und KOST1 (Position 37) mit korrekten DATEV-Spaltennamen im Header einfügen. Die Werte dieser Spalten bleiben leer (Terp füllt sie nicht), aber die Header-Namen sind Pflicht — ohne korrekten Header lehnt der DATEV-Importer die Datei ab. Vollständige Spaltenliste mit Quelle siehe Phase 2.

**Verifizierte Quelle**: https://developer.datev.de/de/file-format/details/datev-format/format-description/booking-batch

### E5: KOST1 = Order.code, KOST2 = CostCenter.code

Branchenübliche Zuordnung im DATEV-Kontext: KOST1 = Kostenträger/Auftrag, KOST2 = Kostenstelle. Beide als `code` (nicht `name`), da DATEV-Systeme kurze Codes erwarten.

### E6: orderId-Filter im bestehenden list-Endpoint → JA

Für den Order-Detail-Tab brauchen wir InboundInvoices gefiltert nach orderId. Statt einen neuen Endpoint zu bauen, erweitern wir den bestehenden `list`-Endpoint um einen optionalen `orderId`-Filter. Gleiche Architektur wie der bestehende `supplierId`-Filter.

---

## Phase 1: Order/CostCenter-Verknüpfung

### 1.1 Supabase-Migration

**Neue Datei**: `supabase/migrations/[timestamp]_add_order_costcenter_to_inbound_invoices.sql`

```sql
-- Add optional order and cost center assignment to inbound invoices
ALTER TABLE inbound_invoices
  ADD COLUMN order_id UUID REFERENCES orders(id) ON DELETE SET NULL;

ALTER TABLE inbound_invoices
  ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;

-- Tenant-scoped indexes for query performance
CREATE INDEX idx_inbound_invoices_order ON inbound_invoices(tenant_id, order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX idx_inbound_invoices_cost_center ON inbound_invoices(tenant_id, cost_center_id)
  WHERE cost_center_id IS NOT NULL;
```

Hinweis: Partial Indexes (`WHERE ... IS NOT NULL`) weil die Felder optional sind und die Mehrheit der Rows null hat. Pattern analog zu `idx_inbound_invoices_tenant_supplier`.

### 1.2 Prisma-Schema

**Datei**: `prisma/schema.prisma`

**InboundInvoice-Modell** (nach Zeile ~76, vor `createdAt`):

```prisma
  orderId             String?   @map("order_id") @db.Uuid
  costCenterId        String?   @map("cost_center_id") @db.Uuid
```

**Relationen** (nach `sourceEmailLog` Relation, ca. Zeile 82):

```prisma
  order            Order?                @relation(fields: [orderId], references: [id], onDelete: SetNull)
  costCenter       CostCenter?           @relation(fields: [costCenterId], references: [id], onDelete: SetNull)
```

**Indexes** (vor `@@map`):

```prisma
  @@index([tenantId, orderId], map: "idx_inbound_invoices_order")
  @@index([tenantId, costCenterId], map: "idx_inbound_invoices_cost_center")
```

**Order-Modell** (ca. Zeile 2135, nach `billingServiceCases`):

```prisma
  inboundInvoices     InboundInvoice[]
```

**CostCenter-Modell** (ca. Zeile 1360, nach `orders`):

```prisma
  inboundInvoices InboundInvoice[]
```

**Danach**: `pnpm db:generate` um Prisma Client zu regenerieren.

### 1.3 Repository: Includes erweitern

**Datei**: `src/lib/services/inbound-invoice-repository.ts`

**DEFAULT_INCLUDE** (Zeile 4-10) — zwei neue Selects ergänzen:

```typescript
const DEFAULT_INCLUDE = {
  supplier: { select: { id: true, number: true, company: true, vatId: true } },
  order: { select: { id: true, code: true, name: true } },
  costCenter: { select: { id: true, code: true, name: true } },
  lineItems: { orderBy: { sortOrder: "asc" as const } },
  approvals: { orderBy: { stepOrder: "asc" as const } },
  createdByUser: { select: { id: true, displayName: true, email: true } },
  submitter: { select: { id: true, displayName: true, email: true } },
}
```

**findMany** include (Zeile 76-78) — leichtgewichtigen Select erweitern:

```typescript
include: {
  supplier: { select: { id: true, number: true, company: true } },
  order: { select: { id: true, code: true, name: true } },
  costCenter: { select: { id: true, code: true, name: true } },
},
```

**findMany** filters (nach Zeile 56) — orderId-Filter ergänzen:

```typescript
if (filters?.orderId) where.orderId = filters.orderId
if (filters?.costCenterId) where.costCenterId = filters.costCenterId
```

Und den TypeScript-Typ des `filters`-Parameters erweitern:

```typescript
filters?: {
  status?: string
  supplierId?: string
  supplierStatus?: string
  orderId?: string        // NEU
  costCenterId?: string   // NEU
  search?: string
  dateFrom?: string
  dateTo?: string
}
```

### 1.4 Service: update() und TRACKED_FIELDS

**Datei**: `src/lib/services/inbound-invoice-service.ts`

**TRACKED_FIELDS** (Zeile 20-23) — orderId und costCenterId ergänzen:

```typescript
const TRACKED_FIELDS = [
  "invoiceNumber", "invoiceDate", "dueDate", "totalNet", "totalVat", "totalGross",
  "supplierId", "orderId", "costCenterId", "paymentTermDays", "notes", "status",
] as const
```

**MATERIAL_FIELDS** (Zeile 18): **NICHT ändern**. orderId/costCenterId sind keine Material-Felder.

**update()** (Zeile 194-256) — Tenant-Validierung für orderId/costCenterId einfügen. Neuer Block nach dem Status-Guard (Zeile 208), vor der Material-Field-Prüfung (Zeile 210):

```typescript
  // Validate orderId belongs to same tenant
  if (data.orderId) {
    const order = await prisma.order.findFirst({
      where: { id: data.orderId as string, tenantId },
      select: { id: true },
    })
    if (!order) {
      throw new InboundInvoiceValidationError("Order not found or belongs to another tenant")
    }
  }

  // Validate costCenterId belongs to same tenant
  if (data.costCenterId) {
    const costCenter = await prisma.costCenter.findFirst({
      where: { id: data.costCenterId as string, tenantId },
      select: { id: true },
    })
    if (!costCenter) {
      throw new InboundInvoiceValidationError("Cost center not found or belongs to another tenant")
    }
  }
```

**Wichtig**: Die Validierung prüft nur wenn der Wert truthy ist (nicht null). `null` wird durchgelassen — das erlaubt das Entfernen der Zuordnung.

### 1.5 tRPC-Router: Input/Output

**Datei**: `src/trpc/routers/invoices/inbound.ts`

**listSchema** (Zeile 28-37) — zwei Filter ergänzen:

```typescript
const listSchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  supplierStatus: z.string().optional(),
  orderId: z.string().uuid().optional(),        // NEU
  costCenterId: z.string().uuid().optional(),    // NEU
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})
```

**updateSchema** (Zeile 44-54) — zwei Felder ergänzen:

```typescript
const updateSchema = z.object({
  id: z.string().uuid(),
  invoiceNumber: z.string().max(100).optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  totalNet: z.number().nullable().optional(),
  totalVat: z.number().nullable().optional(),
  totalGross: z.number().nullable().optional(),
  paymentTermDays: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),       // NEU
  costCenterId: z.string().uuid().nullable().optional(),   // NEU
})
```

**update mutation** — orderId/costCenterId an den Service durchreichen. Im data-Objekt das an `service.update()` übergeben wird (im Bereich der Date-Konvertierung):

```typescript
// In der update mutation, data-Objekt ergänzen:
if (input.orderId !== undefined) data.orderId = input.orderId
if (input.costCenterId !== undefined) data.costCenterId = input.costCenterId
```

**Kein Output-Mapping nötig**: Die Queries (`getById`, `list`) geben die Prisma-Objekte direkt zurück. Durch die Include-Erweiterung im Repository (1.3) enthalten sie automatisch `order` und `costCenter`.

### 1.6 Hooks

**Datei**: `src/hooks/useInboundInvoices.ts`

Der `useInboundInvoices()` Hook leitet die Filter direkt an den tRPC-Call weiter. Durch die listSchema-Erweiterung (1.5) sind `orderId` und `costCenterId` automatisch verfügbar. Der TypeScript-Typ muss nur im options-Parameter des Hooks ergänzt werden:

```typescript
export function useInboundInvoices(
  options?: {
    status?: string
    supplierId?: string
    supplierStatus?: string
    orderId?: string        // NEU
    costCenterId?: string   // NEU
    search?: string
    dateFrom?: string
    dateTo?: string
    page?: number
    pageSize?: number
  },
  enabled = true
)
```

### 1.7 UI: Eingangsrechnungs-Detail — Order/CostCenter-Felder

**Datei**: `src/components/invoices/inbound-invoice-detail.tsx`

#### 1.7a: Form-State initialisieren (Zeile 70-79)

```typescript
setForm({
  invoiceNumber: invoice.invoiceNumber ?? '',
  invoiceDate: formatDate(invoice.invoiceDate),
  dueDate: formatDate(invoice.dueDate),
  totalNet: invoice.totalNet != null ? Number(invoice.totalNet) : '',
  totalVat: invoice.totalVat != null ? Number(invoice.totalVat) : '',
  totalGross: invoice.totalGross != null ? Number(invoice.totalGross) : '',
  paymentTermDays: invoice.paymentTermDays ?? '',
  notes: invoice.notes ?? '',
  orderId: invoice.orderId ?? null,           // NEU
  costCenterId: invoice.costCenterId ?? null, // NEU
})
```

#### 1.7b: handleSave erweitern (Zeile 108-118)

```typescript
await updateMutation.mutateAsync({
  id: invoice.id,
  invoiceNumber: form.invoiceNumber as string || undefined,
  invoiceDate: form.invoiceDate as string || undefined,
  dueDate: (form.dueDate as string) || null,
  totalNet: form.totalNet !== '' ? Number(form.totalNet) : null,
  totalVat: form.totalVat !== '' ? Number(form.totalVat) : null,
  totalGross: form.totalGross !== '' ? Number(form.totalGross) : null,
  paymentTermDays: form.paymentTermDays !== '' ? Number(form.paymentTermDays) : null,
  notes: (form.notes as string) || null,
  orderId: (form.orderId as string) || null,           // NEU
  costCenterId: (form.costCenterId as string) || null, // NEU
})
```

#### 1.7c: Neue Card "Zuordnung" nach Supplier-Card (nach Zeile 395)

Neue Card zwischen Supplier-Card und Approval-History-Card einfügen. Pattern: Popover + Input mit client-seitiger Filterung (angelehnt an `ArticleSearchPopover`).

```tsx
{/* Order & Cost Center Assignment */}
<Card>
  <CardHeader className="pb-3">
    <CardTitle className="text-sm">{t('detail.assignmentTitle')}</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {/* Order Field */}
    <div>
      <Label className="text-xs text-muted-foreground">{t('detail.orderLabel')}</Label>
      {isEditable ? (
        <OrderCombobox
          value={form.orderId as string | null}
          onChange={(id) => handleFieldChange('orderId', id)}
        />
      ) : invoice.order ? (
        <Link
          href={`/${locale}/admin/orders/${invoice.order.id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          {invoice.order.code} — {invoice.order.name}
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">{t('detail.noOrderAssigned')}</p>
      )}
    </div>

    {/* Cost Center Field */}
    <div>
      <Label className="text-xs text-muted-foreground">{t('detail.costCenterLabel')}</Label>
      {isEditable ? (
        <CostCenterCombobox
          value={form.costCenterId as string | null}
          onChange={(id) => handleFieldChange('costCenterId', id)}
        />
      ) : invoice.costCenter ? (
        <Link
          href={`/${locale}/admin/cost-centers`}
          className="text-sm text-blue-600 hover:underline"
        >
          {invoice.costCenter.code} — {invoice.costCenter.name}
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">{t('detail.noCostCenterAssigned')}</p>
      )}
    </div>
  </CardContent>
</Card>
```

#### 1.7d: Combobox-Komponenten

Zwei neue Komponenten als lokale Inline-Komponenten im selben File ODER als eigenständige Dateien. Entscheidung: **Eigenständige Dateien**, da sie in Phase 2 und für zukünftige Features wiederverwendbar sind.

**Neue Datei**: `src/components/invoices/order-combobox.tsx`

Implementierung nach dem `ArticleSearchPopover`-Pattern (`src/components/warehouse/article-search-popover.tsx:36-145`):

```tsx
"use client"

import * as React from "react"
import { useOrders } from "@/hooks/use-orders"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface OrderComboboxProps {
  value: string | null
  onChange: (orderId: string | null) => void
}

export function OrderCombobox({ value, onChange }: OrderComboboxProps) {
  const [query, setQuery] = React.useState("")
  const [open, setOpen] = React.useState(false)
  const { data: orders } = useOrders({ isActive: true })

  const selected = orders?.find((o) => o.id === value)
  const filtered = (orders ?? []).filter((o) =>
    !query || o.code.toLowerCase().includes(query.toLowerCase())
           || o.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <div className="flex items-center gap-1">
            <Input
              value={selected ? `${selected.code} — ${selected.name}` : query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              placeholder="Auftrag suchen..."
              className="text-sm"
            />
            {value && (
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => { onChange(null); setQuery("") }}>
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Keine Aufträge gefunden</p>
            ) : filtered.map((o) => (
              <button
                key={o.id}
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(o.id)
                  setQuery("")
                  setOpen(false)
                }}
              >
                <span className="font-medium">{o.code}</span>
                <span className="ml-2 text-muted-foreground">{o.name}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
```

**Neue Datei**: `src/components/invoices/cost-center-combobox.tsx`

Identisches Pattern, nutzt `useCostCenters({ isActive: true })` statt `useOrders()`.

### 1.8 UI: Order-Detail Tab "Eingangsrechnungen"

**Datei**: `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`

#### 1.8a: Import und Hook

Am Anfang der Datei importieren:

```typescript
import { useInboundInvoices } from "@/hooks/useInboundInvoices"
```

Im Component-Body (neben den bestehenden Hooks für assignments/bookings):

```typescript
const { data: inboundInvoicesData, isLoading: inboundInvoicesLoading } =
  useInboundInvoices({ orderId: id }, true)
const inboundInvoices = inboundInvoicesData?.items ?? []
```

#### 1.8b: Tab hinzufügen (nach Zeile 192)

```tsx
<TabsTrigger value="inbound-invoices">{t('tabInboundInvoices')}</TabsTrigger>
```

#### 1.8c: TabsContent (nach Zeile 301, vor `</Tabs>`)

```tsx
<TabsContent value="inbound-invoices" className="mt-6 space-y-4">
  <h3 className="text-lg font-medium">{t('sectionInboundInvoices')}</h3>
  <Card>
    <CardContent className="p-0">
      {inboundInvoicesLoading ? (
        <div className="p-6"><Skeleton className="h-32" /></div>
      ) : inboundInvoices.length === 0 ? (
        <div className="text-center py-12 px-6">
          <p className="text-muted-foreground">{t('emptyInboundInvoices')}</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('inboundInvoiceNumber')}</TableHead>
              <TableHead>{t('inboundInvoiceSupplier')}</TableHead>
              <TableHead>{t('inboundInvoiceDate')}</TableHead>
              <TableHead className="text-right">{t('inboundInvoiceGross')}</TableHead>
              <TableHead>{t('inboundInvoiceStatus')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {inboundInvoices.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell>
                  <Link href={`/${locale}/invoices/inbound/${inv.id}`}
                        className="text-blue-600 hover:underline">
                    {inv.number}
                  </Link>
                </TableCell>
                <TableCell>{inv.supplier?.company ?? '—'}</TableCell>
                <TableCell>{inv.invoiceDate ? formatDate(inv.invoiceDate) : '—'}</TableCell>
                <TableCell className="text-right">
                  {inv.totalGross != null ? Number(inv.totalGross).toFixed(2) : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

**Permission**: Der Tab wird immer gerendert. Die Query `useInboundInvoices` nutzt `trpc.invoices.inbound.list`, die bereits `inbound_invoices.view` prüft. Fehlt die Berechtigung, schlägt der API-Call fehl und die Liste bleibt leer. Das ist akzeptabel — der Tab schadet nicht, und eine Client-seitige Permission-Prüfung würde duplizierte Logik erfordern.

Alternative: Tab nur rendern wenn `inbound_invoices.view` vorhanden. Das erfordert Zugriff auf den Permission-Context. Entscheidung: **Tab immer rendern** (konservativ, kein zusätzlicher Permission-Plumbing nötig).

### 1.9 i18n-Keys

**Datei**: `public/locales/de/common.json` und `public/locales/en/common.json`

Neue Keys (deutsches Beispiel):

```json
"detail.assignmentTitle": "Zuordnung",
"detail.orderLabel": "Auftrag (optional)",
"detail.costCenterLabel": "Kostenstelle (optional)",
"detail.noOrderAssigned": "Kein Auftrag zugeordnet",
"detail.noCostCenterAssigned": "Keine Kostenstelle zugeordnet",
"tabInboundInvoices": "Eingangsrechnungen",
"sectionInboundInvoices": "Eingangsrechnungen",
"emptyInboundInvoices": "Noch keine Eingangsrechnungen mit diesem Auftrag verknüpft",
"inboundInvoiceNumber": "Nummer",
"inboundInvoiceSupplier": "Lieferant",
"inboundInvoiceDate": "Datum",
"inboundInvoiceGross": "Brutto",
"inboundInvoiceStatus": "Status"
```

Hinweis: Die genauen Key-Pfade hängen von der bestehenden i18n-Struktur ab. Während der Implementierung muss geprüft werden, in welchem Namespace die Keys liegen (wahrscheinlich `invoices` bzw. `orders`).

### 1.10 Tests

#### 1.10a: Integration-Tests für Service

**Datei**: `src/lib/services/__tests__/inbound-invoice-service.integration.test.ts`

**Setup erweitern** (in `beforeAll`): Einen Test-Order und eine Test-CostCenter anlegen:

```typescript
// In beforeAll, nach User/Tenant setup:
const TEST_ORDER_ID = "f0000000-0000-4000-a000-000000000510"
const TEST_COSTCENTER_ID = "f0000000-0000-4000-a000-000000000511"
const OTHER_TENANT_ORDER_ID = "f0000000-0000-4000-a000-000000000512"

await prisma.costCenter.upsert({
  where: { id: TEST_COSTCENTER_ID },
  create: { id: TEST_COSTCENTER_ID, tenantId: TEST_TENANT_ID, code: "KST-001", name: "Test Kostenstelle" },
  update: {},
})

await prisma.order.upsert({
  where: { id: TEST_ORDER_ID },
  create: { id: TEST_ORDER_ID, tenantId: TEST_TENANT_ID, code: "AUF-001", name: "Test Auftrag" },
  update: {},
})

// Order in anderem Tenant für Cross-Check:
await prisma.order.upsert({
  where: { id: OTHER_TENANT_ORDER_ID },
  create: { id: OTHER_TENANT_ORDER_ID, tenantId: OTHER_TENANT_ID, code: "AUF-999", name: "Fremder Auftrag" },
  update: {},
})
```

**Cleanup** (in `afterAll`): Reihenfolge erweitern — InboundInvoice löschen VOR Order/CostCenter:

```typescript
// Bestehende Reihenfolge anpassen:
// 1. InboundInvoiceLineItem
// 2. InboundInvoiceApproval (falls vorhanden)
// 3. InboundInvoice ← muss VOR Order/CostCenter kommen wegen FK
// 4. Order ← NEU
// 5. CostCenter ← NEU
// 6. ... (Rest wie bisher)
```

**Neue Tests**:

```typescript
describe("order/costCenter assignment", () => {
  it("should update orderId and costCenterId", async () => {
    const invoice = await createTestInvoice()
    const updated = await service.update(prisma, TEST_TENANT_ID, invoice.id, {
      orderId: TEST_ORDER_ID,
      costCenterId: TEST_COSTCENTER_ID,
    })
    expect(updated.orderId).toBe(TEST_ORDER_ID)
    expect(updated.costCenterId).toBe(TEST_COSTCENTER_ID)
    expect(updated.order?.code).toBe("AUF-001")
    expect(updated.costCenter?.code).toBe("KST-001")
  })

  it("should not increment approvalVersion when orderId changes", async () => {
    const invoice = await createTestInvoice()
    const vBefore = invoice.approvalVersion
    const updated = await service.update(prisma, TEST_TENANT_ID, invoice.id, {
      orderId: TEST_ORDER_ID,
    })
    expect(updated.approvalVersion).toBe(vBefore)
  })

  it("should not increment approvalVersion when costCenterId changes", async () => {
    const invoice = await createTestInvoice()
    const vBefore = invoice.approvalVersion
    const updated = await service.update(prisma, TEST_TENANT_ID, invoice.id, {
      costCenterId: TEST_COSTCENTER_ID,
    })
    expect(updated.approvalVersion).toBe(vBefore)
  })

  it("should reject orderId from different tenant", async () => {
    const invoice = await createTestInvoice()
    await expect(
      service.update(prisma, TEST_TENANT_ID, invoice.id, {
        orderId: OTHER_TENANT_ORDER_ID,
      })
    ).rejects.toThrow("Order not found or belongs to another tenant")
  })

  it("should allow clearing orderId with null", async () => {
    const invoice = await createTestInvoice()
    await service.update(prisma, TEST_TENANT_ID, invoice.id, {
      orderId: TEST_ORDER_ID,
    })
    const cleared = await service.update(prisma, TEST_TENANT_ID, invoice.id, {
      orderId: null,
    })
    expect(cleared.orderId).toBeNull()
  })

  it("should include order in getById response", async () => {
    const invoice = await createTestInvoice()
    await service.update(prisma, TEST_TENANT_ID, invoice.id, {
      orderId: TEST_ORDER_ID,
    })
    const fetched = await service.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(fetched.order).toEqual({ id: TEST_ORDER_ID, code: "AUF-001", name: "Test Auftrag" })
  })

  it("should filter list by orderId", async () => {
    const inv1 = await createTestInvoice()
    const inv2 = await createTestInvoice()
    await service.update(prisma, TEST_TENANT_ID, inv1.id, { orderId: TEST_ORDER_ID })

    const result = await service.list(prisma, TEST_TENANT_ID, { orderId: TEST_ORDER_ID })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe(inv1.id)
  })
})
```

### Phase 1: Success Criteria

#### Automated Verification:
- [ ] Migration applies cleanly: `pnpm db:reset` (lokale DB) oder manuell `supabase migration up`
- [ ] Prisma Client regeneriert: `pnpm db:generate`
- [ ] Type-Check: `pnpm typecheck`
- [ ] Lint: `pnpm lint`
- [ ] Bestehende Tests grün: `pnpm vitest run src/lib/services/__tests__/inbound-invoice-service.integration.test.ts`
- [ ] Neue Tests grün: orderId/costCenterId assignment, approvalVersion, cross-tenant
- [ ] DATEV-Export-Tests weiterhin grün: `pnpm vitest run src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts`
- [ ] Build: `pnpm build`

#### Manual Verification:
- [ ] Eingangsrechnung im DRAFT erstellen → Auftrag per Combobox zuordnen → Speichern → Seite neu laden → Auftrag ist gesetzt
- [ ] Kostenstelle zuordnen → gleicher Test
- [ ] Auftrag entfernen (X-Button) → Speichern → Feld ist leer
- [ ] Im Status APPROVED: Felder sind read-only, Auftrag wird als Link angezeigt
- [ ] Order-Detail → Tab "Eingangsrechnungen" → zugeordnete Rechnung erscheint
- [ ] Klick auf Rechnungsnummer in der Tabelle → navigiert zur Detail-Seite

---

## Phase 2: DATEV-Export erweitern (nach Phase-1-Verifikation)

### 2.1 Spalten-Erweiterung

**Datei**: `src/lib/services/inbound-invoice-datev-export-service.ts`

#### 2.1a: buildColumnHeader() erweitern (Zeile 135-152)

Von 14 auf 39 Spalten nach DATEV-Buchungsstapel-Standard (Datenkategorie 21, Version 12).

**WICHTIG**: Die Spaltennamen in Positionen 21-36 verwenden den UTF-8-Gedankenstrich `–` (U+2013), nicht den ASCII-Bindestrich `-`. DATEV ist hier strikt — falsche Zeichen führen zu Import-Fehlern.

```typescript
// DATEV-Buchungsstapel Spaltendefinition (Format Buchungsstapel V7+):
// Spec: https://developer.datev.de/de/file-format/details/datev-format/format-description/booking-batch
// Position 37 = KOST1, 38 = KOST2, 39 = Kost-Menge (leer)
// Spalten 15-36 sind benannte DATEV-Standardfelder, die Terp aktuell nicht befüllt,
// deren Header-Namen aber Pflicht sind — sonst lehnt der DATEV-Importer die Datei ab.
function buildColumnHeader(): string {
  return [
    // Pos 1-14 (bestehend)
    "Umsatz (ohne Soll/Haben-Kz)",          // 1
    "Soll/Haben-Kennzeichen",               // 2
    "WKZ Umsatz",                           // 3
    "Kurs",                                 // 4
    "Basis-Umsatz",                         // 5
    "WKZ Basis-Umsatz",                     // 6
    "Konto",                                // 7
    "Gegenkonto (ohne BU-Schlüssel)",       // 8
    "BU-Schlüssel",                         // 9
    "Belegdatum",                           // 10
    "Belegfeld 1",                          // 11
    "Belegfeld 2",                          // 12
    "Skonto",                               // 13
    "Buchungstext",                         // 14
    // Pos 15-36 (neu, benannt aber nicht befüllt — Header-Namen sind Pflicht)
    "Postensperre",                         // 15
    "Diverse Adressnummer",                 // 16
    "Geschäftspartnerbank",                 // 17
    "Sachverhalt",                          // 18
    "Zinssperre",                           // 19
    "Beleglink",                            // 20
    "Beleginfo \u2013 Art 1",              // 21  (U+2013 = Gedankenstrich)
    "Beleginfo \u2013 Inhalt 1",           // 22
    "Beleginfo \u2013 Art 2",              // 23
    "Beleginfo \u2013 Inhalt 2",           // 24
    "Beleginfo \u2013 Art 3",              // 25
    "Beleginfo \u2013 Inhalt 3",           // 26
    "Beleginfo \u2013 Art 4",              // 27
    "Beleginfo \u2013 Inhalt 4",           // 28
    "Beleginfo \u2013 Art 5",              // 29
    "Beleginfo \u2013 Inhalt 5",           // 30
    "Beleginfo \u2013 Art 6",              // 31
    "Beleginfo \u2013 Inhalt 6",           // 32
    "Beleginfo \u2013 Art 7",              // 33
    "Beleginfo \u2013 Inhalt 7",           // 34
    "Beleginfo \u2013 Art 8",              // 35
    "Beleginfo \u2013 Inhalt 8",           // 36
    // Pos 37-39 (KOST-Felder)
    "KOST1 \u2013 Kostenstelle",           // 37
    "KOST2 \u2013 Kostenstelle",           // 38
    "Kost-Menge",                           // 39
  ].join(";")
}
```

#### 2.1b: Prisma-Include für Export erweitern (Zeile 186-193)

```typescript
const invoices = await prisma.inboundInvoice.findMany({
  where,
  include: {
    supplier: { select: { company: true, vatId: true } },
    lineItems: { select: { vatRate: true } },
    order: { select: { code: true } },           // NEU
    costCenter: { select: { code: true } },       // NEU
  },
  orderBy: { invoiceDate: "asc" },
})
```

#### 2.1c: Row-Array auf 39 Spalten erweitern (Zeile 218-233)

```typescript
const row = [
  // Pos 1-14 (bestehend)
  formatDecimal(Number(inv.totalGross ?? 0)),           // 1: Umsatz
  "S",                                                   // 2: Soll
  "EUR",                                                 // 3: WKZ
  "",                                                    // 4: Kurs
  "",                                                    // 5: Basis-Umsatz
  "",                                                    // 6: WKZ Basis
  "",                                                    // 7: Konto (Phase 3)
  "",                                                    // 8: Gegenkonto (Phase 3)
  String(vatKey),                                        // 9: BU-Schlüssel
  inv.invoiceDate ? formatDatevDate(inv.invoiceDate) : "", // 10: Belegdatum
  escapeField(truncate(inv.invoiceNumber ?? "", 12)),    // 11: Belegfeld 1
  "",                                                    // 12: Belegfeld 2
  "",                                                    // 13: Skonto
  escapeField(buchungstext),                             // 14: Buchungstext
  // Pos 15-36 (22 leere Strings — Header-Namen sind Pflicht, Werte leer)
  "", "", "", "", "", "",                                 // 15-20
  "", "", "", "", "", "",                                 // 21-26
  "", "", "", "", "", "",                                 // 27-32
  "", "", "", "",                                         // 33-36
  // Pos 37-39 (KOST-Felder)
  escapeField(inv.order?.code ?? ""),                    // 37: KOST1
  escapeField(inv.costCenter?.code ?? ""),               // 38: KOST2
  "",                                                    // 39: KOST-Menge
]
```

### 2.2 Tests

**Datei**: `src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts`

#### 2.2a: Header-Test aktualisieren

Bestehende Tests die die Column-Header-Anzahl oder -Inhalt prüfen müssen auf 39 Spalten aktualisiert werden. Der Test prüft **alle** 39 Spaltennamen exakt — inklusive der UTF-8-Gedankenstriche in den Beleginfo- und KOST-Spalten.

```typescript
it("should have 39 column headers with exact DATEV names", () => {
  const header = buildColumnHeader()
  const columns = header.split(";")
  expect(columns).toHaveLength(39)

  // Vollständige Prüfung aller 39 Spalten (DATEV-Buchungsstapel V12)
  const expected = [
    "Umsatz (ohne Soll/Haben-Kz)",          // 1
    "Soll/Haben-Kennzeichen",               // 2
    "WKZ Umsatz",                           // 3
    "Kurs",                                 // 4
    "Basis-Umsatz",                         // 5
    "WKZ Basis-Umsatz",                     // 6
    "Konto",                                // 7
    "Gegenkonto (ohne BU-Schlüssel)",       // 8
    "BU-Schlüssel",                         // 9
    "Belegdatum",                           // 10
    "Belegfeld 1",                          // 11
    "Belegfeld 2",                          // 12
    "Skonto",                               // 13
    "Buchungstext",                         // 14
    "Postensperre",                         // 15
    "Diverse Adressnummer",                 // 16
    "Geschäftspartnerbank",                 // 17
    "Sachverhalt",                          // 18
    "Zinssperre",                           // 19
    "Beleglink",                            // 20
    "Beleginfo \u2013 Art 1",              // 21
    "Beleginfo \u2013 Inhalt 1",           // 22
    "Beleginfo \u2013 Art 2",              // 23
    "Beleginfo \u2013 Inhalt 2",           // 24
    "Beleginfo \u2013 Art 3",              // 25
    "Beleginfo \u2013 Inhalt 3",           // 26
    "Beleginfo \u2013 Art 4",              // 27
    "Beleginfo \u2013 Inhalt 4",           // 28
    "Beleginfo \u2013 Art 5",              // 29
    "Beleginfo \u2013 Inhalt 5",           // 30
    "Beleginfo \u2013 Art 6",              // 31
    "Beleginfo \u2013 Inhalt 6",           // 32
    "Beleginfo \u2013 Art 7",              // 33
    "Beleginfo \u2013 Inhalt 7",           // 34
    "Beleginfo \u2013 Art 8",              // 35
    "Beleginfo \u2013 Inhalt 8",           // 36
    "KOST1 \u2013 Kostenstelle",           // 37
    "KOST2 \u2013 Kostenstelle",           // 38
    "Kost-Menge",                           // 39
  ]
  expect(columns).toEqual(expected)
})
```

#### 2.2b: Integration-Tests für KOST-Felder

**Setup erweitern**: Test-Order und Test-CostCenter anlegen (gleich wie in 1.10a).

```typescript
describe("KOST fields in export", () => {
  it("should export KOST1 with order code when orderId is set", async () => {
    const invoice = await createApprovedInvoiceWithOrder(TEST_ORDER_ID)
    const result = await datevExportService.exportToCsv(
      prisma, TEST_TENANT_ID,
      { invoiceIds: [invoice.id] },
      TEST_USER_ID
    )
    const csv = iconv.decode(result.csv, "win1252")
    const lines = csv.split("\r\n")
    const dataRow = lines[2] // Row 0=header, 1=columns, 2=first data
    const fields = dataRow.split(";")
    expect(fields[36]).toBe("AUF-001")  // KOST1 (0-indexed: position 37)
    expect(fields[37]).toBe("")          // KOST2 empty
  })

  it("should export KOST2 with cost center code when costCenterId is set", async () => {
    const invoice = await createApprovedInvoiceWithCostCenter(TEST_COSTCENTER_ID)
    const result = await datevExportService.exportToCsv(
      prisma, TEST_TENANT_ID,
      { invoiceIds: [invoice.id] },
      TEST_USER_ID
    )
    const csv = iconv.decode(result.csv, "win1252")
    const lines = csv.split("\r\n")
    const fields = lines[2].split(";")
    expect(fields[36]).toBe("")          // KOST1 empty
    expect(fields[37]).toBe("KST-001")  // KOST2
  })

  it("should export both KOST1 and KOST2 when both are set", async () => {
    const invoice = await createApprovedInvoiceWithBoth(TEST_ORDER_ID, TEST_COSTCENTER_ID)
    const result = await datevExportService.exportToCsv(
      prisma, TEST_TENANT_ID,
      { invoiceIds: [invoice.id] },
      TEST_USER_ID
    )
    const csv = iconv.decode(result.csv, "win1252")
    const fields = csv.split("\r\n")[2].split(";")
    expect(fields[36]).toBe("AUF-001")
    expect(fields[37]).toBe("KST-001")
  })

  it("should leave KOST1/KOST2 empty when neither is set", async () => {
    const invoice = await createApprovedInvoiceWithoutAssignments()
    const result = await datevExportService.exportToCsv(
      prisma, TEST_TENANT_ID,
      { invoiceIds: [invoice.id] },
      TEST_USER_ID
    )
    const csv = iconv.decode(result.csv, "win1252")
    const fields = csv.split("\r\n")[2].split(";")
    expect(fields[36]).toBe("")
    expect(fields[37]).toBe("")
  })

  it("should have 39 fields per data row", async () => {
    const invoice = await createApprovedInvoiceWithoutAssignments()
    const result = await datevExportService.exportToCsv(
      prisma, TEST_TENANT_ID,
      { invoiceIds: [invoice.id] },
      TEST_USER_ID
    )
    const csv = iconv.decode(result.csv, "win1252")
    const dataRow = csv.split("\r\n")[2]
    expect(dataRow.split(";")).toHaveLength(39)
  })
})
```

### Phase 2: Success Criteria

#### Automated Verification:
- [ ] Type-Check: `pnpm typecheck`
- [ ] Lint: `pnpm lint`
- [ ] Alle DATEV-Export-Tests grün: `pnpm vitest run src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts`
- [ ] Bestehende Service-Tests weiterhin grün
- [ ] Build: `pnpm build`

#### Manual Verification:
- [ ] Eingangsrechnung mit Auftrag und Kostenstelle erstellen → Freigeben → DATEV-Export auslösen
- [ ] Exportierte CSV öffnen: 39 Spalten, KOST1 = Order.code, KOST2 = CostCenter.code
- [ ] Export ohne Zuordnungen: KOST1/KOST2 leer, kein Fehler
- [ ] CSV in DATEV-Import-Tool (oder Validator) laden: keine Formatfehler

---

## Geänderte Dateien (Zusammenfassung)

### Phase 1
| Datei | Änderung |
|-------|----------|
| `supabase/migrations/[ts]_add_order_costcenter_to_inbound_invoices.sql` | NEU: Migration |
| `prisma/schema.prisma` | InboundInvoice +2 Felder +2 Relationen +2 Indexes; Order +1 Inverse; CostCenter +1 Inverse |
| `src/lib/services/inbound-invoice-repository.ts` | DEFAULT_INCLUDE +2 selects; findMany include +2 selects; findMany filters +orderId/costCenterId |
| `src/lib/services/inbound-invoice-service.ts` | TRACKED_FIELDS +2; update() +Tenant-Validierung |
| `src/trpc/routers/invoices/inbound.ts` | listSchema +2 Filter; updateSchema +2 Felder; update mutation Durchreichung |
| `src/hooks/useInboundInvoices.ts` | Options-Typ +orderId/costCenterId |
| `src/components/invoices/order-combobox.tsx` | NEU: Suchbare Order-Auswahl |
| `src/components/invoices/cost-center-combobox.tsx` | NEU: Suchbare CostCenter-Auswahl |
| `src/components/invoices/inbound-invoice-detail.tsx` | Form-State +2 Felder; handleSave +2 Felder; neue Card "Zuordnung" |
| `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx` | Neuer Tab "Eingangsrechnungen" |
| `public/locales/de/...json` | i18n-Keys |
| `public/locales/en/...json` | i18n-Keys |
| `src/lib/services/__tests__/inbound-invoice-service.integration.test.ts` | Setup + 6 neue Tests |

### Phase 2
| Datei | Änderung |
|-------|----------|
| `src/lib/services/inbound-invoice-datev-export-service.ts` | buildColumnHeader() 14→39; Row-Array 14→39; Export-Include +order/costCenter |
| `src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts` | Header-Test update; 5 neue KOST-Tests |

## Performance Considerations

- **Partial Indexes** auf `order_id` und `cost_center_id` (WHERE NOT NULL): Nur Rows mit gesetztem FK werden indexiert → minimaler Speicher-Overhead.
- **Client-seitige Filterung** für Order/CostCenter-Combobox: Bei > 500 aktiven Orders pro Tenant könnte Performance zum Problem werden. Dann Server-seitige Suche nachrüsten. Aktuell nicht nötig.
- **DATEV-Export include**: Zwei zusätzliche `select`-Joins (order.code, costCenter.code). Minimaler Overhead, da nur ein Feld pro Join.

## References

- Bestandsaufnahme: `thoughts/shared/research/2026-04-12_15-34-14_inbound-invoice-order-costcenter-bestandsaufnahme.md`
- InboundInvoice Prisma-Schema: `prisma/schema.prisma:5594-5651`
- Order Prisma-Schema: `prisma/schema.prisma:2110-2142`
- CostCenter Prisma-Schema: `prisma/schema.prisma:1344-1364`
- Service: `src/lib/services/inbound-invoice-service.ts`
- Repository: `src/lib/services/inbound-invoice-repository.ts`
- Router: `src/trpc/routers/invoices/inbound.ts`
- DATEV-Export: `src/lib/services/inbound-invoice-datev-export-service.ts`
- UI Detail: `src/components/invoices/inbound-invoice-detail.tsx`
- Order Detail Page: `src/app/[locale]/(dashboard)/admin/orders/[id]/page.tsx`
- ArticleSearchPopover (UI-Pattern): `src/components/warehouse/article-search-popover.tsx`
- SupplierAssignmentDialog (UI-Pattern): `src/components/invoices/supplier-assignment-dialog.tsx`
- DATEV-Buchungsstapel-Spezifikation: https://developer.datev.de/de/file-format/details/datev-format/format-description/booking-batch

---

Plan-Update 2026-04-12: DATEV-Spalten 15–36 korrigiert (22 statt 25 leere Spalten, exakte Spaltennamen mit UTF-8-Gedankenstrich ergänzt, Quelle dokumentiert, Header-Test auf vollständige 39-Spalten-Prüfung erweitert).
