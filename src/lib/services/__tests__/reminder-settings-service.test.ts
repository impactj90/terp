import { describe, it, expect, vi } from "vitest"
import {
  getSettings,
  updateSettings,
  ReminderSettingsValidationError,
} from "../reminder-settings-service"

type AnyPrisma = Parameters<typeof getSettings>[0]

function mockPrisma(initial: { existing?: unknown } = {}) {
  const findUnique = vi.fn().mockResolvedValue(initial.existing ?? null)
  const create = vi.fn().mockImplementation(async ({ data }) => ({
    id: "rs-1",
    enabled: false,
    maxLevel: 3,
    gracePeriodDays: [7, 14, 21],
    feeAmounts: [0, 2.5, 5],
    interestEnabled: true,
    interestRatePercent: 9,
    feesEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data,
  }))
  const update = vi.fn().mockImplementation(async ({ data, where }) => ({
    id: "rs-1",
    tenantId: where.tenantId,
    enabled: false,
    maxLevel: 3,
    gracePeriodDays: [7, 14, 21],
    feeAmounts: [0, 2.5, 5],
    interestEnabled: true,
    interestRatePercent: 9,
    feesEnabled: true,
    ...data,
  }))
  return {
    prisma: {
      reminderSettings: { findUnique, create, update },
    } as unknown as AnyPrisma,
    findUnique,
    create,
    update,
  }
}

describe("reminder-settings-service.getSettings", () => {
  it("creates a default settings row on first access", async () => {
    const { prisma, findUnique, create } = mockPrisma()
    const result = await getSettings(prisma, "tenant-1")
    expect(findUnique).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    expect(result.tenantId).toBe("tenant-1")
    expect(result.enabled).toBe(false)
    expect(result.maxLevel).toBe(3)
  })

  it("returns the existing row without creating", async () => {
    const existing = {
      id: "rs-existing",
      tenantId: "tenant-1",
      enabled: true,
      maxLevel: 2,
    }
    const { prisma, create } = mockPrisma({ existing })
    const result = await getSettings(prisma, "tenant-1")
    expect(create).not.toHaveBeenCalled()
    expect(result).toBe(existing)
  })
})

describe("reminder-settings-service.updateSettings", () => {
  it("rejects maxLevel = 5", async () => {
    const { prisma } = mockPrisma()
    await expect(
      updateSettings(prisma, "tenant-1", { maxLevel: 5 })
    ).rejects.toThrow(ReminderSettingsValidationError)
  })

  it("rejects maxLevel = 0", async () => {
    const { prisma } = mockPrisma()
    await expect(
      updateSettings(prisma, "tenant-1", { maxLevel: 0 })
    ).rejects.toThrow(ReminderSettingsValidationError)
  })

  it("rejects negative interest rate", async () => {
    const { prisma } = mockPrisma()
    await expect(
      updateSettings(prisma, "tenant-1", { interestRatePercent: -1 })
    ).rejects.toThrow(ReminderSettingsValidationError)
  })

  it("rejects gracePeriodDays length mismatch with maxLevel", async () => {
    const { prisma } = mockPrisma()
    await expect(
      updateSettings(prisma, "tenant-1", {
        maxLevel: 3,
        gracePeriodDays: [7, 14],
      })
    ).rejects.toThrow(ReminderSettingsValidationError)
  })

  it("rejects feeAmounts length mismatch with maxLevel", async () => {
    const { prisma } = mockPrisma()
    await expect(
      updateSettings(prisma, "tenant-1", {
        maxLevel: 3,
        feeAmounts: [0, 2.5],
      })
    ).rejects.toThrow(ReminderSettingsValidationError)
  })

  it("accepts a valid update", async () => {
    const { prisma, update } = mockPrisma()
    const result = await updateSettings(prisma, "tenant-1", {
      enabled: true,
      maxLevel: 3,
      gracePeriodDays: [5, 10, 15],
      feeAmounts: [0, 5, 10],
    })
    expect(update).toHaveBeenCalledOnce()
    expect(result.enabled).toBe(true)
    expect(result.gracePeriodDays).toEqual([5, 10, 15])
  })
})
