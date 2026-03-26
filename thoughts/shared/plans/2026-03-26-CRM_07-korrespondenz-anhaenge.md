# CRM_07 Implementation Plan — Korrespondenz-Anhaenge (Correspondence Attachments)

**Date:** 2026-03-26
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_07_KORRESPONDENZ_ANHAENGE.md`
**Research:** `thoughts/shared/research/2026-03-26-CRM_07-korrespondenz-anhaenge.md`
**Pattern Reference:** WH_13 Artikelbilder (article images with Supabase Storage)

---

## Phase 1: Database & Schema

**Dependencies:** None (first phase)

### 1.1 Supabase Migration — Table Creation

**File to create:** `supabase/migrations/20260403100000_crm_correspondence_attachments.sql`

**What to implement:**

```sql
-- Create crm_correspondence_attachments table
CREATE TABLE crm_correspondence_attachments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id UUID NOT NULL REFERENCES crm_correspondences(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename          TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id     UUID
);

CREATE INDEX idx_crm_corr_attachments_correspondence ON crm_correspondence_attachments (correspondence_id);
CREATE INDEX idx_crm_corr_attachments_tenant ON crm_correspondence_attachments (tenant_id);

-- Drop legacy JSON attachments column from crm_correspondences
ALTER TABLE crm_correspondences DROP COLUMN IF EXISTS attachments;
```

**Pattern reference:** `supabase/migrations/20260401100000_wh_article_images.sql` — same structure but without `thumbnail_path`, `sort_order`, `is_primary` (not needed for document attachments).

**Key decisions:**
- No `thumbnail_path` — correspondence attachments are primarily documents (PDF, DOCX), not images
- No `sort_order` — no reordering requirement per the ticket
- No `is_primary` — no primary attachment concept
- DROP the legacy `attachments` JSONB column — it stored plain `{ name, url, size, mimeType }` objects without Storage integration, unlikely to have real data in staging

### 1.2 Supabase Migration — Group Permissions

**File to create:** `supabase/migrations/20260404100000_add_crm_attachment_permissions_to_groups.sql`

**What to implement:**

Add `crm_correspondence.upload` permission (UUID: `0eb338bb-b22d-5675-9de3-6fa6a8924dfa`) to the relevant user groups.

```sql
-- Add crm_correspondence.upload permission to user groups
-- Permission UUID (UUIDv5 with namespace f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1):
--   crm_correspondence.upload = 0eb338bb-b22d-5675-9de3-6fa6a8924dfa

-- PERSONAL: full access to everything, add upload
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"0eb338bb-b22d-5675-9de3-6fa6a8924dfa"'::jsonb
  ) sub
) WHERE code = 'PERSONAL' AND tenant_id IS NULL;

