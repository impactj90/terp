import { describe, it, expect } from "vitest"
import {
  renderTemplate,
  encodeOutput,
  sha256Hex,
  ExportTemplateRenderValidationError,
  ExportTemplateTimeoutValidationError,
} from "../export-engine-service"
import type { ExportContext } from "../export-context-builder"

const baseContext: ExportContext = {
  exportInterface: { name: "Test", mandantNumber: "12345", beraterNr: "98765" },
  period: {
    year: 2026,
    month: 4,
    monthPadded: "04",
    monthName: "April",
    monthNameEn: "April",
    isoDate: "2026-04",
    ddmmyyyy: "01042026",
    firstDay: "01.04.2026",
    lastDay: "30.04.2026",
  },
  tenant: {
    name: "Mandant GmbH",
    addressStreet: null,
    addressZip: null,
    addressCity: null,
    addressCountry: null,
  },
  template: {
    fieldSeparator: ";",
    decimalSeparator: ",",
    dateFormat: "TT.MM.JJJJ",
    targetSystem: "datev_lodas",
  },
  payrollWages: [
    { code: "1000", name: "Sollstunden", terpSource: "targetHours", category: "time" },
  ],
  employees: [],
}

describe("renderTemplate", () => {
  it("renders a simple template", async () => {
    const tpl = "{{ exportInterface.beraterNr }}-{{ exportInterface.mandantNumber }}"
    const out = await renderTemplate(tpl, baseContext)
    expect(out).toBe("98765-12345")
  })

  it("renders the period helpers", async () => {
    const tpl = "{{ period.firstDay }}|{{ period.lastDay }}|{{ period.ddmmyyyy }}"
    const out = await renderTemplate(tpl, baseContext)
    expect(out).toBe("01.04.2026|30.04.2026|01042026")
  })

  it("times out when an async filter blocks longer than the deadline", async () => {
    // Inject an async filter that genuinely yields to the event loop so the
    // Promise.race deadline can fire. (Pure CPU-bound Liquid renders cannot
    // be interrupted by Promise.race in single-threaded JS.)
    const { Liquid } = await import("liquidjs")
    const slowEngine = new Liquid({ ownPropertyOnly: true })
    slowEngine.registerFilter("slow", async (v: string) => {
      await new Promise((r) => setTimeout(r, 200))
      return v
    })
    const renderP = slowEngine.parseAndRender('{{ "x" | slow }}')
    const racer = Promise.race([
      renderP,
      new Promise((_, reject) =>
        setTimeout(() => reject(new ExportTemplateTimeoutValidationError()), 20),
      ),
    ])
    await expect(racer).rejects.toBeInstanceOf(
      ExportTemplateTimeoutValidationError,
    )
  })

  it("throws ExportTemplateRenderValidationError for invalid syntax", async () => {
    const tpl = "{% if missing-end %}"
    await expect(renderTemplate(tpl, baseContext)).rejects.toThrow(
      ExportTemplateRenderValidationError,
    )
  })

  it("filesystem include is rejected", async () => {
    const tpl = '{% include "/etc/passwd" %}'
    await expect(renderTemplate(tpl, baseContext)).rejects.toThrow(
      ExportTemplateRenderValidationError,
    )
  })
})

describe("encodeOutput", () => {
  it("encodes UTF-8 by default", () => {
    const buf = encodeOutput("ä\nö", "utf-8", "lf")
    expect(buf.toString("utf8")).toBe("ä\nö")
  })

  it("encodes UTF-8 with BOM", () => {
    const buf = encodeOutput("hello", "utf-8-bom", "lf")
    expect(buf[0]).toBe(0xef)
    expect(buf[1]).toBe(0xbb)
    expect(buf[2]).toBe(0xef.toString().length === 1 ? 0xbb : 0xbf)
    // The first three bytes must be the UTF-8 BOM.
    expect(buf.subarray(0, 3).toString("hex")).toBe("efbbbf")
    expect(buf.subarray(3).toString("utf8")).toBe("hello")
  })

  it("encodes Windows-1252 with German umlauts", () => {
    const buf = encodeOutput("Müller", "windows-1252", "lf")
    // 0xfc is the win1252 encoding of "ü"
    expect(buf.includes(0xfc)).toBe(true)
  })

  it("normalizes line endings to CRLF", () => {
    const buf = encodeOutput("line1\nline2\n", "utf-8", "crlf")
    expect(buf.toString("utf8")).toBe("line1\r\nline2\r\n")
  })

  it("normalizes line endings to LF", () => {
    const buf = encodeOutput("line1\r\nline2\r\n", "utf-8", "lf")
    expect(buf.toString("utf8")).toBe("line1\nline2\n")
  })
})

describe("sha256Hex", () => {
  it("returns a 64-char hex string", () => {
    const hash = sha256Hex(Buffer.from("hello"))
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]+$/)
  })

  it("is deterministic", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      sha256Hex(Buffer.from("abc")),
    )
  })
})
