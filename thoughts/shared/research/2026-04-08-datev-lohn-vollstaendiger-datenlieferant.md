---
date: 2026-04-08T18:30:00+02:00
researcher: Claude Code (Opus 4.6)
git_commit: ddc1777963d15bbb8b88e32af4386064d2fc0a6f
branch: staging
repository: terp
topic: "Terp als vollständiger Datenlieferant für DATEV LODAS / Lohn und Gehalt"
tags: [research, datev, lodas, lohn-und-gehalt, payroll, personalstammdaten, hr, export]
status: complete
last_updated: 2026-04-08
last_updated_by: Claude Code (Opus 4.6)
---

# Research: Terp als vollständiger Datenlieferant für DATEV LODAS / Lohn und Gehalt

**Date**: 2026-04-08T18:30:00+02:00
**Researcher**: Claude Code (Opus 4.6)
**Git Commit**: ddc1777963d15bbb8b88e32af4386064d2fc0a6f
**Branch**: staging
**Repository**: terp

## Forschungsfrage

Welche Daten und Schnittstellen braucht Terp, damit ein Steuerberater die Lohnabrechnung der Terp-Kunden mit minimalem Aufwand in DATEV durchführen kann? Terp soll ein vollständiger Datenlieferant werden — keine eigene Lohnberechnung.

## Zusammenfassung

Terp hat heute **ca. 40 Felder im Employee-Model**, davon sind aber **0 lohnspezifisch** (kein IBAN, keine Steuer-ID, keine SV-Nummer, keine Steuerklasse, keine Krankenkasse, kein Gehalt). Der bestehende DATEV-Lohnexport ist eine vereinfachte CSV mit 8 Spalten (Zeitdaten), **kein echtes DATEV-LODAS-Format**. Um ein vollständiger Datenlieferant zu werden, fehlen geschätzt **50–70 Stammdatenfelder** und ein komplett neuer Exportgenerator im LODAS ASCII-Format (das ist **kein EXTF** wie beim Buchungsstapel, sondern ein sektionsbasiertes INI-ähnliches Format).

---

# STRANG A — STAMMDATEN-VOLLSTÄNDIGKEIT

## A1. Vollständige Personalstammdaten für deutsche Lohnabrechnung

### 1.1 Persönliche Stammdaten

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Vorname | Pflicht | § 28a SGB IV, DEÜV | ✅ `firstName` |
| Nachname | Pflicht | § 28a SGB IV, DEÜV | ✅ `lastName` |
| Geburtsname (bei Heirat) | Pflicht | Basis für RVNR-Buchstabe | ❌ fehlt |
| Geburtsdatum | Pflicht | ELStAM, RVNR | ✅ `birthDate` (optional) |
| Geburtsort | Pflicht | DEÜV-Meldung | ✅ `birthPlace` (optional) |
| Geburtsland | Pflicht | DEÜV | ✅ `birthCountry` (optional) |
| Geschlecht | Pflicht | DEÜV | ✅ `gender` (male/female/diverse/not_specified) |
| Staatsangehörigkeit | Pflicht | DEÜV, A1 | ✅ `nationality` (optional, Freitext) |
| Straße + Hausnummer | Pflicht | Lohnsteuerbescheinigung | ⚠️ `addressStreet` (kein separates Hausnummer-Feld) |
| PLZ | Pflicht | ELStAM | ✅ `addressZip` |
| Ort | Pflicht | ELStAM | ✅ `addressCity` |
| Land | Pflicht | ELStAM | ✅ `addressCountry` |
| Familienstand | Optional | Steuerklasse-Relevanz | ✅ `maritalStatus` (6 Werte, Freitext VarChar) |
| E-Mail | Optional | Digitale Lohnabgabe | ✅ `email` |
| Telefon | Optional | Rückfragen | ✅ `phone` |

### 1.2 Steuerliche Daten (ELStAM-relevant)

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Steueridentifikationsnummer (11-stellig) | Pflicht | § 139b AO, ELStAM-Abruf | ❌ fehlt |
| Steuerklasse (I–VI) | Pflicht | ELStAM liefert, aber System sollte speichern | ❌ fehlt |
| Kinderfreibeträge (Anzahl, z.B. 1,5) | Optional | ELStAM liefert | ❌ fehlt |
| Konfession / Kirchensteuer (ev/rk/la/...) | Pflicht | ELStAM, bestimmt KiSt-Satz | ⚠️ `religion` (Freitext, keine DATEV-Codes) |
| Freibetrag (§ 39a EStG) | Optional | ELStAM liefert | ❌ fehlt |
| Hinzurechnungsbetrag | Optional | ELStAM liefert, selten | ❌ fehlt |
| Haupt-/Nebenarbeitgeber (1./2. Dienstverhältnis) | Pflicht | Bestimmt Steuerklasse | ❌ fehlt |

