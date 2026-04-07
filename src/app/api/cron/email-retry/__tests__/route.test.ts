import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const {
  mockFindRetryable,
  mockMarkSent,
  mockMarkFailed,
  mockMarkRetrying,
  mockSmtpGet,
  mockSendMail,
  mockDownload,
  mockFindFirst,
} = vi.hoisted(() => ({
  mockFindRetryable: vi.fn(),
  mockMarkSent: vi.fn(),
  mockMarkFailed: vi.fn(),
  mockMarkRetrying: vi.fn(),
  mockSmtpGet: vi.fn(),
  mockSendMail: vi.fn(),
  mockDownload: vi.fn(),
  mockFindFirst: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    whPurchaseOrder: { findFirst: mockFindFirst },
    billingDocument: { findFirst: mockFindFirst },
  },
}))

vi.mock("@/lib/services/email-send-log-repository", () => ({
  findRetryable: mockFindRetryable,
  markSent: mockMarkSent,
  markFailed: mockMarkFailed,
  markRetrying: mockMarkRetrying,
}))

vi.mock("@/lib/services/email-smtp-config-service", () => ({
  get: mockSmtpGet,
  createTransporter: vi.fn(() => ({ sendMail: mockSendMail })),
}))

vi.mock("@/lib/supabase/storage", () => ({
  download: mockDownload,
}))

vi.mock("@/lib/services/email-send-service", () => ({
  getNextRetryAt: vi.fn(() => new Date(Date.now() + 60_000)),
}))

describe("GET /api/cron/email-retry", () => {
  let originalCronSecret: string | undefined

  beforeEach(() => {
    originalCronSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-secret"
    vi.clearAllMocks()
  })

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalCronSecret
    }
  })

  async function importGET() {
    const mod = await import("../route")
    return mod.GET
  }

  function makeRequest(authHeader?: string) {
    return new Request("http://localhost/api/cron/email-retry", {
      headers: authHeader ? { authorization: authHeader } : {},
    })
  }

  describe("authorization", () => {
    it("returns 401 without Authorization header", async () => {
      const GET = await importGET()
      const res = await GET(makeRequest())
      expect(res.status).toBe(401)
    })

    it("returns 401 with wrong CRON_SECRET", async () => {
      const GET = await importGET()
      const res = await GET(makeRequest("Bearer wrong"))
      expect(res.status).toBe(401)
    })

    it("returns 503 when CRON_SECRET env var missing", async () => {
      delete process.env.CRON_SECRET
      const GET = await importGET()
      const res = await GET(makeRequest("Bearer anything"))
      expect(res.status).toBe(503)
    })

    it("returns 200 with correct Bearer token", async () => {
      mockFindRetryable.mockResolvedValue([])
      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      expect(res.status).toBe(200)
    })
  })

  describe("retry processing", () => {
    const mockRecord = {
      id: "record-001",
      tenantId: "tenant-001",
      documentId: null,
      documentType: null,
      toEmail: "test@example.com",
      ccEmails: [],
      subject: "Test",
      bodyHtml: "<p>Test</p>",
      retryCount: 0,
      status: "pending",
    }

    it("picks up pending records and sends them", async () => {
      mockFindRetryable.mockResolvedValue([mockRecord])
      mockSmtpGet.mockResolvedValue({
        host: "smtp.test.com",
        port: 587,
        username: "",
        password: "",
        encryption: "NONE",
        fromEmail: "test@test.com",
        fromName: null,
        replyToEmail: null,
      })
      mockSendMail.mockResolvedValue({})

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      const body = await res.json()

      expect(body.ok).toBe(true)
      expect(body.processed).toBe(1)
      expect(body.succeeded).toBe(1)
      expect(mockMarkSent).toHaveBeenCalledWith(expect.anything(), "record-001")
    })

    it("marks failed when tenant has no SMTP config", async () => {
      mockFindRetryable.mockResolvedValue([mockRecord])
      mockSmtpGet.mockResolvedValue(null)

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      const body = await res.json()

      expect(body.failed).toBe(1)
      expect(mockMarkFailed).toHaveBeenCalledWith(
        expect.anything(),
        "record-001",
        "SMTP not configured for tenant"
      )
    })

    it("marks failed when retry_count >= 3", async () => {
      const highRetryRecord = { ...mockRecord, retryCount: 3 }
      mockFindRetryable.mockResolvedValue([highRetryRecord])
      mockSmtpGet.mockResolvedValue({
        host: "smtp.test.com",
        port: 587,
        username: "",
        password: "",
        encryption: "NONE",
        fromEmail: "test@test.com",
        fromName: null,
        replyToEmail: null,
      })
      mockSendMail.mockRejectedValue(new Error("SMTP error"))

      const GET = await importGET()
      await GET(makeRequest("Bearer test-secret"))

      expect(mockMarkFailed).toHaveBeenCalled()
    })

    it("returns JSON summary with processed/succeeded/failed counts", async () => {
      mockFindRetryable.mockResolvedValue([])

      const GET = await importGET()
      const res = await GET(makeRequest("Bearer test-secret"))
      const body = await res.json()

      expect(body).toEqual({
        ok: true,
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      })
    })
  })
})
