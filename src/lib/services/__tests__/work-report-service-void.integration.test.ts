/**
 * Integration tests for `workReportService.voidReport` (Phase 7).
 *
 * Runs against the real Postgres dev DB via Prisma. Guarded by HAS_DB
 * so the suite skips cleanly when DATABASE_URL is unset. Storage
 * operations piggy-back on the real Supabase admin client — we seed a
 * SIGNED record the same way Phase 6 does (via `sign()`) so the voided-
 * overlay render can find the signature PNG.
 *
 * Coverage focus:
 *   - Happy path: SIGNED→VOID commits atomically with all DB fields
 *     set; archived SIGNED PDF stays intact.
 *   - Validation: DRAFT cannot be voided, already-VOID rejects, short
 *     reason rejects.
 *   - Race condition: two parallel voidReport() calls → exactly one
 *     wins, the other throws AlreadyVoided/Conflict.
 *   - Audit row: exactly one `action: "void"` row per successful call
 *     with the reason in metadata.
 *   - Overlay: `generateVoidedOverlay` produces a distinct PDF next to
 *     the preserved signed archive.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 7)
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import * as workReportService from "../work-report-service"
import * as pdfService from "../work-report-pdf-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

const DOCUMENTS_BUCKET = "documents"
const SIGNATURE_BUCKET = "workreport-signatures"

// --- Fixture IDs — unique prefix `7721` (WR void integration 21) ---

const TENANT_A = "77210000-0000-4000-a000-000000007701"
const USER_A = "77210000-0000-4000-a000-000000007703"
const ORDER_A = "77210000-0000-4000-a000-000000007704"
const SO_A = "77210000-0000-4000-a000-000000007706"
const CUSTOMER_A = "77210000-0000-4000-a000-000000007708"
const EMPLOYEE_A = "77210000-0000-4000-a000-00000000770a"

// Tiny valid 1×1 PNG (same bytes as used by the sign integration tests) —
// the renderer and signature-bucket MIME allowlist both accept this.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg=="
const DATA_URL = `data:image/png;base64,${PNG_BASE64}`

const VALID_REASON = "Kunde meldete Fehler in der erfassten Leistung"

async function cleanupStorage() {
  const admin = createAdminClient()

  const reports = await prisma.workReport
    .findMany({
      where: { tenantId: TENANT_A },
      select: { id: true },
    })
    .catch(() => [])

  if (reports.length === 0) return

  // Documents bucket: canonical .pdf + side-channel .voided.pdf per report.
  const docPaths = reports.flatMap((r) => [
    `arbeitsscheine/${TENANT_A}/${r.id}.pdf`,
    `arbeitsscheine/${TENANT_A}/${r.id}.voided.pdf`,
  ])
  await admin.storage.from(DOCUMENTS_BUCKET).remove(docPaths).catch(() => {})

  // Signature bucket: UUID-suffixed paths, so we list-by-prefix and remove.
  const sigList = await admin.storage
    .from(SIGNATURE_BUCKET)
    .list(TENANT_A)
    .catch(() => ({ data: [] }) as { data: { name: string }[] })
  const sigPaths = (sigList.data ?? [])
    .filter((f) =>
      reports.some(
        (r) => f.name.startsWith(`${r.id}-`) || f.name === `${r.id}.png`,
      ),
    )
    .map((f) => `${TENANT_A}/${f.name}`)
  if (sigPaths.length > 0) {
    await admin.storage.from(SIGNATURE_BUCKET).remove(sigPaths).catch(() => {})
  }
}

async function cleanupFixtures() {
  await cleanupStorage()

  const ids = { in: [TENANT_A] }
  await prisma.workReportAttachment
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.workReportAssignment
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.workReport
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.order.deleteMany({ where: { tenantId: ids } }).catch(() => {})
  await prisma.serviceObject
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.crmAddress
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.employee
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.numberSequence
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.auditLog
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.billingTenantConfig
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.userTenant
    .deleteMany({ where: { tenantId: ids } })
    .catch(() => {})
  await prisma.user.deleteMany({ where: { id: USER_A } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: ids } }).catch(() => {})
}

async function seedFixtures() {
  await prisma.tenant.createMany({
    data: [
      { id: TENANT_A, name: "WR Void A", slug: "wr-void-a", isActive: true },
    ],
    skipDuplicates: true,
  })

  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: {
      id: USER_A,
      email: "wr-void@test.local",
      displayName: "WR Void Tester",
      isActive: true,
    },
  })

  await prisma.crmAddress.create({
    data: {
      id: CUSTOMER_A,
      tenantId: TENANT_A,
      number: "K-WRVOID01",
      company: "WR Void Kunde A",
      type: "CUSTOMER",
    },
  })

  await prisma.serviceObject.create({
    data: {
      id: SO_A,
      tenantId: TENANT_A,
      number: "SO-WRVOID01",
      name: "Kältemaschine Void-Test",
      kind: "EQUIPMENT",
      customerAddressId: CUSTOMER_A,
      status: "OPERATIONAL",
      isActive: true,
      qrCodePayload: `TERP:SO:${TENANT_A.substring(0, 6)}:SO-WRVOID01`,
    },
  })

  await prisma.order.create({
    data: {
      id: ORDER_A,
      tenantId: TENANT_A,
      code: "A-WRVOID01",
      name: "Void-Test Auftrag",
      customer: "WR Void Kunde A",
      isActive: true,
      status: "active",
      serviceObjectId: SO_A,
    },
  })

  await prisma.employee.create({
    data: {
      id: EMPLOYEE_A,
      tenantId: TENANT_A,
      personnelNumber: "WR-VOID-001",
      pin: "wv01",
      firstName: "Hans",
      lastName: "Müller",
      entryDate: new Date("2025-01-01"),
    },
  })
}

/**
 * Creates a DRAFT record and either leaves it DRAFT, or flips to SIGNED.
 * Uses the real `sign()` service so we exercise the exact same code-path
 * the VOID flow will see in production: signature bucket has a PNG,
 * documents bucket has the archived PDF, the DB fields reflect a
 * legit SIGNED record.
 */
