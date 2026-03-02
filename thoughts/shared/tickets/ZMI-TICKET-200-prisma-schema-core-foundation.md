# ZMI-TICKET-200: Prisma Schema: Core Foundation

Status: Proposed
Priority: P1
Owner: TBD

## Goal
Initiales Prisma-Setup und Schema-Definition für die Kern-Tabellen (users, tenants, user_groups, user_tenants). Dies bildet die Grundlage für alle weiteren Prisma-Migrationen und stellt sicher, dass das bestehende PostgreSQL-Schema korrekt in Prisma SDL abgebildet wird.

## Scope
- **In scope:**
  - Prisma-Projekt initialisieren (`prisma init`)
  - `prisma db pull` gegen bestehende Supabase-DB ausführen
  - Hand-Curation der Core-Tabellen: `users`, `tenants`, `user_groups`, `user_tenants`
  - Basis-Modelle (`BaseModel`-Pattern mit `id`, `created_at`, `updated_at`, `deleted_at`)
  - Prisma Client generieren und in Next.js einbinden
  - DB-Connection über Supabase Connection Pooler
- **Out of scope:**
  - Alle anderen Domain-Tabellen (kommen in TICKET-204, 205, etc.)
  - tRPC-Setup (TICKET-201)
  - Auth-Logik (TICKET-202)

## Requirements

### Prisma Schema
```prisma
model User {
  id            String   @id @default(uuid())
  username      String   @unique
  email         String   @unique
  display_name  String?
  avatar_url    String?
  is_active     Boolean  @default(true)
  employee_id   String?  @db.Uuid
  user_group_id String?  @db.Uuid
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt
  deleted_at    DateTime?

  tenant_access UserTenant[]
  user_group    UserGroup?   @relation(fields: [user_group_id], references: [id])
  employee      Employee?    @relation(fields: [employee_id], references: [id])

  @@map("users")
}

model Tenant {
  id         String   @id @default(uuid())
  name       String
  subdomain  String   @unique
  is_active  Boolean  @default(true)
  settings   Json?
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  deleted_at DateTime?

  user_tenants UserTenant[]

  @@map("tenants")
}

model UserGroup {
  id          String   @id @default(uuid())
  tenant_id   String   @db.Uuid
  name        String
  description String?
  is_active   Boolean  @default(true)
  is_admin    Boolean  @default(false)
  permissions Json     @default("[]")
  data_scope  String   @default("all")
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?

  users User[]

  @@map("user_groups")
}

model UserTenant {
  id        String   @id @default(uuid())
  user_id   String   @db.Uuid
  tenant_id String   @db.Uuid
  created_at DateTime @default(now())

  user   User   @relation(fields: [user_id], references: [id])
  tenant Tenant @relation(fields: [tenant_id], references: [id])

  @@unique([user_id, tenant_id])
  @@map("user_tenants")
}
```

### Prisma Client Setup
- Singleton-Pattern für Prisma Client (`lib/prisma.ts`)
- Connection String aus `SUPABASE_DATABASE_URL` Environment Variable
- Connection Pooling via Supabase Pooler (Port 6543)

### Projekt-Struktur
```
apps/web/
├── prisma/
│   └── schema.prisma
├── lib/
│   └── prisma.ts          # Prisma Client Singleton
```

## Acceptance Criteria
- [ ] `prisma db pull` erfolgreich gegen Supabase-DB
- [ ] Core-Tabellen korrekt in Prisma SDL definiert
- [ ] `prisma generate` erzeugt typisierte Client-Klasse
- [ ] Prisma Client als Singleton verfügbar in Next.js
- [ ] Bestehende DB-Daten werden nicht verändert (kein `prisma db push`)
- [ ] TypeScript-Typen für User, Tenant, UserGroup, UserTenant verfügbar

## Tests
- Unit-Test: Prisma Client verbindet sich zur DB
- Unit-Test: CRUD-Operationen auf User/Tenant-Modellen
- Integration-Test: Prisma Client liest bestehende Daten korrekt

## Dependencies
- Keine (erstes Ticket)

## Go-Dateien die ersetzt werden
- `apps/api/internal/model/user.go` (User struct, 70 Zeilen)
- `apps/api/internal/model/tenant.go` (Tenant struct, 40 Zeilen)
- `apps/api/internal/model/usergroup.go` (UserGroup struct, 44 Zeilen)
- `apps/api/internal/model/user_tenant.go` (UserTenant struct, 18 Zeilen)
- `apps/api/internal/model/base.go` (BaseModel, 14 Zeilen)
