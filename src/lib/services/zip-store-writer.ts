/**
 * Minimal ZIP (store-only) writer
 *
 * Produces a valid ZIP file with no compression — every entry is
 * stored verbatim. This is sufficient for export-template multi-file
 * output where files are small text exports and compression has
 * marginal value.
 *
 * Format reference: https://en.wikipedia.org/wiki/ZIP_(file_format)
 *
 * Why not jszip? Avoids pulling an external dependency for ~100 lines
 * of well-understood code.
 */
import { createHash } from "node:crypto"

// Pre-computed CRC-32 lookup table.
const CRC_TABLE: number[] = (() => {
  const table: number[] = []
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table.push(c >>> 0)
  }
  return table
})()

export function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  filename: string
  content: Buffer
}

// DOS date/time: 1980-01-01 00:00:00 — deterministic output for tests.
const DOS_DATE = 0x0021 // year 1980, month 1, day 1
const DOS_TIME = 0x0000

export function buildZip(entries: ZipEntry[]): Buffer {
  if (entries.length === 0) {
    throw new Error("buildZip requires at least one entry")
  }

  const localChunks: Buffer[] = []
  const centralChunks: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.filename, "utf8")
    const crc = crc32(entry.content)
    const size = entry.content.length

    // Local file header (30 bytes + filename)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0) // signature
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // general purpose bit flag (UTF-8 filename)
    local.writeUInt16LE(0, 8) // compression method: 0 = store
    local.writeUInt16LE(DOS_TIME, 10) // last mod time
    local.writeUInt16LE(DOS_DATE, 12) // last mod date
    local.writeUInt32LE(crc, 14) // crc-32
    local.writeUInt32LE(size, 18) // compressed size
    local.writeUInt32LE(size, 22) // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26) // filename length
    local.writeUInt16LE(0, 28) // extra field length

    localChunks.push(local, nameBuf, entry.content)
    const localEntrySize = local.length + nameBuf.length + entry.content.length

    // Central directory header (46 bytes + filename)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0) // signature
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0x0800, 8) // general purpose bit flag
    central.writeUInt16LE(0, 10) // compression method
    central.writeUInt16LE(DOS_TIME, 12) // last mod time
    central.writeUInt16LE(DOS_DATE, 14) // last mod date
    central.writeUInt32LE(crc, 16) // crc-32
    central.writeUInt32LE(size, 20) // compressed size
    central.writeUInt32LE(size, 24) // uncompressed size
    central.writeUInt16LE(nameBuf.length, 28) // filename length
    central.writeUInt16LE(0, 30) // extra field length
    central.writeUInt16LE(0, 32) // file comment length
    central.writeUInt16LE(0, 34) // disk number start
    central.writeUInt16LE(0, 36) // internal file attributes
    central.writeUInt32LE(0, 38) // external file attributes
    central.writeUInt32LE(offset, 42) // relative offset of local header

    centralChunks.push(central, nameBuf)

    offset += localEntrySize
  }

  const centralBuf = Buffer.concat(centralChunks)
  const endRecord = Buffer.alloc(22)
  endRecord.writeUInt32LE(0x06054b50, 0) // signature
  endRecord.writeUInt16LE(0, 4) // disk number
  endRecord.writeUInt16LE(0, 6) // disk number with central dir
  endRecord.writeUInt16LE(entries.length, 8) // total entries this disk
  endRecord.writeUInt16LE(entries.length, 10) // total entries
  endRecord.writeUInt32LE(centralBuf.length, 12) // size of central dir
  endRecord.writeUInt32LE(offset, 16) // offset of central dir
  endRecord.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([...localChunks, centralBuf, endRecord])
}

/** Convenience: SHA-256 hex for deterministic hash tests. */
export function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex")
}
