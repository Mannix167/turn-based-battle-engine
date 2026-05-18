import React, { useEffect, useMemo, useState } from 'react'
import { createCharacter, updateCharacter } from '../api/characters'
import { listCharacterSkillTemplates } from '../api/skills'
import { uploadPortrait, uploadToken } from '../api/uploads'
import ImageUploader from './ImageUploader'
import type { CharacterRead, CharacterCreate, CharacterUpdate } from '../types/character'
import type { SkillTemplateRead } from '../types/skill'
import { EFFECT_TYPE_LABELS } from '../types/skill'

const DEFAULT_FORM: CharacterCreate = {
  name: '',
  description: '',
  maxHp: 100,
  baseAttack: 20,
  baseDefense: 5,
  attackRange: 1,
  tempApPerTurn: 2,
  speed: 10,
  critRate: 10,
  luck: 50,
  portraitImageUrl: null,
  tokenImageUrl: null,
  defaultSkillTemplateIds: [],
}

const MAX_CHARACTER_SKILLS = 3

interface CharacterFormProps {
  character: CharacterRead | null
  onSaved: (char: CharacterRead) => void
}

export default function CharacterForm({ character, onSaved }: CharacterFormProps) {
  const [form, setForm] = useState<CharacterCreate>({ ...DEFAULT_FORM })
  const [skillTemplates, setSkillTemplates] = useState<SkillTemplateRead[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  /* 搜索/筛选 */
  const [skillSearch, setSkillSearch] = useState('')

  const filteredSkills = useMemo(() => {
    const q = skillSearch.trim().toLowerCase()
    if (!q) return skillTemplates
    return skillTemplates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
    )
  }, [skillTemplates, skillSearch])

  // 编辑模式时同步 character 到表单
  useEffect(() => {
    if (character) {
      setForm({
        name: character.name,
        description: character.description,
        maxHp: character.maxHp,
        baseAttack: character.baseAttack,
        baseDefense: character.baseDefense,
        attackRange: character.attackRange,
        tempApPerTurn: character.tempApPerTurn,
        speed: character.speed,
        critRate: character.critRate,
        luck: character.luck,
        portraitImageUrl: character.portraitImageUrl,
        tokenImageUrl: character.tokenImageUrl,
        defaultSkillTemplateIds: [...character.defaultSkillTemplateIds],
      })
    } else {
      setForm({ ...DEFAULT_FORM })
    }
    setMessage(null)
  }, [character])

  // 加载角色专属技能模板
  useEffect(() => {
    listCharacterSkillTemplates()
      .then(setSkillTemplates)
      .catch(() => setSkillTemplates([]))
  }, [])

  const setField = <K extends keyof CharacterCreate>(key: K, value: CharacterCreate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSkillToggle = (templateId: string) => {
    setForm((prev) => {
      const ids = prev.defaultSkillTemplateIds ?? []
      if (ids.includes(templateId)) {
        return { ...prev, defaultSkillTemplateIds: ids.filter((id) => id !== templateId) }
      }
      // 达到上限时提示
      if (ids.length >= MAX_CHARACTER_SKILLS) {
        setMessage({ type: 'error', text: `角色特定技能最多 ${MAX_CHARACTER_SKILLS} 个` })
        return prev
      }
      return { ...prev, defaultSkillTemplateIds: [...ids, templateId] }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: '角色名称不能为空' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    try {
      let saved: CharacterRead
      if (character) {
        const payload: CharacterUpdate = {
          name: form.name,
          description: form.description,
          maxHp: form.maxHp,
          baseAttack: form.baseAttack,
          baseDefense: form.baseDefense,
          attackRange: form.attackRange,
          tempApPerTurn: form.tempApPerTurn,
          speed: form.speed,
          critRate: form.critRate,
          luck: form.luck,
          portraitImageUrl: form.portraitImageUrl,
          tokenImageUrl: form.tokenImageUrl,
          defaultSkillTemplateIds: form.defaultSkillTemplateIds ?? [],
        }
        saved = await updateCharacter(character.id, payload)
      } else {
        saved = await createCharacter(form)
      }
      setMessage({ type: 'success', text: character ? '保存成功' : '角色创建成功' })
      onSaved(saved)
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined
      setMessage({ type: 'error', text: `保存失败：${detail ?? '未知错误'}` })
    } finally {
      setSubmitting(false)
    }
  }

  const selectedSkillIds = form.defaultSkillTemplateIds ?? []
  const skillMap = useMemo(() => new Map(skillTemplates.map((s) => [s.id, s])), [skillTemplates])

  return (
    <form className="character-form" onSubmit={handleSubmit}>
      <h3 className="form-title">{character ? `编辑：${character.name}` : '新增角色'}</h3>

      {message && (
        <div className={`form-message form-message-${message.type}`}>{message.text}</div>
      )}

      <div className="form-section">
        <h4>基本信息</h4>
        <div className="form-row">
          <label className="form-label">
            角色名称 <span className="required">*</span>
          </label>
          <input
            className="form-input"
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="输入角色名称"
            required
          />
        </div>
        <div className="form-row">
          <label className="form-label">描述</label>
          <textarea
            className="form-input form-textarea"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            placeholder="角色描述（可选）"
            rows={2}
          />
        </div>
      </div>

      <div className="form-section">
        <h4>战斗属性</h4>
        <div className="form-grid">
          <div className="form-row">
            <label className="form-label">最大生命值 (maxHp)</label>
            <input className="form-input" type="number" min={1} value={form.maxHp} onChange={(e) => setField('maxHp', parseInt(e.target.value) || 1)} />
          </div>
          <div className="form-row">
            <label className="form-label">基础攻击力 (baseAttack)</label>
            <input className="form-input" type="number" min={1} value={form.baseAttack} onChange={(e) => setField('baseAttack', Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
          <div className="form-row">
            <label className="form-label">基础防御力 (baseDefense)</label>
            <input className="form-input" type="number" min={0} value={form.baseDefense} onChange={(e) => setField('baseDefense', parseInt(e.target.value) || 0)} />
          </div>
          <div className="form-row">
            <label className="form-label">攻击范围 (attackRange)</label>
            <input className="form-input" type="number" min={1} value={form.attackRange} onChange={(e) => setField('attackRange', parseInt(e.target.value) || 1)} />
          </div>
          <div className="form-row">
            <label className="form-label">每回合临时行动点 (tempApPerTurn)</label>
            <input className="form-input" type="number" min={0} value={form.tempApPerTurn} onChange={(e) => setField('tempApPerTurn', parseInt(e.target.value) || 0)} />
          </div>
          <div className="form-row">
            <label className="form-label">速度 (speed)</label>
            <input className="form-input" type="number" min={0} value={form.speed} onChange={(e) => setField('speed', parseInt(e.target.value) || 0)} />
          </div>
          <div className="form-row">
            <label className="form-label">暴击率 (critRate, 0-100)</label>
            <input className="form-input" type="number" min={0} max={100} value={form.critRate} onChange={(e) => setField('critRate', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
          </div>
          <div className="form-row">
            <label className="form-label">幸运值 (luck, 0-100)</label>
            <input className="form-input" type="number" min={0} max={100} value={form.luck} onChange={(e) => setField('luck', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} />
          </div>
        </div>
      </div>

      <div className="form-section">
        <h4>图片</h4>
        <div className="form-images">
          <ImageUploader
            label="立绘（选角页面）"
            currentUrl={form.portraitImageUrl}
            onUploaded={(url) => setField('portraitImageUrl', url)}
            uploadFn={uploadPortrait}
          />
          <ImageUploader
            label="棋子图片（地图显示）"
            currentUrl={form.tokenImageUrl}
            onUploaded={(url) => setField('tokenImageUrl', url)}
            uploadFn={uploadToken}
          />
        </div>
      </div>

      {/* ── 角色特定技能 ── */}
      <div className="form-section">
        <h4>角色特定技能（最多 {MAX_CHARACTER_SKILLS} 个）</h4>

        {/* 已选技能摘要 */}
        {selectedSkillIds.length > 0 && (
          <div className="selected-skills-bar">
            {selectedSkillIds.map((id) => {
              const tmpl = skillMap.get(id)
              return tmpl ? (
                <span key={id} className="selected-skill-chip">
                  {tmpl.iconUrl ? <img className="selected-skill-chip-icon" src={tmpl.iconUrl} alt="" /> : <span className="selected-skill-chip-icon">技</span>}
                  {tmpl.name}
                  <button type="button" className="chip-remove" onClick={() => handleSkillToggle(id)}>✕</button>
                </span>
              ) : null
            })}
          </div>
        )}

        {/* 搜索 */}
        <div className="form-row">
          <input
            className="form-input"
            type="text"
            placeholder="搜索技能名称、描述、ID..."
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
          />
        </div>

        {/* 可选技能列表 */}
        <div className="skill-select-list">
          {skillTemplates.length === 0 && (
            <p className="form-hint">暂无可用角色技能。请先在「技能管理」中创建并标记为「角色专属」。</p>
          )}
          {filteredSkills.map((tmpl) => {
            const checked = selectedSkillIds.includes(tmpl.id)
            return (
              <label key={tmpl.id} className={`skill-select-item ${checked ? 'checked' : ''}`}>
                <div className="skill-select-left">
                  <input type="checkbox" checked={checked} onChange={() => handleSkillToggle(tmpl.id)} />
                  <span className="skill-select-icon">
                    {tmpl.iconUrl ? <img src={tmpl.iconUrl} alt={tmpl.name} /> : '技'}
                  </span>
                  <div className="skill-select-info">
                    <div className="skill-select-name">{tmpl.name}</div>
                    <div className="skill-select-meta">
                      费{tmpl.cost} | 距{tmpl.range} | {tmpl.effects.map((e) => EFFECT_TYPE_LABELS[e.type] ?? e.type).join(' + ')}
                    </div>
                  </div>
                </div>
                <div className="skill-select-desc">{tmpl.description}</div>
              </label>
            )
          })}
          {skillTemplates.length > 0 && filteredSkills.length === 0 && (
            <p className="form-hint">未找到匹配的技能。</p>
          )}
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? '保存中...' : character ? '保存修改' : '创建角色'}
        </button>
      </div>
    </form>
  )
}
