# Genehmigungen - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Genehmigungen** ist die zentrale Stelle für die Bearbeitung von Anträgen, die einer Freigabe bedürfen. Hier sehen Genehmiger alle ausstehenden Abwesenheitsanträge, Stundenzettelbuchungen und andere genehmigungspflichtige Vorgänge und können diese genehmigen oder ablehnen.

**Wer nutzt dieses Modul:**
- Teamleiter zur Genehmigung von Teamanträgen
- Vorgesetzte zur Genehmigung von Mitarbeiteranträgen
- Personaladministratoren für übergreifende Genehmigungen

## Voraussetzungen

1. **Genehmiger-Berechtigung**: Sie müssen als Genehmiger für Mitarbeiter oder Teams definiert sein.
2. **Offene Anträge**: Es müssen genehmigungspflichtige Anträge vorliegen.

## Zugang zum Modul

**Navigationspfad:** Admin → Personal → Genehmigungen

**Direkte URL:** `/admin/approvals`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Genehmigungen"
- **Anträge-Zähler**: Anzahl offener Anträge

### 2. Tab-Navigation
Verschiedene Antragsarten:
- **Abwesenheiten**: Urlaubs- und Abwesenheitsanträge
- **Stundenzettel**: Manuelle Buchungen zur Genehmigung
- **Alle**: Kombinierte Ansicht aller Anträge

### 3. Filter
- **Status-Filter**: Ausstehend, Genehmigt, Abgelehnt, Alle
- **Zeitraum-Filter**: Anträge nach Erstellungsdatum
- **Mitarbeiter-Suche**: Nach spezifischem Mitarbeiter filtern
- **Team-Filter**: Nach Team filtern

### 4. Abwesenheits-Genehmigungstabelle
Übersicht der Abwesenheitsanträge:

| Spalte | Beschreibung |
|--------|--------------|
| **Auswahlbox** | Für Mehrfachauswahl |
| **Mitarbeiter** | Name des Antragstellers |
| **Abwesenheitsart** | Urlaub, Krankheit, etc. |
| **Zeitraum** | Von-Bis-Datum |
| **Tage** | Anzahl der beantragten Tage |
| **Status** | Ausstehend/Genehmigt/Abgelehnt |
| **Erstellt am** | Antragsdatum |
| **Aktionen** | Genehmigen, Ablehnen, Details |

### 5. Stundenzettel-Genehmigungstabelle
Übersicht der Buchungsanträge:

| Spalte | Beschreibung |
|--------|--------------|
| **Mitarbeiter** | Name des Mitarbeiters |
| **Datum** | Buchungsdatum |
| **Buchungsart** | Art der Buchung |
| **Uhrzeit** | Gebuchte Zeit |
| **Notiz** | Begründung des Mitarbeiters |
| **Status** | Ausstehend/Genehmigt/Abgelehnt |
| **Aktionen** | Genehmigen, Ablehnen, Details |

### 6. Bulk-Aktionen
Aktionen für mehrere Anträge gleichzeitig:
- **Alle Ausgewählten genehmigen**: Massenfreigabe
- **Alle Ausgewählten ablehnen**: Massenablehnung

### 7. Ablehnungsdialog (Reject Dialog)
Bei Ablehnung eines Antrags:
- **Ablehnungsgrund**: Pflicht-Textfeld
- **Benachrichtigung**: Option zur Benachrichtigung des Antragstellers

### 8. Entscheidungsbestätigung (Decision Toast)
Nach einer Entscheidung:
- Bestätigung der Aktion
- Möglichkeit zum Rückgängigmachen (kurzes Zeitfenster)

## Schritt-für-Schritt Anleitungen

### Offene Anträge prüfen

1. Navigieren Sie zu **Genehmigungen**
2. Der Tab zeigt die Anzahl offener Anträge
3. Prüfen Sie die Liste ausstehender Anträge
4. Klicken Sie auf einen Antrag für Details

### Einzelnen Antrag genehmigen

1. Finden Sie den Antrag in der Tabelle
2. Prüfen Sie die Details (Zeitraum, Art, etc.)
3. Klicken Sie auf **"Genehmigen"** (Häkchen-Symbol)
4. Der Antrag wird als genehmigt markiert
5. Der Antragsteller wird benachrichtigt

### Einzelnen Antrag ablehnen

1. Finden Sie den Antrag in der Tabelle
2. Klicken Sie auf **"Ablehnen"** (X-Symbol)
3. Das **Ablehnungsdialog** öffnet sich
4. Geben Sie einen **Ablehnungsgrund** ein
5. Klicken Sie auf **"Ablehnen"**
6. Der Antragsteller wird mit Begründung benachrichtigt

