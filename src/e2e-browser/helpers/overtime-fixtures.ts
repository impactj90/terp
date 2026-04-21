/**
 * E2E fixture helpers for overtime-requests spec.
 *
 * Uses `pg` directly (not Prisma) because the Playwright test runner uses
 * CommonJS while Prisma's generated client is ESM-only. Raw SQL keeps
 * the dependency surface small and predictable.
 */
import { Pool } from "pg"
import { SEED } from "./auth"

// Seed booking type IDs are resolved at runtime by `code` so we stay robust
// against seed-regenerated UUIDs.
let _comeBookingTypeId: string | null = null
let _goBookingTypeId: string | null = null

async function loadBookingTypeIds(): Promise<{
  come: string
  go: string
}> {
  if (_comeBookingTypeId === null || _goBookingTypeId === null) {
    const pool = getPool()
    const { rows } = await pool.query<{ id: string; code: string }>(
      `SELECT id, code FROM booking_types
        WHERE code IN ('COME','GO') AND tenant_id IS NULL`,
    )
    for (const row of rows) {
      if (row.code === "COME") _comeBookingTypeId = row.id
      if (row.code === "GO") _goBookingTypeId = row.id
    }
    if (_comeBookingTypeId === null || _goBookingTypeId === null) {
      throw new Error(
        "seedUnapprovedOvertime: COME/GO booking_type rows not found in seed",
      )
    }
  }
  return { come: _comeBookingTypeId, go: _goBookingTypeId }
}

const CONNECTION_STRING =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:54322/postgres"

let _pool: Pool | null = null

function getPool(): Pool {
  if (_pool === null) {
    _pool = new Pool({
      connectionString: CONNECTION_STRING,
      max: 2,
      idleTimeoutMillis: 5_000,
    })
  }
  return _pool
}

export async function disconnectPrisma(): Promise<void> {
  // Kept as name for symmetry with earlier API — closes the pg pool.
  if (_pool !== null) {
    await _pool.end()
    _pool = null
  }
}

/**
 * Returns a simple query interface so tests can poke the DB when needed.
 * Usage: `const { rows } = await db().query("SELECT …")`
 */
export function db() {
  return getPool()
}

export function todayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function yesterdayUTC(): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - 1)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

export function nextSundayUTC(): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  const daysUntilSunday = (7 - d.getUTCDay()) % 7 || 7
  d.setUTCDate(d.getUTCDate() + daysUntilSunday)
  return d
}

function toSqlDate(d: Date): string {
  return d.toISOString().split("T")[0]!
}

export async function resetEmployeeDay(
  employeeId: string,
  date: Date,
): Promise<void> {
  const pool = getPool()
  const d = toSqlDate(date)

  await pool.query(
    `DELETE FROM bookings WHERE tenant_id = $1 AND employee_id = $2 AND booking_date = $3`,
    [SEED.TENANT_ID, employeeId, d],
  )
  await pool.query(
    `DELETE FROM daily_values WHERE tenant_id = $1 AND employee_id = $2 AND value_date = $3`,
    [SEED.TENANT_ID, employeeId, d],
  )
  await pool.query(
    `DELETE FROM overtime_requests WHERE tenant_id = $1 AND employee_id = $2 AND request_date = $3`,
    [SEED.TENANT_ID, employeeId, d],
  )
}

export async function resetAllOvertimeRequests(): Promise<void> {
  const pool = getPool()
  await pool.query(
    `DELETE FROM overtime_requests WHERE tenant_id = $1`,
    [SEED.TENANT_ID],
  )
}

export async function resetOvertimeConfig(): Promise<void> {
  const pool = getPool()
  await pool.query(
    `INSERT INTO overtime_request_config
      (id, tenant_id, approval_required, lead_time_hours,
       monthly_warn_threshold_minutes, escalation_threshold_minutes,
       reopen_required, created_at, updated_at)
     VALUES
      (gen_random_uuid(), $1, true, 0, NULL, NULL, true, NOW(), NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       approval_required = true,
       lead_time_hours = 0,
       monthly_warn_threshold_minutes = NULL,
       escalation_threshold_minutes = NULL,
       reopen_required = true,
       updated_at = NOW()`,
    [SEED.TENANT_ID],
  )
}

