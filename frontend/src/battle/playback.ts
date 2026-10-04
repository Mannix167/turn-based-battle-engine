import type { BattlePlayback, PlaybackCue } from '../types/game'

export type TokenVisualEffect = {
  type: 'hit' | 'critical' | 'heal' | 'die' | 'cast' | 'move' | 'attack' | 'buff' | 'appear' | 'dig-success' | 'dig-fail'
  amount?: number
  id?: string
  fromPosition?: { x: number; y: number }
  targetPosition?: { x: number; y: number }
}
export type PresentationCue = Omit<PlaybackCue, 'kind'> & {
  kind: PlaybackCue['kind'] | 'move' | 'attack' | 'heal' | 'status' | 'appear' | 'dig-success' | 'dig-fail' | 'sync'
}
export interface PresentationPlan extends Omit<BattlePlayback, 'cues'> {
  cues: PresentationCue[]
  label?: string
}
export interface ActivePlayback { plan: PresentationPlan; startedAt: number }
interface Callbacks {
  start: (active: ActivePlayback) => void
  cue: (cue: PresentationCue, index: number) => void
  complete: () => void
}
interface Job { plan: PresentationPlan; callbacks: Callbacks; startedAt: number; cursor: number }

/** Pure clock-driven FIFO: the renderer and combat rules are not dependencies. */
export class PlaybackQueue {
  private pending: Job[] = []
  private active: Job | null = null
  private seen = new Set<string>()
  get busy() { return this.active !== null || this.pending.length > 0 }

  enqueue(plan: PresentationPlan, callbacks: Callbacks): boolean {
    if (this.seen.has(plan.id)) return false
    this.seen.add(plan.id)
    if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value!)
    this.pending.push({ plan: { ...plan, cues: [...plan.cues].sort((a, b) => a.atMs - b.atMs) }, callbacks, startedAt: 0, cursor: 0 })
    return true
  }

  tick(now: number) {
    if (!this.active) {
      this.active = this.pending.shift() ?? null
      if (!this.active) return
      this.active.startedAt = now
      this.active.callbacks.start({ plan: this.active.plan, startedAt: now })
    }
    const job = this.active
    const elapsed = Math.max(0, now - job.startedAt)
    while (job.cursor < job.plan.cues.length && job.plan.cues[job.cursor].atMs <= elapsed) {
      const index = job.cursor++
      job.callbacks.cue(job.plan.cues[index], index)
    }
    if (elapsed >= job.plan.durationMs) {
      this.active = null
      job.callbacks.complete()
    }
  }

  /** Skip visuals, commit results exactly once. */
  finishAll() {
    const jobs = [...(this.active ? [this.active] : []), ...this.pending]
    this.active = null
    this.pending = []
    jobs.forEach((job) => job.callbacks.complete())
  }

  dispose() {
    this.active = null
    this.pending = []
    this.seen.clear()
  }
}
