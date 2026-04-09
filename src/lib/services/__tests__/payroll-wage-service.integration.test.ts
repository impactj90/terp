/**
 * Integration tests for payroll-wage-service against the real DB.
 * Verifies the lazy initialize-on-read, update flow, and reset flow.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../payroll-wage-service"

const TENANT_ID = "f0000000-0000-4000-a000-000000000602"
const TENANT_SLUG = "payroll-wage-integration"
const USER_ID = "a0000000-0000-4000-a000-000000000602"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Payroll Wage Integration Test",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
  await prisma.tenantPayrollWage.deleteMany({ where: { tenantId: TENANT_ID } })
})

afterAll(async () => {
  await prisma.tenantPayrollWage.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

describe("payroll-wage-service", () => {
  it("returns the seeded defaults globally", async () => {
    const defaults = await service.listDefaults(prisma)
    // 20 default Lohnarten seeded in migration 20260417100000.
    expect(defaults.length).toBeGreaterThanOrEqual(20)
    const codes = defaults.map((d) => d.code)
    expect(codes).toContain("1000")
    expect(codes).toContain("2900")
  })

  it("lazily initializes the catalog on first list call", async () => {
    const wages = await service.listForTenant(prisma, TENANT_ID)
    expect(wages.length).toBeGreaterThanOrEqual(20)
  })

  it("is idempotent — repeated init does not duplicate", async () => {
    await service.initializeForTenant(prisma, TENANT_ID, {
      userId: USER_ID,
      ipAddress: null,
      userAgent: null,
    })
    const second = await prisma.tenantPayrollWage.count({
      where: { tenantId: TENANT_ID },
    })
    expect(second).toBeGreaterThanOrEqual(20)
  })

  it("updates a wage and persists the change", async () => {
    const before = await prisma.tenantPayrollWage.findFirst({
      where: { tenantId: TENANT_ID, code: "1000" },
    })
    expect(before).not.toBeNull()
    const updated = await service.update(prisma, TENANT_ID, before!.id, {
      name: "Geänderte Sollstunden",
      isActive: false,
    })
    expect(updated.name).toBe("Geänderte Sollstunden")
    expect(updated.isActive).toBe(false)
  })

  it("rejects invalid code on update", async () => {
    const wage = await prisma.tenantPayrollWage.findFirst({
      where: { tenantId: TENANT_ID, code: "1001" },
    })
    await expect(
      service.update(prisma, TENANT_ID, wage!.id, { code: "with space!" }),
    ).rejects.toThrow(/alphanumeric/)
  })

  it("reset deletes and re-seeds the catalog", async () => {
    const result = await service.reset(prisma, TENANT_ID, {
      userId: USER_ID,
      ipAddress: null,
      userAgent: null,
    })
    expect(result.deleted).toBeGreaterThan(0)
    expect(result.inserted).toBeGreaterThan(0)
    // Resetting should restore the original "Sollstunden" name (not the
    // mutation we made above).
    const restored = await prisma.tenantPayrollWage.findFirst({
      where: { tenantId: TENANT_ID, code: "1000" },
    })
    expect(restored?.name).toBe("Sollstunden")
    expect(restored?.isActive).toBe(true)
  })
})
