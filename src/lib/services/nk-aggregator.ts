/**
 * NK Aggregator (NK-1, Phase 6, Decision 11)
 *
 * Read-only, side-effect-free aggregator that turns raw Order
 * artefacts (Bookings, Material movements, Inbound-Invoice line
 * items, WorkReports) into a structured Soll/Ist report.
 *
 * Three position-types are tracked separately (Decisions 21, 26):
 *   - laborHours (HOURLY activity or no activity)
 *   - flatItems  (FLAT_RATE activity)
 *   - unitItems  (PER_UNIT activity, with quantity)
 *
 * Snapshot fields are preferred when present (Decisions 4, 14, 27);
 * otherwise live-lookup is used and the result is flagged as
 * `estimated`.
 */
import type { PrismaClient } from "@/generated/prisma/client"
import * as repo from "./nk-aggregator-repository"
import * as targetService from "./order-target-service"
import {
  resolveLaborRateExtended,
  resolveTravelRateExtended,
} from "./labor-rate-resolver"

// --- Public types ---

export type DataQualityIssueCode =
  | "BOOKING_WITHOUT_RATE"
  | "BOOKING_RATE_NULL_SNAPSHOT"
  | "PER_UNIT_WITHOUT_QUANTITY"
  | "TRAVEL_NULL_SNAPSHOT"
  | "WORKREPORT_DRAFT"
  | "BOOKING_WITHOUT_WORKREPORT"
  | "MOVEMENT_NO_UNIT_COST"
  | "INVOICE_LI_LINKED_VIA_STOCK"
  | "EMPLOYEE_INACTIVE_OR_DELETED"
  | "EMPLOYEE_NO_WAGE_GROUP"

export interface DataQualityIssue {
  code: DataQualityIssueCode
  severity: "info" | "warning" | "error"
  count: number
  affectedIds: string[]
}

export interface IstAufwandReport {
  orderId: string
  laborHours: {
    committedHours: number
    pendingHours: number
    totalHours: number
    committedCost: number
    pendingCost: number
    totalCost: number
    bookingCount: number
    estimatedShare: number
  }
  flatItems: Array<{
    activityId: string
    activityName: string
    description: string
    quantity: number
    flatRate: number
    totalAmount: number
    calculatedHourEquivalent: number
    sourceBookingIds: string[]
  }>
  unitItems: Array<{
    activityId: string
    activityName: string
    description: string
    quantity: number
    unit: string
    pricePerUnit: number
    totalAmount: number
    sourceBookingIds: string[]
  }>
  travel: {
    totalMinutes: number
    totalCost: number
    estimatedShare: number
    workReportIds: string[]
  }
  material: {
    totalCost: number
    estimatedShare: number
    movementCount: number
    movementIds: string[]
  }
  externalCost: {
    totalCost: number
    lineItemCount: number
    lineItemIds: string[]
    skippedDueToStockLink: number
  }
  dataQualityIssues: DataQualityIssue[]
  estimatedShare: number
  estimatedComponents: string[]
}

export interface SollIstReport {
  orderId: string
  target: {
    version: number
    validFrom: Date
    targetHours: number | null
    targetMaterialCost: number | null
    targetTravelMinutes: number | null
    targetExternalCost: number | null
    targetRevenue: number | null
    targetUnitItems: Array<{ activityId: string; quantity: number }> | null
  } | null
  ist: IstAufwandReport
  comparison: {
    hoursVariance: number | null
    hoursVariancePercent: number | null
    materialVariance: number | null
    materialVariancePercent: number | null
    travelVariance: number | null
    travelVariancePercent: number | null
    externalCostVariance: number | null
    externalCostVariancePercent: number | null
    unitItemsVariance: Array<{
      activityId: string
      activityName: string
      unit: string
      sollQuantity: number
      istQuantity: number
      variance: number
      variancePercent: number | null
    }>
  }
  marginContribution: {
    sollErloes: number | null
    db1: number | null
    db2: number | null
    db3: number | null
    db1Percent: number | null
    db2Percent: number | null
    db3Percent: number | null
  }
  productivity: {
    grossHoursIst: number
    flatHourEquivalents: number
    productiveHoursTotal: number
    targetHours: number | null
    productivityPercent: number | null
  }
  hourlyMargin: number | null
}

