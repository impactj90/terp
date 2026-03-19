# Vorgang-Verknüpfung für Billing-Belege — Implementation Plan

## Overview

CrmInquiry (= "Vorgang") ist bereits als übergeordnete Klammer für Billing-Belege im Datenmodell vorhanden (`BillingDocument.inquiryId → CrmInquiry`). Das Erstellungsformular zeigt bereits ein Anfrage-Dropdown. Diese Implementierung verbessert die bestehende Verknüpfung: Status-Filter im Dropdown, nachträgliches Zuordnen im Editor, Vorgang-Filter in der Belegliste, und eine vollständige Belege-Tab auf der Inquiry-Detailseite.

## Current State Analysis

### Was bereits funktioniert:
- `BillingDocument.inquiryId` FK existiert (schema:637)
- `document-form.tsx` zeigt Inquiry-Dropdown wenn Adresse gesetzt + Inquiries vorhanden
- `billing.documents.list` hat `inquiryId`-Filter (router:38, repo:25)
- `useBillingDocuments` Hook und `BillingDocumentList` Component unterstützen `inquiryId`-Prop
- `InquiryDocumentsList` in `inquiry-detail.tsx:362–436` zeigt verknüpfte Belege (Nummer, Typ, Datum, Status)
- `findById` Repository inkludiert `inquiry: { select: { id, number, title } }` (repo:74)
- `useCrmInquiries` Hook unterstützt `status`-Filter

### Was fehlt:
- `billing.documents.update` akzeptiert kein `inquiryId` (router:72–93, service:274–312)
- Inquiry-Dropdown im Form filtert nicht nach Status (zeigt auch CLOSED/CANCELLED)
- Editor zeigt Inquiry nur read-only in Metadaten (editor:544–549), keine Editiermöglichkeit
- Belegliste hat keinen Vorgang-Filter im Toolbar
- Belege-Tab auf Inquiry-Detail hat keine Betrag-Spalte und keine Gesamtsumme

### Key Discoveries:
- `useCrmInquiries` akzeptiert nur einzelnen `status`-String — für OPEN+IN_PROGRESS nutzen wir Client-Side-Filter (max 100 Items geladen)
- `findMany` im Repository inkludiert `address: true` — Inquiry-Daten werden dort NICHT inkludiert, d.h. für den Vorgang-Filter in der Liste müssen wir die Inquiries separat laden
- `BillingDocumentList` hat bereits ein Pattern für den Kunden-Filter (lädt alle Docs, extrahiert unique customers) — Vorgang-Filter analog

## Desired End State

- User kann beim Erstellen eines Belegs einen Vorgang (nur OPEN/IN_PROGRESS) auswählen
- User kann im Editor (DRAFT-Belege) den Vorgang nachträglich ändern oder entfernen
- Belegliste hat einen "Vorgang"-Filter-Dropdown mit allen Inquiries die mindestens einen Beleg haben
- Inquiry-Detailseite zeigt alle verknüpften Belege mit Betrag-Spalte und Gesamtsumme

### Verification:
1. Beleg erstellen → Vorgang wählen → Beleg zeigt Vorgang in Sidebar
2. DRAFT-Beleg öffnen → Vorgang in Sidebar ändern → Seite refreshen → neuer Vorgang angezeigt
3. Belegliste → Vorgang-Filter wählen → nur Belege dieses Vorgangs sichtbar
4. Inquiry-Detail → Tab "Belege" → Tabelle mit Nummer, Typ, Status, Datum, Betrag + Gesamtsumme

## What We're NOT Doing

- Kein neues Model/Migration (CrmInquiry reicht)
- Kein eigener Nummernkreis für Vorgänge
- Keine Hierarchie von Vorgängen
- Kein mandantenübergreifendes Konzept
- Kein Umbenennen von "Anfrage" → "Vorgang" in der gesamten UI (nur punktuelle Label-Änderungen wo nötig)
- Kein `statusIn`-Array-Filter auf dem Backend (Client-Side-Filter reicht für Dropdown)

## Implementation Approach

