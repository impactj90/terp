# ZMI-TICKET-106: Artikelstamm/Leistungen — Frontend UI

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 1 — Stammdaten
Source: plancraft-anforderungen.md.pdf, Abschnitte 2.2, 10.2
Blocked by: ZMI-TICKET-104, ZMI-TICKET-105

## Goal
Vollständige Frontend-UI für den Artikelstamm: Artikelliste mit Volltextsuche, Kategorie-Navigation, Detail-/Bearbeitungsansicht, Zuschlagssatz-Konfiguration und DATANORM-Import-Wizard.

## Scope
- **In scope:** Artikelliste (Suche, Filter, Kategoriebaum), Artikel-Detail/Formular, Kategorie-Verwaltung, Zuschlagssatz-Admin, DATANORM-Import-Wizard, Artikel duplizieren.
- **Out of scope:** Verwendung in Dokumenten-Editor (ZMI-TICKET-124), Lagerverwaltung-Integration (ZMI-TICKET-205).

## Requirements

### Navigation
- Neuer Menüpunkt "Leistungen & Material" in der Sidebar (Bereich "Betrieb")
- Unter-Menü:
  - Artikelstamm (Hauptliste)
  - Zuschlagssätze (Admin-Bereich)
- Breadcrumbs: Home → Leistungen & Material → [Artikelname]
- i18n: Deutsch und Englisch

### Artikelliste (`/admin/articles`)
- **Layout:** Zweispaltig — links Kategoriebaum, rechts Artikeltabelle
- **Kategoriebaum (links):**
  - Auf-/zuklappbare Baumstruktur (3 Ebenen)
  - Klick auf Kategorie → filtert Tabelle
  - "Alle Artikel" als Root-Eintrag
  - Rechtsklick-Menü: Umbenennen, Löschen, Unterkategorie anlegen
  - Drag & Drop: Artikel in Kategorie verschieben (optional, Nice-to-have)
- **Artikeltabelle (rechts):**
  - Spalten: Artikelnummer, Kurzbezeichnung, Einheit, EK, VK (berechnet), Kostenart, Quelle
  - Suchfeld (Echtzeit): Volltextsuche über Kurztext, Langtext, Artikelnummer
  - Suche mit Tippfehler-Toleranz (Frontend-Debounce, Backend Fulltext)
  - Filter: Kostenart (Dropdown), Archiviert (Toggle)
  - Sortierung per Spaltenklick
  - Pagination
- **Aktionen:**
  - "Neuer Artikel" Button → Formular
  - "DATANORM Import" Button → Import-Wizard
  - Zeilen-Klick → Detail
  - Batch-Aktionen: Mehrere selektieren → Archivieren / Kategorie ändern

### Artikel-Detail (`/admin/articles/[id]`)
- **Kopfbereich:** Kurzbezeichnung, Artikelnummer, Kostenart-Badge, Archiviert-Badge
- **Sektionen:**
  - **Stammdaten:** Alle Felder, editierbar
  - **Preise & Kalkulation:**
    - EK (editierbar)
    - VK-Modus: Radio (Manuell / Zuschlagsbasiert)
    - Bei Manuell: VK-Feld direkt editierbar
    - Bei Zuschlagsbasiert: Zuschlag-Aufstellung anzeigen:
      ```
      EK:                          35.00 €
      + Material (15%):             5.25 €
      ────────────────────────────────────
      VK:                          40.25 €
      ```
    - Override-Option pro Zuschlag: "Abweichend für diesen Artikel" mit eigenem %-Feld
  - **Kategorie:** Dropdown oder Breadcrumb-Picker
  - **Verwendung:** (Platzhalter) Liste der Dokumente die diesen Artikel verwenden
- **Aktionen:** Speichern, Duplizieren, Archivieren (Dialog)

