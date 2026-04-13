/**
 * D5 filter matrix for the dunning eligibility service.
 *
 * Tests both the exported `evaluateInvoice` (precision: per-case reason
 * reporting) and `listEligibleInvoices` (grouping + aggregation). Uses a
 * vitest-mocked Prisma surface — the integration path is covered by the
 * higher-level tRPC-router tests and the Playwright happy path in Phase 4.6.
 *
 * Each case constructs a minimally-realistic candidate document and asserts
 * the exact reason string that the filter chain reports. The order of the
 * chain matters — the first failing filter wins — so for the "all conditions
 * met" case we also verify that the subsequent interest computation runs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  evaluateInvoice,
  listEligibleInvoices,
  type EligibleInvoice,
} from "../reminder-eligibility-service"
import * as settingsService from "../reminder-settings-service"
import * as reminderLevelHelper from "../reminder-level-helper"

// Fixed "now" so days-overdue math stays deterministic.
const NOW = new Date("2026-04-13T12:00:00Z")

function daysAgo(n: number): Date {
  const d = new Date(NOW)
  d.setDate(d.getDate() - n)
  return d
}

const defaultSettings = {
  maxLevel: 3,
  interestEnabled: true,
  interestRatePercent: 9,
  feeAmounts: [0, 2.5, 5],
}

function buildDoc(
  overrides: Partial<{
    id: string
    number: string
    type: string
    paymentTermDays: number | null
    documentDate: Date
    totalGross: number
    payments: Array<{ amount: number; status: string }>
    childDocuments: Array<{ totalGross: number }>
    dunningBlocked: boolean
    address: {
      id?: string
      company?: string
      email?: string | null
      dunningBlocked?: boolean
    } | null
    addressId: string
    discountDays2: number | null
    discountPercent2: number | null
  }> = {}
) {
  return {
    id: overrides.id ?? "doc-1",
    number: overrides.number ?? "RE-100",
    type: overrides.type ?? "INVOICE",
    paymentTermDays:
      overrides.paymentTermDays === undefined ? 7 : overrides.paymentTermDays,
    documentDate: overrides.documentDate ?? daysAgo(30),
    totalGross: overrides.totalGross ?? 100,
    payments: overrides.payments ?? [],
    childDocuments: overrides.childDocuments ?? [],
    dunningBlocked: overrides.dunningBlocked ?? false,
    address:
      overrides.address === undefined
        ? {
            id: "addr-1",
            company: "Acme GmbH",
            email: "billing@acme.test",
            dunningBlocked: false,
          }
        : overrides.address,
    addressId: overrides.addressId ?? "addr-1",
    discountDays2: overrides.discountDays2 ?? null,
    discountPercent2: overrides.discountPercent2 ?? null,
  }
}

// --- evaluateInvoice (per-case reason reporting) ---

describe("evaluateInvoice — D5 filter matrix", () => {
  let prismaMock: {
    reminderItem: { findFirst: ReturnType<typeof vi.fn> }
  }

  beforeEach(() => {
    prismaMock = {
      reminderItem: {
        findFirst: vi.fn().mockResolvedValue(null), // level 0 by default
      },
    }
  })

  it("paymentTermDays=null → no_payment_term", async () => {
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({ paymentTermDays: null }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("no_payment_term")
  })

  it("type=OFFER → wrong_type", async () => {
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({ type: "OFFER" }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("wrong_type")
  })

  it("billingDocument.dunningBlocked=true → invoice_blocked", async () => {
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({ dunningBlocked: true }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("invoice_blocked")
  })

  it("customerAddress.dunningBlocked=true → customer_blocked", async () => {
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({
        address: {
          id: "addr-1",
          company: "Acme GmbH",
          email: "x@x",
          dunningBlocked: true,
        },
      }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("customer_blocked")
  })

  it("daysOverdue < gracePeriod → in_grace_period", async () => {
    // documentDate 10 days ago + 7-day term → due 3 days ago → daysOverdue=3,
    // below the 7-day first-level grace period.
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({ documentDate: daysAgo(10), paymentTermDays: 7 }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("in_grace_period")
  })

  it("not yet due at all (dueDate > now) → not_overdue_yet", async () => {
    // documentDate yesterday + 30-day term → due in +29 days
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({ documentDate: daysAgo(1), paymentTermDays: 30 }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("not_overdue_yet")
  })

  it("openAmount=0 after payments → fully_paid", async () => {
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({
        totalGross: 100,
        payments: [{ amount: 100, status: "ACTIVE" }],
      }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("fully_paid")
  })

  it("cancelled payments don't reduce openAmount", async () => {
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({
        totalGross: 100,
        payments: [
          { amount: 100, status: "CANCELLED" }, // ignored
        ],
      }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("ok")
    expect(result.openAmount).toBe(100)
  })

  it("credit note reduces openAmount", async () => {
    // 100 EUR invoice, 100 EUR credit note → fully settled
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({
        totalGross: 100,
        childDocuments: [{ totalGross: 100 }],
      }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("fully_paid")
  })

  it("active skonto tier 2 window still open → in_discount_period", async () => {
    // documentDate 30 days ago, discountDays2=60 → skonto deadline 30 days from now
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({
        documentDate: daysAgo(30),
        paymentTermDays: 14,
        discountDays2: 60,
        discountPercent2: 2,
      }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("in_discount_period")
  })

  it("expired skonto tier 2 → falls through to normal eligibility", async () => {
    // documentDate 30 days ago, discountDays2=10 → skonto expired 20 days ago
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({
        documentDate: daysAgo(30),
        paymentTermDays: 14,
        discountDays2: 10,
        discountPercent2: 2,
      }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("ok")
  })

  it("currentLevel >= maxLevel → max_level_reached", async () => {
    prismaMock.reminderItem.findFirst.mockResolvedValueOnce({
      levelAtReminder: 3,
    })
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc(),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("max_level_reached")
  })

  it("all conditions met → ok with target level = currentLevel + 1", async () => {
    prismaMock.reminderItem.findFirst.mockResolvedValueOnce({
      levelAtReminder: 1,
    })
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({
        documentDate: daysAgo(30),
        paymentTermDays: 7,
        totalGross: 100,
      }),
      defaultSettings,
      NOW,
      7
    )
    expect(result.reason).toBe("ok")
    expect(result.currentLevel).toBe(1)
    expect(result.targetLevel).toBe(2)
    expect(result.openAmount).toBe(100)
    // documentDate=daysAgo(30), paymentTermDays=7 → due = daysAgo(23).
    // Math.floor of the ms diff can land on 22 or 23 depending on the
    // exact second of "now" vs the document date, so we accept both.
    expect(result.daysOverdue).toBeGreaterThanOrEqual(22)
    expect(result.daysOverdue).toBeLessThanOrEqual(23)
    expect(result.interestAmount).toBeGreaterThan(0)
  })

  it("interest disabled → interestAmount=0 even for overdue invoices", async () => {
    const result = await evaluateInvoice(
      prismaMock as never,
      buildDoc({
        documentDate: daysAgo(30),
        paymentTermDays: 7,
        totalGross: 100,
      }),
      { ...defaultSettings, interestEnabled: false },
      NOW,
      7
    )
    expect(result.reason).toBe("ok")
    expect(result.interestAmount).toBe(0)
  })
})

// --- listEligibleInvoices (grouping, aggregation, disabled short-circuit) ---

function buildListPrismaMock(docs: Array<ReturnType<typeof buildDoc>>) {
  return {
    reminderSettings: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    billingDocument: {
      findMany: vi.fn().mockResolvedValue(docs),
    },
    reminderItem: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  }
}

describe("listEligibleInvoices", () => {
  const tenantId = "tenant-1"

  beforeEach(() => {
    vi.restoreAllMocks()
    // Skip the level helper DB call so we don't need a real prisma surface.
    vi.spyOn(
      reminderLevelHelper,
      "getCurrentDunningLevel"
    ).mockResolvedValue(0)
  })

  it("returns [] when dunning is disabled", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
      enabled: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    const prisma = buildListPrismaMock([])
    const groups = await listEligibleInvoices(prisma as never, tenantId)
    expect(groups).toEqual([])
    expect(prisma.billingDocument.findMany).not.toHaveBeenCalled()
  })

  it("groups eligible invoices by customer + applies fee once", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
      enabled: true,
      maxLevel: 3,
      gracePeriodDays: [7, 14, 21],
      feeAmounts: [0, 2.5, 5],
      interestEnabled: true,
      interestRatePercent: 9,
      feesEnabled: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const prisma = buildListPrismaMock([
      buildDoc({
        id: "doc-1",
        number: "RE-1",
        documentDate: daysAgo(30),
        paymentTermDays: 7,
        totalGross: 100,
      }),
      buildDoc({
        id: "doc-2",
        number: "RE-2",
        documentDate: daysAgo(45),
        paymentTermDays: 7,
        totalGross: 200,
      }),
    ])

    const groups = await listEligibleInvoices(prisma as never, tenantId)
    expect(groups).toHaveLength(1)
    const group = groups[0]!
    expect(group.customerAddressId).toBe("addr-1")
    expect(group.invoices).toHaveLength(2)
    expect(group.totalOpenAmount).toBe(300)
    // Fee at level 1 = 0
    expect(group.totalFees).toBe(0)
    expect(group.totalDue).toBeGreaterThan(300)
  })

  it("escalates group target level to max across its invoices", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
      enabled: true,
      maxLevel: 3,
      gracePeriodDays: [7, 14, 21],
      feeAmounts: [0, 2.5, 5],
      interestEnabled: true,
      interestRatePercent: 9,
      feesEnabled: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    // First invoice at current level 0 → target 1
    // Second invoice at current level 1 → target 2
    let call = 0
    vi.spyOn(reminderLevelHelper, "getCurrentDunningLevel").mockImplementation(
      async () => (call++ === 0 ? 0 : 1)
    )

    const prisma = buildListPrismaMock([
      buildDoc({
        id: "doc-1",
        number: "RE-1",
        documentDate: daysAgo(30),
        paymentTermDays: 7,
      }),
      buildDoc({
        id: "doc-2",
        number: "RE-2",
        documentDate: daysAgo(30),
        paymentTermDays: 7,
      }),
    ])

    const groups = await listEligibleInvoices(prisma as never, tenantId)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.groupTargetLevel).toBe(2)
    // Fee for level 2 = 2.5
    expect(groups[0]!.totalFees).toBe(2.5)
  })

  it("filters out non-eligible invoices silently", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
      enabled: true,
      maxLevel: 3,
      gracePeriodDays: [7, 14, 21],
      feeAmounts: [0, 2.5, 5],
      interestEnabled: true,
      interestRatePercent: 9,
      feesEnabled: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const prisma = buildListPrismaMock([
      buildDoc({
        id: "doc-ok",
        number: "RE-1",
        documentDate: daysAgo(30),
        paymentTermDays: 7,
      }),
      // Blocked → should be filtered
      buildDoc({
        id: "doc-blocked",
        number: "RE-2",
        dunningBlocked: true,
        documentDate: daysAgo(30),
      }),
    ])

    const groups = await listEligibleInvoices(prisma as never, tenantId)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.invoices).toHaveLength(1)
    expect(
      (groups[0]!.invoices[0] as EligibleInvoice).billingDocumentId
    ).toBe("doc-ok")
  })

  it("returns groups sorted by customer name", async () => {
    vi.spyOn(settingsService, "getSettings").mockResolvedValueOnce({
      enabled: true,
      maxLevel: 3,
      gracePeriodDays: [7, 14, 21],
      feeAmounts: [0, 2.5, 5],
      interestEnabled: true,
      interestRatePercent: 9,
      feesEnabled: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const prisma = buildListPrismaMock([
      buildDoc({
        id: "doc-z",
        number: "RE-Z",
        addressId: "addr-z",
        address: {
          id: "addr-z",
          company: "Zeta AG",
          email: "z@z",
          dunningBlocked: false,
        },
        documentDate: daysAgo(30),
      }),
      buildDoc({
        id: "doc-a",
        number: "RE-A",
        addressId: "addr-a",
        address: {
          id: "addr-a",
          company: "Alpha GmbH",
          email: "a@a",
          dunningBlocked: false,
        },
        documentDate: daysAgo(30),
      }),
    ])

    const groups = await listEligibleInvoices(prisma as never, tenantId)
    expect(groups.map((g) => g.customerName)).toEqual([
      "Alpha GmbH",
      "Zeta AG",
    ])
  })
})
