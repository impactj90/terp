# Terp — Benutzerhandbuch

## Inhaltsverzeichnis

1. [Was ist Terp?](#1-was-ist-terp)
2. [Rollen & Berechtigungen](#2-rollen--berechtigungen)
3. [Stammdaten — Was muss eingerichtet werden?](#3-stammdaten--was-muss-eingerichtet-werden)
4. [Zeiterfassung — Täglicher Betrieb](#4-zeiterfassung--täglicher-betrieb)
5. [Schichtplanung](#5-schichtplanung)
6. [Urlaub & Abwesenheiten](#6-urlaub--abwesenheiten)
7. [Aufgaben des Managers](#7-aufgaben-des-managers)
8. [Automatisierung — Was passiert im Hintergrund?](#8-automatisierung--was-passiert-im-hintergrund)
9. [Aufträge & Projektzeiterfassung](#9-aufträge--projektzeiterfassung)
10. [Zutrittskontrolle](#10-zutrittskontrolle)
11. [Glossar](#11-glossar)

---

## 1. Was ist Terp?

Terp ist ein digitales Zeiterfassungs- und Personalverwaltungssystem für deutsche Unternehmen. Es ersetzt Stundenzettel auf Papier, Excel-Tabellen und manuelle Lohnvorbereitung durch eine zentrale, webbasierte Anwendung.

### Was Terp tut

- **Arbeitszeiten erfassen**: Mitarbeiter stempeln über den Browser oder ein Terminal ein und aus. Das System berechnet automatisch Arbeitszeit, Pausen, Überstunden und Fehlzeiten.
- **Abwesenheiten verwalten**: Urlaub, Krankheit und andere Abwesenheiten werden digital beantragt, genehmigt und verbucht — inklusive automatischer Urlaubskontoführung.
- **Schichten planen**: Schichtpläne können für einzelne Mitarbeiter oder ganze Teams erstellt werden, auch mit rollierenden Rhythmen.
- **Lohnabrechnung vorbereiten**: Am Monatsende werden alle Daten aggregiert und als CSV-Export (z. B. für DATEV) bereitgestellt.
- **Aufträge und Projekte erfassen**: Mitarbeiter können ihre Arbeitszeit auf Aufträge und Aktivitäten buchen.
- **Zutritt steuern**: RFID-Karten und PINs ermöglichen die Zutrittskontrolle zu bestimmten Bereichen.

### Für wen Terp gemacht ist

- **Mitarbeiter** — sehen ihre eigenen Zeiten, beantragen Urlaub, buchen auf Aufträge
- **Vorgesetzte / Manager** — genehmigen Abwesenheiten, korrigieren Buchungen, schließen Monate ab
- **Administratoren** — richten das System ein, verwalten Benutzer und Berechtigungen, erstellen Exporte
- **Lohnbuchhaltung** — erhält fertige Monatsexporte mit allen relevanten Stunden und Abwesenheitstagen

### Welche Probleme Terp löst

| Vorher | Mit Terp |
|--------|----------|
| Stundenzettel auf Papier | Digitale Zeiterfassung per Klick |
| Excel-Tabellen für Urlaubsplanung | Automatisches Urlaubskonto mit Genehmigungsworkflow |
| Manuelle Überstundenberechnung | Automatische Berechnung jede Nacht |
| Fehleranfällige Lohnvorbereitung | Ein-Klick-Export für die Lohnbuchhaltung |
| Kein Überblick wer im Haus ist | Live-Übersicht über An- und Abwesenheiten |

### Mandantenfähigkeit

Terp ist mandantenfähig: Ein Unternehmen (oder ein Dienstleister) kann mehrere Firmen oder Standorte als getrennte Mandanten verwalten. Jeder Mandant hat seine eigenen Mitarbeiter, Abteilungen, Arbeitszeitmodelle und Einstellungen. Benutzer können einem oder mehreren Mandanten zugeordnet sein.

---

## 2. Rollen & Berechtigungen

### Das Berechtigungsmodell

Terp verwendet ein zweistufiges Berechtigungssystem:

1. **Benutzerrolle** — Jeder Benutzer ist entweder ein normaler Benutzer oder ein Administrator.
2. **Berechtigungsgruppe** — Jeder Benutzer wird einer Gruppe zugeordnet, die festlegt, welche Funktionen er nutzen darf.

### Benutzerrollen

Es gibt genau zwei Rollen:

| Rolle | Bedeutung |
|-------|-----------|
| **Benutzer** | Standardrolle. Darf nur das, was die zugewiesene Berechtigungsgruppe erlaubt. |
| **Administrator** | Hat automatisch Zugriff auf alle Funktionen — unabhängig von der Berechtigungsgruppe. |

### Berechtigungsgruppen

Eine Berechtigungsgruppe ist eine Sammlung von Einzelberechtigungen. Zum Beispiel:

- Die Gruppe **"Mitarbeiter"** könnte nur die Berechtigung "Eigene Zeitdaten ansehen" enthalten.
- Die Gruppe **"Teamleiter"** könnte zusätzlich "Alle Zeitdaten ansehen", "Abwesenheiten genehmigen" und "Buchungen bearbeiten" enthalten.
- Die Gruppe **"Personalverwaltung"** könnte alle mitarbeiterbezogenen Berechtigungen umfassen.

Jede Gruppe kann als **Admin-Gruppe** markiert werden — dann erhalten alle Mitglieder automatisch vollen Zugriff.

### Die wichtigsten Berechtigungen im Überblick

| Bereich | Berechtigung | Was man damit tun kann |
|---------|-------------|----------------------|
| **Mitarbeiter** | Ansehen, Anlegen, Bearbeiten, Löschen | Mitarbeiterstammdaten verwalten |
| **Zeiterfassung** | Eigene Zeiten ansehen | Nur die eigenen Buchungen und Tageswerte sehen |
| | Alle Zeiten ansehen | Die Zeitdaten aller Mitarbeiter einsehen |
| | Zeiten bearbeiten | Buchungen erstellen, ändern und löschen |
| | Zeiten genehmigen | Tageswerte bestätigen |
| **Buchungsübersicht** | Tagesplan ändern | Den Tagesplan eines Mitarbeiters wechseln |
| | Tag berechnen | Eine Tagesberechnung manuell auslösen |
| | Monat berechnen | Eine Monatsberechnung manuell auslösen |
| | Buchungen löschen | Buchungen in der Übersicht entfernen |
| **Abwesenheiten** | Beantragen | Abwesenheitsanträge stellen |
| | Genehmigen | Anträge annehmen oder ablehnen |
| | Verwalten | Alle Abwesenheiten bearbeiten und löschen |
| **Konfiguration** | Tagespläne, Wochenpläne, Tarife | Arbeitszeitmodelle einrichten |
| | Abteilungen, Teams, Standorte | Organisationsstruktur pflegen |
| | Buchungstypen, Abwesenheitstypen | Stempel- und Abwesenheitsarten konfigurieren |
| | Feiertage | Feiertagskalender verwalten |
| | Konten | Zeitkonten (Flex, Überstunden) einrichten |
| | Benutzer, Gruppen | Zugänge und Berechtigungen verwalten |
| | Mandanten, Einstellungen | Grundeinstellungen des Mandanten ändern |
| **Berichte & Lohn** | Berichte ansehen / verwalten | Auswertungen erstellen und herunterladen |
| | Lohnexport ansehen / verwalten | Lohnexporte erstellen und herunterladen |
| **Aufträge** | Aufträge, Zuweisungen, Aktivitäten | Auftragsverwaltung |
| | Auftragsbuchungen ansehen / verwalten | Zeitbuchungen auf Aufträge |
| **Sonstiges** | Schichtplanung, Zutrittskontrolle, Fahrzeugdaten, Reisekosten, Korrekturen, Makros | Spezialfunktionen |

### Datensichtbarkeit

Zusätzlich zu den Berechtigungen kann für jeden Benutzer ein **Datensichtbereich** eingestellt werden:

| Sichtbereich | Was der Benutzer sieht |
|-------------|----------------------|
| **Alle** | Alle Daten im Mandanten |
| **Mandant** | Alle Daten im zugewiesenen Mandanten |
| **Abteilung** | Nur Mitarbeiter der festgelegten Abteilung(en) |
| **Mitarbeiter** | Nur die festgelegten einzelnen Mitarbeiter |

> **Beispiel:** Eine Teamleiterin hat die Berechtigung "Alle Zeiten ansehen", aber der Datensichtbereich ist auf ihre Abteilung "Produktion" beschränkt. Sie sieht nur die Zeitdaten der Mitarbeiter in der Produktion.

### Wie Berechtigungen vergeben werden

1. Ein Administrator erstellt eine **Berechtigungsgruppe** (z. B. "Teamleiter") und wählt die gewünschten Berechtigungen aus.
2. Beim Anlegen oder Bearbeiten eines **Benutzers** wird diese Gruppe zugewiesen.
3. Optional wird der **Datensichtbereich** eingeschränkt.
4. Der Benutzer kann sich anmelden und sieht nur das, was seine Gruppe erlaubt.

---

## 3. Stammdaten — Was muss eingerichtet werden?

Bevor das System produktiv genutzt werden kann, müssen einige Grunddaten angelegt werden. Die folgende Reihenfolge ist empfohlen, da spätere Schritte auf früheren aufbauen.

### Schritt 1: Mandant einrichten

Der Mandant ist die oberste Organisationseinheit — in der Regel ein Unternehmen oder eine Niederlassung.

**Was eingestellt wird:**
- Name und Kurzbezeichnung (Slug)
- Adresse (Straße, PLZ, Ort, Land)
- Urlaubsberechnungsbasis: nach Kalenderjahr oder nach Eintrittsdatum
- Optionaler Pfad für Lohnexporte

### Schritt 2: Abteilungen und Standorte

**Abteilungen** bilden die Organisationsstruktur ab. Sie können hierarchisch geschachtelt werden (z. B. Produktion → Fertigung → Montage). Jede Abteilung hat:
- Einen eindeutigen Code und Namen
- Optional einen Vorgesetzten (aus den bereits angelegten Mitarbeitern)
- Optional eine übergeordnete Abteilung

**Standorte** sind physische Arbeitsstätten (z. B. "Werk München", "Büro Berlin"). Jeder Standort hat:
- Einen eindeutigen Code und Namen
- Adresse und Zeitzone

**Teams** sind Untergruppen innerhalb einer Abteilung. Sie haben einen Teamleiter und Mitglieder mit einer Rolle (Mitglied, Leiter, Stellvertreter).

### Schritt 3: Arbeitszeitmodelle einrichten

Die Arbeitszeitmodelle bilden eine dreistufige Hierarchie. Jede Stufe baut auf der vorherigen auf:

```
Tagesplan  →  Wochenplan  →  Tarif
(ein Tag)     (eine Woche)    (das Gesamtmodell)
```

#### Tagesplan — Die Regeln für einen einzelnen Arbeitstag

Ein Tagesplan legt fest, wie ein bestimmter Arbeitstag aussieht. Es gibt zwei Typen:

- **Fester Plan** (`fixed`): Der Mitarbeiter hat feste Anfangs- und Endzeiten. Beispiel: 8:00–16:30 Uhr.
- **Gleitzeit** (`flextime`): Der Mitarbeiter kann innerhalb eines Zeitfensters kommen und gehen, muss aber eine Kernarbeitszeit einhalten.

**Was ein Tagesplan enthält:**

| Einstellung | Bedeutung | Beispiel |
|------------|-----------|---------|
| Kommen-Fenster (von/bis) | Wann der Mitarbeiter frühestens/spätestens anfangen darf | 6:00 – 9:00 |
| Gehen-Fenster (von/bis) | Wann der Mitarbeiter frühestens/spätestens gehen darf | 15:00 – 20:00 |
| Kernzeit (von/bis) | Zeitraum, in dem Anwesenheitspflicht besteht | 9:00 – 15:00 |
| Sollarbeitszeit | Wie viele Stunden an diesem Tag gearbeitet werden sollen | 8 Stunden (= 480 Minuten) |
| Alternative Sollzeit | Sollarbeitszeit an Abwesenheitstagen (z. B. bei Urlaub) | 6 Stunden |
| Toleranzen | Wie viele Minuten Abweichung erlaubt sind (siehe Abschnitt 4) | ±5 Minuten |
| Rundung | Wie Stempelzeiten gerundet werden (siehe Abschnitt 4) | Auf 5 Minuten runden |
| Pausen | Feste oder automatische Pausenregeln (siehe Abschnitt 4) | 30 Min. nach 6 Std. |
| Maximale Arbeitszeit | Obergrenze für die anrechenbare Nettoarbeitszeit | 10 Stunden |
| Mindestarbeitszeit | Mindestanforderung, unter der ein Fehler angezeigt wird | 4 Stunden |
| Feiertagsgutschrift | Wie viele Stunden an einem Feiertag gutgeschrieben werden | 8 Stunden (Kat. 1) |
| Urlaubsabzug | Wie viel Urlaub ein Tag dieses Plans „kostet" | 1,0 (ganzer Tag) oder 0,5 |
| Verhalten ohne Buchung | Was passiert, wenn der Mitarbeiter nicht stempelt | Fehler anzeigen / Soll gutschreiben |

> **Konkretes Beispiel — Tagesplan "Normalschicht":**
> - Kommen-Fenster: 6:00 – 9:00 Uhr
> - Gehen-Fenster: 15:00 – 20:00 Uhr
> - Kernzeit: 9:00 – 15:00 Uhr
> - Sollarbeitszeit: 8 Stunden
> - Pause: 30 Minuten (automatisch abgezogen nach 6 Stunden Arbeit)
> - Toleranz: ±5 Minuten beim Kommen und Gehen
> - Rundung: Kommen auf 5 Minuten aufrunden, Gehen auf 5 Minuten abrunden

#### Wochenplan — Sieben Tagespläne ergeben eine Woche

Ein Wochenplan ordnet jedem Wochentag (Montag bis Sonntag) einen Tagesplan zu. Ein Tag ohne zugewiesenen Tagesplan ist ein freier Tag.

> **Beispiel — Wochenplan "Normalwoche":**
>
> | Tag | Tagesplan |
> |-----|-----------|
> | Montag | Normalschicht (8 Std.) |
> | Dienstag | Normalschicht (8 Std.) |
> | Mittwoch | Normalschicht (8 Std.) |
> | Donnerstag | Normalschicht (8 Std.) |
> | Freitag | Freitagsplan (6 Std.) |
> | Samstag | *(kein Plan — frei)* |
> | Sonntag | *(kein Plan — frei)* |

#### Tarif — Das vollständige Arbeitszeitmodell

Der Tarif fasst alles zusammen und wird dem Mitarbeiter zugewiesen. Er enthält:

**Arbeitszeitrhythmus** — drei Varianten:

| Rhythmus | Beschreibung | Beispiel |
|----------|-------------|---------|
| **Wöchentlich** | Jede Woche derselbe Wochenplan | Immer Mo–Fr "Normalwoche" |
| **Rollierend wöchentlich** | Mehrere Wochenpläne wechseln sich wochenweise ab | Woche 1: Frühschicht, Woche 2: Spätschicht |
| **X-Tage-Rhythmus** | Ein frei definierbarer Zyklus aus Tagesplänen | 4 Tage Arbeit, 2 Tage frei, wiederholt sich |

Für rollierende und X-Tage-Rhythmen wird ein **Startdatum** festgelegt, ab dem der Zyklus beginnt.

**Urlaubseinstellungen:**
- Jahresurlaubstage (z. B. 30 Tage)
- Arbeitstage pro Woche (z. B. 5)
- Urlaubsberechnungsbasis (Kalenderjahr oder Eintrittsdatum)
- Urlaubskappungsregeln (was am Jahresende mit Resturlaub passiert)

**Flexzeiteinstellungen:**
- Maximales Flexzeitsaldo pro Monat
- Obere und untere Jahresgrenze für das Gleitzeitkonto
- Schwellenwert (erst ab dieser Differenz wird Flexzeit gutgeschrieben)
- Übertragungsart (siehe Abschnitt 4)

**Pausenregeln auf Tarifebene:**
- Gelten als Fallback, wenn der Tagesplan keine eigenen Pausenregeln hat

> **Beispiel — Tarif "Verwaltung Vollzeit":**
> - Rhythmus: Wöchentlich, Wochenplan "Normalwoche"
> - 30 Urlaubstage/Jahr, 5-Tage-Woche
> - Flexzeit: max. ±40 Stunden/Jahr, vollständige Übertragung
> - Gültig ab 01.01.2026

### Schritt 4: Mitarbeiter anlegen

Beim Anlegen eines Mitarbeiters werden mindestens benötigt:

- **Personalnummer** — eindeutig im Mandanten
- **Vorname** und **Nachname**
- **Eintrittsdatum**

Optional (aber empfohlen) sind:
- Abteilung
- Tarif (Arbeitszeitmodell)
- Wöchentliche Arbeitszeit (Standard: 40 Stunden)
- Urlaubstage pro Jahr (Standard: 30 Tage)
- Kostenstelle
- PIN (wird automatisch vergeben, falls nicht angegeben)
- Beschäftigungsart (Vollzeit, Teilzeit, Minijob, Azubi, Werkstudent, Praktikant)
- Kontaktdaten, Adresse, Geburtsdatum und weitere Personalinformationen

Wird dem Mitarbeiter ein Tarif zugewiesen, generiert das System automatisch Tagespläne für die kommenden Wochen (siehe Abschnitt 8).

### Schritt 5: Buchungstypen einrichten

Buchungstypen definieren, was eine Stempelbuchung bedeutet. Jeder Typ hat eine **Richtung** und eine **Kategorie**:

| Richtung | Kategorie | Beispiel |
|----------|-----------|---------|
| Eingang (in) | Arbeit | Kommen |
| Ausgang (out) | Arbeit | Gehen |
| Ausgang (out) | Pause | Pause Anfang |
| Eingang (in) | Pause | Pause Ende |
| Eingang (in) | Dienstgang | Dienstgang Rückkehr |
| Ausgang (out) | Dienstgang | Dienstgang Abfahrt |

Die Systemtypen COME (Kommen), GO (Gehen), BREAK_START (Pause Anfang) und BREAK_END (Pause Ende) sind vorinstalliert und können nicht gelöscht werden.

Buchungstypen können optional einem **Konto** zugeordnet werden (z. B. ein Nachtzuschlagskonto) und einen **Buchungsgrund** haben, der bei der Stempelung abgefragt wird.

### Schritt 6: Abwesenheitstypen einrichten

Abwesenheitstypen legen fest, welche Arten von Abwesenheit im System erfasst werden können. Jeder Typ gehört zu einer Kategorie:

| Kategorie | Code-Präfix | Beispiele |
|-----------|-------------|-----------|
| Urlaub | U | U01 (Jahresurlaub), U02 (Sonderurlaub) |
| Unbezahlt | U | UO (Unbezahlter Urlaub) |
| Krankheit | K | K01 (Krankheit), K02 (Kind krank) |
| Sonderfall | S | SB (Berufsschule), S01 (Fortbildung) |

Für jeden Typ wird festgelegt:
- Ob er vom **Urlaubskonto abgezogen** wird (nur bei Urlaubstypen)
- Ob eine **Genehmigung** erforderlich ist
- Ob ein **Nachweis** (Attest) verlangt wird
- Welche **Gutschrift** der Mitarbeiter für diesen Tag erhält (keine, voll, halb)
- Welche **Priorität** er gegenüber Feiertagen hat

### Schritt 7: Feiertage einrichten

Terp kennt alle deutschen Feiertage und kann sie automatisch nach **Bundesland** generieren. Dazu gehören:

**Bundesweite Feiertage** (gelten überall):
- Neujahr, Karfreitag, Ostermontag, Tag der Arbeit, Christi Himmelfahrt, Pfingstmontag, Tag der Deutschen Einheit, 1. und 2. Weihnachtstag

**Landesspezifische Feiertage** (Auswahl):
- Heilige Drei Könige (BW, BY, ST)
- Fronleichnam (BW, BY, HE, NW, RP, SL)
- Allerheiligen (BW, BY, NW, RP, SL)
- Reformationstag (BB, MV, SN, ST, TH, HB, HH, NI, SH)
- Internationaler Frauentag (BE, MV)
- Buß- und Bettag (nur SN)
- Weltkindertag (nur TH)
- Mariä Himmelfahrt (BY, SL)

Jeder Feiertag hat eine **Kategorie** (1, 2 oder 3), die bestimmt, welche Gutschrift der Mitarbeiter erhält. Die Gutschrifthöhe wird im Tagesplan pro Kategorie festgelegt.

Feiertage können für den gesamten Mandanten oder nur für bestimmte Abteilungen gelten.

### Schritt 8: Konten einrichten

Konten sind die Sammelstellen für berechnete Zeitwerte. Die wichtigsten Systemkonten sind:

| Konto | Typ | Bedeutung |
|-------|-----|-----------|
| FLEX | Monat | Gleitzeitkonto — sammelt Plus- und Minusstunden |
| OT | Monat | Überstundenkonto |
| VAC | Tag | Urlaubskonto |

Zusätzlich können eigene Konten angelegt werden, z. B. für:
- Nachtarbeitszuschläge
- Sonntagszuschläge
- Feiertagszuschläge
- Schichtzulagen

Jedes Konto hat eine Einheit (Minuten, Stunden oder Tage), ein Anzeigeformat (dezimal oder HH:MM) und kann als lohnrelevant markiert werden, damit es im Lohnexport erscheint.

### Schritt 9: Kostenstellen (optional)

Kostenstellen sind betriebswirtschaftliche Zuordnungen. Mitarbeiter und Aufträge können einer Kostenstelle zugewiesen werden, die dann im Lohnexport und in Berichten auftaucht.

---

## 4. Zeiterfassung — Täglicher Betrieb

### Wie ein Mitarbeiter stempelt

Ein Mitarbeiter hat mehrere Möglichkeiten, seine Arbeitszeit zu erfassen:

1. **Über den Browser**: Der Mitarbeiter meldet sich im System an und klickt auf "Kommen" (Arbeitsbeginn) oder "Gehen" (Arbeitsende). Für Pausen gibt es "Pause Anfang" und "Pause Ende".

2. **Über ein Zeiterfassungsterminal**: Ein physisches Gerät am Eingang, an dem der Mitarbeiter seine RFID-Karte vorhält oder seine PIN eingibt. Die Buchungen werden automatisch ins System übertragen.

**Was bei jeder Buchung gespeichert wird:**
- Datum und Uhrzeit (als Minuten seit Mitternacht, z. B. 8:15 = 495)
- Der Buchungstyp (Kommen, Gehen, Pause Anfang, Pause Ende usw.)
- Die Quelle (Web, Terminal, Korrektur)
- Optional: ein Buchungsgrund und Notizen

### Wie ein Arbeitstag berechnet wird

Jede Nacht (um 2:00 Uhr) berechnet das System automatisch den vergangenen Arbeitstag für alle Mitarbeiter. Die Berechnung kann auch manuell ausgelöst werden. Sie durchläuft diese Schritte:

#### Schritt 1: Tagesplan laden

Das System schaut nach, welcher Tagesplan für den Mitarbeiter an diesem Datum gilt. Dieser Plan bestimmt alle Regeln für den Tag (Sollzeit, Toleranzen, Pausenregeln usw.).

#### Schritt 2: Buchungen laden

Alle Buchungen des Mitarbeiters für diesen Tag werden geladen und nach Uhrzeit sortiert.

#### Schritt 3: Sonderfälle prüfen

Bevor die normale Berechnung beginnt, prüft das System einige Sonderfälle:

| Situation | Was passiert |
|-----------|-------------|
| Kein Tagesplan vorhanden | Tag wird als „frei" gewertet — 0 Stunden, kein Fehler |
| Feiertag, keine Buchungen, keine Abwesenheit | Feiertagsgutschrift laut Tagesplan (z. B. 8 Std.) |
| Feiertag, keine Buchungen, genehmigte Abwesenheit | Abwesenheitsgutschrift hat Vorrang (wenn Priorität > 0) |
| Keine Buchungen vorhanden | Verhalten laut Tagesplan: Fehler anzeigen ODER Sollzeit gutschreiben |
| Genehmigte Abwesenheit, keine Buchungen | Alternative Sollarbeitszeit (wenn im Tagesplan hinterlegt) |

#### Schritt 4: Toleranzen anwenden

Toleranzen gleichen kleine Abweichungen beim Stempeln aus:

> **Beispiel:** Der Tagesplan sieht Arbeitsbeginn um 8:00 Uhr vor, die Toleranz beträgt ±5 Minuten.
>
> - Der Mitarbeiter stempelt um **8:03** → Das System rechnet mit **8:00** (innerhalb der Toleranz)
> - Der Mitarbeiter stempelt um **8:07** → Das System rechnet mit **8:07** (außerhalb der Toleranz)
> - Der Mitarbeiter stempelt um **7:57** → Das System rechnet mit **8:00** (innerhalb der Toleranz)

Toleranzen funktionieren in beide Richtungen:

| Toleranz | Bedeutung |
|----------|-----------|
| Kommen Plus | Wie viele Minuten darf man zu spät kommen, ohne dass es zählt |
| Kommen Minus | Wie viele Minuten darf man zu früh kommen, ohne dass es als Mehrarbeit zählt |
| Gehen Plus | Wie viele Minuten darf man länger bleiben, ohne dass es als Überstunde zählt |
| Gehen Minus | Wie viele Minuten darf man früher gehen, ohne dass es als Fehlzeit zählt |

**Wichtig bei Gleitzeit:** Bei Gleitzeitplänen sind bestimmte Toleranzen deaktiviert, da die Flexibilität bereits durch das Gleitzeitfenster gegeben ist.

#### Schritt 5: Rundung anwenden

Nach den Toleranzen werden die Stempelzeiten gerundet. Die Rundungsart wird im Tagesplan festgelegt:

| Rundungsart | Wirkung | Beispiel (15-Min.-Intervall) |
|------------|---------|------------------------------|
| Aufrunden | Kommen wird auf das nächste Intervall aufgerundet | 8:07 → 8:15 |
| Abrunden | Gehen wird auf das vorherige Intervall abgerundet | 16:52 → 16:45 |
| Nächster Wert | Rundet auf den nächsten Intervallwert | 8:07 → 8:00, 8:08 → 8:15 |
| Aufschlag | Fester Minutenbetrag wird hinzuaddiert | 8:00 + 5 = 8:05 |
| Abschlag | Fester Minutenbetrag wird abgezogen | 16:30 − 5 = 16:25 |

Standardmäßig werden nur die **erste Ankunft** und der **letzte Abgang** gerundet. Optional kann die Rundung auch auf alle Buchungen angewendet werden.

Die Rundung kann wahlweise **relativ zum Tagesplan** erfolgen: Dann dient nicht Mitternacht, sondern die geplante Anfangszeit als Bezugspunkt für das Rundungsraster.

#### Schritt 6: Zeitfenster-Kappung

Falls der Mitarbeiter außerhalb des erlaubten Zeitfensters stempelt, wird die Zeit gekappt:

> **Beispiel:** Das Kommen-Fenster ist 6:00–9:00 Uhr.
> - Der Mitarbeiter stempelt um **5:45** → Das System rechnet mit **6:00** (zu früh, gekappt)
> - Der Mitarbeiter stempelt um **7:30** → Keine Kappung (innerhalb des Fensters)

Die gekappten Minuten werden separat auf ein Kappungskonto gebucht.

#### Schritt 7: Buchungen paaren

Das System ordnet die Buchungen zu Paaren:
- **Arbeit**: Kommen → Gehen (Ein → Aus)
- **Pause**: Pause Anfang → Pause Ende (Aus → Ein)

Nicht gepaarte Buchungen erzeugen eine Warnung.

#### Schritt 8: Bruttoarbeitszeit berechnen

Die Bruttoarbeitszeit ist die Summe aller Arbeitspaare:

> **Beispiel:**
> - Paar 1: Kommen 8:00, Gehen 12:00 → 4 Stunden
> - Paar 2: Kommen 12:30, Gehen 16:30 → 4 Stunden
> - **Bruttoarbeitszeit: 8 Stunden**

#### Schritt 9: Pausen abziehen

Es gibt drei Arten von Pausenregeln:

| Pausenart | Beschreibung | Beispiel |
|-----------|-------------|---------|
| **Feste Pause** | Wird immer innerhalb eines festen Zeitfensters abgezogen | 12:00–12:30, immer 30 Min. |
| **Automatische Pause** | Wird nur abgezogen, wenn keine manuelle Pause gestempelt wurde UND eine Mindestarbeitszeit erreicht ist | 30 Min. nach 6 Std. Arbeit |
| **Mindestpause** | Wird abgezogen, wenn die gestempelte Pause kürzer ist als die Mindestdauer | Mindestens 30 Min. — gestempelt wurden nur 20 Min. → 10 Min. werden nachgebucht |

#### Schritt 10: Nettoarbeitszeit und Kappung

**Nettoarbeitszeit = Bruttoarbeitszeit − Pausenzeit**

Falls eine maximale Nettoarbeitszeit im Tagesplan hinterlegt ist (z. B. 10 Stunden), wird die Nettozeit auf diesen Wert gekappt. Die Differenz wird auf das Kappungskonto gebucht.

#### Schritt 11: Überstunden und Fehlzeit

Das System vergleicht die Nettoarbeitszeit mit der Sollarbeitszeit:

| Vergleich | Ergebnis | Beispiel |
|-----------|----------|---------|
| Netto > Soll | **Überstunden** = Netto − Soll | 8:30 − 8:00 = 0:30 Überstunden |
| Netto < Soll | **Fehlzeit** = Soll − Netto | 7:00 − 8:00 = 1:00 Fehlzeit |
| Netto = Soll | Weder noch | Punkt 8 Stunden |

#### Zuschläge

Der Tagesplan kann Zuschlagsregeln enthalten (z. B. Nachtzuschlag von 22:00–6:00 Uhr). Diese werden basierend auf den tatsächlichen Arbeitszeiten berechnet und auf die zugehörigen Konten gebucht.

### Was der Mitarbeiter sieht — das Tagesergebnis

Nach der Berechnung sieht der Mitarbeiter (und sein Vorgesetzter) für jeden Tag:

- Erste Ankunft und letzter Abgang
- Bruttoarbeitszeit, Pausenzeit, Nettoarbeitszeit
- Sollarbeitszeit
- Überstunden oder Fehlzeit
- Anzahl der Buchungen
- Eventuelle Fehler oder Warnungen (z. B. "Zu früh gekommen", "Kernzeit nicht eingehalten")
- Status: Ausstehend, Berechnet, Fehler, Genehmigt

### Flex-Zeit (Gleitzeitkonto)

Das Gleitzeitkonto sammelt die täglichen Plus- und Minusstunden über den Monat. Am Monatsende wird das Saldo nach den Regeln des Tarifs verarbeitet:

| Übertragungsart | Beschreibung |
|----------------|-------------|
| **Keine Bewertung** | Das Flexzeitsaldo wird 1:1 in den nächsten Monat übernommen, ohne jede Kappung |
| **Vollständige Übertragung** | Flexzeit wird übertragen, aber die monatliche und jährliche Obergrenze wird angewendet. Überschüssige Stunden verfallen. |
| **Nach Schwellenwert** | Nur die Stunden oberhalb eines Schwellenwerts werden gutgeschrieben. Alles darunter verfällt. |
| **Keine Übertragung** | Das Flexzeitkonto wird jeden Monat auf Null gesetzt. Alle Plus- und Minusstunden verfallen. |

> **Beispiel — Vollständige Übertragung:**
> - Vormonat: Flexzeitsaldo +12:00 Stunden
> - Dieser Monat: +3:30 Überstunden, −1:00 Fehlzeit → Veränderung +2:30
> - Neues Saldo: +14:30 Stunden
> - Jährliche Obergrenze: ±40:00 Stunden → 14:30 bleibt (unter der Grenze)

### Wie Überstunden entstehen und gespeichert werden

Überstunden entstehen täglich als Differenz zwischen Netto- und Sollarbeitszeit. Sie werden:
1. Im **Tageswert** als `Überstunden` gespeichert
2. Im **Monatswert** als Summe aller täglichen Überstunden aggregiert
3. Im **Flexzeitkonto** als Teil der monatlichen Saldoveränderung berücksichtigt
4. Optional auf ein separates **Überstundenkonto** gebucht

---

## 5. Schichtplanung

### Was Schichten sind

Eine Schicht ist ein benanntes Arbeitszeitpaket mit:
- Einem Code und Namen (z. B. "FS" = Frühschicht, "SS" = Spätschicht)
- Einer Farbe (für die visuelle Darstellung im Schichtplan)
- Einem optionalen Tagesplan (der die konkreten Arbeitszeiten enthält)
- Einer optionalen Qualifikationsanforderung

### Wie Schichten Mitarbeitern zugewiesen werden

Es gibt zwei Wege:

1. **Über den Tarif (automatisch):** Wenn der Mitarbeiter einen Tarif mit wöchentlichem, rollierendem oder X-Tage-Rhythmus hat, generiert das System automatisch Tagespläne für jeden Tag. Der Mitarbeiter muss nichts tun.

2. **Manuelle Zuweisung:** Ein Vorgesetzter weist einem Mitarbeiter eine Schicht für einen bestimmten Zeitraum zu. Die Schicht bringt ihren Tagesplan mit.

Manuelle Zuweisungen haben Vorrang vor automatischen Tarifplänen — d. h. wenn ein Tag manuell geplant wurde, überschreibt die automatische Generierung ihn nicht.

### Was passiert bei Abweichungen

Wenn ein Mitarbeiter zu früh oder zu spät kommt oder geht, greifen die im Tagesplan hinterlegten Regeln:

| Situation | Auswirkung |
|-----------|-----------|
| Zu früh kommen | Wenn innerhalb der Toleranz: keine Auswirkung. Wenn vor dem Kommen-Fenster: Kappung auf Fensteranfang. |
| Zu spät kommen | Wenn innerhalb der Toleranz: keine Auswirkung. Wenn nach der Toleranz: Fehlzeit ab Sollbeginn. |
| Zu früh gehen | Wenn innerhalb der Toleranz: keine Auswirkung. Sonst: Fehlzeit bis Sollende. |
| Zu spät gehen | Wenn innerhalb der Toleranz: keine Auswirkung. Wenn nach dem Gehen-Fenster: Kappung auf Fensterende. |
| Kernzeit nicht eingehalten | Warnung wird erzeugt, Arbeitszeit wird normal berechnet |

### Automatische Schichterkennung

Manche Tagespläne sind so konfiguriert, dass das System anhand der tatsächlichen Ankunfts- und Abgangszeit erkennt, welche Schicht der Mitarbeiter tatsächlich arbeitet. Dazu werden bis zu sechs alternative Tagespläne hinterlegt. Das System prüft bei der Berechnung, welcher Plan am besten zu den tatsächlichen Stempelzeiten passt, und verwendet dann dessen Regeln.

> **Beispiel:** Ein Mitarbeiter hat den Standardplan "Frühschicht" (6:00–14:00). Er kommt aber erst um 14:00 und geht um 22:00. Die Schichterkennung erkennt, dass der Plan "Spätschicht" (14:00–22:00) besser passt, und berechnet den Tag mit den Regeln der Spätschicht.

### Rollierende Schichtrhythmen

Für Unternehmen mit wechselnden Schichten bietet Terp zwei Rhythmusarten:

**Rollierend wöchentlich** — Mehrere Wochenpläne wechseln sich ab:

> **Beispiel — 3-Schicht-Betrieb:**
> - Woche 1: Frühschicht (Mo–Fr 6:00–14:00)
> - Woche 2: Spätschicht (Mo–Fr 14:00–22:00)
> - Woche 3: Nachtschicht (Mo–Fr 22:00–6:00)
> - Dann wieder von vorn
>
> Startdatum: 06.01.2026 → das System weiß ab diesem Tag, welche Woche welchem Plan entspricht.

**X-Tage-Rhythmus** — Ein frei definierbarer Zyklus:

> **Beispiel — 4 Tage Arbeit, 2 Tage frei:**
> - Tag 1: Frühschicht
> - Tag 2: Frühschicht
> - Tag 3: Spätschicht
> - Tag 4: Spätschicht
> - Tag 5: Frei
> - Tag 6: Frei
> - Dann wieder von vorn (Zykluslänge: 6 Tage)

### Tageswechsel bei Nachtschichten

Wenn eine Schicht über Mitternacht hinausgeht (z. B. 22:00–6:00), muss das System entscheiden, welchem Kalendertag die Arbeitszeit zugeordnet wird. Dafür gibt es vier Einstellungen im Tagesplan:

| Einstellung | Bedeutung |
|------------|-----------|
| Keine | Keine besondere Behandlung (Standard) |
| Bei Ankunft | Die gesamte Arbeitszeit wird dem Tag der Ankunft zugerechnet |
| Bei Abgang | Die gesamte Arbeitszeit wird dem Tag des Abgangs zugerechnet |
| Automatisch ergänzen | An der Tagesgrenze (Mitternacht) werden automatische Buchungen erzeugt |

---

## 6. Urlaub & Abwesenheiten

### Wie ein Mitarbeiter Urlaub beantragt

1. Der Mitarbeiter wählt den **Abwesenheitstyp** (z. B. "Jahresurlaub").
2. Er gibt den **Zeitraum** an (Von-Datum bis Bis-Datum).
3. Optional wählt er **halbe Tage** (Vormittag oder Nachmittag).
4. Er sendet den Antrag ab.

Das System erstellt für jeden Arbeitstag im Zeitraum einen eigenen Eintrag. Dabei werden automatisch übersprungen:
- Samstage und Sonntage
- Tage ohne Tagesplan (freie Tage laut Schichtplan)
- Tage, an denen bereits eine Abwesenheit eingetragen ist

> **Beispiel:** Ein Mitarbeiter beantragt Urlaub vom 10.03. (Montag) bis 14.03. (Freitag). Das System erstellt 5 Abwesenheitseinträge — einen für jeden Wochentag. Feiertage werden *nicht* automatisch übersprungen (die Feiertagsbehandlung erfolgt bei der Tagesberechnung).

### Der Genehmigungsworkflow

Jede Abwesenheit durchläuft einen Workflow mit vier möglichen Zuständen:

```
Beantragt  →  Genehmigt
           →  Abgelehnt
Genehmigt  →  Storniert
```

| Aktion | Wer darf das | Was passiert |
|--------|-------------|-------------|
| **Beantragen** | Mitarbeiter (mit Berechtigung) | Status wird "Beantragt". Der Tag wird neu berechnet. |
| **Genehmigen** | Vorgesetzter (mit Berechtigung) | Status wird "Genehmigt". Der Tag wird neu berechnet. Wenn der Abwesenheitstyp Urlaub abzieht, wird das Urlaubskonto aktualisiert. Der Mitarbeiter wird benachrichtigt. |
| **Ablehnen** | Vorgesetzter (mit Berechtigung) | Status wird "Abgelehnt" mit Begründung. Der Mitarbeiter wird benachrichtigt. |
| **Stornieren** | Vorgesetzter (mit Berechtigung) | Nur für bereits genehmigte Abwesenheiten. Status wird "Storniert". Das Urlaubskonto wird zurückgerechnet. |

Nur beantragte Abwesenheiten können bearbeitet werden (z. B. Dauer oder Notizen ändern). Genehmigte und abgelehnte Einträge sind gesperrt.

### Wie das Urlaubskonto berechnet wird

Das Urlaubskonto wird pro Mitarbeiter und Jahr geführt. Es besteht aus vier Werten:

| Wert | Beschreibung |
|------|-------------|
| **Anspruch** | Der errechnete Jahresurlaub (aus Tarif, Arbeitszeit, Sondertagen) |
| **Übertrag** | Resturlaub aus dem Vorjahr (ggf. gekappt) |
| **Anpassungen** | Manuelle Korrekturen (z. B. Sonderurlaub durch HR) |
| **Genommen** | Summe aller genehmigten Urlaubstage |

**Verfügbar = Anspruch + Übertrag + Anpassungen − Genommen**

#### Wie der Anspruch berechnet wird

Die Anspruchsberechnung berücksichtigt mehrere Faktoren:

1. **Basisurlaubstage** — aus dem Tarif des Mitarbeiters (z. B. 30 Tage)
2. **Anteilsberechnung** — bei unterjährigem Ein- oder Austritt wird der Anspruch auf die Beschäftigungsmonate umgerechnet (pro Monat = Basistage ÷ 12)
3. **Teilzeitanpassung** — bei Teilzeit wird proportional zur Wochenarbeitszeit gekürzt (z. B. 20 Std. / 40 Std. = halber Anspruch)
4. **Sonderurlaubstage** — können automatisch nach Regeln vergeben werden:
   - **Alter**: Ab einem bestimmten Alter zusätzliche Tage (z. B. ab 50 Jahren: +2 Tage)
   - **Betriebszugehörigkeit**: Ab einer bestimmten Dauer zusätzliche Tage (z. B. ab 10 Jahren: +3 Tage)
   - **Schwerbehinderung**: Zusätzliche Tage bei anerkannter Schwerbehinderung

Das Ergebnis wird auf halbe Tage gerundet.

> **Beispiel:**
> - Basistage: 30
> - Eintritt: 01.04. → 9 Monate beschäftigt → 30 × (9/12) = 22,5 Tage
> - Teilzeit 30 Std./Woche → 22,5 × (30/40) = 16,875 → gerundet: 17,0 Tage
> - Ab 50 Jahren: +2 Tage → **19,0 Tage Anspruch**

#### Was der "genommen"-Wert genau zählt

Für jeden genehmigten Abwesenheitstag eines Typs, der Urlaub abzieht, wird der Urlaubsabzugswert aus dem Tagesplan herangezogen:
- Ein normaler Arbeitstag mit Urlaubsabzug 1,0 → zieht 1 Tag ab
- Ein halber Tag → zieht 0,5 Tage ab
- Ein Tagesplan mit Urlaubsabzug 0,5 (z. B. Kurzarbeitstag) → zieht nur 0,5 Tage ab

Das System berechnet den "genommen"-Wert nicht inkrementell, sondern jedes Mal komplett neu als Summe aller genehmigten Urlaubstage des Jahres.

### Was am Jahresende mit Resturlaub passiert

Am Jahresende wird der verfügbare Resturlaub als **Übertrag** in das neue Jahr übernommen. Dabei können **Kappungsregeln** greifen:

| Regeltyp | Beschreibung |
|----------|-------------|
| **Jahresendkappung** | Am 31.12. wird der Übertrag auf einen Maximalwert gekappt. Alles darüber verfällt. |
| **Halbjahresregel** | Bis zu einem Stichtag im neuen Jahr (z. B. 31.03.) gelten die vollen Resttage. Danach wird erneut gekappt. |

Für einzelne Mitarbeiter können **Ausnahmen** definiert werden:
- **Vollständige Ausnahme**: Die Kappungsregel wird komplett ignoriert
- **Teilweise Ausnahme**: Der Mitarbeiter darf mehr Tage behalten als die Regel erlaubt

> **Beispiel:**
> - Mitarbeiter hat am 31.12. noch 12 Resturlaubstage
> - Kappungsregel: maximal 5 Tage Übertrag
> - Ergebnis: 5 Tage werden ins neue Jahr übertragen, 7 Tage verfallen
> - Ausnahme: Der Mitarbeiter darf 8 Tage behalten → 8 Tage werden übertragen, 4 verfallen

### Welche Abwesenheitstypen es gibt und was sie bewirken

| Typ | Wirkung auf die Tagesberechnung | Urlaubsabzug |
|-----|-------------------------------|-------------|
| **Jahresurlaub** | Gutschrift der Sollzeit (oder der alternativen Sollzeit) | Ja |
| **Sonderurlaub** | Gutschrift der Sollzeit | Nein (je nach Konfiguration) |
| **Krankheit** | Gutschrift der Sollzeit | Nein |
| **Kind krank** | Gutschrift der Sollzeit | Nein |
| **Unbezahlter Urlaub** | Keine Gutschrift (Fehlzeit) | Nein |
| **Berufsschule** | Gutschrift der Sollzeit | Nein |
| **Fortbildung** | Gutschrift der Sollzeit | Nein |

Die genaue Wirkung hängt von der Konfiguration des Abwesenheitstyps ab (Gutschriftanteil: 0 = keine, 1 = voll, 2 = halb).

---

## 7. Aufgaben des Managers

### Team-Dashboard: Wer ist da, wer nicht?

Der Vorgesetzte sieht eine Übersicht seiner Mitarbeiter (je nach Datensichtbereich) mit:
- Tägliche Buchungen und berechnete Tageswerte
- Abwesenheiten (beantragt, genehmigt)
- Fehler und Warnungen in den Tagesberechnungen
- Monatliche Zusammenfassungen

### Korrekturen: Fehlende oder falsche Buchungen berichtigen

Wenn ein Mitarbeiter eine Buchung vergessen hat oder die Zeit falsch ist, kann der Vorgesetzte auf zwei Arten korrigieren:

**1. Buchung bearbeiten**
- Eine bestehende Buchung kann in der Uhrzeit geändert werden ("bearbeitete Zeit").
- Die ursprüngliche Zeit bleibt als Referenz gespeichert.
- Nach der Änderung wird der Tag automatisch neu berechnet.

**2. Korrektur anlegen**
- Eine Korrektur ist ein eigenständiger Eintrag, der einen Zeitwert addiert oder subtrahiert.
- Jede Korrektur hat einen Typ, einen Minutenwert und optional ein Konto.
- Korrekturen durchlaufen einen eigenen Genehmigungsworkflow:

| Status | Beschreibung |
|--------|-------------|
| Beantragt | Korrektur wurde erstellt, wartet auf Genehmigung |
| Genehmigt | Korrektur wurde bestätigt, Tag wird neu berechnet |
| Abgelehnt | Korrektur wurde abgelehnt |

Nur beantragte Korrekturen können bearbeitet oder gelöscht werden. Genehmigte Korrekturen können nicht gelöscht werden. Abgelehnte Korrekturen können gelöscht werden.

### Monatsabschluss

Am Ende eines Monats kann der Vorgesetzte den Monat für einen Mitarbeiter **abschließen**. Das bedeutet:

1. **Was der Abschluss bewirkt:**
   - Der Monat wird als „abgeschlossen" markiert
   - Ab sofort können keine Buchungen oder Korrekturen für diesen Monat mehr verändert werden
   - Die Monatswerte (Arbeitszeit, Überstunden, Fehlzeiten, Flexzeitsaldo) sind eingefroren
   - Der Monat kann für den Lohnexport freigegeben werden

2. **Was passiert, wenn nachträglich eine Änderung nötig ist:**
   - Ein berechtigter Benutzer kann den Monat **wieder öffnen**
   - Nach der Korrektur wird der Monat erneut berechnet
   - Dann kann er wieder abgeschlossen werden

3. **Der Monatsabschluss enthält diese Werte:**

| Wert | Beschreibung |
|------|-------------|
| Bruttoarbeitszeit (gesamt) | Summe aller täglichen Bruttozeiten |
| Nettoarbeitszeit (gesamt) | Summe aller täglichen Nettozeiten |
| Sollarbeitszeit (gesamt) | Summe aller täglichen Sollzeiten |
| Überstunden (gesamt) | Summe aller täglichen Überstunden |
| Fehlzeiten (gesamt) | Summe aller täglichen Fehlzeiten |
| Pausenzeit (gesamt) | Summe aller täglichen Pausenzeiten |
| Flexzeit Anfang | Flexzeitsaldo am Monatsanfang (= Ende des Vormonats) |
| Flexzeit Veränderung | Überstunden − Fehlzeiten |
| Flexzeit Ende | Saldo am Monatsende (nach Anwendung der Tarifregeln) |
| Flexzeit Übertrag | Was tatsächlich in den nächsten Monat übertragen wird |
| Urlaubstage genommen | Genehmigte Urlaubstage im Monat |
| Krankheitstage | Genehmigte Krankheitstage im Monat |
| Arbeitstage | Tage mit Arbeitszeit > 0 |
| Tage mit Fehlern | Tage, die einen Berechnungsfehler haben |

### DATEV/CSV-Export: Lohnvorbereitung

Nach dem Monatsabschluss kann ein Lohnexport erstellt werden. Der Export enthält pro Mitarbeiter eine Zeile mit:

- Personalnummer, Vorname, Nachname
- Abteilungscode, Kostenstellencode
- Sollstunden, Ist-Stunden, Überstunden
- Urlaubstage, Krankheitstage, sonstige Abwesenheitstage
- Optional: Werte aus weiteren Konten (Zuschläge usw.)

**Format:** Semikolon-getrennte CSV-Datei, die in DATEV oder andere Lohnabrechnungssysteme importiert werden kann.

**Einschränkungen:**
- Der aktuelle und zukünftige Monate können nicht exportiert werden (nur abgeschlossene Monate)
- Der Export kann auf bestimmte Abteilungen oder Mitarbeiter eingeschränkt werden

### Berichte

Folgende Berichtstypen stehen zur Verfügung:

| Bericht | Inhalt |
|---------|--------|
| **Tagesübersicht** | Tägliche Arbeitszeitwerte für einen Zeitraum |
| **Wochenübersicht** | Wöchentliche Zusammenfassung der Arbeitszeiten |
| **Mitarbeiter-Zeitnachweis** | Detaillierter Zeitnachweis pro Mitarbeiter |
| **Monatsübersicht** | Monatliche Zusammenfassung aller Mitarbeiter |
| **Abwesenheitsbericht** | Alle Abwesenheiten in einem Zeitraum |
| **Überstundenbericht** | Überstundenentwicklung pro Mitarbeiter |
| **Abteilungszusammenfassung** | Arbeitszeiten gruppiert nach Abteilung |
| **Kontostände** | Flexzeitsalden aller Mitarbeiter |
| **Urlaubsbericht** | Urlaubskonten mit Anspruch, genommen und Rest |

Berichte können als **CSV** oder **JSON** heruntergeladen werden. Sie können nach Abteilungen, Kostenstellen, Teams und einzelnen Mitarbeitern gefiltert werden.

---

## 8. Automatisierung — Was passiert im Hintergrund?

Terp führt vier automatische Aufgaben aus, die regelmäßig im Hintergrund laufen:

### 1. Tagesberechnung — Jede Nacht um 2:00 Uhr

**Was passiert:** Für alle aktiven Mitarbeiter in allen Mandanten werden die Tageswerte des aktuellen Tages berechnet.

**Ablauf:**
1. Das System geht jeden Mandanten nacheinander durch
2. Für jeden Mandanten werden alle aktiven Mitarbeiter verarbeitet (bis zu 5 gleichzeitig)
3. Für jeden Mitarbeiter wird der Tagesberechnungsalgorithmus ausgeführt (siehe Abschnitt 4)
4. Die Ergebnisse werden in der Datenbank gespeichert

**Warum:** Damit am nächsten Morgen alle Tageswerte aktuell sind, auch wenn ein Mitarbeiter vergessen hat, eine Buchung auszulösen.

> **Hinweis:** Die Tagesberechnung wird auch automatisch ausgelöst, wenn ein Mitarbeiter eine Buchung erstellt, ändert oder löscht. Die nächtliche Berechnung ist ein Sicherheitsnetz.

### 2. Monatsberechnung — Am 2. jedes Monats um 3:00 Uhr

**Was passiert:** Für alle aktiven Mitarbeiter wird der **Vormonat** zusammengefasst.

**Ablauf:**
1. Alle Tageswerte des Vormonats werden addiert
2. Abwesenheitstage werden gezählt und kategorisiert (Urlaub, Krankheit, Sonstige)
3. Das Flexzeitsaldo wird berechnet (Anfang + Veränderung = Ende) und die Tarifregeln angewendet
4. Das Ergebnis wird als Monatswert gespeichert

**Warum:** Damit die monatlichen Zusammenfassungen und das Flexzeitkonto stets aktuell sind. Die Monatsberechnung wird auch bei jeder einzelnen Tagesberechnung mitaktualisiert.

### 3. Schichtplan-Generierung — Jeden Sonntag um 1:00 Uhr

**Was passiert:** Für alle Mitarbeiter mit einem Tarif werden die **Tagespläne für die nächsten 14 Tage** erzeugt.

**Ablauf:**
1. Das System liest den Tarif jedes Mitarbeiters
2. Je nach Rhythmustyp (wöchentlich, rollierend, X-Tage) wird der richtige Tagesplan für jedes Datum bestimmt
3. Ein `EmployeeDayPlan`-Eintrag wird für jeden Tag angelegt oder aktualisiert
4. Manuell geänderte oder als Feiertag markierte Tage werden nicht überschrieben

**Warum:** Damit die Schichtplanung stets voraus geplant ist und Mitarbeiter sehen können, welche Schichten sie in den nächsten zwei Wochen haben.

### 4. Makro-Ausführung — Alle 15 Minuten

**Was passiert:** Das System prüft, ob programmierte Automatisierungsregeln (Makros) fällig sind, und führt sie aus.

#### Was sind Makros?

Makros sind benutzerdefinierte Automatisierungen, die regelmäßig bestimmte Aktionen ausführen. Jeder Makro besteht aus:

- **Typ**: Wöchentlich (läuft an einem bestimmten Wochentag) oder Monatlich (läuft an einem bestimmten Tag im Monat)
- **Aktion**: Was der Makro tut (z. B. Flexzeit zurücksetzen, Saldo übertragen)
- **Zuweisung**: Für welchen Tarif oder welchen Mitarbeiter der Makro gilt
- **Ausführungstag**: Wochentag (0–6) oder Tag im Monat (1–31)

| Aktionstyp | Beschreibung |
|-----------|-------------|
| Protokollnachricht | Erstellt einen Protokolleintrag (für Testzwecke) |
| Sollstunden neu berechnen | Aktualisiert die Sollstunden basierend auf dem aktuellen Tarif |
| Flexzeit zurücksetzen | Setzt das Flexzeitkonto auf Null |
| Saldo vortragen | Überträgt einen Kontosaldo in die nächste Periode |

**Beispiel:** Ein monatlicher Makro "Flexzeit zurücksetzen" ist dem Tarif "Minijob" zugewiesen und läuft am 1. jedes Monats. Alle Minijob-Mitarbeiter starten so jeden Monat mit einem Flexzeitkonto von Null.

Makros können auch manuell von einem Administrator ausgelöst werden. Jede Ausführung (automatisch oder manuell) wird protokolliert, sodass nachvollziehbar ist, wann was ausgeführt wurde.

---

## 9. Aufträge & Projektzeiterfassung

### Was Aufträge sind

Ein Auftrag (oder Projekt) ist eine organisatorische Einheit, auf die Mitarbeiter ihre Arbeitszeit buchen können. Aufträge sind unabhängig von der normalen Zeiterfassung — sie beantworten die Frage "Wofür wurde gearbeitet?", während die Zeiterfassung die Frage "Wie lange wurde gearbeitet?" beantwortet.

Jeder Auftrag hat:
- Einen eindeutigen Code und Namen
- Einen Status (Geplant, Aktiv, Abgeschlossen, Storniert)
- Optional: Kunde, Kostenstelle, Stundensatz, Gültigkeitszeitraum

### Wie Mitarbeiter Zeit auf Aufträge buchen

1. Der Mitarbeiter wählt das **Datum** und den **Auftrag**
2. Er wählt optional eine **Aktivität** (z. B. Entwicklung, Montage, Dokumentation)
3. Er gibt die **Dauer in Minuten** ein
4. Optional kann er eine **Beschreibung** hinzufügen

> **Beispiel:** Max Mustermann bucht am 10.03. 4 Stunden (240 Minuten) auf den Auftrag "A-2025-001 — Maschinenwartung Kunde XY", Aktivität "Montage".

### Wie Aktivitäten funktionieren

Aktivitäten sind Kategorien für die Art der Arbeit. Sie werden mandantenweit definiert und stehen dann bei allen Aufträgen zur Verfügung. Beispiele:

- Montage
- Inbetriebnahme
- Dokumentation
- Reisezeit
- Schulung

Jeder Mitarbeiter kann optional eine **Standard-Aktivität** zugewiesen bekommen, die bei Auftragsbuchungen vorausgefüllt wird.

### Wer auf welche Aufträge buchen kann

Die Zuordnung von Mitarbeitern zu Aufträgen erfolgt über **Auftragszuweisungen**. Jede Zuweisung hat:
- Den Mitarbeiter
- Den Auftrag
- Eine Rolle: Mitarbeiter, Leiter oder Vertrieb
- Optional einen Gültigkeitszeitraum

Ein Mitarbeiter kann auch einen **Standardauftrag** haben, auf den automatisch gebucht wird, wenn der Tagesplan dies vorsieht (Verhalten "Sollzeit mit Auftrag gutschreiben").

---

## 10. Zutrittskontrolle

### Wie RFID- und PIN-Zugang funktioniert

Jeder Mitarbeiter kann eine oder mehrere **Zutrittskarten** (RFID-Karten) haben. Jede Karte hat:
- Eine eindeutige Kartennummer
- Einen Kartentyp (Standard: RFID)
- Einen Gültigkeitszeitraum (von/bis)
- Einen Aktivierungsstatus

Zusätzlich hat jeder Mitarbeiter eine **PIN**, die bei der Zeiterfassung am Terminal als Alternative zur RFID-Karte verwendet werden kann.

**Kartenlebenszyklus:**
- Karte wird erstellt und ist sofort aktiv
- Karte kann deaktiviert werden (mit Begründung, z. B. "Verloren" oder "Mitarbeiter ausgeschieden")
- Deaktivierte Karten werden nicht gelöscht, sondern bleiben für die Nachverfolgung gespeichert

### Wie Zugangszonen definiert werden

**Zugangszonen** sind physische Bereiche, zu denen der Zutritt gesteuert wird (z. B. "Haupteingang", "Serverraum", "Lager Ost").

**Zugangsprofile** bündeln mehrere Zonen zu einem Berechtigungspaket (z. B. das Profil "Verwaltung" erlaubt Zugang zu Haupteingang und Büroetage, aber nicht zum Serverraum).

**Zuordnung:** Mitarbeiter erhalten ein Zugangsprofil mit optionalem Gültigkeitszeitraum. Ein Mitarbeiter kann mehrere Profile haben (z. B. "Verwaltung" und "Serverraum" für IT-Mitarbeiter).

### Terminal-Import

Zeiterfassungsterminals übermitteln ihre Buchungen gebündelt als **Import-Batches**. Jeder Batch enthält:
- Die Rohdaten: Mitarbeiter-PIN, Zeitstempel, Buchungscode
- Das System ordnet automatisch die PIN dem Mitarbeiter und den Buchungscode dem Buchungstyp zu
- Nicht auflösbare PINs oder Codes werden als Fehler markiert, aber nicht abgelehnt

Jeder Import hat eine eindeutige Referenznummer, die Doppelimporte verhindert. Pro Import können bis zu 5.000 Buchungen verarbeitet werden.

### Wie Zugangsprotokolle ausgewertet werden

Alle Terminal-Buchungen werden als Rohdaten dauerhaft gespeichert. Sie können nach verschiedenen Kriterien gefiltert werden:
- Nach Datum und Zeitraum
- Nach Mitarbeiter
- Nach Terminal
- Nach Verarbeitungsstatus (ausstehend, verarbeitet, fehlerhaft)

---

## 11. Glossar

| Begriff | Erklärung |
|---------|-----------|
| **Abwesenheit** | Ein Eintrag, der besagt, dass ein Mitarbeiter an einem bestimmten Tag nicht arbeitet. Hat einen Typ (Urlaub, Krankheit usw.) und einen Genehmigungsstatus. |
| **Abwesenheitstyp** | Eine Kategorie für Abwesenheiten (z. B. Jahresurlaub, Krankheit, Berufsschule). Bestimmt, ob Urlaub abgezogen wird, ob eine Genehmigung nötig ist und wie der Tag bewertet wird. |
| **Aktivität** | Eine Art der Arbeit innerhalb eines Auftrags (z. B. Montage, Dokumentation). Dient der Feingliederung der Auftragszeiterfassung. |
| **Auftrag** | Ein Projekt oder Kundenauftrag, auf den Mitarbeiter ihre Arbeitszeit buchen können. Hat einen Code, Status und optional einen Stundensatz. |
| **Auftragsbuchung** | Eine Zeitbuchung eines Mitarbeiters auf einen bestimmten Auftrag an einem bestimmten Datum. Enthält die Dauer in Minuten. |
| **Berechtigungsgruppe** | Eine Sammlung von Einzelberechtigungen, die einem Benutzer zugewiesen wird. Bestimmt, welche Funktionen der Benutzer nutzen darf. |
| **Bruttoarbeitszeit** | Die gesamte Zeit zwischen Kommen und Gehen — inklusive Pausen. |
| **Buchung** | Ein einzelner Stempel-Eintrag: Kommen, Gehen, Pause Anfang oder Pause Ende. Enthält das Datum, die Uhrzeit und den Buchungstyp. |
| **Buchungstyp** | Definiert die Bedeutung einer Buchung. Hat eine Richtung (Ein/Aus) und eine Kategorie (Arbeit/Pause/Dienstgang). |
| **Datensichtbereich** | Bestimmt, welche Mitarbeiter ein Benutzer sehen darf: alle, nur die eigene Abteilung oder nur bestimmte Mitarbeiter. |
| **Fehlzeit** | Die Differenz zwischen Soll- und Nettoarbeitszeit, wenn der Mitarbeiter weniger gearbeitet hat als vorgesehen. |
| **Feiertagsgutschrift** | Die Stundenzahl, die einem Mitarbeiter an einem Feiertag gutgeschrieben wird, auch wenn er nicht arbeitet. Wird im Tagesplan pro Feiertagskategorie festgelegt. |
| **Flexzeitsaldo** | Das laufende Konto, das Plus- und Minusstunden über die Monate sammelt. Wird am Monatsende nach den Tarifregeln verarbeitet. |
| **Kappung** | Das Abschneiden von Arbeitszeit, die außerhalb des erlaubten Zeitfensters liegt. |
| **Kernzeit** | Der Zeitraum innerhalb eines Gleitzeitmodells, in dem Anwesenheitspflicht besteht. |
| **Konto** | Eine Sammelstelle für berechnete Zeitwerte (z. B. Flexzeitkonto, Überstundenkonto, Nachtarbeitskonto). Kann lohnrelevant sein. |
| **Korrektur** | Eine manuelle Anpassung an den Zeitwerten eines Tages. Hat einen Minutenwert und durchläuft einen Genehmigungsworkflow. |
| **Kostenstelle** | Eine betriebswirtschaftliche Zuordnung für Mitarbeiter und Aufträge. Erscheint im Lohnexport. |
| **Makro** | Eine automatisierte Regel, die regelmäßig eine bestimmte Aktion ausführt (z. B. Flexzeit zurücksetzen). Kann wöchentlich oder monatlich laufen. |
| **Mandant** | Die oberste Organisationseinheit im System — in der Regel ein Unternehmen oder eine Niederlassung. Alle Daten sind mandantengetrennt. |
| **Monatsabschluss** | Das Einfrieren der Monatswerte eines Mitarbeiters. Nach dem Abschluss können keine Änderungen mehr vorgenommen werden, bis der Monat wieder geöffnet wird. |
| **Monatswert** | Die aggregierten Arbeitszeitwerte eines Mitarbeiters für einen Kalendermonat (Brutto, Netto, Soll, Überstunden, Fehlzeit, Flexzeit). |
| **Nettoarbeitszeit** | Die anrechenbare Arbeitszeit: Bruttozeit minus Pausenzeit, ggf. gekappt auf die maximale Nettoarbeitszeit. |
| **Personalnummer** | Eine eindeutige Kennung für jeden Mitarbeiter innerhalb eines Mandanten. |
| **PIN** | Eine persönliche Identifikationsnummer für die Stempelung am Zeiterfassungsterminal. |
| **RFID-Karte** | Eine Zutrittskarte mit einem Funkchip, die am Terminal vorgehalten wird, um sich zu identifizieren. |
| **Rundung** | Das automatische Auf- oder Abrunden von Stempelzeiten auf ein festgelegtes Intervall (z. B. 5 oder 15 Minuten). |
| **Schicht** | Ein benanntes Arbeitszeitpaket (z. B. "Frühschicht", "Spätschicht") mit Farbe und optional einem Tagesplan. |
| **Schichterkennung** | Die automatische Zuordnung einer Schicht basierend auf den tatsächlichen Stempelzeiten. Das System vergleicht mit bis zu 6 alternativen Tagesplänen. |
| **Sollarbeitszeit** | Die geplante Arbeitszeit für einen Tag, wie sie im Tagesplan definiert ist (z. B. 8 Stunden). |
| **Standort** | Ein physischer Arbeitsort (z. B. Werk, Büro) mit Adresse und Zeitzone. |
| **Tagesplan** | Die Arbeitszeitregeln für einen einzelnen Tag: Kommen-/Gehen-Fenster, Sollzeit, Pausen, Toleranzen, Rundung. |
| **Tageswert** | Das berechnete Ergebnis eines Arbeitstages: Brutto, Netto, Soll, Überstunden, Fehlzeit, Pausen, Fehler. |
| **Tarif** | Das vollständige Arbeitszeitmodell eines Mitarbeiters. Verbindet Wochenpläne mit Urlaubs- und Flexzeitregeln. |
| **Toleranz** | Ein Minutenpuffer, innerhalb dessen eine Abweichung beim Stempeln automatisch ausgeglichen wird. |
| **Überstunden** | Die Differenz zwischen Netto- und Sollarbeitszeit, wenn der Mitarbeiter mehr gearbeitet hat als vorgesehen. |
| **Überstundenkonto** | Ein Konto, das die aufgelaufenen Überstunden eines Mitarbeiters sammelt. |
| **Übertragungsart** | Bestimmt, wie das Flexzeitsaldo am Monatsende verarbeitet wird: vollständige Übertragung, nach Schwellenwert, keine Übertragung oder ohne Bewertung. |
| **Urlaubsabzug** | Der Faktor, mit dem ein Abwesenheitstag vom Urlaubskonto abgezogen wird (z. B. 1,0 für einen vollen Tag, 0,5 für einen halben). Wird im Tagesplan festgelegt. |
| **Urlaubskonto** | Das Jahresguthaben eines Mitarbeiters, bestehend aus Anspruch + Übertrag + Anpassungen − Genommen. |
| **Urlaubskappung** | Die Begrenzung des Resturlaubs, der ins nächste Jahr übertragen werden darf. |
| **Wochenplan** | Ordnet jedem Wochentag einen Tagesplan zu. Bildet eine vollständige Arbeitswoche ab. |
| **Zugangsprofil** | Eine Berechtigungsgruppe für den physischen Zutritt. Bündelt mehrere Zugangszonen. |
| **Zugangszone** | Ein physischer Bereich (z. B. Eingang, Serverraum), zu dem der Zutritt gesteuert wird. |
| **Zuschlag** | Ein Bonus, der für Arbeit in bestimmten Zeitfenstern gutgeschrieben wird (z. B. Nachtarbeit 22:00–6:00). Wird auf ein Konto gebucht. |

---

*Terp — Digitale Zeiterfassung und Personalverwaltung für deutsche Unternehmen.*
