# MOB_10 — Billing: Belege, Kundendienst, Offene Posten, Preislisten, Wiederkehrend

| Field | Value |
|-------|-------|
| **Module** | Billing / Orders |
| **Dependencies** | MOB_01, MOB_02, MOB_03 |
| **Complexity** | L |
| **Priority** | Mittel (weniger haeufig mobil, aber wichtig fuer Aussendienst) |
| **New Models** | — |

---

## Ist-Zustand

- Belege: `src/app/[locale]/(dashboard)/orders/documents/` — Liste, Detail, Neu
- Kundendienst: `src/app/[locale]/(dashboard)/orders/service-cases/` — Liste, Detail
- Offene Posten: `src/app/[locale]/(dashboard)/orders/open-items/` — Liste, Detail
- Preislisten: `src/app/[locale]/(dashboard)/orders/price-lists/` — Liste, Detail
- Wiederkehrende Rechnungen: `src/app/[locale]/(dashboard)/orders/recurring/` — Liste, Detail, Neu
- Vorlagen: `src/app/[locale]/(dashboard)/orders/templates/page.tsx`
- Beleg-Formular mit Positions-Tabelle (drag-to-reorder) ist komplex

---

## Goal

Billing mobil nutzbar: Belege einsehen, Status pruefen, einfache Aktionen (Drucken, Weiterleiten) ausfuehren. Beleg-Erstellung bleibt Desktop-primaer, aber grundsaetzlich mobil moeglich.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/orders/documents` | Belegliste | MOB_02 Table-Pattern |
| `/orders/documents/[id]` | Beleg-Detail | Responsive Detail, PDF-Preview |
| `/orders/documents/new` | Beleg-Erstellen | Mobile-Formular (eingeschraenkt) |
| `/orders/service-cases` | Kundendienst-Liste | MOB_02 Table-Pattern |
| `/orders/service-cases/[id]` | Kundendienst-Detail | Responsive Detail |
| `/orders/open-items` | Offene-Posten-Liste | MOB_02 Table-Pattern |
| `/orders/open-items/[documentId]` | OP-Detail | Responsive Detail |
| `/orders/price-lists` | Preislisten-Liste | MOB_02 Table-Pattern |
| `/orders/price-lists/[id]` | Preislisten-Detail | Responsive Positions-Tabelle |
| `/orders/recurring` | Wiederkehrend-Liste | MOB_02 Table-Pattern |
| `/orders/recurring/[id]` | Wiederkehrend-Detail | Responsive Detail |
| `/orders/recurring/new` | Wiederkehrend-Neu | Mobile-Formular |
| `/orders/templates` | Vorlagen | MOB_02 Table-Pattern |

---

## Aenderungen

### Belegliste

- MOB_02 Pattern: Belegnummer + Kunde + Betrag immer sichtbar
- Typ-Badge und Status-Badge kompakt
- Datum und weitere Spalten ab `md`
- Filter: Typ-Tabs horizontal scrollbar

### Beleg-Detail

- Header: Belegnummer, Status-Badge, Typ-Badge prominent
- Kunden-Info: kompakt, Click-to-Call
- Positions-Tabelle: horizontaler Scroll mit Sticky-Spalte (Beschreibung)
- Summen-Bereich: immer sichtbar (sticky bottom oder prominent oben)
- Aktionsleiste: horizontaler Scroll fuer Buttons (Drucken, Weiterleiten, Stornieren)
- PDF-Preview: im Fullscreen-Modal auf Mobile
- Belegkette-Visualisierung: vertikal statt horizontal auf Mobile

### Beleg-Erstellen (Mobile)

- Grundsaetzlich mobil moeglich, aber mit Hinweis "Fuer beste Erfahrung Desktop verwenden"
- Formular: einspaltiger (MOB_03 Pattern)
- Positions-Tabelle: vereinfachte Mobile-Ansicht
  - Drag-to-Reorder: Long-Press + Drag (touch events)
  - Eine Position pro Card statt Tabellenzeile
- Artikel-Suche: Fullscreen-Suche mit Ergebnisliste

### Kundendienst

- Liste: MOB_02 Pattern (Fallnummer, Kunde, Status)
- Detail: Tabs responsive, Aktivitaets-Timeline kompakt

### Offene Posten

- Liste: MOB_02 Pattern (Belegnummer, Kunde, Betrag, Faellig)
- Faelligkeits-Highlighting auf Mobile gut erkennbar (Farb-Badges)
- Detail: Zahlungshistorie als Timeline

### Preislisten / Wiederkehrend / Vorlagen

- Listen: MOB_02 Pattern
- Details: einspaltiger Layout, Positions-Tabelle mit Scroll

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/app/[locale]/(dashboard)/orders/documents/page.tsx` | Table-Pattern |
| `src/app/[locale]/(dashboard)/orders/documents/[id]/page.tsx` | Responsive Detail |
| `src/app/[locale]/(dashboard)/orders/documents/new/page.tsx` | Mobile-Formular |
| `src/components/billing/document-list.tsx` | Responsive Spalten |
| `src/components/billing/document-detail.tsx` | Mobile-Layout |
| `src/components/billing/document-form.tsx` | Mobile-first Grid |
| `src/components/billing/document-position-table.tsx` | Mobile-Cards + Touch-Drag |
| Alle weiteren Billing-Komponenten | MOB_02/MOB_03 Patterns |

---

## Acceptance Criteria

- [ ] Belegliste: MOB_02 Pattern, Belegnr+Kunde+Betrag immer sichtbar
- [ ] Beleg-Detail: Responsive Layout, Summen sichtbar
- [ ] Beleg-Detail: Aktionsleiste mobil nutzbar
- [ ] Beleg-Detail: PDF-Preview als Fullscreen-Modal
- [ ] Beleg-Erstellen: grundsaetzlich auf Mobile moeglich
- [ ] Positions-Tabelle: Mobile-Cards oder horizontaler Scroll
- [ ] Kundendienst: Liste und Detail responsive
- [ ] Offene Posten: Faelligkeits-Badges auf Mobile gut erkennbar
- [ ] Preislisten/Wiederkehrend/Vorlagen: MOB_02 Pattern
- [ ] Alle Formulare: Fullscreen-Sheet auf Mobile
