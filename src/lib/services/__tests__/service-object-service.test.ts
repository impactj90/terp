import { describe, it, expect, vi, beforeEach } from "vitest"
import * as service from "../service-object-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_A = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const CUSTOMER_A = "c0000000-0000-4000-a000-000000000001"
const CUSTOMER_B = "c0000000-0000-4000-b000-000000000002"
const OBJECT_ID = "so000000-0000-4000-a000-000000000001"
const PARENT_ID = "so000000-0000-4000-a000-000000000002"

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    crmAddress: {
      findFirst: vi.fn(),
    },
    serviceObject: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    order: {
      count: vi.fn().mockResolvedValue(0),
    },
    whStockMovement: {
      count: vi.fn().mockResolvedValue(0),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient
}

const customerAddress = {
  id: CUSTOMER_A,
  tenantId: TENANT_A,
  type: "CUSTOMER" as const,
}

const baseObject = {
  id: OBJECT_ID,
  tenantId: TENANT_A,
  number: "SO-001",
  name: "Test Machine",
  description: null,
  kind: "EQUIPMENT" as const,
  parentId: null,
  customerAddressId: CUSTOMER_A,
  internalNumber: null,
  manufacturer: null,
  model: null,
  serialNumber: null,
  yearBuilt: null,
  inServiceSince: null,
  status: "OPERATIONAL" as const,
  isActive: true,
  qrCodePayload: "TERP:SO:a00000:SO-001",
  customFields: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
}

