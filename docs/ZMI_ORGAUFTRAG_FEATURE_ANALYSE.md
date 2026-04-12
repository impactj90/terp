# ZMI orgAuftrag — Feature-Analyse für Terp CRM/Orders Modul
*Erstellt aus dem Benutzerhandbuch ZMI orgAuftrag V1.3 (Stand März 2009)*
*Zweck: Grundlage für Ticket-Erstellung und Implementierung in Terp*

---

## Kontext

Pro-Di GmbH nutzt ZMI orgAuftrag als aktuelle Warenwirtschafts- und CRM-Software.
Das System ist eng mit ZMI-Time (Zeiterfassung) verknüpft — genau wie Terp es sein wird.
Priorität für Terp: **CRM + Orders** (Prio 1), Lager (Prio 2).

---

## Übersicht: Module von ZMI orgAuftrag

| Modul | Beschreibung | Priorität für Terp |
|-------|-------------|-------------------|
| Adressverwaltung | Kunden, Lieferanten, Ansprechpartner | 🔴 Prio 1 — CRM |
| Vorgänge / Anfragen | Kundenanfragen, Vorgangsverwaltung | 🔴 Prio 1 — CRM |
| Kundendienst | Serviceaufträge, Reklamationen | 🔴 Prio 1 — Orders |
| Belege | Angebot → AB → Lieferschein → Rechnung | 🔴 Prio 1 — Orders |
| Offene Posten | Unbezahlte Rechnungen | 🔴 Prio 1 — Orders |
| Workflow | Aufgaben und Nachrichten an Teams | 🔴 Prio 1 — CRM |
| Korrespondenz | E-Mail/Telefon-Protokoll pro Adresse | 🔴 Prio 1 — CRM |
| Artikelstamm | Artikel, Preise, Stücklisten | 🟡 Prio 2 — Lager |
| Einkauf / Bestellungen | Bestellvorschläge, Bestellvorgänge | 🟡 Prio 2 — Lager |
| Lager | Wareneingänge, -ausgänge, Inventur | 🟡 Prio 2 — Lager |
| Auswertungen | Berichte zu Belegen, Adressen, Anfragen | 🔴 Prio 1 |

---

## 1. ADRESSVERWALTUNG (CRM — Stammdaten)

### 1.1 Adressdatensatz

Jede Adresse (Kunde oder Lieferant) hat folgende Felder:

**Tab: Adresse**
- Firmenname
- Straße, PLZ, Ort, Land
- Telefon, Fax, E-Mail, Internet
- Kundennummer (automatisch vergeben, konfigurierbar per Nummernkreis)
- Match-Code (Suchkürzel)
- Kundentyp: Kunde / Lieferant / beides
- Zahlungsbedingungen (Standard für neue Belege)
- Steuernummer / Umsatzsteuer-ID (Pflicht für Lieferantenrechnungen)
- Rabattgruppe
- Notizen / Memo

**Tab: Ansprechpartner**
- Beliebig viele Ansprechpartner pro Adresse
- Vorname, Nachname, Position
- Direkte Telefonnummer, E-Mail
- Abteilung

**Tab: Bankverbindung**
- IBAN, BIC, Kontoinhaber
- Mehrere Bankverbindungen möglich

**Tab: Korrespondenz**
Alle Kommunikation mit dieser Adresse (siehe Abschnitt 1.3)

**Tab: Anfragen**
Alle Anfragen/Vorgänge die zu dieser Adresse gehören

**Tab: Kundendienst**
Alle Servicevorgänge zu dieser Adresse

**Tab: Bestellungen**
Alle Bestellungen bei diesem Lieferanten

**Tab: Belege**
Alle Angebote, Lieferscheine, Rechnungen für diesen Kunden

**Tab: Aufgaben**
Alle Aufgaben und Nachrichten die mit dieser Adresse verknüpft sind

### 1.2 Nummernkreise

Konfigurierbar in den Systemeinstellungen:
- Lieferantennummern z.B. ab 70000
- Kundennummern z.B. ab 20000
- Belegnummern: 1. Stelle = Belegart, 2-3. Stelle = Jahr, Rest = fortlaufend
  - 1 = Angebot
  - 2 = Auftragsbestätigung
  - 3 = Lieferschein
  - 4 = Rücklieferung
  - 5 = Rechnung
  - 6 = Gutschrift
  - 9 = Vorgänge

### 1.3 Korrespondenz (Kommunikationsprotokoll)

Pro Adresse wird jede Kommunikation protokolliert:

**Felder:**
- Typ: Eingang / Ausgang / Intern
- Kommunikationstyp (frei definierbar: Telefon, E-Mail, Brief, Fax, Besuch)
- Datum und Uhrzeit
- Ansprechpartner (der Gegenseite)
- Verknüpfter Vorgang (optional)
- Absender und Empfänger (intern)
- Nachrichtentext / Memo
- Anhänge (Bilder, PDFs, Dokumente — auch Scan-Funktion)

