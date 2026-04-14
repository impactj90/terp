---
date: 2026-04-14
author: Tolga Ayvazoglu (planned with Claude Code)
branch: staging
status: ready
related_research: thoughts/shared/research/2026-04-13-camt053-import.md
---

# CAMT-Preflight: 3 Vorarbeiten (IBAN-Unique, Mahnwesen-Refresh, InboundInvoice Payment-Status)

## Overview

Drei Vorarbeiten umsetzen, die das CAMT-Research als Gaps/Risiken identifiziert
hat. CAMT-Import selbst ist **nicht** Teil dieses Plans. Jedes der drei Items
steht eigenständig und ist auch ohne CAMT produktiv nutzbar.

1. **Phase 1** — `CrmBankAccount` bekommt einen Composite-Index und eine
   Composite-Unique-Constraint auf `(tenant_id, iban)`, inklusive Dedup-
   Migration.
2. **Phase 2** — `ReminderItem.openAmountAtReminder` wird für DRAFT-Mahnungen
   beim Laden und beim Versand live refresht (nur Betrag, nicht Stufe/Tage).
3. **Phase 3** — `InboundInvoice` bekommt ein echtes gespeichertes
   `paymentStatus`-Feld plus das neue Modell `InboundInvoicePayment` analog
   zu `BillingPayment`. Schreibpfade: `PaymentRun.markBooked()` +
   `InboundInvoicePayment.create()` + `InboundInvoicePayment.cancel()`. UI:
   neuer „Zahlung erfassen"-Button auf der Eingangsrechnungs-Detailseite.

## Current State Analysis

### Item 1 — IBAN

- `CrmBankAccount` (`prisma/schema.prisma:557-581`, Migration
  `supabase/migrations/20260101000095_create_crm_tables.sql:77-91`):
  - `iban VARCHAR(34) NOT NULL` — Klartext, kein Encryption.
  - `@@index([addressId])` und `@@index([tenantId])` vorhanden —
    **kein Index auf `iban`, keine Unique-Constraint**.
- Write-Pfade: `crm-address-service.ts:736-777` (create),
  `crm-address-service.ts:780-827` (update). Beide normalisieren die IBAN
  via `.trim().replace(/\s/g, "").toUpperCase()`. Weder Create noch Update
  fangen P2002.
- FK-Situation: **Keine Tabelle referenziert `crm_bank_accounts.id`** (Grep
  `REFERENCES crm_bank_accounts` → 0 Treffer, kein Prisma-Modell mit
  Relation zurück). Dedup per `DELETE` ist daher ohne FK-Impact möglich.
- Existierende Leser: `crm-address-repository.ts:220-228` (findBankAccounts
  by addressId), `payment-run-data-resolver.ts:354-362` (nested-read via
  `crmAddress.bankAccounts` include). Keiner liest per IBAN.

### Item 2 — Mahnwesen DRAFT-Refresh

- `ReminderItem` (`prisma/schema.prisma:1307-1329`) speichert
  `openAmountAtReminder`, `originalAmount`, `daysOverdue`, `interestAmount`,
  `levelAtReminder` als Snapshot zur Create-Zeit.
- Live-Formel (`reminder-eligibility-service.ts:196-208`):
  ```ts
  const creditNoteReduction = (doc.childDocuments ?? [])
    .reduce((sum, cn) => sum + cn.totalGross, 0)
  const effectiveTotalGross = doc.totalGross - creditNoteReduction
  const paidAmount = (doc.payments ?? [])
    .filter((p) => p.status === "ACTIVE")
    .reduce((sum, p) => sum + p.amount, 0)
  const openAmount = Math.max(0, effectiveTotalGross - paidAmount)
  ```
- `areAnyItemsStillOpen()` (`reminder-service.ts:558-583`) lädt die
  BillingDocuments separat mit `include: { payments: true, childDocuments:
  true }` und re-prüft live — das ist genau die Include-Shape, die wir
  für den Refresh brauchen.
- `reminderRepo.findById()` (`reminder-repository.ts:73-82`) wird vom
  `getRun`-tRPC-Procedure (`routers/billing/reminders.ts:294-311`) für
  die Detail-Ansicht aufgerufen. Aktuell nur `include: { items: true,
  customerAddress: true }` — keine Payments-Kopplung.
- `sendReminder()` (`reminder-service.ts:325-465`) lädt mit demselben
  Include und ruft bei Zeile 355 `areAnyItemsStillOpen` auf. Kein
  Refresh-Schritt.
- `markSentManually()` (`reminder-service.ts:473-551`): derselbe Code-Pfad
  ohne Refresh.
- UI: Detail-Sheet `src/components/billing/dunning/dunning-reminder-detail-
  sheet.tsx:267` zeigt `openAmountAtReminder` 1:1 aus der API.

### Item 3 — InboundInvoice Payment-Status

- `InboundInvoice` (`prisma/schema.prisma:5728-5791`) hat kein `paymentStatus`,
  kein `paidAt`, kein `paidAmount`. Abgeleitet wird heute nur über
  `getPaymentStatus(paymentRunItems)` in `payment-run-data-resolver.ts:72-81`.
- `getPaymentStatus` wird **in Produktion nirgends aufgerufen** — nur
  re-exportiert von `payment-run-service.ts:31` und in
  `__tests__/payment-run-data-resolver.test.ts` getestet. Heißt: die
  Ableitung existiert als Funktion, wird aber nirgendwo gelesen. Das ist
  eine nützliche Basis für den Konsistenz-Check ohne dass wir produktive
  Pfade umstellen müssen.
- `PaymentRun.markBooked()` (`payment-run-service.ts:448-493`) läuft ohne
  `$transaction`, liest via `repo.findById` die volle `PaymentRun`-Row
  inkl. `items` mit `inboundInvoice` select. Die `updated.items[].inboundInvoiceId`
  sind nach dem Status-Update bereits im Speicher — kein Extra-Query nötig.
- `BillingPayment` ist das Vorbild: Prisma-Model (`schema.prisma:1076-1121`),
  Migration (`20260101000101_create_billing_payments.sql`), Service
  (`billing-payment-service.ts:252-437 createPayment`, `:439-502
  cancelPayment`), Repository (`billing-payment-repository.ts`), Router
  (`routers/billing/payments.ts:108-141`), Hook (`use-billing-payments.ts:
  65-119`), UI (`open-item-detail.tsx:153-289`, `payment-form-dialog.tsx`).
- Permissions-Muster: UUIDv5 aus Key, Deklaration in
  `permission-catalog.ts`, Role-Zuweisung per `UPDATE user_groups SET
  permissions = (jsonb_agg(DISTINCT val) ... UNION ALL '<uuid>')` Migration
  — siehe `20260423000001_add_payment_run_permissions_and_module.sql` als
  gelungenes Beispiel.

## Desired End State

**Nach Phase 1:**
- `crm_bank_accounts` hat Composite-Index **und** Unique-Constraint auf
  `(tenant_id, iban)`. Versuch, dieselbe IBAN für zwei verschiedene
  CrmAddresses im selben Tenant anzulegen, wirft `P2002`. Write-Pfade
  fangen das und liefern eine domänenspezifische Fehlermeldung.
- Dedup-Lauf gegen prod und staging ist abgeschlossen; Tolga hat die
  entsprechende Discovery-SQL-Query vor der Deploy-Migration manuell
  ausgeführt und das Ergebnis dokumentiert.

**Nach Phase 2:**
- Beim Öffnen eines DRAFT-Reminders im UI wird `openAmountAtReminder` für
  alle Items live neu berechnet. Items, deren Live-Betrag auf 0 fällt,
  werden aus dem DRAFT entfernt. Falls dadurch der DRAFT leer wird, bleibt
  er sichtbar (kein Auto-Cancel), und das existierende Safety-Net in
  `sendReminder` verhindert den Versand.
- Beim Versand (`sendReminder` + `markSentManually`) läuft derselbe
  Refresh, bevor die Items in die PDF-Generierung gehen. Vollständig
  bezahlte Items werden vorher entfernt.
- `levelAtReminder`, `daysOverdue`, `interestAmount` bleiben historisch
  festgezurrt.

**Nach Phase 3:**
- `InboundInvoice` hat `paymentStatus` (`UNPAID|PARTIAL|PAID`), `paidAt`,
  `paidAmount` als gespeicherte Felder mit Default `UNPAID`/`null`/`0`.
- Neues Modell `InboundInvoicePayment` existiert (Migration, Prisma-Model,
  Repository, Service, Router, Hook).
- `PaymentRun.markBooked()` setzt für alle verknüpften `InboundInvoice`s
  `paymentStatus = PAID`, `paidAmount = totalGross`, `paidAt = now`.
- Jede `InboundInvoicePayment.create()` / `.cancel()` re-berechnet den
  `paymentStatus` per `computeInboundPaymentStatus()`.
- Konsistenz-Check: Überall, wo heute `getPaymentStatus(paymentRunItems)`
  aufgerufen wird (heute nur Tests — aber wir addieren eine aktive
  Aufruf-Stelle im InboundInvoice-List-Read-Pfad), läuft ein Vergleich
  gegen das gespeicherte `paymentStatus`; bei Abweichung Audit-Warning
  `auditLog.log({ action: "consistency_warning", entityType:
  "inbound_invoice", ... })`, nicht blockierend.
