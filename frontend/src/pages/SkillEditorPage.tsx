import GameImage from '../components/GameImage'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createSkillTemplate,
  deleteSkillTemplate,
  duplicateSkillTemplate,
  listAllSkillTemplates,
  updateSkillTemplate,
} from '../api/skills'
import { listMonsterTemplates } from '../api/monsters'
import type { EffectConfig, EffectType, Rarity, SkillCategory, SkillTemplateRead, SkillTemplateWrite } from '../types/skill'
import type { MonsterTemplateRead } from '../types/monster'
import {
  EFFECT_TYPE_LABELS,
  TARGET_TYPE_LABELS,
  AREA_TYPE_LABELS,
  USAGE_OPTIONS,
  USAGE_LABELS,
  RARITY_COLORS,
  RARITY_LABELS,
  SKILL_CATEGORY_LABELS,
} from '../types/skill'

/* ── helpers ── */

const CATEGORY_LABELS = { common: '通用技能', character: '角色技能' } as const

const TARGET_CHECKBOXES = [
  { key: 'canTargetSelf', label: '自己' },
  { key: 'canTargetAlly', label: '盟友' },
  { key: 'canTargetEnemy', label: '非盟友' },
  { key: 'canTargetEmptyCell', label: '空地' },
  { key: 'canTargetMonster', label: '小怪' },
  { key: 'canTargetSummon', label: '召唤物' },
  { key: 'canTargetTreasure', label: '藏宝点' },
  { key: 'canTargetTerrain', label: '地形' },
] as const

/* 效果类型是否需要 value 字段 */
function effectNeedsValue(type: EffectType): boolean {
  return [
    'damage', 'heal', 'modify_stat', 'add_permanent_ap', 'add_temporary_ap',
    'grant_permanent_ap', 'grant_temporary_ap', 'set_stat_temporarily', 'delayed_damage',
    'delayed_area_damage',
  ].includes(type)
}

/* 效果类型需要 metadata.buffType */
function effectNeedsBuffType(type: EffectType): boolean {
  return type === 'add_buff' || type === 'remove_buff'
}

/* 效果类型需要 metadata.stat */
function effectNeedsStat(type: EffectType): boolean {
  return type === 'modify_stat' || type === 'set_stat_temporarily'
}

/* 效果类型需要 metadata.duration */
function effectNeedsDuration(type: EffectType): boolean {
  return ['add_buff', 'set_stat_temporarily', 'delayed_damage', 'delayed_area_damage'].includes(type)
}

const BUFF_TYPES = ['stun', 'burn', 'silence', 'root', 'stat_modifier', 'next_damage_multiplier', 'adrenaline'] as const
const STAT_OPTIONS = ['baseAttack', 'baseDefense', 'speed', 'luck', 'critRate', 'temporaryApPerTurn'] as const

const DEFAULT_FORM: SkillTemplateWrite = {
  name: '',
  description: '',
  iconUrl: null,
  skillKind: 'configurable',
  enabled: true,
  usableAs: ['common', 'reward'],
  rarity: 'common',
  skillPointCost: 1,
  categories: ['damage'],
  editable: true,
  isSystemSkill: false,
  version: 1,
  category: 'common',
  cost: 1,
  range: 3,
  targetType: 'single',
  areaType: 'single',
  areaSize: 1,
  affectSelfDamage: false,
  canTargetSelf: false,
  canTargetAlly: false,
  canTargetEnemy: true,
  canTargetEmptyCell: false,
  canTargetMonster: true,
  canTargetSummon: true,
  canTargetTreasure: false,
  canTargetTerrain: false,
  visual: {},
  effects: [{ type: 'damage', value: 10, metadata: {} }],
}

function emptyEffect(type: EffectType = 'damage'): EffectConfig {
  return { type, value: effectNeedsValue(type) ? 0 : undefined, metadata: {} }
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
    rarity: skill.rarity ?? 'common',
    skillPointCost: skill.skillPointCost ?? 1,
    categories: skill.categories?.length ? skill.categories : ['special'],
    editable: skill.editable ?? true,
    isSystemSkill: skill.isSystemSkill ?? skill.skillKind === 'built_in',
    version: skill.version ?? 1,
    areaSize: skill.areaSize ?? 1,
    affectSelfDamage: skill.affectSelfDamage ?? false,
    canTargetMonster: skill.canTargetMonster ?? true,
    canTargetSummon: skill.canTargetSummon ?? true,
    canTargetTreasure: skill.canTargetTreasure ?? false,
    canTargetTerrain: skill.canTargetTerrain ?? false,
    visual: skill.visual ?? {},
    effects: (skill.effects ?? []).map((e) => ({
      ...e,
      metadata: e.metadata ?? {},
      value: e.value ?? undefined,
    })),
  }
}

