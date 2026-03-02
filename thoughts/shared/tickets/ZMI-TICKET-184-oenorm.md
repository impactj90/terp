# ZMI-TICKET-184: ÖNORM (Österreich)

Status: Proposed
Priority: P4
Owner: TBD
Epic: Phase 9 — Schnittstellen
Source: plancraft-anforderungen.md.pdf, Abschnitt 10.4 ÖNORM
Blocked by: ZMI-TICKET-121

## Goal
ÖNORM A 2063 Unterstützung für österreichische Kunden. Import und Export von Leistungsverzeichnissen im ÖNORM-Format.

## Scope
- **In scope:** ÖNORM A 2063 Parser, Import → Dokument, Export aus Dokument.
- **Out of scope:** Andere ÖNORM-Standards.

## Requirements

### ÖNORM A 2063
- Österreichisches Pendant zu GAEB
- XML-basiert
- Hierarchie: Leistungsgruppe → Unterleistungsgruppe → Position

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /import/oenorm | ÖNORM importieren |
| POST | /documents/{id}/export/oenorm | ÖNORM exportieren |

### Permissions
- `import.oenorm`, `export.oenorm`

## Acceptance Criteria
1. ÖNORM A 2063 Import.
2. ÖNORM A 2063 Export.
3. Hierarchie korrekt gemappt.

## Tests
### Unit Tests
- `TestOENORM_Parse`: ÖNORM XML → Positionen.
- `TestOENORM_Export`: Dokument → ÖNORM XML.
- `TestOENORM_Hierarchy`: Leistungsgruppen korrekt.

## Verification Checklist
- [ ] ÖNORM A 2063 Parser
- [ ] Import
- [ ] Export
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-121 (Dokumenten-Editor)
