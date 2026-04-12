# Research: Audit-Log Export (CSV + PDF)

Date: 2026-04-08

## 1. Existing Audit Log System

### 1.1 Prisma Schema (`prisma/schema.prisma`, line 2779)

```prisma
model AuditLog {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @map("tenant_id") @db.Uuid
  userId      String?  @map("user_id") @db.Uuid
  action      String   @db.VarChar(20)
  entityType  String   @map("entity_type") @db.VarChar(100)
  entityId    String   @map("entity_id") @db.Uuid
  entityName  String?  @map("entity_name") @db.Text
  changes     Json?    @db.JsonB
  metadata    Json?    @db.JsonB
  ipAddress   String?  @map("ip_address") @db.Text
  userAgent   String?  @map("user_agent") @db.Text
  performedAt DateTime @default(now()) @map("performed_at") @db.Timestamptz(6)

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([tenantId], map: "idx_audit_logs_tenant")
  @@index([userId], map: "idx_audit_logs_user")
  @@index([entityType, entityId], map: "idx_audit_logs_entity")
  @@index([action], map: "idx_audit_logs_action")
  @@index([performedAt], map: "idx_audit_logs_performed_at")
  @@index([tenantId, performedAt], map: "idx_audit_logs_tenant_performed_at")
  @@map("audit_logs")
}
```

Fields summary:
- `id` (UUID, auto-generated)
- `tenantId` (UUID, required)
- `userId` (UUID, nullable -- null for system actions)
- `action` (varchar 20) -- values: create, update, delete, approve, reject, cancel, close, reopen, finalize, forward, export, import
- `entityType` (varchar 100) -- ~70+ entity types (employee, booking, absence_day, etc.)
- `entityId` (UUID)
- `entityName` (text, nullable) -- human-readable name of the entity
- `changes` (JSONB, nullable) -- `{ fieldName: { old: value, new: value } }` structure
- `metadata` (JSONB, nullable) -- arbitrary metadata
- `ipAddress` (text, nullable)
- `userAgent` (text, nullable)
- `performedAt` (timestamptz, defaults to now())
- Relation: `user` (User model, for display name/email)

### 1.2 Repository (`src/lib/services/audit-logs-repository.ts`)

**AuditLogListParams interface:**
```ts
interface AuditLogListParams {
  page?: number
  pageSize?: number
  userId?: string
  entityType?: string
  entityId?: string
  action?: string
  fromDate?: string
  toDate?: string
}
```

Key functions:
- `findMany(prisma, tenantId, params?)` -- paginated query with user include
- `count(prisma, tenantId, params?)` -- count matching records
- `findById(prisma, tenantId, id)` -- single record with user include
- `create(prisma, data)` -- single insert
- `createBulk(prisma, data[])` -- batch insert via createMany

The `buildWhere` helper constructs a Prisma where clause from the params. It maps `fromDate`/`toDate` to `performedAt: { gte, lte }`.

**IMPORTANT for export:** The existing `findMany` is paginated (skip/take). For export we need an **unpaginated** version that fetches ALL matching records, or we need to add a new repository function (e.g., `findAll` or `findManyForExport`) that removes pagination but applies the same filters.

### 1.3 Service (`src/lib/services/audit-logs-service.ts`)

Key exports:
- `list(prisma, tenantId, params?)` -- returns `{ items, total }`
- `getById(prisma, tenantId, id)`
- `log(prisma, data)` -- fire-and-forget write
- `logBulk(prisma, data[])` -- batch write
- `computeChanges(before, after, fieldsToTrack?)` -- diff helper

The `mapToOutput` function normalizes a raw Prisma record to a typed output including the user relation.

Error classes: `AuditLogNotFoundError`

### 1.4 Router (`src/trpc/routers/auditLogs.ts`)

Two procedures:
- `auditLogs.list` -- query, requires `users.manage` OR `reports.view`
- `auditLogs.getById` -- query, requires `users.manage` OR `reports.view`

Permission constants:
```ts
const USERS_MANAGE = permissionIdByKey("users.manage")!
const REPORTS_VIEW = permissionIdByKey("reports.view")!
```

