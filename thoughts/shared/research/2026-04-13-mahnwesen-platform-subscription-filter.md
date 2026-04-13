---
date: 2026-04-13
researcher: tolga
git_commit: bde3e7f2b8002521483113f50b161f1c24d6ac77
branch: master
repository: terp
topic: "Mahnwesen pre-launch blocker — Ausschluss von Platform-Subscription-Rechnungen"
tags: [research, mahnwesen, reminder-eligibility, platform-subscription, house-tenant]
status: complete
last_updated: 2026-04-13
last_updated_by: tolga
---

# Research: Mahnwesen pre-launch blocker — Platform-Subscription-Rechnungen aus D5 ausschließen

**Date**: 2026-04-13
**Researcher**: tolga
**Git Commit**: bde3e7f2b8002521483113f50b161f1c24d6ac77
**Branch**: master
**Repository**: terp

## Research Question

Wie muss der Mahn-Eligibility-Filter im House Tenant erweitert werden, damit Platform-Subscription-Rechnungen (Marker `[platform_subscription:<uuid>]` in `internalNotes`) nicht versehentlich gemahnt werden? Reine Bestandsaufnahme, keine Designvorschläge.

## Summary

- Der D5-Filter lebt in `src/lib/services/reminder-eligibility-service.ts` als lineare Kette von `if → makeIneligible(reason)`-Returns innerhalb von `evaluateInvoice`.
- `internalNotes` wird im Kandidaten-Query **nicht explizit selektiert** — der `findMany` nutzt `include` ohne `select`, also kommt das Feld implizit mit durch.
- Der Marker wird über einen zentralen Helper `platformSubscriptionMarker(subscriptionId)` in `src/lib/platform/subscription-service.ts:286` generiert. Format: `[platform_subscription:<uuid>]`, bei mehreren Subscriptions pro Recurring Invoice space-separiert via `appendMarker`.
- Der Autofinalize-Cron nutzt denselben Helper und matched via Prisma-`contains` (Substring). Ein `contains "[platform_subscription:"`-Check ist daher ausreichend, egal wie viele Marker im Feld stehen.
- `BillingRecurringInvoice.internalNotes` wird bei der Generierung des DRAFT-BillingDocuments 1:1 kopiert (`billing-recurring-invoice-service.ts:357`), d. h. der Marker landet unverändert am finalen INVOICE-Dokument.
- Es existiert **keine weitere Marker-Konvention** im Codebase — nur der Platform-Subscription-Marker wird als bracketierter, maschinenlesbarer Prefix in `internalNotes` geschrieben.
- Unit-Test-Matrix liegt in `src/lib/services/__tests__/reminder-eligibility-service.test.ts`; E2E-Seed für UC-DUN-01 in `src/e2e-browser/global-setup.ts`.
- Handbuch-Kapitel `22.17 Mahnwesen` lebt in `docs/TERP_HANDBUCH.md`; die Mahnsperre-Sektion ist `22.17.6` (Zeilen 10948–10975), darauf folgt `22.17.7 Cron-Job und Benachrichtigungen` (ab Zeile 10976).

## Detailed Findings

### 1. Aktueller Filter-Stand im reminder-eligibility-service

**Datei**: `src/lib/services/reminder-eligibility-service.ts`

**Kandidaten-Query** (Zeilen 76–87) — `internalNotes` wird implizit mitgeliefert, da nur `include` gesetzt ist, kein `select`:

```ts
const candidates: CandidateDoc[] = await prisma.billingDocument.findMany({
  where: {
    tenantId,
    type: "INVOICE",
    status: { in: ["PRINTED", "FORWARDED", "PARTIALLY_FORWARDED"] },
  },
  include: {
    payments: true,
    childDocuments: true,
    address: true,
  },
})
```

**D5-Filter-Kette** in `evaluateInvoice` (Zeilen 164–224) — Reihenfolge bestimmt den `reason`, den der erste fehlschlagende Filter zurückgibt:

