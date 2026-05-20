import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createMap, deleteMap, duplicateMap, listMaps, updateMap, validateMap } from '../api/maps'
import type { MapFixedEntity, MapRead, MapWrite, SpawnZone, TerrainType } from '../types/map'
import { TERRAIN_DEFINITIONS, TERRAIN_TYPES, getTerrainTooltip } from '../data/terrain'

/* ── helpers ── */

function makeCells(width: number, height: number) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x, y, enabled: true, terrainType: 'normal' as const, tileImageUrl: null as string | null,
    }))
  ).flat()
}

const DEFAULT_FORM: MapWrite = {
  name: '',
  description: '',
  width: 6,
  height: 6,
  cells: makeCells(6, 6),
  validCells: [],
  spawnZones: [],
  fixedEntities: [],
  randomRules: [],
  backgroundImageUrl: null,
}

function normalizeMap(map: MapRead): MapRead {
  return {
    ...map,
    description: map.description ?? '',
    cells: map.cells?.length ? map.cells : makeCells(map.width, map.height),
    validCells: map.validCells ?? [],
    spawnZones: map.spawnZones ?? [],
    fixedEntities: map.fixedEntities ?? [],
    randomRules: map.randomRules ?? [],
    backgroundImageUrl: map.backgroundImageUrl ?? null,
    createdAt: map.createdAt ?? '',
    updatedAt: map.updatedAt ?? '',
  }
}

