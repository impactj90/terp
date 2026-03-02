# ZMI-TICKET-113: Projektmappe — Frontend UI

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 2 — Projektverwaltung
Source: plancraft-anforderungen.md.pdf, Abschnitte 4.1–4.3
Blocked by: ZMI-TICKET-110, ZMI-TICKET-111, ZMI-TICKET-112

## Goal
Frontend-UI für die Projektverwaltung: Projektliste mit Filtern, Projekt-Detailansicht mit Tabs (Übersicht/Dashboard, Dateien, Mitglieder, Zeiteinträge), Erstellen/Bearbeiten-Formular und Dateiablage-Browser.

## Scope
- **In scope:** Projektliste, Projekt-Detail (Tabs: Übersicht, Dateien, Mitglieder, Zeiteinträge), Dashboard-Widgets, Datei-Browser mit Upload, Tag-Verwaltung, Mitglieder-Zuordnung.
- **Out of scope:** Dokumente-Tab (ZMI-TICKET-124+), Chat-Tab (ZMI-TICKET-170), Berichte-Tab (ZMI-TICKET-151+), Mobile App (ZMI-TICKET-193).

## Requirements

### Navigation
- Menüpunkt "Projekte" in Sidebar (Bereich "Betrieb", unter "Kontakte")
- Breadcrumbs: Home → Projekte → [Projektname] → [Tab]
- i18n: Deutsch und Englisch

### Projektliste (`/admin/projects`)
- **Ansichtsmodi:** Tabelle (Default) und Karten-Ansicht (Toggle)
- **Tabelle:**
  - Spalten: Projektnummer, Name, Kunde, Status (Badge), Ort, Beginn, Tags
  - Farbiger Punkt links basierend auf project.color
  - Status-Badge: farbcodiert (offer=blau, in_progress=grün, completed=grau, archived=grau gestrichelt, cancelled=rot)
- **Karten-Ansicht:**
  - Karten mit Projektname, Kunde, Status-Badge, Fortschrittsbalken, Tags
  - Farbiger Rand basierend auf project.color
- **Filter:**
  - Status: Multi-Select (Alle, Angebot, In Arbeit, Abgeschlossen, Archiviert, Storniert)
  - Kunde: Dropdown (Kontakte-Suche)
  - Tags: Multi-Select
  - Mitarbeiter: Dropdown (Mitarbeiter-Suche)
  - Zeitraum: Datum von-bis (start_date)
- **Suchfeld:** Volltextsuche über Name, Nummer, Beschreibung
- **Sortierung:** Per Spaltenklick
- **Pagination**
- **Aktionen:** "Neues Projekt" Button, Zeilen-/Karten-Klick → Detail

### Projekt-Detail (`/admin/projects/[id]`)

#### Header
- Projektname (editierbar inline), Projektnummer
- Status-Badge mit Dropdown für Status-Wechsel (nur erlaubte Übergänge)
- Farb-Picker für project.color
- Kunde (verlinkt zur Kontakt-Detailseite)
- Baustellenadresse (mit Maps-Link)
- Tags (inline editierbar, Chips mit +)
- Aktionen: Duplizieren, Archivieren

#### Tab: Übersicht
- **Dashboard-Widgets** (aus ZMI-TICKET-112):
  - Fortschrittsbalken mit Prozent
  - Kosten-Karten: Plan vs. Ist pro Kostenart (mit Traffic-Light Farbe)
  - Zeitauswertung: Geplant vs. Erfasst (Balkendiagramm)
  - Warnungen-Banner (gelb/rot)
- **Projekt-Info:**
  - Beschreibung (editierbares Textfeld)
  - Notizen (editierbares Textfeld)
  - Zeitraum (start_date, end_date mit Datepicker)
  - Planwerte (planned_hours, planned_costs — editierbare Felder)
- **Aktivitätsfeed** (Platzhalter):
  - Letzte Änderungen am Projekt (Status-Wechsel, neue Dateien, etc.)

#### Tab: Dateien
- **Datei-Browser** (aus ZMI-TICKET-111):
  - Ordner-Navigation mit Breadcrumbs
  - Grid-Ansicht (Thumbnails) und Listen-Ansicht (Toggle)
  - Ordner: Klick öffnet, Rechtsklick für Rename/Delete
  - Dateien: Thumbnail/Icon, Name, Größe, Hochgeladen von/am
  - Klick auf Datei: Vorschau (Bilder inline, PDFs im Viewer, Rest: Download)
