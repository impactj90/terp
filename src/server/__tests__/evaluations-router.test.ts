import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "../trpc"
import { evaluationsRouter } from "../routers/evaluations"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"
import { permissionIdByKey } from "../lib/permission-catalog"

// --- Constants ---

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMPLOYEE_ID = "a0000000-0000-4000-a000-000000005001"
const DEPARTMENT_ID = "a0000000-0000-4000-a000-000000003001"
const DAILY_VALUE_ID = "a0000000-0000-4000-a000-000000007001"
const BOOKING_ID = "a0000000-0000-4000-a000-000000008001"
const AUDIT_LOG_ID = "a0000000-0000-4000-a000-000000009001"
const BOOKING_TYPE_ID = "a0000000-0000-4000-a000-00000000a001"

const REPORTS_VIEW = permissionIdByKey("reports.view")!

const createCaller = createCallerFactory(evaluationsRouter)

// --- Helpers ---

function createViewContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([REPORTS_VIEW], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function createScopedContext(
  prisma: Record<string, unknown>,
  scopeType: string,
  scopeIds: string[]
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([REPORTS_VIEW], {
      id: USER_ID,
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
      dataScopeType: scopeType,
      dataScopeDepartmentIds: scopeType === "department" ? scopeIds : [],
      dataScopeEmployeeIds: scopeType === "employee" ? scopeIds : [],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

function makeDailyValue(overrides: Record<string, unknown> = {}) {
  return {
    id: DAILY_VALUE_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    valueDate: new Date("2026-03-01"),
    status: "calculated",
    grossTime: 480,
    netTime: 450,
    targetTime: 480,
    overtime: 30,
    undertime: 0,
    breakTime: 30,
    hasError: false,
    errorCodes: [],
    warnings: [],
    firstCome: 480, // 08:00
    lastGo: 1020, // 17:00
    bookingCount: 2,
    calculatedAt: new Date("2026-03-01T18:00:00Z"),
    createdAt: new Date("2026-03-01"),
    updatedAt: new Date("2026-03-01"),
    employee: {
      id: EMPLOYEE_ID,
      personnelNumber: "001",
      firstName: "Max",
      lastName: "Mustermann",
      isActive: true,
    },
    ...overrides,
  }
}

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: BOOKING_ID,
    tenantId: TENANT_ID,
    employeeId: EMPLOYEE_ID,
    bookingDate: new Date("2026-03-01"),
    bookingTypeId: BOOKING_TYPE_ID,
    originalTime: 480,
    editedTime: 490,
    calculatedTime: null,
    pairId: null,
    terminalId: null,
    source: "web",
    notes: "Test booking",
    createdAt: new Date("2026-03-01T08:00:00Z"),
    updatedAt: new Date("2026-03-01T08:00:00Z"),
    employee: {
      id: EMPLOYEE_ID,
      personnelNumber: "001",
      firstName: "Max",
      lastName: "Mustermann",
      isActive: true,
    },
    bookingType: {
      id: BOOKING_TYPE_ID,
      code: "COME",
      name: "Come",
      direction: "in",
    },
    ...overrides,
  }
}

function makeAuditLog(overrides: Record<string, unknown> = {}) {
  return {
    id: AUDIT_LOG_ID,
    tenantId: TENANT_ID,
    userId: USER_ID,
    action: "update",
    entityType: "booking",
    entityId: BOOKING_ID,
    entityName: "Booking 2026-03-01",
    changes: { before: { time: 480 }, after: { time: 490 } },
    metadata: null,
    performedAt: new Date("2026-03-01T10:00:00Z"),
    ipAddress: null,
    userAgent: null,
    user: {
      id: USER_ID,
      displayName: "Test User",
    },
    ...overrides,
  }
}

// --- evaluations.dailyValues tests ---

describe("evaluations.dailyValues", () => {
  it("returns paginated daily values with correct field mapping", async () => {
    const values = [makeDailyValue()]
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue(values),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)

    const item = result.items[0]!
    // Verify field mapping from Prisma names to output names
    expect(item.targetMinutes).toBe(480)
    expect(item.grossMinutes).toBe(480)
    expect(item.netMinutes).toBe(450)
    expect(item.breakMinutes).toBe(30)
    expect(item.overtimeMinutes).toBe(30)
    expect(item.undertimeMinutes).toBe(0)
    // Verify computed field
    expect(item.balanceMinutes).toBe(30) // overtime - undertime = 30 - 0
    expect(item.hasErrors).toBe(false)
    expect(item.firstCome).toBe(480)
    expect(item.lastGo).toBe(1020)
    expect(item.bookingCount).toBe(2)
    // Verify employee summary
    expect(item.employee).toEqual({
      id: EMPLOYEE_ID,
      personnelNumber: "001",
      firstName: "Max",
      lastName: "Mustermann",
      isActive: true,
    })
  })

  it("filters by date range", async () => {
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(mockPrisma.dailyValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          valueDate: {
            gte: new Date("2026-03-01"),
            lte: new Date("2026-03-31"),
          },
        }),
      })
    )
  })

  it("filters by employeeId", async () => {
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      employeeId: EMPLOYEE_ID,
    })

    expect(mockPrisma.dailyValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: EMPLOYEE_ID,
        }),
      })
    )
  })

  it("filters by departmentId via employee relation", async () => {
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      departmentId: DEPARTMENT_ID,
    })

    expect(mockPrisma.dailyValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employee: expect.objectContaining({
            departmentId: DEPARTMENT_ID,
          }),
        }),
      })
    )
  })

  it("filters by hasErrors", async () => {
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      hasErrors: true,
    })

    expect(mockPrisma.dailyValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          hasError: true,
        }),
      })
    )
  })

  it("applies data scope (department)", async () => {
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(
      createScopedContext(mockPrisma, "department", [DEPARTMENT_ID])
    )
    await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(mockPrisma.dailyValue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employee: expect.objectContaining({
            departmentId: { in: [DEPARTMENT_ID] },
          }),
        }),
      })
    )
  })

  it("computes balanceMinutes correctly with negative balance", async () => {
    const values = [makeDailyValue({ overtime: 10, undertime: 30 })]
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue(values),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items[0]!.balanceMinutes).toBe(-20) // 10 - 30
  })
})

