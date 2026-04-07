---
date: 2026-04-07T18:30:00+02:00
researcher: Claude Code
git_commit: 94d17d37497a3fea0c792c0c97b7b005c24f677f
branch: staging
repository: terp
topic: "Terp Invoice Phase 1 — Eingangsrechnungen (Empfang, Erfassung, Freigabe, Export)"
tags: [research, codebase, invoice, eingangsrechnungen, imap, zugferd, xrechnung, datev, approval-workflow]
status: complete
last_updated: 2026-04-07
last_updated_by: Claude Code
---

# Research: Terp Invoice Phase 1 — Eingangsrechnungen

**Date**: 2026-04-07T18:30:00+02:00
**Git Commit**: 94d17d37
**Branch**: staging

## Executive Summary

Phase 1 baut ein Eingangsrechnungs-Modul mit vier Pfeilern: IMAP-Empfang, ZUGFeRD/XRechnung-Parsing, mehrstufiger Freigabe-Workflow und DATEV-Export. Die Codebase liefert für jeden Pfeiler direkt übertragbare Patterns:

- **IMAP-Empfang**: Spiegelt 1:1 die bestehende SMTP-Config (Service/Repository/Router/Cron). `imapflow` + `mailparser` als Libraries, UID-basiertes Tracking, neuer Cron `/api/cron/email-imap-poll`.
- **ZUGFeRD-Parsing**: Kein Node.js-Parser-Paket existiert — eigener Parser mit `fast-xml-parser` + `pdf-lib` für PDF-Attachment-Extraktion. EN16931 ist das dominante Profil seit Jan 2025.
- **Freigabe-Workflow**: Eigene `InboundInvoice` + `InboundInvoiceApproval`-Tabellen. Approval-Steps als First-Class-Records (nicht ein einzelnes Status-Feld). Betragsschwellen-Routing, Vertretung, Ablehnung mit Begründung.
- **DATEV-Export**: Phase 1 exportiert nur Stammdaten (Rechnungskopf) als DATEV-CSV. Keine Buchungssätze.

**Kernentscheidung**: Neue `InboundInvoice`-Tabelle statt Erweiterung von `WhSupplierInvoice` — die bestehende Tabelle hat keines der benötigten Felder (PDF-Pfad, IMAP-Quelle, ZUGFeRD-Daten, Freigabe-Status, DATEV-Export-Status) und dient einem fundamental anderen Workflow.

---

## Teil A — Codebase-Findings

### A1. Email-Versand-Infrastruktur als Vorlage

#### SMTP Config Repository (`src/lib/services/email-smtp-config-repository.ts`)
- `findByTenantId(prisma, tenantId)` — Zeile 3–10. `findUnique({ where: { tenantId } })`. Ein Config-Record pro Tenant.
- `upsert(prisma, tenantId, data)` — Zeile 12–39. Destrukturiert `password` aus `data`, inkludiert es nur wenn explizit übergeben.
- **IMAP-Transfer**: Identisches Pattern für `TenantImapConfig` — `findByTenantId` / `upsert` mit `tenantId` als Unique-Key.

#### SMTP Config Service (`src/lib/services/email-smtp-config-service.ts`)
- `createTransporter(config)` — Zeile 27–40. Konditionales `secure`, `tls`, `auth` basierend auf Config-Feldern.
- `upsert(prisma, tenantId, input, audit?)` — Zeile 54–125. Erkennt Credential-Änderungen via `CREDENTIAL_FIELDS`-Array (Zeile 43), resettet `isVerified` bei Änderung.
- `testConnection(prisma, tenantId)` — Zeile 127–169. Baut Transporter, ruft `verify()`, sendet Test-Email an `fromEmail`, setzt `isVerified: true`.
- **IMAP-Transfer**: `createTransporter` → ImapFlow-Client-Builder. `testConnection` → IMAP-Connect/Disconnect statt `verify()`.

#### SMTP Config Router (`src/trpc/routers/email/smtpConfig.ts`)
- Permissions: `email_smtp.view` (Zeile 8), `email_smtp.manage` (Zeile 9).
- `mapToOutput(config)` — Zeile 26–43. Ersetzt `password` durch `hasPassword: boolean`. Wird nie an den Client gesendet.
- 3 Procedures: `get`, `upsert`, `testConnection` — alle `tenantProcedure.use(requirePermission(...))`.
- **IMAP-Transfer**: 1:1 kopierbar. `email_imap.view` / `email_imap.manage` Permissions, gleiche 3 Procedures.

#### Cron Pattern (`src/app/api/cron/email-retry/route.ts`)
- `runtime = "nodejs"`, `maxDuration = 300` (Zeile 15–16).
- Auth: `Authorization: Bearer ${CRON_SECRET}` — 503 wenn Env fehlt, 401 wenn falsch (Zeile 22–29).
- Cross-Tenant: `findRetryable(prisma, 50)` hat **keinen tenantId-Filter** — verarbeitet alle Tenants in einem Batch (Zeile 35).
- **IMAP-Transfer**: Neuer Cron `/api/cron/email-imap-poll` mit gleichem Guard-Pattern. Iteriert alle Tenant-IMAP-Configs, pollt jedes Postfach.

