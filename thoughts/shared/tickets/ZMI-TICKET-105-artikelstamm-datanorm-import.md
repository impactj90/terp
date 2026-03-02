# ZMI-TICKET-105: Artikelstamm/Leistungen — DATANORM-Import

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 1 — Stammdaten
Source: plancraft-anforderungen.md.pdf, Abschnitte 2.2 (Import-Formate) und 10.2 (DATANORM)
Blocked by: ZMI-TICKET-104

## Goal
DATANORM-Kataloge von Großhändlern importieren und bestehende Kataloge aktualisieren. DATANORM ist das Standard-Austauschformat für Artikeldaten im Bauwesen (Versionen V4 und V5).

## Scope
- **In scope:** DATANORM V4/V5 Parser, Import-Workflow (Upload → Preview → Execute), Katalog-Aktualisierung (Preisänderungen, neue Artikel, gelöschte Artikel), Encoding-Handling.
- **Out of scope:** GAEB Import (ZMI-TICKET-180), Frontend UI für Import (Teil von ZMI-TICKET-106), Excel-Import (ZMI-TICKET-183).

## Requirements

### DATANORM-Format Hintergrund
DATANORM ist ein zeilenbasiertes Format mit festen Satzarten:
- **Satzart A** (V4) / **Satzart 0** (V5): Normaler Artikeldatensatz
  - Artikelnummer, Kurztext 1+2, Langtext, Einheit, Preiskennzeichen, Preis, Warengruppe, Rabattgruppe
- **Satzart B** / **Satzart 1**: Langtexte (mehrzeilig)
- **Satzart P** / **Satzart 5**: Preisdatensätze (Rabatte, Staffelpreise)
- **Satzart V**: Herstellerdaten / Kataloginfo

### DATANORM V4 vs V5 Unterschiede
| Aspekt | V4 | V5 |
|--------|----|----|
| Encoding | ISO 8859-1 | ISO 8859-1 oder UTF-8 |
| Satzarten | A, B, P | 0, 1, 5 |
| Feldtrennung | Positionsbasiert (feste Breiten) | Semikolon-getrennt |
| Preisformat | Ganzzahl in Cent | Dezimal mit Punkt |
| Dateiendung | .dat, .001 | .dat, .001 |

### Import-Workflow

#### Schritt 1: Upload
```
POST /articles/import/datanorm/upload
- multipart/form-data
- Feld: file (DATANORM .dat/.001 Datei, max 50 MB)
- Feld: catalog_name (string, z.B. "Brillux 2026-Q1")
```
- Automatische Versionserkennung (V4 vs V5)
- Automatische Encoding-Erkennung (ISO 8859-1 → UTF-8 Konvertierung)
- Response:
  - Erkannte Version (V4/V5)
  - Anzahl Artikel
  - Anzahl neue / zu aktualisierende / zu löschende
  - Vorschau: erste 10 Artikel mit gemappten Feldern

#### Schritt 2: Preview & Konflikte
```
POST /articles/import/datanorm/preview
- Body: { upload_id, update_strategy }
```
- `update_strategy`:
  - `price_only`: Nur Preise aktualisieren, keine Texte
  - `full_update`: Preise + Texte aktualisieren
  - `new_only`: Nur neue Artikel, bestehende ignorieren
- Response:
  - Detaillierte Änderungsliste (alt → neu pro Feld)
  - Konflikte: Artikel mit manuell geändertem VK → Warnung
  - Zusammenfassung: X neu, Y aktualisiert, Z gelöscht markiert

#### Schritt 3: Execute
```
POST /articles/import/datanorm/execute
- Body: { upload_id, update_strategy, mark_deleted: bool }
```
- `mark_deleted`: Wenn true → Artikel die im alten Katalog waren aber im neuen nicht mehr, werden als archiviert markiert
- Import in Transaktion
- Response: Importbericht

### Feld-Mapping DATANORM → articles
| DATANORM-Feld | articles-Feld | Bemerkung |
|---------------|---------------|-----------|
| Artikelnummer | article_number | Eindeutiger Schlüssel für Updates |
| Kurztext 1+2 | short_text | Konkateniert mit Leerzeichen |
| Langtext | long_text | Aus Satzart B/1 |
| Mengeneinheit | unit | Mapping: "ST"→"Stk", "M"→"m", "M2"→"m²", "M3"→"m³", "KG"→"kg", "L"→"l", "PAU"→"psch.", "STD"→"h" |
| Preis | purchase_price | V4: Cent→Euro, V5: direkt |
| Preiskennzeichen | — | Bestimmt ob Netto/Brutto (nur Netto relevant) |
| Warengruppe | commodity_group | Direkt übernommen |
| Rabattgruppe | discount_group | Direkt übernommen |

