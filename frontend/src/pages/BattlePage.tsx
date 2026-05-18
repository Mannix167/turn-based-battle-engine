import React, { useCallback, useEffect, useState } from 'react'
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
  const [highlightCells, setHighlightCells] = useState<Set<string>>(new Set())
  const [highlightMode, setHighlightMode] = useState<'move' | 'attack' | 'skill' | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showDigModal, setShowDigModal] = useState(false)

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

  // ——— 错误处理 ———
  const handleApiError = (err: unknown) => {
    const detail =
      err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
        : undefined
    setErrorMessage(detail ?? '操作失败，请重试')
    setTimeout(() => setErrorMessage(null), 3000)
  }

  const updateState = (newState: GameStateRead) => {
    setGameState(newState)
    setInteractionMode('idle')
    setSelectedSkill(null)
    setHighlightCells(new Set())
    setHighlightMode(null)
  }

  const currentEntity: BattleEntity | null = gameState
    ? (gameState.entities.find((e) => e.id === gameState.currentEntityId) ?? null)
    : null

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
        updateState(newState)
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
    setHighlightCells(buildRangeCells(currentEntity.x, currentEntity.y, currentEntity.attackRange, mapData.width, mapData.height))
    setHighlightMode('attack')
    setErrorMessage(null)
  }

  const handleEntityClick = async (entityId: string) => {
    if (!gameId || !currentEntity) return
    if (interactionMode === 'attacking') {
      try {
        const newState = await basicAttack(gameId, currentEntity.id, entityId)
        updateState(newState)
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
      }
    } else {
      // 查看模式：选中目标实体
      setSelectedEntityId(entityId === selectedEntityId ? null : entityId)
    }
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
    // single or emptyCell
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
    setHighlightCells(new Set())
    setHighlightMode(null)
  }

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
  const portraitUrl = currentActor ? portraitImageUrls[currentActor.id] : null

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
            tokenImageUrls={tokenImageUrls}
            onCellClick={handleCellClick}
            onEntityClick={handleEntityClick}
          />

          {/* 行动提示与取消 */}
          {interactionMode !== 'idle' && interactionMode !== 'skill-direction' && (
            <div className="board-interaction-hint">
              <span>
                {interactionMode === 'moving' && '选择目标格子移动（蓝色高亮）'}
                {interactionMode === 'attacking' && '点击目标发动攻击（红色高亮）'}
                {interactionMode === 'skill-target' && '点击目标释放技能（紫色高亮）'}
              </span>
              <button className="btn btn-danger btn-sm" onClick={cancelInteraction}>
                取消
              </button>
            </div>
          )}
        </div>

        {/* 右侧：角色面板 */}
        <div className="battle-panel-area">
          <EntityPanel
            entity={currentActor}
            portraitImageUrl={portraitUrl}
            templates={templates}
            selectedSkillId={selectedSkill?.instanceId ?? null}
            onSkillClick={handleSkillClick}
            onBasicAttack={handleAttackMode}
            onDigTreasure={handleDigClick}
            onEndAction={handleEndAction}
            interactionMode={interactionMode}
            errorMessage={errorMessage}
          />

          {/* 移动按钮 */}
          {!gameState.isFinished && currentActor && (
            <div className="panel-move-btn-wrap">
              <button
                className={`btn ${interactionMode === 'moving' ? 'btn-active' : 'btn-secondary'} btn-full`}
                onClick={interactionMode === 'moving' ? cancelInteraction : handleMoveMode}
              >
                {interactionMode === 'moving' ? '取消移动' : '🚶 移动'}
              </button>
            </div>
          )}
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
            <div className="modal-title">🎁 选择挖宝目标</div>
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
            <div className="victory-title">🏆 游戏结束</div>
            {gameState.winnerGroup.length > 0 && (
              <div className="victory-winner">
                胜利阵营：{gameState.winnerGroup.join(', ')}
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
