/**
 * PubSub hub singleton.
 * Uses globalThis + Symbol.for() to survive module duplication.
 * Server-only.
 */
import { PubSubHub } from './hub'

const HUB_KEY = Symbol.for('terp.pubsub.hub')

export function setHub(hub: PubSubHub): void {
  ;(globalThis as Record<symbol, unknown>)[HUB_KEY] = hub
}

export async function getHub(): Promise<PubSubHub> {
  let h = (globalThis as Record<symbol, unknown>)[HUB_KEY] as PubSubHub | undefined
  if (!h) {
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
      // Supabase unavailable — fall back to in-memory only
    }
    h = new PubSubHub({ supabaseClient })
    ;(globalThis as Record<symbol, unknown>)[HUB_KEY] = h
  }
  return h
}
