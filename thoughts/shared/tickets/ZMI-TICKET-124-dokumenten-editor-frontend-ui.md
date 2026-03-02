# ZMI-TICKET-124: Dokumenten-Editor — Frontend UI (Drag & Drop)

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 3 — Nummernkreise & Dokumenten-Engine
Source: plancraft-anforderungen.md.pdf, Abschnitt 3.2 Dokumenten-Editor (Drag & Drop)
Blocked by: ZMI-TICKET-121, ZMI-TICKET-122, ZMI-TICKET-123

## Goal
Vollständiger Dokumenten-Editor als Frontend-Komponente in der Next.js Web-App. Der Editor ermöglicht das Erstellen, Bearbeiten und Verwalten von Auftragsdokumenten (Angebote, Rechnungen, etc.) mit Drag & Drop für die Positionshierarchie, Inline-Kalkulation, Artikelstamm-Suche und Dokumenten-Workflow (Fertigstellen, Versand).

## Scope
- **In scope:** Dokumentenliste, Dokument-Editor mit hierarchischer Positionsverwaltung (Drag & Drop), Inline-Kalkulation (Tiefenkalkulation), Artikelsuche & Einfügen, Summenblock (Netto/MwSt/Brutto), Dokumenten-Workflow-Actions (Fertigstellen, Erneut bearbeiten, Stornieren), Vorschau-Modus, Nummernkreis-Konfiguration (Einstellungen).
- **Out of scope:** PDF-Generierung (ZMI-TICKET-140), E-Mail-Versand UI (ZMI-TICKET-141), spezifische Abschlagsrechnungs-Logik (ZMI-TICKET-133).

## Requirements

### Seitenstruktur

#### Dokumentenliste `/documents`
- Tabellenansicht mit Spalten: Typ-Icon, Nummer, Titel, Kunde, Status-Badge, Datum, Netto-Betrag
- Filter: Dokumententyp, Status, Projekt, Kunde, Datumsbereich
- Sortierung: Datum, Nummer, Betrag
- Schnellaktionen: Bearbeiten, Klonen, Fertigstellen, Stornieren
- Bulk-Aktionen: Keine in V1
- "Neues Dokument" Button → Dokumententyp-Auswahl (Dropdown oder Modal)

#### Dokument-Editor `/documents/{id}`

**Layout: 2-Spalten**

```
┌─────────────────────────────────────────────────────────────┐
│  [← Zurück]  Angebot: Malerarbeiten Müller  [Status Badge] │
│  AN-2026-0001 (oder "Entwurf" wenn noch keine Nummer)       │
├─────────────────────────────────────────────────────────────┤
│                              │                              │
│  ┌─── Dokumenten-Header ───┐ │  ┌─── Seitenleiste ───────┐ │
│  │ Kunde: [Autocomplete]   │ │  │ Dokumentinfo            │ │
│  │ Projekt: [Select]       │ │  │ - Erstellt: 18.03.2026  │ │
│  │ Datum: [DatePicker]     │ │  │ - Geändert: 18.03.2026  │ │
│  │ Gültig bis: [Date]     │ │  │ - Von: Max Mustermann   │ │
│  │ Einleitung: [Textarea]  │ │  │                         │ │
│  └─────────────────────────┘ │  │ Aktionen                │ │
│                              │  │ [Fertigstellen]          │ │
│  ┌─── Positionen ──────────┐ │  │ [Vorschau]              │ │
│  │ [+ Titel] [+ Position]  │ │  │ [Klonen]                │ │
│  │ [+ Text] [+ Seitenum.]  │ │  │ [Stornieren]            │ │
│  │ [Aus Artikelstamm]      │ │  │                         │ │
│  │                         │ │  │ Zusammenfassung          │ │
│  │ ▸ 1. Malerarbeiten EG   │ │  │ Netto:    5.234,50 €   │ │
│  │   1.1 Wand streichen   │ │  │ MwSt 19%:   994,56 €   │ │
│  │   1.2 Decke streichen  │ │  │ Brutto:   6.229,06 €   │ │
│  │ ▸ 2. Tapezierarbeiten   │ │  │                         │ │
│  │   2.1 Rauhfaser         │ │  │ Kalkulation             │ │
│  │                         │ │  │ Lohn:      2.340,00 €   │ │
│  │ Schlusstext: [Textarea]  │ │  │ Material:  1.456,00 €   │ │
│  └─────────────────────────┘ │  │ Geräte:      238,50 €   │ │
│                              │  │ Gesamt-h:    47,5 h     │ │
│  ┌─── Summenblock ─────────┐ │  │                         │ │
│  │ Netto:    5.234,50 €    │ │  │ Zahlungsbedingungen     │ │
│  │ MwSt 19%:   994,56 €   │ │  │ [Zahlungsziel: 14 Tage] │ │
│  │ MwSt 7%:     12,25 €   │ │  │ [Skonto: 2% / 7 Tage]  │ │
│  │ Brutto:   6.241,31 €   │ │  └─────────────────────────┘ │
│  └─────────────────────────┘ │                              │
└─────────────────────────────────────────────────────────────┘
```

