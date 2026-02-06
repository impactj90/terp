# Urlaubskonfiguration - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Urlaubskonfiguration** ermöglicht die Definition von Berechnungsregeln, Übertragungsrichtlinien und Kappungsgrenzen für Urlaubsansprüche. Hier wird festgelegt, wie Urlaubstage berechnet, übertragen und ggf. gekappt werden.

**Wer nutzt dieses Modul:**
- Personaladministratoren für Urlaubsregelungen
- Systemadministratoren für die Konfiguration

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Abwesenheit & Urlaub → Urlaubskonfiguration

**Direkte URL:** `/admin/vacation-config`

## Funktionen & Bedienelemente

### 1. Tab-Navigation
- **Berechnungsgruppen**: Regeln für Anspruchsberechnung
- **Kappungsregel-Gruppen**: Grenzen für Übertrag
- **Sonderberechnungen**: Spezielle Regelungen
- **Kappungsregeln**: Detail-Regeln für Kappung
- **Mitarbeiter-Ausnahmen**: Individuelle Abweichungen
- **Urlaubsvorschau**: Simulation und Prüfung

### 2. Berechnungsgruppen-Tab
Definition, wie der Jahresanspruch berechnet wird:
- **Name**: Gruppenbezeichnung
- **Basisanspruch**: Standard-Urlaubstage
- **Berechnung**: Nach Alter, Betriebszugehörigkeit etc.
- **Zugeordnete Mitarbeiter**: Liste

### 3. Kappungsregel-Gruppen-Tab
Definition von Übertragungsgrenzen:
- **Name**: Gruppenbezeichnung
- **Übertrag möglich**: Ja/Nein
- **Maximaler Übertrag**: Anzahl Tage
- **Verfallsdatum**: z.B. 31. März
- **Zugeordnete Mitarbeiter**: Liste

### 4. Sonderberechnungen-Tab
Spezielle Regelungen:
- Altersabhängige Zusatztage
- Betriebszugehörigkeits-Staffel
- Schwerbehinderung

### 5. Kappungsregeln-Tab
Detail-Konfiguration:
- Maximale Übertragstage
- Verfallsmonat
- Ausnahmen für bestimmte Mitarbeiter

### 6. Mitarbeiter-Ausnahmen-Tab
Individuelle Abweichungen:
- **Mitarbeiter**: Auswahl
- **Abweichender Anspruch**: Individuelle Tage
- **Gültig für Jahr**: Zeitraum
- **Begründung**: Dokumentation

### 7. Urlaubsvorschau-Tab
Simulation und Prüfung:
- **Mitarbeiter auswählen**: Vorschau für bestimmte Person
- **Jahr wählen**: Betroffenes Jahr
- **Berechnung anzeigen**: Schritt-für-Schritt-Aufschlüsselung
- **Vorschau generieren**: Massenvorschau

## Schritt-für-Schritt Anleitungen

### Neue Berechnungsgruppe erstellen

1. Wechseln Sie zum Tab **"Berechnungsgruppen"**
2. Klicken Sie auf **"Gruppe hinzufügen"**
3. Geben Sie einen **Namen** ein (z.B. "Standard Vollzeit")
4. Setzen Sie den **Basisanspruch** (z.B. 30 Tage)
5. Konfigurieren Sie optionale **Zusatzregeln**
6. Speichern Sie die Gruppe
7. Weisen Sie Mitarbeiter zu

### Übertragungsregel definieren

1. Wechseln Sie zum Tab **"Kappungsregel-Gruppen"**
2. Klicken Sie auf **"Gruppe hinzufügen"**
3. Aktivieren Sie **"Übertrag möglich"**
4. Setzen Sie **"Maximaler Übertrag"** (z.B. 10 Tage)
5. Definieren Sie das **Verfallsdatum** (z.B. 31.03.)
6. Speichern Sie die Gruppe

### Mitarbeiter-Ausnahme hinzufügen

1. Wechseln Sie zum Tab **"Mitarbeiter-Ausnahmen"**
2. Klicken Sie auf **"Ausnahme hinzufügen"**
3. Wählen Sie den **Mitarbeiter**
4. Setzen Sie den **abweichenden Anspruch**
5. Wählen Sie das **Jahr**
6. Geben Sie eine **Begründung** ein
7. Speichern Sie

### Urlaubsberechnung simulieren

1. Wechseln Sie zum Tab **"Urlaubsvorschau"**
2. Wählen Sie einen **Mitarbeiter**
3. Wählen Sie das **Jahr**
4. Klicken Sie auf **"Berechnung anzeigen"**
5. Sehen Sie die Aufschlüsselung des Anspruchs

## Berechnungsbeispiel

| Position | Tage |
|----------|------|
| Basisanspruch | 28 |
| + Altersbonus (>50) | 2 |
| + Betriebszugehörigkeit (>10J) | 1 |
| + Schwerbehinderung | 5 |
| **Gesamtanspruch** | **36** |
| + Übertrag aus Vorjahr | 5 |
| **Verfügbar gesamt** | **41** |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Urlaubssalden** | Berechnung basiert auf Konfiguration |
| **Urlaub** | Anzeige des berechneten Anspruchs |
| **Abwesenheiten** | Prüfung gegen verfügbare Tage |

## Tipps & Best Practices

1. **Gruppen statt Einzelregeln**: Verwenden Sie Gruppen für ähnliche Mitarbeiter.
2. **Ausnahmen dokumentieren**: Immer Begründung bei Ausnahmen angeben.
3. **Jährliche Prüfung**: Überprüfen Sie Regeln vor Jahreswechsel.
4. **Vorschau nutzen**: Testen Sie Änderungen mit der Vorschau.
5. **Fristen beachten**: Verfallsdaten klar kommunizieren.

## Problembehandlung

### Anspruch wird falsch berechnet
**Lösung**: Prüfen Sie Gruppenzuordnung und Ausnahmen in der Vorschau.

### Übertrag wird gekappt
**Lösung**: Prüfen Sie die Kappungsregeln und maximalen Übertrag.

### Mitarbeiter nicht in Gruppe
**Lösung**: Weisen Sie den Mitarbeiter einer Berechnungsgruppe zu.

## Verwandte Module

- **[Urlaubssalden](./urlaubssalden.md)** - Kontingente verwalten
- **[Urlaub](./urlaub.md)** - Urlaubsübersicht der Mitarbeiter
- **[Mitarbeiter](./mitarbeiter.md)** - Gruppenzuordnung
