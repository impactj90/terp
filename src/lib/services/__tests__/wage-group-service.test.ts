/**
 * Wage Group Service tests (NK-1, Decision 2)
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../wage-group-service"
import {
  WageGroupValidationError,
  WageGroupConflictError,
} from "../wage-group-service"

const TENANT_ID = "f0000000-0000-4000-a000-0000000a1001"
const TENANT_SLUG = "wage-group-test"
const EMPLOYEE_ID = "f0000000-0000-4000-a000-0000000a1002"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Wage Group Test",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
  await prisma.employee.deleteMany({ where: { id: EMPLOYEE_ID } })
})

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { id: EMPLOYEE_ID } })
  await prisma.wageGroup.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.employee.deleteMany({ where: { id: EMPLOYEE_ID } })
  await prisma.wageGroup.deleteMany({ where: { tenantId: TENANT_ID } })
})

describe("wage-group-service", () => {
  it("create + list", async () => {
    const wg = await service.create(prisma, TENANT_ID, {
      code: "MEISTER",
      name: "Meister",
      internalHourlyRate: 35,
      billingHourlyRate: 95,
    })
    expect(wg.code).toBe("MEISTER")
    expect(Number(wg.internalHourlyRate)).toBe(35)
    expect(Number(wg.billingHourlyRate)).toBe(95)

    const list = await service.list(prisma, TENANT_ID)
    expect(list).toHaveLength(1)
  })

  it("trims code and name", async () => {
    const wg = await service.create(prisma, TENANT_ID, {
      code: "  GES  ",
      name: "  Geselle  ",
    })
    expect(wg.code).toBe("GES")
    expect(wg.name).toBe("Geselle")
  })

  it("rejects empty code", async () => {
    await expect(
      service.create(prisma, TENANT_ID, { code: "  ", name: "Foo" }),
    ).rejects.toThrow(WageGroupValidationError)
  })

  it("rejects empty name", async () => {
    await expect(
      service.create(prisma, TENANT_ID, { code: "FOO", name: "  " }),
    ).rejects.toThrow(WageGroupValidationError)
  })

  it("rejects negative rate", async () => {
    await expect(
      service.create(prisma, TENANT_ID, {
        code: "FOO",
        name: "Foo",
        billingHourlyRate: -1,
      }),
    ).rejects.toThrow(WageGroupValidationError)
  })

  it("conflicts on duplicate code", async () => {
    await service.create(prisma, TENANT_ID, { code: "X", name: "X1" })
    await expect(
      service.create(prisma, TENANT_ID, { code: "X", name: "X2" }),
    ).rejects.toThrow(WageGroupConflictError)
  })

  it("update partial", async () => {
    const wg = await service.create(prisma, TENANT_ID, {
      code: "X",
      name: "Old",
      billingHourlyRate: 50,
    })
    const u = await service.update(prisma, TENANT_ID, {
      id: wg.id,
      name: "New",
      isActive: false,
    })
    expect(u.name).toBe("New")
    expect(u.isActive).toBe(false)
    // billingHourlyRate untouched
    expect(Number(u.billingHourlyRate)).toBe(50)
  })

  it("remove blocks if employee uses it", async () => {
    const wg = await service.create(prisma, TENANT_ID, {
      code: "INUSE",
      name: "In Use",
    })
    await prisma.employee.create({
      data: {
        id: EMPLOYEE_ID,
        tenantId: TENANT_ID,
        personnelNumber: "WG-EMP-1",
        pin: "wg-pin-1",
        firstName: "F",
        lastName: "L",
        entryDate: new Date("2024-01-01"),
        wageGroupId: wg.id,
      },
    })
    await expect(
      service.remove(prisma, TENANT_ID, wg.id),
    ).rejects.toThrow(WageGroupConflictError)
  })

  it("remove succeeds when no employees reference it", async () => {
    const wg = await service.create(prisma, TENANT_ID, {
      code: "FREE",
      name: "Free",
    })
    await service.remove(prisma, TENANT_ID, wg.id)
    const all = await service.list(prisma, TENANT_ID)
    expect(all).toHaveLength(0)
  })
})
