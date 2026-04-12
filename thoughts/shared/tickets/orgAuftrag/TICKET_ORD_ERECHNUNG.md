# ORD_ERECHNUNG — E-Rechnung (ZUGFeRD / XRechnung)

| Field | Value |
|-------|-------|
| **Module** | Billing |
| **Dependencies** | ORD_01 (Belegkette — BillingDocument, PDF-Generierung), ORD_04 (Preislisten) |
| **Complexity** | L |
| **New Models** | — (Schema-Erweiterungen auf bestehende Modelle) |
| **Status** | Draft |

---

## Goal

Implementierung von **ZUGFeRD 2.x** (Profil EN 16931 / COMFORT) für Rechnungen und Gutschriften. Ab 01.01.2027 ist die E-Rechnung für alle B2B-Rechnungen in Deutschland Pflicht (Wachstumschancengesetz). Pro-Di GmbH (Erstkunde, Mercedes-Zulieferer) benötigt E-Rechnungskonformität — ZMI (Konkurrenzsystem) unterstützt das bereits.

**Was E-Rechnung bedeutet:**
- **ZUGFeRD** = PDF/A-3 mit eingebettetem CII-XML (für Menschen lesbar UND maschinenlesbar)
- **XRechnung** = reines XML (CII-Format), für B2G / öffentliche Auftraggeber
- Nur **INVOICE** und **CREDIT_NOTE** betroffen — Angebote, Lieferscheine etc. bleiben rein PDF
- EN 16931 ist der europäische Standard, den beide Formate erfüllen

**Library-Entscheidung:** `node-zugferd` (npm)
- TypeScript-native, Zod-basierte Type-Inference
- Unterstützt EN 16931 (COMFORT) Profil
- Generiert CII-XML und bettet es via `pdf-lib` in PDF/A-3b ein
- Aktiv maintained (v0.1.0, August 2025, 56 GitHub Stars)
- Alternative: `@e-invoice-eu/core` (v2.3.4, 162 Stars) — unterstützt zusätzlich UBL/XRechnung, aber komplexeres API. Falls UBL-Support für XRechnung B2G benötigt wird, auf diese Library wechseln.

---

## Bestandsanalyse

### Was bereits vorhanden ist

**BillingTenantConfig** (`prisma/schema.prisma:768`):
- `companyName`, `companyAddress` — Seller-Name und Adresse ✅
- `iban`, `bic`, `bankName` — Bankverbindung ✅
- `taxId` — wird aktuell als "USt-IdNr." im PDF-Footer angezeigt ✅
- `commercialRegister`, `managingDirector` — Handelsregister, GF ✅
- `phone`, `email`, `website` — Kontaktdaten ✅

**CrmAddress** (`prisma/schema.prisma:275`):
- `company`, `street`, `zip`, `city`, `country` — Buyer-Adresse ✅
- `taxNumber` — Steuernummer des Kunden ✅
- `vatId` — USt-IdNr. des Kunden ✅

**BillingDocument** (`prisma/schema.prisma:640`):
- `pdfUrl` — Speicherpfad des generierten PDFs ✅
- `subtotalNet`, `totalVat`, `totalGross` — Summen ✅
- `paymentTermDays`, `discountPercent`, `discountDays` — Zahlungsbedingungen ✅

**PDF-Flow** (`src/lib/services/billing-document-pdf-service.ts`):
- `generateAndStorePdf()` — rendert PDF via `@react-pdf/renderer`, lädt in Supabase Storage hoch
- `getSignedDownloadUrl()` — signierte Download-URL
- Bucket: `documents`, Pfad: `{documentType}/{tenantId}_{documentId}.pdf`
- In `finalize()` (`billing-document-service.ts:400-406`) wird PDF nach Status-Wechsel generiert

### Was fehlt

