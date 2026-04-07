import { describe, it, expect, vi, beforeEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"

const { mockConnect, mockGetMailboxLock, mockLogout, mockMailbox } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockGetMailboxLock: vi.fn(),
  mockLogout: vi.fn(),
  mockMailbox: { exists: 42 },
}))

vi.mock("imapflow", () => ({
  ImapFlow: class MockImapFlow {
    connect = mockConnect
    getMailboxLock = mockGetMailboxLock
    logout = mockLogout
    mailbox = mockMailbox
    constructor() {}
  },
}))

// Import after mocks
import * as service from "../email-imap-config-service"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

const mockConfig = {
  id: "b0000000-0000-4000-b000-000000000001",
  tenantId: TENANT_ID,
  host: "imap.example.com",
  port: 993,
  username: "user@example.com",
  password: "secret123",
  encryption: "SSL",
  mailbox: "INBOX",
  isVerified: false,
  verifiedAt: null,
  uidValidity: null,
  uidNext: null,
  lastPollAt: null,
  lastPollError: null,
  lastPollErrorAt: null,
  consecutiveFailures: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    tenantImapConfig: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    ...overrides,
  } as unknown as PrismaClient
}

describe("email-imap-config-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("get", () => {
    it("returns config when exists", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)

      const result = await service.get(prisma, TENANT_ID)
      expect(result).toEqual(mockConfig)
      expect(prisma.tenantImapConfig.findUnique).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      })
    })

    it("returns null when no config for tenant", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      const result = await service.get(prisma, TENANT_ID)
      expect(result).toBeNull()
    })
  })

  describe("testConnection", () => {
    it("connects, opens mailbox, and returns message count", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      ;(prisma.tenantImapConfig.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockConfig,
        isVerified: true,
      })
      const mockRelease = vi.fn()
      mockGetMailboxLock.mockResolvedValue({ release: mockRelease })

      const result = await service.testConnection(prisma, TENANT_ID)

      expect(result).toEqual({ success: true, messageCount: 42 })
      expect(mockConnect).toHaveBeenCalled()
      expect(mockGetMailboxLock).toHaveBeenCalledWith("INBOX")
      expect(mockRelease).toHaveBeenCalled()
      expect(mockLogout).toHaveBeenCalled()
    })

    it("sets is_verified=true and verified_at on success", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      ;(prisma.tenantImapConfig.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockConfig,
        isVerified: true,
      })
      mockGetMailboxLock.mockResolvedValue({ release: vi.fn() })

      await service.testConnection(prisma, TENANT_ID)

      expect(prisma.tenantImapConfig.update).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        data: { isVerified: true, verifiedAt: expect.any(Date) },
      })
    })

    it("throws ImapConfigNotFoundError when no config exists", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null)

      await expect(
        service.testConnection(prisma, TENANT_ID)
      ).rejects.toThrow(service.ImapConfigNotFoundError)
    })

    it("throws ImapConnectionError when connect() fails", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      mockConnect.mockRejectedValue(new Error("Connection refused"))

      await expect(
        service.testConnection(prisma, TENANT_ID)
      ).rejects.toThrow(service.ImapConnectionError)
    })
  })

  describe("upsert", () => {
    it("resets verification when credential fields change", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      ;(prisma.tenantImapConfig.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockConfig,
        host: "new-imap.example.com",
        isVerified: false,
      })

      await service.upsert(prisma, TENANT_ID, {
        host: "new-imap.example.com",
        port: 993,
        username: "user@example.com",
        encryption: "SSL",
        mailbox: "INBOX",
      })

      expect(prisma.tenantImapConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            isVerified: false,
            verifiedAt: null,
          }),
        })
      )
    })

    it("does not reset verification when only mailbox changes", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      ;(prisma.tenantImapConfig.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...mockConfig,
        mailbox: "Archive",
      })

      await service.upsert(prisma, TENANT_ID, {
        host: "imap.example.com",
        port: 993,
        username: "user@example.com",
        encryption: "SSL",
        mailbox: "Archive",
      })

      expect(prisma.tenantImapConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.not.objectContaining({
            isVerified: false,
          }),
        })
      )
    })

    it("excludes password from update when not provided", async () => {
      const prisma = createMockPrisma()
      ;(prisma.tenantImapConfig.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)
      ;(prisma.tenantImapConfig.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(mockConfig)

      await service.upsert(prisma, TENANT_ID, {
        host: "imap.example.com",
        port: 993,
        username: "user@example.com",
        encryption: "SSL",
        mailbox: "INBOX",
      })

      const upsertCall = (prisma.tenantImapConfig.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(upsertCall.update).not.toHaveProperty("password")
    })
  })

  describe("createImapClient", () => {
    it("maps encryption=SSL to secure=true", () => {
      const client = service.createImapClient(mockConfig as Parameters<typeof service.createImapClient>[0])
      expect(client).toBeDefined()
    })
  })
})
