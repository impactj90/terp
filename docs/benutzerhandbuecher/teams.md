# Teams - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Teams** ermöglicht die Verwaltung von Arbeitsgruppen und deren Zusammensetzung. Teams gruppieren Mitarbeiter für die Teamübersicht, Genehmigungsworkflows und Berichterstellung. Jedes Team kann einen Teamleiter haben, der besondere Berechtigungen erhält.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Team-Strukturierung
- Abteilungsleiter zur Verwaltung ihrer Teams
- Systemadministratoren für Berechtigungsstrukturen

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte für die Teamverwaltung.
2. **Mitarbeiter angelegt**: Mitarbeiter müssen existieren, um sie Teams zuzuweisen.

## Zugang zum Modul

**Navigationspfad:** Admin → Personal → Teams

**Direkte URL:** `/admin/teams`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Teams"
- **Team hinzufügen**: Button zum Anlegen eines neuen Teams

### 2. Datentabelle
Übersicht aller Teams mit folgenden Spalten:

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Teamname |
| **Beschreibung** | Kurzbeschreibung des Teams |
| **Teamleiter** | Zugewiesener Leiter |
| **Mitglieder** | Anzahl der Teammitglieder |
| **Status** | Aktiv/Inaktiv |
| **Aktionen** | Bearbeiten, Mitglieder, Details, Löschen |

### 3. Detail-Ansicht (Detail Sheet)
Detaillierte Informationen zu einem Team:
- Teamname und Beschreibung
- Teamleiter mit Kontaktdaten
- Vollständige Mitgliederliste
- Erstellungs- und Änderungsdatum

### 4. Formular (Form Sheet)
Zum Anlegen und Bearbeiten von Teams:
- **Teamname** (Pflicht): Eindeutiger Name
- **Beschreibung**: Optionale Beschreibung
- **Teamleiter**: Dropdown zur Auswahl eines Mitarbeiters
- **Status**: Aktiv/Inaktiv

### 5. Mitgliederverwaltung (Member Management Sheet)
Eigenes Sheet zur Verwaltung der Teammitglieder:
- Liste aller aktuellen Mitglieder
- Suche nach Mitarbeitern zum Hinzufügen
- Entfernen-Button für jedes Mitglied
- Rollen-Zuweisung (Mitglied, Stellvertreter)

## Schritt-für-Schritt Anleitungen

### Neues Team anlegen

1. Klicken Sie auf **"Team hinzufügen"**
2. Geben Sie einen **Teamnamen** ein
3. Optional: Fügen Sie eine **Beschreibung** hinzu
4. Wählen Sie einen **Teamleiter** aus dem Dropdown
5. Klicken Sie auf **"Speichern"**
6. Das Team wird erstellt (noch ohne Mitglieder)

### Mitglieder zu einem Team hinzufügen

1. Finden Sie das Team in der Tabelle
2. Klicken Sie auf **"Mitglieder"** (Personen-Symbol)
3. Im **Mitgliederverwaltungs-Sheet**:
4. Suchen Sie nach dem gewünschten Mitarbeiter
5. Klicken Sie auf **"Hinzufügen"**
6. Der Mitarbeiter erscheint in der Mitgliederliste
7. Wiederholen Sie für weitere Mitglieder

### Mitglied aus Team entfernen

1. Öffnen Sie die **Mitgliederverwaltung** des Teams
2. Finden Sie das zu entfernende Mitglied
3. Klicken Sie auf **"Entfernen"** (X-Symbol)
4. Bestätigen Sie die Aktion
5. Das Mitglied wird aus dem Team entfernt

### Teamleiter ändern

1. Klicken Sie auf **"Bearbeiten"** beim Team
2. Wählen Sie einen neuen **Teamleiter** im Dropdown
3. Klicken Sie auf **"Speichern"**
4. Der neue Teamleiter erhält die entsprechenden Berechtigungen

### Team deaktivieren

