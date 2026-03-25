# ZMI orgAuftrag vs. Terp — Detaillierter Feature-Abgleich

*Stand: 24. März 2026*
*Quellen: ZMI orgAuftrag Benutzerhandbuch V1.3 (103 Seiten) vs. Terp Handbuch V2*

---

## Legende

| Symbol | Bedeutung |
|--------|-----------|
| ✅ | Terp hat diese Funktion vollständig |
| ✅+ | Terp hat diese Funktion UND bietet mehr als ZMI |
| ⚠️ | Terp hat die Funktion teilweise / anders gelöst |
| ❌ | Terp fehlt diese Funktion (Gap) |
| 🆕 | Terp hat diese Funktion — ZMI hat sie NICHT |

---

## 1. SYSTEMEINSTELLUNGEN / VERWALTUNG

### 1.1 Nummernkreise

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Konfigurierbare Nummernkreise für Belege | Belegpräfix nach Typ (1=Angebot, 2=AB, 3=LS, 4=Rücklief., 5=Rechnung, 6=Gutschrift, 9=Vorgang) + Jahr + lfd. Nr. | Belegnummern mit Typ-Präfix (A-, AB-, LS-, RE-, G-, R-, LN-) + lfd. Nr. | ✅ |
| Nummernkreise Kunden/Lieferanten | Getrennte Kreise (z.B. Kunden ab 20000, Lieferanten ab 70000) | Getrennte Kreise mit Präfix (K-, L-) + lfd. Nr., konfigurierbar | ✅ |
| Nummernkreise Anfragen | Ja (Vorgangsnummer) | Ja (V-1, V-2, …) | ✅ |
| Nummernkreise Bestellungen | Nicht explizit erwähnt | Ja (BES-1, BES-2, …) | ✅+ |
| Nummernkreise Artikel | Automatisch vergeben | Automatisch vergeben | ✅ |
| Gutschrift gleicher Nummernkreis wie Rechnung | Optional (Checkbox) | Getrennte Nummernkreise (G- vs. RE-) | ⚠️ Option fehlt |
| Jahr in Belegnummer kodiert | Ja (2 Stellen nach Belegtyp) | Nein — nur lfd. Nummer | ⚠️ Kein Jahr im Nummernkreis |

**Gap-Detail:** ZMI kodiert das Jahr automatisch in der Belegnummer (z.B. 109001 = Angebot, Jahr 09, Nr. 001). Terp hat nur Präfix + lfd. Nummer (z.B. A-1). Für manche Betriebe ist die Jahreskodierung wichtig für die Zuordnung. → **Niedrige Priorität**, da das aktuelle Schema funktional ist.

### 1.2 Gelöschte Artikel

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Soft-Delete für Artikel | Ja — gelöschte Artikel bleiben in DB, können wiederhergestellt werden | Ja — Deaktivieren/Wiederherstellen | ✅ |
| Endgültig löschen | Ja — Button "Endgültig löschen" | Nein — nur Deaktivieren, kein hartes Löschen | ✅+ (sicherer) |
| In Belegen weiterhin sichtbar | Ja — Doppelklick auf gelöschten Artikel im Beleg möglich | Nicht explizit dokumentiert | ⚠️ Prüfen |

### 1.3 Feldlängen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Konfigurierbare Feldlängen für Stücklisten-Übernahme in Bestellungen | Ja — Blocksatz-Formatierung für Memofeld | Nein — nicht vorhanden | ❌ Niedrige Prio |

### 1.4 Allgemeine Einstellungen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Standard-Mehrwertsteuersatz konfigurierbar | Ja — global in Systemeinstellungen | Ja — pro Artikel und Position (Standard 19%) | ✅ |
| Eigene Firmenadresse hinterlegen | Ja — unter Systemeinstellungen | Ja — Billing-Konfiguration + Mandanteneinstellungen | ✅ |
| Vorgangsnummer bei neuer Anfrage optional | Ja — Checkbox in Systemeinstellungen | Automatisch vergeben (V-1, V-2, …) | ✅ |
| Integration Anfrage/Kundendienst → Zeiterfassung | Ja — Tätigkeitsgruppe/Kategorie konfigurierbar, Auftrag in ZMI-Time anlegen | Ja — Auftragsverknüpfung bei Anfragen und Serviceaufträgen | ✅ |
| Beleg-Druckverhalten konfigurierbar | Ja — Was beim Drucken passiert (Auftrag in Time anlegen, Aufgaben vergeben) | Ja — Beim Abschließen einer AB optional Terp-Auftrag erstellen | ✅ |
| Lagerbuchung bei Lieferschein konfigurierbar | 3 Optionen: nur bei vorhandener Buchung / Nachfrage / Automatisch | Nicht dokumentiert — Lagerbuchung separat über Entnahme-Terminal | ⚠️ Keine auto. Lagerbuchung bei LS |
| Sofortrechnungen | Ja — konfigurierbar | Nicht explizit — Rechnung kann direkt erstellt werden ohne Vorgänger | ⚠️ Prüfen |
| Zeichnungsnummern bei Artikeln | Ja — optional anzeigbar | Nein | ❌ Niedrige Prio |
| Einkaufspreis-Auswahl (Standard/Letzter/Durchschnitt) | Ja — 3 Optionen | Nicht dokumentiert — EK-Preis aus Lieferantenzuordnung | ⚠️ Nur ein EK-Preis-Modus |
| Lieferscheinnummer auf Rechnung | Ja — konfigurierbar wo und ob | Ja — Belegkette zeigt Vorgänger-Belege | ✅ |
| Fertigungsartikel → Artikelgruppe zuordnen | Ja — über Artikelbaum | Ja — über Artikelgruppen-Baum | ✅ |

**Gap-Detail — Automatische Lagerbuchung bei Lieferschein:** ZMI kann so konfiguriert werden, dass beim Drucken eines Lieferscheins automatisch die Lagerbestände reduziert werden. In Terp ist der Lieferschein ein reiner Beleg — die Lagerentnahme muss separat über das Entnahme-Terminal erfolgen. → **Mittlere Priorität** für den Warehouse-Workflow.

### 1.5 Korrekturassistent

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Korrekturassistent für Warenwirtschaft | Doppelt gebuchte Wareneingänge, negative Lagerbestände, sonstige Unstimmigkeiten | Terp hat Korrekturassistent für Zeiterfassung (fehlende Buchungen, Kernzeitverstöße etc.) | ⚠️ Unterschiedlicher Fokus |
| Filter mit UND/ODER/NICHT-Logik | Ja — komplexe Filtergruppen | Einfache Filter (Datumsbereich, Abteilung, Schweregrad, Fehlercode) | ⚠️ Weniger komplex |
| "Erledigt"-Markierung mit Bemerkung | Ja | Nein — Fehler verschwinden nach Korrektur automatisch | ⚠️ Kein manuelles "Erledigt" |

**Gap-Detail:** ZMI hat einen Korrekturassistenten speziell für die Warenwirtschaft (doppelte Wareneingänge, negative Bestände). Terp hat einen Korrekturassistenten nur für die Zeiterfassung. Für die Lagerverwaltung gibt es in Terp keinen eigenen Prüfmechanismus. → **Mittlere Priorität** als separates Feature für das Warehouse-Modul.