### Artikel-Formular (Erstellen)
- Felder:
  - Kurzbezeichnung (Pflicht, min 2 Zeichen)
  - Langtext (Textarea, optional)
  - Artikelnummer (optional, mit Eindeutigkeits-Check live)
  - Einheit (Dropdown mit Standard-Liste)
  - Kostenart (Radio: Lohn / Material / Geräte / Fremdleistungen / Sonstiges)
  - Einkaufspreis (Dezimalfeld, min 0)
  - Verkaufspreis-Modus (Radio: Manuell / Zuschlagsbasiert)
  - Verkaufspreis (Feld, nur bei Modus "Manuell")
  - Zeitwert pro Einheit (Dezimalfeld, optional, für Lohn-Positionen)
  - Kategorie (optionaler Baum-Picker)
- Inline-Validierung:
  - Artikelnummer: Live-Check auf Eindeutigkeit (Debounce API Call)
  - Kurzbezeichnung: Min 2 Zeichen
  - EK: Nicht negativ

### Zuschlagssatz-Verwaltung (`/admin/articles/surcharges`)
- Gruppiert nach Kostenart (Tabs oder Akkordeons)
- Pro Kostenart:
  - Liste der Zuschläge mit Name und Prozentsatz
  - Sortierung per Drag & Drop
  - Add/Edit/Delete Buttons
  - Gesamtzuschlag als Summe angezeigt
- Vorschau-Rechner:
  - Eingabefeld "Basis-EK" → zeigt berechneten VK live
  - Hilft beim Verstehen der Zuschlag-Auswirkung
- Hinweis: "Diese Zuschlagssätze gelten als Standard für alle neuen Artikel. Einzelne Artikel können abweichende Sätze haben."

### DATANORM-Import-Wizard
- **Step 1: Datei-Upload**
  - Drag & Drop Zone
  - Akzeptierte Formate: .dat, .001
  - Max 50 MB
  - Feld: Katalogname (Pflicht, z.B. "Brillux Preisliste 2026")
  - Nach Upload: Erkannte Version (V4/V5), Anzahl Artikel
- **Step 2: Strategie wählen**
  - Radio: "Nur neue Artikel importieren" / "Nur Preise aktualisieren" / "Alles aktualisieren"
  - Checkbox: "Nicht mehr enthaltene Artikel archivieren"
  - Vorschau: X neu, Y aktualisiert, Z archiviert
- **Step 3: Änderungs-Vorschau**
  - Tabelle mit allen Änderungen (scrollbar)
  - Spalten: Artikelnummer, Kurztext, Aktion (Neu/Update/Archiv), Alter Preis → Neuer Preis
  - Warnungen hervorgehoben (z.B. manuelle VK-Konflikte)
  - Such-/Filtermöglichkeit in der Tabelle
- **Step 4: Ergebnis**
  - Fortschrittsbalken
  - Zusammenfassung: X erstellt, Y aktualisiert, Z archiviert, W Warnungen
  - Download Importbericht (CSV)
  - Button "Zum Artikelstamm"

### Responsive Design
- Desktop: Zweispaltig (Baum + Tabelle)
- Tablet: Baum als Overlay/Drawer, Tabelle volle Breite

## Acceptance Criteria
1. Artikelliste zeigt Kategoriebaum und Artikeltabelle nebeneinander.
2. Volltextsuche filtert in Echtzeit (Debounce 300ms).
3. Kategorie-Klick filtert Tabelle (inkl. Unterkategorien).
4. Artikel kann erstellt, bearbeitet, dupliziert und archiviert werden.
5. Zuschlagsbasierter VK wird in der Detail-Ansicht als Aufstellung angezeigt.
6. Override pro Zuschlag pro Artikel ist konfigurierbar.
7. Zuschlagssatz-Admin zeigt alle Zuschläge gruppiert nach Kostenart.
8. DATANORM-Import-Wizard führt durch alle 4 Steps.
9. Eindeutigkeits-Check für Artikelnummer zeigt Live-Feedback.
10. Alle Texte in de.json und en.json.

## Tests

### Component Tests (React/Vitest)