**BillingTenantConfig:**
- `taxNumber` (Steuernummer des Sellers — nicht zu verwechseln mit `taxId`/USt-IdNr.)
- `leitwegId` (Leitweg-ID für XRechnung/B2G, optional)
- `eInvoiceEnabled` (Feature-Flag pro Tenant)

**BillingDocument:**
- `eInvoiceXmlUrl` (Speicherpfad der XML-Datei in Supabase Storage)

**CrmAddress:**
- `leitwegId` (Leitweg-ID des Empfängers für XRechnung/B2G, optional)

---

## Prisma Models

### Schema-Erweiterungen

**BillingTenantConfig** — neue Felder:
```prisma
model BillingTenantConfig {
  // ... bestehende Felder ...
  taxNumber          String?  @map("tax_number") @db.VarChar(50)    // Steuernummer (DE: 13-stellig)
  leitwegId          String?  @map("leitweg_id") @db.VarChar(50)    // Leitweg-ID (B2G XRechnung)
  eInvoiceEnabled    Boolean  @default(false) @map("e_invoice_enabled")
}
```

**BillingDocument** — neues Feld:
```prisma
model BillingDocument {
  // ... bestehende Felder ...
  eInvoiceXmlUrl     String?  @map("e_invoice_xml_url")  // Storage-Pfad der XML-Datei
}
```

**CrmAddress** — neues Feld:
```prisma
model CrmAddress {
  // ... bestehende Felder ...
  leitwegId          String?  @map("leitweg_id") @db.VarChar(50)  // Leitweg-ID Empfänger (B2G)
}
```

### Migration

```sql
-- BillingTenantConfig
ALTER TABLE billing_tenant_configs ADD COLUMN tax_number VARCHAR(50);
ALTER TABLE billing_tenant_configs ADD COLUMN leitweg_id VARCHAR(50);
ALTER TABLE billing_tenant_configs ADD COLUMN e_invoice_enabled BOOLEAN NOT NULL DEFAULT false;

-- BillingDocument
ALTER TABLE billing_documents ADD COLUMN e_invoice_xml_url TEXT;

-- CrmAddress
ALTER TABLE crm_addresses ADD COLUMN leitweg_id VARCHAR(50);
```

---

## Permissions

Keine neuen Permissions nötig. E-Rechnung nutzt bestehende:
- `billing_documents.view` — XML Download
- `billing_documents.edit` — TenantConfig bearbeiten
- `billing_documents.finalize` — Finalisierung (löst E-Rechnung-Generierung aus)

---

## tRPC Router

### Erweiterungen bestehender Router

**`billing.documents`** — neue Procedure:

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `downloadXml` | mutation | `billing_documents.view` | `{ id }` | Signierte Download-URL für E-Rechnung XML. Nur für INVOICE/CREDIT_NOTE mit Status PRINTED+ |

**`billing.tenantConfig.upsert`** — Input erweitern um:
- `taxNumber: z.string().max(50).nullable().optional()`
- `leitwegId: z.string().max(50).nullable().optional()`
- `eInvoiceEnabled: z.boolean().optional()`

**`billing.documents.finalize`** — Hook:
- Nach PDF-Generierung: wenn `eInvoiceEnabled` und Typ INVOICE/CREDIT_NOTE → E-Rechnung XML generieren und einbetten

---

## Service Layer

### Neuer Service: `src/lib/services/billing-document-einvoice-service.ts`

