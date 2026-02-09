# Phase 6: Verwaltung & Genehmigungen (Admin-Sicht)

## UC-039: Abwesenheitsantrag genehmigen/ablehnen

**Seite:** `/admin/approvals`
**Aktion:** Offenen Abwesenheitsantrag genehmigen oder ablehnen

**Erwartetes Ergebnis bei Genehmigung:**
- `status` in `absence_days` aendert sich von `pending` zu `approved`
- `approved_by` und `approved_at` werden gesetzt
- Wenn `deducts_vacation = true`: `taken` in `vacation_balances` wird hochgezaehlt
- Benachrichtigung an den Antragsteller wird erstellt

**Erwartetes Ergebnis bei Ablehnung:**
- `status` in `absence_days` aendert sich von `pending` zu `rejected`
- `rejection_reason` wird gesetzt
- Urlaubssaldo bleibt unveraendert
- Benachrichtigung an den Antragsteller wird erstellt

**Pruefpunkte:**
- [ ] Genehmigte Abwesenheit verschwindet aus der Genehmigungsliste
- [ ] Genehmigte Abwesenheit erscheint in `/absences` des Mitarbeiters mit Status "Genehmigt"
- [ ] Urlaubssaldo in `/vacation` des Mitarbeiters ist aktualisiert (bei Urlaub)
- [ ] Abgelehnte Abwesenheit zeigt Ablehnungsgrund
- [ ] Benachrichtigung beim Mitarbeiter sichtbar

---

## UC-040: Tageswerte in Evaluations-Ansicht pruefen

**Seite:** `/admin/evaluations`
**Aktion:** Tageswerte filtern (Mitarbeiter, Zeitraum) und pruefen

**Erwartetes Ergebnis:**
- Liste aller Tageswerte mit: Datum, Soll, Ist (Brutto/Netto), Ueberstunden, Pausenzeit
- Fehlerhafte Tage sind markiert (`has_error = true`)
- Filter nach Mitarbeiter, Zeitraum, Fehler-Status

**Pruefpunkte:**
- [ ] Tageswerte aus `daily_values`-Tabelle werden korrekt angezeigt
- [ ] Buchungen pro Tag einsehbar (Drill-Down)
- [ ] Fehler-Codes und Warnungen sichtbar
- [ ] Audit-Log pro Buchung einsehbar

---

## UC-041: Korrektur-Assistent nutzen

**Seite:** `/admin/correction-assistant`
**Aktion:** Fehlerhafte Tage identifizieren und Korrektur-Nachrichten an Mitarbeiter senden

**Erwartetes Ergebnis:**
- Liste fehlerhafter Tage (fehlende Buchungen, unvollstaendige Paare)
- Nachricht an Mitarbeiter erstellen mit Hinweis auf fehlende Buchung

**Pruefpunkte:**
- [ ] Fehlerhafte Tage werden automatisch identifiziert
- [ ] Nachricht wird beim Mitarbeiter als Benachrichtigung angezeigt
- [ ] Nach Korrektur durch Mitarbeiter: Fehler verschwindet aus der Liste

---

## UC-042: Tageswerte neu berechnen

**Seite:** `/timesheet` oder `/admin/evaluations`
**Aktion:** Neuberechnung fuer einen bestimmten Tag ausloesen

**Erwartetes Ergebnis:**
- `daily_values`-Eintrag wird aktualisiert
- `calculated_at` wird auf jetzt gesetzt
- Werte (gross_time, net_time, target_time, overtime etc.) werden neu berechnet
- Pausen werden automatisch beruecksichtigt (aus Tagesplan/Tarif)

**Pruefpunkte:**
- [ ] Neue Berechnung nach Buchungsaenderung liefert korrekte Werte
- [ ] Soll-Zeit kommt aus dem Tagesplan des Mitarbeiters
- [ ] Brutto-Zeit = Letzte Gehen-Buchung - Erste Kommen-Buchung
- [ ] Netto-Zeit = Brutto-Zeit - Pausenzeit
- [ ] Ueberstunden = Netto-Zeit - Soll-Zeit (wenn positiv)
- [ ] Feiertage: Soll = 0, Ueberstunden = gesamte Netto-Zeit

---

## UC-043: Monatswerte pruefen und Monat abschliessen

**Seite:** `/admin/monthly-values`
**Aktion:** Monatswerte filtern, pruefen und Monat abschliessen

**Erwartetes Ergebnis bei Abschluss:**
- `is_closed = true` in `monthly_values`-Tabelle
- Keine Buchungsaenderungen mehr moeglich fuer diesen Monat
- Flexzeit-Endwert wird als Start fuer naechsten Monat uebernommen

**Pruefpunkte:**
- [ ] Monatswerte zeigen Summen: Soll, Ist, Ueberstunden, Fehlzeiten, Krankheitstage
- [ ] Flexzeit-Verlauf: Start + Aenderung = Ende
- [ ] Abgeschlossener Monat ist in der UI als "Abgeschlossen" markiert
- [ ] Buchungen im abgeschlossenen Monat sind schreibgeschuetzt
- [ ] Wiedereroeffnung setzt `is_closed = false` zurueck

---

## UC-044: Monat wiedereroffnen

**Seite:** `/admin/monthly-values`
**Aktion:** Abgeschlossenen Monat wieder oeffnen

**Erwartetes Ergebnis:**
- `is_closed = false`
- Buchungen koennen wieder bearbeitet werden

**Pruefpunkte:**
- [ ] Status wechselt zurueck auf "Offen"
- [ ] Buchungen im Monat sind wieder editierbar
- [ ] Neuberechnung ist wieder moeglich

---

## UC-045: Monatswerte Batch-Abschluss

**Seite:** `/admin/monthly-values`
**Aktion:** Mehrere Mitarbeiter-Monate auf einmal abschliessen

**Erwartetes Ergebnis:**
- Alle gewaehlten Monatswerte werden auf `is_closed = true` gesetzt

**Pruefpunkte:**
- [ ] Batch-Abschluss fuer alle gewaehlten Mitarbeiter erfolgreich
- [ ] Bereits abgeschlossene werden uebersprungen