### Positions-Editor

#### Drag & Drop
- **Bibliothek:** `@dnd-kit/core` oder `react-beautiful-dnd` (TBD)
- **Drag Handle:** Links an jeder Zeile
- **Drop-Zonen:** Zwischen Elementen, innerhalb von Titeln (zum Verschachteln)
- **Hierarchie-Wechsel:** Item in/aus Titel ziehen ändert parent_id
- **Visuelle Indikation:** Einrückung zeigt Hierarchie, Drop-Zone-Highlight
- **Constraints:** Max 3 Ebenen, Positionen nicht unter Positionen

#### Inline-Bearbeitung
- Klick auf Position → Inline-Editor öffnet sich (Accordion/Expandable Row)
- Felder: Kurztext, Langtext (Rich-Text), Einheit, Menge, EP, GP
- Positionstyp-Selector (Normal, Alternativ, Bedarf, Pauschal, Text)
- Tab "Kalkulation" → Tiefenkalkulation-Editor

#### Kalkulation-Panel (pro Position)
```
┌─── Kalkulation: Wand streichen ──────────────────────┐
│                                                       │
│  Kostenart: Lohn                                      │
│  ┌────────────────────────────────────────────────┐   │
│  │ Bezeichnung    | Einheit | Menge  | EK    | GP │   │
│  │ Zeitansatz     | h/m²    | 0.15   | 45.00 | 6.75│  │
│  │ [+ Eintrag]                                    │   │
│  └────────────────────────────────────────────────┘   │
│  Basis: 6,75 €  Zuschlag (68%): 4,59 €  = 11,34 €   │
│                                                       │
│  Kostenart: Material                                  │
│  ┌────────────────────────────────────────────────┐   │
│  │ Wandfarbe      | l/m²    | 0.30   | 8.50 | 2.55│  │
│  │ Abdeckmaterial | Stk     | 1      | 0.50 | 0.50│  │
│  │ [+ Eintrag] [Aus Artikelstamm]                 │   │
│  └────────────────────────────────────────────────┘   │
│  Basis: 3,05 €  Zuschlag (15%): 0,46 €  = 3,51 €    │
│                                                       │
│  ═══════════════════════════════════════              │
│  EP (berechnet): 15,18 €/m²                          │
│  Zeitwert: 0,15 h/m²                                 │
└───────────────────────────────────────────────────────┘
```

### Artikelstamm-Suche

- Suchfeld mit Autocomplete (Debounced, min 2 Zeichen)
- Suche über: Kurztext, Artikelnummer, Langtext
- Ergebnis: Artikelkarte mit Preis und Einheit
- Klick → Position wird mit Artikel-Snapshot eingefügt
- Optional: "Mit Kalkulation einfügen" (erstellt cost_entries aus Artikeldaten)
- Keyboard-Navigation: Pfeiltasten, Enter zum Einfügen

### Workflow-Aktionen

#### Fertigstellen-Button
1. Klick → POST /validate
2. Bei Errors → Dialog mit Fehlerliste
3. Bei nur Warnings → Dialog "Trotzdem fertigstellen?" mit Warnungen
4. Bei OK → POST /finalize
5. Erfolg → Seite wechselt in Read-Only-Modus, Nummer wird angezeigt

