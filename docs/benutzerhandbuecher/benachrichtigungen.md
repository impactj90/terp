# Benachrichtigungen - Benutzerhandbuch

## Überblick

Das Modul **Benachrichtigungen** zeigt Ihnen alle Systemmitteilungen, Erinnerungen und Updates an einem zentralen Ort. Sie können hier Ihre Benachrichtigungshistorie einsehen, Nachrichten als gelesen markieren und Ihre Benachrichtigungseinstellungen anpassen.

**Wer nutzt dieses Modul:**
- Alle Mitarbeiter zur Verfolgung von Systemmitteilungen
- Für die Verwaltung von Benachrichtigungseinstellungen
- Zur Nachverfolgung wichtiger Ereignisse

## Voraussetzungen

1. **Benutzerkonto**: Sie müssen im System angemeldet sein.
2. **Aktive Benachrichtigungen**: Das System muss Benachrichtigungen generieren (abhängig von der Konfiguration).

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Benachrichtigungen (oder: Glocken-Symbol in der Kopfzeile)

**Mobil:** Über das Seitenmenü oder Glocken-Symbol

**Direkte URL:** `/notifications` oder `/notifications?tab=preferences` für Einstellungen

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Benachrichtigungen"
- **Untertitel**: Beschreibung der Seite

### 2. Tab-Navigation
Zwei Hauptbereiche:
- **Alle**: Benachrichtigungshistorie anzeigen
- **Einstellungen**: Benachrichtigungspräferenzen konfigurieren

### 3. Benachrichtigungsliste (Tab "Alle")

#### Filteroptionen
- **Typ-Filter**: Dropdown zur Filterung nach Kategorie
  - Alle Typen
  - Genehmigungen
  - Fehler
  - Erinnerungen
  - System
- **Ungelesen-Filter**: Button zum Anzeigen nur ungelesener Nachrichten
- **Alle als gelesen markieren**: Setzt alle als gelesen

#### Benachrichtigungskategorien

| Kategorie | Icon | Beispiele |
|-----------|------|-----------|
| **Genehmigungen** | ✓ | Urlaubsantrag genehmigt, Zeitbuchung bestätigt |
| **Fehler** | ⚠ | Stempelproblem erkannt, Validierungsfehler |
| **Erinnerungen** | 🕐 | Offene Genehmigungen, Monatsabschluss fällig |
| **System** | ⚙ | Wartungsankündigung, Passwortänderung |

#### Einzelne Benachrichtigung
Jede Benachrichtigung zeigt:
- **Icon**: Kategorie-Symbol
- **Titel**: Kurze Zusammenfassung
- **Nachricht**: Detaillierte Beschreibung
- **Zeitstempel**: Wann die Benachrichtigung erstellt wurde
- **Ungelesen-Badge**: Falls noch nicht gelesen
- **Typ-Label**: Kategorie der Benachrichtigung

Klick auf eine Benachrichtigung:
- Markiert sie als gelesen
- Navigiert zur verlinkten Seite (falls vorhanden)

### 4. Benachrichtigungseinstellungen (Tab "Einstellungen")

Konfiguration, welche Benachrichtigungen Sie erhalten möchten:

#### Kategorien ein-/ausschalten
- **Genehmigungen**: Benachrichtigungen zu Genehmigungsworkflows
- **Fehler**: Fehlermeldungen und Warnungen
- **Erinnerungen**: Periodische Erinnerungen
- **System**: Systemweite Ankündigungen

#### Zustellkanäle
- **In-App**: Benachrichtigungen in der Anwendung
- **E-Mail**: Benachrichtigungen per E-Mail (falls konfiguriert)
- **Push**: Browser-Push-Benachrichtigungen (falls unterstützt)

## Schritt-für-Schritt Anleitungen

### Ungelesene Benachrichtigungen prüfen

1. Klicken Sie auf das **Glocken-Symbol** in der Kopfzeile
2. Oder navigieren Sie zu **Benachrichtigungen**
3. Ungelesene Nachrichten sind mit **"Ungelesen"**-Badge markiert
4. Klicken Sie auf eine Benachrichtigung, um sie zu lesen

### Nach Kategorie filtern

1. Öffnen Sie die **Benachrichtigungen**
2. Nutzen Sie das **Typ-Filter**-Dropdown
3. Wählen Sie die gewünschte Kategorie (z.B. "Genehmigungen")
4. Nur Benachrichtigungen dieser Kategorie werden angezeigt

### Nur ungelesene anzeigen

