/**
 * E2E fixture helpers for the NK-1 (Nachkalkulation) specs (88..92).
 *
 * Mirrors the `work-report-fixtures.ts` and `service-object-fixtures.ts`
 * patterns: direct `pg` access (the Playwright runner is CJS, Prisma is
 * ESM-only), with a shared lazy pool that callers should tear down in
 * `afterAll` via `disconnect()`.
 *
 * All fixtures are tenant-scoped to `SEED.TENANT_ID`. E2E-codes use the
 * `E2E-NK-*`, `E2E-WG-*`, `E2E-OT-*` prefixes so that `resetNk()` can
 * sweep them safely without touching demo / manual data.
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

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Wipe all NK-1 data created by E2E specs in the seed tenant. Targets only
 * rows with our E2E-* code prefixes so manually created Stammdaten in the
 * dev tenant survive untouched.
 *
 * Order matters because of FK cascades:
 *   1. order_targets — child of orders
 *   2. order_bookings — child of orders, may reference activities
 *   3. nk_threshold_configs — references order_types
 *   4. employees.wage_group_id — set NULL where pointing at our E2E-WG-*
 *   5. orders — references order_types and may have order_targets
 *   6. wage_groups, order_types, activities
 *
 * Module state (`tenant_modules.nachkalkulation`) is NOT touched. Other
 * specs may rely on it being on. Specs that need it off explicitly call
 * `disableNkModule()` and restore in `afterAll`.
 */
export async function resetNk(): Promise<void> {
  // 1. order_targets: delete via order_id IN (E2E-NK-* orders)
  await pool().query(
    `DELETE FROM order_targets
       WHERE tenant_id = $1
         AND order_id IN (
           SELECT id FROM orders
            WHERE tenant_id = $1 AND code LIKE 'E2E-NK-%'
         )`,
    [SEED.TENANT_ID],
  )
  // 2. order_bookings: delete bookings on E2E-NK-* orders OR with E2E-NK-* activities
  await pool().query(
    `DELETE FROM order_bookings
       WHERE tenant_id = $1
         AND (
           order_id IN (
             SELECT id FROM orders
              WHERE tenant_id = $1 AND code LIKE 'E2E-NK-%'
           )
           OR activity_id IN (
             SELECT id FROM activities
              WHERE tenant_id = $1 AND code LIKE 'E2E-NK-%'
           )
         )`,
    [SEED.TENANT_ID],
  )
  // 3. threshold overrides for E2E-OT-* order types + the default that may
  //    have been left in a non-default state by spec 91.
  await pool().query(
    `DELETE FROM nk_threshold_configs
       WHERE tenant_id = $1
         AND (
           order_type_id IN (
             SELECT id FROM order_types
              WHERE tenant_id = $1 AND code LIKE 'E2E-OT-%'
           )
         )`,
    [SEED.TENANT_ID],
  )
  // 4. detach E2E-WG-* wage_group_id from employees so the WageGroup rows
  //    can be deleted next without violating FK.
  await pool().query(
    `UPDATE employees SET wage_group_id = NULL, updated_at = NOW()
       WHERE tenant_id = $1
         AND wage_group_id IN (
           SELECT id FROM wage_groups
            WHERE tenant_id = $1 AND code LIKE 'E2E-WG-%'
         )`,
    [SEED.TENANT_ID],
  )
  // 5. orders themselves
  await pool().query(
    `DELETE FROM orders
       WHERE tenant_id = $1 AND code LIKE 'E2E-NK-%'`,
    [SEED.TENANT_ID],
  )
  // 6. Stammdaten
  await pool().query(
    `DELETE FROM activities
       WHERE tenant_id = $1 AND code LIKE 'E2E-NK-%'`,
    [SEED.TENANT_ID],
  )
  await pool().query(
    `DELETE FROM order_types
       WHERE tenant_id = $1 AND code LIKE 'E2E-OT-%'`,
    [SEED.TENANT_ID],
  )
  await pool().query(
    `DELETE FROM wage_groups
       WHERE tenant_id = $1 AND code LIKE 'E2E-WG-%'`,
    [SEED.TENANT_ID],
  )
}

