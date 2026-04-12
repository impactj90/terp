# Implementation Plan: WH_13 — Artikelbilder (Article Images)

**Date:** 2026-03-25
**Ticket:** `thoughts/shared/tickets/orgAuftrag/TICKET_WH_13_ARTIKELBILDER.md`
**Research:** `thoughts/shared/research/2026-03-25-WH_13-artikelbilder.md`

---

## Overview

Add multi-image support for warehouse articles. Users can upload up to N images per article, one is marked as primary (shown in list thumbnail), images are stored in Supabase Storage with auto-generated thumbnails, and can be reordered via drag-and-drop.

**Upload flow:** Client requests a signed upload URL from the server, uploads directly to Supabase Storage, then calls `confirm` to create the DB record and trigger server-side thumbnail generation.

---

## Phase 1: Database & Backend Foundation

### Step 1.1: Install Dependencies

**File:** `package.json`

Add:
- `sharp` (production dep) — server-side thumbnail generation (200x200 WebP)
- `@dnd-kit/sortable` (production dep) — sortable drag-and-drop for image reordering

```bash
pnpm add sharp @dnd-kit/sortable
```

Also add `@types/sharp` if needed (check if sharp ships its own types — it does since v0.30, so no extra `@types` needed).

**Verification:** `pnpm install` succeeds, `import sharp from 'sharp'` resolves in a test file.

---

### Step 1.2: Supabase Storage Bucket

**File:** `supabase/config.toml`

Add after the `[storage.buckets.tenant-logos]` block:

```toml
[storage.buckets.wh-article-images]
public = false
file_size_limit = "5MiB"
allowed_mime_types = ["image/jpeg", "image/png", "image/webp"]
```

**Verification:** `pnpm db:reset` or `pnpm db:start` creates the bucket. Check via Supabase Studio (port 54323) → Storage → bucket `wh-article-images` exists.

---

### Step 1.3: Database Migration

**File:** `supabase/migrations/20260401100000_wh_article_images.sql`

```sql
-- WH_13: Article images table
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

**Verification:** `pnpm db:reset` succeeds. Table visible in Supabase Studio. `\d wh_article_images` in psql shows correct schema.

---

### Step 1.4: Prisma Schema

**File:** `prisma/schema.prisma`

**Add `WhArticleImage` model** (after the `WhArticle` model, around line 4221):

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

**Add relation on `WhArticle`** (around line 4213, after `stockMovements`):

```prisma
  articleImages          WhArticleImage[]
```

**Add relation on `Tenant`** (around line 199, in the `// Warehouse` section):

```prisma
  whArticleImages             WhArticleImage[]
```

**Regenerate Prisma client:**

```bash
pnpm db:generate
```

**Verification:** `pnpm db:generate` succeeds. `import { WhArticleImage } from '@/generated/prisma/client'` resolves.

---

### Step 1.5: Permissions

**File:** `src/lib/auth/permission-catalog.ts`

Add after the `wh_article_groups.manage` line (line 280):

```ts
  p("wh_articles.upload_image", "wh_articles", "upload_image", "Upload article images"),
  p("wh_articles.delete_image", "wh_articles", "delete_image", "Delete article images"),
```

**Verification:** `permissionIdByKey("wh_articles.upload_image")` returns a non-null UUID. `permissionIdByKey("wh_articles.delete_image")` returns a non-null UUID.

---

### Step 1.6: Service + Repository

**File (new):** `src/lib/services/wh-article-image-service.ts`

This single file contains both repository functions and service functions (same pattern as smaller services in the codebase). Structure:

```ts
import type { PrismaClient } from "@/generated/prisma/client"
import { createAdminClient } from "@/lib/supabase/admin"
import { clientEnv, serverEnv } from "@/lib/config"
import sharp from "sharp"

const BUCKET = "wh-article-images"
const SIGNED_URL_EXPIRY_SECONDS = 3600 // 1 hour
const THUMBNAIL_SIZE = 200
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"]
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB

// --- Error Classes ---
export class WhArticleImageNotFoundError extends Error { ... }
export class WhArticleImageValidationError extends Error { ... }
```

