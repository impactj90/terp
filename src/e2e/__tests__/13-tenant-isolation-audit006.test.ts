/**
 * AUDIT-006: Tenant Isolation — findUnique/findFirst without tenantId
 *
 * Verifies that the 4 repository methods fixed in AUDIT-006 cannot
 * return records belonging to a different tenant.
 *
 * Strategy:
 *   1. Create a second tenant + test records owned by that tenant
 *   2. Query those records using a caller scoped to the seed (first) tenant
 *   3. Assert that cross-tenant records are never returned
 *
 * For billing positions, we call the repository directly since the tRPC
 * route requires the billing module to be enabled on the tenant.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createAdminCaller, prisma, SEED } from "../helpers"
import * as billingDocRepo from "@/lib/services/billing-document-repository"
import type { PrismaClient } from "@/generated/prisma/client"

type Caller = Awaited<ReturnType<typeof createAdminCaller>>

const OTHER_TENANT_ID = "e2e00600-0000-4000-a000-000000000001"

describe("AUDIT-006: Tenant isolation for find-without-tenantId", () => {
  let caller: Caller

  // IDs of records created in the OTHER tenant
  const other = {
    dayPlanId: "",
    bookingTypeGroupId: "",
    employeeId: "",
    contactId: "",
    billingDocumentId: "",
    positionId: "",
  }

  beforeAll(async () => {
    caller = await createAdminCaller()

    // --- Create other tenant ---
    await prisma.tenant.upsert({
      where: { id: OTHER_TENANT_ID },
      update: {},
      create: {
        id: OTHER_TENANT_ID,
        name: "AUDIT-006 Isolation Tenant",
        slug: "audit-006-isolation",
        isActive: true,
      },
    })

    // --- DayPlan in other tenant ---
    const dayPlan = await prisma.dayPlan.create({
      data: {
        tenantId: OTHER_TENANT_ID,
        code: "A006-DP",
        name: "AUDIT-006 Day Plan",
        planType: "fixed",
        regularHours: 480,
        isActive: true,
      },
    })
    other.dayPlanId = dayPlan.id

    // --- BookingTypeGroup in other tenant ---
    const btg = await prisma.bookingTypeGroup.create({
      data: {
        tenantId: OTHER_TENANT_ID,
        code: "A006-BTG",
        name: "AUDIT-006 Booking Type Group",
        isActive: true,
      },
    })
    other.bookingTypeGroupId = btg.id

    // --- Employee + EmployeeContact in other tenant ---
    const employee = await prisma.employee.create({
      data: {
        tenantId: OTHER_TENANT_ID,
        personnelNumber: "A006",
        pin: "0006",
        firstName: "Audit",
        lastName: "Six",
        entryDate: new Date("2025-01-01"),
      },
    })
    other.employeeId = employee.id

    const contact = await prisma.employeeContact.create({
      data: {
        employeeId: employee.id,
        contactType: "email",
        value: "audit006@test.local",
      },
    })
    other.contactId = contact.id

    // --- BillingDocument + Position in other tenant ---
    // Use raw SQL to avoid complex required relation setup (addressId, etc.)
    const docId = "e2e00600-0000-4000-a000-000000000010"
    const posId = "e2e00600-0000-4000-a000-000000000011"
    // Create a CRM address for the other tenant first
    const addrId = "e2e00600-0000-4000-a000-000000000020"
    await prisma.$executeRaw`
      INSERT INTO crm_addresses (id, tenant_id, number, company, city, country)
      VALUES (${addrId}::uuid, ${OTHER_TENANT_ID}::uuid, 'A006-ADDR', 'AUDIT-006 Test', 'Test', 'DE')
      ON CONFLICT (id) DO NOTHING`
    await prisma.$executeRaw`
      INSERT INTO billing_documents (id, tenant_id, number, type, status, address_id, document_date, subtotal_net, total_vat, total_gross)
      VALUES (${docId}::uuid, ${OTHER_TENANT_ID}::uuid, 'A006-INV-1', 'INVOICE', 'DRAFT', ${addrId}::uuid, NOW(), 0, 0, 0)
      ON CONFLICT (id) DO NOTHING`
    await prisma.$executeRaw`
      INSERT INTO billing_document_positions (id, document_id, sort_order, type, description, quantity, unit, unit_price, total_price, vat_rate)
      VALUES (${posId}::uuid, ${docId}::uuid, 1, 'ARTICLE', 'AUDIT-006 test position', 1, 'Stk', 100, 100, 19)
      ON CONFLICT (id) DO NOTHING`
    other.billingDocumentId = docId
    other.positionId = posId
  })

  afterAll(async () => {
    // Clean up in reverse dependency order
    await prisma.$executeRaw`DELETE FROM billing_document_positions WHERE document_id = ${other.billingDocumentId}::uuid`.catch(() => {})
    await prisma.$executeRaw`DELETE FROM billing_documents WHERE id = ${other.billingDocumentId}::uuid`.catch(() => {})
    await prisma.$executeRaw`DELETE FROM crm_addresses WHERE id = 'e2e00600-0000-4000-a000-000000000020'::uuid`.catch(() => {})
    await prisma.employeeContact
      .deleteMany({ where: { id: other.contactId } })
      .catch(() => {})
    await prisma.employee
      .deleteMany({ where: { id: other.employeeId } })
      .catch(() => {})
    await prisma.bookingTypeGroup
      .deleteMany({ where: { id: other.bookingTypeGroupId } })
      .catch(() => {})
    await prisma.dayPlan
      .deleteMany({ where: { id: other.dayPlanId } })
      .catch(() => {})
    await prisma.userTenant
      .deleteMany({ where: { tenantId: OTHER_TENANT_ID } })
      .catch(() => {})
    await prisma.tenant
      .deleteMany({ where: { id: OTHER_TENANT_ID } })
      .catch(() => {})
  })

  // --- DayPlan: findByIdWithDetail ---

  it("dayPlans.getById returns NOT_FOUND for cross-tenant day plan", async () => {
    await expect(
      caller.dayPlans.getById({ id: other.dayPlanId })
    ).rejects.toThrow("Day plan not found")
  })

  it("dayPlans.getById returns own-tenant day plan successfully", async () => {
    // Seed day plan: STD-8H
    const result = await caller.dayPlans.getById({
      id: "00000000-0000-0000-0000-000000000502",
    })
    expect(result.code).toBe("STD-8H")
  })

  // --- BookingTypeGroup: findByIdWithMembers ---

  it("bookingTypeGroups.getById returns NOT_FOUND for cross-tenant group", async () => {
    await expect(
      caller.bookingTypeGroups.getById({ id: other.bookingTypeGroupId })
    ).rejects.toThrow("Booking type group not found")
  })

  // --- EmployeeContact: findContactWithEmployee ---

  it("employeeContacts.delete returns NOT_FOUND for cross-tenant contact", async () => {
    await expect(
      caller.employeeContacts.delete({ id: other.contactId })
    ).rejects.toThrow("Contact not found")
  })

  // --- BillingDocumentPosition: findPositionById ---
  // Tested at repository level since tRPC route requires billing module

  it("findPositionById returns null for cross-tenant position", async () => {
    const result = await billingDocRepo.findPositionById(
      prisma as unknown as PrismaClient,
      SEED.TENANT_ID,
      other.positionId
    )
    expect(result).toBeNull()
  })

  it("findPositionById returns own-tenant position", async () => {
    // Use seed position: b2000000-0000-4000-a000-000000000001
    const result = await billingDocRepo.findPositionById(
      prisma as unknown as PrismaClient,
      SEED.TENANT_ID,
      "b2000000-0000-4000-a000-000000000001"
    )
    expect(result).not.toBeNull()
    expect(result!.id).toBe("b2000000-0000-4000-a000-000000000001")
  })

  // --- Verify records actually exist (sanity check) ---

  it("cross-tenant records exist in database (sanity check)", async () => {
    const dayPlan = await prisma.dayPlan.findUnique({
      where: { id: other.dayPlanId },
    })
    expect(dayPlan).not.toBeNull()
    expect(dayPlan!.tenantId).toBe(OTHER_TENANT_ID)

    const btg = await prisma.bookingTypeGroup.findUnique({
      where: { id: other.bookingTypeGroupId },
    })
    expect(btg).not.toBeNull()
    expect(btg!.tenantId).toBe(OTHER_TENANT_ID)

    const contact = await prisma.employeeContact.findUnique({
      where: { id: other.contactId },
    })
    expect(contact).not.toBeNull()

    const pos = await prisma.billingDocumentPosition.findUnique({
      where: { id: other.positionId },
    })
    expect(pos).not.toBeNull()
  })
})