// ---------------------------------------------------------------------------
// Module toggle
// ---------------------------------------------------------------------------

/**
 * Idempotently enable the `nachkalkulation` module for the seed tenant.
 * Most NK specs assume it's on; this is the safest call in `beforeAll`.
 */
export async function enableNkModule(): Promise<void> {
  await pool().query(
    `INSERT INTO tenant_modules (tenant_id, module, enabled_at)
       VALUES ($1, 'nachkalkulation', NOW())
       ON CONFLICT (tenant_id, module) DO NOTHING`,
    [SEED.TENANT_ID],
  )
}

/**
 * Idempotently disable the `nachkalkulation` module for the seed tenant.
 * Used by spec 92 to verify the module-gate negative path. Specs that call
 * this MUST restore the module via `enableNkModule()` in `afterAll`.
 */
export async function disableNkModule(): Promise<void> {
  await pool().query(
    `DELETE FROM tenant_modules
       WHERE tenant_id = $1 AND module = 'nachkalkulation'`,
    [SEED.TENANT_ID],
  )
}

export async function isModuleEnabled(): Promise<boolean> {
  const { rows } = await pool().query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM tenant_modules
        WHERE tenant_id = $1 AND module = 'nachkalkulation'
     ) AS exists`,
    [SEED.TENANT_ID],
  )
  return rows[0]?.exists ?? false
}

// ---------------------------------------------------------------------------
// Stammdaten seeds (idempotent)
// ---------------------------------------------------------------------------

/**
 * Idempotently create or upsert a wage group. Returns the row's id.
 */
export async function ensureWageGroup(params: {
  code: string
  name: string
  internalHourlyRate?: number
  billingHourlyRate?: number
}): Promise<{ id: string }> {
  const existing = await pool().query<{ id: string }>(
    `SELECT id FROM wage_groups
      WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [SEED.TENANT_ID, params.code],
  )
  if (existing.rows[0]) {
    // Keep the latest values in case the test expects a specific rate.
    await pool().query(
      `UPDATE wage_groups
         SET name = $3,
             internal_hourly_rate = $4,
             billing_hourly_rate = $5,
             updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [
        existing.rows[0].id,
        SEED.TENANT_ID,
        params.name,
        params.internalHourlyRate ?? null,
        params.billingHourlyRate ?? null,
      ],
    )
    return existing.rows[0]
  }

  const insert = await pool().query<{ id: string }>(
    `INSERT INTO wage_groups
       (tenant_id, code, name, internal_hourly_rate, billing_hourly_rate,
        sort_order, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 0, true, NOW(), NOW())
     RETURNING id`,
    [
      SEED.TENANT_ID,
      params.code,
      params.name,
      params.internalHourlyRate ?? null,
      params.billingHourlyRate ?? null,
    ],
  )
  return insert.rows[0]!
}

/**
 * Idempotently create an order type. Returns the row's id.
 */
export async function ensureOrderType(params: {
  code: string
  name: string
}): Promise<{ id: string }> {
  const existing = await pool().query<{ id: string }>(
    `SELECT id FROM order_types
      WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [SEED.TENANT_ID, params.code],
  )
  if (existing.rows[0]) return existing.rows[0]

  const insert = await pool().query<{ id: string }>(
    `INSERT INTO order_types
       (tenant_id, code, name, sort_order, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, 0, true, NOW(), NOW())
     RETURNING id`,
    [SEED.TENANT_ID, params.code, params.name],
  )
  return insert.rows[0]!
}

