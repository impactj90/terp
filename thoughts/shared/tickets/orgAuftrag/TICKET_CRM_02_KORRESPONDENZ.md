# CRM_02 — Korrespondenz-Protokoll

| Field | Value |
|-------|-------|
| **Module** | CRM |
| **Dependencies** | CRM_01 (Addresses, Contacts) |
| **Complexity** | M |
| **New Models** | `CrmCorrespondence` |
| **Status** | Done |
| **Completed** | 2026-03-17 |

---

## Goal

Provide a communication log (Korrespondenz) per CRM address. Every phone call, email, letter, fax, or visit is recorded with direction (incoming/outgoing/internal), linked to a contact person and optionally to an inquiry (CRM_03). Supports full-text search across subject and body, and file attachments. This replaces ZMI orgAuftrag section 1.3.

---

## Prisma Models

### CrmCorrespondence

```prisma
enum CrmCorrespondenceDirection {
  INCOMING
  OUTGOING
  INTERNAL

  @@map("crm_correspondence_direction")
}

model CrmCorrespondence {
  id            String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String                      @map("tenant_id") @db.Uuid
  addressId     String                      @map("address_id") @db.Uuid
  direction     CrmCorrespondenceDirection
  type          String                      // "phone", "email", "letter", "fax", "visit" — tenant-configurable
  date          DateTime                    @db.Timestamptz(6)
  contactId     String?                     @map("contact_id") @db.Uuid  // Counter-party contact
  inquiryId     String?                     @map("inquiry_id") @db.Uuid  // Linked inquiry/Vorgang (CRM_03)
  fromUser      String?                     @map("from_user")   // Internal sender name/id
  toUser        String?                     @map("to_user")     // Internal recipient name/id
  subject       String
  content       String?                     // Rich-text / memo
  attachments   Json?                       @db.JsonB // Array of { name, url, size, mimeType }
  createdAt     DateTime                    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime                    @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById   String?                     @map("created_by_id") @db.Uuid

  tenant  Tenant     @relation(fields: [tenantId], references: [id])
  address CrmAddress @relation(fields: [addressId], references: [id], onDelete: Cascade)
  contact CrmContact? @relation(fields: [contactId], references: [id], onDelete: SetNull)
  // inquiry relation added in CRM_03

  @@index([tenantId, addressId])
  @@index([tenantId, date])
  @@index([tenantId, inquiryId])
  @@map("crm_correspondences")
}
```

