# Abwesenheiten - Benutzerhandbuch

## Überblick

Das Modul **Abwesenheiten** ermöglicht Ihnen, Freizeit, Urlaub, Krankheit und andere Abwesenheiten zu beantragen und zu verwalten. Sie sehen hier Ihre offenen Anträge, können neue Abwesenheiten erfassen und haben einen Kalenderüberblick über alle Ihre geplanten und vergangenen Abwesenheiten.

**Wer nutzt dieses Modul:**
- Alle Mitarbeiter zum Beantragen von Abwesenheiten
- Mitarbeiter zur Übersicht ihrer Abwesenheitshistorie
- Das System für automatische Urlaubsabzüge und Statistiken

## Voraussetzungen

Bevor Sie Abwesenheiten beantragen können:

1. **Mitarbeiterdatensatz**: Sie müssen einen aktiven Mitarbeiterdatensatz im System haben.
2. **Urlaubskontingent**: Für Urlaubsanträge muss ein Urlaubssaldo für das aktuelle Jahr existieren.
3. **Genehmiger**: In Ihrem Profil oder Team muss ein Genehmiger hinterlegt sein (für genehmigungspflichtige Abwesenheitsarten).

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Abwesenheiten

**Mobil:** Über das Seitenmenü oder Dashboard-Schnellzugriff

**Direkte URL:** `/absences`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Abwesenheiten" mit Untertitel
- **Abwesenheit beantragen**: Großer Button zum Erstellen eines neuen Antrags

### 2. Urlaubsguthaben-Karte
Kompakte Übersicht Ihres aktuellen Urlaubsstands:
- **Verbleibend**: Noch verfügbare Urlaubstage
- **Genommen**: Bereits genutzte Tage
- **Geplant**: Genehmigte, aber noch nicht genommene Tage
- **Gesamtanspruch**: Ihr Jahresanspruch

### 3. Ihre Anträge (Pending Requests)
Liste Ihrer offenen und kürzlichen Abwesenheitsanträge:

| Status | Bedeutung |
|--------|-----------|
| 🟡 **Ausstehend** | Wartet auf Genehmigung |
| 🟢 **Genehmigt** | Antrag wurde genehmigt |
| 🔴 **Abgelehnt** | Antrag wurde abgelehnt |
| ⚪ **Storniert** | Antrag wurde zurückgezogen |

Jeder Antrag zeigt:
- Abwesenheitsart (Urlaub, Krankheit, etc.)
- Zeitraum (Von-Bis-Datum)
- Status
- Aktionen (Details, Bearbeiten, Stornieren)

### 4. Kalenderübersicht
Interaktiver Kalender mit:
- **Farbmarkierungen**: Verschiedene Farben für unterschiedliche Abwesenheitsarten
- **Klickbare Tage**: Klick auf einen Tag öffnet das Antragsformular mit vorgewähltem Datum
- **Monatsnavigation**: Blättern durch die Monate
- **Legende**: Erklärung der Farbcodes

### 5. Antragsformular (Request Form)
Sheet-Dialog zum Erstellen neuer Anträge:
- **Abwesenheitsart**: Dropdown mit verfügbaren Arten (Urlaub, Sonderurlaub, Fortbildung, etc.)
- **Von-Datum**: Startdatum der Abwesenheit
- **Bis-Datum**: Enddatum der Abwesenheit
- **Halbe Tage**: Option für halbtägige Abwesenheiten
- **Notizen**: Optionale Bemerkungen oder Begründung
- **Urlaubsauswirkung**: Vorschau, wie viele Urlaubstage abgezogen werden

### 6. Detail-Ansicht (Detail Sheet)
Ausführliche Informationen zu einem Antrag:
- Alle Antragsdaten
- Genehmigungsverlauf
- Kommentare
- Aktionen (Bearbeiten, Stornieren)

### 7. Bearbeitungsformular (Edit Sheet)
Änderung bestehender Anträge (nur bei bestimmten Status möglich):
- Datum ändern
- Art ändern
- Notizen hinzufügen

### 8. Stornierungsdialog (Cancel Dialog)
Bestätigung zum Zurückziehen eines Antrags:
- Warnung vor der Stornierung
- Option für Begründung
- Bestätigen/Abbrechen

## Schritt-für-Schritt Anleitungen

### Urlaub beantragen

1. Navigieren Sie zu **Abwesenheiten**
2. Klicken Sie auf **"Abwesenheit beantragen"**
3. Wählen Sie **"Urlaub"** als Abwesenheitsart
4. Wählen Sie das **Von-Datum** und **Bis-Datum**
5. Optional: Aktivieren Sie **Halbtag**, falls nur ein halber Tag benötigt wird
6. Prüfen Sie die **Urlaubsauswirkung** (wie viele Tage werden abgezogen)
7. Fügen Sie optional **Notizen** hinzu
8. Klicken Sie auf **"Beantragen"**
9. Der Antrag geht zur Genehmigung an Ihren Vorgesetzten

### Krankmeldung eintragen

1. Klicken Sie auf **"Abwesenheit beantragen"**
2. Wählen Sie **"Krankheit"** als Abwesenheitsart
3. Geben Sie den **Zeitraum** ein (bei Unsicherheit: nur den ersten Tag)
4. Fügen Sie **Notizen** hinzu (z.B. "AU-Bescheinigung folgt")
5. Klicken Sie auf **"Beantragen"**
6. Je nach Konfiguration wird die Krankmeldung direkt genehmigt oder zur Kenntnisnahme weitergeleitet

### Abwesenheit über den Kalender beantragen

1. Navigieren Sie zur **Kalenderübersicht**
2. Klicken Sie auf den **gewünschten Tag**
3. Das Antragsformular öffnet sich mit vorgewähltem Datum
4. Vervollständigen Sie den Antrag wie oben beschrieben

