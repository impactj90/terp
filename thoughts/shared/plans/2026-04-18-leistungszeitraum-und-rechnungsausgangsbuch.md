---
date: 2026-04-18
author: impactj90
git_commit: e18f63e2e1bfbac9d7c24766ef82424ddb516a33
branch: staging
repository: terp
topic: "Leistungszeitraum (§14 UStG) + Rechnungsausgangsbuch — Implementierungsplan"
tags: [plan, billing, compliance, pdf, csv, datev, permissions, e-invoice, zugferd]
status: ready
related_research: thoughts/shared/research/2026-04-18-rechnungsausgangsbuch.md
---

# Leistungszeitraum (§14 UStG) + Rechnungsausgangsbuch — Implementierungsplan

## Overview

Zwei zusammenhängende, aber unabhängig testbare Feature-Blöcke:

- **Block A — Leistungszeitraum auf `BillingDocument`**: Neue optionale Felder `servicePeriodFrom` / `servicePeriodTo`, Darstellung im UI / PDF / ZUGFeRD-XML, Warnung beim Finalisieren, Auto-Berechnung für wiederkehrende Rechnungen.
- **Block B — Rechnungsausgangsbuch**: Neuer Menüpunkt unter Fakturierung, der finalisierte Ausgangsrechnungen + Gutschriften in wählbarem Zeitraum mit USt-Aufschlüsselung als interaktive Tabelle anzeigt und als PDF- und CSV-Export für den Steuerberater bereitstellt.

Block A muss **vor** Block B abgeschlossen sein, weil das Rechnungsausgangsbuch den Leistungszeitraum als Spalte / CSV-Feld darstellt.

## Konsolidierung bestehender Tickets

Zwei bestehende Tickets berühren diesen Scope, aber **keines deckt das StB-orientierte Rechnungsausgangsbuch im hier definierten Sinn ab**:

### `thoughts/shared/tickets/ZMI-TICKET-164-rechnungslisten-dashboard.md`
- **Scope**: Finanz-Übersicht mit Rechnungslisten (alle Status), Umsatz-Übersicht (monatlich/quartal/jährlich), OPOS-Liste, Dashboard-Kennzahlen, generischer CSV/Excel-Export.
- **Konflikt**: Überschneidung im Bereich "Rechnungsliste mit Filter + Export". Der **Rechnungsausgangsbuch-Umfang dieses Plans** (finalisierte Ausgangsrechnungen + Gutschriften mit USt-Aufschlüsselung als monatlicher StB-Report) ist eine **Teilmenge** von ZMI-164, aber mit strengerem Filter (`status NOT IN ('DRAFT', 'CANCELLED')`, `type IN ('INVOICE', 'CREDIT_NOTE')`) und StB-spezifischem Fokus (USt-Aufschlüsselung, §14-UStG-kompatibler Spaltensatz, PDF-Report-Format).
- **Entscheidung**: ZMI-164 bleibt als eigenständiges P3-Ticket für das spätere **Finanz-Dashboard** (KPIs, OPOS, Umsatz-Grafiken). Dieses Plan-Dokument adressiert nur das Rechnungsausgangsbuch als StB-Report.
- **Follow-Up**: Nach Merge dieses Plans kann der Acceptance-Punkt "Rechnungsliste mit Status/Zeitraum-Filter + CSV-Export" in ZMI-164 gekürzt werden; Dashboard-KPIs und OPOS-Aging bleiben eigener Scope.

### `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_06_AUSWERTUNGEN.md`
- **Scope**: Read-only Reporting-Dashboard mit Recharts-Grafiken (Revenue by Period / Customer, Documents by Type / Status, Open-Items-Aging, Recurring-Forecast). tRPC-Router `billing.reports`.
- **Konflikt**: Keiner. ORD_06 ist ein Dashboard-Feature (Grafiken, KPIs), das Rechnungsausgangsbuch ist ein **Report-Dokument** (tabellarische Rechnungsliste mit USt-Summenblock + PDF/CSV-Export). Beide Features koexistieren und teilen keine Router/Service-Layer-Files.
- **Entscheidung**: ORD_06 bleibt unverändert. Der neue `billing.outgoingInvoiceBook`-Router wird **nicht** in `billing.reports` einsortiert, weil die Semantik (Beleg-Liste vs. Aggregationskennzahlen) und das Output-Format (PDF-Report-Seite mit Briefkopf vs. JSON für Recharts) fundamental unterschiedlich sind.

### Leistungszeitraum
Kein bestehendes Ticket adressiert das Feld `servicePeriodFrom/To` — Research bestätigt dies.

## Kontext + Ziel

### Warum Leistungszeitraum (Block A)
§14 Abs. 4 Nr. 6 UStG verlangt auf einer Rechnung entweder **den Leistungszeitraum** oder **den Leistungstag**. Aktuell bietet Terp nur `deliveryDate` (optional, semantisch "Liefertermin"), was bei reinen Dienstleistungsrechnungen (Reinigung, Miete, Wartung) und bei wiederkehrenden Rechnungen nicht ausreicht. Rechnungen ohne korrekten Leistungszeitraum können vom Finanzamt als **nicht vorsteuerabzugsberechtigt** abgewiesen werden.

### Warum Rechnungsausgangsbuch (Block B)
Steuerberater fordern monatlich eine Liste aller gestellten Rechnungen + Gutschriften mit USt-Aufschlüsselung. Aktuell muss der User manuell in `/orders/documents` filtern, die Liste sichten, und Zahlen abtippen. Der fehlende Export erzeugt Medienbrüche und Fehlerrisiko in der Umsatzsteuer-Voranmeldung. Ziel: **Ein-Klick-PDF + CSV** für den gewählten Monat.

### Ziel am Ende dieses Plans
- Alle neuen / bearbeiteten Rechnungen & Gutschriften können einen `servicePeriodFrom/To` tragen, der im PDF, in der ZUGFeRD-XML (BT-73/74) und im Finalize-Warndialog sauber verarbeitet wird.
- Wiederkehrende Rechnungen (`BillingRecurringInvoice`) tragen ab dem Release bei jeder Generierung automatisch den korrekten Leistungszeitraum.
- Der neue Menüpunkt **Fakturierung → Rechnungsausgangsbuch** liefert für jeden Monat (oder freien Zeitraum) eine sortierte Tabelle + PDF + CSV mit USt-Aufschlüsselung, konform zur deutschen StB-Praxis.

## Key Architekturvorgaben (aus Research)

- **Pattern**: Router → Service → Repository. `handleServiceError` mappt Domain-Errors.
- **Procedure-Chain**: `tenantProcedure.use(requireModule("billing")).use(requirePermission(KEY)).input(...)`.
- **Datumsfilter**: `z.coerce.date()`, Prisma `where { documentDate: { gte, lte } }`, inklusive Bounds.
- **PDF**: `@react-pdf/renderer` → `renderToBuffer` → Supabase Storage Bucket `documents` (privat) → Signed URL 60 s.
- **CSV**: `iconv-lite` für Encoding, Base64-Return in tRPC, Client baut Blob + `<a download>`.
- **Permissions**: UUIDv5 mit Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1` in `src/lib/auth/permission-catalog.ts`, per SQL-Migration mit `UPDATE user_groups SET permissions = jsonb_agg(DISTINCT val) ... UNION ALL ...`-Pattern geseedet.
- **Sidebar**: `sidebar-nav-config.ts` Block `billingSection`, Module-Gate + Permission-Gate.
- **Naming (nicht verhandelbar)**: `BillingDocument` / `BillingDocumentPosition`, `subtotalNet` (nicht `totalNet`), `vatRate` (nicht `taxRate`), Status `PRINTED` (nicht `FINALIZED`).

## Finding — DRAFT-Status-Bug in `crm.addresses.getGroupStats` (nicht Scope)

`src/lib/services/crm-address-service.ts:493–577` filtert die Konzern-Umsatz-Aggregation nur mit `status: { not: "CANCELLED" }`. Das schließt **DRAFT-Rechnungen** (nicht finalisierte Entwürfe) **in die Umsatz-Berechnung mit ein**. Für eine echte Umsatzzahl sollte der Filter `status NOT IN ('DRAFT', 'CANCELLED')` sein, analog zum Rechnungsausgangsbuch hier.

**Action-Item**: Neues Ticket `FIX-crm-group-stats-draft-filter` anlegen, nicht Scope dieses Plans. Der neue Rechnungsausgangsbuch-Service implementiert den korrekten Filter separat — keine Refactoring-Brücke zum CRM-Service.

---

## What We're NOT Doing

### Block A — Out of Scope
- Retroaktives Befüllen der Felder bei bestehenden Rechnungen (Migration ist rein additiv, kein Backfill).
- Pflicht-Validierung (Hard-Block) beim Finalisieren — nur Warnung.
- ZUGFeRD BT-72 `ActualDeliveryDate` — bleibt wie bisher aus `deliveryDate` (falls gesetzt) bzw. `documentDate`.
- Positions-Ebene Leistungszeitraum (ZUGFeRD BG-26 `InvoiceLinePeriod`) — bleibt explizit außerhalb; Rechnungs-Header reicht für MVP.
- Automatische Vorschläge basierend auf verknüpften Aufträgen / Service-Cases.

### Block B — Out of Scope
- DATEV-Debitoren-Buchungsstapel (Stapel B) — eigenes Ticket analog `ZMI-TICKET-182`.
- IST-Besteuerung / Zahlungsstatus-Filter — separates Ticket.
- §13b Reverse Charge / Steuerschuldnerschaft des Leistungsempfängers — eigenes Ticket, falls Reinigungsunternehmen das braucht.
- E-Mail-Versand des Reports an den Steuerberater.
- Saldenliste / OP-Liste — bereits Scope von ZMI-164.
- Mandantenspezifische Report-Template-Konfiguration (Logo/Farben custom) — V2.
- Zusatzfilter pro Kunde / pro Kostenstelle / pro Projekt — V2.
- Kombinierte Indizes `[tenantId, type, documentDate]` / `[tenantId, status, documentDate]`, außer Query-Planner in Phase B1 zeigt, dass sie nötig sind.

---

# Block A — Leistungszeitraum

## Phase A1: Schema + Migration

### Overview
Zwei neue optionale Felder auf `BillingDocument`, rein additiv.

### Changes Required

#### `prisma/schema.prisma` — `BillingDocument`
**Position**: nach Zeile 884 (direkt hinter `deliveryDate`)
```prisma
servicePeriodFrom   DateTime?    @map("service_period_from")   @db.Date
servicePeriodTo     DateTime?    @map("service_period_to")     @db.Date
```
`@db.Date` weil wir nur Tagesgenauigkeit brauchen (StB kennt keine Uhrzeiten).

#### Supabase-Migration
**Datei**: `supabase/migrations/<TIMESTAMP>_add_service_period_to_billing_documents.sql`
```sql
ALTER TABLE billing_documents
  ADD COLUMN service_period_from DATE,
  ADD COLUMN service_period_to   DATE;

