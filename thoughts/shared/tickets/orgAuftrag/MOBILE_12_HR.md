# MOB_12 — HR: Personalakte

| Field | Value |
|-------|-------|
| **Module** | HR |
| **Dependencies** | MOB_01, MOB_03 |
| **Complexity** | S |
| **Priority** | Niedrig (selten mobil genutzt) |
| **New Models** | — |

---

## Ist-Zustand

- Personalakte: `src/app/[locale]/(dashboard)/hr/personnel-file/page.tsx`
- Kategorien: `src/app/[locale]/(dashboard)/hr/personnel-file/categories/page.tsx`
- Personalakte mit Dokumenten-Upload und Kategorisierung
- Tabs fuer verschiedene Dokumentkategorien

---

## Goal

Personalakte mobil lesbar: eigene Dokumente einsehen, Kategorien durchsuchen. Upload bleibt Desktop-primaer.

---

## Seiten

| Route | Komponente | Aenderung |
|-------|-----------|-----------|
| `/hr/personnel-file` | Personalakte | Responsive Dokumentliste |
| `/hr/personnel-file/categories` | Kategorien | Mobile-Kategorieliste |

---

## Aenderungen

### Personalakte

- Dokumentliste: Card-basierte Ansicht auf Mobile
- Jedes Dokument: Name, Kategorie-Badge, Datum, Groesse
- Tap: Dokument-Vorschau (PDF im Fullscreen)
- Kategorie-Filter: horizontal scrollbar
- Upload-Button: vorhanden aber mit Desktop-Hinweis

### Kategorien

- Einfache Liste, bereits weitgehend mobile-tauglich
- Touch-Targets verifizieren

---

## Acceptance Criteria

- [ ] Personalakte: Card-basierte Dokumentliste auf Mobile
- [ ] Dokument-Vorschau: Fullscreen auf Mobile
- [ ] Kategorie-Filter: horizontal scrollbar
- [ ] Kein horizontaler Overflow auf 375px
