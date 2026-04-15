---
date: 2026-04-14T11:55:00+02:00
researcher: Tolga Ayvazoglu
git_commit: a00d603b127a2bf64f7bdd10c130cfe4542dcc7d
branch: staging
repository: terp
topic: "CAMT.053 Bankkontoauszug-Import — Implementation-Research"
tags: [research, codebase, camt053, bank-reconciliation, billing-payments, inbound-invoice-payments, xml-parsing, polymorphism, inbox-ui, storage, permissions]
status: complete
last_updated: 2026-04-14
last_updated_by: Tolga Ayvazoglu
related_research:
  - thoughts/shared/research/2026-04-13-camt053-import.md
  - thoughts/shared/plans/2026-04-14-camt-preflight-items.md
---

# Research: CAMT.053 Bankkontoauszug-Import — Implementation-Research

**Date**: 2026-04-14T11:55:00+02:00
**Researcher**: Tolga Ayvazoglu
**Git Commit**: `a00d603b127a2bf64f7bdd10c130cfe4542dcc7d`
**Branch**: `staging`
**Repository**: `terp`

## Research Question

Implementation-Research (Nachfolger des Initial-Research vom 13.04.) für den
CAMT.053-Bankkontoauszug-Import. Nach Umsetzung der drei Preflight-Items
(IBAN-Unique, Mahnwesen-Refresh, InboundInvoice-PaymentStatus) sind alle
als "Gaps" markierten Fundamente geschlossen. Dieses Dokument sammelt
konkrete Code-Pfade, Trade-offs und Optionen für die sieben
Themenblöcke A–G, ohne finale Entscheidungen zu treffen.

**Strukturelle Vorentscheidungen** (nicht mehr zur Diskussion): neue
Tabellen `BankTransaction` + `BankTransactionAllocation`, Auto-Match bei
Eindeutigkeit sonst Inbox, kein Encryption, synchroner Upload-Flow,
10 Jahre Aufbewahrung, Platform-Subscriptions ausgeschlossen,
InboundInvoicePayment als Backing-Row, (supplierId, invoiceNumber) als
Primär-Heuristik für Eingangsrechnungen.

## Summary

Die Infrastruktur für CAMT-Import ist großflächig vorbereitet:

- **XML-Parsing**: `fast-xml-parser` v5.5.10 ist bereits installiert und
  in zwei völlig unterschiedlichen Rollen eingesetzt (ZUGFeRD-Parsing +
  pain.001-Generierung). Der ZUGFeRD-Parser liefert das Template für
  defensives Walking mit Namespace-Prefixes und fehlertoleranten
  Null-Fallbacks.
- **Error-Klassen-Konvention**: Suffix-basierte Dispatch via
  `handleServiceError` (`NotFoundError → NOT_FOUND`,
  `ValidationError → BAD_REQUEST`, `ConflictError → CONFLICT`,
  `DuplicateError → CONFLICT`, `ForbiddenError → FORBIDDEN`). Jede
  Service-Datei deklariert ihre eigenen Error-Klassen mit dem
  entsprechenden Suffix, `this.name` ist explizit gesetzt.
- **Polymorphie-Patterns**: Für die `BankTransactionAllocation`-Ziele
  gibt es in der Codebase drei etablierte Muster. Pattern B
  (separate Tabellen pro Parent-Typ) ist der dominierende Ansatz bei
  Zahlungs-Tabellen (billing_payments vs. inbound_invoice_payments vs.
  wh_supplier_payments). Pattern A mit CHECK-Constraint existiert
  exakt einmal (XOR in `macro_assignments`); Pattern C (generic
  entity_type+id ohne FK) existiert nur in den Audit-Logs.
- **Matching-Helper**: `src/lib/sepa/iban-validator.ts` liefert
  `normalizeIban`/`isValidIban`. Kein `findByIban`-Query existiert
  heute; der Matcher müsste den ersten Zugriff dieser Art bauen.
  `enrichOpenItem()` + `billingPaymentRepo.findOpenItems()` sind die
  bestehenden Bausteine für offene Ausgangsposten; `inbound-invoice-
  payment-service.ts` (Phase 3b) hat dasselbe Muster für
  Eingangsrechnungen inkl. denormalisierter `paymentStatus`-Felder
  und Konsistenz-Check.
- **Inbox-UI**: Es existieren mehrere Inbox-Patterns in unterschiedlichen
  Ausprägungen — `dunning-runs-tab` + Detail-Sheet, `platform/tenants/
  convert-requests` als tabbed Inbox, `open-item-list` + Route-Detail,
  `inbound-pending-approvals` als einfacher Table-Queue. Multi-Row-
  Selection mit Running-Total ist in `payment-runs/proposal-section`
  (Checkbox + Sticky Footer) und `dunning/dunning-proposal-tab`
  (Collapsible Groups + Live-Totals) umgesetzt.
- **Storage-Bucket**: `payment-runs` ist der nächste Vorfahr für einen
  `bank-statements`-Bucket. Drei Upload-Patterns sind in der Codebase
  etabliert: (a) Direct-Base64-tRPC (inbound-invoices), (b) 3-Schritt-
  Pre-Signed (hr-personnel-files), (c) Server-generierter XML ohne
  Client-Upload (payment-runs). Für CAMT-Import mit serverseitigem
  Parsen ist Variante (a) das nächstliegende Muster.
- **Permissions + Audit**: UUIDv5-deterministische Ableitung aus Key,
  `permission-catalog.ts` zentral, `requireModule()` für Feature-Gating,
  `AsyncLocalStorage` für transparente Impersonation-Dual-Writes.
  `inbound_invoice_payments.*` ist die frischeste Migration und zeigt
  das Seed-Pattern. `audit-logs-service.log()` ist fire-and-forget.
- **CAMT.053.001.08** ist das in DACH seit November 2025 mandatorische
  Format (Ablösung MT940 + CAMT.053.001.02). Dedizierte npm-Pakete
  existieren, aber keines ist sowohl gepflegt als auch frei von
  Native-Dependencies. `fast-xml-parser` + manuelles Mapping bleibt
  die im Terp-Kontext risikoärmste Option, weil es die identische
  Parser-Engine ist, die für ZUGFeRD bereits läuft.

## Detailed Findings

### Block A — CAMT.053-XML-Parsing

#### A.1 XML-Struktur

Ein CAMT.053.001.08-Dokument ist XML mit Namespace
`urn:iso:std:iso:20022:tech:xsd:camt.053.001.08`. Struktur:

- Root: `<Document>` (Namespace-Declaration)
- `<BkToCstmrStmt>` (Bank to Customer Statement)
  - `<GrpHdr>`: `<MsgId>` (bank-generierte Nachricht-ID), `<CreDtTm>` (Erstellung)
  - `<Stmt>` (ein Statement je Account/Period — mehrere möglich):
    - `<Id>`, `<ElctrncSeqNb>`, `<CreDtTm>`, `<FrToDt>` (Period)
    - `<Acct>`: `<Id>/<IBAN>` (Account-IBAN), `<Ccy>`, `<Ownr>/<Nm>`
    - `<Bal>` (mehrfach): `<Tp>/<CdOrPrtry>/<Cd>` mit `OPBD`/`CLBD`/`ITBD`, `<Amt Ccy=...>`, `<CdtDbtInd>`, `<Dt>`
    - `<Ntry>` (mehrfach, eine je Buchung):
      - `<Amt Ccy="EUR">` — Gesamtbetrag der Buchung
      - `<CdtDbtInd>`: `CRDT` = Eingang, `DBIT` = Ausgang
      - `<Sts>/<Cd>`: `BOOK` = gebucht (ignore provisorische)
      - `<BookgDt>/<Dt>` — Buchungsdatum
      - `<ValDt>/<Dt>` — Valutadatum
      - `<AcctSvcrRef>` — Bank-interne Referenz (für Dedup-Schlüssel wertvoll)
      - `<BkTxCd>/<Domn>/...` — Bank-Transaction-Code (PMNT/RCDT/ESCT etc.); ersetzt die alten deutschen GVC-Codes, die in 001.08 optional wurden
      - `<NtryDtls>` (entry details wrapper):
        - Bei Sammelzahlung: `<Btch>` mit `<NbOfTxs>`, `<TtlAmt>`, dann N × `<TxDtls>`
        - Bei Einzelzahlung: direkt 1 × `<TxDtls>` (ohne `<Btch>`)
        - `<TxDtls>`:
          - `<Refs>/<EndToEndId>` — von Originator gesetzt, Verbindung zu pain.001
          - `<Refs>/<MndtId>` — Mandatsreferenz (Lastschriften)
          - `<Refs>/<TxId>` — Transaktions-ID
          - `<Amt Ccy="EUR">` — Einzeltransaktions-Betrag (ggf. anders als `<Ntry>/<Amt>` bei Sammelzahlung)
          - `<RltdPties>/<Dbtr>/<Nm>` + `<DbtrAcct>/<Id>/<IBAN>` — Debtor (Zahler)
          - `<RltdPties>/<Cdtr>/<Nm>` + `<CdtrAcct>/<Id>/<IBAN>` — Creditor (Empfänger)
          - `<RltdAgts>/<DbtrAgt>`, `<CdtrAgt>` — BIC
          - `<RmtInf>/<Ustrd>` — **unstrukturierter Verwendungszweck** (häufigste Form in DE)
          - `<RmtInf>/<Strd>/<CdtrRefInf>/<Ref>` — strukturierte Referenz (ISO 11649, selten in DE)

**Sammelzahlung (Batch)**: Ein `<Ntry>` enthält einen einzigen `<NtryDtls>`,
darin `<Btch>` mit `<NbOfTxs>` und anschließend N `<TxDtls>`. Jeder
`<TxDtls>` trägt seinen eigenen `<EndToEndId>`, seinen eigenen Betrag,
seine eigene Gegenpartei und seinen eigenen `<RmtInf>`. Ein Parser muss
daher immer `NtryDtls/TxDtls` iterieren, nie `<Ntry>` als Atom betrachten.

#### A.2 Parser-Bibliothek

**`fast-xml-parser` v5.5.10** (`package.json:90`) ist bereits installiert
und in zwei Rollen produktiv:

- `src/lib/services/zugferd-xml-parser.ts:118` — `XMLParser`-Singleton:
  ```
  ignoreAttributes: false
  attributeNamePrefix: "@_"
  removeNSPrefix: false
  isArray: (name) => name === "ram:IncludedSupplyChainTradeLineItem"
                   || name === "ram:ApplicableTradeTax"
                   || name === "ram:SpecifiedTaxRegistration"
  ```
  Diese Config erhält Namespace-Prefixes (`rsm:`, `ram:`, `udt:`) und
  zwingt spezifische Elemente immer zur Array-Form.

- `src/lib/services/payment-run-xml-generator.ts:238` — `XMLBuilder` mit
  `format: true`, `suppressEmptyNode: false`, Namespace als
  `"@_xmlns"`-Attribut, `#text`-Schlüssel für Elemente mit Attribut+Text.

**Normalisierungs-Helper** in `zugferd-xml-parser.ts:64-113`:
- `str(val)`: extrahiert `"#text"` aus Attribut-Text-Objekten, `null`-sicher
- `num(val)`: `parseFloat(str(val))`
- `parseCiiDate(val)`: YYYYMMDD → ISO-Datum
- `ensureArray<T>(val)`: wraps non-array in array, `[]` für null

Das defensive Walking-Muster (`doc["rsm:CrossIndustryInvoice"] ?? doc["CrossIndustryInvoice"] ?? {}`)
auf jeder Ebene ist direkt auf CAMT übertragbar: ein CAMT-Parser würde
`doc["Document"] ?? doc["ns:Document"]`, dann
`bkToCstmr.Stmt ?? bkToCstmr["ns:Stmt"]` usw.

**Dedizierte CAMT-npm-Pakete** (Web-Recherche):

| Package | Version | Last Publ. | Weekly DL | Deps | TS | Notiz |
|---|---|---|---|---|---|---|
| `camt-parser` | 2.1.0 | 2025-05-06 | 38 | xml2js + **libxmljs2 (native C++)** | ja | Unterstützt 001.02/08/13. `libxmljs2` braucht glibc-Build; Vercel-Kompatibilität unklar |
| `camtts` | 0.0.7 | 2023-01-02 | 18 | @xmldom/xmldom | ja | Camt.052 laut README, Camt.053 unbestätigt |
| `camtjs` | 0.0.7 | 2022-11-16 | 11 | xml2js | ja | Seit Ende 2022 still, 23 Commits total |
| `iso20022.js` | 0.2.5 | 2025-09-22 | 1.436 | fast-xml-parser v4 + dinero.js + uuid | ja | Schwerpunkt Payment-Generierung; CAMT-Ingest existiert, Sub-Version nicht dokumentiert |
| `node-camt` | 0.0.2 | 2022-06-21 | 13 | lodash + csv | — | Parst CSV, nicht XML — irrelevant |
| `banking-ws` | 0.25.0 | 2024-11 | — | 7 JS-Deps | ja | Finnische Samlink-Webservices — kein CAMT-Parser |

Pakete `camt53`, `iso20022-parser`, `iso20022-xml`, `bank-statement-parser`
existieren **nicht** auf npm.

**Beobachtung**: Keines der existierenden Pakete bietet das
Maintenance+Schema-Coverage+Footprint-Paket, das man für einen
produktiv genutzten Import in einem Terp-Tenant erwarten würde.
`camt-parser` ist das beste Schema-Coverage, bringt aber eine
native Dependency (`libxmljs2`) mit, die in Vercel-Builds Risiko trägt.
`iso20022.js` hätte den saubersten Dependency-Footprint, hat aber
CAMT-Ingest nicht explizit als Feature dokumentiert und benutzt eine
ältere fast-xml-parser-Major (v4).

#### A.3 XSD-Validierung

**Keine XSD-Validierung existiert in der Codebase** — bestätigt durch
Initial-Research und neuen Grep. `tools/kosit/` ist ein externer
Java-Validator für XRechnung via `pnpm validate:einvoice`, nicht für
CAMT relevant. Die camt.053.001.08.xsd ist im ISO-20022-Repository
öffentlich, wäre aber eine Neu-Einführung von XSD-Validierung in Terp.

