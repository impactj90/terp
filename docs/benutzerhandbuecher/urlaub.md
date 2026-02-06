# Urlaub - Benutzerhandbuch

## Überblick

Das Modul **Urlaub** bietet Ihnen eine detaillierte Übersicht über Ihr Urlaubsguthaben, alle Urlaubstransaktionen und kommende geplante Urlaube. Während das Modul "Abwesenheiten" für das Beantragen von Urlaub zuständig ist, zeigt Ihnen dieses Modul den vollständigen Verlauf und die Zusammensetzung Ihres Urlaubsanspruchs.

**Wer nutzt dieses Modul:**
- Alle Mitarbeiter zur Übersicht ihres Urlaubskontos
- Mitarbeiter zur Planung des Resturlaubs
- Für die Prüfung des Übertragungsanspruchs aus dem Vorjahr

## Voraussetzungen

Bevor Sie das Urlaubsmodul nutzen können:

1. **Mitarbeiterdatensatz**: Sie müssen einen aktiven Mitarbeiterdatensatz im System haben.
2. **Urlaubssaldo**: Für das aktuelle Jahr muss ein Urlaubskontingent initialisiert sein.
3. **Urlaubskonfiguration**: Ihr Urlaubsanspruch muss im System hinterlegt sein.

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Urlaub

**Mobil:** Über das Seitenmenü

**Direkte URL:** `/vacation`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Urlaub" mit Untertitel
- Jahresbezogene Ansicht des Urlaubskontos

### 2. Jahresauswahl
Navigation zwischen verschiedenen Jahren:
- **Pfeiltasten**: Vor und zurück navigieren
- **Jahresdropdown**: Direktauswahl eines Jahres
- **"Aktuelles Jahr"**: Schnellsprung zum laufenden Jahr

### 3. Übertragungswarnung (Carryover Warning)
Wird angezeigt, wenn Sie Resturlaub aus dem Vorjahr haben:
- Anzahl der übertragenen Tage
- Verfallsdatum (typischerweise 31. März)
- Warnung zur rechtzeitigen Nutzung

### 4. Guthaben-Aufschlüsselung (Balance Breakdown)
Detaillierte Karte mit Ihrem Urlaubsstand:

| Posten | Beschreibung |
|--------|--------------|
| **Jahresanspruch** | Ihr vertraglicher Urlaubsanspruch |
| **Übertrag aus Vorjahr** | Resturlaub vom letzten Jahr |
| **Sonderurlaub** | Zusätzliche Tage (z.B. Hochzeit, Geburt) |
| **Anpassungen** | Manuelle Korrekturen |
| **Gesamtanspruch** | Summe aller Ansprüche |
| **Genommen** | Bereits genommene Urlaubstage |
| **Geplant** | Genehmigte, aber noch nicht genommene Tage |
| **Verbleibend** | Noch verfügbare Tage |

Visuelle Darstellung als Fortschrittsbalken zeigt das Verhältnis.

### 5. Kommender Urlaub (Upcoming Vacation)
Liste der nächsten geplanten Urlaubstage:
- Datum/Zeitraum
- Anzahl der Tage
- Status (genehmigt, ausstehend)
- Klickbar für Details

Nur für das aktuelle Jahr angezeigt.

### 6. Transaktionsverlauf (Transaction History)
Chronologische Liste aller Urlaubsbuchungen:

| Typ | Beispiel |
|-----|----------|
| **Initialisierung** | Jahresanspruch gutgeschrieben |
| **Übertrag** | Resturlaub übertragen |
| **Abzug** | Urlaubstage genommen |
| **Gutschrift** | Stornierung, Korrektur |
| **Verfall** | Resturlaub verfallen |

Jede Transaktion zeigt:
- Datum
- Beschreibung
- Anzahl der Tage (+/-)
- Resultierender Saldo

## Schritt-für-Schritt Anleitungen

### Aktuellen Urlaubsstand prüfen

1. Navigieren Sie zu **Urlaub**
2. Das aktuelle Jahr ist standardmäßig ausgewählt
3. Sehen Sie die **Guthaben-Aufschlüsselung** für Ihren Stand
4. **Verbleibend** zeigt Ihre noch verfügbaren Tage

### Resturlaub prüfen

1. Öffnen Sie das **Urlaubsmodul**
2. Prüfen Sie die **Übertragungswarnung** (falls vorhanden)
3. In der **Guthaben-Aufschlüsselung** sehen Sie "Übertrag aus Vorjahr"
4. Beachten Sie das Verfallsdatum für die Planung

### Vorjahr einsehen

1. Nutzen Sie die **Jahresauswahl** (Pfeil links)
2. Oder wählen Sie das Jahr im **Dropdown**
3. Sehen Sie die abgeschlossene Jahresbilanz
4. Der Transaktionsverlauf zeigt alle Buchungen

