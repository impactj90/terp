# Konten - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Konten** ermöglicht die Definition von Zeitkonten, auf die verschiedene Arbeitszeitwerte gebucht werden. Typische Konten sind Gleitzeit, Überstunden, Nachtarbeit oder Zuschlagskonten. Diese werden für die Abrechnung und den Lohnexport verwendet.

**Wer nutzt dieses Modul:**
- Personaladministratoren für Kontenkonfiguration
- Controlling für Auswertungen
- Für Lohnexport-Zuordnung

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Berechnung & Aufträge → Konten

**Direkte URL:** `/admin/accounts`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Konten"
- **Konto hinzufügen**: Button zum Anlegen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Nummer** | Kontonummer |
| **Name** | Bezeichnung |
| **Typ** | Stunden/Tage/Geld |
| **Kategorie** | Gleitzeit/Überstunden/Zuschläge |
| **Aktionen** | Bearbeiten, Details, Löschen |

### 3. Formular (Form Sheet)
- **Nummer** (Pflicht): Eindeutige Kontonummer
- **Name** (Pflicht): Bezeichnung
- **Typ**: Stunden, Tage oder Geldwert
- **Kategorie**: Klassifizierung
- **Lohnart**: Für Export-Zuordnung
- **Beschreibung**: Optionale Details

### 4. Detail-Ansicht
- Vollständige Konto-Informationen
- Verwendung in Berechnungsregeln
- Aktuelle Buchungen

## Schritt-für-Schritt Anleitungen

### Neues Konto anlegen

1. Klicken Sie auf **"Konto hinzufügen"**
2. Geben Sie eine **Nummer** ein (z.B. "100")
3. Geben Sie den **Namen** ein (z.B. "Gleitzeit")
4. Wählen Sie den **Typ** (Stunden)
5. Wählen Sie die **Kategorie** (Gleitzeit)
6. Optional: Lohnart für Export
7. Speichern Sie

### Konto bearbeiten

1. Finden Sie das Konto in der Tabelle
2. Klicken Sie auf **"Bearbeiten"**
3. Ändern Sie die gewünschten Werte
4. Speichern Sie

### Konto löschen

1. Stellen Sie sicher, dass das Konto nicht verwendet wird
2. Klicken Sie auf **"Löschen"**
3. Bestätigen Sie

## Typische Konten

| Nr. | Name | Typ | Kategorie |
|-----|------|-----|-----------|
| 100 | Gleitzeit | Stunden | Gleitzeit |
| 200 | Überstunden 25% | Stunden | Überstunden |
| 201 | Überstunden 50% | Stunden | Überstunden |
| 300 | Nachtarbeit | Stunden | Zuschläge |
| 400 | Sonntagsarbeit | Stunden | Zuschläge |
| 500 | Urlaub | Tage | Abwesenheit |
| 510 | Krankheit | Tage | Abwesenheit |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Berechnungsregeln** | Regeln buchen auf Konten |
| **Monatswerte** | Kontostände pro Monat |
| **Lohnexport** | Export nach Lohnarten |
| **Berichte** | Auswertung nach Konten |

## Tipps & Best Practices

1. **Systematische Nummern**: Verwenden Sie ein logisches Nummernschema.
2. **Klare Namen**: Eindeutige, beschreibende Bezeichnungen.
3. **Lohnarten zuordnen**: Für korrekten Export.
4. **Weniger ist mehr**: Nur benötigte Konten anlegen.

## Problembehandlung

### Konto kann nicht gelöscht werden
**Ursache**: Konto wird von Regeln oder Buchungen verwendet.
**Lösung**: Entfernen Sie zuerst alle Verknüpfungen.

### Konto erscheint nicht im Export
**Ursache**: Lohnart nicht zugeordnet.
**Lösung**: Weisen Sie eine Lohnart zu.

## Verwandte Module

- **[Berechnungsregeln](./berechnungsregeln.md)** - Regeln mit Konten verknüpfen
- **[Monatswerte](./monatswerte.md)** - Kontostände einsehen
- **[Lohnexporte](./lohnexporte.md)** - Export konfigurieren
