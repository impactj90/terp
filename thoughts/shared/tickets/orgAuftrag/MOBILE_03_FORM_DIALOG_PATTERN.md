# MOB_03 — Form & Dialog Responsive Pattern

| Field | Value |
|-------|-------|
| **Module** | UI Components / Global |
| **Dependencies** | MOB_01 (Layout Foundation) |
| **Complexity** | M |
| **Priority** | Kritisch (Pattern wird von ~40+ Formularen verwendet) |
| **New Models** | — |

---

## Ist-Zustand

- Formulare verwenden `react-hook-form` + `zod`
- Sheet-Formulare (Seitenleiste) mit `src/components/ui/sheet.tsx` — Breite `w-3/4 sm:max-w-sm`
- Dialog-Formulare mit `src/components/ui/dialog.tsx` — Breite `max-w-lg`
- `confirm-dialog.tsx` hat bereits Mobile-Optimierung (`sm:max-w-md sm:mx-auto sm:rounded-t-lg`)
- Grid-Layouts in Formularen teils 2-spaltig ohne Mobile-Fallback
- Sheet-Footer mit Save/Cancel-Buttons manchmal ausserhalb des sichtbaren Bereichs
- Detail-Seiten (z.B. Adress-Detail, Beleg-Detail) verwenden Tabs und mehrspaltige Layouts

---

## Goal

Konsistente mobile-first Patterns fuer alle Formular-Typen: Sheet-Formulare werden auf Mobile als Fullscreen-Sheet dargestellt. Dialoge als Bottom-Sheet. Form-Grids werden einspaltiger. Detail-Seiten bekommen ein vertikales Tab-Layout.

---

## Aenderungen

### 1. Sheet auf Mobile = Fullscreen

In `src/components/ui/sheet.tsx`:

```tsx
// Variante "form" fuer Formular-Sheets
// Mobile: volle Breite und Hoehe
// Desktop: bisheriges Verhalten (Seitenleiste)
<SheetContent
  className={cn(
    // Mobile: Fullscreen
    'inset-0 w-full max-w-full rounded-none',
    // Desktop: Sidebar
    'sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[480px] sm:max-w-lg sm:rounded-l-lg',
  )}
>
```

### 2. Dialog auf Mobile = Bottom-Sheet

In `src/components/ui/dialog.tsx`:

```tsx
// Mobile: Bottom-Sheet mit Slide-Up-Animation
// Desktop: zentrierter Dialog
<DialogContent
  className={cn(
    // Mobile: Bottom-Sheet
    'fixed inset-x-0 bottom-0 top-auto max-h-[85vh] rounded-t-xl',
    // Desktop: zentrierter Dialog
    'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:max-w-lg',
  )}
>
```

### 3. Form-Grid Mobile-First

Bestehende Formulare verwenden oft:
```tsx
<div className="grid grid-cols-2 gap-4">
```

Aendern zu:
```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
```

### 4. Sticky Form-Footer

```tsx
<div className="sticky bottom-0 border-t bg-background px-4 py-3 sm:px-6">
  <div className="flex justify-end gap-2">
    <Button variant="outline">Abbrechen</Button>
    <Button type="submit">Speichern</Button>
  </div>
</div>
```

### 5. Detail-Seiten: Tabs auf Mobile

Horizontale Tabs (Desktop) → Horizontaler Scroll auf Mobile:

```tsx
<TabsList className="flex w-full overflow-x-auto sm:w-auto">
  {/* Tab-Triggers mit min-width damit sie nicht zusammengequetscht werden */}
  <TabsTrigger className="min-w-[100px] flex-shrink-0 sm:min-w-0">
    Stammdaten
  </TabsTrigger>
</TabsList>
```

### 6. Responsive Detail-Layout

Detail-Seiten mit Sidebar-Info (z.B. Adress-Detail):

```tsx
// Mobile: alles vertikal gestapelt
// Desktop: Content + Sidebar
<div className="flex flex-col gap-4 lg:flex-row">
  <div className="flex-1">{/* Hauptinhalt */}</div>
  <div className="w-full lg:w-80">{/* Sidebar-Info */}</div>
</div>
```

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/components/ui/sheet.tsx` | Fullscreen auf Mobile |
| `src/components/ui/dialog.tsx` | Bottom-Sheet auf Mobile |
| `src/components/ui/tabs.tsx` | Horizontal-Scroll auf Mobile |
| Alle Form-Komponenten | Grid-Layout mobile-first (`grid-cols-1 sm:grid-cols-2`) |
| Alle Detail-Seiten | Responsive Layout (`flex-col lg:flex-row`) |

---

## Betroffene Formular-Komponenten

| Bereich | Formulare |
|---------|-----------|
| Admin | Employee-Form, Team-Form, Department-Form, User-Form, alle Config-Formulare |
| CRM | Address-Form, Contact-Form, Inquiry-Form, Task-Form, Correspondence-Form |
| Billing | Document-Form, Position-Form, Payment-Dialog, Forward-Dialog |
| Warehouse | Article-Form, Purchase-Order-Form, Goods-Receipt-Form, Withdrawal-Form |
| Time | Booking-Form, Absence-Form, Vacation-Request-Form |
| HR | Personnel-File Sections |

---

## Tests

### Manuelle Tests

- [ ] Sheet-Formular auf 375px: Fullscreen, Footer sichtbar ohne Scrollen
- [ ] Dialog auf 375px: Bottom-Sheet mit Slide-Up
- [ ] Formular-Grids: einspaltiger auf Mobile
- [ ] Tabs auf Mobile: horizontal scrollbar, aktiver Tab sichtbar
- [ ] Detail-Seiten: Sidebar unter Hauptinhalt auf Mobile
- [ ] Save/Cancel-Buttons immer erreichbar (sticky Footer)

---

## Acceptance Criteria

- [ ] Sheets auf Mobile als Fullscreen dargestellt (< sm Breakpoint)
- [ ] Dialoge auf Mobile als Bottom-Sheet dargestellt
- [ ] Formular-Grids einspaltiger auf Mobile (`grid-cols-1` Default)
- [ ] Sticky Footer mit Action-Buttons in allen Sheet-Formularen
- [ ] Tabs horizontal scrollbar auf Mobile
- [ ] Detail-Seiten mit vertikalem Layout auf Mobile
- [ ] Kein Content ausserhalb des Viewports auf 320px