-- VERTRIEB: CRM full access group, add upload
UPDATE user_groups SET permissions = (
  SELECT jsonb_agg(DISTINCT val) FROM (
    SELECT jsonb_array_elements(permissions) AS val
    UNION ALL SELECT '"0eb338bb-b22d-5675-9de3-6fa6a8924dfa"'::jsonb
  ) sub
) WHERE code = 'VERTRIEB' AND tenant_id IS NULL;
```

**Rationale for group assignments:**
- **PERSONAL** — admin group, always gets all permissions
- **VERTRIEB** — sales/CRM group, already has full CRM CRUD (view/create/edit/delete) for correspondence; upload is a natural extension
- **VORGESETZTER** — only has `crm_correspondence.view`, no write perms; do NOT add upload
- **BUCHHALTUNG** — only has `crm_correspondence.view`; do NOT add upload
- **LAGER** — no CRM correspondence permissions at all; do NOT add upload
- **MITARBEITER** — no CRM correspondence permissions; do NOT add upload

**Pattern reference:** `supabase/migrations/20260402100000_add_wh_correction_permissions_to_groups.sql` — same `jsonb_agg(DISTINCT val)` pattern with hardcoded UUIDs.

### 1.3 Prisma Schema Update

**File to modify:** `prisma/schema.prisma`

**Changes:**

1. **Remove** the `attachments Json? @db.JsonB` field from `CrmCorrespondence` (line 507)

2. **Add** the `CrmCorrespondenceAttachment` relation to `CrmCorrespondence`:
   ```prisma
   correspondenceAttachments CrmCorrespondenceAttachment[]
   ```
   Add this after the existing `inquiry` relation (around line 515).

3. **Add** `crmCorrespondenceAttachments CrmCorrespondenceAttachment[]` to the `Tenant` model (after `crmCorrespondences` around line 182).

4. **Add** the new model (place it after the `CrmCorrespondence` model, before `CrmInquiry`):

   ```prisma
   model CrmCorrespondenceAttachment {
     id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
     correspondenceId  String   @map("correspondence_id") @db.Uuid
     tenantId          String   @map("tenant_id") @db.Uuid
     filename          String   @db.Text
     storagePath       String   @map("storage_path") @db.Text
     mimeType          String   @map("mime_type") @db.Text
     sizeBytes         Int      @map("size_bytes")
     createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
     createdById       String?  @map("created_by_id") @db.Uuid

     correspondence CrmCorrespondence @relation(fields: [correspondenceId], references: [id], onDelete: Cascade)
     tenant         Tenant            @relation(fields: [tenantId], references: [id], onDelete: Cascade)

     @@index([correspondenceId])
     @@index([tenantId])
     @@map("crm_correspondence_attachments")
   }
   ```

**Pattern reference:** `WhArticleImage` model in `prisma/schema.prisma` — same field naming, tenant relation, `@@map`, `@db.Text` on text fields.

### 1.4 Supabase Storage Bucket Configuration

**File to modify:** `supabase/config.toml`

**Add** after the `[storage.buckets.wh-article-images]` section (around line 65):

```toml
[storage.buckets.crm-attachments]
public = false
file_size_limit = "10MiB"
allowed_mime_types = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
```

### 1.5 Permission Catalog Update

**File to modify:** `src/lib/auth/permission-catalog.ts`

**Add** after `crm_correspondence.delete` (line 234):

```ts
p("crm_correspondence.upload", "crm_correspondence", "upload", "Upload attachments to correspondence"),
```

### 1.6 Regenerate Prisma Client

After schema changes, run:
```bash
pnpm db:generate
```

### Phase 1 Verification

1. Run `pnpm db:reset` to apply migrations (drops + reruns all migrations + seed)
2. Verify table exists: `SELECT * FROM crm_correspondence_attachments LIMIT 0;`
3. Verify `attachments` column dropped: `SELECT attachments FROM crm_correspondences;` should fail
4. Verify permissions: `SELECT permissions FROM user_groups WHERE code = 'PERSONAL' AND tenant_id IS NULL;` should include `0eb338bb-b22d-5675-9de3-6fa6a8924dfa`
5. Run `pnpm db:generate` — should succeed
6. Run `pnpm typecheck` — expect existing baseline errors plus new errors from removed `attachments` JSON field (to be fixed in Phase 2)
7. Verify bucket in Supabase Studio Storage UI

---

## Phase 2: Backend (Service + Repository + Router)

**Dependencies:** Phase 1 (database, schema, permissions)

### 2.1 Attachment Service (Combined Service + Repository)

**File to create:** `src/lib/services/crm-correspondence-attachment-service.ts`

**What to implement:**

Follow the `wh-article-image-service.ts` pattern — single file combining repository and service functions.

**Constants:**
```ts
const BUCKET = "crm-attachments"
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour
const MAX_ATTACHMENTS_PER_CORRESPONDENCE = 5
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]
```

**Error classes:**
- `CrmCorrespondenceAttachmentNotFoundError extends Error`
- `CrmCorrespondenceAttachmentValidationError extends Error`

**Helper functions:**
- `mimeToExtension(mimeType: string): string` — maps MIME types to file extensions (pdf, jpg, png, webp, docx, xlsx, bin)
- `fixSignedUrl(signedUrl: string): string` — Docker internal/public URL mismatch fix (copy from `wh-article-image-service.ts`)

**Repository functions (tenant-scoped):**
- `findByCorrespondence(prisma, tenantId, correspondenceId)` — findMany ordered by createdAt asc
- `findById(prisma, tenantId, attachmentId)` — findFirst with tenant check
- `createAttachment(prisma, data)` — create DB record
- `countByCorrespondence(prisma, tenantId, correspondenceId)` — count for limit check
- `removeAttachment(prisma, tenantId, attachmentId)` — delete DB record

**Service functions:**
1. **`listAttachments(prisma, tenantId, correspondenceId)`**
   - Fetch from DB via `findByCorrespondence`
   - Generate signed download URLs for each via `supabase.storage.from(BUCKET).createSignedUrl()`
   - Return attachments with `downloadUrl` field added
   - Pattern: same as `listImages()` in WH_13

2. **`getUploadUrl(prisma, tenantId, correspondenceId, filename, mimeType)`**
   - Validate MIME type against whitelist
   - Verify correspondence exists and belongs to tenant (query `crmCorrespondence.findFirst`)
   - Check attachment count limit (max 5) — throw `ValidationError` if exceeded
   - Generate storage path: `{tenantId}/{correspondenceId}/{uuid}.{ext}`
   - Create signed upload URL via `supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)`
   - Return `{ signedUrl, storagePath, token }`
   - Pattern: same as `getUploadUrl()` in WH_13

3. **`confirmUpload(prisma, tenantId, correspondenceId, storagePath, filename, mimeType, sizeBytes, createdById)`**
   - Validate `sizeBytes` (max 10 MB)
   - Validate `mimeType` (whitelist)
   - Verify correspondence exists and belongs to tenant
   - Check attachment count limit again (race condition protection)
   - Create DB record via `createAttachment()`
   - Return the created record
   - Pattern: same as `confirmUpload()` in WH_13, but WITHOUT thumbnail generation (no `sharp` dependency)

4. **`deleteAttachment(prisma, tenantId, attachmentId)`**
   - Find attachment by ID with tenant check
   - Throw `NotFoundError` if not found
   - Delete file from Supabase Storage: `supabase.storage.from(BUCKET).remove([storagePath])`
   - Delete DB record via `removeAttachment()`
   - Return `{ success: true }`
   - Pattern: same as `deleteImage()` in WH_13, but simpler (no thumbnail, no primary reassignment)

5. **`getDownloadUrl(prisma, tenantId, attachmentId)`**
   - Find attachment by ID with tenant check
   - Throw `NotFoundError` if not found
   - Generate signed download URL
   - Return `{ downloadUrl, filename, mimeType }`

6. **`deleteAllByCorrespondence(prisma, tenantId, correspondenceId)`**
   - Find all attachments for the correspondence
   - Delete all files from Storage in one call: `supabase.storage.from(BUCKET).remove(paths)`
   - Delete all DB records (CASCADE handles this, but call explicitly for Storage cleanup)
   - Called from correspondence service `remove()` before deleting the correspondence

**Imports:**
```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { createAdminClient } from "@/lib/supabase/admin"
import { clientEnv, serverEnv } from "@/lib/config"
import { randomUUID } from "crypto"
```

**Pattern reference:** `src/lib/services/wh-article-image-service.ts` — full file is the template.

### 2.2 Modify Correspondence Service — Remove JSON Attachments

**File to modify:** `src/lib/services/crm-correspondence-service.ts`

**Changes:**
1. Remove `attachments?: Prisma.InputJsonValue | null` from `create()` input type
2. Remove `attachments?: Prisma.InputJsonValue | null` from `update()` input type
3. Remove `attachments` from the `fields` array in `update()` (line 163)
4. Remove `attachments: input.attachments ?? null` from `create()` call (line 110)
5. Remove `Prisma` from the import (no longer needed if only used for attachments JSON)
6. **Add** Storage cleanup to `remove()`: Before deleting the correspondence, call `deleteAllByCorrespondence()` from the attachment service to clean up Storage files

Updated `remove()`:
```ts
import * as attachmentService from "./crm-correspondence-attachment-service"

