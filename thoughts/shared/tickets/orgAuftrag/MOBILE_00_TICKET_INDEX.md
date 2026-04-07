# Ticket-Index: Mobile-First Responsive Redesign

_Erstellt: 2026-03-31_
_Quelle: Frontend Audit — Mobile Readiness_

## Status-Legende

- `[ ]` — Offen (nicht begonnen)
- `[~]` — In Arbeit
- `[x]` — Erledigt

---

## Foundation

- [ ] **MOB_01** — Layout Foundation & Viewport _(M)_ → `MOBILE_01_LAYOUT_FOUNDATION.md`
- [ ] **MOB_02** — Data Table Responsive Pattern _(L)_ → `MOBILE_02_DATA_TABLE_PATTERN.md`
- [ ] **MOB_03** — Form & Dialog Pattern _(M)_ → `MOBILE_03_FORM_DIALOG_PATTERN.md`

## Core Pages

- [ ] **MOB_04** — Login & Auth _(S)_ → `MOBILE_04_AUTH.md`
- [ ] **MOB_05** — Dashboard _(M)_ → `MOBILE_05_DASHBOARD.md`
- [ ] **MOB_06** — Zeiterfassung (Timesheet, Stechuhr, Teamübersicht) _(L)_ → `MOBILE_06_TIME_TRACKING.md`
- [ ] **MOB_07** — Abwesenheiten, Urlaub, Monatsauswertung, Jahresübersicht _(M)_ → `MOBILE_07_ABSENCES_VACATION.md`
- [ ] **MOB_08** — Profil, Benachrichtigungen, Hilfe _(S)_ → `MOBILE_08_PROFILE_NOTIFICATIONS.md`

## Module Pages

- [ ] **MOB_09** — CRM: Adressen, Anfragen, Aufgaben, Auswertungen _(L)_ → `MOBILE_09_CRM.md`
- [ ] **MOB_10** — Billing: Belege, Kundendienst, Offene Posten, Preislisten, Wiederkehrend _(L)_ → `MOBILE_10_BILLING.md`
- [ ] **MOB_11** — Warehouse: Artikel, Einkauf, Wareneingang, Lager, Scanner _(L)_ → `MOBILE_11_WAREHOUSE.md`
- [ ] **MOB_12** — HR: Personalakte _(S)_ → `MOBILE_12_HR.md`

## Admin Pages

- [ ] **MOB_13** — Admin: Mitarbeiterverwaltung _(M)_ → `MOBILE_13_ADMIN_EMPLOYEES.md`
- [ ] **MOB_14** — Admin: Zeitkonfiguration _(M)_ → `MOBILE_14_ADMIN_TIME_CONFIG.md`
- [ ] **MOB_15** — Admin: System & Auswertungen _(M)_ → `MOBILE_15_ADMIN_SYSTEM.md`

---

## Aufwand-Zusammenfassung

| Groesse          | Anzahl | Tickets                                            |
| --------------- | ------ | -------------------------------------------------- |
| **S** (Klein)   | 3      | MOB_04, MOB_08, MOB_12                             |
| **M** (Mittel)  | 6      | MOB_01, MOB_03, MOB_05, MOB_07, MOB_13, MOB_14, MOB_15 |
| **L** (Gross)   | 4      | MOB_02, MOB_06, MOB_09, MOB_10, MOB_11            |

---

## Empfohlene Reihenfolge

1. **MOB_01** — Layout Foundation (Viewport, CSS-Variablen, Touch-Targets) — Grundlage fuer alles
2. **MOB_02** — Data Table Pattern (wiederverwendbar fuer alle Listenansichten)
3. **MOB_03** — Form & Dialog Pattern (wiederverwendbar fuer alle Formulare)
4. **MOB_04** — Login (schneller Win, erster Eindruck)
5. **MOB_05** — Dashboard (Hauptseite, hohe Sichtbarkeit)
6. **MOB_06** — Zeiterfassung (taegliche Nutzung, hoeechste Prioritaet fuer Mitarbeiter)
7. **MOB_07** — Abwesenheiten & Urlaub (regelmaessige Nutzung)
8. **MOB_08** — Profil & Benachrichtigungen (schneller Win)
9. **MOB_09** — CRM (Aussendienst-Relevanz)
10. **MOB_10** — Billing (Belegverwaltung unterwegs)
11. **MOB_11** — Warehouse (Lagermitarbeiter mit Tablets)
12. **MOB_12** — HR Personalakte
13. **MOB_13** — Admin Mitarbeiter (seltener mobil genutzt)
14. **MOB_14** — Admin Zeitkonfiguration (selten mobil)
15. **MOB_15** — Admin System (nur fuer Admins, selten mobil)

---

## Dependencies

```
MOB_01 (Foundation)
  |
  +---> MOB_02 (Data Table) --+
  |                            |
  +---> MOB_03 (Form/Dialog) --+---> MOB_04..MOB_15 (alle Seiten)
```

MOB_01, MOB_02, MOB_03 sind Foundation-Tickets und muessen vor den Seiten-Tickets abgeschlossen sein. Die Seiten-Tickets (MOB_04–MOB_15) koennen danach parallel bearbeitet werden.