#### Erneut Bearbeiten
1. Klick → Bestätigungsdialog "Nummer bleibt bestehen"
2. POST /reopen
3. Seite wechselt zurück in Bearbeitungsmodus

#### Stornieren
1. Klick → Dialog mit Grund-Eingabe (Pflicht bei finalisierten Dokumenten)
2. POST /cancel
3. Status-Badge → "Storniert" (rot)

### Vorschau-Modus
- Button "Vorschau" → Dokument als Print-Layout anzeigen (ohne PDF)
- Zeigt: Header mit Firmenlogo, Adresse, Positionen, Summen
- Kein Bearbeiten möglich
- "Schließen" → zurück zum Editor

### Nummernkreis-Einstellungen `/settings/number-sequences`
- Liste aller Nummernkreise des Tenants
- Pro Nummernkreis: Prefix, Pattern, Min-Digits, Reset-Yearly
- Live-Vorschau: "Nächste Nummer: RE-2026-0043"
- Zähler manuell anpassen (mit Bestätigungsdialog)

### Concurrent Edit Warning
- Beim Laden: `version` merken
- Bei PATCH: `version` mitsenden
- 409 Conflict → Toast: "Das Dokument wurde von einem anderen Benutzer geändert. Bitte laden Sie die Seite neu."
- "Neu laden"-Button in der Toast-Notification

### Responsive Verhalten
- Desktop (>1200px): 2-Spalten Layout
- Tablet (768-1200px): Seitenleiste als Collapsible
- Mobile (<768px): Kein Dokumenten-Editor (zu komplex), nur Lese-Ansicht

### Keyboard Shortcuts
| Shortcut | Aktion |
|----------|--------|
| Ctrl+S | Speichern (Auto-Save deaktiviert, manuell) |
| Ctrl+Enter | Fertigstellen |
| Ctrl+N | Neue Position hinzufügen |
| Tab | Nächstes Feld in Position |
| Escape | Position schließen / Dialog schließen |

### React Hooks

```typescript
// Dokumente
useDocuments(filters) → { documents, isLoading, pagination }
useDocument(id) → { document, isLoading, error }
useCreateDocument() → { create, isLoading }
useUpdateDocument() → { update, isLoading }
useDeleteDocument() → { delete, isLoading }
useCloneDocument() → { clone, isLoading }
useConvertDocument() → { convert, isLoading }

// Items
useDocumentItems(docId) → { items, isLoading }
useAddItem() → { add, isLoading }
useUpdateItem() → { update, isLoading }
useDeleteItem() → { delete, isLoading }
useReorderItems() → { reorder, isLoading }
useAddFromArticle() → { addFromArticle, isLoading }

// Kalkulation
useItemCalculation(docId, itemId) → { calculation, isLoading }
useUpdateCalculation() → { update, isLoading }

// Workflow
useFinalizeDocument() → { finalize, isLoading }
useReopenDocument() → { reopen, isLoading }
useCancelDocument() → { cancel, isLoading }
useValidateDocument(docId) → { validation, isLoading }

// Nummernkreise
useNumberSequences() → { sequences, isLoading }
useUpdateNumberSequence() → { update, isLoading }
usePreviewNumber(seqId) → { preview, isLoading }
```

### Internationalisierung (i18n)
- Alle UI-Texte in `messages/de.json` und `messages/en.json`
- Schlüssel-Namespace: `documents.*`, `calculation.*`, `numberSequences.*`
- Zahlenformatierung: DE (1.234,56 €), EN ($1,234.56) basierend auf Locale

## Acceptance Criteria
1. Dokumentenliste mit Filter, Sortierung und Schnellaktionen.
2. Drag & Drop Positionseditor mit Hierarchie (max 3 Ebenen).
3. Inline-Kalkulation (Tiefenkalkulation) pro Position.
4. Artikelstamm-Suche mit Autocomplete und Einfügen.
5. Summenblock mit MwSt-Aufschlüsselung (live aktualisiert).
6. Workflow-Aktionen (Fertigstellen, Erneut bearbeiten, Stornieren).
7. Vorschau-Modus (Print-Layout).
8. Concurrent Edit Warning (409 → Toast).
9. Nummernkreis-Konfiguration in Einstellungen.
10. Responsive (Desktop + Tablet, Mobile Read-Only).
11. Keyboard Shortcuts.
12. i18n (DE + EN).

