# ZMI-TICKET-120: Nummernkreise — Datenmodell, Logik & API

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 3 — Nummernkreise & Dokumenten-Engine
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.4 Nummernkreise
Blocks: ZMI-TICKET-123, ZMI-TICKET-130, ZMI-TICKET-131, ZMI-TICKET-132, ZMI-TICKET-133, ZMI-TICKET-134

## Goal
Konfigurierbares Nummernkreis-System für alle Dokumententypen (Angebote, Auftragsbestätigungen, Rechnungen, Abschlagsrechnungen, Schlussrechnungen, Lieferscheine). Jeder Dokumententyp hat einen eigenen Nummernkreis mit Präfix, Datumsplatzhaltern und laufender Nummer. Die Nummern müssen chronologisch fortlaufend und eindeutig sein (§14 UStG).

## Scope
- **In scope:** Datenmodell (number_sequences, number_sequence_allocations), Nummernvergabe-Logik mit pessimistischem Locking, Jahreswechsel-Reset, API zum Konfigurieren und Vorschau, Überlauf-Warnung.
- **Out of scope:** Frontend UI (wird Teil von Einstellungen-UI), Dokumenten-Editor (ZMI-TICKET-121+), konkrete Dokumententypen (ZMI-TICKET-130+).

## Requirements

### Datenmodell

#### Tabelle `number_sequences`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| document_type | VARCHAR(30) | NOT NULL | 'offer', 'order_confirmation', 'invoice', 'partial_invoice', 'final_invoice', 'delivery_note', 'credit_note' |
| prefix | VARCHAR(20) | NOT NULL, DEFAULT '' | z.B. "AN-", "RE-", "AB-" |
| pattern | VARCHAR(100) | NOT NULL | Format-Pattern z.B. "{PREFIX}{YYYY}-{####}" |
| current_value | INT | NOT NULL, DEFAULT 0 | Aktueller Zählerstand |
| current_year | INT | NOT NULL | Jahr des aktuellen Zählers |
| min_digits | INT | NOT NULL, DEFAULT 4 | Mindest-Stellenzahl (zero-padded) |
| reset_yearly | BOOLEAN | NOT NULL, DEFAULT true | Automatischer Reset bei Jahreswechsel |
| is_active | BOOLEAN | NOT NULL, DEFAULT true | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Constraint:** UNIQUE (tenant_id, document_type) — ein Nummernkreis pro Dokumententyp pro Tenant.

#### Tabelle `number_sequence_allocations`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| sequence_id | UUID | FK number_sequences, NOT NULL | |
| allocated_number | VARCHAR(50) | NOT NULL | Die vergebene Nummer (z.B. "RE-2026-0042") |
| allocated_value | INT | NOT NULL | Der Zählerwert zum Zeitpunkt der Vergabe |
| allocated_year | INT | NOT NULL | Das Jahr der Vergabe |
| document_id | UUID | NULL | Referenz auf das Dokument (polymorph, gesetzt nach Fertigstellung) |
| document_type | VARCHAR(30) | NOT NULL | Dokumententyp zur Zuordnung |
| allocated_at | TIMESTAMPTZ | NOT NULL | |
| allocated_by | UUID | FK users, NOT NULL | |

**Constraint:** UNIQUE (tenant_id, sequence_id, allocated_number) — keine doppelten Nummern.
**Index:** idx_number_allocations_document (tenant_id, document_type, document_id) für schnelle Lookup.

### Pattern-Syntax

