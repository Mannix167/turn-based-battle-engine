import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import type { ActivePlayback } from '../../battle/playback'
import type { TokenVisualEffect } from '../../battle/playback'
import EntityToken from '../EntityToken'
import PixiEffectsCanvas from './PixiEffectsCanvas'
import { getActionPreview } from '../../api/game'
import { TERRAIN_DEFINITIONS, getMoveCostHint, getTerrainTooltip } from '../../data/terrain'
import type { ActionPreviewResponse, BattleEntity, GameStateRead, Position, TreasureEntity } from '../../types/game'
import type { MapCell, MapRead, TerrainState, TerrainType } from '../../types/map'

type InteractionMode = 'idle' | 'moving' | 'attacking' | 'skill-target' | 'skill-direction' | 'dig-target'

interface Props {
  gameState: GameStateRead
  playback?: ActivePlayback | null
  playbackPhase?: string
  interactionLocked?: boolean
  mapData: MapRead
  interactionMode: InteractionMode
  selectedEntityId: string | null
  selectedSkillInstanceId?: string | null
  highlightMode: 'move' | 'attack' | 'skill' | 'dig' | null
  highlightCells: Set<string>
  tokenEffects?: Record<string, TokenVisualEffect>
  tokenImageUrls: Record<string, string | null>
  onCellClick: (x: number, y: number) => void
  onEntityClick: (entityId: string) => void
  onInspectCell?: (x: number, y: number) => void
  onCancel?: () => void
}

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2.5
const BASE_CELL_SIZE = 72
const PREVIEW_DELAY_MS = 350

