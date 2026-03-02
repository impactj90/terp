# ZMI-TICKET-181: DATANORM Import (V4, V5) — Schnittstellen-Modul

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 9 — Schnittstellen
Source: plancraft-anforderungen.md.pdf, Abschnitt 10.2 DATANORM
Blocked by: ZMI-TICKET-105

## Goal
DATANORM als eigenständiges Schnittstellen-Modul (ergänzend zum Basis-Import in ZMI-TICKET-105). Erweiterte Funktionen: Katalog-Aktualisierung (Preisänderungen), gelöschte Artikel markieren, Rabattgruppen-Verarbeitung, Lieferanten-Verwaltung.

## Scope
- **In scope:** Katalog-Update-Logik (bestehende Artikel aktualisieren), Rabattgruppen-Mapping, Lieferanten-Verwaltung, Preis-Historisierung, Automatisierte Updates.
- **Out of scope:** Basis-Parser (ZMI-TICKET-105), Online-Katalog-Anbindung.

## Requirements

### Erweiterte Katalog-Updates
- Bestehende Kataloge aktualisieren (neue Preise übernehmen)
- Neue Artikel hinzufügen
- Gelöschte Artikel markieren (nicht löschen, da in Dokumenten referenziert)
- Preis-Historie pro Artikel speichern

### Lieferanten-Verwaltung
- Zuordnung Katalog → Lieferant (contact)
- Rabattgruppen pro Lieferant

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /import/datanorm/update | Katalog aktualisieren |
| GET | /import/datanorm/history | Import-Historie |
| GET | /articles/{id}/price-history | Preis-Historie eines Artikels |

### Permissions
- `import.datanorm` — (existiert aus ZMI-TICKET-105)

## Acceptance Criteria
1. Bestehende Kataloge aktualisierbar.
2. Preis-Historie gespeichert.
3. Gelöschte Artikel markiert.

## Tests
### Unit Tests
- `TestDATANORM_UpdatePrices`: Neue Preise → bestehende Artikel aktualisiert.
- `TestDATANORM_NewArticles`: Neue Artikel → hinzugefügt.
- `TestDATANORM_DeletedArticles`: Nicht im Katalog → markiert.
- `TestDATANORM_PriceHistory`: Alter + neuer Preis in Historie.

### API Tests
- `TestDATANORMHandler_Update_200`, `TestDATANORMHandler_History_200`

## Verification Checklist
- [ ] Katalog-Update-Logik
- [ ] Preis-Historie
- [ ] Gelöschte-Markierung
- [ ] Import-Historie
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-105 (DATANORM Basis-Import), ZMI-TICKET-101 (Kontakte/Lieferanten)
