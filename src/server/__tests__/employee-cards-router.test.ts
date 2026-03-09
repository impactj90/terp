import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { employeeCardsRouter } from "../routers/employeeCards"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const EMPLOYEES_VIEW = permissionIdByKey("employees.view")!
const EMPLOYEES_EDIT = permissionIdByKey("employees.edit")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const EMP_ID = "a0000000-0000-4000-a000-000000000500"
const CARD_ID = "a0000000-0000-4000-a000-000000000700"

const createCaller = createCallerFactory(employeeCardsRouter)

// --- Helpers ---

function makeCard(
  overrides: Partial<{
    id: string
    tenantId: string
    employeeId: string
    cardNumber: string
    cardType: string
    validFrom: Date
    validTo: Date | null
    isActive: boolean
    deactivatedAt: Date | null
    deactivationReason: string | null
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: CARD_ID,
    tenantId: TENANT_ID,
    employeeId: EMP_ID,
    cardNumber: "CARD001",
    cardType: "rfid",
    validFrom: new Date("2025-01-01"),
    validTo: null,
    isActive: true,
    deactivatedAt: null,
    deactivationReason: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(
  prisma: Record<string, unknown>,
  permissions: string[] = [EMPLOYEES_VIEW, EMPLOYEES_EDIT]
) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions(permissions, {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- employeeCards.list tests ---

describe("employeeCards.list", () => {
  it("returns cards for employee", async () => {
    const cards = [makeCard()]
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeCard: {
        findMany: vi.fn().mockResolvedValue(cards),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list({ employeeId: EMP_ID })
    expect(result.data).toHaveLength(1)
    expect(result.data[0]!.cardNumber).toBe("CARD001")
  })

  it("verifies employee belongs to tenant", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.list({ employeeId: EMP_ID })).rejects.toThrow(
      "Employee not found"
    )
  })
})

// --- employeeCards.create tests ---

describe("employeeCards.create", () => {
  it("creates card successfully", async () => {
    const created = makeCard()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeCard: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      employeeId: EMP_ID,
      cardNumber: "CARD001",
    })
    expect(result.cardNumber).toBe("CARD001")
    expect(result.cardType).toBe("rfid")
  })

  it("defaults cardType to rfid", async () => {
    const created = makeCard()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeCard: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      employeeId: EMP_ID,
      cardNumber: "CARD001",
    })
    const createCall = mockPrisma.employeeCard.create.mock.calls[0]![0]
    expect(createCall.data.cardType).toBe("rfid")
  })

  it("rejects duplicate cardNumber per tenant", async () => {
    const existingCard = makeCard()
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue({ id: EMP_ID }),
      },
      employeeCard: {
        findFirst: vi.fn().mockResolvedValue(existingCard),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        cardNumber: "CARD001",
      })
    ).rejects.toThrow("Card number already exists")
  })

  it("verifies employee belongs to tenant", async () => {
    const mockPrisma = {
      employee: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({
        employeeId: EMP_ID,
        cardNumber: "CARD001",
      })
    ).rejects.toThrow("Employee not found")
  })
})

// --- employeeCards.deactivate tests ---

describe("employeeCards.deactivate", () => {
  it("deactivates card (sets isActive/deactivatedAt/reason)", async () => {
    const existing = makeCard()
    const deactivated = makeCard({
      isActive: false,
      deactivatedAt: new Date(),
      deactivationReason: "Lost",
    })
    const mockPrisma = {
      employeeCard: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(deactivated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.deactivate({ id: CARD_ID, reason: "Lost" })
    expect(result.isActive).toBe(false)
    expect(result.deactivationReason).toBe("Lost")
    const updateCall = mockPrisma.employeeCard.update.mock.calls[0]![0]
    expect(updateCall.data.isActive).toBe(false)
    expect(updateCall.data.deactivatedAt).toBeDefined()
    expect(updateCall.data.deactivationReason).toBe("Lost")
  })

  it("throws NOT_FOUND for missing card", async () => {
    const mockPrisma = {
      employeeCard: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.deactivate({ id: CARD_ID })).rejects.toThrow(
      "Card not found"
    )
  })

  it("verifies tenant matches", async () => {
    const mockPrisma = {
      employeeCard: {
        findFirst: vi.fn().mockResolvedValue(null), // not found in tenant
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.deactivate({ id: CARD_ID })).rejects.toThrow(
      "Card not found"
    )
  })
})