- UI: InboundInvoice-Detail hat „Zahlung erfassen"-Button, Zahlungs-
  Historie und `PaymentStatusBadge`. Liste zeigt `paymentStatus` als
  Badge in einer neuen Spalte.
- Permissions `inbound_invoice_payments.{view,create,cancel}` existieren
  und sind ADMIN + BUCHHALTUNG zugewiesen.

### Key Discoveries

- Keine Tabelle referenziert `crm_bank_accounts.id` → Dedup ist ein reiner
  `DELETE`, kein FK-Dance.
- `getPaymentStatus(paymentRunItems)` hat heute **null produktive Aufrufer**
  — d.h. der Konsistenz-Check muss explizit neu verdrahtet werden, nicht
  retroaktiv eingeschleust. Das macht die Migrations-Phase sauberer.
- `PaymentRun.markBooked()` läuft **ohne `$transaction`** — heißt die neue
  InboundInvoice-Update-Schleife muss selbst die Atomicity regeln (entweder
  in eine neue `$transaction` umklammern oder als nicht-atomarer Batch
  akzeptieren). Wir wählen den `$transaction`-Pfad (siehe Phase 3c).
- `BillingPayment` kennt `OVERPAID`, `InboundInvoice` nicht — bewusste
  Entscheidung, das Enum schmaler zu halten.
- `PaymentFormDialog` ist komponenten-lokal an `documentId` gebunden; die
  InboundInvoice-Variante braucht eine separate Komponente, keine
  Generalisierung.

## What We're NOT Doing

- **Kein** CAMT-Parser, kein `BankTransaction`-Modell, keine Matching-Logik,
  kein Upload-UI. (Kommt in einer späteren Runde.)
- **Kein** `OVERPAID`-State auf `InboundInvoice.paymentStatus`.
- **Kein** Skonto auf Eingangsrechnungen (`InboundInvoicePayment.isDiscount`
  existiert nicht).
- **Keine** Generalisierung von `WhSupplierPayment` — bleibt
  warenwirtschafts-spezifisch.
- **Keine** Modifikationen an bestehenden Terp-Services jenseits der drei
  Items. `billing-payment-service.ts` wird nicht angefasst.
- **Kein** Backfill von `paymentStatus` auf historische
  `InboundInvoice`-Rows. Auf prod gibt es zum Deploy-Zeitpunkt keine
  produktiv genutzten InboundInvoice-Daten, daher ist kein Backfill
  nötig. Neue Rechnungen ab Deploy laufen ausschließlich über die
  neuen Schreibpfade (`markInvoicesPaidFromPaymentRun`,
  `InboundInvoicePayment.create/cancel`).
- **Kein** Auto-Cancel von leeren DRAFT-Remindern nach dem Refresh — der
  leere DRAFT bleibt sichtbar, der Operator entscheidet manuell.
- **Kein** Refresh von SENT-Remindern. Einmal gesendet = historisch.

## Implementation Approach

Drei Phasen strikt sequentiell mit manueller Verifikations-Pause dazwischen.
Phase 3 wird in vier Sub-Phasen zerlegt (3a–3d), jede mit eigenem Commit
und eigenem Test-Batch. Kein phasenübergreifendes Refactoring.

Jede Phase liefert einen separaten PR und wird einzeln deployt. Phase 2
kann technisch parallel zu Phase 1 entwickelt werden, aber der Deploy
erfolgt strikt sequentiell, damit Review-Kollisionen ausgeschlossen sind.

---

## Phase 1 — IBAN Unique-Constraint + Index auf `CrmBankAccount`

### Overview

Composite-Index + Composite-Unique-Constraint auf `(tenant_id, iban)`
hinzufügen, mit vorgelagertem Dedup-Schritt in derselben Migration.

### Step 0 — Discovery-Query (vor Implementation) — ✅ DONE (2026-04-14)

**Ergebnis staging**: 0 Duplikate. Baseline: 5 Rows, 1 Tenant, 5 distinct IBANs,
0 leere IBANs.

**Ergebnis prod**: 0 Duplikate. Baseline: 0 Rows (Tabelle leer).

**Konsequenz**: Dedup-`DELETE`-Block und `RAISE EXCEPTION`-Pre-Check in der
Migration sind auf beiden Umgebungen No-Ops. Migration kann ohne manuelle
Vorbereitung deployt werden. Pre-Check bleibt als Defense-in-Depth im
Migrations-File erhalten.

---

Die ursprüngliche Discovery-Query (für Re-Runs gegen andere Umgebungen
oder Restores):

```sql
-- Findet alle (tenant_id, iban)-Duplikate in crm_bank_accounts.
-- Sortiert absteigend nach Anzahl der Duplikate pro Gruppe.
SELECT
  tenant_id,
  iban,
  COUNT(*) AS dupe_count,
  array_agg(id ORDER BY created_at DESC, id DESC) AS ids_newest_first,
  array_agg(address_id ORDER BY created_at DESC, id DESC) AS address_ids,
  array_agg(created_at ORDER BY created_at DESC, id DESC) AS created_ats
FROM crm_bank_accounts
GROUP BY tenant_id, iban
HAVING COUNT(*) > 1
ORDER BY dupe_count DESC, tenant_id;
```

Ergebnis-Interpretation:
- **0 Duplikate**: Dedup-Block in der Migration ist ein No-Op. Direkt
  Unique-Constraint anlegen.
- **Einzelne Duplikate mit identischer `address_id`** (gleiche Adresse,
  mehrfach dieselbe IBAN): echte Duplikate, „keep newest" ist sicher.
- **Duplikate mit unterschiedlichen `address_id`** (zwei verschiedene
  Kunden/Lieferanten teilen sich die IBAN im selben Tenant): **keine
  automatische Dedup**. Diese Fälle muss Tolga manuell klären, bevor die
  Migration deployt wird (Rename einer Bankverbindung, Löschung, Merge
  der Adressen etc.). Die Migration wird bei solchen Fällen mit einem
  expliziten Pre-Check abbrechen (siehe unten).

### Changes Required

#### 1. Neue Supabase-Migration

**File**: `supabase/migrations/20260425000000_crm_bank_accounts_iban_unique.sql`

```sql
-- =============================================================
-- CAMT-Preflight Phase 1: IBAN Unique + Index auf crm_bank_accounts
-- Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md
--
-- Fügt einen Composite-Index und eine Composite-Unique-Constraint
-- auf (tenant_id, iban) hinzu. Vorgelagerter Dedup-Schritt entfernt
-- gleiche-Adresse-Duplikate (newest-wins); Cross-Adresse-Duplikate
-- müssen vorher manuell aufgeräumt werden — die Migration bricht
-- in diesem Fall mit einem RAISE EXCEPTION ab.
--
-- Research: thoughts/shared/research/2026-04-13-camt053-import.md
--   Abschnitt 2.5 + 5.6
-- =============================================================

-- Schritt 1: Pre-Check — Cross-Adresse-Duplikate sind ein Abbruchkriterium.
DO $$
DECLARE
  cross_addr_dupes INT;
BEGIN
  SELECT COUNT(*)
    INTO cross_addr_dupes
    FROM (
      SELECT tenant_id, iban
        FROM crm_bank_accounts
       GROUP BY tenant_id, iban
      HAVING COUNT(DISTINCT address_id) > 1
    ) AS sub;

  IF cross_addr_dupes > 0 THEN
    RAISE EXCEPTION
      'crm_bank_accounts: % (tenant_id, iban)-Gruppen haben Duplikate auf unterschiedlichen address_ids. Diese müssen vor dieser Migration manuell bereinigt werden. Siehe thoughts/shared/plans/2026-04-14-camt-preflight-items.md Phase 1 Step 0.',
      cross_addr_dupes;
  END IF;
END $$;

-- Schritt 2: Same-Address-Duplikate löschen (newest wins).
-- Keine FKs referenzieren crm_bank_accounts.id → reiner DELETE.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, iban, address_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM crm_bank_accounts
)
DELETE FROM crm_bank_accounts
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Schritt 3: Composite-Index für Lookup-Performance.
CREATE INDEX idx_crm_bank_accounts_tenant_iban
  ON crm_bank_accounts(tenant_id, iban);

-- Schritt 4: Unique-Constraint.
ALTER TABLE crm_bank_accounts
  ADD CONSTRAINT crm_bank_accounts_tenant_iban_unique
  UNIQUE (tenant_id, iban);
```

#### 2. Prisma-Schema

**File**: `prisma/schema.prisma`

**Changes**: Ergänze im `CrmBankAccount`-Block (nach bestehenden
`@@index`-Zeilen, vor `@@map`) zwei neue Direktiven:

```prisma
  @@unique([tenantId, iban], map: "crm_bank_accounts_tenant_iban_unique")
  @@index([tenantId, iban], map: "idx_crm_bank_accounts_tenant_iban")
  @@index([addressId], map: "idx_crm_bank_accounts_address_id")
  @@index([tenantId], map: "idx_crm_bank_accounts_tenant_id")
  @@map("crm_bank_accounts")
```

