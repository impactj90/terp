# ZMI-TICKET-140: PDF-Generierung — Engine & Briefpapier-Layout

Status: Proposed
Priority: P2
Owner: TBD
Epic: Phase 5 — PDF & Versand
Source: plancraft-anforderungen.md.pdf, Abschnitt 11.2 Briefpapier
Blocked by: ZMI-TICKET-123, ZMI-TICKET-107
Blocks: ZMI-TICKET-141, ZMI-TICKET-142

## Goal
PDF-Generierungsengine für alle Dokumententypen. Unterstützung für automatisches Layout (System generiert Header/Footer mit Logo, Adresse, Bankverbindung) und eigenes Briefpapier (PDF-Hintergrund). Konfigurierbare Schriftart, Farben und Positionen. Automatische PDF-Generierung bei Dokument-Fertigstellung.

## Scope
- **In scope:** PDF-Engine (HTML → PDF via Headless Chrome oder WeasyPrint), Briefpapier-Layout (automatisch + eigenes PDF), Dokumenten-Template-System, Dateinamen-Konfiguration, Export-Optionen (mit/ohne Briefpapier, mit/ohne Preise).
- **Out of scope:** E-Mail-Versand (ZMI-TICKET-141), XRechnung (ZMI-TICKET-142).

## Requirements

### PDF-Engine Architektur
```
Dokument-Daten → HTML-Template-Engine → HTML → Headless Chrome/WeasyPrint → PDF
                                                         ↓
                                          Briefpapier-Overlay (wenn eigenes PDF)
                                                         ↓
                                                    Finales PDF
```

### Layout-Optionen

1. **Automatisches Layout:**
   - Header: Logo (links), Firmenname + Adresse (rechts)
   - Adressfeld: Absender-Kurzzeile + Empfänger-Adresse
   - Dokumentinfo: Nummer, Datum, Kundennummer, Bearbeiter
   - Positionen: Tabelle mit Pos-Nr, Bezeichnung, Menge, Einheit, EP, GP
   - Summenblock: Netto, MwSt-Aufschlüsselung, Brutto
   - Footer: Bankverbindung, Steuernummer, Kontakt

2. **Eigenes Briefpapier:**
   - PDF hochladen → als Hintergrund verwenden
   - Nur Inhaltsbereich wird gedruckt (Ränder konfigurierbar)
   - Schriftart, Farben, Positionen anpassbar

### Konfiguration (tenant_pdf_settings)
| Feld | Beschreibung | Default |
|------|-------------|---------|
| layout_mode | 'auto' oder 'custom' | 'auto' |
| letterhead_file_id | Eigenes Briefpapier PDF | NULL |
| font_family | Schriftart | 'Inter' |
| primary_color | Hauptfarbe (Hex) | '#1a1a1a' |
| accent_color | Akzentfarbe | '#2563eb' |
| margin_top | Oberer Rand (mm) | 45 |
| margin_bottom | Unterer Rand (mm) | 30 |
| margin_left | Linker Rand (mm) | 25 |
| margin_right | Rechter Rand (mm) | 20 |
| show_position_numbers | Positionsnummern anzeigen | true |
| show_long_text | Langtext anzeigen | true |
| filename_pattern | Dateiname-Muster | '{type}_{number}_{customer}' |

### Dateinamen-Platzhalter
- `{type}` → Dokumententyp (Angebot, Rechnung, etc.)
- `{number}` → Dokumentennummer
- `{customer}` → Kundenname
- `{date}` → Dokumentdatum (YYYY-MM-DD)
- `{project}` → Projektname

Beispiel: `Angebot_AN-2026-0001_Müller.pdf`

### Export-Optionen
- Mit Briefpapier (Standard)
- Ohne Briefpapier (nur Inhalt)
- Ohne Preise (für Lieferscheine / Arbeitsanweisungen)

### Business Rules
1. PDF wird automatisch bei Fertigstellung generiert (Event-Handler).
2. PDF wird in project_files gespeichert und mit Dokument verknüpft.
3. Bei Wiederöffnung + erneutem Fertigstellen → neues PDF überschreibt altes.
4. Briefpapier-Änderung → bereits generierte PDFs bleiben unverändert.
5. PDF-Generierung ist asynchron (Queue), max. 5 Sekunden.
6. Seitenumbruch-Items (page_break) erzwingen Seitenumbruch im PDF.

### API / OpenAPI

