import { describe, it, expect, vi, beforeEach } from "vitest"
import * as reminderService from "../reminder-service"

type RefreshPrisma = Parameters<typeof reminderService.refreshDraftReminder>[0]

const TENANT = "t-1"
const REMINDER_ID = "r-1"

interface ReminderItemRow {
  id: string
  tenantId: string
  reminderId: string
  billingDocumentId: string
  openAmountAtReminder: number
  originalAmount: number
  daysOverdue: number
  interestAmount: number
  feeAmount: number
  levelAtReminder: number
}

interface BillingDocumentRow {
  id: string
  tenantId: string
  totalGross: number
  payments: Array<{ status: string; amount: number }>
  childDocuments: Array<{ type: string; status: string; totalGross: number }>
}

interface ReminderRow {
  id: string
  tenantId: string
  status: string
  totalOpenAmount: number
  totalInterest: number
  totalFees: number
  totalDue: number
  items: ReminderItemRow[]
}

function baseItem(overrides: Partial<ReminderItemRow>): ReminderItemRow {
  return {
    id: "it-?",
    tenantId: TENANT,
    reminderId: REMINDER_ID,
    billingDocumentId: "doc-?",
    openAmountAtReminder: 100,
    originalAmount: 100,
    daysOverdue: 20,
    interestAmount: 0.5,
    feeAmount: 0,
    levelAtReminder: 1,
    ...overrides,
  }
}

function buildMock(opts: {
  reminder: ReminderRow
  docs: BillingDocumentRow[]
}) {
  let items = [...opts.reminder.items]
  let reminder = { ...opts.reminder, items }

  const calls = {
    deleteMany: [] as Array<{ ids: string[] }>,
    update: [] as Array<{ id: string; data: Record<string, unknown> }>,
    headerUpdate: [] as Array<Record<string, unknown>>,
  }

  const prisma = {
    reminder: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => {
        if (where.id !== reminder.id || where.tenantId !== reminder.tenantId) return null
        return reminder
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.headerUpdate.push(data)
        reminder = { ...reminder, ...(data as Partial<ReminderRow>) }
        return reminder
      }),
    },
    billingDocument: {
      findMany: vi.fn(async ({ where }: { where: { tenantId: string; id: { in: string[] } } }) => {
        return opts.docs.filter(
          (d) => d.tenantId === where.tenantId && where.id.in.includes(d.id),
        )
      }),
    },
    reminderItem: {
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        calls.deleteMany.push({ ids: where.id.in })
        items = items.filter((i) => !where.id.in.includes(i.id))
        reminder = { ...reminder, items }
        return { count: where.id.in.length }
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        calls.update.push({ id: where.id, data })
        items = items.map((i) =>
          i.id === where.id ? { ...i, ...(data as Partial<ReminderItemRow>) } : i,
        )
        reminder = { ...reminder, items }
        return items.find((i) => i.id === where.id)
      }),
      findMany: vi.fn(async ({ where }: { where: { reminderId: string; tenantId: string } }) => {
        return items.filter(
          (i) => i.reminderId === where.reminderId && i.tenantId === where.tenantId,
        )
      }),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  } as unknown as RefreshPrisma

  return { prisma, calls, getItems: () => items, getReminder: () => reminder }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// Szenario A — no-op when nothing changed
describe("refreshDraftReminder — Szenario A (no-op)", () => {
  it("leaves openAmountAtReminder untouched when no payment has been recorded", async () => {
    const mock = buildMock({
      reminder: {
        id: REMINDER_ID,
        tenantId: TENANT,
        status: "DRAFT",
        totalOpenAmount: 300,
        totalInterest: 1,
        totalFees: 0,
        totalDue: 301,
        items: [
          baseItem({ id: "it-1", billingDocumentId: "doc-1", openAmountAtReminder: 100 }),
          baseItem({ id: "it-2", billingDocumentId: "doc-2", openAmountAtReminder: 200 }),
        ],
      },
      docs: [
        { id: "doc-1", tenantId: TENANT, totalGross: 100, payments: [], childDocuments: [] },
        { id: "doc-2", tenantId: TENANT, totalGross: 200, payments: [], childDocuments: [] },
      ],
    })

    await reminderService.refreshDraftReminder(mock.prisma, TENANT, REMINDER_ID)

    expect(mock.calls.deleteMany).toHaveLength(0)
    expect(mock.calls.update).toHaveLength(0)
    expect(mock.calls.headerUpdate).toHaveLength(0)
  })
})