### 1.6 Benutzerverwaltung

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Benutzer anlegen mit Passwort | Ja | Ja | ✅ |
| Benutzergruppen mit Rechten | Ja (einfach: Benutzergruppe zuweisen) | Ja — 7 Berechtigungskategorien mit Einzelberechtigungen, Datensichtbereich | ✅+ |
| Mitarbeiter aus ZMI-Time übernehmen | Ja — automatisch | Terp = ein System (keine separate Time-Software) | ✅+ |
| Kürzel, Funktion, Präfix pro Benutzer | Ja | Anzeigename, Rolle — kein Kürzel/Präfix | ⚠️ Kürzel fehlt |

---

## 2. ADRESSVERWALTUNG (CRM)

### 2.1 Adressen — Grunddaten

| Feld | ZMI | Terp | Status |
|------|-----|------|--------|
| Name / Firma | ✅ | ✅ | ✅ |
| Zusatz (GmbH & Co. KG) | ✅ Eigenes Feld | Nicht als separates Feld — Teil des Firmennamens | ⚠️ Kein Zusatzfeld |
| Straße + Hausnummer | ✅ | ✅ | ✅ |
| PLZ, Ort | ✅ | ✅ | ✅ |
| PLZ Postfach + Postfach | ✅ Eigene Felder | ❌ Fehlt | ❌ Niedrige Prio |
| Land (mit Neuanlage) | ✅ + Länderkennzeichen | ✅ (Standard: DE) | ✅ |
| Telefon 1, Telefon 2 | ✅ 2 Felder | ✅ 1 Feld | ⚠️ Nur 1 Telefon |
| Telefax | ✅ | ✅ | ✅ |
| E-Mail | ✅ | ✅ | ✅ |
| Internet / Webseite | ✅ | ✅ | ✅ |
| In Karte anzeigen (Map-Server) | ✅ Zusatzmodul | ❌ Fehlt | ❌ Niedrige Prio |
| Konzern / Filialen-Zuordnung | ✅ — Konzernzugehörigkeit für Auswertungen | ❌ Fehlt | ❌ Mittlere Prio |
| USt-ID | ✅ | ✅ | ✅ |
| Steuernummer | ✅ | ✅ | ✅ |
| Leitweg-ID | ❌ | ✅ (für XRechnung/E-Rechnung) | 🆕 |
| Matchcode | Nicht explizit erwähnt | ✅ Auto-generiert aus Firmenname | 🆕 |

### 2.2 Adressen — Kunden-/Lieferantenstatus

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Interessent (ohne Kd-Nr.) | Ja — Adresse ohne Kd-/Lief.-Nr. = Interessent | Nein — Typ wird beim Anlegen gewählt (Kunde/Lieferant/Beides) | ⚠️ Kein Interessenten-Status |
| Kunden- UND Lieferantennummer vergeben | Ja — eine Adresse kann beide Nummern haben | Ja — Typ "Kunde & Lieferant" | ✅ |
| Bankverbindung | Ja | Ja — eigener Tab mit IBAN, BIC, Kontoinhaber, Standard-Badge | ✅+ |
| Zahlungsbedingungen (Kunde) | Ja — zuweisbar mit Neuanlage | Ja — Zahlungsziel, Skonto %, Skontotage | ✅ |
| Keine Mehrwertsteuer (Checkbox) | Ja — für EU-Kunden/Lieferanten | Nicht als separater Schalter dokumentiert | ⚠️ Prüfen ob via MwSt-Satz 0% lösbar |
| Preisliste pro Kunde | Ja — Auswahl einer Preisliste | Ja — Preisliste dem Kunden zuweisbar | ✅ |

### 2.3 Adressen — Lieferanten-Spezifisch

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| "Unsere Kundennummer" beim Lieferanten | ✅ Eigenes Feld | ❌ Fehlt | ❌ Mittlere Prio |
| Arbeitstage des Lieferanten | ✅ (Mo-So konfigurierbar) | ❌ Fehlt | ❌ Niedrige Prio |
| Liefertage des Lieferanten | ✅ | ❌ Fehlt | ❌ Niedrige Prio |
| Bestelltage | ✅ | ❌ Fehlt | ❌ Niedrige Prio |

**Gap-Detail — "Unsere Kundennummer":** ZMI speichert die eigene Kundennummer beim Lieferanten, damit sie auf Bestellungen gedruckt werden kann. In Terp fehlt dieses Feld. → **Mittlere Priorität** — relevant für den Bestelldruck.

### 2.4 Ansprechpartner / Kontaktpersonen

| Feld | ZMI | Terp | Status |
|------|-----|------|--------|
| Vorname, Nachname | ✅ | ✅ | ✅ |
| Titel (Dr., Prof.) | ✅ | ❌ Fehlt | ❌ Niedrige Prio |
| Funktion | ✅ | ✅ (Position) | ✅ |
| Abteilung | ✅ | ✅ | ✅ |
| Zusatz (für Anrede in Reports) | ✅ | ❌ Fehlt | ❌ Niedrige Prio |
| Telefon 1, Telefon 2 | ✅ 2 Felder | ✅ 1 Feld | ⚠️ Nur 1 Telefon |
| Handy/Mobil | ✅ Eigenes Feld | ❌ Kein separates Feld | ❌ Niedrige Prio |
| Telefax | ✅ | ❌ Fehlt | ❌ Niedrige Prio |
| E-Mail + MAPI-Verknüpfung | ✅ + "Email erstellen" Button | ✅ E-Mail (ohne MAPI) | ✅ |
| Briefanrede (für Reports) | ✅ | ❌ Fehlt | ⚠️ Relevant für Belegdruck |
| Geburtstag + Geburtstagsliste | ✅ | ❌ Fehlt | ❌ Niedrige Prio |
| Memo | ✅ | ✅ (Notizen) | ✅ |
| Hauptkontakt | Nicht explizit | ✅ Checkbox | 🆕 |

**Gap-Detail — Briefanrede:** ZMI hat ein dediziertes Feld für die Briefanrede des Ansprechpartners, das in Belege und Reports übernommen wird (z.B. "Sehr geehrter Herr Dr. Müller"). In Terp fehlt dieses Feld. → **Mittlere Priorität** wenn Belege mit persönlicher Anrede gedruckt werden sollen.

### 2.5 Korrespondenz

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| E/A (Eingang/Ausgang/Intern) | ✅ | ✅ (Eingehend/Ausgehend/Intern) | ✅ |
| Typ (Telefon, E-Mail, Brief, Fax) | ✅ | ✅ + Besuch | ✅+ |
| Datum und Uhrzeit | ✅ | ✅ Datum | ✅ |
| Ansprechpartner-Verknüpfung | ✅ | ✅ | ✅ |
| Vorgang-Verknüpfung | ✅ | ✅ (über Anfrage) | ✅ |
| Absender und Empfänger | ✅ | ✅ (Von intern / An intern) | ✅ |
| Nachricht / Inhalt | ✅ | ✅ (Betreff + Inhalt) | ✅ |
| Anhänge (Bilder, PDFs, Scanner) | ✅ + Scanner-Integration | ❌ Keine Dateianhänge | ❌ Mittlere Prio |
| Volltextsuche (Betreff + Memo) | ✅ + erweiterbar auf andere Felder | ✅ (Betreff + Inhalt) | ✅ |

