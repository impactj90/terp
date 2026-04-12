---
date: 2026-03-19T15:33:52+01:00
researcher: Claude
git_commit: 894c1755b22660484b37c3199648233b3065fc96
branch: staging
repository: terp
topic: "Billing Document Editor — Aktuelle Implementierung"
tags: [research, billing, document-editor, pdf, templates, positions]
status: complete
last_updated: 2026-03-19
last_updated_by: Claude
---

# Research: Billing Document Editor — Aktuelle Implementierung

## 1. Datenstruktur (Prisma Schema)

### BillingDocument (`prisma/schema.prisma:619`)

Zentrales Model für alle Belegtypen. DB-Tabelle: `billing_documents`.

**Header-Felder:**
| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | UUID | PK |
| `tenantId` | UUID | Mandant |
| `number` | VarChar(50) | Belegnummer (auto-generiert via NumberSequence) |
| `type` | Enum | OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, INVOICE, CREDIT_NOTE |
| `status` | Enum | DRAFT, PRINTED, PARTIALLY_FORWARDED, FORWARDED, CANCELLED |
| `addressId` | UUID | Kundenadresse (required) |
| `contactId` | UUID? | Ansprechpartner |
| `deliveryAddressId` | UUID? | Lieferadresse |
| `invoiceAddressId` | UUID? | Rechnungsadresse |
| `inquiryId` | UUID? | Verknüpfte Anfrage |
| `orderId` | UUID? | Verknüpfter Auftrag |
| `parentDocumentId` | UUID? | Quellbeleg (Belegkette) |

**Datum-Felder:**
| Feld | Typ |
|---|---|
| `orderDate` | DateTime? |
| `documentDate` | DateTime (default: now) |
| `deliveryDate` | DateTime? |

**Konditionen:**
| Feld | Typ |
|---|---|
| `deliveryType` | String? |
| `deliveryTerms` | String? |
| `paymentTermDays` | Int? |
| `discountPercent` | Float? |
| `discountDays` | Int? |
| `discountPercent2` | Float? |
| `discountDays2` | Int? |
| `shippingCostNet` | Float? |
| `shippingCostVatRate` | Float? |

**Summen (computed, stored):**
| Feld | Typ |
|---|---|
| `subtotalNet` | Float (default 0) |
| `totalVat` | Float (default 0) |
| `totalGross` | Float (default 0) |

**Freitext-Felder:**
| Feld | Typ | Verwendung |
|---|---|---|
| `notes` | String? | Externe Bemerkungen (kundenvisibel) |
| `internalNotes` | String? | Interne Bemerkungen |

**Druckstatus:**
| Feld | Typ |
|---|---|
| `printedAt` | DateTime? |
| `printedById` | UUID? |

**Es gibt KEINE Felder für:** Kopftext (über Positionen), Fußtext (unter Positionen), Freitextbereiche, Template-Referenzen.

### BillingDocumentPosition (`prisma/schema.prisma:702`)

Positionszeilen innerhalb eines Belegs. DB-Tabelle: `billing_document_positions`. Cascade-Delete mit Parent.

| Feld | Typ | Beschreibung |
|---|---|---|
| `id` | UUID | PK |
| `documentId` | UUID | FK → BillingDocument |
| `sortOrder` | Int | Reihenfolge |
| `type` | Enum | ARTICLE, FREE, TEXT, PAGE_BREAK, SUBTOTAL |
| `articleId` | UUID? | Artikelreferenz |
| `articleNumber` | VarChar(50)? | Artikelnummer |
| `description` | String? | Beschreibung / Freitext |
| `quantity` | Float? | Menge |
| `unit` | VarChar(20)? | Einheit |
| `unitPrice` | Float? | Einzelpreis |
| `flatCosts` | Float? | Pauschalkosten |
| `totalPrice` | Float? | Gesamtpreis (computed) |
| `priceType` | Enum? | STANDARD, ESTIMATE, BY_EFFORT |
| `vatRate` | Float? | MwSt-Satz |
| `deliveryDate` | DateTime? | Lieferdatum pro Position |
| `confirmedDate` | DateTime? | Bestätigungsdatum |

**Positionstypen (BillingPositionType):**
- `ARTICLE` — Artikelposition mit Artikelreferenz
- `FREE` — Freie Position (Default)
- `TEXT` — Nur-Text-Zeile (keine Berechnung)
- `PAGE_BREAK` — Seitenumbruch
- `SUBTOTAL` — Zwischensumme

