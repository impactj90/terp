# Abteilungen - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Abteilungen** ermöglicht die Abbildung der Organisationsstruktur Ihres Unternehmens. Abteilungen können hierarchisch strukturiert sein (Abteilungen mit Unterabteilungen) und dienen der Gruppierung von Mitarbeitern für Berichte und Berechtigungen.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Strukturierung der Organisation
- Systemadministratoren für Berichtsstrukturen
- Controlling für Auswertungen nach Abteilungen

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte für die Abteilungsverwaltung.

## Zugang zum Modul

**Navigationspfad:** Admin → Personal → Abteilungen

**Direkte URL:** `/admin/departments`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Abteilungen"
- **Abteilung hinzufügen**: Button zum Anlegen einer neuen Abteilung

### 2. Ansichten

#### Baumansicht (Tree View)
Hierarchische Darstellung aller Abteilungen:
- Aufklappbare Struktur (Eltern → Kinder)
- Visuell verschachtelte Ebenen
- Schnelle Übersicht der Hierarchie
- Drag & Drop zur Umstrukturierung (falls aktiviert)

#### Tabellenansicht (Data Table)
Flache Liste aller Abteilungen:

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Abteilungsname |
| **Übergeordnet** | Eltern-Abteilung |
| **Kostenstelle** | Zugeordnete Kostenstelle |
| **Leiter** | Abteilungsleiter |
| **Mitarbeiter** | Anzahl zugeordneter Mitarbeiter |
| **Aktionen** | Bearbeiten, Details, Löschen |

### 3. Detail-Ansicht (Detail Sheet)
Detaillierte Informationen zu einer Abteilung:
- Name und Beschreibung
- Übergeordnete Abteilung
- Abteilungsleiter
- Zugeordnete Kostenstelle
- Liste der direkten Unterabteilungen
- Liste der zugeordneten Mitarbeiter

### 4. Formular (Form Sheet)
Zum Anlegen und Bearbeiten von Abteilungen:
- **Name** (Pflicht): Eindeutiger Abteilungsname
- **Übergeordnete Abteilung**: Dropdown für Hierarchie
- **Abteilungsleiter**: Mitarbeiter-Auswahl
- **Kostenstelle**: Zuordnung zu einer Kostenstelle
- **Beschreibung**: Optionale Beschreibung

## Schritt-für-Schritt Anleitungen

### Neue Abteilung anlegen

1. Klicken Sie auf **"Abteilung hinzufügen"**
2. Geben Sie einen **Namen** ein
3. Optional: Wählen Sie eine **übergeordnete Abteilung**
4. Optional: Weisen Sie einen **Abteilungsleiter** zu
5. Optional: Verknüpfen Sie eine **Kostenstelle**
6. Klicken Sie auf **"Speichern"**

### Unterabteilung erstellen

1. Klicken Sie auf **"Abteilung hinzufügen"**
2. Geben Sie den **Namen** der Unterabteilung ein
3. Wählen Sie die **übergeordnete Abteilung** im Dropdown
4. Füllen Sie weitere Felder nach Bedarf aus
5. Klicken Sie auf **"Speichern"**
6. Die Abteilung erscheint in der Hierarchie unter der Eltern-Abteilung

### Abteilungshierarchie ändern

1. Öffnen Sie das **Bearbeitungsformular** der Abteilung
2. Ändern Sie die **übergeordnete Abteilung**
3. Speichern Sie die Änderungen
4. Die Abteilung (mit allen Unterabteilungen) wird verschoben

### Abteilungsleiter zuweisen

1. Öffnen Sie das **Bearbeitungsformular**
2. Wählen Sie einen **Abteilungsleiter** aus dem Mitarbeiter-Dropdown
3. Speichern Sie die Änderungen
4. Der Leiter erhält entsprechende Berechtigungen

### Abteilung löschen

1. Stellen Sie sicher, dass die Abteilung **keine Unterabteilungen** hat
2. Stellen Sie sicher, dass **keine Mitarbeiter** zugeordnet sind
3. Klicken Sie auf das **Löschen-Symbol**
4. Bestätigen Sie die Löschung
5. **Hinweis**: Abteilungen mit Unterabteilungen oder Mitarbeitern können nicht gelöscht werden

### Mitarbeiter einer Abteilung anzeigen

1. Klicken Sie auf das **Details-Symbol** bei der Abteilung
2. Das Detail-Sheet zeigt alle zugeordneten Mitarbeiter
3. Zur Änderung der Zuordnung: Bearbeiten Sie den jeweiligen Mitarbeiter

### Nach Abteilung filtern (in anderen Modulen)

1. In Modulen wie **Mitarbeiter** oder **Berichte**
2. Nutzen Sie den **Abteilungs-Filter**
3. Wählen Sie die gewünschte Abteilung
4. Die Anzeige wird auf diese Abteilung gefiltert

## Auswirkungen auf andere Module

Abteilungen werden in verschiedenen Bereichen verwendet:

| Modul | Verwendung |
|-------|------------|
| **Mitarbeiter** | Zuordnung zu Abteilungen |
| **Berichte** | Filterung und Gruppierung nach Abteilung |
| **Genehmigungen** | Abteilungsbasierte Genehmigungsketten |
| **Lohnexport** | Zuordnung von Zeiten zu Abteilungen |
| **Controlling** | Kostenstellenauswertung über Abteilungen |

## Tipps & Best Practices

1. **Klare Hierarchie**: Definieren Sie eine sinnvolle Hierarchie (nicht zu tief, nicht zu flach).

2. **Eindeutige Namen**: Verwenden Sie eindeutige, aussagekräftige Abteilungsnamen.

3. **Kostenstellen zuordnen**: Verknüpfen Sie Abteilungen mit Kostenstellen für Auswertungen.

4. **Leiter benennen**: Definieren Sie Abteilungsleiter für klare Verantwortlichkeiten.

5. **Regelmäßige Prüfung**: Überprüfen Sie die Struktur bei organisatorischen Änderungen.

6. **Dokumentation**: Nutzen Sie das Beschreibungsfeld für zusätzliche Informationen.

## Problembehandlung

### Abteilung kann nicht gelöscht werden
**Ursache**: Unterabteilungen oder Mitarbeiter sind noch zugeordnet.
**Lösung**: Verschieben Sie Unterabteilungen/Mitarbeiter zuerst in andere Abteilungen.

### Hierarchie-Schleife nicht möglich
**Ursache**: Eine Abteilung kann nicht ihr eigenes Kind als Eltern haben.
**Lösung**: Wählen Sie eine andere übergeordnete Abteilung.

### Abteilung erscheint nicht im Filter
**Ursache**: Abteilung ist inaktiv oder neu erstellt.
**Lösung**: Prüfen Sie den Status oder aktualisieren Sie die Seite.

### Mitarbeiter-Zuordnung nicht sichtbar
**Ursache**: Mitarbeiter hat keine Abteilung zugewiesen.
**Lösung**: Bearbeiten Sie den Mitarbeiter und weisen Sie eine Abteilung zu.

### Baumansicht zeigt falsche Struktur
**Ursache**: Cache-Problem oder kürzliche Änderungen.
**Lösung**: Aktualisieren Sie die Seite.

## Verwandte Module

- **[Mitarbeiter](./mitarbeiter.md)** - Abteilungszuordnung von Mitarbeitern
- **[Teams](./teams.md)** - Teams innerhalb von Abteilungen
- **[Kostenstellen](./kostenstellen.md)** - Kostenstellenzuordnung
- **[Berichte](./berichte.md)** - Abteilungsbasierte Auswertungen
