# WH_11 — Korrekturassistent für Warenwirtschaft

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | WH_01 (Articles), WH_04 (Wareneingang), WH_05 (Lagerentnahmen) |
| **Complexity** | M |
| **Priority** | Mittlere Priorität |
| **New Models** | `WhCorrectionMessage`, `WhCorrectionRun` |

---

## ZMI-Referenz

ZMI orgAuftrag Kap. 2.2: Korrekturassistent speziell für die Warenwirtschaft erkennt doppelt gebuchte Wareneingänge, negative Lagerbestände und sonstige Unstimmigkeiten. Filter mit UND/ODER/NICHT-Logik. "Erledigt"-Markierung mit Bemerkung.

---

## Terp aktuell

- Korrekturassistent existiert nur für die Zeiterfassung (fehlende Buchungen, Kernzeitverstöße etc.)
- Für die Lagerverwaltung gibt es keinen Prüfmechanismus
- Negative Bestände, doppelte Wareneingänge oder Bestellungen ohne Wareneingang werden nicht erkannt
- Bestandskorrekturen sind nur manuell pro Artikel möglich

---

## Goal

Einen Korrekturassistenten für die Warenwirtschaft implementieren, der automatisch Unstimmigkeiten erkennt und meldet. Prüfungen laufen periodisch (Cron) oder manuell on-demand. Erkannte Probleme werden als Meldungen angezeigt, die vom Benutzer bearbeitet (erledigt/ignoriert) werden können.

---

## Prisma Models

### WhCorrectionMessage

```prisma
enum WhCorrectionSeverity {
  ERROR    // Muss behoben werden
  WARNING  // Sollte geprüft werden
  INFO     // Hinweis

  @@map("wh_correction_severity")
}

enum WhCorrectionStatus {
  OPEN
  RESOLVED    // Automatisch durch Korrektur behoben
  DISMISSED   // Manuell als erledigt markiert
  IGNORED     // Bewusst ignoriert

  @@map("wh_correction_status")
}

model WhCorrectionMessage {
  id            String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                @map("tenant_id") @db.Uuid
  runId         String?               @map("run_id") @db.Uuid
  code          String                // z.B. "NEGATIVE_STOCK", "DUPLICATE_RECEIPT", "OVERDUE_ORDER"
  severity      WhCorrectionSeverity
  status        WhCorrectionStatus    @default(OPEN)
  message       String                // Menschenlesbare Beschreibung
  articleId     String?               @map("article_id") @db.Uuid
  documentId    String?               @map("document_id") @db.Uuid  // Beleg oder Bestellung
  details       Json?                 // Zusätzliche Daten (z.B. erwarteter vs. tatsächlicher Wert)
  resolvedAt    DateTime?             @map("resolved_at") @db.Timestamptz(6)
  resolvedById  String?               @map("resolved_by_id") @db.Uuid
  resolvedNote  String?               @map("resolved_note")
  createdAt     DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant  Tenant     @relation(fields: [tenantId], references: [id])
  run     WhCorrectionRun? @relation(fields: [runId], references: [id])

  @@index([tenantId, status])
  @@index([tenantId, code])
  @@index([tenantId, articleId])
  @@map("wh_correction_messages")
}
```

### WhCorrectionRun

```prisma
model WhCorrectionRun {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  startedAt    DateTime @default(now()) @map("started_at") @db.Timestamptz(6)
  completedAt  DateTime? @map("completed_at") @db.Timestamptz(6)
  trigger      String   // "MANUAL", "CRON"
  checksRun    Int      @default(0) @map("checks_run")
  issuesFound  Int      @default(0) @map("issues_found")
  triggeredById String? @map("triggered_by_id") @db.Uuid

  tenant   Tenant               @relation(fields: [tenantId], references: [id])
  messages WhCorrectionMessage[]

  @@index([tenantId])
  @@map("wh_correction_runs")
}
```

---

## Prüfregeln

| Code | Severity | Beschreibung | Logik |
|------|----------|-------------|-------|
| `NEGATIVE_STOCK` | ERROR | Negativer Lagerbestand | `WHERE currentStock < 0 AND stockTracking = true` |
| `DUPLICATE_RECEIPT` | WARNING | Doppelter Wareneingang | Gleicher Artikel + gleiche Menge + gleiche Bestellung innerhalb 1h |
| `OVERDUE_ORDER` | WARNING | Überfällige Bestellung | `WHERE status = ORDERED AND confirmedDelivery < now() - 3 days` |
| `UNMATCHED_RECEIPT` | INFO | Wareneingang ohne Bestellung | Wareneingänge ohne Referenz auf eine Bestellung |
| `STOCK_MISMATCH` | ERROR | Bestand weicht von Bewegungen ab | `currentStock ≠ Σ(movements)` — Summe aller Zu-/Abgänge stimmt nicht |
| `LOW_STOCK_NO_ORDER` | WARNING | Unter Mindestbestand ohne offene Bestellung | Artikel unter Mindestbestand, keine DRAFT/ORDERED Bestellung vorhanden |
| `ORPHAN_RESERVATION` | WARNING | Verwaiste Reservierung | Reservierung ACTIVE, aber AB storniert oder gelöscht |