async function createSignedReport(): Promise<{ id: string; code: string }> {
  const draft = await workReportService.create(
    prisma,
    TENANT_A,
    {
      orderId: ORDER_A,
      serviceObjectId: SO_A,
      visitDate: "2026-04-22",
      workDescription:
        "Void-Integration: Filter gewechselt, Drucktest bestanden.",
    },
    { userId: USER_A },
  )

  await prisma.workReportAssignment.create({
    data: {
      tenantId: TENANT_A,
      workReportId: draft.id,
      employeeId: EMPLOYEE_A,
      role: "Techniker",
    },
  })

  const signed = await workReportService.sign(
    prisma,
    TENANT_A,
    {
      id: draft.id,
      signerName: "Max Müller",
      signerRole: "Werkmeister",
      signatureDataUrl: DATA_URL,
    },
    { userId: USER_A, ipAddress: "10.0.0.1" },
  )
  return { id: signed.id, code: signed.code }
}

async function createDraftReport(): Promise<{ id: string; code: string }> {
  const draft = await workReportService.create(
    prisma,
    TENANT_A,
    {
      orderId: ORDER_A,
      visitDate: "2026-04-22",
      workDescription: "Void-Integration DRAFT",
    },
    { userId: USER_A },
  )
  return { id: draft.id, code: draft.code }
}

