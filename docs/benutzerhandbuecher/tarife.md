# Tarife - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Tarife** ermöglicht die Definition von rollierenden Arbeitszeitmodellen, bei denen sich Wochenpläne in einem bestimmten Rhythmus abwechseln. Dies ist besonders nützlich für Schichtarbeiter mit wechselnden Wochenmodellen (z.B. 3-Wochen-Rhythmus oder 14-Tage-Rhythmus).

**Wer nutzt dieses Modul:**
- Personaladministratoren für komplexe Arbeitszeitmodelle
- Schichtplaner für rollierende Schichtsysteme

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.
2. **Wochenpläne vorhanden**: Es müssen Wochenpläne existieren.

## Zugang zum Modul

**Navigationspfad:** Admin → Zeit & Planung → Tarife

**Direkte URL:** `/admin/tariffs`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Tarife"
- **Tarif hinzufügen**: Button zum Anlegen
- **Kopieren-Funktion**: Bestehenden Tarif als Vorlage

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Tarifbezeichnung |
| **Rhythmus** | Rollierender Zyklus (z.B. 3 Wochen) |
| **Wochenpläne** | Anzahl der verwendeten Pläne |
| **Mitarbeiter** | Zugeordnete Mitarbeiter |
| **Aktionen** | Bearbeiten, Kopieren, Details, Löschen |

### 3. Formular (Form Sheet)

#### Grunddaten
- **Name** (Pflicht): Eindeutiger Tarifname
- **Beschreibung**: Optionale Details

#### Rhythmus-Konfiguration
- **Rhythmus-Typ**: X-Wochen oder X-Tage
- **Zyklus-Länge**: Anzahl Wochen/Tage
- **Startdatum**: Beginn des ersten Zyklus

#### Wochenplan-Zuweisung
- **Woche 1**: Wochenplan-Auswahl
- **Woche 2**: Wochenplan-Auswahl
- **Woche N**: Je nach Zykluslänge

### 4. Rollierender Wochenplan-Selektor
Visuelle Zuordnung der Wochenpläne:
- Drag & Drop der Wochenpläne
- Vorschau der Rotation
- Berechnung der durchschnittlichen Wochenstunden

### 5. X-Tage-Rhythmus-Konfiguration
Für komplexe Modelle:
- Tagesweise Definition
- Beliebige Zykluslänge
- Tagespläne statt Wochenpläne

## Schritt-für-Schritt Anleitungen

### Einfachen Wochentarif erstellen (3-Schicht-System)

1. Klicken Sie auf **"Tarif hinzufügen"**
2. Geben Sie den **Namen** ein (z.B. "3-Schicht-Rotation")
3. Wählen Sie **Rhythmus-Typ**: "Wochen"
4. Setzen Sie **Zyklus-Länge**: 3
5. Setzen Sie ein **Startdatum** (Montag einer Woche)
6. Weisen Sie zu:
   - Woche 1: Frühschicht-Wochenplan
   - Woche 2: Spätschicht-Wochenplan
   - Woche 3: Nachtschicht-Wochenplan
7. Klicken Sie auf **"Speichern"**

### Tarif kopieren und anpassen

1. Finden Sie den zu kopierenden Tarif
2. Klicken Sie auf **"Kopieren"**
3. Vergeben Sie einen neuen **Namen**
4. Passen Sie bei Bedarf die Wochenpläne an
5. Speichern Sie den neuen Tarif

### Tarif bearbeiten

1. Klicken Sie auf **"Bearbeiten"** beim gewünschten Tarif
2. Ändern Sie die Zuordnungen
3. **Achtung**: Das Startdatum beeinflusst, welche Woche aktuell gilt
4. Speichern Sie die Änderungen

### Mitarbeiter zuordnen

Tarife werden Mitarbeitern im **Mitarbeiter-Modul** zugewiesen:
1. Öffnen Sie den Mitarbeiter
2. Im Bereich "Zeitplan" wählen Sie den Tarif
3. Setzen Sie das "Gültig ab"-Datum
4. Speichern Sie

### Durchschnittliche Stunden berechnen

1. Öffnen Sie den Tarif im Detail
2. Das System zeigt die **durchschnittlichen Wochenstunden**
3. Berechnung: Summe aller Wochen / Anzahl Wochen

## Typische Tarife

| Name | Rhythmus | Beispiel |
|------|----------|----------|
| 2-Wochen-Wechsel | 2 Wochen | Woche A: 40h, Woche B: 35h |
| 3-Schicht-Rotation | 3 Wochen | Früh, Spät, Nacht |
| 4-Wochen-Modell | 4 Wochen | Verschiedene Besetzungen |
| 5/2-Modell | 7 Tage | 5 Tage Arbeit, 2 Tage frei |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Mitarbeiter** | Tarif-Zuweisung statt Wochenplan |
| **Tageswerte** | Sollzeit aus aktuellem Zyklus-Wochenplan |
| **Monatsauswertung** | Korrekte Sollberechnung über Monate |
| **Schichtplanung** | Tarif als Planungsbasis |

## Tipps & Best Practices

1. **Startdatum konsistent**: Alle Mitarbeiter gleicher Schichtgruppe sollten gleiches Startdatum haben.
2. **Klare Namen**: "Früh-Spät-3W" statt "Tarif 1".
3. **Wochenpläne vorbereiten**: Erstellen Sie zuerst alle benötigten Wochenpläne.
4. **Durchschnitt prüfen**: Prüfen Sie die durchschnittlichen Wochenstunden.
5. **Dokumentation**: Nutzen Sie die Beschreibung für Erklärungen.

## Problembehandlung

### Falsche Woche wird angewendet
**Ursache**: Startdatum nicht korrekt.
**Lösung**: Prüfen Sie das Startdatum des Tarifs.

### Tarif kann nicht gelöscht werden
**Ursache**: Mitarbeiter sind noch zugeordnet.
**Lösung**: Weisen Sie den Mitarbeitern einen anderen Tarif zu.

### Durchschnitt stimmt nicht
**Ursache**: Wochenpläne haben falsche Stunden.
**Lösung**: Prüfen Sie die einzelnen Wochenpläne.

### Sollzeit springt unerwartlich
**Ursache**: Zykluswechsel am Monatswechsel.
**Lösung**: Dies ist normal bei rollierenden Tarifen.

## Verwandte Module

- **[Wochenpläne](./wochenplaene.md)** - Basis für Tarife
- **[Tagespläne](./tagesplaene.md)** - Für X-Tage-Rhythmen
- **[Mitarbeiter](./mitarbeiter.md)** - Tarif-Zuweisung
- **[Schichtplanung](./schichtplanung.md)** - Alternative Planung
