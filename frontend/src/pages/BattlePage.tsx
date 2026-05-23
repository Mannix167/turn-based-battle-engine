import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGame, moveEntity, basicAttack, attackTerrain, useSkill, digTreasure, endAction, chooseKillReward } from '../api/game'
import { getMap } from '../api/maps'
import { listCharacters } from '../api/characters'
import { listAllSkillTemplates } from '../api/skills'
import EntityPanel from '../components/EntityPanel'
import BattleLog from '../components/BattleLog'
import KillRewardModal from '../components/KillRewardModal'
import FullscreenMapViewport from '../components/battle/FullscreenMapViewport'
import { AudioManager } from '../audio/AudioManager'
import { fallbackSoundForEvent, type SoundKey } from '../audio/soundRegistry'
import type { GameStateRead, BattleEntity, SkillInstance, Direction, Position } from '../types/game'
import type { MapRead, TerrainType } from '../types/map'
import type { CharacterRead } from '../types/character'
import type { SkillTemplateRead } from '../types/skill'
import { RARITY_COLORS, RARITY_LABELS } from '../types/skill'
import { TERRAIN_DEFINITIONS } from '../data/terrain'

type InteractionMode = 'idle' | 'moving' | 'attacking' | 'skill-target' | 'skill-direction' | 'dig-target'
type TokenVisualEffect = { type: 'hit' | 'critical' | 'heal' | 'die' | 'cast' | 'move'; amount?: number }
type BattleToast = { text: string; kind: 'success' | 'error' | 'info' }

// 简单曼哈顿距离范围高亮（仅做视觉提示，不判断合法性）
function buildRangeCells(cx: number, cy: number, range: number, mapW: number, mapH: number): Set<string> {
  const cells = new Set<string>()
  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      if (Math.abs(dx) + Math.abs(dy) <= range) {
        const nx = cx + dx
        const ny = cy + dy
        if (nx >= 0 && nx < mapW && ny >= 0 && ny < mapH) {
          cells.add(`${nx},${ny}`)
        }
      }
    }
  }
  return cells
}

