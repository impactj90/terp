import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@/lib/db/prisma"
import * as service from "../service-object-service"
import * as withdrawalService from "../wh-withdrawal-service"
import * as stockMovementService from "../wh-stock-movement-service"
import * as orderService from "../order-service"
import { ServiceObjectNotFoundError } from "../service-object-service"

const HAS_DB = Boolean(process.env.DATABASE_URL)

// 09xx range reserved for service-object-history integration tests
const T1 = "f0000000-0000-4000-a000-000000000901"
const T2 = "f0000000-0000-4000-a000-000000000902"
const U1 = "a0000000-0000-4000-a000-000000000901"
const U2 = "a0000000-0000-4000-a000-000000000902"
const U_UNKNOWN = "a0000000-0000-4000-a000-0000000009aa"

const ADDR_T1 = "a1000000-0000-4000-a000-000000000901"
const ADDR_T2 = "a1000000-0000-4000-a000-000000000902"

const SO_T1 = "50000000-0000-4000-a000-000000000901"
const SO_T2 = "50000000-0000-4000-a000-000000000902"
const SO_T1_EMPTY = "50000000-0000-4000-a000-000000000903"

const EMP_T1 = "e0000000-0000-4000-a000-000000000901"

const ORDER_T1_A = "d1000000-0000-4000-a000-000000000901"
const ORDER_T1_B = "d1000000-0000-4000-a000-000000000902"
const ORDER_T1_C = "d1000000-0000-4000-a000-000000000903"
const ORDER_T2 = "d1000000-0000-4000-a000-000000000911"

const ART_T1 = "b1000000-0000-4000-a000-000000000901"
const ART_T2 = "b1000000-0000-4000-a000-000000000911"

const MV_T1_A = "c0000000-0000-4000-a000-000000000901"
const MV_T1_B = "c0000000-0000-4000-a000-000000000902"
const MV_T1_NO_USER = "c0000000-0000-4000-a000-000000000903"
const MV_T1_UNKNOWN_USER = "c0000000-0000-4000-a000-000000000904"
const MV_T2 = "c0000000-0000-4000-a000-000000000911"

async function cleanup() {
  await prisma.whStockMovement
    .deleteMany({ where: { tenantId: { in: [T1, T2] } } })
    .catch(() => {})
  await prisma.orderBooking
    .deleteMany({ where: { tenantId: { in: [T1, T2] } } })
    .catch(() => {})
  await prisma.orderAssignment
    .deleteMany({ where: { tenantId: { in: [T1, T2] } } })
    .catch(() => {})
  await prisma.order
    .deleteMany({ where: { tenantId: { in: [T1, T2] } } })
    .catch(() => {})
  await prisma.whArticle
    .deleteMany({ where: { tenantId: { in: [T1, T2] } } })
    .catch(() => {})
  await prisma.serviceObject
    .deleteMany({ where: { tenantId: { in: [T1, T2] } } })
    .catch(() => {})
  await prisma.crmAddress
    .deleteMany({ where: { tenantId: { in: [T1, T2] } } })
    .catch(() => {})
  await prisma.employee
    .deleteMany({ where: { tenantId: { in: [T1, T2] } } })
    .catch(() => {})
  await prisma.user
    .deleteMany({ where: { id: { in: [U1, U2, U_UNKNOWN] } } })
    .catch(() => {})
  await prisma.tenant
    .deleteMany({ where: { id: { in: [T1, T2] } } })
    .catch(() => {})
}

