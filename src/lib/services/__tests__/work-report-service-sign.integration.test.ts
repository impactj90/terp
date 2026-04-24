/**
 * Integration tests for `workReportService.sign` (Phase 6 — KRITISCH).
 *
 * Runs against the real Postgres dev DB and the real Supabase Storage
 * admin client. Guarded by HAS_DB so the suite skips cleanly when
 * DATABASE_URL is unset.
 *
 * Coverage focus:
 *   - Happy path: DB fields set atomically, signature PNG + archived PDF
 *     present in their canonical buckets, audit row with `action: "sign"`.
 *   - Pflichtfeld validation: missing description / no assignments leave
 *     the record DRAFT and skip every upload.
 *   - Race condition: two parallel sign() calls → exactly one wins, the
 *     loser's orphan signature is cleaned up, the DB reflects the
 *     winner's metadata.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 6)
 */
import { createHash } from "crypto"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import { createAdminClient } from "@/lib/supabase/admin"
import * as workReportService from "../work-report-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

const DOCUMENTS_BUCKET = "documents"
const SIGNATURE_BUCKET = "workreport-signatures"

// --- Fixture IDs — unique prefix `7720` (WR sign-integration 20) ---

const TENANT_A = "77200000-0000-4000-a000-000000007701"
const USER_A = "77200000-0000-4000-a000-000000007703"
const ORDER_A = "77200000-0000-4000-a000-000000007704"
const SO_A = "77200000-0000-4000-a000-000000007706"
const CUSTOMER_A = "77200000-0000-4000-a000-000000007708"
const EMPLOYEE_A = "77200000-0000-4000-a000-00000000770a"
const EMPLOYEE_B = "77200000-0000-4000-a000-00000000770b"

// Two valid tiny PNGs — the first is a 1×1 black pixel, the second a
// 2×1 black-pixel image generated via Node's zlib (see scripts in the
// plan's research doc). Both decode cleanly in zlib (important for the
// PDF renderer, which embeds PNG via @react-pdf/renderer). SHA256
// identities differ, which lets the race-condition test disambiguate
// which writer won.
const PNG_A_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFhAJ/wlseKgAAAABJRU5ErkJggg==" // 1×1 black
const PNG_B_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAC0lEQVR4nGNgAAMAAAcAAbKGrPQAAAAASUVORK5CYII=" // 2×1 black

const DATA_URL_A = `data:image/png;base64,${PNG_A_BASE64}`
const DATA_URL_B = `data:image/png;base64,${PNG_B_BASE64}`

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex")
}

async function listSignatureFiles(workReportId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.storage.from(SIGNATURE_BUCKET).list(TENANT_A)
  return (data ?? [])
    .filter((f) => f.name.startsWith(`${workReportId}-`))
    .map((f) => f.name)
}

