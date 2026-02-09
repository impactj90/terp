# Phase 10: Zutrittskontrolle & Terminals

## UC-059: Zutrittszonen anlegen

**Seite:** `/admin/access-control` (Tab: Zonen)
**Aktion:** Zutrittszone erstellen (z.B. "Hauptgebaeude", "Serverraum", "Parkhaus")

**Erwartetes Ergebnis:**
- Neuer Eintrag in `access_zones`-Tabelle

**Pruefpunkte:**
- [ ] Zone in der Access-Control-UI sichtbar
- [ ] Zone ist bei Profil-Erstellung als Berechtigung waehlbar

---

## UC-060: Zutrittsprofil erstellen

**Seite:** `/admin/access-control` (Tab: Profile)
**Aktion:** Zutrittsprofil erstellen (z.B. "Standard-Mitarbeiter") und Zonen zuordnen

**Erwartetes Ergebnis:**
- Neuer Eintrag in `access_profiles`-Tabelle
- Verknuepfung mit erlaubten Zonen

**Pruefpunkte:**
- [ ] Profil in der Access-Control-UI sichtbar
- [ ] Zugeordnete Zonen sind aufgelistet
- [ ] Profil ist bei Mitarbeiter-Zuweisung waehlbar

---

## UC-061: Mitarbeiter Zutrittsprofil zuweisen

**Seite:** `/admin/access-control` (Tab: Zuweisungen)
**Aktion:** Mitarbeiter ein Zutrittsprofil zuweisen (mit Gueltigkeitszeitraum)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `employee_access_assignments`-Tabelle
- `employee_id`, `access_profile_id`, `valid_from`, `valid_to`

**Pruefpunkte:**
- [ ] Zuweisung in der Access-Control-UI sichtbar
- [ ] Mitarbeiter hat Zugang zu den Zonen des Profils
- [ ] Abgelaufene Zuweisungen werden als inaktiv angezeigt

---

## UC-062: Terminal-Buchungen importieren

**Seite:** `/admin/terminal-bookings`
**Aktion:** Buchungen von Hardware-Terminals (Stempeluhren) importieren

**Erwartetes Ergebnis:**
- Import-Batch in `import_batches`-Tabelle
- Terminal-Buchungen in `terminal_bookings`-Tabelle
- Zuordnung zu Mitarbeitern ueber Kartennummer

**Pruefpunkte:**
- [ ] Import-Batch in der Terminal-Buchungen-UI sichtbar
- [ ] Einzelne Buchungen des Batches einsehbar
- [ ] Buchungen werden Mitarbeitern zugeordnet (ueber `employee_cards`)
- [ ] Nicht zuordenbare Buchungen werden als Fehler markiert
