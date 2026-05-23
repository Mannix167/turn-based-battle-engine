/* ── EffectType ── 对齐 backend/app/schemas/skill.py ── */
export type EffectType =
  | 'damage'
  | 'heal'
  | 'add_buff'
  | 'remove_buff'
  | 'modify_stat'
  | 'add_permanent_ap'
  | 'add_temporary_ap'
  | 'grant_permanent_ap'
  | 'grant_temporary_ap'
  | 'grant_random_common_skill'
  | 'set_stat_temporarily'
  | 'delayed_area_damage'
  | 'link_damage_sync'
  | 'create_alliance'
  | 'swap_current_hp'
  | 'conditional_execute'
  | 'instant_kill'
  | 'random_damage'
  | 'extra_turn_next_round'
  | 'alliance'
  | 'remove_alliance'
  | 'swap_attack'
  | 'sync_hp'
  | 'summon'
  | 'delayed_damage'
  | 'grant_skill'
  | 'change_terrain'

/* ── EffectConfig ── 对齐 backend EffectConfig ── */
export interface EffectConfig {
  type: EffectType
  value?: number | null
  duration?: number | null
  delayTurns?: number | null
  stat?: string | null
  buffType?: string | null
  metadata?: Record<string, unknown>
}

export interface SkillVisualConfig {
  visualKey?: string | null
  impactColor?: string | null
  trailType?: string | null
  soundKey?: string | null
}

export type Rarity = 'common' | 'rare' | 'uncommon' | 'epic' | 'legendary'

export type SkillCategory =
  | 'damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'control'
  | 'movement'
  | 'summon'
  | 'terrain'
  | 'alliance'
  | 'resource'
  | 'special'

/* ── SkillTemplateRead ── 对齐 backend SkillTemplateRead ── */
export interface SkillTemplateRead {
  id: string
  name: string
  description: string
  iconUrl: string | null
  skillKind: 'built_in' | 'configurable'
  enabled: boolean
  usableAs: ('character' | 'common' | 'reward' | 'summon')[]
  rarity: Rarity
  skillPointCost: number
  categories: SkillCategory[]
  editable: boolean
  isSystemSkill: boolean
  version: number
  category: 'character' | 'common'
  cost: number
  range: number
  targetType: 'single' | 'self' | 'emptyCell' | 'direction' | 'twoEntities'
  areaType: 'single' | 'line' | 'cross' | 'square' | 'circle' | 'none'
  areaSize: number
  affectSelfDamage: boolean
  canTargetSelf: boolean
  canTargetAlly: boolean
  canTargetEnemy: boolean
  canTargetEmptyCell: boolean
  canTargetMonster: boolean
  canTargetSummon: boolean
  canTargetTreasure: boolean
  canTargetTerrain: boolean
  visual: SkillVisualConfig
  effects: EffectConfig[]
}

/* ── SkillTemplateWrite ── 对齐 backend SkillTemplateCreate / Update ── */
export interface SkillTemplateWrite {
  id?: string
  name: string
  description: string
  iconUrl: string | null
  skillKind: 'built_in' | 'configurable'
  enabled: boolean
  usableAs: ('character' | 'common' | 'reward' | 'summon')[]
  rarity: Rarity
  skillPointCost: number
  categories: SkillCategory[]
  editable: boolean
  isSystemSkill: boolean
  version: number
  category: 'character' | 'common'
  cost: number
  range: number
  targetType: 'single' | 'self' | 'emptyCell' | 'direction' | 'twoEntities'
  areaType: 'single' | 'line' | 'cross' | 'square' | 'circle' | 'none'
  areaSize: number
  affectSelfDamage: boolean
  canTargetSelf: boolean
  canTargetAlly: boolean
  canTargetEnemy: boolean
  canTargetEmptyCell: boolean
  canTargetMonster: boolean
  canTargetSummon: boolean
  canTargetTreasure: boolean
  canTargetTerrain: boolean
  visual: SkillVisualConfig
  effects: EffectConfig[]
}

/* ── 标签映射 ── */
export const EFFECT_TYPE_LABELS: Record<EffectType, string> = {
  damage: '造成伤害',
  heal: '治疗',
  add_buff: '添加 Buff',
  remove_buff: '移除 Buff',
  modify_stat: '修改属性',
  add_permanent_ap: '增加永久行动点',
  add_temporary_ap: '增加临时行动点',
  grant_permanent_ap: '赋予永久行动点',
  grant_temporary_ap: '赋予临时行动点',
  grant_random_common_skill: '随机获得通用技能',
  set_stat_temporarily: '临时设置属性',
  delayed_area_damage: '延迟范围伤害',
  link_damage_sync: '伤害同步',
  create_alliance: '结盟',
  swap_current_hp: '交换生命',
  conditional_execute: '条件处决',
  instant_kill: '立即击杀',
  random_damage: '随机伤害',
  extra_turn_next_round: '下回合额外行动',
  alliance: '结盟',
  remove_alliance: '解除结盟',
  swap_attack: '互换攻击力',
  sync_hp: '同步生命值',
  summon: '召唤单位',
  delayed_damage: '延迟伤害',
  grant_skill: '赋予技能',
  change_terrain: '改变地形',
}

export const TARGET_TYPE_LABELS: Record<SkillTemplateRead['targetType'], string> = {
  single: '单体目标',
  self: '自身',
  emptyCell: '空格',
  direction: '方向',
  twoEntities: '两个目标',
}

export const AREA_TYPE_LABELS: Record<SkillTemplateRead['areaType'], string> = {
  single: '单格',
  none: '无范围',
  line: '直线',
  cross: '十字',
  square: '方形',
  circle: '圆形',
}

export const USAGE_OPTIONS = ['character', 'common', 'reward', 'summon'] as const

export const USAGE_LABELS: Record<(typeof USAGE_OPTIONS)[number], string> = {
  character: '角色专属',
  common: '开局通用',
  reward: '击杀奖励',
  summon: '召唤单位',
}

export const RARITY_LABELS: Record<Rarity, string> = {
  common: '普通',
  rare: '稀有',
  uncommon: '罕见',
  epic: '史诗',
  legendary: '传说',
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#ffffff',
  rare: '#22c55e',
  uncommon: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
}

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  damage: '伤害',
  heal: '治疗',
  buff: '增益',
  debuff: '减益',
  control: '控制',
  movement: '位移',
  summon: '召唤',
  terrain: '地形',
  alliance: '结盟',
  resource: '资源',
  special: '特殊',
}
