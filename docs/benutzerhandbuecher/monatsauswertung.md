# Monatsauswertung - Benutzerhandbuch

## Überblick

Die **Monatsauswertung** zeigt Ihnen eine zusammengefasste Übersicht Ihrer Arbeitszeiten für einen kompletten Monat. Sie sehen hier Ihre Monatssummen, den täglichen Verlauf, den Gleitzeitstand und können den Monat bei Bedarf abschließen. Dieses Modul ist besonders wichtig für die monatliche Kontrolle und den Lohnexport.

**Wer nutzt dieses Modul:**
- Alle Mitarbeiter zur monatlichen Kontrolle ihrer Arbeitszeiten
- Administratoren zur Prüfung und zum Abschluss von Mitarbeitermonaten
- Das System für Lohnexporte und Gleitzeitberechnungen

## Voraussetzungen

Bevor Sie die Monatsauswertung nutzen können:

1. **Mitarbeiterdatensatz**: Sie müssen einen aktiven Mitarbeiterdatensatz im System haben.
2. **Zeitbuchungen**: Für den Monat sollten Zeitbuchungen erfasst sein.
3. **Tageswerte**: Das System muss Tageswerte für den Monat berechnet haben.

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Monatsauswertung

**Mobil:** Über das Seitenmenü

**Direkte URL:** `/monthly-evaluation`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Monatsauswertung"
- **Status-Badge**: Zeigt ob der Monat "Offen" oder "Abgeschlossen" ist
- **Monat abschließen/Wiedereröffnen**: Aktionsbutton je nach Status
- **Export-Buttons**: Daten exportieren

### 2. Mitarbeiterauswahl (nur für Administratoren)
Dropdown zur Auswahl des Mitarbeiters, dessen Auswertung angezeigt werden soll.

### 3. Monatsnavigation
- **"Aktuell"**: Sprung zum aktuellen Monat
- **Vor/Zurück-Pfeile**: Navigation zwischen Monaten
- **Monatsanzeige**: "Januar 2025" etc.

### 4. Zusammenfassungs-Karten (Summary Cards)
Vier Karten mit den wichtigsten Monatskennzahlen:

#### Sollstunden
- Geplante Arbeitszeit für den Monat
- Basiert auf Ihrem Tagesplan und Arbeitstagen

#### Iststunden
- Tatsächlich geleistete Arbeitszeit
- Nettostunden ohne Pausen

#### Saldo
- Differenz zwischen Soll und Ist
- Positiv = Überstunden, Negativ = Minusstunden
- Farbcodiert (Grün/Rot)

#### Gleitzeitstand
- Kumulierter Gleitzeitstand zum Monatsende
- Überträgt sich in den Folgemonat

### 5. Tagesübersicht (Daily Breakdown Table)
Detaillierte Tabelle aller Tage im Monat:

| Spalte | Beschreibung |
|--------|--------------|
| **Datum** | Tag und Wochentag |
| **Sollzeit** | Geplante Arbeitszeit |
| **Bruttozeit** | Zeit von erster bis letzter Buchung |
| **Pausen** | Summe der Pausenzeiten |
| **Nettozeit** | Effektive Arbeitszeit |
| **Saldo** | Tägliche Differenz |
| **Abwesenheit** | Ggf. Abwesenheitsart |

Farbcodierung:
- **Normal**: Standard-Arbeitstage
- **Grau hinterlegt**: Wochenenden
- **Gelb hinterlegt**: Feiertage
- **Blau hinterlegt**: Abwesenheitstage

Klick auf eine Zeile führt zum Stundenzettel für diesen Tag.

### 6. Monat abschließen (Close Month Sheet)
Dialog zum Abschließen des Monats:
- Zusammenfassung der Monatsdaten
- Bestätigungsaufforderung
- Option für Notizen
- Warnung bei Unstimmigkeiten

### 7. Monat wiedereröffnen (Reopen Month Sheet)
Dialog zum Wiedereröffnen eines abgeschlossenen Monats:
- Begründung erforderlich
- Warnung über Auswirkungen
- Nur für Berechtigte verfügbar

## Schritt-für-Schritt Anleitungen

### Monatliche Kontrolle durchführen

1. Navigieren Sie zur **Monatsauswertung**
2. Wählen Sie den zu prüfenden Monat
3. Prüfen Sie die **Zusammenfassungs-Karten** für Gesamtübersicht
4. Gehen Sie die **Tagesübersicht** durch
5. Achten Sie auf Tage mit fehlendem Soll oder Ist
6. Bei Auffälligkeiten: Klick auf den Tag für Details im Stundenzettel

### Auf Fehler prüfen

1. Achten Sie auf **rote Markierungen** in der Tagesübersicht
2. Prüfen Sie Tage ohne Buchungen (außer Wochenende/Feiertag/Abwesenheit)
3. Vergleichen Sie Soll- und Istzeiten
4. Korrigieren Sie Fehler im Stundenzettel

### Monat abschließen

