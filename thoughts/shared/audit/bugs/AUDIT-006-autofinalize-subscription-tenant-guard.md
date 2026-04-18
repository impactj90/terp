# AUDIT-006 — Platform Autofinalize-Cron: Tenant-Guard beim Subscription-Load ergänzen

| Field               | Value                                             |
| ------------------- | ------------------------------------------------- |
| **Priority**        | P2                                                |
| **Category**        | 7. Finanzdaten / 2. Platform-Auth                  |
| **Severity**        | MEDIUM (Defense-in-Depth)                          |
| **Audit Source**    | 2026-04-17 Security Audit (SEC-006)                |
| **Estimated Scope** | 1 Service-File + 1 Test                            |

---

## Problem

Der tägliche Cron `autofinalizePending` lädt `platformSubscription`-Zeilen ohne Einschränkung auf Tenant-Herkunft. Nachgelagerte `billingRecurringInvoice.findFirst` und `billingDocument.findFirst` filtern zwar explizit auf `operatorTenantId` — damit ist der aktuelle Code nicht direkt ausnutzbar. Aber die Defense-in-Depth fehlt: Sobald ein Refactor den Tenant-Filter in einer der Follow-up-Queries kürzt (etwa zur Performance-Optimierung) oder sobald eine `platformSubscription`-Zeile über einen neuen Weg in die DB gelangt, fehlt der äußere Boundary-Check. Da der Cron mit CRON_SECRET-Auth läuft und im Namen des Platform-Systems Finalize-Operationen ausführt, ist eine defensive Begrenzung essenziell.

## Root Cause

Initialer Load ohne Tenant-Constraint:

```ts
// ❌ src/lib/platform/subscription-autofinalize-service.ts:78-88
const subs = await prisma.platformSubscription.findMany({
  where: {
    status: "active",
    billingRecurringInvoiceId: { not: null },
    // ⚠️ Kein Filter auf sub.tenantId — alle Tenants werden gescannt
  },
  select: {
    id: true,
    billingRecurringInvoiceId: true,
    lastGeneratedInvoiceId: true,
  },
})
```

## Required Fix

Guard am Anfang der Schleife oder direkt im `findMany`-Where:

```ts
// ✅ Variante A — im Query
const subs = await prisma.platformSubscription.findMany({
  where: {
    status: "active",
    billingRecurringInvoiceId: { not: null },
    tenantId: { not: operatorTenantId },  // ⚠️ Operator-self-billing ausschließen
  },
  select: { id: true, tenantId: true, billingRecurringInvoiceId: true, lastGeneratedInvoiceId: true },
})

// ✅ Variante B — als defensiver Loop-Guard
for (const sub of subs) {
  if (sub.tenantId === operatorTenantId) {
    // House-Tenant-Rule: Operator wird nie gegen sich selbst gefinalized
    continue
  }
  // ... restliche Logik
}
```

Beide Varianten zusammen (Belt-and-Suspenders) sind in Defense-in-Depth-Spirit sinnvoll.

## Affected Files

| File                                                             | Line(s) | Specific Issue                                          |
| ---------------------------------------------------------------- | ------- | ------------------------------------------------------- |
| `src/lib/platform/subscription-autofinalize-service.ts`          | 78-88   | Subscription-Load ohne Tenant-Guard                     |
| `src/lib/platform/subscription-autofinalize-service.ts`          | 96-102  | Loop-Start — zusätzlicher Self-Bill-Guard empfohlen     |
| `src/lib/platform/__tests__/subscription-autofinalize-service.test.ts` (falls vorhanden) | — | Test für Self-Bill-Ausschluss |

## Verification

### Automated

- [ ] Neuer Unit-Test: Fake-`PlatformSubscription` mit `tenantId = operatorTenantId` einfügen, Cron laufen lassen → Row wird übersprungen, kein `finalize`-Call
- [ ] Neuer Unit-Test: Fake-`PlatformSubscription` mit `tenantId` eines anderen (nicht-existenten) Tenants + manipulierter `billingRecurringInvoiceId` → kein Match in operator-scoped `findFirst`, `skippedNoDraftFound++`
- [ ] `pnpm test` inkl. bestehender Autofinalize-Tests
- [ ] `pnpm typecheck`, `pnpm lint`

### Manual

- [ ] Auf Staging: `PLATFORM_OPERATOR_TENANT_ID` setzen, mehrere aktive Subscriptions aus verschiedenen Tenants haben, Cron manuell triggern (`/api/cron/platform-subscription-autofinalize` mit CRON_SECRET)
- [ ] Summary-Response: `scanned` zählt nur Nicht-Operator-Subscriptions, keine `finalizeFailed`-Einträge durch den Guard
- [ ] Operator-Tenant: Keine neuen `platform_audit_logs`-Rows mit `action = "subscription.invoice_auto_finalized"` für Self-Bill

## What NOT to Change

- `createSubscription`-Guard via `isOperatorTenant()` in `subscription-service.ts` — bleibt als erste Verteidigungslinie
- Der Shared-Doc-Idempotenz-Guard (`finalizedThisRun` Set, L94-170) — unverändert
- Die `sweepEndedSubscriptions`-Logik (L204-209) — separater Zuständigkeitsbereich
- `billingDocumentService.finalize` (L154-159) — das ist die bereits-getestete Terp-Service-Kante

## Notes for Implementation Agent

- Der Fix ist klein, aber die Testabdeckung ist der wichtigere Teil. Beide Negativszenarien (Self-Bill-Subscription-Row + Fremd-Tenant-Subscription ohne matching Recurring) müssen abgedeckt werden.
- `serverEnv.platformOperatorTenantId` ist an L64-68 bereits validiert (Cron tut nichts ohne diesen Env). Innerhalb des Loops kann `operatorTenantId` also als non-null angenommen werden.
- Existieren bereits Tests: prüfen, ob Test-Setup `platformSubscriptionFactory` oder ähnliches hat — Pattern wiederverwenden. Sonst mit `prisma.platformSubscription.create` direkt im Test befüllen.
- Audit-Log-Write bei Skip: KEIN neuer `platform_audit_logs`-Eintrag — der Skip ist ein Non-Event. Nur `summary.endedSubscriptions` oder ein neuer Counter `summary.skippedOperatorSelf` zur Observability ergänzen.
