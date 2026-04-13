---
date: 2026-04-13T10:10:09+02:00
researcher: Claude (Opus 4.6)
git_commit: 29967f3bb635ce67a55cf53a4fcef2c359b598f6
branch: master
repository: terp
topic: "Mahnwesen — Bestandsaufnahme der betroffenen Code-Bereiche"
tags: [research, billing, dunning, mahnwesen, crm, pdf, email, cron]
status: complete
last_updated: 2026-04-13
last_updated_by: Claude
---

# Research: Mahnwesen — Bestandsaufnahme der betroffenen Code-Bereiche

**Date**: 2026-04-13 10:10 +02:00
**Researcher**: Claude (Opus 4.6)
**Git Commit**: 29967f3bb635ce67a55cf53a4fcef2c359b598f6
**Branch**: master
**Repository**: terp

## Forschungsfrage

Vollständige Bestandsaufnahme aller Code-Bereiche, die für ein geplantes Mahnwesen-Feature (gestufte Mahnungen für überfällige Kundenrechnungen mit konfigurierbaren Gebühren, Verzugszinsen, PDF und E-Mail-Versand) relevant sind. Nur Fakten aus dem aktuellen Code, keine Empfehlungen.

## Zusammenfassung

- **Kein Mahnwesen im Code.** Weder Tabellen, Services, Routen, Permissions, i18n-Keys noch Stubs existieren. Das einzige Artefakt ist eine Planungs-Datei in `thoughts/shared/tickets/ZMI-TICKET-162-mahnwesen.md`.
- **BillingDocument** hat **keinerlei Mahn-Marker** (kein `dunningLevel`, kein `lastReminderDate`, keine Relation zu einem Mahn-Modell).
- **Offener Betrag wird live berechnet** (nicht persistiert). Berechnung: `totalGross − Σ credit notes − Σ active payments`. Überfälligkeit ebenfalls live: `dueDate < now && paymentStatus ∉ {PAID, OVERPAID}`.
- **Geldbeträge in Billing: Prisma `Float`** (nicht Decimal, nicht Cents). Lohnmodul verwendet `Decimal(10,2)`.
- **Keine Mahnsperre** auf `CrmAddress` oder `BillingDocument` (nur `isActive`).
- **Keine automatischen `CrmCorrespondence`-Einträge** heute — alle manuell über tRPC.
- **PDF-Stack steht**: `@react-pdf/renderer` + Supabase Storage Bucket `documents`, Storage-Path `{type}/{number}_{company}.pdf`.
- **E-Mail-Stack steht**: `email-send-service` + `TenantSmtpConfig` + `EmailSendLog` + `email-retry`-Cron (alle 5min, 3 retries, 1/5/15 min backoff).
- **Briefkonfigurator** existiert als `BillingDocumentTemplate` mit regex-basierter `{{key}}`-Platzhalter-Ersetzung und headerText/footerText pro Dokumenttyp.
- **Cron-Infrastruktur** etabliert (14 Routes), aber `CRON_SECRET`-Check ist in jeder Route dupliziert.
- **Notification-System** mit 4 Typen (`approvals`, `errors`, `reminders`, `system`) und deep-link-Feld `link` einsatzbereit.
- **NumberSequence** bietet 16 vordefinierte Prefixes; `dunning`/`MA-` ist **nicht vergeben**.

---

## 1. BillingDocument — Ausgangsrechnungen

### Prisma-Schema (`prisma/schema.prisma:834-914`)

Alle Felder (vollständig):
- **Identifikation:** `id`, `tenantId`, `number` (VARCHAR 50, unique pro Mandant)
- **Typ/Status:** `type` (`BillingDocumentType`), `status` (`BillingDocumentStatus`, default `DRAFT`)
- **Adressen:** `addressId`, `contactId`, `deliveryAddressId`, `invoiceAddressId` (UUIDs, zum Teil nullable)
- **Dokument-Kette:** `inquiryId`, `orderId`, `parentDocumentId`
- **Daten:** `orderDate`, `documentDate` (default `now()`), `deliveryDate`
- **Zahlungsbedingungen:** `paymentTermDays` (Int, **nullable**), `deliveryType`, `deliveryTerms`, `shippingCostNet`, `shippingCostVatRate`
- **Skonto (2 Stufen):** `discountPercent`/`discountDays`, `discountPercent2`/`discountDays2`
- **Summen (persistiert, `Float`):** `subtotalNet`, `totalVat`, `totalGross` (default 0)
- **Text:** `notes`, `internalNotes`, `headerText`, `footerText`, `pdfUrl`, `eInvoiceXmlUrl`
- **Print-State:** `printedAt`, `printedById`
- **Audit:** `createdAt`, `updatedAt`, `createdById`
- **Relations:** `tenant`, `address`, `contact`, `deliveryAddress`, `invoiceAddress`, `inquiry`, `order`, `parentDocument`, `childDocuments` (self-relation für CreditNotes), `positions`, `billingServiceCases`, `payments`

### Enums

**`BillingDocumentStatus`:** `DRAFT, PRINTED, PARTIALLY_FORWARDED, FORWARDED, CANCELLED`
**`BillingDocumentType`:** `OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, INVOICE, CREDIT_NOTE`

### Überfälligkeit heute: live berechnet

`src/lib/services/billing-payment-service.ts:45-62`

```typescript
export function computeDueDate(documentDate: Date, paymentTermDays: number | null): Date | null {
  if (paymentTermDays === null || paymentTermDays === undefined) return null
  const due = new Date(documentDate)
  due.setDate(due.getDate() + paymentTermDays)
  return due
}

export function isOverdue(dueDate: Date | null, paymentStatus: string): boolean {
  if (!dueDate) return false
  if (paymentStatus === "PAID" || paymentStatus === "OVERPAID") return false
  return dueDate < new Date()
}
```

**Wichtig:** `dueDate` ist **nicht** persistiert — wird aus `documentDate + paymentTermDays` jeweils berechnet. Rechnungen mit `paymentTermDays = null` gelten **nie als überfällig**.

### Existiert NICHT auf BillingDocument

- Kein Feld `dunningLevel`, `reminderLevel`, `lastReminderDate`, `inDunning`, `dunningBlocked`, `gemahnt`.
- Keine Relation zu einem Mahn-Modell (wäre Neuimplementierung).

---

## 2. BillingPayment — Offene Posten

