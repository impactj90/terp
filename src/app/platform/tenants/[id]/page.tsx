/**
 * Platform tenant detail — Phase 4 stub.
 *
 * Real tenant detail view (users, usage, status, actions) lands in
 * Phase 5 and Phase 9.
 */
export default async function PlatformTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="text-2xl font-semibold">Tenant {id}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Detail view lands in Phase 5.
      </p>
    </main>
  )
}