### Business Rules
1. Artikelnummer ist der Merge-Key: Gleiche Nummer → Update, neue Nummer → Insert.
2. Bei `update_strategy = 'price_only'`: Nur `purchase_price` wird aktualisiert, short_text/long_text bleiben.
3. Alle importierten Artikel bekommen `datanorm_source` = catalog_name.
4. Alle importierten Artikel bekommen `cost_type = 'material'` (DATANORM enthält primär Material).
5. Alle importierten Artikel bekommen `sales_price_mode = 'surcharge'` (VK wird über Zuschläge berechnet).
6. Encoding: ISO 8859-1 Dateien werden transparent nach UTF-8 konvertiert. Ungültige Bytes werden durch `?` ersetzt mit Warnung.
7. Preis = 0 ist erlaubt (Kulanzartikel, Musterartikel).
8. Doppelte Artikelnummern innerhalb einer DATANORM-Datei: Letzter Eintrag gewinnt (mit Warnung).
9. Sehr lange Langtexte (>10.000 Zeichen): Abschneiden mit Warnung.
10. Leere Artikelnummer: Zeile überspringen mit Warnung.

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /articles/import/datanorm/upload | DATANORM-Datei hochladen |
| POST | /articles/import/datanorm/preview | Vorschau mit Änderungen |
| POST | /articles/import/datanorm/execute | Import durchführen |
| GET | /articles/import/datanorm/{id}/status | Import-Status |
| GET | /articles/import/datanorm/{id}/report | Importbericht |
| GET | /articles/datanorm-catalogs | Liste aller importierten Kataloge |
| DELETE | /articles/datanorm-catalogs/{name} | Katalog-Artikel archivieren |

### Permissions
- `articles.import` — Artikel importieren (impliziert articles.create + articles.edit)

## Acceptance Criteria
1. DATANORM V4 Dateien werden korrekt geparst (feste Feldbreiten, Cent-Preise).
2. DATANORM V5 Dateien werden korrekt geparst (Semikolon-getrennt, Dezimalpreise).
3. Encoding-Konvertierung ISO 8859-1 → UTF-8 funktioniert (Umlaute korrekt).
4. Update-Strategien (price_only, full_update, new_only) verhalten sich korrekt.
5. Doppelte Artikelnummern in Datei werden mit Warnung behandelt.
6. Katalog-Aktualisierung erkennt neue, geänderte und gelöschte Artikel.
7. Importbericht enthält pro Zeile das Ergebnis.
8. Einheiten werden korrekt gemappt.
9. Alle importierten Artikel sind im Artikelstamm suchbar.

## Tests

### Unit Tests — DATANORM V4 Parser
- `TestDATANORMV4Parser_BasicArticle`: Satzart A mit Artikelnummer, Kurztext, Preis → korrekt geparst.
- `TestDATANORMV4Parser_CentToEuro`: Preis "003500" (3500 Cent) → 35.00 €.
- `TestDATANORMV4Parser_LongText`: Satzart B zugehörig zu Satzart A → long_text korrekt.
- `TestDATANORMV4Parser_UnitMapping`: "ST"→"Stk", "M2"→"m²", "M3"→"m³", "KG"→"kg", "STD"→"h".
- `TestDATANORMV4Parser_UnknownUnit`: Unbekannte Einheit → Warnung, Default "Stk".
- `TestDATANORMV4Parser_FixedWidth`: Positionsbasiertes Parsing mit korrekten Feldgrenzen.
- `TestDATANORMV4Parser_ISO8859Encoding`: Umlaute in ISO 8859-1 → korrekt nach UTF-8.
- `TestDATANORMV4Parser_EmptyArticleNumber`: Leere Artikelnummer → Zeile übersprungen, Warnung.
- `TestDATANORMV4Parser_PriceZero`: Preis=0 → OK (Kulanz).
- `TestDATANORMV4Parser_CommodityGroup`: Warengruppe korrekt extrahiert.

### Unit Tests — DATANORM V5 Parser
- `TestDATANORMV5Parser_BasicArticle`: Satzart 0 mit Semikolon-Trennung → korrekt geparst.
- `TestDATANORMV5Parser_DecimalPrice`: Preis "35.50" → 35.50 €.
- `TestDATANORMV5Parser_LongText`: Satzart 1 → long_text korrekt.
- `TestDATANORMV5Parser_UTF8`: UTF-8 Datei → direkt verarbeitet.
- `TestDATANORMV5Parser_ISO8859`: ISO 8859-1 Datei → konvertiert.
- `TestDATANORMV5Parser_SemicolonInField`: Semikolon in gequotetem Feld → korrekt geparst.

