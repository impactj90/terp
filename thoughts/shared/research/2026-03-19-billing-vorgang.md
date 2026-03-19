---
date: 2026-03-19T21:06:53+01:00
researcher: Claude
git_commit: 894c1755
branch: staging
repository: terp
topic: "Vorgang/Hauptauftrag Feature für Billing — Ist-Analyse"
tags: [research, billing, vorgang, crm-inquiry, document-chain, billing-document]
status: complete
last_updated: 2026-03-19
last_updated_by: Claude
---

# Research: Vorgang/Hauptauftrag Feature für Billing

**Date**: 2026-03-19T21:06:53+01:00
**Git Commit**: 894c1755
**Branch**: staging
**Repository**: terp

## Research Question

Kundenfeedback Pro-Di: Beim Erstellen einer Anfrage soll der User einen übergeordneten "Vorgang" (Hauptauftrag) auswählen können. Dokumentation des Ist-Zustands: BillingDocument Model, Erstellungsflow, Kunden-Dropdown, vorhandene Gruppierungskonzepte.

## Summary

Das `BillingDocument` Model hat 7 Belegtypen (OFFER → CREDIT_NOTE), 5 Status-Stufen, und wird über ein Full-Page-Form (`document-form.tsx`) erstellt. Es existiert bereits ein `CrmInquiry` Model (annotiert als "Inquiry / Vorgang"), das als übergeordnete Klammer für Kundenaktivitäten dient — BillingDocuments, ServiceCases, Tasks und Correspondences können optional darauf verweisen. Zusätzlich gibt es eine Belegkette via `parentDocumentId` (self-referential). Ein "Hauptauftrag"-Konzept existiert **nicht** in der Codebase.

---

## 1. BillingDocument Model — Alle Felder

**Datei**: `prisma/schema.prisma:621–700`

### Enums

**BillingDocumentType** (schema:409–419):
| Wert | Bedeutung |
|---|---|
| `OFFER` | Angebot |
| `ORDER_CONFIRMATION` | Auftragsbestätigung |
| `DELIVERY_NOTE` | Lieferschein |
| `SERVICE_NOTE` | Leistungsnachweis |
| `RETURN_DELIVERY` | Rücklieferschein |
| `INVOICE` | Rechnung |
| `CREDIT_NOTE` | Gutschrift |

> **Wichtig**: Es gibt keinen `INQUIRY`-Typ. Trotz der deutschen Bezeichnung "Anfrage" im UI ist der erste Belegtyp `OFFER`.

**BillingDocumentStatus** (schema:421–429):
| Wert | Bedeutung |
|---|---|
| `DRAFT` | Entwurf (Default) |
| `PRINTED` | Gedruckt |
| `PARTIALLY_FORWARDED` | Teilweise weitergeleitet |
| `FORWARDED` | Weitergeleitet |
| `CANCELLED` | Storniert |

