# MOB_07 — Abwesenheiten, Urlaub, Monatsauswertung, Jahresuebersicht

| Field | Value |
|-------|-------|
| **Module** | Time Management |
| **Dependencies** | MOB_01, MOB_02, MOB_03 |
| **Complexity** | M |
| **Priority** | Hoch (regelmaessige Nutzung) |
| **New Models** | — |

---

## Ist-Zustand

- Abwesenheiten: `src/app/[locale]/(dashboard)/absences/page.tsx` — Tabelle mit Abwesenheitsantraegen
- Urlaub: `src/app/[locale]/(dashboard)/vacation/page.tsx` — Urlaubsuebersicht mit Kalender, `lg:grid-cols-3`
- Monatsauswertung: `src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx` — Detaillierte Monatstabelle
- Jahresuebersicht: `src/app/[locale]/(dashboard)/year-overview/page.tsx` — 12-Monats-Grid
- Urlaubsseite teilweise responsiv (`lg:grid-cols-3`)
- Kalender-Widgets nicht mobile-optimiert

---

## Goal

Abwesenheits- und Urlaubsverwaltung mobil nutzbar: Urlaubsantrag mit wenigen Taps, Kalender-Widget touch-freundlich, Monats-/Jahresauswertungen kompakt lesbar.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/absences` | Absences-Page | Mobile-Listenansicht |
| `/vacation` | Vacation-Page | Responsive Kalender + Antrag |
| `/monthly-evaluation` | Monthly-Evaluation-Page | Kompakte Monatsansicht |
| `/year-overview` | Year-Overview-Page | Responsive 12-Monats-Grid |

---

## Aenderungen

### Abwesenheiten

- Mobile: Card-Liste statt Tabelle
- Jede Abwesenheit als Card: Typ-Badge, Zeitraum, Status-Badge
- Filter: horizontal scrollbar (Typ, Status)
- "Neuer Antrag"-Button: prominent, fixed am unteren Rand oder als FAB

### Urlaub

- Kalender-Widget: Mobile-tauglicher Monatskalender
  - Kompakte Tagesfelder (Touch-Target beachten)
  - Markierte Tage gut erkennbar (farbige Punkte/Hintergrund)
  - Swipe fuer Monatswechsel
- Urlaubskonto-Card: oben, kompakt (Anspruch / Genommen / Rest)
- Antragsliste: unterhalb des Kalenders, Cards statt Tabelle
- Layout: `grid-cols-1` auf Mobile (alles gestapelt)

### Monatsauswertung

- Horizontaler Scroll fuer die breite Monatstabelle (MOB_02 Pattern)
- Zusammenfassung oben: Soll/Ist/Differenz/Ueberstunden als kompakte Stats
- Optional: Tages-Akkordeon statt voller Tabelle auf Mobile

### Jahresuebersicht

- 12-Monats-Grid: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` auf Mobile
- Jeder Monat als kompakte Card mit Kerndaten
- Tap auf Monat oeffnet Monatsdetail
- Jahreszusammenfassung oben

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/app/[locale]/(dashboard)/absences/page.tsx` | Mobile-Cards |
| `src/app/[locale]/(dashboard)/vacation/page.tsx` | Responsive Layout |
| `src/app/[locale]/(dashboard)/monthly-evaluation/page.tsx` | Kompakte Ansicht |
| `src/app/[locale]/(dashboard)/year-overview/page.tsx` | Responsive Grid |
| `src/components/time/calendar-widget.tsx` (o.ae.) | Touch-optimierter Kalender |
| `src/components/time/absence-form.tsx` (o.ae.) | Fullscreen-Sheet auf Mobile |

---

## Acceptance Criteria

- [ ] Abwesenheiten: Card-Liste auf Mobile mit Typ- und Status-Badge
- [ ] Urlaub: Kalender touch-freundlich, Monatswechsel per Swipe/Buttons
- [ ] Urlaub: Urlaubskonto kompakt sichtbar auf Mobile
- [ ] Urlaub: Layout einspaltiger auf Mobile
- [ ] Monatsauswertung: horizontaler Scroll oder Akkordeon auf Mobile
- [ ] Monatsauswertung: Zusammenfassung (Soll/Ist) oben sichtbar
- [ ] Jahresuebersicht: 2-spaltig auf Mobile, 4-spaltig auf Desktop
- [ ] Abwesenheitsantrag: Fullscreen-Sheet mit Touch-optimiertem Datepicker
