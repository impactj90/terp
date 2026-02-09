# Phase 11: Reporting & Export

## UC-063: Report generieren

**Seite:** `/admin/reports`
**Aktion:** Report generieren (z.B. Monatsuebersicht, Urlaubsreport, Ueberstundenreport)

**Erwartetes Ergebnis:**
- Neuer Eintrag in `reports`-Tabelle mit Metadaten
- Report-Datei (XLSX) wird generiert und gespeichert

**Pruefpunkte:**
- [ ] Report in `/admin/reports` sichtbar mit Status
- [ ] Verschiedene Report-Typen waehlbar (monthly_overview, vacation, overtime, department_summary, account_balances)
- [ ] Filter: Mitarbeiter, Zeitraum, Abteilung
- [ ] Report-Generierung laeuft asynchron (kein Timeout bei grossen Datenmengen)

---

## UC-064: Report herunterladen

**Seite:** `/admin/reports`
**Aktion:** Generierten Report als XLSX herunterladen

**Erwartetes Ergebnis:**
- XLSX-Datei wird heruntergeladen
- Inhalt entspricht den gewaehlten Filtern

**Pruefpunkte:**
- [ ] Download startet korrekt
- [ ] XLSX oeffnet sich in Excel/LibreOffice ohne Fehler
- [ ] Daten im XLSX stimmen mit der UI ueberein
- [ ] Formatierung (Zahlenformat, Datumsformat) ist korrekt

---

## UC-065: Export-Schnittstelle konfigurieren

**Seite:** `/admin/export-interfaces`
**Aktion:** Export-Schnittstelle fuer Lohnbuchhaltung einrichten (Konten-Mapping)

**Erwartetes Ergebnis:**
- Eintrag in `export_interfaces`-Tabelle
- Konto-Zuordnungen in `export_interface_accounts`

**Pruefpunkte:**
- [ ] Schnittstelle in `/admin/export-interfaces` sichtbar
- [ ] Konten koennen der Schnittstelle zugeordnet werden
- [ ] Schnittstelle ist bei Lohnexport-Generierung waehlbar

---

## UC-066: Lohnexport generieren und herunterladen

**Seite:** `/admin/payroll-exports`
**Aktion:** Lohnexport fuer einen Monat generieren

**Erwartetes Ergebnis:**
- Eintrag in `payroll_exports`-Tabelle
- Export-Datei wird generiert (basierend auf Export-Schnittstelle und Monatswerten)

**Pruefpunkte:**
- [ ] Export in `/admin/payroll-exports` sichtbar
- [ ] Vorschau zeigt die zu exportierenden Daten
- [ ] Download der Export-Datei moeglich
- [ ] Nur abgeschlossene Monate koennen exportiert werden (oder Warnung)
- [ ] Werte stimmen mit Monatswerten ueberein

---

## UC-067: Monatsauswertungs-Template anpassen

**Seite:** `/admin/monthly-evaluations`
**Aktion:** Template fuer die Monatsauswertung erstellen/bearbeiten

**Erwartetes Ergebnis:**
- Eintrag in DB mit Template-Konfiguration
- Definiert welche Felder/Spalten in der Monatsauswertung angezeigt werden

**Pruefpunkte:**
- [ ] Template in `/admin/monthly-evaluations` sichtbar
- [ ] Standard-Template kann gesetzt werden
- [ ] Template beeinflusst die Darstellung in `/monthly-evaluation`