```ts
// --- Error Classes ---
export class EInvoiceError extends Error { ... }
export class EInvoiceValidationError extends Error { ... }

// --- Validation ---
export function validateEInvoiceRequirements(
  tenantConfig: BillingTenantConfig,
  document: BillingDocument & { positions: BillingDocumentPosition[] },
  address: CrmAddress
): string[]
// Prüft ob alle Pflichtfelder vorhanden:
// - tenantConfig: companyName, companyAddress, taxId ODER taxNumber
// - address: company, street, zip, city, country
// - document: mindestens eine Position mit Preis
// Gibt Array von fehlenden Feldern zurück (leer = alles OK)

// --- XML Generation ---
export async function generateXml(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<Buffer>
// Mapping BillingDocument → ZUGFeRD EN 16931 CII-XML:
//   BT-1  Invoice number     ← doc.number
//   BT-2  Issue date         ← doc.documentDate
//   BT-3  Type code          ← INVOICE→"380", CREDIT_NOTE→"381"
//   BT-5  Currency           ← "EUR" (hardcoded, spätere Erweiterung möglich)
//   BT-9  Due date           ← doc.documentDate + paymentTermDays
//   BT-20 Payment terms text ← "Zahlbar innerhalb {paymentTermDays} Tagen"
//                               + Skonto-Text wenn discountPercent gesetzt
//   BT-27 Seller name        ← tenantConfig.companyName
//   BT-31 Seller VAT ID      ← tenantConfig.taxId
//   BT-32 Seller tax number  ← tenantConfig.taxNumber
//   BT-35..40 Seller address ← tenantConfig.companyAddress (parsed)
//   BT-44 Buyer name         ← address.company
//   BT-48 Buyer VAT ID       ← address.vatId
//   BT-50..55 Buyer address  ← address.street, zip, city, country
//   BT-81 Payment IBAN       ← tenantConfig.iban
//   BT-84 Payment BIC        ← tenantConfig.bic
//   BT-106 Line net total    ← doc.subtotalNet
//   BT-109 Total excl. VAT   ← doc.subtotalNet
//   BT-110 Total VAT         ← doc.totalVat
//   BT-112 Total incl. VAT   ← doc.totalGross
//   BT-115 Amount due        ← doc.totalGross
//   Pro Position:
//     BT-126 Line ID         ← position.sortOrder
//     BT-129 Quantity        ← position.quantity
//     BT-130 Unit            ← position.unit (mapped to UN/ECE Rec 20)
//     BT-131 Line net amount ← position.totalPrice
//     BT-146 Line VAT rate   ← position.vatRate
//     BT-153 Item name       ← position.description
//     BT-148 VAT category    ← "S" (standard) / "E" (exempt wenn vatRate=0)

// --- PDF/A-3 Embedding ---
export async function embedXmlInPdf(
  pdfBuffer: Buffer,
  xmlBuffer: Buffer,
  filename: string
): Promise<Buffer>
// Nutzt node-zugferd um CII-XML in bestehendes PDF als PDF/A-3 einzubetten

// --- Storage ---
export async function generateAndStoreEInvoice(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<{ xmlStoragePath: string }>
// 1. Validierung (validateEInvoiceRequirements)
// 2. XML generieren (generateXml)
// 3. XML in Supabase Storage hochladen: {documentType}/{tenantId}_{documentId}.xml
// 4. Bestehende PDF aus Storage laden
// 5. XML in PDF einbetten (embedXmlInPdf)
// 6. PDF in Storage überschreiben (jetzt PDF/A-3 mit embedded XML)
// 7. eInvoiceXmlUrl auf BillingDocument speichern
// Bucket: "documents", Pfad analog pdf-storage.ts

// --- Download ---
export async function getSignedXmlDownloadUrl(
  prisma: PrismaClient,
  tenantId: string,
  documentId: string
): Promise<{ signedUrl: string; filename: string } | null>
// Analog zu billing-document-pdf-service.getSignedDownloadUrl
// Filename: "{doc.number}.xml" z.B. "RE-2026-001.xml"
```

### Erweiterungen bestehender Services

**`billing-document-service.ts` → `finalize()`** (Zeile 400-406):
```ts
// Nach PDF-Generierung hinzufügen:
if (existing.type === "INVOICE" || existing.type === "CREDIT_NOTE") {
  const config = await billingTenantConfigRepo.findByTenantId(prisma, tenantId)
  if (config?.eInvoiceEnabled) {
    try {
      await eInvoiceService.generateAndStoreEInvoice(prisma, tenantId, id)
    } catch {
      console.error(`E-Invoice generation failed for document ${id}`)
    }
  }
}
```