**Suche:**
- Volltext in Betreff und Memo
- Fragezeichen vor Suchbegriff = Suche in Mitte des Textes

---

## 2. VORGÄNGE / ANFRAGEN (CRM — Vertriebssteuerung)

### 2.1 Was ist ein Vorgang?

Ein Vorgang ist die übergeordnete Klammer für alle Aktivitäten mit einem Kunden.
Belege, Anfragen, Kundendienste, Korrespondenz und Aufgaben werden einem Vorgang zugeordnet.
Ein Vorgang hat eine eindeutige Vorgangsnummer und eine Bezeichnung.

**Vorgangsstatus:**
- In Arbeit
- Abgeschlossen
- Storniert

### 2.2 Anfragen

Kundenanfragen die noch nicht in Aufträge umgewandelt wurden.

**Felder:**
- Vorgangsbezeichnung (Pflicht)
- Vorgangsnummer (automatisch, konfigurierbar)
- Aufwand (Dropdown, voreinstellbar)
- Zahlungsfähigkeit des Kunden
- Notizen
- Verknüpfter Vorgang

**Aktionen:**
- Abschließen: Anfrage wird aus der aktiven Übersicht entfernt. Nur noch in Auswertungen einsehbar.
- Optional: Den verknüpften Vorgang mit abschließen
- Auftrag in ZMI-Time erstellen (= Übergabe an Zeiterfassung)

**Wichtig für Terp:**
In ZMI funktioniert die Verknüpfung Anfrage → Auftrag in ZMI-Time → Zeiterfassung.
In Terp ist diese Verknüpfung bereits vorhanden (Aufträge in Terp = Zeiterfassung auf Aufträge).

---

## 3. KUNDENDIENST / SERVICE (Orders)

### 3.1 Serviceauftrag anlegen

Kundendienstvorgänge sind Serviceaufträge — z.B. Wartung, Reparatur, Einsatz beim Kunden.

**Felder:**
- Vorgangsbezeichnung (Pflicht)
- Gemeldet-am-Datum (automatisch = heute)
- Vorgangsnummer (automatisch)
- Kunde auf Kosten hingewiesen (Ja/Nein)
- Zuständiger Ansprechpartner (intern)
- Detailbeschreibung / Memo
- Verknüpfter Vorgang (übergeordnete Vorgangsnummer)

### 3.2 Kundendienst-Workflow

```
Neu anlegen → In Bearbeitung → Abschließen → Rechnung erstellen
```

**Abschließen:**
- Abschlussgrund auswählen (frei definierbar)
- Nach Abschluss: Vorgang wird nach Verkauf → Kundendienst kopiert
- Dort kann eine Rechnung für den Kundendienst erstellt werden
- ⚠️ Nach Abschluss nicht mehr änderbar

**Rechnung aus Kundendienst:**
Über Verkauf → Kundendienst kann für den abgeschlossenen Serviceauftrag eine Rechnung erstellt werden.

---

## 4. BELEGE — VERKAUF (Orders — Kernprozess)

### 4.1 Belegarten und Workflow

```
Angebot → Auftragsbestätigung → Lieferschein → Rechnung → (Gutschrift)
```

- Ein Beleg kann immer nur in einen **höherrangigen** Beleg umgewandelt werden (Fortführen)
- Aus einer Rechnung kann kein Angebot gemacht werden
- Positionen können aus vorherigen Belegen übernommen werden

**Belegstatus:**
- In Arbeit (noch nicht gedruckt, bearbeitbar)
- Aktuell
- Teilweise fortgeführt
- Fortgeführt/Abgeschlossen

⚠️ **Nach dem Drucken ist ein Beleg nicht mehr bearbeitbar.**

### 4.2 Neuen Beleg anlegen

**Kopfdaten (Tab: Allgemein):**
- Belegart (Angebot / AB / Lieferschein / Rechnung / Gutschrift / Rücklieferung)
- Belegnummer (automatisch per Nummernkreis)
- Kunde (aus Adressstamm)
- Ansprechpartner (des Kunden)
- Vorgang (Vorgangsnummer und -bezeichnung)
- Auftragsdatum (wann der Auftrag einging)
- Belegdatum (wann der Beleg erstellt wurde)
- Lieferart (Dropdown, frei definierbar)
- Lieferbedingungen (Dropdown, frei definierbar)
- Haupt- und Lieferadresse (aus Adressstamm, aktualisierbar)
- Rechnungsadresse (kann abweichen — z.B. bei Wiederverkäufern)
- Zahlungsbedingungen (aus Adressstamm vorbelegt, änderbar)
- Versandkosten MwSt (Steuersatz für Versandkosten)
- Wiederholt sich (für Wartungsvertragsrechnungen)

