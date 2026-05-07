/**
 * Migration script test (NK-1, Decision 2)
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
import { migrateEmployeeSalaryGroupToWageGroup } from "../migrate-employee-salary-group-to-wage-group"

const TENANT_ID = "f0000000-0000-4000-a000-0000000a1301"
const TENANT_SLUG = "wage-group-mig-test"

const EMP_BASE = "f0000000-0000-4000-a000-0000000a13"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Wage Group Migration Test",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
})

afterAll(async () => {
  await prisma.employee.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.wageGroup.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.employee.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.wageGroup.deleteMany({ where: { tenantId: TENANT_ID } })
})

describe("migrate-employee-salary-group-to-wage-group", () => {
  it("creates one WageGroup per distinct salaryGroup and assigns employees", async () => {
    // Setup: 5 employees, 3 distinct salary groups, 1 with NULL
    await prisma.employee.createMany({
      data: [
        {
          id: `${EMP_BASE}01`,
          tenantId: TENANT_ID,
          personnelNumber: "M-001",
          pin: "pin-m-1",
          firstName: "A",
          lastName: "B",
          entryDate: new Date("2024-01-01"),
          salaryGroup: "Meister",
        },
        {
          id: `${EMP_BASE}02`,
          tenantId: TENANT_ID,
          personnelNumber: "M-002",
          pin: "pin-m-2",
          firstName: "C",
          lastName: "D",
          entryDate: new Date("2024-01-01"),
          salaryGroup: "Geselle",
        },
        {
          id: `${EMP_BASE}03`,
          tenantId: TENANT_ID,
          personnelNumber: "M-003",
          pin: "pin-m-3",
          firstName: "E",
          lastName: "F",
          entryDate: new Date("2024-01-01"),
          salaryGroup: "Geselle",
        },
        {
          id: `${EMP_BASE}04`,
          tenantId: TENANT_ID,
          personnelNumber: "M-004",
          pin: "pin-m-4",
          firstName: "G",
          lastName: "H",
          entryDate: new Date("2024-01-01"),
          salaryGroup: "Hilfskraft",
        },
        {
          id: `${EMP_BASE}05`,
          tenantId: TENANT_ID,
          personnelNumber: "M-005",
          pin: "pin-m-5",
          firstName: "I",
          lastName: "J",
          entryDate: new Date("2024-01-01"),
          salaryGroup: null,
        },
      ],
    })

    const stats = await migrateEmployeeSalaryGroupToWageGroup(prisma)
    const tStat = stats.find((s) => s.tenantId === TENANT_ID)
    expect(tStat).toBeDefined()
    expect(tStat!.wageGroupsCreated).toBe(3)
    expect(tStat!.employeesAssigned).toBe(4)

    const wageGroups = await prisma.wageGroup.findMany({
      where: { tenantId: TENANT_ID },
    })
    expect(wageGroups).toHaveLength(3)

    // Employees with salaryGroup got mapped
    const assigned = await prisma.employee.count({
      where: { tenantId: TENANT_ID, wageGroupId: { not: null } },
    })
    expect(assigned).toBe(4)
    // Null one stays null
    const stillNull = await prisma.employee.count({
      where: { tenantId: TENANT_ID, wageGroupId: null },
    })
    expect(stillNull).toBe(1)
  })

  it("idempotent: second run does not change anything", async () => {
    await prisma.employee.create({
      data: {
        id: `${EMP_BASE}06`,
        tenantId: TENANT_ID,
        personnelNumber: "M-006",
        pin: "pin-m-6",
        firstName: "K",
        lastName: "L",
        entryDate: new Date("2024-01-01"),
        salaryGroup: "TestGroup",
      },
    })
    await migrateEmployeeSalaryGroupToWageGroup(prisma)
    const wgsAfterFirst = await prisma.wageGroup.findMany({
      where: { tenantId: TENANT_ID },
    })
    expect(wgsAfterFirst).toHaveLength(1)

    // Second run: no new wage groups, no extra assignments
    const stats2 = await migrateEmployeeSalaryGroupToWageGroup(prisma)
    const tStat = stats2.find((s) => s.tenantId === TENANT_ID)
    // Tenant is no longer in the result-set (no employees needed migration).
    expect(tStat).toBeUndefined()

    const wgsAfterSecond = await prisma.wageGroup.findMany({
      where: { tenantId: TENANT_ID },
    })
    expect(wgsAfterSecond).toHaveLength(1)
  })

  it("preserves Employee.salaryGroup column (used by DATEV templates)", async () => {
    await prisma.employee.create({
      data: {
        id: `${EMP_BASE}07`,
        tenantId: TENANT_ID,
        personnelNumber: "M-007",
        pin: "pin-m-7",
        firstName: "M",
        lastName: "N",
        entryDate: new Date("2024-01-01"),
        salaryGroup: "PreserveTest",
      },
    })
    await migrateEmployeeSalaryGroupToWageGroup(prisma)

    const fresh = await prisma.employee.findUnique({
      where: { id: `${EMP_BASE}07` },
    })
    // wageGroupId set, AND salaryGroup still present (read by DATEV templates)
    expect(fresh!.wageGroupId).not.toBeNull()
    expect(fresh!.salaryGroup).toBe("PreserveTest")
  })

  it("does not touch employees in other tenants", async () => {
    const OTHER_TENANT_ID = "f0000000-0000-4000-a000-0000000a13ff"
    await prisma.tenant.upsert({
      where: { id: OTHER_TENANT_ID },
      update: {},
      create: {
        id: OTHER_TENANT_ID,
        name: "Other Migration Tenant",
        slug: "wage-mig-other",
        isActive: true,
      },
    })
    try {
      // Two tenants, each with one employee in a salary group of the same name —
      // the migration must create two separate WageGroups (one per tenant).
      await prisma.employee.create({
        data: {
          id: `${EMP_BASE}08`,
          tenantId: TENANT_ID,
          personnelNumber: "MIG-T1",
          pin: "pin-mig-t1",
          firstName: "T1",
          lastName: "X",
          entryDate: new Date("2024-01-01"),
          salaryGroup: "SharedName",
        },
      })
      await prisma.employee.create({
        data: {
          id: `${EMP_BASE}09`,
          tenantId: OTHER_TENANT_ID,
          personnelNumber: "MIG-T2",
          pin: "pin-mig-t2",
          firstName: "T2",
          lastName: "Y",
          entryDate: new Date("2024-01-01"),
          salaryGroup: "SharedName",
        },
      })

      const stats = await migrateEmployeeSalaryGroupToWageGroup(prisma)
      expect(stats.find((s) => s.tenantId === TENANT_ID)).toBeDefined()
      expect(stats.find((s) => s.tenantId === OTHER_TENANT_ID)).toBeDefined()

      const wgT1 = await prisma.wageGroup.findFirst({
        where: { tenantId: TENANT_ID, code: "SharedName" },
      })
      const wgT2 = await prisma.wageGroup.findFirst({
        where: { tenantId: OTHER_TENANT_ID, code: "SharedName" },
      })
      expect(wgT1).not.toBeNull()
      expect(wgT2).not.toBeNull()
      expect(wgT1!.id).not.toBe(wgT2!.id) // different rows per tenant

      const empT1 = await prisma.employee.findUnique({
        where: { id: `${EMP_BASE}08` },
      })
      const empT2 = await prisma.employee.findUnique({
        where: { id: `${EMP_BASE}09` },
      })
      // T1's employee points at T1's wage group, T2's at T2's
      expect(empT1!.wageGroupId).toBe(wgT1!.id)
      expect(empT2!.wageGroupId).toBe(wgT2!.id)
    } finally {
      await prisma.employee.deleteMany({ where: { tenantId: OTHER_TENANT_ID } })
      await prisma.wageGroup.deleteMany({
        where: { tenantId: OTHER_TENANT_ID },
      })
      await prisma.tenant.delete({ where: { id: OTHER_TENANT_ID } })
    }
  })

  it("skips empty / whitespace-only salaryGroup values", async () => {
    await prisma.employee.create({
      data: {
        id: `${EMP_BASE}0a`,
        tenantId: TENANT_ID,
        personnelNumber: "MIG-WS",
        pin: "pin-ws",
        firstName: "WS",
        lastName: "Z",
        entryDate: new Date("2024-01-01"),
        salaryGroup: "   ", // whitespace only
      },
    })

    await migrateEmployeeSalaryGroupToWageGroup(prisma)
    // No wage group should have been created for whitespace-only values.
    // The script reads distinct values via $queryRaw, so an all-whitespace
    // string survives the SELECT but is skipped inside the loop.
    const wgs = await prisma.wageGroup.findMany({
      where: { tenantId: TENANT_ID },
    })
    expect(wgs).toHaveLength(0)

    const fresh = await prisma.employee.findUnique({
      where: { id: `${EMP_BASE}0a` },
    })
    expect(fresh!.wageGroupId).toBeNull()
  })
})
