# AUDIT-012 — `fast-xml-parser` explizit gegen DTD-/Entity-Processing härten

| Field               | Value                                      |
| ------------------- | ------------------------------------------ |
| **Priority**        | P3                                         |
| **Category**        | 6. Input-Validation                         |
| **Severity**        | LOW                                        |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-011)         |
| **Estimated Scope** | 2 Files                                    |

---

## Problem

`fast-xml-parser` wird in Terp für CAMT-Bankauszüge und ZUGFeRD-Rechnungen verwendet. Die Library ist in aktuellen Versionen standardmäßig XXE-sicher (External-Entities werden ignoriert, DOCTYPE nicht expandiert), aber beide Konsumenten setzen keine expliziten Hardening-Optionen. Sobald eine zukünftige Lib-Version den Default ändert oder ein Teammitglied versehentlich `processEntities: true` aktiviert, wird XXE unbemerkt möglich. Da beide Parser User-Upload-Dateien verarbeiten (CAMT/ZUGFeRD sind Kunden-Input), ist defensives Opt-Out essenziell.

## Root Cause

Fehlende Options-Deklaration:

```ts
// ❌ src/lib/services/bank-statement-camt-parser.ts:94-104
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => [...]
  // ⚠️ Kein processEntities/processDoctype — verlässt sich auf Defaults
})
```

## Required Fix

```ts
// ✅ src/lib/services/bank-statement-camt-parser.ts:94-104
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  processEntities: false,   // ⚠️ XXE off
  htmlEntities: false,      // ⚠️ defensive — keine HTML-Entity-Expansion
  stopNodes: ["*.!DOCTYPE"],// defensive — DTD stumm setzen
  isArray: (name) => [...]
})
```

Analog in `zugferd-xml-parser.ts`.

## Affected Files

| File                                          | Line(s)  | Specific Issue                    |
| --------------------------------------------- | -------- | --------------------------------- |
| `src/lib/services/bank-statement-camt-parser.ts` | 94-104 | XMLParser ohne Entity-Deaktivierung |
| `src/lib/services/zugferd-xml-parser.ts`      | 118-127  | XMLParser ohne Entity-Deaktivierung |
| `src/lib/services/__tests__/bank-statement-camt-parser.test.ts` (optional) | — | XXE-Regression-Test |

## Verification

### Automated

- [ ] Unit-Test: CAMT-Payload mit `<!DOCTYPE foo SYSTEM "file:///etc/passwd">` wird ohne Fehler geparst, aber Inhalt von `/etc/passwd` erscheint NICHT im Ergebnis
- [ ] Unit-Test: Entity-Injection `<!ENTITY xxe "gotcha">` in Namespace-Deklaration wird ignoriert
- [ ] Legitimierte CAMT/ZUGFeRD-Beispieldateien werden weiterhin korrekt geparst
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Staging: Upload einer ZUGFeRD-Beispieldatei (aus `/docs/examples/`) → Parser-Ergebnis unverändert
- [ ] XXE-Testvektor aus OWASP-Cheatsheet durchspielen → keine External-Entity-Expansion

## What NOT to Change

- Parser-Semantik (isArray-Liste, removeNSPrefix) — nur Hardening-Optionen ergänzen
- Andere XML-Konsumenten (falls vorhanden: pain.001-Generator nutzt XMLBuilder, keine Parser-Config)
- Content-Type-Validation — nicht Teil dieses Tickets

## Notes for Implementation Agent

- Aktuelle `fast-xml-parser`-Version prüfen: `pnpm list fast-xml-parser`. Option-Namen haben sich zwischen v3 und v4 geändert (`processEntities` vs. `parseEntities`). Vor Commit testen, dass der Parser ohne Warnung startet.
- `stopNodes` akzeptiert Glob-Pattern — `"*.!DOCTYPE"` matcht DOCTYPE in jedem Namespace.
- Beide Parser sind reine Lese-Pfade; keine Breaking-Changes im API-Output möglich.
- Falls `fast-xml-parser` in Zukunft tiefer in den Stack wandert (z.B. für XRechnung-Parsing), diesen Fix als Shared-Factory auslagern. Vorerst reicht Inline-Config.