Registered in `_app.ts` as `auditLogs: auditLogsRouter` (line 131).

### 1.5 Hook (`src/hooks/use-audit-logs.ts`)

```ts
export function useAuditLogs(options: UseAuditLogsOptions = {})
export function useAuditLog(id: string | undefined)
```

Both use `useQuery` from `@tanstack/react-query`.

### 1.6 UI Page (`src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx`)

Client component with:
- Filter state: dateRange, userId, entityType, entityId, action
- URL sync: reads from/writes to searchParams (from, to, user_id, entity_type, entity_id, action)
- Infinite-scroll pattern with "Load More" button
- Uses `useAuditLogs()` hook
- Users dropdown from `useUsers()`
- Detail sheet: `AuditLogDetailSheet`
- Permission check: `useHasPermission(['users.manage'])`

### 1.7 UI Components (`src/components/audit-logs/`)

| File | Purpose |
|------|---------|
| `audit-log-filters.tsx` | Filter bar with DateRangePicker, Select dropdowns, Input |
| `audit-log-data-table.tsx` | Table with columns: timestamp, user, action (badge), entityType, entityName, ipAddress, details button |
| `audit-log-detail-sheet.tsx` | Side sheet showing full details, changes diff, metadata |
| `audit-log-json-diff.tsx` | 3-column diff view (field, before, after) |
| `audit-log-skeleton.tsx` | Loading skeleton |
| `types.ts` | `AuditLogEntry` interface |

**Entity types list** (from `audit-log-filters.tsx`, lines 34-58):
70+ entity types, sorted alphabetically. Full list in the file.

**Action types** (from `audit-log-filters.tsx`, lines 60-63):
`create, update, delete, approve, reject, cancel, close, reopen, finalize, forward, export, import`

### 1.8 AuditLogEntry Type (`src/components/audit-logs/types.ts`)

```ts
export interface AuditLogEntry {
  id: string
  tenantId: string
  userId: string | null
  action: string
  entityType: string
  entityId: string
  entityName: string | null
  changes: unknown
  metadata: unknown
  ipAddress: string | null
  userAgent: string | null
  performedAt: string | Date
  user?: { id: string; email: string; displayName: string } | null
}
```

---

## 2. Existing Export Patterns

### 2.1 DATEV Export (Inbound Invoices)

**Service:** `src/lib/services/inbound-invoice-datev-export-service.ts`

Pattern:
1. Service function `exportToCsv(prisma, tenantId, options, userId, audit?)` returns `{ csv: Buffer, filename: string, count: number }`
2. Builds CSV content as string with `;` separator
3. Joins lines with `\r\n` (CRLF)
4. Encodes to Windows-1252 via `iconv-lite` (required for DATEV)
5. Returns a Buffer

**Router:** `src/trpc/routers/invoices/inbound.ts` (line 407-439)

```ts
exportDatev: invProcedure
  .use(requirePermission(EXPORT))
  .input(z.object({
    invoiceIds: z.array(z.string().uuid()).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const result = await datevExportService.exportToCsv(...)
    return {
      csv: result.csv.toString("base64"),  // base64-encoded Buffer
      filename: result.filename,
      count: result.count,
    }
  })
```

**Frontend download** (`src/components/invoices/inbound-invoice-detail.tsx`, line 197-217):
```ts
const result = await exportDatevMutation.mutateAsync({ invoiceIds: [id] })
const blob = new Blob(
  [Uint8Array.from(atob(result.csv), (c) => c.charCodeAt(0))],
  { type: 'text/csv;charset=windows-1252' }
)
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = result.filename
a.click()
URL.revokeObjectURL(url)
```

Key pattern: **mutation returns base64 string -> frontend decodes and downloads as blob**.

### 2.2 Payroll Export

**Service:** `src/lib/services/payroll-export-service.ts`

Different pattern -- stores file content in DB:
1. `generate()` creates a PayrollExport record, generates CSV content, stores in `fileContent` column
2. `download()` reads from DB, converts from CSV to requested format (csv/xlsx/xml/json)
3. Returns `{ content: base64, contentType, filename }`

CSV generation uses `;` separator, `\n` line endings.