```ts
if (doc.type !== "INVOICE") return makeIneligible(doc, "wrong_type")
if (doc.paymentTermDays === null || doc.paymentTermDays === undefined) {
  return makeIneligible(doc, "no_payment_term")
}
if (doc.dunningBlocked) return makeIneligible(doc, "invoice_blocked")
if (doc.address?.dunningBlocked) {
  return makeIneligible(doc, "customer_blocked")
}
// ... dueDate / daysOverdue / grace / openAmount / skonto / maxLevel
```

**EligibilityReason-Union** (Zeilen 16–28):

```ts
export type EligibilityReason =
  | "ok"
  | "no_payment_term"
  | "wrong_status"
  | "wrong_type"
  | "not_overdue_yet"
  | "in_grace_period"
  | "fully_paid"
  | "invoice_blocked"
  | "customer_blocked"
  | "in_discount_period"
  | "max_level_reached"
  | "dunning_disabled"
```

Die natürlichen Einfüge-Punkte für einen zusätzlichen Filter liegen früh in der Kette — die bestehenden "Block"-Filter `invoice_blocked` / `customer_blocked` gruppieren thematisch verwandte harte Ausschlüsse. `internalNotes` ist im Kandidaten-Result bereits vorhanden (siehe oben), daher ist keine Query-Erweiterung nötig.

### 2. Marker-Format und Stabilität

**Zentraler Helper** — `src/lib/platform/subscription-service.ts:286-288`:

```ts
export function platformSubscriptionMarker(subscriptionId: string): string {
  return `[platform_subscription:${subscriptionId}]`
}
```

**Append-Helper** (Zeilen 318–325) — mehrere Marker werden space-separiert:

```ts
export function appendMarker(existingInternalNotes: string | null, subscriptionId: string): string {
  const marker = platformSubscriptionMarker(subscriptionId)
  const existing = (existingInternalNotes ?? "").trim()
  return existing.length > 0 ? `${existing} ${marker}` : marker
}
```

**Remove-Helper** (Zeilen 332–342) — Inverses; splittet auf `\s+` und filtert per Token-Equality. Wird von `cancelSubscription` genutzt.

**Schreib-Stellen** (alle in `subscription-service.ts`):
- Zeile 447: `createSubscription` Path A (neue Recurring Invoice): `internalNotes: platformSubscriptionMarker(sub.id)`
- Zeilen 457, 465: `createSubscription` Path B (bestehende shared Recurring Invoice): `appendMarker(existingRecurring.internalNotes, sub.id)` → update
- Zeilen 618, 626: `cancelSubscription`: `removeMarker(...)` → update

**Lese-Stelle** (Autofinalize-Cron) — `src/lib/platform/subscription-autofinalize-service.ts:118-127`:

```ts
const marker = platformSubscriptionMarker(sub.id)
const docByMarker = await prisma.billingDocument.findFirst({
  where: {
    tenantId: operatorTenantId,
    type: "INVOICE",
    internalNotes: { contains: marker },
  },
  orderBy: { createdAt: "desc" },
  select: { id: true, status: true },
})
```

Autofinalize importiert `platformSubscriptionMarker` aus `subscription-service.ts` (Zeile 30). **Keine duplizierten String-Literale** zwischen Schreib- und Leseseite.

**Propagation Recurring → BillingDocument** — `src/lib/services/billing-recurring-invoice-service.ts:357`:

```ts
internalNotes: template.internalNotes,
```

Die `generate()`-Funktion kopiert das `internalNotes`-Feld des Recurring-Invoice-Templates wörtlich auf das neu erzeugte `BillingDocument`. Keine Transformation. Der Marker landet damit 1:1 am INVOICE-Dokument, das vom Mahn-Eligibility-Service als Kandidat gescannt wird.

