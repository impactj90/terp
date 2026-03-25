# SYS_01 — DSGVO-Datenlöschung automatisiert

| Field | Value |
|-------|-------|
| **Module** | Administration / System |
| **Dependencies** | Employees, Bookings, Absences, Audit Logs |
| **Complexity** | M |
| **Priority** | Mittlere Priorität |
| **New Models** | `DsgvoRetentionRule`, `DsgvoDeleteLog` |

---

## ZMI-Referenz

ZMI Time Kap. 10.21: Zeitraumbasierte Löschung gemäß DSGVO. Konfigurierbar pro Datentyp (Buchungen, Fehltage, Monatswerte, Personalakten). Läuft als Aufgabe im ZMI Server. Definierter Aufbewahrungszeitraum, danach automatische Löschung oder Anonymisierung.

---

## Terp aktuell

- Keine automatisierte DSGVO-Löschung
- Daten bleiben unbegrenzt in der Datenbank
- Bereinigungswerkzeuge existieren (3-Schritt-Bestätigung), aber manuell
- Kein Konzept für Aufbewahrungsfristen pro Datentyp

---

## Goal

Ein konfigurierbares DSGVO-Löschsystem implementieren, das personenbezogene Daten nach Ablauf der Aufbewahrungsfrist automatisch löscht oder anonymisiert. Konfigurierbar pro Datentyp und Mandant. Läuft als Cron-Job mit Protokollierung aller Löschvorgänge.

---

## Prisma Models

### DsgvoRetentionRule

```prisma
model DsgvoRetentionRule {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  dataType        String   @map("data_type") // z.B. "BOOKINGS", "ABSENCES", "DAILY_VALUES", "AUDIT_LOGS", "PERSONNEL_FILE"
  retentionMonths Int      @map("retention_months") // Aufbewahrung in Monaten
  action          String   @default("DELETE") // "DELETE" | "ANONYMIZE"
  isActive        Boolean  @default(true) @map("is_active")
  description     String?
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, dataType])
  @@map("dsgvo_retention_rules")
}
```

### DsgvoDeleteLog

```prisma
model DsgvoDeleteLog {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  dataType      String   @map("data_type")
  action        String   // "DELETE" | "ANONYMIZE"
  recordCount   Int      @map("record_count")
  cutoffDate    DateTime @map("cutoff_date") @db.Date // Daten bis einschließlich diesem Datum
  executedAt    DateTime @default(now()) @map("executed_at") @db.Timestamptz(6)
  details       Json?    // z.B. { employeeIds: [...], dateRange: "2020-01-01 to 2022-12-31" }

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([executedAt])
  @@map("dsgvo_delete_logs")
}
```

---

## Unterstützte Datentypen

| dataType | Beschreibung | Standardfrist | Aktion |
|----------|-------------|---------------|--------|
| `BOOKINGS` | Stempelbuchungen (Kommen/Gehen) | 36 Monate | DELETE |
| `DAILY_VALUES` | Tageswerte (berechnete Zeiten) | 36 Monate | DELETE |
| `ABSENCES` | Abwesenheiten (Urlaub, Krank etc.) | 36 Monate | ANONYMIZE |
| `MONTHLY_VALUES` | Monatswerte (Konten, Flexzeit) | 60 Monate | DELETE |
| `AUDIT_LOGS` | Audit-Protokoll | 24 Monate | DELETE |
| `TERMINAL_BOOKINGS` | Terminal-Rohdaten | 12 Monate | DELETE |
| `PERSONNEL_FILE` | Personalakten-Einträge | 120 Monate (10 Jahre) | DELETE |
| `CORRECTION_MESSAGES` | Korrekturassistent-Meldungen | 12 Monate | DELETE |
| `STOCK_MOVEMENTS` | Lagerbewegungen | 120 Monate (10 Jahre) | ANONYMIZE |

### Anonymisierung

Bei Aktion "ANONYMIZE" werden personenbezogene Felder ersetzt:
- `employeeId` → null oder "ANONYMIZED"
- `createdById` → null
- Name/Identifikation → "Gelöscht gem. DSGVO"
- Sachbezogene Daten (Zeiten, Mengen) bleiben erhalten

---

## Permissions

```ts
p("dsgvo.view", "dsgvo", "view", "View DSGVO retention rules and logs"),
p("dsgvo.manage", "dsgvo", "manage", "Manage DSGVO retention rules"),
p("dsgvo.execute", "dsgvo", "execute", "Execute DSGVO data deletion manually"),
```

