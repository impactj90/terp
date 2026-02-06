# Stundenzettel - Benutzerhandbuch

## Überblick

Der **Stundenzettel** ist Ihr zentrales Werkzeug zur Anzeige und Verwaltung Ihrer Zeitbuchungen. Hier sehen Sie alle erfassten Arbeitszeiten in verschiedenen Ansichten (Tag, Woche, Monat) und können bei Bedarf Buchungen bearbeiten, hinzufügen oder löschen. Der Stundenzettel ermöglicht auch den Export Ihrer Zeitdaten für externe Zwecke.

**Wer nutzt dieses Modul:**
- Alle Mitarbeiter zur Überprüfung und Korrektur ihrer Zeitbuchungen
- Administratoren können die Stundenzettel aller Mitarbeiter einsehen und bearbeiten

## Voraussetzungen

Bevor Sie den Stundenzettel nutzen können:

1. **Mitarbeiterdatensatz**: Sie müssen einen aktiven Mitarbeiterdatensatz im System haben.
2. **Zeitbuchungen**: Buchungen erfolgen typischerweise über die Stempeluhr.
3. **Buchungsarten**: Im System müssen Buchungsarten konfiguriert sein.

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Stundenzettel

**Mobil:** Über das Seitenmenü oder Dashboard-Schnellzugriff

**Direkte URL:** `/timesheet`

**Mit Parametern:** `/timesheet?date=2025-01-15&view=day&employee=abc123`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Stundenzettel" mit Untertitel des aktuellen Mitarbeiters
- **Export-Buttons**: Daten als CSV oder PDF exportieren

### 2. Ansichtsumschalter (Tabs)
Drei verschiedene Ansichten:
- **Tag**: Detaillierte Buchungen eines einzelnen Tages
- **Woche**: Überblick über 7 Tage mit Tagessummen
- **Monat**: Kompletter Monat im Kalenderformat

### 3. Mitarbeiterauswahl (nur für Administratoren)
Dropdown zur Auswahl des Mitarbeiters, dessen Stundenzettel angezeigt werden soll.

### 4. Datumsnavigation
- **Heute-Button**: Sprung zum aktuellen Datum
- **Vor/Zurück-Pfeile**: Navigation in der Zeit
- **Perioden-Anzeige**: Aktueller Tag/Woche/Monat

### 5. Tagesansicht (Day View)
Detaillierte Auflistung aller Buchungen eines Tages:

#### Buchungsliste
Jede Buchung zeigt:
- **Uhrzeit**: Originalzeit und ggf. bearbeitete Zeit
- **Buchungsart**: Art der Buchung (Kommen, Gehen, Pause-Start, etc.)
- **Symbol**: Farbcodiertes Icon der Buchungsart
- **Notizen**: Optionale Anmerkungen zur Buchung

#### Tagesstatistiken
- **Bruttozeit**: Gesamtzeit von erster bis letzter Buchung
- **Pausenzeit**: Summe aller Pausenbuchungen
- **Nettozeit**: Effektive Arbeitszeit (Brutto - Pausen)
- **Sollzeit**: Geplante Arbeitszeit laut Tagesplan
- **Saldo**: Differenz zwischen Ist und Soll

#### Aktionsbuttons
- **Buchung hinzufügen** (+): Manuelle Buchung erstellen
- **Bearbeiten** (Stift-Icon): Buchung ändern
- **Löschen** (Papierkorb-Icon): Buchung entfernen

### 6. Wochenansicht (Week View)
Kompakte Übersicht der Woche:

| Spalte | Inhalt |
|--------|--------|
| Tag | Datum und Wochentag |
| Erste Buchung | Früheste Buchung des Tages |
| Letzte Buchung | Späteste Buchung des Tages |
| Nettozeit | Effektive Arbeitszeit |
| Saldo | Differenz zur Sollzeit |

- **Klickbar**: Klick auf einen Tag öffnet die Tagesansicht
- **Wochensumme**: Gesamtstunden am Ende der Tabelle

### 7. Monatsansicht (Month View)
Kalenderartige Darstellung:
- **Farbcodierung**: Tage mit Buchungen sind hervorgehoben
- **Stundenanzeige**: Nettoarbeitszeit pro Tag im Kalender
- **Wochenenden/Feiertage**: Optisch abgesetzt
- **Klickbar**: Klick auf einen Tag öffnet die Tagesansicht

### 8. Buchung bearbeiten (Dialog)
Formular zur Änderung einer Buchung:
- **Buchungsart**: Dropdown zur Auswahl
- **Uhrzeit**: Zeit der Buchung ändern
- **Notizen**: Begründung für die Änderung
- **Speichern/Abbrechen**: Aktion bestätigen oder verwerfen

### 9. Buchung erstellen (Dialog)
Formular zum manuellen Hinzufügen:
- **Datum**: Automatisch auf aktuelle Ansicht gesetzt
- **Buchungsart**: Art der Buchung wählen
- **Uhrzeit**: Zeit eingeben
- **Notizen**: Optionale Begründung

## Schritt-für-Schritt Anleitungen

### Tagesbuchungen prüfen

1. Navigieren Sie zum **Stundenzettel**
2. Wählen Sie die **Tagesansicht** (Tab "Tag")
3. Navigieren Sie zum gewünschten Datum
4. Prüfen Sie die Buchungsliste und Tagesstatistiken

### Wochenüberblick erhalten

1. Öffnen Sie den **Stundenzettel**
2. Wählen Sie die **Wochenansicht** (Tab "Woche")
3. Nutzen Sie die Navigation für andere Wochen
4. Prüfen Sie die Wochensumme am Ende der Tabelle