### Prisma-Schema (`prisma/schema.prisma:1080-1102`)

Felder: `id`, `tenantId`, `documentId`, `date`, `amount` (**Float**), `type` (enum `CASH | BANK`), `status` (enum `ACTIVE | CANCELLED`), `isDiscount` (Boolean — markiert Skonto-Buchungen), `notes`, `cancelledAt`, `cancelledById`, `createdAt`, `updatedAt`, `createdById`.

**Keine `method`-Felder für SEPA/Überweisung/Scheck** — nur `CASH | BANK`.

Indizes: `[tenantId, documentId]`, `[tenantId, date]`.

### Open-Amount-Berechnung — immer live

`src/lib/services/billing-payment-service.ts:75-98`

```typescript
function enrichOpenItem(doc: OpenItemDocument) {
  const creditNoteReduction = (doc.childDocuments ?? []).reduce(
    (sum, cn) => sum + cn.totalGross, 0
  )
  const effectiveTotalGross = doc.totalGross - creditNoteReduction
  const paidAmount = doc.payments
    .filter((p) => p.status === "ACTIVE")
    .reduce((sum, p) => sum + p.amount, 0)
  const openAmount = Math.max(0, effectiveTotalGross - paidAmount)
  const paymentStatus = computePaymentStatus(effectiveTotalGross, paidAmount)
  const dueDate = computeDueDate(doc.documentDate, doc.paymentTermDays)
  const overdue = isOverdue(dueDate, paymentStatus)
  return { paidAmount, openAmount, effectiveTotalGross, creditNoteReduction, paymentStatus, dueDate, isOverdue: overdue }
}
```

- `effectiveTotalGross = totalGross − Σ totalGross der CreditNotes (childDocuments)`
- `paidAmount = Σ active payments` — **inklusive Skonto** (`isDiscount=true` zählt mit, nicht separat)
- `paymentStatus ∈ {UNPAID, PARTIAL, PAID, OVERPAID}` — siehe `computePaymentStatus` lines 34-43
- `openAmount`, `dueDate`, `isOverdue` werden **nie in die DB geschrieben**.

### Listen-Query `listOpenItems()`

`src/lib/services/billing-payment-service.ts:102-160`

- Filtert Dokumente mit `type=INVOICE` und `status ∈ {PRINTED, PARTIALLY_FORWARDED, FORWARDED}`
- Post-Query-Filter nach `status = "overdue"` wird in-memory über das berechnete `isOverdue`-Flag angewandt
- Paging per-page post-query → Performance-Kosten skalieren mit der Gesamtzahl offener Rechnungen pro Mandant

tRPC-Router: `src/trpc/routers/billing/payments.ts:25-33`

### UI „Offene Posten"

- Liste: `src/app/[locale]/(dashboard)/orders/open-items/page.tsx` → `src/components/billing/open-item-list.tsx`
- Detail: `src/app/[locale]/(dashboard)/orders/open-items/[documentId]/page.tsx` → `src/components/billing/open-item-detail.tsx`
- Summary: `src/components/billing/open-items-summary-card.tsx`
- Filter: `search`, `status ∈ {open, partial, paid, overdue}`, `dateFrom`, `dateTo`, Paging `pageSize ≤ 100`
- Spalten: Belegnr., Kunde, Belegdatum, Fälligkeitsdatum, Brutto, Bezahlt, Offen, Status-Badge

### Skonto-Logik

`src/lib/billing/payment-discount.ts` — liefert bei `createPayment()` passenden Rabatt-Tier (1 oder 2) zurück:

```typescript
export function getApplicableDiscount(document, paymentDate) {
  const daysDiff = Math.floor((paymentDate - docDate) / 86400000)
  if (document.discountDays != null && document.discountPercent != null &&
      document.discountPercent > 0 && daysDiff <= document.discountDays) {
    return { percent: document.discountPercent, tier: 1 }
  }
  if (document.discountDays2 != null && document.discountPercent2 != null &&
      document.discountPercent2 > 0 && daysDiff <= document.discountDays2) {
    return { percent: document.discountPercent2, tier: 2 }
  }
  return null
}
```

`createPayment()` (`billing-payment-service.ts:244-430`) schreibt sowohl die eigentliche Zahlung als auch eine zweite `BillingPayment`-Zeile mit `isDiscount=true` (Notiz `"Skonto 1 (3%)"`).

---

## 3. CrmAddress — Kundendaten

### Prisma-Schema (`prisma/schema.prisma:443-495`)

Felder: `id`, `tenantId`, `number`, `type` (`CrmAddressType`), `company`, `street`, `zip`, `city`, `country` (default `"DE"`), `phone`, `fax`, `email`, `website`, `taxNumber`, `vatId`, `leitwegId`, `matchCode`, `notes`, `paymentTermDays`, `discountPercent`, `discountDays`, `discountGroup`, `ourCustomerNumber`, `salesPriceListId`, `purchasePriceListId`, **`isActive`** (Boolean, default true), `createdAt`, `updatedAt`, `createdById`, `parentAddressId`.

### Address-Typ-Enum (`prisma/schema.prisma:395-401`)

```
enum CrmAddressType { CUSTOMER, SUPPLIER, BOTH }
```

### Mahnsperre/Payment-Block heute

**Existiert nicht.** Kein `dunningBlocked`, `noReminders`, `paymentBlock`, `isBlocked`. Einziger Flag-ähnlicher Wert: `isActive`. Es gibt ein `remindersEnabled`-Flag, aber auf `NotificationPreference` (pro User, nicht pro Kunde).

### Kunden-Detail-Seite

`src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` mit Tabs (lines 258-267):
`overview, contacts, bankAccounts, correspondence, inquiries, tasks, documents, serviceCases`

### Checkbox-Pattern für Bool-Flag

`src/components/crm/bank-account-form-dialog.tsx`:

```tsx
<Checkbox
  id="isDefault"
  checked={form.isDefault}
  onCheckedChange={(checked) => setForm(p => ({ ...p, isDefault: checked === true }))}
  disabled={isSubmitting}
/>
```

---

## 4. PDF-Generierung für BillingDocument

### Libraries (`package.json:71`)

- **`@react-pdf/renderer@^4.3.2`** — primäre PDF-Engine
- `pdf-lib@^1.17.1` — PDF-Manipulation (XRechnung-Einbettung)
- `@e-invoice-eu/core@^2.3.4` — XRechnung/ZUGFeRD

### Service