---

## Permissions

```ts
p("wh_corrections.view", "wh_corrections", "view", "View warehouse correction messages"),
p("wh_corrections.manage", "wh_corrections", "manage", "Manage correction messages (resolve, dismiss)"),
p("wh_corrections.run", "wh_corrections", "run", "Run correction checks manually"),
```

---

## tRPC Router

**File:** `src/trpc/routers/warehouse/corrections.ts`

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `messages.list` | query | `wh_corrections.view` | `{ status?, severity?, code?, articleId?, page, pageSize }` | Alle Meldungen |
| `messages.getById` | query | `wh_corrections.view` | `{ id }` | Einzelne Meldung mit Details |
| `messages.resolve` | mutation | `wh_corrections.manage` | `{ id, note? }` | Als erledigt markieren |
| `messages.dismiss` | mutation | `wh_corrections.manage` | `{ id, note? }` | Als ignoriert markieren |
| `messages.resolveBulk` | mutation | `wh_corrections.manage` | `{ ids[], note? }` | Mehrere als erledigt markieren |
| `runs.list` | query | `wh_corrections.view` | `{ page, pageSize }` | Prüfläufe |
| `runs.trigger` | mutation | `wh_corrections.run` | `{}` | Manuell Prüflauf starten |
| `summary` | query | `wh_corrections.view` | `{}` | KPI-Zusammenfassung: offene Fehler, Warnungen, Hinweise |

---

## Service Layer

**Files:**
- `src/lib/services/wh-correction-service.ts`
- `src/lib/services/wh-correction-repository.ts`

### Key Logic — Prüflauf

```ts
export async function runCorrectionChecks(prisma, tenantId, triggeredById?, trigger = "MANUAL") {
  const run = await createRun(prisma, tenantId, triggeredById, trigger)

  const checks = [
    checkNegativeStock,
    checkDuplicateReceipts,
    checkOverdueOrders,
    checkStockMismatch,
    checkLowStockNoOrder,
    checkOrphanReservations,
  ]

  let issuesFound = 0
  for (const check of checks) {
    const messages = await check(prisma, tenantId, run.id)
    issuesFound += messages.length
  }

  await completeRun(prisma, run.id, checks.length, issuesFound)
  return { runId: run.id, checksRun: checks.length, issuesFound }
}
```

### Deduplizierung

Wenn eine Meldung für denselben Artikel + Code bereits OPEN ist, wird keine neue erstellt (Idempotenz).

---

## UI Components

### Page Route

| Route | Component | Description |
|-------|-----------|-------------|
| `/warehouse/corrections` | `WhCorrectionsPage` | Korrekturassistent |

### Components

**All in `src/components/warehouse/`:**

| Component | Description |
|-----------|-------------|
| `correction-dashboard.tsx` | 3 KPI-Karten: Offene Fehler (rot), Warnungen (gelb), Hinweise (blau). Button "Prüfung starten". Letzter Prüflauf mit Ergebnis. |
| `correction-message-list.tsx` | Tabelle: Code, Severity-Badge, Artikel, Beleg, Nachricht, Datum, Status. Filter: Status, Severity, Code. Mehrfachauswahl + Massenaktionen. |
| `correction-message-detail.tsx` | Sheet: Vollständige Nachricht, Details (JSON formatiert), Artikel-Link, Beleg-Link. Aktionen: Erledigt / Ignoriert mit Notiz. |
| `correction-run-history.tsx` | Tabelle: Datum, Trigger, Prüfungen, Gefundene Probleme, Dauer. Aufklappbar: Meldungen pro Lauf. |
| `correction-severity-badge.tsx` | Farbige Badges: ERROR=rot, WARNING=gelb, INFO=blau |

---

## Hooks

**File:** `src/hooks/use-wh-corrections.ts`

```ts
export function useWhCorrectionMessages(filters) { /* ... */ }
export function useWhCorrectionSummary() { /* ... */ }
export function useWhCorrectionRuns(filters) { /* ... */ }
export function useResolveWhCorrection() { /* ... */ }
export function useDismissWhCorrection() { /* ... */ }
export function useTriggerWhCorrectionRun() { /* ... */ }
```

---

## Cron Job

**File:** `src/app/api/cron/warehouse-corrections/route.ts`

