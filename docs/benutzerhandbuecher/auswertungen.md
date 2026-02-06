# Auswertungen - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Auswertungen** bietet einen umfassenden Überblick über alle erfassten Zeitdaten. Hier können Buchungen, Tageswerte, Terminal-Buchungen, Logs und Workflow-Historien eingesehen und analysiert werden. Das Modul ist das zentrale Werkzeug für detaillierte Datenanalysen.

**Wer nutzt dieses Modul:**
- Personaladministratoren für Datenanalyse
- Controlling für Auswertungen
- Zur Fehlersuche und Nachverfolgung

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Daten & Berichte → Auswertungen

**Direkte URL:** `/admin/evaluations`

## Funktionen & Bedienelemente

### 1. Tab-Navigation
- **Buchungen**: Alle Zeitbuchungen
- **Tageswerte**: Berechnete Tageswerte
- **Terminal-Buchungen**: Stempelterminal-Daten
- **Logs**: Systemprotokoll
- **Workflow-Historie**: Genehmigungshistorie

### 2. Gemeinsame Filter (für alle Tabs)
- **Datumsbereich**: Von-Bis
- **Mitarbeiter**: Einzelauswahl oder alle
- **Abteilung**: Filterung nach Abteilung
- **Team**: Filterung nach Team

### 3. Buchungen-Tab

| Spalte | Beschreibung |
|--------|--------------|
| **Datum** | Buchungsdatum |
| **Mitarbeiter** | Name |
| **Buchungsart** | Kommen/Gehen/etc. |
| **Zeit** | Gebuchte Uhrzeit |
| **Original** | Ursprüngliche Zeit |
| **Bearbeitet** | Geänderte Zeit |
| **Quelle** | Stempeluhr/Manuell/Terminal |

### 4. Tageswerte-Tab

| Spalte | Beschreibung |
|--------|--------------|
| **Datum** | Tag |
| **Mitarbeiter** | Name |
| **Soll** | Sollarbeitszeit |
| **Ist** | Istarbeitszeit |
| **Pause** | Pausenzeit |
| **Saldo** | Differenz |

### 5. Terminal-Buchungen-Tab
Rohdaten von Stempelterminals:

| Spalte | Beschreibung |
|--------|--------------|
| **Zeitstempel** | Stempelzeitpunkt |
| **Terminal** | Terminal-ID |
| **Karten-Nr** | Verwendete Karte |
| **Mitarbeiter** | Zugeordneter Mitarbeiter |
| **Verarbeitet** | Ja/Nein |

### 6. Logs-Tab
Systemereignisse:

| Spalte | Beschreibung |
|--------|--------------|
| **Zeitstempel** | Wann |
| **Typ** | Info/Warnung/Fehler |
| **Nachricht** | Ereignisbeschreibung |
| **Benutzer** | Auslösender Benutzer |

### 7. Workflow-Historie-Tab
Genehmigungsverlauf:

| Spalte | Beschreibung |
|--------|--------------|
| **Datum** | Ereignisdatum |
| **Typ** | Antrag/Genehmigung/Ablehnung |
| **Objekt** | Betroffener Antrag |
| **Aktion** | Durchgeführte Aktion |
| **Benutzer** | Akteur |

### 8. Detail-Sheet
Bei Klick auf eine Zeile:
- Vollständige Details
- Verknüpfte Daten
- Änderungshistorie

## Schritt-für-Schritt Anleitungen

### Buchungen analysieren

1. Wechseln Sie zum Tab **"Buchungen"**
2. Setzen Sie die **Filter** (Datum, Mitarbeiter)
3. Prüfen Sie die Buchungsliste
4. Klicken Sie auf eine Zeile für Details
5. Identifizieren Sie Auffälligkeiten

### Tageswerte prüfen

1. Wechseln Sie zum Tab **"Tageswerte"**
2. Filtern Sie nach Zeitraum
3. Achten Sie auf Zeilen ohne Ist-Werte
4. Prüfen Sie große Salden

### Terminal-Probleme untersuchen

1. Wechseln Sie zum Tab **"Terminal-Buchungen"**
2. Filtern Sie nach dem Zeitraum des Problems
3. Prüfen Sie "Verarbeitet = Nein" Einträge
4. Identifizieren Sie fehlgeschlagene Zuordnungen

### Genehmigungshistorie nachvollziehen

1. Wechseln Sie zum Tab **"Workflow-Historie"**
2. Filtern Sie nach Mitarbeiter oder Datum
3. Sehen Sie alle Genehmigungsaktionen
4. Identifizieren Sie den Verlauf eines Antrags

### Daten exportieren

1. Setzen Sie die gewünschten Filter
2. Klicken Sie auf **"Export"**
3. Wählen Sie das Format
4. Die Daten werden heruntergeladen

## Auswirkungen auf andere Module

| Modul | Beziehung |
|-------|-----------|
| **Stundenzettel** | Buchungen werden hier angezeigt |
| **Tageswerte** | Berechnete Daten |
| **Genehmigungen** | Workflow-Historie |

## Tipps & Best Practices

1. **Filter nutzen**: Große Datenmengen durch Filter eingrenzen.
2. **Regelmäßige Prüfung**: Wöchentlich auf Auffälligkeiten prüfen.
3. **Terminal-Logs**: Bei Stempelproblemen zuerst hier prüfen.
4. **Export für Berichte**: Für detaillierte Analysen exportieren.

## Problembehandlung

### Keine Daten angezeigt
**Ursache**: Filter zu streng oder keine Daten vorhanden.
**Lösung**: Filter zurücksetzen oder Zeitraum erweitern.

### Buchung ohne Mitarbeiterzuordnung
**Ursache**: Karte nicht zugeordnet.
**Lösung**: Prüfen Sie die Kartenzuordnung im Mitarbeiterprofil.

### Tageswert fehlt
**Ursache**: Keine Buchungen oder Berechnung ausstehend.
**Lösung**: Lösen Sie eine Neuberechnung aus.

## Verwandte Module

- **[Stundenzettel](./stundenzettel.md)** - Buchungsanzeige
- **[Monatswerte](./monatswerte.md)** - Aggregierte Werte
- **[Korrekturassistent](./korrekturassistent.md)** - Fehler beheben
