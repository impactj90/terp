# Tagespläne - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Tagespläne** ermöglicht die Definition von Arbeitszeitmodellen für einzelne Tage. Ein Tagesplan definiert die Sollarbeitszeit und optional die erwarteten Arbeitszeiten (von-bis). Tagespläne werden in Wochenplänen verwendet, um vollständige Arbeitszeitmodelle zu erstellen.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Arbeitszeitkonfiguration
- Systemadministratoren für Zeitmodelle

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Zeit & Planung → Tagespläne

**Direkte URL:** `/admin/day-plans`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Tagespläne"
- **Tagesplan hinzufügen**: Button zum Anlegen
- **Kopieren-Funktion**: Bestehenden Plan als Vorlage nutzen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Bezeichnung des Plans |
| **Sollzeit** | Arbeitszeit in Stunden/Minuten |
| **Arbeitszeit** | Von-Bis (z.B. 08:00-17:00) |
| **Pause** | Pausendauer |
| **Verwendung** | Anzahl Wochenpläne, die diesen Plan nutzen |
| **Aktionen** | Bearbeiten, Kopieren, Löschen |

### 3. Formular (Form Sheet)
- **Name** (Pflicht): Eindeutiger Name (z.B. "Vollzeit 8h")
- **Sollzeit**: Arbeitszeit in Stunden und Minuten
- **Arbeitsbeginn**: Erwartete Startzeit (optional)
- **Arbeitsende**: Erwartete Endzeit (optional)
- **Pausendauer**: Standardpause
- **Kernarbeitszeit von-bis**: Anwesenheitspflicht (optional)
- **Beschreibung**: Optionale Details

### 4. Kopieren-Dialog
Ermöglicht das Duplizieren eines Plans:
- Neuer Name
- Änderungen direkt im Kopiervorgang

## Schritt-für-Schritt Anleitungen

### Neuen Tagesplan anlegen

1. Klicken Sie auf **"Tagesplan hinzufügen"**
2. Geben Sie einen **Namen** ein (z.B. "Vollzeit 8 Stunden")
3. Setzen Sie die **Sollzeit** (z.B. 8:00)
4. Optional: Definieren Sie **Arbeitsbeginn/Ende** (z.B. 09:00 - 18:00)
5. Optional: Setzen Sie eine **Standardpause** (z.B. 1:00)
6. Klicken Sie auf **"Speichern"**

### Tagesplan kopieren

1. Finden Sie den zu kopierenden Plan
2. Klicken Sie auf **"Kopieren"**
3. Geben Sie einen neuen **Namen** ein
4. Passen Sie bei Bedarf die Werte an
5. Speichern Sie den neuen Plan

### Tagesplan bearbeiten

1. Klicken Sie auf **"Bearbeiten"** beim gewünschten Plan
2. Ändern Sie die Werte
3. Klicken Sie auf **"Speichern"**
4. **Hinweis**: Änderungen wirken sich auf alle Wochenpläne aus, die diesen Plan verwenden

### Tagesplan löschen

1. Stellen Sie sicher, dass der Plan **nicht in Wochenplänen verwendet** wird
2. Klicken Sie auf **"Löschen"**
3. Bestätigen Sie die Löschung

## Typische Tagespläne

| Name | Sollzeit | Beispiel |
|------|----------|----------|
| Vollzeit | 8:00 | Standard-Arbeitstag |
| Teilzeit 50% | 4:00 | Halber Tag |
| Teilzeit 75% | 6:00 | Dreiviertel-Tag |
| Kurztag | 6:00 | z.B. Freitags |
| Frei | 0:00 | Freier Tag |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Wochenpläne** | Tagespläne werden in Wochenplänen verwendet |
| **Tageswerte** | Sollzeit-Berechnung basiert auf Tagesplan |
| **Monatsauswertung** | Sollstunden werden aus Tagesplänen berechnet |
| **Gleitzeitkonto** | Saldo basiert auf Soll vs. Ist |

## Tipps & Best Practices

1. **Klare Benennung**: Namen sollten Sollzeit enthalten (z.B. "Vollzeit 8h").
2. **Standardpläne erstellen**: Definieren Sie Basis-Pläne (0h, 4h, 6h, 8h).
3. **Kopieren nutzen**: Bei ähnlichen Plänen von bestehendem kopieren.
4. **Kernarbeitszeit**: Nur setzen, wenn tatsächlich Anwesenheitspflicht besteht.
5. **Nicht zu viele**: Halten Sie die Anzahl überschaubar.

## Problembehandlung

### Tagesplan kann nicht gelöscht werden
**Ursache**: Plan wird in Wochenplänen verwendet.
**Lösung**: Entfernen Sie den Plan zuerst aus allen Wochenplänen.

### Sollzeit stimmt nicht mit Berechnung überein
**Ursache**: Rundungsdifferenzen oder falsche Eingabe.
**Lösung**: Prüfen Sie die Stunden:Minuten-Eingabe.

### Änderungen wirken nicht sofort
**Ursache**: Tageswerte werden zeitversetzt berechnet.
**Lösung**: Warten Sie auf die nächste Berechnung oder lösen Sie eine Neuberechnung aus.

## Verwandte Module

- **[Wochenpläne](./wochenplaene.md)** - Tagespläne zu Wochenplänen kombinieren
- **[Tarife](./tarife.md)** - Wochenpläne zu rollierenden Modellen kombinieren
- **[Mitarbeiter](./mitarbeiter.md)** - Zeitplan-Zuweisung
- **[Monatsauswertung](./monatsauswertung.md)** - Sollzeit-Anzeige
