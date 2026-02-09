# Phase 1: Grundeinrichtung

## UC-001: Mandant anlegen

**Seite:** `/admin/tenants`
**Aktion:** Neuen Mandanten erstellen (Name, Slug, Adresse, Urlaubsbasis)

**Erwartetes Ergebnis:**
- Neuer Eintrag in der `tenants`-Tabelle mit allen Feldern
- Mandant erscheint in der Mandanten-Liste in der Admin-UI
- `is_active` ist standardmaessig `true`
- `vacation_basis` ist gesetzt (calendar_year oder entry_date)

**Pruefpunkte:**
- [ ] Mandant in `/admin/tenants` sichtbar
- [ ] Alle Pflichtfelder (Name, Slug, Adresse) korrekt gespeichert
- [ ] Slug ist URL-tauglich (lowercase, keine Sonderzeichen)
- [ ] Duplikat-Slug wird abgelehnt

---

## UC-002: Benutzergruppe anlegen

**Seite:** `/admin/user-groups`
**Aktion:** Neue Benutzergruppe erstellen (z.B. "Administratoren") mit Berechtigungen

**Erwartetes Ergebnis:**
- Neuer Eintrag in `user_groups`-Tabelle
- `permissions`-Spalte enthaelt JSON-Array der gewaehlten Berechtigungs-IDs
- `is_admin`-Flag korrekt gesetzt
- Gruppe erscheint in der Gruppenliste

**Pruefpunkte:**
- [ ] Gruppe in `/admin/user-groups` sichtbar
- [ ] Berechtigungen korrekt gespeichert (ueber `/api/v1/permissions` vergleichen)
- [ ] Wenn `is_admin = true`: Mitglieder bekommen automatisch `role = admin`
- [ ] Gruppe ist in der Benutzer-Erstellung als Dropdown waehlbar

---

## UC-003: Benutzer anlegen

**Seite:** `/admin/users`
**Aktion:** Neuen Benutzer mit Email, Passwort, Anzeigename und Benutzergruppe erstellen

**Erwartetes Ergebnis:**
- Neuer Eintrag in `users`-Tabelle
- `tenant_id` wird automatisch aus dem `X-Tenant-ID`-Header gesetzt (nicht NULL!)
- `password_hash` enthaelt bcrypt-Hash (beginnt mit `$2a$`)
- `role` wird aus der Benutzergruppe abgeleitet (`admin` wenn Gruppe `is_admin`, sonst `user`)
- `user_group_id` verweist auf die gewaehlte Gruppe
- `is_active = true`, `is_locked = false` standardmaessig

**Pruefpunkte:**
- [ ] Benutzer in `/admin/users` sichtbar
- [ ] `tenant_id` ist NICHT NULL in der DB
- [ ] `password_hash` ist NICHT NULL in der DB
- [ ] `role` stimmt mit Gruppen-Konfiguration ueberein
- [ ] Email ist eindeutig (Duplikat wird abgelehnt)

---

## UC-004: Ausloggen und mit neuem Benutzer einloggen

**Seite:** `/login`
**Aktion:** Ausloggen, dann mit Email/Passwort des neuen Benutzers anmelden

**Erwartetes Ergebnis:**
- Nach Logout: `auth_token` und `tenant_id` aus localStorage entfernt
- Login-Request geht OHNE `X-Tenant-ID`-Header (da nach Logout geloescht)
- Backend findet User per globalem Email-Lookup (`FindByEmail`)
- Response enthaelt `{token, user, tenant}`
- `auth_token` und `tenant_id` werden im localStorage gespeichert
- Redirect zum Dashboard

**Pruefpunkte:**
- [ ] Nach Logout: localStorage hat kein `auth_token` und kein `tenant_id`
- [ ] Login mit korrektem Passwort → Redirect zu `/dashboard`
- [ ] Login mit falschem Passwort → Fehlermeldung, kein Redirect
- [ ] Nach Login: `localStorage.getItem('tenant_id')` enthaelt UUID
- [ ] `/auth/me` liefert den neuen Benutzer zurueck
- [ ] `/auth/permissions` liefert die Berechtigungen der Benutzergruppe

---

## UC-005: Feiertage generieren

**Seite:** `/admin/holidays`
**Aktion:** Feiertage fuer ein Jahr generieren (z.B. 2026, Bundesland/Region waehlen)

