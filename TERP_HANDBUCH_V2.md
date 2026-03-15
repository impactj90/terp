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

**Was ist es?** Ein Mandant ist die oberste Organisationseinheit in Terp — typischerweise ein Unternehmen, eine Niederlassung oder ein Standort. Alle Daten (Mitarbeiter, Abteilungen, Tarife, Buchungen) gehören zu genau einem Mandanten und sind von anderen Mandanten vollständig getrennt.

**Wozu dient es?** Dienstleister, Steuerberater oder Unternehmensgruppen können mehrere Firmen in einer einzigen Terp-Installation verwalten, ohne dass sich die Daten vermischen. Jeder Mandant hat eigene Einstellungen, eigene Mitarbeiter und eigene Exporte.

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

#### Praxisbeispiel

Ein Steuerberater betreut zwei Unternehmen — „Müller Bau GmbH" und „Weber Logistik KG":

1. 📍 Administration → Mandanten → **„Neuer Mandant"** → Name: `Müller Bau GmbH`, Ort: `München`, Land: `Deutschland`, Urlaubsbasis: **Kalenderjahr** → 📍 „Erstellen"
2. 📍 **„Neuer Mandant"** → Name: `Weber Logistik KG`, Ort: `Hamburg`, Land: `Deutschland`, Urlaubsbasis: **Eintrittsdatum** → 📍 „Erstellen"
3. In der Kopfzeile erscheint der **Mandanten-Umschalter** — der Steuerberater kann zwischen beiden Unternehmen wechseln, ohne sich ab- und wieder anzumelden.

💡 **Hinweis:** Die meisten Unternehmen benötigen nur einen Mandanten. Ein zweiter Mandant ist nur dann sinnvoll, wenn zwei vollständig getrennte Firmen oder Niederlassungen mit eigenen Mitarbeiterstämmen verwaltet werden sollen. Unterschiedliche Abteilungen oder Standorte innerhalb eines Unternehmens bilden Sie besser über Abteilungen und Standorte ab.

### 4.2 Abteilungen

**Was ist es?** Eine Abteilung ist eine organisatorische Einheit innerhalb eines Mandanten — z. B. „Produktion", „Verwaltung", „Vertrieb". Abteilungen können hierarchisch verschachtelt werden (z. B. „Produktion" → „Montage" → „Endmontage").

**Wozu dient es?** Abteilungen strukturieren die Mitarbeiterverwaltung: Manager sehen nur Mitarbeiter ihrer Abteilung (via Datensichtbereich), Berichte können nach Abteilung gefiltert werden, und Feiertage können auf einzelne Abteilungen beschränkt werden. Ohne Abteilungen fehlt die organisatorische Gliederung für alle Listen und Auswertungen.

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

#### Praxisbeispiel

Ein Produktionsbetrieb hat drei Ebenen:

1. 📍 Verwaltung → Abteilungen → **„Neue Abteilung"** → Code: `PROD`, Name: `Produktion` → 📍 „Abteilung erstellen"
2. 📍 Baumansicht → `PROD` → ⋯ → **„Unterabteilung anlegen"** → Code: `MONTAGE`, Name: `Montage`, Übergeordnete Abteilung: `Produktion` → 📍 „Abteilung erstellen"
3. 📍 Baumansicht → `MONTAGE` → ⋯ → **„Unterabteilung anlegen"** → Code: `ENDMONT`, Name: `Endmontage` → 📍 „Abteilung erstellen"

✅ In der Baumansicht sehen Sie: Produktion → Montage → Endmontage. Ein Teamleiter mit Datensichtbereich „Abteilung: Produktion" sieht automatisch alle Mitarbeiter der Produktion einschließlich Montage und Endmontage.

💡 **Hinweis:** Abteilungen sind für die meisten Unternehmen ab ca. 10 Mitarbeitern empfehlenswert. Kleine Betriebe ohne Abteilungsstruktur können diesen Schritt überspringen — alle Mitarbeiter erscheinen dann in einer einzigen Liste.

### 4.3 Standorte

**Was ist es?** Ein Standort ist ein physischer Arbeitsort mit Adresse und Zeitzone — z. B. ein Bürogebäude, ein Werk oder eine Filiale.

**Wozu dient es?** Standorte dienen der organisatorischen Zuordnung von Mitarbeitern zu physischen Arbeitsorten. Mitarbeiterlisten und Berichte können nach Standort gefiltert werden.

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

#### Praxisbeispiel

Ein Unternehmen hat zwei Standorte in Deutschland und Österreich:

1. 📍 Verwaltung → Standorte → **„Neuer Standort"** → Code: `MUC`, Name: `München`, Stadt: `München`, Land: `Deutschland`, Zeitzone: `Europe/Berlin` → 📍 „Erstellen"
2. 📍 **„Neuer Standort"** → Code: `VIE`, Name: `Wien`, Stadt: `Wien`, Land: `Österreich`, Zeitzone: `Europe/Vienna` → 📍 „Erstellen"

### 4.4 Kostenstellen

**Was ist es?** Eine Kostenstelle ist eine betriebswirtschaftliche Zuordnung, die festlegt, welchem Kostenbereich ein Mitarbeiter oder ein Auftrag zugerechnet wird. In der Buchhaltung dient sie dazu, Personalkosten und Auftragsstunden den richtigen Unternehmensbereichen zuzuordnen.

**Wozu dient es?** Ohne Kostenstellen müssten Personalkosten im Lohnexport manuell aufgeteilt werden. Terp ordnet jedem Mitarbeiter und jedem Auftrag eine Kostenstelle zu, sodass der DATEV-Export automatisch die richtige Kostenstellennummer pro Zeile enthält. Der Steuerberater kann die Daten dann direkt importieren, ohne nachzuarbeiten.

⚠️ Berechtigung: „Abteilungen verwalten"

📍 Seitenleiste → **Verwaltung** → **Kostenstellen**

✅ Tabelle mit Spalten: Code, Name, Beschreibung, Status.

#### Neue Kostenstelle anlegen

1. 📍 Seitenleiste → Verwaltung → Kostenstellen → **„Neue Kostenstelle"** (oben rechts)
2. **Code** (Pflicht, Großbuchstaben) und **Name** (Pflicht) eingeben
3. 📍 „Erstellen"

#### Wo Kostenstellen außerdem erscheinen

| Ort | Pfad | Was angezeigt wird |
|-----|------|--------------------|
| Mitarbeiter anlegen/bearbeiten | 📍 Verwaltung → Mitarbeiter → Neuer Mitarbeiter / Bearbeiten | Dropdown „Kostenstelle" im Abschnitt „Beschäftigung" |
| Mitarbeiterdetails | 📍 Verwaltung → Mitarbeiter → Zeile anklicken | Anzeige im Abschnitt „Beschäftigungsdetails" |
| Eigenes Profil | 📍 Benutzermenü → Profil | Anzeige in der Karte „Beschäftigungsdetails" |
| Auftrag anlegen/bearbeiten | 📍 Verwaltung → Aufträge → Neuer Auftrag / Bearbeiten | Dropdown „Kostenstelle" im Formular |
| Auftragsdetails | 📍 Verwaltung → Aufträge → Zeile anklicken → Tab „Details" | Anzeige im Abschnitt „Abrechnung" |
| Lohnexport-Vorschau | 📍 Administration → Lohnexporte → ⋯ → Vorschau | Spalte „Kostenstelle" pro Mitarbeiter |
| Berichte generieren | 📍 Administration → Berichte → Bericht erstellen | Multi-Auswahl-Filter „Kostenstellen" |
| Audit-Protokoll | 📍 Administration → Audit-Protokoll | Entitätstyp „Kostenstelle" im Filter |

#### Praxisbeispiel

Ein Handwerksbetrieb hat drei Bereiche: Werkstatt, Verwaltung und Vertrieb. Für jeden Bereich wird eine Kostenstelle angelegt:

1. 📍 Seitenleiste → Verwaltung → **Kostenstellen** → **„Neue Kostenstelle"**
   - Code: `KST-100`, Name: `Werkstatt` → 📍 „Erstellen"
   - Code: `KST-200`, Name: `Verwaltung` → 📍 „Erstellen"
   - Code: `KST-300`, Name: `Vertrieb` → 📍 „Erstellen"

2. 📍 Seitenleiste → Verwaltung → **Mitarbeiter** → Mitarbeiter „Meier" bearbeiten → Kostenstelle: `Werkstatt (KST-100)` → „Änderungen speichern"

3. Am Monatsende zeigt der Lohnexport (📍 Administration → Lohnexporte → Vorschau) automatisch die Spalte `KST-100` neben Meiers Zeile. Der Steuerberater erkennt sofort, dass die Kosten der Werkstatt zuzurechnen sind.

💡 **Hinweis:** Kostenstellen sind optional. Kleine Unternehmen mit nur einem Kostenbereich können diesen Schritt überspringen — der Lohnexport funktioniert auch ohne Kostenstellen-Zuordnung. Für die Buchhaltung wird die Zuordnung aber empfohlen, sobald mehr als ein Bereich existiert.

### 4.5 Teams

**Was ist es?** Ein Team ist eine organisatorische Arbeitsgruppe innerhalb einer Abteilung. Jedes Team hat einen Teamleiter und beliebig viele Mitglieder. Ein Mitarbeiter kann mehreren Teams angehören.

**Wozu dient es?** Teams ergänzen die Abteilungsstruktur um eine feinere Gliederung. In der Teamübersicht (📍 Teamübersicht) sehen Teammitglieder und Teamleiter auf einen Blick, wer anwesend ist und wer fehlt. Auf der Genehmigungsseite kann nach Team gefiltert werden, um die Anträge der eigenen Teammitglieder gezielt zu sehen.

**Sichtbarkeit:** Nicht-Admin-Benutzer sehen in der Teamübersicht und im Team-Filter der Genehmigungsseite nur Teams, in denen sie **Mitglied** oder **Teamleiter** sind. Administratoren sehen alle Teams.

⚠️ Berechtigung: „Teams verwalten" (für Teamverwaltung unter Administration). Die Teamübersicht (📍 Teamübersicht) und der Team-Filter auf der Genehmigungsseite benötigen keine besondere Berechtigung — dort werden automatisch nur die eigenen Teams angezeigt.

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

#### Praxisbeispiel

Die Abteilung „Produktion" hat ein Montageteam:

1. 📍 Verwaltung → Teams → **„Neues Team"** → Name: `Montageteam`, Abteilung: `Produktion`, Teamleiter: `Schmidt, Thomas` → 📍 „Team erstellen"
2. 📍 ⋯ → **„Mitglieder verwalten"** → „Weber, Lisa" hinzufügen → „Fischer, Jan" hinzufügen
3. ✅ In der Teamübersicht (📍 Teamübersicht) sieht der Teamleiter Schmidt den Anwesenheitsstatus von Weber und Fischer. Andere Benutzer, die nicht Mitglied dieses Teams sind, sehen es nicht in ihrer Teamübersicht.

💡 **Hinweis:** Teams sind organisatorische Gruppierungen und schränken **nicht** die Datensichtbarkeit ein. Ein Teamleiter sieht in der Teamübersicht nur die Teams, denen er zugeordnet ist — aber die generelle Datensichtbarkeit (welche Mitarbeiter in Listen, Exporten usw. erscheinen) wird über den **Datensichtbereich** (siehe Abschnitt 4.2) gesteuert. Teams und Datensichtbereich sind zwei unabhängige Systeme.

### 4.6 Arbeitszeitmodelle einrichten

**Was ist es?** Arbeitszeitmodelle definieren, wann und wie lange ein Mitarbeiter arbeiten soll. Sie bestehen aus drei Bausteinen: **Tagesplan** (Regeln für einen Tag), **Wochenplan** (7 Tagespläne zu einer Woche) und **Tarif** (das Gesamtmodell mit Rhythmus, Urlaub und Flexzeit).

**Wozu dient es?** Ohne Arbeitszeitmodell kann das System keine Soll-/Ist-Vergleiche berechnen, keine Über- oder Fehlzeiten erkennen und keine Tageswerte erzeugen. Das Modell ist die Berechnungsgrundlage für die gesamte Zeiterfassung.

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
2. Das Formular hat **5 Tabs** — jedes Feld wird nachfolgend im Detail erklärt:

---

**Tab „Basis":**

| Feld | Pflicht? | Beschreibung |
|------|----------|--------------|
| **Code** | Ja | Eindeutiger Kurzcode für den Plan (max. 20 Zeichen). Wird nach dem Erstellen gesperrt und kann nicht mehr geändert werden. Die Codes `U`, `K` und `S` sind reserviert (Abwesenheitstypen) und dürfen nicht verwendet werden. |
| **Plantyp** | Ja | Bestimmt das grundlegende Arbeitszeitmodell. Beeinflusst, welche Felder in den anderen Tabs sichtbar sind. |
| **Name** | Ja | Beschreibender Name des Plans, der in Dropdowns und Tabellen angezeigt wird. |
| **Beschreibung** | Nein | Optionaler Freitext für interne Notizen zum Plan. |
| **Sollarbeitszeit** | Ja | Die geplante Nettoarbeitszeit pro Tag im Format HH:MM. Dies ist der Referenzwert für Über-/Unterzeitberechnung. |
| **Abwesenheitsstunden** | Nein | Alternatives Tagessoll, das an Abwesenheitstagen (z. B. genehmigter Urlaub) anstelle der regulären Sollarbeitszeit verwendet wird. |
| **Sollstunden aus Mitarbeiterstamm** | Nein | Wenn aktiviert, wird die Sollarbeitszeit nicht aus dem Tagesplan gelesen, sondern aus dem Feld „Tägliche Sollstunden" im Mitarbeiterstamm. |
| **Aktiv** | — | Inaktive Pläne können nicht mehr neuen Wochenplänen zugewiesen werden, bestehende Zuweisungen bleiben erhalten. |

> **Priorität der Sollzeit:** Mitarbeiterstamm (wenn Checkbox aktiv) → Abwesenheitsstunden (wenn Abwesenheitstag) → Sollarbeitszeit (Standard).

> **Plantyp — Unterschiede:**
>
> | | Feste Arbeitszeit | Gleitzeit |
> |---|---|---|
> | Zeitfenster | Nur „Kommen ab" und „Gehen ab" (ein fester Zeitpunkt je Richtung) | „Kommen ab/bis" und „Gehen ab/bis" (jeweils ein Zeitkorridor) + optionale Kernzeit |
> | Toleranz | Alle 4 Toleranzfelder + Variable Arbeitszeit | Nur „Kommen früh" und „Gehen spät" |
> | Typischer Einsatz | Produktion, Schichtarbeit, feste Bürozeiten | Verwaltung, Büro mit flexiblen Arbeitszeiten |

**Beispiel — Basis-Tab für einen 8-Stunden-Büroplan:**
- Code: `BUERO`
- Plantyp: Feste Arbeitszeit
- Name: `Büro Vollzeit`
- Sollarbeitszeit: `08:00`
- Abwesenheitsstunden: `06:00` (Teilzeitkräfte, die an Abwesenheitstagen nur 6 Stunden gutgeschrieben bekommen)
- Sollstunden aus Mitarbeiterstamm: ☐ (nicht aktiviert)

---

**Tab „Zeitfenster":**

Das Zeitfenster bestimmt, **wann** Arbeitszeit angerechnet wird. Buchungen außerhalb des Fensters werden abgeschnitten (Kappung).

**Fester Plan** — 2 Felder:

| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| **Kommen ab** | Frühester anerkannter Arbeitsbeginn. Stempelt ein Mitarbeiter vor dieser Uhrzeit, wird die Arbeitszeit erst ab hier gezählt. | `08:00` — Stempeln um 07:45 → Arbeitszeit beginnt um 08:00 |
| **Gehen ab** | Frühester anerkannter Feierabend. Wird als Referenzpunkt für die Gehen-Toleranz und die Sollzeit-Prüfung verwendet. | `16:30` — Definiert den geplanten Feierabend |

**Gleitzeitplan** — 4 + 2 Felder:

| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| **Kommen ab** | Frühester anerkannter Arbeitsbeginn (Beginn des Gleitzeitkorridors). | `06:00` |
| **Kommen bis** | Spätester erlaubter Arbeitsbeginn. Kommt ein Mitarbeiter nach dieser Zeit, wird ein Fehler „Zu spät gekommen" erzeugt. | `09:00` |
| **Gehen ab** | Frühester erlaubter Feierabend. Geht ein Mitarbeiter vorher, wird ein Fehler „Zu früh gegangen" erzeugt. | `15:00` |
| **Gehen bis** | Spätester anerkannter Feierabend (Ende des Gleitzeitkorridors). Buchungen danach werden gekappt. | `20:00` |
| **Kernzeitbeginn** | Ab wann der Mitarbeiter **anwesend sein muss** (Pflichtzeitraum). Fehlt er, erscheint der Fehler „Kernzeit Beginn verpasst". | `09:00` |
| **Kernzeitende** | Bis wann der Mitarbeiter **anwesend sein muss**. Geht er vorher, erscheint der Fehler „Kernzeit Ende verpasst". | `15:00` |

**Beide Plantypen** — Arbeitszeitgrenzen:

| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| **Mindestarbeitszeit** | Untergrenze für die Nettoarbeitszeit. Wird sie unterschritten, erscheint eine Warnung. | `04:00` — mindestens 4 Stunden pro Tag |
| **Maximale Nettoarbeitszeit** | Obergrenze (Kappung). Arbeitszeit über diesem Wert wird abgeschnitten und ggf. auf ein Kappungskonto gebucht. | `10:00` — max. 10 Stunden, darüber wird gekappt |

**Beispiel — Gleitzeitfenster:**
- Kommen ab: `06:00`, Kommen bis: `09:30`
- Gehen ab: `15:00`, Gehen bis: `20:00`
- Kernzeit: `09:00` – `15:00`
- → Mitarbeiter darf zwischen 06:00 und 09:30 kommen, muss ab 09:00 da sein, darf frühestens um 15:00 gehen, und Arbeitszeit wird maximal bis 20:00 gezählt.

---

**Tab „Toleranz":**

Toleranzen sind **Minutenpuffer**, die kleine Abweichungen von den geplanten Zeiten automatisch korrigieren. Liegt die tatsächliche Stempelzeit innerhalb des Toleranzfensters, wird sie auf die geplante Zeit „geschnappt" — der Mitarbeiter bekommt weder Über- noch Unterzeit.

**Fester Plan** — 4 Felder + 1 Checkbox:

| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| **Kommen spät (plus)** | Wie viele Minuten **nach** dem geplanten Kommen noch als pünktlich gelten. | `5` Min → Kommen ab 08:00, Stempeln um 08:04 → wird als 08:00 gewertet |
| **Kommen früh (minus)** | Wie viele Minuten **vor** dem geplanten Kommen als pünktlich gelten. Nur aktiv, wenn „Variable Arbeitszeit" aktiviert ist. | `15` Min → Kommen ab 08:00, Stempeln um 07:50 → wird als 08:00 gewertet |
| **Gehen früh (minus)** | Wie viele Minuten **vor** dem geplanten Gehen noch als pünktlich gelten. | `5` Min → Gehen ab 16:30, Stempeln um 16:27 → wird als 16:30 gewertet |
| **Gehen spät (plus)** | Wie viele Minuten **nach** dem geplanten Gehen noch als pünktlich gelten. | `10` Min → Gehen ab 16:30, Stempeln um 16:38 → wird als 16:30 gewertet |
| **Variable Arbeitszeit** | Aktiviert das Feld „Kommen früh (minus)". Ohne diese Checkbox wird bei festen Plänen ein früheres Kommen nicht toleriert, sondern auf die „Kommen ab"-Zeit gekappt. | ☑ aktiviert → Frühkommen wird toleriert und ggf. angerechnet |