export default function FullscreenMapViewport({
  gameState,
  playback,
  playbackPhase,
  interactionLocked = false,
  mapData,
  interactionMode,
  selectedEntityId,
  selectedSkillInstanceId,
  highlightMode,
  highlightCells,
  tokenEffects = {},
  tokenImageUrls,
  onCellClick,
  onEntityClick,
  onInspectCell,
  onCancel,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null)
  const previewTimerRef = useRef<number | null>(null)
  const previewTokenRef = useRef(0)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 120, y: 92 })
  const [isPanning, setIsPanning] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: window.innerWidth, height: window.innerHeight })
  const [hoveredCell, setHoveredCell] = useState<Position | null>(null)
  const [preview, setPreview] = useState<{ data: ActionPreviewResponse; x: number; y: number } | null>(null)

  const boardWidth = mapData.width * BASE_CELL_SIZE
  const boardHeight = mapData.height * BASE_CELL_SIZE

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new ResizeObserver(() => setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight }))
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  const cellEntityMap = useMemo(() => {
    const map = new Map<string, BattleEntity | TreasureEntity>()
    gameState.treasures.forEach((treasure) => map.set(`${treasure.x},${treasure.y}`, treasure))
    gameState.entities.forEach((entity) => {
      if (entity.isAlive || tokenEffects[entity.id]?.type === 'die') map.set(`${entity.x},${entity.y}`, entity)
    })
    return map
  }, [gameState.entities, gameState.treasures, tokenEffects])

  const gameCellMap = useMemo(() => {
    const map = new Map<string, MapCell>()
    gameState.map?.cells?.forEach((cell) => map.set(`${cell.x},${cell.y}`, cell))
    return map
  }, [gameState.map?.cells])

  const validSet = useMemo(
    () =>
      new Set(
        mapData.validCells.length > 0
          ? mapData.validCells.map((cell) => `${cell.x},${cell.y}`)
          : Array.from({ length: mapData.height }, (_, y) =>
              Array.from({ length: mapData.width }, (_, x) => `${x},${y}`)
            ).flat()
      ),
    [mapData]
  )

  const gridToScreen = useCallback(
    (position: Position) => ({
      x: offset.x + (position.x + 0.5) * BASE_CELL_SIZE * zoom,
      y: offset.y + (position.y + 0.5) * BASE_CELL_SIZE * zoom,
    }),
    [offset, zoom]
  )

  const clampOffset = useCallback((next: { x: number; y: number }) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return next
    const maxSlack = 180
    return {
      x: Math.min(rect.width - 80 + maxSlack, Math.max(-boardWidth * zoom + 80 - maxSlack, next.x)),
      y: Math.min(rect.height - 80 + maxSlack, Math.max(-boardHeight * zoom + 80 - maxSlack, next.y)),
    }
  }, [boardHeight, boardWidth, zoom])

  const handleWheel = (event: WheelEvent) => {
    event.preventDefault()
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top }
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom * (event.deltaY < 0 ? 1.1 : 0.9)))
    const worldX = (mouse.x - offset.x) / zoom
    const worldY = (mouse.y - offset.y) / zoom
    setZoom(nextZoom)
    setOffset(clampOffset({ x: mouse.x - worldX * nextZoom, y: mouse.y - worldY * nextZoom }))
  }

  useEffect(() => {
    const element = viewportRef.current
    element?.addEventListener('wheel', handleWheel, { passive: false })
    return () => element?.removeEventListener('wheel', handleWheel)
  }, [zoom, offset, clampOffset])

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      onCancel?.()
      return
    }
    if (event.button !== 0 && event.button !== 1) return
    const target = event.target as HTMLElement
    if (event.button === 0 && target.closest('.battle-map-cell')) return
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y, moved: false }
    setIsPanning(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    if (Math.abs(dx) + Math.abs(dy) > 4) dragRef.current.moved = true
    setOffset(clampOffset({ x: dragRef.current.ox + dx, y: dragRef.current.oy + dy }))
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId)
      window.setTimeout(() => { dragRef.current = null }, 0)
    }
    setIsPanning(false)
  }

  const clearPreview = () => {
    if (previewTimerRef.current) window.clearTimeout(previewTimerRef.current)
    previewTimerRef.current = null
    previewTokenRef.current += 1
    setPreview(null)
  }

  const schedulePreview = (position: Position, entity?: BattleEntity | TreasureEntity) => {
    clearPreview()
    const actor = gameState.entities.find((item) => item.id === gameState.currentEntityId)
    if (interactionLocked || !actor || interactionMode === 'idle' || interactionMode === 'skill-direction') return
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return
    const token = previewTokenRef.current + 1
    previewTokenRef.current = token
    previewTimerRef.current = window.setTimeout(async () => {
      try {
        const actionType =
          interactionMode === 'moving' ? 'move' :
          interactionMode === 'attacking' ? 'attack' :
          interactionMode === 'dig-target' ? 'dig' : 'skill'
        const data = await getActionPreview({
          gameId: gameState.gameId,
          actorId: actor.id,
          actionType,
          targetPosition: position,
          targetEntityId: entity && 'isAlive' in entity ? entity.id : undefined,
          skillInstanceId: actionType === 'skill' ? selectedSkillInstanceId ?? undefined : undefined,
        })
        if (previewTokenRef.current !== token) return
        const screen = gridToScreen(position)
        setPreview({ data, x: screen.x, y: screen.y })
      } catch {
        if (previewTokenRef.current === token) {
          const screen = gridToScreen(position)
          setPreview({
            x: screen.x,
            y: screen.y,
            data: { valid: false, reason: '预览请求失败', actionType: 'attack', damagePreviews: [], healPreviews: [], buffPreviews: [], terrainPreviews: [], affectedPositions: [] },
          })
        }
      }
    }, PREVIEW_DELAY_MS)
  }

  useEffect(() => { clearPreview(); return clearPreview }, [interactionMode, gameState.gameId, interactionLocked])

  return (
    <div
      ref={viewportRef}
      className={`fullscreen-map-viewport ${isPanning ? 'is-panning' : ''} ${playback?.plan.visualKey === 'bomb' && playbackPhase === '命中' ? 'bomb-impact' : ''}`}

      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(event) => {
        event.preventDefault()
        onCancel?.()
      }}
    >
      <div className="map-vignette" />
      <div
        className="fullscreen-battle-map"
        style={{
          width: boardWidth,
          height: boardHeight,
          transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${zoom})`,
          gridTemplateColumns: `repeat(${mapData.width}, ${BASE_CELL_SIZE}px)`,
          gridTemplateRows: `repeat(${mapData.height}, ${BASE_CELL_SIZE}px)`,
        }}
      >
        {Array.from({ length: mapData.height }, (_, y) =>
          Array.from({ length: mapData.width }, (_, x) => {
            const key = `${x},${y}`
            const valid = validSet.has(key)
            const entity = cellEntityMap.get(key)
            const gameCell = gameCellMap.get(key)
            const mapCell = mapData.cells?.find((cell) => cell.x === x && cell.y === y)
            const terrainType: TerrainType = gameCell?.terrainType ?? mapCell?.terrainType ?? 'normal'
            const terrainState: TerrainState | null | undefined = gameCell?.terrainState ?? mapCell?.terrainState
            const terrainDef = TERRAIN_DEFINITIONS[terrainType]
            const highlighted = highlightCells.has(key)
            const selected = entity && 'isAlive' in entity && entity.id === selectedEntityId
            const current = entity && 'isAlive' in entity && entity.id === gameState.currentEntityId
            const hovered = hoveredCell?.x === x && hoveredCell.y === y
            const moveHint = getMoveCostHint(terrainType)

            return (
              <button
                key={key}
                type="button"
                className={[
                  'battle-map-cell',
                  valid ? 'valid' : 'invalid',
                  `cell-terrain-${terrainType}`,
                  terrainDef?.dangerous ? 'dangerous' : '',
                  highlighted && highlightMode ? `highlight-${highlightMode}` : '',
                  hovered ? 'hovered' : '',
                  selected ? 'selected' : '',
                  current ? 'current' : '',
                  entity && tokenEffects[entity.id] ? 'has-token-effect' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  backgroundImage: valid && terrainDef?.imageUrl ? `${gameCell?.tileImageUrl || mapCell?.tileImageUrl ? `url(${JSON.stringify(gameCell?.tileImageUrl || mapCell?.tileImageUrl)}), ` : ''}url(${terrainDef.imageUrl})` : undefined,
                }}
                title={`(${x},${y}) ${getTerrainTooltip(terrainType, terrainState)}`}
                onMouseEnter={() => {
                  setHoveredCell({ x, y })
                  if (valid) schedulePreview({ x, y }, entity)
                }}
                onMouseLeave={() => {
                  setHoveredCell(null)
                  clearPreview()
                }}
                onClick={() => {
                  if (interactionLocked || !valid || dragRef.current?.moved) return
                  if (entity && 'isAlive' in entity && entity.isAlive) onEntityClick(entity.id)
                  else {
                    onInspectCell?.(x, y)
                    onCellClick(x, y)
                  }
                }}
              >
                <span className="map-cell-coord">{x},{y}</span>
                {terrainDef?.dangerous && !entity && <span className="map-cell-danger-mark" />}
                {moveHint && !entity && <span className="map-cell-cost">{moveHint}</span>}
                {terrainType === 'wood_stake' && terrainState?.hp != null && (
                  <span className="map-cell-wood-hp">{terrainState.hp}/{terrainState.maxHp ?? 10}</span>
                )}
                {entity && (
                  <EntityToken
                    key={entity.id + ('isAlive' in entity ? tokenEffects[entity.id]?.id ?? '' : '')}
                    entity={entity}
                    isCurrentActor={Boolean(current)}
                    isSelected={Boolean(selected)}
                    visualEffect={tokenEffects[entity.id]}
                    tokenImageUrl={'isAlive' in entity ? tokenImageUrls[entity.id] : null}
                    faction={'isAlive' in entity ? gameState.factions.find((faction) => faction.id === entity.factionId) : null}
                    allianceNames={(gameState.alliances ?? []).filter((link) => link.sourceEntityId === entity.id || link.targetEntityId === entity.id).map((link) => gameState.entities.find((item) => item.id === (link.sourceEntityId === entity.id ? link.targetEntityId : link.sourceEntityId))?.name ?? '')}
                  />
                )}
              </button>
            )
          })
        )}
      </div>

      <EffectLayer
        events={gameState.recentEvents}
        playback={playback}
        gridToScreen={gridToScreen}
        width={viewportSize.width}
        height={viewportSize.height}
        cellSize={BASE_CELL_SIZE * zoom}
      />

      {/* Numbers sit above Pixi effects and remain attached to map coordinates. */}
      <div className="battle-number-layer" aria-hidden="true">
        {Object.entries(tokenEffects).map(([entityId, effect]) => {
          if (!['hit', 'critical', 'heal', 'buff'].includes(effect.type)) return null
          const entity = gameState.entities.find((item) => item.id === entityId)
          if (!entity) return null
          const point = gridToScreen(entity)
          return <div key={effect.id ?? entityId} className={`token-effect-burst ${effect.type}`} style={{ left: point.x - 2 * zoom, top: point.y - 42 * zoom }}>
            {effect.type === 'heal' ? `+${effect.amount ?? 0}` : effect.type === 'buff' ? '状态变化' : `-${effect.amount ?? 0}`}
          </div>
        })}
      </div>

      <div className="map-camera-readout">
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => { setZoom(1); setOffset({ x: 120, y: 92 }) }}>重置视角</button>
      </div>

      <AnimatePresence>
        {preview && (
          <motion.div
            className="damage-preview-tooltip"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            style={{ left: preview.x + 16, top: preview.y - 18 }}
          >
            <PreviewContent preview={preview.data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EffectLayer(props: ComponentProps<typeof PixiEffectsCanvas>) {
  try {
    return <PixiEffectsCanvas {...props} />
  } catch {
    return null
  }
}

function PreviewContent({ preview }: { preview: ActionPreviewResponse }) {
  return (
    <>
      <strong>{preview.valid ? '行动预览' : '无法执行'}</strong>
      {preview.reason && <span>{preview.reason}</span>}
      {preview.apCost && <span>消耗：{preview.apCost.total} AP</span>}
      {preview.damagePreviews.map((item) => (
        <span key={item.targetEntityId}>
          {item.targetName}：{item.finalDamage} 伤害{item.willKill ? '，可击倒' : ''}
        </span>
      ))}
      {preview.terrainPreviews.map((item) => (
        <span key={`${item.position.x}-${item.position.y}`}>
          地形：{item.value ?? 0} 伤害
        </span>
      ))}
      {preview.counterAttackPreview && (
        <span>反击：{preview.counterAttackPreview.finalDamage} 伤害</span>
      )}
      {preview.digPreview && (
        <span>挖宝成功率：{preview.digPreview.successRate}% / 失败伤害 {preview.digPreview.failDamageValue}</span>
      )}
    </>
  )
}
