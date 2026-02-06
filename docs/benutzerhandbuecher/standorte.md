# Standorte - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Standorte** ermöglicht die Verwaltung der physischen Arbeitsstandorte Ihres Unternehmens. Standorte werden Mitarbeitern zugeordnet und können für Feiertags-Regelungen (unterschiedliche Feiertage je Bundesland) und Berichte verwendet werden.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Standortverwaltung
- Systemadministratoren für Feiertags-Konfiguration
- Controlling für standortbasierte Auswertungen

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte für die Standortverwaltung.

## Zugang zum Modul

**Navigationspfad:** Admin → Personal → Standorte

**Direkte URL:** `/admin/locations`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Standorte"
- **Standort hinzufügen**: Button zum Anlegen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Standortname |
| **Adresse** | Straße, PLZ, Ort |
| **Bundesland** | Für Feiertagszuordnung |
| **Mitarbeiter** | Anzahl zugeordneter Mitarbeiter |
| **Status** | Aktiv/Inaktiv |
| **Aktionen** | Bearbeiten, Details, Löschen |

### 3. Formular (Form Sheet)
- **Name** (Pflicht): Eindeutiger Standortname
- **Straße**: Adresszeile
- **PLZ**: Postleitzahl
- **Ort**: Stadt/Gemeinde
- **Bundesland**: Dropdown (für Feiertagszuordnung)
- **Land**: Länderauswahl
- **Beschreibung**: Optionale Details
- **Status**: Aktiv/Inaktiv

### 4. Detail-Ansicht
- Vollständige Standortinformationen
- Liste zugeordneter Mitarbeiter
- Gültige Feiertage am Standort

## Schritt-für-Schritt Anleitungen

### Neuen Standort anlegen

1. Klicken Sie auf **"Standort hinzufügen"**
2. Geben Sie einen **Namen** ein (z.B. "Zentrale München")
3. Füllen Sie die **Adressfelder** aus
4. Wählen Sie das **Bundesland** (wichtig für Feiertage)
5. Klicken Sie auf **"Speichern"**

### Standort bearbeiten

1. Finden Sie den Standort in der Tabelle
2. Klicken Sie auf **"Bearbeiten"**
3. Ändern Sie die gewünschten Felder
4. Klicken Sie auf **"Speichern"**

### Bundesland für Feiertage zuweisen

1. Öffnen Sie das Bearbeitungsformular
2. Wählen Sie das korrekte **Bundesland**
3. Speichern Sie die Änderungen
4. Mitarbeiter an diesem Standort erhalten automatisch die korrekten Feiertage

### Standort deaktivieren

1. Öffnen Sie das Bearbeitungsformular
2. Ändern Sie den **Status** auf "Inaktiv"
3. Speichern Sie die Änderungen
4. Der Standort ist für neue Zuordnungen nicht mehr verfügbar

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Mitarbeiter** | Zuordnung zu Standorten |
| **Feiertage** | Standortabhängige Feiertagsberechnung |
| **Tageswerte** | Sollzeit-Berechnung berücksichtigt lokale Feiertage |
| **Berichte** | Standortbasierte Filterung |

## Tipps & Best Practices

1. **Bundesland korrekt setzen**: Wichtig für automatische Feiertagsberechnung.
2. **Eindeutige Namen**: Verwenden Sie eindeutige, sprechende Bezeichnungen.
3. **Vollständige Adressen**: Adressen können für Berichte und Kommunikation genutzt werden.
4. **Regelmäßige Prüfung**: Bei Umzügen Adressen und Bundesland aktualisieren.

## Problembehandlung

### Feiertage werden nicht korrekt berechnet
**Ursache**: Bundesland nicht oder falsch gesetzt.
**Lösung**: Prüfen und korrigieren Sie das Bundesland am Standort.

### Standort kann nicht gelöscht werden
**Lösung**: Entfernen Sie zuerst alle Mitarbeiter-Zuordnungen oder deaktivieren Sie den Standort.

### Mitarbeiter zeigt falsche Feiertage
**Lösung**: Prüfen Sie die Standort-Zuordnung des Mitarbeiters und das Bundesland des Standorts.

## Verwandte Module

- **[Mitarbeiter](./mitarbeiter.md)** - Standort-Zuordnung
- **[Feiertage](./feiertage.md)** - Feiertagsverwaltung
- **[Berichte](./berichte.md)** - Standortauswertungen
