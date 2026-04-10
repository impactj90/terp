/**
 * Shared Prisma helper for tenant-scoped updates.
 *
 * Uses updateMany({ where: { id, tenantId } }) to prevent cross-tenant
 * writes, then refetches the updated record (with optional includes).
 * Throws TenantScopedNotFoundError if no row matched.
 */

// Error class -- name ends with "NotFoundError" so handleServiceError
// in src/trpc/errors.ts automatically maps it to tRPC NOT_FOUND.
export class TenantScopedNotFoundError extends Error {
  constructor(entity = "Record") {
    super(`${entity} not found`)
    this.name = "TenantScopedNotFoundError"
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaDelegate = { updateMany: any; findFirst: any }

/**
 * Tenant-scoped update: updateMany with {id, tenantId}, check count,
 * refetch with optional include/select.
 *
 * @param delegate  Prisma model delegate (e.g., prisma.booking)
 * @param where     Must include { id, tenantId } at minimum; can include extra fields (e.g., status for atomic checks)
 * @param data      The update payload
 * @param opts      Optional: include, select, entity name for error message
 * @returns         The refetched record after update
 * @throws          TenantScopedNotFoundError if count === 0
 */
 
export async function tenantScopedUpdate(
  delegate: PrismaDelegate,
  where: { id: string; tenantId: string } & Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: { include?: Record<string, unknown>; select?: Record<string, unknown>; entity?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { count } = await delegate.updateMany({ where, data })
  if (count === 0) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refetchArgs: Record<string, any> = { where }
  if (opts?.include) refetchArgs.include = opts.include
  if (opts?.select) refetchArgs.select = opts.select
  const result = await delegate.findFirst(refetchArgs)
  if (!result) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  return result
}

/**
 * Tenant-scoped update via relation (for models without direct tenantId).
 * Uses a relation filter like { id, document: { tenantId } }.
 *
 * @param delegate  Prisma model delegate
 * @param where     Relation-scoped where (e.g., { id, document: { tenantId } })
 * @param data      The update payload
 * @param opts      Optional: include, select, entity name
 * @returns         The refetched record or throws
 */
 
export async function relationScopedUpdate(
  delegate: PrismaDelegate,
  where: Record<string, unknown>,
  data: Record<string, unknown>,
  opts?: { include?: Record<string, unknown>; select?: Record<string, unknown>; entity?: string },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const { count } = await delegate.updateMany({ where, data })
  if (count === 0) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const refetchArgs: Record<string, any> = { where }
  if (opts?.include) refetchArgs.include = opts.include
  if (opts?.select) refetchArgs.select = opts.select
  const result = await delegate.findFirst(refetchArgs)
  if (!result) {
    throw new TenantScopedNotFoundError(opts?.entity)
  }
  return result
}
