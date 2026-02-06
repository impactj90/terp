# Teamübersicht - Benutzerhandbuch

## Überblick

Die **Teamübersicht** ermöglicht es Teamleitern und Vorgesetzten, den Anwesenheitsstatus und die Arbeitszeiten aller Teammitglieder auf einen Blick zu sehen. Sie zeigt, wer gerade arbeitet, wer in Pause ist und wer abwesend ist. Zusätzlich bietet sie Statistiken über Teamleistung und kommende Abwesenheiten.

**Wer nutzt dieses Modul:**
- Teamleiter zur Überwachung der Teamanwesenheit
- Abteilungsleiter für einen Überblick über mehrere Teams
- Vorgesetzte zur Ressourcenplanung

## Voraussetzungen

Bevor Sie die Teamübersicht nutzen können:

1. **Teamzugehörigkeit**: Sie müssen mindestens einem Team zugeordnet sein.
2. **Teamleiter-Rolle**: Für erweiterte Funktionen benötigen Sie Teamleiter-Berechtigungen.
3. **Teammitglieder**: Das Team muss aktive Mitglieder haben, um Daten anzuzeigen.

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Teamübersicht

**Mobil:** Über das Seitenmenü zugänglich

**Direkte URL:** `/team-overview`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel und Untertitel**: Beschreibung der Seite
- **Datumsbereichsauswahl**: Wählen Sie den Zeitraum für Statistiken (Standard: aktuelle Woche)
- **Aktualisieren-Button**: Manuelles Neuladen der Daten
- **Export-Buttons**: Daten als CSV oder PDF exportieren

### 2. Team-Auswahl (Team Selector)
Dropdown-Menü zur Auswahl des anzuzeigenden Teams:
- Zeigt alle Teams, denen Sie zugeordnet sind
- Bei nur einem Team wird dieses automatisch ausgewählt
- Wechsel zwischen Teams ohne Neuladen der Seite

### 3. Statistik-Karten
Acht Übersichtskarten mit Team-Kennzahlen:

#### Anwesenheitsstatistiken (für heute)
- **Anwesend**: Anzahl der aktuell eingestempelten Mitarbeiter
- **Abwesend**: Mitarbeiter mit geplanter Abwesenheit
- **In Pause**: Mitarbeiter in aktiver Pause
- **Im Dienstgang**: Mitarbeiter auf Außentermin

#### Zeitraumstatistiken (für gewählten Bereich)
- **Gesamtstunden**: Summierte Arbeitszeit des Teams
- **Durchschnitt pro Mitarbeiter**: Mittlere Arbeitszeit
- **Überstunden**: Kumulierte Überstunden im Team
- **Anwesenheitsquote**: Prozentsatz der Anwesenheitstage

### 4. Anwesenheitsliste (Attendance List)
Detaillierte Tabelle aller Teammitglieder mit:
- **Name**: Mitarbeitername mit Avatar
- **Status**: Farbcodierter Anwesenheitsstatus
  - 🟢 Grün = Eingestempelt/Arbeitend
  - 🟡 Gelb = In Pause
  - 🔵 Blau = Im Dienstgang
  - ⚪ Grau = Ausgestempelt/Nicht begonnen
  - 🔴 Rot = Abwesend (Urlaub, Krankheit, etc.)
- **Seit**: Startzeit der aktuellen Aktivität
- **Arbeitszeit heute**: Bereits geleistete Stunden

### 5. Anwesenheitsmuster (Attendance Pattern)
Visuelle Darstellung der Anwesenheit über den gewählten Zeitraum:
- Heatmap-Ansicht: Zeigt Anwesenheitsdichte pro Tag
- Erkennen von Mustern (z.B. Freitage weniger besetzt)
- Planungshilfe für Ressourceneinsatz

### 6. Kommende Abwesenheiten
Vorschau auf geplante Abwesenheiten im Team:
- Nächste 14 Tage im Überblick
- Art der Abwesenheit (Urlaub, Fortbildung, etc.)
- Überlappungen mehrerer Mitarbeiter erkennen

### 7. Schnellaktionen (Team Quick Actions)
Aktionen für das ausgewählte Team:
- **Teamverwaltung öffnen**: Zur Admin-Teamseite
- **Schichtplanung**: Direkt zur Schichtplanung

## Schritt-für-Schritt Anleitungen

### Tägliche Anwesenheit prüfen