**Gap-Detail — Anhänge:** ZMI ermöglicht das Anhängen von Dateien (PDFs, Bilder) und sogar direktes Einscannen an Korrespondenzeinträge. Terp hat aktuell keine Dateianhänge bei der Korrespondenz. → **Mittlere Priorität** — für die Dokumentation von Briefen/Verträgen relevant.

### 2.6 Anfragen / Vorgänge

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Anfrage anlegen mit Bezeichnung | ✅ | ✅ (Titel) | ✅ |
| Vorgangsnummer (auto) | ✅ | ✅ (V-1, V-2, …) | ✅ |
| Aufwand, Zahlungsfähigkeit | ✅ (Listenfelder) | ✅ (Aufwand Dropdown, Zahlungsfähigkeit Freitext) | ✅ |
| Status-Workflow | Offen → Abgeschlossen (mit Grund) | Offen → In Bearbeitung → Geschlossen/Storniert (mit Grund + Bemerkung) | ✅+ |
| Auftrag in Zeiterfassung anlegen | ✅ (Button "Auftrag erstellen" → ZMI-Time) | ✅ (Auftragsverknüpfung: bestehend oder neu) | ✅ |
| Abschließen mit Abschlussgrund | ✅ + Abschlussbemerkung | ✅ (4 Gründe + Bemerkung + Option Auftrag mitschließen) | ✅+ |
| Wieder öffnen nach Schließen | ❌ (geschlossene Anfragen können nicht wiederhergestellt werden) | ✅ (Button "Wieder öffnen") | 🆕 |
| Vorgänge-Übersicht (global) | ✅ (eigenes Modul unter Vorgänge) | ✅ (globale Anfragenliste + Adress-Tab) | ✅ |
| Vorgänge-Suche (Bezeichnung, Fragezeichen-Suche) | ✅ (Fragezeichen = Inhaltssuche) | ✅ (Suchfeld durchsucht Titel + Nummer) | ✅ |
| Kontakt-Verknüpfung | Nicht explizit bei Anfrage | ✅ (Kontaktperson Dropdown) | 🆕 |
| Beleg-Tab bei Anfrage | ❌ | ✅ (Tab "Belege" zeigt verknüpfte Belege) | 🆕 |

### 2.7 Kundendienst / Serviceaufträge

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Serviceauftrag anlegen | ✅ (unter Adressen → Kundendienst) | ✅ (eigenes Modul: Aufträge → Kundendienst) | ✅ |
| Vorgangsbezeichnung | ✅ | ✅ (Titel) | ✅ |
| "Gemeldet am" Datum | ✅ (automatisch) | ✅ | ✅ |
| Vorgangsnummer | ✅ (automatisch) | ✅ (KD-1, KD-2, …) | ✅ |
| Kunde auf Kosten hingewiesen | ✅ (Dropdown) | ✅ (Checkbox) | ✅ |
| Ansprechpartner | ✅ | ✅ (Kontaktperson) | ✅ |
| Detail-Textfeld | ✅ | ✅ (Beschreibung) | ✅ |
| Zuständiger Mitarbeiter | Nicht explizit | ✅ | 🆕 |
| Abschließen mit Abschlussgrund | ✅ + wird nach Verkauf → Kundendienst kopiert → Rechnung erstellbar | ✅ (Abschlussgrund Pflicht, danach "Rechnung erstellen") | ✅ |
| Nach Abschluss nicht mehr änderbar | ✅ | ✅ | ✅ |
| Rechnung aus Kundendienst erstellen | ✅ (über Verkauf → Kundendienst) | ✅ (Button "Rechnung erstellen" mit Positionsdialog) | ✅+ |
| Auftrag für Zeiterfassung | Über Einstellungen konfigurierbar (auto bei Anlage) | ✅ (Button "Auftrag erstellen", manuell) | ✅ |
| Aufgaben/Nachrichten erstellen | ✅ (via InfoCenter) | ✅ (CRM-Aufgaben verknüpfbar) | ✅ |
| Status-Workflow | Offen → Abgeschlossen | Offen → In Bearbeitung → Abgeschlossen → Abgerechnet | ✅+ |

### 2.8 Bestellungen (Ansicht pro Adresse)

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Bestellungen pro Lieferant anzeigen | ✅ (Tab in Adresse mit Statusfilter) | Über Bestellliste mit Lieferantenfilter | ⚠️ Kein dedizierter Tab in Adresse |
| Doppelklick → zur Bestellung springen | ✅ | Klick in Bestellliste → Detailseite | ✅ |

### 2.9 Belege (Ansicht pro Adresse)

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Alle Belege pro Adresse anzeigen | ✅ (Tab mit Statusfilter für aktuelle Belege) | ✅ (Tab "Belege" in Adressdetails) — aktuell noch Platzhalter (ORD_01) | ⚠️ In Entwicklung |
| Neuer Beleg direkt aus Adresse | ✅ (Button "neuer Beleg") | Über Aufträge → Belege → Neuer Beleg (Kunde wählen) | ⚠️ Kein Direktlink aus Adresse |

### 2.10 Aufgaben & Nachrichten

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Aufgabe erstellen (an Mitarbeiter/Team) | ✅ (via InfoCenter) | ✅ (eigenes Modul CRM → Aufgaben) | ✅ |
| Fällig am, um, Dauer | ✅ | ✅ (Fällig am, Uhrzeit, Dauer) | ✅ |
| Aufgabenstatus | ✅ | ✅ (Offen → In Bearbeitung → Erledigt/Storniert) | ✅+ |
| Adress-Verknüpfung | ✅ (automatisch aus Adresse) | ✅ (Dropdown) | ✅ |
| Ansprechpartner-Verknüpfung | ✅ | ✅ (Kontakt Dropdown) | ✅ |
| Vorgang-Verknüpfung | ✅ | ✅ (Anfrage Dropdown) | ✅ |
| An Mitarbeiter/Team senden | ✅ (mehrere möglich) | ✅ (Mehrfachauswahl: Mitarbeiter + Teams) | ✅ |
| Betreff + Nachrichtentext | ✅ | ✅ (Betreff + Beschreibung) | ✅ |
| Anhänge | ✅ (Bilder und Dokumente) | ❌ Keine Dateianhänge | ❌ Niedrige Prio |
| Nachricht (ohne Fälligkeitsdatum) | ✅ (separater Typ) | ✅ (Umschalter Aufgabe/Nachricht) | ✅ |
| "Meine Aufgaben" Ansicht | Nicht explizit | ✅ (Umschalter-Filter) | 🆕 |
| Lese-Status pro Zugewiesenem | Nicht explizit | ✅ (grüner Haken = gelesen) | 🆕 |
| Benachrichtigung bei Zuweisung | Über InfoCenter | ✅ (Terp-Benachrichtigung automatisch) | ✅ |

---

## 3. ARTIKELSTAMMDATEN / LAGERVERWALTUNG

### 3.1 Artikel — Grunddaten

