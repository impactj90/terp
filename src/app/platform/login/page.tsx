/**
 * Platform login page — Phase 4 stub.
 *
 * Real form implementation lands in Phase 5. This stub just proves the
 * route is served by `src/app/platform/**` and not by the tenant `[locale]`
 * tree, and lets the middleware manual verification from Phase 4 pass.
 */
export default function PlatformLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center p-8">
      <h1 className="text-2xl font-semibold">Platform Admin Login</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Login form lands in Phase 5.
      </p>
    </main>
  )
}
