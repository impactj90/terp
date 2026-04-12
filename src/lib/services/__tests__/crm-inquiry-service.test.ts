import { describe, it, expect, vi } from "vitest"
import * as service from "../crm-inquiry-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "c0000000-0000-4000-a000-000000000001"
const INQUIRY_ID = "c5000000-0000-4000-a000-000000000099"
const ORDER_ID = "ord00000-0000-4000-a000-000000000001"

const mockAddress = {
  id: ADDRESS_ID,
  tenantId: TENANT_ID,
  company: "Test GmbH",
}

const mockContact = {
  id: CONTACT_ID,
  tenantId: TENANT_ID,
  addressId: ADDRESS_ID,
  firstName: "Max",
  lastName: "Mustermann",
}

const mockInquiry = {
  id: INQUIRY_ID,
  tenantId: TENANT_ID,
  number: "V-1",
  title: "Test Inquiry",
  addressId: ADDRESS_ID,
  contactId: CONTACT_ID,
  status: "OPEN" as const,
  effort: "medium",
  creditRating: null,
  notes: "Some notes",
  orderId: null,
  closedAt: null,
  closedById: null,
  closingReason: null,
  closingRemarks: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  address: mockAddress,
  contact: mockContact,
  order: null,
  correspondences: [],
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    crmAddress: {
      findFirst: vi.fn(),
    },
    crmContact: {
      findFirst: vi.fn(),
    },
    crmInquiry: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    crmCorrespondence: {
      count: vi.fn(),
    },
    numberSequence: {
      upsert: vi.fn(),
    },
    order: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient
}

// Mock order-service to avoid its internal complexity
vi.mock("../order-service", () => ({
  create: vi.fn().mockImplementation(async (_p: unknown, _t: unknown, input: { code: string; name: string }) => ({
    id: ORDER_ID,
    code: input.code,
    name: input.name,
  })),
  update: vi.fn().mockResolvedValue({}),
}))

