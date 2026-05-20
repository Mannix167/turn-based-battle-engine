import { useEffect, useRef, useState } from 'react'
import { Application, Container, Graphics } from 'pixi.js'
import type { BattleEvent, Position } from '../../types/game'

interface Props {
  events: BattleEvent[]
  gridToScreen: (position: Position) => { x: number; y: number }
  width: number
  height: number
  cellSize: number
}

const EFFECT_COLORS: Record<string, number> = {
  slash: 0xffd166,
  blast: 0xff7a1a,
  heal: 0x5dd89c,
  'laser-line': 0x55c7f7,
  'chain-link': 0xb47cff,
  curse: 0x8b5cf6,
  burn: 0xff4d2e,
  stun: 0xf5c451,
  execute: 0xef4444,
  'critical-hit': 0xfff1a8,
  'terrain-lava': 0xff4d2e,
  'terrain-wood-stake': 0xd6a93a,
  'terrain-thunderstorm': 0x8ec5ff,
  'terrain-destroyed': 0xf8fafc,
  default: 0xf5c451,
}

export default function PixiEffectsCanvas({ events, gridToScreen, width, height, cellSize }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const layerRef = useRef<Container | null>(null)
  const seenRef = useRef<Set<string>>(new Set())
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (failed) return
    let disposed = false
    const app = new Application()
    appRef.current = app

    void app.init({
      width,
      height,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    }).then(() => {
      if (disposed) {
        app.destroy(true)
        return
      }
      const layer = new Container()
      layerRef.current = layer
      app.stage.addChild(layer)
      app.canvas.className = 'pixi-effects-canvas'
      hostRef.current?.appendChild(app.canvas)
    }).catch(() => {
      setFailed(true)
    })

    return () => {
      disposed = true
      try {
        app.destroy(true)
      } catch {
        // Pixi effects are decorative; a destroy failure should never blank the battle UI.
      }
      appRef.current = null
      layerRef.current = null
    }
  }, [failed])

  useEffect(() => {
    const app = appRef.current
    if (!app?.renderer) return
    app.renderer.resize(width, height)
  }, [width, height])

  useEffect(() => {
    const app = appRef.current
    const layer = layerRef.current
    if (!app || !layer) return

    events.forEach((event) => {
      if (seenRef.current.has(event.id)) return
      seenRef.current.add(event.id)

      const positions = event.targetPositions?.length
        ? event.targetPositions
        : event.targetPosition
        ? [event.targetPosition]
        : []
      if (positions.length === 0) return

      const effect = new Graphics()
      const color = EFFECT_COLORS[event.visualKey ?? 'default'] ?? EFFECT_COLORS.default
      const center = gridToScreen(positions[0])
      const source = event.sourcePosition ? gridToScreen(event.sourcePosition) : center

      if ((event.visualKey ?? '').includes('laser') && positions.length > 1) {
        const end = gridToScreen(positions[positions.length - 1])
        effect.moveTo(source.x, source.y)
        effect.lineTo(end.x, end.y)
        effect.stroke({ width: 8, color, alpha: 0.9 })
        positions.forEach((position) => {
          const point = gridToScreen(position)
          effect.circle(point.x, point.y, Math.max(8, cellSize * 0.12))
          effect.fill({ color, alpha: 0.34 })
        })
      } else if ((event.visualKey ?? '').includes('critical') || event.metadata?.isCrit) {
        effect.star(center.x, center.y, 8, Math.max(24, cellSize * 0.48), Math.max(10, cellSize * 0.18))
        effect.stroke({ width: 5, color: 0xef4444, alpha: 0.96 })
        effect.fill({ color, alpha: 0.26 })
      } else if ((event.visualKey ?? '').includes('terrain') || event.type.includes('terrain')) {
        effect.rect(center.x - cellSize / 2, center.y - cellSize / 2, cellSize, cellSize)
        effect.stroke({ width: 4, color, alpha: 0.9 })
        effect.fill({ color, alpha: 0.18 })
      } else {
        effect.circle(center.x, center.y, Math.max(18, cellSize * 0.38))
        effect.stroke({ width: 5, color, alpha: 0.95 })
        effect.fill({ color, alpha: 0.16 })
      }

      layer.addChild(effect)
      const start = performance.now()
      const duration = 720
      const tick = () => {
        const t = Math.min(1, (performance.now() - start) / duration)
        effect.alpha = 1 - t
        effect.scale.set(1 + t * 1.35)
        if (t >= 1) {
          app.ticker.remove(tick)
          effect.destroy()
        }
      }
      app.ticker.add(tick)
    })
  }, [events, gridToScreen, cellSize])

  if (failed) return null
  return <div ref={hostRef} className="pixi-effects-host" aria-hidden="true" />
}
