# AUDIT-007 — Platform-Subscription-Marker als dedizierte Column statt Substring in `internalNotes`

| Field               | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| **Priority**        | P2                                                            |
| **Category**        | 7. Finanzdaten                                                 |
| **Severity**        | MEDIUM                                                        |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-007)                            |
| **Estimated Scope** | 1 Migration + 5 Service-/Router-Files + Daten-Backfill         |

---

## Problem

Platform-Abonnement-Rechnungen werden per Substring `[platform_subscription:<uuid>]` in `BillingDocument.internalNotes` markiert. Ein Tenant-User mit DRAFT-Edit-Rechten auf Billing-Dokumente kann diesen Marker in eigene Rechnungen kopieren und damit (a) das Mahnwesen aushebeln (`reminder-eligibility-service.ts` filtert die Rechnung weg), (b) den Bank-Transaction-Matcher aushebeln (Rechnung erscheint nicht in Match-Kandidaten) und (c) die `lastUnmatched`-Statistik manipulieren. Das bedeutet: ein Tenant-interner Akteur kann einzelne Rechnungen still aus der Automatisierung herausnehmen. Zudem ist die Substring-Kopplung fragile — jeder künftige Refactor am Notes-Feld (z.B. Copy-Paste, Reimport) kann den Marker versehentlich zerstören und korrekte Platform-Subscriptions fälschlich in die Dunning-Pipeline kippen.

## Root Cause

Semantisches Metadatum in einem freien Textfeld, detektiert per `.includes(...)`:

```ts
// ❌ src/lib/platform/subscription-service.ts:286-300
export function platformSubscriptionMarker(subscriptionId: string): string {
  return `[platform_subscription:${subscriptionId}]`
}
export const PLATFORM_SUBSCRIPTION_MARKER_PREFIX = "[platform_subscription:"
export function hasPlatformSubscriptionMarker(notes: string | null | undefined): boolean {
  return (notes ?? "").includes(PLATFORM_SUBSCRIPTION_MARKER_PREFIX)
}
```

Marker wird in `subscription-service.ts:460` beim Invoice-Template-Setup gesetzt und in drei unabhängigen Consumern konsumiert:
- `src/lib/services/reminder-eligibility-service.ts:181`
- `src/lib/services/bank-transaction-matcher-service.ts:82, 617`
- `src/trpc/routers/bankStatements.ts:360`
- `src/lib/platform/subscription-autofinalize-service.ts:118-127`

## Required Fix

Dedizierte, FK-artige Column auf `BillingDocument` und `BillingRecurringInvoice` einführen; Consumers auf diese Column umstellen; `internalNotes` bleibt freies Nutzerfeld.

```sql
-- ✅ supabase/migrations/<timestamp>_billing_document_platform_subscription.sql
ALTER TABLE billing_documents
  ADD COLUMN platform_subscription_id UUID REFERENCES platform_subscriptions(id) ON DELETE SET NULL;
CREATE INDEX idx_billing_documents_platform_subscription
  ON billing_documents (tenant_id, platform_subscription_id)
  WHERE platform_subscription_id IS NOT NULL;

ALTER TABLE billing_recurring_invoices
  ADD COLUMN platform_subscription_id UUID REFERENCES platform_subscriptions(id) ON DELETE SET NULL;

-- Backfill: bestehende Marker aus internalNotes in die neue Column übertragen
UPDATE billing_documents
SET platform_subscription_id = substring(internal_notes FROM '\[platform_subscription:([0-9a-f-]{36})\]')::uuid
WHERE internal_notes ~ '\[platform_subscription:[0-9a-f-]{36}\]';
-- Analog für billing_recurring_invoices
```

Consumer-Update: statt `hasPlatformSubscriptionMarker(doc.internalNotes)` in SQL-Filtern `where: { platformSubscriptionId: null }` bzw. `{ not: null }` verwenden. `platformSubscriptionMarker` und `hasPlatformSubscriptionMarker` entfernen oder als Deprecated für 1 Release behalten.

```ts
// ✅ src/lib/services/reminder-eligibility-service.ts:181
if (doc.platformSubscriptionId !== null) {
  return makeIneligible(doc, "platform_subscription")
}
```

## Affected Files