**Router:** `src/trpc/routers/payrollExports.ts`

`download` procedure returns `{ content: string (base64), contentType: string, filename: string }`.

### 2.3 Client-Side CSV Exports

Several components generate CSV purely on the client side:

**Account Postings** (`src/app/[locale]/(dashboard)/admin/accounts/[id]/postings/page.tsx`, line 154):
```ts
const bom = '\uFEFF'  // UTF-8 BOM
const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
```
Uses `;` separator, quotes cells, UTF-8 with BOM for Excel compatibility.

**Timesheet Export** (`src/components/timesheet/export-buttons.tsx`):
- CSV: comma-separated, no BOM, `text/csv` content type
- PDF: generates HTML and opens `window.print()`

**Monthly Evaluation Export** (`src/components/monthly-evaluation/monthly-export-buttons.tsx`):
- Same pattern as timesheet (CSV + HTML print)

**Year Overview Export** (`src/components/year-overview/year-export-buttons.tsx`):
- Same pattern

**Common client-side download helper:**
```ts
function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
```

### 2.4 Export Button Pattern (UI)

All export buttons use the same DropdownMenu pattern:
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm">
      <Download className="h-4 w-4 mr-2" />
      {t('exportLabel')}
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => handleExport('csv')}>
      <FileSpreadsheet className="h-4 w-4 mr-2" />
      {t('exportCsv')}
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleExport('pdf')}>
      <FileText className="h-4 w-4 mr-2" />
      {t('printPdf')}
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

Icons from lucide-react: `Download`, `FileText`, `FileSpreadsheet`

---

## 3. PDF Generation

### 3.1 Library: @react-pdf/renderer v4.3.2

All server-side PDFs use `@react-pdf/renderer` with JSX components rendered via `renderToBuffer()`.

Relevant PDF files in `src/lib/pdf/`:
- `stocktake-protocol-pdf.tsx` -- Inventurprotokoll
- `billing-document-pdf.tsx` -- Invoices/offers/etc.
- `purchase-order-pdf.tsx` -- Purchase orders
- `qr-label-pdf.tsx` -- QR code labels
- `fusszeile-pdf.tsx` -- Reusable footer component
- `rich-text-pdf.tsx` -- Rich text rendering
- `position-table-pdf.tsx` -- Position table
- `totals-summary-pdf.tsx` -- Summary/totals
- `pdf-storage.ts` -- Storage path helpers

### 3.2 Stocktake Protocol PDF (Best Reference)

**File:** `src/lib/pdf/stocktake-protocol-pdf.tsx`

Layout:
- A4 page, Helvetica font (built-in, no custom fonts needed)
- Padding: 20mm horizontal, 20mm top, 18mm bottom
- Font size: 9pt base, title 16pt bold, subtitles 10pt
- Unit conversion: `const MM = 2.835` (1mm = 2.835pt)
- Sections: title, subtitle, metadata block, summary block, table with headers, notes, signature block, footer

Uses `StyleSheet.create()` for all styles (required by @react-pdf/renderer).

Table columns use percentage-based widths in a flexbox row layout:
```ts
colNum: { width: "10%", fontSize: 8, fontFamily: "Helvetica-Bold" },
colName: { width: "22%", fontSize: 8 },
// ...
```

### 3.3 FusszeilePdf (Reusable Footer)

**File:** `src/lib/pdf/fusszeile-pdf.tsx`

Takes a `FusszeileConfig` with: companyName, companyAddress, phone, email, bankName, iban, bic, taxId, commercialRegister, managingDirector.

Positioned absolutely at bottom of page. Three columns with company info, bank info, and tax/registration info.

### 3.4 PDF Service Pattern

**File:** `src/lib/services/wh-stocktake-pdf-service.ts`

1. Load data from repository
2. Load tenant config from `billingTenantConfigRepo.findByTenantId(prisma, tenantId)`
3. Build props object
4. Create React element: `React.createElement(StocktakeProtocolPdf, props)`
5. Render to buffer: `const buffer = await renderToBuffer(pdfElement as any)`
6. Upload to Supabase Storage: `await storage.upload(BUCKET, storagePath, Buffer.from(buffer), { contentType: "application/pdf", upsert: true })`
7. Create signed URL: `await storage.createSignedReadUrl(BUCKET, storagePath, SIGNED_URL_EXPIRY_SECONDS)`
8. Return `{ signedUrl, filename }`

