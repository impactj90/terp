# CRM_07 Research — Korrespondenz-Anhänge (Correspondence Attachments)

**Date:** 2026-03-26
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_CRM_07_KORRESPONDENZ_ANHAENGE.md`

---

## 1. CRM Correspondence — Current Implementation

### 1.1 Prisma Model

**File:** `/home/tolga/projects/terp/prisma/schema.prisma` (lines 494–521)

```prisma
model CrmCorrespondence {
  id          String                      @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String                      @map("tenant_id") @db.Uuid
  addressId   String                      @map("address_id") @db.Uuid
  direction   CrmCorrespondenceDirection
  type        String                      // "phone", "email", "letter", "fax", "visit"
  date        DateTime                    @db.Timestamptz(6)
  contactId   String?                     @map("contact_id") @db.Uuid
  inquiryId   String?                     @map("inquiry_id") @db.Uuid
  fromUser    String?                     @map("from_user")
  toUser      String?                     @map("to_user")
  subject     String
  content     String?
  attachments Json?                       @db.JsonB
  createdAt   DateTime                    @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime                    @updatedAt @map("updated_at") @db.Timestamptz(6)
  createdById String?                     @map("created_by_id") @db.Uuid

  tenant  Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  address CrmAddress  @relation(fields: [addressId], references: [id], onDelete: Cascade)
  contact CrmContact? @relation(fields: [contactId], references: [id], onDelete: SetNull)
  inquiry CrmInquiry? @relation(fields: [inquiryId], references: [id], onDelete: SetNull)

  @@index([tenantId, addressId])
  @@index([tenantId, date])
  @@index([tenantId, inquiryId])
  @@map("crm_correspondences")
}
```

**Key observation:** There is already a `attachments Json? @db.JsonB` field on `CrmCorrespondence`. The ticket calls for a dedicated `CrmCorrespondenceAttachment` model instead. The JSON field is currently used by the router and UI but stores plain `{ name, url, size, mimeType }` objects without Supabase Storage integration (just raw URLs). CRM_07 replaces this with a proper relational model backed by Supabase Storage.

### 1.2 tRPC Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/crm/correspondence.ts`

- Routes: `list`, `getById`, `create`, `update`, `delete`
- All guarded by `requireModule("crm")` + `requirePermission(CORR_VIEW/CREATE/EDIT/DELETE)`
- The `createInput` and `updateInput` schemas already accept `attachments` as an optional JSON array of `{ name, url, size, mimeType }`, but these are stored in the JSON column — NOT via Supabase Storage
- The router merges into the CRM router at `/home/tolga/projects/terp/src/trpc/routers/crm/index.ts`

**Router merge pattern (index.ts):**
```ts
export const crmRouter = createTRPCRouter({
  addresses: crmAddressesRouter,
  correspondence: crmCorrespondenceRouter,
  inquiries: crmInquiriesRouter,
  tasks: crmTasksRouter,
  reports: crmReportsRouter,
  numberSequences: numberSequencesRouter,
})
```

### 1.3 Service Layer

**File:** `/home/tolga/projects/terp/src/lib/services/crm-correspondence-service.ts`

- Functions: `list`, `getById`, `create`, `update`, `remove`
- Error classes: `CrmCorrespondenceNotFoundError`, `CrmCorrespondenceValidationError`
- `create` validates: address belongs to tenant, contact belongs to address
- `update` validates: correspondence exists, contact valid if changed
- Audit logging via `auditLog.log()` + `auditLog.computeChanges()`
- `attachments` passed through as `Prisma.InputJsonValue | null`

### 1.4 Repository Layer

**File:** `/home/tolga/projects/terp/src/lib/services/crm-correspondence-repository.ts`

- Functions: `findMany`, `findById`, `create`, `update`, `remove`
- `findMany` includes `contact` relation
- `findById` includes `contact` + `address` relations
- Uses `Prisma.JsonNull` for null JSON values
- Tenant scoped via `where: { tenantId }` in all queries

### 1.5 Hooks

**File:** `/home/tolga/projects/terp/src/hooks/use-crm-correspondence.ts`