#### Send Log Repository (`src/lib/services/email-send-log-repository.ts`)
- `create` — Zeile 3–38. Felder: `toEmail`, `ccEmails[]`, `subject`, `bodyHtml`, `status` (default `pending`), `documentId`, `documentType`, `nextRetryAt`.
- Status-Transitionen: `pending` → `sent` / `retrying` → `failed`. Retry-Backoff: `[60s, 300s, 900s]`.
- **IMAP-Transfer**: `inbound_email_log` mit `fromEmail`, `subject`, `messageId` (Dedup), `status` (pending/processed/failed), `receivedAt`.

#### Vercel Cron-Registrierung (`vercel.json`)
- 7 bestehende Crons. Pattern: `{ "path": "/api/cron/email-retry", "schedule": "*/5 * * * *" }` (Zeile 28–31).
- **IMAP-Transfer**: 8. Eintrag: `{ "path": "/api/cron/email-imap-poll", "schedule": "*/3 * * * *" }`.

#### IMAP-Bibliotheken im Repo
- **Keine vorhanden.** Nur `nodemailer@^8.0.4` in dependencies. Kein `imapflow`, `node-imap`, `mailparser`.

#### Storage (`src/lib/supabase/storage.ts`)
- `upload(bucket, path, body, options?)` — Zeile 85–101. Akzeptiert `Buffer | Blob`.
- `download(bucket, path)` — Zeile 75–80. Gibt `Blob | null` zurück.
- `createSignedReadUrl(bucket, path, expiry?)` — Zeile 55–70. Default 3600s.
- `createSignedUploadUrl(bucket, path)` — Zeile 35–50. Für Client-Side-Upload.
- **IMAP-Transfer**: Anhänge via `upload("inbound-invoices", path, buffer, { contentType })`.

---

### A2. Warehouse-Modul: Lieferantenstamm

#### Lieferanten = CrmAddress (`prisma/schema.prisma:302–359`)
Lieferanten sind **keine eigene Tabelle**, sondern `CrmAddress`-Records mit `type = SUPPLIER` oder `BOTH` (Enum `CrmAddressType`: CUSTOMER, SUPPLIER, BOTH).

Relevante Felder:
| Feld | Typ | Vorhanden |
|---|---|---|
| `company` | `VarChar(255)` | ✅ |
| `email` | `VarChar(255)?` | ✅ — direkt auf CrmAddress |
| `taxNumber` | `VarChar(50)?` | ✅ (Steuernummer) |
| `vatId` | `VarChar(50)?` | ✅ (USt-IdNr.) |
| `leitwegId` | `VarChar(50)?` | ✅ (XRechnung Routing-ID) |
| `paymentTermDays` | `Int?` | ✅ |
| `discountPercent` / `discountDays` | `Float?` / `Int?` | ✅ (1 Skonto-Stufe) |
| `street`, `zip`, `city`, `country` | diverse | ✅ |
| IBAN | — | ❌ auf CrmAddress, aber ✅ auf `CrmBankAccount` (Zeile 407–424) |

IBAN lebt auf `CrmBankAccount` (1:n zu CrmAddress): `iban VarChar(34)`, `bic VarChar(11)?`, `bankName?`, `accountHolder?`, `isDefault Boolean`.

**Email-Sender-Matching**: `CrmAddress.email` (Zeile 314) kann direkt für Absender-Matching genutzt werden. Zusätzlich hat `CrmContact` (Ansprechpartner) ein eigenes `email`-Feld (Zeile 380).

#### WhSupplierInvoice (`prisma/schema.prisma:4512–4547`)

Bestehende Felder:
- `number`, `supplierId` (→ CrmAddress), `purchaseOrderId?` (→ WhPurchaseOrder), `status` (OPEN/PARTIAL/PAID/CANCELLED)
- `invoiceDate`, `receivedDate`, `totalNet`, `totalVat`, `totalGross`
- `paymentTermDays`, `dueDate`, 2-stufiger Skonto
- `notes`, `createdById`

**Felder die für Phase 1 FEHLEN:**
| Benötigtes Feld | In WhSupplierInvoice? |
|---|---|
| PDF-Speicherpfad | ❌ |
| IMAP-Quelle (Message-ID, Email) | ❌ |
| ZUGFeRD-XML-Rohdaten | ❌ |
| Erfassungsart (IMAP/Upload/ZUGFeRD) | ❌ |
| Freigabe-Workflow-Status | ❌ |
| DATEV-Export-Status | ❌ |
| Approval-History | ❌ |
| Ablehnungsgrund | ❌ |

