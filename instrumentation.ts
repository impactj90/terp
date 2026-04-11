export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Env validation + platform-subscriptions soft validation (Phase 10a).
    const { validateEnv, serverEnv } = await import('@/lib/config')
    validateEnv()

    if (serverEnv.platformOperatorTenantId) {
      const { prisma } = await import('@/lib/db')
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { id: serverEnv.platformOperatorTenantId },
          select: { id: true, name: true, isActive: true },
        })
        if (!tenant) {
          console.warn(
            `[platform-subscriptions] PLATFORM_OPERATOR_TENANT_ID=${serverEnv.platformOperatorTenantId} does not exist. Subscription features will fail at runtime.`,
          )
        } else if (!tenant.isActive) {
          console.warn(
            `[platform-subscriptions] Operator tenant "${tenant.name}" is inactive. Subscription features will fail until it is reactivated.`,
          )
        } else {
          console.log(
            `[platform-subscriptions] Operator tenant "${tenant.name}" active. ` +
              `This tenant is the "house" — modules booked on it will NOT generate ` +
              `self-issued invoices. All other tenants will be billed normally.`,
          )
        }
      } catch (err) {
        console.warn(
          '[platform-subscriptions] Failed to validate operator tenant on startup:',
          err,
        )
      }
    }

    // PubSub hub wiring.
    const { PubSubHub } = await import('@/lib/pubsub')
    const { setHub } = await import('@/lib/pubsub/singleton')

    let supabaseClient = undefined
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (url && key) {
        supabaseClient = createClient(url, key, {
          auth: { persistSession: false },
        })
      }
    } catch {
      console.warn('[instrumentation] Supabase client unavailable, PubSub will be in-memory only')
    }

    const hub = new PubSubHub({ supabaseClient })
    setHub(hub)
  }
}