- `useCrmCorrespondence(options)` — list with filters
- `useCrmCorrespondenceById(id)` — single item
- `useCreateCrmCorrespondence()` — create, invalidates list
- `useUpdateCrmCorrespondence()` — update, invalidates list + getById
- `useDeleteCrmCorrespondence()` — delete, invalidates list

### 1.6 UI Components

**Files:**
- `/home/tolga/projects/terp/src/components/crm/correspondence-list.tsx` — Table view with filters, pagination, CRUD actions
- `/home/tolga/projects/terp/src/components/crm/correspondence-form-sheet.tsx` — Sheet form for create/edit (no attachment UI currently)
- `/home/tolga/projects/terp/src/components/crm/correspondence-detail-dialog.tsx` — Detail view dialog (already renders attachments from JSON field as clickable links)
- `/home/tolga/projects/terp/src/components/crm/correspondence-type-badge.tsx` — Badge components

**Detail dialog attachment rendering (lines 95–113):**
The detail dialog already has attachment display code that reads from `item.attachments` as JSON:
```tsx
{Array.isArray(item.attachments) && (item.attachments as unknown[]).length > 0 && (
  <div className="text-sm">
    <span className="text-muted-foreground">{t('attachments')}</span>
    <ul className="mt-1 space-y-1">
      {(item.attachments as Array<{ name: string; url: string }>).map((att, idx) => (
        <li key={idx}>
          <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
            {att.name}
          </a>
        </li>
      ))}
    </ul>
  </div>
)}
```
This will need to be replaced with Supabase Storage signed URL-based download.

**Form sheet:** Currently has NO attachment upload UI. The form manages only text fields. The attachment section needs to be added between the "Content" section and the error alert.

### 1.7 Tests

**Service tests:** `/home/tolga/projects/terp/src/lib/services/__tests__/crm-correspondence-service.test.ts`
- Tests: create (with/without contact), getById (found/not found), update (valid/not found/invalid contact), remove (success/not found)

