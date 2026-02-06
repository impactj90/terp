# Dashboard - Benutzerhandbuch

## Überblick

Das **Dashboard** ist Ihre persönliche Startseite im Zeiterfassungssystem. Es bietet Ihnen einen schnellen Überblick über Ihren aktuellen Arbeitstag, Ihre Wochenstunden, Urlaubstage und Gleitzeitguthaben. Hier sehen Sie auf einen Blick die wichtigsten Informationen und können direkt zu häufig genutzten Funktionen navigieren.

**Wer nutzt dieses Modul:**
- Alle Mitarbeiter als zentrale Einstiegsseite nach der Anmeldung
- Das Dashboard passt sich automatisch an Ihren Mitarbeiterdatensatz an

## Voraussetzungen

Bevor Sie das Dashboard vollständig nutzen können:

1. **Mitarbeiterdatensatz**: Sie müssen einen aktiven Mitarbeiterdatensatz im System haben. Ohne Mitarbeiterdatensatz sehen Sie nur eine eingeschränkte Ansicht.
2. **Tagesplan-Zuweisung**: Für die korrekte Anzeige Ihrer Sollstunden sollte Ihnen ein Tagesplan zugewiesen sein.
3. **Systemzugang**: Sie benötigen ein gültiges Benutzerkonto mit Anmeldedaten.

## Zugang zum Modul

**Navigationspfad:** Das Dashboard ist die Startseite nach der Anmeldung

**Mobil:** Über das Home-Symbol in der Navigation

**Direkte URL:** `/dashboard`

## Funktionen & Bedienelemente

### 1. Dashboard-Header
Zeigt eine Begrüßung mit Ihrem Namen und dem aktuellen Datum. Der Header passt die Begrüßung an die Tageszeit an (z.B. "Guten Morgen", "Guten Tag").

### 2. Schnellaktionen (Quick Actions)
Direkte Buttons für häufig genutzte Funktionen:
- **Stempeluhr**: Schnellzugriff zur Zeiterfassung
- **Abwesenheit beantragen**: Direkt einen Abwesenheitsantrag stellen
- **Stundenzettel öffnen**: Ihre Zeiteinträge einsehen

### 3. Statistik-Karten
Vier Übersichtskarten mit den wichtigsten Kennzahlen:

#### Tagesplan-Karte
- Zeigt Ihre heutige Sollarbeitszeit
- Aktueller Stempelstatus (eingestempelt/ausgestempelt)
- Bereits geleistete Arbeitszeit heute

#### Wochenstunden-Karte
- Gesamtstunden der aktuellen Woche
- Vergleich mit der Wochensollzeit
- Fortschrittsanzeige

#### Urlaubsguthaben-Karte
- Verbleibende Urlaubstage im aktuellen Jahr
- Bereits genommene Urlaubstage
- Gesamtanspruch

#### Gleitzeitguthaben-Karte
- Aktueller Gleitzeitstand in Stunden
- Positives Guthaben (Überstunden) oder negatives Guthaben (Minusstunden)
- Trend zum Vormonat

### 4. Offene Aktionen (Pending Actions)
Liste von Aufgaben, die Ihre Aufmerksamkeit erfordern:
- Ausstehende Genehmigungsanfragen
- Fehlende Zeitbuchungen
- Zu prüfende Benachrichtigungen

### 5. Letzte Aktivitäten (Recent Activity)
Chronologische Übersicht der neuesten Ereignisse:
- Letzte Stempelvorgänge
- Genehmigte oder abgelehnte Anträge
- Systembenachrichtigungen

## Schritt-für-Schritt Anleitungen

### Täglicher Check-in

1. Melden Sie sich im System an - Sie landen automatisch auf dem Dashboard
2. Prüfen Sie die **Tagesplan-Karte** für Ihre heutige Sollzeit
3. Nutzen Sie den **Stempeluhr**-Schnellbutton zum Einstempeln
4. Behalten Sie die **Offenen Aktionen** im Blick

### Wochenfortschritt prüfen

1. Schauen Sie auf die **Wochenstunden-Karte**
2. Der Fortschrittsbalken zeigt, wie viel Sie bereits gearbeitet haben
3. Bei Abweichungen können Sie über **Stundenzettel** Details einsehen