// Szenario B — partial payment reduces openAmount
describe("refreshDraftReminder — Szenario B (partial payment)", () => {
  it("updates openAmountAtReminder for the partially paid invoice and nachzieht header sums", async () => {
    const mock = buildMock({
      reminder: {
        id: REMINDER_ID,
        tenantId: TENANT,
        status: "DRAFT",
        totalOpenAmount: 100,
        totalInterest: 0.5,
        totalFees: 5,
        totalDue: 105.5,
        items: [
          baseItem({
            id: "it-1",
            billingDocumentId: "doc-1",
            openAmountAtReminder: 100,
            interestAmount: 0.5,
            levelAtReminder: 2,
            daysOverdue: 25,
          }),
        ],
      },
      docs: [
        {
          id: "doc-1",
          tenantId: TENANT,
          totalGross: 100,
          payments: [{ status: "ACTIVE", amount: 40 }],
          childDocuments: [],
        },
      ],
    })

    await reminderService.refreshDraftReminder(mock.prisma, TENANT, REMINDER_ID)

    expect(mock.calls.update).toHaveLength(1)
    expect(mock.calls.update[0]).toEqual({
      id: "it-1",
      data: { openAmountAtReminder: 60 },
    })
    expect(mock.calls.headerUpdate).toHaveLength(1)
    expect(mock.calls.headerUpdate[0]).toEqual({
      totalOpenAmount: 60,
      totalInterest: 0.5,
      totalDue: 65.5,
    })

    // Szenario G: historical fields must not change.
    const it1 = mock.getItems().find((i) => i.id === "it-1")!
    expect(it1.levelAtReminder).toBe(2)
    expect(it1.daysOverdue).toBe(25)
    expect(it1.interestAmount).toBe(0.5)
  })
})

// Szenario C — fully paid item gets deleted, other item stays
describe("refreshDraftReminder — Szenario C (one fully paid, one open)", () => {
  it("deletes the fully paid item and keeps the other", async () => {
    const mock = buildMock({
      reminder: {
        id: REMINDER_ID,
        tenantId: TENANT,
        status: "DRAFT",
        totalOpenAmount: 300,
        totalInterest: 2,
        totalFees: 5,
        totalDue: 307,
        items: [
          baseItem({ id: "it-1", billingDocumentId: "doc-1", openAmountAtReminder: 100, interestAmount: 1 }),
          baseItem({ id: "it-2", billingDocumentId: "doc-2", openAmountAtReminder: 200, interestAmount: 1 }),
        ],
      },
      docs: [
        {
          id: "doc-1",
          tenantId: TENANT,
          totalGross: 100,
          payments: [{ status: "ACTIVE", amount: 100 }],
          childDocuments: [],
        },
        { id: "doc-2", tenantId: TENANT, totalGross: 200, payments: [], childDocuments: [] },
      ],
    })

    await reminderService.refreshDraftReminder(mock.prisma, TENANT, REMINDER_ID)

    expect(mock.calls.deleteMany).toHaveLength(1)
    expect(mock.calls.deleteMany[0]?.ids).toEqual(["it-1"])
    expect(mock.calls.update).toHaveLength(0)
    expect(mock.calls.headerUpdate).toHaveLength(1)
    expect(mock.calls.headerUpdate[0]).toEqual({
      totalOpenAmount: 200,
      totalInterest: 1,
      totalDue: 206,
    })
  })
})