| File                                                                 | Line(s)         | Specific Issue                                    |
| -------------------------------------------------------------------- | --------------- | ------------------------------------------------- |
| `supabase/migrations/<new>.sql` (NEU)                                | —               | Schema + Backfill                                 |
| `prisma/schema.prisma`                                               | —               | `BillingDocument`, `BillingRecurringInvoice`, `PlatformSubscription` erweitern |
| `src/lib/platform/subscription-service.ts`                           | 286-300, 335-349, 460 | Marker-Helpers entfernen, Write auf Column umstellen |
| `src/lib/services/reminder-eligibility-service.ts`                   | 2, 181          | Import + Check auf Column umstellen               |
| `src/lib/services/bank-transaction-matcher-service.ts`               | 5, 82, 617      | Check auf Column umstellen                        |
| `src/trpc/routers/bankStatements.ts`                                 | 12, 360         | Check auf Column umstellen                        |
| `src/lib/platform/subscription-autofinalize-service.ts`              | 30, 118-127     | Marker-Query durch Column-Query ersetzen          |
| `src/lib/platform/__tests__/subscription-service.test.ts`            | 18-19, 173-174, 222-249 | Marker-Tests anpassen / entfernen               |
| `src/lib/services/__tests__/bank-transaction-matcher-credit.test.ts` | 17, 31, 100, 103, 242 | Mocks auf Column umstellen                        |
| `src/lib/services/__tests__/bank-transaction-matcher-debit.test.ts`  | 17              | Mocks auf Column umstellen                        |
| `src/trpc/routers/__tests__/bankStatements-router.test.ts`           | 44              | Mocks auf Column umstellen                        |

## Verification

### Automated

- [ ] Migration läuft gegen bestehende Staging-DB: `pnpm db:push:staging`
- [ ] Backfill-Query setzt für alle vorherigen Platform-Subscriptions den richtigen FK
- [ ] Alle Tests in den oben gelisteten Test-Files grün, inkl. angepasster Mocks
- [ ] Neuer Test: Tenant-User injiziert `[platform_subscription:xxx]` manuell in `internalNotes` → Dunning-Eligibility findet die Rechnung weiterhin (neue Column ist NULL → nicht geblockt)
- [ ] `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Staging: Platform-Subscription erzeugen → neuer FK `platformSubscriptionId` auf DRAFT-Rechnung korrekt gesetzt
- [ ] Autofinalize-Cron läuft durch; findet Rechnungen über Column, nicht über Notes
- [ ] Mahnwesen übergeht Platform-Subscription-Rechnungen (Eligibility-Reason: "platform_subscription")
- [ ] Manueller Spoof-Test: Tenant-User ändert `internalNotes` einer eigenen Rechnung auf `[platform_subscription:foo]` → Rechnung bleibt in Dunning-Kandidaten (weil `platformSubscriptionId IS NULL`)

## What NOT to Change

- Semantik des `internalNotes`-Feldes ansonsten — freies Feld bleibt frei
- Vorhandene `internalNotes`-Daten außerhalb des Platform-Subscription-Markers — Backfill fasst nur Rows mit exaktem Pattern an
- `platform_subscriptions`-Tabelle selbst — keine Spalten-Änderung dort nötig
- Dunning-Engine-Logik jenseits der Marker-Check-Zeile — Behavior unverändert

## Notes for Implementation Agent

- Reihenfolge der Migration: **erst Column hinzufügen + backfillen**, **dann Code-Release**, **dann in einem späteren Release die alten Marker-Helper entfernen**. Wenn der Agent alles in einem PR erledigt, sicherstellen, dass der Backfill im Rollout als erstes läuft — sonst ist die neue Column beim App-Start leer und der alte Code-Pfad würde weiterhin `.includes(...)` aufrufen.
- Prisma-Client generiert neu nach Schema-Änderung: `pnpm db:generate` ausführen.
- Konsum-Sites müssen beim `select` in Repositories `platformSubscriptionId: true` aufnehmen, falls der Type ausgegeben wird. Grep nach allen `select: { ... internalNotes: true`-Stellen, die aktuell das Feld für den Marker-Check mitladen — dort ist die Umstellung notwendig, aber `internalNotes: true` darf bleiben.
- Für den `autofinalize-service`: Statt `internalNotes: { contains: marker }` (L119-127) auf `platformSubscriptionId: sub.id` wechseln — erledigt zugleich das Substring-Enumeration-Performance-Problem.
- Beim Backfill: Schema-Regex für UUIDv4 (`[0-9a-f-]{36}`) hinreichend; echte UUID-Validierung kann optional via `uuid_or_null` PL/pgSQL-Funktion erfolgen, wenn Invalid-Markers existieren.
- Audit-Log-Einträge: bestehende `platform_audit_logs`-Semantik bleibt; das Feld `entityId` referenziert weiterhin `billing_document.id`.
- Dieses Ticket berührt dieselbe Kern-Logik wie AUDIT-006. Nicht gleichzeitig implementieren — AUDIT-006 zuerst (1-Zeilen-Guard), dann AUDIT-007 (strukturelle Änderung).