**Service-Logik** (`src/lib/services/wh-supplier-invoice-service.ts`):
- Status wird **automatisch aus Zahlungen berechnet** (nicht manuell gesetzt).
- `create()` (Zeile 106–205) erzwingt `taxNumber || vatId` auf dem Lieferanten — passt nicht für automatisierten IMAP-Import wo der Lieferant initial unbekannt sein kann.
- Zahlungs-Logik (Skonto, Teilzahlung) ist eng mit `billing-payment-service.ts` verkoppelt.

#### Empfehlung: Eigene `InboundInvoice`-Tabelle

**Pro eigene Tabelle:**
- Fundamental anderer Lifecycle (IMAP-Empfang → Erfassung → Freigabe → DATEV-Export vs. manuelle Eingabe → Zahlung)
- 8+ Felder fehlen komplett
- Status-Semantik kollidiert (OPEN/PAID vs. DRAFT/PENDING_APPROVAL/APPROVED/EXPORTED)
- Freigabe-Workflow ist ein komplett neues Konzept
- Kein Breaking-Change am bestehenden Warehouse-Modul

**Contra eigene Tabelle:**
- Potentiell doppelte Zahlungsverfolgung wenn Phase 3 SEPA-Zahlungen einführt

**Empfehlung**: Eigene Tabelle. Die Zahlungs-Logik aus `billing-payment-service.ts` (`computePaymentStatus`, `computeDueDate`, `isOverdue`, `getApplicableDiscount`) sind eigenständige Exports und können von beiden Modulen genutzt werden.

---

### A3. Permissions, Tenant-Scoping, Audit

#### Permission-Catalog (`src/lib/auth/permission-catalog.ts`)
- **Naming**: `resource.action` (zwei Teile, Punkt-getrennt). Kein 3-Level-Nesting.
- **UUID-Generierung**: `uuidv5(key, PERMISSION_NAMESPACE)` (Zeile 28). Deterministisch.
- **134 Permissions** über 48 Resource-Gruppen.

**Vorgeschlagene neue Permissions:**

| Key | Beschreibung |
|---|---|
| `inbound_invoices.view` | Eingangsrechnungen ansehen |
| `inbound_invoices.upload` | Manueller Upload |
| `inbound_invoices.edit` | Erfassung/Korrektur |
| `inbound_invoices.approve` | Freigabe erteilen |
| `inbound_invoices.export` | DATEV-Export |
| `inbound_invoices.manage` | Vollzugriff (Löschen, Konfiguration) |
| `email_imap.view` | IMAP-Konfiguration ansehen |
| `email_imap.manage` | IMAP-Konfiguration verwalten |

**Korrektur zum Vorschlag**: `invoices.inbound.*` passt nicht zum bestehenden Naming-Pattern (keine 3-Level-Keys). Besser: `inbound_invoices.*` (Resource = `inbound_invoices`, Action = `view`/`upload`/etc.).

**Gruppen-Zuordnung (Empfehlung):**
| Permission | ADMIN | BUCHHALTUNG | VORGESETZTER | PERSONAL |
|---|---|---|---|---|
| `inbound_invoices.view` | ✅ | ✅ | ✅ | ✅ |
| `inbound_invoices.upload` | ✅ | ✅ | ❌ | ✅ |
| `inbound_invoices.edit` | ✅ | ✅ | ❌ | ✅ |
| `inbound_invoices.approve` | ✅ | ✅ | ✅ | ✅ |
| `inbound_invoices.export` | ✅ | ✅ | ❌ | ❌ |
| `inbound_invoices.manage` | ✅ | ❌ | ❌ | ❌ |
| `email_imap.view` | ✅ | ✅ | ❌ | ❌ |
| `email_imap.manage` | ✅ | ❌ | ❌ | ❌ |

#### Tenant-Scoping in Repositories
- **Pattern A**: Direktes `tenantId` in `where`-Clause. Jede Query enthält `{ tenantId }` als Basis-Filter.
- **Pattern B**: `tenantScopedUpdate` Helper (`src/lib/services/prisma-helpers.ts:33–53`). Ruft `updateMany({ where: { id, tenantId }, data })`, prüft `count > 0`, refetcht dann.
- **Pattern C**: Tenant-Verifikation über Parent-Relation (z.B. `{ id, invoice: { tenantId } }` für WhSupplierPayment).
- **Enforcement**: Repository-Ebene, nicht Service-Ebene. Jede Repository-Funktion bekommt `tenantId` als expliziten Parameter.

#### Audit-Log (`supabase/migrations/20260101000041_create_audit_logs.sql`)
- Tabelle: `audit_logs` mit `tenant_id`, `user_id`, `action` (VARCHAR 20), `entity_type`, `entity_id`, `entity_name`, `changes` (JSONB: `{ field: { old, new } }`), `metadata` (JSONB), `ip_address`, `user_agent`, `performed_at`.
- Service: `src/lib/services/audit-logs-service.ts`
  - `log(prisma, data)` — Zeile 168. Fire-and-forget, fängt alle Fehler.
  - `computeChanges(before, after, fieldsToTrack?)` — Zeile 104–125. Normalisiert Dates/Decimals, vergleicht via `deepEqual`, gibt `{ field: { old, new } }` zurück.