export type AggregationDimension =
  | "customer"
  | "service_object"
  | "employee"
  | "order_type"

export interface DimensionAggregateOrder {
  orderId: string
  code: string
  name: string
  db2Percent: number | null
  hourlyMargin: number | null
}

export interface DimensionAggregate {
  dimensionKey: string
  dimensionLabel: string
  orderCount: number
  totalLaborHours: number
  totalLaborCost: number
  totalMaterialCost: number
  totalTravelCost: number
  totalExternalCost: number
  totalRevenue: number
  db1: number
  db2: number
  db3: number
  db1Percent: number | null
  db2Percent: number | null
  db3Percent: number | null
  hourlyMargin: number | null
  estimatedShare: number
  /**
   * Orders contained in this dimension bucket. Used by the Reports-Page
   * Drill-Sheet (`NkDimensionDrillSheet`) to show the underlying orders.
   * NK-1-FIX-AGG-3 (closing-pass-followup 2026-05-06): the `orders[]`
   * field was previously declared on the page but never populated by the
   * aggregator — drill always rendered an empty table.
   */
  orders: DimensionAggregateOrder[]
}

// --- Helpers ---

function toNumber(v: unknown): number {
  if (v == null) return 0
  if (typeof v === "number") return v
  return Number(v.toString())
}

function pct(num: number, den: number): number | null {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null
  return (num / den) * 100
}

function variancePercent(ist: number, soll: number): number | null {
  if (soll === 0) return null
  return ((ist - soll) / soll) * 100
}

// --- Main: calculateIstAufwand ---

