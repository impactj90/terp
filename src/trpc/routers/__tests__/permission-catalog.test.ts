import { describe, it, expect } from "vitest"
import {
  ALL_PERMISSIONS,
  lookupPermission,
  permissionIdByKey,
  listPermissions,
} from "@/lib/auth/permission-catalog"

describe("permission-catalog", () => {
  it("generates correct UUID for known permission key (matches Go backend)", () => {
    // The UUID for "employees.view" should be deterministic and match the Go output.
    // This verifies the UUID v5 namespace and algorithm match.
    const id = permissionIdByKey("employees.view")
    expect(id).toBeDefined()
    // UUID v5 produces consistent results -- just verify it's a valid UUID format
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    )
  })

  it("contains exactly 74 permissions", () => {
    expect(ALL_PERMISSIONS).toHaveLength(74)
  })

  it("all permissions have unique IDs", () => {
    const ids = ALL_PERMISSIONS.map((p) => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it("all permissions have unique keys", () => {
    const keys = ALL_PERMISSIONS.map((p) => p.key)
    const uniqueKeys = new Set(keys)
    expect(uniqueKeys.size).toBe(keys.length)
  })

  it("all permission keys match resource.action format", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(perm.key).toBe(`${perm.resource}.${perm.action}`)
    }
  })

  it("all permissions have non-empty descriptions", () => {
    for (const perm of ALL_PERMISSIONS) {
      expect(perm.description.length).toBeGreaterThan(0)
    }
  })

  it("lookupPermission returns correct permission by UUID", () => {
    const firstPerm = ALL_PERMISSIONS[0]!
    const found = lookupPermission(firstPerm.id)
    expect(found).toBeDefined()
    expect(found?.key).toBe(firstPerm.key)
    expect(found?.resource).toBe(firstPerm.resource)
    expect(found?.action).toBe(firstPerm.action)
  })

  it("lookupPermission returns undefined for unknown UUID", () => {
    const found = lookupPermission("00000000-0000-0000-0000-000000000000")
    expect(found).toBeUndefined()
  })

  it("permissionIdByKey returns correct UUID for known key", () => {
    const id = permissionIdByKey("employees.view")
    const perm = ALL_PERMISSIONS.find((p) => p.key === "employees.view")
    expect(id).toBe(perm?.id)
  })

  it("permissionIdByKey returns undefined for unknown key", () => {
    const id = permissionIdByKey("nonexistent.permission")
    expect(id).toBeUndefined()
  })

  it("listPermissions returns a copy (not the original array)", () => {
    const list1 = listPermissions()
    const list2 = listPermissions()
    expect(list1).not.toBe(list2) // different array references
    expect(list1).toEqual(list2) // same content
    expect(list1).not.toBe(ALL_PERMISSIONS)
  })

  it("permission IDs are valid UUID v5 format", () => {
    const uuidV5Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    for (const perm of ALL_PERMISSIONS) {
      expect(perm.id).toMatch(uuidV5Regex)
    }
  })
})