- **Pattern in Services**: `TRACKED_FIELDS`-Array definieren, nach Update `computeChanges` aufrufen, bei Diff `auditLog.log()` mit `.catch()`.
- **AuditContext**: Wird im Router aus `ctx` gebaut: `{ userId, ipAddress, userAgent }`.

---

### A4. Notification-System

#### Architektur
- **Kein zentraler Notification-Write-Service**. Notifications werden direkt via `prisma.notification.create` in Domain-Services geschrieben.
- **Typen**: `"approvals"`, `"errors"`, `"reminders"`, `"system"` (VarChar, kein Enum).
- **Real-Time**: PubSub-Hub mit SSE-Subscription (`notifications.onEvent` in `src/trpc/routers/notifications.ts:280–331`).

#### Fan-Out Patterns
1. **Permission-basiert** (`absences-repository.ts:450–467`): Raw SQL mit `user_groups.permissions @> '["absences.approve"]'::jsonb`. Gibt User-IDs zurück → Loop → eine Notification pro User.
2. **Team-basiert** (`crm-task-service.ts:455–473`): `teamMember.findMany` mit Employee/User-Include.

#### Für Eingangsrechnungen nutzen
- `type: "approvals"` für Freigabe-Benachrichtigungen.
- Fan-Out: Permission-basiert (`inbound_invoices.approve`) oder direkt an den konfigurierten Approver der aktuellen Stufe.
- PubSub-Publish nach Notification-Create für Real-Time-Badge-Update.

#### Reminder/Escalation
- **Existiert nicht** als automatisches Pattern. Kein Cron für Erinnerungen.
- `PersonnelFileEntry.reminderDate` existiert als Konzept, aber ohne automatische Notification-Generierung.
- **Für Phase 1**: Neuer Cron oder Erweiterung des IMAP-Poll-Crons für Escalation-Check (offene Approvals älter als X Stunden → Erinnerung/Eskalation).

---

### A5. Datei-Upload und Storage

#### PDF-Generierung und -Speicherung (`src/lib/services/billing-document-pdf-service.ts`)
- Bucket: `documents` (privat). Signed-URL-Expiry: 60 Sekunden.
- Pfad-Pattern (`src/lib/pdf/pdf-storage.ts:27–36`): `{dokumentTypPfad}/{sanitizedFilename}.pdf`.
- Server-Side-Upload: `storage.upload("documents", path, Buffer.from(buffer), { contentType: "application/pdf", upsert: true })`.
- Pfad (nicht URL) wird in DB gespeichert (`billingDocument.pdfUrl`).

#### Client-Side Upload (3-Step-Pattern)
1. `getUploadUrl` → Service generiert Pfad + Signed Upload URL
2. Client: `fetch(signedUrl, { method: 'PUT', body: file })`
3. `confirmUpload` → Service validiert, erstellt DB-Record

Verwendet in: `article-image-upload.tsx`, `correspondence-attachment-upload.tsx`, `personnel-file-entry-dialog.tsx`.

#### Drag & Drop
- Kein Drittanbieter-Library. Manuell via `onDrop`/`onDragOver` + Hidden `<input type="file">`.
- `FileEntry`-State-Array: `pending | uploading | complete | error`.

#### PDF-Vorschau im Browser
- **Kein eingebetteter PDF-Viewer**. Durchweg `window.open(signedUrl, '_blank')`.
- Für die Eingangsrechnungs-UI (Side-by-Side PDF + Formular) brauchen wir einen eingebetteten Viewer — `<iframe src={signedUrl}>` oder `pdfjs-dist` mit Canvas-Rendering.

#### Bestehende Buckets (`supabase/config.toml:49–81`)
`documents` (10MB, pdf+xml), `tenant-logos` (2MB, Bilder), `avatars` (2MB), `wh-article-images` (5MB), `crm-attachments` (10MB), `hr-personnel-files` (20MB).

---

### A6. tRPC-Router-Struktur

#### Root-Router (`src/trpc/routers/_app.ts`)
- 69 Top-Level-Keys. Flat-Merge via `createTRPCRouter({...})`.
- 5 Composite Sub-Router: `crm`, `billing`, `warehouse`, `hr`, `email`.
- **Neues Modul**: `inboundInvoices` als 6. Composite Sub-Router oder `invoices` mit Sub-Router `inbound`.

#### Sub-Router Pattern (Email als Vorlage: `src/trpc/routers/email/index.ts`)
```
src/trpc/routers/email/
  index.ts          ← createTRPCRouter({ smtpConfig, templates, send })
  smtpConfig.ts
  templates.ts
  send.ts
```

#### Empfohlene Struktur
```
src/trpc/routers/invoices/
  index.ts          ← createTRPCRouter({ inbound, imapConfig, approvalPolicy })
  inbound.ts        ← CRUD + Upload + Approve/Reject + Export
  imapConfig.ts     ← IMAP-Konfiguration (spiegelt smtpConfig.ts)
  approvalPolicy.ts ← Freigabe-Schwellen konfigurieren
```

