import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { encryptField, decryptField, isEncrypted, hashField } from "../field-encryption"

// Use a fixed test key (32 bytes, base64)
const TEST_KEY_V1 = Buffer.from("a]test-key-32-bytes-for-aes256!!", "utf8").toString("base64")
const TEST_KEY_V2 = Buffer.from("b]test-key-32-bytes-for-aes256!!", "utf8").toString("base64")

describe("field-encryption", () => {
  const originalEnv = { ...process.env }

  beforeAll(() => {
    process.env.FIELD_ENCRYPTION_KEY_V1 = TEST_KEY_V1
    process.env.FIELD_ENCRYPTION_KEY_CURRENT_VERSION = "1"
  })

  afterAll(() => {
    process.env = originalEnv
  })

  describe("encrypt → decrypt round-trip", () => {
    it("round-trips a simple string", () => {
      const plaintext = "DE89370400440532013000"
      const encrypted = encryptField(plaintext)
      expect(encrypted).not.toBe(plaintext)
      expect(decryptField(encrypted)).toBe(plaintext)
    })

    it("round-trips an empty string", () => {
      const encrypted = encryptField("")
      expect(decryptField(encrypted)).toBe("")
    })

    it("round-trips unicode characters (Umlaute)", () => {
      const plaintext = "Müller-Lüdenscheidt ÄÖÜäöüß"
      const encrypted = encryptField(plaintext)
      expect(decryptField(encrypted)).toBe(plaintext)
    })

    it("produces different ciphertext for same plaintext (random IV)", () => {
      const a = encryptField("same")
      const b = encryptField("same")
      expect(a).not.toBe(b)
      expect(decryptField(a)).toBe("same")
      expect(decryptField(b)).toBe("same")
    })
  })

  describe("key versioning", () => {
    it("V1-encrypted data can be decrypted when V2 is current", () => {
      const encrypted = encryptField("secret")
      expect(encrypted.startsWith("v1:")).toBe(true)

      // Switch to V2
      process.env.FIELD_ENCRYPTION_KEY_V2 = TEST_KEY_V2
      process.env.FIELD_ENCRYPTION_KEY_CURRENT_VERSION = "2"

      // Old V1 data is still decryptable
      expect(decryptField(encrypted)).toBe("secret")

      // New encryptions use V2
      const encryptedV2 = encryptField("new-secret")
      expect(encryptedV2.startsWith("v2:")).toBe(true)
      expect(decryptField(encryptedV2)).toBe("new-secret")

      // Reset
      delete process.env.FIELD_ENCRYPTION_KEY_V2
      process.env.FIELD_ENCRYPTION_KEY_CURRENT_VERSION = "1"
    })

    it("throws when version key is not found", () => {
      expect(() => decryptField("v99:abc:def:ghi")).toThrow("Encryption key version 99 not found")
    })
  })

  describe("isEncrypted", () => {
    it("detects encrypted values", () => {
      const encrypted = encryptField("test")
      expect(isEncrypted(encrypted)).toBe(true)
    })

    it("rejects plain values", () => {
      expect(isEncrypted("DE89370400440532013000")).toBe(false)
      expect(isEncrypted("hello world")).toBe(false)
      expect(isEncrypted("")).toBe(false)
    })
  })

  describe("tamper detection", () => {
    it("fails on manipulated ciphertext", () => {
      const encrypted = encryptField("sensitive")
      const parts = encrypted.split(":")
      // Flip a character in the ciphertext
      const tampered = parts[3]!.replace(parts[3]![0]!, parts[3]![0] === "A" ? "B" : "A")
      const manipulated = `${parts[0]}:${parts[1]}:${parts[2]}:${tampered}`
      expect(() => decryptField(manipulated)).toThrow()
    })

    it("fails on manipulated auth tag", () => {
      const encrypted = encryptField("sensitive")
      const parts = encrypted.split(":")
      const tampered = parts[2]!.replace(parts[2]![0]!, parts[2]![0] === "A" ? "B" : "A")
      const manipulated = `${parts[0]}:${parts[1]}:${tampered}:${parts[3]}`
      expect(() => decryptField(manipulated)).toThrow()
    })
  })

  describe("hashField", () => {
    it("produces consistent hash for same input", () => {
      const a = hashField("test")
      const b = hashField("test")
      expect(a).toBe(b)
    })

    it("produces different hash for different input", () => {
      expect(hashField("a")).not.toBe(hashField("b"))
    })
  })

  describe("missing keys", () => {
    it("throws when no keys are configured", () => {
      const saved = process.env.FIELD_ENCRYPTION_KEY_V1
      delete process.env.FIELD_ENCRYPTION_KEY_V1
      expect(() => encryptField("test")).toThrow("No encryption keys configured")
      process.env.FIELD_ENCRYPTION_KEY_V1 = saved
    })
  })
})