describe("service-object-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("createServiceObject", () => {
    it("creates with happy path and sets qr payload", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // findByNumber — no dup
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )
      ;(prisma.serviceObject.create as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseObject
      )

      const result = await service.createServiceObject(prisma, TENANT_A, {
        number: "SO-001",
        name: "Test Machine",
        customerAddressId: CUSTOMER_A,
      })

      expect(result.id).toBe(OBJECT_ID)
      expect(prisma.serviceObject.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_A,
            number: "SO-001",
            qrCodePayload: "TERP:SO:a00000:SO-001",
          }),
        })
      )
    })

    it("rejects duplicate number with ConflictError", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseObject
      )

      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "SO-001",
          name: "Dup",
          customerAddressId: CUSTOMER_A,
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectConflictError)
    })

    it("rejects customer address from different tenant", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      // CrmAddress.findFirst scoped with tenantId: TENANT_A will NOT find
      // an address belonging to TENANT_B, so it returns null.
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "SO-002",
          name: "Cross tenant",
          customerAddressId: CUSTOMER_B, // address from TENANT_B
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)

      expect(prisma.serviceObject.create).not.toHaveBeenCalled()
    })

    it("rejects customer address that is SUPPLIER-only", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...customerAddress,
        type: "SUPPLIER",
      })

      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "SO-003",
          name: "Supplier addr",
          customerAddressId: CUSTOMER_A,
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })

    it("rejects out-of-range yearBuilt", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )

      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "SO-004",
          name: "Old machine",
          customerAddressId: CUSTOMER_A,
          yearBuilt: 1899,
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })

    it("rejects parent that belongs to different customer", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null) // findByNumber
        .mockResolvedValueOnce({ id: PARENT_ID, customerAddressId: CUSTOMER_B }) // parent lookup
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )

      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "SO-005",
          name: "Child",
          customerAddressId: CUSTOMER_A,
          parentId: PARENT_ID,
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })
  })

  describe("updateServiceObject", () => {
    it("refreshes qrCodePayload when number changes", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(baseObject) // findById
        .mockResolvedValueOnce(null) // findByNumber
        .mockResolvedValueOnce({ ...baseObject, number: "NEW-999", qrCodePayload: "TERP:SO:a00000:NEW-999" }) // refetch
      ;(prisma.serviceObject.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      })

      const result = await service.updateServiceObject(prisma, TENANT_A, OBJECT_ID, {
        number: "NEW-999",
      })

      expect(result.qrCodePayload).toBe("TERP:SO:a00000:NEW-999")
      expect(prisma.serviceObject.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            number: "NEW-999",
            qrCodePayload: "TERP:SO:a00000:NEW-999",
          }),
        })
      )
    })

    it("rejects self-reference on parentId", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseObject
      )

      await expect(
        service.updateServiceObject(prisma, TENANT_A, OBJECT_ID, {
          parentId: OBJECT_ID,
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })

    it("detects circular parent chain", async () => {
      // existing = OBJECT_ID with parent = null
      // Proposed parent = PARENT_ID
      // PARENT_ID.parent = OBJECT_ID (cycle)
      const prisma = makePrisma()
      const calls = [
        baseObject, // findById(OBJECT_ID) -- existing
        { id: PARENT_ID, customerAddressId: CUSTOMER_A }, // validateParent
        { parentId: OBJECT_ID }, // findParentId(PARENT_ID) -> closes cycle
      ]
      let idx = 0
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
        async () => calls[idx++]
      )

      await expect(
        service.updateServiceObject(prisma, TENANT_A, OBJECT_ID, {
          parentId: PARENT_ID,
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })

    it("rejects customerAddressId switch to different tenant", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseObject
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.updateServiceObject(prisma, TENANT_A, OBJECT_ID, {
          customerAddressId: CUSTOMER_B,
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
      expect(prisma.serviceObject.updateMany).not.toHaveBeenCalled()
    })
  })

  describe("listServiceObjects / getTree / getById", () => {
    it("applies default pagination when none given", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(prisma.serviceObject.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)

      await service.listServiceObjects(prisma, TENANT_A)

      const call = (prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.skip).toBe(0)
      expect(call.take).toBe(50)
    })

    it("getServiceObjectTree returns flat list scoped to tenant/customer", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
        []
      )
      await service.getServiceObjectTree(prisma, TENANT_A, CUSTOMER_A)
      const call = (prisma.serviceObject.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where).toEqual({
        tenantId: TENANT_A,
        customerAddressId: CUSTOMER_A,
      })
    })

    it("getServiceObjectById throws NotFound when missing", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      )
      await expect(
        service.getServiceObjectById(prisma, TENANT_A, OBJECT_ID)
      ).rejects.toBeInstanceOf(service.ServiceObjectNotFoundError)
    })
  })

  describe("kind-specific field validation", () => {
    it("rejects creating a BUILDING with manufacturer set", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )
      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "BLD-001",
          name: "Hauptgebäude",
          customerAddressId: CUSTOMER_A,
          kind: "BUILDING",
          manufacturer: "Siemens", // forbidden on BUILDING
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
      expect(prisma.serviceObject.create).not.toHaveBeenCalled()
    })

    it("rejects creating a SITE with yearBuilt set", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )
      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "SITE-001",
          name: "Werk Nord",
          customerAddressId: CUSTOMER_A,
          kind: "SITE",
          yearBuilt: 1980, // forbidden on SITE
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })

    it("rejects creating an EQUIPMENT with floorCount set", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )
      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "EQ-001",
          name: "Pumpe",
          customerAddressId: CUSTOMER_A,
          kind: "EQUIPMENT",
          floorCount: 3, // forbidden on EQUIPMENT
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })

    it("accepts a SITE with siteStreet + siteAreaSqm", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )
      ;(prisma.serviceObject.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...baseObject,
        kind: "SITE",
      })
      await service.createServiceObject(prisma, TENANT_A, {
        number: "SITE-002",
        name: "Liegenschaft Süd",
        customerAddressId: CUSTOMER_A,
        kind: "SITE",
        siteStreet: "Werkstraße 5",
        siteAreaSqm: 12500,
      })
      expect(prisma.serviceObject.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "SITE",
            siteStreet: "Werkstraße 5",
            siteAreaSqm: 12500,
          }),
        })
      )
    })

    it("accepts a BUILDING with floorCount + buildingUsage", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )
      ;(prisma.serviceObject.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...baseObject,
        kind: "BUILDING",
      })
      await service.createServiceObject(prisma, TENANT_A, {
        number: "BLD-002",
        name: "Bürogebäude Ost",
        customerAddressId: CUSTOMER_A,
        kind: "BUILDING",
        floorCount: 5,
        buildingUsage: "OFFICE",
        yearBuilt: 2015,
      })
      expect(prisma.serviceObject.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "BUILDING",
            floorCount: 5,
            buildingUsage: "OFFICE",
            yearBuilt: 2015,
          }),
        })
      )
    })

    it("rejects negative floorCount", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null
      )
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        customerAddress
      )
      await expect(
        service.createServiceObject(prisma, TENANT_A, {
          number: "BLD-003",
          name: "x",
          customerAddressId: CUSTOMER_A,
          kind: "BUILDING",
          floorCount: -2,
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })

    it("update: changing kind from EQUIPMENT to SITE auto-nulls manufacturer", async () => {
      const existingEquipment = {
        ...baseObject,
        kind: "EQUIPMENT" as const,
        manufacturer: "ACME",
        model: "Pump-9000",
        serialNumber: "SN-123",
      }
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(existingEquipment) // findById
        .mockResolvedValueOnce({ ...existingEquipment, kind: "SITE", manufacturer: null, model: null, serialNumber: null }) // refetch
      ;(prisma.serviceObject.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      })

      await service.updateServiceObject(prisma, TENANT_A, OBJECT_ID, {
        kind: "SITE",
      })

      const updateCall = (prisma.serviceObject.updateMany as ReturnType<
        typeof vi.fn
      >).mock.calls[0]![0]
      // Tech fields must be nulled automatically since user didn't mention them.
      expect(updateCall.data).toMatchObject({
        kind: "SITE",
        manufacturer: null,
        model: null,
        serialNumber: null,
        yearBuilt: null,
        inServiceSince: null,
      })
    })

    it("update: changing to BUILDING while explicitly setting a SITE field fails", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        baseObject
      )
      await expect(
        service.updateServiceObject(prisma, TENANT_A, OBJECT_ID, {
          kind: "BUILDING",
          siteStreet: "foo", // forbidden on BUILDING
        })
      ).rejects.toBeInstanceOf(service.ServiceObjectValidationError)
    })
  })

  describe("moveServiceObject", () => {
    it("delegates to update with only parentId", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        baseObject
      )
      ;(prisma.serviceObject.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      })
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        { ...baseObject, parentId: null }
      )

      await service.moveServiceObject(prisma, TENANT_A, OBJECT_ID, null)

      const umCall = (prisma.serviceObject.updateMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(umCall.data).toEqual({ parentId: null })
    })
  })

  describe("deleteServiceObject", () => {
    it("soft-deletes when linked orders exist", async () => {
      const prisma = makePrisma({
        order: { count: vi.fn().mockResolvedValue(2) },
        whStockMovement: { count: vi.fn().mockResolvedValue(0) },
      })
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(baseObject) // findById
        .mockResolvedValueOnce({ ...baseObject, isActive: false }) // refetch after updateMany
      ;(prisma.serviceObject.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.serviceObject.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      })

      const result = await service.deleteServiceObject(prisma, TENANT_A, OBJECT_ID)

      expect(result).toEqual({ success: true, mode: "soft" })
      expect(prisma.serviceObject.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        })
      )
      expect(prisma.serviceObject.deleteMany).not.toHaveBeenCalled()
    })

    it("hard-deletes when no links exist", async () => {
      const prisma = makePrisma()
      ;(prisma.serviceObject.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        baseObject
      )
      ;(prisma.serviceObject.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.serviceObject.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({
        count: 1,
      })

      const result = await service.deleteServiceObject(prisma, TENANT_A, OBJECT_ID)

      expect(result).toEqual({ success: true, mode: "hard" })
      expect(prisma.serviceObject.deleteMany).toHaveBeenCalled()
    })
  })
})
