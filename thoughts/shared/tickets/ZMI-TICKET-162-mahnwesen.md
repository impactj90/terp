# ZMI-TICKET-162: Mahnwesen — Automatisierter Workflow

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 7 — Finanzen & Kalkulation
Source: plancraft-anforderungen.md.pdf, Abschnitt 9.3 Mahnwesen
Blocked by: ZMI-TICKET-132, ZMI-TICKET-141

## Goal
Automatisiertes Mahnwesen: Zahlungserinnerung → 1. Mahnung → 2. Mahnung → 3. Mahnung mit Androhung rechtlicher Schritte. Konfigurierbare Fristen, E-Mail-Vorlagen, Verzugszinsen und Mahngebühren. Automatischer oder manueller Versand.

## Scope
- **In scope:** Datenmodell (dunning_levels, dunning_entries), automatische Fälligkeitserkennung, Mahnstufen-Workflow, Verzugszinsen/Mahngebühren-Berechnung, E-Mail-Versand, Mahnpause bei Reklamation.
- **Out of scope:** Inkasso-Integration, Anwaltsanbindung.

## Requirements

### Datenmodell

#### Tabelle `dunning_levels`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| level | INT | NOT NULL | 0=Erinnerung, 1-3=Mahnung |
| name | VARCHAR(100) | NOT NULL | z.B. "Zahlungserinnerung" |
| days_after_due | INT | NOT NULL | Tage nach Fälligkeit |
| fee | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | Mahngebühr |
| interest_rate | DECIMAL(5,2) | NOT NULL, DEFAULT 0 | Verzugszins p.a. |
| email_template_id | UUID | FK email_templates, NULL | |
| auto_send | BOOLEAN | NOT NULL, DEFAULT false | Automatisch versenden |
| created_at | TIMESTAMPTZ | NOT NULL | |

#### Tabelle `dunning_entries`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| document_id | UUID | FK documents, NOT NULL | Rechnung |
| tenant_id | UUID | FK tenants, NOT NULL | |
| dunning_level_id | UUID | FK dunning_levels, NOT NULL | |
| dunning_date | DATE | NOT NULL | |
| fee_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| interest_amount | DECIMAL(10,2) | NOT NULL, DEFAULT 0 | |
| total_outstanding | DECIMAL(14,2) | NOT NULL | Offener Gesamtbetrag |
| status | VARCHAR(20) | NOT NULL | 'pending', 'sent', 'paused', 'resolved' |
| paused_reason | TEXT | | Bei Reklamation |
| sent_at | TIMESTAMPTZ | NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |

### Business Rules
1. Teilzahlung eingeht → Mahnprozess für Restbetrag fortsetzen.
2. Kunde reklamiert → Mahnprozess pausieren (manuell).
3. Skonto-Frist abgelaufen + Zahlung mit Skonto → Warnung, Differenz erfassen.
4. Verzugszinsen: Basiszinssatz + 9% (B2B) oder + 5% (B2C) gemäß BGB §288.

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /dunning/overdue | Überfällige Rechnungen |
| POST | /dunning/entries | Mahnung erstellen |
| POST | /dunning/entries/{id}/send | Mahnung versenden |
| POST | /dunning/entries/{id}/pause | Mahnprozess pausieren |
| GET | /dunning/levels | Mahnstufen-Konfiguration |
| PATCH | /dunning/levels/{id} | Mahnstufe konfigurieren |

### Permissions
- `dunning.view`, `dunning.manage`, `dunning.send`

## Acceptance Criteria
1. Überfällige Rechnungen automatisch erkannt.
2. Mahnstufen-Workflow (Erinnerung → 1-3 Mahnung).
3. Verzugszinsen und Mahngebühren berechnet.
4. E-Mail-Versand (automatisch oder manuell).
5. Mahnpause bei Reklamation.

## Tests
### Unit Tests
- `TestDunning_OverdueDetection`: Fällige Rechnung → in überfällige Liste.
- `TestDunning_InterestCalc`: 10000€, 30 Tage überfällig, 9% → Zins berechnet.
- `TestDunning_PartialPayment`: 5000€ von 10000€ → Mahnung für 5000€.
- `TestDunning_Pause`: Pausiert → keine automatischen Mahnungen.
- `TestDunning_Escalation`: Level 0 → Level 1 nach konfigurierten Tagen.

### API Tests
- `TestDunningHandler_Overdue_200`, `TestDunningHandler_CreateEntry_201`, `TestDunningHandler_Pause_200`

## Verification Checklist
- [ ] Migration: dunning_levels, dunning_entries
- [ ] Überfälligkeitserkennung
- [ ] Mahnstufen-Workflow
- [ ] Verzugszinsen-Berechnung
- [ ] Mahngebühren
- [ ] E-Mail-Versand
- [ ] Mahnpause
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-132 (Rechnungen/Zahlungen), ZMI-TICKET-141 (E-Mail-Versand)
