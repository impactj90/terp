# MOB_09 — CRM: Adressen, Anfragen, Aufgaben, Auswertungen

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | MOB_01, MOB_02, MOB_03 |
| **Complexity** | L |
| **Priority** | Hoch (Aussendienst-Relevanz — Vertriebler nutzen CRM mobil) |
| **New Models** | — |

---

## Ist-Zustand

- CRM-Uebersicht: `src/app/[locale]/(dashboard)/crm/page.tsx`
- Adressen-Liste: `src/app/[locale]/(dashboard)/crm/addresses/page.tsx` — Data Table
- Adress-Detail: `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` — Tabs (Stammdaten, Kontakte, Korrespondenz, Dokumente, Vorgaenge)
- Anfragen-Liste: `src/app/[locale]/(dashboard)/crm/inquiries/page.tsx` — Data Table
- Anfragen-Detail: `src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx`
- Aufgaben: `src/app/[locale]/(dashboard)/crm/tasks/page.tsx`
- Auswertungen: `src/app/[locale]/(dashboard)/crm/reports/page.tsx`
- Adress-Detail hat mehrspaltige Layouts und viele Tabs

---

## Goal

CRM mobil nutzbar fuer Aussendienstmitarbeiter: Adressen/Kunden schnell finden, Kontaktdaten auf einen Blick, Anrufen/E-Mail per Tap, Anfragen unterwegs erstellen.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/crm` | CRM-Uebersicht | Responsive Dashboard-Cards |
| `/crm/addresses` | Adressen-Liste | MOB_02 Table-Pattern |
| `/crm/addresses/[id]` | Adress-Detail | Responsive Tabs, Click-to-Call |
| `/crm/inquiries` | Anfragen-Liste | MOB_02 Table-Pattern |
| `/crm/inquiries/[id]` | Anfragen-Detail | Responsive Detail-Layout |
| `/crm/tasks` | Aufgaben | Mobile-Aufgabenliste |
| `/crm/reports` | Auswertungen | Responsive Charts/Tabellen |

---

## Aenderungen

### Adressen-Liste

- MOB_02 Data Table Pattern anwenden
- Mobile-Prioritaets-Spalten: Firmenname, Ort, Typ-Badge (immer sichtbar)
- Sekundaere Spalten (PLZ, Land, Telefon, Kategorie): ab `md` sichtbar
- Suche: volle Breite auf Mobile

### Adress-Detail

- **Click-to-Call**: Telefonnummern als `tel:` Links (prominente Touch-Buttons)
- **Click-to-Mail**: E-Mail als `mailto:` Links
- **Maps-Link**: Adresse als Google Maps Link
- Tabs: horizontal scrollbar auf Mobile (MOB_03 Pattern)
- Stammdaten-Tab: einspaltiger auf Mobile
- Kontakte-Tab: kompakte Cards statt Tabelle
- Korrespondenz-Tab: Timeline-Ansicht, kompakt
- Quick-Actions oben: Anrufen, E-Mail, Route (grosse Touch-Buttons)

### Anfragen

- Liste: MOB_02 Pattern
- Detail: Status-Workflow als horizontale Steps (kompakt auf Mobile)
- Positions-Tabelle: horizontaler Scroll mit Sticky-Spalte

### Aufgaben

- Card-basierte Aufgabenliste
- Status-Badge, Faelligkeit, Zustaendiger
- Swipe oder Tap fuer Status-Wechsel
- Filter: horizontal scrollbar

### Auswertungen

- Charts responsive (recharts responsiveContainer)
- Tabellen: MOB_02 Pattern

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/app/[locale]/(dashboard)/crm/page.tsx` | Responsive Cards |
| `src/app/[locale]/(dashboard)/crm/addresses/page.tsx` | Table-Pattern |
| `src/app/[locale]/(dashboard)/crm/addresses/[id]/page.tsx` | Click-to-Call, Tabs |
| `src/components/crm/address-detail.tsx` | Mobile-Layout |
| `src/components/crm/address-form.tsx` | Grid mobile-first |
| `src/components/crm/contact-list.tsx` (o.ae.) | Card-Ansicht |
| `src/app/[locale]/(dashboard)/crm/inquiries/page.tsx` | Table-Pattern |
| `src/app/[locale]/(dashboard)/crm/inquiries/[id]/page.tsx` | Mobile-Detail |
| `src/app/[locale]/(dashboard)/crm/tasks/page.tsx` | Card-Liste |
| `src/app/[locale]/(dashboard)/crm/reports/page.tsx` | Responsive Charts |

---

## Acceptance Criteria

- [ ] Adressen-Liste: MOB_02 Pattern, Firma+Ort immer sichtbar
- [ ] Adress-Detail: Click-to-Call (`tel:` Links) fuer Telefonnummern
- [ ] Adress-Detail: Click-to-Mail (`mailto:` Links)
- [ ] Adress-Detail: Maps-Link fuer Adresse
- [ ] Adress-Detail: Tabs scrollbar auf Mobile
- [ ] Adress-Detail: Quick-Action-Buttons (Anrufen, Mail, Route) prominent
- [ ] Anfragen-Liste: MOB_02 Pattern
- [ ] Aufgaben: Card-basierte Mobile-Ansicht
- [ ] Auswertungen: Charts responsive
- [ ] Alle Formulare: Fullscreen-Sheet auf Mobile