**`billing-tenant-config-repository.ts`** — `upsert()` Data-Typ erweitern:
- `taxNumber?: string | null`
- `leitwegId?: string | null`
- `eInvoiceEnabled?: boolean`

**`pdf-storage.ts`** — neue Funktion:
```ts
export function getXmlStoragePath(doc: {
  type: BillingDocumentType
  tenantId: string
  id: string
}): string {
  return `${DOCUMENT_TYPE_PATHS[doc.type]}/${doc.tenantId}_${doc.id}.xml`
}
```

---

## UI Components

### Erweiterungen

**`src/components/billing/document-editor.tsx`** (Zeile ~291-308):
- Neuer Button "XML" neben dem PDF-Button
- Nur sichtbar wenn: `doc.type === 'INVOICE' || doc.type === 'CREDIT_NOTE'`
- Nur sichtbar wenn: `isImmutable` (Status PRINTED oder später)
- Nur sichtbar wenn: `doc.eInvoiceXmlUrl` vorhanden (XML wurde generiert)
- Gleiche Download-Logik wie PDF (signierte URL, window.open)

```tsx
{isImmutable && doc.eInvoiceXmlUrl && (doc.type === 'INVOICE' || doc.type === 'CREDIT_NOTE') && (
  <Button variant="outline" disabled={downloadXmlMutation.isPending}
    onClick={async () => {
      const result = await downloadXmlMutation.mutateAsync({ id: doc.id })
      if (result?.signedUrl) window.open(result.signedUrl, '_blank')
    }}>
    <FileCode className="h-4 w-4 mr-1" />
    {downloadXmlMutation.isPending ? 'Lade XML...' : 'E-Rechnung XML'}
  </Button>
)}
```

**`src/components/billing/tenant-config-form.tsx`**:
- Neue Felder im Formular:
  - `taxNumber` — "Steuernummer" (Input, optional)
  - `leitwegId` — "Leitweg-ID" (Input, optional, Tooltip: "Für XRechnung an öffentliche Auftraggeber")
  - `eInvoiceEnabled` — "E-Rechnung aktivieren" (Switch/Checkbox)
- Gruppierung: neuer Abschnitt "E-Rechnung" unterhalb der bestehenden Felder

**`src/components/billing/document-form.tsx`** (Finalize-Dialog):
- Wenn `eInvoiceEnabled` und Typ INVOICE/CREDIT_NOTE:
  - Validierungswarnung anzeigen wenn Pflichtfelder fehlen
  - z.B. "Für die E-Rechnung fehlt: USt-IdNr. (Einstellungen → Rechnungskonfiguration)"
  - Finalisierung trotzdem erlauben (Warnung, kein Blocker — PDF wird ohne XML generiert)

**`src/components/crm/address-form.tsx`**:
- Neues Feld: `leitwegId` — "Leitweg-ID" (Input, optional)
- Im Abschnitt "Steuer / Zahlungsbedingungen" neben `taxNumber` und `vatId`

---

## Hooks

**Neuer Hook:** `src/hooks/use-billing-document-einvoice.ts`

```ts
export function useDownloadBillingDocumentXml() {
  return useMutation(trpc.billing.documents.downloadXml.mutationOptions())
}
```