Die Reihenfolge spiegelt die Konvention in anderen Models
(`@@unique` vor `@@index`, `@@map` immer zuletzt).

#### 3. Service-Layer: P2002-Handling

**File**: `src/lib/services/crm-address-service.ts`

**Changes**: In `createBankAccount()` (ab ~Zeile 736) und `updateBankAccount()`
(ab ~Zeile 780) den `repo`-Call in ein `try`/`catch` legen. Prisma-P2002
auf `crm_bank_accounts_tenant_iban_unique` → neue
`CrmBankAccountDuplicateIbanError` werfen.

Neue Error-Klasse (im Kopf der Datei, neben den vorhandenen
`CrmAddressNotFoundError` / `CrmBankAccountNotFoundError`):

```ts
export class CrmBankAccountDuplicateIbanError extends Error {
  constructor(iban: string) {
    super(`IBAN ${iban} ist bereits für eine andere Bankverbindung im selben Mandanten vergeben`)
    this.name = "CrmBankAccountConflictError"
  }
}
```

Der `name` endet bewusst auf `ConflictError`, damit
`handleServiceError` ihn auf `TRPCError CONFLICT` mappt.

Catch-Pattern (analog zu `employees-service.ts:345`):

```ts
try {
  return await repo.createBankAccount(prisma, { ...normalized, tenantId })
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = err.meta?.target
    if (Array.isArray(target) && target.includes("iban")) {
      throw new CrmBankAccountDuplicateIbanError(normalized.iban)
    }
  }
  throw err
}
```

`Prisma` muss aus `@/generated/prisma/client` importiert werden, falls
nicht schon geschehen.

### Success Criteria

#### Automated Verification
- [x] Migration ist idempotent und läuft gegen leere lokale DB:
      `pnpm db:reset`
- [x] Prisma-Client kompiliert ohne Fehler: `pnpm db:generate`
- [x] Typecheck passt: `pnpm typecheck`
- [x] Lint passt: `pnpm lint` (nur 1 pre-existing Fehler in
      `src/trpc/platform/__tests__/helpers.ts:37` und 6 pre-existing
      `<img>`-Warnings — keine neuen Meldungen durch Phase 1)
- [x] Neuer Unit-Test: Versuch, zwei `CrmBankAccount`s mit derselben IBAN
      im selben Tenant zu erzeugen, wirft `CrmBankAccountDuplicateIbanError`
      (5/5 Szenarien grün). Dateipfad:
      `src/lib/services/__tests__/crm-address-bank-account-unique.test.ts`
- [x] Test: Zwei `CrmBankAccount`s mit derselben IBAN in **verschiedenen**
      Tenants sind erlaubt.
- [x] Gesamt-Testsuite: 4338 grün, 6 pre-existing fails (permission count,
      module-pricing, weekPlans, login-service, e2e/01 + e2e/04) — auf
      Baseline ohne Phase-1-Änderungen identisch reproduzierbar.

#### Manual Verification
- [x] Discovery-SQL-Query (Step 0) gegen staging und prod gelaufen
      (2026-04-14): 0 Duplikate auf beiden Umgebungen, staging=5 Rows,
      prod=0 Rows. Siehe Step 0-Notiz oben.
- [x] Keine Cross-Adresse-Duplikate — kein Cleanup nötig.
- [ ] `db:push:staging` deployed erfolgreich.
- [ ] Im CRM-UI: Versuch, eine doppelte IBAN am selben Kunden anzulegen,
      zeigt eine aussagekräftige Fehlermeldung (kein 500).

**Implementation Note**: Nach Abschluss aller automated checks pausieren
und auf Tolgas manuelle Freigabe der Dedup-Resultate warten, bevor Phase 2
startet.

---

## Phase 2 — Mahnwesen DRAFT `openAmount` Live-Refresh

### Overview

Neue interne Helper-Funktion `refreshDraftReminder()`, die für einen DRAFT-
Reminder jedes Item live gegen `BillingDocument.payments` neu berechnet,
auf `0` fallende Items löscht und die Summen (`totalOpenAmount`, `totalDue`)
im `Reminder`-Header nachzieht. Hook-Point: `getReminderRun` und
`sendReminder` / `markSentManually`.

**Entscheidung (offene Frage 1):** Fully-paid Items werden aus dem DRAFT
**gelöscht** (Option a). Begründung: (1) konsistente DB-Repräsentation —
der DRAFT enthält nur noch Items, die tatsächlich zu mahnen sind;
(2) PDF-Renderer und Email-Template müssen nicht filtern; (3) das
bestehende Safety-Net (`areAnyItemsStillOpen`) fängt den Fall, dass
alle Items gelöscht wurden, bereits ab und wirft `ReminderSendError`,
ohne dass wir eine zusätzliche Auto-Cancel-Logik brauchen; (4) im UI
sieht der Operator nach dem Refresh genau die offenen Posten — visuell
eindeutig.

**Entscheidung (offene Frage 2):** Refresh berührt **nur**
`openAmountAtReminder`. `levelAtReminder`, `daysOverdue`, `interestAmount`,
`originalAmount` bleiben unverändert. Begründung: Diese sind historisch —
die Mahnstufe und das Alter der Forderung werden zum Zeitpunkt der
Proposal-Erstellung festgezurrt und sollen sich durch eine zwischenzeitliche
Zahlung nicht mehr verändern. Der Betrag ist das einzige dynamische Feld.

### Changes Required

#### 1. Neue Service-Helper-Funktion

**File**: `src/lib/services/reminder-service.ts`

**Changes**: Neue private Funktion `refreshDraftReminder()` unterhalb der
bestehenden `areAnyItemsStillOpen`-Helper (nach Zeile 583).

```ts
/**
 * Für DRAFT-Reminder: re-berechnet openAmountAtReminder jedes Items
 * live aus BillingDocument.payments/childDocuments, entfernt
 * vollständig bezahlte Items, zieht die Header-Summen nach.
 *
 * No-op auf SENT/CANCELLED — wirft ReminderInvalidStateError.
 *
 * Läuft in einer eigenen $transaction, damit Item-Delete und Header-Update
 * atomar sind.
 */
async function refreshDraftReminder(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string
): Promise<void> {
  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, tenantId },
    include: { items: true },
  })
  if (!reminder) throw new ReminderNotFoundError(reminderId)
  if (reminder.status !== "DRAFT") return // SENT/CANCELLED: no-op

  const docIds = reminder.items.map((i) => i.billingDocumentId)
  if (docIds.length === 0) return

  const docs = await prisma.billingDocument.findMany({
    where: { tenantId, id: { in: docIds } },
    include: { payments: true, childDocuments: true },
  })
  const docById = new Map(docs.map((d) => [d.id, d]))

  const toDelete: string[] = []
  const toUpdate: Array<{ id: string; openAmount: number }> = []

  for (const item of reminder.items) {
    const doc = docById.get(item.billingDocumentId)
    if (!doc) {
      // Dokument wurde inzwischen gelöscht — Item ebenfalls entfernen.
      toDelete.push(item.id)
      continue
    }
    const creditNoteReduction = (doc.childDocuments ?? [])
      .filter((cn) => cn.type === "CREDIT_NOTE" && cn.status !== "CANCELLED")
      .reduce((sum, cn) => sum + cn.totalGross, 0)
    const effectiveTotalGross = doc.totalGross - creditNoteReduction
    const paidAmount = (doc.payments ?? [])
      .filter((p) => p.status === "ACTIVE")
      .reduce((sum, p) => sum + p.amount, 0)
    const liveOpen = Math.max(0, effectiveTotalGross - paidAmount)
    const rounded = Math.round(liveOpen * 100) / 100

    if (rounded <= 0.005) {
      toDelete.push(item.id)
    } else if (Math.abs(rounded - item.openAmountAtReminder) > 0.005) {
      toUpdate.push({ id: item.id, openAmount: rounded })
    }
  }

  if (toDelete.length === 0 && toUpdate.length === 0) return

  await prisma.$transaction(async (tx) => {
    if (toDelete.length > 0) {
      await tx.reminderItem.deleteMany({
        where: { id: { in: toDelete }, tenantId },
      })
    }
    for (const u of toUpdate) {
      await tx.reminderItem.update({
        where: { id: u.id },
        data: { openAmountAtReminder: u.openAmount },
      })
    }

    // Header-Summen nachziehen.
    const remaining = await tx.reminderItem.findMany({
      where: { reminderId, tenantId },
    })
    const totalOpenAmount = round2(
      remaining.reduce((s, i) => s + i.openAmountAtReminder, 0)
    )
    const totalInterest = round2(
      remaining.reduce((s, i) => s + i.interestAmount, 0)
    )
    // totalFees bleibt unverändert — der Gebührensatz ist Header-level,
    // nicht Item-level.
    await tx.reminder.update({
      where: { id: reminderId },
      data: {
        totalOpenAmount,
        totalInterest,
        totalDue: round2(totalOpenAmount + totalInterest + reminder.totalFees),
      },
    })
  })
}
```

`round2` ist die bestehende Helper-Funktion im selben Modul.