export async function remove(prisma, tenantId, id, audit?) {
  const existing = audit ? await repo.findById(prisma, tenantId, id) : null

  // Clean up Storage files before CASCADE deletes DB records
  await attachmentService.deleteAllByCorrespondence(prisma, tenantId, id)

  const deleted = await repo.remove(prisma, tenantId, id)
  if (!deleted) {
    throw new CrmCorrespondenceNotFoundError()
  }
  // ... audit logging
}
```

### 2.3 Modify Correspondence Repository — Remove JSON Attachments, Add Relation Include

**File to modify:** `src/lib/services/crm-correspondence-repository.ts`

**Changes:**
1. Remove `attachments?: Prisma.InputJsonValue | null` from `create()` data type
2. Remove the `Prisma.JsonNull` handling in `create()` (lines 111-114): simplify to just `prisma.crmCorrespondence.create({ data })`
3. Remove `Prisma` import (no longer needed)
4. **Add** `correspondenceAttachments: true` to the `include` in `findById()` so the detail view has access to attachment metadata
5. Optionally add attachment count to `findMany()` via `_count: { correspondenceAttachments: true }` for list view badge

### 2.4 Correspondence Router — Add Attachments Sub-Router

**File to modify:** `src/trpc/routers/crm/correspondence.ts`

**Changes:**

1. **Add** import for the attachment service:
   ```ts
   import * as attachmentService from "@/lib/services/crm-correspondence-attachment-service"
   ```

2. **Add** permission constant:
   ```ts
   const CORR_UPLOAD = permissionIdByKey("crm_correspondence.upload")!
   ```

3. **Remove** `attachments` from `createInput` schema (lines 43-48)
4. **Remove** `attachments` from `updateInput` schema (lines 62-67)

5. **Add** `attachments` nested sub-router inside `crmCorrespondenceRouter`:

   ```ts
   attachments: createTRPCRouter({
     list: crmProcedure
       .use(requirePermission(CORR_VIEW))
       .input(z.object({ correspondenceId: z.string().uuid() }))
       .query(async ({ ctx, input }) => {
         try {
           return await attachmentService.listAttachments(
             ctx.prisma as unknown as PrismaClient,
             ctx.tenantId!,
             input.correspondenceId
           )
         } catch (err) {
           handleServiceError(err)
         }
       }),

     getUploadUrl: crmProcedure
       .use(requirePermission(CORR_UPLOAD))
       .input(z.object({
         correspondenceId: z.string().uuid(),
         filename: z.string().min(1).max(255),
         mimeType: z.string().min(1).max(100),
       }))
       .mutation(async ({ ctx, input }) => {
         try {
           return await attachmentService.getUploadUrl(
             ctx.prisma as unknown as PrismaClient,
             ctx.tenantId!,
             input.correspondenceId,
             input.filename,
             input.mimeType
           )
         } catch (err) {
           handleServiceError(err)
         }
       }),

     confirm: crmProcedure
       .use(requirePermission(CORR_UPLOAD))
       .input(z.object({
         correspondenceId: z.string().uuid(),
         storagePath: z.string().min(1),
         filename: z.string().min(1).max(255),
         mimeType: z.string().min(1).max(100),
         sizeBytes: z.number().int().min(1),
       }))
       .mutation(async ({ ctx, input }) => {
         try {
           return await attachmentService.confirmUpload(
             ctx.prisma as unknown as PrismaClient,
             ctx.tenantId!,
             input.correspondenceId,
             input.storagePath,
             input.filename,
             input.mimeType,
             input.sizeBytes,
             ctx.user!.id
           )
         } catch (err) {
           handleServiceError(err)
         }
       }),

     delete: crmProcedure
       .use(requirePermission(CORR_UPLOAD))
       .input(z.object({ id: z.string().uuid() }))
       .mutation(async ({ ctx, input }) => {
         try {
           return await attachmentService.deleteAttachment(
             ctx.prisma as unknown as PrismaClient,
             ctx.tenantId!,
             input.id
           )
         } catch (err) {
           handleServiceError(err)
         }
       }),

     getDownloadUrl: crmProcedure
       .use(requirePermission(CORR_VIEW))
       .input(z.object({ id: z.string().uuid() }))
       .query(async ({ ctx, input }) => {
         try {
           return await attachmentService.getDownloadUrl(
             ctx.prisma as unknown as PrismaClient,
             ctx.tenantId!,
             input.id
           )
         } catch (err) {
           handleServiceError(err)
         }
       }),
   }),
   ```

**Pattern reference:** `src/trpc/routers/warehouse/articles.ts` lines 568-681 — identical nested sub-router pattern with `images:`.

### Phase 2 Verification

1. Run `pnpm typecheck` — all new errors from Phase 1 should be resolved; baseline errors remain
2. Run `pnpm lint` — no new lint errors
3. Run existing tests: `pnpm vitest run src/trpc/routers/__tests__/crmCorrespondence-router.test.ts` — must still pass (they mock the service, so removing `attachments` input should not break them as long as the mock is updated)
4. Manual API test via tRPC DevTools or curl:
   - Call `crm.correspondence.attachments.list({ correspondenceId: "..." })` — should return empty array
   - Call `crm.correspondence.attachments.getUploadUrl(...)` — should return signed URL

---

## Phase 3: Frontend (Hooks + UI)

**Dependencies:** Phase 2 (router must exist for hooks to type-check)

### 3.1 Attachment Hooks

**File to create:** `src/hooks/use-crm-correspondence-attachments.ts`

**What to implement:**

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useCrmCorrespondenceAttachments(correspondenceId: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.correspondence.attachments.list.queryOptions(
      { correspondenceId },
      { enabled: !!correspondenceId }
    )
  )
}

export function useUploadCrmCorrespondenceAttachment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const getUploadUrl = useMutation({
    ...trpc.crm.correspondence.attachments.getUploadUrl.mutationOptions(),
  })

  const confirmUpload = useMutation({
    ...trpc.crm.correspondence.attachments.confirm.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.correspondence.attachments.list.queryKey(),
      })
    },
  })

  return { getUploadUrl, confirmUpload }
}

export function useDeleteCrmCorrespondenceAttachment() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.crm.correspondence.attachments.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.crm.correspondence.attachments.list.queryKey(),
      })
    },
  })
}

export function useCrmCorrespondenceDownloadUrl(id: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.crm.correspondence.attachments.getDownloadUrl.queryOptions(
      { id },
      { enabled: !!id }
    )
  )
}
```