### Unit Tests — Version Detection
- `TestDATANORM_VersionDetect_V4`: V4-Datei → Version "V4" erkannt.
- `TestDATANORM_VersionDetect_V5`: V5-Datei → Version "V5" erkannt.
- `TestDATANORM_VersionDetect_Invalid`: Weder V4 noch V5 → Fehler "Unbekanntes Format".

### Unit Tests — Import Service
- `TestDATANORMImport_NewArticles`: 10 neue Artikel → alle angelegt mit datanorm_source.
- `TestDATANORMImport_UpdatePriceOnly`: Bestehender Artikel, neuer Preis → nur Preis aktualisiert, Text bleibt.
- `TestDATANORMImport_UpdateFull`: Bestehender Artikel → Preis + Text aktualisiert.
- `TestDATANORMImport_NewOnly`: Bestehende überspringen → nur neue angelegt.
- `TestDATANORMImport_MarkDeleted`: Artikel aus altem Katalog nicht im neuen → archiviert.
- `TestDATANORMImport_DontMarkDeleted`: mark_deleted=false → alte Artikel bleiben.
- `TestDATANORMImport_DuplicateInFile`: Doppelte Artikelnummer → letzter gewinnt, Warnung.
- `TestDATANORMImport_MergeWithExisting`: Artikel existiert bereits (manuell angelegt) → Update bei gleicher Nummer.
- `TestDATANORMImport_ManualPriceConflict`: Artikel hat sales_price_mode='manual' → Warnung "VK wurde manuell gesetzt".
- `TestDATANORMImport_LongText_Truncate`: Langtext >10.000 Zeichen → abgeschnitten mit Warnung.
- `TestDATANORMImport_Transaction_Rollback`: Fehler bei Artikel 50 → alle vorherigen rollbacked.

### Unit Tests — Encoding
- `TestEncoding_ISO8859_Umlauts`: "M\xfcller" → "Müller".
- `TestEncoding_UTF8_Passthrough`: UTF-8 → unverändert.
- `TestEncoding_InvalidBytes`: Ungültige Bytes → "?" mit Warnung.
- `TestEncoding_BOM_Removed`: UTF-8 BOM entfernt.

### API Tests
- `TestDATANORMHandler_Upload_200`: V4-Datei hochladen → Version erkannt, Vorschau.
- `TestDATANORMHandler_Upload_200_V5`: V5-Datei hochladen → Version erkannt.
- `TestDATANORMHandler_Upload_400_InvalidFormat`: Keine DATANORM-Datei → 400.
- `TestDATANORMHandler_Upload_400_TooLarge`: >50 MB → 400.
- `TestDATANORMHandler_Upload_403`: Ohne articles.import → 403.
- `TestDATANORMHandler_Preview_200`: Änderungsliste korrekt.
- `TestDATANORMHandler_Execute_200`: Import durchgeführt, Bericht zurück.
- `TestDATANORMHandler_Catalogs_200`: Liste importierter Kataloge.
- `TestDATANORMHandler_CatalogDelete_200`: Katalog-Artikel archiviert.

### Integration Tests
- `TestDATANORM_EndToEnd_V4`: V4-Datei Upload → Preview → Execute → Artikel in DB prüfen.
- `TestDATANORM_EndToEnd_V5`: V5-Datei Upload → Preview → Execute → Artikel in DB prüfen.
- `TestDATANORM_CatalogUpdate`: Katalog importieren → zweiten Import mit geänderten Preisen → Preise aktualisiert.
- `TestDATANORM_CatalogUpdate_MarkDeleted`: Katalog importieren → zweiter Import ohne Artikel X → X archiviert.
- `TestDATANORM_EncodingRoundtrip`: ISO 8859-1 Datei mit Umlauten → Import → Artikel abrufen → Umlaute korrekt.
- `TestDATANORM_TenantIsolation`: Import in Tenant A → Artikel nicht in Tenant B.
- `TestDATANORM_LargeFile_1000Articles`: 1000 Artikel importieren → Performance < 30s.

### Test Case Pack
1) **DATANORM V4 Standard-Import**
   - Input: V4-Datei mit 5 Artikeln, ISO 8859-1, catalog_name="Brillux 2026"
   - Expected: 5 Artikel angelegt, cost_type="material", sales_price_mode="surcharge", datanorm_source="Brillux 2026"

