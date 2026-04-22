/**
 * Order Service — Regression Tests
 *
 * Focus: T-3 ServiceSchedule completion hook in `update()`.
 *
 * Plan: thoughts/shared/plans/2026-04-22-serviceobjekte-wartungsintervalle.md
 * Phase C — "Order-Service-Completion-Hook". The hook is defined as:
 *
 *   const statusChanged =
 *     data.status === "completed" && existing.status !== "completed"
 *   if (statusChanged && existing.serviceScheduleId) {
 *     try { await serviceScheduleService.recordCompletion(...) } catch { ... }
 *   }
 *
 * These tests guard that exact behavior:
 *   1. No hook for orders without `serviceScheduleId`.
 *   2. Hook fires on `active → completed` transition (happy path).
 *   3. No hook for non-status updates.
 *   4. No hook for idempotent `completed → completed` re-submit.
 *   5. Hook errors are swallowed (`console.warn`, no rethrow).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import * as orderService from "../order-service"

// Mock the audit-logs service (avoid side-effect noise in tests).
vi.mock("../audit-logs-service", () => ({
  log: vi.fn().mockResolvedValue(undefined),
  computeChanges: vi.fn().mockReturnValue(null),
}))

// Mock service-schedule-service so we can assert on recordCompletion calls.
vi.mock("../service-schedule-service", () => ({
  recordCompletion: vi.fn().mockResolvedValue(undefined),
}))

// Mock order-repository so we can control what `findById` returns
// (specifically `existing.status` and `existing.serviceScheduleId`).
vi.mock("../order-repository", () => ({
  findById: vi.fn(),
  findByCode: vi.fn().mockResolvedValue(null),
  update: vi.fn().mockResolvedValue({ id: "stub" }),
  findByIdWithInclude: vi.fn(),
  create: vi.fn(),
  deleteById: vi.fn().mockResolvedValue(true),
  findMany: vi.fn(),
  findManyByServiceObject: vi.fn(),
}))

// Pull in the mocked modules so we can configure + assert on them.
import * as orderRepo from "../order-repository"
import * as serviceScheduleService from "../service-schedule-service"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const ORDER_ID = "00000000-0000-4000-a000-000000000001"
const SCHEDULE_ID = "55000000-0000-4000-a000-000000000001"

const AUDIT = { userId: USER_ID, ipAddress: "127.0.0.1", userAgent: "test" }

/** Minimal fake Prisma client — the mocked repo doesn't touch it. */
const prismaStub = {} as unknown as PrismaClient

/**
 * Factory for a fake "existing" Order row returned by `repo.findById`.
 * Defaults to an ACTIVE order with no schedule backlink.
 */
function makeExistingOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    tenantId: TENANT_ID,
    code: "ORD-1",
    name: "Test Order",
    description: null,
    status: "active",
    customer: null,
    isActive: true,
    costCenterId: null,
    billingRatePerHour: null,
    validFrom: null,
    validTo: null,
    serviceObjectId: null,
    serviceScheduleId: null,
    costCenter: null,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    updatedAt: new Date("2026-04-01T00:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: the re-fetch after update returns the same order (ignored by tests).
  ;(orderRepo.findByIdWithInclude as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeExistingOrder({ status: "completed" }),
  )
  ;(orderRepo.update as ReturnType<typeof vi.fn>).mockResolvedValue(
    makeExistingOrder(),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// update() — ServiceSchedule completion hook
// ---------------------------------------------------------------------------

describe("orderService.update — ServiceSchedule completion hook", () => {
  it("does NOT call recordCompletion when existing.serviceScheduleId is null", async () => {
    ;(orderRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeExistingOrder({
        status: "active",
        serviceScheduleId: null,
      }),
    )

    await orderService.update(
      prismaStub,
      TENANT_ID,
      { id: ORDER_ID, status: "completed" },
      AUDIT,
    )

    expect(serviceScheduleService.recordCompletion).not.toHaveBeenCalled()
  })

  it("calls recordCompletion on active → completed transition with serviceScheduleId", async () => {
    ;(orderRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeExistingOrder({
        status: "active",
        serviceScheduleId: SCHEDULE_ID,
      }),
    )

    await orderService.update(
      prismaStub,
      TENANT_ID,
      { id: ORDER_ID, status: "completed" },
      AUDIT,
    )

    expect(serviceScheduleService.recordCompletion).toHaveBeenCalledTimes(1)
    const call = (serviceScheduleService.recordCompletion as ReturnType<
      typeof vi.fn
    >).mock.calls[0]!
    // (prisma, tenantId, scheduleId, completedAt, audit)
    expect(call[0]).toBe(prismaStub)
    expect(call[1]).toBe(TENANT_ID)
    expect(call[2]).toBe(SCHEDULE_ID)
    expect(call[3]).toBeInstanceOf(Date)
    expect(call[4]).toEqual(AUDIT)
  })

  it("does NOT call recordCompletion when status does not change (active → active)", async () => {
    ;(orderRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeExistingOrder({
        status: "active",
        serviceScheduleId: SCHEDULE_ID,
      }),
    )

    // Name-only update (no status field set)
    await orderService.update(
      prismaStub,
      TENANT_ID,
      { id: ORDER_ID, name: "Renamed" },
      AUDIT,
    )

    expect(serviceScheduleService.recordCompletion).not.toHaveBeenCalled()
  })

  it("does NOT call recordCompletion on idempotent completed → completed re-submit", async () => {
    // Disponent hits "save" twice, or UI resubmits the same status.
    // The hook's guard `existing.status !== "completed"` must block this
    // to prevent double-rollover of lastCompletedAt / nextDueAt.
    ;(orderRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeExistingOrder({
        status: "completed",
        serviceScheduleId: SCHEDULE_ID,
      }),
    )

    await orderService.update(
      prismaStub,
      TENANT_ID,
      { id: ORDER_ID, status: "completed" },
      AUDIT,
    )

    expect(serviceScheduleService.recordCompletion).not.toHaveBeenCalled()
  })

  it("swallows recordCompletion errors and still returns the updated order", async () => {
    ;(orderRepo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeExistingOrder({
        status: "active",
        serviceScheduleId: SCHEDULE_ID,
      }),
    )
    ;(
      serviceScheduleService.recordCompletion as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("schedule blew up"))

    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await orderService.update(
      prismaStub,
      TENANT_ID,
      { id: ORDER_ID, status: "completed" },
      AUDIT,
    )

    // Update still returned successfully.
    expect(result).toBeDefined()
    // Hook was attempted once.
    expect(serviceScheduleService.recordCompletion).toHaveBeenCalledTimes(1)
    // Warning was logged.
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(consoleWarn.mock.calls[0]![0]).toContain(
      "[order-service] recordCompletion failed",
    )

    consoleWarn.mockRestore()
  })
})
