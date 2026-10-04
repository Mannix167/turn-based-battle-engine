import GameImage from '../components/GameImage'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listMaps } from '../api/maps'
import { listCharacters } from '../api/characters'
import { listEnabledSkillTemplates } from '../api/skills'
import { previewStart, startGame } from '../api/game'
import { listMonsterTemplates } from '../api/monsters'
import type { MapRead, TerrainType } from '../types/map'
import { TERRAIN_DEFINITIONS, getTerrainTooltip } from '../data/terrain'
import type { CharacterRead } from '../types/character'
import type { Rarity, SkillCategory, SkillTemplateRead } from '../types/skill'
import { RARITY_COLORS, RARITY_LABELS, SKILL_CATEGORY_LABELS } from '../types/skill'
import type { MonsterTemplateRead } from '../types/monster'
import type { Faction, Position, PreviewStartResponse, StartGameRequest } from '../types/game'

type SetupStep = 1 | 2 | 3 | 4 | 5

export default function SetupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<SetupStep>(1)
  const [maps, setMaps] = useState<MapRead[]>([])
  const [characters, setCharacters] = useState<CharacterRead[]>([])
  const [skills, setSkills] = useState<SkillTemplateRead[]>([])
  const [monsters, setMonsters] = useState<MonsterTemplateRead[]>([])
  const [selectedMapId, setSelectedMapId] = useState('')
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>([])
  const [positions, setPositions] = useState<Record<string, Position>>({})
  const [placingCharId, setPlacingCharId] = useState<string | null>(null)
  const [selectedSkillIds, setSelectedSkillIds] = useState<Record<string, string[]>>({})
  const [factions, setFactions] = useState<Faction[]>([])
  const [characterFactionAssignments, setCharacterFactionAssignments] = useState<Record<string, string>>({})
  const [collapsedSkillLists, setCollapsedSkillLists] = useState<Record<string, boolean>>({})
  const [skillConfigCharId, setSkillConfigCharId] = useState<string | null>(null)
  const [skillSearch, setSkillSearch] = useState('')
  const [skillRarityFilter, setSkillRarityFilter] = useState<'all' | Rarity>('all')
  const [skillCategoryFilter, setSkillCategoryFilter] = useState<'all' | SkillCategory>('all')
  const [randomMonsterCount, setRandomMonsterCount] = useState(2)
  const [randomTreasureCount, setRandomTreasureCount] = useState(1)
  const [monsterPoolIds, setMonsterPoolIds] = useState<string[]>([])
  const [rewardPoolIds, setRewardPoolIds] = useState<string[]>([])
  const [seed, setSeed] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewStartResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([listMaps(), listCharacters(), listEnabledSkillTemplates(), listMonsterTemplates(false)])
      .then(([mapData, characterData, skillData, monsterData]) => {
        setMaps(mapData)
        setCharacters(characterData)
        setSkills(skillData)
        setMonsters(monsterData.filter((monster) => monster.enabled))
        setSelectedMapId(mapData[0]?.id ?? '')
      })
      .catch(() => setError('无法加载开局配置数据，请确认后端已启动'))
  }, [])

  const selectedMap = useMemo(() => maps.find((map) => map.id === selectedMapId) ?? null, [maps, selectedMapId])
  const commonSkills = useMemo(
    () => skills.filter((skill) => skill.enabled && skill.usableAs.includes('common')),
    [skills]
  )
  const rewardSkills = useMemo(
    () => skills.filter((skill) => skill.enabled && (skill.usableAs.includes('common') || skill.usableAs.includes('reward'))),
    [skills]
  )

  const requestPayload = (overrideSeed: string | null = seed): StartGameRequest => ({
    mapTemplateId: selectedMapId,
    selectedCharacterIds: selectedCharIds,
    positions,
    selectedCommonSkillIdsByCharacterId: selectedSkillIds,
    randomMonsterCount,
    randomTreasureCount,
    monsterTemplatePoolIds: monsterPoolIds,
    rewardSkillPoolTemplateIds: rewardPoolIds,
    factions,
    characterFactionAssignments,
    startSeed: overrideSeed,
  })

  const isCellEnabled = (x: number, y: number) => {
    if (!selectedMap) return false
    const cell = selectedMap.cells.find((item) => item.x === x && item.y === y)
    if (cell) return cell.enabled
    return selectedMap.validCells.length === 0 || selectedMap.validCells.some((cell) => cell.x === x && cell.y === y)
  }

  const terrainAt = (x: number, y: number): TerrainType => {
    const cell = selectedMap?.cells.find((item) => item.x === x && item.y === y)
    return cell?.terrainType ?? 'normal'
  }

  const fixedAt = (x: number, y: number) => selectedMap?.fixedEntities.find((entity) => entity.x === x && entity.y === y)
  const placedAt = (x: number, y: number) => Object.entries(positions).find(([, pos]) => pos.x === x && pos.y === y)
  const previewMonsterAt = (x: number, y: number) => preview?.previewMonsters.find((item) => item.position.x === x && item.position.y === y)
  const previewTreasureAt = (x: number, y: number) => preview?.previewTreasures.find((item) => item.position.x === x && item.position.y === y)

  const toggleCharacter = (id: string) => {
    setPreview(null)
    setSelectedCharIds((prev) => {
      if (prev.includes(id)) {
        setPositions((current) => {
          const next = { ...current }
          delete next[id]
          return next
        })
        return prev.filter((item) => item !== id)
      }
      setCharacterFactionAssignments((current) => ({
        ...current,
        [id]: current[id] ?? `faction_${id}`,
      }))
      setPlacingCharId(id)
      setSkillConfigCharId((current) => current ?? id)
      return [...prev, id]
    })
  }

  useEffect(() => {
    if (selectedCharIds.length === 0) {
      setSkillConfigCharId(null)
      return
    }
    if (!skillConfigCharId || !selectedCharIds.includes(skillConfigCharId)) {
      setSkillConfigCharId(selectedCharIds[0])
    }
  }, [selectedCharIds, skillConfigCharId])

  useEffect(() => {
    const palette = ['#22c55e', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#14b8a6']
    setFactions((current) => {
      const next = [...current]
      selectedCharIds.forEach((id, index) => {
        const factionId = characterFactionAssignments[id] ?? `faction_${id}`
        if (!next.some((faction) => faction.id === factionId)) {
          next.push({ id: factionId, name: getCharacterName(characters, id), color: palette[index % palette.length] })
        }
      })
      return next
    })
  }, [selectedCharIds, characterFactionAssignments, characters])

  const setIndependentFactions = () => {
    setCharacterFactionAssignments(Object.fromEntries(selectedCharIds.map((id) => [id, `faction_${id}`])))
  }

  const setAllSameFaction = () => {
    setFactions((current) => current.some((faction) => faction.id === 'faction_players') ? current : [{ id: 'faction_players', name: '玩家阵营', color: '#22c55e' }, ...current])
    setCharacterFactionAssignments(Object.fromEntries(selectedCharIds.map((id) => [id, 'faction_players'])))
  }

  const changeCharacterSkillQuantity = (characterId: string, skillId: string, delta: number) => {
    setPreview(null)
    setSelectedSkillIds((prev) => {
      const current = prev[characterId] ?? []
      const skill = commonSkills.find((item) => item.id === skillId)
      const character = characters.find((item) => item.id === characterId)
      if (!skill || !character) return prev
      const quantity = current.filter((id) => id === skillId).length
      if (delta > 0) {
        if (quantity >= 3) return prev
        const used = current.reduce((sum, id) => sum + (commonSkills.find((item) => item.id === id)?.skillPointCost ?? 0), 0)
        if (used + skill.skillPointCost > character.skillPointCapacity) return prev
        return { ...prev, [characterId]: [...current, skillId] }
      }
      return {
        ...prev,
        [characterId]: removeOne(current, skillId),
      }
    })
  }

  const togglePoolItem = (id: string, values: string[], setValues: (next: string[]) => void) => {
    setPreview(null)
    setValues(values.includes(id) ? values.filter((item) => item !== id) : [...values, id])
  }

  const placeCharacter = (x: number, y: number) => {
    if (!placingCharId || !isCellEnabled(x, y) || fixedAt(x, y) || placedAt(x, y)) return
    const terrainDef = TERRAIN_DEFINITIONS[terrainAt(x, y)]
    if (!terrainDef.walkable || terrainDef.blocksPlacement) return
    if (terrainDef.dangerous && !window.confirm(`该格为${terrainDef.name}，确定部署吗？\n${terrainDef.tooltipLines.join('\n')}`)) return
    const nextPositions = { ...positions, [placingCharId]: { x, y } }
    setPositions(nextPositions)
    setPreview(null)
    setPlacingCharId(selectedCharIds.find((id) => id !== placingCharId && !nextPositions[id]) ?? null)
  }

  const undoPlacement = (characterId: string) => {
    setPositions((current) => {
      const next = { ...current }
      delete next[characterId]
      return next
    })
    setPreview(null)
    setPlacingCharId(characterId)
  }

  const validateStep = (target: SetupStep): boolean => {
    setError(null)
    if (target > 1 && !selectedMapId) {
      setError('请先选择地图')
      return false
    }
    if (target > 2 && selectedCharIds.length === 0) {
      setError('请至少选择一个出战角色')
      return false
    }
    if (target > 4 && !selectedCharIds.every((id) => positions[id])) {
      setError('请为所有出战角色设置初始位置')
      return false
    }
    return true
  }

  const goStep = (target: SetupStep) => {
    if (validateStep(target)) setStep(target)
  }

  const runPreview = async (nextSeed: string | null = seed) => {
    if (!selectedMapId || selectedCharIds.length === 0) {
      setError('请选择地图和至少一个角色')
      return
    }
    if (!selectedCharIds.every((id) => positions[id])) {
      setError('请为所有出战角色设置初始位置')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await previewStart(requestPayload(nextSeed))
      setPreview(data)
      setSeed(data.startSeed)
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  const beginGame = async () => {
    if (!selectedCharIds.every((id) => positions[id])) {
      setError('请为所有出战角色设置初始位置')
      setStep(4)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const readyPreview = preview ?? await previewStart(requestPayload(seed))
      setPreview(readyPreview)
      setSeed(readyPreview.startSeed)
      const state = await startGame(requestPayload(readyPreview.startSeed))
      navigate(`/battle/${state.gameId}`)
    } catch (err: unknown) {
      setError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="setup-page start-wizard-page">
      <header className="start-wizard-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>返回首页</button>
        <div className="start-wizard-title">
          <span>开局配置</span>
          <strong>{selectedMap?.name ?? '选择战场'}</strong>
        </div>
        <div className="start-wizard-steps">
          {[
            [1, '地图'],
            [2, '角色'],
            [3, '技能'],
            [4, '随机部署'],
            [5, '确认'],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`wizard-step ${step === value ? 'active' : step > Number(value) ? 'done' : ''}`}
              onClick={() => goStep(value as SetupStep)}
            >
              <span>{value}</span>{label}
            </button>
          ))}
        </div>
      </header>

      {error && <div className="setup-error">{error}</div>}

      <main className="start-wizard-body">
        {step === 1 && (
          <section className="wizard-stage map-stage">
            <div className="map-stage-list">
              <h3>选择地图</h3>
              {maps.map((map) => (
                <button
                  key={map.id}
                  className={`map-choice-row ${selectedMapId === map.id ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedMapId(map.id)
                    setPreview(null)
                  }}
                >
                  <strong>{map.name}</strong>
                  <span>{map.width} x {map.height} / 可用格 {map.validCells.length || map.cells.filter((cell) => cell.enabled).length}</span>
                </button>
              ))}
            </div>
            <div className="map-stage-preview">
              <h3>地图预览</h3>
              <SetupBoard
                map={selectedMap}
                characters={characters}
                positions={{}}
                isCellEnabled={isCellEnabled}
                terrainAt={terrainAt}
              />
            </div>
            <WizardNav step={step} canNext={Boolean(selectedMapId)} onPrev={() => goStep(1)} onNext={() => goStep(2)} />
          </section>
        )}

        {step === 2 && (
          <section className="wizard-stage character-stage">
            <div className="wizard-stage-head">
              <div>
                <h3>选择出战角色</h3>
                <p>先确定队伍成员。下一步会为每位角色配置开局通用技能。</p>
              </div>
            </div>
            <div className="setup-character-grid">
              {characters.map((character) => (
                <CharacterPickCard
                  key={character.id}
                  character={character}
                  selected={selectedCharIds.includes(character.id)}
                  onToggle={() => toggleCharacter(character.id)}
                />
              ))}
            </div>
            {selectedCharIds.length > 0 && (
              <div className="start-section compact">
                <div className="start-section-head">
                  <h3>阵营设置</h3>
                  <div className="faction-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={setIndependentFactions}>独立阵营</button>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={setAllSameFaction}>全部同阵营</button>
                  </div>
                </div>
                <div className="faction-assignment-list">
                  {factions.filter((faction) => faction.id !== 'monster').map((faction) => (
                    <div key={faction.id} className="faction-edit-row">
                      <input
                        className="form-input"
                        value={faction.name}
                        onChange={(event) => setFactions((current) => current.map((item) => item.id === faction.id ? { ...item, name: event.target.value } : item))}
                      />
                      <input
                        className="form-input faction-color-input"
                        type="color"
                        value={faction.color}
                        onChange={(event) => setFactions((current) => current.map((item) => item.id === faction.id ? { ...item, color: event.target.value } : item))}
                      />
                    </div>
                  ))}
                  {selectedCharIds.map((id) => (
                    <label key={id} className="form-row">
                      <span className="form-label">{getCharacterName(characters, id)}</span>
                      <select
                        className="form-input"
                        value={characterFactionAssignments[id] ?? `faction_${id}`}
                        onChange={(event) => setCharacterFactionAssignments((current) => ({ ...current, [id]: event.target.value }))}
                      >
                        {factions.map((faction) => (
                          <option key={faction.id} value={faction.id}>{faction.name}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <WizardNav step={step} canNext={selectedCharIds.length > 0} onPrev={() => goStep(1)} onNext={() => goStep(3)} />
          </section>
        )}

        {step === 3 && (
          <section className="wizard-stage skill-stage refined-skill-stage">
            <div className="wizard-stage-head">
              <div>
                <h3>配置开局技能</h3>
                <p>选择一名角色，再从右侧技能库中勾选开局携带的通用技能。</p>
              </div>
            </div>
            <div className="skill-loadout-layout">
              <div className="skill-loadout-roster">
                {selectedCharIds.map((id) => {
                  const character = characters.find((item) => item.id === id)
                  if (!character) return null
                  const count = selectedSkillIds[id]?.length ?? 0
                  return (
                    <button
                      key={id}
                      className={`loadout-roster-card ${skillConfigCharId === id ? 'active' : ''}`}
                      onClick={() => setSkillConfigCharId(id)}
                    >
                      <span className="loadout-avatar">
                        {character.tokenImageUrl ? <GameImage src={character.tokenImageUrl} alt={character.name} /> : character.name.charAt(0)}
                      </span>
                      <span>
                        <strong>{character.name}</strong>
                        <small>已选 {count} 个技能</small>
                      </span>
                    </button>
                  )
                })}
              </div>
              {skillConfigCharId && (
                <SkillLoadoutPanel
                  character={characters.find((item) => item.id === skillConfigCharId) ?? null}
                  skills={commonSkills}
                  selectedSkillIds={selectedSkillIds[skillConfigCharId] ?? []}
                  search={skillSearch}
                  rarityFilter={skillRarityFilter}
                  categoryFilter={skillCategoryFilter}
                  onSearchChange={setSkillSearch}
                  onRarityFilterChange={setSkillRarityFilter}
                  onCategoryFilterChange={setSkillCategoryFilter}
                  collapsed={collapsedSkillLists[skillConfigCharId] ?? false}
                  onToggleCollapse={() => setCollapsedSkillLists((prev) => ({ ...prev, [skillConfigCharId]: !prev[skillConfigCharId] }))}
                  onChangeSkillQuantity={(skillId, delta) => changeCharacterSkillQuantity(skillConfigCharId, skillId, delta)}
                />
              )}
            </div>
            <WizardNav step={step} canNext={selectedCharIds.length > 0} onPrev={() => goStep(2)} onNext={() => goStep(4)} />
          </section>
        )}

        {step === 4 && (
          <section className="wizard-stage deploy-stage">
            <div className="deploy-stage-board">
              <div className="wizard-stage-head">
                <div>
                  <h3>随机性与初始部署</h3>
                  <p>{placingCharId ? `正在部署：${getCharacterName(characters, placingCharId)}` : '点击角色条可重新选择部署对象'}</p>
                </div>
                <button className="btn btn-primary" onClick={() => runPreview(seed)} disabled={loading || !selectedCharIds.every((id) => positions[id])}>随机预览</button>
              </div>
              <SetupBoard
                map={selectedMap}
                characters={characters}
                positions={positions}
                placingCharId={placingCharId}
                preview={preview}
                isCellEnabled={isCellEnabled}
                terrainAt={terrainAt}
                fixedAt={fixedAt}
                placedAt={placedAt}
                previewMonsterAt={previewMonsterAt}
                previewTreasureAt={previewTreasureAt}
                onCellClick={placeCharacter}
              />
              <div className="deploy-roster">
                {selectedCharIds.map((id) => {
                  const pos = positions[id]
                  return (
                    <button
                      key={id}
                      className={`deploy-roster-item ${placingCharId === id ? 'active' : ''} ${pos ? 'placed' : ''}`}
                      onClick={() => setPlacingCharId(id)}
                    >
                      <span className="deploy-roster-avatar">
                        {getCharacterImage(characters, id) ? <GameImage src={getCharacterImage(characters, id) ?? ''} alt={getCharacterName(characters, id)} /> : getCharacterName(characters, id).charAt(0)}
                      </span>
                      <span className="deploy-roster-copy">
                        <strong>{getCharacterName(characters, id)}</strong>
                        <small>{pos ? `(${pos.x}, ${pos.y})` : '待部署'}</small>
                      </span>
                      {pos && (
                        <span
                          role="button"
                          tabIndex={0}
                          className="deploy-undo"
                          onClick={(event) => {
                            event.stopPropagation()
                            undoPlacement(id)
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              event.stopPropagation()
                              undoPlacement(id)
                            }
                          }}
                        >
                          撤销
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <aside className="deploy-stage-config">
              <div className="start-section compact">
                <h3>随机数量</h3>
                <label className="form-row">
                  <span className="form-label">随机小怪数量</span>
                  <input className="form-input" type="number" min={0} value={randomMonsterCount} onChange={(e) => { setRandomMonsterCount(Number(e.target.value)); setPreview(null) }} />
                </label>
                <label className="form-row">
                  <span className="form-label">随机藏宝点数量</span>
                  <input className="form-input" type="number" min={0} value={randomTreasureCount} onChange={(e) => { setRandomTreasureCount(Number(e.target.value)); setPreview(null) }} />
                </label>
                <label className="form-row">
                  <span className="form-label">Seed</span>
                  <input className="form-input" value={seed ?? ''} placeholder="留空自动生成" onChange={(e) => { setSeed(e.target.value || null); setPreview(null) }} />
                </label>
              </div>
              <PoolPanel
                title="小怪池"
                emptyHint="默认全部启用小怪"
                items={monsters.map((monster) => ({ id: monster.id, name: monster.name, meta: `HP ${monster.maxHp} / ATK ${monster.baseAttack}` }))}
                values={monsterPoolIds}
                onToggle={(id) => togglePoolItem(id, monsterPoolIds, setMonsterPoolIds)}
              />
              <PoolPanel
                title="奖励池"
                emptyHint="默认全部可奖励通用技能"
                items={rewardSkills.map((skill) => ({ id: skill.id, name: skill.name, meta: `费 ${skill.cost} / 距 ${skill.range}` }))}
                values={rewardPoolIds}
                onToggle={(id) => togglePoolItem(id, rewardPoolIds, setRewardPoolIds)}
              />
            </aside>

            <WizardNav step={step} canNext={selectedCharIds.every((id) => positions[id])} onPrev={() => goStep(3)} onNext={() => goStep(5)} />
          </section>
        )}

        {step === 5 && (
          <section className="wizard-stage confirm-stage">
            <div className="confirm-panel">
              <h3>确认开局</h3>
              <div className="confirm-layout">
                <div className="confirm-map-preview">
                  <SetupBoard
                    map={selectedMap}
                    characters={characters}
                    positions={positions}
                    preview={preview}
                    isCellEnabled={isCellEnabled}
                    terrainAt={terrainAt}
                    fixedAt={fixedAt}
                    placedAt={placedAt}
                    previewMonsterAt={previewMonsterAt}
                    previewTreasureAt={previewTreasureAt}
                  />
                </div>
                <div className="confirm-grid">
                  <SummaryTile label="地图" value={selectedMap?.name ?? '-'} />
                  <SummaryTile label="出战角色" value={`${selectedCharIds.length}`} />
                  <SummaryTile label="随机小怪" value={`${preview?.previewMonsters.length ?? randomMonsterCount}`} />
                  <SummaryTile label="随机宝点" value={`${preview?.previewTreasures.length ?? randomTreasureCount}`} />
                  <SummaryTile label="奖励池" value={`${preview?.rewardSkillPoolTemplateIds.length ?? (rewardPoolIds.length || rewardSkills.length)}`} />
                  <SummaryTile label="Seed" value={preview?.startSeed ?? seed ?? '自动'} />
                </div>
              </div>
              <div className="confirm-warning-list">
                {preview?.warnings.map((warning) => <span key={warning} className="warning-pill">{warning}</span>)}
                {!preview && <span className="muted-pill">尚未预览，开始游戏时会自动生成并固化随机结果</span>}
              </div>
              <div className="confirm-actions">
                <button className="btn btn-secondary" onClick={() => goStep(4)}>返回调整</button>
                <button className="btn btn-secondary" onClick={() => runPreview(null)} disabled={loading || !selectedCharIds.every((id) => positions[id])}>重新随机</button>
                <button className="btn btn-primary btn-large" onClick={beginGame} disabled={loading}>
                  {loading ? '启动中...' : '开始游戏'}
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function SetupBoard({
  map,
  characters,
  positions,
  placingCharId,
  preview,
  isCellEnabled,
  terrainAt,
  fixedAt,
  placedAt,
  previewMonsterAt,
  previewTreasureAt,
  onCellClick,
}: {
  map: MapRead | null
  characters: CharacterRead[]
  positions: Record<string, Position>
  placingCharId?: string | null
  preview?: PreviewStartResponse | null
  isCellEnabled: (x: number, y: number) => boolean
  terrainAt: (x: number, y: number) => TerrainType
  fixedAt?: (x: number, y: number) => MapRead['fixedEntities'][number] | undefined
  placedAt?: (x: number, y: number) => [string, Position] | undefined
  previewMonsterAt?: (x: number, y: number) => PreviewStartResponse['previewMonsters'][number] | undefined
  previewTreasureAt?: (x: number, y: number) => PreviewStartResponse['previewTreasures'][number] | undefined
  onCellClick?: (x: number, y: number) => void
}) {
  const [zoom, setZoom] = useState(1)
  const boardRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      setZoom((current) => Math.max(0.45, Math.min(2.25, current * (event.deltaY < 0 ? 1.1 : 0.9))))
    }
    board.addEventListener('wheel', onWheel, { passive: false })
    return () => board.removeEventListener('wheel', onWheel)
  }, [Boolean(map)])
  if (!map) return <div className="setup-empty-board">暂无地图</div>
  return (
    <div ref={boardRef} className="setup-board-frame setup-board-zoomable">
      <div className="setup-board-tools">
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(1)}>重置</button>
      </div>
      <div
        className="setup-big-board"
        style={{
          gridTemplateColumns: `repeat(${map.width}, minmax(30px, 1fr))`,
          transform: `scale(${zoom})`,
        }}
      >
        {Array.from({ length: map.height }).flatMap((_, y) =>
          Array.from({ length: map.width }).map((_, x) => {
            const enabled = isCellEnabled(x, y)
            const terrainType = terrainAt(x, y)
            const terrainDef = TERRAIN_DEFINITIONS[terrainType]
            const fixed = fixedAt?.(x, y)
            const placed = placedAt?.(x, y)
            const pMonster = previewMonsterAt?.(x, y)
            const pTreasure = previewTreasureAt?.(x, y)
            const placeable = Boolean(placingCharId && enabled && terrainDef.walkable && !terrainDef.blocksPlacement && !fixed && !placed)
            const title = `${x},${y}\n${getTerrainTooltip(terrainType)}`
            return (
              <button
                key={`${x}-${y}`}
                className={[
                  'setup-board-cell',
                  enabled ? 'enabled' : 'disabled',
                  terrainType !== 'normal' ? `cell-terrain-${terrainType}` : '',
                  terrainDef.dangerous ? 'cell-terrain-danger' : '',
                  placeable ? 'placeable' : '',
                ].filter(Boolean).join(' ')}
                style={{
                  backgroundImage: enabled && terrainType !== 'normal' ? `url(${terrainDef.imageUrl})` : undefined,
                }}
                title={title}
                onClick={() => onCellClick?.(x, y)}
              >
                {fixed?.type === 'monster' && <span className="setup-cell-token token-fixed-monster">M</span>}
                {fixed?.type === 'treasure' && <span className="setup-cell-token token-fixed-treasure">T</span>}
                {placed && (
                  <span className="setup-cell-token token-player setup-cell-avatar">
                    {getCharacterImage(characters, placed[0]) ? (
                      <GameImage src={getCharacterImage(characters, placed[0]) ?? ''} alt={getCharacterName(characters, placed[0])} />
                    ) : (
                      getCharacterName(characters, placed[0]).charAt(0)
                    )}
                  </span>
                )}
                {pMonster && <span className="setup-cell-token token-preview-monster">R</span>}
                {pTreasure && <span className="setup-cell-token token-preview-treasure">P</span>}
              </button>
            )
          })
        )}
      </div>
      {preview && (
        <div className="setup-board-preview-note">
          已预览：随机小怪 {preview.previewMonsters.length}，藏宝点 {preview.previewTreasures.length}
        </div>
      )}
    </div>
  )
}

function WizardNav({
  step,
  canNext,
  onPrev,
  onNext,
}: {
  step: SetupStep
  canNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="wizard-nav-row">
      <button className="btn btn-secondary" onClick={onPrev} disabled={step === 1}>上一步</button>
      <button className="btn btn-primary btn-large" onClick={onNext} disabled={!canNext}>
        下一步
      </button>
    </div>
  )
}

function CharacterPickCard({
  character,
  selected,
  onToggle,
}: {
  character: CharacterRead
  selected: boolean
  onToggle: () => void
}) {
  return (
    <button className={`setup-character-pick ${selected ? 'selected' : ''}`} onClick={onToggle}>
      <span className="setup-character-portrait">
        <GameImage fallbackKind="portrait" src={character.portraitImageUrl ?? character.tokenImageUrl} alt={character.name} />
      </span>
      <span className="setup-character-info">
        <strong>{character.name}</strong>
        <span className="rarity-pill" style={{ borderColor: RARITY_COLORS[character.rarity], color: RARITY_COLORS[character.rarity] }}>{RARITY_LABELS[character.rarity]}</span>
        <span>HP {character.maxHp} / ATK {character.baseAttack} / DEF {character.baseDefense}</span>
        <small>技能点 {character.skillPointCapacity} / SPD {character.speed} / CRIT {character.critRate}% / LUCK {character.luck}</small>
      </span>
      <span className="setup-character-state">{selected ? '已出战' : '加入队伍'}</span>
    </button>
  )
}

function SkillLoadoutPanel({
  character,
  skills,
  selectedSkillIds,
  search,
  rarityFilter,
  categoryFilter,
  onSearchChange,
  onRarityFilterChange,
  onCategoryFilterChange,
  collapsed,
  onToggleCollapse,
  onChangeSkillQuantity,
}: {
  character: CharacterRead | null
  skills: SkillTemplateRead[]
  selectedSkillIds: string[]
  search: string
  rarityFilter: 'all' | Rarity
  categoryFilter: 'all' | SkillCategory
  onSearchChange: (value: string) => void
  onRarityFilterChange: (value: 'all' | Rarity) => void
  onCategoryFilterChange: (value: 'all' | SkillCategory) => void
  collapsed: boolean
  onToggleCollapse: () => void
  onChangeSkillQuantity: (skillId: string, delta: number) => void
}) {
  if (!character) return <div className="skill-loadout-panel empty">请选择角色</div>
  const usedPoints = selectedSkillIds.reduce((sum, id) => sum + (skills.find((skill) => skill.id === id)?.skillPointCost ?? 0), 0)
  const remainingPoints = Math.max(0, character.skillPointCapacity - usedPoints)
  const filteredSkills = skills.filter((skill) => {
    const q = search.trim().toLowerCase()
    if (q && !skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) return false
    if (rarityFilter !== 'all' && skill.rarity !== rarityFilter) return false
    if (categoryFilter !== 'all' && !skill.categories.includes(categoryFilter)) return false
    return true
  })
  return (
    <article className="skill-loadout-panel">
      <header className="skill-loadout-head">
        <div className="loadout-hero">
          <span className="loadout-hero-avatar">
            {character.tokenImageUrl ? <GameImage src={character.tokenImageUrl} alt={character.name} /> : character.name.charAt(0)}
          </span>
          <div>
            <span>正在配置</span>
            <strong>{character.name}</strong>
            <small>技能点 {usedPoints} / {character.skillPointCapacity}，剩余 {remainingPoints}</small>
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onToggleCollapse}>
          {collapsed ? '展开技能库' : '收起技能库'}
        </button>
      </header>
      {!collapsed && (
        <>
        <div className="loadout-filter-row">
          <input className="form-input" value={search} onChange={(e) => onSearchChange(e.target.value)} placeholder="搜索技能名称或描述" />
          <select className="form-input" value={rarityFilter} onChange={(e) => onRarityFilterChange(e.target.value as 'all' | Rarity)}>
            <option value="all">全部稀有度</option>
            {(Object.keys(RARITY_LABELS) as Rarity[]).map((rarity) => <option key={rarity} value={rarity}>{RARITY_LABELS[rarity]}</option>)}
          </select>
          <select className="form-input" value={categoryFilter} onChange={(e) => onCategoryFilterChange(e.target.value as 'all' | SkillCategory)}>
            <option value="all">全部分类</option>
            {(Object.keys(SKILL_CATEGORY_LABELS) as SkillCategory[]).map((category) => <option key={category} value={category}>{SKILL_CATEGORY_LABELS[category]}</option>)}
          </select>
        </div>
        <div className="loadout-skill-board">
          {filteredSkills.map((skill) => {
            const quantity = selectedSkillIds.filter((id) => id === skill.id).length
            const canAdd = quantity < 3 && usedPoints + skill.skillPointCost <= character.skillPointCapacity
            return (
              <div
                key={skill.id}
                role="button"
                tabIndex={0}
                className={`loadout-skill-card ${quantity > 0 ? 'checked' : ''}`}
                onClick={() => canAdd && onChangeSkillQuantity(skill.id, 1)}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && canAdd) onChangeSkillQuantity(skill.id, 1)
                }}
              >
                <span className="loadout-skill-icon">
                  <GameImage fallbackKind="skill" src={skill.iconUrl} alt={skill.name} />
                </span>
                <span className="loadout-skill-main">
                  <strong>
                    {skill.name}
                    <span className="rarity-pill" style={{ borderColor: RARITY_COLORS[skill.rarity], color: RARITY_COLORS[skill.rarity] }}>{RARITY_LABELS[skill.rarity]}</span>
                  </strong>
                  <span>{skill.description || '暂无技能描述'}</span>
                  <small>技能点 {skill.skillPointCost} / AP {skill.cost} / 范围 {skill.range}</small>
                </span>
                <span className="skill-quantity-control" onClick={(event) => event.stopPropagation()}>
                  <button type="button" disabled={quantity <= 0} onClick={() => onChangeSkillQuantity(skill.id, -1)}>-</button>
                  <b>{quantity}</b>
                  <button type="button" disabled={!canAdd} onClick={() => onChangeSkillQuantity(skill.id, 1)}>+</button>
                </span>
              </div>
            )
          })}
        </div>
        </>
      )}
    </article>
  )
}

function removeOne(values: string[], id: string): string[] {
  const index = values.indexOf(id)
  if (index < 0) return values
  return [...values.slice(0, index), ...values.slice(index + 1)]
}

function CharacterSkillPanel({
  character,
  selected,
  position,
  skills,
  selectedSkillIds,
  collapsed,
  onToggleCharacter,
  onToggleCollapse,
  onToggleSkill,
}: {
  character: CharacterRead
  selected: boolean
  position?: Position
  skills: SkillTemplateRead[]
  selectedSkillIds: string[]
  collapsed: boolean
  onToggleCharacter: () => void
  onToggleCollapse: () => void
  onToggleSkill: (skillId: string) => void
}) {
  return (
    <article className={`wizard-character-card ${selected ? 'selected' : ''}`}>
      <div className="wizard-character-head">
        <button className="wizard-character-select" onClick={onToggleCharacter}>
          <span className="wizard-character-avatar">
            {character.tokenImageUrl ? <GameImage src={character.tokenImageUrl} alt={character.name} /> : character.name.charAt(0)}
          </span>
          <span>
            <strong>{character.name}</strong>
            <small>HP {character.maxHp} / ATK {character.baseAttack} / DEF {character.baseDefense} / SPD {character.speed}</small>
            <small>{position ? `部署 (${position.x}, ${position.y})` : selected ? '已出战，待部署' : '点击加入出战'}</small>
          </span>
        </button>
        {selected && (
          <button className="btn btn-secondary btn-sm" onClick={onToggleCollapse}>
            {collapsed ? `展开技能 (${skills.length})` : '收起技能'}
          </button>
        )}
      </div>
      {selected && !collapsed && (
        <div className="wizard-skill-grid">
          {skills.map((skill) => {
            const checked = selectedSkillIds.includes(skill.id)
            return (
              <button
                key={skill.id}
                className={`wizard-skill-card ${checked ? 'checked' : ''}`}
                onClick={() => onToggleSkill(skill.id)}
              >
                <span className="wizard-skill-check" />
                <span className="wizard-skill-icon">
                  <GameImage fallbackKind="skill" src={skill.iconUrl} alt={skill.name} />
                </span>
                <span className="wizard-skill-copy">
                  <strong>{skill.name}</strong>
                  <span>{skill.description || '暂无技能描述'}</span>
                  <small>行动 {skill.cost} / 范围 {skill.range} / {skill.areaType}</small>
                </span>
              </button>
            )
          })}
        </div>
      )}
    </article>
  )
}

function PoolPanel({
  title,
  emptyHint,
  items,
  values,
  onToggle,
}: {
  title: string
  emptyHint: string
  items: { id: string; name: string; meta: string }[]
  values: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="start-section compact">
      <div className="start-section-head">
        <h3>{title}</h3>
        <span className="pool-count">{values.length || '默认'}</span>
      </div>
      <p className="pool-hint">{emptyHint}</p>
      <div className="start-pool-list">
        {items.map((item) => (
          <button key={item.id} className={`pool-item ${values.includes(item.id) ? 'checked' : ''}`} onClick={() => onToggle(item.id)}>
            <span>{item.name}</span>
            <small>{item.meta}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function getCharacterName(characters: CharacterRead[], id: string): string {
  return characters.find((character) => character.id === id)?.name ?? id
}

function getCharacterImage(characters: CharacterRead[], id: string): string | null {
  const character = characters.find((item) => item.id === id)
  return character?.tokenImageUrl ?? character?.portraitImageUrl ?? null
}

function extractError(err: unknown): string {
  const detail =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
      : undefined
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.join('、')
  if (detail && typeof detail === 'object' && 'message' in detail) {
    return String((detail as { message: string }).message)
  }
  return '操作失败'
}
