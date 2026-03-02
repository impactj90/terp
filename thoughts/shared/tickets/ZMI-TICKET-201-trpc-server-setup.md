# ZMI-TICKET-201: tRPC Server Setup

Status: Proposed
Priority: P1
Owner: TBD

## Goal
tRPC-Server in der Next.js App aufsetzen mit Context Factory, Procedure-Typen und App Router Handler. Dies ist die Grundlage für alle tRPC-Router, die in den folgenden Tickets implementiert werden.

## Scope
- **In scope:**
  - tRPC v11 Setup mit Next.js App Router
  - Context Factory mit Prisma Client und Auth-User
  - Procedure-Typen: `publicProcedure`, `protectedProcedure`, `tenantProcedure`
  - App Router Handler (`app/api/trpc/[trpc]/route.ts`)
  - tRPC Client Setup für Frontend (React Query Integration)
  - Error Handling und Zod-Validation Setup
- **Out of scope:**
  - Konkrete Domain-Router (ab TICKET-210)
  - Auth-Logik (TICKET-202)
  - Permission-Middleware (TICKET-203)

## Requirements

### tRPC Server
- Context Factory:
  ```typescript
  type Context = {
    prisma: PrismaClient
    user: User | null
    tenantId: string | null
    session: Session | null
  }
  ```
- `publicProcedure` — kein Auth erforderlich
- `protectedProcedure` — User muss authentifiziert sein (wirft `UNAUTHORIZED`)
- `tenantProcedure` — User authentifiziert + `tenantId` muss gesetzt sein (wirft `FORBIDDEN`)
- App Router Handler: `GET` und `POST` Exports in `app/api/trpc/[trpc]/route.ts`

### tRPC Client (Frontend)
- React Query Provider Wrapper
- `trpc` Client-Objekt mit typed Router
- SSR-fähig (optional, kann in späterem Ticket kommen)

### Projekt-Struktur
```
apps/web/
├── src/
│   ├── server/
│   │   ├── trpc.ts           # initTRPC, procedures, context
│   │   ├── root.ts           # appRouter (mergt alle Sub-Router)
│   │   └── routers/          # Sub-Router (ab TICKET-210)
│   ├── trpc/
│   │   ├── client.ts         # tRPC React Client
│   │   ├── provider.tsx      # TRPCProvider Wrapper
│   │   └── server.ts         # Server-side tRPC caller
│   └── app/
│       └── api/
│           └── trpc/
│               └── [trpc]/
│                   └── route.ts  # Next.js App Router Handler
```

### Frontend Hook Migration
- Neues `trpc` Client-Objekt das die bestehenden `useApiQuery`/`useApiMutation` Wrapper langfristig ersetzt
- Bestehende Hooks bleiben zunächst parallel aktiv

## Acceptance Criteria
- [ ] tRPC Server initialisiert mit Context Factory
- [ ] `publicProcedure`, `protectedProcedure`, `tenantProcedure` definiert
- [ ] App Router Handler antwortet auf `/api/trpc/*`
- [ ] tRPC Client im Frontend verfügbar
- [ ] Ein Health-Check-Procedure (`health.check`) funktioniert end-to-end
- [ ] Zod-Validation-Errors werden korrekt als tRPC-Errors zurückgegeben
- [ ] TypeScript-Typen sind end-to-end durchgereicht (Input → Output)

## Tests
- Unit-Test: Context Factory erstellt korrekten Context
- Integration-Test: Health-Check-Procedure über HTTP erreichbar
- Integration-Test: `protectedProcedure` wirft UNAUTHORIZED ohne Session
- Integration-Test: `tenantProcedure` wirft FORBIDDEN ohne Tenant-Header

## Dependencies
- ZMI-TICKET-200 (Prisma Schema: Core Foundation — für PrismaClient im Context)

## Go-Dateien die ersetzt werden
- `apps/api/cmd/server/main.go` (Server-Setup, Router-Initialisierung)
- `apps/api/internal/handler/routes.go` (Route-Registration-Pattern — wird durch tRPC-Router ersetzt)
- `apps/api/internal/handler/response.go` (respondJSON/respondError — wird durch tRPC Error Handling ersetzt)