| Feld | ZMI | Terp | Status |
|------|-----|------|--------|
| Artikelnummer (auto) | ✅ | ✅ | ✅ |
| Bezeichnung | ✅ | ✅ | ✅ |
| Beschreibung (Auswahl + Individuell) | ✅ (2 Felder: Zubehör + Individuell) | ✅ (1 Beschreibungsfeld) | ⚠️ Kein separates Zubehörfeld |
| Artikelgruppen (Baumstruktur) | ✅ | ✅ (Baumstruktur links) | ✅ |
| Artikelbilder | ✅ (mehrere) | ❌ Fehlt | ❌ Mittlere Prio |
| Verkaufspreis | ✅ | ✅ (VK-Preis netto) | ✅ |
| Grundeinheit (Stk, kg, etc.) | ✅ + Neuanlage möglich | ✅ (festes Dropdown: Stk, kg, m, Std, l, Paar, Pkt, Set) | ⚠️ Keine benutzerdef. Einheiten |
| Matchcode | ✅ | ✅ (auto-generiert) | ✅ |
| Produktgruppe | ✅ (in Baumansicht) | Über Artikelgruppen | ✅ |
| Rabattgruppe | ✅ | ✅ | ✅ |
| Mehrwertsteuer | ✅ (Auswahl pro Artikel) | ✅ (MwSt-Satz %) | ✅ |
| Bestellart | ✅ (Dropdown: Lager/Auftrag/etc.) | ✅ (optional) | ✅ |

### 3.2 Artikel — Lieferanten

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Mehrere Lieferanten pro Artikel | ✅ | ✅ | ✅ |
| Lieferant auswählen (aus Adressstamm) | ✅ | ✅ (Dropdown CRM-Lieferanten) | ✅ |
| Artikelnummer beim Lieferanten | ✅ | ✅ | ✅ |
| Hauptlieferant markieren | ✅ | ✅ | ✅ |
| Bezeichnung beim Lieferanten | ✅ | Nicht als separates Feld | ⚠️ Fehlt |
| Bestelleinheit | ✅ | ✅ | ✅ |
| Lieferzeit (Tage) | ✅ | ✅ | ✅ |
| Standard-Bestellmenge | ✅ | ✅ (Std.-Bestellmenge) | ✅ |
| Beschreibung/Memo | ✅ | ❌ | ❌ Niedrige Prio |
| Nur bestellbar bei hinterlegten Lieferanten | ✅ (nur Lieferanten aus Liste bestellbar) | Nicht explizit eingeschränkt | ⚠️ Keine Einschränkung |

### 3.3 Artikel — Stückliste (BOM)

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Stückliste (Bill of Materials) | ✅ (Artikelbaugruppen aus Einzelteilen) | ✅ (Tab "Stückliste" mit Komponenten) | ✅ |
| Artikel hinzufügen (aus Übersicht oder Neu) | ✅ | ✅ (Suchfeld + Autocomplete) | ✅ |
| Menge pro Komponente | ✅ | ✅ | ✅ |
| Bemerkung | Nicht explizit | ✅ | 🆕 |
| Stückliste → Bestellung (Poolbestellung) | ✅ (Stücklisten-Artikel werden in Bestellbeschreibung übernommen) | ❌ Keine automatische Übernahme | ❌ Niedrige Prio |

### 3.4 Artikel — Lager / Bestand

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Lager zuordnen | ✅ (Lager-Auswahl) | ✅ (Lagerort Freitext) | ⚠️ Kein strukturiertes Lager-Objekt |
| Bestand anzeigen | ✅ | ✅ | ✅ |
| Bestandskorrektur | ✅ (Button "Bestand ändern") | ✅ (Button "Bestand korrigieren" mit Delta + Grund) | ✅+ |
| Mindestbestand + Bestellvorschlag | ✅ (Bestandsüberwachung aktivierbar, auto Bestellvorschlag) | ✅ (Mindestbestand + Nachbestellvorschläge-Seite) | ✅ |
| Bestandsführung ein/aus | Nicht explizit als Schalter | ✅ (Schalter pro Artikel) | 🆕 |

### 3.5 Artikel — Reservierungen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Reservierungen (bei Auftragsbestätigung) | ✅ — Bei AB werden Artikel automatisch für den Kunden reserviert | ❌ Fehlt | ❌ Mittlere Prio |

**Gap-Detail — Reservierungen:** ZMI reserviert Artikel automatisch, sobald eine Auftragsbestätigung erstellt wird. Der Bestand zeigt dann "verfügbar" vs. "reserviert". In Terp gibt es kein Reservierungssystem. → **Mittlere Priorität** — relevant für Betriebe mit Lagerware und mehreren gleichzeitigen Aufträgen.

### 3.6 Artikel — Lagerbewegungen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Alle Buchungen historisch aufgelistet | ✅ | ✅ (Tab "Bestand" + Bestandsbewegungen-Seite) | ✅ |
| Mitarbeiter + Zeitstempel | ✅ | ✅ (über Bestandsbewegung-Referenz) | ✅ |
| Terminal-Informationen | ✅ (Terminal an dem gebucht wurde) | Referenz (Bestellung/Auftrag/Beleg) | ⚠️ Kein Terminal-Feld |
| Manuelle Lagerbewegung eintragen | ✅ (Button "Neu", nur Anzeige, ändert nicht den Bestand) | ✅ (Bestandskorrektur, ändert den Bestand) | ✅+ |

### 3.7 Artikel — Bestellungen & Bestellvorschläge

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Bestellhistorie pro Artikel | ✅ (Tab "Bestellungen", nur lesen) | Über Bestandsbewegungen (GOODS_RECEIPT) | ⚠️ Kein dedizierter Tab |
| Bestellvorschläge pro Artikel | ✅ (Tab, nur lesen) | ✅ (globale Nachbestellvorschläge-Seite) | ✅ |

### 3.8 Artikel — Preise

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| EK-Preis | ✅ | ✅ | ✅ |
| Pauschalkosten | ✅ | Über Fixkosten in Bestellpositionen | ⚠️ Nicht im Artikelstamm |
| Preis für x Grundeinheiten | ✅ | Über Mengenstaffel in Preislisten | ⚠️ Anderer Ansatz |
| Einzelpreis | ✅ | ✅ (VK-Preis) | ✅ |
| Liefermenge | ✅ | Über Std.-Bestellmenge beim Lieferanten | ✅ |
| Liefereinheit | ✅ | Über Bestelleinheit beim Lieferanten | ✅ |
| Min/Max Bestellmenge | ✅ | ❌ Fehlt im Artikelstamm | ❌ Niedrige Prio |
| Tab "Preise" (alle Preislisten) | Nicht explizit als Tab | ✅ (Tab "Preise" zeigt alle Preislisteneinträge) | 🆕 |

---

