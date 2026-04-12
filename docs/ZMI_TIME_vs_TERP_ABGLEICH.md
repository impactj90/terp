# ZMI Time vs. Terp — Detaillierter Feature-Abgleich (Zeiterfassung & Personal)

*Stand: 24. März 2026*
*Quellen: ZMI Time Handbuch V6.4 (235 Seiten) vs. Terp Handbuch V2*

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

## 1. MANDANT & FIRMENDATEN

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Mandantenstamm (Firmenname, Adresse) | ✅ | ✅ (Administration → Mandanten) | ✅ |
| Mehrere Mandanten | ✅ (pro Mandant eigene Feiertage, Mitarbeiter) | ✅ (vollständig getrennt, Umschalter in Kopfzeile) | ✅ |
| Exportpfad Lohndaten pro Mandant | ✅ | ✅ (Exportschnittstelle mit Pfad) | ✅ |
| Notizen pro Mandant | ✅ (Karteireiter Notizen) | ✅ (Notizen im Mandantenformular) | ✅ |
| Urlaubsberechnung pro Mandant (Kalenderjahr/Eintrittsdatum) | ✅ (Reiter Urlaubsberechnung) | ✅ (im Tarif konfigurierbar, nicht pro Mandant) | ⚠️ Pro Tarif statt pro Mandant |
| Slug / Kurzname | ❌ | ✅ (automatisch generiert) | 🆕 |
| Mandanten-Umschalter ohne Neuanmeldung | ❌ (Neuanmeldung nötig) | ✅ (Dropdown in Kopfzeile) | 🆕 |

---

## 2. FEIERTAGE

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Feiertage pro Mandant | ✅ | ✅ | ✅ |
| Feiertage generieren nach Bundesland | ✅ (alle 16 Bundesländer) | ✅ (alle 16 Bundesländer, Gauß/Meeus-Algorithmus) | ✅ |
| 3 Feiertagskategorien | ✅ (Kat. 1 = voll, Kat. 2 = halb, Kat. 3 = individuell) | ✅ (identisch) | ✅ |
| Vorjahre anzeigen (grau) | ✅ | Über Jahresnavigation | ✅ |
| Feiertage aus Vorjahr kopieren | ✅ (Feiertage übernehmen) | ✅ (Button "Kopieren" mit Quelljahr/Zieljahr) | ✅ |
| Heiligabend/Silvester als halber Tag | ✅ (manuell Kat. 2) | ✅ (Schalter beim Kopieren + manuell) | ✅+ |
| Feiertag pro Abteilung beschränken | ❌ | ✅ (Geltungsbereich: Alle oder Abteilung) | 🆕 |
| Kalenderansicht (Volljahr) | ❌ | ✅ (Kalender- und Listenansicht umschaltbar) | 🆕 |
| Neuberechnung nach Feiertagsänderung | ✅ (Hinweis: manuell nötig) | ✅ (automatisch bei nächstem Berechnungslauf) | ✅+ |

---

## 3. BENUTZERVERWALTUNG & BERECHTIGUNGEN

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Benutzer mit Passwort anlegen | ✅ | ✅ | ✅ |
| Benutzergruppen mit Rechten | ✅ (11 Karteireiter: Allgemein, Time Module, Personal, Auftrag, Buchungsübersicht, Systemeinstellungen, Report, Auswertungen, Urlaubsplaner, Fahrzeugdaten, Schnittstellen/Makros) | ✅ (7 Kategorien: Mitarbeiter, Zeiterfassung, Buchungsübersicht, Abwesenheiten, Konfiguration, Administration, Berichte) | ✅ |
| Pro Modul: Lesen/Schreiben/Löschen | ✅ | ✅ (+ zusätzliche Granularität pro Aktion) | ✅ |
| Datensichtbereich (alle/Mandant/Abteilung/Mitarbeiter) | ✅ (Reiter ZMI Time bei Benutzer) | ✅ (Datensichtbereich beim Benutzer: Alle/Mandant/Abteilung/Mitarbeiter) | ✅ |
| Windows SingleSignOn | ✅ (Windowsbenutzer zuordnen) | ❌ | ❌ Niedrige Prio |
| Mitarbeiter dem Benutzer zuordnen | ✅ (für WebClient SingleSignOn) | ✅ (Mitarbeiter verknüpfen) | ✅ |
| Passwort-Komplexität konfigurierbar | ✅ (Mindestlänge, Groß/Klein, Ziffern, Sonderzeichen) | ✅ (Stärkebalken beim Anlegen) | ⚠️ Weniger konfigurierbar |
| Zwei-Faktor-Authentifizierung | ❌ | ❌ | — |

---

## 4. ZEITPLÄNE

### 4.1 Tagespläne

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Festarbeitszeitplan (FAZ) | ✅ (Kommen von / Gehen von) | ✅ (Kommen ab / Gehen ab) | ✅ |
| Gleitzeitplan (GLZ) | ✅ (Kommen von/bis, Gehen von/bis + Kernzeit) | ✅ (identisch + Kernzeitbeginn/-ende) | ✅ |
| Regelarbeitszeit 1 (Sollstunden) | ✅ | ✅ (Sollarbeitszeit) | ✅ |
| Regelarbeitszeit 2 (für Fehltage) | ✅ (alternative Sollzeit bei Fehltagen) | ✅ (Abwesenheitsstunden) | ✅ |
| "Aus Personalstamm holen" (Sollzeit pro MA) | ✅ | ✅ (Checkbox "Sollstunden aus Mitarbeiterstamm") | ✅ |
| Tagesplan pro Mandant beschränken | ✅ | Nicht explizit dokumentiert | ⚠️ Prüfen |
| Tagesplan kopieren | ✅ (Button Kopieren mit neuer Nummer) | ✅ (⋯-Menü → Kopieren mit neuem Code/Namen) | ✅ |
| Farben für Urlaubsplaner | ✅ | Über Schichtfarben (Schichtplanung) | ⚠️ Nicht direkt am Tagesplan |
| Kennung (Code) frei wählbar, nicht U/K/S | ✅ | ✅ (Code, reserviert: U, K, S) | ✅ |
| Aktiv/Inaktiv-Schalter | ✅ (unsichtbar schalten) | ✅ | ✅ |
| Mindest-/Maximale Nettoarbeitszeit | ✅ (Max. Netto-Arbeitszeit) | ✅ (Mindestarbeitszeit + Maximale Nettoarbeitszeit) | ✅+ |

