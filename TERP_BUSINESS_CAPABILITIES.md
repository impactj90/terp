# Terp — Business Capabilities

> Stand: 2026-04-07 | Erstellt auf Basis des produktiven Codestands (Branch: staging)

## 1. Überblick

Terp ist eine cloudbasierte ERP-Plattform für kleine und mittlere Unternehmen, die Personalverwaltung, Zeiterfassung, Abwesenheitsmanagement, Auftragsabwicklung, CRM, Fakturierung und Lagerverwaltung in einer integrierten Lösung vereint. Die Software richtet sich an Unternehmen mit 10–500 Mitarbeitern, die operative Geschäftsprozesse digitalisieren und Lohnabrechnungsdaten automatisiert an DATEV exportieren möchten.

---

## 2. Fachliche Module

### 2.1 Personalstammdaten & Organisation

- **Zweck:** Zentrale Verwaltung aller Mitarbeiter-, Abteilungs- und Standortdaten als Grundlage für alle weiteren Module.
- **Kernfunktionen:**
  - Mitarbeiterverwaltung mit Personal-, Vertrags- und Beschäftigungsdaten
  - Automatische Vergabe von Personalnummern
  - Abteilungshierarchie mit unbegrenzter Verschachtelungstiefe und Abteilungsleitern
  - Standortverwaltung mit Adresse und Zeitzone
  - Kostenstellen für Auswertungen und Lohnexport
  - Teams mit Teamleiter und Rollenzuweisung (Mitglied / Leiter / Stellvertreter)
  - Beschäftigungsarten (Vollzeit, Teilzeit, Minijob, Azubi, Werkstudent, Praktikant)
  - Mitarbeitergruppen, Workflowgruppen und Tätigkeitsgruppen zur Klassifizierung
  - Kontaktdaten mit konfigurierbaren Kontaktarten und -unterarten
  - Mitarbeiternachrichten an einzelne Personen, Abteilungen oder alle
  - Massentarifzuweisung für mehrere Mitarbeiter gleichzeitig
  - Profilseite mit persönlichen Daten, Kontakten, Zugangskarten und Kontoeinstellungen
- **Wer nutzt es:** HR-Administratoren, Abteilungsleiter, Geschäftsführung
- **Typische Use Cases:**
  - Neuen Mitarbeiter anlegen und einer Abteilung, einem Standort und einem Arbeitszeitmodell zuweisen
  - Abteilungsstruktur reorganisieren und Mitarbeiter verschieben
  - Beschäftigungsart eines Mitarbeiters von Teilzeit auf Vollzeit ändern und das Arbeitszeitmodell anpassen
  - Massenhafte Tarifzuweisung nach einer Betriebsvereinbarung

### 2.2 Zeiterfassung

- **Zweck:** Erfassung, Berechnung und Auswertung der Arbeitszeiten aller Mitarbeiter.
- **Kernfunktionen:**
  - Digitale Stempeluhr (Kommen, Gehen, Pause, Dienstgang) im Browser
  - Laufende Anzeige der Arbeitszeit und des aktuellen Status
  - Zeitnachweis in Tages-, Wochen- und Monatsansicht mit Bearbeitungsmöglichkeit
  - Automatische Tagesberechnung in 10 Schritten: Buchungspaare bilden, Toleranzen anwenden, Rundung, Fenster-Kappung, Bruttzeit berechnen, Pausen abziehen, Nettozeit ermitteln, Überstunden berechnen
  - Tages- und Wochenpläne als Arbeitszeitvorlagen mit flexiblen Parametern (Sollzeit, Kernzeit, Toleranzen, Rundung, Nachtschicht-Verhalten, automatische Schichterkennung)
  - Tarife als übergeordnete Arbeitszeitmodelle mit Wochen-, Rollier- oder X-Tage-Rhythmus
  - Zuschlagsberechnung nach Zeitfenster (pro Minute, Festbetrag oder prozentual)
  - Pausenregeln auf Tagesplan- oder Tarifebene (fest, variabel, Mindestdauer, automatischer Abzug)
  - Flexzeitkonto mit vier Übertragungsarten (keine / vollständig / ab Schwelle / keine Übernahme)
  - Monatliche Auswertung pro Mitarbeiter mit Monatsabschluss und Wiedereröffnung
  - Jahresübersicht mit Flexzeitverlauf und monatlicher Aufschlüsselung
  - Teamübersicht mit Echtzeit-Anwesenheitsstatus, Anwesenheitsmuster und automatischer Aktualisierung
  - Import von Terminal-Buchungen (bis zu 5.000 pro Charge) mit Duplikatschutz
  - Manuelle Korrekturen mit Genehmigungsworkflow (beantragt, genehmigt, abgelehnt)
  - Korrekturassistent mit 23 automatisch erkannten Fehlertypen (fehlende Buchung, unpaarige Buchung, Kernzeitverletzung, Pausenverstoß u.v.m.)
  - Konten für Bonus-, Erfassungs- und Saldowerte (z.B. Überstunden, Zuschläge, Nachtzulagen)
  - Auswertungsvorlagen mit konfigurierbaren Flexzeit-Grenzen und Überstundenschwellen
- **Wer nutzt es:** Alle Mitarbeiter (Stempeluhr, Zeitnachweis), Vorgesetzte (Genehmigungen, Teamübersicht), HR/Lohnbuchhaltung (Monatsabschluss, Auswertungen)
- **Typische Use Cases:**
  - Mitarbeiter stempelt morgens ein, macht Pause und stempelt abends aus — das System berechnet die Nettoarbeitszeit automatisch
  - Vorgesetzter prüft die Teamübersicht und genehmigt offene Zeitkorrekturen
  - HR schließt den Monat ab und exportiert die Daten für die Lohnabrechnung
  - Korrekturassistent zeigt fehlende Buchungen an, HR ergänzt die fehlende Gehen-Buchung

