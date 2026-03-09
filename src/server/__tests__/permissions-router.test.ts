import { describe, it, expect } from "vitest"
import { createTRPCRouter, createCallerFactory } from "../trpc"
import { permissionsRouter } from "../routers/permissions"
import { ALL_PERMISSIONS } from "../lib/permission-catalog"
import {
  createMockUser,
  createMockSession,
  createMockContext,
} from "./helpers"

const testRouter = createTRPCRouter({
  permissions: permissionsRouter,
})

const createCaller = createCallerFactory(testRouter)

describe("permissions.list", () => {
  it("returns all permissions for authenticated user", async () => {
    const caller = createCaller(
      createMockContext({
        user: createMockUser(),
        session: createMockSession(),
      })
    )
    const result = await caller.permissions.list()
    expect(result.permissions).toHaveLength(ALL_PERMISSIONS.length)
    expect(result.permissions).toHaveLength(53)
  })

  it("each permission has id, key, resource, action, description", async () => {
    const caller = createCaller(
      createMockContext({
        user: createMockUser(),
        session: createMockSession(),
      })
    )
    const result = await caller.permissions.list()

    for (const perm of result.permissions) {
      expect(perm.id).toBeDefined()
      expect(perm.key).toBeDefined()
      expect(perm.resource).toBeDefined()
      expect(perm.action).toBeDefined()
      expect(perm.description).toBeDefined()

      // Verify UUID format
      expect(perm.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      )
    }
  })

  it("throws UNAUTHORIZED for unauthenticated request", async () => {
    const caller = createCaller(createMockContext())
    await expect(caller.permissions.list()).rejects.toThrow(
      "Authentication required"
    )
  })

  it("returns consistent results across calls", async () => {
    const caller = createCaller(
      createMockContext({
        user: createMockUser(),
        session: createMockSession(),
      })
    )
    const result1 = await caller.permissions.list()
    const result2 = await caller.permissions.list()

    expect(result1.permissions).toEqual(result2.permissions)
  })
})