/**
 * Idempotently create an activity with a given pricing type.
 *
 * - HOURLY: hourlyRate is optional (lookup-resolver chain)
 * - FLAT_RATE: flatRate REQUIRED
 * - PER_UNIT: unit REQUIRED
 *
 * On re-runs, the row is updated to match the requested pricing — this lets
 * tests change the pricing of an existing activity between runs without
 * needing a manual delete.
 */
export async function ensureActivity(params: {
  code: string
  name: string
  pricingType: "HOURLY" | "FLAT_RATE" | "PER_UNIT"
  hourlyRate?: number
  flatRate?: number
  unit?: string
  calculatedHourEquivalent?: number
}): Promise<{ id: string }> {
  const existing = await pool().query<{ id: string }>(
    `SELECT id FROM activities
      WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [SEED.TENANT_ID, params.code],
  )
  if (existing.rows[0]) {
    await pool().query(
      `UPDATE activities
         SET name = $3,
             pricing_type = $4,
             hourly_rate = $5,
             flat_rate = $6,
             unit = $7,
             calculated_hour_equivalent = $8,
             updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [
        existing.rows[0].id,
        SEED.TENANT_ID,
        params.name,
        params.pricingType,
        params.hourlyRate ?? null,
        params.flatRate ?? null,
        params.unit ?? null,
        params.calculatedHourEquivalent ?? null,
      ],
    )
    return existing.rows[0]
  }

  const insert = await pool().query<{ id: string }>(
    `INSERT INTO activities
       (tenant_id, code, name, is_active, pricing_type,
        hourly_rate, flat_rate, unit, calculated_hour_equivalent,
        created_at, updated_at)
     VALUES ($1, $2, $3, true, $4, $5, $6, $7, $8, NOW(), NOW())
     RETURNING id`,
    [
      SEED.TENANT_ID,
      params.code,
      params.name,
      params.pricingType,
      params.hourlyRate ?? null,
      params.flatRate ?? null,
      params.unit ?? null,
      params.calculatedHourEquivalent ?? null,
    ],
  )
  return insert.rows[0]!
}

// ---------------------------------------------------------------------------
// Bewegungsdaten seeds
// ---------------------------------------------------------------------------

/**
 * Create an Order that the spec uses as the parent for Soll/Ist-Werte and
 * bookings. Idempotent on `code`.
 */