**Erweiterung:** `src/hooks/use-billing-tenant-config.ts`
- Input-Typ von `useUpdateBillingTenantConfig` um `taxNumber`, `leitwegId`, `eInvoiceEnabled` erweitern

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/billing-document-einvoice-service.test.ts`

```ts
describe("billing-document-einvoice-service", () => {
  describe("validateEInvoiceRequirements", () => {
    it("returns empty array when all required fields present", () => {})
    it("returns missing fields when companyName absent", () => {})
    it("returns missing fields when taxId AND taxNumber absent", () => {})
    it("passes when taxId present but taxNumber absent", () => {})
    it("passes when taxNumber present but taxId absent", () => {})
    it("returns missing fields when buyer address incomplete", () => {})
    it("returns missing fields when document has no positions", () => {})
  })

  describe("generateXml", () => {
    it("generates valid CII XML for INVOICE", () => {})
    it("generates valid CII XML for CREDIT_NOTE with type code 381", () => {})
    it("maps INVOICE type to code 380", () => {})
    it("includes all line items with correct BT fields", () => {})
    it("calculates payment due date from documentDate + paymentTermDays", () => {})
    it("includes Skonto text when discountPercent set", () => {})
    it("maps unit strings to UN/ECE Rec 20 codes", () => {})
    it("sets VAT category S for standard rate", () => {})
    it("sets VAT category E for exempt (0% rate)", () => {})
    it("includes seller IBAN and BIC when present", () => {})
    it("includes buyer VAT ID when present", () => {})
    it("includes Leitweg-ID when present (XRechnung)", () => {})
    it("excludes TEXT and PAGE_BREAK positions from XML", () => {})
    it("handles SUBTOTAL positions correctly", () => {})
  })

  describe("generateAndStoreEInvoice", () => {
    it("generates XML and uploads to Supabase Storage", () => {})
    it("embeds XML into existing PDF as PDF/A-3", () => {})
    it("updates eInvoiceXmlUrl on document", () => {})
    it("throws EInvoiceValidationError when required fields missing", () => {})
    it("uses correct storage path: {type}/{tenantId}_{docId}.xml", () => {})
  })

  describe("getSignedXmlDownloadUrl", () => {
    it("returns signed URL and filename for existing XML", () => {})
    it("returns null when no XML generated", () => {})
    it("replaces internal URL with public URL", () => {})
  })
})
```

### Integration Tests (Router)

**File:** `src/trpc/routers/__tests__/billingDocumentsEInvoice-router.test.ts`

```ts
describe("billing.documents.downloadXml", () => {
  it("requires billing_documents.view permission", () => {})
  it("requires billing module enabled", () => {})
  it("returns signed URL for finalized INVOICE with XML", () => {})
  it("returns null for document without XML", () => {})
  it("rejects for non-INVOICE/CREDIT_NOTE types", () => {})
})

