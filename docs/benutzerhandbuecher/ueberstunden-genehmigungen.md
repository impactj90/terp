# Überstunden-Genehmigungen - Benutzerhandbuch (Admin)

## Überblick

Das Modul **Überstunden-Genehmigungen** ist der Arbeitsbereich für Schichtleiter und andere Genehmiger. Hier werden alle ausstehenden Überstundenanträge (Vorab und Reaktiv) gelistet und können genehmigt oder mit Begründung abgelehnt werden. Das System prüft automatisch drei ArbZG-Regeln und erzwingt eine Pflicht-Begründung, wenn der Genehmiger trotz Warnung freigeben will.

**Wer nutzt dieses Modul:**
- Schichtleiter für ihre Teams
- Vorgesetzte allgemein
- HR-Verantwortliche bei eskalierten Anträgen

> **Hinweis**: Dies ist ein **separates** Modul vom allgemeinen [Genehmigungen](./genehmigungen.md)-Modul (Abwesenheiten und Stundenzettel). Überstundenanträge laufen bewusst durch einen eigenen Workflow, weil sie andere Genehmiger-Rechte, eigene ArbZG-Validierung und eine eigene Eskalations-Logik haben.

## Voraussetzungen

1. **Genehmiger-Berechtigung**: Ihre Benutzergruppe benötigt die Berechtigung `overtime.approve`.
2. **Eskalations-Berechtigung (optional)**: Für Anträge oberhalb der Eskalations-Schwelle ist zusätzlich `overtime.approve_escalated` erforderlich — diese gibt der Administrator einer höheren Instanz (z. B. HR).
3. **Offene Anträge**: Es müssen ausstehende Überstundenanträge vorliegen.

## Zugang zum Modul

**Navigationspfad:** Verwaltung → Abwesenheiten → Überstunden-Genehmigungen

**Direkte URL:** `/admin/overtime-approvals`

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Überstunden-Genehmigungen"
- **Untertitel**: "Ausstehende Überstundenanträge zur Freigabe"

### 2. Antragsliste

Die Liste zeigt nur ausstehende Anträge. Historische (genehmigte / abgelehnte) Anträge sind hier nicht sichtbar und werden über die Mitarbeiter-Übersicht oder das Audit-Protokoll nachvollziehbar.

| Spalte | Beschreibung |
|--------|--------------|
| **Mitarbeiter** | Vor- und Nachname des Antragstellers |
| **Datum** | Tag, auf den sich der Antrag bezieht |
| **Art** | Geplant (PLANNED) oder Wiederöffnung (REOPEN) |
| **Geplante Minuten** | Zusatzarbeitszeit in Minuten |
| **Begründung** | Erklärungstext des Mitarbeiters (gekürzt) |
| **ArbZG-Warnungen** | Rote Badge mit Anzahl ArbZG-Verletzungen oder "—" |
| **Aktionen** | Buttons "Genehmigen" und "Ablehnen" |

### 3. Genehmigungs-Dialog

Öffnet sich beim Klick auf **"Genehmigen"**. Zeigt eine Zusammenfassung der ArbZG-Warnungen (wenn vorhanden) und ein Pflicht-Textfeld für die Override-Begründung:

- **Warnungs-Alert**: Liste aller Gesetzes-Verletzungen als gut lesbarer Text (z. B. "Tageshöchstarbeitszeit (10h) wird überschritten.").
- **Override-Begründung**: Pflichtfeld, mindestens 2 Zeichen. Nur sichtbar, wenn Warnungen vorliegen.
- **Bestätigen**-Button: Deaktiviert, solange die Begründung bei vorhandenen Warnungen leer ist.

### 4. Ablehnungs-Dialog

Öffnet sich beim Klick auf **"Ablehnen"**. Enthält:

- **Ablehnungsgrund**: Pflicht-Textfeld, mindestens 2 Zeichen
- **Bestätigen**-Button: Deaktiviert, solange der Grund leer ist

Der Grund wird an den Mitarbeiter als In-App-Benachrichtigung weitergegeben und dauerhaft am Antrag gespeichert.

## Eskalations-Logik