**Quellen:** [ELStAM — ELSTER](https://www.elster.de/elsterweb/infoseite/elstam_(arbeitgeber)), [BMF ELStAM-Schreiben 13.12.2024](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Lohnsteuer/2024-12-13-ELStAM-elektr-lohnsteuerabzugsmerkmale.pdf), [§ 139b AO](https://www.gesetze-im-internet.de/ao_1977/__139b.html)

### 1.3 Sozialversicherungsdaten

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Rentenversicherungsnummer (12-stellig) | Pflicht | § 28a SGB IV | ❌ fehlt |
| Krankenkasse (Name + Betriebsnummer) | Pflicht | Einzugsstelle SV-Beiträge | ❌ fehlt |
| Personengruppenschlüssel (3-stellig: 101–190) | Pflicht | DEÜV | ❌ fehlt |
| Beitragsgruppenschlüssel (4-stellig: KV/RV/AV/PV) | Pflicht | DEÜV | ❌ fehlt |
| Tätigkeitsschlüssel (9-stellig, KldB 2010) | Pflicht | BA für Arbeit | ❌ fehlt |
| Übergangsbereich-Kennzeichen (0/1/2) | Bedingt | Bei Midijob | ❌ fehlt |
| KV-Status (pflichtversichert/freiwillig/privat) | Pflicht | Bestimmt BG-Schlüssel | ❌ fehlt |
| PKV-Beitrag (bei privater KV) | Bedingt | Für AG-Zuschuss | ❌ fehlt |
| Umlagepflicht U1/U2/U3 | Pflicht | AAG-Erstattung | ❌ fehlt |

**Quellen:** [§ 28a SGB IV](https://www.gesetze-im-internet.de/sgb_4/__28a.html), [PGR — lohn-info.de](https://www.lohn-info.de/personengruppenschluessel.html), [BGS — lohn-info.de](https://www.lohn-info.de/beitragsgruppenschluessel.html), [Tätigkeitsschlüssel — BA](https://www.arbeitsagentur.de/unternehmen/betriebsnummern-service/taetigkeitsschluessel)

### 1.4 Bankverbindung

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| IBAN (DE: 22 Stellen) | Pflicht | SEPA-Überweisung | ❌ fehlt |
| BIC (optional seit SEPA-Raum) | Optional | Ausland | ❌ fehlt |
| Kontoinhaber | Pflicht | Kann von AN abweichen | ❌ fehlt |
| Abweichender Empfänger | Optional | Z.B. Pfändung | ❌ fehlt |

### 1.5 Vertragsdaten

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Eintrittsdatum | Pflicht | NachwG, SV-Anmeldung | ✅ `entryDate` |
| Austrittsdatum | Bei Befristung/Austritt | NachwG | ✅ `exitDate` |
| Befristungsart (sachgrundlos/mit Sachgrund) | Bei Befristung | TzBfG | ❌ fehlt |
| Probezeit (Dauer in Monaten) | Pflicht lt. NachwG | NachwG § 2 Nr. 6 | ❌ fehlt |
| Beschäftigungsart | Pflicht | Beeinflusst PGR | ⚠️ `employmentTypeId` (Freitext-Code, keine DATEV-Zuordnung) |
| Kündigungsfrist AG/AN | Pflicht lt. NachwG | NachwG § 2 Nr. 14 | ❌ fehlt |
| Tarifvertrag | Pflicht lt. NachwG | NachwG § 2 Nr. 15 | ⚠️ `tariffId` (Terp-intern, kein DATEV-Format) |
| Personalnummer | Pflicht | DATEV | ✅ `personnelNumber` |
| Kostenstelle | Optional | Auswertungen | ✅ `costCenterId` |

### 1.6 Arbeitszeit-/Beschäftigungsdaten

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Wöchentliche Sollarbeitszeit | Pflicht | Entgeltberechnung | ✅ `weeklyHours` / `weeklyTargetHours` |
| Tägliche Regelarbeitszeit | Optional | Zeitwirtschaft | ✅ `dailyTargetHours` |
| Arbeitstage pro Woche | Pflicht | NachwG, Urlaubsberechnung | ✅ `workDaysPerWeek` |
| Teilzeitquote (%) | Pflicht bei TZ | SV-Meldungen | ✅ `partTimePercent` |
| Urlaubsanspruch (Tage/Jahr) | Pflicht lt. NachwG | NachwG § 2 Nr. 11 | ✅ `vacationDaysPerYear` |

### 1.7 Entgeltdaten

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Grundgehalt / Monatslohn (brutto) | Pflicht | Basis Lohnabrechnung | ❌ fehlt |
| Stundenlohn (bei Stundenvergütung) | Bedingt | Statt Monatsgehalt | ❌ fehlt |
| Entgeltart (Monatsgehalt/Stundenlohn/Provision) | Pflicht | | ❌ fehlt |
| Gehaltsgruppe / Tarifgruppe | Optional | Bei Tarifbindung | ❌ fehlt |

### 1.8 Kinder und Familie

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Kinder (Name, Geburtsdatum) | Optional | Elternzeit, Kinderfreibetrag | ❌ fehlt |
| Elternzeit (von–bis) | Optional | DEÜV-Meldung seit 2024 | ❌ fehlt |
| Mutterschutz (Beginn, vorauss. Geburt) | Optional | AG-Zuschuss | ❌ fehlt |

### 1.9 Schwerbehinderung

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Grad der Behinderung (GdB, 20–100) | Optional | Ab GdB 50 = schwerbehindert | ❌ fehlt (nur Boolean `disabilityFlag`) |
| Gleichstellung | Optional | GdB 30–49 | ❌ fehlt |
| Merkzeichen (G, aG, H, Bl etc.) | Optional | Steuerpauschbetrag | ❌ fehlt |
| Ausweis gültig bis | Optional | Wiedervorlage | ❌ fehlt |

### 1.10 Pfändungen / Abtretungen

| Feld | Pflicht/Optional | Quelle | Aktuell in Terp? |
|---|---|---|---|
| Gläubiger (Name, Adresse) | Bei Pfändung | Pfändungsbeschluss | ❌ fehlt |
| Aktenzeichen | Bei Pfändung | | ❌ fehlt |
| Pfändungsbetrag / Methode | Bei Pfändung | § 850c ZPO | ❌ fehlt |
| Anzahl Unterhaltsberechtigter | Bei Pfändung | Erhöht Freibetrag | ❌ fehlt |
| Rangfolge | Bei Pfändung | Ältere vor neueren | ❌ fehlt |

**Quellen:** [Pfändungstabelle 2024 — finanztip.de](https://www.finanztip.de/pfaendungstabelle/), [§ 850c ZPO](https://www.gesetze-im-internet.de/zpo/__850c.html)

### 1.11 Sachbezüge / Geldwerte Vorteile

| Sachbezug | Felder | Steuergrenze 2026 | Aktuell in Terp? |
|---|---|---|---|
| Dienstwagen | BLP, Antriebsart, Entfernungs-km | 1%/0,25%(E-Auto) + 0,03%/km | ❌ |
| Jobrad | BLP, Überlassungsart | Zusätzl. steuerfrei; Umwandlung: 0,25% | ❌ |
| Essenszuschuss | Betrag/Tag, Art | 7,67 €/Tag steuerbegünstigt | ❌ |
| Sachgutscheine | Betrag | Freigrenze 50 €/Monat | ❌ |
| Jobticket | Betrag | Steuerfrei wenn zusätzlich | ❌ |

**Quellen:** [Sachbezugswerte 2026 — hrworks.de](https://www.hrworks.de/news/sachbezugswerte-2026/)

### 1.12 Betriebliche Altersvorsorge (bAV)

| Feld | Pflicht/Optional | Aktuell in Terp? |
|---|---|---|
| Durchführungsweg (DV/PK/PF/DZ/UK) | Pflicht | ❌ |
| Versorgungsträger | Pflicht (NachwG § 2 Nr. 13) | ❌ |
| Vertragsform (Entgeltumwandlung/AG-finanziert) | Pflicht | ❌ |
| Beitragshöhe AN | Pflicht | ❌ |
| Pflicht-AG-Zuschuss (15% seit 2022) | Pflicht | ❌ |

**Quellen:** [AG-Zuschuss bAV — DRV](https://www.deutsche-rentenversicherung.de/DRV/DE/Experten/Arbeitgeber-und-Steuerberater/summa-summarum/Lexikon/A/arbeitgeberzuschuss_bei_entgeltumwandlung.html)

### 1.13 Vermögenswirksame Leistungen (VL)

| Feld | Pflicht/Optional | Aktuell in Terp? |
|---|---|---|
| Anlageart | Pflicht | ❌ |
| Anlageempfänger (Bank/Institut) | Pflicht | ❌ |
| IBAN des Anlagekontos | Pflicht | ❌ |
| Vertragsnummer (max. 14-stellig) | Pflicht | ❌ |
| VL-Betrag (€/Monat) | Pflicht | ❌ |
| Anteil AG / AN | Pflicht | ❌ |

**Quellen:** [VL — lohn-info.de](https://www.lohn-info.de/vwl.html)

### 1.14 Mehrfachbeschäftigung

| Feld | Pflicht/Optional | Aktuell in Terp? |
|---|---|---|
| Kennzeichen Hauptarbeitgeber | Pflicht | ❌ |
| Einkommenshöhe bei anderem AG | Bedingt (§ 28o SGB IV) | ❌ |

### 1.15 Sonderfälle: Minijob, Werkstudent, Azubi etc.

| Beschäftigungsart | PGR | BGS | Besonderheiten |
|---|---|---|---|
| Normaler AN (Vollzeit/Teilzeit) | 101 | 1111 | Standardfall |
| Auszubildender | 102 | 1111 | Geringverdiener-Grenze 325 € (AG allein) |
| Praktikant | 105 | variabel | Pflicht vs. freiwillig entscheidet |
| Werkstudent | 106 | 0100 | Nur RV-pflichtig, max 20h/Woche |
| Minijobber | 109 | 6500 | Minijob-Zentrale als Einzugsstelle |
| Kurzfristig Beschäftigter | 110 | 0000 | Max 3 Monate/70 Tage, komplett SV-frei |
| Rentner (Altersteilrente) | 119/120 | variabel | |

**Quellen:** [Werkstudenten — AOK](https://www.aok.de/fk/sozialversicherung/studenten-und-praktikanten/beschaeftigung-von-werkstudenten/), [Minijob — lohn-info.de](https://www.lohn-info.de/538-euro-job.html), [Midijob — AOK](https://www.aok.de/fk/sozialversicherung/beitraege-zur-sozialversicherung/beitraege-im-uebergangsbereich/)

---

## A2. Konkurrenzvergleich

### Personio
- **Tab "Lohnbuchhaltung"**: Steuer-IdNr, Steuerklasse, Konfession, SV-Nummer, Krankenkasse, IBAN, PGR, BGS, Tätigkeitsschlüssel, Haupt-/Nebenarbeitgeber
- **Export**: DATEV Lohnimportdatenservice (REST-API), exportiert Stamm- + Bewegungsdaten an LODAS und LuG
- **Schwäche**: Sonderfelder (Pfändungen, bAV-Details, VL-Vertragsnummer) müssen manuell in DATEV nachgepflegt werden
- **Quelle**: [Personio DATEV](https://www.personio.de/funktionen/datev/), [Community: Stammdaten DATEV](https://community.personio.de/gehalt-lohnbuchhaltung-23/personalstammdaten-personio-datev-lohn-und-gehalt-6262)

### SAGE HR Suite
- Vollintegrierte Personalabrechnung (nicht nur Datenlieferant)
- Branchenvarianten (Bau, TVöD, maritime Entlohnung)
- DATEV-LODAS-Schnittstelle bei reiner HR-Erfassung
- **Quelle**: [SAGE HR Personalabrechnung](https://www.sage.com/de-de/produkte/sage-hr-suite-personal-software/personalabrechnung/)

### HRworks
- Positioniert sich als "vorbereitende Lohnbuchhaltung" (wie Terp)
- Felder auf DATEV-Export ausgerichtet
- **Quelle**: [HRworks Schnittstellen](https://www.hrworks.de/produkt/schnittstellen/)

### Lexware Lohn+Gehalt
- Vollständiges Lohnabrechnungssystem, kein reiner Datenlieferant
- Assistenten für alle Stammdaten
- **Quelle**: [Lexware Handbuch (PDF)](https://lex-blog.de/wp-content/uploads/2023/12/handbuch_lohngehalt_pro.pdf)

---

## A3. Rechtliche Pflichtangaben

### Nachweisgesetz (NachwG) — seit 01.08.2022
§ 2 NachwG verlangt schriftlich (ab 01.01.2025 auch elektronisch, BEG IV):
1. Name und Anschrift der Vertragsparteien
2. Beginn des Arbeitsverhältnisses
3. Enddatum bei Befristung
4. Arbeitsort
5. Tätigkeitsbeschreibung
6. Probezeit
7. Zusammensetzung und Höhe des Arbeitsentgelts
8. Arbeitszeit, Ruhepausen, Schichtsystem
9. Regelung bei Abrufarbeit
10. Überstundenregelung
11. Urlaubsanspruch
12. Fortbildungsanspruch
13. Altersversorgungsträger (bAV)
14. Kündigungsverfahren und -fristen
15. Anwendbare Tarifverträge und Betriebsvereinbarungen

**Sanktion:** Bußgeld bis 2.000 €/Verstoß

**Quellen:** [§ 2 NachwG](https://www.gesetze-im-internet.de/nachwg/__2.html), [NachwG Änderung 2025 — Haufe](https://www.haufe.de/personal/arbeitsrecht/weitreichende-aenderungen-am-nachweisgesetz_76_569140.html)

### Mindestlohngesetz (MiLoG) — § 17
- Arbeitszeitaufzeichnung für geringfügig Beschäftigte und bestimmte Branchen
- Aufbewahrungspflicht: 2 Jahre

### ArbZG — Arbeitszeiterfassung
- EuGH (C-55/18) + BAG (1 ABR 22/21): faktische Pflicht zur vollständigen Arbeitszeiterfassung
- Terp erfüllt dies bereits durch die Zeitwirtschaft

### SGB IV — Meldepflichten (§ 28a)
- SV-Anmeldung bei Beschäftigungsbeginn
- SV-Abmeldung bei Beschäftigungsende
- Jahresmeldung
- Ab 2024: Elternzeit Beginn/Ende (Grund 17/37)

---

# STRANG B — DATEV-EXPORT-FORMAT-KONFORMITÄT

## B1. Das echte DATEV-LODAS-Importformat

### KRITISCHE ERKENNTNIS: LODAS ASCII ≠ EXTF

Das DATEV-LODAS-Importformat ist **kein EXTF-Format**. Es hat keine "Datenkategorie" im EXTF-Sinne. Es ist ein **sektionsbasiertes INI-ähnliches Textformat** mit `[Allgemein]`, `[Satzbeschreibung]`, `[Stammdaten]`, `[Bewegungsdaten]`.

Das bedeutet: Der bestehende Eingangsrechnungen-Export (EXTF Buchungsstapel) kann **nicht als Vorlage** für den Lohnexport dienen. Die Wiederverwendung beschränkt sich auf:
- `iconv-lite` für Windows-1252 Encoding
- CRLF Zeilenenden
- Komma als Dezimaltrenner
- Allgemeine Hilfsfunktionen (escapeField, formatDecimal)

**Quellen:** [SSH Schnittstellenhandbuch LODAS (silo.tips, 45. Auflage 2016)](https://silo.tips/download/ssh-schnittstellenhandbuch-lodas), [DATEV Help Center](https://help-center.apps.datev.de/api/amr/knowledge-common/v1/entities/st63050431850213643_de.txt), [DATEV Developer Portal](https://developer.datev.de/datev/platform/en/schnittstellenvorgaben/ascii)

### Dateistruktur

```
[Allgemein]
Ziel=LODAS                          ← PFLICHT: "LODAS" oder "LUG"
Version_SST=1.0                     ← Optional
BeraterNr=28547                     ← PFLICHT: 4–7-stellig
MandantenNr=90909                   ← PFLICHT: 1–5-stellig
Datumsformat=TT/MM/JJJJ            ← Optional (Standard: TT.MM.JJJJ)
Feldtrennzeichen=;                  ← Optional (Standard: ;)
Zahlenkomma=,                       ← Optional (Standard: ,)
StammdatenGueltigAb=01/01/2026      ← Optional

[Satzbeschreibung]
21;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;buchungswert#bwd;buchungsnummer#bwd;kostenstelle1#bwd

[Bewegungsdaten]
4712;01052026;1,67;774;PROD
4712;01052026;8,00;1000;PROD
4713;01052026;160,00;1000;VERW
```

### Sektionen

| Sektion | Status | Bedeutung |
|---|---|---|
| `[Allgemein]` | **Pflicht** | Header mit Identifikation |
| `[Satzbeschreibung]` | **Pflicht** | Definiert Aufbau der Datensätze |
| `[Stammdaten]` | Optional | Personalstammdaten |
| `[Bewegungsdaten]` | Optional | Lohnarten, Stunden, Beträge pro Monat |
| `[Entfernen]` | Optional | Löschen bestehender Datensätze |

Mindestens eine Datensektion (`[Stammdaten]` oder `[Bewegungsdaten]`) muss vorhanden sein.

### Satzarten-Nummern (Bewegungsdaten)

| Nr. | Tabelle | Bedeutung |
|---|---|---|
| 20 | `u_lod_bwd_buchung_kalendarium` | Kalendarische Buchung (Stunden je Kalendertag) |
| 21 | `u_lod_bwd_buchung_standard` | Standardbuchung (Wert/Betrag je Lohnart) |

**Felder für Satzart 21 (Standard-Bewegungsdaten):**

| Feld | Bedeutung | Pflicht? |
|---|---|---|
| `pnr#bwd` | Personalnummer | Pflicht |
| `abrechnung_zeitraum#bwd` | Abrechnungsmonat (TTMMJJJJ) | Pflicht |
| `buchungswert#bwd` | Betrag/Stunden/Tage (Dezimal: Komma) | Pflicht |
| `buchungsnummer#bwd` | Lohnart-Nummer | Pflicht |
| `kostenstelle1#bwd` | Kostenstelle 1 | Optional |
| `kostenstelle2#bwd` | Kostenstelle 2 | Optional |

### Technische Spezifikation

| Eigenschaft | Wert | Konfigurierbar? |
|---|---|---|
| Encoding | **ANSI (Windows-1252)** | Nein |
| Zeilentrenner | **CRLF** (CR+LF) | Nein |
| Feldtrenner | `;` (Semikolon) | Ja, via `Feldtrennzeichen=` |
| Dezimaltrenner | `,` (Komma) | Ja, via `Zahlenkomma=` |
| Stringbegrenzer | `"` | Ja, via `Stringbegrenzer=` |
| Datumsformat | `TT.MM.JJJJ` | Ja, via `Datumsformat=` |
| Datei-Endung | `.prn`, `.txt`, `.csv` | Keine Vorgabe |

### Import-Pfad in LODAS
`Mandant > Daten übernehmen > ASCII-Import`

### Offizielle Spezifikation
Das **LODAS Schnittstellenhandbuch (LODAS_SSH.pdf)** liegt im LODAS-Programmverzeichnis: `\DATEV\Programm\LODAS\Handbuch\Deutsche Version\LODAS_SSH.pdf`. Die aktuelle Version (92. Auflage, Dez. 2025) ist **nur mit DATEV-Login** zugänglich. Ältere Versionen (45. Auflage 2016) auf [Silo.tips](https://silo.tips/download/ssh-schnittstellenhandbuch-lodas).

Das Handbuch dokumentiert **48 Mandantentabellen, 93 Personalstamm-Tabellen und 14 Bewegungsdaten-Tabellen**.

---

## B2. DATEV Lohn und Gehalt vs. LODAS

### Architekturunterschied

| | LODAS | Lohn und Gehalt (LuG) |
|---|---|---|
| Verarbeitung | DATEV Rechenzentrum | Lokal beim Steuerberater |
| Einsatz | Größere Mandate (ab ~300 MA) | Kleinere bis mittlere Mandate |
| Abkürzung | LODAS = "LOhn-DAten-Service" | LuG / Kanzlohn |

Zusammen: **ca. 14,5 Mio. Lohnabrechnungen/Monat** in Deutschland.

### Importformat-Unterschiede

| | LODAS | Lohn und Gehalt |
|---|---|---|
| `Ziel=` | `LODAS` | `LUG` |
| Lohnarten | 3- oder 4-stellig | Nur 4-stellig |
| Stammdaten-Tabellen | Eigenes Handbuch (LODAS_SSH) | Separate Feldbeschreibung (138-seitiges PDF) |

Das ASCII-Grundformat ist **fast identisch**. Alle namhaften HR-SaaS (Personio, e2n, Circula, Planday) bieten beide Exporte an. Für Terp empfohlen: **Beide unterstützen** via `Ziel=`-Konfiguration.

**Quellen:** [DATEV Community — Unterschied LODAS/LuG](https://www.datev-community.de/t5/Personalwirtschaft/Hallo-ich-w%C3%BCrde-gern-mal-den-Unterschied-zwischen-den-Programmen/td-p/53450), [Circula DATEV Exports](https://help.circula.com/en/articles/279484-exports-for-datev-lodas-and-lohn-und-gehalt)

---

## B3. Personengruppenschlüssel und Beitragsgruppenschlüssel

### Personengruppenschlüssel (PGR) — Wichtigste

| Schlüssel | Bedeutung |
|---|---|
| **101** | Sozialversicherungspflichtiger AN (Regelfall) |
| **102** | Auszubildender |
| **105** | Praktikant |
| **106** | Werkstudent |
| **109** | Geringfügig entlohnt (Minijob) — hat immer Vorrang |
| **110** | Kurzfristig Beschäftigter — hat immer Vorrang |
| **119** | Rentner (versicherungsfrei RV) |

**Offizielle Quelle:** [GKV-Datenaustausch DEÜV Anlage 2 Version 8.01](https://www.gkv-datenaustausch.de/media/dokumente/arbeitgeber/deuev/rundschreiben_anlagen/03_Anlage_2_Vers._8.01.pdf)

**Änderungshäufigkeit:** Selten (ca. alle 3–5 Jahre bei Gesetzesänderungen). Letzte Änderungen: 2017 (PGR 120), 2020 (PGR 117/118).

**Empfehlung:** Statische Lookup-Tabelle in Terp, mit jährlicher Prüfung gegen die DEÜV-Anlage.

### Beitragsgruppenschlüssel (BGS) — 4-stellig: KV-RV-AV-PV

| Pos. 1 (KV) | Bedeutung | Pos. 2 (RV) | Pos. 3 (AV) | Pos. 4 (PV) |
|---|---|---|---|---|
| 0 = beitragsfrei | 1 = allg. Satz | 0 = beitragsfrei | 0 = beitragsfrei | 0 = beitragsfrei |
| 1 = Pflicht | 3 = ermäßigt | 1 = voller Beitrag | 1 = voller Beitrag | 1 = voller Beitrag |
| 6 = Pauschalbeitrag | 5 = Pauschalbeitrag | 2 = halber Beitrag | | 2 = halber Beitrag |
| 9 = freiwillig | | | | |

**Beispiele:** `1111` = normaler AN; `6500` = Minijob; `0100` = Werkstudent; `0000` = kurzfristig

**Quellen:** [BGS — lohn-info.de](https://www.lohn-info.de/beitragsgruppenschluessel.html), [BARMER BGS](https://www.barmer.de/firmenkunden/sozialversicherung/sozialversicherungslexikon/beitragsgruppenschluessel-1058236)

---

## B4. Bestehender Eingangsrechnungen-Export als Vorbild

**Datei:** `src/lib/services/inbound-invoice-datev-export-service.ts`

### Wiederverwendbare Patterns

| Pattern | Datei/Zeile | Wiederverwendbar? |
|---|---|---|
| `iconv-lite` für Windows-1252 | Zeile 2, 240 | ✅ Ja |
| `formatDecimal()` (Komma als Dezimaltrenner) | Zeile 46-48 | ✅ Ja |
| `escapeField()` (Semikolon/Quote-Escaping) | Zeile 60-65 | ✅ Ja |
| `truncate()` | Zeile 53-55 | ✅ Ja |
| CRLF Zeilenenden | Zeile 239 | ✅ Ja |
| Audit-Log Pattern | Zeile 250-268 | ✅ Ja |
| EXTF Header (`buildDatevHeader()`) | Zeile 94-130 | ❌ Nein (LODAS nutzt kein EXTF) |
| Buchungsstapel-Spalten | Zeile 136-152 | ❌ Nein (komplett andere Struktur) |

### Was anders sein muss für Lohndaten

1. **Kein EXTF-Header** — stattdessen `[Allgemein]`-Block mit `Ziel=LODAS`, `BeraterNr`, `MandantenNr`
2. **Sektionsbasierte Struktur** statt Zeile-für-Zeile-CSV
3. **`[Satzbeschreibung]`** muss die Feldliste der Bewegungsdaten definieren
4. **Andere Datenkategorien** — keine Buchungsstapel-Logik, sondern Lohnarten-Buchungen
5. **Pro-Datei ein Mandant und ein Abrechnungszeitraum** (nicht mehrere)

---

## B5. Zukunftssichere Pfade

### Kurzfristig (sofort realisierbar): Manueller ASCII-Export
- LODAS + LuG Format als Download-Datei
- **Kein Partner-Status erforderlich**
- Steuerberater importiert manuell: `Mandant > Daten übernehmen > ASCII-Import`
- So machen es Personio, Circula, e2n, Planday und fast alle anderen

### Mittelfristig (6–18 Monate): DATEV Lohnimportdatenservice (REST-API)
- API-Name: **"hr:files"** auf dem DATEV Developer Portal
- Erstellt die gleiche ASCII-Datei, lädt sie per REST/OAuth 2.0 ins DATEV RZ hoch
- Kosten: nur **0,05 €/Monat/Mandant**
- **Voraussetzung: DATEV Marktplatz-Partnerschaft** (mindestens 25 aktive Kunden, 3 Referenzkunden, 3 Steuerberater-Bestätigungen über 3 Monate)
- Nicht automatisch nach Erfüllung — DATEV entscheidet individuell

**Quellen:** [DATEV Lohnimportdatenservice Shop](https://www.datev.de/web/de/datev-shop/komplettloesungen/lohnimportdatenservice/), [Kombo DATEV Integration](https://docs.kombo.dev/hris/datev/datev-integration), [DATEV Marktplatz — Erste Schritte](https://www.datev.de/web/de/ueber-datev/das-digitale-oekosystem-von-datev/partnering/datev-marktplatz/datev-marktplatz-schnittstellen-partner-die-ersten-schritte-zum-partnerstatus/)

### Alternative: Middleware-Anbieter (Kombo, Chift)
- Bereits DATEV Marktplatz-Partner
- Vereinheitlichte API
- Spart Partnerschafts-Aufwand, kostet Lizenzgebühren

**Quellen:** [Kombo DATEV](https://docs.kombo.dev/hris/datev/datev-integration), [Chift DATEV](https://www.chift.eu/blog/datev-api-integration)

### Veraltet: DATEVconnect (legacy COM/DLL)
- Wird durch DATEVconnect online / REST-APIs ersetzt
- Für neue Integrationen nicht mehr relevant

### DATEV Unternehmen Online (DUO)
- Primär für Finanzbuchhaltung (Belegaustausch)
- Für Lohn nicht der primäre Kanal

---

# PHASE 2 — GAP-ANALYSE

## Tabelle 1: Stammdatenfelder (Zusammenfassung)

| Kategorie | Vorhanden (✅) | Teilweise (⚠️) | Fehlt (❌) | Gesamt |
|---|---|---|---|---|
| Persönliche Stammdaten | 12 | 1 | 1 | 14 |
| Steuerliche Daten | 0 | 1 | 6 | 7 |
| Sozialversicherungsdaten | 0 | 0 | 9 | 9 |
| Bankverbindung | 0 | 0 | 4 | 4 |
| Vertragsdaten | 3 | 2 | 4 | 9 |
| Arbeitszeit/Beschäftigung | 5 | 0 | 0 | 5 |
| Entgeltdaten | 0 | 0 | 4 | 4 |
| Kinder/Familie | 0 | 0 | 3 | 3 |
| Schwerbehinderung | 0 | 0 | 4 | 4 |
| Pfändungen | 0 | 0 | 5 | 5 |
| Sachbezüge | 0 | 0 | 5+ | 5+ |
| bAV | 0 | 0 | 5 | 5 |
| VL | 0 | 0 | 6 | 6 |
| Mehrfachbeschäftigung | 0 | 0 | 2 | 2 |
| **Gesamt** | **20** | **4** | **~58** | **~82** |

**Terp deckt heute nur ~24 von ~82 lohnrelevanten Feldern ab, davon 4 nur teilweise.**

## Tabelle 2: DATEV-Export-Konformität (Lohnexport)

| Anforderung | Status heute | Soll-Zustand | Aufwand |
|---|---|---|---|
| Dateiformat | Einfache CSV mit Spaltenüberschrift | LODAS ASCII mit `[Allgemein]`, `[Satzbeschreibung]`, `[Bewegungsdaten]` | **Hoch** — neuer Generator |
| Encoding | UTF-8 | Windows-1252 (ANSI) | Gering — `iconv-lite` vorhanden |
| Dezimaltrenner | Punkt (`.`) | Komma (`,`) | Gering — `formatDecimal()` vorhanden |
| Zeilenenden | LF (`\n`) | CRLF (`\r\n`) | Gering |
| `[Allgemein]`-Header | Fehlt komplett | `Ziel=LODAS/LUG`, `BeraterNr`, `MandantenNr` | Mittel — neue Config-Felder nötig |
| `[Satzbeschreibung]` | Fehlt | Feldliste für Satzart 21 | Mittel |
| `[Bewegungsdaten]` | Nur einfache Semikolon-Zeilen | Format: `PNR;Zeitraum;Wert;Lohnart;Kostenstelle` | Mittel |
| Beraternummer | Nicht im System | Neues Config-Feld pro ExportInterface | Gering |
| Mandantennummer | `ExportInterface.mandantNumber` vorhanden | ✅ bereits da | — |
| Lohnart-Mapping | Hardcoded 1000–2002 | Konfigurierbares Mapping (DATEV-Lohnart ↔ Terp-Konto) | Mittel |
| LODAS + LuG Unterstützung | Nur "DATEV" | `Ziel=LODAS` und `Ziel=LUG` konfigurierbar | Gering (nur Header-Wert) |

---

# PHASE 3 — KONZEPT FÜR ERWEITERUNG

## 1. Felder die ergänzt werden müssen

### Priorität 1 — Pflichtfelder für Bewegungsdaten-Export (Minimum Viable DATEV)

Damit der Steuerberater überhaupt eine ASCII-Datei importieren kann:
- `beraternummer` (auf `ExportInterface`) — BeraterNr 4–7-stellig
- Korrekte Dateistruktur (`[Allgemein]`, `[Satzbeschreibung]`, `[Bewegungsdaten]`)
- `Ziel`-Konfiguration (LODAS vs. LUG) auf `ExportInterface`

### Priorität 2 — Kernfelder für Personalstammdaten

Damit der Steuerberater **keine Stammdaten** manuell nachpflegen muss:

**Auf dem Employee-Model (oder verknüpfter Tabelle):**
- `taxId` — Steueridentifikationsnummer (11-stellig)
- `socialSecurityNumber` — Rentenversicherungsnummer (12-stellig)
- `taxClass` — Steuerklasse (1–6)
- `childTaxAllowance` — Kinderfreibeträge (Decimal, z.B. 1.5)
- `denomination` — Konfession für Kirchensteuer (DATEV-Code: ev/rk/la/er/lt/rf/fg/fr/fs/fa/ak/ib/jd)
- `healthInsuranceProvider` — Krankenkasse Name
- `healthInsuranceNumber` — Betriebsnummer der Krankenkasse (8-stellig)
- `healthInsuranceStatus` — pflichtversichert/freiwillig/privat
- `personnelGroupCode` — Personengruppenschlüssel (3-stellig)
- `contributionGroupCode` — Beitragsgruppenschlüssel (4-stellig, z.B. "1111")
- `activityCode` — Tätigkeitsschlüssel (9-stellig)
- `iban` — IBAN
- `bic` — BIC (optional)
- `accountHolder` — Kontoinhaber
- `isPrimaryEmployer` — Hauptarbeitgeber ja/nein
- `birthName` — Geburtsname
- `grossSalary` — Bruttogehalt (monatlich)
- `hourlyRate` — Stundenlohn
- `paymentType` — Entgeltart (Monatsgehalt/Stundenlohn)
- `midijobFlag` — Übergangsbereich (0/1/2)

### Priorität 3 — Erweiterte Felder

**Eigene Tabellen nötig:**
- `EmployeeChild` (Name, Geburtsdatum, Steuerfreibetrag-Anteil)
- `EmployeeGarnishment` (Gläubiger, Aktenzeichen, Betrag, Rang, Unterhaltsberechtigte)
- `EmployeeBenefit` (Sachbezugsart, Parameter je nach Typ)
- `EmployeePension` (bAV: Durchführungsweg, Träger, Beiträge, AG-Zuschuss)
- `EmployeeSavings` (VL: Anlageart, Empfänger, IBAN, Vertragsnummer, Betrag)

### Priorität 4 — Nice-to-have
- Auslandsbezüge / A1
- PKV-Beitrag
- Schwerbehinderung (GdB-Wert statt nur Boolean, Merkzeichen, Gültigkeit)

## 2. UI-Gruppierung: Mitarbeiter-Detailseite

**Vorschlag: Tab-basiert** (wie Personio), angepasst an Terp-Stil:

| Tab | Felder |
|---|---|
| **Persönlich** | Name, Geburtsname, Geburtstag/-ort/-land, Geschlecht, Nationalität, Familienstand, Adresse, Foto |
| **Vertrag & Beschäftigung** | Eintrittsdatum, Austritt, Befristung, Probezeit, Beschäftigungsart, Abteilung, Kostenstelle, Standort, Tarif, Arbeitstage/Woche, Wochenstunden, Teilzeitquote |
| **Steuern & Sozialversicherung** | Steuer-ID, Steuerklasse, Kinderfreibeträge, Konfession, SV-Nummer, Krankenkasse (+Betriebsnummer), KV-Status, PGR, BGS, Tätigkeitsschlüssel, Haupt-/Nebenarbeitgeber, Midijob-Flag |
| **Bankverbindung** | IBAN, BIC, Kontoinhaber, Abweichender Empfänger |
| **Vergütung** | Grundgehalt/Stundenlohn, Entgeltart, Gehaltshistorie |
| **Zusatzleistungen** | Sachbezüge (Sub-Tabelle), bAV (Sub-Tabelle), VL (Sub-Tabelle) |
| **Familie** | Kinder (Sub-Tabelle), Elternzeit-Zeiträume |
| **Behinderung** | GdB, Gleichstellung, Merkzeichen, Ausweis gültig bis |
| **Pfändungen** | Pfändungen (Sub-Tabelle), nur mit `personnel.payroll_data.edit` sichtbar |
| **Personalakte** | Dokumente (bestehendes HrPersonnelFileEntry-System) |
| **Zeitwirtschaft** | Bestehende Tabs (Buchungen, Monatswerte, Urlaubskonten etc.) |

## 3. Validierungen (serverseitig)

| Feld | Validierung | Algorithmus |
|---|---|---|
| IBAN | Format + MOD-97 Prüfsumme | ISO 13616: Erste 4 Zeichen ans Ende, Buchstaben→Zahlen, Mod 97 = 1 |
| Sozialversicherungsnummer | 12-stellig, Prüfziffer | Faktoren 2,1,2,5,7,1,2,1,2,1,2,1; Quersummen addieren; Mod 10 |
| Steuer-Identifikationsnummer | 11-stellig, Prüfziffer | Mod-10/Mod-11 Verfahren (BZSt-Spezifikation) |
| Geburtsdatum | Plausibilität | Nicht in der Zukunft, nicht > 120 Jahre alt |
| Eintrittsdatum vs. Geburtsdatum | Mind. 15 Jahre Differenz | `entryDate - birthDate >= 15 years` |
| Personengruppenschlüssel | Lookup gegen Stammdatentabelle | 3-stellig, gültiger Code |
| Beitragsgruppenschlüssel | 4-stellig, pro Position gültige Werte | Pos. 1: 0,1,3,4,5,6,9; Pos. 2: 0,1,3,5; Pos. 3: 0,1,2; Pos. 4: 0,1,2 |
| Steuerklasse | 1–6 | Enum |
| Tätigkeitsschlüssel | 9-stellig, Pos. 1–5 nach KldB 2010 | Format-Check (Details aus BA-Tabelle) |

## 4. Dropdown-Auswahllisten

| Feld | Quelle | Empfehlung |
|---|---|---|
| Steuerklassen (I–VI) | Statisch | Hardcoded Enum |
| Krankenkassen | [GKV-Spitzenverband Krankenkassenliste](https://www.gkv-spitzenverband.de) | Stammdatentabelle, jährlich aktualisieren (ca. 100 Kassen) |
| Konfessionen | DATEV-Codes (ev, rk, la, er, lt, rf, fg, fr, fs, fa, ak, ib, jd) | Hardcoded Lookup (~13 Werte) |
| Bundesländer | 16 Bundesländer (für KiSt-Satz) | Hardcoded |
| Beschäftigungsarten | Bestehende `EmploymentType`-Tabelle | ⚠️ Muss um DATEV-Mapping ergänzt werden |
| Personengruppenschlüssel | DEÜV Anlage 2 | Stammdatentabelle (~20 Codes), selten aktualisiert |
| Beitragsgruppenschlüssel | Abgeleitet aus KV/RV/AV/PV-Status | Berechnet aus Feldern, nicht manuell eingegeben |

## 5. Dokumente für digitale Personalakte

Vorschlag für vordefinierte `HrPersonnelFileCategory`-Einträge:

| Kategorie-Code | Name | Relevanz |
|---|---|---|
| `SV_AUSWEIS` | Sozialversicherungsausweis | Pflicht |
| `KK_BESCHEINIGUNG` | Mitgliedsbescheinigung Krankenkasse | Pflicht |
| `LOHNSTEUER_VORJAHR` | Lohnsteuerbescheinigung Vorjahr | Optional |
| `PERSONALAUSWEIS` | Kopie Personalausweis | Pflicht |
| `AUFENTHALT` | Aufenthaltstitel (Nicht-EU) | Bedingt |
| `SB_AUSWEIS` | Schwerbehindertenausweis | Bedingt |
| `PFAENDUNG` | Pfändungsbeschluss | Bedingt |
| `BAV_VERTRAG` | bAV-Vertrag | Bedingt |
| `ARBEITSVERTRAG` | Arbeitsvertrag | Pflicht |
| `NACHWEIS` | Nachweisgesetz-Dokument | Pflicht (seit 08/2022) |

## 6. Erweiterung des Lohnexports zum echten DATEV-Format

### Neuer Generator: `datev-lodas-export-service.ts`

**Nicht** den bestehenden `payroll-export-service.ts` umbauen, sondern als **separaten Service** implementieren. Der alte CSV-Export bleibt parallel erhalten (manche Steuerberater sind das gewohnt).

**Satzarten die Terp generieren muss:**
1. **Satzart 21** (`u_lod_bwd_buchung_standard`) — Standardbuchung: Lohnart + Wert pro Mitarbeiter. Das ist der Kern des Exports (Stunden, Tage, Beträge).
2. **Satzart 20** (`u_lod_bwd_buchung_kalendarium`) — Optional: Tagesgenauige Stundenbuchung (z.B. für Schichtarbeit). Kann in Phase 2 ergänzt werden.

**EXTF-Header wird NICHT benötigt.** Stattdessen:

```
[Allgemein]
Ziel={LODAS|LUG}           ← Konfigurierbar pro ExportInterface
BeraterNr={beraterNr}       ← Neues Feld auf ExportInterface
MandantenNr={mandantNr}     ← Bestehendes Feld auf ExportInterface
Feldtrennzeichen=;
Zahlenkomma=,

[Satzbeschreibung]
21;u_lod_bwd_buchung_standard;pnr#bwd;abrechnung_zeitraum#bwd;buchungswert#bwd;buchungsnummer#bwd;kostenstelle1#bwd

[Bewegungsdaten]
{pnr};{01MMJJJJ};{wert,00};{lohnart};{kostenstelle}
```

### Wiederverwendung aus dem Eingangsrechnungen-Export

| Component | Quelle | Wiederverwendbar |
|---|---|---|
| `iconv-lite` | `inbound-invoice-datev-export-service.ts:2` | ✅ Direkt |
| `formatDecimal()` | Zeile 46-48 | ✅ In shared utility extrahieren |
| `escapeField()` | Zeile 60-65 | ✅ In shared utility extrahieren |
| CRLF + Encoding Pattern | Zeile 239-240 | ✅ |
| Audit-Log Pattern | Zeile 250-268 | ✅ |

**Vorschlag:** Shared utility `src/lib/services/datev-format-utils.ts` mit `formatDecimal`, `escapeField`, `encodeWindows1252`, `crlf`.

### Neue Mandanten-Konfigurationsfelder

Auf `ExportInterface`:
- `beraterNr` — Beraternummer (VarChar(7), Pflicht für DATEV-Export)
- `datevTarget` — Zielprogramm: `LODAS` oder `LUG` (Enum/VarChar(10))
- `lohnartMapping` — JSON-Feld für kundenspezifisches Lohnart-Mapping

### Alter CSV-Export beibehalten?
**Ja.** Als `exportType: "standard"` oder `"legacy_datev"` weiterhin verfügbar. Der neue LODAS/LuG-Export bekommt `exportType: "datev_lodas"` bzw. `"datev_lug"`. Kein Breaking Change.

## 7. Neue Berechtigungen

| Permission | Beschreibung | Grund |
|---|---|---|
| `personnel.payroll_data.view` | Lohnstammdaten einsehen | Steuer-ID, SV-Nr, IBAN sind hochsensibel |
| `personnel.payroll_data.edit` | Lohnstammdaten bearbeiten | Getrennt von normalen Personalstammdaten |
| `personnel.garnishment.view` | Pfändungen einsehen | Besonders sensibel |
| `personnel.garnishment.edit` | Pfändungen bearbeiten | Besonders sensibel |

Die bestehenden `payroll.view` und `payroll.manage` bleiben für den Export selbst zuständig.

## 8. Pflichtfelder nach Beschäftigungsart

| Feld | Vollzeit/TZ | Minijob | Werkstudent | Azubi | Praktikant |
|---|---|---|---|---|---|
| Steuer-ID | ✅ | ✅ (oder Pauschalsteuer) | ✅ | ✅ | ✅ |
| Steuerklasse | ✅ | Optional (bei Pauschale) | ✅ | ✅ | ✅ |
| SV-Nummer | ✅ | ✅ | ✅ | ✅ | ✅ |
| Krankenkasse | ✅ | ❌ (Minijob-Zentrale) | ✅ (nur RV) | ✅ | Bedingt |
| PGR | 101 | 109 | 106 | 102 | 105 |
| BGS | 1111 | 6500 | 0100 | 1111 | Variabel |
| IBAN | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bruttogehalt | ✅ | ✅ (≤ 538 €) | ✅ | ✅ | Bedingt |
| Tätigkeitsschlüssel | ✅ | ✅ | ✅ | ✅ | ✅ |

---

# PHASE 4 — REIFEGRAD-EINSCHÄTZUNG

## Fehlende Felder (grobe Zahl)

| Kategorie | Anzahl fehlend |
|---|---|
| Auf Employee-Model direkt | ~20 Felder |
| Neue Tabellen (Kinder, Pfändungen, Sachbezüge, bAV, VL) | ~30 Felder über 5 Tabellen |
| Lookup-/Stammdatentabellen (Krankenkassen, PGR, Konfessionen) | ~3 Tabellen |
| Config-Felder auf ExportInterface | ~3 Felder |
| **Gesamt** | **~56 Felder, ~8 neue Tabellen** |

## Aufwandsschätzung

| Arbeitspaket | Umfang | Komplexität |
|---|---|---|
| **Strang A: Stammdaten** | | |
| A1: Migration + Prisma-Schema (Employee erweitern) | ~20 neue Spalten | Gering |
| A2: Neue Tabellen (Kind, Pfändung, Sachbezug, bAV, VL) | ~5 Tabellen, ~30 Felder | Mittel |
| A3: Lookup-Tabellen (Krankenkassen, PGR, Konfessionen) | ~3 Seed-Tabellen | Gering |
| A4: tRPC-Router Erweiterung (CRUD für neue Daten) | ~5 neue Sub-Router oder Prozeduren | Mittel |
| A5: Validierungen (IBAN, SV-Nr, Steuer-ID) | ~3 Validatoren | Mittel (Prüfziffern-Algorithmen) |
| A6: Frontend: Neue Tabs auf Mitarbeiter-Detailseite | ~4 neue Tabs, ~20 Formularfelder | Mittel-Hoch |
| A7: Berechtigungen | ~4 neue Permissions | Gering |
| **Strang B: Exportformat** | | |
| B1: Shared DATEV Utility (`datev-format-utils.ts`) | ~100 Zeilen | Gering |
| B2: LODAS ASCII Generator (`datev-lodas-export-service.ts`) | ~200–300 Zeilen | Mittel |
| B3: ExportInterface erweitern (BeraterNr, Ziel, Mapping) | ~3 Felder + Migration | Gering |
| B4: LuG-Variante (Ziel=LUG) | ~20 Zeilen Unterschied zu LODAS | Gering |
| B5: Tests | ~5 Testdateien | Mittel |

## Kritischer Pfad (Reihenfolge)

1. **Zuerst: LODAS Bewegungsdaten-Export** (Strang B) — bringt sofortigen Kundennutzen, da die Zeitdaten (Stunden, Tage, Lohnarten) bereits vorhanden sind. Nur Formatumstellung nötig.
2. **Dann: Kern-Stammdatenfelder** (Steuer-ID, SV-Nummer, IBAN, Krankenkasse, Steuerklasse, PGR, BGS) — ermöglicht dem Steuerberater den Stammdaten-Import.
3. **Dann: Ergänzende Felder** (Gehalt, bAV, VL, Sachbezüge) — reduziert manuelle Nacharbeit.
4. **Zuletzt: Sonderfälle** (Pfändungen, Kinder, Auslandsbezüge, A1) — Nice-to-have.

## Extern zu pflegende Datenquellen

| Datenquelle | Aktualisierungsbedarf | Quelle |
|---|---|---|
| Krankenkassenliste | Jährlich (Fusionen, Auflösungen) | GKV-Spitzenverband |
| Personengruppenschlüssel | Alle 3–5 Jahre | DEÜV Anlage 2 |
| Beitragsgruppenschlüssel-Werte | Selten | Gesetzliche Änderungen |
| Sachbezugswerte | Jährlich zum 1.1. | Sachbezugsverordnung (BMF) |
| Pfändungsfreigrenzen | Alle 2 Jahre zum 1.7. | § 850c ZPO, Bundesgesetzblatt |
| Minijob-/Midijob-Grenzen | Bei Mindestlohnänderung | MiLoG |
| DATEV Lohnarten-Katalog | Bei DATEV-Updates | Steuerberater / DATEV |

## Risiken und Klärungsbedarf mit Steuerberater

1. **Lohnart-Mapping:** DATEV LODAS und LuG verwenden mandantenspezifische Lohnarten. Die Standard-Lohnarten (z.B. 1000 = Gehalt) können vom Steuerberater umkonfiguriert sein. → **Muss pro Mandant abgestimmt werden.**

2. **Stammdaten-Import vs. Bewegungsdaten-Import:** Soll Terp auch Personalstammdaten (Name, Adresse, SV-Daten) per ASCII importieren oder nur Bewegungsdaten (Stunden/Tage)? Letzteres ist deutlich einfacher und bringt schneller Nutzen. → **Mit Pro-Di-Steuerberater klären.**

3. **Welches DATEV-Programm nutzt der Pro-Di-Steuerberater?** LODAS oder Lohn und Gehalt? → **Bestimmt Priorität.**

4. **Satzart 20 (Kalendarium) oder 21 (Standard)?** Satzart 20 ist tagesgenau, 21 ist Monats-Summe. Für die meisten Steuerberater reicht 21. → **Klären.**

5. **Beraternummer und Mandantennummer:** Müssen vom Steuerberater mitgeteilt und in Terp konfiguriert werden. → **Onboarding-Prozess definieren.**

6. **DATEV Schnittstellenhandbuch:** Die aktuelle Version (92. Auflage, Dez. 2025) ist nur mit DATEV-Login verfügbar. → **Vom Steuerberater anfordern** oder über DATEV Developer Portal beziehen.

7. **Kostenstellen-Zuordnung:** Wie sollen Terp-Kostenstellen auf DATEV-Kostenstellen gemappt werden? 1:1 oder über Mapping-Tabelle? → **Klären.**

8. **Welche Lohnarten/Bewegungsdaten erwartet der Steuerberater konkret?** Nur Stunden/Tage, oder auch Beträge (z.B. Zulagen, Zuschläge)? → **Muss der Steuerberater spezifizieren.**

9. **Sonderfälle Dienstwagen/Sachbezüge:** Werden diese monatlich über eine eigene Lohnart exportiert oder separat mitgeteilt? → **Klären.**

10. **Häufigkeit des Exports:** Monatlich (Standard) oder bei Bedarf? Soll der Export pro Abrechnungszeitraum nur einmal möglich sein (wie bei Eingangsrechnungen) oder wiederholbar? → **Klären.**

---

# Offene Fragen

## Vom Product Owner zu klären

1. **Scope Phase 1:** Soll Phase 1 nur den Bewegungsdaten-Export (Stunden/Tage/Lohnarten) im LODAS-Format umfassen, oder bereits die Stammdaten-Erweiterung?
2. **UI-Priorisierung:** Welche der neuen Tabs (Steuern & SV, Bankverbindung, Vergütung etc.) haben Priorität? Alle gleichzeitig oder inkrementell?
3. **Bestehender CSV-Export:** Soll er parallel bestehen bleiben oder mittelfristig entfernt werden?
4. **Sensible Daten (IBAN, Steuer-ID, SV-Nr):** Sollen diese verschlüsselt gespeichert werden (Column-Level Encryption)?
5. **Massenimport:** Bei 200 Mitarbeitern (Pro-Di) — soll es einen CSV/Excel-Import für Stammdaten geben, um die initiale Befüllung zu beschleunigen?
6. **Gehaltshistorie:** Soll eine Gehaltsänderungshistorie gepflegt werden (wie bei Personio)?
7. **bAV/VL/Sachbezüge:** Wie detailliert sollen diese in Phase 1 erfasst werden? Reicht ein Freitext-Feld oder brauchen wir vollstrukturierte Sub-Tabellen?

## Vom Steuerberater (Pro-Di) zu klären

1. **DATEV-Programm:** LODAS oder Lohn und Gehalt?
2. **Beraternummer und Mandantennummer:** Wie lauten diese?
3. **Gewünschte Lohnarten:** Welche konkreten Lohnart-Nummern werden für Stunden, Tage, Urlaub, Krankheit, Überstunden etc. erwartet?
4. **Stammdaten-Import gewünscht?** Oder reichen Bewegungsdaten und Stammdaten werden im DATEV direkt gepflegt?
5. **Satzart 20 (tagesgenau) oder 21 (Monats-Summe)?** Was wird bevorzugt?
6. **Kostenstellen-Mapping:** Welche DATEV-Kostenstellen gibt es und wie sollen sie auf Terp gemappt werden?
7. **Wie werden Sachbezüge (Dienstwagen, Jobrad etc.) heute abgerechnet?** Als separate Lohnart oder manuell?
8. **Welche Dokumente werden digital benötigt?** (SV-Bescheinigungen, Arbeitsverträge etc.)
9. **Test-Import:** Kann der Steuerberater einen Test-Import mit Beispieldaten durchführen, bevor wir live gehen?
10. **Aktuelles DATEV Schnittstellenhandbuch:** Kann er uns die aktuelle Version des LODAS_SSH.pdf bereitstellen?

## Technisch zu klären

1. **Verschlüsselung sensibler Felder:** Supabase Column-Level Encryption oder Application-Level Encryption für IBAN, Steuer-ID, SV-Nr?
2. **DATEV Schnittstellenhandbuch:** Wie bekommen wir die aktuelle Version (92. Auflage, Dez. 2025)?
3. **Krankenkassen-Stammdatentabelle:** Welche offizielle maschinenlesbare Liste gibt es? (GKV-Spitzenverband publiziert eine, Format unklar)
4. **Tätigkeitsschlüssel-Tabelle:** Die KldB 2010 umfasst ~1.300 Schlüssel auf 5-Steller-Ebene. Wie soll die Auswahl im Frontend gestaltet werden? (Suchfeld mit Autocomplete)
