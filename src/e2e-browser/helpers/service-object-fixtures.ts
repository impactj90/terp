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
 * Test-data prefixes that `resetServiceObjects` targets. Anything with a
 * different `number` is left alone — that's how we protect manually
 * created data in the seed tenant from being wiped by test cleanup.
 *
 * Add to this list only if a new spec creates SOs with a new prefix.
 */
export const E2E_SO_NUMBER_PREFIXES = ["SO-E2E-%", "SO-HIST-%"] as const

/**
 * Remove service objects created by E2E specs in the seed tenant —
 * identified by their `number` prefix. Manually created SOs (any other
 * prefix) are left untouched.
 *
 * Pass additional prefixes if a spec uses a non-standard naming scheme.
 */
export async function resetServiceObjects(
  extraPrefixes: readonly string[] = []
): Promise<void> {
  const patterns = [...E2E_SO_NUMBER_PREFIXES, ...extraPrefixes]
  await pool().query(
    `DELETE FROM service_objects
       WHERE tenant_id = $1
         AND number LIKE ANY($2::text[])`,
    [SEED.TENANT_ID, patterns]
  )
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

/**
 * Read the service_objects.id for a given number.
 */
export async function serviceObjectIdByNumber(
  number: string
): Promise<string> {
  const { rows } = await pool().query<{ id: string }>(
    `SELECT id FROM service_objects WHERE tenant_id = $1 AND number = $2`,
    [SEED.TENANT_ID, number]
  )
  return rows[0]?.id ?? ""
}

/**
 * Reset orders/bookings/assignments/withdrawals connected to a given service
 * object (by id). Used in the history spec to guarantee idempotency.
 */
export async function resetHistoryForServiceObject(
  serviceObjectId: string
): Promise<void> {
  // wh_stock_movements scoped to the SO → delete first (cascade would
  // need article state rollbacks we don't care about here).
  await pool().query(
    `DELETE FROM wh_stock_movements WHERE tenant_id = $1 AND service_object_id = $2`,
    [SEED.TENANT_ID, serviceObjectId]
  )
  // Bookings + assignments are cascaded by orders.
  await pool().query(
    `DELETE FROM orders WHERE tenant_id = $1 AND service_object_id = $2`,
    [SEED.TENANT_ID, serviceObjectId]
  )
}

/**
 * Create an Order pinned to a service object with an explicit created_at
 * (useful for asserting "last service" ordering).
 */
export async function createOrderForServiceObject(params: {
  code: string
  name: string
  serviceObjectId: string
  createdAtIso: string
}): Promise<string> {
  const { rows } = await pool().query<{ id: string }>(
    `INSERT INTO orders (tenant_id, code, name, status, service_object_id, created_at)
     VALUES ($1, $2, $3, 'active', $4, $5)
     RETURNING id`,
    [
      SEED.TENANT_ID,
      params.code,
      params.name,
      params.serviceObjectId,
      params.createdAtIso,
    ]
  )
  return rows[0]!.id
}

/**
 * Create an OrderAssignment linking an order to an employee.
 */
export async function createOrderAssignment(params: {
  orderId: string
  employeeId: string
  role?: string
}): Promise<void> {
  await pool().query(
    `INSERT INTO order_assignments (tenant_id, order_id, employee_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING`,
    [
      SEED.TENANT_ID,
      params.orderId,
      params.employeeId,
      params.role ?? 'worker',
    ]
  )
}

/**
 * Book time on an order for an employee.
 */
export async function createOrderBooking(params: {
  orderId: string
  employeeId: string
  minutes: number
  bookingDateIso: string
}): Promise<void> {
  await pool().query(
    `INSERT INTO order_bookings (tenant_id, employee_id, order_id, booking_date, time_minutes)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      SEED.TENANT_ID,
      params.employeeId,
      params.orderId,
      params.bookingDateIso,
      params.minutes,
    ]
  )
}

/**
 * Ensure a stock-tracked article exists and return its id.
 */
export async function ensureSeedArticle(params: {
  number: string
  name: string
  currentStock?: number
}): Promise<string> {
  const existing = await pool().query<{ id: string }>(
    `SELECT id FROM wh_articles WHERE tenant_id = $1 AND number = $2`,
    [SEED.TENANT_ID, params.number]
  )
  if (existing.rows[0]) return existing.rows[0].id
  const { rows } = await pool().query<{ id: string }>(
    `INSERT INTO wh_articles (tenant_id, number, name, unit, stock_tracking, current_stock)
     VALUES ($1, $2, $3, 'Stk', true, $4)
     RETURNING id`,
    [SEED.TENANT_ID, params.number, params.name, params.currentStock ?? 100]
  )
  return rows[0]!.id
}

/**
 * Create a withdrawal-type stock movement pinned to a service object.
 */
export async function createWithdrawalForServiceObject(params: {
  serviceObjectId: string
  articleId: string
  quantity: number
  createdById?: string
  dateIso?: string
  type?: "WITHDRAWAL" | "DELIVERY_NOTE"
}): Promise<string> {
  const qty = -Math.abs(params.quantity)
  const { rows } = await pool().query<{ id: string }>(
    `INSERT INTO wh_stock_movements (
       tenant_id, article_id, type, quantity, previous_stock, new_stock,
       service_object_id, created_by_id, date
     )
     VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7)
     RETURNING id`,
    [
      SEED.TENANT_ID,
      params.articleId,
      params.type ?? "WITHDRAWAL",
      qty,
      params.serviceObjectId,
      params.createdById ?? null,
      params.dateIso ?? new Date().toISOString(),
    ]
  )
  return rows[0]!.id
}

/**
 * Resolve the auth user UUID for the seeded admin. The public.users.id
 * differs from the employee id in SEED; E2E specs that need a real
 * createdBy → user_id mapping can call this helper.
 */
export async function adminUserId(): Promise<string> {
  const { rows } = await pool().query<{ id: string }>(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [SEED.ADMIN_EMAIL]
  )
  return rows[0]?.id ?? ""
}