**Mehrere Marker pro Dokument möglich?** — Ja, bestätigt. Shared-Invoice-Modell ist explizit implementiert. Wenn ein zweites Modul für dieselbe `(operatorTenantId, crmAddressId, interval)`-Kombination gebucht wird, trifft `createSubscription` den `existingRecurring`-Zweig und appendet den zweiten Marker. Test-Evidenz in `src/lib/platform/__tests__/subscription-service.test.ts:183-184`:

```ts
expect(appendMarker("[platform_subscription:a]", "b")).toBe(
  "[platform_subscription:a] [platform_subscription:b]",
)
```

**Konsequenz für den neuen Filter**: Ein `contains "[platform_subscription:"`-Check (ohne UUID) ist unabhängig von der Anzahl der Marker korrekt. Alternativ ist der Helper wiederverwendbar, indem der neue Filter den **Prefix** `"[platform_subscription:"` oder eine Regex `/\[platform_subscription:/` prüft — dafür müsste der Helper allerdings um einen Prefix-Export erweitert werden, da `platformSubscriptionMarker` eine konkrete UUID braucht.

**Seed-Daten** — `supabase/seed.sql:4666` enthält den Marker hardcoded als Literal (`'[platform_subscription:50000000-... ] [platform_subscription:50000000-...]'`).

### 3. Existierende Tests, die tangential betroffen sein könnten

**Direkte D5-Filter-Matrix** (einziger Test, der den realen Filter durchläuft):

- `src/lib/services/__tests__/reminder-eligibility-service.test.ts` — Primäres Unit-Test-Suite mit zwei `describe`-Blöcken:
  - "evaluateInvoice — D5 filter matrix": 14 `it`-Cases (`no_payment_term`, `wrong_type`, `invoice_blocked`, `customer_blocked`, `in_grace_period`, `not_overdue_yet`, `fully_paid`, Skonto-Fenster, `max_level_reached`, Happy-Path `ok` mit Zins).
  - "listEligibleInvoices": 5 `it`-Cases (disabled short-circuit, Grouping+fee-per-group, Level-Eskalation, Nicht-eligible filter-out, Sort nach customer name).
  - Fixture-Builder (~Zeile 64) setzt `type: "INVOICE"` und **kein** `internalNotes`. Kein bestehender Platform-Subscription-Marker.
  - **Würde bei neuem Filter angepasst werden**: eigener `it`-Case für Marker-present/absent erforderlich.

**Tests, die die Eligibility mocken (bleiben unberührt)**:

- `src/trpc/routers/__tests__/reminders-router.test.ts` — mockt `listEligibleInvoices` via `vi.fn()` (Zeile 36). 25 `it`-Cases.
- `src/lib/services/__tests__/reminder-service.test.ts` — Spies auf `eligibilityService.listEligibleInvoices` (Zeilen 145, 368).
- `src/app/api/cron/dunning-candidates/__tests__/route.test.ts` — mockt `listEligibleInvoices` (Zeile 41).

**Supporting-Tests ohne Filter-Involvement**:

- `src/lib/services/__tests__/reminder-level-helper.test.ts`
- `src/lib/services/__tests__/reminder-settings-service.test.ts`
- `src/lib/services/__tests__/reminder-template-service.test.ts`
- `src/lib/services/__tests__/dunning-interest-service.test.ts`

**E2E Browser-Test**:

- `src/e2e-browser/53-mahnwesen-happy-path.spec.ts` — `UC-DUN-01: Mahnwesen Happy Path (D7)`, 6 Browser-Tests gegen `/orders/dunning`.
- `src/e2e-browser/global-setup.ts` — SQL-Seed-Block (Zeilen ~308–395) erzeugt E2E-Mahnwesen-Kunden und zwei überfällige `INVOICE`-Dokumente (`E2E-MAHN-RE-001`, `E2E-MAHN-RE-002`). **Kein** `internal_notes`/Marker-Write auf diesen Seed-Invoices. Würde nur inspiziert werden müssen, falls der neue Filter die Seed-Invoices unerwartet ausschließt.