## 4. PREISLISTEN

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Mehrere Preislisten | ✅ (Standard + Großkunde etc.) | ✅ (beliebig viele) | ✅ |
| Preisliste neu anlegen | ✅ (Nummer + Bezeichnung) | ✅ (Name + optionale Felder) | ✅ |
| Artikel zur Liste hinzufügen | ✅ (alle/nur mit Preis/keine) | ✅ (einzeln über Suchfeld) | ⚠️ Keine Massenübernahme aller Artikel |
| Preisliste einem Kunden zuweisen | ✅ (Button "Zuweisen") | ✅ (Dropdown in Adresse) | ✅ |
| Preise pro Artikel bearbeiten | ✅ (eigenes Fenster) | ✅ (3-Panel-Ansicht: Liste → Artikel → Preis) | ✅+ |
| Standardpreisliste | Nicht explizit | ✅ (eine Standard-Preisliste als Fallback) | 🆕 |
| Preisliste kopieren | Nicht explizit | ✅ (mit/ohne Überschreiben) | 🆕 |
| Prozentuale Preisanpassung | Nicht explizit | ✅ (% Anpassung, optional pro Artikelgruppe) | 🆕 |
| Mengenstaffel | Nicht explizit | ✅ (Ab-Menge pro Eintrag) | 🆕 |
| Massenimport (CSV/Tab) | Nicht explizit | ✅ (Textfeld-Import) | 🆕 |
| Gültigkeitszeitraum | Nicht explizit | ✅ (Gültig von/bis pro Liste und Eintrag) | 🆕 |

---

## 5. EINKAUF / BESTELLUNGEN

### 5.1 Bestellvorschläge

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Automatische Bestellvorschläge | ✅ (bei Mindestbestand-Unterschreitung) | ✅ (Nachbestellvorschläge-Seite) | ✅ |
| Checkbox → Bestellung aufgeben | ✅ (Button "Bestellen" für markierte) | ✅ ("Bestellung erstellen" für markierte) | ✅ |
| Bestellvorschläge pro Artikel aktualisieren | ✅ (Button im Artikelstamm) | Automatisch basierend auf aktuellem Bestand | ✅ |
| Lieferantenfilter | Nicht explizit | ✅ (Dropdown) | 🆕 |
| Automatisch separate Bestellungen pro Lieferant | Nicht explizit | ✅ | 🆕 |

### 5.2 Bestellungen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Bestellung anlegen | ✅ (Lieferant wählen + Positionen) | ✅ (Formular → Detailseite → Positionen) | ✅ |
| Status-Workflow | In Arbeit → Bestellt → Wareneingang | Entwurf → Bestellt → Teilweise geliefert → Vollständig geliefert | ✅+ |
| Stornierung | Nicht explizit | ✅ (aus Entwurf oder Bestellt) | 🆕 |
| Lieferant + Ansprechpartner | ✅ | ✅ (Kontaktperson Dropdown) | ✅ |
| Gewünschter Liefertermin | ✅ (Datum + KW + Jahr auto) | ✅ (Datum) | ✅ |
| Bestätigter Liefertermin | ✅ | ✅ | ✅ |
| Für alle Positionen übernehmen | ✅ (Button für Liefertermin-Übernahme) | Nicht dokumentiert | ⚠️ |
| Haupt- und Lieferadresse | ✅ (mit "Neu aus Adressdaten holen") | Nicht als separate Felder dokumentiert | ⚠️ Fehlt |
| Vorgangsnummer | ✅ (Verknüpfung Bestellung → Kundenvorgang) | Nicht dokumentiert bei Bestellungen | ⚠️ Fehlt |
| Bestellung abschicken (Telefon/Druck/Fax) | ✅ (Bestellmethode wählen, Ansprechpartner, Bemerkung) | ✅ (Bestellmethode: Telefon/E-Mail/Fax/Druck + Vermerk) | ✅ |
| Bestelldruck (Report) | ✅ (Button "Drucken", Report-Ausgabe) | ❌ Kein Bestelldruck/PDF dokumentiert | ❌ Mittlere Prio |

### 5.3 Bestellpositionen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Artikel aus Lieferanten-Katalog | ✅ (nur Artikel des Lieferanten) | ✅ (Suchfeld, Auto-Befüllung aus Lieferantenzuordnung) | ✅ |
| Freie Positionen (ohne Artikelstamm) | ✅ | ❌ Nur Artikel aus Stamm | ❌ Mittlere Prio |
| Text-Positionen | ✅ (z.B. Garantiehinweise) | ❌ Fehlt | ❌ Niedrige Prio |
| Text fett | ✅ | ❌ | ❌ Niedrige Prio |
| Neue Seite (Seitenumbruch) | ✅ | ❌ | ❌ Niedrige Prio |
| Stückzahl, Einzelpreis, Pauschalkosten, Gesamtpreis | ✅ | ✅ (Menge, Einzelpreis, Fixkosten, Gesamt) | ✅ |
| Einheit (Stunden/Stück + eigene) | ✅ | ✅ (automatisch aus Artikel) | ✅ |
| Artikel-Nr. Lieferant | ✅ | ✅ (auto aus Lieferantenzuordnung) | ✅ |
| Beschreibung | ✅ | Über Artikelbezeichnung | ✅ |
| Positionen umsortieren | ✅ (Buttons nach oben/unten) | ❌ Nicht dokumentiert | ⚠️ Prüfen |
| Schnellanlegen (Artikel sofort in Stamm) | ✅ | ❌ | ❌ Niedrige Prio |

**Gap-Detail — Freie Bestellpositionen:** ZMI erlaubt Positionen ohne Artikelstamm (z.B. für einmalige Sonderbestellungen). In Terp müssen alle Bestellpositionen einen Artikel aus dem Stamm referenzieren. → **Mittlere Priorität** für flexible Bestellungen.

**Gap-Detail — Bestelldruck/PDF:** ZMI kann Bestellungen als Report drucken und per Fax/E-Mail versenden. Terp hat keinen dokumentierten Bestelldruck als PDF. → **Mittlere Priorität** für den operativen Einkauf.

### 5.4 Terminüberwachung

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Terminüberwachung für Bestellungen | ✅ (eigenes Modul: offene Bestellungen mit Lieferterminen) | Über Bestellliste mit Statusfilter | ⚠️ Keine dedizierte Terminüberwachung |
| Fälligkeitsanzeige / Überfällig-Markierung | Nicht explizit | Nicht dokumentiert bei Bestellungen (nur bei Lieferantenrechnungen) | ⚠️ |

### 5.5 Wareneingang (Bestellungen buchen)

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Wareneingang über Softwareterminal | ✅ (PIN-Anmeldung, Lieferant → Bestellung → buchen) | ✅ (4-Schritte-Assistent: Lieferant → Bestellung → Mengen → Bestätigen) | ✅ |
| Teillieferungen | ✅ | ✅ (Status: Teilweise/Vollständig geliefert) | ✅ |
| Automatische Bestandsänderung | ✅ | ✅ | ✅ |
| Lagerbewegung protokolliert | ✅ (unter Lagerbewegungen) | ✅ (GOODS_RECEIPT in Bestandsbewegungen) | ✅ |

---