5 Phasen, jede in sich abgeschlossen und testbar. Alle Änderungen sind rein additiv — kein Breaking Change.

---

## Phase 1: Backend — `inquiryId` in Update aufnehmen

### Overview
`billing.documents.update` Router und Service um `inquiryId` erweitern, damit DRAFT-Belege nachträglich einem Vorgang zugeordnet werden können.

### Changes Required:

#### 1. Router: updateInput Schema
**File**: `src/trpc/routers/billing/documents.ts`
**Changes**: `inquiryId` zum `updateInput` Schema hinzufügen

```typescript
// Line 72-93: updateInput — add after invoiceAddressId (line 76)
const updateInput = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable().optional(),
  deliveryAddressId: z.string().uuid().nullable().optional(),
  invoiceAddressId: z.string().uuid().nullable().optional(),
  inquiryId: z.string().uuid().nullable().optional(),  // <-- NEU
  orderDate: z.coerce.date().nullable().optional(),
  // ... rest bleibt gleich
})
```

#### 2. Service: update() Input Type + Fields Array
**File**: `src/lib/services/billing-document-service.ts`
**Changes**: `inquiryId` zum Input-Type (Line 274–295) und zur `fields`-Array (Line 303–312) hinzufügen

```typescript
// Input type — add after invoiceAddressId:
export async function update(
  prisma: PrismaClient,
  tenantId: string,
  input: {
    id: string
    contactId?: string | null
    deliveryAddressId?: string | null
    invoiceAddressId?: string | null
    inquiryId?: string | null           // <-- NEU
    orderDate?: Date | null
    // ... rest bleibt gleich
  }
)

// Fields array — add "inquiryId":
const fields = [
  "contactId", "deliveryAddressId", "invoiceAddressId",
  "inquiryId",                          // <-- NEU
  "orderDate", "documentDate", "deliveryDate",
  // ... rest bleibt gleich
] as const
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes (no new type errors)
- [x] `pnpm vitest run src/trpc/routers/__tests__/billingDocuments-router.test.ts` passes
- [x] `pnpm vitest run src/lib/services/__tests__/billing-document-service.test.ts` passes

#### Manual Verification:
- [ ] DRAFT-Beleg via tRPC-Panel/Curl updaten mit `inquiryId` → Wert wird gespeichert
- [ ] Update mit `inquiryId: null` → Verknüpfung wird entfernt

---

## Phase 2: Erstellungsformular — Status-Filter für Inquiry-Dropdown

### Overview
Im Erstellungsformular das Inquiry-Dropdown so filtern, dass nur OPEN und IN_PROGRESS Vorgänge angezeigt werden. Client-Side-Filter, da max 100 Items geladen werden.

### Changes Required:

#### 1. Form: Client-Side-Filter auf Inquiry-Items
**File**: `src/components/billing/document-form.tsx`
**Changes**: `inquiryData.items` vor dem Rendern filtern

```typescript
// After line 58 (inquiryData query), add filtered list:
const activeInquiries = React.useMemo(
  () => (inquiryData?.items ?? []).filter(
    (inq) => inq.status === 'OPEN' || inq.status === 'IN_PROGRESS'
  ),
  [inquiryData]
)
```

Dann in der JSX (Lines 143–160) `inquiryData.items` durch `activeInquiries` ersetzen:

```tsx
// Line 143: Bedingung ändern
{addressId && activeInquiries.length > 0 && (
  <div className="space-y-2">
    <Label htmlFor="inquiryId">Vorgang</Label>   {/* Label: "Anfrage" → "Vorgang" */}
    <Select value={inquiryId} onValueChange={setInquiryId}>
      <SelectTrigger id="inquiryId">
        <SelectValue placeholder="Vorgang wählen (optional)..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Kein Vorgang</SelectItem>
        {activeInquiries.map((inq) => (
          <SelectItem key={inq.id} value={inq.id}>
            {inq.number} — {inq.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

### Success Criteria:

#### Automated Verification:
- [x] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Form zeigt nur OPEN/IN_PROGRESS Inquiries im Dropdown
- [ ] CLOSED/CANCELLED Inquiries werden nicht angezeigt
- [ ] Label sagt "Vorgang" statt "Anfrage"
- [ ] Placeholder sagt "Vorgang wählen (optional)..."
- [ ] "Kein Vorgang" Option funktioniert weiterhin

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 3: Editor — Vorgang nachträglich zuordnen (DRAFT)

### Overview
Im DocumentEditor-Sidebar einen Vorgang-Select hinzufügen, der nur bei DRAFT-Belegen editierbar ist. Nutzt den gleichen `useCrmInquiries`-Hook wie das Erstellungsformular.

### Changes Required:

#### 1. Editor: Inquiry-Select in Sidebar
**File**: `src/components/billing/document-editor.tsx`
**Changes**:
- Import `useCrmInquiries` Hook hinzufügen
- Im Metadaten-Card den read-only Inquiry-Text durch ein editierbares Select ersetzen (nur für DRAFT)

```typescript
// Imports — add:
import { useCrmInquiries } from '@/hooks'
```

```typescript
// Inside DocumentEditor component, after existing hooks (around line 147):
const { data: inquiryData } = useCrmInquiries({
  addressId: doc?.addressId ?? undefined,
  pageSize: 100,
  enabled: isDraft && !!doc?.addressId,
})

const activeInquiries = React.useMemo(
  () => (inquiryData?.items ?? []).filter(
    (inq) => inq.status === 'OPEN' || inq.status === 'IN_PROGRESS'
  ),
  [inquiryData]
)
```

Im Metadaten-Card (Lines 530–557) den Inquiry-Bereich ersetzen:

```tsx
{/* Vorgang — editable for DRAFT, read-only otherwise */}
{isDraft && activeInquiries.length > 0 ? (
  <div className="space-y-0.5">
    <Label className="text-xs text-muted-foreground">Vorgang</Label>
    <Select
      value={inquiry?.id ?? 'none'}
      onValueChange={(v) => handleSidebarField('inquiryId', v === 'none' ? null : v)}
    >
      <SelectTrigger className="h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Kein Vorgang</SelectItem>
        {activeInquiries.map((inq) => (
          <SelectItem key={inq.id} value={inq.id}>
            {inq.number} — {inq.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
) : inquiry ? (
  <div className="flex justify-between">
    <span className="text-muted-foreground text-xs">Vorgang</span>
    <span className="text-xs">{inquiry.number} — {inquiry.title}</span>
  </div>
) : null}
```

Die bestehende read-only Zeile (Lines 544–549) wird durch obigen Code ersetzt.

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm typecheck` passes

#### Manual Verification:
- [ ] DRAFT-Beleg: Vorgang-Select in Sidebar sichtbar, änderbar
- [ ] DRAFT-Beleg: "Kein Vorgang" Option entfernt Verknüpfung
- [ ] DRAFT-Beleg: Vorgang wählen → Seite refreshen → Vorgang korrekt angezeigt
- [ ] PRINTED-Beleg: Vorgang wird read-only als Text angezeigt
- [ ] Beleg ohne Inquiry: kein Select/Text sichtbar bei PRINTED, Select verfügbar bei DRAFT

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 4: Belegliste — Vorgang-Filter-Dropdown

### Overview
Einen "Vorgang"-Filter-Dropdown zur Belegliste hinzufügen. Zeigt alle CrmInquiries die mindestens einen Beleg haben. Analog zum bestehenden Kunden-Filter-Pattern.

### Changes Required:

#### 1. Document List: Vorgang-Filter hinzufügen
**File**: `src/components/billing/document-list.tsx`
**Changes**:
- Import `useCrmInquiries` hinzufügen
- State für `inquiryFilter` hinzufügen
- Inquiries laden und als Dropdown rendern
- Filter an `useBillingDocuments` durchreichen

```typescript
// Imports — add:
import { useCrmInquiries } from '@/hooks'
```

```typescript
// State — add after customerFilter (line 48):
const [inquiryFilter, setInquiryFilter] = React.useState<string>('all')
```

```typescript
// Load inquiries for filter dropdown (after allDocsData query, ~line 52):
const { data: inquiriesData } = useCrmInquiries({ pageSize: 100 })

// Extract inquiries that have at least one document:
const inquiriesWithDocs = React.useMemo(() => {
  const items = allDocsData?.items ?? []
  const inquiryIds = new Set<string>()
  for (const doc of items) {
    const inqId = (doc as Record<string, unknown>).inquiryId as string | null
    if (inqId) inquiryIds.add(inqId)
  }
  return (inquiriesData?.items ?? []).filter((inq) => inquiryIds.has(inq.id))
}, [allDocsData, inquiriesData])
```

```typescript
// Pass filter to query (line 69-77) — add inquiryId:
const { data, isLoading } = useBillingDocuments({
  // ... existing filters
  inquiryId: inquiryId ?? (inquiryFilter !== 'all' ? inquiryFilter : undefined),
  // ...
})
```

```tsx
{/* Filter dropdown — add after customer filter (after line 142): */}
{!inquiryId && (
  <Select value={inquiryFilter} onValueChange={(v) => { setInquiryFilter(v); setPage(1) }}>
    <SelectTrigger className="w-52">
      <SelectValue placeholder="Alle Vorgänge" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">Alle Vorgänge</SelectItem>
      {inquiriesWithDocs.map((inq) => (
        <SelectItem key={inq.id} value={inq.id}>
          {inq.number} — {inq.title}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)}
```

Hinweis: Der Vorgang-Filter wird nur angezeigt wenn kein `inquiryId`-Prop von außen kommt (analog zum Kunden-Filter bei `addressId`).

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Belegliste zeigt "Alle Vorgänge" Dropdown
- [ ] Dropdown zeigt nur Vorgänge die Belege haben
- [ ] Filter auswählen → nur Belege dieses Vorgangs angezeigt
- [ ] "Alle Vorgänge" → Filter zurückgesetzt
- [ ] Wenn Component mit `inquiryId`-Prop genutzt wird (Inquiry-Detail): Filter-Dropdown nicht sichtbar

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Phase 5: Inquiry-Detail — Belege-Tab vervollständigen

### Overview
Die bestehende `InquiryDocumentsList` in `inquiry-detail.tsx` um eine Betrag-Spalte und eine Gesamtsummen-Zeile erweitern. Bestehende Badge-Components statt inline Badges nutzen.

### Changes Required:

#### 1. InquiryDocumentsList erweitern
**File**: `src/components/crm/inquiry-detail.tsx`
**Changes**: Betrag-Spalte, Gesamtsumme, und bestehende Badge-Components verwenden

```typescript
// Imports — add (at top of file):
import { DocumentTypeBadge } from '@/components/billing/document-type-badge'
import { DocumentStatusBadge } from '@/components/billing/document-status-badge'
```

Die `InquiryDocumentsList` Funktion (Lines 362–436) ersetzen:

```tsx
function InquiryDocumentsList({ inquiryId }: { inquiryId: string }) {
  const router = useRouter()
  const { data, isLoading } = useBillingDocuments({ inquiryId, pageSize: 100 })

  if (isLoading) {
    return <Skeleton className="h-24 w-full" />
  }

  const items = data?.items ?? []

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Keine Belege mit diesem Vorgang verknüpft.
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)

  const formatDate = (date: string | Date) =>
    new Intl.DateTimeFormat('de-DE').format(new Date(date))

  // Sum only PRINTED/FORWARDED/PARTIALLY_FORWARDED (no DRAFTs, no CANCELLED)
  const countableStatuses = new Set(['PRINTED', 'PARTIALLY_FORWARDED', 'FORWARDED'])
  const totalGross = items
    .filter((doc) => countableStatuses.has(doc.status))
    .reduce((sum, doc) => sum + doc.totalGross, 0)

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="px-4 py-2 font-medium">Nummer</th>
              <th className="px-4 py-2 font-medium">Typ</th>
              <th className="px-4 py-2 font-medium">Datum</th>
              <th className="px-4 py-2 font-medium text-right">Betrag</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((doc) => (
              <tr
                key={doc.id}
                className="border-b cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/orders/documents/${doc.id}`)}
              >
                <td className="px-4 py-2 font-mono">{doc.number}</td>
                <td className="px-4 py-2">
                  <DocumentTypeBadge type={doc.type} />
                </td>
                <td className="px-4 py-2">{formatDate(doc.documentDate)}</td>
                <td className="px-4 py-2 text-right">{formatCurrency(doc.totalGross)}</td>
                <td className="px-4 py-2">
                  <DocumentStatusBadge status={doc.status} />
                </td>
              </tr>
            ))}
          </tbody>
          {totalGross > 0 && (
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="px-4 py-2" colSpan={3}>Gesamt (abgeschlossen)</td>
                <td className="px-4 py-2 text-right">{formatCurrency(totalGross)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </CardContent>
    </Card>
  )
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `pnpm typecheck` passes

#### Manual Verification:
- [ ] Inquiry-Detail → Tab "Belege" zeigt Tabelle mit Spalten: Nummer, Typ, Datum, Betrag, Status
- [ ] Betrag-Spalte zeigt Euro-formatierte Werte
- [ ] Gesamtsumme wird nur aus PRINTED/FORWARDED/PARTIALLY_FORWARDED berechnet (keine DRAFTs)
- [ ] Gesamtsummen-Zeile wird nur angezeigt wenn > 0
- [ ] Badges nutzen DocumentTypeBadge und DocumentStatusBadge Components
- [ ] Klick auf Zeile navigiert zum Beleg-Detail

---

## Testing Strategy

### Unit Tests:
- Bestehende Tests in `billingDocuments-router.test.ts` und `billing-document-service.test.ts` sollten weiterhin passen
- Kein neuer Unit-Test nötig — `inquiryId` im Update ist analog zu allen anderen nullable optional Feldern

### E2E Tests:
- Bestehender `30-billing-documents.spec.ts` Test sollte weiterhin passen
- Optionaler neuer Test: Beleg erstellen mit Vorgang, Vorgang im Editor ändern

### Manual Testing Steps:
1. Neuen Beleg erstellen → Vorgang-Dropdown zeigt nur OPEN/IN_PROGRESS Inquiries
2. Vorgang auswählen → Beleg speichern → Editor zeigt Vorgang in Sidebar
3. Im Editor: Vorgang ändern → Seite refreshen → neuer Vorgang sichtbar
4. Im Editor: "Kein Vorgang" wählen → Verknüpfung entfernt
5. Belegliste: Vorgang-Filter zeigt Dropdown mit relevanten Vorgängen
6. Inquiry-Detail: Belege-Tab zeigt alle Belege mit Betrag und Gesamtsumme

## Performance Considerations

- Inquiry-Dropdown im Form/Editor lädt max 100 Inquiries pro Adresse — kein Performance-Problem
- Vorgang-Filter in Belegliste: extrahiert Inquiry-IDs aus bereits geladenen 200 Docs — kein Extra-Query
- Belege-Tab in Inquiry-Detail: `pageSize: 100` — für Vorgänge mit > 100 Belegen wäre Pagination nötig (unwahrscheinlich in der Praxis)

## References

- Research: `thoughts/shared/research/2026-03-19-billing-vorgang.md`
- Schema: `prisma/schema.prisma:510–544` (CrmInquiry)
- Schema: `prisma/schema.prisma:621–700` (BillingDocument, Feld inquiryId)
- Router: `src/trpc/routers/billing/documents.ts:72–93` (updateInput — zu ändern)
- Service: `src/lib/services/billing-document-service.ts:271–323` (update() — zu ändern)
- Repository: `src/lib/services/billing-document-repository.ts:5–60` (findMany — bereits fertig)
- Form: `src/components/billing/document-form.tsx`
- Editor: `src/components/billing/document-editor.tsx`
- List: `src/components/billing/document-list.tsx`
- Inquiry Detail: `src/components/crm/inquiry-detail.tsx:362–436` (InquiryDocumentsList)
- Hook: `src/hooks/use-crm-inquiries.ts`
- Hook: `src/hooks/use-billing-documents.ts`