### 2.3 Schichtplanung

- **Zweck:** Visuelle Planung und automatische Zuweisung von Schichten für Mitarbeiter.
- **Kernfunktionen:**
  - Schichtdefinitionen mit Code, Name, Farbe und optionaler Qualifikationsanforderung
  - Planungstafel in Wochen-, Zweiwochenund Monatsansicht mit Abteilungsfilter
  - Einzelund Massenzuweisung von Schichten zu Mitarbeitern
  - Automatische Schichtplan-Generierung aus Tarifen (14 Tage voraus, wöchentlich per Hintergrundjob)
  - Rollierende Schichtrhythmen (z.B. Früh-Spät-Nacht im Wechsel)
  - Automatische Schichterkennung anhand von bis zu 6 alternativen Tagesplänen
  - Nachtschicht-Unterstützung mit vier konfigurierbaren Verhaltensweisen bei Mitternachtsüberschreitung
- **Wer nutzt es:** Schichtplaner, Abteilungsleiter, Produktionsleiter
- **Typische Use Cases:**
  - Schichtplaner erstellt einen 3-Schicht-Rhythmus (Früh/Spät/Nacht) und weist ihn einem Team zu
  - System generiert jeden Sonntag automatisch die Schichtpläne für die kommenden zwei Wochen
  - Mitarbeiter arbeitet abweichend von der geplanten Schicht — automatische Schichterkennung wählt den passenden Tagesplan

### 2.4 Abwesenheiten & Urlaub

- **Zweck:** Verwaltung von Urlaubsansprüchen, Abwesenheitsanträgen und deren Genehmigung.
- **Kernfunktionen:**
  - Abwesenheitsantrag mit Typ, Zeitraum, halbtägiger Option und Urlaubssaldo-Vorschau
  - Kalenderansicht mit farbcodierten Abwesenheitstypen
  - Genehmigungsworkflow (beantragt → genehmigt / abgelehnt / storniert) mit optionaler Auto-Genehmigung
  - Urlaubskonto mit Anspruch, Übertrag, Anpassungen und Resturlaub
  - Automatische Urlaubsanspruchsberechnung: anteilig bei unterjährigem Eintritt, Teilzeitskalierung, Sondertage nach Alter/Betriebszugehörigkeit/Behinderung
  - Urlaubsberechnungsgruppen, die Beschäftigungsarten mit Berechnungsregeln verknüpfen
  - Kappungsregeln für den Urlaubsübertrag am Jahresende mit Gruppenund Einzelausnahmen
  - Jahresinitialisierung der Urlaubskonten (einzeln oder für alle aktiven Mitarbeiter)
  - Automatische Aktualisierung des Urlaubskontos und Neuberechnung der Tageswerte nach Genehmigung
  - Konfigurierbare Abwesenheitstypen (Urlaub, Krankheit, Sonderurlaub, unbezahlt) mit Berechnungsregeln
  - Abwesenheitstyp-Gruppen für übersichtliche Organisation
- **Wer nutzt es:** Alle Mitarbeiter (Antrag), Vorgesetzte (Genehmigung), HR (Konfiguration, Jahresabschluss)
- **Typische Use Cases:**
  - Mitarbeiter beantragt 5 Tage Urlaub und sieht sofort den verbleibenden Resturlaub
  - Vorgesetzter genehmigt den Antrag — System bucht automatisch den Urlaubstag ab und passt die Tagesberechnung an
  - HR führt den Jahreswechsel durch: Resturl ab wird übertragen, Kappungsregeln greifen, neue Ansprüche werden initialisiert
  - Mitarbeiter mit Schwerbehinderung erhält automatisch 5 zusätzliche Urlaubstage

### 2.5 Aufträge & Projektzeiterfassung

- **Zweck:** Zuordnung von Arbeitszeiten zu Aufträgen und Projekten für Nachkalkulation und Abrechnung.
- **Kernfunktionen:**
  - Auftragsverwaltung mit Code, Kundenverknüpfung (aus CRM), Kostenstelle und Stundensatz
  - Auftragsstatus: geplant, aktiv, abgeschlossen, storniert
  - Zuweisung von Mitarbeitern zu Aufträgen mit Rollenzuordnung (Mitarbeiter, Leiter, Vertrieb) und Gültigkeitszeitraum
  - Tätigkeiten als Untergliederung von Aufträgen (z.B. Montage, Dokumentation, Planung)
  - Manuelle Zeitbuchung auf Aufträge und Tätigkeiten
  - Verknüpfung mit CRM-Anfragen und Fakturierungsbelegen
- **Wer nutzt es:** Projektleiter, Mitarbeiter (Zeitbuchung), Controlling (Auswertung)
- **Typische Use Cases:**
  - Projektleiter legt einen neuen Auftrag an, verknüpft ihn mit einem CRM-Kunden und weist Mitarbeiter zu
  - Monteur bucht 4 Stunden auf den Auftrag „Umbau Halle 7", Tätigkeit „Montage"
  - Controlling wertet die gebuchten Stunden pro Auftrag und Kostenstelle aus

### 2.6 Kundenbeziehungsmanagement (CRM)