COMMENT ON COLUMN billing_documents.service_period_from IS
  '§14 UStG: Start des Leistungszeitraums (optional, nur INVOICE/CREDIT_NOTE)';
COMMENT ON COLUMN billing_documents.service_period_to IS
  '§14 UStG: Ende des Leistungszeitraums (optional, nur INVOICE/CREDIT_NOTE)';
```

### Success Criteria

#### Automated Verification
- [x] Migration läuft: `pnpm db:reset`
- [x] Prisma-Client regeneriert: `pnpm db:generate`
- [x] Typecheck: `pnpm typecheck` (delta ≤ 0 zu Baseline) — 9 Errors, alle pre-existing, keiner billing-relevant
- [x] Keine regressiven Service-Tests: `pnpm vitest run src/lib/services/__tests__/billing-document-service.test.ts` (25/25 ✓) — Plan nennt `billing-document-repository.test.ts`, aber diese Datei existiert nicht; Service-Test ist der Regression-Guard.

#### Manual Verification
- [ ] Migration via `supabase db push` auf Staging läuft ohne Fehler.
- [x] `\d billing_documents` in `psql` zeigt beide neuen Spalten mit Typ `date`, nullable.

**Implementation Note**: Pause hier für manuelle Bestätigung auf Staging, bevor A2 beginnt.

---

## Phase A2: tRPC-Input-Schemas + Service-Layer

### Overview
Zod-Schemas der `create` und `update`-Mutationen um die zwei Felder erweitern; `getById`-Output liefert sie automatisch durch Prisma.

### Changes Required

#### `src/trpc/routers/billing/documents.ts`
- **Position**: In den Input-Schemas für `create` und `update` (um die `documentDate`/`deliveryDate` herum) zwei optionale Felder ergänzen:
```ts
servicePeriodFrom: z.coerce.date().nullable().optional(),
servicePeriodTo:   z.coerce.date().nullable().optional(),
```
- Wichtig: `.nullable()` erlauben, damit UI "Feld leeren" als `null` senden kann.

#### Validation: servicePeriodFrom ≤ servicePeriodTo
Client-seitig in `document-editor.tsx`-Validierung UND service-seitig in einer neuen Helper-Funktion `validateServicePeriod(from, to)` in `src/lib/services/billing-document-service.ts`:
```ts
if (from && to && from > to) {
  throw new ValidationError("servicePeriodFrom muss ≤ servicePeriodTo sein")
}
```
Aufruf in `create` und `update` vor dem Repository-Call.

#### `src/lib/services/billing-document-repository.ts`
`update()` und `create()` geben die zwei Felder ungefiltert durch (Prisma kennt sie nach A1 automatisch). Kein neuer Code, nur Typprüfung.

### Success Criteria

#### Automated Verification
- [x] Service-Test: `servicePeriodFrom > servicePeriodTo` wirft `ValidationError`: `pnpm vitest run src/lib/services/__tests__/billing-document-service.test.ts` (36/36 ✓, +11 neue Tests)
- [x] Router-Test: `create` / `update` akzeptieren beide Felder (neuer Test in `src/trpc/routers/__tests__/billingDocuments-router.test.ts`) (26/26 ✓, +4 neue Tests)
- [x] Typecheck grün: `pnpm typecheck` (9 Errors, baseline-identisch, keiner billing-relevant)

#### Manual Verification
- [ ] In Prisma Studio (`pnpm db:studio`) manuell einen Draft-Beleg mit `servicePeriodFrom = 2026-03-01`, `servicePeriodTo = 2026-03-31` erstellen und laden — Werte persistieren korrekt.

**Implementation Note**: Nach A2 pausieren, bevor UI-Phase beginnt.

---

## Phase A3: UI im Belegdetail (Edit-Form)

### Overview
Neue Sidebar-Card "Leistungszeitraum" unter der bestehenden "Konditionen"-Card, sichtbar nur bei `type ∈ { INVOICE, CREDIT_NOTE }`, editierbar nur bei `status === 'DRAFT'`.

### Changes Required

#### `src/components/billing/document-editor.tsx`

1. **EditableField um Date-Variante erweitern** (Zeilen 146–187):
   - `type?: 'text' | 'number' | 'date'` (neuer Literal)
   - Im Input-Branch: wenn `type === 'date'`, `<Input type="date" />`, Parse/Serialisierung via `value?.toISOString().slice(0, 10)` für Wert, `onSave(field, e.target.value ? new Date(e.target.value) : null)` für Callback.
   - Im Display-Branch: Datum via `new Intl.DateTimeFormat('de-DE').format(value)` formatieren.

2. **Neue Sidebar-Card einfügen** (nach der "Konditionen"-Card bei ca. Zeile 827):
```tsx
{(doc.type === 'INVOICE' || doc.type === 'CREDIT_NOTE') && (
  <Card>
    <CardHeader><CardTitle>{t('servicePeriod')}</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <EditableField
        label={t('servicePeriodFrom')}
        value={doc.servicePeriodFrom}
        field="servicePeriodFrom"
        type="date"
        editable={isDraft}
        onSave={handleSidebarField}
      />
      <EditableField
        label={t('servicePeriodTo')}
        value={doc.servicePeriodTo}
        field="servicePeriodTo"
        type="date"
        editable={isDraft}
        onSave={handleSidebarField}
      />
    </CardContent>
  </Card>
)}
```

3. **Client-seitige Validierung** in `handleSidebarField` (Zeile 300): Wenn Feld `servicePeriodFrom` oder `servicePeriodTo` UND der resultierende Zeitraum invers ist, zeige Toast-Fehler und brich `updateMutation.mutate` ab.

#### i18n-Keys in `messages/de.json` Namespace `billingDocuments`

Bestehende Konvention (verifiziert in Pre-Flight-Check `thoughts/shared/research/2026-04-18-preflight-checks.md`): Die `documentDate` / `orderDate` / `deliveryDate`-Labels liegen bereits in `billingDocuments` (Zeilen 6752–6754). Neue Keys direkt darunter:
```json
"servicePeriod": "Leistungszeitraum",
"servicePeriodFrom": "Leistungszeitraum von",
"servicePeriodTo": "Leistungszeitraum bis"
```
`document-editor.tsx:209` nutzt bereits `useTranslations('billingDocuments')` — keine weitere Änderung nötig.

### Success Criteria

#### Automated Verification
- [x] Keine neuen TS-Errors: `pnpm typecheck` (9 Errors, baseline-identisch, 0 billing-relevant, 0 in geänderten Dateien)
- [ ] Playwright-Test: Feld-Eingabe + Persistenz + Readonly-bei-PRINTED (siehe A8).
- [x] Lint sauber: `pnpm exec eslint src/lib/date.ts src/components/billing/document-editor.tsx` — clean; pre-existing Lint-Errors im Repo (andere Dateien) unverändert.

#### Manual Verification
- [ ] Neuer Rechnungs-Draft öffnen → "Leistungszeitraum"-Card sichtbar, beide Felder leer, editierbar.
- [ ] Angebot / Lieferschein öffnen → Card **nicht** sichtbar.
- [ ] Finalisierte Rechnung (`status = PRINTED`) öffnen → Felder read-only angezeigt.
- [ ] Werte eingeben, Blur → Toast "gespeichert", Reload → Werte persistent.
- [ ] `from > to` eingeben → Fehler-Toast, Wert nicht gespeichert.

**Implementation Note**: Pause für manuelle UI-Verifikation.

**Abweichungen vom Plan-Entwurf (aus Session-Präzisierungen)**:
- `EditableField` wurde NICHT erweitert. Statt dessen `EditableDateField` als neue lokale Schwester-Komponente in derselben Datei (`document-editor.tsx` direkt nach `EditableField`). `EditableField` ist lokal in `document-editor.tsx` definiert (keine eigene Datei) — deshalb keine neue Datei, sondern nachbarschaftliche lokale Komponente. Gleiche API-Shape: `label`, `value`, `field`, `editable`, `onSave`.
- Sidebar-Card steht ÜBER der Konditionen-Card (nicht darunter).
- Date-Helpers leben in neuer Datei `src/lib/date.ts` mit drei Funktionen:
  `parseInputDate` (YYYY-MM-DD → lokales Datum ohne UTC-Fallen),
  `formatInputDate` (Date → YYYY-MM-DD für `<Input type="date">`),
  `formatDisplayDate` (Date → TT.MM.JJJJ via `Intl.DateTimeFormat('de-DE')`).
- i18n-Keys `servicePeriod*` auch in `messages/en.json` ergänzt (Konsistenz mit de-Pendants).

---

## Phase A4: PDF-Template-Erweiterung

### Overview
Zeile "Leistungszeitraum: TT.MM.YYYY – TT.MM.YYYY" unter den Beleg-Info-Daten, nur bei `type ∈ { INVOICE, CREDIT_NOTE }` und nur wenn mindestens ein Feld gesetzt ist.

### Changes Required

#### `src/lib/pdf/billing-document-pdf.tsx`

1. Props-Interface `document` erweitern (Zeilen 52–74):
```ts
servicePeriodFrom?: Date | string | null
servicePeriodTo?: Date | string | null
```

2. Im Beleg-Info-Block (Zeilen 127–139) ergänzen:
```tsx
{(doc.type === 'INVOICE' || doc.type === 'CREDIT_NOTE') &&
 (doc.servicePeriodFrom || doc.servicePeriodTo) && (
  <Text style={styles.docInfoText}>
    Leistungszeitraum:{' '}
    {doc.servicePeriodFrom ? formatDate(doc.servicePeriodFrom) : '—'}
    {' – '}
    {doc.servicePeriodTo ? formatDate(doc.servicePeriodTo) : '—'}
  </Text>
)}
```

#### `src/lib/services/billing-document-pdf-service.ts`
`generateAndStorePdf` — Zeilen 55–72: Die zwei neuen Felder an das Props-Objekt weiterreichen:
```ts
servicePeriodFrom: (doc as Record<string, unknown>).servicePeriodFrom as Date | string | null,
servicePeriodTo:   (doc as Record<string, unknown>).servicePeriodTo   as Date | string | null,
```

### Success Criteria

#### Automated Verification
- [ ] PDF-Snapshot-Test bleibt grün — Datei `src/lib/pdf/__tests__/billing-document-pdf.test.tsx` existiert nicht (wird in A8 ergänzt). Kein Snapshot-Test für diese Phase.
- [x] Typecheck: `pnpm typecheck` (9 Errors, baseline-identisch, 0 in PDF-Dateien)
- [x] Lint A4-Dateien: `pnpm exec eslint src/lib/pdf/billing-document-pdf.tsx src/lib/services/billing-document-pdf-service.ts` clean

#### Manual Verification
- [ ] Draft-Rechnung mit Leistungszeitraum finalisieren → PDF herunterladen → Zeile "Leistungszeitraum: 01.03.2026 – 31.03.2026" unter Datum sichtbar.
- [ ] Draft-Rechnung OHNE Leistungszeitraum finalisieren → PDF zeigt **keine** Leistungszeitraum-Zeile.
- [ ] Angebot / Lieferschein → Zeile nie sichtbar (auch wenn Felder zufällig gesetzt wären — durch Type-Guard).

**Implementation Note**: Pause für PDF-Sichtprüfung.

---

## Phase A5: E-Rechnung XML BT-73 / BT-74

### Overview
ZUGFeRD `cac:InvoicePeriod` mit `cbc:StartDate` (BT-73) und `cbc:EndDate` (BT-74) im Invoice-Header, nur wenn mindestens ein Feld gesetzt ist.

### Changes Required

#### `src/lib/services/billing-document-einvoice-service.ts`

`buildInvoiceData` (Zeilen 116–305), **zwischen Zeile 228 (`cbc:BuyerReference`) und Zeile 230 (`cac:AccountingSupplierParty`)**:
```ts
...(doc.servicePeriodFrom || doc.servicePeriodTo
  ? {
      "cac:InvoicePeriod": {
        ...(doc.servicePeriodFrom && {
          "cbc:StartDate": formatDate(doc.servicePeriodFrom),
        }),
        ...(doc.servicePeriodTo && {
          "cbc:EndDate": formatDate(doc.servicePeriodTo),
        }),
      },
    }
  : {}),