export async function calculateIstAufwand(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
): Promise<IstAufwandReport> {
  const [bookings, movements, lineItems, workReports, order] =
    await Promise.all([
      repo.loadOrderBookingsForAggregation(prisma, tenantId, orderId),
      repo.loadStockMovementsForAggregation(prisma, tenantId, orderId),
      repo.loadInboundInvoiceLineItemsForAggregation(
        prisma,
        tenantId,
        orderId,
      ),
      repo.loadWorkReportsForAggregation(prisma, tenantId, orderId),
      repo.loadOrderForAggregation(prisma, tenantId, orderId),
    ])

  // ---- 1. Booking-Aggregation ----
  const labor = {
    committedHours: 0,
    pendingHours: 0,
    totalHours: 0,
    committedCost: 0,
    pendingCost: 0,
    totalCost: 0,
    bookingCount: 0,
  }
  const flatMap = new Map<
    string,
    {
      activityId: string
      activityName: string
      description: string
      quantity: number
      flatRate: number
      totalAmount: number
      calculatedHourEquivalent: number
      sourceBookingIds: string[]
    }
  >()
  const unitMap = new Map<
    string,
    {
      activityId: string
      activityName: string
      description: string
      quantity: number
      unit: string
      pricePerUnit: number
      totalAmount: number
      sourceBookingIds: string[]
    }
  >()

  let bookingsWithSnapshot = 0
  let bookingsWithoutSnapshot = 0
  const dq_bookingsWithoutRate: string[] = []
  const dq_bookingsRateNullSnapshot: string[] = []
  const dq_bookingsWithoutWorkReport: string[] = []
  const dq_perUnitWithoutQuantity: string[] = []
  const dq_workReportDraft: string[] = []
  const dq_inactiveEmployees: string[] = []
  const dq_employeeNoWageGroup: string[] = []
  const seenDraftWrIds = new Set<string>()

  for (const booking of bookings) {
    const wrStatus = booking.workReport?.status ?? null
    if (wrStatus === "VOID") continue

    const isCommitted = wrStatus === "SIGNED"
    const isPending = wrStatus === "DRAFT" || booking.workReportId == null

    if (booking.workReportId == null) {
      dq_bookingsWithoutWorkReport.push(booking.id)
    } else if (
      booking.workReport?.status === "DRAFT" &&
      !seenDraftWrIds.has(booking.workReportId)
    ) {
      seenDraftWrIds.add(booking.workReportId)
      dq_workReportDraft.push(booking.workReportId)
    }

    if (booking.employee?.deletedAt || booking.employee?.isActive === false) {
      dq_inactiveEmployees.push(booking.employeeId)
    }
    if (booking.employee && !booking.employee.wageGroupId) {
      dq_employeeNoWageGroup.push(booking.employeeId)
    }

    let rate: number | null
    let estimated: boolean
    if (booking.hourlyRateAtBooking != null) {
      rate = toNumber(booking.hourlyRateAtBooking)
      estimated = false
      bookingsWithSnapshot++
    } else {
      const resolved = resolveLaborRateExtended({
        bookingActivity: booking.activity ?? null,
        orderRate: order?.billingRatePerHour ?? null,
        employeeWageGroupRate:
          booking.employee?.wageGroup?.billingHourlyRate ?? null,
        employeeRate: booking.employee?.hourlyRate ?? null,
      })
      rate = resolved.rate
      estimated = true
      bookingsWithoutSnapshot++
      dq_bookingsRateNullSnapshot.push(booking.id)
    }

    if (rate == null) dq_bookingsWithoutRate.push(booking.id)

    if (booking.activity?.pricingType === "FLAT_RATE") {
      const key = booking.activityId!
      const flat = toNumber(booking.activity.flatRate)
      const che = toNumber(booking.activity.calculatedHourEquivalent)
      const agg = flatMap.get(key) ?? {
        activityId: booking.activityId!,
        activityName: booking.activity.name,
        description: "",
        quantity: 0,
        flatRate: flat,
        totalAmount: 0,
        calculatedHourEquivalent: 0,
        sourceBookingIds: [],
      }
      agg.quantity += 1
      agg.totalAmount += flat
      agg.calculatedHourEquivalent += che
      agg.sourceBookingIds.push(booking.id)
      flatMap.set(key, agg)
      labor.bookingCount++
    } else if (booking.activity?.pricingType === "PER_UNIT") {
      if (booking.quantity == null || toNumber(booking.quantity) <= 0) {
        dq_perUnitWithoutQuantity.push(booking.id)
        continue
      }
      const key = booking.activityId!
      const pricePerUnit = toNumber(
        booking.activity.flatRate ?? booking.activity.hourlyRate ?? 0,
      )
      const agg = unitMap.get(key) ?? {
        activityId: booking.activityId!,
        activityName: booking.activity.name,
        description: "",
        quantity: 0,
        unit: booking.activity.unit ?? "Stk",
        pricePerUnit,
        totalAmount: 0,
        sourceBookingIds: [],
      }
      const qty = toNumber(booking.quantity)
      agg.quantity += qty
      agg.totalAmount += qty * pricePerUnit
      agg.sourceBookingIds.push(booking.id)
      unitMap.set(key, agg)
      labor.bookingCount++
    } else {
      // HOURLY (or no activity): laborHours
      const hours = booking.timeMinutes / 60
      const cost = (rate ?? 0) * hours
      if (isCommitted) {
        labor.committedHours += hours
        labor.committedCost += cost
      } else if (isPending) {
        labor.pendingHours += hours
        labor.pendingCost += cost
      }
      labor.totalHours += hours
      labor.totalCost += cost
      labor.bookingCount++
    }
  }

  const laborEstimatedShare =
    bookings.length > 0
      ? bookingsWithoutSnapshot / Math.max(bookings.length, 1)
      : 0

  // ---- 2. Material ----
  let materialNullCount = 0
  let materialCost = 0
  const movementIds: string[] = []
  const dq_movementNoUnitCost: string[] = []
  for (const m of movements) {
    const qty = Math.abs(m.quantity)
    if (m.unitCostAtMovement != null) {
      materialCost += qty * toNumber(m.unitCostAtMovement)
    } else {
      materialNullCount++
      dq_movementNoUnitCost.push(m.id)
      materialCost += qty * toNumber(m.article.buyPrice ?? 0)
    }
    movementIds.push(m.id)
  }
  const materialEstimatedShare =
    movements.length > 0 ? materialNullCount / movements.length : 0

  // ---- 3. External Cost (anti-double-count via stockMovements) ----
  let externalCost = 0
  let skippedDueToStockLink = 0
  const externalIds: string[] = []
  const dq_invoiceLiLinked: string[] = []
  for (const li of lineItems) {
    const linked = li.stockMovements ?? []
    if (linked.length > 0) {
      skippedDueToStockLink++
      dq_invoiceLiLinked.push(li.id)
      continue
    }
    externalCost += toNumber(li.totalNet ?? 0)
    externalIds.push(li.id)
  }

  // ---- 4. Travel (Decision 27 — snapshot-aware) ----
  let travelMinutes = 0
  let travelCost = 0
  let travelWrWithSnapshot = 0
  let travelWrWithoutSnapshot = 0
  const travelWrIds: string[] = []
  const dq_travelNullSnapshot: string[] = []
  for (const wr of workReports) {
    if (wr.status === "VOID") continue
    const minutes = wr.travelMinutes ?? 0
    if (minutes <= 0) continue
    travelMinutes += minutes
    travelWrIds.push(wr.id)

    let rate: number | null
    if (wr.travelRateAtSign != null) {
      rate = toNumber(wr.travelRateAtSign)
      travelWrWithSnapshot++
    } else {
      const resolved = resolveTravelRateExtended({
        orderRate: order?.billingRatePerHour ?? null,
        assignmentEmployees: (wr.assignments ?? []).map((a) => ({
          hourlyRate: a.employee?.hourlyRate ?? null,
          wageGroup: a.employee?.wageGroup ?? null,
        })),
      })
      rate = resolved.rate
      travelWrWithoutSnapshot++
      dq_travelNullSnapshot.push(wr.id)
    }
    travelCost += (minutes / 60) * (rate ?? 0)
  }
  const totalTravelWr = travelWrWithSnapshot + travelWrWithoutSnapshot
  const travelEstimatedShare =
    totalTravelWr > 0 ? travelWrWithoutSnapshot / totalTravelWr : 0

  // ---- 5. dataQualityIssues ----
  const issues: DataQualityIssue[] = []
  const pushIssue = (
    code: DataQualityIssueCode,
    severity: "info" | "warning" | "error",
    ids: string[],
  ) => {
    if (ids.length > 0) {
      issues.push({ code, severity, count: ids.length, affectedIds: ids })
    }
  }
  pushIssue("BOOKING_WITHOUT_RATE", "error", dq_bookingsWithoutRate)
  pushIssue("BOOKING_RATE_NULL_SNAPSHOT", "info", dq_bookingsRateNullSnapshot)
  pushIssue("PER_UNIT_WITHOUT_QUANTITY", "error", dq_perUnitWithoutQuantity)
  pushIssue("WORKREPORT_DRAFT", "warning", dq_workReportDraft)
  pushIssue(
    "BOOKING_WITHOUT_WORKREPORT",
    "warning",
    dq_bookingsWithoutWorkReport,
  )
  pushIssue("MOVEMENT_NO_UNIT_COST", "info", dq_movementNoUnitCost)
  pushIssue("INVOICE_LI_LINKED_VIA_STOCK", "info", dq_invoiceLiLinked)
  pushIssue("EMPLOYEE_INACTIVE_OR_DELETED", "warning", dq_inactiveEmployees)
  pushIssue("EMPLOYEE_NO_WAGE_GROUP", "info", dq_employeeNoWageGroup)
  pushIssue("TRAVEL_NULL_SNAPSHOT", "info", dq_travelNullSnapshot)

  // ---- 6. estimated overall ----
  const estimatedComponents: string[] = []
  if (laborEstimatedShare > 0) estimatedComponents.push("labor")
  if (materialEstimatedShare > 0) estimatedComponents.push("material")
  if (travelEstimatedShare > 0) estimatedComponents.push("travel")
  // Average across non-zero components for a lightweight overall measure.
  const components = [
    laborEstimatedShare,
    materialEstimatedShare,
    travelEstimatedShare,
  ].filter((c) => c > 0)
  const totalEstimatedShare =
    components.length > 0
      ? components.reduce((a, b) => a + b, 0) / components.length
      : 0

  return {
    orderId,
    laborHours: { ...labor, estimatedShare: laborEstimatedShare },
    flatItems: Array.from(flatMap.values()),
    unitItems: Array.from(unitMap.values()),
    travel: {
      totalMinutes: travelMinutes,
      totalCost: travelCost,
      estimatedShare: travelEstimatedShare,
      workReportIds: travelWrIds,
    },
    material: {
      totalCost: materialCost,
      estimatedShare: materialEstimatedShare,
      movementCount: movements.length,
      movementIds,
    },
    externalCost: {
      totalCost: externalCost,
      lineItemCount: externalIds.length,
      lineItemIds: externalIds,
      skippedDueToStockLink,
    },
    dataQualityIssues: issues,
    estimatedShare: totalEstimatedShare,
    estimatedComponents,
  }
}

