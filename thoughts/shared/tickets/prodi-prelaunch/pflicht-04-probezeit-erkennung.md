# Probezeit-Erkennung + Reminder

## Kontext

Anforderung aus dem HR-Gespräch mit Pro-Di am 15.04.2026. Auslaufende Probezeiten werden heute außerhalb von TERP nachverfolgt. Dadurch entstehen Medienbrüche, verspätete Gespräche und ein erhöhtes Risiko, dass Entscheidungen zur Weiterbeschäftigung zu spät vorbereitet werden.

Das Thema ist mandantenübergreifend relevant: Probezeiten gehören zur allgemeinen Mitarbeiterverwaltung und sollen in TERP dort sichtbar werden, wo Personalverantwortliche heute bereits arbeiten.

## Problem / Pain Point

**Ist-Zustand im Code und Produkt:**
- `Employee.entryDate` ist vorhanden und fachlich das maßgebliche Eintrittsdatum.
- `Employee.probationMonths` ist vorhanden, optional und aktuell ohne tenantweiten Default.
- `Employee.exitDate` ist vorhanden und kennzeichnet Austritte.
- Es gibt aktuell keine berechnete Probezeit-Ende-Logik, kein Probezeit-Widget auf dem bestehenden `/dashboard`, keine Reminder-Automatik und keinen dedizierten Probezeit-Filter in der Mitarbeiterliste.
- `probationMonths` wird derzeit als normales Stammdatenfeld gepflegt; daraus entsteht noch kein operativer HR-Überblick.

**Fachliche Lücke:**
- Personalverantwortliche müssen Probezeiten manuell überwachen.
- Änderungen an Eintrittsdatum oder Probezeitdauer sind ohne Systemführung fehleranfällig.
- Auswertbare, prüfbare und dokumentierbare Benutzerflüsse innerhalb von TERP fehlen bisher.

## Akzeptanzkriterien

1. **Berechnung des Probezeit-Endes**
   - Das fachliche Probezeit-Ende wird aus `entryDate + probationMonths` berechnet.
   - Wenn `probationMonths` am Mitarbeiter gesetzt ist, gilt dieser Wert.
   - Wenn `probationMonths` am Mitarbeiter nicht gesetzt ist, gilt ein tenantweiter Standardwert aus den Admin-Einstellungen.
   - Der initiale tenantweite Standardwert ist `6` Monate.
   - Die Datumslogik muss Monatsenden und Schaltjahre fachlich korrekt behandeln.

2. **Relevante Mitarbeiter und Ausschlüsse**
   - Berücksichtigt werden nur Mitarbeiter mit gültigem Eintrittsdatum und einer wirksamen Probezeitdauer größer `0`.
   - Mitarbeiter mit `exitDate <= heute` gelten nicht mehr als relevante Probezeitfälle.
   - Diese ausgeschiedenen Mitarbeiter dürfen weder im Dashboard-Widget noch in Reminder-Läufen, Probezeit-Badges oder Probezeit-Filtern erscheinen.
   - Ein zukünftiges `exitDate` schließt den Mitarbeiter erst ab dem Austrittsdatum aus.

3. **Dashboard-Einbindung**
   - Es wird kein separates "HR-Dashboard" eingeführt.
   - Das Feature erscheint als zusätzliche, kompakte Karte im bestehenden `/dashboard`.
   - Die Karte fügt sich in die bestehende Dashboard-Logik ein: kompakte Zusammenfassung, kurzer Vorschau-Bereich, klarer Link in einen vertiefenden Arbeitsbereich.
   - Inhalt der Karte: Anzahl der Probezeiten mit Ende in den nächsten `30` Tagen sowie eine kurze Vorschau der nächsten betroffenen Mitarbeiter mit Name, Abteilung, Probezeit-Ende und verbleibenden Tagen.
   - Von der Karte aus ist ein nachvollziehbarer Folgeschritt möglich, z. B. in die gefilterte Mitarbeiterliste oder direkt in den jeweiligen Mitarbeiterdatensatz.

4. **Reminder-Notifications**
   - TERP erstellt automatische In-App-Benachrichtigungen vor Ende der Probezeit.
   - Standard-Reminder-Stufen sind `28`, `14` und `7` Tage vor dem berechneten Probezeit-Ende.
   - Reminder erscheinen im bestehenden Benachrichtigungssystem als Kategorie `Erinnerungen`.
   - Benutzerindividuelle Benachrichtigungseinstellungen für Erinnerungen bleiben wirksam und werden respektiert.

5. **Reminder-Konfiguration**
   - Die tenantweite Konfiguration wird in die bestehende Admin-Einstellungslogik unter `/admin/settings` eingebunden.
   - Das Ticket schreibt **kein** neues dediziertes Prisma-Modell `ProbationReminderConfig` fest.
   - Die Konfiguration folgt dem bestehenden tenantweiten Settings-/System-Settings-Muster.
   - Konfigurierbar sind mindestens:
     - tenantweiter Standardwert für `probationMonths`
     - Aktivierung/Deaktivierung der Reminder-Funktion
     - Reminder-Stufen in Tagen vor Probezeit-Ende

