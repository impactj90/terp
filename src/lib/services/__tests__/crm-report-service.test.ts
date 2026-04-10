import { describe, it, expect, vi } from "vitest"
import * as service from "../crm-report-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    crmAddress: {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    crmCorrespondence: {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    crmInquiry: {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    crmTask: {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as PrismaClient
}

// --- overview ---

describe("crm-report-service", () => {
  describe("overview", () => {
    it("returns all summary metrics", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(50) // totalAddresses
        .mockResolvedValueOnce(5) // newAddressesThisMonth
      ;(prisma.crmInquiry.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(10) // openInquiries
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(8) // pendingTasks
        .mockResolvedValueOnce(3) // overdueTaskCount
      ;(prisma.crmCorrespondence.count as ReturnType<typeof vi.fn>).mockResolvedValueOnce(12) // correspondenceThisWeek

      const result = await service.overview(prisma, TENANT_ID)

      expect(result.totalAddresses).toBe(50)
      expect(result.newAddressesThisMonth).toBe(5)
      expect(result.openInquiries).toBe(10)
      expect(result.pendingTasks).toBe(8)
      expect(result.overdueTaskCount).toBe(3)
      expect(result.correspondenceThisWeek).toBe(12)
    })

    it("counts only TASK type for pending tasks (not MESSAGE)", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.count as ReturnType<typeof vi.fn>)
        .mockResolvedValue(0)
      ;(prisma.crmInquiry.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmCorrespondence.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await service.overview(prisma, TENANT_ID)

      // The 4th call (index 0 for crmTask.count) should have type: "TASK"
      const taskCountCalls = (prisma.crmTask.count as ReturnType<typeof vi.fn>).mock.calls
      expect(taskCountCalls[0]![0].where.type).toBe("TASK")
      expect(taskCountCalls[1]![0].where.type).toBe("TASK")
    })

    it("scopes all queries to tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmInquiry.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmCorrespondence.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await service.overview(prisma, TENANT_ID)

      // Check all address count calls include tenantId
      const addrCalls = (prisma.crmAddress.count as ReturnType<typeof vi.fn>).mock.calls
      for (const call of addrCalls) {
        expect(call[0].where.tenantId).toBe(TENANT_ID)
      }

      const inqCalls = (prisma.crmInquiry.count as ReturnType<typeof vi.fn>).mock.calls
      for (const call of inqCalls) {
        expect(call[0].where.tenantId).toBe(TENANT_ID)
      }
    })
  })

  // --- addressStats ---

  describe("addressStats", () => {
    it("returns counts by type", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { type: "CUSTOMER", _count: 30 },
        { type: "SUPPLIER", _count: 15 },
        { type: "BOTH", _count: 5 },
      ])
      ;(prisma.crmAddress.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(40) // active
        .mockResolvedValueOnce(10) // inactive
        .mockResolvedValueOnce(50) // total

      const result = await service.addressStats(prisma, TENANT_ID)

      expect(result.byType).toEqual([
        { type: "CUSTOMER", count: 30 },
        { type: "SUPPLIER", count: 15 },
        { type: "BOTH", count: 5 },
      ])
    })

    it("returns active/inactive counts", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
      ;(prisma.crmAddress.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(40) // active
        .mockResolvedValueOnce(10) // inactive
        .mockResolvedValueOnce(50) // total

      const result = await service.addressStats(prisma, TENANT_ID)

      expect(result.active).toBe(40)
      expect(result.inactive).toBe(10)
      expect(result.total).toBe(50)
    })

    it("filters by type parameter when provided", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])
      ;(prisma.crmAddress.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await service.addressStats(prisma, TENANT_ID, { type: "CUSTOMER" })

      const groupByCall = (prisma.crmAddress.groupBy as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(groupByCall![0].where.type).toBe("CUSTOMER")
    })
  })

  // --- correspondenceByPeriod ---

  describe("correspondenceByPeriod", () => {
    it("groups by month correctly", async () => {
      const prisma = createMockPrisma()
      ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { period: new Date("2026-01-01"), direction: "INCOMING", count: BigInt(5) },
        { period: new Date("2026-01-01"), direction: "OUTGOING", count: BigInt(3) },
        { period: new Date("2026-02-01"), direction: "INCOMING", count: BigInt(7) },
      ])

      const result = await service.correspondenceByPeriod(prisma, TENANT_ID, {
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-03-01T00:00:00.000Z",
        groupBy: "month",
      })

      expect(result.periods).toHaveLength(2)
      expect(result.periods[0]!.incoming).toBe(5)
      expect(result.periods[0]!.outgoing).toBe(3)
      expect(result.periods[1]!.incoming).toBe(7)
    })

    it("groups by day correctly", async () => {
      const prisma = createMockPrisma()
      ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { period: new Date("2026-03-15"), direction: "INTERNAL", count: BigInt(2) },
      ])

      const result = await service.correspondenceByPeriod(prisma, TENANT_ID, {
        dateFrom: "2026-03-15T00:00:00.000Z",
        dateTo: "2026-03-15T23:59:59.000Z",
        groupBy: "day",
      })

      expect(result.periods).toHaveLength(1)
      expect(result.periods[0]!.internal).toBe(2)
      expect(result.periods[0]!.total).toBe(2)
    })

    it("returns empty periods array when no data", async () => {
      const prisma = createMockPrisma()
      ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const result = await service.correspondenceByPeriod(prisma, TENANT_ID, {
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-03-01T00:00:00.000Z",
        groupBy: "month",
      })

      expect(result.periods).toEqual([])
    })
  })

  // --- correspondenceByType ---

  describe("correspondenceByType", () => {
    it("groups correspondence by type", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { type: "phone", _count: 10 },
        { type: "email", _count: 25 },
        { type: "letter", _count: 3 },
      ])

      const result = await service.correspondenceByType(prisma, TENANT_ID, {
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-03-01T00:00:00.000Z",
      })

      expect(result.byType).toEqual([
        { type: "phone", count: 10 },
        { type: "email", count: 25 },
        { type: "letter", count: 3 },
      ])
    })
  })

  // --- inquiryPipeline ---

  describe("inquiryPipeline", () => {
    it("counts inquiries by status", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([
          { status: "OPEN", _count: 5 },
          { status: "CLOSED", _count: 10 },
        ])
        .mockResolvedValueOnce([]) // topAddressRows
      ;(prisma.crmInquiry.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const result = await service.inquiryPipeline(prisma, TENANT_ID)

      expect(result.byStatus).toEqual([
        { status: "OPEN", count: 5 },
        { status: "CLOSED", count: 10 },
      ])
    })

    it("calculates average days to close for closed inquiries", async () => {
      const _now = new Date("2026-03-17")
      const created = new Date("2026-03-10")
      const closed = new Date("2026-03-17")

      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ status: "CLOSED", _count: 1 }])
        .mockResolvedValueOnce([]) // topAddressRows
      ;(prisma.crmInquiry.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { createdAt: created, closedAt: closed },
      ])

      const result = await service.inquiryPipeline(prisma, TENANT_ID)

      expect(result.avgDaysToClose).toBe(7)
    })

    it("returns null avgDaysToClose when no closed inquiries exist", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ status: "OPEN", _count: 3 }])
        .mockResolvedValueOnce([]) // topAddressRows
      ;(prisma.crmInquiry.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const result = await service.inquiryPipeline(prisma, TENANT_ID)

      expect(result.avgDaysToClose).toBeNull()
    })

    it("returns top 10 addresses by inquiry count", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.groupBy as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([]) // byStatus
        .mockResolvedValueOnce([
          { addressId: "addr-1", _count: 5 },
          { addressId: "addr-2", _count: 3 },
        ])
      ;(prisma.crmInquiry.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]) // closedInquiries
      ;(prisma.crmAddress.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "addr-1", company: "Firma A" },
        { id: "addr-2", company: "Firma B" },
      ])

      const result = await service.inquiryPipeline(prisma, TENANT_ID)

      expect(result.topAddresses).toEqual([
        { addressId: "addr-1", company: "Firma A", count: 5 },
        { addressId: "addr-2", company: "Firma B", count: 3 },
      ])
    })
  })

  // --- inquiryByEffort ---

  describe("inquiryByEffort", () => {
    it("groups inquiries by effort level", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { effort: "Gering", _count: 4 },
        { effort: "Mittel", _count: 6 },
        { effort: "Hoch", _count: 2 },
      ])

      const result = await service.inquiryByEffort(prisma, TENANT_ID)

      expect(result.byEffort).toEqual([
        { effort: "Gering", count: 4 },
        { effort: "Mittel", count: 6 },
        { effort: "Hoch", count: 2 },
      ])
    })

    it("handles null effort as 'Unbekannt'", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.groupBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { effort: null, _count: 3 },
      ])

      const result = await service.inquiryByEffort(prisma, TENANT_ID)

      expect(result.byEffort).toEqual([{ effort: "Unbekannt", count: 3 }])
    })
  })

  // --- taskCompletion ---

  describe("taskCompletion", () => {
    it("calculates completion rate correctly", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(10) // completed
        .mockResolvedValueOnce(2) // cancelled
        .mockResolvedValueOnce(3) // overdue
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const result = await service.taskCompletion(prisma, TENANT_ID)

      expect(result.total).toBe(20)
      expect(result.completed).toBe(10)
      expect(result.completionRate).toBe(50)
    })

    it("counts overdue tasks (open with past dueAt)", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(1) // completed
        .mockResolvedValueOnce(0) // cancelled
        .mockResolvedValueOnce(2) // overdue
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const result = await service.taskCompletion(prisma, TENANT_ID)

      expect(result.overdue).toBe(2)
    })

    it("calculates avg completion days", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          createdAt: new Date("2026-03-01"),
          completedAt: new Date("2026-03-11"),
        },
        {
          createdAt: new Date("2026-03-05"),
          completedAt: new Date("2026-03-10"),
        },
      ])

      const result = await service.taskCompletion(prisma, TENANT_ID)

      // (10 + 5) / 2 = 7.5
      expect(result.avgCompletionDays).toBe(7.5)
    })

    it("returns 0 completionRate when no tasks exist", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmTask.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmTask.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const result = await service.taskCompletion(prisma, TENANT_ID)

      expect(result.completionRate).toBe(0)
      expect(result.avgCompletionDays).toBeNull()
    })
  })

  // --- tasksByAssignee ---

  describe("tasksByAssignee", () => {
    it("returns tasks grouped by employee", async () => {
      const prisma = createMockPrisma()
      ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          employee_id: "emp-1",
          first_name: "Max",
          last_name: "Mustermann",
          total: 10,
          completed: 7,
          open: 3,
        },
      ])

      const result = await service.tasksByAssignee(prisma, TENANT_ID)

      expect(result.assignees).toEqual([
        {
          employeeId: "emp-1",
          name: "Max Mustermann",
          total: 10,
          completed: 7,
          open: 3,
        },
      ])
    })

    it("includes completed and open counts per employee", async () => {
      const prisma = createMockPrisma()
      ;(prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          employee_id: "emp-1",
          first_name: "Anna",
          last_name: "Schmidt",
          total: 15,
          completed: 12,
          open: 3,
        },
        {
          employee_id: "emp-2",
          first_name: "Peter",
          last_name: "Muller",
          total: 8,
          completed: 5,
          open: 3,
        },
      ])

      const result = await service.tasksByAssignee(prisma, TENANT_ID)

      expect(result.assignees).toHaveLength(2)
      expect(result.assignees[0]!.completed).toBe(12)
      expect(result.assignees[0]!.open).toBe(3)
      expect(result.assignees[1]!.total).toBe(8)
    })
  })
})