### 4.3 Positionen hinzufügen

Pro Beleg können hinzugefügt werden:
- **Artikel** (aus Artikelstamm)
- **Freie Position** (ohne Artikelstamm, manuelle Eingabe)
- **Textfeld** (reine Beschreibungszeile, kein Preis)
- **Seitenumbruch** (für mehrseitige Belege)
- **Zwischensumme** (manuell eingetragen, wird nicht zum Rechnungsbetrag addiert)

**Felder pro Position:**
- Artikelnummer (aus Stamm oder frei)
- Bezeichnung / Beschreibung
- Menge (Stück)
- Einheit (Stück, Stunden, kg, etc. — frei definierbar)
- Einzelpreis (netto, aus Artikelstamm vorbelegt, änderbar)
- Pauschalkosten (Zusatzkosten)
- Gesamtpreis (automatisch berechnet: Menge × Einzelpreis + Pauschalkosten)
- Preistyp: Standardpreis / Richtpreis / Nach Aufwand
- MwSt-Satz (pro Position wählbar)
- Liefertermin gewünscht / bestätigt

**Suchfunktionen beim Hinzufügen:**
- Suche: Artikel nach Nummer oder Bezeichnung suchen
- Baum: Artikel nach Produktgruppen durchsuchen (gut für Angebote mit Alternativen)
- Schnellanlegen: Neuen Artikel direkt im Beleg anlegen (wird automatisch in Artikelstamm übernommen)

### 4.4 Beleg ausgeben / drucken

- **Drucken**: PDF-Report generieren
- **E-Mail**: Beleg direkt per E-Mail versenden
- **Nach dem Drucken**: Beleg kann nicht mehr geändert werden

**Bei Drucken — Übergabe an Zeiterfassung (in ZMI = ZMI-Time, in Terp = Terp Aufträge):**
- Tätigkeitsgruppe auswählen
- Sollstunden vergeben
- Kategorie: produktiv / unproduktiv
- → Auftrag wird in Zeiterfassung angelegt
- Mitarbeiter können dann Zeit auf diesen Auftrag buchen

**Nach dem Drucken — Aufgaben vergeben:**
- Nachrichten/Aufgaben an zuständige Mitarbeiter schicken

### 4.5 Beleg fortführen (Belegkette)

Nach dem Drucken kann ein Beleg fortgeführt werden:
- Angebot → Auftragsbestätigung
- Auftragsbestätigung → Lieferschein
- Lieferschein → Rechnung

Die Positionen werden übernommen, können aber angepasst werden.

### 4.6 Wiederkehrende Rechnungen

Für Wartungsverträge: Rechnungen können als "wiederholt sich" markiert werden.
→ Relevant für Terp Wartungsverträge!

---

## 5. OFFENE POSTEN (Orders — Zahlungsverfolgung)

Übersicht aller noch nicht bezahlten Rechnungen.

### 5.1 Übersicht

- Liste aller offenen Rechnungen
- Status: Offen / Teilzahlung / Bezahlt
- Doppelklick → Detailansicht

### 5.2 Zahlung erfassen

Pro Rechnung können Zahlungen erfasst werden:

**Felder:**
- Datum der Zahlung
- Betrag (vorbelegt mit offenem Betrag, änderbar für Teilzahlungen)
- Zahlungstyp: Bar/Kasse oder Bank

**Teilzahlung:**
- Restbetrag kann als Skonto verbucht werden oder offen bleiben
- Bei offenem Restbetrag: Status = Teilzahlung
- Rechnung bleibt in der Übersicht bis vollständig bezahlt

**Stornieren:**
- Falsch erfasste Zahlung kann storniert werden

### 5.3 Zahlungsbedingungen

Pro Rechnung:
- Fälligkeitsdatum (Datum oder Tage — wird automatisch umgerechnet)
- Skonto: mehrere Stufen möglich (z.B. 2% bei Zahlung binnen 6 Tagen, sonst 14 Tage netto)

---

## 6. WORKFLOW (CRM — Aufgaben & Nachrichten)

### 6.1 Aufgabendefinition

Vordefinierte Aufgabengruppen und -vorlagen die automatisch ausgelöst werden können:

**Aufgabengruppen:**
- Nummeriert (z.B. 210, 220, 230...)
- Name / Bezeichnung

**Aufgaben pro Gruppe:**
- Typ: Nachricht oder Aufgabe
- Team / Mitarbeiter als Empfänger
- Betreff
- Nachrichtentext
- Bei Aufgabe zusätzlich: "Fällig nach X Tagen nach Liefertermin"