**Erwartetes Ergebnis:**
- Eintraege in `holidays`-Tabelle fuer das gewaehlte Jahr
- Jeder Feiertag hat `tenant_id`, `holiday_date`, `name`, `category`
- Gesetzliche Feiertage (Neujahr, Ostern, Weihnachten etc.) sind enthalten

**Pruefpunkte:**
- [ ] Feiertage in `/admin/holidays` sichtbar, nach Datum sortiert
- [ ] Korrekte Anzahl Feiertage fuer die Region
- [ ] Feiertage beeinflussen spaeter die Tagesberechnung (kein Soll an Feiertagen)
- [ ] Duplikat-Generierung fuer gleiches Jahr wird verhindert oder merged

---

## UC-006: Abwesenheitsarten anlegen

**Seite:** `/admin/absence-types`
**Aktion:** Abwesenheitsarten erstellen (Urlaub, Krank, Sonderurlaub, Fortbildung etc.)

**Erwartetes Ergebnis:**
- Eintraege in `absence_types`-Tabelle
- Jede Art hat `code`, `name`, `category`, `portion`, `deducts_vacation`, `color`
- `tenant_id` ist gesetzt

**Pruefpunkte:**
- [ ] Abwesenheitsarten in `/admin/absence-types` sichtbar
- [ ] Arten sind in der Abwesenheits-Beantragung (`/absences`) als Dropdown waehlbar
- [ ] `deducts_vacation = true` bei Urlaub → spaeter wird Urlaubssaldo reduziert
- [ ] `deducts_vacation = false` bei Krank → kein Urlaubsabzug

---

## UC-007: Buchungsarten pruefen/anlegen

**Seite:** `/admin/booking-types`
**Aktion:** Buchungsarten pruefen (Kommen, Gehen sind System-Buchungsarten), ggf. eigene anlegen (Dienstgang, Pause etc.)

**Erwartetes Ergebnis:**
- System-Buchungsarten (`is_system = true`) sind vorhanden und nicht loeschbar
- Eigene Buchungsarten haben `tenant_id`, `direction` (in/out), `category`
- Buchungsarten haben einen `code` (eindeutig) und `name`

**Pruefpunkte:**
- [ ] System-Buchungsarten (Kommen/Gehen) sind vorhanden
- [ ] Eigene Buchungsarten erscheinen in der Buchungs-Erstellung
- [ ] `direction` bestimmt ob Kommen (in) oder Gehen (out)
- [ ] Loeschen von System-Buchungsarten wird verhindert

---

## UC-008: Kontaktarten anlegen

**Seite:** `/admin/contact-types`
**Aktion:** Kontaktarten erstellen (Privat-Email, Geschaefts-Telefon, Notfallkontakt etc.)

**Erwartetes Ergebnis:**
- Eintraege in `contact_kinds`-Tabelle
- Kontaktarten sind spaeter bei Mitarbeiter-Kontakten waehlbar

**Pruefpunkte:**
- [ ] Kontaktarten in `/admin/contact-types` sichtbar
- [ ] Arten erscheinen in der Mitarbeiter-Detail-Seite beim Kontakt-Hinzufuegen

---

## UC-009: Beschaeftigungsarten anlegen

**Seite:** `/admin/employment-types`
**Aktion:** Beschaeftigungsarten erstellen (Vollzeit, Teilzeit, Minijob, Werkstudent etc.)

**Erwartetes Ergebnis:**
- Eintraege in der Datenbank
- Beschaeftigungsarten sind bei der Mitarbeiter-Erstellung waehlbar

**Pruefpunkte:**
- [ ] Beschaeftigungsarten in `/admin/employment-types` sichtbar
- [ ] Arten erscheinen als Auswahl im Mitarbeiter-Formular

---

## UC-010: Kostenstellen anlegen

**Seite:** `/admin/cost-centers`
**Aktion:** Kostenstellen erstellen (Code + Name, z.B. "KST-100 Verwaltung")

**Erwartetes Ergebnis:**
- Eintraege in `cost_centers`-Tabelle
- Kostenstellen sind bei Mitarbeitern und Auftraegen zuweisbar

**Pruefpunkte:**
- [ ] Kostenstellen in `/admin/cost-centers` sichtbar
- [ ] Code ist eindeutig

---

## UC-011: Standorte anlegen

**Seite:** `/admin/locations`
**Aktion:** Standorte erstellen (Name, Adresse)

**Erwartetes Ergebnis:**
- Eintraege in `locations`-Tabelle
- Standorte sind bei Mitarbeitern zuweisbar

**Pruefpunkte:**
- [ ] Standorte in `/admin/locations` sichtbar