- **Zweck:** Verwaltung von Kunden, Lieferanten und allen zugehörigen Geschäftsvorgängen.
- **Kernfunktionen:**
  - Adressverwaltung mit drei Typen: Kunde, Lieferant, Beides — mit automatischer Nummernvergabe (K-, L-Präfix)
  - Umfangreiche Adressdaten: Firma, Anschrift, Kommunikation, Steuernummer, USt-IdNr., Leitweg-ID, Zahlungsbedingungen (Zahlungsziel, zweistufiges Skonto, Rabattgruppe)
  - Firmenverbund (Konzern/Filiale-Hierarchie mit bis zu zwei Ebenen)
  - Kontaktpersonen pro Adresse mit automatischer Briefanrede und Hauptkontakt-Kennzeichnung
  - Bankverbindungen pro Adresse (IBAN, BIC) mit Standard-Kennzeichnung
  - Korrespondenz-Protokoll (Telefon, E-Mail, Brief, Fax, Besuch) mit Dateianhängen (bis 5 pro Eintrag, 10 MB)
  - Anfragen (Vorgänge) mit automatischer Nummerierung (V-), Statusworkflow (Offen → In Bearbeitung → Geschlossen / Storniert), Aufwandsschätzung und Verknüpfung zu Aufträgen
  - Aufgaben und Nachrichten mit Zuweisung an Mitarbeiter oder Teams, Fälligkeitsdatum und Statusworkflow
  - „Meine Aufgaben"-Filter für die eigene Aufgabenliste
  - CRM-Auswertungen: 4 Kennzahlen, 5 Berichtstypen (Adress-Statistik, Korrespondenz, Anfragen-Pipeline, Aufgaben, Konzernauswertung)
  - Konfigurierbare Nummernkreise für Kunden, Lieferanten und Anfragen
- **Wer nutzt es:** Vertrieb, Einkauf, Kundenservice, Geschäftsführung
- **Typische Use Cases:**
  - Vertrieb legt einen neuen Kunden an, erfasst Kontaktpersonen und Bankverbindung
  - Innendienst protokolliert ein Telefonat und erstellt eine Anfrage mit Aufwandsschätzung
  - Vertrieb schließt eine Anfrage ab und erzeugt daraus direkt einen Auftrag
  - Geschäftsführung wertet die Anfragen-Pipeline nach Aufwand und Abschlussquote aus

### 2.7 Fakturierung & Belegwesen

- **Zweck:** Erstellung, Verwaltung und Versand von Geschäftsbelegen über die gesamte Belegkette hinweg.
- **Kernfunktionen:**
  - Sieben Belegtypen: Angebot (A-), Auftragsbestätigung (AB-), Lieferschein (LS-), Leistungsnachweis (LN-), Rücklieferung (R-), Rechnung (RE-), Gutschrift (G-)
  - Belegkette: Angebot → Auftragsbestätigung → Lieferschein / Leistungsnachweis → Rechnung; Rücklieferung → Gutschrift — mit automatischer Fortführung
  - Positionstypen: Artikel (aus Lagerstamm), Freitext, Textzeile, Seitenumbruch, Zwischensumme
  - Drag-and-Drop-Sortierung der Positionen
  - Preistypen: Standard, Richtpreis, Nach Aufwand
  - Automatische PDF-Erzeugung beim Abschließen
  - E-Rechnung nach ZUGFeRD 2.x (EN 16931, COMFORT-Profil) mit CII-XML eingebettet in PDF/A-3
  - XRechnung-Unterstützung für öffentliche Auftraggeber (über Leitweg-ID)
  - Zahlungsbedingungen: Zahlungsziel, zweistufiges Skonto — vorbelegt aus Kundenstamm
  - Offene-Posten-Verwaltung mit Teilzahlungen, Skontoabzug und Stornierung
  - Statusverfolgung: Offen, Teilzahlung, Bezahlt, Überzahlt, Überfällig
  - Gutschrift reduziert den offenen Betrag automatisch
  - Wiederkehrende Rechnungen mit konfigurierbarem Intervall (monatlich bis jährlich) und automatischer Erzeugung
  - Verkaufspreislisten mit Mengenstaffel und kundenbezogenen Sonderpreisen
  - Dokumentvorlagen mit Platzhaltern (Briefanrede, Firma, Kontaktperson) und Standard-Zuweisung
  - Kundendienst-Vorgänge (KD-) mit eigenem Workflow (Offen → In Bearbeitung → Abgeschlossen → Abgerechnet) und direkter Rechnungserstellung
  - Artikelreservierungen: Bei Auftragsbestätigung wird der Lagerbestand automatisch reserviert
  - E-Mail-Versand von Belegen mit SMTP-Konfiguration, Vorlagen und Versandprotokoll
  - Briefkopf-Konfiguration mit Firmenlogo, Bankdaten und Fußzeile
- **Wer nutzt es:** Vertrieb (Angebote, Auftragsbestätigungen), Lager (Lieferscheine), Buchhaltung (Rechnungen, Gutschriften, Zahlungen), Kundendienst (Service-Vorgänge)
- **Typische Use Cases:**
  - Vertrieb erstellt ein Angebot für einen CRM-Kunden und führt es nach Bestätigung zur Auftragsbestätigung fort
  - Lager erzeugt einen Lieferschein aus der Auftragsbestätigung — reservierter Bestand wird freigegeben
  - Buchhaltung erstellt die Rechnung, das System erzeugt automatisch eine ZUGFeRD-konforme E-Rechnung
  - Kunde zahlt in zwei Raten — beide Teilzahlungen werden erfasst, Skonto wird beim ersten Mal berücksichtigt

### 2.8 Lagerverwaltung & Einkauf