### 6.2 Manuelle Aufgaben & Nachrichten

Direkt aus einem Adressdatensatz oder einem Beleg können Aufgaben und Nachrichten erstellt werden:

**Felder Aufgabe:**
- Fällig am / bis Uhrzeit / Dauer
- Aufgabenstatus (frei definierbar)
- Verknüpfte Adresse
- Verknüpfter Ansprechpartner
- Verknüpfter Vorgang
- Empfänger: ein oder mehrere Mitarbeiter / ganzes Team
- Betreff
- Beschreibung
- Anhänge (Bilder, Dokumente)

**Felder Nachricht:**
- Vereinfacht: Adresse, Ansprechpartner, Vorgang, Empfänger, Betreff, Text

**Wichtig:** In ZMI muss das Info-Center geöffnet sein — in Terp läuft das über das bestehende Benachrichtigungssystem.

---

## 7. AUSWERTUNGEN (Berichte)

### 7.1 Verkauf
- Belege nach Zeitraum filtern (nach Belegdatum oder Auftragsdatum)
- Lieferscheindatum als weiterer Filter

### 7.2 Adressen
- Alle angelegten Adressen in der Übersicht

### 7.3 Ansprechpartner
- Alle Ansprechpartner mit zugehöriger Firma

### 7.4 Anfragen
- Alle / nur aktuelle Anfragen

### 7.5 Kundendienste
- Alle / nur aktuelle Servicevorgänge

### 7.6 Korrespondenz
- Korrespondenzeinträge nach Zeitraum

---

## 8. ARTIKELSTAMM (Prio 2 — Lager)

### 8.1 Artikelstruktur

Hierarchisch in Artikelgruppen / Produktgruppen organisiert (Baumansicht).

**Pflichtfelder:**
- Artikelnummer (automatisch per Nummernkreis)
- Bezeichnung
- Artikelgruppe

**Tab: Detail**
- Artikelnummer, Bezeichnung
- Beschreibung Auswahl (Zubehör-Beschreibung)
- Beschreibung Individuell (weitere Merkmale)
- Bilder (mehrere möglich)

**Tab: Allgemein**
- Verkaufspreis (netto)
- Grundeinheit (Stück, kg, etc.)
- Match-Code
- Produktgruppe
- Rabattgruppe
- MwSt-Satz
- Bestellart

**Tab: Lieferant**
- Mehrere Lieferanten pro Artikel möglich
- Pro Lieferant: Artikelnummer beim Lieferanten, Hauptlieferant-Flag, Bezeichnung, Bestelleinheit, Lieferzeit (Tage), Standard-Bestellmenge, Memo

**Tab: Stückliste**
- Artikelbaugruppen aus mehreren Einzelartikeln
- Verwendung: z.B. Reparaturteil das aus 3 Einzelteilen besteht

**Tab: Lager**
- Lagerzuordnung
- Aktueller Bestand
- Bestandskorrektur (manuell)
- Mindestbestand für automatische Bestellvorschläge
- Bestandsüberwachung aktivieren/deaktivieren

**Tab: Reservierungen**
- Reservierte Artikel aus Auftragsbestätigungen
- Zeigt: Kunde, Menge, geplantes Lieferdatum

**Tab: Lagerbewegungen**
- Historische Auflistung aller Ein- und Ausgänge
- Automatisch bei Terminal-Buchungen
- Manuell einträglich (ändert aber nicht den Bestand)
- Zeigt: Wer, Wann, Was, Welche Menge, Welche Bestellnummer

**Tab: Bestellungen**
- Offene Bestellungen bei Lieferanten für diesen Artikel

**Tab: Bestellvorschläge**
- Automatisch generierte Bestellvorschläge wenn Mindestbestand unterschritten

**Tab: Preise**
- Verschiedene Preisebenen (Preislisten)

### 8.2 Gelöschte Artikel

- Artikel werden nicht wirklich gelöscht sondern als "gelöscht" markiert
- Können wiederhergestellt werden
- Endgültiges Löschen nur wenn keine Belege mehr vorhanden

---

## 9. EINKAUF (Prio 2 — Lager)

### 9.1 Bestellvorschläge

Automatisch generiert wenn:
- Bestandsüberwachung aktiviert
- Lagerbestand unter Mindestbestand fällt

Bestellvorschlag kann direkt in Bestellung umgewandelt werden.

### 9.2 Bestellungen

**Kopfdaten:**
- Lieferant (aus Adressstamm)
- Vorgangsnummer
- Liefertermin gewünscht

**Positionen:**
- Artikel (aus Artikelstamm)
- Menge
- Einzelpreis
- Pauschalkosten
- Gesamtpreis (automatisch)
- Einheit
- Artikel-Nummer beim Lieferanten
- Bezeichnung / Beschreibung
- Gewünschter Liefertermin
- Bestätigter Liefertermin (vom Lieferanten)