### 4.2 Pausen

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Feste Pause 1–3 (Zeitfenster) | ✅ (3 feste Pausen mit Uhrzeiten) | ✅ (Pausentyp "Fest") | ✅ |
| Variable Pause 4 (nicht berechnet wenn MA Pause bucht) | ✅ | ✅ (Pausentyp "Variabel": nur wenn keine manuelle Pause + Mindestarbeitszeit erreicht) | ✅ |
| Mindestpause 1 + 2 (nach Anwesenheitszeit) | ✅ (mit "Minuten Differenz" Option) | ✅ (Pausentyp "Minimum" mit "Nach Arbeit" Minuten) | ✅ |
| "Minuten Differenz" (Differenz statt voller Pause) | ✅ | ❌ Nicht dokumentiert | ❌ Niedrige Prio |
| Bezahlte Pause | Nicht explizit | ✅ (Checkbox "Bezahlt") | 🆕 |
| Tarif-weite Pausen (gelten für alle Tagespläne) | ❌ | ✅ (Pausen auf Tarif-Ebene) | 🆕 |
| Gesetzliche Pausenregel (§ 4 ArbZG) | Über Mindestpausen manuell konfiguriert | ✅ (Beispielkonfiguration: 30 Min nach 6h, 15 Min nach 9h) | ✅ |

### 4.3 Toleranz

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Toleranz Kommen + (zu spät) | ✅ | ✅ (Kommen spät plus) | ✅ |
| Toleranz Kommen − (zu früh) | ✅ (nur bei "variable Arbeitszeit" aktiv) | ✅ (Kommen früh minus, nur bei "Variable Arbeitszeit") | ✅ |
| Toleranz Gehen − (zu früh) | ✅ | ✅ (Gehen früh minus) | ✅ |
| Toleranz Gehen + (zu spät) | ✅ | ✅ (Gehen spät plus) | ✅ |
| "Variable Arbeitszeit" Checkbox | ✅ (aktiviert Kommen−) | ✅ (identisch) | ✅ |
| GLZ: Nur Kommen− und Gehen+ relevant | ✅ (Hinweis im Handbuch) | ✅ (nur 2 Felder bei Gleitzeit sichtbar) | ✅ |

### 4.4 Abgleich / Rundung

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Aufrunden | ✅ | ✅ | ✅ |
| Abrunden | ✅ | ✅ | ✅ |
| Mathematisch Runden | ✅ | ✅ (Nächster Wert) | ✅ |
| Wert addieren | ✅ (z.B. +10 Min für Duschzeit) | ✅ | ✅ |
| Wert subtrahieren | ✅ | ✅ | ✅ |
| "Alle Buchungen runden" (nicht nur erste/letzte) | ✅ | ✅ (Checkbox) | ✅ |
| Abgleich relativ zur Planzeit | ✅ (Option in Systemeinstellungen) | ✅ (Systemeinstellung "Rundung relativ zum Plan") | ✅ |
| Intervall frei wählbar (5, 10, 15, 30 Min) | ✅ | ✅ | ✅ |

### 4.5 Sonderfunktionen

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Feiertagsgutschrift (3 Kategorien) | ✅ | ✅ (Voller/Halber/Kat. 3 Feiertag) | ✅ |
| Urlaubsbewertung (Abzugsfaktor) | ✅ (1 = ein Tag, oder Stundenwert) | ✅ (Urlaubsabzug: 1,0 / 0,5 / 0,8 etc.) | ✅ |
| Tage ohne Buchungen | ✅ (5 Optionen: Keine Bewertung / Fehler / Soll gutschreiben / Soll abziehen / Berufsschule) | ✅ (5 Optionen: Fehler / Sollstunden abziehen / gutschreiben / Berufsschultag / Soll mit Standardauftrag) | ✅ |
| Tageswechsel bei Nachtschicht | ✅ (3 Optionen: Bei Ankunft / Bei Gehen / Auto-Vervollständigen) | ✅ (4 Optionen: Kein / Bei Ankunft / Bei Gehen / Auto-Abschluss um Mitternacht) | ✅+ |
| Tagesnetto-Konto | ✅ (wählbares Konto für Tagesarbeitszeit) | Über Konten-System | ✅ |
| Kappungskonto (gekapte Zeit) | ✅ (gesondert protokolliert) | Nicht als separates Konto dokumentiert | ⚠️ |
| Max. Netto-Arbeitszeit | ✅ | ✅ (Maximale Nettoarbeitszeit) | ✅ |
| Alternativ-Tagesplan (F2-Tausch) | ✅ (Kennung eines Plans für schnellen Tausch) | Nicht dokumentiert | ❌ Niedrige Prio |
| Info-Tab (Freitext zum Tagesplan) | ✅ | Nicht dokumentiert | ❌ Niedrige Prio |

### 4.6 Zuschläge

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Zuschlag mit Konto und Zeitfenster | ✅ (Konten + Uhrzeiten, Feiertag ja/nein) | ✅ (Bonus-Konto + Zeit von/bis + Berechnungsart + Feiertag ja/nein) | ✅ |
| Feiertagszuschlag (ganzer Tag, Kat 1+2) | ✅ | ✅ (Gilt an Feiertagen Checkbox) | ✅ |
| Nachtzuschlag (22:00–06:00) | ✅ (muss als 22:00-00:00 + 00:00-06:00 eingetragen werden) | ✅ (kann als 22:00-06:00 eingetragen werden, wird intern gesplittet) | ✅+ |
| Berechnungsart: Pro Minute | ✅ (implizit: 1:1 Zuordnung) | ✅ (explizit: Pro Minute / Festwert / Prozentual) | ✅+ |
| Mindestarbeitszeit für Zuschlag | ❌ | ✅ (Feld "Mindestarbeitszeit") | 🆕 |

### 4.7 Schichterkennung

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Automatische Schichterkennung | ✅ (Karteireiter Schicht: Kommen von/bis, Gehen von/bis prüfen) | ✅ (Tab Spezial, bis zu 6 alternative Tagespläne) | ✅ |
| Bis zu 6 alternative Tagespläne | ✅ | ✅ | ✅ |
| Schichterkennung deaktivierbar | ✅ (Checkbox) | ✅ | ✅ |
| Fehlermeldung wenn kein Plan passt | ✅ (Korrekturassistent-Meldung) | ✅ (Fehlercode NO_MATCHING_SHIFT) | ✅ |

### 4.8 Buchen mit Grund

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Buchungsarten mit Spezialverhalten | ✅ (z.B. "Postgang": 30 Min extra) | Über eigene Buchungstypen (z.B. HO1, HO2) | ⚠️ Kein automatischer Zeitbonus |
| Zeitbonos bei Spezial-Buchung | ✅ (Minuten addieren basierend auf Tagesplan-Referenzzeit) | ❌ | ❌ Niedrige Prio |
| Buchungsartengruppen | ✅ (für Terminalzuordnung) | ✅ (Tab "Gruppen" bei Buchungstypen) | ✅ |

