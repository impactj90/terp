# Benutzergruppen - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Benutzergruppen** ermöglicht die Definition von Berechtigungsgruppen. Jede Gruppe definiert, auf welche Module und Funktionen ihre Mitglieder zugreifen können.

**Wer nutzt dieses Modul:**
- Systemadministratoren für Rechtemanagement
- Für die Zugriffssteuerung

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Systemadministration → Benutzergruppen

**Direkte URL:** `/admin/user-groups`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Benutzergruppen"
- **Gruppe hinzufügen**: Neue Gruppe erstellen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Gruppenname |
| **Beschreibung** | Details |
| **Benutzer** | Anzahl Mitglieder |
| **Berechtigungen** | Anzahl Rechte |
| **Aktionen** | Bearbeiten, Löschen |

### 3. Formular (Form Sheet)
- **Name** (Pflicht): Gruppenbezeichnung
- **Beschreibung**: Optionale Details
- **Berechtigungen**: Checkboxen für Module/Funktionen

### 4. Berechtigungs-Matrix
Übersicht aller verfügbaren Rechte:

| Bereich | Berechtigungen |
|---------|---------------|
| Dashboard | Ansicht |
| Stempeluhr | Eigene, Für Andere |
| Stundenzettel | Eigene, Alle, Bearbeiten |
| Abwesenheiten | Eigene, Alle, Genehmigen |
| Admin-Module | Je Modul einzeln |

## Schritt-für-Schritt Anleitungen

### Neue Gruppe erstellen

1. Klicken Sie auf **"Gruppe hinzufügen"**
2. Geben Sie einen **Namen** ein
3. Optional: Beschreibung
4. Wählen Sie die **Berechtigungen**
5. Speichern Sie

### Berechtigungen bearbeiten

1. Bearbeiten Sie die Gruppe
2. Aktivieren/Deaktivieren Sie **Berechtigungen**
3. Speichern Sie
4. Änderungen gelten sofort für alle Mitglieder

### Gruppe löschen

1. Stellen Sie sicher, dass keine Benutzer zugeordnet sind
2. Klicken Sie auf **"Löschen"**
3. Bestätigen Sie

## Typische Gruppen

| Gruppe | Typische Rechte |
|--------|-----------------|
| Mitarbeiter | Dashboard, Stempeluhr, eigene Daten |
| Teamleiter | + Team-Ansicht, Genehmigungen |
| HR | + Alle Mitarbeiterdaten, Admin-Module |
| Admin | Vollzugriff |

## Auswirkungen auf andere Module

| Modul | Auswirkung |
|-------|------------|
| **Benutzer** | Gruppen werden Benutzern zugewiesen |
| **Alle Module** | Zugriff basiert auf Gruppenrechten |

## Tipps & Best Practices

1. **Minimale Rechte**: Nur benötigte Berechtigungen vergeben.
2. **Gruppenlogik**: Gruppen nach Rollen, nicht Personen.
3. **Dokumentieren**: Beschreibung für jede Gruppe.
4. **Testen**: Neue Gruppen als Testbenutzer prüfen.

## Problembehandlung

### Benutzer hat zu viele/wenige Rechte
**Lösung**: Prüfen und korrigieren Sie die Gruppenberechtigungen.

### Gruppe kann nicht gelöscht werden
**Ursache**: Benutzer sind noch zugeordnet.
**Lösung**: Weisen Sie Benutzern eine andere Gruppe zu.

## Verwandte Module

- **[Benutzer](./benutzer.md)** - Gruppenzuweisung
- **[Audit-Protokolle](./audit-protokolle.md)** - Änderungsprotokoll
