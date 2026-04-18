# AUDIT-009 — IBAN-Prüfsumme serverseitig validieren

| Field               | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| **Priority**        | P2                                                    |
| **Category**        | 6. Input-Validation                                    |
| **Severity**        | MEDIUM                                                |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-009)                    |
| **Estimated Scope** | 3+ Router/Service-Files + 1 Test                       |

---

## Problem

Das tRPC-Schema für `BillingTenantConfig.iban` prüft nur die Länge (`z.string().max(34)`). Die tatsächliche IBAN-Prüfsumme (ISO-13616 mod-97) wird zwar von `src/lib/sepa/iban-validator.ts` bereitgestellt, aber nur in client-seitigen Forms aufgerufen. Ein Angreifer, der die Session kapert oder direkt gegen tRPC aufruft, kann eine syntaktisch falsche IBAN setzen — entweder mit kaputter Prüfsumme (nachfolgende pain.001-Erzeugung produziert fehlerhafte Dateien) oder eine fremde gültige IBAN (Zahlungen könnten an falsche Konten gehen). Betroffen sind Tenant-Config, CRM-Bankverbindungen und Zahlungsläufe.

## Root Cause

Zod-Schema ohne `.refine(isValidIban)`:

```ts
// ❌ src/trpc/routers/billing/tenantConfig.ts:24
iban: z.string().max(34).nullable().optional(),
```

`isValidIban` (in `src/lib/sepa/iban-validator.ts:15-34`) ist vorhanden, aber nicht im Schema eingebunden.

## Required Fix

Gemeinsames Zod-IBAN-Schema definieren und überall nutzen:

```ts
// ✅ src/lib/sepa/iban-zod.ts (neu)
import { z } from "zod"
import { isValidIban } from "./iban-validator"

export const ibanSchema = z
  .string()
  .max(34)
  .transform((v) => v.replace(/\s+/g, "").toUpperCase())  // Normalisierung
  .refine((v) => v === "" || isValidIban(v), {
    message: "Ungültige IBAN (Prüfsumme)",
  })

export const ibanNullableSchema = ibanSchema.nullable().optional()
```

```ts
// ✅ src/trpc/routers/billing/tenantConfig.ts:24
iban: ibanNullableSchema,
```

Analog in allen anderen Eingabepfaden, die eine IBAN akzeptieren.

## Affected Files

| File                                              | Line(s) | Specific Issue                                   |
| ------------------------------------------------- | ------- | ------------------------------------------------ |
| `src/lib/sepa/iban-zod.ts` (NEU)                  | —       | Shared Zod-Schema fehlt                          |
| `src/trpc/routers/billing/tenantConfig.ts`        | 24      | `upsertInput.iban` ohne Checksum-Validation      |
| `src/trpc/routers/crm/*.ts` oder `src/lib/services/crm-address-service.ts` | — | Bank-Account-Adresse akzeptiert IBAN ungefiltert |
| `src/trpc/routers/invoices/payment-runs.ts`       | —       | Payment-Run-Erzeugung — ggf. weitere IBAN-Inputs |
| `src/lib/services/__tests__/iban-zod.test.ts` (NEU) | —     | Unit-Test für Shared-Schema                     |

## Verification

### Automated

- [ ] Unit-Test: `ibanSchema.parse("DE00000000000000000000")` → wirft `ZodError` mit `"Ungültige IBAN"`
- [ ] Unit-Test: `ibanSchema.parse("DE89 3704 0044 0532 0130 00")` → liefert `"DE89370400440532013000"`
- [ ] Unit-Test: `ibanSchema.parse("")` → leerer String akzeptiert (für optional-Fall)
- [ ] Integrations-Test: `billingTenantConfig.upsert({ iban: "DE00..." })` → `TRPCError BAD_REQUEST`
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] UI-Formular (`/billing/settings`): IBAN mit defekter Prüfsumme speichern → Client-Fehler zeigt korrekten Text
- [ ] Direkter tRPC-Aufruf (curl) mit defekter IBAN → 400 mit verständlicher Fehlermeldung
- [ ] Gültige IBAN (inkl. Whitespace und Kleinbuchstaben) wird normalisiert gespeichert

## What NOT to Change

- Client-side Form-Validation — die bleibt zur UX-Verbesserung bestehen, ist aber nicht mehr die einzige Barriere
- Legacy-Daten in der DB — falls bestehende IBANs ungültig sind, wird ein Data-Cleanup-Script (separates Ticket) nötig, NICHT in diesem PR
- BIC-Validierung — separate Baustelle
- `isValidIban`-Implementation — nur konsumieren

## Notes for Implementation Agent

- Vor Neuanlage `src/lib/sepa/iban-zod.ts` prüfen, ob bereits ein ähnliches Shared-Schema existiert (grep nach `ibanSchema`, `iban.*z\.string`).
- Normalisierung (Whitespace entfernen, uppercase) im `.transform` vor `.refine`. Dadurch sind auch Eingaben wie `"de89 3704 0044 0532 0130 00"` gültig.
- Leerer String `""` muss weiterhin durchgelassen werden, weil viele Felder optional sind. Die `z.refine`-Condition `v === "" || isValidIban(v)` deckt das ab.
- Wo Payment-Run IBAN-Daten aufnimmt, kann `ibanSchema` (non-null, required) verwendet werden — dort ist IBAN Pflicht.
- Prüfen, ob CRM-Adressen (`crm-address-service.ts`) eine eigene Zod-Validierung haben; sonst dort ebenfalls `ibanNullableSchema` einbinden. Alle Stellen sind via `grep "iban.*z\." src/` auffindbar.