| Platzhalter | Beschreibung | Beispiel |
|-------------|-------------|---------|
| `{PREFIX}` | Konfigurierbares Präfix | "RE-" |
| `{YYYY}` | Volles Jahr | "2026" |
| `{YY}` | Kurzes Jahr | "26" |
| `{MM}` | Monat (zero-padded) | "03" |
| `{DD}` | Tag (zero-padded) | "18" |
| `{####}` | Laufende Nummer (Anzahl # = min_digits) | "0042" |

**Beispiele:**
- `{PREFIX}{YYYY}-{####}` → "RE-2026-0042"
- `{PREFIX}{YY}{MM}-{####}` → "AN-2603-0001"
- `{PREFIX}{####}` → "LS-0017" (kein Datum, kein Reset)

### Business Rules

1. **Atomare Nummernvergabe:** `SELECT ... FOR UPDATE` auf `number_sequences`-Zeile, dann `current_value++`, dann `INSERT` in `number_sequence_allocations`. Alles in einer Transaktion.
2. **Jahreswechsel-Reset:** Wenn `reset_yearly=true` und `current_year < aktuelles Jahr` → `current_value=0`, `current_year=aktuelles Jahr` vor Inkrementierung.
3. **Nummern nur bei Fertigstellung:** Nummer wird erst vergeben wenn ein Dokument den Status "finalized" erhält, nicht beim Erstellen des Entwurfs.
4. **Keine Lücken füllen:** Gelöschte Dokumente hinterlassen Lücken im Nummernkreis. Dies ist gesetzeskonform und wird dokumentiert.
5. **Nummern unveränderlich:** Einmal vergebene Nummern können nicht geändert oder wiederverwendet werden.
6. **Überlauf-Warnung:** Bei 90% Auslastung (z.B. 9000 von 9999 bei 4 Stellen) → Warnung im Response.
7. **Migration alter Nummernkreise:** `current_value` kann manuell gesetzt werden (für Systemwechsel), aber nur auf einen höheren Wert als den aktuellen.
8. **Unterscheidbarkeit:** Verschiedene Dokumententypen MÜSSEN unterschiedliche Präfixe haben (§14 UStG).
9. **Default-Nummernkreise:** Bei Tenant-Erstellung werden Standard-Nummernkreise angelegt:
   - Angebot: `AN-{YYYY}-{####}`
   - Auftragsbestätigung: `AB-{YYYY}-{####}`
   - Rechnung: `RE-{YYYY}-{####}`
   - Abschlagsrechnung: `AR-{YYYY}-{####}`
   - Schlussrechnung: `SR-{YYYY}-{####}`
   - Lieferschein: `LS-{YYYY}-{####}`
   - Gutschrift: `GS-{YYYY}-{####}`

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /number-sequences | Alle Nummernkreise des Tenants |
| GET | /number-sequences/{id} | Einzelnen Nummernkreis abrufen |
| PATCH | /number-sequences/{id} | Nummernkreis konfigurieren (Präfix, Pattern, min_digits, reset_yearly) |
| POST | /number-sequences/{id}/preview | Vorschau der nächsten Nummer (ohne Vergabe) |
| POST | /number-sequences/{id}/adjust | Zähler manuell anpassen (nur erhöhen) |
| GET | /number-sequences/{id}/allocations | Vergebene Nummern auflisten (mit Pagination) |

#### PATCH /number-sequences/{id} Request
```json
{
  "prefix": "RE-",
  "pattern": "{PREFIX}{YYYY}-{####}",
  "min_digits": 4,
  "reset_yearly": true
}
```

#### POST /number-sequences/{id}/preview Response
```json
{
  "next_number": "RE-2026-0043",
  "current_value": 42,
  "overflow_warning": false,
  "capacity_percent": 0.42
}
```

#### POST /number-sequences/{id}/adjust Request
```json
{
  "new_value": 500,
  "reason": "Migration aus Altsystem"
}
```

### Permissions
- `number_sequences.view` — Nummernkreise anzeigen
- `number_sequences.edit` — Nummernkreise konfigurieren
- `number_sequences.adjust` — Zähler manuell anpassen (nur Admin)

### Service-Interface

```go
type NumberSequenceService interface {
    // CRUD
    List(ctx context.Context, tenantID uuid.UUID) ([]NumberSequence, error)
    Get(ctx context.Context, tenantID, id uuid.UUID) (*NumberSequence, error)
    Update(ctx context.Context, tenantID, id uuid.UUID, input UpdateNumberSequenceInput) (*NumberSequence, error)

    // Kernlogik
    AllocateNext(ctx context.Context, tenantID uuid.UUID, documentType string, userID uuid.UUID) (*NumberAllocation, error)
    Preview(ctx context.Context, tenantID uuid.UUID, sequenceID uuid.UUID) (*NumberPreview, error)
    Adjust(ctx context.Context, tenantID, id uuid.UUID, newValue int, reason string) error

    // Allocations
    ListAllocations(ctx context.Context, tenantID, sequenceID uuid.UUID, params PaginationParams) ([]NumberAllocation, int64, error)

    // Setup
    CreateDefaultSequences(ctx context.Context, tenantID uuid.UUID) error
}
```

## Acceptance Criteria
1. Nummernkreise können pro Dokumententyp konfiguriert werden.
2. Nummern werden atomar und ohne Duplikate vergeben (auch unter Concurrent Load).
3. Pattern-Platzhalter ({YYYY}, {MM}, {DD}, {####}) werden korrekt aufgelöst.
4. Jahreswechsel-Reset funktioniert automatisch wenn aktiviert.
5. Überlauf-Warnung bei 90% Kapazität.
6. Manuelle Zähler-Anpassung nur nach oben möglich.
7. Vergebene Nummern sind audit-fähig (wer, wann, welches Dokument).
8. Default-Nummernkreise werden bei Tenant-Erstellung angelegt.
9. Verschiedene Dokumententypen haben unterscheidbare Nummern.
10. Tenant-Isolation gewährleistet.

## Tests

### Unit Tests — Service

#### Pattern-Auflösung
- `TestNumberSequence_FormatNumber_Basic`: Pattern `{PREFIX}{YYYY}-{####}` mit Prefix="RE-", Value=42, Year=2026 → "RE-2026-0042".
- `TestNumberSequence_FormatNumber_ShortYear`: Pattern `{PREFIX}{YY}-{####}` → "RE-26-0042".
- `TestNumberSequence_FormatNumber_WithMonth`: Pattern `{PREFIX}{YYYY}{MM}-{####}` mit Month=3 → "RE-202603-0042".
- `TestNumberSequence_FormatNumber_WithDay`: Pattern `{PREFIX}{YYYY}{MM}{DD}-{####}` → "RE-20260318-0042".
- `TestNumberSequence_FormatNumber_NoPrefixInPattern`: Pattern `{####}` → "0042".
- `TestNumberSequence_FormatNumber_CustomDigits`: min_digits=6, Value=42 → "000042".
- `TestNumberSequence_FormatNumber_NoZeroPadding`: min_digits=1, Value=42 → "42".
- `TestNumberSequence_FormatNumber_LargeNumber`: Value=12345, min_digits=4 → "12345" (nicht abgeschnitten).

#### Nummernvergabe
- `TestNumberSequence_Allocate_Increments`: Zwei aufeinanderfolgende Vergaben → Value 1 und 2.
- `TestNumberSequence_Allocate_YearReset`: current_year=2025, jetzt 2026, reset_yearly=true → Value startet bei 1.
- `TestNumberSequence_Allocate_NoYearReset`: current_year=2025, jetzt 2026, reset_yearly=false → Value inkrementiert weiter.
- `TestNumberSequence_Allocate_RecordsAllocation`: Allocation-Eintrag wird mit korrektem user_id, timestamp, number erstellt.
- `TestNumberSequence_Allocate_OverflowWarning`: current_value=8999, min_digits=4 → Warning bei Allocation.
- `TestNumberSequence_Allocate_UnknownDocType`: Unbekannter Dokumententyp → Error.

#### Manuelle Anpassung
- `TestNumberSequence_Adjust_IncreaseAllowed`: current=42, new=500 → OK.
- `TestNumberSequence_Adjust_DecreaseRejected`: current=42, new=10 → Error "cannot decrease counter".
- `TestNumberSequence_Adjust_SameValueRejected`: current=42, new=42 → Error.
- `TestNumberSequence_Adjust_ZeroRejected`: new=0 → Error.

#### Konfiguration
- `TestNumberSequence_Update_Prefix`: Prefix ändern → OK, nächste Nummer verwendet neues Prefix.
- `TestNumberSequence_Update_Pattern`: Pattern ändern → OK.
- `TestNumberSequence_Update_MinDigits`: min_digits von 4 auf 6 → nächste Nummer 6-stellig.
- `TestNumberSequence_Update_DuplicatePrefix`: Zwei Sequenzen mit gleichem Prefix → Warnung (kein Error, aber Response-Flag).

#### Jahreswechsel
- `TestNumberSequence_YearChange_AutoReset`: Sequenz aus 2025, erster Aufruf 2026 → current_year=2026, value=1.
- `TestNumberSequence_YearChange_PatternUpdates`: {YYYY} im Pattern zeigt neues Jahr.
- `TestNumberSequence_YearChange_MidYear_NoReset`: Mehrere Vergaben im selben Jahr → kein Reset.

#### Default-Sequenzen
- `TestNumberSequence_CreateDefaults`: Alle 7 Dokumententypen werden angelegt.
- `TestNumberSequence_CreateDefaults_Idempotent`: Erneuter Aufruf → kein Error, keine Duplikate.

### API Tests — Handler

- `TestNumberSequenceHandler_List_200`: Alle Sequenzen des Tenants.
- `TestNumberSequenceHandler_List_200_Empty`: Neuer Tenant ohne Sequenzen → leere Liste.
- `TestNumberSequenceHandler_Get_200`: Einzelne Sequenz mit allen Feldern.
- `TestNumberSequenceHandler_Get_404`: Unbekannte ID → 404.
- `TestNumberSequenceHandler_Patch_200`: Prefix und Pattern ändern.
- `TestNumberSequenceHandler_Patch_400_EmptyPattern`: Leeres Pattern → 400.
- `TestNumberSequenceHandler_Patch_400_InvalidPattern`: Pattern ohne {####} → 400 "pattern must contain sequence placeholder".
- `TestNumberSequenceHandler_Preview_200`: Vorschau ohne Seiteneffekt.
- `TestNumberSequenceHandler_Preview_200_WithWarning`: Nahe Überlauf → overflow_warning=true.
- `TestNumberSequenceHandler_Adjust_200`: Zähler erhöhen.
- `TestNumberSequenceHandler_Adjust_400_Decrease`: Zähler senken → 400.
- `TestNumberSequenceHandler_Adjust_403`: Ohne number_sequences.adjust → 403.
- `TestNumberSequenceHandler_Allocations_200`: Paginierte Liste vergebener Nummern.
- `TestNumberSequenceHandler_TenantIsolation`: Sequenz von Tenant A nicht über Tenant B abrufbar.

### Integration Tests

- `TestNumberSequence_ConcurrentAllocations`: 10 Goroutinen vergeben gleichzeitig Nummern → alle eindeutig, keine Lücken, keine Duplikate.
- `TestNumberSequence_FullLifecycle`: Sequenz konfigurieren → Preview → Allocate → Liste prüfen → Adjust → Allocate → Verify Continutiy.
- `TestNumberSequence_YearTransition_EndToEnd`: Sequenz in 2025 → Allocate → Simuliere Jahreswechsel → Allocate → Verify Reset.
- `TestNumberSequence_DefaultsOnTenantCreation`: Tenant erstellen → Verify alle 7 Default-Sequenzen existieren.

### Test Case Pack

1) **Standard-Nummernvergabe**
   - Setup: Sequenz RE-{YYYY}-{####}, current_value=41
   - Action: AllocateNext
   - Expected: "RE-2026-0042", current_value=42

2) **Jahreswechsel mit Reset**
   - Setup: current_year=2025, current_value=150, reset_yearly=true
   - Action: AllocateNext (im Jahr 2026)
   - Expected: "RE-2026-0001", current_year=2026, current_value=1

3) **Jahreswechsel ohne Reset**
   - Setup: current_year=2025, current_value=150, reset_yearly=false
   - Action: AllocateNext (im Jahr 2026)
   - Expected: "RE-2026-0151", current_year=2026, current_value=151

4) **Überlauf-Warnung**
   - Setup: min_digits=4, current_value=8999
   - Action: AllocateNext
   - Expected: "RE-2026-9000", overflow_warning=true, capacity_percent=90.0

5) **Concurrent Safety**
   - Setup: 10 parallele Allocations
   - Expected: Nummern 1-10 (eindeutig, lückenlos)

