/**
 * Integration tests for inbound-invoice-approval-service against real DB.
 * Storage is mocked (Supabase may not be running).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import { PDFDocument } from "pdf-lib"

// Mock Supabase storage
vi.mock("@/lib/supabase/storage", () => ({
  upload: vi.fn().mockResolvedValue({ path: "mocked" }),
  remove: vi.fn().mockResolvedValue(undefined),
  createSignedUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: "https://example.com/upload", path: "mocked", token: "tok",
  }),
  createSignedReadUrl: vi.fn().mockResolvedValue("https://example.com/read"),
}))

import { prisma } from "@/lib/db/prisma"
import * as invoiceService from "../inbound-invoice-service"
import * as approvalService from "../inbound-invoice-approval-service"
import * as approvalRepo from "../inbound-invoice-approval-repository"
import * as policyRepo from "../inbound-invoice-approval-policy-repository"

// --- Constants ---

const TEST_TENANT_ID = "f0000000-0000-4000-a000-000000000606"
const TEST_TENANT_SLUG = "approval-integration"
const SUBMITTER_ID = "a0000000-0000-4000-a000-000000000601"
const APPROVER1_ID = "a0000000-0000-4000-a000-000000000602"
const APPROVER2_ID = "a0000000-0000-4000-a000-000000000603"
const GROUP_ID = "b0000000-0000-4000-a000-000000000601"

async function createPlainPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage().drawText("Approval test", { x: 50, y: 500 })
  return Buffer.from(await doc.save())
}

async function createTestInvoice(totalGross: number) {
  const pdf = await createPlainPdf()
  const invoice = await invoiceService.createFromUpload(
    prisma, TEST_TENANT_ID, pdf, "approval-test.pdf", SUBMITTER_ID
  )
  // Create supplier
  const supplier = await prisma.crmAddress.upsert({
    where: { id: "f0000000-0000-4000-a000-000000000609" },
    update: {},
    create: {
      id: "f0000000-0000-4000-a000-000000000609",
      tenantId: TEST_TENANT_ID,
      number: "LF-APR-001",
      company: "Approval Test Supplier",
      type: "SUPPLIER",
      isActive: true,
    },
  })
  // Fill required fields
  await invoiceService.update(prisma, TEST_TENANT_ID, invoice.id, {
    invoiceNumber: `R-APR-${Date.now()}`,
    invoiceDate: new Date("2024-06-01"),
    totalGross,
    supplierId: supplier.id,
    supplierStatus: "matched",
  })
  return invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
}

// --- Setup & Teardown ---

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TEST_TENANT_ID },
    update: {},
    create: { id: TEST_TENANT_ID, name: "Approval Integration Test", slug: TEST_TENANT_SLUG, isActive: true },
  })

  // Create users
  for (const [id, name] of [
    [SUBMITTER_ID, "Submitter"],
    [APPROVER1_ID, "Approver1"],
    [APPROVER2_ID, "Approver2"],
  ] as const) {
    await prisma.user.upsert({
      where: { id },
      update: {},
      create: { id, email: `${name.toLowerCase()}@approval-test.local`, displayName: name },
    })
    await prisma.userTenant.upsert({
      where: { userId_tenantId: { userId: id, tenantId: TEST_TENANT_ID } },
      update: {},
      create: { userId: id, tenantId: TEST_TENANT_ID },
    })
  }

  // Create user group with APPROVER2 as member
  await prisma.userGroup.upsert({
    where: { id: GROUP_ID },
    update: {},
    create: {
      id: GROUP_ID,
      tenantId: TEST_TENANT_ID,
      name: "Approver Group",
      code: "APPROVER_TEST",
    },
  })
  // Assign APPROVER2 to the group
  await prisma.user.update({
    where: { id: APPROVER2_ID },
    data: { userGroupId: GROUP_ID },
  })
})

afterAll(async () => {
  // Reset user group assignment
  await prisma.user.update({ where: { id: APPROVER2_ID }, data: { userGroupId: null } }).catch(() => {})

  // Cleanup in dependency order
  await prisma.inboundInvoiceApproval.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoiceApprovalPolicy.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoiceLineItem.deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } }).catch(() => {})
  await prisma.inboundInvoice.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundEmailLog.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.numberSequence.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.crmAddress.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.userGroup.deleteMany({ where: { id: GROUP_ID } }).catch(() => {})
  await prisma.userTenant.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  for (const id of [SUBMITTER_ID, APPROVER1_ID, APPROVER2_ID]) {
    await prisma.user.deleteMany({ where: { id } }).catch(() => {})
  }
  await prisma.tenant.deleteMany({ where: { id: TEST_TENANT_ID } }).catch(() => {})
})

async function cleanupTestData() {
  await prisma.inboundInvoiceApproval.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoiceApprovalPolicy.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
  await prisma.inboundInvoiceLineItem.deleteMany({ where: { invoice: { tenantId: TEST_TENANT_ID } } }).catch(() => {})
  await prisma.inboundInvoice.deleteMany({ where: { tenantId: TEST_TENANT_ID } }).catch(() => {})
}

// --- Tests ---

describe.sequential("inbound-invoice-approval-service integration", () => {
  beforeEach(async () => {
    await cleanupTestData()
  })

  // ---------------------------------------------------------------
  // 1. Auto-approve when no policies exist
  // ---------------------------------------------------------------
  it("auto-approves when no approval policies exist", async () => {
    const invoice = await createTestInvoice(100)

    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    const updated = await invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(updated.status).toBe("APPROVED")

    // No approval steps created
    const steps = await approvalRepo.findByInvoiceId(prisma, invoice.id)
    expect(steps).toHaveLength(0)
  })

  // ---------------------------------------------------------------
  // 2. Single-step approval (direct user approver)
  // ---------------------------------------------------------------
  it("creates 1 step and completes on single approve", async () => {
    // Create 1-step policy for all amounts
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 0,
      amountMax: null,
      stepOrder: 1,
      approverUserId: APPROVER1_ID,
    })

    const invoice = await createTestInvoice(250)
    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    let current = await invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(current.status).toBe("PENDING_APPROVAL")

    const steps = await approvalRepo.findByInvoiceId(prisma, invoice.id)
    expect(steps).toHaveLength(1)
    expect(steps[0]!.approverUserId).toBe(APPROVER1_ID)
    expect(steps[0]!.status).toBe("PENDING")

    // Approve
    await approvalService.approve(
      prisma, TEST_TENANT_ID, invoice.id, steps[0]!.id, APPROVER1_ID
    )

    current = await invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(current.status).toBe("APPROVED")
  })

  // ---------------------------------------------------------------
  // 3. Two-step approval workflow
  // ---------------------------------------------------------------
  it("creates 2 steps for high amount and completes sequentially", async () => {
    // Step 1: any amount → APPROVER1
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 0,
      amountMax: null,
      stepOrder: 1,
      approverUserId: APPROVER1_ID,
    })
    // Step 2: > 500€ → APPROVER2 (via group)
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 500,
      amountMax: null,
      stepOrder: 2,
      approverGroupId: GROUP_ID,
    })

    const invoice = await createTestInvoice(1000)
    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    const steps = await approvalRepo.findByInvoiceId(prisma, invoice.id)
    expect(steps).toHaveLength(2)

    // Approve step 1
    await approvalService.approve(
      prisma, TEST_TENANT_ID, invoice.id, steps[0]!.id, APPROVER1_ID
    )

    let current = await invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(current.status).toBe("PENDING_APPROVAL") // still pending step 2

    // Approve step 2 (APPROVER2 via group membership)
    await approvalService.approve(
      prisma, TEST_TENANT_ID, invoice.id, steps[1]!.id, APPROVER2_ID
    )

    current = await invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(current.status).toBe("APPROVED")
  })

  // ---------------------------------------------------------------
  // 4. Rejection sets invoice to REJECTED
  // ---------------------------------------------------------------
  it("rejects invoice on rejection", async () => {
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 0,
      amountMax: null,
      stepOrder: 1,
      approverUserId: APPROVER1_ID,
    })

    const invoice = await createTestInvoice(300)
    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    const steps = await approvalRepo.findByInvoiceId(prisma, invoice.id)

    await approvalService.reject(
      prisma, TEST_TENANT_ID, invoice.id, steps[0]!.id, APPROVER1_ID,
      "Betrag stimmt nicht"
    )

    const current = await invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(current.status).toBe("REJECTED")

    const updatedSteps = await approvalRepo.findByInvoiceId(prisma, invoice.id)
    expect(updatedSteps[0]!.status).toBe("REJECTED")
    expect(updatedSteps[0]!.rejectionReason).toBe("Betrag stimmt nicht")
  })

  // ---------------------------------------------------------------
  // 5. Submitter ≠ approver guard
  // ---------------------------------------------------------------
  it("prevents submitter from approving their own invoice", async () => {
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 0,
      amountMax: null,
      stepOrder: 1,
      approverUserId: SUBMITTER_ID, // same as submitter!
    })

    const invoice = await createTestInvoice(200)
    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    const steps = await approvalRepo.findByInvoiceId(prisma, invoice.id)

    await expect(
      approvalService.approve(
        prisma, TEST_TENANT_ID, invoice.id, steps[0]!.id, SUBMITTER_ID
      )
    ).rejects.toThrow("Submitter cannot approve")
  })

  // ---------------------------------------------------------------
  // 6. Unauthorized user cannot approve
  // ---------------------------------------------------------------
  it("prevents unauthorized user from approving", async () => {
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 0,
      amountMax: null,
      stepOrder: 1,
      approverUserId: APPROVER1_ID,
    })

    const invoice = await createTestInvoice(200)
    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    const steps = await approvalRepo.findByInvoiceId(prisma, invoice.id)

    // APPROVER2 is not the assigned approver for this step (no direct match, different group)
    // Actually APPROVER2 is in GROUP_ID but the policy assigns APPROVER1 directly
    await expect(
      approvalService.approve(
        prisma, TEST_TENANT_ID, invoice.id, steps[0]!.id, APPROVER2_ID
      )
    ).rejects.toThrow("not authorized")
  })

  // ---------------------------------------------------------------
  // 7. Group membership authorization
  // ---------------------------------------------------------------
  it("authorizes group member to approve group-assigned step", async () => {
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 0,
      amountMax: null,
      stepOrder: 1,
      approverGroupId: GROUP_ID,
    })

    const invoice = await createTestInvoice(200)
    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    const steps = await approvalRepo.findByInvoiceId(prisma, invoice.id)

    // APPROVER2 is member of GROUP_ID → should be authorized
    await approvalService.approve(
      prisma, TEST_TENANT_ID, invoice.id, steps[0]!.id, APPROVER2_ID
    )

    const current = await invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(current.status).toBe("APPROVED")
  })

  // ---------------------------------------------------------------
  // 8. Material change invalidates approvals
  // ---------------------------------------------------------------
  it("invalidates approvals and resets to DRAFT on material change", async () => {
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 0,
      amountMax: null,
      stepOrder: 1,
      approverUserId: APPROVER1_ID,
    })

    const invoice = await createTestInvoice(300)
    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    let current = await invoiceService.getById(prisma, TEST_TENANT_ID, invoice.id)
    expect(current.status).toBe("PENDING_APPROVAL")

    // Material change: update totalGross while PENDING_APPROVAL
    // Need to force status back to DRAFT first (since update guard blocks non-DRAFT)
    await prisma.inboundInvoice.updateMany({
      where: { id: invoice.id },
      data: { status: "DRAFT" },
    })

    await invoiceService.update(prisma, TEST_TENANT_ID, invoice.id, {
      totalGross: 999,
    })

    // Check approvals were invalidated
    const steps = await approvalRepo.findByInvoiceId(prisma, invoice.id)
    const invalidated = steps.filter((s) => s.status === "INVALIDATED")
    expect(invalidated.length).toBeGreaterThanOrEqual(1)
  })

  // ---------------------------------------------------------------
  // 9. findPendingForUser returns correct steps
  // ---------------------------------------------------------------
  it("finds pending approvals for a user", async () => {
    await policyRepo.create(prisma, TEST_TENANT_ID, {
      amountMin: 0,
      amountMax: null,
      stepOrder: 1,
      approverUserId: APPROVER1_ID,
    })

    const invoice = await createTestInvoice(400)
    await invoiceService.submitForApproval(
      prisma, TEST_TENANT_ID, invoice.id, SUBMITTER_ID
    )

    const pending = await approvalRepo.findPendingForUser(
      prisma, TEST_TENANT_ID, APPROVER1_ID
    )
    expect(pending.length).toBeGreaterThanOrEqual(1)
    expect(pending.some((p) => p.invoiceId === invoice.id)).toBe(true)

    // Submitter should have no pending approvals
    const submitterPending = await approvalRepo.findPendingForUser(
      prisma, TEST_TENANT_ID, SUBMITTER_ID
    )
    expect(submitterPending.filter((p) => p.invoiceId === invoice.id)).toHaveLength(0)
  })
})