---

## tRPC Router

**File:** `src/trpc/routers/admin/dsgvo.ts`

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `rules.list` | query | `dsgvo.view` | `{}` | Alle Löschregeln |
| `rules.update` | mutation | `dsgvo.manage` | `{ dataType, retentionMonths, action, isActive }` | Regel konfigurieren |
| `rules.preview` | query | `dsgvo.view` | `{ dataType }` | Vorschau: wie viele Datensätze betroffen wären |
| `logs.list` | query | `dsgvo.view` | `{ page, pageSize }` | Löschprotokoll |
| `execute` | mutation | `dsgvo.execute` | `{ dataType?, dryRun? }` | Manuell ausführen (optional Dry-Run) |

---

## Service Layer

**File:** `src/lib/services/dsgvo-service.ts`

### Key Logic

```ts
export async function executeRetention(prisma, tenantId, dataType?, dryRun = false) {
  const rules = await getActiveRules(prisma, tenantId, dataType)

  const results = []
  for (const rule of rules) {
    const cutoffDate = subMonths(new Date(), rule.retentionMonths)

    // Vorschau: wie viele Datensätze betroffen?
    const count = await countAffectedRecords(prisma, tenantId, rule.dataType, cutoffDate)

    if (dryRun || count === 0) {
      results.push({ dataType: rule.dataType, count, action: rule.action, dryRun: true })
      continue
    }

    // Ausführen
    if (rule.action === "DELETE") {
      await deleteRecords(prisma, tenantId, rule.dataType, cutoffDate)
    } else {
      await anonymizeRecords(prisma, tenantId, rule.dataType, cutoffDate)
    }

    // Protokollieren
    await prisma.dsgvoDeleteLog.create({
      data: {
        tenantId,
        dataType: rule.dataType,
        action: rule.action,
        recordCount: count,
        cutoffDate,
      }
    })

    results.push({ dataType: rule.dataType, count, action: rule.action, dryRun: false })
  }

  return results
}
```

### Sicherheitsmaßnahmen

- **Dry-Run**: Standardmäßig als Vorschau, keine Löschung
- **Bestätigung**: Manuelles Ausführen erfordert 3-Schritt-Bestätigung (wie bestehende Bereinigungswerkzeuge)
- **Mindestfrist**: Minimum 6 Monate Aufbewahrung (kann nicht niedriger konfiguriert werden)
- **Gesetzliche Aufbewahrungspflichten**: Hinweis bei Fristen unter gesetzlichem Minimum (z.B. Lohndaten 10 Jahre)

---

## Cron Job

**File:** `src/app/api/cron/dsgvo-retention/route.ts`

- Läuft monatlich am 1. um 03:00 Uhr
- Führt `executeRetention` für alle aktiven Tenants aus
- Sendet Zusammenfassung als Benachrichtigung an Admins
- Vercel Cron Schedule: `0 3 1 * *`

---

## UI Components

### Page Route

| Route | Component | Description |
|-------|-----------|-------------|
| `/admin/dsgvo` | `DsgvoRetentionPage` | DSGVO-Konfiguration und Protokoll |

### Components

**In `src/components/admin/`:**

| Component | Description |
|-----------|-------------|
| `dsgvo-rules-table.tsx` | Tabelle: Datentyp, Frist (Monate), Aktion (Löschen/Anonymisieren), Aktiv, Betroffene Datensätze (live). Inline-Bearbeitung. |
| `dsgvo-preview-dialog.tsx` | Vorschau vor manueller Ausführung: Tabelle mit Datentyp + Anzahl. "Dry-Run" Toggle. 3-Schritt-Bestätigung. |
| `dsgvo-log-table.tsx` | Protokoll: Datum, Datentyp, Aktion, Anzahl gelöschter Datensätze. |
| `dsgvo-info-card.tsx` | Hinweiskarte mit DSGVO-Informationen und gesetzlichen Aufbewahrungsfristen |

---

## Hooks

**File:** `src/hooks/use-dsgvo.ts`

```ts
export function useDsgvoRules() { /* rules.list */ }
export function useUpdateDsgvoRule() { /* rules.update */ }
export function useDsgvoPreview(dataType: string) { /* rules.preview */ }
export function useDsgvoLogs(filters?) { /* logs.list */ }
export function useExecuteDsgvoRetention() { /* execute mutation */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/dsgvo-service.test.ts`