### Kommende Urlaube sehen

1. Stellen Sie sicher, dass das **aktuelle Jahr** ausgewählt ist
2. Scrollen Sie zu **Kommender Urlaub**
3. Sehen Sie alle genehmigten Urlaubszeiträume
4. Klicken Sie auf einen Eintrag für Details

### Urlaubsverlauf analysieren

1. Scrollen Sie zum **Transaktionsverlauf**
2. Sehen Sie alle Buchungen chronologisch
3. Prüfen Sie Gutschriften und Abzüge
4. Verfolgen Sie, wie sich Ihr Guthaben entwickelt hat

### Diskrepanzen identifizieren

1. Prüfen Sie den **Transaktionsverlauf** auf alle Einträge
2. Vergleichen Sie mit Ihren eigenen Aufzeichnungen
3. Bei Unstimmigkeiten kontaktieren Sie Ihren Administrator
4. Notieren Sie sich das Datum und die betroffene Transaktion

## Auswirkungen auf andere Module

Das Urlaubsmodul zeigt Daten an, die aus anderen Bereichen stammen:

| Datenquelle | Angezeigte Information |
|-------------|------------------------|
| **Urlaubssalden** | Grundlage für Guthaben-Berechnung |
| **Abwesenheiten** | Genommene und geplante Urlaubstage |
| **Urlaubskonfiguration** | Übertragungsregeln und Verfallsdaten |
| **Mitarbeiterprofil** | Jahresanspruch |

## Tipps & Best Practices

1. **Regelmäßige Kontrolle**: Prüfen Sie monatlich Ihren Urlaubsstand, um Überraschungen zu vermeiden.

2. **Resturlaub früh planen**: Bei Übertrag aus dem Vorjahr planen Sie diesen zuerst ein, um Verfall zu vermeiden.

3. **Jahreswechsel beachten**: Zum Jahresende Ihren verbleibenden Anspruch prüfen und ggf. noch Urlaub einplanen.

4. **Transaktionen prüfen**: Bei Unklarheiten den Transaktionsverlauf für Nachvollziehbarkeit nutzen.

5. **Übertragungsregeln kennen**: Informieren Sie sich über die Übertragungsregeln Ihres Unternehmens (wie viele Tage, bis wann).

6. **Kommenden Urlaub im Blick**: Nutzen Sie die Liste für Ihre Planung und Vorbereitung.

7. **Screenshots für Nachweise**: Bei wichtigen Ständen können Sie Screenshots machen für Ihre Unterlagen.

## Problembehandlung

### "Kein Mitarbeiterdatensatz gefunden"
**Ursache**: Ihr Benutzerkonto ist nicht mit einem Mitarbeiterdatensatz verknüpft.
**Lösung**: Kontaktieren Sie Ihren Administrator.

### Urlaubsguthaben zeigt 0
**Ursache**: Das Urlaubskontingent für das Jahr wurde nicht initialisiert.
**Lösung**: Kontaktieren Sie Ihren Administrator zur Initialisierung.

### Übertrag fehlt
**Ursache**: Der Übertrag wurde noch nicht durchgeführt oder ist nicht konfiguriert.
**Lösung**: Warten Sie auf den Jahreswechselprozess oder kontaktieren Sie den Administrator.

### Falsche Anzahl Tage abgezogen
**Ursache**: Halbtage oder Wochenenden wurden anders berechnet als erwartet.
**Lösung**: Prüfen Sie die Details der betroffenen Abwesenheit. Kontaktieren Sie bei Bedarf den Administrator.

### Transaktion fehlt
**Ursache**: Die Buchung wurde möglicherweise nicht korrekt verarbeitet.
**Lösung**: Prüfen Sie das Modul "Abwesenheiten" für den Status des Antrags.

### Geplanter Urlaub nicht angezeigt
**Ursache**: Der Antrag ist noch nicht genehmigt oder für ein anderes Jahr.
**Lösung**: Prüfen Sie den Status in "Abwesenheiten" und das ausgewählte Jahr.

### Verfall nicht nachvollziehbar
**Ursache**: Resturlaub ist zum Stichtag automatisch verfallen.
**Lösung**: Der Transaktionsverlauf sollte einen Verfall-Eintrag zeigen. Kontaktieren Sie bei Fragen den Administrator.

## Verwandte Module

- **[Abwesenheiten](./abwesenheiten.md)** - Urlaub beantragen
- **[Dashboard](./dashboard.md)** - Schnellübersicht des Urlaubsstands
- **[Profil](./profil.md)** - Persönliche Daten und Anspruch sehen
- **[Urlaubssalden](./urlaubssalden.md)** - (Admin) Urlaubskontingente verwalten
- **[Urlaubskonfiguration](./urlaubskonfiguration.md)** - (Admin) Übertragungsregeln definieren
