# MOB_02 — Data Table Responsive Pattern

| Field | Value |
|-------|-------|
| **Module** | UI Components / Global |
| **Dependencies** | MOB_01 (Layout Foundation) |
| **Complexity** | L |
| **Priority** | Kritisch (Pattern wird von ~30+ Listenansichten verwendet) |
| **New Models** | — |

---

## Ist-Zustand

- Data Tables basieren auf `@tanstack/react-table` mit `src/components/ui/data-table.tsx`
- Tabellen haben feste Spalten ohne responsive Spaltenausblendung
- Kein Card-View-Fallback fuer Mobile
- Horizontaler Scroll moeglich, aber nicht optimal (breite Tabellen auf 375px)
- Toolbar (Filter, Suche, Actions) ist teilweise responsiv (`sm:flex-row`)

---

## Goal

Ein wiederverwendbares responsive Pattern fuer alle Data Tables: Auf Mobile werden Tabellen als scrollbare kompakte Ansicht oder als Card-Liste dargestellt. Spalten koennen nach Breakpoint ein-/ausgeblendet werden. Toolbar wird mobile-optimiert.

---

## Design-Entscheidung

**Ansatz: Responsive Spalten + Horizontaler Scroll als Fallback**

Statt einem komplett anderen Card-View (hoher Aufwand, schwer wartbar) setzen wir auf:
1. Spalten-Visibility nach Breakpoint (unwichtige Spalten auf Mobile ausblenden)
2. Sticky erste Spalte (Identifier bleibt sichtbar beim Scrollen)
3. Horizontaler Scroll-Container mit Scroll-Indicator
4. Kompakte Zeilenhoehe auf Mobile

---

## Aenderungen

### 1. Column Visibility Utility

Neues Utility in `src/components/ui/data-table.tsx`:

```ts
// Spalten koennen ein `meta.responsive` Flag haben
// "always" = immer sichtbar
// "md" = ab md-Breakpoint
// "lg" = ab lg-Breakpoint
// "xl" = ab xl-Breakpoint
type ResponsiveVisibility = 'always' | 'sm' | 'md' | 'lg' | 'xl'

// Hook: useResponsiveColumns
// Liest window.innerWidth und setzt columnVisibility automatisch
```

### 2. Scroll-Container

```tsx
<div className="relative overflow-x-auto rounded-md border">
  {/* Scroll-Indicator (Gradient-Fade rechts) */}
  <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent md:hidden" />
  <table className="w-full min-w-[600px]">
    {/* ... */}
  </table>
</div>
```

### 3. Sticky First Column

```css
/* Erste Spalte sticky auf Mobile */
@media (max-width: 767px) {
  .data-table th:first-child,
  .data-table td:first-child {
    position: sticky;
    left: 0;
    z-index: 1;
    background: hsl(var(--background));
  }
}
```

### 4. Kompakte Mobile-Darstellung

- Zeilenhoehe: `h-10` statt `h-12` auf Mobile
- Padding: `px-2 py-1.5` statt `px-4 py-2`
- Font-Size: `text-xs` statt `text-sm` auf Mobile
- Truncation fuer lange Texte mit `max-w-[120px] truncate` auf Mobile

### 5. Toolbar Mobile-Layout

```tsx
<div className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between sm:p-4">
  {/* Suche: volle Breite auf Mobile */}
  <Input className="w-full sm:w-72" />
  
  {/* Filter: horizontal scrollbar auf Mobile */}
  <div className="flex gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
    {/* Filter-Buttons/Selects */}
  </div>
</div>
```

### 6. Pagination Mobile

- "Vorherige/Naechste" Buttons statt Seitenzahlen auf Mobile
- Kompakte Info: "1–10 von 50" statt "Zeige 1 bis 10 von 50 Eintraegen"

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/components/ui/data-table.tsx` | Responsive Column Visibility, Scroll-Container, kompakte Darstellung |
| `src/components/ui/data-table-toolbar.tsx` | Mobile Toolbar-Layout (falls vorhanden) |
| `src/components/ui/pagination.tsx` | Kompakte Mobile-Pagination |
| `src/app/globals.css` | Sticky-Column CSS, Scroll-Indicator |

---

## Betroffene Listenansichten (verwenden das Pattern)

Nach Implementierung muessen alle Tabellen die `meta.responsive` Property an Spalten setzen:

| Bereich | Tabellen |
|---------|----------|
| Admin | Employees, Teams, Departments, Users, User-Groups, Cost-Centers, Locations, Holidays, Absence-Types, Booking-Types, Tariffs, Accounts, Audit-Logs |
| CRM | Addresses, Inquiries, Tasks |
| Billing | Documents, Open Items, Price Lists, Recurring Invoices, Templates |
| Warehouse | Articles, Purchase Orders, Goods Receipt, Withdrawals, Stock Movements, Supplier Invoices, Reservations |
| Time | Timesheet, Team Overview, Absences, Vacation, Monthly Evaluation |
| HR | Personnel File |

---

## Tests

### Manuelle Tests

- [ ] Tabelle mit 10+ Spalten auf 375px: horizontaler Scroll funktioniert
- [ ] Erste Spalte bleibt sticky beim Scrollen
- [ ] Scroll-Indicator (Gradient) sichtbar wenn scrollbar
- [ ] Spalten mit `meta.responsive: "lg"` auf Mobile ausgeblendet
- [ ] Toolbar: Suche volle Breite, Filter horizontal scrollbar
- [ ] Pagination: kompakt auf Mobile

---

## Acceptance Criteria

- [ ] `useResponsiveColumns` Hook implementiert und exportiert
- [ ] Scroll-Container mit Gradient-Indicator fuer horizontalen Scroll
- [ ] Sticky erste Spalte auf Mobile
- [ ] Kompakte Zeilenhoehe und Padding auf Mobile
- [ ] Mobile-Toolbar: Suche volle Breite, Filter horizontal scrollbar
- [ ] Pagination kompakt auf Mobile
- [ ] Mindestens eine existierende Tabelle als Referenz-Implementierung umgestellt
- [ ] Kein Layout-Break auf 320px Viewport
