# ZMI-TICKET-202: Supabase Auth Migration

Status: Proposed
Priority: P1
Owner: TBD

## Goal
Authentifizierung von JWT-basiertem Go-Backend auf Supabase Auth migrieren. Login, Session-Management und Token-Refresh laufen über Supabase. Ein DB-Trigger synchronisiert Supabase Auth Users mit der bestehenden `users`-Tabelle. Der tRPC `auth`-Router bietet `me`, `permissions` und `logout` Endpoints.

## Scope
- **In scope:**
  - Supabase Auth Client Setup (Server + Client Side)
  - Login/Logout über Supabase Auth (Email/Password)
  - Session/Token-Refresh via Supabase Client
  - DB-Trigger: `auth.users` → `public.users` Sync
  - tRPC `auth`-Router: `me`, `permissions`, `logout`
  - Context Factory erweitern: User aus Supabase Session laden
  - Frontend: Auth-Provider und Session-Management
- **Out of scope:**
  - OAuth/Social Login (späteres Ticket)
  - DevLogin (wird in Dev-Umgebung durch Supabase Test-User ersetzt)
  - Permission-System/Middleware (TICKET-203)

## Requirements

### Supabase Auth Setup
- Supabase Client initialisieren (`@supabase/supabase-js`)
- Server-Side: `createServerClient` für App Router
- Client-Side: `createBrowserClient` für Client Components
- Middleware: `createServerClient` in Next.js Middleware für Session-Refresh

### DB-Trigger (Supabase SQL)
```sql
-- Trigger: Sync auth.users → public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, username, display_name, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### tRPC Router
- **Router-Name:** `auth`
- **Procedures:**
  - `auth.me` (query) — Aktuellen User mit Permissions zurückgeben
    - Input: keiner
    - Output: `{ user: User, permissions: string[], tenants: Tenant[] }`
    - Middleware: `protectedProcedure`
  - `auth.permissions` (query) — Nur Permissions des aktuellen Users
    - Input: keiner
    - Output: `{ permissions: string[] }`
    - Middleware: `protectedProcedure`
  - `auth.logout` (mutation) — Session beenden
    - Input: keiner
    - Output: `{ success: boolean }`
    - Middleware: `protectedProcedure`

### Frontend Hook Migration
- `apps/web/src/hooks/api/use-current-permissions.ts` → `trpc.auth.permissions.useQuery()`
- Auth-State aus Supabase Auth Client statt eigenem JWT-Management
- Login-Page: `supabase.auth.signInWithPassword()` statt API-Call

### Business Logic (aus Go portiert)
- `apps/api/internal/auth/jwt.go` — JWT-Generierung/Validierung (wird durch Supabase ersetzt)
- `apps/api/internal/handler/auth.go` (912 Zeilen) — Login, Refresh, Me, Logout, DevLogin
  - `Login()` → Supabase `signInWithPassword`
  - `Refresh()` → Supabase automatisches Token-Refresh
  - `Me()` → `auth.me` tRPC Procedure
  - `Logout()` → `auth.logout` tRPC Procedure
  - `DevLogin()` → Entfällt (Supabase Test-User)

## Acceptance Criteria
- [ ] Login über Supabase Auth funktioniert (Email/Password)
- [ ] Session wird automatisch refreshed
- [ ] DB-Trigger synct `auth.users` → `public.users`
- [ ] `auth.me` gibt User mit Permissions und Tenants zurück
- [ ] `auth.logout` beendet die Session
- [ ] Frontend Auth-Provider verwaltet Session-State
- [ ] Protected Routes leiten auf Login weiter wenn nicht authentifiziert
- [ ] Bestehende User-Daten werden nicht verloren

## Tests
- Unit-Test: DB-Trigger erzeugt `public.users` Eintrag
- Integration-Test: Login → Me → Logout Flow
- Integration-Test: Token-Refresh nach Ablauf
- Integration-Test: Unauthentifizierte Requests werden abgelehnt
- E2E-Test: Login-Page → Dashboard Navigation

## Dependencies
- ZMI-TICKET-200 (Prisma Schema: Core Foundation)
- ZMI-TICKET-201 (tRPC Server Setup)

## Go-Dateien die ersetzt werden
- `apps/api/internal/auth/jwt.go` (JWT Management)
- `apps/api/internal/handler/auth.go` (912 Zeilen — Login, Refresh, Me, Logout, DevLogin)
- `apps/api/internal/auth/devshifts.go` (Dev-Login Simulation)
- `apps/api/internal/auth/devusergroups.go` (Dev-User-Groups)
- `apps/api/internal/middleware/auth.go` (Auth Middleware)
- `apps/web/src/hooks/api/use-current-permissions.ts` (Frontend-Hook)