export async function calculateIstAufwandBatch(
  prisma: PrismaClient,
  tenantId: string,
  orderIds: string[],
): Promise<Map<string, IstAufwandReport>> {
  const map = new Map<string, IstAufwandReport>()
  // Sequentially to avoid blowing the connection pool on huge tenants;
  // for smaller bursts the latency is fine. Future: add a parallel
  // chunk size if Phase 9 perf-test demands it.
  for (const id of orderIds) {
    const r = await calculateIstAufwand(prisma, tenantId, id)
    map.set(id, r)
  }
  return map
}

export async function calculateSollIstReport(
  prisma: PrismaClient,
  tenantId: string,
  orderId: string,
): Promise<SollIstReport> {
  const [target, ist] = await Promise.all([
    targetService.getActiveTarget(prisma, tenantId, orderId),
    calculateIstAufwand(prisma, tenantId, orderId),
  ])

  const targetOut = target
    ? {
        version: target.version,
        validFrom: target.validFrom,
        targetHours:
          target.targetHours == null ? null : Number(target.targetHours),
        targetMaterialCost:
          target.targetMaterialCost == null
            ? null
            : Number(target.targetMaterialCost),
        targetTravelMinutes: target.targetTravelMinutes,
        targetExternalCost:
          target.targetExternalCost == null
            ? null
            : Number(target.targetExternalCost),
        targetRevenue:
          target.targetRevenue == null ? null : Number(target.targetRevenue),
        targetUnitItems:
          Array.isArray(target.targetUnitItems)
            ? (target.targetUnitItems as Array<{
                activityId: string
                quantity: number
              }>)
            : null,
      }
    : null

  // Productivity
  const grossHoursIst = ist.laborHours.totalHours
  const flatHourEquivalents = ist.flatItems.reduce(
    (s, f) => s + f.calculatedHourEquivalent,
    0,
  )
  const productiveHoursTotal = grossHoursIst + flatHourEquivalents
  const productivity = {
    grossHoursIst,
    flatHourEquivalents,
    productiveHoursTotal,
    targetHours: targetOut?.targetHours ?? null,
    productivityPercent:
      targetOut?.targetHours && targetOut.targetHours > 0
        ? (productiveHoursTotal / targetOut.targetHours) * 100
        : null,
  }

  // Variance
  const istLaborMinutes = (ist.laborHours.totalHours +
    flatHourEquivalents) * 60
  const istLaborHours = istLaborMinutes / 60
  const istTravelMinutes = ist.travel.totalMinutes
  const istMaterial = ist.material.totalCost
  const istExternal = ist.externalCost.totalCost
  const flatItemRevenue = ist.flatItems.reduce(
    (s, f) => s + f.totalAmount,
    0,
  )
  const unitItemRevenue = ist.unitItems.reduce(
    (s, f) => s + f.totalAmount,
    0,
  )
  const istLaborRevenue =
    ist.laborHours.totalCost + flatItemRevenue + unitItemRevenue

  // Variance helpers (only when soll-side is present)
  const hoursVariance =
    targetOut?.targetHours != null
      ? istLaborHours - targetOut.targetHours
      : null
  const materialVariance =
    targetOut?.targetMaterialCost != null
      ? istMaterial - targetOut.targetMaterialCost
      : null
  const travelVariance =
    targetOut?.targetTravelMinutes != null
      ? istTravelMinutes - targetOut.targetTravelMinutes
      : null
  const externalCostVariance =
    targetOut?.targetExternalCost != null
      ? istExternal - targetOut.targetExternalCost
      : null

  // Unit-item variance
  const sollByActivity = new Map<string, number>()
  for (const item of targetOut?.targetUnitItems ?? []) {
    sollByActivity.set(item.activityId, item.quantity)
  }
  const istByActivity = new Map<string, { qty: number; name: string; unit: string }>()
  for (const u of ist.unitItems) {
    istByActivity.set(u.activityId, {
      qty: u.quantity,
      name: u.activityName,
      unit: u.unit,
    })
  }
  const allActivityIds = new Set<string>([
    ...sollByActivity.keys(),
    ...istByActivity.keys(),
  ])
  const unitItemsVariance: SollIstReport["comparison"]["unitItemsVariance"] = []
  for (const id of allActivityIds) {
    const sollQty = sollByActivity.get(id) ?? 0
    const ist = istByActivity.get(id)
    const istQty = ist?.qty ?? 0
    const variance = istQty - sollQty
    unitItemsVariance.push({
      activityId: id,
      activityName: ist?.name ?? id,
      unit: ist?.unit ?? "",
      sollQuantity: sollQty,
      istQuantity: istQty,
      variance,
      variancePercent: variancePercent(istQty, sollQty),
    })
  }

  // DB-Stufen: based on Soll-Erlös
  const sollErloes = targetOut?.targetRevenue ?? null
  let db1: number | null = null
  let db2: number | null = null
  let db3: number | null = null
  if (sollErloes != null) {
    db1 = sollErloes - istMaterial
    db2 = db1 - ist.laborHours.totalCost - flatItemRevenue - unitItemRevenue
    db3 = db2 - ist.travel.totalCost - istExternal
  }

  const hourlyMargin =
    db2 != null && productiveHoursTotal > 0
      ? db2 / productiveHoursTotal
      : null

  return {
    orderId,
    target: targetOut,
    ist,
    comparison: {
      hoursVariance,
      hoursVariancePercent:
        targetOut?.targetHours != null
          ? variancePercent(istLaborHours, targetOut.targetHours)
          : null,
      materialVariance,
      materialVariancePercent:
        targetOut?.targetMaterialCost != null
          ? variancePercent(istMaterial, targetOut.targetMaterialCost)
          : null,
      travelVariance,
      travelVariancePercent:
        targetOut?.targetTravelMinutes != null
          ? variancePercent(istTravelMinutes, targetOut.targetTravelMinutes)
          : null,
      externalCostVariance,
      externalCostVariancePercent:
        targetOut?.targetExternalCost != null
          ? variancePercent(istExternal, targetOut.targetExternalCost)
          : null,
      unitItemsVariance,
    },
    marginContribution: {
      sollErloes,
      db1,
      db2,
      db3,
      db1Percent: sollErloes != null && db1 != null ? pct(db1, sollErloes) : null,
      db2Percent: sollErloes != null && db2 != null ? pct(db2, sollErloes) : null,
      db3Percent: sollErloes != null && db3 != null ? pct(db3, sollErloes) : null,
    },
    productivity,
    hourlyMargin,
  }
}