### BillingRecurringInvoice (`prisma/schema.prisma:877`)

Template für wiederkehrende Rechnungen. DB-Tabelle: `billing_recurring_invoices`.

Enthält das einzige existierende Template-Konzept:
- `positionTemplate` — **JSONB-Feld** mit einem Array von Positionstemplates
- Kopfdaten (Adresse, Konditionen, Notizen) werden 1:1 auf generierte Rechnungen übertragen
- `notes` und `internalNotes` als Freitextfelder vorhanden

### Weitere Billing-Models

- **BillingServiceCase** (`schema.prisma:735`) — Kundendienst (OPEN → IN_PROGRESS → CLOSED → INVOICED)
- **BillingPayment** (`schema.prisma:795`) — Zahlungen gegen Rechnungen (CASH/BANK, Skonto-Support)
- **BillingPriceList** (`schema.prisma:823`) — Preislisten pro Mandant
- **BillingPriceListEntry** (`schema.prisma:849`) — Preislisteneinträge mit Mengenrabatt

### Was NICHT existiert in der DB

- Kein Template-Model für Dokumentlayouts
- Keine Felder für Kopftext/Fußtext/Freitextbereiche über/unter Positionen
- Keine Felder für Logo, Absenderadresse, Bankverbindung auf Dokumentebene
- Keine Referenz auf ein Template/Layout pro Dokument
- Tenant hat ein generisches `settings: Json?` Feld — dort könnte theoretisch etwas liegen, wird aktuell nicht für Billing genutzt

---

## 2. UI-Implementierung

### Seitenrouten (Next.js App Router)

Alle unter `src/app/[locale]/(dashboard)/orders/`:

| Route | Seite |
|---|---|
| `documents/page.tsx` | Belege-Liste |
| `documents/new/page.tsx` | Neuer Beleg |
| `documents/[id]/page.tsx` | Beleg-Detail |
| `recurring/page.tsx` | Wiederkehrende Rechnungen Liste |
| `recurring/new/page.tsx` | Neue wiederkehrende Rechnung |
| `recurring/[id]/page.tsx` | Wiederkehrende Rechnung Detail |
| `service-cases/page.tsx` | Kundendienst Liste |
| `service-cases/[id]/page.tsx` | Kundendienst Detail |
| `open-items/page.tsx` | Offene Posten Liste |
| `open-items/[documentId]/page.tsx` | Offener Posten Detail |
| `price-lists/page.tsx` | Preislisten |
| `price-lists/[id]/page.tsx` | Preisliste Detail |

Kein billing-spezifisches Layout. Alle teilen das Dashboard-Layout.

### Components (31 Dateien in `src/components/billing/`)

#### Dokument-Erstellung: `document-form.tsx`

Standalone-Formular "Neuer Beleg" mit 3 Card-Sektionen:
- **Kopfdaten**: Belegtyp-Select + Kundenadresse-Select + optionales Anfrage-Select
- **Konditionen**: Zahlungsziel, 2x Skonto (% + Tage), Lieferart, Lieferbedingungen
- **Bemerkungen**: `notes` Textarea (extern), `internalNotes` Textarea (intern)

Hooks: `useCreateBillingDocument()`, `useCrmAddresses()`, `useCrmInquiries()`
Nach Speichern: Navigation zu `/orders/documents/${result.id}`

**Keine Positionsbearbeitung** — Positionen werden erst nach Erstellung im Detail-View hinzugefügt.

#### Dokument-Detail: `document-detail.tsx`

Vollständige Detailansicht mit 3 Tabs:
- **Übersicht**: Kopfdaten-Card, Konditionen-Card, Bemerkungen-Card, `DocumentTotalsSummary`
- **Positionen**: `DocumentPositionTable` (readonly wenn nicht DRAFT) + `DocumentTotalsSummary`
- **Kette**: Quellbeleg + Folgebelege mit Typ/Status-Badges und Links

Aktionsbuttons (statusabhängig):
- "Abschließen" → `DocumentFinalizeDialog` (nur DRAFT)
- "Fortführen" → `DocumentForwardDialog` (nur PRINTED/PARTIALLY_FORWARDED)
- "Stornieren" → `ConfirmDialog` (nicht bei CANCELLED/FORWARDED)
- "Duplizieren" → immer verfügbar

Hooks: `useBillingDocumentById()`, `useCancelBillingDocument()`, `useDuplicateBillingDocument()`

