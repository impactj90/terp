# Phase 7: Urlaubskonfiguration (Fortgeschritten)

## UC-046: Urlaubssonderberechnung anlegen

**Seite:** `/admin/vacation-config`
**Aktion:** Sonderberechnung erstellen (z.B. Altersurlaub: Ab 50 Jahre +2 Tage, ab 55 Jahre +4 Tage)

**Erwartetes Ergebnis:**
- Eintrag in `vacation_special_calculations`-Tabelle
- Definiert Bedingungen und zusaetzliche Urlaubstage

**Pruefpunkte:**
- [ ] Sonderberechnung in Vacation-Config sichtbar
- [ ] Beeinflusst die Urlaubsanspruchs-Berechnung bei passenden Mitarbeitern
- [ ] Vorschau-Funktion zeigt welche Mitarbeiter betroffen sind

---

## UC-047: Berechnungsgruppe anlegen

**Seite:** `/admin/vacation-config`
**Aktion:** Berechnungsgruppe erstellen und Sonderberechnungen zuordnen

**Erwartetes Ergebnis:**
- Eintrag in `vacation_calculation_groups`-Tabelle
- Verknuepfung mit Sonderberechnungen

**Pruefpunkte:**
- [ ] Gruppe in Vacation-Config sichtbar
- [ ] Mitarbeiter koennen der Gruppe zugeordnet werden
- [ ] Alle Sonderberechnungen der Gruppe werden angewendet

---

## UC-048: Kappungsregeln definieren

**Seite:** `/admin/vacation-config`
**Aktion:** Kappungsregel erstellen (z.B. max. 5 Uebertragstage, verfallen am 31.03.)

**Erwartetes Ergebnis:**
- Eintrag in `vacation_capping_rules`-Tabelle
- Definiert Obergrenze und Verfallsdatum fuer Urlaubsuebertrag

**Pruefpunkte:**
- [ ] Kappungsregel in Vacation-Config sichtbar
- [ ] Beeinflusst den Urlaubsuebertrag bei Jahreswechsel
- [ ] Uebertrag wird auf Maximum gekappt

---

## UC-049: Mitarbeiter-Ausnahmen pflegen

**Seite:** `/admin/vacation-config`
**Aktion:** Ausnahme fuer bestimmten Mitarbeiter erstellen (z.B. hoeherer Uebertrag erlaubt)

**Erwartetes Ergebnis:**
- Eintrag in `employee_capping_exceptions`-Tabelle
- Ueberschreibt die Standard-Kappungsregel fuer diesen Mitarbeiter

**Pruefpunkte:**
- [ ] Ausnahme in Vacation-Config sichtbar
- [ ] Mitarbeiter bekommt individuellen Uebertragswert

---

## UC-050: Urlaubsuebertrag-Vorschau

**Seite:** `/admin/vacation-config`
**Aktion:** Vorschau generieren fuer den Urlaubsuebertrag ins naechste Jahr

**Erwartetes Ergebnis:**
- Berechnung: Fuer jeden Mitarbeiter Rest-Urlaub, Kappung angewendet, Ergebnis als Uebertrag

**Pruefpunkte:**
- [ ] Vorschau zeigt pro Mitarbeiter: Resturlaub, Kappung, finaler Uebertrag
- [ ] Kappungsregeln und Ausnahmen werden korrekt angewendet
- [ ] Vorschau veraendert keine Daten (nur Simulation)
