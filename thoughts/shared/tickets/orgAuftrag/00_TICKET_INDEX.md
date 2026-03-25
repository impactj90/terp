# Ticket-Index: ZMI-Gap-Tickets (Mittlere Priorität)

_Erstellt: 2026-03-24_
_Quelle: ZMI orgAuftrag vs. Terp Abgleich + ZMI Time vs. Terp Abgleich_

## Status-Legende

- `[ ]` — Offen (nicht begonnen)
- `[~]` — In Arbeit
- `[x]` — Erledigt

---

## Warehouse / Lager

- [x] **WH_09** — Automatische Lagerbuchung bei Lieferschein _(M)_ → `TICKET_WH_09_LAGERBUCHUNG_BEI_LIEFERSCHEIN.md`
- [ ] **WH_10** — Artikelreservierungen bei Auftragsbestätigung _(L)_ → `TICKET_WH_10_ARTIKELRESERVIERUNGEN.md`
- [ ] **WH_11** — Korrekturassistent für Warenwirtschaft _(M)_ → `TICKET_WH_11_KORREKTURASSISTENT_WW.md`
- [ ] **WH_12** — Mobile QR-Scanner für Lagervorgänge _(L)_ → `TICKET_WH_12_MOBILE_QR_SCANNER.md`
- [x] **WH_13** — Artikelbilder _(M)_ → `TICKET_WH_13_ARTIKELBILDER.md`

## Einkauf

- [x] **EK_01** — Bestelldruck PDF _(M)_ → `TICKET_EK_01_BESTELLDRUCK_PDF.md`
- [x] **EK_02** — Freie Bestellpositionen _(S)_ → `TICKET_EK_02_FREIE_BESTELLPOSITIONEN.md`

## CRM

- [x] **CRM_06** — "Unsere Kundennummer" beim Lieferanten _(S)_ → `TICKET_CRM_06_UNSERE_KUNDENNUMMER.md`
- [ ] **CRM_07** — Anhänge bei Korrespondenz _(M)_ → `TICKET_CRM_07_KORRESPONDENZ_ANHAENGE.md`
- [x] **CRM_08** — Briefanrede bei Kontaktpersonen _(S)_ → `TICKET_CRM_08_BRIEFANREDE.md`
- [ ] **CRM_09** — Konzern-/Filialen-Zuordnung _(M)_ → `TICKET_CRM_09_KONZERNZUORDNUNG.md`

## HR / Personal

- [ ] **HR_01** — Personalakte mit Anhängen _(L)_ → `TICKET_HR_01_PERSONALAKTE.md`

## System / Administration

- [ ] **SYS_01** — DSGVO-Datenlöschung automatisiert _(M)_ → `TICKET_SYS_01_DSGVO_LOESCHUNG.md`

---

## Aufwand-Zusammenfassung

| Größe          | Anzahl | Tickets                                            |
| -------------- | ------ | -------------------------------------------------- |
| **S** (Klein)  | 3      | EK_02, CRM_06, CRM_08                              |
| **M** (Mittel) | 7      | WH_09, WH_11, WH_13, EK_01, CRM_07, CRM_09, SYS_01 |
| **L** (Groß)   | 3      | WH_10, WH_12, HR_01                                |

---

## Empfohlene Reihenfolge (Industrie/Produktion-Fokus)

1. **CRM_06** + **EK_02** (S, schnelle Wins für Einkauf)
2. **CRM_08** (S, schneller Win für Belege)
3. **EK_01** (M, Bestelldruck — Dependency auf CRM_06)
4. **WH_09** (M, Lagerbuchung bei LS — hoher Nutzen im Tagesbetrieb)
5. **WH_13** (M, Artikelbilder — Lagermitarbeiter-Identifizierung)
6. **WH_11** (M, Korrekturassistent — Bestandskontrolle)
7. **CRM_07** (M, Anhänge — Lieferantendoku)
8. **CRM_09** (M, Konzernzuordnung — für Industriegruppen)
9. **WH_10** (L, Reservierungen — parallele Aufträge)
10. **WH_12** (L, QR-Scanner — ersetzt Timeboy)
11. **HR_01** (L, Personalakte — Unterweisungen/Zertifikate)
12. **SYS_01** (M, DSGVO — Compliance, kann parallel laufen)

---

## Bestehende Tickets (bereits vorhanden)

Die folgenden Tickets existierten bereits und sind NICHT Teil dieser neuen Charge:

WH_01–WH_08, CRM_01–CRM_05, ORD_01–ORD_06, ORD_ERECHNUNG
