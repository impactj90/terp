# Kontaktarten - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Kontaktarten** ermöglicht die Konfiguration verschiedener Kontakttypen und deren Eigenschaften. Kontaktarten definieren, welche Informationen für unterschiedliche Kontakte (Kunden, Lieferanten, Partner) erfasst werden können.

**Wer nutzt dieses Modul:**
- Systemadministratoren für die Konfiguration
- Für die Anpassung von Kontaktfeldern

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Berechnung & Aufträge → Kontaktarten

**Direkte URL:** `/admin/contact-types`

## Funktionen & Bedienelemente

### 1. Zwei-Spalten-Layout
- **Linke Spalte**: Liste der Kontaktarten
- **Rechte Spalte**: Eigenschaften (Kontaktfelder)

### 2. Kontaktarten-Liste (Linke Spalte)

| Element | Beschreibung |
|---------|--------------|
| **Name** | Typ-Bezeichnung |
| **Kontaktfelder** | Anzahl Felder |
| **Hinzufügen-Button** | Neuen Typ erstellen |

### 3. Kontaktfelder-Liste (Rechte Spalte)
Zeigt Felder des gewählten Typs:

| Element | Beschreibung |
|---------|--------------|
| **Feldname** | Bezeichnung |
| **Datentyp** | Text/Zahl/Datum/etc. |
| **Pflichtfeld** | Ja/Nein Badge |
| **Hinzufügen-Button** | Neues Feld |

### 4. Kontaktart-Formular
- **Name** (Pflicht): z.B. "Kunde", "Lieferant"
- **Beschreibung**: Optionale Details
- **Symbol**: Icon-Auswahl

### 5. Kontaktfeld-Formular
- **Name** (Pflicht): Feldbezeichnung
- **Datentyp**: Text, Zahl, Datum, E-Mail, etc.
- **Pflichtfeld**: Muss ausgefüllt werden?
- **Standardwert**: Vorbelegung
- **Reihenfolge**: Sortierung

### 6. Datentyp-Badge
Visuelle Kennzeichnung des Feldtyps:
- **Text**: Freitextfeld
- **Zahl**: Numerischer Wert
- **Datum**: Datumsauswahl
- **E-Mail**: E-Mail-Validierung
- **Telefon**: Telefonnummer-Format
- **Auswahl**: Dropdown-Liste

## Schritt-für-Schritt Anleitungen

### Neue Kontaktart erstellen

1. Klicken Sie in der linken Spalte auf **"Hinzufügen"**
2. Geben Sie einen **Namen** ein
3. Optional: Beschreibung und Symbol
4. Speichern Sie
5. Die neue Art erscheint in der Liste

### Kontaktfeld hinzufügen

1. Wählen Sie die **Kontaktart** in der linken Spalte
2. Klicken Sie in der rechten Spalte auf **"Feld hinzufügen"**
3. Geben Sie den **Feldnamen** ein
4. Wählen Sie den **Datentyp**
5. Setzen Sie **Pflichtfeld** nach Bedarf
6. Speichern Sie

### Feld bearbeiten

1. Wählen Sie die **Kontaktart**
2. Klicken Sie auf das **Feld** in der rechten Spalte
3. Ändern Sie die Eigenschaften
4. Speichern Sie

### Kontaktart löschen

1. Wählen Sie die Kontaktart
2. Klicken Sie auf **"Löschen"**
3. Bestätigen Sie
4. **Hinweis**: Nur möglich, wenn keine Kontakte diesen Typ verwenden

## Typische Kontaktarten

| Name | Typische Felder |
|------|-----------------|
| Kunde | Firma, Ansprechpartner, E-Mail, Telefon |
| Lieferant | Firma, Lieferantennr., E-Mail |
| Partner | Organisation, Kontaktperson |
| Interessent | Name, E-Mail, Lead-Quelle |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Aufträge** | Kundenzuordnung |
| **Berichte** | Kontaktauswertungen |

## Tipps & Best Practices

1. **Weniger ist mehr**: Nur benötigte Felder definieren.
2. **Pflichtfelder sparsam**: Nur wirklich Notwendiges als Pflicht.
3. **Konsistente Benennung**: Einheitliche Feldnamen.
4. **Datentypen passend**: Für E-Mail den E-Mail-Typ verwenden.

## Problembehandlung

### Kontaktart kann nicht gelöscht werden
**Ursache**: Kontakte verwenden diesen Typ.
**Lösung**: Ändern Sie zuerst die Kontakte auf einen anderen Typ.

### Feld wird nicht angezeigt
**Ursache**: Feld inaktiv oder falsche Reihenfolge.
**Lösung**: Prüfen Sie die Feldkonfiguration.

## Verwandte Module

- **[Aufträge & Aktivitäten](./auftraege-aktivitaeten.md)** - Kundenzuordnung