**Pattern reference:** `src/hooks/use-wh-article-images.ts` — same hook structure.

### 3.2 Register Hooks in Index

**File to modify:** `src/hooks/index.ts`

**Add** after the CRM Correspondence exports (after line 685):

```ts
// CRM Correspondence Attachments
export {
  useCrmCorrespondenceAttachments,
  useUploadCrmCorrespondenceAttachment,
  useDeleteCrmCorrespondenceAttachment,
  useCrmCorrespondenceDownloadUrl,
} from './use-crm-correspondence-attachments'
```

### 3.3 Attachment Upload Component

**File to create:** `src/components/crm/correspondence-attachment-upload.tsx`

**What to implement:**

An inline upload zone (NOT a separate dialog — embedded directly in the form sheet) with drag & drop and file selection. Simpler than WH_13's separate dialog because attachments are added in the context of the correspondence form.

**Component structure:**
```tsx
interface CorrespondenceAttachmentUploadProps {
  correspondenceId: string
  disabled?: boolean
  currentCount: number // to enforce max 5 client-side
}

export function CorrespondenceAttachmentUpload({ correspondenceId, disabled, currentCount }: Props) {
  // Uses useUploadCrmCorrespondenceAttachment hook
  // Drag & drop zone with file input
  // Client-side validation: MIME type + file size + count limit
  // 3-step upload flow per file (same as WH_13):
  //   1. getUploadUrl.mutateAsync({ correspondenceId, filename, mimeType })
  //   2. fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } })
  //   3. confirmUpload.mutateAsync({ correspondenceId, storagePath, filename, mimeType, sizeBytes })
  // Status tracking per file: pending -> uploading -> complete | error
  // Toast notifications on success/error
}
```

