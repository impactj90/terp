import { describe, it, expect } from "vitest"
import { hashPassword, verifyPassword } from "../password"

describe("platform password utility", () => {
  it("hashes and verifies a round-trip password", async () => {
    const plain = "correct-horse-battery-staple"
    const hash = await hashPassword(plain)

    expect(hash).toMatch(/^\$argon2id\$v=19\$/)
    expect(await verifyPassword(hash, plain)).toBe(true)
  })

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple")
    expect(await verifyPassword(hash, "wrong-horse")).toBe(false)
  })

  it("rejects passwords shorter than 12 characters", async () => {
    await expect(hashPassword("short-pw")).rejects.toThrow(/at least 12/)
  })

  it("accepts a password exactly 12 characters long", async () => {
    const plain = "aaaaaaaaaaaa" // 12 chars
    const hash = await hashPassword(plain)
    expect(await verifyPassword(hash, plain)).toBe(true)
  })

  it("returns false for malformed hashes instead of throwing", async () => {
    expect(await verifyPassword("not-a-hash", "anything")).toBe(false)
  })
})
