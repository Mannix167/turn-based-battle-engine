import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createMap, deleteMap, duplicateMap, listMaps, updateMap, validateMap } from '../api/maps'
import type { MapFixedEntity, MapRead, MapWrite } from '../types/map'

function makeCells(width: number, height: number) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({ x, y, enabled: true, terrainType: 'normal' as const, tileImageUrl: null })),
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

export default function MapEditorPage() {
  const navigate = useNavigate()
  const [maps, setMaps] = useState<MapRead[]>([])
  const [selected, setSelected] = useState<MapRead | null>(null)
  const [form, setForm] = useState<MapWrite>({ ...DEFAULT_FORM, cells: makeCells(6, 6) })
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isBuiltIn = selected?.createdAt === 'built-in'

  const loadMaps = useCallback(async () => {
    const next = await listMaps()
    setMaps(next.map(normalizeMap))
  }, [])

  useEffect(() => {
    loadMaps().catch(() => setMessage('地图列表加载失败，请确认后端已启动。'))
  }, [loadMaps])

  const sortedMaps = useMemo(
    () => [...maps].sort((a, b) => Number(a.createdAt === 'built-in') - Number(b.createdAt === 'built-in') || a.name.localeCompare(b.name)),
    [maps],
  )

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

  const resize = (width: number, height: number) => {
    const nextCells = makeCells(width, height).map((cell) => {
      const previous = form.cells.find((item) => item.x === cell.x && item.y === cell.y)
      return previous ? { ...cell, enabled: previous.enabled } : cell
    })
    setForm((prev) => ({
      ...prev,
      width,
      height,
      cells: nextCells,
      fixedEntities: prev.fixedEntities.filter((entity) => entity.x < width && entity.y < height),
    }))
  }

  const toggleCell = (x: number, y: number) => {
    setForm((prev) => ({
      ...prev,
      cells: prev.cells.map((cell) => (cell.x === x && cell.y === y ? { ...cell, enabled: !cell.enabled } : cell)),
    }))
  }

  const updateFixedEntity = (index: number, patch: Partial<MapFixedEntity>) => {
    setForm((prev) => ({
      ...prev,
      fixedEntities: prev.fixedEntities.map((entity, entityIndex) => (entityIndex === index ? { ...entity, ...patch } : entity)),
    }))
  }

  const addFixedEntity = () => {
    setForm((prev) => ({
      ...prev,
      fixedEntities: [
        ...prev.fixedEntities,
        {
          id: `fixed_${Date.now()}`,
          type: 'treasure',
          templateId: 'Treasure',
          x: 0,
          y: 0,
        },
      ],
    }))
  }

  const removeFixedEntity = (index: number) => {
    setForm((prev) => ({ ...prev, fixedEntities: prev.fixedEntities.filter((_, entityIndex) => entityIndex !== index) }))
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const payload = {
        ...form,
        validCells: form.cells.filter((cell) => cell.enabled).map(({ x, y }) => ({ x, y })),
      }
      const saved = selected ? await updateMap(selected.id, payload) : await createMap(payload)
      setSelected(saved)
      selectMap(saved)
      await loadMaps()
      setMessage('已保存。')
    } catch (error: unknown) {
      const detail =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail
          : undefined
      setMessage(`保存失败：${Array.isArray(detail) ? detail.join('，') : detail ?? '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }

  const validateCurrent = async () => {
    if (!selected) {
      setMessage('请先保存地图，再进行校验。')
      return
    }
    const result = await validateMap(selected.id)
    setMessage(result.isValid ? '地图校验通过。' : `地图无效：${result.errors.join('，')}`)
  }

  const duplicateCurrent = async () => {
    if (!selected) return
    const copied = await duplicateMap(selected.id)
    setSelected(copied)
    selectMap(copied)
    await loadMaps()
    setMessage('已复制。')
  }

  const deleteCurrent = async () => {
    if (!selected || isBuiltIn) return
    await deleteMap(selected.id)
    newMap()
    await loadMaps()
    setMessage('已删除。')
  }

  return (
    <div className="editor-page">
      <div className="editor-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>返回首页</button>
        <h2 className="editor-title">地图编辑器</h2>
        <button className="btn btn-primary" onClick={newMap}>新建地图</button>
      </div>
      <div className="editor-body">
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
                  <div className="character-list-item-name">{map.name}</div>
                  <div className="character-list-item-stats">{map.width}x{map.height} | {map.createdAt === 'built-in' ? '内置' : '自定义'}</div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <main className="editor-main">
          <form className="character-form" onSubmit={save}>
            <h3 className="form-title">{selected ? `编辑：${selected.name}` : '新建自定义地图'}</h3>
            {message && <div className="form-message form-message-success">{message}</div>}
            {isBuiltIn && <div className="form-message form-message-error">内置地图不能直接编辑，可以先复制为自定义地图。</div>}

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
                  <label className="form-label">名称</label>
                  <input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="form-row">
                  <label className="form-label">宽度</label>
                  <input className="form-input" type="number" min={1} value={form.width} onChange={(e) => resize(Math.max(1, Number(e.target.value)), form.height)} />
                </div>
                <div className="form-row">
                  <label className="form-label">高度</label>
                  <input className="form-input" type="number" min={1} value={form.height} onChange={(e) => resize(form.width, Math.max(1, Number(e.target.value)))} />
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">描述</label>
                <textarea className="form-input form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>

            <div className="form-section">
              <h4>可用格子</h4>
              <div className="deploy-board" style={{ gridTemplateColumns: `repeat(${form.width}, 32px)` }}>
                {form.cells.map((cell) => (
                  <button
                    key={`${cell.x}-${cell.y}`}
                    type="button"
                    className={`deploy-cell ${cell.enabled ? 'placeable' : 'invalid'}`}
                    style={{ width: 32, height: 32 }}
                    onClick={() => toggleCell(cell.x, cell.y)}
                    title={`${cell.x}, ${cell.y}`}
                  >
                    {cell.enabled ? '' : '禁'}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h4>固定实体</h4>
              <div className="skill-list">
                {form.fixedEntities.map((entity, index) => (
                  <div key={entity.id} className="skill-checkbox-item">
                    <select className="form-input" value={entity.type} onChange={(e) => updateFixedEntity(index, { type: e.target.value as 'monster' | 'treasure' })}>
                      <option value="treasure">宝箱</option>
                      <option value="monster">怪物</option>
                    </select>
                    <input className="form-input" value={entity.templateId ?? ''} onChange={(e) => updateFixedEntity(index, { templateId: e.target.value || null })} />
                    <input className="form-input" type="number" min={0} max={form.width - 1} value={entity.x} onChange={(e) => updateFixedEntity(index, { x: Number(e.target.value) })} />
                    <input className="form-input" type="number" min={0} max={form.height - 1} value={entity.y} onChange={(e) => updateFixedEntity(index, { y: Number(e.target.value) })} />
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => removeFixedEntity(index)}>移除</button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn btn-secondary" onClick={addFixedEntity}>添加固定实体</button>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={loading || isBuiltIn}>{loading ? '保存中...' : '保存'}</button>
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