**House-Tenant-spezifische Integration-Tests für Eligibility**: **Keine gefunden**. Es gibt keinen Test, der `PLATFORM_OPERATOR_TENANT_ID` setzt und dann durch den D5-Filter läuft. Die Platform-Tests stehen isoliert in `src/lib/platform/__tests__/`:

- `src/lib/platform/__tests__/subscription-service.integration.test.ts` — Echter DB-Test; erzeugt `BillingRecurringInvoice` mit korrektem Marker in `internalNotes` (Zeilen 249, 324, 327, 387, 390, 534, 537, 540); Stubs `PLATFORM_OPERATOR_TENANT_ID` (Zeile 79). Testet keine Dunning-Integration.
- `src/lib/platform/__tests__/subscription-service.test.ts` — Unit-Test (mocked Prisma) für `platformSubscriptionMarker`, `appendMarker`, `removeMarker`, `createSubscription`, `cancelSubscription`.
- `src/lib/platform/__tests__/subscription-autofinalize-service.test.ts` — Unit-Test für Autofinalize-Cron; testet `contains`-Match-Query (Zeile 268).

**Test-Helper / Seed-Direktorien**:

- `src/test-utils/` — existiert nicht
- `src/lib/test-helpers/` — existiert nicht
- `prisma/seed*` — keine Seed-Files
- Globale tRPC-Helper (`src/trpc/routers/__tests__/helpers.ts`, `src/trpc/platform/__tests__/helpers.ts`) enthalten keine Platform-Subscription-Invoice-Fabrik.

### 4. Weitere potenzielle Filter-Kandidaten

**Ergebnis**: Es existiert **keine weitere strukturierte Marker-Konvention** in `internalNotes` im gesamten Codebase.

Grep-Survey über alle Writes auf `BillingDocument.internalNotes` und `BillingRecurringInvoice.internalNotes`:

| Stelle | Write-Path | Inhalt |
|---|---|---|
| `src/lib/services/billing-document-service.ts:316` | `create()` | Free-text aus `input.internalNotes` |
| `src/lib/services/billing-document-service.ts:684` | Document clone / forward | Plain-Copy `existing.internalNotes` |
| `src/lib/services/billing-document-service.ts:760` | `cancel()` | Free-text `reason`-String vom Caller |
| `src/lib/services/billing-document-service.ts:865` | Credit-Note creation | Plain-Copy `existing.internalNotes` |
| `src/lib/services/billing-recurring-invoice-service.ts:171` | `create()` recurring template | Free-text aus `input.internalNotes` |
| `src/lib/services/billing-recurring-invoice-service.ts:357` | `generateDue()` — Generation aus Template | Plain-Copy `template.internalNotes` |
| `src/lib/services/billing-recurring-invoice-repository.ts:102` | Repository `create()` | Passthrough `data.internalNotes` |
| `supabase/seed.sql:2783` | Seed — recurring invoice WR-1 | `'Vertragslaufzeit: unbefristet, 3 Monate Kündigungsfrist'` |
| `supabase/seed.sql:2840` | Seed — recurring invoice WR-3 | `'Vertrag ausgelaufen. Kunde hat Verlängerung abgelehnt (Haushaltssperre).'` |
| `supabase/seed.sql:4666` | Seed — operator-tenant recurring | `[platform_subscription:<id>] [platform_subscription:<id>]` |

Keine `[demo:`, `[test:`, `[import:`, `[migration:`, `[crm:`, `[skonto:`, `[auto:`, `[system:`, `[legacy:`-Marker gefunden. Kein CRM-Import-Tool und keine Migration schreibt strukturierte Prefixes in `internalNotes`. Der im Integration-Test `subscription-service.integration.test.ts:532` vorkommende "CRM marker"-Kommentar ist ein Label für einen `[platform_subscription:...]`-Marker, der zufällig zum CRM-Modul gehört — keine eigene Marker-Form.

