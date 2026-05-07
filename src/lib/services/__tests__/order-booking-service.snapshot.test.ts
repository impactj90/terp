/**
 * Phase 3 — OrderBooking snapshot tests (NK-1, Decision 14, Decision 26)
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
import * as bookingService from "../order-booking-service"
import { OrderBookingValidationError } from "../order-booking-service"

const TENANT_ID = "f0000000-0000-4000-a000-0000000a1401"
const TENANT_SLUG = "ob-snapshot-test"
const EMP_ID = "f0000000-0000-4000-a000-0000000a1402"
const ORDER_ID = "f0000000-0000-4000-a000-0000000a1403"
const ACT_HOURLY_ID = "f0000000-0000-4000-a000-0000000a1404"
const ACT_FLAT_ID = "f0000000-0000-4000-a000-0000000a1405"
const ACT_PER_UNIT_ID = "f0000000-0000-4000-a000-0000000a1406"
const WG_ID = "f0000000-0000-4000-a000-0000000a1407"
const USER_ID = "a0000000-0000-4000-a000-0000000a1499"

beforeAll(async () => {
  await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: {},
    create: {
      id: TENANT_ID,
      name: "OrderBooking Snapshot",
      slug: TENANT_SLUG,
      isActive: true,
    },
  })

  // Pre-create everything (idempotent for repeated test runs)
  await prisma.orderBooking.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.activity.deleteMany({ where: { tenantId: TENANT_ID } })
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
      personnelNumber: "OB-S-1",
      pin: "ob-pin-1",
      firstName: "S",
      lastName: "T",
      entryDate: new Date("2024-01-01"),
      hourlyRate: 60,
      wageGroupId: WG_ID,
    },
  })

  await prisma.order.create({
    data: {
      id: ORDER_ID,
      tenantId: TENANT_ID,
      code: "ORD-S-1",
      name: "Order S",
      status: "active",
      billingRatePerHour: 80,
    },
  })

  await prisma.activity.createMany({
    data: [
      {
        id: ACT_HOURLY_ID,
        tenantId: TENANT_ID,
        code: "ACT_HOURLY",
        name: "Hourly",
        pricingType: "HOURLY",
        hourlyRate: 75,
      },
      {
        id: ACT_FLAT_ID,
        tenantId: TENANT_ID,
        code: "ACT_FLAT",
        name: "Flat",
        pricingType: "FLAT_RATE",
        flatRate: 89,
      },
      {
        id: ACT_PER_UNIT_ID,
        tenantId: TENANT_ID,
        code: "ACT_PU",
        name: "Per Unit",
        pricingType: "PER_UNIT",
        unit: "lfm",
      },
    ],
  })
})

afterAll(async () => {
  await prisma.orderBooking.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.activity.deleteMany({ where: { tenantId: TENANT_ID } })
  await prisma.order.deleteMany({ where: { id: ORDER_ID } })
  await prisma.employee.deleteMany({ where: { id: EMP_ID } })
  await prisma.wageGroup.deleteMany({ where: { id: WG_ID } })
  await prisma.tenant.deleteMany({ where: { id: TENANT_ID } })
})

beforeEach(async () => {
  await prisma.orderBooking.deleteMany({ where: { tenantId: TENANT_ID } })
})

describe("order-booking-service.create snapshot (Decision 14)", () => {
  it("FLAT_RATE activity → activity_flat source", async () => {
    const b = await bookingService.create(prisma, TENANT_ID, USER_ID, {
      employeeId: EMP_ID,
      orderId: ORDER_ID,
      activityId: ACT_FLAT_ID,
      bookingDate: "2026-04-29",
      timeMinutes: 60,
    })
    expect(Number(b.hourlyRateAtBooking)).toBe(89)
    expect(b.hourlyRateSourceAtBooking).toBe("activity_flat")
  })

  it("HOURLY activity → activity_hourly source", async () => {
    const b = await bookingService.create(prisma, TENANT_ID, USER_ID, {
      employeeId: EMP_ID,
      orderId: ORDER_ID,
      activityId: ACT_HOURLY_ID,
      bookingDate: "2026-04-29",
      timeMinutes: 60,
    })
    expect(Number(b.hourlyRateAtBooking)).toBe(75)
    expect(b.hourlyRateSourceAtBooking).toBe("activity_hourly")
  })

  it("no activity → falls through to order rate", async () => {
    const b = await bookingService.create(prisma, TENANT_ID, USER_ID, {
      employeeId: EMP_ID,
      orderId: ORDER_ID,
      bookingDate: "2026-04-29",
      timeMinutes: 60,
    })
    expect(Number(b.hourlyRateAtBooking)).toBe(80)
    expect(b.hourlyRateSourceAtBooking).toBe("order")
  })

  it("snapshot survives later activity rate change", async () => {
    const b = await bookingService.create(prisma, TENANT_ID, USER_ID, {
      employeeId: EMP_ID,
      orderId: ORDER_ID,
      activityId: ACT_FLAT_ID,
      bookingDate: "2026-04-29",
      timeMinutes: 60,
    })
    // Mutate activity flatRate after booking
    await prisma.activity.update({
      where: { id: ACT_FLAT_ID },
      data: { flatRate: 200 },
    })
    const fresh = await prisma.orderBooking.findUnique({ where: { id: b.id } })
    // Snapshot is unchanged
    expect(Number(fresh!.hourlyRateAtBooking)).toBe(89)
    // Restore for next tests
    await prisma.activity.update({
      where: { id: ACT_FLAT_ID },
      data: { flatRate: 89 },
    })
  })
})

describe("order-booking-service PER_UNIT (Decision 26)", () => {
  it("requires quantity > 0 for PER_UNIT activity on create", async () => {
    await expect(
      bookingService.create(prisma, TENANT_ID, USER_ID, {
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_PER_UNIT_ID,
        bookingDate: "2026-04-29",
        timeMinutes: 60,
      }),
    ).rejects.toThrow(OrderBookingValidationError)
  })

  it("rejects quantity <= 0 for PER_UNIT activity", async () => {
    await expect(
      bookingService.create(prisma, TENANT_ID, USER_ID, {
        employeeId: EMP_ID,
        orderId: ORDER_ID,
        activityId: ACT_PER_UNIT_ID,
        bookingDate: "2026-04-29",
        timeMinutes: 60,
        quantity: 0,
      }),
    ).rejects.toThrow(OrderBookingValidationError)
  })

  it("accepts quantity > 0 for PER_UNIT activity", async () => {
    const b = await bookingService.create(prisma, TENANT_ID, USER_ID, {
      employeeId: EMP_ID,
      orderId: ORDER_ID,
      activityId: ACT_PER_UNIT_ID,
      bookingDate: "2026-04-29",
      timeMinutes: 60,
      quantity: 12.5,
    })
    expect(Number(b.quantity)).toBe(12.5)
  })

  it("ignores quantity for HOURLY activity (sets to null)", async () => {
    const b = await bookingService.create(prisma, TENANT_ID, USER_ID, {
      employeeId: EMP_ID,
      orderId: ORDER_ID,
      activityId: ACT_HOURLY_ID,
      bookingDate: "2026-04-29",
      timeMinutes: 60,
      quantity: 5,
    })
    expect(b.quantity).toBeNull()
  })
})