```
`formatDate` liefert `YYYY-MM-DD` (bereits vorhanden; siehe ZUGFeRD-Helper in der Datei).

**Wichtig**: Falls nur ein Feld gesetzt ist, wird nur der entsprechende Sub-Tag geschrieben — die ZUGFeRD-EN16931-Validierung akzeptiert beide Sub-Tags als optional.

### Success Criteria

#### Automated Verification
- [x] Unit-Tests in `src/lib/services/__tests__/billing-document-einvoice-service.test.ts` (13/13 ✓, +4 neue):
  - both set → StartDate + EndDate emittiert ✓
  - only from → nur StartDate ✓
  - only to → nur EndDate ✓
  - beide null → kein `cac:InvoicePeriod`-Key ✓
- [x] Typecheck: `pnpm typecheck` (baseline-identisch)

**Implementation-Hinweis**: Da `buildInvoiceData` bisher module-privat war, wurde es (analog zu `validateEInvoiceRequirements`) exportiert, um direkt testbar zu sein. Keine Verhaltensänderung.

#### Manual Verification
- [ ] E-Invoice-enabled Tenant (`billingTenantConfig.eInvoiceEnabled = true`), Draft mit Leistungszeitraum finalisieren → XML aus `eInvoiceXmlUrl` herunterladen → in `xmllint --format` öffnen, `<cac:InvoicePeriod>`-Element mit `<cbc:StartDate>` / `<cbc:EndDate>` vorhanden.
- [ ] Validierung gegen `https://visualisierung.e-rechnung-bund.de/` (XRechnung Validator) oder lokaler `validator-configuration-xrechnung` → keine Fehler, Leistungszeitraum korrekt angezeigt.

**Implementation Note**: Pause für externe Validator-Prüfung.

---

## Phase A6: Finalize-Warnung

### Overview
Gelbe (nicht-destruktive) Warnung im `DocumentFinalizeDialog`, wenn:
- `type ∈ { INVOICE, CREDIT_NOTE }` UND
- `servicePeriodFrom === null && servicePeriodTo === null` UND
- `deliveryDate === null`

Begründung: §14 UStG verlangt entweder Leistungstag ODER Leistungszeitraum. Ein gesetztes `deliveryDate` gilt als eindeutiger Leistungstag; ist es leer UND der Leistungszeitraum leer, fehlt die Angabe.

### Changes Required

#### `src/components/billing/document-print-dialog.tsx`

1. Props-Interface `DocumentFinalizeDialogProps` (Zeilen 30–38) erweitern:
```ts
missingServicePeriod?: boolean
```

