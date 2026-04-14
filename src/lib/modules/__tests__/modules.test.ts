import { describe, it, expect, vi } from "vitest"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  AVAILABLE_MODULES,
  getEnabledModules,
  hasModule,
} from "../index"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"

function createMockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    tenantModule: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      ...overrides,
    },
  } as unknown as PrismaClient
}

describe("AVAILABLE_MODULES", () => {
  it("contains expected module keys", () => {
    expect(AVAILABLE_MODULES).toEqual([
      "core",
      "crm",
      "billing",
      "warehouse",
      "inbound_invoices",
      "payment_runs",
    ])
  })
})

describe("getEnabledModules", () => {
  it("returns modules from DB", async () => {
    const prisma = createMockPrisma({
      findMany: vi.fn().mockResolvedValue([
        { module: "core" },
        { module: "billing" },
      ]),
    })

    const result = await getEnabledModules(prisma, TENANT_ID)
    expect(result).toEqual(["core", "billing"])
  })

  it("always includes 'core' even if not in DB", async () => {
    const prisma = createMockPrisma({
      findMany: vi.fn().mockResolvedValue([
        { module: "billing" },
      ]),
    })

    const result = await getEnabledModules(prisma, TENANT_ID)
    expect(result).toContain("core")
    expect(result).toContain("billing")
  })

  it("returns just 'core' when DB is empty", async () => {
    const prisma = createMockPrisma()

    const result = await getEnabledModules(prisma, TENANT_ID)
    expect(result).toEqual(["core"])
  })
})

describe("hasModule", () => {
  it("returns true for 'core' without DB query", async () => {
    const prisma = createMockPrisma()

    const result = await hasModule(prisma, TENANT_ID, "core")
    expect(result).toBe(true)
    expect(prisma.tenantModule.findUnique).not.toHaveBeenCalled()
  })

  it("returns true when module row exists", async () => {
    const prisma = createMockPrisma({
      findUnique: vi.fn().mockResolvedValue({
        id: "test",
        tenantId: TENANT_ID,
        module: "billing",
      }),
    })

    const result = await hasModule(prisma, TENANT_ID, "billing")
    expect(result).toBe(true)
    expect(prisma.tenantModule.findUnique).toHaveBeenCalledWith({
      where: { tenantId_module: { tenantId: TENANT_ID, module: "billing" } },
    })
  })

  it("returns false when no row exists", async () => {
    const prisma = createMockPrisma()

    const result = await hasModule(prisma, TENANT_ID, "crm")
    expect(result).toBe(false)
  })
})
