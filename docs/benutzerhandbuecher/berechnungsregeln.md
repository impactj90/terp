# Berechnungsregeln - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Berechnungsregeln** ermöglicht die Definition von Regeln, wie Arbeitszeiten, Zuschläge und andere Werte berechnet werden. Hier können Überstundenregeln, Nachtarbeitszuschläge und andere Berechnungslogiken konfiguriert werden.

**Wer nutzt dieses Modul:**
- Personaladministratoren für Zeitberechnungsregeln
- Controlling für Zuschlagslogik
- Systemadministratoren für Systemkonfiguration

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Berechnung & Aufträge → Berechnungsregeln

**Direkte URL:** `/admin/calculation-rules`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Berechnungsregeln"
- **Regel hinzufügen**: Button zum Anlegen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Regelbezeichnung |
| **Typ** | Überstunden/Zuschlag/Rundung/etc. |
| **Priorität** | Anwendungsreihenfolge |
| **Aktiv** | Status |
| **Aktionen** | Bearbeiten, Details, Löschen |

### 3. Formular (Form Sheet)

#### Grunddaten
- **Name** (Pflicht): Bezeichnung
- **Typ**: Regeltyp auswählen
- **Priorität**: Reihenfolge bei Konflikten
- **Beschreibung**: Optionale Details

#### Typ-spezifische Einstellungen

**Überstundenregel:**
- Ab wann zählt als Überstunde
- Schwelle in Stunden/Tag oder Woche
- Zuschlagssatz

**Nachtzuschlag:**
- Zeitraum (z.B. 22:00 - 06:00)
- Zuschlagssatz

**Sonntagszuschlag:**
- Gültige Tage
- Zuschlagssatz

**Rundungsregel:**
- Auf welche Einheit runden (5 Min, 15 Min)
- Wann runden (Start, Ende, Beide)
- Richtung (auf, ab, kaufmännisch)

### 4. Detail-Ansicht
- Vollständige Regelkonfiguration
- Anwendungsbereich (alle/bestimmte Mitarbeiter)
- Berechnungsbeispiele

## Schritt-für-Schritt Anleitungen

### Überstundenregel erstellen

1. Klicken Sie auf **"Regel hinzufügen"**
2. Wählen Sie **Typ**: "Überstunden"
3. Geben Sie einen **Namen** ein
4. Konfigurieren Sie:
   - **Schwelle**: z.B. 8 Stunden/Tag
   - **Zuschlag**: z.B. 25%
5. Setzen Sie **Priorität**
6. Speichern Sie

### Nachtzuschlagsregel erstellen

1. Klicken Sie auf **"Regel hinzufügen"**
2. Wählen Sie **Typ**: "Nachtzuschlag"
3. Definieren Sie:
   - **Beginn**: 22:00
   - **Ende**: 06:00
   - **Zuschlag**: 15%
4. Speichern Sie

### Rundungsregel erstellen

1. Klicken Sie auf **"Regel hinzufügen"**
2. Wählen Sie **Typ**: "Rundung"
3. Konfigurieren Sie:
   - **Einheit**: 15 Minuten
   - **Anwenden auf**: Arbeitsbeginn und -ende
   - **Richtung**: Kaufmännisch
4. Speichern Sie

### Regel deaktivieren

1. Finden Sie die Regel in der Tabelle
2. Klicken Sie auf **"Bearbeiten"**
3. Deaktivieren Sie **"Aktiv"**
4. Speichern Sie

## Typische Regeln

| Name | Typ | Beschreibung |
|------|-----|--------------|
| Überstunden >8h | Überstunden | 25% ab 8h/Tag |
| Nachtarbeit | Nachtzuschlag | 15% für 22-6 Uhr |
| Sonntagsarbeit | Sonntagszuschlag | 50% am Sonntag |
| 15-Min-Rundung | Rundung | Auf 15 Min runden |
| Feiertagszuschlag | Feiertagszuschlag | 100% an Feiertagen |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Tageswerte** | Berechnungen werden angewendet |
| **Monatswerte** | Zuschläge werden aggregiert |
| **Lohnexport** | Export der berechneten Werte |
| **Konten** | Zuordnung zu Zeitkonten |

## Tipps & Best Practices

1. **Prioritäten setzen**: Bei Überlappung gilt die höhere Priorität.
2. **Testen**: Vor Aktivierung mit Beispieldaten testen.
3. **Dokumentieren**: Beschreibung für Nachvollziehbarkeit nutzen.
4. **Reihenfolge beachten**: Rundung vor Zuschlagsberechnung.
5. **Gesetzliche Vorgaben**: Regelungen auf Gesetzeskonformität prüfen.

## Problembehandlung

### Regel wird nicht angewendet
**Ursache**: Regel inaktiv oder niedrige Priorität.
**Lösung**: Aktivieren Sie die Regel und prüfen Sie die Priorität.

### Zuschläge falsch berechnet
**Ursache**: Regel-Parameter falsch.
**Lösung**: Prüfen Sie Zeiträume und Prozentsätze.

### Konflikte zwischen Regeln
**Lösung**: Passen Sie die Prioritäten an.

## Verwandte Module

- **[Konten](./konten.md)** - Zeitkonten für Zuordnung
- **[Monatswerte](./monatswerte.md)** - Berechnete Werte einsehen
- **[Lohnexporte](./lohnexporte.md)** - Export der Werte
