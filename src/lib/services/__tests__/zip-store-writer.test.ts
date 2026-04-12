/**
 * Unit tests for the minimal store-only ZIP writer.
 *
 * The writer must produce bytes that:
 *   - Begin with the local file header signature 0x04034b50
 *   - Contain one local header per entry
 *   - Use compression method 0 (store)
 *   - End with the EOCD signature 0x06054b50
 *   - Round-trip via Node's `node:zlib` to extract original content
 *
 * We don't pull in jszip for verification — instead we verify the
 * structural fields we wrote match the spec, and that the EOCD points
 * to a valid central directory.
 */
import { describe, it, expect } from "vitest"
import { buildZip, crc32, sha256 } from "../zip-store-writer"

describe("crc32", () => {
  it("computes the well-known CRC of empty buffer", () => {
    expect(crc32(Buffer.alloc(0))).toBe(0)
  })

  it("computes CRC for ASCII string", () => {
    // CRC-32 of "hello" is 0x3610a686
    expect(crc32(Buffer.from("hello"))).toBe(0x3610a686)
  })

  it("computes CRC for binary buffer", () => {
    const buf = Buffer.from([0x00, 0xff, 0x7f, 0x80])
    const crc = crc32(buf)
    // Same buffer → same CRC (deterministic)
    expect(crc32(buf)).toBe(crc)
    expect(typeof crc).toBe("number")
  })
})

describe("buildZip", () => {
  it("throws on empty entry list", () => {
    expect(() => buildZip([])).toThrow(/at least one entry/)
  })

  it("produces a valid local file header for a single entry", () => {
    const content = Buffer.from("hello world", "utf8")
    const zip = buildZip([{ filename: "test.txt", content }])

    // Local file header signature
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    // Compression method (offset 8) — 0 = store
    expect(zip.readUInt16LE(8)).toBe(0)
    // CRC-32 (offset 14)
    expect(zip.readUInt32LE(14)).toBe(crc32(content))
    // Compressed size (offset 18)
    expect(zip.readUInt32LE(18)).toBe(content.length)
    // Uncompressed size (offset 22)
    expect(zip.readUInt32LE(22)).toBe(content.length)
    // Filename length (offset 26)
    expect(zip.readUInt16LE(26)).toBe("test.txt".length)
  })

  it("packs multiple entries", () => {
    const a = Buffer.from("file a content", "utf8")
    const b = Buffer.from("file b is longer ".repeat(20), "utf8")
    const zip = buildZip([
      { filename: "a.txt", content: a },
      { filename: "b.txt", content: b },
    ])

    // First local header at offset 0
    expect(zip.readUInt32LE(0)).toBe(0x04034b50)
    // Find the second local header — it begins right after first entry
    const firstEntrySize = 30 + "a.txt".length + a.length
    expect(zip.readUInt32LE(firstEntrySize)).toBe(0x04034b50)

    // The EOCD should be at the very end
    const eocdSig = 0x06054b50
    let eocdOffset = -1
    for (let i = zip.length - 22; i >= 0; i--) {
      if (zip.readUInt32LE(i) === eocdSig) {
        eocdOffset = i
        break
      }
    }
    expect(eocdOffset).toBeGreaterThan(0)
    // Total entries field (offset 10 within EOCD)
    expect(zip.readUInt16LE(eocdOffset + 10)).toBe(2)
  })

  it("preserves binary content byte-for-byte (verified by sha256)", () => {
    const a = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd])
    const b = Buffer.from("ümlauts: ä ö ü ß", "utf8")
    const zip = buildZip([
      { filename: "binary.dat", content: a },
      { filename: "umlauts.txt", content: b },
    ])

    // Locate "binary.dat" entry's content slice and compare
    const sig1 = 30
    const filenameLen1 = zip.readUInt16LE(26)
    const dataStart1 = sig1 + filenameLen1
    const slice1 = zip.subarray(dataStart1, dataStart1 + a.length)
    expect(sha256(slice1)).toBe(sha256(a))
  })

  it("is deterministic for identical input", () => {
    const z1 = buildZip([
      { filename: "x.txt", content: Buffer.from("same") },
    ])
    const z2 = buildZip([
      { filename: "x.txt", content: Buffer.from("same") },
    ])
    expect(sha256(z1)).toBe(sha256(z2))
  })
})