- **Upload:**
  - Drag & Drop Zone (ganzer Bereich)
  - File-Picker Button
  - Upload-Fortschritt pro Datei
  - Mehrdatei-Upload
- **Aktionen:**
  - "Neuer Ordner" Button
  - Datei umbenennen (Rechtsklick/Kontextmenü)
  - Datei verschieben (Drag & Drop in Ordner)
  - Datei löschen (Papierkorb-Icon, Bestätigung)
  - Papierkorb-Ansicht (Toggle)
  - Wiederherstellen aus Papierkorb
- **Speicherverbrauch:** Fortschrittsbalken (X von Y GB verwendet)

#### Tab: Mitglieder
- Liste der Projekt-Mitglieder mit:
  - Mitarbeiter-Name, Rolle (Bauleiter/Mitarbeiter Badge)
  - Gebuchte Stunden auf diesem Projekt
  - Zugeordnet seit
- "Mitarbeiter hinzufügen" Button → Dropdown mit Mitarbeiter-Suche
- Rolle ändern: Klick auf Badge → Toggle worker/leader
- Entfernen: X-Button mit Bestätigung
- Schnellansicht: Klick auf Mitarbeiter → Profil-Link

#### Tab: Zeiteinträge
- Übersicht der gebuchten Zeiten auf diesem Projekt:
  - Tabelle: Datum, Mitarbeiter, Stunden, Tätigkeit, Notiz
  - Filter: Mitarbeiter, Zeitraum
  - Summenzeile: Gesamtstunden
- Diagramm: Stunden pro Woche (Balkendiagramm)
- Link zur bestehenden Zeiterfassungs-Detail-Ansicht

#### Platzhalter-Tabs
- **Dokumente:** "Demnächst verfügbar" mit Icon (aktiviert ab ZMI-TICKET-124)
- **Chat:** "Demnächst verfügbar" (aktiviert ab ZMI-TICKET-170)
- **Berichte:** "Demnächst verfügbar" (aktiviert ab ZMI-TICKET-151)
- **Eingangsrechnungen:** "Demnächst verfügbar" (aktiviert ab ZMI-TICKET-161)
- **Materialien:** "Demnächst verfügbar" (aktiviert ab ZMI-TICKET-156)

### Projekt-Formular (Erstellen/Bearbeiten)
- Felder:
  - Projektname (Pflicht)
  - Projektnummer (optional, Eindeutigkeits-Check live)
  - Kunde (Kontakt-Suche mit Autocomplete)
  - Baustellenadresse (Straße, PLZ, Ort, Land)
  - Button "Adresse vom Kunden übernehmen" (befüllt aus Kontakt-Adresse)
  - Geplanter Beginn / Ende (Datepicker)
  - Beschreibung (Textarea)
  - Notizen (Textarea)
  - Farbe (Color-Picker)
  - Tags (Multi-Select mit Chip-Input, neue Tags inline erstellen)
- Validierung: Client-side + Server-side

### Tag-Verwaltung
- Inline im Projekt-Detail: Chips mit +/x
- Global in Settings: `/admin/settings/project-tags` (Liste aller Tags, Farbe ändern, löschen)

## Acceptance Criteria
1. Projektliste zeigt alle Projekte mit Tabellen- und Karten-Ansicht.
2. Filter (Status, Kunde, Tags, Mitarbeiter, Zeitraum) funktionieren.
3. Volltextsuche filtert korrekt.
4. Projekt-Detail zeigt alle Tabs korrekt.
5. Dashboard-Widgets zeigen Plan vs. Ist mit Traffic-Light.
6. Datei-Browser: Upload, Download, Ordner-Navigation, Vorschau.
7. Mitglieder können zugeordnet, Rollen geändert und entfernt werden.
8. Zeiteinträge-Tab zeigt gebuchte Stunden.
9. Status-Wechsel über Dropdown (nur erlaubte Übergänge).
10. Projekt-Formular mit Kunde-Autocomplete und Adress-Übernahme.
11. Tags inline editierbar.
12. Alle Texte in de.json und en.json.

## Tests