`src/lib/services/billing-document-pdf-service.ts`
- `generateAndStorePdf()` — beim Finalisieren des Dokuments aufgerufen
- `generateAndGetDownloadUrl()` — regeneriert falls fehlt, liefert signed URL

### Template — React Components

`src/lib/pdf/billing-document-pdf.tsx` (Entry-Point) importiert:
- `RichTextPdf`
- `PositionTablePdf`
- `TotalsSummaryPdf`
- `FusszeilePdf`

Styling per `StyleSheet.create()`, mm→pt-Umrechnung. Header-/Footer-Styling hardcoded in der Entry-Datei (lines 20-33); kein geteiltes Layout-Framework.

### Storage

`src/lib/pdf/pdf-storage.ts:27-36`

- Bucket: **`documents`** (Supabase Storage, privat)
- Path: `{type}/{number}_{company}.pdf`, z.B. `rechnung/RE-2024-001_Acme_Inc.pdf`
- Persistiert in `BillingDocument.pdfUrl` (als Storage-Pfad, nicht Public-URL)
- Signed Download URL: 60s Gültigkeit über `storage.createSignedReadUrl()`

### XRechnung

`src/lib/services/billing-document-einvoice-service.ts` — `generateAndStoreEInvoice()`, CII-XML via `@e-invoice-eu/core`, PDF/A-3 mit eingebettetem XML überschreibt das Original. XML-Pfad analog `{type}/{number}_{company}.xml`, persistiert in `BillingDocument.eInvoiceXmlUrl`.

---

## 5. Briefkonfigurator — BillingDocumentTemplate

### Modell (`prisma/schema.prisma`)

```prisma
model BillingDocumentTemplate {
  id            String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String  @map("tenant_id") @db.Uuid
  name          String  @db.VarChar(255)
  documentType  BillingDocumentType?
  headerText    String?  @map("header_text")
  footerText    String?  @map("footer_text")
  isDefault     Boolean @default(false) @map("is_default")
  createdAt     DateTime
  updatedAt     DateTime
  createdById   String? @db.Uuid
  tenant Tenant @relation(...)
  @@index([tenantId, documentType])
  @@map("billing_document_templates")
}
```

**Wichtig:** `documentType` ist vom Typ `BillingDocumentType` — neue Dokumenttypen für Mahnungen würden in diesem Enum landen, sonst muss das Feld angepasst werden.

### Placeholder-Ersetzung — Regex, eigener Parser

`src/lib/services/billing-document-service.ts:20-52` — `resolveTemplatePlaceholders()`:
- Regex `/\{\{(\w+)\}\}/gi`, case-insensitive
- **Kein** Liquid, **kein** Handlebars
- Unbekannte Platzhalter → leerer String

### Aktuelle Platzhalter (fest codiert)

DE: `{{briefanrede}}, {{anrede}}, {{titel}}, {{vorname}}, {{nachname}}, {{firma}}`
EN: `{{lettersalutation}}, {{salutation}}, {{title}}, {{firstname}}, {{lastname}}, {{company}}`

**Keine Platzhalter für Beträge, Datumsangaben, Rechnungsnummern** im Document-Template (die gibt es nur im Email-Template-System, siehe unten).

### Zuordnung Header/Footer pro Dokumenttyp

- Ein Template gehört zu **einem** `documentType` (oder `null` = alle)
- Nur `isDefault=true` pro `tenantId + documentType` wird automatisch geladen
- `listByType()`, `getDefault()` Service-Funktionen

### Service / Router / UI

- Service: `src/lib/services/billing-document-template-service.ts` — `list`, `getById`, `listByType`, `getDefault`, `create`, `update`, `remove`
- Router: `src/trpc/routers/billing/documentTemplates.ts` — Permissions: `billing_documents.view` / `billing_documents.edit`, `requireModule("billing")`
- UI-Komponenten: `src/components/billing/template-list.tsx`, `src/components/billing/template-form-sheet.tsx` (mit `RichTextEditor` für Texte)
- Route: `/orders/templates` (siehe sidebar-nav-config, Abschnitt 12)

---

## 6. E-Mail-Infrastruktur

### Zentraler Service

`src/lib/services/email-send-service.ts` — `send()` (lines 77-162+):
- Lädt `BillingDocument` / `PurchaseOrder`
- Baut Placeholder-Kontext
- Lädt PDF aus Storage (`DocumentPdfNotFoundError` bei Fehlen)
- Sendet via `nodemailer` mit Attachment
- Schreibt `EmailSendLog`-Eintrag

Supporting: `getDocumentData()`, `buildPlaceholderContext()`, `getDocumentEmailContext()`, `getSendLog()`.

### SMTP-Konfiguration pro Mandant — `TenantSmtpConfig`

Felder: `id`, `tenantId` (unique), `host`, `port` (default 587), `username`, `password`, `encryption` (`STARTTLS | SSL | NONE`), `fromEmail`, `fromName`, `replyToEmail`, `isVerified`, `verifiedAt`, `createdAt`, `updatedAt`.

Service: `src/lib/services/email-smtp-config-service.ts` mit `createTransporter()` (nodemailer-Instanz pro Tenant).

### PDF-Attachment

Integriert in `email-send-service.ts:send()` (lines 95-104): PDF-Blob → Buffer → Attachment. Filename wird sanitized, `contentType: "application/pdf"`.

### EmailSendLog

Felder: `id, tenantId, documentId, documentType, toEmail, ccEmails (text[]), subject, bodyHtml, templateId, status, errorMessage, sentAt, retryCount, nextRetryAt, sentBy, createdAt, updatedAt`

Status: `pending | retrying | sent | failed`

Repository: `src/lib/services/email-send-log-repository.ts` — `create, findByDocumentId, findRetryable, markSent, markFailed, markRetrying`

### Retry

Cron: `src/app/api/cron/email-retry/route.ts` — alle 5 Minuten.
- Max 3 Retries
- Backoff: `[60s, 300s, 900s]` (getNextRetryAt in email-send-service.ts:31-34)
- Lädt `findRetryable()`, re-sendet, aktualisiert Status

### EmailTemplate (≠ BillingDocumentTemplate)

