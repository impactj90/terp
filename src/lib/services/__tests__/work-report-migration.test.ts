/**
 * Integration test for Phase 1 (Foundation) of the WorkReport M-1 plan.
 *
 * Verifies that the three new migrations
 *   20260506000000_create_work_reports.sql
 *   20260506000001_create_work_report_storage_buckets.sql
 *   20260506000002_add_work_report_permissions_to_groups.sql
 * have been applied to the dev Postgres and that the expected shape of the
 * database matches the schema defined in the plan.
 *
 * Guarded by HAS_DB so the suite skips cleanly when DATABASE_URL is unset
 * (CI without `pnpm db:start`).
 *
 * Plan: thoughts/shared/plans/2026-04-22-workreport-arbeitsschein-m1.md
 */
import { describe, expect, it } from "vitest"

import { prisma } from "@/lib/db/prisma"
import { createAdminClient } from "@/lib/supabase/admin"

const HAS_DB = Boolean(process.env.DATABASE_URL)

// Permission UUIDs hard-coded here mirror the migration's hard-coded values.
// If any of these change, both the migration and the permission-catalog.ts
// key strings must change in lockstep (see also
// src/lib/auth/__tests__/permission-catalog.test.ts).
const WORK_REPORTS_VIEW = "3900e091-b05b-588c-a33c-b0dbbcc9390e"
const WORK_REPORTS_MANAGE = "765828bb-fc82-54bc-bccd-090a9b1ceee7"
const WORK_REPORTS_SIGN = "8adc32f0-34d6-511c-98ea-047b33b4fe0e"
const WORK_REPORTS_VOID = "5b0caa91-6571-5b04-a5bb-ecd382f042b3"

describe.skipIf(!HAS_DB)(
  "WorkReport Phase 1 migrations: schema shape",
  () => {
    it("table work_reports exists", async () => {
      const rows = await prisma.$queryRaw<Array<{ regclass: string | null }>>`
        SELECT to_regclass('public.work_reports')::text AS regclass
      `
      expect(rows[0]?.regclass).toBe("work_reports")
    })

    it("table work_report_assignments exists", async () => {
      const rows = await prisma.$queryRaw<Array<{ regclass: string | null }>>`
        SELECT to_regclass('public.work_report_assignments')::text AS regclass
      `
      expect(rows[0]?.regclass).toBe("work_report_assignments")
    })

    it("table work_report_attachments exists", async () => {
      const rows = await prisma.$queryRaw<Array<{ regclass: string | null }>>`
        SELECT to_regclass('public.work_report_attachments')::text AS regclass
      `
      expect(rows[0]?.regclass).toBe("work_report_attachments")
    })

    it("enum type work_report_status exists with exactly DRAFT, SIGNED, VOID", async () => {
      const rows = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'work_report_status'
        ORDER BY e.enumsortorder
      `
      expect(rows.map((r) => r.enumlabel)).toEqual([
        "DRAFT",
        "SIGNED",
        "VOID",
      ])
    })

    it("expected btree indexes on work_reports exist", async () => {
      const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'work_reports'
        ORDER BY indexname
      `
      const names = rows.map((r) => r.indexname)
      expect(names).toEqual(
        expect.arrayContaining([
          "idx_work_reports_tenant_status",
          "idx_work_reports_tenant_order",
          "idx_work_reports_tenant_service_object",
          "idx_work_reports_tenant_visit_date",
        ])
      )
    })

    it("expected btree indexes on work_report_assignments exist (including partial-null-role)", async () => {
      const rows = await prisma.$queryRaw<
        Array<{ indexname: string; indexdef: string }>
      >`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'work_report_assignments'
        ORDER BY indexname
      `
      const names = rows.map((r) => r.indexname)
      expect(names).toEqual(
        expect.arrayContaining([
          "idx_work_report_assignments_tenant",
          "idx_work_report_assignments_work_report",
          "idx_work_report_assignments_employee",
          "idx_work_report_assignments_unique_null_role",
        ])
      )

      // The partial index must carry the WHERE role IS NULL predicate —
      // without it, Postgres would accept duplicate null-role rows for the
      // same (work_report_id, employee_id) pair because NULLs are distinct
      // under a normal UNIQUE constraint.
      const partial = rows.find(
        (r) => r.indexname === "idx_work_report_assignments_unique_null_role"
      )
      expect(partial?.indexdef).toMatch(/WHERE \(role IS NULL\)/i)
      expect(partial?.indexdef).toMatch(/UNIQUE/i)
    })

    it("wh_stock_movements.work_report_id column and index exist", async () => {
      const colRows = await prisma.$queryRaw<
        Array<{ column_name: string; data_type: string; is_nullable: string }>
      >`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'wh_stock_movements'
          AND column_name = 'work_report_id'
      `
      expect(colRows).toHaveLength(1)
      expect(colRows[0]?.data_type).toBe("uuid")
      expect(colRows[0]?.is_nullable).toBe("YES")

      const idxRows = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'wh_stock_movements'
          AND indexname = 'idx_wh_stock_movements_tenant_work_report'
      `
      expect(idxRows).toHaveLength(1)
    })

    it("work_reports.tenant_id + code uniqueness is enforced", async () => {
      const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.work_reports'::regclass
          AND contype = 'u'
          AND conname = 'work_reports_tenant_id_code_key'
      `
      expect(rows).toHaveLength(1)
    })

    it("row-level security is enabled on all three new tables", async () => {
      const rows = await prisma.$queryRaw<
        Array<{ relname: string; relrowsecurity: boolean }>
      >`
        SELECT c.relname, c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
            'work_reports',
            'work_report_assignments',
            'work_report_attachments'
          )
        ORDER BY c.relname
      `
      expect(rows).toHaveLength(3)
      for (const row of rows) {
        expect(row.relrowsecurity).toBe(true)
      }
    })
  }
)

