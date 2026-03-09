import { describe, it, expect } from "vitest"
import type { UserGroup } from "@/generated/prisma/client"
import { hasPermission, hasAnyPermission } from "@/lib/auth/permissions"
import {
  createMockUser,
  createMockUserGroup,
  createAdminUser,
  createUserWithPermissions,
} from "./helpers"

const PERM_A = "aaaaaaaa-aaaa-5aaa-aaaa-aaaaaaaaaaaa"
const PERM_B = "bbbbbbbb-bbbb-5bbb-bbbb-bbbbbbbbbbbb"
const PERM_C = "cccccccc-cccc-5ccc-cccc-cccccccccccc"

describe("hasPermission", () => {
  it("returns false for empty permission ID", () => {
    const user = createAdminUser()
    expect(hasPermission(user, "")).toBe(false)
  })

  it("returns true for admin group user (active, isAdmin)", () => {
    const user = createAdminUser()
    expect(hasPermission(user, PERM_A)).toBe(true)
  })

  it("returns false for inactive admin group", () => {
    const user = createMockUser({
      userGroup: createMockUserGroup({
        isAdmin: true,
        isActive: false,
      }),
    })
    expect(hasPermission(user, PERM_A)).toBe(false)
  })

  it("returns true for user with specific permission in group", () => {
    const user = createUserWithPermissions([PERM_A, PERM_B])
    expect(hasPermission(user, PERM_A)).toBe(true)
    expect(hasPermission(user, PERM_B)).toBe(true)
  })

  it("returns false for user without specific permission in group", () => {
    const user = createUserWithPermissions([PERM_A])
    expect(hasPermission(user, PERM_B)).toBe(false)
  })

  it("returns true for no-group user with admin role (fallback)", () => {
    const user = createMockUser({ role: "admin", userGroup: null })
    expect(hasPermission(user, PERM_A)).toBe(true)
  })

  it("returns false for no-group user with non-admin role", () => {
    const user = createMockUser({ role: "user", userGroup: null })
    expect(hasPermission(user, PERM_A)).toBe(false)
  })

  it("returns false for inactive group even with permission present", () => {
    const user = createMockUser({
      userGroup: createMockUserGroup({
        isActive: false,
        permissions: [PERM_A] as UserGroup["permissions"],
      }),
    })
    expect(hasPermission(user, PERM_A)).toBe(false)
  })
})

describe("hasAnyPermission", () => {
  it("returns true if user has at least one of the permissions", () => {
    const user = createUserWithPermissions([PERM_A])
    expect(hasAnyPermission(user, [PERM_A, PERM_B])).toBe(true)
  })

  it("returns false if user has none of the permissions", () => {
    const user = createUserWithPermissions([PERM_C])
    expect(hasAnyPermission(user, [PERM_A, PERM_B])).toBe(false)
  })

  it("returns true for admin user regardless", () => {
    const user = createAdminUser()
    expect(hasAnyPermission(user, [PERM_A, PERM_B])).toBe(true)
  })

  it("returns false for empty permissions array", () => {
    const user = createAdminUser()
    // hasAnyPermission with empty array returns false because
    // Array.some on empty array returns false
    expect(hasAnyPermission(user, [])).toBe(false)
  })
})