| Method | Path | Beschreibung |
|--------|------|--------------|
| POST | /documents/{id}/generate-pdf | PDF manuell generieren |
| GET | /documents/{id}/pdf | PDF herunterladen |
| GET | /documents/{id}/pdf/preview | PDF-Vorschau (Inline im Browser) |
| GET | /pdf-settings | PDF-Einstellungen abrufen |
| PATCH | /pdf-settings | PDF-Einstellungen ändern |
| POST | /pdf-settings/test | Test-PDF mit aktuellen Einstellungen generieren |

### Permissions
- `documents.view` — PDF herunterladen
- `pdf_settings.manage` — PDF-Einstellungen ändern

## Acceptance Criteria
1. PDF wird bei Fertigstellung automatisch generiert.
2. Automatisches Layout mit Logo, Adresse, Footer.
3. Eigenes Briefpapier als PDF-Hintergrund.
4. Positionen mit Hierarchie korrekt dargestellt.
5. Summenblock mit MwSt-Aufschlüsselung.
6. Export-Optionen (mit/ohne Briefpapier, ohne Preise).
7. Konfigurierbare Dateinamen.
8. PDF-Generierung < 5 Sekunden.

## Tests

### Unit Tests
- `TestPDF_TemplateRendering`: HTML-Template mit Dokumentdaten → korrektes HTML.
- `TestPDF_SummaryBlock`: Summen korrekt formatiert (deutsche Zahlenformatierung).
- `TestPDF_Hierarchy`: Titel/Positionen mit Einrückung.
- `TestPDF_AlternativePositions`: Alternativpositionen markiert.
- `TestPDF_PageBreak`: page_break Item → CSS page-break.
- `TestPDF_FilenameGeneration`: Pattern → korrekter Dateiname.
- `TestPDF_WithoutPrices`: Preisspalten ausgeblendet.
- `TestPDF_Letterhead_AutoLayout`: Logo + Adresse positioniert.
- `TestPDF_VatSummary_Mixed`: 19% + 7% aufgeschlüsselt.

### API Tests
- `TestPDFHandler_Generate_200`: PDF generiert.
- `TestPDFHandler_Download_200`: PDF downloadbar.
- `TestPDFHandler_Download_404_NotGenerated`: Kein PDF → 404.
- `TestPDFHandler_Preview_200`: Inline-Vorschau.
- `TestPDFHandler_Settings_200`: Einstellungen abrufen.
- `TestPDFHandler_Settings_Patch_200`: Einstellungen ändern.

### Integration Tests
- `TestPDF_FinalizeGeneratesPDF`: Dokument fertigstellen → PDF automatisch generiert.
- `TestPDF_ReopenRegenerates`: Wiederöffnen → Fertigstellen → neues PDF.
- `TestPDF_CustomLetterhead`: Eigenes Briefpapier hochladen → PDF mit Hintergrund.

### Test Case Pack
1) **Auto-Layout PDF**: Angebot mit 5 Positionen → PDF mit Logo, Adresse, Footer, Summen.
2) **Eigenes Briefpapier**: PDF hochladen → Angebot-PDF mit Hintergrund.
3) **Ohne Preise**: Lieferschein export → keine Preisspalten.
4) **Dateiname**: Pattern `{type}_{number}_{customer}` → "Angebot_AN-2026-0001_Müller.pdf".

## Verification Checklist
- [ ] PDF-Engine installiert und konfiguriert
- [ ] HTML-Templates für alle Dokumententypen
- [ ] Auto-Layout mit Logo, Adresse, Footer
- [ ] Eigenes Briefpapier als PDF-Hintergrund
- [ ] Konfigurierbare Ränder und Schriftarten
- [ ] Export-Optionen
- [ ] Dateinamen-Generierung
- [ ] Automatische Generierung bei Fertigstellung
- [ ] PDF < 5 Sekunden
- [ ] Tenant-Isolation
- [ ] Alle Tests bestehen

## Dependencies
- ZMI-TICKET-123 (Dokumenten-Workflow — Event-System)
- ZMI-TICKET-107 (Unternehmensdaten — Logo, Briefpapier)
- ZMI-TICKET-111 (Dateiablage — für PDF-Speicherung)

## Notes
- Headless Chrome (Puppeteer/Chromedp) vs. WeasyPrint: Chrome hat bessere CSS-Unterstützung, WeasyPrint ist leichter zu deployen. Empfehlung: WeasyPrint für V1, Chrome als Option.
- PDF-Templates sollten als Go html/template implementiert werden, nicht als externe Template-Engine.
- Für die automatische Generierung: Ein goroutine-basierter Worker-Pool reicht zunächst. Queue (RabbitMQ/SQS) erst bei Bedarf.