describe.skipIf(!HAS_DB)(
  "service-object-service.getHistoryByServiceObject — Integration",
  () => {
    beforeAll(async () => {
      await cleanup()

      await prisma.tenant.createMany({
        data: [
          { id: T1, name: "SO History T1", slug: "so-hist-t1", isActive: true },
          { id: T2, name: "SO History T2", slug: "so-hist-t2", isActive: true },
        ],
      })

      await prisma.user.createMany({
        data: [
          {
            id: U1,
            email: "so-hist-u1@integration.local",
            displayName: "Hans Müller",
            role: "admin",
            tenantId: T1,
          },
          {
            id: U2,
            email: "so-hist-u2@integration.local",
            displayName: "Erika Beispiel",
            role: "admin",
            tenantId: T1,
          },
        ],
      })

      await prisma.crmAddress.createMany({
        data: [
          {
            id: ADDR_T1,
            tenantId: T1,
            number: "K-T1-901",
            type: "CUSTOMER",
            company: "Kunde T1",
          },
          {
            id: ADDR_T2,
            tenantId: T2,
            number: "K-T2-902",
            type: "CUSTOMER",
            company: "Kunde T2",
          },
        ],
      })

      await prisma.serviceObject.createMany({
        data: [
          {
            id: SO_T1,
            tenantId: T1,
            number: "SO-T1-901",
            name: "SO T1",
            kind: "EQUIPMENT",
            customerAddressId: ADDR_T1,
          },
          {
            id: SO_T1_EMPTY,
            tenantId: T1,
            number: "SO-T1-EMPTY-903",
            name: "SO T1 empty",
            kind: "EQUIPMENT",
            customerAddressId: ADDR_T1,
          },
          {
            id: SO_T2,
            tenantId: T2,
            number: "SO-T2-902",
            name: "SO T2",
            kind: "EQUIPMENT",
            customerAddressId: ADDR_T2,
          },
        ],
      })

      await prisma.employee.create({
        data: {
          id: EMP_T1,
          tenantId: T1,
          personnelNumber: "P901",
          pin: "0000",
          firstName: "Hans",
          lastName: "Müller",
          entryDate: new Date("2024-01-01"),
        },
      })

      // 3 orders on T1 SO + 1 order on T2 SO
      await prisma.order.createMany({
        data: [
          {
            id: ORDER_T1_A,
            tenantId: T1,
            code: "ORD-A",
            name: "Order A",
            status: "active",
            serviceObjectId: SO_T1,
            createdAt: new Date("2026-01-10T10:00:00Z"),
          },
          {
            id: ORDER_T1_B,
            tenantId: T1,
            code: "ORD-B",
            name: "Order B",
            status: "active",
            serviceObjectId: SO_T1,
            createdAt: new Date("2026-02-20T10:00:00Z"),
          },
          {
            id: ORDER_T1_C,
            tenantId: T1,
            code: "ORD-C",
            name: "Order C",
            status: "active",
            serviceObjectId: SO_T1,
            createdAt: new Date("2026-03-15T10:00:00Z"),
          },
          {
            id: ORDER_T2,
            tenantId: T2,
            code: "ORD-T2",
            name: "Order T2",
            status: "active",
            serviceObjectId: SO_T2,
            createdAt: new Date("2026-03-01T10:00:00Z"),
          },
        ],
      })

      // Assignments: EMP_T1 -> ORDER_T1_A + ORDER_T1_B
      await prisma.orderAssignment.createMany({
        data: [
          {
            tenantId: T1,
            orderId: ORDER_T1_A,
            employeeId: EMP_T1,
            role: "worker",
          },
          {
            tenantId: T1,
            orderId: ORDER_T1_B,
            employeeId: EMP_T1,
            role: "worker",
          },
        ],
      })

      // Bookings: 2 bookings per order in T1 = 6 bookings total
      await prisma.orderBooking.createMany({
        data: [
          {
            tenantId: T1,
            employeeId: EMP_T1,
            orderId: ORDER_T1_A,
            bookingDate: new Date("2026-01-12"),
            timeMinutes: 60,
          },
          {
            tenantId: T1,
            employeeId: EMP_T1,
            orderId: ORDER_T1_A,
            bookingDate: new Date("2026-01-15"),
            timeMinutes: 90,
          },
          {
            tenantId: T1,
            employeeId: EMP_T1,
            orderId: ORDER_T1_B,
            bookingDate: new Date("2026-02-22"),
            timeMinutes: 120,
          },
          {
            tenantId: T1,
            employeeId: EMP_T1,
            orderId: ORDER_T1_B,
            bookingDate: new Date("2026-02-25"),
            timeMinutes: 45,
          },
          {
            tenantId: T1,
            employeeId: EMP_T1,
            orderId: ORDER_T1_C,
            bookingDate: new Date("2026-03-18"),
            timeMinutes: 30,
          },
          {
            tenantId: T1,
            employeeId: EMP_T1,
            orderId: ORDER_T1_C,
            bookingDate: new Date("2026-03-20"),
            timeMinutes: 75,
          },
        ],
      })

      await prisma.whArticle.createMany({
        data: [
          {
            id: ART_T1,
            tenantId: T1,
            number: "ART-T1",
            name: "Article T1",
            unit: "Stk",
            stockTracking: true,
            currentStock: 100,
          },
          {
            id: ART_T2,
            tenantId: T2,
            number: "ART-T2",
            name: "Article T2",
            unit: "Stk",
            stockTracking: true,
            currentStock: 100,
          },
        ],
      })

      // Movements on SO_T1: 2 with real user, 1 no user, 1 with unknown user
      await prisma.whStockMovement.createMany({
        data: [
          {
            id: MV_T1_A,
            tenantId: T1,
            articleId: ART_T1,
            type: "WITHDRAWAL",
            quantity: -5,
            previousStock: 100,
            newStock: 95,
            serviceObjectId: SO_T1,
            createdById: U1,
            date: new Date("2026-03-10T10:00:00Z"),
          },
          {
            id: MV_T1_B,
            tenantId: T1,
            articleId: ART_T1,
            type: "DELIVERY_NOTE",
            quantity: -2,
            previousStock: 95,
            newStock: 93,
            serviceObjectId: SO_T1,
            createdById: U2,
            date: new Date("2026-03-12T10:00:00Z"),
          },
          {
            id: MV_T1_NO_USER,
            tenantId: T1,
            articleId: ART_T1,
            type: "WITHDRAWAL",
            quantity: -1,
            previousStock: 93,
            newStock: 92,
            serviceObjectId: SO_T1,
            createdById: null,
            date: new Date("2026-03-13T10:00:00Z"),
          },
          {
            id: MV_T1_UNKNOWN_USER,
            tenantId: T1,
            articleId: ART_T1,
            type: "WITHDRAWAL",
            quantity: -3,
            previousStock: 92,
            newStock: 89,
            serviceObjectId: SO_T1,
            createdById: U_UNKNOWN, // UUID that has no User row
            date: new Date("2026-03-14T10:00:00Z"),
          },
          {
            id: MV_T2,
            tenantId: T2,
            articleId: ART_T2,
            type: "WITHDRAWAL",
            quantity: -10,
            previousStock: 100,
            newStock: 90,
            serviceObjectId: SO_T2,
            date: new Date("2026-03-05T10:00:00Z"),
          },
        ],
      })
    })

    afterAll(async () => {
      await cleanup()
    })

    it("returns all 3 orders + 4 movements for SO in T1 with correct totals", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1
      )

      expect(result.orders).toHaveLength(3)
      expect(result.stockMovements).toHaveLength(4)
      expect(result.totals.orderCount).toBe(3)
      expect(result.totals.movementCount).toBe(4)
      // 60+90 + 120+45 + 30+75 = 420
      expect(result.totals.totalMinutes).toBe(420)
    })

    it("orders are sorted by createdAt DESC (newest first)", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1
      )
      expect(result.orders[0]?.id).toBe(ORDER_T1_C)
      expect(result.orders[1]?.id).toBe(ORDER_T1_B)
      expect(result.orders[2]?.id).toBe(ORDER_T1_A)
    })

    it("per-order booking summaries sum correctly", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1
      )
      const byId = new Map(result.orders.map((o) => [o.id, o]))
      expect(byId.get(ORDER_T1_A)?.summary.totalMinutes).toBe(150)
      expect(byId.get(ORDER_T1_A)?.summary.bookingCount).toBe(2)
      expect(byId.get(ORDER_T1_B)?.summary.totalMinutes).toBe(165)
      expect(byId.get(ORDER_T1_C)?.summary.totalMinutes).toBe(105)
    })

    it("assigned employees included on matching orders", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1
      )
      const byId = new Map(result.orders.map((o) => [o.id, o]))
      expect(byId.get(ORDER_T1_A)?.assignedEmployees).toHaveLength(1)
      expect(byId.get(ORDER_T1_A)?.assignedEmployees[0]?.firstName).toBe("Hans")
      expect(byId.get(ORDER_T1_C)?.assignedEmployees).toHaveLength(0)
    })

    it("movement with null createdById yields createdBy: null", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1
      )
      const noUser = result.stockMovements.find((m) => m.id === MV_T1_NO_USER)
      expect(noUser?.createdBy).toBeNull()
    })

    it('movement with unknown createdById yields "Unbekannt" fallback', async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1
      )
      const unknown = result.stockMovements.find(
        (m) => m.id === MV_T1_UNKNOWN_USER
      )
      expect(unknown?.createdBy).toEqual({
        userId: U_UNKNOWN,
        displayName: "Unbekannt",
      })
    })

    it("movement with known createdById resolves to displayName", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1
      )
      const known = result.stockMovements.find((m) => m.id === MV_T1_A)
      expect(known?.createdBy).toEqual({
        userId: U1,
        displayName: "Hans Müller",
      })
    })

    it("enforces cross-tenant isolation (T2 data NOT visible from T1)", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1
      )
      expect(result.orders.map((o) => o.id)).not.toContain(ORDER_T2)
      expect(result.stockMovements.map((m) => m.id)).not.toContain(MV_T2)
    })

    it("returns only T2 data when queried with T2 scope", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T2,
        SO_T2
      )
      expect(result.orders).toHaveLength(1)
      expect(result.orders[0]?.id).toBe(ORDER_T2)
      expect(result.stockMovements).toHaveLength(1)
      expect(result.stockMovements[0]?.id).toBe(MV_T2)
    })

    it("respects limit param (orders + movements)", async () => {
      const result = await service.getHistoryByServiceObject(
        prisma,
        T1,
        SO_T1,
        { limit: 1 }
      )
      expect(result.orders).toHaveLength(1)
      expect(result.stockMovements).toHaveLength(1)
    })

    it("throws ServiceObjectNotFoundError for unknown SO id", async () => {
      await expect(
        service.getHistoryByServiceObject(
          prisma,
          T1,
          "50000000-0000-4000-a000-0000000009ff"
        )
      ).rejects.toBeInstanceOf(ServiceObjectNotFoundError)
    })

    it("throws ServiceObjectNotFoundError when SO belongs to a different tenant", async () => {
      // SO_T2 exists but in T2; querying as T1 must throw (tenant isolation)
      await expect(
        service.getHistoryByServiceObject(prisma, T1, SO_T2)
      ).rejects.toBeInstanceOf(ServiceObjectNotFoundError)
    })

    // --- Empty-state (UC-G1, UC-G2) ---

    it("returns empty arrays and zero totals for a SO with no orders or movements", async () => {
      const result = await service.getHistoryByServiceObject(prisma, T1, SO_T1_EMPTY)
      expect(result.orders).toEqual([])
      expect(result.stockMovements).toEqual([])
      expect(result.totals).toEqual({
        orderCount: 0,
        totalMinutes: 0,
        movementCount: 0,
      })
    })

    // --- wh-withdrawal-service.listWithdrawals createdBy enrichment (UC-G3) ---

    it("listWithdrawals enriches each movement with createdBy.displayName", async () => {
      const { items } = await withdrawalService.listWithdrawals(prisma, T1, {
        page: 1,
        pageSize: 50,
      })
      const known = items.find((m) => m.id === MV_T1_A)
      expect(known?.createdBy).toEqual({
        userId: U1,
        displayName: "Hans Müller",
      })
      const noUser = items.find((m) => m.id === MV_T1_NO_USER)
      expect(noUser?.createdBy).toBeNull()
      const unknown = items.find((m) => m.id === MV_T1_UNKNOWN_USER)
      expect(unknown?.createdBy).toEqual({
        userId: U_UNKNOWN,
        displayName: "Unbekannt",
      })
    })

    it("listWithdrawals include returns the serviceObject name+number for rendering", async () => {
      const { items } = await withdrawalService.listWithdrawals(prisma, T1, {
        page: 1,
        pageSize: 50,
        serviceObjectId: SO_T1,
      })
      expect(items.length).toBeGreaterThan(0)
      for (const m of items) {
        expect(m.serviceObject).toEqual({
          id: SO_T1,
          number: "SO-T1-901",
          name: "SO T1",
        })
      }
    })

    // --- wh-stock-movement-service.listByArticle createdBy enrichment (UC-G4) ---

    it("listByArticle enriches each movement with createdBy.displayName", async () => {
      const items = await stockMovementService.listByArticle(prisma, T1, ART_T1)
      const known = items.find((m) => m.id === MV_T1_A)
      expect(known?.createdBy).toEqual({
        userId: U1,
        displayName: "Hans Müller",
      })
      const noUser = items.find((m) => m.id === MV_T1_NO_USER)
      expect(noUser?.createdBy).toBeNull()
      const unknown = items.find((m) => m.id === MV_T1_UNKNOWN_USER)
      expect(unknown?.createdBy).toEqual({
        userId: U_UNKNOWN,
        displayName: "Unbekannt",
      })
    })

    // --- order-service.list with serviceObjectId filter (UC-G5, UC-G6) ---

    it("orders.list filters by serviceObjectId and returns scoped orders", async () => {
      const orders = await orderService.list(prisma, T1, {
        serviceObjectId: SO_T1,
      })
      const ids = orders.map((o) => o.id)
      expect(ids).toContain(ORDER_T1_A)
      expect(ids).toContain(ORDER_T1_B)
      expect(ids).toContain(ORDER_T1_C)
      expect(ids).not.toContain(ORDER_T2)
    })

    it("orders.list returns empty for an SO with no orders", async () => {
      const orders = await orderService.list(prisma, T1, {
        serviceObjectId: SO_T1_EMPTY,
      })
      expect(orders).toEqual([])
    })

    it("orders.list Prisma rows include the serviceObjectId scalar for the router mapper", async () => {
      const orders = await orderService.list(prisma, T1, {
        serviceObjectId: SO_T1,
      })
      expect(orders.length).toBeGreaterThan(0)
      for (const o of orders) {
        expect(o.serviceObjectId).toBe(SO_T1)
      }
    })

    it("orders.list without serviceObjectId filter returns ALL orders (SO + non-SO)", async () => {
      const orders = await orderService.list(prisma, T1)
      const ids = orders.map((o) => o.id)
      expect(ids).toContain(ORDER_T1_A)
      expect(ids).toContain(ORDER_T1_B)
      expect(ids).toContain(ORDER_T1_C)
    })

    // --- T-2.1: order-service.create/update with serviceObjectId ---

    it("create accepts and persists serviceObjectId", async () => {
      const code = `T21-CR-${Date.now().toString().slice(-5)}`
      const created = await orderService.create(prisma, T1, {
        code,
        name: "T-2.1 create with SO",
        serviceObjectId: SO_T1_EMPTY,
      })
      expect(created.serviceObjectId).toBe(SO_T1_EMPTY)

      // cleanup
      await prisma.order.delete({ where: { id: created.id } })
    })

    it("create without serviceObjectId leaves it null", async () => {
      const code = `T21-CR-N-${Date.now().toString().slice(-5)}`
      const created = await orderService.create(prisma, T1, {
        code,
        name: "T-2.1 create without SO",
      })
      expect(created.serviceObjectId).toBeNull()
      await prisma.order.delete({ where: { id: created.id } })
    })

    it("create rejects a serviceObjectId from another tenant", async () => {
      const code = `T21-CR-X-${Date.now().toString().slice(-5)}`
      await expect(
        orderService.create(prisma, T1, {
          code,
          name: "T-2.1 cross-tenant",
          serviceObjectId: SO_T2, // belongs to T2
        })
      ).rejects.toThrow(/Service object not found/i)
    })

    it("update attaches a serviceObjectId to an existing order", async () => {
      const code = `T21-UP-${Date.now().toString().slice(-5)}`
      const created = await orderService.create(prisma, T1, {
        code,
        name: "T-2.1 update attach",
      })
      expect(created.serviceObjectId).toBeNull()

      const updated = await orderService.update(prisma, T1, {
        id: created.id,
        serviceObjectId: SO_T1_EMPTY,
      })
      expect(updated.serviceObjectId).toBe(SO_T1_EMPTY)

      await prisma.order.delete({ where: { id: created.id } })
    })

    it("update can clear the serviceObjectId (set to null)", async () => {
      const code = `T21-UP-C-${Date.now().toString().slice(-5)}`
      const created = await orderService.create(prisma, T1, {
        code,
        name: "T-2.1 update clear",
        serviceObjectId: SO_T1_EMPTY,
      })
      expect(created.serviceObjectId).toBe(SO_T1_EMPTY)

      const updated = await orderService.update(prisma, T1, {
        id: created.id,
        serviceObjectId: null,
      })
      expect(updated.serviceObjectId).toBeNull()

      await prisma.order.delete({ where: { id: created.id } })
    })

    it("update rejects a cross-tenant serviceObjectId", async () => {
      const code = `T21-UP-X-${Date.now().toString().slice(-5)}`
      const created = await orderService.create(prisma, T1, {
        code,
        name: "T-2.1 update cross-tenant",
      })

      await expect(
        orderService.update(prisma, T1, {
          id: created.id,
          serviceObjectId: SO_T2, // belongs to T2
        })
      ).rejects.toThrow(/Service object not found/i)

      await prisma.order.delete({ where: { id: created.id } })
    })

    it("create rejects a totally unknown serviceObjectId", async () => {
      const code = `T21-CR-U-${Date.now().toString().slice(-5)}`
      await expect(
        orderService.create(prisma, T1, {
          code,
          name: "T-2.1 unknown SO",
          serviceObjectId: "50000000-0000-4000-a000-0000000009ff",
        })
      ).rejects.toThrow(/Service object not found/i)
    })
  }
)
