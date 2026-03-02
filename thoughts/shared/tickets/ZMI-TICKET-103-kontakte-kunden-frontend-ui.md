# ZMI-TICKET-103: Kontakte/Kunden — Frontend UI

Status: Proposed
Priority: P1
Owner: TBD
Epic: Phase 1 — Stammdaten
Source: plancraft-anforderungen.md.pdf, Abschnitt 2.1
Blocked by: ZMI-TICKET-101, ZMI-TICKET-102

## Goal
Vollständige Frontend-UI für die Kundenverwaltung im bestehenden Next.js-Frontend: Kontaktliste, Detailansicht, Erstellen/Bearbeiten-Formulare, Suchfunktion und CSV-Import-Wizard.

## Scope
- **In scope:** Kontaktliste (mit Suche, Filter, Pagination), Kontakt-Detail, Erstellen/Bearbeiten-Formulare, Adress- und Kommunikationsverwaltung, CSV-Import-Wizard UI, Archivieren-Dialog.
- **Out of scope:** Verknüpfung mit Projekten (ZMI-TICKET-113), Zahlungsbedingungen-Konfiguration (ZMI-TICKET-163).

## Requirements

### Navigation
- Neuer Menüpunkt "Kontakte" in der Sidebar (unter neuem Bereich "Betrieb" oder "CRM")
- Breadcrumbs: Home → Kontakte → [Kontaktname]
- i18n: Deutsch und Englisch (de.json / en.json)

### Kontaktliste (`/admin/contacts`)
- Tabellenansicht mit Spalten: Name, Firma, Typ (Privat/Geschäft), Ort, Telefon, E-Mail
- Suchfeld (Echtzeit-Suche über Name, Firma, E-Mail)
- Filter: Kontakttyp (Alle/Privat/Geschäft), Archiviert (Ja/Nein)
- Sortierung: Klick auf Spaltenköpfe
- Pagination (konfigurierbare Seitengröße: 10/25/50)
- Button "Neuer Kontakt" → Erstellen-Formular
- Button "CSV Import" → Import-Wizard
- Zeilen-Klick → Detailansicht
- Archivierte Kontakte: Visuell abgesetzt (grau/durchgestrichen)

### Kontakt-Detail (`/admin/contacts/[id]`)
- Kopfbereich: Name, Firma, Typ-Badge, Erstellt/Aktualisiert Info
- Tabs oder Sektionen:
  - **Stammdaten:** Alle Kontaktfelder (editierbar)
  - **Adressen:** Liste aller Adressen mit Add/Edit/Delete, Default-Markierung
  - **Kommunikation:** Liste aller Telefon/E-Mail mit Add/Edit/Delete, Primary-Markierung
  - **Projekte:** (Platzhalter-Tab, erst aktiv ab ZMI-TICKET-113)
  - **Dokumente:** (Platzhalter-Tab, erst aktiv ab ZMI-TICKET-130+)
- Aktionen: Bearbeiten, Archivieren (mit Bestätigungs-Dialog), Wiederherstellen

### Kontakt-Formular (Erstellen & Bearbeiten)
- Formular-Felder:
  - Kontakttyp: Radio (Privatkunde / Geschäftskunde) — steuert Pflichtfelder
  - Anrede: Select (Herr/Frau/Firma/Divers)
  - Vorname, Nachname (Pflicht)
  - Firmenname (Pflicht bei Geschäftskunde)
  - Steuernummer, USt-IdNr (bei Geschäftskunde empfohlen)
  - Notizen: Textarea
- Inline-Adresse beim Erstellen: Rechnungsadresse direkt im Formular
- Inline-Kommunikation beim Erstellen: Mindestens Telefon oder E-Mail
- Validierung: Client-side + Server-side, Fehler inline anzeigen
- Bei Geschäftskunde ohne USt-IdNr: Hinweis-Banner (kein Blocker)

### Adress-Verwaltung (im Detail)
- Liste aller Adressen mit Typ-Badge (Rechnung / Baustelle / Sonstiges)
- Default-Adresse visuell hervorgehoben
- Add-Dialog: Typ, Straße, PLZ, Ort, Land (Default DE), is_default Checkbox
- Edit-Dialog: Gleiche Felder, vorausgefüllt
- Delete: Bestätigungs-Dialog "Adresse wirklich löschen?"
- Umschalten der Default-Adresse: Klick auf Stern-Icon