export async function createNkOrder(params: {
  code: string
  name: string
  customer?: string
  orderTypeCode?: string
  billingRatePerHour?: number
}): Promise<{ id: string }> {
  let orderTypeId: string | null = null
  if (params.orderTypeCode) {
    const ot = await pool().query<{ id: string }>(
      `SELECT id FROM order_types
        WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
      [SEED.TENANT_ID, params.orderTypeCode],
    )
    orderTypeId = ot.rows[0]?.id ?? null
  }

  const existing = await pool().query<{ id: string }>(
    `SELECT id FROM orders
      WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [SEED.TENANT_ID, params.code],
  )
  if (existing.rows[0]) {
    await pool().query(
      `UPDATE orders
         SET name = $3,
             customer = $4,
             order_type_id = $5,
             billing_rate_per_hour = $6,
             updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [
        existing.rows[0].id,
        SEED.TENANT_ID,
        params.name,
        params.customer ?? null,
        orderTypeId,
        params.billingRatePerHour ?? null,
      ],
    )
    return existing.rows[0]
  }

  const insert = await pool().query<{ id: string }>(
    `INSERT INTO orders
       (tenant_id, code, name, customer, order_type_id,
        billing_rate_per_hour, status, is_active, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', true, NOW(), NOW())
     RETURNING id`,
    [
      SEED.TENANT_ID,
      params.code,
      params.name,
      params.customer ?? null,
      orderTypeId,
      params.billingRatePerHour ?? null,
    ],
  )
  return insert.rows[0]!
}

/**
 * Create a versioned OrderTarget. If an active version (validTo IS NULL)
 * already exists for the order, this helper closes it (sets validTo to
 * the day before the new validFrom) and inserts the new version with an
 * incremented version number.
 *
 * Use this in `beforeAll` for spec 90 + 91 to seed v1 (and optionally v2)
 * without driving the form-sheet UI.
 */
export async function createOrderTarget(params: {
  orderId: string
  validFrom: string // YYYY-MM-DD
  targetHours?: number
  targetMaterialCost?: number
  targetTravelMinutes?: number
  targetExternalCost?: number
  targetRevenue?: number
  targetUnitItems?: Array<{ activityId: string; quantity: number }>
  changeReason?: string
}): Promise<{ id: string; version: number }> {
  const active = await pool().query<{ id: string; version: number; valid_from: string }>(
    `SELECT id, version, valid_from::text AS valid_from
       FROM order_targets
      WHERE tenant_id = $1 AND order_id = $2 AND valid_to IS NULL
      LIMIT 1`,
    [SEED.TENANT_ID, params.orderId],
  )

  let nextVersion = 1
  if (active.rows[0]) {
    nextVersion = active.rows[0].version + 1
    // Close the active version: validTo = newValidFrom - 1 day
    const newFromDate = new Date(`${params.validFrom}T00:00:00Z`)
    const closeDate = new Date(newFromDate)
    closeDate.setUTCDate(closeDate.getUTCDate() - 1)
    const closeIso = closeDate.toISOString().split("T")[0]!
    await pool().query(
      `UPDATE order_targets
         SET valid_to = $3::date,
             updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [active.rows[0].id, SEED.TENANT_ID, closeIso],
    )
  }

  const unitItemsJson =
    params.targetUnitItems && params.targetUnitItems.length > 0
      ? JSON.stringify(
          params.targetUnitItems.map((u) => ({
            activityId: u.activityId,
            quantity: u.quantity,
          })),
        )
      : null

  const insert = await pool().query<{ id: string; version: number }>(
    `INSERT INTO order_targets
       (tenant_id, order_id, version, valid_from, valid_to,
        target_hours, target_material_cost, target_travel_minutes,
        target_external_cost, target_revenue, target_unit_items,
        change_reason, created_at, updated_at)
     VALUES ($1, $2, $3, $4::date, NULL,
             $5, $6, $7, $8, $9, $10::jsonb,
             $11, NOW(), NOW())
     RETURNING id, version`,
    [
      SEED.TENANT_ID,
      params.orderId,
      nextVersion,
      params.validFrom,
      params.targetHours ?? null,
      params.targetMaterialCost ?? null,
      params.targetTravelMinutes ?? null,
      params.targetExternalCost ?? null,
      params.targetRevenue ?? null,
      unitItemsJson,
      params.changeReason ?? (nextVersion === 1 ? "INITIAL" : "REPLAN"),
    ],
  )
  return insert.rows[0]!
}

/**
 * Insert an OrderBooking directly. Snapshot fields (`hourlyRateAtBooking`,
 * `hourlyRateSourceAtBooking`) can be set explicitly — production paths
 * resolve them via the lookup chain in the service layer, but for fixtures
 * we just want a row with deterministic numbers.
 */
export async function createNkBooking(params: {
  orderId: string
  employeeId: string
  activityId: string
  bookingDate: string // YYYY-MM-DD
  timeMinutes: number
  quantity?: number
  hourlyRateAtBooking?: number
  hourlyRateSourceAtBooking?: string
}): Promise<{ id: string }> {
  const insert = await pool().query<{ id: string }>(
    `INSERT INTO order_bookings
       (tenant_id, employee_id, order_id, activity_id,
        booking_date, time_minutes, source,
        hourly_rate_at_booking, hourly_rate_source_at_booking,
        quantity, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::date, $6, 'manual',
             $7, $8, $9, NOW(), NOW())
     RETURNING id`,
    [
      SEED.TENANT_ID,
      params.employeeId,
      params.orderId,
      params.activityId,
      params.bookingDate,
      params.timeMinutes,
      params.hourlyRateAtBooking ?? null,
      params.hourlyRateSourceAtBooking ?? null,
      params.quantity ?? null,
    ],
  )
  return insert.rows[0]!
}

/**
 * Set or clear an Employee's wage_group_id. Pass `null` to unlink.
 */
export async function setEmployeeWageGroup(
  employeeId: string,
  wageGroupId: string | null,
): Promise<void> {
  await pool().query(
    `UPDATE employees
        SET wage_group_id = $3,
            updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2`,
    [employeeId, SEED.TENANT_ID, wageGroupId],
  )
}

// ---------------------------------------------------------------------------
// Threshold seeds
// ---------------------------------------------------------------------------

interface ThresholdSet {
  marginAmberFromPercent: number
  marginRedFromPercent: number
  productivityAmberFromPercent: number
  productivityRedFromPercent: number
}

/**
 * Upsert the tenant-wide default threshold config. Single row identified by
 * `(tenant_id, order_type_id IS NULL)`.
 */
export async function setDefaultThresholds(t: ThresholdSet): Promise<void> {
  const existing = await pool().query<{ id: string }>(
    `SELECT id FROM nk_threshold_configs
      WHERE tenant_id = $1 AND order_type_id IS NULL LIMIT 1`,
    [SEED.TENANT_ID],
  )
  if (existing.rows[0]) {
    await pool().query(
      `UPDATE nk_threshold_configs
         SET margin_amber_from_percent = $3,
             margin_red_from_percent = $4,
             productivity_amber_from_percent = $5,
             productivity_red_from_percent = $6,
             updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [
        existing.rows[0].id,
        SEED.TENANT_ID,
        t.marginAmberFromPercent,
        t.marginRedFromPercent,
        t.productivityAmberFromPercent,
        t.productivityRedFromPercent,
      ],
    )
    return
  }

  await pool().query(
    `INSERT INTO nk_threshold_configs
       (tenant_id, order_type_id,
        margin_amber_from_percent, margin_red_from_percent,
        productivity_amber_from_percent, productivity_red_from_percent,
        created_at, updated_at)
     VALUES ($1, NULL, $2, $3, $4, $5, NOW(), NOW())`,
    [
      SEED.TENANT_ID,
      t.marginAmberFromPercent,
      t.marginRedFromPercent,
      t.productivityAmberFromPercent,
      t.productivityRedFromPercent,
    ],
  )
}

/**
 * Upsert a per-OrderType threshold override. One row per (tenant, orderType).
 */
export async function setThresholdOverride(
  orderTypeId: string,
  t: ThresholdSet,
): Promise<void> {
  const existing = await pool().query<{ id: string }>(
    `SELECT id FROM nk_threshold_configs
      WHERE tenant_id = $1 AND order_type_id = $2 LIMIT 1`,
    [SEED.TENANT_ID, orderTypeId],
  )
  if (existing.rows[0]) {
    await pool().query(
      `UPDATE nk_threshold_configs
         SET margin_amber_from_percent = $3,
             margin_red_from_percent = $4,
             productivity_amber_from_percent = $5,
             productivity_red_from_percent = $6,
             updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [
        existing.rows[0].id,
        SEED.TENANT_ID,
        t.marginAmberFromPercent,
        t.marginRedFromPercent,
        t.productivityAmberFromPercent,
        t.productivityRedFromPercent,
      ],
    )
    return
  }

  await pool().query(
    `INSERT INTO nk_threshold_configs
       (tenant_id, order_type_id,
        margin_amber_from_percent, margin_red_from_percent,
        productivity_amber_from_percent, productivity_red_from_percent,
        created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [
      SEED.TENANT_ID,
      orderTypeId,
      t.marginAmberFromPercent,
      t.marginRedFromPercent,
      t.productivityAmberFromPercent,
      t.productivityRedFromPercent,
    ],
  )
}

// ---------------------------------------------------------------------------
// Verifications (read-only)
// ---------------------------------------------------------------------------

export async function getOrderTargetVersions(orderId: string): Promise<
  Array<{
    version: number
    validFrom: string
    validTo: string | null
    targetHours: number | null
    changeReason: string | null
  }>
> {
  const { rows } = await pool().query<{
    version: number
    valid_from: string
    valid_to: string | null
    target_hours: string | null
    change_reason: string | null
  }>(
    `SELECT version,
            valid_from::text AS valid_from,
            valid_to::text AS valid_to,
            target_hours,
            change_reason
       FROM order_targets
      WHERE tenant_id = $1 AND order_id = $2
      ORDER BY version ASC`,
    [SEED.TENANT_ID, orderId],
  )
  return rows.map((r) => ({
    version: r.version,
    validFrom: r.valid_from,
    validTo: r.valid_to,
    targetHours: r.target_hours == null ? null : Number(r.target_hours),
    changeReason: r.change_reason,
  }))
}

export async function getOrderBookingsCount(orderId: string): Promise<number> {
  const { rows } = await pool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM order_bookings
      WHERE tenant_id = $1 AND order_id = $2`,
    [SEED.TENANT_ID, orderId],
  )
  return parseInt(rows[0]?.count ?? "0", 10)
}

export async function getActivityByCode(code: string): Promise<{
  id: string
  pricingType: string
  unit: string | null
  flatRate: number | null
  hourlyRate: number | null
} | null> {
  const { rows } = await pool().query<{
    id: string
    pricing_type: string
    unit: string | null
    flat_rate: string | null
    hourly_rate: string | null
  }>(
    `SELECT id, pricing_type, unit, flat_rate, hourly_rate
       FROM activities
      WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [SEED.TENANT_ID, code],
  )
  const r = rows[0]
  if (!r) return null
  return {
    id: r.id,
    pricingType: r.pricing_type,
    unit: r.unit,
    flatRate: r.flat_rate == null ? null : Number(r.flat_rate),
    hourlyRate: r.hourly_rate == null ? null : Number(r.hourly_rate),
  }
}

export async function getEmployeeWageGroupId(
  employeeId: string,
): Promise<string | null> {
  const { rows } = await pool().query<{ wage_group_id: string | null }>(
    `SELECT wage_group_id FROM employees
      WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [employeeId, SEED.TENANT_ID],
  )
  return rows[0]?.wage_group_id ?? null
}

export async function getOrderById(id: string): Promise<{
  id: string
  code: string
  name: string
  orderTypeId: string | null
} | null> {
  const { rows } = await pool().query<{
    id: string
    code: string
    name: string
    order_type_id: string | null
  }>(
    `SELECT id, code, name, order_type_id
       FROM orders
      WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, SEED.TENANT_ID],
  )
  const r = rows[0]
  if (!r) return null
  return { id: r.id, code: r.code, name: r.name, orderTypeId: r.order_type_id }
}

export async function getOrderIdByCode(code: string): Promise<string | null> {
  const { rows } = await pool().query<{ id: string }>(
    `SELECT id FROM orders
      WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [SEED.TENANT_ID, code],
  )
  return rows[0]?.id ?? null
}

export async function getWageGroupIdByCode(
  code: string,
): Promise<string | null> {
  const { rows } = await pool().query<{ id: string }>(
    `SELECT id FROM wage_groups
      WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [SEED.TENANT_ID, code],
  )
  return rows[0]?.id ?? null
}

export async function getOrderTypeIdByCode(
  code: string,
): Promise<string | null> {
  const { rows } = await pool().query<{ id: string }>(
    `SELECT id FROM order_types
      WHERE tenant_id = $1 AND code = $2 LIMIT 1`,
    [SEED.TENANT_ID, code],
  )
  return rows[0]?.id ?? null
}
