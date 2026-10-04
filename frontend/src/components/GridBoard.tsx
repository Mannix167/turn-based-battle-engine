import React, { useState } from 'react'
import type { GameStateRead, BattleEntity, TreasureEntity } from '../types/game'
import type { MapRead, MapCell, TerrainType, TerrainState } from '../types/map'
import { TERRAIN_DEFINITIONS, getTerrainTooltip, getMoveCostHint } from '../data/terrain'
import EntityToken from './EntityToken'

type InteractionMode = 'idle' | 'moving' | 'attacking' | 'skill-target' | 'skill-direction'
type TokenVisualEffect = { type: 'hit' | 'critical' | 'heal' | 'die' | 'cast' | 'move'; amount?: number }

interface Props {
  gameState: GameStateRead
  mapData: MapRead
  interactionMode: InteractionMode
  selectedEntityId: string | null
  highlightMode: 'move' | 'attack' | 'skill' | null
  highlightCells: Set<string>
  tokenEffects?: Record<string, TokenVisualEffect>
  tokenImageUrls: Record<string, string | null>   // entityId → tokenImageUrl
  onCellClick: (x: number, y: number) => void
  onEntityClick: (entityId: string) => void
}

export default function GridBoard({
  gameState,
  mapData,
  interactionMode,
  selectedEntityId,
  highlightMode,
  highlightCells,
  tokenEffects = {},
  tokenImageUrls,
  onCellClick,
  onEntityClick,
}: Props) {
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)

  // 构建位置 → entity 映射
  const cellEntityMap = new Map<string, BattleEntity | TreasureEntity>()
  gameState.treasures.forEach((t) => {
    cellEntityMap.set(`${t.x},${t.y}`, t)
  })
  gameState.entities.forEach((e) => {
    if (e.isAlive) cellEntityMap.set(`${e.x},${e.y}`, e)
  })

  // 优先使用 GameState.map.cells 的地形信息（局内地形会变化）
  const gameCellMap = new Map<string, MapCell>()
  if (gameState.map?.cells) {
    gameState.map.cells.forEach((c) => gameCellMap.set(`${c.x},${c.y}`, c))
  }

  const validSet = new Set(
    mapData.validCells.length > 0
      ? mapData.validCells.map((c) => `${c.x},${c.y}`)
      : Array.from({ length: mapData.height }, (_, y) =>
          Array.from({ length: mapData.width }, (_, x) => `${x},${y}`)
        ).flat()
  )

  const cellSize = Math.max(44, Math.min(64, Math.floor(520 / Math.max(mapData.width, mapData.height))))

  const handleCellClick = (x: number, y: number, key: string) => {
    const entity = cellEntityMap.get(key)
    if (entity && 'isAlive' in entity && entity.isAlive) {
      onEntityClick(entity.id)
    } else {
      onCellClick(x, y)
    }
  }

  const highlightColorClass: Record<string, string> = {
    move: 'hl-move',
    attack: 'hl-attack',
    skill: 'hl-skill',
  }

  return (
    <div className="grid-board-wrap">
      <div
        className="grid-board"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${mapData.width}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${mapData.height}, ${cellSize}px)`,
        }}
      >
        {Array.from({ length: mapData.height }, (_, y) =>
          Array.from({ length: mapData.width }, (_, x) => {
            const key = `${x},${y}`
            const isValid = validSet.has(key)
            const isHighlighted = highlightCells.has(key)
            const isHovered = hoveredCell === key
            const entity = cellEntityMap.get(key)
            const isCurrent = entity && 'isAlive' in entity && entity.id === gameState.currentEntityId
            const isSelected = entity && 'isAlive' in entity && entity.id === selectedEntityId
            const visualEffect = entity && 'isAlive' in entity ? tokenEffects[entity.id] : undefined

            // 地形信息：优先 GameState > MapTemplate
            const gameCell = gameCellMap.get(key)
            const mapCell = mapData.cells?.find((c) => c.x === x && c.y === y)
            const terrainType: TerrainType = gameCell?.terrainType ?? mapCell?.terrainType ?? 'normal'
            const terrainState: TerrainState | null | undefined = gameCell?.terrainState ?? mapCell?.terrainState
            const terrainDef = TERRAIN_DEFINITIONS[terrainType]
            const moveHint = getMoveCostHint(terrainType)
            const tooltipText = getTerrainTooltip(terrainType, terrainState)

            const hlClass = isHighlighted && highlightMode ? highlightColorClass[highlightMode] : ''

            return (
              <div
                key={key}
                className={[
                  'grid-cell',
                  !isValid ? 'cell-invalid' : 'cell-valid',
                  terrainType !== 'normal' ? `cell-terrain-${terrainType}` : '',
                  terrainDef?.dangerous ? 'cell-terrain-danger' : '',
                  isHighlighted ? hlClass : '',
                  isHovered && isValid ? 'cell-hovered' : '',
                  interactionMode !== 'idle' && isValid && !entity ? 'cell-interactive' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  width: cellSize,
                  height: cellSize,
                  backgroundImage: isValid && terrainType !== 'normal' ? `url(${terrainDef?.imageUrl})` : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                onClick={() => isValid && handleCellClick(x, y, key)}
                onMouseEnter={() => setHoveredCell(key)}
                onMouseLeave={() => setHoveredCell(null)}
                title={`(${x},${y}) ${tooltipText}`}
              >
                {/* 坐标标签（小字） */}
                <span className="cell-coord">{x},{y}</span>

                {/* 地形特效提示 */}
                {terrainDef?.dangerous && !entity && (
                  <span className="cell-danger-indicator">⚠️</span>
                )}
                {moveHint && !entity && (
                  <span className="cell-move-hint">{moveHint}</span>
                )}
                {terrainType === 'wood_stake' && terrainState?.hp != null && (
                  <span className="cell-wood-hp">HP {terrainState.hp}/{terrainState.maxHp ?? 10}</span>
                )}

                {entity && (
                  <EntityToken
                    entity={entity}
                    isCurrentActor={!!isCurrent}
                    isSelected={!!isSelected}
                    visualEffect={visualEffect}
                    tokenImageUrl={
                      'isAlive' in entity ? tokenImageUrls[entity.id] : null
                    }
                  />
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
