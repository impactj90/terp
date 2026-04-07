# MOB_01 — Layout Foundation & Viewport

| Field | Value |
|-------|-------|
| **Module** | Layout / Global |
| **Dependencies** | — |
| **Complexity** | M |
| **Priority** | Kritisch (Grundlage fuer alle weiteren Mobile-Tickets) |
| **New Models** | — |

---

## Ist-Zustand

- Kein `viewport` Meta-Tag im Root-Layout exportiert (Next.js `metadata.viewport`)
- Mobile-Navigation (Bottom-Tab-Bar + Sheet-Drawer) existiert bereits und funktioniert
- CSS-Variablen fuer Layout-Dimensionen vorhanden (`--sidebar-width`, `--header-height`, `--bottom-nav-height`)
- Tailwind-Breakpoints werden verwendet, aber nicht konsistent mobile-first
- Touch-Target-Groessen teilweise unter 44x44px (Icon-Buttons, kleine Links)
- Kein `safe-area-inset` Support fuer Geraete mit Notch/Dynamic Island

---

## Goal

Die globale Layout-Grundlage fuer mobile-first schaffen: Viewport-Meta, sichere Touch-Targets, Safe-Area-Insets, und konsistente CSS-Utilities fuer alle nachfolgenden Mobile-Tickets.

---

## Aenderungen

### 1. Viewport Meta-Tag

In `src/app/[locale]/layout.tsx`:

```ts
import type { Viewport } from 'next'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,       // Verhindert ungewolltes Zoomen bei Input-Focus (iOS)
  userScalable: false,
  viewportFit: 'cover',  // Fuer Safe-Area-Insets
}
```

### 2. Safe-Area-Insets

In `src/app/globals.css`:

```css
:root {
  --safe-area-top: env(safe-area-inset-top, 0px);
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
  --safe-area-left: env(safe-area-inset-left, 0px);
  --safe-area-right: env(safe-area-inset-right, 0px);
}
```

Anpassen in bestehenden Komponenten:
- `mobile-nav.tsx`: Bottom-Padding um `var(--safe-area-bottom)` erweitern
- `app-layout.tsx`: Bottom-Padding beruecksichtigt Safe-Area
- `header.tsx`: Top-Padding um `var(--safe-area-top)` erweitern

### 3. Touch-Target Minimum

Globale CSS-Utility-Klasse:

```css
.touch-target {
  min-height: 44px;
  min-width: 44px;
}
```

Bestehende Komponenten pruefen und anpassen:
- `src/components/ui/button.tsx`: `size="icon"` soll min. 44x44px haben auf Mobile (`min-h-11 min-w-11 lg:min-h-0 lg:min-w-0`)
- `src/components/ui/checkbox.tsx`: Touch-Area vergroessern
- `src/components/ui/switch.tsx`: Touch-Area vergroessern
- Sidebar Nav-Items in `mobile-nav.tsx`: Bereits 48px, OK

### 4. Text-Groessen Mobile-First

Pruefen und anpassen:
- Body-Text: min. 16px auf Mobile (verhindert iOS-Zoom bei Input-Focus)
- Input-Felder: `text-base` auf Mobile, `md:text-sm` auf Desktop (bereits teilweise vorhanden)
- Labels: min. 14px

### 5. Scroll-Verhalten

```css
html {
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

/* Verhindert Overscroll-Bounce auf iOS */
body {
  overscroll-behavior-y: none;
}
```

### 6. Header Anpassungen

In `src/components/layout/header.tsx`:
- Sicherstellen, dass Header auf Mobile die volle Breite nutzt
- Menu-Button Touch-Target: min. 44x44px
- Kompakte Darstellung der Action-Buttons (bereits vorhanden, verifizieren)

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/app/[locale]/layout.tsx` | Viewport-Export hinzufuegen |
| `src/app/globals.css` | Safe-Area-Variablen, Touch-Target-Utility, Scroll-Verhalten |
| `src/components/layout/mobile-nav.tsx` | Safe-Area-Bottom-Padding |
| `src/components/layout/app-layout.tsx` | Safe-Area in Bottom-Padding |
| `src/components/layout/header.tsx` | Safe-Area-Top, Touch-Targets verifizieren |
| `src/components/ui/button.tsx` | Mobile Touch-Target fuer `size="icon"` |
| `src/components/ui/checkbox.tsx` | Touch-Area vergroessern |
| `src/components/ui/switch.tsx` | Touch-Area vergroessern |

---

## Tests

### Manuelle Tests

- [ ] iOS Safari: Viewport korrekt, kein Zoom bei Input-Focus
- [ ] Android Chrome: Viewport korrekt
- [ ] iPhone mit Notch: Safe-Area-Insets greifen (Bottom-Nav, Header)
- [ ] Alle Buttons/Checkboxen mindestens 44x44px Touch-Target
- [ ] Kein horizontaler Scroll auf Mobile-Viewport (320px–428px)

---

## Acceptance Criteria

- [ ] `viewport` Export in Root-Layout vorhanden
- [ ] Safe-Area-Inset CSS-Variablen definiert und in Mobile-Nav/Header verwendet
- [ ] Touch-Targets >= 44x44px fuer alle interaktiven Elemente auf Mobile
- [ ] Input-Felder min. 16px Font-Size auf Mobile (kein iOS-Zoom)
- [ ] Kein horizontaler Overflow auf Viewports 320px–428px
- [ ] Bottom-Nav beruecksichtigt Safe-Area auf Geraeten mit Home-Indicator