Realistisch: Format-tolerantes Parsing mit defensiven Null-Fallbacks
(analog ZUGFeRD-Parser) ist die konsistente Variante. Pflichtfeld-
Checks können im Parser-Exit geführt werden (z.B. "Statement ohne IBAN
ist ein Fehler", "Ntry ohne Amt ist ein Fehler"), ohne formale XSD-
Validierung.

#### A.4 Fehlerbehandlung

**`handleServiceError` Dispatch-Tabelle** (`src/trpc/errors.ts:24-96`):

| `err.name` suffix | tRPC code |
|---|---|
| `NotFoundError` | `NOT_FOUND` |
| `ValidationError` | `BAD_REQUEST` |
| `InvalidError` | `BAD_REQUEST` |
| `ConflictError` | `CONFLICT` |
| `DuplicateError` | `CONFLICT` |
| `ForbiddenError` | `FORBIDDEN` |
| `AccessDeniedError` | `FORBIDDEN` |
| _(none)_ | `INTERNAL_SERVER_ERROR` |

Zusätzlich Prisma-Codes: `P2025 → NOT_FOUND`, `P2002 → CONFLICT`,
`P2003 → BAD_REQUEST`. `PrismaClientValidationError → BAD_REQUEST`
(`errors.ts:61-96`).

**Existierende Error-Klassen pro Service**:
- `billing-payment-service.ts:11-30`: `BillingPaymentNotFoundError`, `BillingPaymentValidationError`, `BillingPaymentConflictError`
- `inbound-invoice-service.ts:28-54`: `InboundInvoiceNotFoundError`, `InboundInvoiceValidationError`, `InboundInvoiceConflictError`, `InboundInvoiceDuplicateError`
- `payment-run-service.ts:52-91`: `PaymentRunNotFoundError`, `PaymentRunInvalidStateError` (beachte: `InvalidStateError` matcht **nicht** `.endsWith("InvalidError")`, fällt also auf `INTERNAL_SERVER_ERROR`), `PaymentRunPreflightValidationError`, `PaymentRunItemInvalidError`
- `zugferd-xml-parser.ts` — **keine eigenen Error-Klassen**, `parser.parse()`-Exceptions propagieren als raw `Error`

**Drei Fehlerpfade im ZUGFeRD-Parser** als Referenz
(`zugferd-parser-service.ts:17-63`) für einen CAMT-Parser:

(a) **Buffer ist kein XML/kein PDF**: `parser.parse()` / `pdf-lib` wirft,
    try/catch im Service fängt, pusht in `parseErrors[]`, kein
    Exception-Propagate.

(b) **Korrektes Format, falsche Version**: `detectProfile()` gibt
    `null` zurück, der Service merkt sich das als separate Error-Nachricht.

(c) **Korrektes Format, fehlende Pflichtfelder**: `parseZugferdXml` führt
    keine Required-Field-Checks durch; alle Felder sind `string | null`
    oder `number | null` und fallen auf `null`, der Caller entscheidet
    was mit Null-Feldern geschieht. Der bestehende Consumer
    (`createFromUpload`) akzeptiert Null-Felder und schreibt sie in
    den DB-Draft.

Für CAMT wäre der konsistente Fehler-Typ:
- `CamtParseError extends Error` (suffix `Error` ohne Mapping →
  `INTERNAL_SERVER_ERROR`) oder bewusst
- `CamtValidationError extends Error` (`BAD_REQUEST`) für
  "Datei ist nicht CAMT.053" und "Pflichtfeld fehlt".

**Offene Frage (Plan)**: Soll ein unbekanntes Schema ein
`BAD_REQUEST`-Fehler sein (Benutzer hat falsche Datei hochgeladen)
oder toleriert werden (Parser versucht best-effort)?

### Block B — Datenmodell BankTransaction + BankTransactionAllocation

#### B.1 Polymorphie-Pattern-Inventar

Die Codebase kennt drei etablierte Patterns für "eine Tabelle, deren
Zeilen auf Entitäten unterschiedlicher Typen zeigen können".

**Pattern A — Zwei nullable FK-Spalten + CHECK**

- **A1 (XOR, "exactly one")** — **exakt eine Tabelle**: `macro_assignments`
  (`supabase/migrations/20260101000078_create_macros.sql:38-53`):
  ```sql
  tariff_id   UUID REFERENCES tariffs(id)   ON DELETE CASCADE,  -- nullable
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,  -- nullable
  CHECK (
    (tariff_id IS NOT NULL AND employee_id IS NULL) OR
    (tariff_id IS NULL AND employee_id IS NOT NULL)
  )
  ```
  Prisma: `prisma/schema.prisma:3489-3516` mit `MacroAssignment`-Modell.
  Der CHECK-Constraint ist nicht in Prisma-DSL darstellbar und per
  Kommentar dokumentiert (`:3485-3486`).

- **A2 (OR, "at least one")** — `inbound_invoice_approval_policies`
  (`20260413100000_create_inbound_invoice_tables.sql:144-156`):
  ```sql
  approver_group_id UUID REFERENCES user_groups(id) ON DELETE SET NULL,
  approver_user_id  UUID REFERENCES users(id)       ON DELETE SET NULL,
  CHECK (approver_group_id IS NOT NULL OR approver_user_id IS NOT NULL)
  ```
  Prisma: `schema.prisma:5892-5910`. Benannte Relations
  (`"ApprovalPolicyGroup"`, `"ApprovalPolicyUser"`), weil `User`/
  `UserGroup` mehrfache Backlinks haben.

- **A3 (keine Constraint, "soft polymorphism")** — `crm_tasks`,
  `crm_task_assignees`, `billing_service_cases`, `inbound_invoice_approvals`.
  Alle haben 2-4 nullable FKs ohne CHECK-Enforcement. Prisma-Modelle
  an `schema.prisma:783-813`, `:823-840`, `:1042-1077`.

**Pattern B — Separate Tabellen pro Parent-Typ (dominierend bei Payments)**

- `billing_payments` → `billing_documents` (`schema.prisma:1102-1124`)
- `inbound_invoice_payments` → `inbound_invoices` (`schema.prisma:1157-1178`, Migration `20260426000000`)
- `wh_supplier_payments` → `wh_supplier_invoices` (`schema.prisma:5275-5296`)
- `payment_run_items` → `inbound_invoices` (NOT NULL FK, `schema.prisma:6370-6399`)

Jede dieser Tabellen trägt einen **NOT NULL** FK auf genau einen
Parent-Typ. Der Migrationkommentar in `20260426000000_inbound_invoice_payments.sql:8`
sagt explizit: "analog billing_payments, ohne isDiscount". Das ist der
Beleg für die bewusste Parallelstruktur statt Vereinigung.

**Pattern C — Generic `entity_type` + `entity_id`**

- `audit_logs` (`schema.prisma:3254-3279`): `entity_type VARCHAR(100) NOT NULL`, `entity_id UUID NOT NULL`, composite index `(entity_type, entity_id)`, keine REFERENCES. Per-Kommentar dokumentiert als "no FK constraint in the DB".
- `platform_audit_logs` (`schema.prisma:1494-1512`): identisches Pattern, beide Felder jedoch nullable.

Pattern C kommt ausschließlich in Audit-Log-Tabellen vor —
die Open-World-Annahme (jeder Entity-Typ kann geloggt werden)
rechtfertigt dort das Fehlen der FK-Enforcement.

**Zählung**:
| Pattern | Tabellen |
|---|---|
| B (separate Tabellen) | 4 (alle Zahlungs-Tabellen + payment_run_items) |
| A (zwei nullable FKs, beliebige Variante) | 6 |
| A1 mit XOR-CHECK | 1 (`macro_assignments`) |
| A2 mit OR-CHECK | 1 (`inbound_invoice_approval_policies`) |
| C (generic type+id) | 2 (audit_logs, platform_audit_logs) |

**Für BankTransactionAllocation-Zielfeld (Ausgangs- vs. Eingangsrechnung)
sind damit drei Optionen im Kontext**:

| Option | Beleg in der Codebase | Implikation |
|---|---|---|
| **(a) A1 XOR-CHECK** (zwei FKs `billing_document_id?` + `inbound_invoice_id?`, exclusive) | exakt 1 Präzedenzfall (`macro_assignments`) | DB-seitig sauber, Prisma-`@relation` für beide Richtungen funktioniert, CHECK ist DB-only |
| **(b) Pattern B** (zwei Allocation-Tabellen) | dominant bei Zahlungs-Infrastruktur | Doppelte Modelle/Repos/Services, aber konsistent mit bestehender Trennung |
| **(c) Pattern C** (entity_type-String) | nur Audit-Logs | Kein FK-Schutz vor dangling Refs, inkonsistent mit Zahlungs-Bereich |

Diese Wahl ist eine der offenen Fragen (siehe Block G).

#### B.2 BankTransaction-Schema-Optionen (skizziert, nicht final)

Pflichtfelder aus der CAMT-Quelle:
- `id` UUID, `tenantId` UUID, `statementId` UUID (siehe B.3)
- `bookingDate` DateTime, `valueDate` DateTime (aus `BookgDt`/`ValDt`)
- `amount` Float/Decimal, `currency` String(3), `direction` enum(CREDIT,DEBIT) (aus `<CdtDbtInd>`)
- `counterpartyIban` String(34) nullable, `counterpartyName` String nullable, `counterpartyBic` String(11) nullable
- `remittanceInfo` Text nullable — konkatenierter `<Ustrd>` (evtl. mehrzeilig)
- `endToEndId` String nullable (`<EndToEndId>`)
- `mandateId` String nullable (`<MndtId>`)
- `bankReference` String nullable (`<AcctSvcrRef>`)
- `bankTxCode` String nullable (`<BkTxCd>/<Domn>/<Cd>` + Family/SubFamily, vielleicht als JSON)
- `status` enum (`unmatched | matched | ignored`)
- `createdAt`, `updatedAt`, `tenantId`-Scope
- Index `(tenantId, status)`, `(tenantId, bookingDate)`, `(tenantId, counterpartyIban)`

Dedup-Unique-Constraint (offene Frage): `(tenantId, bankReference)`
oder `(tenantId, statementId, bankReference)`? Alternativ:
Hash über `(bookingDate, amount, endToEndId, counterpartyIban)`.

#### B.3 BankStatement als eigene Tabelle oder eingebettet?

**Trade-off**:

- Option 1 (eigene `BankStatement`-Tabelle, eine Row pro CAMT-Datei):
  - Felder: `id`, `tenantId`, `accountIban`, `statementId` (aus `<Stmt>/<Id>`), `periodFrom`, `periodTo`, `openingBalance`, `closingBalance`, `xmlStoragePath`, `importedAt`, `importedById`, `sha256Hash`
  - BankTransaction → `statementId` FK
  - Vorteil: Duplikat-Erkennung beim Upload (bekannter SHA256 oder bekannte `<Stmt>/<Id>`), Bilanz-Abgleich (Summe der Ntries = CLBD − OPBD), klare Kopplung zur Datei im Bucket
  - Vorbild: `PaymentRun` ist eine vergleichbare Kopf-Entität

- Option 2 (nur `xmlStoragePath` + `xmlSha256` direkt auf BankTransaction):
  - Weniger Tabellen, aber Bilanz-Checks und Datei-Metadaten verteilen sich
  - Dedup pro Datei wird per GROUP BY nötig statt pro Row

**Beobachtung**: Der `PaymentRun`-Präzedenzfall hat eine separate
Kopf-Tabelle für den ausgehenden Pfad. Eine symmetrische
`BankStatement`-Tabelle wäre damit strukturell konsistent.

#### B.4 Interaktion mit PaymentRun.markBooked()

Nach Phase 3 (Preflight) setzt `markBooked()` für alle verknüpften
`InboundInvoice`s `paymentStatus=PAID`, `paidAmount=totalGross`, `paidAt=now`
**in einer Transaktion** (`payment-run-service.ts:markBooked`).

Wenn dieselbe Belastung danach per CAMT hochgeladen wird, findet der
Matcher eine InboundInvoice mit `paymentStatus=PAID` und keine offene
Forderung. Drei Design-Optionen für den Plan:

- **(a) Ignorieren**: Die BankTransaction wird `unmatched` und landet in der
  Inbox. Der Buchhalter sieht "diese Belastung ist schon verbucht" und
  drückt "Ignorieren".
- **(b) Konsistenz-Allokation**: Der Matcher erkennt PAID via `supplierId+invoiceNumber`,
  legt eine `BankTransactionAllocation` OHNE zusätzliche Payment-Row an
  (Flag: `isConsistencyMatch`, amount=0 oder amount=transaction.amount aber mit
  `skipPaymentSideEffect=true`), setzt `bankTx.status=matched`. Vorteil:
  die Buchung erscheint im Transaktions-Journal.
- **(c) Log-only**: Konsistenz-Check schreibt ein Audit-Log (`action: "consistency_confirmed"`,
  analog zum bereits existierenden `consistency_warning` in
  `inbound-invoice-payment-service.ts:322`), die BankTransaction bleibt
  aber formal `unmatched`.

Die Preflight-Phase hat bereits einen `consistency_warning`-Pfad für
divergierende Status; (c) wäre die natürliche Erweiterung.

### Block C — Matching-Engine

#### C.1 Wiederverwendbare Helper

**IBAN-Normalisierung** (`src/lib/sepa/iban-validator.ts:1-19`, 19 Zeilen total):
- `normalizeIban(raw)`: strip whitespace + uppercase, null-safe
- `isValidIban(raw)`: calls `iban` npm-Package, MOD-97

Zusätzlich in `src/lib/services/payroll-validators.ts:22-51` eine
inline-MOD-97-Implementierung (`validateIban`) nur für den Payroll-
Kontext. Die beiden Helper sind **nicht** konsolidiert.

**IBAN-Lookup auf CrmBankAccount**: existiert NICHT.
`crm-address-repository.ts:220-274` hat `findBankAccounts(addressId)`,
`findBankAccountById(id)`, `createBankAccount`, `updateBankAccount`,
`deleteBankAccount`, `countBankAccounts` — aber **kein
`findByIban()`**. Die CAMT-Matching-Pipeline wäre der erste Consumer
einer solchen Query. Durch die Phase-1-Preflight ist der Composite-
Index `(tenant_id, iban)` + Unique-Constraint bereits aktiv — ein neuer
`findByIban(prisma, tenantId, iban)` würde den Index direkt nutzen.

**Bisheriger IBAN-Flow in `payment-run-data-resolver.ts:153-212`**:
Empfängt pre-geladene Invoice mit `supplier.bankAccounts`, nimmt
`bankAccounts[0]` (sortiert `[isDefault desc, createdAt asc]`),
normalisiert via `normalizeIban`, gleicht gegen `invoice.sellerIban`
ab, resolved Konflikte via `choices.ibanSource`. Der shared Include
ist `RESOLVER_INVOICE_INCLUDE` (`:345`).

**Offene-Posten-Berechnung**:
- `billing-payment-service.ts:34-43` — `computePaymentStatus(totalGross, paidAmount)` mit 0.01-EUR-Toleranz. Returns `UNPAID|PARTIAL|PAID|OVERPAID`.
- `billing-payment-service.ts:83-106` — `enrichOpenItem(doc)`: berechnet `creditNoteReduction`, `effectiveTotalGross`, `paidAmount` (sum `status=ACTIVE`), `openAmount = max(0, effective − paid)`, rundet via `Math.round(x * 100) / 100`.
- `billing-payment-repository.ts:124-173` — `findOpenItems()`: WHERE `type=INVOICE`, `status IN (PRINTED, PARTIALLY_FORWARDED, FORWARDED)` + optional `addressId`/`search`/`dateFrom`/`dateTo`. Include-Shape `OPEN_ITEM_INCLUDE` (`:73-99`).

**Eingangsrechnungs-Berechnung** (Phase 3b, 352 Zeilen total,
`inbound-invoice-payment-service.ts`):
- `:45` — `computeInboundPaymentStatus(totalGross, paidAmount)`: `UNPAID|PARTIAL|PAID` (kein OVERPAID). Schwelle UNPAID: `paidAmount ≤ 0.005`.
- `:114` — `createPayment(prisma, tenantId, input, createdById, audit?)`: Guards (`amount > 0`, `invoice.status ∈ APPROVED/EXPORTED`, `totalGross > 0`, `newPaidAmount ≤ totalGross + 0.01`), transaktional, ruft danach `recomputeInvoicePaymentStatus`.
- `:210` — `cancelPayment(...)`: analog billing-payment, kein Skonto-Cascade.
- `:283` — `markInvoicesPaidFromPaymentRun(tx, tenantId, invoiceIds, bookedAt)`: bulk-sets `paymentStatus=PAID` usw. Wird von `payment-run-service.markBooked` im selben `$transaction` gerufen.
- `:322` — `consistencyCheckPaymentStatus(...)`: vergleicht gespeichertes vs. abgeleitetes `paymentStatus` und schreibt `audit_log action="consistency_warning"`.

**Keine Verwendungszweck-Parser** in der Codebase. Der einzige Ort, der
Verwendungszweck berührt, ist der ausgehende Export:
`payment-run-service.ts:313-317` schreibt `invoiceNumber ?? number` in
`effectiveRemittanceInfo` (max 140 Chars, `:331`). Für das Matching
von eingehenden CAMT-`<RmtInf>/<Ustrd>` → Rechnungsnummer wäre eine
neue Regex-Bibliothek nötig. Zu berücksichtigen (aus
`number-sequence-service.ts:35-63`):

| Sequence | Prefix | Beispiel |
|---|---|---|
| `invoice` | `RE-` | `RE-42` |
| `inbound_invoice` | `ER-` | `ER-7` |
| `credit_note` | `G-` | `G-3` |
| `offer` | `A-` | `A-1` |
| `order_confirmation` | `AB-` | `AB-5` |
| `payment_run` | `PR-` | — |
| `dunning` | `MA-` (yearly: `MA-2026-`) | — |

Prefixes sind **tenant-konfigurierbar** (`number-sequence-service.ts:93`).
Eine Matching-Regex muss daher die Tenant-Config lesen oder
default-tolerant sein. Außerdem trägt `InboundInvoice` ein
**zusätzliches** `invoiceNumber`-Feld (Lieferanten-Nummer aus
ZUGFeRD/XRechnung), das von `number` (interne `ER-`) abweicht — der
Matcher für Belastungen hat also zwei Kandidaten pro Rechnung.

**Rundungs-Helper**: `round2(value) = Math.round(value*100)/100` ist
**dreimal privat** dupliziert — `reminder-service.ts:298`,
`reminder-eligibility-service.ts:147`, `dunning/dunning-proposal-tab.tsx:157`.
Inline-Pattern `Math.round(x*100)/100` zusätzlich mehrfach in
`billing-payment-service.ts` und `inbound-invoice-payment-service.ts:54-56`
(`roundCents`). **Keine geteilte Util**.

Das 0.01-EUR-Toleranz-Literal ist ebenfalls **nicht als Konstante
extrahiert** — Inline an `billing-payment-service.ts:40-41,337,408`
und `inbound-invoice-payment-service.ts:50,166`.

**Discount-Detection**: `src/lib/billing/payment-discount.ts:1-35` —
`getApplicableDiscount(document, paymentDate)` returns
`{percent, tier: 1|2} | null`. Re-exported von
`billing-payment-service.ts:7`.

#### C.2 Pipeline-Entwurf (skizziert)

Basierend auf den strukturellen Vorentscheidungen:

1. `normalizeIban(tx.counterpartyIban)`
2. **Direction-Unterscheidung**: `<CdtDbtInd>=CRDT` → Gutschrift (Kunde zahlt uns) → Match gegen `BillingDocument` (Ausgangsrechnungen). `DBIT` → Belastung (wir zahlen Lieferant) → Match gegen `InboundInvoice`.
3. **CREDIT-Pfad** (Ausgangsrechnungen):
   - `prisma.crmBankAccount.findFirst({where: {tenantId, iban: normalized}, include: {address: true}})` — Composite-Index ab Phase 1 garantiert O(log n)
   - Wenn keine Adresse → `status=unmatched`
   - Wenn Adresse gefunden: `billingPaymentRepo.findOpenItems(..., {addressId, ...})` filtert auf diese Adresse
   - Platform-Subscription-Filter: `!hasPlatformSubscriptionMarker(doc.internalNotes)` (vgl. `reminder-eligibility-service.ts:181-182`)
   - Betrag-Eindeutigkeit: genau eine offene Rechnung mit `|openAmount − tx.amount| ≤ toleranz`
   - Verwendungszweck-Plausibilität: Regex auf `RmtInf/Ustrd` für `RE-\d+` (ggf. Tenant-konfigurierbarer Prefix)
   - Bei Eindeutigkeit: `billingPaymentService.createPayment(...)` mit
     `input = {documentId, date, amount, type: "BANK", notes: "CAMT " + tx.bankReference}`,
     anschließend `BankTransactionAllocation` anlegen mit FK auf die
     neu erzeugte BillingPayment.
4. **DEBIT-Pfad** (Eingangsrechnungen):
   - IBAN-Lookup nicht primär (Lieferanten haben Bankverbindungen, aber nicht immer zurück zu CrmBankAccount gepflegt)
   - Primär-Heuristik: `(supplierId, invoiceNumber)` aus Verwendungszweck + `endToEndId`-Boost aus `PaymentRunItem` falls vorhanden
   - Fallback: Betrag + Datum-Toleranz ±3 Tage (vgl. Entscheidung 8)
   - Bei Eindeutigkeit: `inboundInvoicePaymentService.createPayment(...)` mit `type: "BANK"`
5. **Inbox-Fallback**: alles was nicht eindeutig matcht, bleibt `status=unmatched`.

Der Matcher würde als neuer Service `src/lib/services/bank-transaction-matcher-service.ts`
entstehen, der die existierenden `billingPaymentService` /
`inboundInvoicePaymentService` als Write-APIs nutzt. Begründung: diese
Services laufen bereits transaktional und haben ihre Guards (Status-
Prüfungen, Overpayment-Check, Discount-Detection) eingebaut. Der
Matcher wäre damit "business-logic-leicht" und "decision-logic-schwer".

#### C.3 Toleranz-Optionen

Die bestehenden 0.01-EUR-Toleranzen sind für Rundungs-Artefakte
gedacht, nicht für Bankgebühren oder Skonto. Für Match-Tolerance
gibt es keinen Präzedenzfall in der Codebase. Optionen (als offene
Fragen für den Plan):

- Exakt-Match (`|a-b| ≤ 0.01`): nur Rundung, alles andere → Inbox
- Skonto-Match (`a - b ≤ doc.discountPercent% von totalGross + 0.01`, mit aktiver Skonto-Tier-Prüfung via `getApplicableDiscount`)
- Bankgebühr-Match (`|a-b| ≤ bankFeeTolerance`, kleiner Pauschalbetrag z.B. 1.50 EUR)

#### C.4 Test-Daten

Bestehendes Muster für Test-Daten: `src/__tests__/fixtures/` und
`src/lib/services/__tests__/`. Für XML-Tests: ZUGFeRD-Parser-Tests
liegen in `zugferd-parser-service.test.ts` und laden XML-Strings
inline (keine Dateien im Repo). CAMT-Test-Fixtures müssten entweder
inline geschrieben oder als `.xml`-Files in einem neuen
`__tests__/fixtures/camt/` Ordner abgelegt werden.

Bekannte öffentliche Testdaten: mBank, Deutsche Bank, Sparkassen
publizieren Beispiel-CAMT-Dateien in ihren Schnittstellen-Dokumenten.

### Block D — Inbox-UI für unmatched Transactions

#### D.1 List + Detail-Patterns

**Pattern 1 — List-Table → Right-Sheet-Detail** (`dunning-runs-tab.tsx` +
`dunning-reminder-detail-sheet.tsx`):
- List hält `selectedReminderId` als React-State
- Row-Click setzt ID
- `<Sheet open={!!selectedId}>` wird unconditionally gerendert
- Detail-Sheet lädt eigene Daten per Hook, rendert Sticky Action Row
- Action-Buttons öffnen Nested `ConfirmDialog` (selbst Sheets mit `side="bottom"`)

**Pattern 2 — Tabbed Inbox-Page mit `Dialog`** (`platform/(authed)/tenants/convert-requests/page.tsx`):
- Single-File Page mit `Tabs` (`pending/resolved/dismissed`)
- Jede Tab = `Card` → `Table` → Row-Actions als inline Buttons
- `NoteDialog` ist lokale Komponente mit shadcn `Dialog` + optionalem `Textarea`
- Mutation invalidiert zwei Query-Keys on success

**Pattern 3 — List → Route-Detail** (`open-item-list.tsx` + `open-item-detail.tsx`):
- Row-Click `router.push('/orders/open-items/${id}')`
- Kein Sheet, komplette neue Page
- Mobile Card-List + Desktop Table-Dual-Rendering (`sm:hidden` / `hidden sm:block`)

**Pattern 4 — Pending-Queue-Table** (`inbound-pending-approvals.tsx`):
- Einfache Tabelle ohne lokalen State, nur Row-Click → Route-Detail
- `Badge variant="red"` für overdue Items

Für die CAMT-Inbox naheliegend:
- Pattern 2 als Page-Layout (`/orders/bank-statements/inbox` oder
  `/finance/bank-inbox`), Tabs für `unmatched/matched/ignored`
- Pattern 1 als Row-Detail (Right-Sheet), weil der Detail-View mit
  Split-Allokation Platz braucht

#### D.2 Multi-Row-Allokation + Running-Total

**Payment-Run-Proposal** (`src/components/invoices/payment-runs/proposal-section.tsx`):
- `Set<string>` für selected IDs
- `selectedRows.reduce` für Running-Total
- Sticky Footer (`className="sticky bottom-0 ..."`) erscheint nur wenn `selectedIds.size > 0`
- Conflict-Rows (YELLOW) expandieren inline via `React.Fragment` mit `RadioGroup`-Sub-Row

**Dunning-Proposal** (`src/components/billing/dunning/dunning-proposal-tab.tsx`):
- `Set<string>` für selected groups + `Map<string, Set<string>>` für selected invoices per group
- `computeGroupTotals()` live in jedem Render
- Groups als `Card` + `Collapsible` mit Nested `Table`

Für Split-Allocation (BankTransaction auf N Rechnungen):
- Linke Spalte: BankTransaction-Info + Rest-Betrag
- Rechte Spalte: Search/Autocomplete → Rechnungs-Kandidaten → Eingabefeld für Allocation-Betrag
- Sticky Footer mit "Σ allokiert / tx.amount / Differenz" und "Speichern"-Button (enabled wenn Σ = tx.amount)

Die proposal-section-Pattern mit Running-Total ist direkt übertragbar.

#### D.3 Search/Autocomplete

- **`supplier-assignment-dialog.tsx`** — Dialog + `Input` + `useQuery(trpc.crm.addresses.list, {enabled: open && search.length >= 1})`. Results als `<button>`-Rows.
- **`country-combobox.tsx`** — `Popover` + `PopoverContent` mit `Input` + gefilterter Button-Liste; static-list Variante
- **`order-combobox.tsx`** — Custom `div.relative` mit `position:absolute`-Dropdown, `onMouseDown + e.preventDefault()` (weil Input-blur vor Click würde feuern); dynamic-hook Variante
- **`document-form.tsx:152-165`** — shadcn `Select` mit vor-geladenen 100 Adressen (`useCrmAddresses({pageSize:100})`); für kleine Datasets

Für die CAMT-Inbox-Detail-View ist `order-combobox`-Pattern
(dynamisches Laden mit useQuery) der beste Vorfahr, weil der
Buchhalter vermutlich über tausende offene Rechnungen hinweg sucht.

#### D.4 Action-Buttons + Confirmation

**`ConfirmDialog`** (`src/components/ui/confirm-dialog.tsx`) ist der
Standard — implementiert als `Sheet side="bottom"` mit `max-w-md`,
hat `variant="destructive"` für destruktive Actions. Wird von
payment-run-detail, dunning-reminder-detail-sheet, inbound-invoice-list
u.a. genutzt. **Schließt nicht automatisch** — Parent muss Close im
`onConfirm`-Handler selbst triggern.

**Dialog-mit-Textarea für optional Reason** (`payment-cancel-dialog.tsx`
+ NoteDialog-in-convert-requests). Für "Ignorieren" mit optionaler
Notiz naheliegend.

**Multi-Confirm-Pattern** (`dunning-reminder-detail-sheet.tsx:103-106`):
drei separate boolean states (`showSendConfirm`, `showLetterConfirm`,
`showCancelConfirm`), drei `ConfirmDialog`-Instanzen nach
`</Sheet>` gerendert. Analog-Struktur für CAMT-Inbox: "Match
bestätigen", "Ignorieren", "Zuweisung ändern".

#### D.5 Navigation-Registration

**`src/components/layout/sidebar/sidebar-nav-config.ts`** — alle Nav-
Items in einem `navConfig`-Array. Ein neuer Eintrag:
```
{
  titleKey: 'bankInbox',
  href: '/finance/bank-inbox',
  icon: Inbox,  // LucideIcon
  module: 'bank_statements',  // optional Module-Gate
  permissions: ['bank_transactions.view'],
}
```

Existierende finanz-nahe Sektionen:
- `billingSection` (module `'billing'`) — enthält billingDocuments, billingOpenItems, billingDunning
- `invoicesSection` (module `'inbound_invoices'`) — enthält inboundInvoices, paymentRuns

Für CAMT-Inbox sind beide Sektionen plausibel. Alternative:
eine neue `financeSection`/`bankSection` mit eigenem Modul
`bank_statements`.

`SidebarNav` filtert `navConfig` bei Render via `usePermissionChecker()`
und `useModules()`. Keine weitere Registration nötig.

#### D.6 Permission-Gating in der UI

`src/hooks/use-has-permission.ts` → `useHasPermission(['key.action'])`
liefert `{allowed: boolean}`. Admins (`is_admin === true`) returnen
immer `true`.

Typisches Muster (`payment-run-detail.tsx:73-95`):
```ts
const { allowed: canMatch } = useHasPermission(['bank_transactions.match'])
const { allowed: canIgnore } = useHasPermission(['bank_transactions.ignore'])
```

### Block E — Upload-Flow und Storage

#### E.1 Bucket-Migration-Template

**`supabase/migrations/20260423000002_create_payment_runs_storage_bucket.sql`**
(11-19):
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-runs', 'payment-runs', false,
  1048576,  -- 1 MiB
  ARRAY['application/xml', 'text/xml']
)
ON CONFLICT (id) DO NOTHING;
```

**Keine RLS-Policies** existieren in den Bucket-Migrationen — Grep
auf `CREATE POLICY`/`storage.objects` findet null Treffer im
Migration-Ordner. Zugriff ist ausschließlich über den Service-Role-Key
(via `createAdminClient()`), Supabase-RLS kommt nicht zum Einsatz.

Zum Vergleich:
| Bucket | Size | MIME |
|---|---|---|
| `payment-runs` | 1 MiB | `application/xml, text/xml` |
| `inbound-invoices` | 20 MiB | `application/pdf, text/xml, application/xml, image/jpeg, image/png` |
| `hr-personnel-files` | 20 MiB | PDF + JPEG + PNG + webp + docx + xlsx |

Bucket-Migrationen liegen in:
- `20260423000002_create_payment_runs_storage_bucket.sql`
- `20260424000000_create_inbound_invoices_storage_bucket.sql`
- `20260424000001_backfill_missing_storage_buckets.sql:83-99` (hr-personnel-files u.a.)

#### E.2 Storage-Helper

`src/lib/supabase/storage.ts` (alle Exports, 128 Zeilen):
- `fixSignedUrl(url)` — Docker-Fix, internal→public URL
- `getPublicUrl(bucket, path)` — nur für public Buckets
- `createSignedUploadUrl(bucket, path)` (`:35-50`) — returns `{signedUrl, path, token}`
- `createSignedReadUrl(bucket, path, expirySeconds=3600)` (`:55-70`) — returns string|null, wirft nicht
- `download(bucket, path)` (`:75-80`) — returns `Blob|null`
- `upload(bucket, path, body, options?)` (`:85-101`) — wirft `Error('Storage upload failed: ...')`
- `remove(bucket, paths)` (`:106-109`) — best-effort, swallowt errors
- `removeBatched(bucket, paths, batchSize=1000)` (`:115-128`) — Slicing

#### E.3 Drei Upload-Patterns

**Pattern A — Direct-Base64 tRPC-Mutation (inbound-invoices)**

- Router `src/trpc/routers/invoices/inbound.ts:41-44,132-153`:
  ```
  z.object({
    fileBase64: z.string().min(1),
    filename: z.string().min(1).max(255),
  })
  ```
  Handler konvertiert via `Buffer.from(input.fileBase64, "base64")` und
  ruft `inboundInvoiceService.createFromUpload(...)`.

- Service `inbound-invoice-service.ts:58-174`:
  1. ZUGFeRD-Parse
  2. Supplier-Matching + Duplikat-Guard
  3. Number-Sequence-Generierung
  4. Storage-Path `${tenantId}/${invoiceId}/${filename}` (`:95`)
  5. `storage.upload(BUCKET, storagePath, file, {contentType: "application/pdf", upsert: true})` (`:97`)
  6. Prisma-Create (`:102-134`)
  7. Audit-Log (`:157-171`)

- UI (`inbound-invoice-upload-dialog.tsx:59-67`): `file.arrayBuffer()` → base64 via `btoa(...)` → mutation.

- **Kein server-seitiger MIME-Check** — `contentType: "application/pdf"` ist hardcoded. Der Bucket-seitige `allowed_mime_types`-Filter ist der einzige Guard.

**Pattern B — 3-Schritt Pre-Signed URL (hr-personnel-files)**

- Step 1 `getUploadUrl` (`hr-personnel-file-attachment-service.ts:154-197`):
  - MIME-Check gegen `ALLOWED_MIME_TYPES` (`:20-27`) — wirft `HrPersonnelFileAttachmentValidationError`
  - Entry-Existenz-Check
  - Count-Limit (max 10 per entry)
  - Storage-Path `${tenantId}/${employeeId}/${entryId}/${fileId}.${ext}` (`:188`)
  - `storage.createSignedUploadUrl(BUCKET, storagePath)` (`:190`)
  - Returns `{signedUrl, storagePath, token}`

- Step 2: Client uploaded direkt (kein Server-Code)

- Step 3 `confirmUpload` (`:202-270`):
  - Size-Check (`sizeBytes > 20MB` → wirft)
  - MIME re-validated (schutz gegen Pfad-Swap)
  - Entry re-check
  - Count-Limit re-check (race condition)
  - Prisma-Create + Audit-Log

- Router `src/trpc/routers/hr/personnelFile.ts:308-375` — 4 Procedures:
  `attachments.getUploadUrl`, `.confirm`, `.delete`, `.getDownloadUrl`

**Pattern C — Server-Generated (payment-run XML)**

- `payment-run-xml-flow.ts:48-159` — `generateAndGetSignedUrl(...)`:
  - Fetch run, Cancel-Guard
  - Storage-Path `${tenantId}/${paymentRunId}.xml`
  - **Fast-Path** für bereits EXPORTED Runs: nur neue Signed-URL, kein Re-Generate
  - Else: tenant-config, XML-Generierung, `storage.upload`, `paymentRunService.setExported(...)` schreibt `xmlStoragePath` + `xmlGeneratedAt`
  - `createSignedReadUrl` mit 600s-Expiry

**Für CAMT-Import**: Der Server parst die Datei und reagiert synchron
— damit ist Pattern A (Direct-Base64) das nächstliegende Vorbild.
Pattern B hätte den Nachteil, dass der Client die Datei zuerst ablegt,
dann der Server sie aus dem Bucket zurückladen müsste, um sie zu
parsen. Pattern C passt nicht, weil CAMT nicht server-generiert ist.

#### E.4 Audit-Pattern auf Upload-Flows

- inbound-invoice create/upload: `action: "create"`, `entityType: "inbound_invoice"` (`:157-171`, auch `:377`). Kein separater `"upload"`-Action.
- inbound-invoice cancel/delete: `action: "cancel"` / `"delete"`, entityType unverändert.
- hr-personnel-file confirmUpload: `action: "upload"`, `entityType: "hr_personnel_file_attachment"` (`:256-266`). Delete: `action: "delete"` (`:292-304`). **Kein Audit** auf `getUploadUrl` oder `getDownloadUrl`.
- payment-run setExported: `action: "export"`, `entityType: "payment_run"` (`:426-427`). **Kein separates `"download"`-Action** — erste Download triggert `"export"`, weitere Re-Downloads hitten Fast-Path ohne Audit.

Für CAMT-Import naheliegend:
- Upload → `action: "import"`, `entityType: "bank_statement"`
- Match → `action: "match"`, `entityType: "bank_transaction"` oder `"bank_transaction_allocation"`
- Ignore → `action: "ignore"`, `entityType: "bank_transaction"`
- Unmatch → `action: "unmatch"` (wie Cancel auf BillingPayment, das automatisch zurückrechnet)

#### E.5 Path-Konvention für CAMT

Analog zu existierenden Patterns:
- `{tenantId}/{statementId}.xml` (symmetrisch zu payment-runs)
- `{tenantId}/{year}/{statementId}.xml` (leichtere Browsing-Struktur bei vielen Dateien über Jahre)

Der Phase-E-Kontext erwähnt `{tenantId}/{year}/{statementId}.xml` als
Vorschlag. Beide sind im existierenden Code ohne Präzedenzfall — es
gibt heute kein Jahr in einem Storage-Path.

### Block F — Berechtigungen, Rollen, Audit

#### F.1 Permission-Catalog

`src/lib/auth/permission-catalog.ts` — Struktur:

- Factory `p(key, resource, action, description)` (`:31`) ruft
  `permissionId(key)` (`:27`), welches `uuidv5(key, PERMISSION_NAMESPACE)`
  (`:12`) mit festem Namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`
  berechnet. Deterministisch — gleicher Key = gleiche UUID.