**Router** (`src/trpc/routers/warehouse/stocktake.ts`, line 325):
```ts
generatePdf: whProcedure
  .use(requirePermission(WH_STOCKTAKE_COMPLETE))
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const { generateAndGetDownloadUrl } = await import("@/lib/services/wh-stocktake-pdf-service")
    return await generateAndGetDownloadUrl(ctx.prisma, ctx.tenantId!, input.id)
  })
```

Uses dynamic import to avoid bundling PDF renderer in non-PDF routes.

### 3.5 Alternative: Direct Base64 Return

For the audit log export, we do NOT need Supabase Storage. We can:
- Render PDF to buffer
- Convert to base64
- Return directly via tRPC mutation (same pattern as DATEV CSV export)

This avoids the storage upload/signed URL complexity and is more appropriate for on-demand exports.

---

## 4. CSV Generation Patterns

### 4.1 Server-Side (DATEV)

```ts
// Separator: semicolon (;)
// Line endings: CRLF (\r\n)
// Encoding: Windows-1252 via iconv-lite
// Quoting: only if value contains semicolon or double-quote
const csvString = lines.join("\r\n") + "\r\n"
const csvBuffer = iconv.encode(csvString, "win1252")
```

### 4.2 Server-Side (Payroll)

```ts
// Separator: semicolon (;)
// Line endings: LF (\n)
// Encoding: UTF-8 (implicit)
// No BOM
const csvRows = [header.join(";")]
csvRows.push(row.join(";"))
return csvRows.join("\n") + "\n"
```

### 4.3 Client-Side (Account Postings)

```ts
// Separator: semicolon (;)
// Encoding: UTF-8 with BOM (\uFEFF)
// Quoting: all cells quoted, double-quotes escaped
const csvContent = rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(';')).join('\n')
const bom = '\uFEFF'
const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
```

### 4.4 Recommended Approach for Audit Log CSV

For best Excel compatibility in German/EU context:
- **Separator:** semicolon (`;`) -- standard in German Excel
- **Encoding:** UTF-8 with BOM (`\uFEFF`) -- ensures umlauts display correctly in Excel
- **Line endings:** `\n` (LF) or `\r\n` (CRLF) -- both work
- **Quoting:** Quote all cells, escape double-quotes as `""`
- **Return format:** base64 string via tRPC mutation (same as DATEV export)

---

## 5. Permission System

### 5.1 Permission Catalog (`src/lib/auth/permission-catalog.ts`)

Permissions are defined as static objects with deterministic UUID generation:
```ts
p("key", "resource", "action", "description")
```

Each permission has: `id` (UUID v5), `key` (e.g., "employees.view"), `resource`, `action`, `description`.

Currently 130+ permissions. Lookup functions:
- `permissionIdByKey("users.manage")` -> UUID string
- `lookupPermission(id)` -> Permission object
- `listPermissions()` -> all permissions

### 5.2 Audit Log Permissions

The audit log router currently requires:
```ts
const USERS_MANAGE = permissionIdByKey("users.manage")!
const REPORTS_VIEW = permissionIdByKey("reports.view")!
```

Both list and getById use: `.use(requirePermission(USERS_MANAGE, REPORTS_VIEW))` (OR logic).

**For the export feature:** We should reuse the same permission check (`users.manage` OR `reports.view`). No new permission is needed unless we want a separate `audit_logs.export` permission. Given that viewing the data already requires these permissions, export should use the same.

### 5.3 requirePermission Middleware (`src/lib/auth/middleware.ts`)

```ts
export function requirePermission(...permissionIds: string[]) {
  return createMiddleware(async ({ ctx, next }) => {
    // checks hasAnyPermission (OR logic)
    // throws FORBIDDEN if not met
  })
}
```

### 5.4 UI Permission Check