// --- evaluations.bookings tests ---

describe("evaluations.bookings", () => {
  it("returns paginated bookings with timeString computed", async () => {
    const bookings = [makeBooking({ editedTime: 510 })] // 510 = 08:30
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue(bookings),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.bookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)
    expect(result.items[0]!.timeString).toBe("08:30")
    expect(result.items[0]!.employee).toBeDefined()
    expect(result.items[0]!.bookingType).toBeDefined()
  })

  it("filters by direction via bookingType relation", async () => {
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.bookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      direction: "in",
    })

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          bookingType: expect.objectContaining({
            direction: "in",
          }),
        }),
      })
    )
  })

  it("filters by source", async () => {
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.bookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      source: "terminal",
    })

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: "terminal",
        }),
      })
    )
  })

  it("applies data scope", async () => {
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(
      createScopedContext(mockPrisma, "employee", [EMPLOYEE_ID])
    )
    await caller.bookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: { in: [EMPLOYEE_ID] },
        }),
      })
    )
  })

  it("formats timeString as HH:MM", async () => {
    const bookings = [makeBooking({ editedTime: 0 })] // 00:00
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue(bookings),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.bookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items[0]!.timeString).toBe("00:00")
  })
})

// --- evaluations.terminalBookings tests ---

describe("evaluations.terminalBookings", () => {
  it("hardcodes source='terminal'", async () => {
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.terminalBookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: "terminal",
        }),
      })
    )
  })

  it("computes wasEdited and time strings", async () => {
    const bookings = [
      makeBooking({
        source: "terminal",
        originalTime: 480, // 08:00
        editedTime: 490, // 08:10
      }),
    ]
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue(bookings),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.terminalBookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    const item = result.items[0]!
    expect(item.wasEdited).toBe(true)
    expect(item.originalTimeString).toBe("08:00")
    expect(item.editedTimeString).toBe("08:10")
  })

  it("wasEdited is false when times match", async () => {
    const bookings = [
      makeBooking({
        source: "terminal",
        originalTime: 480,
        editedTime: 480,
      }),
    ]
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue(bookings),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.terminalBookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items[0]!.wasEdited).toBe(false)
  })

  it("applies data scope", async () => {
    const mockPrisma = {
      booking: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(
      createScopedContext(mockPrisma, "department", [DEPARTMENT_ID])
    )
    await caller.terminalBookings({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(mockPrisma.booking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: "terminal",
          employee: expect.objectContaining({
            departmentId: { in: [DEPARTMENT_ID] },
          }),
        }),
      })
    )
  })
})

// --- evaluations.logs tests ---