#### 2. Einsatz im Load-Pfad

**File**: `src/lib/services/reminder-service.ts`

**Changes**: Neue exportierte Funktion `getReminderForView()` hinzufügen
(nach `areAnyItemsStillOpen`, vor `refreshDraftReminder`). Diese Funktion
refresht den DRAFT vor dem Return.

```ts
export async function getReminderForView(
  prisma: PrismaClient,
  tenantId: string,
  reminderId: string
) {
  await refreshDraftReminder(prisma, tenantId, reminderId)
  const result = await repo.findById(prisma, tenantId, reminderId)
  if (!result) throw new ReminderNotFoundError(reminderId)
  return result
}
```

#### 3. tRPC-Router auf neuen Load-Pfad umstellen

**File**: `src/trpc/routers/billing/reminders.ts`

**Changes**: `getRun`-Procedure (Zeilen 294-311) so umbauen, dass sie
`reminderService.getReminderForView(...)` statt `reminderRepo.findById(...)`
aufruft.

```ts
getRun: dunningProcedure
  .use(requirePermission(DUNNING_VIEW))
  .input(idInput)
  .query(async ({ ctx, input }) => {
    try {
      return await reminderService.getReminderForView(
        ctx.prisma as unknown as PrismaClient,
        ctx.tenantId!,
        input.id
      )
    } catch (err) {
      handleServiceError(err)
    }
  }),
```

`handleServiceError` ist bereits im File importiert.

#### 4. Einsatz im Send-Pfad

**File**: `src/lib/services/reminder-service.ts`

**Changes**: In `sendReminder()` (Zeile 325-465) direkt nach der
initialen `reminder.findFirst`-Load (Zeile 337) und **vor** dem
`areAnyItemsStillOpen`-Call (Zeile 355) den Refresh einfügen, dann das
`reminder`-Objekt neu laden:

```ts
export async function sendReminder(prisma, tenantId, reminderId, userId) {
  // Refresh DRAFT-Items, bevor irgendetwas an den Versand geht.
  await refreshDraftReminder(prisma, tenantId, reminderId)

  const reminder = await prisma.reminder.findFirst({
    where: { id: reminderId, tenantId },
    include: {
      items: { orderBy: { createdAt: "asc" } },
      customerAddress: true,
    },
  })
  // ... rest unchanged: areAnyItemsStillOpen-check etc.
}
```

Dasselbe Pattern (`refreshDraftReminder` als erste Zeile) in
`markSentManually()` (Zeile 473-551).

#### 5. UI — keine Änderung

Die Detail-Sheet-Komponente
`src/components/billing/dunning/dunning-reminder-detail-sheet.tsx`
braucht keinen Code-Change, weil `getReminderForView` transparent aus
dem existierenden `useDunningRun`-Hook (`trpc.billing.reminders.getRun`)
ausgeliefert wird. Nach dem Refresh sieht der Operator die aktualisierten
Beträge automatisch beim nächsten Dialog-Open.

### Success Criteria

#### Automated Verification
- [x] `pnpm typecheck`
- [x] `pnpm lint` (keine neuen Issues in geänderten Files)
- [x] Neuer Test in `src/lib/services/__tests__/reminder-service-refresh.test.ts`:
  - [x] Szenario A: DRAFT mit zwei Items, beide haben noch offene Beträge,
        keine Zahlung eingegangen → Refresh ist No-Op, `openAmountAtReminder`
        bleibt unverändert.
  - [x] Szenario B: DRAFT mit einem Item, zwischenzeitliche Teilzahlung
        von 40€ auf 100€ → Refresh aktualisiert `openAmountAtReminder` auf
        60, Header-Summen werden angepasst.
  - [x] Szenario C: DRAFT mit zwei Items, eins wird voll bezahlt →
        vollbezahltes Item wird gelöscht, zweites bleibt, Header-Summen
        korrekt.
  - [x] Szenario D: DRAFT mit einem Item, das voll bezahlt wird → Item
        gelöscht, DRAFT bleibt leer bestehen, `totalOpenAmount = 0`.
  - [x] Szenario E: SENT-Reminder → Refresh ist No-Op (keine Updates).
  - [~] Szenario F: `sendReminder` safety-net (`areAnyItemsStillOpen`
        returns false on empty items) existierte bereits vor Phase 2 —
        der Refresh-Hook ist in `sendReminder` und `markSentManually`
        verdrahtet, die bestehende Prüfung fängt den leer-gerefreshten
        DRAFT ab. Kein neuer Test nötig.
  - [x] Szenario G: `levelAtReminder`, `daysOverdue`, `interestAmount`
        werden durch Refresh **nicht** verändert (im Szenario-B-Test
        explizit asserted).
  - [x] Zusatz-Szenario: aktive Credit-Notes reduzieren effektives
        `totalGross`, cancelled Credit-Notes werden ignoriert.
- [x] Gesamt-Testsuite: 4349 grün, 6 pre-existing fails (identisch
      zur Phase-1-Baseline, keine neuen Regressions durch Phase 2).

#### Manual Verification
- [ ] Im UI: DRAFT-Reminder mit einer zwischenzeitlich teilbezahlten
      Rechnung öffnen — angezeigter `openAmount` ist live korrekt.
- [ ] Im UI: DRAFT-Reminder mit einer voll bezahlten Rechnung öffnen —
      Item ist aus der Liste verschwunden, Header-Summen stimmen.
- [ ] Email-Versand auf korrekt refreshten DRAFT produziert PDF mit
      korrekten Beträgen.

**Implementation Note**: Nach Abschluss von Phase 2 pausieren und auf
Tolgas manuelle Freigabe warten, bevor Phase 3 startet.

---

## Phase 3 — `InboundInvoice` Payment-Status

### Overview

Die größte Phase — wird in 4 Sub-Phasen zerlegt, jede mit eigenem Commit
und separater Test-Runde. Kein Feature-Flag: Deploy = sichtbar.

---

### Phase 3a — Schema + Prisma-Modelle + Migration

#### Changes Required

##### 1. Neue Supabase-Migration

**File**: `supabase/migrations/20260426000000_inbound_invoice_payments.sql`

```sql
-- =============================================================
-- CAMT-Preflight Phase 3a: InboundInvoice Payment-Status
--
-- 1) Enums für payment_status + payment_type + payment_status auf der
--    Payment-Row.
-- 2) Spalten auf inbound_invoices: payment_status, paid_at, paid_amount.
-- 3) Tabelle inbound_invoice_payments (analog billing_payments, ohne
--    isDiscount).
--
-- Plan: thoughts/shared/plans/2026-04-14-camt-preflight-items.md
-- =============================================================

-- Enums
CREATE TYPE inbound_invoice_payment_status AS ENUM ('UNPAID', 'PARTIAL', 'PAID');
CREATE TYPE inbound_invoice_payment_type   AS ENUM ('CASH', 'BANK');
CREATE TYPE inbound_invoice_payment_row_status AS ENUM ('ACTIVE', 'CANCELLED');

-- Spalten auf inbound_invoices
ALTER TABLE inbound_invoices
  ADD COLUMN payment_status inbound_invoice_payment_status NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN paid_at        TIMESTAMPTZ,
  ADD COLUMN paid_amount    DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX idx_inbound_invoices_tenant_payment_status
  ON inbound_invoices(tenant_id, payment_status);

-- Tabelle
CREATE TABLE inbound_invoice_payments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id        UUID        NOT NULL REFERENCES inbound_invoices(id) ON DELETE RESTRICT,
  date              TIMESTAMPTZ NOT NULL,
  amount            DOUBLE PRECISION NOT NULL,
  type              inbound_invoice_payment_type NOT NULL,
  status            inbound_invoice_payment_row_status NOT NULL DEFAULT 'ACTIVE',
  notes             TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancelled_by_id   UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id     UUID
);

CREATE INDEX idx_inbound_invoice_payments_tenant_invoice
  ON inbound_invoice_payments(tenant_id, invoice_id);
CREATE INDEX idx_inbound_invoice_payments_tenant_date
  ON inbound_invoice_payments(tenant_id, date);

CREATE TRIGGER set_inbound_invoice_payments_updated_at
  BEFORE UPDATE ON inbound_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

##### 2. Prisma-Schema

**File**: `prisma/schema.prisma`

**Changes**:

(a) Im `InboundInvoice`-Modell (~5728) neue Felder ergänzen:

```prisma
  paymentStatus  InboundInvoicePaymentStatus @default(UNPAID) @map("payment_status")
  paidAt         DateTime?                   @map("paid_at") @db.Timestamptz(6)
  paidAmount     Float                       @default(0)     @map("paid_amount")

  inboundPayments InboundInvoicePayment[]

  @@index([tenantId, paymentStatus], map: "idx_inbound_invoices_tenant_payment_status")
```

(b) Neue Enums (nahe bei den bestehenden `BillingPaymentType`-Enums,
etwa nach Zeile 1097):

```prisma
enum InboundInvoicePaymentStatus {
  UNPAID
  PARTIAL
  PAID

  @@map("inbound_invoice_payment_status")
}

enum InboundInvoicePaymentType {
  CASH
  BANK

  @@map("inbound_invoice_payment_type")
}