**Note:** Attachments stored as JSONB array. File upload uses existing Supabase Storage bucket. The `attachments` field stores metadata; actual files are in Supabase Storage under `crm-attachments/{tenantId}/{correspondenceId}/`.

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("crm_correspondence.view", "crm_correspondence", "view", "View CRM correspondence"),
p("crm_correspondence.create", "crm_correspondence", "create", "Create CRM correspondence"),
p("crm_correspondence.edit", "crm_correspondence", "edit", "Edit CRM correspondence"),
p("crm_correspondence.delete", "crm_correspondence", "delete", "Delete CRM correspondence"),
```

---

## tRPC Router

**File:** `src/trpc/routers/crm/correspondence.ts`

All procedures use `tenantProcedure.use(requireModule("crm"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `crm_correspondence.view` | `{ addressId?, inquiryId?, search?, direction?, type?, dateFrom?, dateTo?, page, pageSize }` | Paginated list; full-text search in subject + content |
| `getById` | query | `crm_correspondence.view` | `{ id }` | Single entry with contact details |
| `create` | mutation | `crm_correspondence.create` | `{ addressId, direction, type, date, contactId?, inquiryId?, subject, content?, attachments? }` | Creates correspondence entry |
| `update` | mutation | `crm_correspondence.edit` | `{ id, ...fields }` | Partial update |
| `delete` | mutation | `crm_correspondence.delete` | `{ id }` | Hard delete (correspondence is a log, soft-delete not needed) |

### Input Schemas

```ts
const createInput = z.object({
  addressId: z.string().uuid(),
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]),
  type: z.string().min(1), // "phone", "email", "letter", "fax", "visit"
  date: z.date(),
  contactId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  fromUser: z.string().optional(),
  toUser: z.string().optional(),
  subject: z.string().min(1),
  content: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    size: z.number(),
    mimeType: z.string(),
  })).optional(),
})

const listInput = z.object({
  addressId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
  search: z.string().optional(),
  direction: z.enum(["INCOMING", "OUTGOING", "INTERNAL"]).optional(),
  type: z.string().optional(),
  dateFrom: z.date().optional(),
  dateTo: z.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
})
```

---

## Service Layer

**Files:**
- `src/lib/services/crm-correspondence-service.ts`
- `src/lib/services/crm-correspondence-repository.ts`

### Key Logic

- `list` — When `search` is provided, filter where `subject ILIKE %search%` OR `content ILIKE %search%`. If search starts with `?`, search in middle of text (equivalent to ZMI's "?" prefix, but since we use ILIKE `%term%` by default, the `?` prefix is treated as a no-op for UX consistency).
- `create` — Validates that `addressId` belongs to the tenant. If `contactId` is provided, validates it belongs to the address. If `inquiryId` is provided, validates it belongs to the tenant.
- `delete` — Hard delete. Removes associated files from Supabase Storage.

---

## UI Components

### Integration Points

Correspondence is displayed as a tab on the address detail page (CRM_01) and optionally on the inquiry detail page (CRM_03).

### Component Files

All in `src/components/crm/`:

| Component | Description |
|-----------|-------------|
| `correspondence-list.tsx` | Table showing correspondence entries. Columns: Date, Direction (icon), Type, Subject, Contact. Toolbar: search, direction filter, date range, type filter. |
| `correspondence-form-sheet.tsx` | Sheet form for create/edit. Direction selector (In/Out/Internal), type dropdown, date picker, contact autocomplete, subject, rich text content, attachment upload. |
| `correspondence-detail-dialog.tsx` | Read-only dialog showing full entry with attachments. |
| `correspondence-type-badge.tsx` | Visual badge for correspondence type (phone icon, email icon, etc.) |

### Global Correspondence Page (optional)

| Route | Description |
|-------|-------------|
| `/crm/correspondence` | Tenant-wide correspondence list with address filter. Useful for reports (CRM_05). |

---

## Hooks

**File:** `src/hooks/use-crm-correspondence.ts`

```ts
export function useCrmCorrespondence(filters) {
  return useQuery(trpc.crm.correspondence.list.queryOptions(filters))
}

export function useCreateCrmCorrespondence() {
  return useMutation({
    ...trpc.crm.correspondence.create.mutationOptions(),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: trpc.crm.correspondence.list.queryKey() })
    },
  })
}
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/crm-correspondence-service.test.ts`

- `create` — creates entry linked to address and contact
- `create` — rejects if addressId belongs to different tenant
- `create` — rejects if contactId doesn't belong to addressId
- `list` — filters by direction, type, date range
- `list` — full-text search in subject and content (case-insensitive)
- `list` — scoped to tenant
- `delete` — removes entry

### Router Tests

**File:** `src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`

```ts
describe("crm.correspondence", () => {
  it("list — requires crm_correspondence.view permission", async () => { })
  it("list — requires CRM module enabled", async () => { })
  it("create — creates entry with all fields", async () => { })
  it("search — finds by subject substring", async () => { })
  it("search — finds by content substring", async () => { })
  it("list — filters by date range", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/21-crm-correspondence.spec.ts`

```ts
test.describe("UC-CRM-02: Correspondence", () => {
  test("log a phone call for an address", async ({ page }) => {
    // Navigate to address detail → Correspondence tab
    // Click "New Entry"
    // Select direction: Outgoing, type: Phone
    // Fill subject, content
    // Submit → verify entry in list
  })

  test("search correspondence by subject", async ({ page }) => {
    // Type in search → verify filtered
  })

  test("filter by direction", async ({ page }) => {
    // Select "Incoming" → verify only incoming shown
  })
})
```

---

## Acceptance Criteria

- [x] `CrmCorrespondence` model created with migration
- [x] CRUD operations fully functional
- [x] Correspondence entries scoped to tenant
- [x] Full-text search works across subject and content fields
- [x] Direction and type filters work
- [x] Date range filter works
- [x] Contact autocomplete shows contacts from the linked address
- [ ] Inquiry link works (optional, populated when CRM_03 is implemented)
- [ ] Attachment upload/download works via Supabase Storage
- [x] Correspondence tab visible on address detail page
- [x] All procedures gated by `requireModule("crm")` and `crm_correspondence.*` permissions
- [x] Cross-tenant isolation verified
