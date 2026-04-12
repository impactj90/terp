# MOB_14 — Admin: Zeitkonfiguration

| Field | Value |
|-------|-------|
| **Module** | Admin / Time |
| **Dependencies** | MOB_01, MOB_02, MOB_03 |
| **Complexity** | M |
| **Priority** | Niedrig (Konfiguration selten mobil) |
| **New Models** | — |

---

## Ist-Zustand

- Tagesprogramme: `src/app/[locale]/(dashboard)/admin/day-plans/page.tsx`
- Wochenprogramme: `src/app/[locale]/(dashboard)/admin/week-plans/page.tsx`
- Tarife: `src/app/[locale]/(dashboard)/admin/tariffs/page.tsx`
- Feiertage: `src/app/[locale]/(dashboard)/admin/holidays/page.tsx`
- Abwesenheitsarten: `src/app/[locale]/(dashboard)/admin/absence-types/page.tsx`
- Buchungsarten: `src/app/[locale]/(dashboard)/admin/booking-types/page.tsx`
- Kontaktarten: `src/app/[locale]/(dashboard)/admin/contact-types/page.tsx`
- Berechnungsregeln: `src/app/[locale]/(dashboard)/admin/calculation-rules/page.tsx`
- Konten: `src/app/[locale]/(dashboard)/admin/accounts/page.tsx`
- Konten-Buchungen: `src/app/[locale]/(dashboard)/admin/accounts/[id]/postings/page.tsx`
- Korrekturassistent: `src/app/[locale]/(dashboard)/admin/correction-assistant/page.tsx`
- Monatswerte: `src/app/[locale]/(dashboard)/admin/monthly-values/page.tsx`
- Urlaubssalden: `src/app/[locale]/(dashboard)/admin/vacation-balances/page.tsx`
- Urlaubskonfiguration: `src/app/[locale]/(dashboard)/admin/vacation-config/page.tsx`
- Auftraege: `src/app/[locale]/(dashboard)/admin/orders/page.tsx` + Detail
- Zeitplaene: `src/app/[locale]/(dashboard)/admin/schedules/page.tsx` + Detail
- Makros: `src/app/[locale]/(dashboard)/admin/macros/page.tsx` + Detail
- Terminal-Buchungen: `src/app/[locale]/(dashboard)/admin/terminal-bookings/page.tsx`

---

## Goal

Zeitkonfigurations-Seiten grundsaetzlich mobil lesbar und navigierbar. Bearbeitung bleibt Desktop-primaer, aber Einsicht und einfache Aenderungen sollen mobil moeglich sein.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/admin/day-plans` | Tagesprogramme | MOB_02 Table-Pattern |
| `/admin/week-plans` | Wochenprogramme | MOB_02 Table-Pattern |
| `/admin/tariffs` | Tarife | MOB_02 Table-Pattern |
| `/admin/holidays` | Feiertage | MOB_02 Table-Pattern |
| `/admin/absence-types` | Abwesenheitsarten | MOB_02 Table-Pattern |
| `/admin/booking-types` | Buchungsarten | MOB_02 Table-Pattern |
| `/admin/contact-types` | Kontaktarten | MOB_02 Table-Pattern |
| `/admin/calculation-rules` | Berechnungsregeln | MOB_02 Table-Pattern |
| `/admin/accounts` | Konten | MOB_02 Table-Pattern |
| `/admin/accounts/[id]/postings` | Kontobuchungen | MOB_02 Table-Pattern |
| `/admin/correction-assistant` | Korrekturassistent | Mobile-Formular |
| `/admin/monthly-values` | Monatswerte | Horizontaler Scroll |
| `/admin/vacation-balances` | Urlaubssalden | MOB_02 Table-Pattern |
| `/admin/vacation-config` | Urlaubsconfig | Mobile-Formular |
| `/admin/orders` | Auftraege | MOB_02 Table-Pattern |
| `/admin/orders/[id]` | Auftrags-Detail | Responsive Detail |
| `/admin/schedules` | Zeitplaene | MOB_02 Table-Pattern |
| `/admin/schedules/[id]` | Zeitplan-Detail | Responsive Detail |
| `/admin/macros` | Makros | MOB_02 Table-Pattern |
| `/admin/macros/[id]` | Makro-Detail | Responsive Detail |
| `/admin/terminal-bookings` | Terminal-Buchungen | MOB_02 Table-Pattern |

---

## Aenderungen

### Alle Listen-Seiten

- MOB_02 Data Table Pattern anwenden
- Primaer-Spalten identifizieren (Name/Bezeichnung immer sichtbar)
- Sekundaere Spalten ab `md` oder `lg`

### Detail-Seiten (Auftraege, Zeitplaene, Makros)

- MOB_03 Pattern: Tabs scrollbar, einspaltiger Layout
- Formular-Grids: `grid-cols-1` auf Mobile

### Korrekturassistent

- Mitarbeiter-Auswahl: Fullscreen-Suche auf Mobile
- Zeitraum-Auswahl: Touch-optimierter Datepicker
- Ergebnis-Tabelle: horizontaler Scroll

### Monatswerte

- Breite Pivot-Tabelle (Mitarbeiter x Tage): horizontaler Scroll mit Sticky-Mitarbeiterspalte
- Kompakte Zellen auf Mobile

---

## Acceptance Criteria

- [ ] Alle Listen-Seiten: MOB_02 Table-Pattern angewandt
- [ ] Primaer-Spalten auf Mobile identifiziert und konfiguriert
- [ ] Detail-Seiten: Tabs scrollbar, einspaltiger Layout
- [ ] Korrekturassistent: Fullscreen-Suche, Touch-optimiert
- [ ] Monatswerte: horizontaler Scroll mit Sticky-Spalte
- [ ] Alle Formulare: Fullscreen-Sheet auf Mobile
- [ ] Kein horizontaler Overflow auf 375px (ausser gewollter Scroll in Tabellen)
