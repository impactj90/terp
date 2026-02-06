# Schichtplanung - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Schichtplanung** ermöglicht die visuelle Planung und Zuweisung von Schichten an Mitarbeiter. Mit einem interaktiven Board können Sie Schichten per Drag & Drop zuweisen, Teamplanung durchführen und die Besetzung überwachen.

**Wer nutzt dieses Modul:**
- Schichtplaner zur Erstellung von Dienstplänen
- Teamleiter zur Teamplanung
- Personaladministratoren für Überblick und Kontrolle

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte oder Planungsberechtigungen.
2. **Schichten definiert**: Es müssen Schichttypen existieren.
3. **Mitarbeiter zugeordnet**: Mitarbeiter müssen in Teams sein.

## Zugang zum Modul

**Navigationspfad:** Admin → Zeit & Planung → Schichtplanung

**Direkte URL:** `/admin/shift-planning`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Schichtplanung"
- **Zeitraumauswahl**: Woche oder Monat wählen
- **Team-Filter**: Nach Team filtern
- **Bulk-Aktionen**: Mehrfachzuweisung

### 2. Schichtpalette (Shift Palette)
Seitenleiste mit verfügbaren Schichten:
- Farbcodierte Schichttypen
- Drag-Quelle für Zuweisung
- Kurzinfo zu jeder Schicht

### 3. Planungsboard (Planning Board)
Hauptbereich für die Planung:

| Element | Beschreibung |
|---------|--------------|
| **Zeilen** | Ein Mitarbeiter pro Zeile |
| **Spalten** | Tage des gewählten Zeitraums |
| **Zellen** | Schichtzuweisung möglich |

#### Zelleninhalt
- **Leer**: Keine Schicht geplant
- **Schicht-Badge**: Zugewiesene Schicht mit Farbe und Zeit
- **Mehrere Schichten**: Bei Mehrfachzuweisung gestapelt
- **Konflikt-Marker**: Bei Überschneidungen

### 4. Schichten-Datentabelle
Listenansicht aller Schichttypen:

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Schichtbezeichnung |
| **Kürzel** | Kurzcode |
| **Zeit** | Von-Bis Uhrzeit |
| **Dauer** | Stunden |
| **Farbe** | Farbcode |
| **Aktionen** | Bearbeiten, Löschen |

### 5. Schichtformular (Form Sheet)
Zum Anlegen/Bearbeiten von Schichttypen:
- **Name** (Pflicht): z.B. "Frühschicht"
- **Kürzel**: z.B. "FS"
- **Beginn**: Startzeit
- **Ende**: Endzeit
- **Pause**: Pausendauer
- **Farbe**: Für visuelle Unterscheidung
- **Beschreibung**: Optionale Details

### 6. Bulk-Zuweisung (Bulk Assign Dialog)
Für Massenzuweisung:
- Mitarbeiterauswahl (mehrere)
- Datumsbereich
- Schichtauswahl
- Muster (täglich, bestimmte Tage)

### 7. Bereich-Löschen (Delete Range Dialog)
Zum Entfernen von Zuweisungen:
- Mitarbeiterauswahl
- Datumsbereich
- Bestätigung

## Schritt-für-Schritt Anleitungen

### Neuen Schichttyp erstellen

1. Klicken Sie auf **"Schicht hinzufügen"**
2. Geben Sie **Name** und **Kürzel** ein
3. Definieren Sie **Beginn** und **Ende**
4. Optional: Pausendauer angeben
5. Wählen Sie eine **Farbe**
6. Klicken Sie auf **"Speichern"**

### Schicht per Drag & Drop zuweisen

1. Wählen Sie den gewünschten **Zeitraum** und **Team**
2. Ziehen Sie eine Schicht aus der **Palette**
3. Lassen Sie sie auf der gewünschten **Zelle** (Mitarbeiter + Tag) fallen
4. Die Schicht wird sofort zugewiesen

### Schichtzuweisung ändern

