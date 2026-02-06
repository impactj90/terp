# Kostenstellen - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Kostenstellen** ermöglicht die Verwaltung der Kostenstellen für die Zuordnung von Mitarbeitern und Zeiten zu buchhalterischen Einheiten. Kostenstellen werden für den Lohnexport, Berichte und das Controlling verwendet.

**Wer nutzt dieses Modul:**
- Finanz- und Controllingadministratoren
- Personaladministratoren für Mitarbeiter-Zuordnung
- Systemadministratoren für Stammdaten

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte für die Kostenstellenverwaltung.

## Zugang zum Modul

**Navigationspfad:** Admin → Personal → Kostenstellen

**Direkte URL:** `/admin/cost-centers`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Kostenstellen"
- **Kostenstelle hinzufügen**: Button zum Anlegen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Nummer** | Kostenstellen-Nummer |
| **Name** | Bezeichnung |
| **Beschreibung** | Optionale Details |
| **Mitarbeiter** | Anzahl zugeordneter Mitarbeiter |
| **Status** | Aktiv/Inaktiv |
| **Aktionen** | Bearbeiten, Details, Löschen |

### 3. Formular (Form Sheet)
- **Nummer** (Pflicht): Eindeutige Kostenstellen-Nummer
- **Name** (Pflicht): Bezeichnung
- **Beschreibung**: Optionale Details
- **Status**: Aktiv/Inaktiv

### 4. Detail-Ansicht
- Vollständige Kostenstellen-Informationen
- Liste zugeordneter Mitarbeiter
- Verwendung in Abteilungen

## Schritt-für-Schritt Anleitungen

### Neue Kostenstelle anlegen

1. Klicken Sie auf **"Kostenstelle hinzufügen"**
2. Geben Sie eine eindeutige **Nummer** ein
3. Geben Sie einen **Namen** ein
4. Optional: Fügen Sie eine **Beschreibung** hinzu
5. Klicken Sie auf **"Speichern"**

### Kostenstelle bearbeiten

1. Finden Sie die Kostenstelle in der Tabelle
2. Klicken Sie auf **"Bearbeiten"**
3. Ändern Sie die gewünschten Felder
4. Klicken Sie auf **"Speichern"**

### Kostenstelle deaktivieren

1. Öffnen Sie das Bearbeitungsformular
2. Ändern Sie den **Status** auf "Inaktiv"
3. Speichern Sie die Änderungen
4. Die Kostenstelle ist für neue Zuordnungen nicht mehr verfügbar

### Zugeordnete Mitarbeiter einsehen

1. Klicken Sie auf **"Details"** bei der Kostenstelle
2. Die Liste zeigt alle zugeordneten Mitarbeiter
3. Zur Änderung: Bearbeiten Sie die Mitarbeiter einzeln

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Mitarbeiter** | Zuordnung zu Kostenstellen |
| **Abteilungen** | Verknüpfung mit Abteilungen |
| **Lohnexport** | Kostenstellen-Zuordnung der Zeiten |
| **Berichte** | Filterung und Auswertung |
| **Buchungen** | Kostenstellen-Zuordnung von Zeiten |

## Tipps & Best Practices

1. **Konsistentes Nummernschema**: Definieren Sie ein einheitliches Nummernschema.
2. **Aussagekräftige Namen**: Wählen Sie klare, eindeutige Bezeichnungen.
3. **Deaktivieren statt löschen**: Behalten Sie historische Zuordnungen.
4. **Regelmäßige Prüfung**: Aktualisieren Sie bei organisatorischen Änderungen.

## Problembehandlung

### Kostenstelle kann nicht gelöscht werden
**Lösung**: Deaktivieren Sie die Kostenstelle oder entfernen Sie zuerst alle Zuordnungen.

### Nummer bereits vergeben
**Lösung**: Kostenstellen-Nummern müssen eindeutig sein. Wählen Sie eine andere Nummer.

### Kostenstelle erscheint nicht in Auswahl
**Lösung**: Prüfen Sie, ob die Kostenstelle aktiv ist.

## Verwandte Module

- **[Mitarbeiter](./mitarbeiter.md)** - Kostenstellen-Zuordnung
- **[Abteilungen](./abteilungen.md)** - Abteilungs-Kostenstellen-Verknüpfung
- **[Lohnexporte](./lohnexporte.md)** - Export nach Kostenstellen
- **[Berichte](./berichte.md)** - Kostenstellenauswertungen