## Tests

### Component Tests

#### Dokumentenliste
- `test_DocumentList_renders_with_documents`: Liste mit Daten → Zeilen angezeigt.
- `test_DocumentList_empty_state`: Keine Dokumente → Leerzustand-Hinweis.
- `test_DocumentList_filter_by_type`: Typ-Filter → nur passende Dokumente.
- `test_DocumentList_filter_by_status`: Status-Filter → korrekte Filterung.
- `test_DocumentList_sort_by_date`: Sortierung wechseln → korrekte Reihenfolge.
- `test_DocumentList_quick_action_clone`: Klonen-Button → useCloneDocument aufgerufen.
- `test_DocumentList_status_badges`: Korrekte Badge-Farben für jeden Status.

#### Positionseditor
- `test_PositionEditor_renders_hierarchy`: Titel + Positionen → korrekte Einrückung.
- `test_PositionEditor_add_title`: "Titel hinzufügen" → neuer Titel am Ende.
- `test_PositionEditor_add_position`: "Position hinzufügen" → neue Position.
- `test_PositionEditor_add_position_under_title`: Position unter Titel → korrekte parent_id.
- `test_PositionEditor_inline_edit`: Klick auf Position → Inline-Editor öffnet sich.
- `test_PositionEditor_delete_position`: Löschen → Position entfernt, Summen aktualisiert.
- `test_PositionEditor_delete_title_cascades`: Titel löschen → Kinder auch entfernt.
- `test_PositionEditor_drag_reorder`: Drag & Drop → sort_order aktualisiert.
- `test_PositionEditor_drag_reparent`: Position in anderen Titel ziehen → parent_id geändert.
- `test_PositionEditor_max_depth_enforced`: 4. Ebene verhindern → Drop nicht erlaubt.
- `test_PositionEditor_position_numbers`: Automatische Nummerierung angezeigt (1, 1.1, etc.).
- `test_PositionEditor_alternative_styling`: Alternative Position → grau/kursiv dargestellt.
- `test_PositionEditor_readonly_when_finalized`: Finalisiert → kein Bearbeiten/Drag möglich.

#### Kalkulations-Panel
- `test_CalcPanel_renders_cost_blocks`: Alle Kostenblöcke angezeigt.
- `test_CalcPanel_add_entry`: Eintrag hinzufügen → Block aktualisiert.
- `test_CalcPanel_edit_entry`: Eintrag ändern → Summen neuberechnet.
- `test_CalcPanel_delete_entry`: Eintrag löschen → Summen neuberechnet.
- `test_CalcPanel_surcharge_display`: Zuschläge mit Prozent und Betrag angezeigt.
- `test_CalcPanel_unit_price_calculated`: EP aus Kalkulation berechnet und angezeigt.
- `test_CalcPanel_article_search_insert`: Artikel suchen → Eintrag einfügen.

#### Artikelsuche
- `test_ArticleSearch_autocomplete`: Eingabe "Wand" → Vorschläge angezeigt.
- `test_ArticleSearch_debounce`: Schnelle Eingabe → nur 1 API-Call.
- `test_ArticleSearch_min_chars`: 1 Zeichen → kein API-Call, 2 Zeichen → API-Call.
- `test_ArticleSearch_select_inserts_position`: Auswahl → Position mit Artikeldaten eingefügt.
- `test_ArticleSearch_keyboard_navigation`: Pfeiltasten → Auswahl navigiert.

#### Summenblock
- `test_SummaryBlock_shows_totals`: Netto, MwSt, Brutto angezeigt.
- `test_SummaryBlock_mixed_vat`: Zwei MwSt-Sätze → aufgeschlüsselt.
- `test_SummaryBlock_updates_on_change`: Position ändern → Summen live aktualisiert.
- `test_SummaryBlock_currency_format`: Deutsche Zahlenformatierung (1.234,56 €).

