# ORD_05 — Wiederkehrende Rechnungen

| Field | Value |
|-------|-------|
| **Module** | Billing |
| **Dependencies** | ORD_01 (Documents — INVOICE type) |
| **Complexity** | M |
| **New Models** | `BillingRecurringInvoice` |

---

## Goal

Implement recurring invoices for maintenance contracts (Wartungsverträge). A recurring invoice is a template that generates actual invoices at configurable intervals (monthly, quarterly, yearly). Supports manual or automatic generation via cron job. Particularly relevant for Pro-Di's maintenance contracts. Replaces ZMI orgAuftrag section 4.6 and section 18.

---

## Prisma Models

### BillingRecurringInvoice

```prisma
enum BillingRecurringInterval {
  MONTHLY
  QUARTERLY
  SEMI_ANNUALLY
  ANNUALLY

  @@map("billing_recurring_interval")
}

model BillingRecurringInvoice {
  id              String                   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String                   @map("tenant_id") @db.Uuid
  name            String                   // Template name / contract reference
  addressId       String                   @map("address_id") @db.Uuid
  contactId       String?                  @map("contact_id") @db.Uuid
  interval        BillingRecurringInterval
  startDate       DateTime                 @map("start_date") @db.Timestamptz(6) // First invoice date
  endDate         DateTime?                @map("end_date") @db.Timestamptz(6)   // Contract end (null = indefinite)
  nextDueDate     DateTime                 @map("next_due_date") @db.Timestamptz(6) // Next generation date
  lastGeneratedAt DateTime?                @map("last_generated_at") @db.Timestamptz(6)
  autoGenerate    Boolean                  @default(false) @map("auto_generate") // Auto-generate via cron
  isActive        Boolean                  @default(true) @map("is_active")

  // Invoice template fields (copied to each generated invoice)
  deliveryType    String?                  @map("delivery_type")
  deliveryTerms   String?                  @map("delivery_terms")
  paymentTermDays Int?                     @map("payment_term_days")
  discountPercent Float?                   @map("discount_percent")
  discountDays    Int?                     @map("discount_days")
  notes           String?
  internalNotes   String?                  @map("internal_notes")

  // Template positions stored as JSONB (avoids separate junction table)
  positionTemplate Json                    @map("position_template") @db.JsonB
  // Array of { type, articleId?, articleNumber?, description, quantity, unit, unitPrice, flatCosts, vatRate }

  createdAt       DateTime                 @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime                 @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById     String?                  @map("created_by_id") @db.Uuid

  tenant  Tenant     @relation(fields: [tenantId], references: [id])
  address CrmAddress @relation(fields: [addressId], references: [id])
  contact CrmContact? @relation(fields: [contactId], references: [id], onDelete: SetNull)

  @@index([tenantId, isActive])
  @@index([tenantId, nextDueDate])
  @@map("billing_recurring_invoices")
}
```

---

## Permissions

Add to `permission-catalog.ts`:

```ts
p("billing_recurring.view", "billing_recurring", "view", "View recurring invoices"),
p("billing_recurring.manage", "billing_recurring", "manage", "Manage recurring invoice templates"),
p("billing_recurring.generate", "billing_recurring", "generate", "Generate invoices from recurring templates"),
```

---

## tRPC Router

**File:** `src/trpc/routers/billing/recurringInvoices.ts`

All procedures use `tenantProcedure.use(requireModule("billing"))`.

### Procedures

| Procedure | Type | Permission | Input | Description |
|-----------|------|-----------|-------|-------------|
| `list` | query | `billing_recurring.view` | `{ isActive?, addressId?, search?, page, pageSize }` | All recurring templates |
| `getById` | query | `billing_recurring.view` | `{ id }` | Single template with position preview and generation history |
| `create` | mutation | `billing_recurring.manage` | Full template fields | Create recurring invoice template |
| `update` | mutation | `billing_recurring.manage` | `{ id, ...fields }` | Update template |
| `delete` | mutation | `billing_recurring.manage` | `{ id }` | Delete template |
| `activate` | mutation | `billing_recurring.manage` | `{ id }` | Set isActive=true |
| `deactivate` | mutation | `billing_recurring.manage` | `{ id }` | Set isActive=false |
| `generate` | mutation | `billing_recurring.generate` | `{ id }` | Manually generate an invoice from this template now |
| `generateDue` | mutation | `billing_recurring.generate` | — | Generate all due invoices (nextDueDate ≤ today) |
| `preview` | query | `billing_recurring.view` | `{ id }` | Preview what the next invoice would look like |

### Input Schemas

```ts
const positionTemplateSchema = z.array(z.object({
  type: z.enum(["ARTICLE", "FREE", "TEXT"]),
  articleId: z.string().uuid().optional(),
  articleNumber: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().optional(),
  unit: z.string().optional(),
  unitPrice: z.number().optional(),
  flatCosts: z.number().optional(),
  vatRate: z.number().optional(),
}))

const createInput = z.object({
  name: z.string().min(1),
  addressId: z.string().uuid(),
  contactId: z.string().uuid().optional(),
  interval: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUALLY", "ANNUALLY"]),
  startDate: z.date(),
  endDate: z.date().optional(),
  autoGenerate: z.boolean().optional().default(false),
  deliveryType: z.string().optional(),
  deliveryTerms: z.string().optional(),
  paymentTermDays: z.number().int().optional(),
  discountPercent: z.number().optional(),
  discountDays: z.number().int().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  positionTemplate: positionTemplateSchema,
})
```

---

## Service Layer

**Files:**
- `src/lib/services/billing-recurring-invoice-service.ts`
- `src/lib/services/billing-recurring-invoice-repository.ts`