// --- Phase 9: dimension aggregation ---

export async function aggregateByDimension(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    dimension: AggregationDimension
    dateFrom: Date
    dateTo: Date
    orderTypeId?: string
    sortBy?:
      | "margin_desc"
      | "margin_asc"
      | "hourly_margin_desc"
      | "revenue_desc"
    limit?: number
  },
): Promise<DimensionAggregate[]> {
  // NK-1-FIX-AGG-1 (closing-pass-followup 2026-05-06): treat `dateTo` as
  // the END of the day so orders with `createdAt` on the filter's last
  // day are included. The page sends date-only ISO strings (`2026-05-06`)
  // which parse to `2026-05-06T00:00:00Z` — a strict `<= dateTo` filter
  // excluded everything created later that day. We bump dateTo by one
  // day and use a strict `<` comparison instead.
  const dateToExclusive = new Date(params.dateTo)
  dateToExclusive.setUTCDate(dateToExclusive.getUTCDate() + 1)

  const where: Record<string, unknown> = {
    tenantId,
    createdAt: { gte: params.dateFrom, lt: dateToExclusive },
  }
  if (params.orderTypeId) {
    where.orderTypeId = params.orderTypeId
  }
  const orders = await prisma.order.findMany({
    where,
    select: {
      id: true,
      code: true,
      name: true,
      customer: true,
      serviceObjectId: true,
      orderTypeId: true,
    },
  })

  if (orders.length === 0) return []

  const reports = await calculateIstAufwandBatch(
    prisma,
    tenantId,
    orders.map((o) => o.id),
  )
  const targetMap = new Map<string, number>()
  const targets = await prisma.orderTarget.findMany({
    where: {
      tenantId,
      orderId: { in: orders.map((o) => o.id) },
      validTo: null,
    },
  })
  for (const t of targets) {
    if (t.targetRevenue != null) {
      targetMap.set(t.orderId, Number(t.targetRevenue))
    }
  }

  // NK-1-FIX-AGG-2 (closing-pass-followup 2026-05-06): resolve human-
  // readable labels for `order_type` and `service_object` dimensions
  // instead of returning the raw UUIDs. The Reports-Page renders the
  // label directly via `<TableCell>{row.dimensionLabel}</TableCell>`,
  // so without this lookup the user sees an opaque UUID.
  const orderTypeLabelMap = new Map<string, string>()
  if (params.dimension === "order_type") {
    const otIds = Array.from(
      new Set(orders.map((o) => o.orderTypeId).filter((x): x is string => !!x)),
    )
    if (otIds.length > 0) {
      const otRows = await prisma.orderType.findMany({
        where: { tenantId, id: { in: otIds } },
        select: { id: true, code: true, name: true },
      })
      for (const ot of otRows) {
        orderTypeLabelMap.set(ot.id, `${ot.code} - ${ot.name}`)
      }
    }
  }
  const serviceObjectLabelMap = new Map<string, string>()
  if (params.dimension === "service_object") {
    const soIds = Array.from(
      new Set(
        orders.map((o) => o.serviceObjectId).filter((x): x is string => !!x),
      ),
    )
    if (soIds.length > 0) {
      const soRows = await prisma.serviceObject.findMany({
        where: { tenantId, id: { in: soIds } },
        select: { id: true, number: true, name: true },
      })
      for (const so of soRows) {
        serviceObjectLabelMap.set(so.id, `${so.number} — ${so.name}`)
      }
    }
  }

  // Group by dimension key
  const buckets = new Map<
    string,
    {
      label: string
      orderIds: string[]
    }
  >()
  for (const order of orders) {
    let key: string
    let label: string
    switch (params.dimension) {
      case "customer":
        key = order.customer ?? "_no_customer"
        label = order.customer ?? "Ohne Kunde"
        break
      case "service_object":
        key = order.serviceObjectId ?? "_no_so"
        label = order.serviceObjectId
          ? serviceObjectLabelMap.get(order.serviceObjectId) ??
            order.serviceObjectId
          : "Ohne Anlage"
        break
      case "order_type":
        key = order.orderTypeId ?? "_no_ot"
        label = order.orderTypeId
          ? orderTypeLabelMap.get(order.orderTypeId) ?? order.orderTypeId
          : "Ohne Auftragstyp"
        break
      case "employee":
        // Use the first booking's employee as a placeholder. Real impl
        // would need a per-booking explosion; for NK-1 dashboard
        // overview we expose a minimal grouping.
        key = order.id
        label = order.id
        break
    }
    const bucket = buckets.get(key) ?? { label, orderIds: [] }
    bucket.orderIds.push(order.id)
    buckets.set(key, bucket)
  }

  // NK-1-FIX-AGG-3 (closing-pass-followup 2026-05-06): build a per-order
  // summary so the drill-sheet can render the underlying orders. The
  // page reads `row.orders` and passes it to `NkDimensionDrillSheet`
  // — without this map, the drill always shows an empty table.
  const orderById = new Map(orders.map((o) => [o.id, o]))

  const aggregates: DimensionAggregate[] = []
  for (const [key, b] of buckets.entries()) {
    let totalRevenue = 0
    let totalLaborHours = 0
    let totalLaborCost = 0
    let totalMaterialCost = 0
    let totalTravelCost = 0
    let totalExternalCost = 0
    let totalEstimated = 0
    let count = 0
    const dimensionOrders: DimensionAggregateOrder[] = []
    for (const oid of b.orderIds) {
      const r = reports.get(oid)
      if (!r) continue
      const orderRevenue = targetMap.get(oid) ?? 0
      totalRevenue += orderRevenue
      totalLaborHours += r.laborHours.totalHours
      totalLaborCost += r.laborHours.totalCost
      totalMaterialCost += r.material.totalCost
      totalTravelCost += r.travel.totalCost
      totalExternalCost += r.externalCost.totalCost
      totalEstimated += r.estimatedShare
      count++

      // Per-order DB II% + Rohertrag/h für die Drill-Sheet-Tabelle.
      const orderDb1 = orderRevenue - r.material.totalCost
      const orderDb2 = orderDb1 - r.laborHours.totalCost
      const orderInfo = orderById.get(oid)
      dimensionOrders.push({
        orderId: oid,
        code: orderInfo?.code ?? oid,
        name: orderInfo?.name ?? "",
        db2Percent: pct(orderDb2, orderRevenue),
        hourlyMargin:
          r.laborHours.totalHours > 0
            ? orderDb2 / r.laborHours.totalHours
            : null,
      })
    }
    const db1 = totalRevenue - totalMaterialCost
    const db2 = db1 - totalLaborCost
    const db3 = db2 - totalTravelCost - totalExternalCost
    aggregates.push({
      dimensionKey: key,
      dimensionLabel: b.label,
      orderCount: count,
      totalLaborHours,
      totalLaborCost,
      totalMaterialCost,
      totalTravelCost,
      totalExternalCost,
      totalRevenue,
      db1,
      db2,
      db3,
      db1Percent: pct(db1, totalRevenue),
      db2Percent: pct(db2, totalRevenue),
      db3Percent: pct(db3, totalRevenue),
      hourlyMargin: totalLaborHours > 0 ? db2 / totalLaborHours : null,
      estimatedShare: count > 0 ? totalEstimated / count : 0,
      orders: dimensionOrders,
    })
  }

  // Sort
  const sortBy = params.sortBy ?? "margin_desc"
  aggregates.sort((a, b) => {
    switch (sortBy) {
      case "margin_desc":
        return (b.db2Percent ?? -Infinity) - (a.db2Percent ?? -Infinity)
      case "margin_asc":
        return (a.db2Percent ?? Infinity) - (b.db2Percent ?? Infinity)
      case "hourly_margin_desc":
        return (b.hourlyMargin ?? -Infinity) - (a.hourlyMargin ?? -Infinity)
      case "revenue_desc":
        return b.totalRevenue - a.totalRevenue
    }
  })

  if (params.limit && aggregates.length > params.limit) {
    return aggregates.slice(0, params.limit)
  }
  return aggregates
}

