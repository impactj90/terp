# MOB_15 — Admin: System & Auswertungen

| Field | Value |
|-------|-------|
| **Module** | Admin / System |
| **Dependencies** | MOB_01, MOB_02, MOB_03 |
| **Complexity** | M |
| **Priority** | Niedrig (reine Admin-Seiten, sehr selten mobil) |
| **New Models** | — |

---

## Ist-Zustand

- Benutzer: `src/app/[locale]/(dashboard)/admin/users/page.tsx`
- Benutzergruppen: `src/app/[locale]/(dashboard)/admin/user-groups/page.tsx`
- Zugriffskontrolle: `src/app/[locale]/(dashboard)/admin/access-control/page.tsx`
- Auswertungen: `src/app/[locale]/(dashboard)/admin/evaluations/page.tsx`
- Monatsauswertungen: `src/app/[locale]/(dashboard)/admin/monthly-evaluations/page.tsx`
- Berichte: `src/app/[locale]/(dashboard)/admin/reports/page.tsx`
- Audit-Logs: `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx`
- Einstellungen: `src/app/[locale]/(dashboard)/admin/settings/page.tsx`
- Mandanten: `src/app/[locale]/(dashboard)/admin/tenants/page.tsx`
- Lohnexporte: `src/app/[locale]/(dashboard)/admin/payroll-exports/page.tsx`
- Export-Schnittstellen: `src/app/[locale]/(dashboard)/admin/export-interfaces/page.tsx`
- Abrechnungskonfiguration: `src/app/[locale]/(dashboard)/admin/billing-config/page.tsx`
- DSGVO: `src/app/[locale]/(dashboard)/admin/dsgvo/page.tsx`
- Design-System: `src/app/[locale]/design-system/page.tsx`

---

## Goal

System-Administrationsseiten grundsaetzlich mobil lesbar. Diese Seiten werden fast nie mobil genutzt, muessen aber bei Bedarf funktionieren (z.B. Audit-Logs bei einem Vorfall pruefen).

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/admin/users` | Benutzerliste | MOB_02 Table-Pattern |
| `/admin/user-groups` | Benutzergruppen | MOB_02 Table-Pattern |
| `/admin/access-control` | Zugriffskontrolle | Responsive Berechtigungsmatrix |
| `/admin/evaluations` | Auswertungen | Responsive Charts |
| `/admin/monthly-evaluations` | Monatsauswertungen | Horizontaler Scroll |
| `/admin/reports` | Berichte | Responsive Layout |
| `/admin/audit-logs` | Audit-Logs | MOB_02 Table-Pattern |
| `/admin/settings` | Einstellungen | Einspaltiges Formular |
| `/admin/tenants` | Mandanten | MOB_02 Table-Pattern |
| `/admin/payroll-exports` | Lohnexporte | MOB_02 Table-Pattern |
| `/admin/export-interfaces` | Export-Schnittstellen | MOB_02 Table-Pattern |
| `/admin/billing-config` | Abrechnungsconfig | Einspaltiges Formular |
| `/admin/dsgvo` | DSGVO | Mobile-Layout |

---

## Aenderungen

### Benutzerliste

- MOB_02 Pattern: Name + E-Mail + Status immer sichtbar
- Rolle, Gruppe, letzter Login ab `md`
- Benutzer-Formular: Fullscreen-Sheet

### Zugriffskontrolle

- Berechtigungsmatrix: auf Mobile als verschachtelte Akkordeons statt Tabelle
- Modul > Berechtigung > Gruppen als hierarchische Liste
- Toggle-Switches fuer Berechtigungen (44px Touch-Targets)

### Auswertungen / Berichte

- Charts: responsive mit recharts ResponsiveContainer
- Tabellen: MOB_02 Pattern
- Filter: einspaltiger auf Mobile

### Monatsauswertungen

- Breite Tabelle: horizontaler Scroll mit Sticky-Spalte (Mitarbeitername)
- Alternative: Mitarbeiter-Cards mit Monatsdaten

### Einstellungen / Abrechnungsconfig

- Einspaltiges Formular-Layout
- Abschnitte als ausklappbare Sektionen
- Save-Button: sticky Footer

### Audit-Logs

- MOB_02 Pattern: Zeitstempel + Benutzer + Aktion immer sichtbar
- Details ab `md`
- Tap oeffnet Detail-Ansicht

### DSGVO

- Formular und Aktionen: einspaltiger
- Loeschprotokoll: kompakte Liste

---

## Acceptance Criteria

- [ ] Alle Listen-Seiten: MOB_02 Table-Pattern
- [ ] Zugriffskontrolle: Akkordeon-basierte Ansicht auf Mobile
- [ ] Auswertungen: Charts responsive
- [ ] Monatsauswertungen: horizontaler Scroll mit Sticky-Spalte
- [ ] Einstellungen: einspaltiges Formular mit Sticky-Footer
- [ ] Audit-Logs: kompakte Mobile-Ansicht
- [ ] Alle Formulare: Fullscreen-Sheet auf Mobile
- [ ] Kein horizontaler Overflow auf 375px (ausser gewollter Scroll)
