# AUDIT-011 — SEPA pain.001 gegen XSD validieren vor Upload

| Field               | Value                                    |
| ------------------- | ---------------------------------------- |
| **Priority**        | P2 (Pre-Launch-Blocker)                    |
| **Category**        | 7. Finanzdaten                             |
| **Severity**        | MEDIUM                                    |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-012)        |
| **Estimated Scope** | 1 Service + 1 XSD-Asset + 1 Test           |

---

## Problem

Der Generator für ISO-20022 SEPA Credit-Transfer-Initiation (pain.001.001.09) baut die XML aus Tenant-Daten, rechnet einen SHA-256-Hash für Audit und lädt die Datei direkt nach Supabase Storage. Es gibt **keine** Prüfung gegen das offizielle pain.001.001.09-XSD-Schema. Bei (a) Sonderzeichen in Namen/Adressen, (b) überlangen Remittance-Feldern trotz Truncation, (c) Rundungsfehlern in Control-Sum vs. Einzelbeträgen oder (d) Currency-Code-Edge-Cases wird die Datei entweder vom PSP/Bank mit kryptischen Fehlern abgewiesen (Good Case) oder teilweise akzeptiert und falsch verbucht (Bad Case). Laut Memory ist das ein bekannter Pre-Launch-Blocker — das Ticket setzt den Fix um.

## Root Cause

Upload ohne Schema-Validierung:

```ts
// ❌ src/lib/services/payment-run-xml-flow.ts:117
const { xml } = await xmlGenerator.generatePain001V09({...})
await upload(PAYMENT_RUN_BUCKET, storagePath, Buffer.from(xml, "utf-8"), {
  contentType: "application/xml",
  upsert: true,
})
```

Keine Referenz auf `pain.001.001.09.xsd` im Repo; keine `xmllint`/`libxmljs`-Integration.

## Required Fix

XSD-Schema als Asset ablegen und vor dem Upload validieren:

```ts
// ✅ src/lib/sepa/validate-pain001.ts (neu)
import { validateXML } from "libxmljs2"  // oder xsd-schema-validator
import { readFileSync } from "node:fs"
import path from "node:path"

const XSD_PATH = path.join(process.cwd(), "assets", "sepa", "pain.001.001.09.xsd")
const xsd = readFileSync(XSD_PATH, "utf-8")

export class Pain001ValidationError extends Error {
  constructor(public details: string[]) {
    super(`pain.001 schema validation failed: ${details.slice(0, 3).join("; ")}`)
    this.name = "Pain001ValidationError"
  }
}

export function validatePain001(xml: string): void {
  const result = validateXML(xml, xsd)
  if (!result.valid) {
    throw new Pain001ValidationError(result.errors.map(e => `${e.line}: ${e.message}`))
  }
}
```

```ts
// ✅ src/lib/services/payment-run-xml-flow.ts:117
const { xml } = await xmlGenerator.generatePain001V09({...})
validatePain001(xml)   // throws Pain001ValidationError bei nicht-konformer XML
await upload(PAYMENT_RUN_BUCKET, storagePath, Buffer.from(xml, "utf-8"), {
  contentType: "application/xml",
  upsert: true,
})
```

## Affected Files

| File                                              | Line(s) | Specific Issue                                            |
| ------------------------------------------------- | ------- | --------------------------------------------------------- |
| `assets/sepa/pain.001.001.09.xsd` (NEU)           | —       | Offizielles XSD fehlt im Repo                             |
| `src/lib/sepa/validate-pain001.ts` (NEU)          | —       | Validator-Wrapper                                         |
| `src/lib/services/payment-run-xml-flow.ts`        | 117     | Aufruf des Validators vor `upload()`                      |
| `src/lib/services/payment-run-xml-generator.ts`   | —       | Optional: Generator wirft selbst, falls Einzelwerte ungültig |
| `src/lib/services/__tests__/payment-run-xml.test.ts` (NEU oder bestehend) | — | Negativ-Tests für Sonderzeichen, Überlängen, Rundung |

## Verification

### Automated

- [ ] Unit-Test: valide pain.001-XML passiert ohne Fehler
- [ ] Unit-Test: XML mit injiziertem ungültigem Enum (`<Ccy>XYZ</Ccy>` statt `EUR`) → `Pain001ValidationError`
- [ ] Unit-Test: XML mit Control-Sum-Mismatch → `Pain001ValidationError`
- [ ] Unit-Test: Remittance-Info > 140 Zeichen (vorausgesetzt Generator hat einen Truncation-Bug) → Validator fängt es
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Staging Payment-Run mit Name `<evil>` in Empfänger → Fehler statt Upload
- [ ] Regulärer Payment-Run mit Standard-Daten → XML wird valide erzeugt und hochgeladen
- [ ] XSD-Pfad funktioniert im Next.js-Prod-Build (kein `__dirname`-Problem)

## What NOT to Change

- XML-Generator-Logik (`payment-run-xml-generator.ts`) — nur Validierung nachschalten, keine Neuerstellung
- SHA-256-Hash-Audit-Pfad (L248 im Generator) — läuft nach Validierung weiter
- Storage-Upload-Pfad an sich (siehe AUDIT-010 für Size-Limit)
- Andere XML-Generatoren (XRechnung, CAMT-Antwort) — separates Baustelle

## Notes for Implementation Agent

- Bibliothekswahl: `libxmljs2` (Native-Bindings — `node-gyp`-Build nötig) vs. `xsd-schema-validator` (Java-basiert, zusätzliche Runtime-Abhängigkeit) vs. pure-TS `xml-js` + manuelle XSD-Interpretation. Empfehlung: erst prüfen, ob `libxmljs` oder `libxmljs2` bereits in `package.json` ist. Falls ja, wiederverwenden. Falls nicht, `libxmljs2` nachinstallieren — sie ist im Next.js-Server-Runtime lauffähig.
- **XSD-Datei beschaffen:** Das offizielle Schema steht frei auf iso20022.org zur Verfügung. Nicht committen, wenn Lizenzstatus unklar — ansonsten als statisches Asset unter `assets/sepa/` hinterlegen und in `next.config.mjs` sicherstellen, dass der Ordner nicht aus dem Prod-Bundle getilgt wird (`serverExternalPackages` etc.).
- Bei der `Pain001ValidationError`: nicht alle Fehlerdetails in die User-facing-Response leaken — nur die ersten 3 Zeilen oder ein generisches "Zahlungslauf ungültig. Bitte Support kontaktieren." In den Server-Logs aber vollständig loggen.
- XSD-Parsing ist CPU-intensiv — bei hoher Last Kompilat cachen (`libxmljs2.parseXml(xsd)` einmalig beim Modul-Load).
- Pre-Launch-Blocker-Status bleibt bis Ticket-Close; nach Merge das Memory-Flag entsprechend aktualisieren (über separate Mechanik, nicht im Code).