1. Stellen Sie sicher, dass alle Daten korrekt sind
2. Navigieren Sie zum betreffenden Monat
3. Der Status sollte "Offen" zeigen
4. Klicken Sie auf **"Monat abschließen"**
5. Prüfen Sie die Zusammenfassung im Dialog
6. Fügen Sie optional Notizen hinzu
7. Bestätigen Sie mit **"Abschließen"**
8. Der Status wechselt zu "Abgeschlossen"

### Monat wiedereröffnen (bei Berechtigungen)

1. Navigieren Sie zum abgeschlossenen Monat
2. Klicken Sie auf **"Wiedereröffnen"**
3. Geben Sie eine **Begründung** ein
4. Bestätigen Sie die Aktion
5. Der Monat ist wieder bearbeitbar
6. **Hinweis**: Auswirkungen auf bereits exportierte Lohndaten beachten!

### Daten exportieren

1. Wählen Sie den gewünschten Monat
2. Klicken Sie auf den **Export**-Button
3. Wählen Sie das Format (CSV oder PDF)
4. Die Datei wird heruntergeladen

### Zum Stundenzettel navigieren

1. In der **Tagesübersicht**: Klicken Sie auf eine Zeile
2. Sie werden zum Stundenzettel mit dem gewählten Datum weitergeleitet
3. Dort können Sie detaillierte Buchungen sehen und bearbeiten

## Auswirkungen auf andere Module

Die Monatsauswertung aggregiert Daten und beeinflusst andere Bereiche:

| Modul | Auswirkung |
|-------|------------|
| **Jahresübersicht** | Monatsdaten fließen in die Jahressummen |
| **Gleitzeitkonto** | Der Monatsendstand wird übertragen |
| **Lohnexport** | Abgeschlossene Monate können exportiert werden |
| **Stundenzettel** | Korrektur bei abgeschlossenem Monat nicht möglich |
| **Dashboard** | Gleitzeitstand wird aktualisiert |

## Tipps & Best Practices

1. **Monatliche Routine**: Prüfen Sie zu Beginn des Folgemonats Ihren Vormonat.

2. **Vor dem Abschluss prüfen**: Kontrollieren Sie alle Tage vor dem Abschließen gründlich.

3. **Tägliche Kontrolle**: Besser: Schon während des Monats regelmäßig prüfen.

4. **Fehlende Tage beachten**: Achten Sie auf Arbeitstage ohne Buchungen.

5. **Abwesenheiten abgleichen**: Prüfen Sie, ob alle Abwesenheiten korrekt angezeigt werden.

6. **Export archivieren**: Exportieren Sie abgeschlossene Monate für Ihre Unterlagen.

7. **Frist beachten**: Schließen Sie Monate zeitnah ab, um Lohnprozesse nicht zu verzögern.

## Problembehandlung

### "Kein Mitarbeiterdatensatz gefunden"
**Ursache**: Ihr Benutzerkonto ist nicht mit einem Mitarbeiterdatensatz verknüpft.
**Lösung**: Kontaktieren Sie Ihren Administrator.

### Monatswerte fehlen
**Ursache**: Die Monatswerte wurden noch nicht berechnet.
**Lösung**: Warten Sie auf die nächtliche Berechnung oder kontaktieren Sie den Administrator.

### Sollzeit erscheint falsch
**Ursache**: Tagesplan nicht korrekt zugewiesen oder Feiertage nicht berücksichtigt.
**Lösung**: Prüfen Sie Ihren Tagesplan und die Feiertagskonfiguration.

### Abschluss nicht möglich
**Ursache**: Fehlende Berechtigung oder offene Korrekturen erforderlich.
**Lösung**: Prüfen Sie Ihre Berechtigungen oder beheben Sie die angezeigten Probleme.

### Monat kann nicht wiedereröffnet werden
**Ursache**: Fehlende Berechtigung oder bereits für Lohnexport verwendet.
**Lösung**: Kontaktieren Sie Ihren Administrator.

### Tageswerte stimmen nicht mit Stundenzettel überein
**Ursache**: Tageswerte werden zeitversetzt berechnet.
**Lösung**: Warten Sie auf die nächste Berechnung oder kontaktieren Sie den Administrator.

### Export enthält keine Daten
**Ursache**: Keine Buchungen im gewählten Monat.
**Lösung**: Prüfen Sie, ob Buchungen für den Monat existieren.

### Gleitzeitstand springt
**Ursache**: Übertrag vom Vormonat oder Korrekturen.
**Lösung**: Prüfen Sie den Vormonat für den Übertrag und den Transaktionsverlauf.

## Verwandte Module

- **[Stundenzettel](./stundenzettel.md)** - Detaillierte Tagesdaten und Korrekturen
- **[Jahresübersicht](./jahresuebersicht.md)** - Jahressummen und Monatsvergleich
- **[Dashboard](./dashboard.md)** - Gleitzeitstand auf einen Blick
- **[Monatswerte](./monatswerte.md)** - (Admin) Monatswerte verwalten
- **[Lohnexporte](./lohnexporte.md)** - (Admin) Lohndaten exportieren