describe("evaluations.logs", () => {
  it("returns audit log entries with user summary", async () => {
    const logs = [makeAuditLog()]
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue(logs),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.logs({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(1)

    const item = result.items[0]!
    expect(item.action).toBe("update")
    expect(item.entityType).toBe("booking")
    expect(item.user).toEqual({
      id: USER_ID,
      displayName: "Test User",
    })
  })

  it("applies end-of-day adjustment to toDate", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.logs({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    const callArgs = mockPrisma.auditLog.findMany.mock.calls[0][0]
    const performedAt = callArgs.where.performedAt as {
      gte: Date
      lte: Date
    }
    expect(performedAt.lte.getHours()).toBe(23)
    expect(performedAt.lte.getMinutes()).toBe(59)
    expect(performedAt.lte.getSeconds()).toBe(59)
  })

  it("does NOT apply data scope", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(
      createScopedContext(mockPrisma, "department", [DEPARTMENT_ID])
    )
    await caller.logs({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    const callArgs = mockPrisma.auditLog.findMany.mock.calls[0][0]
    // Should not have employee or employeeId in where clause
    expect(callArgs.where.employee).toBeUndefined()
    expect(callArgs.where.employeeId).toBeUndefined()
  })

  it("filters by entityType", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.logs({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      entityType: "booking",
    })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: "booking",
        }),
      })
    )
  })

  it("filters by action", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.logs({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      action: "create",
    })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: "create",
        }),
      })
    )
  })

  it("filters by userId", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.logs({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      userId: USER_ID,
    })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: USER_ID,
        }),
      })
    )
  })
})

// --- evaluations.workflowHistory tests ---

describe("evaluations.workflowHistory", () => {
  it("applies default entity type and action filters when not specified", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.workflowHistory({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: { in: ["absence", "monthly_value"] },
          action: {
            in: ["create", "approve", "reject", "close", "reopen"],
          },
        }),
      })
    )
  })

  it("uses specific entity type when provided", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.workflowHistory({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      entityType: "absence",
    })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          entityType: { in: ["absence"] },
        }),
      })
    )
  })

  it("uses specific action when provided", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.workflowHistory({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
      action: "approve",
    })

    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: { in: ["approve"] },
        }),
      })
    )
  })

  it("uses metadata field instead of changes", async () => {
    const logs = [
      makeAuditLog({
        entityType: "absence",
        action: "approve",
        metadata: { approved_by: "admin" },
        changes: null,
      }),
    ]
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue(logs),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.workflowHistory({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    const item = result.items[0]!
    expect(item.metadata).toEqual({ approved_by: "admin" })
    expect(item).not.toHaveProperty("changes")
  })

  it("applies end-of-day adjustment to toDate", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    await caller.workflowHistory({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    const callArgs = mockPrisma.auditLog.findMany.mock.calls[0][0]
    const performedAt = callArgs.where.performedAt as {
      gte: Date
      lte: Date
    }
    expect(performedAt.lte.getHours()).toBe(23)
    expect(performedAt.lte.getMinutes()).toBe(59)
    expect(performedAt.lte.getSeconds()).toBe(59)
  })

  it("does NOT apply data scope", async () => {
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(
      createScopedContext(mockPrisma, "employee", [EMPLOYEE_ID])
    )
    await caller.workflowHistory({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    const callArgs = mockPrisma.auditLog.findMany.mock.calls[0][0]
    expect(callArgs.where.employee).toBeUndefined()
    expect(callArgs.where.employeeId).toBeUndefined()
  })
})

// --- Authentication test ---

describe("authentication", () => {
  it("throws UNAUTHORIZED for unauthenticated request", async () => {
    const mockPrisma = {}
    const ctx = createMockContext({
      prisma:
        mockPrisma as unknown as ReturnType<typeof createMockContext>["prisma"],
      authToken: null,
      user: null,
      session: null,
      tenantId: TENANT_ID,
    })
    const caller = createCaller(ctx)
    await expect(
      caller.dailyValues({ fromDate: "2026-03-01", toDate: "2026-03-31" })
    ).rejects.toThrow("Authentication required")
  })
})

// --- Empty results and null fields ---

describe("edge cases", () => {
  it("handles empty results", async () => {
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items).toEqual([])
    expect(result.total).toBe(0)
  })

  it("handles null employee in daily value", async () => {
    const values = [makeDailyValue({ employee: null })]
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue(values),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items[0]!.employee).toBeNull()
  })

  it("handles null firstCome and lastGo", async () => {
    const values = [makeDailyValue({ firstCome: null, lastGo: null })]
    const mockPrisma = {
      dailyValue: {
        findMany: vi.fn().mockResolvedValue(values),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.dailyValues({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items[0]!.firstCome).toBeNull()
    expect(result.items[0]!.lastGo).toBeNull()
  })

  it("handles null user in audit log", async () => {
    const logs = [makeAuditLog({ userId: null, user: null })]
    const mockPrisma = {
      auditLog: {
        findMany: vi.fn().mockResolvedValue(logs),
        count: vi.fn().mockResolvedValue(1),
      },
    }
    const caller = createCaller(createViewContext(mockPrisma))
    const result = await caller.logs({
      fromDate: "2026-03-01",
      toDate: "2026-03-31",
    })

    expect(result.items[0]!.userId).toBeNull()
    expect(result.items[0]!.user).toBeNull()
  })
})