Mounting in `_app.ts`: `invoices: invoicesRouter`.

---

### A7. UI-Komponenten und Patterns

#### Listen mit Filter/Pagination
- **Keine tanstack-table**. Plain shadcn `Table`/`TableRow`/`TableCell` mit manueller `data.items.map()`.
- Pagination: Client-State `page` → tRPC-Query-Input. Server sliced. `pageSize = 25` hardcoded.
- Filter: `useState('')` für Suche, `useState('ALL')` für Status-Dropdowns. Jeder Filter-Change resettet `setPage(1)`.
- Mobile: Separates Card-Layout bei `sm:hidden`.

#### Sheet/Drawer
- shadcn `Sheet` mit `SheetContent className="sm:max-w-lg overflow-y-auto"`.
- Props: `open`, `onOpenChange`, `entityId | null`.
- **Kein react-hook-form**. Individuelle `useState`-Hooks pro Feld.
- Manuelle Validation: `if (!field.trim()) { toast.error(...); return }`.

#### Status-Workflow UI
- **Status-Badges**: shadcn `Badge` mit Farb-Mapping `Record<Status, Variant>`.
- **Status-gated Buttons**: `if (status === 'DRAFT') showEditButton`.
- **Transitions**: `ConfirmDialog` (destruktiv) oder Custom `Dialog` (mit Input-Feldern).
- Mutations über tRPC-Hooks, `toast.success`/`toast.error` nach Ergebnis.

#### Side-by-Side Layout
- Einziges Vorkommen: `document-editor.tsx` (Zeile 456–797).
- Links: A4-Canvas (`210mm × 297mm`). Rechts: Collapsible Sidebar (`w-80` / `w-8`), `sticky top-4`.
- **Für Eingangsrechnungen**: Ähnliches Pattern — Links: PDF-Viewer (iframe). Rechts: Erfassungsformular.

---

## Teil B — Externe Recherche

### B1. ZUGFeRD / XRechnung

#### Profile und Praxis-Relevanz
| Profil | Mandate-konform? | Praxis-Relevanz |
|---|---|---|
| MINIMUM | Nein | Nur FR Chorus Pro |
| BASIC WL | Nein | Kaum verwendet |
| BASIC | Grenzwertig | Selten |
| **EN16931 (Comfort)** | **Ja** | **Dominiert B2B seit Jan 2025** |
| EXTENDED | Ja | Komplexe Lieferketten |
| XRechnung | Ja | B2G Pflicht, B2B optional |

**EN16931 ist der Gold-Standard.** Parser muss EN16931 + BASIC + EXTENDED unterstützen.

#### XML im PDF
- ZUGFeRD 2.1+: Dateiname `factur-x.xml` (embedded in PDF/A-3 als AssociatedFile).
- ZUGFeRD 1.0: `ZUGFeRD-invoice.xml`. ZUGFeRD 2.0: `zugferd-invoice.xml`.
- XRechnung: Standalone XML (kein PDF). Aber: ZUGFeRD XRechnung-Sub-Profil bettet XRechnung-konformes XML in PDF ein.
- **Parser muss alle 3 Dateinamen prüfen**: `factur-x.xml`, `ZUGFeRD-invoice.xml`, `xrechnung.xml`.

#### Node.js Libraries
- **Kein Parser-Paket existiert auf npm.** Alle Pakete (`node-zugferd`, `@e-invoice-eu/core`) sind nur für **Generierung**.
- **Empfehlung**: Eigener Parser mit `fast-xml-parser` (CII XML → strukturierte Felder) + `pdf-lib` (PDF-Attachment-Extraktion).
- **Mustang CLI** (Java) für Validation in CI/Dev — nicht für Runtime.

#### Pflichtfelder (EN16931)
**Header**: Rechnungsnummer (BT-1), Datum (BT-2), Typ (BT-3), Währung (BT-5), Fälligkeitsdatum (BT-9).
**Verkäufer**: Name (BT-27), USt-ID (BT-31), Adresse (BT-35/37/38/40).
**Käufer**: Name (BT-44), USt-ID (BT-48), Adresse.
**Positionen**: ID (BT-126), Menge (BT-129), Einheit (BT-130), Netto (BT-131), Einzelpreis (BT-146), MwSt-Satz (BT-152), Bezeichnung (BT-153).
**Summen**: Netto (BT-109), MwSt (BT-110), Brutto (BT-112), Zahlbetrag (BT-115).
**Zahlung**: Zahlungsart (BT-81), IBAN (BT-84).

#### PDF-Attachment-Extraktion
- **`pdf-lib`** (empfohlen): `PDFDocument.load(bytes)` → `getAttachments()` oder manuell via `catalog.EmbeddedFiles`.
- **`pdfjs-dist`**: Schwerer, weniger zuverlässig für Binary-Attachments.

#### Validation
- KoSIT-Validator ist Java-only. Kein vollwertiger Node.js-Ersatz.
- `saxon-js` mit vorcompilierten SEF-Dateien möglich aber komplex.
- **Phase 1**: Keine Schematron-Validation. Strukturelle Prüfung via Parser reicht.

