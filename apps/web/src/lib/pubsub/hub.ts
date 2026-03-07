/**
 * PubSubHub -- in-memory pub/sub with Supabase Realtime cross-instance broadcast.
 * Server-only -- do not import from client components.
 */

import type {
  PubSubMessage,
  PubSubHubConfig,
  PubSubSubscription,
  RealtimeChannelLike,
  SupabaseClientLike,
} from './types'
import { userTopic, departmentTopic, groupTopic, TOPIC_ANNOUNCEMENTS, TOPIC_FEED } from './topics'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_BUFFER_SIZE = 256
const DEFAULT_CHANNEL_NAME = 'pubsub'
const BROADCAST_EVENT = 'msg'

// ---------------------------------------------------------------------------
// Internal Subscription State
// ---------------------------------------------------------------------------

interface InternalSubscription {
  id: string
  topic: string
  /** Buffered messages not yet consumed. */
  buffer: PubSubMessage[]
  /** Callback invoked when a new message arrives. */
  listener: ((msg: PubSubMessage) => void) | null
  closed: boolean
}

// ---------------------------------------------------------------------------
// PubSubHub
// ---------------------------------------------------------------------------

export class PubSubHub {
  private readonly instanceId: string
  private readonly bufferSize: number
  private readonly subscriptions: Map<string, Map<string, InternalSubscription>>
  private readonly supabaseClient: SupabaseClientLike | null
  private channel: RealtimeChannelLike | null = null
  private closed = false

  constructor(config: PubSubHubConfig = {}) {
    this.instanceId = config.instanceId ?? crypto.randomUUID()
    this.bufferSize = config.bufferSize ?? DEFAULT_BUFFER_SIZE
    this.subscriptions = new Map()
    this.supabaseClient = config.supabaseClient ?? null

    if (this.supabaseClient) {
      this.initRealtimeChannel(config.channelName ?? DEFAULT_CHANNEL_NAME)
    }
  }

  // -----------------------------------------------------------------------
  // Supabase Realtime Setup
  // -----------------------------------------------------------------------

  private initRealtimeChannel(channelName: string): void {
    if (!this.supabaseClient) return

    this.channel = this.supabaseClient.channel(channelName, {
      config: { broadcast: { self: true } },
    })

    this.channel
      .on('broadcast', { event: BROADCAST_EVENT }, (incoming) => {
        const msg = incoming.payload as PubSubMessage
        // Ignore messages from our own instance (we already delivered locally)
        if (msg.origin === this.instanceId) return
        this.deliverFromPeer(msg)
      })
      .subscribe()
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Get the hub's unique instance ID.
   */
  getInstanceId(): string {
    return this.instanceId
  }

  /**
   * Subscribe to a topic. Returns a subscription handle.
   * Messages are delivered via the onMessage callback or buffered for
   * later retrieval with consumeOne() / consumeAll().
   *
   *
   * @param topic - Topic to subscribe to
   * @param onMessage - Callback invoked for each message. If not provided,
   *   messages are buffered up to bufferSize and can be consumed via
   *   consumeOne() or consumeAll().
   */
  subscribe(topic: string, onMessage?: (msg: PubSubMessage) => void): PubSubSubscription {
    if (this.closed) throw new Error('Hub is closed')

    const sub: InternalSubscription = {
      id: crypto.randomUUID(),
      topic,
      buffer: [],
      listener: onMessage ?? null,
      closed: false,
    }

    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Map())
    }
    this.subscriptions.get(topic)!.set(sub.id, sub)