export default function BattlePage() {
  const { gameId } = useParams<{ gameId: string }>()
  const navigate = useNavigate()

  const [gameState, setGameState] = useState<GameStateRead | null>(null)
  const [mapData, setMapData] = useState<MapRead | null>(null)
  const [characters, setCharacters] = useState<CharacterRead[]>([])
  const [templates, setTemplates] = useState<Record<string, SkillTemplateRead>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 交互状态
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('idle')
  const [selectedSkill, setSelectedSkill] = useState<SkillInstance | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)
  const [inspectedEntityId, setInspectedEntityId] = useState<string | null>(null)
  const [pendingFirstTargetId, setPendingFirstTargetId] = useState<string | null>(null)
  const [highlightCells, setHighlightCells] = useState<Set<string>>(new Set())
  const [highlightMode, setHighlightMode] = useState<'move' | 'attack' | 'skill' | 'dig' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [battleToast, setBattleToast] = useState<BattleToast | null>(null)
  const [audioMuted, setAudioMuted] = useState(AudioManager.getMuted())
  const [tokenEffects, setTokenEffects] = useState<Record<string, TokenVisualEffect>>({})
  const previousCurrentEntityId = useRef<string | null>(null)
  const playedEventIds = useRef<Set<string>>(new Set())
  const toastTimerRef = useRef<number | null>(null)

  // tokenImageUrl 映射（从 character 数据中取）
  const [tokenImageUrls, setTokenImageUrls] = useState<Record<string, string | null>>({})
  const [portraitImageUrls, setPortraitImageUrls] = useState<Record<string, string | null>>({})

  const loadData = useCallback(async () => {
    if (!gameId) return
    try {
      const [state, chars, tmpls] = await Promise.all([
        getGame(gameId),
        listCharacters(),
        listAllSkillTemplates(),
      ])
      setGameState(state)
      setCharacters(chars)

      const tmplMap: Record<string, SkillTemplateRead> = {}
      tmpls.forEach((t) => { tmplMap[t.id] = t })
      setTemplates(tmplMap)

      // 加载地图
      const map = await getMap(state.mapId)
      setMapData(map)

      // 建立 token/portrait 映射
      const tokenUrls: Record<string, string | null> = {}
      const portraitUrls: Record<string, string | null> = {}
      chars.forEach((c) => {
        tokenUrls[c.id] = c.tokenImageUrl
        portraitUrls[c.id] = c.portraitImageUrl
      })
      state.entities.forEach((e) => {
        if (!tokenUrls[e.id]) tokenUrls[e.id] = e.tokenImageUrl ?? null
        if (!portraitUrls[e.id]) portraitUrls[e.id] = e.portraitImageUrl ?? null
      })
      setTokenImageUrls(tokenUrls)
      setPortraitImageUrls(portraitUrls)

      setLoadError(null)
    } catch {
      setLoadError('加载游戏状态失败，请确保后端已启动')
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    const currentId = gameState?.currentEntityId ?? null
    if (currentId && previousCurrentEntityId.current !== currentId) {
      setInspectedEntityId(null)
      setSelectedEntityId(null)
    }
    previousCurrentEntityId.current = currentId
  }, [gameState?.currentEntityId])

  useEffect(() => {
    if (!gameState) return
    gameState.recentEvents.forEach((event) => {
      if (playedEventIds.current.has(event.id)) return
      playedEventIds.current.add(event.id)
      const sound = (event.soundKey as SoundKey | undefined) ?? fallbackSoundForEvent(event.type, event.terrainType)
      if (sound) AudioManager.play(sound)
    })
  }, [gameState?.recentEvents, gameState])

  // ——— 错误处理 ———
  const handleApiError = (err: unknown) => {
    const detail =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined
    showBattleToast(detail ?? '操作失败，请重试', 'error')
  }

  const showBattleToast = (text: string, kind: BattleToast['kind'] = 'info') => {
    setErrorMessage(kind === 'error' ? text : null)
    setBattleToast({ text, kind })
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => {
      setBattleToast(null)
      if (kind === 'error') setErrorMessage(null)
    }, 3200)
  }

  const updateState = (newState: GameStateRead, options?: { keepMode?: 'moving' | 'attacking' }) => {
    const visualEffects: Record<string, TokenVisualEffect> = {}
    const previousEntities = new Map(gameState?.entities.map((e) => [e.id, e]) ?? [])
    const damageByTarget = new Map(newState.recentDamageEvents.map((event) => [event.targetEntityId, event]))

    newState.entities.forEach((next) => {
      const prev = previousEntities.get(next.id)
      if (!prev) return
      const damageEvent = damageByTarget.get(next.id)
      if (damageEvent) {
        visualEffects[next.id] = {
          type: damageEvent.isCrit || damageEvent.amount >= Math.max(8, next.maxHp * 0.25) ? 'critical' : 'hit',
          amount: damageEvent.amount,
        }
        return
      }
      if (prev.isAlive && !next.isAlive) {
        visualEffects[next.id] = { type: 'die' }
        return
      }
      if (next.currentHp > prev.currentHp) {
        visualEffects[next.id] = { type: 'heal' }
        return
      }
      if (next.x !== prev.x || next.y !== prev.y) {
        visualEffects[next.id] = { type: 'move' }
      }
    })

    if (currentEntity && selectedSkill) visualEffects[currentEntity.id] = { type: 'cast' }
    if (Object.keys(visualEffects).length > 0) {
      setTokenEffects(visualEffects)
      window.setTimeout(() => setTokenEffects({}), 760)
    }

    const previousLogLength = gameState?.log.length ?? 0
    const newLogLines = newState.log.slice(previousLogLength)
    const latestLog = newLogLines.length > 0
      ? newLogLines[newLogLines.length - 1]
      : newState.log[newState.log.length - 1]
    if (latestLog) {
      const hasDamage = newState.recentDamageEvents.length > 0
      const hasCrit = newState.recentDamageEvents.some((event) => event.isCrit)
      showBattleToast(hasCrit ? `${latestLog} 暴击！` : latestLog, hasDamage ? 'success' : 'info')
    }

    setGameState(newState)
    setPendingFirstTargetId(null)
    const nextCurrent = newState.entities.find((e) => e.id === newState.currentEntityId) ?? null
    if (options?.keepMode === 'moving' && nextCurrent && mapData) {
      const totalAp = nextCurrent.temporaryAP + nextCurrent.permanentAP
      setInteractionMode('moving')
      setSelectedSkill(null)
      setSelectedEntityId(nextCurrent.id)
      setHighlightCells(buildRangeCells(nextCurrent.x, nextCurrent.y, totalAp, mapData.width, mapData.height))
      setHighlightMode('move')
      return
    }
    if (options?.keepMode === 'attacking' && nextCurrent && mapData) {
      setInteractionMode('attacking')
      setSelectedSkill(null)
      setHighlightCells(buildRangeCells(nextCurrent.x, nextCurrent.y, nextCurrent.attackRange, mapData.width, mapData.height))
      setHighlightMode('attack')
      return
    }
    setInteractionMode('idle')
    setSelectedSkill(null)
    setHighlightCells(new Set())
    setHighlightMode(null)
  }

  const currentEntity: BattleEntity | null = gameState
    ? (gameState.entities.find((e) => e.id === gameState.currentEntityId) ?? null)
    : null

  const inspectedEntity = gameState
    ? (inspectedEntityId ? gameState.entities.find((e) => e.id === inspectedEntityId) ?? null : null)
    : null

  // 获取指定位置的地形类型（优先从 GameState.map，回退到 MapTemplate）
  const getCellTerrain = useCallback((x: number, y: number): TerrainType => {
    if (gameState?.map?.cells) {
      const gameCell = gameState.map.cells.find((c) => c.x === x && c.y === y)
      if (gameCell) return gameCell.terrainType
    }
    const mapCell = mapData?.cells?.find((c) => c.x === x && c.y === y)
    return mapCell?.terrainType ?? 'normal'
  }, [gameState, mapData])

  const currentSkills = useMemo(() => {
    if (!currentEntity) return []
    return currentEntity.skillInstances
      .map((instance) => ({ instance, template: templates[instance.templateId] }))
      .filter((item): item is { instance: SkillInstance; template: SkillTemplateRead } => Boolean(item.template))
  }, [currentEntity, templates])

  const actionHint = useMemo(() => {
    if (interactionMode === 'moving') return '选择蓝色格子完成移动'
    if (interactionMode === 'attacking') return '点击红色范围内的目标进行攻击（含可破坏地形）'
    if (interactionMode === 'dig-target') return '点击金色标记的藏宝点进行挖宝'
    if (interactionMode === 'skill-direction') return '选择技能释放方向'
    if (interactionMode === 'skill-target' && selectedSkill) {
      const targetType = templates[selectedSkill.templateId]?.targetType
      if (targetType === 'twoEntities') {
        return pendingFirstTargetId ? '已选择第一个目标，再点第二个目标' : '选择第一个技能目标'
      }
      if (targetType === 'emptyCell') return '点击紫色范围内的空格释放技能'
      return '点击紫色范围内的目标释放技能'
    }
    return '选择行动后，在地图上完成目标选择'
  }, [interactionMode, pendingFirstTargetId, selectedSkill, templates])

  // ——— 操作：移动 ———
  const handleMoveMode = () => {
    if (!currentEntity || !mapData) return
    setInteractionMode('moving')
    setSelectedEntityId(currentEntity.id)
    const tempAp = currentEntity.temporaryAP
    const permAp = currentEntity.permanentAP
    const totalAp = tempAp + permAp
    setHighlightCells(buildRangeCells(currentEntity.x, currentEntity.y, totalAp, mapData.width, mapData.height))
    setHighlightMode('move')
    setErrorMessage(null)
  }

  const handleCellClick = async (x: number, y: number) => {
    if (!gameId || !currentEntity) return
    if (interactionMode === 'moving') {
      try {
        const newState = await moveEntity(gameId, currentEntity.id, { x, y })
        updateState(newState, { keepMode: 'moving' })
      } catch (err) { handleApiError(err) }
    } else if (interactionMode === 'attacking') {
      // 攻击模式点击空格子可能是攻击木桩
      const cellTerrain = getCellTerrain(x, y)
      if (cellTerrain === 'wood_stake') {
        try {
          const newState = await attackTerrain(gameId, currentEntity.id, { x, y })
          updateState(newState, { keepMode: 'attacking' })
        } catch (err) { handleApiError(err) }
      }
    } else if (interactionMode === 'skill-target' && selectedSkill) {
      const tmpl = templates[selectedSkill.templateId]
      if (tmpl?.targetType === 'emptyCell') {
        try {
          const newState = await useSkill(gameId, {
            casterId: currentEntity.id,
            skillInstanceId: selectedSkill.instanceId,
            targetCell: { x, y },
          })
          updateState(newState)
        } catch (err) { handleApiError(err) }
      }
    } else if (interactionMode === 'dig-target') {
      const treasure = gameState?.treasures.find((item) => !item.isDug && item.x === x && item.y === y)
      if (!treasure) {
        showBattleToast('该格子不是可挖藏宝点', 'error')
        return
      }
      await handleDigTreasure(treasure.id)
    } else if (interactionMode === 'idle') {
      const distance = Math.abs(currentEntity.x - x) + Math.abs(currentEntity.y - y)
      if (distance !== 1) return
      try {
        const newState = await moveEntity(gameId, currentEntity.id, { x, y })
        updateState(newState)
      } catch (err) { handleApiError(err) }
    }
  }

  // ——— 操作：攻击 ———
  const handleAttackMode = () => {
    if (!currentEntity || !mapData) return
    setInteractionMode('attacking')
    setSelectedEntityId(currentEntity.id)
    setHighlightCells(buildRangeCells(currentEntity.x, currentEntity.y, currentEntity.attackRange, mapData.width, mapData.height))
    setHighlightMode('attack')
    setErrorMessage(null)
  }

  const handleEntityClick = async (entityId: string) => {
    if (!gameId) return
    if (!currentEntity || gameState?.isFinished) {
      setSelectedEntityId(entityId)
      setInspectedEntityId(entityId)
      return
    }
    if (interactionMode === 'attacking') {
      try {
        const newState = await basicAttack(gameId, currentEntity.id, entityId)
        updateState(newState, { keepMode: 'attacking' })
      } catch (err) { handleApiError(err) }
    } else if (interactionMode === 'skill-target' && selectedSkill) {
      const tmpl = templates[selectedSkill.templateId]
      if (tmpl?.targetType === 'single') {
        try {
          const newState = await useSkill(gameId, {
            casterId: currentEntity.id,
            skillInstanceId: selectedSkill.instanceId,
            targetEntityId: entityId,
          })
          updateState(newState)
        } catch (err) { handleApiError(err) }
      } else if (tmpl?.targetType === 'twoEntities') {
        if (!pendingFirstTargetId) {
          setPendingFirstTargetId(entityId)
          setSelectedEntityId(entityId)
          showBattleToast('请选择第二个目标', 'info')
          return
        }
        if (pendingFirstTargetId === entityId) {
          showBattleToast('第二个目标不能与第一个目标相同', 'error')
          return
        }
        try {
          const newState = await useSkill(gameId, {
            casterId: currentEntity.id,
            skillInstanceId: selectedSkill.instanceId,
            targetEntityId: pendingFirstTargetId,
            secondTargetEntityId: entityId,
          })
          updateState(newState)
        } catch (err) { handleApiError(err) }
      }
    } else {
      // 查看模式：选中目标实体
      toggleEntityInspection(entityId)
    }
  }

  const toggleEntityInspection = (entityId: string) => {
    const nextSelectedId = entityId === inspectedEntityId ? null : entityId
    setSelectedEntityId(nextSelectedId)
    setInspectedEntityId(nextSelectedId)
  }

  // ——— 操作：技能 ———
  const handleSkillClick = (instance: SkillInstance) => {
    const tmpl = templates[instance.templateId]
    if (!tmpl || !currentEntity || !mapData) return
    setSelectedSkill(instance)
    setErrorMessage(null)

    if (tmpl.targetType === 'self') {
      // 直接释放
      handleUseSkillSelf(instance)
      return
    }
    if (tmpl.targetType === 'direction') {
      setInteractionMode('skill-direction')
      setHighlightCells(new Set())
      setHighlightMode('skill')
      return
    }
    setPendingFirstTargetId(null)
    // single, twoEntities or emptyCell
    setInteractionMode('skill-target')
    setHighlightCells(buildRangeCells(currentEntity.x, currentEntity.y, tmpl.range, mapData.width, mapData.height))
    setHighlightMode('skill')
  }

  const handleUseSkillSelf = async (instance: SkillInstance) => {
    if (!gameId || !currentEntity) return
    try {
      const newState = await useSkill(gameId, {
        casterId: currentEntity.id,
        skillInstanceId: instance.instanceId,
        targetEntityId: currentEntity.id,
      })
      updateState(newState)
    } catch (err) { handleApiError(err) }
  }

  const handleDirectionSkill = async (dir: Direction) => {
    if (!gameId || !currentEntity || !selectedSkill) return
    try {
      const newState = await useSkill(gameId, {
        casterId: currentEntity.id,
        skillInstanceId: selectedSkill.instanceId,
        direction: dir,
      })
      updateState(newState)
    } catch (err) { handleApiError(err) }
  }

  // ——— 操作：挖宝 ———
  const handleDigClick = () => {
    if (!gameState || !currentEntity || !mapData) return
    const nearbyTreasures = gameState.treasures.filter(
      (t) => !t.isDug && Math.abs(t.x - currentEntity.x) + Math.abs(t.y - currentEntity.y) <= currentEntity.attackRange
    )
    if (nearbyTreasures.length === 0) {
      showBattleToast('附近没有可挖的宝藏', 'error')
      return
    }
    setInteractionMode('dig-target')
    setSelectedEntityId(currentEntity.id)
    setHighlightCells(new Set(nearbyTreasures.map((t) => `${t.x},${t.y}`)))
    setHighlightMode('dig')
  }

  const handleDigTreasure = async (treasureId: string) => {
    if (!gameId || !currentEntity) return
    try {
      const newState = await digTreasure(gameId, currentEntity.id, treasureId)
      updateState(newState)
    } catch (err) { handleApiError(err) }
  }

  // ——— 操作：结束行动 ———
  const handleEndAction = async () => {
    if (!gameId || !currentEntity) return
    try {
      const newState = await endAction(gameId, currentEntity.id)
      updateState(newState)
    } catch (err) { handleApiError(err) }
  }

  // ——— 击杀奖励 ———
  const handleChooseReward = async (killerId: string, templateId: string) => {
    if (!gameId) return
    try {
      const newState = await chooseKillReward(gameId, killerId, templateId)
      updateState(newState)
    } catch (err) { handleApiError(err) }
  }

  const cancelInteraction = () => {
    setInteractionMode('idle')
    setSelectedSkill(null)
    setPendingFirstTargetId(null)
    setHighlightCells(new Set())
    setHighlightMode(null)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button')) return

      if (event.key === 'Escape') {
        cancelInteraction()
        return
      }
      if (!currentEntity || gameState?.isFinished) return

      const key = event.key.toLowerCase()
      const quickSkillIndex = Number(event.key) - 1
      if (quickSkillIndex >= 0 && quickSkillIndex < currentSkills.length) {
        handleSkillClick(currentSkills[quickSkillIndex].instance)
        return
      }
      if (key === 'm') handleMoveMode()
      if (key === 'a') handleAttackMode()
      if (key === ' ' || key === 'enter') {
        event.preventDefault()
        handleEndAction()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  if (loading) {
    return (
      <div className="battle-loading">
        <p>加载游戏中...</p>
      </div>
    )
  }

  if (loadError || !gameState || !mapData) {
    return (
      <div className="battle-loading">
        <p className="error-text">{loadError ?? '游戏数据不存在'}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          返回首页
        </button>
      </div>
    )
  }

  const currentActor = currentEntity
  const panelEntity = inspectedEntity
  const portraitUrl = panelEntity ? portraitImageUrls[panelEntity.id] : null
  const panelFaction = panelEntity ? gameState.factions.find((faction) => faction.id === panelEntity.factionId) ?? null : null
  const panelOwnerName = panelEntity?.ownerId ? gameState.entities.find((entity) => entity.id === panelEntity.ownerId)?.name ?? panelEntity.ownerId : null

  return (
    <div className="battle-page fullscreen-battle-page">
      <FullscreenMapViewport
        gameState={gameState}
        mapData={mapData}
        interactionMode={interactionMode}
        selectedEntityId={selectedEntityId}
        selectedSkillInstanceId={selectedSkill?.instanceId ?? null}
        highlightMode={highlightMode}
        highlightCells={highlightCells}
        tokenEffects={tokenEffects}
        tokenImageUrls={tokenImageUrls}
        onCellClick={handleCellClick}
        onEntityClick={handleEntityClick}
        onCancel={cancelInteraction}
      />

      <motion.header className="battle-hud-top" initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <button className="hud-chip hud-exit" onClick={() => navigate('/')}>退出</button>
        <div className="hud-chip">第 {gameState.roundNumber} 轮</div>
        <div className="hud-current">
          <span>当前行动</span>
          <strong>{gameState.isFinished ? '游戏结束' : currentActor?.name ?? '处理中'}</strong>
          {currentActor && <b>临时 AP {currentActor.temporaryAP} / 永久 AP {currentActor.permanentAP}</b>}
        </div>
        <div className="hud-queue">
          {gameState.actionQueue.slice(0, 5).map((id) => {
            const entity = gameState.entities.find((item) => item.id === id)
            const faction = gameState.factions.find((item) => item.id === entity?.factionId)
            return (
              <button key={id} className={id === gameState.currentEntityId ? 'active' : ''} style={{ borderColor: faction?.color }} onClick={() => toggleEntityInspection(id)}>
                {entity?.name.charAt(0) ?? '?'}
              </button>
            )
          })}
        </div>
        <button
          className="hud-chip"
          onClick={() => {
            const next = !audioMuted
            AudioManager.setMuted(next)
            setAudioMuted(next)
          }}
        >
          {audioMuted ? '静音' : '音效'}
        </button>
      </motion.header>

      <AnimatePresence>
        {battleToast && (
          <motion.div
            className={`battle-toast battle-toast-${battleToast.kind}`}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            {battleToast.text}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panelEntity && (
          <motion.aside
            className="floating-entity-panel"
            initial={{ opacity: 0, x: -24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -24, scale: 0.98 }}
          >
            <button
              type="button"
              className="floating-panel-close"
              onClick={() => {
                setInspectedEntityId(null)
                setSelectedEntityId(null)
              }}
              aria-label="关闭属性栏"
            >
              ×
            </button>
            <EntityPanel
              entity={panelEntity}
              portraitImageUrl={portraitUrl}
              templates={templates}
              selectedSkillId={selectedSkill?.instanceId ?? null}
              onSkillClick={handleSkillClick}
              onBasicAttack={handleAttackMode}
              onDigTreasure={handleDigClick}
              onEndAction={handleEndAction}
              interactionMode={interactionMode}
              errorMessage={null}
              canAct={!!panelEntity && panelEntity.id === currentActor?.id}
              panelTitle={panelEntity && panelEntity.id !== currentActor?.id ? '查看单位' : '当前行动单位'}
              faction={panelFaction}
              ownerName={panelOwnerName}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {!gameState.isFinished && currentActor && (
        <motion.div className="floating-command-bar" initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }}>
          <div className="command-context">
            <span>当前指令</span>
            <strong>{actionHint}</strong>
          </div>
          <div className="command-primary">
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} className={`command-btn ${interactionMode === 'moving' ? 'active move' : ''}`} onClick={interactionMode === 'moving' ? cancelInteraction : handleMoveMode}>
              <span className="command-icon command-icon-move" />
              <span>移动</span>
            </motion.button>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} className={`command-btn ${interactionMode === 'attacking' ? 'active attack' : ''}`} onClick={interactionMode === 'attacking' ? cancelInteraction : handleAttackMode}>
              <span className="command-icon command-icon-attack" />
              <span>攻击</span>
            </motion.button>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} className={`command-btn ${interactionMode === 'dig-target' ? 'active dig' : ''}`} onClick={interactionMode === 'dig-target' ? cancelInteraction : handleDigClick}>
              <span className="command-icon command-icon-treasure" />
              <span>挖宝</span>
            </motion.button>
            <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} className="command-btn danger" onClick={handleEndAction}>
              <span className="command-icon command-icon-end" />
              <span>结束</span>
            </motion.button>
          </div>
        </motion.div>
      )}

      {currentSkills.length > 0 && currentActor && (
        <motion.div className="floating-skill-panel" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }}>
          <div className="skill-panel-title">技能</div>
          <AnimatePresence>
            {currentSkills.map(({ instance, template }, index) => (
              <motion.button
                key={instance.instanceId}
                layout
                exit={{ opacity: 0, scale: 0.88 }}
                whileHover={{ x: -3 }}
                whileTap={{ scale: 0.97 }}
                className={`floating-skill-card ${selectedSkill?.instanceId === instance.instanceId ? 'selected' : ''} ${instance.isUsed ? 'used' : ''}`}
                onMouseEnter={() => AudioManager.play('ui_hover', { volume: 0.35 })}
                onClick={() => { AudioManager.play('ui_click'); handleSkillClick(instance) }}
              >
                <span className="skill-hotkey">{index + 1}</span>
                <span className="skill-icon">{template.iconUrl ? <img src={template.iconUrl} alt={template.name} /> : '技'}</span>
                <span className="skill-copy">
                  <strong>
                    {template.name}
                    <span className="rarity-dot" style={{ backgroundColor: RARITY_COLORS[template.rarity] }} title={RARITY_LABELS[template.rarity]} />
                    {(instance.quantity ?? 1) > 1 && <span className="skill-stack-inline">x{instance.quantity}</span>}
                  </strong>
                  <small>{template.description || '暂无技能描述'}</small>
                </span>
                <span className="skill-cost">{template.cost} AP</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {interactionMode === 'skill-direction' && (
        <motion.div className="floating-direction-pad" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}>
          <strong>选择方向</strong>
          <div className="direction-buttons">
            {(['up', 'down', 'left', 'right'] as Direction[]).map((dir) => {
              const labels: Record<Direction, string> = { up: '上', down: '下', left: '左', right: '右' }
              return (
                <button key={dir} className="btn btn-secondary direction-btn" onClick={() => handleDirectionSkill(dir)}>
                  {labels[dir]}
                </button>
              )
            })}
          </div>
          <button className="btn btn-danger btn-sm" onClick={cancelInteraction}>取消</button>
        </motion.div>
      )}

      <motion.div className="battle-roster-strip" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        {gameState.entities.map((entity) => {
          const hpPct = Math.max(0, Math.min(100, (entity.currentHp / entity.maxHp) * 100))
          const faction = gameState.factions.find((item) => item.id === entity.factionId)
          return (
            <button
              key={entity.id}
              type="button"
              className={`roster-avatar ${inspectedEntityId === entity.id ? 'selected' : ''} ${gameState.currentEntityId === entity.id ? 'current' : ''} ${!entity.isAlive ? 'dead' : ''}`}
              style={{ borderColor: faction?.color }}
              onClick={() => toggleEntityInspection(entity.id)}
              title={`${entity.name}${faction ? ` / ${faction.name}` : ''} HP ${entity.currentHp}/${entity.maxHp}`}
            >
              {portraitImageUrls[entity.id] ? <img src={portraitImageUrls[entity.id] ?? ''} alt={entity.name} /> : <span>{entity.name.charAt(0).toUpperCase()}</span>}
              <i style={{ width: `${hpPct}%` }} />
            </button>
          )
        })}
      </motion.div>

      <motion.div className="battle-log-mini" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <BattleLog logs={gameState.log.slice(-8)} />
      </motion.div>

      {/* ===== 击杀奖励弹窗 ===== */}
      {Object.keys(gameState.pendingRewards).length > 0 && (
        <KillRewardModal
          gameId={gameState.gameId}
          pendingRewards={gameState.pendingRewards}
          templates={templates}
          onChoose={handleChooseReward}
        />
      )}

      {/* ===== 胜利结算 ===== */}
      {gameState.isFinished && (
        <div className="modal-overlay">
          <div className="modal-box victory-modal">
            <div className="victory-title">游戏结束</div>
            {gameState.winnerGroup.length > 0 && (
              <div className="victory-winner">
                胜利阵营：{gameState.winnerGroup.map((id) => gameState.entities.find((entity) => entity.id === id)?.name ?? id).join('、')}
              </div>
            )}
            <div className="victory-round">总轮数：{gameState.roundNumber}</div>
            <div className="victory-actions">
              <button className="btn btn-primary" onClick={() => navigate('/setup')}>
                再来一局
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('/')}>
                返回首页
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