### Urlaubsübersicht

1. Die **Urlaubsguthaben-Karte** zeigt Ihren aktuellen Stand
2. Klicken Sie darauf für eine detaillierte Ansicht
3. Über **Abwesenheit beantragen** können Sie direkt Urlaub beantragen

### Gleitzeitstand prüfen

1. Die **Gleitzeitguthaben-Karte** zeigt Ihr aktuelles Guthaben
2. Grün = Überstunden, Rot = Minusstunden
3. Für Details navigieren Sie zur Monatsauswertung

## Auswirkungen auf andere Module

Das Dashboard ist eine reine Anzeige-Oberfläche und zeigt Daten aus anderen Modulen an:

| Datenquelle | Angezeigte Information |
|-------------|------------------------|
| **Stempeluhr** | Aktueller Stempelstatus, heutige Arbeitszeit |
| **Tagesplan** | Sollarbeitszeit für heute |
| **Stundenzettel** | Wochenstunden, letzte Buchungen |
| **Urlaubsverwaltung** | Urlaubsguthaben |
| **Monatsauswertung** | Gleitzeitstand |
| **Abwesenheiten** | Offene Anträge, genehmigte Abwesenheiten |

## Tipps & Best Practices

1. **Morgendlicher Blick**: Starten Sie jeden Arbeitstag mit einem Blick auf das Dashboard, um Ihren Tagesplan zu kennen.

2. **Offene Aktionen bearbeiten**: Arbeiten Sie regelmäßig die Liste der offenen Aktionen ab, um keine wichtigen Fristen zu verpassen.

3. **Wöchentliche Prüfung**: Prüfen Sie mindestens einmal pro Woche Ihre Wochenstunden, um Abweichungen frühzeitig zu erkennen.

4. **Urlaubsplanung**: Behalten Sie Ihr Urlaubsguthaben im Blick, besonders gegen Jahresende wegen verfallender Resttage.

5. **Gleitzeitausgleich**: Bei hohem Gleitzeitguthaben sprechen Sie mit Ihrem Vorgesetzten über Ausgleichsmöglichkeiten.

## Problembehandlung

### "Kein Mitarbeiterprofil" wird angezeigt
**Ursache**: Ihr Benutzerkonto ist nicht mit einem Mitarbeiterdatensatz verknüpft.
**Lösung**: Kontaktieren Sie Ihren Administrator, um Ihren Mitarbeiterdatensatz zu erstellen oder zu verknüpfen.

### Statistiken zeigen keine Daten
**Ursache**: Möglicherweise fehlen Buchungen oder der Tagesplan ist nicht konfiguriert.
**Lösung**: Prüfen Sie im Stundenzettel, ob Buchungen vorhanden sind. Kontaktieren Sie bei Bedarf Ihren Administrator.

### Dashboard lädt langsam
**Ursache**: Viele Daten werden gleichzeitig abgefragt.
**Lösung**: Warten Sie kurz. Bei anhaltenden Problemen aktualisieren Sie die Seite.

### Urlaubsguthaben erscheint falsch
**Ursache**: Die Urlaubssalden sind möglicherweise noch nicht berechnet oder initialisiert.
**Lösung**: Prüfen Sie die Urlaubsseite für Details. Kontaktieren Sie Ihren Administrator, wenn Diskrepanzen bestehen.

### Falsche Sollzeit angezeigt
**Ursache**: Ihr Tagesplan ist nicht korrekt zugewiesen oder der Feiertag ist nicht berücksichtigt.
**Lösung**: Kontaktieren Sie Ihren Administrator, um Ihre Tagesplan-Zuweisung zu prüfen.

## Verwandte Module

- **[Stempeluhr](./stempeluhr.md)** - Arbeitszeit erfassen
- **[Stundenzettel](./stundenzettel.md)** - Detaillierte Zeiteinträge einsehen
- **[Abwesenheiten](./abwesenheiten.md)** - Abwesenheiten beantragen und verwalten
- **[Urlaub](./urlaub.md)** - Urlaubsguthaben und -historie
- **[Monatsauswertung](./monatsauswertung.md)** - Monatliche Zusammenfassung
- **[Profil](./profil.md)** - Persönliche Einstellungen