- `ALL_PERMISSIONS: Permission[]` (`:44`) ist der Export-Hub
- Maps `byId` + `byKey` (`:407-412`)
- Lookups: `lookupPermission(id)` (`:415`), `permissionIdByKey(key)` (`:420`)

**Existierende Permission-Keys im finanz-nahen Bereich**:

`payment_runs.*` (`:363-367`): `view`, `create`, `export`, `book`, `cancel` — **5 Keys**

`billing_payments.*` (`:263-265`): `view`, `create`, `cancel` — **3 Keys** (kein match/confirm)

`inbound_invoices.*` (`:350-355`): `view`, `upload`, `edit`, `approve`, `export`, `manage`

`inbound_invoice_payments.*` (`:358-360`): `view`, `create`, `cancel`

`dunning.*` (`:277-281`): `view`, `create`, `send`, `cancel`, `settings`

`billing_documents.*` (`:250-254`): `view`, `create`, `edit`, `delete`, `finalize`

Für CAMT naheliegend: Granularität wie `payment_runs.*` (5 Keys):
`bank_transactions.view`, `.import`, `.match`, `.unmatch`, `.ignore`.

#### F.2 Middleware-Enforcement

- `requirePermission(...ids)` (`middleware.ts:40-59`): OR-Logic, wirft FORBIDDEN wenn keine passt, UNAUTHORIZED wenn kein User.
- `requireSelfOrPermission(idGetter, permId)` (`:73-109`)
- `requireEmployeePermission(idGetter, ownPerm, allPerm)` (`:125-192`) mit Team-basierter Read-Path
- `applyDataScope()` (`:219-233`) für `DataScope`-Injection