### Felder

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `id` | UUID | PK | Auto-generiert |
| `tenantId` | UUID | Ja | FK → Tenant |
| `number` | VarChar(50) | Ja | Auto-generiert (z.B. "A-1") |
| `type` | BillingDocumentType | Ja | Belegtyp |
| `status` | BillingDocumentStatus | Ja | Default: DRAFT |
| **Kunden/Adressen** | | | |
| `addressId` | UUID | Ja | FK → CrmAddress (Hauptadresse) |
| `contactId` | UUID? | Nein | FK → CrmContact |
| `deliveryAddressId` | UUID? | Nein | FK → CrmAddress (Lieferadresse) |
| `invoiceAddressId` | UUID? | Nein | FK → CrmAddress (Rechnungsadresse) |
| **Verknüpfungen** | | | |
| `inquiryId` | UUID? | Nein | FK → CrmInquiry (Vorgang) |
| `orderId` | UUID? | Nein | FK → Order (Zeiterfassungs-Auftrag) |
| `parentDocumentId` | UUID? | Nein | FK → BillingDocument (Belegkette) |
| **Datumsfelder** | | | |
| `orderDate` | Timestamptz? | Nein | Bestelldatum |
| `documentDate` | Timestamptz | Ja | Default: now() |
| `deliveryDate` | Timestamptz? | Nein | Lieferdatum |
| **Konditionen** | | | |
| `deliveryType` | String? | Nein | Lieferart |
| `deliveryTerms` | String? | Nein | Lieferbedingungen |
| `paymentTermDays` | Int? | Nein | Zahlungsziel (Tage) |
| `discountPercent` | Float? | Nein | Skonto 1 (%) |
| `discountDays` | Int? | Nein | Skonto 1 (Tage) |
| `discountPercent2` | Float? | Nein | Skonto 2 (%) |
| `discountDays2` | Int? | Nein | Skonto 2 (Tage) |
| `shippingCostNet` | Float? | Nein | Versandkosten netto |
| `shippingCostVatRate` | Float? | Nein | Versandkosten MwSt-Satz |
| **Summen (berechnet)** | | | |
| `subtotalNet` | Float | Ja | Default: 0 |
| `totalVat` | Float | Ja | Default: 0 |
| `totalGross` | Float | Ja | Default: 0 |
| **Texte** | | | |
| `notes` | String? | Nein | Externe Bemerkungen |
| `internalNotes` | String? | Nein | Interne Notizen |
| `headerText` | String? | Nein | Kopftext (WYSIWYG) |
| `footerText` | String? | Nein | Fußtext (WYSIWYG) |
| `pdfUrl` | String? | Nein | PDF-Speicherort |
| **Druck** | | | |
| `printedAt` | Timestamptz? | Nein | Zeitpunkt Druck |
| `printedById` | UUID? | Nein | Wer hat gedruckt |
| **Audit** | | | |
| `createdAt` | Timestamptz | Ja | Default: now() |
| `updatedAt` | Timestamptz | Ja | Auto-Update |
| `createdById` | UUID? | Nein | Ersteller |

### Relationen

| Relation | Typ | Beschreibung |
|---|---|---|
| `address` | CrmAddress | Hauptkunde (required) |
| `contact` | CrmContact? | Ansprechpartner |
| `deliveryAddress` | CrmAddress? | Lieferadresse |
| `invoiceAddress` | CrmAddress? | Rechnungsadresse |
| `inquiry` | CrmInquiry? | Verknüpfter Vorgang |
| `order` | Order? | Verknüpfter Zeiterfassungs-Auftrag |
| `parentDocument` | BillingDocument? | Übergeordneter Beleg (Kette) |
| `childDocuments` | BillingDocument[] | Nachfolge-Belege (Kette) |
| `positions` | BillingDocumentPosition[] | Positionen |
| `billingServiceCases` | BillingServiceCase[] | Kundendienstfälle |
| `payments` | BillingPayment[] | Zahlungen |

### Indizes

- `@@unique([tenantId, number])` — Belegnummer eindeutig pro Mandant
- `@@index([tenantId, type])`, `[tenantId, status]`, `[tenantId, addressId]`, `[tenantId, inquiryId]`, `[tenantId, parentDocumentId]`, `[tenantId, documentDate]`

---

## 2. Erstellungsflow eines neuen Belegdokuments

### Einstieg

1. User klickt "Neuer Beleg" in `BillingDocumentList` (`src/components/billing/document-list.tsx:84`)
2. `router.push('/orders/documents/new')`
3. Next.js rendert Page (`src/app/[locale]/(dashboard)/orders/documents/new/page.tsx`)
4. Page rendert `BillingDocumentForm` (`src/components/billing/document-form.tsx`)

### Frontend Form

**Datei**: `src/components/billing/document-form.tsx`

Full-Page-Form (kein Dialog/Sheet), drei Card-Bereiche:

**Card 1 — Kopfdaten (Lines 106–162):**
- `Belegtyp` — `<Select>`, Default `OFFER` (oder `?type=` Query-Param)
- `Kundenadresse *` — `<Select>`, required, populiert durch `useCrmAddresses({ pageSize: 100 })`
- `Anfrage` — `<Select>`, nur sichtbar wenn `addressId` gesetzt UND Inquiries vorhanden

