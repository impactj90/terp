import { describe, expect, test } from "vitest"

import {
  DEFAULT_TENANT_TEMPLATE,
  getTenantTemplate,
  listTenantTemplates,
} from "../registry"

describe("demo template registry", () => {
  test("DEFAULT_TENANT_TEMPLATE is registered", () => {
    expect(getTenantTemplate(DEFAULT_TENANT_TEMPLATE)).toBeDefined()
    expect(getTenantTemplate(DEFAULT_TENANT_TEMPLATE).key).toBe(
      DEFAULT_TENANT_TEMPLATE,
    )
  })

  test("listTenantTemplates returns at least one entry", () => {
    const list = listTenantTemplates()
    expect(list.length).toBeGreaterThan(0)
    for (const entry of list) {
      expect(entry.key).toBeTruthy()
      expect(entry.label).toBeTruthy()
      expect(entry.description).toBeTruthy()
    }
  })

  test("unknown key throws", () => {
    expect(() => getTenantTemplate("nonexistent")).toThrow(
      /Unknown tenant template/,
    )
  })

  test("industriedienstleister_starter is registered as starter variant", () => {
    const tpl = getTenantTemplate("industriedienstleister_starter")
    expect(tpl.kind).toBe("starter")
    expect(tpl.industry).toBe("industriedienstleister")
    expect(typeof tpl.applyConfig).toBe("function")
    expect(tpl.applySeedData).toBeUndefined()
  })
})
