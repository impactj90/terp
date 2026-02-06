# Monatswerte - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Monatswerte** zeigt die aggregierten Zeitdaten aller Mitarbeiter pro Monat. Hier können Monatswerte geprüft, neuberechnet und abgeschlossen werden. Das Modul ist zentral für die Lohnvorbereitung und den Monatsabschluss.

**Wer nutzt dieses Modul:**
- Personaladministratoren für den Monatsabschluss
- Controlling für Auswertungen
- Für die Lohnvorbereitung

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.
2. **Tageswerte berechnet**: Tägliche Werte müssen vorliegen.

## Zugang zum Modul

**Navigationspfad:** Admin → Daten & Berichte → Monatswerte

**Direkte URL:** `/admin/monthly-values`

## Funktionen & Bedienelemente

### 1. Seitenheader & Toolbar
- **Titel**: "Monatswerte"
- **Monat/Jahr-Auswahl**: Zeitraum wählen
- **Neuberechnung**: Werte neu berechnen
- **Batch-Aktionen**: Massen-Abschluss/Öffnen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Auswahlbox** | Für Mehrfachauswahl |
| **Mitarbeiter** | Name |
| **Sollstunden** | Geplante Arbeitszeit |
| **Iststunden** | Tatsächliche Arbeitszeit |
| **Saldo** | Differenz |
| **Gleitzeit** | Kumulierter Stand |
| **Status** | Offen/Abgeschlossen |
| **Aktionen** | Details, Neuberechnung |

### 3. Toolbar
- **Monat/Jahr**: Dropdown-Auswahl
- **Status-Filter**: Offen/Abgeschlossen/Alle
- **Abteilungs-Filter**: Nach Abteilung
- **Suche**: Nach Mitarbeiter

### 4. Detail-Ansicht (Detail Sheet)
- Vollständige Monatswerte
- Aufschlüsselung nach Konten
- Tageswerte-Übersicht
- Buchungsliste

### 5. Neuberechnen-Dialog
- **Mitarbeiterauswahl**: Einzeln oder mehrere
- **Optionen**: Tageswerte auch neu berechnen
- **Fortschrittsanzeige**: Bei Massenberechnung

### 6. Batch-Abschluss-Dialog
Massen-Abschluss von Monaten:
- **Mitarbeiterauswahl**: Alle oder Auswahl
- **Bestätigung**: Mit Warnung bei Auffälligkeiten

### 7. Batch-Wiedereröffnen-Dialog
Massen-Wiedereröffnung:
- **Mitarbeiterauswahl**: Alle oder Auswahl
- **Begründung**: Pflichtfeld
- **Warnung**: Bei bereits exportierten Werten

## Schritt-für-Schritt Anleitungen

### Monatswerte prüfen

1. Wählen Sie den **Monat/Jahr**
2. Prüfen Sie die Tabelle auf Auffälligkeiten
3. Achten Sie auf:
   - Große Salden (positiv oder negativ)
   - Fehlende Iststunden
   - Offene vs. abgeschlossene Status
4. Klicken Sie auf einzelne Zeilen für Details

### Einzelnen Monatswert neuberechnen

1. Finden Sie den Mitarbeiter
2. Klicken Sie auf **"Neuberechnen"**
3. Wählen Sie, ob Tageswerte auch neu berechnet werden sollen
4. Bestätigen Sie
5. Der Wert wird aktualisiert

### Alle Monatswerte neuberechnen

1. Klicken Sie auf **"Neuberechnung"** in der Toolbar
2. Wählen Sie **"Alle"** oder filtern Sie
3. Aktivieren Sie ggf. **"Tageswerte einschließen"**
4. Bestätigen Sie
5. Warten Sie auf die Fertigmeldung

### Monate massenweise abschließen

1. Aktivieren Sie die **Auswahlboxen** der Mitarbeiter
2. Oder klicken Sie auf **"Alle auswählen"**
3. Klicken Sie auf **"Batch-Abschluss"**
4. Prüfen Sie die Zusammenfassung
5. Bestätigen Sie
6. Alle ausgewählten Monate werden abgeschlossen

### Monate massenweise wiedereröffnen

1. Wählen Sie die abgeschlossenen Monate
2. Klicken Sie auf **"Batch-Wiedereröffnen"**
3. Geben Sie eine **Begründung** ein
4. Bestätigen Sie
5. Die Monate werden wieder geöffnet

### Nach Status filtern

1. Nutzen Sie den **Status-Filter**
2. Wählen Sie "Offen" für noch zu bearbeitende Werte
3. Oder "Abgeschlossen" für fertige Werte

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Monatsauswertung** | Basis für Mitarbeiter-Ansicht |
| **Jahresübersicht** | Aggregation der Monatswerte |
| **Lohnexport** | Quelle für Export |
| **Berichte** | Datengrundlage |

## Tipps & Best Practices

1. **Monatliche Routine**: Am Monatsanfang Vormonat prüfen.
2. **Vor Export prüfen**: Alle Werte vor Lohnexport kontrollieren.
3. **Auffälligkeiten klären**: Große Salden vor Abschluss klären.
4. **Neuberechnung mit Bedacht**: Bei großen Datenmengen zeitversetzt.
5. **Dokumentieren**: Gründe für Wiedereröffnung festhalten.

## Problembehandlung

### Monatswerte fehlen
**Ursache**: Tageswerte nicht berechnet.
**Lösung**: Lösen Sie eine Neuberechnung mit Tageswerten aus.

### Abschluss nicht möglich
**Ursache**: Fehlende Daten oder Berechtigungen.
**Lösung**: Prüfen Sie auf fehlende Tageswerte.

### Werte stimmen nicht
**Ursache**: Buchungen nachträglich geändert.
**Lösung**: Neuberechnung durchführen.

### Wiedereröffnung blockiert
**Ursache**: Bereits exportiert.
**Lösung**: Kontaktieren Sie den Systemadministrator.

## Verwandte Module

- **[Monatsauswertung](./monatsauswertung.md)** - Mitarbeiter-Ansicht
- **[Lohnexporte](./lohnexporte.md)** - Export der Werte
- **[Konten](./konten.md)** - Kontenaufschlüsselung
