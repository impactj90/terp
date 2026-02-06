# Jahresübersicht - Benutzerhandbuch

## Überblick

Die **Jahresübersicht** zeigt Ihnen alle Monatsdaten eines Jahres auf einen Blick. Sie sehen die Entwicklung Ihres Gleitzeitkontos, Jahressummen und können einzelne Monate vergleichen. Dieses Modul ist besonders nützlich für die Jahresplanung und den Überblick über längere Zeiträume.

**Wer nutzt dieses Modul:**
- Alle Mitarbeiter für den Jahresüberblick ihrer Arbeitszeiten
- Zur Analyse des Gleitzeitverlaufs über das Jahr
- Administratoren für Mitarbeiteranalysen

## Voraussetzungen

Bevor Sie die Jahresübersicht nutzen können:

1. **Mitarbeiterdatensatz**: Sie müssen einen aktiven Mitarbeiterdatensatz im System haben.
2. **Monatswerte**: Für das Jahr sollten Monatswerte berechnet sein.

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Jahresübersicht

**Mobil:** Über das Seitenmenü

**Direkte URL:** `/year-overview`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Jahresübersicht"
- **Export-Buttons**: Jahresdaten exportieren (CSV/PDF)

### 2. Mitarbeiterauswahl (nur für Administratoren)
Dropdown zur Auswahl des Mitarbeiters für die Jahresansicht.

### 3. Jahresauswahl
Navigation zwischen Jahren:
- **Pfeiltasten**: Jahr vor/zurück
- **Jahresdropdown**: Direktauswahl
- **"Aktuelles Jahr"**: Schnellsprung

### 4. Jahres-Zusammenfassungskarten (Summary Cards)
Vier Karten mit den wichtigsten Jahreskennzahlen:

#### Gesamt-Sollstunden
- Summe aller geplanten Arbeitsstunden im Jahr
- Basierend auf Arbeitstagen und Tagesplan

#### Gesamt-Iststunden
- Tatsächlich geleistete Stunden im Jahr
- Summe aller Monatswerte

#### Jahressaldo
- Gesamtdifferenz Soll/Ist
- Kumulierte Über-/Minusstunden

#### Urlaubsstand
- Genommene vs. Anspruch
- Verbleibender Urlaub

### 5. Gleitzeitdiagramm (Flextime Chart)
Visuelle Darstellung des Gleitzeitverlaufs:
- **X-Achse**: Monate (Januar bis Dezember)
- **Y-Achse**: Gleitzeitstand in Stunden
- **Linie**: Verlauf des Gleitzeitkontos
- **Nulllinie**: Orientierungslinie

Farbcodierung:
- **Grün**: Positiver Bereich (Überstunden)
- **Rot**: Negativer Bereich (Minusstunden)

### 6. Monatliche Aufschlüsselung (Monthly Breakdown Table)
Detaillierte Tabelle aller Monate:

| Spalte | Beschreibung |
|--------|--------------|
| **Monat** | Name des Monats |
| **Sollstunden** | Geplante Arbeitszeit |
| **Iststunden** | Tatsächliche Arbeitszeit |
| **Saldo** | Monatliche Differenz |
| **Gleitzeit kumuliert** | Laufender Gleitzeitstand |
| **Status** | Offen/Abgeschlossen |

Klick auf eine Zeile führt zur Monatsauswertung.

## Schritt-für-Schritt Anleitungen

### Jahresüberblick erhalten

1. Navigieren Sie zur **Jahresübersicht**
2. Das aktuelle Jahr ist standardmäßig ausgewählt
3. Prüfen Sie die **Zusammenfassungskarten** für Gesamtzahlen
4. Das **Gleitzeitdiagramm** zeigt die Entwicklung

### Gleitzeitverlauf analysieren

1. Öffnen Sie die **Jahresübersicht**
2. Betrachten Sie das **Gleitzeitdiagramm**
3. Identifizieren Sie Monate mit starken Änderungen
4. Klicken Sie auf auffällige Monate für Details

### Vorjahr vergleichen

1. Nutzen Sie die **Jahresauswahl** (Pfeil links)
2. Wählen Sie das Vorjahr
3. Vergleichen Sie die Jahressummen
4. Analysieren Sie Unterschiede im Gleitzeitverlauf

