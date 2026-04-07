# MOB_13 — Admin: Mitarbeiterverwaltung

| Field | Value |
|-------|-------|
| **Module** | Admin |
| **Dependencies** | MOB_01, MOB_02, MOB_03 |
| **Complexity** | M |
| **Priority** | Niedrig (Admin-Seiten selten mobil genutzt) |
| **New Models** | — |

---

## Ist-Zustand

- Mitarbeiter: `src/app/[locale]/(dashboard)/admin/employees/page.tsx` — Liste
- Mitarbeiter-Detail: `src/app/[locale]/(dashboard)/admin/employees/[id]/page.tsx` — Umfangreiche Detail-Seite
- Teams: `src/app/[locale]/(dashboard)/admin/teams/page.tsx`
- Abteilungen: `src/app/[locale]/(dashboard)/admin/departments/page.tsx`
- Kostenstellen: `src/app/[locale]/(dashboard)/admin/cost-centers/page.tsx`
- Standorte: `src/app/[locale]/(dashboard)/admin/locations/page.tsx`
- Beschaeftigungsarten: `src/app/[locale]/(dashboard)/admin/employment-types/page.tsx`
- Genehmigungen: `src/app/[locale]/(dashboard)/admin/approvals/page.tsx`
- Mitarbeiter-Nachrichten: `src/app/[locale]/(dashboard)/admin/employee-messages/page.tsx`
- Schichtplanung: `src/app/[locale]/(dashboard)/admin/shift-planning/page.tsx`

---

## Goal

Admin-Seiten fuer Mitarbeiterverwaltung grundsaetzlich mobil nutzbar: Mitarbeiterliste einsehen, Genehmigungen bearbeiten, Teams/Abteilungen pruefen. Komplexe Konfigurationen bleiben Desktop-primaer.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/admin/employees` | Mitarbeiterliste | MOB_02 Table-Pattern |
| `/admin/employees/[id]` | Mitarbeiter-Detail | Responsive Tabs |
| `/admin/teams` | Teams | MOB_02 Table-Pattern |
| `/admin/departments` | Abteilungen | MOB_02 Table-Pattern |
| `/admin/cost-centers` | Kostenstellen | MOB_02 Table-Pattern |
| `/admin/locations` | Standorte | MOB_02 Table-Pattern |
| `/admin/employment-types` | Beschaeftigungsarten | MOB_02 Table-Pattern |
| `/admin/approvals` | Genehmigungen | Mobile-Card-Ansicht |
| `/admin/employee-messages` | MA-Nachrichten | Mobile-Card-Ansicht |
| `/admin/shift-planning` | Schichtplanung | Horizontaler Scroll |

---

## Aenderungen

### Mitarbeiterliste

- MOB_02 Pattern: Name + Abteilung + Status immer sichtbar
- Avatar/Initialen in Liste
- Tap oeffnet Detail

### Mitarbeiter-Detail

- Tabs: scrollbar auf Mobile (Stammdaten, Zeiten, Konten, Urlaub, etc.)
- Stammdaten: einspaltiger Grid
- Zeiten-Tab: kompakte Darstellung
- Konten-Tab: Kontostand prominent

### Genehmigungen

- **Wichtigster Mobile-Use-Case im Admin-Bereich**
- Card-basierte Ansicht: Mitarbeiter, Typ, Zeitraum, Status
- Swipe oder grosse Buttons fuer Genehmigen/Ablehnen
- Quick-Action direkt in der Liste (ohne Detail-Seite oeffnen)

### Schichtplanung

- Kalender/Grid: horizontaler Scroll mit Sticky-Mitarbeiterspalte
- Tage als Spalten, Mitarbeiter als Zeilen
- Kompakte Darstellung der Schichten (Farbcodes)

### Stammdaten-Listen (Teams, Abteilungen, etc.)

- MOB_02 Pattern
- Einfache Listen, meist wenige Spalten — unkompliziert

---

## Acceptance Criteria

- [ ] Mitarbeiterliste: MOB_02 Pattern, Name+Abteilung+Status sichtbar
- [ ] Mitarbeiter-Detail: Tabs scrollbar, Stammdaten einspaltiger
- [ ] Genehmigungen: Card-Ansicht mit Quick-Actions (Genehmigen/Ablehnen)
- [ ] Schichtplanung: horizontaler Scroll mit Sticky-Mitarbeiterspalte
- [ ] Stammdaten-Listen: MOB_02 Pattern
- [ ] Alle Formulare: Fullscreen-Sheet auf Mobile