```ts
const { allowed: canAccess, isLoading: permLoading } = useHasPermission(['users.manage'])
```

---

## 6. Error Handling (`src/trpc/errors.ts`)

The `handleServiceError` function maps error class names to tRPC codes:
- `*NotFoundError` -> NOT_FOUND
- `*ValidationError` / `*InvalidError` -> BAD_REQUEST
- `*ConflictError` / `*DuplicateError` -> CONFLICT
- `*ForbiddenError` / `*AccessDeniedError` -> FORBIDDEN
- Prisma errors mapped appropriately
- Unknown errors -> INTERNAL_SERVER_ERROR

---

## 7. Test Patterns

### 7.1 Service Tests (`src/lib/services/__tests__/audit-logs-service.test.ts`)

Uses vitest with vi.mock for repository:
```ts
vi.mock("../audit-logs-repository", () => ({ create: vi.fn() }))
const mockPrisma = {} as unknown as PrismaClient
```

### 7.2 Router Tests (`src/trpc/routers/__tests__/auditLogs-router.test.ts`)

Uses `createCallerFactory` pattern with mock context:
```ts
const createCaller = createCallerFactory(auditLogsRouter)
function createTestContext(prisma) {
  return createMockContext({
    prisma,
    authToken: "test-token",
    user: createUserWithPermissions([USERS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}
const caller = createCaller(createTestContext(mockPrisma))
const result = await caller.list()
```

### 7.3 DATEV Export Tests (`src/lib/services/__tests__/inbound-invoice-datev-export-service.test.ts`)

Reference for testing export service functions.

---

## 8. i18n Translations

The audit log page uses `useTranslations('auditLogs')` namespace. Translation keys include:
- `page.title`, `page.subtitle`
- `filters.*` (dateRange, user, entityType, action, entityId, allUsers, allEntityTypes, allActions, entityIdPlaceholder, clearFilters)
- `entityTypes.*` (one for each entity type)
- `actions.*` (create, update, delete, approve, reject, cancel, close, reopen, finalize, forward, export, import)
- `table.*` (timestamp, user, action, entityType, entityName, ipAddress, details)
- `detail.*` (title, eventInfo, action, entityType, entityName, entityId, userInfo, user, userId, requestInfo, ipAddress, userAgent, timestamps, performedAt, changesSection, metadataSection, close)
- `diff.*` (field, before, after, noChanges)
- `metadata.noMetadata`
- `count.item`, `count.items`
- `empty.*`, `pagination.*`
- `system` (for null user/ip display)

For export feature, new translation keys needed:
- `export.button`, `export.csv`, `export.pdf`
- `export.generating`, `export.success`, `export.error`
- `export.noData` (when no items to export)

---

## 9. Key Decisions for Implementation

### 9.1 Server-Side vs Client-Side Export

**Recommended: Server-Side** (via tRPC mutation)
- Audit logs can have thousands of entries; client-side would require fetching all data first
- Server has direct DB access without pagination limits
- PDF generation requires @react-pdf/renderer which runs server-side
- Consistent with DATEV export pattern

### 9.2 Export Data Volume

The existing `list` function paginates (max 100 per page). For export:
- Add a new repository function `findAllForExport(prisma, tenantId, params)` without pagination
- Consider a hard limit (e.g., 10,000 records) to prevent memory issues
- Or use the same filters but without skip/take

### 9.3 File Architecture

New files needed:
1. `src/lib/services/audit-log-export-service.ts` -- export logic (CSV + PDF generation)
2. `src/lib/pdf/audit-log-export-pdf.tsx` -- PDF layout component
3. `src/lib/services/__tests__/audit-log-export-service.test.ts` -- tests

Modified files:
1. `src/lib/services/audit-logs-repository.ts` -- add `findAllForExport()` function
2. `src/trpc/routers/auditLogs.ts` -- add `exportCsv` and `exportPdf` mutations
3. `src/trpc/routers/__tests__/auditLogs-router.test.ts` -- add export tests
4. `src/hooks/use-audit-logs.ts` -- add `useExportAuditLogsCsv()` and `useExportAuditLogsPdf()` hooks
5. `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` -- add export dropdown button
6. i18n files -- add export-related translations

