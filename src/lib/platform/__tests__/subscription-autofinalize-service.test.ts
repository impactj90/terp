import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"

vi.mock("@/lib/services/billing-document-service", () => ({
  finalize: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/lib/platform/audit-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("../subscription-service", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    sweepEndedSubscriptions: vi.fn().mockResolvedValue(0),
  }
})

import * as billingDocService from "@/lib/services/billing-document-service"
import * as platformAudit from "@/lib/platform/audit-service"
import * as subscriptionService from "../subscription-service"
import { autofinalizePending } from "../subscription-autofinalize-service"

const OPERATOR_TENANT_ID = "10000000-0000-0000-0000-000000000001"
const SUB_ID_A = "50000000-0000-0000-0000-000000000001"
const SUB_ID_B = "50000000-0000-0000-0000-000000000002"
const RI_ID = "40000000-0000-0000-0000-000000000001"
const DRAFT_ID = "d0000000-0000-0000-0000-000000000001"

type SubRow = {
  id: string
  billingRecurringInvoiceId: string | null
  lastGeneratedInvoiceId: string | null
}

type RecurringRow = {
  lastGeneratedAt: Date | null
}

function createMockPrisma(opts: {
  subs: SubRow[]
  recurring?: RecurringRow | null
  draftInvoice?: { id: string } | null
  recurringByIdMap?: Map<string, RecurringRow>
  draftBySubId?: Map<string, { id: string } | null>
}) {
  const subscriptionUpdates: Array<Record<string, unknown>> = []
  // Tracks doc ids whose status should now report as PRINTED — simulates
  // the real DB state change triggered by billingDocService.finalize()
  // between iterations of the autofinalize loop.
  const finalizedDocIds = new Set<string>()

  // Hook the finalize mock so its calls flip the simulated status.
  vi.mocked(billingDocService.finalize).mockImplementation(
    (async (_prisma: unknown, _tenantId: string, id: string) => {
      finalizedDocIds.add(id)
      return undefined
    }) as unknown as typeof billingDocService.finalize,
  )

  function withStatus(
    doc: { id: string } | null,
  ): { id: string; status: string } | null {
    if (!doc) return null
    return {
      id: doc.id,
      status: finalizedDocIds.has(doc.id) ? "PRINTED" : "DRAFT",
    }
  }

  const prisma = {
    platformSubscription: {
      findMany: vi.fn().mockResolvedValue(opts.subs),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string }
          data: Record<string, unknown>
        }) => {
          subscriptionUpdates.push({ id: where.id, ...data })
          return {}
        },
      ),
    },
    billingRecurringInvoice: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string } }) => {
          if (opts.recurringByIdMap) {
            return opts.recurringByIdMap.get(where.id) ?? null
          }
          return opts.recurring ?? null
        },
      ),
    },
    billingDocument: {
      findFirst: vi.fn(
        async ({ where }: { where: { internalNotes: { contains: string } } }) => {
          if (opts.draftBySubId) {
            for (const [subId, draft] of opts.draftBySubId) {
              if (where.internalNotes.contains.includes(subId)) {
                return withStatus(draft)
              }
            }
            return null
          }
          return withStatus(opts.draftInvoice ?? null)
        },
      ),
    },
  } as unknown as PrismaClient & {
    __subscriptionUpdates: Array<Record<string, unknown>>
  }
  ;(prisma as unknown as { __subscriptionUpdates: unknown }).__subscriptionUpdates =
    subscriptionUpdates
  return prisma
}