### Mehrere Anträge gleichzeitig genehmigen

1. Aktivieren Sie die **Auswahlboxen** der gewünschten Anträge
2. Klicken Sie auf **"Alle Ausgewählten genehmigen"**
3. Bestätigen Sie die Aktion
4. Alle ausgewählten Anträge werden genehmigt

### Nach Team filtern

1. Nutzen Sie den **Team-Filter**
2. Wählen Sie das gewünschte Team
3. Nur Anträge dieses Teams werden angezeigt
4. Bearbeiten Sie die Anträge wie gewohnt

### Historische Entscheidungen einsehen

1. Ändern Sie den **Status-Filter** auf "Alle" oder "Genehmigt"/"Abgelehnt"
2. Nutzen Sie den **Zeitraum-Filter** für ältere Anträge
3. Prüfen Sie die Entscheidungshistorie

### Entscheidung rückgängig machen

1. Nach einer Entscheidung erscheint ein **Toast**
2. Klicken Sie auf **"Rückgängig"** innerhalb weniger Sekunden
3. Die Entscheidung wird zurückgenommen
4. Der Antrag ist wieder ausstehend

## Auswirkungen auf andere Module

Genehmigungsentscheidungen wirken sich auf mehrere Bereiche aus:

| Modul | Auswirkung |
|-------|------------|
| **Abwesenheiten** | Status der Anträge wird aktualisiert |
| **Urlaubssaldo** | Genehmigte Urlaube werden abgezogen |
| **Teamübersicht** | Genehmigte Abwesenheiten werden angezeigt |
| **Stundenzettel** | Genehmigte Buchungen werden aktiv |
| **Benachrichtigungen** | Antragsteller werden informiert |
| **Lohnexport** | Nur genehmigte Daten werden exportiert |

## Tipps & Best Practices

1. **Zeitnahe Bearbeitung**: Bearbeiten Sie Anträge zeitnah, um Planungssicherheit zu geben.

2. **Tägliche Prüfung**: Prüfen Sie täglich auf neue Anträge.

3. **Begründung bei Ablehnung**: Geben Sie immer eine hilfreiche Begründung bei Ablehnungen.

4. **Team-Filter nutzen**: Bei vielen Anträgen nach Teams oder Mitarbeitern filtern.

5. **Bulk-Aktionen mit Vorsicht**: Prüfen Sie sorgfältig, bevor Sie Bulk-Aktionen ausführen.

6. **Kalender prüfen**: Vor Urlaubsgenehmigung den Teamkalender auf Überlappungen prüfen.

7. **Kommunikation**: Bei Unklarheiten direkt mit dem Mitarbeiter sprechen.

## Problembehandlung

### Keine Anträge sichtbar
**Ursache**: Keine offenen Anträge oder Sie sind nicht als Genehmiger definiert.
**Lösung**: Prüfen Sie Ihre Genehmiger-Berechtigungen. Möglicherweise wurden alle Anträge bereits bearbeitet.

### Antrag kann nicht genehmigt werden
**Ursache**: Technischer Fehler oder unzureichende Berechtigungen.
**Lösung**: Aktualisieren Sie die Seite. Prüfen Sie, ob Sie Genehmiger für diesen Mitarbeiter sind.

### Mitarbeiter erscheint nicht
**Ursache**: Sie sind nicht als Genehmiger für diesen Mitarbeiter konfiguriert.
**Lösung**: Kontaktieren Sie den Administrator zur Prüfung der Genehmigerkette.

### Ablehnungsgrund wird nicht gespeichert
**Ursache**: Textfeld zu kurz oder technischer Fehler.
**Lösung**: Geben Sie eine ausführlichere Begründung ein oder versuchen Sie es erneut.

### Benachrichtigung wurde nicht gesendet
**Ursache**: E-Mail-Konfiguration oder Benachrichtigungseinstellungen.
**Lösung**: Prüfen Sie, ob der Mitarbeiter Benachrichtigungen aktiviert hat.

### Bulk-Aktion schlägt teilweise fehl
**Ursache**: Einzelne Anträge haben Konflikte.
**Lösung**: Bearbeiten Sie die fehlgeschlagenen Anträge einzeln und prüfen Sie die Details.

## Verwandte Module

- **[Abwesenheiten](./abwesenheiten.md)** - Abwesenheitsanträge stellen
- **[Stundenzettel](./stundenzettel.md)** - Zeitbuchungen verwalten
- **[Mitarbeiter](./mitarbeiter.md)** - Mitarbeiter und Vorgesetzte verwalten
- **[Teams](./teams.md)** - Teamleiter-Zuweisung
- **[Benachrichtigungen](./benachrichtigungen.md)** - Genehmigungsbenachrichtigungen