### 5. Handbuch

**Datei**: `docs/TERP_HANDBUCH.md` (einziges aktives Handbuch; kein V2 vorhanden). Build-Artefakt-Kopie liegt unter `.next/standalone/docs/TERP_HANDBUCH.md`.

**Kapitel 22.17 Mahnwesen** — Heading Zeile 10786. Kapitel reicht von Zeile 10786 bis 11080 (Zeile 11081 beginnt `## 23. Glossar`).

**Unterabschnitte (`####`)**:

| Zeile | Heading |
|-------|---------|
| 10802 | `22.17.1 Seitenstruktur` |
| 10819 | `22.17.2 Einstellungen` |
| 10846 | `22.17.3 Vorlagen` |
| 10873 | `22.17.4 Vorschlag` |
| 10910 | `22.17.5 Mahnläufe und Detail-Sheet` |
| **10948** | **`22.17.6 Mahnsperre — Kunden oder einzelne Rechnungen ausschließen`** |
| 10976 | `22.17.7 Cron-Job und Benachrichtigungen` |
| 10989 | `22.17.8 Praxisbeispiele` |

**Mahnsperre-Sektion** — Zeilen 10948–10975; danach folgt unmittelbar `22.17.7 Cron-Job und Benachrichtigungen` ab Zeile 10976.

**Praxisbeispiele (`#####`) in 22.17.8**:

| Zeile | Heading |
|-------|---------|
| 10991 | Beispiel 1: Ersteinrichtung — Mahnwesen aktivieren und den ersten Lauf durchführen |
| 11019 | Beispiel 2: Eine einzelne Rechnung von der Sammelmahnung ausschließen |
| 11034 | Beispiel 3: Versendete Mahnung stornieren — Kunde hat am Tag des Versands bezahlt |
| 11051 | Beispiel 4: Kunde in Insolvenz — Kunden-Mahnsperre setzen |
| 11067 | Beispiel 5: Der Vorschlag ist leer — was jetzt? |

**Terme im Mahnwesen-Kapitel**: Null Treffer für `Platform-Subscription`, `platform_subscription`, `House Tenant`, `Operator` (im Platform-Sinn), `ausgenommen`, `Ausnahme`, `Ausschluss` innerhalb Zeilen 10786–11080.

## Implementierungs-Oberfläche

Dateien, die ein späterer Plan anfassen müsste, gruppiert nach Zweck:

**Filter-Implementierung** (Produktiv-Code):
- `src/lib/services/reminder-eligibility-service.ts` — neuer Filter-Branch in `evaluateInvoice`, neue Variante in `EligibilityReason`-Union.
- *(eventuell)* `src/lib/platform/subscription-service.ts` — zusätzlicher Export eines Prefix-Konstants oder einer `hasPlatformSubscriptionMarker(notes)`-Helper-Funktion, falls der Eligibility-Filter den Prefix-Check nicht als lokales String-Literal duplizieren soll.

**Tests**:
- `src/lib/services/__tests__/reminder-eligibility-service.test.ts` — neue `it`-Cases für den Filter (Marker present → neuer Reason; Marker absent → Fall-through).
- *(optional)* `src/e2e-browser/global-setup.ts` — falls die E2E-Seed-Invoices einen Negativ-Case abbilden sollen.

**Handbuch**:
- `docs/TERP_HANDBUCH.md` — neuer Unterabschnitt innerhalb 22.17, thematisch passend nach `22.17.6 Mahnsperre` und vor `22.17.7 Cron-Job und Benachrichtigungen` (Einfügebereich ab Zeile 10976).

**Nicht betroffen** (mocken oder umgehen den Filter vollständig):
- `src/trpc/routers/__tests__/reminders-router.test.ts`
- `src/lib/services/__tests__/reminder-service.test.ts`
- `src/app/api/cron/dunning-candidates/__tests__/route.test.ts`
- `src/lib/platform/__tests__/subscription-*.test.ts`
