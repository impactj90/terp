let audioCtx: AudioContext | null = null

/**
 * Play a short notification sound using the Web Audio API.
 *
 * Mobile browser note: AudioContext requires a prior user gesture to initialize.
 * This function is called in response to SSE notification events, which occur
 * after the user has already interacted with the page, so the AudioContext
 * creation on demand should work on mobile browsers (iOS Safari, Chrome Android).
 */
export function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext()
    }

    const oscillator = audioCtx.createOscillator()
    const gain = audioCtx.createGain()

    oscillator.connect(gain)
    gain.connect(audioCtx.destination)

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime)
    oscillator.frequency.setValueAtTime(660, audioCtx.currentTime + 0.1)

    gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3)

    oscillator.start(audioCtx.currentTime)
    oscillator.stop(audioCtx.currentTime + 0.3)
  } catch {
    // AudioContext not available (e.g. SSR, or browser blocked autoplay)
  }
}