Separates Modell `EmailTemplate` mit Feldern `tenantId, documentType, name, subject, bodyHtml, isDefault`.
Service: `src/lib/services/email-template-service.ts`
Placeholder-Resolver: `src/lib/services/email-placeholder-resolver.ts:18-26` mit Liquid-ähnlichen `{Kundenname}, {Anrede}, {Dokumentennummer}, {Betrag}, {Fälligkeitsdatum}, {Firmenname}, {Projektname}`.
Defaults: `src/lib/email/default-templates.ts` (8 Dokumenttypen: INVOICE, OFFER, ORDER_CONFIRMATION, CREDIT_NOTE, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, PURCHASE_ORDER) — **Mahnung fehlt**.

Router: `src/trpc/routers/email/send.ts` — `getContext, send, sendLog`, Permission `documents.send`.

---

## 7. CrmCorrespondence

### Modell (`prisma/schema.prisma:660-687`)

Felder: `id, tenantId, addressId, direction (CrmCorrespondenceDirection), type (String), date, contactId, inquiryId, fromUser, toUser, subject, content, createdAt, updatedAt, createdById`
Relations: `tenant, address, contact, inquiry, correspondenceAttachments`

### Typen — String, kein Enum

Schema-Kommentar legt fest: `"phone", "email", "letter", "fax", "visit"`. Es gibt **keinen Prisma-Enum**, das Feld ist ein `String`.

### Direction-Enum

```
enum CrmCorrespondenceDirection { INCOMING, OUTGOING, INTERNAL }
```

### Service + Router

Service: `src/lib/services/crm-correspondence-service.ts` — `list, getById, create, update, remove`
Router: `src/trpc/routers/crm/correspondence.ts:92-107` — `create`-Procedure:

```typescript
create: crmProcedure
  .use(requirePermission(CORR_CREATE))
  .input(createInput)
  .mutation(async ({ ctx, input }) => {
    return await crmCorrespondenceService.create(
      ctx.prisma, ctx.tenantId!, input, ctx.user!.id,
      { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
    )
  })
```

### Automatische Einträge heute

**Keine.** Grep nach `correspondence.create` / `createCorrespondence` hat keine Aufrufe außerhalb des Routers ergeben. Es gibt keinen Trigger beim Rechnungsversand, beim Email-Send, etc.

### UI

`src/components/crm/correspondence-list.tsx` — Tabelle mit Filtern, `CorrespondenceFormSheet` für Create/Update. Eingebunden im Kunden-Detail-Tab `correspondence`.

---

## 8. Cron-Infrastruktur

### Alle 14 Cron-Routes (`src/app/api/cron/*/route.ts`)

| Route | Zweck |
|---|---|
| `calculate-days` | Tagesmetriken |
| `calculate-months` | Monats-Zyklus |
| `dsgvo-retention` | DSGVO-Retention |
| `email-imap-poll` | IMAP-Poll Eingangsrechnungen |
| `email-retry` | Re-Send fehlgeschlagene E-Mails |
| `execute-macros` | Makro-Ausführung |
| `expire-demo-tenants` | Demo-Mandanten ablaufen lassen |
| `export-template-schedules` | Geplante Export-Läufe |
| `generate-day-plans` | Wöchentliche Tagespläne |
| `inbound-invoice-escalations` | Eskalations-Benachrichtigungen bei Rechnungsfreigabe |
| `platform-cleanup` | Platform-Cleanup |
| `platform-subscription-autofinalize` | Autofinalisierung Platform-Subscription-Rechnungen |
| `recurring-invoices` | Wiederkehrende Rechnungen generieren |
| `wh-corrections` | Lager-Korrekturen |

### vercel.json — Schedules

```
recurring-invoices                    04:00 UTC täglich
platform-subscription-autofinalize    04:15 UTC täglich
expire-demo-tenants                   01:00 UTC täglich
calculate-days                        02:00 UTC täglich
calculate-months                      03:00 am 2. jeden Monats
generate-day-plans                    01:00 UTC sonntags
wh-corrections                        06:00 UTC täglich
execute-macros                        alle 15 min
email-retry                           alle  5 min
email-imap-poll                       alle  3 min
platform-cleanup                      alle  5 min
inbound-invoice-escalations           stündlich
```

### CRON_SECRET-Check — dupliziert

Jede Route enthält diesen Block, **kein geteilter Helper**:

```typescript
const authHeader = request.headers.get("authorization")
const cronSecret = process.env.CRON_SECRET
if (!cronSecret) return NextResponse.json({ error: "Service unavailable" }, { status: 503 })
if (authHeader !== `Bearer ${cronSecret}`) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}
```

### Pattern „nur Benachrichtigen, nicht mutieren"

- **`inbound-invoice-escalations`** ist das nächste Vorbild: findet überfällige PENDING-Approval-Steps, 24h-Cooldown, legt `Notification`-Einträge an, setzt `lastReminderAt`-Timestamp (metadaten-mutation). Kein Business-Mutate.
- **`email-imap-poll`** legt Notifications nur nach 3+ consecutive failures an.
- **`recurring-invoices`** mutiert (nutzt `CronCheckpoint` für Idempotenz) — nicht nur Kandidatenliste.
- **`expire-demo-tenants`** mutiert tatsächlich (`isActive=false`).

Beispiel-Call-Site für Notification-Erstellung (`inbound-invoice-escalations/route.ts:86-97`):

```typescript
await prisma.notification.create({
  data: {
    tenantId, userId,
    type: "reminders",
    title: "Erinnerung: Rechnung wartet auf Freigabe",
    message: `Rechnung ${step.invoice.number} wartet seit über 24h auf Ihre Freigabe`,
    link: `/invoices/inbound/${step.invoiceId}`,
  },
})
```

---

## 9. Notifications (Dashboard-Benachrichtigungen)

### Modell (`prisma/schema.prisma:3105-3126`)

```prisma
model Notification {
  id        String    @id @db.Uuid
  tenantId  String    @map("tenant_id") @db.Uuid
  userId    String    @map("user_id") @db.Uuid
  type      String    @db.VarChar(20)
  title     String    @db.VarChar(255)
  message   String    @db.Text
  link      String?   @db.Text
  readAt    DateTime? @map("read_at")
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  // Indizes auf userId+readAt, userId+createdAt, tenantId+userId+createdAt
  @@map("notifications")
}
```

### Typen (nur 4, als String, kein Enum)

`approvals, errors, reminders, system`

Aus `src/components/layout/notifications.tsx:32-37`:

```typescript
const notificationIcons = {
  approvals: CheckCircle,
  errors: AlertTriangle,
  reminders: Clock,
  system: Settings,
}
```

