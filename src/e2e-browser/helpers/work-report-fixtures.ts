/**
 * E2E fixture helpers for the WorkReport (Arbeitsschein) spec.
 *
 * Mirrors the `service-object-fixtures.ts` pattern: direct `pg` access (the
 * Playwright runner is CJS, Prisma is ESM-only), with a shared pool that
 * callers should tear down in `afterAll`.
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
 * Remove WorkReports created by the spec. Cascade deletes assignments and
 * attachments via the DB FK definitions. Resets the `work_report` number
 * sequence so re-runs start from `AS-1`.
 */
export async function resetWorkReports(): Promise<void> {
  await pool().query(
    `DELETE FROM work_report_assignments WHERE tenant_id = $1`,
    [SEED.TENANT_ID],
  )
  await pool().query(
    `DELETE FROM work_report_attachments WHERE tenant_id = $1`,
    [SEED.TENANT_ID],
  )
  await pool().query(
    `DELETE FROM work_reports WHERE tenant_id = $1 AND code LIKE 'AS-%'`,
    [SEED.TENANT_ID],
  )
  await pool().query(
    `DELETE FROM number_sequences WHERE tenant_id = $1 AND key = 'work_report'`,
    [SEED.TENANT_ID],
  )
}

/**
 * Return or create an Order that the spec can use as the parent for new
 * WorkReports. Uses a stable code prefix so cleanup can target it
 * precisely.
 */
export async function ensureSeedOrderForWorkReport(): Promise<{
  id: string
  code: string
  name: string
}> {
  const { rows } = await pool().query<{
    id: string
    code: string
    name: string
  }>(
    `SELECT id, code, name FROM orders
      WHERE tenant_id = $1 AND code = 'E2E-WR-AUFTRAG-1'
      LIMIT 1`,
    [SEED.TENANT_ID],
  )
  if (rows[0]) return rows[0]

  const insert = await pool().query<{ id: string; code: string; name: string }>(
    `INSERT INTO orders (tenant_id, code, name, status, is_active, created_at, updated_at)
     VALUES ($1, 'E2E-WR-AUFTRAG-1', 'E2E Arbeitsschein Auftrag', 'active', true, NOW(), NOW())
     RETURNING id, code, name`,
    [SEED.TENANT_ID],
  )
  return insert.rows[0]!
}

/**
 * Insert a WorkReport directly via SQL so the spec can exercise SIGN/VOID
 * flows without driving the create form every time. Accepts optional
 * parameters so individual tests can seed distinct states.
 */
export async function createDraftWorkReport(params: {
  orderId: string
  withAssignment?: boolean
  withDescription?: boolean
}): Promise<{ id: string; code: string }> {
  const code = `AS-E2E-${Date.now().toString().slice(-6)}`
  const { rows } = await pool().query<{ id: string; code: string }>(
    `INSERT INTO work_reports (
       tenant_id, order_id, code, visit_date, status,
       work_description, created_at, updated_at
     )
     VALUES ($1, $2, $3, CURRENT_DATE, 'DRAFT', $4, NOW(), NOW())
     RETURNING id, code`,
    [
      SEED.TENANT_ID,
      params.orderId,
      code,
      params.withDescription === false ? null : "E2E Arbeitsbeschreibung",
    ],
  )
  const wr = rows[0]!
  if (params.withAssignment !== false) {
    await pool().query(
      `INSERT INTO work_report_assignments (
         tenant_id, work_report_id, employee_id, role, created_at
       )
       VALUES ($1, $2, $3, 'Monteur', NOW())`,
      [SEED.TENANT_ID, wr.id, SEED.ADMIN_EMPLOYEE_ID],
    )
  }
  return wr
}
