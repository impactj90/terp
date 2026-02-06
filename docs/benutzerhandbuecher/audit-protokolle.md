# Audit-Protokolle - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Audit-Protokolle** bietet eine vollständige Nachverfolgung aller Systemaktivitäten. Jede Änderung an Daten wird protokolliert und kann hier eingesehen werden. Dies dient der Compliance, Fehlersuche und Nachvollziehbarkeit.

**Wer nutzt dieses Modul:**
- Systemadministratoren für Fehleranalyse
- Compliance-Beauftragte für Prüfungen
- Zur Nachverfolgung von Änderungen

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Systemadministration → Audit-Protokolle

**Direkte URL:** `/admin/audit-logs`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Audit-Protokolle"
- Keine Bearbeitungsfunktionen (nur Lesen)

### 2. Filter
- **Zeitraum**: Von-Bis Datum
- **Benutzer**: Nach ausführendem Benutzer
- **Aktion**: Erstellen/Ändern/Löschen
- **Objekttyp**: Mitarbeiter/Buchung/etc.
- **Suche**: Volltextsuche

### 3. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Zeitstempel** | Wann |
| **Benutzer** | Wer |
| **Aktion** | Was (Create/Update/Delete) |
| **Objekttyp** | Betroffener Bereich |
| **Objekt** | Betroffenes Element |
| **Änderungen** | Übersicht der Änderung |
| **Details** | Mehr anzeigen |

### 4. JSON-Diff-Ansicht
Bei Klick auf Details:
- **Vorher**: Alter Zustand
- **Nachher**: Neuer Zustand
- **Farbmarkierung**: Geänderte Felder
- **Vollständiges JSON**: Technische Details

### 5. Detail-Sheet
Vollständige Protokollinformationen:
- Zeitstempel
- IP-Adresse (falls verfügbar)
- Browser/Client-Info
- Vollständiger Vorher/Nachher-Vergleich

## Schritt-für-Schritt Anleitungen

### Änderungen nachverfolgen

1. Setzen Sie die **Filter** (Zeitraum, Benutzer, etc.)
2. Suchen Sie den relevanten Eintrag
3. Klicken Sie auf **"Details"**
4. Sehen Sie den Vorher/Nachher-Vergleich

### Benutzeraktivität prüfen

1. Filtern Sie nach **Benutzer**
2. Setzen Sie den **Zeitraum**
3. Sehen Sie alle Aktionen dieses Benutzers
4. Analysieren Sie das Aktivitätsmuster

### Änderungen an einem Objekt finden

1. Nutzen Sie die **Suche** mit dem Objektnamen
2. Oder filtern Sie nach **Objekttyp**
3. Finden Sie alle Änderungen am Objekt

### Gelöschte Daten wiederfinden

1. Filtern Sie nach **Aktion**: "Delete"
2. Setzen Sie den **Zeitraum**
3. Finden Sie den Löschvorgang
4. Die **Details** zeigen den gelöschten Zustand

### Protokolle exportieren

1. Setzen Sie die gewünschten Filter
2. Klicken Sie auf **"Export"**
3. Wählen Sie das Format
4. Die Protokolle werden heruntergeladen

## Protokollierte Aktionen

| Aktion | Beschreibung |
|--------|--------------|
| **Create** | Neues Element erstellt |
| **Update** | Bestehendes Element geändert |
| **Delete** | Element gelöscht |
| **Login** | Benutzeranmeldung |
| **Logout** | Benutzerabmeldung |
| **PasswordChange** | Passwort geändert |
| **Export** | Datenexport durchgeführt |

## Protokollierte Objekttypen

| Typ | Beispiele |
|-----|-----------|
| User | Benutzerkonten |
| Employee | Mitarbeiterdaten |
| Booking | Zeitbuchungen |
| Absence | Abwesenheiten |
| Approval | Genehmigungen |
| Settings | Einstellungsänderungen |

## Auswirkungen auf andere Module

Das Audit-Log protokolliert Änderungen aus allen Modulen:
- Es werden keine Daten geändert
- Nur Leserechte erforderlich
- Protokolle werden automatisch erstellt

## Tipps & Best Practices

1. **Regelmäßige Prüfung**: Stichprobenartige Kontrollen.
2. **Bei Problemen**: Audit-Log als erste Anlaufstelle.
3. **Compliance**: Für Prüfungen exportieren.
4. **Filter nutzen**: Große Datenmengen eingrenzen.
5. **Aufbewahrung**: Exportierte Protokolle archivieren.

## Problembehandlung

### Keine Einträge gefunden
**Ursache**: Filter zu streng oder keine Aktivität.
**Lösung**: Filter zurücksetzen oder Zeitraum erweitern.

### JSON-Diff unlesbar
**Lösung**: Große Objekte enthalten viele Details. Fokussieren Sie auf geänderte Felder (farbig markiert).

### Protokoll zeigt [System]
**Bedeutung**: Automatische Systemaktion, kein Benutzer.

## Verwandte Module

- **[Benutzer](./benutzer.md)** - Benutzeraktionen
- **[Einstellungen](./einstellungen.md)** - Systemkonfiguration
- **[Auswertungen](./auswertungen.md)** - Datenanalyse