**Repository functions** (all tenant-scoped):

1. **`findByArticle(prisma, tenantId, articleId)`** — returns all images for an article, ordered by `sortOrder ASC`
2. **`findById(prisma, tenantId, imageId)`** — find single image, includes `article` to verify tenant ownership
3. **`create(prisma, data)`** — insert a new `WhArticleImage` record
4. **`updateMany(prisma, where, data)`** — for bulk updates (isPrimary reset, sortOrder batch)
5. **`remove(prisma, tenantId, imageId)`** — delete image record, return the deleted record (for storage cleanup)
6. **`countByArticle(prisma, tenantId, articleId)`** — count images for first-image-is-primary logic

**Service functions:**

1. **`listImages(prisma, tenantId, articleId)`**
   - Calls `findByArticle`
   - For each image, generates signed URLs for both `storagePath` and `thumbnailPath`
   - Applies the Docker internal/public URL fixup (same pattern as `billing-document-pdf-service.ts` lines 128-133)
   - Returns array of images with `url` and `thumbnailUrl` fields appended

2. **`getUploadUrl(prisma, tenantId, articleId, filename, mimeType)`**
   - Validate `mimeType` is in `ALLOWED_MIME_TYPES`, else throw `WhArticleImageValidationError`
   - Validate article exists and belongs to tenant (call `wh-article-service.getById`)
   - Generate storage path: `{tenantId}/{articleId}/{uuid}.{ext}` (extract ext from mimeType)
   - Create signed upload URL via admin client: `supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath)`
   - Apply Docker URL fixup on the returned signed URL
   - Return `{ signedUrl, storagePath, token }`

3. **`confirmUpload(prisma, tenantId, articleId, storagePath, filename, mimeType, sizeBytes, createdById)`**
   - Validate sizeBytes <= MAX_SIZE_BYTES
   - Validate article exists and belongs to tenant
   - Generate thumbnail:
     - Download original from storage: `supabase.storage.from(BUCKET).download(storagePath)`
     - Process with sharp: `sharp(buffer).resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover' }).webp({ quality: 80 }).toBuffer()`
     - Upload thumbnail: path = `storagePath` with `_thumb.webp` suffix replacing the original extension
     - Store `thumbnailPath` in DB
   - Determine `isPrimary`: if this is the first image for the article (`countByArticle === 0`), set `isPrimary = true`
   - Determine `sortOrder`: max existing `sortOrder` + 1 (or 0 if first)
   - Create DB record via `create()`
   - Return the created image record (with signed URLs)

4. **`setPrimary(prisma, tenantId, imageId)`**
   - Find image by ID, verify tenant ownership
   - In a transaction:
     - `updateMany({ where: { articleId, tenantId }, data: { isPrimary: false } })`
     - `updateMany({ where: { id: imageId, tenantId }, data: { isPrimary: true } })`
   - Return updated image

5. **`reorderImages(prisma, tenantId, imageIds: string[])`**
   - Validate all images belong to the same article and tenant
   - In a transaction: for each `imageId` at index `i`, update `sortOrder = i`
   - Return success

6. **`deleteImage(prisma, tenantId, imageId)`**
   - Find image by ID, verify tenant ownership
   - Delete from storage: `supabase.storage.from(BUCKET).remove([storagePath, thumbnailPath])`
   - Delete DB record
   - If deleted image was `isPrimary`, set the next image (lowest `sortOrder`) as primary
   - Return success

**Key implementation details:**
- All repository queries MUST filter by `tenantId` for isolation
- Storage paths include `tenantId` as first folder segment
- Signed URLs use the admin client (service role key) — no RLS policies needed for the MVP
- The Docker internal/public URL fixup from `billing-document-pdf-service.ts` must be applied to all generated signed URLs

**Verification:**
- Unit tests pass (Step 4.1)
- Manual test: Upload an image via the tRPC playground or test script, verify thumbnail appears in storage

---

## Phase 2: tRPC Router

### Step 2.1: Add Image Sub-Router to Articles Router

**File:** `src/trpc/routers/warehouse/articles.ts`

