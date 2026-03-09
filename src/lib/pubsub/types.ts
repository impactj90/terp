/**
 * Pub/Sub type definitions.
 * Server-only -- do not import from client components.
 *
 */

/** PubSubMessage payload sent through the pub/sub system. */
export interface PubSubMessage {
  /** Unique message ID (UUID v4). */
  id: string
  /** Topic the message was published to (e.g., "user:{uuid}"). */
  topic: string
  /** JSON-serializable payload. */
  payload: unknown
  /** ISO 8601 timestamp of when the message was created. */
  timestamp: string
  /** Instance ID of the hub that created the message. */
  origin: string
}

/**
 * Configuration for creating a PubSubHub instance.
 *
 */
export interface PubSubHubConfig {
  /** Unique instance identifier. Defaults to a random UUID if not provided. */
  instanceId?: string
  /** Maximum messages buffered per subscription before dropping. Defaults to 256. */
  bufferSize?: number
  /**
   * Supabase client for Realtime channels.
   * When provided, the hub will broadcast messages to other instances.
   * When null/undefined, the hub operates in local-only mode (no cross-instance).
   */
  supabaseClient?: SupabaseClientLike | null
  /**
   * Supabase Realtime channel name. Defaults to "pubsub".
   * All hubs must use the same channel name to communicate.
   */
  channelName?: string
}

/**
 * Minimal Supabase client interface for Realtime.
 * Using a minimal interface rather than importing the full SupabaseClient type
 * makes testing easier and reduces coupling.
 */
export interface SupabaseClientLike {
  channel(name: string, opts?: Record<string, unknown>): RealtimeChannelLike
  removeChannel(channel: RealtimeChannelLike): Promise<'ok' | 'timed out' | 'error'>
}

/**
 * Minimal Realtime channel interface.
 */
export interface RealtimeChannelLike {
  on(
    type: 'broadcast',
    filter: { event: string },
    callback: (payload: { payload: unknown }) => void
  ): RealtimeChannelLike
  subscribe(callback?: (status: string, err?: Error) => void): RealtimeChannelLike
  send(payload: {
    type: 'broadcast'
    event: string
    payload: unknown
  }): Promise<'ok' | 'timed out' | 'error'>
  unsubscribe(): Promise<'ok' | 'timed out' | 'error'>
}

/**
 * Subscription handle returned by hub.subscribe().
 */
export interface PubSubSubscription {
  /** Unique subscription ID. */
  readonly id: string
  /** Topic this subscription listens to. */
  readonly topic: string
}
