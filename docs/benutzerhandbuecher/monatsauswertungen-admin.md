# Monatsauswertungen (Vorlagen) - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Monatsauswertungen (Vorlagen)** ermöglicht die Definition von Vorlagen für monatliche Auswertungsberichte. Diese Vorlagen bestimmen, welche Daten und in welchem Format in Monatsauswertungen erscheinen.

**Wer nutzt dieses Modul:**
- Personaladministratoren für Berichtsvorlagen
- Controlling für Auswertungsformate

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Daten & Berichte → Monatsauswertungen

**Direkte URL:** `/admin/monthly-evaluations`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Monatsauswertungsvorlagen"
- **Vorlage hinzufügen**: Neue Vorlage erstellen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Vorlagenname |
| **Beschreibung** | Details |
| **Spalten** | Anzahl definierter Spalten |
| **Standard** | Ist Standard-Vorlage? |
| **Aktionen** | Bearbeiten, Kopieren, Löschen |

### 3. Formular (Form Sheet)
- **Name** (Pflicht): Vorlagenbezeichnung
- **Beschreibung**: Optionale Details
- **Als Standard setzen**: Ja/Nein

### 4. Detail-Ansicht
Konfiguration der Vorlagenspalten:
- Spaltenreihenfolge (Drag & Drop)
- Spaltenbezeichnung
- Datenquelle (Konto, Berechnung)
- Format (Stunden, Tage, Prozent)

## Schritt-für-Schritt Anleitungen

### Neue Vorlage erstellen

1. Klicken Sie auf **"Vorlage hinzufügen"**
2. Geben Sie einen **Namen** ein
3. Optional: Beschreibung
4. Speichern Sie
5. Konfigurieren Sie die Spalten in der Detail-Ansicht

### Spalten konfigurieren

1. Öffnen Sie die **Vorlagendetails**
2. Klicken Sie auf **"Spalte hinzufügen"**
3. Wählen Sie die **Datenquelle**
4. Definieren Sie **Bezeichnung** und **Format**
5. Ordnen Sie Spalten per **Drag & Drop**
6. Speichern Sie

### Vorlage als Standard setzen

1. Bearbeiten Sie die Vorlage
2. Aktivieren Sie **"Als Standard setzen"**
3. Speichern Sie
4. Diese Vorlage wird für neue Auswertungen verwendet

### Vorlage kopieren

1. Klicken Sie auf **"Kopieren"**
2. Vergeben Sie einen neuen Namen
3. Passen Sie bei Bedarf an
4. Speichern Sie

## Typische Spalten

| Spalte | Datenquelle | Format |
|--------|-------------|--------|
| Sollstunden | Monatswert.soll | HH:MM |
| Iststunden | Monatswert.ist | HH:MM |
| Saldo | Monatswert.saldo | +/-HH:MM |
| Überstunden | Konto 200 | HH:MM |
| Urlaubstage | Konto 500 | Tage |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Monatsauswertung** | Verwendet Vorlagen für Anzeige |
| **Berichte** | Vorlagen für Berichtsgenerierung |
| **Export** | Format für Exporte |

## Tipps & Best Practices

1. **Basis-Vorlage erstellen**: Eine Standard-Vorlage für allgemeine Nutzung.
2. **Spezialvorlagen**: Für Abteilungen mit besonderen Anforderungen.
3. **Reihenfolge bedenken**: Logische Spaltenreihenfolge.
4. **Formate konsistent**: Einheitliche Formatierung.

## Problembehandlung

### Vorlage nicht in Auswahl
**Ursache**: Vorlage inaktiv oder nicht als Standard.
**Lösung**: Aktivieren Sie die Vorlage oder setzen Sie sie als Standard.

### Spalte zeigt keine Daten
**Ursache**: Datenquelle falsch konfiguriert.
**Lösung**: Prüfen Sie die Spaltenkonfiguration.

## Verwandte Module

- **[Monatsauswertung](./monatsauswertung.md)** - Verwendet Vorlagen
- **[Monatswerte](./monatswerte.md)** - Datenquelle
- **[Konten](./konten.md)** - Für Spaltendefinition