- `executeRetention` — löscht Buchungen älter als retentionMonths
- `executeRetention` — anonymisiert Abwesenheiten (employeeId → null)
- `executeRetention` — Dry-Run: zählt nur, löscht nicht
- `executeRetention` — ignoriert inaktive Regeln
- `executeRetention` — erstellt Log-Eintrag pro Datentyp
- `executeRetention` — Mindestfrist 6 Monate wird erzwungen
- `countAffectedRecords` — zählt korrekt pro Datentyp
- `anonymizeRecords` — ersetzt personenbezogene Felder, behält Sachdaten
- `deleteRecords` — löscht nur Datensätze vor cutoffDate

### Router Tests

```ts
describe("admin.dsgvo", () => {
  it("rules.list — requires dsgvo.view", async () => { })
  it("rules.update — requires dsgvo.manage", async () => { })
  it("execute — requires dsgvo.execute", async () => { })
  it("execute dryRun — returns count without deletion", async () => { })
  it("rules.preview — returns affected record count", async () => { })
})
```

### E2E Tests (API) — Tenant Isolation

```ts
describe("tenant isolation", () => {
  it("rules — Mandant A sieht keine Regeln von Mandant B", async () => { })
  it("execute — löscht nur Daten des eigenen Mandanten", async () => { })
  it("logs — Mandant A sieht keine Logs von Mandant B", async () => { })
})
```

### Browser E2E Tests

**File:** `src/e2e-browser/60-sys-dsgvo-retention.spec.ts`

```ts
test.describe("UC-SYS-01: DSGVO-Datenlöschung", () => {
  test("Aufbewahrungsfrist konfigurieren", async ({ page }) => {
    // 1. Admin → DSGVO öffnen
    // 2. Frist für Buchungen auf 24 Monate setzen
    // 3. Speichern → Wert bleibt erhalten
  })

  test("Vorschau zeigt betroffene Datensätze", async ({ page }) => {
    // 1. "Vorschau" klicken
    // 2. Dialog zeigt: "X Buchungen älter als 24 Monate"
    // 3. Dry-Run: keine Löschung
  })

  test("Manuelle Ausführung mit 3-Schritt-Bestätigung", async ({ page }) => {
    // 1. "Ausführen" klicken
    // 2. Bestätigungsdialog: Schritt 1 (Zusammenfassung) → Schritt 2 (Checkbox) → Schritt 3 (Eingabe "LÖSCHEN")
    // 3. Ausführung → Log-Eintrag erstellt
  })

  test("Löschprotokoll einsehbar", async ({ page }) => {
    // 1. Tab "Protokoll" öffnen
    // 2. Log-Einträge mit Datum, Datentyp, Anzahl sichtbar
  })
})
```

---

## Tenant Isolation Requirements (MANDATORY)

### Repository Layer
- Löschregeln sind Tenant-spezifisch
- Löschoperationen MÜSSEN immer `tenantId` im WHERE haben
- Cron-Job iteriert pro Tenant separat

### Service Layer
- `executeRetention` erhält `tenantId` als Parameter
- Keine Mandantenübergreifende Löschung möglich
- Logs sind Tenant-spezifisch

### Tests (MANDATORY)
- Löschung DARF nur Daten des eigenen Mandanten betreffen
- Cross-Tenant Test: Daten von Mandant B bleiben unangetastet

---

## Acceptance Criteria

- [ ] `DsgvoRetentionRule` und `DsgvoDeleteLog` Models mit Migration
- [ ] 9 Datentypen konfigurierbar mit Aufbewahrungsfrist
- [ ] Aktion: Löschen oder Anonymisieren pro Datentyp
- [ ] Mindestfrist 6 Monate erzwungen
- [ ] Dry-Run / Vorschau zeigt betroffene Datensätze
- [ ] Manuelle Ausführung mit 3-Schritt-Bestätigung
- [ ] Automatische Ausführung via Cron (monatlich)
- [ ] Löschprotokoll mit Datum, Datentyp, Aktion, Anzahl
- [ ] Anonymisierung: personenbezogene Felder ersetzt, Sachdaten bleiben
- [ ] Hinweise auf gesetzliche Aufbewahrungspflichten
- [ ] Cross-tenant isolation verified (Tests included)
