# ZMI-TICKET-102: Kontakte/Kunden — CSV-Import & Duplikat-Erkennung

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 1 — Stammdaten
Source: plancraft-anforderungen.md.pdf, Abschnitt 2.1 (Import + Edge Cases)
Blocked by: ZMI-TICKET-101
Blocks: ZMI-TICKET-103

## Goal
CSV/Excel-Import für Kontakte mit interaktiver Spaltenzuordnung (Column Mapping) und automatischer Duplikat-Erkennung bei Import. Ermöglicht Migration aus anderen Systemen.

## Scope
- **In scope:** CSV/XLSX Upload, Spalten-Mapping API, Validierung, Duplikat-Erkennung, Batch-Import, Fehlerbericht.
- **Out of scope:** Frontend UI für Mapping (ZMI-TICKET-103), DATANORM-Import (ZMI-TICKET-105).

## Requirements

### Import-Workflow (API-Sicht)
```
1. POST /contacts/import/upload     → Datei hochladen, Vorschau zurückgeben
2. POST /contacts/import/preview    → Spalten-Mapping senden, Vorschau mit Duplikaten
3. POST /contacts/import/execute    → Import durchführen mit finalem Mapping
4. GET  /contacts/import/{id}/status → Import-Status abfragen (async für große Dateien)
```

### Schritt 1: Upload & Parsing
- Akzeptierte Formate: CSV (UTF-8, ISO 8859-1, UTF-8 BOM), XLSX
- Automatische Encoding-Erkennung (UTF-8 BOM wird transparent gehandelt)
- CSV-Trennzeichen: Auto-Detect (Komma, Semikolon, Tab)
- Response enthält:
  - Erkannte Spaltenköpfe (erste Zeile)
  - Erste 5 Zeilen als Vorschau
  - Erkanntes Encoding und Trennzeichen
  - Gesamtzahl Zeilen

### Schritt 2: Spalten-Mapping & Preview
- Client sendet Mapping: `{ "Firmenname": "company_name", "Name": "last_name", ... }`
- System-Felder für Mapping:
  - `company_name`, `salutation`, `first_name`, `last_name`
  - `street`, `zip`, `city`, `country`
  - `phone`, `mobile`, `fax`, `email`
  - `contact_type`, `tax_number`, `vat_id`, `notes`
- Nicht gemappte Spalten werden ignoriert
- Response enthält:
  - Validierungsergebnis pro Zeile (OK / Fehler / Warnung)
  - Erkannte Duplikate mit Match-Score und existierendem Kontakt
  - Zusammenfassung: X neue, Y Duplikate, Z Fehler

### Schritt 3: Execute
- Client sendet:
  - Finales Mapping (ggf. korrigiert)
  - Duplikat-Strategie pro Treffer: `skip` | `update` | `create_anyway`
  - Fehler-Strategie: `skip_errors` | `abort_on_error`
- Import läuft in einer Transaktion (bei abort_on_error) oder zeilenweise (bei skip_errors)
- Response: Import-Bericht mit Ergebnis pro Zeile

### Duplikat-Erkennung
- Match-Kriterien (gewichtet):
  - Exakter Match: last_name + company_name + zip → Score 100
  - Hoher Match: last_name + street + city → Score 90
  - Mittlerer Match: last_name + zip → Score 70
  - Niedriger Match: company_name (Fuzzy) → Score 50
- Duplikat-Schwelle: Score >= 70 wird als Duplikat markiert
- Fuzzy-Matching: Levenshtein-Distanz für Tippfehler (z.B. "Müler" ≈ "Müller")

### Encoding-Handling
- UTF-8 BOM (EF BB BF) am Dateianfang: transparent entfernen
- ISO 8859-1 / Windows-1252: automatisch nach UTF-8 konvertieren
- Erkennung via chardet oder ähnlich, mit Fallback auf UTF-8
- Umlaute müssen nach Import korrekt gespeichert sein (ä, ö, ü, ß)

### Validierung pro Zeile
- Pflichtfeld `last_name` leer → Fehler
- Geschäftskunde (`contact_type = business`) ohne `company_name` → Fehler
- Ungültige E-Mail-Adresse → Warnung
- Ungültiger Ländercode → Warnung, Default 'DE'
- Leere Zeile → überspringen (kein Fehler)