/* ── component ── */

export default function SkillEditorPage() {
  const navigate = useNavigate()
  const [skills, setSkills] = useState<SkillTemplateRead[]>([])
  const [creatures, setCreatures] = useState<MonsterTemplateRead[]>([])
  const [selected, setSelected] = useState<SkillTemplateRead | null>(null)
  const [form, setForm] = useState<SkillTemplateWrite>({ ...DEFAULT_FORM, effects: [emptyEffect()] })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [rarityFilter, setRarityFilter] = useState<'all' | Rarity>('all')
  const [categoryFilter, setCategoryFilter] = useState<'all' | SkillCategory>('all')
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [originFilter, setOriginFilter] = useState<'all' | 'system' | 'custom'>('all')
  const [usageFilter, setUsageFilter] = useState<'all' | 'common' | 'character'>('all')

  const selectedEditable = selected ? selected.editable !== false : true

  /* ── data ── */

  const loadSkills = useCallback(async () => {
    const [next, creatureData] = await Promise.all([listAllSkillTemplates(), listMonsterTemplates(true)])
    setSkills(next.map(normalizeSkill))
    setCreatures(creatureData.filter((creature) => creature.enabled && creature.canBeSummoned))
  }, [])

  useEffect(() => {
    loadSkills().catch(() => setMessage({ type: 'error', text: '技能列表加载失败，请确认后端已启动。' }))
  }, [loadSkills])

  const sortedSkills = useMemo(
    () => [...skills]
      .filter((skill) => {
        const q = keyword.trim().toLowerCase()
        if (q && !skill.name.toLowerCase().includes(q) && !skill.description.toLowerCase().includes(q)) return false
        if (rarityFilter !== 'all' && skill.rarity !== rarityFilter) return false
        if (categoryFilter !== 'all' && !skill.categories.includes(categoryFilter)) return false
        if (enabledFilter !== 'all' && skill.enabled !== (enabledFilter === 'enabled')) return false
        if (originFilter === 'system' && !skill.isSystemSkill) return false
        if (originFilter === 'custom' && skill.isSystemSkill) return false
        if (usageFilter !== 'all' && !skill.usableAs.includes(usageFilter)) return false
        return true
      })
      .sort((a, b) => Number(a.skillKind === 'built_in') - Number(b.skillKind === 'built_in') || a.name.localeCompare(b.name)),
    [skills, keyword, rarityFilter, categoryFilter, enabledFilter, originFilter, usageFilter],
  )

  /* ── actions ── */

  const selectSkill = (skill: SkillTemplateRead) => {
    setSelected(skill)
    setForm({
      ...skill,
      effects: skill.effects.length ? skill.effects.map((e) => ({ ...e })) : [emptyEffect()],
    })
    setMessage(null)
  }

  const newSkill = () => {
    setSelected(null)
    setForm({ ...DEFAULT_FORM, effects: [emptyEffect()] })
    setMessage(null)
  }

  const setField = <K extends keyof SkillTemplateWrite>(key: K, value: SkillTemplateWrite[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const toggleUsage = (usage: (typeof USAGE_OPTIONS)[number]) => {
    setForm((prev) => {
      const next = prev.usableAs.includes(usage)
        ? prev.usableAs.filter((item) => item !== usage)
        : [...prev.usableAs, usage]
      return { ...prev, usableAs: next }
    })
  }

  /* ── effects ── */

  const updateEffect = (index: number, patch: Partial<EffectConfig>) => {
    setForm((prev) => ({
      ...prev,
      effects: prev.effects.map((effect, i) => (i === index ? { ...effect, ...patch } : effect)),
    }))
  }

  const changeEffectType = (index: number, newType: EffectType) => {
    const needsVal = effectNeedsValue(newType)
    setForm((prev) => ({
      ...prev,
      effects: prev.effects.map((effect, i) =>
        i === index
          ? { type: newType, value: needsVal ? (effect.value ?? 0) : undefined, metadata: {} }
          : effect
      ),
    }))
  }

  const updateEffectMeta = (index: number, key: string, value: unknown) => {
    setForm((prev) => ({
      ...prev,
      effects: prev.effects.map((effect, i) =>
        i === index ? { ...effect, metadata: { ...effect.metadata, [key]: value } } : effect
      ),
    }))
  }

  const addEffect = () => {
    setForm((prev) => ({ ...prev, effects: [...prev.effects, emptyEffect()] }))
  }

  const removeEffect = (index: number) => {
    setForm((prev) => ({ ...prev, effects: prev.effects.filter((_, i) => i !== index) }))
  }

  /* ── save / duplicate / delete ── */

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim()) {
      setMessage({ type: 'error', text: '技能名称不能为空' })
      return
    }
    if (form.effects.length === 0) {
      setMessage({ type: 'error', text: '至少需要一个效果' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const payload = selected?.isSystemSkill ? { ...form, skillKind: 'built_in' as const, isSystemSkill: true } : { ...form, skillKind: 'configurable' as const, isSystemSkill: false }
      const saved = selected ? await updateSkillTemplate(selected.id, payload) : await createSkillTemplate(payload)
      setSelected(saved)
      setForm({ ...saved, effects: saved.effects.length ? saved.effects : [emptyEffect()] })
      await loadSkills()
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

  const duplicate = async () => {
    if (!selected) return
    const copied = await duplicateSkillTemplate(selected.id)
    setSelected(copied)
    setForm({ ...copied, effects: copied.effects.length ? copied.effects : [emptyEffect()] })
    await loadSkills()
    setMessage({ type: 'success', text: '已复制。' })
  }

  const remove = async () => {
    if (!selected || selected.isSystemSkill) return
    await deleteSkillTemplate(selected.id)
    newSkill()
    await loadSkills()
    setMessage({ type: 'success', text: '已删除。' })
  }

  /* ── render ── */

  return (
    <div className="editor-page">
      <div className="editor-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>← 返回首页</button>
        <h2 className="editor-title">技能管理</h2>
        <button className="btn btn-primary" onClick={newSkill}>+ 新建技能</button>
      </div>

      <div className="editor-body">
        {/* 左侧列表 */}
        <aside className="editor-sidebar">
          <div className="sidebar-title">技能列表</div>
          <div className="skill-filter-panel">
            <input className="form-input" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索名称或描述" />
            <select className="form-input" value={rarityFilter} onChange={(e) => setRarityFilter(e.target.value as 'all' | Rarity)}>
              <option value="all">全部稀有度</option>
              {(Object.keys(RARITY_LABELS) as Rarity[]).map((rarity) => <option key={rarity} value={rarity}>{RARITY_LABELS[rarity]}</option>)}
            </select>
            <select className="form-input" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as 'all' | SkillCategory)}>
              <option value="all">全部分类</option>
              {(Object.keys(SKILL_CATEGORY_LABELS) as SkillCategory[]).map((category) => <option key={category} value={category}>{SKILL_CATEGORY_LABELS[category]}</option>)}
            </select>
            <select className="form-input" value={enabledFilter} onChange={(e) => setEnabledFilter(e.target.value as typeof enabledFilter)}>
              <option value="all">全部状态</option>
              <option value="enabled">启用</option>
              <option value="disabled">禁用</option>
            </select>
            <select className="form-input" value={originFilter} onChange={(e) => setOriginFilter(e.target.value as typeof originFilter)}>
              <option value="all">全部来源</option>
              <option value="system">系统自带</option>
              <option value="custom">自定义</option>
            </select>
            <select className="form-input" value={usageFilter} onChange={(e) => setUsageFilter(e.target.value as typeof usageFilter)}>
              <option value="all">全部用途</option>
              <option value="common">开局通用</option>
              <option value="character">角色特定</option>
            </select>
          </div>
          <ul className="skill-editor-list">
            {sortedSkills.map((skill) => (
              <li
                key={skill.id}
                className={`skill-editor-list-item ${selected?.id === skill.id ? 'selected' : ''}`}
                onClick={() => selectSkill(skill)}
              >
                <div className="skill-editor-icon">
                  <GameImage fallbackKind="skill" src={skill.iconUrl} alt={skill.name} />
                </div>
                <div className="skill-editor-list-info">
                  <div className="skill-editor-list-name">
                    {skill.name}
                    {!skill.enabled && <span className="tag-disabled">禁</span>}
                    <span className="rarity-pill" style={{ borderColor: RARITY_COLORS[skill.rarity], color: RARITY_COLORS[skill.rarity] }}>{RARITY_LABELS[skill.rarity]}</span>
                  </div>
                  <div className="skill-editor-list-meta">
                    <span>{skill.isSystemSkill ? '系统' : '自定义'}</span>
                    <span>点 {skill.skillPointCost}</span>
                    <span>费 {skill.cost}</span>
                    <span>距 {skill.range}</span>
                  </div>
                  <div className="skill-editor-list-desc">
                    {skill.description || '暂无技能描述'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        {/* 右侧表单 */}
        <main className="editor-main">
          <form className="character-form" onSubmit={save}>
            <h3 className="form-title">{selected ? `编辑：${selected.name}` : '新建自定义技能'}</h3>

            {message && (
              <div className={`form-message form-message-${message.type}`}>{message.text}</div>
            )}
            {selected?.isSystemSkill && (
              <div className="form-message form-message-success">系统技能可直接编辑。保存后会写入数据库，不会被启动时默认种子覆盖。</div>
            )}

            {/* ── 基础信息 ── */}
            <div className="form-section">
              <h4>基础信息</h4>
              <div className="form-grid">
                {!selected && (
                  <div className="form-row">
                    <label className="form-label">可选 ID</label>
                    <input className="form-input" value={form.id ?? ''} onChange={(e) => setField('id', e.target.value || undefined)} />
                  </div>
                )}
                <div className="form-row">
                  <label className="form-label">名称 <span className="required">*</span></label>
                  <input className="form-input" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
                </div>
                <div className="form-row">
                  <label className="form-label">图标图片 URL</label>
                  <input className="form-input" value={form.iconUrl ?? ''} onChange={(e) => setField('iconUrl', e.target.value || null)} placeholder="/api/skills/icons/custom.svg" />
                </div>
                <div className="form-row">
                  <label className="form-label">分类</label>
                  <select className="form-input" value={form.category} onChange={(e) => setField('category', e.target.value as 'character' | 'common')}>
                    <option value="common">{CATEGORY_LABELS.common}</option>
                    <option value="character">{CATEGORY_LABELS.character}</option>
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">启用</label>
                  <label className="toggle-label">
                    <input type="checkbox" checked={form.enabled} onChange={(e) => setField('enabled', e.target.checked)} />
                    {form.enabled ? '已启用' : '已禁用'}
                  </label>
                </div>
                <div className="form-row">
                  <label className="form-label">稀有度</label>
                  <select className="form-input" value={form.rarity} onChange={(e) => setField('rarity', e.target.value as Rarity)}>
                    {(Object.keys(RARITY_LABELS) as Rarity[]).map((rarity) => <option key={rarity} value={rarity}>{RARITY_LABELS[rarity]}</option>)}
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">开局技能点消耗</label>
                  <input className="form-input" type="number" min={0} value={form.skillPointCost} onChange={(e) => setField('skillPointCost', Number(e.target.value))} />
                </div>
              </div>
              <div className="form-row">
                <label className="form-label">描述</label>
                <textarea className="form-input form-textarea" value={form.description} onChange={(e) => setField('description', e.target.value)} rows={2} placeholder="技能效果描述" />
              </div>
            </div>

            {/* ── 可用场景 ── */}
            <div className="form-section">
              <h4>可用场景（usableAs）</h4>
              <div className="char-skill-grid">
                {USAGE_OPTIONS.map((usage) => (
                  <button key={usage} type="button" className={`char-skill-tag ${form.usableAs.includes(usage) ? 'checked' : ''}`} onClick={() => toggleUsage(usage)}>
                    {USAGE_LABELS[usage]}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-section">
              <h4>机制分类</h4>
              <div className="char-skill-grid">
                {(Object.keys(SKILL_CATEGORY_LABELS) as SkillCategory[]).map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`char-skill-tag ${form.categories.includes(category) ? 'checked' : ''}`}
                    onClick={() => setField('categories', form.categories.includes(category) ? form.categories.filter((item) => item !== category) : [...form.categories, category])}
                  >
                    {SKILL_CATEGORY_LABELS[category]}
                  </button>
                ))}
              </div>
            </div>

            {/* ── 释放规则 ── */}
            <div className="form-section">
              <h4>释放规则</h4>
              <div className="form-grid">
                <div className="form-row">
                  <label className="form-label">消耗行动点</label>
                  <input className="form-input" type="number" min={0} value={form.cost} onChange={(e) => setField('cost', Number(e.target.value))} />
                </div>
                <div className="form-row">
                  <label className="form-label">施放范围</label>
                  <input className="form-input" type="number" min={0} value={form.range} onChange={(e) => setField('range', Number(e.target.value))} />
                </div>
                <div className="form-row">
                  <label className="form-label">目标类型</label>
                  <select className="form-input" value={form.targetType} onChange={(e) => setField('targetType', e.target.value as SkillTemplateWrite['targetType'])}>
                    {(Object.entries(TARGET_TYPE_LABELS) as [SkillTemplateRead['targetType'], string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">影响范围</label>
                  <select className="form-input" value={form.areaType} onChange={(e) => setField('areaType', e.target.value as SkillTemplateWrite['areaType'])}>
                    {(Object.entries(AREA_TYPE_LABELS) as [SkillTemplateRead['areaType'], string][]).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label className="form-label">范围尺寸</label>
                  <input className="form-input" type="number" min={0} value={form.areaSize} onChange={(e) => setField('areaSize', Number(e.target.value))} />
                </div>
                <div className="form-row">
                  <label className="form-label">自伤生效</label>
                  <label className="toggle-label">
                    <input type="checkbox" checked={form.affectSelfDamage} onChange={(e) => setField('affectSelfDamage', e.target.checked)} />
                    {form.affectSelfDamage ? '伤害可作用于自己' : '伤害默认不作用于自己'}
                  </label>
                </div>
              </div>
            </div>

            {/* ── 目标规则 ── */}
            <div className="form-section">
              <h4>目标规则</h4>
              <div className="target-checkboxes">
                {TARGET_CHECKBOXES.map(({ key, label }) => (
                  <label key={key} className="target-checkbox-item">
                    <input
                      type="checkbox"
                      checked={form[key]}
                      onChange={(e) => setField(key, e.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* ── 效果列表 ── */}
            <div className="form-section">
              <h4>效果列表（Effects）</h4>
              {form.effects.map((effect, index) => (
                <div key={index} className="effect-item">
                  <div className="effect-item-header">
                    <span className="effect-item-index">效果 {index + 1}</span>
                    {form.effects.length > 1 && (
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => removeEffect(index)}>移除</button>
                    )}
                  </div>
                  <div className="form-grid">
                    {/* 效果类型 */}
                    <div className="form-row">
                      <label className="form-label">效果类型</label>
                      <select
                        className="form-input"
                        value={effect.type}
                        onChange={(e) => changeEffectType(index, e.target.value as EffectType)}
                      >
                        {(Object.entries(EFFECT_TYPE_LABELS) as [EffectType, string][]).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>

                    {/* 数值（部分类型需要） */}
                    {effectNeedsValue(effect.type) && (
                      <div className="form-row">
                        <label className="form-label">数值</label>
                        <input
                          className="form-input"
                          type="number"
                          value={effect.value ?? 0}
                          onChange={(e) => updateEffect(index, { value: Number(e.target.value) })}
                        />
                      </div>
                    )}

                    {/* Buff 类型 */}
                    {effectNeedsBuffType(effect.type) && (
                      <div className="form-row">
                        <label className="form-label">Buff 类型</label>
                        <select
                          className="form-input"
                          value={(effect.metadata?.buffType as string) ?? 'burn'}
                          onChange={(e) => updateEffectMeta(index, 'buffType', e.target.value)}
                        >
                          {BUFF_TYPES.map((bt) => (
                            <option key={bt} value={bt}>{bt}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 修改属性 */}
                    {effectNeedsStat(effect.type) && (
                      <div className="form-row">
                        <label className="form-label">修改属性</label>
                        <select
                          className="form-input"
                          value={(effect.metadata?.stat as string) ?? 'attack'}
                          onChange={(e) => updateEffectMeta(index, 'stat', e.target.value)}
                        >
                          {STAT_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 持续回合 */}
                    {effectNeedsDuration(effect.type) && (
                      <div className="form-row">
                        <label className="form-label">持续回合</label>
                        <input
                          className="form-input"
                          type="number"
                          min={1}
                          value={(effect.metadata?.duration as number) ?? 1}
                          onChange={(e) => updateEffectMeta(index, 'duration', Number(e.target.value))}
                        />
                      </div>
                    )}
                    {effect.type === 'summon' && (
                      <div className="form-row">
                        <label className="form-label">召唤生物</label>
                        <select
                          className="form-input"
                          value={(effect.metadata?.creatureTemplateId as string) ?? ''}
                          onChange={(e) => updateEffectMeta(index, 'creatureTemplateId', e.target.value)}
                        >
                          <option value="">使用效果内基础参数</option>
                          {creatures.map((creature) => (
                            <option key={creature.id} value={creature.id}>{creature.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" className="btn btn-secondary" onClick={addEffect}>+ 添加效果</button>
            </div>

            {/* ── 操作按钮 ── */}
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={loading || !selectedEditable}>
                {loading ? '保存中...' : '保存'}
              </button>
              <button className="btn btn-secondary" type="button" disabled={!selected} onClick={duplicate}>复制</button>
              <button className="btn btn-danger" type="button" disabled={!selected || selected.isSystemSkill} onClick={remove}>删除</button>
            </div>
          </form>
        </main>
      </div>
    </div>
  )
}