2. Neuer Alert-Block **zwischen Zeile 303 und Zeile 305**, analoges Pattern zum E-Invoice-Pflichtfeld-Warning:
```tsx
{missingServicePeriod && (documentType === 'INVOICE' || documentType === 'CREDIT_NOTE') && (
  <Alert>
    <AlertTriangle className="h-4 w-4" />
    <AlertDescription>
      <p className="font-medium">Leistungszeitraum fehlt</p>
      <p className="text-sm mt-1">
        Die Rechnung enthält weder Leistungszeitraum noch Liefertermin.
        §14 UStG verlangt eine der beiden Angaben. Der Beleg kann trotzdem
        finalisiert werden — bitte prüfen, ob dies gewünscht ist.
      </p>
    </AlertDescription>
  </Alert>
)}
```
`<Alert>` ohne `variant="destructive"` (gelber / neutraler Ton) — genau wie die bestehende E-Rechnung-Warnung.

#### `src/components/billing/document-editor.tsx`

1. Neuer `useMemo`-Block für `missingServicePeriod` (analog zu `eInvoiceMissingFields` bei Zeilen 233–249):
```ts
const missingServicePeriod = React.useMemo(() => {
  if (doc.type !== 'INVOICE' && doc.type !== 'CREDIT_NOTE') return false
  return !doc.servicePeriodFrom && !doc.servicePeriodTo && !doc.deliveryDate
}, [doc.type, doc.servicePeriodFrom, doc.servicePeriodTo, doc.deliveryDate])
```

2. Bei `<DocumentFinalizeDialog>`-Call (Zeilen 884–892) `missingServicePeriod={missingServicePeriod}` weiterreichen.

### Success Criteria

#### Automated Verification
- [ ] Component-Test `document-print-dialog.test.tsx` — Datei existiert nicht, kein Component-Test-Setup im Repo (`find src/components -name "*.test.*"` → leer). Gemäß Session-Konvention "keine neuen Test-Datei-Typen anlegen" hier übersprungen; Logik ist trivial (boolean prop → `<Alert>`-Block) und per Code-Review / Playwright (A8) abgedeckt.
- [x] Typecheck: `pnpm typecheck` (baseline-identisch)
- [x] Lint A6-Dateien: `pnpm exec eslint src/components/billing/document-print-dialog.tsx src/components/billing/document-editor.tsx` clean

#### Manual Verification
- [ ] Neue Rechnung ohne Leistungszeitraum UND ohne Liefertermin erstellen → Finalize-Dialog zeigt gelbe Warnung.
- [ ] Gleichen Draft, `deliveryDate` setzen → Warnung verschwindet.
- [ ] Gleichen Draft, `servicePeriodFrom` setzen (deliveryDate leer) → Warnung verschwindet.
- [ ] Finalisierung trotz Warnung geht durch (kein Hard-Block).
- [ ] Angebot ohne Angaben → Warnung NICHT sichtbar.

**Implementation Note**: Pause für manuelle Bestätigung.

---

## Phase A7: Wiederkehrende Rechnungen — Auto-Berechnung

### Overview
Neuer Enum-Feldtyp `servicePeriodMode` auf `BillingRecurringInvoice`, Default `IN_ARREARS`. Bei Generierung im `billing-recurring-invoice-service.generate()` wird basierend auf Modus + Intervall + `documentDate` der Leistungszeitraum automatisch berechnet und auf dem neuen `BillingDocument` gesetzt.

### Changes Required

#### `prisma/schema.prisma` — neuer Enum + Feld
**Position**: Nach dem bestehenden `BillingRecurringInterval`-Enum, vor oder neben `BillingRecurringInvoice`.
```prisma
enum BillingRecurringServicePeriodMode {
  IN_ARREARS
  IN_ADVANCE
  @@map("billing_recurring_service_period_mode")
}

// im BillingRecurringInvoice-Modell (nach `interval`):
servicePeriodMode  BillingRecurringServicePeriodMode  @default(IN_ARREARS) @map("service_period_mode")
```

#### Supabase-Migration
**Datei**: `supabase/migrations/<TIMESTAMP>_add_service_period_mode_to_recurring.sql`
```sql
CREATE TYPE billing_recurring_service_period_mode AS ENUM ('IN_ARREARS', 'IN_ADVANCE');

ALTER TABLE billing_recurring_invoices
  ADD COLUMN service_period_mode billing_recurring_service_period_mode
    NOT NULL DEFAULT 'IN_ARREARS';
```

#### `src/lib/services/billing-recurring-invoice-service.ts`

1. Pure Helper-Funktion (neben `calculateNextDueDate` bei Zeilen 25–45):
```ts
export function calculateServicePeriod(
  documentDate: Date,
  interval: BillingRecurringInterval,
  mode: BillingRecurringServicePeriodMode
): { from: Date; to: Date } {
  // IN_ARREARS: Zeitraum ist das abgelaufene Intervall vor documentDate
  //   MONTHLY: Vormonat (1. bis letzter)
  //   QUARTERLY: Vorquartal
  //   SEMI_ANNUALLY: Vorhalbjahr
  //   ANNUALLY: Vorjahr
  // IN_ADVANCE: Zeitraum ist das Intervall ab documentDate
  //   MONTHLY: documentDate-Monat (1. bis letzter)
  //   QUARTERLY: documentDate-Quartal
  //   etc.
  const reference = mode === 'IN_ARREARS'
    ? subtractInterval(documentDate, interval)
    : documentDate
  return intervalBounds(reference, interval)
}

function intervalBounds(d: Date, interval: BillingRecurringInterval): { from: Date; to: Date } {
  const y = d.getFullYear()
  const m = d.getMonth()
  switch (interval) {
    case 'MONTHLY':
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) }
    case 'QUARTERLY': {
      const q = Math.floor(m / 3)
      return { from: new Date(y, q * 3, 1), to: new Date(y, q * 3 + 3, 0) }
    }
    case 'SEMI_ANNUALLY': {
      const h = m < 6 ? 0 : 6
      return { from: new Date(y, h, 1), to: new Date(y, h + 6, 0) }
    }
    case 'ANNUALLY':
      return { from: new Date(y, 0, 1), to: new Date(y, 11, 31) }
  }
}
```

2. In `generate()` (Zeilen 314–425), direkt nach dem `billingDocRepo.create`-Call (Zeile 344–359), das neu erstellte Document mit dem berechneten Leistungszeitraum updaten:
```ts
const period = calculateServicePeriod(
  template.nextDueDate,
  template.interval,
  template.servicePeriodMode
)
await billingDocRepo.update(tx, tenantId, createdDoc.id, {
  servicePeriodFrom: period.from,
  servicePeriodTo: period.to,
})
```
**Innerhalb derselben Transaction `tx`** — keine externe Neutransaktion.

#### tRPC-Router `src/trpc/routers/billing/recurringInvoices.ts`
- `create` / `update` Input-Schema um `servicePeriodMode: z.enum(['IN_ARREARS', 'IN_ADVANCE']).default('IN_ARREARS')` erweitern.
- `list`-Output liefert das Feld automatisch.

#### UI
Neues Select-Feld "Abrechnung" im Recurring-Invoice-Formular mit Optionen "nachträglich (Standard)" / "im voraus".

### Success Criteria

#### Automated Verification
- [x] Unit-Tests `calculateServicePeriod` (10 neue Fälle in `billing-recurring-invoice-service.test.ts`):
  - MONTHLY / QUARTERLY / SEMI_ANNUALLY / ANNUALLY × IN_ARREARS / IN_ADVANCE ✓
  - Jan→Dec year-boundary ✓
  - Leap-year Feb ✓
- [x] Integration-Test: `generate()` setzt `servicePeriodFrom/To` auf das erzeugte `BillingDocument` — 2 Tests (IN_ARREARS und IN_ADVANCE MONTHLY). ✓
- [x] Migration läuft: `pnpm db:reset` ✓
- [x] `pnpm db:generate` ✓
- [x] Typecheck: 9 Errors baseline-identisch, 0 neue. ✓
- [x] Lint A7-Dateien: clean. ✓
- [x] 4 Billing-Test-Suites re-run (service + router + einvoice + recurring): 109/109 ✓

**Implementation-Hinweis zur Wiring-Entscheidung**: Anstatt nach `billingDocRepo.create` ein separates `billingDocRepo.update` zu machen, setze ich `servicePeriodFrom/To` direkt im `create()`-Payload. Das ist ein DB-Roundtrip weniger, gleiches Verhalten, und die `billing-document-repository.create`-Signatur akzeptiert die Felder bereits (aus A2 als `Date | null`).

#### Manual Verification
- [ ] Bestehende Recurring-Template → `servicePeriodMode` ist `IN_ARREARS` (Default).
- [ ] Neue Template erstellen, `servicePeriodMode = IN_ADVANCE`, `interval = MONTHLY`, `nextDueDate = 2026-05-01`.
- [ ] Cron manuell triggern (oder Generate-Button) → neuer Draft hat `servicePeriodFrom = 2026-05-01`, `servicePeriodTo = 2026-05-31`.
- [ ] UI-Select zeigt beide Optionen, Speichern funktioniert.