enum InboundInvoicePaymentRowStatus {
  ACTIVE
  CANCELLED

  @@map("inbound_invoice_payment_row_status")
}
```

(c) Neues Model (nach dem `BillingPayment`-Model):

```prisma
model InboundInvoicePayment {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  invoiceId     String   @map("invoice_id") @db.Uuid
  date          DateTime @db.Timestamptz(6)
  amount        Float
  type          InboundInvoicePaymentType
  status        InboundInvoicePaymentRowStatus @default(ACTIVE)
  notes         String?
  cancelledAt   DateTime? @map("cancelled_at") @db.Timestamptz(6)
  cancelledById String?   @map("cancelled_by_id") @db.Uuid
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?   @map("created_by_id") @db.Uuid

  tenant  Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  invoice InboundInvoice @relation(fields: [invoiceId], references: [id])

  @@index([tenantId, invoiceId])
  @@index([tenantId, date])
  @@map("inbound_invoice_payments")
}
```

(d) `Tenant`-Model back-relation:

```prisma
  inboundInvoicePayments InboundInvoicePayment[]
```

#### Success Criteria (3a)

##### Automated Verification
- [ ] `pnpm db:reset` läuft ohne Fehler durch
- [ ] `pnpm db:generate` generiert den neuen Prisma-Client ohne Warnings
- [ ] `pnpm typecheck` grün (nur neue Enums/Models, keine bestehenden
      Aufrufer brechen)
- [ ] Integration-Test: Eine `InboundInvoice`-Row lässt sich per
      `prisma.inboundInvoice.create` anlegen und hat `paymentStatus =
      "UNPAID"`, `paidAmount = 0`, `paidAt = null`

##### Manual Verification
- [ ] Prisma Studio öffnen, `inbound_invoice_payments`-Tabelle existiert
      und ist leer.

---

### Phase 3b — Service + Repository + tRPC-Router + Permissions

#### Changes Required

##### 1. Permission-Katalog

**File**: `src/lib/auth/permission-catalog.ts`

**Changes**: Nach dem bestehenden `inbound_invoices.manage`-Eintrag
(Zeile 355) und vor `// Payment Runs` drei neue Einträge:

```ts
  // Inbound Invoice Payments
  p("inbound_invoice_payments.view", "inbound_invoice_payments", "view", "View inbound invoice payments"),
  p("inbound_invoice_payments.create", "inbound_invoice_payments", "create", "Record inbound invoice payments"),
  p("inbound_invoice_payments.cancel", "inbound_invoice_payments", "cancel", "Cancel inbound invoice payments"),
```

UUIDs werden automatisch via `uuidv5(key, PERMISSION_NAMESPACE)` abgeleitet.
Vor dem Schreiben der Migration einmal offline ausrechnen und als Kommentar
oben in der Migration ablegen.

##### 2. Permissions-Migration

**File**: `supabase/migrations/20260426000001_inbound_invoice_payment_permissions.sql`

```sql
-- =============================================================
-- CAMT-Preflight Phase 3b: Permissions für inbound_invoice_payments
--
-- Permission UUIDs (UUIDv5 mit Namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   inbound_invoice_payments.view   = <offline berechnet>
--   inbound_invoice_payments.create = <offline berechnet>
--   inbound_invoice_payments.cancel = <offline berechnet>
-- =============================================================

-- ADMIN: alle 3
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<VIEW-UUID>"'::jsonb
    UNION ALL SELECT '"<CREATE-UUID>"'::jsonb
    UNION ALL SELECT '"<CANCEL-UUID>"'::jsonb
  ) sub
) WHERE code = 'ADMIN' AND tenant_id IS NULL;

-- BUCHHALTUNG: alle 3
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<VIEW-UUID>"'::jsonb
    UNION ALL SELECT '"<CREATE-UUID>"'::jsonb
    UNION ALL SELECT '"<CANCEL-UUID>"'::jsonb
  ) sub
) WHERE code = 'BUCHHALTUNG' AND tenant_id IS NULL;

-- VORGESETZTER: nur view (read-only Transparenz)
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"<VIEW-UUID>"'::jsonb
  ) sub
) WHERE code = 'VORGESETZTER' AND tenant_id IS NULL;
```

##### 3. Repository

**File**: `src/lib/services/inbound-invoice-payment-repository.ts` (neu)

Analog zu `billing-payment-repository.ts`:

```ts
import type { PrismaClient } from "@/generated/prisma/client"

const PAYMENT_INCLUDE = {
  invoice: {
    select: {
      id: true,
      number: true,
      invoiceNumber: true,
      sellerName: true,
      totalGross: true,
      paymentStatus: true,
      paidAmount: true,
    },
  },
} as const

export async function findPaymentsByInvoiceId(
  prisma: PrismaClient, tenantId: string, invoiceId: string
) {
  return prisma.inboundInvoicePayment.findMany({
    where: { tenantId, invoiceId },
    orderBy: { date: "desc" },
    include: PAYMENT_INCLUDE,
  })
}

export async function findPaymentById(
  prisma: PrismaClient, tenantId: string, id: string
) {
  return prisma.inboundInvoicePayment.findFirst({
    where: { id, tenantId },
    include: PAYMENT_INCLUDE,
  })
}

export async function createPayment(
  prisma: PrismaClient,
  data: {
    tenantId: string
    invoiceId: string
    date: Date
    amount: number
    type: "CASH" | "BANK"
    notes?: string | null
    createdById?: string | null
  }
) {
  return prisma.inboundInvoicePayment.create({
    data: {
      tenantId: data.tenantId,
      invoiceId: data.invoiceId,
      date: data.date,
      amount: data.amount,
      type: data.type,
      notes: data.notes ?? null,
      createdById: data.createdById ?? null,
    },
    include: PAYMENT_INCLUDE,
  })
}

export async function cancelPayment(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  cancelledById: string,
  notes?: string | null
) {
  await prisma.inboundInvoicePayment.updateMany({
    where: { id, tenantId },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledById,
      ...(notes ? { notes } : {}),
    },
  })
  return prisma.inboundInvoicePayment.findFirst({
    where: { id, tenantId },
    include: PAYMENT_INCLUDE,
  })
}

export async function getActivePaymentsForInvoice(
  prisma: PrismaClient, tenantId: string, invoiceId: string
) {
  return prisma.inboundInvoicePayment.findMany({
    where: { tenantId, invoiceId, status: "ACTIVE" },
    orderBy: { date: "desc" },
  })
}
```

##### 4. Service

**File**: `src/lib/services/inbound-invoice-payment-service.ts` (neu)

Kernpunkte:

- `computeInboundPaymentStatus(totalGross: number, paidAmount: number)`
  gibt `UNPAID | PARTIAL | PAID` zurück. **Kein `OVERPAID`** — bei
  `paidAmount > totalGross + 0.01` clamped auf `PAID` und geloggt als
  Warning (nicht blockierend).

  ```ts
  export function computeInboundPaymentStatus(
    totalGross: number,
    paidAmount: number
  ): "UNPAID" | "PARTIAL" | "PAID" {
    if (paidAmount <= 0.005) return "UNPAID"
    if (paidAmount < totalGross - 0.01) return "PARTIAL"
    return "PAID"
  }
  ```

- Domain-Errors (naming-Konvention wie BillingPayment):
  `InboundInvoicePaymentNotFoundError`, `InboundInvoicePaymentValidationError`,
  `InboundInvoicePaymentConflictError`.

- `createPayment(prisma, tenantId, input, createdById, audit?)`:
  - Input: `{ invoiceId, date, amount, type, notes? }`. `amount` muss
    `> 0` sein.
  - Läuft in `prisma.$transaction`:
    1. Lade `InboundInvoice` innerhalb der TX. Throw
       `InboundInvoicePaymentValidationError("Invoice not found")` wenn
       null.
    2. Guard: `invoice.status` ∈ `{APPROVED, EXPORTED}` (nicht DRAFT,
       nicht REJECTED, nicht CANCELLED). Anderenfalls
       `InboundInvoicePaymentValidationError("Payments can only be
       recorded against approved or exported invoices")`.
    3. Lade aktive Payments, berechne neuen `paidAmount = sum + input.amount`.
    4. Guard: `newPaidAmount <= totalGross + 0.01` — sonst
       `InboundInvoicePaymentValidationError("Payment amount exceeds open
       amount")`. (Kein OVERPAID-Support im ersten Wurf.)
    5. `repo.createPayment(txPrisma, ...)`.
    6. `recomputeInvoicePaymentStatus(txPrisma, tenantId, invoiceId)`
       (Helper unten).
  - Nach TX: fire-and-forget audit-log `action: "create",
    entityType: "inbound_invoice_payment"`, identisch zum BillingPayment-
    Pattern.

- `cancelPayment(prisma, tenantId, id, cancelledById, reason?, audit?)`:
  - Läuft in `prisma.$transaction`:
    1. `repo.findPaymentById` — throw `NotFoundError` wenn null.
    2. Guard: bereits `CANCELLED` → ValidationError.
    3. `repo.cancelPayment(...)`.
    4. `recomputeInvoicePaymentStatus(txPrisma, tenantId, invoiceId)`.
  - Nach TX: fire-and-forget audit `action: "delete",
    entityType: "inbound_invoice_payment"`.