export async function recentOrdersDashboard(
  prisma: PrismaClient,
  tenantId: string,
  params: {
    days: number
    sortBy: "margin_desc" | "margin_asc" | "hourly_margin_desc"
    limit: number
  },
): Promise<
  Array<{
    orderId: string
    code: string
    name: string
    customer: string | null
    db2Percent: number | null
    hourlyMargin: number | null
    estimatedShare: number
  }>
> {
  const since = new Date()
  since.setDate(since.getDate() - params.days)

  const orders = await prisma.order.findMany({
    where: {
      tenantId,
      createdAt: { gte: since },
    },
    select: {
      id: true,
      code: true,
      name: true,
      customer: true,
    },
    take: params.limit * 3, // overshoot, sort below
  })
  if (orders.length === 0) return []

  const reports = await calculateIstAufwandBatch(
    prisma,
    tenantId,
    orders.map((o) => o.id),
  )
  const targets = await prisma.orderTarget.findMany({
    where: {
      tenantId,
      orderId: { in: orders.map((o) => o.id) },
      validTo: null,
    },
    select: { orderId: true, targetRevenue: true },
  })
  const tMap = new Map(
    targets.map((t) => [
      t.orderId,
      t.targetRevenue == null ? null : Number(t.targetRevenue),
    ]),
  )

  const rows = orders.map((o) => {
    const r = reports.get(o.id)!
    const revenue = tMap.get(o.id) ?? 0
    const db2 =
      revenue - r.material.totalCost - r.laborHours.totalCost
    return {
      orderId: o.id,
      code: o.code,
      name: o.name,
      customer: o.customer,
      db2Percent: revenue > 0 ? (db2 / revenue) * 100 : null,
      hourlyMargin:
        r.laborHours.totalHours > 0 ? db2 / r.laborHours.totalHours : null,
      estimatedShare: r.estimatedShare,
    }
  })

  rows.sort((a, b) => {
    switch (params.sortBy) {
      case "margin_desc":
        return (b.db2Percent ?? -Infinity) - (a.db2Percent ?? -Infinity)
      case "margin_asc":
        return (a.db2Percent ?? Infinity) - (b.db2Percent ?? Infinity)
      case "hourly_margin_desc":
        return (b.hourlyMargin ?? -Infinity) - (a.hourlyMargin ?? -Infinity)
    }
  })

  return rows.slice(0, params.limit)
}