**Implementation Note**: Pause für End-to-End-Test der Cron-Pipeline.

---

## Phase A8: Tests + Handbuch — Block A

### Overview
E2E-Playwright-Test für den User-Flow, Zusammenfassung der Tests aus A1–A7, Handbuch-Kapitel §13.x aktualisieren.

### Tests

#### Unit / Service
- `src/lib/services/__tests__/billing-document-service.test.ts` — `validateServicePeriod` (from > to wirft).
- `src/lib/services/__tests__/billing-document-einvoice-service.test.ts` — `cac:InvoicePeriod` Output-Shape.
- `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts` — `calculateServicePeriod` x 5 Fälle + `generate()` setzt Felder.

#### Router
- `src/trpc/routers/__tests__/billingDocuments-router.test.ts` — `create` / `update` akzeptieren neue Felder, `from > to` → `BAD_REQUEST`.
- `src/trpc/routers/__tests__/billingRecurringInvoices-router.test.ts` — `create` / `update` mit `servicePeriodMode`.

#### E2E (Playwright)
**Datei**: `src/e2e-browser/36-leistungszeitraum.spec.ts`
```ts
test.describe("UC-BILL-A: Leistungszeitraum", () => {
  test("Rechnungs-Draft → Felder sichtbar + editierbar, persistenz, PDF enthält Zeile", async ({ page }) => { ... })
  test("Angebot-Draft → Felder NICHT sichtbar", async ({ page }) => { ... })
  test("Finalisierte Rechnung → Felder read-only", async ({ page }) => { ... })
  test("Finalize-Dialog → Warnung bei leerem Leistungszeitraum + leerem Liefertermin", async ({ page }) => { ... })
  test("Finalize-Dialog → Warnung verschwindet bei gesetztem deliveryDate", async ({ page }) => { ... })
})
```

### Handbuch (`TERP_HANDBUCH.md` / `TERP_HANDBUCH_V2.md`)

Neuer / erweiterter Abschnitt in §13 "Fakturierung":
- **§13.X Leistungszeitraum (§14 UStG)** — Bedeutung, wann ausfüllen, wann weglassen, Warnungs-Verhalten, PDF-Darstellung, E-Rechnung-Tag.
- **§13.Y Wiederkehrende Rechnungen: Modus "nachträglich" vs. "im voraus"** — Praxisbeispiel: Miete "im voraus", Reinigung "nachträglich".

### Success Criteria

#### Automated Verification
- [x] Alle Billing-Vitest-Suites grün: 4 Suites (service, einvoice, recurring, router) = 109/109 ✓
- [ ] Playwright-Suite `36-leistungszeitraum.spec.ts`: Datei geschrieben (5 Testfälle). Ausführung benötigt laufenden Dev-Server + Browser und wird im Rahmen der manuellen Abnahme durchgeführt. Spec lintet und typecheckt sauber.
- [x] Typecheck: 9 Errors baseline-identisch. ✓
- [x] Lint: A3–A8-Dateien clean.

#### Implementierte Handbuch-Ergänzungen
- **§13.15 Leistungszeitraum (§14 UStG)** neu nach §13.14 E-Rechnung eingefügt (Bedeutung, UI, PDF, ZUGFeRD BT-73/74, Finalize-Warnung, Entscheidungstabelle "Wann was ausfüllen", Praxisbeispiel Monatsreinigung).
- **§13.13 Wiederkehrende Rechnungen** erweitert: neue Tabellenzeile "Abrechnung Leistungszeitraum" in "Optionale Felder", plus Detailtabelle "Abrechnungsmodus" (Nachträglich vs. Im Voraus) mit drei Beispielen.
- Inhaltsverzeichnis aktualisiert.

#### Manual Verification
- [ ] Handbuch-Abschnitt §13.15 step-by-step ab Login durchklicken — jeder beschriebene Schritt funktioniert.
- [ ] Handbuch-Praxisbeispiel "Monatsreinigung Maerz abrechnen": Leistungszeitraum gesetzt → PDF zeigt Zeile, E-Rechnung enthält `cac:InvoicePeriod`.
- [ ] Handbuch-Erweiterung §13.13 (Abrechnungsmodus): Neue Vorlage mit "Im Voraus" anlegen, Generierung auslösen → erzeugte Rechnung hat Leistungszeitraum im aktuellen Intervall.

**Implementation Note**: Nach A8 ist Block A komplett. Pause für Merge + Staging-Deployment **bevor** Block B beginnt.

---

# Block B — Rechnungsausgangsbuch

## Voraussetzung
Block A vollständig gemerged und auf Staging verifiziert. Die Felder `servicePeriodFrom/To` existieren auf `BillingDocument`.

## Phase B1: tRPC-Router `billing.outgoingInvoiceBook.list` + Repository + Aggregation

### Overview
Neuer Subrouter mit einer `list`-Query, die Rechnungen + Gutschriften im Zeitraum zurückliefert, sortiert und mit USt-Aufschlüsselung aggregiert.

### Changes Required

#### `src/lib/auth/permission-catalog.ts`
Nach den bestehenden `billing_*`-Permissions zwei neue Einträge:
```ts
p("outgoing_invoice_book.view",   "outgoing_invoice_book", "view",   "View Rechnungsausgangsbuch"),
p("outgoing_invoice_book.export", "outgoing_invoice_book", "export", "Export Rechnungsausgangsbuch PDF/CSV"),
```

**UUIDs** (via `node -e "const { v5 } = require('uuid'); console.log(v5('outgoing_invoice_book.view', 'f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'))"` zur Implementierungszeit berechnen und als Kommentar in der Migration notieren — siehe Phase B5).

#### `src/lib/services/outgoing-invoice-book-repository.ts` (neu)
Prisma-Query, die Documents lädt und per-Document per-vatRate aggregiert:

```ts
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: Date; dateTo: Date }
): Promise<OutgoingInvoiceBookEntry[]> {
  const docs = await prisma.billingDocument.findMany({
    where: {
      tenantId,
      type: { in: ["INVOICE", "CREDIT_NOTE"] },
      status: { notIn: ["DRAFT", "CANCELLED"] },
      documentDate: { gte: params.dateFrom, lte: params.dateTo },
    },
    include: {
      address: { select: { id: true, company: true, number: true, vatId: true } },
      positions: { select: { vatRate: true, totalPrice: true, type: true } },
    },
    orderBy: [{ documentDate: "asc" }, { number: "asc" }],
  })

  return docs.map((d) => ({
    id: d.id,
    number: d.number,
    type: d.type,                 // INVOICE | CREDIT_NOTE
    documentDate: d.documentDate,
    servicePeriodFrom: d.servicePeriodFrom,
    servicePeriodTo: d.servicePeriodTo,
    customerName: d.address?.company ?? "—",
    customerNumber: d.address?.number ?? null,
    customerVatId: d.address?.vatId ?? null,
    vatBreakdown: computeVatBreakdown(d.positions, d.type),
    subtotalNet: d.type === "CREDIT_NOTE" ? -d.subtotalNet : d.subtotalNet,
    totalVat: d.type === "CREDIT_NOTE" ? -d.totalVat : d.totalVat,
    totalGross: d.type === "CREDIT_NOTE" ? -d.totalGross : d.totalGross,
  }))
}
```

`computeVatBreakdown(positions, type)` gruppiert Artikel/Free-Positions (ohne `TEXT`, `PAGE_BREAK`, `SUBTOTAL`) nach `vatRate`, summiert `totalPrice` pro Bucket und berechnet `vat = net * rate / 100`, `gross = net + vat`. Credit-Notes werden negativiert.

#### `src/lib/services/outgoing-invoice-book-service.ts` (neu)
Passthrough + Gesamt-Aggregation:
```ts
export async function list(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: Date; dateTo: Date }
): Promise<{ entries: OutgoingInvoiceBookEntry[]; summary: VatSummary }> {
  const entries = await repo.list(prisma, tenantId, params)
  const summary = aggregateSummary(entries)
  return { entries, summary }
}
```
`aggregateSummary` iteriert über alle `entries[].vatBreakdown[]` und gruppiert nach `vatRate` (dynamisch: jeder vorkommende Satz wird Bucket), Gesamtsumme separat.

#### `src/trpc/routers/billing/outgoingInvoiceBook.ts` (neu)
```ts
const OUTGOING_VIEW = permissionIdByKey("outgoing_invoice_book.view")!

const billingProcedure = tenantProcedure.use(requireModule("billing"))

export const billingOutgoingInvoiceBookRouter = createTRPCRouter({
  list: billingProcedure
    .use(requirePermission(OUTGOING_VIEW))
    .input(z.object({
      dateFrom: z.coerce.date(),
      dateTo: z.coerce.date(),
    }))
    .query(async ({ ctx, input }) => {
      try {
        return await service.list(ctx.prisma, ctx.tenantId!, input)
      } catch (err) { handleServiceError(err) }
    }),
})
```