### Component Tests (React/Vitest)

#### Projektliste
- `TestProjectList_TableView`: Tabelle rendert mit Spalten und Daten.
- `TestProjectList_CardView`: Karten-Ansicht rendert.
- `TestProjectList_ViewToggle`: Umschalten zwischen Tabelle und Karten.
- `TestProjectList_StatusFilter`: Status-Filter filtert korrekt.
- `TestProjectList_MultiStatusFilter`: Mehrere Status selektierbar.
- `TestProjectList_TagFilter`: Tag-Filter funktioniert.
- `TestProjectList_CustomerFilter`: Kunde-Filter mit Autocomplete.
- `TestProjectList_Search`: Suchfeld filtert.
- `TestProjectList_Pagination`: Seitenwechsel.
- `TestProjectList_StatusBadge`: Korrekte Farben pro Status.
- `TestProjectList_EmptyState`: Keine Projekte → CTA.
- `TestProjectList_ColorDot`: Farbiger Punkt links in Zeile.

#### Projekt-Formular
- `TestProjectForm_RequiredName`: Submit ohne Name → Fehler.
- `TestProjectForm_CustomerAutocomplete`: Tippen zeigt Vorschläge.
- `TestProjectForm_CopyCustomerAddress`: Button befüllt Adressfelder.
- `TestProjectForm_ProjectNumberUnique`: Live-Check Eindeutigkeit.
- `TestProjectForm_TagChips`: Tags hinzufügen und entfernen.
- `TestProjectForm_CreateTagInline`: Neuen Tag direkt im Formular erstellen.
- `TestProjectForm_ColorPicker`: Farbe auswählbar.
- `TestProjectForm_DateValidation`: Ende vor Beginn → Fehler.
- `TestProjectForm_SubmitSuccess`: Valide Daten → API Call, Weiterleitung.

#### Projekt-Detail Header
- `TestProjectDetail_StatusDropdown`: Dropdown zeigt nur erlaubte Übergänge.
- `TestProjectDetail_StatusChange`: Klick auf Status → API Call → Badge aktualisiert.
- `TestProjectDetail_InlineEdit_Name`: Klick auf Name → Editierbar → Enter speichert.
- `TestProjectDetail_TagChips`: Tags angezeigt, +/x funktioniert.
- `TestProjectDetail_CustomerLink`: Klick auf Kunde → Navigation zu Kontakt.
- `TestProjectDetail_MapsLink`: Klick auf Adresse → Maps öffnet.

#### Tab: Übersicht / Dashboard
- `TestDashboardTab_ProgressBar`: Fortschrittsbalken mit korrektem Prozent.
- `TestDashboardTab_CostCards`: Kosten-Karten mit Plan/Ist.
- `TestDashboardTab_TrafficLight`: Korrekte Farbe basierend auf Status.
- `TestDashboardTab_Warnings`: Warnungen-Banner angezeigt.
- `TestDashboardTab_EditPlanValues`: Planwerte editierbar.
- `TestDashboardTab_GrayCards`: Nicht verfügbare Daten → grau mit "Noch keine Daten".

#### Tab: Dateien
- `TestFileBrowser_RendersFolders`: Ordner angezeigt.
- `TestFileBrowser_RendersFiles`: Dateien mit Thumbnails/Icons.
- `TestFileBrowser_NavigateFolder`: Klick auf Ordner → Inhalt geladen.
- `TestFileBrowser_Breadcrumbs`: Breadcrumbs korrekt.
- `TestFileBrowser_GridListToggle`: Grid ↔ Liste.
- `TestFileBrowser_Upload_DragDrop`: Drag & Drop löst Upload aus.
- `TestFileBrowser_Upload_Progress`: Fortschrittsanzeige.
- `TestFileBrowser_Upload_MultiFile`: Mehrere Dateien gleichzeitig.
- `TestFileBrowser_Preview_Image`: Bild-Vorschau inline.
- `TestFileBrowser_Preview_PDF`: PDF im Viewer.
- `TestFileBrowser_Download`: Download-Button löst Download aus.
- `TestFileBrowser_CreateFolder`: Neuer Ordner Dialog.
- `TestFileBrowser_DeleteFile`: Löschen mit Bestätigung.
- `TestFileBrowser_Trash`: Papierkorb-Ansicht.
- `TestFileBrowser_Restore`: Wiederherstellen aus Papierkorb.
- `TestFileBrowser_StorageUsage`: Fortschrittsbalken.

