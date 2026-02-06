# Mitarbeiter - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Mitarbeiter** ist die zentrale Verwaltungsstelle für alle Mitarbeiterdaten in Ihrem Unternehmen. Hier können Administratoren Mitarbeiter anlegen, bearbeiten, deaktivieren und alle relevanten Informationen wie Personalien, Beschäftigungsdetails und Zuordnungen verwalten.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Stammdatenpflege
- Teamleiter mit erweiterten Rechten zur Mitarbeiterverwaltung
- Systemadministratoren für die Benutzerzuordnung

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte für die Mitarbeiterverwaltung.
2. **Stammdaten konfiguriert**: Abteilungen, Teams, Kostenstellen sollten vorab eingerichtet sein.

## Zugang zum Modul

**Navigationspfad:** Admin → Personal → Mitarbeiter

**Direkte URL:** `/admin/employees`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Mitarbeiter"
- **Mitarbeiter hinzufügen**: Button zum Anlegen eines neuen Mitarbeiters
- **Bulk-Aktionen**: Mehrfachauswahl und Sammelaktionen

### 2. Datentabelle
Übersicht aller Mitarbeiter mit folgenden Spalten:

| Spalte | Beschreibung |
|--------|--------------|
| **Auswahlbox** | Für Mehrfachauswahl |
| **Name** | Vollständiger Name mit Avatar |
| **Personalnummer** | Eindeutige Kennung |
| **E-Mail** | E-Mail-Adresse |
| **Abteilung** | Zugeordnete Abteilung |
| **Team** | Zugeordnetes Team |
| **Status** | Aktiv/Inaktiv Badge |
| **Eintrittsdatum** | Beginn des Arbeitsverhältnisses |
| **Aktionen** | Bearbeiten, Details, Löschen |

#### Such- und Filterfunktionen
- **Suchfeld**: Nach Name, E-Mail oder Personalnummer suchen
- **Status-Filter**: Aktive, Inaktive oder alle anzeigen
- **Abteilungs-Filter**: Nach Abteilung filtern
- **Team-Filter**: Nach Team filtern

#### Sortierung
- Klick auf Spaltenüberschrift sortiert die Tabelle
- Erneuter Klick kehrt die Sortierrichtung um

### 3. Detail-Ansicht (Detail Sheet)
Beim Klick auf einen Mitarbeiter öffnet sich eine Seitenleiste mit:

#### Persönliche Daten
- Vollständiger Name
- E-Mail, Telefon
- Geburtsdatum
- Adresse

#### Beschäftigungsdaten
- Personalnummer
- Eintrittsdatum, ggf. Austrittsdatum
- Beschäftigungsart
- Abteilung, Team
- Kostenstelle, Standort
- Vorgesetzter

#### Zeitplan-Zuweisung
- Aktueller Wochenplan/Tarif
- Gültig ab Datum

#### Notfallkontakte
- Liste der hinterlegten Kontakte

#### Zugangskarten
- Zugeordnete Chipkarten/Ausweise

### 4. Formular (Form Sheet)
Zum Anlegen und Bearbeiten von Mitarbeitern:

#### Pflichtfelder
- Vorname
- Nachname
- Personalnummer
- E-Mail

#### Optionale Felder
- Telefon
- Geburtsdatum
- Adresse
- Abteilung
- Team
- Kostenstelle
- Standort
- Beschäftigungsart
- Eintrittsdatum
- Vorgesetzter
- Bemerkungen

#### Zeitplan
- Wochenplan/Tarif-Auswahl
- Gültig ab Datum

#### Benutzerkonto
- Mit Benutzer verknüpfen
- Oder neues Benutzerkonto erstellen

## Schritt-für-Schritt Anleitungen

### Neuen Mitarbeiter anlegen

1. Klicken Sie auf **"Mitarbeiter hinzufügen"**
2. Füllen Sie die **Pflichtfelder** aus (Name, Personalnummer, E-Mail)
3. Wählen Sie **Abteilung** und **Team**
4. Weisen Sie einen **Wochenplan** zu
5. Optional: Verknüpfen Sie ein **Benutzerkonto**
6. Klicken Sie auf **"Speichern"**

### Mitarbeiter suchen

1. Nutzen Sie das **Suchfeld** oben in der Tabelle
2. Geben Sie Name, E-Mail oder Personalnummer ein
3. Die Tabelle filtert automatisch
4. Alternativ: Nutzen Sie die **Filter** für Abteilung/Team/Status

### Mitarbeiterdaten bearbeiten

1. Finden Sie den Mitarbeiter in der Tabelle
2. Klicken Sie auf das **Bearbeiten-Symbol** (Stift)
3. Ändern Sie die gewünschten Daten
4. Klicken Sie auf **"Speichern"**

### Mitarbeiter deaktivieren

1. Öffnen Sie das **Bearbeitungsformular** des Mitarbeiters
2. Setzen Sie das **Austrittsdatum**
3. Ändern Sie den **Status** auf "Inaktiv"
4. Speichern Sie die Änderungen
5. Der Mitarbeiter kann sich nicht mehr anmelden und wird in Listen ausgeblendet