#### Positionstabelle: `document-position-table.tsx`

**Props:** `documentId`, `positions`, `readonly?`, `addressId?`

shadcn `Table` mit Spalten: #, Typ, Beschreibung, Menge, Einheit, Einzelpreis, Pauschal, MwSt %, Gesamt, (Löschen-Button).

**Inline-Editing-Pattern (blur-commit):**
- Jede editierbare Zelle enthält ein `Input` mit `defaultValue`
- Änderungen werden bei `onBlur` einzeln via `useUpdateBillingPosition()` gespeichert
- Numerische Felder werden mit `parseFloat` geparst
- `totalPrice` kommt vom Server (keine Client-seitige Berechnung)

**DescriptionCombobox** (Subcomponent, Zeilen 87–174):
- `Input` + `Popover` für Preislisten-Autocomplete
- Filtert Preislisteneinträge nach `itemKey` oder `description` (case-insensitive)
- Bei Auswahl: Batch-Update von `description`, `unitPrice`, `unit`

Hooks: `useAddBillingPosition()`, `useUpdateBillingPosition()`, `useDeleteBillingPosition()`, `usePriceListEntriesForAddress()`

**Kein Drag & Drop** — nur visuelles GripVertical-Icon, keine DnD-Library verdrahtet.
`positions.reorder` Mutation existiert aber im Backend.

#### Summenblock: `document-totals-summary.tsx`

**Props:** `subtotalNet`, `totalVat`, `totalGross`

Reine Anzeige-Komponente. 3 Zeilen (Netto, MwSt, Brutto). Formatierung: `Intl.NumberFormat('de-DE', EUR)`.

#### Fortführen-Dialog: `document-forward-dialog.tsx`

Statische Fortführungsregeln:
```
OFFER             → ORDER_CONFIRMATION
ORDER_CONFIRMATION → DELIVERY_NOTE | SERVICE_NOTE
DELIVERY_NOTE     → INVOICE
SERVICE_NOTE      → INVOICE
RETURN_DELIVERY   → CREDIT_NOTE
INVOICE           → (keine)
CREDIT_NOTE       → (keine)
```

RadioGroup für Zielbelegtyp. Hook: `useForwardBillingDocument()`

#### Abschließen-Dialog: `document-print-dialog.tsx` (Export: `DocumentFinalizeDialog`)

Warnung "Beleg wird unveränderlich". Sonderfall für ORDER_CONFIRMATION: optionale Auftragserstellung (Name + Beschreibung).
Hook: `useFinalizeBillingDocument()`

#### Status/Typ-Badges

- `document-status-badge.tsx` — DRAFT=grau, PRINTED=blau, PARTIALLY_FORWARDED=gelb, FORWARDED=grün, CANCELLED=rot
- `document-type-badge.tsx` — OFFER=blau, ORDER_CONFIRMATION=indigo, DELIVERY_NOTE=grün, SERVICE_NOTE=teal, RETURN_DELIVERY=orange, INVOICE=lila, CREDIT_NOTE=pink

#### Wiederkehrende Rechnungen

- `recurring-form.tsx` — Erstellen/Bearbeiten mit eingebettetem `RecurringPositionEditor`
- `recurring-position-editor.tsx` — Controlled Component mit `PositionTemplate[]` und `onChange` Callback. Inline-Editing (onChange, nicht onBlur). Client-seitige Berechnung: `total = (quantity * unitPrice) + flatCosts`
- `recurring-detail.tsx` — Detail mit Vorschau
- `recurring-list.tsx` — Liste
- `recurring-generate-dialog.tsx` — Manuelle Generierung

#### Kundendienst

- `service-case-list.tsx`, `service-case-detail.tsx`, `service-case-form-sheet.tsx`
- `service-case-close-dialog.tsx`, `service-case-invoice-dialog.tsx`
- `service-case-status-badge.tsx`

#### Offene Posten / Zahlungen

- `open-item-list.tsx`, `open-item-detail.tsx`, `open-items-summary-card.tsx`
- `payment-form-dialog.tsx`, `payment-cancel-dialog.tsx`, `payment-status-badge.tsx`

#### Preislisten

- `price-list-list.tsx`, `price-list-detail.tsx`, `price-list-form-sheet.tsx`
- `price-list-entries-table.tsx`, `price-list-entry-form-dialog.tsx`, `price-list-bulk-import-dialog.tsx`

---

## 3. PDF-Generierung

### Aktueller Stand: STUB