1. Klicken Sie auf die bestehende **Schichtzuweisung**
2. Ein Dialog öffnet sich
3. Wählen Sie eine andere **Schicht** oder löschen Sie
4. Änderungen werden sofort gespeichert

### Bulk-Zuweisung durchführen

1. Klicken Sie auf **"Bulk-Zuweisung"**
2. Wählen Sie die **Mitarbeiter** aus
3. Definieren Sie den **Datumsbereich**
4. Wählen Sie die **Schicht**
5. Wählen Sie das **Muster** (alle Tage, nur Werktage, etc.)
6. Klicken Sie auf **"Zuweisen"**

### Zuweisungen löschen

1. Klicken Sie auf **"Bereich löschen"**
2. Wählen Sie die **Mitarbeiter**
3. Definieren Sie den **Datumsbereich**
4. Bestätigen Sie die Löschung
5. Alle Zuweisungen im Bereich werden entfernt

### Nach Team filtern

1. Nutzen Sie den **Team-Filter**
2. Wählen Sie das gewünschte Team
3. Nur Mitarbeiter dieses Teams werden angezeigt
4. Die Planung bleibt teamfokussiert

### Konflikte erkennen

1. Achten Sie auf **rote Markierungen** im Board
2. Diese zeigen Konflikte (z.B. Überlappung, fehlende Ruhezeit)
3. Klicken Sie auf die Zelle für Details
4. Lösen Sie den Konflikt durch Anpassung

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Tageswerte** | Geplante Sollzeit aus Schichtplan |
| **Teamübersicht** | Geplante Schichten anzeigen |
| **Mitarbeiter** | Schichtplan im Profil |
| **Monatsauswertung** | Sollzeit basiert auf Schichtplan |

## Tipps & Best Practices

1. **Konsistente Farben**: Verwenden Sie einheitliche Farben für gleiche Schichttypen.
2. **Kürzel nutzen**: Kurze, einprägsame Kürzel für schnelle Erkennung.
3. **Vorausplanen**: Planen Sie mindestens 1-2 Wochen im Voraus.
4. **Bulk für Regelmäßiges**: Nutzen Sie Bulk-Zuweisung für wiederkehrende Muster.
5. **Konflikte sofort lösen**: Bearbeiten Sie Konflikte zeitnah.
6. **Team-Kapazität beachten**: Achten Sie auf ausreichende Besetzung.

## Problembehandlung

### Drag & Drop funktioniert nicht
**Ursache**: Browser-Problem oder JavaScript-Fehler.
**Lösung**: Aktualisieren Sie die Seite oder versuchen Sie einen anderen Browser.

### Schicht nicht in Palette
**Ursache**: Schichttyp ist inaktiv oder wurde gelöscht.
**Lösung**: Erstellen oder aktivieren Sie den Schichttyp.

### Konflikte werden angezeigt
**Ursache**: Überlappende Schichten oder Regelverstoß.
**Lösung**: Passen Sie die Zuweisungen an, um Konflikte zu lösen.

### Mitarbeiter fehlt im Board
**Ursache**: Mitarbeiter ist nicht im gewählten Team oder inaktiv.
**Lösung**: Prüfen Sie Team-Zuordnung und Status des Mitarbeiters.

### Änderungen werden nicht gespeichert
**Ursache**: Netzwerkfehler.
**Lösung**: Prüfen Sie die Verbindung und versuchen Sie es erneut.

## Verwandte Module

- **[Tagespläne](./tagesplaene.md)** - Alternative für regelmäßige Zeiten
- **[Wochenpläne](./wochenplaene.md)** - Für feste Wochenrhythmen
- **[Tarife](./tarife.md)** - Für rollierende Schichtmodelle
- **[Teamübersicht](./teamuebersicht.md)** - Tagesaktuelle Anwesenheit
- **[Mitarbeiter](./mitarbeiter.md)** - Schichtplan-Zuweisung
