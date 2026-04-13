import { describe, it, expect, vi, beforeEach } from "vitest"
import { getNextReminderNumber, ReminderValidationError } from "../reminder-service"
import * as reminderService from "../reminder-service"
import * as eligibilityService from "../reminder-eligibility-service"
import * as templateService from "../reminder-template-service"
import * as settingsService from "../reminder-settings-service"

type AnyPrisma = Parameters<typeof getNextReminderNumber>[0]

describe("getNextReminderNumber", () => {
  it("formats as MA-YYYY-NNN with zero padding", async () => {
    const upsert = vi.fn().mockResolvedValue({ nextValue: 8 })
    const prisma = {
      numberSequence: { upsert },
    } as unknown as AnyPrisma
    const result = await getNextReminderNumber(
      prisma,
      "tenant-1",
      new Date("2026-04-13T10:00:00Z")
    )
    expect(result).toBe("MA-2026-007")
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_key: { tenantId: "tenant-1", key: "dunning_2026" } },
      })
    )
  })

  it("uses a per-year sequence key — keys differ by year", async () => {
    const upsert = vi.fn().mockResolvedValue({ nextValue: 2 })
    const prisma = {
      numberSequence: { upsert },
    } as unknown as AnyPrisma
    await getNextReminderNumber(prisma, "tenant-1", new Date("2027-01-02"))
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId_key: { tenantId: "tenant-1", key: "dunning_2027" } },
        create: expect.objectContaining({ prefix: "MA-2027-" }),
      })
    )
  })

  it("pads three-digit minimum width", async () => {
    const upsert = vi.fn().mockResolvedValue({ nextValue: 1235 })
    const prisma = {
      numberSequence: { upsert },
    } as unknown as AnyPrisma
    const result = await getNextReminderNumber(
      prisma,
      "tenant-1",
      new Date("2026-04-13")
    )
    expect(result).toBe("MA-2026-1234")
  })
})

// --- createRun: business logic with mocked dependencies ---

function buildPrismaMock(opts: {
  liveGroups: eligibilityService.EligibleCustomerGroup[]
  draftExistsFor?: Set<string>
  templateForLevel?: { headerText: string; footerText: string } | null
}) {
  const draftExists = opts.draftExistsFor ?? new Set<string>()
  const created: Array<Record<string, unknown>> = []
  const reminderItemFindFirst = vi
    .fn()
    .mockImplementation(
      async ({ where }: { where: { billingDocumentId: string } }) => {
        return draftExists.has(where.billingDocumentId)
          ? { id: "existing" }
          : null
      }
    )
  const reminderCreate = vi.fn().mockImplementation(async ({ data }) => {
    const id = `reminder-${created.length + 1}`
    created.push({ id, ...data })
    return { id, ...data, items: data.items?.create ?? [] }
  })
  const numberSequenceUpsert = vi
    .fn()
    .mockImplementation(async () => ({ nextValue: 2 }))
  const crmAddressFindUnique = vi
    .fn()
    .mockResolvedValue({ id: "addr-1", company: "Acme GmbH" })
  const transactionImpl = vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => unknown) => {
      // Pass through self as the tx — the service wraps it as PrismaClient.
      return await fn(prisma)
    })

  const prisma = {
    $transaction: transactionImpl,
    reminder: { create: reminderCreate, findFirst: vi.fn(), update: vi.fn() },
    reminderItem: { findFirst: reminderItemFindFirst },
    numberSequence: { upsert: numberSequenceUpsert },
    crmAddress: { findUnique: crmAddressFindUnique },
  } as unknown as Parameters<typeof reminderService.createRun>[0]

  return { prisma, created, reminderCreate, reminderItemFindFirst }
}

const liveGroup1: eligibilityService.EligibleCustomerGroup = {
  customerAddressId: "addr-1",
  customerName: "Acme GmbH",
  customerEmail: "billing@acme.test",
  groupTargetLevel: 1,
  invoices: [
    {
      billingDocumentId: "doc-1",
      invoiceNumber: "RE-100",
      invoiceDate: new Date("2026-03-01"),
      dueDate: new Date("2026-03-15"),
      daysOverdue: 29,
      openAmount: 100,
      currentLevel: 0,
      targetLevel: 1,
      interestAmount: 0.71,
      feeAmount: 0,
      reason: "ok",
    },
  ],
  totalOpenAmount: 100,
  totalInterest: 0.71,
  totalFees: 0,
  totalDue: 100.71,
}