- `recomputeInvoicePaymentStatus(tx, tenantId, invoiceId)`:
  - Interne Helper. Lädt die `InboundInvoice` + aktive Payments,
    berechnet `paidAmount`, ruft `computeInboundPaymentStatus`, updatet
    die Invoice-Row:
    - `paymentStatus` = computed
    - `paidAmount` = sum of active payments (rounded to cents)
    - `paidAt`:
      - wenn computed == `PAID` UND aktueller `paidAt == null` → `new Date()`
      - wenn computed != `PAID` → `null`
      - sonst unverändert lassen (letzte Payment-Zeit bleibt)

- Exportierte Funktion `markInvoicesPaidFromPaymentRun(tx, tenantId,
  invoiceIds, bookedAt)`: wird in Phase 3c von `payment-run-service.ts`
  aufgerufen. Setzt für alle gelisteten IDs:
  - `paymentStatus = "PAID"`
  - `paidAt = bookedAt`
  - `paidAmount = inbound.totalGross` (pro Invoice gelesen)
  
  Warum nicht einfach per `updateMany` mit einem festen paidAmount?
  Weil `totalGross` pro Invoice unterschiedlich ist. Loop + `update`
  mit je-Invoice `paidAmount`. Innerhalb derselben Transaktion wie
  `markBooked`.

  ```ts
  export async function markInvoicesPaidFromPaymentRun(
    tx: PrismaClient,
    tenantId: string,
    invoiceIds: string[],
    bookedAt: Date
  ): Promise<void> {
    if (invoiceIds.length === 0) return
    const invoices = await tx.inboundInvoice.findMany({
      where: { tenantId, id: { in: invoiceIds } },
      select: { id: true, totalGross: true },
    })
    for (const inv of invoices) {
      await tx.inboundInvoice.update({
        where: { id: inv.id },
        data: {
          paymentStatus: "PAID",
          paidAmount: inv.totalGross,
          paidAt: bookedAt,
        },
      })
    }
  }
  ```

- Exportierte Funktion `consistencyCheckPaymentStatus(invoice,
  paymentRunItems)`: vergleicht das gespeicherte
  `invoice.paymentStatus` gegen den abgeleiteten
  `getPaymentStatus(paymentRunItems)`-Wert. Bei Abweichung
  fire-and-forget `auditLog.log({ action: "consistency_warning",
  entityType: "inbound_invoice", entityId: invoice.id, changes: {
  stored, derived } })`. Gibt `void` zurück — blockiert nichts.
  Wird in Phase 3c in den List-Read-Pfad verdrahtet.

- Definiere `listPayments(prisma, tenantId, invoiceId)` als dünnen
  Wrapper um `repo.findPaymentsByInvoiceId`:

  ```ts
  export async function listPayments(
    prisma: PrismaClient, tenantId: string, invoiceId: string
  ) {
    return repo.findPaymentsByInvoiceId(prisma, tenantId, invoiceId)
  }
  ```

  Der Wrapper existiert, damit die tRPC-Router-Schicht nie direkt ins
  Repository greift (Schichten-Trennung analog zu
  `billing-payment-service.listPayments`).

##### 5. tRPC-Router

**File**: `src/trpc/routers/invoices/inbound-invoice-payments.ts` (neu)

Analog zu `routers/billing/payments.ts`:

```ts
import { z } from "zod"
import { createTRPCRouter, tenantProcedure } from "@/trpc/init"
import { handleServiceError } from "@/trpc/errors"
import { requirePermission, requireModule } from "@/lib/auth/middleware"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"
import * as paymentService from "@/lib/services/inbound-invoice-payment-service"
import type { PrismaClient } from "@/generated/prisma/client"

const VIEW   = permissionIdByKey("inbound_invoice_payments.view")!
const CREATE = permissionIdByKey("inbound_invoice_payments.create")!
const CANCEL = permissionIdByKey("inbound_invoice_payments.cancel")!

const procedure = tenantProcedure.use(requireModule("inbound_invoices"))

const uuid = z.string().regex(/^[0-9a-f-]{36}$/i)

export const inboundInvoicePaymentsRouter = createTRPCRouter({
  list: procedure
    .use(requirePermission(VIEW))
    .input(z.object({ invoiceId: uuid }))
    .query(async ({ ctx, input }) => {
      try {
        return await paymentService.listPayments(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.invoiceId
        )
      } catch (err) { handleServiceError(err) }
    }),
  create: procedure
    .use(requirePermission(CREATE))
    .input(z.object({
      invoiceId: uuid,
      date: z.coerce.date(),
      amount: z.number().positive().max(999_999_999.99),
      type: z.enum(["CASH", "BANK"]),
      notes: z.string().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentService.createPayment(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input,
          ctx.user!.id,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) { handleServiceError(err) }
    }),
  cancel: procedure
    .use(requirePermission(CANCEL))
    .input(z.object({ id: uuid, reason: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await paymentService.cancelPayment(
          ctx.prisma as unknown as PrismaClient,
          ctx.tenantId!,
          input.id,
          ctx.user!.id,
          input.reason,
          { userId: ctx.user!.id, ipAddress: ctx.ipAddress, userAgent: ctx.userAgent }
        )
      } catch (err) { handleServiceError(err) }
    }),
})
```

Router mounten im `invoices`-Sub-Router (`src/trpc/routers/invoices/index.ts`
oder wo immer `inbound`-Router registriert ist): als
`inboundPayments: inboundInvoicePaymentsRouter`.

##### 6. Hook

**File**: `src/hooks/use-inbound-invoice-payments.ts` (neu)

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "@/trpc/client"

export function useInboundInvoicePayments(invoiceId: string, enabled = true) {
  const trpc = useTRPC()
  return useQuery(
    trpc.invoices.inboundPayments.list.queryOptions(
      { invoiceId },
      { enabled: enabled && !!invoiceId }
    )
  )
}

export function useCreateInboundInvoicePayment() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.invoices.inboundPayments.create.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.invoices.inboundPayments.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.invoices.inbound.getById.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.invoices.inbound.list.queryKey() })
    },
  })
}

export function useCancelInboundInvoicePayment() {
  const trpc = useTRPC()
  const qc = useQueryClient()
  return useMutation({
    ...trpc.invoices.inboundPayments.cancel.mutationOptions(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: trpc.invoices.inboundPayments.list.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.invoices.inbound.getById.queryKey() })
      qc.invalidateQueries({ queryKey: trpc.invoices.inbound.list.queryKey() })
    },
  })
}
```

#### Success Criteria (3b)

##### Automated Verification
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] Neuer Unit-Test
      `src/lib/services/__tests__/inbound-invoice-payment-service.test.ts`:
  - [ ] `createPayment` erzeugt Row, setzt `paymentStatus = PARTIAL`
        bei Teilzahlung
  - [ ] `createPayment` setzt `PAID` bei exakter Voll-Zahlung, setzt
        `paidAt`
  - [ ] `createPayment` wirft Validation bei amount > openAmount
  - [ ] `createPayment` wirft Validation bei status DRAFT
  - [ ] `cancelPayment` setzt status auf CANCELLED, re-berechnet
        `paymentStatus`, setzt `paidAt` zurück auf null wenn nicht mehr PAID
  - [ ] `cancelPayment` zweier sequentieller PARTIAL-Zahlungen bringt
        die Invoice zurück auf `UNPAID`
  - [ ] Audit-Entries werden geloggt (mock `auditLog.log`)
- [ ] tRPC-Integration-Test ruft alle 3 Procedures mit permission-gating

##### Manual Verification
- [ ] In einer gestarteten Dev-Umgebung: Prisma Studio zeigt eine neu
      erzeugte `InboundInvoicePayment`-Row, `InboundInvoice.paymentStatus`
      aktualisiert sich live.

---

### Phase 3c — PaymentRun-Integration + Konsistenz-Check

#### Changes Required

##### 1. `PaymentRun.markBooked()` ruft neue Service-Funktion auf

**File**: `src/lib/services/payment-run-service.ts`

**Changes**: `markBooked()` (Zeile 448-493) bekommt einen
`$transaction`-Wrapper, der Status-Update und InboundInvoice-Update in
derselben TX ausführt.

```ts
export async function markBooked(
  prisma: PrismaClient,
  tenantId: string,
  id: string,
  userId: string,
  audit?: AuditContext
): Promise<PaymentRunWithItems> {
  const existing = await repo.findById(prisma, tenantId, id)
  if (!existing) throw new PaymentRunNotFoundError(id)
  if (existing.status === "BOOKED") return existing
  if (existing.status !== "EXPORTED") {
    throw new PaymentRunInvalidStateError(
      `PaymentRun in status ${existing.status} cannot be booked`
    )
  }

  const bookedAt = new Date()
  const invoiceIds = existing.items.map((i) => i.inboundInvoiceId)

  const updated = await prisma.$transaction(async (tx) => {
    const u = await repo.updateStatus(tx as unknown as PrismaClient, tenantId, id, {
      status: "BOOKED",
      bookedAt,
      bookedBy: userId,
    })
    if (!u) throw new PaymentRunNotFoundError(id)

    await inboundPaymentService.markInvoicesPaidFromPaymentRun(
      tx as unknown as PrismaClient,
      tenantId,
      invoiceIds,
      bookedAt
    )

    return u
  })

  // Audit bleibt unverändert — läuft nach der Transaktion, fire-and-forget.
  if (audit) {
    // ... bestehender auditLog.log-Call
  }
  return updated
}
```

Import hinzufügen:
```ts
import * as inboundPaymentService from "./inbound-invoice-payment-service"
```

Das `updateStatus`-Aufruf nimmt jetzt `tx` statt `prisma`.
`repo.updateStatus` akzeptiert bereits eine PrismaClient-Signatur, die
mit Transaktions-Clients kompatibel ist.

##### 2. Konsistenz-Check in List-Read (hinter Env-Flag)

**File**: `src/lib/services/inbound-invoice-service.ts` (existierendes
File, Liste-Funktion finden)

**Changes**: Der Check läuft **nur**, wenn die neue Umgebungsvariable
`INBOUND_INVOICE_PAYMENT_CONSISTENCY_CHECK=true` gesetzt ist. Der
zusätzliche `paymentRunItems`-Include wird im selben if-Zweig
konditional angefügt, damit Installationen ohne das Flag keinen
Query-Overhead zahlen.

```ts
// TODO(2026-05-26): Nach 4 Wochen produktiver Laufzeit ohne
// consistency_warning-Audit-Entries diesen gesamten Block inklusive
// paymentRunItems-Include und Env-Flag entfernen. Siehe
// thoughts/shared/plans/2026-04-14-camt-preflight-items.md Phase 3c.
const consistencyCheckEnabled =
  process.env.INBOUND_INVOICE_PAYMENT_CONSISTENCY_CHECK === "true"