**Card 2 — Konditionen (Lines 165–248):**
- Zahlungsziel (Tage), Skonto 1 %, Skonto 1 Tage, Skonto 2 %, Skonto 2 Tage, Lieferart, Lieferbedingungen

**Card 3 — Bemerkungen (Lines 251–277):**
- Externe Bemerkungen, Interne Notizen

### Hook

**Datei**: `src/hooks/use-billing-documents.ts:50–61`

```ts
export function useCreateBillingDocument() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.billing.documents.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.billing.documents.list.queryKey(),
      })
    },
  })
}
```

### tRPC Router

**Datei**: `src/trpc/routers/billing/documents.ts`

- Middleware: `billingProcedure` (= `requireModule("billing")`) + `requirePermission(BILLING_CREATE)`
- Input-Schema (`createInput`, Lines 46–70): `type` (required), `addressId` (required), alle anderen Felder optional
- Handler ruft direkt `billingDocService.create(prisma, tenantId, input, userId)` auf

### Service Layer

**Datei**: `src/lib/services/billing-document-service.ts:153–269`

Ablauf in `create()`:
1. **Adressvalidierung** (183–189): `crmAddress.findFirst({ id, tenantId })` — wirft Error wenn nicht gefunden
2. **Kontaktvalidierung** (191–199): Wenn `contactId` gesetzt, prüft Zugehörigkeit zur Adresse
3. **Liefer-/Rechnungsadress-Validierung** (201–219): Optional, jeweils gegen `tenantId` geprüft
4. **Nummergenerierung** (221–223): `numberSeqService.getNextNumber(prisma, tenantId, seqKey)` — z.B. `"A-1"` für OFFER
5. **Zahlungsbedingungen-Fallback** (225–228): Input → Address-Defaults → null
6. **Template-Auto-Apply** (230–239): Wenn kein headerText/footerText im Input, wird Default-Template geladen
7. **Repository-Aufruf** (241–268): `repo.create(prisma, data)` — alle aufgelösten Werte

### Nummerngenerierung

**Datei**: `src/lib/services/number-sequence-service.ts:45–58`

Atomisches `upsert` auf `NumberSequence`-Tabelle. Präfixe pro Typ:
- OFFER → `"A-"` (A-1, A-2, ...)
- ORDER_CONFIRMATION → `"AB-"`
- DELIVERY_NOTE → `"LS-"`
- SERVICE_NOTE → `"LN-"`
- RETURN_DELIVERY → `"RL-"`
- INVOICE → `"RE-"`
- CREDIT_NOTE → `"GS-"`

### Repository

**Datei**: `src/lib/services/billing-document-repository.ts:83–123`

Einfacher `prisma.billingDocument.create({ data, include: { address, contact, positions } })`. Status ist immer `DRAFT` (Prisma-Default).

### Vollständiger Datenfluss

```
BillingDocumentList → "Neuer Beleg" → router.push('/orders/documents/new')
  → BillingDocumentForm (document-form.tsx)
  → handleSubmit() → useCreateBillingDocument().mutateAsync(input)
  → tRPC POST billing.documents.create
    → requireModule("billing") + requirePermission(BILLING_CREATE)
    → billingDocService.create(prisma, tenantId, input, userId)
      → Adress-Validierung
      → Nummergenerierung (z.B. "A-1")
      → Payment-Terms-Fallback von Adresse
      → Template-Auto-Apply
      → repo.create(prisma, resolvedData)
    ← { id, number, status: DRAFT, ... }
  → invalidateQueries billing.documents.list
  → router.push(`/orders/documents/${id}`)
  → DocumentEditor rendert den neuen DRAFT-Beleg
```

---

## 3. Kunden/Adress-Dropdown Implementierung

### Übersicht

Drei Billing-Formulare nutzen den Adress-Dropdown. Alle laden bis zu 100 Adressen ohne Filter.

### Component: Address Select