6) **Migration Altsystem**
   - Setup: current_value=0
   - Action: Adjust(new_value=500, reason="Migration")
   - Action: AllocateNext
   - Expected: "RE-2026-0501"

7) **Pattern ohne Jahresangabe**
   - Setup: Pattern `{PREFIX}{####}`, reset_yearly=false
   - Action: AllocateNext über Jahreswechsel
   - Expected: Nummer wird fortlaufend ohne Reset

8) **Maximale Stellenzahl**
   - Setup: min_digits=4, current_value=99999
   - Action: AllocateNext
   - Expected: "RE-2026-100000" (min_digits wird überschritten, nicht abgeschnitten)

## Verification Checklist
- [ ] Migration: `number_sequences` Tabelle erstellt
- [ ] Migration: `number_sequence_allocations` Tabelle erstellt
- [ ] Migration reversibel (DOWN)
- [ ] UNIQUE Constraint auf (tenant_id, document_type)
- [ ] UNIQUE Constraint auf (tenant_id, sequence_id, allocated_number)
- [ ] Pattern-Parser unterstützt alle Platzhalter ({PREFIX}, {YYYY}, {YY}, {MM}, {DD}, {####})
- [ ] Pessimistisches Locking (SELECT FOR UPDATE) bei Nummernvergabe
- [ ] Jahreswechsel-Reset funktioniert
- [ ] Überlauf-Warnung bei 90% Kapazität
- [ ] Manuelle Anpassung nur nach oben
- [ ] Default-Sequenzen bei Tenant-Erstellung
- [ ] Alle 7 Dokumententypen haben Default-Konfiguration
- [ ] Preview vergibt keine Nummer (read-only)
- [ ] Allocations werden mit User und Timestamp protokolliert
- [ ] Concurrent-Safety durch Integration-Test bewiesen
- [ ] Tenant-Isolation durch Test bewiesen
- [ ] Permissions durchgesetzt (view, edit, adjust)
- [ ] API Responses matchen OpenAPI-Spec
- [ ] `make lint` keine neuen Issues
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen

## Dependencies
- Keine harten Abhängigkeiten (Basismodul)
- Wird von ZMI-TICKET-123 (Dokumenten-Workflow) konsumiert
- Wird von allen Dokumententypen (130-134) konsumiert

## Notes
- Die Nummernvergabe ist einer der kritischsten Teile des Systems. Doppelte Rechnungsnummern sind ein steuerrechtliches Problem (§14 UStG).
- SELECT FOR UPDATE ist essentiell für Concurrent Safety. Advisory Locks wären eine Alternative, aber FOR UPDATE ist einfacher und reicht für die erwartete Last.
- Die `number_sequence_allocations` Tabelle dient als Audit-Trail und ermöglicht das Nachvollziehen aller vergebenen Nummern.
- Bei der Implementierung muss beachtet werden, dass die Nummernvergabe atomar innerhalb der Dokument-Fertigstellungs-Transaktion passiert.
- Für die Default-Sequenzen: Diese sollten beim Tenant-Setup über einen Seeder/Hook erstellt werden (analog zu bestehenden Default-Daten).
