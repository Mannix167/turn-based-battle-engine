import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createSkillTemplate,
  deleteSkillTemplate,
  duplicateSkillTemplate,
  listAllSkillTemplates,
  updateSkillTemplate,
} from '../api/skills'
import type { EffectConfig, SkillTemplateRead, SkillTemplateWrite } from '../types/skill'

const DEFAULT_FORM: SkillTemplateWrite = {
  name: '',
  description: '',
  iconUrl: '💣',
  skillKind: 'configurable',
  enabled: true,
  usableAs: ['common', 'reward'],
  category: 'common',
  cost: 1,
  range: 3,
  targetType: 'single',
  areaType: 'single',
  canTargetSelf: false,
  canTargetAlly: false,
  canTargetEnemy: true,
  canTargetEmptyCell: false,
  effects: [{ type: 'damage', value: 10, metadata: {} }],
}

const USAGE_OPTIONS = ['character', 'common', 'reward', 'summon'] as const

const USAGE_LABELS: Record<(typeof USAGE_OPTIONS)[number], string> = {
  character: '角色专属',
  common: '开局通用',
  reward: '击杀奖励',
  summon: '召唤单位',
}

const CATEGORY_LABELS = {
  common: '通用技能',
  character: '角色技能',
}

const TARGET_LABELS: Record<string, string> = {
  single: '单体目标',
  self: '自身',
  emptyCell: '空格',
  direction: '方向',
}

const AREA_LABELS: Record<string, string> = {
  single: '单格',
  none: '无范围',
  line: '直线',
  cross: '十字',
  square: '方形',
}

const EFFECT_LABELS: Record<string, string> = {
  damage: '造成伤害',
  heal: '治疗',
  grant_temporary_ap: '获得临时行动点',
  grant_permanent_ap: '获得永久行动点',
}

function normalizeSkill(skill: SkillTemplateRead): SkillTemplateRead {
  type Usage = SkillTemplateRead['usableAs'][number]
  const usableAs = Array.isArray(skill.usableAs) && skill.usableAs.length
    ? skill.usableAs
    : skill.category === 'character'
      ? (['character'] as Usage[])
      : (['common', 'reward'] as Usage[])
  return {
    ...skill,
    iconUrl: skill.iconUrl ?? null,
    skillKind: skill.skillKind ?? 'built_in',
    enabled: skill.enabled ?? true,
    usableAs,
    effects: skill.effects ?? [],
  }
}