### B2. IMAP in Node.js

#### Library-Wahl
| Library | npm Downloads/Woche | Letzter Commit | Status |
|---|---|---|---|
| **`imapflow`** | ~481.000 | aktiv | **Standard** |
| `imap-simple` | ~300.000 | archiviert | Tot |
| `node-imap` | ~30.000 | 6 Jahre alt | Tot |

**`imapflow` + `mailparser`** — beide vom Nodemailer-Autor, designed für Zusammenspiel.

#### Polling-Pattern
- **UID-basiertes Tracking**: `uidValidity` + `uidNext` pro Inbox in DB speichern.
- Beim Poll: `uidValidity` vergleichen (Mailbox-Reset erkennen), `storedUidNext:*` fetchen.
- **Nicht `\Seen` verwenden** — andere Clients können das Flag ändern.
- IDLE nicht anwendbar (Vercel = stateless).

#### Robustes Processing
1. UIDs fetchen im Range `storedUidNext:*`
2. Pro UID: DB-Record `{ tenantId, uid, status: pending, messageId }` erstellen
3. `uidNext` erst nach DB-Write updaten
4. Pending Records verarbeiten → `processed` / `failed`
5. Nächster Cron: auch `failed` Records re-versuchen

#### Attachment-Handling
- `client.download(uid, partId)` → ReadableStream. Direkt zu Storage pipen.
- `simpleParser(source)` von `mailparser` für MIME-Parsing.
- PDF/XML-Filter: `contentType === 'application/pdf'` oder `filename?.endsWith('.pdf')`.
- Edge-Case: `winmail.dat` (Outlook TNEF) braucht `node-tnef` — optional für Phase 1.

#### Vercel-Limits
- Memory: 2 GB default (ausreichend).
- Max Execution: 300s (konfigurierbar auf 800s mit Fluid Compute).
- `/tmp`: 500 MB Scratch-Space.

### B3. Wettbewerbs-Pain-Points (Phase-1-relevant)

| # | Pain Point | Betroffene Tools | Evidenz |
|---|---|---|---|
| 1 | **Freigabe-Workflow ohne Vertretung** — nur globale OOO, keine Step-Level-Delegation | Candis (partial), sevDesk/lexoffice (gar kein Workflow) | Capterra, Klippa-Vergleich |
| 2 | **Lieferant muss ständig neu zugeordnet werden** — falsche Kontakt-Zuordnung wenn Käufer-Daten im XML stehen | Candis, sevDesk | Candis Hilfe-Center, sevDesk Reviews |
| 3 | **DATEV-Export produziert unbrauchbare Daten** — Kreditoren-Nummern kollidieren, Kostenstellen exportieren nicht | Candis, sevDesk, lexoffice | rechnungswesendigital.de, lex-forum.net |
| 4 | **Email-Empfang nur über SaaS-eigenes Postfach** — Forwarding-Only, kein IMAP auf eigenem Server | Alle Tools | Architektur-Bedingt |
| 5 | **Keine Ablehnung mit Routing** — zurück an generischen Status, nicht an Submitter/Step | sevDesk, lexoffice, Candis (partial) | Reviews |
| 6 | **Keine zuverlässige Duplikat-Erkennung** | GetMyInvoices, lexoffice, sevDesk | Capterra, lex-forum.net |
| 7 | **Unvollständiger Audit-Trail** — kein GoBD-konformes Log, keine Feld-Level-Historie | sevDesk (bestätigt), Candis (partial) | Capterra 1-Stern-Review |

### B4. Freigabe-Workflow-Patterns (ERP-Referenz)

**Sequentiell vs. Parallel**: Alle ERPs (SAP, Dynamics, NetSuite, DATEV) unterstützen beides. Sequentiell als Default. Parallel = alle/Mehrheit/Erster muss freigeben. → **MVP: Sequentiell. Datenmodell so, dass Parallel später möglich.**

**Betragsschwellen**: Approval-Matrix: Betrag → Anzahl Stufen → Approver-Rolle. Auto-Approval unter Schwelle möglich. → **MVP: `approval_policy`-Tabelle mit `(tenant_id, amount_min, amount_max, step_order, approver_role)`.**

**Vertretung**: Dynamics/SAP: Approver-Level, zeitlich begrenzt, Workflow-Typ-spezifisch. Candis: Nur globale OOO. → **MVP: `substitute_for`-Feld auf User-Ebene. Globale Vertretung reicht für Phase 1.**

**Eskalation**: Dynamics: Konfigurierbare Duration pro Step, Auto-Eskalation an Kette. → **MVP: `due_at` Timestamp auf jedem Approval-Step. Cron prüft überfällige Steps. Notification an nächste Stufe.**

