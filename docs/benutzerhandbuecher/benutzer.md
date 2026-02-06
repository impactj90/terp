# Benutzer - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Benutzer** ermöglicht die Verwaltung aller Benutzerkonten im System. Hier werden Zugangsdaten, Berechtigungen und die Verknüpfung mit Mitarbeiterdatensätzen verwaltet.

**Wer nutzt dieses Modul:**
- Systemadministratoren für Benutzerverwaltung
- Personaladministratoren für Zugangssteuerung

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Systemadministration → Benutzer

**Direkte URL:** `/admin/users`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Benutzer"
- **Benutzer hinzufügen**: Neues Konto erstellen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **E-Mail** | Login-E-Mail |
| **Anzeigename** | Dargestellter Name |
| **Mitarbeiter** | Verknüpfter Mitarbeiter |
| **Benutzergruppe** | Zugeordnete Gruppe |
| **Letzter Login** | Letzte Anmeldung |
| **Status** | Aktiv/Gesperrt |
| **Aktionen** | Bearbeiten, Passwort, Löschen |

### 3. Formular (Form Sheet)
- **E-Mail** (Pflicht): Login-Adresse
- **Anzeigename**: Dargestellter Name
- **Passwort**: Bei Neuanlage oder Zurücksetzen
- **Benutzergruppe**: Rechte-Zuweisung
- **Mitarbeiter**: Verknüpfung (optional)
- **Status**: Aktiv/Gesperrt

### 4. Passwort-Ändern-Dialog
- **Neues Passwort**: Eingabe
- **Passwort bestätigen**: Wiederholung
- **Benachrichtigung senden**: E-Mail an Benutzer

### 5. Löschen-Dialog
- Warnung vor den Auswirkungen
- Option: Mitarbeiter-Verknüpfung entfernen
- Bestätigung erforderlich

## Schritt-für-Schritt Anleitungen

### Neuen Benutzer anlegen

1. Klicken Sie auf **"Benutzer hinzufügen"**
2. Geben Sie die **E-Mail-Adresse** ein
3. Vergeben Sie einen **Anzeigenamen**
4. Setzen Sie ein **Passwort**
5. Wählen Sie eine **Benutzergruppe**
6. Optional: Verknüpfen Sie einen **Mitarbeiter**
7. Speichern Sie

### Passwort zurücksetzen

1. Finden Sie den Benutzer
2. Klicken Sie auf **"Passwort ändern"**
3. Geben Sie ein **neues Passwort** ein
4. Bestätigen Sie das Passwort
5. Optional: **Benachrichtigung senden**
6. Speichern Sie

### Benutzer sperren

1. Bearbeiten Sie den Benutzer
2. Ändern Sie **Status** auf "Gesperrt"
3. Speichern Sie
4. Der Benutzer kann sich nicht mehr anmelden

### Benutzer entsperren

1. Bearbeiten Sie den Benutzer
2. Ändern Sie **Status** auf "Aktiv"
3. Speichern Sie

### Mit Mitarbeiter verknüpfen

1. Bearbeiten Sie den Benutzer
2. Wählen Sie einen **Mitarbeiter** im Dropdown
3. Speichern Sie
4. Der Benutzer hat nun Zugriff auf Mitarbeiterfunktionen

### Benutzer löschen

1. Klicken Sie auf **"Löschen"**
2. Lesen Sie die Warnung
3. Bestätigen Sie
4. **Hinweis**: Besser sperren statt löschen für Audit-Trail

## Auswirkungen auf andere Module

| Modul | Auswirkung |
|-------|------------|
| **Mitarbeiter** | Zugang zu Mitarbeiterfunktionen |
| **Alle Module** | Berechtigungen je nach Benutzergruppe |
| **Audit-Logs** | Aktionen werden protokolliert |

## Tipps & Best Practices

1. **Eindeutige E-Mails**: Jede E-Mail nur einmal verwenden.
2. **Starke Passwörter**: Mindestens 8 Zeichen, Komplexität.
3. **Gruppen nutzen**: Berechtigungen über Gruppen, nicht einzeln.
4. **Sperren statt löschen**: Für Nachvollziehbarkeit.
5. **Mitarbeiter verknüpfen**: Für volle Funktionalität.

## Problembehandlung

### Benutzer kann sich nicht anmelden
**Ursache**: Gesperrt, falsches Passwort, oder inaktiv.
**Lösung**: Prüfen Sie Status und setzen Sie ggf. das Passwort zurück.

### Benutzer sieht keine Daten
**Ursache**: Nicht mit Mitarbeiter verknüpft.
**Lösung**: Verknüpfen Sie einen Mitarbeiterdatensatz.

### Berechtigungen fehlen
**Ursache**: Falsche Benutzergruppe.
**Lösung**: Weisen Sie die korrekte Gruppe zu.

## Verwandte Module

- **[Benutzergruppen](./benutzergruppen.md)** - Berechtigungen definieren
- **[Mitarbeiter](./mitarbeiter.md)** - Verknüpfung
- **[Audit-Protokolle](./audit-protokolle.md)** - Aktivitätsprotokoll