**Key differences from WH_13 `article-image-upload.tsx`:**
- No image preview thumbnails (use file type icons instead: `FileText` for PDF, `FileSpreadsheet` for XLSX, `Image` for images, `File` for DOCX)
- No separate dialog — render inline in the form
- Count limit check against `currentCount` prop
- Different MIME types and size limit (10 MB vs 5 MB)
- Accept attribute: `"application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx"`

**Icons from lucide-react:** `Upload`, `X`, `CheckCircle`, `AlertCircle`, `Loader2`, `FileText`, `FileSpreadsheet`, `Image`, `File`

**Pattern reference:** `src/components/warehouse/article-image-upload.tsx` — same upload flow pattern.

### 3.4 Attachment List Component

**File to create:** `src/components/crm/correspondence-attachment-list.tsx`

**What to implement:**

A list of existing attachments with download and delete actions.

```tsx
interface CorrespondenceAttachmentListProps {
  correspondenceId: string
  readOnly?: boolean // for detail view (no delete buttons)
}

export function CorrespondenceAttachmentList({ correspondenceId, readOnly }: Props) {
  // Uses useCrmCorrespondenceAttachments(correspondenceId) hook
  // Renders: file type icon, filename, file size (formatted), download button, delete button
  // Delete: confirmation dialog (AlertDialog) -> useDeleteCrmCorrespondenceAttachment
  // Download: opens signed URL in new tab or triggers browser download
  // Loading state: skeleton
  // Empty state: subtle "No attachments" text
}
```

**File type icon mapping:**
- `application/pdf` -> `<FileText />` (red)
- `image/*` -> `<Image />` (blue)
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` -> `<FileText />` (blue)
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` -> `<FileSpreadsheet />` (green)

**File size formatting:** `formatFileSize(bytes)` — e.g., "1.2 MB", "340 KB"

**UI components used:** `Button`, `AlertDialog`, `Skeleton` from `@/components/ui/`

### 3.5 Modify Correspondence Form Sheet — Add Attachment Section

**File to modify:** `src/components/crm/correspondence-form-sheet.tsx`

**Changes:**

1. **Add imports:**
   ```tsx
   import { CorrespondenceAttachmentUpload } from './correspondence-attachment-upload'
   import { CorrespondenceAttachmentList } from './correspondence-attachment-list'
   ```

2. **Add attachment section** between the Content section and the error Alert (after line 291, before line 293).

   Only show the attachment section in **edit mode** (when `editItem` exists and has an `id`), because attachments require a saved correspondence ID to upload to:

   ```tsx
   {/* Attachments — only in edit mode */}
   {isEdit && editItem?.id && (
     <div className="space-y-4">
       <h3 className="text-sm font-medium text-muted-foreground">
         {t('attachmentSection')}
       </h3>
       <CorrespondenceAttachmentList
         correspondenceId={editItem.id as string}
       />
       <CorrespondenceAttachmentUpload
         correspondenceId={editItem.id as string}
         disabled={isSubmitting}
         currentCount={/* from attachments list query */}
       />
     </div>
   )}
   ```

   **Design consideration:** In create mode, the user creates the correspondence first, then can open it for editing to add attachments. This is the same pattern used by WH_13 (images are uploaded to existing articles, not during article creation). Add a hint text in create mode if desired.

