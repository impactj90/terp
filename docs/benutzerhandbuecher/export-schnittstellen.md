# Export-Schnittstellen - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Export-Schnittstellen** ermöglicht die Konfiguration von Exportformaten für die Übertragung von Zeitdaten an externe Systeme, insbesondere Lohnabrechnungssoftware. Hier werden Feldmappings und Exportformate definiert.

**Wer nutzt dieses Modul:**
- Systemadministratoren für Schnittstellen-Konfiguration
- Für die Anbindung an Lohnsoftware

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.
2. **Konten konfiguriert**: Für Kontenmapping.

## Zugang zum Modul

**Navigationspfad:** Admin → Daten & Berichte → Export-Schnittstellen

**Direkte URL:** `/admin/export-interfaces`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Export-Schnittstellen"
- **Schnittstelle hinzufügen**: Neue erstellen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Schnittstellenname |
| **Typ** | CSV/XML/DATEV/etc. |
| **Ziel** | Zielsystem |
| **Aktiv** | Status |
| **Aktionen** | Bearbeiten, Mapping, Löschen |

### 3. Formular (Form Sheet)

#### Grunddaten
- **Name** (Pflicht): Bezeichnung
- **Typ**: Exportformat
- **Ziel**: Zielsystem-Beschreibung
- **Beschreibung**: Optionale Details

#### Format-Einstellungen
- **Dateiformat**: CSV, XML, DATEV, etc.
- **Zeichensatz**: UTF-8, ISO-8859-1
- **Trennzeichen**: Bei CSV
- **Datumsformat**: dd.MM.yyyy, yyyy-MM-dd

### 4. Konten-Mapping-Dialog
Zuordnung interner Konten zu externen Lohnarten:

| Internes Konto | Externe Lohnart |
|----------------|-----------------|
| 100 Gleitzeit | 1001 |
| 200 Überstunden | 1050 |
| 300 Nachtarbeit | 1100 |

### 5. Detail-Ansicht
- Vollständige Konfiguration
- Mapping-Übersicht
- Test-Export-Funktion

## Schritt-für-Schritt Anleitungen

### Neue Schnittstelle erstellen

1. Klicken Sie auf **"Schnittstelle hinzufügen"**
2. Geben Sie **Namen** und **Typ** ein
3. Wählen Sie das **Format**
4. Konfigurieren Sie die **Format-Einstellungen**
5. Speichern Sie

### Konten-Mapping konfigurieren

1. Öffnen Sie die Schnittstelle
2. Klicken Sie auf **"Mapping"**
3. Für jedes Konto:
   - Wählen Sie das **interne Konto**
   - Geben Sie die **externe Lohnart** ein
4. Speichern Sie das Mapping

### Test-Export durchführen

1. Öffnen Sie die **Schnittstellendetails**
2. Klicken Sie auf **"Test-Export"**
3. Wählen Sie einen kleinen Zeitraum
4. Prüfen Sie die generierte Datei
5. Korrigieren Sie bei Bedarf das Mapping

### Schnittstelle aktivieren/deaktivieren

1. Bearbeiten Sie die Schnittstelle
2. Ändern Sie **Aktiv** auf Ja/Nein
3. Speichern Sie

## Typische Schnittstellen

| Name | Typ | Zielsystem |
|------|-----|------------|
| DATEV Lohn | DATEV | DATEV Lohn & Gehalt |
| SAP HR | CSV | SAP HCM |
| Lexware | CSV | Lexware Lohn |
| SAGE | XML | SAGE HR |
| Generisch | CSV | Beliebig |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Lohnexporte** | Nutzt konfigurierte Schnittstellen |
| **Konten** | Basis für Mapping |

## Tipps & Best Practices

1. **Test vor Produktiv**: Immer zuerst mit Testdaten prüfen.
2. **Mapping dokumentieren**: Externe Lohnarten dokumentieren.
3. **Backup der Konfiguration**: Einstellungen sichern.
4. **Versionierung**: Bei Änderungen neue Version anlegen.

## Problembehandlung

### Export-Datei leer
**Ursache**: Kein Mapping oder keine Daten.
**Lösung**: Prüfen Sie Mapping und Datengrundlage.

### Zeichenfehler in Export
**Ursache**: Falscher Zeichensatz.
**Lösung**: Passen Sie den Zeichensatz an das Zielsystem an.

### Lohnsoftware erkennt Format nicht
**Ursache**: Format-Einstellungen falsch.
**Lösung**: Prüfen Sie Anforderungen des Zielsystems.

## Verwandte Module

- **[Lohnexporte](./lohnexporte.md)** - Exporte durchführen
- **[Konten](./konten.md)** - Für Mapping
