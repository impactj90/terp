# Aufträge & Aktivitäten - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Aufträge & Aktivitäten** ermöglicht die Verwaltung von Projekten, Aufträgen und den dazugehörigen Aktivitäten. Mitarbeiter können ihre Arbeitszeit auf bestimmte Aufträge buchen, was für Projektabrechnung und Kundenreporting verwendet wird.

**Wer nutzt dieses Modul:**
- Projektmanager zur Auftragsverwaltung
- Personaladministratoren für Mitarbeiterzuordnung
- Controlling für Projektauswertungen

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Berechnung & Aufträge → Aufträge

**Direkte URL:** `/admin/orders`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Aufträge & Aktivitäten"
- **Auftrag hinzufügen**: Neuen Auftrag erstellen

### 2. Auftrags-Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Auftragsnummer** | Eindeutige Kennung |
| **Name** | Auftragsbezeichnung |
| **Kunde** | Zugeordneter Kunde |
| **Status** | Offen/In Bearbeitung/Abgeschlossen |
| **Aktivitäten** | Anzahl Aktivitäten |
| **Zuweisungen** | Anzahl zugewiesener Mitarbeiter |
| **Aktionen** | Details, Bearbeiten, Löschen |

### 3. Auftragsformular (Form Sheet)
- **Auftragsnummer** (Pflicht): Eindeutige Nummer
- **Name** (Pflicht): Bezeichnung
- **Kunde**: Kundenauswahl
- **Beschreibung**: Details zum Auftrag
- **Startdatum**: Projektbeginn
- **Enddatum**: Geplantes Projektende
- **Status**: Offen/In Bearbeitung/Abgeschlossen
- **Budget-Stunden**: Geplante Stunden

### 4. Auftragsdetails-Seite
Separate Seite mit Tabs:
- **Übersicht**: Auftragsinfos
- **Aktivitäten**: Liste der Aktivitäten
- **Zuweisungen**: Mitarbeiterzuordnungen
- **Buchungen**: Gebuchte Zeiten

### 5. Aktivitäten-Verwaltung
- **Aktivität hinzufügen**: Neue Aktivität zum Auftrag
- **Name**: Aktivitätsbezeichnung
- **Beschreibung**: Details
- **Stunden-Budget**: Geplante Stunden für Aktivität

### 6. Zuweisungs-Dialog
Mitarbeiter zu Auftrag zuordnen:
- **Mitarbeiter**: Auswahl
- **Rolle**: Projektleiter/Mitarbeiter
- **Von-Bis**: Zuweisungszeitraum

### 7. Buchungs-Übersicht
Gebuchte Zeiten auf dem Auftrag:
- Nach Mitarbeiter gruppiert
- Nach Aktivität filterbar
- Summen und Auswertungen

## Schritt-für-Schritt Anleitungen

### Neuen Auftrag anlegen

1. Klicken Sie auf **"Auftrag hinzufügen"**
2. Geben Sie **Auftragsnummer** und **Name** ein
3. Optional: Kunde, Datum, Budget
4. Speichern Sie
5. Der Auftrag wird erstellt

### Aktivität zu Auftrag hinzufügen

1. Öffnen Sie die **Auftragsdetails**
2. Wechseln Sie zum Tab **"Aktivitäten"**
3. Klicken Sie auf **"Aktivität hinzufügen"**
4. Geben Sie **Name** und optional Budget ein
5. Speichern Sie

### Mitarbeiter zuweisen

1. Öffnen Sie die **Auftragsdetails**
2. Wechseln Sie zum Tab **"Zuweisungen"**
3. Klicken Sie auf **"Mitarbeiter zuweisen"**
4. Wählen Sie den **Mitarbeiter**
5. Setzen Sie **Rolle** und **Zeitraum**
6. Speichern Sie

### Buchungen auswerten

1. Öffnen Sie die **Auftragsdetails**
2. Wechseln Sie zum Tab **"Buchungen"**
3. Filtern Sie nach Zeitraum oder Aktivität
4. Sehen Sie Summen und Details
5. Exportieren Sie bei Bedarf

### Auftrag abschließen

1. Öffnen Sie das **Auftragsformular**
2. Ändern Sie den **Status** auf "Abgeschlossen"
3. Speichern Sie
4. Keine neuen Buchungen mehr möglich

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Stundenzettel** | Buchung auf Aufträge möglich |
| **Berichte** | Projektauswertungen |
| **Lohnexport** | Projektbezogene Zeiten |

## Tipps & Best Practices

1. **Systematische Nummern**: Einheitliches Nummernschema für Aufträge.
2. **Aktivitäten strukturieren**: Sinnvolle Untergliederung.
3. **Budgets pflegen**: Für Soll-Ist-Vergleiche.
4. **Regelmäßige Auswertung**: Monatliche Projektreviews.
5. **Abschluss zeitnah**: Beendete Aufträge abschließen.

## Problembehandlung

### Mitarbeiter kann nicht buchen
**Ursache**: Nicht dem Auftrag zugewiesen.
**Lösung**: Fügen Sie eine Zuweisung hinzu.

### Buchungen auf abgeschlossenem Auftrag
**Ursache**: Status ist "Abgeschlossen".
**Lösung**: Öffnen Sie den Auftrag wieder oder korrigieren Sie den Status.

### Budget überschritten
**Lösung**: Erhöhen Sie das Budget oder prüfen Sie die Buchungen.

## Verwandte Module

- **[Stundenzettel](./stundenzettel.md)** - Zeiten auf Aufträge buchen
- **[Kontaktarten](./kontaktarten.md)** - Kundenkonfiguration
- **[Berichte](./berichte.md)** - Projektauswertungen
