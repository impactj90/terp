# Terp — Benutzerhandbuch (V2)

Dieses Handbuch erklärt jede Funktion von Terp und zeigt genau, wo sie in der Anwendung zu finden ist. Es dient gleichzeitig als **Prüfliste**: Jeder Abschnitt kann geöffnet, durchgeklickt und verifiziert werden.

**Legende:**
- 📍 = Navigationspfad (wo Sie klicken müssen)
- ✅ = Prüfpunkt (was Sie sehen oder bestätigen sollten)
- ⚠️ = Einschränkung (Berechtigung oder Bedingung erforderlich)

---

## Inhaltsverzeichnis

1. [Was ist Terp?](#1-was-ist-terp)
2. [Aufbau der Benutzeroberfläche](#2-aufbau-der-benutzeroberfläche)
3. [Rollen & Berechtigungen](#3-rollen--berechtigungen)
4. [Stammdaten — Was muss eingerichtet werden?](#4-stammdaten--was-muss-eingerichtet-werden)
   - [4.6.4 Praxisbeispiel: Arbeitszeitmodell für Büro-Mitarbeiter einrichten](#464-praxisbeispiel-arbeitszeitmodell-für-büro-mitarbeiter-einrichten)
5. [Zeiterfassung — Täglicher Betrieb](#5-zeiterfassung--täglicher-betrieb)
6. [Schichtplanung](#6-schichtplanung)
   - [6.6 Praxisbeispiel: 3-Schicht-Betrieb einrichten (Früh / Spät / Nacht)](#66-praxisbeispiel-3-schicht-betrieb-einrichten-früh--spät--nacht)
7. [Urlaub & Abwesenheiten](#7-urlaub--abwesenheiten)
   - [7.8 Praxisbeispiel: Urlaubskonto einrichten und Jahreswechsel durchführen](#78-praxisbeispiel-urlaubskonto-einrichten-und-jahreswechsel-durchführen)
8. [Aufgaben des Managers](#8-aufgaben-des-managers)
   - [8.3.1 Praxisbeispiel: Ersten Monat abschließen und DATEV-Export erstellen](#831-praxisbeispiel-ersten-monat-abschließen-und-datev-export-erstellen)
9. [Automatisierung — Was passiert im Hintergrund?](#9-automatisierung--was-passiert-im-hintergrund)
10. [Aufträge & Projektzeiterfassung](#10-aufträge--projektzeiterfassung)
    - [10.1.1 Praxisbeispiel: Auftrag anlegen und Zeiten erfassen](#1011-praxisbeispiel-auftrag-anlegen-und-zeiten-erfassen)
11. [Zutrittskontrolle](#11-zutrittskontrolle)
12. [Glossar](#12-glossar)

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

| Rolle | Was sie tut |
|-------|------------|
| **Mitarbeiter** | Eigene Zeiten sehen, Urlaub beantragen, auf Aufträge buchen |
| **Vorgesetzte / Manager** | Abwesenheiten genehmigen, Buchungen korrigieren, Monate abschließen |
| **Administratoren** | System einrichten, Benutzer verwalten, Exporte erstellen |
| **Lohnbuchhaltung** | Fertige Monatsexporte mit allen relevanten Stunden erhalten |

### Mandantenfähigkeit

Terp ist mandantenfähig: Ein Unternehmen (oder Dienstleister) kann mehrere Firmen oder Standorte als getrennte Mandanten verwalten. Jeder Mandant hat eigene Mitarbeiter, Abteilungen, Arbeitszeitmodelle und Einstellungen. Benutzer können einem oder mehreren Mandanten zugeordnet sein.

Bei mehreren Mandanten erscheint in der Kopfzeile ein **Mandanten-Umschalter**, mit dem zwischen den Mandanten gewechselt werden kann.

---

## 2. Aufbau der Benutzeroberfläche

### Anmeldung

📍 Beim Öffnen der Anwendung erscheint die **Anmeldeseite** (`/login`)

✅ E-Mail und Passwort eingeben → „Anmelden" klicken → Sie werden zum Dashboard weitergeleitet.

### Grundaufbau nach der Anmeldung

Die Anwendung besteht aus vier Bereichen:

```
┌─────────────────────────────────────────────────┐
│  Kopfzeile (Header)                   🔔 👤     │
├────────┬────────────────────────────────────────┤
│        │                                        │
│  Sei-  │  Inhalt                                │
│  ten-  │  (wechselt je nach Menüpunkt)          │
│  leiste│                                        │
│        │                                        │
└────────┴────────────────────────────────────────┘
```

**Kopfzeile** (oben, immer sichtbar):
- Links: Hamburger-Menü (nur auf Mobilgeräten)
- Mitte: Suchfeld „Suchen..." (nur auf Desktop)
- Rechts: Mandanten-Umschalter (bei mehreren Mandanten), Sprachumschalter (DE/EN), Farbmodus (Hell/Dunkel), Benachrichtigungsglocke 🔔, Benutzermenü 👤

**Benutzermenü** (Klick auf den Avatar oben rechts):
- „Profil" → öffnet `/profile`
- „Einstellungen" → öffnet `/settings`
- „Abmelden" → meldet ab und leitet zur Anmeldeseite

**Seitenleiste** (links, zusammenklappbar):
- Oben: „T"-Logo + „Terp" — Klick führt zum Dashboard
- Mitte: Menüpunkte in drei Gruppen (siehe unten)
- Unten: Pfeil-Symbol zum Ein-/Ausklappen der Seitenleiste

### Seitenleiste — Alle Menüpunkte

Die Seitenleiste ist in drei Bereiche gegliedert. Menüpunkte erscheinen nur, wenn der Benutzer die nötige Berechtigung hat.

#### Hauptmenü (für alle Benutzer sichtbar)

| Menüpunkt | Seite | Beschreibung |
|-----------|-------|-------------|
| Dashboard | `/dashboard` | Startseite mit Tagesübersicht |
| Teamübersicht | `/team-overview` | Wer ist anwesend, wer nicht |
| Stempeluhr | `/time-clock` | Ein-/Ausstempeln |
| Zeitnachweis | `/timesheet` | Eigene Buchungen und Tageswerte |
| Abwesenheiten | `/absences` | Urlaub beantragen und verwalten |
| Urlaub | `/vacation` | Urlaubskonto und Jahresübersicht |
| Monatsauswertung | `/monthly-evaluation` | Monatszusammenfassung |
| Jahresübersicht | `/year-overview` | Jahreszusammenfassung |

#### Verwaltung (je nach Berechtigung sichtbar)

| Menüpunkt | Berechtigung |
|-----------|-------------|
| Genehmigungen | Abwesenheiten genehmigen |
| Mitarbeiter | Mitarbeiter ansehen |
| Teams | Teams verwalten |
| Abteilungen | Abteilungen verwalten |
| Kostenstellen | Abteilungen verwalten |
| Standorte | Standorte verwalten |
| Beschäftigungsarten | Mitarbeiter ansehen |
| Tagespläne | Tagespläne verwalten |
| Wochenpläne | Wochenpläne verwalten |
| Tarife | Tarife verwalten |
| Feiertage | Feiertage verwalten |
| Abwesenheitsarten | Abwesenheitsarten verwalten |
| Buchungstypen | Buchungstypen verwalten |
| Kontaktarten | Kontaktverwaltung |
| Berechnungsregeln | Abwesenheitsarten verwalten |
| Konten | Konten verwalten |
| Korrekturassistent | Korrekturen verwalten |
| Auswertungen | Berichte ansehen |
| Monatswerte | Berichte ansehen |
| Urlaubskonten | Abwesenheiten verwalten |
| Urlaubskonfiguration | Abwesenheitsarten verwalten |
| Schichtplanung | Schichtplanung verwalten |
| Aufträge | Aufträge verwalten |
| Mitarbeiternachrichten | Benachrichtigungen verwalten |

#### Administration (je nach Berechtigung sichtbar)

| Menüpunkt | Berechtigung |
|-----------|-------------|
| Benutzer | Benutzer verwalten |
| Benutzergruppen | Benutzer verwalten |
| Berichte | Berichte ansehen |
| Audit-Protokoll | Benutzer verwalten |
| Einstellungen | Einstellungen verwalten |
| Mandanten | Mandanten verwalten |
| Lohnexporte | Lohnexport ansehen |
| Exportschnittstellen | Lohnexport verwalten |
| Auswertungsvorlagen | Monatsauswertungen verwalten |
| Zeitpläne | Zeitpläne verwalten |
| Makros | Makros verwalten |
| Zutrittskontrolle | Zutrittskontrolle verwalten |
| Terminal-Buchungen | Terminal-Buchungen verwalten |

### Auf dem Mobilgerät

Auf Smartphones und Tablets erscheint am unteren Bildschirmrand eine **Schnellnavigation** mit vier festen Einträgen:
- Dashboard | Stempeluhr | Zeitnachweis | Abwesenheiten | „Mehr" (öffnet die vollständige Seitenleiste als Einblendung)

---

## 3. Rollen & Berechtigungen

### Das Berechtigungsmodell

Terp verwendet ein zweistufiges Berechtigungssystem:

1. **Benutzerrolle** — Jeder Benutzer ist entweder ein normaler Benutzer oder ein Administrator.
2. **Berechtigungsgruppe** — Jeder Benutzer wird einer Gruppe zugeordnet, die festlegt, welche Funktionen er nutzen darf.

Es gibt genau zwei Rollen:

| Rolle | Bedeutung |
|-------|-----------|
| **Benutzer** | Standardrolle. Darf nur das, was die zugewiesene Berechtigungsgruppe erlaubt. |
| **Administrator** | Hat automatisch Zugriff auf alle Funktionen — unabhängig von der Berechtigungsgruppe. |

### Berechtigungsgruppen verwalten

⚠️ Nur für Benutzer mit der Berechtigung „Benutzer verwalten"

📍 Seitenleiste → **Administration** → **Benutzergruppen**

✅ Sie sehen eine Kartenansicht (zwei Spalten) mit allen Gruppen. Jede Karte zeigt: Name, Beschreibung, Code, Badges für „System"/„Admin"/„Aktiv", Mitgliederanzahl mit Avataren, und eine ausklappbare Berechtigungsliste.

#### Neue Berechtigungsgruppe anlegen

1. 📍 Seitenleiste → Administration → Benutzergruppen → **„Neue Gruppe"** (oben rechts)
2. Im Formular ausfüllen:
   - **Code** (Pflicht, Großbuchstaben, z. B. `TEAMLEITER`)
   - **Name** (Pflicht, z. B. „Teamleiter")
   - **Beschreibung** (optional)
   - **Admin-Schalter** — wenn aktiviert, hat die Gruppe vollen Zugriff
   - **Berechtigungen** — Checkboxen in 7 Kategorien (Mitarbeiter, Zeiterfassung, Buchungsübersicht, Abwesenheiten, Konfiguration, Administration, Berichte). Jede Kategorie hat „Alle auswählen" und „Details anzeigen".
3. 📍 „Erstellen" klicken

✅ Die neue Gruppe erscheint als Karte in der Übersicht.

> **Hinweis:** System-Gruppen (mit 🔒-Symbol) können nicht bearbeitet oder gelöscht werden.

### Berechtigungen im Überblick

| Bereich | Berechtigung | Was man damit tun kann |
|---------|-------------|----------------------|
| **Mitarbeiter** | Ansehen, Anlegen, Bearbeiten, Löschen | Mitarbeiterstammdaten verwalten |
| **Zeiterfassung** | Eigene Zeiten ansehen | Nur die eigenen Buchungen sehen |
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
| | Feiertage, Konten | Feiertagskalender und Zeitkonten verwalten |
| | Benutzer, Gruppen, Mandanten | Zugänge und Mandanten verwalten |
| **Berichte & Lohn** | Berichte ansehen / verwalten | Auswertungen erstellen und herunterladen |
| | Lohnexport ansehen / verwalten | Lohnexporte erstellen und herunterladen |
| **Sonstiges** | Schichtplanung, Zutrittskontrolle, Korrekturen, Makros usw. | Spezialfunktionen |

### Datensichtbarkeit

Zusätzlich zu den Berechtigungen kann für jeden Benutzer ein **Datensichtbereich** eingestellt werden:

| Sichtbereich | Was der Benutzer sieht |
|-------------|----------------------|
| **Alle** | Alle Daten im Mandanten |
| **Mandant** | Alle Daten im zugewiesenen Mandanten |
| **Abteilung** | Nur Mitarbeiter der festgelegten Abteilung(en) |
| **Mitarbeiter** | Nur die festgelegten einzelnen Mitarbeiter |

#### Datensichtbereich einstellen

1. 📍 Seitenleiste → Administration → **Benutzer** → Drei-Punkte-Menü (⋯) beim Benutzer → **Bearbeiten**
2. Im Formular den Abschnitt **„Datensichtbereich"** aufklappen (Pfeil-Button)
3. Typ wählen (Alle / Mandant / Abteilung / Mitarbeiter)
4. Bei „Abteilung" oder „Mitarbeiter": die gewünschten Einträge in der Checkbox-Liste auswählen
5. 📍 „Änderungen speichern"

✅ Der Benutzer sieht ab sofort nur noch die Daten im festgelegten Bereich.

> **Beispiel:** Eine Teamleiterin hat die Berechtigung „Alle Zeiten ansehen", aber der Datensichtbereich ist auf ihre Abteilung „Produktion" beschränkt. Sie sieht nur die Zeitdaten der Mitarbeiter in der Produktion.

### Benutzer verwalten

⚠️ Nur für Benutzer mit der Berechtigung „Benutzer verwalten"

📍 Seitenleiste → **Administration** → **Benutzer**

✅ Sie sehen eine Liste aller Benutzer. Jede Zeile zeigt: Name (mit 🔒 wenn gesperrt), E-Mail, Admin-Badge wenn zutreffend, und ein Dropdown zur Gruppenzuweisung.

#### Neuen Benutzer anlegen

1. 📍 Seitenleiste → Administration → Benutzer → **„Neuer Benutzer"** (oben rechts)
2. Ausfüllen:
   - **E-Mail** (Pflicht)
   - **Anzeigename** (Pflicht)
   - **Benutzername** (optional)
   - **Passwort** (Pflicht, mit Stärkebalken)
   - **Benutzergruppe** (Dropdown)
   - **Mitarbeiter verknüpfen** (optional — verbindet den Benutzer mit einem Mitarbeiterdatensatz)
3. 📍 „Benutzer erstellen"

#### Weitere Aktionen pro Benutzer

| Aktion | Wo | Beschreibung |
|--------|-----|-------------|
| Gruppe ändern | Direkt in der Liste: Dropdown neben dem Namen | Sofortige Änderung ohne extra Dialog |
| Bearbeiten | ⋯ → Bearbeiten | Formular mit allen Feldern öffnet sich |
| Passwort ändern | ⋯ → Passwort ändern | Dialog mit aktuellem Passwort (eigenes Konto) oder nur neuem Passwort |
| Löschen | ⋯ → Löschen | Bestätigungsdialog (eigenes Konto kann nicht gelöscht werden) |

---

## 4. Stammdaten — Was muss eingerichtet werden?

Bevor das System produktiv genutzt werden kann, müssen Grunddaten angelegt werden. Die folgende Reihenfolge ist empfohlen, da spätere Schritte auf früheren aufbauen.

### 4.1 Mandant einrichten

⚠️ Nur für Administratoren mit der Berechtigung „Mandanten verwalten"

📍 Seitenleiste → **Administration** → **Mandanten**

✅ Sie sehen eine Tabelle mit Spalten: Name, Slug, Stadt, Land, Urlaubsbasis, Status.

#### Neuen Mandanten anlegen

1. 📍 Seitenleiste → Administration → Mandanten → **„Neuer Mandant"** (oben rechts)
2. Im Formular ausfüllen:
   - Abschnitt **Identität**: Name (Pflicht, generiert automatisch den Slug), Slug (Pflicht, Kleinbuchstaben)
   - Abschnitt **Adresse**: Straße, PLZ, Ort, Land (alle Pflicht)
   - Abschnitt **Kontakt**: Telefon, E-Mail (optional)
   - Abschnitt **Einstellungen**: Lohnexport-Basispfad, Notizen, Urlaubsbasis (Kalenderjahr oder Eintrittsdatum)
3. 📍 „Erstellen"

✅ Der neue Mandant erscheint in der Tabelle. Der aktuelle Benutzer wird automatisch als Inhaber zugeordnet.

#### Mandant anzeigen oder deaktivieren

- 📍 Tabelle → ⋯-Menü → **Details anzeigen** → Detailansicht öffnet sich rechts
- 📍 ⋯-Menü → **Deaktivieren** → Bestätigungsdialog → Mandant wird deaktiviert

### 4.2 Abteilungen

⚠️ Berechtigung: „Abteilungen verwalten"

📍 Seitenleiste → **Verwaltung** → **Abteilungen**

✅ Sie sehen zwei Ansichten, umschaltbar oben rechts: **Baumansicht** (🌲) und **Listenansicht** (≡).

- **Baumansicht**: Hierarchische Darstellung mit aufklappbaren Ebenen. Jede Zeile zeigt Name, Code, Status-Badge, Kinderanzahl. Aktionsmenü: Details, Bearbeiten, Unterabteilung anlegen, Löschen.
- **Listenansicht**: Tabelle mit Spalten: Code, Name, Übergeordnete Abteilung, Status. Aktionsmenü: Details, Bearbeiten, Löschen.

**Filter:** Suchfeld + Statusfilter (nur in Listenansicht)

#### Neue Abteilung anlegen

1. 📍 Seitenleiste → Verwaltung → Abteilungen → **„Neue Abteilung"** (oben rechts)
2. Ausfüllen:
   - **Name** (Pflicht)
   - **Code** (Pflicht, Großbuchstaben, max. 20 Zeichen)
   - **Beschreibung** (optional)
   - **Übergeordnete Abteilung** (optional — ermöglicht hierarchische Struktur)
3. 📍 „Abteilung erstellen"

✅ Die Abteilung erscheint in der Baum- und Listenansicht.

> **Hinweis:** Abteilungen mit Unterabteilungen oder zugewiesenen Mitarbeitern können nicht gelöscht werden.

### 4.3 Standorte

⚠️ Berechtigung: „Standorte verwalten"

📍 Seitenleiste → **Verwaltung** → **Standorte**

✅ Tabelle mit Spalten: Code, Name, Stadt, Land, Zeitzone, Status.

#### Neuen Standort anlegen

1. 📍 Seitenleiste → Verwaltung → Standorte → **„Neuer Standort"** (oben rechts)
2. Ausfüllen:
   - **Code** (Pflicht, Großbuchstaben, bei Bearbeitung gesperrt)
   - **Name** (Pflicht)
   - **Beschreibung** (optional)
   - **Adresse, Stadt, Land** (optional)
   - **Zeitzone** (durchsuchbares Dropdown mit gängigen IANA-Zeitzonen, z. B. „Europe/Berlin")
3. 📍 „Erstellen"

> 💡 **Hinweis:** Mitarbeiter können einem Standort zugewiesen werden. Die Zuweisung erfolgt beim Anlegen oder Bearbeiten des Mitarbeiters (Verwaltung → Mitarbeiter → Bearbeiten → Standort). In der Mitarbeiterliste und in Berichten kann nach Standort gefiltert werden.

### 4.4 Kostenstellen

⚠️ Berechtigung: „Abteilungen verwalten"

📍 Seitenleiste → **Verwaltung** → **Kostenstellen**

✅ Tabelle mit Spalten: Code, Name, Beschreibung, Status.

#### Neue Kostenstelle anlegen

1. 📍 Seitenleiste → Verwaltung → Kostenstellen → **„Neue Kostenstelle"** (oben rechts)
2. **Code** (Pflicht, Großbuchstaben) und **Name** (Pflicht) eingeben
3. 📍 „Erstellen"

### 4.5 Teams

⚠️ Berechtigung: „Teams verwalten"

📍 Seitenleiste → **Verwaltung** → **Teams**

✅ Tabelle mit Spalten: Name, Abteilung, Teamleiter, Mitglieder (Anzahl), Status.

**Filter:** Suchfeld, Abteilung (Dropdown), Status (Dropdown)

#### Neues Team anlegen

1. 📍 Seitenleiste → Verwaltung → Teams → **„Neues Team"** (oben rechts)
2. Ausfüllen: **Name** (Pflicht), Beschreibung, Abteilung (Dropdown), Teamleiter (Dropdown aus aktiven Mitarbeitern)
3. 📍 „Team erstellen"

#### Teammitglieder verwalten

1. 📍 Tabelle → ⋯-Menü beim Team → **„Mitglieder verwalten"**
2. Im Dialog sehen Sie:
   - **Aktuelle Mitglieder** — Liste mit Rolle (Mitglied / Leiter / Stellvertreter) und Entfernen-Button
   - **Mitglieder hinzufügen** — Suchfeld + Liste verfügbarer Mitarbeiter mit „Hinzufügen"-Button
3. Änderungen werden sofort gespeichert

### 4.6 Arbeitszeitmodelle einrichten

Die Arbeitszeitmodelle bilden eine dreistufige Hierarchie:

```
Tagesplan  →  Wochenplan  →  Tarif
(ein Tag)     (eine Woche)    (das Gesamtmodell)
```

#### 4.6.1 Tagespläne

⚠️ Berechtigung: „Tagespläne verwalten"

📍 Seitenleiste → **Verwaltung** → **Tagespläne**

✅ Tabelle mit Spalten: Code, Name, Typ (Badge: Fest/Gleitzeit), Zeitfenster, Sollzeit, Pausen (Anzahl), Status.

**Filter:** Suchfeld, Status (Alle/Aktiv/Inaktiv), Plantyp (Alle/Fest/Gleitzeit)

##### Neuen Tagesplan anlegen

1. 📍 Seitenleiste → Verwaltung → Tagespläne → **„Neuer Tagesplan"** (oben rechts)
2. Das Formular hat **5 Tabs**:

**Tab „Basis":**
- Code (Pflicht, bei Bearbeitung gesperrt)
- Plantyp: Fest oder Gleitzeit
- Name (Pflicht)
- Sollarbeitszeit (Pflicht, z. B. 08:00 für 8 Stunden)
- Alternative Sollzeit für Abwesenheitstage (optional)
- „Aus Mitarbeiterstamm übernehmen" (Checkbox)

**Tab „Zeitfenster":**
- Fester Plan: Kommen ab, Gehen ab
- Gleitzeitplan: Kommen ab/bis, Gehen ab/bis, Kernzeit Anfang/Ende
- Maximale Arbeitszeit, Mindestarbeitszeit

**Tab „Toleranz":**
- Fester Plan: Zu früh kommen, Zu spät kommen, Zu früh gehen, Zu spät gehen (jeweils in Minuten)
- Gleitzeitplan: Nur „Zu früh kommen" und „Zu spät gehen"
- Variable Arbeitszeit (Checkbox, nur bei festem Plan)

**Tab „Rundung":**
- Rundung Kommen: Typ (Keine/Aufrunden/Abrunden/Nächster Wert/Aufschlag/Abschlag), Intervall oder Wert
- Rundung Gehen: Gleiche Optionen
- „Alle Buchungen runden" (Checkbox)

**Tab „Spezial":**
- Feiertagsgutschriften: Voller Feiertag, Halber Feiertag, Kategorie 3 (jeweils in Stunden:Minuten)
- Urlaubsabzug (Zahl, z. B. 1,0)
- Verhalten ohne Buchung (Dropdown: Fehler/Soll abziehen/Soll gutschreiben/Berufsschule/Soll mit Auftrag)
- Tageswechselverhalten (Dropdown: Kein/Bei Ankunft/Bei Abgang/Automatisch)

3. 📍 „Tagesplan erstellen"

✅ Der Plan erscheint in der Tabelle. Klick auf eine Zeile öffnet die Detailansicht.

##### Tagesplan kopieren

1. 📍 Tabelle → ⋯-Menü → **Kopieren**
2. Neuen Code und Namen eingeben (vorausgefüllt mit Suffix „-COPY")
3. 📍 „Kopieren"

> **Was ein Tagesplan festlegt — Zusammenfassung:**
>
> | Einstellung | Bedeutung | Beispiel |
> |------------|-----------|---------|
> | Kommen-Fenster (von/bis) | Wann frühestens/spätestens anfangen | 6:00 – 9:00 |
> | Gehen-Fenster (von/bis) | Wann frühestens/spätestens gehen | 15:00 – 20:00 |
> | Kernzeit (von/bis) | Anwesenheitspflicht | 9:00 – 15:00 |
> | Sollarbeitszeit | Geplante Stunden | 8 Stunden |
> | Toleranzen | Erlaubte Abweichung in Minuten | ±5 Minuten |
> | Rundung | Wie Stempelzeiten gerundet werden | Auf 5 Min. runden |
> | Pausen | Pausenregeln | 30 Min. nach 6 Std. |
> | Maximale Arbeitszeit | Obergrenze Nettozeit | 10 Stunden |

#### 4.6.2 Wochenpläne

⚠️ Berechtigung: „Wochenpläne verwalten"

📍 Seitenleiste → **Verwaltung** → **Wochenpläne**

✅ Tabelle mit Spalten: Code, Name, Mo, Di, Mi, Do, Fr, Sa, So (jeweils Tagesplan-Code oder „–"), Tage (x/7), Status.

**Filter:** Suchfeld, Status

##### Neuen Wochenplan anlegen

1. 📍 Seitenleiste → Verwaltung → Wochenpläne → **„Neuer Wochenplan"** (oben rechts)
2. Ausfüllen:
   - **Code** (Pflicht), **Name** (Pflicht), Beschreibung
   - **7 Tageszuweisungen**: Für jeden Wochentag (Montag bis Sonntag) einen Tagesplan aus dem Dropdown wählen. Jedes Dropdown zeigt Code, Name, Typ und Dauer. Alle 7 Tage müssen zugewiesen werden.
3. ✅ Unten erscheint automatisch eine Zusammenfassung: Anzahl Arbeitstage und Gesamtstunden
4. 📍 „Wochenplan erstellen"

> **Beispiel — Wochenplan „Normalwoche":**
>
> | Tag | Tagesplan |
> |-----|-----------|
> | Mo–Do | Normalschicht (8 Std.) |
> | Fr | Freitagsplan (6 Std.) |
> | Sa–So | *(kein Plan — frei)* |

#### 4.6.3 Tarife

⚠️ Berechtigung: „Tarife verwalten"

📍 Seitenleiste → **Verwaltung** → **Tarife**

✅ Tabelle mit Spalten: Code, Name, Wochenplan, Gültig ab, Gültig bis, Pausen (Anzahl), Status.

**Filter:** Suchfeld, Status

##### Neuen Tarif anlegen

1. 📍 Seitenleiste → Verwaltung → Tarife → **„Neuer Tarif"** (oben rechts)
2. Das Formular hat **5 Tabs**:

**Tab „Basis":** Code (Pflicht), Name (Pflicht), Beschreibung, Aktiv-Schalter

**Tab „Zeitplan":**
- **Rhythmustyp** (Dropdown):
  - *Wöchentlich*: Ein Wochenplan-Dropdown erscheint
  - *Rollierend wöchentlich*: Mehrere Wochenpläne in einer Reihenfolge konfigurieren
  - *X-Tage-Rhythmus*: Zykluslänge festlegen + jedem Tag einen Tagesplan zuweisen
- Bei rollierend und X-Tage: **Rhythmus-Startdatum** (Kalender)
- **Gültigkeitszeitraum**: Gültig ab / Gültig bis (Kalender)

**Tab „Urlaub":**
- Jahresurlaubstage (Zahl)
- Arbeitstage pro Woche (1–7)
- Urlaubsberechnungsbasis (Kalenderjahr / Eintrittsdatum)
- Urlaubskappungsregelgruppe (Dropdown)

**Tab „Sollstunden":**
- Tägliche, wöchentliche, monatliche und jährliche Sollstunden (jeweils in Stunden)

**Tab „Flexzeit":**
- Übertragungsart (Dropdown: Keine Bewertung / Vollständig / Nach Schwellenwert / Keine Übertragung)
- Kontolimits: Max. Flexzeit/Monat, Schwellenwert, Obere Jahresgrenze, Untere Jahresgrenze

3. 📍 „Tarif erstellen"

> **Beispiel — Tarif „Verwaltung Vollzeit":**
> - Rhythmus: Wöchentlich, Wochenplan „Normalwoche"
> - 30 Urlaubstage/Jahr, 5-Tage-Woche
> - Flexzeit: Vollständige Übertragung, max. ±40 Stunden/Jahr

#### 4.6.4 Praxisbeispiel: Arbeitszeitmodell für Büro-Mitarbeiter einrichten

Szenario: Ein Standard-Büromitarbeiter soll Montag bis Freitag, 08:00–16:30 Uhr arbeiten, mit 30 Minuten Mittagspause, 30 Urlaubstagen und vollständiger Flexzeit-Übertragung.

##### Schritt 1 — Tagesplan „Büro" anlegen

📍 Seitenleiste → Verwaltung → **Tagespläne** → **„Neuer Tagesplan"**

**Tab „Basis":**
- Code: `BUERO`
- Plantyp: **Fest**
- Name: `Büro`
- Sollarbeitszeit: `08:00` (= 8 Stunden)

**Tab „Zeitfenster":**
- Kommen ab: `08:00`
- Gehen ab: `16:30`

**Tab „Toleranz":**
- Zu früh kommen: `5` Minuten
- Zu spät kommen: `5` Minuten
- Zu früh gehen: `5` Minuten
- Zu spät gehen: `5` Minuten

**Tab „Rundung":**
- Rundung Kommen: **Keine**
- Rundung Gehen: **Keine**

**Tab „Spezial":**
- Feiertagsgutschrift (Voller Feiertag): `08:00`
- Urlaubsabzug: `1,0`
- Verhalten ohne Buchung: **Fehler**
- Tageswechselverhalten: **Kein**

📍 „Tagesplan erstellen"

✅ Der Tagesplan „Büro" (BUERO) erscheint in der Tabelle mit Typ „Fest", Zeitfenster 08:00–16:30, Sollzeit 8 Std.

⚠️ Vergessen Sie nicht, eine **Pause** hinzuzufügen: 📍 Tagesplan anklicken → Detailansicht → Abschnitt „Pausen" → **„Pause hinzufügen"** → Pausendauer: `30` Minuten, Mindestarbeitszeit: `06:00` (nach 6 Stunden wird die Pause automatisch abgezogen).

##### Schritt 2 — Wochenplan „Bürowoche" anlegen

📍 Seitenleiste → Verwaltung → **Wochenpläne** → **„Neuer Wochenplan"**

- Code: `WP-BUERO`
- Name: `Bürowoche`
- Tageszuweisungen:

| Tag | Tagesplan |
|-----|-----------|
| Montag | BUERO |
| Dienstag | BUERO |
| Mittwoch | BUERO |
| Donnerstag | BUERO |
| Freitag | BUERO |
| Samstag | *(kein Plan — frei)* |
| Sonntag | *(kein Plan — frei)* |

✅ Unten erscheint die Zusammenfassung: **5 Arbeitstage, 40:00 Stunden**

📍 „Wochenplan erstellen"

##### Schritt 3 — Tarif „Büro Vollzeit" anlegen

📍 Seitenleiste → Verwaltung → **Tarife** → **„Neuer Tarif"**

**Tab „Basis":**
- Code: `BUERO-VZ`
- Name: `Büro Vollzeit`
- Aktiv: ✓

**Tab „Zeitplan":**
- Rhythmustyp: **Wöchentlich**
- Wochenplan: `WP-BUERO` (Bürowoche)

**Tab „Urlaub":**
- Jahresurlaubstage: `30`
- Arbeitstage pro Woche: `5`
- Urlaubsberechnungsbasis: **Kalenderjahr**

**Tab „Flexzeit":**
- Übertragungsart: **Vollständige Übertragung**
- Obere Jahresgrenze: `40:00`
- Untere Jahresgrenze: `-40:00`

📍 „Tarif erstellen"

##### Schritt 4 — Mitarbeiter anlegen und Tarif zuweisen

📍 Seitenleiste → Verwaltung → **Mitarbeiter** → **„Neuer Mitarbeiter"**

- Vorname: `Max`
- Nachname: `Mustermann`
- Personalnummer: `1001`
- Eintrittsdatum: `01.01.2026`
- Abteilung: die gewünschte Abteilung wählen
- Tarif: `BUERO-VZ` (Büro Vollzeit)

📍 „Mitarbeiter erstellen"

✅ Der Mitarbeiter erscheint in der Tabelle mit Tarif „Büro Vollzeit".

##### Schritt 5 — Prüfung

📍 Seitenleiste → **Zeitnachweis** → Mitarbeiter „Max Mustermann" im Dropdown oben auswählen → Tab **„Woche"**

✅ Für die nächsten Tage sollten die Tagespläne bereits generiert sein. Sie sehen Montag bis Freitag mit Sollzeit 08:00 und Samstag/Sonntag als freie Tage.

💡 **Hinweis:** Falls die Tagespläne noch nicht sichtbar sind, warten Sie bis Sonntag Nacht — die automatische Schichtplan-Generierung läuft jeden Sonntag um 1:00 Uhr (siehe Abschnitt 9.3). Alternativ kann ein Administrator die Generierung unter 📍 Administration → Zeitpläne manuell auslösen.

### 4.7 Mitarbeiter anlegen

⚠️ Berechtigung: „Mitarbeiter ansehen" (für die Liste) bzw. „Mitarbeiter anlegen" (für neue Einträge)

📍 Seitenleiste → **Verwaltung** → **Mitarbeiter**

✅ Tabelle mit Spalten: Checkbox, Personalnummer, Name (mit Avatar), E-Mail, Abteilung, Tarif, Status, Eintrittsdatum. Darunter Seitennavigation.

**Filter:** Suchfeld, Status (Alle/Aktiv/Inaktiv), „Filter zurücksetzen"

**Massenaktionen** (erscheinen bei Auswahl von Checkboxen): Tarif zuweisen, Aktivieren, Deaktivieren, Exportieren

#### Neuen Mitarbeiter anlegen

1. 📍 Seitenleiste → Verwaltung → Mitarbeiter → **„Neuer Mitarbeiter"** (oben rechts)
2. Formular mit drei Abschnitten:

   **Persönliche Daten:** Vorname (Pflicht), Nachname (Pflicht), E-Mail, Telefon

   **Beschäftigung:** Personalnummer (Pflicht), PIN (optional, wird automatisch vergeben), Eintrittsdatum (Pflicht, Kalender), Abteilung (Dropdown), Standort (Dropdown, optional), Kostenstelle (Dropdown), Beschäftigungsart (Dropdown), Tarif (Dropdown)

   **Vertrag:** Wochenstunden (Zahl, Standard: 40), Urlaubstage/Jahr (Zahl, Standard: 30)

3. 📍 „Mitarbeiter erstellen"

✅ Der Mitarbeiter erscheint in der Tabelle. Wird ein Tarif zugewiesen, generiert das System automatisch Tagespläne für die kommenden Wochen.

#### Mitarbeiterdetails ansehen

1. 📍 Tabelle → ⋯-Menü → **Details anzeigen** (oder Zeile anklicken)
2. ✅ Detailseite mit Kopfbereich (Name, Status-Badge, Personalnummer) und zwei Tabs:
   - **Übersicht**: Kontaktdaten, Beschäftigungsdetails, Vertragsdaten, Zutrittskarten
   - **Tarifzuweisungen**: Liste der zeitgebundenen Tarifzuweisungen mit Vorschau des aktuell geltenden Tarifs
3. Kopfbereich-Buttons: ← Zurück, Zeitnachweis anzeigen, Bearbeiten, Deaktivieren

#### Tarife mehreren Mitarbeitern zuweisen

1. 📍 Seitenleiste → Verwaltung → Mitarbeiter
2. Checkboxen bei den gewünschten Mitarbeitern setzen
3. 📍 In der erscheinenden Massenaktionsleiste → **„Tarif zuweisen"**
4. Tarif aus dem Dropdown wählen → „Anwenden"

### 4.8 Beschäftigungsarten

⚠️ Berechtigung: „Mitarbeiter ansehen"

📍 Seitenleiste → **Verwaltung** → **Beschäftigungsarten**

✅ Tabelle mit Spalten: Code, Name, Wochenstunden, Status.

#### Neue Beschäftigungsart anlegen

1. 📍 Seitenleiste → Verwaltung → Beschäftigungsarten → **„Neue Beschäftigungsart"** (oben rechts)
2. Ausfüllen: Code (Pflicht, z. B. `VZ`), Name (Pflicht, z. B. „Vollzeit"), Beschreibung, Standard-Wochenstunden (Zahl), Urlaubsberechnungsgruppe (Dropdown)
3. 📍 „Erstellen"

### 4.9 Buchungstypen

⚠️ Berechtigung: „Buchungstypen verwalten"

📍 Seitenleiste → **Verwaltung** → **Buchungstypen**

✅ Seite mit zwei Tabs: **Buchungstypen** und **Gruppen**

Im Tab „Buchungstypen" sehen Sie eine Tabelle mit Spalten: Richtung (farbiges Symbol: Eingang = grün, Ausgang = rot), Code, Name + Beschreibung, Nutzungsanzahl, Status (mit Aktiv/Inaktiv-Schalter).

**Filter:** Suchfeld, Richtung (Alle/Eingang/Ausgang)

##### Neuen Buchungstyp anlegen

1. 📍 Tab „Buchungstypen" → **„Neuer Buchungstyp"** (oben rechts)
2. Ausfüllen: Code (Pflicht, Großbuchstaben), Richtung (Pflicht: Ein/Aus — bei Bearbeitung gesperrt), Name (Pflicht), Beschreibung
3. 📍 „Speichern"

> **Systemtypen** (COME, GO, BREAK_START, BREAK_END) können nicht bearbeitet oder gelöscht werden. Typen mit aktiver Nutzung können ebenfalls nicht gelöscht werden.

### 4.10 Abwesenheitstypen

⚠️ Berechtigung: „Abwesenheitsarten verwalten"

📍 Seitenleiste → **Verwaltung** → **Abwesenheitsarten**

✅ Seite mit zwei Tabs: **Abwesenheitsarten** und **Gruppen**

Im Tab „Abwesenheitsarten" sehen Sie eine Tabelle mit Spalten: Farbe (farbiger Punkt), Code, Name, Kategorie (Badge), Urlaub (✓/✗), Genehmigung (✓/✗), Status.

**Filter:** Suchfeld, Kategorie (Alle/Urlaub/Krankheit/Sonderfall/Unbezahlt), Status, „Systemtypen anzeigen" (Schalter, standardmäßig aus)

##### Neuen Abwesenheitstyp anlegen

1. 📍 Tab „Abwesenheitsarten" → **„Neuer Abwesenheitstyp"** (oben rechts)
2. Ausfüllen:
   - **Code** (Pflicht, Großbuchstaben, muss mit U, K oder S beginnen)
   - **Farbe** (Hex-Farbcode mit Vorschau)
   - **Name** (Pflicht)
   - **Kategorie** (Dropdown: Urlaub/Krankheit/Sonderfall/Unbezahlt)
   - **Urlaub betroffen** (Schalter — ob vom Urlaubskonto abgezogen wird)
   - **Genehmigung erforderlich** (Schalter)
3. 📍 „Abwesenheitstyp erstellen"

| Kategorie | Code-Präfix | Beispiele |
|-----------|-------------|-----------|
| Urlaub | U | U01 (Jahresurlaub), U02 (Sonderurlaub) |
| Unbezahlt | U | UO (Unbezahlter Urlaub) |
| Krankheit | K | K01 (Krankheit), K02 (Kind krank) |
| Sonderfall | S | SB (Berufsschule), S01 (Fortbildung) |

### 4.11 Feiertage

⚠️ Berechtigung: „Feiertage verwalten"

📍 Seitenleiste → **Verwaltung** → **Feiertage**

✅ Seite mit Jahresauswahl oben und zwei Ansichten: **Kalender** (📅) und **Liste** (≡), umschaltbar oben rechts.

- **Kalenderansicht**: Volljahreskalender mit markierten Feiertagen. Klick auf einen Feiertag öffnet die Detailansicht. Klick auf ein freies Datum öffnet das Formular mit vorausgefülltem Datum.
- **Listenansicht**: Tabelle mit Spalten: Datum (mit Wochentag), Name, Typ (Badge: Ganzer Tag/Halber Tag/Sonderfall), Geltungsbereich (Alle oder Abteilung).

**Filter:** Jahresauswahl, Suchfeld

**Drei Buttons oben:** „Generieren" (🪄), „Kopieren" (📋), „Neuer Feiertag" (+)

##### Feiertage automatisch generieren

1. 📍 Seitenleiste → Verwaltung → Feiertage → **„Generieren"** (🪄-Button)
2. **Jahr** eingeben (vorausgefüllt mit aktuellem Jahr)
3. **Bundesland** wählen (Dropdown mit allen 16 Bundesländern, Standard: Bayern)
4. 📍 „Generieren"

✅ Alle gesetzlichen Feiertage des Bundeslandes werden für das gewählte Jahr angelegt.

**Unterstützte Bundesländer und besondere Feiertage:**
- Bundesweite Feiertage (9 Tage): Neujahr, Karfreitag, Ostermontag, Tag der Arbeit, Christi Himmelfahrt, Pfingstmontag, Tag der Deutschen Einheit, 1. + 2. Weihnachtstag
- Heilige Drei Könige: BW, BY, ST
- Fronleichnam: BW, BY, HE, NW, RP, SL
- Allerheiligen: BW, BY, NW, RP, SL
- Reformationstag: BB, MV, SN, ST, TH, HB, HH, NI, SH
- Mariä Himmelfahrt: BY, SL
- Internationaler Frauentag: BE, MV
- Buß- und Bettag: nur SN
- Weltkindertag: nur TH

##### Feiertage aus einem anderen Jahr kopieren

1. 📍 **„Kopieren"**-Button (📋)
2. **Quelljahr** und **Zieljahr** eingeben
3. Optional: „Heiligabend als halber Tag" und „Silvester als halber Tag" (Schalter)
4. 📍 „Kopieren"

##### Einzelnen Feiertag anlegen

1. 📍 **„Neuer Feiertag"** (+)
2. Ausfüllen: Datum (Kalender), Name (Pflicht), Kategorie (Ganzer Tag / Halber Tag / Sonderfall), „Gilt für alle" (Schalter — wenn aus: Abteilung wählen)
3. 📍 „Feiertag erstellen"

### 4.12 Konten

⚠️ Berechtigung: „Konten verwalten"

📍 Seitenleiste → **Verwaltung** → **Konten**

✅ Seite mit zwei Tabs: **Konten** und **Gruppen**. Die Kontentabelle ist nach Typ gruppiert (Bonus-Konten, Erfassungskonten, Saldenkonten).

Tabellenspalten: Typ-Symbol, Code, Name, Typ (Badge), Einheit (Minuten/Stunden/Tage), Nutzung, Status (mit Aktiv/Inaktiv-Schalter).

**Filter:** Suchfeld, Typ (Alle/Bonus/Erfassung/Saldo), Status, „Systemkonten anzeigen" (Schalter)

##### Neues Konto anlegen

1. 📍 Tab „Konten" → **„Neues Konto"** (oben rechts)
2. Ausfüllen: Code (Pflicht, Großbuchstaben), Name (Pflicht), Beschreibung, Kontotyp (Bonus/Erfassung/Saldo — bei Bearbeitung gesperrt), Lohnrelevant (Schalter), Lohncode, Einheit (Minuten/Stunden/Tage), Jahresübertrag (Schalter), Sortierung
3. 📍 „Speichern"

**Wichtige Systemkonten:** FLEX (Gleitzeitkonto), OT (Überstundenkonto), VAC (Urlaubskonto) — diese können nicht gelöscht werden.

### 4.13 Berechnungsregeln

⚠️ Berechtigung: „Abwesenheitsarten verwalten"

📍 Seitenleiste → **Verwaltung** → **Berechnungsregeln**

✅ Tabelle mit Spalten: Code, Name, Wert, Faktor, Konto, Status.

Berechnungsregeln bestimmen, wie bei einer Abwesenheit Stunden auf ein Konto gutgeschrieben werden (Formel: Kontowert = Wert × Faktor).

1. 📍 **„Neue Regel"** (oben rechts)
2. Ausfüllen: Code (Pflicht), Name (Pflicht), Wert (0 = Tagessollzeit verwenden), Faktor, Konto (Dropdown)
3. 📍 „Speichern"

### 4.14 Kontaktarten

⚠️ Berechtigung: „Kontaktverwaltung"

📍 Seitenleiste → **Verwaltung** → **Kontaktarten**

✅ Zweigeteilte Ansicht: Links **Kontaktarten**, rechts **Kontaktunterarten** (erscheinen nach Auswahl einer Art).

1. 📍 Linke Spalte → **„Neuer Typ"** → Code, Name, Datentyp (Text/E-Mail/Telefon/URL), Beschreibung, Sortierung eingeben
2. 📍 Art anklicken → rechte Spalte zeigt deren Unterarten
3. 📍 Rechte Spalte → **„Neue Unterart"** → Code, Bezeichnung, Sortierung eingeben

---

## 5. Zeiterfassung — Täglicher Betrieb

### 5.1 Dashboard — Die Startseite

📍 Seitenleiste → **Dashboard** (oder Logo „T" anklicken)

✅ Sie sehen:
- **Begrüßung** mit Tageszeit und Ihrem Namen, darunter das aktuelle Datum
- **Schnellaktionen**: Buttons „Einstempeln" / „Ausstempeln" (je nach Status), „Abwesenheit beantragen", „Zeitnachweis anzeigen"
- **Vier Karten**: Heutiger Zeitplan, Wochenstunden, Urlaubsrest, Flexzeitsaldo
- **Offene Aktionen**: Tage der letzten 14 Tage mit Fehlern oder offenem Status (klickbar → öffnet Zeitnachweis)
- **Letzte Aktivitäten**: Die letzten 5 Buchungen mit Symbol, Uhrzeit und relativem Datum

### 5.2 Stempeluhr — Ein- und Ausstempeln

📍 Seitenleiste → **Stempeluhr**

✅ Sie sehen eine große Digitaluhr mit der aktuellen Uhrzeit, einen farbigen Status-Badge (z. B. „Eingestempelt"), einen laufenden Timer seit dem letzten Einstempeln, und einen großen Stempel-Button.

#### Einen Arbeitstag stempeln

1. 📍 Seitenleiste → **Stempeluhr**
2. 📍 Großen Button **„Einstempeln"** klicken → Status wechselt zu „Eingestempelt", Timer beginnt
3. Für eine Pause: 📍 **„Pause"**-Button klicken → Status wechselt zu „In Pause"
4. Pause beenden: 📍 **„Pause Ende"**-Button klicken → Timer läuft weiter
5. Arbeitsende: 📍 **„Ausstempeln"**-Button klicken → Status wechselt zu „Ausgestempelt"

✅ Nach jeder Aktion erscheint kurz eine Bestätigungsmeldung. Unter dem Button sehen Sie **Tagesstatistiken** (Brutto, Pause, Netto, Soll, Über-/Fehlzeit) und die **Buchungshistorie** des Tages.

⚠️ Administratoren sehen oben ein Dropdown zur Mitarbeiterauswahl, um für andere Mitarbeiter zu stempeln.

### 5.3 Zeitnachweis — Buchungen und Tageswerte

📍 Seitenleiste → **Zeitnachweis**

✅ Seite mit drei Ansichtsmodi (umschaltbar): **Tag**, **Woche**, **Monat**. Navigationsbuttons (← → und „Heute") zum Datumwechsel.

⚠️ Administratoren sehen oben ein Mitarbeiter-Dropdown (bis 250 Mitarbeiter).

#### Tagesansicht

📍 Zeitnachweis → Tab **„Tag"**

✅ Sie sehen:
- Datumszeile mit Badges (Heute / Wochenende / Feiertag / Fehler) und Tagesplanname + Sollzeit rechts
- **Buchungsliste**: Jede Buchung zeigt Uhrzeit, Typ, Richtung, Notizen, und Bearbeit-/Lösch-Symbole
- **„Buchung hinzufügen"**-Button am Ende der Liste
- **Tageszusammenfassung**: Soll, Brutto, Pause, Netto, Saldo
- Berechnungsstatus und Zeitstempel

##### Neue Buchung manuell anlegen

1. 📍 Zeitnachweis → Tagesansicht → **„Buchung hinzufügen"**
2. Im Formular (Einblendung von rechts):
   - **Buchungstyp** wählen (Dropdown)
   - **Uhrzeit** eingeben (HH:MM)
   - **Notizen** (optional)
3. 📍 „Erstellen"

✅ Die Buchung erscheint in der Liste. Der Tag wird automatisch neu berechnet.

##### Buchung bearbeiten

1. 📍 Stift-Symbol (✏️) neben der Buchung klicken
2. Im Formular: **Bearbeitete Uhrzeit** ändern (Originalzeit bleibt sichtbar)
3. 📍 „Änderungen speichern"

✅ Die Originalzeit bleibt als Referenz erhalten. Die berechnete Zeit wird zurückgesetzt und bei der nächsten Berechnung neu ermittelt.

##### Buchung löschen

1. 📍 Mülleimer-Symbol (🗑) neben der Buchung klicken
2. 📍 Bestätigungsdialog → „Löschen"

#### Wochen- und Monatsansicht

📍 Zeitnachweis → Tab **„Woche"** oder **„Monat"**

✅ Tabelle mit Spalten: Tag, Soll, Brutto, Pausen, Netto, Saldo, Status. Am Ende eine Summenzeile. Klick auf eine Zeile springt zur Tagesansicht dieses Datums.

### 5.4 Wie ein Arbeitstag berechnet wird

Jede Nacht (um 2:00 Uhr) berechnet das System automatisch den vergangenen Arbeitstag. Die Berechnung wird auch sofort ausgelöst, wenn eine Buchung erstellt, geändert oder gelöscht wird.

#### Berechnungsschritte

**Schritt 1 — Tagesplan laden**: Das System prüft, welcher Tagesplan für den Mitarbeiter an diesem Datum gilt.

**Schritt 2 — Sonderfälle prüfen**:

| Situation | Was passiert |
|-----------|-------------|
| Kein Tagesplan | Tag = frei, 0 Stunden |
| Feiertag, keine Buchungen, keine Abwesenheit | Feiertagsgutschrift laut Tagesplan |
| Feiertag, keine Buchungen, genehmigte Abwesenheit | Abwesenheitsgutschrift (wenn Priorität > 0) |
| Keine Buchungen | Je nach Einstellung im Tagesplan: Fehler ODER Sollzeit gutschreiben |

**Schritt 3 — Toleranzen anwenden**: Kleine Abweichungen beim Stempeln werden ausgeglichen.

> **Beispiel:** Sollbeginn 8:00, Toleranz ±5 Minuten.
> - Stempelzeit 8:03 → System rechnet mit 8:00 (innerhalb der Toleranz)
> - Stempelzeit 8:07 → System rechnet mit 8:07 (außerhalb der Toleranz)

| Toleranz | Bedeutung |
|----------|-----------|
| Kommen Plus | Minuten zu spät kommen, die toleriert werden |
| Kommen Minus | Minuten zu früh kommen, die nicht als Mehrarbeit zählen |
| Gehen Plus | Minuten länger bleiben, die nicht als Überstunde zählen |
| Gehen Minus | Minuten früher gehen, die nicht als Fehlzeit zählen |

**Schritt 4 — Rundung anwenden**:

| Rundungsart | Wirkung | Beispiel (15-Min.-Intervall) |
|------------|---------|------------------------------|
| Aufrunden | Kommen wird aufgerundet | 8:07 → 8:15 |
| Abrunden | Gehen wird abgerundet | 16:52 → 16:45 |
| Nächster Wert | Zum nächsten Intervall | 8:07 → 8:00, 8:08 → 8:15 |
| Aufschlag / Abschlag | Fester Minutenbetrag ±  | 8:00 + 5 = 8:05 |

**Schritt 5 — Zeitfenster-Kappung**: Stempelzeiten außerhalb des erlaubten Fensters werden gekappt.

**Schritt 6 — Buchungen paaren**: Kommen → Gehen = Arbeitspaar, Pause Anfang → Pause Ende = Pausenpaar.

**Schritt 7 — Bruttoarbeitszeit**: Summe aller Arbeitspaare.

**Schritt 8 — Pausen abziehen**:

| Pausenart | Beschreibung |
|-----------|-------------|
| **Feste Pause** | Immer innerhalb eines Zeitfensters abgezogen |
| **Automatische Pause** | Nur wenn keine manuelle Pause UND Mindestarbeitszeit erreicht |
| **Mindestpause** | Differenz zwischen gestempelter und Mindestpause wird nachgebucht |

**Schritt 9 — Nettoarbeitszeit**: Brutto − Pausen, gekappt auf maximale Nettoarbeitszeit.

**Schritt 10 — Überstunden/Fehlzeit**: Netto − Soll = positiv → Überstunden, negativ → Fehlzeit.

### 5.5 Flexzeit (Gleitzeitkonto)

Das Gleitzeitkonto sammelt die täglichen Plus- und Minusstunden über den Monat. Am Monatsende wird das Saldo nach den Regeln des Tarifs verarbeitet:

| Übertragungsart | Beschreibung |
|----------------|-------------|
| **Keine Bewertung** | Saldo wird 1:1 übernommen, keine Kappung |
| **Vollständige Übertragung** | Übertragung mit monatlicher und jährlicher Obergrenze |
| **Nach Schwellenwert** | Nur Stunden oberhalb des Schwellenwerts werden gutgeschrieben |
| **Keine Übertragung** | Konto wird monatlich auf Null gesetzt |

> **Beispiel — Vollständige Übertragung:**
> - Vormonat: Flexzeitsaldo +12:00
> - Dieser Monat: +3:30 Überstunden, −1:00 Fehlzeit → Veränderung +2:30
> - Neues Saldo: +14:30
> - Jahresgrenze: ±40:00 → 14:30 bleibt (unter der Grenze)

---

## 6. Schichtplanung

⚠️ Berechtigung: „Schichtplanung verwalten"

📍 Seitenleiste → **Verwaltung** → **Schichtplanung**

✅ Seite mit zwei Tabs: **Schichten** und **Planungstafel**

### 6.1 Schichten definieren

📍 Tab **„Schichten"**

✅ Tabelle mit Spalten: Farbe (farbiges Quadrat), Code, Name, Tagesplan (Verknüpft / –), Qualifikation, Status.

**Filter:** Suchfeld, „Nur aktive anzeigen" (Schalter)

#### Neue Schicht anlegen

1. 📍 Tab „Schichten" → **„Neue Schicht"** (oben rechts)
2. Ausfüllen:
   - **Code** (Pflicht, Großbuchstaben), **Name** (Pflicht), Beschreibung
   - **Farbe** (Farbwähler mit Hex-Anzeige)
   - **Qualifikation** (optional)
   - **Sortierung** (Zahl)
   - **Tagesplan** (Dropdown — optional, verbindet die Schicht mit einem Arbeitszeitplan)
3. 📍 „Erstellen"

### 6.2 Planungstafel — Schichten zuweisen

📍 Tab **„Planungstafel"**

✅ Sie sehen links eine **Schicht-Palette** (farbige Chips mit Schicht-Codes) und rechts ein **Raster**: Zeilen = Mitarbeiter, Spalten = Tage. Heutiger Tag ist hervorgehoben, Wochenenden sind grau hinterlegt.

**Werkzeugleiste oben:**
- ← / → Navigation, Datumsbereiche-Anzeige, „Heute"-Button
- Ansichtsmodus: Woche / 2 Wochen / Monat
- „Massenweise zuweisen", „Bereich löschen"
- Suchfeld (Mitarbeiter), Abteilungsfilter

#### Schicht per Drag & Drop zuweisen

1. 📍 Schicht-Chip in der linken Palette greifen
2. 📍 Auf die gewünschte Zelle im Raster ziehen und loslassen

✅ Die Zelle zeigt den Schicht-Code mit der Schichtfarbe an.

#### Schicht per Klick zuweisen

1. 📍 Beliebige Zelle im Raster anklicken
2. Im Dialog: Schicht aus dem Dropdown wählen
3. 📍 „Speichern"

#### Massenweise zuweisen

1. 📍 **„Massenweise zuweisen"** in der Werkzeugleiste
2. Mitarbeiter, Schicht und Datumsbereich wählen
3. 📍 „Zuweisen"

### 6.3 Rollierende Schichtrhythmen

Rollierende Schichten werden über den **Tarif** konfiguriert (nicht über die Planungstafel):

📍 Seitenleiste → Verwaltung → **Tarife** → Tarif bearbeiten → Tab **„Zeitplan"**

**Rollierend wöchentlich** — Mehrere Wochenpläne wechseln sich ab:

> **Beispiel — 3-Schicht-Betrieb:**
> - Woche 1: Frühschicht (Mo–Fr 6:00–14:00)
> - Woche 2: Spätschicht (Mo–Fr 14:00–22:00)
> - Woche 3: Nachtschicht (Mo–Fr 22:00–6:00)
> - Startdatum: 06.01.2026 → Das System weiß ab diesem Datum, welche Woche welchem Plan entspricht

**X-Tage-Rhythmus** — Ein frei definierbarer Zyklus:

> **Beispiel — 4 Tage Arbeit, 2 Tage frei:**
> - Tag 1–2: Frühschicht
> - Tag 3–4: Spätschicht
> - Tag 5–6: Frei
> - Zykluslänge: 6 Tage

### 6.4 Automatische Schichterkennung

Manche Tagespläne erkennen automatisch die tatsächliche Schicht anhand der Stempelzeiten. Bis zu 6 alternative Tagespläne können hinterlegt werden (konfiguriert im Tagesplan, Tab „Spezial").

> **Beispiel:** Standardplan ist „Frühschicht" (6:00–14:00). Der Mitarbeiter stempelt um 14:00 ein und um 22:00 aus. Die Schichterkennung erkennt automatisch „Spätschicht" und berechnet mit deren Regeln.

### 6.5 Tageswechsel bei Nachtschichten

Bei Schichten über Mitternacht gibt es vier Einstellungen (konfiguriert im Tagesplan, Tab „Spezial", Feld „Tageswechselverhalten"):

| Einstellung | Bedeutung |
|------------|-----------|
| Keine | Keine besondere Behandlung |
| Bei Ankunft | Gesamte Arbeitszeit wird dem Ankunftstag zugerechnet |
| Bei Abgang | Gesamte Arbeitszeit wird dem Abgangstag zugerechnet |
| Automatisch | Automatische Buchungen an der Tagesgrenze (Mitternacht) |

### 6.6 Praxisbeispiel: 3-Schicht-Betrieb einrichten (Früh / Spät / Nacht)

Szenario: Ein Industriewartungsunternehmen mit Mitarbeitern an Produktionsstandorten benötigt einen rollierenden 3-Schicht-Betrieb:
- **Frühschicht (FS):** 06:00–14:00
- **Spätschicht (SS):** 14:00–22:00
- **Nachtschicht (NS):** 22:00–06:00 (über Mitternacht)

Rotation: Woche 1 = Früh, Woche 2 = Spät, Woche 3 = Nacht, dann Wiederholung.
Zyklusstart: **06.01.2026** (Montag).

#### Schritt 1 — Tagesplan „Frühschicht" anlegen

📍 Seitenleiste → Verwaltung → **Tagespläne** → **„Neuer Tagesplan"**

**Tab „Basis":**
- Code: `FS`
- Plantyp: **Fest**
- Name: `Frühschicht`
- Sollarbeitszeit: `08:00`

**Tab „Zeitfenster":**
- Kommen ab: `06:00`
- Gehen ab: `14:00`

**Tab „Toleranz":**
- Zu früh kommen: `5` Minuten
- Zu spät kommen: `5` Minuten
- Zu früh gehen: `5` Minuten
- Zu spät gehen: `5` Minuten

**Tab „Rundung":**
- Rundung Kommen: **Keine**
- Rundung Gehen: **Keine**

**Tab „Spezial":**
- Feiertagsgutschrift (Voller Feiertag): `08:00`
- Urlaubsabzug: `1,0`
- Verhalten ohne Buchung: **Fehler**
- Tageswechselverhalten: **Kein**

📍 „Tagesplan erstellen"

⚠️ Pause hinzufügen: 📍 Tagesplan „FS" anklicken → Detailansicht → Abschnitt „Pausen" → **„Pause hinzufügen"** → Pausendauer: `30` Minuten, Mindestarbeitszeit: `06:00`

#### Schritt 2 — Tagesplan „Spätschicht" anlegen

📍 Seitenleiste → Verwaltung → **Tagespläne** → **„Neuer Tagesplan"**

**Tab „Basis":**
- Code: `SS`
- Plantyp: **Fest**
- Name: `Spätschicht`
- Sollarbeitszeit: `08:00`

**Tab „Zeitfenster":**
- Kommen ab: `14:00`
- Gehen ab: `22:00`

**Tab „Toleranz":**
- Zu früh kommen: `5` Minuten
- Zu spät kommen: `5` Minuten
- Zu früh gehen: `5` Minuten
- Zu spät gehen: `5` Minuten

**Tab „Rundung":**
- Rundung Kommen: **Keine**
- Rundung Gehen: **Keine**

**Tab „Spezial":**
- Feiertagsgutschrift (Voller Feiertag): `08:00`
- Urlaubsabzug: `1,0`
- Verhalten ohne Buchung: **Fehler**
- Tageswechselverhalten: **Kein**

📍 „Tagesplan erstellen"

⚠️ Pause hinzufügen: 📍 Tagesplan „SS" anklicken → Detailansicht → Abschnitt „Pausen" → **„Pause hinzufügen"** → Pausendauer: `30` Minuten, Mindestarbeitszeit: `06:00`

#### Schritt 3 — Tagesplan „Nachtschicht" anlegen

📍 Seitenleiste → Verwaltung → **Tagespläne** → **„Neuer Tagesplan"**

**Tab „Basis":**
- Code: `NS`
- Plantyp: **Fest**
- Name: `Nachtschicht`
- Sollarbeitszeit: `08:00`

**Tab „Zeitfenster":**
- Kommen ab: `22:00`
- Gehen ab: `06:00`

**Tab „Toleranz":**
- Zu früh kommen: `5` Minuten
- Zu spät kommen: `5` Minuten
- Zu früh gehen: `5` Minuten
- Zu spät gehen: `5` Minuten

**Tab „Rundung":**
- Rundung Kommen: **Keine**
- Rundung Gehen: **Keine**

**Tab „Spezial":**
- Feiertagsgutschrift (Voller Feiertag): `08:00`
- Urlaubsabzug: `1,0`
- Verhalten ohne Buchung: **Fehler**
- **Tageswechselverhalten: Bei Ankunft** ⬅️ **Wichtig!**

📍 „Tagesplan erstellen"

⚠️ Pause hinzufügen: 📍 Tagesplan „NS" anklicken → Detailansicht → Abschnitt „Pausen" → **„Pause hinzufügen"** → Pausendauer: `30` Minuten, Mindestarbeitszeit: `06:00`

💡 **Hinweis zum Tageswechselverhalten:** Die Nachtschicht beginnt um 22:00 und endet um 06:00 am Folgetag — die Arbeitszeit liegt also in **zwei Kalendertagen**. Die Einstellung **„Bei Ankunft"** sorgt dafür, dass die gesamte Arbeitszeit dem **Ankunftstag** zugerechnet wird (also dem Tag, an dem der Mitarbeiter um 22:00 kommt). Ohne diese Einstellung würde die Arbeitszeit um Mitternacht gesplittet und auf zwei Tage verteilt — das führt zu falschen Tageswerten und fehlerhaften Saldos.

#### Schritt 4 — Wochenpläne für jede Schicht anlegen

📍 Seitenleiste → Verwaltung → **Wochenpläne** → **„Neuer Wochenplan"**

**Wochenplan 1 — Frühschicht-Woche:**
- Code: `WP-FS`
- Name: `Frühschicht-Woche`
- Mo–Fr: `FS`, Sa–So: *(kein Plan — frei)*

📍 „Wochenplan erstellen"

**Wochenplan 2 — Spätschicht-Woche:**
- Code: `WP-SS`
- Name: `Spätschicht-Woche`
- Mo–Fr: `SS`, Sa–So: *(kein Plan — frei)*

📍 „Wochenplan erstellen"

**Wochenplan 3 — Nachtschicht-Woche:**
- Code: `WP-NS`
- Name: `Nachtschicht-Woche`
- Mo–Fr: `NS`, Sa–So: *(kein Plan — frei)*

📍 „Wochenplan erstellen"

✅ Alle drei Wochenpläne zeigen jeweils: **5 Arbeitstage, 40:00 Stunden**

#### Schritt 5 — Tarif „3-Schicht-Rotation" anlegen

📍 Seitenleiste → Verwaltung → **Tarife** → **„Neuer Tarif"**

**Tab „Basis":**
- Code: `SCHICHT-3R`
- Name: `3-Schicht-Rotation`
- Aktiv: ✓

**Tab „Zeitplan":**
- Rhythmustyp: **Rollierend wöchentlich**
- Wochenpläne in dieser Reihenfolge hinzufügen:
  1. `WP-FS` (Frühschicht-Woche)
  2. `WP-SS` (Spätschicht-Woche)
  3. `WP-NS` (Nachtschicht-Woche)
- Rhythmus-Startdatum: `06.01.2026`

**Tab „Urlaub":**
- Jahresurlaubstage: `30`
- Arbeitstage pro Woche: `5`

**Tab „Flexzeit":**
- Übertragungsart: **Vollständige Übertragung**

📍 „Tarif erstellen"

✅ Der Tarif erscheint in der Tabelle. Ab dem 06.01.2026 rotieren die Wochenpläne automatisch: KW 2 = Früh, KW 3 = Spät, KW 4 = Nacht, KW 5 = Früh, usw.

#### Schritt 6 — Mehrere Mitarbeiter per Massenaktion zuweisen

📍 Seitenleiste → Verwaltung → **Mitarbeiter**

1. Checkboxen bei allen Mitarbeitern setzen, die im 3-Schicht-Betrieb arbeiten sollen
2. 📍 In der Massenaktionsleiste → **„Tarif zuweisen"**
3. Im Dropdown: `SCHICHT-3R` (3-Schicht-Rotation) auswählen
4. 📍 „Anwenden"

✅ Alle ausgewählten Mitarbeiter zeigen in der Spalte „Tarif" nun `3-Schicht-Rotation`.

#### Schritt 7 — Planungstafel prüfen

📍 Seitenleiste → Verwaltung → **Schichtplanung** → Tab **„Planungstafel"**

1. Ansichtsmodus auf **„Monat"** umschalten
2. 📍 Zum Januar 2026 navigieren

✅ Sie sollten folgendes Muster sehen:

| Woche | Mo–Fr | Sa–So |
|-------|-------|-------|
| 05.01.–09.01. | FS (Frühschicht) | frei |
| 12.01.–16.01. | SS (Spätschicht) | frei |
| 19.01.–23.01. | NS (Nachtschicht) | frei |
| 26.01.–30.01. | FS (Frühschicht) | frei |

#### Schritt 8 — Manuelle Ausnahme: einen Mitarbeiter umplanen

Szenario: Mitarbeiter „Schmidt" ist in KW 3 (Spätschicht-Woche), soll aber am Mittwoch, 14.01.2026, ausnahmsweise Frühschicht arbeiten.

📍 Seitenleiste → Verwaltung → **Schichtplanung** → Tab **„Planungstafel"**

1. Die Zelle für „Schmidt" am 14.01.2026 anklicken
2. Im Dialog: Schicht auf `FS` (Frühschicht) ändern
3. 📍 „Speichern"

✅ Die Zelle zeigt nun für diesen Tag `FS` statt `SS`. Alle anderen Tage der Woche bleiben bei Spätschicht.

💡 **Hinweis:** Manuelle Änderungen in der Planungstafel werden bei der automatischen Schichtplan-Generierung (Sonntag 1:00 Uhr) **nicht überschrieben**.

#### Schritt 9 — Nachtschicht im Zeitnachweis verstehen

Wenn ein Nachtschicht-Mitarbeiter am 15.01.2026 um 22:00 einstempelt und am 16.01.2026 um 06:00 ausstempelt, sieht der Zeitnachweis so aus:

📍 Seitenleiste → **Zeitnachweis** → Mitarbeiter wählen → Datum **15.01.2026** auswählen

✅ Der Tag 15.01.2026 zeigt:
- Buchungen: Kommen 22:00, Gehen 06:00 (+1 Tag)
- Brutto: 08:00
- Pause: 00:30
- Netto: 07:30
- Soll: 08:00
- Saldo: −00:30

✅ Der Tag 16.01.2026 zeigt: **keine Buchungen** — die gesamte Arbeitszeit wurde dem Ankunftstag (15.01.) zugerechnet, weil das Tageswechselverhalten auf **„Bei Ankunft"** steht.

💡 **Hinweis:** Hätte man statt „Bei Ankunft" die Einstellung „Automatisch" gewählt, würde das System um Mitternacht automatische Buchungen einfügen und die Arbeitszeit aufteilen: 2 Stunden (22:00–00:00) dem 15.01. und 6 Stunden (00:00–06:00) dem 16.01. zurechnen. Für die meisten Schichtbetriebe ist **„Bei Ankunft"** die empfohlene Einstellung.

---

## 7. Urlaub & Abwesenheiten

### 7.1 Abwesenheit beantragen

📍 Seitenleiste → **Abwesenheiten**

✅ Sie sehen eine zweigeteilte Seite: Links das Urlaubskonto und Ihre Anträge, rechts einen Kalenderüberblick.

#### Neuen Antrag stellen

1. 📍 Seitenleiste → Abwesenheiten → **„Abwesenheit beantragen"** (oben rechts, +-Symbol)
2. Im Formular (Einblendung von rechts):
   - **Abwesenheitstyp** wählen (Karten-Auswahl)
   - **Datumsbereich** wählen (Kalender mit Markierung von Feiertagen und bestehenden Abwesenheiten)
   - ✅ Anzeige der Arbeitstage, die betroffen sind
   - Bei Einzeltag: **Dauer** wählen (Ganzer Tag / Halber Tag), bei halber Tag: Vormittag / Nachmittag
   - Bei Urlaubstypen: **Urlaubsvorschau** (aktueller Stand, beantragte Tage, neuer Stand)
   - **Notizen** (optional)
3. 📍 „Antrag absenden"

✅ Der Antrag erscheint links unter „Ihre Anträge" mit Status „Beantragt" (gelb). Wochenenden, freie Tage und bereits belegte Tage werden automatisch übersprungen.

#### Antrag bearbeiten oder stornieren

📍 In der linken Spalte unter „Ihre Anträge" beim Antrag:
- ✏️ **Bearbeiten** (nur bei Status „Beantragt") — Dauer und Notizen ändern
- 🚫 **Stornieren** — Bestätigungsdialog → Antrag wird storniert

### 7.2 Urlaub — Jahresübersicht des Urlaubskontos

📍 Seitenleiste → **Urlaub**

✅ Sie sehen eine Seite mit Jahresauswahl (← Jahr →) und drei Bereichen:

**Links — Saldoübersicht:**
- Große Zahl: Verbleibende Tage
- Fortschrittsbalken: Genommen (grün) / Geplant (gelb) / Verfügbar (grau)
- Aufstellung: Basisanspruch + Zusatztage + Übertrag + Anpassungen = Gesamtanspruch, Genommen, Geplant, Verfügbar

**Rechts oben — Kommende Urlaube:** Genehmigte und beantragte Urlaube (nur aktuelles Jahr)

**Rechts unten — Buchungshistorie:** Tabelle mit Spalten: Datum, Typ, Dauer, Status (Badge), Notizen

### 7.3 Der Genehmigungsworkflow

Jede Abwesenheit durchläuft folgende Zustände:

```
Beantragt  →  Genehmigt  →  (Storniert)
           →  Abgelehnt
```

| Aktion | Wer | Was passiert |
|--------|-----|-------------|
| **Beantragen** | Mitarbeiter | Status „Beantragt", Tag wird berechnet |
| **Genehmigen** | Vorgesetzter | Status „Genehmigt", Urlaubskonto wird aktualisiert, Benachrichtigung an Mitarbeiter |
| **Ablehnen** | Vorgesetzter | Status „Abgelehnt" mit Begründung, Benachrichtigung an Mitarbeiter |
| **Stornieren** | Vorgesetzter | Nur für genehmigte Abwesenheiten, Urlaubskonto wird zurückgerechnet |

### 7.4 Wie das Urlaubskonto berechnet wird

**Verfügbar = Anspruch + Übertrag + Anpassungen − Genommen**

Die Anspruchsberechnung berücksichtigt:
1. **Basisurlaubstage** aus dem Tarif (z. B. 30 Tage)
2. **Anteilsberechnung** bei unterjährigem Ein-/Austritt (pro Monat = Basistage ÷ 12)
3. **Teilzeitanpassung** proportional zur Wochenarbeitszeit (z. B. 20/40 Std. = halber Anspruch)
4. **Sonderurlaubstage** nach Regeln: Alter, Betriebszugehörigkeit, Schwerbehinderung

> **Beispiel:**
> - Basistage: 30, Eintritt 01.04. → 9 Monate → 30 × (9/12) = 22,5
> - Teilzeit 30 Std./Woche → 22,5 × (30/40) = 16,875 → gerundet: 17,0 Tage
> - Ab 50 Jahren: +2 Tage → **19,0 Tage Anspruch**

### 7.5 Urlaubskonfiguration

⚠️ Berechtigung: „Abwesenheitsarten verwalten"

📍 Seitenleiste → **Verwaltung** → **Urlaubskonfiguration**

✅ Seite mit **6 Tabs**:

| Tab | Inhalt | Was man dort tut |
|-----|--------|-----------------|
| **Sonderberechnungen** | Regeln für Zusatztage | Regeln nach Alter, Betriebszugehörigkeit oder Behinderung anlegen |
| **Berechnungsgruppen** | Gruppen von Sonderregeln | Sonderberechnungen zu Gruppen bündeln, Berechnungsbasis (Kalender/Eintritt) festlegen |
| **Kappungsregeln** | Einzelne Kappungsregeln | Regeln mit Stichtag und Maximalwert definieren (Jahresende/Halbjahr) |
| **Kappungsregelgruppen** | Gruppen von Kappungsregeln | Einzelregeln zu Gruppen bündeln (werden im Tarif zugewiesen) |
| **Ausnahmen** | Mitarbeiter-Ausnahmen | Individuelle Abweichungen von Kappungsregeln (voll/teilweise) |
| **Vorschauen** | Berechnungs-Vorschau | Anspruch und Übertrag für einen Mitarbeiter vorab berechnen |

##### Anspruch vorab berechnen (Vorschau)

1. 📍 Tab „Vorschauen" → linke Karte „Anspruchsvorschau"
2. **Mitarbeiter** und **Jahr** wählen
3. 📍 „Berechnen"
4. ✅ Detaillierte Aufstellung: Berechnungsgruppe, Basis, Beschäftigungsmonate, Alter, Betriebsjahre, Teilzeitfaktor, Basisanspruch, anteilig, altersabhängig, betriebszugehörigkeitsabhängig, Gesamtanspruch

##### Übertrag vorab berechnen (Vorschau)

1. 📍 Tab „Vorschauen" → rechte Karte „Übertragsvorschau"
2. **Mitarbeiter** und **Jahr** wählen
3. 📍 „Berechnen"
4. ✅ Verfügbare Tage, Gekappter Übertrag, Verfallene Tage, angewandte Regeln mit Ausnahmen

### 7.6 Urlaubskonten verwalten

⚠️ Berechtigung: „Abwesenheiten verwalten"

📍 Seitenleiste → **Verwaltung** → **Urlaubskonten**

✅ Tabelle mit Spalten: Mitarbeiter (Avatar + Name), Personalnummer, Jahr, Basisanspruch, Zusatzanspruch, Übertrag, Manuelle Anpassung, Gesamtanspruch (fett), Genommen, Geplant, Verbleibend (farbiges Badge: grün > 5, gelb 1–5, rot < 1).

**Filter:** Jahresauswahl, Suchfeld, Abteilung

##### Jahr initialisieren

1. 📍 **„Jahr initialisieren"** (Kalender-Plus-Symbol)
2. **Jahr** eingeben, **Übertrag** aktivieren/deaktivieren
3. 📍 „Initialisieren"
4. ✅ Urlaubskonten für alle Mitarbeiter des Jahres werden angelegt

##### Einzelnes Urlaubskonto bearbeiten

1. 📍 Tabelle → ⋯-Menü → **„Saldo bearbeiten"**
2. Felder: Basisanspruch, Zusatzanspruch, Übertrag, Manuelle Anpassung (jeweils in halben Tagen)
3. ✅ Gesamtvorschau wird live berechnet (blau hervorgehoben)
4. 📍 „Speichern"

### 7.7 Was am Jahresende passiert

Am Jahresende wird der verfügbare Resturlaub als Übertrag in das neue Jahr übernommen. **Kappungsregeln** können den Übertrag begrenzen:

| Regeltyp | Beschreibung |
|----------|-------------|
| **Jahresendkappung** | Am 31.12. wird der Übertrag auf einen Maximalwert gekappt |
| **Halbjahresregel** | Bis zu einem Stichtag (z. B. 31.03.) gelten volle Resttage, danach wird gekappt |

Für einzelne Mitarbeiter können **Ausnahmen** gelten (konfiguriert in der Urlaubskonfiguration, Tab „Ausnahmen"):
- **Vollständige Ausnahme**: Die Kappungsregel wird ignoriert
- **Teilweise Ausnahme**: Mitarbeiter darf mehr Tage behalten als die Regel erlaubt

### 7.8 Praxisbeispiel: Urlaubskonto einrichten und Jahreswechsel durchführen

Szenario: Die Mitarbeiterin Anna Becker hat 30 Urlaubstage, maximal 5 Tage Übertrag ins nächste Jahr erlaubt (Verfall am 31.03.), Eintritt am 01.04.2026 (Teiljahr), wird im Oktober 50 Jahre alt (+2 Bonustage).

#### Schritt 1 — Urlaubskappungsregel anlegen

📍 Seitenleiste → Verwaltung → **Urlaubskonfiguration** → Tab **„Kappungsregeln"**

1. 📍 **„Neue Regel"**
2. Ausfüllen:
   - Code: `KAPP-5T`
   - Name: `Max. 5 Tage Übertrag`
   - Maximalwert: `5` Tage
   - Stichtag: `31.03.` (Verfallsdatum — nicht übertragene Resttage verfallen am 31.03. des Folgejahres)
3. 📍 „Speichern"

📍 Tab **„Kappungsregelgruppen"** → **„Neue Gruppe"**
- Code: `KG-STD`
- Name: `Standard-Kappung`
- Kappungsregel zuweisen: `KAPP-5T`

📍 „Speichern"

⚠️ Die Kappungsregelgruppe muss anschließend im **Tarif** der Mitarbeiterin zugewiesen werden: 📍 Verwaltung → Tarife → Tarif bearbeiten → Tab „Urlaub" → Urlaubskappungsregelgruppe: `KG-STD`

#### Schritt 2 — Berechnungsregel für Bonustage anlegen

📍 Seitenleiste → Verwaltung → **Urlaubskonfiguration** → Tab **„Sonderberechnungen"**

1. 📍 **„Neue Sonderberechnung"**
2. Ausfüllen:
   - Code: `ALTER-50`
   - Name: `Altersbonus ab 50 Jahre`
   - Regeltyp: **Alter**
   - Schwellenwert: `50` (ab 50 Jahren)
   - Zusatztage: `2`
3. 📍 „Speichern"

📍 Tab **„Berechnungsgruppen"** → die Berechnungsgruppe des Tarifs öffnen (oder neue anlegen) → Sonderberechnung `ALTER-50` zuweisen.

#### Schritt 3 — Urlaubskonto für die Mitarbeiterin initialisieren

📍 Seitenleiste → Verwaltung → **Urlaubskonten** → **„Jahr initialisieren"**

- Jahr: `2026`
- Übertrag: aktivieren (falls Vorjahresdaten vorhanden)

📍 „Initialisieren"

✅ Das System berechnet den Anspruch für Anna Becker automatisch:

| Berechnung | Wert |
|-----------|------|
| Basistage | 30 |
| Beschäftigungsmonate (01.04.–31.12.) | 9 |
| Anteilsberechnung | 30 × (9 ÷ 12) = **22,5** |
| Altersbonus (wird im Oktober 50) | +2 |
| **Gesamtanspruch 2026** | **24,5 → gerundet: 25 Tage** |

💡 **Hinweis zur Anteilsberechnung:** Da Anna erst am 01.04. eintritt, hat sie keinen Anspruch auf die vollen 30 Tage. Das System rechnet pro angefangenem Beschäftigungsmonat anteilig. Die Rundung erfolgt kaufmännisch auf halbe Tage.

#### Schritt 4 — Was passiert am Jahresende automatisch?

Am 31.12.2026 prüft das System den Resturlaub:

| Wert | Beispiel |
|------|---------|
| Gesamtanspruch 2026 | 25 Tage |
| Genommen | 20 Tage |
| Resturlaub | 5 Tage |
| Kappungsregel (max. 5 Tage) | 5 Tage → **wird vollständig übertragen** |

Hätte Anna nur 17 Tage genommen, wären 8 Tage übrig. Die Kappungsregel begrenzt den Übertrag auf 5 Tage — die restlichen 3 Tage verfallen, sofern sie nicht bis zum 31.03.2027 genommen werden.

#### Schritt 5 — Manuellen Übertrag prüfen

📍 Seitenleiste → Verwaltung → **Urlaubskonten** → Jahresauswahl: **2027**

1. 📍 Anna Becker in der Tabelle suchen
2. ✅ Spalte „Übertrag" zeigt: `5,0` Tage

Alternativ die Vorschaufunktion nutzen:
📍 Verwaltung → Urlaubskonfiguration → Tab **„Vorschauen"** → rechte Karte **„Übertragsvorschau"** → Mitarbeiter: Anna Becker, Jahr: 2027 → „Berechnen"

✅ Die Vorschau zeigt: Verfügbare Tage, Gekappter Übertrag (5), Verfallene Tage (falls vorhanden).

#### Schritt 6 — Urlaubskonto prüfen (alle 4 Werte)

📍 Seitenleiste → **Urlaub** → (als Administrator: Mitarbeiter-Dropdown → Anna Becker) → Jahr: **2027**

✅ Die Saldoübersicht zeigt vier Werte:

| Wert | Bedeutung | Beispiel |
|------|-----------|---------|
| **Anspruch** | Basisanspruch 2027 (volles Jahr, inkl. Altersbonus) | 32 Tage (30 + 2) |
| **Übertrag** | Aus 2026 mitgenommene Tage | 5 Tage |
| **Anpassungen** | Manuelle Korrekturen (z. B. Sonderurlaub) | 0 Tage |
| **Genommen** | Bereits verbrauchte Urlaubstage | 0 Tage |

💡 **Hinweis:** Ab 2027 bekommt Anna den vollen Anspruch (30 Tage + 2 Altersbonus = 32), da sie nun ein volles Kalenderjahr beschäftigt ist.

---

## 8. Aufgaben des Managers

### 8.1 Genehmigungen

⚠️ Berechtigung: „Abwesenheiten genehmigen" bzw. „Zeiten genehmigen"

📍 Seitenleiste → **Verwaltung** → **Genehmigungen**

✅ Seite mit zwei Tabs (mit Anzahl-Badges): **Zeitnachweise** und **Abwesenheiten**

Beide Tabs haben die gleiche Filterleiste: Team (Dropdown), Datumsbereich, Status

#### Abwesenheiten genehmigen

1. 📍 Tab **„Abwesenheiten"** → Status auf „Beantragt" stellen
2. ✅ Tabelle zeigt: Checkbox, Mitarbeiter, Typ (farbiges Badge), Datum, Dauer, Notizen, Eingereicht am
3. Einzeln: 📍 Grünen ✓-Button klicken → Sofort genehmigt
4. Ablehnen: 📍 Roten ✗-Button klicken → Ablehnungsgrund eingeben → Bestätigen
5. Mehrere gleichzeitig: Checkboxen setzen → 📍 **„Ausgewählte genehmigen"** in der Massenaktionsleiste

#### Zeitnachweise genehmigen

1. 📍 Tab **„Zeitnachweise"** → Status auf „Ausstehend" stellen
2. ✅ Tabelle zeigt: Checkbox, Mitarbeiter, Datum, Stunden, Überstunden, Fehler (Badge), Genehmigen-Button
3. Aufklappbare Detailzeile (Klick auf Pfeil): Brutto, Netto, Soll, Pause, Saldo, Status
4. Einzeln genehmigen: 📍 Grünen ✓-Button klicken
5. Massenweise: Checkboxen → „Ausgewählte genehmigen"

### 8.2 Korrekturassistent

⚠️ Berechtigung: „Korrekturen verwalten" (`corrections.manage`)

📍 Seitenleiste → **Verwaltung** → **Korrekturassistent**

Der Korrekturassistent ist ein **Diagnose-Werkzeug**: Er erkennt automatisch Fehler und Hinweise in den Tageswerten der Mitarbeiter (z. B. fehlende Buchungen, Kernzeitverstöße, Pausenregelverletzungen). Korrekturen werden **nicht** im Korrekturassistenten selbst vorgenommen, sondern im **Zeitnachweis** des betroffenen Mitarbeiters.

✅ Seite mit zwei Tabs: **Korrekturen** und **Meldungen**

#### Tab „Korrekturen" — Fehlerhafte Tage finden

**Filter:** Datumsbereich (Standard: Vormonat bis Monatsende), Abteilung, Schweregrad (Alle/Fehler/Hinweis), Fehlercode, Mitarbeitersuche (nach Name)

✅ Tabelle mit einer Zeile pro Fehler, mit Spalten: Mitarbeiter, Abteilung, Datum, Fehlercode (monospace), Schweregrad (Badge: rot = Fehler, grau = Hinweis), Meldung.

⚠️ Ein Mitarbeiter-Tag kann mehrere Fehler haben — in diesem Fall erscheint der Tag mehrfach (eine Zeile pro Fehler).

**Fehlertypen und ihre Codes:**

| Code | Schweregrad | Bedeutung |
|------|-------------|-----------|
| `MISSING_COME` | Fehler | Kommen-Buchung fehlt |
| `MISSING_GO` | Fehler | Gehen-Buchung fehlt |
| `NO_BOOKINGS` | Fehler | Keine Buchungen vorhanden |
| `UNPAIRED_BOOKING` | Fehler | Unpaarige Buchung (Kommen ohne Gehen oder umgekehrt) |
| `DUPLICATE_IN_TIME` | Fehler | Doppelte Buchung zur gleichen Zeit |
| `EARLY_COME` / `LATE_COME` | Fehler | Kommen außerhalb der Kernzeit |
| `EARLY_GO` / `LATE_GO` | Fehler | Gehen außerhalb der Kernzeit |
| `MISSED_CORE_START` / `MISSED_CORE_END` | Fehler | Kernzeitanfang/-ende nicht eingehalten |
| `BELOW_MIN_WORK_TIME` | Fehler | Mindestarbeitszeit unterschritten |
| `INVALID_TIME` | Fehler | Ungültige Zeitangabe |
| `NO_MATCHING_SHIFT` | Fehler | Keine passende Schicht gefunden |
| `NO_BREAK_RECORDED` / `SHORT_BREAK` | Hinweis | Keine oder zu kurze Pause |
| `MANUAL_BREAK` / `AUTO_BREAK_APPLIED` | Hinweis | Pause manuell/automatisch angewendet |
| `MAX_TIME_REACHED` | Hinweis | Maximale Arbeitszeit erreicht |
| `CROSS_MIDNIGHT` | Hinweis | Buchung über Mitternacht |
| `MONTHLY_CAP_REACHED` / `FLEXTIME_CAPPED` | Hinweis | Monats-/Gleitzeit-Obergrenze erreicht |

#### Was passiert beim Klick auf eine Zeile?

📍 Zeile anklicken → **Detailansicht** öffnet sich als Seitenpanel rechts

✅ Das Panel zeigt:
- **Mitarbeiterinformationen**: Name, Abteilung, Datum
- **Alle Fehler dieses Tages**: Jeder Fehler als Karte mit Fehlercode, Schweregrad-Badge (rot/grau), Meldungstext und Fehlertyp-Badge (z. B. `missing_booking`, `core_time_violation`, `break_violation`)

✅ Am unteren Rand des Panels zwei Buttons:
- **„Schließen"** — Panel schließen
- **„Zum Mitarbeiter"** — navigiert zur Mitarbeiter-Detailseite (`/admin/employees/{id}`)

⚠️ Es gibt im Panel **keinen direkten Link zum Zeitnachweis** mit dem fehlerhaften Datum. Der Weg führt über die Mitarbeiter-Detailseite.

#### Vom Fehler zur Korrektur — Vollständiger Ablauf

Der Korrekturassistent zeigt Fehler an, aber die **eigentliche Korrektur** erfolgt im Zeitnachweis durch Hinzufügen, Bearbeiten oder Löschen von Buchungen:

1. 📍 Seitenleiste → Verwaltung → **Korrekturassistent** → Filter setzen (Datumsbereich, ggf. Abteilung)
2. 📍 Fehlerhafte Zeile anklicken → Detailpanel lesen: welcher Fehler liegt vor?
3. 📍 **„Zum Mitarbeiter"** klicken → Mitarbeiter-Detailseite öffnet sich
4. 📍 Auf der Mitarbeiter-Detailseite → **„Zeitnachweis anzeigen"** klicken → Zeitnachweis-Seite öffnet sich
5. 📍 Im Zeitnachweis zum fehlerhaften **Datum navigieren** (Tagesansicht)
6. Je nach Fehler:
   - `MISSING_COME` / `MISSING_GO` → 📍 **„Buchung hinzufügen"** → fehlende Buchung nachtragen
   - `UNPAIRED_BOOKING` / `DUPLICATE_IN_TIME` → Fehlerhafte Buchung bearbeiten oder löschen
   - `NO_BOOKINGS` → Alle Buchungen nachtragen oder Abwesenheit eintragen
   - Kernzeit-/Pausenverstöße → Buchungszeiten korrigieren oder als Hinweis akzeptieren
7. ✅ Nach dem Speichern wird der Tag **automatisch neu berechnet** — der Fehler verschwindet aus dem Korrekturassistenten

**Alternativ** (ohne Korrekturassistent): 📍 Seitenleiste → **Zeitnachweis** → Mitarbeiter auswählen → zum fehlerhaften Tag navigieren → Buchungen direkt korrigieren

⚠️ Hinweise (grau) erfordern nicht immer eine Korrektur — sie informieren über Besonderheiten (z. B. automatische Pausenabzüge, erreichte Obergrenzen). Nur **Fehler** (rot) müssen vor einem Monatsabschluss behoben werden.

#### Tab „Meldungen" — Fehlertexte anpassen

✅ Tabelle mit Spalten: Code (monospace, fett), Standardtext, Benutzerdefinierter Text (inline bearbeitbar), Wirksamer Text, Schweregrad (Badge), Aktiv (Schalter).

**Inline-Bearbeitung des benutzerdefinierten Texts:**
1. 📍 Spalte „Benutzerdefinierter Text" anklicken → Eingabefeld erscheint
2. Text eingeben → **Enter** zum Speichern, **Escape** zum Abbrechen
3. ✅ Der „Wirksame Text" aktualisiert sich sofort (benutzerdefinierter Text hat Vorrang vor Standardtext)

**Erweiterte Bearbeitung über Dialog:**
📍 ⋯-Menü am Zeilenende → **„Bearbeiten"** → Dialog öffnet sich mit:
- **Benutzerdefinierter Text** (mehrzeiliges Textfeld)
- **Schweregrad** ändern (Fehler ↔ Hinweis)
- **Aktiv/Inaktiv** Schalter (deaktivierte Meldungen werden nicht mehr angezeigt)
- **„Auf Standard zurücksetzen"** — löscht den benutzerdefinierten Text

⚠️ Das Deaktivieren einer Meldung unterdrückt nur die **Anzeige** im Korrekturassistenten — der zugrunde liegende Fehler in den Tageswerten bleibt bestehen.

### 8.3 Monatsauswertung und Monatsabschluss

📍 Seitenleiste → **Monatsauswertung**

✅ Seite mit Monatsnavigation (← Monat →), Status-Badge (Offen / Abgeschlossen), und vier Zusammenfassungskarten: Zeitübersicht, Flexzeitsaldo, Arbeitstage, Abwesenheiten.

⚠️ Administratoren sehen oben ein Mitarbeiter-Dropdown.

**Tagesaufschlüsselung**: Tabelle mit Spalten: Datum, Soll, Brutto, Pausen, Netto, Saldo, Status (Badge: OK / Warnungen / Fehler). Summenzeile am Ende. Klick auf eine Zeile springt zum Zeitnachweis dieses Tages.

#### Monat abschließen

1. 📍 Monatsauswertung → **„Monat abschließen"** (🔒-Button, oben rechts)
2. Im Dialog:
   - „Vor Abschluss neu berechnen" (Checkbox, standardmäßig aktiviert)
   - Notizen (optional)
   - Hinweistext erklärt, was der Abschluss bewirkt
3. 📍 „Monat abschließen"

✅ Status wechselt zu „Abgeschlossen" (grün). Ab sofort können keine Änderungen mehr an den Buchungen dieses Monats vorgenommen werden.

#### Monat wieder öffnen

📍 **„Wieder öffnen"** (🔓-Button, erscheint nur bei abgeschlossenen Monaten) → Bestätigen

#### 8.3.1 Praxisbeispiel: Ersten Monat abschließen und DATEV-Export erstellen

Szenario: Ende Januar 2026 — der Manager schließt den Monat für alle Mitarbeiter ab und erstellt den Export für den Steuerberater.

##### Schritt 1 — Monatswerte aufrufen und Januar prüfen

📍 Seitenleiste → Verwaltung → **Monatswerte** → Monatsnavigation: **Januar 2026**

✅ Sie sehen eine Tabelle aller Mitarbeiter mit deren Januarwerten. Prüfen Sie:
- Spalte **Status**: Alle Einträge sollten „Berechnet" (blau) zeigen — **nicht** „Offen" (grau)
- Spalte **Soll vs. Netto**: Große Abweichungen deuten auf fehlende Buchungen hin
- Spalte **Fehler**: Rot markierte Einträge müssen vor dem Abschluss korrigiert werden

⚠️ Falls Einträge den Status „Offen" haben: 📍 „Alle auswählen" → **„Neu berechnen"** (↻) in der Massenaktionsleiste klicken.

##### Schritt 2 — Fehler identifizieren (Korrekturassistent)

📍 Seitenleiste → Verwaltung → **Korrekturassistent** → Datumsbereich: **01.01.2026 – 31.01.2026**

✅ Die Tabelle zeigt alle Tage mit Fehlern oder Hinweisen.

**Was tun, wenn ein Tag rot markiert ist?**

| Fehlercode | Bedeutung | Lösung |
|-----------|-----------|--------|
| `MISSING_BOOKING` | Fehlende Buchung (Kommen ohne Gehen) | 📍 Zeile anklicken → Zeitnachweis des Tages öffnen → fehlende Buchung nachtragen |
| `NO_BOOKINGS` | Keine Buchungen vorhanden | Abwesenheit eintragen oder Buchungen nachtragen |
| `OVERLAP` | Überlappende Buchungen | Buchungen prüfen und die fehlerhafte löschen |
| `TOLERANCE_EXCEEDED` | Toleranz überschritten | Kein Handlungsbedarf — nur ein Hinweis |

##### Schritt 3 — Korrektur anlegen und genehmigen

📍 Seitenleiste → **Zeitnachweis** → Mitarbeiter wählen → zum fehlerhaften Tag navigieren

1. 📍 **„Buchung hinzufügen"** → fehlende Buchung nachtragen (z. B. Gehen um 16:30)
2. ✅ Der Tag wird automatisch neu berechnet — der Fehler verschwindet

Alternativ, wenn der Mitarbeiter vergessen hat zu stempeln und die Zeiten nachträglich erfasst werden:
1. 📍 Korrekturassistent → Zeile anklicken → Detailansicht
2. Die Fehlermeldung lesen und die fehlende Buchung über den Zeitnachweis nachtragen

##### Schritt 4 — Monat für alle Mitarbeiter abschließen (Massenaktion)

📍 Seitenleiste → Verwaltung → **Monatswerte** → Monatsnavigation: **Januar 2026**

1. ✅ Prüfen: Keine roten Fehler-Badges mehr in der Tabelle
2. 📍 Checkbox **„Alle auswählen"** oben links aktivieren
3. 📍 In der Massenaktionsleiste → **„Ausgewählte abschließen"** (🔒)
4. 📍 Bestätigungsdialog → „Abschließen"

✅ Alle Einträge zeigen Status **„Abgeschlossen"** (grün). Ab sofort können keine Buchungen im Januar mehr geändert werden.

⚠️ Falls ein Mitarbeiter nachträglich doch korrigiert werden muss: 📍 Einzelnen Mitarbeiter über ⋯-Menü → **„Wieder öffnen"** (🔓) → korrigieren → erneut abschließen.

##### Schritt 5 — Lohnexport erstellen

📍 Seitenleiste → Administration → **Lohnexporte** → **„Export erstellen"**

1. Jahr: `2026`, Monat: **Januar**
2. Exporttyp: **DATEV**
3. Format: **CSV**
4. Exportschnittstelle: die für Ihren Steuerberater konfigurierte Schnittstelle wählen (falls vorhanden)
5. 📍 „Generieren"

✅ Der Export erscheint in der Tabelle mit Status **„Abgeschlossen"** (grün).

##### Schritt 6 — Was enthält die CSV-Datei?

📍 Tabelle → ⋯-Menü → **„Vorschau"** um die Daten vor dem Herunterladen zu prüfen.

Die CSV-Datei enthält folgende Spalten:

| Spalte | Beschreibung | Beispielwert |
|--------|-------------|-------------|
| Personalnummer | Eindeutige Mitarbeiter-ID | `1001` |
| Vorname | Vorname des Mitarbeiters | `Max` |
| Nachname | Nachname | `Mustermann` |
| Abteilung | Zugewiesene Abteilung | `Produktion` |
| Kostenstelle | Kostenstelle für die Buchhaltung | `KST-100` |
| Sollstunden | Geplante Stunden im Monat | `168,00` |
| Ist-Stunden | Tatsächlich geleistete Stunden | `172,50` |
| Überstunden | Differenz Ist − Soll (wenn positiv) | `4,50` |
| Urlaubstage | Genommene Urlaubstage im Monat | `2,00` |
| Krankheitstage | Krankheitstage im Monat | `0,00` |
| Sonstige | Andere Abwesenheitstage | `0,00` |

Zusätzlich werden die Werte aller zugeordneten **Konten** als weitere Spalten angehängt (z. B. Nachtzuschlag, Feiertagszuschlag).

📍 ⋯-Menü → **„Herunterladen"** → Die CSV-Datei wird heruntergeladen und kann an den Steuerberater weitergeleitet werden.

💡 **Hinweis: LODAS vs. Lohn und Gehalt** — Fragen Sie Ihren Steuerberater, welches DATEV-Produkt er verwendet. **DATEV LODAS** und **DATEV Lohn und Gehalt** erwarten unterschiedliche Spalten-Mappings. Das Mapping wird in der **Exportschnittstelle** konfiguriert (📍 Administration → Exportschnittstellen). Falls die CSV-Datei nicht importiert werden kann, liegt es meist an einer falschen Konten-Zuordnung in der Schnittstelle.

### 8.4 Monatswerte (Massenbearbeitung)

⚠️ Berechtigung: „Berichte ansehen"

📍 Seitenleiste → **Verwaltung** → **Monatswerte**

✅ Seite mit Monatsnavigation und Tabelle aller Mitarbeiter mit deren Monatswerten.

**Filter:** Monatsauswahl, Abteilung, Status (Alle/Offen/Berechnet/Abgeschlossen/Exportiert), Suche

**Tabellenspalten:** Checkbox, Mitarbeiter, Personalnummer, Status (Badge), Soll, Netto, Überstunden, Saldo, Abwesenheitstage

**Massenaktionen** (Leiste über der Tabelle):
- „Alle auswählen" (Checkbox)
- **„Ausgewählte abschließen"** (🔒) — schließt alle markierten Monate
- **„Ausgewählte öffnen"** (🔓) — öffnet alle markierten Monate
- **„Neu berechnen"** (↻) — berechnet den gesamten Monat für alle Mitarbeiter neu

### 8.5 Lohnexporte (DATEV/CSV)

⚠️ Berechtigung: „Lohnexport ansehen" bzw. „Lohnexport verwalten"

📍 Seitenleiste → **Administration** → **Lohnexporte**

✅ Seite mit Monatsnavigation und Tabelle der bisherigen Exporte.

**Tabellenspalten:** Jahr/Monat, Exporttyp (Badge), Format, Status (Badge mit Fortschrittsanimation bei „Generierung"), Mitarbeiteranzahl, Gesamtstunden, Erstellt am.

#### Neuen Lohnexport erstellen

1. 📍 **„Export erstellen"** (oben rechts)
2. Im Formular:
   - **Jahr** und **Monat** (Dropdown — aktuelle und zukünftige Monate sind gesperrt)
   - **Exporttyp** (Standard / DATEV / Sage / Benutzerdefiniert)
   - **Format** (CSV / XLSX / XML / JSON)
   - **Exportschnittstelle** (optional, Dropdown)
   - **Erweiterte Parameter** (aufklappbar): Mitarbeiter-IDs, Abteilungs-IDs, Konten-IDs
3. 📍 „Generieren"

✅ Der Export erscheint in der Tabelle. Bei Erfolg: Status „Abgeschlossen".

#### Export ansehen und herunterladen

1. 📍 Tabelle → ⋯-Menü → **„Vorschau"** → Breite Tabellenansicht mit allen Spalten: Personalnummer, Vorname, Nachname, Abteilung, Kostenstelle, Sollstunden, Ist-Stunden, Überstunden, Urlaubstage, Krankheitstage, Sonstige + Kontenwerte. Summenzeile am Ende.
2. 📍 ⋯-Menü → **„Herunterladen"** → Datei wird heruntergeladen

**CSV-Format:** Semikolon-getrennt, mit Spaltenüberschrift. Alle Zahlenwerte mit zwei Dezimalstellen. Importierbar in DATEV und andere Lohnabrechnungssysteme.

### 8.6 Exportschnittstellen konfigurieren

⚠️ Berechtigung: „Lohnexport verwalten"

📍 Seitenleiste → **Administration** → **Exportschnittstellen**

✅ Tabelle mit Spalten: Nummer, Name, Mandant, Exportpfad, Status, Konten (Anzahl).

#### Neue Schnittstelle anlegen

1. 📍 **„Neue Schnittstelle"** (oben rechts)
2. Ausfüllen: Nummer (Pflicht), Name (Pflicht), Mandantennummer, Exportskript, Exportpfad, Ausgabedateiname
3. 📍 „Erstellen"

#### Konten zuordnen

1. 📍 Tabelle → ⋯-Menü → **„Konten verwalten"**
2. ✅ Duale-Liste-Ansicht: Links „Verfügbare Konten" mit Suchfeld und Checkboxen, rechts „Zugeordnete Konten" mit Reihenfolge-Buttons (↑↓). Zwischen beiden Spalten: Pfeil-Buttons zum Verschieben.
3. Konten auswählen und mit → verschieben
4. 📍 „Speichern"

### 8.7 Berichte

⚠️ Berechtigung: „Berichte ansehen"

📍 Seitenleiste → **Administration** → **Berichte**

✅ Tabelle mit Spalten: Name, Berichtstyp (farbiges Badge), Format, Status, Zeilenanzahl, Dateigröße, Erstellt am.

**Filter:** Berichtstyp (Dropdown), Status (Dropdown)

#### Neuen Bericht erstellen

1. 📍 **„Bericht erstellen"** (oben rechts)
2. Im Formular:
   - **Berichtstyp** (gruppiertes Dropdown):
     - Stammdaten: Tagesübersicht, Wochenübersicht, Mitarbeiter-Zeitnachweis
     - Monatlich: Monatsübersicht, Abteilungszusammenfassung
     - Abwesenheit/Urlaub: Abwesenheitsbericht, Urlaubsbericht
     - Zeitanalyse: Überstundenbericht, Kontostände
     - Sonstige: Benutzerdefiniert
   - **Name** (optional)
   - **Format** (PDF / XLSX / CSV / JSON)
   - **Datumsbereich** (erscheint je nach Berichtstyp)
   - **Filter**: Mitarbeiter, Abteilungen, Kostenstellen, Teams (jeweils Multi-Auswahl mit Checkboxen)
3. 📍 „Generieren"

#### Bericht herunterladen

📍 Tabelle → ⋯-Menü → **„Herunterladen"** (nur bei Status „Abgeschlossen")

### 8.8 Auswertungen (Detailansicht)

⚠️ Berechtigung: „Berichte ansehen"

📍 Seitenleiste → **Verwaltung** → **Auswertungen**

✅ Seite mit gemeinsamer Filterleiste (Datumsbereich, Mitarbeiter, Abteilung) und **5 Tabs**:

| Tab | Inhalt | Spalten |
|-----|--------|---------|
| **Tageswerte** | Berechnete Tagesergebnisse | Datum, Mitarbeiter, Status, Soll, Brutto, Netto, Pause, Über-/Fehlzeit, Saldo, Kommen, Gehen, Buchungen, Fehler |
| **Buchungen** | Einzelne Stempelbuchungen | Datum, Mitarbeiter, Uhrzeit, Buchungstyp, Quelle (farbiges Badge), Richtung, Notizen |
| **Terminal-Buchungen** | Terminaldaten | Datum, Mitarbeiter, Originalzeit, Bearbeitete Zeit, Bearbeitet-Badge, Buchungstyp, Terminal-ID |
| **Protokoll** | Änderungsprotokoll | Zeitstempel, Benutzer, Aktion (farbiges Badge), Entitätstyp, Name, Änderungen |
| **Workflow-Historie** | Genehmigungs-Historie | Zeitstempel, Benutzer, Aktion, Entitätstyp, Name, Metadaten |

Tab „Tageswerte" hat Zusatzfilter: „Nur mit Fehlern" (Schalter), „Ohne Buchungen einschließen" (Schalter)

Tab „Buchungen" hat Zusatzfilter: Buchungstyp, Quelle, Richtung

### 8.9 Auswertungsvorlagen

⚠️ Berechtigung: „Monatsauswertungen verwalten"

📍 Seitenleiste → **Administration** → **Auswertungsvorlagen**

✅ Tabelle mit Spalten: Name (Standardvorlage bernsteinfarben hervorgehoben), Beschreibung, Flexzeit positiv, Flexzeit negativ, Überstundenschwelle, Max. Übertrag, Standard (⭐), Status.

#### Neue Vorlage anlegen

1. 📍 **„Neue Vorlage"** (oben rechts)
2. Ausfüllen: Name (Pflicht), Beschreibung, Flexzeit-Kappung positiv/negativ (Minuten mit Live-Daueranzeige), Überstundenschwelle, Max. Urlaubsübertrag (Tage), „Als Standard festlegen" (Schalter), Aktiv (Schalter)
3. 📍 „Speichern"

### 8.10 Mitarbeiternachrichten

⚠️ Berechtigung: „Benachrichtigungen verwalten"

📍 Seitenleiste → **Verwaltung** → **Mitarbeiternachrichten**

✅ Tabelle mit Spalten: Betreff, Empfänger (Anzahl), Status (Badges: Gesendet/Ausstehend/Fehlgeschlagen mit Anzahl), Erstellt am.

**Filter:** Suchfeld, Status (Alle/Ausstehend/Gesendet/Fehlgeschlagen)

#### Nachricht verfassen

1. 📍 **„Nachricht verfassen"** (Briefumschlag-Symbol, rechts)
2. Im Formular:
   - **Betreff** (Pflicht)
   - **Nachricht** (Pflicht, Textfeld)
   - **Empfänger** — drei Modi:
     - *Einzeln*: Mitarbeiter einzeln aus Dropdown auswählen (als Chips angezeigt)
     - *Abteilung*: Ganze Abteilungen auswählen
     - *Alle*: Checkbox „An alle aktiven Mitarbeiter senden"
3. 📍 „Nachricht erstellen" → Bestätigungsdialog → „Senden"

### 8.11 Audit-Protokoll

⚠️ Berechtigung: „Benutzer verwalten"

📍 Seitenleiste → **Administration** → **Audit-Protokoll**

✅ Tabelle mit Spalten: Zeitstempel, Benutzer (Avatar + Name), Aktion (farbiges Badge), Entitätstyp, Name, IP-Adresse, Details (Auge-Symbol).

**Filter:** Datumsbereich (Standard: letzte 24 Stunden), Benutzer, Entitätstyp (19 Typen), Aktion (11 Aktionen), Entitäts-ID

Aktions-Badge-Farben: Grün = Erstellen/Genehmigen, Blau = Ändern, Rot = Löschen/Ablehnen, Lila = Abschließen, Orange = Wieder öffnen

📍 Zeile anklicken oder Auge-Symbol → Detailansicht mit Abschnitt „Änderungen" (Vorher/Nachher JSON-Vergleich)

---

## 9. Automatisierung — Was passiert im Hintergrund?

Terp führt vier automatische Aufgaben aus, die regelmäßig im Hintergrund laufen:

### 9.1 Tagesberechnung — Jede Nacht um 2:00 Uhr

**Was passiert:** Für alle aktiven Mitarbeiter werden die Tageswerte berechnet (wie in Abschnitt 5.4 beschrieben).

**Warum:** Damit am nächsten Morgen alle Werte aktuell sind — auch wenn jemand vergessen hat, auszustempeln. Die Berechnung läuft auch bei jeder einzelnen Buchungsänderung automatisch.

### 9.2 Monatsberechnung — Am 2. jedes Monats um 3:00 Uhr

**Was passiert:** Für alle Mitarbeiter wird der Vormonat zusammengefasst: Tageswerte addiert, Abwesenheiten gezählt, Flexzeitsaldo berechnet.

### 9.3 Schichtplan-Generierung — Jeden Sonntag um 1:00 Uhr

**Was passiert:** Für alle Mitarbeiter mit einem Tarif werden die Tagespläne für die nächsten 14 Tage erzeugt. Manuell geänderte oder als Feiertag markierte Tage werden nicht überschrieben.

### 9.4 Makro-Ausführung — Alle 15 Minuten

**Was passiert:** Programmierte Automatisierungsregeln (Makros) werden geprüft und bei Fälligkeit ausgeführt.

### 9.5 Makros verwalten

⚠️ Berechtigung: „Makros verwalten"

📍 Seitenleiste → **Administration** → **Makros**

✅ Tabelle mit Spalten: Name, Typ (Badge: Wöchentlich/Monatlich), Aktionstyp (Badge), Aktiv (Schalter), Zuweisungen (Anzahl).

#### Neuen Makro anlegen

1. 📍 **„Neuer Makro"** (oben rechts)
2. Ausfüllen:
   - **Name** (Pflicht), Beschreibung
   - **Makrotyp**: Wöchentlich oder Monatlich
   - **Aktionstyp**: Protokollnachricht / Sollstunden neu berechnen / Flexzeit zurücksetzen / Saldo vortragen
   - **Aktionsparameter** (JSON, optional)
   - **Aktiv** (Schalter)
3. 📍 „Speichern"

#### Makro-Detail und Zuweisungen

1. 📍 Zeile anklicken → Detailseite öffnet sich
2. ✅ Kopfbereich: Name, Typ-Badge, Aktionstyp-Badge, Status. Buttons: „Jetzt ausführen" (▶), Bearbeiten, Löschen
3. **Tab „Zuweisungen"**: Liste der Zuweisungen. Jede Zuweisung ordnet den Makro einem Tarif oder Mitarbeiter zu und hat einen Ausführungstag.
   - 📍 **„Zuweisung hinzufügen"** → Tarif oder Mitarbeiter wählen, Ausführungstag festlegen
4. **Tab „Ausführungen"**: Protokoll aller bisherigen Ausführungen

> **Beispiel:** Ein monatlicher Makro „Flexzeit zurücksetzen" ist dem Tarif „Minijob" zugewiesen und läuft am 1. jeden Monats. Alle Minijob-Mitarbeiter starten jeden Monat mit Flexzeitkonto Null.

### 9.6 Zeitpläne (technische Automatisierung)

⚠️ Berechtigung: „Zeitpläne verwalten"

📍 Seitenleiste → **Administration** → **Zeitpläne**

✅ Tabelle mit Spalten: Name, Zeitplantyp (Badge), Aktiviert (Schalter), Aufgaben (Anzahl), Letzte Ausführung.

#### Zeitplan-Detail

1. 📍 Zeile anklicken → Detailseite
2. **Tab „Aufgaben"**: Sortierte Liste der Aufgaben (mit Ziehgriff zum Umsortieren). Jede Aufgabe hat einen Typ: Tage berechnen / Monate berechnen / Datenbank sichern / Benachrichtigungen senden / Daten exportieren / Alive-Check / Makros ausführen / Tagespläne generieren
3. **Tab „Ausführungen"**: Ausführungsprotokoll
4. Buttons: „Jetzt ausführen" (▶), Bearbeiten, Löschen

### 9.7 Systemeinstellungen

⚠️ Berechtigung: „Einstellungen verwalten"

📍 Seitenleiste → **Administration** → **Einstellungen**

✅ Seite mit 5 aufklappbaren Kartenabschnitten:

| Abschnitt | Einstellungen |
|-----------|--------------|
| **Berechnung** | Rundung relativ zum Plan (Schalter), Fehlerliste aktiviert (Schalter), Verfolgte Fehlercodes (Tag-Eingabe) |
| **Aufträge** | Auftragsbuchungen automatisch ausfüllen, Folgebuchungen aktiviert |
| **Geburtstag** | Tage vorher/nachher (Zahleneingabe) |
| **Proxy** | Proxy aktiviert, Host, Port, Benutzername, Passwort |
| **Server-Überwachung** | Alive-Check aktiviert, Erwartete Abschlusszeit, Schwellenwert, Admins benachrichtigen |

📍 Einstellungen anpassen → **„Einstellungen speichern"** (unten)

**Bereinigungswerkzeuge** (unterhalb der Einstellungen):

⚠️ Destruktive Operationen mit 3-Schritt-Bestätigung (Vorschau → Ausführen → Bestätigungsphrase eintippen)

Vier Bereinigungsaktionen: Buchungen löschen, Buchungsdaten löschen, Buchungen neu einlesen, Aufträge markieren und löschen.

---

## 10. Aufträge & Projektzeiterfassung

### 10.1 Aufträge verwalten

⚠️ Berechtigung: „Aufträge verwalten"

📍 Seitenleiste → **Verwaltung** → **Aufträge**

✅ Seite mit zwei Tabs: **Aufträge** und **Aktivitäten**

#### Tab „Aufträge"

Tabelle mit Spalten: Code, Name, Status (Badge), Kunde, Gültig ab, Gültig bis.

**Filter:** Suchfeld (nach Code, Name, Kunde)

##### Neuen Auftrag anlegen

1. 📍 Tab „Aufträge" → **„Neuer Auftrag"** (oben rechts)
2. Ausfüllen:
   - **Code** (Pflicht, Großbuchstaben), **Name** (Pflicht), Beschreibung
   - **Status** (Geplant / Aktiv / Abgeschlossen / Storniert)
   - **Kunde**, **Kostenstelle** (Dropdown)
   - **Stundensatz** (Zahl mit Dezimalstellen)
   - **Gültig ab / bis** (Datum)
3. 📍 „Speichern"

#### Auftragsdetails

📍 Zeile anklicken → Detailseite mit 3 Tabs:

**Tab „Details":** Basisinformationen, Gültigkeitszeitraum, Abrechnung (Stundensatz, Kostenstelle)

**Tab „Zuweisungen":** Welche Mitarbeiter auf diesen Auftrag buchen dürfen
1. 📍 **„Neue Zuweisung"** → Mitarbeiter wählen, Rolle (Mitarbeiter/Leiter/Vertrieb), Gültigkeitszeitraum
2. 📍 „Speichern"

**Tab „Buchungen":** Zeitbuchungen auf diesen Auftrag
1. 📍 **„Neue Buchung"** → Mitarbeiter, Aktivität, Datum, Stunden + Minuten, Beschreibung
2. 📍 „Speichern"
3. ✅ Tabelle zeigt: Datum, Mitarbeiter, Aktivität, Zeit (h:mm), Beschreibung, Quelle (Badge: Manuell/Auto/Import)

#### Tab „Aktivitäten"

📍 Tab „Aktivitäten" in der Auftragsseite

✅ Tabelle mit Spalten: Code, Name, Beschreibung, Status.

1. 📍 **„Neue Aktivität"** (oben rechts, wechselt automatisch je nach aktivem Tab)
2. Code (Pflicht, Großbuchstaben), Name (Pflicht), Beschreibung
3. 📍 „Speichern"

### 10.2 Wer auf welche Aufträge buchen kann

Die Zuordnung erfolgt über Auftragszuweisungen (Tab „Zuweisungen" in der Auftragsdetailseite). Jede Zuweisung hat:
- Den Mitarbeiter
- Eine Rolle: Mitarbeiter, Leiter oder Vertrieb
- Optional einen Gültigkeitszeitraum

Zusätzlich kann jedem Mitarbeiter ein **Standardauftrag** und eine **Standardaktivität** zugeordnet werden (im Mitarbeiterstamm).

#### 10.1.1 Praxisbeispiel: Auftrag anlegen und Zeiten erfassen

Szenario: Ein Wartungsauftrag für den Kunden „Muster GmbH" — 3 Mitarbeiter sind zugewiesen, die Arbeiten umfassen Montage und Dokumentation.

##### Schritt 1 — Auftrag anlegen

📍 Seitenleiste → Verwaltung → **Aufträge** → Tab **„Aufträge"** → **„Neuer Auftrag"**

- Code: `A-2026-001`
- Name: `Wartung Muster GmbH Q1`
- Beschreibung: `Quartalswartung Produktionsanlage`
- Status: **Aktiv**
- Kunde: `Muster GmbH`
- Kostenstelle: die passende Kostenstelle wählen
- Stundensatz: `85,00`
- Gültig ab: `01.01.2026`
- Gültig bis: `31.03.2026`

📍 „Speichern"

✅ Der Auftrag erscheint in der Tabelle mit Status „Aktiv" (grün).

##### Schritt 2 — Aktivitäten anlegen

📍 Seitenleiste → Verwaltung → **Aufträge** → Tab **„Aktivitäten"** → **„Neue Aktivität"**

**Aktivität 1:**
- Code: `MONTAGE`
- Name: `Montage`
- Beschreibung: `Montage- und Installationsarbeiten`

📍 „Speichern"

**Aktivität 2:**
- Code: `DOKU`
- Name: `Dokumentation`
- Beschreibung: `Protokolle und Berichte erstellen`

📍 „Speichern"

✅ Beide Aktivitäten erscheinen in der Aktivitätentabelle.

##### Schritt 3 — Mitarbeiter dem Auftrag zuweisen

📍 Tab **„Aufträge"** → Auftrag `A-2026-001` anklicken → Detailseite → Tab **„Zuweisungen"**

Drei Mitarbeiter zuweisen:

1. 📍 **„Neue Zuweisung"**
   - Mitarbeiter: `Schmidt, Thomas`
   - Rolle: **Leiter**
   - Gültig ab: `01.01.2026`
   - 📍 „Speichern"

2. 📍 **„Neue Zuweisung"**
   - Mitarbeiter: `Weber, Lisa`
   - Rolle: **Mitarbeiter**
   - Gültig ab: `01.01.2026`
   - 📍 „Speichern"

3. 📍 **„Neue Zuweisung"**
   - Mitarbeiter: `Fischer, Jan`
   - Rolle: **Mitarbeiter**
   - Gültig ab: `01.01.2026`
   - 📍 „Speichern"

✅ Alle drei Mitarbeiter erscheinen im Tab „Zuweisungen" mit ihren Rollen.

##### Schritt 4 — Als Mitarbeiter: Zeit auf den Auftrag buchen

📍 Auftrag `A-2026-001` → Detailseite → Tab **„Buchungen"** → **„Neue Buchung"**

- Mitarbeiter: `Schmidt, Thomas`
- Aktivität: `MONTAGE` (Montage)
- Datum: `15.01.2026`
- Stunden: `4`, Minuten: `00`
- Beschreibung: `Hauptventil getauscht, Dichtungen erneuert`

📍 „Speichern"

✅ Die Buchung erscheint in der Tabelle: Datum 15.01.2026, Mitarbeiter Schmidt, Aktivität Montage, Zeit 4:00, Quelle „Manuell" (Badge).

💡 **Hinweis:** Weitere Buchungen für die anderen Mitarbeiter und Aktivitäten auf die gleiche Weise anlegen. Beispiel: Weber bucht 2 Stunden „Dokumentation", Fischer bucht 6 Stunden „Montage".

##### Schritt 5 — Als Manager: Auftragsbuchungen auswerten

📍 Seitenleiste → Verwaltung → **Aufträge** → Auftrag `A-2026-001` anklicken → Tab **„Buchungen"**

✅ Die Buchungstabelle zeigt alle erfassten Zeiten. Nutzen Sie die Filteroptionen, um nach Mitarbeiter oder Aktivität zu filtern.

Für eine übergreifende Auswertung:
📍 Seitenleiste → Verwaltung → **Auswertungen** → Tab **„Tageswerte"** → nach Mitarbeiter und Datumsbereich filtern

✅ Hier sehen Sie die gebuchten Stunden pro Auftrag und Aktivität:

| Mitarbeiter | Aktivität | Stunden |
|-------------|-----------|---------|
| Schmidt, Thomas | Montage | 4:00 |
| Weber, Lisa | Dokumentation | 2:00 |
| Fischer, Jan | Montage | 6:00 |
| **Gesamt** | | **12:00** |

##### Schritt 6 — Auftrag öffnen und Gesamtstunden prüfen

📍 Seitenleiste → Verwaltung → **Aufträge** → Auftrag `A-2026-001` anklicken → Tab **„Details"**

✅ Im Abschnitt „Abrechnung" sehen Sie:
- Stundensatz: 85,00 €
- Gebuchte Gesamtstunden: 12:00
- Die Buchungen verteilen sich auf 2 Aktivitäten (Montage: 10:00, Dokumentation: 2:00) und 3 Mitarbeiter

💡 **Hinweis:** Um die gebuchten Stunden automatisch aus den Stempelbuchungen zu übernehmen (statt manueller Eingabe), aktivieren Sie die Einstellung „Auftragsbuchungen automatisch ausfüllen" unter 📍 Administration → Einstellungen → Abschnitt „Aufträge".

---

## 11. Zutrittskontrolle

⚠️ Berechtigung: „Zutrittskontrolle verwalten"

📍 Seitenleiste → **Administration** → **Zutrittskontrolle**

✅ Seite mit drei Tabs: **Zonen**, **Profile**, **Zuweisungen**

### 11.1 Zugangszonen

📍 Tab **„Zonen"**

Tabelle mit Spalten: Code, Name, Sortierung, Status (Badge).

#### Neue Zone anlegen

1. 📍 **„Neue Zone"** (oben links)
2. Code (Pflicht), Name (Pflicht), Beschreibung, Sortierung
3. 📍 „Erstellen"

### 11.2 Zugangsprofile

📍 Tab **„Profile"**

Tabelle mit Spalten: Code, Name, Status (Badge).

Ein Profil bündelt den Zugang zu mehreren Zonen (z. B. Profil „Verwaltung" = Haupteingang + Büroetage).

1. 📍 **„Neues Profil"** → Code, Name, Beschreibung
2. 📍 „Erstellen"

### 11.3 Mitarbeiter-Zuweisungen

📍 Tab **„Zuweisungen"**

Tabelle mit Spalten: Mitarbeiter, Profil, Gültig ab, Gültig bis, Status (Badge).

**Filter:** Suchfeld, Profilfilter (Dropdown)

1. 📍 **„Neue Zuweisung"** → Mitarbeiter (Dropdown), Profil (Dropdown), Gültig ab/bis (Datum), Aktiv (Schalter)
2. 📍 „Speichern"

### 11.4 RFID-Karten (Zutrittskarten)

Zutrittskarten werden beim einzelnen Mitarbeiter verwaltet:

📍 Seitenleiste → Verwaltung → **Mitarbeiter** → Mitarbeiter anklicken → Tab **„Übersicht"** → Karte „Zutrittskarten"

✅ Liste der Karten mit: Kartennummer, Kartentyp (Badge: RFID/Barcode/PIN), Gültigkeit, Status (Aktiv/Inaktiv/Abgelaufen)

Neue Karten und Deaktivierung erfolgen über die Profil-Seite des Mitarbeiters.

### 11.5 Terminal-Buchungen

⚠️ Berechtigung: „Terminal-Buchungen verwalten"

📍 Seitenleiste → **Administration** → **Terminal-Buchungen**

✅ Seite mit zwei Tabs: **Buchungen** und **Import-Batches**

#### Tab „Buchungen"

**Filter:** Datum von/bis, Terminal-ID, Mitarbeiter, Status (Alle/Ausstehend/Verarbeitet/Fehlgeschlagen/Übersprungen), Batch-ID

Tabelle (nur Lesezugriff): Zeitstempel, Mitarbeiter-PIN, Terminal-ID, Buchungscode, Status (farbiges Badge), Mitarbeitername, Fehler

#### Tab „Import-Batches" — Terminaldaten importieren

1. 📍 Tab „Import-Batches" → **„Import auslösen"** (Upload-Symbol)
2. Im Dialog:
   - **Batch-Referenz** (Pflicht, eindeutige Kennung)
   - **Terminal-ID** (Pflicht)
   - **Buchungsdaten** (Pflicht, Textfeld — eine Zeile pro Buchung im Format: `PIN,Zeitstempel,Buchungscode`)
3. 📍 „Importieren"
4. ✅ Ergebnis wird angezeigt: Gesamt / Importiert (grün) / Fehlgeschlagen (rot)

> **Beispiel für Import-Daten:**
> ```
> 1234,2026-03-10T08:00:00,A1
> 1234,2026-03-10T12:00:00,P1
> 1234,2026-03-10T12:30:00,P2
> 1234,2026-03-10T16:30:00,A2
> ```

Tabelle (nur Lesezugriff): Batch-Referenz, Quelle, Terminal-ID, Status (Badge), Gesamt, Importiert, Fehlgeschlagen, Gestartet, Abgeschlossen

### 11.6 Wie der Import funktioniert

1. Das System prüft die Batch-Referenz auf Duplikate (Schutz vor Doppelimport)
2. Alle PINs werden den Mitarbeitern zugeordnet (unbekannte PINs → Fehler)
3. Alle Buchungscodes werden den Buchungstypen zugeordnet
4. Die Buchungen werden gespeichert und können dann weiterverarbeitet werden

Pro Import können bis zu 5.000 Buchungen verarbeitet werden.

---

## 12. Glossar

| Begriff | Erklärung | Wo in Terp |
|---------|-----------|-----------|
| **Abwesenheit** | Eintrag für einen Tag, an dem nicht gearbeitet wird (Urlaub, Krankheit usw.) | 📍 Abwesenheiten |
| **Abwesenheitstyp** | Kategorie einer Abwesenheit mit Regeln (Urlaubsabzug, Genehmigung) | 📍 Verwaltung → Abwesenheitsarten |
| **Aktivität** | Art der Arbeit innerhalb eines Auftrags (z. B. Montage, Dokumentation) | 📍 Verwaltung → Aufträge → Tab Aktivitäten |
| **Auftrag** | Projekt oder Kundenauftrag für die Projektzeiterfassung | 📍 Verwaltung → Aufträge |
| **Auftragsbuchung** | Zeitbuchung eines Mitarbeiters auf einen Auftrag | 📍 Auftragsdetail → Tab Buchungen |
| **Berechtigungsgruppe** | Sammlung von Berechtigungen, die einem Benutzer zugewiesen wird | 📍 Administration → Benutzergruppen |
| **Bruttoarbeitszeit** | Gesamte Zeit zwischen Kommen und Gehen, inklusive Pausen | 📍 Zeitnachweis → Tageszusammenfassung |
| **Buchung** | Einzelner Stempeleintrag (Kommen, Gehen, Pause) | 📍 Zeitnachweis → Tagesansicht |
| **Buchungstyp** | Bedeutung einer Buchung: Richtung (Ein/Aus) und Kategorie | 📍 Verwaltung → Buchungstypen |
| **Datensichtbereich** | Beschränkung, welche Mitarbeiter ein Benutzer sehen darf | 📍 Administration → Benutzer → Bearbeiten → Datensichtbereich |
| **Fehlzeit** | Differenz Soll − Netto, wenn weniger gearbeitet wurde | 📍 Zeitnachweis / Monatsauswertung |
| **Feiertagsgutschrift** | Stunden, die an einem Feiertag automatisch gutgeschrieben werden | 📍 Tagesplan → Tab Spezial → Feiertagsgutschriften |
| **Flexzeitsaldo** | Laufendes Konto für Plus-/Minusstunden | 📍 Dashboard (Karte) / Monatsauswertung |
| **Kappung** | Abschneiden von Arbeitszeit außerhalb des erlaubten Fensters | Konfiguriert im Tagesplan, Tab Zeitfenster |
| **Kernzeit** | Pflichtzeitraum bei Gleitzeit | 📍 Tagesplan → Tab Zeitfenster → Kernzeit |
| **Konto** | Sammelstelle für Zeitwerte (Flex, Überstunden, Zuschläge) | 📍 Verwaltung → Konten |
| **Korrektur** | Manuelle Anpassung an Zeitwerten eines Tages | 📍 Verwaltung → Korrekturassistent |
| **Kostenstelle** | Betriebswirtschaftliche Zuordnung für Mitarbeiter und Aufträge | 📍 Verwaltung → Kostenstellen |
| **Makro** | Automatisierungsregel (z. B. Flexzeit zurücksetzen) | 📍 Administration → Makros |
| **Mandant** | Oberste Organisationseinheit (Unternehmen/Niederlassung) | 📍 Administration → Mandanten |
| **Monatsabschluss** | Einfrieren der Monatswerte — danach keine Änderungen mehr | 📍 Monatsauswertung → „Monat abschließen" |
| **Monatswert** | Aggregierte Arbeitszeitwerte eines Mitarbeiters für einen Monat | 📍 Verwaltung → Monatswerte |
| **Nettoarbeitszeit** | Anrechenbare Arbeitszeit: Brutto minus Pausen | 📍 Zeitnachweis → Tageszusammenfassung |
| **Personalnummer** | Eindeutige Kennung je Mitarbeiter im Mandanten | 📍 Verwaltung → Mitarbeiter |
| **PIN** | Persönliche Identifikationsnummer für das Terminal | Wird bei Mitarbeiteranlage automatisch vergeben |
| **RFID-Karte** | Zutrittskarte mit Funkchip | 📍 Mitarbeiterdetail → Zutrittskarten |
| **Rundung** | Automatisches Auf-/Abrunden von Stempelzeiten | 📍 Tagesplan → Tab Rundung |
| **Schicht** | Benanntes Arbeitszeitpaket mit Farbe und Tagesplan | 📍 Verwaltung → Schichtplanung → Tab Schichten |
| **Schichterkennung** | Automatische Schichtzuordnung anhand der Stempelzeiten | Konfiguriert im Tagesplan, Tab Spezial |
| **Sollarbeitszeit** | Geplante Arbeitszeit laut Tagesplan | 📍 Zeitnachweis → Tagessollzeit |
| **Standort** | Physischer Arbeitsort mit Adresse und Zeitzone | 📍 Verwaltung → Standorte |
| **Tagesplan** | Arbeitszeitregeln für einen Tag (Fenster, Soll, Pausen, Toleranzen) | 📍 Verwaltung → Tagespläne |
| **Tageswert** | Berechnetes Ergebnis eines Arbeitstages | 📍 Zeitnachweis → Tagesansicht |
| **Tarif** | Vollständiges Arbeitszeitmodell (Rhythmus + Urlaub + Flexzeit) | 📍 Verwaltung → Tarife |
| **Toleranz** | Minutenpuffer für Stempelabweichungen | 📍 Tagesplan → Tab Toleranz |
| **Überstunden** | Differenz Netto − Soll, wenn mehr gearbeitet wurde | 📍 Zeitnachweis / Monatsauswertung |
| **Übertragungsart** | Wie das Flexzeitsaldo am Monatsende verarbeitet wird | 📍 Tarif → Tab Flexzeit → Übertragungsart |
| **Urlaubsabzug** | Faktor, mit dem ein Abwesenheitstag vom Urlaubskonto abzieht | 📍 Tagesplan → Tab Spezial → Urlaubsabzug |
| **Urlaubskonto** | Jahresguthaben: Anspruch + Übertrag + Anpassungen − Genommen | 📍 Urlaub / Verwaltung → Urlaubskonten |
| **Urlaubskappung** | Begrenzung des Resturlaubsübertrags ins nächste Jahr | 📍 Verwaltung → Urlaubskonfiguration → Tab Kappungsregeln |
| **Wochenplan** | Zuordnung von 7 Tagesplänen zu einer Woche | 📍 Verwaltung → Wochenpläne |
| **Zugangsprofil** | Berechtigungsgruppe für physischen Zutritt (bündelt Zonen) | 📍 Administration → Zutrittskontrolle → Tab Profile |
| **Zugangszone** | Physischer Bereich mit gesteuertem Zutritt | 📍 Administration → Zutrittskontrolle → Tab Zonen |
| **Zuschlag** | Bonus für Arbeit in bestimmten Zeitfenstern (z. B. Nachtarbeit) | Konfiguriert im Tagesplan, Detailansicht → Zuschläge |

---

## Anhang: Seitenübersicht für Entwickler

Diese Tabelle listet alle Seiten der Anwendung mit ihrer URL und dem Menüpfad:

| URL | Menüpfad | Berechtigung |
|-----|----------|-------------|
| `/dashboard` | Hauptmenü → Dashboard | — |
| `/team-overview` | Hauptmenü → Teamübersicht | — |
| `/time-clock` | Hauptmenü → Stempeluhr | — |
| `/timesheet` | Hauptmenü → Zeitnachweis | — |
| `/absences` | Hauptmenü → Abwesenheiten | — |
| `/vacation` | Hauptmenü → Urlaub | — |
| `/monthly-evaluation` | Hauptmenü → Monatsauswertung | — |
| `/year-overview` | Hauptmenü → Jahresübersicht | — |
| `/profile` | Benutzermenü (Avatar) → Profil | — |
| `/notifications` | Glocke (🔔) in der Kopfzeile | — |
| `/admin/approvals` | Verwaltung → Genehmigungen | absences.approve |
| `/admin/employees` | Verwaltung → Mitarbeiter | employees.view |
| `/admin/employees/[id]` | Mitarbeiterliste → Zeile anklicken | employees.view |
| `/admin/teams` | Verwaltung → Teams | teams.manage |
| `/admin/departments` | Verwaltung → Abteilungen | departments.manage |
| `/admin/cost-centers` | Verwaltung → Kostenstellen | departments.manage |
| `/admin/locations` | Verwaltung → Standorte | locations.manage |
| `/admin/employment-types` | Verwaltung → Beschäftigungsarten | employees.view |
| `/admin/day-plans` | Verwaltung → Tagespläne | day_plans.manage |
| `/admin/week-plans` | Verwaltung → Wochenpläne | week_plans.manage |
| `/admin/tariffs` | Verwaltung → Tarife | tariffs.manage |
| `/admin/holidays` | Verwaltung → Feiertage | holidays.manage |
| `/admin/absence-types` | Verwaltung → Abwesenheitsarten | absence_types.manage |
| `/admin/booking-types` | Verwaltung → Buchungstypen | booking_types.manage |
| `/admin/contact-types` | Verwaltung → Kontaktarten | contact_management.manage |
| `/admin/calculation-rules` | Verwaltung → Berechnungsregeln | absence_types.manage |
| `/admin/accounts` | Verwaltung → Konten | accounts.manage |
| `/admin/correction-assistant` | Verwaltung → Korrekturassistent | corrections.manage |
| `/admin/evaluations` | Verwaltung → Auswertungen | reports.view |
| `/admin/monthly-values` | Verwaltung → Monatswerte | reports.view |
| `/admin/vacation-balances` | Verwaltung → Urlaubskonten | absences.manage |
| `/admin/vacation-config` | Verwaltung → Urlaubskonfiguration | absence_types.manage |
| `/admin/shift-planning` | Verwaltung → Schichtplanung | shift_planning.manage |
| `/admin/orders` | Verwaltung → Aufträge | orders.manage |
| `/admin/orders/[id]` | Auftragsliste → Zeile anklicken | orders.manage |
| `/admin/employee-messages` | Verwaltung → Mitarbeiternachrichten | notifications.manage |
| `/admin/users` | Administration → Benutzer | users.manage |
| `/admin/user-groups` | Administration → Benutzergruppen | users.manage |
| `/admin/reports` | Administration → Berichte | reports.view |
| `/admin/audit-logs` | Administration → Audit-Protokoll | users.manage |
| `/admin/settings` | Administration → Einstellungen | settings.manage |
| `/admin/tenants` | Administration → Mandanten | tenants.manage |
| `/admin/payroll-exports` | Administration → Lohnexporte | payroll.view |
| `/admin/export-interfaces` | Administration → Exportschnittstellen | payroll.manage |
| `/admin/monthly-evaluations` | Administration → Auswertungsvorlagen | monthly_evaluations.manage |
| `/admin/schedules` | Administration → Zeitpläne | schedules.manage |
| `/admin/schedules/[id]` | Zeitplanliste → Zeile anklicken | schedules.manage |
| `/admin/macros` | Administration → Makros | macros.manage |
| `/admin/macros/[id]` | Makroliste → Zeile anklicken | macros.manage |
| `/admin/access-control` | Administration → Zutrittskontrolle | access_control.manage |
| `/admin/terminal-bookings` | Administration → Terminal-Buchungen | terminal_bookings.manage |

---

*Terp — Digitale Zeiterfassung und Personalverwaltung für deutsche Unternehmen.*
