# Phase 8: Schichtplanung & Automatisierung

## UC-051: Schichten anlegen und zuweisen

**Seite:** `/admin/shift-planning`
**Aktion:** Schicht erstellen (z.B. "Fruehschicht 06:00-14:00") und Mitarbeitern zuweisen

**Erwartetes Ergebnis:**
- Eintrag in `shifts`-Tabelle
- Zuweisungen verknuepfen Mitarbeiter mit Schichten fuer bestimmte Tage

**Pruefpunkte:**
- [ ] Schicht in `/admin/shift-planning` sichtbar (Planungstafel)
- [ ] Mitarbeiter-Zuweisung per Drag&Drop oder Dialog
- [ ] Schichtplan beeinflusst den Tagesplan des Mitarbeiters
- [ ] Loeschen einer Zuweisung fuer einen Zeitraum moeglich

---

## UC-052: Makro erstellen

**Seite:** `/admin/macros`
**Aktion:** Makro anlegen (z.B. "Kommen 08:00 + Gehen 16:30" als Buchungsvorlage)

**Erwartetes Ergebnis:**
- Eintrag in `macros`-Tabelle
- Makro definiert eine Reihe von Buchungen die automatisch erstellt werden

**Pruefpunkte:**
- [ ] Makro in `/admin/macros` sichtbar
- [ ] Makro-Detail-Seite zeigt die definierten Buchungsvorlagen

---

## UC-053: Makro zuweisen und ausfuehren

**Seite:** `/admin/macros/{id}`
**Aktion:** Makro einem Mitarbeiter/Gruppe zuweisen und ausfuehren

**Erwartetes Ergebnis bei Ausfuehrung:**
- Buchungen werden automatisch in `bookings`-Tabelle erstellt
- `source` der Buchungen zeigt Makro-Herkunft
- Ausfuehrungsprotokoll in `macro_executions`

**Pruefpunkte:**
- [ ] Zuweisung in der Makro-Detail-Seite sichtbar
- [ ] Nach Ausfuehrung: Buchungen in `/timesheet` des Mitarbeiters sichtbar
- [ ] Ausfuehrungshistorie mit Ergebnis (Erfolg/Fehler) einsehbar
- [ ] Fehlschlag bei Konflikten (z.B. bereits vorhandene Buchung)

---

## UC-054: Zeitplan (Schedule) erstellen

**Seite:** `/admin/schedules`
**Aktion:** Zeitplan anlegen mit Tasks (z.B. "Taeglich 02:00 Uhr: Tageswerte berechnen")

**Erwartetes Ergebnis:**
- Eintrag in `schedules`-Tabelle
- Tasks in `schedule_tasks`-Tabelle definieren was ausgefuehrt wird

**Pruefpunkte:**
- [ ] Zeitplan in `/admin/schedules` sichtbar
- [ ] Tasks aus dem Aufgabenkatalog (`/scheduler/task-catalog`) waehlbar
- [ ] Detail-Seite zeigt alle Tasks und Ausfuehrungshistorie

---

## UC-055: Zeitplan manuell ausfuehren

**Seite:** `/admin/schedules/{id}`
**Aktion:** Zeitplan manuell triggern (statt auf Cron zu warten)

**Erwartetes Ergebnis:**
- Ausfuehrung startet alle Tasks des Zeitplans
- Eintrag in `schedule_executions` mit Status und Dauer

**Pruefpunkte:**
- [ ] Ausfuehrung in der Ausfuehrungshistorie sichtbar
- [ ] Jeder Task hat eigenen Status (success/failure)
- [ ] Bei Fehlern: Fehlermeldung im Ausfuehrungsprotokoll
- [ ] Berechnete Werte (Tageswerte etc.) sind nach Ausfuehrung aktualisiert
