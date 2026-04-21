import { describe, it, expect, vi } from "vitest"
import * as service from "../user-display-name-service"
import type { PrismaClient } from "@/generated/prisma/client"

const TENANT_ID = "a0000000-0000-4000-a000-000000000100"
const USER_A = "u0000000-0000-4000-a000-000000000001"
const USER_B = "u0000000-0000-4000-a000-000000000002"

function createMockPrisma(findManyReturn: unknown[] = []) {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue(findManyReturn),
    },
  } as unknown as PrismaClient
}

describe("user-display-name-service", () => {
  describe("resolveMany", () => {
    it("returns empty map and does NOT call prisma for empty input", async () => {
      const prisma = createMockPrisma()
      const map = await service.resolveMany(prisma, TENANT_ID, [])
      expect(map.size).toBe(0)
      expect(prisma.user.findMany).not.toHaveBeenCalled()
    })

    it("deduplicates repeated IDs before querying", async () => {
      const prisma = createMockPrisma([
        { id: USER_A, displayName: "Alice", email: "alice@x.io" },
      ])
      await service.resolveMany(prisma, TENANT_ID, [USER_A, USER_A, USER_A])
      const call = (prisma.user.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where.id).toEqual({ in: [USER_A] })
    })

    it("filters falsy IDs from input", async () => {
      const prisma = createMockPrisma([])
      await service.resolveMany(prisma, TENANT_ID, [
        USER_A,
        "",
        USER_B,
      ] as string[])
      const call = (prisma.user.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where.id).toEqual({ in: [USER_A, USER_B] })
    })

    it("uses displayName when non-empty", async () => {
      const prisma = createMockPrisma([
        { id: USER_A, displayName: "Hans Müller", email: "hans@x.io" },
      ])
      const map = await service.resolveMany(prisma, TENANT_ID, [USER_A])
      expect(map.get(USER_A)?.displayName).toBe("Hans Müller")
    })

    it("falls back to email when displayName is blank", async () => {
      const prisma = createMockPrisma([
        { id: USER_A, displayName: "  ", email: "fallback@x.io" },
      ])
      const map = await service.resolveMany(prisma, TENANT_ID, [USER_A])
      expect(map.get(USER_A)?.displayName).toBe("fallback@x.io")
    })

    it("falls back to email when displayName is null", async () => {
      const prisma = createMockPrisma([
        { id: USER_A, displayName: null, email: "fallback@x.io" },
      ])
      const map = await service.resolveMany(prisma, TENANT_ID, [USER_A])
      expect(map.get(USER_A)?.displayName).toBe("fallback@x.io")
    })

    it('falls back to "Unbekannt" when both displayName and email are blank', async () => {
      const prisma = createMockPrisma([
        { id: USER_A, displayName: null, email: "" },
      ])
      const map = await service.resolveMany(prisma, TENANT_ID, [USER_A])
      expect(map.get(USER_A)?.displayName).toBe("Unbekannt")
    })

    it("scopes where-clause to tenantId", async () => {
      const prisma = createMockPrisma([])
      await service.resolveMany(prisma, TENANT_ID, [USER_A])
      const call = (prisma.user.findMany as ReturnType<typeof vi.fn>).mock
        .calls[0]![0]
      expect(call.where.tenantId).toBe(TENANT_ID)
    })

    it("omits unknown IDs from the result map (caller fallbacks)", async () => {
      const prisma = createMockPrisma([
        { id: USER_A, displayName: "Alice", email: "alice@x.io" },
      ])
      const map = await service.resolveMany(prisma, TENANT_ID, [USER_A, USER_B])
      expect(map.has(USER_A)).toBe(true)
      expect(map.has(USER_B)).toBe(false)
    })
  })
})