// Szenario D — single fully-paid item, DRAFT bleibt leer sichtbar
describe("refreshDraftReminder — Szenario D (all items paid)", () => {
  it("removes the last item, leaves the draft empty with zero sums", async () => {
    const mock = buildMock({
      reminder: {
        id: REMINDER_ID,
        tenantId: TENANT,
        status: "DRAFT",
        totalOpenAmount: 100,
        totalInterest: 0,
        totalFees: 5,
        totalDue: 105,
        items: [
          baseItem({ id: "it-1", billingDocumentId: "doc-1", openAmountAtReminder: 100, interestAmount: 0 }),
        ],
      },
      docs: [
        {
          id: "doc-1",
          tenantId: TENANT,
          totalGross: 100,
          payments: [{ status: "ACTIVE", amount: 100 }],
          childDocuments: [],
        },
      ],
    })

    await reminderService.refreshDraftReminder(mock.prisma, TENANT, REMINDER_ID)

    expect(mock.calls.deleteMany).toHaveLength(1)
    expect(mock.calls.deleteMany[0]?.ids).toEqual(["it-1"])
    expect(mock.calls.headerUpdate[0]).toEqual({
      totalOpenAmount: 0,
      totalInterest: 0,
      totalDue: 5,
    })
    expect(mock.getItems()).toHaveLength(0)
  })
})

// Szenario E — SENT reminder: refresh is a no-op
describe("refreshDraftReminder — Szenario E (SENT)", () => {
  it("does nothing when the reminder is not in DRAFT", async () => {
    const mock = buildMock({
      reminder: {
        id: REMINDER_ID,
        tenantId: TENANT,
        status: "SENT",
        totalOpenAmount: 100,
        totalInterest: 0,
        totalFees: 0,
        totalDue: 100,
        items: [
          baseItem({ id: "it-1", billingDocumentId: "doc-1", openAmountAtReminder: 100 }),
        ],
      },
      docs: [
        {
          id: "doc-1",
          tenantId: TENANT,
          totalGross: 100,
          payments: [{ status: "ACTIVE", amount: 100 }],
          childDocuments: [],
        },
      ],
    })

    await reminderService.refreshDraftReminder(mock.prisma, TENANT, REMINDER_ID)

    expect(mock.calls.deleteMany).toHaveLength(0)
    expect(mock.calls.update).toHaveLength(0)
    expect(mock.calls.headerUpdate).toHaveLength(0)
  })
})

// Credit notes reduce the effective open amount
describe("refreshDraftReminder — credit notes", () => {
  it("subtracts active credit notes from totalGross when computing liveOpen", async () => {
    const mock = buildMock({
      reminder: {
        id: REMINDER_ID,
        tenantId: TENANT,
        status: "DRAFT",
        totalOpenAmount: 100,
        totalInterest: 0,
        totalFees: 0,
        totalDue: 100,
        items: [
          baseItem({ id: "it-1", billingDocumentId: "doc-1", openAmountAtReminder: 100, interestAmount: 0 }),
        ],
      },
      docs: [
        {
          id: "doc-1",
          tenantId: TENANT,
          totalGross: 100,
          payments: [],
          childDocuments: [
            { type: "CREDIT_NOTE", status: "FINAL", totalGross: 30 },
            { type: "CREDIT_NOTE", status: "CANCELLED", totalGross: 70 },
            { type: "INVOICE", status: "FINAL", totalGross: 999 },
          ],
        },
      ],
    })

    await reminderService.refreshDraftReminder(mock.prisma, TENANT, REMINDER_ID)

    expect(mock.calls.update).toHaveLength(1)
    expect(mock.calls.update[0]).toEqual({
      id: "it-1",
      data: { openAmountAtReminder: 70 },
    })
    expect(mock.calls.headerUpdate[0]).toEqual({
      totalOpenAmount: 70,
      totalInterest: 0,
      totalDue: 70,
    })
  })
})
