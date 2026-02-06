# Einstellungen - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Einstellungen** ermöglicht die Konfiguration globaler Systemparameter. Hier werden unternehmensweite Einstellungen wie Arbeitszeitregeln, Standardwerte und Systemverhalten definiert.

**Wer nutzt dieses Modul:**
- Systemadministratoren für Grundkonfiguration
- Personaladministratoren für HR-Einstellungen

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Systemadministration → Einstellungen

**Direkte URL:** `/admin/settings`

## Funktionen & Bedienelemente

### 1. Einstellungs-Bereiche

#### Allgemeine Einstellungen
- **Unternehmensname**: Angezeigter Firmenname
- **Logo**: Firmenlogo
- **Sprache**: Standard-Systemsprache
- **Zeitzone**: Standard-Zeitzone

#### Arbeitszeiteinstellungen
- **Minimale Pausendauer**: Gesetzliche Pausenregeln
- **Maximale Arbeitszeit pro Tag**: Obergrenze
- **Rundungsintervall**: Auf 5/15/30 Minuten runden
- **Kernarbeitszeit**: Pflichtige Anwesenheit

#### Urlaubseinstellungen
- **Standard-Urlaubstage**: Basisanspruch
- **Übertragungsregeln**: Resturlaub-Handling
- **Verfallsdatum**: Bis wann Resturlaub genommen werden muss

#### Genehmigungseinstellungen
- **Automatische Genehmigung**: Für bestimmte Abwesenheitsarten
- **Mehrstufige Genehmigung**: Aktivieren/Deaktivieren
- **Benachrichtigungen**: E-Mail-Einstellungen

#### Berechnungseinstellungen
- **Berechnungszeitpunkt**: Wann Tageswerte berechnen
- **Nachberechnung**: Automatisch bei Änderungen

### 2. Bereinigungswerkzeuge (Cleanup Tools)
Werkzeuge zur Systempflege:
- **Cache leeren**: System-Cache zurücksetzen
- **Neuberechnung auslösen**: Alle Werte neu berechnen
- **Alte Daten archivieren**: Daten älter als X Jahre

### 3. Bereinigungsdialog
Bei Ausführung von Bereinigungsaktionen:
- Warnung vor Auswirkungen
- Optionen (Zeitraum, Umfang)
- Bestätigung erforderlich

## Schritt-für-Schritt Anleitungen

### Allgemeine Einstellungen ändern

1. Öffnen Sie den Bereich **"Allgemein"**
2. Ändern Sie die gewünschten Werte
3. Klicken Sie auf **"Speichern"**
4. Änderungen werden sofort wirksam

### Arbeitszeitregeln konfigurieren

1. Öffnen Sie **"Arbeitszeiteinstellungen"**
2. Setzen Sie **Minimale Pausendauer** (z.B. 30 Min bei >6h)
3. Setzen Sie **Maximale Arbeitszeit** (z.B. 10h)
4. Konfigurieren Sie **Rundung** nach Bedarf
5. Speichern Sie

### Standard-Urlaubstage festlegen

1. Öffnen Sie **"Urlaubseinstellungen"**
2. Setzen Sie **Standard-Urlaubstage**
3. Konfigurieren Sie **Übertragungsregeln**
4. Speichern Sie

### Cache leeren

1. Gehen Sie zu **"Bereinigungswerkzeuge"**
2. Klicken Sie auf **"Cache leeren"**
3. Bestätigen Sie
4. Der System-Cache wird geleert

### Neuberechnung auslösen

1. Gehen Sie zu **"Bereinigungswerkzeuge"**
2. Klicken Sie auf **"Neuberechnung"**
3. Wählen Sie den **Zeitraum** oder "Alle"
4. Bestätigen Sie
5. Die Berechnung läuft im Hintergrund

## Typische Einstellungswerte

| Einstellung | Typischer Wert | Gesetzlich |
|-------------|----------------|------------|
| Max. Arbeitszeit | 10 Stunden | ArbZG |
| Pause bei >6h | 30 Minuten | ArbZG |
| Pause bei >9h | 45 Minuten | ArbZG |
| Mindesturlaub | 24 Werktage | BUrlG |
| Urlaubsübertrag bis | 31. März | BUrlG |

## Auswirkungen auf andere Module

| Modul | Auswirkung |
|-------|------------|
| **Tageswerte** | Berechnung basiert auf Einstellungen |
| **Korrekturassistent** | Prüft gegen Einstellungen |
| **Urlaubssalden** | Nutzt Urlaubseinstellungen |
| **Alle Module** | Allgemeine Einstellungen gelten systemweit |

## Tipps & Best Practices

1. **Dokumentieren**: Änderungen dokumentieren.
2. **Gesetzeskonformität**: Einstellungen an Gesetze anpassen.
3. **Testen**: Nach Änderungen Auswirkungen prüfen.
4. **Backup vor Bereinigung**: Vor Bereinigungsaktionen.
5. **Neuberechnung sparsam**: Ressourcenintensive Operation.

## Problembehandlung

### Einstellung wird nicht übernommen
**Ursache**: Cache oder bereits berechnete Werte.
**Lösung**: Cache leeren und ggf. Neuberechnung auslösen.

### Neuberechnung dauert lange
**Ursache**: Viele Daten.
**Lösung**: Außerhalb der Arbeitszeit oder in Intervallen ausführen.

### Bereinigung fehlgeschlagen
**Ursache**: Laufende Prozesse oder Berechtigungsproblem.
**Lösung**: Später erneut versuchen oder Administrator kontaktieren.

## Verwandte Module

- **[Berechnungsregeln](./berechnungsregeln.md)** - Detailregeln
- **[Urlaubskonfiguration](./urlaubskonfiguration.md)** - Urlaubsregeln
- **[Mandanten](./mandanten.md)** - Mandantenspezifische Einstellungen
