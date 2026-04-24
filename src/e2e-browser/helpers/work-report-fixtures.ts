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
 * Count attachments for a WorkReport via SQL (fast, no UI render).
 */
export async function countAttachments(workReportId: string): Promise<number> {
  const { rows } = await pool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM work_report_attachments
      WHERE tenant_id = $1 AND work_report_id = $2`,
    [SEED.TENANT_ID, workReportId],
  )
  return parseInt(rows[0]?.count ?? "0", 10)
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
  serviceObjectId?: string
}): Promise<{ id: string; code: string }> {
  const code = `AS-E2E-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`
  const { rows } = await pool().query<{ id: string; code: string }>(
    `INSERT INTO work_reports (
       tenant_id, order_id, service_object_id, code, visit_date, status,
       work_description, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, CURRENT_DATE, 'DRAFT', $5, NOW(), NOW())
     RETURNING id, code`,
    [
      SEED.TENANT_ID,
      params.orderId,
      params.serviceObjectId ?? null,
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

/**
 * Seed a WorkReport directly in SIGNED state. Driving the full sign flow
 * via UI for every VOID/audit test would be slow; the service-level sign
 * logic is already covered by unit + integration tests.
 */
export async function createSignedWorkReport(params: {
  orderId: string
  signerName?: string
  signerRole?: string
  serviceObjectId?: string
}): Promise<{ id: string; code: string }> {
  const draft = await createDraftWorkReport({
    orderId: params.orderId,
    withAssignment: true,
    withDescription: true,
    serviceObjectId: params.serviceObjectId,
  })
  await pool().query(
    `UPDATE work_reports
        SET status = 'SIGNED',
            signed_at = NOW(),
            signer_name = $2,
            signer_role = $3,
            signer_ip_hash = 'e2e-test-hash',
            signature_path = 'e2e/test/signature.png',
            updated_at = NOW()
      WHERE id = $1`,
    [
      draft.id,
      params.signerName ?? "E2E Signer",
      params.signerRole ?? "Tester",
    ],
  )
  return draft
}

/**
 * Return or create a second seed order so cross-surface / filter tests can
 * prove they pick the right order's WorkReports.
 */
export async function ensureSecondSeedOrder(): Promise<{
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
      WHERE tenant_id = $1 AND code = 'E2E-WR-AUFTRAG-2'
      LIMIT 1`,
    [SEED.TENANT_ID],
  )
  if (rows[0]) return rows[0]

  const insert = await pool().query<{ id: string; code: string; name: string }>(
    `INSERT INTO orders (tenant_id, code, name, status, is_active, created_at, updated_at)
     VALUES ($1, 'E2E-WR-AUFTRAG-2', 'E2E Arbeitsschein Auftrag 2', 'active', true, NOW(), NOW())
     RETURNING id, code, name`,
    [SEED.TENANT_ID],
  )
  return insert.rows[0]!
}

/**
 * Return or create a ServiceObject so the cross-surface test can
 * assert the WorkReport appears on the ServiceObject detail tab.
 */
export async function ensureSeedServiceObject(): Promise<{
  id: string
  number: string
}> {
  const { rows } = await pool().query<{ id: string; number: string }>(
    `SELECT id, number FROM service_objects
      WHERE tenant_id = $1 AND number = 'SO-E2E-WR-1'
      LIMIT 1`,
    [SEED.TENANT_ID],
  )
  if (rows[0]) return rows[0]

  // Need a customer + location context; use the simplest insert with only
  // mandatory fields. Fall back to inserting our own customer if none exists.
  const customerRes = await pool().query<{ id: string }>(
    `SELECT id FROM crm_addresses
      WHERE tenant_id = $1 AND type IN ('CUSTOMER','BOTH')
      ORDER BY created_at ASC
      LIMIT 1`,
    [SEED.TENANT_ID],
  )
  let customerId = customerRes.rows[0]?.id
  if (!customerId) {
    const ins = await pool().query<{ id: string }>(
      `INSERT INTO crm_addresses (tenant_id, number, type, company, is_active)
       VALUES ($1, 'K-E2E-WR', 'CUSTOMER', 'E2E WR Kunde GmbH', true)
       RETURNING id`,
      [SEED.TENANT_ID],
    )
    customerId = ins.rows[0]!.id
  }

  const insert = await pool().query<{ id: string; number: string }>(
    `INSERT INTO service_objects (
        tenant_id, number, name, customer_address_id, is_active, created_at, updated_at
      )
      VALUES ($1, 'SO-E2E-WR-1', 'E2E WR Serviceobjekt', $2, true, NOW(), NOW())
      RETURNING id, number`,
    [SEED.TENANT_ID, customerId],
  )
  return insert.rows[0]!
}
