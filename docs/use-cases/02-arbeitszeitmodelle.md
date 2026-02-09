# Phase 2: Arbeitszeitmodelle

## UC-012: Tagesplan erstellen

**Seite:** `/admin/day-plans`
**Aktion:** Tagesplan anlegen (z.B. "Normalarbeitstag 8h": Kommen 07:00-09:00, Gehen 16:00-18:00, Soll 8h)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `day_plans`-Tabelle
- Felder: `code`, `name`, `plan_type`, `come_from/to`, `go_from/to`, `regular_hours`
- `tenant_id` ist gesetzt
- Optional: Pausenregeln als Kind-Eintraege in `day_plan_breaks`

**Pruefpunkte:**
- [ ] Tagesplan in `/admin/day-plans` sichtbar
- [ ] Kopieren eines Tagesplans erstellt eine unabhaengige Kopie
- [ ] Pausenregeln koennen hinzugefuegt/entfernt werden
- [ ] Tagesplan ist im Wochenplan-Dropdown waehlbar
- [ ] Bei Tagesberechnung: `regular_hours` bestimmt die Soll-Zeit

---

## UC-013: Wochenplan erstellen

**Seite:** `/admin/week-plans`
**Aktion:** Wochenplan anlegen (z.B. "Standard 40h-Woche": Mo-Fr Normalarbeitstag, Sa-So frei)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `week_plans`-Tabelle
- `monday_day_plan_id` bis `sunday_day_plan_id` verweisen auf Tagesplaene
- Freie Tage: `day_plan_id = NULL` oder Tagesplan mit 0h

**Pruefpunkte:**
- [ ] Wochenplan in `/admin/week-plans` sichtbar
- [ ] Alle 7 Wochentage sind konfiguriert
- [ ] Wochenplan ist im Tarif-Dropdown waehlbar
- [ ] Aenderung am Wochenplan wirkt sich auf zukuenftige Tagesplan-Generierung aus

---

## UC-014: Tarif erstellen

**Seite:** `/admin/tariffs`
**Aktion:** Tarif anlegen (z.B. "Vollzeit 40h": Wochenplan, 30 Urlaubstage, Flexzeit-Grenzen)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `tariffs`-Tabelle
- Verknuepfung: `week_plan_id` zeigt auf den Wochenplan
- Felder: `annual_vacation_days`, `work_days_per_week`, `daily_target_hours`, `weekly_target_hours`
- Flexzeit: `max_flextime_per_month`, `upper_limit_annual`, `lower_limit_annual`
- Optional: Pausenregeln als Kind-Eintraege in `tariff_breaks`

**Pruefpunkte:**
- [ ] Tarif in `/admin/tariffs` sichtbar
- [ ] Pausenregeln koennen am Tarif definiert werden
- [ ] Tarif ist bei der Mitarbeiter-Tarif-Zuweisung waehlbar
- [ ] `annual_vacation_days` beeinflusst spaeter die Urlaubssaldo-Initialisierung
- [ ] `daily_target_hours` beeinflusst spaeter die Soll-Berechnung pro Tag

---

## UC-015: Konten anlegen

**Seite:** `/admin/accounts`
**Aktion:** Zeitkonten erstellen (z.B. "Flexzeit", "Ueberstunden", "Krankheitsstunden")

**Erwartetes Ergebnis:**
- Eintraege in `accounts`-Tabelle
- Felder: `code`, `name`, `account_type`, `unit` (hours/days)
- System-Konten sind nicht loeschbar

**Pruefpunkte:**
- [ ] Konten in `/admin/accounts` sichtbar
- [ ] Konten-Nutzung zeigt welche Berechnungsregeln/Export-Schnittstellen das Konto verwenden
- [ ] Konten erscheinen in der Tages-/Monatsberechnung
- [ ] Konten sind in Export-Schnittstellen zuweisbar

---

## UC-016: Berechnungsregeln pruefen

**Seite:** `/admin/calculation-rules`
**Aktion:** Berechnungsregeln pruefen und ggf. anpassen

**Erwartetes Ergebnis:**
- Regeln definieren wie Tages- und Monatswerte berechnet werden
- Verknuepfung zu Konten

**Pruefpunkte:**
- [ ] Berechnungsregeln in `/admin/calculation-rules` sichtbar
- [ ] Aenderung an Regeln wirkt sich auf zukuenftige Berechnungen aus