**Bestellung abschicken:**
- Telefonisch (mit Datum, Ansprechpartner, Bemerkung)
- Drucken und faxen
- Nach Abschluss: Status = Bestellt

### 9.3 Wareneingang buchen

Über Terminal (Software-Terminal oder Hardware-Terminal):
1. Lieferant auswählen
2. Bestellnummer eingeben
3. Positionen und Mengen buchen
4. Bestand wird automatisch aktualisiert
5. Status in Artikelstamm → Lagerbewegungen: Wareneingang vermerkt

### 9.4 Terminüberwachung

Übersicht offener Bestellungen mit Lieferterminen — für Nachverfolgung ob Ware rechtzeitig kommt.

### 9.5 Lieferantenrechnungen

**Felder:**
- Lieferant
- Verknüpfte Bestellung
- Zahlungsbedingungen (Fälligkeitsdatum oder Tage)
- Skonto (mehrere Stufen: z.B. 2% bei 6 Tagen, sonst 14 Tage netto)
- Zahlungen erfassen (Bar oder Bank, Teilzahlungen möglich)
- Status: Offen / Teilzahlung / Bezahlt

⚠️ Lieferantenrechnungen nur möglich wenn Steuernummer oder Umsatzsteuer-ID beim Lieferanten hinterlegt.

---

## 10. LAGER — TERMINAL-BUCHUNGEN (Prio 2)

### 10.1 Lagerentnahmen (Software-Terminal)

Artikel aus dem Lager ausbuchen über:
- **Auftrag**: Auftragsnummer aus Zeiterfassung (= Terp Auftrag)
- **Packliste**: Lieferscheinnummer
- **Maschine**: Maschinen-ID

Felder: Artikel-Nr., Bezeichnung, Menge
Stornierung möglich.

### 10.2 Hardware-Terminal (Timeboy)

Mobiles Handheld-Gerät für Lagerbuchungen:
- Anmeldung per PIN
- Lagerzugang (F3): Bestellnummer → Position → Menge
- Lagerabgang (F1): Auftragsnummer → Artikel → Menge
- Packliste (F2): Packlistennummer → Artikel → Menge
- Storno (F4)
- Barcode/RFID-Scan möglich

Daten werden über Docking-Station übertragen (konfigurierbar: manuell, täglich, wöchentlich, alle X Minuten).

### 10.3 Inventur

- Buchung über Timeboy oder manuell
- Inventurbuchungen werden erst in einer Liste gespeichert
- Müssen explizit übernommen werden (Sicherheitsschritt)
- Bestand wird erst nach Übernahme aktualisiert
- Historisch in Lagerbewegungen einsehbar

---

## 11. SYSTEMEINSTELLUNGEN

### 11.1 Nummernkreise
- Startpunkte für Kunden-, Lieferanten- und Belegnummern
- Gutschriften können denselben Nummernkreis wie Rechnungen verwenden

### 11.2 MwSt-Sätze
- Standard-Mehrwertsteuersatz
- Weitere Steuersätze anlegbar

### 11.3 Eigene Adresse
- Firmendaten für Briefköpfe

### 11.4 Zahlungsbedingungen
- Vorlagen für Zahlungsbedingungen die in Adressen und Belegen verwendet werden

### 11.5 Einstellungen Belege
- Sofortrechnungen erlauben
- Zeichnungsnummern bei Artikeln anzeigen
- Lagerbuchungen bei Lieferschein:
  - Nur drucken bei vorhandener Lagerbuchung
  - Nachfrage bei fehlenden Lagerbuchungen
  - Automatische Lagerbuchung bei Lieferschein
- Einkaufspreis der verwendet werden soll
- Lieferscheinnummer bei Rechnung anzeigen

---

## 12. INTEGRATION MIT ZEITERFASSUNG (Wichtig für Terp!)

ZMI orgAuftrag ist eng mit ZMI-Time (Zeiterfassung) verknüpft:

| Aktion in orgAuftrag | Wirkung in ZMI-Time / Terp |
|---------------------|--------------------------|
| Anfrage anlegen | → Auftrag in Zeiterfassung anlegen möglich |
| Beleg drucken | → Auftrag in Zeiterfassung anlegen, Sollstunden vergeben |
| Kundendienst abschließen | → Auftrag in Zeiterfassung |
| Lagerentnahme | → Verknüpft mit Auftragsnummer aus Zeiterfassung |
| Mitarbeiter | → Werden aus ZMI-Time übernommen (in Terp: bereits vorhanden) |
| Teams | → Werden aus ZMI-Time übernommen (in Terp: bereits vorhanden) |