1. Öffnen Sie die **Benachrichtigungen**
2. Klicken Sie auf den **"Ungelesen"**-Button
3. Die Liste zeigt nur ungelesene Nachrichten
4. Klicken Sie erneut, um alle anzuzeigen

### Alle als gelesen markieren

1. Öffnen Sie die **Benachrichtigungen**
2. Klicken Sie auf **"Alle als gelesen markieren"**
3. Alle Benachrichtigungen werden als gelesen markiert
4. Der Zähler am Glocken-Symbol wird zurückgesetzt

### Benachrichtigungseinstellungen anpassen

1. Navigieren Sie zu **Benachrichtigungen**
2. Wählen Sie den Tab **"Einstellungen"**
3. Aktivieren oder deaktivieren Sie Kategorien per Toggle
4. Wählen Sie bevorzugte Zustellkanäle
5. Änderungen werden automatisch gespeichert

### Mehr Benachrichtigungen laden

1. Scrollen Sie ans Ende der **Benachrichtigungsliste**
2. Klicken Sie auf **"Mehr laden"**
3. Weitere ältere Benachrichtigungen werden geladen

### Zur verlinkten Seite navigieren

1. Klicken Sie auf eine **Benachrichtigung**
2. Sie werden zur relevanten Seite weitergeleitet
3. Z.B. bei "Urlaubsantrag genehmigt" → zur Abwesenheitsseite

## Auswirkungen auf andere Module

Benachrichtigungen werden von verschiedenen Modulen generiert:

| Modul | Generierte Benachrichtigungen |
|-------|-------------------------------|
| **Genehmigungen** | Status-Updates zu Anträgen |
| **Abwesenheiten** | Anträge genehmigt/abgelehnt |
| **Stempeluhr** | Fehlende Stempelaktionen, Probleme |
| **Monatsauswertung** | Monatsabschluss-Erinnerungen |
| **System** | Wartung, Updates, Ankündigungen |

## Tipps & Best Practices

1. **Regelmäßig prüfen**: Schauen Sie täglich in Ihre Benachrichtigungen.

2. **Wichtige Kategorien aktivieren**: Stellen Sie sicher, dass relevante Kategorien nicht deaktiviert sind.

3. **E-Mail für Dringendes**: Aktivieren Sie E-Mail-Benachrichtigungen für wichtige Kategorien.

4. **Filter nutzen**: Bei vielen Benachrichtigungen helfen Filter, den Überblick zu behalten.

5. **Archivieren durch Lesen**: Markieren Sie gelesene Nachrichten, um den Überblick zu behalten.

6. **Glocken-Symbol beachten**: Ein Zähler zeigt ungelesene Benachrichtigungen an.

## Problembehandlung

### Keine Benachrichtigungen werden angezeigt
**Ursache**: Keine Benachrichtigungen generiert oder alle Kategorien deaktiviert.
**Lösung**: Prüfen Sie die Einstellungen. Möglicherweise gab es keine relevanten Ereignisse.

### E-Mail-Benachrichtigungen kommen nicht an
**Ursache**: E-Mail nicht konfiguriert oder Spam-Filter.
**Lösung**: Prüfen Sie Ihren Spam-Ordner. Kontaktieren Sie den Administrator für E-Mail-Konfiguration.

### Benachrichtigung führt zu Fehlerseite
**Ursache**: Das verlinkte Element existiert nicht mehr.
**Lösung**: Ignorieren Sie diese Benachrichtigung. Das Element wurde möglicherweise gelöscht.

### Einstellungen werden nicht gespeichert
**Ursache**: Netzwerkfehler oder Sitzungs-Timeout.
**Lösung**: Aktualisieren Sie die Seite und versuchen Sie es erneut.

### Zähler stimmt nicht mit Anzahl überein
**Ursache**: Cache-Synchronisation.
**Lösung**: Aktualisieren Sie die Seite für den aktuellen Stand.

### Zu viele Benachrichtigungen
**Ursache**: Alle Kategorien sind aktiviert.
**Lösung**: Deaktivieren Sie weniger relevante Kategorien in den Einstellungen.

## Verwandte Module

- **[Dashboard](./dashboard.md)** - Zeigt Benachrichtigungs-Zusammenfassung
- **[Genehmigungen](./genehmigungen.md)** - Quelle für Genehmigungsbenachrichtigungen
- **[Abwesenheiten](./abwesenheiten.md)** - Quelle für Abwesenheitsbenachrichtigungen
- **[Profil](./profil.md)** - Kontoeinstellungen