export async function setEscalationThreshold(minutes: number | null): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE overtime_request_config
       SET escalation_threshold_minutes = $2, updated_at = NOW()
     WHERE tenant_id = $1`,
    [SEED.TENANT_ID, minutes],
  )
}

export async function setApprovalRequired(required: boolean): Promise<void> {
  const pool = getPool()
  await pool.query(
    `UPDATE overtime_request_config
       SET approval_required = $2, updated_at = NOW()
     WHERE tenant_id = $1`,
    [SEED.TENANT_ID, required],
  )
}

/**
 * Seeds an UNAPPROVED_OVERTIME state by inserting two bookings on the given
 * date and a pre-computed DailyValue. We bypass the full DailyCalc pipeline
 * because it's ESM-bound (same reason we dropped Prisma) — the assertion
 * shape expected by correction-assistant is what matters.
 */
export async function seedUnapprovedOvertime(
  employeeId: string,
  date: Date,
): Promise<void> {
  const pool = getPool()
  const d = toSqlDate(date)

  await resetEmployeeDay(employeeId, date)

  const { come, go } = await loadBookingTypeIds()

  await pool.query(
    `INSERT INTO bookings (id, tenant_id, employee_id, booking_date, booking_type_id,
       original_time, edited_time, source, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, $4, $5, $5, 'web', NOW(), NOW()),
       (gen_random_uuid(), $1, $2, $3, $6, $7, $7, 'web', NOW(), NOW())`,
    [
      SEED.TENANT_ID,
      employeeId,
      d,
      come,
      8 * 60, // 08:00
      go,
      19 * 60 + 30, // 19:30
    ],
  )

  // Synthesize a DailyValue with overtime > 0 and UNAPPROVED_OVERTIME error.
  // Real values (11.5h presence, 480 min target → ~210 min overtime after
  // break) aren't required for the UI assertion — we just need overtime > 0
  // and the errorCodes array to contain the code.
  await pool.query(
    `INSERT INTO daily_values (id, tenant_id, employee_id, value_date, status,
       gross_time, net_time, target_time, overtime, undertime, break_time,
       has_error, error_codes, warnings, first_come, last_go, booking_count,
       calculated_at, calculation_version, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, $3, 'error',
        690, 660, 480, 180, 0, 30,
        true, ARRAY['UNAPPROVED_OVERTIME']::text[], ARRAY[]::text[], $4, $5, 2,
        NOW(), 1, NOW(), NOW())`,
    [
      SEED.TENANT_ID,
      employeeId,
      d,
      8 * 60,
      19 * 60 + 30,
    ],
  )
}

/**
 * Pre-seed a pending REOPEN request for the tenant (used by the destructive
 * flip test in the admin config page).
 */
export async function seedPendingReopen(
  employeeId: string,
  date: Date,
): Promise<{ id: string }> {
  const pool = getPool()
  const d = toSqlDate(date)
  const result = await pool.query<{ id: string }>(
    `INSERT INTO overtime_requests
       (id, tenant_id, employee_id, request_type, request_date, planned_minutes,
        reason, status, arbzg_warnings, created_at, updated_at)
     VALUES
       (gen_random_uuid(), $1, $2, 'REOPEN', $3, 30,
        'Pre-seeded pending reopen', 'pending', ARRAY[]::text[], NOW(), NOW())
     RETURNING id`,
    [SEED.TENANT_ID, employeeId, d],
  )
  return { id: result.rows[0]!.id }
}

export async function countPendingReopens(): Promise<number> {
  const pool = getPool()
  const { rows } = await pool.query<{ c: string }>(
    `SELECT COUNT(*) AS c FROM overtime_requests
       WHERE tenant_id = $1 AND request_type = 'REOPEN' AND status = 'pending'`,
    [SEED.TENANT_ID],
  )
  return Number(rows[0]!.c)
}

export async function findLatestOvertimeRequest(
  filter: { reason?: string; employeeId?: string; status?: string } = {},
): Promise<{
  id: string
  request_type: string
  status: string
  reason: string
  arbzg_warnings: string[]
  arbzg_override_reason: string | null
} | null> {
  const pool = getPool()
  const conditions: string[] = ["tenant_id = $1"]
  const params: unknown[] = [SEED.TENANT_ID]
  let i = 2
  if (filter.reason) {
    conditions.push(`reason = $${i++}`)
    params.push(filter.reason)
  }
  if (filter.employeeId) {
    conditions.push(`employee_id = $${i++}`)
    params.push(filter.employeeId)
  }
  if (filter.status) {
    conditions.push(`status = $${i++}`)
    params.push(filter.status)
  }
  const { rows } = await pool.query(
    `SELECT id, request_type, status, reason, arbzg_warnings, arbzg_override_reason
       FROM overtime_requests
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC LIMIT 1`,
    params,
  )
  return rows[0] ?? null
}