**Korrektur nach Teil-Freigabe**: NetSuite: Voller Workflow-Restart. Dynamics: Konfigurierbar. SAP: Abhängig von geänderten Feldern. → **MVP: `approval_version` / Snapshot-Hash auf der Rechnung. Material-Feld-Änderung (Betrag, Lieferant, Fälligkeit) → alle bisherigen Approvals invalidieren, Workflow neu starten.**

**Ablehnung**: Immer zurück an Ersteller (Submitter), nicht an vorherigen Approver. Grund wird auf dem Approval-Step gespeichert. → **MVP: Rejection-Reason auf `InboundInvoiceApproval`-Record.**

**Must-Build für MVP:**
1. Approval-Steps als eigene Records (nicht ein Status-Feld)
2. Konfigurierbare Approver pro Step (User oder Rolle)
3. `due_at` auf jedem Step + Cron-Hook
4. `approval_version` für Korrektur-Erkennung
5. Rejection-Reason auf Step-Record
6. Submitter ≠ Approver Guard

---

## Teil C — Entscheidungs-Matrix

### C1. IMAP-Config: Eigene Tabelle vs. Erweiterung von tenant_smtp_configs

| Option | Pro | Contra |
|---|---|---|
| **A: Eigene `tenant_imap_configs`** | Saubere Trennung, eigene Lifecycle-Felder (uidValidity, uidNext, lastPollAt, pollStatus), unabhängig deaktivierbar | Zweite Config-Tabelle für Email |
| B: Erweiterung tenant_smtp_configs | Alles in einer Tabelle | Spalten-Explosion, optionale Felder überall, SMTP kann ohne IMAP existieren und umgekehrt, uidValidity/uidNext machen keinen Sinn für SMTP |

**Empfehlung: A — Eigene Tabelle.** SMTP und IMAP haben fundamental verschiedene Felder (host/port/credentials sind ähnlich, aber uidValidity, uidNext, lastPollAt, pollIntervalMinutes, lastPollError sind IMAP-spezifisch). Getrennte Lifecycle.

### C2. IMAP-Bibliothek

| Option | Pro | Contra |
|---|---|---|
| **A: `imapflow`** | Aktiv gewartet, async/await, TypeScript, vom Nodemailer-Autor, Streaming-Support, OAuth2 built-in | — |
| B: `node-imap` | — | Tot seit 6 Jahren, Callback-basiert |
| C: `imap-simple` | — | Archiviert, Wrapper um node-imap |

**Empfehlung: A — `imapflow` + `mailparser`.** Keine echte Alternative.

### C3. PDF-XML-Extraktion

| Option | Pro | Contra |
|---|---|---|
| **A: `pdf-lib` + `fast-xml-parser`** | Leichtgewichtig, volle Kontrolle, kein Java, serverless-kompatibel | Manuelles Feld-Mapping gegen CII-Spec, kein Schema-Validation |
| B: Mustang CLI (Java Bridge) | Authoritative Referenz-Implementierung, validiert automatisch | JRE auf Server nötig, nicht serverless-kompatibel, Subprocess-Overhead |
| C: Dediziertes npm-Paket | Ideale Lösung | Existiert nicht für Parsing |

**Empfehlung: A — `pdf-lib` + `fast-xml-parser`.** Parser für EN16931/BASIC/EXTENDED Pflichtfelder bauen. Mustang CLI optional für CI/Test-Validation.

### C4. InboundInvoice: Eigene Tabelle vs. WhSupplierInvoice erweitern

| Option | Pro | Contra |
|---|---|---|
| **A: Eigene `inbound_invoices`** | Sauberer Schnitt, eigener Status-Lifecycle (DRAFT→PENDING→APPROVED→EXPORTED→PAID), 8+ neue Felder ohne WhSI zu belasten, kein Breaking-Change am Warehouse | Potentiell doppelte Felder (Netto/Brutto/Skonto) |
| B: WhSupplierInvoice erweitern | Ein Ort für alle Lieferantenrechnungen | Status-Semantik kollidiert (OPEN/PAID vs. DRAFT/APPROVED), 8+ Nullable-Spalten die für Warehouse irrelevant sind, Service-Logik divergiert komplett, Freigabe-Workflow muss in bestehende Zahlungs-Logik integriert werden |

**Empfehlung: A — Eigene Tabelle.** Die Lifecycles sind fundamental verschieden. Gemeinsame Hilfs-Funktionen (`computeDueDate`, `isOverdue`) können aus `billing-payment-service.ts` importiert werden. Eine spätere Verknüpfung (Phase 2: InboundInvoice ↔ WhSupplierInvoice wenn beide zum gleichen Lieferanten gehören) ist über eine FK-Relation trivial.

### C5. Storage-Bucket

| Option | Pro | Contra |
|---|---|---|
| **A: Neuer `inbound-invoices` Bucket** | Eigene Size-Limits (20MB für große PDFs), eigene MIME-Types (pdf+xml+jpg für Scan-Bilder), saubere Isolation, eigene Retention-Policy möglich | Ein Bucket mehr zu verwalten |
| B: `documents` Bucket mit Pfad-Prefix | Kein neuer Bucket | 10MB-Limit reicht evtl. nicht für Scan-PDFs, MIME-Types gemischt, Billing-PDFs und Eingangsrechnungen im gleichen Bucket |

