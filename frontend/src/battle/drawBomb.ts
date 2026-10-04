import type { Graphics } from 'pixi.js'
import type { Position } from '../types/game'
import type { ActivePlayback } from './playback'

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3)

/** Drawn from one shared clock. Every coordinate is reprojected each frame. */
export function drawBomb(
  g: Graphics, active: ActivePlayback, now: number,
  project: (position: Position) => Position, cellSize: number,
) {
  g.clear()
  const { plan, startedAt } = active
  const t = Math.max(0, now - startedAt)
  if (t >= plan.durationMs) return
  const launch = plan.cues.find((cue) => cue.kind === 'launch')?.atMs ?? 280
  const impact = plan.cues.find((cue) => cue.kind === 'impact')?.atMs ?? 950
  const source = project(plan.sourcePosition)
  const target = project(plan.targetPosition)
  const u = cellSize / 72
  const flight = clamp((t - launch) / (impact - launch))
  const arc = Math.min(125 * u, Math.max(60 * u, Math.hypot(target.x - source.x, target.y - source.y) * 0.32))
  const point = (progress: number) => ({
    x: source.x + (target.x - source.x) * progress,
    y: source.y - 15 * u + (target.y - source.y + 15 * u) * progress - Math.sin(progress * Math.PI) * arc,
  })
  const glow = (x: number, y: number, radius: number, color: number, alpha: number) => {
    for (let i = 3; i >= 1; i--) g.circle(x, y, radius * i).fill({ color, alpha: alpha / (i * i + 1) })
  }

  if (t < impact) {
    const pulse = 0.65 + 0.25 * Math.sin(t / 95)
    g.ellipse(target.x, target.y + 20 * u, 24 * u, 9 * u).fill({ color: 0x120e0a, alpha: 0.35 })
    g.circle(target.x, target.y, (22 + flight * 3) * u).stroke({ color: 0xffbc58, width: 1.3 * u, alpha: pulse })
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2
      g.moveTo(target.x + Math.cos(a) * 31 * u, target.y + Math.sin(a) * 31 * u)
        .lineTo(target.x + Math.cos(a) * 25 * u, target.y + Math.sin(a) * 25 * u)
        .stroke({ color: 0xffda8b, width: 2 * u, alpha: pulse })
    }
    if (t < launch) {
      const p = clamp(t / launch)
      glow(source.x, source.y, (12 + p * 8) * u, 0xffb34d, 0.13)
      g.ellipse(source.x, source.y + 19 * u, (14 + p * 15) * u, (5 + p * 5) * u)
        .stroke({ color: 0xffd78a, width: 2 * u, alpha: Math.sin(p * Math.PI) })
    }
    const p = point(flight)
    if (t >= launch) {
      // Tapered embers follow the same ballistic path as the projectile.
      for (let i = 14; i >= 1; i--) {
        const tail = flight - i * 0.013
        if (tail < 0) continue
        const q = point(tail)
        const fade = 1 - i / 15
        g.circle(q.x, q.y, (1.2 + fade * 3.1) * u)
          .fill({ color: i < 5 ? 0xffce70 : 0xf07427, alpha: fade * 0.62 })
      }
    }
    glow(p.x + 6 * u, p.y - 13 * u, 4 * u, 0xffa633, 0.22)
    // Illustrated iron shell with rim light, neck and a burning curved fuse.
    g.circle(p.x, p.y, 11.8 * u).fill(0x0d1019).stroke({ color: 0xd5c7a0, width: 1.3 * u, alpha: 0.85 })
    g.circle(p.x - 1.6 * u, p.y - 1.8 * u, 8.8 * u).fill(0x303745)
    g.ellipse(p.x - 4 * u, p.y - 5 * u, 3.8 * u, 2.4 * u).fill({ color: 0xb9cad4, alpha: 0.8 })
    g.roundRect(p.x - 3 * u, p.y - 15 * u, 7 * u, 5 * u, 1.2 * u).fill(0xbaa16b)
    g.moveTo(p.x + u, p.y - 15 * u)
      .quadraticCurveTo(p.x + 3 * u, p.y - 24 * u, p.x + 9 * u, p.y - 20 * u)
      .stroke({ color: 0xe9c78c, width: 2 * u })
    g.star(p.x + 9 * u, p.y - 20 * u, 5, (4 + Math.sin(t / 22)) * u, 1.5 * u, t / 80)
      .fill(0xfff6cf)
    for (let i = 0; i < 5; i++) {
      const phase = ((t / 180 + i / 5) % 1)
      const angle = i * 2.4
      g.circle(p.x + 9 * u + Math.cos(angle) * phase * 17 * u, p.y - 20 * u + Math.sin(angle) * phase * 17 * u, (1 - phase) * 1.8 * u)
        .fill({ color: 0xffb64d, alpha: 1 - phase })
    }
    return
  }

  const age = t - impact
  const p = clamp(age / 950)
  // Ground contact remains centered, separate from the rising smoke.
  g.ellipse(target.x, target.y + 18 * u, 33 * u, 12 * u)
    .fill({ color: 0x160c09, alpha: (1 - p) * 0.55 })
  const ring = easeOut(age / 440)
  if (age < 440) {
    g.ellipse(target.x, target.y + 9 * u, (12 + ring * 71) * u, (6 + ring * 36) * u)
      .stroke({ color: 0xffd698, width: (1 - ring) * 6 * u + u, alpha: (1 - ring) * 0.9 })
  }
  // Soft smoke silhouettes, followed by hotter, shorter-lived flame petals.
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.399
    const rise = easeOut(age / 850)
    const x = target.x + Math.cos(angle) * (12 + rise * 35) * u
    const y = target.y - (rise * 40 + 3) * u + Math.sin(angle) * 22 * u
    g.circle(x, y, (9 + rise * (11 + i % 3 * 4)) * u)
      .fill({ color: i % 2 ? 0x4e4140 : 0x292b34, alpha: Math.sin(p * Math.PI) * 0.27 })
  }
  if (age < 480) {
    const fire = clamp(age / 480)
    glow(target.x, target.y - 5 * u, (10 + easeOut(fire) * 17) * u, 0xff7b24, (1 - fire) * 0.23)
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4 + 0.2
      const spread = easeOut(fire) * (25 + i % 3 * 6) * u
      const x = target.x + Math.cos(angle) * spread
      const y = target.y + Math.sin(angle) * spread - fire * 14 * u
      const radius = (8 + Math.sin(fire * Math.PI) * 14) * u
      g.circle(x, y, radius).fill({ color: 0xe95319, alpha: (1 - fire) * 0.8 })
      g.circle(x, y - 2 * u, radius * 0.68).fill({ color: 0xffb43e, alpha: (1 - fire) * 0.92 })
    }
    g.circle(target.x, target.y - 3 * u, (6 + (1 - fire) * 25) * u)
      .fill({ color: 0xfff2bf, alpha: Math.pow(1 - fire, 2) })
  }
  // Fast fragments decelerate, drop and cool.
  for (let i = 0; i < 24; i++) {
    const a = i * 2.399
    const life = 460 + i % 5 * 90
    const q = clamp(age / life)
    if (q >= 1) continue
    const distance = easeOut(q) * (38 + i % 7 * 9) * u
    const x = target.x + Math.cos(a) * distance
    const y = target.y + Math.sin(a) * distance * 0.7 + q * q * 30 * u
    g.moveTo(x, y).lineTo(x - Math.cos(a) * (7 - q * 5) * u, y - Math.sin(a) * 4 * u)
      .stroke({ color: i % 3 ? 0xffc166 : 0xfff2ce, width: (1.8 - q) * u, alpha: 1 - q })
  }
  if (age < 85) {
    g.star(target.x, target.y, 9, (22 + age * 0.3) * u, 9 * u, 0.15)
      .fill({ color: 0xfff9e4, alpha: 1 - age / 85 })
  }

  const counter = plan.cues.find((cue) => cue.kind === 'counter' && cue.sourcePosition && cue.targetPosition)
  if (counter && t >= counter.atMs && t < counter.atMs + 230) {
    const from = project(counter.sourcePosition!)
    const to = project(counter.targetPosition!)
    const q = clamp((t - counter.atMs) / 230)
    g.moveTo(from.x, from.y).lineTo(to.x, to.y)
      .stroke({ color: 0xff7870, width: (1 - q) * 4 * u, alpha: 1 - q })
  }
}