1. Navigieren Sie zur **Teamübersicht**
2. Wählen Sie Ihr Team aus dem Dropdown, falls mehrere vorhanden
3. Die **Anwesenheitsliste** zeigt den aktuellen Status aller Mitglieder
4. Nutzen Sie den **Aktualisieren**-Button für die neuesten Daten

### Wochenstatistiken analysieren

1. Stellen Sie den **Datumsbereich** auf die gewünschte Woche ein
2. Prüfen Sie die **Statistik-Karten** für Gesamtstunden und Durchschnitt
3. Das **Anwesenheitsmuster** zeigt tägliche Schwankungen
4. Exportieren Sie bei Bedarf die Daten für Berichte

### Kommende Engpässe erkennen

1. Scrollen Sie zu **Kommende Abwesenheiten**
2. Identifizieren Sie Tage mit mehreren abwesenden Mitarbeitern
3. Planen Sie entsprechend Vertretungen oder verschieben Sie Aufgaben

### Daten exportieren

1. Wählen Sie Team und Datumsbereich
2. Klicken Sie auf den **Export**-Button
3. Wählen Sie das gewünschte Format (CSV oder PDF)
4. Die Datei wird heruntergeladen

## Auswirkungen auf andere Module

Die Teamübersicht ist eine Aggregationsansicht, die Daten aus verschiedenen Quellen zusammenführt:

| Datenquelle | Angezeigte Information |
|-------------|------------------------|
| **Teams-Verwaltung** | Teamstruktur und Mitgliederliste |
| **Stempeluhr** | Aktueller Anwesenheitsstatus der Mitarbeiter |
| **Tageswerte** | Arbeitszeiten und Statistiken |
| **Abwesenheiten** | Geplante und aktuelle Abwesenheiten |
| **Buchungen** | Detaillierte Zeitdaten für Export |

## Tipps & Best Practices

1. **Morgendlicher Check**: Prüfen Sie zu Arbeitsbeginn die Anwesenheit, um den Tag zu planen.

2. **Regelmäßige Aktualisierung**: Nutzen Sie den Aktualisieren-Button bei kritischen Situationen für Echtzeit-Daten.

3. **Wochenplanung**: Verwenden Sie das Anwesenheitsmuster zur Identifikation von unterbesetzten Tagen.

4. **Vorausschauende Planung**: Prüfen Sie kommende Abwesenheiten mindestens eine Woche im Voraus.

5. **Export für Meetings**: Exportieren Sie Wochendaten für Team-Meetings oder Berichte an die Geschäftsleitung.

6. **Datenbereich anpassen**: Nutzen Sie verschiedene Datumsbereiche für unterschiedliche Analysen (Woche, Monat, Quartal).

## Problembehandlung

### Keine Teams verfügbar
**Ursache**: Sie sind keinem Team zugeordnet.
**Lösung**: Kontaktieren Sie Ihren Administrator, um einer Teamzuordnung zu erhalten.

### Team zeigt keine Mitglieder
**Ursache**: Dem Team wurden noch keine Mitarbeiter hinzugefügt.
**Lösung**: Fügen Sie über die Teamverwaltung Mitglieder hinzu oder kontaktieren Sie Ihren Administrator.

### Statusanzeige nicht aktuell
**Ursache**: Daten werden standardmäßig alle 30 Sekunden aktualisiert.
**Lösung**: Klicken Sie auf **Aktualisieren** für sofortige Aktualisierung.

### Mitarbeiter fehlt in der Liste
**Ursache**: Der Mitarbeiter ist dem Team nicht zugeordnet oder inaktiv.
**Lösung**: Prüfen Sie die Teamzusammensetzung in der Teamverwaltung.

### Export schlägt fehl
**Ursache**: Große Datenmengen oder Netzwerkprobleme.
**Lösung**: Versuchen Sie es mit einem kürzeren Datumsbereich oder zu einem späteren Zeitpunkt.

### Statistiken erscheinen falsch
**Ursache**: Fehlende Buchungen oder nicht abgeschlossene Tageswerte.
**Lösung**: Stellen Sie sicher, dass alle Mitarbeiter ihre Zeiten korrekt erfasst haben.

## Verwandte Module

- **[Dashboard](./dashboard.md)** - Persönliche Übersicht
- **[Teams](./teams.md)** - (Admin) Teamstruktur verwalten
- **[Mitarbeiter](./mitarbeiter.md)** - (Admin) Mitarbeiterdaten verwalten
- **[Schichtplanung](./schichtplanung.md)** - (Admin) Schichten planen
- **[Genehmigungen](./genehmigungen.md)** - (Admin) Abwesenheitsanträge genehmigen