### API / OpenAPI

#### Endpoints
| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /contacts/import/upload | Datei hochladen (multipart/form-data) |
| POST | /contacts/import/preview | Mapping senden, Vorschau + Duplikate |
| POST | /contacts/import/execute | Import durchführen |
| GET | /contacts/import/{id}/status | Import-Status (für async) |
| GET | /contacts/import/{id}/report | Fehlerbericht herunterladen |

#### Upload Request
- Content-Type: multipart/form-data
- Feld: `file` (CSV oder XLSX, max. 10 MB)

#### Preview Response
```json
{
  "total_rows": 150,
  "valid": 142,
  "errors": 3,
  "duplicates": 5,
  "rows": [
    {
      "row_number": 1,
      "status": "ok",
      "data": { "last_name": "Müller", "company_name": "..." },
      "duplicate": null
    },
    {
      "row_number": 7,
      "status": "duplicate",
      "data": { "last_name": "Schmidt", "company_name": "Bau GmbH" },
      "duplicate": {
        "existing_contact_id": "uuid",
        "match_score": 90,
        "match_reason": "last_name + street + city"
      }
    },
    {
      "row_number": 12,
      "status": "error",
      "data": { "last_name": "", "company_name": "" },
      "errors": ["last_name ist ein Pflichtfeld"]
    }
  ]
}
```

### Permissions
- `contacts.import` — Kontakte importieren (impliziert contacts.create)

## Acceptance Criteria
1. CSV-Upload mit UTF-8, UTF-8 BOM, ISO 8859-1 und XLSX funktioniert.
2. Spalten-Mapping kann interaktiv zugeordnet werden.
3. Duplikate werden mit Score erkannt und im Preview angezeigt.
4. Import kann Duplikate überspringen, aktualisieren oder trotzdem anlegen.
5. Fehlerbericht zeigt pro Zeile was fehlgeschlagen ist.
6. Umlaute werden korrekt verarbeitet (kein Mojibake).
7. Leere Zeilen und Zeilen ohne Pflichtfelder werden korrekt behandelt.

## Tests

### Unit Tests — CSV Parser
- `TestCSVParser_UTF8`: Standard-UTF-8 CSV korrekt geparst.
- `TestCSVParser_UTF8BOM`: UTF-8 mit BOM → BOM transparent entfernt, Daten korrekt.
- `TestCSVParser_ISO8859`: ISO 8859-1 Datei mit Umlauten → korrekt nach UTF-8 konvertiert.
- `TestCSVParser_Windows1252`: Windows-1252 mit Sonderzeichen → korrekt konvertiert.
- `TestCSVParser_SemicolonSeparator`: Semikolon als Trennzeichen erkannt.
- `TestCSVParser_TabSeparator`: Tab als Trennzeichen erkannt.
- `TestCSVParser_CommaSeparator`: Komma als Trennzeichen erkannt.
- `TestCSVParser_QuotedFields`: Felder mit Anführungszeichen und enthaltenen Trennzeichen.
- `TestCSVParser_EmptyLines`: Leere Zeilen werden übersprungen.
- `TestCSVParser_HeaderOnly`: Nur Header-Zeile → 0 Datenzeilen.
- `TestCSVParser_LargeFile`: 10.000 Zeilen → korrekt geparst, kein Timeout.

### Unit Tests — XLSX Parser
- `TestXLSXParser_Basic`: Standard XLSX mit einem Sheet → korrekt geparst.
- `TestXLSXParser_MultiSheet`: Mehrere Sheets → nur erstes Sheet verwendet.
- `TestXLSXParser_FormattedCells`: Formatierte Zellen (Datum, Nummer) → als String extrahiert.