### 4.9 Wochenpläne

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Wochenplan anlegen (Mo–So) | ✅ (eindeutiger Name + 7 Tagespläne) | ✅ (Code + Name + 7 Tageszuweisungen) | ✅ |
| Wochenplan pro Mandant beschränken | ✅ | Nicht explizit dokumentiert | ⚠️ |
| Zusammenfassung (Arbeitstage, Stunden) | ❌ | ✅ (automatisch angezeigt) | 🆕 |
| Wochenplangruppen | ✅ (für WebClient) | Nicht dokumentiert | ❌ Niedrige Prio |

---

## 5. MONATSBEWERTUNG / FLEXZEIT

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Maximale Gleitzeit im Monat | ✅ | ✅ (Max. Flexzeit/Monat) | ✅ |
| Obergrenze Jahreszeitkonto | ✅ | ✅ (Obere Jahresgrenze) | ✅ |
| Untergrenze Jahreszeitkonto | ✅ | ✅ (Untere Jahresgrenze) | ✅ |
| Gleitzeitschwelle | ✅ (Mindest-Mehrarbeit für Gutschrift) | ✅ (Schwellenwert bei "Nach Schwellenwert") | ✅ |
| Art der Gutschrift: Keine Bewertung | ✅ | ✅ | ✅ |
| Art der Gutschrift: Komplett | ✅ (Gleitzeitübertrag komplett) | ✅ (Vollständige Übertragung) | ✅ |
| Art der Gutschrift: Nach Schwelle | ✅ (Gleitzeitübertrag nach Schwelle) | ✅ (Nach Schwellenwert) | ✅ |
| Art der Gutschrift: Kein Übertrag | ✅ (Konto auf 0) | ✅ (Keine Übertragung) | ✅ |
| Makro für komplexe Verrechnung | ✅ (Hinweis: Makro nötig für mehrere Gleitzeitkonten) | ✅ (Makros mit Aktionstypen) | ✅ |

---

## 6. PERSONALSTAMM

### 6.1 Grunddaten

| Feld | ZMI Time | Terp | Status |
|------|----------|------|--------|
| Nachname, Vorname | ✅ | ✅ | ✅ |
| Personalnummer | ✅ (automatisch) | ✅ (Pflicht) | ✅ |
| Adresse (Straße, PLZ, Ort) | ✅ (Karteireiter Adresse) | ❌ Nicht im Mitarbeiterstamm | ❌ Niedrige Prio |
| Geburtsdatum + Geburtstagsliste | ✅ | ❌ | ❌ Niedrige Prio |
| Geschlecht | ✅ | ❌ | ❌ Niedrige Prio |
| Staatsangehörigkeit | ✅ | ❌ | ❌ Niedrige Prio |
| Konfession | ✅ | ❌ | ❌ Niedrige Prio |
| Familienstand | ✅ | ❌ | ❌ Niedrige Prio |
| Geburtsort, Geburtsland | ✅ | ❌ | ❌ Niedrige Prio |
| Raumnummer | ✅ | ❌ | ❌ |
| Mandant | ✅ (automatisch erster Mandant) | ✅ (über Mandantenzugehörigkeit) | ✅ |
| Abteilung | ✅ (+ Neuanlage direkt möglich) | ✅ (Dropdown) | ✅ |
| Kostenstelle | ✅ (ZMI Kostenstelle Modul) | ✅ (Dropdown) | ✅ |
| Baumstruktur (für Reports/WebClient) | ✅ | Über Abteilungshierarchie | ✅ |
| Passfoto (max. 189x189px) | ✅ | Avatar (über Profil, "kommt demnächst") | ⚠️ Upload in Entwicklung |
| E-Mail, Telefon | ✅ (in Hauptmaske) | ✅ (Persönliche Daten) | ✅ |
| Eintrittsdatum | ✅ | ✅ (Pflicht) | ✅ |
| Austrittsdatum (+ Standard-Tagesplan setzen) | ✅ | ✅ | ✅ |
| PIN (für Terminal) | ✅ (in Ausweise) | ✅ (automatisch vergeben) | ✅ |
| Standort | Nicht explizit | ✅ (Dropdown) | 🆕 |
| Beschäftigungsart (Dropdown) | ✅ (Vollzeit/Teilzeit) | ✅ (eigenes Modul mit Standard-Wochenstunden + Urlaubsberechnung) | ✅+ |
| Wochenstunden | ✅ (Tarif → Wochensollstunden) | ✅ (Vertragsfeld) | ✅ |
| Urlaubstage/Jahr | ✅ (Tarif → Jahresurlaub) | ✅ (Vertragsfeld) | ✅ |

### 6.2 Kontaktinformationen

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Kontakt-Karteireiter | ✅ (konfigurierbar über Kontaktmanagement) | ✅ (Profil-Seite → Kontakte: Typ, Wert, Bezeichnung, Hauptkontakt) | ✅ |
| Kontaktarten konfigurierbar | ✅ (Systemeinstellungen → Kontaktmanagement) | ✅ (Verwaltung → Kontaktarten: Typ + Unterarten) | ✅ |

### 6.3 Fehltage / Abwesenheiten

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Urlaub (Kürzel U) | ✅ | ✅ (Code-Präfix U) | ✅ |
| Krankheit (Kürzel K) | ✅ | ✅ (Code-Präfix K) | ✅ |
| Sondertage (Kürzel S) | ✅ | ✅ (Code-Präfix S) | ✅ |
| Halber Urlaubstag | ✅ | ✅ (Halbtag: Vormittag/Nachmittag) | ✅+ |
| Fehltage frei definierbar | ✅ (Kürzel + Bezeichnung + Berechnung + Anteil + Priorität + Farbe) | ✅ (Code + Name + Kategorie + Farbe + Urlaubsabzug + Genehmigung + Berechnungsregel) | ✅ |
| Fehltagegruppen | ✅ (für WebClient-Antragswesen) | ✅ (Tab "Gruppen" bei Abwesenheitsarten) | ✅ |
| F-Taste zuordnen (Schnelleingabe) | ✅ (z.B. F6 = Urlaub) | ❌ | ❌ Niedrige Prio |
| Konto pro Fehltag | ✅ (Formel: Wert × Faktor, Wert=0 → Tagessollzeit) | ✅ (Berechnungsregeln: identische Formel) | ✅ |
| Feiertag-Kürzel (Alternativ-Kürzel an Feiertagen) | ✅ | Nicht dokumentiert | ⚠️ |
| Genehmigungsworkflow | ❌ (kein Workflow in ZMI Time selbst, nur WebClient) | ✅ (Beantragt → Genehmigt/Abgelehnt → Storniert) | 🆕 |
| Automatische Genehmigung | ❌ | ✅ (Schalter "Genehmigung erforderlich" pro Typ) | 🆕 |
| Urlaubsvorschau beim Antrag | ❌ | ✅ (Aktueller Stand → Beantragt → Neuer Stand) | 🆕 |
| Wochenenden/Feiertage überspringen | ❌ (manuell) | ✅ (automatisch bei Datumsbereich) | 🆕 |