describe("subscription-autofinalize-service", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", OPERATOR_TENANT_ID)
    vi.clearAllMocks()
    vi.mocked(subscriptionService.sweepEndedSubscriptions).mockResolvedValue(0)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("returns a zeroed summary when env var unset", async () => {
    vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", "")
    const prisma = createMockPrisma({ subs: [] })
    const summary = await autofinalizePending(prisma, new Date())
    expect(summary.operatorTenantId).toBeNull()
    expect(summary.scanned).toBe(0)
    expect(summary.finalized).toBe(0)
    expect(prisma.platformSubscription.findMany).not.toHaveBeenCalled()
  })

  it("only queries active subscriptions", async () => {
    const prisma = createMockPrisma({ subs: [] })
    await autofinalizePending(prisma, new Date())
    expect(prisma.platformSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "active" }),
      }),
    )
  })

  it("skips subscriptions with lastGeneratedAt < today (skippedNotDueToday)", async () => {
    const yesterday = new Date("2026-04-09T12:00:00Z")
    const now = new Date("2026-04-10T04:15:00Z")
    const prisma = createMockPrisma({
      subs: [
        {
          id: SUB_ID_A,
          billingRecurringInvoiceId: RI_ID,
          lastGeneratedInvoiceId: null,
        },
      ],
      recurring: { lastGeneratedAt: yesterday },
    })
    const summary = await autofinalizePending(prisma, now)
    expect(summary.skippedNotDueToday).toBe(1)
    expect(summary.finalized).toBe(0)
    expect(billingDocService.finalize).not.toHaveBeenCalled()
  })

  it("skips and warns when no DRAFT found for marker", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const todayNoon = new Date("2026-04-10T12:00:00Z")
    const now = new Date("2026-04-10T16:00:00Z")
    const prisma = createMockPrisma({
      subs: [
        {
          id: SUB_ID_A,
          billingRecurringInvoiceId: RI_ID,
          lastGeneratedInvoiceId: null,
        },
      ],
      recurring: { lastGeneratedAt: todayNoon },
      draftInvoice: null,
    })
    const summary = await autofinalizePending(prisma, now)
    expect(summary.skippedNoDraftFound).toBe(1)
    expect(warnSpy).toHaveBeenCalled()
    const warnMsg = warnSpy.mock.calls[0]![0] as string
    expect(warnMsg).toContain(SUB_ID_A)
    expect(warnMsg).toContain("[platform_subscription:")
    warnSpy.mockRestore()
  })

  it("skips when DRAFT id already equals lastGeneratedInvoiceId", async () => {
    const todayNoon = new Date("2026-04-10T12:00:00Z")
    const now = new Date("2026-04-10T16:00:00Z")
    const prisma = createMockPrisma({
      subs: [
        {
          id: SUB_ID_A,
          billingRecurringInvoiceId: RI_ID,
          lastGeneratedInvoiceId: DRAFT_ID,
        },
      ],
      recurring: { lastGeneratedAt: todayNoon },
      draftInvoice: { id: DRAFT_ID },
    })
    const summary = await autofinalizePending(prisma, now)
    expect(summary.skippedAlreadyFinalized).toBe(1)
    expect(billingDocService.finalize).not.toHaveBeenCalled()
  })

  it("finalizes + updates pointer + writes audit log", async () => {
    const todayNoon = new Date("2026-04-10T12:00:00Z")
    const now = new Date("2026-04-10T16:00:00Z")
    const prisma = createMockPrisma({
      subs: [
        {
          id: SUB_ID_A,
          billingRecurringInvoiceId: RI_ID,
          lastGeneratedInvoiceId: null,
        },
      ],
      recurring: { lastGeneratedAt: todayNoon },
      draftInvoice: { id: DRAFT_ID },
    })
    const summary = await autofinalizePending(prisma, now)
    expect(summary.finalized).toBe(1)
    expect(summary.subscriptionPointersUpdated).toBe(1)
    expect(billingDocService.finalize).toHaveBeenCalledWith(
      prisma,
      OPERATOR_TENANT_ID,
      DRAFT_ID,
      expect.any(String),
    )
    expect(prisma.platformSubscription.update).toHaveBeenCalledWith({
      where: { id: SUB_ID_A },
      data: { lastGeneratedInvoiceId: DRAFT_ID },
    })
    expect(platformAudit.log).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        action: "subscription.invoice_auto_finalized",
        metadata: expect.objectContaining({
          subscriptionId: SUB_ID_A,
          sharedDoc: "finalized-this-run",
        }),
      }),
    )
  })

  it("uses contains marker query", async () => {
    const todayNoon = new Date("2026-04-10T12:00:00Z")
    const prisma = createMockPrisma({
      subs: [
        {
          id: SUB_ID_A,
          billingRecurringInvoiceId: RI_ID,
          lastGeneratedInvoiceId: null,
        },
      ],
      recurring: { lastGeneratedAt: todayNoon },
      draftInvoice: { id: DRAFT_ID },
    })
    await autofinalizePending(prisma, new Date("2026-04-10T16:00:00Z"))
    const call = (prisma.billingDocument.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      where: { internalNotes: { contains: string }; tenantId: string }
    }
    expect(call.where.internalNotes.contains).toContain(
      `[platform_subscription:${SUB_ID_A}]`,
    )
    expect(call.where.tenantId).toBe(OPERATOR_TENANT_ID)
  })

  it("defense-in-depth tenantId filter on recurring findFirst", async () => {
    const prisma = createMockPrisma({ subs: [
      {
        id: SUB_ID_A,
        billingRecurringInvoiceId: RI_ID,
        lastGeneratedInvoiceId: null,
      },
    ], recurring: null })
    await autofinalizePending(prisma, new Date())
    const call = (prisma.billingRecurringInvoice.findFirst as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      where: { tenantId: string }
    }
    expect(call.where.tenantId).toBe(OPERATOR_TENANT_ID)
  })

  it("shared-doc idempotency: finalize called once; pointers updated for both; audit metadata reflects branch", async () => {
    const todayNoon = new Date("2026-04-10T12:00:00Z")
    const now = new Date("2026-04-10T16:00:00Z")
    const recurringByIdMap = new Map<string, RecurringRow>([
      [RI_ID, { lastGeneratedAt: todayNoon }],
    ])
    // Both subs resolve to the SAME draft.
    const draftBySubId = new Map<string, { id: string } | null>([
      [SUB_ID_A, { id: DRAFT_ID }],
      [SUB_ID_B, { id: DRAFT_ID }],
    ])
    const prisma = createMockPrisma({
      subs: [
        {
          id: SUB_ID_A,
          billingRecurringInvoiceId: RI_ID,
          lastGeneratedInvoiceId: null,
        },
        {
          id: SUB_ID_B,
          billingRecurringInvoiceId: RI_ID,
          lastGeneratedInvoiceId: null,
        },
      ],
      recurringByIdMap,
      draftBySubId,
    })

    const summary = await autofinalizePending(prisma, now)

    expect(summary.finalized).toBe(1)
    expect(summary.subscriptionPointersUpdated).toBe(2)
    expect(summary.skippedSharedDocAlreadyFinalizedThisRun).toBe(1)
    expect(billingDocService.finalize).toHaveBeenCalledTimes(1)

    // Audit metadata correctness: first sub = finalized-this-run, second = already-finalized-this-run
    const auditCalls = (platformAudit.log as ReturnType<typeof vi.fn>).mock.calls
    expect(auditCalls).toHaveLength(2)
    const firstMeta = (auditCalls[0]![1] as { metadata: { sharedDoc: string; subscriptionId: string } }).metadata
    const secondMeta = (auditCalls[1]![1] as { metadata: { sharedDoc: string; subscriptionId: string } }).metadata
    expect(firstMeta.sharedDoc).toBe("finalized-this-run")
    expect(firstMeta.subscriptionId).toBe(SUB_ID_A)
    expect(secondMeta.sharedDoc).toBe("already-finalized-this-run")
    expect(secondMeta.subscriptionId).toBe(SUB_ID_B)
  })

  it("continues on per-subscription failure", async () => {
    const todayNoon = new Date("2026-04-10T12:00:00Z")
    ;(billingDocService.finalize as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined)

    const recurringByIdMap = new Map<string, RecurringRow>([
      [RI_ID, { lastGeneratedAt: todayNoon }],
      ["ri-2", { lastGeneratedAt: todayNoon }],
    ])
    const draftBySubId = new Map<string, { id: string } | null>([
      [SUB_ID_A, { id: "draft-a" }],
      [SUB_ID_B, { id: "draft-b" }],
    ])
    const prisma = createMockPrisma({
      subs: [
        {
          id: SUB_ID_A,
          billingRecurringInvoiceId: RI_ID,
          lastGeneratedInvoiceId: null,
        },
        {
          id: SUB_ID_B,
          billingRecurringInvoiceId: "ri-2",
          lastGeneratedInvoiceId: null,
        },
      ],
      recurringByIdMap,
      draftBySubId,
    })
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const summary = await autofinalizePending(prisma, new Date("2026-04-10T16:00:00Z"))
    expect(summary.finalizeFailed).toBe(1)
    expect(summary.finalized).toBe(1)
    errSpy.mockRestore()
  })

  it("calls sweepEndedSubscriptions at the end even when no subs processed", async () => {
    const prisma = createMockPrisma({ subs: [] })
    await autofinalizePending(prisma, new Date())
    expect(subscriptionService.sweepEndedSubscriptions).toHaveBeenCalledWith(prisma)
  })
})
