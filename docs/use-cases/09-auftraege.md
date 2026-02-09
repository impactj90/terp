# Phase 9: Auftraege & Projekte

## UC-056: Auftrag anlegen

**Seite:** `/admin/orders`
**Aktion:** Auftrag erstellen (Name, Code, Beschreibung, Zeitraum)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `orders`-Tabelle
- `tenant_id` ist gesetzt

**Pruefpunkte:**
- [ ] Auftrag in `/admin/orders` sichtbar
- [ ] Auftrags-Detail-Seite erreichbar (`/admin/orders/{id}`)
- [ ] Code ist eindeutig

---

## UC-057: Mitarbeiter dem Auftrag zuweisen

**Seite:** `/admin/orders/{id}`
**Aktion:** Mitarbeiter zum Auftrag hinzufuegen (Zuweisung)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `order_assignments`-Tabelle
- `order_id`, `employee_id`

**Pruefpunkte:**
- [ ] Zuweisung in der Auftrags-Detail-Seite sichtbar
- [ ] Mitarbeiter kann Auftragsbuchungen fuer diesen Auftrag erfassen
- [ ] Entfernen der Zuweisung moeglich

---

## UC-058: Auftragsbuchung erfassen

**Seite:** `/admin/orders/{id}`
**Aktion:** Arbeitszeit auf den Auftrag buchen (Mitarbeiter, Datum, Stunden)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `order_bookings`-Tabelle
- Verknuepft mit `order_id` und `employee_id`

**Pruefpunkte:**
- [ ] Buchung in der Auftrags-Detail-Seite sichtbar
- [ ] Nur zugewiesene Mitarbeiter koennen buchen
- [ ] Summe der Auftragsstunden wird berechnet
- [ ] Auftragsbuchungen sind separat von normalen Zeitbuchungen
