/**
 * Integration tests for employee-salary-history-service.
 * Verifies:
 *  - create() closes the previous open entry by setting validTo
 *  - Employee.grossSalary / hourlyRate / paymentType stay in sync
 *  - delete() removes the entry
 *  - validation: validFrom cannot be before the currently open entry
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../employee-salary-history-service"

const TENANT_ID = "f0000000-0000-4000-a000-000000000702"
const TENANT_SLUG = "salary-history-integration"
const EMPLOYEE_ID = "f0000000-0000-4000-a000-000000000703"
const USER_ID = "a0000000-0000-4000-a000-000000000702"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "Salary History Integration",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })
  await prisma.employee.deleteMany({ where: { id: EMPLOYEE_ID } })
  await prisma.employee.create({
    data: {
      id: EMPLOYEE_ID,
      tenantId: TENANT_ID,
      personnelNumber: "SH-001",
      pin: "pin-sh-001",
      firstName: "Salary",
      lastName: "History",
      entryDate: new Date("2024-01-01"),
    },
  })
})

afterAll(async () => {
  await prisma.employeeSalaryHistory.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.employee.deleteMany({ where: { id: EMPLOYEE_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.employeeSalaryHistory.deleteMany({
    where: { tenantId: TENANT_ID },
  })
  await prisma.employee.update({
    where: { id: EMPLOYEE_ID },
    data: { grossSalary: null, hourlyRate: null, paymentType: null },
  })
})

describe("employee-salary-history-service", () => {
  it("creates the initial entry and syncs Employee.grossSalary", async () => {
    const entry = await service.create(
      prisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        validFrom: new Date("2024-01-01"),
        paymentType: "monthly",
        grossSalary: 3000,
        changeReason: "initial",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    expect(entry.id).toBeDefined()
    expect(entry.validTo).toBeNull()

    const emp = await prisma.employee.findUnique({
      where: { id: EMPLOYEE_ID },
      select: { grossSalary: true, paymentType: true },
    })
    expect(Number(emp!.grossSalary)).toBe(3000)
    expect(emp!.paymentType).toBe("monthly")
  })

  it("closes the previous open entry on create", async () => {
    await service.create(
      prisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        validFrom: new Date("2024-01-01"),
        paymentType: "monthly",
        grossSalary: 3000,
        changeReason: "initial",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    const newer = await service.create(
      prisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        validFrom: new Date("2024-07-01"),
        paymentType: "monthly",
        grossSalary: 3300,
        changeReason: "raise",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )

    const all = await service.list(prisma, TENANT_ID, EMPLOYEE_ID)
    expect(all).toHaveLength(2)

    const open = all.find((e) => e.validTo === null)
    expect(open?.id).toBe(newer.id)

    const closed = all.find((e) => e.validTo !== null)
    expect(closed).toBeDefined()
    // The old entry's validTo should be 2024-06-30 (new.validFrom - 1 day).
    expect(closed!.validTo!.toISOString().slice(0, 10)).toBe("2024-06-30")
  })

  it("rejects validFrom older than the currently open entry", async () => {
    await service.create(
      prisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        validFrom: new Date("2024-06-01"),
        paymentType: "monthly",
        grossSalary: 3000,
        changeReason: "initial",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    await expect(
      service.create(
        prisma,
        TENANT_ID,
        {
          employeeId: EMPLOYEE_ID,
          validFrom: new Date("2024-01-01"),
          paymentType: "monthly",
          grossSalary: 3300,
          changeReason: "raise",
        },
        { userId: USER_ID, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow()
  })

  it("requires grossSalary for monthly paymentType", async () => {
    await expect(
      service.create(prisma, TENANT_ID, {
        employeeId: EMPLOYEE_ID,
        validFrom: new Date("2024-01-01"),
        paymentType: "monthly",
        grossSalary: null,
        changeReason: "initial",
      }),
    ).rejects.toThrow(/grossSalary/)
  })

  it("delete() removes an entry", async () => {
    const created = await service.create(
      prisma,
      TENANT_ID,
      {
        employeeId: EMPLOYEE_ID,
        validFrom: new Date("2024-01-01"),
        paymentType: "hourly",
        hourlyRate: 25,
        changeReason: "initial",
      },
      { userId: USER_ID, ipAddress: null, userAgent: null },
    )
    await service.remove(prisma, TENANT_ID, created.id, {
      userId: USER_ID,
      ipAddress: null,
      userAgent: null,
    })
    const all = await service.list(prisma, TENANT_ID, EMPLOYEE_ID)
    expect(all).toHaveLength(0)
  })
})