6. **Fachlich korrekte Deduplizierung**
   - Reminder werden eindeutig dedupliziert pro:
     - Tenant
     - Mitarbeiter
     - Reminder-Stufe
     - konkret berechnetem Probezeit-Ende
   - Eine Deduplizierung ausschließlich über Kalenderjahr oder Versandtag ist fachlich nicht ausreichend.
   - Wenn sich `entryDate` oder `probationMonths` ändern und dadurch ein neues Probezeit-Ende entsteht, darf ein früherer Reminder-Versand die neuen Reminder nicht blockieren.
   - Ein unverändertes Probezeit-Ende darf dagegen nicht mehrfach dieselbe Reminder-Stufe erzeugen.

7. **Mitarbeiterdetail und Badge-Verhalten**
   - Im Mitarbeiterprofil unter `/admin/employees/[id]` wird das berechnete Probezeit-Ende als lesbare Information angezeigt.
   - Zusätzlich wird ein Probezeit-Badge **nur solange** angezeigt, wie der Mitarbeiter sich aktuell in Probezeit befindet.
   - Ein dauerhafter zusätzlicher Badge "Probezeit abgelaufen" wird **nicht** eingeführt, um unnötiges UI-Rauschen zu vermeiden.
   - Nach Ablauf der Probezeit entfällt der Badge; das berechnete Enddatum bleibt als Information nachvollziehbar.

8. **Mitarbeiterlisten-Filter**
   - Die Mitarbeiterliste unter `/admin/employees` erhält einen zusätzlichen **serverseitigen** Probezeit-Filter.
   - Der Filter erweitert den bestehenden serverseitigen `employees.list`-Abruf; eine rein clientseitige Nachfilterung ist nicht ausreichend.
   - Die UI bietet mindestens folgende Werte:
     - `Alle`
     - `In Probezeit`
     - `Endet in 30 Tagen`
     - `Probezeit beendet`
   - Die Filterlogik basiert auf dem berechneten Probezeit-Ende und schließt ausgeschiedene Mitarbeiter (`exitDate <= heute`) aus.

9. **Berechtigungen und Datensicht**
   - Benutzer ohne `employees.view` sehen auf `/dashboard` kein Probezeit-Widget.
   - Probezeitinformationen auf Dashboard, Mitarbeiterliste und Mitarbeiterdetail sind nur für Benutzer mit `employees.view` sichtbar.
   - Dabei gilt der bestehende TERP-Datensichtbereich: Benutzer sehen nur Mitarbeiter innerhalb ihres zulässigen Scopes.
   - Die tenantweite Probezeit-Konfiguration unter `/admin/settings` ist nur für Benutzer mit `settings.manage` sichtbar und änderbar.
   - Administratoren behalten den bestehenden Vollzugriff.
   - Die vorhandenen Payroll-spezifischen Rechte `personnel.payroll_data.view` und `personnel.payroll_data.edit` für das Bearbeiten von Vergütungsdaten bleiben unberührt; die neue read-only Probezeit-Anzeige darf nicht unnötig an einen Payroll-Edit-Workflow gekoppelt sein.

10. **Dokumentierbarkeit, Navigation und QA**
    - Das Feature muss so umgesetzt werden, dass es später konsistent in Handbuch, QA und Support beschrieben werden kann.
    - Dafür müssen klare, prüfbare Zielorte bestehen:
      - `/dashboard` für die kompakte Übersicht
      - `/admin/employees` für die filterbare Liste
      - `/admin/employees/[id]` für den Mitarbeiterkontext
      - `/admin/settings` für die tenantweite Konfiguration
      - `/notifications` bzw. Glocke im Header für ausgelöste Erinnerungen
    - Der Benutzerfluss muss nachvollziehbar prüfbar sein:
      - Dashboard-Karte sehen
      - in die gefilterte Liste wechseln
      - Mitarbeiter öffnen
      - Probezeitstatus und Probezeit-Ende prüfen
      - Reminder im Benachrichtigungssystem nachvollziehen

## Test-Anforderungen

### Fachliche Testfälle / Unit-Tests

