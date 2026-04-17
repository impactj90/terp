import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const {
  mockTenantFindMany,
  mockEnsureSchedule,
  mockStartExecution,
  mockCompleteExecution,
  mockProcessTenantProbationReminders,
} = vi.hoisted(() => ({
  mockTenantFindMany: vi.fn(),
  mockEnsureSchedule: vi.fn(),
  mockStartExecution: vi.fn(),
  mockCompleteExecution: vi.fn(),
  mockProcessTenantProbationReminders: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    tenant: { findMany: mockTenantFindMany },
  },
}))

vi.mock("@/lib/services/cron-execution-logger", () => ({
  CronExecutionLogger: class MockCronExecutionLogger {
    ensureSchedule = mockEnsureSchedule
    startExecution = mockStartExecution
    completeExecution = mockCompleteExecution
  },
}))

vi.mock("@/lib/services/probation-reminder-service", () => ({
  processTenantProbationReminders: (...args: unknown[]) =>
    mockProcessTenantProbationReminders(...args),
}))

describe("GET /api/cron/probation-reminders", () => {
  let originalCronSecret: string | undefined

  beforeEach(() => {
    originalCronSecret = process.env.CRON_SECRET
    process.env.CRON_SECRET = "test-secret"
    vi.clearAllMocks()
    mockEnsureSchedule.mockResolvedValue("schedule-1")
    mockStartExecution.mockResolvedValue({
      executionId: "exec-1",
      taskExecutionId: "task-exec-1",
    })
    mockCompleteExecution.mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (originalCronSecret === undefined) {
      delete process.env.CRON_SECRET
    } else {
      process.env.CRON_SECRET = originalCronSecret
    }
  })

  async function importRoute() {
    return import("../route")
  }

  function makeRequest(authHeader?: string) {
    const headers: Record<string, string> = {}
    if (authHeader !== undefined) {
      headers.authorization = authHeader
    }

    return new Request("http://localhost:3000/api/cron/probation-reminders", {
      headers,
    })
  }

  it("returns 503 when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET
    const { GET } = await importRoute()

    const response = await GET(makeRequest("Bearer test-secret"))

    expect(response.status).toBe(503)
  })

  it("returns 401 when authorization is missing or wrong", async () => {
    const { GET } = await importRoute()

    await expect(GET(makeRequest())).resolves.toHaveProperty("status", 401)
    await expect(GET(makeRequest("Bearer wrong-secret"))).resolves.toHaveProperty("status", 401)
  })

  it("aggregates successful, disabled, and duplicate-suppressed tenant runs", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "tenant-1" },
      { id: "tenant-2" },
    ])
    mockProcessTenantProbationReminders
      .mockResolvedValueOnce({
        skipped: false,
        employeesDue: 2,
        remindersCreated: 2,
        duplicateCount: 1,
        notificationsCreated: 3,
        recipientsNotified: 2,
        recipientsSuppressedByPreference: 0,
        recipientsSuppressedByScope: 1,
      })
      .mockResolvedValueOnce({
        skipped: true,
        skipReason: "disabled",
        employeesDue: 0,
        remindersCreated: 0,
        duplicateCount: 0,
        notificationsCreated: 0,
        recipientsNotified: 0,
        recipientsSuppressedByPreference: 0,
        recipientsSuppressedByScope: 0,
      })

    const { GET } = await importRoute()
    const response = await GET(makeRequest("Bearer test-secret"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.tenantsProcessed).toBe(2)
    expect(body.tenantsFailed).toBe(0)
    expect(body.remindersCreated).toBe(2)
    expect(body.duplicatesSkipped).toBe(1)
    expect(body.notificationsCreated).toBe(3)
    expect(body.recipientsNotified).toBe(2)
    expect(body.results).toHaveLength(2)
    expect(body.results[1]!.skipReason).toBe("disabled")
  })

  it("continues when one tenant run fails", async () => {
    mockTenantFindMany.mockResolvedValue([
      { id: "tenant-1" },
      { id: "tenant-2" },
    ])
    mockProcessTenantProbationReminders
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        skipped: false,
        employeesDue: 1,
        remindersCreated: 1,
        duplicateCount: 0,
        notificationsCreated: 1,
        recipientsNotified: 1,
        recipientsSuppressedByPreference: 0,
        recipientsSuppressedByScope: 0,
      })

    const { GET } = await importRoute()
    const response = await GET(makeRequest("Bearer test-secret"))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.ok).toBe(false)
    expect(body.tenantsProcessed).toBe(2)
    expect(body.tenantsFailed).toBe(1)
    expect(body.results[0]!.error).toBe("boom")
    expect(body.remindersCreated).toBe(1)
    expect(mockCompleteExecution).toHaveBeenCalled()
  })
})