#### `src/trpc/routers/billing/index.ts`
Neuer Key im `billingRouter`:
```ts
outgoingInvoiceBook: billingOutgoingInvoiceBookRouter,
```

### Performance-Check (optional, additiv)
Auf Test-Tenant mit ~5000 Rechnungen: `EXPLAIN ANALYZE` die Query. Falls >200ms, **in dieser Phase** additive Migration für kombinierten Index `[tenantId, type, documentDate]` ergänzen. Sonst weglassen.

### Success Criteria

#### Automated Verification
- [ ] Unit-Test `computeVatBreakdown`: Positions mit gemischten Raten → korrekte Buckets.
- [ ] Unit-Test `aggregateSummary`: dynamische Raten (19, 7, 0, evtl. 16) werden alle gebildet.
- [ ] Repository-Test: Status-Filter funktioniert (DRAFT & CANCELLED nicht im Result).
- [ ] Repository-Test: Credit-Note liefert negative `subtotalNet/totalVat/totalGross`.
- [ ] Router-Test: `list` ohne Permission → FORBIDDEN.
- [ ] Typecheck + Lint grün.

#### Manual Verification
- [ ] Tenant mit 3 PRINTED-Rechnungen (19%, 7%, 19%+7% gemischt) + 1 CREDIT_NOTE + 1 DRAFT-Rechnung seeden.
- [ ] `list({ dateFrom, dateTo })` via tRPC-Playground aufrufen → 4 Entries (DRAFT nicht enthalten), Credit-Note negativ, Summary enthält 19%- und 7%-Bucket mit korrekten Summen.

**Implementation Note**: Pause für Service-Layer-Verifikation.

---

## Phase B2: Page-UI mit Filter + Tabelle

### Overview
Neue Route `/orders/outgoing-invoice-book` mit Datumsfilter, Tabelle und (später) Download-Buttons.

### Changes Required

#### Neue Datei `src/app/[locale]/(dashboard)/orders/outgoing-invoice-book/page.tsx`
- Route: `/orders/outgoing-invoice-book`
- Wrapper-Seite mit Module-Gate und Permission-Gate auf Client-Seite (`usePermissionChecker().check(['outgoing_invoice_book.view'])`) — zusätzlich server-seitig via tRPC geschützt.

#### Neue Komponente `src/components/billing/outgoing-invoice-book.tsx`
- **Filter-Card** (oben):
  - Zwei `<Input type="date">` für `dateFrom` / `dateTo`.
  - Default: letzter abgeschlossener Monat berechnen:
    ```ts
    const now = new Date()
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonth = new Date(firstOfThisMonth.getTime() - 1)
    const defaultFrom = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1)
    const defaultTo = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0)
    ```
  - Buttons: "Vormonat", "Aktueller Monat", "Aktuelles Jahr", "Export PDF", "Export CSV".
- **Tabelle**:
  - Spalten: Datum, Nummer, Typ, Kunde, Leistungszeitraum, Netto, USt-Satz, USt-Betrag, Brutto.
  - Eine Zeile pro `(entry, vatBreakdown[x])`-Kombination — d.h. bei gemischten Raten zwei Zeilen pro Beleg. Das ist die standard-StB-Sicht.
  - CREDIT_NOTE-Zeilen mit Klammer-Negativ: `-1.234,56 €`.
- **Summenzeile pro USt-Satz** (am Ende):
  - Eine Zeile je dynamisch gefundenem Satz: `Summe 19%: Netto X,XX / USt Y,YY / Brutto Z,ZZ`.
  - Darunter: `GESAMT: Netto / USt / Brutto` (Gross-Bold).

#### Neuer Hook `src/hooks/use-outgoing-invoice-book.ts`
```ts
export function useOutgoingInvoiceBookList(dateFrom: Date, dateTo: Date, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.billing.outgoingInvoiceBook.list.queryOptions(
      { dateFrom, dateTo },
      { enabled }
    )
  )
}
```

### Success Criteria

#### Automated Verification
- [ ] Page-Smoke-Test via Playwright (siehe B6).
- [ ] Typecheck + Lint grün.

#### Manual Verification
- [ ] Seite öffnen → Default-Filter zeigt letzten abgeschlossenen Monat, Tabelle lädt.
- [ ] Gemischte Rechnung (19% + 7%) wird als zwei Zeilen dargestellt, je mit korrektem Netto-Bucket.
- [ ] Gutschrift wird in der Tabelle mit negativem Betrag angezeigt.
- [ ] Summenzeile pro Satz stimmt gegen manuelle Überschlagsrechnung (zwei Zufallsmuster).
- [ ] Datumsfilter ändern → Tabelle aktualisiert korrekt.
- [ ] Tenant ohne `outgoing_invoice_book.view` → 403.

**Implementation Note**: Pause für UX-Review durch User.

---

## Phase B3: PDF-Export

### Overview
Neue Mutation `exportPdf` + neuer Service, der das Rechnungsausgangsbuch als PDF rendert (Briefkopf aus `BillingTenantConfig`, Tabelle, Summenblock), in den `documents`-Bucket hochlädt und eine Signed URL (60 s TTL) zurückgibt.

### Changes Required

#### `src/lib/pdf/outgoing-invoice-book-pdf.tsx` (neu)
Neues React-PDF-Dokument, nutzt die bestehenden Shared-Components:
```tsx
<Document>
  <Page size="A4" style={styles.page}>
    {/* Absender-Zeile wie BillingDocumentPdf */}
    {/* Optional Logo top-right wie BillingDocumentPdf */}
    {/* Header-Block */}
    <Text style={styles.title}>Rechnungsausgangsbuch</Text>
    <Text>{tenantConfig.companyName} · {formatDate(from)} bis {formatDate(to)}</Text>

    {/* Tabelle: 7 Spalten: Datum / Nr. / Kunde / Leistungszeitraum / Netto / USt / Brutto */}
    {/* Breaking in mehrere Seiten automatisch durch @react-pdf/renderer */}

    {/* Summenblock pro USt-Satz — TotalsSummaryPdf ist single-row; wir bauen einen ähnlichen
        mehrzeiligen Block inline, oder leichtgewichtige neue VatBreakdownSummaryPdf-Component. */}

    {/* Fußzeile via <FusszeilePdf /> */}
  </Page>
</Document>
```
Logo-Handling analog `billing-document-pdf.tsx:109`.

#### `src/lib/services/outgoing-invoice-book-pdf-service.ts` (neu)
Analog zu `billing-document-pdf-service.ts`:

1. Lädt `entries` + `summary` via `service.list(...)`, `tenantConfig` via `billingTenantConfigRepo.findByTenantId`.
2. Baut React-Tree mit `OutgoingInvoiceBookPdf` → `renderToBuffer`.
3. `storage.upload("documents", path, buffer, { contentType: "application/pdf", upsert: true })`.
   - Path-Schema: `rechnungsausgangsbuch/${tenantId}/${YYYY-MM-DD}_bis_${YYYY-MM-DD}.pdf`.
4. `storage.createSignedReadUrl("documents", path, 60)`.
5. Return `{ signedUrl, filename }` — `filename = "Rechnungsausgangsbuch_${YYYY-MM}.pdf"` bei Monatsexport, sonst mit From-To-Suffix.

Audit-Log (`action: "export"`, `entityType: "outgoing_invoice_book"`, `entityName: "${YYYY-MM-DD}_bis_${YYYY-MM-DD}"`) per `auditLog.log`.

#### Router `src/trpc/routers/billing/outgoingInvoiceBook.ts`
Neue Procedure:
```ts
exportPdf: billingProcedure
  .use(requirePermission(permissionIdByKey("outgoing_invoice_book.export")!))
  .input(z.object({ dateFrom: z.coerce.date(), dateTo: z.coerce.date() }))
  .mutation(async ({ ctx, input }) => {
    try {
      return await pdfService.generateAndGetDownloadUrl(ctx.prisma, ctx.tenantId!, input)
    } catch (err) { handleServiceError(err) }
  }),
```

#### Hook + UI
- `useExportOutgoingInvoiceBookPdf()` → Mutation-Hook.
- Button "PDF exportieren" in der Filter-Card: `mutateAsync(...)`, danach `window.open(result.signedUrl, '_blank')` analog `document-editor.tsx:338–339`.

### Success Criteria

#### Automated Verification
- [ ] PDF-Snapshot-Test für `OutgoingInvoiceBookPdf` mit Fixture: 3 Rechnungen, 1 Gutschrift, 19%+7% Mix.
- [ ] Router-Test: `exportPdf` ohne `outgoing_invoice_book.export` → FORBIDDEN.
- [ ] Typecheck + Lint grün.