Der Administrator kann pro Tenant eine **Eskalations-Schwelle** in Minuten konfigurieren (siehe [Überstundenantrag-Konfiguration](./ueberstundenantrag-konfiguration.md)). Anträge mit `plannedMinutes >= escalationThresholdMinutes` benötigen einen Genehmiger mit der zusätzlichen Berechtigung `overtime.approve_escalated`.

Ein normaler Schichtleiter ohne diese Berechtigung sieht den Antrag in seiner Liste, erhält aber beim Klick auf "Genehmigen" einen **Forbidden-Fehler** (`overtime.approve_escalated required for this request`).

> **Praxis-Beispiel**: Schwelle = 240 Minuten (4h). Ein Antrag über 180 min → jeder Schichtleiter kann freigeben. Ein Antrag über 300 min → nur HR kann freigeben.

## Schritt-für-Schritt Anleitungen

### Antrag ohne ArbZG-Warnungen genehmigen

1. Navigieren Sie zu **Überstunden-Genehmigungen**.
2. Prüfen Sie die Details des Antrags in der Zeile (Datum, Minuten, Begründung).
3. Klicken Sie auf **"Genehmigen"** rechts in der Zeile.
4. Der Genehmigungs-Dialog öffnet sich — kein Override-Feld, weil keine Warnungen.
5. Klicken Sie erneut auf **"Genehmigen"** im Dialog.
6. Sie erhalten die Bestätigung "Antrag genehmigt"; der Antrag verschwindet aus der Liste.
7. Der Mitarbeiter wird per Benachrichtigung informiert.

### Antrag mit ArbZG-Warnungen genehmigen

1. Der Antrag zeigt in der Spalte "ArbZG-Warnungen" eine rote Badge mit Zahl.
2. Klicken Sie auf **"Genehmigen"**.
3. Der Dialog listet alle Warnungen auf (z. B. "Arbeit an Sonn-/Feiertagen.").
4. Lesen Sie die Warnungen sorgfältig durch.
5. Tragen Sie eine **Override-Begründung** ein (z. B. "Produktions-Notfall, Kunde wartet auf Lieferung").
6. Klicken Sie auf **"Genehmigen"** im Dialog.
7. Die Override-Begründung wird dauerhaft am Antrag gespeichert.

### Antrag ablehnen

1. Klicken Sie auf **"Ablehnen"** rechts in der Zeile.
2. Tragen Sie einen **Ablehnungsgrund** ein (z. B. "Keine dringende Notwendigkeit, kann auf nächsten Werktag verschoben werden").
3. Klicken Sie auf **"Ablehnen"** im Dialog.
4. Der Antrag verschwindet aus der Liste.
5. Der Mitarbeiter erhält eine Benachrichtigung mit dem Ablehnungsgrund.

### Doppel-Klick / parallele Bearbeitung

Wenn zwei Genehmiger gleichzeitig denselben Antrag öffnen und beide auf "Genehmigen" klicken, gewinnt der erste Klick. Der zweite erhält eine Fehlermeldung **"invalid_status_transition"** — aktualisieren Sie die Seite, um den aktuellen Status zu sehen.

## Auswirkungen auf andere Module

| Modul | Auswirkung |
|-------|------------|
| **Überstundenanträge** (MA) | Antrag wechselt in Status "Genehmigt" oder "Abgelehnt" |
| **Stempeluhr** | Bei genehmigtem Reopen darf MA nach Ausstempeln wieder einstempeln |
| **Tageswerte** | Ein genehmigter Planungs-Antrag markiert die Mehrarbeit als genehmigt; `UNAPPROVED_OVERTIME` erscheint nicht |
| **Benachrichtigungen** | Mitarbeiter erhält Statusänderung, ggf. andere Genehmiger werden informiert |
| **Audit-Protokolle** | Jede Aktion (Genehmigen/Ablehnen) wird als `approve_overtime_request` / `reject_overtime_request` protokolliert |

## ArbZG-Validierung — Regeln im Detail

Das System prüft bei **Antragserstellung** und erneut bei **Genehmigung** drei Regeln:

### § 3 ArbZG — Tageshöchstarbeitszeit (DAILY_MAX_EXCEEDED)
Warnung, wenn `Soll-Arbeitszeit + beantragte Zusatzzeit > max. Tagesarbeitszeit` (aus dem Tagesplan, typischerweise 600 min = 10h). Fallback bei fehlendem Wert: 600 min.

### § 5 ArbZG — Ruhezeit (REST_TIME_VIOLATED)
Warnung, wenn zwischen der letzten Ausstempel-Buchung am Vortag und dem Tagesbeginn (00:00 Uhr) des beantragten Tages **weniger als 11 Stunden** liegen.

### § 9 ArbZG — Sonn-/Feiertagsarbeit (SUNDAY_WORK)
Warnung, wenn der beantragte Tag ein Sonntag oder ein als gesetzlicher Feiertag eingetragenes Datum ist.

> **Nicht geprüft**: 48-Stunden-Durchschnitt über 6 Monate (§ 3 Abs. 2 ArbZG), Jugendarbeitsschutz (JArbSchG), Mutterschutz (MuSchG). Diese kommen in späteren Tickets.

## Tipps & Best Practices

1. **Täglich prüfen**: Ausstehende Anträge zeitnah bearbeiten — besonders Reopen-Anträge sind oft tagesaktuell kritisch.

2. **ArbZG-Warnungen nicht pauschal overriden**: Die Warnungen haben einen Grund. Bevor Sie eine Override-Begründung schreiben, fragen Sie sich, ob die Überstunden wirklich notwendig oder ob die Arbeit verschoben werden kann.

3. **Ablehnungsgrund als Kommunikation**: Der Grund wird direkt an den Mitarbeiter geschickt — formulieren Sie ihn klar und respektvoll.

4. **Eskalations-Grenze kennen**: Falls Sie das Recht `overtime.approve_escalated` **nicht** haben, können Sie Anträge oberhalb der Schwelle zwar sehen, aber nicht genehmigen. Leiten Sie solche Anträge an HR weiter.

5. **Muster erkennen**: Wenn ein Mitarbeiter wiederholt Reopen-Anträge stellt, besprechen Sie die Ursache — möglicherweise stimmt die geplante Arbeitszeit nicht.

## Problembehandlung

### Liste ist leer, obwohl Anträge existieren
**Ursache**: Ihre `DataScope`-Einstellung schränkt Sie auf bestimmte Abteilungen oder Mitarbeiter ein, für die kein Antrag vorliegt.
**Lösung**: Kontaktieren Sie den Administrator, um Ihren Scope zu prüfen.

### "overtime.approve_escalated required for this request"
**Ursache**: Der Antrag überschreitet die Eskalations-Schwelle und Sie haben diese Berechtigung nicht.
**Lösung**: Leiten Sie den Antrag an einen HR-Genehmiger weiter oder bitten Sie den Administrator, Ihnen die Berechtigung zu erteilen.

### "arbzg_override_reason_required"
**Ursache**: Sie haben versucht, einen Antrag mit ArbZG-Warnungen ohne Override-Begründung zu genehmigen.
**Lösung**: Tragen Sie eine Begründung im Dialog-Textfeld ein.

### "invalid_status_transition"
**Ursache**: Ein anderer Genehmiger hat den Antrag parallel bearbeitet.
**Lösung**: Seite neu laden und aktuellen Status prüfen.

### Mitarbeiter erscheint nicht im Antrag
**Ursache**: Der Antrag wurde gelöscht oder ist nicht mehr im Pending-Status.
**Lösung**: Falls Prüfung nötig, Audit-Protokolle konsultieren.

## Verwandte Module

- **[Überstundenanträge](./ueberstundenantraege.md)** - Mitarbeiter-Sicht, Antrag stellen
- **[Überstundenantrag-Konfiguration](./ueberstundenantrag-konfiguration.md)** - Approval-Policy pro Tenant
- **[Genehmigungen](./genehmigungen.md)** - Abwesenheits- und Stundenzettel-Genehmigungen (getrenntes Modul)
- **[Korrekturassistent](./korrekturassistent.md)** - Rückwirkende Genehmigung via `UNAPPROVED_OVERTIME`
- **[Audit-Protokolle](./audit-protokolle.md)** - Historie aller Genehmigungs-Entscheidungen
