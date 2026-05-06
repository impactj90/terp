/**
 * NK Aggregator integration tests (NK-1, Phase 6, Decision 11)
 *
 * Covers `calculateIstAufwand` and `calculateSollIstReport` end-to-end:
 *   - Empty order → empty aggregation
 *   - HOURLY booking with snapshot → committed/pending split + cost
 *   - FLAT_RATE booking → flatItems entry, calculatedHourEquivalent
 *   - PER_UNIT booking with quantity → unitItems entry
 *   - PER_UNIT booking without quantity → DataQualityIssue, skipped
 *   - WhStockMovement with / without unitCostAtMovement → exact / estimated
 *   - InboundInvoiceLineItem with stockMovement link → anti-double-count
 *   - WorkReport with travelRateAtSign snapshot → exact travel cost
 *   - Soll/Ist with active OrderTarget → DB I/II/III, productivity
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as aggregator from "../nk-aggregator"

// Static IDs to keep cleanup deterministic
const TENANT_ID = "f0000000-0000-4000-a000-0000000a1601"
const TENANT_SLUG = "nk-agg-test"
const EMP_ID = "f0000000-0000-4000-a000-0000000a1602"
const ORDER_ID = "f0000000-0000-4000-a000-0000000a1603"
const ACT_HOURLY_ID = "f0000000-0000-4000-a000-0000000a1604"
const ACT_FLAT_ID = "f0000000-0000-4000-a000-0000000a1605"
const ACT_PER_UNIT_ID = "f0000000-0000-4000-a000-0000000a1606"
const WG_ID = "f0000000-0000-4000-a000-0000000a1607"
const ARTICLE_ID = "f0000000-0000-4000-a000-0000000a1608"
const SUPPLIER_ID = "f0000000-0000-4000-a000-0000000a1609"
const INBOUND_INVOICE_ID = "f0000000-0000-4000-a000-0000000a1610"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "NK Aggregator Test",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })

  // Order-side cleanup (cascades down)
  await prisma.orderBooking.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.workReportAssignment.deleteMany({
    where: { workReport: { tenantId: TENANT_ID } },
  })
  await prisma.workReport.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.orderTarget.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.whStockMovement.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.inboundInvoiceLineItem.deleteMany({
    where: { tenantId: TENANT_ID },
  })
  await prisma.inboundInvoice.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.activity.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.whArticle.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.crmAddress.deleteMany({ where: { id: SUPPLIER_ID } })
  await prisma.order.deleteMany({ where: { id: ORDER_ID } })
  await prisma.employee.deleteMany({ where: { id: EMP_ID } })
  await prisma.wageGroup.deleteMany({ where: { id: WG_ID } })

  await prisma.wageGroup.create({
    data: {
      id: WG_ID,
      tenantId: TENANT_ID,
      code: "MEISTER",
      name: "Meister",
      billingHourlyRate: 95,
    },
  })

  await prisma.employee.create({
    data: {
      id: EMP_ID,
      tenantId: TENANT_ID,
      personnelNumber: "AGG-1",
      pin: "agg-pin-1",
      firstName: "Agg",
      lastName: "Tester",
      entryDate: new Date("2024-01-01"),
      hourlyRate: 60,
      wageGroupId: WG_ID,
      isActive: true,
    },
  })

  await prisma.order.create({
    data: {
      id: ORDER_ID,
      tenantId: TENANT_ID,
      code: "AGG-O-1",
      name: "Aggregator Order",
      status: "active",
      customer: "Acme Inc.",
      billingRatePerHour: 80,
    },
  })

  await prisma.activity.createMany({
    data: [
      {
        id: ACT_HOURLY_ID,
        tenantId: TENANT_ID,
        code: "AGG_H",
        name: "Agg Hourly",
        pricingType: "HOURLY",
        hourlyRate: 75,
      },
      {
        id: ACT_FLAT_ID,
        tenantId: TENANT_ID,
        code: "AGG_F",
        name: "Agg Flat",
        pricingType: "FLAT_RATE",
        flatRate: 89,
        calculatedHourEquivalent: 0.5,
      },
      {
        id: ACT_PER_UNIT_ID,
        tenantId: TENANT_ID,
        code: "AGG_PU",
        name: "Agg PerUnit",
        pricingType: "PER_UNIT",
        unit: "lfm",
        flatRate: 18,
      },
    ],
  })

  await prisma.whArticle.create({
    data: {
      id: ARTICLE_ID,
      tenantId: TENANT_ID,
      number: "AGG-A-1",
      name: "Agg Article",
      buyPrice: 10,
      stockTracking: true,
    },
  })

  await prisma.crmAddress.create({
    data: {
      id: SUPPLIER_ID,
      tenantId: TENANT_ID,
      number: "AGG-S-1",
      company: "Agg Supplier",
      type: "SUPPLIER",
    },
  })

  await prisma.inboundInvoice.create({
    data: {
      id: INBOUND_INVOICE_ID,
      tenantId: TENANT_ID,
      number: "AGG-IV-1",
      supplierId: SUPPLIER_ID,
      status: "APPROVED",
      orderId: ORDER_ID,
    },
  })
})

afterAll(async () => {
  await prisma.orderBooking.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.workReportAssignment.deleteMany({
    where: { workReport: { tenantId: TENANT_ID } },
  })
  await prisma.workReport.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.orderTarget.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.whStockMovement.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.inboundInvoiceLineItem.deleteMany({
    where: { tenantId: TENANT_ID },
  })
  await prisma.inboundInvoice.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.activity.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.whArticle.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.crmAddress.deleteMany({ where: { id: SUPPLIER_ID } })
  await prisma.order.deleteMany({ where: { id: ORDER_ID } })
  await prisma.employee.deleteMany({ where: { id: EMP_ID } })
  await prisma.wageGroup.deleteMany({ where: { id: WG_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.orderBooking.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.workReportAssignment.deleteMany({
    where: { workReport: { tenantId: TENANT_ID } },
  })
  await prisma.workReport.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.orderTarget.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.whStockMovement.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.inboundInvoiceLineItem.deleteMany({
    where: { tenantId: TENANT_ID },
  })
})

// -----------------------------------------------------------------------------
// calculateIstAufwand
// -----------------------------------------------------------------------------

describe("nk-aggregator.calculateIstAufwand", () => {
  it("returns empty aggregation for an order with no children", async () => {
    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.orderId).toBe(ORDER_ID)
    expect(r.laborHours.totalHours).toBe(0)
    expect(r.laborHours.totalCost).toBe(0)
    expect(r.laborHours.bookingCount).toBe(0)
    expect(r.flatItems).toEqual([])
    expect(r.unitItems).toEqual([])
    expect(r.travel.totalMinutes).toBe(0)
    expect(r.travel.totalCost).toBe(0)
    expect(r.material.totalCost).toBe(0)
    expect(r.externalCost.totalCost).toBe(0)
    expect(r.dataQualityIssues).toEqual([])
    expect(r.estimatedShare).toBe(0)
    expect(r.estimatedComponents).toEqual([])
  })

  it("HOURLY booking with snapshot — exact cost, no estimated flag", async () => {
    // 2h × 75€/h = 150€, no work report → counted as pending
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_HOURLY_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 120,
        hourlyRateAtBooking: 75,
        hourlyRateSourceAtBooking: "activity_hourly",
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.laborHours.totalHours).toBe(2)
    expect(r.laborHours.totalCost).toBe(150)
    expect(r.laborHours.committedHours).toBe(0) // no SIGNED workreport
    expect(r.laborHours.pendingHours).toBe(2) // booking has no workReport → pending
    expect(r.laborHours.estimatedShare).toBe(0)
    // Booking without WorkReport gets a warning issue
    const issue = r.dataQualityIssues.find(
      (i) => i.code === "BOOKING_WITHOUT_WORKREPORT",
    )
    expect(issue?.count).toBe(1)
  })

  it("HOURLY booking without snapshot — estimated with DataQualityIssue", async () => {
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_HOURLY_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 60,
        // No hourlyRateAtBooking — simulates pre-NK-1 booking
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.laborHours.totalHours).toBe(1)
    // Live-resolver picks activity.hourlyRate = 75
    expect(r.laborHours.totalCost).toBe(75)
    expect(r.laborHours.estimatedShare).toBe(1)
    expect(r.estimatedComponents).toContain("labor")
    const issue = r.dataQualityIssues.find(
      (i) => i.code === "BOOKING_RATE_NULL_SNAPSHOT",
    )
    expect(issue?.count).toBe(1)
  })

  it("FLAT_RATE booking — counted as flatItem with calculatedHourEquivalent", async () => {
    // 2 bookings on same FLAT_RATE activity → quantity 2, totalAmount 178
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_FLAT_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 30,
        hourlyRateAtBooking: 89,
        hourlyRateSourceAtBooking: "activity_flat",
      },
    })
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_FLAT_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 30,
        hourlyRateAtBooking: 89,
        hourlyRateSourceAtBooking: "activity_flat",
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.laborHours.totalCost).toBe(0) // nothing on the labor track
    expect(r.flatItems).toHaveLength(1)
    expect(r.flatItems[0]!.activityId).toBe(ACT_FLAT_ID)
    expect(r.flatItems[0]!.quantity).toBe(2)
    expect(r.flatItems[0]!.flatRate).toBe(89)
    expect(r.flatItems[0]!.totalAmount).toBe(178)
    // 2 × 0.5 = 1h Stunden-Äquivalent
    expect(r.flatItems[0]!.calculatedHourEquivalent).toBe(1)
  })

  it("PER_UNIT booking with quantity — counted as unitItem", async () => {
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_PER_UNIT_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 60,
        quantity: 12.5,
        hourlyRateAtBooking: null, // PER_UNIT durchfällt — no snapshot expected
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.unitItems).toHaveLength(1)
    expect(r.unitItems[0]!.activityId).toBe(ACT_PER_UNIT_ID)
    expect(r.unitItems[0]!.quantity).toBe(12.5)
    expect(r.unitItems[0]!.pricePerUnit).toBe(18) // flatRate column
    expect(r.unitItems[0]!.totalAmount).toBe(225) // 12.5 × 18
    expect(r.unitItems[0]!.unit).toBe("lfm")
    expect(r.laborHours.totalHours).toBe(0)
  })

  it("PER_UNIT booking WITHOUT quantity — DataQualityIssue + skipped", async () => {
    // Bypass service validation by inserting directly via Prisma.
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_PER_UNIT_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 60,
        quantity: null,
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.unitItems).toEqual([])
    const issue = r.dataQualityIssues.find(
      (i) => i.code === "PER_UNIT_WITHOUT_QUANTITY",
    )
    expect(issue?.count).toBe(1)
    expect(issue?.severity).toBe("error")
  })

  it("WorkReport SIGNED → bookings counted as committedHours", async () => {
    const wr = await prisma.workReport.create({
      data: {
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        code: "AGG-WR-S",
        visitDate: new Date("2026-04-29"),
        status: "SIGNED",
        signedAt: new Date(),
        workDescription: "Test",
      },
    })
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_HOURLY_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 60,
        hourlyRateAtBooking: 75,
        hourlyRateSourceAtBooking: "activity_hourly",
        workReportId: wr.id,
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.laborHours.committedHours).toBe(1)
    expect(r.laborHours.committedCost).toBe(75)
    expect(r.laborHours.pendingHours).toBe(0)
  })

  it("WorkReport DRAFT → bookings counted as pendingHours + warning", async () => {
    const wr = await prisma.workReport.create({
      data: {
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        code: "AGG-WR-D",
        visitDate: new Date("2026-04-29"),
        status: "DRAFT",
        workDescription: "Test",
      },
    })
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_HOURLY_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 60,
        hourlyRateAtBooking: 75,
        hourlyRateSourceAtBooking: "activity_hourly",
        workReportId: wr.id,
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.laborHours.pendingHours).toBe(1)
    expect(r.laborHours.pendingCost).toBe(75)
    expect(r.laborHours.committedHours).toBe(0)
    const issue = r.dataQualityIssues.find((i) => i.code === "WORKREPORT_DRAFT")
    expect(issue?.count).toBe(1)
    expect(issue?.severity).toBe("warning")
  })

  it("WorkReport VOID → bookings excluded entirely", async () => {
    const wr = await prisma.workReport.create({
      data: {
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        code: "AGG-WR-V",
        visitDate: new Date("2026-04-29"),
        status: "VOID",
        voidedAt: new Date(),
        voidReason: "test",
        workDescription: "Test",
      },
    })
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_HOURLY_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 60,
        hourlyRateAtBooking: 75,
        hourlyRateSourceAtBooking: "activity_hourly",
        workReportId: wr.id,
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.laborHours.totalHours).toBe(0)
    expect(r.laborHours.totalCost).toBe(0)
    expect(r.laborHours.bookingCount).toBe(0)
  })
})

// -----------------------------------------------------------------------------
// Material aggregation
// -----------------------------------------------------------------------------

describe("nk-aggregator material aggregation", () => {
  it("WhStockMovement WITHDRAWAL with unitCostAtMovement — exact cost", async () => {
    await prisma.whStockMovement.create({
      data: {
        tenantId: TENANT_ID,
        articleId: ARTICLE_ID,
        orderId: ORDER_ID,
        type: "WITHDRAWAL",
        quantity: -5,
        previousStock: 100,
        newStock: 95,
        unitCostAtMovement: 12,
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.material.totalCost).toBe(60) // 5 × 12
    expect(r.material.movementCount).toBe(1)
    expect(r.material.estimatedShare).toBe(0)
  })

  it("WhStockMovement WITHDRAWAL without unitCostAtMovement — falls back to article.buyPrice + estimated", async () => {
    await prisma.whStockMovement.create({
      data: {
        tenantId: TENANT_ID,
        articleId: ARTICLE_ID,
        orderId: ORDER_ID,
        type: "WITHDRAWAL",
        quantity: -3,
        previousStock: 100,
        newStock: 97,
        unitCostAtMovement: null, // pre-NK-1 movement
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    // article.buyPrice is 10, so 3 × 10 = 30
    expect(r.material.totalCost).toBe(30)
    expect(r.material.estimatedShare).toBe(1)
    expect(r.estimatedComponents).toContain("material")
    const issue = r.dataQualityIssues.find(
      (i) => i.code === "MOVEMENT_NO_UNIT_COST",
    )
    expect(issue?.count).toBe(1)
  })
})

// -----------------------------------------------------------------------------
// External cost (anti-double-count via stockMovements)
// -----------------------------------------------------------------------------

describe("nk-aggregator externalCost (Decision 5 anti-double-count)", () => {
  it("InboundInvoiceLineItem WITHOUT linked stockMovement → counted as externalCost", async () => {
    await prisma.inboundInvoiceLineItem.create({
      data: {
        tenantId: TENANT_ID,
        invoiceId: INBOUND_INVOICE_ID,
        orderId: ORDER_ID,
        position: 1,
        description: "Direct service",
        totalNet: 250,
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.externalCost.totalCost).toBe(250)
    expect(r.externalCost.lineItemCount).toBe(1)
    expect(r.externalCost.skippedDueToStockLink).toBe(0)
  })

  it("InboundInvoiceLineItem WITH linked stockMovement → skipped (already in material)", async () => {
    const li = await prisma.inboundInvoiceLineItem.create({
      data: {
        tenantId: TENANT_ID,
        invoiceId: INBOUND_INVOICE_ID,
        orderId: ORDER_ID,
        position: 1,
        description: "Lager item",
        totalNet: 500,
      },
    })
    await prisma.whStockMovement.create({
      data: {
        tenantId: TENANT_ID,
        articleId: ARTICLE_ID,
        orderId: ORDER_ID,
        type: "WITHDRAWAL",
        quantity: -1,
        previousStock: 10,
        newStock: 9,
        unitCostAtMovement: 50,
        inboundInvoiceLineItemId: li.id,
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.externalCost.totalCost).toBe(0)
    expect(r.externalCost.lineItemCount).toBe(0)
    expect(r.externalCost.skippedDueToStockLink).toBe(1)
    expect(r.material.totalCost).toBe(50) // material picked it up
    const issue = r.dataQualityIssues.find(
      (i) => i.code === "INVOICE_LI_LINKED_VIA_STOCK",
    )
    expect(issue?.count).toBe(1)
  })
})

// -----------------------------------------------------------------------------
// Travel-rate snapshot (Decision 27)
// -----------------------------------------------------------------------------

describe("nk-aggregator travel (Decision 27)", () => {
  it("WorkReport with travelMinutes + travelRateAtSign — exact cost, no estimated flag", async () => {
    await prisma.workReport.create({
      data: {
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        code: "AGG-WR-T1",
        visitDate: new Date("2026-04-29"),
        status: "SIGNED",
        signedAt: new Date(),
        workDescription: "Test",
        travelMinutes: 60,
        travelRateAtSign: 95,
        travelRateSourceAtSign: "wage_group",
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.travel.totalMinutes).toBe(60)
    expect(r.travel.totalCost).toBe(95) // 60min = 1h × 95
    expect(r.travel.estimatedShare).toBe(0)
    expect(r.travel.workReportIds).toHaveLength(1)
  })

  it("WorkReport with travelMinutes but NO snapshot — estimated, falls back to live resolver", async () => {
    await prisma.workReport.create({
      data: {
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        code: "AGG-WR-T2",
        visitDate: new Date("2026-04-29"),
        status: "SIGNED",
        signedAt: new Date(),
        workDescription: "Test",
        travelMinutes: 30,
        travelRateAtSign: null, // pre-NK-1 sign
        travelRateSourceAtSign: null,
      },
    })

    const r = await aggregator.calculateIstAufwand(prisma, TENANT_ID, ORDER_ID)
    expect(r.travel.totalMinutes).toBe(30)
    // Falls through to order.billingRatePerHour = 80, so 30min × 80 = 40
    expect(r.travel.totalCost).toBe(40)
    expect(r.travel.estimatedShare).toBe(1)
    expect(r.estimatedComponents).toContain("travel")
    const issue = r.dataQualityIssues.find(
      (i) => i.code === "TRAVEL_NULL_SNAPSHOT",
    )
    expect(issue?.count).toBe(1)
  })
})

// -----------------------------------------------------------------------------
// calculateSollIstReport — DB-Stufen + Productivity
// -----------------------------------------------------------------------------

describe("nk-aggregator.calculateSollIstReport", () => {
  it("returns null target when no OrderTarget exists", async () => {
    const r = await aggregator.calculateSollIstReport(
      prisma,
      TENANT_ID,
      ORDER_ID,
    )
    expect(r.target).toBeNull()
    expect(r.marginContribution.sollErloes).toBeNull()
    expect(r.marginContribution.db1).toBeNull()
    expect(r.marginContribution.db2).toBeNull()
    expect(r.marginContribution.db3).toBeNull()
  })

  it("computes DB I / II / III when target + ist data are present", async () => {
    await prisma.orderTarget.create({
      data: {
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        version: 1,
        validFrom: new Date("2026-01-01"),
        targetHours: 10,
        targetMaterialCost: 200,
        targetTravelMinutes: 60,
        targetExternalCost: 100,
        targetRevenue: 2000,
      },
    })

    // 4h × 75€ = 300€ Lohn
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_HOURLY_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 240,
        hourlyRateAtBooking: 75,
        hourlyRateSourceAtBooking: "activity_hourly",
      },
    })
    // 5 × 12 = 60€ Material
    await prisma.whStockMovement.create({
      data: {
        tenantId: TENANT_ID,
        articleId: ARTICLE_ID,
        orderId: ORDER_ID,
        type: "WITHDRAWAL",
        quantity: -5,
        previousStock: 100,
        newStock: 95,
        unitCostAtMovement: 12,
      },
    })
    // 30min × 95€/h = 47.5€ Reisezeit
    await prisma.workReport.create({
      data: {
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        code: "AGG-DB-WR",
        visitDate: new Date("2026-04-29"),
        status: "SIGNED",
        signedAt: new Date(),
        workDescription: "Test",
        travelMinutes: 30,
        travelRateAtSign: 95,
        travelRateSourceAtSign: "wage_group",
      },
    })
    // 80€ Externe Kosten
    await prisma.inboundInvoiceLineItem.create({
      data: {
        tenantId: TENANT_ID,
        invoiceId: INBOUND_INVOICE_ID,
        orderId: ORDER_ID,
        position: 1,
        description: "External",
        totalNet: 80,
      },
    })

    const r = await aggregator.calculateSollIstReport(
      prisma,
      TENANT_ID,
      ORDER_ID,
    )

    expect(r.target?.targetRevenue).toBe(2000)
    expect(r.ist.material.totalCost).toBe(60)
    expect(r.ist.laborHours.totalCost).toBe(300)
    expect(r.ist.travel.totalCost).toBe(47.5)
    expect(r.ist.externalCost.totalCost).toBe(80)

    // DB I = Erlös - Material = 2000 - 60 = 1940
    expect(r.marginContribution.db1).toBe(1940)
    // DB II = DB I - Lohn (incl. flat+unit, here 0) = 1940 - 300 = 1640
    expect(r.marginContribution.db2).toBe(1640)
    // DB III = DB II - Travel - External = 1640 - 47.5 - 80 = 1512.5
    expect(r.marginContribution.db3).toBe(1512.5)
    // Productivity = ist hours / soll hours = 4 / 10 = 40%
    expect(r.productivity.productiveHoursTotal).toBe(4)
    expect(r.productivity.productivityPercent).toBe(40)
  })

  it("computes hours/material variances when target is present", async () => {
    await prisma.orderTarget.create({
      data: {
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        version: 1,
        validFrom: new Date("2026-01-01"),
        targetHours: 5,
        targetMaterialCost: 100,
      },
    })
    // 6h actual → +1h variance, +20%
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_HOURLY_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 360,
        hourlyRateAtBooking: 75,
        hourlyRateSourceAtBooking: "activity_hourly",
      },
    })
    // 150€ material (50% over plan)
    await prisma.whStockMovement.create({
      data: {
        tenantId: TENANT_ID,
        articleId: ARTICLE_ID,
        orderId: ORDER_ID,
        type: "WITHDRAWAL",
        quantity: -15,
        previousStock: 100,
        newStock: 85,
        unitCostAtMovement: 10,
      },
    })

    const r = await aggregator.calculateSollIstReport(
      prisma,
      TENANT_ID,
      ORDER_ID,
    )
    expect(r.comparison.hoursVariance).toBe(1)
    expect(r.comparison.hoursVariancePercent).toBe(20)
    expect(r.comparison.materialVariance).toBe(50)
    expect(r.comparison.materialVariancePercent).toBe(50)
  })
})

// -----------------------------------------------------------------------------
// Tenant isolation
// -----------------------------------------------------------------------------

describe("nk-aggregator tenant isolation", () => {
  it("does not leak data from another tenant", async () => {
    const otherTenantId = "f0000000-0000-4000-a000-0000000a169f"
    const otherSlug = "nk-agg-other"
    await prisma.tenant.upsert({
      where: { id: otherTenantId },
      update: {},
      create: {
        id: otherTenantId,
        name: "Other",
        slug: otherSlug,
        isActive: true,
      },
    })

    // Place a booking on our tenant's order, then run the aggregator with the
    // OTHER tenantId — the order belongs to TENANT_ID, so the aggregator's
    // `tenantId, orderId` scope must produce empty results.
    await prisma.orderBooking.create({
      data: {
        tenantId: TENANT_ID,
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_HOURLY_ID,
        bookingDate: new Date("2026-04-29"),
        timeMinutes: 120,
        hourlyRateAtBooking: 75,
        hourlyRateSourceAtBooking: "activity_hourly",
      },
    })

    const r = await aggregator.calculateIstAufwand(
      prisma,
      otherTenantId,
      ORDER_ID,
    )
    expect(r.laborHours.totalHours).toBe(0)
    expect(r.laborHours.bookingCount).toBe(0)

    await prisma.tenant.deleteMany({ where: { id: otherTenantId } })
  })
})

// -----------------------------------------------------------------------------
// aggregateByDimension — closing-pass-followup fixes
// (FIX-AGG-1: dateTo as endOfDay, FIX-AGG-2: order_type label,
//  FIX-AGG-3: orders[] populated)
// -----------------------------------------------------------------------------

const OT_ID_1 = "f0000000-0000-4000-a000-0000000a16a1"
const OT_ID_2 = "f0000000-0000-4000-a000-0000000a16a2"

describe("nk-aggregator.aggregateByDimension — closing-pass UI-Bug-Fixes", () => {
  beforeEach(async () => {
    // Reset and seed: 2 OrderTypes + extend our existing AGG-O-1 with
    // one and seed a second order with a different type.
    await prisma.orderTarget.deleteMany({ where: { tenantId: TENANT_ID } })
    await prisma.orderBooking.deleteMany({ where: { tenantId: TENANT_ID } })
    await prisma.order.deleteMany({
      where: { tenantId: TENANT_ID, code: { in: ["AGG-O-2", "AGG-O-DAY"] } },
    })
    await prisma.orderType.deleteMany({ where: { tenantId: TENANT_ID } })
    await prisma.orderType.createMany({
      data: [
        {
          id: OT_ID_1,
          tenantId: TENANT_ID,
          code: "WARTUNG",
          name: "Wartung",
        },
        {
          id: OT_ID_2,
          tenantId: TENANT_ID,
          code: "NOTDIENST",
          name: "Notdienst",
        },
      ],
    })
    // Pin our pre-existing AGG-O-1 to OT_ID_1
    await prisma.order.update({
      where: { id: ORDER_ID },
      data: { orderTypeId: OT_ID_1 },
    })
    // Seed a second order with OT_ID_2 + an active OrderTarget so it
    // appears in dimension aggregation
    await prisma.order.create({
      data: {
        tenantId: TENANT_ID,
        code: "AGG-O-2",
        name: "Aggregator Order 2",
        status: "active",
        customer: "Beta Corp",
        billingRatePerHour: 100,
        orderTypeId: OT_ID_2,
      },
    })
    await prisma.orderTarget.createMany({
      data: [
        {
          tenantId: TENANT_ID,
          orderId: ORDER_ID,
          version: 1,
          validFrom: new Date("2026-04-01"),
          targetRevenue: 1000,
        },
      ],
    })
  })

  it("FIX-AGG-1: dateTo includes orders created on the filter's last day", async () => {
    // Order created today ("now") — `dateTo = today` must include it.
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    await prisma.order.create({
      data: {
        tenantId: TENANT_ID,
        code: "AGG-O-DAY",
        name: "Created Today",
        status: "active",
        customer: "Today GmbH",
        orderTypeId: OT_ID_1,
        // createdAt defaults to now() — that's what we're testing
      },
    })

    // dateFrom = a week ago, dateTo = today (date-only: midnight UTC)
    const weekAgo = new Date(today)
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7)

    const result = await aggregator.aggregateByDimension(prisma, TENANT_ID, {
      dimension: "customer",
      dateFrom: weekAgo,
      dateTo: today,
    })
    // Must contain "Today GmbH" (would be excluded if dateTo was strict <=
    // midnight today)
    const todayBucket = result.find((r) => r.dimensionLabel === "Today GmbH")
    expect(todayBucket).toBeDefined()
    expect(todayBucket!.orderCount).toBe(1)
  })

  it("FIX-AGG-2: order_type dimension returns human-readable label, not UUID", async () => {
    const result = await aggregator.aggregateByDimension(prisma, TENANT_ID, {
      dimension: "order_type",
      dateFrom: new Date("2020-01-01"),
      dateTo: new Date("2030-12-31"),
    })
    // Two buckets — one per OrderType — both with code+name labels
    const wartung = result.find((r) => r.dimensionKey === OT_ID_1)
    const notdienst = result.find((r) => r.dimensionKey === OT_ID_2)
    expect(wartung).toBeDefined()
    expect(notdienst).toBeDefined()
    // The label must NOT be the bare UUID
    expect(wartung!.dimensionLabel).toBe("WARTUNG - Wartung")
    expect(notdienst!.dimensionLabel).toBe("NOTDIENST - Notdienst")
    expect(wartung!.dimensionLabel).not.toBe(OT_ID_1)
  })

  it("FIX-AGG-2: service_object dimension returns human-readable label", async () => {
    // Seed a ServiceObject and pin order to it
    const SO_ID = "f0000000-0000-4000-a000-0000000a16b1"
    const ADDRESS_ID = "f0000000-0000-4000-a000-0000000a16b2"
    await prisma.crmAddress.create({
      data: {
        id: ADDRESS_ID,
        tenantId: TENANT_ID,
        number: "AGG-K-1",
        company: "Anlage-Kunde",
        type: "CUSTOMER",
      },
    })
    await prisma.serviceObject.create({
      data: {
        id: SO_ID,
        tenantId: TENANT_ID,
        number: "ANL-AGG-1",
        name: "Aggregator Test-Anlage",
        kind: "EQUIPMENT",
        customerAddressId: ADDRESS_ID,
      },
    })
    await prisma.order.update({
      where: { id: ORDER_ID },
      data: { serviceObjectId: SO_ID },
    })

    try {
      const result = await aggregator.aggregateByDimension(prisma, TENANT_ID, {
        dimension: "service_object",
        dateFrom: new Date("2020-01-01"),
        dateTo: new Date("2030-12-31"),
      })
      const bucket = result.find((r) => r.dimensionKey === SO_ID)
      expect(bucket).toBeDefined()
      expect(bucket!.dimensionLabel).toBe("ANL-AGG-1 — Aggregator Test-Anlage")
      expect(bucket!.dimensionLabel).not.toBe(SO_ID)
    } finally {
      await prisma.order.update({
        where: { id: ORDER_ID },
        data: { serviceObjectId: null },
      })
      await prisma.serviceObject.delete({ where: { id: SO_ID } })
      await prisma.crmAddress.delete({ where: { id: ADDRESS_ID } })
    }
  })

  it("FIX-AGG-3: orders[] is populated per dimension bucket", async () => {
    const result = await aggregator.aggregateByDimension(prisma, TENANT_ID, {
      dimension: "order_type",
      dateFrom: new Date("2020-01-01"),
      dateTo: new Date("2030-12-31"),
    })
    const wartung = result.find((r) => r.dimensionKey === OT_ID_1)
    expect(wartung).toBeDefined()
    expect(wartung!.orders).toBeDefined()
    expect(Array.isArray(wartung!.orders)).toBe(true)
    expect(wartung!.orders.length).toBe(1)
    const wOrder = wartung!.orders[0]!
    expect(wOrder.orderId).toBe(ORDER_ID)
    expect(wOrder.code).toBe("AGG-O-1")
    expect(wOrder.name).toBe("Aggregator Order")

    const notdienst = result.find((r) => r.dimensionKey === OT_ID_2)
    expect(notdienst).toBeDefined()
    expect(notdienst!.orders.length).toBe(1)
    expect(notdienst!.orders[0]!.code).toBe("AGG-O-2")
  })
})
