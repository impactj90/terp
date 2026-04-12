/**
 * Application-level field encryption using AES-256-GCM.
 *
 * Encrypts sensitive employee data (tax ID, IBAN, social security number) before
 * writing to the database. Supports key rotation via versioned keys.
 *
 * Storage format: `v{version}:{iv_base64}:{authTag_base64}:{ciphertext_base64}`
 *
 * Key management:
 *   - FIELD_ENCRYPTION_KEY_V{n} — base64-encoded 32-byte keys (env vars)
 *   - FIELD_ENCRYPTION_KEY_CURRENT_VERSION — which version to use for new writes
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12 // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16

interface EncryptionKey {
  version: number
  key: Buffer
}

function getKeys(): EncryptionKey[] {
  const keys: EncryptionKey[] = []
  for (let v = 1; v <= 10; v++) {
    const envKey = process.env[`FIELD_ENCRYPTION_KEY_V${v}`]
    if (envKey) {
      keys.push({ version: v, key: Buffer.from(envKey, "base64") })
    }
  }
  if (keys.length === 0) {
    throw new Error("No encryption keys configured. Set FIELD_ENCRYPTION_KEY_V1.")
  }
  return keys
}

function getCurrentKey(): EncryptionKey {
  const currentVersion = parseInt(process.env.FIELD_ENCRYPTION_KEY_CURRENT_VERSION ?? "1")
  const keys = getKeys()
  const key = keys.find((k) => k.version === currentVersion)
  if (!key) throw new Error(`Current encryption key version ${currentVersion} not found`)
  return key
}

export function encryptField(plaintext: string): string {
  const { version, key } = getCurrentKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH })
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `v${version}:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`
}

export function decryptField(ciphertext: string): string {
  const parts = ciphertext.split(":")
  const versionStr = parts[0]!
  const ivB64 = parts[1]!
  const authTagB64 = parts[2]!
  const encryptedB64 = parts[3]!
  const version = parseInt(versionStr.slice(1))
  const allKeys = getKeys()
  const keyEntry = allKeys.find((k) => k.version === version)
  if (!keyEntry) throw new Error(`Encryption key version ${version} not found`)
  const iv = Buffer.from(ivB64, "base64")
  const authTag = Buffer.from(authTagB64, "base64")
  const encrypted = Buffer.from(encryptedB64, "base64")
  const decipher = createDecipheriv(ALGORITHM, keyEntry.key, iv, { authTagLength: AUTH_TAG_LENGTH })
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted) + decipher.final("utf8")
}

export function isEncrypted(value: string): boolean {
  return /^v\d+:/.test(value)
}

export function hashField(plaintext: string): string {
  const { key } = getCurrentKey()
  return createHmac("sha256", key).update(plaintext).digest("base64")
}
