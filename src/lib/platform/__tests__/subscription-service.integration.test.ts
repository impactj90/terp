/**
 * End-to-end integration tests for the Phase 10a subscription billing
 * bridge. Runs against the local Supabase Postgres (DATABASE_URL in
 * .env.local). Skipped if DATABASE_URL is not set.
 *
 * Each test uses dedicated operator + customer tenants (unique UUIDs) so
 * the suite never touches dev seed data. Fixtures are created once in
 * beforeAll and torn down in afterAll in dependency order. beforeEach
 * resets per-customer state.
 *
 * PDF + e-invoice generation inside billing-document-service.finalize()
 * is mocked at the module boundary to avoid touching Supabase storage —
 * we only care that status transitions DRAFT → PRINTED and that pointers
 * are updated.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

vi.mock("@/lib/services/billing-document-pdf-service", () => ({
  generateAndStorePdf: vi.fn().mockResolvedValue(undefined),
  getSignedDownloadUrl: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/lib/services/billing-document-einvoice-service", () => ({
  generateAndStoreEInvoice: vi.fn().mockResolvedValue(undefined),
}))

import { prisma } from "@/lib/db/prisma"
import { PLATFORM_SYSTEM_USER_ID } from "@/trpc/init"
import * as subscriptionService from "../subscription-service"
import * as autofinalize from "../subscription-autofinalize-service"
import * as billingRecurringService from "@/lib/services/billing-recurring-invoice-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

// Dedicated test tenants — unique ids so cleanup is scoped.
const OPERATOR_TENANT_ID = "f1000000-0000-4000-a000-000000000001"
const CUSTOMER_TENANT_ID = "f2000000-0000-4000-a000-000000000001"
const CUSTOMER_TENANT_ID_2 = "f2000000-0000-4000-a000-000000000002"

async function cleanupForTenantPair(
  operatorTenantId: string,
  customerTenantIds: string[],
) {
  // Delete platform_subscriptions first (it references the operator tenant's
  // crm_addresses, billing_recurring_invoices, and billing_documents via
  // ON DELETE SET NULL — so the order doesn't strictly matter, but deleting
  // subs first keeps the scope tight).
  await prisma.platformSubscription
    .deleteMany({ where: { tenantId: { in: customerTenantIds } } })
    .catch(() => {})

  // Billing documents (positions cascade via FK).
  await prisma.billingDocument
    .deleteMany({ where: { tenantId: operatorTenantId } })
    .catch(() => {})

  // Recurring invoices.
  await prisma.billingRecurringInvoice
    .deleteMany({ where: { tenantId: operatorTenantId } })
    .catch(() => {})

  // CRM addresses inside the operator tenant.
  await prisma.crmAddress
    .deleteMany({ where: { tenantId: operatorTenantId } })
    .catch(() => {})
}

describe.skipIf(!HAS_DB)("subscription-service integration", () => {
  beforeAll(async () => {
    // Stub the env var to point at our dedicated operator tenant.
    vi.stubEnv("PLATFORM_OPERATOR_TENANT_ID", OPERATOR_TENANT_ID)

    // Create operator + customer tenants.
    await prisma.tenant.upsert({
      where: { id: OPERATOR_TENANT_ID },
      update: {},
      create: {
        id: OPERATOR_TENANT_ID,
        name: "IntegrationTest Operator GmbH",
        slug: `int-operator-${Date.now()}`,
        isActive: true,
        addressStreet: "Betreiberstr. 1",
        addressZip: "10000",
        addressCity: "Berlin",
        addressCountry: "DE",
        email: "ops@int.local",
      },
    })

    await prisma.tenant.upsert({
      where: { id: CUSTOMER_TENANT_ID },
      update: {},
      create: {
        id: CUSTOMER_TENANT_ID,
        name: "IntegrationTest Customer GmbH",
        slug: `int-customer-${Date.now()}`,
        isActive: true,
        addressStreet: "Kundenstr. 1",
        addressZip: "20000",
        addressCity: "Hamburg",
        addressCountry: "DE",
        email: "customer@int.local",
      },
    })

    await prisma.tenant.upsert({
      where: { id: CUSTOMER_TENANT_ID_2 },
      update: {},
      create: {
        id: CUSTOMER_TENANT_ID_2,
        name: "IntegrationTest Customer 2 GmbH",
        slug: `int-customer2-${Date.now()}`,
        isActive: true,
        addressStreet: "Kundenstr. 2",
        addressZip: "20000",
        addressCity: "Hamburg",
        addressCountry: "DE",
        email: "customer2@int.local",
      },
    })

    // Number sequences for the operator tenant — required by
    // crm-address-service.create and billing-recurring-invoice-service.generate.
    await prisma.numberSequence.upsert({
      where: {
        tenantId_key: { tenantId: OPERATOR_TENANT_ID, key: "customer" },
      },
      update: {},
      create: {
        tenantId: OPERATOR_TENANT_ID,
        key: "customer",
        prefix: "K-",
        nextValue: 1,
      },
    })
    await prisma.numberSequence.upsert({
      where: {
        tenantId_key: { tenantId: OPERATOR_TENANT_ID, key: "invoice" },
      },
      update: {},
      create: {
        tenantId: OPERATOR_TENANT_ID,
        key: "invoice",
        prefix: "RE-",
        nextValue: 1,
      },
    })

    // Clean any leftover state from a previous failed run.
    await cleanupForTenantPair(OPERATOR_TENANT_ID, [
      CUSTOMER_TENANT_ID,
      CUSTOMER_TENANT_ID_2,
    ])
  })

  beforeEach(async () => {
    // Reset per-test state — wipe everything scoped to our operator +
    // customer tenants but keep the tenants + number sequences.
    await cleanupForTenantPair(OPERATOR_TENANT_ID, [
      CUSTOMER_TENANT_ID,
      CUSTOMER_TENANT_ID_2,
    ])
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await cleanupForTenantPair(OPERATOR_TENANT_ID, [
      CUSTOMER_TENANT_ID,
      CUSTOMER_TENANT_ID_2,
    ])
    await prisma.numberSequence
      .deleteMany({ where: { tenantId: OPERATOR_TENANT_ID } })
      .catch(() => {})
    await prisma.tenant
      .deleteMany({
        where: {
          id: {
            in: [OPERATOR_TENANT_ID, CUSTOMER_TENANT_ID, CUSTOMER_TENANT_ID_2],
          },
        },
      })
      .catch(() => {})
    vi.unstubAllEnvs()
  })

  // --------------------------------------------------------------------
  // Test 1 — createSubscription fresh: all rows wired up correctly
  // --------------------------------------------------------------------
  it("createSubscription commits subscription + CrmAddress + recurring invoice", async () => {
    const result = await subscriptionService.createSubscription(
      prisma,
      {
        customerTenantId: CUSTOMER_TENANT_ID,
        module: "core",
        billingCycle: "MONTHLY",
      },
      PLATFORM_SYSTEM_USER_ID,
    )

    expect(result.subscriptionId).toBeTruthy()
    expect(result.operatorCrmAddressId).toBeTruthy()
    expect(result.billingRecurringInvoiceId).toBeTruthy()
    expect(result.joinedExistingRecurring).toBe(false)

    // platform_subscriptions row
    const sub = await prisma.platformSubscription.findUnique({
      where: { id: result.subscriptionId },
    })
    expect(sub).not.toBeNull()
    expect(sub!.tenantId).toBe(CUSTOMER_TENANT_ID)
    expect(sub!.module).toBe("core")
    expect(sub!.status).toBe("active")
    expect(sub!.billingCycle).toBe("MONTHLY")
    expect(sub!.unitPrice).toBe(8)
    expect(sub!.operatorCrmAddressId).toBe(result.operatorCrmAddressId)
    expect(sub!.billingRecurringInvoiceId).toBe(result.billingRecurringInvoiceId)

    // CrmAddress inside operator tenant
    const addr = await prisma.crmAddress.findUnique({
      where: { id: result.operatorCrmAddressId },
    })
    expect(addr).not.toBeNull()
    expect(addr!.tenantId).toBe(OPERATOR_TENANT_ID)
    expect(addr!.company).toBe("IntegrationTest Customer GmbH")
    expect(addr!.type).toBe("CUSTOMER")

    // BillingRecurringInvoice inside operator tenant
    const ri = await prisma.billingRecurringInvoice.findUnique({
      where: { id: result.billingRecurringInvoiceId },
    })
    expect(ri).not.toBeNull()
    expect(ri!.tenantId).toBe(OPERATOR_TENANT_ID)
    expect(ri!.addressId).toBe(result.operatorCrmAddressId)
    expect(ri!.interval).toBe("MONTHLY")
    expect(ri!.isActive).toBe(true)
    expect(ri!.autoGenerate).toBe(true)
    expect(ri!.internalNotes).toContain(
      `[platform_subscription:${result.subscriptionId}]`,
    )

    const positions = ri!.positionTemplate as unknown as Array<{
      type: string
      description: string
      unitPrice: number
      vatRate: number
    }>
    expect(positions).toHaveLength(1)
    expect(positions[0]!.type).toBe("FREE")
    expect(positions[0]!.description).toMatch(/Core/)
    expect(positions[0]!.unitPrice).toBe(8)
    expect(positions[0]!.vatRate).toBe(19)
  })

  // --------------------------------------------------------------------
  // Test 2 — shared-invoice join: second sub joins existing recurring
  // --------------------------------------------------------------------
  it(
    "createSubscription joins existing recurring when (customer, cycle) already has one",
    async () => {
      const firstResult = await subscriptionService.createSubscription(
        prisma,
        {
          customerTenantId: CUSTOMER_TENANT_ID,
          module: "core",
          billingCycle: "MONTHLY",
        },
        PLATFORM_SYSTEM_USER_ID,
      )

      const secondResult = await subscriptionService.createSubscription(
        prisma,
        {
          customerTenantId: CUSTOMER_TENANT_ID,
          module: "crm",
          billingCycle: "MONTHLY",
        },
        PLATFORM_SYSTEM_USER_ID,
      )

      expect(secondResult.joinedExistingRecurring).toBe(true)
      expect(secondResult.billingRecurringInvoiceId).toBe(
        firstResult.billingRecurringInvoiceId,
      )
      // CrmAddress reused too
      expect(secondResult.operatorCrmAddressId).toBe(
        firstResult.operatorCrmAddressId,
      )

      // Only ONE recurring invoice exists for this (customer, cycle)
      const recurringCount = await prisma.billingRecurringInvoice.count({
        where: {
          tenantId: OPERATOR_TENANT_ID,
          addressId: firstResult.operatorCrmAddressId,
          interval: "MONTHLY",
          isActive: true,
        },
      })
      expect(recurringCount).toBe(1)

      const ri = await prisma.billingRecurringInvoice.findUnique({
        where: { id: firstResult.billingRecurringInvoiceId },
      })
      const positions = ri!.positionTemplate as unknown as Array<{
        description: string
      }>
      expect(positions).toHaveLength(2)
      expect(positions.map((p) => p.description).join(" ")).toMatch(
        /Core.*CRM|CRM.*Core/,
      )

      // Both markers present in internal_notes
      expect(ri!.internalNotes).toContain(
        `[platform_subscription:${firstResult.subscriptionId}]`,
      )
      expect(ri!.internalNotes).toContain(
        `[platform_subscription:${secondResult.subscriptionId}]`,
      )
    },
  )

  // --------------------------------------------------------------------
  // Test 3 — end-to-end cron flow: generate → autofinalize
  // --------------------------------------------------------------------
  it("end-to-end: generateDue creates DRAFT, autofinalizePending finalizes to PRINTED", async () => {
    // Create two subs sharing one recurring invoice.
    const coreSub = await subscriptionService.createSubscription(
      prisma,
      {
        customerTenantId: CUSTOMER_TENANT_ID,
        module: "core",
        billingCycle: "MONTHLY",
      },
      PLATFORM_SYSTEM_USER_ID,
    )
    const crmSub = await subscriptionService.createSubscription(
      prisma,
      {
        customerTenantId: CUSTOMER_TENANT_ID,
        module: "crm",
        billingCycle: "MONTHLY",
      },
      PLATFORM_SYSTEM_USER_ID,
    )
    expect(crmSub.joinedExistingRecurring).toBe(true)
    expect(crmSub.billingRecurringInvoiceId).toBe(
      coreSub.billingRecurringInvoiceId,
    )

    // The recurring invoice's next_due_date is whatever startDate was (now).
    // Force nextDueDate to a moment in the past so generateDue picks it up.
    await prisma.billingRecurringInvoice.update({
      where: { id: coreSub.billingRecurringInvoiceId },
      data: { nextDueDate: new Date(Date.now() - 1000) },
    })

    // Run generate — scoped via our template's nextDueDate only.
    // generateDue scans ALL tenants. Other seed-data recurring invoices in
    // the shared dev DB may fail (e.g. created_by_id=null trips the "system"
    // fallback as a non-UUID). We only assert on OUR template's result.
    const genResult = await billingRecurringService.generateDue(prisma)
    const ourGenerated = genResult.results.find(
      (r) => r.recurringId === coreSub.billingRecurringInvoiceId,
    )
    expect(ourGenerated).toBeDefined()
    expect(ourGenerated!.error).toBeUndefined()
    expect(ourGenerated!.invoiceId).toBeTruthy()

    // Exactly one DRAFT BillingDocument was produced for our recurring.
    const draftDoc = await prisma.billingDocument.findUnique({
      where: { id: ourGenerated!.invoiceId! },
    })
    expect(draftDoc).not.toBeNull()
    expect(draftDoc!.status).toBe("DRAFT")
    expect(draftDoc!.tenantId).toBe(OPERATOR_TENANT_ID)
    expect(draftDoc!.internalNotes).toContain(
      `[platform_subscription:${coreSub.subscriptionId}]`,
    )
    expect(draftDoc!.internalNotes).toContain(
      `[platform_subscription:${crmSub.subscriptionId}]`,
    )

    // Run autofinalize.
    const summary = await autofinalize.autofinalizePending(prisma, new Date())

    // Under shared invoices, ONE document finalized but TWO pointers updated.
    // (scanned can include subs from other integration tests running in
    // parallel, so we assert >= 2 rather than === 2.)
    expect(summary.scanned).toBeGreaterThanOrEqual(2)
    expect(summary.finalized).toBeGreaterThanOrEqual(1)
    expect(summary.subscriptionPointersUpdated).toBeGreaterThanOrEqual(2)
    expect(summary.skippedSharedDocAlreadyFinalizedThisRun).toBeGreaterThanOrEqual(1)

    // The DRAFT is now PRINTED.
    const finalDoc = await prisma.billingDocument.findUnique({
      where: { id: draftDoc!.id },
    })
    expect(finalDoc!.status).toBe("PRINTED")
    expect(finalDoc!.printedAt).not.toBeNull()

    // Both subs' lastGeneratedInvoiceId point at the same document.
    const [coreAfter, crmAfter] = await Promise.all([
      prisma.platformSubscription.findUnique({
        where: { id: coreSub.subscriptionId },
      }),
      prisma.platformSubscription.findUnique({
        where: { id: crmSub.subscriptionId },
      }),
    ])
    expect(coreAfter!.lastGeneratedInvoiceId).toBe(draftDoc!.id)
    expect(crmAfter!.lastGeneratedInvoiceId).toBe(draftDoc!.id)
  })

  // --------------------------------------------------------------------
  // Test 4 — operator-tenant self-bill guard
  // --------------------------------------------------------------------
  it("createSubscription throws PlatformSubscriptionSelfBillError when customer === operator", async () => {
    await expect(
      subscriptionService.createSubscription(
        prisma,
        {
          customerTenantId: OPERATOR_TENANT_ID,
          module: "crm",
          billingCycle: "MONTHLY",
        },
        PLATFORM_SYSTEM_USER_ID,
      ),
    ).rejects.toBeInstanceOf(
      subscriptionService.PlatformSubscriptionSelfBillError,
    )

    // Nothing was committed: no platform_subscriptions row, no CrmAddress,
    // no recurring invoice in the operator tenant.
    const subCount = await prisma.platformSubscription.count({
      where: { tenantId: OPERATOR_TENANT_ID },
    })
    expect(subCount).toBe(0)

    const addrCount = await prisma.crmAddress.count({
      where: { tenantId: OPERATOR_TENANT_ID },
    })
    expect(addrCount).toBe(0)

    const recurringCount = await prisma.billingRecurringInvoice.count({
      where: { tenantId: OPERATOR_TENANT_ID },
    })
    expect(recurringCount).toBe(0)
  })

  it("isOperatorTenant returns true for the env-configured operator tenant", () => {
    expect(subscriptionService.isOperatorTenant(OPERATOR_TENANT_ID)).toBe(true)
    expect(subscriptionService.isOperatorTenant(CUSTOMER_TENANT_ID)).toBe(false)
  })

  // --------------------------------------------------------------------
  // Test 5 — cancelSubscription Path B: others remain on recurring
  // --------------------------------------------------------------------
  it("cancelSubscription Path B removes position + marker, keeps recurring active", async () => {
    const coreSub = await subscriptionService.createSubscription(
      prisma,
      {
        customerTenantId: CUSTOMER_TENANT_ID,
        module: "core",
        billingCycle: "MONTHLY",
      },
      PLATFORM_SYSTEM_USER_ID,
    )
    const crmSub = await subscriptionService.createSubscription(
      prisma,
      {
        customerTenantId: CUSTOMER_TENANT_ID,
        module: "crm",
        billingCycle: "MONTHLY",
      },
      PLATFORM_SYSTEM_USER_ID,
    )
    const billingSub = await subscriptionService.createSubscription(
      prisma,
      {
        customerTenantId: CUSTOMER_TENANT_ID,
        module: "billing",
        billingCycle: "MONTHLY",
      },
      PLATFORM_SYSTEM_USER_ID,
    )

    // Sanity: all three share one recurring.
    expect(crmSub.billingRecurringInvoiceId).toBe(coreSub.billingRecurringInvoiceId)
    expect(billingSub.billingRecurringInvoiceId).toBe(coreSub.billingRecurringInvoiceId)

    // Cancel the middle one (crm).
    await subscriptionService.cancelSubscription(
      prisma,
      { subscriptionId: crmSub.subscriptionId, reason: "Integration Path B test" },
      PLATFORM_SYSTEM_USER_ID,
    )

    // The cancelled subscription.
    const crmAfter = await prisma.platformSubscription.findUnique({
      where: { id: crmSub.subscriptionId },
    })
    expect(crmAfter!.status).toBe("cancelled")
    expect(crmAfter!.cancellationReason).toBe("Integration Path B test")
    expect(crmAfter!.cancelledAt).not.toBeNull()

    // Recurring invoice still active with TWO positions (core + billing).
    const ri = await prisma.billingRecurringInvoice.findUnique({
      where: { id: coreSub.billingRecurringInvoiceId },
    })
    expect(ri!.isActive).toBe(true)
    expect(ri!.endDate).toBeNull()

    const positions = ri!.positionTemplate as unknown as Array<{
      description: string
    }>
    expect(positions).toHaveLength(2)
    const descriptions = positions.map((p) => p.description)
    expect(descriptions.some((d) => /Core/.test(d))).toBe(true)
    expect(descriptions.some((d) => /Fakturierung/.test(d))).toBe(true)
    expect(descriptions.some((d) => /CRM/.test(d))).toBe(false)

    // CRM marker removed from internalNotes; other two still present.
    expect(ri!.internalNotes).not.toContain(
      `[platform_subscription:${crmSub.subscriptionId}]`,
    )
    expect(ri!.internalNotes).toContain(
      `[platform_subscription:${coreSub.subscriptionId}]`,
    )
    expect(ri!.internalNotes).toContain(
      `[platform_subscription:${billingSub.subscriptionId}]`,
    )

    // The sibling subscriptions are untouched.
    const [coreAfter, billingAfter] = await Promise.all([
      prisma.platformSubscription.findUnique({
        where: { id: coreSub.subscriptionId },
      }),
      prisma.platformSubscription.findUnique({
        where: { id: billingSub.subscriptionId },
      }),
    ])
    expect(coreAfter!.status).toBe("active")
    expect(billingAfter!.status).toBe("active")
  })

  // --------------------------------------------------------------------
  // Billing-exempt tenants (plan 2026-04-13-platform-billing-exempt-tenants)
  // --------------------------------------------------------------------
  describe("billing-exempt tenants", () => {
    beforeEach(async () => {
      // Reset the flag on CUSTOMER_TENANT_ID before each test in this block.
      await prisma.tenant.update({
        where: { id: CUSTOMER_TENANT_ID },
        data: { billingExempt: false },
      })
    })

    it("tenants.billing_exempt column defaults to false", async () => {
      const t = await prisma.tenant.findUnique({
        where: { id: CUSTOMER_TENANT_ID },
        select: { billingExempt: true },
      })
      expect(t).not.toBeNull()
      expect(t!.billingExempt).toBe(false)
    })

    it("createSubscription throws PlatformSubscriptionBillingExemptError for exempt customer", async () => {
      await prisma.tenant.update({
        where: { id: CUSTOMER_TENANT_ID },
        data: { billingExempt: true },
      })

      await expect(
        subscriptionService.createSubscription(
          prisma,
          {
            customerTenantId: CUSTOMER_TENANT_ID,
            module: "crm",
            billingCycle: "MONTHLY",
          },
          PLATFORM_SYSTEM_USER_ID,
        ),
      ).rejects.toBeInstanceOf(
        subscriptionService.PlatformSubscriptionBillingExemptError,
      )

      // Defense-in-depth guarantee: NO side effects. The transaction
      // must have rolled back — zero rows of any kind inside the
      // operator tenant's billing scope for this customer.
      const [subs, addrs, recurrings] = await Promise.all([
        prisma.platformSubscription.findMany({
          where: { tenantId: CUSTOMER_TENANT_ID },
        }),
        prisma.crmAddress.findMany({
          where: {
            tenantId: OPERATOR_TENANT_ID,
            company: "IntegrationTest Customer GmbH",
          },
        }),
        prisma.billingRecurringInvoice.findMany({
          where: { tenantId: OPERATOR_TENANT_ID },
        }),
      ])
      expect(subs).toHaveLength(0)
      expect(addrs).toHaveLength(0)
      expect(recurrings).toHaveLength(0)
    })

    it("findOrCreateOperatorCrmAddress works on an exempt tenant (exempt-path fallback)", async () => {
      // The exempt path in enableModule skips createSubscription and
      // instead calls findOrCreateOperatorCrmAddress directly to keep
      // the customer visible in the operator's CRM. That call must
      // succeed against the real DB even though no platform_subscriptions
      // row exists yet for this customer.
      await prisma.tenant.update({
        where: { id: CUSTOMER_TENANT_ID },
        data: { billingExempt: true },
      })

      const addrId = await subscriptionService.findOrCreateOperatorCrmAddress(
        prisma,
        CUSTOMER_TENANT_ID,
      )
      expect(addrId).toBeTruthy()

      const addr = await prisma.crmAddress.findUnique({ where: { id: addrId } })
      expect(addr).not.toBeNull()
      expect(addr!.tenantId).toBe(OPERATOR_TENANT_ID)
      expect(addr!.company).toBe("IntegrationTest Customer GmbH")
      expect(addr!.type).toBe("CUSTOMER")

      // Still no subscription / recurring invoice — exempt means
      // exempt, even after the CrmAddress is materialized.
      const subs = await prisma.platformSubscription.findMany({
        where: { tenantId: CUSTOMER_TENANT_ID },
      })
      expect(subs).toHaveLength(0)
      const recurrings = await prisma.billingRecurringInvoice.findMany({
        where: { tenantId: OPERATOR_TENANT_ID },
      })
      expect(recurrings).toHaveLength(0)
    })

    it("toggling billing_exempt from true to false does NOT retroactively create subscriptions", async () => {
      // Start exempt, materialize the CrmAddress via the exempt-path
      // helper, then flip back to normal billing. The flip alone must
      // not create any subscriptions — that's the documented behavior.
      await prisma.tenant.update({
        where: { id: CUSTOMER_TENANT_ID },
        data: { billingExempt: true },
      })
      await subscriptionService.findOrCreateOperatorCrmAddress(
        prisma,
        CUSTOMER_TENANT_ID,
      )

      await prisma.tenant.update({
        where: { id: CUSTOMER_TENANT_ID },
        data: { billingExempt: false },
      })

      const subs = await prisma.platformSubscription.findMany({
        where: { tenantId: CUSTOMER_TENANT_ID },
      })
      expect(subs).toHaveLength(0)
      const recurrings = await prisma.billingRecurringInvoice.findMany({
        where: { tenantId: OPERATOR_TENANT_ID },
      })
      expect(recurrings).toHaveLength(0)
    })

    it("after flipping exempt→normal, a fresh createSubscription succeeds end-to-end", async () => {
      await prisma.tenant.update({
        where: { id: CUSTOMER_TENANT_ID },
        data: { billingExempt: true },
      })
      // Exempt-path: CrmAddress only.
      await subscriptionService.findOrCreateOperatorCrmAddress(
        prisma,
        CUSTOMER_TENANT_ID,
      )

      await prisma.tenant.update({
        where: { id: CUSTOMER_TENANT_ID },
        data: { billingExempt: false },
      })

      // A normal createSubscription call should now succeed — the
      // defense-in-depth guard re-reads billing_exempt inside its
      // transaction, so the flip must be visible.
      const result = await subscriptionService.createSubscription(
        prisma,
        {
          customerTenantId: CUSTOMER_TENANT_ID,
          module: "warehouse",
          billingCycle: "MONTHLY",
        },
        PLATFORM_SYSTEM_USER_ID,
      )
      expect(result.subscriptionId).toBeTruthy()
      expect(result.billingRecurringInvoiceId).toBeTruthy()

      const addr = await prisma.crmAddress.findUnique({
        where: { id: result.operatorCrmAddressId },
      })
      expect(addr).not.toBeNull()
      expect(addr!.tenantId).toBe(OPERATOR_TENANT_ID)
    })
  })
})
