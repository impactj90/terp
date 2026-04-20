---
date: 2026-04-18
author: impactj90
git_commit: e18f63e2e1bfbac9d7c24766ef82424ddb516a33
branch: staging
repository: terp
topic: "Pre-Flight-Checks vor /implement_plan — Leistungszeitraum + Rechnungsausgangsbuch"
tags: [preflight, research, prisma, i18n]
status: complete
related_plan: thoughts/shared/plans/2026-04-18-leistungszeitraum-und-rechnungsausgangsbuch.md
---

# Pre-Flight-Checks — Leistungszeitraum + Rechnungsausgangsbuch

## Zusammenfassung

| Check | Ergebnis |
|---|---|
| **1. CrmAddress-Feldnamen** | ✅ Plan ist korrekt. Keine Änderung nötig. |
| **2. i18n-Namespace** | ⚠️ Plan lässt offen — konkrete Empfehlung unten. Ein kleiner str_replace nötig. |

---

## CHECK 1 — CrmAddress-Feldnamen

### Prisma-Schema (`prisma/schema.prisma:466–528`)

```prisma
model CrmAddress {
  id              String         @id ...
  tenantId        String         @map("tenant_id") @db.Uuid
  number          String         @db.VarChar(50)          // ← Kundennummer
  type            CrmAddressType @default(CUSTOMER)
  company         String         @db.VarChar(255)         // ← Firmenname
  street          String?        @db.VarChar(255)
  zip             String?        @db.VarChar(20)
  city            String?        @db.VarChar(100)
  country         String?        @default("DE") @db.VarChar(10)
  ...
  taxNumber       String?        @map("tax_number") @db.VarChar(50)
  vatId           String?        @map("vat_id")    @db.VarChar(50)  // ← USt-IdNr.
  leitwegId       String?        @map("leitweg_id") @db.VarChar(50)
  ...
}
```

**Alle drei Felder aus dem Plan existieren exakt so:**

| Plan-Referenz | Tatsächlicher Feldname | Status |
|---|---|---|
| `address.company` | `company` (`@db.VarChar(255)`, required) | ✅ |
| `address.number` | `number` (`@db.VarChar(50)`, required) | ✅ |
| `address.vatId` | `vatId` (`@map("vat_id")`, optional) | ✅ |

### Konsistenz-Check in bestehenden Services

`src/lib/services/billing-document-einvoice-service.ts` nutzt alle drei Felder konsistent:

- Zeile 68: `if (!address.company) missing.push(...)`
- Zeile 143: `const buyerTaxScheme = address.vatId`
- Zeile 145: `"cbc:CompanyID": address.vatId`
- Zeile 254: `"cac:PartyName": { "cbc:Name": address.company }`
- Zeile 394: `company: address.company` (als Storage-Path-Parameter)

`src/lib/services/crm-address-repository.ts:290–310` (Group-Query in CRM-Reports) nutzt ebenfalls `company`, `number` und den `select`-Block: `{ id, company, number, type, city, _count: ... }`.

**Fazit**: Plan ist korrekt. **Kein str_replace nötig.**

---

## CHECK 2 — i18n-Namespace für Leistungszeitraum-Keys

### Top-Level-Namespace-Struktur in `messages/de.json`

Oberste Ebene der JSON enthält jeweils flache Namespaces (keine hierarchische `billing.*`-Struktur):

| Namespace | Zeile (Start) | Inhalt |
|---|---|---|
| `nav` | 79 | Sidebar-Menütitel |
| `billingDocuments` | 6620 | Belegdetail, Listen, Formular — **enthält bereits `documentDate`, `orderDate`, `deliveryDate` als Feld-Labels** (Zeilen 6752–6754) |
| `billingOpenItems` | 6783 | Offene Posten |
| `billingRecurring` | 6897 | Wiederkehrende Rechnungen |
| `billingPriceLists`, `billingPriceListEntries`, `billingDunning`, `billingTemplates` | (weitere) | — |