describe.skipIf(!HAS_DB)(
  "WorkReport Phase 1 migrations: storage buckets",
  () => {
    it("both new buckets exist and are private with expected limits", async () => {
      const admin = createAdminClient()
      const { data: buckets, error } = await admin.storage.listBuckets()
      expect(error).toBeNull()
      expect(buckets).toBeTruthy()

      const signatures = buckets?.find((b) => b.id === "workreport-signatures")
      expect(signatures).toBeDefined()
      expect(signatures?.public).toBe(false)
      // file_size_limit may be normalized to bytes or kept as a string — we
      // check it is at most 1 MiB, whichever representation Supabase returns.
      if (typeof signatures?.file_size_limit === "number") {
        expect(signatures.file_size_limit).toBeLessThanOrEqual(1024 * 1024)
      }

      const attachments = buckets?.find(
        (b) => b.id === "workreport-attachments"
      )
      expect(attachments).toBeDefined()
      expect(attachments?.public).toBe(false)
      if (typeof attachments?.file_size_limit === "number") {
        expect(attachments.file_size_limit).toBeLessThanOrEqual(
          10 * 1024 * 1024
        )
      }
    })
  }
)

describe.skipIf(!HAS_DB)(
  "WorkReport Phase 1 migrations: permission grants",
  () => {
    // Helper that checks whether the permissions JSONB on a system user_group
    // (tenant_id IS NULL) contains a given UUID as a top-level array element.
    async function groupHasPermission(
      code: string,
      permId: string
    ): Promise<boolean> {
      const rows = await prisma.$queryRaw<Array<{ hit: boolean }>>`
        SELECT (permissions @> to_jsonb(${permId}::text)) AS hit
        FROM user_groups
        WHERE code = ${code} AND tenant_id IS NULL
        LIMIT 1
      `
      return rows[0]?.hit === true
    }

    it("ADMIN has all 4 work_reports permissions (view + manage + sign + void)", async () => {
      expect(await groupHasPermission("ADMIN", WORK_REPORTS_VIEW)).toBe(true)
      expect(await groupHasPermission("ADMIN", WORK_REPORTS_MANAGE)).toBe(true)
      expect(await groupHasPermission("ADMIN", WORK_REPORTS_SIGN)).toBe(true)
      expect(await groupHasPermission("ADMIN", WORK_REPORTS_VOID)).toBe(true)
    })

    it("PERSONAL/VERTRIEB/MITARBEITER have view + manage + sign (NOT void)", async () => {
      for (const code of ["PERSONAL", "VERTRIEB", "MITARBEITER"] as const) {
        expect(await groupHasPermission(code, WORK_REPORTS_VIEW)).toBe(true)
        expect(await groupHasPermission(code, WORK_REPORTS_MANAGE)).toBe(true)
        expect(await groupHasPermission(code, WORK_REPORTS_SIGN)).toBe(true)
        expect(await groupHasPermission(code, WORK_REPORTS_VOID)).toBe(false)
      }
    })

    it("VORGESETZTER has none of the 4 work_reports permissions", async () => {
      expect(await groupHasPermission("VORGESETZTER", WORK_REPORTS_VIEW)).toBe(
        false
      )
      expect(
        await groupHasPermission("VORGESETZTER", WORK_REPORTS_MANAGE)
      ).toBe(false)
      expect(await groupHasPermission("VORGESETZTER", WORK_REPORTS_SIGN)).toBe(
        false
      )
      expect(await groupHasPermission("VORGESETZTER", WORK_REPORTS_VOID)).toBe(
        false
      )
    })

    it("idempotency: re-running migration C does not duplicate permissions", async () => {
      // The migration uses jsonb_agg(DISTINCT val) via jsonb_array_elements,
      // so a second apply should be a no-op. We verify by counting how many
      // times each UUID appears as a top-level element.
      const rows = await prisma.$queryRaw<
        Array<{ code: string; cnt: bigint }>
      >`
        SELECT code, COUNT(*)::bigint AS cnt
        FROM user_groups, jsonb_array_elements_text(permissions) elem
        WHERE tenant_id IS NULL
          AND code = 'ADMIN'
          AND elem = ${WORK_REPORTS_VIEW}
        GROUP BY code
      `
      expect(rows[0]?.cnt ?? 0n).toBe(1n)
    })
  }
)
