import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../overtime-payout-service"
import * as repo from "../overtime-payout-repository"

const HAS_DB = Boolean(process.env.DATABASE_URL)

// IDs — 08xx range reserved for overtime payout integration tests
const T = "f0000000-0000-4000-a000-000000000801"
const U = "a0000000-0000-4000-a000-000000000801"

const EMP_A = "e0000000-0000-4000-a000-000000000811"
const EMP_B = "e0000000-0000-4000-a000-000000000812"
const EMP_C = "e0000000-0000-4000-a000-000000000813"
const EMP_D = "e0000000-0000-4000-a000-000000000814"
const EMP_E = "e0000000-0000-4000-a000-000000000815"

const TAR = "d0000000-0000-4000-a000-000000000811"

const MV_A = "c0000000-0000-4000-a000-000000000811"
const MV_B = "c0000000-0000-4000-a000-000000000812"
const MV_C = "c0000000-0000-4000-a000-000000000813"
const MV_D = "c0000000-0000-4000-a000-000000000814"
const MV_E = "c0000000-0000-4000-a000-000000000815"

const YR = 2026
const MO = 3

const SNAP = {
  enabled: true,
  mode: "ALL_ABOVE_THRESHOLD",
  thresholdMinutes: 0,
  percentage: null,
  fixedMinutes: null,
  approvalRequired: true,
  overrideApplied: false,
  overrideMode: null,
}

async function cleanup() {
  await prisma.overtimePayout.deleteMany({ where: { tenantId: T } }).catch(() => {})
  await prisma.employeeOvertimePayoutOverride.deleteMany({ where: { tenantId: T } }).catch(() => {})
  await prisma.monthlyValue.deleteMany({ where: { tenantId: T } }).catch(() => {})
  await prisma.employee.deleteMany({ where: { tenantId: T } }).catch(() => {})
  await prisma.tariff.deleteMany({ where: { tenantId: T } }).catch(() => {})
  await prisma.user.deleteMany({ where: { id: U } }).catch(() => {})
  await prisma.tenant.deleteMany({ where: { id: T } }).catch(() => {})
}