2) **DATANORM V5 Import**
   - Input: V5-Datei mit Semikolon-Trennung, Preis "42.75"
   - Expected: purchase_price = 42.75

3) **Preis-Aktualisierung**
   - Setup: Katalog "Brillux 2025" importiert, Artikel MAT-001 mit EK=35.00
   - Input: Neuer Katalog "Brillux 2026", MAT-001 mit EK=37.50, strategy=price_only
   - Expected: EK aktualisiert auf 37.50, short_text unverändert, datanorm_source="Brillux 2026"

4) **Neuer Artikel im Update-Katalog**
   - Setup: Katalog mit 100 Artikeln importiert
   - Input: Neuer Katalog mit 105 Artikeln (5 neue)
   - Expected: 5 neue Artikel angelegt, 100 aktualisiert

5) **Gelöschter Artikel**
   - Setup: Katalog mit Artikel MAT-001 bis MAT-100
   - Input: Neuer Katalog ohne MAT-050, mark_deleted=true
   - Expected: MAT-050 archiviert, Rest aktualisiert

6) **Cent-Preis V4**
   - Input: V4 Preis-Feld "004299"
   - Expected: purchase_price = 42.99

7) **Umlaute ISO 8859-1**
   - Input: V4-Datei mit "Grundierfl\xe4che" (ISO 8859-1 für "Grundierfläche")
   - Expected: short_text = "Grundierfläche"

8) **Leere Artikelnummer**
   - Input: Zeile ohne Artikelnummer
   - Expected: Zeile übersprungen, Warnung im Bericht

9) **Unbekannte Einheit**
   - Input: Mengeneinheit "PCK" (nicht im Standard-Mapping)
   - Expected: unit="Stk" (Fallback), Warnung "Unbekannte Einheit: PCK"

10) **Datei ist weder V4 noch V5**
    - Input: Beliebige Textdatei
    - Expected: 400 "Datei konnte nicht als DATANORM erkannt werden"

## Verification Checklist
- [ ] DATANORM V4 Parser implementiert (feste Feldbreiten)
- [ ] DATANORM V5 Parser implementiert (Semikolon-getrennt)
- [ ] Automatische Versionserkennung (V4 vs V5)
- [ ] Encoding-Erkennung und Konvertierung (ISO 8859-1 → UTF-8)
- [ ] UTF-8 BOM wird transparent entfernt
- [ ] Einheiten-Mapping vollständig (ST, M, M2, M3, KG, L, PAU, STD)
- [ ] Preis-Konvertierung V4 (Cent → Euro) korrekt
- [ ] Upload-Endpoint akzeptiert bis 50 MB
- [ ] Preview zeigt neue/aktualisierte/gelöschte Artikel
- [ ] Update-Strategien (price_only, full_update, new_only) implementiert
- [ ] mark_deleted archiviert fehlende Artikel
- [ ] Doppelte Artikelnummern: letzter gewinnt + Warnung
- [ ] Leere Artikelnummern: übersprungen + Warnung
- [ ] Langtext-Truncation bei >10.000 Zeichen + Warnung
- [ ] Importbericht enthält Ergebnis pro Zeile
- [ ] datanorm_source wird korrekt gesetzt
- [ ] Katalog-Liste Endpoint funktioniert
- [ ] Transaktion: Rollback bei kritischem Fehler
- [ ] Tenant-Isolation verifiziert
- [ ] Alle Unit Tests bestehen
- [ ] Alle API Tests bestehen
- [ ] Alle Integration Tests bestehen
- [ ] Performance: 1000 Artikel < 30 Sekunden
- [ ] `make lint` zeigt keine neuen Issues

## Dependencies
- ZMI-TICKET-104 (Artikelstamm Datenmodell & API)

## Notes
- DATANORM V4 ist weiter verbreitet bei deutschen Großhändlern. V5 ist neuer aber seltener.
- Echte DATANORM-Testdateien sollten von Großhändlern (z.B. Brillux, Caparol, Dachdeckerbedarf) beschafft werden.
- Für die erste Implementierung reichen synthetische Testdateien die das Format nachahmen.
- DATANORM-Dateien können auch Staffelpreise enthalten (Satzart P/5) — das ist ein Future Enhancement und wird in dieser Version ignoriert.
- Die Katalog-Verwaltung (welche Kataloge wann importiert wurden) kann als separate Tabelle `datanorm_import_log` sinnvoll sein.