### useTranslations-Konvention in Billing-Components

`src/components/billing/*.tsx`-Grep zeigt 30+ Komponenten, alle mit flachen Top-Level-Keys:

```ts
const t = useTranslations('billingDocuments')      // document-editor.tsx:209
const t = useTranslations('billingRecurring')      // recurring-detail.tsx:70
const tDoc = useTranslations('billingDocuments')   // recurring-detail.tsx:72
const t = useTranslations('billingOpenItems')      // open-item-list.tsx:39
const t = useTranslations('billingDunning')        // dunning-page.tsx:16
```

**Kein Component nutzt `'billing'` (Singular) oder einen verschachtelten Pfad** wie `'billing.documents'`. Die Konvention ist: ein Top-Level-Namespace pro Feature-Bereich, benannt als `billing<Feature>` in CamelCase.

### Existierende Date-Labels in `billingDocuments` (`messages/de.json:6752–6754`)

```json
"documentDate": "Belegdatum",
"orderDate": "Auftragsdatum",
"deliveryDate": "Liefertermin",
```

Die drei bestehenden Datumsfeld-Labels leben bereits im `billingDocuments`-Namespace. Die neuen Keys `servicePeriod`, `servicePeriodFrom`, `servicePeriodTo` sind direkt verwandt (gleicher Sidebar-Context, gleiche Komponente `document-editor.tsx`) und gehören **in denselben Namespace**.

### Empfehlung

#### Block A — Leistungszeitraum-Keys
**Namespace**: `billingDocuments` (nicht `billing`, nicht `documents`, keine neue Namespace).

Neue Einträge direkt hinter Zeile 6754 (`"deliveryDate": "Liefertermin"`):
```json
"servicePeriod": "Leistungszeitraum",
"servicePeriodFrom": "Leistungszeitraum von",
"servicePeriodTo": "Leistungszeitraum bis",
```

Component-Call in `document-editor.tsx:209` bleibt `useTranslations('billingDocuments')` — keine Änderung nötig.

#### Block B — Rechnungsausgangsbuch-Keys
**Namespace**: Neuer Top-Level-Namespace `billingOutgoingInvoiceBook`.

Begründung: Folgt der bestehenden Konvention (`billingOpenItems`, `billingRecurring`, `billingDunning`, `billingTemplates`). Eine neue Feature-Seite bekommt einen eigenen Namespace für lokale Labels (Spaltenüberschriften, Filter-Buttons, Export-Dialog-Texte).

Der **Sidebar-Menütitel** selbst gehört in den `nav`-Namespace (siehe `messages/de.json:79–260`), genau wie der Plan es bereits vorsieht — also:

```json
// In "nav" (bei Zeile ~141–157 analog zu billingDocuments, billingDunning etc.)
"billingOutgoingInvoiceBook": "Rechnungsausgangsbuch"
```

```json
// Neuer Top-Level-Namespace
"billingOutgoingInvoiceBook": {
  "title": "Rechnungsausgangsbuch",
  "dateFrom": "Von",
  "dateTo": "Bis",
  "columnDate": "Datum",
  "columnNumber": "Nr.",
  "columnType": "Typ",
  "columnCustomer": "Kunde",
  "columnServicePeriod": "Leistungszeitraum",
  "columnNet": "Netto",
  "columnVatRate": "USt-Satz",
  "columnVat": "USt",
  "columnGross": "Brutto",
  "exportPdf": "Export PDF",
  "exportCsv": "Export CSV",
  "csvEncodingUtf8": "UTF-8 (Standard)",
  "csvEncodingWin1252": "Windows-1252 (für ältere Programme)",
  "summaryPerVatRate": "Summe {rate}%",
  "grandTotal": "Gesamt",
  "quickLastMonth": "Vormonat",
  "quickCurrentMonth": "Aktueller Monat",
  "quickCurrentYear": "Aktuelles Jahr"
}
```

