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
| **Ungenehmigte Überstunden** (`UNAPPROVED_OVERTIME`) | Überstunden ohne genehmigten Antrag |

### 5. Korrektur-Dialog
Bei Klick auf "Beheben":
- **Problem-Details**: Was ist falsch
- **Korrekturvorschlag**: Empfohlene Aktion
- **Manuelle Eingabe**: Alternative Korrektur
- **Bestätigen**: Korrektur anwenden

#### Spezialaktion für `UNAPPROVED_OVERTIME`
Wenn die gewählte Zeile den Code `UNAPPROVED_OVERTIME` trägt, erscheint im Detail-Sheet ein zusätzlicher Button **"Als Überstunden genehmigen"**. Ein Klick darauf:

1. Erzeugt im Hintergrund einen rückwirkend genehmigten Überstundenantrag (Typ "Geplant") mit den am Tag tatsächlich geleisteten Überstunden als Minuten.
2. Setzt den Antrag direkt auf "Genehmigt" mit dem aktuellen Benutzer als Approver.
3. Startet eine Neuberechnung des Tages — `UNAPPROVED_OVERTIME` verschwindet aus der Liste.
4. Schreibt einen Audit-Eintrag mit der Aktion `approve_as_overtime`.

Diese Aktion ist der **schnelle Weg** für HR, einmalige Überschreitungen zu sanktionieren, ohne den vollen Antragsworkflow rückwirkend durchlaufen zu müssen.

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

### Ungenehmigte Überstunden nachträglich genehmigen

1. Filtern Sie die Liste auf Code `UNAPPROVED_OVERTIME` oder Severity "Fehler".
2. Klicken Sie auf die betroffene Zeile — das Detail-Sheet öffnet sich.
3. Klicken Sie auf **"Als Überstunden genehmigen"** im Footer.
4. Sie erhalten die Bestätigung "Überstunden nachträglich genehmigt" und das Sheet schließt sich.
5. Die Zeile verschwindet nach Neuladen aus der Liste.
6. Unter **Überstundenanträge** erscheint ein neuer Antrag mit Status "Genehmigt" und dem aktuellen Benutzer als Genehmiger.

Alternativ (für Ablehnung oder Klärung):
- **Ignorieren**: Eintrag verschwindet aus der Liste, ohne dass ein Antrag entsteht — nutzen Sie dies **nur**, wenn die Überstunden tatsächlich verfallen sollen.
- **Mit Mitarbeiter klären**: Eintrag bleibt offen, Sie sprechen direkt mit dem MA und entscheiden später.

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
| **Überstundenanträge** | Bei "Als Überstunden genehmigen": neuer Antrag mit Status "Genehmigt" |
| **Audit-Protokoll** | `approve_as_overtime`-Eintrag beim rückwirkenden Genehmigen |

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
- **[Überstundenanträge](./ueberstundenantraege.md)** - Vorab-Anträge, die `UNAPPROVED_OVERTIME` gar nicht erst entstehen lassen
- **[Überstunden-Genehmigungen](./ueberstunden-genehmigungen.md)** - Regulärer Approval-Workflow statt nachträglicher Genehmigung