### Unit Tests — Duplikat-Erkennung
- `TestDuplicateDetection_ExactMatch`: Gleicher Name + Firma + PLZ → Score 100.
- `TestDuplicateDetection_HighMatch`: Gleicher Name + Straße + Stadt → Score 90.
- `TestDuplicateDetection_MediumMatch`: Gleicher Name + PLZ → Score 70.
- `TestDuplicateDetection_FuzzyCompanyName`: "Bau GmBH" vs "Bau GmbH" → Score >= 50.
- `TestDuplicateDetection_FuzzyLastName`: "Müler" vs "Müller" → erkannt.
- `TestDuplicateDetection_NoMatch`: Komplett unterschiedliche Daten → Score < 50.
- `TestDuplicateDetection_CaseInsensitive`: "müller" vs "Müller" → Match.
- `TestDuplicateDetection_TenantScoped`: Duplikat aus anderem Tenant → kein Match.

### Unit Tests — Validierung
- `TestImportValidation_MissingLastName`: Zeile ohne last_name → Fehler.
- `TestImportValidation_BusinessNoCompany`: contact_type=business ohne company_name → Fehler.
- `TestImportValidation_InvalidEmail`: Ungültige E-Mail → Warnung (kein Fehler).
- `TestImportValidation_InvalidCountry`: "Deutschland" statt "DE" → Warnung, Default DE.
- `TestImportValidation_EmptyRow`: Komplett leere Zeile → übersprungen (nicht als Fehler gezählt).
- `TestImportValidation_UnmappedColumns`: Nicht gemappte Spalten → ignoriert ohne Fehler.

### Unit Tests — Import-Execution
- `TestImportExecution_CreateNew`: 5 neue Kontakte → alle angelegt.
- `TestImportExecution_SkipDuplicates`: 3 neue + 2 Duplikate (skip) → nur 3 angelegt.
- `TestImportExecution_UpdateDuplicates`: 2 Duplikate (update) → bestehende Kontakte aktualisiert.
- `TestImportExecution_CreateAnyway`: 2 Duplikate (create_anyway) → 2 neue trotz Duplikat.
- `TestImportExecution_AbortOnError`: Zeile 3 hat Fehler, abort_on_error → Rollback, 0 angelegt.
- `TestImportExecution_SkipErrors`: Zeile 3 hat Fehler, skip_errors → Zeile 3 übersprungen, Rest angelegt.
- `TestImportExecution_TransactionRollback`: Bei abort_on_error: wenn Zeile 50 fehlschlägt, Zeilen 1-49 sind rollbacked.

### API Tests
- `TestImportHandler_Upload_200`: CSV hochladen → Vorschau mit Spalten und Zeilen.
- `TestImportHandler_Upload_400_InvalidFormat`: TXT-Datei → 400 "Ungültiges Dateiformat".
- `TestImportHandler_Upload_400_TooLarge`: >10 MB Datei → 400 "Datei zu groß".
- `TestImportHandler_Upload_401`: Ohne Auth → 401.
- `TestImportHandler_Upload_403`: Ohne contacts.import Permission → 403.
- `TestImportHandler_Preview_200`: Mapping senden → Preview mit Duplikaten.
- `TestImportHandler_Preview_400_InvalidMapping`: Unbekanntes Zielfeld → 400.
- `TestImportHandler_Execute_200`: Import durchführen → Bericht mit Ergebnis pro Zeile.
- `TestImportHandler_Execute_PartialSuccess`: skip_errors mit Fehlern → 200 mit Bericht.
- `TestImportHandler_Report_200`: Bericht abrufen → CSV-Download mit Fehlerdetails.

### Integration Tests
- `TestImport_EndToEnd_CSV`: Upload → Preview → Execute → Kontakte in DB verifizieren.
- `TestImport_EndToEnd_XLSX`: Upload XLSX → Preview → Execute → Kontakte in DB verifizieren.
- `TestImport_DuplicateUpdate`: Bestehenden Kontakt anlegen, CSV mit Update importieren → Kontakt aktualisiert.
- `TestImport_EncodingRoundtrip`: CSV mit Umlauten in ISO 8859-1 → Import → Kontakt abrufen → Umlaute korrekt.
- `TestImport_TenantIsolation`: Import in Tenant A → Kontakte nicht in Tenant B sichtbar.
- `TestImport_LargeImport_500Rows`: 500 Kontakte importieren → alle korrekt, Performance < 10s.