Add import at top:

```ts
import * as whArticleImageService from "@/lib/services/wh-article-image-service"
```

Add permission constants:

```ts
const WH_UPLOAD_IMAGE = permissionIdByKey("wh_articles.upload_image")!
const WH_DELETE_IMAGE = permissionIdByKey("wh_articles.delete_image")!
```

Add `images` sub-router inside `whArticlesRouter` (same pattern as `groups`):

```ts
  // ========== Images ==========

  images: createTRPCRouter({
    list: whProcedure
      .use(requirePermission(WH_VIEW))
      .input(z.object({ articleId: z.string().uuid() }))
      .query(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.listImages(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.articleId
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    getUploadUrl: whProcedure
      .use(requirePermission(WH_UPLOAD_IMAGE))
      .input(z.object({
        articleId: z.string().uuid(),
        filename: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(100),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.getUploadUrl(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.articleId,
            input.filename,
            input.mimeType
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    confirm: whProcedure
      .use(requirePermission(WH_UPLOAD_IMAGE))
      .input(z.object({
        articleId: z.string().uuid(),
        storagePath: z.string().min(1),
        filename: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(100),
        sizeBytes: z.number().int().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.confirmUpload(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.articleId,
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

    setPrimary: whProcedure
      .use(requirePermission(WH_UPLOAD_IMAGE))
      .input(z.object({ imageId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.setPrimary(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.imageId
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    reorder: whProcedure
      .use(requirePermission(WH_UPLOAD_IMAGE))
      .input(z.object({ imageIds: z.array(z.string().uuid()).min(1) }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.reorderImages(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.imageIds
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),

    delete: whProcedure
      .use(requirePermission(WH_DELETE_IMAGE))
      .input(z.object({ imageId: z.string().uuid() }))
      .mutation(async ({ ctx, input }) => {
        try {
          return await whArticleImageService.deleteImage(
            ctx.prisma as unknown as PrismaClient,
            ctx.tenantId!,
            input.imageId
          )
        } catch (err) {
          handleServiceError(err)
        }
      }),
  }),
```

**Verification:** `pnpm typecheck` passes (or at least no new errors). Router integration tests pass (Step 4.2).

---

## Phase 3: Frontend

### Step 3.1: Hooks

**File (new):** `src/hooks/use-wh-article-images.ts`

```ts
import { useTRPC } from "@/trpc"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

export function useWhArticleImages(articleId: string) {
  const trpc = useTRPC()
  return useQuery(
    trpc.warehouse.articles.images.list.queryOptions(
      { articleId },
      { enabled: !!articleId }
    )
  )
}

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

export function useSetPrimaryWhArticleImage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.images.setPrimary.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.images.list.queryKey(),
      })
    },
  })
}

export function useReorderWhArticleImages() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.images.reorder.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.images.list.queryKey(),
      })
    },
  })
}

export function useDeleteWhArticleImage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return useMutation({
    ...trpc.warehouse.articles.images.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.warehouse.articles.images.list.queryKey(),
      })
    },
  })
}
```

**File (modify):** `src/hooks/index.ts`

Add after the warehouse articles export block (after line 841):

```ts
// Warehouse Article Images
export {
  useWhArticleImages,
  useUploadWhArticleImage,
  useSetPrimaryWhArticleImage,
  useReorderWhArticleImages,
  useDeleteWhArticleImage,
} from './use-wh-article-images'
```

**Verification:** `pnpm typecheck` passes. Hooks can be imported from `@/hooks`.

---

### Step 3.2: Translations

**File (modify):** `messages/de.json`

Add to the `warehouseArticles` object (after `noArticleFound` on line 5721):