async function cleanupStorage() {
  const admin = createAdminClient()

  const reports = await prisma.workReport
    .findMany({
      where: { tenantId: TENANT_A },
      select: { id: true },
    })
    .catch(() => [])

  if (reports.length === 0) return

  // Document bucket: deterministic .pdf + .voided.pdf per report.
  const docPaths = reports.flatMap((r) => [
    `arbeitsscheine/${TENANT_A}/${r.id}.pdf`,
    `arbeitsscheine/${TENANT_A}/${r.id}.voided.pdf`,
  ])
  await admin.storage.from(DOCUMENTS_BUCKET).remove(docPaths).catch(() => {})

  // Signature bucket: UUID-suffixed path, so we list-by-prefix and remove.
  const sigList = await admin.storage
    .from(SIGNATURE_BUCKET)
    .list(TENANT_A)
    .catch(() => ({ data: [] }) as { data: { name: string }[] })
  const sigPaths = (sigList.data ?? [])
    .filter((f) =>
      reports.some((r) => f.name.startsWith(`${r.id}-`) || f.name === `${r.id}.png`),
    )
    .map((f) => `${TENANT_A}/${f.name}`)
  if (sigPaths.length > 0) {
    await admin.storage
      .from(SIGNATURE_BUCKET)
      .remove(sigPaths)
      .catch(() => {})
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
      { id: TENANT_A, name: "WR Sign A", slug: "wr-sign-a", isActive: true },
    ],
    skipDuplicates: true,
  })

  await prisma.user.upsert({
    where: { id: USER_A },
    update: {},
    create: {
      id: USER_A,
      email: "wr-sign@test.local",
      displayName: "WR Sign Tester",
      isActive: true,
    },
  })

  await prisma.crmAddress.create({
    data: {
      id: CUSTOMER_A,
      tenantId: TENANT_A,
      number: "K-WRSIGN01",
      company: "WR Sign Kunde A",
      type: "CUSTOMER",
    },
  })

  await prisma.serviceObject.create({
    data: {
      id: SO_A,
      tenantId: TENANT_A,
      number: "SO-WRSIGN01",
      name: "Kältemaschine Sign-Test",
      kind: "EQUIPMENT",
      customerAddressId: CUSTOMER_A,
      status: "OPERATIONAL",
      isActive: true,
      qrCodePayload: `TERP:SO:${TENANT_A.substring(0, 6)}:SO-WRSIGN01`,
    },
  })

  await prisma.order.create({
    data: {
      id: ORDER_A,
      tenantId: TENANT_A,
      code: "A-WRSIGN01",
      name: "Sign-Test Auftrag",
      customer: "WR Sign Kunde A",
      isActive: true,
      status: "active",
      serviceObjectId: SO_A,
    },
  })

  await prisma.employee.createMany({
    data: [
      {
        id: EMPLOYEE_A,
        tenantId: TENANT_A,
        personnelNumber: "WR-SIGN-001",
        pin: "wr01",
        firstName: "Hans",
        lastName: "Müller",
        entryDate: new Date("2025-01-01"),
      },
      {
        id: EMPLOYEE_B,
        tenantId: TENANT_A,
        personnelNumber: "WR-SIGN-002",
        pin: "wr02",
        firstName: "Lisa",
        lastName: "Schneider",
        entryDate: new Date("2025-01-01"),
      },
    ],
    skipDuplicates: true,
  })
}

async function createSignableDraft(opts?: {
  withAssignment?: boolean
  withDescription?: boolean
}) {
  const withAssignment = opts?.withAssignment ?? true
  const withDescription = opts?.withDescription ?? true

  const report = await workReportService.create(
    prisma,
    TENANT_A,
    {
      orderId: ORDER_A,
      serviceObjectId: SO_A,
      visitDate: "2026-04-22",
      workDescription: withDescription
        ? "Sign-Integration: Filter gewechselt, Drucktest bestanden."
        : null,
    },
    { userId: USER_A },
  )

  if (withAssignment) {
    await prisma.workReportAssignment.create({
      data: {
        tenantId: TENANT_A,
        workReportId: report.id,
        employeeId: EMPLOYEE_A,
        role: "Techniker",
      },
    })
  }

  return report
}

