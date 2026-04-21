/**
 * E2E fixture helpers for the serviceobjects spec.
 *
 * Uses `pg` directly (not Prisma) — the Playwright runner is CJS while
 * the Prisma client is ESM-only. Raw SQL keeps the dependency surface
 * small.
 */
import { Pool } from "pg"
import { SEED } from "./auth"

const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/postgres"

let _pool: Pool | null = null

function pool(): Pool {
  if (_pool === null) {
    _pool = new Pool({
      connectionString: CONNECTION_STRING,
      max: 2,
      idleTimeoutMillis: 5_000,
    })
  }
  return _pool
}

export async function disconnect(): Promise<void> {
  if (_pool !== null) {
    await _pool.end()
    _pool = null
  }
}

/**
 * Remove every service object (and cascaded attachments) left over from a
 * previous spec run in the seed tenant. Runs before the suite.
 */
export async function resetServiceObjects(): Promise<void> {
  await pool().query(`DELETE FROM service_objects WHERE tenant_id = $1`, [
    SEED.TENANT_ID,
  ])
}

/**
 * Return the first customer address in the seed tenant, creating one if none
 * exist. Returns { id, number, company } so the spec can reference it.
 */
export async function ensureSeedCustomer(): Promise<{
  id: string
  number: string
  company: string
}> {
  const { rows } = await pool().query<{
    id: string
    number: string
    company: string
  }>(
    `SELECT id, number, company FROM crm_addresses
      WHERE tenant_id = $1 AND type IN ('CUSTOMER','BOTH')
      ORDER BY created_at ASC
      LIMIT 1`,
    [SEED.TENANT_ID]
  )
  if (rows.length > 0) {
    return rows[0]!
  }

  const insert = await pool().query<{
    id: string
    number: string
    company: string
  }>(
    `INSERT INTO crm_addresses (tenant_id, number, type, company, is_active)
     VALUES ($1, 'K-E2E-SO', 'CUSTOMER', 'E2E Service Kunde GmbH', true)
     RETURNING id, number, company`,
    [SEED.TENANT_ID]
  )
  return insert.rows[0]!
}

/**
 * Get QR payload for a service object by its number.
 * Used in the spec to test the QR-scanner manual-input flow.
 */
export async function qrPayloadFor(number: string): Promise<string> {
  const { rows } = await pool().query<{ qr_code_payload: string | null }>(
    `SELECT qr_code_payload FROM service_objects
      WHERE tenant_id = $1 AND number = $2`,
    [SEED.TENANT_ID, number]
  )
  return rows[0]?.qr_code_payload ?? ""
}

/**
 * Check whether a service object exists (regardless of isActive).
 */
export async function exists(number: string): Promise<boolean> {
  const { rows } = await pool().query(
    `SELECT 1 FROM service_objects WHERE tenant_id = $1 AND number = $2 LIMIT 1`,
    [SEED.TENANT_ID, number]
  )
  return rows.length > 0
}
