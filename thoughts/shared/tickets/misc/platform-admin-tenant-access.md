# Platform-Admin: Mandanten-Zugriff fuer Betreiber

## Kontext

Als SaaS-Betreiber/Entwickler moechte ich ueber die UI auf alle Mandanten zugreifen koennen,
um gemeldete Bugs nachzuvollziehen und Einstellungen direkt einzusehen — ohne in die Datenbank
schauen zu muessen.

## Anforderungen

### Must-Have

1. **Platform-Admin Kennzeichnung**
   - Neue Tabelle `platform_admins` (user_id, created_at, created_by) oder `is_platform_admin` Flag am User
   - Klar getrennt von tenant-level Admin-Rollen

2. **Tenant-Switcher UI**
   - Dropdown/Searchbar im Header um zwischen Mandanten zu wechseln
   - Nur sichtbar fuer Platform-Admins
   - Zeigt Tenant-Name + ID an

3. **Read-Only Mode (Default)**
   - Platform-Admin sieht alle Daten des gewaehlten Mandanten
   - Kann standardmaessig nichts aendern (kein Create/Update/Delete)
   - Optionaler "Write-Mode" mit expliziter Bestaetigung (fuer Hotfixes)

4. **Audit-Logging**
   - Jeder Platform-Admin-Zugriff auf einen Mandanten wird geloggt
   - Log-Eintraege: user_id, tenant_id, timestamp, action (view/switch/write)
   - Bestehende Audit-Infrastruktur erweitern

### Nice-to-Have

- Impersonation-Banner: Sichtbarer Hinweis in der UI ("Du siehst Mandant XYZ als Platform-Admin")
- Quick-Links aus Fehlerberichten direkt zum betroffenen Mandanten
- Export von Mandanten-Einstellungen als JSON (fuer Bug-Reports)

## Technischer Ansatz

### Backend

- **Middleware**: Neue `isPlatformAdmin()`-Pruefung in `src/lib/auth/`
- **Tenant-Bypass**: Platform-Admin umgeht `user_tenants`-Check, aber Zugriff wird geloggt
- **Read-Only Enforcement**: tRPC-Middleware die Mutations blockt wenn `platformAdminReadOnly=true`
- **Router**: `platformAdmin`-Router fuer Tenant-Liste, Switch, Audit-Log-Einsicht

### Frontend

- **Tenant-Switcher Komponente**: `src/components/layout/tenant-switcher.tsx`
- **Impersonation-Banner**: Sticky-Banner oben wenn fremder Mandant aktiv
- **Hook**: `usePlatformAdmin()` — prueft Status, steuert UI-Elemente

### Datenmodell

```sql
CREATE TABLE platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE platform_admin_access_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  tenant_id  UUID NOT NULL REFERENCES tenants(id),
  action     VARCHAR(20) NOT NULL, -- 'switch', 'view', 'write'
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

## Rechtliche Voraussetzungen (DSGVO)

- [ ] AVV (Auftragsverarbeitungsvertrag) um Passus fuer technischen Support-Zugriff ergaenzen
- [ ] Rechtsgrundlage dokumentieren: Art. 6 Abs. 1 lit. b (Vertragserfullung) oder lit. f (berechtigtes Interesse)
- [ ] Zweckbindung: Zugriff nur zur Fehlerbehebung und Support
- [ ] Datensparsamkeit: Read-Only als Default
- [ ] Audit-Trail fuer Nachweispflicht

## Abhaengigkeiten

- Bestehendes Audit-System (`audit_logs`-Tabelle)
- `user_tenants`-Tabelle (Tenant-Zuordnung)
- Bestehende Auth-Middleware in `src/lib/auth/`

## Schaetzung

- Backend (Middleware, Router, Service): ~1-2 Tage
- Frontend (Switcher, Banner, Hook): ~1 Tag
- Migrationen + Tests: ~0.5 Tage
- Rechtliche Pruefung AVV: separat
