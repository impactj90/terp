import { describe, it, expect, vi } from "vitest"
import {
  seedDefaultsForTenant,
  getDefaultForLevel,
  create,
  ReminderTemplateValidationError,
} from "../reminder-template-service"

type AnyPrisma = Parameters<typeof seedDefaultsForTenant>[0]

function mockPrisma(initialCount = 0) {
  // Simulate persisted templates via a local array used by both
  // count/createMany/findFirst.
  const store: Array<Record<string, unknown>> = []
  for (let i = 0; i < initialCount; i++) {
    store.push({ id: `pre-${i}`, level: 1, isDefault: true })
  }
  const count = vi
    .fn()
    .mockImplementation(async () => store.length)
  const createMany = vi.fn().mockImplementation(async ({ data }) => {
    for (const row of data) store.push({ id: `tpl-${store.length}`, ...row })
    return { count: data.length }
  })
  const findFirst = vi
    .fn()
    .mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        store.find(
          (t) =>
            (where.level === undefined || t.level === where.level) &&
            (where.isDefault === undefined || t.isDefault === where.isDefault)
        ) ?? null
      )
    })
  const createFn = vi.fn().mockImplementation(async ({ data }) => {
    const row = { id: `tpl-${store.length}`, ...data }
    store.push(row)
    return row
  })
  return {
    prisma: {
      reminderTemplate: { count, createMany, findFirst, create: createFn },
    } as unknown as AnyPrisma,
    store,
    count,
    createMany,
  }
}

describe("seedDefaultsForTenant", () => {
  it("creates 3 default templates on first call", async () => {
    const { prisma, store, createMany } = mockPrisma(0)
    const result = await seedDefaultsForTenant(prisma, "tenant-1")
    expect(result).toEqual({ seeded: 3 })
    expect(createMany).toHaveBeenCalledOnce()
    expect(store).toHaveLength(3)
  })

  it("is idempotent — second call seeds 0", async () => {
    const { prisma } = mockPrisma(3)
    const result = await seedDefaultsForTenant(prisma, "tenant-1")
    expect(result).toEqual({ seeded: 0 })
  })

  it("after seeding, getDefaultForLevel(1) returns the level-1 template", async () => {
    const { prisma } = mockPrisma(0)
    await seedDefaultsForTenant(prisma, "tenant-1")
    const tpl = await getDefaultForLevel(prisma, "tenant-1", 1)
    expect(tpl).not.toBeNull()
    expect(tpl?.level).toBe(1)
  })
})

describe("create validation", () => {
  it("rejects empty name", async () => {
    const { prisma } = mockPrisma(0)
    await expect(
      create(prisma, "tenant-1", { name: "  ", level: 1 }, null)
    ).rejects.toThrow(ReminderTemplateValidationError)
  })

  it("rejects level out of range", async () => {
    const { prisma } = mockPrisma(0)
    await expect(
      create(prisma, "tenant-1", { name: "Test", level: 5 }, null)
    ).rejects.toThrow(ReminderTemplateValidationError)
  })
})
