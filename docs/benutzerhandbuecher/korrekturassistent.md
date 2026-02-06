# Korrekturassistent - Benutzerhandbuch (Admin)

## Überblick

Der **Korrekturassistent** hilft bei der Identifikation und Behebung von Problemen in Zeitdaten. Er findet automatisch Unstimmigkeiten wie fehlende Buchungen, unplausible Zeiten oder Regelverstöße und bietet Korrekturvorschläge an.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Datenbereinigung
- Für die regelmäßige Qualitätskontrolle

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Daten & Berichte → Korrekturassistent

**Direkte URL:** `/admin/correction-assistant`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Korrekturassistent"
- **Analyse starten**: Prüfung auslösen

### 2. Filter
- **Datumsbereich**: Zu prüfender Zeitraum
- **Mitarbeiter**: Einzeln oder alle
- **Problemtyp**: Art der Probleme
- **Status**: Offen/Behoben/Ignoriert

### 3. Problemliste

| Spalte | Beschreibung |
|--------|--------------|
| **Datum** | Betroffenes Datum |
| **Mitarbeiter** | Betroffene Person |
| **Problemtyp** | Art des Problems |
| **Beschreibung** | Detailbeschreibung |
| **Schweregrad** | Warnung/Fehler/Kritisch |
| **Status** | Offen/Behoben/Ignoriert |
| **Aktionen** | Beheben, Ignorieren, Details |

### 4. Problemtypen

| Typ | Beschreibung |
|-----|--------------|
| **Fehlende Buchung** | Kein Kommen oder Gehen |
| **Überlappung** | Zeitliche Überschneidung |
| **Lange Schicht** | Arbeitszeit > X Stunden |
| **Fehlende Pause** | Pause nicht gebucht |
| **Nachtarbeit** | Unerwartete Nachtarbeit |
| **Wochenendarbeit** | Arbeit am Wochenende |
| **Ungerade Buchungen** | Unpaarige Buchungen |

### 5. Korrektur-Dialog
Bei Klick auf "Beheben":
- **Problem-Details**: Was ist falsch
- **Korrekturvorschlag**: Empfohlene Aktion
- **Manuelle Eingabe**: Alternative Korrektur
- **Bestätigen**: Korrektur anwenden

### 6. Korrekturmeldungen-Verwaltung
Anpassung der Meldungstexte:
- Vorlagen für Benachrichtigungen
- Texte pro Problemtyp

## Schritt-für-Schritt Anleitungen

### Analyse durchführen

1. Klicken Sie auf **"Analyse starten"**
2. Wählen Sie den **Datumsbereich**
3. Optional: Einschränkung auf Mitarbeiter
4. Klicken Sie auf **"Analysieren"**
5. Warten Sie auf die Ergebnisse
6. Die gefundenen Probleme werden angezeigt

### Problem beheben

1. Finden Sie das Problem in der Liste
2. Klicken Sie auf **"Beheben"**
3. Prüfen Sie den **Korrekturvorschlag**
4. Passen Sie bei Bedarf an
5. Klicken Sie auf **"Bestätigen"**
6. Das Problem wird als behoben markiert

### Problem ignorieren

1. Finden Sie das Problem
2. Klicken Sie auf **"Ignorieren"**
3. Optional: Geben Sie einen Grund ein
4. Bestätigen Sie
5. Das Problem wird nicht mehr angezeigt

### Nach Typ filtern

1. Nutzen Sie den **Problemtyp-Filter**
2. Wählen Sie z.B. "Fehlende Buchung"
3. Nur diese Problemart wird angezeigt

### Korrekturmeldung anpassen

1. Öffnen Sie **Korrekturmeldungen**
2. Wählen Sie den Problemtyp
3. Bearbeiten Sie den Text
4. Speichern Sie

## Auswirkungen auf andere Module

| Modul | Auswirkung bei Korrektur |
|-------|-------------------------|
| **Buchungen** | Neue/geänderte Buchungen |
| **Tageswerte** | Neuberechnung |
| **Monatswerte** | Aktualisierung |

## Tipps & Best Practices

1. **Wöchentliche Analyse**: Regelmäßig nach Problemen suchen.
2. **Frühzeitig korrigieren**: Probleme zeitnah beheben.
3. **Schweregrad beachten**: Kritische Probleme zuerst.
4. **Ignorieren dokumentieren**: Gründe für ignorierte Probleme angeben.
5. **Muster erkennen**: Wiederkehrende Probleme identifizieren.

## Problembehandlung

### Analyse läuft lange
**Ursache**: Großer Zeitraum oder viele Daten.
**Lösung**: Kleineren Zeitraum wählen.

### Korrektur wird nicht übernommen
**Ursache**: Monat bereits abgeschlossen.
**Lösung**: Monat zuerst wiedereröffnen.

### Zu viele Warnungen
**Lösung**: Prüfen Sie die Regelkonfiguration und passen Sie Schwellwerte an.

## Verwandte Module

- **[Auswertungen](./auswertungen.md)** - Detaildaten
- **[Stundenzettel](./stundenzettel.md)** - Manuelle Korrektur
- **[Monatswerte](./monatswerte.md)** - Monatsdaten