## 6. LIEFERANTENRECHNUNGEN

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Rechnung anlegen | ✅ (Lieferant + Bestellvorgang) | ✅ (Lieferant + optionale Bestellung) | ✅ |
| USt-ID/Steuernummer erforderlich | ✅ (Pflicht für Rechnungsanlage) | ✅ (Warnung + serverseitige Validierung) | ✅ |
| Rechnungsnummer (Lieferant) | ✅ | ✅ (manuell eingeben) | ✅ |
| Zahlungsbedingungen + Skonto (3 Zeilen) | ✅ (3 Skonto-Stufen) | ✅ (2 Skonto-Stufen) | ⚠️ Nur 2 statt 3 Stufen |
| Zahlungen erfassen (Bar/Bank) | ✅ | ✅ (Überweisung/Bar) | ✅ |
| Teilzahlungen | ✅ (Teilbetrag → Restbetrag als Skonto ausgleichen?) | ✅ | ✅ |
| Restbetrag als Skonto ausgleichen (Popup) | ✅ | Über Skonto-Checkbox bei Zahlung | ⚠️ Anderer Workflow |
| Zahlung stornieren | ✅ (Button "Zahlung stornieren") | ✅ | ✅ |
| Status: Offen / Teilzahlung / Bezahlt | ✅ | ✅ + Storniert | ✅+ |
| Zusammenfassungskarten (Offen/Überfällig/Bezahlt) | Nicht explizit | ✅ (3 KPI-Karten) | 🆕 |

---

## 7. VERKAUF / BELEGE

### 7.1 Belegtypen

| Belegtyp | ZMI | Terp | Status |
|----------|-----|------|--------|
| Angebot | ✅ (Typ 1) | ✅ (OFFER, A-) | ✅ |
| Auftragsbestätigung | ✅ (Typ 2) | ✅ (ORDER_CONFIRMATION, AB-) | ✅ |
| Lieferschein | ✅ (Typ 3) | ✅ (DELIVERY_NOTE, LS-) | ✅ |
| Rücklieferung | ✅ (Typ 4) | ✅ (RETURN_DELIVERY, R-) | ✅ |
| Rechnung | ✅ (Typ 5) | ✅ (INVOICE, RE-) | ✅ |
| Gutschrift | ✅ (Typ 6) | ✅ (CREDIT_NOTE, G-) | ✅ |
| Leistungsschein | ❌ | ✅ (SERVICE_NOTE, LN-) | 🆕 |

### 7.2 Belegkette / Fortführen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Beleg fortführen (höherrangig) | ✅ (z.B. AB → LS → Rechnung) | ✅ (definierte Regeln pro Belegtyp) | ✅ |
| Positionen automatisch übernehmen | ✅ | ✅ | ✅ |
| Positionen des Vorgängers übernehmen (Button) | ✅ ("Positionen des gewählten Belegs übernehmen") | Automatisch bei Fortführen | ✅ |
| Nach Druck nicht mehr änderbar | ✅ | ✅ (nach Abschließen/Festschreiben) | ✅ |
| Status-Workflow | Aktuell → Teilweise fortgeführt | Entwurf → Abgeschlossen → Fortgeführt → Storniert | ✅+ |
| Belegkette sichtbar | Nicht explizit als Ansicht | ✅ (Seitenleiste "Belegkette" auf Detailseite) | 🆕 |
| Beleg duplizieren | Nicht explizit | ✅ (Kopie als Entwurf, keine Verknüpfung) | 🆕 |
| Beleg stornieren | Nicht explizit | ✅ (mit Stornierungsgrund) | 🆕 |

### 7.3 Beleg-Kopfdaten

| Feld | ZMI | Terp | Status |
|------|-----|------|--------|
| Belegnummer (auto) | ✅ | ✅ | ✅ |
| Belegtyp | ✅ | ✅ | ✅ |
| Kunde + Ansprechpartner | ✅ | ✅ | ✅ |
| Vorgangsnummer + Bezeichnung | ✅ | ✅ (Anfrage-Verknüpfung) | ✅ |
| Auftragsdatum | ✅ | ✅ | ✅ |
| Belegdatum | ✅ | ✅ | ✅ |
| Lieferart + Lieferbedingungen | ✅ (mit Neuanlage) | ✅ (Freitext) | ✅ |
| Haupt-, Liefer-, Rechnungsadresse | ✅ (3 separate Tabs, "Neu aus Adressdaten holen") | ✅ (Lieferadresse + Rechnungsadresse) | ✅ |
| "Rechnung geht an anderen Kunden" | ✅ (Button) | Über abweichende Rechnungsadresse | ⚠️ Weniger explizit |
| Zahlungsbedingungen (aus Adressstamm) | ✅ | ✅ (vorbelegt, überschreibbar) | ✅ |
| "Wiederholt sich" (Wartungsverträge) | ✅ | ✅ (eigenes Modul: Wiederkehrende Rechnungen) | ✅+ |
| Versandkosten MwSt | ✅ (Dropdown MwSt-Satz) | ✅ (Versandkosten netto) | ✅ |
| Liefertermin | Nicht explizit im Beleg | ✅ | 🆕 |
| Skonto % + Skontotage | Nicht explizit im Beleg | ✅ (vorbelegt aus Kunde) | 🆕 |
| Bemerkungen / Interne Notizen | Nicht explizit | ✅ (2 Felder) | 🆕 |

### 7.4 Belegpositionen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Artikel aus Katalog (Suchen/Baum) | ✅ (Suchfunktion + Baumansicht nach Produktgruppen) | ✅ (Positionstyp "Artikel" mit Preislookup) | ✅ |
| Freie Positionen | ✅ (ohne Artikelstamm) | ✅ (Positionstyp "Freitext") | ✅ |
| Text-Positionen (ohne Preis) | ✅ | ✅ (Positionstyp "Textzeile") | ✅ |
| Text fett | ✅ | ❌ | ❌ Niedrige Prio |
| Neue Seite (Seitenumbruch) | ✅ | ✅ (Positionstyp "Seitenumbruch") | ✅ |
| Zwischensumme | Nicht explizit | ✅ (Positionstyp "Zwischensumme") | 🆕 |
| Stückzahl, Einzelpreis, Gesamtpreis | ✅ | ✅ (Menge, Einzelpreis, Pauschalkosten, MwSt) | ✅ |
| Rabatt pro Position | ✅ (über Rabattgruppe/Preisliste) | Nicht als separates Feld pro Position | ⚠️ Kein Positions-Rabatt |
| Schnellanlegen (Artikel sofort in Stamm) | ✅ | ❌ | ❌ Niedrige Prio |
| Positionen umsortieren (↑↓) | ✅ | ✅ (Drag-and-Drop + Pfeiltasten) | ✅+ |
| Preistyp (Standard/Richtpreis/Nach Aufwand) | Nicht explizit | ✅ | 🆕 |

### 7.5 Beleg drucken / abschließen

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Report drucken (PDF) | ✅ (Button "Drucken", danach gesperrt) | ✅ (PDF auto-generiert beim Abschließen) | ✅ |
| Nach Druck unveränderbar | ✅ | ✅ (nach Festschreiben) | ✅ |
| E-Mail-Versand | ✅ (aus Report heraus) | Nicht als integrierte Funktion dokumentiert | ⚠️ Kein Direkt-Versand |
| Auftrag in Zeiterfassung anlegen | ✅ (beim Drucken: Tätigkeitsgruppe + Sollstunden) | ✅ (beim Abschließen einer AB: Auftragsbezeichnung + Beschreibung) | ✅ |
| Aufgaben/Nachrichten vergeben | ✅ (nach Report, an Mitarbeiter für Projekt) | Über CRM-Aufgaben (manuell) | ⚠️ Nicht automatisch beim Abschließen |