**Datei:** `src/lib/services/billing-document-pdf-service.ts`

```typescript
export async function generatePdf(prisma, tenantId, documentId) {
  const doc = await billingDocService.getById(prisma, tenantId, documentId)
  // TODO: Implement actual PDF generation using @react-pdf/renderer or similar
  return {
    documentId: doc.id,
    documentNumber: doc.number,
    documentType: doc.type,
    pdfUrl: null,
    message: "PDF generation not yet implemented",
  }
}
```

- Die Funktion ist über `billing.documents.generatePdf` (Query) aufrufbar
- Es existiert **keine PDF-Library** im Projekt (kein `@react-pdf/renderer`, kein `puppeteer`, kein `jspdf`)
- Es gibt **keine PDF-Templates**, **keine React-PDF-Komponenten**, **keine HTML-to-PDF Pipeline**
- Der Code lädt lediglich das Dokument und gibt eine Stub-Response zurück

---

## 4. Template-System

### Einziges bestehendes Template-Konzept: Recurring Invoice `positionTemplate`

Das `BillingRecurringInvoice` Model speichert Positionsdaten als **JSONB-Array** im Feld `positionTemplate`. Dieses wird bei Generierung in echte `BillingDocumentPosition`-Zeilen umgewandelt.

**PositionTemplate Interface** (definiert in `recurring-position-editor.tsx`):
```typescript
interface PositionTemplate {
  type: "ARTICLE" | "FREE" | "TEXT"
  articleId?: string
  articleNumber?: string
  description?: string
  quantity?: number
  unit?: string
  unitPrice?: number
  flatCosts?: number
  vatRate?: number
}
```

### Was NICHT existiert

- Kein Dokument-Layout-Template-System (Header, Footer, Logo, Absender, etc.)
- Kein Template-Editor oder Template-Verwaltung
- Keine Template-Referenz auf BillingDocument-Ebene
- Keine Freitext-Template-Bereiche (Kopftext, Schlusstext, Fußzeile)
- Kein Mandanten-spezifisches Briefpapier-/Layout-Konzept

---

## 5. Wiederverwendbare Components

### Direkt wiederverwendbar im Dokument-Editor

| Component | Datei | Wiederverwendbar für |
|---|---|---|
| `DocumentPositionTable` | `components/billing/document-position-table.tsx` | Positionszeilen-Editor (inline editing, autocomplete) |
| `DescriptionCombobox` | Subcomponent in `document-position-table.tsx:87–174` | Preislisten-Autocomplete für Beschreibungsfeld |
| `DocumentTotalsSummary` | `components/billing/document-totals-summary.tsx` | Summenblock (Netto/MwSt/Brutto) |
| `DocumentTypeBadge` | `components/billing/document-type-badge.tsx` | Belegtyp-Anzeige |
| `DocumentStatusBadge` | `components/billing/document-status-badge.tsx` | Status-Anzeige |
| `RecurringPositionEditor` | `components/billing/recurring-position-editor.tsx` | Alternative: Controlled-Mode Positions-Editor |

### Berechnungslogik (Server-seitig)

| Funktion | Datei | Beschreibung |
|---|---|---|
| `recalculateTotals()` | `lib/services/billing-document-service.ts:63` | Summiert Positionen → subtotalNet, totalVat, totalGross |
| `calculatePositionTotal()` | `lib/services/billing-document-service.ts:107` | `round((qty * price + flat) * 100) / 100` |

**Berechnungslogik `recalculateTotals`:**
1. Alle Positionen laden
2. `subtotalNet` = Summe aller `totalPrice` (wo nicht null)
3. MwSt pro Satz gruppiert: `vatAmount = totalPrice * (vatRate / 100)`
4. `totalVat` = Summe aller MwSt-Beträge
5. `totalGross = subtotalNet + totalVat`
6. Runden auf 2 Dezimalstellen

### Preislisten-Lookup (für Autocomplete)

| Funktion/Procedure | Datei |
|---|---|
| `billing.priceLists.entriesForAddress` | `trpc/routers/billing/priceLists.ts` |
| `billing.priceLists.lookupPrice` | `trpc/routers/billing/priceLists.ts` |
| `usePriceListEntriesForAddress()` | `hooks/use-billing-price-lists.ts` |

### Hooks (alle in `src/hooks/`)