3. **Remove** the `attachments` field from the `handleSubmit` `createMutation.mutateAsync` and `updateMutation.mutateAsync` calls if it was included (it is not currently in the form state, but the Zod schema allowed it).

### 3.6 Modify Correspondence Detail Dialog — Replace JSON Attachments

**File to modify:** `src/components/crm/correspondence-detail-dialog.tsx`

**Changes:**

Replace the existing JSON-based attachment rendering (lines 95-113) with the `CorrespondenceAttachmentList` component:

**Before:**
```tsx
{Array.isArray(item.attachments) && (item.attachments as unknown[]).length > 0 && (
  <div className="text-sm">
    <span className="text-muted-foreground">{t('attachments')}</span>
    <ul className="mt-1 space-y-1">
      {(item.attachments as Array<{ name: string; url: string }>).map((att, idx) => (
        ...
      ))}
    </ul>
  </div>
)}
```

**After:**
```tsx
import { CorrespondenceAttachmentList } from './correspondence-attachment-list'

// In the render:
{item.id && (
  <div className="text-sm">
    <span className="text-muted-foreground">{t('attachments')}</span>
    <div className="mt-1">
      <CorrespondenceAttachmentList
        correspondenceId={item.id as string}
        readOnly
      />
    </div>
  </div>
)}
```

### Phase 3 Verification

1. Run `pnpm typecheck` — no new errors
2. Run `pnpm lint` — no new errors
3. Start dev server: `pnpm dev`
4. Manual browser testing:
   - Navigate to CRM -> Addresses -> select address -> Correspondence tab
   - Create a correspondence entry
   - Edit the correspondence -> verify "Anhaenge" section appears
   - Upload a PDF file -> verify 3-step flow completes, attachment appears in list
   - Upload an image -> verify it appears in list
   - Click download -> verify signed URL opens in new tab
   - Click delete -> verify confirmation dialog, then removal
   - Try uploading a 6th attachment -> verify error message
   - Try uploading a file > 10 MB -> verify client-side error
   - Try uploading a .txt file -> verify MIME type rejection
   - Open detail dialog -> verify attachments rendered with download links

---

## Phase 4: i18n

**Dependencies:** Phase 3 (translations used by UI components)

### 4.1 German Translations

**File to modify:** `messages/de.json`

**Add** to the `crmCorrespondence` namespace (before the closing `}` of `crmCorrespondence`, after `"noContact": "Kein Kontakt"` at line 5305):

```json
"attachmentSection": "Anhaenge",
"uploadAttachment": "Datei hochladen",
"uploadDropzoneText": "Dateien hierher ziehen oder klicken",
"uploadDropzoneHint": "PDF, JPEG, PNG, WebP, DOCX, XLSX -- max. 10 MB",
"uploadProgress": "Wird hochgeladen...",
"maxAttachments": "Maximal {max} Anhaenge erlaubt",
"attachmentCount": "{count} von {max} Anhaengen",
"deleteAttachment": "Anhang loeschen",
"deleteAttachmentDescription": "Moechten Sie den Anhang \"{name}\" wirklich loeschen?",
"downloadAttachment": "Herunterladen",
"noAttachments": "Keine Anhaenge",
"toastAttachmentUploaded": "Anhang hochgeladen",
"toastAttachmentDeleted": "Anhang geloescht",
"errorFileTooLarge": "Datei zu gross (max. 10 MB)",
"errorInvalidType": "Ungueltiger Dateityp",
"errorMaxAttachments": "Maximale Anzahl an Anhaengen erreicht",
"attachmentsHintCreate": "Anhaenge koennen nach dem Speichern hinzugefuegt werden"
```

Note: The existing `"attachments": "Anhaenge"` key (line 5288) is used in the detail dialog label. The new `"attachmentSection"` key is for the form section header. Keep both.

### 4.2 English Translations

**File to modify:** `messages/en.json`

**Add** to the `crmCorrespondence` namespace (same position as German):