**Router tests:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/crmCorrespondence-router.test.ts`
- Tests: list (paginated, permissions, direction filter, type filter, search, date range), getById (found/not found), create (all fields, permissions, address validation), update (success, permissions), delete (success, permissions)

---

## 2. WH_13 Article Images — Pattern Reference

WH_13 is the primary pattern to follow. It implements Supabase Storage integration with a two-step upload flow (signed URL + confirm).

### 2.1 Service (combined service + repository)

**File:** `/home/tolga/projects/terp/src/lib/services/wh-article-image-service.ts`

**Architecture:** Single file combining repository functions and service functions (not separate files).

**Constants:**
```ts
const BUCKET = "wh-article-images"
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour
const THUMBNAIL_SIZE = 200
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
```

**Key functions:**
1. **`getUploadUrl(prisma, tenantId, articleId, filename, mimeType)`** — Validates article ownership, generates storage path `{tenantId}/{articleId}/{uuid}.{ext}`, creates signed upload URL via `supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)`
2. **`confirmUpload(prisma, tenantId, articleId, storagePath, filename, mimeType, sizeBytes, createdById)`** — Validates size/mime/article, downloads original from storage, generates thumbnail via `sharp`, uploads thumbnail, creates DB record
3. **`listImages(prisma, tenantId, articleId)`** — Fetches images from DB, generates signed download URLs for each
4. **`deleteImage(prisma, tenantId, imageId)`** — Deletes from Storage + DB, reassigns primary if needed
5. **`setPrimary(prisma, tenantId, imageId)`** — Transaction to reset/set primary
6. **`reorderImages(prisma, tenantId, imageIds)`** — Transaction to update sortOrder

**Supabase admin client import:**
```ts
import { createAdminClient } from "@/lib/supabase/admin"
```

**URL fix helper (Docker internal/public URL mismatch):**
```ts
function fixSignedUrl(signedUrl: string): string {
  const internalUrl = serverEnv.supabaseUrl
  const publicUrl = clientEnv.supabaseUrl
  if (internalUrl && publicUrl && internalUrl !== publicUrl) {
    return signedUrl.replace(internalUrl, publicUrl)
  }
  return signedUrl
}
```

### 2.2 tRPC Router

**File:** `/home/tolga/projects/terp/src/trpc/routers/warehouse/articles.ts` (lines 568–681)

Images are defined as a **nested sub-router** inside the articles router:
```ts
images: createTRPCRouter({
  list: whProcedure.use(requirePermission(WH_VIEW)).input(...).query(...),
  getUploadUrl: whProcedure.use(requirePermission(WH_UPLOAD_IMAGE)).input(...).mutation(...),
  confirm: whProcedure.use(requirePermission(WH_UPLOAD_IMAGE)).input(...).mutation(...),
  setPrimary: whProcedure.use(requirePermission(WH_UPLOAD_IMAGE)).input(...).mutation(...),
  reorder: whProcedure.use(requirePermission(WH_UPLOAD_IMAGE)).input(...).mutation(...),
  delete: whProcedure.use(requirePermission(WH_DELETE_IMAGE)).input(...).mutation(...),
}),
```

**For CRM_07:** Follow the same pattern — add an `attachments` nested sub-router inside the correspondence router.

### 2.3 Hooks

**File:** `/home/tolga/projects/terp/src/hooks/use-wh-article-images.ts`

```ts
export function useWhArticleImages(articleId: string)
export function useUploadWhArticleImage()        // returns { getUploadUrl, confirmUpload }
export function useSetPrimaryWhArticleImage()
export function useReorderWhArticleImages()
export function useDeleteWhArticleImage()
```

**Upload hook pattern (two-mutation approach):**
```ts
export function useUploadWhArticleImage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const getUploadUrl = useMutation({
    ...trpc.warehouse.articles.images.getUploadUrl.mutationOptions(),
  })

  const confirmUpload = useMutation({
    ...trpc.warehouse.articles.images.confirm.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.images.list.queryKey(),
      })
    },
  })

  return { getUploadUrl, confirmUpload }
}
```

### 2.4 UI Components

**Upload Dialog:** `/home/tolga/projects/terp/src/components/warehouse/article-image-upload.tsx`
- Drag & drop zone with `<input type="file">`
- Client-side validation: MIME type + file size
- 3-step upload flow per file:
  1. `getUploadUrl.mutateAsync({ articleId, filename, mimeType })`
  2. `fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } })`
  3. `confirmUpload.mutateAsync({ articleId, storagePath, filename, mimeType, sizeBytes })`
- Status tracking per file: `pending → uploading → complete | error`
- File list shows preview, name, size, status indicator

**Images Tab:** `/home/tolga/projects/terp/src/components/warehouse/article-images-tab.tsx`
- Grid layout with drag-and-drop reordering via `@dnd-kit/core`
- Lightbox dialog for full-size view
- Primary badge, set-primary action, delete with confirmation
- Signed URL-based thumbnail/full display

### 2.5 Test

**Router test:** `/home/tolga/projects/terp/src/trpc/routers/__tests__/whArticleImages-router.test.ts`
- Mocks the entire service module: `vi.mock("@/lib/services/wh-article-image-service", ...)`
- Tests: list, getUploadUrl (permission + success), confirm (schema validation + permission), setPrimary, reorder, delete (permission + success)

---

## 3. Prisma Schema Analysis

### 3.1 CrmCorrespondenceAttachment — Does NOT exist yet
No `CrmCorrespondenceAttachment` model exists in the current schema. The ticket defines it.

### 3.2 Existing `attachments` JSON field
Both `CrmCorrespondence` (line 507) and `CrmTask` (line 588) have `attachments Json? @db.JsonB` fields. The CrmCorrespondence JSON field is already used in the router/service for plain URL-based attachments. CRM_07 will introduce a proper relational model.

**Decision point:** The existing JSON `attachments` field should either be:
- (a) Removed after migration (requires data migration if any data exists), or
- (b) Deprecated and left as-is, with the new `CrmCorrespondenceAttachment` model used going forward

Recommended: Remove the JSON field in the migration since it likely has no production data. Add the relation `attachments CrmCorrespondenceAttachment[]` to `CrmCorrespondence`.

### 3.3 WhArticleImage model (pattern reference)

```prisma
model WhArticleImage {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  articleId     String   @map("article_id") @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  filename      String   @db.Text
  storagePath   String   @map("storage_path") @db.Text
  thumbnailPath String?  @map("thumbnail_path") @db.Text
  mimeType      String   @map("mime_type") @db.Text
  sizeBytes     Int      @map("size_bytes")
  sortOrder     Int      @default(0) @map("sort_order")
  isPrimary     Boolean  @default(false) @map("is_primary")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  createdById   String?  @map("created_by_id") @db.Uuid

  article WhArticle @relation(fields: [articleId], references: [id], onDelete: Cascade)
  tenant  Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([articleId, sortOrder])
  @@index([tenantId])
  @@map("wh_article_images")
}
```

**CRM_07 differences from WH_13:**
- No `thumbnailPath` needed (correspondence attachments are documents, not images primarily)
- No `sortOrder` needed (no reordering requirement)
- No `isPrimary` needed (no primary attachment concept)
- Keep: `filename`, `storagePath`, `mimeType`, `sizeBytes`, `createdAt`, `createdById`

---

## 4. Permission System

### 4.1 Existing CRM Correspondence Permissions

**File:** `/home/tolga/projects/terp/src/lib/auth/permission-catalog.ts` (lines 231–234)

```ts
p("crm_correspondence.view", "crm_correspondence", "view", "View CRM correspondence"),
p("crm_correspondence.create", "crm_correspondence", "create", "Create CRM correspondence"),
p("crm_correspondence.edit", "crm_correspondence", "edit", "Edit CRM correspondence"),
p("crm_correspondence.delete", "crm_correspondence", "delete", "Delete CRM correspondence"),
```

### 4.2 New Permission to Add (from ticket)

```ts
p("crm_correspondence.upload", "crm_correspondence", "upload", "Upload attachments to correspondence"),
```

### 4.3 WH_13 Permission Pattern Reference

WH_13 added two permissions (lines 281–282):
```ts
p("wh_articles.upload_image", "wh_articles", "upload_image", "Upload article images"),
p("wh_articles.delete_image", "wh_articles", "delete_image", "Delete article images"),
```

These were assigned to user groups via migration: `/home/tolga/projects/terp/supabase/migrations/20260402100000_add_wh_correction_permissions_to_groups.sql`

**Pattern for group permission migration:**
1. Permission UUIDs are generated as UUIDv5 with namespace `f68a2ad7-6fd8-4d61-9b0e-0ea4a0d6c8a1`
2. Each user group (PERSONAL, LAGER, VORGESETZTER, etc.) gets specific permissions added via SQL UPDATE
3. Uses `jsonb_agg(DISTINCT val)` to append permissions without duplicates

### 4.4 Permission Router Usage Pattern

```ts
const CORR_UPLOAD = permissionIdByKey("crm_correspondence.upload")!
// Then use: .use(requirePermission(CORR_UPLOAD))
```

---

## 5. Migration Patterns

### 5.1 Naming Convention

Migrations in `supabase/migrations/` follow the pattern: `YYYYMMDDHHMMSS_description.sql`

Recent migrations:
```
20260401100000_wh_article_images.sql
20260402100000_add_wh_correction_permissions_to_groups.sql
```

**Next available timestamp:** `20260403100000` (increments by day at 100000)

### 5.2 WH_13 Article Images Migration

**File:** `/home/tolga/projects/terp/supabase/migrations/20260401100000_wh_article_images.sql`

```sql
CREATE TABLE wh_article_images (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    UUID NOT NULL REFERENCES wh_articles(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  thumbnail_path TEXT,
  mime_type     TEXT NOT NULL,
  size_bytes    INT NOT NULL,
  sort_order    INT NOT NULL DEFAULT 0,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id UUID
);

CREATE INDEX idx_wh_article_images_article_sort ON wh_article_images (article_id, sort_order);
CREATE INDEX idx_wh_article_images_tenant ON wh_article_images (tenant_id);
```

### 5.3 CRM_07 Migration Plan

Will need two migrations:
1. **Table creation:** `crm_correspondence_attachments` table
2. **Group permissions:** Add `crm_correspondence.upload` permission to relevant user groups

Also need to decide on dropping the `attachments` JSONB column from `crm_correspondences`:
- If dropping: `ALTER TABLE crm_correspondences DROP COLUMN IF EXISTS attachments;`
- Schema update: Remove `attachments Json? @db.JsonB` from CrmCorrespondence, add `attachments CrmCorrespondenceAttachment[]` relation

---

## 6. Supabase Storage Bucket Configuration

### 6.1 Bucket Definition

**File:** `/home/tolga/projects/terp/supabase/config.toml` (lines 48–65)

Buckets are defined in `config.toml` for local dev:
```toml
[storage]
enabled = true
file_size_limit = "10MiB"

[storage.buckets.documents]
public = false
file_size_limit = "10MiB"
allowed_mime_types = ["application/pdf", "text/xml"]

[storage.buckets.tenant-logos]
public = true
file_size_limit = "2MiB"
allowed_mime_types = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"]

[storage.buckets.wh-article-images]
public = false
file_size_limit = "5MiB"
allowed_mime_types = ["image/jpeg", "image/png", "image/webp"]
```

**For CRM_07, add:**
```toml
[storage.buckets.crm-attachments]
public = false
file_size_limit = "10MiB"
allowed_mime_types = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
```

### 6.2 Seed SQL

**File:** `/home/tolga/projects/terp/supabase/seed.sql` (line 3525)

Production/seed buckets are created via SQL insert:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documents', 'documents', false),
  ('tenant-logos', 'tenant-logos', true)
ON CONFLICT (id) DO NOTHING;
```

**Note:** The `wh-article-images` bucket is NOT in the seed SQL — it's only in `config.toml`. The `crm-attachments` bucket should follow the same approach (config.toml only, or add to seed.sql for staging/production).

### 6.3 Supabase Admin Client

**File:** `/home/tolga/projects/terp/src/lib/supabase/admin.ts`

```ts
import { createClient } from '@supabase/supabase-js'
import { clientEnv, serverEnv } from '@/lib/config'

export function createAdminClient() {
  return createClient(
    serverEnv.supabaseUrl || clientEnv.supabaseUrl,
    serverEnv.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
```

---

## 7. i18n

### 7.1 Current CRM Correspondence Keys

**Files:** `/home/tolga/projects/terp/messages/de.json` and `/home/tolga/projects/terp/messages/en.json`

Namespace: `crmCorrespondence`

Existing keys include `attachments` ("Anhänge" / "Attachments") but no upload-specific keys.

**Keys to add for CRM_07:**

```json
{
  "attachmentSection": "Anhänge",
  "uploadAttachment": "Datei hochladen",
  "uploadDropzoneText": "Dateien hierher ziehen oder klicken",
  "uploadDropzoneHint": "PDF, JPEG, PNG, WebP, DOCX, XLSX — max. 10 MB",
  "uploadProgress": "Wird hochgeladen…",
  "maxAttachments": "Maximal {max} Anhänge erlaubt",
  "attachmentCount": "{count} von {max} Anhängen",
  "deleteAttachment": "Anhang löschen",
  "deleteAttachmentDescription": "Möchten Sie den Anhang \"{name}\" wirklich löschen?",
  "downloadAttachment": "Herunterladen",
  "toastAttachmentUploaded": "Anhang hochgeladen",
  "toastAttachmentDeleted": "Anhang gelöscht",
  "errorFileTooLarge": "Datei zu groß (max. 10 MB)",
  "errorInvalidType": "Ungültiger Dateityp",
  "errorMaxAttachments": "Maximale Anzahl an Anhängen erreicht"
}
```

### 7.2 WH_13 i18n Pattern

WH_13 keys are under `warehouseArticles` namespace (not a separate namespace), including keys like:
- `uploadDialogTitle`, `uploadDialogDescription`, `uploadDropzoneText`, `uploadDropzoneHint`
- `uploadProgress`, `actionUploadImages`, `actionUploadImage`
- `toastImageUploaded`, `toastImagesUploaded`, `toastImageDeleted`
- `confirmDeleteImageTitle`, `confirmDeleteImageDescription`
- `imagesHeading`, `noImages`, `badgePrimaryImage`

---

## 8. Summary of Files to Create/Modify

### New Files
| File | Description |
|------|-------------|
| `src/lib/services/crm-correspondence-attachment-service.ts` | Service + repository (combined, like WH_13) |
| `src/hooks/use-crm-correspondence-attachments.ts` | Upload, list, delete, download hooks |
| `src/components/crm/correspondence-attachment-upload.tsx` | Upload dialog/drop zone |
| `src/components/crm/correspondence-attachment-list.tsx` | Attachment list with download/delete |
| `src/lib/services/__tests__/crm-correspondence-attachment-service.test.ts` | Service unit tests |
| `src/trpc/routers/__tests__/crmCorrespondenceAttachments-router.test.ts` | Router tests |
| `supabase/migrations/20260403100000_crm_correspondence_attachments.sql` | Table + drop JSON column |
| `supabase/migrations/20260404100000_add_crm_attachment_permissions_to_groups.sql` | Group permissions |

### Files to Modify
| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `CrmCorrespondenceAttachment` model, add relation to `CrmCorrespondence`, remove `attachments Json?` |
| `src/trpc/routers/crm/correspondence.ts` | Add `attachments` nested sub-router, remove `attachments` from create/update input |
| `src/lib/services/crm-correspondence-service.ts` | Remove `attachments` from create/update input types |
| `src/lib/services/crm-correspondence-repository.ts` | Remove `attachments` from create data, include `attachments` relation in queries |
| `src/lib/auth/permission-catalog.ts` | Add `crm_correspondence.upload` permission |
| `src/components/crm/correspondence-form-sheet.tsx` | Add attachment upload section |
| `src/components/crm/correspondence-detail-dialog.tsx` | Replace JSON attachment display with signed URL-based download |
| `src/hooks/use-crm-correspondence.ts` | May need to invalidate attachment queries on correspondence delete |
| `supabase/config.toml` | Add `crm-attachments` bucket config |
| `messages/de.json` | Add attachment i18n keys under `crmCorrespondence` |
| `messages/en.json` | Add attachment i18n keys under `crmCorrespondence` |

---

## 9. Potential Issues and Considerations

1. **JSON field removal:** The existing `attachments Json?` column on `crm_correspondences` must be dropped. If there is existing data in staging/production, a data migration step may be needed to move JSON entries into the new `crm_correspondence_attachments` table. Check with `SELECT count(*) FROM crm_correspondences WHERE attachments IS NOT NULL`.

2. **No thumbnails needed:** Unlike WH_13 which generates image thumbnails via `sharp`, CRM_07 attachments are documents (PDF, DOCX, XLSX) as well as images. Thumbnail generation is not required — only file type icons and filenames in the list.

3. **MIME type constants for DOCX/XLSX:** The WH_13 pattern uses simple image MIME types. CRM_07 needs Office document MIME types:
   - DOCX: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
   - XLSX: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

4. **Upload flow identical to WH_13:** 3-step process (getUploadUrl → PUT to signed URL → confirm). No changes to the flow, just different MIME types and size limit (10 MB vs 5 MB).

5. **Download URL:** WH_13 returns signed URLs in the `listImages` response. CRM_07 should either:
   - (a) Include signed download URLs in the `attachments.list` response (like WH_13), or
   - (b) Provide a separate `getDownloadUrl` query (as the ticket specifies)

   Recommendation: Do both — include URLs in list response for immediate rendering, and have a dedicated `getDownloadUrl` for on-demand access.

6. **Attachment limit enforcement:** Max 5 per correspondence. Check count in `confirmUpload` before creating the DB record (same pattern as WH_13's `countByArticle`).

7. **Delete cascade:** When a correspondence entry is deleted, the `ON DELETE CASCADE` on the attachment FK will remove DB records, but **Storage files must be cleaned up separately**. Options:
   - (a) Override `remove` in correspondence service to delete Storage files first
   - (b) Accept orphaned files in Storage (simpler, can be cleaned up by cron)
   - Recommendation: Option (a) for correctness — delete attachments from Storage before deleting the correspondence.

8. **Permission design:** The ticket specifies a single `crm_correspondence.upload` permission for both upload and delete of attachments. This is simpler than WH_13 which has separate `upload_image` and `delete_image` permissions. Consider whether separate permissions are needed.

9. **Tenant isolation in Storage paths:** Storage path format `{tenantId}/{correspondenceId}/{uuid}.{ext}` ensures tenant isolation at the storage level. All service functions must validate tenantId before generating signed URLs.

10. **`fixSignedUrl` helper:** Must be reused from WH_13 pattern or extracted to a shared utility. Currently duplicated in `wh-article-image-service.ts` and `billing-document-service.ts`.
