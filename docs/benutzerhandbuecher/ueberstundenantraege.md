# Überstundenanträge - Benutzerhandbuch

## Überblick

Das Modul **Überstundenanträge** ermöglicht es Mitarbeitern, geplante Überstunden vorab zu beantragen oder eine bereits beendete Zeiterfassung wieder zu öffnen, damit nach dem Ausstempeln weitergearbeitet werden kann. Beide Flüsse laufen durch einen formalen Genehmigungs-Workflow und berücksichtigen die Arbeitszeitgesetz-Grenzen (§§ 3, 5, 9 ArbZG).

**Wer nutzt dieses Modul:**
- Mitarbeiter zum Stellen von Vorab- und Reaktiv-Anträgen
- Schichtleiter/Genehmiger zur Bearbeitung offener Anträge (siehe [Überstunden-Genehmigungen](./ueberstunden-genehmigungen.md))
- HR-Verantwortliche für nachträgliche Genehmigung ungenehmigter Mehrarbeit über den [Korrekturassistent](./korrekturassistent.md)

## Voraussetzungen

Bevor Sie einen Überstundenantrag stellen können:

1. **Mitarbeiterdatensatz**: Sie müssen einen aktiven Mitarbeiterdatensatz haben.
2. **Berechtigung**: Ihre Benutzergruppe benötigt die Berechtigung `overtime.request`.
3. **Tenant-Konfiguration**: Der Administrator muss die Reopen-Antragspflicht aktiviert haben, damit Reopen-Anträge überhaupt wählbar sind (siehe [Überstundenantrag-Konfiguration](./ueberstundenantrag-konfiguration.md)).

## Zugang zum Modul

**Navigationspfad:** Hauptmenü → Überstundenanträge

**Direkte URL:** `/overtime-requests`

## Zwei Antragsarten

### Geplante Überstunden (PLANNED)
Für absehbare Mehrarbeit an einem zukünftigen oder heutigen Tag: Der Mitarbeiter meldet im Voraus, wie viele Minuten über der Soll-Arbeitszeit er leisten wird. Typischer Use Case: Projekt-Deadline, Produktions-Spitze, Messe-Aufbau.

### Zeiterfassung wieder öffnen (REOPEN)
Reaktiver Antrag: Der Mitarbeiter hat bereits ausgestempelt, möchte aber weiterarbeiten. Ohne genehmigten Reopen-Antrag blockiert die Stempeluhr das zweite Einstempeln (siehe [Stempeluhr](./stempeluhr.md)). Typischer Use Case: Kunde ruft spät an, Defekt muss noch behoben werden, vergessene Aufgabe.

> **Hinweis:** Wenn der Administrator die Reopen-Antragspflicht deaktiviert hat, ist die Option "Zeiterfassung wieder öffnen" im Antragsformular **nicht sichtbar**. In diesem Modus können Sie nach dem Ausstempeln einfach erneut einstempeln — der Tag wird vom System automatisch korrigiert.

## Funktionen & Bedienelemente

### 1. Seitenheader
- **Titel**: "Überstundenanträge" mit Untertitel
- **Neuer Antrag**: Button zum Öffnen des Antragsformulars

### 2. Antragsliste

Tabellarische Übersicht Ihrer Anträge mit folgenden Spalten:

| Spalte | Beschreibung |
|--------|--------------|
| **Datum** | Tag, auf den sich der Antrag bezieht |
| **Art** | Geplant oder Wiederöffnung |
| **Geplante Minuten** | Zusatzarbeitszeit in Minuten |
| **Begründung** | Ihre Begründung (gekürzt in der Liste) |
| **Status** | Ausstehend / Genehmigt / Abgelehnt / Zurückgezogen |
| **Aktionen** | "Zurückziehen"-Button bei ausstehenden Anträgen |

Statusfarben:

| Status | Bedeutung |
|--------|-----------|
| 🟡 **Ausstehend** | Wartet auf Genehmigung durch den Schichtleiter/Genehmiger |
| 🟢 **Genehmigt** | Antrag wurde freigegeben, Überstunden dürfen geleistet werden |
| 🔴 **Abgelehnt** | Antrag wurde vom Genehmiger verweigert (mit Begründung) |
| ⚪ **Zurückgezogen** | Sie oder das System haben den Antrag storniert |

### 3. Antragsformular (Dialog)

Das Antragsformular öffnet sich als Dialog und enthält folgende Felder:

- **Art (Radio-Buttons)**:
  - *Geplante Überstunden* — Vorab-Beantragung für einen bevorstehenden Tag
  - *Zeiterfassung wieder öffnen* — Reaktiver Antrag nach dem Ausstempeln (nur sichtbar, wenn aktiviert)
- **Datum**: Der Tag, für den die Überstunden beantragt werden (Datumspicker)
- **Zusatzzeit (Minuten)**: Wie viele Minuten über der Soll-Arbeitszeit geleistet werden sollen. Pflichtfeld, muss größer als 0 sein.
- **Begründung**: Warum werden die Überstunden benötigt? Pflichtfeld, mindestens 2 Zeichen.

