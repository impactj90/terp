import { describe, it, expect, vi } from "vitest"
import {
  getCurrentDunningLevel,
  getReminderStatus,
} from "../reminder-level-helper"

type AnyPrisma = Parameters<typeof getCurrentDunningLevel>[0]

type Item = {
  levelAtReminder: number
  reminder: { status: string; sentAt: Date | null }
}

function mockPrisma(items: Item[]) {
  const findFirst = vi
    .fn()
    .mockImplementation(
      async ({ where, orderBy, select, include }: Record<string, unknown>) => {
        const _where = where as { reminder?: { status?: string } }
        let filtered = items.filter(
          (it) => it.reminder.status === _where.reminder?.status
        )
        const _orderBy = orderBy as
          | { levelAtReminder?: "asc" | "desc" }
          | undefined
        if (_orderBy?.levelAtReminder === "desc") {
          filtered = filtered.sort(
            (a, b) => b.levelAtReminder - a.levelAtReminder
          )
        }
        const head = filtered[0]
        if (!head) return null
        if (select) return { levelAtReminder: head.levelAtReminder }
        if (include) return head
        return head
      }
    )
  return {
    prisma: {
      reminderItem: { findFirst },
    } as unknown as AnyPrisma,
    findFirst,
  }
}

describe("getCurrentDunningLevel", () => {
  it("returns 0 when there are no reminder items", async () => {
    const { prisma } = mockPrisma([])
    expect(await getCurrentDunningLevel(prisma, "doc-1")).toBe(0)
  })

  it("returns the level of a single SENT reminder", async () => {
    const { prisma } = mockPrisma([
      {
        levelAtReminder: 2,
        reminder: { status: "SENT", sentAt: new Date("2026-04-01") },
      },
    ])
    expect(await getCurrentDunningLevel(prisma, "doc-1")).toBe(2)
  })

  it("ignores CANCELLED reminders even if they are higher level", async () => {
    const { prisma } = mockPrisma([
      {
        levelAtReminder: 2,
        reminder: { status: "SENT", sentAt: new Date("2026-04-01") },
      },
      {
        levelAtReminder: 3,
        reminder: { status: "CANCELLED", sentAt: new Date("2026-04-02") },
      },
    ])
    expect(await getCurrentDunningLevel(prisma, "doc-1")).toBe(2)
  })
})

describe("getReminderStatus", () => {
  it("returns { status: never } when there are no SENT reminders", async () => {
    const { prisma } = mockPrisma([])
    const result = await getReminderStatus(prisma, "doc-1")
    expect(result).toEqual({ status: "never" })
  })

  it("returns { status: sent, level, sentAt } when reminders exist", async () => {
    const sentAt = new Date("2026-04-01")
    const { prisma } = mockPrisma([
      { levelAtReminder: 2, reminder: { status: "SENT", sentAt } },
    ])
    const result = await getReminderStatus(prisma, "doc-1")
    expect(result).toEqual({ status: "sent", level: 2, sentAt })
  })
})