### 9.4 CSV Format

```
Zeitpunkt;Benutzer;Aktion;Entitaetstyp;Entitaetsname;Entitaets-ID;IP-Adresse;User-Agent;Aenderungen
"08.04.2026 14:30";"Max Mustermann";"Erstellen";"Mitarbeiter";"John Doe";"abc-123";"127.0.0.1";"Mozilla/5.0";"name: Alice -> Bob"
```

- Semicolon separator
- UTF-8 with BOM
- German headers (localized)
- Localized action and entity type labels
- Changes column: simplified one-line diff summary

### 9.5 PDF Layout

Follow stocktake protocol pattern:
- A4 landscape (more columns) or A4 portrait with small font
- Title: "Audit-Log Export"
- Subtitle: date range, filters applied
- Table: Zeitpunkt, Benutzer, Aktion, Entitaetstyp, Entitaetsname, IP-Adresse
- Footer: FusszeilePdf with tenant config
- Helvetica font, 7-8pt for table rows

### 9.6 tRPC Procedure Pattern

```ts
// CSV Export
exportCsv: tenantProcedure
  .use(requirePermission(USERS_MANAGE, REPORTS_VIEW))
  .input(exportInputSchema)
  .mutation(async ({ ctx, input }) => {
    const result = await auditLogExportService.exportCsv(ctx.prisma, ctx.tenantId!, input)
    return { csv: result.csv.toString("base64"), filename: result.filename, count: result.count }
  })

// PDF Export
exportPdf: tenantProcedure
  .use(requirePermission(USERS_MANAGE, REPORTS_VIEW))
  .input(exportInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { exportPdf } = await import("@/lib/services/audit-log-export-service")
    const result = await exportPdf(ctx.prisma, ctx.tenantId!, input)
    return { pdf: result.pdf.toString("base64"), filename: result.filename, count: result.count }
  })
```

Use dynamic import for PDF to avoid bundling @react-pdf/renderer in non-PDF routes (same as stocktake pattern).

---

## 10. File Reference Summary

| File | Purpose |
|------|---------|
| `prisma/schema.prisma:2779` | AuditLog model |
| `src/lib/services/audit-logs-repository.ts` | Repository (data access) |
| `src/lib/services/audit-logs-service.ts` | Service (business logic) |
| `src/trpc/routers/auditLogs.ts` | tRPC router |
| `src/hooks/use-audit-logs.ts` | React hooks |
| `src/app/[locale]/(dashboard)/admin/audit-logs/page.tsx` | Page component |
| `src/components/audit-logs/` | UI components (6 files) |
| `src/lib/auth/permission-catalog.ts` | Permission definitions |
| `src/lib/auth/middleware.ts` | Permission middleware |
| `src/trpc/errors.ts` | Error mapping |
| `src/lib/services/inbound-invoice-datev-export-service.ts` | DATEV CSV export reference |
| `src/trpc/routers/invoices/inbound.ts:407` | DATEV router reference |
| `src/components/invoices/inbound-invoice-detail.tsx:197` | Frontend base64 download reference |
| `src/lib/services/payroll-export-service.ts` | Payroll export reference |
| `src/trpc/routers/payrollExports.ts` | Payroll router reference |
| `src/lib/pdf/stocktake-protocol-pdf.tsx` | PDF layout reference |
| `src/lib/pdf/fusszeile-pdf.tsx` | PDF footer component |
| `src/lib/services/wh-stocktake-pdf-service.ts` | PDF service reference |
| `src/lib/services/billing-tenant-config-repository.ts` | Tenant config for PDF footer |
| `src/app/[locale]/(dashboard)/admin/accounts/[id]/postings/page.tsx:154` | UTF-8 BOM CSV reference |
| `src/components/timesheet/export-buttons.tsx` | Client-side export button pattern |
| `src/components/monthly-evaluation/monthly-export-buttons.tsx` | Export dropdown pattern |
| `src/trpc/routers/__tests__/auditLogs-router.test.ts` | Router test reference |
| `src/lib/services/__tests__/audit-logs-service.test.ts` | Service test reference |
