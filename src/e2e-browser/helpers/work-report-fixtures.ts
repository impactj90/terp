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

// ---------------------------------------------------------------------------
// R-1 invoice-bridge fixture helpers
//
// Reusable helpers for the WorkReport → Invoice E2E spec (UC-WR-87). They
// cover Stundensatz manipulation, NoAddress regression, audit-log assertions
// and second-order seeding for filter tests. Storno + VOID are intentionally
// driven through the UI (not exposed here) so the audit + state transitions
// match real operator behavior.
// ---------------------------------------------------------------------------

/**
 * Set `orders.billing_rate_per_hour` for a single order. Pass `null` to
 * clear the rate entirely so the bridge service falls back to the
 * Employee.hourlyRate chain.
 */
export async function setOrderRate(
  orderId: string,
  rate: number | null,
): Promise<void> {
  await pool().query(
    `UPDATE orders SET billing_rate_per_hour = $2, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3`,
    [orderId, rate, SEED.TENANT_ID],
  )
}

/**
 * Set `employees.hourly_rate` for a single employee. Pass `null` to
 * clear the rate, forcing the bridge to flag `requiresManualPrice`.
 */
export async function setEmployeeRate(
  employeeId: string,
  rate: number | null,
): Promise<void> {
  await pool().query(
    `UPDATE employees SET hourly_rate = $2, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $3`,
    [employeeId, rate, SEED.TENANT_ID],
  )
}

/**
 * Detach the ServiceObject from a WorkReport. Used to drive the
 * NoAddress-banner test — the bridge service refuses to generate when
 * `WorkReport.serviceObject?.customerAddressId` is null/missing.
 */
export async function clearServiceObject(
  workReportId: string,
): Promise<void> {
  await pool().query(
    `UPDATE work_reports SET service_object_id = NULL, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
    [workReportId, SEED.TENANT_ID],
  )
}

/**
 * Build a second seed Order (idempotent) and ensure it has its own
 * ServiceObject + customer address attached. Used by the booking-sheet
 * filter test which proves the WR-Select shows only DRAFT-Scheine of
 * the currently-opened order.
 */
export async function seedSecondOrderWithSO(): Promise<{
  id: string
  code: string
  customerAddressId: string
  serviceObjectId: string
}> {
  const order = await ensureSecondSeedOrder()

  // Reuse first available CUSTOMER address; tests don't care which.
  const customerRes = await pool().query<{ id: string }>(
    `SELECT id FROM crm_addresses
       WHERE tenant_id = $1 AND type IN ('CUSTOMER','BOTH')
       ORDER BY created_at ASC LIMIT 1`,
    [SEED.TENANT_ID],
  )
  let addressId = customerRes.rows[0]?.id
  if (!addressId) {
    const ins = await pool().query<{ id: string }>(
      `INSERT INTO crm_addresses (tenant_id, number, type, company, is_active)
        VALUES ($1, 'K-E2E-INV-2', 'CUSTOMER', 'E2E Invoice Kunde 2 GmbH', true)
        RETURNING id`,
      [SEED.TENANT_ID],
    )
    addressId = ins.rows[0]!.id
  }

  const soRes = await pool().query<{ id: string }>(
    `SELECT id FROM service_objects
       WHERE tenant_id = $1 AND number = 'SO-E2E-INV-2' LIMIT 1`,
    [SEED.TENANT_ID],
  )
  let serviceObjectId = soRes.rows[0]?.id
  if (!serviceObjectId) {
    const ins = await pool().query<{ id: string }>(
      `INSERT INTO service_objects (
          tenant_id, number, name, customer_address_id, is_active,
          status, kind, qr_code_payload, created_at, updated_at
        )
        VALUES ($1, 'SO-E2E-INV-2', 'E2E Invoice Anlage 2', $2, true,
                'OPERATIONAL', 'EQUIPMENT',
                'TERP:SO:1000:SO-E2E-INV-2', NOW(), NOW())
        RETURNING id`,
      [SEED.TENANT_ID, addressId],
    )
    serviceObjectId = ins.rows[0]!.id
  }

  await pool().query(
    `UPDATE orders SET service_object_id = $2,
                       billing_rate_per_hour = 75.00,
                       updated_at = NOW()
       WHERE id = $1`,
    [order.id, serviceObjectId],
  )

  return {
    id: order.id,
    code: order.code,
    customerAddressId: addressId,
    serviceObjectId,
  }
}

/**
 * Read all `audit_logs` rows for a given (entity_type, entity_id) tuple
 * within the seed tenant. Returned ordered by `performed_at ASC` so
 * tests that care about sequence can assert deterministically.
 */
export async function fetchAuditLogsForEntity(
  entityType: string,
  entityId: string,
): Promise<Array<{ action: string; metadata: Record<string, unknown> }>> {
  const { rows } = await pool().query<{
    action: string
    metadata: Record<string, unknown> | null
  }>(
    `SELECT action, metadata
       FROM audit_logs
      WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
      ORDER BY performed_at ASC`,
    [SEED.TENANT_ID, entityType, entityId],
  )
  return rows.map((r) => ({
    action: r.action,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  }))
}

/**
 * Fetch the (single, non-CANCELLED) BillingDocument that references a
 * WorkReport, or null if none exists. Used by tests that need to
 * jump from the WR-page back to the freshly-generated invoice.
 *
 * Note: when a doc has been cancelled and re-generated, multiple rows
 * with the same `work_report_id` exist; we return the latest non-
 * CANCELLED one (deterministic via `created_at DESC`).
 */
export async function fetchBillingDocumentByWorkReport(
  workReportId: string,
): Promise<{ id: string; number: string; status: string } | null> {
  const { rows } = await pool().query<{
    id: string
    number: string
    status: string
  }>(
    `SELECT id, number, status FROM billing_documents
       WHERE tenant_id = $1 AND work_report_id = $2
         AND status != 'CANCELLED'
       ORDER BY created_at DESC
       LIMIT 1`,
    [SEED.TENANT_ID, workReportId],
  )
  return rows[0] ?? null
}