#### Workflow-Dialoge
- `test_FinalizeDialog_validation_errors`: Fehler angezeigt → Button deaktiviert.
- `test_FinalizeDialog_warnings_force`: Warnungen → "Trotzdem"-Option.
- `test_FinalizeDialog_success`: Erfolg → Read-Only-Modus, Nummer angezeigt.
- `test_ReopenDialog_confirmation`: Bestätigungsdialog → Warnung über Nummer.
- `test_CancelDialog_reason_required`: Bei finalisiertem Dokument → Grund Pflicht.
- `test_ConcurrentEdit_toast`: 409 → Toast "Von anderem Benutzer geändert".

#### Nummernkreis-Einstellungen
- `test_NumberSequenceSettings_list`: Alle Sequenzen angezeigt.
- `test_NumberSequenceSettings_edit_prefix`: Prefix ändern → Vorschau aktualisiert.
- `test_NumberSequenceSettings_preview`: Live-Vorschau der nächsten Nummer.
- `test_NumberSequenceSettings_adjust_counter`: Zähler erhöhen → Bestätigungsdialog.

### E2E Tests

- `test_e2e_create_offer`: Neues Angebot → Positionen hinzufügen → Summen prüfen → Fertigstellen → Nummer angezeigt.
- `test_e2e_drag_drop_reorder`: Positionen per Drag & Drop umordnen → Nummern aktualisiert.
- `test_e2e_drag_into_title`: Position in Titel ziehen → Einrückung und Nummerierung korrekt.
- `test_e2e_article_search_insert`: Artikelsuche → Position eingefügt mit korrekten Daten.
- `test_e2e_calculation_full`: Kalkulation aufbauen → EP berechnet → GP und Summen korrekt.
- `test_e2e_finalize_workflow`: Entwurf → Fertigstellen → Nummer vergeben → Read-Only.
- `test_e2e_reopen_edit_refinalize`: Wiederöffnen → Bearbeiten → Erneut fertigstellen → gleiche Nummer.
- `test_e2e_cancel_document`: Stornieren → Status-Badge "Storniert".
- `test_e2e_clone_document`: Klonen → Neuer Entwurf mit gleichen Positionen.
- `test_e2e_convert_offer_to_confirmation`: Angebot → Auftragsbestätigung konvertieren.
- `test_e2e_concurrent_edit_warning`: Zwei Tabs → Einer bearbeitet → Anderer bekommt Warnung.
- `test_e2e_number_sequence_config`: Einstellungen → Prefix ändern → Nächstes Dokument hat neuen Prefix.

### Accessibility Tests

- `test_a11y_document_editor_navigable`: Tab-Navigation durch alle Elemente.
- `test_a11y_drag_drop_keyboard`: Drag & Drop per Keyboard (Space + Pfeiltasten).
- `test_a11y_status_badges_aria`: Status-Badges haben aria-labels.
- `test_a11y_dialogs_focus_trap`: Dialoge haben Focus Trap.
- `test_a11y_form_labels`: Alle Eingabefelder haben Labels.

### Test Case Pack

1) **Neues Angebot erstellen und fertigstellen**
   - Navigiere zu /documents → "Neues Angebot"
   - Titel hinzufügen "Malerarbeiten EG"
   - 2 Positionen hinzufügen (Wand 85m² × 15€, Decke 40m² × 12€)
   - Summen prüfen: Netto = 85×15 + 40×12 = 1755
   - Fertigstellen → Nummer AN-2026-0001

2) **Drag & Drop Hierarchie**
   - Titel "EG" + Titel "OG" erstellen
   - Position erstellen (Root-Level)
   - Position in Titel "EG" ziehen → Positionsnummer ändert sich zu "1.1"
   - Position von "EG" nach "OG" ziehen → Nummer wird "2.1"

3) **Tiefenkalkulation**
   - Position "Wand streichen" erstellen
   - Kalkulation öffnen
   - Lohn: 0.15h × 45€ = 6.75€
   - Material: Farbe 0.3l × 8.50€ = 2.55€
   - Zuschlag Lohn 68%, Material 15%
   - EP angezeigt ≈ 15.18€

4) **Artikelstamm-Integration**
   - "Aus Artikelstamm" klicken
   - "Wand" eintippen → Vorschläge
   - Artikel auswählen → Position mit Daten eingefügt