**document-form.tsx** (Lines 127–141):
- shadcn `<Select>` mit `onValueChange` → setzt `addressId`, resettet `inquiryId`
- Display: `{addr.company} ({addr.number})`
- Kein Contact-Dropdown in diesem Form

**service-case-form-sheet.tsx** (Lines 185–204):
- `<Select>`, disabled bei `isEdit`
- `onValueChange` resettet `contactId`
- Hat zusätzlich ein Contact-Dropdown (Lines 208–224), conditional auf `selectedAddressId`

**recurring-form.tsx** (Lines 179–189):
- `<Select>` wie document-form
- `contactId` State existiert, aber kein Contact-Dropdown gerendert

### Hook: useCrmAddresses

**Datei**: `src/hooks/use-crm-addresses.ts:15–30`

```ts
useCrmAddresses(options?: { search?, type?, isActive?, page?, pageSize? })
```

- Aufruf in allen Billing-Forms: `useCrmAddresses({ pageSize: 100 })`
- Intern: `trpc.crm.addresses.list.queryOptions(...)`

### Hook: useCrmContacts (dependent loading)

**Datei**: `src/hooks/use-crm-addresses.ts:99–107`

- `useCrmContacts(addressId, enabled)` — Query feuert nur wenn `addressId` truthy
- Nur in `service-case-form-sheet.tsx` genutzt (Line 77)

### tRPC Query: crm.addresses.list

**Datei**: `src/trpc/routers/crm/addresses.ts:22–41`

- Middleware: `crmProcedure` + `requirePermission(CRM_VIEW)`
- Input: `search?`, `type?` (CUSTOMER/SUPPLIER/BOTH), `isActive?` (Default true), `page` (Default 1), `pageSize` (Default 25, Max 100)

### Repository: findMany

**Datei**: `src/lib/services/crm-address-repository.ts:5–55`

- Filter: `tenantId` (immer), `isActive`, `type` (CUSTOMER → `{ in: ["CUSTOMER", "BOTH"] }`)
- Suche: case-insensitive `contains` auf `company`, `number`, `matchCode`, `city`
- Sortierung: `orderBy: { company: "asc" }`
- Pagination: `skip`/`take`
- Kein `include` — keine Relations eagerly geladen
- Rückgabe: `{ items: CrmAddress[], total: number }`

### CrmAddress Model

**Datei**: `prisma/schema.prisma:272–317`

Relevante Felder für Dropdown:
- `id`, `number` (z.B. "K-1"), `company` (Firmenname), `type` (CUSTOMER/SUPPLIER/BOTH)
- `street`, `zip`, `city`, `country` (Default "DE")
- `paymentTermDays`, `discountPercent`, `discountDays` — Zahlungsbedingungen (Fallback bei Belegerstellung)
- `priceListId` → FK zu BillingPriceList

### Contact Loading (nur ServiceCase)

```
[User wählt Adresse] → setAddressId(v)
                     → resetContactId('')
                     → useCrmContacts(newAddressId, true)
                       → trpc.crm.addresses.contactsList({ addressId })
                       → prisma.crmContact.findMany({
                           where: { tenantId, addressId },
                           orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }]
                         })
                     → <Select> mit contacts.map(c => `${c.firstName} ${c.lastName}`)
```

---

## 4. Vorhandene Gruppierungskonzepte

### 4a. CrmInquiry — Das existierende "Vorgang"-Konzept

**Datei**: `prisma/schema.prisma:510–544`

Annotiert als: `// Inquiry / Vorgang — the overarching bracket for customer activities.`

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | UUID | PK |
| `tenantId` | UUID | FK → Tenant |
| `number` | VarChar(50) | Auto-generiert (z.B. "V-1") |
| `title` | VarChar(255) | Vorgangsbezeichnung |
| `addressId` | UUID | FK → CrmAddress (required) |
| `contactId` | UUID? | FK → CrmContact |
| `status` | CrmInquiryStatus | OPEN / IN_PROGRESS / CLOSED / CANCELLED |
| `effort` | String? | Aufwand (frei, z.B. low/medium/high) |
| `creditRating` | String? | Bonität |
| `notes` | String? | |
| `orderId` | UUID? | FK → Order (Zeiterfassungs-Auftrag) |
| `closedAt`, `closedById`, `closingReason`, `closingRemarks` | | Abschluss-Felder |

