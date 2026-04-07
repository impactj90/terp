import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockSendMail, mockDownload } = vi.hoisted(() => ({
  mockSendMail: vi.fn(),
  mockDownload: vi.fn(),
}))

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      verify: vi.fn(),
      sendMail: mockSendMail,
    })),
  },
}))

vi.mock("@/lib/supabase/storage", () => ({
  download: mockDownload,
}))

import { getNextRetryAt } from "../email-send-service"

describe("email-send-service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getNextRetryAt", () => {
    it("returns +1min for retryCount=0", () => {
      const now = Date.now()
      const result = getNextRetryAt(0)
      const diff = result.getTime() - now
      expect(diff).toBeGreaterThanOrEqual(59_000)
      expect(diff).toBeLessThanOrEqual(61_000)
    })

    it("returns +5min for retryCount=1", () => {
      const now = Date.now()
      const result = getNextRetryAt(1)
      const diff = result.getTime() - now
      expect(diff).toBeGreaterThanOrEqual(299_000)
      expect(diff).toBeLessThanOrEqual(301_000)
    })

    it("returns +15min for retryCount=2", () => {
      const now = Date.now()
      const result = getNextRetryAt(2)
      const diff = result.getTime() - now
      expect(diff).toBeGreaterThanOrEqual(899_000)
      expect(diff).toBeLessThanOrEqual(901_000)
    })

    it("returns +15min for retryCount>=3 (capped)", () => {
      const now = Date.now()
      const result = getNextRetryAt(5)
      const diff = result.getTime() - now
      expect(diff).toBeGreaterThanOrEqual(899_000)
      expect(diff).toBeLessThanOrEqual(901_000)
    })
  })
})
