# Überstundenantrag-Konfiguration - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Überstundenantrag-Konfiguration** ist die zentrale Stelle, an der Administratoren die Policy für Überstundenanträge pro Tenant festlegen. Jede Einstellung ist ein Einzel-Toggle oder Schwellwert, der direkt wirksam wird, sobald er gespeichert ist.

**Wer nutzt dieses Modul:**
- Administratoren beim ersten Setup des Mandanten
- Administratoren bei Änderung der Compliance-Anforderungen

## Voraussetzungen

1. **Administrator-Berechtigung**: Sie benötigen die Berechtigung `settings.manage`.

## Zugang zum Modul

**Navigationspfad:** Verwaltung → Abwesenheiten → Überstundenantrag-Konfiguration

**Direkte URL:** `/admin/overtime-request-config`

## Einstellungen

### Genehmigungspflicht

**Typ**: Schalter (Toggle)
**Default**: **Aktiv**
**Wirkung**:
- **Aktiviert**: Alle neuen Überstundenanträge gehen in den Pending-Status und warten auf eine Genehmigung durch einen Benutzer mit `overtime.approve`.
- **Deaktiviert**: Anträge werden beim Absenden automatisch in Status "Genehmigt" erzeugt, ohne dass ein Genehmiger prüft. Der Antragsteller wird als Genehmiger eingetragen.

**Typischer Use Case für Deaktivierung**: Kleine Betriebe mit flachen Hierarchien, in denen die Überstunden-Kommunikation rein verbal abläuft, das System aber trotzdem zur Dokumentation genutzt werden soll.

### Reopen-Antragspflicht

**Typ**: Schalter (Toggle)
**Default**: **Aktiv**
**Wirkung**:
- **Aktiviert**: Nach dem Ausstempeln ist die Stempeluhr für diesen Tag blockiert. Um erneut einzustempeln, benötigt der Mitarbeiter einen genehmigten Reopen-Antrag für diesen Tag.
- **Deaktiviert**: Die Stempeluhr bleibt offen — der Mitarbeiter kann nach dem Ausstempeln einfach erneut einstempeln. Der Reopen-Antragstyp ist im Antragsformular nicht mehr sichtbar.

**Wichtig beim Deaktivieren**:
- Ein **Bestätigungs-Dialog** erscheint vor dem Speichern, wenn noch ausstehende Reopen-Anträge existieren.
- Diese ausstehenden Reopen-Anträge werden **automatisch zurückgezogen** (Status "Cancelled"), sobald Sie den Flip bestätigen.
- Bereits **genehmigte** Reopen-Anträge bleiben unberührt und historisch einsehbar.
- Der Dialog zeigt die genaue Anzahl der betroffenen Anträge ("# ausstehende Reopen-Anträge werden automatisch zurückgezogen.").

Der Rückfluss (Re-Aktivierung von false → true) erfolgt **ohne** Dialog, da keine destruktive Datenänderung stattfindet.

> **Hinweis zur `UNAPPROVED_OVERTIME`-Erkennung**: Diese läuft unabhängig von der Reopen-Antragspflicht weiter — auch bei deaktivierter Antragspflicht erscheinen Tage mit nicht genehmigter Mehrarbeit im [Korrekturassistent](./korrekturassistent.md), wo HR sie nachträglich genehmigen kann.

### Vorlaufzeit (Stunden)

**Typ**: Zahlen-Eingabe (Ganzzahl, min 0, max 8760)
**Default**: `0`
**Wirkung**: Mindestabstand zwischen dem Moment des Absendens und dem Datum des Antrags. Bei `0` kann ein Antrag rückwirkend für den aktuellen Tag gestellt werden. Bei `24` muss der Antrag mindestens 24 Stunden vor dem Zieldatum eingereicht werden — spätere Anträge werfen den Fehler `requestDate must respect lead time of Xh`.

**Typische Werte**:
- `0` — keine Vorlaufzeit (Pro-Di-Default, flexible Betriebe)
- `24` — ein Werktag Vorlauf
- `72` — drei Tage Vorlauf (streng geführte Betriebe)

### Monatliche Warnschwelle (Minuten)

**Typ**: Zahlen-Eingabe (optional, leer = keine Schwelle)
**Default**: _leer_
**Wirkung**: Warnwert für die Monatssumme genehmigter Überstunden. Dient als Vormerkung für den Genehmiger — die Überschreitung blockiert keinen Antrag, wird aber in Auswertungen sichtbar.