`NotificationPreference` hat analog: `approvalsEnabled, errorsEnabled, remindersEnabled, systemEnabled`.

### Services / UI

- Service: `src/lib/services/notification-service.ts` — `list, markRead, markAllRead, unreadCount, getPreferences, updatePreferences`
- Repository: `src/lib/services/notification-repository.ts`
- Bell-Komponente: `src/components/layout/notifications.tsx` (lines 50-168)

### Deep-Link-Support

Feld `link` (Text, nullable). Nutzung: Relative Pfade wie `/invoices/inbound/{id}` — funktioniert, keine externe URL-Validierung.

---

## 10. Mandanten-Settings für Billing

### Modell (`prisma/schema.prisma:982-1011`) — `BillingTenantConfig`

Felder: `id, tenantId (unique), companyName, companyAddress, logoUrl, bankName, iban, bic, taxId, commercialRegister, managingDirector, footerHtml, phone, email, website, taxNumber, leitwegId, eInvoiceEnabled, companyStreet, companyZip, companyCity, companyCountry (default "DE"), createdAt, updatedAt`

**Mahnwesen-relevante Felder heute: keine.** Weder `dunningEnabled`, `defaultDunningLevels`, `dunningInterestRate`, noch ein zweites `BillingDunningConfig`-Modell.

### Service/Repository

- `src/lib/services/billing-tenant-config-service.ts` — `upsert(prisma, tenantId, input, audit)` mit allen Feldern als optional
- `src/lib/services/billing-tenant-config-repository.ts` — delegiert an Prisma upsert

### UI

- Route: `src/app/[locale]/(dashboard)/admin/billing-config/page.tsx`
- Komponente: `src/components/billing/tenant-config-form.tsx` (lines 19-37 für Field-State)

### Pattern für neue Felder

1. Migration: Feld in `billing_tenant_configs` ergänzen
2. `schema.prisma` → BillingTenantConfig-Modell
3. Service `upsert()`-Input erweitern
4. Repository-Upsert-Objekt erweitern
5. Form-State im Component + Form-Binding

Letztes Beispiel: `eInvoiceEnabled` (Bool, default false).

---

## 11. Berechtigungen

### Permission Catalog