#### Artikelliste
- `TestArticleList_Renders`: Liste rendert mit Mock-Daten.
- `TestArticleList_CategoryTree`: Kategoriebaum wird korrekt dargestellt (3 Ebenen).
- `TestArticleList_CategoryFilter`: Kategorie-Klick filtert Tabelle.
- `TestArticleList_CategoryAll`: "Alle Artikel" zeigt ungefilterte Liste.
- `TestArticleList_Search`: Suchfeld filtert Tabelle.
- `TestArticleList_SearchDebounce`: API wird nicht bei jedem Tastendruck aufgerufen.
- `TestArticleList_CostTypeFilter`: Kostenart-Filter funktioniert.
- `TestArticleList_Sorting`: Spaltenklick sortiert.
- `TestArticleList_Pagination`: Seitenwechsel funktioniert.
- `TestArticleList_EmptyState`: Keine Artikel → "Keine Artikel gefunden" mit CTA.
- `TestArticleList_ArchivedToggle`: Toggle zeigt/versteckt archivierte Artikel.
- `TestArticleList_CalculatedPrice`: VK-Spalte zeigt berechneten Preis.

#### Artikel-Formular
- `TestArticleForm_RequiredFields`: Submit ohne Kurzbezeichnung → Fehler.
- `TestArticleForm_MinLength`: Kurzbezeichnung 1 Zeichen → Fehler.
- `TestArticleForm_NegativePrice`: EK negativ → Fehler.
- `TestArticleForm_ArticleNumberUnique`: Existierende Nummer → Live-Warnung.
- `TestArticleForm_ArticleNumberFree`: Neue Nummer → grüner Haken.
- `TestArticleForm_SalesPriceModeManual`: Modus "Manuell" → VK-Feld sichtbar.
- `TestArticleForm_SalesPriceModeSurcharge`: Modus "Zuschlag" → VK-Feld ausgeblendet.
- `TestArticleForm_SubmitSuccess`: Valides Formular → API Call, Weiterleitung.
- `TestArticleForm_CategoryPicker`: Kategorie auswählbar über Baum-Dropdown.
- `TestArticleForm_UnitDropdown`: Einheiten-Dropdown zeigt alle Optionen.

#### Artikel-Detail
- `TestArticleDetail_Renders`: Detail zeigt alle Felder.
- `TestArticleDetail_SurchargeBreakdown`: Zuschlagsbasiert → Aufstellung sichtbar.
- `TestArticleDetail_ManualPrice`: Manuell → VK direkt angezeigt.
- `TestArticleDetail_OverrideForm`: Zuschlag-Override → eigenes %-Feld.
- `TestArticleDetail_Duplicate`: Duplizieren → neuer Artikel mit "(Kopie)".
- `TestArticleDetail_Archive`: Archivieren mit Bestätigungs-Dialog.

#### Zuschlagssatz-Admin
- `TestSurchargeAdmin_Renders`: Zuschläge gruppiert nach Kostenart.
- `TestSurchargeAdmin_AddSurcharge`: Neuen Zuschlag hinzufügen.
- `TestSurchargeAdmin_EditSurcharge`: Prozentsatz ändern.
- `TestSurchargeAdmin_DeleteSurcharge`: Zuschlag entfernen mit Bestätigung.
- `TestSurchargeAdmin_TotalPercent`: Gesamtzuschlag wird angezeigt.
- `TestSurchargeAdmin_PreviewCalculator`: EK eingeben → VK berechnet.
- `TestSurchargeAdmin_NegativeSurcharge`: Negativer Wert (Rabatt) erlaubt.

#### DATANORM-Import-Wizard
- `TestDATANORMWizard_Step1_Upload`: Datei hochladen, Version angezeigt.
- `TestDATANORMWizard_Step1_InvalidFile`: Falsche Datei → Fehler.
- `TestDATANORMWizard_Step1_CatalogName`: Katalogname Pflichtfeld.
- `TestDATANORMWizard_Step2_StrategySelection`: Strategie-Radio funktioniert.
- `TestDATANORMWizard_Step2_Summary`: Vorschau-Zahlen angezeigt.
- `TestDATANORMWizard_Step3_ChangeTable`: Änderungen tabellarisch.
- `TestDATANORMWizard_Step3_Warnings`: Warnungen hervorgehoben.
- `TestDATANORMWizard_Step3_Search`: Suche in Änderungstabelle.
- `TestDATANORMWizard_Step4_Progress`: Fortschrittsbalken.
- `TestDATANORMWizard_Step4_Result`: Zusammenfassung korrekt.
- `TestDATANORMWizard_Step4_Report`: Download-Button.
- `TestDATANORMWizard_BackNavigation`: Zurück-Navigation.