**Typische Werte**:
- Leer — keine Warn-Vormerkung
- `2400` — 40 Stunden Monat
- `3600` — 60 Stunden Monat

### Eskalationsschwelle (Minuten)

**Typ**: Zahlen-Eingabe (optional, leer = keine Eskalation)
**Default**: _leer_
**Wirkung**: Anträge mit `plannedMinutes >= escalationThresholdMinutes` benötigen einen Genehmiger mit der zusätzlichen Berechtigung `overtime.approve_escalated`. Genehmiger ohne diese Berechtigung erhalten beim Klick auf "Genehmigen" einen Forbidden-Fehler.

**Typische Werte**:
- Leer — einstufige Genehmigung
- `240` — ab 4 Stunden zusätzliche HR-Freigabe
- `480` — ab 8 Stunden zusätzliche HR-Freigabe

## Bedienelemente

### Speichern-Button
Persistiert alle Änderungen in einem Rutsch. Bei destruktivem Flip (Reopen-Antragspflicht → deaktiviert mit ausstehenden Anträgen) öffnet sich **zuerst** der Bestätigungs-Dialog, und erst nach der Bestätigung erfolgt das Speichern.

### Bestätigungs-Dialog (Confirm-Dialog)
Erscheint ausschließlich beim destruktiven Deaktivieren der Reopen-Antragspflicht:
- **Titel**: "Reopen-Antragspflicht deaktivieren?"
- **Beschreibung**: "# ausstehende Reopen-Anträge werden automatisch zurückgezogen." (Plural-aware)
- **Fortfahren**: Speichert die Änderung und cancelled die Pending-Reopens
- **Abbrechen**: Schließt den Dialog ohne Änderung

## Schritt-für-Schritt Anleitungen

### Ersteinrichtung bei neuem Tenant

1. Navigieren Sie zu **Verwaltung → Abwesenheiten → Überstundenantrag-Konfiguration**.
2. Entscheiden Sie, ob Überstunden eine **Genehmigung** benötigen — in den meisten Fällen ja (Default).
3. Entscheiden Sie, ob die **Reopen-Antragspflicht** aktiv sein soll — bei strenger ArbZG-Compliance ja, bei kleineren Betrieben evtl. nein.
4. Setzen Sie eine **Vorlaufzeit** nur, wenn Ihr Betrieb Überstunden planen statt spontan machen soll.
5. Legen Sie optional **Monats-Warnschwelle** und **Eskalations-Schwelle** fest.
6. Klicken Sie auf **"Speichern"** — Toast bestätigt "Einstellungen gespeichert".

### Reopen-Antragspflicht im Betrieb deaktivieren

1. Öffnen Sie die Konfigurations-Seite.
2. Schalten Sie den **Reopen-Antragspflicht**-Switch auf aus.
3. Klicken Sie auf **"Speichern"**.
4. Der Bestätigungs-Dialog erscheint mit der Anzahl der betroffenen Anträge.
5. Lesen Sie den Text: _"N ausstehende Reopen-Anträge werden automatisch zurückgezogen."_
6. Klicken Sie auf **"Fortfahren"**, um zu bestätigen — oder **"Abbrechen"**, um den Flip zurückzusetzen.
7. Nach Bestätigung: alle Pending-Reopens sind "cancelled", und die Stempeluhr akzeptiert ab sofort erneutes Einstempeln ohne Antrag.

### Reopen-Antragspflicht wieder aktivieren

1. Schalten Sie den **Reopen-Antragspflicht**-Switch wieder an.
2. Klicken Sie auf **"Speichern"** — kein Dialog.
3. Ab sofort blockt die Stempeluhr erneutes Einstempeln nach Ausstempeln, es sei denn ein neuer Reopen-Antrag wird genehmigt.
4. Bereits genehmigte (vor dem Deaktivieren) Reopen-Anträge bleiben gültig und historisch einsehbar.

### Eskalations-Schwelle konfigurieren

1. Legen Sie die Schwelle in Minuten fest (z. B. `240` für 4h).
2. Stellen Sie sicher, dass mindestens **ein** Benutzer in Ihrem Tenant die Berechtigung `overtime.approve_escalated` hat (i. d. R. HR oder Geschäftsleitung).
3. Klicken Sie auf **"Speichern"**.
4. Testen Sie mit einem Antrag über der Schwelle, dass ein Genehmiger ohne Eskalations-Recht den Antrag nicht freigeben kann.

