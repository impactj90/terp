# Berichte - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Berichte** ermöglicht die Erstellung und Verwaltung von standardisierten Auswertungen. Berichte können nach Bedarf generiert und als PDF oder CSV exportiert werden. Es stehen verschiedene Berichtstypen für unterschiedliche Auswertungszwecke zur Verfügung.

**Wer nutzt dieses Modul:**
- Personaladministratoren für Standardberichte
- Controlling für Analysen
- Geschäftsführung für Management-Berichte

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Daten & Berichte → Berichte

**Direkte URL:** `/admin/reports`

## Funktionen & Bedienelemente

### 1. Seitenheader & Toolbar
- **Titel**: "Berichte"
- **Bericht generieren**: Neuen Bericht erstellen
- **Filter**: Nach Typ, Datum, Status

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Berichtsname |
| **Typ** | Berichtsart |
| **Zeitraum** | Abgedeckter Zeitraum |
| **Erstellt** | Erstellungsdatum |
| **Status** | In Bearbeitung/Fertig/Fehler |
| **Aktionen** | Download, Details, Löschen |

### 3. Generieren-Dialog

#### Berichtstypen
- **Monatsübersicht**: Alle Mitarbeiter für einen Monat
- **Abteilungsauswertung**: Auswertung nach Abteilung
- **Teamstatistik**: Team-basierte Analyse
- **Urlaubsübersicht**: Urlaubsstatus aller Mitarbeiter
- **Überstundenanalyse**: Überstundenauswertung
- **Krankheitsstatistik**: Krankheitstage-Auswertung
- **Projektauswertung**: Auftragsbezogene Zeiten

#### Parameter
- **Zeitraum**: Von-Bis oder Monat/Jahr
- **Filter**: Abteilung, Team, Mitarbeiter
- **Format**: PDF, CSV, Excel
- **Optionen**: Je nach Berichtstyp

### 4. Detail-Sheet
- Berichtsparameter
- Vorschau (falls verfügbar)
- Download-Optionen

## Schritt-für-Schritt Anleitungen

### Monatsbericht generieren

1. Klicken Sie auf **"Bericht generieren"**
2. Wählen Sie **Typ**: "Monatsübersicht"
3. Wählen Sie **Monat und Jahr**
4. Optional: Filter nach Abteilung
5. Wählen Sie das **Format**
6. Klicken Sie auf **"Generieren"**
7. Warten Sie auf die Fertigstellung
8. Laden Sie den Bericht herunter

### Abteilungsbericht erstellen

1. Klicken Sie auf **"Bericht generieren"**
2. Wählen Sie **Typ**: "Abteilungsauswertung"
3. Wählen Sie die **Abteilung**
4. Definieren Sie den **Zeitraum**
5. Generieren Sie den Bericht

### Urlaubsübersicht erstellen

1. Klicken Sie auf **"Bericht generieren"**
2. Wählen Sie **Typ**: "Urlaubsübersicht"
3. Wählen Sie das **Jahr**
4. Optional: Filter nach Team
5. Generieren und herunterladen

### Bericht herunterladen

1. Finden Sie den Bericht in der Tabelle
2. Prüfen Sie den **Status** (muss "Fertig" sein)
3. Klicken Sie auf **"Download"**
4. Die Datei wird heruntergeladen

### Alten Bericht löschen

1. Finden Sie den Bericht
2. Klicken Sie auf **"Löschen"**
3. Bestätigen Sie
4. Der Bericht wird entfernt

## Verfügbare Berichtstypen

| Typ | Inhalt | Typische Nutzung |
|-----|--------|------------------|
| Monatsübersicht | Alle Mitarbeiterdaten eines Monats | Monatliche Prüfung |
| Abteilungsbericht | Aggregierte Abteilungsdaten | Abteilungsvergleich |
| Teambericht | Team-Statistiken | Teamleiter-Meeting |
| Urlaubsübersicht | Urlaubsstände aller MA | Jahresplanung |
| Überstunden | Überstundenverteilung | Controlling |
| Krankheit | Krankheitstage-Analyse | HR-Reporting |
| Projektzeiten | Auftragsbezogene Zeiten | Projektabrechnung |

## Auswirkungen auf andere Module

Berichte aggregieren Daten aus verschiedenen Quellen:

| Datenquelle | Berichtsverwendung |
|-------------|-------------------|
| **Monatswerte** | Basis für Zeitberichte |
| **Urlaubssalden** | Urlaubsberichte |
| **Buchungen** | Detailauswertungen |
| **Aufträge** | Projektberichte |

## Tipps & Best Practices

1. **Regelmäßige Berichte**: Monatliche Routine einrichten.
2. **Filter sinnvoll nutzen**: Zielgerichtete Auswertungen.
3. **PDF für Archivierung**: PDFs für langfristige Ablage.
4. **CSV für Weiterverarbeitung**: CSV für Excel-Analysen.
5. **Alte Berichte aufräumen**: Regelmäßig nicht mehr benötigte löschen.

## Problembehandlung

### Bericht bleibt "In Bearbeitung"
**Ursache**: Große Datenmenge oder Systemlast.
**Lösung**: Warten Sie oder versuchen Sie es später erneut.

### Bericht zeigt Fehler
**Ursache**: Fehlende Daten oder Konfigurationsproblem.
**Lösung**: Prüfen Sie die Parameter und Datengrundlage.

### Download funktioniert nicht
**Ursache**: Browser-Popup-Blocker.
**Lösung**: Erlauben Sie Popups für diese Seite.

## Verwandte Module

- **[Monatswerte](./monatswerte.md)** - Datenquelle
- **[Auswertungen](./auswertungen.md)** - Detailansichten
- **[Lohnexporte](./lohnexporte.md)** - Spezielle Exporte