**Relationen von CrmInquiry:**
- `correspondences → CrmCorrespondence[]` — CRM-Korrespondenz
- `tasks → CrmTask[]` — CRM-Aufgaben
- `billingDocuments → BillingDocument[]` — Belege (via `BillingDocument.inquiryId`)
- `billingServiceCases → BillingServiceCase[]` — Kundendienstfälle
- `order → Order?` — Zeiterfassungs-Auftrag

**Kein Parent/Group-Konzept innerhalb CrmInquiry**: Keine Felder wie `parentId`, `groupId`, oder self-referential Relations. CrmInquiry ist flach — keine Hierarchie von Vorgängen.

### 4b. parentDocumentId — Die Belegkette (DocumentChain)

**Datei**: `prisma/schema.prisma:637, 686–687`

Self-referential Relation `"DocumentChain"`:
- `parentDocument → BillingDocument?` (Woher kommt der Beleg)
- `childDocuments → BillingDocument[]` (Nachfolge-Belege)

**Wie es gesetzt wird** (`billing-document-service.ts:449`):
- Bei `forward()`: neuer Beleg bekommt `parentDocumentId: existing.id`
- Bei `duplicate()`: explizit `parentDocumentId: null` (unabhängig)

**Weiterleitungs-Regeln** (`billing-document-service.ts:43–50`):
```
OFFER → ORDER_CONFIRMATION
ORDER_CONFIRMATION → DELIVERY_NOTE | SERVICE_NOTE
DELIVERY_NOTE → INVOICE
SERVICE_NOTE → INVOICE
RETURN_DELIVERY → CREDIT_NOTE
INVOICE → [] (Ende)
CREDIT_NOTE → [] (Ende)
```

**Frontend** (`document-detail.tsx:261–296`, `document-editor.tsx:489–526`):
- "Kette"-Tab zeigt `parentDocument` als "Erstellt aus:" und `childDocuments` als "Folgebelege:"

### 4c. Order — Zeiterfassungs-Auftrag (kein Billing-Grouping)

**Datei**: `prisma/schema.prisma:1722–1754`

Das `Order` Model ist ein Zeiterfassungs-Container, kein Billing-Gruppierungskonzept:
- `code`, `name`, `description`, `status`, `customer` (Freitext), `billingRatePerHour`
- Wird bei `finalize()` eines ORDER_CONFIRMATION automatisch erstellt
- Relationen: `assignments`, `orderBookings`, `crmInquiries`, `billingDocuments`, `billingServiceCases`

### 4d. BillingRecurringInvoice — Template, kein Grouping

**Datei**: `prisma/schema.prisma:941–980`

Template für wiederkehrende Rechnungen. Hat **keine** Relation zu CrmInquiry, kein `parentDocumentId`, kein `orderId`. Generierte Belege referenzieren nicht zurück auf das Template.

### 4e. Was NICHT existiert

Vollständige Suche im gesamten Codebase ergibt **null Treffer** für:
- `hauptauftrag` / `Hauptauftrag`
- `projectId` / `project_id` (im Billing-Kontext)
- `vorgangId` / `vorgang_id`
- `caseId` (im Billing-Kontext)

Es gibt keine hierarchische Gruppierung über CrmInquiry hinaus.

### Zusammenfassung: Gruppierungsfelder

| Feld | Model | FK → | Zweck |
|---|---|---|---|
| `inquiryId` | BillingDocument | CrmInquiry | Verknüpfung zum Vorgang |
| `inquiryId` | BillingServiceCase | CrmInquiry | Verknüpfung zum Vorgang |
| `inquiryId` | CrmTask | CrmInquiry | Verknüpfung zum Vorgang |
| `inquiryId` | CrmCorrespondence | CrmInquiry | Verknüpfung zum Vorgang |
| `parentDocumentId` | BillingDocument | BillingDocument (self) | Belegkette |
| `orderId` | BillingDocument | Order | Zeiterfassungs-Auftrag |
| `orderId` | CrmInquiry | Order | Zeiterfassungs-Auftrag |
| `orderId` | BillingServiceCase | Order | Zeiterfassungs-Auftrag |
| `invoiceDocumentId` | BillingServiceCase | BillingDocument | Zugehörige Rechnung |