### Zeitplan zuweisen

1. Öffnen Sie die **Details** oder das **Bearbeitungsformular**
2. Wählen Sie im Bereich **Zeitplan** einen **Wochenplan/Tarif**
3. Setzen Sie das **"Gültig ab"**-Datum
4. Speichern Sie die Änderungen

### Mit Benutzerkonto verknüpfen

1. Öffnen Sie das **Bearbeitungsformular**
2. Im Bereich **Benutzerkonto**: Wählen Sie ein bestehendes Konto
3. Oder: Erstellen Sie ein neues Konto mit E-Mail/Passwort
4. Speichern Sie die Änderungen
5. Der Mitarbeiter kann sich nun anmelden

### Mehrere Mitarbeiter bearbeiten (Bulk)

1. Aktivieren Sie die **Auswahlboxen** der gewünschten Mitarbeiter
2. Klicken Sie auf **"Bulk-Aktionen"**
3. Wählen Sie die Aktion (z.B. Abteilung ändern, Status ändern)
4. Bestätigen Sie die Änderung
5. Alle ausgewählten Mitarbeiter werden aktualisiert

### Mitarbeiter-Details exportieren

1. Wählen Sie die gewünschten Mitarbeiter oder alle
2. Klicken Sie auf **"Export"**
3. Wählen Sie das Format (CSV/Excel)
4. Die Datei wird heruntergeladen

## Auswirkungen auf andere Module

Mitarbeiterdaten beeinflussen viele Systembereiche:

| Modul | Auswirkung |
|-------|------------|
| **Stempeluhr** | Nur aktive Mitarbeiter können stempeln |
| **Abwesenheiten** | Anträge werden dem Vorgesetzten zugewiesen |
| **Teams** | Mitgliedschaft in Teams |
| **Urlaubssalden** | Urlaubsberechnung basiert auf Beschäftigungsart |
| **Lohnexport** | Mitarbeiterdaten fließen in Exporte |
| **Berichte** | Filterung nach Abteilung/Team/Kostenstelle |
| **Zeitpläne** | Sollzeit basiert auf zugewiesenem Plan |

## Tipps & Best Practices

1. **Personalnummern-Schema**: Definieren Sie ein einheitliches Schema für Personalnummern.

2. **Zeitplan vor Arbeitsbeginn**: Weisen Sie den Zeitplan vor dem Eintrittsdatum zu.

3. **Benutzerkonto zeitnah**: Erstellen Sie das Benutzerkonto vor dem ersten Arbeitstag.

4. **Abteilung und Team pflegen**: Halten Sie Zuordnungen aktuell für korrekte Berichte.

5. **Austrittsprozess**: Bei Austritt: Deaktivieren, nicht löschen - für Historienerhalt.

6. **Notfallkontakte aktuell**: Erinnern Sie Mitarbeiter, Notfallkontakte aktuell zu halten.

7. **Regelmäßige Prüfung**: Prüfen Sie periodisch inaktive Mitarbeiter auf Relevanz.

## Problembehandlung

### Mitarbeiter kann sich nicht anmelden
**Ursache**: Kein Benutzerkonto verknüpft oder Status inaktiv.
**Lösung**: Prüfen Sie die Benutzerkonto-Verknüpfung und den Status.

### Personalnummer bereits vergeben
**Ursache**: Personalnummern müssen eindeutig sein.
**Lösung**: Wählen Sie eine andere Personalnummer.

### Zeitplan zeigt keine Sollzeit
**Ursache**: Kein Zeitplan zugewiesen oder ungültiges "Gültig ab"-Datum.
**Lösung**: Weisen Sie einen Zeitplan mit passendem Datum zu.

### Mitarbeiter nicht in Teamübersicht
**Ursache**: Nicht dem Team zugeordnet oder inaktiv.
**Lösung**: Prüfen Sie Team-Zuordnung und Status.

### Vorgesetzter kann nicht genehmigen
**Ursache**: Vorgesetzter nicht korrekt zugewiesen.
**Lösung**: Prüfen Sie das Feld "Vorgesetzter" beim Mitarbeiter.

### Lohnexport fehlt Mitarbeiter
**Ursache**: Mitarbeiter ist inaktiv oder hat keine Buchungen.
**Lösung**: Prüfen Sie Status und Buchungsdaten des Mitarbeiters.

## Verwandte Module

- **[Benutzer](./benutzer.md)** - Benutzerkonten verwalten
- **[Teams](./teams.md)** - Teamzuordnungen
- **[Abteilungen](./abteilungen.md)** - Abteilungsstruktur
- **[Wochenpläne](./wochenplaene.md)** - Zeitpläne erstellen
- **[Tarife](./tarife.md)** - Schichtrhythmen definieren
- **[Genehmigungen](./genehmigungen.md)** - Genehmigungsworkflows
- **[Urlaubssalden](./urlaubssalden.md)** - Urlaubskontingente
