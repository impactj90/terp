# Mandanten - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Mandanten** ermöglicht die Verwaltung verschiedener Mandanten (Unternehmen/Organisationen) im System. In einer Multi-Mandanten-Umgebung sind alle Daten strikt nach Mandanten getrennt.

**Wer nutzt dieses Modul:**
- System-Superadministratoren
- Für Multi-Mandanten-Umgebungen

## Voraussetzungen

1. **Superadmin-Berechtigung**: Sie benötigen höchste Admin-Rechte.
2. **Multi-Mandanten-Lizenz**: Falls lizenzpflichtig.

## Zugang zum Modul

**Navigationspfad:** Admin → Systemadministration → Mandanten

**Direkte URL:** `/admin/tenants`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Mandanten"
- **Mandant hinzufügen**: Neuen Mandanten anlegen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Mandantenname |
| **Kennung** | Eindeutige ID |
| **Benutzer** | Anzahl Benutzer |
| **Mitarbeiter** | Anzahl Mitarbeiter |
| **Status** | Aktiv/Inaktiv |
| **Aktionen** | Bearbeiten, Deaktivieren |

### 3. Formular (Form Sheet)
- **Name** (Pflicht): Firmenname
- **Kennung** (Pflicht): Eindeutige Kurzkennung
- **Beschreibung**: Optionale Details
- **Logo**: Firmenlogo hochladen
- **Kontakt-E-Mail**: Hauptkontakt
- **Einstellungen**: Mandantenspezifische Konfiguration

### 4. Detail-Ansicht
- Mandanteninformationen
- Statistiken (Benutzer, Mitarbeiter)
- Aktivitätsübersicht

### 5. Deaktivieren-Dialog
- Warnung vor Auswirkungen
- Bestätigung erforderlich

## Schritt-für-Schritt Anleitungen

### Neuen Mandanten anlegen

1. Klicken Sie auf **"Mandant hinzufügen"**
2. Geben Sie **Name** und **Kennung** ein
3. Optional: Logo und Beschreibung
4. Setzen Sie die **Kontakt-E-Mail**
5. Konfigurieren Sie mandantenspezifische **Einstellungen**
6. Speichern Sie

### Mandanten bearbeiten

1. Finden Sie den Mandanten
2. Klicken Sie auf **"Bearbeiten"**
3. Ändern Sie die gewünschten Daten
4. Speichern Sie

### Mandanten deaktivieren

1. Klicken Sie auf **"Deaktivieren"**
2. Lesen Sie die Warnung
3. Bestätigen Sie
4. Alle Benutzer dieses Mandanten werden gesperrt

### Mandanten reaktivieren

1. Bearbeiten Sie den Mandanten
2. Ändern Sie **Status** auf "Aktiv"
3. Speichern Sie

## Auswirkungen auf andere Module

| Modul | Auswirkung |
|-------|------------|
| **Alle Module** | Daten sind mandantengetrennt |
| **Benutzer** | Benutzer gehören zu einem Mandanten |
| **Einstellungen** | Mandantenspezifische Konfiguration |

## Tipps & Best Practices

1. **Eindeutige Kennung**: Kurz, keine Sonderzeichen.
2. **Deaktivieren statt löschen**: Daten bleiben erhalten.
3. **Einstellungen dokumentieren**: Mandantenspezifische Anpassungen.
4. **Regelmäßige Prüfung**: Inaktive Mandanten prüfen.

## Problembehandlung

### Benutzer kann sich nicht anmelden
**Ursache**: Mandant ist deaktiviert.
**Lösung**: Aktivieren Sie den Mandanten.

### Mandant kann nicht gelöscht werden
**Hinweis**: Mandanten können nicht gelöscht, nur deaktiviert werden.

## Verwandte Module

- **[Benutzer](./benutzer.md)** - Mandantenzuordnung
- **[Einstellungen](./einstellungen.md)** - Mandantenspezifische Konfiguration
