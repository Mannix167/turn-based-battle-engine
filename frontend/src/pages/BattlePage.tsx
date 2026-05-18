import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getGame, moveEntity, basicAttack, useSkill, digTreasure, endAction, chooseKillReward } from '../api/game'
import { getMap } from '../api/maps'
import { listCharacters } from '../api/characters'
import { listAllSkillTemplates } from '../api/skills'
import GridBoard from '../components/GridBoard'
import EntityPanel from '../components/EntityPanel'
import BattleLog from '../components/BattleLog'
import KillRewardModal from '../components/KillRewardModal'
import type { GameStateRead, BattleEntity, SkillInstance, Direction } from '../types/game'
import type { MapRead } from '../types/map'
import type { CharacterRead } from '../types/character'
import type { SkillTemplateRead } from '../types/skill'

type InteractionMode = 'idle' | 'moving' | 'attacking' | 'skill-target' | 'skill-direction'
type TokenVisualEffect = { type: 'hit' | 'critical' | 'heal' | 'die' | 'cast' | 'move'; amount?: number }

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
  const [highlightMode, setHighlightMode] = useState<'move' | 'attack' | 'skill' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showDigModal, setShowDigModal] = useState(false)
  const [tokenEffects, setTokenEffects] = useState<Record<string, TokenVisualEffect>>({})
  const previousCurrentEntityId = useRef<string | null>(null)

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
        if (!tokenUrls[e.id]) tokenUrls[e.id] = null
        if (!portraitUrls[e.id]) portraitUrls[e.id] = null
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
      setInspectedEntityId(currentId)
      setSelectedEntityId(currentId)
    }
    previousCurrentEntityId.current = currentId
  }, [gameState?.currentEntityId])

  // ——— 错误处理 ———
  const handleApiError = (err: unknown) => {
    const detail =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined
    setErrorMessage(detail ?? '操作失败，请重试')
    setTimeout(() => setErrorMessage(null), 3000)
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

    setGameState(newState)
    setPendingFirstTargetId(null)
    const nextCurrent = newState.entities.find((e) => e.id === newState.currentEntityId) ?? null
    if (options?.keepMode === 'moving' && nextCurrent && mapData) {
      const totalAp = nextCurrent.temporaryAP + nextCurrent.permanentAP
      setInteractionMode('moving')
      setSelectedSkill(null)
      setSelectedEntityId(nextCurrent.id)
      setInspectedEntityId(nextCurrent.id)
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
    ? gameState.entities.find((e) => e.id === (inspectedEntityId ?? gameState.currentEntityId)) ?? currentEntity
    : null

  const currentSkills = useMemo(() => {
    if (!currentEntity) return []
    return currentEntity.skillInstances
      .map((instance) => ({ instance, template: templates[instance.templateId] }))
      .filter((item): item is { instance: SkillInstance; template: SkillTemplateRead } => Boolean(item.template))
  }, [currentEntity, templates])

  const actionHint = useMemo(() => {
    if (interactionMode === 'moving') return '选择蓝色格子完成移动'
    if (interactionMode === 'attacking') return '点击红色范围内的目标进行普通攻击'
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
    setInspectedEntityId(currentEntity.id)
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
    }
  }

  // ——— 操作：攻击 ———
  const handleAttackMode = () => {
    if (!currentEntity || !mapData) return
    setInteractionMode('attacking')
    setSelectedEntityId(currentEntity.id)
    setInspectedEntityId(currentEntity.id)
    setHighlightCells(buildRangeCells(currentEntity.x, currentEntity.y, currentEntity.attackRange, mapData.width, mapData.height))
    setHighlightMode('attack')
    setErrorMessage(null)
  }

  const handleEntityClick = async (entityId: string) => {
    if (!gameId || !currentEntity) return
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
          setErrorMessage('请选择第二个目标')
          return
        }
        if (pendingFirstTargetId === entityId) {
          setErrorMessage('第二个目标不能与第一个目标相同')
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
      setSelectedEntityId(entityId === selectedEntityId ? null : entityId)
      setInspectedEntityId(entityId)
    }
  }

  // ——— 操作：技能 ———
  const handleSkillClick = (instance: SkillInstance) => {
    const tmpl = templates[instance.templateId]
    if (!tmpl || !currentEntity || !mapData) return
    setSelectedSkill(instance)
    setInspectedEntityId(currentEntity.id)
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
    if (!gameState || !currentEntity) return
    const nearbyTreasures = gameState.treasures.filter((t) => !t.isDug)
    if (nearbyTreasures.length === 0) {
      setErrorMessage('附近没有可挖的宝藏')
      return
    }
    setShowDigModal(true)
  }

  const handleDigTreasure = async (treasureId: string) => {
    if (!gameId || !currentEntity) return
    setShowDigModal(false)
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
  const panelEntity = inspectedEntity ?? currentActor
  const portraitUrl = panelEntity ? portraitImageUrls[panelEntity.id] : null

  return (
    <div className="battle-page">
      {/* ===== 顶部栏 ===== */}
      <div className="battle-topbar">
        <div className="topbar-round">第 {gameState.roundNumber} 轮</div>
        <div className="topbar-current">
          {gameState.isFinished ? (
            <span className="topbar-finished">游戏结束</span>
          ) : currentActor ? (
            <>
              <span className="topbar-actor-label">当前行动：</span>
              <span className="topbar-actor-name">{currentActor.name}</span>
            </>
          ) : (
            <span>处理中...</span>
          )}
        </div>
        <div className="topbar-right">
          {gameState.isFinished && gameState.winnerGroup.length > 0 && (
            <span className="topbar-winner">
              胜者：{gameState.winnerGroup.join(', ')}
            </span>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/')}>
            退出
          </button>
        </div>
      </div>

      {/* ===== 主体 ===== */}
      <div className="battle-body">
        {/* 左侧：棋盘 */}
        <div className="battle-board-area">
          {/* 方向技能选择覆盖层 */}
          {interactionMode === 'skill-direction' && (
            <div className="direction-overlay">
              <div className="direction-prompt">选择技能方向</div>
              <div className="direction-buttons">
                {(['up', 'down', 'left', 'right'] as Direction[]).map((dir) => {
                  const arrows: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' }
                  const labels: Record<Direction, string> = { up: '上', down: '下', left: '左', right: '右' }
                  return (
                    <button
                      key={dir}
                      className="btn btn-secondary direction-btn"
                      onClick={() => handleDirectionSkill(dir)}
                    >
                      {arrows[dir]} {labels[dir]}
                    </button>
                  )
                })}
              </div>
              <button className="btn btn-danger btn-sm" onClick={cancelInteraction}>
                取消
              </button>
            </div>
          )}

          <GridBoard
            gameState={gameState}
            mapData={mapData}
            interactionMode={interactionMode}
            selectedEntityId={selectedEntityId}
            highlightMode={highlightMode}
            highlightCells={highlightCells}
            tokenEffects={tokenEffects}
            tokenImageUrls={tokenImageUrls}
            onCellClick={handleCellClick}
            onEntityClick={handleEntityClick}
          />

          {!gameState.isFinished && currentActor && (
            <div className="battle-command-dock" aria-label="战斗指挥">
              <div className="command-context">
                <span className="command-label">当前指令</span>
                <strong>{actionHint}</strong>
              </div>
              <div className="command-primary">
                <button
                  className={`command-btn ${interactionMode === 'moving' ? 'active move' : ''}`}
                  onClick={interactionMode === 'moving' ? cancelInteraction : handleMoveMode}
                  title="快捷键 M"
                >
                  <span className="command-icon command-icon-move" />
                  <span>{interactionMode === 'moving' ? '取消移动' : '移动'}</span>
                </button>
                <button
                  className={`command-btn ${interactionMode === 'attacking' ? 'active attack' : ''}`}
                  onClick={interactionMode === 'attacking' ? cancelInteraction : handleAttackMode}
                  title="快捷键 A"
                >
                  <span className="command-icon command-icon-attack" />
                  <span>攻击</span>
                </button>
                <button className="command-btn" onClick={handleDigClick}>
                  <span className="command-icon command-icon-treasure" />
                  <span>挖宝</span>
                </button>
                <button className="command-btn danger" onClick={handleEndAction} title="快捷键 Space / Enter">
                  <span className="command-icon command-icon-end" />
                  <span>结束</span>
                </button>
              </div>
              {currentSkills.length > 0 && (
                <div className="command-skills" aria-label="技能快捷栏">
                  {currentSkills.map(({ instance, template }, index) => (
                    <button
                      key={instance.instanceId}
                      className={`quick-skill-btn ${selectedSkill?.instanceId === instance.instanceId ? 'selected' : ''} ${instance.isUsed ? 'used' : ''}`}
                      onClick={() => handleSkillClick(instance)}
                      title={`${template.name} | 行动 ${template.cost} | 范围 ${template.range}`}
                    >
                      <span className="quick-skill-index">{index + 1}</span>
                      <span className="quick-skill-text">
                        <span className="quick-skill-name">{template.name}</span>
                        <span className="quick-skill-desc">{template.description || '暂无技能描述'}</span>
                      </span>
                      <span className="quick-skill-cost">{template.cost}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 行动提示与取消 */}
          {interactionMode !== 'idle' && interactionMode !== 'skill-direction' && (
            <div className="board-interaction-hint">
              <span>{actionHint}</span>
              <button className="btn btn-danger btn-sm" onClick={cancelInteraction}>
                取消
              </button>
            </div>
          )}
        </div>

        {/* 右侧：角色面板 */}
        <div className="battle-panel-area">
          <div className="battle-roster" aria-label="单位列表">
            {gameState.entities.map((entity) => {
              const hpPct = Math.max(0, Math.min(100, (entity.currentHp / entity.maxHp) * 100))
              return (
                <button
                  key={entity.id}
                  type="button"
                  className={`roster-avatar ${inspectedEntityId === entity.id ? 'selected' : ''} ${gameState.currentEntityId === entity.id ? 'current' : ''} ${!entity.isAlive ? 'dead' : ''}`}
                  onClick={() => {
                    setInspectedEntityId(entity.id)
                    setSelectedEntityId(entity.id)
                  }}
                  title={`${entity.name} HP ${entity.currentHp}/${entity.maxHp}`}
                >
                  {portraitImageUrls[entity.id] ? (
                    <img src={portraitImageUrls[entity.id] ?? ''} alt={entity.name} />
                  ) : (
                    <span>{entity.name.charAt(0).toUpperCase()}</span>
                  )}
                  {gameState.currentEntityId === entity.id && <b>行动</b>}
                  <i style={{ width: `${hpPct}%` }} />
                </button>
              )
            })}
          </div>
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
            errorMessage={errorMessage}
            canAct={!!panelEntity && panelEntity.id === currentActor?.id}
            panelTitle={panelEntity && panelEntity.id !== currentActor?.id ? '查看单位' : '当前行动单位'}
          />
        </div>
      </div>

      {/* ===== 底部日志 ===== */}
      <div className="battle-log-area">
        <BattleLog logs={gameState.log} />
      </div>

      {/* ===== 挖宝弹窗 ===== */}
      {showDigModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <div className="modal-title">选择挖宝目标</div>
            <div className="dig-treasure-list">
              {gameState.treasures
                .filter((t) => !t.isDug)
                .map((t) => (
                  <button
                    key={t.id}
                    className="btn btn-secondary dig-treasure-item"
                    onClick={() => handleDigTreasure(t.id)}
                  >
                    {t.name} ({t.x}, {t.y})
                  </button>
                ))}
            </div>
            <button className="btn btn-danger btn-sm" onClick={() => setShowDigModal(false)}>
              取消
            </button>
          </div>
        </div>
      )}

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