```json
    "tabImages": "Bilder",
    "imagesHeading": "Artikelbilder",
    "noImages": "Keine Bilder vorhanden",
    "actionUploadImage": "Bild hochladen",
    "actionUploadImages": "Bilder hochladen",
    "actionSetPrimary": "Als Hauptbild",
    "actionDeleteImage": "Bild löschen",
    "badgePrimaryImage": "Hauptbild",
    "uploadDialogTitle": "Bilder hochladen",
    "uploadDialogDescription": "Bilder per Drag & Drop oder Dateiauswahl hochladen",
    "uploadDropzoneText": "Bilder hier ablegen oder klicken",
    "uploadDropzoneHint": "JPEG, PNG oder WebP, max. 5 MB pro Datei",
    "uploadProgress": "Wird hochgeladen...",
    "uploadComplete": "Hochgeladen",
    "uploadError": "Fehler beim Hochladen",
    "toastImageUploaded": "Bild hochgeladen",
    "toastImagesUploaded": "{count} Bilder hochgeladen",
    "toastPrimarySet": "Hauptbild gesetzt",
    "toastImageDeleted": "Bild gelöscht",
    "toastReordered": "Reihenfolge gespeichert",
    "confirmDeleteImageTitle": "Bild löschen?",
    "confirmDeleteImageDescription": "Möchten Sie dieses Bild wirklich löschen? Dies kann nicht rückgängig gemacht werden.",
    "colThumbnail": "Bild",
    "imagePlaceholder": "Kein Bild"
```

**File (modify):** `messages/en.json`

Add equivalent English translations in the `warehouseArticles` section.

**Verification:** Translation keys resolve at runtime in the components.

---

### Step 3.3: Article Images Tab Component

**File (new):** `src/components/warehouse/article-images-tab.tsx`

**Purpose:** The "Bilder" tab on the article detail page. Shows an image gallery with drag-and-drop reordering, primary image badge, upload button, and per-image actions.

**Structure:**

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Star, Trash2, Upload, GripVertical, ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  useWhArticleImages,
  useSetPrimaryWhArticleImage,
  useReorderWhArticleImages,
  useDeleteWhArticleImage,
} from '@/hooks'
import { ArticleImageUpload } from './article-image-upload'

interface ArticleImagesTabProps {
  articleId: string
}
```

**Key UI elements:**

1. **Header row:** Heading "Artikelbilder" + "Bild hochladen" button (opens upload dialog)
2. **Empty state:** When no images, show a centered placeholder with ImageIcon and "Keine Bilder vorhanden" text + upload button
3. **Image grid:** CSS grid (3-4 columns responsive). Each cell is a `SortableImageCard` component:
   - Thumbnail image (from `thumbnailUrl`)
   - Drag handle (GripVertical icon, top-left)
   - Primary badge (Star icon, top-right, yellow when isPrimary)
   - Hover overlay with actions: "Als Hauptbild" (star icon) and "Löschen" (trash icon)
4. **Lightbox:** On click on an image, open a full-size view in a Dialog with the signed `url`
5. **Drag-and-drop:** Uses `@dnd-kit/sortable` with `rectSortingStrategy` for grid reordering. On `DragEnd`, call `reorderImages` mutation with the new order of IDs.
6. **Delete confirmation:** Uses `ConfirmDialog` component (already exists in codebase)

**SortableImageCard sub-component** (inside same file or split out):

```tsx
function SortableImageCard({ image, onSetPrimary, onDelete, onClickImage }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: image.id })
  // Render card with drag handle, thumbnail, badges, action buttons
}
```

**Lightbox:** Simple `Dialog` component from `@/components/ui/dialog`:
- Shows the full-size image (`url` from signed URL)
- Navigation arrows if multiple images (optional, can be Phase 2)
- Close button

**Verification:** Navigate to article detail, click "Bilder" tab. Gallery renders with existing images. Drag-and-drop reordering works. Set primary works. Delete works.

---

### Step 3.4: Article Image Upload Dialog

**File (new):** `src/components/warehouse/article-image-upload.tsx`

**Purpose:** Modal dialog for uploading one or more images. Drag & drop zone with progress tracking.

**Structure:**

```tsx
'use client'

import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useUploadWhArticleImage } from '@/hooks'