#### Kategorie-Management
- `TestCategoryManagement_Create`: Neue Kategorie über Dialog.
- `TestCategoryManagement_CreateNested`: Unterkategorie anlegen.
- `TestCategoryManagement_Rename`: Kategorie umbenennen.
- `TestCategoryManagement_Delete_Empty`: Leere Kategorie löschen.
- `TestCategoryManagement_Delete_NonEmpty`: Nicht-leer → Fehlermeldung.

### E2E Tests (Playwright)
- `TestE2E_ArticleCreate`: Neuen Artikel über UI erstellen → in Liste sichtbar.
- `TestE2E_ArticleEdit`: Artikel öffnen, EK ändern, speichern → VK neu berechnet.
- `TestE2E_ArticleSearch`: Artikel anlegen, suchen → gefunden.
- `TestE2E_ArticleCategoryFilter`: Kategorie erstellen, Artikel zuordnen, filtern → nur zugeordnete sichtbar.
- `TestE2E_ArticleDuplicate`: Artikel duplizieren → Kopie mit "(Kopie)" im Namen.
- `TestE2E_ArticleArchive`: Archivieren → verschwindet aus Standard-Liste.
- `TestE2E_SurchargeConfig`: Zuschlag anlegen → Artikel im Surcharge-Modus zeigt neuen VK.
- `TestE2E_SurchargeOverride`: Override setzen → Artikel-VK weicht ab.
- `TestE2E_DATANORMImport`: DATANORM-Datei hochladen → Wizard → Artikel in Liste.
- `TestE2E_ArticleNumberUnique`: Existierende Nummer eingeben → Live-Warnung.
- `TestE2E_Navigation`: Sidebar → Leistungen → Detail → Breadcrumbs zurück.

### Accessibility Tests
- `TestA11y_ArticleList`: Tabelle mit ARIA-Labels, Tastatur-navigierbar.
- `TestA11y_CategoryTree`: Baum mit ARIA tree roles, auf/zuklappbar per Tastatur.
- `TestA11y_ArticleForm`: Labels, Fehlermeldungen per Screen Reader.
- `TestA11y_ImportWizard`: Steps per Tastatur navigierbar.

### Test Case Pack
1) **Neuen Material-Artikel erstellen**
   - Input: Kurztext "Wandfarbe weiß 10l", Einheit "Eimer", Kostenart "Material", EK 35.00, Modus "Zuschlag"
   - Expected: In Liste sichtbar, VK berechnet aus Zuschlägen

2) **Lohn-Position erstellen**
   - Input: Kurztext "Wand streichen", Einheit "m²", Kostenart "Lohn", EK 0, Zeitwert 0.15
   - Expected: Artikel angelegt, Zeitwert gespeichert

3) **Zuschlag-Aufstellung prüfen**
   - Setup: Material-Zuschläge: AGK 15%, Gewinn 10%. Artikel EK=100
   - Input: Artikel-Detail öffnen
   - Expected: Aufstellung zeigt EK 100 + AGK 15 + Gewinn 10 = VK 125

4) **Override setzen**
   - Setup: Artikel mit EK=100, Material-AGK=15%
   - Input: Override AGK=20% im Detail setzen
   - Expected: VK ändert sich von 125 auf 130

5) **DATANORM Import Workflow**
   - Input: DATANORM V4 Datei, Katalogname "Brillux 2026", Strategie "Alles aktualisieren"
   - Expected: Wizard zeigt Version V4, Preview mit Artikeln, nach Import alle in Liste