**Für Terp bedeutet das:**
- Wenn ein Beleg/Auftrag erstellt wird → automatisch Terp-Auftrag anlegen
- Mitarbeiter können Zeit auf diesen Auftrag buchen
- Lagerentnahmen können auf Terp-Aufträge gebucht werden
- Diese Verknüpfung ist ein großer Vorteil gegenüber ZMI (dort zwei separate Systeme)

---

## 13. TICKET-VORSCHLÄGE FÜR TERP — PHASE 1 (CRM/Orders)

### Ticket 1: Adressverwaltung — Stammdaten
**Scope:** Kunden und Lieferanten verwalten
- Adressdatensatz mit allen Feldern
- Ansprechpartner (mehrere pro Adresse)
- Bankverbindung
- Nummernkreise konfigurierbar
- Suche und Filter

### Ticket 2: Korrespondenz-Protokoll
**Scope:** Kommunikation pro Adresse protokollieren
- Eingang / Ausgang / Intern
- Kommunikationstyp
- Verknüpfung mit Vorgang
- Anhänge
- Volltext-Suche

### Ticket 3: Vorgänge / Anfragen
**Scope:** Vertriebsvorgänge verwalten
- Vorgang anlegen mit Nummer und Bezeichnung
- Anfragen einem Vorgang zuordnen
- Status-Workflow: Offen → In Bearbeitung → Abgeschlossen
- Verknüpfung zu Terp-Auftrag (Zeiterfassung)

### Ticket 4: Kundendienst / Serviceaufträge
**Scope:** Servicevorgänge verwalten
- Serviceauftrag anlegen
- Workflow: Neu → In Bearbeitung → Abgeschlossen → Rechnung
- Verknüpfung mit Adresse und Vorgang
- Terp-Auftrag für Zeiterfassung anlegen

### Ticket 5: Belege — Angebot bis Rechnung
**Scope:** Vollständige Belegkette
- Alle Belegarten (Angebot, AB, Lieferschein, Rechnung, Gutschrift)
- Positionen mit Artikeln oder freien Positionen
- Belegworkflow (Fortführen)
- PDF-Export / Druck
- Verknüpfung mit Terp-Auftrag beim Drucken

### Ticket 6: Offene Posten
**Scope:** Zahlungsverfolgung
- Übersicht unbezahlter Rechnungen
- Zahlungen erfassen (Bar/Bank, Teilzahlungen)
- Zahlungsbedingungen und Skonto
- Status: Offen / Teilzahlung / Bezahlt

### Ticket 7: Aufgaben & Nachrichten (Workflow)
**Scope:** Interne Kommunikation zu Vorgängen
- Aufgaben an Mitarbeiter/Teams
- Fälligkeitsdatum
- Verknüpfung mit Adresse und Vorgang
- Integration mit bestehendem Terp-Benachrichtigungssystem

### Ticket 8: Auswertungen CRM/Orders
**Scope:** Berichte
- Belege nach Zeitraum
- Adressen-Übersicht
- Anfragen-Übersicht
- Kundendienst-Übersicht
- Korrespondenz-Übersicht

---

## 14. DATENMODELL-VORSCHLAG (Prisma)