interface ArticleImageUploadProps {
  articleId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**Upload flow per file:**

1. User selects files (via file input or drag & drop)
2. Client-side validation: check mimeType (JPEG/PNG/WebP), file size (<= 5MB)
3. Show preview thumbnails with status indicators
4. For each valid file:
   a. Call `getUploadUrl.mutateAsync({ articleId, filename, mimeType })`
   b. Receive `{ signedUrl, storagePath, token }`
   c. Upload file directly to Supabase Storage via `fetch(signedUrl, { method: 'PUT', body: file, headers: { 'Content-Type': mimeType } })`
   d. Call `confirmUpload.mutateAsync({ articleId, storagePath, filename, mimeType, sizeBytes: file.size })`
   e. Update status indicator to "complete"
5. Show toast on completion
6. Close dialog

**Key UI elements:**

- Drop zone area with dashed border and upload icon
- Hidden `<input type="file" accept="image/jpeg,image/png,image/webp" multiple />`
- File list showing each selected file with:
  - Preview thumbnail (via `URL.createObjectURL`)
  - Filename and size
  - Status: pending / uploading (Loader2 spinner) / complete (CheckCircle green) / error (AlertCircle red + message)
- "Hochladen" button to start the upload (or auto-start on drop)
- Cancel button

**Verification:** Open upload dialog, drop a JPEG. Signed URL is fetched, file uploads to storage, confirm creates DB record, thumbnail is generated, image appears in gallery.

---

### Step 3.5: Article Detail — Add Images Tab

**File (modify):** `src/components/warehouse/article-detail.tsx`

1. Add import:
```ts
import { ArticleImagesTab } from './article-images-tab'
```

2. Add tab trigger after "Preise" (line 167):
```tsx
<TabsTrigger value="images">{t('tabImages')}</TabsTrigger>
```

3. Add tab content after the prices tab content (after line 230):
```tsx
<TabsContent value="images" className="mt-4">
  <ArticleImagesTab articleId={articleId} />
</TabsContent>
```

**Verification:** Article detail page shows 6 tabs. Clicking "Bilder" renders the images tab.

---

### Step 3.6: Article List — Thumbnail Column

**File (modify):** `src/components/warehouse/article-list.tsx`

1. Extend `WhArticleRow` interface:
```ts
interface WhArticleRow {
  // ... existing fields ...
  primaryImageThumbnailUrl?: string | null
}
```

2. Add a thumbnail column as the first column in the table header (before "Nummer"):
```tsx
<TableHead className="w-[50px]">{t('colThumbnail')}</TableHead>
```

3. Add thumbnail cell as the first cell in each row:
```tsx
<TableCell className="w-[50px]">
  {article.primaryImageThumbnailUrl ? (
    <img
      src={article.primaryImageThumbnailUrl}
      alt={article.name}
      className="h-8 w-8 rounded object-cover"
    />
  ) : (
    <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
      <ImageIcon className="h-4 w-4 text-muted-foreground" />
    </div>
  )}
</TableCell>
```

4. Import `ImageIcon` from lucide-react.

**Backend support:** The article `list` query currently does not return image data. Two options:

**Option A (recommended):** Add a `primaryImageThumbnailUrl` field to the article list response. Modify `wh-article-repository.ts` `findMany` to include a subquery/join for the primary image. Then in the service layer, generate a signed URL for just the primary image thumbnail per article. This adds a small overhead but keeps the data self-contained.

**Option B:** Fetch images separately on the client side. More network requests but simpler backend change.

**Go with Option A:**

**File (modify):** `src/lib/services/wh-article-repository.ts`

In `findMany`, add to the `include`:
```ts
include: {
  group: { select: { id: true, name: true } },
  articleImages: {
    where: { isPrimary: true },
    select: { thumbnailPath: true },
    take: 1,
  },
},
```

**File (modify):** `src/lib/services/wh-article-service.ts`

In `list`, after fetching from repo, map items to add `primaryImageThumbnailUrl`:
- For each article with a primary image, generate a signed URL for the thumbnail
- Batch sign URLs or sign individually (depends on performance — start with individual, optimize later if needed)

**Verification:** Article list shows small thumbnail in the first column. Articles without images show a placeholder icon.

---

### Step 3.7: Article List Page — Pass Data Through

**File (modify):** The page component that feeds data to `ArticleList` needs to pass the new `primaryImageThumbnailUrl` field. Check the parent component.

**File:** Check the page that calls `useWhArticles()` and passes data to `<ArticleList>`. The `useWhArticles` hook already returns whatever the `list` procedure returns, so as long as the service layer adds the field, it flows through automatically.

The `WhArticleRow` interface in `article-list.tsx` needs to accept the new optional field — already handled in Step 3.6.

**Verification:** Full integration: articles page loads, thumbnails appear.

---

## Phase 4: Tests

### Step 4.1: Service Tests

**File (new):** `src/lib/services/__tests__/wh-article-image-service.test.ts`

**Test setup:**
- Mock `createAdminClient` from `@/lib/supabase/admin` to return a mock Supabase client
- Mock `sharp` to return a mock buffer for thumbnail generation
- Use `vi.fn()` for Prisma mocks

**Test cases:**

1. **`listImages` — returns images sorted by sortOrder**
   - Mock `findByArticle` to return 3 images
   - Mock `createSignedUrl` for each image
   - Assert returned images have `url` and `thumbnailUrl` fields

2. **`getUploadUrl` — validates mime type**
   - Call with `image/gif` → throws `WhArticleImageValidationError`
   - Call with `image/jpeg` → returns signed URL

3. **`getUploadUrl` — generates correct storage path**
   - Verify path format: `{tenantId}/{articleId}/{uuid}.jpg`

4. **`confirmUpload` — creates DB record with correct metadata**
   - Mock storage download + sharp + upload
   - Assert `create` called with correct fields

5. **`confirmUpload` — first image becomes isPrimary**
   - Mock `countByArticle` to return 0
   - Assert created image has `isPrimary: true`

6. **`confirmUpload` — subsequent images are not isPrimary**
   - Mock `countByArticle` to return 2
   - Assert created image has `isPrimary: false`

7. **`setPrimary` — updates isPrimary flags correctly**
   - Mock findById + transaction
   - Assert `updateMany` called twice (reset all, set one)

8. **`reorderImages` — updates sortOrder for each image**
   - Mock findMany + updateMany
   - Assert each image gets correct sortOrder

9. **`deleteImage` — removes storage files and DB record**
   - Mock findById + storage remove + prisma delete
   - Assert both `storagePath` and `thumbnailPath` passed to storage.remove

10. **`deleteImage` — when primary deleted, next image becomes primary**
    - Mock deleted image as `isPrimary: true`
    - Mock remaining images
    - Assert `updateMany` called to set next image as primary

**Verification:** `pnpm vitest run src/lib/services/__tests__/wh-article-image-service.test.ts` passes all tests.

---

### Step 4.2: Router Tests

**File (new):** `src/trpc/routers/__tests__/whArticleImages-router.test.ts`

**Test setup:**
- Same pattern as `whArticles-router.test.ts`
- Mock `@/lib/db` for `requireModule`
- Use `createCallerFactory(whArticlesRouter)` to get a caller
- Mock the service module: `vi.mock("@/lib/services/wh-article-image-service")`

**Test cases:**

1. **`images.list` — returns images sorted by sortOrder**
   - Mock service `listImages` to return array
   - Assert result matches

2. **`images.list` — requires wh_articles.view permission**
   - Call with no permissions → throws "Insufficient permissions"

3. **`images.getUploadUrl` — requires wh_articles.upload_image permission**
   - Call with only `wh_articles.view` → throws "Insufficient permissions"

4. **`images.getUploadUrl` — returns signed URL on success**
   - Mock service to return URL
   - Assert result has `signedUrl` and `storagePath`

5. **`images.confirm` — validates input schema**
   - Call with missing `sizeBytes` → throws validation error

6. **`images.setPrimary` — calls service with correct args**
   - Mock service, assert called with `(prisma, tenantId, imageId)`

7. **`images.reorder` — passes image IDs array**
   - Mock service, assert called with correct `imageIds`

8. **`images.delete` — requires wh_articles.delete_image permission**
   - Call with only `wh_articles.upload_image` → throws "Insufficient permissions"

9. **`images.delete` — calls service with correct args**
   - Mock service, assert called with `(prisma, tenantId, imageId)`

**Verification:** `pnpm vitest run src/trpc/routers/__tests__/whArticleImages-router.test.ts` passes all tests.

---

### Step 4.3: Tenant Isolation Tests

Include in the service tests above (or as a separate describe block):

1. **`listImages` — only returns images for the correct tenant**
   - Mock `findByArticle` to verify `tenantId` is passed as filter

2. **`deleteImage` — rejects when image belongs to different tenant**
   - Mock `findById` to return image with different `tenantId`
   - Assert throws `WhArticleImageNotFoundError`

3. **`setPrimary` — rejects when image belongs to different tenant**
   - Same pattern

4. **`getUploadUrl` — rejects when article belongs to different tenant**
   - Mock `wh-article-service.getById` to throw `NotFoundError`
   - Assert error propagates

**Verification:** All tenant isolation tests pass.

---

## Phase 5: Handbook

### Step 5.1: Update Handbook

**File (modify):** `docs/TERP_HANDBUCH.md`

**5.1a: Update TOC** (around line 64)

Add under 14.2:
```
    - [14.2.6 Tab „Bilder"](#tab-bilder)
```

**5.1b: Update article detail section** (line 6480)

Change from:
```
Die Detailseite hat **5 Tabs**:
```
To:
```
Die Detailseite hat **6 Tabs**:
```

**5.1c: Add Tab "Bilder" section** (after Tab "Preise" section, after line 6571)

```markdown
#### Tab „Bilder"

📍 Tab **„Bilder"**

⚠️ Berechtigung: „Artikelbilder hochladen" (`wh_articles.upload_image`) zum Hochladen, „Artikelbilder löschen" (`wh_articles.delete_image`) zum Löschen

Hier werden einem Artikel Bilder zugeordnet. Ein Bild kann als Hauptbild markiert werden — dieses erscheint als Vorschau in der Artikelliste.

✅ Bildergalerie als Kacheln (Thumbnail-Vorschau). Hauptbild ist mit Stern-Badge markiert.

##### Bild hochladen

1. 📍 **„Bild hochladen"**
2. ✅ Dialog öffnet sich mit Drag & Drop-Bereich
3. Bilder per Drag & Drop ablegen oder Dateiauswahl (Klick)
4. ✅ Vorschau der ausgewählten Bilder mit Fortschrittsanzeige
5. ✅ Erlaubte Formate: JPEG, PNG, WebP — max. 5 MB pro Datei
6. ✅ Nach dem Upload erscheint das Bild in der Galerie
7. ✅ Das erste hochgeladene Bild wird automatisch als Hauptbild gesetzt

##### Hauptbild setzen

1. 📍 Über einem Bild: **Stern-Symbol** klicken
2. ✅ Das Bild wird als Hauptbild markiert, das vorherige Hauptbild verliert den Status

##### Reihenfolge ändern

1. 📍 Bilder per Drag & Drop (am Griff-Symbol oben links) in die gewünschte Reihenfolge ziehen
2. ✅ Reihenfolge wird automatisch gespeichert

##### Bild löschen

1. 📍 Über einem Bild: **Papierkorb-Symbol** klicken
2. ✅ Bestätigungsdialog: „Bild löschen? Dies kann nicht rückgängig gemacht werden."
3. 📍 „Bestätigen"
4. ✅ Bild wird aus Galerie und Speicher entfernt
5. ✅ War es das Hauptbild, wird automatisch das nächste Bild zum Hauptbild

##### Bildvorschau (Lightbox)

1. 📍 Auf ein Bild in der Galerie klicken
2. ✅ Großansicht des Bildes in einem Dialog
3. 📍 Schließen-Button oder Escape-Taste zum Schließen
```

**5.1d: Update Artikelliste section** (around line 6396)

Add a new row to the table column listing, as the first row:

```
| **Bild** | Thumbnail des Hauptbilds (8×8 px Vorschau) oder Platzhalter-Icon |
```

**5.1e: Update Praxisbeispiel** (optional, nice-to-have)

After the existing Praxisbeispiel steps, add a step for uploading an image to one of the example articles. This helps verify the feature manually.

**Verification:** Read through the handbook section. All steps must be clickable (can be executed step by step in the UI).

---

## File Summary

### New Files (6)

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/20260401100000_wh_article_images.sql` | Database migration |
| 2 | `src/lib/services/wh-article-image-service.ts` | Service + repository (CRUD, upload, thumbnails) |
| 3 | `src/hooks/use-wh-article-images.ts` | React hooks for image queries/mutations |
| 4 | `src/components/warehouse/article-images-tab.tsx` | Images tab with gallery, DnD, lightbox |
| 5 | `src/components/warehouse/article-image-upload.tsx` | Upload dialog with drag & drop |
| 6 | `src/trpc/routers/__tests__/whArticleImages-router.test.ts` | Router integration tests |

### Modified Files (10)

| # | File | Change |
|---|------|--------|
| 1 | `package.json` | Add `sharp`, `@dnd-kit/sortable` deps |
| 2 | `supabase/config.toml` | Add `wh-article-images` bucket |
| 3 | `prisma/schema.prisma` | Add `WhArticleImage` model + relations on `WhArticle` and `Tenant` |
| 4 | `src/lib/auth/permission-catalog.ts` | Add `upload_image` and `delete_image` permissions |
| 5 | `src/trpc/routers/warehouse/articles.ts` | Add `images` sub-router with 6 procedures |
| 6 | `src/hooks/index.ts` | Export new image hooks |
| 7 | `src/components/warehouse/article-detail.tsx` | Add 6th "Bilder" tab |
| 8 | `src/components/warehouse/article-list.tsx` | Add thumbnail column |
| 9 | `src/lib/services/wh-article-repository.ts` | Include primary image in `findMany` |
| 10 | `src/lib/services/wh-article-service.ts` | Add signed URL for primary thumbnail in `list` |
| 11 | `messages/de.json` | Add image-related translations |
| 12 | `messages/en.json` | Add image-related translations |
| 13 | `docs/TERP_HANDBUCH.md` | Add Bilder tab documentation, update TOC/counts |

### Test Files (2)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/lib/services/__tests__/wh-article-image-service.test.ts` | Service unit tests (10 cases) |
| 2 | `src/trpc/routers/__tests__/whArticleImages-router.test.ts` | Router integration tests (9 cases) |

---

## Implementation Order

Execute in this exact order to minimize integration issues:

1. **Phase 1.1** — `pnpm add sharp @dnd-kit/sortable`
2. **Phase 1.2** — Bucket in `config.toml`
3. **Phase 1.3** — SQL migration
4. **Phase 1.4** — Prisma schema + `pnpm db:generate`
5. **Phase 1.5** — Permissions in catalog
6. **Phase 1.6** — Service + repository
7. **Phase 2.1** — tRPC router procedures
8. **Phase 4.1** — Service tests (validate backend before frontend)
9. **Phase 4.2** — Router tests
10. **Phase 4.3** — Tenant isolation tests
11. **Phase 3.1** — Hooks
12. **Phase 3.2** — Translations
13. **Phase 3.3** — Images tab component
14. **Phase 3.4** — Upload dialog component
15. **Phase 3.5** — Article detail: add tab
16. **Phase 3.6** — Article list: add thumbnail column
17. **Phase 5.1** — Handbook update

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| `sharp` binary might not work in Docker/Vercel | Use `sharp` with platform-specific install flags. Vercel natively supports sharp. For Docker, ensure `linux` platform binaries are installed. |
| `createSignedUploadUrl` not available in older Supabase versions | Verify local Supabase supports it. If not, fall back to server-side upload (client sends file to Next.js API route, server uploads to Storage). |
| Thumbnail generation adds latency to `confirm` mutation | Accept ~1-2s latency. If it becomes a problem, move to background processing (queue). For MVP, synchronous is fine. |
| Signed URL expiry (1h) may cause broken images in long sessions | Frontend can detect 401 on image load and refetch URLs. Or use longer expiry (24h). |
| Large number of images per article could slow list query | The `findMany` include fetches only `isPrimary` images with `take: 1`, so it's bounded. |
