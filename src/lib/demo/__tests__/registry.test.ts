import { describe, expect, test } from "vitest"

import {
  DEFAULT_DEMO_TEMPLATE,
  getDemoTemplate,
  listDemoTemplates,
} from "../registry"

describe("demo template registry", () => {
  test("DEFAULT_DEMO_TEMPLATE is registered", () => {
    expect(getDemoTemplate(DEFAULT_DEMO_TEMPLATE)).toBeDefined()
    expect(getDemoTemplate(DEFAULT_DEMO_TEMPLATE).key).toBe(DEFAULT_DEMO_TEMPLATE)
  })

  test("listDemoTemplates returns at least one entry", () => {
    const list = listDemoTemplates()
    expect(list.length).toBeGreaterThan(0)
    for (const entry of list) {
      expect(entry.key).toBeTruthy()
      expect(entry.label).toBeTruthy()
      expect(entry.description).toBeTruthy()
    }
  })

  test("unknown key throws", () => {
    expect(() => getDemoTemplate("nonexistent")).toThrow(/Unknown demo template/)
  })
})