const invoices = await prisma.inboundInvoice.findMany({
  where: { tenantId, ...filters },
  include: {
    // ...bestehende Includes...
    ...(consistencyCheckEnabled && {
      paymentRunItems: {
        include: { paymentRun: { select: { status: true } } },
      },
    }),
  },
  // ...
})

if (consistencyCheckEnabled) {
  for (const inv of invoices) {
    inboundPaymentService
      .consistencyCheckPaymentStatus(inv, inv.paymentRunItems ?? [])
      .catch((err) => console.error("[ConsistencyCheck] failed:", err))
  }
}
```

`consistencyCheckPaymentStatus` ist in Phase 3b definiert worden.

**Config** (`src/lib/config.ts`): neue Zeile im `serverEnv`-Block:

```ts
inboundInvoicePaymentConsistencyCheck:
  process.env.INBOUND_INVOICE_PAYMENT_CONSISTENCY_CHECK === "true",
```

Der Service liest die Variable direkt aus `process.env`, damit der
Check beim Deaktivieren keinen Server-Neustart braucht, falls er in
einer laufenden Instanz unerwartet Noise produziert. (Vercel startet
bei Env-Änderungen zwar ohnehin neu — der direkte Read kostet nichts
und macht die Debug-Erfahrung in Dev besser.)

**Rollout-Plan**:
1. Deploy mit `INBOUND_INVOICE_PAYMENT_CONSISTENCY_CHECK=true` in
   staging.
2. Nach 1 Woche staging ohne Warnings: aktivieren in prod.
3. 4 Wochen prod ohne Warnings: Cleanup-Ticket ziehen, das den
   gesamten Block inkl. Env-Flag, Config-Eintrag, Service-Funktion
   `consistencyCheckPaymentStatus`, Repo-Include und diese Plan-
   Referenz entfernt. Das Datum `2026-05-26` im `TODO`-Kommentar ist
   der frühestmögliche Cleanup-Termin (= Plan-Datum + 6 Wochen Puffer
   für die 2+4-Wochen-Rollout-Strategie).

##### 3. `getPaymentStatus` re-export beibehalten

**File**: `src/lib/services/payment-run-service.ts`

Der bestehende Re-Export in Zeile 31 bleibt unverändert. Der
Konsistenz-Check importiert `getPaymentStatus` direkt aus
`./payment-run-data-resolver`, damit die Circular-Dependency-Analyse
einfach bleibt.

#### Success Criteria (3c)

##### Automated Verification
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] Erweiterter Test in
      `src/lib/services/__tests__/payment-run-service-mark-booked.test.ts`
      (ggf. neu):
  - [ ] Nach `markBooked` hat jede verknüpfte InboundInvoice
        `paymentStatus = PAID`, `paidAt ≈ now`, `paidAmount = totalGross`
  - [ ] Der Konsistenz-Check loggt **kein** Warning für eine frisch
        gebuchte Rechnung
  - [ ] Der Konsistenz-Check loggt **ein** Warning wenn die
        gespeicherte `paymentStatus` manuell auf `UNPAID` gesetzt wird
        (Simulation eines inkonsistenten Zustands)
  - [ ] Wenn `inboundPaymentService.markInvoicesPaidFromPaymentRun`
        innerhalb der TX wirft, bleibt der PaymentRun in `EXPORTED`
        (Rollback-Assertion)

##### Manual Verification
- [ ] Eine PaymentRun durchlaufen (create → export → markBooked), dann
      im Prisma Studio prüfen: `inbound_invoices.payment_status` ist
      `PAID`.

---

### Phase 3d — UI

#### Changes Required

##### 1. `InboundInvoicePaymentStatusBadge`

**File**: `src/components/invoices/inbound-invoice-payment-status-badge.tsx` (neu)

Analog zu `payment-status-badge.tsx`:

```tsx
import { Badge } from "@/components/ui/badge"
import { useTranslations } from "next-intl"

type Status = "UNPAID" | "PARTIAL" | "PAID"

const VARIANTS: Record<Status, "gray" | "yellow" | "green"> = {
  UNPAID: "gray",
  PARTIAL: "yellow",
  PAID: "green",
}

export function InboundInvoicePaymentStatusBadge({
  status,
}: { status: Status }) {
  const t = useTranslations("inboundInvoices")
  return <Badge variant={VARIANTS[status]}>{t(`paymentStatus.${status.toLowerCase()}`)}</Badge>
}
```

Translation-Keys in `messages/de.json` (und `en.json` wenn vorhanden)
unter `inboundInvoices.paymentStatus.{unpaid,partial,paid}`.

##### 2. `InboundInvoicePaymentFormDialog`

**File**: `src/components/invoices/inbound-invoice-payment-form-dialog.tsx` (neu)

Copy-Paste von `payment-form-dialog.tsx` mit folgenden Änderungen:
- `documentId` → `invoiceId`
- Entfernung aller `isDiscount` / `discountInfo`-Logik (Checkbox +
  Auto-Update-Effect)
- Hook: `useCreateInboundInvoicePayment()` statt
  `useCreateBillingPayment()`
- Props:
  ```ts
  interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    invoiceId: string
    openAmount: number
  }
  ```

##### 3. Integration ins `InboundInvoiceDetail`

**File**: `src/components/invoices/inbound-invoice-detail.tsx`

**Changes**:

(a) Neue State-Variablen nahe den bestehenden (ab Zeile ~50):

```tsx
const [showPaymentForm, setShowPaymentForm] = React.useState(false)
const [cancelPaymentId, setCancelPaymentId] = React.useState<string | null>(null)

const { data: payments = [] } = useInboundInvoicePayments(id)
const cancelMut = useCancelInboundInvoicePayment()
```

(b) Header-Button neben dem bestehenden Approve/DATEV-Export-Block
(ab ~Zeile 260). Nur anzeigen wenn `invoice.paymentStatus !== "PAID"`
UND `invoice.status ∈ {APPROVED, EXPORTED}`:

```tsx
{invoice.paymentStatus !== "PAID" &&
  (invoice.status === "APPROVED" || invoice.status === "EXPORTED") && (
    <Button variant="outline" onClick={() => setShowPaymentForm(true)}>
      <Plus className="h-4 w-4 mr-1" />
      Zahlung erfassen
    </Button>
)}
<InboundInvoicePaymentStatusBadge status={invoice.paymentStatus} />
```

(c) Neue Card in der rechten Sidebar (nach „Notes"): „Zahlungen". Liste
analog zu `open-item-detail.tsx:207-271`, inklusive Cancel-Button pro
aktiver Zahlung:

```tsx
<Card>
  <CardHeader><CardTitle>Zahlungen</CardTitle></CardHeader>
  <CardContent>
    {payments.length === 0 ? (
      <p className="text-sm text-muted-foreground">Keine Zahlungen erfasst</p>
    ) : (
      <ul className="space-y-2 text-sm">
        {payments.map((p) => (
          <li key={p.id} className={cn("flex items-center justify-between",
              p.status === "CANCELLED" && "opacity-50")}>
            <span>{formatDate(p.date)} — {formatCurrency(p.amount)} ({p.type})</span>
            {p.status === "ACTIVE" && (
              <Button size="sm" variant="outline"
                className="text-red-600 border-red-200"
                onClick={() => setCancelPaymentId(p.id)}>
                <XCircle className="h-4 w-4 mr-1" />
                Stornieren
              </Button>
            )}
          </li>
        ))}
      </ul>
    )}
  </CardContent>