```prisma
// Adresse (Kunde / Lieferant)
model Address {
  id              String   @id @default(cuid())
  tenantId        String
  number          String   // Kundennummer / Lieferantennummer
  type            AddressType // CUSTOMER, SUPPLIER, BOTH
  company         String
  street          String?
  zip             String?
  city            String?
  country         String?
  phone           String?
  fax             String?
  email           String?
  website         String?
  taxNumber       String?
  vatId           String?
  matchCode       String?
  notes           String?
  paymentTerms    String?  // Zahlungsbedingungen
  discountGroup   String?
  isActive        Boolean  @default(true)
  
  contacts        Contact[]
  bankAccounts    BankAccount[]
  correspondences Correspondence[]
  tasks           Task[]
  documents       Document[]       // Belege
  inquiries       Inquiry[]        // Anfragen/Vorgänge
  serviceCases    ServiceCase[]    // Kundendienst
}

// Ansprechpartner
model Contact {
  id          String   @id @default(cuid())
  addressId   String
  firstName   String
  lastName    String
  position    String?
  department  String?
  phone       String?
  email       String?
  address     Address  @relation(...)
}

// Bankverbindung
model BankAccount {
  id          String   @id @default(cuid())
  addressId   String
  iban        String
  bic         String?
  accountHolder String?
  address     Address  @relation(...)
}

// Korrespondenz
model Correspondence {
  id              String   @id @default(cuid())
  tenantId        String
  addressId       String
  direction       CorrespondenceDirection // INCOMING, OUTGOING, INTERNAL
  type            String   // Telefon, E-Mail, Brief etc.
  date            DateTime
  contactId       String?  // Ansprechpartner
  inquiryId       String?  // Verknüpfter Vorgang
  from            String?
  to              String?
  subject         String
  content         String?
  attachments     Attachment[]
  address         Address  @relation(...)
}

// Vorgang / Anfrage
model Inquiry {
  id          String   @id @default(cuid())
  tenantId    String
  number      String   // Vorgangsnummer
  title       String   // Bezeichnung
  addressId   String
  contactId   String?
  status      InquiryStatus // OPEN, IN_PROGRESS, CLOSED
  effort      String?       // Aufwand
  creditRating String?      // Zahlungsfähigkeit
  notes       String?
  orderId     String?       // Verknüpfter Terp-Auftrag
  closedAt    DateTime?
  closedById  String?
  address     Address  @relation(...)
  documents   Document[]
  tasks       Task[]
}

// Serviceauftrag / Kundendienst
model ServiceCase {
  id                  String   @id @default(cuid())
  tenantId            String
  number              String
  title               String
  addressId           String
  contactId           String?
  inquiryId           String?
  status              ServiceStatus // OPEN, IN_PROGRESS, CLOSED
  reportedAt          DateTime @default(now())
  customerNotified    Boolean  @default(false)
  assignedToId        String?  // Zuständiger Mitarbeiter
  description         String?
  closingReason       String?
  closedAt            DateTime?
  orderId             String?  // Verknüpfter Terp-Auftrag
  address             Address  @relation(...)
}

// Beleg (Angebot, AB, Lieferschein, Rechnung, Gutschrift)
model Document {
  id                  String   @id @default(cuid())
  tenantId            String
  number              String   // Belegnummer
  type                DocumentType // OFFER, ORDER_CONFIRMATION, DELIVERY_NOTE, INVOICE, CREDIT_NOTE
  status              DocumentStatus // DRAFT, PRINTED, FORWARDED, CANCELLED
  addressId           String
  contactId           String?
  inquiryId           String?  // Vorgangsnummer
  orderDate           DateTime?
  documentDate        DateTime @default(now())
  deliveryType        String?
  deliveryTerms       String?
  paymentTerms        String?
  discount            Float?   // Skonto %
  discountDays        Int?     // Skonto Tage
  netDays             Int?     // Zahlungsziel Tage
  isRecurring         Boolean  @default(false)
  shippingCostVat     Float?
  notes               String?
  printedAt           DateTime?
  orderId             String?  // Verknüpfter Terp-Auftrag
  parentDocumentId    String?  // Fortgeführt aus diesem Beleg
  
  positions           DocumentPosition[]
  payments            Payment[]
  address             Address  @relation(...)
}

// Belegposition
model DocumentPosition {
  id              String   @id @default(cuid())
  documentId      String
  sortOrder       Int
  type            PositionType // ARTICLE, FREE, TEXT, PAGE_BREAK, SUBTOTAL
  articleId       String?
  articleNumber   String?
  description     String?
  quantity        Float?
  unit            String?
  unitPrice       Float?
  flatCosts       Float?
  totalPrice      Float?
  priceType       PriceType? // STANDARD, ESTIMATE, BY_EFFORT
  vatRate         Float?
  deliveryDate    DateTime?
  confirmedDate   DateTime?
  document        Document @relation(...)
}

// Zahlung
model Payment {
  id          String   @id @default(cuid())
  documentId  String
  date        DateTime
  amount      Float
  type        PaymentType // CASH, BANK
  isSkonto    Boolean  @default(false)
  cancelledAt DateTime?
  document    Document @relation(...)
}

// Aufgabe
model Task {
  id          String   @id @default(cuid())
  tenantId    String
  addressId   String?
  inquiryId   String?
  contactId   String?
  title       String
  content     String?
  dueAt       DateTime?
  duration    Int?     // Minuten
  status      TaskStatus
  assignees   TaskAssignee[]
  attachments Attachment[]
}
```

---

## 15. WICHTIGE UNTERSCHIEDE ZMI → TERP

| Aspekt | ZMI orgAuftrag | Terp (geplant) |
|--------|---------------|----------------|
| Zeiterfassung | Separates Programm (ZMI-Time) | Integriert |
| Mitarbeiterverwaltung | In ZMI-Time, Sync in orgAuftrag | Direkt in Terp |
| Teams | In ZMI-Time | Direkt in Terp |
| Benachrichtigungen | Separates InfoCenter | Integriert |
| Cloud | Desktop-Software, lokaler Server | Cloud (Vercel + Supabase) |
| Multi-Tenant | Nein | Ja |
| Mobile | Nein (außer Timeboy-Terminal) | Geplant |
| Uptime | ~95% (lokaler Server) | 99,9% (Cloud) |

