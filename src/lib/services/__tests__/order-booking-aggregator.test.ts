import { describe, it, expect, vi } from "vitest"
import * as aggregator from "../order-booking-aggregator"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const ORDER_A = "d1000000-0000-4000-a000-000000000001"
const ORDER_B = "d1000000-0000-4000-a000-000000000002"
const ORDER_C = "d1000000-0000-4000-a000-000000000003"

function createMockPrisma(groupByReturn: unknown[] = []) {
  return {
    orderBooking: {
      groupBy: vi.fn().mockResolvedValue(groupByReturn),
    },
  } as unknown as PrismaClient
}

describe("order-booking-aggregator", () => {
  describe("getBookingSummaryByOrder", () => {
    it("returns zeros when no bookings exist", async () => {
      const prisma = createMockPrisma([])
      const result = await aggregator.getBookingSummaryByOrder(
        prisma,
        TENANT_ID,
        ORDER_A
      )
      expect(result).toEqual({
        orderId: ORDER_A,
        totalMinutes: 0,
        bookingCount: 0,
        lastBookingDate: null,
      })
    })

    it("returns summed minutes and count when bookings exist", async () => {
      const lastDate = new Date("2026-03-15T10:00:00Z")
      const prisma = createMockPrisma([
        {
          orderId: ORDER_A,
          _sum: { timeMinutes: 420 },
          _count: 3,
          _max: { bookingDate: lastDate },
        },
      ])
      const result = await aggregator.getBookingSummaryByOrder(
        prisma,
        TENANT_ID,
        ORDER_A
      )
      expect(result).toEqual({
        orderId: ORDER_A,
        totalMinutes: 420,
        bookingCount: 3,
        lastBookingDate: lastDate,
      })
    })

    it("scopes where-clause to tenantId + orderId", async () => {
      const prisma = createMockPrisma([])
      await aggregator.getBookingSummaryByOrder(prisma, TENANT_ID, ORDER_A)
      const call = (
        prisma.orderBooking.groupBy as ReturnType<typeof vi.fn>
      ).mock.calls[0]![0]
      expect(call.where).toEqual({ tenantId: TENANT_ID, orderId: ORDER_A })
    })
  })

  describe("getBookingSummariesByOrders", () => {
    it("returns empty map and does NOT call prisma on empty input", async () => {
      const prisma = createMockPrisma([])
      const map = await aggregator.getBookingSummariesByOrders(
        prisma,
        TENANT_ID,
        []
      )
      expect(map.size).toBe(0)
      expect(prisma.orderBooking.groupBy).not.toHaveBeenCalled()
    })

    it("maps aggregated rows by orderId", async () => {
      const dateA = new Date("2026-03-10T10:00:00Z")
      const dateB = new Date("2026-03-15T10:00:00Z")
      const prisma = createMockPrisma([
        {
          orderId: ORDER_A,
          _sum: { timeMinutes: 120 },
          _count: 2,
          _max: { bookingDate: dateA },
        },
        {
          orderId: ORDER_B,
          _sum: { timeMinutes: 300 },
          _count: 4,
          _max: { bookingDate: dateB },
        },
      ])
      const map = await aggregator.getBookingSummariesByOrders(
        prisma,
        TENANT_ID,
        [ORDER_A, ORDER_B]
      )
      expect(map.get(ORDER_A)).toEqual({
        orderId: ORDER_A,
        totalMinutes: 120,
        bookingCount: 2,
        lastBookingDate: dateA,
      })
      expect(map.get(ORDER_B)).toEqual({
        orderId: ORDER_B,
        totalMinutes: 300,
        bookingCount: 4,
        lastBookingDate: dateB,
      })
    })

    it("fills default entries for orderIds without any bookings", async () => {
      const prisma = createMockPrisma([
        {
          orderId: ORDER_A,
          _sum: { timeMinutes: 60 },
          _count: 1,
          _max: { bookingDate: new Date("2026-01-01T00:00:00Z") },
        },
      ])
      const map = await aggregator.getBookingSummariesByOrders(
        prisma,
        TENANT_ID,
        [ORDER_A, ORDER_B, ORDER_C]
      )
      expect(map.get(ORDER_B)).toEqual({
        orderId: ORDER_B,
        totalMinutes: 0,
        bookingCount: 0,
        lastBookingDate: null,
      })
      expect(map.get(ORDER_C)).toEqual({
        orderId: ORDER_C,
        totalMinutes: 0,
        bookingCount: 0,
        lastBookingDate: null,
      })
    })

    it("scopes where-clause to tenantId + orderId in-list", async () => {
      const prisma = createMockPrisma([])
      await aggregator.getBookingSummariesByOrders(prisma, TENANT_ID, [
        ORDER_A,
        ORDER_B,
      ])
      const call = (
        prisma.orderBooking.groupBy as ReturnType<typeof vi.fn>
      ).mock.calls[0]![0]
      expect(call.where.tenantId).toBe(TENANT_ID)
      expect(call.where.orderId).toEqual({ in: [ORDER_A, ORDER_B] })
    })

    it("handles null _sum gracefully", async () => {
      const prisma = createMockPrisma([
        {
          orderId: ORDER_A,
          _sum: { timeMinutes: null },
          _count: 0,
          _max: { bookingDate: null },
        },
      ])
      const map = await aggregator.getBookingSummariesByOrders(
        prisma,
        TENANT_ID,
        [ORDER_A]
      )
      expect(map.get(ORDER_A)).toEqual({
        orderId: ORDER_A,
        totalMinutes: 0,
        bookingCount: 0,
        lastBookingDate: null,
      })
    })
  })
})
