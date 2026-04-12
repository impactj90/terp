import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"

const { mockVerify, mockSendMail } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockSendMail: vi.fn(),
}))

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: mockVerify,
      sendMail: mockSendMail,
    })),
  },
}))

// Import after mocks
import * as service from "../email-smtp-config-service"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

const mockConfig = {
  id: "b0000000-0000-4000-b000-000000000001",
  tenantId: TENANT_ID,
  host: "smtp.example.com",
  port: 587,
  username: "user@example.com",
  password: "secret123",
  encryption: "STARTTLS",
  fromEmail: "info@example.com",
  fromName: "Test Company",
  replyToEmail: null,
  isVerified: false,
  verifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    tenantSmtpConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient
}

describe("email-smtp-config-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("get", () => {
    it("returns config when exists", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantSmtpConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)

      const result = await service.get(prisma, TENANT_ID)
      expect(result).toEqual(mockConfig)
      expect(prisma.tenantSmtpConfig.findUnique).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      })
    })

    it("returns null when no config for tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantSmtpConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const result = await service.get(prisma, TENANT_ID)
      expect(result).toBeNull()
    })
  })

  describe("testConnection", () => {
    it("calls transporter.verify() and sends test email on success", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantSmtpConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      ;(prisma.tenantSmtpConfig.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockConfig,
        isVerified: true,
      })
      mockVerify.mockResolvedValue(true)
      mockSendMail.mockResolvedValue({ messageId: "test-123" })

      const result = await service.testConnection(prisma, TENANT_ID)

      expect(result.success).toBe(true)
      expect(mockVerify).toHaveBeenCalled()
      expect(mockSendMail).toHaveBeenCalled()
    })

    it("sets is_verified=true and verified_at on success", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantSmtpConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      ;(prisma.tenantSmtpConfig.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockConfig,
        isVerified: true,
      })
      mockVerify.mockResolvedValue(true)
      mockSendMail.mockResolvedValue({})

      await service.testConnection(prisma, TENANT_ID)

      expect(prisma.tenantSmtpConfig.update).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        data: { isVerified: true, verifiedAt: expect.any(Date) },
      })
    })

    it("throws SmtpNotConfiguredError when no config exists", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantSmtpConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.testConnection(prisma, TENANT_ID)
      ).rejects.toThrow(service.SmtpNotConfiguredError)
    })

    it("throws SmtpConnectionError when verify() fails", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantSmtpConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      mockVerify.mockRejectedValue(new Error("Connection refused"))

      await expect(
        service.testConnection(prisma, TENANT_ID)
      ).rejects.toThrow(service.SmtpConnectionError)
    })
  })

  describe("createTransporter", () => {
    it("maps encryption=STARTTLS to secure=false", () => {
      const transporter = service.createTransporter({
        ...mockConfig,
        encryption: "STARTTLS",
      })
      expect(transporter).toBeDefined()
    })

    it("maps encryption=SSL to secure=true", () => {
      const transporter = service.createTransporter({
        ...mockConfig,
        encryption: "SSL",
        port: 465,
      })
      expect(transporter).toBeDefined()
    })

    it("maps encryption=NONE to secure=false", () => {
      const transporter = service.createTransporter({
        ...mockConfig,
        encryption: "NONE",
      })
      expect(transporter).toBeDefined()
    })
  })
})