5) **Concurrent Edit**
   - Tab A und Tab B öffnen gleichzeitig Dokument
   - Tab A ändert Titel → Speichern OK
   - Tab B ändert Position → 409 Toast

6) **Nummernkreis konfigurieren**
   - Einstellungen → Nummernkreise
   - Rechnungs-Prefix von "RE-" auf "RG-" ändern
   - Vorschau zeigt "RG-2026-0043"
   - Nächste Rechnung fertigstellen → "RG-2026-0043"

7) **Dokument konvertieren**
   - Angebot erstellen und fertigstellen
   - "Als Auftragsbestätigung übernehmen"
   - Neuer Entwurf mit allen Positionen, Typ=AB

8) **Responsive**
   - Browser auf 768px verkleinern → Seitenleiste collapsed
   - Browser auf 600px → Read-Only-Ansicht

## Verification Checklist
- [ ] Dokumentenliste mit Filtern und Sortierung
- [ ] Status-Badges mit korrekten Farben
- [ ] 2-Spalten Editor-Layout
- [ ] Drag & Drop mit @dnd-kit (oder Alternative)
- [ ] Hierarchie-Drag (Parent wechseln)
- [ ] Max-Tiefe-Constraint im Drag
- [ ] Inline-Positionsbearbeitung
- [ ] Positionstyp-Selector (Normal/Alternativ/Bedarf/Pauschal/Text)
- [ ] Kalkulations-Panel pro Position
- [ ] Zuschläge angezeigt mit Prozent und Betrag
- [ ] EP aus Kalkulation berechnet
- [ ] Artikelstamm-Suche mit Autocomplete
- [ ] Debounced Suche (min 2 Zeichen)
- [ ] Summenblock mit MwSt-Aufschlüsselung
- [ ] Summen live aktualisiert bei Änderungen
- [ ] Fertigstellen-Dialog mit Validierung
- [ ] Erneut-Bearbeiten-Dialog
- [ ] Stornieren-Dialog mit Grund
- [ ] Concurrent Edit Warning (409 Toast)
- [ ] Vorschau-Modus
- [ ] Nummernkreis-Einstellungen mit Live-Vorschau
- [ ] Read-Only bei finalisierten Dokumenten
- [ ] Responsive (Desktop, Tablet, Mobile Read-Only)
- [ ] Keyboard Shortcuts (Ctrl+S, Ctrl+Enter, etc.)
- [ ] i18n (DE + EN)
- [ ] Alle Component Tests bestehen
- [ ] Alle E2E Tests bestehen
- [ ] Alle Accessibility Tests bestehen

## Dependencies
- ZMI-TICKET-121 (Dokumenten-Editor Datenmodell — API)
- ZMI-TICKET-122 (Kalkulation — API)
- ZMI-TICKET-123 (Workflow — API)
- ZMI-TICKET-104 (Artikelstamm — für Artikelsuche)
- ZMI-TICKET-101 (Kontakte — für Kundenauswahl)
- ZMI-TICKET-110 (Projekte — für Projektzuordnung)
- ZMI-TICKET-120 (Nummernkreise — für Einstellungen)

## Notes
- Der Dokumenten-Editor ist die komplexeste Frontend-Komponente des gesamten Projekts. Sorgfältige Komponentenzerlegung ist essentiell.
- Drag & Drop mit Hierarchie ist anspruchsvoll. Empfehlung: `@dnd-kit/core` + `@dnd-kit/sortable` da es besser mit verschachtelten Listen umgeht als `react-beautiful-dnd`.
- Auto-Save vs. Manual Save: In V1 bewusst Manual Save (Ctrl+S), da Auto-Save bei Kalkulations-Eingaben zu vielen API-Calls führt. Debounced Auto-Save kann in V2 eingeführt werden.
- Die Kalkulation ist ein "Power-User-Feature" und wird in einem ausklappbaren Panel dargestellt, nicht inline in der Positionsliste.
- Für die Vorschau: Kein echtes PDF, sondern ein CSS-basiertes Print-Layout. Echte PDF-Vorschau kommt mit ZMI-TICKET-140.
- Zahlenformatierung: Immer `Intl.NumberFormat` verwenden, nie manuell formatieren.