```json
"attachmentSection": "Attachments",
"uploadAttachment": "Upload file",
"uploadDropzoneText": "Drag files here or click to select",
"uploadDropzoneHint": "PDF, JPEG, PNG, WebP, DOCX, XLSX -- max. 10 MB",
"uploadProgress": "Uploading...",
"maxAttachments": "Maximum {max} attachments allowed",
"attachmentCount": "{count} of {max} attachments",
"deleteAttachment": "Delete attachment",
"deleteAttachmentDescription": "Are you sure you want to delete the attachment \"{name}\"?",
"downloadAttachment": "Download",
"noAttachments": "No attachments",
"toastAttachmentUploaded": "Attachment uploaded",
"toastAttachmentDeleted": "Attachment deleted",
"errorFileTooLarge": "File too large (max. 10 MB)",
"errorInvalidType": "Invalid file type",
"errorMaxAttachments": "Maximum number of attachments reached",
"attachmentsHintCreate": "Attachments can be added after saving"
```

### Phase 4 Verification

1. Run `pnpm lint` — no JSON syntax errors
2. Switch browser language to DE and EN — verify all strings render correctly
3. Check no missing translation warnings in console

---

## Phase 5: Tests

**Dependencies:** Phases 2 + 3 (service and router must be implemented)

### 5.1 Router Tests

**File to create:** `src/trpc/routers/__tests__/crmCorrespondenceAttachments-router.test.ts`

**What to implement:**

Mock the attachment service module entirely (same pattern as `whArticleImages-router.test.ts`):

```ts
vi.mock("@/lib/services/crm-correspondence-attachment-service", () => ({
  listAttachments: vi.fn().mockResolvedValue([]),
  getUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://test.supabase.co/upload-signed",
    storagePath: "tenant/corr/file.pdf",
    token: "test-token",
  }),
  confirmUpload: vi.fn().mockResolvedValue({
    id: "att-1",
    correspondenceId: "corr-1",
    filename: "test.pdf",
  }),
  deleteAttachment: vi.fn().mockResolvedValue({ success: true }),
  getDownloadUrl: vi.fn().mockResolvedValue({
    downloadUrl: "https://test.supabase.co/download-signed",
    filename: "test.pdf",
    mimeType: "application/pdf",
  }),
}))
```

**Test cases:**

```ts
describe("crm.correspondence.attachments", () => {
  describe("list", () => {
    it("returns attachments for correspondence", ...)
    it("requires crm_correspondence.view permission", ...)
  })

  describe("getUploadUrl", () => {
    it("requires crm_correspondence.upload permission", ...)
    it("returns signed URL on success", ...)
  })

  describe("confirm", () => {
    it("validates input schema -- requires sizeBytes", ...)
    it("requires crm_correspondence.upload permission", ...)
    it("creates attachment record on success", ...)
  })

  describe("delete", () => {
    it("requires crm_correspondence.upload permission", ...)
    it("calls service with correct args", ...)
  })

  describe("getDownloadUrl", () => {
    it("requires crm_correspondence.view permission", ...)
    it("returns signed download URL", ...)
  })
})
```

**Important:** The test uses `createCallerFactory(crmCorrespondenceRouter)` and needs to include `CORR_UPLOAD` permission in the `ALL_PERMS` array. The module mock must return `{ module: "crm" }`.

**Pattern reference:** `src/trpc/routers/__tests__/whArticleImages-router.test.ts` — full file is the template. Also reference `src/trpc/routers/__tests__/crmCorrespondence-router.test.ts` for the CRM-specific module mock setup.

### 5.2 Update Existing Correspondence Router Tests

**File to modify:** `src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`

**Changes:**
- If any existing tests pass `attachments` in `createInput` or `updateInput`, remove those fields
- Ensure all tests still pass after removing the `attachments` field from the Zod schemas
- Add `CORR_UPLOAD` to the `ALL_PERMS` array if the test creates full-permission contexts

### 5.3 Service Tests (Optional — Stretch Goal)

**File to create:** `src/lib/services/__tests__/crm-correspondence-attachment-service.test.ts`

Service tests are more complex because they require mocking Supabase Storage. These are lower priority than router tests but cover business logic:

**Test cases:**
```ts
describe("crm-correspondence-attachment-service", () => {
  describe("confirmUpload", () => {
    it("creates DB record for valid input", ...)
    it("rejects when attachment limit (5) exceeded", ...)
    it("rejects invalid MIME type", ...)
    it("rejects file larger than 10 MB", ...)
    it("rejects when correspondence not found", ...)
  })

  describe("deleteAttachment", () => {
    it("deletes DB record and Storage file", ...)
    it("rejects cross-tenant access", ...)
  })

  describe("getUploadUrl", () => {
    it("rejects when attachment limit reached", ...)
    it("generates correct storage path format", ...)
  })
})
```