describe.skipIf(!HAS_DB).sequential(
  "work-report-service.sign integration",
  () => {
    beforeAll(async () => {
      await cleanupFixtures()
      await seedFixtures()
    })

    afterAll(async () => {
      await cleanupFixtures()
    })

    // -------------------------------------------------------------------------
    // 1. Happy path
    // -------------------------------------------------------------------------
    it("sign() commits DRAFT→SIGNED with signature + PDF archived, and writes a sign audit row", async () => {
      const admin = createAdminClient()
      const draft = await createSignableDraft()

      const result = await workReportService.sign(
        prisma,
        TENANT_A,
        {
          id: draft.id,
          signerName: "Max Müller",
          signerRole: "Werkmeister",
          signatureDataUrl: DATA_URL_A,
        },
        { userId: USER_A, ipAddress: "10.0.0.1", userAgent: "vitest" },
      )

      // --- DB state ---
      expect(result.status).toBe("SIGNED")
      expect(result.signedAt).toBeTruthy()
      expect(result.signedById).toBe(USER_A)
      expect(result.signerName).toBe("Max Müller")
      expect(result.signerRole).toBe("Werkmeister")
      expect(result.signerIpHash).toBeTruthy()
      expect(result.signerIpHash).not.toBe("10.0.0.1") // hashed, not plain
      expect(result.signaturePath).toMatch(
        new RegExp(`^${TENANT_A}/${draft.id}-[0-9a-f-]+\\.png$`),
      )
      expect(result.pdfUrl).toBe(`arbeitsscheine/${TENANT_A}/${draft.id}.pdf`)

      // --- Signature bucket has the PNG at the committed path ---
      const sigDownload = await admin.storage
        .from(SIGNATURE_BUCKET)
        .download(result.signaturePath!)
      expect(sigDownload.error).toBeNull()
      const sigBuf = Buffer.from(await sigDownload.data!.arrayBuffer())
      expect(sha256(sigBuf)).toBe(sha256(Buffer.from(PNG_A_BASE64, "base64")))

      // --- Documents bucket has the PDF at the canonical path ---
      const pdfDownload = await admin.storage
        .from(DOCUMENTS_BUCKET)
        .download(`arbeitsscheine/${TENANT_A}/${draft.id}.pdf`)
      expect(pdfDownload.error).toBeNull()
      const pdfBuf = Buffer.from(await pdfDownload.data!.arrayBuffer())
      expect(pdfBuf.length).toBeGreaterThan(1000)
      expect(pdfBuf.slice(0, 5).toString("ascii")).toBe("%PDF-")

      // --- Audit row for sign ---
      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: TENANT_A,
          entityType: "work_report",
          entityId: draft.id,
          action: "sign",
        },
      })
      expect(logs.length).toBe(1)
      const log = logs[0]!
      const metadata = log.metadata as Record<string, unknown>
      expect(metadata.signerName).toBe("Max Müller")
      expect(metadata.signerRole).toBe("Werkmeister")
      expect(metadata.assignmentCount).toBe(1)
      expect(metadata.signerIpHash).toBe(result.signerIpHash)
    })

    // -------------------------------------------------------------------------
    // 2. Validation — missing description
    // -------------------------------------------------------------------------
    it("rejects sign when workDescription is empty — no upload, status unchanged", async () => {
      const draft = await createSignableDraft({ withDescription: false })

      await expect(
        workReportService.sign(
          prisma,
          TENANT_A,
          {
            id: draft.id,
            signerName: "Max Müller",
            signerRole: "Werkmeister",
            signatureDataUrl: DATA_URL_A,
          },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })

      const still = await prisma.workReport.findUnique({
        where: { id: draft.id },
      })
      expect(still?.status).toBe("DRAFT")
      expect(still?.signaturePath).toBeNull()

      // No orphan blob in the signature bucket.
      const sigFiles = await listSignatureFiles(draft.id)
      expect(sigFiles).toEqual([])
    })

    // -------------------------------------------------------------------------
    // 3. Validation — no assignments
    // -------------------------------------------------------------------------
    it("rejects sign with 0 assignments — no upload, status unchanged", async () => {
      const draft = await createSignableDraft({ withAssignment: false })

      await expect(
        workReportService.sign(
          prisma,
          TENANT_A,
          {
            id: draft.id,
            signerName: "Max Müller",
            signerRole: "Werkmeister",
            signatureDataUrl: DATA_URL_A,
          },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportValidationError" })

      const still = await prisma.workReport.findUnique({
        where: { id: draft.id },
      })
      expect(still?.status).toBe("DRAFT")

      const sigFiles = await listSignatureFiles(draft.id)
      expect(sigFiles).toEqual([])
    })

    // -------------------------------------------------------------------------
    // 4. Second sign on an already-SIGNED record
    // -------------------------------------------------------------------------
    it("rejects a re-sign of a SIGNED record with WorkReportAlreadySignedError", async () => {
      const draft = await createSignableDraft()
      await workReportService.sign(
        prisma,
        TENANT_A,
        {
          id: draft.id,
          signerName: "Max Müller",
          signerRole: "Werkmeister",
          signatureDataUrl: DATA_URL_A,
        },
        { userId: USER_A },
      )

      await expect(
        workReportService.sign(
          prisma,
          TENANT_A,
          {
            id: draft.id,
            signerName: "Other Name",
            signerRole: "Other Role",
            signatureDataUrl: DATA_URL_B,
          },
          { userId: USER_A },
        ),
      ).rejects.toMatchObject({ name: "WorkReportConflictError" })
    })

    // -------------------------------------------------------------------------
    // 5. Race condition — parallel signs resolve deterministically with cleanup
    // -------------------------------------------------------------------------
    it("parallel sign() calls: exactly one wins, loser's orphan signature is cleaned up", async () => {
      const draft = await createSignableDraft()

      // Fire two concurrent signs with distinct signer names + distinct
      // PNG payloads so we can disambiguate the winner by both DB and
      // bucket content.
      const results = await Promise.allSettled([
        workReportService.sign(
          prisma,
          TENANT_A,
          {
            id: draft.id,
            signerName: "Signer-A",
            signerRole: "Role-A",
            signatureDataUrl: DATA_URL_A,
          },
          { userId: USER_A },
        ),
        workReportService.sign(
          prisma,
          TENANT_A,
          {
            id: draft.id,
            signerName: "Signer-B",
            signerRole: "Role-B",
            signatureDataUrl: DATA_URL_B,
          },
          { userId: USER_A },
        ),
      ])

      const successes = results.filter((r) => r.status === "fulfilled")
      const rejections = results.filter(
        (r) => r.status === "rejected",
      ) as PromiseRejectedResult[]

      // Exactly one sign succeeds.
      expect(successes.length).toBe(1)
      expect(rejections.length).toBe(1)

      // Loser throws either AlreadySignedError or ConflictError — both map
      // to `WorkReportConflictError` via the `this.name` aliasing.
      expect(rejections[0]!.reason.name).toBe("WorkReportConflictError")

      // DB reflects exactly the winner's metadata.
      const finalRow = await prisma.workReport.findUnique({
        where: { id: draft.id },
      })
      expect(finalRow?.status).toBe("SIGNED")
      const winnerName = (
        successes[0] as PromiseFulfilledResult<{ signerName: string | null }>
      ).value.signerName
      expect(finalRow?.signerName).toBe(winnerName)

      // Storage: exactly one signature blob should exist for this
      // workReportId (the winner's). The loser's orphan must be cleaned
      // up by the catch-path.
      const sigFiles = await listSignatureFiles(draft.id)
      expect(sigFiles.length).toBe(1)
      // The surviving file matches `signaturePath` in the DB.
      expect(`${TENANT_A}/${sigFiles[0]!}`).toBe(finalRow?.signaturePath)

      // The surviving PNG's bytes match the winner's decoded payload.
      const admin = createAdminClient()
      const { data: winnerBlob } = await admin.storage
        .from(SIGNATURE_BUCKET)
        .download(`${TENANT_A}/${sigFiles[0]!}`)
      const winnerBuf = Buffer.from(await winnerBlob!.arrayBuffer())
      const expectedBase64 = winnerName === "Signer-A" ? PNG_A_BASE64 : PNG_B_BASE64
      expect(sha256(winnerBuf)).toBe(
        sha256(Buffer.from(expectedBase64, "base64")),
      )
    })

    // -------------------------------------------------------------------------
    // 6. IP hash is deterministic + non-reversible
    // -------------------------------------------------------------------------
    it("the signerIpHash is deterministic across signs but unlike the input IP", async () => {
      const d1 = await createSignableDraft()
      const d2 = await createSignableDraft()

      const r1 = await workReportService.sign(
        prisma,
        TENANT_A,
        {
          id: d1.id,
          signerName: "Max Müller",
          signerRole: "Werkmeister",
          signatureDataUrl: DATA_URL_A,
        },
        { userId: USER_A, ipAddress: "203.0.113.7" },
      )

      const r2 = await workReportService.sign(
        prisma,
        TENANT_A,
        {
          id: d2.id,
          signerName: "Max Müller",
          signerRole: "Werkmeister",
          signatureDataUrl: DATA_URL_B,
        },
        { userId: USER_A, ipAddress: "203.0.113.7" },
      )

      expect(r1.signerIpHash).toBeTruthy()
      expect(r2.signerIpHash).toBeTruthy()
      expect(r1.signerIpHash).toBe(r2.signerIpHash) // deterministic HMAC
      expect(r1.signerIpHash).not.toContain("203.0.113.7")
    })
  },
)