### Key Logic

#### Invoice Generation

```ts
export async function generate(prisma, tenantId, recurringId, generatedById) {
  return prisma.$transaction(async (tx) => {
    // 1. Load recurring template
    // 2. Validate isActive=true and nextDueDate ≤ today (for auto) or always for manual
    // 3. If endDate is set and nextDueDate > endDate → deactivate template, return
    // 4. Create BillingDocument of type INVOICE:
    //    - addressId, contactId from template
    //    - documentDate = nextDueDate
    //    - paymentTermDays, discountPercent, etc. from template
    // 5. Create BillingDocumentPositions from positionTemplate
    // 6. Calculate document totals
    // 7. Update recurring template:
    //    - lastGeneratedAt = now()
    //    - nextDueDate = calculateNextDueDate(nextDueDate, interval)
    // 8. Return the created invoice document
  })
}
```

#### Next Due Date Calculation

```ts
function calculateNextDueDate(current: Date, interval: BillingRecurringInterval): Date {
  switch (interval) {
    case "MONTHLY": return addMonths(current, 1)
    case "QUARTERLY": return addMonths(current, 3)
    case "SEMI_ANNUALLY": return addMonths(current, 6)
    case "ANNUALLY": return addMonths(current, 12)
  }
}
```

#### Cron Job

**File:** `src/app/api/cron/recurring-invoices/route.ts`

- Runs daily (or as configured)
- Calls `generateDue()` which processes all tenants with active recurring invoices where `nextDueDate ≤ today` and `autoGenerate=true`
- Logs generated invoices
- Protected by Vercel cron secret

---

## UI Components

### Page Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/orders/recurring` | `BillingRecurringPage` | Recurring invoice templates list |
| `/orders/recurring/[id]` | `BillingRecurringDetailPage` | Template detail with generation history |
| `/orders/recurring/new` | `BillingRecurringCreatePage` | Create new template |

### Component Files

All in `src/components/billing/`:

| Component | Description |
|-----------|-------------|
| `recurring-list.tsx` | Data table. Columns: Name, Customer, Interval, Next Due, Last Generated, Active toggle. Toolbar: active filter, search. "Generate All Due" button. |
| `recurring-form.tsx` | Full form for create/edit. Customer selection, interval, dates, positions template editor, terms. |
| `recurring-detail.tsx` | Detail view showing template, next invoice preview, generation history (list of generated invoices with links). |
| `recurring-position-editor.tsx` | Position template editor (same UX as document position table but stored as JSON). |
| `recurring-generate-dialog.tsx` | Confirmation dialog for manual generation. Shows preview of invoice to be created. |

---

## Hooks

**File:** `src/hooks/use-billing-recurring.ts`

```ts
export function useBillingRecurringInvoices(filters) {
  return useQuery(trpc.billing.recurringInvoices.list.queryOptions(filters))
}

export function useBillingRecurringInvoice(id: string) {
  return useQuery(trpc.billing.recurringInvoices.getById.queryOptions({ id }))
}

export function useGenerateRecurringInvoice() { /* ... */ }
export function useGenerateDueRecurringInvoices() { /* ... */ }
```

---

## Tests

### Unit Tests (Service)

**File:** `src/lib/services/__tests__/billing-recurring-invoice-service.test.ts`

- `generate` — creates INVOICE document from template
- `generate` — copies positions from template
- `generate` — advances nextDueDate correctly for each interval
- `generate` — deactivates template when endDate reached
- `generate` — rejects if template is inactive
- `generateDue` — processes all due templates across tenants
- `generateDue` — skips templates with autoGenerate=false
- `calculateNextDueDate` — monthly, quarterly, semi-annually, annually

### Router Tests

**File:** `src/trpc/routers/__tests__/billingRecurring-router.test.ts`

```ts
describe("billing.recurringInvoices", () => {
  it("list — requires billing_recurring.view", async () => { })
  it("list — requires billing module enabled", async () => { })
  it("generate — creates invoice from template", async () => { })
  it("generate — advances nextDueDate", async () => { })
  it("generateDue — processes all due templates", async () => { })
})
```

### E2E Tests

**File:** `src/e2e-browser/34-billing-recurring.spec.ts`

```ts
test.describe("UC-ORD-05: Recurring Invoices", () => {
  test("create a monthly recurring invoice template", async ({ page }) => {
    // Navigate to /orders/recurring
    // Click "New" → fill name, select customer, set monthly, add positions
    // Submit → verify in list
  })

  test("manually generate an invoice from template", async ({ page }) => {
    // Open template → click "Generate Now"
    // Confirm → verify invoice created, nextDueDate advanced
  })

  test("deactivate a recurring template", async ({ page }) => {
    // Toggle active → verify deactivated
    // Verify not shown in "due" list
  })
})
```

---

## Acceptance Criteria

- [ ] `BillingRecurringInvoice` model created with migration
- [ ] Template CRUD fully functional
- [ ] Position template stored as JSONB
- [ ] Four intervals supported: monthly, quarterly, semi-annually, annually
- [ ] Manual invoice generation creates BillingDocument of type INVOICE
- [ ] Positions copied from template to generated invoice
- [ ] `nextDueDate` advances correctly after generation
- [ ] Template deactivates when `endDate` is reached
- [ ] Auto-generation via cron job for templates with `autoGenerate=true`
- [ ] Cron route at `src/app/api/cron/recurring-invoices/route.ts`
- [ ] Generation history visible on template detail page
- [ ] Invoice preview before generation
- [ ] All procedures gated by `requireModule("billing")` and `billing_recurring.*` permissions
- [ ] Cross-tenant isolation verified