**Empfehlung: A — Neuer Bucket `inbound-invoices`.** Size-Limit auf 20MB (wie hr-personnel-files), MIME-Types: pdf, xml, jpeg, png. Pfad-Pattern: `{tenantId}/{invoiceId}/{filename}`.

### C6. Freigabe-Workflow-Modell

| Option | Pro | Contra |
|---|---|---|
| **A: Status-Machine auf InboundInvoice** | Einfacher, weniger Tabellen | Keine Approval-Historie, keine parallelen Approvals, keine Step-Level-Metadaten (wer wann warum) |
| **B: Separate `inbound_invoice_approvals`** | Volle Historie, Step-Level-Metadaten (approver, decided_at, reason, step_order), Vertretung, Eskalation, Re-Roll bei Korrektur | Eine Tabelle mehr |

**Empfehlung: B — Separate Approval-Tabelle.** Status-Machine allein reicht nicht für: "wer hat in Stufe 2 am 15.3. abgelehnt weil Betrag falsch?" Approval-Steps als First-Class-Records sind Voraussetzung für alles Weitere (Vertretung, Eskalation, Parallel-Approvals in Phase 2).

### C7. DATEV-Export-Format

| Option | Pro | Contra |
|---|---|---|
| **A: DATEV-CSV (Buchungsstapel-Format)** | Standard-Import in DATEV Kanzlei-Rechnungswesen, gut dokumentiert, Steuerberater kennen es | Spalten-Format ist komplex (Header-Zeile + 116+ Spalten) |
| B: DATEV-XML (Documents-Format) | Moderneres Format | Weniger verbreitet bei Steuerberatern, komplexer |
| **C: Generisches CSV mit DATEV-konformen Spalten** | Einfachster Start, kann in Excel/DATEV importiert werden | Kein nativer DATEV-Import ohne Mapping |

**Empfehlung: A — DATEV-CSV Buchungsstapel-Format.** Phase 1 exportiert nur Rechnungs-Stammdaten (Rechnungsnummer, Datum, Lieferant, Netto, Brutto, USt-ID). Die echten Buchungssätze (Konto, Gegenkonto, Kostenstelle, Steuerschlüssel) kommen erst in Phase 3. Aber das Format ist bereits DATEV-CSV, damit der Steuerberater es direkt importieren kann.

### C8. Manuelle Erfassungs-UI

| Option | Pro | Contra |
|---|---|---|
| **A: Side-by-Side PDF + Formular** | PDF immer sichtbar während Eingabe, natürlichster Workflow, Pattern existiert in document-editor.tsx | Braucht eingebetteten PDF-Viewer (iframe oder pdfjs) |
| B: Stepper-Wizard | Geführter Prozess | PDF nicht permanent sichtbar, mehr Klicks |
| C: Einfaches Modal | Schnell gebaut | Kein PDF-Kontext während Eingabe |

**Empfehlung: A — Side-by-Side.** Links: PDF-Viewer (`<iframe src={signedUrl}>`), rechts: Erfassungsformular. Pattern von `document-editor.tsx` adaptieren. ZUGFeRD-Felder vorausgefüllt wenn XML vorhanden, sonst leer.

---

## Offene Fragen für /create_plan

1. **Approval-Policy-UI**: Wie konfiguriert der Tenant die Betragsschwellen + Approver? Sheet-Formular in Admin-Settings? Oder inline auf der Eingangsrechnungs-Seite?
2. **Lieferant-Matching-Algorithmus**: Bei IMAP-Import: nur Email-Match? Oder auch USt-ID/Steuernummer aus ZUGFeRD-XML gegen CrmAddress matchen?
3. **DATEV-CSV Spalten-Subset**: Welche der 116+ DATEV-Spalten brauchen wir für Phase 1? (Nur Stammdaten: Belegdatum, Belegnummer, Umsatz, Soll/Haben-Kennzeichen, WKZ, Kurs, Basisumsatz, USt-Schlüssel, Buchungstext)
4. **Duplikat-Erkennung**: Match auf `(supplierId, invoiceNumber, invoiceDate)` oder auch auf Betrag? Soft-Warning oder Hard-Block?
5. **IMAP-Polling-Intervall**: Konfigurierbar pro Tenant oder global 3 Minuten?
6. **PDF-Viewer**: `<iframe>` (einfach, aber CSP-Einschränkungen möglich) vs. `pdfjs-dist` (mehr Kontrolle, schwerer)?
7. **Module-Gating**: Braucht das Invoice-Modul `requireModule("invoices")` wie Warehouse `requireModule("warehouse")`? Oder ist es für alle Tenants aktiv?
8. **Positions-Erfassung**: Sollen in Phase 1 einzelne Rechnungspositionen erfasst werden (wie im ZUGFeRD EN16931 vorhanden), oder reichen Header-Daten (Netto, Brutto, MwSt)?