### Kommunikations-Verwaltung (im Detail)
- Liste aller Telefon/E-Mail/Fax mit Typ-Badge
- Primary-Eintrag visuell hervorgehoben (pro Typ)
- Klickbare Telefonnummern (tel: Link) und E-Mails (mailto: Link)
- Add/Edit/Delete analog zu Adressen

### CSV-Import-Wizard
- Step 1: Datei-Upload (Drag & Drop Zone + File-Picker, max 10 MB)
  - Akzeptierte Formate anzeigen (.csv, .xlsx)
  - Upload-Fortschritt
- Step 2: Spalten-Mapping
  - Linke Spalte: Erkannte CSV-Spalten mit Vorschau-Wert
  - Rechte Spalte: Dropdown für Zielfeld (oder "Ignorieren")
  - Auto-Mapping: System schlägt Zuordnung vor (z.B. "Name" → last_name)
  - Vorschau-Tabelle mit ersten 5 Zeilen nach Mapping
- Step 3: Duplikat-Prüfung
  - Übersicht: X neue, Y Duplikate, Z Fehler
  - Duplikate: Aufklappbare Zeilen mit Vergleich Alt/Neu
  - Pro Duplikat: Aktion wählen (Überspringen / Aktualisieren / Trotzdem anlegen)
  - Fehler-Zeilen: Rot markiert mit Fehlergrund
  - Fehler-Strategie: Radio (Fehler überspringen / Bei Fehler abbrechen)
- Step 4: Import-Ergebnis
  - Fortschrittsbalken während Import
  - Ergebnis: X erstellt, Y aktualisiert, Z übersprungen, W Fehler
  - Download-Button für Fehlerbericht (CSV)
  - Button "Zur Kontaktliste"

### Responsive Design
- Desktop: Volle Tabelle, Side-by-Side Formulare
- Tablet: Tabelle mit horizontalem Scroll, Formulare vertikal
- Die UI folgt dem bestehenden Terp-Design-System (Shadcn/Radix)

## Acceptance Criteria
1. Kontaktliste zeigt alle Kontakte des aktuellen Tenants mit Suche und Filtern.
2. Kontakt kann erstellt, bearbeitet und archiviert werden.
3. Adressen und Kommunikationswege können im Detail verwaltet werden.
4. CSV-Import-Wizard führt durch alle 4 Schritte bis zum Ergebnis.
5. Duplikate werden im Wizard visuell dargestellt mit Aktionsmöglichkeiten.
6. Alle Texte sind in de.json und en.json übersetzt.
7. Formulare validieren client-side und zeigen Server-Fehler an.
8. Navigation (Sidebar, Breadcrumbs) funktioniert korrekt.
9. Archivierte Kontakte sind visuell abgesetzt und standardmäßig ausgeblendet.

## Tests

### Component Tests (React/Vitest)
- `TestContactList_Renders`: Kontaktliste rendert mit Mock-Daten.
- `TestContactList_SearchFilter`: Eingabe im Suchfeld filtert Liste.
- `TestContactList_TypeFilter`: Typ-Filter zeigt nur Privat/Geschäftskunden.
- `TestContactList_Pagination`: Seitenwechsel aktualisiert Daten.
- `TestContactList_SortByName`: Klick auf "Name"-Spalte sortiert.
- `TestContactList_EmptyState`: Leere Liste zeigt "Keine Kontakte gefunden" mit CTA.
- `TestContactForm_RequiredFields`: Submit ohne Pflichtfelder → Fehler angezeigt.
- `TestContactForm_BusinessType`: Typ "Geschäft" → company_name wird Pflicht.
- `TestContactForm_PrivateType`: Typ "Privat" → company_name nicht Pflicht.
- `TestContactForm_VatWarning`: Geschäftskunde ohne USt-IdNr → Warnung sichtbar.
- `TestContactForm_SubmitSuccess`: Valides Formular → API Call, Weiterleitung zur Liste.
- `TestContactForm_ServerError`: API gibt 400 → Fehler werden inline angezeigt.
- `TestContactDetail_RendersAllTabs`: Detail zeigt Stammdaten, Adressen, Kommunikation Tabs.
- `TestContactDetail_ArchiveDialog`: Archivieren-Button öffnet Bestätigungs-Dialog.
- `TestContactDetail_ArchiveConfirm`: Bestätigung → API Call, Kontakt als archiviert markiert.
- `TestAddressSection_AddAddress`: Add-Button öffnet Dialog, Submit erstellt Adresse.
- `TestAddressSection_EditAddress`: Edit öffnet vorausgefüllten Dialog.
- `TestAddressSection_DeleteAddress`: Delete mit Bestätigung entfernt Adresse.
- `TestAddressSection_SetDefault`: Stern-Klick setzt neue Default-Adresse.
- `TestCommunicationSection_AddPhone`: Telefonnummer hinzufügen.
- `TestCommunicationSection_AddEmail`: E-Mail hinzufügen.
- `TestCommunicationSection_ClickableLinks`: Tel/Email sind als Links klickbar.