### 6.4 Bankverbindung / Sozialversicherung / Steuer

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Bankverbindung | ✅ | ❌ (nicht im Mitarbeiter, nur in CRM-Adressen) | ⚠️ |
| Sozialversicherungsnummer | ✅ | ❌ | ❌ Niedrige Prio |
| Krankenkasse | ✅ | ❌ | ❌ Niedrige Prio |
| Steuerklasse / Steuer-ID | ✅ | ❌ | ❌ Niedrige Prio |

### 6.5 Info-Tab (Monats-/Urlaubswerte live)

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Aktuelle Monatswerte live anzeigen | ✅ (Karteireiter Info) | ✅ (Dashboard-Karten: Wochenstunden, Urlaubsrest, Flexzeitsaldo) | ✅ |
| Kontengruppe pro Mitarbeiter wählbar | ✅ (Kontenauswahl-Dropdown) | Nicht dokumentiert als Filter | ⚠️ |
| Letzte Buchung / Status | ✅ (im Info-Bereich) | ✅ (Dashboard: letzte 5 Aktivitäten + Status) | ✅ |

### 6.6 Personalakte

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Personalakte (Prüfungen, Sonderführerscheine, Abmahnungen) | ✅ (Karteireiter Akte mit Aktengruppen) | ❌ | ❌ Mittlere Prio |
| Anhänge (Dokumente, Zertifikate) | ✅ (Dateiverzeichnis oder Datenbank) | ❌ | ❌ Mittlere Prio |
| Aktengruppen mit Rechtesteuerung | ✅ (wer darf welche Akteneinträge sehen) | ❌ | ❌ Mittlere Prio |
| Wiedervorlage (Datum + Anzeige bei Start) | ✅ (Karteireiter Wiedervorlage + Systemeinstellung) | ❌ | ❌ Niedrige Prio |
| Beruf / Qualifikation | ✅ (Karteireiter mit Feldern für PEP/Plantafel) | ❌ | ❌ Niedrige Prio |

**Gap-Detail — Personalakte:** ZMI Time hat eine vollständige Personalakte mit Aktengruppen, Anhängen, Rechtesteuerung und Wiedervorlagefunktion. In Terp gibt es kein Äquivalent. → **Mittlere Priorität** für HR-orientierte Unternehmen, **Niedrige Priorität** für Pro-Di.

### 6.7 Meldungen / Push Notifications

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Meldungen an einzelne Mitarbeiter (Push auf Handy) | ✅ (Karteireiter Meldungen, via ZMI Server) | ✅ (Mitarbeiternachrichten: einzeln, Abteilung, alle) | ✅+ |
| Status-Protokoll (versendet/gelesen) | ✅ | ✅ (Status: Gesendet/Ausstehend/Fehlgeschlagen) | ✅ |

### 6.8 Lohn / Stundensätze

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Interne/externe Verrechnungssätze | ✅ (Karteireiter Lohn, für ZMI Auftrag) | ✅ (Stundensatz pro Auftrag) | ⚠️ Pro Auftrag statt pro MA |

### 6.9 Zutritt

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Zutrittsberechtigung pro Mitarbeiter | ✅ (Karteireiter Zutritt) | ✅ (Zutrittskontrolle: Zonen, Profile, Zuweisungen) | ✅ |

### 6.10 Ausweise / Karten

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Kartennummer (RFID/Transponder) | ✅ | ✅ (Zutrittskarten: RFID, Barcode, PIN) | ✅ |
| Code (für Softwareterminal) | ✅ | Über PIN | ✅ |
| Ausweistypen konfigurierbar | ✅ (Systemeinstellungen → Ausweisverwaltung) | ✅ (3 Typen: RFID, Barcode, PIN) | ⚠️ Weniger flexibel |
| Kartendruck | ✅ (Berechtigung in Benutzergruppen) | ❌ | ❌ Niedrige Prio |
| Mehrere Ausweise pro Mitarbeiter | ✅ | ✅ | ✅ |

### 6.11 Tarif (pro Mitarbeiter)

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Tarifzuweisung mit Gültigkeitszeitraum | ✅ (Von/Bis) | ✅ (Tab "Tarifzuweisungen" mit Von/Bis) | ✅ |
| Urlaubswerte (Jahresurlaub, AT/Woche) | ✅ | ✅ (im Tarif) | ✅ |
| Beschäftigungstyp (für Urlaubsberechnung) | ✅ (Dropdown) | ✅ (Beschäftigungsart mit Urlaubsberechnungsgruppe) | ✅ |
| Schwerbehinderung (Checkbox) | ✅ (für Sonderurlaub) | ✅ (Sonderberechnung Behinderung) | ✅ |
| Sollstunden (Tag/Woche/Monat/Jahr) | ✅ (4 Felder) | ✅ (4 Felder im Tarif → Tab Sollstunden) | ✅ |
| Teilzeitgrad (%) | ✅ | Über Wochenstunden berechnet | ⚠️ |
| Monatsbewertung zuweisen | ✅ (Dropdown + Eintragen-Button) | ✅ (im Tarif → Tab Flexzeit) | ✅ |
| Wochenmakro | ✅ (Makro + Ausführungstag) | ✅ (Administration → Makros, wöchentlich) | ✅ |
| Monatsmakro | ✅ (Makro + Ausführungstag, letzter des Monats) | ✅ (Administration → Makros, monatlich) | ✅ |
| Zeitplan-Rhythmus: Wöchentlich | ✅ (ein oder mehrere Wochenpläne) | ✅ (Rhythmustyp Wöchentlich) | ✅ |
| Zeitplan-Rhythmus: Rollierend | ✅ (mehrere Wochenpläne nacheinander) | ✅ (Rollierend wöchentlich) | ✅ |
| Zeitplan-Rhythmus: X-Tage | ✅ (ab bestimmtem Datum, X Tage Zyklus) | ✅ (X-Tage-Rhythmus mit Zykluslänge) | ✅ |
| Tarifdefinition (Template wiederverwendbar) | ✅ (Modul Tarifdefinition) | ✅ (Tarife als eigenständiges Modul, wiederverwendbar) | ✅ |