| Hook-Datei | Enthaltene Hooks |
|---|---|
| `use-billing-documents.ts` | `useBillingDocuments`, `useBillingDocumentById`, `useCreateBillingDocument`, `useUpdateBillingDocument`, `useDeleteBillingDocument`, `useFinalizeBillingDocument`, `useForwardBillingDocument`, `useCancelBillingDocument`, `useDuplicateBillingDocument`, `useBillingPositions`, `useAddBillingPosition`, `useUpdateBillingPosition`, `useDeleteBillingPosition`, `useReorderBillingPositions` |
| `use-billing-recurring.ts` | `useBillingRecurringInvoices`, `useBillingRecurringInvoice`, `useBillingRecurringInvoicePreview`, `useCreateBillingRecurringInvoice`, `useUpdateBillingRecurringInvoice`, `useDeleteBillingRecurringInvoice`, `useActivateBillingRecurringInvoice`, `useDeactivateBillingRecurringInvoice`, `useGenerateRecurringInvoice`, `useGenerateDueRecurringInvoices` |
| `use-billing-payments.ts` | Payment + Open Items Hooks |
| `use-billing-price-lists.ts` | Preislisten + Entries Hooks |
| `use-billing-service-cases.ts` | Kundendienst Hooks |

---

## 6. tRPC Router-Struktur

Alle Billing-Router unter `src/trpc/routers/billing/` mit `requireModule("billing")` Guard.

### `billing.documents` (`billing/documents.ts`)

**Queries:** `list`, `getById`, `generatePdf`
**Mutations:** `create`, `update`, `delete`, `finalize`, `forward`, `cancel`, `duplicate`
**Sub-Router `positions`:** `list`, `add`, `update`, `delete`, `reorder`

### `billing.payments` (`billing/payments.ts`)

**Sub-Router `openItems`:** `list`, `getById`, `summary`
**Direct:** `list`, `create`, `cancel`

### `billing.priceLists` (`billing/priceLists.ts`)

**Direct:** `list`, `getById`, `create`, `update`, `delete`, `setDefault`, `entriesForAddress`, `lookupPrice`
**Sub-Router `entries`:** `list`, `create`, `update`, `delete`, `bulkImport`

### `billing.recurringInvoices` (`billing/recurringInvoices.ts`)

**Queries:** `list`, `getById`, `preview`
**Mutations:** `create`, `update`, `delete`, `activate`, `deactivate`, `generate`, `generateDue`

### `billing.serviceCases` (`billing/serviceCases.ts`)

**Queries:** `list`, `getById`
**Mutations:** `create`, `update`, `close`, `createInvoice`, `createOrder`, `delete`

---

## 7. Belegkette (Document Chain)

Fortführungsregeln (statisch definiert in Service + UI):

```
OFFER → ORDER_CONFIRMATION
ORDER_CONFIRMATION → DELIVERY_NOTE | SERVICE_NOTE
DELIVERY_NOTE → INVOICE
SERVICE_NOTE → INVOICE
RETURN_DELIVERY → CREDIT_NOTE
```

- `parentDocumentId` verlinkt zum Quellbeleg
- `childDocuments` Relation zeigt Folgebelege
- Bei Fortführung: alle Header-Felder + Positionen werden kopiert, Summen neu berechnet
- Quellbeleg-Status wird auf `FORWARDED` gesetzt

---

## 8. Zusammenfassung: Lücken für das Document-Editor-Feature

Folgende Dinge existieren **NICHT** und müssten neu geschaffen werden:

**Datenstruktur:**
- Felder für Kopftext (über Positionen), Schlusstext (unter Positionen), Fußzeile
- Template/Layout-Model mit Mandanten-Zuordnung
- Felder für Logo, Absenderadresse, Bankverbindung, Geschäftsführer-Zeile etc.
- Template-Referenz auf BillingDocument

**UI:**
- Dokument-Layout-Komponente (WYSIWYG-artig)
- Freitext-Editoren (Rich Text oder Plain)
- Template-Verwaltungs-UI
- Drag & Drop für Positionen (Backend existiert via `positions.reorder`, Frontend-DnD fehlt)

**PDF:**
- Komplette PDF-Pipeline (Library, Template, Rendering)
- Alles aktuell nur Stub

**Bestehendes das erhalten bleiben kann:**
- Gesamte Positionslogik (CRUD, Typen, Inline-Editing, Autocomplete)
- Summenberechnung (Server-seitig)
- Belegkette und Workflow (Finalize, Forward, Cancel)
- Preislisten-Integration
- Alle Hooks und tRPC-Router