- Läuft täglich um 06:00 Uhr
- Führt `runCorrectionChecks` für alle aktiven Tenants mit Warehouse-Modul aus
- Vercel Cron Schedule: `0 6 * * *`

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/wh-correction-service.test.ts`

- `checkNegativeStock` — findet Artikel mit negativem Bestand
- `checkNegativeStock` — ignoriert Artikel ohne Bestandsführung
- `checkDuplicateReceipts` — erkennt gleiche Menge + Artikel + Bestellung innerhalb 1h
- `checkDuplicateReceipts` — false positive bei unterschiedlicher Menge
- `checkOverdueOrders` — findet überfällige Bestellungen
- `checkStockMismatch` — erkennt Differenz zwischen Bestand und Bewegungssumme
- `checkLowStockNoOrder` — findet Artikel unter Mindestbestand ohne Bestellung
- `checkOrphanReservations` — findet Reservierungen zu stornierten ABs
- `runCorrectionChecks` — erstellt Run mit korrekten Zählern
- `runCorrectionChecks` — dedupliziert: keine neue Meldung wenn gleicher Code+Artikel OPEN
- `resolve` — setzt Status RESOLVED mit Notiz und Zeitstempel
- `dismiss` — setzt Status DISMISSED

### Router Tests

**File:** `src/trpc/routers/__tests__/whCorrections-router.test.ts`

```ts
describe("warehouse.corrections", () => {
  it("messages.list — requires wh_corrections.view", async () => { })
  it("runs.trigger — executes checks and returns summary", async () => { })
  it("messages.resolve — marks as resolved", async () => { })
  it("summary — returns correct counts", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("messages.list — Mandant A sieht keine Meldungen von Mandant B", async () => { })
  it("runs.trigger — prüft nur Daten des eigenen Mandanten", async () => { })
  it("messages.resolve — Mandant A kann Meldung von Mandant B nicht bearbeiten", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/50-wh-corrections.spec.ts`

```ts
test.describe("UC-WH-11: Korrekturassistent Warenwirtschaft", () => {
  test("Prüflauf erkennt negativen Bestand", async ({ page }) => {
    // 1. Artikel mit negativem Bestand erstellen (Korrektur auf -5)
    // 2. Korrekturassistent öffnen → Prüfung starten
    // 3. Meldung NEGATIVE_STOCK erscheint mit Artikellink
  })

  test("Meldung als erledigt markieren", async ({ page }) => {
    // 1. Meldung öffnen → Erledigt mit Notiz
    // 2. Meldung verschwindet aus offener Liste
  })

  test("KPI-Karten zeigen korrekte Anzahl", async ({ page }) => {
    // 1. Mehrere Probleme erzeugen
    // 2. Dashboard prüfen: Fehler-Karte = X, Warnungen = Y
  })

  test("Meldung führt zum Artikel", async ({ page }) => {
    // 1. Meldung mit Artikellink klicken
    // 2. Artikeldetailseite wird geöffnet
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Repository Layer
- Jede Query MUSS `tenantId` filtern
- Prüflogik läuft immer im Kontext eines einzelnen Tenants
- Meldungen erben `tenantId` aus dem Prüflauf

### Service Layer
- `runCorrectionChecks` bekommt `tenantId` als Parameter
- Alle Prüfregeln filtern nach `tenantId`
- Keine Cross-Tenant-Aggregation

### Tests (MANDATORY)
- `describe("tenant isolation")` Block in Service-Tests
- Prüflauf für Mandant A findet keine Probleme von Mandant B

### Pattern Reference
See `src/lib/services/wh-article-service.ts` for canonical tenant isolation pattern.

---

## Acceptance Criteria

- [ ] `WhCorrectionMessage` und `WhCorrectionRun` Models mit Migration
- [ ] 7 Prüfregeln implementiert (NEGATIVE_STOCK, DUPLICATE_RECEIPT, OVERDUE_ORDER, UNMATCHED_RECEIPT, STOCK_MISMATCH, LOW_STOCK_NO_ORDER, ORPHAN_RESERVATION)
- [ ] Manueller Prüflauf über Button auslösbar
- [ ] Automatischer Prüflauf via Cron (täglich)
- [ ] KPI-Dashboard mit Fehler/Warnungen/Hinweise Zählern
- [ ] Meldungen können als erledigt/ignoriert markiert werden (mit Notiz)
- [ ] Massenbearbeitung (mehrere Meldungen gleichzeitig markieren)
- [ ] Deduplizierung: keine doppelten Meldungen für gleichen Artikel+Code
- [ ] Links zu betroffenen Artikeln und Belegen
- [ ] Prüflauf-Historie mit Ergebnis einsehbar
- [ ] Alle Procedures gated by permissions
- [ ] Cross-tenant isolation verified (Tests included)