### 6.12 Offsetwerte (Startwerte)

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Startwert Resturlaub | ✅ (Manuelle Urlaubskorrektur im Tarif) | ✅ (Urlaubskonten → "Konto bearbeiten" → Übertrag/Korrektur) | ✅ |
| Startwert Gleitzeitkonto | ✅ (in Monatswerten: Gleitzeitübertrag Folgemonat) | ✅ (über Kontobuchungen / manuelle Korrektur) | ✅ |

### 6.13 Sonderfunktionen (ZMI-spezifisch)

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Führerscheinkontrolle | ✅ (Modul: Rollen, Intervall, Benachrichtigungen, Eskalation) | ❌ | ❌ Nicht relevant für Terp |
| COVID-19 Nachweiskontrolle | ✅ (QR-Code einlesen, Status verwalten) | ❌ | ❌ Nicht mehr relevant |
| Auslagen / Belege (Kostentyp, Bruttobetrag) | ✅ (Karteireiter Auslagen) | ❌ | ❌ Niedrige Prio |
| Dienstwagen | ✅ (Karteireiter Fahrzeug) | ❌ | ❌ Niedrige Prio |
| Reisekostenabrechnung (Auslöse, Nah-/Fernmontage) | ✅ (Modul ZMI Auslöse) | ❌ | ❌ Niedrige Prio |
| History (Änderungslog pro Mitarbeiter) | ✅ (Karteireiter History) | ✅ (Audit-Protokoll, global) | ✅ |

---

## 7. TÄGLICHE ARBEIT

### 7.1 Korrekturassistent

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Fehler vs. Hinweise unterscheiden | ✅ | ✅ (Schweregrad: Fehler/Hinweis) | ✅ |
| Zeitraumfilter (Standard: Vormonat + aktuell) | ✅ | ✅ (Datumsbereich) | ✅ |
| Abteilungsfilter | ✅ | ✅ | ✅ |
| Grid anpassbar (Sortierung, Spalten) | ✅ (flexibles Grid-System) | ✅ (Tabelle mit Spaltenköpfen) | ⚠️ Weniger flexibel |
| Doppelklick → direkt zur Buchungsübersicht | ✅ | ⚠️ (Klick → Panel → "Zum Mitarbeiter" → Zeitnachweis) | ⚠️ Indirekter |
| Fehlertexte anpassbar | ✅ (Systemeinstellungen → Korrekturmeldungen) | ✅ (Tab "Meldungen", inline bearbeitbar) | ✅ |
| Schweregrad änderbar (Fehler ↔ Hinweis) | ❌ | ✅ (Dialog, pro Meldungscode) | 🆕 |
| Meldungen deaktivierbar | ❌ | ✅ (Aktiv/Inaktiv Schalter) | 🆕 |
| Eigene Meldungscodes (ab 100) | ✅ (für Makros) | Nicht dokumentiert | ⚠️ |

### 7.2 Buchungsübersicht / Zeitnachweis

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Buchungen anzeigen (Tag) | ✅ (Pärchen: Kommen + Gehen in einer Zeile) | ✅ (Tagesansicht mit Buchungsliste) | ✅ |
| Original / Editiert / Berechnet (3 Werte) | ✅ (pro Buchung) | ✅ (Originalzeit bleibt, bearbeitete Zeit, berechnete Zeit) | ✅ |
| Buchung anlegen | ✅ | ✅ (Button "Buchung hinzufügen") | ✅ |
| Buchung bearbeiten | ✅ (Editiert-Wert ändern) | ✅ (Stift-Symbol → bearbeitete Uhrzeit) | ✅ |
| Buchung löschen | ✅ | ✅ (Mülleimer-Symbol) | ✅ |
| Tag berechnen (sofort) | ✅ (Button "Tag berechnen") | ✅ (automatisch nach Buchungsänderung) | ✅+ |
| Monat berechnen (ein MA) | ✅ (Button) | Über Monatswerte → Neu berechnen | ✅ |
| Tagesplan am Tag wechseln | ✅ (Button → Plan aus Liste wählen) | Nicht direkt in Tagesansicht dokumentiert | ⚠️ |
| Tagesplan am Tag temporär anpassen | ✅ (Button → Tagesplan-Fenster öffnen, nur für diesen Tag) | Nicht dokumentiert | ❌ Niedrige Prio |
| Fehltage erfassen/löschen (Kontextmenü) | ✅ (Button "Fehltage" → Erfassen/Löschen) | Über Abwesenheiten-Seite | ⚠️ Anderer Workflow |
| Wochen-/Monatsansicht | ✅ (in Auswerten-Maske: Tageswerte / Monatswerte) | ✅ (3 Tabs: Tag / Woche / Monat) | ✅ |
| Tageskonten / Monatskonten | ✅ (Karteireiter) | Über Konten → "Buchungen anzeigen" | ⚠️ |
| Jahresübersicht (grafisch mit Farben) | ✅ (farbige Fehltage + Tagespläne) | ✅ (Jahresübersicht-Seite mit Flexzeit-Diagramm + Monatstabelle) | ✅ |
| Fehltage in Jahresübersicht erfassen | ✅ (Rechtsklick → Fehltag eintragen) | Über Abwesenheiten-Seite | ⚠️ |
| Logdatei (Buchungslog, Fehltage Log, Zeitplan Log) | ✅ (3 separate Logs pro Tag) | ✅ (Audit-Protokoll global, Auswertungen → Tab Protokoll) | ✅ |

### 7.3 Monat abschließen / entsperren

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Monat abschließen (pro MA) | ✅ (Button) | ✅ (Monatsauswertung → "Monat abschließen") | ✅ |
| Monat abschließen (Massenweise) | ✅ (Bereich auswählen + ausführen) | ✅ (Monatswerte → alle auswählen → "Ausgewählte abschließen") | ✅ |
| Monate entsperren | ✅ (Button → MA wählen → bis Monat öffnen) | ✅ ("Wieder öffnen" pro MA oder massenweise) | ✅ |
| Vor Abschluss neu berechnen | Nicht explizit als Option | ✅ (Checkbox im Dialog) | 🆕 |
| Notizen beim Abschluss | ❌ | ✅ (optionales Notizfeld) | 🆕 |

---

