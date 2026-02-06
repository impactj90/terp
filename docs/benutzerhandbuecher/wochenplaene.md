# Wochenpläne - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Wochenpläne** ermöglicht die Kombination von Tagesplänen zu vollständigen Wochenmodellen. Ein Wochenplan definiert für jeden Wochentag (Montag bis Sonntag) den anzuwendenden Tagesplan und damit die Sollarbeitszeit.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Arbeitszeitkonfiguration
- Systemadministratoren für Zeitmodelle

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.
2. **Tagespläne vorhanden**: Es müssen Tagespläne existieren.

## Zugang zum Modul

**Navigationspfad:** Admin → Zeit & Planung → Wochenpläne

**Direkte URL:** `/admin/week-plans`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Wochenpläne"
- **Wochenplan hinzufügen**: Button zum Anlegen
- **Kopieren-Funktion**: Bestehenden Plan als Vorlage

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Bezeichnung des Plans |
| **Wochenstunden** | Summe der Sollstunden |
| **Mo-So** | Kurzübersicht der Tageszeiten |
| **Mitarbeiter** | Anzahl zugeordneter Mitarbeiter |
| **Aktionen** | Bearbeiten, Kopieren, Details, Löschen |

### 3. Formular (Form Sheet)
- **Name** (Pflicht): Eindeutiger Name
- **Montag bis Sonntag**: Dropdown zur Auswahl des Tagesplans pro Tag
- **Beschreibung**: Optionale Details

### 4. Detail-Ansicht
- Vollständige Wochenübersicht
- Sollstunden pro Tag
- Wochensumme
- Liste zugeordneter Mitarbeiter

### 5. Kopieren-Dialog
- Neuer Name für die Kopie
- Direkte Anpassung der Tageszuordnungen

## Schritt-für-Schritt Anleitungen

### Neuen Wochenplan anlegen

1. Klicken Sie auf **"Wochenplan hinzufügen"**
2. Geben Sie einen **Namen** ein (z.B. "Vollzeit Mo-Fr 40h")
3. Wählen Sie für jeden **Wochentag** einen Tagesplan:
   - Montag: Vollzeit 8h
   - Dienstag: Vollzeit 8h
   - Mittwoch: Vollzeit 8h
   - Donnerstag: Vollzeit 8h
   - Freitag: Vollzeit 8h
   - Samstag: Frei (0h)
   - Sonntag: Frei (0h)
4. Klicken Sie auf **"Speichern"**

### Wochenplan für Teilzeit erstellen

1. Klicken Sie auf **"Wochenplan hinzufügen"**
2. Geben Sie den **Namen** ein (z.B. "Teilzeit 50% Mo-Fr")
3. Wählen Sie für jeden Tag einen 4h-Tagesplan oder:
   - Nur bestimmte Tage mit vollem Plan
   - Andere Tage auf "Frei" setzen
4. Speichern Sie den Plan

### Wochenplan kopieren

1. Finden Sie den zu kopierenden Plan
2. Klicken Sie auf **"Kopieren"**
3. Vergeben Sie einen neuen **Namen**
4. Passen Sie bei Bedarf einzelne Tage an
5. Speichern Sie die Kopie

### Wochenplan bearbeiten

1. Klicken Sie auf **"Bearbeiten"**
2. Ändern Sie die Tageszuordnungen
3. Speichern Sie die Änderungen
4. **Hinweis**: Änderungen wirken sich auf alle zugeordneten Mitarbeiter aus

### Mitarbeiter zuordnen

Wochenpläne werden Mitarbeitern im **Mitarbeiter-Modul** zugewiesen:
1. Öffnen Sie den Mitarbeiter
2. Wählen Sie im Bereich "Zeitplan" den Wochenplan
3. Setzen Sie das "Gültig ab"-Datum
4. Speichern Sie

## Typische Wochenpläne

| Name | Mo-Fr | Sa-So | Summe |
|------|-------|-------|-------|
| Vollzeit 40h | 8h/Tag | 0h | 40h |
| Vollzeit 38,5h | 8h (Mo-Do), 6,5h (Fr) | 0h | 38,5h |
| Teilzeit 50% | 4h/Tag | 0h | 20h |
| Teilzeit 3 Tage | 8h (Mo-Mi) | 0h | 24h |
| Schicht inkl. Samstag | 8h (Mo-Sa) | So 0h | 48h |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Mitarbeiter** | Zuweisung des Wochenplans |
| **Tarife** | Wochenpläne in rollierenden Modellen |
| **Tageswerte** | Sollzeit-Berechnung |
| **Monatsauswertung** | Monatliche Sollstunden |
| **Schichtplanung** | Basis für Schichtzuweisung |

## Tipps & Best Practices

1. **Klare Benennung**: Name sollte Arbeitszeit enthalten (z.B. "40h Mo-Fr").
2. **Standardpläne definieren**: Erstellen Sie Pläne für alle gängigen Modelle.
3. **Kopieren nutzen**: Bei ähnlichen Plänen von bestehendem kopieren.
4. **Wochensumme prüfen**: Die berechnete Summe im Formular prüfen.
5. **Dokumentieren**: Nutzen Sie die Beschreibung für Sonderfälle.

## Problembehandlung

### Wochenplan kann nicht gelöscht werden
**Ursache**: Plan ist Mitarbeitern oder Tarifen zugeordnet.
**Lösung**: Entfernen Sie zuerst alle Zuordnungen.

### Wochensumme stimmt nicht
**Ursache**: Ein Tagesplan hat falsche Sollzeit.
**Lösung**: Prüfen Sie die zugeordneten Tagespläne.

### Tagesplan nicht in Dropdown
**Ursache**: Tagesplan existiert nicht oder ist inaktiv.
**Lösung**: Erstellen Sie den benötigten Tagesplan oder aktivieren Sie ihn.

### Mitarbeiter zeigt falsche Sollzeit
**Ursache**: Falscher Wochenplan zugewiesen oder "Gültig ab" in der Zukunft.
**Lösung**: Prüfen Sie die Zeitplan-Zuweisung im Mitarbeiterprofil.

## Verwandte Module

- **[Tagespläne](./tagesplaene.md)** - Einzelne Tage definieren
- **[Tarife](./tarife.md)** - Rollierende Wochenpläne
- **[Mitarbeiter](./mitarbeiter.md)** - Zeitplan-Zuweisung
- **[Schichtplanung](./schichtplanung.md)** - Schichtbasierte Planung