Router-Usage: lokale Konstanten am Modul-Top `const MATCH = permissionIdByKey("bank_transactions.match")!`, dann `tenantProcedure.use(requirePermission(MATCH))`.

#### F.3 Module-Gating

`requireModule(module: string)` in `src/lib/modules/index.ts:70`:
- Ruft `hasModule(prisma, tenantId, module)` (`:88`) → `prisma.tenantModule.findUnique`
- `"core"` returnt immer `true` ohne Query
- Andere disabled modules → FORBIDDEN

**`AVAILABLE_MODULES`** in `src/lib/modules/constants.ts:9`:
```
["core", "crm", "billing", "warehouse", "inbound_invoices", "payment_runs"]
```

Ein neues Modul `bank_statements` bräuchte:
1. CHECK-Constraint-Alter (`ALTER TABLE tenant_modules DROP CONSTRAINT ... ADD CONSTRAINT chk_tenant_modules_module CHECK (module IN (..., 'bank_statements'))`)
2. Eintrag in `AVAILABLE_MODULES`

**Alternative**: CAMT als Teil-Feature von `payment_runs` oder
`inbound_invoices` gaten — dann kein neues Modul nötig.

#### F.4 Permission-Seed-Migration-Template

**`20260423000001_add_payment_run_permissions_and_module.sql`**:

1. `ALTER CHECK` für neues Modul (`:7-9`)
2. Comment-Block mit allen UUIDv5-Werten (`:11-16`)
3. Pro Role: `UPDATE user_groups SET permissions = (SELECT jsonb_agg(DISTINCT val) FROM (SELECT jsonb_array_elements(permissions) AS val UNION ALL SELECT '"<uuid>"'::jsonb ...)) WHERE code = 'ROLE' AND tenant_id IS NULL` (`:19-48`)

Der `jsonb_agg(DISTINCT val) ... UNION ALL`-Merge ist idempotent und
tenant-scope-sicher.

Weitere Beispiele desselben Patterns:
- `20260413100001_add_inbound_invoice_permissions_and_module.sql` (`:6-9, :19-27, :29-75`) — 6 inbound + 2 email_imap Perms
- `20260426000001_inbound_invoice_payment_permissions.sql` (keine Modul-Registration, nur 3 Perms → ADMIN/BUCHHALTUNG full, VORGESETZTER view only)

**Auffälligkeit**: `dunning.*`-Permissions werden im Code via
`permissionIdByKey` genutzt, aber es existiert **keine Seed-Migration**
in `supabase/migrations/` — diese Permissions sind deklariert, aber
noch nicht an user_groups zugewiesen.

#### F.5 Default-Rollen

System-Rollen (`tenant_id IS NULL`, `is_system=true`) aus
`20260101000088_user_groups_nullable_tenant_and_defaults.sql`:

| Code | Name | Scope |
|---|---|---|
| `ADMIN` | Administrator | `is_admin=true`, bypassed alles |
| `PERSONAL` | Personalleitung | HR management |
| `VORGESETZTER` | Vorgesetzter | Read + approvals |
| `MITARBEITER` | Mitarbeiter | Self-service only |
| `LAGER` | Lagerverwaltung | Warehouse full |
| `BUCHHALTUNG` | Buchhaltung | Accounting full |
| `VERTRIEB` | Vertrieb | CRM + orders |

**`billing_payments.*` assignments** (`20260325120000`):
- ADMIN: all 3 (via is_admin-bypass)
- PERSONAL: all 3 (`:108-110`)
- VORGESETZTER: view only (`:159`)
- BUCHHALTUNG: all 3 (`:220-222`)
- MITARBEITER, LAGER, VERTRIEB: none

**`payment_runs.*` assignments** (`20260423000001:19-48`):
- ADMIN: all 5
- BUCHHALTUNG: all 5
- VORGESETZTER: view only
- andere: none

Für `bank_transactions.*` wäre die konsistente Zuweisung:
ADMIN + BUCHHALTUNG full, VORGESETZTER view only, andere none.

#### F.6 Audit-Konventionen

`audit-logs-service.ts:173-213` — `log(prisma, data)`:
- Fire-and-forget, akzeptiert `Tx` (`PrismaClient | Prisma.TransactionClient`)
- Catchet alle Errors, loggt via `console.error`
- Ruft nach Tenant-Write `getImpersonation()` + schreibt bei gesetztem Context in `platform_audit_logs`
- Callers fügen defensiv `.catch()` hinzu

`logBulk(prisma, data[])` (`:222-256`) — Batch-Variante, nutzt `createMany`.

**`AuditLogCreateInput`-Shape** (repository `:85-96`):
```
tenantId: string
userId: string | null
action: string
entityType: string
entityId: string
entityName?: string | null
changes?: Record<string, unknown> | null
metadata?: Record<string, unknown> | null
ipAddress?: string | null
userAgent?: string | null
```

**Action-Verben (keine Domain-Prefix-Konvention)**:

Common: `create`, `update`, `delete`
State transitions: `approve`, `reject`, `cancel`, `reopen`, `submit`, `close`, `complete`
Domain-spezifisch: `export`, `book`, `finalize`, `pdf_generated`, `generate_einvoice`, `upload`, `link_order`, `share_copy`, `restore_version`, `bulk_import`, `dsgvo_execute`, `demo_convert_req`, `reminder_sent`, `reminder_cancelled`, `dunning_block_set`, `consistency_warning`, `consistency_confirmed` (neu in Preflight Phase 3)

**`entityType`-Strings** (snake_case, Domain-Konzept-Name):
- `billing_payment` (`billing-payment-service.ts:374,430,495`)
- `payment_run` (`payment-run-service.ts:378,427,499,552`)
- `inbound_invoice` (`inbound-invoice-service.ts:163,294,343,408,441,480,509,547`)
- `inbound_invoice_payment` (`inbound-invoice-payment-service.ts:197,261`)
- `reminder` (`reminder-service.ts:460,548,847`)

Für CAMT:
- `bank_statement` (Upload-Event)
- `bank_transaction` (Match/Unmatch/Ignore auf Transaction-Ebene)
- `bank_transaction_allocation` (optional, wenn Einzel-Allocation-Audit gewünscht)

#### F.7 AsyncLocalStorage Impersonation

`src/lib/platform/impersonation-context.ts`:
- `AsyncLocalStorage<ImpersonationContext>` am Modul-Load (`:25`) → Export `impersonationStorage`
- `ImpersonationContext = {platformUserId, supportSessionId}`
- `getImpersonation()` (`:34`) liest `impersonationStorage.getStore()`, returnt `null` auf normalen Requests

