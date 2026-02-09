# Phase 5: Taeglicher Betrieb (Mitarbeiter-Sicht)

> Voraussetzung: Eingeloggt als Benutzer mit verknuepftem Mitarbeiter, Tarif und Urlaubssaldo.

## UC-027: Dashboard pruefen

**Seite:** `/dashboard`
**Aktion:** Dashboard aufrufen nach Login

**Erwartetes Ergebnis:**
- Tageskarte: Heutiges Datum, Soll-Stunden aus Tagesplan, ggf. aktuelle Buchung
- Flexzeitkarte: Aktueller Flexzeit-Saldo aus Monatswert
- Urlaubskarte: Restanspruch aus `vacation_balances` (Anspruch + Uebertrag + Anpassungen - Genommen)
- Quick-Actions: Kommen/Gehen-Buttons

**Pruefpunkte:**
- [ ] Alle Karten laden ohne Fehler
- [ ] Soll-Stunden stimmen mit dem Tagesplan ueberein
- [ ] Urlaubssaldo stimmt mit `/admin/vacation-balances` ueberein
- [ ] Ohne Buchungen heute: Kein Fehler, "Noch nicht gestempelt" o.ae.

---

## UC-028: Kommen buchen (Stempeluhr)

**Seite:** `/time-clock`
**Aktion:** "Kommen"-Button druecken

**Erwartetes Ergebnis:**
- Neuer Eintrag in `bookings`-Tabelle
- `employee_id` = verknuepfter Mitarbeiter
- `booking_type_id` = Kommen-Buchungsart (direction: in)
- `booking_date` = heute
- `original_time` = aktuelle Uhrzeit
- `source = 'web'`

**Pruefpunkte:**
- [ ] Buchung in `/timesheet` sichtbar (heutiger Tag)
- [ ] Stempeluhr zeigt Timer an (Arbeitszeit laeuft)
- [ ] Dashboard-Tageskarte aktualisiert sich
- [ ] Doppeltes Kommen ohne Gehen: App verhindert es oder warnt

---

## UC-029: Gehen buchen (Stempeluhr)

**Seite:** `/time-clock`
**Aktion:** "Gehen"-Button druecken (nach vorherigem Kommen)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `bookings`-Tabelle mit Gehen-Buchungsart (direction: out)
- `pair_id` verknuepft Kommen und Gehen als Paar
- Timer in der Stempeluhr stoppt

**Pruefpunkte:**
- [ ] Buchungspaar in `/timesheet` sichtbar (Kommen + Gehen)
- [ ] Timer in Stempeluhr zeigt gestoppte Zeit
- [ ] Tagesberechnung kann ausgeloest werden (UC-042)

---

## UC-030: Buchungen im Kalender ansehen

**Seite:** `/timesheet`
**Aktion:** Wochenansicht/Tagesansicht der eigenen Buchungen

**Erwartetes Ergebnis:**
- Alle Buchungen des Mitarbeiters fuer den gewaehlten Zeitraum
- Buchungen zeigen Uhrzeit, Typ (Kommen/Gehen), Quelle

**Pruefpunkte:**
- [ ] Buchungen der letzten Tage sichtbar
- [ ] Navigation zwischen Wochen/Tagen funktioniert
- [ ] Buchungen sind editierbar (wenn Berechtigung vorhanden)

---

## UC-031: Buchung manuell erstellen

**Seite:** `/timesheet`
**Aktion:** Fehlende Buchung nachtragen (z.B. vergessenes Gehen gestern)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `bookings`-Tabelle
- `source = 'web'` (oder 'manual')
- `edited_time` kann von `original_time` abweichen

**Pruefpunkte:**
- [ ] Buchung erscheint im Timesheet am korrekten Tag
- [ ] Audit-Log-Eintrag wird erstellt (wer hat wann was geaendert)
- [ ] Tageswert kann danach neu berechnet werden

---

## UC-032: Abwesenheit beantragen

**Seite:** `/absences`
**Aktion:** Urlaub fuer einen Zeitraum beantragen (z.B. 3 Tage)

**Erwartetes Ergebnis:**
- Eintraege in `absence_days`-Tabelle fuer jeden Tag im Zeitraum
- `status = 'pending'` (wartend auf Genehmigung)
- `absence_type_id` verweist auf die gewaehlte Abwesenheitsart
- `employee_id` = verknuepfter Mitarbeiter