describe.skipIf(!HAS_DB)("Overtime Payout Service — Integration", () => {
  beforeAll(async () => {
    await cleanup()

    await prisma.tenant.create({
      data: { id: T, name: "OT Payout IT", slug: "ot-payout-integ", isActive: true },
    })

    await prisma.user.create({
      data: {
        id: U,
        email: "ot-payout-test@integration.local",
        displayName: "OT Test User",
        role: "admin",
        tenantId: T,
      },
    })

    await prisma.tariff.create({
      data: {
        id: TAR,
        tenantId: T,
        code: "OTP-IT",
        name: "Payout Tariff",
        overtimePayoutEnabled: true,
        overtimePayoutMode: "ALL_ABOVE_THRESHOLD",
        overtimePayoutThresholdMinutes: 0,
        overtimePayoutApprovalRequired: true,
      },
    })

    const employees = [
      { id: EMP_A, pn: "OTP-A", fn: "Anna", ln: "Alpha" },
      { id: EMP_B, pn: "OTP-B", fn: "Ben", ln: "Beta" },
      { id: EMP_C, pn: "OTP-C", fn: "Chris", ln: "Charlie" },
      { id: EMP_D, pn: "OTP-D", fn: "Dana", ln: "Delta" },
      { id: EMP_E, pn: "OTP-E", fn: "Eva", ln: "Echo" },
    ]
    for (const e of employees) {
      await prisma.employee.create({
        data: {
          id: e.id,
          tenantId: T,
          personnelNumber: e.pn,
          pin: `pin-${e.pn}`,
          firstName: e.fn,
          lastName: e.ln,
          entryDate: new Date("2025-01-01"),
          tariffId: TAR,
          isActive: true,
        },
      })
    }

    const monthlyValues = [
      { id: MV_A, empId: EMP_A, flex: 1200 },
      { id: MV_B, empId: EMP_B, flex: 480 },
      { id: MV_C, empId: EMP_C, flex: 900 },
      { id: MV_D, empId: EMP_D, flex: 600 },
      { id: MV_E, empId: EMP_E, flex: 360 },
    ]
    for (const mv of monthlyValues) {
      await prisma.monthlyValue.create({
        data: {
          id: mv.id,
          tenantId: T,
          employeeId: mv.empId,
          year: YR,
          month: MO,
          flextimeEnd: mv.flex,
          flextimeCarryover: mv.flex,
        },
      })
    }

    const payouts = [
      { empId: EMP_A, flex: 1200, payout: 600 },
      { empId: EMP_B, flex: 480, payout: 240 },
      { empId: EMP_C, flex: 900, payout: 450 },
      { empId: EMP_D, flex: 600, payout: 300 },
      { empId: EMP_E, flex: 360, payout: 180 },
    ]
    for (const p of payouts) {
      await repo.create(prisma, {
        tenantId: T,
        employeeId: p.empId,
        year: YR,
        month: MO,
        payoutMinutes: p.payout,
        status: "pending",
        sourceFlextimeEnd: p.flex,
        tariffRuleSnapshot: SNAP,
      })
    }
  }, 30_000)

  afterAll(cleanup)

  // -------------------------------------------------------------------------
  // Read operations
  // -------------------------------------------------------------------------

  it("list returns all payouts with employee relation", async () => {
    const payouts = await service.list(prisma, T, { year: YR, month: MO })
    expect(payouts).toHaveLength(5)
    const a = payouts.find((p) => p.employeeId === EMP_A)
    expect(a).toBeDefined()
    expect(a!.employee.firstName).toBe("Anna")
    expect(a!.employee.lastName).toBe("Alpha")
    expect(a!.employee.personnelNumber).toBe("OTP-A")
  })

  it("list filters by status", async () => {
    const pending = await service.list(prisma, T, { status: "pending" })
    expect(pending).toHaveLength(5)
    const approved = await service.list(prisma, T, { status: "approved" })
    expect(approved).toHaveLength(0)
  })

  it("getById returns single payout", async () => {
    const all = await service.list(prisma, T, { employeeId: EMP_A })
    expect(all).toHaveLength(1)
    const [firstPayout] = all
    expect(firstPayout).toBeDefined()
    const payout = await service.getById(prisma, T, firstPayout!.id)
    expect(payout.employeeId).toBe(EMP_A)
    expect(payout.payoutMinutes).toBe(600)
    expect(payout.status).toBe("pending")
  })

  it("getById throws OvertimePayoutNotFoundError for missing ID", async () => {
    await expect(
      service.getById(prisma, T, "00000000-0000-4000-a000-000000000000"),
    ).rejects.toThrow(/not found/i)
  })

  it("countPending returns correct count", async () => {
    const count = await service.countPending(prisma, T, { year: YR, month: MO })
    expect(count).toBe(5)
  })

  // -------------------------------------------------------------------------
  // approve
  // -------------------------------------------------------------------------

  it("approve: pending → approved, flextimeEnd reduced", async () => {
    const [payoutA] = await service.list(prisma, T, { employeeId: EMP_A })
    expect(payoutA).toBeDefined()

    const result = await service.approve(prisma, T, payoutA!.id, U)
    expect(result.status).toBe("approved")
    expect(result.approvedBy).toBe(U)
    expect(result.approvedAt).toBeInstanceOf(Date)

    const mv = await prisma.monthlyValue.findUnique({ where: { id: MV_A } })
    expect(mv!.flextimeEnd).toBe(600)
    expect(mv!.flextimeCarryover).toBe(600)
  })

  it("approve already-approved payout throws", async () => {
    const [payoutA] = await service.list(prisma, T, { employeeId: EMP_A })
    expect(payoutA).toBeDefined()
    await expect(service.approve(prisma, T, payoutA!.id, U)).rejects.toThrow(
      /cannot approve/i,
    )
  })

  // -------------------------------------------------------------------------
  // reject
  // -------------------------------------------------------------------------

  it("reject: pending → rejected, flextimeEnd unchanged", async () => {
    const [payoutB] = await service.list(prisma, T, { employeeId: EMP_B })
    expect(payoutB).toBeDefined()

    const result = await service.reject(
      prisma,
      T,
      payoutB!.id,
      U,
      "Insufficient justification for payout",
    )
    expect(result.status).toBe("rejected")
    expect(result.rejectedBy).toBe(U)
    expect(result.rejectedReason).toBe("Insufficient justification for payout")

    const mv = await prisma.monthlyValue.findUnique({ where: { id: MV_B } })
    expect(mv!.flextimeEnd).toBe(480)
    expect(mv!.flextimeCarryover).toBe(480)
  })

  it("reject already-rejected payout throws", async () => {
    const [payoutB] = await service.list(prisma, T, { employeeId: EMP_B })
    expect(payoutB).toBeDefined()
    await expect(
      service.reject(prisma, T, payoutB!.id, U, "reason"),
    ).rejects.toThrow(/cannot reject/i)
  })

  // -------------------------------------------------------------------------
  // approveBatch
  // -------------------------------------------------------------------------

  it("approveBatch: approves remaining pending payouts", async () => {
    const pending = await service.list(prisma, T, { status: "pending" })
    expect(pending).toHaveLength(3) // C, D, E

    const ids = pending.map((p) => p.id)
    const result = await service.approveBatch(prisma, T, ids, U)
    expect(result.approvedCount).toBe(3)
    expect(result.errors).toHaveLength(0)

    const mvC = await prisma.monthlyValue.findUnique({ where: { id: MV_C } })
    expect(mvC!.flextimeEnd).toBe(450)

    const mvD = await prisma.monthlyValue.findUnique({ where: { id: MV_D } })
    expect(mvD!.flextimeEnd).toBe(300)

    const mvE = await prisma.monthlyValue.findUnique({ where: { id: MV_E } })
    expect(mvE!.flextimeEnd).toBe(180)
  })

  it("approveBatch with already-approved IDs collects errors", async () => {
    const approved = await service.list(prisma, T, { status: "approved" })
    const ids = approved.slice(0, 2).map((p) => p.id)
    const result = await service.approveBatch(prisma, T, ids, U)
    expect(result.approvedCount).toBe(0)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]!.reason).toMatch(/cannot approve/i)
  })

  // -------------------------------------------------------------------------
  // Aggregation
  // -------------------------------------------------------------------------

  it("countPending returns 0 after all resolved", async () => {
    const count = await service.countPending(prisma, T, { year: YR, month: MO })
    expect(count).toBe(0)
  })

  it("aggregateApprovedMinutes sums only approved payouts", async () => {
    const sumA = await repo.aggregateApprovedMinutes(prisma, T, EMP_A, YR, MO)
    expect(sumA).toBe(600)

    const sumB = await repo.aggregateApprovedMinutes(prisma, T, EMP_B, YR, MO)
    expect(sumB).toBe(0) // rejected

    const sumC = await repo.aggregateApprovedMinutes(prisma, T, EMP_C, YR, MO)
    expect(sumC).toBe(450)
  })

  it("list with status filter returns correct subsets", async () => {
    const approved = await service.list(prisma, T, { status: "approved" })
    expect(approved).toHaveLength(4) // A, C, D, E

    const rejected = await service.list(prisma, T, { status: "rejected" })
    expect(rejected).toHaveLength(1) // B
  })

  // -------------------------------------------------------------------------
  // Repository: batch and employee-month operations
  // -------------------------------------------------------------------------

  it("batchFindByEmployeeMonth returns map of payouts", async () => {
    const map = await repo.batchFindByEmployeeMonth(
      prisma,
      T,
      [EMP_A, EMP_B, EMP_C],
      YR,
      MO,
    )
    expect(map.size).toBe(3)
    expect(map.get(EMP_A)!.status).toBe("approved")
    expect(map.get(EMP_A)!.payoutMinutes).toBe(600)
    expect(map.get(EMP_B)!.status).toBe("rejected")
    expect(map.get(EMP_C)!.status).toBe("approved")
  })

  it("findByEmployeeMonth returns payout for specific employee/period", async () => {
    const payout = await repo.findByEmployeeMonth(prisma, T, EMP_D, YR, MO)
    expect(payout).not.toBeNull()
    expect(payout!.status).toBe("approved")
    expect(payout!.payoutMinutes).toBe(300)
  })

  it("deleteByEmployeeMonth removes the payout", async () => {
    await repo.deleteByEmployeeMonth(prisma, T, EMP_E, YR, MO)
    const payout = await repo.findByEmployeeMonth(prisma, T, EMP_E, YR, MO)
    expect(payout).toBeNull()

    const count = await prisma.overtimePayout.count({ where: { tenantId: T } })
    expect(count).toBe(4) // A, B, C, D remain
  })
})