#### Manual Verification
- [ ] PDF-Button klicken → neuer Tab zeigt PDF.
- [ ] PDF enthält Briefkopf (Logo, Company-Name), Header "Rechnungsausgangsbuch … · YYYY-MM-DD bis YYYY-MM-DD", Tabelle mit allen Rechnungen + Leistungszeitraum, Summenblock pro USt-Satz + Gesamt, Fußzeile.
- [ ] Gutschrift mit Minus-Betrag korrekt dargestellt.
- [ ] Mehrseitig bei vielen Rechnungen: Test mit 50+ Einträgen → Seitenumbruch sauber.
- [ ] Dateiname im Download-Dialog korrekt.

**Implementation Note**: Pause für PDF-Sichtprüfung durch User.

---

## Phase B4: CSV-Export (UTF-8 + Windows-1252)

### Overview
Neue Mutation `exportCsv` mit Encoding-Parameter, Service schreibt semikolon-getrennte UTF-8 (mit BOM) oder Windows-1252 CSV, Client baut Blob + download.

### Changes Required

#### `src/lib/services/outgoing-invoice-book-csv-service.ts` (neu)

Muster analog `inbound-invoice-datev-export-service.ts`, aber mit einzelner Header-Zeile (nicht DATEV-Double-Header):

```ts
import * as iconv from "iconv-lite"

const COLUMNS = [
  "Rechnungsnummer", "Datum", "Kunde", "USt-IdNr.",
  "Leistungszeitraum von", "Leistungszeitraum bis",
  "Netto", "USt-Satz", "USt-Betrag", "Brutto",
]

const BOM = Buffer.from([0xef, 0xbb, 0xbf])

export async function exportToCsv(
  prisma: PrismaClient,
  tenantId: string,
  params: { dateFrom: Date; dateTo: Date; encoding: 'utf8' | 'win1252' },
  userId?: string
): Promise<{ csv: string; filename: string; count: number }> {
  const { entries } = await bookService.list(prisma, tenantId, params)

  const lines: string[] = []
  lines.push(COLUMNS.join(";"))
  let rowCount = 0
  for (const e of entries) {
    for (const v of e.vatBreakdown) {
      lines.push([
        escapeField(e.number),
        formatDate_DE(e.documentDate),
        escapeField(e.customerName),
        escapeField(e.customerVatId ?? ""),
        e.servicePeriodFrom ? formatDate_DE(e.servicePeriodFrom) : "",
        e.servicePeriodTo   ? formatDate_DE(e.servicePeriodTo)   : "",
        formatDecimalDE(v.net),
        formatDecimalDE(v.vatRate),
        formatDecimalDE(v.vat),
        formatDecimalDE(v.gross),
      ].join(";"))
      rowCount++
    }
  }
  const csvString = lines.join("\r\n") + "\r\n"

  let csvBuffer: Buffer
  if (params.encoding === 'win1252') {
    csvBuffer = iconv.encode(csvString, "win1252")
  } else {
    csvBuffer = Buffer.concat([BOM, Buffer.from(csvString, "utf8")])
  }

  // Audit (best-effort)
  if (userId) await auditLog.log(...)

  const filename = buildFilename(params.dateFrom, params.dateTo) // siehe unten
  return { csv: csvBuffer.toString("base64"), filename, count: rowCount }
}
```

`formatDate_DE(d)` → `TT.MM.JJJJ`. `formatDecimalDE(n)` → `1234,56` (Komma, keine Tausendertrennung für CSV-Import-Freundlichkeit).
`escapeField(s)` aus der DATEV-Service-Logik (Zeilen 60–65) wiederverwenden (falls möglich: in eine neue Shared-Helper-Datei `src/lib/csv/escape.ts` extrahieren — optional, nicht-Scope wenn zu invasiv).

`buildFilename`:
- Ist `dateFrom` der 1. eines Monats UND `dateTo` der letzte desselben Monats → `Rechnungsausgangsbuch_YYYY-MM.csv`.
- Sonst → `Rechnungsausgangsbuch_YYYY-MM-DD_bis_YYYY-MM-DD.csv`.

#### Router
```ts
exportCsv: billingProcedure
  .use(requirePermission(permissionIdByKey("outgoing_invoice_book.export")!))
  .input(z.object({
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
    encoding: z.enum(['utf8', 'win1252']).default('utf8'),
  }))
  .mutation(async ({ ctx, input }) => {
    try {
      return await csvService.exportToCsv(ctx.prisma, ctx.tenantId!, input, ctx.user!.id)
    } catch (err) { handleServiceError(err) }
  }),
```

#### UI
- Button "CSV exportieren" öffnet kleines Popover/Dialog mit Radio "UTF-8 (Standard)" / "Windows-1252 (für ältere Programme)" + Button "Download".
- Download-Code analog `inbound-invoice-detail.tsx:216–236`:
```ts
const blob = new Blob(
  [Uint8Array.from(atob(result.csv), (c) => c.charCodeAt(0))],
  { type: encoding === 'win1252' ? 'text/csv;charset=windows-1252' : 'text/csv;charset=utf-8' }
)
// URL.createObjectURL → a.download → click → revoke
```

### Success Criteria

#### Automated Verification
- [ ] Unit-Test: CSV-String enthält Header + eine Zeile pro `(entry, vatBreakdown[x])`.
- [ ] Unit-Test: Deutsche Zahlen/Datumsformate korrekt (`31.03.2026`, `1234,56`).
- [ ] Unit-Test UTF-8 Output: startet mit `[0xef, 0xbb, 0xbf]`.
- [ ] Unit-Test Win1252 Output: enthält keine BOM, `ß` → `0xDF`, `Ü` → `0xDC`.
- [ ] Router-Test: `exportCsv` mit beiden Encodings und Permission-Gate.

#### Manual Verification
- [ ] CSV herunterladen, in Excel öffnen (Win1252) → Umlaute korrekt.
- [ ] CSV herunterladen, in LibreOffice/Excel öffnen (UTF-8) → Umlaute korrekt.
- [ ] `file --mime-encoding Rechnungsausgangsbuch_2026-03.csv` → `utf-8` bzw. `iso-8859-1`.
- [ ] Dateiname: `Rechnungsausgangsbuch_2026-03.csv` bei Monatsexport; `Rechnungsausgangsbuch_2026-03-15_bis_2026-04-15.csv` bei freiem Range.

**Implementation Note**: Pause für Excel-Kompatibilitätstest auf realem Windows-Rechner (falls verfügbar).

---

## Phase B5: Permissions-Seed + Navigation + i18n

### Overview
SQL-Migration für Permissions, Sidebar-Item, i18n-Keys.

### Changes Required

#### Supabase-Migration `supabase/migrations/<TIMESTAMP>_add_outgoing_invoice_book_permissions.sql`

Pattern B (additiv, dedup-safe):
```sql
-- Permission UUIDs (UUIDv5 mit Namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   outgoing_invoice_book.view   = <compute: node -e "console.log(require('uuid').v5('outgoing_invoice_book.view','f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'))">
--   outgoing_invoice_book.export = <compute: node -e "console.log(require('uuid').v5('outgoing_invoice_book.export','f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1'))">

-- Grant both to ADMIN, BUCHHALTUNG, VERTRIEB (view only für VERTRIEB)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<view-uuid>"'::jsonb
    UNION ALL SELECT '"<export-uuid>"'::jsonb
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<view-uuid>"'::jsonb
    UNION ALL SELECT '"<export-uuid>"'::jsonb
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;

UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<view-uuid>"'::jsonb
  ) sub
) WHERE code = 'VERTRIEB' AND tenant_id IS NULL;
```

#### `src/components/layout/sidebar/sidebar-nav-config.ts`
Neuer Item im `billingSection.items`-Array, **zwischen `billingDocuments` und `billingDunning`**:
```ts
{
  titleKey: 'billingOutgoingInvoiceBook',
  href: '/orders/outgoing-invoice-book',
  icon: BookOpen,   // lucide icon
  module: 'billing',
  permissions: ['outgoing_invoice_book.view'],
},
```

#### `messages/de.json`
Im Namespace `nav` (Zeilen 141–157) neuer Key:
```json
"billingOutgoingInvoiceBook": "Rechnungsausgangsbuch",
```

Neuer Top-Level-Namespace `billingOutgoingInvoiceBook` (folgt der bestehenden Konvention `billingOpenItems`, `billingRecurring`, `billingDunning`, `billingTemplates` — siehe Pre-Flight-Check `thoughts/shared/research/2026-04-18-preflight-checks.md`). Component-Call: `useTranslations('billingOutgoingInvoiceBook')`.