    return { id: sub.id, topic: sub.topic }
  }

  /**
   * Unsubscribe from a subscription.
   */
  unsubscribe(sub: PubSubSubscription): void {
    const topicMap = this.subscriptions.get(sub.topic)
    if (!topicMap) return

    const internal = topicMap.get(sub.id)
    if (!internal) return

    internal.closed = true
    internal.listener = null
    internal.buffer = []

    topicMap.delete(sub.id)
    if (topicMap.size === 0) {
      this.subscriptions.delete(sub.topic)
    }
  }

  /**
   * Publish a message to a topic. Delivers locally and optionally broadcasts
   * to other instances via Supabase Realtime.
   *
   *
   * @param topic - Topic to publish to
   * @param payload - JSON-serializable payload
   * @param broadcast - If true, send to other instances via Supabase (default: false)
   */
  async publish(topic: string, payload: unknown, broadcast = false): Promise<void> {
    if (this.closed) return

    const msg: PubSubMessage = {
      id: crypto.randomUUID(),
      topic,
      payload,
      timestamp: new Date().toISOString(),
      origin: this.instanceId,
    }

    this.publishLocal(msg)

    if (broadcast && this.channel) {
      await this.channel.send({
        type: 'broadcast',
        event: BROADCAST_EVENT,
        payload: msg,
      })
    }
  }

  /**
   * Deliver a message from a peer instance to local subscribers.
   */
  deliverFromPeer(msg: PubSubMessage): void {
    this.publishLocal(msg)
  }

  /**
   * Get the number of subscribers for a topic.
   */
  subscriberCount(topic: string): number {
    const topicMap = this.subscriptions.get(topic)
    return topicMap?.size ?? 0
  }

  /**
   * Get all topic names that have active subscribers.
   */
  topics(): string[] {
    return Array.from(this.subscriptions.keys())
  }

  /**
   * Close the hub: unsubscribe from Supabase channel and clear all subscriptions.
   */
  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true

    // Clean up Supabase channel
    if (this.channel && this.supabaseClient) {
      await this.supabaseClient.removeChannel(this.channel)
      this.channel = null
    }

    // Close all subscriptions
    for (const [topicName, topicMap] of this.subscriptions) {
      for (const sub of topicMap.values()) {
        sub.closed = true
        sub.listener = null
        sub.buffer = []
      }
      topicMap.clear()
      this.subscriptions.delete(topicName)
    }
  }

  // -----------------------------------------------------------------------
  // Buffer Consumption
  // -----------------------------------------------------------------------

  /**
   * Consume one buffered message from a subscription.
   * Returns undefined if the buffer is empty.
   *
   */
  consumeOne(sub: PubSubSubscription): PubSubMessage | undefined {
    const internal = this.getInternal(sub)
    if (!internal) return undefined
    return internal.buffer.shift()
  }

  /**
   * Consume all buffered messages from a subscription and clear the buffer.
   * Returns an empty array if no messages are buffered.
   *
   */
  consumeAll(sub: PubSubSubscription): PubSubMessage[] {
    const internal = this.getInternal(sub)
    if (!internal) return []
    const msgs = internal.buffer
    internal.buffer = []
    return msgs
  }

  // -----------------------------------------------------------------------
  // Convenience Helpers
  // -----------------------------------------------------------------------

  /**
   * Subscribe to a user-specific topic.
   */
  subscribeUser(userId: string, onMessage?: (msg: PubSubMessage) => void): PubSubSubscription {
    return this.subscribe(userTopic(userId), onMessage)
  }

  /**
   * Publish to a user-specific topic with broadcast.
   */
  async publishToUser(userId: string, payload: unknown): Promise<void> {
    return this.publish(userTopic(userId), payload, true)
  }

  /**
   * Publish to a department-specific topic with broadcast.
   */
  async publishToDepartment(deptId: string, payload: unknown): Promise<void> {
    return this.publish(departmentTopic(deptId), payload, true)
  }

  /**
   * Publish to a group-specific topic with broadcast.
   */
  async publishToGroup(groupId: string, payload: unknown): Promise<void> {
    return this.publish(groupTopic(groupId), payload, true)
  }

  /**
   * Publish to the announcements topic with broadcast.
   */
  async publishAnnouncements(payload: unknown): Promise<void> {
    return this.publish(TOPIC_ANNOUNCEMENTS, payload, true)
  }

  /**
   * Subscribe to the announcements topic.
   */
  subscribeAnnouncements(onMessage?: (msg: PubSubMessage) => void): PubSubSubscription {
    return this.subscribe(TOPIC_ANNOUNCEMENTS, onMessage)
  }

  /**
   * Publish to the feed topic with broadcast.
   */
  async publishToFeed(payload: unknown): Promise<void> {
    return this.publish(TOPIC_FEED, payload, true)
  }

  /**
   * Subscribe to the feed topic.
   */
  subscribeFeed(onMessage?: (msg: PubSubMessage) => void): PubSubSubscription {
    return this.subscribe(TOPIC_FEED, onMessage)
  }

  // -----------------------------------------------------------------------
  // Internal Methods
  // -----------------------------------------------------------------------

  /** Look up internal subscription state by public handle. */
  private getInternal(sub: PubSubSubscription): InternalSubscription | undefined {
    return this.subscriptions.get(sub.topic)?.get(sub.id)
  }

  /**
   * Deliver a message to all local subscribers for the message's topic.
   * Uses non-blocking buffer (drops when full) matching Go's behavior.
   *
   */
  private publishLocal(msg: PubSubMessage): void {
    const topicMap = this.subscriptions.get(msg.topic)
    if (!topicMap) return

    for (const sub of topicMap.values()) {
      if (sub.closed) continue
      this.sendToSubscription(sub, msg)
    }
  }

  /**
   * Send a message to a subscription. Non-blocking: if the buffer is full,
   * the message is silently dropped.
   *
   */
  private sendToSubscription(sub: InternalSubscription, msg: PubSubMessage): boolean {
    if (sub.closed) return false

    if (sub.listener) {
      // Callback mode: invoke directly
      sub.listener(msg)
      return true
    }

    // Buffer mode: add to buffer if not full
    if (sub.buffer.length >= this.bufferSize) {
      return false // Buffer full, drop message silently
    }
    sub.buffer.push(msg)
    return true
  }
}