#### Tab: Mitglieder
- `TestMembersTab_List`: Mitglieder mit Rollen-Badges.
- `TestMembersTab_Add`: Hinzufügen über Dropdown.
- `TestMembersTab_ChangeRole`: Rolle Toggle worker/leader.
- `TestMembersTab_Remove`: Entfernen mit Bestätigung.
- `TestMembersTab_Hours`: Gebuchte Stunden pro Mitarbeiter.

#### Tab: Zeiteinträge
- `TestTimeEntriesTab_Table`: Zeiteinträge-Tabelle.
- `TestTimeEntriesTab_Filter`: Filter nach Mitarbeiter/Zeitraum.
- `TestTimeEntriesTab_SumRow`: Summenzeile korrekt.
- `TestTimeEntriesTab_Chart`: Wochen-Balkendiagramm.

### E2E Tests (Playwright)
- `TestE2E_ProjectCreate`: Projekt über UI erstellen → in Liste sichtbar.
- `TestE2E_ProjectEdit`: Projekt öffnen, Name ändern, Speichern.
- `TestE2E_ProjectStatusChange`: Status Angebot → In Arbeit über Dropdown.
- `TestE2E_ProjectCustomerLink`: Kunde zuordnen → in Detail sichtbar.
- `TestE2E_ProjectTagManagement`: Tag erstellen, zuordnen, entfernen.
- `TestE2E_ProjectAddMember`: Mitarbeiter zum Projekt hinzufügen.
- `TestE2E_ProjectFileUpload`: Datei hochladen → in Dateien-Tab sichtbar.
- `TestE2E_ProjectFileDelete_Restore`: Datei löschen → Papierkorb → Wiederherstellen.
- `TestE2E_ProjectFolderCreate`: Ordner erstellen → Datei hochladen → Navigation.
- `TestE2E_ProjectDashboard`: Planwerte setzen → Dashboard zeigt Fortschritt.
- `TestE2E_ProjectListFilter`: Projekte filtern nach Status und Tags.
- `TestE2E_ProjectListViewToggle`: Zwischen Tabelle und Karten wechseln.
- `TestE2E_ProjectDuplicate`: Projekt duplizieren → Kopie in Liste.
- `TestE2E_ProjectArchive`: Projekt archivieren → aus Standard-Liste verschwunden.

### Accessibility Tests
- `TestA11y_ProjectList`: Tabelle navigierbar, Filter per Tastatur.
- `TestA11y_ProjectDetail_Tabs`: Tabs per Tastatur wechselbar.
- `TestA11y_FileBrowser`: Dateien per Tastatur auswählbar.
- `TestA11y_ProjectForm`: Labels, Pflichtfeld-Markierung, Fehler per Screen Reader.

### Test Case Pack
1) **Neues Projekt über UI**
   - Input: Name "Neubau Schmidt", Kunde "Schmidt GmbH" (Autocomplete), Adresse aus Kunde übernehmen, Tag "Neubau", Farbe blau
   - Expected: Projekt in Liste mit blauem Punkt, Status "Angebot"

2) **Status ändern**
   - Input: Projekt "Angebot" → Dropdown → "In Arbeit"
   - Expected: Badge ändert sich, Dropdown zeigt nur "Abgeschlossen" und "Storniert"

3) **Dashboard: Plan vs. Ist**
   - Setup: planned_hours=100, 3 Mitarbeiter mit je 20h gebucht
   - Expected: Fortschritt 60%, Zeitkarte grün

4) **Datei hochladen (Drag & Drop)**
   - Input: 3 Fotos per Drag & Drop in Dateien-Tab
   - Expected: Upload-Fortschritt, danach Thumbnails sichtbar

5) **Ordner-Navigation**
   - Setup: Ordner "Pläne" mit 2 PDFs
   - Input: Klick auf "Pläne" → Klick auf PDF
   - Expected: Breadcrumbs "Dateien > Pläne", PDF-Vorschau

6) **Mitarbeiter zuordnen**
   - Input: Tab "Mitglieder" → "Hinzufügen" → "Karl Weber" suchen → hinzufügen als "Mitarbeiter"
   - Expected: Karl Weber in Liste mit Badge "Mitarbeiter"

