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
   - [2.1 Profil-Seite](#21-profil-seite)
   - [2.2 Benachrichtigungen](#22-benachrichtigungen)
3. [Rollen & Berechtigungen](#3-rollen--berechtigungen)
4. [Stammdaten — Was muss eingerichtet werden?](#4-stammdaten--was-muss-eingerichtet-werden)
   - [4.6.4 Praxisbeispiel: Arbeitszeitmodell für Büro-Mitarbeiter einrichten](#464-praxisbeispiel-arbeitszeitmodell-für-büro-mitarbeiter-einrichten)
5. [Zeiterfassung — Täglicher Betrieb](#5-zeiterfassung--täglicher-betrieb)
   - [5.6 Teamübersicht](#56-teamübersicht)
   - [5.7 Jahresübersicht](#57-jahresübersicht)
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
12. [CRM — Kunden- und Lieferantenverwaltung](#12-crm--kunden--und-lieferantenverwaltung)
    - [12.1 Adressen verwalten](#121-adressen-verwalten)
    - [12.2 Kontaktpersonen](#122-kontaktpersonen)
    - [12.3 Bankverbindungen](#123-bankverbindungen)
    - [12.4 Nummernkreise](#124-nummernkreise)
    - [12.5 Korrespondenz](#125-korrespondenz)
    - [12.6 Praxisbeispiel: Korrespondenz protokollieren](#126-praxisbeispiel-korrespondenz-protokollieren)
    - [12.7 Praxisbeispiel: Neuen Kunden mit Kontakten und Bankverbindung anlegen](#127-praxisbeispiel-neuen-kunden-mit-kontakten-und-bankverbindung-anlegen)
    - [12.8 Anfragen](#128-anfragen)
    - [12.9 Praxisbeispiel: Kundenanfrage anlegen und abschließen](#129-praxisbeispiel-kundenanfrage-anlegen-und-abschließen)
    - [12.10 Aufgaben & Nachrichten](#1210-aufgaben--nachrichten)
    - [12.11 Auswertungen](#1211-auswertungen)
13. [Belege & Fakturierung](#13-belege--fakturierung)
    - [13.1 Belegtypen](#131-belegtypen)
    - [13.2 Belegliste](#132-belegliste)
    - [13.3 Beleg anlegen](#133-beleg-anlegen)
    - [13.4 Positionen verwalten](#134-positionen-verwalten)
    - [13.5 Beleg abschließen (Festschreiben)](#135-beleg-abschließen-festschreiben)
    - [13.6 Beleg fortführen (Belegkette)](#136-beleg-fortführen-belegkette)
    - [13.7 Beleg stornieren](#137-beleg-stornieren)
    - [13.8 Beleg duplizieren](#138-beleg-duplizieren)
    - [13.8a Dokumentvorlagen (Briefkonfigurator)](#138a-dokumentvorlagen-briefkonfigurator)
    - [13.9 Praxisbeispiel: Angebot bis Rechnung](#139-praxisbeispiel-angebot-bis-rechnung)
    - [13.10 Kundendienst (Serviceaufträge)](#1310-kundendienst-serviceaufträge)
    - [13.11 Offene Posten / Zahlungen](#1311-offene-posten--zahlungen)
    - [13.12 Preislisten](#1312-preislisten)
    - [13.13 Wiederkehrende Rechnungen](#1313-wiederkehrende-rechnungen)
    - [13.14 E-Rechnung (ZUGFeRD / XRechnung)](#1314-e-rechnung-zugferd--xrechnung)
14. [Lagerverwaltung — Artikelstamm](#14-lagerverwaltung--artikelstamm)
    - [14.1 Artikelliste](#141-artikelliste)
    - [14.2 Artikeldetailseite](#142-artikeldetailseite)
    - [14.3 Bestandskorrektur](#143-bestandskorrektur)
    - [14.4 Praxisbeispiel: Artikelstamm für eine Schreinerei einrichten](#144-praxisbeispiel-artikelstamm-für-eine-schreinerei-einrichten)
15. [Lagerverwaltung — Preislisten](#15-lagerverwaltung--preislisten)
    - [15.1 Preislisten verwalten](#151-preislisten-verwalten)
    - [15.2 Neue Preisliste erstellen](#152-neue-preisliste-erstellen)
    - [15.3 Artikel hinzufügen und Preise bearbeiten](#153-artikel-hinzufügen-und-preise-bearbeiten)
    - [15.4 Preise prozentual anpassen](#154-preise-prozentual-anpassen)
    - [15.5 Preisliste kopieren](#155-preisliste-kopieren)
    - [15.6 Praxisbeispiel: Preislisten für Standardkunden und Großkunden einrichten](#156-praxisbeispiel-preislisten-für-standardkunden-und-großkunden-einrichten)
16. [Lagerverwaltung — Einkauf / Bestellungen](#16-lagerverwaltung--einkauf--bestellungen)
    - [16.1 Bestellliste](#161-bestellliste)
    - [16.2 Neue Bestellung anlegen](#162-neue-bestellung-anlegen)
    - [16.3 Bestelldetailseite](#163-bestelldetailseite)
    - [16.4 Positionen verwalten](#164-positionen-verwalten)
    - [16.5 Bestellung senden (Bestellen)](#165-bestellung-senden-bestellen)
    - [16.6 Bestellung stornieren](#166-bestellung-stornieren)
    - [16.7 Nachbestellvorschläge](#167-nachbestellvorschläge)
    - [16.8 Status-Workflow](#168-status-workflow)
    - [16.9 Praxisbeispiel: Einkauf von Verbrauchsmaterial bei einem Lieferanten](#169-praxisbeispiel-einkauf-von-verbrauchsmaterial-bei-einem-lieferanten)
17. [Lagerverwaltung — Wareneingang](#17-lagerverwaltung--wareneingang)
    - [17.1 Wareneingangs-Terminal](#171-wareneingangs-terminal)
    - [17.2 Bestandsbewegungen](#172-bestandsbewegungen)
    - [17.3 Praxisbeispiel: Bestellung entgegennehmen](#173-praxisbeispiel-bestellung-entgegennehmen)
18. [Lagerverwaltung — Lagerentnahmen](#18-lagerverwaltung--lagerentnahmen)
    - [18.1 Entnahme-Terminal](#181-entnahme-terminal)
    - [18.2 Entnahme-Verlauf](#182-entnahme-verlauf)
    - [18.3 Entnahme stornieren](#183-entnahme-stornieren)
    - [18.4 Praxisbeispiel: Material für einen Auftrag entnehmen](#184-praxisbeispiel-material-für-einen-auftrag-entnehmen)
19. [Lagerverwaltung — Lieferantenrechnungen](#19-lagerverwaltung--lieferantenrechnungen)
    - [19.1 Rechnungsliste](#191-rechnungsliste)
    - [19.2 Neue Lieferantenrechnung anlegen](#192-neue-lieferantenrechnung-anlegen)
    - [19.3 Rechnungsdetailseite](#193-rechnungsdetailseite)
    - [19.4 Zahlung erfassen](#194-zahlung-erfassen)
    - [19.5 Zahlung stornieren](#195-zahlung-stornieren)
    - [19.6 Rechnung stornieren](#196-rechnung-stornieren)
    - [19.7 Status-Workflow](#197-status-workflow)
    - [19.8 Praxisbeispiel: Lieferantenrechnung erfassen und bezahlen](#198-praxisbeispiel-lieferantenrechnung-erfassen-und-bezahlen)
20. [Lagerverwaltung — Korrekturassistent](#20-lagerverwaltung--korrekturassistent)
    - [20.1 Dashboard](#201-dashboard)
    - [20.2 Meldungen](#202-meldungen)
    - [20.3 Meldung bearbeiten](#203-meldung-bearbeiten)
    - [20.4 Massenbearbeitung](#204-massenbearbeitung)
    - [20.5 Prüfläufe](#205-prüfläufe)
    - [20.6 Automatische Prüfung (Cron)](#206-automatische-prüfung-cron)
    - [20.7 Praxisbeispiel: Bestandsprüfung vor Inventur](#207-praxisbeispiel-bestandsprüfung-vor-inventur)
21. [Glossar](#21-glossar)

---

## 1. Was ist Terp?

Terp ist ein digitales Zeiterfassungs- und Personalverwaltungssystem für deutsche Unternehmen. Es ersetzt Stundenzettel auf Papier, Excel-Tabellen und manuelle Lohnvorbereitung durch eine zentrale, webbasierte Anwendung.

### Was Terp tut

- **Arbeitszeiten erfassen**: Mitarbeiter stempeln über den Browser oder ein Terminal ein und aus. Das System berechnet automatisch Arbeitszeit, Pausen, Überstunden und Fehlzeiten.
- **Abwesenheiten verwalten**: Urlaub, Krankheit und andere Abwesenheiten werden digital beantragt, genehmigt und verbucht — inklusive automatischer Urlaubskontoführung.
- **Schichten planen**: Schichtpläne können für einzelne Mitarbeiter oder ganze Teams erstellt werden, auch mit rollierenden Rhythmen.
- **Lohnabrechnung vorbereiten**: Am Monatsende werden alle Daten aggregiert und als CSV-Export (z. B. für DATEV) bereitgestellt.
- **Aufträge und Projekte erfassen**: Mitarbeiter können ihre Arbeitszeit auf Aufträge und Aktivitäten buchen.
- **Kunden und Lieferanten verwalten**: Adressen, Kontaktpersonen und Bankverbindungen zentral pflegen — als Grundlage für Korrespondenz, Anfragen und Rechnungsstellung (CRM-Modul).
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

### 2.1 Profil-Seite

**Was ist es?** Die Profil-Seite zeigt die eigenen Stamm- und Beschäftigungsdaten und ermöglicht die Pflege persönlicher Informationen, Kontaktdaten und Kontoeinstellungen.

📍 Benutzermenü (Avatar oben rechts) → **Profil**

✅ Sie sehen eine Seite mit folgenden Karten:

| Karte | Inhalt | Bearbeitbar? |
|-------|--------|-------------|
| **Kopfbereich** | Avatar, Name, Rolle (Admin/Mitarbeiter), Personalnummer, Abteilung, E-Mail | Nein (Avatar-Upload kommt demnächst) |
| **Persönliche Daten** | Vorname, Nachname, E-Mail, Telefon | ✅ Ja — über Bearbeiten-Button |
| **Beschäftigungsdetails** | Abteilung, Kostenstelle, Beschäftigungsart, Status, Eintrittsdatum, Austrittsdatum, Wochenstunden, Urlaubstage | Nein (nur Leseansicht) |
| **Kontakte** | Liste eigener Kontakteinträge (Typ, Wert, Bezeichnung, Hauptkontakt) | ✅ Ja — Hinzufügen und Löschen |
| **Zutrittskarten** | RFID-Karten, Barcodes, PINs mit Status und Gültigkeit | Nein (Kontakt Admin bei Bedarf) |
| **Kontoeinstellungen** | E-Mail (nur lesen), Rolle (nur lesen), Anzeigename (bearbeitbar), Passwort ändern (kommt demnächst) | Teilweise |

#### Persönliche Daten bearbeiten

1. 📍 Profil → Karte **„Persönliche Daten"** → **„Bearbeiten"** (Stift-Symbol)
2. Felder ändern: Vorname, Nachname, E-Mail, Telefon
3. 📍 **„Speichern"**

✅ Eine grüne Bestätigungsmeldung erscheint für 3 Sekunden. Die Felder wechseln zurück in den Leseansicht-Modus.

#### Kontakt hinzufügen

1. 📍 Profil → Karte **„Kontakte"** → **„+"** (Hinzufügen)
2. Im Formular (Einblendung von rechts):
   - **Typ** wählen (E-Mail / Telefon / Mobil / Notfallkontakt)
   - **Wert** eingeben (z. B. `+49 170 1234567`)
   - **Bezeichnung** (optional, z. B. „Privat")
   - **Hauptkontakt** (Checkbox)
3. 📍 **„Erstellen"**

✅ Der Kontakt erscheint in der Kontaktliste mit Typ-Badge und Wert.

#### Kontakt löschen

📍 Karte „Kontakte" → Mülleimer-Symbol (🗑) neben dem Kontakt klicken → Kontakt wird entfernt.

#### Anzeigename ändern

📍 Profil → Karte **„Kontoeinstellungen"** → Feld **„Anzeigename"** → neuen Namen eingeben → 📍 **„Speichern"**

#### Benachrichtigungseinstellungen öffnen

📍 Profil → Karte „Kontoeinstellungen" → Link **„Benachrichtigungen verwalten"** → leitet zur Benachrichtigungsseite weiter (Tab „Einstellungen")

#### Praxisbeispiel

Ein Mitarbeiter möchte seine Mobilnummer und seinen Notfallkontakt hinterlegen:

1. 📍 Benutzermenü → **Profil** → Karte „Kontakte" → **„+"**
   - Typ: **Mobil**, Wert: `+49 170 9876543`, Bezeichnung: `Privat`, Hauptkontakt: ✅ → 📍 „Erstellen"
2. 📍 **„+"** erneut
   - Typ: **Notfallkontakt**, Wert: `+49 160 1111111`, Bezeichnung: `Ehepartner` → 📍 „Erstellen"
3. ✅ Beide Kontakte erscheinen in der Kontaktliste. Der Mobilkontakt ist als Hauptkontakt markiert.

💡 **Hinweis:** Die E-Mail-Adresse in den Kontoeinstellungen kann nicht geändert werden — sie ist an den Benutzeraccount gebunden. Kontakte auf der Profilseite sind persönliche Kontaktdaten und unabhängig von der Anmelde-E-Mail. Administratoren sehen die Kontakte eines Mitarbeiters unter 📍 Verwaltung → Mitarbeiter → Mitarbeiterdetails (nur Leseansicht).

### 2.2 Benachrichtigungen

**Was ist es?** Die Benachrichtigungsseite zeigt alle internen Benachrichtigungen (z. B. genehmigte Anträge, Fehlermeldungen, Erinnerungen, Systemmeldungen) und ermöglicht die Konfiguration der Benachrichtigungseinstellungen.

📍 Glocke (🔔) in der Kopfzeile klicken

✅ Seite mit zwei Tabs: **Alle** (Posteingang) und **Einstellungen**

#### Tab „Alle" — Posteingang

✅ Sie sehen eine Liste aller Benachrichtigungen mit: Typ-Symbol (✓ Genehmigungen, ⚠ Fehler, ⏰ Erinnerungen, ⚙ System), Titel, Zeitstempel, Nachrichtentext und einem „Ungelesen"-Badge.

**Filter:**
- **Typ** (Dropdown): Alle Typen / Genehmigungen / Fehler / Erinnerungen / System
- **Nur ungelesene** (Umschaltbutton): Zeigt nur ungelesene Benachrichtigungen

**Aktionen:**
- 📍 **„Alle als gelesen markieren"** — markiert alle Benachrichtigungen als gelesen (deaktiviert wenn keine ungelesenen vorhanden)
- 📍 Benachrichtigung anklicken — öffnet den verlinkten Bereich (z. B. den genehmigten Antrag) und markiert die Benachrichtigung automatisch als gelesen
- 📍 **„Mehr laden"** — lädt die nächsten 20 Benachrichtigungen (erscheint am Ende der Liste)

#### Tab „Einstellungen" — Benachrichtigungseinstellungen

✅ Vier Kategorien mit jeweils einem Ein/Aus-Schalter:

| Kategorie | Beschreibung |
|-----------|-------------|
| **Genehmigungen** | Benachrichtigungen über genehmigte/abgelehnte Anträge |
| **Fehler** | Benachrichtigungen über fehlerhafte Tageswerte |
| **Erinnerungen** | Erinnerungen an ausstehende Aufgaben |
| **System** | Systemmeldungen und Wartungshinweise |

1. 📍 Schalter für die gewünschten Kategorien ein- oder ausschalten
2. 📍 **„Änderungen speichern"**

✅ Die Einstellungen werden sofort wirksam. Deaktivierte Kategorien erzeugen keine neuen Benachrichtigungen mehr.

#### Praxisbeispiel

Ein Mitarbeiter möchte nur Genehmigungsbenachrichtigungen sehen und alle anderen deaktivieren:

1. 📍 Glocke (🔔) → Tab **„Einstellungen"**
2. Genehmigungen: ✅ | Fehler: ❌ | Erinnerungen: ❌ | System: ❌
3. 📍 **„Änderungen speichern"**
4. ✅ Ab sofort erscheinen nur noch Benachrichtigungen über genehmigte oder abgelehnte Anträge.

💡 **Hinweis:** Der rote Badge an der Glocke (🔔) in der Kopfzeile zeigt die Anzahl ungelesener Benachrichtigungen. Ein Klick auf eine Benachrichtigung navigiert direkt zum relevanten Bereich (z. B. zum genehmigten Urlaubsantrag). Benachrichtigungen können auch über die Profil-Seite erreicht werden (📍 Profil → „Benachrichtigungen verwalten").

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

##### Zuschläge (Detailansicht)

Zuschläge definieren Zeitfenster, in denen Arbeitszeit automatisch als Bonus auf ein Konto gebucht wird — z. B. Nachtzuschlag, Sonntagszuschlag oder Feiertagszuschlag. Ohne Zuschlagskonfiguration am Tagesplan bleiben die zugehörigen Bonus-Konten leer.

**So konfigurieren Sie einen Zuschlag:**

1. 📍 Verwaltung → **Tagespläne** → gewünschten Tagesplan anklicken → Detailansicht
2. Abschnitt **„Zuschläge"** → 📍 **„Zuschlag hinzufügen"**
3. Felder ausfüllen (siehe Tabelle) → 📍 **„Zuschlag hinzufügen"**

| Feld | Pflicht? | Beschreibung |
|------|----------|--------------|
| **Konto** | Ja | Zielkonto vom Typ „Bonus" (→ Abschnitt 4.12). Nur aktive Bonus-Konten werden angezeigt. |
| **Zeit von** | Ja | Beginn des Zuschlagsfensters (HH:MM). |
| **Zeit bis** | Ja | Ende des Zuschlagsfensters. Darf vor „Zeit von" liegen (Mitternachtsüberschreitung, z. B. 22:00 → 06:00 — wird intern automatisch an Mitternacht gesplittet). |
| **Berechnungsart** | Ja | Wie der Zuschlag berechnet wird (siehe Tabelle unten). |
| **Wert** | Ja | Minutenwert oder Prozentwert je nach Berechnungsart. |
| **Mindestarbeitszeit** | Nein | Der Zuschlag wird nur berechnet, wenn die Nettoarbeitszeit des Tages diesen Wert erreicht. |
| **Gilt an Feiertagen** | Nein | Wenn aktiviert, wird der Zuschlag auch an Feiertagen berechnet. Wenn deaktiviert, nur an regulären Arbeitstagen. |

**Berechnungsarten:**

| Art | Beschreibung | Beispiel |
|-----|--------------|---------|
| **Pro Minute** | 1:1 — jede gearbeitete Minute im Fenster wird als Zuschlagsminute gebucht | 4 h im Fenster → 4 h Zuschlag |
| **Festwert** | Fixer Bonus, sobald Überlappung mit dem Fenster existiert | Wert 60 → 1 h Zuschlag, egal ob 2 h oder 6 h im Fenster |
| **Prozentual** | Prozentualer Anteil der Überlappung | Wert 25, 4 h im Fenster → 1 h Zuschlag |

**Praxisbeispiel: Nachtzuschlag End-to-End**

> **Szenario:** Nachtschicht-Mitarbeiter sollen einen Nachtzuschlag für Arbeit zwischen 22:00 und 06:00 erhalten. Der Steuerberater benötigt den Wert im Lohnexport unter Lohncode 1015.
>
> **Schritt 1 — Bonus-Konto anlegen** (einmalig):
> 📍 Verwaltung → Konten → „Neues Konto"
> - Code: `NZ`, Name: `Nachtzuschlag`, Kontotyp: **Bonus**, Einheit: **Stunden**, Lohnrelevant: ✓, Lohncode: `1015` → 📍 „Erstellen"
>
> **Schritt 2 — Konto der Exportschnittstelle zuordnen** (einmalig):
> 📍 Administration → Exportschnittstellen → Schnittstelle → ⋯ → „Konten verwalten" → `NZ` nach rechts verschieben → 📍 „Speichern"
>
> **Schritt 3 — Zuschlag am Tagesplan konfigurieren**:
> 📍 Verwaltung → Tagespläne → Nachtschicht-Plan anklicken → Detailansicht → Abschnitt „Zuschläge" → „Zuschlag hinzufügen"
> - Konto: `NZ (Nachtzuschlag)`, Zeit von: `22:00`, Zeit bis: `06:00`, Berechnungsart: **Pro Minute**, Wert: `0`, Gilt an Feiertagen: ☐ → 📍 „Zuschlag hinzufügen"
>
> **Ergebnis:** Arbeitet ein Mitarbeiter mit diesem Tagesplan von 22:00 bis 06:00, berechnet das System automatisch 8 Stunden Nachtzuschlag und bucht sie auf das Konto NZ. Im Lohnexport erscheint der Wert unter Lohncode 1015.

💡 **Hinweis:** Die Zuschlagsberechnung erfolgt bei jeder Buchungsänderung und zusätzlich nachts automatisch (→ Abschnitt 9.3).

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

#### Individuelle Tarifzuweisung anlegen (zeitgebunden)

Auf der Mitarbeiter-Detailseite können unter dem Tab **„Tarifzuweisungen"** zeitgebundene Tarifzuweisungen angelegt werden — z. B. wenn ein Mitarbeiter ab einem bestimmten Datum einen anderen Tarif bekommt (Versetzung, Arbeitszeitänderung).

1. 📍 Verwaltung → Mitarbeiter → Mitarbeiter anklicken → Tab **„Tarifzuweisungen"**
2. ✅ Sie sehen eine Liste der bisherigen Zuweisungen mit: Tarif, Gültig ab, Gültig bis, Status. Oben wird der aktuell geltende Tarif hervorgehoben.
3. 📍 **„Neue Zuweisung"** (oben rechts)
4. Im Formular:
   - **Tarif** (Dropdown aus aktiven Tarifen)
   - **Gültig ab** (Pflicht, Datum)
   - **Gültig bis** (optional — ohne Enddatum gilt der Tarif unbefristet)
5. 📍 **„Speichern"**

✅ Die neue Zuweisung erscheint in der Liste. Das System generiert automatisch die Tagespläne ab dem Gültigkeitsdatum.

> **Beispiel:** Mitarbeiterin Meier wechselt am 01.04.2026 von Vollzeit (40h) auf Teilzeit (20h): 📍 Tab „Tarifzuweisungen" → „Neue Zuweisung" → Tarif: `TZ-20`, Gültig ab: `01.04.2026` → „Speichern". Ab dem 01.04. gelten die Tagespläne des Teilzeit-Tarifs.

⚠️ Bei überlappenden Zuweisungen gilt die neueste Zuweisung. Die alte Zuweisung sollte ein Enddatum erhalten, um Überlappungen zu vermeiden.

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

#### Buchungstyp-Gruppen verwalten

📍 Tab **„Gruppen"** auf der Buchungstypen-Seite

✅ Tabelle mit Spalten: Code, Name, Beschreibung, Buchungstypen (Anzahl), Status.

Gruppen bündeln mehrere Buchungstypen logisch zusammen — z. B. alle Homeoffice-Buchungstypen (HO1 + HO2) in einer Gruppe „Homeoffice". Gruppen dienen der Filterung in Auswertungen und Berichten.

##### Neue Gruppe anlegen

1. 📍 Tab „Gruppen" → **„Neue Gruppe"** (oben rechts)
2. Ausfüllen: **Code** (Pflicht, Großbuchstaben), **Name** (Pflicht), Beschreibung
3. Buchungstypen zuordnen: Checkboxen bei den gewünschten Buchungstypen setzen
4. 📍 **„Erstellen"**

✅ Die Gruppe erscheint in der Tabelle mit der Anzahl zugeordneter Buchungstypen.

> **Beispiel:** Gruppe `HOMEOFFICE`, Name: `Homeoffice-Buchungen` → Buchungstypen `HO1` und `HO2` zuordnen. In den Auswertungen kann nun nach der Gruppe „Homeoffice" gefiltert werden.

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
   - **Berechnungsregel** (optional, Dropdown — verknüpft eine Berechnungsregel, die bei Genehmigung automatisch Stunden auf ein Konto bucht)
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

**3. Kontoberechnung (über Berechnungsregel)**

Nur wenn dem Abwesenheitstyp eine **Berechnungsregel** zugeordnet ist:

- Das System liest die Berechnungsregel (Wert, Faktor, Zielkonto) aus
- Formel: `Wert × Faktor` (wenn Wert = 0, wird die Tagessollzeit verwendet)
- Das Ergebnis wird als Kontobuchung mit Quelle `absence_rule` gespeichert
- Beispiel: Krankheit mit Regel (Wert=0, Faktor=1,00, Konto=KR) → bei 8h-Sollzeit werden 480 Min auf Konto KR gebucht

#### Praxisbeispiel

Ein Unternehmen möchte neben den Standardtypen einen „Sonderurlaub Umzug" anlegen:

1. 📍 Verwaltung → Abwesenheitsarten → Tab „Abwesenheitsarten" → **„Neue Abwesenheitsart"**
   - Code: `U03`, Farbe: `#8B5CF6` (lila), Name: `Sonderurlaub Umzug`, Kategorie: **Urlaub**
   - Beeinflusst Urlaubssaldo: ❌ (wird nicht vom Urlaubskonto abgezogen — es ist ein Sondertag)
   - Genehmigung erforderlich: ✅
   - 📍 „Erstellen"

2. Wenn ein Mitarbeiter einen Umzugstag beantragt (📍 Abwesenheiten → „Abwesenheit beantragen" → Typ `Sonderurlaub Umzug`), muss der Vorgesetzte genehmigen. Das Urlaubskonto bleibt unberührt.

💡 **Hinweis:** Der Code-Präfix (U, K oder S) bestimmt die Zuordnung im System. Verwenden Sie `U` für Urlaubsarten und unbezahlte Abwesenheiten, `K` für Krankheit und `S` für Sonderfälle. Systemtypen (mit 🔒-Symbol) können nicht bearbeitet oder gelöscht werden — blenden Sie sie mit dem Schalter „Systemtypen anzeigen" ein.

#### Abwesenheitsart-Gruppen verwalten

📍 Tab **„Gruppen"** auf der Abwesenheitsarten-Seite

✅ Tabelle mit Spalten: Code, Name, Beschreibung, Abwesenheitsarten (Anzahl), Status.

Gruppen bündeln mehrere Abwesenheitsarten logisch zusammen — z. B. alle Urlaubsarten (U01, U02, U03) in einer Gruppe „Urlaub". Gruppen dienen der Filterung in Auswertungen und Berichten.

##### Neue Gruppe anlegen

1. 📍 Tab „Gruppen" → **„Neue Gruppe"** (oben rechts)
2. Ausfüllen: **Code** (Pflicht, Großbuchstaben), **Name** (Pflicht), Beschreibung
3. Abwesenheitsarten zuordnen: Checkboxen bei den gewünschten Typen setzen
4. 📍 **„Erstellen"**

✅ Die Gruppe erscheint in der Tabelle mit der Anzahl zugeordneter Abwesenheitsarten.

> **Beispiel:** Gruppe `URLAUB-ALLE`, Name: `Alle Urlaubsarten` → Abwesenheitsarten `U01` (Jahresurlaub), `U02` (Sonderurlaub), `U03` (Sonderurlaub Umzug) zuordnen.

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

> ⚠️ **Wichtig:** Damit die Konten NZ und SZ tatsächlich Werte enthalten, müssen Sie zusätzlich **Zuschläge am Tagesplan** konfigurieren (→ Abschnitt 4.6.1, „Zuschläge"). Ohne Zuschlagskonfiguration bleiben die Konten leer.

💡 **Hinweis:** Konten müssen als **„Lohnrelevant"** markiert und einer **Exportschnittstelle zugeordnet** sein, damit sie im Lohnexport erscheinen. Die Reihenfolge in der Exportschnittstelle bestimmt die Spaltenreihenfolge in der CSV-Datei. Der **Lohncode** wird an den Steuerberater übermittelt und muss mit dem verwendeten Abrechnungsprogramm (z. B. DATEV) abgestimmt sein.

#### Kontogruppen verwalten

📍 Tab **„Gruppen"** auf der Kontenseite

✅ Tabelle mit Spalten: Code, Name, Beschreibung, Konten (Anzahl), Status.

Gruppen bündeln mehrere Konten logisch zusammen — z. B. alle Zuschlagskonten (Nachtzuschlag, Sonntagszuschlag, Feiertagszuschlag) in einer Gruppe „Zuschläge". Gruppen dienen der Organisation und Filterung.

##### Neue Kontogruppe anlegen

1. 📍 Tab „Gruppen" → **„Neue Gruppe"** (oben rechts)
2. Ausfüllen: **Code** (Pflicht, Großbuchstaben), **Name** (Pflicht), Beschreibung
3. Konten zuordnen: Checkboxen bei den gewünschten Konten setzen
4. 📍 **„Erstellen"**

✅ Die Gruppe erscheint in der Tabelle mit der Anzahl zugeordneter Konten.

> **Beispiel:** Gruppe `ZUSCHL`, Name: `Zuschläge` → Konten `NZ` (Nachtzuschlag), `SZ` (Sonntagszuschlag), `FZ` (Feiertagszuschlag) zuordnen. Bei der Berichterstellung kann nach dieser Gruppe gefiltert werden.

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
2. Ausfüllen: Code (Pflicht), Name (Pflicht), Wert in Minuten (0 = Tagessollzeit verwenden), Faktor, Konto (Dropdown aus aktiven Konten)
3. 📍 „Erstellen"

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

3. **Abwesenheitstyp verknüpfen:**
   📍 Verwaltung → Abwesenheitsarten → Abwesenheitsart „Krankheit" (K01) bearbeiten → **Berechnungsregel** → `BRK (Krankheit Vollzeit-Gutschrift)` auswählen → 📍 „Änderungen speichern"

4. **Automatische Anwendung bei Tagesberechnung:**
   Wenn ein Mitarbeiter mit 8 Stunden Tagessollzeit einen Tag krank gemeldet wird, berechnet das System bei der nächsten Tagesberechnung: **0 (= 480 Min. Sollzeit) × 1,00 = 480 Minuten** → werden automatisch auf das Konto `KR` gebucht. Die Buchung erscheint in den Kontobuchungen (📍 Verwaltung → Konten → ⋮ → „Buchungen anzeigen") mit der Quelle „Berechnungsregel".

💡 **Hinweis:** Berechnungsregeln werden automatisch bei jeder Tagesberechnung angewendet — sowohl bei der Genehmigung einer Abwesenheit als auch beim nächtlichen Neuberechnungslauf. Der berechnete Wert wird als `DailyAccountValue` mit Quelle `absence_rule` gespeichert. Für die reine Urlaubskontoführung (Tage abziehen) werden keine Berechnungsregeln benötigt — das erledigt der Abwesenheitstyp selbst über die Einstellung „Urlaub betroffen".

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

### 5.6 Teamübersicht

**Was ist es?** Die Teamübersicht zeigt den aktuellen Anwesenheitsstatus und die Arbeitszeitstatistiken eines Teams. Teammitglieder und Teamleiter sehen auf einen Blick, wer anwesend ist, wer in Pause ist, wer fehlt und wer noch nicht gekommen ist.

**Wozu dient es?** Die Teamübersicht ersetzt die manuelle „Wer ist da?"-Abfrage. Ein Teamleiter sieht in Echtzeit den Anwesenheitsstatus seines Teams (Auto-Aktualisierung alle 30 Sekunden), Wochenstatistiken, Überstundenverteilung und kommende Abwesenheiten.

📍 Seitenleiste → **Teamübersicht**

✅ Sie sehen:

**Oben:** Team-Dropdown, Datumsbereiche-Auswahl (Standard: aktuelle Woche), Aktualisieren-Button, Schnellaktionen (Abwesenheit beantragen, Teams verwalten, Zeitnachweis anzeigen)

⚠️ Nicht-Admin-Benutzer sehen nur Teams, in denen sie **Mitglied** oder **Teamleiter** sind. Bei nur einem Team wird dieses automatisch ausgewählt.

#### Statistik-Karten

Nach Auswahl eines Teams erscheinen **8 Statistik-Karten**:

| Karte | Bedeutung |
|-------|-----------|
| **Anwesend heute** | Anzahl der Teammitglieder mit mindestens einer Buchung heute |
| **Team-Stunden** | Summe aller Nettominuten im gewählten Zeitraum |
| **Ø Überstunden** | Durchschnittlicher Flexzeitsaldo pro Mitglied |
| **Abwesend heute** | Anzahl abwesender Mitglieder heute |
| **Abwesenheitstage** | Gesamte Abwesenheitstage im Zeitraum |
| **Überstunden gesamt** | Gesamte Überstundenminuten im Zeitraum |
| **Fehlzeit gesamt** | Gesamte Fehlzeitminuten im Zeitraum |
| **Probleme** | Mitglieder mit Fehlern im Tageswert heute |

#### Anwesenheitsliste

Mitglieder werden nach Anwesenheitsstatus gruppiert (in dieser Reihenfolge):

1. **Anwesend** (grün) — eingestempelt
2. **Abwesend** (rot) — ausgestempelt
3. **Im Urlaub** — genehmigte Abwesenheit
4. **Noch nicht da** — keine Buchung heute

Jede Zeile zeigt: Avatar mit Initialen, Name, Rollen-Badge (Mitglied/Leiter/Stellvertreter), Einstempelzeit, Nettostunden, Status-Badge.

📍 Zeile anklicken → Aufklappbare Detailzeile mit: Erste Ankunft, Letztes Gehen, Nettozeit, Sollzeit, Überstunden, Fehlzeit.

#### Anwesenheitsmuster (Diagramm)

Ein Balkendiagramm zeigt, wie viele Teammitglieder an jedem Tag im gewählten Zeitraum anwesend waren. Bei bis zu 7 Tagen werden Wochentagsnamen angezeigt, bei mehr Tagen Kurzformate.

#### Kommende Abwesenheiten

Rechts unten zeigt eine Karte die nächsten 10 geplanten Abwesenheiten aller Teammitglieder (mit Mini-Kalender). Jeder Eintrag zeigt: Name, relatives Datum, Abwesenheitstyp-Badge und Halbtag-Markierung (falls zutreffend).

#### Team-Export

📍 **„Team-Bericht exportieren"** (oben rechts) → Generiert eine CSV-Datei mit Spalten: Mitglied, Netto gesamt, Soll gesamt, Überstunden gesamt, Fehlzeit gesamt, Abwesenheitstage. Dateiname: `team-report-{von}-to-{bis}.csv`.

#### Praxisbeispiel

Der Teamleiter Schmidt prüft am Montagmorgen sein Montageteam:

1. 📍 Seitenleiste → **Teamübersicht** → Team: `Montageteam` (automatisch vorausgewählt, da einziges Team)
2. ✅ Statistik-Karten zeigen: 4 von 5 Mitgliedern anwesend, 1 abwesend heute
3. ✅ Anwesenheitsliste: Weber (eingestempelt 07:55), Fischer (eingestempelt 08:02), Müller (eingestempelt 07:58), Braun (eingestempelt 08:10) — alle grün. Krause fehlt (Status: „Im Urlaub").
4. 📍 Zeile „Fischer" aufklappen → Detailansicht zeigt: Ankunft 08:02, Nettozeit bisher 2:15, Sollzeit 8:00
5. 📍 „Kommende Abwesenheiten" → Krause hat diese Woche Urlaub (Mo–Fr), Müller hat nächsten Freitag frei
6. 📍 Datumsbereiche auf `letzte 2 Wochen` ändern → Anwesenheitsmuster zeigt: Montag und Freitag sind die Tage mit der geringsten Besetzung

💡 **Hinweis:** Die Anwesenheitsdaten aktualisieren sich automatisch alle 30 Sekunden. Klicken Sie auf „Aktualisieren" (↻), um eine sofortige Aktualisierung auszulösen. Der Export-Button generiert einen CSV-Bericht für den gewählten Zeitraum — nützlich für die wöchentliche Teamauswertung.

### 5.7 Jahresübersicht

**Was ist es?** Die Jahresübersicht zeigt eine Zusammenfassung der Arbeitszeitdaten eines Mitarbeiters für ein ganzes Jahr: Gesamtstunden, Flexzeitsaldo, Arbeitstage, Urlaubskontostand und eine monatliche Aufschlüsselungstabelle.

**Wozu dient es?** Mitarbeiter sehen hier ihren Jahresverlauf: Wie hat sich das Flexzeitkonto entwickelt? Wie viele Überstunden wurden angesammelt? Wie viele Arbeitstage wurden geleistet? Manager können die Jahresübersicht anderer Mitarbeiter einsehen und als CSV oder PDF exportieren.

📍 Seitenleiste → **Jahresübersicht**

⚠️ Administratoren mit der Berechtigung „Alle Zeiten ansehen" sehen oben ein Mitarbeiter-Dropdown (bis 250 Mitarbeiter).

✅ Seite mit Jahresnavigation (← Jahr →) und folgenden Bereichen:

#### Zusammenfassungskarten

Vier Karten mit den Jahreseckwerten:

| Karte | Inhalt |
|-------|--------|
| **Gesamtzeit** | Soll-Stunden vs. Ist-Stunden + Jahresdifferenz (farbig: grün = Plus, rot = Minus) |
| **Flexzeitsaldo** | Aktueller Flexzeitsaldo als große farbige Zahl mit Saldoindikator-Balken |
| **Arbeitstage** | Geleistete Arbeitstage / geplante Arbeitstage mit Fortschrittsbalken |
| **Urlaub** | Genommene Tage / Gesamtanspruch mit Fortschrittsbalken (blau). Ohne Urlaubskonto: Anzeige der Abwesenheitstage |

#### Flexzeit-Diagramm

Ein 12-Monats-Balkendiagramm zeigt den monatlichen Flexzeitsaldo. Balken über der Nulllinie sind grün (Plus), darunter rot (Minus). Beim Überfahren mit der Maus erscheint ein Tooltip mit Monatsname und Saldo.

#### Monatstabelle

Tabelle mit 12 Zeilen (eine pro Monat) und Spalten: Monat, Arbeitstage (geleistet/geplant), Soll, Ist, Saldo, Status (Badge: Offen/Berechnet/Abgeschlossen/Exportiert).

📍 Zeile anklicken → springt zur Monatsauswertung dieses Monats (📍 `/monthly-evaluation?year=…&month=…`).

Am Ende eine **Summenzeile** mit den Jahrestotalen.

#### Export

📍 Export-Button (oben rechts) → Dropdown mit zwei Optionen:
- **CSV** — Datei `year-overview-export-{Jahr}.csv` mit Spalten: Monat, Arbeitstage, Geplante Tage, Soll-Stunden, Ist-Stunden, Saldo, Status + Summenzeile
- **Drucken / PDF** — Öffnet eine druckoptimierte Ansicht im neuen Tab

#### Praxisbeispiel

Ein Mitarbeiter möchte seinen Jahresverlauf 2026 prüfen:

1. 📍 Seitenleiste → **Jahresübersicht** → Jahr: **2026**
2. ✅ Karte „Gesamtzeit": Soll 1.720:00, Ist 1.745:30, Differenz **+25:30** (grün)
3. ✅ Karte „Flexzeitsaldo": **+12:45** (grün) — aktueller Stand
4. ✅ Karte „Arbeitstage": 198 / 215 Tage geleistet (Fortschrittsbalken 92%)
5. ✅ Karte „Urlaub": 22 / 30 Tage genommen (Fortschrittsbalken 73%)
6. ✅ Flexzeit-Diagramm: März und November hatten die höchsten Plus-Saldos, August war im Minus (Urlaubsmonat)
7. 📍 Zeile „März" anklicken → Monatsauswertung März 2026 öffnet sich mit der tagesgenauen Aufschlüsselung

💡 **Hinweis:** Die Jahresübersicht zeigt immer vollständige Kalenderjahre. Monate ohne Daten (z. B. zukünftige Monate) werden mit „–" angezeigt. Das nächste Jahr ist das Maximum — weiter in die Zukunft kann nicht navigiert werden. Der CSV-Export ist nützlich für die jährliche Personalauswertung oder die Übergabe an den Steuerberater.

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

✅ Tabelle mit Spalten: Mitarbeiter (Avatar + Name), Pers.-Nr., Jahr, Grundanspruch, Zusätzlich, Übertrag, Korrektur, Gesamt (fett), Genommen, Geplant, Restanspruch (farbiges Badge: grün > 5, gelb 1–5, rot < 1).

**Filter:** Jahresauswahl, Suchfeld, Abteilung

##### Jahr initialisieren

1. 📍 **„Jahr initialisieren"** (Kalender-Plus-Symbol)
2. **Jahr** eingeben, **Übertrag** aktivieren/deaktivieren
3. 📍 „Initialisieren"
4. ✅ Urlaubskonten für alle Mitarbeiter des Jahres werden angelegt

##### Einzelnes Urlaubskonto bearbeiten

1. 📍 Tabelle → ⋯-Menü → **„Konto bearbeiten"**
2. Felder: Grundanspruch, Zusätzlicher Anspruch, Übertrag aus Vorjahr, Manuelle Korrektur, Übertrag ins Folgejahr, Übertrag verfällt am (jeweils in halben Tagen)
3. ✅ Gesamtvorschau wird live berechnet (hervorgehoben)
4. 📍 „Änderungen speichern"

#### Praxisbeispiel

Jahresinitialisierung für 2027:

1. 📍 Verwaltung → Urlaubskonten → **„Jahr initialisieren"** → Jahr: `2027`, Übertrag: ✅ → 📍 „Initialisieren"
2. ✅ Das System berechnet für jeden Mitarbeiter den Anspruch 2027 (inkl. Anteilsberechnung, Boni, Teilzeitfaktor) und den Übertrag aus 2026 (unter Berücksichtigung der Kappungsregeln).
3. 📍 Mitarbeiter „Becker, Anna" → ⋯ → **„Konto bearbeiten"** → Manuelle Korrektur: `+2` (Sonderurlaub Betriebsjubiläum) → 📍 „Änderungen speichern"

Ein vollständiges Praxisbeispiel finden Sie in Abschnitt **7.8**.

💡 **Hinweis:** Die Jahresinitialisierung muss nur einmal pro Jahr durchgeführt werden. Sie kann beliebig oft wiederholt werden — bestehende Konten werden nicht überschrieben, nur der Übertrag wird bei erneutem Initialisieren aktualisiert. Manuelle Korrekturen bleiben erhalten.

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

✅ Status wechselt zu „Abgeschlossen" (grün). Ab sofort können keine Änderungen mehr an den Buchungen dieses Monats vorgenommen werden. Im Zeitnachweis wird ein Hinweis-Banner angezeigt und die Buttons zum Erstellen, Bearbeiten und Löschen von Buchungen sind deaktiviert.

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

✅ Seite mit 6 aufklappbaren Kartenabschnitten:

| Abschnitt | Einstellungen |
|-----------|--------------|
| **Berechnung** | Rundung relativ zum Plan (Schalter), Fehlerliste aktiviert (Schalter), Verfolgte Fehlercodes (Tag-Eingabe) |
| **Aufträge** | Auftragsbuchungen automatisch ausfüllen, Folgebuchungen aktiviert |
| **Lager** | Lagerbuchung bei Lieferschein: Manuell / Mit Bestaetigung / Automatisch (Dropdown) |
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

## 12. CRM — Kunden- und Lieferantenverwaltung

### 12.1 Adressen verwalten

**Was ist es?** Adressen sind die zentralen Stammdaten im CRM-Modul. Jede Adresse repräsentiert ein Unternehmen — einen Kunden, einen Lieferanten oder beides. Adressen enthalten Firmenname, Anschrift, Kommunikationsdaten, Steuerinformationen und Zahlungsbedingungen. Jede Adresse erhält automatisch eine eindeutige Nummer (z. B. K-1 für Kunden, L-1 für Lieferanten).

**Wozu dient es?** Die Adressverwaltung bildet die Grundlage für alle CRM-Prozesse: Korrespondenz, Anfragen, Belege und Rechnungen beziehen sich auf Adressen. Durch die zentrale Pflege von Kontaktpersonen und Bankverbindungen innerhalb einer Adresse sind alle relevanten Informationen an einer Stelle verfügbar.

⚠️ Modul: Das CRM-Modul muss für den Mandanten aktiviert sein (📍 Administration → Einstellungen → Module → **CRM**)

⚠️ Berechtigung: „CRM-Adressen anzeigen" (Lesen), „CRM-Adressen erstellen/bearbeiten/löschen" (Schreiben)

📍 Seitenleiste → **CRM** → **Adressen**

✅ Seite mit Titel „Adressverwaltung", Tabelle aller aktiven Adressen, Suchfeld und Filter.

#### Adressenliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | Auto-generierte Adressnummer (z. B. K-1, L-3) — monospace |
| **Firma** | Firmenname (fett) |
| **Typ** | Badge: Kunde (blau), Lieferant (grau), Kunde & Lieferant (Outline) |
| **Ort** | Stadt aus der Anschrift |
| **Telefon** | Haupttelefonnummer |
| **E-Mail** | Haupt-E-Mail-Adresse |
| **Status** | Badge: Aktiv (blau) / Inaktiv (grau) |
| **Aktionen** | ⋯-Menü: Details, Bearbeiten, Deaktivieren/Wiederherstellen |

**Filter:**
- **Suchfeld**: Durchsucht Firma, Nummer, Matchcode und Ort gleichzeitig
- **Typ-Filter**: Alle Typen / Kunde / Lieferant / Kunde & Lieferant
- **Status-Filter**: Aktiv (Standard) / Inaktiv / Alle
- 📍 **„Filter zurücksetzen"** erscheint, wenn Filter aktiv sind

##### Neue Adresse anlegen

1. 📍 **„Neue Adresse"** (oben rechts)
2. ✅ Seitliches Formular (Sheet) öffnet sich: „Neue Adresse anlegen"
3. Abschnitt **Grunddaten** ausfüllen:
   - **Typ** (Dropdown: Kunde / Lieferant / Kunde & Lieferant) — Standard: Kunde
   - **Firma** (Pflicht)
   - **Matchcode** (optional — wird automatisch aus dem Firmennamen generiert, wenn leer)
4. Abschnitt **Anschrift** ausfüllen:
   - **Straße**, **PLZ**, **Ort**, **Land** (Standard: DE)
5. Abschnitt **Kommunikation** ausfüllen:
   - **Telefon**, **Fax**, **E-Mail**, **Webseite**
6. Abschnitt **Steuerinformationen** ausfüllen:
   - **Steuernummer**, **USt-IdNr.**, **Leitweg-ID** (optional, fuer E-Rechnung an oeffentliche Auftraggeber)
7. Abschnitt **Zahlungsbedingungen** ausfüllen:
   - **Zahlungsziel (Tage)**, **Skonto (%)**, **Skontotage**, **Rabattgruppe**
7a. *(Nur bei Typ „Lieferant" oder „Kunde & Lieferant")* Abschnitt **Lieferantendaten** ausfüllen:
   - **Unsere Kundennummer** (optional, max. 50 Zeichen) — Die eigene Kundennummer, die wir beim Lieferanten haben
8. Abschnitt **Notizen** (optionales Freitext-Feld)
9. 📍 „Anlegen"
10. ✅ Adresse erscheint in der Tabelle mit automatisch vergebener Nummer

💡 **Hinweis:** Die Adressnummer wird beim Anlegen automatisch vergeben und kann nicht manuell geändert werden. Kunden erhalten Nummern mit Präfix „K-" (K-1, K-2, …), Lieferanten mit „L-" (L-1, L-2, …). Die Präfixe und Startwerte können unter 📍 Administration → Einstellungen angepasst werden (→ Abschnitt 12.4 Nummernkreise).

##### Adresse bearbeiten

1. 📍 ⋯-Menü der Adresse → **„Bearbeiten"**
2. ✅ Formular öffnet sich mit den aktuellen Werten vorausgefüllt
3. Gewünschte Felder ändern
4. 📍 „Speichern"

##### Adresse deaktivieren (Soft-Delete)

Adressen werden nicht gelöscht, sondern deaktiviert — sie bleiben im System erhalten und können wiederhergestellt werden.

1. 📍 ⋯-Menü der Adresse → **„Deaktivieren"**
2. ✅ Bestätigungsdialog: „Möchten Sie die Adresse ‚{Firma}' wirklich deaktivieren?"
3. 📍 „Bestätigen"
4. ✅ Adresse verschwindet aus der aktiven Liste

##### Adresse wiederherstellen

1. 📍 Status-Filter auf **„Inaktiv"** umstellen
2. ✅ Deaktivierte Adressen werden angezeigt
3. 📍 ⋯-Menü → **„Wiederherstellen"**
4. ✅ Adresse ist wieder aktiv und erscheint in der Standardansicht

#### Adressdetails

📍 Zeile in der Tabelle anklicken → Detailseite

✅ Kopfbereich zeigt: Firmenname (groß), Nummer (monospace), Typ-Badge, Status-Badge, Buttons „Bearbeiten" und „Deaktivieren"

Die Detailseite hat **7 Tabs**:

**Tab „Übersicht":** Alle Adressdaten in Kartenansicht (2-Spalten-Grid)

| Karte | Felder |
|-------|--------|
| **Anschrift** | Straße, PLZ, Ort, Land |
| **Kommunikation** | Telefon, Fax, E-Mail, Webseite |
| **Steuerinformationen** | Steuernummer, USt-IdNr., Leitweg-ID (fuer E-Rechnung an Behoerden), Matchcode |
| **Zahlungsbedingungen** | Zahlungsziel, Skonto, Skontotage, Rabattgruppe |
| **Lieferantendaten** | Unsere Kundennummer (nur bei Lieferanten/Kunde & Lieferant, nur wenn gepflegt) |
| **Notizen** | Freitext (volle Breite, nur wenn vorhanden) |

**Tab „Kontakte":** → Abschnitt 12.2

**Tab „Bankverbindungen":** → Abschnitt 12.3

**Tab „Korrespondenz":** Kommunikationsprotokoll der Adresse — siehe Abschnitt 12.5

**Tab „Anfragen":** Kundenanfragen dieser Adresse — siehe Abschnitt 12.8

**Tab „Aufgaben":** Aufgaben und Nachrichten dieser Adresse — siehe Abschnitt 12.10

**Tab „Belege":** Platzhalter — „In Vorbereitung — ORD_01"

---

### 12.2 Kontaktpersonen

**Was ist es?** Kontaktpersonen sind die Ansprechpartner bei einer Adresse — z. B. der Einkaufsleiter eines Kunden oder die Buchhalterin eines Lieferanten. Jeder Kontakt gehört zu genau einer Adresse.

**Wozu dient es?** Für Korrespondenz und Kommunikation müssen nicht nur Firmendaten, sondern auch die richtigen Personen bekannt sein: Wer ist der Hauptansprechpartner? Wer bearbeitet Rechnungen? Wer hat den technischen Kontakt?

📍 Adressdetailseite → Tab **„Kontakte"**

✅ Tabelle aller Kontaktpersonen dieser Adresse

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Name** | Anrede + Titel + Vorname + Nachname |
| **Position** | Funktion im Unternehmen (z. B. Geschäftsführer) |
| **Abteilung** | Abteilung im Unternehmen (z. B. Einkauf) |
| **Telefon** | Durchwahl |
| **E-Mail** | E-Mail-Adresse |
| **Hauptkontakt** | Badge, wenn als Hauptkontakt markiert |
| **Aktionen** | ⋯-Menü: Bearbeiten, Löschen |

##### Neuen Kontakt anlegen

1. 📍 Tab „Kontakte" → **„Kontakt hinzufügen"** (oben rechts)
2. ✅ Dialog öffnet sich: „Neuen Kontakt anlegen"
3. Ausfüllen:
   - **Anrede** (Dropdown: Herr / Frau / Divers), **Titel** (Dropdown: Dr. / Prof. / Prof. Dr.)
   - **Vorname** (Pflicht), **Nachname** (Pflicht)
   - **Briefanrede** — wird automatisch generiert (z. B. „Sehr geehrter Herr Dr. Müller"), kann manuell überschrieben werden. Zauberstab-Button regeneriert den Vorschlag.
   - **Position**, **Abteilung**, **Telefon**, **E-Mail**, **Notizen**
   - **Hauptkontakt** (Checkbox)
4. 📍 „Anlegen"
5. ✅ Kontakt erscheint in der Tabelle

##### Kontakt bearbeiten

1. 📍 ⋯-Menü des Kontakts → **„Bearbeiten"**
2. ✅ Dialog mit aktuellen Werten
3. Felder ändern → 📍 „Speichern"

##### Kontakt löschen

1. 📍 ⋯-Menü des Kontakts → **„Löschen"**
2. ✅ Bestätigungsdialog
3. 📍 „Bestätigen"

💡 **Hinweis:** Kontakte werden beim Löschen der übergeordneten Adresse automatisch mit gelöscht (Kaskade). Das Deaktivieren einer Adresse löscht die Kontakte jedoch **nicht** — sie bleiben erhalten und sind nach Wiederherstellung wieder sichtbar.

##### Praxisbeispiel: Briefanrede

**Szenario:** Sie legen einen neuen Kontakt für den Kunden „Müller GmbH" an.

1. 📍 Adresse „Müller GmbH" öffnen → Tab **„Kontakte"** → **„Kontakt hinzufügen"**
2. ✅ Dialog öffnet sich
3. **Anrede:** „Herr" wählen
4. **Titel:** „Dr." wählen
5. **Vorname:** „Thomas", **Nachname:** „Müller"
6. ✅ **Briefanrede** zeigt automatisch: „Sehr geehrter Herr Dr. Müller"
7. 📍 „Anlegen"
8. ✅ Kontakt erscheint in der Tabelle als „Herr Dr. Thomas Müller"

**Manuell überschreiben:**
1. 📍 ⋯-Menü des Kontakts → **„Bearbeiten"**
2. **Briefanrede** manuell ändern zu: „Lieber Thomas"
3. 📍 „Speichern"
4. ✅ Die manuelle Briefanrede bleibt erhalten — sie wird nicht automatisch überschrieben

💡 **Hinweis:** Die Briefanrede wird in Belegen und Reports als persönliche Anrede verwendet (z. B. in Angebotsschreiben oder Rechnungsbegleitschreiben).

---

### 12.3 Bankverbindungen

**Was ist es?** Bankverbindungen speichern die Zahlungsdaten einer Adresse — IBAN, BIC, Bankname und Kontoinhaber. Eine Adresse kann mehrere Bankverbindungen haben, wobei eine als Standard markiert werden kann.

**Wozu dient es?** Für Rechnungsstellung und Zahlungsverkehr müssen die Bankdaten des Kunden oder Lieferanten hinterlegt sein. Bei mehreren Bankverbindungen (z. B. Inland/Ausland) wird die Standard-Verbindung bevorzugt verwendet.

📍 Adressdetailseite → Tab **„Bankverbindungen"**

✅ Tabelle aller Bankverbindungen dieser Adresse

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **IBAN** | Internationale Kontonummer (monospace) |
| **BIC** | Bank-Identifikationscode |
| **Bank** | Name der Bank |
| **Kontoinhaber** | Name des Kontoinhabers |
| **Standard** | Badge, wenn als Standard-Bankverbindung markiert |
| **Aktionen** | ⋯-Menü: Bearbeiten, Löschen |

##### Neue Bankverbindung anlegen

1. 📍 Tab „Bankverbindungen" → **„Bankverbindung hinzufügen"** (oben rechts)
2. ✅ Dialog öffnet sich: „Neue Bankverbindung anlegen"
3. Ausfüllen:
   - **IBAN** (Pflicht — wird automatisch formatiert: Leerzeichen entfernt, Großbuchstaben)
   - **BIC**, **Bank**, **Kontoinhaber**
   - **Standard** (Checkbox)
4. 📍 „Anlegen"
5. ✅ Bankverbindung erscheint in der Tabelle

##### Bankverbindung bearbeiten / löschen

Analog zu Kontaktpersonen: ⋯-Menü → „Bearbeiten" oder „Löschen" mit Bestätigungsdialog.

💡 **Hinweis:** Bankverbindungen werden beim Löschen der übergeordneten Adresse automatisch mit gelöscht (Kaskade).

---

### 12.4 Nummernkreise

**Was ist es?** Nummernkreise steuern die automatische Vergabe von Kunden- und Lieferantennummern. Jeder Nummernkreis hat einen Schlüssel (z. B. „customer" oder „supplier"), ein Präfix (z. B. „K-" oder „L-") und einen Zähler.

**Wozu dient es?** Durch konfigurierbare Präfixe und Startwerte kann jedes Unternehmen sein eigenes Nummerierungsschema verwenden — z. B. „KD-" statt „K-" oder bei 1000 beginnen statt bei 1.

⚠️ Berechtigung: „Einstellungen verwalten"

📍 Seitenleiste → **Administration** → **Einstellungen** → Abschnitt Nummernkreise

| Nummernkreis | Standard-Präfix | Beschreibung |
|-------------|----------------|-------------|
| `customer` | K- | Kundennummern (K-1, K-2, …) |
| `supplier` | L- | Lieferantennummern (L-1, L-2, …) |
| `inquiry` | V- | Anfragenummern (V-1, V-2, …) |

**Ändern:**
1. 📍 Präfix und/oder nächsten Wert anpassen
2. 📍 „Speichern"

⚠️ **Achtung:** Den Zähler nur nach oben setzen, niemals nach unten — sonst könnten Duplikate entstehen.

💡 **Hinweis:** Nummernkreise werden beim ersten Anlegen einer Adresse automatisch initialisiert. Sie müssen nicht manuell erstellt werden.

---

### 12.5 Korrespondenz

**Was ist es?** Korrespondenz ist das Kommunikationsprotokoll einer CRM-Adresse. Jeder Telefonanruf, jede E-Mail, jeder Brief, jedes Fax und jeder Besuch wird als Eintrag mit Datum, Richtung (eingehend/ausgehend/intern), Typ und Betreff erfasst. Optional kann ein Kontaktpartner aus der Adresse verknüpft werden.

**Wozu dient es?** Die lückenlose Dokumentation aller Kommunikationsvorgänge mit Kunden und Lieferanten ist eine Grundvoraussetzung für professionelles CRM. Alle Mitarbeiter sehen auf einen Blick, wann zuletzt mit einem Kunden kommuniziert wurde, welche Themen besprochen wurden und wer der Ansprechpartner war.

Berechtigung: „CRM-Korrespondenz anzeigen" (Lesen), „CRM-Korrespondenz erstellen/bearbeiten/löschen" (Schreiben)

Adressdetailseite, Tab **„Korrespondenz"**

Tabelle aller Korrespondenzeinträge dieser Adresse, sortiert nach Datum (neueste zuerst).

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Datum** | Datum des Kommunikationsvorgangs |
| **Richtung** | Badge: Eingehend, Ausgehend, Intern |
| **Typ** | Badge mit Icon: Telefon, E-Mail, Brief, Fax, Besuch |
| **Betreff** | Betreffzeile des Eintrags |
| **Kontakt** | Verknüpfte Kontaktperson (falls vorhanden) |
| **Aktionen** | Menü: Anzeigen, Bearbeiten, Löschen |

**Filter:**
- **Suchfeld**: Durchsucht Betreff und Inhalt gleichzeitig (Volltextsuche, Groß-/Kleinschreibung egal)
- **Richtung-Filter**: Alle / Eingehend / Ausgehend / Intern
- **Typ-Filter**: Alle / Telefon / E-Mail / Brief / Fax / Besuch

##### Neuen Korrespondenzeintrag anlegen

1. Tab „Korrespondenz" — **„Neuer Eintrag"** (oben rechts)
2. Seitliches Formular (Sheet) öffnet sich: „Neuen Korrespondenzeintrag anlegen"
3. Abschnitt **Grunddaten** ausfüllen:
   - **Richtung** (Eingehend / Ausgehend / Intern) — Pflicht
   - **Typ** (Dropdown: Telefon / E-Mail / Brief / Fax / Besuch) — Pflicht
   - **Datum** (Standard: heute) — Pflicht
4. Abschnitt **Beteiligte** ausfüllen:
   - **Kontakt** (Dropdown: Kontaktpersonen dieser Adresse, optional)
   - **Von (intern)** (Freitext, optional — z. B. interner Absender)
   - **An (intern)** (Freitext, optional — z. B. interner Empfänger)
5. Abschnitt **Inhalt** ausfüllen:
   - **Betreff** (Pflicht)
   - **Inhalt** (Freitext, optional — Gesprächsnotizen, E-Mail-Text etc.)
6. „Anlegen"
7. Eintrag erscheint in der Tabelle, sortiert nach Datum

##### Korrespondenzeintrag anzeigen

1. Menü des Eintrags — **„Anzeigen"**
2. Dialog zeigt alle Details: Betreff, Richtung, Typ, Datum, Kontakt, Von/An, Inhalt, Anhänge

##### Korrespondenzeintrag bearbeiten

1. Menü des Eintrags — **„Bearbeiten"**
2. Formular öffnet sich mit den aktuellen Werten vorausgefüllt
3. Gewünschte Felder ändern
4. „Speichern"

##### Korrespondenzeintrag löschen

1. Menü des Eintrags — **„Löschen"**
2. Bestätigungsdialog: „Möchten Sie den Korrespondenzeintrag ‚{Betreff}' wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
3. „Bestätigen"
4. Eintrag wird unwiderruflich gelöscht

**Hinweis:** Korrespondenzeinträge werden hart gelöscht (kein Soft-Delete), da es sich um ein Kommunikationsprotokoll handelt. Beim Löschen einer übergeordneten Adresse werden alle zugehörigen Korrespondenzeinträge automatisch mit gelöscht (Kaskade).

**Hinweis:** Korrespondenzeinträge können über die Adresse mit Anfragen verknüpft werden. Die Korrespondenzliste einer Anfrage zeigt alle Einträge der zugehörigen Adresse (→ Abschnitt 12.8).

---

### 12.6 Praxisbeispiel: Korrespondenz protokollieren

Szenario: Bei der Adresse „Müller Maschinenbau GmbH" (aus dem Praxisbeispiel 12.7) soll ein Telefonat mit der Einkaufsleiterin Claudia Berger protokolliert werden. Anschließend wird eine ausgehende E-Mail-Bestätigung erfasst.

##### Schritt 1 — Telefonat protokollieren

CRM — Adressen — „Müller Maschinenbau GmbH" — Tab **„Korrespondenz"** — **„Neuer Eintrag"**

- Richtung: **Eingehend**
- Typ: **Telefon**
- Datum: (heute)
- Kontakt: **Claudia Berger** (aus Dropdown)
- Betreff: `Anfrage zu Lieferzeiten Bauteil X-500`
- Inhalt: `Frau Berger erkundigt sich nach Lieferzeiten für 50 Stück Bauteil X-500. Liefertermin voraussichtlich KW 14. Angebot wird per E-Mail nachgereicht.`

„Anlegen"

Eintrag erscheint in der Tabelle: Datum = heute, Richtung = Eingehend, Typ = Telefon, Betreff = „Anfrage zu Lieferzeiten Bauteil X-500", Kontakt = Claudia Berger.

##### Schritt 2 — Ausgehende E-Mail protokollieren

Tab „Korrespondenz" — **„Neuer Eintrag"**

- Richtung: **Ausgehend**
- Typ: **E-Mail**
- Datum: (heute)
- Kontakt: **Claudia Berger**
- Von (intern): `Max Mustermann`
- Betreff: `Angebot Bauteil X-500 — 50 Stück`
- Inhalt: `Angebot Nr. A-2026-042 per E-Mail an c.berger@mueller-maschinenbau.de versendet. Liefertermin KW 14, Preis gemäß Rahmenvertrag.`

„Anlegen"

Zwei Einträge in der Korrespondenzliste. Der neueste (E-Mail, ausgehend) steht oben.

##### Schritt 3 — Suche und Filter testen

Suchfeld: `Bauteil X-500`

Beide Einträge werden gefunden (Betreff enthält den Suchbegriff).

Richtung-Filter: **Ausgehend**

Nur der E-Mail-Eintrag wird angezeigt.

Filter zurücksetzen.

---

### 12.7 Praxisbeispiel: Neuen Kunden mit Kontakten und Bankverbindung anlegen

Szenario: Das Unternehmen „Müller Maschinenbau GmbH" aus München wird als neuer Kunde angelegt. Es gibt zwei Ansprechpartner: den Geschäftsführer Hans Müller und die Einkaufsleiterin Claudia Berger. Die Bankverbindung bei der Commerzbank wird hinterlegt.

##### Schritt 1 — Adresse anlegen

📍 Seitenleiste → **CRM** → **Adressen** → **„Neue Adresse"**

- Typ: **Kunde**
- Firma: `Müller Maschinenbau GmbH`
- Matchcode: (leer lassen — wird automatisch zu „MUELLER MASCHINENBAU")
- Straße: `Industriestr. 42`
- PLZ: `80333`
- Ort: `München`
- Land: `DE`
- Telefon: `+49 89 123456`
- E-Mail: `info@mueller-maschinenbau.de`
- Zahlungsziel: `30` Tage

📍 „Anlegen"

✅ Die Adresse erscheint in der Tabelle mit Nummer „K-1" (erste Kundennummer), Typ „Kunde" und Ort „München".

##### Schritt 2 — Kontaktpersonen anlegen

📍 Adresse „Müller Maschinenbau GmbH" anklicken → Tab **„Kontakte"** → **„Kontakt hinzufügen"**

**Kontakt 1 — Geschäftsführer:**
- Vorname: `Hans`
- Nachname: `Müller`
- Position: `Geschäftsführer`
- Abteilung: `Geschäftsleitung`
- Telefon: `+49 89 123456-10`
- E-Mail: `h.mueller@mueller-maschinenbau.de`
- Hauptkontakt: ✅ (aktiviert)

📍 „Anlegen"

**Kontakt 2 — Einkaufsleiterin:**
- Vorname: `Claudia`
- Nachname: `Berger`
- Position: `Einkaufsleiterin`
- Abteilung: `Einkauf`
- Telefon: `+49 89 123456-20`
- E-Mail: `c.berger@mueller-maschinenbau.de`
- Hauptkontakt: (nicht aktiviert)

📍 „Anlegen"

✅ Beide Kontakte erscheinen in der Tabelle. Hans Müller wird mit dem Badge „Hauptkontakt" angezeigt.

##### Schritt 3 — Bankverbindung anlegen

📍 Tab **„Bankverbindungen"** → **„Bankverbindung hinzufügen"**

- IBAN: `DE89 3704 0044 0532 0130 00` (Leerzeichen werden automatisch entfernt)
- BIC: `COBADEFFXXX`
- Bank: `Commerzbank`
- Kontoinhaber: `Müller Maschinenbau GmbH`
- Standard: ✅ (aktiviert)

📍 „Anlegen"

✅ Die Bankverbindung erscheint in der Tabelle mit formatierter IBAN und dem Badge „Standard".

##### Schritt 4 — Ergebnis prüfen

📍 Tab **„Übersicht"** — alle Stammdaten auf einen Blick:
- Anschrift: Industriestr. 42, 80333 München, DE
- Kommunikation: Telefon, E-Mail
- Zahlungsbedingungen: 30 Tage

📍 Tab **„Kontakte"** — 2 Einträge, davon 1 Hauptkontakt

📍 Tab **„Bankverbindungen"** — 1 Eintrag (Standard)

✅ Der Kunde ist vollständig angelegt und kann nun für Korrespondenz, Anfragen und Belege verwendet werden (sobald die entsprechenden CRM-Module freigeschaltet sind).

💡 **Hinweis:** Der Tab „Belege" wird in einem zukünftigen Ticket (ORD_01) implementiert und ist aktuell als Platzhalter sichtbar.

#### Wo Adressen außerdem erscheinen

| Ort | Pfad | Was angezeigt wird |
|-----|------|--------------------|
| Korrespondenz | 📍 CRM → Adressen → Detail → Tab „Korrespondenz" | Telefonate, E-Mails, Briefe, Faxe, Besuche zu dieser Adresse (Abschnitt 12.5) |
| Anfragen | 📍 CRM → Adressen → Detail → Tab „Anfragen" | Kundenanfragen dieser Adresse (Abschnitt 12.8) |
| Aufgaben | 📍 CRM → Adressen → Detail → Tab „Aufgaben" | Aufgaben und Nachrichten dieser Adresse (Abschnitt 12.10) |
| Belege (geplant) | 📍 CRM → Adressen → Detail → Tab „Belege" | Rechnungen, Lieferscheine, Gutschriften |

---

### 12.8 Anfragen

**Was ist es?** Eine Anfrage ist die übergeordnete Klammer für alle Kundenaktivitäten. Jede Anfrage gehört zu einer Adresse, hat einen Status-Workflow (Offen → In Bearbeitung → Geschlossen → Storniert) und erhält automatisch eine eindeutige Anfragenummer (z. B. V-1, V-2). Optional kann eine Anfrage mit einem Terp-Auftrag verknüpft werden, um Zeiten darauf zu buchen.

**Wozu dient es?** Anfragen bündeln alle Aktivitäten zu einer Kundenanfrage: Korrespondenz, Dokumente und Aufgaben werden der Anfrage zugeordnet. Durch den Status-Workflow ist auf einen Blick erkennbar, welche Anfragen offen sind, welche bearbeitet werden und welche abgeschlossen wurden. Die Verknüpfung mit einem Terp-Auftrag ermöglicht die Zeiterfassung direkt auf die Anfrage.

⚠️ Modul: Das CRM-Modul muss für den Mandanten aktiviert sein (📍 Administration → Einstellungen → Module → **CRM**)

⚠️ Berechtigung: „CRM-Anfragen anzeigen" (Lesen), „CRM-Anfragen erstellen/bearbeiten/löschen" (Schreiben)

📍 Seitenleiste → **CRM** → **Anfragen**

✅ Seite mit Titel „Anfragen", Tabelle aller Anfragen, Suchfeld und Statusfilter.

#### Anfragenliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | Auto-generierte Anfragenummer (z. B. V-1, V-3) — monospace |
| **Titel** | Bezeichnung der Anfrage |
| **Kunde / Lieferant** | Verknüpfte Adresse (nur in der globalen Liste sichtbar, nicht im Adress-Tab) |
| **Status** | Badge: Offen (blau), In Bearbeitung (grau), Geschlossen (Outline), Storniert (rot) |
| **Verknüpfter Auftrag** | Name des verknüpften Terp-Auftrags (falls vorhanden) |
| **Erstellt am** | Datum der Erstellung |
| **Aktionen** | ⋯-Menü: Anzeigen, Bearbeiten, Löschen |

**Filter:**
- **Suchfeld**: Durchsucht Titel und Nummer gleichzeitig
- **Status-Filter**: Alle Status / Offen / In Bearbeitung / Geschlossen / Storniert

##### Neue Anfrage anlegen

1. 📍 **„Neue Anfrage"** (oben rechts)
2. ✅ Seitliches Formular (Sheet) öffnet sich: „Neue Anfrage anlegen"
3. Abschnitt **Grunddaten** ausfüllen:
   - **Titel** (Pflicht)
   - **Kunde / Lieferant** (Dropdown: alle aktiven Adressen — Pflicht)
   - **Kontakt** (Dropdown: Kontaktpersonen der gewählten Adresse, optional)
   - **Aufwand** (Dropdown: Gering / Mittel / Hoch, optional)
4. **Notizen** (optionales Freitext-Feld)
5. 📍 „Anlegen"
6. ✅ Anfrage erscheint in der Tabelle mit automatisch vergebener Nummer

💡 **Hinweis:** Die Anfragenummer wird beim Anlegen automatisch vergeben und kann nicht manuell geändert werden. Anfragen erhalten Nummern mit Präfix „V-" (V-1, V-2, …). Wird die Anfrage vom Tab „Anfragen" einer Adresse aus angelegt, ist die Adresse bereits vorbelegt.

##### Anfrage bearbeiten

1. 📍 ⋯-Menü der Anfrage → **„Bearbeiten"**
2. ✅ Formular öffnet sich mit den aktuellen Werten vorausgefüllt
3. Zusätzliches Feld im Bearbeitungsmodus:
   - **Zahlungsfähigkeit** (Freitext)
4. 📍 „Speichern"

⚠️ **Geschlossene Anfragen können nicht bearbeitet werden.** Der Button „Bearbeiten" wird ausgeblendet und ein Hinweis angezeigt: „Diese Anfrage ist geschlossen und kann nicht mehr bearbeitet werden."

##### Anfrage löschen

1. 📍 ⋯-Menü der Anfrage → **„Löschen"**
2. ✅ Bestätigungsdialog: „Möchten Sie die Anfrage ‚{Titel}' wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
3. 📍 „Bestätigen"

⚠️ **Löschen nur möglich, wenn keine Korrespondenzeinträge verknüpft sind.** Andernfalls erscheint der Hinweis: „Diese Anfrage kann nicht gelöscht werden, da noch Korrespondenzeinträge verknüpft sind."

#### Anfragedetails

📍 Zeile in der Tabelle anklicken → Detailseite

✅ Kopfbereich zeigt: Titel (groß), Nummer (monospace Badge), Status-Badge, Buttons für Aktionen (Bearbeiten, Schließen, Stornieren, Löschen)

Die Detailseite hat **4 Tabs**:

**Tab „Übersicht":** Alle Anfragedaten in Kartenansicht (2-Spalten-Grid)

| Karte | Felder |
|-------|--------|
| **Grunddaten** | Nummer, Titel, Kunde / Lieferant (Link zur Adresse), Kontakt, Aufwand (Gering/Mittel/Hoch), Zahlungsfähigkeit, Erstellt am |
| **Zusatzinformationen** | Status (Badge), Verknüpfter Auftrag (mit Link oder „Auftrag verknüpfen"-Button), Geschlossen am, Abschlussgrund, Abschlussbemerkung, Notizen |

**Tab „Korrespondenz":** Zeigt alle Korrespondenzeinträge der verknüpften Adresse (→ Abschnitt 12.5)

**Tab „Aufgaben":** Zeigt alle Aufgaben, die mit dieser Anfrage verknüpft sind (→ Abschnitt 12.9)

**Tab „Belege":** Zeigt alle Belege (Angebote, AB, Rechnungen etc.), die bei der Erstellung mit dieser Anfrage verknüpft wurden. Klick auf eine Zeile öffnet die Beleg-Detailseite. Ein Beleg wird mit einer Anfrage verknüpft, indem beim Erstellen des Belegs (→ Abschnitt 13.3) im Feld „Anfrage" die entsprechende Anfrage ausgewählt wird.

#### Status-Workflow

Anfragen durchlaufen einen definierten Status-Workflow:

| Status | Badge | Bedeutung |
|--------|-------|-----------|
| **Offen** | Blau (ausgefüllt) | Anfrage neu angelegt, noch nicht bearbeitet |
| **In Bearbeitung** | Grau | Anfrage wird aktiv bearbeitet |
| **Geschlossen** | Outline | Anfrage abgeschlossen (unveränderlich) |
| **Storniert** | Rot | Anfrage abgebrochen |

**Aktionen auf der Detailseite:**

| Aktion | Button | Bedingung |
|--------|--------|-----------|
| **Schließen** | „Schließen" | Nur wenn Status ≠ Geschlossen und ≠ Storniert |
| **Stornieren** | „Abbrechen" | Nur wenn Status ≠ Geschlossen und ≠ Storniert |
| **Wieder öffnen** | „Wieder öffnen" | Nur wenn Status = Geschlossen oder Storniert |

##### Anfrage schließen

1. 📍 Detailseite → **„Schließen"**
2. ✅ Dialog: „Möchten Sie die Anfrage ‚{Titel}' schließen?"
3. Ausfüllen:
   - **Abschlussgrund** (Dropdown: Auftrag erteilt / Kein Bedarf / Konkurrenz / Sonstiges, optional)
   - **Abschlussbemerkung** (Freitext, optional)
   - **„Verknüpften Auftrag ebenfalls schließen"** (Checkbox — nur sichtbar, wenn ein Auftrag verknüpft ist)
4. 📍 „Bestätigen"
5. ✅ Status wechselt auf „Geschlossen", Datum und Benutzer werden gespeichert

##### Anfrage stornieren

1. 📍 Detailseite → **„Abbrechen"**
2. ✅ Bestätigungsdialog: „Möchten Sie die Anfrage ‚{Titel}' stornieren?"
3. 📍 „Bestätigen"
4. ✅ Status wechselt auf „Storniert"

##### Anfrage wieder öffnen

1. 📍 Detailseite → **„Wieder öffnen"**
2. ✅ Bestätigungsdialog: „Möchten Sie die Anfrage ‚{Titel}' wieder öffnen?"
3. 📍 „Bestätigen"
4. ✅ Status wechselt auf „In Bearbeitung"

#### Auftragsverknüpfung

Anfragen können mit einem Terp-Auftrag verknüpft werden, um Projektzeiten darauf zu erfassen. Die Verknüpfung erfolgt über die Detailseite.

📍 Detailseite → Karte „Zusatzinformationen" → **„Auftrag verknüpfen"**

✅ Dialog mit zwei Tabs:

**Tab „Bestehenden verknüpfen":**
- Dropdown mit allen aktiven Terp-Aufträgen (Code — Name)
- 📍 „Bestätigen"

**Tab „Neu anlegen":**
- **Auftragsbezeichnung** (vorausgefüllt mit dem Anfragetitel)
- 📍 „Auftrag anlegen" → erstellt einen neuen Terp-Auftrag und verknüpft ihn automatisch

✅ Nach der Verknüpfung zeigt die Karte den Auftragsnamen mit Code an.

💡 **Hinweis:** Beim Schließen einer Anfrage kann der verknüpfte Auftrag optional mit geschlossen werden (Checkbox im Schließen-Dialog).

#### Anfragen im Adress-Tab

Anfragen einer bestimmten Adresse sind auch direkt über die Adressdetailseite erreichbar:

📍 CRM → Adressen → Adresse anklicken → Tab **„Anfragen"**

✅ Dieselbe Anfragenliste, gefiltert auf die aktuelle Adresse. Die Spalte „Kunde / Lieferant" wird ausgeblendet, da die Adresse bereits aus dem Kontext klar ist. Beim Anlegen einer neuen Anfrage ist die Adresse vorbelegt.

---

### 12.9 Praxisbeispiel: Kundenanfrage anlegen und abschließen

Szenario: Beim Kunden „Müller Maschinenbau GmbH" (aus dem Praxisbeispiel 12.7) geht eine Anfrage zu Lieferzeiten ein. Die Anfrage wird angelegt, mit einem Auftrag verknüpft (für die Zeiterfassung) und nach erfolgreicher Bearbeitung geschlossen.

##### Schritt 1 — Anfrage anlegen

📍 Seitenleiste → **CRM** → **Anfragen** → **„Neue Anfrage"**

- Titel: `Anfrage Lieferzeiten Bauteil X-500`
- Kunde / Lieferant: **Müller Maschinenbau GmbH** (K-1)
- Kontakt: **Claudia Berger** (Einkaufsleiterin)
- Aufwand: **Mittel**
- Notizen: `Kunde erfragt Lieferzeiten für 50 Stück Bauteil X-500. Liefertermin voraussichtlich KW 14.`

📍 „Anlegen"

✅ Anfrage erscheint in der Tabelle: Nummer = V-1, Status = „Offen", Kunde = Müller Maschinenbau GmbH.

##### Schritt 2 — Auftrag verknüpfen

📍 Anfrage „V-1" anklicken → Karte „Zusatzinformationen" → **„Auftrag verknüpfen"**

Tab **„Neu anlegen"**:
- Auftragsbezeichnung: `Anfrage Lieferzeiten Bauteil X-500` (vorausgefüllt)

📍 „Auftrag anlegen"

✅ Ein neuer Terp-Auftrag wird erstellt und auf der Detailseite angezeigt. Mitarbeiter können nun Zeiten auf diesen Auftrag buchen.

##### Schritt 3 — Anfrage schließen

📍 Detailseite → **„Schließen"**

- Abschlussgrund: **Auftrag erteilt**
- Abschlussbemerkung: `Auftrag über 50 Stück X-500 bestätigt, Lieferung KW 14.`
- ☑️ „Verknüpften Auftrag ebenfalls schließen"

📍 „Bestätigen"

✅ Status wechselt auf „Geschlossen". Datum und Bearbeiter werden gespeichert. Die Anfrage kann nicht mehr bearbeitet werden — der Button „Bearbeiten" ist ausgeblendet, stattdessen wird der Hinweis angezeigt: „Diese Anfrage ist geschlossen und kann nicht mehr bearbeitet werden."

##### Schritt 4 — Ergebnis prüfen

📍 Tab **„Übersicht"**:
- Status: Geschlossen
- Geschlossen am: (heutiges Datum)
- Abschlussgrund: Auftrag erteilt
- Abschlussbemerkung: Auftrag über 50 Stück X-500 bestätigt …

📍 CRM → Adressen → „Müller Maschinenbau GmbH" → Tab **„Anfragen"**:

✅ Die Anfrage V-1 erscheint in der Liste mit Status „Geschlossen".

---

### 12.10 Aufgaben & Nachrichten

**Was ist es?** Aufgaben und Nachrichten sind das interne Kommunikations- und Aufgabensystem im CRM-Modul. Eine Aufgabe hat einen Betreff, eine optionale Beschreibung, ein Fälligkeitsdatum und einen Status-Workflow (Offen → In Bearbeitung → Erledigt / Storniert). Eine Nachricht ist eine vereinfachte Aufgabe ohne Terminierung — sie dient als interne Mitteilung. Beide können einer oder mehreren Personen (Mitarbeitern oder ganzen Teams) zugewiesen werden.

**Wozu dient es?** Aufgaben und Nachrichten ermöglichen die interne Koordination im CRM: Wer muss was bis wann erledigen? Wer wurde über etwas informiert? Durch die Verknüpfung mit Adressen und Anfragen ist der Kontext immer klar. Zugewiesene Mitarbeiter erhalten automatisch eine Terp-Benachrichtigung und können ihre Aufgaben über „Meine Aufgaben" einsehen.

⚠️ Modul: Das CRM-Modul muss für den Mandanten aktiviert sein (📍 Administration → Einstellungen → Module → **CRM**)

⚠️ Berechtigung: „CRM-Aufgaben anzeigen" (Lesen), „CRM-Aufgaben erstellen/bearbeiten/löschen" (Schreiben). „Meine Aufgaben" ist für jeden angemeldeten Benutzer ohne spezielle Berechtigung sichtbar.

📍 Seitenleiste → **CRM** → **Aufgaben**

✅ Seite mit Titel „Aufgaben & Nachrichten", Tabelle aller Aufgaben, Suchfeld, Status- und Typfilter, Umschalter „Meine Aufgaben".

#### Aufgabenliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Typ** | Icon: Aufgabe (Häkchen) oder Nachricht (Sprechblase) |
| **Betreff** | Bezeichnung der Aufgabe (fett) |
| **Zugewiesen an** | Kommagetrennte Liste der Mitarbeiter und Teams |
| **Fällig am** | Fälligkeitsdatum (nur bei Aufgaben, nicht bei Nachrichten) |
| **Status** | Badge: Offen (blau), In Bearbeitung (grau), Erledigt (Outline), Storniert (rot) |
| **Aktionen** | ⋯-Menü: Anzeigen, Bearbeiten, Erledigen, Löschen |

**Filter:**
- **Suchfeld**: Durchsucht den Betreff
- **Status-Filter**: Alle Status / Offen / In Bearbeitung / Erledigt / Storniert
- **Typ-Filter**: Alle Typen / Aufgabe / Nachricht
- **„Meine Aufgaben"**: Umschalter — zeigt nur Aufgaben, die dem angemeldeten Benutzer (oder seinem Team) zugewiesen sind

##### Neue Aufgabe anlegen

1. 📍 **„Neue Aufgabe"** (oben rechts)
2. ✅ Seitliches Formular (Sheet) öffnet sich: „Neue Aufgabe anlegen"
3. Abschnitt **Grunddaten** ausfüllen:
   - **Typ** (Umschalter: Aufgabe / Nachricht) — Standard: Aufgabe
   - **Betreff** (Pflicht)
   - **Beschreibung** (optional)
4. Abschnitt **Verknüpfungen** ausfüllen:
   - **Adresse** (Dropdown: alle aktiven CRM-Adressen, optional)
   - **Kontakt** (Dropdown: Kontaktpersonen der gewählten Adresse, nur sichtbar wenn Adresse gewählt)
   - **Anfrage** (Dropdown: Anfragen der gewählten Adresse, optional)
5. Abschnitt **Zuweisungen** ausfüllen:
   - **Zugewiesen an** (Pflicht, Mehrfachauswahl: Mitarbeiter und/oder Teams)
6. Abschnitt **Terminierung** ausfüllen (nur bei Typ „Aufgabe"):
   - **Fällig am** (Datumsauswahl, optional)
   - **Uhrzeit** (HH:MM, optional)
   - **Dauer (Min.)** (Zahl, optional)
7. 📍 „Anlegen"
8. ✅ Aufgabe erscheint in der Tabelle. Zugewiesene Mitarbeiter erhalten eine Benachrichtigung.

💡 **Hinweis:** Bei Typ „Nachricht" sind die Terminierungsfelder (Fällig am, Uhrzeit, Dauer) ausgeblendet — Nachrichten haben keinen Termin. Wird die Aufgabe aus dem Tab „Aufgaben" einer Adresse oder Anfrage heraus angelegt, ist die Verknüpfung bereits vorbelegt.

##### Aufgabe bearbeiten

1. 📍 ⋯-Menü der Aufgabe → **„Bearbeiten"**
2. ✅ Formular öffnet sich mit den aktuellen Werten vorausgefüllt
3. Gewünschte Felder ändern
4. 📍 „Speichern"

⚠️ **Erledigte und stornierte Aufgaben können nicht bearbeitet werden.**

##### Aufgabe löschen

1. 📍 ⋯-Menü der Aufgabe → **„Löschen"**
2. ✅ Bestätigungsdialog: „Möchten Sie die Aufgabe wirklich löschen?"
3. 📍 „Bestätigen"

#### Aufgabendetails

📍 Zeile in der Tabelle anklicken → Detaildialog

✅ Dialog zeigt: Betreff (groß), Typ-Badge, Status-Badge, Aktionsbuttons (Erledigen, Stornieren, Wieder öffnen, Bearbeiten, Löschen)

Der Dialog hat folgende Bereiche:

| Bereich | Felder |
|---------|--------|
| **Grunddaten** | Betreff, Beschreibung, Typ, Erstellt am |
| **Verknüpfungen** | Adresse (Link), Kontakt, Anfrage (Link) |
| **Terminierung** | Fällig am, Uhrzeit, Dauer (nur bei Aufgaben) |
| **Zuweisungen** | Liste der Zugewiesenen mit Lesestatus (grüner Haken = gelesen, grauer Strich = ungelesen) |

#### Status-Workflow

Aufgaben durchlaufen einen definierten Status-Workflow:

| Status | Badge | Bedeutung |
|--------|-------|-----------|
| **Offen** | Blau (ausgefüllt) | Aufgabe neu angelegt, noch nicht bearbeitet |
| **In Bearbeitung** | Grau | Aufgabe wird aktiv bearbeitet (automatischer Übergang bei erster Bearbeitung) |
| **Erledigt** | Outline | Aufgabe abgeschlossen |
| **Storniert** | Rot | Aufgabe abgebrochen |

**Aktionen im Detaildialog:**

| Aktion | Button | Bedingung |
|--------|--------|-----------|
| **Erledigen** | „Erledigen" | Nur wenn Status = Offen oder In Bearbeitung |
| **Stornieren** | „Stornieren" | Nur wenn Status = Offen oder In Bearbeitung |
| **Wieder öffnen** | „Wieder öffnen" | Nur wenn Status = Erledigt oder Storniert |

##### Aufgabe erledigen

1. 📍 Detaildialog → **„Erledigen"**
2. ✅ Bestätigungsdialog: „Möchten Sie die Aufgabe als erledigt markieren?"
3. 📍 „Bestätigen"
4. ✅ Status wechselt auf „Erledigt", Datum und Bearbeiter werden gespeichert

##### Aufgabe stornieren

1. 📍 Detaildialog → **„Stornieren"**
2. ✅ Bestätigungsdialog: „Möchten Sie die Aufgabe stornieren?"
3. 📍 „Bestätigen"
4. ✅ Status wechselt auf „Storniert"

##### Aufgabe wieder öffnen

1. 📍 Detaildialog → **„Wieder öffnen"**
2. ✅ Bestätigungsdialog: „Möchten Sie die Aufgabe wieder öffnen?"
3. 📍 „Bestätigen"
4. ✅ Status wechselt auf „In Bearbeitung"

#### Meine Aufgaben

Jeder angemeldete Benutzer kann seine eigenen Aufgaben einsehen — ohne spezielle Berechtigung.

📍 **„Meine Aufgaben"** (Umschalter in der Aufgabenliste)

✅ Die Tabelle zeigt nur Aufgaben, die dem Benutzer direkt oder über ein Team zugewiesen sind.

#### Aufgaben in Adress- und Anfragedetails

Aufgaben einer bestimmten Adresse oder Anfrage sind auch direkt über die jeweilige Detailseite erreichbar:

📍 CRM → Adressen → Adresse anklicken → Tab **„Aufgaben"**

📍 CRM → Anfragen → Anfrage anklicken → Tab **„Aufgaben"**

✅ Dieselbe Aufgabenliste, gefiltert auf die aktuelle Adresse bzw. Anfrage. Beim Anlegen einer neuen Aufgabe ist die Verknüpfung vorbelegt.

#### Benachrichtigungen

Beim Anlegen einer Aufgabe oder Nachricht erhalten alle zugewiesenen Mitarbeiter automatisch eine Terp-Benachrichtigung (Typ „Erinnerung"). Die Benachrichtigung erscheint in der Benachrichtigungsglocke und enthält einen Link zur Aufgabenliste.

📍 🔔 Benachrichtigungsglocke → Benachrichtigung anklicken → Aufgabenliste

---

### 12.11 Auswertungen

**Was ist es?** Auswertungen bieten eine zentrale Berichts- und Analysesicht auf alle CRM-Daten. Das Dashboard zeigt Kennzahlen (KPIs) wie Gesamtzahl der Adressen, offene Anfragen, ausstehende Aufgaben und überfällige Termine auf einen Blick. Detaillierte Berichte liefern Statistiken zu Adressen (Verteilung nach Typ, aktiv/inaktiv), Korrespondenz (Verlauf nach Zeitraum und Typ), Anfragen (Pipeline nach Status, durchschnittliche Bearbeitungsdauer, Top-Kunden) und Aufgaben (Erledigungsquote, Bearbeitungsdauer, Verteilung pro Mitarbeiter).

**Wozu dient es?** Auswertungen ermöglichen einen schnellen Überblick über den aktuellen Stand des CRM: Wie viele Kunden sind aktiv? Wie viele Anfragen stehen offen? Werden Aufgaben rechtzeitig erledigt? Die Berichte helfen bei der Planung und Optimierung von Kundenbeziehungen und internen Arbeitsabläufen.

⚠️ Modul: Das CRM-Modul muss für den Mandanten aktiviert sein (📍 Administration → Einstellungen → Module → **CRM**)

⚠️ Berechtigung: „CRM-Adressen anzeigen" (Übersicht und Adress-Statistik), „CRM-Korrespondenz anzeigen" (Korrespondenz-Bericht), „CRM-Anfragen anzeigen" (Anfragen-Pipeline), „CRM-Aufgaben anzeigen" (Aufgaben-Auswertung)

📍 Seitenleiste → **CRM** → **Auswertungen**

✅ Seite mit Titel „CRM Auswertungen", KPI-Karten im oberen Bereich, darunter tabellarische und grafische Berichte in Reitern.

#### Übersicht (KPI-Karten)

Im oberen Bereich der Seite werden vier Kennzahlenkarten angezeigt:

| Karte | Beschreibung |
|-------|-------------|
| **Adressen gesamt** | Gesamtzahl aller CRM-Adressen. Darunter: Anzahl neu angelegter Adressen im aktuellen Monat. |
| **Offene Anfragen** | Anzahl der Anfragen mit Status „Offen" oder „In Bearbeitung". |
| **Offene Aufgaben** | Anzahl der Aufgaben (Typ „Aufgabe") mit Status „Offen" oder „In Bearbeitung". Zusätzlich: Anzahl überfälliger Aufgaben (Fälligkeitsdatum in der Vergangenheit). |
| **Korrespondenz diese Woche** | Anzahl der Korrespondenzeinträge seit Montag der aktuellen Woche. |

#### Adress-Statistik

📍 Reiter **„Adress-Statistik"**

✅ Zwei Diagramme:

1. **Kreisdiagramm — Adressen nach Typ:** Verteilung der Adressen nach Typ (Kunde, Lieferant, Beides).
2. **Balkendiagramm — Aktiv / Inaktiv:** Anzahl aktiver und inaktiver Adressen.

#### Korrespondenz-Bericht

📍 Reiter **„Korrespondenz-Bericht"**

✅ Zwei Diagramme mit Datumsfilter:

**Filter:**
- **Von / Bis:** Datumsbereich (Standard: letzte 3 Monate)
- **Gruppierung:** Tag / Woche / Monat (Standard: Monat)

1. **Balkendiagramm — Korrespondenz im Zeitverlauf:** Gestapeltes Balkendiagramm mit den Richtungen „Eingehend", „Ausgehend" und „Intern" pro Zeitraum.
2. **Kreisdiagramm — Korrespondenz nach Typ:** Verteilung nach Kommunikationstyp (Telefon, E-Mail, Brief, Fax, Besuch).

#### Anfragen-Pipeline

📍 Reiter **„Anfragen-Pipeline"**

✅ Folgende Auswertungen:

1. **Balkendiagramm — Anfragen nach Status:** Anzahl der Anfragen pro Status (Offen, In Bearbeitung, Geschlossen, Storniert) mit farbigen Balken.
2. **Kennzahl — Durchschnittliche Bearbeitungsdauer:** Durchschnittliche Anzahl Tage zwischen Anlage und Abschluss geschlossener Anfragen.
3. **Tabelle — Top-Adressen nach Anfragen:** Die 10 Adressen mit den meisten Anfragen (Spalten: Firma, Anzahl).
4. **Kreisdiagramm — Anfragen nach Aufwand:** Verteilung nach Aufwandsstufe (Gering, Mittel, Hoch).

Optionaler Datumsfilter (Von / Bis) schränkt den Auswertungszeitraum ein.

#### Aufgaben-Auswertung

📍 Reiter **„Aufgaben-Auswertung"**

✅ Folgende Auswertungen:

1. **Kennzahlen-Karten:**
   - **Erledigungsquote:** Prozentualer Anteil erledigter Aufgaben an der Gesamtzahl.
   - **Durchschn. Erledigungsdauer:** Durchschnittliche Anzahl Tage zwischen Anlage und Erledigung.
   - **Überfällig:** Anzahl offener Aufgaben mit überschrittenem Fälligkeitsdatum.
2. **Tabelle — Aufgaben pro Mitarbeiter:** Aufschlüsselung nach Mitarbeiter (Spalten: Name, Gesamt, Erledigt, Offen).

Optionaler Datumsfilter (Von / Bis) schränkt den Auswertungszeitraum ein.

---

## 13. Belege & Fakturierung

**Was ist es?** Das Belegmodul bildet die gesamte kaufmännische Belegkette ab -- vom Angebot über Auftragsbestätigung und Lieferschein bis zur Rechnung und Gutschrift. Jeder Beleg enthält Positionen (Artikel, Freitext, Zwischensummen) mit automatischer Berechnung.

**Wozu dient es?** Angebote erstellen, Aufträge bestätigen, Lieferungen dokumentieren und Rechnungen generieren -- alles in einem durchgängigen Workflow mit lückenloser Nachverfolgbarkeit der Belegkette.

> Modul: **Billing** muss aktiviert sein (Administration > Module > "Billing" aktivieren)

> Berechtigung: `billing_documents.view`, `billing_documents.create`, `billing_documents.edit`, `billing_documents.delete`, `billing_documents.finalize`

Aufträge > Belege

Sie sehen die Belegliste mit allen Dokumenten des aktiven Mandanten.

### 13.1 Belegtypen

| Typ | Deutsch | Prefix | Beschreibung |
|-----|---------|--------|-------------|
| **OFFER** | Angebot | A- | Erstes Dokument in der Kette. Preisvorschlag an den Kunden. |
| **ORDER_CONFIRMATION** | Auftragsbestätigung | AB- | Bestätigung des Auftrags nach Angebotsakzeptanz. |
| **DELIVERY_NOTE** | Lieferschein | LS- | Begleitdokument fuer Lieferungen — kann sowohl Waren als auch Dienstleistungen enthalten. Nur Artikelpositionen mit Bestandsfuehrung loesen eine Lagerbuchung aus (je nach Einstellung unter Administration → Einstellungen → Lager). |
| **SERVICE_NOTE** | Leistungsschein | LN- | Nachweis fuer reine Dienstleistungsauftraege ohne Warenlieferung (z.B. Wartung, Beratung). Keine Lagerbuchung. |
| **RETURN_DELIVERY** | Rücklieferung | R- | Dokumentation einer Warenrücksendung. |
| **INVOICE** | Rechnung | RE- | Zahlungsaufforderung an den Kunden. Ende der Kette. |
| **CREDIT_NOTE** | Gutschrift | G- | Rückerstattung/Gutschrift an den Kunden. |

#### Belegkette (Fortführungsregeln)

| Quellbeleg | Kann fortgeführt werden zu |
|-----------|--------------------------|
| Angebot | Auftragsbestätigung |
| Auftragsbestätigung | Lieferschein, Leistungsschein |
| Lieferschein | Rechnung |
| Leistungsschein | Rechnung |
| Rücklieferung | Gutschrift |
| Rechnung | (Ende der Kette) |
| Gutschrift | (Ende der Kette) |

### 13.2 Belegliste

Aufträge > Belege

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | Auto-generierte Belegnummer (z.B. A-1, RE-42) |
| **Typ** | Belegtyp als farbiges Badge |
| **Kunde** | Firmenname der verknüpften Adresse |
| **Datum** | Belegdatum |
| **Betrag** | Bruttosumme (totalGross) |
| **Status** | Entwurf, Abgeschlossen, Fortgeführt, Storniert |

**Filter:**
- **Typ-Filter**: Alle, Angebot, AB, Lieferschein, etc.
- **Status-Filter**: Dropdown mit Statuswerten
- **Suchfeld**: Suche nach Belegnummer

### 13.3 Beleg anlegen

1. **"Neuer Beleg"** (Belegliste, oben rechts)
2. Formular öffnet sich
3. Belegtyp wählen (Angebot, AB, Lieferschein, etc.)
4. Kundenadresse auswählen (Pflicht)
5. Optionale Felder:
   - **Kontaktperson**: Ansprechpartner aus der Adresse (Dropdown erscheint automatisch, wenn die gewählte Adresse Kontaktpersonen hat). Wird für die Platzhalter-Auflösung in Dokumentvorlagen verwendet (→ Abschnitt 13.8a).
   - **Lieferadresse**: Abweichende Lieferanschrift
   - **Rechnungsadresse**: Abweichende Rechnungsanschrift
   - **Anfrage**: Verknüpfung zu einer CRM-Anfrage (Dropdown zeigt offene Anfragen des gewählten Kunden). Wird auf der Detailseite als **„Verknüpfte Anfrage"** in den Kopfdaten angezeigt. Bei Fortführung und Duplizierung wird die Anfrage automatisch in den neuen Beleg übernommen.
   - **Belegdatum**: Standard = heute
   - **Auftragsdatum**: Datum der Beauftragung
   - **Liefertermin**: Gewünschtes Lieferdatum
   - **Lieferart / Lieferbedingungen**: Freitext
   - **Zahlungsziel**: Tage (wird aus Kundenadresse vorbelegt)
   - **Skonto %**: Skontosatz (wird aus Kundenadresse vorbelegt)
   - **Skonto Tage**: Skontofrist (wird aus Kundenadresse vorbelegt)
   - **Versandkosten netto**: Pauschalversandkosten
   - **Bemerkungen / Interne Notizen**: Freitext
6. **"Speichern"**
7. Beleg wird als **Entwurf** angelegt. Belegnummer wird automatisch vergeben.
8. Wenn eine **Standard-Dokumentvorlage** (⭐) für diesen Belegtyp existiert, wird deren Kopf-/Schlusstext automatisch übernommen. Platzhalter wie `{{briefanrede}}` werden mit den Daten der gewählten Kontaktperson aufgelöst (→ Abschnitt 13.8a).
9. ✅ Sie werden automatisch auf die **Detailseite** des neuen Belegs weitergeleitet.

Zahlungsbedingungen werden automatisch aus den Stammdaten der Kundenadresse übernommen, können aber im Beleg überschrieben werden.

> **Wichtig:** Das Erstellungsformular enthält nur die Kopfdaten (Typ, Kunde, Konditionen, Bemerkungen). Positionen werden im nächsten Schritt auf der Detailseite des Belegs hinzugefügt — siehe [13.4 Positionen verwalten](#134-positionen-verwalten).

### 13.4 Positionen verwalten

Positionen werden direkt auf der **Detailseite** eines Belegs im eingebetteten A4-Editor verwaltet (nur im Status **Entwurf**). Die Positionstabelle ist zwischen Einleitungstext und Summenblock eingebettet.

**Positionstypen:**

| Typ | Beschreibung |
|-----|-------------|
| **Artikel** | Position aus dem Artikelkatalog (mit Preis-Lookup) |
| **Freitext** | Freie Position mit Beschreibung und Preis |
| **Textzeile** | Nur Beschreibung, kein Preis (z.B. Hinweistext) |
| **Seitenumbruch** | Seitentrenner für den PDF-Druck |
| **Zwischensumme** | Zeigt die Summe aller vorangehenden Positionen |

#### Position hinzufügen

1. Detailseite des Belegs öffnen — die Positionstabelle ist direkt im A4-Editor sichtbar
2. Unterhalb der Positionstabelle: **Positionstyp** im Dropdown wählen (Standard: "Freitext")
3. Klick auf **"Position hinzufügen"**
4. Eine neue Zeile erscheint in der Tabelle — Felder direkt in der Zeile ausfüllen:
   - **Beschreibung**: Text der Position
   - **Menge**: Anzahl
   - **Einheit**: Stk, Std, kg, etc.
   - **Einzelpreis**: Preis pro Einheit netto
   - **Pauschalkosten**: Einmalige Zusatzkosten
   - **MwSt-Satz**: z.B. 19%, 7%
   - **Preistyp**: Standard / Richtpreis / Nach Aufwand
4. **Positionssumme** = Menge x Einzelpreis + Pauschalkosten
5. **Belegsumme** wird automatisch aktualisiert

#### Positionen sortieren

Positionen können per Drag-and-Drop oder mit Pfeiltasten umsortiert werden.

#### Position löschen

Löschsymbol am Zeilenende -- Position wird entfernt und Summen neu berechnet.

### 13.5 Beleg abschließen (Festschreiben)

1. **"Abschließen"** (Belegdetail, Aktionsleiste)
2. Warnung: "Nach dem Abschließen ist der Beleg unveränderbar."
3. Status wechselt von **Entwurf** zu **Abgeschlossen**
4. Beleg und alle Positionen sind nun schreibgeschützt
5. PDF wird automatisch generiert
6. Bei **Rechnungen** und **Gutschriften**: Wenn E-Rechnung aktiviert ist, wird automatisch ein EN 16931 konformes CII-XML generiert und in die PDF eingebettet (ZUGFeRD PDF/A-3). Siehe [13.14 E-Rechnung](#1314-e-rechnung-zugferd--xrechnung).
7. Erlaubte Aktionen nach dem Abschließen: **Fortführen**, **Stornieren**, **Duplizieren**, **PDF herunterladen**, **E-Rechnung XML herunterladen** (nur Rechnungen/Gutschriften)

> Berechtigung: `billing_documents.finalize` erforderlich

##### E-Rechnung Warnung im Abschließen-Dialog

Wenn E-Rechnung aktiviert ist und Pflichtfelder fehlen (z. B. strukturierte Firmenadresse, USt-IdNr.), erscheint eine gelbe Warnung im Dialog. Der Beleg wird trotzdem abgeschlossen und die PDF generiert -- nur das XML wird nicht erstellt. Die fehlenden Felder werden in der Warnung aufgelistet.

##### Sonderfall: Auftragsbestätigung abschließen → Auftrag erstellen

Beim Abschließen einer **Auftragsbestätigung** erscheint im Dialog ein zusätzlicher Bereich:

1. **Auftragsbezeichnung** (optional): Name des Terp-Auftrags (z.B. "Beratungsprojekt Mustermann")
2. **Beschreibung** (optional): Weitere Details (z.B. Sollstunden, Tätigkeiten)

Wenn eine Auftragsbezeichnung eingetragen wird:
- ✅ Ein neuer **Terp-Auftrag** wird automatisch erstellt
- ✅ Die Belegnummer (z.B. AB-1) wird als Auftragscode übernommen
- ✅ Der Kundenname wird aus der Adresse übernommen
- ✅ Der Beleg wird mit dem Auftrag verknüpft (`orderId`)
- ✅ Mitarbeiter können ab sofort **Zeit auf diesen Auftrag buchen**

Wird keine Auftragsbezeichnung eingetragen, wird der Beleg ohne Auftragserstellung abgeschlossen.

### 13.6 Beleg fortführen (Belegkette)

Das Fortführen erstellt einen neuen Beleg aus einem abgeschlossenen Beleg -- mit kopierten Positionen und einer Verknüpfung zum Quellbeleg.

1. **"Fortführen"** (nur bei Status Abgeschlossen)
2. Dialog zeigt erlaubte Zielbelegtypen
3. Zielbelegtyp auswählen
4. **"Fortführen"**
5. Neuer Beleg wird als **Entwurf** erstellt
6. Alle Positionen werden kopiert
7. Quellbeleg-Status wechselt zu **Fortgeführt**
8. Verknüpfung über `parentDocumentId` nachvollziehbar

Die Belegkette ist auf der Detailseite jedes Belegs in der Seitenleiste unter **"Belegkette"** sichtbar (Eltern- und Kind-Belege).

### 13.7 Beleg stornieren

1. **"Stornieren"** (Belegdetail, Aktionsleiste)
2. Optionaler Stornierungsgrund
3. Status wechselt zu **Storniert**
4. Nicht möglich bei Status **Fortgeführt** (alle Positionen wurden bereits übernommen)

### 13.8 Beleg duplizieren

1. **"Duplizieren"** (Belegdetail, Aktionsleiste)
2. Erstellt eine **Entwurf**-Kopie mit neuer Belegnummer
3. Alle Positionen werden kopiert
4. Kein `parentDocumentId` -- eigenständiger Beleg

### 13.8a Dokumentvorlagen (Briefkonfigurator)

**Was ist es?** Dokumentvorlagen definieren wiederverwendbare Kopf- und Schlusstexte für Belege. Beim Anwenden einer Vorlage auf einen Beleg werden Platzhalter automatisch durch die Daten der verknüpften Kontaktperson und Adresse ersetzt.

**Wozu dient es?** Statt bei jedem Angebot oder jeder Rechnung die Anrede und den Einleitungstext manuell zu tippen, erstellen Sie einmal eine Vorlage mit Platzhaltern. Beim Anwenden auf einen Beleg wird z.B. `{{briefanrede}}` automatisch durch „Sehr geehrter Herr Dr. Müller" ersetzt.

📍 Seitenleiste → **Aufträge** → **Vorlagen**

#### Vorlagenliste

Tabelle mit Spalten: **Name**, **Dokumenttyp** (Angebot, Rechnung etc. oder „Alle Typen"), **Standard** (⭐).

- Klick auf eine Zeile öffnet das Bearbeitungsformular.
- ⭐-Icon setzt die Vorlage als Standard für ihren Dokumenttyp.

#### Vorlage erstellen / bearbeiten

1. **"Neue Vorlage"** (oben rechts) oder Klick auf bestehende Vorlage
2. Formular mit Feldern:
   - **Name**: Bezeichnung (z.B. „Standard Angebot")
   - **Dokumenttyp**: Für welchen Belegtyp (oder „Alle Typen")
   - **Kopftext**: Einleitungstext (Rich-Text-Editor) — wird oberhalb der Positionstabelle angezeigt
   - **Schlusstext**: Abschlusstext (Rich-Text-Editor) — wird unterhalb des Summenblocks angezeigt
   - **Als Standard setzen**: Checkbox (nur wenn ein Dokumenttyp gewählt wurde)

#### Platzhalter

Im Kopf- und Schlusstext können folgende Platzhalter verwendet werden. Sie werden beim Anwenden der Vorlage auf einen Beleg automatisch durch die Daten der verknüpften Kontaktperson bzw. Adresse ersetzt.

| Platzhalter (DE) | Platzhalter (EN) | Wird ersetzt durch |
|-------------------|-------------------|-------------------|
| `{{briefanrede}}` | `{{letterSalutation}}` | Briefanrede (z.B. „Sehr geehrter Herr Dr. Müller") |
| `{{anrede}}` | `{{salutation}}` | Anrede (Herr / Frau) |
| `{{titel}}` | `{{title}}` | Titel (Dr. / Prof.) |
| `{{vorname}}` | `{{firstName}}` | Vorname der Kontaktperson |
| `{{nachname}}` | `{{lastName}}` | Nachname der Kontaktperson |
| `{{firma}}` | `{{company}}` | Firmenname der Adresse |

💡 **Hinweis:** Die Platzhalter funktionieren in beiden Sprachen. Hat der Beleg keine verknüpfte Kontaktperson oder fehlt die Briefanrede, wird `{{briefanrede}}` automatisch durch „Sehr geehrte Damen und Herren," ersetzt (bzw. `{{letterSalutation}}` durch „Dear Sir or Madam,"). Andere Kontakt-Platzhalter (Anrede, Titel, Vor-/Nachname) werden in diesem Fall leer ersetzt.

#### Automatische Anwendung beim Erstellen

Wenn eine Vorlage als **Standard** (⭐) für einen Belegtyp markiert ist, wird sie beim Erstellen eines neuen Belegs dieses Typs **automatisch angewendet**. Platzhalter werden dabei mit den Daten der gewählten Kontaktperson und Adresse aufgelöst.

Voraussetzung: Beim Beleg anlegen muss eine **Kontaktperson** ausgewählt werden (das Dropdown erscheint, sobald die Kundenadresse Kontaktpersonen hat). Ohne Kontaktperson wird `{{briefanrede}}` mit „Sehr geehrte Damen und Herren," ersetzt.

#### Manuelles Anwenden

1. Beleg öffnen (muss im Status **Entwurf** sein)
2. Dropdown **„Vorlage anwenden"** in der Aktionsleiste (rechts oben)
3. Vorlage auswählen
4. Kopf- und Schlusstext werden übernommen, Platzhalter automatisch aufgelöst
5. Falls bereits Text vorhanden: Bestätigungsdialog vor dem Überschreiben

##### Praxisbeispiel: Vorlage mit Briefanrede

1. 📍 Aufträge → Vorlagen → **„Neue Vorlage"**
2. Name: `Standard Angebot`, Dokumenttyp: **Angebot**, **„Als Standard für diesen Typ setzen"** ✅
3. Kopftext eingeben: `{{briefanrede}}, vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:`
4. Schlusstext eingeben: `Wir freuen uns auf Ihre Rückmeldung. Mit freundlichen Grüßen`
5. **„Speichern"**
6. 📍 Neuen Beleg anlegen: Typ **Angebot**, Kunde: Müller GmbH, **Kontaktperson: Herr Dr. Thomas Müller**
7. ✅ Beleg wird erstellt — Kopftext zeigt automatisch: „Sehr geehrter Herr Dr. Müller, vielen Dank für Ihre Anfrage. Gerne unterbreiten wir Ihnen folgendes Angebot:"
8. 💡 Alternativ: Vorlage manuell über Dropdown „Vorlage anwenden" wechseln

### Status-Workflow

| Status | Badge | Bedeutung | Erlaubte Aktionen |
|--------|-------|-----------|-------------------|
| **DRAFT** (Entwurf) | grau | In Bearbeitung | Bearbeiten, Positionen ändern, Abschließen, Löschen |
| **PRINTED** (Abgeschlossen) | blau | Festgeschrieben | Fortführen, Stornieren, Duplizieren |
| **PARTIALLY_FORWARDED** | gelb | Teilweise fortgeführt | Fortführen, Stornieren, Duplizieren |
| **FORWARDED** (Fortgeführt) | grün | Vollständig fortgeführt | Duplizieren |
| **CANCELLED** (Storniert) | rot | Storniert | Duplizieren |

### 13.9 Praxisbeispiel: Angebot bis Rechnung

**Szenario:** Sie erstellen ein Angebot für einen Kunden, der Kunde nimmt an, Sie liefern und stellen eine Rechnung.

> Der Workflow besteht immer aus zwei Schritten: Zuerst wird der Beleg mit den Kopfdaten angelegt, danach werden auf der Detailseite die Positionen hinzugefügt.

#### Schritt 1 — Angebot anlegen

1. 📍 Aufträge > Belege
2. Klick auf **"Neuer Beleg"** (oben rechts)
3. Formular "Neuer Beleg" öffnet sich
4. **Belegtyp**: "Angebot" auswählen (ist standardmäßig vorausgewählt)
5. **Kundenadresse**: Dropdown öffnen → "Mustermann GmbH" auswählen (Pflichtfeld)
6. Optional: Zahlungsziel, Skonto, Lieferart ausfüllen (werden aus Kundenstammdaten vorbelegt, sofern hinterlegt)
7. Klick auf **"Speichern"**
8. ✅ Sie werden automatisch auf die **Detailseite** des neuen Angebots (z.B. A-1) weitergeleitet. Der Status ist **Entwurf**.

#### Schritt 2 — Positionen hinzufügen

> Positionen können **nur auf der Detailseite** eines Belegs im Status **Entwurf** hinzugefügt werden — nicht im Erstellungsformular.

1. Sie befinden sich auf der Detailseite des Angebots A-1 — der A4-Editor zeigt das Dokument als Druckvorschau
2. Die Positionstabelle ist direkt im Dokument eingebettet (kein Tab-Wechsel nötig)
3. Unterhalb der (noch leeren) Positionstabelle: Dropdown **"Freitext"** ist vorausgewählt
4. Klick auf **"Position hinzufügen"**
5. Eine neue Zeile erscheint in der Tabelle — füllen Sie die Felder direkt in der Zeile aus:
   - **Beschreibung**: "Beratungsleistung"
   - **Menge**: 10
   - **Einheit**: "Std"
   - **Einzelpreis**: 120,00
   - **MwSt %**: 19
6. ✅ Die **Positionssumme** wird automatisch berechnet: 10 × 120,00 = **1.200,00 EUR**
7. Erneut **"Position hinzufügen"** klicken
8. Neue Zeile ausfüllen:
   - **Beschreibung**: "Fahrtkosten"
   - **Pauschalkosten**: 150,00
   - **MwSt %**: 19
9. ✅ Die **Belegsummen** am unteren Rand aktualisieren sich automatisch:
   - Netto: 1.350,00 EUR
   - MwSt 19%: 256,50 EUR
   - Brutto: **1.606,50 EUR**

#### Schritt 3 — Angebot abschließen (festschreiben)

1. Auf der Detailseite von A-1: Klick auf **"Abschließen"** (Aktionsleiste oben)
2. Bestätigungsdialog: "Nach dem Abschließen ist der Beleg unveränderbar." → Bestätigen
3. ✅ Status wechselt von **Entwurf** → **Abgeschlossen**
4. ✅ Die Felder und Positionen sind nun schreibgeschützt (grau hinterlegt)
5. ✅ Hinweis-Banner: "Dieser Beleg ist festgeschrieben und kann nicht mehr bearbeitet werden."

#### Schritt 4 — Angebot zur Auftragsbestätigung fortführen

Der Kunde hat das Angebot angenommen.

1. Auf der Detailseite von A-1 (Status: Abgeschlossen): Klick auf **"Fortführen"**
2. Dialog "Beleg fortführen" öffnet sich — zeigt den erlaubten Zielbelegtyp: **Auftragsbestätigung**
3. Klick auf **"Fortführen"**
4. ✅ Neues Dokument **AB-1** wird als **Entwurf** erstellt
5. ✅ Alle Positionen aus A-1 wurden automatisch nach AB-1 kopiert
6. ✅ A-1 Status wechselt zu **Fortgeführt**
7. Sie werden auf die Detailseite von AB-1 weitergeleitet
8. Optional: Positionen in AB-1 anpassen (ist noch im Entwurf und daher bearbeitbar)

#### Schritt 5 — Auftragsbestätigung abschließen und zum Lieferschein fortführen

1. Detailseite AB-1: Klick auf **"Abschließen"**
2. Dialog öffnet sich — bei einer Auftragsbestätigung erscheint der Bereich **"Auftrag für Zeiterfassung erstellen"**:
   - **Auftragsbezeichnung**: "Beratungsprojekt Mustermann GmbH" eintragen
   - **Beschreibung**: "Sollstunden: 10h Beratung, Fahrtkosten pauschal" (optional)
3. Klick auf **"Abschließen"**
4. ✅ AB-1 Status: **Abgeschlossen**
5. ✅ Ein Terp-Auftrag mit Code "AB-1" wurde automatisch erstellt — Mitarbeiter können ab sofort Zeit darauf buchen
3. Klick auf **"Fortführen"** → Zielbelegtyp: **Lieferschein** → **"Fortführen"**
4. ✅ Neues Dokument **LS-1** wird erstellt (Entwurf, Positionen kopiert)
5. ✅ AB-1 Status wechselt zu **Fortgeführt**

#### Schritt 6 — Lieferschein abschließen und zur Rechnung fortführen

1. Detailseite LS-1: Klick auf **"Abschließen"** → Bestätigen
2. ✅ LS-1 Status: **Abgeschlossen**
3. **Lagerbuchung** (je nach Einstellung unter 📍 Administration → Einstellungen → Lager):
   - **Manuell**: Keine automatische Lagerbuchung. Entnahmen manuell ueber das Entnahme-Terminal (Kapitel 18).
   - **Mit Bestaetigung**: Ein Dialog zeigt alle Artikelpositionen mit aktuellem und neuem Bestand. Positionen einzeln an-/abwaehlen, dann „Lagerbuchung durchfuehren" oder „Ueberspringen".
   - **Automatisch**: Lagerentnahmen werden sofort fuer alle Artikelpositionen mit Bestandsfuehrung erstellt. Toast-Meldung: „Lagerbuchung fuer X Artikel durchgefuehrt".
4. Klick auf **"Fortführen"** → Zielbelegtyp: **Rechnung** → **"Fortführen"**
5. ✅ Neues Dokument **RE-1** wird erstellt (Entwurf, alle Positionen kopiert)
6. ✅ LS-1 Status wechselt zu **Fortgeführt**

#### Schritt 7 — Rechnung abschließen

1. Detailseite RE-1: Prüfen Sie die kopierten Positionen und Summen
2. Klick auf **"Abschließen"** → Bestätigen
3. ✅ RE-1 Status: **Abgeschlossen** — Rechnung ist festgeschrieben

#### Ergebnis

Die Belegkette ist vollständig abgeschlossen:

**A-1** (Angebot) → **AB-1** (Auftragsbestätigung) → **LS-1** (Lieferschein) → **RE-1** (Rechnung)

Jeder Beleg verweist auf seinen Vorgänger. Die Kette ist auf der Detailseite jedes Belegs in der Seitenleiste unter **"Belegkette"** nachvollziehbar (Eltern- und Kind-Belege werden angezeigt).

💡 **Tipp:** Bei der Fortführung werden alle Positionen kopiert. Sie können im neuen Beleg (solange er im Entwurf ist) noch Positionen anpassen, hinzufügen oder entfernen, bevor Sie ihn abschließen.

---

### 13.10 Kundendienst (Serviceaufträge)

**Was ist es?** Der Kundendienst verwaltet Serviceaufträge -- Wartungs-, Reparatur- und Vor-Ort-Einsätze für Kunden. Jeder Serviceauftrag durchläuft einen Workflow von der Erstellung bis zur Rechnungsstellung.

**Wozu dient es?** Serviceaufträge erfassen, einem Mitarbeiter zuweisen, nach Abschluss eine Rechnung generieren und optional einen Terp-Auftrag für die Zeiterfassung erstellen.

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `billing_service_cases.view`, `billing_service_cases.create`, `billing_service_cases.edit`, `billing_service_cases.delete`

📍 Aufträge > Kundendienst

Sie sehen die Liste aller Serviceaufträge des aktiven Mandanten.

#### Serviceauftragsliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | Auto-generierte Nummer (z.B. KD-1, KD-42) |
| **Titel** | Bezeichnung des Serviceauftrags |
| **Kunde** | Firmenname der verknüpften Adresse |
| **Zuständig** | Zugewiesener Mitarbeiter |
| **Status** | Offen, In Bearbeitung, Abgeschlossen, Abgerechnet |
| **Gemeldet am** | Datum der Meldung |

**Filter:**
- **Status-Filter**: Dropdown mit Statuswerten
- **Suchfeld**: Suche nach Nummer, Titel, Beschreibung

#### Serviceauftrag anlegen

1. **"Neuer Serviceauftrag"** (Kundendienstliste, oben rechts)
2. Seitenformular öffnet sich
3. **Titel** eintragen (Pflicht)
4. **Kundenadresse** auswählen (Pflicht)
5. Optionale Felder:
   - **Kontaktperson**: Ansprechpartner aus der Adresse
   - **Beschreibung**: Detailbeschreibung des Auftrags
   - **Zuständiger Mitarbeiter**: Mitarbeiter zuweisen
   - **Auf Kosten hingewiesen**: Wurde der Kunde darüber informiert, dass der Einsatz kostenpflichtig ist? (z.B. bei außervertraglichen Reparaturen oder abgelaufener Garantie). Dient als interne Dokumentation für die spätere Rechnungsstellung.
6. **"Speichern"**
7. ✅ Serviceauftrag wird mit Status **Offen** angelegt. Nummer wird automatisch vergeben (z.B. KD-1).

#### Serviceauftrag bearbeiten

Bearbeitung ist nur im Status **Offen** oder **In Bearbeitung** möglich.

1. Serviceauftrag in der Liste anklicken
2. Detailseite öffnet sich
3. **"Bearbeiten"** klicken
4. Felder anpassen (Titel, Beschreibung, Kontaktperson, Zuständigkeit, etc.)
5. **"Speichern"**
6. ✅ Status wechselt automatisch von **Offen** zu **In Bearbeitung** bei der ersten Bearbeitung

#### Serviceauftrag abschließen

1. Detailseite des Serviceauftrags: **"Abschließen"** klicken
2. Dialog öffnet sich: **Abschlussgrund** eingeben (Pflicht)
3. **"Abschließen"** bestätigen
4. ✅ Status wechselt zu **Abgeschlossen**
5. ✅ Nach dem Abschließen ist der Serviceauftrag nicht mehr bearbeitbar

#### Rechnung erstellen

Nach dem Abschließen kann aus dem Serviceauftrag eine Rechnung generiert werden:

1. Detailseite (Status: Abgeschlossen): **"Rechnung erstellen"** klicken
2. Dialog öffnet sich mit Positionsliste
3. Positionen hinzufügen:
   - **Beschreibung**: Text der Position
   - **Menge**: Anzahl
   - **Einheit**: Stk, Std, etc.
   - **Einzelpreis**: Preis netto
   - **MwSt %**: z.B. 19%
4. **"Rechnung erstellen"** klicken
5. ✅ Ein Beleg vom Typ **Rechnung** (RE-) wird automatisch erstellt
6. ✅ Die Rechnung ist mit dem Serviceauftrag verknüpft
7. ✅ Status wechselt zu **Abgerechnet**

💡 **Tipp:** Die erstellte Rechnung wird als Beleg im Belegmodul (Aufträge > Belege) angezeigt und kann dort abgeschlossen und weiterverarbeitet werden.

#### Auftrag für Zeiterfassung erstellen

Optional kann aus einem offenen Serviceauftrag ein Terp-Auftrag erstellt werden:

1. Detailseite (Status: Offen oder In Bearbeitung): **"Auftrag erstellen"** klicken
2. Dialog: Bestätigen
3. ✅ Ein Terp-Auftrag wird erstellt -- Mitarbeiter können Zeit darauf buchen
4. ✅ Der Auftrag ist auf der Detailseite als "Verknüpfter Auftrag" sichtbar

#### Status-Workflow

| Status | Badge | Bedeutung | Erlaubte Aktionen |
|--------|-------|-----------|-------------------|
| **OPEN** (Offen) | grau | Neu angelegt | Bearbeiten, Auftrag erstellen, Abschließen, Löschen |
| **IN_PROGRESS** (In Bearbeitung) | blau | In Arbeit | Bearbeiten, Auftrag erstellen, Abschließen, Löschen |
| **CLOSED** (Abgeschlossen) | grün | Erledigt | Rechnung erstellen |
| **INVOICED** (Abgerechnet) | lila | Rechnung erstellt | (keine) |

#### CRM-Integration

- **Adressdetailseite**: Tab **"Kundendienst"** zeigt alle Serviceaufträge dieser Adresse
- **Anfragen**: Serviceaufträge können mit CRM-Anfragen verknüpft werden

#### 13.10.1 Praxisbeispiel: Heizungsreparatur bis Rechnung

**Szenario:** Ein Kunde meldet eine defekte Heizung. Sie erstellen einen Serviceauftrag, weisen einen Techniker zu, schließen nach der Reparatur ab und erstellen eine Rechnung.

##### Schritt 1 -- Serviceauftrag anlegen

1. 📍 Aufträge > Kundendienst
2. Klick auf **"Neuer Serviceauftrag"** (oben rechts)
3. Seitenformular öffnet sich
4. **Titel**: "Heizungsreparatur" eintragen
5. **Kundenadresse**: Dropdown öffnen → "Mustermann GmbH" auswählen
6. **Beschreibung**: "Heizung im EG fällt regelmäßig aus. Vor-Ort-Termin erforderlich."
7. **Auf Kosten hingewiesen**: Checkbox aktivieren (der Kunde wurde informiert, dass die Reparatur kostenpflichtig ist)
8. Klick auf **"Speichern"**
9. ✅ Serviceauftrag **KD-1** wird als **Offen** angelegt und erscheint in der Liste

##### Schritt 2 -- Mitarbeiter zuweisen und Auftrag erstellen

1. In der Kundendienstliste: Klick auf **KD-1**
2. Detailseite öffnet sich
3. Klick auf **"Bearbeiten"**
4. **Zuständiger Mitarbeiter**: "Max Müller" auswählen
5. **"Speichern"**
6. ✅ Status wechselt automatisch zu **In Bearbeitung**
7. Klick auf **"Auftrag erstellen"**
8. Bestätigen
9. ✅ Ein Terp-Auftrag wird erstellt -- Max Müller kann ab sofort Zeit darauf buchen
10. ✅ "Verknüpfter Auftrag" wird auf der Detailseite angezeigt

##### Schritt 3 -- Serviceauftrag abschließen

Die Reparatur wurde durchgeführt.

1. Detailseite KD-1: Klick auf **"Abschließen"**
2. Dialog: **Abschlussgrund**: "Thermostat getauscht, Heizung funktioniert wieder."
3. Klick auf **"Abschließen"**
4. ✅ Status wechselt zu **Abgeschlossen**
5. ✅ Hinweis-Banner: "Dieser Serviceauftrag ist abgeschlossen."
6. ✅ Die Schaltfläche **"Rechnung erstellen"** erscheint

##### Schritt 4 -- Rechnung erstellen

1. Klick auf **"Rechnung erstellen"**
2. Dialog "Rechnung erstellen" öffnet sich
3. Klick auf **"Position hinzufügen"** und ausfüllen:

| Beschreibung | Menge | Einheit | Einzelpreis | MwSt % |
|-------------|-------|---------|-------------|--------|
| Arbeitszeit Techniker | 2 | Std | 85,00 | 19 |
| Thermostat (Ersatzteil) | 1 | Stk | 45,00 | 19 |
| Anfahrtspauschale | -- | -- | -- | 19 |

   Für die Anfahrtspauschale: **Pauschalkosten**: 35,00

4. Klick auf **"Rechnung erstellen"**
5. ✅ Beleg **RE-1** wird als Entwurf erstellt
6. ✅ KD-1 Status wechselt zu **Abgerechnet**
7. ✅ Verknüpfte Rechnung RE-1 wird auf der Detailseite angezeigt

##### Schritt 5 -- Rechnung abschließen

1. 📍 Aufträge > Belege → RE-1 anklicken
2. Positionen prüfen (alle drei wurden übernommen)
3. Klick auf **"Abschließen"** → Bestätigen
4. ✅ RE-1 ist festgeschrieben -- Rechnung kann an den Kunden versendet werden

##### Ergebnis

Der vollständige Workflow ist abgeschlossen:

**KD-1** (Serviceauftrag) → **Auftrag** (Zeiterfassung) → **RE-1** (Rechnung)

Alle Verknüpfungen sind auf der Detailseite von KD-1 nachvollziehbar: Kundenadresse, zuständiger Mitarbeiter, verknüpfter Auftrag, und die erstellte Rechnung.

💡 **Tipp:** Die Rechnung RE-1 kann auch in die reguläre Belegkette eingebunden werden -- z.B. wenn Sie vorab ein Angebot erstellt haben, können Sie das Angebot und die Serviceauftrag-Rechnung unabhängig verwalten.

---

### 13.11 Offene Posten / Zahlungen

**Was ist es?** Die Offene-Posten-Verwaltung zeigt alle unbezahlten oder teilbezahlten Rechnungen an. Sobald eine Rechnung abgeschlossen (festgeschrieben) wird, erscheint sie automatisch als offener Posten. Zahlungen werden gegen Rechnungen erfasst -- bar oder per Überweisung. Skonto-Abzüge (zwei Stufen) und Teilzahlungen werden unterstützt.

**Wozu dient es?** Offene Forderungen im Blick behalten, Zahlungseingänge dokumentieren, überfällige Rechnungen erkennen und Skonto-Fristen nutzen.

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `billing_payments.view` (Anzeige), `billing_payments.create` (Zahlung erfassen), `billing_payments.cancel` (Zahlung stornieren)

📍 Aufträge > Offene Posten

Sie sehen die Liste aller offenen Posten des aktiven Mandanten mit Zusammenfassung (Gesamtbetrag offen, überfällig, Anzahl pro Status).

#### Offene-Posten-Liste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Rechnungsnr.** | Belegnummer der Rechnung (z.B. RE-1) |
| **Kunde** | Firmenname der verknüpften Adresse |
| **Rechnungsdatum** | Datum des Belegs |
| **Fällig am** | Rechnungsdatum + Zahlungsziel (Tage) |
| **Brutto** | Gesamtbetrag der Rechnung (brutto) |
| **Bezahlt** | Summe aller aktiven Zahlungen |
| **Offen** | Restbetrag (Brutto - Bezahlt) |
| **Status** | Offen, Teilzahlung, Bezahlt, Überfällig |

**Filter:**
- **Status-Filter**: Dropdown (Alle, Offen, Teilzahlung, Bezahlt, Überfällig)
- **Suchfeld**: Suche nach Rechnungsnummer oder Kundenname
- **Datumsbereich**: Von / Bis (Rechnungsdatum)

**Zusammenfassung:** Im oberen Bereich werden KPI-Karten angezeigt:
- **Gesamt offen**: Summe aller offenen Beträge
- **Überfällig**: Summe der offenen Beträge mit überschrittenem Fälligkeitsdatum
- **Anzahl**: Offen / Teilzahlung / Bezahlt

#### Offene-Posten-Detail

📍 Zeile in der Offene-Posten-Liste anklicken

Die Detailseite zeigt die Rechnungszusammenfassung und die Zahlungshistorie.

**Rechnungszusammenfassung:**

| Feld | Beschreibung |
|------|-------------|
| **Rechnungsnr.** | Belegnummer |
| **Kunde** | Firma und Adresse |
| **Rechnungsdatum** | Datum des Belegs |
| **Fällig am** | Berechnetes Fälligkeitsdatum |
| **Brutto** | Gesamtbetrag |
| **Bezahlt** | Summe aktiver Zahlungen |
| **Offen** | Restbetrag |
| **Status** | Zahlungsstatus-Badge |
| **Skonto 1** | X% innerhalb von Y Tagen (falls konfiguriert) |
| **Skonto 2** | X% innerhalb von Y Tagen (falls konfiguriert) |

**Zahlungshistorie (Tabelle):**

| Spalte | Beschreibung |
|--------|-------------|
| **Datum** | Zahlungsdatum |
| **Betrag** | Zahlungsbetrag |
| **Art** | Bar / Überweisung |
| **Skonto** | Ja / -- |
| **Status** | Aktiv / Storniert |
| **Notizen** | Optionale Anmerkungen |
| **Aktionen** | Stornieren-Button (nur bei aktiven Zahlungen) |

#### Zahlung erfassen

1. 📍 Offene-Posten-Detail → **"Zahlung erfassen"** (oben rechts)
2. Dialog öffnet sich: "Zahlung erfassen"
3. **Datum** auswählen (Standard: heute)
4. **Betrag** eingeben (vorausgefüllt mit dem offenen Restbetrag)
5. **Zahlungsart** wählen: Bar oder Überweisung
6. Optional: **Skonto** aktivieren (Checkbox, nur sichtbar wenn Skonto-Fristen konfiguriert sind und die Frist noch nicht abgelaufen ist)
   - Bei aktiviertem Skonto wird der Abzug automatisch berechnet und als separate Zahlung verbucht
7. Optional: **Notizen** eintragen
8. 📍 **"Zahlung erfassen"**
9. Zahlung erscheint in der Zahlungshistorie
10. Status der Rechnung aktualisiert sich (Offen → Teilzahlung → Bezahlt)

**Teilzahlungen:** Der Betrag kann geringer als der offene Restbetrag sein. Die Rechnung wechselt dann in den Status "Teilzahlung".

#### Skonto (Rabatt bei schneller Zahlung)

Rechnungen können zwei Skonto-Stufen haben (konfiguriert über die Zahlungsbedingungen des Belegs):

| Stufe | Regel | Beispiel |
|-------|-------|---------|
| **Skonto 1** | X% Abzug bei Zahlung innerhalb von Y Tagen | 3% bei Zahlung innerhalb von 10 Tagen |
| **Skonto 2** | X% Abzug bei Zahlung innerhalb von Y Tagen | 2% bei Zahlung innerhalb von 20 Tagen |
| **Netto** | Voller Betrag nach Ablauf beider Fristen | Zahlung nach 20 Tagen = voller Betrag |

Beim Erfassen einer Zahlung mit aktiviertem Skonto:
1. Das System prüft, welche Skonto-Stufe zum Zahlungsdatum gilt
2. Der Skonto-Betrag wird automatisch berechnet
3. Zwei Einträge werden in der Zahlungshistorie erstellt: die eigentliche Zahlung und der Skonto-Abzug (markiert als "Skonto")

#### Zahlung stornieren

1. 📍 Offene-Posten-Detail → Zahlungshistorie → **"Stornieren"** (bei der gewünschten Zahlung)
2. Bestätigungsdialog: "Möchten Sie diese Zahlung wirklich stornieren?"
3. Optional: **Grund** eintragen
4. 📍 **"Bestätigen"**
5. Zahlung wird als "Storniert" markiert
6. Der stornierte Betrag wird dem offenen Posten wieder zugerechnet
7. Status der Rechnung aktualisiert sich entsprechend

#### Zahlungsstatus

| Status | Badge | Bedeutung |
|--------|-------|-----------|
| **Offen** | Grau | Keine Zahlung erfasst |
| **Teilzahlung** | Gelb | Teilbetrag bezahlt, Rest offen |
| **Bezahlt** | Grün | Vollständig bezahlt |
| **Überzahlt** | Blau | Mehr als der Rechnungsbetrag bezahlt |
| **Überfällig** | Rot | Fälligkeitsdatum überschritten und nicht vollständig bezahlt |

#### Gutschriften

Wird eine Gutschrift (Typ: Gutschrift) mit Bezug auf eine Rechnung erstellt (über "Fortführen" → Gutschrift), reduziert sich der effektive Rechnungsbetrag automatisch. Der offene Posten zeigt den reduzierten Betrag an.

#### 13.11.1 Praxisbeispiel: Rechnung mit Teilzahlung und Skonto

**Szenario:** Sie haben eine Rechnung über 1.190,00 EUR (brutto) erstellt. Der Kunde zahlt zunächst einen Teilbetrag per Überweisung, dann den Rest bar mit Skonto-Abzug.

##### Voraussetzung

Eine abgeschlossene (festgeschriebene) Rechnung RE-1 über 1.190,00 EUR mit folgenden Zahlungsbedingungen:
- Zahlungsziel: 30 Tage
- Skonto 1: 3% bei Zahlung innerhalb von 10 Tagen
- Skonto 2: 2% bei Zahlung innerhalb von 20 Tagen

##### Schritt 1 -- Offene Posten aufrufen

1. 📍 Aufträge > Offene Posten
2. RE-1 erscheint in der Liste mit Status **Offen**
3. Spalte "Offen" zeigt **1.190,00 EUR**
4. Spalte "Fällig am" zeigt das berechnete Fälligkeitsdatum (Rechnungsdatum + 30 Tage)

##### Schritt 2 -- Teilzahlung per Überweisung

1. Klick auf die Zeile **RE-1**
2. Detailseite öffnet sich
3. Klick auf **"Zahlung erfassen"**
4. **Datum**: heutiges Datum
5. **Betrag**: "500" eintragen (statt des vorausgefüllten Gesamtbetrags)
6. **Zahlungsart**: "Überweisung" auswählen
7. **Notizen**: "Anzahlung"
8. Klick auf **"Zahlung erfassen"**
9. Zahlung erscheint in der Zahlungshistorie
10. Status wechselt zu **Teilzahlung**
11. Bezahlt: 500,00 EUR | Offen: 690,00 EUR

##### Schritt 3 -- Restzahlung bar mit Skonto

1. Klick auf **"Zahlung erfassen"**
2. Betrag ist vorausgefüllt mit **690,00 EUR** (Restbetrag)
3. **Zahlungsart**: "Bar" auswählen
4. **Skonto** aktivieren (Checkbox)
5. System zeigt: "Skonto 1 (3%): Abzug 20,70 EUR" (oder Stufe 2, je nach Datum)
6. Zahlungsbetrag wird automatisch angepasst: 669,30 EUR
7. Klick auf **"Zahlung erfassen"**
8. Zwei Einträge in der Zahlungshistorie: Zahlung (669,30 EUR) und Skonto (20,70 EUR)
9. Status wechselt zu **Bezahlt**

##### Schritt 4 -- Zahlung stornieren

1. In der Zahlungshistorie: Klick auf **"Stornieren"** bei der letzten Barzahlung
2. Bestätigungsdialog → **"Bestätigen"**
3. Zahlung wird als "Storniert" markiert
4. Auch der zugehörige Skonto-Eintrag wird storniert
5. Status wechselt zurück zu **Teilzahlung**
6. Offen: 690,00 EUR

##### Ergebnis

Die Zahlungshistorie dokumentiert alle Vorgänge lückenlos:
- Teilzahlung per Überweisung (500,00 EUR -- aktiv)
- Barzahlung mit Skonto (669,30 EUR -- storniert)
- Skonto-Abzug (20,70 EUR -- storniert)

📍 Aufträge > Offene Posten zeigt RE-1 weiterhin als "Teilzahlung" an, bis der Restbetrag beglichen ist.

---

### 13.12 Preislisten

**Was ist es?** Preislisten definieren Preise für Artikel und Freitextpositionen, die Kunden zugewiesen werden können. Das System unterstützt eine Standardpreisliste, kundenspezifische Preislisten und Mengenstaffeln. Beim Anlegen von Belegpositionen wird der Preis automatisch aus der zugewiesenen Preisliste des Kunden vorgeschlagen.

**Wozu dient es?** Einheitliche Preispflege, kundenindividuelle Konditionen und automatische Preisübernahme in Belege -- ohne manuelle Preissuche.

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `billing_price_lists.view` (Anzeige), `billing_price_lists.manage` (Anlegen, Bearbeiten, Löschen)

📍 Aufträge > Preislisten

Sie sehen die Liste aller Preislisten des aktiven Mandanten.

#### Preislistenliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Name** | Name der Preisliste (z.B. "Standardpreisliste", "Großkunde") |
| **Beschreibung** | Optionale Beschreibung |
| **Standard** | Stern-Symbol: ausgefüllt = Standardpreisliste des Mandanten |
| **Gültig von** | Beginn des Gültigkeitszeitraums |
| **Gültig bis** | Ende des Gültigkeitszeitraums |
| **Aktiv** | Aktiv/Inaktiv-Badge |
| **Einträge** | Anzahl der Preiseinträge |

**Suchfeld:** Suche nach Name oder Beschreibung

#### Preisliste anlegen

1. **"Neue Preisliste"** (Preislistenliste, oben rechts)
2. Seitenformular öffnet sich
3. **Name** eintragen (Pflicht)
4. Optionale Felder:
   - **Beschreibung**: Freitext
   - **Standardpreisliste**: Checkbox -- wenn aktiviert, wird diese Preisliste als Fallback für alle Kunden ohne eigene Preisliste verwendet. Pro Mandant kann nur eine Standardpreisliste existieren.
   - **Gültig von / Gültig bis**: Gültigkeitszeitraum der Preisliste
5. **"Speichern"**
6. Preisliste wird erstellt und erscheint in der Liste

#### Standardpreisliste festlegen

Es kann pro Mandant nur **eine** Standardpreisliste geben. Wenn eine neue Preisliste als Standard gesetzt wird, verliert die bisherige Standardpreisliste diesen Status automatisch.

1. Preisliste in der Liste anklicken → Detailseite
2. **"Als Standard setzen"** klicken
3. Diese Preisliste wird zur Standardpreisliste (Stern-Symbol wird ausgefüllt)
4. Die vorherige Standardpreisliste verliert den Standard-Status

**Funktionsweise der Standardpreisliste:**
- Wenn ein Kunde **keine eigene Preisliste** zugewiesen hat, werden Preise aus der Standardpreisliste verwendet
- Wenn ein Kunde eine eigene Preisliste hat, aber dort kein Eintrag für einen bestimmten Artikel existiert, wird ebenfalls die Standardpreisliste als Fallback herangezogen

#### Preiseinträge verwalten

Auf der **Detailseite** einer Preisliste werden die Preiseinträge in einer Tabelle angezeigt:

| Spalte | Beschreibung |
|--------|-------------|
| **Artikel / Schlüssel** | Verknüpfter Artikel oder Freitext-Schlüssel (z.B. "beratung_std") |
| **Beschreibung** | Beschreibungstext (überschreibt Artikelbeschreibung) |
| **Einzelpreis** | Nettopreis pro Einheit in EUR |
| **Ab Menge** | Mengenstaffel: Preis gilt ab dieser Menge (leer = Standardpreis) |
| **Einheit** | Mengeneinheit (Stk, Std, kg, etc.) |
| **Gültig von / bis** | Gültigkeitszeitraum des Eintrags |

##### Eintrag hinzufügen

1. Detailseite der Preisliste: **"Neuer Eintrag"** klicken
2. Dialog öffnet sich
3. Wahlweise:
   - **Artikel** auswählen (Artikelsuche) -- verknüpft den Preis mit einem konkreten Artikel
   - **Schlüssel** eingeben -- für freie Positionen ohne Artikelstamm (z.B. "stundensatz_senior")
4. **Einzelpreis** eintragen (Pflicht, netto in EUR)
5. Optionale Felder:
   - **Beschreibung**: Überschreibt die Artikelbeschreibung
   - **Ab Menge**: Preis gilt erst ab dieser Menge (für Mengenstaffeln)
   - **Einheit**: z.B. Stk, Std, kg
   - **Gültig von / bis**: Zeitraum, in dem dieser Preis gilt
6. **"Speichern"**
7. Eintrag erscheint in der Tabelle

##### Mengenstaffel

Durch mehrere Einträge für denselben Artikel mit unterschiedlichen **Ab Menge**-Werten können Mengenstaffeln abgebildet werden:

| Artikel | Einzelpreis | Ab Menge |
|---------|------------|----------|
| Schraube M8 | 0,50 EUR | -- (Standardpreis) |
| Schraube M8 | 0,40 EUR | 100 |
| Schraube M8 | 0,30 EUR | 500 |

Bei einer Bestellung von 200 Stück wird automatisch 0,40 EUR/Stück vorgeschlagen.

##### Eintrag löschen

Löschsymbol am Zeilenende -- Eintrag wird entfernt.

#### Massenimport

Für die schnelle Erfassung vieler Preiseinträge steht ein Massenimport zur Verfügung:

1. Detailseite der Preisliste: **"Massenimport"** klicken
2. Dialog öffnet sich mit einem Textfeld
3. Einträge im Format einfügen (tabulatorgetrennt oder semikolongetrennt):
   ```
   Schlüssel;Beschreibung;Einzelpreis;Ab Menge;Einheit
   beratung_std;Beratung Standard;120;;Std
   beratung_senior;Beratung Senior;150;;Std
   montage;Montagearbeiten;85;;Std
   ```
4. Klick auf **"Importieren"**
5. Vorhandene Einträge (gleicher Artikel/Schlüssel) werden aktualisiert, neue werden erstellt
6. Erfolgsmeldung: "X Einträge importiert, Y aktualisiert"

#### Preisliste einem Kunden zuweisen

Die Zuweisung erfolgt in den **Stammdaten der CRM-Adresse**:

1. 📍 CRM > Adressen → Kunde anklicken
2. **"Bearbeiten"** klicken
3. Feld **"Preisliste"**: Dropdown mit allen aktiven Preislisten des Mandanten
4. Preisliste auswählen
5. **"Speichern"**
6. Ab sofort werden bei Belegpositionen für diesen Kunden die Preise aus der zugewiesenen Preisliste vorgeschlagen

#### Preisermittlung (Automatische Preisübernahme)

Beim Hinzufügen einer Position zu einem Beleg ermittelt das System den Preis in folgender Reihenfolge:

1. **Kundenspezifische Preisliste** → Kunde hat eine zugewiesene Preisliste? → Eintrag für den Artikel/Schlüssel vorhanden? → Mengenstaffel berücksichtigen → **Preis übernehmen**
2. **Standardpreisliste** → Kein Treffer beim Kunden? → In der Standardpreisliste nachschlagen → **Preis übernehmen**
3. **Kein Treffer** → Der Benutzer gibt den Preis manuell ein

Der vorgeschlagene Preis kann im Beleg jederzeit manuell überschrieben werden.

#### Preisliste löschen

1. Detailseite der Preisliste: **"Löschen"** klicken
2. **Schutz:** Wenn die Preisliste einem oder mehreren Kunden zugewiesen ist, wird das Löschen verweigert mit der Meldung: "Preisliste ist X Kunden zugewiesen und kann nicht gelöscht werden."
3. Preisliste erst von allen Kunden entfernen, dann erneut löschen.

#### 13.12.1 Praxisbeispiel: Preisliste erstellen und Kunden zuweisen

**Szenario:** Sie erstellen eine Standardpreisliste mit Beratungspreisen, weisen sie einem Kunden zu und überprüfen, dass der Preis beim Beleg-Erstellen automatisch vorgeschlagen wird.

##### Schritt 1 -- Preisliste anlegen

1. 📍 Aufträge > Preislisten
2. Klick auf **"Neue Preisliste"** (oben rechts)
3. Seitenformular öffnet sich
4. **Name**: "Standardpreisliste" eintragen
5. **Beschreibung**: "Preisliste für Standardkunden"
6. **Standardpreisliste**: Checkbox aktivieren
7. Klick auf **"Speichern"**
8. Preisliste "Standardpreisliste" erscheint in der Liste mit ausgefülltem Stern-Symbol (= Standard)

##### Schritt 2 -- Preiseinträge hinzufügen

1. In der Preislistenliste: Klick auf **"Standardpreisliste"**
2. Detailseite öffnet sich
3. Klick auf **"Neuer Eintrag"**
4. Dialog öffnet sich:
   - **Schlüssel**: "beratung_std"
   - **Beschreibung**: "Beratung pro Stunde"
   - **Einzelpreis**: 120,00
   - **Einheit**: "Std"
5. Klick auf **"Speichern"**
6. Eintrag erscheint in der Tabelle: "Beratung pro Stunde | 120,00 EUR | Std"
7. Erneut **"Neuer Eintrag"** klicken:
   - **Schlüssel**: "fahrtkosten"
   - **Beschreibung**: "Anfahrtspauschale"
   - **Einzelpreis**: 35,00
8. Klick auf **"Speichern"**
9. Zweiter Eintrag erscheint in der Tabelle

##### Schritt 3 -- Preisliste dem Kunden zuweisen

1. 📍 CRM > Adressen
2. Klick auf **"Mustermann GmbH"** (oder den gewünschten Kunden)
3. Detailseite öffnet sich
4. Klick auf **"Bearbeiten"**
5. Feld **"Preisliste"**: Dropdown öffnen → **"Standardpreisliste"** auswählen
6. Klick auf **"Speichern"**
7. "Preisliste: Standardpreisliste" wird auf der Detailseite angezeigt

##### Schritt 4 -- Preis wird im Beleg vorausgefüllt

1. 📍 Aufträge > Belege
2. Klick auf **"Neuer Beleg"**
3. **Belegtyp**: "Angebot"
4. **Kundenadresse**: "Mustermann GmbH" auswählen
5. Klick auf **"Speichern"** → Detailseite des neuen Angebots
6. Im A4-Editor: Positionstyp "Freitext" → **"Position hinzufügen"**
7. Bei der Erfassung eines Artikels oder Schlüssels, der in der Preisliste vorhanden ist, wird der **Einzelpreis automatisch mit 120,00 EUR vorausgefüllt**
8. Der Preis kann manuell überschrieben werden

##### Ergebnis

Die Preisliste ist vollständig eingerichtet:

- **Standardpreisliste** mit zwei Einträgen (Beratung 120 EUR/Std, Anfahrt 35 EUR)
- **Mustermann GmbH** hat die Standardpreisliste zugewiesen
- Bei neuen Belegen für diesen Kunden werden Preise automatisch vorgeschlagen

**Tipp:** Für Großkunden können Sie eine separate Preisliste mit reduzierten Preisen anlegen und diese dem Kunden zuweisen. Die kundenspezifische Preisliste hat immer Vorrang vor der Standardpreisliste.

---

### 13.13 Wiederkehrende Rechnungen

**Was ist es?** Vorlagen fuer Rechnungen, die in regelmaessigen Abstaenden automatisch oder manuell erzeugt werden -- z. B. fuer Wartungsvertraege, Mietvertraege oder monatliche Dienstleistungspauschalen.

**Wozu dient es?** Statt jeden Monat (oder jedes Quartal, Halbjahr, Jahr) dieselbe Rechnung manuell anzulegen, definieren Sie einmal eine Vorlage mit Positionen und Intervall. Terp erzeugt daraus zur richtigen Zeit eine echte Rechnung (Beleg vom Typ *Rechnung*).

> Modul: **Billing** muss aktiviert sein

> Berechtigung: `billing_recurring.view` (Anzeigen), `billing_recurring.manage` (Verwalten), `billing_recurring.generate` (Rechnungen generieren)

📍 Auftraege > Wiederkehrende Rechnungen

Sie sehen die Liste aller wiederkehrenden Rechnungsvorlagen des aktiven Mandanten.

#### Vorlagenliste

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Name** | Bezeichnung der Vorlage (z. B. Vertragsreferenz) |
| **Kunde** | Firmenname der zugeordneten Kundenadresse |
| **Intervall** | Monatlich, Quartal, Halbjaehrlich oder Jaehrlich |
| **Naechste Faelligkeit** | Datum, an dem die naechste Rechnung generiert wird |
| **Letzte Generierung** | Datum der letzten erzeugten Rechnung (oder "-" wenn noch nie generiert) |
| **Aktiv** | Aktiv/Inaktiv-Badge |

**Filter:**
- **Suchfeld**: Suche nach Name oder Notizen
- **Status-Filter**: Dropdown -- Alle / Aktiv / Inaktiv

**Aktionsschaltflaechen (oben rechts):**
- **"Alle faelligen generieren"**: Erzeugt sofort Rechnungen fuer alle aktiven Vorlagen, deren Faelligkeitsdatum erreicht oder ueberschritten ist. Ergebnis wird als Toast angezeigt (z. B. "3 Rechnung(en) generiert, 0 fehlgeschlagen").
- **"Neue Vorlage"**: Leitet zur Formularseite weiter

#### Vorlage erstellen

1. **"Neue Vorlage"** (Vorlagenliste, oben rechts)
2. Formularseite oeffnet sich mit Bereich **Kopfdaten**, **Konditionen**, **Positionen** und **Notizen**

**Kopfdaten (Pflichtfelder):**

| Feld | Beschreibung |
|------|-------------|
| **Name** | Aussagekraeftiger Vorlagenname (Pflicht). Z. B. "Wartungsvertrag CNC-Maschinen (monatlich)". |
| **Kundenadresse** | Adresse aus dem CRM auswaehlen (Pflicht). Dropdown zeigt Firmenname und Kundennummer. |
| **Intervall** | Generierungsrhythmus (Pflicht). Voreinstellung: **Monatlich**. Optionen: Monatlich / Quartal (3 Monate) / Halbjaehrlich (6 Monate) / Jaehrlich (12 Monate). |
| **Startdatum** | Datum der ersten Rechnung (Pflicht). Wird gleichzeitig als **Naechste Faelligkeit** gesetzt. |

**Kopfdaten (Optionale Felder):**

| Feld | Beschreibung | Wenn leer |
|------|-------------|-----------|
| **Kontaktperson** | Ansprechpartner aus der Adresse | Kein Kontakt auf der Rechnung |
| **Enddatum** | Vertragsenddatum | Vorlage laeuft unbefristet weiter |
| **Automatisch generieren** | Checkbox. Voreinstellung: **deaktiviert** | Rechnungen muessen manuell generiert werden. Der taegliche Cron-Job ignoriert diese Vorlage. |

**Konditionen (alle optional):**

Die Konditionen werden 1:1 in jede generierte Rechnung uebernommen. Felder, die leer gelassen werden, bleiben auch in der erzeugten Rechnung leer -- es werden **keine Standardwerte** aus den Kundenstammdaten uebernommen (anders als beim manuellen Beleg-Erstellen).

| Feld | Beschreibung | Wenn leer |
|------|-------------|-----------|
| **Zahlungsziel (Tage)** | Anzahl Tage bis zur Faelligkeit der Rechnung | Kein Zahlungsziel auf der Rechnung |
| **Skonto %** | Skontosatz bei fruehzeitiger Zahlung | Kein Skonto auf der Rechnung |
| **Skonto Tage** | Frist fuer den Skontoabzug | Kein Skonto auf der Rechnung |
| **Lieferart** | Art der Lieferung (z. B. "Spedition") | Leer auf der Rechnung |
| **Lieferbedingungen** | Bedingungen (z. B. "frei Haus") | Leer auf der Rechnung |

> **Wichtig:** Da wiederkehrende Rechnungen keine Kundenstammdaten-Übernahme haben, muessen Sie Zahlungsziel und Skonto hier explizit eintragen, wenn diese auf der Rechnung erscheinen sollen.

**Positionen (mindestens eine Position erforderlich):**

Neue Vorlagen beginnen mit einer leeren Standardposition. Weitere Positionen koennen ueber **"Position hinzufuegen"** ergaenzt werden.

| Feld | Beschreibung | Voreinstellung |
|------|-------------|----------------|
| **Typ** | Positionstyp: **Freitext** (frei beschreibbare Position), **Artikel** (aus Artikelkatalog), **Text** (nur Beschreibung, kein Preis) | Freitext |
| **Beschreibung** | Text der Position | Leer |
| **Menge** | Anzahl | 1 |
| **Einheit** | Mengeneinheit (Stk, Std, Monat, Pausch., kg, etc.) | Stk |
| **Einzelpreis** | Nettopreis pro Einheit in EUR | 0,00 |
| **Festkosten** | Einmalige Zusatzkosten (werden zum Positionstotal addiert) | Leer (0) |
| **MwSt %** | Umsatzsteuersatz | 19 |
| **Gesamt** | Automatisch berechnet: Menge x Einzelpreis + Festkosten (nur Anzeige) | - |

Positionen werden als Vorlage gespeichert und bei jeder Rechnungsgenerierung exakt in den neuen Beleg uebernommen. Bei Positionen vom Typ **Text** werden Menge, Einheit, Einzelpreis und MwSt ignoriert -- es erscheint nur der Beschreibungstext.

Positionen koennen ueber das Loeschsymbol (Papierkorb) am Zeilenende entfernt werden.

**Notizen (optional):**

| Feld | Beschreibung | Wenn leer |
|------|-------------|-----------|
| **Notizen** | Erscheinen auf jeder generierten Rechnung (z. B. Vertragsnummer, Hinweise) | Kein Notiztext auf der Rechnung |
| **Interne Notizen** | Nur intern sichtbar, erscheinen nicht auf der Rechnung | Keine internen Notizen |

3. **"Speichern"**
4. ✅ Vorlage wird erstellt und Sie werden auf die **Detailseite** weitergeleitet
5. ✅ **Naechste Faelligkeit** wird automatisch auf das **Startdatum** gesetzt

#### Detailseite

Die Detailseite zeigt alle Informationen zur Vorlage und bietet Aktionen:

**Kopfbereich:**
- Vorlagenname als Ueberschrift
- **Aktiv/Inaktiv**-Badge
- Intervall-Anzeige

**Aktionsschaltflaechen:**
- **"Rechnung generieren"** -- nur sichtbar wenn Vorlage aktiv ist
- **"Bearbeiten"** -- oeffnet das Formular zur Bearbeitung
- **"Deaktivieren"** / **"Aktivieren"** -- wechselt den Status
- **"Loeschen"** -- entfernt die Vorlage (mit Bestaetigungsdialog)

**Detailbereich:**

| Feld | Beschreibung |
|------|-------------|
| **Kunde** | Firmenname der Adresse |
| **Kontakt** | Kontaktperson (oder "-") |
| **Intervall** | Monatlich / Quartal / Halbjaehrlich / Jaehrlich |
| **Startdatum** | Datum der ersten Rechnung |
| **Enddatum** | Vertragsenddatum (oder "-" wenn unbefristet) |
| **Naechste Faelligkeit** | Wann die naechste Rechnung faellig ist |
| **Letzte Generierung** | Wann zuletzt generiert wurde (oder "-") |
| **Auto-Generierung** | Ja / Nein |
| **Zahlungsziel** | z. B. "30 Tage" (oder "-") |
| **Skonto** | z. B. "3% / 10 Tage" (oder "-") |

**Tabs:**
- **Positionen**: Tabelle mit allen Positionen der Vorlage (Nr., Typ, Beschreibung, Menge, Einheit, Einzelpreis, MwSt %, Gesamt)
- **Vorschau**: Zeigt eine Vorschau der naechsten Rechnung mit berechnetem Rechnungsdatum, Nettosumme, MwSt-Betrag und Bruttosumme

#### Vorlage bearbeiten

1. Detailseite: **"Bearbeiten"** klicken
2. Formular oeffnet sich mit den aktuellen Werten vorausgefuellt
3. Felder anpassen
4. **"Speichern"**
5. ✅ Aenderungen gelten nur fuer zukuenftige Rechnungen -- bereits erzeugte Belege bleiben unveraendert

#### Rechnung manuell generieren

1. Vorlage in der Liste anklicken -- Detailseite oeffnet sich
2. Klick auf **"Rechnung generieren"** (nur sichtbar bei aktiven Vorlagen)
3. Bestaetigungsdialog (Sheet) oeffnet sich mit Vorschau:
   - Rechnungsdatum (= naechste Faelligkeit)
   - Nettosumme, MwSt-Betrag, Bruttosumme
4. Klick auf **"Generieren"**
5. Ergebnis:
   - Neue Rechnung (RE-Nummer) wird als Beleg vom Typ *Rechnung* angelegt
   - Positionen werden exakt aus der Vorlage uebernommen
   - Konditionen (Zahlungsziel, Skonto, Lieferart, Lieferbedingungen) werden uebernommen
   - Notizen werden uebernommen
   - **Naechste Faelligkeit** rueckt um ein Intervall vor (z. B. 01.04. → 01.05. bei monatlich)
   - **Letzte Generierung** wird auf das aktuelle Datum gesetzt
6. ✅ Erfolgsmeldung: "Rechnung RE-X wurde erstellt"
7. ✅ Sie werden automatisch auf die Detailseite der erzeugten Rechnung weitergeleitet

Die erzeugte Rechnung ist ein normaler Beleg im Status **Entwurf** und kann unter 📍 Auftraege > Belege weiterverarbeitet werden (Positionen anpassen, abschliessen, fortfuehren etc.).

#### Automatische Generierung (Cron)

Wenn **"Automatisch generieren"** aktiviert ist, prueft ein taeglicher Hintergrundprozess (04:00 UTC), ob das Faelligkeitsdatum erreicht oder ueberschritten ist, und erzeugt die Rechnung automatisch. Die Generierung funktioniert identisch zur manuellen Generierung.

Voraussetzungen fuer die automatische Generierung:
- Vorlage muss **aktiv** sein
- **"Automatisch generieren"** muss aktiviert sein
- **Naechste Faelligkeit** muss das heutige Datum erreicht oder ueberschritten haben

Wenn die Checkbox **"Automatisch generieren"** nicht aktiviert ist, wird die Vorlage vom Cron-Job ignoriert -- Rechnungen koennen dann nur manuell ueber die Detailseite generiert werden.

#### Vorlage deaktivieren

1. Detailseite: Klick auf **"Deaktivieren"**
2. Badge wechselt zu **Inaktiv**
3. Vorlage wird nicht mehr fuer die automatische Generierung beruecksichtigt
4. **"Rechnung generieren"** wird ausgeblendet -- manuelle Generierung ist ebenfalls gesperrt
5. Ueber **"Aktivieren"** kann die Vorlage jederzeit wieder eingeschaltet werden

#### Vorlage loeschen

1. Detailseite: Klick auf **"Loeschen"**
2. Bestaetigungsdialog: "Moechten Sie die Vorlage wirklich loeschen?"
3. Klick auf **"Loeschen"** bestaetigen
4. ✅ Vorlage wird unwiderruflich entfernt
5. Bereits erzeugte Rechnungen bleiben bestehen und werden nicht geloescht

#### Vertragsende

Wenn ein **Enddatum** gesetzt ist und die naechste Faelligkeit dieses Datum ueberschreitet, wird die Vorlage automatisch deaktiviert. Dies geschieht:
- beim naechsten Generierungslauf (manuell oder automatisch)
- die letzte Rechnung wird noch erzeugt, danach wird die Vorlage inaktiv gesetzt
- eine erneute Aktivierung ist moeglich, fuehrt aber zu einem Fehler bei der Generierung wenn das Enddatum weiterhin ueberschritten ist

#### 13.13.1 Praxisbeispiel: Wiederkehrende Rechnung erstellen und Rechnung generieren

**Szenario:** Sie richten einen monatlichen Wartungsvertrag fuer einen Kunden ein, generieren die erste Rechnung manuell und pruefen das Ergebnis.

##### Schritt 1 -- Vorlage anlegen

1. 📍 Auftraege > Wiederkehrende Rechnungen
2. Klick auf **"Neue Vorlage"**
3. Formularseite oeffnet sich
4. **Name**: "Wartungsvertrag Monatlich"
5. **Kundenadresse**: "Mustermann GmbH" auswaehlen
6. **Intervall**: "Monatlich"
7. **Startdatum**: 01.04.2026
8. **Automatisch generieren**: Checkbox aktivieren
9. **Zahlungsziel**: 30 Tage
10. Position hinzufuegen:
    - **Typ**: Freitext
    - **Beschreibung**: "Monatliche Wartungspauschale"
    - **Menge**: 1
    - **Einheit**: "Stk"
    - **Einzelpreis**: 500,00
    - **MwSt**: 19%
11. Klick auf **"Speichern"**
12. ✅ Vorlage "Wartungsvertrag Monatlich" erscheint in der Liste mit naechster Faelligkeit 01.04.2026

##### Schritt 2 -- Rechnung manuell generieren

1. In der Liste: Klick auf **"Wartungsvertrag Monatlich"**
2. Detailseite oeffnet sich
3. Klick auf **"Rechnung generieren"**
4. Bestaetigungsdialog: Vorschau zeigt Mustermann GmbH, 1x Monatliche Wartungspauschale, Netto 500,00 EUR, MwSt 95,00 EUR, Brutto 595,00 EUR
5. Klick auf **"Generieren"**
6. ✅ Erfolgsmeldung: "Rechnung RE-1 wurde erstellt"
7. ✅ **Naechste Faelligkeit** ist jetzt 01.05.2026
8. ✅ **Letzte Generierung** zeigt das heutige Datum

##### Schritt 3 -- Erzeugte Rechnung pruefen

1. 📍 Auftraege > Belege
2. Rechnung **RE-1** (oder die aktuelle Nummer) ist sichtbar
3. Belegtyp: Rechnung, Kunde: Mustermann GmbH
4. Positionstabelle im A4-Editor zeigt: "Monatliche Wartungspauschale | 1 Stk | 500,00 EUR | 19% MwSt"
5. ✅ Summen: Netto 500,00 EUR, MwSt 95,00 EUR, Brutto 595,00 EUR

##### Ergebnis

Die wiederkehrende Rechnung ist vollstaendig eingerichtet:

- **Vorlage** "Wartungsvertrag Monatlich" ist aktiv mit automatischer Generierung
- **Erste Rechnung** RE-1 wurde manuell generiert und geprueft
- Ab Mai wird die naechste Rechnung automatisch durch den taeglichen Cron-Job erzeugt
- Bei Vertragsende setzen Sie ein Enddatum -- die Vorlage deaktiviert sich danach automatisch

**Tipp:** Sie koennen die Vorlage jederzeit bearbeiten, z. B. um den Preis anzupassen. Aenderungen gelten nur fuer zukuenftige Rechnungen -- bereits erzeugte Belege bleiben unveraendert.

### 13.14 E-Rechnung (ZUGFeRD / XRechnung)

**Was ist es?** Ab 01.01.2027 ist die E-Rechnung fuer alle B2B-Rechnungen in Deutschland Pflicht (Wachstumschancengesetz). Terp unterstuetzt das Format **ZUGFeRD 2.x** (Profil EN 16931 / COMFORT): Bei Rechnungen und Gutschriften wird automatisch ein maschinenlesbares CII-XML generiert und in die PDF eingebettet. Das Ergebnis ist eine PDF/A-3 Datei, die sowohl fuer Menschen lesbar (PDF) als auch fuer Buchhaltungssoftware maschinenlesbar (XML) ist.

**Wozu dient es?** Empfaenger koennen die Rechnung wie gewohnt als PDF oeffnen und lesen. Gleichzeitig kann deren Buchhaltungssoftware die strukturierten Rechnungsdaten automatisch aus der PDF extrahieren -- ohne manuelles Abtippen.

#### E-Rechnung aktivieren

📍 Auftraege > Belege > **Briefpapier / Billing-Konfiguration** (ueber das Zahnrad-Symbol oder Einstellungen)

1. Zum Abschnitt **"E-Rechnung"** scrollen
2. **"E-Rechnung aktivieren (ZUGFeRD / XRechnung)"** einschalten
3. **Steuernummer** eintragen (optional, falls keine USt-IdNr. vorhanden)
4. **Leitweg-ID** eintragen (nur fuer XRechnung an oeffentliche Auftraggeber)
5. **Strukturierte Firmenadresse** ausfuellen:
   - **Strasse** (z. B. "Industriestrasse 42")
   - **PLZ** (z. B. "70565")
   - **Ort** (z. B. "Stuttgart")
   - **Land** (Standard: "DE")
6. **Speichern**

> Diese strukturierte Adresse wird fuer das maschinenlesbare XML verwendet. Die Freitext-Adresse im Abschnitt "Unternehmen" bleibt fuer den PDF-Briefkopf erhalten.

##### Pflichtfelder fuer die E-Rechnung

| Feld | Wo gepflegt | Hinweis |
|------|-------------|---------|
| Firmenname | Billing-Konfiguration > Unternehmen | |
| USt-IdNr. **oder** Steuernummer | Billing-Konfiguration > Rechtliches / E-Rechnung | Mindestens eins von beiden |
| Strasse, PLZ, Ort | Billing-Konfiguration > E-Rechnung | Strukturierte Adresse |
| Kundenname | CRM > Adressen > Firma | |
| Kundenadresse (Strasse, PLZ, Ort, Land) | CRM > Adressen > Adresse | |
| Mindestens eine Artikelposition | Belegdetail > Positionen | |

Fehlen Pflichtfelder, erscheint beim Abschliessen eine Warnung. Der Beleg wird trotzdem abgeschlossen -- nur das XML wird nicht erstellt.

#### Leitweg-ID (fuer oeffentliche Auftraggeber)

Wenn ein Kunde eine **Leitweg-ID** hat (fuer B2G / XRechnung an Behoerden), kann diese auf der CRM-Adresse hinterlegt werden:

📍 CRM > Adressen > Adresse bearbeiten > Abschnitt "Steuerinformationen" > **Leitweg-ID**

Die Leitweg-ID wird als BT-10 (Buyer Reference) ins XML geschrieben.

#### E-Rechnung XML herunterladen

Nach dem Abschliessen einer Rechnung oder Gutschrift mit aktivierter E-Rechnung:

📍 Belegdetail (Status: Abgeschlossen) → **"E-Rechnung XML herunterladen"** (Button neben PDF)

Der Button ist nur sichtbar wenn:
- Belegtyp ist **Rechnung** oder **Gutschrift**
- Status ist **Abgeschlossen** oder spaeter
- XML wurde erfolgreich generiert

> 💡 Im Normalfall reicht es, die **PDF** zu versenden. Das XML ist darin eingebettet (ZUGFeRD PDF/A-3). Der separate XML-Download ist fuer Sonderfaelle: XRechnung an Behoerden (die nur das nackte XML akzeptieren) oder fuer die manuelle Pruefung.

#### E-Rechnung nachtraeglich erstellen

Fuer Rechnungen und Gutschriften, die **vor Aktivierung** der E-Rechnung abgeschlossen wurden oder bei denen die automatische Generierung fehlgeschlagen ist:

📍 Belegdetail (Status: Abgeschlossen) → **"E-Rechnung erstellen"**

1. Der Button erscheint nur wenn E-Rechnung aktiviert ist, der Beleg abgeschlossen ist und noch **kein** XML existiert
2. 📍 **"E-Rechnung erstellen"** klicken
3. ✅ Toast: „E-Rechnung erfolgreich erstellt"
4. ✅ Der Button wird durch **"E-Rechnung XML herunterladen"** ersetzt
5. ✅ Das PDF im Speicher wird automatisch durch die ZUGFeRD PDF/A-3 Version ersetzt

> 💡 Falls die PDF oder XML im Speicher geloescht wurden, werden sie beim naechsten Download automatisch neu generiert. Das PDF wird dabei erneut als ZUGFeRD PDF/A-3 mit eingebettetem XML erstellt.

#### Praxisbeispiel: E-Rechnung einrichten und erste Rechnung erstellen

**Schritt 1 -- E-Rechnung aktivieren**

1. 📍 Auftraege > Belege > Briefpapier / Billing-Konfiguration
2. Zum Abschnitt "E-Rechnung" scrollen
3. Toggle **"E-Rechnung aktivieren"** einschalten
4. Steuernummer eintragen: `123/456/78901`
5. Strukturierte Firmenadresse ausfuellen: Strasse, PLZ, Ort
6. **Speichern**

**Schritt 2 -- Rechnung erstellen und abschliessen**

1. 📍 Auftraege > Belege > **"Neuer Beleg"**
2. Typ: **Rechnung**, Kunde auswaehlen
3. Position hinzufuegen (z. B. 10 Std. Beratung, 100 EUR/Std.)
4. **"Abschliessen"** klicken
5. Kein Warnhinweis (alle Pflichtfelder vorhanden)
6. ✅ Toast: „Beleg abgeschlossen — E-Rechnung steht zum Download bereit"
7. PDF und ZUGFeRD-XML werden automatisch generiert

**Schritt 3 -- PDF versenden**

1. **"PDF herunterladen"** klicken
2. PDF per E-Mail an den Kunden versenden
3. Die PDF enthaelt das eingebettete XML -- der Kunde braucht keine separate Datei

---

## 14. Lagerverwaltung — Artikelstamm

### 14.1 Artikelliste

**Was ist es?** Der Artikelstamm ist das zentrale Register aller Materialien, Waren und Dienstleistungen, die ein Unternehmen beschafft, lagert oder verkauft. Jeder Artikel hat eine automatisch vergebene Nummer, eine Bezeichnung, eine Einheit und optional Preise und Bestandsführung.

**Wozu dient es?** Artikel bilden die Grundlage für Preislisten, Stücklisten, Einkauf, Wareneingang und Lagerentnahmen. Durch die zentrale Pflege sind alle Artikelinformationen — Preise, Lieferanten, Komponenten, Bestand — an einer Stelle verfügbar.

⚠️ Modul: Das Warehouse-Modul muss für den Mandanten aktiviert sein

⚠️ Berechtigung: „Lagerartikel anzeigen" (`wh_articles.view`) zum Lesen, „Lagerartikel erstellen" (`wh_articles.create`) zum Anlegen, „Lagerartikel bearbeiten" (`wh_articles.edit`) zum Bearbeiten

📍 Seitenleiste → **Lager** → **Artikel**

✅ Seite mit Artikeltabelle, Gruppenbaum links, Suchfeld und Filtern

#### Artikeltabelle

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Bild** | Thumbnail des Hauptbilds oder Platzhalter-Icon |
| **Nummer** | Auto-generierte Artikelnummer — monospace |
| **Bezeichnung** | Artikelname (fett) |
| **Gruppe** | Name der Artikelgruppe oder „—" |
| **Einheit** | Stk, kg, m, Std, l, Paar, Pkt, Set |
| **VK-Preis** | Netto-Verkaufspreis in EUR oder „—" |
| **Bestand** | Aktuelle Lagermenge (nur bei Bestandsführung) oder „—" |
| **Status** | Badge: Aktiv (blau) / Inaktiv (grau) |
| **Aktionen** | ⋯-Menü: Anzeigen, Bearbeiten, Deaktivieren/Wiederherstellen |

**Filter:**
- **Suchfeld**: Durchsucht Nummer, Name und Matchcode gleichzeitig
- **„Nur aktive"**: Schalter, blendet inaktive Artikel aus (Standard: ein)
- **„Unter Mindestbestand"**: Schalter, zeigt nur Artikel mit Bestand unter Mindestbestand
- **Gruppenfilter**: Klick auf eine Artikelgruppe im Baum links filtert die Tabelle

#### Artikelgruppen (Baum links)

📍 Links neben der Artikeltabelle

Artikel können in **Artikelgruppen** organisiert werden. Gruppen bilden eine Baumstruktur — jede Gruppe kann beliebig viele Untergruppen enthalten.

- 📍 **„Alle Artikel"** (oben) → zeigt alle Artikel ohne Gruppenfilter
- 📍 Klick auf eine Gruppe → filtert die Tabelle auf Artikel dieser Gruppe
- ⚠️ Berechtigung: „Artikelgruppen verwalten" (`wh_article_groups.manage`) für Kontextmenü

Über das ⋯-Menü einer Gruppe:
- **„Untergruppe"** → Dialog: Name eingeben → erstellt eine neue Untergruppe
- **„Bearbeiten"** → Dialog: Name ändern → speichert
- **„Entfernen"** → Gruppe wird sofort gelöscht

> 💡 **Beispiel:** Eine Schreinerei könnte die Gruppen „Holz → Massivholz → Eiche", „Beschläge → Scharniere" und „Verbrauchsmaterial" anlegen.

#### Neuen Artikel anlegen

1. 📍 **„Neuer Artikel"** (oben rechts)
2. ✅ Seitliches Formular (Sheet) öffnet sich: „Neuer Artikel"
3. Felder ausfüllen:
   - **Bezeichnung** (Pflicht) — Name des Artikels
   - **Beschreibung** (optional) — ausführliche Beschreibung
   - **Artikelgruppe** (optional) — Zuordnung zu einer Gruppe
   - **Einheit** (Dropdown: Stk, kg, m, Std, l, Paar, Pkt, Set) — Standard: Stk
   - **Matchcode** (optional) — Kurzname für Schnellsuche, wird automatisch aus dem Namen generiert
   - **VK-Preis netto** (optional) — Verkaufspreis
   - **EK-Preis** (optional) — Einkaufspreis
   - **MwSt-Satz %** — Standard: 19
   - **Rabattgruppe** (optional) — für Einkaufsabwicklung
   - **Bestellart** (optional)
   - **Bestandsführung** (Schalter) — aktiviert Lagerfunktionen
   - Bei aktiver Bestandsführung zusätzlich: **Mindestbestand** und **Lagerort**
4. 📍 „Erstellen"
5. ✅ Artikel erscheint in der Tabelle mit automatisch vergebener Nummer

> 💡 **Hinweis:** Die Artikelnummer wird beim Anlegen automatisch vergeben und kann nicht manuell geändert werden.

#### Artikel bearbeiten

1. 📍 ⋯-Menü des Artikels → **„Bearbeiten"**
2. ✅ Formular öffnet sich mit den aktuellen Werten vorausgefüllt
3. Gewünschte Felder ändern
4. 📍 „Speichern"

#### Artikel deaktivieren und wiederherstellen

Artikel werden nicht gelöscht, sondern deaktiviert — sie bleiben im System erhalten.

1. 📍 ⋯-Menü → **„Deaktivieren"**
2. ✅ Artikel verschwindet aus der aktiven Liste

Zum Wiederherstellen:
1. 📍 Schalter „Nur aktive" ausschalten → deaktivierte Artikel werden sichtbar
2. 📍 ⋯-Menü → **„Wiederherstellen"**

---

### 14.2 Artikeldetailseite

📍 Zeile in der Artikeltabelle anklicken → Detailseite

✅ Kopfbereich zeigt: Artikelnummer (monospace), Name, Status-Badge (Aktiv/Inaktiv), optional Badges „Bestandsführung" und Gruppenname. Buttons „Bestand korrigieren" (bei Bestandsführung), „Bearbeiten" und „Deaktivieren/Wiederherstellen".

Die Detailseite hat **6 Tabs**:

#### Tab „Übersicht"

Zeigt alle Artikeldaten in Kartenansicht (2-Spalten-Grid):

| Karte | Felder |
|-------|--------|
| **Stammdaten** | Artikelnr., Bezeichnung, Beschreibung, Matchcode, Einheit, Artikelgruppe, Rabattgruppe, Bestellart |
| **Preise** | VK-Preis (netto), EK-Preis, MwSt-Satz |
| **Bestand** (nur bei Bestandsführung) | Aktueller Bestand, Mindestbestand, Lagerort |

> ⚠️ Fällt der Bestand unter den Mindestbestand, erscheint ein roter Warnhinweis: „Bestand unter Mindestbestand!"

#### Tab „Lieferanten"

📍 Tab **„Lieferanten"**

Hier werden einem Artikel Lieferanten zugeordnet. Lieferanten stammen aus dem CRM-Adressbuch (Typ: Lieferant).

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Lieferant** | Firmenname aus CRM |
| **Artikelnr. Lieferant** | Die Bestellnummer beim Lieferanten |
| **EK-Preis** | Lieferantenspezifischer Einkaufspreis in EUR |
| **Lieferzeit** | In Tagen |
| **Hauptlieferant** | Badge „Haupt" beim bevorzugten Lieferanten |
| **Aktionen** | Bearbeiten (Stift) / Löschen (Papierkorb) |

##### Lieferant zuordnen

1. 📍 **„Lieferant hinzufügen"**
2. ✅ Dialog öffnet sich
3. **Lieferant** auswählen (Dropdown aller CRM-Lieferanten)
4. Optional ausfüllen: Artikelnr. beim Lieferant, EK-Preis, Lieferzeit (Tage), Bestelleinheit, Std.-Bestellmenge
5. Optional: **Hauptlieferant** einschalten
6. 📍 „Hinzufügen"

> 💡 **Beispiel:** Der Artikel „Eichenholz 2m" hat zwei Lieferanten: „Holz Müller" (Hauptlieferant, 5 Tage, 45,00 €/m) und „Sägewerk Schmidt" (7 Tage, 42,50 €/m).

#### Tab „Stückliste"

📍 Tab **„Stückliste"**

Definiert die Komponenten (Bill of Materials), aus denen ein Artikel zusammengesetzt ist.

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Artikelnr.** | Nummer der Komponente (monospace) |
| **Bezeichnung** | Name der Komponente |
| **Menge** | Anzahl mit Einheit (z. B. „4 Stk") |
| **Bemerkung** | Optionaler Freitext |
| **Aktionen** | Bearbeiten (Stift) / Löschen (Papierkorb) |

##### Komponente hinzufügen

1. 📍 **„Komponente hinzufügen"**
2. ✅ Dialog öffnet sich
3. **Artikel** — Suchfeld: Artikelname oder -nummer eingeben, Ergebnis auswählen (Pflicht)
4. **Menge** eingeben (Standard: 1)
5. Optional: **Bemerkung**
6. 📍 „Hinzufügen"

> 💡 **Beispiel:** Der Artikel „Tischplatte Eiche 120×80" besteht aus: 1× Eichenholz-Platte, 4× Gewindeeinsatz M8, 1× Kantenumleimer 4m.

#### Tab „Bestand"

📍 Tab **„Bestand"**

Zeigt alle Bestandsbewegungen (Wareneingänge, Entnahmen, Korrekturen) für diesen Artikel. Spalten: Datum, Typ, Menge, vorheriger und neuer Bestand, Referenz. Siehe Kapitel 17.2.

#### Tab „Preise"

📍 Tab **„Preise"**

Zeigt alle Preislisteneinträge dieses Artikels in einer Tabelle:

| Spalte | Beschreibung |
|--------|-------------|
| **Preisliste** | Name der Preisliste (mit „Standard"-Badge, falls zutreffend) |
| **Einzelpreis** | Der Preis in dieser Liste in EUR |
| **Mindestmenge** | Ab welcher Menge dieser Preis gilt (oder „—") |
| **Einheit** | Die Einheit in dieser Liste (oder „—") |
| **Gültig ab** | Gültigkeitsbeginn der Preisliste |
| **Gültig bis** | Gültigkeitsende der Preisliste |

✅ Wenn keine Einträge vorhanden: „Keine Preislisteneinträge für diesen Artikel"

#### Tab „Bilder"

📍 Tab **„Bilder"**

Hier werden einem Artikel Bilder zugeordnet. Ein Bild kann als Hauptbild markiert werden — dieses erscheint als Vorschau in der Artikelliste.

✅ Bildergalerie als Kacheln (Thumbnail-Vorschau). Hauptbild ist mit Stern-Badge markiert.

##### Bild hochladen

1. 📍 **„Bild hochladen"**
2. ✅ Dialog öffnet sich mit Drag & Drop-Bereich
3. Bilder per Drag & Drop ablegen oder Dateiauswahl (Klick)
4. ✅ Vorschau der ausgewählten Bilder mit Fortschrittsanzeige
5. ✅ Erlaubte Formate: JPEG, PNG, WebP — max. 5 MB pro Datei
6. ✅ Nach dem Upload erscheint das Bild in der Galerie
7. ✅ Das erste hochgeladene Bild wird automatisch als Hauptbild gesetzt

##### Hauptbild setzen

1. 📍 Über einem Bild: **Stern-Symbol** klicken
2. ✅ Das Bild wird als Hauptbild markiert, das vorherige Hauptbild verliert den Status

##### Reihenfolge ändern

1. 📍 Bilder per Drag & Drop (am Griff-Symbol oben links) in die gewünschte Reihenfolge ziehen
2. ✅ Reihenfolge wird automatisch gespeichert

##### Bild löschen

1. 📍 Über einem Bild: **Papierkorb-Symbol** klicken
2. ✅ Bestätigungsdialog: „Bild löschen? Dies kann nicht rückgängig gemacht werden."
3. 📍 „Bestätigen"
4. ✅ Bild wird aus Galerie und Speicher entfernt
5. ✅ War es das Hauptbild, wird automatisch das nächste Bild zum Hauptbild

##### Bildvorschau (Lightbox)

1. 📍 Auf ein Bild in der Galerie klicken
2. ✅ Grossansicht des Bildes in einem Dialog
3. 📍 Schliessen-Button oder Escape-Taste zum Schliessen

---

### 14.3 Bestandskorrektur

📍 Artikeldetailseite → Button **„Bestand korrigieren"** (nur bei aktiver Bestandsführung sichtbar)

✅ Dialog öffnet sich

1. **Änderung (+/−)** eingeben — z. B. +10 oder −5 (Deltawert, nicht der neue Absolutwert)
2. ✅ Vorschau zeigt: „Neuer Bestand: {aktuell + Änderung}"
3. Optional: **Grund** eingeben (z. B. „Inventur", „Schwund", „Nachlieferung")
4. 📍 „Korrigieren"
5. ✅ Toast: „Bestand korrigiert"

> ⚠️ Der Button ist deaktiviert, wenn die Änderung 0 beträgt.

---

### 14.4 Praxisbeispiel: Artikelstamm für eine Schreinerei einrichten

**Schritt 1 — Artikelgruppen anlegen**

1. 📍 Seitenleiste → **Lager** → **Artikel**
2. ✅ Seite mit leerem Artikelstamm und Gruppenbaum links
3. 📍 Im Gruppenbaum: **[+]** bei „Alle Artikel" (erscheint beim Hovern) oder **„Neue Gruppe"** unten
4. Name: „Holz" → Erstellen
5. ✅ Gruppe „Holz" erscheint im Baum
6. 📍 **[+]** bei „Holz" (erscheint beim Hovern) → Name: „Massivholz" → Erstellen
7. 📍 **[+]** bei „Holz" → Name: „Plattenware" → Erstellen
8. 📍 **[+]** bei „Alle Artikel" oder „Neue Gruppe" → „Beschläge" anlegen
9. 📍 **[+]** bei „Beschläge" → „Scharniere" anlegen
10. ✅ Baumstruktur: Holz (Massivholz, Plattenware), Beschläge (Scharniere)

**Schritt 2 — Ersten Artikel anlegen**

1. 📍 **„Neuer Artikel"**
2. **Bezeichnung**: „Eichenholz-Platte 2000×600×20mm"
3. **Artikelgruppe**: „Massivholz"
4. **Einheit**: „Stk"
5. **VK-Preis**: 85,00
6. **EK-Preis**: 52,00
7. **MwSt-Satz**: 19
8. **Bestandsführung**: einschalten
9. **Mindestbestand**: 10
10. **Lagerort**: „Regal A3, Fach 2"
11. 📍 „Erstellen"
12. ✅ Artikel erscheint in der Tabelle mit Nummer und Status „Aktiv"

**Schritt 3 — Lieferant zuordnen**

1. 📍 Artikelzeile anklicken → Detailseite
2. 📍 Tab **„Lieferanten"** → **„Lieferant hinzufügen"**
3. Lieferant: „Holz Müller" (aus CRM)
4. Artikelnr. beim Lieferant: „HM-EI-2060"
5. EK-Preis: 52,00
6. Lieferzeit: 5 Tage
7. Hauptlieferant: einschalten
8. 📍 „Hinzufügen"
9. ✅ Lieferant erscheint in der Tabelle mit Badge „Haupt"

**Schritt 4 — Stückliste anlegen**

1. 📍 Tab **„Stückliste"** → **„Komponente hinzufügen"**
2. Artikel suchen: „Kantenumleimer" → auswählen
3. Menge: 1
4. 📍 „Hinzufügen"
5. ✅ Komponente erscheint in der Stückliste

**Schritt 5 — Bestand korrigieren**

1. 📍 Button **„Bestand korrigieren"** (im Kopfbereich)
2. Änderung: +25
3. Grund: „Erstbestand / Inventur"
4. ✅ Vorschau: „Neuer Bestand: 25"
5. 📍 „Korrigieren"
6. ✅ Tab „Übersicht" → Karte „Bestand" zeigt: Aktueller Bestand: 25

---

## 15. Lagerverwaltung — Preislisten

### 15.1 Preislisten verwalten

**Was ist es?** Eine Preisliste ordnet Artikeln individuelle Preise zu. Es können beliebig viele Preislisten parallel existieren — für verschiedene Kundengruppen, Regionen oder Zeiträume. Eine Preisliste kann als **Standard** markiert werden und wird dann automatisch verwendet, wenn einem Kunden keine eigene Liste zugeordnet ist.

**Wozu dient es?** Preislisten ermöglichen kundenspezifische Preisgestaltung: Großkunden bekommen Rabatte, bestimmte Regionen andere Preise, Messeaktionen werden zeitlich begrenzt. Bei der Belegerfassung wird der Preis automatisch aus der zugeordneten Preisliste des Kunden gezogen.

⚠️ Modul: Das Warehouse-Modul muss für den Mandanten aktiviert sein

⚠️ Berechtigung: „Preislisten anzeigen" (`billing_price_lists.view`) zum Lesen, „Preislisten verwalten" (`billing_price_lists.manage`) zum Anlegen und Bearbeiten

📍 Seitenleiste → **Lager** → **Preislisten**

✅ Drei-Panel-Ansicht: Links Preislisten, Mitte Artikeltabelle, Rechts Preisdetails

#### Drei-Panel-Aufbau

| Panel | Position | Inhalt |
|-------|----------|--------|
| **Preislisten** | Links (schmal) | Liste aller aktiven Preislisten. Standard-Liste mit „Standard"-Badge. Button „Neue Liste". |
| **Artikel** | Mitte (breit) | Alle Artikel der ausgewählten Preisliste mit Suchfeld. Button „Artikel hinzufügen". |
| **Preisdetails** | Rechts (schmal) | Bearbeitungsformular für den ausgewählten Artikel mit Speichern/Löschen. |

#### Werkzeugleiste

Oberhalb der drei Panels erscheinen (nur bei ausgewählter Preisliste und mit Berechtigung):
- 📍 **„Preise anpassen"** → öffnet den Dialog zur prozentualen Anpassung (→ 15.4)
- 📍 **„Preisliste kopieren"** → öffnet den Kopierdialog (→ 15.5)

---

### 15.2 Neue Preisliste erstellen

1. 📍 Im linken Panel: **„Neue Liste"**
2. ✅ Eingabefeld erscheint unter dem Button
3. Name eingeben (z. B. „Großkunden Q2 2026")
4. 📍 Enter drücken oder **„Speichern"** klicken
5. ✅ Toast: „Preisliste erstellt"
6. ✅ Neue Preisliste ist sofort ausgewählt und bereit für Artikel

> 💡 **Hinweis:** Wenn noch keine Preisliste existiert, zeigt das linke Panel „Keine Einträge" und einen großen „Neue Liste"-Button.

---

### 15.3 Artikel hinzufügen und Preise bearbeiten

#### Artikel zur Preisliste hinzufügen

1. 📍 Im linken Panel eine Preisliste auswählen
2. ✅ Mittleres Panel zeigt die Artikeltabelle (oder „Keine Einträge")
3. 📍 **„Artikel hinzufügen"** (oben im mittleren Panel)
4. ✅ Suchfeld erscheint — Artikelname oder -nummer eingeben
5. 📍 Gewünschten Artikel aus der Ergebnisliste auswählen
6. ✅ Artikel wird mit Preis 0,00 € hinzugefügt und im rechten Panel geöffnet
7. Im rechten Panel den **Einzelpreis** eingeben
8. Optional: **Mindestmenge** und **Einheit** anpassen
9. 📍 **„Speichern"**
10. ✅ Toast: „Preis gespeichert"

Artikeltabelle im mittleren Panel:

| Spalte | Beschreibung |
|--------|-------------|
| **Artikel-Nr.** | Artikelnummer (monospace) |
| **Bezeichnung** | Artikelname |
| **Einzelpreis** | Preis in EUR |
| **Einheit** | Einheit in dieser Liste (oder Artikeleinheit als Fallback) |
| **Mindestmenge** | Ab welcher Menge dieser Preis gilt (oder „—") |

#### Preis bearbeiten

1. 📍 Im mittleren Panel auf einen Artikel klicken
2. ✅ Rechtes Panel zeigt die Preisdetails:
   - **Basispreis (Artikel)**: Referenz — der VK-Preis aus dem Artikelstamm
   - **Einzelpreis**: editierbares Feld
   - **Mindestmenge**: editierbares Feld (leer = keine Mindestmenge)
   - **Einheit**: editierbares Feld (vorausgefüllt mit Artikeleinheit)
3. Werte anpassen
4. 📍 **„Speichern"**
5. ✅ Toast: „Preis gespeichert"

#### Artikel aus Preisliste entfernen

1. 📍 Artikel im mittleren Panel auswählen
2. 📍 Im rechten Panel: roter **Löschen-Button** (Papierkorb-Symbol)
3. ✅ Toast: „Preis entfernt"

---

### 15.4 Preise prozentual anpassen

📍 Werkzeugleiste → **„Preise anpassen"**

✅ Dialog öffnet sich

1. **Anpassung (%)** eingeben — z. B. 5,0 für +5 % oder −3,0 für −3 %
2. Optional: **Artikelgruppe** auswählen, um nur Artikel dieser Gruppe anzupassen (Standard: „Alle Gruppen")
3. 📍 **„Bestätigen"**
4. ✅ Toast: „Preise erfolgreich angepasst: {Anzahl} Betroffene Einträge"

> 💡 **Beispiel:** Preisliste „Standard 2026" hat 120 Artikel. Preise anpassen mit +3,0 % ergibt: alle 120 Preise werden um 3 % erhöht. Ein Artikel mit 10,00 € kostet danach 10,30 €.

> 💡 **Hinweis:** Preise werden auf zwei Dezimalstellen gerundet.

---

### 15.5 Preisliste kopieren

📍 Werkzeugleiste → **„Preisliste kopieren"**

✅ Dialog öffnet sich

1. **Kopieren von**: Zeigt den Namen der aktuell ausgewählten Preisliste (nicht änderbar)
2. **Kopieren nach**: Ziel-Preisliste auswählen (Dropdown aller aktiven Listen außer der Quelle)
3. Optional: **„Vorhandene Einträge überschreiben"** einschalten
   - **Aus** (Standard): Bereits vorhandene Artikel in der Zielliste werden übersprungen
   - **Ein**: Alle Artikelpreise in der Zielliste werden durch die Quellpreise ersetzt
4. 📍 **„Bestätigen"**
5. ✅ Toast: „Preisliste erfolgreich kopiert: {Anzahl} kopiert, {Anzahl} übersprungen"

---

### 15.6 Praxisbeispiel: Preislisten für Standardkunden und Großkunden einrichten

**Schritt 1 — Standardpreisliste erstellen**

1. 📍 Seitenleiste → **Lager** → **Preislisten**
2. ✅ Drei-Panel-Ansicht, linkes Panel zeigt „Keine Einträge"
3. 📍 **„Neue Liste"** → Name: „Standardpreise 2026" → Enter
4. ✅ Preisliste erstellt und ausgewählt

**Schritt 2 — Artikel mit Preisen befüllen**

1. 📍 **„Artikel hinzufügen"** im mittleren Panel
2. Suche: „Eichenholz" → Artikel auswählen
3. ✅ Artikel erscheint mit 0,00 €, rechtes Panel öffnet sich
4. Einzelpreis: 85,00 → 📍 **„Speichern"**
5. ✅ Preis wird in der Tabelle aktualisiert
6. Weitere Artikel hinzufügen und bepreisen

**Schritt 3 — Großkundenpreisliste durch Kopie erstellen**

1. 📍 **„Neue Liste"** → Name: „Großkunden −10 %" → Enter
2. ✅ Neue leere Preisliste erstellt
3. 📍 Im linken Panel zurück auf „Standardpreise 2026" klicken
4. 📍 Werkzeugleiste → **„Preisliste kopieren"**
5. Kopieren nach: „Großkunden −10 %"
6. 📍 **„Bestätigen"**
7. ✅ Toast: „Preisliste kopiert: {Anzahl} kopiert"

**Schritt 4 — Großkundenpreise um 10 % senken**

1. 📍 Im linken Panel „Großkunden −10 %" auswählen
2. ✅ Alle kopierten Artikel sind sichtbar
3. 📍 Werkzeugleiste → **„Preise anpassen"**
4. Anpassung: −10,0
5. 📍 **„Bestätigen"**
6. ✅ Toast: „Preise angepasst" — Eichenholz-Platte jetzt 76,50 € statt 85,00 €

**Schritt 5 — Preise im Artikeldetail prüfen**

1. 📍 Seitenleiste → **Lager** → **Artikel** → Artikel „Eichenholz-Platte" anklicken
2. 📍 Tab **„Preise"**
3. ✅ Tabelle zeigt zwei Einträge:
   - „Standardpreise 2026" — 85,00 €
   - „Großkunden −10 %" — 76,50 €

---

## 16. Lagerverwaltung — Einkauf / Bestellungen

### 16.1 Bestellliste

**Was ist es?** Das Einkaufsmodul (Bestellungen) verwaltet den gesamten Beschaffungsprozess: Vom Erstellen einer Bestellung an einen Lieferanten über das Versenden bis zur Nachverfolgung des Lieferstatus. Bestellungen werden mit automatisch vergebener Nummer angelegt und durchlaufen einen definierten Status-Workflow.

**Wozu dient es?** Bestellungen sorgen für eine lückenlose Dokumentation aller Einkaufsvorgänge. In Kombination mit Nachbestellvorschlägen können Artikel, deren Bestand unter den Mindestbestand fällt, gezielt nachbestellt werden. Jede Bestellung ist einem Lieferanten aus dem CRM zugeordnet.

⚠️ Modul: Das Warehouse-Modul muss für den Mandanten aktiviert sein

⚠️ Berechtigung: „Bestellungen anzeigen" (`wh_purchase_orders.view`) zum Lesen, „Bestellungen erstellen" (`wh_purchase_orders.create`) zum Anlegen, „Bestellungen bearbeiten" (`wh_purchase_orders.edit`) zum Bearbeiten, „Bestellungen bestellen" (`wh_purchase_orders.order`) zum Senden/Abschließen

📍 Seitenleiste → **Lager** → **Bestellungen**

✅ Seite mit Bestelltabelle, Suchfeld, Statusfilter und Aktionsknöpfen

#### Bestelltabelle

Tabelle mit Spalten:

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | Auto-generierte Bestellnummer (z. B. BES-1) — monospace |
| **Lieferant** | Firmenname des Lieferanten |
| **Bestelldatum** | Datum, an dem die Bestellung versendet wurde, oder „—" |
| **Liefertermin** | Gewünschter Liefertermin oder „—" |
| **Status** | Badge: Entwurf (grau), Bestellt (blau), Teilweise geliefert (orange), Vollständig geliefert (grün), Storniert (rot) |
| **Gesamt** | Bruttosumme in EUR |
| **Aktionen** | ⋯-Menü: Anzeigen, Bearbeiten, Bestellen, Löschen, Stornieren |

**Filter:**
- **Suchfeld**: Durchsucht Bestellnummer und Lieferantenname
- **Statusfilter** (Dropdown): Alle Status / Entwurf / Bestellt / Teilweise geliefert / Vollständig geliefert / Storniert

**Toolbar-Buttons:**
- **„Nachbestellvorschläge"**: Öffnet die Seite mit Artikeln unter Mindestbestand
- **„Neue Bestellung"**: Legt eine neue Bestellung an

---

### 16.2 Neue Bestellung anlegen

1. 📍 **„Neue Bestellung"** (oben rechts)
2. ✅ Formularseite öffnet sich
3. Felder ausfüllen:
   - **Lieferant** (Pflicht, Dropdown) — zeigt nur Adressen vom Typ „Lieferant" oder „Beides" aus dem CRM
   - **Kontaktperson** (optional, Dropdown) — Ansprechpartner beim gewählten Lieferanten (wird erst aktiv nach Lieferantenauswahl)
   - **Gewünschter Liefertermin** (optional, Datum)
   - **Bemerkungen** (optional, Freitext)
4. 📍 **„Erstellen"**
5. ✅ Bestellung wird im Status „Entwurf" angelegt und die Detailseite öffnet sich
6. ✅ Bestellnummer wird automatisch vergeben (z. B. BES-1, BES-2, …)

> 💡 **Hinweis:** Die Bestellnummer wird automatisch über eine Nummernfolge vergeben (Schlüssel: `purchase_order`). Sie kann nicht manuell geändert werden.

---

### 16.3 Bestelldetailseite

📍 Zeile in der Bestelltabelle anklicken → Detailseite

Die Detailseite zeigt alle Informationen zur Bestellung in mehreren Bereichen:

#### Kopfdaten

| Feld | Beschreibung |
|------|-------------|
| **Nummer** | Auto-generierte Bestellnummer |
| **Status** | Aktueller Status als Badge |
| **Lieferant** | Firmenname |
| **Kontaktperson** | Name des Ansprechpartners oder „—" |
| **Gewünschter Liefertermin** | Datum oder „—" |
| **Bestätigter Liefertermin** | Vom Lieferanten bestätigtes Datum oder „—" |
| **Bestelldatum** | Datum der Bestellung (nach Versand) oder „—" |
| **Bestellmethode** | Telefon / E-Mail / Fax / Druck (nach Versand) oder „—" |
| **Unsere Kundennr.** | Unsere Kundennummer beim Lieferanten (nur wenn beim Lieferanten hinterlegt) |
| **Bemerkungen** | Freitext |

> 💡 **Hinweis:** Wenn beim Lieferanten eine „Unsere Kundennummer" hinterlegt ist (📍 CRM → Adressen → Lieferant bearbeiten → Lieferantendaten), wird diese in der Bestelldetailansicht unter dem Lieferantennamen angezeigt.

#### Zusammenfassung

| Feld | Beschreibung |
|------|-------------|
| **Netto-Summe** | Summe aller Positionen netto |
| **Brutto-Summe** | Gesamtsumme brutto |
| **Positionen** | Anzahl der Bestellpositionen |

#### Aktionsleiste (nur bei passender Berechtigung)

- **„Bearbeiten"** — wechselt in den Bearbeitungsmodus (nur bei Entwurf)
- **„Bestellen"** — öffnet den Bestelldialog (nur bei Entwurf)
- **„Stornieren"** — storniert die Bestellung (bei Entwurf oder Bestellt)
- **„PDF erstellen"** — generiert ein Bestell-PDF und öffnet es in einem neuen Tab. Das PDF enthält: Firmenlogo, Absenderzeile, Lieferantenadresse, Bestellnummer, Datum, Liefertermine, „Unsere Kundennr." (wenn hinterlegt), Positionstabelle, Netto-/Brutto-Summen, Bemerkungen und Unterschriftenzeile. Während der Generierung zeigt der Button „Lade PDF..." mit Ladeanimation.

---

### 16.4 Positionen verwalten

Unterhalb der Kopfdaten befindet sich die **Positionstabelle**. Es gibt drei Positionstypen:

| Positionstyp | Beschreibung |
|-------------|-------------|
| **Artikel** | Standardposition mit Artikelstamm-Referenz |
| **Freitext** | Position ohne Artikelstamm — für einmalige Sonderbestellungen (mit Preis) |
| **Textzeile** | Reine Textzeile ohne Preis/Menge — z. B. Lieferhinweise, Garantiebedingungen |

#### Positionstabelle

| Spalte | Beschreibung |
|--------|-------------|
| **#** | Laufende Nummer (sortOrder) |
| **Artikel** | Artikelbezeichnung + Artikelnummer (bei Artikel-Positionen) oder Freitext-Bezeichnung (bei Freitext/Textzeilen) |
| **Lief.-Art.-Nr.** | Lieferanten-Artikelnummer (nur bei Artikel-Positionen) |
| **Beschreibung** | Zusätzliche Beschreibung |
| **Menge** | Bestellmenge (nicht bei Textzeilen) |
| **Einheit** | Mengeneinheit (nicht bei Textzeilen) |
| **Einzelpreis** | Einkaufspreis pro Einheit in EUR (nicht bei Textzeilen) |
| **Fixkosten** | Einmalige Fixkosten (nicht bei Textzeilen) |
| **Gesamt** | Berechneter Gesamtpreis (nicht bei Textzeilen — „—") |
| **MwSt** | Mehrwertsteuersatz in % (nicht bei Textzeilen) |
| **Aktionen** | Bearbeiten / Löschen (nur bei Entwurf) |

Bei bestellten Bestellungen (nicht ENTWURF) wird zusätzlich die Spalte **„Geliefert"** mit der empfangenen Menge angezeigt.

> 💡 **Textzeilen** werden bei der Summenberechnung ignoriert — sie dienen nur als Hinweistext auf der Bestellung.

#### Position hinzufügen

1. 📍 **„Position hinzufügen"** (unterhalb der Tabelle)
2. Inline-Zeile erscheint in der Tabelle mit einem **Modus-Selektor** (links):
   - **Artikel/Freitext** (Standard) — kombiniertes Eingabefeld:
     - Artikelsuche per Autocomplete: Artikel aus dem Stamm auswählen → **Artikel-Position**
     - Freitext tippen und bestätigen (Enter oder „Freitext: ..." im Dropdown wählen) → **Freitext-Position**
   - **Textzeile** — nur ein Textfeld für Hinweistexte (kein Preis, keine Menge)

**Bei Artikel-Position:**
   - **Artikel** (Pflicht) — Artikelauswahl (Suchfeld mit Autocomplete)
   - **Menge** (Pflicht) — Stückzahl
   - **Einzelpreis** — wird automatisch befüllt aus der Lieferantenzuordnung oder dem Artikel-EK-Preis
   - **Einheit** — wird automatisch befüllt
   - **Fixkosten** (optional)

**Bei Freitext-Position:**
   - **Bezeichnung** (Pflicht) — Freitext-Bezeichnung
   - **Menge** (Pflicht) — Stückzahl
   - **Einzelpreis** (Pflicht) — manuell eingeben
   - **Einheit** (optional)
   - **Fixkosten** (optional)

**Bei Textzeile:**
   - **Text** (Pflicht) — Hinweistext (z. B. Lieferbedingungen, Garantietexte)

3. 📍 **„Speichern"** (✓-Button)
4. ✅ Position erscheint in der Tabelle, Summen werden automatisch neu berechnet

> 💡 **Auto-Befüllung:** Wenn im Artikelstamm eine Lieferantenzuordnung für den Lieferanten der Bestellung existiert, werden Einzelpreis, Einheit und Lieferanten-Artikelnummer automatisch vorausgefüllt. Ohne Zuordnung wird der Standard-EK-Preis des Artikels verwendet.

> 💡 **Wareneingang:** Beim Wareneingang werden nur Artikel-Positionen angezeigt. Freitext- und Text-Positionen erscheinen nicht im Wareneingangs-Terminal.

#### Position bearbeiten / löschen

- 📍 Stift-Symbol → Inline-Bearbeitungsmodus
- 📍 Papierkorb-Symbol → Position wird sofort entfernt, Summen neu berechnet

⚠️ Positionen können nur bei Bestellungen im Status **Entwurf** hinzugefügt, bearbeitet oder gelöscht werden.

---

### 16.5 Bestellung senden (Bestellen)

1. 📍 Detailseite → **„Bestellen"**
2. ✅ Dialog öffnet sich: „Bestellung senden"
3. Felder:
   - **Bestellmethode** (Pflicht, Dropdown): Telefon / E-Mail / Fax / Druck
   - **Vermerk** (optional) — z. B. Name des Gesprächspartners, Datum des Telefonats
4. 📍 **„Bestellen"** (im Dialog)
5. ✅ Status wechselt zu **Bestellt**, Bestelldatum wird auf „jetzt" gesetzt
6. ✅ Bestellmethode und Vermerk werden gespeichert
7. ✅ Positionen sind ab jetzt gesperrt (keine Änderung mehr möglich)

⚠️ Eine Bestellung kann nur aus dem Status **Entwurf** versendet werden.

⚠️ Die Bestellung muss mindestens eine Position enthalten, sonst wird der Versand abgelehnt.

---

### 16.6 Bestellung stornieren

1. 📍 ⋯-Menü in der Bestellliste → **„Stornieren"** oder Detailseite → **„Stornieren"**
2. ✅ Bestätigungsdialog erscheint
3. 📍 **„Stornieren"** bestätigen
4. ✅ Status wechselt zu **Storniert**

⚠️ Stornierung ist möglich aus den Status **Entwurf** und **Bestellt**. Bereits vollständig gelieferte oder bereits stornierte Bestellungen können nicht mehr storniert werden.

---

### 16.7 Nachbestellvorschläge

**Was ist es?** Die Nachbestellvorschläge zeigen alle Artikel, deren aktueller Lagerbestand unter den konfigurierten Mindestbestand gefallen ist. Aus diesen Vorschlägen können mit wenigen Klicks Bestellungen erzeugt werden.

📍 Seitenleiste → **Lager** → **Bestellungen** → Toolbar-Button **„Nachbestellvorschläge"**

Oder direkt: 📍 `/warehouse/purchase-orders/suggestions`

✅ Tabelle mit Artikeln unter Mindestbestand

#### Vorschlagstabelle

| Spalte | Beschreibung |
|--------|-------------|
| **☐** | Checkbox zur Auswahl |
| **Artikel** | Artikelname und -nummer |
| **Akt. Bestand** | Aktueller Lagerbestand |
| **Mindestbestand** | Konfigurierter Mindestbestand |
| **Fehlmenge** | Mindestbestand − Aktueller Bestand |
| **Lieferant** | Primärer Lieferant des Artikels |
| **Vorgeschl. Menge** | Maximum aus Fehlmenge und Standard-Bestellmenge des Lieferanten |
| **Einzelpreis** | Einkaufspreis des Lieferanten |

**Filter:**
- **Lieferantenfilter** (Dropdown): Alle Lieferanten oder ein bestimmter Lieferant

**Aktionen:**
- **„Alle auswählen"** / **„Auswahl aufheben"** — Alle Artikel markieren / demarkieren
- **„Bestellung erstellen"** — Erstellt eine neue Bestellung (im Status Entwurf) für den ausgewählten Lieferanten mit allen markierten Artikeln als Positionen

> 💡 **Hinweis:** Wenn Artikel verschiedener Lieferanten ausgewählt werden, werden automatisch separate Bestellungen pro Lieferant erzeugt.

#### Bestellung aus Vorschlägen erstellen

1. 📍 Artikel per Checkbox auswählen
2. 📍 **„Bestellung erstellen"**
3. ✅ Toast: „Bestellung erstellt"
4. ✅ Navigation zur neuen Bestellung
5. ✅ Positionen mit vorgeschlagenen Mengen und Preisen bereits befüllt

---

### 16.8 Status-Workflow

Bestellungen durchlaufen folgenden Workflow:

```
Entwurf → Bestellt → Teilweise geliefert → Vollständig geliefert
   ↓          ↓
Storniert  Storniert
```

| Status | Bedeutung | Positionen änderbar? |
|--------|-----------|---------------------|
| **Entwurf** | Bestellung wird vorbereitet | ✅ Ja |
| **Bestellt** | An Lieferant gesendet | ❌ Nein (nur empfangene Menge über Wareneingang) |
| **Teilweise geliefert** | Lieferung ist unvollständig eingegangen | ❌ Nein |
| **Vollständig geliefert** | Alle Positionen vollständig geliefert | ❌ Nein |
| **Storniert** | Bestellung wurde storniert | ❌ Nein |

---

### 16.9 Praxisbeispiel: Einkauf von Verbrauchsmaterial bei einem Lieferanten

**Szenario:** Die Schreinerei aus dem Artikelstamm-Beispiel (Kapitel 14.4) muss Schrauben nachbestellen. Der Bestand der „Eichenholz-Platte" ist unter den Mindestbestand gefallen. Der Lieferant „Holzhandel Süd GmbH" soll die Ware liefern.

**Voraussetzungen:**
- Warehouse-Modul ist aktiviert
- Lieferant „Holzhandel Süd GmbH" ist als Adresse mit Typ „Lieferant" im CRM angelegt
- Artikel „Eichenholz-Platte" hat Bestandsführung aktiviert, Mindestbestand = 10, aktueller Bestand = 3
- Optional: Lieferantenzuordnung im Artikelstamm hinterlegt (Tab „Lieferanten")

**Schritt 1 — Nachbestellvorschläge prüfen**

1. 📍 Seitenleiste → **Lager** → **Bestellungen**
2. 📍 Toolbar → **„Nachbestellvorschläge"**
3. ✅ Tabelle zeigt „Eichenholz-Platte" mit:
   - Akt. Bestand: 3
   - Mindestbestand: 10
   - Fehlmenge: 7
   - Vorgeschl. Menge: 20 (Standard-Bestellmenge des Lieferanten, falls höher als Fehlmenge)

**Schritt 2 — Bestellung aus Vorschlag erstellen**

1. ☑️ Checkbox bei „Eichenholz-Platte" aktivieren
2. 📍 **„Bestellung erstellen"**
3. ✅ Toast: „Bestellung erstellt"
4. ✅ Neue Bestellung BES-1 im Status Entwurf wird angezeigt
5. ✅ Position mit Eichenholz-Platte, Menge 20, EK-Preis aus Lieferantenzuordnung

**Schritt 3 — Bestellung prüfen und ergänzen**

1. ✅ Detailseite zeigt Kopfdaten: Lieferant „Holzhandel Süd GmbH", Status „Entwurf"
2. Optional: 📍 **„Position hinzufügen"** → weiteren Artikel ergänzen
3. ✅ Summen werden automatisch aktualisiert

**Schritt 4 — Bestellung an Lieferanten senden**

1. 📍 **„Bestellen"**
2. ✅ Dialog: Bestellmethode wählen → **E-Mail**
3. Vermerk: „Telefonat mit Fr. Schmidt, Lieferung bis KW 14 zugesagt"
4. 📍 **„Bestellen"** (Bestätigung)
5. ✅ Status wechselt zu **Bestellt**
6. ✅ Bestelldatum = heutiges Datum
7. ✅ Positionen sind nun gesperrt

**Schritt 5 — Bestell-PDF erstellen**

1. 📍 **„PDF erstellen"** (in der Aktionsleiste)
2. ✅ Button zeigt „Lade PDF..." mit Ladeanimation
3. ✅ PDF öffnet sich in neuem Browser-Tab
4. ✅ PDF enthält: Firmenlogo, Lieferantenadresse „Holzhandel Süd GmbH", Bestellnummer BES-1, Positionstabelle mit Eichenholz-Platte, Summen, Unterschriftenzeile

**Schritt 6 — Ergebnis prüfen**

1. 📍 Seitenleiste → **Lager** → **Bestellungen**
2. ✅ BES-1 in der Liste mit Status „Bestellt", Bestelldatum ausgefüllt
3. ✅ Liefertermin, Bestellmethode und Vermerk in der Detailansicht sichtbar

---

## 17. Lagerverwaltung — Wareneingang

### 17.1 Wareneingangs-Terminal

**Was ist es?** Das Wareneingangs-Terminal ist ein geführter 4-Schritte-Assistent, über den eingehende Lieferungen gegen bestehende Bestellungen verbucht werden. Beim Wareneingang wird der Lagerbestand der gelieferten Artikel automatisch erhöht und eine Bestandsbewegung vom Typ „Wareneingang" (GOODS_RECEIPT) erzeugt.

**Wozu dient es?** Durch die Buchung am Terminal wird der Bestand in Echtzeit aktualisiert. Teillieferungen werden unterstützt — eine Bestellung kann schrittweise abgearbeitet werden, wobei der Status automatisch von „Bestellt" über „Teilweise geliefert" zu „Vollständig geliefert" wechselt.

⚠️ Modul: Das Warehouse-Modul muss für den Mandanten aktiviert sein

⚠️ Berechtigung: „Lagerbestand verwalten" (`wh_stock.manage`)

📍 Seitenleiste → **Lager** → **Wareneingang**

#### Schritt 1 — Lieferant wählen

1. 📍 Das Terminal zeigt alle Lieferanten mit offenen Bestellungen
2. Einen Lieferanten auswählen oder **„Alle Lieferanten"** für die Gesamtansicht
3. ✅ Das Terminal wechselt zu Schritt 2

#### Schritt 2 — Bestellung wählen

1. 📍 Alle offenen Bestellungen des gewählten Lieferanten werden angezeigt
2. Jede Zeile zeigt: Bestellnummer, Lieferant, Status (Bestellt / Teilweise geliefert), Positionsanzahl
3. Eine Bestellung anklicken
4. ✅ Das Terminal wechselt zu Schritt 3

#### Schritt 3 — Liefermengen eingeben

1. 📍 Alle Positionen der Bestellung werden mit Bestell-, Empfangs- und Restmenge angezeigt
2. Pro Position die tatsächlich gelieferte Menge eintragen
3. Optional: **„Alle empfangen"** setzt alle Positionen auf die jeweilige Restmenge
4. **„Alle zurücksetzen"** setzt alle Mengen auf 0
5. 📍 **„Weiter"**

#### Schritt 4 — Bestätigen

1. 📍 Zusammenfassung: Bestellnummer und alle Positionen mit Empfangsmengen
2. ✅ Grüne Mengenangaben zeigen die Zugangsmengen (z. B. +20)
3. 📍 **„Wareneingang buchen"**
4. ✅ Toast: „Wareneingang gebucht"
5. ✅ Artikelbestände werden erhöht
6. ✅ Bestandsbewegungen vom Typ GOODS_RECEIPT werden erzeugt
7. ✅ Bestellstatus wird aktualisiert (Teilweise/Vollständig geliefert)

### 17.2 Bestandsbewegungen

**Was ist es?** Die Bestandsbewegungen zeigen eine chronologische Liste aller Veränderungen im Lagerbestand: Wareneingänge, Entnahmen, Korrekturen und Inventuren. Jede Bewegung protokolliert Artikelnummer, Menge, vorherigen und neuen Bestand sowie den Auslöser.

📍 Seitenleiste → **Lager** → **Bestandsbewegungen**

| Spalte | Beschreibung |
|--------|-------------|
| **Datum** | Zeitpunkt der Bewegung |
| **Artikel** | Artikelnummer und Bezeichnung |
| **Typ** | GOODS_RECEIPT, WITHDRAWAL, ADJUSTMENT, INVENTORY, RETURN, DELIVERY_NOTE |
| **Menge** | Positive Menge = Zugang (grün), negative Menge = Abgang (rot) |
| **Vorheriger Bestand** | Bestand vor der Bewegung |
| **Neuer Bestand** | Bestand nach der Bewegung |
| **Referenz** | Verknüpfte Bestellung, Auftrag oder Beleg |

**Filter:** Artikel, Typ, Zeitraum (Von/Bis)

### 17.3 Praxisbeispiel: Bestellung entgegennehmen

**Szenario:** Die Lieferung der Bestellung BES-1 (Kapitel 16.9) trifft ein. Es werden 15 von 20 bestellten Eichenholz-Platten geliefert (Teillieferung).

1. 📍 Seitenleiste → **Lager** → **Wareneingang**
2. 📍 Lieferant **„Holzhandel Süd GmbH"** anklicken
3. 📍 Bestellung **BES-1** anklicken
4. Bei Position „Eichenholz-Platte" die Menge **15** eintragen
5. 📍 **„Weiter"**
6. ✅ Zusammenfassung zeigt: Eichenholz-Platte +15
7. 📍 **„Wareneingang buchen"**
8. ✅ Toast: „Wareneingang gebucht"
9. ✅ Bestand der Eichenholz-Platte: 3 → 18
10. ✅ BES-1 wechselt zu **„Teilweise geliefert"** (5 noch offen)
11. 📍 Seitenleiste → **Lager** → **Bestandsbewegungen** → Eintrag vom Typ GOODS_RECEIPT mit +15

---

## 18. Lagerverwaltung — Lagerentnahmen

### 18.1 Entnahme-Terminal

**Was ist es?** Das Entnahme-Terminal ist ein geführter 3-Schritte-Assistent, über den Artikel aus dem Lager entnommen werden. Jede Entnahme erzeugt eine Bestandsbewegung vom Typ „Entnahme" (WITHDRAWAL) mit negativer Menge und reduziert den Artikelbestand automatisch.

**Wozu dient es?** Entnahmen dokumentieren den Materialverbrauch und können einem Auftrag, einem Lieferschein oder einer Maschine zugeordnet werden. So entsteht eine lückenlose Nachverfolgung: Welcher Artikel wurde wann, in welcher Menge und für welchen Zweck entnommen.

⚠️ Modul: Das Warehouse-Modul muss für den Mandanten aktiviert sein

⚠️ Berechtigung: „Lagerbestand verwalten" (`wh_stock.manage`)

📍 Seitenleiste → **Lager** → **Lagerentnahmen** → Tab **„Neue Entnahme"**

#### Schritt 1 — Referenz wählen

1. 📍 Referenztyp auswählen (Karten mit Icon):

| Referenztyp | Beschreibung |
|-------------|-------------|
| **Auftrag** | Entnahme einem Terp-Auftrag zuordnen |
| **Lieferschein** | Entnahme einem Lieferschein/Beleg zuordnen |
| **Maschine/Gerät** | Entnahme einer Maschine oder einem Gerät zuordnen |
| **Ohne Referenz** | Direkte Entnahme ohne Zuordnung |

2. Bei Auftrag/Lieferschein/Maschine: Referenznummer eingeben
3. Optional: Bemerkungen hinzufügen
4. 📍 **„Weiter"**

#### Schritt 2 — Artikel auswählen

1. 📍 Artikel über die Suchleiste suchen (Artikelnummer oder Name)
2. Artikel werden der Entnahmeliste hinzugefügt
3. Pro Artikel die Entnahmemenge eingeben

| Spalte | Beschreibung |
|--------|-------------|
| **Artikelnr.** | Artikelnummer (Badge) |
| **Artikel** | Artikelbezeichnung |
| **Aktueller Bestand** | Verfügbare Menge im Lager |
| **Entnahmemenge** | Gewünschte Entnahmemenge |
| **Einheit** | Mengeneinheit (Stk, kg, m, ...) |

⚠️ Die Entnahmemenge darf den aktuellen Bestand nicht überschreiten. Bei Überschreitung erscheint eine rote Warnung „Nicht genügend Bestand".

⚠️ Fällt der Bestand durch die Entnahme unter den Mindestbestand, erscheint ein gelber Hinweis „Bestand wird unter Mindestbestand fallen".

4. Mehrere Artikel können in einer Entnahme zusammengefasst werden (Sammelentnahme)
5. 📍 **„Weiter"**

#### Schritt 3 — Entnahme bestätigen

1. 📍 Zusammenfassung: Referenz-Badge, alle Artikel mit Entnahmemengen (rot, z. B. −5)
2. Gesamtmenge wird angezeigt
3. Falls Bemerkungen eingegeben wurden, werden diese angezeigt
4. 📍 **„Jetzt entnehmen"** (roter Button)
5. ✅ Toast: „Entnahme erfolgreich gebucht" (oder „X Artikel entnommen" bei Sammelentnahme)
6. ✅ Artikelbestände werden reduziert
7. ✅ Bestandsbewegungen vom Typ WITHDRAWAL mit negativer Menge werden erzeugt
8. ✅ Terminal wird zurückgesetzt

### 18.2 Entnahme-Verlauf

**Was ist es?** Der Verlauf zeigt eine chronologische Liste aller Lagerentnahmen, Lieferschein-Buchungen und Stornierungen. Jeder Eintrag zeigt Datum, Artikel, Menge, Typ (Entnahme, Lieferschein oder Storno) und Referenz.

📍 Seitenleiste → **Lager** → **Lagerentnahmen** → Tab **„Verlauf"**

| Spalte | Beschreibung |
|--------|-------------|
| **Datum** | Zeitpunkt der Entnahme |
| **Artikel** | Artikelnummer (Badge) und Bezeichnung |
| **Menge** | Negative Menge = Entnahme (rot), positive Menge = Storno (grün) |
| **Typ** | „Entnahme" oder „Storno" (Badge mit Icon) |
| **Referenz** | Icon + ID des verknüpften Auftrags, Lieferscheins oder Maschine |
| **Aktionen** | „Stornieren"-Button (nur bei Entnahmen, erscheint bei Hover) |

**Filter:** Zeitraum (Von/Bis). Pagination bei mehr als 25 Einträgen.

### 18.3 Entnahme stornieren

**Was ist es?** Eine Stornierung kehrt eine Entnahme um: Der entnommene Bestand wird wiederhergestellt und eine Gegenbuchung (positive Menge) erzeugt. Im Verlauf erscheint die Stornierung als eigener Eintrag vom Typ „Storno".

1. 📍 Tab **„Verlauf"** → bei der zu stornierenden Entnahme auf **„Stornieren"** klicken
2. ✅ Bestätigungsdialog: „Möchten Sie diese Entnahme wirklich stornieren? Der Bestand wird wiederhergestellt."
3. 📍 **„Stornieren"** bestätigen
4. ✅ Toast: „Entnahme storniert"
5. ✅ Artikelbestand wird um die stornierte Menge erhöht
6. ✅ Im Verlauf erscheint ein neuer Eintrag mit positiver Menge und Typ „Storno"

### 18.4 Praxisbeispiel: Material für einen Auftrag entnehmen

**Szenario:** Ein Schreiner entnimmt 5 Eichenholz-Platten aus dem Lager für den Kundenauftrag „Einbauschrank Familie Müller". Der aktuelle Bestand beträgt 18 Platten (nach dem Wareneingang aus Kapitel 17.3). Der Mindestbestand ist 10.

1. 📍 Seitenleiste → **Lager** → **Lagerentnahmen**
2. ✅ Tab „Neue Entnahme" ist aktiv, Schritt-Anzeige zeigt „1 Referenz wählen"

**Schritt 1 — Referenz wählen**

3. 📍 Karte **„Auftrag"** anklicken
4. ✅ Karte wird mit blauem Rahmen hervorgehoben, Häkchen erscheint
5. Auftragsnummer eingeben: **AUF-001** (Einbauschrank Müller)
6. Optional: Bemerkung: „Material für Korpus"
7. 📍 **„Weiter"**

**Schritt 2 — Artikel auswählen**

8. ✅ Schrittanzeige zeigt „2 Artikel auswählen"
9. ✅ Unter dem Titel wird die Referenz angezeigt: Auftrag: AUF-001
10. 📍 Im Suchfeld **„Eiche"** eingeben
11. ✅ Dropdown zeigt „ART-3 Eichenholz-Platte"
12. 📍 Artikel anklicken
13. ✅ Artikel erscheint in der Tabelle mit Bestand 18 und Entnahmemenge 1
14. Entnahmemenge auf **5** ändern
15. ✅ Gelber Hinweis: „Bestand wird unter Mindestbestand fallen" (18 − 5 = 13 > 10, daher kein Hinweis in diesem Fall)
16. 📍 **„Weiter"**

**Schritt 3 — Bestätigen**

17. ✅ Referenz-Badge: Auftrag AUF-001
18. ✅ Tabelle: Eichenholz-Platte −5 Stk
19. ✅ Gesamtmenge: 5
20. ✅ Bemerkung: „Material für Korpus"
21. 📍 **„Jetzt entnehmen"**
22. ✅ Toast: „Entnahme erfolgreich gebucht"
23. ✅ Terminal wird zurückgesetzt

**Ergebnis prüfen**

24. 📍 Tab **„Verlauf"** anklicken
25. ✅ Eintrag: Eichenholz-Platte, −5, Typ „Entnahme", Referenz: Auftrag AUF-001
26. 📍 Seitenleiste → **Lager** → **Artikel** → Eichenholz-Platte
27. ✅ Aktueller Bestand: 13 (vorher 18)
28. 📍 Seitenleiste → **Lager** → **Bestandsbewegungen**
29. ✅ Eintrag: WITHDRAWAL, Eichenholz-Platte, −5, Bestand 18 → 13

---

## 19. Lagerverwaltung — Lieferantenrechnungen

### 19.1 Rechnungsliste

**Was ist es?** Das Lieferantenrechnungsmodul verwaltet Eingangsrechnungen von Lieferanten: Vom Erfassen der Rechnung über die Zahlungsverfolgung mit Skonto bis zur vollständigen Begleichung. Jede Rechnung kann optional mit einer Bestellung verknüpft werden.

**Wozu dient es?** Lieferantenrechnungen ermöglichen die lückenlose Dokumentation aller Verbindlichkeiten gegenüber Lieferanten. Fälligkeitsdaten, Skonto-Fristen und offene Beträge werden übersichtlich dargestellt. Zusammenfassungskarten zeigen auf einen Blick die offenen, überfälligen und bezahlten Beträge.

⚠️ Modul: Das Warehouse-Modul muss für den Mandanten aktiviert sein

⚠️ Berechtigung: „Lieferantenrechnungen anzeigen" (`wh_supplier_invoices.view`) zum Lesen, „Lieferantenrechnungen erstellen" (`wh_supplier_invoices.create`) zum Anlegen, „Lieferantenrechnungen bearbeiten" (`wh_supplier_invoices.edit`) zum Bearbeiten/Stornieren, „Zahlungen erfassen" (`wh_supplier_invoices.pay`) zum Buchen von Zahlungen

📍 Seitenleiste → **Lager** → **Lieferantenrechnungen**

✅ Seite mit Zusammenfassungskarten, Rechnungstabelle, Suchfeld und Statusfilter

#### Zusammenfassungskarten

Oberhalb der Tabelle werden bis zu drei Karten angezeigt:

| Karte | Beschreibung |
|-------|-------------|
| **Offen gesamt** | Summe aller offenen Beträge und Anzahl der Rechnungen |
| **Überfällig** | Summe überfälliger Beträge (rot hervorgehoben) und Anzahl |
| **Bezahlt (Monat)** | Im aktuellen Monat bezahlte Summe |

#### Rechnungstabelle

| Spalte | Beschreibung |
|--------|-------------|
| **Nummer** | Rechnungsnummer des Lieferanten (monospace) |
| **Lieferant** | Firmenname des Lieferanten |
| **Rechnungsdatum** | Datum der Rechnung |
| **Fällig am** | Fälligkeitsdatum — rot hervorgehoben wenn überfällig |
| **Brutto** | Bruttobetrag in EUR |
| **Offener Betrag** | Noch nicht bezahlter Betrag |
| **Status** | Badge: Offen (gelb), Teilweise bezahlt (orange), Bezahlt (grün), Storniert (rot) |
| **Aktionen** | ⋯-Menü: Anzeigen, Bearbeiten (nur Offen), Zahlung erfassen, Stornieren |

**Filter:**
- **Suchfeld**: Durchsucht Rechnungsnummer und Lieferantenname
- **Statusfilter** (Dropdown): Alle Status / Offen / Teilweise bezahlt / Bezahlt / Storniert

**Pagination:** Bei mehr als 25 Rechnungen mit Vor-/Zurück-Buttons.

---

### 19.2 Neue Lieferantenrechnung anlegen

1. 📍 **„Neue Rechnung"** (oben rechts)
2. ✅ Seitenleiste (Sheet) öffnet sich

Felder ausfüllen:

| Feld | Pflicht | Typ | Beschreibung |
|------|---------|-----|-------------|
| **Lieferant** | Ja | Dropdown | Nur Adressen vom Typ „Lieferant" aus dem CRM |
| **Bestellung** | Nein | Dropdown | Verknüpfung mit einer Bestellung des gewählten Lieferanten (erst aktiv nach Lieferantenauswahl) |
| **Rechnungsnummer** | Ja | Text | Rechnungsnummer des Lieferanten (manuell eingeben) |
| **Rechnungsdatum** | Ja | Datum | Datum der Lieferantenrechnung |
| **Eingangsdatum** | Nein | Datum | Datum des Rechnungseingangs (Standard: heute) |
| **Netto** | Ja | Zahl | Nettobetrag |
| **MwSt.** | Ja | Zahl | Mehrwertsteuerbetrag |
| **Brutto** | — | Zahl | Wird automatisch berechnet (Netto + MwSt.), schreibgeschützt |
| **Zahlungsziel (Tage)** | Nein | Zahl | Anzahl Tage bis Fälligkeit. Wird automatisch aus Lieferanten-Stammdaten übernommen |
| **Fällig am** | Nein | Datum | Explizites Fälligkeitsdatum. Wird alternativ aus Rechnungsdatum + Zahlungsziel berechnet |
| **Skonto 1 (%)** | Nein | Zahl | Prozentsatz Skonto Stufe 1. Wird automatisch aus Lieferanten-Stammdaten übernommen |
| **Skonto 1 (Tage)** | Nein | Zahl | Tage für Skonto Stufe 1 |
| **Skonto 2 (%)** | Nein | Zahl | Prozentsatz Skonto Stufe 2 |
| **Skonto 2 (Tage)** | Nein | Zahl | Tage für Skonto Stufe 2 |
| **Bemerkungen** | Nein | Freitext | Interne Notizen |

3. 📍 **„Erstellen"**
4. ✅ Rechnung wird im Status „Offen" angelegt und in der Liste angezeigt

> 💡 **Hinweis:** Der Lieferant muss eine Steuernummer oder USt-IdNr. in seinen Stammdaten hinterlegt haben. Ist dies nicht der Fall, erscheint eine Warnung im Formular und die Rechnung kann serverseitig nicht gespeichert werden.

> 💡 **Hinweis:** Zahlungsbedingungen (Zahlungsziel, Skonto) werden bei Auswahl des Lieferanten automatisch aus dessen Stammdaten vorausgefüllt und können bei Bedarf angepasst werden.

---

### 19.3 Rechnungsdetailseite

📍 Zeile in der Rechnungstabelle anklicken → Detailseite

Die Detailseite zeigt alle Informationen zur Rechnung in mehreren Bereichen:

#### Kopfzeile

- Zurück-Button (Pfeil links)
- Rechnungsnummer als Überschrift
- Status-Badge
- Buttons: **„Bearbeiten"** (nur bei Status Offen), **„Zahlung erfassen"** (bei Offen oder Teilweise bezahlt), **„Stornieren"** (rot, solange nicht bereits storniert)

#### Karte „Rechnungsinformationen"

| Feld | Beschreibung |
|------|-------------|
| **Rechnungsnummer** | Nummer des Lieferanten (monospace) |
| **Lieferant** | Firmenname |
| **Bestellung** | Verknüpfte Bestellnummer (monospace) oder nicht angezeigt |
| **Rechnungsdatum** | Datum der Rechnung |
| **Eingangsdatum** | Datum des Eingangs |
| **Bemerkungen** | Freitext (sofern vorhanden) |

#### Karte „Zusammenfassung"

| Feld | Beschreibung |
|------|-------------|
| **Netto** | Nettobetrag |
| **MwSt.** | Mehrwertsteuerbetrag |
| **Brutto** | Bruttobetrag (fett) |
| **Bezahlt** | Summe aller aktiven Zahlungen (grün) |
| **Offener Betrag** | Restbetrag (fett, rot wenn überfällig) |
| **Fällig am** | Fälligkeitsdatum — mit „Überfällig"-Badge wenn überschritten |

#### Karte „Zahlungsbedingungen" (nur wenn vorhanden)

| Feld | Beschreibung |
|------|-------------|
| **Zahlungsziel** | Anzahl Tage |
| **Skonto 1** | Prozent / Tage (z. B. „3% / 10 Tage") |
| **Skonto 2** | Prozent / Tage (z. B. „2% / 20 Tage") |

#### Karte „Zahlungen"

Tabelle aller erfassten Zahlungen:

| Spalte | Beschreibung |
|--------|-------------|
| **Datum** | Zahlungsdatum |
| **Betrag** | Zahlungsbetrag in EUR |
| **Art** | „Überweisung" oder „Bar" |
| **Skonto** | Badge „Skonto" wenn Skonto-Eintrag |
| **Status** | Badge: „Aktiv" oder „Storniert" |
| **Bemerkungen** | Freitext oder „—" |
| **Aktionen** | Stornieren-Button (nur bei aktiven Zahlungen, die kein Skonto-Eintrag sind) |

---

### 19.4 Zahlung erfassen

1. 📍 Detailseite → **„Zahlung erfassen"**
2. ✅ Dialog öffnet sich

Felder ausfüllen:

| Feld | Pflicht | Typ | Beschreibung |
|------|---------|-----|-------------|
| **Zahlungsdatum** | Ja | Datum | Standard: heute |
| **Betrag** | Ja | Zahl | Wird mit dem offenen Betrag vorausgefüllt |
| **Zahlungsart** | Ja | Dropdown | Überweisung oder Bar (Standard: Überweisung) |
| **Skonto** | Nein | Checkbox | Nur sichtbar wenn Skonto-Bedingungen hinterlegt sind. Zeigt Prozent und Tage an. |
| **Bemerkungen** | Nein | Freitext | |

3. 📍 **„Erstellen"**
4. ✅ Zahlung wird erfasst
5. ✅ Rechnungsstatus wird automatisch aktualisiert: Teilzahlung → „Teilweise bezahlt", Vollzahlung → „Bezahlt"

> 💡 **Hinweis:** Bei Aktivierung der Skonto-Checkbox wird der Skonto-Betrag automatisch berechnet und als separater Eintrag verbucht. Es entstehen zwei Zahlungseinträge: die tatsächliche Zahlung und der Skonto-Abzug.

> 💡 **Hinweis:** Der Zahlungsbetrag darf den offenen Betrag nicht überschreiten.

---

### 19.5 Zahlung stornieren

1. 📍 Detailseite → Zahlungstabelle → **Stornieren-Button** (X-Icon) bei der gewünschten Zahlung
2. ✅ Bestätigungsdialog: „Möchten Sie diese Zahlung wirklich stornieren?"
3. 📍 **„Stornieren"** bestätigen
4. ✅ Zahlung wird als „Storniert" markiert
5. ✅ Falls die Zahlung einen Skonto-Eintrag hatte, wird dieser ebenfalls storniert
6. ✅ Rechnungsstatus wird automatisch zurückgesetzt (z. B. „Bezahlt" → „Teilweise bezahlt" → „Offen")

---

### 19.6 Rechnung stornieren

1. 📍 Detailseite → **„Stornieren"** (roter Button)
2. ✅ Bestätigungsdialog erscheint
3. 📍 **„Stornieren"** bestätigen
4. ✅ Status wird auf „Storniert" gesetzt
5. ✅ Rechnung kann nicht mehr bearbeitet oder bezahlt werden

> 💡 **Hinweis:** Alternativ kann eine Rechnung auch aus der Listenseite über das ⋯-Menü storniert werden (nur bei Status „Offen" oder „Teilweise bezahlt").

---

### 19.7 Status-Workflow

```
Offen → Teilweise bezahlt → Bezahlt
  ↓           ↓
Storniert   Storniert
```

| Status | Bedeutung | Badge-Farbe |
|--------|-----------|-------------|
| **Offen** | Rechnung erfasst, keine Zahlungen | Gelb |
| **Teilweise bezahlt** | Mindestens eine Zahlung, aber noch offener Betrag | Orange |
| **Bezahlt** | Vollständig beglichen (offener Betrag ≈ 0) | Grün |
| **Storniert** | Rechnung wurde storniert | Rot |

**Automatische Übergänge:**
- Offen → Teilweise bezahlt: Erste Zahlung, die nicht den vollen Betrag abdeckt
- Teilweise bezahlt → Bezahlt: Letzte Zahlung, die den Restbetrag begleicht
- Bezahlt → Teilweise bezahlt: Stornierung einer Zahlung bei zuvor vollständig bezahlter Rechnung
- Teilweise bezahlt → Offen: Stornierung aller Zahlungen

---

### 19.8 Praxisbeispiel: Lieferantenrechnung erfassen und bezahlen

**Szenario:** Die Schreinerei hat Eichenholz-Platten beim Lieferanten „Holz Müller GmbH" bestellt (Bestellung BES-1, siehe Kapitel 16.9). Die Ware wurde geliefert (Wareneingang, Kapitel 17.3). Nun trifft die Rechnung RE-2024-0815 über 1.190,00 EUR brutto (1.000,00 EUR netto + 190,00 EUR MwSt.) ein. Der Lieferant gewährt 3% Skonto bei Zahlung innerhalb von 10 Tagen, Zahlungsziel 30 Tage.

**Voraussetzungen:**
- Holz Müller GmbH ist als Lieferant im CRM angelegt mit Steuernummer oder USt-IdNr.
- Bestellung BES-1 existiert
- Benutzer hat die Berechtigungen `wh_supplier_invoices.create` und `wh_supplier_invoices.pay`

**Schritt 1 — Rechnung erfassen**

1. 📍 Seitenleiste → **Lager** → **Lieferantenrechnungen**
2. ✅ Rechnungsliste mit Zusammenfassungskarten wird angezeigt
3. 📍 **„Neue Rechnung"**
4. ✅ Sheet öffnet sich
5. **Lieferant**: „Holz Müller GmbH" auswählen
6. ✅ Zahlungsbedingungen werden automatisch aus den Stammdaten übernommen (Zahlungsziel: 30, Skonto 1: 3% / 10 Tage)
7. **Bestellung**: „BES-1" auswählen
8. **Rechnungsnummer**: „RE-2024-0815" eingeben
9. **Rechnungsdatum**: heutiges Datum
10. **Netto**: 1000,00
11. **MwSt.**: 190,00
12. ✅ Brutto wird automatisch auf 1.190,00 berechnet
13. 📍 **„Erstellen"**
14. ✅ Rechnung erscheint in der Liste mit Status „Offen"

**Schritt 2 — Zahlung mit Skonto erfassen**

15. 📍 Rechnung „RE-2024-0815" in der Tabelle anklicken
16. ✅ Detailseite zeigt: Brutto 1.190,00 EUR, Offener Betrag 1.190,00 EUR, Status „Offen"
17. 📍 **„Zahlung erfassen"**
18. ✅ Dialog öffnet sich, Betrag ist mit 1.190,00 vorausgefüllt
19. **Zahlungsart**: Überweisung (bereits ausgewählt)
20. ✅ Skonto-Checkbox ist sichtbar: „Skonto: 3% / 10 Tage"
21. 📍 Skonto-Checkbox aktivieren
22. 📍 **„Erstellen"**
23. ✅ Toast: „Zahlung erfasst"
24. ✅ In der Zahlungstabelle erscheinen zwei Einträge: die Überweisung und der Skonto-Abzug
25. ✅ Status wechselt zu „Bezahlt"
26. ✅ Offener Betrag zeigt 0,00 EUR

**Ergebnis prüfen**

27. 📍 Zurück zur Rechnungsliste (Pfeil-Button)
28. ✅ Rechnung „RE-2024-0815" hat Status „Bezahlt" (grüner Badge)
29. ✅ Offener Betrag zeigt 0,00 EUR
30. ✅ Zusammenfassungskarte „Bezahlt (Monat)" zeigt den bezahlten Betrag

---

## 20. Lagerverwaltung — Korrekturassistent

**Was ist es?** Der Korrekturassistent für die Warenwirtschaft ist ein Diagnose-Werkzeug, das automatisch Unstimmigkeiten im Lagerbestand und bei Bestellungen erkennt — z. B. negative Lagerbestände, doppelte Wareneingänge oder überfällige Bestellungen. Er zeigt eine filterbare Liste aller erkannten Probleme mit Schweregrad-Einstufung.

**Wozu dient es?** Ohne regelmäßige Prüfung können sich Fehler in der Lagerbuchhaltung unbemerkt ansammeln — z. B. durch doppelt gebuchte Wareneingänge, fehlende Bestellzuordnungen oder Bestandsdifferenzen. Der Korrekturassistent erkennt diese Probleme automatisch und meldet sie, bevor sie zu falschen Bestellungen oder Inventurdifferenzen führen.

⚠️ Berechtigung: „WH-Korrekturen anzeigen" (`wh_corrections.view`) zum Lesen, „WH-Korrekturen verwalten" (`wh_corrections.manage`) zum Bearbeiten, „WH-Korrekturen ausführen" (`wh_corrections.run`) zum Starten eines Prüflaufs

📍 Seitenleiste → **Lager** → **Korrekturassistent**

### 20.1 Dashboard

✅ Drei KPI-Karten nebeneinander:

| Karte | Farbe | Inhalt |
|-------|-------|--------|
| **Offene Fehler** | Rot (border) | Anzahl offener Meldungen mit Schweregrad ERROR |
| **Warnungen** | Gelb (border) | Anzahl offener Meldungen mit Schweregrad WARNING |
| **Hinweise** | Standard | Anzahl offener Meldungen mit Schweregrad INFO |

✅ Darunter eine Zeile mit:
- Links: **Letzter Prüflauf** — Datum/Uhrzeit und Anzahl gefundener Probleme (oder „Noch kein Prüflauf durchgeführt")
- Rechts: Button **„Prüfung starten"** (nur sichtbar mit Berechtigung `wh_corrections.run`)

📍 **„Prüfung starten"** klicken → Alle Prüfregeln werden ausgeführt → KPI-Karten und Meldungsliste aktualisieren sich automatisch

⚠️ Während der Prüflauf läuft, dreht sich ein Lade-Symbol im Button. Der Button ist während des Laufs deaktiviert.

### 20.2 Meldungen

✅ Tab **„Meldungen"** (Standardansicht) zeigt eine Tabelle aller erkannten Probleme.

**Filter:** Status (Standard: Offen), Schweregrad (Alle/Fehler/Warnung/Hinweis), Code (alle Prüfregeln)

✅ Tabelle mit Spalten: Checkbox (für Mehrfachauswahl), Schweregrad (farbiges Badge), Code (monospace), Meldung, Datum, Status (Badge: Offen/Erledigt/Ignoriert)

**Prüfregeln und ihre Codes:**

| Code | Schweregrad | Bedeutung |
|------|-------------|-----------|
| `NEGATIVE_STOCK` | Fehler | Negativer Lagerbestand bei einem Artikel mit Bestandsführung |
| `DUPLICATE_RECEIPT` | Warnung | Doppelter Wareneingang (gleicher Artikel + gleiche Menge + gleiche Bestellung innerhalb 1 Stunde) |
| `OVERDUE_ORDER` | Warnung | Bestellung mit Status „Bestellt" und bestätigtem Liefertermin mehr als 3 Tage überfällig |
| `UNMATCHED_RECEIPT` | Hinweis | Wareneingang ohne Zuordnung zu einer Bestellung |
| `STOCK_MISMATCH` | Fehler | Aktueller Bestand weicht von der Summe aller Bestandsbewegungen ab |
| `LOW_STOCK_NO_ORDER` | Warnung | Artikel unter Mindestbestand, aber keine offene Bestellung (Entwurf oder Bestellt) vorhanden |

⚠️ Eine Meldung wird nur einmal pro Artikel + Code erstellt (Deduplizierung). Ist bereits eine offene Meldung für denselben Artikel und Code vorhanden, wird keine neue angelegt.

### 20.3 Meldung bearbeiten

📍 Zeile in der Meldungstabelle anklicken → **Seitenpanel (Sheet)** öffnet sich rechts

✅ Das Panel zeigt:
- **Schweregrad** und **Status** als Badges
- **Code** (monospace)
- **Meldung** — menschenlesbare Beschreibung des Problems
- **Erstellt am** — Zeitpunkt der Erkennung
- **Artikel-Link** — „Zum Artikel" (klickbar, öffnet Artikeldetailseite) — nur wenn ein Artikel betroffen ist
- **Bestell-Link** — „Zur Bestellung" (klickbar, öffnet Bestelldetailseite) — nur bei überfälligen Bestellungen
- **Details** — Zusätzliche Informationen als Schlüssel-Wert-Paare (z. B. erwarteter vs. tatsächlicher Bestand)

✅ Wenn die Meldung bereits erledigt oder ignoriert wurde:
- Infobox mit Status, Datum der Bearbeitung und ggf. Bemerkung

✅ Für offene Meldungen (mit Berechtigung `wh_corrections.manage`):
- **Bemerkung** — optionales Textfeld
- Button **„Als erledigt markieren"** — setzt Status auf RESOLVED
- Button **„Ignorieren"** — setzt Status auf DISMISSED

⚠️ „Als erledigt markieren" bedeutet: Das Problem wurde behoben (z. B. Bestand korrigiert). „Ignorieren" bedeutet: Das Problem ist bekannt und wird bewusst nicht behoben.

### 20.4 Massenbearbeitung

✅ In der Meldungstabelle können mehrere Meldungen per Checkbox ausgewählt werden.

📍 Eine oder mehrere Checkboxen aktivieren → Aktionsleiste erscheint oberhalb der Tabelle

✅ Die Aktionsleiste zeigt:
- Anzahl ausgewählter Meldungen (z. B. „3 ausgewählt")
- Button **„Als erledigt markieren"** — markiert alle ausgewählten Meldungen als RESOLVED

⚠️ Die Checkbox im Tabellenkopf wählt alle sichtbaren Meldungen auf der aktuellen Seite aus/ab.

### 20.5 Prüfläufe

✅ Tab **„Prüfläufe"** zeigt eine Tabelle aller bisherigen Prüfläufe.

✅ Tabelle mit Spalten: Gestartet, Abgeschlossen, Auslöser (Badge: „Manuell" oder „Automatisch"), Prüfungen (Anzahl), Probleme (Anzahl, rot hervorgehoben wenn > 0), Dauer

⚠️ Prüfläufe werden bei jedem manuellen Start und bei jedem automatischen Cron-Lauf protokolliert.

### 20.6 Automatische Prüfung (Cron)

Der Korrekturassistent läuft automatisch **täglich um 06:00 Uhr** (UTC) für alle aktiven Mandanten. Es ist keine manuelle Konfiguration erforderlich.

✅ Automatische Prüfläufe erscheinen im Tab „Prüfläufe" mit dem Auslöser-Badge „Automatisch".

💡 **Hinweis:** Bei Bedarf kann die Prüfung jederzeit zusätzlich manuell über den Button „Prüfung starten" ausgelöst werden. Neue Meldungen werden nur für bisher unbekannte Probleme erstellt (keine Duplikate).

### 20.7 Praxisbeispiel: Bestandsprüfung vor Inventur

**Szenario:** Vor der jährlichen Inventur sollen alle Bestandsdifferenzen und offenen Probleme in der Warenwirtschaft erkannt und bereinigt werden.

**Voraussetzung:** Benutzer hat die Berechtigungen `wh_corrections.view`, `wh_corrections.manage` und `wh_corrections.run`.

**Prüflauf starten**

1. 📍 Seitenleiste → **Lager** → **Korrekturassistent**
2. ✅ Dashboard zeigt die drei KPI-Karten (Fehler, Warnungen, Hinweise)
3. 📍 **„Prüfung starten"** klicken
4. ✅ Button zeigt Lade-Symbol, nach kurzer Zeit aktualisieren sich die KPI-Karten
5. ✅ Unterhalb des Buttons erscheint: „Letzter Lauf: [Datum] — X Probleme gefunden"

**Fehler prüfen und beheben**

6. ✅ Tab „Meldungen" zeigt die erkannten Probleme, standardmäßig gefiltert auf „Offen"
7. 📍 Filter „Schweregrad" auf **„Fehler"** setzen → nur kritische Probleme anzeigen
8. ✅ Tabelle zeigt z. B. eine Meldung `NEGATIVE_STOCK` — „Artikel 'Schrauben M8' hat negativen Bestand: -12"
9. 📍 Zeile anklicken → Seitenpanel öffnet sich
10. ✅ Panel zeigt: Code `NEGATIVE_STOCK`, Schweregrad Fehler (rot), Meldungstext, Details (currentStock: -12)
11. 📍 **„Zum Artikel"** klicken → Artikeldetailseite öffnet sich
12. 📍 Auf der Artikeldetailseite den Bestand korrigieren (z. B. über Bestandskorrektur auf 0 setzen)
13. 📍 Zurück zum Korrekturassistenten navigieren (📍 Lager → Korrekturassistent)
14. 📍 Die Meldung erneut öffnen → Bemerkung eingeben: „Bestand auf 0 korrigiert vor Inventur"
15. 📍 **„Als erledigt markieren"** klicken
16. ✅ Meldung verschwindet aus der offenen Liste, KPI-Karte „Offene Fehler" aktualisiert sich

**Warnungen prüfen und ggf. ignorieren**

17. 📍 Filter „Schweregrad" auf **„Warnung"** setzen
18. ✅ Tabelle zeigt z. B. `OVERDUE_ORDER` — „Bestellung BS-2026-0042 ist seit 5 Tagen überfällig"
19. 📍 Zeile anklicken → **„Zur Bestellung"** klicken → Bestelldetailseite prüfen
20. 📍 Falls Lieferant telefonisch Verspätung bestätigt hat: zurück zum Korrekturassistenten
21. 📍 Meldung öffnen → Bemerkung: „Lt. Lieferant Lieferung am 28.03." → **„Ignorieren"**
22. ✅ Meldung wird als „Ignoriert" markiert

**Massenbearbeitung für Hinweise**

23. 📍 Filter „Schweregrad" auf **„Hinweis"** setzen
24. ✅ Tabelle zeigt z. B. mehrere `UNMATCHED_RECEIPT`-Meldungen
25. 📍 Checkbox im Tabellenkopf anklicken → alle Hinweise auswählen
26. ✅ Aktionsleiste erscheint: „X ausgewählt"
27. 📍 **„Als erledigt markieren"** klicken
28. ✅ Alle ausgewählten Hinweise werden als erledigt markiert

**Ergebnis prüfen**

29. ✅ KPI-Karten zeigen: Offene Fehler = 0, Warnungen = 0, Hinweise = 0
30. ✅ Tab „Prüfläufe" zeigt den Prüflauf mit Datum und Anzahl gefundener/behobener Probleme

---

## 21. Glossar

| Begriff | Erklärung | Wo in Terp |
|---------|-----------|-----------|
| **Abwesenheit** | Eintrag für einen Tag, an dem nicht gearbeitet wird (Urlaub, Krankheit usw.) | 📍 Abwesenheiten |
| **Anwesenheitsmuster** | Balkendiagramm der täglichen Teambesetzung | 📍 Teamübersicht |
| **Benachrichtigung** | Interne Systemmeldung an einen Benutzer (Genehmigung, Fehler, Erinnerung, System) | 📍 Glocke (🔔) / Benachrichtigungen |
| **Abwesenheitstyp** | Kategorie einer Abwesenheit mit Regeln (Urlaubsabzug, Genehmigung) | 📍 Verwaltung → Abwesenheitsarten |
| **Aktivität** | Art der Arbeit innerhalb eines Auftrags (z. B. Montage, Dokumentation) | 📍 Verwaltung → Aufträge → Tab Aktivitäten |
| **Bestellung (Einkauf)** | Einkaufsauftrag an einen Lieferanten mit Positionen, Preisen und Status-Workflow (Entwurf → Bestellt → Geliefert) | 📍 Lager → Bestellungen |
| **Bestellposition** | Einzelne Zeile in einer Bestellung. Drei Typen: Artikel (mit Artikelstamm), Freitext (ohne Artikelstamm, mit Preis) und Textzeile (nur Text, ohne Preis) | 📍 Lager → Bestellungen → Detail → Positionstabelle |
| **Beleg** | Kaufmännisches Dokument in der Belegkette (Angebot, AB, Lieferschein, Rechnung etc.) | 📍 Aufträge → Belege |
| **Belegkette** | Lückenlose Abfolge von Belegen: Angebot → AB → Lieferschein → Rechnung | 📍 Aufträge → Belege → Detail → Seitenleiste „Belegkette" |
| **Belegposition** | Einzelne Zeile in einem Beleg (Artikel, Freitext, Textzeile, Seitenumbruch, Zwischensumme) | 📍 Aufträge → Belege → Detail → Positionstabelle im A4-Editor |
| **Aufgabe (CRM)** | Interne Arbeitsaufgabe im CRM mit Betreff, Beschreibung, Fälligkeitsdatum und Status-Workflow | 📍 CRM → Aufgaben |
| **Auswertung (CRM)** | Berichts- und Analysedashboard mit Kennzahlen zu Adressen, Korrespondenz, Anfragen und Aufgaben | 📍 CRM → Auswertungen |
| **Auftrag** | Projekt oder Kundenauftrag für die Projektzeiterfassung | 📍 Verwaltung → Aufträge |
| **Auftragsbuchung** | Zeitbuchung eines Mitarbeiters auf einen Auftrag | 📍 Auftragsdetail → Tab Buchungen |
| **Bankverbindung (CRM)** | IBAN, BIC und Bankdaten einer CRM-Adresse | 📍 CRM → Adressen → Detail → Tab Bankverbindungen |
| **Berechtigungsgruppe** | Sammlung von Berechtigungen, die einem Benutzer zugewiesen wird | 📍 Administration → Benutzergruppen |
| **Bruttoarbeitszeit** | Gesamte Zeit zwischen Kommen und Gehen, inklusive Pausen | 📍 Zeitnachweis → Tageszusammenfassung |
| **Buchung** | Einzelner Stempeleintrag (Kommen, Gehen, Pause) | 📍 Zeitnachweis → Tagesansicht |
| **Buchungstyp** | Bedeutung einer Buchung: Richtung (Ein/Aus) und Kategorie | 📍 Verwaltung → Buchungstypen |
| **CRM-Adresse** | Kunden-, Lieferanten- oder kombinierter Stammdatensatz im CRM-Modul | 📍 CRM → Adressen |
| **Datensichtbereich** | Beschränkung, welche Mitarbeiter ein Benutzer sehen darf | 📍 Administration → Benutzer → Bearbeiten → Datensichtbereich |
| **Fehlzeit** | Differenz Soll − Netto, wenn weniger gearbeitet wurde | 📍 Zeitnachweis / Monatsauswertung |
| **Feiertagsgutschrift** | Stunden, die an einem Feiertag automatisch gutgeschrieben werden | 📍 Tagesplan → Tab Spezial → Feiertagsgutschriften |
| **Festschreiben** | Abschließen eines Belegs, der dadurch unveränderbar wird (Status: Abgeschlossen) | 📍 Aufträge → Belege → Detail → "Abschließen" |
| **Flexzeitsaldo** | Laufendes Konto für Plus-/Minusstunden | 📍 Dashboard (Karte) / Monatsauswertung |
| **Fortführen** | Erstellen eines Folgebelegs aus einem abgeschlossenen Beleg mit Übernahme aller Positionen | 📍 Aufträge → Belege → Detail → "Fortführen" |
| **Kappung** | Abschneiden von Arbeitszeit außerhalb des erlaubten Fensters | Konfiguriert im Tagesplan, Tab Zeitfenster |
| **Kernzeit** | Pflichtzeitraum bei Gleitzeit | 📍 Tagesplan → Tab Zeitfenster → Kernzeit |
| **Kundendienst** | Serviceauftrag für Wartung, Reparatur oder Vor-Ort-Einsatz mit Status-Workflow und Rechnungserstellung | 📍 Aufträge → Kundendienst |
| **Konto** | Sammelstelle für Zeitwerte (Flex, Überstunden, Zuschläge) | 📍 Verwaltung → Konten |
| **Korrektur** | Manuelle Anpassung an Zeitwerten eines Tages | 📍 Verwaltung → Korrekturassistent |
| **Kontaktperson (CRM)** | Ansprechpartner bei einer CRM-Adresse (Name, Position, Telefon, E-Mail) | 📍 CRM → Adressen → Detail → Tab Kontakte |
| **Korrespondenz (CRM)** | Kommunikationsprotokoll einer CRM-Adresse (Telefonate, E-Mails, Briefe, Faxe, Besuche) | 📍 CRM → Adressen → Detail → Tab Korrespondenz |
| **Anfrage (CRM)** | Übergeordnete Klammer für Kundenaktivitäten mit Status-Workflow und optionaler Auftragsverknüpfung | 📍 CRM → Anfragen |
| **Kostenstelle** | Betriebswirtschaftliche Zuordnung für Mitarbeiter und Aufträge | 📍 Verwaltung → Kostenstellen |
| **Makro** | Automatisierungsregel (z. B. Flexzeit zurücksetzen) | 📍 Administration → Makros |
| **Mandant** | Oberste Organisationseinheit (Unternehmen/Niederlassung) | 📍 Administration → Mandanten |
| **Monatsabschluss** | Einfrieren der Monatswerte — danach keine Änderungen mehr | 📍 Monatsauswertung → „Monat abschließen" |
| **Monatswert** | Aggregierte Arbeitszeitwerte eines Mitarbeiters für einen Monat | 📍 Verwaltung → Monatswerte |
| **Matchcode** | Kurzschlüssel für Adress-Suche (wird automatisch aus Firmenname generiert) | 📍 CRM → Adressen → Formular |
| **Nettoarbeitszeit** | Anrechenbare Arbeitszeit: Brutto minus Pausen | 📍 Zeitnachweis → Tageszusammenfassung |
| **Nachricht (CRM)** | Vereinfachte CRM-Aufgabe ohne Terminierung — dient als interne Mitteilung | 📍 CRM → Aufgaben |
| **Nachbestellvorschlag** | Automatisch berechneter Hinweis, dass ein Artikel unter den Mindestbestand gefallen ist, mit vorgeschlagener Bestellmenge | 📍 Lager → Bestellungen → Nachbestellvorschläge |
| **Nummernkreis** | Auto-Zähler für Kunden-/Lieferantennummern mit konfigurierbarem Präfix | 📍 Administration → Einstellungen |
| **Mengenstaffel** | Mehrere Preiseinträge für denselben Artikel mit unterschiedlichen Ab-Mengen für mengenabhängige Rabatte | 📍 Aufträge → Preislisten → Detail |
| **Offener Posten** | Unbezahlte oder teilbezahlte Rechnung mit Fälligkeitsdatum und Zahlungsstatus | 📍 Aufträge → Offene Posten |
| **Kontogruppe** | Logische Bündelung mehrerer Konten (z. B. alle Zuschlagskonten) | 📍 Verwaltung → Konten → Tab Gruppen |
| **Personalnummer** | Eindeutige Kennung je Mitarbeiter im Mandanten | 📍 Verwaltung → Mitarbeiter |
| **Preiseintrag** | Einzelne Preiszeile in einer Preisliste mit Artikel/Schlüssel, Einzelpreis und optionaler Mengenstaffel | 📍 Aufträge → Preislisten → Detail |
| **Preisliste** | Liste mit Preisen für Artikel und Freitextpositionen, zuweisbar an Kunden. Standardpreisliste als Fallback. | 📍 Aufträge → Preislisten |
| **Profil** | Eigene Stamm-, Beschäftigungs- und Kontaktdaten des angemeldeten Benutzers | 📍 Benutzermenü → Profil |
| **PIN** | Persönliche Identifikationsnummer für das Terminal | Wird bei Mitarbeiteranlage automatisch vergeben |
| **RFID-Karte** | Zutrittskarte mit Funkchip | 📍 Mitarbeiterdetail → Zutrittskarten |
| **Rundung** | Automatisches Auf-/Abrunden von Stempelzeiten | 📍 Tagesplan → Tab Rundung |
| **Schicht** | Benanntes Arbeitszeitpaket mit Farbe und Tagesplan | 📍 Verwaltung → Schichtplanung → Tab Schichten |
| **Serviceauftrag** | Einzelner Kundendienst-Eintrag mit Nummer (KD-), Status und optionaler Auftrags-/Rechnungsverknüpfung | 📍 Aufträge → Kundendienst → Detail |
| **Skonto** | Rabatt bei Zahlung innerhalb einer vereinbarten Frist (bis zu zwei Stufen) | 📍 Aufträge → Offene Posten → Detail → Zahlung erfassen |
| **Schichterkennung** | Automatische Schichtzuordnung anhand der Stempelzeiten | Konfiguriert im Tagesplan, Tab Spezial |
| **Sollarbeitszeit** | Geplante Arbeitszeit laut Tagesplan | 📍 Zeitnachweis → Tagessollzeit |
| **Standort** | Physischer Arbeitsort mit Adresse | 📍 Verwaltung → Standorte |
| **Tarifzuweisung** | Zeitgebundene Zuordnung eines Tarifs zu einem Mitarbeiter (mit Gültigkeitszeitraum) | 📍 Verwaltung → Mitarbeiter → Mitarbeiterdetails → Tab Tarifzuweisungen |
| **Tagesplan** | Arbeitszeitregeln für einen Tag (Fenster, Soll, Pausen, Toleranzen) | 📍 Verwaltung → Tagespläne |
| **Teamübersicht** | Echtzeit-Anwesenheitsstatus und Statistiken eines Teams | 📍 Teamübersicht |
| **Tageswert** | Berechnetes Ergebnis eines Arbeitstages | 📍 Zeitnachweis → Tagesansicht |
| **Tarif** | Vollständiges Arbeitszeitmodell (Rhythmus + Urlaub + Flexzeit) | 📍 Verwaltung → Tarife |
| **Toleranz** | Minutenpuffer für Stempelabweichungen | 📍 Tagesplan → Tab Toleranz |
| **Überstunden** | Differenz Netto − Soll, wenn mehr gearbeitet wurde | 📍 Zeitnachweis / Monatsauswertung |
| **Übertragungsart** | Wie das Flexzeitsaldo am Monatsende verarbeitet wird | 📍 Tarif → Tab Flexzeit → Übertragungsart |
| **Urlaubsabzug** | Faktor, mit dem ein Abwesenheitstag vom Urlaubskonto abzieht | 📍 Tagesplan → Tab Spezial → Urlaubsabzug |
| **Urlaubskonto** | Jahresguthaben: Anspruch + Übertrag + Anpassungen − Genommen | 📍 Urlaub / Verwaltung → Urlaubskonten |
| **Urlaubskappung** | Begrenzung des Resturlaubsübertrags ins nächste Jahr | 📍 Verwaltung → Urlaubskonfiguration → Tab Kappungsregeln |
| **Wiederkehrende Rechnung** | Vorlage fuer automatisch oder manuell erzeugte Rechnungen in regelmaessigen Intervallen (z. B. monatlich) | 📍 Auftraege → Wiederkehrende Rechnungen |
| **Wochenplan** | Zuordnung von 7 Tagesplänen zu einer Woche | 📍 Verwaltung → Wochenpläne |
| **Zahlung** | Erfasster Zahlungseingang (bar oder Überweisung) gegen eine Rechnung | 📍 Aufträge → Offene Posten → Detail → Zahlungshistorie |
| **Zugangsprofil** | Berechtigungsgruppe für physischen Zutritt (bündelt Zonen) | 📍 Administration → Zutrittskontrolle → Tab Profile |
| **Zugangszone** | Physischer Bereich mit gesteuertem Zutritt | 📍 Administration → Zutrittskontrolle → Tab Zonen |
| **Zuschlag** | Bonus für Arbeit in bestimmten Zeitfenstern (z. B. Nachtarbeit) | Konfiguriert im Tagesplan, Detailansicht → Zuschläge |
| **Artikel** | Material, Ware oder Dienstleistung im Artikelstamm mit Nummer, Bezeichnung, Einheit und optional Preisen und Bestandsführung | 📍 Lager → Artikel |
| **Artikelgruppe** | Hierarchische Kategorie zur Organisation von Artikeln (z. B. „Holz → Massivholz → Eiche") | 📍 Lager → Artikel → Gruppenbaum links |
| **Bestandsführung** | Schalter pro Artikel, der Lagerfunktionen aktiviert: aktueller Bestand, Mindestbestand, Lagerort und Bestandskorrektur | 📍 Lager → Artikel → Formular → Bestandsführung |
| **Bestandskorrektur** | Manuelle Anpassung des Lagerbestands um einen Deltawert (z. B. +10 oder −5) mit optionaler Begründung | 📍 Lager → Artikel → Detail → „Bestand korrigieren" |
| **EK-Preis** | Einkaufspreis eines Artikels — kann im Artikelstamm und pro Lieferant hinterlegt werden | 📍 Lager → Artikel → Detail |
| **Matchcode (Artikel)** | Kurzname für die Schnellsuche, wird automatisch aus dem Artikelnamen generiert | 📍 Lager → Artikel → Formular |
| **Mindestbestand** | Lagermenge, bei deren Unterschreitung ein Warnhinweis erscheint (nur bei Bestandsführung) | 📍 Lager → Artikel → Detail → Übersicht → Karte Bestand |
| **Preisliste (Lager)** | Benannte Sammlung von Artikelpreisen für kunden- oder zeitraumspezifische Preisgestaltung | 📍 Lager → Preislisten |
| **Stückliste (BOM)** | Komponentenliste eines Artikels (Bill of Materials) mit Artikel, Menge und optionaler Bemerkung | 📍 Lager → Artikel → Detail → Tab Stückliste |
| **VK-Preis** | Netto-Verkaufspreis eines Artikels im Artikelstamm, dient als Basispreis für Preislisten | 📍 Lager → Artikel → Detail → Karte Preise |
| **Wareneingang** | Buchung eingehender Lieferungen gegen eine Bestellung mit automatischer Bestandserhöhung | 📍 Lager → Wareneingang |
| **Lagerentnahme** | Entnahme von Artikeln aus dem Lager mit automatischer Bestandsreduzierung, optional mit Referenz (Auftrag, Lieferschein, Maschine) | 📍 Lager → Lagerentnahmen |
| **Lieferantenrechnung** | Eingangsrechnung eines Lieferanten mit Beträgen, Zahlungsbedingungen und Skonto. Kann mit einer Bestellung verknüpft werden | 📍 Lager → Lieferantenrechnungen |
| **Lieferantenzahlung** | Zahlung auf eine Lieferantenrechnung (Überweisung oder Bar), mit optionalem Skonto-Abzug. Statusübergänge erfolgen automatisch | 📍 Lager → Lieferantenrechnungen → Detail → Zahlungstabelle |
| **Bestandsbewegung** | Einzelner protokollierter Bestandsvorgang (Wareneingang, Entnahme, Lieferschein-Buchung, Korrektur, Inventur, Rückgabe) mit Menge, vorherigem und neuem Bestand | 📍 Lager → Bestandsbewegungen |
| **Storno (Entnahme)** | Umkehrung einer Lagerentnahme — stellt den entnommenen Bestand wieder her und erzeugt eine positive Gegenbuchung | 📍 Lager → Lagerentnahmen → Verlauf → Stornieren |
| **Sammelentnahme** | Entnahme mehrerer Artikel in einem Vorgang, gebündelt unter einer gemeinsamen Referenz | 📍 Lager → Lagerentnahmen → Neue Entnahme |
| **Korrekturassistent (Lager)** | Diagnose-Werkzeug, das automatisch Unstimmigkeiten im Lagerbestand erkennt: negative Bestände, doppelte Wareneingänge, überfällige Bestellungen, Bestandsdifferenzen | 📍 Lager → Korrekturassistent |
| **Prüflauf (Lager)** | Automatischer oder manueller Durchlauf aller Korrekturprüfungen mit Protokollierung der Ergebnisse | 📍 Lager → Korrekturassistent → Prüfläufe |

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
| `/crm/addresses` | CRM → Adressen | crm_addresses.view |
| `/crm/addresses/[id]` | Adressenliste → Zeile anklicken | crm_addresses.view |
| `/crm/inquiries` | CRM → Anfragen | crm_inquiries.view |
| `/crm/inquiries/[id]` | Anfragenliste → Zeile anklicken | crm_inquiries.view |
| `/crm/tasks` | CRM → Aufgaben | crm_tasks.view |
| `/crm/reports` | CRM → Auswertungen | crm_addresses.view |
| `/orders/documents` | Aufträge → Belege | billing_documents.view |
| `/orders/documents/new` | Aufträge → Belege → Neuer Beleg | billing_documents.create |
| `/orders/documents/[id]` | Belegliste → Zeile anklicken | billing_documents.view |
| `/orders/service-cases` | Aufträge → Kundendienst | billing_service_cases.view |
| `/orders/service-cases/[id]` | Kundendienstliste → Zeile anklicken | billing_service_cases.view |
| `/orders/open-items` | Aufträge → Offene Posten | billing_payments.view |
| `/orders/open-items/[documentId]` | Offene Posten → Rechnung anklicken | billing_payments.view |
| `/orders/price-lists` | Aufträge → Preislisten | billing_price_lists.view |
| `/orders/price-lists/[id]` | Preislistenliste → Zeile anklicken | billing_price_lists.view |
| `/orders/recurring` | Auftraege → Wiederkehrende Rechnungen | billing_recurring.view |
| `/orders/recurring/new` | Auftraege → Wiederkehrende Rechnungen → Neue Vorlage | billing_recurring.manage |
| `/orders/recurring/[id]` | Wiederkehrende Rechnungen → Zeile anklicken | billing_recurring.view |
| `/warehouse/articles` | Lager → Artikel | wh_articles.view |
| `/warehouse/articles/[id]` | Artikelliste → Zeile anklicken | wh_articles.view |
| `/warehouse/prices` | Lager → Preislisten | billing_price_lists.view, wh_articles.view |
| `/warehouse/purchase-orders` | Lager → Bestellungen | wh_purchase_orders.view |
| `/warehouse/purchase-orders/new` | Lager → Bestellungen → Neue Bestellung | wh_purchase_orders.create |
| `/warehouse/purchase-orders/[id]` | Bestellungsliste → Zeile anklicken | wh_purchase_orders.view |
| `/warehouse/purchase-orders/suggestions` | Lager → Bestellungen → Nachbestellvorschläge | wh_purchase_orders.view |
| `/warehouse/goods-receipt` | Lager → Wareneingang | wh_stock.manage |
| `/warehouse/withdrawals` | Lager → Lagerentnahmen | wh_stock.manage |
| `/warehouse/stock-movements` | Lager → Bestandsbewegungen | wh_stock.view |
| `/warehouse/corrections` | Lager → Korrekturassistent | wh_corrections.view |

---

*Terp — Digitale Zeiterfassung und Personalverwaltung für deutsche Unternehmen.*