### Component Tests — CSV-Import-Wizard
- `TestImportWizard_Step1_FileUpload`: Datei-Upload zeigt Fortschritt.
- `TestImportWizard_Step1_InvalidFormat`: .txt Datei → Fehlermeldung.
- `TestImportWizard_Step1_TooLarge`: >10 MB → Fehlermeldung.
- `TestImportWizard_Step2_ColumnMapping`: Spalten werden mit Dropdowns angezeigt.
- `TestImportWizard_Step2_AutoMapping`: System schlägt Mapping vor.
- `TestImportWizard_Step2_Preview`: Vorschau-Tabelle zeigt gemappte Daten.
- `TestImportWizard_Step3_DuplicateDisplay`: Duplikate werden mit Vergleich angezeigt.
- `TestImportWizard_Step3_DuplicateActions`: Aktion pro Duplikat wählbar.
- `TestImportWizard_Step3_ErrorDisplay`: Fehler-Zeilen rot markiert.
- `TestImportWizard_Step4_Progress`: Fortschrittsbalken während Import.
- `TestImportWizard_Step4_Result`: Ergebnis-Zusammenfassung korrekt.
- `TestImportWizard_Step4_ErrorReport`: Download-Button für Fehlerbericht.
- `TestImportWizard_NavigateBack`: Zurück-Navigation zwischen Steps.

### E2E Tests (Playwright)
- `TestE2E_ContactCreate`: Neuen Kontakt über UI erstellen → in Liste sichtbar.
- `TestE2E_ContactEdit`: Kontakt öffnen, Feld ändern, speichern → Änderung persistiert.
- `TestE2E_ContactArchive`: Kontakt archivieren → verschwindet aus Standard-Liste.
- `TestE2E_ContactSearch`: Kontakte anlegen, suchen → nur passende angezeigt.
- `TestE2E_ContactAddAddress`: Im Detail Adresse hinzufügen → sichtbar.
- `TestE2E_ContactCSVImport`: CSV hochladen → Mapping → Import → Kontakte in Liste.
- `TestE2E_ContactNavigation`: Sidebar → Kontakte → Detail → Breadcrumbs zurück.

### Accessibility Tests
- `TestA11y_ContactList`: Tabelle ist navigierbar per Tastatur, hat ARIA-Labels.
- `TestA11y_ContactForm`: Formularfelder haben Labels, Fehler sind per Screen Reader lesbar.
- `TestA11y_ImportWizard`: Steps sind per Tastatur navigierbar.

### Test Case Pack
1) **Neuen Privatkunden erstellen**
   - Input: Typ "Privat", Name "Hans Müller", Adresse "Hauptstr. 1, 80331 München", Tel "089-123456"
   - Expected: Kontakt in Liste sichtbar, Detail zeigt alle Daten

2) **Neuen Geschäftskunden erstellen**
   - Input: Typ "Geschäft", Firma "Bau GmbH", Name "Peter Schmidt", USt-IdNr "DE123456789"
   - Expected: Kontakt gespeichert, kein Warning

3) **Geschäftskunde ohne Firma**
   - Input: Typ "Geschäft", nur Name eingegeben
   - Expected: Formular zeigt Fehler "Firmenname ist Pflicht bei Geschäftskunden"

4) **Kontakt archivieren**
   - Input: Kontakt Detail → Archivieren → Bestätigen
   - Expected: Dialog "Kontakt wirklich archivieren?", nach Bestätigung: Weiterleitung zur Liste, Kontakt nicht mehr sichtbar

