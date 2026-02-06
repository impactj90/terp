# Beschäftigungsarten - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Beschäftigungsarten** ermöglicht die Definition verschiedener Beschäftigungsverhältnisse wie Vollzeit, Teilzeit, Minijob oder Werkstudent. Diese Arten beeinflussen Urlaubsansprüche, Sollarbeitszeiten und andere Berechnungen.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Definition von Beschäftigungsarten
- Systemadministratoren für Systemkonfiguration

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte für die Verwaltung.

## Zugang zum Modul

**Navigationspfad:** Admin → Personal → Beschäftigungsarten

**Direkte URL:** `/admin/employment-types`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Beschäftigungsarten"
- **Beschäftigungsart hinzufügen**: Button zum Anlegen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Bezeichnung (z.B. "Vollzeit") |
| **Kürzel** | Kurzcode (z.B. "VZ") |
| **Standard-Wochenstunden** | Regel-Arbeitszeit |
| **Urlaubstage** | Standard-Urlaubsanspruch |
| **Mitarbeiter** | Anzahl zugeordneter Mitarbeiter |
| **Status** | Aktiv/Inaktiv |
| **Aktionen** | Bearbeiten, Details, Löschen |

### 3. Formular (Form Sheet)
- **Name** (Pflicht): Bezeichnung der Beschäftigungsart
- **Kürzel**: Kurzcode für Exporte und Berichte
- **Standard-Wochenstunden**: Regelarbeitszeit pro Woche
- **Urlaubstage**: Jährlicher Standard-Urlaubsanspruch
- **Beschreibung**: Optionale Details
- **Status**: Aktiv/Inaktiv

### 4. Detail-Ansicht
- Vollständige Informationen
- Liste zugeordneter Mitarbeiter

## Schritt-für-Schritt Anleitungen

### Neue Beschäftigungsart anlegen

1. Klicken Sie auf **"Beschäftigungsart hinzufügen"**
2. Geben Sie einen **Namen** ein (z.B. "Teilzeit 50%")
3. Definieren Sie ein **Kürzel** (z.B. "TZ50")
4. Setzen Sie **Standard-Wochenstunden** (z.B. 20)
5. Setzen Sie **Urlaubstage** (z.B. 15 bei Teilzeit)
6. Klicken Sie auf **"Speichern"**

### Beschäftigungsart bearbeiten

1. Finden Sie die Beschäftigungsart in der Tabelle
2. Klicken Sie auf **"Bearbeiten"**
3. Ändern Sie die gewünschten Felder
4. Klicken Sie auf **"Speichern"**
5. **Hinweis**: Änderungen betreffen nur neue Zuordnungen

### Beschäftigungsart deaktivieren

1. Öffnen Sie das Bearbeitungsformular
2. Ändern Sie den **Status** auf "Inaktiv"
3. Speichern Sie die Änderungen

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Mitarbeiter** | Zuordnung der Beschäftigungsart |
| **Urlaubssalden** | Berechnung des Urlaubsanspruchs |
| **Zeitpläne** | Sollzeit-Berechnung |
| **Lohnexport** | Export der Beschäftigungsart |
| **Berichte** | Filterung und Gruppierung |

## Tipps & Best Practices

1. **Praxisnahe Definitionen**: Definieren Sie Arten entsprechend Ihrer Tarifverträge/Betriebsvereinbarungen.
2. **Kürzel für Exporte**: Nutzen Sie konsistente Kürzel für Lohnexporte.
3. **Urlaubstage korrekt**: Der Urlaubsanspruch sollte proportional zur Arbeitszeit sein.
4. **Deaktivieren statt löschen**: Behalten Sie historische Zuordnungen.

## Problembehandlung

### Urlaubsanspruch wird falsch berechnet
**Ursache**: Beschäftigungsart hat falschen Wert für Urlaubstage.
**Lösung**: Korrigieren Sie den Wert. Bestehende Salden müssen ggf. manuell angepasst werden.

### Beschäftigungsart kann nicht gelöscht werden
**Lösung**: Deaktivieren Sie die Art oder entfernen Sie zuerst alle Mitarbeiter-Zuordnungen.

## Verwandte Module

- **[Mitarbeiter](./mitarbeiter.md)** - Beschäftigungsart-Zuordnung
- **[Urlaubssalden](./urlaubssalden.md)** - Urlaubsberechnung
- **[Lohnexporte](./lohnexporte.md)** - Export-Konfiguration
