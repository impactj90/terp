# Urlaubssalden - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Urlaubssalden** ermöglicht die Verwaltung der Urlaubskontingente aller Mitarbeiter. Hier können Salden initialisiert, angepasst und korrigiert werden. Das Modul zeigt den aktuellen Stand aller Mitarbeiter und ermöglicht Massenoperationen.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Kontingent-Verwaltung
- Für die jährliche Initialisierung der Urlaubssalden

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.
2. **Urlaubskonfiguration**: Berechnungsgruppen sollten definiert sein.

## Zugang zum Modul

**Navigationspfad:** Admin → Abwesenheit & Urlaub → Urlaubssalden

**Direkte URL:** `/admin/vacation-balances`

## Funktionen & Bedienelemente

### 1. Seitenheader & Toolbar
- **Titel**: "Urlaubssalden"
- **Jahrauswahl**: Dropdown zur Jahresauswahl
- **Jahr initialisieren**: Masseninitialisierung
- **Export**: Salden exportieren

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Mitarbeiter** | Name |
| **Anspruch** | Jahres-Gesamtanspruch |
| **Übertrag** | Aus Vorjahr |
| **Genommen** | Bereits genutzt |
| **Geplant** | Genehmigt, noch nicht genommen |
| **Verbleibend** | Noch verfügbar |
| **Aktionen** | Bearbeiten, Details |

### 3. Toolbar
- **Jahresauswahl**: Zwischen Jahren wechseln
- **Filter**: Nach Status, Abteilung, Team
- **Suche**: Nach Mitarbeiternamen

### 4. Formular (Form Sheet)
Zum Bearbeiten eines Urlaubssaldos:
- **Basisanspruch**: Standard-Urlaubstage
- **Zusatztage**: Bonus-Tage
- **Übertrag**: Aus Vorjahr (automatisch oder manuell)
- **Anpassung**: Manuelle Korrektur (+/-)
- **Begründung**: Dokumentation für Änderungen

### 5. Detail-Ansicht
- Vollständige Aufschlüsselung
- Transaktionsverlauf
- Geplante Abwesenheiten

### 6. Jahr-Initialisieren-Dialog
Massenoperation für neues Jahr:
- **Jahr auswählen**: Zu initialisierendes Jahr
- **Mitarbeiter-Auswahl**: Alle oder bestimmte
- **Übertrag berechnen**: Automatische Übernahme
- **Vorschau**: Ergebnisvorschau

## Schritt-für-Schritt Anleitungen

### Jahr initialisieren

1. Klicken Sie auf **"Jahr initialisieren"**
2. Wählen Sie das **Ziel-Jahr**
3. Wählen Sie die **Mitarbeiter** (alle oder Auswahl)
4. Aktivieren Sie **"Übertrag berechnen"** für automatische Übernahme
5. Prüfen Sie die **Vorschau**
6. Klicken Sie auf **"Initialisieren"**
7. Alle Salden werden erstellt

### Einzelnen Saldo anpassen

1. Finden Sie den Mitarbeiter in der Tabelle
2. Klicken Sie auf **"Bearbeiten"**
3. Passen Sie die Werte an:
   - Zusatztage hinzufügen
   - Übertrag korrigieren
   - Anpassung vornehmen
4. Geben Sie eine **Begründung** ein
5. Speichern Sie

### Übertrag korrigieren

1. Öffnen Sie den **Saldo** des Mitarbeiters
2. Ändern Sie den Wert bei **"Übertrag"**
3. Dokumentieren Sie den Grund
4. Speichern Sie

### Saldo prüfen

1. Suchen Sie den Mitarbeiter
2. Klicken Sie auf **"Details"**
3. Sehen Sie alle Komponenten:
   - Basisanspruch
   - Zusatztage
   - Übertrag
   - Genommen
   - Geplant

### Salden exportieren

1. Stellen Sie die gewünschten **Filter** ein
2. Klicken Sie auf **"Export"**
3. Wählen Sie das Format (CSV/Excel)
4. Die Datei wird heruntergeladen

## Berechnungslogik

```
Verfügbar = Basisanspruch
          + Zusatztage
          + Übertrag
          + Anpassungen
          - Genommen
          - Geplant
```

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Urlaub** | Anzeige des Saldos für Mitarbeiter |
| **Abwesenheiten** | Prüfung bei Antragstellung |
| **Dashboard** | Urlaubsguthaben-Karte |

## Tipps & Best Practices

1. **Frühzeitig initialisieren**: Salden vor Jahresbeginn erstellen.
2. **Übertrag prüfen**: Automatischen Übertrag auf Korrektheit prüfen.
3. **Begründungen dokumentieren**: Bei manuellen Änderungen.
4. **Regelmäßige Kontrolle**: Monatlich Salden auf Plausibilität prüfen.
5. **Export für Dokumentation**: Jährlicher Export zur Archivierung.

## Problembehandlung

### Mitarbeiter hat keinen Saldo
**Ursache**: Jahr wurde nicht initialisiert.
**Lösung**: Initialisieren Sie das Jahr für diesen Mitarbeiter.

### Übertrag ist falsch
**Ursache**: Vorjahressaldo war nicht korrekt.
**Lösung**: Korrigieren Sie den Übertrag manuell.

### Verbleibend ist negativ
**Ursache**: Mehr Urlaub genommen als Anspruch.
**Lösung**: Prüfen Sie die Buchungen und passen Sie ggf. an.

### Doppelte Salden
**Ursache**: Mehrfache Initialisierung.
**Lösung**: Löschen Sie doppelte Einträge.

## Verwandte Module

- **[Urlaubskonfiguration](./urlaubskonfiguration.md)** - Berechnungsregeln
- **[Urlaub](./urlaub.md)** - Mitarbeiter-Ansicht
- **[Abwesenheiten](./abwesenheiten.md)** - Anträge stellen