**Mocking strategy:** Mock `createAdminClient` to return a fake Supabase client with storage methods. Mock Prisma methods directly.

### 5.4 E2E Test Structure (Future)

**File to create (skeleton):** `src/e2e-browser/56-crm-correspondence-attachments.spec.ts`

Outlined in the ticket but not required for initial implementation. The test structure:

```ts
test.describe("UC-CRM-07: Korrespondenz-Anhaenge", () => {
  test("upload attachment to correspondence", ...)
  test("download attachment", ...)
  test("delete attachment", ...)
  test("enforce limit of 5 attachments", ...)
})
```

### Phase 5 Verification

1. Run router tests: `pnpm vitest run src/trpc/routers/__tests__/crmCorrespondenceAttachments-router.test.ts`
2. Run existing correspondence tests: `pnpm vitest run src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`
3. Run all tests: `pnpm test` — no regressions
4. Run typecheck: `pnpm typecheck` — baseline only

---

## File Summary

### New Files (8)

| # | File | Phase | Description |
|---|------|-------|-------------|
| 1 | `supabase/migrations/20260403100000_crm_correspondence_attachments.sql` | 1 | Table creation + drop JSON column |
| 2 | `supabase/migrations/20260404100000_add_crm_attachment_permissions_to_groups.sql` | 1 | Group permission migration |
| 3 | `src/lib/services/crm-correspondence-attachment-service.ts` | 2 | Combined service + repository |
| 4 | `src/hooks/use-crm-correspondence-attachments.ts` | 3 | Upload, list, delete, download hooks |
| 5 | `src/components/crm/correspondence-attachment-upload.tsx` | 3 | Drag & drop upload zone |
| 6 | `src/components/crm/correspondence-attachment-list.tsx` | 3 | Attachment list with download/delete |
| 7 | `src/trpc/routers/__tests__/crmCorrespondenceAttachments-router.test.ts` | 5 | Router tests |
| 8 | `src/lib/services/__tests__/crm-correspondence-attachment-service.test.ts` | 5 | Service tests (stretch) |

### Modified Files (10)

| # | File | Phase | Change |
|---|------|-------|--------|
| 1 | `prisma/schema.prisma` | 1 | Add `CrmCorrespondenceAttachment` model, relation to `CrmCorrespondence` and `Tenant`, remove `attachments Json?` |
| 2 | `supabase/config.toml` | 1 | Add `crm-attachments` bucket config |
| 3 | `src/lib/auth/permission-catalog.ts` | 1 | Add `crm_correspondence.upload` permission |
| 4 | `src/lib/services/crm-correspondence-service.ts` | 2 | Remove `attachments` from create/update, add Storage cleanup in `remove()` |
| 5 | `src/lib/services/crm-correspondence-repository.ts` | 2 | Remove `attachments` from create, include `correspondenceAttachments` in queries |
| 6 | `src/trpc/routers/crm/correspondence.ts` | 2 | Add `attachments` nested sub-router, remove `attachments` from create/update input schemas |
| 7 | `src/hooks/index.ts` | 3 | Export attachment hooks |
| 8 | `src/components/crm/correspondence-form-sheet.tsx` | 3 | Add attachment section (edit mode only) |
| 9 | `src/components/crm/correspondence-detail-dialog.tsx` | 3 | Replace JSON attachment display with `CorrespondenceAttachmentList` |
| 10 | `messages/de.json` + `messages/en.json` | 4 | Add attachment-related i18n keys |

---

## Risk Mitigation

1. **JSON column removal:** The `attachments` JSONB column on `crm_correspondences` is being dropped. If staging has data, run `SELECT count(*) FROM crm_correspondences WHERE attachments IS NOT NULL;` first. If data exists, add a data migration step before dropping.

2. **Storage orphans on correspondence delete:** The `deleteAllByCorrespondence()` call in the correspondence service `remove()` ensures Storage files are cleaned up before CASCADE deletes DB records. If this fails (e.g., network error to Storage), DB records still get deleted via CASCADE, but Storage files become orphans. Acceptable for now; a future cron job can clean orphans.

3. **Race condition on count limit:** The count check in `getUploadUrl()` and again in `confirmUpload()` provides double-check protection. A user could still exceed the limit if two concurrent uploads both pass `getUploadUrl()` before either calls `confirmUpload()`. This is acceptable given the low concurrency of CRM operations.

4. **No thumbnail generation:** Unlike WH_13, there is no `sharp` dependency for thumbnail generation. This simplifies the service significantly and avoids server-side image processing overhead.

5. **Edit-only upload:** Attachments can only be added after a correspondence entry is saved (edit mode). This avoids the complexity of temporary file storage and orphan cleanup for unsaved entries.