describe("billing.tenantConfig.upsert — E-Invoice fields", () => {
  it("saves taxNumber", () => {})
  it("saves leitwegId", () => {})
  it("saves eInvoiceEnabled", () => {})
})
```

### XML-Strukturvalidierung (Vitest Unit Tests — Stufe 1)

Schnelle, immer laufende Tests ohne externe Tools. Prüfen XML-Struktur und Pflichtfelder.

**File:** `src/lib/services/__tests__/einvoice-xml-validation.test.ts`

```ts
describe("E-Invoice XML Structure Validation", () => {
  // Grundstruktur
  it("generated XML parses without errors", () => {})
  it("root element is rsm:CrossIndustryInvoice", () => {})

  // Pflichtfelder (BT = Business Term laut EN 16931)
  it("contains BT-1 (Invoice Number)", () => {})
  it("contains BT-2 (Issue Date) in YYYYMMDD format", () => {})
  it("contains BT-3 (Type Code) = 380 for INVOICE", () => {})
  it("contains BT-3 (Type Code) = 381 for CREDIT_NOTE", () => {})
  it("contains BT-5 (Currency Code) = EUR", () => {})
  it("contains BT-27 (Seller Name)", () => {})
  it("contains BT-31 (Seller VAT ID) or BT-32 (Seller Tax Number)", () => {})
  it("contains BT-35..40 (Seller Address: street, city, postal code, country)", () => {})
  it("contains BT-44 (Buyer Name)", () => {})
  it("contains BT-50..55 (Buyer Address: street, city, postal code, country)", () => {})

  // Positionen
  it("contains line items with BT-126 (Line ID), BT-129 (Quantity), BT-131 (Net Amount), BT-153 (Item Name)", () => {})
  it("excludes TEXT and PAGE_BREAK positions from XML lines", () => {})

  // Summen
  it("contains BT-106 (Line Net Total)", () => {})
  it("contains BT-109 (Total excl. VAT)", () => {})
  it("contains BT-110 (Total VAT)", () => {})
  it("contains BT-112 (Total incl. VAT)", () => {})
  it("totals are mathematically correct: BT-109 + BT-110 = BT-112", () => {})

  // Steuer
  it("contains tax summary with BT-117 (VAT Amount), BT-151 (Category Code), BT-152 (Rate)", () => {})
  it("VAT category is S for standard rate (e.g. 19%)", () => {})
  it("VAT category is E for exempt (0%)", () => {})

  // Zahlungsinformationen
  it("contains payment due date when paymentTermDays set", () => {})
  it("contains IBAN and BIC when present", () => {})

  // Optional fields
  it("contains BT-48 (Buyer VAT ID) when present", () => {})
  it("contains BT-10 (Buyer Reference / Leitweg-ID) when present", () => {})
})
```

### KoSIT Validator (Stufe 2 — manuelle lokale Validierung, kein CI)

Vollständige EN 16931 Validierung (XSD + Schematron-Geschäftsregeln) via KoSIT Validator.
Wird manuell lokal ausgeführt, nicht automatisiert in CI (benötigt Java).

**Neue Datei:** `tools/kosit/README.md`
````markdown
# KoSIT E-Rechnung Validator

Lokale Validierung von generierten E-Rechnungen gegen EN 16931
(XSD + Schematron-Geschäftsregeln).

## Einmalig einrichten

Voraussetzung: Java installiert (`java -version`)

```bash
# Validator JAR herunterladen
wget -O tools/kosit/validator.jar \
  https://github.com/itplr-kosit/validator/releases/download/v1.5.0/validationtool-1.5.0-standalone.jar

# XRechnung Konfiguration (enthält EN 16931 XSD + Schematron)
wget -O tools/kosit/xrechnung.zip \
  https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/release-2024-11-15/validator-configuration-xrechnung-2024-11-15.zip
unzip tools/kosit/xrechnung.zip -d tools/kosit/xrechnung
```

## XML validieren

```bash
# Einzelne XML-Datei prüfen
pnpm validate:einvoice pfad/zur/rechnung.xml

# Oder direkt:
java -jar tools/kosit/validator.jar \
  --scenarios tools/kosit/xrechnung/scenarios.xml \
  pfad/zur/rechnung.xml
