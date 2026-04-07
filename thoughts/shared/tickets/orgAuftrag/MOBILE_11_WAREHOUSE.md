# MOB_11 — Warehouse: Artikel, Einkauf, Wareneingang, Lager, Scanner

| Field | Value |
|-------|-------|
| **Module** | Warehouse |
| **Dependencies** | MOB_01, MOB_02, MOB_03 |
| **Complexity** | L |
| **Priority** | Hoch (Lagermitarbeiter nutzen Tablets/Smartphones im Lager) |
| **New Models** | — |

---

## Ist-Zustand

- Warehouse-Uebersicht: `src/app/[locale]/(dashboard)/warehouse/page.tsx`
- Artikel: `src/app/[locale]/(dashboard)/warehouse/articles/` — Liste, Detail
- Preise: `src/app/[locale]/(dashboard)/warehouse/prices/page.tsx`
- Bestellungen: `src/app/[locale]/(dashboard)/warehouse/purchase-orders/` — Liste, Detail, Neu, Vorschlaege
- Wareneingang: `src/app/[locale]/(dashboard)/warehouse/goods-receipt/page.tsx`
- Lagerentnahmen: `src/app/[locale]/(dashboard)/warehouse/withdrawals/page.tsx`
- Lagerbewegungen: `src/app/[locale]/(dashboard)/warehouse/stock-movements/page.tsx`
- Lieferantenrechnungen: `src/app/[locale]/(dashboard)/warehouse/supplier-invoices/` — Liste, Detail
- Reservierungen: `src/app/[locale]/(dashboard)/warehouse/reservations/page.tsx`
- Scanner: `src/app/[locale]/(dashboard)/warehouse/scanner/page.tsx` — QR-Scanner (bereits mobile-primaer)
- Korrekturen: `src/app/[locale]/(dashboard)/warehouse/corrections/page.tsx`

---

## Goal

Warehouse mobil nutzbar fuer Lagermitarbeiter: Artikel per Scanner/Suche finden, Wareneingang buchen, Lagerentnahmen erfassen, Bestand pruefen. Scanner-Seite ist bereits mobile-primaer konzipiert.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/warehouse` | Warehouse-Uebersicht | Responsive Dashboard |
| `/warehouse/articles` | Artikelliste | MOB_02 + Bildvorschau |
| `/warehouse/articles/[id]` | Artikel-Detail | Responsive Tabs, Bild prominent |
| `/warehouse/prices` | Preise | MOB_02 Table-Pattern |
| `/warehouse/purchase-orders` | Bestellliste | MOB_02 Table-Pattern |
| `/warehouse/purchase-orders/[id]` | Bestell-Detail | Responsive Detail |
| `/warehouse/purchase-orders/new` | Bestellung-Neu | Mobile-Formular |
| `/warehouse/purchase-orders/suggestions` | Bestellvorschlaege | Mobile-Liste |
| `/warehouse/goods-receipt` | Wareneingang | Touch-optimierte Erfassung |
| `/warehouse/withdrawals` | Lagerentnahmen | Touch-optimierte Erfassung |
| `/warehouse/stock-movements` | Lagerbewegungen | MOB_02 Table-Pattern |
| `/warehouse/supplier-invoices` | Lieferantenrechnungen | MOB_02 Table-Pattern |
| `/warehouse/supplier-invoices/[id]` | LR-Detail | Responsive Detail |
| `/warehouse/reservations` | Reservierungen | MOB_02 Table-Pattern |
| `/warehouse/scanner` | QR-Scanner | Bereits mobile-primaer, verifizieren |
| `/warehouse/corrections` | Korrekturen | Mobile-Formular |

---

## Aenderungen

### Artikelliste

- MOB_02 Pattern: Artikelnummer + Bezeichnung + Bestand immer sichtbar
- Artikelbild als Thumbnail in der Liste (40x40px auf Mobile)
- Kategorie, Lieferant, Preis ab `md`
- Suche mit Barcode-Scanner-Button (Kamera-Icon) auf Mobile

### Artikel-Detail

- Artikelbild: prominent oben, volle Breite auf Mobile
- Stammdaten: einspaltiger
- Tabs (Bestand, Preise, Lieferanten, Bewegungen): scrollbar
- Bestandsanzeige: gross und prominent
- Quick-Action: "Entnahme buchen" als primaere Aktion

### Wareneingang & Lagerentnahmen

- **Primaerer Mobile-Use-Case**
- Grosse Input-Felder fuer Mengen (numerische Tastatur)
- Artikel-Suche oder Scanner zum Hinzufuegen
- Bestaetigung: grosser Button
- Erfolgs-Feedback: deutlich sichtbar (Toast/Banner)

### Bestellungen

- Liste: MOB_02 Pattern (Nummer, Lieferant, Status, Betrag)
- Detail: Positions-Tabelle mit Scroll
- Bestellvorschlaege: Card-basierte Ansicht mit Check/Uncheck

### Scanner

- Bereits mobile-primaer konzipiert
- Verifizieren: Kamera-Zugriff funktioniert auf iOS/Android
- Ergebnis-Anzeige nach Scan: Artikelinfo als Card

### Korrekturen

- Formular: einspaltiger, grosse Touch-Targets
- Artikel-Suche: Fullscreen

---

## Betroffene Dateien

| Datei | Aenderung |
|-------|-----------|
| Alle `/warehouse/` page.tsx Dateien | Responsive Layouts |
| `src/components/warehouse/article-list.tsx` | Responsive Spalten + Thumbnail |
| `src/components/warehouse/article-detail.tsx` | Mobile-Layout |
| `src/components/warehouse/goods-receipt-form.tsx` | Touch-optimiert |
| `src/components/warehouse/withdrawal-form.tsx` | Touch-optimiert |
| `src/components/warehouse/purchase-order-form.tsx` | Mobile-first Grid |
| `src/components/warehouse/scanner.tsx` | Verifizierung |

---

## Acceptance Criteria

- [ ] Artikelliste: MOB_02 Pattern, Artikelnr+Name+Bestand sichtbar
- [ ] Artikelliste: Thumbnail-Bilder auf Mobile
- [ ] Artikel-Detail: Bild prominent, Bestandsanzeige gross
- [ ] Wareneingang: Touch-optimierte Mengenerfassung, numerische Tastatur
- [ ] Lagerentnahmen: Touch-optimierte Erfassung
- [ ] Bestellungen: MOB_02 Pattern
- [ ] Scanner: funktioniert auf iOS Safari und Android Chrome
- [ ] Bestellvorschlaege: Card-basierte Ansicht
- [ ] Alle Formulare: Fullscreen-Sheet auf Mobile
- [ ] Kein horizontaler Overflow auf 375px
