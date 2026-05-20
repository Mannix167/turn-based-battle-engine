import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import ImageUploader from '../components/ImageUploader'
import { uploadPortrait, uploadToken } from '../api/uploads'
import {
  createMonsterTemplate,
  deleteMonsterTemplate,
  duplicateMonsterTemplate,
  listMonsterTemplates,
  updateMonsterTemplate,
} from '../api/monsters'
import type { MonsterTemplateRead, MonsterTemplateWrite } from '../types/monster'

const blankMonster: MonsterTemplateWrite = {
  name: '新小怪',
  description: '',
  maxHp: 30,
  baseAttack: 8,
  baseDefense: 1,
  attackRange: 1,
  speed: 0,
  critRate: 0,
  luck: 0,
  tokenImageUrl: null,
  portraitImageUrl: null,
  enabled: true,
}

export default function MonsterManagerPage() {
  const navigate = useNavigate()
  const [monsters, setMonsters] = useState<MonsterTemplateRead[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<MonsterTemplateWrite>(blankMonster)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(
    () => monsters.find((monster) => monster.id === selectedId) ?? null,
    [monsters, selectedId]
  )

  const load = async () => {
    setLoading(true)
    try {
      const data = await listMonsterTemplates(true)
      setMonsters(data)
      if (!selectedId && data[0]) {
        setSelectedId(data[0].id)
        setDraft(toDraft(data[0]))
      }
    } catch {
      setError('无法加载小怪模板，请确认后端已启动')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const choose = (monster: MonsterTemplateRead) => {
    setSelectedId(monster.id)
    setDraft(toDraft(monster))
    setMessage(null)
    setError(null)
  }

  const setField = <K extends keyof MonsterTemplateWrite>(key: K, value: MonsterTemplateWrite[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setMessage(null)
    setError(null)
    try {
      const saved = selected ? await updateMonsterTemplate(selected.id, draft) : await createMonsterTemplate(draft)
      await load()
      setSelectedId(saved.id)
      setDraft(toDraft(saved))
      setMessage('小怪模板已保存')
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string | string[] } } }).response?.data?.detail
          : undefined
      setError(Array.isArray(detail) ? detail.join('、') : detail ?? '保存失败')
    }
  }

  const duplicate = async () => {
    if (!selected) return
    const copy = await duplicateMonsterTemplate(selected.id)
    await load()
    setSelectedId(copy.id)
    setDraft(toDraft(copy))
    setMessage('已复制小怪模板')
  }

  const remove = async () => {
    if (!selected) return
    await deleteMonsterTemplate(selected.id)
    setSelectedId(null)
    setDraft(blankMonster)
    await load()
    setMessage('已删除小怪模板')
  }

  return (
    <div className="editor-page monster-manager-page">
      <div className="editor-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>返回首页</button>
        <h2 className="editor-title">小怪管理</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setSelectedId(null)
            setDraft(blankMonster)
            setMessage(null)
            setError(null)
          }}
        >
          新增小怪
        </button>
      </div>

      <div className="editor-body">
        <aside className="editor-sidebar monster-list-panel">
          <div className="sidebar-title">模板列表</div>
          {loading && <p className="loading-text">加载中...</p>}
          <div className="monster-template-list">
            {monsters.map((monster) => (
              <button
                key={monster.id}
                className={`monster-template-row ${selectedId === monster.id ? 'selected' : ''}`}
                onClick={() => choose(monster)}
              >
                <span className="monster-row-token">
                  {monster.tokenImageUrl ? <img src={monster.tokenImageUrl} alt={monster.name} /> : monster.name.charAt(0)}
                </span>
                <span className="monster-row-main">
                  <strong>{monster.name}</strong>
                  <span>HP {monster.maxHp} / ATK {monster.baseAttack} / DEF {monster.baseDefense}</span>
                </span>
                <span className={`monster-enabled-pill ${monster.enabled ? 'on' : 'off'}`}>
                  {monster.enabled ? '启用' : '禁用'}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <main className="editor-main monster-editor-main">
          {(message || error) && (
            <div className={`form-message ${error ? 'form-message-error' : 'form-message-success'}`}>
              {error ?? message}
            </div>
          )}
          <section className="monster-form-shell">
            <div className="monster-form-hero">
              <div className="monster-portrait-preview">
                {draft.portraitImageUrl ? <img src={draft.portraitImageUrl} alt={draft.name} /> : <span>{draft.name.charAt(0)}</span>}
              </div>
              <div>
                <label className="form-label">名称</label>
                <input className="form-input monster-name-input" value={draft.name} onChange={(e) => setField('name', e.target.value)} />
                <label className="form-label">描述</label>
                <textarea
                  className="form-input form-textarea"
                  value={draft.description}
                  onChange={(e) => setField('description', e.target.value)}
                />
              </div>
            </div>

            <div className="monster-stat-grid">
              {([
                ['maxHp', '生命值', 1, 999],
                ['baseAttack', '攻击力', 0, 999],
                ['baseDefense', '防御力', 0, 999],
                ['attackRange', '攻击范围', 1, 20],
                ['speed', '速度', 0, 999],
                ['critRate', '暴击率', 0, 100],
                ['luck', '幸运', 0, 100],
              ] as const).map(([key, label, min, max]) => (
                <label key={key} className="form-row">
                  <span className="form-label">{label}</span>
                  <input
                    className="form-input"
                    type="number"
                    min={min}
                    max={max}
                    value={draft[key]}
                    onChange={(e) => setField(key, Number(e.target.value))}
                  />
                </label>
              ))}
              <label className="monster-toggle-row">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setField('enabled', e.target.checked)}
                />
                <span>允许进入随机小怪池</span>
              </label>
            </div>

            <div className="form-images">
              <ImageUploader label="地图图标" currentUrl={draft.tokenImageUrl} uploadFn={uploadToken} onUploaded={(url) => setField('tokenImageUrl', url)} />
              <ImageUploader label="展示立绘" currentUrl={draft.portraitImageUrl} uploadFn={uploadPortrait} onUploaded={(url) => setField('portraitImageUrl', url)} />
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" onClick={save}>保存</button>
              <button className="btn btn-secondary" onClick={duplicate} disabled={!selected}>复制</button>
              <button className="btn btn-danger" onClick={remove} disabled={!selected}>删除</button>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}

function toDraft(monster: MonsterTemplateRead): MonsterTemplateWrite {
  return {
    name: monster.name,
    description: monster.description,
    maxHp: monster.maxHp,
    baseAttack: monster.baseAttack,
    baseDefense: monster.baseDefense,
    attackRange: monster.attackRange,
    speed: monster.speed,
    critRate: monster.critRate,
    luck: monster.luck,
    tokenImageUrl: monster.tokenImageUrl,
    portraitImageUrl: monster.portraitImageUrl,
    enabled: monster.enabled,
  }
}