**Setup in `src/trpc/init.ts`**:
- `createTRPCContext` prüft bei fehlgeschlagener Standard-Auth die Impersonation-Branch (`:158`)
- `impersonationBoundary`-Middleware (`:308`) läuft auf **jeder** Procedure als Foundation von `publicProcedure` (`:323`)
- Bei gesetztem `ctx.impersonation` wird `impersonationStorage.run(c.impersonation, () => next())` — wraps die gesamte downstream Execution inkl. aller awaits

**Transparenz für Services**: Services opt-in nicht. Jeder
`auditLog.log()`-Call ruft intern `getImpersonation()` und schreibt bei
gesetztem Context zusätzlich in `platform_audit_logs` mit
`action: "impersonation.<original_action>"`, `targetTenantId`, metadata.

**Konsequenz für CAMT**: Wenn ein Platform-Operator in einem Tenant
CAMT hochlädt + matched, erscheint jede Mutation automatisch auch in
`platform_audit_logs`. Keine Extra-Verdrahtung.

### Block G — Risiken und offene Fragen

Die folgenden Punkte sind Entscheidungen, die Tolga im Plan-Review
treffen muss. Sie ergeben sich aus den Trade-offs und Patterns in
den vorherigen Blöcken.

1. **Polymorphie-Strategie für Allocation** (Block B). Drei Optionen
   mit Präzedenz:
   - (a) Pattern A1 — zwei FK-Spalten (`billing_document_id?` + `inbound_invoice_id?`) mit XOR-CHECK-Constraint. Exakt 1 Präzedenzfall (`macro_assignments`).
   - (b) Pattern B — zwei separate Allocation-Tabellen. Dominant bei Zahlungs-Tabellen, aber duplizierter Code.
   - (c) Pattern C — generic `target_type` + `target_id`. Nur bei Audit-Logs genutzt, FK-Schutz fehlt.

   Präferiert werden (a) oder (b). Entscheidung hat Folgen für
   Service-Shape, Repository-Funktionen und Prisma-Typen.

2. **Doppelmatch-Verhalten bei PaymentRun→CAMT-Nachlauf** (Block B.4).
   Wenn `markBooked()` bereits eine InboundInvoice auf `PAID` gesetzt
   hat und das CAMT-Import dieselbe Belastung sieht: (a) Ignorieren,
   (b) Konsistenz-Allocation mit `skipPaymentSideEffect`, (c) Audit-
   only-Konsistenz-Check analog `consistency_warning`. Option (c) ist
   die natürliche Erweiterung der Preflight-Phase.

3. **Matching-Toleranz bei Beträgen** (Block C.3). Drei Stufen:
   Exakt (±0.01), Skonto-aware (via `getApplicableDiscount`),
   Bankgebühr-Pauschale (z.B. ±1.50 €). Default-Empfehlung unklar —
   Skonto-aware ist vermutlich das Minimum, weil sonst Skonto-
   Zahlungen immer in die Inbox fallen.

4. **Fallback wenn IBAN existiert aber keine offene Rechnung passt**
   (Block C.2). Zwei Teilfragen: (a) soll der Matcher dann ältere
   `status=FORWARDED`-Rechnungen durchsuchen, die unter Skonto
   bezahlt wurden? (b) Was ist mit Anzahlungen — es gibt kein
   "offenes Konto" pro Kunde.

5. **Fremdwährungen**. Die Vorentscheidung sagt "vorerst nur EUR".
   Konkrete Durchsetzung: `BankTransaction.currency !== "EUR"` →
   `status=unmatched`, Inbox mit expliziter Nachricht. Alternativ:
   parse + speichern, aber nie auto-matchen.

6. **Dedup-Schlüssel für CAMT-Datei-Upload** (Block B.3). Zwei
   hochgeladene identische Dateien: (a) Hash-basierter Dedup auf
   Datei-Ebene (neue BankStatement-Tabelle mit `sha256Hash`), (b)
   Row-Level-Dedup auf BankTransaction (unique `(tenantId, bankReference)`
   oder `(tenantId, statementId, bankReference)`). Option (a) ist
   schneller, (b) robuster gegen geänderte Metadaten.

7. **Banktagsperren / Valuta vs. Buchung**. Welches Datum wird für
   `BillingPayment.date` / `InboundInvoicePayment.date` genommen —
   `bookingDate` oder `valueDate`? Für Skonto-Tier-Prüfung in
   `getApplicableDiscount` relevant, weil `paymentDate` das Tier
   bestimmt.

8. **Undo für Auto-Matches**. Brauchen wir eine 24h-Undo-Lane für
   `autoMatched=true`-Allokationen, oder reicht der normale Cancel-
   Pfad (`cancelPayment` + `BankTransactionAllocation`-Delete)?
   Der normale Pfad ist der konsistente — es gibt in der Codebase
   keine Präzedenz für zeitgebundene Undo-Lanes.

9. **Modul-Gating**. CAMT als `requireModule("bank_statements")`
   (neues Modul, CHECK-Constraint-Alter + `AVAILABLE_MODULES`) oder
   als Feature von `requireModule("payment_runs")` piggybacked? Die
   erstere Variante ist sauberer, weil CAMT unabhängig von
   pain.001-Export Wert hat (Tenant kann nur empfangen, nicht senden).

10. **Permissions-Granularität**. 5-Keys-Variante
    (`view/import/match/unmatch/ignore`) analog `payment_runs.*`, oder
    3-Keys-Variante (`view/import/match`) mit `unmatch`/`ignore` als
    Sub-Aktionen von `match`? Vorbild für Erstere existiert.

11. **Verwendungszweck-Regex**. Soll der Matcher nur Terp-interne
    Nummern erkennen (`RE-\d+`, `ER-\d+`) oder auch
    `InboundInvoice.invoiceNumber` (Lieferanten-Rechnungsnummer) im
    Debit-Pfad? Zweites Feld ist unstrukturiert und kann alles sein.

12. **XSD-Validierung ja/nein** (Block A.3). Format-tolerantes Parsing
    (wie ZUGFeRD-Parser) vs. strikte XSD-Validierung mit
    `camt.053.001.08.xsd` aus ISO 20022. Terp hat heute null
    XSD-Validierung, neue Abhängigkeit wäre signifikant.

13. **NPM-Paket vs. manueller Parser** (Block A.2). `camt-parser`
    hat `libxmljs2` (native C++), `iso20022.js` nutzt alte
    fast-xml-parser Major — keine der Optionen ist ohne Kompromisse.
    Manueller fast-xml-parser-Code ist die codebase-konsistente
    Wahl, kostet aber Maintenance auf jedes Schema-Update.

## Code References

### XML-Parsing / Fast-XML-Parser
- `package.json:90` — `fast-xml-parser: ^5.5.10`
- `src/lib/services/zugferd-xml-parser.ts:118` — XMLParser-Singleton
- `src/lib/services/zugferd-xml-parser.ts:64-113` — `str/num/parseCiiDate/ensureArray` Helper
- `src/lib/services/zugferd-xml-parser.ts:132-378` — defensive Walking mit `??`-Fallbacks
- `src/lib/services/payment-run-xml-generator.ts:238` — XMLBuilder
- `src/lib/services/zugferd-parser-service.ts:17-63` — 3-Branch-Fehlerpfad
- `src/lib/services/zugferd-pdf-extractor.ts:18-95` — `ZUGFERD_FILENAMES`, `extractZugferdXml`

### Error-Klassen + handleServiceError
- `src/trpc/errors.ts:24-96` — Dispatch-Tabelle
- `src/lib/services/billing-payment-service.ts:11-30` — Error-Klassen
- `src/lib/services/inbound-invoice-service.ts:28-54` — Error-Klassen
- `src/lib/services/payment-run-service.ts:52-91` — Error-Klassen

### Polymorphie-Patterns
- `supabase/migrations/20260101000078_create_macros.sql:38-53` — Pattern A1 XOR-CHECK
- `prisma/schema.prisma:3489-3516` — MacroAssignment Prisma-Modell
- `supabase/migrations/20260413100000_create_inbound_invoice_tables.sql:144-156` — Pattern A2 OR-CHECK
- `prisma/schema.prisma:5892-5910` — InboundInvoiceApprovalPolicy
- `prisma/schema.prisma:1102-1124` — BillingPayment (Pattern B)
- `prisma/schema.prisma:1157-1178` — InboundInvoicePayment (Pattern B)
- `prisma/schema.prisma:5275-5296` — WhSupplierPayment (Pattern B)
- `prisma/schema.prisma:6370-6399` — PaymentRunItem (Pattern B)
- `prisma/schema.prisma:3254-3279` — AuditLog (Pattern C)

### Matching-Helper
- `src/lib/sepa/iban-validator.ts:1-19` — `normalizeIban`, `isValidIban`
- `src/lib/services/payroll-validators.ts:22-51` — `validateIban` mit MOD-97
- `src/lib/services/payment-run-data-resolver.ts:153-212` — IBAN-Resolution-Flow
- `src/lib/services/payment-run-data-resolver.ts:345` — `RESOLVER_INVOICE_INCLUDE`
- `src/lib/services/crm-address-repository.ts:220-274` — existierende CrmBankAccount-Queries (kein findByIban)
- `src/lib/services/billing-payment-service.ts:34-43` — `computePaymentStatus` mit 0.01-Toleranz
- `src/lib/services/billing-payment-service.ts:83-106` — `enrichOpenItem`
- `src/lib/services/billing-payment-service.ts:252-437` — `createPayment`
- `src/lib/services/billing-payment-service.ts:439-502` — `cancelPayment` mit Skonto-Cascade
- `src/lib/services/billing-payment-repository.ts:73-99` — `OPEN_ITEM_INCLUDE`
- `src/lib/services/billing-payment-repository.ts:124-188` — `findOpenItems`, `findOpenItemByDocumentId`
- `src/lib/services/inbound-invoice-payment-service.ts:45` — `computeInboundPaymentStatus`
- `src/lib/services/inbound-invoice-payment-service.ts:114-270` — `createPayment` / `cancelPayment`
- `src/lib/services/inbound-invoice-payment-service.ts:283` — `markInvoicesPaidFromPaymentRun`
- `src/lib/services/inbound-invoice-payment-service.ts:322` — `consistencyCheckPaymentStatus`
- `src/lib/billing/payment-discount.ts:1-35` — `getApplicableDiscount`
- `src/lib/services/number-sequence-service.ts:35-63` — `DEFAULT_PREFIXES`
- `src/lib/services/reminder-service.ts:298` — `round2` (privat)

