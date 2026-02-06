# Abwesenheitsarten - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Abwesenheitsarten** ermöglicht die Definition verschiedener Abwesenheitstypen wie Urlaub, Krankheit, Fortbildung oder Sonderurlaub. Jede Art kann unterschiedliche Eigenschaften haben, z.B. ob sie vom Urlaubskontingent abgezogen wird oder einer Genehmigung bedarf.

**Wer nutzt dieses Modul:**
- Personaladministratoren zur Konfiguration der Abwesenheitsarten
- Systemadministratoren für die Systemeinrichtung

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen Admin-Rechte.

## Zugang zum Modul

**Navigationspfad:** Admin → Abwesenheit & Urlaub → Abwesenheitsarten

**Direkte URL:** `/admin/absence-types`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Abwesenheitsarten"
- **Abwesenheitsart hinzufügen**: Button zum Anlegen

### 2. Datentabelle

| Spalte | Beschreibung |
|--------|--------------|
| **Name** | Bezeichnung |
| **Kürzel** | Kurzcode |
| **Farbe** | Farbcode für Kalender |
| **Urlaubsabzug** | Wird vom Urlaub abgezogen? |
| **Genehmigung** | Erfordert Genehmigung? |
| **Aktionen** | Bearbeiten, Details, Löschen |

### 3. Formular (Form Sheet)

#### Grunddaten
- **Name** (Pflicht): z.B. "Urlaub", "Krankheit"
- **Kürzel**: z.B. "U", "K"
- **Farbe**: Farbwähler
- **Beschreibung**: Optionale Details

#### Eigenschaften
- **Zählt als Urlaub**: Wird vom Urlaubskontingent abgezogen
- **Genehmigungspflichtig**: Erfordert Vorgesetzten-Genehmigung
- **Bezahlt**: Wird als bezahlte Abwesenheit gewertet
- **Zählt als Arbeitszeit**: Gilt als Arbeitszeit für Statistiken
- **Halbtage erlaubt**: Kann auch für halbe Tage beantragt werden
- **Nachweis erforderlich**: z.B. AU-Bescheinigung

#### Buchungsverhalten
- **Buchungsart**: Automatische Buchung bei Genehmigung
- **Konto**: Zuordnung zu einem Konto

## Schritt-für-Schritt Anleitungen

### Neue Abwesenheitsart erstellen

1. Klicken Sie auf **"Abwesenheitsart hinzufügen"**
2. Geben Sie **Name** und **Kürzel** ein
3. Wählen Sie eine **Farbe**
4. Konfigurieren Sie die **Eigenschaften**:
   - Bei Urlaub: "Zählt als Urlaub" aktivieren
   - Bei Krankheit: "Nachweis erforderlich" aktivieren
5. Klicken Sie auf **"Speichern"**

### Abwesenheitsart bearbeiten

1. Finden Sie die Art in der Tabelle
2. Klicken Sie auf **"Bearbeiten"**
3. Ändern Sie die gewünschten Eigenschaften
4. Speichern Sie die Änderungen

### Abwesenheitsart deaktivieren

1. Öffnen Sie das Bearbeitungsformular
2. Ändern Sie den **Status** auf "Inaktiv"
3. Speichern Sie
4. Die Art ist für neue Anträge nicht mehr verfügbar

## Typische Abwesenheitsarten

| Name | Kürzel | Urlaubsabzug | Genehmigung |
|------|--------|--------------|-------------|
| Urlaub | U | Ja | Ja |
| Krankheit | K | Nein | Nein |
| Sonderurlaub | SU | Nein | Ja |
| Fortbildung | FB | Nein | Ja |
| Elternzeit | EZ | Nein | Ja |
| Gleitzeitausgleich | GA | Nein | Ja |
| Homeoffice | HO | Nein | Je nach Policy |
| Dienstreise | DR | Nein | Ja |

## Auswirkungen auf andere Module

| Modul | Verwendung |
|-------|------------|
| **Abwesenheiten** | Verfügbare Arten im Antragsformular |
| **Urlaubssaldo** | Abzug bei "Zählt als Urlaub" |
| **Genehmigungen** | Anträge bei genehmigungspflichtigen Arten |
| **Kalender** | Farbdarstellung nach Art |
| **Berichte** | Auswertung nach Abwesenheitsart |

## Tipps & Best Practices

1. **Konsistente Farben**: Urlaub blau, Krankheit rot, etc.
2. **Klare Kürzel**: Einheitliche, intuitive Abkürzungen.
3. **Alle Szenarien abdecken**: Definieren Sie alle relevanten Arten.
4. **Genehmigung bewusst setzen**: Nur wenn wirklich nötig.
5. **Nachweis-Option**: Für Krankheit und behördliche Termine.

## Problembehandlung

### Art nicht im Antragsformular
**Ursache**: Art ist inaktiv.
**Lösung**: Aktivieren Sie die Abwesenheitsart.

### Urlaub wird nicht abgezogen
**Ursache**: "Zählt als Urlaub" nicht aktiviert.
**Lösung**: Bearbeiten Sie die Art und aktivieren Sie die Option.

### Zu viele Arten im Dropdown
**Lösung**: Deaktivieren Sie nicht mehr benötigte Arten.

## Verwandte Module

- **[Abwesenheiten](./abwesenheiten.md)** - Anträge stellen
- **[Genehmigungen](./genehmigungen.md)** - Anträge genehmigen
- **[Urlaubssalden](./urlaubssalden.md)** - Urlaubskontingente