### 7.6 E-Rechnung

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| ZUGFeRD / XRechnung | ❌ | ✅ (ZUGFeRD 2.x, EN 16931, CII-XML in PDF/A-3) | 🆕 |
| Leitweg-ID für B2G | ❌ | ✅ | 🆕 |
| XML separat downloadbar | ❌ | ✅ | 🆕 |

---

## 8. OFFENE POSTEN (VERKAUF)

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Übersicht unbezahlter Rechnungen | ✅ | ✅ (mit KPI-Karten) | ✅+ |
| Detailansicht pro Rechnung | ✅ (Doppelklick) | ✅ (Klick → Detailseite) | ✅ |
| "Rechnung aufrufen" Button | ✅ | ✅ (Link zur Belegdetailseite) | ✅ |
| Zahlung erfassen (Bar/Bank) | ✅ | ✅ (Überweisung/Bar) | ✅ |
| Teilzahlungen | ✅ | ✅ | ✅ |
| Skonto (2 Stufen) | ✅ (in Zahlungsbedingungen) | ✅ (Checkbox mit automatischer Berechnung) | ✅ |
| Skonto: Restbetrag als Skonto ausgleichen | ✅ (Popup beim Speichern) | Über Skonto-Checkbox | ⚠️ |
| Zahlung stornieren / löschen | ✅ (stornieren + rotes X zum Löschen) | ✅ (stornieren mit optionalem Grund) | ✅ |
| Status: Offen / Teilzahlung / Bezahlt | ✅ | ✅ + Überfällig + Überzahlt | ✅+ |
| Fälligkeitsdatum berechnet | ✅ (Datum oder Tage) | ✅ (Rechnungsdatum + Zahlungsziel) | ✅ |
| Gutschriften reduzieren offenen Posten | Nicht explizit | ✅ (automatisch bei verknüpfter Gutschrift) | 🆕 |
| Überfällig-Markierung | Nicht explizit | ✅ (rote Hervorhebung + Badge) | 🆕 |

---

## 9. WORKFLOW / AUFGABENDEFINITION

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Aufgabengruppen definieren | ✅ (Nummer + Bezeichnung, Schema empfohlen) | Über CRM-Aufgaben (kein separates "Aufgabengruppen"-Modul) | ⚠️ Anderer Ansatz |
| Aufgaben zu Gruppen zuordnen | ✅ | Über Anfrage-Verknüpfung | ⚠️ |
| Nachricht an Teams (aus ZMI-Time) | ✅ (Teams aus Time übernommen) | ✅ (CRM-Aufgaben + Mitarbeiternachrichten) | ✅ |
| Typ: Aufgabe vs. Nachricht | ✅ | ✅ (Umschalter Aufgabe/Nachricht) | ✅ |
| "Fällig nach x Tage nach Liefertermin" | ✅ | ❌ (nur absolutes Fälligkeitsdatum) | ❌ Niedrige Prio |
| InfoCenter-Integration | ✅ (Nachrichten erscheinen im InfoCenter) | ✅ (Terp-Benachrichtigungssystem) | ✅ |

---

## 10. AUSWERTUNGEN

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Belege nach Zeitraum | ✅ (Belegdatum, Auftragsdatum, Lieferschein) | ✅ (Belegliste mit Filtern) | ✅ |
| Adressen-Übersicht | ✅ | ✅ (CRM Auswertungen → Adress-Statistik) | ✅+ |
| Ansprechpartner-Liste | ✅ (mit zugehöriger Firma) | Über CRM Adressen → Tab Kontakte | ⚠️ Keine globale Ansprechpartner-Liste |
| Anfragen-Übersicht (aktuell/alle) | ✅ | ✅ (CRM Auswertungen → Anfragen-Pipeline) | ✅+ |
| Kundendienste-Übersicht | ✅ (aktuell/alle) | ✅ (Kundendienstliste mit Statusfilter) | ✅ |
| Korrespondenz nach Zeitraum | ✅ | ✅ (CRM Auswertungen → Korrespondenz-Bericht mit Diagrammen) | ✅+ |
| Aufgaben-Auswertung | Nicht explizit | ✅ (CRM Auswertungen → Erledigungsquote, Dauer, pro Mitarbeiter) | 🆕 |
| KPI-Dashboard | ❌ | ✅ (Adressen gesamt, offene Anfragen, offene Aufgaben, Korrespondenz) | 🆕 |

**Gap-Detail — Globale Ansprechpartner-Liste:** ZMI hat eine Auswertung, die alle Ansprechpartner aller Adressen mit zugehöriger Firma auflistet. Terp zeigt Ansprechpartner nur pro Adresse. → **Niedrige Priorität**, aber nützlich für Vertrieb.

---

## 11. TIMEBOY / HARDWARE-TERMINAL

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Hardware-Terminal (Timeboy) für Lagerbuchungen | ✅ (mobiles Gerät: PIN-Anmeldung, F-Tasten) | Kein physisches Gerät — Web-basierte Terminals | ⚠️ Anderer Ansatz |
| Lagerzugang über Terminal | ✅ (Bestell-Nr. → Position → Stückzahl) | ✅ (Wareneingangs-Terminal: 4-Schritte-Assistent) | ✅ |
| Packliste (Lagerabgang pro Lieferschein) | ✅ (Packlisten-Nr. → Artikel → Stückzahl) | Über Entnahme-Terminal mit Referenz "Lieferschein" | ✅ |
| Lagerabgang (pro Auftrag) | ✅ (ZMI-Time Auftragsnummer) | ✅ (Entnahme-Terminal mit Referenz "Auftrag") | ✅ |
| Storno am Terminal | ✅ (F4-Taste, PIN-Verifizierung) | ✅ (Storno-Button im Verlauf) | ✅ |
| Barcode/RFID scannen | ✅ (Barcode/RFID-Knopf am Timeboy) | Über RFID-Karten im Zutrittskontrollsystem | ⚠️ Nicht im Lager-Kontext |
| Docking-Station → Daten übertragen | ✅ (physisch per Docking) | Echtzeit (Web-basiert) | ✅+ |
| Inventur über Terminal | ✅ (Daten einlesen → in Warenwirtschaft übernehmen → Bestand anpassen) | ❌ Kein Inventur-Modul | ❌ Mittlere Prio |

**Gap-Detail — Inventur:** ZMI hat eine vollständige Inventurfunktion: Inventurdaten werden am Timeboy erfasst, in die Warenwirtschaft übertragen und dort manuell übernommen (Sicherheitsschritt). Der Bestand wird automatisch angepasst. In Terp fehlt ein dediziertes Inventurmodul. Bestandskorrekturen sind nur einzeln pro Artikel möglich. → **Mittlere Priorität** — besonders für Pro-Di relevant als Mercedes-Zulieferer.

---

## 12. INTEGRATION WARENWIRTSCHAFT ↔ ZEITERFASSUNG