7) **Karten-Ansicht der Projektliste**
   - Setup: 6 Projekte mit verschiedenen Status und Farben
   - Expected: 6 Karten mit farbigem Rand, Status-Badge, Fortschrittsbalken

8) **Filter Kombination**
   - Setup: 10 Projekte, 3 mit Status "In Arbeit" und Tag "Sanierung"
   - Input: Status="In Arbeit" + Tag="Sanierung"
   - Expected: 3 Projekte

## Verification Checklist
- [ ] Menüpunkt "Projekte" in Sidebar
- [ ] Breadcrumbs funktionieren
- [ ] i18n-Strings in de.json und en.json
- [ ] Projektliste: Tabellen-Ansicht
- [ ] Projektliste: Karten-Ansicht
- [ ] Projektliste: Ansicht-Toggle
- [ ] Projektliste: Alle Filter (Status, Kunde, Tags, Mitarbeiter, Zeitraum)
- [ ] Projektliste: Suche
- [ ] Projektliste: Sortierung
- [ ] Projektliste: Pagination
- [ ] Projektliste: Status-Badges farbcodiert
- [ ] Projektliste: Farbpunkt pro Projekt
- [ ] Projekt-Formular: Kunde-Autocomplete
- [ ] Projekt-Formular: "Adresse übernehmen" Button
- [ ] Projekt-Formular: Projektnummer Live-Check
- [ ] Projekt-Formular: Tag-Chips inline
- [ ] Projekt-Formular: Color-Picker
- [ ] Projekt-Detail: Status-Dropdown mit erlaubten Übergängen
- [ ] Projekt-Detail: Inline-Edit Name
- [ ] Projekt-Detail: Maps-Link für Adresse
- [ ] Tab Übersicht: Dashboard-Widgets mit Traffic-Light
- [ ] Tab Übersicht: Planwerte editierbar
- [ ] Tab Übersicht: Warnungen-Banner
- [ ] Tab Dateien: Ordner-Navigation mit Breadcrumbs
- [ ] Tab Dateien: Grid und Listen-Ansicht
- [ ] Tab Dateien: Drag & Drop Upload
- [ ] Tab Dateien: Mehrdatei-Upload mit Fortschritt
- [ ] Tab Dateien: Bild-Vorschau inline
- [ ] Tab Dateien: PDF-Viewer
- [ ] Tab Dateien: Papierkorb + Wiederherstellen
- [ ] Tab Dateien: Speicherverbrauch-Anzeige
- [ ] Tab Mitglieder: Hinzufügen/Entfernen/Rolle ändern
- [ ] Tab Zeiteinträge: Tabelle + Filter + Summe
- [ ] Tab Zeiteinträge: Wochen-Diagramm
- [ ] Platzhalter-Tabs für Dokumente, Chat, Berichte
- [ ] Keine Console-Errors
- [ ] Alle Component Tests bestehen
- [ ] Alle E2E Tests bestehen
- [ ] Accessibility: Tabs per Tastatur
- [ ] `next build` kompiliert ohne Fehler

## Dependencies
- ZMI-TICKET-110 (Projekt API)
- ZMI-TICKET-111 (Dateiablage API)
- ZMI-TICKET-112 (Dashboard API)
- ZMI-TICKET-103 (Kontakte UI — für Kunden-Autocomplete-Komponente)
- Bestehendes Design System (Shadcn/Radix)
- Chart-Library (z.B. Recharts) für Diagramme

## Notes
- Der Kunden-Autocomplete aus dem Kontakte-Formular (ZMI-TICKET-103) sollte als wiederverwendbares Component gebaut werden.
- Die Platzhalter-Tabs werden mit Feature-Flags aktiviert sobald die jeweiligen Module fertig sind.
- Datei-Vorschau für PDFs: Bestehende Browser-PDF-Viewer nutzen (iframe/embed), kein eigener Viewer nötig.
- Chart-Library: Recharts oder Chart.js — leichtgewichtig, React-kompatibel.
- Die Datei-Upload-Komponente (Drag & Drop, Multi-File, Fortschritt) wird auch im Chat (ZMI-TICKET-170) wiederverwendet.