### Zur Monatsauswertung navigieren

1. In der **monatlichen Aufschlüsselung**: Klicken Sie auf eine Zeile
2. Sie werden zur Monatsauswertung des gewählten Monats weitergeleitet

### Jahresdaten exportieren

1. Wählen Sie das gewünschte Jahr
2. Klicken Sie auf den **Export**-Button
3. Wählen Sie das Format (CSV oder PDF)
4. Die Jahresübersicht wird heruntergeladen

### Problemmonat identifizieren

1. Prüfen Sie die **Saldo-Spalte** in der Tabelle
2. Monate mit stark negativem Saldo erfordern Aufmerksamkeit
3. Prüfen Sie den **Status** (offene Monate können noch korrigiert werden)
4. Klicken Sie auf den Monat für Details

## Auswirkungen auf andere Module

Die Jahresübersicht aggregiert Daten aus verschiedenen Quellen:

| Datenquelle | Angezeigte Information |
|-------------|------------------------|
| **Monatswerte** | Basis für alle Jahresberechnungen |
| **Urlaubssaldo** | Urlaubsstand für die Anzeige |
| **Tagesplan** | Basis für Sollzeitberechnung |

Die Jahresübersicht selbst ändert keine Daten.

## Tipps & Best Practices

1. **Quartalsweise Prüfung**: Analysieren Sie Ihre Jahresübersicht quartalsweise.

2. **Gleitzeittrend beobachten**: Achten Sie auf den Trend im Gleitzeitdiagramm.

3. **Saisonale Muster**: Identifizieren Sie wiederkehrende Muster (z.B. mehr Überstunden vor Urlaubszeit).

4. **Jahresende planen**: Gegen Jahresende Gleitzeitstand und Resturlaub prüfen.

5. **Export für Gespräche**: Exportieren Sie die Übersicht für Jahresgespräche.

6. **Vorjahr als Benchmark**: Vergleichen Sie mit dem Vorjahr für Entwicklungen.

7. **Offene Monate abschließen**: Achten Sie darauf, dass vergangene Monate abgeschlossen sind.

## Problembehandlung

### "Kein Mitarbeiterdatensatz gefunden"
**Ursache**: Ihr Benutzerkonto ist nicht mit einem Mitarbeiterdatensatz verknüpft.
**Lösung**: Kontaktieren Sie Ihren Administrator.

### Monatsdaten fehlen
**Ursache**: Monatswerte wurden noch nicht berechnet.
**Lösung**: Warten Sie auf die Berechnung oder kontaktieren Sie den Administrator.

### Gleitzeitdiagramm zeigt keine Daten
**Ursache**: Keine abgeschlossenen Monate oder fehlende Berechnungen.
**Lösung**: Prüfen Sie, ob Monatswerte für das Jahr existieren.

### Jahressaldo erscheint falsch
**Ursache**: Einzelne Monate haben falsche Werte oder sind noch offen.
**Lösung**: Prüfen Sie die einzelnen Monate in der Tabelle und korrigieren Sie diese.

### Export nicht vollständig
**Ursache**: Nicht alle Monate haben Daten.
**Lösung**: Der Export enthält nur Monate mit vorhandenen Daten.

### Urlaubsstand nicht angezeigt
**Ursache**: Urlaubssaldo für das Jahr nicht initialisiert.
**Lösung**: Kontaktieren Sie Ihren Administrator.

### Sprünge im Gleitzeitverlauf
**Ursache**: Korrekturen in einzelnen Monaten oder Übertrag.
**Lösung**: Prüfen Sie die betroffenen Monate für Details.

## Verwandte Module

- **[Monatsauswertung](./monatsauswertung.md)** - Details zu einzelnen Monaten
- **[Dashboard](./dashboard.md)** - Aktueller Gleitzeitstand
- **[Urlaub](./urlaub.md)** - Detaillierte Urlaubsübersicht
- **[Stundenzettel](./stundenzettel.md)** - Detaillierte Tagesdaten
- **[Monatswerte](./monatswerte.md)** - (Admin) Monatswerte verwalten