Labels: `title`, `dateFrom`, `dateTo`, `columnDate`, `columnNumber`, `columnType`, `columnCustomer`, `columnServicePeriod`, `columnNet`, `columnVatRate`, `columnVat`, `columnGross`, `exportPdf`, `exportCsv`, `csvEncodingUtf8`, `csvEncodingWin1252`, `summaryPerVatRate`, `grandTotal`, `quickLastMonth`, `quickCurrentMonth`, `quickCurrentYear`.

### Success Criteria

#### Automated Verification
- [ ] Migration läuft: `pnpm db:reset`
- [ ] SQL-Idempotenz: Migration zweimal hintereinander laufen lassen → keine Duplikate in `user_groups.permissions` JSONB.
- [ ] `permissionIdByKey("outgoing_invoice_book.view")` / `.export` liefern UUIDs (nicht null).
- [ ] Typecheck + Lint grün.

#### Manual Verification
- [ ] User ohne neue Permission: Menüpunkt **nicht** sichtbar, direkter Aufruf der Route → 403.
- [ ] User in Gruppe BUCHHALTUNG: Menüpunkt sichtbar, Page lädt.
- [ ] User in Gruppe VERTRIEB: Menüpunkt sichtbar, Export-Buttons rendern Error-Toast bei Klick (view hat, export nicht).
- [ ] Sidebar-Platzierung: Menüpunkt steht zwischen "Belege" und "Mahnwesen".

**Implementation Note**: Pause für Permission-Test mit drei verschiedenen Usern.

---

## Phase B6: Tests + Handbuch — Block B

### Tests

#### Unit / Service
- `src/lib/services/__tests__/outgoing-invoice-book-service.test.ts`:
  - `computeVatBreakdown` mit gemischten Positionen.
  - `aggregateSummary` mit dynamischen Raten.
  - Credit-Note-Negation.
- `src/lib/services/__tests__/outgoing-invoice-book-csv-service.test.ts`:
  - Format UTF-8 + BOM.
  - Format Win1252 + Umlaute korrekt encoded.
  - Filename-Varianten (Monat vs. Range).

#### Router
- `src/trpc/routers/__tests__/billingOutgoingInvoiceBook-router.test.ts`:
  - `list` ohne `outgoing_invoice_book.view` → FORBIDDEN.
  - `list` ohne Modul `billing` → FORBIDDEN.
  - `exportPdf`/`exportCsv` ohne `outgoing_invoice_book.export` → FORBIDDEN.
  - Status-Filter DRAFT/CANCELLED ausgeschlossen.
  - Type-Filter nur INVOICE/CREDIT_NOTE.

#### E2E (Playwright)
**Datei**: `src/e2e-browser/37-rechnungsausgangsbuch.spec.ts`
```ts
test.describe("UC-BILL-B: Rechnungsausgangsbuch", () => {
  test("Menüpunkt sichtbar für Buchhaltung", async ({ page }) => { ... })
  test("Seite zeigt letzten Monat als Default", async ({ page }) => { ... })
  test("Filter anpassen → Tabelle aktualisiert", async ({ page }) => { ... })
  test("PDF-Export → neues Tab öffnet", async ({ page }) => { ... })
  test("CSV-Export UTF-8 → Download startet, Datei ist utf-8 mit BOM", async ({ page }) => { ... })
})
```

### Handbuch (`TERP_HANDBUCH.md` / `TERP_HANDBUCH_V2.md`)

Neuer Abschnitt **§13.Z Rechnungsausgangsbuch**:
- Zweck (StB-Export), Aufruf im Menü, Default-Zeitraum, Filter-Benutzung.
- Erklärung der Spalten und USt-Aufschlüsselung.
- Praxisbeispiel step-by-step: "Rechnungsausgangsbuch für März 2026 als PDF an StB senden"
  1. Login als Buchhaltung-User.
  2. Fakturierung → Rechnungsausgangsbuch anklicken.
  3. Zeitraum per "Vormonat"-Quick-Button setzen.
  4. "Export PDF" → Download → als Anhang in E-Mail an StB.
- Praxisbeispiel step-by-step: "CSV-Import in DATEV"
  1. "Export CSV" → Dropdown "Windows-1252" wählen → Download.
  2. In DATEV importieren via Standard-CSV-Importer.

### Success Criteria

#### Automated Verification
- [ ] Alle Unit-/Router-/Playwright-Tests grün: `pnpm test` + `pnpm exec playwright test src/e2e-browser/37-rechnungsausgangsbuch.spec.ts`
- [ ] Typecheck + Lint grün.
- [ ] Kompletter Testlauf: `pnpm test` delta zu Baseline ≤ 0.

#### Manual Verification
- [ ] Handbuch-Praxisbeispiele step-by-step durchklicken — jeder beschriebene Schritt funktioniert.
- [ ] Handbuch enthält Screenshots der Seite, des PDF-Exports und des CSV-Dialogs.

**Implementation Note**: Abschluss Block B = Plan komplett umgesetzt.

---

## Testing-Strategie (Übergreifend)

### Vitest

| Kategorie | Scope | Datei |
|---|---|---|
| Service | `validateServicePeriod` | `billing-document-service.test.ts` |
| Service | `calculateServicePeriod` x 5 Intervalle | `billing-recurring-invoice-service.test.ts` |
| Service | E-Invoice `cac:InvoicePeriod` Output | `billing-document-einvoice-service.test.ts` |
| Service | `computeVatBreakdown`, `aggregateSummary` | `outgoing-invoice-book-service.test.ts` |
| Service | CSV Format + Encoding | `outgoing-invoice-book-csv-service.test.ts` |
| Repo | Status-Filter (DRAFT/CANCELLED raus) | `outgoing-invoice-book-repository.test.ts` |
| Router | Input-Schema Leistungszeitraum | `billingDocuments-router.test.ts` |
| Router | Permission-Gates Outgoing-Book | `billingOutgoingInvoiceBook-router.test.ts` |
| Router | Recurring `servicePeriodMode` | `billingRecurringInvoices-router.test.ts` |

### Playwright

- `src/e2e-browser/36-leistungszeitraum.spec.ts` — Block A (UC-BILL-A)
- `src/e2e-browser/37-rechnungsausgangsbuch.spec.ts` — Block B (UC-BILL-B)

### Manuelle Abnahme-Sessions
Pro Phase ein Verifikationsblock, zwischen Phasen Pause mit User-Freigabe.
Abschluss-Session: Handbuch-Abschnitte §13.X, §13.Y, §13.Z step-by-step durchklicken.

---

## Handbuch-Update-Plan

| Abschnitt | Inhalt | Phase |
|---|---|---|
| §13.X — Leistungszeitraum (§14 UStG) | Bedeutung, UI-Felder, PDF-Darstellung, E-Rechnung-Tag, Warnungs-Verhalten | A8 |
| §13.Y — Wiederkehrende Rechnungen: Modus "nachträglich" / "im voraus" | Praxisbeispiel Miete (im voraus) vs. Reinigung (nachträglich) | A8 |
| §13.Z — Rechnungsausgangsbuch | Zweck, Menü, Filter, PDF/CSV-Export, StB-Workflow | B6 |

Handbuch-Screenshots werden in derselben PR wie die jeweilige Phase erzeugt.

---

## References

- **Research**: `thoughts/shared/research/2026-04-18-rechnungsausgangsbuch.md`
- **Konsolidierte Tickets**: 
  - `thoughts/shared/tickets/ZMI-TICKET-164-rechnungslisten-dashboard.md` (bleibt aktiv, Scope verkleinert)
  - `thoughts/shared/tickets/orgAuftrag/TICKET_ORD_06_AUSWERTUNGEN.md` (bleibt aktiv, unabhängig)
- **Schema**: `prisma/schema.prisma:863–949` (BillingDocument), `:1258–1297` (BillingRecurringInvoice)
- **PDF-Pipeline**: `src/lib/services/billing-document-pdf-service.ts`, `src/lib/pdf/billing-document-pdf.tsx`
- **E-Invoice**: `src/lib/services/billing-document-einvoice-service.ts:116–305,228`
- **Recurring-Service**: `src/lib/services/billing-recurring-invoice-service.ts:25–45,314–425`
- **CSV-Muster**: `src/lib/services/inbound-invoice-datev-export-service.ts:60–65,280`
- **Permission-Catalog**: `src/lib/auth/permission-catalog.ts:12,27–28,250–254`
- **Permission-Migration-Pattern B**: `supabase/migrations/20260501000000_overtime_payout.sql:103–110`
- **Sidebar**: `src/components/layout/sidebar/sidebar-nav-config.ts:401–455`
- **i18n**: `messages/de.json:141–157`
- **Finalize-Dialog**: `src/components/billing/document-print-dialog.tsx:283–303`
- **Document-Editor**: `src/components/billing/document-editor.tsx:146–187,815–827,884–892`
