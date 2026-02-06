# Feiertage - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Feiertage** ermöglicht die Verwaltung von gesetzlichen und betrieblichen Feiertagen. Feiertage werden bei der Sollzeitberechnung berücksichtigt und reduzieren die Arbeitszeit an diesen Tagen automatisch.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Feiertagspflege
- Systemadministratoren für die jährliche Konfiguration

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.
2. **Standorte konfiguriert**: Für bundeslandabhängige Feiertage.

## Zugang zum Modul

**Navigationspfad:** Admin → Zeit & Planung → Feiertage

**Direkte URL:** `/admin/holidays`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Feiertage"
- **Feiertag hinzufügen**: Manuell hinzufügen
- **Jahr generieren**: Automatische Generierung
- **Jahr kopieren**: Vorjahr als Vorlage

### 2. Jahreskalender-Ansicht
Visuelle Darstellung aller Feiertage:
- Monatsübersicht mit markierten Feiertagen
- Farben nach Feiertagsart (gesetzlich, regional, betrieblich)
- Klickbar für Details

### 3. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Datum** | Feiertag-Datum |
| **Name** | Bezeichnung |
| **Art** | Gesetzlich/Regional/Betrieblich |
| **Bundesländer** | Gültige Regionen |
| **Halber Tag** | Ganztag oder halber Tag |
| **Aktionen** | Bearbeiten, Löschen |

### 4. Formular (Form Sheet)
- **Datum** (Pflicht): Datum des Feiertags
- **Name** (Pflicht): Bezeichnung
- **Art**: Gesetzlich, Regional, Betrieblich
- **Bundesländer**: Auswahl der gültigen Regionen
- **Halber Tag**: Für Feiertage wie Heiligabend
- **Beschreibung**: Optionale Details

### 5. Generieren-Dialog
Automatische Erstellung für ein Jahr:
- **Jahr**: Ziel-Jahr
- **Gesetzliche Feiertage**: Bundesweite automatisch
- **Regionale Feiertage**: Je Bundesland
- **Vorschau**: Liste der zu erstellenden Feiertage

### 6. Kopieren-Dialog
Feiertage aus Vorjahr übernehmen:
- **Quell-Jahr**: Zu kopierendes Jahr
- **Ziel-Jahr**: Neues Jahr
- **Datumsanpassung**: Automatische Korrektur beweglicher Feiertage

## Schritt-für-Schritt Anleitungen

### Feiertage für neues Jahr generieren

1. Klicken Sie auf **"Jahr generieren"**
2. Wählen Sie das **Jahr**
3. Aktivieren Sie gewünschte **Feiertagsarten**
4. Prüfen Sie die **Vorschau**
5. Klicken Sie auf **"Generieren"**
6. Alle Feiertage werden automatisch erstellt

### Feiertage aus Vorjahr kopieren

1. Klicken Sie auf **"Jahr kopieren"**
2. Wählen Sie **Quell-Jahr** und **Ziel-Jahr**
3. Das System passt bewegliche Feiertage an
4. Klicken Sie auf **"Kopieren"**

### Betrieblichen Feiertag hinzufügen

1. Klicken Sie auf **"Feiertag hinzufügen"**
2. Wählen Sie das **Datum**
3. Geben Sie den **Namen** ein (z.B. "Betriebsfeier")
4. Setzen Sie **Art** auf "Betrieblich"
5. Wählen Sie betroffene **Bundesländer** (oder alle)
6. Speichern Sie den Feiertag

### Halben Feiertag einrichten

1. Öffnen oder erstellen Sie den **Feiertag**
2. Aktivieren Sie **"Halber Tag"**
3. Speichern Sie
4. Die Sollzeit wird um 50% reduziert (z.B. Heiligabend)

### Regionalen Feiertag konfigurieren

1. Erstellen oder bearbeiten Sie den **Feiertag**
2. Setzen Sie **Art** auf "Regional"
3. Wählen Sie die betroffenen **Bundesländer**
4. Speichern Sie
5. Nur Mitarbeiter an Standorten in diesen Bundesländern bekommen den Feiertag

### Feiertag löschen

1. Finden Sie den Feiertag in der Tabelle
2. Klicken Sie auf **"Löschen"**
3. Bestätigen Sie die Löschung
4. **Hinweis**: Bereits berechnete Tageswerte bleiben unverändert

## Deutsche Feiertage (Übersicht)

### Bundesweit
- Neujahr (1. Januar)
- Karfreitag (beweglich)
- Ostermontag (beweglich)
- Tag der Arbeit (1. Mai)
- Christi Himmelfahrt (beweglich)
- Pfingstmontag (beweglich)
- Tag der Deutschen Einheit (3. Oktober)
- 1. Weihnachtstag (25. Dezember)
- 2. Weihnachtstag (26. Dezember)

### Regional (Beispiele)
- Heilige Drei Könige (BY, BW, ST)
- Fronleichnam (BY, BW, HE, NW, RP, SL, SN-teils, TH-teils)
- Mariä Himmelfahrt (BY-teils, SL)
- Reformationstag (BB, MV, SN, ST, TH)
- Allerheiligen (BW, BY, NW, RP, SL)
- Buß- und Bettag (SN)

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Tageswerte** | Sollzeit wird auf 0 oder 50% reduziert |
| **Monatsauswertung** | Feiertage in Sollzeit berücksichtigt |
| **Teamübersicht** | Feiertage im Kalender markiert |
| **Abwesenheiten** | Urlaub an Feiertagen wird nicht gezählt |

## Tipps & Best Practices

1. **Jährlich prüfen**: Erstellen Sie Feiertage vor Jahresbeginn.
2. **Regionale Unterschiede**: Achten Sie auf bundeslandabhängige Feiertage.
3. **Generierung nutzen**: Die automatische Generierung spart Zeit.
4. **Bewegliche Feiertage**: Datum bei Kopieren prüfen (Ostern etc.).
5. **Betriebliche Tage**: Betriebsferien als betriebliche Feiertage erfassen.

## Problembehandlung

### Feiertag wird nicht berücksichtigt
**Ursache**: Falsches Bundesland oder Standort-Zuordnung.
**Lösung**: Prüfen Sie Bundesland des Feiertags und Standort des Mitarbeiters.

### Bewegliche Feiertage falsch
**Ursache**: Ostern-basierte Feiertage wurden falsch berechnet.
**Lösung**: Prüfen Sie das Osterdatum und leiten Sie die Feiertage korrekt ab.

### Generierung fehlt Feiertage
**Ursache**: Nicht alle Optionen aktiviert.
**Lösung**: Wiederholen Sie mit allen gewünschten Feiertagsarten.

### Sollzeit nicht angepasst
**Ursache**: Tageswerte wurden noch nicht neu berechnet.
**Lösung**: Warten Sie auf die nächste Berechnung oder lösen Sie sie manuell aus.

## Verwandte Module

- **[Standorte](./standorte.md)** - Bundesland-Zuordnung
- **[Tageswerte](./tageswerte.md)** - Sollzeit-Berechnung
- **[Monatsauswertung](./monatsauswertung.md)** - Monatliche Berücksichtigung