### Inbox-UI-Patterns
- `src/components/billing/dunning/dunning-runs-tab.tsx` — List→Sheet
- `src/components/billing/dunning/dunning-reminder-detail-sheet.tsx` — Detail-Sheet mit Sticky Actions
- `src/app/platform/(authed)/tenants/convert-requests/page.tsx` — Tabbed Inbox
- `src/components/billing/open-item-list.tsx` — List→Route
- `src/components/billing/open-item-detail.tsx` — Route-Detail
- `src/components/invoices/inbound-invoice-list.tsx` — Liste + DropdownMenu
- `src/components/invoices/inbound-pending-approvals.tsx` — einfache Queue-Table
- `src/components/invoices/payment-runs/proposal-section.tsx` — Checkbox + Running-Total + Sticky Footer
- `src/components/billing/dunning/dunning-proposal-tab.tsx` — Collapsible Groups + Live-Totals
- `src/components/invoices/supplier-assignment-dialog.tsx` — Dialog mit Live-Search
- `src/components/ui/country-combobox.tsx` — Popover-Combobox (static)
- `src/components/invoices/order-combobox.tsx` — Custom Input+div Combobox (dynamic)
- `src/components/ui/confirm-dialog.tsx` — ConfirmDialog-Primitive
- `src/components/billing/payment-cancel-dialog.tsx` — Dialog mit Reason-Textarea
- `src/components/layout/sidebar/sidebar-nav-config.ts` — Nav-Registration
- `src/hooks/use-has-permission.ts` — UI-Permission-Hook

### Storage + Upload
- `src/lib/supabase/storage.ts:1-128` — alle Storage-Helper
- `supabase/migrations/20260423000002_create_payment_runs_storage_bucket.sql:11-19` — Bucket-Migration-Template
- `supabase/migrations/20260424000000_create_inbound_invoices_storage_bucket.sql` — 20 MiB PDF/XML
- `supabase/migrations/20260424000001_backfill_missing_storage_buckets.sql:83-99` — hr-personnel-files
- `src/lib/services/inbound-invoice-service.ts:58-174` — Direct-Base64-Upload
- `src/lib/services/inbound-invoice-service.ts:95,97` — Storage-Path + upload
- `src/lib/services/hr-personnel-file-attachment-service.ts:20-27` — `ALLOWED_MIME_TYPES`
- `src/lib/services/hr-personnel-file-attachment-service.ts:154-197` — `getUploadUrl`
- `src/lib/services/hr-personnel-file-attachment-service.ts:202-270` — `confirmUpload` mit Size+MIME-Re-Check
- `src/lib/services/payment-run-xml-flow.ts:48-159` — Server-Generated-XML + Fast-Path

### Permissions + Audit
- `src/lib/auth/permission-catalog.ts:12,27,31` — UUIDv5-Factory
- `src/lib/auth/permission-catalog.ts:250-367` — finanz-nahe Permission-Keys
- `src/lib/auth/permission-catalog.ts:407-420` — Lookup-Maps
- `src/lib/auth/middleware.ts:40-59` — `requirePermission`
- `src/lib/auth/middleware.ts:73-192` — `requireSelfOrPermission`, `requireEmployeePermission`
- `src/lib/auth/middleware.ts:219-233` — `applyDataScope`
- `src/lib/modules/index.ts:70,88` — `requireModule`, `hasModule`
- `src/lib/modules/constants.ts:9` — `AVAILABLE_MODULES`
- `supabase/migrations/20260423000001_add_payment_run_permissions_and_module.sql` — Seed-Template
- `supabase/migrations/20260413100001_add_inbound_invoice_permissions_and_module.sql` — weiteres Beispiel
- `supabase/migrations/20260426000001_inbound_invoice_payment_permissions.sql` — minimal-Beispiel (Perms only)
- `supabase/migrations/20260101000088_user_groups_nullable_tenant_and_defaults.sql` — System-Rollen
- `supabase/migrations/20260325120000_add_module_permissions_to_groups.sql` — billing_payments Role-Mapping
- `src/lib/services/audit-logs-service.ts:173-213` — `log`
- `src/lib/services/audit-logs-service.ts:222-256` — `logBulk`
- `src/lib/services/audit-logs-repository.ts:85-96` — `AuditLogCreateInput`-Shape
- `src/lib/platform/impersonation-context.ts:25,34` — `impersonationStorage`, `getImpersonation`
- `src/trpc/init.ts:158,238,266,308,323` — Impersonation-Setup + Boundary-Middleware

## Architecture Documentation

**Dominante Pattern-Entscheidungen in der Codebase** (gruppiert):

- **Zahlungs-Entitäten werden NIE polymorph modelliert** — `billing_payments`, `inbound_invoice_payments`, `wh_supplier_payments` sind getrennte Tabellen mit NOT-NULL-FK auf ihren jeweiligen Parent. Die Migration `20260426000000_inbound_invoice_payments.sql` kommentiert dies explizit als "analog billing_payments". Pattern B ist der Standard.
- **Polymorphie mit CHECK-Constraints existiert, ist aber rar** — exakt 2 Tabellen im gesamten Schema (`macro_assignments` XOR, `inbound_invoice_approval_policies` OR). Pattern C (generic entity_type) ist auf Audit-Logs beschränkt.
- **Error-Konvention ist strikt suffix-basiert**. Jede Service-Datei deklariert ihre eigenen Error-Klassen, `this.name` wird explizit gesetzt, der Suffix entscheidet den tRPC-Code. Abweichungen von dieser Konvention (`PaymentRunInvalidStateError`) führen zu `INTERNAL_SERVER_ERROR`-Mapping — ein beobachteter Quirk, kein Feature.
- **Storage-Buckets ohne RLS-Policies** — alle Bucket-Migrationen verlassen sich ausschließlich auf den Service-Role-Key via `createAdminClient()`. Es gibt keine Supabase-RLS für Storage.
- **Audit-Logs fire-and-forget, transparent Impersonation-aware** — `auditLog.log()` wirft nie, und AsyncLocalStorage-basierte Impersonation-Dual-Writes sind für jeden Caller automatisch. Neue Features brauchen keine Audit-spezifische Verdrahtung.
- **Permission-UUIDs sind deterministisch aus Keys abgeleitet** (UUIDv5). Eine neue Permission in `permission-catalog.ts` + Seed-Migration reicht aus, um sie in Middleware und UI-Hooks zu verwenden.
- **Module-Gating ist zweistufig** — SQL-Constraint (`chk_tenant_modules_module`) + TypeScript-Konstante (`AVAILABLE_MODULES`). Beide müssen synchron sein.
- **Server-Side-Parsing bei Upload folgt dem inbound-invoice-Muster** (Base64-tRPC-Input, kein 3-Schritt). Der 3-Schritt-Flow mit Pre-Signed URL ist nur dort im Einsatz, wo der Server die Datei nicht sofort verarbeiten muss.
- **Konsistenz-Checks zwischen gespeichertem und abgeleitetem Status** existieren bereits (`consistency_warning` in `inbound-invoice-payment-service.ts:322`) — Preflight-Phase hat dieses Muster etabliert und es ist auf CAMT-Doppel-Buchungen direkt übertragbar.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-04-13-camt053-import.md` — Initial-Research (Bestandsaufnahme), Grundlage dieses Dokuments. Dokumentiert alle als "Gap" markierten Fundamente, die inzwischen durch den Preflight-Plan geschlossen wurden.
- `thoughts/shared/plans/2026-04-14-camt-preflight-items.md` — Preflight-Plan mit 3 Phasen: (1) CrmBankAccount-IBAN-Unique, (2) Mahnwesen-DRAFT-Refresh, (3) InboundInvoice-PaymentStatus-Feld + InboundInvoicePayment-Modell. Alle Phasen 1, 2, 3a–3d sind laut Commit-History (`5c43d3d0`, `2cb842f4`, `a00d603b`) auf Staging abgeschlossen.

## Related Research

- `thoughts/shared/research/2026-04-13-camt053-import.md` — Bestandsaufnahme (13.04.2026, Ausgangspunkt)

## Open Questions

Zusammengefasst aus Block G (siehe dort für Detailbegründung):

1. Polymorphie-Strategie für `BankTransactionAllocation` — A1 (XOR-CHECK), Pattern B (zwei Tabellen), oder C (generic)?
2. Doppelmatch-Verhalten bei bereits per `markBooked` bezahlten Eingangsrechnungen — Ignore, Konsistenz-Allocation, oder Audit-only?
3. Matching-Toleranz bei Beträgen — Exakt, Skonto-aware, oder Bankgebühr-Pauschale?
4. Fallback wenn IBAN matcht aber keine offene Rechnung passt — alte Rechnungen einbeziehen? Anzahlungs-Handling?
5. Fremdwährungs-Strategie — nie auto-matchen?
6. Dedup-Schlüssel — BankStatement-Hash oder Row-Level `(tenantId, bankReference)`?
7. Buchungs-Datum — `bookingDate` oder `valueDate` für `BillingPayment.date`?
8. Undo-Lane für Auto-Matches — separate Cancel-Pfad oder identisch zum normalen?
9. Modul-Gating — neues `bank_statements`-Modul oder Piggyback auf `payment_runs`?
10. Permissions-Granularität — 5 Keys (wie payment_runs) oder 3 Keys (wie billing_payments)?
11. Verwendungszweck-Regex — nur Terp-interne Nummern oder auch `invoiceNumber` (Lieferanten-Nummer)?
12. XSD-Validierung einführen oder format-tolerant parsen?
13. NPM-Paket (`camt-parser` mit native dep, `iso20022.js` mit alter fxp-Major) oder manueller fast-xml-parser-Code?