6) **Kategorie-Navigation**
   - Setup: Baum "Malerarbeiten" → "Innen" → "Wände", 3 Artikel in "Wände"
   - Input: Klick auf "Innen"
   - Expected: Alle Artikel in "Innen" und darunter angezeigt (inkl. "Wände")

7) **Suche**
   - Setup: Artikel "Wandfarbe weiß", "Wandspachtel", "Deckfarbe"
   - Input: Suchfeld "Wand"
   - Expected: 2 Treffer

8) **Duplizieren**
   - Input: Artikel "Wandfarbe weiß" → Duplizieren
   - Expected: Neuer Artikel "Wandfarbe weiß (Kopie)", alle Felder übernommen

9) **Batch-Archivieren**
   - Input: 3 Artikel selektieren → "Archivieren"
   - Expected: Bestätigungs-Dialog "3 Artikel archivieren?", nach Bestätigung verschwunden

10) **Zuschlag-Admin: Vorschau-Rechner**
    - Setup: Material-Zuschläge: +15%, +10%
    - Input: Basis-EK "100" eingeben
    - Expected: Live-Anzeige VK = 125.00

## Verification Checklist
- [ ] Menüpunkt "Leistungen & Material" in Sidebar
- [ ] Breadcrumbs funktionieren
- [ ] i18n-Strings in de.json und en.json
- [ ] Zweispaltiges Layout: Kategoriebaum + Tabelle
- [ ] Kategoriebaum auf-/zuklappbar (3 Ebenen)
- [ ] Kategorie-Klick filtert Tabelle (inkl. Unterkategorien)
- [ ] Volltextsuche mit Debounce funktioniert
- [ ] Kostenart-Filter funktioniert
- [ ] Archiviert-Toggle funktioniert
- [ ] Sortierung per Spaltenklick
- [ ] Pagination korrekt
- [ ] VK-Spalte zeigt berechneten Preis
- [ ] Artikel-Formular: Validierung (Pflichtfelder, min Länge, EK >= 0)
- [ ] Artikelnummer: Live-Eindeutigkeits-Check
- [ ] VK-Modus-Umschaltung (Manuell ↔ Zuschlag)
- [ ] Zuschlag-Aufstellung im Detail sichtbar
- [ ] Override pro Zuschlag funktioniert
- [ ] Duplizieren-Funktion
- [ ] Archivieren mit Bestätigungs-Dialog
- [ ] Kategorie-Verwaltung: Anlegen, Umbenennen, Löschen
- [ ] Zuschlagssatz-Admin: CRUD + Vorschau-Rechner
- [ ] DATANORM-Import: alle 4 Steps durchklickbar
- [ ] DATANORM-Import: Strategie-Auswahl
- [ ] DATANORM-Import: Änderungs-Vorschau
- [ ] DATANORM-Import: Ergebnis + Bericht-Download
- [ ] Responsive: Tablet-Ansicht funktioniert
- [ ] Keine Console-Errors
- [ ] Alle Component Tests bestehen
- [ ] Alle E2E Tests bestehen
- [ ] Accessibility: Tastatur-Navigation
- [ ] `next build` kompiliert ohne Fehler

## Dependencies
- ZMI-TICKET-104 (Artikelstamm API)
- ZMI-TICKET-105 (DATANORM-Import API)
- Bestehendes Terp Design System (Shadcn/Radix)
- Bestehende API-Hook-Patterns (`hooks/api/`)

## Notes
- Der Kategoriebaum ist ein zentrales UI-Element das auch im Dokumenten-Editor (ZMI-TICKET-124) wiederverwendet wird — als "Artikelsuche mit Kategorie-Browse" beim Hinzufügen von Positionen.
- Die Volltextsuche wird auch im Dokumenten-Editor als Schnellsuche benötigt — das Such-Component sollte wiederverwendbar gebaut werden.
- Batch-Aktionen (Mehrfachselektion) sind ein Nice-to-have für V1, können in einem Follow-up ergänzt werden.
