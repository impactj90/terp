import { describe, it, expect } from "vitest"
import { createSandboxedEngine } from "../liquid-engine"

describe("createSandboxedEngine", () => {
  const engine = createSandboxedEngine()

  describe("datev_date filter", () => {
    it("formats date as TT.MM.JJJJ by default", async () => {
      const out = await engine.parseAndRender(
        '{{ "2026-04-09" | datev_date }}',
      )
      expect(out).toBe("09.04.2026")
    })

    it("formats date as TTMMJJJJ when requested", async () => {
      const out = await engine.parseAndRender(
        '{{ "2026-04-09" | datev_date: "TTMMJJJJ" }}',
      )
      expect(out).toBe("09042026")
    })

    it("formats date as JJJJMMTT when requested", async () => {
      const out = await engine.parseAndRender(
        '{{ "2026-04-09" | datev_date: "JJJJMMTT" }}',
      )
      expect(out).toBe("20260409")
    })

    it("returns empty string for null input", async () => {
      const out = await engine.parseAndRender(
        "{{ value | datev_date }}",
        { value: null },
      )
      expect(out).toBe("")
    })

    it("returns empty string for invalid date", async () => {
      const out = await engine.parseAndRender(
        '{{ "not-a-date" | datev_date }}',
      )
      expect(out).toBe("")
    })
  })

  describe("datev_decimal filter", () => {
    it("formats with comma decimal separator", async () => {
      const out = await engine.parseAndRender(
        "{{ 1234.5 | datev_decimal: 2 }}",
      )
      expect(out).toBe("1234,50")
    })

    it("uses 2 decimal places by default", async () => {
      const out = await engine.parseAndRender("{{ 42 | datev_decimal }}")
      expect(out).toBe("42,00")
    })

    it("returns 0,00 for null", async () => {
      const out = await engine.parseAndRender(
        "{{ value | datev_decimal }}",
        { value: null },
      )
      expect(out).toBe("0,00")
    })

    it("supports custom precision", async () => {
      const out = await engine.parseAndRender(
        "{{ 3.14159 | datev_decimal: 4 }}",
      )
      expect(out).toBe("3,1416")
    })
  })

  describe("datev_string filter", () => {
    it("returns plain string unchanged", async () => {
      const out = await engine.parseAndRender(
        '{{ "Müller" | datev_string }}',
      )
      expect(out).toBe("Müller")
    })

    it("escapes strings containing semicolons", async () => {
      const out = await engine.parseAndRender(
        '{{ "Herr; Müller" | datev_string }}',
      )
      expect(out).toBe('"Herr; Müller"')
    })

    it("escapes embedded quotes", async () => {
      const out = await engine.parseAndRender(
        '{{ name | datev_string }}',
        { name: 'A"B' },
      )
      expect(out).toBe('"A""B"')
    })

    it("returns empty string for null", async () => {
      const out = await engine.parseAndRender(
        "{{ value | datev_string }}",
        { value: null },
      )
      expect(out).toBe("")
    })
  })

  describe("pad_left / pad_right filters", () => {
    it("pad_left fills with zeros", async () => {
      const out = await engine.parseAndRender(
        '{{ 42 | pad_left: 5, "0" }}',
      )
      expect(out).toBe("00042")
    })

    it("pad_right fills with spaces", async () => {
      const out = await engine.parseAndRender(
        '{{ "abc" | pad_right: 6 }}',
      )
      expect(out).toBe("abc   ")
    })
  })

  describe("mask_iban filter", () => {
    it("masks middle of IBAN", async () => {
      const out = await engine.parseAndRender(
        '{{ "DE89370400440532013000" | mask_iban }}',
      )
      expect(out).toBe("DE89****3000")
    })

    it("returns short input unchanged", async () => {
      const out = await engine.parseAndRender(
        '{{ "DE12" | mask_iban }}',
      )
      expect(out).toBe("DE12")
    })
  })

  describe("terp_value filter", () => {
    it("resolves account: prefix against employee.accountValues", async () => {
      const out = await engine.parseAndRender(
        "{{ source | terp_value: employee }}",
        {
          source: "account:NIGHT",
          employee: { accountValues: { NIGHT: 8 }, monthlyValues: {} },
        },
      )
      expect(out).toBe("8")
    })

    it("resolves plain source against employee.monthlyValues", async () => {
      const out = await engine.parseAndRender(
        "{{ source | terp_value: employee }}",
        {
          source: "workedHours",
          employee: { accountValues: {}, monthlyValues: { workedHours: 160 } },
        },
      )
      expect(out).toBe("160")
    })

    it("returns 0 for unknown account code", async () => {
      const out = await engine.parseAndRender(
        "{{ source | terp_value: employee }}",
        {
          source: "account:UNKNOWN",
          employee: { accountValues: { NIGHT: 8 }, monthlyValues: {} },
        },
      )
      expect(out).toBe("0")
    })

    it("returns 0 for unknown monthly source", async () => {
      const out = await engine.parseAndRender(
        "{{ source | terp_value: employee }}",
        {
          source: "unknownField",
          employee: { accountValues: {}, monthlyValues: { workedHours: 160 } },
        },
      )
      expect(out).toBe("0")
    })

    it("returns 0 when terpSource is null", async () => {
      const out = await engine.parseAndRender(
        "{{ source | terp_value: employee }}",
        {
          source: null,
          employee: { accountValues: { NIGHT: 8 }, monthlyValues: {} },
        },
      )
      expect(out).toBe("0")
    })

    it("returns 0 when employee is null", async () => {
      const out = await engine.parseAndRender(
        "{{ source | terp_value: employee }}",
        { source: "account:NIGHT", employee: null },
      )
      expect(out).toBe("0")
    })

    it("chains cleanly with datev_decimal", async () => {
      const out = await engine.parseAndRender(
        "{{ source | terp_value: employee | datev_decimal: 2 }}",
        {
          source: "account:NIGHT",
          employee: { accountValues: { NIGHT: 8.5 }, monthlyValues: {} },
        },
      )
      expect(out).toBe("8,50")
    })
  })

  describe("sandboxing", () => {
    it("blocks include tags (no filesystem access)", async () => {
      await expect(
        engine.parseAndRender('{% include "/etc/passwd" %}'),
      ).rejects.toThrow()
    })

    it("blocks render tags (no filesystem access)", async () => {
      await expect(
        engine.parseAndRender('{% render "/etc/passwd" %}'),
      ).rejects.toThrow()
    })

    it("does not expose prototype chain (constructor)", async () => {
      const out = await engine.parseAndRender(
        "{{ obj.constructor }}",
        { obj: {} },
      )
      // ownPropertyOnly should yield empty string for inherited properties.
      expect(out.trim()).toBe("")
    })

    it("does not expose __proto__", async () => {
      const out = await engine.parseAndRender(
        "{{ obj.__proto__ }}",
        { obj: {} },
      )
      expect(out.trim()).toBe("")
    })
  })
})