### Test Case Pack
1) **Standard CSV Import**
   - Input: CSV mit 10 Zeilen (Name, Firma, Adresse, Telefon, Email), UTF-8, Semikolon
   - Mapping: Spalte "Name" → last_name, "Firma" → company_name, etc.
   - Expected: 10 Kontakte angelegt, alle Felder korrekt

2) **CSV mit BOM und Umlauten**
   - Input: CSV (UTF-8 BOM) mit "Müller", "Böhm", "Größe"
   - Expected: Umlaute korrekt gespeichert, BOM nicht als Feldinhalt

3) **Duplikat-Erkennung**
   - Setup: Kontakt "Hans Müller, 80331 München" existiert
   - Input: CSV mit Zeile "Hans Müller, Hauptstr. 1, 80331 München"
   - Expected: Preview zeigt Duplikat mit Score >= 90

4) **Duplikat überspringen**
   - Input: Execute mit strategy=skip für Duplikat-Zeile
   - Expected: Kontakt nicht angelegt, Bericht zeigt "übersprungen"

5) **Duplikat aktualisieren**
   - Setup: Kontakt "Hans Müller" ohne Telefon
   - Input: CSV mit "Hans Müller, Tel: 089-123456", strategy=update
   - Expected: Bestehender Kontakt um Telefon ergänzt

6) **Fehler in Zeile → Abbruch**
   - Input: 10 Zeilen, Zeile 5 hat leeren last_name, strategy=abort_on_error
   - Expected: 0 Kontakte angelegt, Rollback, Bericht zeigt Fehler in Zeile 5

7) **Fehler in Zeile → Überspringen**
   - Input: 10 Zeilen, Zeile 5 hat leeren last_name, strategy=skip_errors
   - Expected: 9 Kontakte angelegt, Bericht zeigt Fehler in Zeile 5

8) **XLSX Import**
   - Input: XLSX mit 3 Spalten auf Sheet 1
   - Expected: Korrekt geparst, Import funktioniert wie bei CSV

9) **Leere Datei**
   - Input: CSV mit nur Header-Zeile, keine Daten
   - Expected: Preview zeigt 0 Zeilen, kein Fehler

10) **Falsche Spaltenzuordnung**
    - Input: Mapping ordnet "Telefon" → "last_name" zu
    - Expected: Preview zeigt Warnungen, Validation Errors für ungültige Daten

## Verification Checklist
- [ ] CSV-Parser unterstützt UTF-8, UTF-8 BOM, ISO 8859-1, Windows-1252
- [ ] CSV-Parser erkennt Trennzeichen automatisch (Komma, Semikolon, Tab)
- [ ] XLSX-Parser liest erstes Sheet korrekt
- [ ] Upload-Endpoint akzeptiert multipart/form-data bis 10 MB
- [ ] Preview zeigt Spaltenköpfe und Vorschau-Zeilen
- [ ] Spalten-Mapping wird korrekt angewendet
- [ ] Duplikat-Erkennung findet exakte und fuzzy Matches
- [ ] Duplikat-Score wird korrekt berechnet
- [ ] Import-Execution unterstützt skip/update/create_anyway pro Duplikat
- [ ] Import-Execution unterstützt abort_on_error und skip_errors
- [ ] Transaktion wird bei abort_on_error korrekt rollbacked
- [ ] Fehlerbericht enthält Zeilennummer und Fehlergrund
- [ ] Umlaute sind nach Import korrekt (kein Mojibake)
- [ ] Leere Zeilen werden übersprungen
- [ ] Tenant-Isolation ist gewährleistet
- [ ] Permission `contacts.import` wird durchgesetzt
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen
- [ ] Performance: 500 Zeilen Import < 10 Sekunden
- [ ] `make lint` zeigt keine neuen Issues

## Dependencies
- ZMI-TICKET-101 (Kontakte Datenmodell & API)

## Notes
- Temporäre Upload-Dateien werden nach 1 Stunde automatisch gelöscht.
- Import-Sessions (Upload → Preview → Execute) haben eine Session-ID und laufen nicht über Tage.
- Für sehr große Imports (>1000 Zeilen) könnte ein async Worker sinnvoll sein (Future Enhancement).