## 8. URLAUBSVERWALTUNG

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Jahresurlaub aus Tarif | ✅ | ✅ | ✅ |
| Anteilige Berechnung bei unterjährigem Eintritt | ✅ (Klick auf Berechnen → anteiliger Wert) | ✅ (automatisch bei Initialisierung) | ✅ |
| Urlaubskorrektur (manuell) | ✅ (Karteireiter Urlaubskorrektur mit Datum + Wert) | ✅ (Urlaubskonten → "Konto bearbeiten" → Korrektur) | ✅ |
| Urlaubskorrektur in Monatswerten | ✅ (Auswerten → Monatswerte → Korrektur) | ✅ (Urlaubskonten-Seite) | ✅ |
| Sonderberechnung: Alter | ✅ (Systemeinstellungen → Urlaubsberechnung) | ✅ (Urlaubskonfiguration → Sonderberechnungen) | ✅ |
| Sonderberechnung: Betriebszugehörigkeit | ✅ | ✅ | ✅ |
| Sonderberechnung: Schwerbehinderung | ✅ | ✅ | ✅ |
| Kappungsregeln (Jahresende) | ✅ (Systemeinstellungen → Kappungsregeln) | ✅ (Urlaubskonfiguration → Kappungsregeln) | ✅ |
| Kappung während des Jahres (z.B. 31.03.) | ✅ | ✅ (Stichtag pro Kappungsregel) | ✅ |
| Kappungsregelgruppen | ✅ (Gruppen mit Kalenderjahr/Eintrittsdatum) | ✅ | ✅ |
| Beschäftigungstyp → Urlaubsberechnung zuweisen | ✅ | ✅ (Beschäftigungsart → Urlaubsberechnungsgruppe) | ✅ |
| Ausnahmen pro Mitarbeiter (volle/teilweise Kappungsbefreiung) | ✅ (Hinweis: über Support konfigurierbar) | ✅ (Tab "Ausnahmen" in Urlaubskonfiguration) | ✅+ |
| Urlaubsvorschau (Berechnung simulieren) | ❌ | ✅ (Tab "Vorschauen": Anspruchs- und Übertragsvorschau) | 🆕 |
| Urlaubsplaner (grafisch) | ✅ (ZMI Urlaubsplaner, separates Programm) | Über Abwesenheiten-Seite mit Kalender | ⚠️ Kein separater grafischer Planer |
| Resturlaub kann negativ werden | ✅ (Systemeinstellung) | Nicht explizit dokumentiert | ⚠️ |

---

## 9. TEAMS

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Teams anlegen (Name, Mitglieder) | ✅ | ✅ (Name, Abteilung, Teamleiter, Mitglieder) | ✅+ |
| Teamleiter | Nicht explizit | ✅ (Rolle: Mitglied/Leiter/Stellvertreter) | 🆕 |
| Teamübersicht (wer ist da, wer nicht) | Nicht explizit in Time | ✅ (Echtzeit-Anwesenheit, Auto-Refresh 30 Sek, 8 KPI-Karten, Diagramme) | 🆕 |
| Team-Export (CSV) | ❌ | ✅ | 🆕 |
| Kommende Abwesenheiten im Team | ❌ | ✅ (nächste 10 geplante Abwesenheiten) | 🆕 |

---

## 10. REPORTS / BERICHTE

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Stammdaten-Reports (Personal, Geburtstag, Adressen) | ✅ (11 Reports) | ✅ (Berichte: Mitarbeiter-Zeitnachweis, diverse Typen) | ✅ |
| Monatswerte-Reports (Monatsübersicht, Soll/Ist, Urlaub, Abwesenheiten, Zuschläge) | ✅ (11 Reports) | ✅ (Monatsübersicht, Abteilungszusammenfassung, Abwesenheitsbericht, Urlaubsbericht, Überstundenbericht, Kontostände) | ✅ |
| Variable Zeitangaben-Reports | ✅ (3 Reports: mit Konten, nach Konto, Konten-Übersicht) | Über Berichte + Auswertungen | ✅ |
| Projekt-Reports | ✅ (9 Reports, nur mit ZMI Auftrag) | Über Auftragsdetails → Tab Buchungen | ⚠️ Weniger Projektreports |
| Kalkulation-Reports | ✅ (3 Reports: Monatsübersicht, Deckungsbeiträge, Projektübersicht) | ❌ | ❌ Niedrige Prio |
| Team-Reports | ✅ (Teamübersicht, mit/ohne Soll, monatlich, Abwesenheiten) | ✅ (Team-Export CSV) | ⚠️ |
| Formatoptionen (PDF, XLSX, CSV, JSON) | Nicht dokumentiert (vermutlich Druck + Excel) | ✅ (PDF, XLSX, CSV, JSON) | ✅+ |
| Filteroptionen (Mitarbeiter, Abteilung, Kostenstelle, Team) | ✅ (über Grid) | ✅ (Multi-Auswahl mit Checkboxen) | ✅ |

---

## 11. AUSWERTUNGEN

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Tageswerte | ✅ (Karteireiter) | ✅ (Tab Tageswerte) | ✅ |
| Buchungen | ✅ (+ Tage ohne Buchungen anzeigen) | ✅ (Tab Buchungen + Zusatzfilter) | ✅ |
| Terminal-Buchungen | ✅ | ✅ (Tab Terminal-Buchungen) | ✅ |
| Akteneinträge | ✅ (Personal + Aufträge) | ❌ (keine Personalakte) | ❌ |
| Antragsverlauf / Workflow-Historie | ✅ | ✅ (Tab Workflow-Historie) | ✅ |
| Logeinträge (Buchungen, Fehltage, Monatskonten) | ✅ (3 Karteireiter) | ✅ (Tab Protokoll: Vorher/Nachher JSON) | ✅ |
| Grid-Layout anpassbar (Drag & Drop Spalten) | ✅ (sehr flexibel: Spalten verschieben, gruppieren, Fuß-/Gruppenfußzeilen) | Nicht so flexibel (feste Tabelle mit Filtern) | ⚠️ |
| Layouts speichern/laden/zurücksetzen | ✅ | ❌ | ❌ Niedrige Prio |
| Excel-Export aus Grid | ✅ (Rechtsklick → Export) | Über Berichte (CSV/XLSX) | ✅ |

---