5) **Archivierte Kontakte anzeigen**
   - Input: Filter "Archiviert: Ja" setzen
   - Expected: Archivierte Kontakte werden grau/durchgestrichen angezeigt

6) **Suche**
   - Setup: Kontakte "Müller", "Schmidt", "Müllmann"
   - Input: Suchfeld "Müll"
   - Expected: "Müller" und "Müllmann" angezeigt, "Schmidt" nicht

7) **CSV Import Happy Path**
   - Input: CSV mit 5 Kontakten hochladen → Auto-Mapping akzeptieren → Import starten
   - Expected: 5 Kontakte erstellt, Ergebnis-Seite zeigt "5 erstellt, 0 Fehler"

8) **CSV Import mit Duplikaten**
   - Setup: Kontakt "Hans Müller" existiert
   - Input: CSV mit "Hans Müller" → Mapping → Preview zeigt Duplikat
   - Expected: Duplikat-Zeile aufklappbar mit Vergleich, Aktion "Überspringen" wählbar

9) **Adresse hinzufügen**
   - Input: Kontakt-Detail → Adressen-Tab → "Adresse hinzufügen" → Baustellenadresse eingeben
   - Expected: Neue Adresse in Liste, mit Badge "Baustelle"

10) **Default-Adresse umschalten**
    - Setup: Kontakt hat 2 Adressen, Adresse A ist Default
    - Input: Stern bei Adresse B klicken
    - Expected: Adresse B ist jetzt Default, Adresse A nicht mehr

## Verification Checklist
- [ ] Menüpunkt "Kontakte" in Sidebar sichtbar
- [ ] Breadcrumbs funktionieren korrekt (Home → Kontakte → Detail)
- [ ] i18n-Strings in de.json und en.json vorhanden
- [ ] Kontaktliste lädt und zeigt Daten mit Pagination
- [ ] Suchfunktion filtert in Echtzeit (Debounce)
- [ ] Typ-Filter funktioniert
- [ ] Sortierung per Spaltenklick funktioniert
- [ ] "Neuer Kontakt" öffnet Formular
- [ ] Formular validiert Pflichtfelder client-side
- [ ] Formular zeigt Server-Fehler inline an
- [ ] Kontakttyp "Geschäft" macht Firmenname zum Pflichtfeld
- [ ] USt-IdNr Warnung wird bei Geschäftskunden angezeigt
- [ ] Kontakt-Detail zeigt alle Tabs
- [ ] Adressen: Add/Edit/Delete/Set-Default funktioniert
- [ ] Kommunikation: Add/Edit/Delete/Set-Primary funktioniert
- [ ] Telefon/E-Mail sind klickbar (tel:/mailto:)
- [ ] Archivieren zeigt Bestätigungs-Dialog
- [ ] Archivierte Kontakte sind visuell abgesetzt
- [ ] CSV-Import-Wizard: alle 4 Steps durchklickbar
- [ ] CSV-Import: Auto-Mapping funktioniert
- [ ] CSV-Import: Duplikate werden angezeigt
- [ ] CSV-Import: Fehlerbericht downloadbar
- [ ] Responsive: Tablet-Ansicht funktioniert
- [ ] Keine Console-Errors im Browser
- [ ] Alle Component Tests bestehen
- [ ] Alle E2E Tests bestehen
- [ ] Accessibility: Tastatur-Navigation funktioniert
- [ ] `next build` kompiliert ohne Fehler

## Dependencies
- ZMI-TICKET-101 (Kontakte API)
- ZMI-TICKET-102 (CSV-Import API)
- Bestehendes Terp Design System (Shadcn/Radix Components)
- Bestehende API-Hook-Patterns (`hooks/api/`)

## Notes
- Die Platzhalter-Tabs "Projekte" und "Dokumente" werden erst aktiviert wenn die entsprechenden Module implementiert sind. Sie zeigen vorerst "Demnächst verfügbar" an.
- Das bestehende Hook-Pattern in `hooks/api/` für API-Calls übernehmen (React Query / SWR).
- Sidebar-Struktur muss ggf. um einen neuen Bereich "Betrieb" erweitert werden, unter dem CRM, Projekte, Dokumente etc. gruppiert werden.
