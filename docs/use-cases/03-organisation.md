# Phase 3: Organisationsstruktur

## UC-017: Abteilung anlegen

**Seite:** `/admin/departments`
**Aktion:** Abteilung erstellen (z.B. "IT", "Personal", "Vertrieb") mit optionaler Eltern-Abteilung und Abteilungsleiter

**Erwartetes Ergebnis:**
- Neuer Eintrag in `departments`-Tabelle
- `tenant_id` ist gesetzt
- `parent_id` verweist auf uebergeordnete Abteilung (oder NULL fuer Top-Level)
- `manager_employee_id` verweist auf den Abteilungsleiter (optional)

**Pruefpunkte:**
- [ ] Abteilung in `/admin/departments` sichtbar
- [ ] Baumstruktur: `/api/v1/departments/tree` zeigt Hierarchie korrekt an
- [ ] Abteilung ist bei Team-Erstellung als Dropdown waehlbar
- [ ] Abteilung ist bei Mitarbeitern zuweisbar
- [ ] Loeschen einer Abteilung mit Kind-Abteilungen wird verhindert oder kaskadiert

---

## UC-018: Team anlegen

**Seite:** `/admin/teams`
**Aktion:** Team erstellen (z.B. "Backend-Team") und einer Abteilung zuordnen

**Erwartetes Ergebnis:**
- Neuer Eintrag in `teams`-Tabelle
- `department_id` verweist auf die Abteilung
- `leader_employee_id` verweist auf den Teamleiter (optional)

**Pruefpunkte:**
- [ ] Team in `/admin/teams` sichtbar
- [ ] Team ist in der Team-Uebersicht (`/team-overview`) sichtbar (nach Login als Mitglied)
- [ ] Mitglieder koennen dem Team hinzugefuegt/entfernt werden
- [ ] Mitglieder-Rollen (member/leader) sind einstellbar
- [ ] Team-Mitglieder sehen sich gegenseitig in `/team-overview`
