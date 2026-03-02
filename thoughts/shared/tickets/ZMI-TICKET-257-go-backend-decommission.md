# ZMI-TICKET-257: Go Backend Decommission

Status: Proposed
Priority: P3
Owner: TBD

## Goal
Das vollständige Go-Backend (`apps/api/`) und zugehörige Infrastruktur entfernen, nachdem alle Endpoints auf tRPC migriert und verifiziert wurden. Dies ist das letzte Ticket der Migration.

## Scope
- **In scope:**
  - `apps/api/` komplett entfernen
  - `api/` (OpenAPI Spec) entfernen
  - `go.work` und `go.mod`/`go.sum` in `apps/api/` entfernen
  - Go-spezifische Docker-Compose Services entfernen
  - Makefile-Targets für Go entfernen (swagger-bundle, generate, lint, fmt, test)
  - Go-spezifische CI/CD-Konfiguration entfernen
  - Legacy Frontend-Hooks (`apps/web/src/hooks/api/`) entfernen (wenn komplett auf tRPC migriert)
  - Legacy API-Client entfernen
  - Dokumentation aktualisieren
- **Out of scope:**
  - DB-Schema-Änderungen (Prisma verwaltet jetzt das Schema)
  - Deployment-Infrastruktur (Vercel ist bereits aktiv)

## Requirements

### Zu löschende Verzeichnisse/Dateien
```
apps/api/                    # Gesamtes Go-Backend (302 Dateien, ~115.000 Zeilen)
api/                         # OpenAPI Spec (Multi-File + Bundled)
go.work                     # Go Workspace
db/migrations/              # Go-migrate SQL-Dateien (88 Dateien)
docker/docker-compose.yml   # Go-Backend Docker Services (DB bleibt)
```

### Makefile-Bereinigung
Folgende Targets entfernen:
- `install-tools` (Go tools)
- `dev` / `dev-down` / `dev-logs` / `dev-ps` (Docker-basiert)
- `migrate-up` / `migrate-down` / `migrate-create` (golang-migrate)
- `swagger-bundle` / `generate` (OpenAPI)
- `test` / `lint` / `fmt` (Go-spezifisch)

Neue Targets hinzufügen:
- `dev` → `npm run dev` (Next.js)
- `db:push` → `npx prisma db push`
- `db:generate` → `npx prisma generate`
- `test` → `npm test`

### Legacy Frontend-Hooks Bereinigung
- `apps/web/src/hooks/api/` komplett entfernen
- `apps/web/src/hooks/api/index.ts` entfernen
- Alle Imports auf tRPC-Hooks umstellen
- Bestehende API-Client-Utility entfernen

### Dokumentation
- `CLAUDE.md` aktualisieren (neue Architektur, Commands, etc.)
- README.md aktualisieren (wenn vorhanden)

## Acceptance Criteria
- [ ] `apps/api/` vollständig entfernt
- [ ] `api/` (OpenAPI) entfernt
- [ ] `go.work` entfernt
- [ ] Makefile aktualisiert
- [ ] Legacy Frontend-Hooks entfernt
- [ ] Keine Go-Importe oder -Referenzen mehr im Codebase
- [ ] `npm run dev` startet die Anwendung erfolgreich
- [ ] Alle tRPC-Endpoints funktionieren
- [ ] CI/CD Pipeline funktioniert ohne Go
- [ ] Dokumentation aktualisiert

## Tests
- Smoke-Test: Anwendung startet ohne Go-Backend
- E2E-Test: Alle kritischen User-Flows funktionieren
- Regression-Test: Keine Broken Imports
- Build-Test: `npm run build` erfolgreich

## Dependencies
- **ALLE vorherigen Tickets** (200-250) müssen abgeschlossen sein
- Verifizierung: Jeder Go-Endpoint hat tRPC-Äquivalent
- Verifizierung: Jeder Frontend-Hook nutzt tRPC

## Go-Dateien die ersetzt werden
- Gesamtes `apps/api/` Verzeichnis:
  - `apps/api/internal/service/` (87 Dateien, 54.674 Zeilen)
  - `apps/api/internal/handler/` (75 Dateien, 36.127 Zeilen)
  - `apps/api/internal/repository/` (69 Dateien, 19.973 Zeilen)
  - `apps/api/internal/model/` (71 Dateien, 4.338 Zeilen)
  - `apps/api/internal/middleware/` (Auth, Tenant, Authorization)
  - `apps/api/internal/auth/` (JWT, DevLogin)
  - `apps/api/internal/config/` (Environment Config)
  - `apps/api/cmd/server/main.go` (Server Entrypoint)
  - `apps/api/gen/models/` (Generated Models)
- `api/` (OpenAPI Spec)
- `db/migrations/` (88 SQL-Migrationen)