## 12. SYSTEMEINSTELLUNGEN

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Optionen (Buchungsübersicht, Fehlerliste) | ✅ | ✅ (Administration → Einstellungen, 5 Abschnitte) | ✅ |
| Ende-Buchungen automatisch auffüllen | ✅ (für Auftragswechsel) | ✅ ("Auftragsbuchungen automatisch ausfüllen") | ✅ |
| Abgleich relativ zur Planzeit | ✅ | ✅ ("Rundung relativ zum Plan") | ✅ |
| Pfade/Datensicherung | ✅ (Datensicherungspfad, Akte-Pfade) | Nicht relevant (Cloud/Web-basiert) | 🆕 Kein manuelles Backup nötig |
| Fahrzeugdatenerfassung | ✅ (separates Modul) | ❌ | ❌ Nicht relevant |
| Nummernkreise (für ZMI Auftrag) | ✅ | ✅ | ✅ |
| Korrekturmeldungen anpassen | ✅ (Texte + Nummer ab 100) | ✅ (Tab "Meldungen" mit inline-Bearbeitung) | ✅ |
| Funktionen (Buchungen/Daten löschen, neu einlesen) | ✅ (6 destruktive Funktionen, nur mit ZMI Absprache) | ✅ (4 Bereinigungswerkzeuge mit 3-Schritt-Bestätigung) | ✅ |
| Programmstart (Geburtstage, Wiedervorlage) | ✅ | Dashboard zeigt offene Aktionen | ⚠️ |
| Proxy-Einstellungen | ✅ | ✅ | ✅ |
| Server Alive (E-Mail bei Fehler/Berechnung) | ✅ | ✅ (Server-Überwachung in Einstellungen) | ✅ |
| Zutrittszonen | ✅ (Karteireiter) | ✅ (Zutrittskontrolle → Zonen) | ✅ |
| Aufwandsentschädigung (Nah-/Fernmontage, km, Tage, Steuerfrei) | ✅ (detailliert konfigurierbar) | ❌ | ❌ Niedrige Prio |
| Kontaktmanagement konfigurieren | ✅ | ✅ (Verwaltung → Kontaktarten) | ✅ |
| Urlaubsberechnung + Sonderberechnungen | ✅ | ✅ (Urlaubskonfiguration) | ✅ |
| Kappungsregeln | ✅ | ✅ | ✅ |
| Beschäftigungstyp | ✅ (Nummer + Urlaubsberechnung + Kappung) | ✅ (Beschäftigungsarten + Urlaubsberechnungsgruppe) | ✅ |
| PIN-/Kartennummern-Länge | ✅ (System-Tab) | Nicht konfigurierbar dokumentiert | ⚠️ |
| Datenschutz / DSGVO (automatisches Löschen) | ✅ (Zeitraum + Datentyp konfigurierbar) | ❌ | ❌ Mittlere Prio |
| Archiv (windream Integration) | ✅ | ❌ | ❌ Nicht relevant |
| SMS-Versand | ✅ (für Führerschein-/Impfkontrollen) | ❌ | ❌ Nicht relevant |
| WebClient-Konfiguration | ✅ (Base URL) | Nicht relevant (ist Web-App) | 🆕 |
| Onboarding (Pflichtfelder bei MA-Anlage) | ✅ (ZMI Onboarding Modul) | ❌ Nicht als Modul | ❌ Niedrige Prio |

---

## 13. DATENAUSTAUSCH / LOHNEXPORT

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Lohnschnittstelle (DATEV, LODAS, Lexware, etc.) | ✅ (Export-Script pro Schnittstelle) | ✅ (Exportschnittstelle: Nummer, Name, Mandant, Script, Pfad, Dateiname) | ✅ |
| Schnittstelleninformationen (Nummer, Bezeichnung, Mandantennr., Script, Exportpfad, Dateiname) | ✅ | ✅ (identische Felder) | ✅ |
| Konten mit Lohnart zuordnen | ✅ (Konten → Exportieren-Checkbox + Lohnart) | ✅ (Konten → Lohnrelevant + Lohncode + Exportschnittstelle → Konten verwalten) | ✅ |
| Konten-Reihenfolge in Export | ✅ | ✅ (Duale-Liste mit ↑↓ Sortierung) | ✅ |
| Datenexport ausführen | ✅ (Modul Datenexport) | ✅ (Administration → Lohnexporte → "Export erstellen") | ✅ |
| Vorschau vor Download | ❌ | ✅ (breite Tabellenansicht aller Spalten) | 🆕 |
| Erweiterte Parameter (Mitarbeiter/Abteilung/Konten filtern) | ❌ | ✅ (aufklappbar im Formular) | 🆕 |
| Formatoptionen | ✅ (Script-basiert: CSV, XLS) | ✅ (CSV, XLSX, XML, JSON) | ✅+ |

---

## 14. ZMI SERVER / AUTOMATISIERUNG

| Funktion | ZMI Time | Terp | Status |
|----------|----------|------|--------|
| Automatische Termine (Scheduler) | ✅ (ZMI Server: Termine mit Aufgaben) | ✅ (Administration → Zeitpläne) | ✅ |
| 7 Zeitplan-Typen (Sekunden/Min/Std/Täglich/Wöchentlich/Monatlich/Manuell) | ✅ | ✅ (identische 7 Typen) | ✅ |
| Tage berechnen | ✅ ("Monate berechnen (Alle MA)") | ✅ (Aufgabentyp "Tage berechnen") | ✅ |
| Monate berechnen | ✅ (am 1. des Monats Vormonat durchrechnen) | ✅ (Aufgabentyp "Monate berechnen") | ✅ |
| Tagespläne generieren | ❌ (wird bei Wochenplan-Zuweisung erledigt) | ✅ (Aufgabentyp "Tagespläne generieren", jeden Sonntag) | 🆕 |
| Makros ausführen | ❌ (Makros laufen bei Monatsberechnung) | ✅ (Aufgabentyp "Makros ausführen", alle 15 Min) | ✅+ |
| Buchungsdaten aus Terminals holen | ✅ (Aufgabe im ZMI Server) | Über Terminal-Buchungen Import (manuell oder API) | ⚠️ Kein automatischer Terminal-Poll |
| Datum/Uhrzeit an Terminals setzen | ✅ | ❌ (Web-basiert, nicht relevant) | — |
| Zeitkonten an Terminals senden | ✅ | ❌ | — |
| Zutrittsdaten an Terminals senden | ✅ | ❌ | — |
| Stammdaten an Terminals senden | ✅ | ❌ | — |
| Tabellen sichern (Datenbank-Backup) | ✅ (ZMI Backup) | ✅ (Aufgabentyp "Datenbank sichern") | ✅ |
| Alive-Datensatz senden | ✅ | ✅ (Aufgabentyp "Alive-Check") | ✅ |
| DSGVO-Löschung | ✅ (Aufgabe im Server) | ❌ | ❌ Mittlere Prio |
| Push Notifications versenden | ✅ | ✅ (Aufgabentyp "Benachrichtigungen senden") | ✅ |
| Eigene Batch-Dateien ausführen | ✅ (eigeneFunktion.bat) | ❌ (kein Batch-Support) | ❌ Niedrige Prio |
| "Jetzt ausführen" Button | ❌ (nur manueller Termin) | ✅ (Button ▶ auf Detailseite) | 🆕 |
| Ausführungsprotokoll (Status, Dauer, Aufgaben x/y) | ❌ | ✅ (Tab "Ausführungen" mit aufklappbaren Details) | 🆕 |