## Auswirkungen auf andere Module

| Modul | Auswirkung |
|-------|------------|
| **Überstundenanträge** (MA) | Formular rendert sich je nach Policy (Reopen-Radio sichtbar oder nicht) |
| **Überstunden-Genehmigungen** | Eskalations-Schwelle steuert, welche Genehmiger welche Anträge bearbeiten dürfen |
| **Stempeluhr** | Reopen-Antragspflicht steuert das Post-Ausstempel-Verhalten |
| **Benachrichtigungen** | Genehmigungspflicht-Wert steuert, ob Approver-Benachrichtigungen überhaupt entstehen |
| **Korrekturassistent** | `UNAPPROVED_OVERTIME`-Erkennung läuft unabhängig weiter |
| **Audit-Protokolle** | Jede Änderung der Konfiguration erzeugt einen `update`-Eintrag auf `overtime_request_config` |

## Tipps & Best Practices

1. **Defaults beibehalten bei Unsicherheit**: Beide Toggles stehen auf "Aktiv" und gelten als konservativer, compliance-orientierter Startpunkt.

2. **Eskalations-Berechtigung vor Schwelle**: Konfigurieren Sie zuerst die `overtime.approve_escalated`-Berechtigung auf mindestens einer Benutzergruppe, **bevor** Sie eine Schwelle setzen — sonst kann niemand große Anträge genehmigen.

3. **Reopen-Flip kommunizieren**: Wenn Sie die Reopen-Antragspflicht ändern, informieren Sie Mitarbeiter und Schichtleiter vorab — besonders beim Deaktivieren, weil ausstehende Anträge automatisch storniert werden.

4. **Eskalations-Schwellen in vollen Stunden**: Wählen Sie Werte wie 240, 300, 480 (volle Stunden × 60) — das ist für Audits leichter nachvollziehbar als krumme Minuten-Angaben.

5. **Vorlaufzeit nicht überschätzen**: Zu lange Vorlaufzeiten (z. B. 72h) machen spontane Reaktionen auf Kundenanforderungen unmöglich. Pro-Di empfiehlt 0h Vorlaufzeit für flexible Betriebe.

## Problembehandlung

### Dialog erscheint nicht beim Deaktivieren
**Ursache**: Es gibt aktuell keine ausstehenden Reopen-Anträge — der Dialog wird in diesem Fall übersprungen, weil nichts storniert werden muss.
**Lösung**: Erwartetes Verhalten. Die Deaktivierung wurde direkt gespeichert.

### Speicher-Button disabled
**Ursache**: Eine laufende Mutation blockiert die Schaltfläche.
**Lösung**: Kurz warten, bis der Spinner verschwindet.

### Genehmiger kann Anträge über der Eskalations-Schwelle nicht genehmigen
**Ursache**: Genehmiger hat `overtime.approve`, aber nicht `overtime.approve_escalated`.
**Lösung**: Fügen Sie die Berechtigung der Benutzergruppe hinzu, oder leiten Sie eskalationspflichtige Anträge an HR.

### Mitarbeiter sehen "reopen_disabled"-Fehler
**Ursache**: Mitarbeiter haben das Antragsformular offen gehabt, als Sie die Reopen-Antragspflicht deaktiviert haben.
**Lösung**: Nach einem Seiten-Reload verschwindet die Option im Formular; der Fehler entsteht dann nicht mehr.

### Einstellungen werden nicht auf der MA-Seite wirksam
**Ursache**: Browser-Cache hält die alte Konfiguration fest.
**Lösung**: Hart neu laden (Strg+Shift+R) oder App-Client schließen und neu öffnen.

## Verwandte Module

- **[Überstundenanträge](./ueberstundenantraege.md)** - MA-Sicht, Antrag stellen
- **[Überstunden-Genehmigungen](./ueberstunden-genehmigungen.md)** - Genehmiger-Sicht, Anträge bearbeiten
- **[Benutzergruppen](./benutzergruppen.md)** - Berechtigungen `overtime.request`, `overtime.approve`, `overtime.approve_escalated`
- **[Korrekturassistent](./korrekturassistent.md)** - Nachträgliche Genehmigung ungenehmigter Mehrarbeit
- **[Einstellungen](./einstellungen.md)** - Allgemeine Tenant-Konfiguration
