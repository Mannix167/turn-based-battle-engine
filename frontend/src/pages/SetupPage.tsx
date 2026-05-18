import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMaps } from '../api/maps'
import { listCharacters } from '../api/characters'
import { listEnabledSkillTemplates } from '../api/skills'
import { startGame } from '../api/game'
import type { MapRead } from '../types/map'
import type { CharacterRead } from '../types/character'
import type { SkillTemplateRead } from '../types/skill'
import { TARGET_TYPE_LABELS } from '../types/skill'

type Step = 1 | 2 | 3

interface CharacterSkillSelection {
  characterId: string
  skillTemplateIds: string[]
}

export default function SetupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)

  // Step 1
  const [maps, setMaps] = useState<MapRead[]>([])
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)

  // Step 2
  const [characters, setCharacters] = useState<CharacterRead[]>([])
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([])
  const [commonSkills, setCommonSkills] = useState<SkillTemplateRead[]>([])
  const [charSkills, setCharSkills] = useState<CharacterSkillSelection[]>([])
  const [collapsedSkillLists, setCollapsedSkillLists] = useState<Record<string, boolean>>({})

  // Step 3
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})
  const [placingCharId, setPlacingCharId] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listMaps(), listCharacters(), listEnabledSkillTemplates()]).then(
      ([m, c, s]) => {
        setMaps(m)
        setCharacters(c)
        setCommonSkills(s.filter((t) => t.category === 'common' && t.usableAs.includes('common')))
      }
    )
  }, [])

  // ——— Step 1 ———
  const handleSelectMap = (id: string) => setSelectedMapId(id)

  const goStep2 = () => {
    if (!selectedMapId) return
    setStep(2)
    setError(null)
  }

  // ——— Step 2 ———
  const toggleChar = (id: string) => {
    setSelectedCharIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
    setCharSkills((prev) => {
      if (prev.find((s) => s.characterId === id)) {
        return prev.filter((s) => s.characterId !== id)
      }
      return [...prev, { characterId: id, skillTemplateIds: [] }]
    })
  }

  const toggleCharSkill = (charId: string, skillId: string) => {
    setCharSkills((prev) =>
      prev.map((s) => {
        if (s.characterId !== charId) return s
        const ids = s.skillTemplateIds.includes(skillId)
          ? s.skillTemplateIds.filter((id) => id !== skillId)
          : [...s.skillTemplateIds, skillId]
        return { ...s, skillTemplateIds: ids }
      })
    )
  }

  const toggleSkillListCollapsed = (charId: string) => {
    setCollapsedSkillLists((prev) => ({ ...prev, [charId]: !prev[charId] }))
  }

  const goStep3 = () => {
    if (selectedCharIds.length < 2) {
      setError('至少选择 2 个角色')
      return
    }
    setError(null)
    setPositions({})
    setPlacingCharId(selectedCharIds[0])
    setStep(3)
  }

  // ——— Step 3 ———
  const selectedMap = maps.find((m) => m.id === selectedMapId)

  const isValidCell = (x: number, y: number): boolean => {
    if (!selectedMap) return false
    if (selectedMap.validCells.length === 0) return true
    return selectedMap.validCells.some((c) => c.x === x && c.y === y)
  }

  const isOccupied = (x: number, y: number): boolean => {
    return Object.values(positions).some((p) => p.x === x && p.y === y)
  }

  const handleCellClick = (x: number, y: number) => {
    if (!placingCharId) return
    if (!isValidCell(x, y)) return
    if (isOccupied(x, y)) return
    setPositions((prev) => ({ ...prev, [placingCharId]: { x, y } }))
    // 自动切到下一个未部署角色
    const unplaced = selectedCharIds.filter(
      (id) => id !== placingCharId && !positions[id]
    )
    // 当前角色刚部署，从整体找下一个
    const allUnplaced = selectedCharIds.filter(
      (id) => id !== placingCharId && !{ ...positions, [placingCharId]: { x, y } }[id]
    )
    setPlacingCharId(allUnplaced[0] ?? null)
  }

  const getCharName = (id: string) => characters.find((c) => c.id === id)?.name ?? id

  const handleStartGame = async () => {
    if (!selectedMapId) return
    const allPlaced = selectedCharIds.every((id) => positions[id])
    if (!allPlaced) {
      setError('请为所有角色分配初始位置')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const state = await startGame({
        mapId: selectedMapId,
        entityIds: selectedCharIds,
        positions,
        selectedSkillTemplateIds: Object.fromEntries(
          charSkills.map((selection) => [selection.characterId, selection.skillTemplateIds])
        ),
      })
      navigate(`/battle/${state.gameId}`)
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined
      setError(`启动游戏失败：${detail ?? '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          ← 返回首页
        </button>
        <h2 className="setup-title">新建游戏</h2>
        <div className="setup-steps">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className={`setup-step-dot ${step === s ? 'active' : step > s ? 'done' : ''}`}>
              {s}
            </div>
          ))}
        </div>
      </div>

      {error && <div className="setup-error">{error}</div>}

      {/* ===== Step 1: 选择地图 ===== */}
      {step === 1 && (
        <div className="setup-body">
          <h3 className="setup-step-title">第一步：选择地图</h3>
          <div className="map-grid">
            {maps.map((m) => (
              <div
                key={m.id}
                className={`map-card ${selectedMapId === m.id ? 'selected' : ''}`}
                onClick={() => handleSelectMap(m.id)}
              >
                <div className="map-card-preview">
                  <div
                    className="map-mini-grid"
                    style={{ gridTemplateColumns: `repeat(${Math.min(m.width, 8)}, 1fr)` }}
                  >
                    {Array.from({ length: Math.min(m.height, 8) }).map((_, y) =>
                      Array.from({ length: Math.min(m.width, 8) }).map((_, x) => {
                        const valid =
                          m.validCells.length === 0 ||
                          m.validCells.some((c) => c.x === x && c.y === y)
                        return (
                          <div
                            key={`${x}-${y}`}
                            className={`map-mini-cell ${valid ? 'valid' : 'invalid'}`}
                          />
                        )
                      })
                    )}
                  </div>
                </div>
                <div className="map-card-info">
                  <div className="map-card-name">{m.name}</div>
                  <div className="map-card-size">
                    {m.width} × {m.height}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="setup-footer">
            <button
              className="btn btn-primary btn-large"
              onClick={goStep2}
              disabled={!selectedMapId}
            >
              下一步：选择角色 →
            </button>
          </div>
        </div>
      )}

      {/* ===== Step 2: 选择角色与技能 ===== */}
      {step === 2 && (
        <div className="setup-body">
          <h3 className="setup-step-title">第二步：选择参战角色与通用技能</h3>
          <p className="setup-hint">至少选择 2 个角色，并为每个角色选择开局通用技能（可不选）</p>
          <div className="char-select-list">
            {characters.length === 0 && (
              <p className="empty-text">暂无角色，请先在角色编辑器中创建角色</p>
            )}
            {characters.map((char) => {
              const isSelected = selectedCharIds.includes(char.id)
              const skillSel = charSkills.find((s) => s.characterId === char.id)
              return (
                <div
                  key={char.id}
                  className={`char-select-item ${isSelected ? 'selected' : ''}`}
                >
                  <div className="char-select-header" onClick={() => toggleChar(char.id)}>
                    <div className="char-select-check">
                      <input type="checkbox" readOnly checked={isSelected} />
                    </div>
                    <div className="char-select-portrait">
                      {char.portraitImageUrl ? (
                        <img src={char.portraitImageUrl} alt={char.name} />
                      ) : (
                        <div className="portrait-placeholder-sm">
                          {char.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="char-select-info">
                      <div className="char-select-name">{char.name}</div>
                      <div className="char-select-stats">
                        HP:{char.maxHp} ATK:{char.baseAttack} DEF:{char.baseDefense} SPD:{char.speed}
                      </div>
                    </div>
                  </div>
                  {isSelected && commonSkills.length > 0 && (
                    <div className="char-skill-select">
                      <div className="char-skill-label">
                        <span>开局通用技能</span>
                        <span className="char-skill-count">已选 {skillSel?.skillTemplateIds.length ?? 0}</span>
                        <button
                          type="button"
                          className="skill-list-collapse-btn"
                          onClick={() => toggleSkillListCollapsed(char.id)}
                        >
                          {collapsedSkillLists[char.id] ? '展开' : '收起'}
                        </button>
                      </div>
                      {!collapsedSkillLists[char.id] && <div className="setup-skill-card-grid">
                        {commonSkills.map((tmpl) => {
                          const checked = skillSel?.skillTemplateIds.includes(tmpl.id) ?? false
                          return (
                            <button
                              key={tmpl.id}
                              type="button"
                              className={`setup-skill-card ${checked ? 'checked' : ''}`}
                              onClick={() => toggleCharSkill(char.id, tmpl.id)}
                            >
                              <span className="setup-skill-check" aria-hidden="true" />
                              <span className="setup-skill-icon">
                                {tmpl.iconUrl ? <img src={tmpl.iconUrl} alt={tmpl.name} /> : '技'}
                              </span>
                              <span className="setup-skill-info">
                                <span className="setup-skill-name">{tmpl.name}</span>
                                <span className="setup-skill-desc">{tmpl.description || '暂无技能描述'}</span>
                                <span className="setup-skill-meta">
                                  <span>行动 {tmpl.cost}</span>
                                  <span>范围 {tmpl.range}</span>
                                  <span>{TARGET_TYPE_LABELS[tmpl.targetType]}</span>
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="setup-footer">
            <button className="btn btn-secondary" onClick={() => setStep(1)}>
              ← 上一步
            </button>
            <button
              className="btn btn-primary btn-large"
              onClick={goStep3}
              disabled={selectedCharIds.length < 2}
            >
              下一步：初始部署 →
            </button>
          </div>
        </div>
      )}

      {/* ===== Step 3: 初始部署 ===== */}
      {step === 3 && selectedMap && (
        <div className="setup-body">
          <h3 className="setup-step-title">第三步：初始部署</h3>
          <p className="setup-hint">
            {placingCharId
              ? `正在放置：${getCharName(placingCharId)}（点击地图格子）`
              : '所有角色已部署，可以开始游戏'}
          </p>
          <div className="deploy-layout">
            <div className="deploy-board-wrap">
              <div
                className="deploy-board"
                style={{
                  gridTemplateColumns: `repeat(${selectedMap.width}, 1fr)`,
                  gridTemplateRows: `repeat(${selectedMap.height}, 1fr)`,
                  width: `${Math.min(selectedMap.width * 52, 520)}px`,
                  height: `${Math.min(selectedMap.height * 52, 520)}px`,
                }}
              >
                {Array.from({ length: selectedMap.height }).map((_, y) =>
                  Array.from({ length: selectedMap.width }).map((_, x) => {
                    const valid = isValidCell(x, y)
                    const occ = Object.entries(positions).find(([, p]) => p.x === x && p.y === y)
                    const isPlacing = placingCharId !== null && valid && !occ
                    return (
                      <div
                        key={`${x}-${y}`}
                        className={`deploy-cell ${!valid ? 'invalid' : ''} ${isPlacing ? 'placeable' : ''} ${occ ? 'occupied' : ''}`}
                        onClick={() => handleCellClick(x, y)}
                        title={occ ? getCharName(occ[0]) : `(${x},${y})`}
                      >
                        {occ && (
                          <div className="deploy-token">
                            {(() => {
                              const c = characters.find((ch) => ch.id === occ[0])
                              return c?.tokenImageUrl ? (
                                <img src={c.tokenImageUrl} alt={c.name} />
                              ) : (
                                <span>{getCharName(occ[0]).charAt(0).toUpperCase()}</span>
                              )
                            })()}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
            <div className="deploy-sidebar">
              <div className="deploy-char-list">
                {selectedCharIds.map((id) => {
                  const pos = positions[id]
                  const isPlacing = placingCharId === id
                  return (
                    <div
                      key={id}
                      className={`deploy-char-item ${isPlacing ? 'placing' : ''} ${pos ? 'placed' : ''}`}
                      onClick={() => !pos && setPlacingCharId(id)}
                    >
                      <div className="deploy-char-name">{getCharName(id)}</div>
                      <div className="deploy-char-status">
                        {pos ? `已部署 (${pos.x},${pos.y})` : isPlacing ? '放置中...' : '待部署'}
                      </div>
                      {pos && (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setPositions((prev) => {
                              const next = { ...prev }
                              delete next[id]
                              return next
                            })
                            setPlacingCharId(id)
                          }}
                        >
                          撤回
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="setup-footer">
            <button className="btn btn-secondary" onClick={() => setStep(2)}>
              ← 上一步
            </button>
            <button
              className="btn btn-primary btn-large"
              onClick={handleStartGame}
              disabled={loading || !selectedCharIds.every((id) => positions[id])}
            >
              {loading ? '启动中...' : '开始游戏！'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
