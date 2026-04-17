import { describe, it, expect, vi } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  updateBonusFn,
  DayPlanNotFoundError,
  BonusNotFoundError,
  DayPlanValidationError,
} from "../day-plans-service"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const OTHER_TENANT = "a0000000-0000-4000-a000-000000000999"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const DAY_PLAN_ID = "a0000000-0000-4000-a000-000000000700"
const BONUS_ID = "a0000000-0000-4000-a000-000000000900"
const ACCOUNT_ID = "a0000000-0000-4000-a000-000000000350"
const OTHER_ACCOUNT_ID = "a0000000-0000-4000-a000-000000000351"

function makeBonus(overrides: Record<string, unknown> = {}) {
  return {
    id: BONUS_ID,
    dayPlanId: DAY_PLAN_ID,
    accountId: ACCOUNT_ID,
    timeFrom: 1320,
    timeTo: 360,
    calculationType: "percentage",
    valueMinutes: 25,
    minWorkMinutes: null,
    appliesOnHoliday: false,
    sortOrder: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }
}

function makeDayPlan() {
  return {
    id: DAY_PLAN_ID,
    tenantId: TENANT_ID,
    code: "NS",
    name: "Night Shift",
    isActive: true,
  }
}

type MockPrisma = {
  dayPlan: { findFirst: ReturnType<typeof vi.fn> }
  dayPlanBonus: {
    findFirst: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  auditLog: { create: ReturnType<typeof vi.fn> }
}

function mockPrisma(config: {
  dayPlan?: unknown
  bonus?: unknown
  updated?: unknown
}): MockPrisma {
  const dayPlanValue = "dayPlan" in config ? config.dayPlan : makeDayPlan()
  const bonusValue = "bonus" in config ? config.bonus : makeBonus()
  const updatedValue = "updated" in config ? config.updated : makeBonus()
  return {
    dayPlan: { findFirst: vi.fn().mockResolvedValue(dayPlanValue) },
    dayPlanBonus: {
      findFirst: vi.fn().mockResolvedValue(bonusValue),
      update: vi.fn().mockResolvedValue(updatedValue),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  }
}

const AUDIT = { userId: USER_ID, ipAddress: "127.0.0.1", userAgent: "test" }

describe("day-plans-service.updateBonusFn", () => {
  describe("partial updates", () => {
    it("passes through only fields that were explicitly provided", async () => {
      const prisma = mockPrisma({
        bonus: makeBonus({ valueMinutes: 25 }),
        updated: makeBonus({ valueMinutes: 30 }),
      })

      await updateBonusFn(
        prisma as unknown as PrismaClient,
        TENANT_ID,
        { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, valueMinutes: 30 },
        AUDIT,
      )

      const updateArgs = prisma.dayPlanBonus.update.mock.calls[0]![0] as {
        where: { id: string }
        data: Record<string, unknown>
      }
      expect(updateArgs.where.id).toBe(BONUS_ID)
      // Only valueMinutes should be in the data payload — no other fields.
      expect(updateArgs.data).toEqual({ valueMinutes: 30 })
    })

    it("allows updating accountId independently", async () => {
      const prisma = mockPrisma({
        updated: makeBonus({ accountId: OTHER_ACCOUNT_ID }),
      })

      await updateBonusFn(
        prisma as unknown as PrismaClient,
        TENANT_ID,
        { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, accountId: OTHER_ACCOUNT_ID },
        AUDIT,
      )

      const updateArgs = prisma.dayPlanBonus.update.mock.calls[0]![0] as {
        data: Record<string, unknown>
      }
      expect(updateArgs.data).toEqual({ accountId: OTHER_ACCOUNT_ID })
    })

    it("treats explicit null on minWorkMinutes as a real update (clear gate)", async () => {
      const prisma = mockPrisma({
        bonus: makeBonus({ minWorkMinutes: 240 }),
        updated: makeBonus({ minWorkMinutes: null }),
      })

      await updateBonusFn(
        prisma as unknown as PrismaClient,
        TENANT_ID,
        { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, minWorkMinutes: null },
        AUDIT,
      )

      const updateArgs = prisma.dayPlanBonus.update.mock.calls[0]![0] as {
        data: Record<string, unknown>
      }
      expect(updateArgs.data).toEqual({ minWorkMinutes: null })
    })

    it("updates all eight fields when all are provided", async () => {
      const prisma = mockPrisma({
        updated: makeBonus({
          accountId: OTHER_ACCOUNT_ID,
          timeFrom: 0,
          timeTo: 360,
          calculationType: "percentage",
          valueMinutes: 50,
          minWorkMinutes: 120,
          appliesOnHoliday: true,
          sortOrder: 5,
        }),
      })

      await updateBonusFn(
        prisma as unknown as PrismaClient,
        TENANT_ID,
        {
          dayPlanId: DAY_PLAN_ID,
          bonusId: BONUS_ID,
          accountId: OTHER_ACCOUNT_ID,
          timeFrom: 0,
          timeTo: 360,
          calculationType: "percentage",
          valueMinutes: 50,
          minWorkMinutes: 120,
          appliesOnHoliday: true,
          sortOrder: 5,
        },
        AUDIT,
      )

      const updateArgs = prisma.dayPlanBonus.update.mock.calls[0]![0] as {
        data: Record<string, unknown>
      }
      expect(updateArgs.data).toEqual({
        accountId: OTHER_ACCOUNT_ID,
        timeFrom: 0,
        timeTo: 360,
        calculationType: "percentage",
        valueMinutes: 50,
        minWorkMinutes: 120,
        appliesOnHoliday: true,
        sortOrder: 5,
      })
    })
  })

  describe("validation", () => {
    it("throws DayPlanValidationError when timeFrom === timeTo (both explicitly)", async () => {
      const prisma = mockPrisma({})
      await expect(
        updateBonusFn(
          prisma as unknown as PrismaClient,
          TENANT_ID,
          {
            dayPlanId: DAY_PLAN_ID,
            bonusId: BONUS_ID,
            timeFrom: 360,
            timeTo: 360,
          },
          AUDIT,
        ),
      ).rejects.toBeInstanceOf(DayPlanValidationError)
    })

    it("merges partial timeFrom with existing timeTo for validation", async () => {
      // Existing bonus has timeTo=480. New timeFrom=480 → would create zero-length window.
      const prisma = mockPrisma({
        bonus: makeBonus({ timeFrom: 1320, timeTo: 480 }),
      })
      await expect(
        updateBonusFn(
          prisma as unknown as PrismaClient,
          TENANT_ID,
          { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, timeFrom: 480 },
          AUDIT,
        ),
      ).rejects.toBeInstanceOf(DayPlanValidationError)
    })

    it("merges partial timeTo with existing timeFrom for validation", async () => {
      const prisma = mockPrisma({
        bonus: makeBonus({ timeFrom: 300, timeTo: 360 }),
      })
      await expect(
        updateBonusFn(
          prisma as unknown as PrismaClient,
          TENANT_ID,
          { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, timeTo: 300 },
          AUDIT,
        ),
      ).rejects.toBeInstanceOf(DayPlanValidationError)
    })

    it("allows overnight windows (timeFrom > timeTo)", async () => {
      const prisma = mockPrisma({
        bonus: makeBonus({ timeFrom: 480, timeTo: 960 }),
        updated: makeBonus({ timeFrom: 1320, timeTo: 360 }),
      })
      await expect(
        updateBonusFn(
          prisma as unknown as PrismaClient,
          TENANT_ID,
          {
            dayPlanId: DAY_PLAN_ID,
            bonusId: BONUS_ID,
            timeFrom: 1320,
            timeTo: 360,
          },
          AUDIT,
        ),
      ).resolves.toBeDefined()
    })
  })

  describe("ownership", () => {
    it("throws DayPlanNotFoundError when the day plan does not belong to the tenant", async () => {
      const prisma = mockPrisma({ dayPlan: null })
      await expect(
        updateBonusFn(
          prisma as unknown as PrismaClient,
          OTHER_TENANT,
          { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, valueMinutes: 30 },
          AUDIT,
        ),
      ).rejects.toBeInstanceOf(DayPlanNotFoundError)

      // Tenant scoping is enforced — findFirst was queried with the other tenant.
      const dayPlanFindArgs = prisma.dayPlan.findFirst.mock.calls[0]![0] as {
        where: { tenantId: string }
      }
      expect(dayPlanFindArgs.where.tenantId).toBe(OTHER_TENANT)
    })

    it("throws BonusNotFoundError when bonus does not belong to the day plan", async () => {
      const prisma = mockPrisma({ bonus: null })
      await expect(
        updateBonusFn(
          prisma as unknown as PrismaClient,
          TENANT_ID,
          { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, valueMinutes: 30 },
          AUDIT,
        ),
      ).rejects.toBeInstanceOf(BonusNotFoundError)
    })

    it("never calls update when validation or ownership check fails", async () => {
      const prisma = mockPrisma({ bonus: null })
      await expect(
        updateBonusFn(
          prisma as unknown as PrismaClient,
          TENANT_ID,
          { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, valueMinutes: 30 },
          AUDIT,
        ),
      ).rejects.toBeDefined()
      expect(prisma.dayPlanBonus.update).not.toHaveBeenCalled()
    })
  })

  describe("audit log", () => {
    it("writes an audit log entry with field-level changes diff", async () => {
      const prisma = mockPrisma({
        bonus: makeBonus({ valueMinutes: 25, appliesOnHoliday: false }),
        updated: makeBonus({ valueMinutes: 30, appliesOnHoliday: true }),
      })

      await updateBonusFn(
        prisma as unknown as PrismaClient,
        TENANT_ID,
        {
          dayPlanId: DAY_PLAN_ID,
          bonusId: BONUS_ID,
          valueMinutes: 30,
          appliesOnHoliday: true,
        },
        AUDIT,
      )

      expect(prisma.auditLog.create).toHaveBeenCalledTimes(1)
      const auditArgs = prisma.auditLog.create.mock.calls[0]![0] as {
        data: {
          tenantId: string
          userId: string
          action: string
          entityType: string
          entityId: string
          changes: Record<string, { old: unknown; new: unknown }> | null
        }
      }
      expect(auditArgs.data.tenantId).toBe(TENANT_ID)
      expect(auditArgs.data.userId).toBe(USER_ID)
      expect(auditArgs.data.action).toBe("update")
      expect(auditArgs.data.entityType).toBe("day_plan_bonus")
      expect(auditArgs.data.entityId).toBe(BONUS_ID)
      expect(auditArgs.data.changes).toMatchObject({
        valueMinutes: { old: 25, new: 30 },
        appliesOnHoliday: { old: false, new: true },
      })
    })

    it("does not write an audit log entry when audit context is omitted", async () => {
      const prisma = mockPrisma({})

      await updateBonusFn(
        prisma as unknown as PrismaClient,
        TENANT_ID,
        { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, valueMinutes: 30 },
        // no audit
      )

      expect(prisma.auditLog.create).not.toHaveBeenCalled()
    })

    it("audit-log failures do not block the update (fire-and-forget)", async () => {
      const prisma = mockPrisma({})
      prisma.auditLog.create.mockRejectedValueOnce(new Error("audit db down"))

      const result = await updateBonusFn(
        prisma as unknown as PrismaClient,
        TENANT_ID,
        { dayPlanId: DAY_PLAN_ID, bonusId: BONUS_ID, valueMinutes: 30 },
        AUDIT,
      )

      expect(result).toBeDefined()
      expect(prisma.dayPlanBonus.update).toHaveBeenCalledTimes(1)
    })
  })
})