### Antrag bearbeiten

1. Finden Sie den Antrag in **"Ihre Anträge"**
2. Klicken Sie auf das **Bearbeiten-Symbol** (Stift)
3. Ändern Sie die gewünschten Daten
4. Klicken Sie auf **"Speichern"**
5. **Hinweis**: Bei bereits genehmigten Anträgen erfordert eine Änderung ggf. eine erneute Genehmigung

### Antrag stornieren

1. Finden Sie den Antrag in **"Ihre Anträge"**
2. Klicken Sie auf das **Stornieren-Symbol** (X)
3. Bestätigen Sie die Stornierung im Dialog
4. Der Antrag wird als storniert markiert
5. Urlaubstage werden wieder gutgeschrieben (bei Urlaubsanträgen)

### Abwesenheitsdetails einsehen

1. Klicken Sie auf einen Antrag in der Liste
2. Das **Detail-Sheet** öffnet sich
3. Sehen Sie alle Informationen und den Genehmigungsverlauf
4. Nutzen Sie die Aktionen **Bearbeiten** oder **Stornieren** bei Bedarf

## Auswirkungen auf andere Module

Abwesenheiten beeinflussen mehrere Bereiche des Systems:

| Modul | Auswirkung |
|-------|------------|
| **Dashboard** | Zeigt aktuelle Abwesenheiten und Urlaubssaldo |
| **Urlaubsguthaben** | Urlaubstage werden bei Genehmigung abgezogen |
| **Teamübersicht** | Abwesende Mitarbeiter werden markiert |
| **Genehmigungen** | Neue Anträge erscheinen beim Genehmiger |
| **Stempeluhr** | An Abwesenheitstagen ist Stempeln typischerweise nicht erforderlich |
| **Monatsauswertung** | Abwesenheitstage werden in der Auswertung berücksichtigt |
| **Schichtplanung** | Abwesende Mitarbeiter werden in der Planung angezeigt |

## Tipps & Best Practices

1. **Frühzeitig beantragen**: Stellen Sie Urlaubsanträge so früh wie möglich, um eine rechtzeitige Genehmigung zu gewährleisten.

2. **Urlaubsstand prüfen**: Schauen Sie vor dem Antrag auf Ihr verbleibendes Guthaben.

3. **Teamabsprache**: Informieren Sie Ihr Team über geplante Abwesenheiten, besonders bei längeren Zeiträumen.

4. **Krankmeldung am ersten Tag**: Tragen Sie Krankheit direkt am ersten Tag ein, auch wenn die Dauer noch unklar ist.

5. **Halbtage nutzen**: Für Arzttermine oder kürzere Abwesenheiten die Halbtags-Option verwenden.

6. **Notizen hinzufügen**: Bei Sonderurlaub oder speziellen Anlässen immer eine Begründung angeben.

7. **Kalender regelmäßig prüfen**: Behalten Sie Ihre geplanten Abwesenheiten im Blick.

8. **Resturlaub beachten**: Gegen Jahresende den Resturlaub prüfen und rechtzeitig planen.

## Problembehandlung

### "Kein Mitarbeiterdatensatz gefunden"
**Ursache**: Ihr Benutzerkonto ist nicht mit einem Mitarbeiterdatensatz verknüpft.
**Lösung**: Kontaktieren Sie Ihren Administrator.

### Urlaubsanspruch zeigt 0 Tage
**Ursache**: Ihr Urlaubskontingent für das aktuelle Jahr wurde nicht initialisiert.
**Lösung**: Kontaktieren Sie Ihren Administrator zur Initialisierung des Urlaubssaldos.

### Antrag kann nicht gestellt werden
**Ursache**: Möglicherweise fehlt ein Genehmiger oder das Urlaubsguthaben reicht nicht aus.
**Lösung**: Prüfen Sie Ihr Urlaubsguthaben. Kontaktieren Sie bei Bedarf Ihren Administrator.

### Bearbeitung nicht möglich
**Ursache**: Der Antrag ist bereits genehmigt und der Zeitraum hat begonnen, oder der Monat ist abgeschlossen.
**Lösung**: Kontaktieren Sie Ihren Vorgesetzten oder Administrator für Korrekturen.

### Stornierung nicht möglich
**Ursache**: Der Abwesenheitszeitraum liegt in der Vergangenheit oder der Monat ist abgeschlossen.
**Lösung**: Kontaktieren Sie Ihren Administrator.

### Urlaubstage werden nicht abgezogen
**Ursache**: Die Abwesenheitsart ist nicht als "urlaubsabziehend" konfiguriert, oder der Antrag ist noch nicht genehmigt.
**Lösung**: Prüfen Sie den Antragsstatus. Bei genehmigten Anträgen kontaktieren Sie den Administrator.

### Kalender zeigt keine Abwesenheiten
**Ursache**: Keine Anträge für den angezeigten Monat oder Ladeproblem.
**Lösung**: Navigieren Sie zu anderen Monaten oder aktualisieren Sie die Seite.

## Verwandte Module

- **[Urlaub](./urlaub.md)** - Detaillierte Urlaubsübersicht und Historie
- **[Dashboard](./dashboard.md)** - Schnellübersicht des Urlaubsstands
- **[Teamübersicht](./teamuebersicht.md)** - Teamabwesenheiten sehen
- **[Genehmigungen](./genehmigungen.md)** - (Admin) Anträge genehmigen
- **[Abwesenheitsarten](./abwesenheitsarten.md)** - (Admin) Abwesenheitsarten konfigurieren
- **[Urlaubssalden](./urlaubssalden.md)** - (Admin) Urlaubskontingente verwalten