| Funktion | ZMI | Terp | Status |
|----------|-----|------|--------|
| Anfrage → Auftrag in Zeiterfassung | ✅ (Button "Auftrag erstellen" → ZMI-Time) | ✅ (Auftragsverknüpfung) | ✅ |
| Beleg drucken → Auftrag in Zeiterfassung | ✅ (beim Drucken: Tätigkeitsgruppe + Sollstunden) | ✅ (beim Abschließen einer AB) | ✅ |
| Kundendienst → Auftrag in Zeiterfassung | ✅ (konfigurierbar: automatisch bei Anlage) | ✅ (Button "Auftrag erstellen") | ✅ |
| Lagerentnahme auf Auftragsnummer | ✅ (aus Zeiterfassung) | ✅ (Entnahme-Terminal: Referenz "Auftrag") | ✅ |
| Mitarbeiter aus Zeiterfassung übernehmen | ✅ (aus ZMI-Time automatisch) | Terp = ein System — Mitarbeiter sind bereits zentral | ✅+ |
| Teams aus Zeiterfassung | ✅ (aus ZMI-Time) | Zentral in Terp | ✅+ |

---

## ZUSAMMENFASSUNG

### Was Terp MEHR kann als ZMI:

| Feature | Beschreibung |
|---------|-------------|
| 🆕 E-Rechnung (ZUGFeRD/XRechnung) | Maschinenlesbare Rechnungen — ab 2027 Pflicht |
| 🆕 Wiederkehrende Rechnungen | Templates mit Auto-Generierung (Cron) |
| 🆕 Preislisten: Kopieren, %-Anpassung, Mengenstaffel, Massenimport | Umfangreiche Preislistenverwaltung |
| 🆕 Leistungsschein (Belegtyp) | Separater Belegtyp für Dienstleistungen |
| 🆕 Zwischensumme als Positionstyp | Für übersichtliche Belege |
| 🆕 Belegkette-Ansicht | Visuelle Darstellung der Belegkette |
| 🆕 Beleg stornieren + duplizieren | Flexible Belegverwaltung |
| 🆕 Offene Posten: KPIs, Überfällig-Markierung, Gutschriftverrechnung | Professionelle Debitorenverwaltung |
| 🆕 CRM-Auswertungen (Dashboard, Diagramme) | KPIs, Anfragen-Pipeline, Aufgaben-Analyse |
| 🆕 Aufgaben: "Meine Aufgaben", Lese-Status, Wieder öffnen | Modernes Aufgabenmanagement |
| 🆕 Anfragen: Wieder öffnen, Kontakt-Verknüpfung, Beleg-Tab | Flexibler Workflow |
| 🆕 Lieferantenrechnungen: KPI-Karten, Stornierung | Bessere Übersicht |
| 🆕 Nachbestellvorschläge: Lieferantenfilter, Auto-Split | Intelligenterer Einkauf |
| 🆕 Standardpreisliste als Fallback | Automatische Preisermittlung |
| 🆕 Bestandsführung ein/aus pro Artikel | Flexible Lagerverwaltung |
| 🆕 Mandantenfähigkeit | Mehrere Firmen in einer Installation |
| 🆕 Moderne Web-UI | Responsive, Echtzeit, Multi-Device |
| 🆕 Vollständige Zeiterfassung integriert | Kein separates System nötig (vs. ZMI-Time) |
| 🆕 DATEV-Export, Berichte, Flexzeitkonto | Professionelle Lohnvorbereitung |
| 🆕 Schichtplanung mit Planungstafel | Visuell, Drag-and-Drop |
| 🆕 Zutrittskontrolle | Zonen, Profile, RFID-Karten |
| 🆕 Audit-Protokoll | Lückenlose Nachvollziehbarkeit |

### Was Terp FEHLT gegenüber ZMI (priorisierte Gaps):

#### Hohe Priorität
*(keine — alle Kernfunktionen sind abgedeckt)*

#### Mittlere Priorität
| Gap | ZMI-Referenz | Beschreibung |
|-----|-------------|-------------|
| Inventur-Modul | Kap. 9.3 | Masseninventur mit Übernahme-Workflow (nicht nur Einzelkorrekturen) |
| Automatische Lagerbuchung bei Lieferschein | Einstellungen Belege | Beim Abschließen eines LS automatisch Bestand reduzieren |
| Artikelreservierungen bei AB | Kap. 2.4.6 | Artikel bei Auftragsbestätigung reservieren (verfügbar vs. reserviert) |
| Bestelldruck (PDF) | Kap. 3.2 | Bestellung als PDF generieren und drucken/versenden |
| Freie Bestellpositionen | Kap. 3.2 | Positionen ohne Artikelstamm in Bestellungen |
| "Unsere Kundennummer" beim Lieferanten | Kap. Lieferant | Eigene Kd-Nr. beim Lieferanten hinterlegen (für Bestelldruck) |
| Anhänge bei Korrespondenz | Kap. 2.3.4 | Dateien (PDF, Bilder) an Korrespondenzeinträge anhängen |
| Briefanrede bei Kontaktpersonen | Kap. 2.3.2 | Für Reports und Belege mit persönlicher Anrede |
| Konzern-/Filialen-Zuordnung | Kap. Adressen | Firmenverbund abbilden für Auswertungen |
| Korrekturassistent für Warenwirtschaft | Kap. 2.2 | Doppelte Wareneingänge, negative Bestände erkennen |
| Artikelbilder | Kap. 2.4.1 | Mehrere Bilder pro Artikel hinterlegen |

#### Niedrige Priorität
| Gap | Beschreibung |
|-----|-------------|
| Postfach-Felder bei Adressen | PLZ Postfach + Postfach |
| Titel bei Kontaktpersonen | Dr., Prof. etc. |
| 2. Telefonnummer bei Adressen und Kontakten | Nur 1 Telefonfeld statt 2 |
| Mobil/Handy bei Kontaktpersonen | Separates Feld |
| Geburtstag + Geburtstagsliste | Bei Kontaktpersonen |
| Benutzer-Kürzel/Präfix | Im Benutzerstamm |
| Jahr in Belegnummer | Automatisch kodiert |
| Feldlängen konfigurierbar | Für Memofelder |
| Zeichnungsnummern bei Artikeln | Optionale Anzeige |
| Min/Max Bestellmenge im Artikel | Bestellgrenzen |
| Text fett in Positionen | Fettdruck-Option |
| Schnellanlegen (Artikel aus Beleg/Bestellung) | Sofort in Stamm übernehmen |
| Fällig nach x Tage nach Liefertermin | Bei Aufgaben relativ zum Liefertermin |
| Globale Ansprechpartner-Liste | Alle Kontakte aller Adressen |
| "Keine MwSt" Checkbox bei Adresse | Für EU-Kunden/Lieferanten |
| Interessenten-Status | Adresse ohne Kundennummer |
| Karte/Map-Server Integration | Adresse auf Karte anzeigen |
| Barcode-Scanning im Lager | Artikel per Barcode erfassen |
| Gutschrift = gleicher Nummernkreis wie Rechnung | Optionale Einstellung |
| 3. Skonto-Stufe bei Lieferantenrechnungen | ZMI hat 3, Terp hat 2 |