Der **Absenden**-Button ist deaktiviert, solange Pflichtfelder leer sind oder die Begründung zu kurz ist.

## Schritt-für-Schritt Anleitungen

### Geplante Überstunden beantragen (Vorab-Antrag)

1. Navigieren Sie zu **Überstundenanträge**.
2. Klicken Sie auf **"Neuer Antrag"** — der Dialog öffnet sich.
3. Wählen Sie **"Geplante Überstunden"** als Art (Default).
4. Wählen Sie das **Datum** des Tages, an dem die Überstunden anfallen.
5. Tragen Sie die **Zusatzzeit in Minuten** ein (z. B. `90` für anderthalb Stunden).
6. Geben Sie eine **Begründung** an (z. B. "Kundentermin endet erst um 19 Uhr").
7. Klicken Sie auf **"Absenden"** — Sie erhalten eine Bestätigungs-Meldung.
8. Der Antrag erscheint mit Status "Ausstehend" in Ihrer Liste.
9. Ihr Genehmiger wird automatisch per In-App-Benachrichtigung informiert.

### Zeiterfassung wieder öffnen (Reaktiv-Antrag)

Nutzen Sie diesen Fluss, wenn Sie bereits ausgestempelt haben und nachträglich weiterarbeiten müssen.

1. Stempeln Sie sich wie gewohnt aus.
2. Navigieren Sie zu **Überstundenanträge**.
3. Klicken Sie auf **"Neuer Antrag"**.
4. Wählen Sie **"Zeiterfassung wieder öffnen"** als Art.
5. Das **Datum** steht standardmäßig auf heute; ändern Sie es nur, wenn Sie einen anderen Tag öffnen möchten.
6. Tragen Sie die **geschätzte Zusatzzeit** in Minuten ein.
7. Geben Sie eine **Begründung** an.
8. Klicken Sie auf **"Absenden"**.
9. Warten Sie, bis der Genehmiger den Antrag freigegeben hat (kurzfristig nachfragen, falls zeitkritisch).
10. Nach Genehmigung können Sie sich in der Stempeluhr normal wieder einstempeln — das System erkennt den aktiven Reopen-Antrag automatisch.

### Ausstehenden Antrag zurückziehen

1. Öffnen Sie **Überstundenanträge**.
2. Finden Sie den ausstehenden Antrag in der Liste.
3. Klicken Sie auf **"Zurückziehen"** (X-Symbol rechts).
4. Der Antrag erhält den Status "Zurückgezogen".
5. Ihr Genehmiger wird darüber informiert.

> **Achtung**: Bereits **genehmigte** Anträge können Sie nicht selbst zurückziehen — dies verhindert, dass eine Dienst-Absprache mit Ihrem Vorgesetzten einseitig aufgehoben wird. Genehmigte Anträge müssen vom Administrator storniert werden.

## Was passiert nach der Genehmigung?

- **Geplant-Antrag genehmigt**: Sie leisten die Überstunden wie normal (stempeln wie üblich). Im Tageswert wird die Mehrarbeit als "genehmigt" markiert, kein Korrekturassistent-Eintrag erscheint.
- **Reopen-Antrag genehmigt**: Die Stempeluhr erlaubt Ihnen, nach dem Ausstempeln erneut einzustempeln. Die tatsächlich geleistete Zeit wird als genehmigte Überstunden gewertet.

## ArbZG-Warnungen

Bei Antragserstellung und Genehmigung prüft das System automatisch drei Arbeitszeitgesetz-Regeln:

| Warnung | Bedeutung |
|---------|-----------|
| **DAILY_MAX_EXCEEDED** | § 3 ArbZG: Die Tageshöchstarbeitszeit (typischerweise 10h) wird überschritten |
| **REST_TIME_VIOLATED** | § 5 ArbZG: Die Mindestruhezeit von 11h zwischen zwei Arbeitstagen wird unterschritten |
| **SUNDAY_WORK** | § 9 ArbZG: Der beantragte Tag ist ein Sonntag oder gesetzlicher Feiertag |

Warnungen sind **kein harter Block** — sie werden dem Genehmiger angezeigt, der die Genehmigung nur mit einer schriftlichen Begründung für die Überschreitung erteilen darf. Diese Begründung wird dauerhaft am Antrag gespeichert.

> **Nicht im Scope (Phase 1)**: Der 48h/6-Monats-Durchschnitt nach § 3 Abs. 2 ArbZG wird aktuell nicht geprüft; hierfür ist ein separates Ticket geplant.

## Ungenehmigte Überstunden (Korrekturassistent)

Wenn ein Mitarbeiter länger arbeitet, ohne vorher einen Antrag zu stellen, erscheint der Tag automatisch im [Korrekturassistent](./korrekturassistent.md) mit der Fehlermeldung **`UNAPPROVED_OVERTIME`** ("Ungenehmigte Überstunden"). Dort können HR-Verantwortliche entscheiden:

- **Als Überstunden genehmigen**: Generiert automatisch einen rückwirkend genehmigten Planungs-Antrag und entfernt den Fehler-Eintrag.
- **Ablehnen / mit Mitarbeiter klären**: Der Tag bleibt in der Liste, bis eine manuelle Korrektur erfolgt.

Diese Erkennung läuft in beiden Reopen-Modi (Antragspflicht aktiv oder deaktiviert) — HR sieht ungenehmigte Mehrarbeit unabhängig davon, ob die Stempeluhr blockiert wird.

## Auswirkungen auf andere Module

| Modul | Auswirkung |
|-------|------------|
| **Stempeluhr** | Reopen-Anträge steuern, ob nach dem Ausstempeln erneut eingestempelt werden kann |
| **Überstunden-Genehmigungen** | Ausstehende Anträge erscheinen beim Genehmiger |
| **Korrekturassistent** | Ungenehmigte Überstunden werden dort gelistet |
| **Benachrichtigungen** | Jede Statusänderung erzeugt eine In-App-Nachricht |
| **Monatsauswertung** | Genehmigte Überstunden fließen in die monatliche Berechnung ein |
| **Überstunden-Auszahlung** | Der bestehende Auszahlungs-Workflow bleibt unverändert (Ticket 3) |

## Tipps & Best Practices

1. **Früh beantragen**: Stellen Sie geplante Überstunden so weit im Voraus, wie die Vorlaufzeit Ihres Tenants es verlangt (siehe Admin-Einstellung).

2. **Minuten statt Stunden**: Die Eingabe erfolgt immer in **Minuten**. 90 Minuten = 1,5 Stunden.

3. **Aussagekräftige Begründung**: Eine klare Begründung beschleunigt die Genehmigung und dient später als Nachweis im Audit-Log.

4. **Bei Reopen Genehmiger informieren**: Da Reopen-Anträge oft zeitkritisch sind, kann eine kurze Nachricht an den Genehmiger (z. B. per Teams/Mail) die Freigabe beschleunigen.

5. **Zurückziehen statt spammen**: Wenn Sie einen Antrag versehentlich falsch gestellt haben, ziehen Sie ihn zurück und stellen einen neuen, statt mehrere offene Anträge zu hinterlassen.

6. **ArbZG-Warnungen ernst nehmen**: Warnungen erscheinen nicht zufällig — prüfen Sie selbst, ob die Überstunden tatsächlich nötig sind, bevor Sie den Genehmiger unter Druck setzen.

## Problembehandlung

### "Kein Mitarbeiterdatensatz gefunden"
**Ursache**: Ihr Benutzerkonto ist nicht mit einem Mitarbeiter verknüpft.
**Lösung**: Kontaktieren Sie Ihren Administrator.

### Die Option "Zeiterfassung wieder öffnen" ist nicht wählbar
**Ursache**: Ihr Tenant hat die Reopen-Antragspflicht deaktiviert; die Stempeluhr ist dann offen und ein Antrag wird nicht benötigt.
**Lösung**: Stempeln Sie nach dem Ausstempeln einfach wieder ein — das System akzeptiert das direkt.

### Fehlermeldung "reopen_disabled" beim Absenden
**Ursache**: Die Reopen-Antragspflicht wurde zwischenzeitlich deaktiviert, während das Formular bereits offen war.
**Lösung**: Schließen Sie das Formular und laden Sie die Seite neu. Der Reopen-Radio-Button ist danach nicht mehr sichtbar.

### Fehlermeldung "requestDate must respect lead time of Xh"
**Ursache**: Ihr Tenant erzwingt eine Mindest-Vorlaufzeit (z. B. 24 h). Das gewählte Datum liegt zu kurzfristig in der Zukunft.
**Lösung**: Wählen Sie ein späteres Datum oder klären Sie eine Ausnahme mit Ihrem Administrator.

### Antrag kann nicht zurückgezogen werden
**Ursache**: Der Antrag wurde bereits genehmigt oder abgelehnt — der Zurückziehen-Button erscheint nur bei ausstehenden Anträgen.
**Lösung**: Kontaktieren Sie Ihren Administrator für eine nachträgliche Stornierung.

### Stempeluhr blockt nach dem Ausstempeln trotz genehmigtem Reopen-Antrag
**Ursache**: Der genehmigte Antrag bezieht sich auf ein anderes Datum (z. B. Zeit nach Mitternacht).
**Lösung**: Prüfen Sie das Antrags-Datum; stellen Sie ggf. einen neuen Antrag für den aktuellen Tag.

## Verwandte Module

- **[Stempeluhr](./stempeluhr.md)** - Ein- und Ausstempeln, Reopen-Gate
- **[Überstunden-Genehmigungen](./ueberstunden-genehmigungen.md)** - (Admin) Anträge genehmigen/ablehnen
- **[Überstundenantrag-Konfiguration](./ueberstundenantrag-konfiguration.md)** - (Admin) Tenant-weite Einstellungen
- **[Korrekturassistent](./korrekturassistent.md)** - Nachträgliche Genehmigung ungenehmigter Mehrarbeit
- **[Benachrichtigungen](./benachrichtigungen.md)** - Antrags-Events im Posteingang