**Pruefpunkte:**
- [ ] Abwesenheit in `/absences` sichtbar mit Status "Beantragt"
- [ ] Abwesenheit erscheint in `/admin/approvals` zur Genehmigung (UC-039)
- [ ] Urlaubssaldo wird noch NICHT reduziert (erst nach Genehmigung)
- [ ] Wochenenden/Feiertage im Zeitraum werden uebersprungen (oder je nach Config)
- [ ] Stornierung der Abwesenheit moeglich solange Status "pending"

---

## UC-033: Urlaubssaldo pruefen

**Seite:** `/vacation`
**Aktion:** Urlaubsuebersicht aufrufen

**Erwartetes Ergebnis:**
- Anzeige: Anspruch, Uebertrag, Anpassungen, Genommen, Rest
- Berechnung: Rest = Anspruch + Uebertrag + Anpassungen - Genommen

**Pruefpunkte:**
- [ ] Zahlen stimmen mit `/admin/vacation-balances` ueberein
- [ ] "Genommen" zaehlt nur genehmigte Abwesenheiten mit `deducts_vacation = true`
- [ ] Kalenderansicht zeigt Urlaubs- und Abwesenheitstage farblich

---

## UC-034: Monatsauswertung ansehen

**Seite:** `/monthly-evaluation`
**Aktion:** Aktuellen oder vergangenen Monat anzeigen

**Erwartetes Ergebnis:**
- Monatsuebersicht mit: Soll-Stunden, Ist-Stunden, Ueberstunden, Fehlzeiten
- Tagesdetails: Jeder Tag mit Soll, Ist, Differenz, Fehler-Flags

**Pruefpunkte:**
- [ ] Monatswerte werden aus `monthly_values`-Tabelle geladen
- [ ] Falls kein Monatswert existiert: On-the-fly-Berechnung aus Tageswerten
- [ ] Navigation zwischen Monaten funktioniert
- [ ] Tage mit Fehlern sind markiert (z.B. fehlende Buchung)

---

## UC-035: Jahresuebersicht pruefen

**Seite:** `/year-overview`
**Aktion:** Jahresuebersicht aufrufen

**Erwartetes Ergebnis:**
- 12 Monate im Ueberblick mit Soll, Ist, Differenz pro Monat
- Jahressummen

**Pruefpunkte:**
- [ ] Alle 12 Monate werden angezeigt
- [ ] Monate ohne Daten zeigen Nullwerte oder "Keine Daten"
- [ ] Flexzeitverlauf ueber das Jahr sichtbar

---

## UC-036: Team-Uebersicht

**Seite:** `/team-overview`
**Aktion:** Team-Uebersicht aufrufen

**Erwartetes Ergebnis:**
- Liste der Team-Mitglieder mit aktuellem Status (anwesend/abwesend/Urlaub)
- Basiert auf heutigen Buchungen und Abwesenheiten

**Pruefpunkte:**
- [ ] Nur Mitglieder des eigenen Teams sichtbar
- [ ] Status wird korrekt angezeigt (Kommen-Buchung ohne Gehen = anwesend)
- [ ] Anstehende Abwesenheiten der Kollegen sichtbar

---

## UC-037: Benachrichtigungen

**Seite:** `/notifications`
**Aktion:** Benachrichtigungen aufrufen

**Pruefpunkte:**
- [ ] Benachrichtigungen ueber genehmigte/abgelehnte Abwesenheiten
- [ ] Einzeln oder alle als gelesen markieren
- [ ] Echtzeit-Updates via SSE-Stream

---

## UC-038: Profil bearbeiten und Passwort aendern

**Seite:** `/profile`
**Aktion:** Anzeigename aendern, Passwort aendern

**Erwartetes Ergebnis:**
- `display_name` in `users`-Tabelle aktualisiert
- `password_hash` in `users`-Tabelle aktualisiert (neuer bcrypt-Hash)
- Benachrichtigung "Profil aktualisiert" wird erstellt

**Pruefpunkte:**
- [ ] Neuer Anzeigename in der Sidebar/Header sichtbar
- [ ] Passwort-Aenderung erfordert altes Passwort (als normaler User)
- [ ] Login mit neuem Passwort funktioniert
- [ ] Login mit altem Passwort schlaegt fehl