</Card>
```

(d) Dialog-Mounts am Ende des JSX-Trees (vor dem schließenden `</div>`):

```tsx
<InboundInvoicePaymentFormDialog
  open={showPaymentForm}
  onOpenChange={setShowPaymentForm}
  invoiceId={id}
  openAmount={Math.max(0, (invoice.totalGross ?? 0) - (invoice.paidAmount ?? 0))}
/>

{cancelPaymentId && (
  <ConfirmDialog
    open={!!cancelPaymentId}
    onOpenChange={(o) => { if (!o) setCancelPaymentId(null) }}
    title="Zahlung stornieren?"
    onConfirm={async () => {
      await cancelMut.mutateAsync({ id: cancelPaymentId! })
      setCancelPaymentId(null)
    }}
  />
)}
```

##### 4. Listen-Spalte mit `paymentStatus`-Badge

**File**: `src/components/invoices/inbound-invoice-list.tsx`

**Changes**: Eine neue Spalte „Zahlstatus" zwischen „Status" und „Source"
ergänzen. Desktop-Table (Zeilen ~143-152) und alle Zeilen-Render-Stellen:

```tsx
<TableCell>
  <InboundInvoicePaymentStatusBadge status={inv.paymentStatus} />
</TableCell>
```

Die Prisma-Query der `invoices.inbound.list`-Procedure liefert
`paymentStatus` bereits automatisch (skalare Felder default im
`findMany`-Result).

##### 5. Translations

**File**: `messages/de.json` (und `en.json` wenn vorhanden)

Neue Keys unter `inboundInvoices`:

```json
"paymentStatus": {
  "unpaid": "Unbezahlt",
  "partial": "Teilweise bezahlt",
  "paid": "Bezahlt"
},
"payments": {
  "recordPayment": "Zahlung erfassen",
  "noPayments": "Keine Zahlungen erfasst",
  "cancelPayment": "Stornieren",
  "cancelConfirm": "Zahlung wirklich stornieren?"
}
```

#### Success Criteria (3d)

##### Automated Verification
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test` grün

##### Manual Verification (Golden Path + Edge Cases)
- [ ] Dev-Server starten (`pnpm dev`), als BUCHHALTUNG-User einloggen.
- [ ] InboundInvoice-Liste zeigt neue Spalte „Zahlstatus" mit Badges.
- [ ] Genehmigte Invoice öffnen, „Zahlung erfassen"-Button ist sichtbar.
- [ ] Dialog öffnet sich, Vorbefüllung: `date = today`, `amount =
      openAmount`, `type = BANK`.
- [ ] Teilzahlung erfassen (z.B. 50% des Betrags): Badge wechselt auf
      `PARTIAL` (yellow), Zahlungsliste zeigt eine aktive Row.
- [ ] Restzahlung erfassen: Badge wechselt auf `PAID` (green), Button
      „Zahlung erfassen" verschwindet aus dem Header.
- [ ] Zahlung stornieren → Confirm-Dialog → Badge wechselt zurück.
- [ ] Als PERSONAL-User (ohne Permissions): Button nicht sichtbar, kein
      API-Fehler (die tRPC-Procedure gibt 403 zurück, Hook rendert
      unauffällig).
- [ ] Invoice mit Status DRAFT: Button nicht sichtbar.
- [ ] PaymentRun durchlaufen (export + markBooked) auf einer noch
      unbezahlten Invoice → nach Refresh zeigt Detail den `PAID`-Badge
      mit `paidAt = now`, Zahlungs-Card ist leer (keine
      InboundInvoicePayment-Row, das Update lief per
      `markInvoicesPaidFromPaymentRun`).

**Implementation Note**: Phase 3 ist groß — nach 3a, 3b, 3c und 3d jeweils
ein eigener PR und eine manuelle Zwischenverifikation.

---

## Testing Strategy

### Unit Tests

- **Phase 1**: Constraint-Verletzung (P2002), Cross-Tenant-Isolation
  (same IBAN different tenants is fine), dedup-SQL idempotency.
- **Phase 2**: alle 7 Szenarien aus Phase 2 Success Criteria
  (A–G), inklusive der Invariant `levelAtReminder` bleibt konstant.
- **Phase 3b**: alle 6 Szenarien aus 3b Success Criteria.
- **Phase 3c**: markBooked transactional rollback assertion, consistency
  warning trigger.

### Integration Tests

- **Phase 2**: End-to-End Cron `dunning-candidates` → DRAFT erstellen →
  Zahlung erfassen → DRAFT refresht beim nächsten Detail-Load.
- **Phase 3**: End-to-End PaymentRun `create → export → markBooked` →
  verknüpfte InboundInvoice hat korrektes `paymentStatus`.

### Manual Testing Steps

Siehe die „Manual Verification"-Checklisten pro Sub-Phase. Zwischen jeder
Phase steht eine explizite Pause für Tolgas Freigabe.

## Performance Considerations

- **Phase 1**: Composite-Index auf `(tenant_id, iban)` verbessert IBAN-
  Lookups, aber nichts davon ist heute auf dem Hot-Path (niemand sucht
  heute nach IBAN). Das Index-Volume ist klein (VARCHAR(34)). Impact:
  vernachlässigbar.
- **Phase 2**: Der Refresh läuft bei jedem DRAFT-Detail-Open + bei jedem
  Versand. Die zusätzlichen Queries sind: 1 `reminder.findFirst`
  (existiert schon) + 1 `billingDocument.findMany` (neu, aber mit
  `WHERE id IN [...]` und `include: { payments, childDocuments }`). Bei
  typischen Mahnläufen <50 Rechnungen im DRAFT → <100ms Overhead.
  Akzeptabel.
- **Phase 3a**: Neue Spalten + Index mit `DEFAULT 0`/`DEFAULT 'UNPAID'`
  auf `inbound_invoices`. PostgreSQL schreibt keine Rows neu (fast-path),
  aber auf sehr großen Tabellen kann ein Exclusive-Lock kurzzeitig
  spürbar werden. Bei aktuellem Datenvolumen unkritisch.
- **Phase 3c**: `markBooked` öffnet jetzt eine `$transaction` die auch
  einen `findMany` + Loop-`update` auf InboundInvoices enthält. Bei
  üblichen PaymentRun-Größen (10–100 Invoices) verbleibt die Laufzeit
  unter 1s. Kein Batching nötig.
- **Phase 3c Konsistenz-Check (Env-Flag-gated)**: Solange
  `INBOUND_INVOICE_PAYMENT_CONSISTENCY_CHECK=true` aktiv ist, erweitert
  die InboundInvoice-Listen-Query den Include um
  `paymentRunItems → paymentRun.status`. Das bringt pro Listen-Aufruf
  eine zusätzliche Join-Ebene gegen `payment_run_items` und `payment_runs`
  (gefiltert auf die geladenen Invoice-IDs). Bei typischen Listen
  (25–100 Invoices, davon wenige mit PaymentRun-Items) liegt der
  Overhead unter 20ms — vertretbar für den zeitlich begrenzten
  Migrations-Zeitraum. Sobald der Check nach der 4-Wochen-Watch-Phase
  entfernt wird, fällt der Overhead vollständig weg.

## Migration Notes

- **Keine** Backfill-Skripte für historische Daten in Phase 3. Prod
  hat zum Deploy-Zeitpunkt keine produktiven InboundInvoice-Daten, der
  Konsistenz-Check darf daher null Warnings produzieren — jedes
  `consistency_warning` im Audit-Log ist ein echtes Problem, das
  untersucht werden muss, nicht Rauschen von Altdaten.
- Phase 1 Dedup ist das einzige invasive Migrations-Event und braucht
  Tolgas Vorab-Discovery gegen staging+prod.
- Rollback-Strategie: Jede Phase ist in sich geschlossen. Bei Problemen
  in Phase 3b/c/d kann die Migration aus 3a stehen bleiben (die neuen
  Spalten bleiben leer und werden von Altcode ignoriert).

## References

- Research: `thoughts/shared/research/2026-04-13-camt053-import.md`
- BillingPayment vorbild: `src/lib/services/billing-payment-service.ts:34-502`
- BillingPayment Router: `src/trpc/routers/billing/payments.ts:108-141`
- Permission-Katalog-Muster: `src/lib/auth/permission-catalog.ts:262-265, 357-362`
- PaymentRun markBooked: `src/lib/services/payment-run-service.ts:448-493`
- PaymentRun Permission-Migration Beispiel:
  `supabase/migrations/20260423000001_add_payment_run_permissions_and_module.sql`
- Reminder-Eligibility Formel:
  `src/lib/services/reminder-eligibility-service.ts:196-208`
- Reminder sendReminder + safety net:
  `src/lib/services/reminder-service.ts:325-465, 558-583`
- CrmBankAccount schema + migration:
  `prisma/schema.prisma:557-581`,
  `supabase/migrations/20260101000095_create_crm_tables.sql:77-91`
- Open-Item-Detail UI Vorbild:
  `src/components/billing/open-item-detail.tsx:153-289`