1. Öffnen Sie das **Bearbeitungsformular**
2. Ändern Sie den **Status** auf "Inaktiv"
3. Speichern Sie die Änderungen
4. Das Team wird in Listen ausgeblendet, die Historie bleibt erhalten

### Team löschen

1. Stellen Sie sicher, dass das Team **keine Mitglieder** hat
2. Klicken Sie auf das **Löschen-Symbol** (Papierkorb)
3. Bestätigen Sie die Löschung
4. **Hinweis**: Teams mit Mitgliedern können nicht gelöscht werden

### Team-Details einsehen

1. Klicken Sie auf das **Details-Symbol** beim Team
2. Das Detail-Sheet zeigt alle Informationen
3. Inklusive vollständiger Mitgliederliste
4. Und Teamleiter-Kontaktdaten

## Auswirkungen auf andere Module

Teams beeinflussen verschiedene Systembereiche:

| Modul | Auswirkung |
|-------|------------|
| **Teamübersicht** | Zeigt Anwesenheit und Statistiken des Teams |
| **Genehmigungen** | Teamleiter können Anträge genehmigen |
| **Schichtplanung** | Planung kann nach Teams gefiltert werden |
| **Berichte** | Filterung und Gruppierung nach Teams |
| **Mitarbeiter** | Team-Zuordnung im Mitarbeiterprofil |

## Tipps & Best Practices

1. **Aussagekräftige Namen**: Wählen Sie klare, eindeutige Teamnamen.

2. **Teamleiter definieren**: Jedes Team sollte einen Teamleiter haben für Genehmigungsworkflows.

3. **Überschaubare Größe**: Halten Sie Teams auf eine handhabbare Größe (5-15 Mitglieder).

4. **Aktualität pflegen**: Aktualisieren Sie Teamzuordnungen bei Wechseln zeitnah.

5. **Beschreibungen nutzen**: Beschreibungen helfen bei der Orientierung in großen Organisationen.

6. **Inaktiv statt löschen**: Deaktivieren Sie nicht mehr benötigte Teams statt sie zu löschen.

7. **Stellvertreter benennen**: Für wichtige Teams einen Stellvertreter des Teamleiters festlegen.

## Problembehandlung

### Team kann nicht gelöscht werden
**Ursache**: Das Team hat noch Mitglieder.
**Lösung**: Entfernen Sie zuerst alle Mitglieder oder deaktivieren Sie das Team.

### Teamleiter wird nicht akzeptiert
**Ursache**: Gewählter Mitarbeiter ist inaktiv oder hat keine Berechtigung.
**Lösung**: Wählen Sie einen aktiven Mitarbeiter mit entsprechenden Rechten.

### Mitarbeiter kann Team nicht sehen
**Ursache**: Mitarbeiter ist nicht Mitglied des Teams.
**Lösung**: Fügen Sie den Mitarbeiter zum Team hinzu.

### Team erscheint nicht in Teamübersicht
**Ursache**: Team ist inaktiv oder hat keine Mitglieder.
**Lösung**: Aktivieren Sie das Team und fügen Sie Mitglieder hinzu.

### Doppelte Mitglieder
**Ursache**: Technischer Fehler oder doppeltes Hinzufügen.
**Lösung**: Entfernen Sie das doppelte Mitglied. Bei persistentem Problem: Administrator kontaktieren.

### Teamleiter kann nicht genehmigen
**Ursache**: Berechtigungsproblem oder falsche Konfiguration.
**Lösung**: Prüfen Sie die Benutzergruppen und Rollen des Teamleiters.

## Verwandte Module

- **[Mitarbeiter](./mitarbeiter.md)** - Mitarbeiter Teams zuweisen
- **[Teamübersicht](./teamuebersicht.md)** - Team-Anwesenheit anzeigen
- **[Abteilungen](./abteilungen.md)** - Übergeordnete Organisationsstruktur
- **[Genehmigungen](./genehmigungen.md)** - Genehmigungsworkflows
- **[Schichtplanung](./schichtplanung.md)** - Teambasierte Planung