- **Zweck:** Verwaltung von Artikelstammdaten, Beständen, Einkaufsbestellungen und Warenbewegungen.
- **Kernfunktionen:**
  - **Artikelstamm:** Automatische Artikelnummern, hierarchische Artikelgruppen (Baumstruktur), Einheiten (Stk, kg, m, Std, l, Paar, Pkt, Set), VK-/EK-Preis, MwSt-Satz, Bestandsführung mit Mindestbestand und Lagerort
  - **Lieferantenzuordnung:** Mehrere Lieferanten pro Artikel mit Lieferanten-Artikelnr., EK-Preis, Lieferzeit und Hauptlieferant-Kennzeichnung
  - **Stücklisten:** Artikel-in-Artikel-Zuordnung mit Mengenangabe
  - **Einkaufspreislisten:** Benannte Listen mit Preispflege, Mengenrabatt, prozentualer Massenanpassung und Kopie
  - **Bestandskorrektur:** Manuelle Bestandsanpassung mit Delta-Eingabe und Begründung
  - **Einkaufsbestellungen:** Automatische Nummerierung (BES-), Workflow (Entwurf → Bestellt → Teilweise geliefert → Vollständig geliefert / Storniert), PDF-Erzeugung, E-Mail-Versand
  - **Nachbestellvorschläge:** Automatische Erkennung von Artikeln unter Mindestbestand mit Bestellmengen-Vorschlag und automatischer Bestellerzeugung pro Lieferant
  - **Wareneingangs-Terminal:** Vier-Schritt-Assistent (Lieferant → Bestellung → Mengen → Bestätigung) mit Unterstützung von Teillieferungen
  - **Lagerentnahmen:** Entnahme-Terminal mit Referenztypen (Auftrag, Lieferschein, Maschine, ohne Referenz), Bestandsprüfung und Mindestbestandswarnung
  - **Storno von Entnahmen:** Bestand wird wiederhergestellt
  - **Bestandsbewegungen:** Vollständiges chronologisches Protokoll aller Warenbewegungen (Wareneingang, Entnahme, Korrektur, Inventur, Rücksendung, Lieferschein)
  - **Artikelreservierungen:** Automatisch bei Auftragsbestätigung, manuell freigebbar, Massenfreigabe
  - **Lieferantenrechnungen:** Erfassung mit Verknüpfung zu Bestellungen, Zahlungsziel, zweistufigem Skonto, Teilzahlungen, Storno
  - **Korrekturassistent:** Automatische Prüfung von 6 Regeln (negativer Bestand, doppelter Wareneingang, überfällige Bestellung, nicht zugeordneter Wareneingang, Bestandsabweichung, niedriger Bestand ohne Bestellung) mit täglicher und manueller Ausführung
  - **QR-Scanner:** Browser-basierter Scanner per Smartphone-Kamera, QR-Etikettendruck (Avery Zweckform L4736, 48 Etiketten/A4), Sofort-Aktionen (Wareneingang, Entnahme, Storno)
  - **Artikelbilder:** Galerie mit Hauptbild und Lightbox-Ansicht
  - **Lagerverwaltungs-Dashboard:** 5 Kennzahlen (Gesamtbestandswert, Unterbestand, offene Bestellungen, offene/überfällige Lieferantenrechnungen), Nachbestellvorschläge, ausstehende Wareneingänge, letzte Bewegungen
- **Wer nutzt es:** Lagerverwalter, Einkauf, Buchhaltung (Lieferantenrechnungen), Fertigung (Entnahmen)
- **Typische Use Cases:**
  - Lagerverwalter scannt einen QR-Code am Regal und bucht direkt eine Entnahme für den Auftrag
  - System erkennt automatisch, dass der Schraubenbestand unter den Mindestbestand gefallen ist, und schlägt eine Nachbestellung beim Hauptlieferanten vor
  - Wareneingang wird im Terminal erfasst — Bestand steigt, Bestellstatus wechselt automatisch auf „Vollständig geliefert"
  - Buchhaltung erfasst die Lieferantenrechnung, verknüpft sie mit der Bestellung und bucht die Zahlung mit Skonto

### 2.9 Eingangsrechnungen

- **Zweck:** Automatisierte Erfassung, Prüfung, Freigabe und DATEV-Export von Eingangsrechnungen.
- **Kernfunktionen:**
  - Manueller PDF-Upload oder automatischer Empfang per IMAP-E-Mail-Polling (alle 3 Minuten)
  - Automatische Erkennung und Auswertung von ZUGFeRD/XRechnung-Daten (MINIMUM bis EXTENDED und XRECHNUNG-Profile)
  - Automatische Lieferantenzuordnung über USt-ID, Steuernummer, E-Mail-Domain oder Namensabgleich (>85% Übereinstimmung)
  - Erfassung von Rechnungspositionen mit Validierung der Positionssumme gegen den Kopfbetrag
  - Mehrstufiger Freigabeworkflow mit konfigurierbaren Regeln nach Betragsspanne
  - Vier-Augen-Prinzip: Der Einreicher darf die eigene Rechnung nicht freigeben
  - Automatische Eskalation bei überfälligen Freigaben (stündliche Prüfung, 24h-Abstand zwischen Erinnerungen)
  - Ablehnungspflicht mit Begründung und Benachrichtigung des Einreichers
  - DATEV-Export (CSV, Windows-1252, Semikolon, BU-Schlüssel für MwSt-Sätze)
  - Statusworkflow: Entwurf → Freigabe ausstehend → Freigegeben → Exportiert (rücksetzbar) / Storniert
  - E-Mail-Eingangslog mit Statusanzeige (verarbeitet, fehlgeschlagen, kein PDF, Duplikat)
  - Automatische Benachrichtigung bei 3+ aufeinanderfolgenden IMAP-Fehlern
  - Detailansicht mit PDF-Vorschau neben Formulardaten und Freigabeverlauf