```

Ergebnis: "is valid" = OK, "is not valid" = Fehler mit Details.
````

**Neues npm Script** in `package.json`:
```json
"validate:einvoice": "java -jar tools/kosit/validator.jar --scenarios tools/kosit/xrechnung/scenarios.xml"
```

**`.gitignore`** ergänzen:
```
tools/kosit/*.jar
tools/kosit/*.zip
tools/kosit/xrechnung/
```

**`tools/kosit/.gitkeep`** committen (leerer Ordner bleibt im Repo).

### E2E Browser Tests (Playwright)

**File:** `src/e2e-browser/35-billing-einvoice.spec.ts`

```ts
test.describe("UC-ORD-EINV: E-Rechnung", () => {
  test("XML download button visible for finalized INVOICE", async ({ page }) => {
    // Navigate to a finalized INVOICE
    // Verify "E-Rechnung XML" button is visible
  })

  test("XML download button NOT visible for OFFER", async ({ page }) => {
    // Navigate to a finalized OFFER
    // Verify no XML button
  })

  test("XML download button NOT visible for DRAFT INVOICE", async ({ page }) => {
    // Navigate to a DRAFT invoice
    // Verify no XML button
  })

  test("download XML triggers file download", async ({ page }) => {
    // Click "E-Rechnung XML" button
    // Intercept download, verify filename ends with .xml
  })

  test("tenant config shows E-Rechnung section", async ({ page }) => {
    // Navigate to billing settings
    // Verify Steuernummer, Leitweg-ID, E-Rechnung switch visible
  })

  test("finalize INVOICE shows warning when taxId missing", async ({ page }) => {
    // Clear taxId from tenant config
    // Try to finalize an invoice
    // Verify warning message about missing tax ID
  })
})
```

---

## Implementation Notes

### UN/ECE Rec 20 Unit Mapping

Terp nutzt freie Text-Einheiten (`"Stk"`, `"Std"`, `"kg"` etc.). ZUGFeRD erwartet UN/ECE Rec 20 Codes:

```ts
const UNIT_MAPPING: Record<string, string> = {
  "Stk": "C62",    // Piece/Unit
  "Std": "HUR",    // Hour
  "kg": "KGM",     // Kilogram
  "m": "MTR",      // Metre
  "m²": "MTK",     // Square metre
  "m³": "MTQ",     // Cubic metre
  "l": "LTR",      // Litre
  "t": "TNE",      // Tonne
  "Psch": "LS",    // Lump sum
  "km": "KMT",     // Kilometre
}
// Fallback: "C62" (piece) für unbekannte Einheiten
```

### companyAddress Parsing

`BillingTenantConfig.companyAddress` ist ein Freitext-Feld. Für ZUGFeRD brauchen wir strukturierte Adresse (Straße, PLZ, Ort). Optionen:
1. **Pragmatisch:** Erste Zeile = Straße, zweite Zeile = PLZ + Ort parsen
2. **Sauber:** Neue Felder `companyStreet`, `companyZip`, `companyCity`, `companyCountry` auf BillingTenantConfig

**Empfehlung:** Option 2 — eigene Felder. Die zusätzliche Migration ist minimal, und es vermeidet fragile String-Parsing-Logik. Die bestehende `companyAddress` bleibt für den PDF-Header/Footer erhalten.

```prisma
model BillingTenantConfig {
  // ... bestehende Felder ...
  companyStreet      String?  @map("company_street") @db.VarChar(255)
  companyZip         String?  @map("company_zip") @db.VarChar(20)
  companyCity        String?  @map("company_city") @db.VarChar(100)
  companyCountry     String?  @default("DE") @map("company_country") @db.VarChar(10)
}
```

### Währung

Aktuell hardcoded EUR. Das ist für den deutschen Markt korrekt. Falls internationale Währungen benötigt werden, später `currency`-Feld auf BillingDocument ergänzen.

### node-zugferd Integration Beispiel

```ts
import { zugferd } from "node-zugferd"
import { EN16931 } from "node-zugferd/profile/en16931"

const invoicer = zugferd({ profile: EN16931 })

const invoice = invoicer.create({
  // BT-1..5: Header
  number: doc.number,
  issueDate: doc.documentDate,
  typeCode: doc.type === "CREDIT_NOTE" ? "381" : "380",
  currencyCode: "EUR",
  // BT-27..40: Seller
  seller: {
    name: tenantConfig.companyName,
    vatId: tenantConfig.taxId,
    taxNumber: tenantConfig.taxNumber,
    address: {
      street: tenantConfig.companyStreet,
      postalCode: tenantConfig.companyZip,
      city: tenantConfig.companyCity,
      countryCode: tenantConfig.companyCountry ?? "DE",
    },
  },
  // BT-44..55: Buyer
  buyer: {
    name: address.company,
    vatId: address.vatId,
    address: {
      street: address.street,
      postalCode: address.zip,
      city: address.city,
      countryCode: address.country ?? "DE",
    },
  },
  // Lines
  lines: positions
    .filter(p => p.type === "ARTICLE" || p.type === "FREE")
    .map(pos => ({
      id: String(pos.sortOrder),
      name: pos.description,
      quantity: pos.quantity,
      unitCode: UNIT_MAPPING[pos.unit ?? "Stk"] ?? "C62",
      netAmount: pos.totalPrice,
      unitPrice: pos.unitPrice,
      vatRate: pos.vatRate ?? 19,
      vatCategory: (pos.vatRate ?? 19) === 0 ? "E" : "S",
    })),
  // Payment
  payment: {
    iban: tenantConfig.iban,
    bic: tenantConfig.bic,
    dueDate: addDays(doc.documentDate, doc.paymentTermDays ?? 30),
  },
  // Totals
  totals: {
    netTotal: doc.subtotalNet,
    vatTotal: doc.totalVat,
    grossTotal: doc.totalGross,
    dueAmount: doc.totalGross,
  },
})

const xml = await invoice.toXML()
const zugferdPdf = await invoice.embedInPdf(existingPdfBuffer)
```

### Package Installation

```bash
pnpm add node-zugferd
```

---

## Acceptance Criteria

- [ ] ZUGFeRD 2.x EN 16931 (COMFORT) konformes XML wird für INVOICE und CREDIT_NOTE generiert
- [ ] XML wird automatisch bei `finalize()` generiert, wenn `eInvoiceEnabled=true`
- [ ] XML ist in das PDF eingebettet (PDF/A-3 mit CII-Attachment)
- [ ] XML ist separat als Download verfügbar (XRechnung-kompatibel)
- [ ] Nur INVOICE (Type Code 380) und CREDIT_NOTE (Type Code 381) betroffen
- [ ] Pflichtfelder-Validierung vor Generierung: companyName, taxId/taxNumber, Seller-Adresse
- [ ] Warnung im Finalize-Dialog wenn Pflichtfelder für E-Rechnung fehlen
- [ ] Fehlende Pflichtfelder verhindern XML-Generierung, nicht die Finalisierung selbst
- [ ] XML in Supabase Storage archiviert: `{documentType}/{tenantId}_{documentId}.xml`
- [ ] `eInvoiceXmlUrl` auf BillingDocument gespeichert
- [ ] "E-Rechnung XML" Button im DocumentEditor nur für INVOICE/CREDIT_NOTE + PRINTED Status + XML vorhanden
- [ ] BillingTenantConfig um Steuernummer, Leitweg-ID, E-Rechnung-Switch erweitert
- [ ] BillingTenantConfig um strukturierte Seller-Adresse erweitert (Street, ZIP, City, Country)
- [ ] CrmAddress um Leitweg-ID erweitert
- [ ] Unit-Mapping: Terp-Einheiten → UN/ECE Rec 20 Codes
- [ ] Alle Positionstypen korrekt verarbeitet: ARTICLE/FREE → XML-Zeilen, TEXT/PAGE_BREAK → ignoriert
- [ ] Zahlungsbedingungen im XML: Fälligkeitsdatum, Skonto-Text
- [ ] IBAN und BIC des Sellers im XML (Zahlungsinformation)
- [ ] Käufer-USt-IdNr. im XML wenn vorhanden
- [ ] Leitweg-ID im XML wenn vorhanden (BuyerReference BT-10)
- [ ] Alle Unit Tests grün (Validierung, XML-Generierung, Fehlerfälle)
- [ ] Alle Integration Tests grün (Router, Permissions)
- [ ] Vitest Unit Tests prüfen XML-Struktur und Pflichtfelder (BT-1..BT-153, Summen, Datumsformat — kein Java nötig)
- [ ] `pnpm validate:einvoice <file>` validiert lokal gegen KoSIT EN 16931 (XSD + Schematron)
- [ ] `tools/kosit/README.md` erklärt Einrichtung und Nutzung des KoSIT Validators
- [ ] `tools/kosit/.gitkeep` committet, JARs/ZIPs/xrechnung/ in `.gitignore`
- [ ] Playwright E2E Tests: Button-Sichtbarkeit, Download, Tenant-Config-Formular
- [ ] Cross-Tenant-Isolation: XML nur mit korrektem Tenant zugänglich