**Gleitzeitplan** — 2 Felder (die anderen sind bei Gleitzeit nicht relevant, da das Zeitfenster bereits flexibel ist):

| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| **Kommen früh (minus)** | Puffer vor „Kommen ab". Erweitert das Auswertungsfenster nach vorne. | `10` Min → Kommen ab 06:00, Stempeln um 05:52 → wird als 06:00 gewertet |
| **Gehen spät (plus)** | Puffer nach „Gehen bis". Erweitert das Auswertungsfenster nach hinten. | `10` Min → Gehen bis 20:00, Stempeln um 20:07 → wird als 20:00 gewertet |

**Beispiel — Fester Plan mit Toleranz:**
- Kommen ab: 08:00, Toleranz „spät": 5 Min, Toleranz „früh": 0 Min, Variable Arbeitszeit: ☐
- → Stempeln 07:55: gekappt auf 08:00 (kein Frühbonus). Stempeln 08:03: geschnappt auf 08:00 (kein Abzug). Stempeln 08:06: echte Verspätung, 6 Minuten Unterzeit.

---

**Tab „Rundung":**

Rundung verändert die Buchungszeiten **nach** der Toleranzprüfung mathematisch. Standardmäßig wird nur die **erste Kommen-Buchung** und die **letzte Gehen-Buchung** gerundet.

**Kommen-Rundung** und **Gehen-Rundung** haben identische Optionen:

| Rundungstyp | Intervall/Wert | Beschreibung | Beispiel (Kommen) |
|-------------|---------------|--------------|-------------------|
| **Keine** | — | Keine Rundung, Buchungszeit bleibt unverändert. | 08:07 → 08:07 |
| **Aufrunden** | Intervall (Min) | Rundet die Zeit auf das nächste Vielfache des Intervalls **nach oben**. | Intervall 15: 08:07 → 08:15 |
| **Abrunden** | Intervall (Min) | Rundet auf das nächste Vielfache **nach unten**. | Intervall 15: 08:07 → 08:00 |
| **Nächster Wert** | Intervall (Min) | Rundet auf das **nächstgelegene** Vielfache (kaufmännische Rundung). | Intervall 15: 08:07 → 08:00, 08:08 → 08:15 |
| **Wert addieren** | Wert (Min) | Addiert einen festen Minutenwert zur Buchungszeit. | Wert 5: 08:07 → 08:12 |
| **Wert subtrahieren** | Wert (Min) | Subtrahiert einen festen Minutenwert (minimal 00:00). | Wert 5: 08:07 → 08:02 |

| Feld | Beschreibung |
|------|--------------|
| **Alle Buchungen runden** | Wenn aktiviert, werden **alle** Kommen- und Gehen-Buchungen gerundet — nicht nur die erste/letzte. Relevant bei Mitarbeitern mit mehreren Kommen-/Gehen-Paaren pro Tag (z. B. Dienstgang über Mittag). |

> **Tipp:** Für die meisten Unternehmen ist „Aufrunden Kommen / Abrunden Gehen" mit Intervall 5 oder 15 Minuten sinnvoll — das rundet zugunsten des Arbeitgebers. „Abrunden Kommen / Aufrunden Gehen" rundet zugunsten des Mitarbeiters.

**Beispiel — Rundung zugunsten des Arbeitgebers (15-Minuten-Takt):**
- Kommen-Rundung: Aufrunden, Intervall 15
- Gehen-Rundung: Abrunden, Intervall 15
- → Stempeln 07:53 Kommen → gerundet auf 08:00. Stempeln 16:42 Gehen → gerundet auf 16:30. Angerechnete Arbeitszeit: 8:30 statt 8:49.

---

**Tab „Spezial":**

**Feiertagsgutschriften** — Stunden, die an einem Feiertag **ohne Buchungen** automatisch gutgeschrieben werden (anstatt einen Fehler zu erzeugen). Die Kategorie wird im Feiertagskalender pro Feiertag festgelegt.

| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| **Ganzer Feiertag** (Kategorie 1) | Gutschrift für volle Feiertage (z. B. Weihnachten, Neujahr). | `08:00` → 8 Stunden werden gutgeschrieben |
| **Halber Feiertag** (Kategorie 2) | Gutschrift für halbe Feiertage (z. B. Heiligabend, Silvester in manchen Bundesländern). | `04:00` → 4 Stunden |
| **Kategorie 3** | Gutschrift für eine dritte, frei definierbare Feiertagskategorie. | `06:00` |

> **Hinweis:** Arbeitet ein Mitarbeiter an einem Feiertag und hat Buchungen, greift die normale Berechnung (nicht die Gutschrift). Die Gutschrift gilt nur für Feiertage **ohne** Buchungen und **ohne** eingetragene Abwesenheit.

**Urlaubsabzug** — Faktor, mit dem ein Abwesenheitstag vom Urlaubskonto abgezogen wird.

| Wert | Bedeutung | Typischer Einsatz |
|------|-----------|-------------------|
| `1,0` | Ein voller Urlaubstag wird abgezogen | Vollzeitkräfte (5-Tage-Woche) |
| `0,5` | Ein halber Urlaubstag wird abgezogen | Teilzeitkräfte, die nur halbe Tage arbeiten |
| `0,8` | 0,8 Tage werden abgezogen | 4-Tage-Woche (anteiliger Abzug) |

**Verhalten ohne Buchung** — Was passiert, wenn an einem Arbeitstag **keine einzige Buchung** vorliegt (und es kein Feiertag/Abwesenheitstag ist):

| Option | Beschreibung | Typischer Einsatz |
|--------|--------------|-------------------|
| **Fehler anzeigen** | Erzeugt den Fehler „Keine Buchungen". Der Tag wird rot markiert und muss manuell korrigiert werden. | Standard — Mitarbeiter müssen stempeln |
| **Sollstunden abziehen** | Nettozeit = 0, Unterzeit = Sollarbeitszeit. Der Tag wird als vollständige Unterzeit verbucht. | Strenge Erfassung — fehlende Buchung = fehlende Arbeitszeit |
| **Sollstunden gutschreiben** | Nettozeit = Sollarbeitszeit, Unterzeit = 0. Der Tag wird so gewertet, als hätte der Mitarbeiter die volle Sollzeit gearbeitet. | Vertrauensarbeitszeit, Außendienst |
| **Berufsschultag** | Wie „Sollstunden gutschreiben", erzeugt zusätzlich automatisch eine Abwesenheit mit Code „SB" (Berufsschule). | Auszubildende mit regelmäßigem Berufsschultag |
| **Soll mit Standardauftrag** | Wie „Sollstunden gutschreiben", bucht zusätzlich die Sollzeit auf den im Mitarbeiterstamm hinterlegten Standardauftrag. | Auftragsbezogene Zeiterfassung |

**Tageswechselverhalten** — Regelt, wie Schichten behandelt werden, die **über Mitternacht** gehen (z. B. Nachtschicht 22:00–06:00):

| Option | Beschreibung | Beispiel |
|--------|--------------|---------|
| **Kein Tageswechsel** | Jeder Tag wird isoliert betrachtet. Buchungen nach Mitternacht gehören zum Folgetag. | Standard für Tagschichten |
| **Auswertung bei Ankunft** | Die gesamte Schicht wird dem Tag der **Ankunft** zugerechnet. Ein Kommen am Montag 22:00 und Gehen am Dienstag 06:00 wird komplett auf Montag gebucht. | Nachtschicht: der Ankunftstag „besitzt" die Schicht |
| **Auswertung bei Gehen** | Die gesamte Schicht wird dem Tag des **Gehens** zugerechnet. Kommen Montag 22:00, Gehen Dienstag 06:00 → alles auf Dienstag. | Nachtschicht: der Abgangstag „besitzt" die Schicht |
| **Auto-Abschluss um Mitternacht** | Das System fügt automatisch synthetische Buchungen um Mitternacht ein (Gehen 00:00, Kommen 00:00). Damit wird jeder Kalendertag separat abgerechnet. | Wenn jeder Kalendertag einzeln bewertet werden soll |

> **Beispiel — Nachtschicht mit „Auswertung bei Ankunft":**
> Mitarbeiter stempelt Montag 22:00 ein und Dienstag 05:30 aus. Die gesamte Arbeitszeit (7,5 Std.) wird dem **Montag** zugerechnet. Der Dienstag hat keine Buchung und bekommt — je nach „Verhalten ohne Buchung" — entweder einen Fehler oder eine Gutschrift.

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

##### Beispielkonfigurationen: Früh-, Spät- und Nachtschicht

Die folgenden drei Tagespläne bilden ein typisches 3-Schicht-Modell in der Produktion ab (je 8 Stunden Soll, 30 Min. Pause). Alle Werte können direkt übernommen werden.

**Frühschicht (FS) — 06:00 bis 14:00:**

| Tab | Feld | Wert |
|-----|------|------|
| Basis | Code | `FS` |
| Basis | Plantyp | Fest |
| Basis | Name | `Frühschicht` |
| Basis | Sollarbeitszeit | `08:00` |
| Zeitfenster | Kommen ab | `06:00` |
| Zeitfenster | Gehen ab | `14:00` |
| Toleranz | Kommen spät (+) | `5` Min |
| Toleranz | Kommen früh (−) | `5` Min |
| Toleranz | Gehen früh (−) | `5` Min |
| Toleranz | Gehen spät (+) | `5` Min |
| Toleranz | Variable Arbeitszeit | ☑ |
| Rundung | Kommen / Gehen | Keine |
| Spezial | Feiertagsgutschrift (voll) | `08:00` |
| Spezial | Urlaubsabzug | `1,0` |
| Spezial | Verhalten ohne Buchung | Fehler |
| Spezial | Tageswechselverhalten | **Kein** |
| Pause | Dauer | `30` Min, nach `06:00` Arbeitszeit |

---

**Spätschicht (SS) — 14:00 bis 22:00:**

| Tab | Feld | Wert |
|-----|------|------|
| Basis | Code | `SS` |
| Basis | Plantyp | Fest |
| Basis | Name | `Spätschicht` |
| Basis | Sollarbeitszeit | `08:00` |
| Zeitfenster | Kommen ab | `14:00` |
| Zeitfenster | Gehen ab | `22:00` |
| Toleranz | Kommen spät (+) | `5` Min |
| Toleranz | Kommen früh (−) | `5` Min |
| Toleranz | Gehen früh (−) | `5` Min |
| Toleranz | Gehen spät (+) | `5` Min |
| Toleranz | Variable Arbeitszeit | ☑ |
| Rundung | Kommen / Gehen | Keine |
| Spezial | Feiertagsgutschrift (voll) | `08:00` |
| Spezial | Urlaubsabzug | `1,0` |
| Spezial | Verhalten ohne Buchung | Fehler |
| Spezial | Tageswechselverhalten | **Kein** |
| Pause | Dauer | `30` Min, nach `06:00` Arbeitszeit |

---

**Nachtschicht (NS) — 22:00 bis 06:00 (über Mitternacht):**

| Tab | Feld | Wert |
|-----|------|------|
| Basis | Code | `NS` |
| Basis | Plantyp | Fest |
| Basis | Name | `Nachtschicht` |
| Basis | Sollarbeitszeit | `08:00` |
| Zeitfenster | Kommen ab | `22:00` |
| Zeitfenster | Gehen ab | `06:00` |
| Toleranz | Kommen spät (+) | `5` Min |
| Toleranz | Kommen früh (−) | `5` Min |
| Toleranz | Gehen früh (−) | `5` Min |
| Toleranz | Gehen spät (+) | `5` Min |
| Toleranz | Variable Arbeitszeit | ☑ |
| Rundung | Kommen / Gehen | Keine |
| Spezial | Feiertagsgutschrift (voll) | `08:00` |
| Spezial | Urlaubsabzug | `1,0` |
| Spezial | Verhalten ohne Buchung | Fehler |
| Spezial | **Tageswechselverhalten** | **Bei Ankunft** ⬅️ |
| Pause | Dauer | `30` Min, nach `06:00` Arbeitszeit |

> **Warum „Bei Ankunft" bei der Nachtschicht?** Die Schicht beginnt z. B. Montag 22:00 und endet Dienstag 06:00. Ohne Tageswechsel würde die Arbeitszeit auf zwei Tage gesplittet (2 Std. Montag + 6 Std. Dienstag) — das führt zu falschen Saldos. „Bei Ankunft" bucht die gesamten 8 Stunden auf Montag. Der Dienstag hat dann keine Buchung und bekommt — je nach „Verhalten ohne Buchung" — einen Fehler oder eine Gutschrift, die dann über den Wochenplan gesteuert wird (typischerweise hat der Folgetag der Nachtschicht keinen Tagesplan zugewiesen = frei).

> **Alternative: „Auto-Abschluss um Mitternacht"** — Wenn jeder Kalendertag getrennt abgerechnet werden soll (z. B. für tagesgenaue Zuschlagsberechnung), kann stattdessen „Auto-Abschluss" gewählt werden. Das System erzeugt dann automatisch synthetische Buchungen um 00:00 (Gehen + Kommen), sodass Montag 2 Std. und Dienstag 6 Std. bekommt. Für die meisten Schichtbetriebe ist **„Bei Ankunft"** die empfohlene Einstellung.