describe.skipIf(!HAS_DB).sequential(
  "work-report-service.voidReport integration",
  () => {
    beforeAll(async () => {
      await cleanupFixtures()
      await seedFixtures()
    })

    afterAll(async () => {
      await cleanupFixtures()
    })

    // -------------------------------------------------------------------------
    // 1. Happy path — SIGNED → VOID with all fields set
    // -------------------------------------------------------------------------
    it("commits SIGNED→VOID and writes all void metadata fields", async () => {
      const { id, code } = await createSignedReport()

      const result = await workReportService.voidReport(
        prisma,
        TENANT_A,
        { id, reason: VALID_REASON },
        { userId: USER_A, ipAddress: "10.0.0.1", userAgent: "vitest" },
      )

      // Service return value reflects VOID state.
      expect(result.status).toBe("VOID")
      expect(result.voidedAt).toBeTruthy()
      expect(result.voidedById).toBe(USER_A)
      expect(result.voidReason).toBe(VALID_REASON)

      // SIGNED-era fields are preserved (not blanked).
      expect(result.signedAt).toBeTruthy()
      expect(result.signerName).toBe("Max Müller")
      expect(result.signerRole).toBe("Werkmeister")
      expect(result.signaturePath).toBeTruthy()
      expect(result.pdfUrl).toBe(`arbeitsscheine/${TENANT_A}/${id}.pdf`)

      // DB row matches.
      const row = await prisma.workReport.findUnique({ where: { id } })
      expect(row?.status).toBe("VOID")
      expect(row?.voidedById).toBe(USER_A)
      expect(row?.voidReason).toBe(VALID_REASON)
      expect(row?.code).toBe(code)
    })

    // -------------------------------------------------------------------------
    // 2. Audit row — exactly one `action: "void"` with the reason metadata
    // -------------------------------------------------------------------------
    it("writes exactly one audit row with action=void and reason in metadata", async () => {
      const { id } = await createSignedReport()

      await workReportService.voidReport(
        prisma,
        TENANT_A,
        { id, reason: VALID_REASON },
        { userId: USER_A, ipAddress: "10.0.0.1" },
      )

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: TENANT_A,
          entityType: "work_report",
          entityId: id,
          action: "void",
        },
      })
      expect(logs.length).toBe(1)
      const log = logs[0]!
      expect(log.userId).toBe(USER_A)
      const metadata = log.metadata as Record<string, unknown>
      expect(metadata.reason).toBe(VALID_REASON)
    })

    // -------------------------------------------------------------------------
    // 3. Archived SIGNED PDF stays at its canonical path after void
    // -------------------------------------------------------------------------
    it("preserves the archived SIGNED PDF at arbeitsscheine/{tenantId}/{id}.pdf after void", async () => {
      const { id } = await createSignedReport()

      const admin = createAdminClient()
      const archivedPath = `arbeitsscheine/${TENANT_A}/${id}.pdf`

      // Archive exists before void.
      const pre = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .download(archivedPath)
      expect(pre.error).toBeNull()

      await workReportService.voidReport(
        prisma,
        TENANT_A,
        { id, reason: VALID_REASON },
        { userId: USER_A },
      )

      // Archive is still there, byte-for-byte, after void.
      const post = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .download(archivedPath)
      expect(post.error).toBeNull()

      const preBuf = Buffer.from(await pre.data!.arrayBuffer())
      const postBuf = Buffer.from(await post.data!.arrayBuffer())
      expect(Buffer.compare(preBuf, postBuf)).toBe(0)
    })

    // -------------------------------------------------------------------------
    // 4. Validation — DRAFT cannot be voided
    // -------------------------------------------------------------------------
    it("rejects void on a DRAFT record with WorkReportValidationError", async () => {
      const { id } = await createDraftReport()

      await expect(
        workReportService.voidReport(
          prisma,
          TENANT_A,
          { id, reason: VALID_REASON },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })

      // Row stays DRAFT.
      const row = await prisma.workReport.findUnique({ where: { id } })
      expect(row?.status).toBe("DRAFT")
      expect(row?.voidedAt).toBeNull()
    })

    // -------------------------------------------------------------------------
    // 5. Validation — already-VOID rejects
    // -------------------------------------------------------------------------
    it("rejects a second void on an already-VOID record with WorkReportConflictError", async () => {
      const { id } = await createSignedReport()

      await workReportService.voidReport(
        prisma,
        TENANT_A,
        { id, reason: VALID_REASON },
        { userId: USER_A },
      )

      await expect(
        workReportService.voidReport(
          prisma,
          TENANT_A,
          { id, reason: "Anderer Stornogrund 12345" },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportConflictError" })

      // Reason stays the original — second call must not overwrite.
      const row = await prisma.workReport.findUnique({ where: { id } })
      expect(row?.voidReason).toBe(VALID_REASON)
    })

    // -------------------------------------------------------------------------
    // 6. Validation — short reason rejects
    // -------------------------------------------------------------------------
    it("rejects a reason under 10 characters with WorkReportValidationError", async () => {
      const { id } = await createSignedReport()

      await expect(
        workReportService.voidReport(
          prisma,
          TENANT_A,
          { id, reason: "kurz" },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })

      // Row stays SIGNED.
      const row = await prisma.workReport.findUnique({ where: { id } })
      expect(row?.status).toBe("SIGNED")
      expect(row?.voidedAt).toBeNull()
    })

    // -------------------------------------------------------------------------
    // 7. Race condition — two parallel voidReport() calls
    // -------------------------------------------------------------------------
    it("parallel voidReport() calls: exactly one wins, the other throws AlreadyVoided/Conflict", async () => {
      const { id } = await createSignedReport()

      const results = await Promise.allSettled([
        workReportService.voidReport(
          prisma,
          TENANT_A,
          { id, reason: "Reason-A — Stornogrund A" },
          { userId: USER_A },
        ),
        workReportService.voidReport(
          prisma,
          TENANT_A,
          { id, reason: "Reason-B — Stornogrund B" },
          { userId: USER_A },
        ),
      ])

      const successes = results.filter((r) => r.status === "fulfilled")
      const rejections = results.filter(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult[]

      expect(successes.length).toBe(1)
      expect(rejections.length).toBe(1)

      // Loser throws the conflict-mapped error (either AlreadyVoided
      // from the pre-fetch path, or Conflict from the count=0 path).
      expect(rejections[0]!.reason.name).toBe("WorkReportConflictError")

      // DB reflects the winner's reason.
      const row = await prisma.workReport.findUnique({ where: { id } })
      expect(row?.status).toBe("VOID")
      const winnerReason = (
        successes[0] as PromiseFulfilledResult<{ voidReason: string | null }>
      ).value.voidReason
      expect(row?.voidReason).toBe(winnerReason)

      // Exactly one audit row was written.
      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: TENANT_A,
          entityType: "work_report",
          entityId: id,
          action: "void",
        },
      })
      expect(logs.length).toBe(1)
    })

    // -------------------------------------------------------------------------
    // 8. Overlay PDF — generateVoidedOverlay produces a distinct side-channel
    // -------------------------------------------------------------------------
    it("generateVoidedOverlay after void renders a distinct .voided.pdf with the STORNIERT overlay", async () => {
      const { id } = await createSignedReport()

      await workReportService.voidReport(
        prisma,
        TENANT_A,
        { id, reason: VALID_REASON },
        { userId: USER_A },
      )

      const result = await pdfService.generateVoidedOverlay(
        prisma,
        TENANT_A,
        id,
      )
      expect(result.signedUrl).toMatch(/^https?:\/\//)

      const admin = createAdminClient()
      const { data: list } = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .list(`arbeitsscheine/${TENANT_A}`)
      const names = list?.map((f) => f.name) ?? []
      expect(names).toContain(`${id}.pdf`)
      expect(names).toContain(`${id}.voided.pdf`)

      // Original vs. voided bytes differ.
      const original = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .download(`arbeitsscheine/${TENANT_A}/${id}.pdf`)
      expect(original.error).toBeNull()
      const originalBuf = Buffer.from(await original.data!.arrayBuffer())

      const voided = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .download(`arbeitsscheine/${TENANT_A}/${id}.voided.pdf`)
      expect(voided.error).toBeNull()
      const voidedBuf = Buffer.from(await voided.data!.arrayBuffer())

      expect(originalBuf.slice(0, 5).toString("ascii")).toBe("%PDF-")
      expect(voidedBuf.slice(0, 5).toString("ascii")).toBe("%PDF-")
      expect(Buffer.compare(originalBuf, voidedBuf)).not.toBe(0)
    })
  },
)