---

## ZUSAMMENFASSUNG

### Was Terp MEHR kann als ZMI Time:

| Feature | Beschreibung |
|---------|-------------|
| 🆕 Genehmigungsworkflow für Abwesenheiten | Beantragt → Genehmigt → Storniert (ZMI nur über WebClient) |
| 🆕 Automatische Genehmigung pro Abwesenheitstyp | Schalter "Genehmigung erforderlich" |
| 🆕 Urlaubsvorschau (Kontostand-Simulation) | Bevor der Antrag abgesendet wird |
| 🆕 Wochenenden/Feiertage automatisch überspringen | Bei Abwesenheitsanträgen |
| 🆕 Teamübersicht mit Echtzeit-Anwesenheit | 8 KPI-Karten, Diagramme, Auto-Refresh, Team-Export |
| 🆕 Dashboard mit Schnellaktionen | Sofort ein-/ausstempeln, offene Aktionen, letzte Aktivitäten |
| 🆕 Stempeluhr (Web-basiert) | Große Digitaluhr, Timer, Tagesstatistiken, Pausenbutton |
| 🆕 Mobile Schnellnavigation | 4 feste Einträge am unteren Bildschirmrand |
| 🆕 Mandanten-Umschalter ohne Neuanmeldung | Dropdown in Kopfzeile |
| 🆕 Feiertage pro Abteilung beschränkbar | Geltungsbereich wählbar |
| 🆕 Bezahlte Pausen | Checkbox pro Pause |
| 🆕 Tarif-weite Pausen | Gelten für alle Tagespläne eines Tarifs |
| 🆕 Zuschlag: Mitternachtsüberschreitung automatisch | 22:00-06:00 wird intern gesplittet |
| 🆕 Zuschlag: 3 Berechnungsarten | Pro Minute, Festwert, Prozentual |
| 🆕 Zuschlag: Mindestarbeitszeit als Bedingung | Zuschlag nur ab X Stunden |
| 🆕 Schweregrad pro Fehlermeldung änderbar | Fehler ↔ Hinweis umschalten |
| 🆕 Meldungen deaktivierbar | Aktiv/Inaktiv-Schalter |
| 🆕 Vor Monatsabschluss Neuberechnung | Checkbox im Dialog |
| 🆕 Lohnexport-Vorschau vor Download | Tabellenansicht aller Spalten |
| 🆕 Zeitplan-Ausführungsprotokoll | Status, Dauer, Aufgaben pro Lauf |
| 🆕 "Jetzt ausführen" Button für Zeitpläne | Sofortige manuelle Ausführung |
| 🆕 Integriertes CRM + Belege + Lager | Ein System statt ZMI Time + orgAuftrag |
| 🆕 Web-basiert, Cloud-fähig, Responsive | Kein Desktop-Programm nötig, Multi-Device |
| 🆕 Audit-Protokoll (global) | Lückenlose Nachvollziehbarkeit aller Aktionen |
| 🆕 Benachrichtigungssystem (In-App) | Glocke mit Typen, Filtern, Einstellungen |
| 🆕 Profil-Seite (Selbstbedienung) | Mitarbeiter pflegen eigene Kontaktdaten |

### Was Terp FEHLT gegenüber ZMI Time (priorisierte Gaps):

#### Mittlere Priorität
| Gap | ZMI-Referenz | Beschreibung |
|-----|-------------|-------------|
| Personalakte mit Anhängen | Kap. 4.14 | Akteneinträge, Aktengruppen, Rechtesteuerung, Wiedervorlage, Dateianhänge |
| DSGVO-Datenlöschung automatisiert | Kap. 10.21 | Zeitraumbasierte Löschung gemäß DSGVO |
| Automatischer Terminal-Poll | Kap. 12 | Buchungen periodisch aus Hardware-Terminals holen (statt manueller Import) |

#### Niedrige Priorität
| Gap | Beschreibung |
|-----|-------------|
| Windows SingleSignOn | Windows-Benutzer zuordnen für Anmeldung ohne Passwort |
| Erweiterte Personaldaten | Geburtsdatum, Geschlecht, Staatsangehörigkeit, Konfession, Familienstand, Geburtsort |
| Bankverbindung/SV-Nr./Krankenkasse/Steuer im MA | Sozialversicherungs- und Steuerdaten |
| "Minuten Differenz" bei Mindestpausen | Nur Differenz zur Pausendauer abziehen statt volle Pause |
| Alternativ-Tagesplan (F2-Tausch) | Schnelles Tauschen eines Tagesplans per Tastendruck |
| Tagesplan temporär am Tag anpassen | Pausen entfernen, Fenster öffnen — nur für einen Tag |
| Grid-Layouts speichern/laden | Benutzerdefinierte Auswertungslayouts persistent speichern |
| Geburtstagsliste beim Start | Automatische Anzeige kommender Geburtstage |
| Führerscheinkontrolle | Modul mit Rollen, Intervallen, Eskalation |
| Aufwandsentschädigung (Reisekosten) | Nah-/Fernmontage mit km, Tagessätzen, Steuerfrei-Berechnung |
| Kartendruck | Ausweiskarten drucken |
| Eigene Batch-Dateien im Scheduler | Custom Scripts in der Automatisierung ausführen |
| Fehltage per F-Taste schnell erfassen | Tastaturkürzel im Urlaubsplaner |
| Passwort-Komplexität detailliert konfigurierbar | Mindestlänge, Groß/Klein, Ziffern, Sonderzeichen als separate Einstellungen |
| Kappungskonto (gekapte Zeit separat) | Zeit die über Max-Netto hinausgeht in eigenem Konto |
| Auslagen/Belege pro Mitarbeiter | Kostentyp, Anzahl, Bruttobetrag |
| Dienstwagen-Verwaltung | Fahrzeugdaten pro Mitarbeiter |
| Grafischer Urlaubsplaner (separates Tool) | Visuelle Jahresplanung mit Drag & Drop |