- **Wer nutzt es:** Buchhaltung (Erfassung, Export), Kostenstellenverantwortliche (Freigabe), IT-Administration (IMAP-Konfiguration)
- **Typische Use Cases:**
  - Lieferant sendet eine ZUGFeRD-Rechnung per E-Mail — System erkennt die PDF automatisch, liest Rechnungsdaten aus und ordnet den Lieferanten zu
  - Buchhaltung prüft die Rechnung und reicht sie zur Freigabe ein — der zuständige Abteilungsleiter erhält eine Benachrichtigung
  - Abteilungsleiter gibt die Rechnung frei — bei Beträgen über 10.000 € ist eine zweite Freigabe erforderlich
  - Nach Freigabe exportiert die Buchhaltung die Rechnung als DATEV-Buchungsstapel

### 2.10 Personalakte

- **Zweck:** Digitale Ablage und Verwaltung personalrelevanter Dokumente mit Fristen- und Wiedervorlage-Management.
- **Kernfunktionen:**
  - 7 Standardkategorien: Verträge, Zertifikate, Unterweisungen, Abmahnungen, Weiterbildung, Arbeitsmedizin, Sonstige
  - Benutzerdefinierte Kategorien mit Farbcodierung und rollenbasierter Sichtbarkeit
  - Dokument-Einträge mit Titel, Datum, Beschreibung, Ablaufdatum und Wiedervorlagedatum
  - Vertraulichkeits-Kennzeichnung für sensible Einträge (zusätzliche Berechtigung erforderlich)
  - Dateianhänge: bis zu 10 Dateien pro Eintrag, max. 20 MB, PDF/JPEG/PNG/WebP/DOCX/XLSX
  - Automatische Warnung bei Ablauf in den nächsten 30 Tagen (gelb) und überschrittenem Ablaufdatum (rot)
  - HR-Übersichtsseite mit zwei Tabs: Fällige Wiedervorlagen und ablaufende Einträge
  - Dashboard-Widget mit Zusammenfassung der offenen Wiedervorlagen und ablaufenden Dokumente
  - Zugriff über Mitarbeiter-Detailseite (Tab „Personalakte") und über die Seitenleiste
- **Wer nutzt es:** HR-Abteilung, Vorgesetzte (eingeschränkt), Mitarbeiter (Selbstbedienung)
- **Typische Use Cases:**
  - HR hinterlegt einen neuen Arbeitsvertrag mit Ablaufdatum für die Befristung
  - System warnt automatisch 30 Tage vor Ablauf einer Sicherheitsunterweisung
  - HR setzt eine Wiedervorlage für ein Zwischenzeugnis auf den 15. des Folgemonats

### 2.11 Zutrittskontrolle

- **Zweck:** Verwaltung physischer Zugangsberechtigungen und Integration mit Zeiterfassungsterminals.
- **Kernfunktionen:**
  - Zugangszonen: Definition physischer Bereiche (z.B. Halle, Büro, Parkhaus)
  - Zugangsprofile: Bündelung von Zonenberechtigungen zu Profilen
  - Zuweisung von Profilen zu Mitarbeitern mit Gültigkeitszeitraum
  - RFID-Kartenverwaltung pro Mitarbeiter mit Aktivierung und Deaktivierung
  - Import von Terminal-Buchungen per CSV (bis zu 5.000 Datensätze pro Charge)
  - Automatische Zuordnung: PIN → Mitarbeiter, Buchungscode → Buchungstyp
  - Duplikatschutz über Chargenreferenz
- **Wer nutzt es:** Facility Management, HR (Kartenverwaltung), Sicherheitsbeauftragte
- **Typische Use Cases:**
  - Neuer Mitarbeiter erhält eine RFID-Karte und wird dem Zugangsprofil „Fertigung" zugewiesen
  - Terminal-Buchungen aus dem Schrankenanlage werden importiert und den Mitarbeitern zugeordnet
  - Mitarbeiter verlässt das Unternehmen — RFID-Karte wird deaktiviert und Profilzuweisung beendet

### 2.12 Lohn- & Gehaltsexport

- **Zweck:** Aufbereitung und Export der Zeiterfassungsdaten für externe Lohnabrechnungssysteme.
- **Kernfunktionen:**
  - Lohnexport für beliebige Monate in den Formaten CSV, XLSX, XML, JSON
  - Unterstützung für DATEV LODAS und DATEV Lohn und Gehalt
  - Exportschnittstellen: Konfigurierbare Zuordnung von Konten zu Spalten mit Sortierung
  - Vorschau der Exportdaten vor Erzeugung (Zeile für Zeile)
  - Exportierte Spalten: Personalnummer, Vorname, Nachname, Abteilung, Kostenstelle, Sollstunden, Ist-Stunden, Überstunden, Urlaubstage, Krankheitstage und konfigurierte Konten
  - Download der erzeugten Exportdateien
  - Datenbereichsfilter: Nur Mitarbeiter im eigenen Sichtbereich werden exportiert
- **Wer nutzt es:** Lohnbuchhaltung, Steuerberater (als Empfänger der Exportdatei)
- **Typische Use Cases:**
  - Lohnbuchhaltung schließt den Monat für alle Mitarbeiter ab, erzeugt den DATEV-Export und übermittelt die Datei an den Steuerberater
  - Steuerberater meldet eine Abweichung — Lohnbuchhaltung öffnet den Monat wieder, korrigiert und erzeugt einen neuen Export

### 2.13 E-Mail-Versand

- **Zweck:** Versand von Geschäftsbelegen und Systembenachrichtigungen per E-Mail.
- **Kernfunktionen:**
  - SMTP-Konfiguration pro Mandant (Server, Port, Verschlüsselung, Absender, Antwort-an) mit Verbindungstest
  - E-Mail-Vorlagen pro Belegtyp mit Platzhaltern (Kundenname, Anrede, Dokumentennummer, Betrag, Fälligkeit, Firma, Projekt)
  - Ein-Klick-Erstellung von 8 Standardvorlagen
  - Versanddialog: Empfänger vorbelegt aus CRM-Kontakt, CC-Feld, Betreff und Text aus Vorlage, Beleg-PDF als Anhang
  - Versandprotokoll mit Status (Gesendet, Ausstehend, Wird wiederholt, Fehlgeschlagen)
  - Automatischer Wiederholungsversand: bis zu 3 Versuche mit steigenden Wartezeiten (1, 5, 15 Minuten)
  - Standard-Anhänge (z.B. AGB-PDF) pro Belegtyp konfigurierbar
- **Wer nutzt es:** Vertrieb (Angebote, Auftragsbestätigungen), Buchhaltung (Rechnungen), Einkauf (Bestellungen)
- **Typische Use Cases:**
  - Vertrieb schließt ein Angebot ab und versendet es per E-Mail direkt aus dem System — die Vorlage setzt automatisch die Briefanrede und den Betrag ein
  - Ein E-Mail-Versand schlägt fehl — System wiederholt automatisch nach 1, 5 und 15 Minuten

---

## 3. Übergreifende Fähigkeiten

### 3.1 Mandantenfähigkeit
Terp unterstützt mehrere Mandanten (Unternehmen/Gesellschaften) in einer Installation. Jeder Mandant hat eigene Stammdaten, Berechtigungen, Module und Konfigurationen. Benutzer können mehreren Mandanten zugeordnet sein und im laufenden Betrieb zwischen Mandanten wechseln. Der Zugriff auf Mandanten ist über eine Zuordnungstabelle gesteuert — ein Benutzer sieht nur die ihm freigeschalteten Mandanten.

### 3.2 Rollen- & Berechtigungssystem
Zweistufiges Berechtigungsmodell: Rolle (Benutzer / Administrator) und Berechtigungsgruppen mit 147 Einzelberechtigungen. Berechtigungsgruppen werden Benutzern zugewiesen und steuern den Zugriff auf Module, Menüeinträge und einzelne Aktionen. Zusätzlich existiert ein Daten-Sichtbereich (Alle / Mandant / Abteilung / Mitarbeiter), der einschränkt, welche Datensätze ein Benutzer sehen und bearbeiten darf.

### 3.3 Modulaktivierung
Fünf Module: Kern (immer aktiv), CRM, Fakturierung, Lagerverwaltung, Eingangsrechnungen. Module werden pro Mandant aktiviert oder deaktiviert. Nicht aktivierte Module sind weder in der Navigation sichtbar noch über die Schnittstelle erreichbar.

### 3.4 Audit-Trail
Lückenlose Protokollierung aller Änderungen mit Zeitstempel, Benutzer, Aktion, betroffener Entität und Vorher-/Nachher-Vergleich als JSON-Diff. 19 Entitätstypen und 11 Aktionstypen werden erfasst. Durchsuchbar nach Zeitraum, Benutzer, Entitätstyp und Aktion. Export nicht verfügbar — nur Leseansicht.

### 3.5 Benachrichtigungssystem
In-App-Benachrichtigungen mit Echtzeit-Zustellung (Server-Sent Events). Vier Kategorien: Genehmigungen, Fehler, Erinnerungen, System. Benutzer können Kategorien individuell ein-/ausschalten. Ungelesene Anzahl wird als Badge in der Kopfzeile angezeigt und bei neuen Benachrichtigungen sofort aktualisiert.

### 3.6 Automatisierung
- **Hintergrundjobs:** 9 automatische Aufgaben — tägliche Zeitberechnung (02:00 Uhr), monatliche Monatsberechnung (2. des Monats, 03:00 Uhr), wöchentliche Schichtplan-Generierung (Sonntag, 01:00 Uhr), 15-minütige Makro-Ausführung, tägliche wiederkehrende Rechnungen (04:00 Uhr), tägliche Lager-Korrekturprüfung (06:00 Uhr), 5-minütige E-Mail-Wiederholungsversuche, 3-minütiges IMAP-Polling für Eingangsrechnungen, stündliche Freigabe-Eskalation
- **Makros:** Konfigurierbare Automatisierungen (wöchentlich/monatlich) mit Aktionen: Protokolleintrag, Sollstunden-Neuberechnung, Flexzeit-Reset, Kontostand-Übertrag. Zuweisbar an Tarife oder einzelne Mitarbeiter
- **Zeitpläne:** Konfigurierbare Intervalle (Sekunden bis monatlich oder manuell) mit 8 Aufgabentypen

### 3.7 DSGVO-Datenlöschung
Konfigurierbare Aufbewahrungsfristen pro Datentyp (9 Typen: Buchungen, Tageswerte, Abwesenheiten, Monatswerte, Audit-Protokoll, Terminal-Rohdaten, Personalakten, Korrekturmeldungen, Lagerbewegungen). Vorschau der betroffenen Datensätze vor Ausführung. Manuelle Ausführung mit 3-Schritt-Bestätigung. Automatische monatliche Ausführung ist vorbereitet, aber aktuell nicht aktiviert. Warnung bei Unterschreitung gesetzlicher Mindestfristen (Arbeitsrecht 10 Jahre, HGB §257 10 Jahre, Steuerrecht 5 Jahre).

### 3.8 KI-Assistent
Integrierter Assistent, der Fragen zum System in zwei Modi beantwortet: kompakt und ausführlich. Verfügbar als Chat-Interface mit Konversationsverlauf. Nutzung ist ratenbegrenzt.

### 3.9 Berichtswesen
Berichtsgenerierung für 10 Berichtstypen: Tagesübersicht, Wochenübersicht, Monatsübersicht, Mitarbeiter-Zeitnachweis, Abteilungszusammenfassung, Abwesenheitsbericht, Urlaubsbericht, Überstundenbericht, Kontostände, Benutzerdefiniert. Exportformate: PDF, XLSX, CSV, JSON.

### 3.10 Mehrsprachigkeit
Benutzeroberfläche in Deutsch und Englisch. Sprache wird pro Benutzer gewählt.

### 3.11 Integrierte Hilfe
Eingebaute Hilfeseite (/hilfe), die das vollständige Benutzerhandbuch als formatierte Webseite darstellt.

---

## 4. Was Terp NICHT kann (Stand heute)

- **Finanzbuchhaltung:** Terp erzeugt Lohn- und DATEV-Exporte, führt aber selbst keine doppelte Buchführung, keine Bilanz und keine GuV. Die Eingangsrechnungs-Freigabe ersetzt keine Buchhaltungssoftware.
- **Produktionsplanung:** Keine Fertigungsaufträge, keine Stücklistenauflösung für die Produktion, keine Kapazitätsplanung. Stücklisten existieren nur informativ im Lager.
- **Bestandsbewertung:** Kein FIFO, LIFO oder gewichteter Durchschnitt. Der Lagerwert basiert ausschließlich auf dem aktuellen Verkaufs- oder Einkaufspreis.
- **EDI / Elektronischer Datenaustausch:** Keine automatische Bestellübermittlung an Lieferanten via EDI, EDIFACT oder Punchout. Bestellungen werden manuell per E-Mail, Fax oder Druck versendet.
- **Native Mobilapp:** Keine eigenständige App für iOS oder Android. Die Anwendung ist responsiv und funktioniert im mobilen Browser, ist aber keine installierbare App.
- **Dokumentenmanagement-System (DMS):** Kein allgemeines DMS mit Versionierung, Workflows und Volltextsuche. Dokumente können in der Personalakte und als Korrespondenz-Anhänge gespeichert werden, aber nicht in einer zentralen, durchsuchbaren Ablage.
- **E-Commerce / Webshop-Anbindung:** Keine Schnittstelle zu Online-Shops (Shopify, WooCommerce, etc.). Kein Produktkatalog für Endkunden.
- **Kundenselbstbedienungsportal:** Kein Portal, in dem Kunden eigene Aufträge, Lieferstatus oder Rechnungen einsehen können.
- **Business Intelligence / Management-Dashboards:** Berichte existieren, aber kein interaktives Dashboard mit Pivot-Tabellen, Drill-down oder frei konfigurierbaren Kennzahlen.
- **Zahlungsverkehr / Banking-Integration:** Keine SEPA-Überweisungserzeugung, kein Kontoauszugsimport, keine Bankanbindung. Zahlungen werden nur manuell erfasst.
- **Reisekostenabrechnung:** Die Datenmodelle für Fahrzeuge, Fahrtenbuch und Reisekostenregeln existieren, aber die Berechnung hat kein vollständiges Benutzer-Interface — nur eine Vorschau-Funktion im Backend.
- **Inventur-Workflow:** Inventurbestandsaufnahme ist im QR-Scanner als Aktion vorgesehen, aber die Schaltfläche ist im Code als deaktiviert markiert.
- **Automatische Bankdatenvalidierung:** Keine IBAN-Prüfung oder BIC-Lookup.
- **Schnittstellen zu Drittsystemen:** Außer DATEV-Export und IMAP-Polling existieren keine REST-APIs, Webhooks oder Integrationen zu externen Systemen (kein SAP, kein SAGE-Import, kein Kalender-Sync, kein SSO über SAML/OIDC).

---

## 5. Reifegrad-Einschätzung pro Modul

### Produktivreif
*Vollständig nutzbar: Datenmodell, Backend-Logik und Benutzeroberfläche sind vorhanden und konsistent.*

| Modul | Bemerkung |
|---|---|
| Personalstammdaten & Organisation | Vollständig inkl. Abteilungshierarchie, Teams, Beschäftigungsarten |
| Zeiterfassung | Umfangreichstes Modul; 23 Fehlertypen, Flexzeit, Zuschläge, Schichtrhythmen |
| Schichtplanung | Planungstafel, automatische Generierung, Rollier-Rhythmen |
| Abwesenheiten & Urlaub | Genehmigungsworkflow, Urlaubsberechnung, Kappungsregeln, Sondertage |
| CRM | Adressen, Kontakte, Korrespondenz, Anfragen, Aufgaben, Auswertungen |
| Fakturierung & Belegwesen | 7 Belegtypen, Belegkette, E-Rechnung, Zahlungen, Wiederkehrende Rechnungen |
| Lagerverwaltung & Einkauf | Artikelstamm, Bestellwesen, Wareneingang, Entnahmen, QR-Scanner, Lieferantenrechnungen |
| Eingangsrechnungen | IMAP-Polling, ZUGFeRD, Mehrstufige Freigabe, DATEV-Export |
| Personalakte | Kategorien, Ablaufdaten, Wiedervorlagen, Anhänge, Dashboard-Widget |
| Zutrittskontrolle | Zonen, Profile, RFID-Karten, Terminal-Import |
| Aufträge & Projektzeiterfassung | Auftragsverwaltung, Mitarbeiterzuweisung, Zeitbuchungen |
| Lohn- & Gehaltsexport | DATEV-Export, Vorschau, konfigurierbare Schnittstellen |
| E-Mail-Versand | SMTP, Vorlagen, Versandprotokoll, Wiederholungsversuche |
| Mandantenverwaltung & Berechtigungen | 147 Berechtigungen, Daten-Sichtbereich, Modulsteuerung |
| Benachrichtigungen | Echtzeit-Zustellung, Kategorien, Präferenzen |
| Automatisierung | 9 Hintergrundjobs, Makros, Zeitpläne |
| DSGVO-Datenlöschung | Konfigurierbare Fristen, Vorschau, manuelle Ausführung (automatische Ausführung vorbereitet) |
| Berichtswesen | 10 Berichtstypen, 4 Formate |

### Teilweise
*Backend-Logik vorhanden, Benutzeroberfläche lückenhaft oder nur als Admin-Funktion.*

| Modul | Status |
|---|---|
| Fahrzeuge & Fahrtenbuch | Fahrzeuge, Routen und Fahrtenprotokolle sind vollständig im Backend implementiert mit allen Verwaltungsoperationen, aber es gibt keine dedizierte Benutzeroberfläche — Daten sind nur über die Administration erreichbar |
| Reisekosten | Regelwerke für Nah- und Fernmontage (Reisekosten) existieren im Backend mit Vorschauberechnung, es gibt aber kein Benutzer-Interface für die Reisekostenabrechnung |

### Datenmodell only
*Tabellen existieren, aber keine sinnvolle Bedienung.*

| Modul | Status |
|---|---|
| Inventur | Datenmodell für Inventur-Bestandsbewegungen existiert (Typ „INVENTORY"), aber die Inventur-Funktion im QR-Scanner ist deaktiviert und es gibt keinen eigenständigen Inventur-Workflow |

---

## Anhang: Unsicherheiten

### Fahrzeuge & Reisekosten — UI-Abdeckung unklar
Die tRPC-Router `vehicles`, `vehicleRoutes`, `tripRecords`, `travelAllowanceRuleSets`, `localTravelRules`, `extendedTravelRules` und `travelAllowancePreview` sind vollständig implementiert mit CRUD-Operationen. In der Sidebar-Konfiguration existieren Berechtigungen `vehicle_data.manage` und `travel_allowance.manage`. Es wurde jedoch keine dedizierte Seite unter `/admin/vehicles`, `/admin/travel` oder einem ähnlichen Pfad gefunden. Möglicherweise sind diese Funktionen in eine Admin-Einstellungsseite integriert oder noch nicht als eigenständige Seiten angelegt.

### DSGVO — Automatische Ausführung deaktiviert
Die automatische monatliche Ausführung der Datenlöschung ist im Code vollständig implementiert (`/api/cron/dsgvo-retention`), aber im Deployment-Konfigurationsfile explizit auskommentiert. Die manuelle Ausführung über die Benutzeroberfläche funktioniert. Ob die automatische Ausführung produktiv genutzt werden soll, ist eine bewusste Entscheidung — nicht ein fehlendes Feature.

### Inventur — Deaktiviert im QR-Scanner
Im QR-Scanner-Terminal gibt es eine Schaltfläche „Inventur", die im Code als `disabled` markiert ist. Der Bestandsbewegungstyp `INVENTORY` existiert im Datenmodell und wird vom Bestandsverwaltungs-Backend unterstützt, aber es gibt keinen vollständigen Workflow für eine Stichtagsinventur oder permanente Inventur.

### KI-Assistent — Funktionsumfang
Der KI-Assistent hat eine tRPC-Procedure (`aiAssistant.askQuestion`) und einen streaming-API-Endpunkt (`/api/ai-assistant`). Es gibt einen React-Hook (`use-ai-assistant.ts`). Es wurde jedoch keine eigenständige Seite für den Assistenten gefunden — er ist vermutlich als Dialog oder Seitenleisten-Komponente eingebunden, aber der genaue Einbindungspunkt wurde nicht verifiziert.

### Audit-Log-Export fehlt
Der Audit-Trail ist umfangreich (19 Entitätstypen, 11 Aktionstypen), aber die Benutzeroberfläche bietet nur eine Leseansicht mit Filtern. Ein CSV- oder PDF-Export der Audit-Daten existiert nicht.

### Abweichung Code vs. Handbuch: Eingangsrechnungen-Einstellungsseite
Das Handbuch listet eine Route `/invoices/inbound/settings` für die IMAP-Konfiguration der Eingangsrechnungen. Im Code existieren die Seiten `/invoices/inbound`, `/invoices/inbound/[id]` und `/invoices/inbound/approvals`, aber eine dedizierte Settings-Seite unter diesem Pfad wurde nicht gefunden. Die IMAP-Konfiguration ist möglicherweise in die allgemeine E-Mail-Einstellungsseite (`/admin/email-settings`) integriert.

### Rechnungsversand an öffentliche Auftraggeber (XRechnung)
Die ZUGFeRD-XML-Erzeugung und die Leitweg-ID-Unterstützung sind im Code vorhanden. Ob die erzeugte XML tatsächlich den XRechnung-Konformitätstest besteht, wurde nicht verifiziert — dies erfordert Validierung gegen den KoSIT-Validator.

### Bestandswert im Lager-Dashboard
Das Lager-Dashboard zeigt einen „Gesamtbestandswert". Die Berechnung basiert vermutlich auf Menge × Verkaufspreis oder Einkaufspreis, aber eine genaue Bewertungsmethode (welcher Preis wird herangezogen) wurde nicht im Detail verifiziert.
