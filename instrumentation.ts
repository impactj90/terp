export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
