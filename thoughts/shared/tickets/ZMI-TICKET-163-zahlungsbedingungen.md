# ZMI-TICKET-163: Zahlungsbedingungen — Konfiguration & Textvorlagen

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 7 — Finanzen & Kalkulation
Source: plancraft-anforderungen.md.pdf, Abschnitt 9.4 Zahlungsbedingungen, 11.4
Blocked by: ZMI-TICKET-107

## Goal
Konfigurierbare Zahlungsbedingungen (global + pro Kunde überschreibbar): Zahlungsziel, Skonto, Verzugszinsen, Mahngebühren. Textvorlagen für Zahlungsbedingungen auf Dokumenten (automatisch aus Konfiguration generiert).

## Scope
- **In scope:** Datenmodell (payment_terms), globale + kundenspezifische Konfiguration, Textvorlage-Generierung, Integration mit Dokumenten.
- **Out of scope:** Mahnwesen-Logik (ZMI-TICKET-162).

## Requirements

### Datenmodell

#### Tabelle `payment_terms`
| Feld | Typ | Constraints | Beschreibung |
|------|-----|-------------|--------------|
| id | UUID | PK | |
| tenant_id | UUID | FK tenants, NOT NULL | |
| name | VARCHAR(100) | NOT NULL | z.B. "Standard 14 Tage" |
| payment_days | INT | NOT NULL | Zahlungsziel |
| discount_percent | DECIMAL(5,2) | | Skonto % |
| discount_days | INT | | Skonto-Frist |
| late_interest_rate | DECIMAL(5,2) | | Verzugszins p.a. |
| fee_per_dunning | DECIMAL(10,2) | | Mahngebühr |
| text_template | TEXT | NOT NULL | Textvorlage mit Platzhaltern |
| is_default | BOOLEAN | NOT NULL, DEFAULT false | |
| created_at | TIMESTAMPTZ | NOT NULL | |

### Textvorlage-Platzhalter
- `{Zahlungsziel}` → "14 Tage"
- `{Skonto}` → "2% bei Zahlung innerhalb von 7 Tagen"
- `{Fälligkeitsdatum}` → konkretes Datum

Beispiel-Text: "Zahlbar innerhalb von {Zahlungsziel} netto. Bei Zahlung innerhalb von {SkontoDays} Tagen gewähren wir {SkontoPercent}% Skonto."

### Kundenspezifische Überschreibung
Auf `contacts`: `payment_terms_id UUID FK payment_terms NULL`

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| GET | /payment-terms | Alle Zahlungsbedingungen |
| POST | /payment-terms | Neue erstellen |
| PATCH | /payment-terms/{id} | Bearbeiten |
| DELETE | /payment-terms/{id} | Löschen |

### Permissions
- `payment_terms.manage`

## Acceptance Criteria
1. Zahlungsbedingungen konfigurierbar (Tage, Skonto, Zinsen).
2. Textvorlagen mit Platzhaltern.
3. Kundenspezifische Überschreibung.
4. Bei Dokumenterstellung automatisch eingefügt.

## Tests
### Unit Tests
- `TestPaymentTerms_TextGeneration`: Platzhalter → konkreter Text.
- `TestPaymentTerms_CustomerOverride`: Kunde hat eigene Bedingungen → werden verwendet.
- `TestPaymentTerms_Default`: Kein kundenspezifisch → Default.

### API Tests
- `TestPaymentTermsHandler_CRUD`: Erstellen/Lesen/Aktualisieren/Löschen.

## Verification Checklist
- [ ] Migration: payment_terms, payment_terms_id auf contacts
- [ ] CRUD
- [ ] Textvorlage-Generierung
- [ ] Kunden-Override
- [ ] Integration mit Dokumenten
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-107 (Unternehmensdaten), ZMI-TICKET-101 (Kontakte)
