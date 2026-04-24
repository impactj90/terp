/**
 * Integration tests for work-report-attachment-service (Phase 4).
 *
 * Runs against the real Postgres dev DB via Prisma and the real Supabase
 * storage admin client. Guarded by HAS_DB so the suite skips cleanly when
 * DATABASE_URL is unset.
 *
 * Test flow covers the full 3-step upload pipeline end-to-end:
 *   1. getUploadUrl returns a signed PUT URL
 *   2. HTTP PUT uploads a small JPEG buffer
 *   3. confirmUpload creates a DB row
 * Followed by listAttachments / getDownloadUrl / remove with storage
 * cleanup verification.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 4)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import * as workReportService from "../work-report-service"
import * as attachmentService from "../work-report-attachment-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

const BUCKET = "workreport-attachments"

// Fixture IDs — unique prefix `7708` (WR attachment test 08).
const TENANT_A = "77080000-0000-4000-a000-000000007801"
const TENANT_B = "77080000-0000-4000-a000-000000007802"
const USER_A = "77080000-0000-4000-a000-000000007803"
const ORDER_A = "77080000-0000-4000-a000-000000007804"
const ORDER_B = "77080000-0000-4000-a000-000000007805"

// A minimal valid JPEG: SOI + APP0 (JFIF) + EOI. Enough to pass a
// MIME-sniff on Supabase without needing a fixture file.
const MINIMAL_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
])

async function cleanupFixtures() {
  const ids = { in: [TENANT_A, TENANT_B] }

  // Collect storage paths before we wipe the DB rows so we can also clean
  // up the bucket objects — otherwise a mid-test crash leaves orphans.
  const storagePaths = await prisma.workReportAttachment
    .findMany({
      where: { tenantId: ids },
      select: { storagePath: true },
    })
    .catch(() => [])

  await prisma.workReportAttachment
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.workReportAssignment
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.workReport.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.order.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.numberSequence
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.auditLog.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.userTenant.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: USER_A } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: ids } }).catch(() => {})

  if (storagePaths.length > 0) {
    const admin = createAdminClient()
    await admin.storage
      .from(BUCKET)
      .remove(storagePaths.map((p) => p.storagePath))
      .catch(() => {})
  }
}

async function seedFixtures() {
  await prisma.tenant.createMany({
    data: [
      { id: TENANT_A, name: "WR Att A", slug: "wr-att-a", isActive: true },
      { id: TENANT_B, name: "WR Att B", slug: "wr-att-b", isActive: true },
    ],
    skipDuplicates: true,
  })

  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: {
      id: USER_A,
      email: "wr-att@test.local",
      displayName: "WR Attachment Tester",
      isActive: true,
    },
  })

  await prisma.order.createMany({
    data: [
      {
        id: ORDER_A,
        tenantId: TENANT_A,
        code: "A-WR-ATT-1",
        name: "Attachment Auftrag A",
        isActive: true,
        status: "active",
      },
      {
        id: ORDER_B,
        tenantId: TENANT_B,
        code: "A-WR-ATT-1",
        name: "Attachment Auftrag B",
        isActive: true,
        status: "active",
      },
    ],
    skipDuplicates: true,
  })
}

async function createDraftReport(tenantId: string = TENANT_A, orderId: string = ORDER_A) {
  return workReportService.create(
    prisma,
    tenantId,
    {
      orderId,
      visitDate: "2026-04-22",
      workDescription: "Attachment test",
    },
    { userId: USER_A },
  )
}

describe.skipIf(!HAS_DB).sequential(
  "work-report-attachment-service integration",
  () => {
    beforeAll(async () => {
      await cleanupFixtures()
      await seedFixtures()
    })

    afterAll(async () => {
      await cleanupFixtures()
    })

    // -----------------------------------------------------------------------
    // End-to-end 3-step upload flow against the real Supabase storage.
    // -----------------------------------------------------------------------
    it("full upload pipeline: getUploadUrl → HTTP PUT → confirmUpload → listAttachments → getDownloadUrl → remove", async () => {
      const report = await createDraftReport()

      // Stage 1: presigned PUT URL
      const { signedUrl, storagePath, token } = await attachmentService.getUploadUrl(
        prisma,
        TENANT_A,
        report.id,
        "foto.jpg",
        "image/jpeg",
      )

      expect(signedUrl).toMatch(/^https?:\/\//)
      expect(storagePath).toMatch(
        new RegExp(`^${TENANT_A}/${report.id}/[\\w-]+\\.jpg$`),
      )
      expect(typeof token).toBe("string")

      // Stage 2: direct PUT to Supabase. We bypass the presigned-URL HTTP
      // flow (which hits localhost:54321) by calling `uploadToSignedUrl`,
      // the admin-client equivalent that exercises the same storage path.
      const admin = createAdminClient()
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .uploadToSignedUrl(storagePath, token, MINIMAL_JPEG, {
          contentType: "image/jpeg",
        })
      expect(uploadError).toBeNull()

      // Stage 3: confirmUpload → DB row
      const attachment = await attachmentService.confirmUpload(
        prisma,
        TENANT_A,
        report.id,
        storagePath,
        "foto.jpg",
        "image/jpeg",
        MINIMAL_JPEG.length,
        USER_A,
        { userId: USER_A },
      )

      expect(attachment.tenantId).toBe(TENANT_A)
      expect(attachment.workReportId).toBe(report.id)
      expect(attachment.storagePath).toBe(storagePath)
      expect(attachment.filename).toBe("foto.jpg")
      expect(attachment.mimeType).toBe("image/jpeg")
      expect(attachment.sizeBytes).toBe(MINIMAL_JPEG.length)
      expect(attachment.createdById).toBe(USER_A)

      // listAttachments returns the row with a signed downloadUrl
      const listed = await attachmentService.listAttachments(
        prisma,
        TENANT_A,
        report.id,
      )
      expect(listed).toHaveLength(1)
      expect(listed[0]?.id).toBe(attachment.id)
      expect(listed[0]?.downloadUrl).toMatch(/^https?:\/\//)

      // getDownloadUrl returns a signed URL
      const { signedUrl: downloadUrl } = await attachmentService.getDownloadUrl(
        prisma,
        TENANT_A,
        attachment.id,
      )
      expect(downloadUrl).toMatch(/^https?:\/\//)

      // Audit row was written under the parent WorkReport
      const audit = await prisma.auditLog.findFirst({
        where: {
          tenantId: TENANT_A,
          entityType: "work_report",
          entityId: report.id,
          action: "attachment_added",
        },
      })
      expect(audit).not.toBeNull()
      expect(audit?.entityName).toBe(report.code)

      // Storage has the object
      const { data: statBefore } = await admin.storage
        .from(BUCKET)
        .list(`${TENANT_A}/${report.id}`)
      expect(
        statBefore?.some((f) => storagePath.endsWith(f.name)),
      ).toBe(true)

      // Remove: DB row gone AND storage blob gone
      await attachmentService.remove(prisma, TENANT_A, attachment.id, {
        userId: USER_A,
      })

      const afterCount = await prisma.workReportAttachment.count({
        where: { id: attachment.id },
      })
      expect(afterCount).toBe(0)

      const { data: statAfter } = await admin.storage
        .from(BUCKET)
        .list(`${TENANT_A}/${report.id}`)
      expect(
        statAfter?.some((f) => storagePath.endsWith(f.name)),
      ).toBe(false)

      const removeAudit = await prisma.auditLog.findFirst({
        where: {
          tenantId: TENANT_A,
          entityType: "work_report",
          entityId: report.id,
          action: "attachment_removed",
        },
      })
      expect(removeAudit).not.toBeNull()
    })

    // -----------------------------------------------------------------------
    // Path-traversal guard defends against cross-tenant storagePath injection
    // at the confirm-upload stage.
    // -----------------------------------------------------------------------
    it("rejects confirmUpload with a cross-tenant storage path (traversal guard)", async () => {
      const report = await createDraftReport()

      await expect(
        attachmentService.confirmUpload(
          prisma,
          TENANT_A,
          report.id,
          `${TENANT_B}/evil/x.jpg`, // client-supplied path outside the expected prefix
          "x.jpg",
          "image/jpeg",
          100,
          USER_A,
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportAttachmentValidationError" })

      const count = await prisma.workReportAttachment.count({
        where: { workReportId: report.id },
      })
      expect(count).toBe(0)
    })

    // -----------------------------------------------------------------------
    // DRAFT-only-editable guard: once a parent is SIGNED, neither uploads
    // nor deletes are permitted.
    // -----------------------------------------------------------------------
    it("rejects uploads and deletes when the parent WorkReport is SIGNED", async () => {
      const report = await createDraftReport()

      // Seed an attachment while DRAFT
      const { storagePath, token } = await attachmentService.getUploadUrl(
        prisma,
        TENANT_A,
        report.id,
        "foto.jpg",
        "image/jpeg",
      )
      const admin = createAdminClient()
      await admin.storage
        .from(BUCKET)
        .uploadToSignedUrl(storagePath, token, MINIMAL_JPEG, {
          contentType: "image/jpeg",
        })
      const attachment = await attachmentService.confirmUpload(
        prisma,
        TENANT_A,
        report.id,
        storagePath,
        "foto.jpg",
        "image/jpeg",
        MINIMAL_JPEG.length,
        USER_A,
        { userId: USER_A },
      )

      // Transition to SIGNED via raw update (Phase 6 will add sign()).
      await prisma.workReport.update({
        where: { id: report.id },
        data: { status: "SIGNED", signedAt: new Date(), signerName: "Tester" },
      })

      await expect(
        attachmentService.getUploadUrl(
          prisma,
          TENANT_A,
          report.id,
          "another.jpg",
          "image/jpeg",
        ),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })

      await expect(
        attachmentService.confirmUpload(
          prisma,
          TENANT_A,
          report.id,
          `${TENANT_A}/${report.id}/another.jpg`,
          "another.jpg",
          "image/jpeg",
          100,
          USER_A,
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })

      await expect(
        attachmentService.remove(prisma, TENANT_A, attachment.id, {
          userId: USER_A,
        }),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })

      // DB row still intact — delete was rejected, not silently skipped
      const stillThere = await prisma.workReportAttachment.count({
        where: { id: attachment.id },
      })
      expect(stillThere).toBe(1)

      // Cleanup storage for this test since afterAll's cleanup only deletes
      // DB-tracked rows, and our manual state may drift if the test repeats.
      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    })

    // -----------------------------------------------------------------------
    // Reading attachments on a SIGNED parent is still allowed (read-only).
    // -----------------------------------------------------------------------
    it("listAttachments and getDownloadUrl work on SIGNED parents", async () => {
      const report = await createDraftReport()

      const { storagePath, token } = await attachmentService.getUploadUrl(
        prisma,
        TENANT_A,
        report.id,
        "foto.jpg",
        "image/jpeg",
      )
      const admin = createAdminClient()
      await admin.storage
        .from(BUCKET)
        .uploadToSignedUrl(storagePath, token, MINIMAL_JPEG, {
          contentType: "image/jpeg",
        })
      const attachment = await attachmentService.confirmUpload(
        prisma,
        TENANT_A,
        report.id,
        storagePath,
        "foto.jpg",
        "image/jpeg",
        MINIMAL_JPEG.length,
        USER_A,
        { userId: USER_A },
      )

      await prisma.workReport.update({
        where: { id: report.id },
        data: { status: "SIGNED", signedAt: new Date(), signerName: "Tester" },
      })

      const listed = await attachmentService.listAttachments(
        prisma,
        TENANT_A,
        report.id,
      )
      expect(listed.some((a) => a.id === attachment.id)).toBe(true)

      const { signedUrl } = await attachmentService.getDownloadUrl(
        prisma,
        TENANT_A,
        attachment.id,
      )
      expect(signedUrl).toMatch(/^https?:\/\//)

      await admin.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    })

    // -----------------------------------------------------------------------
    // Cross-tenant isolation: attachments from Tenant A are invisible to
    // Tenant B's service calls.
    // -----------------------------------------------------------------------
    it("cross-tenant read/delete is blocked", async () => {
      const report = await createDraftReport(TENANT_A, ORDER_A)

      const { storagePath, token } = await attachmentService.getUploadUrl(
        prisma,
        TENANT_A,
        report.id,
        "foto.jpg",
        "image/jpeg",
      )
      const admin = createAdminClient()
      await admin.storage
        .from(BUCKET)
        .uploadToSignedUrl(storagePath, token, MINIMAL_JPEG, {
          contentType: "image/jpeg",
        })
      const attachment = await attachmentService.confirmUpload(
        prisma,
        TENANT_A,
        report.id,
        storagePath,
        "foto.jpg",
        "image/jpeg",
        MINIMAL_JPEG.length,
        USER_A,
        { userId: USER_A },
      )

      await expect(
        attachmentService.getDownloadUrl(prisma, TENANT_B, attachment.id),
      ).rejects.toMatchObject({ name: "WorkReportAttachmentNotFoundError" })

      await expect(
        attachmentService.remove(prisma, TENANT_B, attachment.id),
      ).rejects.toMatchObject({ name: "WorkReportAttachmentNotFoundError" })

      // Still exists under Tenant A
      const still = await prisma.workReportAttachment.count({
        where: { id: attachment.id },
      })
      expect(still).toBe(1)
    })

    // -----------------------------------------------------------------------
    // Missing or cross-tenant parent reports are reported as NotFound.
    // -----------------------------------------------------------------------
    it("listAttachments on a missing parent rejects with WorkReportNotFoundError", async () => {
      await expect(
        attachmentService.listAttachments(
          prisma,
          TENANT_A,
          "00000000-0000-4000-a000-000000000099",
        ),
      ).rejects.toMatchObject({ name: "WorkReportNotFoundError" })
    })
  },
)
