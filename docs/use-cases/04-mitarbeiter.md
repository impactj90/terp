# Phase 4: Mitarbeiter

## UC-019: Mitarbeiter anlegen

**Seite:** `/admin/employees`
**Aktion:** Mitarbeiter erstellen (Personalnummer, Vorname, Nachname, Email, Eintrittsdatum, Wochenstunden)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `employees`-Tabelle
- `tenant_id` ist gesetzt
- `personnel_number` ist eindeutig pro Tenant
- `is_active = true` standardmaessig

**Pruefpunkte:**
- [ ] Mitarbeiter in `/admin/employees` sichtbar (Liste mit Suche/Filter)
- [ ] Mitarbeiter-Detail-Seite (`/admin/employees/{id}`) zeigt alle Stammdaten
- [ ] Mitarbeiter ist in Team-Zuweisungen waehlbar
- [ ] Mitarbeiter ist bei Benutzer-Verknuepfung waehlbar
- [ ] Duplikat-Personalnummer wird abgelehnt

---

## UC-020: Kontakte zum Mitarbeiter hinzufuegen

**Seite:** `/admin/employees/{id}`
**Aktion:** Kontakt hinzufuegen (z.B. private Email, Notfallkontakt-Telefon)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `employee_contacts`-Tabelle
- Verknuepft mit `employee_id` und `contact_kind_id`

**Pruefpunkte:**
- [ ] Kontakt in der Mitarbeiter-Detail-Seite unter "Kontakte" sichtbar
- [ ] Mehrere Kontakte pro Mitarbeiter moeglich
- [ ] Kontakt loeschbar
- [ ] Kontaktart-Dropdown zeigt die in UC-008 angelegten Kontaktarten

---

## UC-021: Zutrittskarte zuweisen

**Seite:** `/admin/employees/{id}`
**Aktion:** Zutrittskarte (Kartennummer) dem Mitarbeiter zuweisen

**Erwartetes Ergebnis:**
- Neuer Eintrag in `employee_cards`-Tabelle
- Karte ist dem Mitarbeiter zugeordnet

**Pruefpunkte:**
- [ ] Karte in der Mitarbeiter-Detail-Seite unter "Karten" sichtbar
- [ ] Karte kann deaktiviert werden
- [ ] Kartennummer ist eindeutig

---

## UC-022: Tarif dem Mitarbeiter zuweisen

**Seite:** `/admin/employees/{id}`
**Aktion:** Tarif-Zuweisung erstellen (Tarif, Gueltig-ab, optional Gueltig-bis)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `employee_tariff_assignments`-Tabelle
- `employee_id`, `tariff_id`, `valid_from`, `valid_to`
- `/api/v1/employees/{id}/effective-tariff` liefert den aktuell gueltigen Tarif

**Pruefpunkte:**
- [ ] Tarif-Zuweisung in der Mitarbeiter-Detail-Seite sichtbar
- [ ] Effektiver Tarif ueber API abrufbar
- [ ] Bei mehreren Zuweisungen: der mit dem neuesten `valid_from` (und noch gueltig) gewinnt
- [ ] Tarif beeinflusst Tagesplan-Generierung und Tagesberechnung
- [ ] Aenderung des Tarifs ab einem Datum fuehrt zu neuer Zuweisung (alte bleibt bestehen)

---

## UC-023: Mitarbeiter einem Team zuweisen

**Seite:** `/admin/teams`
**Aktion:** Mitarbeiter als Mitglied zum Team hinzufuegen

**Erwartetes Ergebnis:**
- Neuer Eintrag in `team_members`-Tabelle
- `team_id`, `employee_id`, `role` (member/leader)

**Pruefpunkte:**
- [ ] Mitarbeiter erscheint in der Team-Detail-Ansicht
- [ ] Wenn der Mitarbeiter einen Benutzer-Account hat und eingeloggt ist:
  - Team-Uebersicht (`/team-overview`) zeigt andere Teammitglieder
  - Team-Mitglieder sehen Anwesenheitsstatus gegenseitig

---

## UC-024: Benutzer mit Mitarbeiter verknuepfen

**Seite:** `/admin/users`
**Aktion:** Bestehenden Benutzer bearbeiten und Mitarbeiter-Dropdown waehlen

**Erwartetes Ergebnis:**
- `employee_id` in der `users`-Tabelle wird gesetzt
- Benutzer kann ab jetzt eigene Zeitdaten sehen

**Pruefpunkte:**
- [ ] `employee_id` ist NICHT NULL in der `users`-Tabelle
- [ ] Nach Login als dieser Benutzer:
  - Dashboard (`/dashboard`) zeigt Tagesdaten des verknuepften Mitarbeiters
  - Stempeluhr (`/time-clock`) bucht fuer den verknuepften Mitarbeiter
  - Zeiterfassung (`/timesheet`) zeigt Buchungen des Mitarbeiters
  - Monatsauswertung (`/monthly-evaluation`) zeigt Monatsdaten
  - Jahresuebersicht (`/year-overview`) zeigt Jahresdaten
  - Urlaubssaldo (`/vacation`) zeigt den Saldo des Mitarbeiters
- [ ] Ohne `employee_id`: Dashboard zeigt "Kein Mitarbeiter verknuepft" o.ae.

---

## UC-025: Urlaubssaldo initialisieren

**Seite:** `/admin/vacation-balances`
**Aktion:** Urlaubssaldo fuer Mitarbeiter und Jahr erstellen (Anspruch, Uebertrag, Anpassungen)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `vacation_balances`-Tabelle
- `employee_id`, `year`, `entitlement` (Anspruch), `carryover` (Uebertrag), `adjustments`, `taken` (genommen)

**Pruefpunkte:**
- [ ] Urlaubssaldo in `/admin/vacation-balances` sichtbar
- [ ] Nach Login als verknuepfter Benutzer:
  - Dashboard-Urlaubskarte zeigt Restanspruch
  - `/vacation` zeigt detaillierten Saldo (Anspruch - Genommen = Rest)
- [ ] `taken` wird automatisch hochgezaehlt wenn Urlaub genehmigt wird (UC-039)
- [ ] Ohne Urlaubssaldo: "Vacation balance not found"-Fehler im Dashboard

---

## UC-026: Tagesplaene fuer Mitarbeiter generieren

**Seite:** `/admin/employees` (Bulk-Aktion oder Detail-Seite)
**Aktion:** Tagesplaene aus dem zugewiesenen Tarif/Wochenplan generieren fuer einen Zeitraum

**Erwartetes Ergebnis:**
- Eintraege in `employee_day_plans`-Tabelle
- Fuer jeden Arbeitstag im Zeitraum ein Eintrag mit `employee_id`, `plan_date`, `day_plan_id`
- `source = 'tariff'` (generiert aus Tarif)

**Pruefpunkte:**
- [ ] Generierte Tagesplaene in der Evaluations-Ansicht sichtbar
- [ ] Feiertage werden beruecksichtigt (kein Tagesplan an Feiertagen, oder spezieller Plan)
- [ ] Wochenplan wird korrekt auf Mo-So gemappt
- [ ] Tagesplaene beeinflussen die Soll-Berechnung bei Tageswert-Berechnung
- [ ] Individuelle Ueberschreibungen (manuell gesetzter Tagesplan) bleiben erhalten
