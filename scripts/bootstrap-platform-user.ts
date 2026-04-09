/**
 * Platform user bootstrap CLI.
 *
 * Creates the first operator row in `platform_users`, or resets MFA for an
 * existing operator if they've lost their TOTP device.
 *
 * Usage:
 *   pnpm tsx scripts/bootstrap-platform-user.ts <email> <displayName>
 *   pnpm tsx scripts/bootstrap-platform-user.ts --reset-mfa <email>
 *
 * The password is prompted twice on stdin. On the first successful login the
 * operator is forced to enroll a TOTP factor by the platform-auth flow.
 *
 * Environment: loads `.env` then `.env.local` (local overrides) so
 * DATABASE_URL is available. By default this targets the local Supabase dev
 * DB (`postgresql://postgres:postgres@localhost:54322/postgres`). To target a
 * different DB, set DATABASE_URL in the environment before invoking.
 */
import { config as loadDotenv } from "dotenv"
import { resolve } from "node:path"
import { stdin, stdout } from "node:process"

// Load env files BEFORE importing the Prisma client so DATABASE_URL is set.
loadDotenv({ path: resolve(process.cwd(), ".env") })
loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true })

// Static imports — these are fine because `PrismaClient` only reads env
// when we actually instantiate it below (not at module load).
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient, Prisma } from "@/generated/prisma/client"
import { hashPassword } from "@/lib/platform/password"

function createPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Make sure .env.local exists (or pass DATABASE_URL explicitly)."
    )
  }
  const isRemote =
    connectionString.includes("supabase.co") ||
    connectionString.includes("pooler.supabase.com")
  const adapter = new PrismaPg({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  })
  return new PrismaClient({ adapter })
}

async function promptPassword(q: string): Promise<string> {
  stdout.write(q)
  // Put stdin into raw + noecho so the password is not printed to the
  // terminal while the operator types. Falls back to line-mode echo on
  // environments that don't support raw mode (e.g. non-TTY stdin).
  const isTty = stdin.isTTY
  if (isTty) {
    stdin.setRawMode?.(true)
  }
  stdin.resume()
  stdin.setEncoding("utf8")

  return new Promise((resolve) => {
    let buf = ""
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\n" || ch === "\r" || ch === "\u0004") {
          stdin.off("data", onData)
          if (isTty) {
            stdin.setRawMode?.(false)
          }
          stdin.pause()
          stdout.write("\n")
          resolve(buf)
          return
        }
        if (ch === "\u0003") {
          // Ctrl-C
          process.exit(130)
        }
        if (ch === "\u007f" || ch === "\b") {
          buf = buf.slice(0, -1)
          continue
        }
        buf += ch
      }
    }
    stdin.on("data", onData)
  })
}

async function main() {
  const prisma = createPrisma()
  try {
    // Print the DB we're about to write to so the operator can double-check.
    const dbUrl = process.env.DATABASE_URL ?? ""
    const redacted = dbUrl.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@")
    console.log(`Targeting DATABASE_URL=${redacted}`)

    const args = process.argv.slice(2)

    if (args[0] === "--reset-mfa") {
      const email = args[1]
      if (!email) {
        throw new Error("Usage: --reset-mfa <email>")
      }
      const updated = await prisma.platformUser.update({
        where: { email },
        data: {
          mfaSecret: null,
          mfaEnrolledAt: null,
          recoveryCodes: Prisma.DbNull,
        },
      })
      console.log(`MFA reset for ${updated.email}`)
      return
    }

    const [email, displayName] = args
    if (!email || !displayName) {
      throw new Error(
        "Usage: pnpm tsx scripts/bootstrap-platform-user.ts <email> <displayName>"
      )
    }

    const existing = await prisma.platformUser.findUnique({ where: { email } })
    if (existing) {
      throw new Error(`Platform user ${email} already exists`)
    }

    const pw1 = await promptPassword("Password: ")
    const pw2 = await promptPassword("Confirm: ")
    if (pw1 !== pw2) {
      throw new Error("Passwords do not match")
    }

    const hash = await hashPassword(pw1)
    const created = await prisma.platformUser.create({
      data: { email, displayName, passwordHash: hash },
    })
    console.log(`\nCreated ${created.email} (${created.id})`)
    console.log(
      "Note: /platform/login and MFA enrollment are delivered in Phases 2–5."
    )
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
