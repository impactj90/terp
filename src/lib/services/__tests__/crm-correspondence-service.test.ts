import { describe, it, expect, vi } from "vitest"
import * as service from "../crm-correspondence-service"
import type { PrismaClient } from "@/generated/prisma/client"

// --- Constants ---
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ADDRESS_ID = "b0000000-0000-4000-b000-000000000001"
const CONTACT_ID = "c0000000-0000-4000-a000-000000000001"
const CORR_ID = "e0000000-0000-4000-a000-000000000001"

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

const mockCorrespondence = {
  id: CORR_ID,
  tenantId: TENANT_ID,
  addressId: ADDRESS_ID,
  direction: "INCOMING" as const,
  type: "phone",
  date: new Date("2026-03-16"),
  contactId: CONTACT_ID,
  inquiryId: null,
  fromUser: null,
  toUser: null,
  subject: "Test call",
  content: "Discussed delivery schedule",
  attachments: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdById: USER_ID,
  contact: mockContact,
  address: mockAddress,
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    crmAddress: {
      findFirst: vi.fn(),
    },
    crmContact: {
      findFirst: vi.fn(),
    },
    crmCorrespondence: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient
}

describe("crm-correspondence-service", () => {
  describe("create", () => {
    it("creates entry linked to address and contact", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.crmContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockContact)
      ;(prisma.crmCorrespondence.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockCorrespondence)

      const result = await service.create(prisma, TENANT_ID, {
        addressId: ADDRESS_ID,
        direction: "INCOMING",
        type: "phone",
        date: new Date("2026-03-16"),
        contactId: CONTACT_ID,
        subject: "Test call",
        content: "Discussed delivery schedule",
      }, USER_ID)

      expect(result.id).toBe(CORR_ID)
      expect(result.subject).toBe("Test call")
      expect(prisma.crmAddress.findFirst).toHaveBeenCalledWith({
        where: { id: ADDRESS_ID, tenantId: TENANT_ID },
      })
      expect(prisma.crmContact.findFirst).toHaveBeenCalledWith({
        where: { id: CONTACT_ID, addressId: ADDRESS_ID, tenantId: TENANT_ID },
      })
    })

    it("rejects if addressId belongs to different tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(prisma, TENANT_ID, {
          addressId: ADDRESS_ID,
          direction: "INCOMING",
          type: "phone",
          date: new Date(),
          subject: "Test",
        }, USER_ID)
      ).rejects.toThrow("Address not found in this tenant")
    })

    it("rejects if contactId does not belong to addressId", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      ;(prisma.crmContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.create(prisma, TENANT_ID, {
          addressId: ADDRESS_ID,
          direction: "INCOMING",
          type: "phone",
          date: new Date(),
          contactId: CONTACT_ID,
          subject: "Test",
        }, USER_ID)
      ).rejects.toThrow("Contact not found for this address")
    })

    it("creates entry without optional contactId", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmAddress.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockAddress)
      const noContactCorr = { ...mockCorrespondence, contactId: null, contact: null }
      ;(prisma.crmCorrespondence.create as ReturnType<typeof vi.fn>).mockResolvedValue(noContactCorr)

      const result = await service.create(prisma, TENANT_ID, {
        addressId: ADDRESS_ID,
        direction: "OUTGOING",
        type: "email",
        date: new Date(),
        subject: "Email confirmation",
      }, USER_ID)

      expect(result.contactId).toBeNull()
      expect(prisma.crmContact.findFirst).not.toHaveBeenCalled()
    })
  })

  describe("getById", () => {
    it("returns entry when found", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockCorrespondence)

      const result = await service.getById(prisma, TENANT_ID, CORR_ID)
      expect(result.id).toBe(CORR_ID)
      expect(result.subject).toBe("Test call")
    })

    it("throws CrmCorrespondenceNotFoundError when not found", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.getById(prisma, TENANT_ID, CORR_ID)
      ).rejects.toThrow("CRM correspondence not found")
    })
  })

  describe("update", () => {
    it("updates existing entry", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.findFirst as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockCorrespondence) // findById in service
        .mockResolvedValueOnce({ ...mockCorrespondence, subject: "Updated" }) // findFirst after updateMany
      ;(prisma.crmCorrespondence.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      const result = await service.update(prisma, TENANT_ID, {
        id: CORR_ID,
        subject: "Updated",
      })

      expect(result!.subject).toBe("Updated")
    })

    it("throws CrmCorrespondenceNotFoundError for missing entry", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.update(prisma, TENANT_ID, { id: CORR_ID, subject: "Updated" })
      ).rejects.toThrow("CRM correspondence not found")
    })

    it("validates contactId belongs to address when updating", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(mockCorrespondence)
      ;(prisma.crmContact.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.update(prisma, TENANT_ID, { id: CORR_ID, contactId: "nonexistent-id" })
      ).rejects.toThrow("Contact not found for this address")
    })
  })

  describe("remove", () => {
    it("removes entry successfully", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })

      await expect(service.remove(prisma, TENANT_ID, CORR_ID)).resolves.not.toThrow()
    })

    it("throws CrmCorrespondenceNotFoundError when entry does not exist", async () => {
      const prisma = createMockPrisma()
      ;(prisma.crmCorrespondence.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })

      await expect(
        service.remove(prisma, TENANT_ID, CORR_ID)
      ).rejects.toThrow("CRM correspondence not found")
    })
  })
})