---

## 5. Wo ein neues BillingVorgang Model ins Schema passen würde

### Aktueller Zustand im Schema

Die Billing-Models im Schema sind zusammenhängend gruppiert (Lines 409–980):
1. Enums (409–465)
2. `BillingDocument` (621–700)
3. `BillingDocumentPosition` (709–733)
4. `BillingDocumentTemplate` (742–759)
5. `BillingTenantConfig` (768–790)
6. `BillingServiceCase` (799–834)
7. `BillingPayment` (859–881)
8. `BillingPriceList` (887–939)
9. `BillingRecurringInvoice` (941–980)

`CrmInquiry` steht separat im CRM-Block (510–544).

Ein neues `BillingVorgang`-Model würde thematisch zwischen `BillingTenantConfig` (790) und `BillingServiceCase` (799) oder nach `BillingRecurringInvoice` (980) passen — dort ist der Billing-Bereich im Schema gruppiert. Es würde einen neuen `billingVorgangId`-FK auf `BillingDocument` erfordern, analog zu `inquiryId`.

Das existierende `CrmInquiry`-Model (bereits als "Vorgang" annotiert) mit seiner `inquiryId`-Relation auf BillingDocument ist die nächstliegende vorhandene Struktur.

---

## Code References

- `prisma/schema.prisma:409–465` — Billing Enums
- `prisma/schema.prisma:510–544` — CrmInquiry Model
- `prisma/schema.prisma:621–700` — BillingDocument Model
- `prisma/schema.prisma:709–733` — BillingDocumentPosition Model
- `prisma/schema.prisma:799–834` — BillingServiceCase Model
- `prisma/schema.prisma:941–980` — BillingRecurringInvoice Model
- `prisma/schema.prisma:1722–1754` — Order Model
- `src/components/billing/document-form.tsx` — Erstellungsformular
- `src/components/billing/document-list.tsx:84` — "Neuer Beleg" Button
- `src/components/billing/document-detail.tsx:261–296` — Belegkette UI
- `src/components/billing/document-editor.tsx:489–526` — Belegkette Sidebar
- `src/components/billing/service-case-form-sheet.tsx:185–224` — Adress+Contact Dropdown
- `src/components/billing/recurring-form.tsx:179–189` — Adress-Dropdown
- `src/hooks/use-billing-documents.ts:50–61` — useCreateBillingDocument Hook
- `src/hooks/use-crm-addresses.ts:15–30` — useCrmAddresses Hook
- `src/hooks/use-crm-addresses.ts:99–107` — useCrmContacts Hook
- `src/trpc/routers/billing/documents.ts:46–70` — createInput Schema
- `src/trpc/routers/billing/documents.ts:176–190` — create Mutation
- `src/trpc/routers/crm/addresses.ts:22–41` — addresses.list Query
- `src/lib/services/billing-document-service.ts:153–269` — create() Business Logic
- `src/lib/services/billing-document-service.ts:409–502` — forward() + Belegkette
- `src/lib/services/billing-document-repository.ts:83–123` — create() Prisma Query
- `src/lib/services/number-sequence-service.ts:45–58` — Nummergenerierung

## Open Questions

1. Soll das neue "Vorgang"-Konzept das bestehende `CrmInquiry` erweitern oder ein eigenständiges `BillingVorgang`-Model werden?
2. Wie soll die Nummernvergabe für Vorgänge funktionieren — eigener Nummernkreis oder CrmInquiry-Nummern (`V-1`, `V-2`, ...)?
3. Sollen bestehende Belege nachträglich einem Vorgang zugeordnet werden können (Edit), oder nur bei Erstellung?
4. Soll der Vorgang mandantenübergreifend oder rein mandantenspezifisch sein?