export default function SkillEditorPage() {
  const navigate = useNavigate()
  const [skills, setSkills] = useState<SkillTemplateRead[]>([])
  const [selected, setSelected] = useState<SkillTemplateRead | null>(null)
  const [form, setForm] = useState<SkillTemplateWrite>({ ...DEFAULT_FORM })
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isBuiltIn = selected?.skillKind === 'built_in'

  const loadSkills = useCallback(async () => {
    const next = await listAllSkillTemplates()
    setSkills(next.map(normalizeSkill))
  }, [])

  useEffect(() => {
    loadSkills().catch(() => setMessage('技能列表加载失败，请确认后端已启动。'))
  }, [loadSkills])

  const sortedSkills = useMemo(
    () => [...skills].sort((a, b) => Number(a.skillKind === 'built_in') - Number(b.skillKind === 'built_in') || a.name.localeCompare(b.name)),
    [skills],
  )

  const selectSkill = (skill: SkillTemplateRead) => {
    setSelected(skill)
    setForm({
      ...skill,
      skillKind: skill.skillKind,
      effects: skill.effects.length ? skill.effects.map((effect) => ({ ...effect })) : [{ type: 'damage', value: 10, metadata: {} }],
    })
    setMessage(null)
  }

  const newSkill = () => {
    setSelected(null)
    setForm({ ...DEFAULT_FORM, effects: DEFAULT_FORM.effects.map((effect) => ({ ...effect })) })
    setMessage(null)
  }

  const setEffect = (patch: Partial<EffectConfig>) => {
    setForm((prev) => ({
      ...prev,
      effects: [{ ...(prev.effects[0] ?? { type: 'damage', metadata: {} }), ...patch }],
    }))
  }

  const toggleUsage = (usage: (typeof USAGE_OPTIONS)[number]) => {
    setForm((prev) => {
      const next = prev.usableAs.includes(usage)
        ? prev.usableAs.filter((item) => item !== usage)
        : [...prev.usableAs, usage]
      return { ...prev, usableAs: next }
    })
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setMessage(null)
    try {
      const payload = { ...form, skillKind: 'configurable' as const }
      const saved = selected ? await updateSkillTemplate(selected.id, payload) : await createSkillTemplate(payload)
      setSelected(saved)
      setForm(saved)
      await loadSkills()
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

  const duplicate = async () => {
    if (!selected) return
    const copied = await duplicateSkillTemplate(selected.id)
    setSelected(copied)
    setForm(copied)
    await loadSkills()
    setMessage('已复制。')
  }

  const remove = async () => {
    if (!selected || isBuiltIn) return
    await deleteSkillTemplate(selected.id)
    newSkill()
    await loadSkills()
    setMessage('已删除。')
  }

  return (
    <div className="editor-page">
      <div className="editor-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>返回首页</button>
        <h2 className="editor-title">技能管理</h2>
        <button className="btn btn-primary" onClick={newSkill}>新建技能</button>
      </div>
      <div className="editor-body">
        <aside className="editor-sidebar">
          <div className="sidebar-title">技能列表</div>
          <ul className="character-list">
            {sortedSkills.map((skill) => (
              <li
                key={skill.id}
                className={`character-list-item ${selected?.id === skill.id ? 'selected' : ''}`}
                onClick={() => selectSkill(skill)}
              >
                <div className="character-list-item-portrait portrait-placeholder-sm">{skill.iconUrl || '技'}</div>
                <div className="character-list-item-info">
                  <div className="character-list-item-name">{skill.name}</div>
                  <div className="character-list-item-stats">
                    {skill.skillKind === 'built_in' ? '内置' : '自定义'} | {skill.usableAs.map((item) => USAGE_LABELS[item] ?? item).join('、')}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <main className="editor-main">
          <form className="character-form" onSubmit={save}>
            <h3 className="form-title">{selected ? `编辑：${selected.name}` : '新建自定义技能'}</h3>
            {message && <div className="form-message form-message-success">{message}</div>}
            {isBuiltIn && <div className="form-message form-message-error">内置技能不能直接编辑，可以先复制为自定义技能。</div>}

            <div className="form-section">
              <h4>基础信息</h4>
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
                  <label className="form-label">图标</label>
                  <input className="form-input" value={form.iconUrl ?? ''} onChange={(e) => setForm({ ...form, iconUrl: e.target.value || null })} />
                </div>
                <div className="form-row">
                  <label className="form-label">分类</label>
                  <select className="form-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as 'character' | 'common' })}>
                    <option value="common">{CATEGORY_LABELS.common}</option>
                    <option value="character">{CATEGORY_LABELS.character}</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">描述</label>
                <textarea className="form-input form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>

            <div className="form-section">
              <h4>可用场景</h4>
              <div className="char-skill-grid">
                {USAGE_OPTIONS.map((usage) => (
                  <button key={usage} type="button" className={`char-skill-tag ${form.usableAs.includes(usage) ? 'checked' : ''}`} onClick={() => toggleUsage(usage)}>
                    {USAGE_LABELS[usage]}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h4>规则配置</h4>
              <div className="form-grid">
                <div className="form-row">
                  <label className="form-label">消耗行动点</label>
                  <input className="form-input" type="number" min={0} value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
                </div>
                <div className="form-row">
                  <label className="form-label">施放范围</label>
                  <input className="form-input" type="number" min={0} value={form.range} onChange={(e) => setForm({ ...form, range: Number(e.target.value) })} />
                </div>
                <div className="form-row">
                  <label className="form-label">目标类型</label>
                  <select className="form-input" value={form.targetType} onChange={(e) => setForm({ ...form, targetType: e.target.value })}>
                    <option value="single">{TARGET_LABELS.single}</option>
                    <option value="self">{TARGET_LABELS.self}</option>
                    <option value="emptyCell">{TARGET_LABELS.emptyCell}</option>
                    <option value="direction">{TARGET_LABELS.direction}</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">影响范围</label>
                  <select className="form-input" value={form.areaType} onChange={(e) => setForm({ ...form, areaType: e.target.value })}>
                    <option value="single">{AREA_LABELS.single}</option>
                    <option value="none">{AREA_LABELS.none}</option>
                    <option value="line">{AREA_LABELS.line}</option>
                    <option value="cross">{AREA_LABELS.cross}</option>
                    <option value="square">{AREA_LABELS.square}</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">效果</label>
                  <select className="form-input" value={form.effects[0]?.type ?? 'damage'} onChange={(e) => setEffect({ type: e.target.value })}>
                    <option value="damage">{EFFECT_LABELS.damage}</option>
                    <option value="heal">{EFFECT_LABELS.heal}</option>
                    <option value="grant_temporary_ap">{EFFECT_LABELS.grant_temporary_ap}</option>
                    <option value="grant_permanent_ap">{EFFECT_LABELS.grant_permanent_ap}</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">效果数值</label>
                  <input className="form-input" type="number" value={form.effects[0]?.value ?? 0} onChange={(e) => setEffect({ value: Number(e.target.value), metadata: {} })} />
                </div>
              </div>
            </div>

            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={loading || isBuiltIn}>{loading ? '保存中...' : '保存'}</button>
              <button className="btn btn-secondary" type="button" disabled={!selected} onClick={duplicate}>复制</button>
              <button className="btn btn-danger" type="button" disabled={!selected || isBuiltIn} onClick={remove}>删除</button>
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}
