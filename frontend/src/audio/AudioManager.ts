import { soundRegistry, type SoundKey } from './soundRegistry'

const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV)

export interface PlaySoundOptions {
  volume?: number
  loop?: boolean
  interrupt?: boolean
  delayMs?: number
}

class BrowserAudioManager {
  private masterVolume = 0.55
  private muted = false
  private cache = new Map<SoundKey, HTMLAudioElement>()
  private lastPlayed = new Map<SoundKey, number>()

  play(soundKey: SoundKey, options: PlaySoundOptions = {}) {
    if (this.muted) return
    const src = soundRegistry[soundKey]
    if (!src) return

    const run = () => {
      try {
        const now = performance.now()
        const last = this.lastPlayed.get(soundKey) ?? 0
        if (!options.interrupt && now - last < 80) return
        this.lastPlayed.set(soundKey, now)

        const base = this.cache.get(soundKey) ?? new Audio(src)
        this.cache.set(soundKey, base)
        const audio = options.interrupt ? base : base.cloneNode(true) as HTMLAudioElement
        audio.volume = Math.max(0, Math.min(1, (options.volume ?? 1) * this.masterVolume))
        audio.loop = Boolean(options.loop)
        audio.currentTime = 0
        void audio.play().catch(() => {
          if (isDev) console.warn(`Missing or blocked audio: ${soundKey}`)
        })
      } catch {
        if (isDev) console.warn(`Unable to play audio: ${soundKey}`)
      }
    }

    if (options.delayMs && options.delayMs > 0) window.setTimeout(run, options.delayMs)
    else run()
  }

  setMasterVolume(value: number) {
    this.masterVolume = Math.max(0, Math.min(1, value))
  }

  setMuted(muted: boolean) {
    this.muted = muted
  }

  getMuted() {
    return this.muted
  }

  getVolume() {
    return this.masterVolume
  }
}

export const AudioManager = new BrowserAudioManager()
