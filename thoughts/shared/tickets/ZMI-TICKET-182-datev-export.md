# ZMI-TICKET-182: DATEV Export

Status: Proposed
Priority: P3
Owner: TBD
Epic: Phase 9 — Schnittstellen
Source: plancraft-anforderungen.md.pdf, Abschnitt 10.3 DATEV
Blocked by: ZMI-TICKET-132

## Goal
Rechnungsdaten als CSV für DATEV-Import exportieren. Enthält: Buchungssatz, Belegnummer, Datum, Betrag, Gegenkonto, Steuerschlüssel. PDF der Rechnung als Belegbild. Kompatibel mit DATEV Unternehmen Online.

## Scope
- **In scope:** DATEV CSV-Export (Buchungsstapel), Belegbild-Zuordnung, Konten-Mapping, Steuerschlüssel-Zuordnung, Export-Assistent mit Zeitraum-Auswahl.
- **Out of scope:** DATEV-API-Anbindung (nur Datei-Export), Lohnexport.

## Requirements

### DATEV CSV Format
```csv
Umsatz;Soll/Haben;WKZ;Kurs;Basisumsatz;WKZ Basisumsatz;Konto;Gegenkonto;BU-Schlüssel;Belegdatum;Belegfeld 1;...
6241,31;S;EUR;;6241,31;EUR;10001;8400;3;18032026;RE-2026-0042;...
```

### Konten-Mapping (konfigurierbar)
| Konto-Typ | Standard-Konto | Beschreibung |
|-----------|---------------|-------------|
| Debitoren | 10001-19999 | Kundennummer als Konto |
| Erlöse 19% | 8400 | Umsatzerlöse 19% |
| Erlöse 7% | 8300 | Umsatzerlöse 7% |
| Erlöse 0% | 8100 | Umsatzerlöse steuerfrei |

### Steuerschlüssel
| Code | Bedeutung |
|------|-----------|
| 3 | 19% USt |
| 2 | 7% USt |
| 0 | Steuerfrei |

### API / OpenAPI
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /export/datev | DATEV-Export erstellen |
| GET | /export/datev/config | Export-Konfiguration |
| PATCH | /export/datev/config | Konten-Mapping konfigurieren |

#### POST /export/datev Request
```json
{
  "from_date": "2026-01-01",
  "to_date": "2026-03-31",
  "include_pdfs": true
}
```

### Permissions
- `export.datev`

## Acceptance Criteria
1. CSV im DATEV-Format generiert.
2. Konten-Mapping konfigurierbar.
3. Steuerschlüssel korrekt.
4. PDFs als Belegbilder inkludierbar.
5. Zeitraum-Filter.

## Tests
### Unit Tests
- `TestDATEV_CSV_Format`: Korrekte Spaltenreihenfolge und Formatierung.
- `TestDATEV_TaxCode_19`: 19% → Code 3.
- `TestDATEV_TaxCode_7`: 7% → Code 2.
- `TestDATEV_MixedVat`: Rechnung mit 19% + 7% → 2 Buchungszeilen.
- `TestDATEV_DebtorAccount`: Kundennummer → Debitorenkonto.
- `TestDATEV_DateFormat`: 2026-03-18 → "18032026".
- `TestDATEV_AmountFormat`: 6241.31 → "6241,31".

### API Tests
- `TestDATEVHandler_Export_200`: CSV-Download.
- `TestDATEVHandler_Config_200`: Konfiguration abrufbar.

### Integration Tests
- `TestDATEV_FullExport`: 5 Rechnungen im Zeitraum → CSV mit 5+ Zeilen.

## Verification Checklist
- [ ] CSV im DATEV-Format
- [ ] Konten-Mapping konfigurierbar
- [ ] Steuerschlüssel korrekt
- [ ] PDF-Belegbilder
- [ ] Zeitraum-Filter
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-132 (Rechnungen), ZMI-TICKET-140 (PDF)