> **Tipp — Schichterkennung statt manuellem Wechsel:** Wenn Mitarbeiter zwischen Früh-, Spät- und Nachtschicht rotieren, können Sie im Tagesplan die **Schichterkennung** konfigurieren (Tab „Spezial"). Das System erkennt dann anhand der Ankunftszeit automatisch, welche Schicht gearbeitet wurde — auch wenn ein anderer Plan zugewiesen war (→ Abschnitt 6.5).

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

**Was ist es?** Ein Tarif ist das übergeordnete Arbeitszeitmodell, das einem Mitarbeiter zugewiesen wird. Er bündelt alle Bausteine: den **Arbeitsrhythmus** (welche Wochenpläne/Tagespläne wann gelten), die **Urlaubsregelung**, die **Sollstunden** und die **Flexzeitregeln**. Tagesplan und Wochenplan definieren, *wie* ein einzelner Tag bzw. eine Woche aussieht — der Tarif bestimmt, *welcher* Plan *wann* gilt und welche Rahmenbedingungen drumherum gelten.

**Wozu dient es?** Ohne Tarif hat ein Mitarbeiter kein Arbeitszeitmodell. Erst durch die Tarifzuweisung weiß das System, welche Tagespläne generiert werden sollen, wie viel Urlaub zusteht und wie Überstunden behandelt werden.

✅ Tabelle mit Spalten: Code, Name, Wochenplan, Gültig ab, Gültig bis, Pausen (Anzahl), Status.

**Filter:** Suchfeld, Status

##### Neuen Tarif anlegen

1. 📍 Seitenleiste → Verwaltung → Tarife → **„Neuer Tarif"** (oben rechts)
2. Das Formular hat **5 Tabs** — jedes Feld wird nachfolgend im Detail erklärt:

---

**Tab „Basis":**

| Feld | Pflicht? | Beschreibung |
|------|----------|--------------|
| **Code** | Ja | Eindeutiger Kurzcode für den Tarif (max. 20 Zeichen). Wird nach dem Erstellen gesperrt und kann nicht mehr geändert werden. |
| **Name** | Ja | Beschreibender Name, der in Dropdowns, Tabellen und Mitarbeiterstamm angezeigt wird. |
| **Beschreibung** | Nein | Optionaler Freitext für interne Notizen zum Tarif. |
| **Aktiv** | — | Nur beim Bearbeiten sichtbar. Inaktive Tarife können nicht mehr neuen Mitarbeitern zugewiesen werden, bestehende Zuweisungen bleiben erhalten. |

**Beispiel — Basis-Tab für einen Verwaltungstarif:**
- Code: `VERW-VZ`
- Name: `Verwaltung Vollzeit`
- Beschreibung: `Standardtarif für Vollzeitkräfte in der Verwaltung (Mo–Fr)`

---

**Tab „Zeitplan":**

Der Zeitplan bestimmt den **Arbeitsrhythmus** — also welche Wochenpläne oder Tagespläne in welcher Reihenfolge gelten.

| Feld | Pflicht? | Beschreibung |
|------|----------|--------------|
| **Rhythmustyp** | Ja (Standard: Wöchentlich) | Bestimmt, wie der Arbeitsplan wiederholt wird. Beeinflusst, welche weiteren Felder sichtbar sind. |
| **Wochenplan** | Bedingt | Nur bei Rhythmus „Wöchentlich" sichtbar. Wählt den einen Wochenplan, der jede Woche identisch wiederholt wird. |
| **Wochenpläne (Reihenfolge)** | Bedingt | Nur bei „Rollierend wöchentlich". Mehrere Wochenpläne in einer festgelegten Reihenfolge konfigurieren. |
| **Zykluslänge (Tage)** | Bedingt | Nur bei „X-Tage-Rhythmus". Anzahl der Tage im Zyklus (1–365). Für jeden Tag wird ein Tagesplan zugewiesen. |
| **Rhythmus-Startdatum** | Bedingt | Nur bei „Rollierend wöchentlich" und „X-Tage-Rhythmus". Definiert den Tag, an dem der Zyklus beginnt — das System berechnet daraus, welcher Plan an welchem Datum gilt. |
| **Gültig ab** | Nein | Optionaler Beginn der Tarifgültigkeit. |
| **Gültig bis** | Nein | Optionales Ende der Tarifgültigkeit. |

> **Rhythmustyp — Unterschiede:**
>
> | | Wöchentlich | Rollierend wöchentlich | X-Tage-Rhythmus |
> |---|---|---|---|
> | Wiederholung | Jede Woche identisch | Wochenpläne rotieren in fester Reihenfolge | Tage rotieren in fester Zykluslänge |
> | Konfiguration | 1 Wochenplan auswählen | Mehrere Wochenpläne in Reihenfolge anordnen | Zykluslänge + je Tag einen Tagesplan zuweisen |
> | Startdatum nötig? | Nein | Ja | Ja |
> | Typischer Einsatz | Büro, Verwaltung (immer gleiche Woche) | Wechselschicht (z. B. Früh / Spät / Nacht im 3-Wochen-Turnus) | Unregelmäßige Zyklen (z. B. 14-Tage-Rhythmus, 4-Tage-Woche) |

**Beispiel — Wöchentlich (Standard):**
- Rhythmustyp: **Wöchentlich**
- Wochenplan: `WP-BUERO` (Bürowoche, Mo–Fr)
- → Jede Woche wird identisch nach dem Wochenplan „Bürowoche" geplant.

**Beispiel — Rollierend wöchentlich (3-Wochen-Schichtrotation Früh/Spät/Nacht):**
- Rhythmustyp: **Rollierend wöchentlich**
- Wochenpläne: 1. `WP-FRUEH` (Frühschichtwoche), 2. `WP-SPAET` (Spätschichtwoche), 3. `WP-NACHT` (Nachtschichtwoche)
- Rhythmus-Startdatum: `06.01.2026` (ein Montag)
- → Woche vom 06.01.: Frühschicht. Woche vom 13.01.: Spätschicht. Woche vom 20.01.: Nachtschicht. Woche vom 27.01.: wieder Frühschicht. Usw.

**Beispiel — X-Tage-Rhythmus (4-Tage-Woche):**
- Rhythmustyp: **X-Tage-Rhythmus**
- Zykluslänge: `7` Tage
- Rhythmus-Startdatum: `06.01.2026` (ein Montag)
- Tageszuweisungen:

| Tag im Zyklus | Tagesplan |
|---------------|-----------|
| 1 (Montag) | BUERO |
| 2 (Dienstag) | BUERO |
| 3 (Mittwoch) | BUERO |
| 4 (Donnerstag) | BUERO |
| 5 (Freitag) | *(kein Plan — frei)* |
| 6 (Samstag) | *(kein Plan — frei)* |
| 7 (Sonntag) | *(kein Plan — frei)* |

- → 4 Arbeitstage pro Woche statt 5. Vorteil gegenüber einem Wochenplan: Der Rhythmus kann auch über die Wochengrenze hinweg verschoben werden (z. B. 10 Tage Arbeit, 4 Tage frei).

---

**Tab „Urlaub":**

Die Urlaubseinstellungen steuern, wie viel Urlaub einem Mitarbeiter mit diesem Tarif zusteht und wie er berechnet wird.

| Feld | Pflicht? | Beschreibung | Standard |
|------|----------|--------------|---------|
| **Jahresurlaubstage** | Nein | Anzahl der Urlaubstage pro Jahr (Dezimalwerte möglich, z. B. 25,5). | — |
| **Arbeitstage pro Woche** | Nein | Wie viele Tage pro Woche der Mitarbeiter regulär arbeitet (1–7). Wird für die anteilige Urlaubsberechnung bei unterjährigem Eintritt/Austritt benötigt. | 5 |
| **Urlaubsberechnungsbasis** | Nein | Bestimmt den Referenzzeitraum für die Urlaubsberechnung. | Kalenderjahr |
| **Urlaubskappungsregelgruppe** | Nein | Optionale Verknüpfung zu einer Kappungsregelgruppe, die definiert, wann und wie viel Resturlaub verfällt. | — |

> **Urlaubsberechnungsbasis — Unterschiede:**
>
> | Option | Beschreibung | Typischer Einsatz |
> |--------|--------------|-------------------|
> | **Kalenderjahr** | Der Urlaubsanspruch gilt vom 01.01. bis 31.12. Bei unterjährigem Eintritt wird der Anspruch anteilig berechnet. | Standard in den meisten Unternehmen |
> | **Eintrittsdatum** | Der Urlaubsanspruch gilt ab dem Eintrittsdatum des Mitarbeiters für 12 Monate. Der Beginn des „Urlaubsjahres" ist individuell. | Unternehmen mit individuellen Urlaubsjahren |

> **Urlaubskappungsregelgruppe:** Kappungsregelgruppen werden unter **Verwaltung → Urlaubskappungsregeln** verwaltet. Eine Gruppe enthält Regeln mit Stichtag (Monat + Tag) und Kappungswert. Beispiel: „Resturlaub verfällt am 31.03. des Folgejahres bis auf maximal 5 Tage" — das verhindert, dass Mitarbeiter unbegrenzt Urlaub ansammeln.

**Beispiel — Urlaubseinstellungen für Vollzeitkraft:**
- Jahresurlaubstage: `30`
- Arbeitstage pro Woche: `5`
- Urlaubsberechnungsbasis: **Kalenderjahr**
- Urlaubskappungsregelgruppe: *(keine — kein Verfall)*

**Beispiel — Urlaubseinstellungen für Teilzeitkraft (3-Tage-Woche):**
- Jahresurlaubstage: `18` (= 30 × 3/5, anteilig berechnet)
- Arbeitstage pro Woche: `3`
- Urlaubsberechnungsbasis: **Kalenderjahr**

---

**Tab „Sollstunden":**

Die Sollstunden dienen als **Referenzwerte für Auswertungen und Berichte** — nicht für die tägliche Berechnung. Die tägliche Sollzeit kommt aus dem Tagesplan. Die Felder hier werden verwendet, um z. B. monatliche oder jährliche Über-/Unterzeitauswertungen zu erstellen oder vertragliche Vereinbarungen abzubilden.

| Feld | Beschreibung | Beispiel |
|------|--------------|---------|
| **Tägliche Sollstunden** | Rechnerische Sollstunden pro Tag (Dezimalwert in Stunden). | `8,0` |
| **Wöchentliche Sollstunden** | Vertragliche Wochenstunden. Wird häufig für die Ermittlung des Beschäftigungsgrads verwendet. | `40,0` |
| **Monatliche Sollstunden** | Rechnerische Sollstunden pro Monat. | `173,0` |
| **Jährliche Sollstunden** | Rechnerische Sollstunden pro Jahr. | `2.080,0` |

> **Hinweis:** Alle Felder sind optional. Sie ergänzen die Tagesplan-Sollzeit um eine „Vogelperspektive" — das System rechnet im Tagesgeschäft mit der Sollzeit aus dem Tagesplan, aber für monatliche Zusammenfassungen oder Jahresberichte kann es die hier hinterlegten Werte heranziehen.

**Beispiel — Sollstunden Vollzeit (40h/Woche):**
- Täglich: `8,0` | Wöchentlich: `40,0` | Monatlich: `173,0` | Jährlich: `2.080,0`

**Beispiel — Sollstunden Teilzeit (20h/Woche):**
- Täglich: `4,0` | Wöchentlich: `20,0` | Monatlich: `86,5` | Jährlich: `1.040,0`

---

**Tab „Flexzeit":**

Die Flexzeit-Einstellungen steuern, wie Über- und Unterstunden am Periodenende (Monat/Jahr) behandelt werden. Ohne Flexzeit-Konfiguration werden Über-/Unterstunden zwar angezeigt, aber nicht auf ein Flexzeitkonto übertragen.

| Feld | Beschreibung | Standard |
|------|--------------|---------|
| **Übertragungsart** | Bestimmt, ob und wie der Flexzeitsaldo am Monatsende ins nächste Monat übertragen wird. | Keine Bewertung |
| **Max. Flexzeit/Monat** | Obergrenze für die Flexzeit, die in einem einzelnen Monat angesammelt werden kann (Format HH:MM). Überstunden über diesem Wert werden gekappt. | — |
| **Schwellenwert** | Nur bei Übertragungsart „Nach Schwellenwert" relevant. Stunden bis zu diesem Wert werden nicht übertragen (verfallen). Nur der Anteil **über** dem Schwellenwert wird ins nächste Monat mitgenommen. | — |
| **Obere Jahresgrenze** | Maximaler positiver Flexzeitsaldo, der über das gesamte Jahr angesammelt werden darf (Format HH:MM). Wird dieser Wert erreicht, werden weitere Überstunden nicht mehr gutgeschrieben. | — |
| **Untere Jahresgrenze** | Maximaler negativer Flexzeitsaldo (Format HH:MM, als negativer Wert gedacht). Wird dieser Wert erreicht, werden keine weiteren Unterstunden mehr verbucht. | — |

> **Übertragungsart — Unterschiede:**
>
> | Option | Beschreibung | Typischer Einsatz |
> |--------|--------------|-------------------|
> | **Keine Bewertung** | Flexzeit wird angezeigt, aber nicht aktiv verwaltet. Kein Konto, kein Übertrag. | Vertrauensarbeitszeit, einfache Zeiterfassung ohne Flexzeitkonto |
> | **Vollständige Übertragung** | Der gesamte Flexzeitsaldo wird am Monatsende 1:1 ins nächste Monat übertragen. | Standard — Mitarbeiter sammeln Über-/Unterstunden unbegrenzt an (innerhalb der Jahresgrenzen) |
> | **Nach Schwellenwert** | Nur Stunden **über** dem Schwellenwert werden übertragen. Stunden darunter verfallen am Monatsende. | Unternehmen, die einen „Grundstock" an Überstunden nicht übertragen möchten |
> | **Keine Übertragung** | Der Flexzeitsaldo wird am Monatsende auf 0 zurückgesetzt. Über-/Unterstunden verfallen komplett. | Strikte Monatsabrechnung, kein Übertrag erwünscht |

**Beispiel — Flexzeit mit vollständiger Übertragung:**
- Übertragungsart: **Vollständige Übertragung**
- Max. Flexzeit/Monat: `20:00` (max. 20 Überstunden pro Monat)
- Obere Jahresgrenze: `40:00` (max. 40 Stunden Plus-Saldo)
- Untere Jahresgrenze: `-20:00` (max. 20 Stunden Minus-Saldo)
- → Mitarbeiter können pro Monat bis zu 20 Überstunden ansammeln, insgesamt aber nie mehr als 40 Stunden Plus oder 20 Stunden Minus auf dem Konto haben.

**Beispiel — Flexzeit nach Schwellenwert:**
- Übertragungsart: **Nach Schwellenwert**
- Schwellenwert: `10:00`
- Obere Jahresgrenze: `60:00`
- → Ein Mitarbeiter hat im Januar 15 Überstunden. Die ersten 10 Stunden verfallen, die restlichen 5 werden ins Februar übertragen. Hat er im Februar 8 Überstunden: Diese 8 verfallen komplett (unter dem Schwellenwert).

**Beispiel — Keine Übertragung (strikte Monatsabrechnung):**
- Übertragungsart: **Keine Übertragung**
- → Am Monatsende wird der Saldo auf 0 gesetzt, egal ob Plus oder Minus.

---

3. 📍 „Tarif erstellen"

✅ Der Tarif erscheint in der Tabelle. Klick auf eine Zeile öffnet die Detailansicht.

> **Hinweis:** Nach dem Erstellen oder Ändern eines Tarifs generiert das System automatisch die Tagespläne für alle zugewiesenen Mitarbeiter neu. Das kann bei vielen Mitarbeitern einige Sekunden dauern.

##### Tarif-Pausen (Breaks)

In der Detailansicht eines Tarifs (Klick auf eine Zeile in der Tabelle) gibt es den Abschnitt **„Pausen"**. Pausen, die auf Tarif-Ebene definiert werden, gelten für **alle Tagespläne innerhalb dieses Tarifs** und ergänzen die Pausen aus den einzelnen Tagesplänen.

📍 Tarif anklicken → Detailansicht → Abschnitt „Pausen" → **„Pause hinzufügen"**

| Feld | Pflicht? | Beschreibung |
|------|----------|--------------|
| **Pausentyp** | Ja | Art der Pause: **Fest** (wird immer abgezogen), **Variabel** (wird nach X Arbeitsminuten abgezogen) oder **Minimum** (wird nur abgezogen, wenn die Mindestarbeitszeit erreicht wird). |
| **Dauer (Minuten)** | Ja | Pausendauer in Minuten (mind. 1 Minute). |
| **Nach Arbeit (Minuten)** | Bedingt | Nur bei Pausentyp „Variabel" und „Minimum". Anzahl der Arbeitsminuten, nach denen die Pause automatisch abgezogen wird. |
| **Bezahlt** | Nein | Wenn aktiviert, wird die Pause nicht von der Nettoarbeitszeit abgezogen. Standard: unbezahlt. |

**Beispiel — Gesetzliche Pausenregelung (§ 4 ArbZG):**
- Pause 1: Variabel, 30 Minuten, nach 360 Minuten (6 Std.) Arbeit
- Pause 2: Variabel, 15 Minuten, nach 540 Minuten (9 Std.) Arbeit
- → Nach 6 Stunden werden 30 Min. abgezogen. Nach 9 Stunden werden zusätzlich 15 Min. abgezogen (insgesamt 45 Min.).

##### Was ein Tarif festlegt — Zusammenfassung

> | Einstellung | Bedeutung | Beispiel |
> |------------|-----------|---------|
> | Rhythmustyp | Wie sich der Arbeitsplan wiederholt | Wöchentlich, Rollierend, X-Tage |
> | Wochenplan(e) / Tagespläne | Welche Pläne wann gelten | WP-BUERO (Mo–Fr) |
> | Gültigkeitszeitraum | Ab/bis wann der Tarif gilt | 01.01.2026 – unbefristet |
> | Jahresurlaubstage | Urlaubsanspruch pro Jahr | 30 Tage |
> | Arbeitstage pro Woche | Für anteilige Berechnung | 5 Tage |
> | Sollstunden | Referenzwerte für Berichte | 40 Std./Woche |
> | Übertragungsart | Wie Flexzeit übertragen wird | Vollständig |
> | Kontolimits | Ober-/Untergrenzen Flexzeit | ±40 Std./Jahr |
> | Pausen | Tarif-weite Pausenregeln | 30 Min. nach 6 Std. |

##### Beispielkonfigurationen: Typische Tarife

Die folgenden drei Tarife decken häufige Szenarien ab und können als Vorlage dienen.

**Tarif 1 — „Verwaltung Vollzeit" (Standardbüro, 40h/Woche)**

| Tab | Feld | Wert |
|-----|------|------|
| Basis | Code | `VERW-VZ` |
| Basis | Name | `Verwaltung Vollzeit` |
| Zeitplan | Rhythmustyp | Wöchentlich |
| Zeitplan | Wochenplan | `WP-BUERO` (Mo–Fr je Tagesplan BUERO) |
| Urlaub | Jahresurlaubstage | `30` |
| Urlaub | Arbeitstage/Woche | `5` |
| Urlaub | Berechnungsbasis | Kalenderjahr |
| Sollstunden | Wöchentlich | `40,0` |
| Flexzeit | Übertragungsart | Vollständige Übertragung |
| Flexzeit | Obere Jahresgrenze | `40:00` |
| Flexzeit | Untere Jahresgrenze | `-40:00` |

**Tarif 2 — „Produktion Schicht" (3-Wochen-Rotation Früh/Spät/Nacht)**

| Tab | Feld | Wert |
|-----|------|------|
| Basis | Code | `PROD-WS` |
| Basis | Name | `Produktion Wechselschicht` |
| Zeitplan | Rhythmustyp | Rollierend wöchentlich |
| Zeitplan | Wochenpläne | 1. `WP-FRUEH`, 2. `WP-SPAET`, 3. `WP-NACHT` |
| Zeitplan | Rhythmus-Startdatum | `06.01.2026` |
| Urlaub | Jahresurlaubstage | `30` |
| Urlaub | Arbeitstage/Woche | `5` |
| Urlaub | Berechnungsbasis | Kalenderjahr |
| Sollstunden | Wöchentlich | `40,0` |
| Flexzeit | Übertragungsart | Keine Bewertung |

> **Warum „Keine Bewertung" bei Schichtarbeit?** In der Produktion arbeiten Mitarbeiter in der Regel exakt nach Plan. Über-/Unterstunden werden typischerweise nicht auf ein Flexzeitkonto gebucht, sondern separat als Mehrarbeit/Kurzarbeit verwaltet.

**Tarif 3 — „Teilzeit 20h" (3-Tage-Woche, Mo/Mi/Fr)**

| Tab | Feld | Wert |
|-----|------|------|
| Basis | Code | `TZ-20` |
| Basis | Name | `Teilzeit 20 Stunden` |
| Zeitplan | Rhythmustyp | Wöchentlich |
| Zeitplan | Wochenplan | `WP-TZ3` (Mo/Mi/Fr je Tagesplan TZ-7H, Di/Do/Sa/So frei) |
| Urlaub | Jahresurlaubstage | `18` (= 30 × 3/5) |
| Urlaub | Arbeitstage/Woche | `3` |
| Urlaub | Berechnungsbasis | Kalenderjahr |
| Sollstunden | Wöchentlich | `20,0` |
| Sollstunden | Täglich | `6,67` |
| Flexzeit | Übertragungsart | Vollständige Übertragung |
| Flexzeit | Obere Jahresgrenze | `20:00` |
| Flexzeit | Untere Jahresgrenze | `-20:00` |

> **Tipp — Teilzeit-Urlaub:** Bei Teilzeitkräften muss der Urlaubsanspruch anteilig berechnet werden: `Vollzeiturlaub × Arbeitstage/Woche ÷ 5`. Eine 3-Tage-Kraft mit 30 Tagen Vollzeitanspruch erhält also 18 Tage. Das System berechnet das **nicht** automatisch — der Wert muss manuell im Tarif eingetragen werden.

##### Tarif löschen

Ein Tarif kann nur gelöscht werden, wenn er **keinem Mitarbeiter zugewiesen** ist — weder als Standard-Tarif im Mitarbeiterstamm noch über eine Tarifzuweisung. Solange Zuweisungen bestehen, zeigt das System eine Fehlermeldung.

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

**Was ist es?** Der Mitarbeiterstamm enthält alle Personen, für die Arbeitszeiten erfasst werden. Jeder Mitarbeiter hat Stammdaten (Name, E-Mail), Beschäftigungsdaten (Personalnummer, Abteilung, Tarif) und Vertragsdaten (Wochenstunden, Urlaubstage).

**Wozu dient es?** Ohne Mitarbeiterdatensatz kann keine Zeiterfassung stattfinden. Der Mitarbeiterstamm ist die zentrale Stelle, an der alle Zuordnungen zusammenlaufen: Tarif (→ Arbeitszeitmodell), Abteilung, Kostenstelle, Standort und Beschäftigungsart.

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

#### Praxisbeispiel

Ein vollständiges Praxisbeispiel zum Anlegen eines Mitarbeiters mit Tarifzuweisung finden Sie in Abschnitt **4.6.4 Schritt 4**.

💡 **Hinweis:** Das Eintrittsdatum bestimmt den Start der Urlaubsberechnung und der Tarifzuweisung. Die PIN wird automatisch vergeben und dient zur Identifizierung am Terminal. Mitarbeiter ohne Tarif erhalten keine automatisch generierten Tagespläne — sie können nur manuell im Zeitnachweis bebucht werden.

### 4.8 Beschäftigungsarten

**Was ist es?** Beschäftigungsarten klassifizieren die Anstellungsverhältnisse Ihrer Mitarbeiter — z. B. Vollzeit, Teilzeit, Minijob, Werkstudent oder Auszubildender. Jede Art hat Standard-Wochenstunden und kann mit einer Urlaubsberechnungsgruppe verknüpft werden.

**Wozu dient es?** Die Beschäftigungsart erfüllt drei Aufgaben:

1. **Defaults beim Onboarding:** Wenn Sie einen neuen Mitarbeiter anlegen und z. B. „Teilzeit" wählen, werden die Standard-Wochenstunden (z. B. 20) automatisch vorausgefüllt. Dieser Wert kann im Mitarbeiterstamm individuell angepasst werden.
2. **Urlaubsberechnungsregeln:** Die Beschäftigungsart kann mit einer Urlaubsberechnungsgruppe verknüpft werden. Diese Gruppe legt die **Berechnungsmethode** fest (Kalenderjahr oder Eintrittsdatum) und definiert **Sondertage-Regeln** (z. B. Bonustage ab einem bestimmten Alter, Betriebszugehörigkeit oder bei Schwerbehinderung). Die Beschäftigungsart bestimmt dabei nicht die Anzahl der Urlaubstage selbst — der Basisanspruch und der Teilzeitfaktor kommen aus dem Mitarbeiterstamm und dem Tarif.
3. **Filterung & Reporting:** Sie können in Listen und Berichten nach Beschäftigungsart filtern — z. B. „alle Minijobber" oder „alle Werkstudenten in Abteilung X".

> **Abgrenzung zu Tarifen und Plänen:** Tarif, Tagesplan und Wochenplan legen fest, **wann und wie viel** ein Mitarbeiter arbeitet (konkrete Schichten, Pausenregeln, Zuschläge). Die Beschäftigungsart beschreibt dagegen, **was für ein Anstellungsverhältnis** vorliegt. Ein Teilzeit-Mitarbeiter und ein Minijobber können denselben Wochenplan haben (beide 20 Stunden), aber unterschiedliche Beschäftigungsarten — mit unterschiedlichen Berechnungsregeln für den Urlaub und unterschiedlicher Bedeutung im Reporting.

⚠️ Berechtigung: „Mitarbeiter ansehen"

📍 Seitenleiste → **Verwaltung** → **Beschäftigungsarten**

✅ Tabelle mit Spalten: Code, Name, Wochenstunden, Status.

#### Neue Beschäftigungsart anlegen

1. 📍 Seitenleiste → Verwaltung → Beschäftigungsarten → **„Neue Beschäftigungsart"** (oben rechts)
2. Ausfüllen: Code (Pflicht, z. B. `VZ`), Name (Pflicht, z. B. „Vollzeit"), Beschreibung, Standard-Wochenstunden (Zahl), Urlaubsberechnungsgruppe (Dropdown)
3. 📍 „Erstellen"

Die Beschäftigungsart wird beim Anlegen oder Bearbeiten eines Mitarbeiters zugewiesen:
📍 Verwaltung → Mitarbeiter → Neuer Mitarbeiter / Bearbeiten → Dropdown „Beschäftigungsart"

#### Praxisbeispiel

Ein Unternehmen mit drei Anstellungsformen:

| Code | Name | Wochenstunden | Urlaubsberechnungsgruppe |
|------|------|---------------|--------------------------|
| `VZ` | Vollzeit | 40 | Standard |
| `TZ` | Teilzeit | 20 | Standard |
| `MJ` | Minijob | 10 | *(keine)* |

Wenn ein Teilzeit-Mitarbeiter angelegt wird und die Beschäftigungsart `TZ` gewählt wird, übernimmt das System automatisch 20 Wochenstunden als Vorgabewert. Ist „Standard" als Urlaubsberechnungsgruppe hinterlegt, gelten deren Regeln (Berechnungsbasis und ggf. Sondertage) für die Urlaubsermittlung dieses Mitarbeiters.

💡 **Hinweis:** Beschäftigungsarten sind optional, aber empfehlenswert, sobald Sie unterschiedliche Anstellungsformen haben. Die Standard-Wochenstunden können im Mitarbeiterstamm individuell überschrieben werden.

### 4.9 Buchungstypen

**Was ist es?** Buchungstypen definieren die Bedeutung jeder Stempelbuchung. Jede Buchung hat eine **Richtung** (Eingang oder Ausgang) und gehört zu einer **Kategorie** (Arbeit, Pause oder Dienstgang). Die Richtung bestimmt, ob die Buchung als „Kommen" oder „Gehen" interpretiert wird.

**Wozu dient es?** Das System benötigt eindeutige Buchungstypen, um Arbeitspaare bilden zu können: Ein Kommen-Buchung (Eingang) + eine Gehen-Buchung (Ausgang) = ein Arbeitszeitraum. Ohne korrekt zugeordnete Typen könnte das System die Arbeitszeit nicht berechnen. Eigene Buchungstypen ermöglichen es, spezielle Stempelarten abzubilden (z. B. „Homeoffice Beginn", „Außendienst Ende").

⚠️ Berechtigung: „Buchungstypen verwalten"

📍 Seitenleiste → **Verwaltung** → **Buchungstypen**

✅ Seite mit zwei Tabs: **Buchungstypen** und **Gruppen**

Im Tab „Buchungstypen" sehen Sie eine Tabelle mit Spalten: Richtung (farbiges Symbol: Eingang = grün, Ausgang = rot), Code, Name + Beschreibung, Nutzungsanzahl, Status (mit Aktiv/Inaktiv-Schalter).

**Filter:** Suchfeld, Richtung (Alle/Eingang/Ausgang)

##### Neuen Buchungstyp anlegen

1. 📍 Tab „Buchungstypen" → **„Neuer Buchungstyp"** (oben rechts)
2. Ausfüllen: Code (Pflicht, Großbuchstaben), Richtung (Pflicht: Ein/Aus — bei Bearbeitung gesperrt), Name (Pflicht), Beschreibung
3. 📍 „Speichern"

##### Systemtypen (vorinstalliert)

Terp liefert sechs Systemtypen mit, die nicht bearbeitet oder gelöscht werden können:

| Code | Name | Richtung | Kategorie | Bedeutung |
|------|------|----------|-----------|-----------|
| `A1` | Kommen | Eingang | Arbeit | Arbeitsbeginn (Einstempeln) |
| `A2` | Gehen | Ausgang | Arbeit | Arbeitsende (Ausstempeln) |
| `P1` | Pause Beginn | Ausgang | Pause | Pausenanfang |
| `P2` | Pause Ende | Eingang | Pause | Pausenende |
| `D1` | Dienstgang Beginn | Ausgang | Dienstgang | Beginn eines Dienstgangs |
| `D2` | Dienstgang Ende | Eingang | Dienstgang | Ende eines Dienstgangs |

> **Systemtypen** können nicht bearbeitet oder gelöscht werden. Typen mit aktiver Nutzung können ebenfalls nicht gelöscht werden.

#### Wo Buchungstypen außerdem erscheinen

| Ort | Pfad | Wie sie verwendet werden |
|-----|------|--------------------------|
| Stempeluhr | 📍 Stempeluhr | Die Buttons „Einstempeln" / „Ausstempeln" / „Pause" verwenden automatisch die Codes A1, A2, P1, P2, D1, D2 — der Benutzer wählt keinen Typ manuell |
| Zeitnachweis — Buchung hinzufügen | 📍 Zeitnachweis → Tagesansicht → „Buchung hinzufügen" | Dropdown mit allen aktiven Buchungstypen zur Auswahl |
| Zeitnachweis — Buchungsliste | 📍 Zeitnachweis → Tagesansicht | Jede Buchung zeigt den Typnamen; Eingang/Ausgang-Paare werden farblich gruppiert |
| Dashboard | 📍 Dashboard | Status („Eingestempelt" / „Ausgestempelt") wird anhand der Richtung der letzten Buchung ermittelt |
| Teamübersicht | 📍 Teamübersicht | Anwesenheitsstatus pro Mitarbeiter basiert auf der Richtung der letzten Arbeitsbuchung |
| Auswertungen — Tab „Buchungen" | 📍 Verwaltung → Auswertungen → Tab „Buchungen" | Filterbare Tabelle mit Buchungstyp-Dropdown und Richtungsfilter |
| Terminal-Import | 📍 Administration → Terminal-Buchungen → Import | Buchungscode in den Importdaten wird dem Buchungstyp zugeordnet |

#### Praxisbeispiel

Ein Unternehmen möchte Homeoffice-Zeiten separat erfassen:

1. 📍 Verwaltung → **Buchungstypen** → **„Neuer Buchungstyp"**
   - Code: `HO1`, Richtung: **Eingang**, Name: `Homeoffice Beginn` → 📍 „Speichern"
2. 📍 **„Neuer Buchungstyp"**
   - Code: `HO2`, Richtung: **Ausgang**, Name: `Homeoffice Ende` → 📍 „Speichern"

3. Der Mitarbeiter kann nun im Zeitnachweis (📍 Zeitnachweis → Tagesansicht → „Buchung hinzufügen") die Typen `Homeoffice Beginn` und `Homeoffice Ende` wählen. Das System bildet daraus ein Arbeitspaar und berechnet die Arbeitszeit wie gewohnt.

💡 **Hinweis:** Für die meisten Unternehmen reichen die sechs Systemtypen aus. Eigene Buchungstypen sind nur dann nötig, wenn Sie in Auswertungen und Berichten zwischen verschiedenen Arbeitsarten unterscheiden möchten (z. B. Homeoffice vs. Büro). Die Stempeluhr verwendet immer die Systemtypen A1/A2/P1/P2.

### 4.10 Abwesenheitstypen

**Was ist es?** Abwesenheitstypen klassifizieren die verschiedenen Gründe, warum ein Mitarbeiter nicht arbeitet — z. B. Jahresurlaub, Krankheit, Sonderurlaub, Fortbildung. Jeder Typ hat eine Kategorie, eine Farbe (für den Kalender) und Regeln (ob Urlaub abgezogen und ob eine Genehmigung erforderlich ist).

**Wozu dient es?** Das System muss wissen, wie ein Abwesenheitstag zu behandeln ist: Wird er vom Urlaubskonto abgezogen? Muss der Vorgesetzte genehmigen? Wie wird er im Lohnexport ausgewiesen? Ohne korrekt konfigurierte Typen könnte das System Urlaub und Krankheit nicht unterscheiden.

⚠️ Berechtigung: „Abwesenheitsarten verwalten"

📍 Seitenleiste → **Verwaltung** → **Abwesenheitsarten**

✅ Seite mit zwei Tabs: **Abwesenheitsarten** und **Gruppen**

Im Tab „Abwesenheitsarten" sehen Sie eine Tabelle mit Spalten: Farbe (farbiger Punkt), Code, Name, Kategorie (Badge), Urlaub (✓/✗), Genehmigung (✓/✗), Status.

**Filter:** Suchfeld, Kategorie (Alle Kategorien / Urlaub / Krankheit / Persönlicher Urlaub / Unbezahlter Urlaub), Status (Alle Status / Aktiv / Inaktiv), „Systemtypen anzeigen" (Schalter, standardmäßig ein)

##### Neue Abwesenheitsart anlegen

1. 📍 Tab „Abwesenheitsarten" → **„Neue Abwesenheitsart"** (oben rechts)
2. Ausfüllen:
   - **Code** (Pflicht, Großbuchstaben, muss mit U, K oder S beginnen)
   - **Farbe** (Hex-Farbcode mit Vorschau)
   - **Name** (Pflicht)
   - **Kategorie** (Dropdown: Urlaub / Krankheit / Persönlicher Urlaub / Unbezahlter Urlaub)
   - **Beeinflusst Urlaubssaldo** (Schalter — ob vom Urlaubskonto abgezogen wird)
   - **Genehmigung erforderlich** (Schalter — wenn deaktiviert, werden Abwesenheiten dieses Typs bei Erstellung automatisch genehmigt, ohne Genehmigungsworkflow)
3. 📍 „Erstellen"

| Kategorie | Code-Präfix | Beispiele |
|-----------|-------------|-----------|
| Urlaub | U | U01 (Jahresurlaub), U02 (Sonderurlaub) |
| Unbezahlter Urlaub | U | UO (Unbezahlter Urlaub) |
| Krankheit | K | K01 (Krankheit), K02 (Kind krank) |
| Persönlicher Urlaub | S | SB (Berufsschule), S01 (Fortbildung) |

#### Was passiert nach Genehmigung?

Wenn ein Vorgesetzter eine Abwesenheit genehmigt, laufen automatisch zwei Berechnungen:

**1. Stundenberechnung (Tagesberechnung)**

Für jeden genehmigten Abwesenheitstag wird die Tagesberechnung neu ausgeführt. Die gutgeschriebenen Stunden kommen **nicht** pauschal (z. B. immer 8h), sondern aus dem Tagesplan des Mitarbeiters — mit folgender Priorität:

1. Wenn der Tagesplan `fromEmployeeMaster = true` hat → die individuellen `dailyTargetHours` des Mitarbeiters werden verwendet
2. Wenn `regularHours2` im Tagesplan gesetzt ist und ein genehmigter Abwesenheitstag vorliegt → `regularHours2` wird verwendet
3. Sonst → `regularHours` des Tagesplans (Standard: 480 Min = 8h)

Ein Mitarbeiter mit einer 20-Stunden-Woche hat also Tagespläne mit z. B. 240 Min (4h) statt 480 Min (8h). Die Sollstunden für Krankheitstage entsprechen dann automatisch den 4h — nicht 8h.

> 💡 Die Wochenarbeitszeit im Tarif (`weeklyTargetHours`) wird **nicht** für die tägliche Stundenberechnung verwendet. Der Tarif definiert den **Rhythmus** (welcher Tagesplan an welchem Wochentag gilt), und der Tagesplan definiert die konkreten Sollstunden. Die `weeklyTargetHours` im Tarif fließen nur in die Urlaubsanspruch-Berechnung (Teilzeit-Faktor) ein.

**2. Urlaubskonto-Abzug**

Nur wenn der Abwesenheitstyp den Schalter **„Beeinflusst Urlaubssaldo"** aktiviert hat (`deductsVacation = true`):

- Das System zählt alle genehmigten Abwesenheitstage dieses Typs im Kalenderjahr zusammen
- Formel pro Tag: `Tagesplan.vacationDeduction × Abwesenheit.duration` (Standard: 1,0 × 1,0 = 1 ganzer Tag)
- Die Summe wird in `VacationBalance.taken` geschrieben
- Verfügbare Tage = Anspruch + Übertrag + Anpassungen − Genommene Tage

#### Praxisbeispiel

Ein Unternehmen möchte neben den Standardtypen einen „Sonderurlaub Umzug" anlegen:

1. 📍 Verwaltung → Abwesenheitsarten → Tab „Abwesenheitsarten" → **„Neue Abwesenheitsart"**
   - Code: `U03`, Farbe: `#8B5CF6` (lila), Name: `Sonderurlaub Umzug`, Kategorie: **Urlaub**
   - Beeinflusst Urlaubssaldo: ❌ (wird nicht vom Urlaubskonto abgezogen — es ist ein Sondertag)
   - Genehmigung erforderlich: ✅
   - 📍 „Erstellen"

2. Wenn ein Mitarbeiter einen Umzugstag beantragt (📍 Abwesenheiten → „Abwesenheit beantragen" → Typ `Sonderurlaub Umzug`), muss der Vorgesetzte genehmigen. Das Urlaubskonto bleibt unberührt.

💡 **Hinweis:** Der Code-Präfix (U, K oder S) bestimmt die Zuordnung im System. Verwenden Sie `U` für Urlaubsarten und unbezahlte Abwesenheiten, `K` für Krankheit und `S` für Sonderfälle. Systemtypen (mit 🔒-Symbol) können nicht bearbeitet oder gelöscht werden — blenden Sie sie mit dem Schalter „Systemtypen anzeigen" ein.

### 4.11 Feiertage

**Was ist es?** Feiertage sind kalenderfeste Tage, an denen nicht gearbeitet wird. Terp kennt drei Kategorien: Kategorie 1 (Voll), Kategorie 2 (Halb) und Kategorie 3 (Individuell). Feiertage können für alle Mitarbeiter oder nur für bestimmte Abteilungen gelten.

**Wozu dient es?** An Feiertagen ohne Buchungen schreibt das System automatisch eine Feiertagsgutschrift (laut Tagesplan) gut, anstatt einen Fehler zu melden. Ohne konfigurierte Feiertage würde das System jeden Montag nach einem Feiertag eine „Keine Buchungen"-Meldung erzeugen. Die Generierung nach Bundesland spart die manuelle Eingabe aller 9–13 Feiertage pro Jahr.

⚠️ Berechtigung: „Feiertage verwalten"

📍 Seitenleiste → **Verwaltung** → **Feiertage**

✅ Seite mit Jahresauswahl oben und zwei Ansichten: **Kalender** (📅) und **Liste** (≡), umschaltbar oben rechts.

- **Kalenderansicht**: Volljahreskalender mit markierten Feiertagen. Klick auf einen Feiertag öffnet die Detailansicht. Klick auf ein freies Datum öffnet das Formular mit vorausgefülltem Datum.
- **Listenansicht**: Tabelle mit Spalten: Datum (mit Wochentag), Name, Kategorie (Badge: Kategorie 1 (Voll) / Kategorie 2 (Halb) / Kategorie 3 (Individuell)), Geltungsbereich (Alle oder Abteilung).

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
- Ostersonntag + Pfingstsonntag: nur BB
- Reformationstag: BB, MV, SN, ST, TH, HB, HH, NI, SH
- Mariä Himmelfahrt: BY, SL
- Internationaler Frauentag: BE, MV
- Buß- und Bettag: nur SN
- Weltkindertag: nur TH

**Wie berechnet Terp die Feiertage?** Das System verwendet keine externe API, sondern berechnet alle Daten selbst. Feste Feiertage (z. B. Neujahr, Tag der Deutschen Einheit) haben ein fixes Datum. Bewegliche Feiertage (Karfreitag, Ostermontag, Christi Himmelfahrt, Pfingstmontag, Fronleichnam) werden als Offset zum Ostersonntag berechnet, der mit dem Gauß/Meeus-Algorithmus bestimmt wird. Der Buß- und Bettag wird als letzter Mittwoch vor dem 23. November berechnet.

##### Feiertage aus einem anderen Jahr kopieren

1. 📍 **„Kopieren"**-Button (📋)
2. **Quelljahr** und **Zieljahr** eingeben
3. Optional: „Heiligabend als halber Tag" und „Silvester als halber Tag" (Schalter)
4. 📍 „Kopieren"

##### Einzelnen Feiertag anlegen

1. 📍 **„Neuer Feiertag"** (+)
2. Ausfüllen: Datum (Kalender), Name (Pflicht), Kategorie (Kategorie 1 (Voll) / Kategorie 2 (Halb) / Kategorie 3 (Individuell)), „Gilt für alle" (Schalter — wenn aus: Abteilung wählen)
3. 📍 „Feiertag erstellen"

#### Praxisbeispiel

Jahreseinrichtung für ein Unternehmen in Bayern:

1. 📍 Verwaltung → Feiertage → **„Generieren"** (🪄) → Jahr: `2026`, Bundesland: **Bayern** → 📍 „Generieren"
   ✅ 13 Feiertage werden angelegt (inkl. Heilige Drei Könige, Fronleichnam, Mariä Himmelfahrt, Allerheiligen)

2. Zusätzlich Heiligabend und Silvester als halbe Tage:
   📍 **„Neuer Feiertag"** → Datum: `24.12.2026`, Name: `Heiligabend`, Kategorie: **Kategorie 2 (Halb)** → 📍 „Feiertag erstellen"
   📍 **„Neuer Feiertag"** → Datum: `31.12.2026`, Name: `Silvester`, Kategorie: **Kategorie 2 (Halb)** → 📍 „Feiertag erstellen"

3. Nächstes Jahr: 📍 **„Kopieren"** (📋) → Quelljahr: `2026`, Zieljahr: `2027`, „Heiligabend als halber Tag" ✅, „Silvester als halber Tag" ✅ → 📍 „Kopieren"

💡 **Hinweis:** Feiertage müssen jedes Jahr neu angelegt oder kopiert werden, da sich bewegliche Feiertage (Ostern, Pfingsten, Himmelfahrt) verschieben. Nutzen Sie die Generierungsfunktion — sie berechnet alle beweglichen Feiertage korrekt. Vergessen Sie nicht, ggf. auch das Folgejahr zu generieren, damit die Schichtplan-Generierung Feiertage korrekt berücksichtigt.

### 4.12 Konten

**Was ist es?** Konten sind Sammelstellen für Zeitwerte. Jedes Konto speichert einen bestimmten Stundenwert pro Mitarbeiter und Monat — z. B. Gleitzeitstunden, Überstunden, Nachtzuschläge oder Feiertagszuschläge. Konten gibt es in drei Typen:

| Kontotyp | Symbol | Bedeutung | Beispiel |
|----------|--------|-----------|---------|
| **Bonus** | 🏆 | Zusatzvergütung für bestimmte Arbeitszeiten | Nachtzuschlag, Feiertagszuschlag, Sonntagszuschlag |
| **Erfassung** | 📊 | Aufzeichnung von Zeitwerten ohne Vergütungseffekt | Reisezeit, Bereitschaftszeit |
| **Saldo** | ⚖️ | Laufendes Guthaben, das sich monatlich fortschreibt | Gleitzeitkonto, Überstundenkonto |

**Wozu dient es?** Konten verbinden Zeiterfassung mit Lohnabrechnung. Die im Lohnexport enthaltenen Spalten werden aus den Konten gespeist: Ist ein Konto als „Lohnrelevant" markiert und einer Exportschnittstelle zugeordnet, erscheint sein Wert als eigene Spalte in der CSV-Datei. Ohne Konten würde der Lohnexport nur Soll- und Ist-Stunden enthalten — Zuschläge und Sonderstunden gingen verloren.

⚠️ Berechtigung: „Konten verwalten"

📍 Seitenleiste → **Verwaltung** → **Konten**

✅ Seite mit zwei Tabs: **Konten** und **Gruppen**. Die Kontentabelle ist nach Typ gruppiert (Bonus-Konten, Erfassungskonten, Saldenkonten).

Tabellenspalten: Typ-Symbol, Code, Name, Typ (Badge), Einheit (Minuten/Stunden/Tage), Nutzung, Status (mit Aktiv/Inaktiv-Schalter).

**Filter:** Suchfeld, Typ (Alle/Bonus/Erfassung/Saldo), Status, „Systemkonten anzeigen" (Schalter)

##### Neues Konto anlegen

1. 📍 Tab „Konten" → **„Neues Konto"** (oben rechts)
2. Ausfüllen: Code (Pflicht, Großbuchstaben), Name (Pflicht), Beschreibung, Kontotyp (Bonus/Erfassung/Saldo — bei Bearbeitung gesperrt), Lohnrelevant (Schalter), Lohncode, Einheit (Minuten/Stunden/Tage), Jahresübertrag (Schalter), Sortierung
3. 📍 „Erstellen"

**Wichtige Systemkonten:** FLEX (Gleitzeitkonto), OT (Überstundenkonto), VAC (Urlaubskonto) — diese können nicht gelöscht werden.

#### Wo Konten außerdem erscheinen

| Ort | Pfad | Was angezeigt wird |
|-----|------|--------------------|
| Exportschnittstelle — Konten zuordnen | 📍 Administration → Exportschnittstellen → ⋯ → „Konten verwalten" | Duale-Liste: verfügbare und zugeordnete Konten mit Sortierung |
| Exportschnittstelle — Detailansicht | 📍 Administration → Exportschnittstellen → ⋯ → Details | Tabelle der zugeordneten Konten (Code, Name, Lohncode) |
| Lohnexport — Vorschau | 📍 Administration → Lohnexporte → ⋯ → Vorschau | Jedes zugeordnete Konto wird als eigene Spalte angezeigt (Spaltenüberschrift = Konto-Code) |
| Lohnexport — Erstellen | 📍 Administration → Lohnexporte → Export erstellen → Erweiterte Parameter | Optionaler Filter: nur bestimmte Konten-IDs einschließen |
| Monatsauswertung | 📍 Monatsauswertung | Karte „Flexzeitsaldo" zeigt den FLEX-Kontostand am Monatsende |
| Jahresübersicht | 📍 Jahresübersicht | Karte „Flexzeitsaldo" und Diagramm mit monatlichem Verlauf aus dem FLEX-Konto |
| Berichte generieren | 📍 Administration → Berichte → Bericht erstellen | Berichtstyp „Kontostände" unter „Zeitanalyse" |
| Berechnungsregeln | 📍 Verwaltung → Berechnungsregeln | Jede Regel verweist auf ein Zielkonto, in das der berechnete Wert geschrieben wird |
| Kontobuchungen | 📍 Verwaltung → Konten → ⋮-Menü → „Buchungen anzeigen" | Eigene Seite: welcher Mitarbeiter wie viele Stunden pro Monat gebucht hat, filterbar nach Abteilung/Standort |

##### Kontobuchungen einsehen

Öffnen Sie in der Kontentabelle das **⋮-Menü** (drei Punkte) einer Zeile und wählen Sie **„Buchungen anzeigen"**. Es öffnet sich eine eigene Seite mit den Buchungen des gewählten Kontos.

**Monatsnavigation:** Mit den Pfeilknöpfen (◀ ▶) wechseln Sie den Monat.

**Filter:** Über die Dropdown-Felder „Abteilung" und „Standort" können Sie die Liste auf bestimmte Mitarbeiter eingrenzen.

**Sortierung:** Klicken Sie auf die Spaltenüberschrift „Mitarbeiter" oder „Stunden", um die Sortierreihenfolge zu ändern.

| Spalte | Bedeutung |
|--------|-----------|
| **PersNr** | Personalnummer des Mitarbeiters |
| **Mitarbeiter** | Nachname, Vorname (sortierbar) |
| **Abteilung** | Abteilung des Mitarbeiters |
| **Standort** | Standort des Mitarbeiters |
| **Stunden** | Summe der gebuchten Minuten im Format H:MM (sortierbar) |

Am Ende der Tabelle steht die **Gesamtsumme** aller (gefilterten) Mitarbeiter.

**CSV-Export:** Über den Button „CSV exportieren" können Sie die aktuell angezeigte (gefilterte) Liste als CSV-Datei herunterladen. Der Zurück-Button führt zurück zur Kontenübersicht.

> 💡 Die Buchungen stammen aus der automatischen Tagesberechnung (Netto-Zeit, gedeckelte Zeit, Zuschläge). Sie werden bei jeder Tagesberechnung automatisch aktualisiert.

#### Praxisbeispiel

Ein Unternehmen möchte Nachtzuschläge und Sonntagszuschläge im Lohnexport ausweisen:

1. 📍 Verwaltung → **Konten** → **„Neues Konto"**
   - Code: `NZ`, Name: `Nachtzuschlag`, Kontotyp: **Bonus**, Einheit: **Stunden**, Lohnrelevant: ✓, Lohncode: `1015` → 📍 „Speichern"

2. 📍 **„Neues Konto"**
   - Code: `SZ`, Name: `Sonntagszuschlag`, Kontotyp: **Bonus**, Einheit: **Stunden**, Lohnrelevant: ✓, Lohncode: `1020` → 📍 „Speichern"

3. 📍 Administration → **Exportschnittstellen** → Schnittstelle öffnen → ⋯ → **„Konten verwalten"** → `NZ` und `SZ` von links nach rechts verschieben → 📍 „Speichern"

4. Beim nächsten Lohnexport (📍 Administration → Lohnexporte → Vorschau) erscheinen die Spalten `NZ` und `SZ` mit den Zuschlagsstunden pro Mitarbeiter.

💡 **Hinweis:** Konten müssen als **„Lohnrelevant"** markiert und einer **Exportschnittstelle zugeordnet** sein, damit sie im Lohnexport erscheinen. Die Reihenfolge in der Exportschnittstelle bestimmt die Spaltenreihenfolge in der CSV-Datei. Der **Lohncode** wird an den Steuerberater übermittelt und muss mit dem verwendeten Abrechnungsprogramm (z. B. DATEV) abgestimmt sein.

### 4.13 Berechnungsregeln

**Was ist es?** Eine Berechnungsregel definiert, wie viele Stunden bei einer Abwesenheit auf ein bestimmtes Konto gutgeschrieben werden. Die Formel lautet:

> **Kontowert = Wert × Faktor**

Wenn der **Wert = 0** ist, wird automatisch die **Tagessollzeit** des Mitarbeiters verwendet (z. B. 8 Stunden bei einem 8-Stunden-Plan). Der **Faktor** ist ein Multiplikator (z. B. 1,0 = volle Gutschrift, 0,5 = halbe Gutschrift).

**Wozu dient es?** Berechnungsregeln sorgen dafür, dass bei Krankheit, Urlaub oder Sonderabwesenheiten automatisch der richtige Stundenwert auf das richtige Konto gebucht wird. Ohne Berechnungsregeln müsste ein Administrator jeden Abwesenheitstag manuell mit einem Stundenwert versehen.

⚠️ Berechtigung: „Abwesenheitsarten verwalten"

📍 Seitenleiste → **Verwaltung** → **Berechnungsregeln**

✅ Tabelle mit Spalten: Code, Name, Wert, Faktor, Konto, Status.

#### Neue Berechnungsregel anlegen

1. 📍 **„Neue Regel"** (oben rechts)
2. Ausfüllen: Code (Pflicht), Name (Pflicht), Wert (0 = Tagessollzeit verwenden), Faktor, Konto (Dropdown aus aktiven Konten)
3. 📍 „Speichern"

Wird kein Konto gewählt, ist die Regel zwar angelegt, schreibt aber keinen Wert in ein Konto. Regeln, die von Abwesenheitsarten verwendet werden, können nicht gelöscht werden.

#### Praxisbeispiel

Ein Unternehmen möchte, dass bei Krankheit die volle Tagessollzeit als „Krankheitsstunden" auf ein eigenes Konto gebucht wird:

1. **Konto anlegen** (falls nicht vorhanden):
   📍 Verwaltung → Konten → „Neues Konto"
   - Code: `KR`, Name: `Krankheitsstunden`, Kontotyp: **Erfassung**, Einheit: **Stunden**, Lohnrelevant: ✓ → 📍 „Speichern"

2. **Berechnungsregel anlegen:**
   📍 Verwaltung → **Berechnungsregeln** → **„Neue Regel"**
   - Code: `BRK`, Name: `Krankheit Vollzeit-Gutschrift`
   - Wert: `0` (= Tagessollzeit verwenden, z. B. 8 Stunden)
   - Faktor: `1,00` (= volle Gutschrift)
   - Konto: `KR (Krankheitsstunden)`
   - 📍 „Speichern"

3. **Abwesenheitstyp verknüpfen** (über die API, da die Verknüpfung aktuell nicht in der Oberfläche der Abwesenheitsarten sichtbar ist):
   Der Abwesenheitstyp „Krankheit" (K01) wird mit der Berechnungsregel `BRK` verknüpft.

4. Wenn nun ein Mitarbeiter mit 8 Stunden Tagessollzeit einen Tag krank gemeldet wird, berechnet das System: **0 (= 8 Std. Sollzeit) × 1,00 = 8 Stunden** → werden auf das Konto `KR` gebucht.

💡 **Hinweis:** Berechnungsregeln sind nur dann notwendig, wenn Sie Abwesenheitsstunden in einem eigenen Konto erfassen möchten (z. B. für den Lohnexport oder für statistische Auswertungen). Für die reine Urlaubskontoführung (Tage abziehen) werden keine Berechnungsregeln benötigt — das erledigt der Abwesenheitstyp selbst über die Einstellung „Urlaub betroffen".

### 4.14 Kontaktarten

**Was ist es?** Kontaktarten definieren die Kategorien, in denen Kontaktinformationen für Mitarbeiter gespeichert werden können (z. B. E-Mail, Telefon, Notfallkontakt). Jede Art hat einen **Datentyp** (Text, E-Mail, Telefon oder URL) und kann **Unterarten** enthalten (z. B. Art „Telefon" → Unterarten „Privat", „Geschäftlich", „Mobil").

**Wozu dient es?** Kontaktarten strukturieren die Kontaktdaten Ihrer Mitarbeiter einheitlich. Statt eines einzigen Freitextfelds kann für jeden Mitarbeiter eine beliebige Anzahl typgerechter Kontakteinträge gespeichert werden — mit Validierung (z. B. E-Mail-Format) und Kennzeichnung des Hauptkontakts.

⚠️ Berechtigung: „Kontaktverwaltung"

📍 Seitenleiste → **Verwaltung** → **Kontaktarten**

✅ Zweigeteilte Ansicht: Links **Kontaktarten**, rechts **Kontaktunterarten** (erscheinen nach Auswahl einer Art).

#### Kontaktarten und Unterarten anlegen

1. 📍 Linke Spalte → **„Neuer Typ"** → Code, Name, Datentyp (Text/E-Mail/Telefon/URL), Beschreibung, Sortierung eingeben → 📍 „Speichern"
2. 📍 Art anklicken → rechte Spalte zeigt deren Unterarten
3. 📍 Rechte Spalte → **„Neue Unterart"** → Code, Bezeichnung, Sortierung eingeben → 📍 „Speichern"

Der Datentyp kann nach dem Anlegen nicht mehr geändert werden.

#### Wo Kontakte außerdem erscheinen

| Ort | Pfad | Was angezeigt wird |
|-----|------|--------------------|
| Eigenes Profil | 📍 Benutzermenü → Profil → Karte „Kontakte" | Liste der eigenen Kontakteinträge mit Typ-Badge, Wert und optionalem Label. Buttons zum Hinzufügen und Löschen von Kontakten |
| Mitarbeiterdetails (Admin) | 📍 Verwaltung → Mitarbeiter → Zeile anklicken → Detailansicht | Abschnitt „Kontakte" zeigt alle Einträge (nur Leseansicht, kein Bearbeiten/Löschen) |

**Kontakt auf dem eigenen Profil hinzufügen:**

1. 📍 Benutzermenü → **Profil** → Karte „Kontakte" → **„+"** (Hinzufügen)
2. Im Formular (Einblendung von rechts):
   - **Typ** wählen (E-Mail / Telefon / Mobil / Notfallkontakt)
   - **Wert** eingeben (z. B. E-Mail-Adresse oder Telefonnummer)
   - **Bezeichnung** (optional, z. B. „Privat")
   - **Hauptkontakt** (Checkbox)
3. 📍 „Erstellen"

#### Praxisbeispiel

Ein Unternehmen möchte Notfallkontakte strukturiert erfassen:

1. 📍 Verwaltung → **Kontaktarten** → Linke Spalte → **„Neuer Typ"**
   - Code: `NOTFALL`, Name: `Notfallkontakt`, Datentyp: **Telefon** → 📍 „Speichern"
2. 📍 `NOTFALL` anklicken → Rechte Spalte → **„Neue Unterart"**
   - Code: `PARTNER`, Bezeichnung: `Lebenspartner` → 📍 „Speichern"
   - Code: `ELTERN`, Bezeichnung: `Eltern` → 📍 „Speichern"

3. Ein Mitarbeiter öffnet sein Profil (📍 Benutzermenü → Profil), klickt auf „+" in der Kontaktkarte, wählt Typ „Notfallkontakt", gibt die Telefonnummer ein und setzt „Hauptkontakt" als Checkbox.

💡 **Hinweis:** Die Konfigurationsseite unter Verwaltung → Kontaktarten definiert die verfügbaren Kategorien. Die tatsächlichen Kontakteinträge der Mitarbeiter werden auf der Profilseite gepflegt. Kontaktarten sind optional — das System funktioniert auch ohne sie, aber Mitarbeiter können dann keine strukturierten Kontakte auf ihrem Profil hinterlegen.

---

## 5. Zeiterfassung — Täglicher Betrieb

### 5.1 Dashboard — Die Startseite

**Was ist es?** Das Dashboard ist die Startseite nach der Anmeldung. Es zeigt auf einen Blick den aktuellen Arbeitstag: Zeitplan, Wochenstunden, Urlaubsrest, Flexzeitsaldo, offene Fehler und die letzten Aktivitäten.

**Wozu dient es?** Mitarbeiter sehen sofort, ob sie eingestempelt sind, wie viele Stunden sie diese Woche gearbeitet haben und ob es offene Fehler gibt. Die Schnellaktionen ermöglichen direktes Ein-/Ausstempeln, ohne die Stempeluhr-Seite öffnen zu müssen.

📍 Seitenleiste → **Dashboard** (oder Logo „T" anklicken)

✅ Sie sehen:
- **Begrüßung** mit Tageszeit und Ihrem Namen, darunter das aktuelle Datum
- **Schnellaktionen**: Buttons „Einstempeln" / „Ausstempeln" (je nach Status), „Abwesenheit beantragen", „Zeitnachweis anzeigen"
- **Vier Karten**: Heutiger Zeitplan, Wochenstunden, Urlaubsrest, Flexzeitsaldo
- **Offene Aktionen**: Tage der letzten 14 Tage mit Fehlern oder offenem Status (klickbar → öffnet Zeitnachweis)
- **Letzte Aktivitäten**: Die letzten 5 Buchungen mit Symbol, Uhrzeit und relativem Datum

#### Praxisbeispiel

Ein Mitarbeiter meldet sich morgens an und sieht auf dem Dashboard: Karte „Heutiger Zeitplan" zeigt `Büro (08:00–16:30)`, Karte „Wochenstunden" zeigt `24:00 / 40:00`, Karte „Urlaubsrest" zeigt `18 Tage`, Karte „Flexzeitsaldo" zeigt `+3:30`. Unter „Offene Aktionen" erscheint ein roter Eintrag für gestern — er hat vergessen auszustempeln. Ein Klick darauf öffnet den Zeitnachweis für gestern, wo er die fehlende Buchung nachtragen kann.

💡 **Hinweis:** Die Karte „Offene Aktionen" zeigt nur die letzten 14 Tage. Ältere Fehler finden Sie im Korrekturassistenten (📍 Verwaltung → Korrekturassistent). Ein Klick auf einen fehlerhaften Tag in den offenen Aktionen springt direkt zum Zeitnachweis dieses Tages.

### 5.2 Stempeluhr — Ein- und Ausstempeln

**Was ist es?** Die Stempeluhr ist die zentrale Seite für die tägliche Zeiterfassung. Sie zeigt eine große Digitaluhr, den aktuellen Status (eingestempelt / ausgestempelt / in Pause) und einen laufenden Timer seit dem letzten Einstempeln.

**Wozu dient es?** Mitarbeiter erfassen hier ihre Arbeitszeit mit einem einzigen Klick. Das System erkennt automatisch die richtige Aktion (Einstempeln → Pause → Ausstempeln) anhand des aktuellen Status und erzeugt die passenden Buchungen mit den Systemtypen (A1/A2/P1/P2).

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

#### Praxisbeispiel

Ein typischer Arbeitstag:
1. 08:02 — Mitarbeiter klickt **„Einstempeln"** → Status wechselt zu „Eingestempelt", Timer startet
2. 12:00 — Klick auf **„Pause"** → Status wechselt zu „In Pause", Timer pausiert
3. 12:30 — Klick auf **„Pause Ende"** → Timer läuft weiter
4. 16:35 — Klick auf **„Ausstempeln"** → Tagesstatistiken zeigen: Brutto 08:33, Pause 00:30, Netto 08:03, Soll 08:00, Überstunden +00:03

💡 **Hinweis:** Die Stempeluhr kann auch über die Schnellaktion auf dem Dashboard erreicht werden. Auf Mobilgeräten ist sie über die Schnellnavigation am unteren Bildschirmrand mit einem Klick erreichbar. Die Buttons „Pause" und „Dienstgang" erscheinen nur im Zustand „Eingestempelt".

### 5.3 Zeitnachweis — Buchungen und Tageswerte

**Was ist es?** Der Zeitnachweis ist die detaillierte Ansicht aller Buchungen und berechneten Tageswerte eines Mitarbeiters. Er zeigt drei Ebenen: Tag (einzelne Buchungen), Woche (Tagesübersicht) und Monat (Monatsübersicht).

**Wozu dient es?** Der Zeitnachweis ist die zentrale Stelle für die Überprüfung und Korrektur von Arbeitszeiten. Hier werden fehlende Buchungen nachgetragen, fehlerhafte Zeiten korrigiert und Tageswerte geprüft. Für Manager ist er das wichtigste Werkzeug neben dem Korrekturassistenten.

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

#### Praxisbeispiel

Ein Mitarbeiter hat vergessen, sich am Montag auszustempeln:

1. 📍 Zeitnachweis → Tab „Tag" → Datum: Montag wählen → ✅ Nur eine Buchung sichtbar: Kommen 08:00. Status: „Fehler" (rot).
2. 📍 **„Buchung hinzufügen"** → Buchungstyp: `Gehen`, Uhrzeit: `16:30`, Notizen: `Nachträglich ergänzt` → 📍 „Erstellen"
3. ✅ Der Tag wird automatisch neu berechnet: Netto 08:00, Status wechselt zu „OK" (grün).

💡 **Hinweis:** Der Zeitnachweis zeigt standardmäßig die eigenen Daten. Administratoren können oben im Dropdown einen anderen Mitarbeiter wählen (bis 250 Mitarbeiter). Buchungen können nur bearbeitet werden, wenn der Monat noch nicht abgeschlossen ist. In der Wochenansicht erkennen Sie fehlerhafte Tage an roten Status-Badges.

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

**Was ist es?** Eine Schicht ist ein benanntes Arbeitszeitpaket mit einer Farbe und einem optionalen Tagesplan. Schichten werden auf der Planungstafel als farbige Chips dargestellt und Mitarbeitern per Drag & Drop zugewiesen.

**Wozu dient es?** Schichten ermöglichen es, Arbeitszeitpakete visuell zu planen, ohne jedes Mal den Tagesplan manuell zuweisen zu müssen. Der Schichtplaner (Planungstafel) zeigt auf einen Blick, wer wann arbeitet. Schichten können auch ohne Tagesplan existieren — dann dienen sie nur als visuelle Markierung.

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

#### Praxisbeispiel

Drei Schichten für einen Produktionsbetrieb anlegen:

| Code | Name | Farbe | Tagesplan |
|------|------|-------|-----------|
| `FS` | Frühschicht | Grün (#22C55E) | FS (Frühschicht) |
| `SS` | Spätschicht | Orange (#F97316) | SS (Spätschicht) |
| `NS` | Nachtschicht | Blau (#3B82F6) | NS (Nachtschicht) |

Ein vollständiges Praxisbeispiel mit Schichtdefinition, Tarif-Konfiguration und Planungstafel finden Sie in Abschnitt **6.6**.

💡 **Hinweis:** Die Verknüpfung mit einem Tagesplan ist optional. Ohne Tagesplan dient die Schicht nur als visuelle Markierung in der Planungstafel. Mit Tagesplan wird beim Zuweisen der Schicht automatisch der verknüpfte Arbeitszeitplan für den Mitarbeiter an diesem Tag aktiviert.

### 6.2 Planungstafel — Schichten zuweisen

**Was ist es?** Die Planungstafel ist eine kalenderartige Ansicht, in der Zeilen Mitarbeiter und Spalten Tage darstellen. Farbige Schicht-Chips werden per Drag & Drop oder Klick in die Zellen gezogen.

**Wozu dient es?** Die Planungstafel gibt dem Schichtplaner einen visuellen Überblick über den gesamten Einsatzplan. Im Vergleich zur automatischen Tarif-Rotation (Abschnitt 6.3) erlaubt sie manuelle Eingriffe — z. B. für Krankheitsvertretungen, Urlaubsabdeckung oder kurzfristige Planänderungen.

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

#### Praxisbeispiel

Ein Mitarbeiter soll in KW 3 ausnahmsweise Frühschicht statt Spätschicht arbeiten:

1. 📍 Planungstafel → Ansichtsmodus: **Woche** → zur KW 3 navigieren
2. 📍 Zelle für den Mitarbeiter am gewünschten Tag anklicken → Schicht auf `FS` (Frühschicht) ändern → 📍 „Speichern"
3. ✅ Die Zelle zeigt `FS` (grün) statt `SS` (orange). Alle anderen Tage bleiben unverändert.

💡 **Hinweis:** Manuelle Änderungen in der Planungstafel werden bei der automatischen Schichtplan-Generierung (Sonntag 1:00 Uhr) **nicht überschrieben**. Nutzen Sie den Ansichtsmodus „Monat" für einen besseren Überblick, und den Abteilungsfilter, um nur relevante Mitarbeiter zu sehen.

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

**Was ist es?** Die Abwesenheitsseite zeigt das eigene Urlaubskonto, alle bisherigen Anträge und einen Kalenderüberblick. Von hier aus werden neue Abwesenheitsanträge gestellt — egal ob Urlaub, Krankheit oder Sonderurlaub.

**Wozu dient es?** Mitarbeiter beantragen hier ihre Abwesenheiten digital statt auf Papier. Das System prüft automatisch Wochenenden, Feiertage und bereits belegte Tage, berechnet die betroffenen Arbeitstage und zeigt eine Urlaubsvorschau mit dem neuen Kontostand.

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

#### Praxisbeispiel

Ein Mitarbeiter möchte zwei Wochen Urlaub beantragen (23.03.–03.04.2026):

1. 📍 Abwesenheiten → **„Abwesenheit beantragen"** (+)
2. Typ: `Jahresurlaub` → Datumsbereich: `23.03.2026 – 03.04.2026` wählen
3. ✅ Das System berechnet: 10 Arbeitstage (Wochenenden werden übersprungen). Die Urlaubsvorschau zeigt: 18 Tage verfügbar → 10 Tage beantragt → 8 Tage verbleibend.
4. 📍 „Antrag absenden"
5. ✅ Der Antrag erscheint links mit Status „Beantragt" (gelb). Der Vorgesetzte wird benachrichtigt.

💡 **Hinweis:** Anträge können nur im Status „Beantragt" bearbeitet werden. Einmal genehmigte Anträge können nur noch storniert (nicht bearbeitet) werden. Wochenenden und Feiertage innerhalb des gewählten Datumsbereichs werden automatisch übersprungen und nicht als Abwesenheitstage gezählt.

### 7.2 Urlaub — Jahresübersicht des Urlaubskontos

**Was ist es?** Die Urlaubsseite zeigt die Jahresübersicht des eigenen Urlaubskontos mit einem großen Saldo, einem Fortschrittsbalken und einer detaillierten Aufstellung (Anspruch, Übertrag, Genommen, Geplant, Verfügbar).

**Wozu dient es?** Mitarbeiter sehen hier jederzeit, wie viele Urlaubstage ihnen noch zustehen. Die Buchungshistorie zeigt alle Urlaubstransaktionen chronologisch. Die Ansicht kann jahresweise gewechselt werden, um auch vergangene Jahre einzusehen.

📍 Seitenleiste → **Urlaub**

✅ Sie sehen eine Seite mit Jahresauswahl (← Jahr →) und drei Bereichen:

**Links — Saldoübersicht:**
- Große Zahl: Verbleibende Tage
- Fortschrittsbalken: Genommen (grün) / Geplant (gelb) / Verfügbar (grau)
- Aufstellung: Basisanspruch + Zusatztage + Übertrag + Anpassungen = Gesamtanspruch, Genommen, Geplant, Verfügbar

**Rechts oben — Kommende Urlaube:** Genehmigte und beantragte Urlaube (nur aktuelles Jahr)

**Rechts unten — Buchungshistorie:** Tabelle mit Spalten: Datum, Typ, Dauer, Status (Badge), Notizen

#### Praxisbeispiel

Ein Mitarbeiter prüft seinen Urlaubsstand für 2026:

📍 Urlaub → Jahr: **2026** → ✅ Saldoübersicht zeigt: Anspruch 30, Übertrag 3, Genommen 15, Geplant 5, **Verfügbar: 13 Tage**. Der Fortschrittsbalken ist zur Hälfte grün (genommen) und zu einem Sechstel gelb (geplant).

💡 **Hinweis:** Die Seite zeigt immer den Stand des gewählten Jahres. Vergangene Jahre können über die Jahresnavigation (←/→) eingesehen werden. Die Buchungshistorie listet jeden einzelnen Urlaubstag chronologisch auf.

### 7.3 Der Genehmigungsworkflow

Jede Abwesenheit durchläuft folgende Zustände:

```
Beantragt  →  Genehmigt  →  (Storniert)
           →  Abgelehnt
```

| Aktion | Wer | Was passiert |
|--------|-----|-------------|
| **Beantragen** | Mitarbeiter | Status „Beantragt", Tag wird berechnet |
| **Genehmigen** | Vorgesetzter | Status „Genehmigt", Tagesberechnung + Urlaubskonto werden aktualisiert (siehe unten), Benachrichtigung an Mitarbeiter |
| **Ablehnen** | Vorgesetzter | Status „Abgelehnt" mit Begründung, Benachrichtigung an Mitarbeiter |
| **Stornieren** | Vorgesetzter | Nur für genehmigte Abwesenheiten, Urlaubskonto wird zurückgerechnet |

> **Automatische Genehmigung:** Wenn der Abwesenheitstyp den Schalter „Genehmigung erforderlich" deaktiviert hat, werden Abwesenheiten dieses Typs bei Erstellung automatisch genehmigt — ohne Genehmigungsworkflow. Die Stunden- und Urlaubskonto-Berechnung läuft sofort. Der Ersteller wird als Genehmiger eingetragen. Automatisch genehmigte Abwesenheiten können wie manuell genehmigte storniert, aber nicht mehr bearbeitet werden.

#### Was passiert nach der Genehmigung im System?

Nach der Genehmigung durch den Vorgesetzten laufen automatisch zwei Berechnungen:

**1. Tagesberechnung (Stundenkredit)**

Für jeden genehmigten Abwesenheitstag wird die Tagesberechnung neu ausgeführt. Die gutgeschriebenen Stunden kommen **nicht** pauschal (z. B. immer 8h), sondern aus dem Tagesplan des Mitarbeiters — mit folgender Priorität:

1. Wenn der Tagesplan `Stunden vom Mitarbeiterstamm` aktiviert hat → die individuellen Tagessollstunden des Mitarbeiters
2. Wenn `Abwesenheitsstunden` im Tagesplan gesetzt und ein genehmigter Abwesenheitstag vorliegt → Abwesenheitsstunden werden verwendet
3. Sonst → die regulären Sollstunden des Tagesplans (Standard: 480 Min = 8h)

> **Beispiel:** Ein Mitarbeiter mit 20-Stunden-Woche hat Tagespläne mit 240 Min (4h). Wird ein Krankheitstag genehmigt, werden 4h gutgeschrieben — nicht 8h. Die Stunden richten sich immer nach dem konkreten Tagesplan, der über den Tarif-Rhythmus dem Mitarbeiter zugewiesen ist.

**2. Urlaubskonto-Aktualisierung**

Nur bei Abwesenheitstypen mit aktiviertem Schalter „Beeinflusst Urlaubssaldo" (`deductsVacation`):

- Das System summiert alle genehmigten Abwesenheitstage dieses Typs im Kalenderjahr
- Pro Tag: `Tagesplan.vacationDeduction × Abwesenheit.duration` (Standard: 1,0 × 1,0 = 1 Tag)
- Die Summe wird als „Genommene Tage" im Urlaubskonto hinterlegt
- Bei Stornierung wird die gleiche Berechnung erneut ausgeführt — das Konto korrigiert sich automatisch

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

**Was ist es?** Die Urlaubskonfiguration enthält alle Regeln, die bestimmen, wie Urlaubsansprüche berechnet, begrenzt und übertragen werden. Sie ist in sechs Bereiche gegliedert: Sonderberechnungen, Berechnungsgruppen, Kappungsregeln, Kappungsregelgruppen, Ausnahmen und Vorschauen.

**Wozu dient es?** Hier werden komplexe Urlaubsregeln abgebildet: Zusatztage nach Alter oder Betriebszugehörigkeit, Kappung des Übertrags am Jahresende und individuelle Ausnahmen für einzelne Mitarbeiter. Ohne diese Konfiguration würde jeder Mitarbeiter den gleichen Grundanspruch erhalten.

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

Ein vollständiges Praxisbeispiel zur Urlaubskonfiguration (Kappungsregeln, Altersbonus, Jahreswechsel) finden Sie in Abschnitt **7.8**.

💡 **Hinweis:** Die Urlaubskonfiguration ist nur für Unternehmen relevant, die komplexe Regeln abbilden müssen (Zusatztage nach Alter, Kappung des Übertrags). Für einfache Setups (alle Mitarbeiter gleicher Anspruch, voller Übertrag) reicht die Grundkonfiguration im Tarif aus.

### 7.6 Urlaubskonten verwalten

**Was ist es?** Die Urlaubskontenverwaltung zeigt eine Tabelle aller Mitarbeiter mit deren Urlaubssalden für ein gewähltes Jahr. Hier werden Urlaubskonten initialisiert und individuelle Anpassungen vorgenommen.

**Wozu dient es?** Am Jahresbeginn müssen die Urlaubskonten für das neue Jahr angelegt werden. Die Initialisierung berechnet automatisch den Anspruch jedes Mitarbeiters (inkl. Anteilsberechnung, Altersbonus, Teilzeitfaktor). Manuelle Anpassungen — z. B. für Sonderurlaub oder nachträgliche Korrekturen — werden ebenfalls hier vorgenommen.

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

#### Praxisbeispiel

Jahresinitialisierung für 2027:

1. 📍 Verwaltung → Urlaubskonten → **„Jahr initialisieren"** → Jahr: `2027`, Übertrag: ✅ → 📍 „Initialisieren"
2. ✅ Das System berechnet für jeden Mitarbeiter den Anspruch 2027 (inkl. Anteilsberechnung, Boni, Teilzeitfaktor) und den Übertrag aus 2026 (unter Berücksichtigung der Kappungsregeln).
3. 📍 Mitarbeiter „Becker, Anna" → ⋯ → **„Saldo bearbeiten"** → Manuelle Anpassung: `+2` (Sonderurlaub Betriebsjubiläum) → 📍 „Speichern"

Ein vollständiges Praxisbeispiel finden Sie in Abschnitt **7.8**.

💡 **Hinweis:** Die Jahresinitialisierung muss nur einmal pro Jahr durchgeführt werden. Sie kann beliebig oft wiederholt werden — bestehende Konten werden aktualisiert, nicht dupliziert. Manuelle Anpassungen bleiben beim erneuten Initialisieren erhalten.

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

**Was ist es?** Die Genehmigungsseite zeigt alle ausstehenden Abwesenheitsanträge und Zeitnachweise, die auf eine Genehmigung durch den Vorgesetzten warten. Sie ist in zwei Tabs aufgeteilt: Zeitnachweise und Abwesenheiten.

**Wozu dient es?** Manager bearbeiten hier die Anträge ihrer Mitarbeiter — genehmigen, ablehnen oder massenweise freigeben. Die Badges an den Tabs zeigen sofort, wie viele offene Anträge warten.

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

#### Praxisbeispiel

Am Monatsende genehmigt ein Manager alle offenen Urlaubsanträge:

1. 📍 Verwaltung → Genehmigungen → Tab **„Abwesenheiten"** → Status: `Beantragt`
2. ✅ 5 offene Anträge sichtbar. Checkbox **„Alle auswählen"** aktivieren.
3. 📍 **„Ausgewählte genehmigen"** → Alle 5 Anträge wechseln sofort auf Status „Genehmigt" (grün).

💡 **Hinweis:** Genehmigungen können nach Team gefiltert werden — so sieht ein Teamleiter nur die Anträge seiner Teammitglieder. Die Massengenehmigungs-Funktion (Checkboxen + „Ausgewählte genehmigen") spart Zeit am Monatsende, wenn viele Zeitnachweise gleichzeitig freigegeben werden müssen.

### 8.2 Korrekturassistent

**Was ist es?** Der Korrekturassistent ist ein Diagnose-Werkzeug, das automatisch Fehler und Hinweise in den Tageswerten aller Mitarbeiter erkennt — z. B. fehlende Buchungen, Kernzeitverstöße oder Pausenregelverletzungen. Er zeigt eine filterbare Liste aller problematischen Tage.

**Wozu dient es?** Vor dem Monatsabschluss muss sichergestellt werden, dass keine fehlerhaften Tage existieren. Der Korrekturassistent zeigt auf einen Blick, welche Mitarbeiter an welchen Tagen welche Probleme haben. Ohne dieses Werkzeug müsste der Manager den Zeitnachweis jedes Mitarbeiters einzeln durchgehen.

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

#### Praxisbeispiel

Der vollständige Ablauf „Fehler finden → korrigieren → Monat abschließen" ist in Abschnitt **8.3.1** als Praxisbeispiel beschrieben.

💡 **Hinweis:** Prüfen Sie den Korrekturassistenten **vor** jedem Monatsabschluss. Nur **Fehler** (rot) müssen behoben werden — **Hinweise** (grau) sind informativ und erfordern keine Korrektur. Fehlercodes und ihre Texte können im Tab „Meldungen" unternehmensspezifisch angepasst werden.

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

**Was ist es?** Die Monatswerte-Seite zeigt eine Tabelle aller Mitarbeiter mit deren aggregierten Monatswerten (Soll, Netto, Überstunden, Saldo, Abwesenheitstage) und dem Monatsabschlussstatus. Von hier aus können Monate massenweise abgeschlossen oder wieder geöffnet werden.

**Wozu dient es?** Am Monatsende schließt der Manager hier alle Mitarbeitermonate auf einmal ab. Die Massenfunktionen (alle auswählen → abschließen) sparen gegenüber dem einzelnen Abschluss in der Monatsauswertung erheblich Zeit. Außerdem können hier Neuberechnungen für den gesamten Monat ausgelöst werden.

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

#### Praxisbeispiel

Der vollständige Ablauf „Monatswerte prüfen → Korrekturassistent → Massenabschluss → Lohnexport" ist in Abschnitt **8.3.1** als Praxisbeispiel beschrieben.

💡 **Hinweis:** Schließen Sie Monate erst ab, wenn alle Fehler im Korrekturassistenten behoben sind. Nach dem Abschluss können keine Buchungen mehr geändert werden. Falls doch eine Korrektur nötig ist: Einzelnen Mitarbeiter über ⋯ → „Wieder öffnen" → korrigieren → erneut abschließen.

### 8.5 Lohnexporte (DATEV/CSV)

**Was ist es?** Lohnexporte generieren CSV-Dateien mit allen relevanten Arbeitszeitdaten eines Monats — aufgeschlüsselt nach Mitarbeiter, mit Soll-/Ist-Stunden, Überstunden, Urlaubs- und Krankheitstagen sowie den Werten aller zugeordneten Konten.

**Wozu dient es?** Der Lohnexport ist die Brücke zwischen Zeiterfassung und Lohnabrechnung. Die generierte CSV-Datei wird an den Steuerberater oder das Lohnbüro weitergeleitet und dort in DATEV, Sage oder ein anderes Abrechnungsprogramm importiert. Damit entfällt die manuelle Erfassung aller Stunden in der Lohnabrechnung.

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

#### Praxisbeispiel

Der vollständige Ablauf zur Erstellung eines DATEV-Exports (inkl. Vorschau, Herunterladen und CSV-Format) ist in Abschnitt **8.3.1 Schritt 5–6** beschrieben.

💡 **Hinweis:** Exporte können nur für vergangene Monate erstellt werden — der aktuelle und zukünftige Monate sind gesperrt. Die erweiterten Parameter (aufklappbar im Formular) ermöglichen es, den Export auf bestimmte Mitarbeiter, Abteilungen oder Konten einzuschränken. Für den regulären Monatslauf ist das nicht nötig — lassen Sie die Parameter leer, um alle Mitarbeiter einzuschließen.

### 8.6 Exportschnittstellen konfigurieren

**Was ist es?** Eine Exportschnittstelle definiert das Spalten-Mapping zwischen Terp und einem externen Abrechnungsprogramm (z. B. DATEV). Sie legt fest, welche Konten (Zuschläge, Sonderstunden) in welcher Reihenfolge im Lohnexport erscheinen. Zusätzlich speichert sie technische Informationen wie Mandantennummer, Exportpfad und Dateiname.

**Wozu dient es?** Verschiedene Steuerberater und Abrechnungsprogramme erwarten unterschiedliche CSV-Formate. Statt bei jedem Export die Spalten manuell anzupassen, konfigurieren Sie einmal eine Schnittstelle mit dem richtigen Konten-Mapping. Danach wählen Sie die Schnittstelle beim Erstellen des Lohnexports aus dem Dropdown — fertig.

⚠️ Berechtigung: „Lohnexport verwalten"

📍 Seitenleiste → **Administration** → **Exportschnittstellen**

✅ Tabelle mit Spalten: Nummer, Name, Mandant, Exportpfad, Status, Konten (Anzahl).

#### Neue Schnittstelle anlegen

1. 📍 **„Neue Schnittstelle"** (oben rechts)
2. Ausfüllen:
   - **Nummer** (Pflicht, eindeutig pro Mandant) — identifiziert die Schnittstelle
   - **Name** (Pflicht) — z. B. „DATEV Steuerberater Müller"
   - **Mandantennummer** (optional) — die Mandantennummer im externen System (z. B. DATEV-Mandant „12345")
   - **Exportskript** (optional) — Name eines Export-Skripts (z. B. „export_datev.sh")
   - **Exportpfad** (optional) — Dateipfad für den Export (z. B. „/exports/datev/")
   - **Ausgabedateiname** (optional) — z. B. „lohnexport_januar.csv"
3. 📍 „Erstellen"

#### Konten zuordnen

1. 📍 Tabelle → ⋯-Menü → **„Konten verwalten"**
2. ✅ Duale-Liste-Ansicht: Links „Verfügbare Konten" mit Suchfeld und Checkboxen, rechts „Zugeordnete Konten" mit Reihenfolge-Buttons (↑↓). Zwischen beiden Spalten: Pfeil-Buttons zum Verschieben.
3. Konten auswählen und mit → verschieben
4. Reihenfolge mit ↑↓ anpassen (bestimmt die Spaltenreihenfolge in der CSV-Datei)
5. 📍 „Speichern"

#### Wo die Exportschnittstelle außerdem erscheint

| Ort | Pfad | Wie sie verwendet wird |
|-----|------|------------------------|
| Lohnexport erstellen | 📍 Administration → Lohnexporte → „Export erstellen" | Dropdown „Exportschnittstelle" — wählt das Konten-Mapping für diesen Export |
| Lohnexport-Vorschau | 📍 Administration → Lohnexporte → ⋯ → Vorschau | Die Spalten in der Vorschau entsprechen den zugeordneten Konten der Schnittstelle |

#### Praxisbeispiel

Der Steuerberater verwendet DATEV LODAS und benötigt im CSV-Export die Lohncodes für Nachtzuschlag (1015) und Feiertagszuschlag (1020) in genau dieser Reihenfolge:

1. 📍 Administration → **Exportschnittstellen** → **„Neue Schnittstelle"**
   - Nummer: `1`, Name: `DATEV LODAS — Stb. Müller`
   - Mandantennummer: `12345`
   - 📍 „Erstellen"

2. 📍 Tabelle → ⋯ → **„Konten verwalten"**
   - `NZ (Nachtzuschlag)` von links nach rechts verschieben → Position 1
   - `FZ (Feiertagszuschlag)` von links nach rechts verschieben → Position 2
   - 📍 „Speichern"

3. Beim Lohnexport (📍 Administration → Lohnexporte → „Export erstellen") die Schnittstelle `DATEV LODAS — Stb. Müller` im Dropdown wählen → 📍 „Generieren"

4. ✅ Die CSV-Datei enthält die Standardspalten (Personalnummer, Name, Soll, Ist, Überstunden, Urlaub, Krankheit) gefolgt von den Kontenspalten `NZ` und `FZ` in der festgelegten Reihenfolge.

💡 **Hinweis: DATEV LODAS vs. Lohn und Gehalt** — Die beiden DATEV-Produkte erwarten unterschiedliche Spalten-Mappings. Fragen Sie Ihren Steuerberater, welches Produkt er verwendet, und legen Sie für jedes eine eigene Exportschnittstelle mit den passenden Konten und Lohncodes an. Falls der CSV-Import beim Steuerberater fehlschlägt, liegt es meist an einer falschen Lohncode-Zuordnung in den Konten oder an einer falschen Kontenreihenfolge in der Schnittstelle.

### 8.7 Berichte

**Was ist es?** Berichte sind generierte Dokumente (PDF, XLSX, CSV oder JSON) mit zusammengefassten Arbeitszeitdaten. Terp bietet verschiedene Berichtstypen: Tages-/Wochen-/Monatsübersichten, Abwesenheits- und Urlaubsberichte, Überstundenberichte und Kontostände.

**Wozu dient es?** Berichte dienen der Dokumentation und Auswertung. Sie können gefiltert (nach Mitarbeiter, Abteilung, Kostenstelle, Team) und in verschiedenen Formaten heruntergeladen werden — z. B. als PDF für die Ablage oder als XLSX für weitere Analysen in Excel.

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

#### Praxisbeispiel

Am Monatsende möchte der Manager eine Überstundenübersicht für die Abteilung „Produktion":

1. 📍 Administration → Berichte → **„Bericht erstellen"**
2. Berichtstyp: **Überstundenbericht**, Format: **PDF**, Datumsbereich: `01.01.2026 – 31.01.2026`, Abteilungen: `Produktion` ✓ → 📍 „Generieren"
3. ✅ Der Bericht erscheint in der Tabelle. 📍 ⋯ → **„Herunterladen"** → PDF wird gespeichert.

💡 **Hinweis:** Berichte werden im Hintergrund generiert und bleiben dauerhaft gespeichert. Sie können jederzeit erneut heruntergeladen werden. Für eine interaktive Auswertung (live filtern, einzelne Buchungen ansehen) nutzen Sie stattdessen die Auswertungen (📍 Verwaltung → Auswertungen).

### 8.8 Auswertungen (Detailansicht)

**Was ist es?** Die Auswertungen sind eine interaktive, filterbare Detailansicht der Arbeitszeitdaten. Im Gegensatz zu Berichten (die als Datei generiert werden) zeigen Auswertungen die Daten live in fünf Tabs: Tageswerte, Buchungen, Terminal-Buchungen, Protokoll und Workflow-Historie.

**Wozu dient es?** Auswertungen dienen der schnellen Analyse und Fehlersuche. Ein Manager kann hier z. B. alle Buchungen eines Mitarbeiters filtern, nur fehlerhafte Tage anzeigen lassen oder die Änderungshistorie eines bestimmten Datensatzes nachvollziehen.

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

#### Praxisbeispiel

Ein Manager möchte alle Buchungen eines Mitarbeiters im Januar prüfen:

1. 📍 Verwaltung → Auswertungen → Datumsbereich: `01.01.2026 – 31.01.2026`, Mitarbeiter: `Weber, Lisa`
2. 📍 Tab **„Buchungen"** → ✅ Alle Stempelbuchungen von Weber sind sichtbar mit Uhrzeit, Buchungstyp und Quelle (Web/Terminal/Korrektur).
3. 📍 Tab **„Tageswerte"** → Schalter **„Nur mit Fehlern"** aktivieren → ✅ Nur fehlerhafte Tage werden angezeigt.

💡 **Hinweis:** Im Tab „Tageswerte" können Sie mit dem Schalter „Nur mit Fehlern" schnell alle problematischen Tage finden — ähnlich wie im Korrekturassistenten, aber mit mehr Filteroptionen. Im Tab „Protokoll" sehen Sie alle Änderungen (Erstellen, Ändern, Löschen) mit Vorher/Nachher-Vergleich.

### 8.9 Auswertungsvorlagen

**Was ist es?** Auswertungsvorlagen definieren die Regeln für den Monatsabschluss: Flexzeit-Kappungsgrenzen, Überstundenschwelle und maximalen Urlaubsübertrag. Eine Vorlage kann als Standard markiert werden und gilt dann für alle Monatsauswertungen.

**Wozu dient es?** Verschiedene Mitarbeitergruppen können unterschiedliche Regeln haben. Mit Vorlagen definieren Sie einmal die Kappungsgrenzen und wenden sie dann konsistent auf alle Monatsabschlüsse an.

⚠️ Berechtigung: „Monatsauswertungen verwalten"

📍 Seitenleiste → **Administration** → **Auswertungsvorlagen**

✅ Tabelle mit Spalten: Name (Standardvorlage bernsteinfarben hervorgehoben), Beschreibung, Flexzeit positiv, Flexzeit negativ, Überstundenschwelle, Max. Übertrag, Standard (⭐), Status.

#### Neue Vorlage anlegen

1. 📍 **„Neue Vorlage"** (oben rechts)
2. Ausfüllen: Name (Pflicht), Beschreibung, Flexzeit-Kappung positiv/negativ (Minuten mit Live-Daueranzeige), Überstundenschwelle, Max. Urlaubsübertrag (Tage), „Als Standard festlegen" (Schalter), Aktiv (Schalter)
3. 📍 „Speichern"

#### Praxisbeispiel

Eine Vorlage für Produktionsmitarbeiter mit engeren Flexzeitgrenzen:

📍 Administration → Auswertungsvorlagen → **„Neue Vorlage"** → Name: `Produktion`, Flexzeit-Kappung positiv: `1200` (= 20 Stunden), Flexzeit-Kappung negativ: `-600` (= −10 Stunden), „Als Standard festlegen": ❌ → 📍 „Speichern"

💡 **Hinweis:** Die Standardvorlage (⭐) wird automatisch für alle Monatsauswertungen verwendet. Erstellen Sie zusätzliche Vorlagen nur, wenn Sie unterschiedliche Kappungsgrenzen für verschiedene Gruppen benötigen.

### 8.10 Mitarbeiternachrichten

**Was ist es?** Mitarbeiternachrichten sind interne Benachrichtigungen, die ein Manager an einzelne Mitarbeiter, ganze Abteilungen oder alle aktiven Mitarbeiter senden kann. Die Nachrichten erscheinen beim Empfänger als Benachrichtigung (🔔-Symbol in der Kopfzeile).

**Wozu dient es?** Manager können hier Informationen zentral verteilen — z. B. Hinweise auf Urlaubssperren, geänderte Arbeitszeiten oder organisatorische Ankündigungen — ohne externe E-Mail-Tools verwenden zu müssen.

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

#### Praxisbeispiel

Der Manager informiert alle Mitarbeiter der Produktion über eine Betriebsversammlung:

1. 📍 Verwaltung → Mitarbeiternachrichten → **„Nachricht verfassen"**
2. Betreff: `Betriebsversammlung am 20.03.`, Nachricht: `Am 20.03. findet um 14:00 Uhr eine Betriebsversammlung in der Kantine statt.`
3. Empfänger: **Abteilung** → `Produktion` ✓ → 📍 „Nachricht erstellen" → Bestätigen
4. ✅ Alle Mitarbeiter der Produktion erhalten eine Benachrichtigung (🔔).

💡 **Hinweis:** Nachrichten können nach dem Senden nicht mehr bearbeitet oder zurückgerufen werden. Der Status pro Empfänger (Gesendet/Ausstehend/Fehlgeschlagen) ist in der Tabelle sichtbar. Verwenden Sie den Modus „Abteilung", um alle Mitarbeiter einer Abteilung gleichzeitig zu erreichen.

### 8.11 Audit-Protokoll

**Was ist es?** Das Audit-Protokoll zeichnet alle Aktionen im System auf: Wer hat wann was erstellt, geändert, gelöscht, genehmigt oder abgelehnt? Jeder Eintrag zeigt den Benutzer, die Aktion, den betroffenen Datensatz und die IP-Adresse.

**Wozu dient es?** Das Protokoll dient der Nachvollziehbarkeit und Revisionssicherheit. Bei Unstimmigkeiten können Manager prüfen, wer eine Buchung geändert, eine Abwesenheit genehmigt oder einen Mitarbeiter deaktiviert hat. Die Detailansicht zeigt den Vorher/Nachher-Vergleich als JSON.

⚠️ Berechtigung: „Benutzer verwalten"

📍 Seitenleiste → **Administration** → **Audit-Protokoll**

✅ Tabelle mit Spalten: Zeitstempel, Benutzer (Avatar + Name), Aktion (farbiges Badge), Entitätstyp, Name, IP-Adresse, Details (Auge-Symbol).

**Filter:** Datumsbereich (Standard: letzte 24 Stunden), Benutzer, Entitätstyp (19 Typen), Aktion (11 Aktionen), Entitäts-ID

Aktions-Badge-Farben: Grün = Erstellen/Genehmigen, Blau = Ändern, Rot = Löschen/Ablehnen, Lila = Abschließen, Orange = Wieder öffnen

📍 Zeile anklicken oder Auge-Symbol → Detailansicht mit Abschnitt „Änderungen" (Vorher/Nachher JSON-Vergleich)

#### Praxisbeispiel

Ein Manager möchte herausfinden, wer eine Buchung gelöscht hat:

1. 📍 Administration → Audit-Protokoll → Datumsbereich erweitern (z. B. letzte 7 Tage), Aktion: `Löschen`, Entitätstyp: `Buchung`
2. ✅ Die Tabelle zeigt alle gelöschten Buchungen mit Benutzer, Zeitstempel und IP-Adresse.
3. 📍 Auge-Symbol klicken → Die Detailansicht zeigt unter „Änderungen" die gelöschten Daten (Uhrzeit, Buchungstyp, Mitarbeiter).

💡 **Hinweis:** Der Standardfilter zeigt die letzten 24 Stunden. Erweitern Sie den Datumsbereich, um ältere Einträge zu finden. Das Audit-Protokoll speichert alle Einträge dauerhaft — es gibt keine automatische Bereinigung. Für die Suche nach einem bestimmten Vorgang nutzen Sie den Filter „Entitäts-ID", wenn Sie die ID des betroffenen Datensatzes kennen.

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

**Was ist es?** Makros sind konfigurierbare Automatisierungsregeln, die regelmäßig ausgeführt werden. Jeder Makro hat einen Typ (wöchentlich oder monatlich), eine Aktion (z. B. Flexzeit zurücksetzen) und wird einem Tarif oder einzelnen Mitarbeitern zugewiesen.

**Wozu dient es?** Makros automatisieren wiederkehrende Aufgaben, die sonst manuell durchgeführt werden müssten — z. B. das monatliche Zurücksetzen des Flexzeitkontos für Minijobber oder das Vortragen von Salden am Monatsende.

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

💡 **Hinweis:** Makros laufen automatisch alle 15 Minuten (Abschnitt 9.4). Mit dem Button „Jetzt ausführen" (▶) auf der Detailseite können Sie einen Makro sofort auslösen, ohne auf den nächsten Automatisierungslauf zu warten. Das Ausführungsprotokoll im Tab „Ausführungen" zeigt, wann der Makro zuletzt gelaufen ist und ob Fehler aufgetreten sind.

### 9.6 Zeitpläne (technische Automatisierung)

**Was ist es?** Zeitpläne sind die zentrale Steuerung für alle automatischen Hintergrundaufgaben in Terp. Jeder Zeitplan hat einen **Zeitplantyp** (wie oft er läuft), eine oder mehrere **Aufgaben** (was er tut) und ein **Ausführungsprotokoll** (wann er zuletzt lief und ob es erfolgreich war).

**Wozu dient es?** Zeitpläne machen die in Abschnitt 9.1–9.4 beschriebenen Automatisierungen transparent und steuerbar. Ein Administrator kann sehen, wann die letzte Tagesberechnung lief, ob sie erfolgreich war, und bei Bedarf eine sofortige Ausführung auslösen — ohne auf den nächsten Cron-Lauf warten zu müssen.

⚠️ Berechtigung: „Zeitpläne verwalten"

📍 Seitenleiste → **Administration** → **Zeitpläne**

✅ Tabelle mit Spalten: Name, Zeitplantyp (Badge), Aktiviert (Schalter, inline umschaltbar), Aufgaben (Anzahl), Letzte Ausführung.

#### Zeitplantypen

| Typ | Badge-Farbe | Bedeutung | Konfiguration |
|-----|-------------|-----------|---------------|
| Sekunden | — | Alle N Sekunden | Intervall (Zahl) |
| Minuten | — | Alle N Minuten | Intervall (Zahl) |
| Stunden | — | Alle N Stunden | Intervall (Zahl) |
| Täglich | — | Einmal pro Tag | Uhrzeit (HH:MM) |
| Wöchentlich | — | Einmal pro Woche | Wochentag + Uhrzeit |
| Monatlich | — | Einmal pro Monat | Tag des Monats (1–28) + Uhrzeit |
| Manuell | — | Nur auf Knopfdruck | Keine Konfiguration |

#### Aufgabentypen

Jeder Zeitplan enthält eine oder mehrere Aufgaben. Verfügbare Aufgabentypen:

| Aufgabentyp | Was er tut | Entspricht |
|-------------|-----------|------------|
| **Tage berechnen** | Tageswerte für alle Mitarbeiter berechnen | Abschnitt 9.1 |
| **Monate berechnen** | Monatswerte aggregieren | Abschnitt 9.2 |
| **Tagespläne generieren** | Tagespläne aus Tarifen für die nächsten Tage erzeugen | Abschnitt 9.3 |
| **Makros ausführen** | Fällige Makros prüfen und ausführen | Abschnitt 9.4 |
| **Benachrichtigungen senden** | Ausstehende Mitarbeiternachrichten zustellen | — |
| **Daten exportieren** | Daten über eine Exportschnittstelle exportieren | — |
| **Datenbank sichern** | Datenbanksicherung erstellen | — |
| **Alive-Check** | Prüfung, ob das System erreichbar ist | — |

#### Zeitplan-Detail

1. 📍 Zeile anklicken → Detailseite
2. Kopfbereich: Name, Zeitplantyp-Badge, Aktiviert-Status, Buttons: **„Jetzt ausführen"** (▶), Bearbeiten, Löschen
3. **Tab „Aufgaben"**: Sortierte Liste der Aufgaben (mit Ziehgriff zum Umsortieren). Jede Aufgabe hat: Sortierung-Badge, Aufgabentyp, Parameter, Aktiviert-Schalter, Bearbeiten-/Löschen-Buttons
   - 📍 **„Aufgabe hinzufügen"** → Aufgabentyp aus Dropdown wählen, Parameter konfigurieren → 📍 „Speichern"
4. **Tab „Ausführungen"**: Ausführungsprotokoll mit Spalten: Status-Badge (Abgeschlossen / Fehlgeschlagen / Teilweise), Auslöser-Badge (Geplant / Manuell), Startzeit, Dauer, Aufgaben (x/y abgeschlossen). Aufklappbare Detailzeilen pro Aufgabe.

#### Vorinstallierte Zeitpläne

Terp erstellt automatisch Zeitpläne für die vier Hintergrundaufgaben (Abschnitte 9.1–9.4). Diese werden beim ersten Cron-Lauf angelegt:

| Zeitplan | Typ | Aufgabe | Ausführung |
|----------|-----|---------|------------|
| `calculate_days_cron` | Täglich | Tage berechnen | Jeden Tag um 2:00 Uhr |
| `calculate_months_cron` | Monatlich | Monate berechnen | Am 2. des Monats um 3:00 Uhr |
| `generate_day_plans_cron` | Wöchentlich | Tagespläne generieren | Jeden Sonntag um 1:00 Uhr |
| `execute_macros_cron` | Minuten | Makros ausführen | Alle 15 Minuten |

#### Praxisbeispiel

Der Administrator möchte die Tagesberechnung sofort auslösen, weil mehrere Korrekturen vorgenommen wurden und die Ergebnisse sofort geprüft werden sollen:

1. 📍 Seitenleiste → Administration → **Zeitpläne**
2. 📍 Zeile `calculate_days_cron` anklicken → Detailseite
3. 📍 **„Jetzt ausführen"** (▶) klicken
4. ✅ Im Tab „Ausführungen" erscheint ein neuer Eintrag mit Auslöser „Manuell" und Status „Abgeschlossen" (grün)

💡 **Hinweis:** Der Button „Jetzt ausführen" steht nur bei aktivierten Zeitplänen zur Verfügung. Die vorinstallierten Zeitpläne sollten nicht deaktiviert werden, da sonst die tägliche Berechnung, Monatsaggregation und Schichtplan-Generierung ausbleiben. Eigene Zeitpläne (z. B. für stündliche Neuberechnung) können zusätzlich angelegt werden.

### 9.7 Systemeinstellungen

**Was ist es?** Die Systemeinstellungen enthalten globale Konfigurationsoptionen, die das Verhalten des gesamten Systems beeinflussen — von der Berechnungslogik über Auftragseinstellungen bis hin zur Server-Überwachung.

**Wozu dient es?** Hier werden systemweite Schalter gesetzt, die für alle Mitarbeiter und alle Berechnungen gelten. Außerdem stehen Bereinigungswerkzeuge zur Verfügung, um fehlerhafte Daten zu korrigieren.

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

#### Praxisbeispiel

Die automatische Füllung von Auftragsbuchungen aktivieren:

📍 Administration → Einstellungen → Abschnitt **„Aufträge"** aufklappen → **„Auftragsbuchungen automatisch ausfüllen"**: ✅ → 📍 „Einstellungen speichern"

✅ Ab sofort werden Stempelbuchungen automatisch dem Standardauftrag des Mitarbeiters zugeordnet (sofern ein Standardauftrag im Mitarbeiterstamm hinterlegt ist).

💡 **Hinweis:** Die Bereinigungswerkzeuge sind destruktiv und unwiderruflich. Sie erfordern eine 3-Schritt-Bestätigung (Vorschau → Ausführen → Bestätigungsphrase eintippen). Nutzen Sie sie nur nach Rücksprache und immer mit vorheriger Datensicherung. Im Normalbetrieb werden diese Werkzeuge nicht benötigt.

---

## 10. Aufträge & Projektzeiterfassung

### 10.1 Aufträge verwalten

**Was ist es?** Aufträge sind Projekte oder Kundenaufträge, auf die Mitarbeiter ihre Arbeitszeit buchen können. Jeder Auftrag hat einen Code, einen Kunden, einen Gültigkeitszeitraum und optional einen Stundensatz. Innerhalb eines Auftrags können Aktivitäten (z. B. Montage, Dokumentation) definiert werden.

**Wozu dient es?** Die Auftragszeiterfassung ermöglicht es, Arbeitszeiten nicht nur als Anwesenheit, sondern auch inhaltlich zuzuordnen: Wer hat wie lange an welchem Projekt gearbeitet? Damit können Aufträge kalkuliert, Kunden abgerechnet und die Projektrentabilität analysiert werden.

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

Ein vollständiges Praxisbeispiel zum Anlegen eines Auftrags mit Aktivitäten, Mitarbeiterzuweisungen und Zeitbuchungen finden Sie in Abschnitt **10.1.1**.

💡 **Hinweis:** Aufträge sind optional und nur für Unternehmen relevant, die Arbeitszeiten projektbezogen erfassen möchten (z. B. für Kundenabrechnung oder Projektkostenrechnung). Für die reine Arbeitszeiterfassung ohne Projektbezug können Aufträge ignoriert werden.

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

**Was ist es?** Die Zutrittskontrolle verwaltet, welche Mitarbeiter Zugang zu welchen physischen Bereichen (Zonen) haben. Sie besteht aus vier Bausteinen: **Zonen** (die Bereiche), **Profile** (Berechtigungsbündel), **Zuweisungen** (Mitarbeiter ↔ Profil) und **Zutrittskarten** (RFID-Karten, Barcodes, PINs).

**Wozu dient es?** Unternehmen mit physischen Zugangssystemen (Türen, Drehkreuze, Schranken) müssen festlegen, wer wohin darf. Terp speichert diese Informationen zentral und stellt sie für externe Zugangshardware bereit. Gleichzeitig werden über Terminal-Buchungen die Stempeldaten aus physischen Terminals importiert.

⚠️ Berechtigung: „Zutrittskontrolle verwalten"

📍 Seitenleiste → **Administration** → **Zutrittskontrolle**

✅ Seite mit drei Tabs: **Zonen**, **Profile**, **Zuweisungen**

### 11.1 Zugangszonen

**Was ist es?** Eine Zugangszone repräsentiert einen physischen Bereich mit kontrolliertem Zutritt — z. B. ein Gebäude, eine Etage, ein Serverraum oder ein Lagerbereich.

**Wozu dient es?** Zonen bilden die Grundlage der Zutrittskontrolle. Jede Zone kann in einem externen Zugangssystem (Kartenleser, Drehkreuz) referenziert werden. In Terp dienen sie als Referenzdaten zur Dokumentation der vorhandenen Zugangsbereiche.

📍 Tab **„Zonen"**

Tabelle mit Spalten: Code, Name, Sortierung, Status (Badge).

#### Neue Zone anlegen

1. 📍 **„Neue Zone"** (oben links)
2. Code (Pflicht, Großbuchstaben — nach Anlage nicht mehr änderbar), Name (Pflicht), Beschreibung, Sortierung
3. 📍 „Erstellen"

#### Praxisbeispiel

Zwei Zonen für ein Bürogebäude anlegen: `EG` (Erdgeschoss) und `SR` (Serverraum). Ein vollständiges Praxisbeispiel mit Zonen, Profilen, Zuweisungen und Kartenimport finden Sie in Abschnitt **11.7**.

💡 **Hinweis:** Zonen können frei gelöscht werden. Der Code ist nach dem Anlegen gesperrt — wählen Sie ihn so, dass er zum externen Zugangssystem passt (z. B. der Türcode im Kartenlesersystem).

### 11.2 Zugangsprofile

**Was ist es?** Ein Zugangsprofil ist ein benanntes Berechtigungsbündel, das einem Mitarbeiter zugewiesen werden kann. Es beschreibt eine Zugangsrolle (z. B. „Verwaltungsmitarbeiter", „Lagerpersonal", „Vollzugang").

**Wozu dient es?** Statt jedem Mitarbeiter einzeln Zonen zuzuweisen, definieren Sie Profile als wiederverwendbare Vorlagen. Ein neuer Mitarbeiter bekommt ein Profil zugewiesen und hat damit sofort die richtigen Zugangsrechte.

📍 Tab **„Profile"**

Tabelle mit Spalten: Code, Name, Status (Badge).

#### Neues Profil anlegen

1. 📍 **„Neues Profil"** → Code (Pflicht, Großbuchstaben — nach Anlage nicht mehr änderbar), Name (Pflicht), Beschreibung
2. 📍 „Erstellen"

#### Praxisbeispiel

Zwei Profile anlegen: `STANDARD` (nur Erdgeschoss) und `IT-VOLL` (inkl. Serverraum). Siehe Abschnitt **11.7 Schritt 2**.

💡 **Hinweis:** Profile mit aktiven Zuweisungen können nicht gelöscht werden. Entfernen Sie zuerst alle Mitarbeiter-Zuweisungen. Erstellen Sie Profile nach dem Prinzip der minimalen Rechte — ein Profil pro Zugangsrolle.

### 11.3 Mitarbeiter-Zuweisungen

**Was ist es?** Eine Zuweisung verbindet einen Mitarbeiter mit einem Zugangsprofil und legt den Gültigkeitszeitraum fest. So wird dokumentiert, welcher Mitarbeiter ab wann und bis wann welches Profil hat.

**Wozu dient es?** Zuweisungen sind der operative Teil der Zutrittskontrolle: Sie bestimmen, wer aktuell Zugang hat. Über den Gültigkeitszeitraum können befristete Zugangsrechte abgebildet werden (z. B. für Zeitarbeiter oder Praktikanten).

📍 Tab **„Zuweisungen"**

Tabelle mit Spalten: Mitarbeiter, Profil, Gültig ab, Gültig bis, Status (Badge).

**Filter:** Suchfeld, Profilfilter (Dropdown)

#### Neue Zuweisung anlegen

1. 📍 **„Neue Zuweisung"** → Mitarbeiter (Dropdown), Profil (Dropdown), Gültig ab/bis (Datum), Aktiv (Schalter)
2. 📍 „Speichern"

#### Praxisbeispiel

Mitarbeiterin Meier dem Profil `STANDARD` zuweisen: Siehe Abschnitt **11.7 Schritt 3**.

💡 **Hinweis:** Mitarbeiter und Profil können nach dem Anlegen nicht mehr geändert werden. Nur Gültigkeitszeitraum und Aktiv-Status sind bearbeitbar. Für einen Profilwechsel muss die alte Zuweisung deaktiviert und eine neue angelegt werden. Nutzen Sie den Gültigkeitszeitraum für befristete Zugangsrechte (z. B. Praktikanten).

### 11.4 RFID-Karten (Zutrittskarten)

**Was ist es?** Zutrittskarten sind physische Identifikationsmedien (RFID-Karten, Barcodes oder PINs), die einem Mitarbeiter zugeordnet werden. Jede Karte hat eine eindeutige Kartennummer und einen Gültigkeitszeitraum.

**Wozu dient es?** Die Karten ermöglichen die Identifizierung eines Mitarbeiters am Terminal. Beim Scannen einer Karte ordnet das System die Kartennummer dem Mitarbeiter zu und erstellt eine Buchung.

Zutrittskarten werden an zwei Stellen verwaltet:

📍 Seitenleiste → Verwaltung → **Mitarbeiter** → Mitarbeiter anklicken → Tab **„Übersicht"** → Abschnitt „Zutrittskarten" (Admin-Ansicht, nur Leseansicht)

📍 Benutzermenü → **Profil** → Karte „Zutrittskarten" (eigene Karten mit Icons: RFID = 💳, Barcode = |||, PIN = 🔑)

✅ Liste der Karten mit: Kartennummer, Kartentyp (Badge: RFID/Barcode/PIN), Gültigkeit, Status (Aktiv/Inaktiv/Abgelaufen)

#### Neue Karte anlegen

1. 📍 Profil → Karte „Zutrittskarten" → **„+"** (Hinzufügen)
2. Ausfüllen: **Kartennummer** (Pflicht, eindeutig pro Mandant), Kartentyp (Standard: RFID), Gültig ab/bis (optional)
3. 📍 „Erstellen"

#### Karte deaktivieren

1. 📍 Karte in der Liste → **Deaktivieren**-Button
2. Optional: Deaktivierungsgrund eingeben
3. ✅ Die Karte wird sofort deaktiviert. Eine deaktivierte Karte kann nicht reaktiviert werden — bei Verlust muss eine neue Karte angelegt werden.

#### Praxisbeispiel

Einem Mitarbeiter eine RFID-Karte zuordnen: Siehe Abschnitt **11.7 Schritt 4**.

💡 **Hinweis:** Die Kartennummer muss im gesamten Mandanten eindeutig sein (nicht nur pro Mitarbeiter). Ein Mitarbeiter kann mehrere Karten haben (z. B. RFID für die Tür + PIN für das Terminal). Abgelaufene Karten (Gültig bis < heute) werden automatisch als „Abgelaufen" markiert.

### 11.5 Terminal-Buchungen

**Was ist es?** Terminal-Buchungen sind Stempeldaten, die von physischen Zeiterfassungsterminals (Stempeluhren, Kartenleser, Zutrittssysteme) importiert werden. Jede Buchung enthält eine Mitarbeiter-PIN, einen Zeitstempel und einen Buchungscode (z. B. A1 für Kommen, A2 für Gehen).

**Wozu dient es?** Unternehmen mit Hardwareterminals (z. B. am Werkstor) erfassen Stempelzeiten nicht über den Browser, sondern über physische Geräte. Die Terminal-Buchungen-Seite ermöglicht den Import dieser Daten in Terp, wo sie den Mitarbeitern zugeordnet und weiterverarbeitet werden.

⚠️ Berechtigung: „Terminal-Buchungen verwalten"

📍 Seitenleiste → **Administration** → **Terminal-Buchungen**

✅ Seite mit zwei Tabs: **Buchungen** und **Import-Batches**

#### Tab „Buchungen"

**Filter:** Datum von/bis, Terminal-ID, Mitarbeiter, Status (Alle/Ausstehend/Verarbeitet/Fehlgeschlagen/Übersprungen), Batch-ID

Tabelle (nur Lesezugriff): Zeitstempel, Mitarbeiter-PIN, Terminal-ID, Buchungscode, Status (farbiges Badge), Mitarbeitername, Fehler

#### Tab „Import-Batches" — Terminaldaten importieren

1. 📍 Tab „Import-Batches" → **„Import auslösen"** (Upload-Symbol)
2. Im Dialog:
   - **Batch-Referenz** (Pflicht, eindeutige Kennung — Schutz vor Doppelimport)
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

Ein vollständiges Praxisbeispiel zum Terminal-Import finden Sie in Abschnitt **11.7 Schritt 5–6**.

💡 **Hinweis:** Terminal-Buchungen verwenden die **Mitarbeiter-PIN** (nicht die RFID-Kartennummer) zur Zuordnung. Die PIN wird beim Anlegen des Mitarbeiters automatisch vergeben und ist im Mitarbeiterstamm sichtbar (📍 Verwaltung → Mitarbeiter → Bearbeiten → Feld „PIN").

### 11.6 Wie der Import funktioniert

1. Das System prüft die Batch-Referenz auf Duplikate (Schutz vor Doppelimport — wird dieselbe Referenz erneut verwendet, wird der Import abgelehnt)
2. Alle PINs werden den Mitarbeitern zugeordnet (die PIN stammt aus dem Mitarbeiterstamm, nicht aus der Zutrittskarte). Unbekannte PINs → die Buchung wird mit Fehler gespeichert
3. Alle Buchungscodes werden den Buchungstypen zugeordnet (z. B. A1 → Kommen, A2 → Gehen)
4. Die Buchungen werden als Rohdaten gespeichert und können dann weiterverarbeitet werden

Pro Import können bis zu 5.000 Buchungen verarbeitet werden.

### 11.7 Praxisbeispiel: Zutrittskontrolle für ein Bürogebäude einrichten

Szenario: Ein Unternehmen hat ein Bürogebäude mit zwei Bereichen — Erdgeschoss (für alle) und Serverraum (nur für die IT-Abteilung). Am Eingang steht ein Kartenleser-Terminal, das Stempelzeiten erfasst.

#### Schritt 1 — Zugangszonen anlegen

📍 Seitenleiste → Administration → **Zutrittskontrolle** → Tab **„Zonen"**

1. 📍 **„Neue Zone"**
   - Code: `EG`, Name: `Erdgeschoss — Haupteingang` → 📍 „Erstellen"
2. 📍 **„Neue Zone"**
   - Code: `SR`, Name: `Serverraum` → 📍 „Erstellen"

✅ Beide Zonen erscheinen in der Tabelle mit Status „Aktiv".

#### Schritt 2 — Zugangsprofile anlegen

📍 Tab **„Profile"**

1. 📍 **„Neues Profil"**
   - Code: `STANDARD`, Name: `Standardzugang (nur Erdgeschoss)` → 📍 „Erstellen"
2. 📍 **„Neues Profil"**
   - Code: `IT-VOLL`, Name: `IT-Vollzugang (inkl. Serverraum)` → 📍 „Erstellen"

#### Schritt 3 — Mitarbeiter zuweisen

📍 Tab **„Zuweisungen"**

1. 📍 **„Neue Zuweisung"**
   - Mitarbeiter: `Meier, Anna` (Verwaltung)
   - Profil: `STANDARD`
   - Gültig ab: `01.01.2026`
   - 📍 „Speichern"

2. 📍 **„Neue Zuweisung"**
   - Mitarbeiter: `Schmidt, Thomas` (IT-Abteilung)
   - Profil: `IT-VOLL`
   - Gültig ab: `01.01.2026`
   - 📍 „Speichern"

#### Schritt 4 — RFID-Karten den Mitarbeitern zuordnen

📍 Benutzermenü → **Profil** → Karte „Zutrittskarten" → **„+"**

- Kartennummer: `RFID-00123`, Kartentyp: **RFID** → 📍 „Erstellen"

(Alternativ als Administrator: 📍 Verwaltung → Mitarbeiter → Mitarbeiter anklicken → die Karte ist in der Detailansicht unter „Zutrittskarten" sichtbar.)

#### Schritt 5 — Terminal-Stempeldaten importieren

Am Ende des Tages liefert das Terminal-System eine Datei mit allen Stempelvorgängen:

📍 Seitenleiste → Administration → **Terminal-Buchungen** → Tab **„Import-Batches"** → **„Import auslösen"**

- Batch-Referenz: `TERM-2026-03-10-001`
- Terminal-ID: `EINGANG-EG`
- Buchungsdaten:
  ```
  1001,2026-03-10T08:02:00,A1
  1001,2026-03-10T12:00:00,P1
  1001,2026-03-10T12:30:00,P2
  1001,2026-03-10T16:35:00,A2
  1002,2026-03-10T07:55:00,A1
  1002,2026-03-10T16:00:00,A2
  ```

📍 „Importieren"

✅ Ergebnis: 6 gesamt / 6 importiert / 0 fehlgeschlagen. Die PINs `1001` und `1002` werden den Mitarbeitern Meier und Schmidt zugeordnet, die Buchungscodes `A1`, `P1`, `P2`, `A2` den entsprechenden Buchungstypen.

#### Schritt 6 — Importierte Buchungen prüfen

📍 Tab **„Buchungen"** → Filter: Datum `10.03.2026`

✅ Sie sehen alle 6 Buchungen mit zugeordneten Mitarbeiternamen, Zeitstempeln und Status „Ausstehend" (zur Weiterverarbeitung).

💡 **Hinweis:** Die Zutrittskontrolle in Terp ist ein **Referenzdatensystem**: Es speichert Zonen, Profile und Zuweisungen als Stammdaten. Die tatsächliche Zugangsprüfung (Tür öffnen / sperren) erfolgt im externen Hardwaresystem, das die Daten aus Terp liest. Terminal-Buchungen werden separat importiert und in die reguläre Zeiterfassung überführt.

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
| **Standort** | Physischer Arbeitsort mit Adresse | 📍 Verwaltung → Standorte |
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
