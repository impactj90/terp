# MOB_05 — Dashboard

| Field | Value |
|-------|-------|
| **Module** | Dashboard |
| **Dependencies** | MOB_01 (Layout Foundation) |
| **Complexity** | M |
| **Priority** | Hoch (Hauptseite, erste Ansicht nach Login) |
| **New Models** | — |

---

## Ist-Zustand

- Dashboard: `src/app/[locale]/(dashboard)/dashboard/page.tsx`
- Grid: `md:grid-cols-2 lg:grid-cols-4` — bereits teilweise responsiv
- Stat-Cards, Quick-Actions, Recent-Activity
- Charts/Diagramme ggf. nicht mobile-optimiert
- Command-Palette (cmdk): auf Mobile schwer erreichbar (Ctrl+K)

---

## Goal

Dashboard als mobile-first Startseite: Stat-Cards stapelbar, Charts responsive, Quick-Actions prominent fuer Touch, Command-Palette durch Suchfeld ersetzbar auf Mobile.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/dashboard` | Dashboard-Page | Mobile-Layout |

---

## Aenderungen

### Stat-Cards

```tsx
// Mobile: 2 Spalten (kompakte Karten)
// Tablet: 2 Spalten
// Desktop: 4 Spalten
<div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
```

- Card-Inhalt auf Mobile kompakter: kleinere Zahlen, kuerzere Labels
- Touch: gesamte Card klickbar (falls verlinkt)

### Quick-Actions

- Mobile: horizontaler Scroll-Container mit grossen Touch-Targets
- `flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible`
- Jede Action min. 44x44px

### Charts

- Charts responsive mit `responsiveContainer` (recharts)
- Auf Mobile: vereinfachte Darstellung (weniger Labels, kompaktere Achsen)
- `aspect-ratio: 16/9` auf Mobile, `aspect-ratio: 2/1` auf Desktop

### Recent-Activity / Feed

- Kompakte Liste auf Mobile
- Timestamps: relative Darstellung ("vor 2h" statt "31.03.2026 14:30")

### Willkommens-Header

- Mobile: Kompakt, nur Vorname + Datum
- Desktop: Vollstaendige Begruessung

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/app/[locale]/(dashboard)/dashboard/page.tsx` | Grid-Layout mobile-first |
| `src/components/dashboard/stat-cards.tsx` (o.ae.) | Kompakte Mobile-Darstellung |
| `src/components/dashboard/quick-actions.tsx` (o.ae.) | Touch-optimiert |
| `src/components/dashboard/charts/` (o.ae.) | Responsive Charts |

---

## Acceptance Criteria

- [ ] Stat-Cards: 2-spaltig auf Mobile, 4-spaltig auf Desktop
- [ ] Quick-Actions: horizontal scrollbar auf Mobile, Touch-Targets >= 44px
- [ ] Charts: responsive, keine horizontalen Scrollbars
- [ ] Kein horizontaler Overflow auf 375px Viewport
- [ ] Kompakte Darstellung der Informationen auf Mobile
- [ ] Gesamte Seite laesst sich vertikal scrollen ohne Layout-Brueche