- **Standardfall 6 Monate**: `entryDate=01.01.2026`, tenantweiter Default `6` -> Probezeit-Ende `01.07.2026`
- **Mitarbeiterwert überschreibt Tenant-Default**: `entryDate=01.03.2026`, `probationMonths=3` -> Probezeit-Ende `01.06.2026`
- **Monatsendefall**: `31.01.2026 + 1 Monat` -> fachlich korrektes Monatsende
- **Schaltjahr**: `29.02.2024 + 12 Monate` -> fachlich korrektes Folge-Datum
- **Probezeit aktiv**: heutiges Datum liegt vor oder auf Probezeit-Ende -> Badge `In Probezeit` aktiv
- **Probezeit abgelaufen**: heutiges Datum liegt nach Probezeit-Ende -> kein Probezeit-Badge mehr
- **Ausgeschiedener Mitarbeiter**: `exitDate <= heute` -> kein Widget-Eintrag, kein Reminder, kein Probezeitfilter-Treffer
- **Dedupe pro berechnetem Enddatum**: derselbe Mitarbeiter mit derselben Reminder-Stufe und demselben berechneten Probezeit-Ende erzeugt keine Doppelmeldung
- **Neues Enddatum nach Stammdatenänderung**: Änderung von `entryDate` oder `probationMonths` führt zu neuem Reminder-Sachverhalt
- **Defensiver Legacy-/Importfall**: Ein technisch inkonsistenter Datensatz ohne `entryDate` wird übersprungen und verursacht keinen Fehler; das ist kein regulärer Business-Fall

### Integrations-Tests

- **Täglicher Reminder-Lauf**: mehrere Mitarbeiter mit unterschiedlichen Probezeit-Enden -> korrekte Reminder-Erzeugung je Stufe
- **Keine Doppel-Reminder**: wiederholter Lauf mit unverändertem Probezeit-Ende erzeugt keine zweite Notification derselben Stufe
- **Stammdatenänderung nach Reminder-Versand**: geändertes Eintrittsdatum oder geänderte Probezeitdauer erzeugt neue Reminder anhand des neuen Enddatums
- **Multi-Tenant-Isolation**: Mandant A sieht und benachrichtigt nur eigene Mitarbeiter
- **Datensichtbereich**: Benutzer sehen im Widget und in Listen nur Mitarbeiter innerhalb ihres bestehenden Scopes
- **Serverseitiger Listenfilter**: `In Probezeit`, `Endet in 30 Tagen`, `Probezeit beendet` liefern korrekte Treffer auf API-Ebene

### Browser-E2E-Tests

- **Dashboard-Widget sichtbar**: Benutzer mit Mitarbeiterzugriff sieht auf `/dashboard` die Probezeit-Karte
- **Dashboard-Widget verborgen**: Benutzer ohne Mitarbeiterzugriff sieht keine Probezeit-Karte
- **Navigation aus dem Widget**: Klick aus der Karte führt in einen nachvollziehbaren Folge-Workflow
- **Mitarbeiterdetail**: Mitarbeiter in Probezeit zeigt Badge `In Probezeit` und berechnetes Probezeit-Ende; nach Ablauf ist nur das Enddatum sichtbar
- **Mitarbeiterliste**: Probezeit-Filter wirkt serverseitig und zeigt nur passende Mitarbeiter
- **Admin-Einstellungen**: `/admin/settings` erlaubt Pflege von Default-Monaten und Reminder-Stufen
- **Benachrichtigungen**: ausgelöste Probezeit-Reminder erscheinen im bestehenden Notification-Posteingang

## Systembezug

| Bereich | Zielort / Einordnung |
|---|---|
| Übersicht | `/dashboard` als bestehendes Dashboard, kein neues HR-Dashboard |
| Arbeitsliste | `/admin/employees` mit serverseitigem Probezeit-Filter |
| Detailkontext | `/admin/employees/[id]` mit read-only Probezeit-Ende und aktivem Probezeit-Badge |
| Tenant-Konfiguration | `/admin/settings` im bestehenden Settings-Kontext |
| Reminder-Sicht | Glocke im Header und `/notifications` |

## Offene Fragen für Pro-Di

- Keine verbleibenden Produktfragen. Reminder-Empfänger folgen der bestehenden Sichtbarkeit von Mitarbeiterdaten innerhalb des TERP-Datensichtbereichs.

## Risiko / Komplexität

**T-Shirt-Größe: M**

- Mehrere bestehende Oberflächen sind betroffen: Dashboard, Mitarbeiterliste, Mitarbeiterdetail, Einstellungen und Notifications.
- Die größte fachliche Sorgfalt liegt in Datumslogik, Deduplizierung und konsistenter Rechte-/Scope-Behandlung.
- Es handelt sich weiterhin um ein klar abgegrenztes HR-Feature ohne Eingriff in Lohnberechnung oder Vertragsautomatik.

## Abhängigkeiten

- Keine fachliche Blocker-Abhängigkeit zu anderen Tickets
- Nutzt bestehende TERP-Bausteine für Mitarbeiterdaten, Dashboard, Notifications und Settings

## Out of Scope

- Workflow für Probezeit-Gespräche, Gesprächsprotokolle oder Entscheidungen zur Weiterbeschäftigung
- E-Mail-Reminder oder externe Versandkanäle
- Automatische Vertragsänderungen nach Probezeit-Ende
- Eigenständiges Feature für Probezeitverlängerungen
- Eigenes separates HR-Dashboard