**Vorteil Terp:** Alles in einem System. Auftrag anlegen → sofort in Zeiterfassung verfügbar → Mitarbeiter buchen Zeit → Stunden direkt im Beleg sichtbar → Rechnung erstellen.

---

## 16. PREISLISTEN (Prio 2 — Artikelstamm)

Drei Fenster nebeneinander: Preislisten | Artikel | Preise

### 16.1 Preislisten verwalten

- Standardpreisliste (systemweit)
- Großkundenpreisliste
- Eigene Preislisten anlegen (Nummer + Bezeichnung)
- Bei Anlage wählen: alle Artikel / nur Artikel mit Preis / leere Liste
- **Preisliste einem Kunden zuweisen** → Kunde bekommt automatisch diese Preise

### 16.2 Artikel in Preisliste

- Artikel manuell zur Preisliste hinzufügen
- Übersicht: Artikelname, Preis, zugehörige Preisliste

### 16.3 Preise pro Artikel

- Mehrere Preise pro Artikel möglich
- Verknüpfung zu Preisliste

**Ticket 9: Preislisten**
- Preislisten anlegen (Standard, Großkunde, individuell)
- Artikel einer Preisliste zuordnen
- Preisliste einem Kunden zuweisen
- Bei Belegposition: automatisch Kundenpreis aus zugewiesener Preisliste laden

---

## 17. VORGÄNGE — GLOBALE ÜBERSICHT (CRM)

Separate Übersichtsseite für alle Vorgänge (nicht nur pro Adresse):

- Alle Vorgänge mandantenweit
- Suche: nach Vorgangsbezeichnung (Anfangsbuchstaben oder ?Begriff für Volltextsuche)
- Filter nach Status
- Vorgang abschließen mit Abschlussgrund und Abschlussbemerkung
- Nach Abschluss: nicht mehr veränderbar

**Ergänzung zu Ticket 3:**
- Globale Vorgangsliste mit Volltext-Suche
- Abschlussgrund (frei definierbar)
- Abschlussbemerkung

---

## 18. WIEDERKEHRENDE RECHNUNGEN (Orders)

Für Wartungsverträge und monatliche Abrechnung:

- Rechnung als "Wiederholt sich" markieren
- Intervall: monatlich, quartalsweise, jährlich
- Automatische Generierung oder manuelle Auslösung
- Alle wiederkehrenden Rechnungen in einer Übersicht

**Ticket 10: Wiederkehrende Rechnungen**
- Rechnung als recurring markieren
- Intervall konfigurieren
- Übersicht fälliger wiederkehrender Rechnungen
- Manuell oder automatisch auslösen

> 💡 Besonders relevant für Terp-Wartungsverträge mit Pro-Di und zukünftigen Kunden!

---

## 19. VOLLSTÄNDIGE TICKET-LISTE (aktualisiert)

### Prio 1 — CRM / Orders

| # | Ticket | Scope |
|---|--------|-------|
| 1 | Adressverwaltung | Kunden + Lieferanten mit allen Feldern, Ansprechpartner, Bankverbindung |
| 2 | Korrespondenz-Protokoll | Kommunikation pro Adresse, Anhänge, Suche |
| 3 | Vorgänge / Anfragen | Vorgangsverwaltung, globale Übersicht, Suche, Abschluss |
| 4 | Kundendienst / Service | Serviceaufträge, Workflow, Rechnung aus Service |
| 5 | Belege — Belegkette | Angebot → AB → Lieferschein → Rechnung → Gutschrift |
| 6 | Offene Posten | Zahlungsverfolgung, Skonto, Teilzahlungen |
| 7 | Aufgaben & Nachrichten | Interne Kommunikation zu Vorgängen |
| 8 | Auswertungen CRM/Orders | Berichte Belege, Adressen, Anfragen, Kundendienste |
| 10 | Wiederkehrende Rechnungen | Wartungsverträge, Intervall, automatische Auslösung |

### Prio 2 — Lager / Artikel

| # | Ticket | Scope |
|---|--------|-------|
| L1 | Artikelstamm | Artikel, Gruppen, Preise, Stücklisten, Lager |
| L2 | Preislisten | Preislisten, Kundenzuordnung, automatische Preise |
| L3 | Einkauf / Bestellungen | Bestellvorschläge, Bestellvorgänge, Wareneingang |
| L4 | Lagerentnahmen | Ausbuchen per Auftrag/Packliste, Storno |
| L5 | Lieferantenrechnungen | Eingangsrechnungen, Zahlungen, Skonto |
| L6 | Inventur | Inventurbuchungen, Übernahme, Lagerbewegungen |
| L7 | Terminüberwachung | Offene Bestellungen mit Lieferterminen |
