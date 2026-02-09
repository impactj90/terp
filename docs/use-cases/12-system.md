# Phase 12: System & Audit

## UC-068: Systemeinstellungen pruefen/aendern

**Seite:** `/admin/settings`
**Aktion:** Systemeinstellungen aufrufen und bei Bedarf aendern

**Erwartetes Ergebnis:**
- Globale Einstellungen werden geladen und sind editierbar
- Aenderungen werden sofort wirksam

**Pruefpunkte:**
- [ ] Einstellungen laden ohne Fehler
- [ ] Aenderungen werden gespeichert und nach Reload noch vorhanden
- [ ] Nur Admins mit `system_settings.manage`-Berechtigung haben Zugriff

---

## UC-069: Audit-Log pruefen

**Seite:** `/admin/audit-logs`
**Aktion:** Audit-Log durchsuchen (wer hat wann was geaendert)

**Erwartetes Ergebnis:**
- Liste aller Aenderungen mit: Zeitstempel, Benutzer, Aktion, Entitaet, Details

**Pruefpunkte:**
- [ ] Buchungsaenderungen werden protokolliert (Erstellen, Bearbeiten, Loeschen)
- [ ] Filter nach Zeitraum, Benutzer, Aktionstyp funktioniert
- [ ] Detail-Ansicht zeigt Vorher/Nachher-Werte
- [ ] Audit-Logs sind nicht loeschbar (Integritaet)

---

## UC-070: Datenbereinigung durchfuehren

**Seite:** `/admin/settings`
**Aktion:** Bereinigungsaktionen ausfuehren (z.B. Buchungen loeschen, neu einlesen)

**Erwartetes Ergebnis:**
- Verschiedene Bereinigungsoptionen:
  - Buchungen loeschen (fuer Zeitraum)
  - Buchungsdaten loeschen (Tageswerte etc.)
  - Buchungen neu einlesen (von Terminal)
  - Auftraege zum Loeschen markieren

**Pruefpunkte:**
- [ ] Bestaetigungsdialog vor destruktiven Aktionen
- [ ] Nur Admins mit `system_settings.manage`-Berechtigung
- [ ] Nach "Buchungen loeschen": Buchungen im Zeitraum sind weg, Tageswerte muessen neu berechnet werden
- [ ] Nach "Neu einlesen": Terminal-Buchungen werden erneut importiert und verarbeitet
- [ ] Audit-Log-Eintrag fuer jede Bereinigungsaktion