let nextId = 1
function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${nextId++}`
}

/* ── component ── */

export default function MapEditorPage() {
  const navigate = useNavigate()
  const [maps, setMaps] = useState<MapRead[]>([])
  const [selected, setSelected] = useState<MapRead | null>(null)
  const [form, setForm] = useState<MapWrite>({ ...DEFAULT_FORM, cells: makeCells(6, 6) })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)

  /* 编辑模式：用于地图网格点击行为 */
  type EditMode = 'cell' | 'terrain' | 'spawn' | 'entity'
  const [editMode, setEditMode] = useState<EditMode>('cell')
  const [terrainBrush, setTerrainBrush] = useState<TerrainType>('obstacle')
  const [isPainting, setIsPainting] = useState(false)
  const [hoveredCell, setHoveredCell] = useState<string | null>(null)
  const [spawnZoneIdx, setSpawnZoneIdx] = useState(0)

  const isBuiltIn = selected?.createdAt === 'built-in'

  /* ── data ── */

  const loadMaps = useCallback(async () => {
    const next = await listMaps()
    setMaps(next.map(normalizeMap))
  }, [])

  useEffect(() => {
    loadMaps().catch(() => setMessage({ type: 'error', text: '地图列表加载失败，请确认后端已启动。' }))
  }, [loadMaps])

  const sortedMaps = useMemo(
    () => [...maps].sort((a, b) => Number(a.createdAt === 'built-in') - Number(b.createdAt === 'built-in') || a.name.localeCompare(b.name)),
    [maps],
  )

  /* ── select / new ── */

  const selectMap = (map: MapRead) => {
    setSelected(map)
    setForm({
      name: map.name,
      description: map.description,
      width: map.width,
      height: map.height,
      cells: map.cells.length ? map.cells : makeCells(map.width, map.height),
      validCells: map.validCells,
      spawnZones: map.spawnZones,
      fixedEntities: map.fixedEntities,
      randomRules: map.randomRules,
      backgroundImageUrl: map.backgroundImageUrl,
    })
    setMessage(null)
  }

  const newMap = () => {
    setSelected(null)
    setForm({ ...DEFAULT_FORM, cells: makeCells(DEFAULT_FORM.width, DEFAULT_FORM.height) })
    setMessage(null)
  }

  /* ── resize / toggle cell ── */

  const resize = (width: number, height: number) => {
    const nextCells = makeCells(width, height).map((cell) => {
      const previous = form.cells.find((item) => item.x === cell.x && item.y === cell.y)
      return previous ? { ...cell, enabled: previous.enabled, terrainType: previous.terrainType } : cell
    })
    setForm((prev) => ({
      ...prev,
      width,
      height,
      cells: nextCells,
      fixedEntities: prev.fixedEntities.filter((entity) => entity.x < width && entity.y < height),
      spawnZones: prev.spawnZones.map((zone) => ({
        ...zone,
        cells: zone.cells.filter((c) => c.x < width && c.y < height),
      })),
    }))
  }

  const toggleCell = (x: number, y: number) => {
    setForm((prev) => ({
      ...prev,
      cells: prev.cells.map((cell) => (cell.x === x && cell.y === y ? { ...cell, enabled: !cell.enabled } : cell)),
    }))
  }

  const paintTerrain = (x: number, y: number, terrainType: TerrainType) => {
    setForm((prev) => ({
      ...prev,
      cells: prev.cells.map((cell) =>
        cell.x === x && cell.y === y ? { ...cell, terrainType } : cell
      ),
    }))
  }

  /* ── grid click handler (by editMode) ── */

  const handleGridClick = (x: number, y: number) => {
    if (editMode === 'cell') {
      toggleCell(x, y)
    } else if (editMode === 'terrain') {
      paintTerrain(x, y, terrainBrush)
    } else if (editMode === 'spawn') {
      setForm((prev) => {
        const zone = prev.spawnZones[spawnZoneIdx]
        if (!zone) return prev
        const hasIt = zone.cells.some((c) => c.x === x && c.y === y)
        const newCells = hasIt
          ? zone.cells.filter((c) => !(c.x === x && c.y === y))
          : [...zone.cells, { x, y }]
        const newZones = prev.spawnZones.map((z, i) => (i === spawnZoneIdx ? { ...z, cells: newCells } : z))
        return { ...prev, spawnZones: newZones }
      })
    }
  }

  const handleGridMouseDown = (x: number, y: number, e: React.MouseEvent) => {
    if (e.button === 2 && editMode === 'terrain') {
      e.preventDefault()
      paintTerrain(x, y, 'normal')
      setIsPainting(false)
      return
    }
    if (editMode === 'terrain' && e.button === 0) {
      paintTerrain(x, y, terrainBrush)
      setIsPainting(true)
    }
  }

  const handleGridMouseEnter = (x: number, y: number) => {
    const key = `${x},${y}`
    setHoveredCell(key)
    if (isPainting && editMode === 'terrain') {
      paintTerrain(x, y, terrainBrush)
    }
  }

  const handleGridMouseUp = () => {
    setIsPainting(false)
  }

  /* ── Spawn Zones ── */

  const addSpawnZone = () => {
    const zone: SpawnZone = { id: genId('zone'), name: `部署区 ${form.spawnZones.length + 1}`, cells: [], type: 'player' }
    setForm((prev) => ({ ...prev, spawnZones: [...prev.spawnZones, zone] }))
    setSpawnZoneIdx(form.spawnZones.length)
    setEditMode('spawn')
  }

  const updateSpawnZone = (index: number, patch: Partial<SpawnZone>) => {
    setForm((prev) => ({
      ...prev,
      spawnZones: prev.spawnZones.map((z, i) => (i === index ? { ...z, ...patch } : z)),
    }))
  }

  const removeSpawnZone = (index: number) => {
    setForm((prev) => ({
      ...prev,
      spawnZones: prev.spawnZones.filter((_, i) => i !== index),
    }))
    if (spawnZoneIdx >= form.spawnZones.length - 1) setSpawnZoneIdx(Math.max(0, form.spawnZones.length - 2))
  }

  /* ── Fixed Entities ── */

  const addFixedEntity = () => {
    const entity: MapFixedEntity = { id: genId('fixed'), type: 'treasure', templateId: null, x: 0, y: 0 }
    setForm((prev) => ({ ...prev, fixedEntities: [...prev.fixedEntities, entity] }))
  }

  const updateFixedEntity = (index: number, patch: Partial<MapFixedEntity>) => {
    setForm((prev) => ({
      ...prev,
      fixedEntities: prev.fixedEntities.map((entity, i) => (i === index ? { ...entity, ...patch } : entity)),
    }))
  }

  const removeFixedEntity = (index: number) => {
    setForm((prev) => ({ ...prev, fixedEntities: prev.fixedEntities.filter((_, i) => i !== index) }))
  }

  /* ── save / validate / duplicate / delete ── */

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    // 前端轻量验证提示
    const warnings: string[] = []
    form.fixedEntities.forEach((e) => {
      const cell = form.cells.find((c) => c.x === e.x && c.y === e.y)
      if (cell && (cell.terrainType === 'obstacle' || cell.terrainType === 'wood_stake')) {
        warnings.push(`固定实体 (${e.x},${e.y}) 位于${TERRAIN_DEFINITIONS[cell.terrainType].name}上，后端可能拒绝`)
      }
    })
    form.spawnZones.forEach((zone) => {
      zone.cells.forEach((c) => {
        const cell = form.cells.find((sc) => sc.x === c.x && sc.y === c.y)
        if (cell) {
          if (cell.terrainType === 'obstacle' || cell.terrainType === 'wood_stake') {
            warnings.push(`部署区「${zone.name}」的格子 (${c.x},${c.y}) 为${TERRAIN_DEFINITIONS[cell.terrainType].name}，不可部署`)
          }
          if (cell.terrainType === 'lava' || cell.terrainType === 'thunderstorm') {
            warnings.push(`部署区「${zone.name}」的格子 (${c.x},${c.y}) 为${TERRAIN_DEFINITIONS[cell.terrainType].name}，⚠️ 危险地形`)
          }
        }
      })
    })
    if (warnings.length > 0) {
      const proceed = window.confirm(`存在以下警告：\n${warnings.join('\n')}\n\n仍要保存吗？后端会做最终校验。`)
      if (!proceed) return
    }

    setLoading(true)
    setMessage(null)
    try {
      const payload = {
        ...form,
        randomRules: [],
        validCells: form.cells.filter((cell) => cell.enabled).map(({ x, y }) => ({ x, y })),
      }
      const saved = selected ? await updateMap(selected.id, payload) : await createMap(payload)
      setSelected(saved)
      selectMap(saved)
      await loadMaps()
      setMessage({ type: 'success', text: '已保存。' })
    } catch (error: unknown) {
      const detail =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : undefined
      setMessage({ type: 'error', text: `保存失败：${Array.isArray(detail) ? detail.join('，') : detail ?? '未知错误'}` })
    } finally {
      setLoading(false)
    }
  }

  const validateCurrent = async () => {
    if (!selected) {
      setMessage({ type: 'error', text: '请先保存地图，再进行校验。' })
      return
    }
    const result = await validateMap(selected.id)
    if (result.isValid) {
      setMessage({ type: 'success', text: `地图校验通过。${result.warnings.length ? '警告：' + result.warnings.join('；') : ''}` })
    } else {
      setMessage({ type: 'error', text: `地图无效：${result.errors.join('；')}` })
    }
  }

  const duplicateCurrent = async () => {
    if (!selected) return
    const copied = await duplicateMap(selected.id)
    setSelected(copied)
    selectMap(copied)
    await loadMaps()
    setMessage({ type: 'success', text: '已复制。' })
  }

  const deleteCurrent = async () => {
    if (!selected || isBuiltIn) return
    await deleteMap(selected.id)
    newMap()
    await loadMaps()
    setMessage({ type: 'success', text: '已删除。' })
  }

  /* ── helpers for grid rendering ── */

  const isCellInSpawnZone = (x: number, y: number) =>
    form.spawnZones.some((zone) => zone.cells.some((c) => c.x === x && c.y === y))

  const fixedEntityAt = (x: number, y: number) =>
    form.fixedEntities.find((e) => e.x === x && e.y === y)

  /* ── render ── */

  return (
    <div className="editor-page">
      <div className="editor-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>← 返回首页</button>
        <h2 className="editor-title">地图编辑器</h2>
        <button className="btn btn-primary" onClick={newMap}>+ 新建地图</button>
      </div>

      <div className="editor-body">
        {/* 左侧列表 */}
        <aside className="editor-sidebar">
          <div className="sidebar-title">地图列表</div>
          <ul className="character-list">
            {sortedMaps.map((map) => (
              <li
                key={map.id}
                className={`character-list-item ${selected?.id === map.id ? 'selected' : ''}`}
                onClick={() => selectMap(map)}
              >
                <div className="character-list-item-info">
                  <div className="character-list-item-name">
                    {map.name}
                    {map.createdAt === 'built-in' && <span className="tag-builtin">内置</span>}
                  </div>
                  <div className="character-list-item-stats">
                    {map.width}×{map.height} | 有效格 {map.validCells.length}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* 右侧表单 */}
        <main className="editor-main">
          <form className="character-form" onSubmit={save}>
            <h3 className="form-title">{selected ? `编辑：${selected.name}` : '新建自定义地图'}</h3>

            {message && (
              <div className={`form-message form-message-${message.type}`}>{message.text}</div>
            )}
            {isBuiltIn && (
              <div className="form-message form-message-error">内置地图不能直接编辑，可以先复制为自定义地图。</div>
            )}

            {/* ── 地图信息 ── */}
            <div className="form-section">
              <h4>地图信息</h4>
              <div className="form-grid">
                {!selected && (
                  <div className="form-row">
                    <label className="form-label">可选 ID</label>
                    <input className="form-input" value={form.id ?? ''} onChange={(e) => setForm({ ...form, id: e.target.value || undefined })} />
                  </div>
                )}
                <div className="form-row">
                  <label className="form-label">名称 <span className="required">*</span></label>
                  <input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-row">
                  <label className="form-label">宽度</label>
                  <input className="form-input" type="number" min={1} max={30} value={form.width} onChange={(e) => resize(Math.max(1, Number(e.target.value)), form.height)} />
                </div>
                <div className="form-row">
                  <label className="form-label">高度</label>
                  <input className="form-input" type="number" min={1} max={30} value={form.height} onChange={(e) => resize(form.width, Math.max(1, Number(e.target.value)))} />
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">描述</label>
                <textarea className="form-input form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="地图描述（可选）" />
              </div>
            </div>

            {/* ── 地图网格编辑 ── */}
            <div className="form-section">
              <h4>地图网格</h4>
              <div className="edit-mode-bar">
                <button type="button" className={`btn btn-sm ${editMode === 'cell' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEditMode('cell')}>
                  启用/禁用格子
                </button>
                <button type="button" className={`btn btn-sm ${editMode === 'terrain' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setEditMode('terrain')}>
                  🖌️ 地形刷子
                </button>
                <button type="button" className={`btn btn-sm ${editMode === 'spawn' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setEditMode('spawn'); if (form.spawnZones.length === 0) addSpawnZone(); }}>
                  部署区
                </button>
              </div>

              {/* 地形刷子选择栏 */}
              {editMode === 'terrain' && (
                <div className="terrain-brush-bar">
                  {TERRAIN_TYPES.map((t) => {
                    const def = TERRAIN_DEFINITIONS[t]
                    return (
                      <button
                        key={t}
                        type="button"
                        className={`terrain-brush-btn ${terrainBrush === t ? 'active' : ''}`}
                        style={{ borderColor: terrainBrush === t ? '#4f8ef7' : undefined }}
                        onClick={() => setTerrainBrush(t)}
                        title={`${def.name}\n${def.tooltipLines.join('\n')}`}
                      >
                        <img src={def.imageUrl} alt={def.name} className="terrain-brush-icon" />
                        <span>{def.icon} {def.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {editMode === 'spawn' && form.spawnZones.length > 0 && (
                <div className="spawn-zone-tabs">
                  {form.spawnZones.map((zone, i) => (
                    <button key={zone.id} type="button" className={`btn btn-sm ${spawnZoneIdx === i ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSpawnZoneIdx(i)}>
                      {zone.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="map-editor-grid-wrap" onContextMenu={(e) => e.preventDefault()} onMouseUp={handleGridMouseUp} onMouseLeave={handleGridMouseUp}>
                <div
                  className="map-editor-grid"
                  style={{ gridTemplateColumns: `repeat(${form.width}, 36px)` }}
                >
                  {form.cells.map((cell) => {
                    const key = `${cell.x},${cell.y}`
                    const inSpawn = isCellInSpawnZone(cell.x, cell.y)
                    const entity = fixedEntityAt(cell.x, cell.y)
                    const isActiveSpawn = editMode === 'spawn' && form.spawnZones[spawnZoneIdx]?.cells.some((c) => c.x === cell.x && c.y === cell.y)
                    const terrainDef = TERRAIN_DEFINITIONS[cell.terrainType]
                    const isHovered = hoveredCell === key
                    const tooltipText = getTerrainTooltip(cell.terrainType)
                    return (
                      <div
                        key={key}
                        className={[
                          'map-editor-cell',
                          !cell.enabled ? 'cell-disabled' : '',
                          cell.terrainType !== 'normal' ? `cell-terrain-${cell.terrainType}` : '',
                          inSpawn ? 'cell-spawn' : '',
                          isActiveSpawn ? 'cell-spawn-active' : '',
                          entity ? (entity.type === 'monster' ? 'cell-monster' : 'cell-treasure') : '',
                          editMode === 'cell' ? 'mode-cell' : editMode === 'terrain' ? 'mode-terrain' : 'mode-spawn',
                          terrainDef?.dangerous ? 'cell-terrain-danger' : '',
                          isHovered ? 'cell-hovered' : '',
                        ].filter(Boolean).join(' ')}
                        style={{
                          width: 36,
                          height: 36,
                          backgroundImage: cell.enabled && cell.terrainType !== 'normal' ? `url(${terrainDef?.imageUrl})` : undefined,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center',
                        }}
                        onClick={() => handleGridClick(cell.x, cell.y)}
                        onMouseDown={(e) => handleGridMouseDown(cell.x, cell.y, e)}
                        onMouseEnter={() => handleGridMouseEnter(cell.x, cell.y)}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={`(${cell.x},${cell.y}) ${tooltipText}${!cell.enabled ? ' [禁用]' : ''}${inSpawn ? ' [部署区]' : ''}${entity ? ` [${entity.type}]` : ''}`}
                      >
                        {entity ? (entity.type === 'monster' ? '👹' : '💎') : !cell.enabled ? '✕' : cell.terrainType !== 'normal' && terrainDef ? terrainDef.icon : inSpawn ? '◉' : ''}
                        {cell.terrainType === 'wood_stake' && cell.terrainState?.hp != null && (
                          <span className="cell-wood-hp">{cell.terrainState.hp}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              <p className="form-hint">
                {editMode === 'cell' ? '点击格子切换启用/禁用。禁用格子不可移动、不可部署。' : editMode === 'terrain' ? '左键刷地形，右键恢复普通地形。可拖动连续刷。' : '点击格子将选中格加入/移出当前部署区。'}
              </p>

              {/* 地形图例 */}
              <div className="terrain-legend">
                {TERRAIN_TYPES.map((t) => {
                  const def = TERRAIN_DEFINITIONS[t]
                  return (
                    <span key={t} className="terrain-legend-item" title={def.tooltipLines.join('\n')}>
                      <span className={`terrain-legend-swatch cell-terrain-${t}`} />
                      {def.icon} {def.name}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* ── 部署区配置 ── */}
            <div className="form-section">
              <h4>部署区（SpawnZones）</h4>
              {form.spawnZones.length === 0 && <p className="form-hint">暂无部署区。点击上方「部署区」按钮自动创建。</p>}
              {form.spawnZones.map((zone, i) => (
                <div key={zone.id} className="spawn-zone-item">
                  <div className="form-grid">
                    <div className="form-row">
                      <label className="form-label">名称</label>
                      <input className="form-input" value={zone.name} onChange={(e) => updateSpawnZone(i, { name: e.target.value })} />
                    </div>
                    <div className="form-row">
                      <label className="form-label">类型</label>
                      <select className="form-input" value={zone.type} onChange={(e) => updateSpawnZone(i, { type: e.target.value as SpawnZone['type'] })}>
                        <option value="player">玩家</option>
                        <option value="neutral">中立</option>
                        <option value="custom">自定义</option>
                      </select>
                    </div>
                    <div className="form-row">
                      <label className="form-label">格子数</label>
                      <span className="form-static">{zone.cells.length}</span>
                    </div>
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeSpawnZone(i)}>删除部署区</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" onClick={addSpawnZone}>+ 添加部署区</button>
            </div>

            {/* ── 固定实体 ── */}
            <div className="form-section">
              <h4>固定实体（小怪 / 藏宝点）</h4>
              {form.fixedEntities.map((entity, i) => (
                <div key={entity.id} className="fixed-entity-item">
                  <div className="form-grid">
                    <div className="form-row">
                      <label className="form-label">类型</label>
                      <select className="form-input" value={entity.type} onChange={(e) => updateFixedEntity(i, { type: e.target.value as 'monster' | 'treasure' })}>
                        <option value="treasure">💎 宝箱</option>
                        <option value="monster">👹 怪物</option>
                      </select>
                    </div>
                    <div className="form-row">
                      <label className="form-label">模板 ID</label>
                      <input className="form-input" value={entity.templateId ?? ''} onChange={(e) => updateFixedEntity(i, { templateId: e.target.value || null })} placeholder="可选" />
                    </div>
                    <div className="form-row">
                      <label className="form-label">X</label>
                      <input className="form-input" type="number" min={0} max={form.width - 1} value={entity.x} onChange={(e) => updateFixedEntity(i, { x: Number(e.target.value) })} />
                    </div>
                    <div className="form-row">
                      <label className="form-label">Y</label>
                      <input className="form-input" type="number" min={0} max={form.height - 1} value={entity.y} onChange={(e) => updateFixedEntity(i, { y: Number(e.target.value) })} />
                    </div>
                  </div>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeFixedEntity(i)}>移除</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" onClick={addFixedEntity}>+ 添加固定实体</button>
            </div>

            {/* ── 操作按钮 ── */}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={loading || isBuiltIn}>
                {loading ? '保存中...' : '保存'}
              </button>
              <button className="btn btn-secondary" type="button" disabled={!selected} onClick={validateCurrent}>校验</button>
              <button className="btn btn-secondary" type="button" disabled={!selected} onClick={duplicateCurrent}>复制</button>
              <button className="btn btn-danger" type="button" disabled={!selected || isBuiltIn} onClick={deleteCurrent}>删除</button>
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}
