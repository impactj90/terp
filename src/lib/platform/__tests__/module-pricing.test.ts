import { describe, it, expect } from "vitest"
import { MODULE_PRICES, getModulePrice } from "../module-pricing"

describe("platform module pricing", () => {
  it("returns monthly price for a monthly cycle", () => {
    const { unitPrice, vatRate, description } = getModulePrice("crm", "MONTHLY")
    expect(unitPrice).toBe(4)
    expect(vatRate).toBe(19)
    expect(description).toMatch(/CRM/)
  })

  it("returns annual price for an annually cycle", () => {
    const { unitPrice } = getModulePrice("crm", "ANNUALLY")
    expect(unitPrice).toBe(40)
  })

  it("defines all 8 modules", () => {
    const keys = Object.keys(MODULE_PRICES).sort()
    expect(keys).toEqual(
      [
        "bank_statements",
        "billing",
        "core",
        "crm",
        "inbound_invoices",
        "nachkalkulation",
        "payment_runs",
        "warehouse",
      ].sort(),
    )
  })

  // NK-1 (Decision 16): Nachkalkulation module pricing
  it("nachkalkulation is priced at 4€ monthly / 40€ annually", () => {
    expect(getModulePrice("nachkalkulation", "MONTHLY").unitPrice).toBe(4)
    expect(getModulePrice("nachkalkulation", "ANNUALLY").unitPrice).toBe(40)
  })

  it("each module has positive prices and a non-empty description", () => {
    for (const [, entry] of Object.entries(MODULE_PRICES)) {
      expect(entry.monthly).toBeGreaterThan(0)
      expect(entry.annual).toBeGreaterThan(0)
      expect(entry.vatRate).toBeGreaterThan(0)
      expect(entry.description.length).toBeGreaterThan(0)
    }
  })
})
