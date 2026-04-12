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
import * as os from "node:os"

// Load env files BEFORE importing the Prisma client so DATABASE_URL is set.
// Preserve any externally-provided DATABASE_URL (e.g. via --env-file or inline)
// so that `pnpm tsx --env-file=.env.production scripts/bootstrap-platform-user.ts`
// targets prod instead of the local dev DB from .env.local.
const externalDbUrl = process.env.DATABASE_URL
loadDotenv({ path: resolve(process.cwd(), ".env") })
loadDotenv({ path: resolve(process.cwd(), ".env.local"), override: true })
if (externalDbUrl) {
  process.env.DATABASE_URL = externalDbUrl
}

// Static imports — these are fine because `PrismaClient` only reads env
// when we actually instantiate it below (not at module load).
import { PrismaPg } from "@prisma/adapter-pg"
import pg from "pg"
import { PrismaClient, Prisma } from "@/generated/prisma/client"
import { hashPassword } from "@/lib/platform/password"
import * as platformAudit from "@/lib/platform/audit-service"

/**
 * Identify who ran the CLI so the audit trail is not anonymous.
 *
 * Platform audit entries written from the CLI have `platform_user_id = NULL`
 * (no operator context — the script runs outside the Platform UI auth flow).
 * We compensate by stuffing the OS user + hostname into the `metadata` JSON
 * so forensic review can still answer "who and where". `SUDO_USER` takes
 * precedence because operators sometimes `sudo` into a shared service user.
 */
function cliInvoker(): {
  source: "bootstrap-cli"
  invokedBy: string
  hostname: string
} {
  const user =
    process.env.SUDO_USER ??
    process.env.USER ??
    process.env.LOGNAME ??
    (() => {
      try {
        return os.userInfo().username
      } catch {
        return "unknown"
      }
    })()
  return {
    source: "bootstrap-cli",
    invokedBy: user,
    hostname: os.hostname(),
  }
}

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
  const pool = new pg.Pool({
    connectionString,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
  })
  const adapter = new PrismaPg(pool)
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
      await platformAudit.log(prisma, {
        platformUserId: null,
        action: "platform_user.mfa_reset",
        entityType: "platform_user",
        entityId: updated.id,
        metadata: { ...cliInvoker(), targetEmail: updated.email },
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
    await platformAudit.log(prisma, {
      platformUserId: null,
      action: "platform_user.created",
      entityType: "platform_user",
      entityId: created.id,
      metadata: {
        ...cliInvoker(),
        email: created.email,
        displayName: created.displayName,
      },
    })
    console.log(`\nCreated ${created.email} (${created.id})`)
    console.log("Next: visit /platform/login and enroll MFA on first sign-in.")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