`src/lib/auth/permission-catalog.ts` — statisches Array `ALL_PERMISSIONS`, UUIDv5 mit Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`.

### Billing-Namespace — vollständige Liste

```
billing_documents.view / create / edit / delete / finalize
billing_service_cases.view / create / edit / delete
billing_payments.view / create / cancel
billing_price_lists.view / manage
billing_recurring.view / manage / generate
```

### Dunning/Mahn-Permissions heute

**Keine.** Grep nach `dunning.*`, `reminder.*`, `mahnung.*` im Katalog → keine Treffer. (`reminders`-String existiert nur als Notification-Typ bzw. `notifications.manage`.)

### Enforcement-Pattern in tRPC

`src/lib/auth/middleware.ts:40-59`:

```typescript
export function requirePermission(...permissionIds: string[]) {
  return createMiddleware(async ({ ctx, next }) => {
    const user = (ctx as AuthenticatedContext).user
    if (!user) throw new TRPCError({ code: "UNAUTHORIZED", ... })
    if (!hasAnyPermission(user, permissionIds)) throw new TRPCError({ code: "FORBIDDEN", ... })
    return next({ ctx })
  })
}
```

Verwendung: `protectedProcedure.use(requirePermission(permissionIdByKey("billing_documents.view")))`.

Weitere: `requireSelfOrPermission`, `requireEmployeePermission`, `applyDataScope`.

---

## 12. UI-Patterns

### Multi-Select mit Set<string>

`src/components/billing/document-print-dialog.tsx:58-79`:

```typescript
const [selectedPositionIds, setSelectedPositionIds] = React.useState<Set<string>>(new Set())
React.useEffect(() => {
  if (stockPreview?.positions) {
    const eligible = stockPreview.positions
      .filter((p) => p.stockTrackingEnabled === true)
      .map((p) => p.positionId as string)
    setSelectedPositionIds(new Set(eligible))
  }
}, [stockPreview])
```

Zweite Instanz mit Set-Aggregation: `src/components/billing/document-list.tsx:64-70`. Es gibt **keine zentralisierte DataTable-Komponente mit Bulk-Action** — das Pattern wird pro Feature neu implementiert (konsistent mit der Wahrnehmung aus dem SEPA-Feature).

### Offene-Posten-Seite

`src/components/billing/open-item-list.tsx` — Tabelle mit:
- Filter: Search, Status-Select (`all/open/partial/paid/overdue`)
- Paging (25/Seite)
- Spalten: Belegnr., Kundenfirma, Belegdatum, Fälligkeit, Brutto, Bezahlt, Offen, Payment-Status-Badge
- Row-Click → Detail-Seite

### Shadcn-Komponenten in Billing-UIs (Standard-Imports)

`button, card, checkbox, dialog, input, label, alert, radio-group, tabs, table, tooltip, select, textarea, switch, confirm-dialog, badge, rich-text-editor`

### Sidebar (`src/components/layout/sidebar/sidebar-nav-config.ts:342-387`)

```typescript
{
  titleKey: 'billingSection',
  module: 'billing',
  items: [
    { titleKey: 'billingDocuments',          href: '/orders/documents',    permissions: ['billing_documents.view'] },
    { titleKey: 'billingServiceCases',       href: '/orders/service-cases', permissions: ['billing_service_cases.view'] },
    { titleKey: 'billingOpenItems',          href: '/orders/open-items',    permissions: ['billing_payments.view'] },
    { titleKey: 'billingPriceLists',         href: '/orders/price-lists',   permissions: ['billing_price_lists.view'] },
    { titleKey: 'billingRecurringInvoices',  href: '/orders/recurring',     permissions: ['billing_recurring.view'] },
    { titleKey: 'billingTemplates',          href: '/orders/templates',     permissions: ['billing_documents.view'] },
  ]
}
```

`billingConfig` ist separat als `/admin/billing-config`.

---

## 13. Zinsberechnung, Money-Typen, Datum

### Money-Repräsentation

- **Billing:** `Float` im Prisma-Schema (`totalGross, totalVat, subtotalNet, amount`). Manuelles Rounding über `Math.round(x * 100) / 100`.
- **Payroll:** `Decimal(10, 2)` (höhere Präzision)
- **Keine** `decimal.js`-Library in `package.json`
- **Keine** Cents-in-Integer-Konvention
- **Kein** zentraler `formatCurrency`-Helper — jede Komponente definiert lokal mit `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })`

### Verzugszins/Interest-Berechnung

**Existiert nicht im Code.** Keine Funktion für Verzugszinsen, Zinsberechnung, BGB §288 o.ä. Grep nach `interest, zins, verzug` → keine Business-Logik-Treffer im Billing.

### Datum

- `date-fns@^4.1.0` in `package.json:87`
- Mix aus date-fns und nativem `Date`, z.B. in `billing-document-einvoice-service.ts:89-125`:

```typescript
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
const dueDate = addDays(doc.documentDate, doc.paymentTermDays ?? 30)
```

Fällt auf: `paymentTermDays ?? 30` als Default im XRechnung-Flow — dieselbe Rechnung kann in der UI als "kein Fälligkeitsdatum" und in XRechnung als "30 Tage" erscheinen.

---

## 14. NumberSequence

### Modell

```prisma
model NumberSequence {
  id, tenantId, key (VARCHAR 50), prefix (VARCHAR 20, default ""), nextValue (Int, default 1)
  createdAt, updatedAt
  @@unique([tenantId, key])
  @@map("number_sequences")
}
```

### Consumption-Service

`src/lib/services/number-sequence-service.ts:61-74`:

```typescript
export async function getNextNumber(prisma, tenantId, key): Promise<string> {
  const defaultPrefix = DEFAULT_PREFIXES[key] ?? ""
  const seq = await prisma.numberSequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { nextValue: { increment: 1 } },
    create: { tenantId, key, prefix: defaultPrefix, nextValue: 2 },
  })
  return `${seq.prefix}${seq.nextValue - 1}`
}
```

Race-sicher durch atomaren Upsert-Increment.

### Belegte Keys/Prefixes (`number-sequence-service.ts:35-59`)

```
customer          K-
supplier          L-
inquiry           V-
offer             A-
order_confirmation AB-
delivery_note     LS-
service_note      LN-
return_delivery   R-
invoice           RE-
credit_note       G-
service_case      KD-
article           ART-
purchase_order    BE-
inbound_invoice   ER-
stocktake         INV-
payment_run       PR-
```

**Frei:** `dunning`, `mahnung`, `reminder`, `MA-`. Prefix `M-` ebenfalls frei (`R-` für `return_delivery`).

---

## 15. Tests

### Vorhandene Test-Dateien

Service-Tests (`src/lib/services/__tests__/`):
- `billing-document-service.test.ts`
- `billing-document-einvoice-service.test.ts`
- `billing-payment-service.test.ts`
- `billing-price-list-service.test.ts`
- `billing-recurring-invoice-service.test.ts`
- `billing-service-case-service.test.ts`

Router-Tests (`src/trpc/routers/__tests__/`):
- `billingDocuments-router.test.ts`
- `billingDocumentsEInvoice-router.test.ts`
- `billingPayments-router.test.ts`
- `billingDocumentTemplates-router.test.ts`

### Seed-/Mock-Pattern

**Keine Factory-Funktionen.** Mock-Objekte werden pro Test inline deklariert (z.B. `billing-document-service.test.ts:19-74` — mockAddress, mockDocument als hardcoded Literals).

### PDF/Email-Integrationstests

**Keine dedizierten Integrationstests** für PDF-Generierung oder E-Mail-Versand. Services haben Unit-Tests mit Vitest-Mocks.

### Cron-Route-Tests

Vorhanden: `src/app/api/cron/calculate-days/__tests__/route.test.ts` (Muster). Pattern:
- Vitest `describe/it`
- Fixe Referenzdaten (z.B. `2026-03-08T12:00:00Z`)
- Helper-Funktionen getestet (`computeDateRange`)
- Mock-Tenants

---

## 16. i18n

### Dateien

- `messages/de.json` (8132 Zeilen)
- `messages/en.json` (8132 Zeilen)

### Vorhandene Top-Level-Keys im Billing-Kontext

```
billingDocuments
billingOpenItems
billingPriceListEntries
billingPriceLists
billingRecurring
billingServiceCases
billingTemplates
billingConfig
```

### Sidebar-Keys (`nav.*`)

```
nav.billingSection          "Fakturierung"
nav.billingDocuments        "Belege"
nav.billingServiceCases     "Kundendienst"
nav.billingOpenItems        "Offene Posten"
nav.billingPriceLists       "Verkaufspreislisten"
nav.billingRecurringInvoices "Wiederkehrende Rechnungen"
nav.billingTemplates        "Vorlagen"
nav.billingConfig           "Briefpapier"
```

### Mahnwesen-Keys

**Keine.** Der einzige Kontext mit „Erinnerung"/„reminder" ist HR (`hrPersonnelFile.categoryReminders`, `hrPersonnelFile.reminder`, `hrPersonnelFile.reminderDate` — nicht Billing).

### Neuer Namespace

Zugriff per `useTranslations('billingDunning')` — neue Top-Level-Keys in beiden JSON-Dateien ergänzen.

---

## 17. Existierende Mahnwesen-Spuren

### Grep-Ergebnisse

**Keine Code-Treffer** für: `dunning`, `mahnung`, `mahnstufe`, `dunningLevel`, `reminderLevel`, `verzugszins`, `mahngebühr`, `mahnsperre`.

(„reminder" trifft HR-Personalakte und den `reminders`-Notification-Typ — keine Mahnwesen-Relevanz.)

### Dokumente (kein Code)

- `thoughts/shared/tickets/ZMI-TICKET-162-mahnwesen.md` — **vollständige Feature-Spec** (100 Zeilen) mit Tabellen `dunning_levels` (level, days_after_due, fee, interest_rate, email_template_id, auto_send) und `dunning_entries` (dunning_level_id, fee_amount, interest_amount, total_outstanding, status, paused_reason, sent_at). Status `Proposed`, P3, Epic „Phase 7 Finanzen". **Blocked by: ZMI-TICKET-132 (Rechnungen/Zahlungen), ZMI-TICKET-141 (E-Mail-Versand).** Schlägt Permissions `dunning.view, dunning.manage, dunning.send` vor.
- `thoughts/shared/tickets/ZMI-TICKET-163-zahlungsbedingungen.md` — verwandt (Zahlungsbedingungen)
- Kurze Erwähnungen in: `README.md`, `docs/TERP_HANDBUCH.md`, `TERP_BUSINESS_CAPABILITIES.md`, `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md`

### TODOs/FIXMEs

**Keine** TODO/FIXME-Kommentare im Code, die Mahnwesen erwähnen.

### Libraries

**Keine** Mahnwesen- oder Invoice-Automation-Library in `package.json`.

---

## Risiken und Überraschungen

### R1. `openAmount` ist nicht persistiert — Cron-Performance

`isOverdue`, `openAmount`, `dueDate`, `paymentStatus` werden **ausschließlich live in `enrichOpenItem()`** berechnet (`billing-payment-service.ts:75-98`). `listOpenItems()` lädt alle Invoices im `status ∈ {PRINTED, PARTIALLY_FORWARDED, FORWARDED}`, joined Payments und CreditNotes, filtert in Memory. Das bedeutet für einen täglichen Mahn-Cron, dass jeder Durchlauf einen Full-Scan aller jemals finalisierten Rechnungen pro Mandant macht, multipliziert über Mandanten. Bei Wachstum wird das linear teurer. Es gibt keinen Index auf „offen & überfällig".

### R2. `dueDate` ist ebenfalls nicht persistiert — und nullable

`dueDate = documentDate + paymentTermDays`, aber `paymentTermDays` darf `null` sein. Rechnungen mit `paymentTermDays = null` gelten in `isOverdue()` **nie als überfällig**. Anzahl solcher Rechnungen pro Mandant ist unbekannt — je nach Datenstand kann das eine ganze Rechnungsklasse aus dem Mahnwesen ausschließen. Gleichzeitig nutzt `billing-document-einvoice-service.ts` stillschweigend `paymentTermDays ?? 30` als Default, d.h. dieselbe Rechnung kann in UI/Cron als „kein Due-Date" und in XRechnung als „30 Tage" auftauchen.

### R3. Money-Typ `Float` — Skonto und Zinsen rechnen in Float

Sowohl `BillingPayment.amount` als auch `BillingDocument.totalGross` sind **Prisma-Float** (IEEE-754). Das ganze Skonto-System rundet manuell mit `Math.round(x * 100) / 100`. Verzugszinsen (tagesgenau × Tagessatz × Restbetrag) würden in demselben Typ passieren. Das Payroll-Modul verwendet Decimal(10,2), aber Billing nicht — ein Typ-Split mitten im Feature oder ein Migration-Touch wäre die Konsequenz.

### R4. Mahnfähige Belegtypen

`BillingDocumentType` enthält `OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, SERVICE_NOTE, RETURN_DELIVERY, INVOICE, CREDIT_NOTE`. `listOpenItems()` filtert explizit auf `type=INVOICE`. `CREDIT_NOTE` wird im Open-Amount als Reduktion berücksichtigt (`childDocuments` via `parentDocumentId`). `SERVICE_NOTE` („Leistungsnachweis") ist nicht als zahlungsrelevant eingestuft, obwohl es einen Leistungsbezug hat. Der aktuelle Code behandelt **nur INVOICE als mahnfähig** — explizite Entscheidung.

### R5. Skonto + Mahnung — Konfliktpotenzial

Skonto-Tier 2 darf bis zu `discountDays2` nach Belegdatum gewährt werden. Wenn `discountDays2 > paymentTermDays` (z.B. 30/60), kann eine Rechnung nach Fälligkeit mit Skontoabzug bezahlt werden, obwohl sie bereits technisch überfällig ist. `isOverdue()` kennt Skonto nicht. Eine Mahnung, die zwischen Skonto-Grenze und Zahlung verschickt wird, könnte zu „Kunde hat gezahlt, aber mit Abzug" führen. Das Flag `isDiscount=true` bei Payment und die `ACTIVE/CANCELLED`-States bieten nur eine rückwirkende Reaktion (Mahnung stornieren).

### R6. Status-Workflow von BillingDocument

`BillingDocumentStatus = {DRAFT, PRINTED, PARTIALLY_FORWARDED, FORWARDED, CANCELLED}` — **kein `PAID`-Status, kein `IN_REMINDER`-Status**. Die „Bezahltheit" ist ein abgeleiteter Wert (`paymentStatus` aus `enrichOpenItem`). Wenn Mahnwesen den Dokumentstatus erweitern soll (z.B. um „Mahnstufe 2"), kollidiert das mit dem bestehenden Workflow `DRAFT → PRINTED → FORWARDED → CANCELLED`, der nur zwischen Draft und Versand unterscheidet. Alternative: separate Mahn-Tabelle + Denormalisierung auf BillingDocument (noch nicht vorhanden).

### R7. Wiederkehrende Rechnungen (`BillingRecurringInvoice`)

Der `recurring-invoices`-Cron (04:00 UTC) erzeugt neue `BillingDocument` mit `type=INVOICE`. Deren Payments und Fälligkeit laufen durch denselben Code wie manuelle Rechnungen. Für das Mahnwesen heißt das: sie werden **genauso behandelt** — es gibt keinen Marker „automatisch generiert, Mahnwesen skippen". Die `internalNotes` tragen aber bereits einen `[platform_subscription:<id>]`-Marker für Platform-Subscription-Rechnungen (siehe CLAUDE.md, Phase 10a). Eine ähnliche Ausnahmeregel müsste explizit für Mahnwesen eingebaut werden — oder nicht.

### R8. CrmCorrespondence-Typ ist String, kein Enum

Das `type`-Feld ist ein `String` mit Konvention `"phone" | "email" | "letter" | "fax" | "visit"`. Ein Mahn-Eintrag könnte diese Konvention brechen (z.B. `type="dunning"`), oder sich als `"email"`/`"letter"` tarnen. Es gibt keine DB-constraint.

### R9. EmailTemplate vs. BillingDocumentTemplate — zwei Template-Systeme

- `BillingDocumentTemplate` (headerText/footerText, regex `{{key}}`, 6 DE-Platzhalter) für PDF
- `EmailTemplate` (subject/bodyHtml, Liquid-ähnlich `{Kundenname}, {Betrag}, {Fälligkeitsdatum}`) für E-Mail

Diese beiden Systeme teilen keinen Code und keine Platzhalter. Eine Mahnung bräuchte in beiden einen neuen `documentType`-Wert (oder eine Sonderbehandlung), bzw. ein drittes System nur für Mahn-Briefe.

### R10. `BillingDocumentType`-Enum wird von vielen Stellen genutzt

`BillingDocumentType` ist referenziert von: `BillingDocument.type`, `BillingDocumentTemplate.documentType`, `EmailTemplate.documentType`, `EmailSendLog.documentType`, `default-templates.ts`, `number-sequence-service.ts`-Keys, `pdf-storage.ts`-Pfadmuster, `sidebar-nav-config.ts` indirekt über Permissions. Das Enum zu erweitern (z.B. `DUNNING_REMINDER`) hat Fan-out.

### R11. `CRON_SECRET`-Check ist dupliziert

Kein geteilter Helper. Ein neuer Mahn-Cron wird denselben Block wie die anderen 14 Cron-Routes enthalten.

### R12. Keine PDF/Email-Integrationstests

Kein Cron-Route oder Service im Billing-Bereich hat einen End-to-End-Test mit echter PDF-Erzeugung oder SMTP. Die Test-Pyramide für Mahnwesen muss entweder diese Lücke akzeptieren oder schließen.

### R13. `isDefault=true` uniqueness pro Template-Typ

`BillingDocumentTemplate` hat `@@index([tenantId, documentType])`, aber **kein `@@unique`**. Die Konvention „ein Default pro Mandant+Type" wird im Service-Code durchgesetzt, nicht in der DB. Bei Mehrstufen-Mahnung mit eigenen Texten pro Stufe müsste das entweder parametrisiert werden (z.B. `level`-Feld) oder neue Dokumenttypen pro Stufe erzeugen.

### R14. Notification-Typ-Set ist implizit geschlossen

Die 4 Typen `approvals/errors/reminders/system` sind als String gespeichert, aber UI (`notificationIcons`) und `NotificationPreference`-Felder sind hart codiert. Ein neuer Typ „dunning" würde in der UI als „keine Icon, keine Preference" erscheinen, bis beide Stellen erweitert werden.

### R15. Mahnwesen-Permissions noch nicht registriert

ZMI-TICKET-162 schlägt `dunning.view / manage / send` vor, aber das ist nicht im `permission-catalog.ts` — UUID-Generierung erfolgt deterministisch aus dem Key, d.h. eine nachträgliche Umbenennung invalidiert alle bereits vergebenen Rollen.

---

## Code References

- `prisma/schema.prisma:443-495` — `CrmAddress`
- `prisma/schema.prisma:660-687` — `CrmCorrespondence`
- `prisma/schema.prisma:834-914` — `BillingDocument`
- `prisma/schema.prisma:982-1011` — `BillingTenantConfig`
- `prisma/schema.prisma:1080-1102` — `BillingPayment`
- `prisma/schema.prisma:3105-3126` — `Notification`
- `src/lib/services/billing-payment-service.ts:34-160` — Open-Items-Logik, isOverdue, Payment-Status
- `src/lib/billing/payment-discount.ts` — Skonto-Tiers
- `src/lib/services/billing-document-service.ts:20-52` — Placeholder-Resolver (regex)
- `src/lib/services/billing-document-pdf-service.ts` — PDF-Generierung
- `src/lib/pdf/billing-document-pdf.tsx` — React-PDF-Template
- `src/lib/pdf/pdf-storage.ts:27-46` — Storage-Pfade
- `src/lib/services/billing-document-einvoice-service.ts:89-125` — addDays, XRechnung
- `src/lib/services/email-send-service.ts:31-162` — Send-Flow mit Retry-Backoff
- `src/lib/services/email-send-log-repository.ts` — Send-Log-CRUD
- `src/app/api/cron/email-retry/route.ts` — Retry-Cron
- `src/app/api/cron/inbound-invoice-escalations/route.ts:86-97` — Notification-Pattern
- `src/lib/services/notification-service.ts` + `notification-repository.ts`
- `src/components/layout/notifications.tsx:32-168` — Bell-UI
- `src/lib/services/number-sequence-service.ts:35-74` — Sequence-Consumption
- `src/lib/auth/permission-catalog.ts` — Berechtigungen
- `src/lib/auth/middleware.ts:40-59` — requirePermission
- `src/components/billing/open-item-list.tsx` — Offene-Posten-UI
- `src/components/billing/document-print-dialog.tsx:58-79` — Set<T>-Multi-Select
- `src/components/layout/sidebar/sidebar-nav-config.ts:342-387` — Sidebar-Fakturierung
- `messages/de.json` + `messages/en.json` — 8132 Zeilen, Namespaces `billingDocuments, billingOpenItems, …`
- `vercel.json` — Cron-Schedules
- `package.json:71,87` — `@react-pdf/renderer`, `date-fns`

## Historischer Kontext (aus thoughts/)

- `thoughts/shared/tickets/ZMI-TICKET-162-mahnwesen.md` — Proposed Feature-Spec mit Tabellen-Entwurf (`dunning_levels`, `dunning_entries`), BGB §288 Verzugszinsen, Permissions-Vorschlag, Blocked-by-Kette zu Rechnungen/E-Mail.
- `thoughts/shared/tickets/ZMI-TICKET-163-zahlungsbedingungen.md` — benachbart: Zahlungsbedingungen-Konfiguration.
- `thoughts/shared/plans/2026-04-10-platform-subscription-billing.md` — Referenzarchitektur für „Cron erzeugt Rechnungen mit Marker in `internalNotes`", derselbe Mechanismus könnte für Mahn-Ursprungs-Tracking genutzt werden.
- `thoughts/shared/research/2026-04-02-email-smtp-infrastructure.md` — detaillierter Hintergrund zum SMTP-/Send-Log-Stack.

## Related Research

- `thoughts/shared/research/2026-04-02-email-smtp-infrastructure.md`
- `thoughts/shared/research/2026-04-12_19-55-28_sepa-zahlungslaeufe-bestandsaufnahme.md` (SEPA-Feature, strukturell ähnlich: Cron-Kandidatenliste + Multi-Select-UI + PDF + E-Mail)
- `thoughts/shared/research/2026-04-12_15-34-14_inbound-invoice-order-costcenter-bestandsaufnahme.md` (zeigt den `inbound-invoice-escalations`-Cron-Pattern)

## Offene Fragen

Keine — reine Bestandsaufnahme. Die unter „Risiken und Überraschungen" genannten Punkte sind Entscheidungsaufforderungen an die Planungsphase, nicht offene Recherchefragen.
