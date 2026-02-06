# Lohnexporte - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Lohnexporte** ermöglicht die Erstellung und Verwaltung von Exportdateien für die Lohnabrechnung. Monatswerte werden über konfigurierte Schnittstellen in das Format der Lohnsoftware exportiert.

**Wer nutzt dieses Modul:**
- Lohnbuchhaltung für den monatlichen Export
- Personaladministratoren zur Exportverwaltung

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.
2. **Schnittstelle konfiguriert**: Export-Schnittstelle muss existieren.
3. **Monatswerte abgeschlossen**: Monate sollten abgeschlossen sein.

## Zugang zum Modul

**Navigationspfad:** Admin → Daten & Berichte → Lohnexporte

**Direkte URL:** `/admin/payroll-exports`

## Funktionen & Bedienelemente

### 1. Seitenheader & Toolbar
- **Titel**: "Lohnexporte"
- **Export erstellen**: Neuen Export generieren
- **Monat/Jahr-Auswahl**: Zeitraum wählen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Monat/Jahr** | Exportierter Zeitraum |
| **Schnittstelle** | Verwendete Schnittstelle |
| **Erstellt** | Erstellungsdatum |
| **Mitarbeiter** | Anzahl exportierter MA |
| **Status** | Erstellt/Übertragen/Fehler |
| **Aktionen** | Download, Vorschau, Details |

### 3. Toolbar
- **Schnittstellen-Auswahl**: Filter nach Schnittstelle
- **Status-Filter**: Nach Exportstatus

### 4. Export-Generieren-Dialog

#### Parameter
- **Monat/Jahr**: Zu exportierender Zeitraum
- **Schnittstelle**: Export-Format auswählen
- **Mitarbeiter**: Alle oder Auswahl

#### Vorprüfung
- **Nicht abgeschlossene Monate**: Warnung
- **Fehlende Daten**: Hinweis
- **Bereits exportiert**: Warnung bei Doppelexport

### 5. Vorschau
Vor dem Download:
- Anzahl Datensätze
- Summen und Kontrolldaten
- Einzelwerte prüfbar

### 6. Detail-Sheet
- Export-Parameter
- Exportierte Mitarbeiter
- Einzelwerte
- Download-Historie

## Schritt-für-Schritt Anleitungen

### Monatlichen Export erstellen

1. Klicken Sie auf **"Export erstellen"**
2. Wählen Sie **Monat und Jahr**
3. Wählen Sie die **Schnittstelle**
4. Optional: Mitarbeiter einschränken
5. Prüfen Sie die **Vorprüfungsmeldungen**
6. Klicken Sie auf **"Generieren"**
7. Warten Sie auf die Erstellung
8. Laden Sie die Datei herunter

### Vorschau prüfen

1. Finden Sie den Export in der Tabelle
2. Klicken Sie auf **"Vorschau"**
3. Prüfen Sie Summen und Werte
4. Bei Unstimmigkeiten: Nicht verwenden

### Export herunterladen

1. Finden Sie den fertigen Export
2. Klicken Sie auf **"Download"**
3. Die Datei wird heruntergeladen
4. Importieren Sie in Ihre Lohnsoftware

### Export-Details einsehen

1. Klicken Sie auf **"Details"**
2. Sehen Sie alle exportierten Mitarbeiter
3. Prüfen Sie Einzelwerte
4. Identifizieren Sie Abweichungen

### Korrekturexport erstellen

1. Bei Fehlern im ursprünglichen Export
2. Korrigieren Sie die Monatswerte
3. Erstellen Sie einen neuen Export
4. **Hinweis**: Koordinieren Sie mit der Lohnbuchhaltung

## Auswirkungen auf andere Module

| Modul | Beziehung |
|-------|-----------|
| **Monatswerte** | Datenquelle für Export |
| **Export-Schnittstellen** | Formatdefinition |
| **Konten** | Lohnarten-Zuordnung |

## Tipps & Best Practices

1. **Monate abschließen**: Vor Export alle Monate abschließen.
2. **Vorschau nutzen**: Immer Vorschau vor Download prüfen.
3. **Zeitpunkt festlegen**: Festen Exporttermin im Monat.
4. **Archivieren**: Exportdateien aufbewahren.
5. **Kommunikation**: Mit Lohnbuchhaltung abstimmen.

## Problembehandlung

### Export zeigt Warnung "Nicht abgeschlossen"
**Ursache**: Monate sind noch offen.
**Lösung**: Schließen Sie die Monatswerte ab.

### Werte stimmen nicht mit Lohnsoftware
**Ursache**: Mapping-Problem oder Rundungsdifferenzen.
**Lösung**: Prüfen Sie das Konten-Mapping in der Schnittstelle.

### Mitarbeiter fehlt im Export
**Ursache**: Keine Monatswerte oder inaktiv.
**Lösung**: Prüfen Sie die Monatswerte des Mitarbeiters.

### Doppelter Export
**Lösung**: Koordinieren Sie mit der Lohnbuchhaltung, welcher Export gilt.

## Verwandte Module

- **[Export-Schnittstellen](./export-schnittstellen.md)** - Schnittstellen konfigurieren
- **[Monatswerte](./monatswerte.md)** - Daten abschließen
- **[Konten](./konten.md)** - Lohnarten-Zuordnung
