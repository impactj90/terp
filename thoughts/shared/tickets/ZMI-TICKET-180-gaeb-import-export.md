# ZMI-TICKET-180: GAEB Import/Export (DA83, DA84)

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 9 — Schnittstellen
Source: plancraft-anforderungen.md.pdf, Abschnitt 10.1 GAEB
Blocked by: ZMI-TICKET-121

## Goal
GAEB-Dateien (Gemeinsamer Ausschuss Elektronik im Bauwesen) importieren und exportieren. DA83 (Ausschreibung: Leistungsverzeichnis importieren → Angebot erstellen) und DA84 (Angebotsabgabe: Preise in importiertem LV eintragen → Export). Hierarchische Struktur: Lose → Titel → Untertitel → Positionen.

## Scope
- **In scope:** GAEB DA83 Parser, DA84 Export, GAEB 90/2000/XML Versionen, Hierarchie-Mapping zu document_items, OZ-Nummern (Ordnungszahlen).
- **Out of scope:** GAEB DA86 (Aufmaß), sonstige DA-Typen.

## Requirements

### Import (DA83)
1. Datei hochladen (`.d83`, `.x83`, `.p83`)
2. Parser erkennt Version (GAEB 90, 2000, XML)
3. Hierarchie extrahieren: Lose → Titel → Untertitel → Positionen
4. Mapping zu `document_items`: Titel → title, Positionen → position
5. OZ-Nummern als position_number übernehmen
6. Neues Dokument (Angebot) erstellen mit importierten Positionen
7. Alternativ-/Bedarfspositionen erkannt und korrekt gemappt

### Export (DA84)
1. Fertiggestelltes Angebot mit eingetragenen Preisen
2. Export als DA84-Datei
3. OZ-Nummern beibehalten
4. Preise (EP, GP) exportiert

### Edge Cases
- Ungültige GAEB-Dateien → Parser mit Fehlertoleranz und Fehlermeldung
- OZ-Nummern die nicht dem Standard entsprechen → Warnung, trotzdem importieren
- GAEB-Version erkennen (Unterschied 90 vs. 2000 vs. XML)

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /import/gaeb | GAEB-Datei importieren → Dokument erstellen |
| POST | /documents/{id}/export/gaeb | Dokument als GAEB DA84 exportieren |
| POST | /import/gaeb/preview | Vorschau ohne Erstellung |

### Permissions
- `documents.create`, `import.gaeb`

## Acceptance Criteria
1. GAEB DA83 Import (90, 2000, XML).
2. Hierarchie korrekt gemappt.
3. DA84 Export mit Preisen.
4. Fehlertoleranter Parser.

## Tests
### Unit Tests
- `TestGAEB_ParseDA83_V90`: Fixed-Width Format → Positionen.
- `TestGAEB_ParseDA83_VXML`: XML Format → Positionen.
- `TestGAEB_Hierarchy`: Lose → Titel → Positionen korrekt.
- `TestGAEB_AlternativePosition`: Alternativposition erkannt.
- `TestGAEB_ExportDA84`: Dokument → DA84 Datei mit Preisen.
- `TestGAEB_InvalidFile`: Ungültige Datei → Error mit Details.
- `TestGAEB_OZNumbers`: OZ-Nummern korrekt übernommen.

### API Tests
- `TestGAEBHandler_Import_201`, `TestGAEBHandler_Export_200`, `TestGAEBHandler_Preview_200`

### Integration Tests
- `TestGAEB_ImportExportRoundtrip`: DA83 importieren → Preise eintragen → DA84 exportieren.

## Verification Checklist
- [ ] GAEB 90, 2000, XML Parser
- [ ] DA83 Import
- [ ] DA84 Export
- [ ] Hierarchie-Mapping
- [ ] OZ-Nummern
- [ ] Fehlertoleranz
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-121 (Dokumenten-Editor)

## Notes
- Go-Bibliotheken für GAEB: Vermutlich keine vorhanden, eigener Parser nötig.
- GAEB 90 ist Fixed-Width, GAEB 2000 ist proprietär, GAEB XML ist am einfachsten zu parsen.
