/**
 * Regression test: tenant-side tenantModules router is read-only (Phase 9).
 *
 * Phase 9 removed the `enable` and `disable` procedures from the tenant
 * router so that module booking can only happen through the platform-admin
 * `tenantManagement.enableModule` / `.disableModule` flow. This test locks
 * the read-only contract so any future change that re-exposes the tenant
 * mutations shows up here as a single assertion failure.
 */
import { describe, it, expect } from "vitest"
import { tenantModulesRouter } from "../tenantModules"

describe("tenantModules router — read-only contract", () => {
  it("exposes only the list procedure", () => {
    const keys = Object.keys(tenantModulesRouter._def.procedures).sort()
    expect(keys).toEqual(["list"])
  })

  it("does not expose enable or disable", () => {
    const procedures = tenantModulesRouter._def.procedures as Record<
      string,
      unknown
    >
    expect(procedures.enable).toBeUndefined()
    expect(procedures.disable).toBeUndefined()
  })
})
