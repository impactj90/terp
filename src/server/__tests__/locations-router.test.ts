import { describe, it, expect, vi } from "vitest"
import { createCallerFactory } from "@/trpc/init"
import { locationsRouter } from "../routers/locations"
import { permissionIdByKey } from "../lib/permission-catalog"
import {
  createMockContext,
  createMockSession,
  createUserWithPermissions,
  createMockUserTenant,
} from "./helpers"

// --- Constants ---

const LOCATIONS_MANAGE = permissionIdByKey("locations.manage")!
const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_ID = "a0000000-0000-4000-a000-000000000001"
const LOC_ID = "a0000000-0000-4000-a000-000000000600"
const LOC_B_ID = "a0000000-0000-4000-a000-000000000601"

const createCaller = createCallerFactory(locationsRouter)

// --- Helpers ---

function makeLocation(
  overrides: Partial<{
    id: string
    tenantId: string
    code: string
    name: string
    description: string
    address: string
    city: string
    country: string
    timezone: string
    isActive: boolean
    createdAt: Date
    updatedAt: Date
  }> = {}
) {
  return {
    id: LOC_ID,
    tenantId: TENANT_ID,
    code: "HQ",
    name: "Headquarters",
    description: "",
    address: "",
    city: "",
    country: "",
    timezone: "",
    isActive: true,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    ...overrides,
  }
}

function createTestContext(prisma: Record<string, unknown>) {
  return createMockContext({
    prisma: prisma as unknown as ReturnType<typeof createMockContext>["prisma"],
    authToken: "test-token",
    user: createUserWithPermissions([LOCATIONS_MANAGE], {
      userTenants: [createMockUserTenant(USER_ID, TENANT_ID)],
    }),
    session: createMockSession(),
    tenantId: TENANT_ID,
  })
}

// --- locations.list tests ---

describe("locations.list", () => {
  it("returns locations for tenant", async () => {
    const locs = [
      makeLocation({ id: LOC_ID, code: "HQ", name: "Headquarters" }),
      makeLocation({ id: LOC_B_ID, code: "BR1", name: "Branch 1" }),
    ]
    const mockPrisma = {
      location: {
        findMany: vi.fn().mockResolvedValue(locs),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toHaveLength(2)
    expect(result.data[0]!.code).toBe("HQ")
    expect(mockPrisma.location.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      orderBy: { code: "asc" },
    })
  })

  it("filters by isActive when provided", async () => {
    const mockPrisma = {
      location: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.list({ isActive: true })
    expect(mockPrisma.location.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, isActive: true },
      orderBy: { code: "asc" },
    })
  })

  it("returns empty array when no locations", async () => {
    const mockPrisma = {
      location: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.list()
    expect(result.data).toEqual([])
  })
})

// --- locations.getById tests ---

describe("locations.getById", () => {
  it("returns location when found", async () => {
    const loc = makeLocation()
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(loc),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.getById({ id: LOC_ID })
    expect(result.id).toBe(LOC_ID)
    expect(result.code).toBe("HQ")
  })

  it("throws NOT_FOUND for missing location", async () => {
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.getById({ id: LOC_ID })).rejects.toThrow(
      "Location not found"
    )
  })
})

// --- locations.create tests ---

describe("locations.create", () => {
  it("creates location successfully", async () => {
    const created = makeLocation()
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({ code: "HQ", name: "Headquarters" })
    expect(result.code).toBe("HQ")
    expect(mockPrisma.location.create).toHaveBeenCalled()
  })

  it("trims whitespace from code and name", async () => {
    const created = makeLocation()
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({
      code: "  HQ  ",
      name: "  Headquarters  ",
    })
    const createCall = mockPrisma.location.create.mock.calls[0]![0]
    expect(createCall.data.code).toBe("HQ")
    expect(createCall.data.name).toBe("Headquarters")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(makeLocation()),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.create({ code: "HQ", name: "Headquarters" })
    ).rejects.toThrow("Location code already exists")
  })

  it("sets default empty strings for address fields", async () => {
    const created = makeLocation()
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await caller.create({ code: "HQ", name: "Headquarters" })
    const createCall = mockPrisma.location.create.mock.calls[0]![0]
    expect(createCall.data.description).toBe("")
    expect(createCall.data.address).toBe("")
    expect(createCall.data.city).toBe("")
    expect(createCall.data.country).toBe("")
    expect(createCall.data.timezone).toBe("")
    expect(createCall.data.isActive).toBe(true)
  })

  it("stores address fields when provided", async () => {
    const created = makeLocation({
      address: "123 Main St",
      city: "Munich",
      country: "DE",
      timezone: "Europe/Berlin",
    })
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.create({
      code: "HQ",
      name: "Headquarters",
      address: "123 Main St",
      city: "Munich",
      country: "DE",
      timezone: "Europe/Berlin",
    })
    expect(result.address).toBe("123 Main St")
    expect(result.city).toBe("Munich")
    expect(result.country).toBe("DE")
    expect(result.timezone).toBe("Europe/Berlin")
  })
})

// --- locations.update tests ---

describe("locations.update", () => {
  it("updates name and address fields", async () => {
    const existing = makeLocation()
    const updated = makeLocation({
      name: "Updated",
      address: "456 Oak Ave",
      city: "Berlin",
    })
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({
      id: LOC_ID,
      name: "Updated",
      address: "456 Oak Ave",
      city: "Berlin",
    })
    expect(result.name).toBe("Updated")
    expect(result.address).toBe("456 Oak Ave")
    expect(result.city).toBe("Berlin")
  })

  it("rejects empty name with BAD_REQUEST", async () => {
    const existing = makeLocation()
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: LOC_ID, name: "   " })
    ).rejects.toThrow("Location name is required")
  })

  it("rejects empty code with BAD_REQUEST", async () => {
    const existing = makeLocation()
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: LOC_ID, code: "   " })
    ).rejects.toThrow("Location code is required")
  })

  it("rejects duplicate code with CONFLICT", async () => {
    const existing = makeLocation({ code: "OLD" })
    const conflicting = makeLocation({ id: LOC_B_ID, code: "NEW" })
    const mockPrisma = {
      location: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(existing)
          .mockResolvedValueOnce(conflicting),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: LOC_ID, code: "NEW" })
    ).rejects.toThrow("Location code already exists")
  })

  it("allows updating to same code (no false conflict)", async () => {
    const existing = makeLocation({ code: "HQ" })
    const updated = makeLocation({ code: "HQ" })
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(updated),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.update({ id: LOC_ID, code: "HQ" })
    expect(result.code).toBe("HQ")
    expect(mockPrisma.location.findFirst).toHaveBeenCalledTimes(1)
  })

  it("throws NOT_FOUND for missing location", async () => {
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(
      caller.update({ id: LOC_ID, name: "Updated" })
    ).rejects.toThrow("Location not found")
  })
})

// --- locations.delete tests ---

describe("locations.delete", () => {
  it("deletes location successfully", async () => {
    const existing = makeLocation()
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(existing),
        delete: vi.fn().mockResolvedValue(existing),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    const result = await caller.delete({ id: LOC_ID })
    expect(result.success).toBe(true)
    expect(mockPrisma.location.delete).toHaveBeenCalledWith({
      where: { id: LOC_ID },
    })
  })

  it("throws NOT_FOUND for missing location", async () => {
    const mockPrisma = {
      location: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    }
    const caller = createCaller(createTestContext(mockPrisma))
    await expect(caller.delete({ id: LOC_ID })).rejects.toThrow(
      "Location not found"
    )
  })
})