beforeEach(() => {
  vi.spyOn(settingsService, "getSettings").mockResolvedValue({
    id: "rs",
    tenantId: "t",
    enabled: true,
    maxLevel: 3,
    gracePeriodDays: [7, 14, 21],
    feeAmounts: [0, 2.5, 5],
    interestEnabled: true,
    interestRatePercent: 9,
    feesEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
  vi.spyOn(eligibilityService, "listEligibleInvoices").mockResolvedValue([
    liveGroup1,
  ])
  vi.spyOn(templateService, "getDefaultForLevel").mockResolvedValue({
    id: "tpl-1",
    tenantId: "t",
    name: "Stufe 1",
    level: 1,
    headerText: "{{briefanrede}} — Test",
    footerText: "Best regards",
    emailSubject: "",
    emailBody: "",
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
})

describe("createRun", () => {
  it("returns empty result for an empty input", async () => {
    const { prisma } = buildPrismaMock({ liveGroups: [liveGroup1] })
    const result = await reminderService.createRun(prisma, "t", { groups: [] }, "user-1")
    expect(result).toEqual({ reminderIds: [], skippedInvoices: [] })
  })

  it("creates a reminder for an eligible invoice", async () => {
    const { prisma, reminderCreate } = buildPrismaMock({
      liveGroups: [liveGroup1],
    })
    const result = await reminderService.createRun(
      prisma,
      "t",
      {
        groups: [
          {
            customerAddressId: "addr-1",
            billingDocumentIds: ["doc-1"],
          },
        ],
      },
      "user-1"
    )
    expect(result.reminderIds).toHaveLength(1)
    expect(result.skippedInvoices).toHaveLength(0)
    expect(reminderCreate).toHaveBeenCalledOnce()
  })

  it("skips invoices that are not in the live eligibility result", async () => {
    const { prisma, reminderCreate } = buildPrismaMock({
      liveGroups: [liveGroup1],
    })
    const result = await reminderService.createRun(
      prisma,
      "t",
      {
        groups: [
          {
            customerAddressId: "addr-1",
            billingDocumentIds: ["doc-1", "doc-not-in-live"],
          },
        ],
      },
      "user-1"
    )
    expect(result.skippedInvoices).toHaveLength(1)
    expect(result.skippedInvoices[0]).toEqual({
      billingDocumentId: "doc-not-in-live",
      reason: "not_eligible",
    })
    expect(reminderCreate).toHaveBeenCalledOnce()
  })

  it("sequential guard: a second createRun for the same invoice is skipped", async () => {
    // First call: nothing exists yet, the reminder is created.
    const draftSet = new Set<string>()
    const { prisma, reminderCreate, reminderItemFindFirst } = buildPrismaMock({
      liveGroups: [liveGroup1],
      draftExistsFor: draftSet,
    })

    // After the first call seeds the reminder, the next hasDraft check
    // returns true. We simulate this by toggling the set after the
    // first reminderCreate call.
    reminderCreate.mockImplementationOnce(async ({ data }) => {
      draftSet.add("doc-1")
      return {
        id: "reminder-1",
        ...data,
        items: data.items?.create ?? [],
      }
    })

    const first = await reminderService.createRun(
      prisma,
      "t",
      {
        groups: [
          { customerAddressId: "addr-1", billingDocumentIds: ["doc-1"] },
        ],
      },
      "user-1"
    )
    const second = await reminderService.createRun(
      prisma,
      "t",
      {
        groups: [
          { customerAddressId: "addr-1", billingDocumentIds: ["doc-1"] },
        ],
      },
      "user-1"
    )

    expect(first.reminderIds).toHaveLength(1)
    expect(second.reminderIds).toHaveLength(0)
    expect(second.skippedInvoices).toEqual([
      { billingDocumentId: "doc-1", reason: "draft_already_exists" },
    ])
    // hasDraftItemForInvoice should have been called for both runs.
    expect(reminderItemFindFirst).toHaveBeenCalledTimes(2)
  })

  it("throws when dunning is disabled", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
      enabled: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const { prisma } = buildPrismaMock({ liveGroups: [] })
    await expect(
      reminderService.createRun(
        prisma,
        "t",
        {
          groups: [
            { customerAddressId: "addr-1", billingDocumentIds: ["doc-1"] },
          ],
        },
        "user-1"
      )
    ).rejects.toThrow(ReminderValidationError)
  })
})

// --- Race condition: parallel createRun for the same invoice ---

/**
 * Simulates two operators clicking "Mahnungen erstellen" simultaneously.
 * The mock `$transaction` uses a Promise-chain mutex so both transaction
 * callbacks run serially — this approximates PostgreSQL's behavior, where
 * a second transaction touching the same shared state would block until
 * the first commits. Under serialization, the second call's
 * `hasDraftItemForInvoice` correctly observes the first call's insert
 * and skips the invoice with `draft_already_exists`. Without this guard,
 * two DRAFT reminders could collide for the same invoice.
 *
 * Full wall-clock parallelism (both calls racing at the storage level
 * without any serialization) is not defended against by the application
 * code — the plan documents this as an accepted limitation in Phase 1.11
 * ("So verhindert das zweite parallele Call kein Doppel-Insert") because
 * the common case is an operator double-click, which this mutex-serialized
 * test models correctly.
 */
describe("createRun — parallel race", () => {
  it("two Promise.all calls for the same invoice yield at most one DRAFT reminder", async () => {
    const draftSet = new Set<string>()
    let nextReminderId = 1

    const reminderItemFindFirst = vi
      .fn()
      .mockImplementation(
        async ({ where }: { where: { billingDocumentId: string } }) => {
          return draftSet.has(where.billingDocumentId)
            ? { id: "existing" }
            : null
        }
      )
    const reminderCreate = vi.fn().mockImplementation(async ({ data }) => {
      for (const item of data.items?.create ?? []) {
        draftSet.add(item.billingDocumentId)
      }
      const id = `reminder-${nextReminderId++}`
      return { id, ...data, items: data.items?.create ?? [] }
    })
    const numberSequenceUpsert = vi
      .fn()
      .mockImplementation(async () => ({ nextValue: nextReminderId + 1 }))
    const crmAddressFindUnique = vi
      .fn()
      .mockResolvedValue({ id: "addr-1", company: "Acme GmbH" })

    // Mutex: the next $transaction awaits the previous one to finish.
    // Models Postgres serializable isolation at the mock boundary.
    let lock: Promise<void> = Promise.resolve()
    const transactionImpl = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => unknown) => {
        const prev = lock
        let release: () => void = () => {}
        lock = new Promise<void>((r) => {
          release = r
        })
        await prev
        try {
          return await fn(prisma)
        } finally {
          release()
        }
      })

    const prisma = {
      $transaction: transactionImpl,
      reminder: {
        create: reminderCreate,
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      reminderItem: { findFirst: reminderItemFindFirst },
      numberSequence: { upsert: numberSequenceUpsert },
      crmAddress: { findUnique: crmAddressFindUnique },
    } as unknown as Parameters<typeof reminderService.createRun>[0]

    vi.spyOn(eligibilityService, "listEligibleInvoices").mockResolvedValue([
      liveGroup1,
    ])

    const input = {
      groups: [
        { customerAddressId: "addr-1", billingDocumentIds: ["doc-1"] },
      ],
    }

    const [result1, result2] = await Promise.all([
      reminderService.createRun(prisma, "t", input, "user-1"),
      reminderService.createRun(prisma, "t", input, "user-2"),
    ])

    const totalCreated =
      result1.reminderIds.length + result2.reminderIds.length
    const totalSkipped =
      result1.skippedInvoices.length + result2.skippedInvoices.length

    expect(totalCreated).toBe(1)
    expect(totalSkipped).toBe(1)
    const allSkipReasons = [
      ...result1.skippedInvoices,
      ...result2.skippedInvoices,
    ].map((s) => s.reason)
    expect(allSkipReasons).toContain("draft_already_exists")
    expect(reminderCreate).toHaveBeenCalledTimes(1)
    expect(draftSet.size).toBe(1)
    expect(draftSet.has("doc-1")).toBe(true)
  })
})
