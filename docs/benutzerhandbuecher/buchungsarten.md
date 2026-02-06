# Buchungsarten - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Buchungsarten** ermöglicht die Definition verschiedener Stempelaktionen wie "Kommen", "Gehen", "Pause-Start" oder "Dienstgang-Start". Jede Buchungsart definiert, wie die gebuchte Zeit behandelt wird (Arbeitszeit, Pause, etc.).

**Wer nutzt dieses Modul:**
- Systemadministratoren für die Grundkonfiguration
- Personaladministratoren für Anpassungen

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Abwesenheit & Urlaub → Buchungsarten

**Direkte URL:** `/admin/booking-types`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Buchungsarten"
- **Buchungsart hinzufügen**: Button zum Anlegen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Bezeichnung |
| **Kürzel** | Kurzcode |
| **Richtung** | Kommen/Gehen |
| **Typ** | Arbeit/Pause/Dienstgang |
| **Reihenfolge** | Sortierung |
| **Aktionen** | Bearbeiten, Löschen |

### 3. Formular (Form Sheet)
- **Name** (Pflicht): z.B. "Kommen", "Pause-Start"
- **Kürzel**: z.B. "K", "PS"
- **Richtung**: Kommen (In) oder Gehen (Out)
- **Typ**: Arbeit, Pause, Dienstgang
- **Beschreibung**: Optionale Details
- **Reihenfolge**: Für Anzeige-Sortierung
- **Aktiv**: Status

## Schritt-für-Schritt Anleitungen

### Neue Buchungsart erstellen

1. Klicken Sie auf **"Buchungsart hinzufügen"**
2. Geben Sie **Name** und **Kürzel** ein
3. Wählen Sie die **Richtung** (Kommen/Gehen)
4. Wählen Sie den **Typ** (Arbeit/Pause/Dienstgang)
5. Klicken Sie auf **"Speichern"**

### Buchungsart bearbeiten

1. Finden Sie die Art in der Tabelle
2. Klicken Sie auf **"Bearbeiten"**
3. Ändern Sie die Eigenschaften
4. Speichern Sie

## Typische Buchungsarten

| Name | Kürzel | Richtung | Typ |
|------|--------|----------|-----|
| Kommen | K | In | Arbeit |
| Gehen | G | Out | Arbeit |
| Pause-Start | PS | Out | Pause |
| Pause-Ende | PE | In | Pause |
| Dienstgang-Start | DS | Out | Dienstgang |
| Dienstgang-Ende | DE | In | Dienstgang |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Stempeluhr** | Verfügbare Buchungsaktionen |
| **Stundenzettel** | Darstellung der Buchungen |
| **Tageswerte** | Berechnung nach Typ |
| **Berichte** | Auswertung nach Buchungsart |

## Tipps & Best Practices

1. **Standardarten beibehalten**: Die Basis-Buchungsarten nicht löschen.
2. **Paare bilden**: Start- und Ende-Buchungen zusammen pflegen.
3. **Richtung korrekt**: "Kommen" = In, "Gehen" = Out.
4. **Typ für Berechnung**: Pausenzeit wird anders berechnet als Arbeitszeit.

## Problembehandlung

### Stempeluhr zeigt Art nicht an
**Ursache**: Buchungsart ist inaktiv oder nicht korrekt konfiguriert.
**Lösung**: Prüfen Sie Status und Konfiguration.

### Pausenzeit wird falsch berechnet
**Ursache**: Typ nicht auf "Pause" gesetzt.
**Lösung**: Korrigieren Sie den Typ der Pausenbuchungsarten.

## Verwandte Module

- **[Stempeluhr](./stempeluhr.md)** - Buchungen erfassen
- **[Stundenzettel](./stundenzettel.md)** - Buchungen anzeigen
