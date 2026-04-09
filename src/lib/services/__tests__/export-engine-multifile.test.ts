/**
 * Unit tests for the multi-file parsing logic in export-engine-service.
 */
import { describe, it, expect } from "vitest"
import { parseMultiFileBody } from "../export-engine-service"

describe("parseMultiFileBody", () => {
  it("returns isMultiFile=false for a body with no {% file %} blocks", () => {
    const body = "Personalnummer;Name\n{{ employee.firstName }}"
    const parsed = parseMultiFileBody(body)
    expect(parsed.isMultiFile).toBe(false)
    expect(parsed.files).toHaveLength(0)
  })

  it("extracts a single {% file %} block", () => {
    const body = `{% file "stamm.txt" %}Header\n{% endfile %}`
    const parsed = parseMultiFileBody(body)
    expect(parsed.isMultiFile).toBe(true)
    expect(parsed.files).toEqual([
      { filename: "stamm.txt", body: "Header\n" },
    ])
  })

  it("extracts multiple file blocks in order", () => {
    const body = [
      `{% file "stamm.txt" %}Section A{% endfile %}`,
      `{% file "bewegung.txt" %}Section B{% endfile %}`,
    ].join("\n")
    const parsed = parseMultiFileBody(body)
    expect(parsed.isMultiFile).toBe(true)
    expect(parsed.files).toHaveLength(2)
    expect(parsed.files[0]!.filename).toBe("stamm.txt")
    expect(parsed.files[0]!.body).toBe("Section A")
    expect(parsed.files[1]!.filename).toBe("bewegung.txt")
    expect(parsed.files[1]!.body).toBe("Section B")
  })

  it("preserves Liquid syntax inside file blocks", () => {
    const body = `{% file "x.txt" %}{% for emp in employees %}{{ emp.name }}{% endfor %}{% endfile %}`
    const parsed = parseMultiFileBody(body)
    expect(parsed.files[0]!.body).toBe(
      "{% for emp in employees %}{{ emp.name }}{% endfor %}",
    )
  })

  it("sanitises filenames against path traversal", () => {
    const body = `{% file "../../etc/passwd" %}x{% endfile %}`
    const parsed = parseMultiFileBody(body)
    expect(parsed.files[0]!.filename).not.toContain("/")
    expect(parsed.files[0]!.filename).not.toContain("..")
  })

  it("handles whitespace inside the file tag", () => {
    const body = `{%  file   "spaced.txt"  %}content{%  endfile  %}`
    const parsed = parseMultiFileBody(body)
    expect(parsed.isMultiFile).toBe(true)
    expect(parsed.files[0]!.filename).toBe("spaced.txt")
  })

  it("handles file blocks separated by other content (which is dropped)", () => {
    // Content outside file blocks is intentionally ignored — once any
    // {% file %} block exists, only file blocks contribute to output.
    const body = `Header outside\n{% file "a" %}A{% endfile %}\nMiddle\n{% file "b" %}B{% endfile %}\nTail`
    const parsed = parseMultiFileBody(body)
    expect(parsed.files).toHaveLength(2)
  })

  it("is stateless across calls (regex lastIndex reset)", () => {
    const body = `{% file "x.txt" %}content{% endfile %}`
    const first = parseMultiFileBody(body)
    const second = parseMultiFileBody(body)
    expect(first).toEqual(second)
  })
})

describe("buildLineDiff (snapshot service helper)", () => {
  // Re-imported from snapshot service so we cover diff edge cases.
  // Local import keeps the test focused.
  it("emits equal lines for identical input", async () => {
    const { buildLineDiff } = await import(
      "../export-template-snapshot-service"
    )
    const diff = buildLineDiff("a\nb\nc", "a\nb\nc")
    expect(diff.every((d) => d.type === "equal")).toBe(true)
    expect(diff).toHaveLength(3)
  })

  it("flags an added line", async () => {
    const { buildLineDiff } = await import(
      "../export-template-snapshot-service"
    )
    const diff = buildLineDiff("a\nb", "a\nb\nc")
    expect(diff.find((d) => d.type === "add")?.text).toBe("c")
  })

  it("flags a removed line", async () => {
    const { buildLineDiff } = await import(
      "../export-template-snapshot-service"
    )
    const diff = buildLineDiff("a\nb\nc", "a\nc")
    expect(diff.find((d) => d.type === "remove")?.text).toBe("b")
  })
})
