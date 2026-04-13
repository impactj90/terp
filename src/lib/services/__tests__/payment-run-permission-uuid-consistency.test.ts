/**
 * Fail-fast guard: the UUIDs seeded in the
 * 20260423000001_add_payment_run_permissions_and_module.sql migration
 * must match the UUIDs computed by permissionIdByKey() in the TypeScript
 * catalog. If someone ever changes the UUID namespace or the permission
 * key strings, this test catches the drift immediately.
 */
import { describe, it, expect } from "vitest"
import { permissionIdByKey } from "@/lib/auth/permission-catalog"

const EXPECTED: Record<string, string> = {
  "payment_runs.view": "12b75b07-c614-53e5-8bf2-d2bd146e47a0",
  "payment_runs.create": "7488295e-3707-5256-a9cc-ba4e7fd6a6cd",
  "payment_runs.export": "b1428b0c-9a16-5bf9-b66a-252e26667608",
  "payment_runs.book": "a1124333-f5dc-5439-a247-f929cfd971d9",
  "payment_runs.cancel": "5bad900a-8f8e-5842-8ab7-636425ecc7d8",
}

describe("payment_runs permission UUID catalog consistency", () => {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    it(`catalog UUID matches migration for ${key}`, () => {
      expect(permissionIdByKey(key)).toBe(expected)
    })
  }
})