### Fehlende Buchung nachtragen

1. Öffnen Sie die **Tagesansicht** des betreffenden Tages
2. Klicken Sie auf **"Buchung hinzufügen"** (+)
3. Wählen Sie die korrekte **Buchungsart**
4. Geben Sie die **Uhrzeit** ein
5. Fügen Sie eine **Notiz** mit Begründung hinzu
6. Klicken Sie auf **Speichern**

### Falsche Buchung korrigieren

1. Finden Sie die fehlerhafte Buchung in der **Tagesansicht**
2. Klicken Sie auf das **Bearbeiten**-Symbol (Stift)
3. Korrigieren Sie die **Uhrzeit** oder **Buchungsart**
4. Fügen Sie eine **Notiz** zur Begründung hinzu
5. Klicken Sie auf **Speichern**

### Buchung löschen

1. Finden Sie die zu löschende Buchung
2. Klicken Sie auf das **Löschen**-Symbol (Papierkorb)
3. Bestätigen Sie die Löschung im Dialogfenster
4. **Achtung**: Löschungen können von Admins nachvollzogen werden

### Stundenzettel exportieren

1. Wählen Sie den gewünschten **Zeitraum** (Woche oder Monat)
2. Klicken Sie auf den **Export**-Button
3. Wählen Sie das **Format** (CSV oder PDF)
4. Die Datei wird automatisch heruntergeladen

### Administrator: Mitarbeiter-Stundenzettel prüfen

1. Öffnen Sie den Stundenzettel
2. Nutzen Sie die **Mitarbeiterauswahl** (Dropdown)
3. Wählen Sie den gewünschten Mitarbeiter
4. Die Ansicht aktualisiert sich mit dessen Daten
5. Sie können Buchungen wie bei Ihrem eigenen Stundenzettel bearbeiten

## Auswirkungen auf andere Module

Änderungen im Stundenzettel wirken sich auf mehrere Bereiche aus:

| Modul | Auswirkung |
|-------|------------|
| **Dashboard** | Tages- und Wochenstunden werden aktualisiert |
| **Monatsauswertung** | Monatssummen und Salden ändern sich |
| **Jahresübersicht** | Jahressummen werden neu berechnet |
| **Gleitzeitkonto** | Der Gleitzeitstand passt sich an |
| **Genehmigungen** | Manuelle Buchungen können Genehmigungen erfordern |
| **Lohnexport** | Exportierte Zeiten basieren auf Stundenzetteldaten |

## Tipps & Best Practices

1. **Tägliche Kontrolle**: Prüfen Sie jeden Tag kurz Ihre Buchungen auf Vollständigkeit.

2. **Pausen nicht vergessen**: Stellen Sie sicher, dass Pausenzeiten korrekt erfasst sind.

3. **Notizen nutzen**: Bei manuellen Buchungen immer eine Begründung angeben für Nachvollziehbarkeit.

4. **Wochenkontrolle**: Am Freitag die Woche überprüfen, solange alles noch frisch in Erinnerung ist.

5. **Export für Nachweise**: Bei Bedarf den Stundenzettel exportieren und archivieren.

6. **Abweichungen klären**: Bei Soll-Ist-Abweichungen zeitnah mit dem Vorgesetzten sprechen.

7. **URL-Parameter nutzen**: Für schnellen Zugriff auf bestimmte Tage können Sie die URL mit Parametern aufrufen.

## Problembehandlung

### Keine Buchungen sichtbar
**Ursache**: Für den gewählten Tag wurden keine Stempelaktionen durchgeführt.
**Lösung**: Nutzen Sie "Buchung hinzufügen", um fehlende Einträge nachzutragen.

### Buchung kann nicht bearbeitet werden
**Ursache**: Der Monat ist bereits abgeschlossen.
**Lösung**: Kontaktieren Sie Ihren Administrator, um den Monat wieder zu öffnen.

### Buchung hinzufügen nicht möglich
**Ursache**: Fehlende Berechtigungen oder technischer Fehler.
**Lösung**: Prüfen Sie, ob Sie angemeldet sind und die richtige Mitarbeiter-ID gesetzt ist.

### Tagesstatistiken falsch
**Ursache**: Fehlende oder doppelte Buchungen.
**Lösung**: Prüfen Sie alle Buchungen des Tages auf Vollständigkeit und korrekte Buchungsarten.

### Export enthält keine Daten
**Ursache**: Keine Buchungen im gewählten Zeitraum.
**Lösung**: Prüfen Sie den Datumsbereich und ob Buchungen existieren.

### Wochensumme stimmt nicht
**Ursache**: Einzelne Tage haben fehlerhafte Buchungen.
**Lösung**: Prüfen Sie jeden Tag einzeln in der Tagesansicht.

### Änderungen werden nicht gespeichert
**Ursache**: Netzwerkfehler oder Sitzungs-Timeout.
**Lösung**: Aktualisieren Sie die Seite und melden Sie sich bei Bedarf erneut an.

## Verwandte Module

- **[Stempeluhr](./stempeluhr.md)** - Buchungen direkt erfassen
- **[Dashboard](./dashboard.md)** - Tagesübersicht
- **[Monatsauswertung](./monatsauswertung.md)** - Monatliche Zusammenfassung
- **[Jahresübersicht](./jahresuebersicht.md)** - Jahresstatistiken
- **[Buchungsarten](./buchungsarten.md)** - (Admin) Buchungsarten konfigurieren
- **[Genehmigungen](./genehmigungen.md)** - (Admin) Manuelle Buchungen genehmigen