Component-Call in neuer Komponente `outgoing-invoice-book.tsx`:
```ts
const t = useTranslations('billingOutgoingInvoiceBook')
const tNav = useTranslations('nav')  // nur wenn nötig
```

---

## Vorgeschlagene Plan-Patches

Zwei kleine `str_replace`-Edits in `thoughts/shared/plans/2026-04-18-leistungszeitraum-und-rechnungsausgangsbuch.md`, damit die Implementierung nicht rätseln muss:

### Patch A — Phase A3, i18n-Keys präzisieren

**Datei**: `thoughts/shared/plans/2026-04-18-leistungszeitraum-und-rechnungsausgangsbuch.md`

**old_string**:
```
#### i18n-Keys in `messages/de.json` Namespace `billing` (oder `documents`, je nach bestehender Konvention — Implementierung prüft)
```json
"servicePeriod": "Leistungszeitraum",
"servicePeriodFrom": "Leistungszeitraum von",
"servicePeriodTo": "Leistungszeitraum bis"
```
```

**new_string**:
```
#### i18n-Keys in `messages/de.json` Namespace `billingDocuments`

Bestehende Konvention (verifiziert in Pre-Flight-Check `thoughts/shared/research/2026-04-18-preflight-checks.md`): Die `documentDate` / `orderDate` / `deliveryDate`-Labels liegen bereits in `billingDocuments` (Zeilen 6752–6754). Neue Keys direkt darunter:
```json
"servicePeriod": "Leistungszeitraum",
"servicePeriodFrom": "Leistungszeitraum von",
"servicePeriodTo": "Leistungszeitraum bis"
```
`document-editor.tsx:209` nutzt bereits `useTranslations('billingDocuments')` — keine weitere Änderung nötig.
```

### Patch B — Phase B5, Rechnungsausgangsbuch-Namespace präzisieren

**Datei**: `thoughts/shared/plans/2026-04-18-leistungszeitraum-und-rechnungsausgangsbuch.md`

**old_string**:
```
Im Namespace `billing` (oder `outgoingInvoiceBook` als neuer Namespace, Implementierung prüft bestehende Konvention) alle Labels für die Page-Komponente:
- `title`, `from`, `to`, `columnDate`, `columnNumber`, `columnType`, `columnCustomer`, `columnServicePeriod`, `columnNet`, `columnVatRate`, `columnVat`, `columnGross`, `exportPdf`, `exportCsv`, `csvEncodingUtf8`, `csvEncodingWin1252`, `summaryPerVatRate`, `grandTotal`, etc.
```

**new_string**:
```
Neuer Top-Level-Namespace `billingOutgoingInvoiceBook` (folgt der bestehenden Konvention `billingOpenItems`, `billingRecurring`, `billingDunning`, `billingTemplates` — siehe Pre-Flight-Check `thoughts/shared/research/2026-04-18-preflight-checks.md`). Component-Call: `useTranslations('billingOutgoingInvoiceBook')`.

Labels: `title`, `dateFrom`, `dateTo`, `columnDate`, `columnNumber`, `columnType`, `columnCustomer`, `columnServicePeriod`, `columnNet`, `columnVatRate`, `columnVat`, `columnGross`, `exportPdf`, `exportCsv`, `csvEncodingUtf8`, `csvEncodingWin1252`, `summaryPerVatRate`, `grandTotal`, `quickLastMonth`, `quickCurrentMonth`, `quickCurrentYear`.
```

---

## Freigabe-Empfehlung

- **Check 1**: Keine Änderungen am Plan, kann unverändert in Implementierung gehen.
- **Check 2**: Zwei kleine Patches oben — empfehle Anwendung vor `/implement_plan`, damit Block A3 und B5 eindeutig sind.

Kein anderer Plan-Inhalt berührt.