describe("crm-inquiry-service", () => {
  describe("create", () => {
    it("creates inquiry with auto-generated number", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "V-",
        nextValue: 2,
      })
      ;(prisma.crmInquiry.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockInquiry,
        number: "V-1",
      })

      const result = await service.create(prisma, TENANT_ID, {
        title: "Test Inquiry",
        addressId: ADDRESS_ID,
        effort: "medium",
      }, USER_ID)

      expect(result.number).toBe("V-1")
      expect(prisma.crmInquiry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            number: "V-1",
            title: "Test Inquiry",
            addressId: ADDRESS_ID,
          }),
        })
      )
    })

    it("rejects if addressId belongs to different tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(prisma, TENANT_ID, {
          title: "Test",
          addressId: ADDRESS_ID,
        }, USER_ID)
      ).rejects.toThrow("Address not found in this tenant")
    })

    it("rejects if contactId does not belong to address", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.crmContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(prisma, TENANT_ID, {
          title: "Test",
          addressId: ADDRESS_ID,
          contactId: CONTACT_ID,
        }, USER_ID)
      ).rejects.toThrow("Contact not found for this address")
    })

    it("creates inquiry without optional contactId", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.numberSequence.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        prefix: "V-",
        nextValue: 2,
      })
      const noContactInquiry = { ...mockInquiry, contactId: null, contact: null }
      ;(prisma.crmInquiry.create as ReturnType<typeof vi.fn>).mockResolvedValue(noContactInquiry)

      const result = await service.create(prisma, TENANT_ID, {
        title: "Test",
        addressId: ADDRESS_ID,
      }, USER_ID)

      expect(result.contactId).toBeNull()
      expect(prisma.crmContact.findFirst).not.toHaveBeenCalled()
    })
  })

  describe("getById", () => {
    it("returns inquiry when found", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockInquiry)

      const result = await service.getById(prisma, TENANT_ID, INQUIRY_ID)
      expect(result.id).toBe(INQUIRY_ID)
      expect(result.title).toBe("Test Inquiry")
    })

    it("throws CrmInquiryNotFoundError when not found", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.getById(prisma, TENANT_ID, INQUIRY_ID)
      ).rejects.toThrow("CRM inquiry not found")
    })
  })

  describe("update", () => {
    it("updates inquiry fields", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockInquiry) // findById in service
        .mockResolvedValueOnce({ ...mockInquiry, title: "Updated", status: "IN_PROGRESS" }) // findFirst after updateMany
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      const result = await service.update(prisma, TENANT_ID, {
        id: INQUIRY_ID,
        title: "Updated",
      })

      expect(result!.title).toBe("Updated")
    })

    it("rejects update when status is CLOSED", async () => {
      const prisma = createMockPrisma()
      const closedInquiry = { ...mockInquiry, status: "CLOSED" }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(closedInquiry)

      await expect(
        service.update(prisma, TENANT_ID, { id: INQUIRY_ID, title: "Updated" })
      ).rejects.toThrow("Cannot update a closed inquiry")
    })

    it("auto-transitions from OPEN to IN_PROGRESS on update", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockInquiry) // OPEN status
        .mockResolvedValueOnce({ ...mockInquiry, status: "IN_PROGRESS" })
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.update(prisma, TENANT_ID, {
        id: INQUIRY_ID,
        notes: "Updated notes",
      })

      expect(prisma.crmInquiry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "IN_PROGRESS",
          }),
        })
      )
    })
  })

  describe("close", () => {
    it("sets status, closedAt, closedById, closingReason", async () => {
      const prisma = createMockPrisma()
      const openInquiry = { ...mockInquiry, status: "IN_PROGRESS" }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(openInquiry)
        .mockResolvedValueOnce({ ...openInquiry, status: "CLOSED" })
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.close(prisma, TENANT_ID, {
        id: INQUIRY_ID,
        closingReason: "Auftrag erteilt",
        closingRemarks: "Fertig",
      }, USER_ID)

      expect(prisma.crmInquiry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CLOSED",
            closedById: USER_ID,
            closingReason: "Auftrag erteilt",
          }),
        })
      )
    })

    it("rejects if already closed", async () => {
      const prisma = createMockPrisma()
      const closedInquiry = { ...mockInquiry, status: "CLOSED" }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(closedInquiry)

      await expect(
        service.close(prisma, TENANT_ID, { id: INQUIRY_ID }, USER_ID)
      ).rejects.toThrow("Inquiry is already closed")
    })

    it("optionally closes linked Terp order", async () => {
      const orderService = await import("../order-service")
      const prisma = createMockPrisma()
      const inquiryWithOrder = { ...mockInquiry, status: "IN_PROGRESS", orderId: ORDER_ID }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(inquiryWithOrder)
        .mockResolvedValueOnce({ ...inquiryWithOrder, status: "CLOSED" })
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.close(prisma, TENANT_ID, {
        id: INQUIRY_ID,
        closeLinkedOrder: true,
      }, USER_ID)

      expect(orderService.update).toHaveBeenCalledWith(
        prisma, TENANT_ID,
        expect.objectContaining({ id: ORDER_ID, status: "completed" })
      )
    })
  })

  describe("cancel", () => {
    it("sets status to CANCELLED", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockInquiry)
        .mockResolvedValueOnce({ ...mockInquiry, status: "CANCELLED" })
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.cancel(prisma, TENANT_ID, INQUIRY_ID, "No longer needed")

      expect(prisma.crmInquiry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CANCELLED",
          }),
        })
      )
    })

    it("rejects if already closed", async () => {
      const prisma = createMockPrisma()
      const closedInquiry = { ...mockInquiry, status: "CLOSED" }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(closedInquiry)

      await expect(
        service.cancel(prisma, TENANT_ID, INQUIRY_ID)
      ).rejects.toThrow("Cannot cancel an inquiry that is already closed or cancelled")
    })
  })

  describe("reopen", () => {
    it("sets status from CLOSED to IN_PROGRESS", async () => {
      const prisma = createMockPrisma()
      const closedInquiry = { ...mockInquiry, status: "CLOSED" }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(closedInquiry)
        .mockResolvedValueOnce({ ...mockInquiry, status: "IN_PROGRESS" })
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.reopen(prisma, TENANT_ID, INQUIRY_ID)

      expect(prisma.crmInquiry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "IN_PROGRESS",
            closedAt: null,
            closedById: null,
            closingReason: null,
            closingRemarks: null,
          }),
        })
      )
    })

    it("clears closing fields", async () => {
      const prisma = createMockPrisma()
      const closedInquiry = {
        ...mockInquiry,
        status: "CLOSED",
        closedAt: new Date(),
        closedById: USER_ID,
        closingReason: "Done",
        closingRemarks: "Test",
      }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(closedInquiry)
        .mockResolvedValueOnce({ ...mockInquiry, status: "IN_PROGRESS" })
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.reopen(prisma, TENANT_ID, INQUIRY_ID)

      const updateCall = (prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mock.calls[0]![0]
      expect(updateCall.data.closedAt).toBeNull()
      expect(updateCall.data.closedById).toBeNull()
      expect(updateCall.data.closingReason).toBeNull()
      expect(updateCall.data.closingRemarks).toBeNull()
    })

    it("rejects if not closed or cancelled", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockInquiry) // OPEN

      await expect(
        service.reopen(prisma, TENANT_ID, INQUIRY_ID)
      ).rejects.toThrow("Can only reopen closed or cancelled inquiries")
    })
  })

  describe("createOrder", () => {
    it("creates order and links to inquiry", async () => {
      const orderService = await import("../order-service")
      const prisma = createMockPrisma()
      const inquiryNoOrder = { ...mockInquiry, orderId: null }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(inquiryNoOrder)
        .mockResolvedValueOnce({ ...inquiryNoOrder, orderId: ORDER_ID, status: "IN_PROGRESS" })
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.createOrder(prisma, TENANT_ID, INQUIRY_ID)

      expect(orderService.create).toHaveBeenCalledWith(
        prisma, TENANT_ID,
        expect.objectContaining({ code: "CRM-V-1" })
      )
    })

    it("rejects if inquiry already has linked order", async () => {
      const prisma = createMockPrisma()
      const inquiryWithOrder = { ...mockInquiry, orderId: ORDER_ID }
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(inquiryWithOrder)

      await expect(
        service.createOrder(prisma, TENANT_ID, INQUIRY_ID)
      ).rejects.toThrow("Inquiry already has a linked order")
    })
  })

  describe("linkOrder", () => {
    it("links existing order to inquiry", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockInquiry)
        .mockResolvedValueOnce({ ...mockInquiry, orderId: ORDER_ID })
      ;(prisma.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: ORDER_ID,
        tenantId: TENANT_ID,
      })
      ;(prisma.crmInquiry.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await service.linkOrder(prisma, TENANT_ID, INQUIRY_ID, ORDER_ID)

      expect(prisma.crmInquiry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ orderId: ORDER_ID }),
        })
      )
    })

    it("rejects if order not found in tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmInquiry.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockInquiry)
      ;(prisma.order.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.linkOrder(prisma, TENANT_ID, INQUIRY_ID, ORDER_ID)
      ).rejects.toThrow("Order not found in this tenant")
    })
  })

  describe("remove", () => {
    it("deletes inquiry when no linked records", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmInquiry.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await expect(service.remove(prisma, TENANT_ID, INQUIRY_ID)).resolves.not.toThrow()
    })

    it("rejects if correspondence entries are linked", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.count as ReturnType<typeof vi.fn>).mockResolvedValue(3)

      await expect(
        service.remove(prisma, TENANT_ID, INQUIRY_ID)
      ).rejects.toThrow("Cannot delete inquiry with linked correspondence entries")
    })

    it("throws not-found when inquiry does not exist", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.count as ReturnType<typeof vi.fn>).mockResolvedValue(0)
      ;(prisma.crmInquiry.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })

      await expect(
        service.remove(prisma, TENANT_ID, INQUIRY_ID)
      ).rejects.toThrow("CRM inquiry not found")
    })
  })
})
