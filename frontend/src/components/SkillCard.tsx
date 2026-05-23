import React, { useState } from 'react'
import type { SkillInstance } from '../types/game'
import type { SkillTemplateRead } from '../types/skill'
import { RARITY_COLORS, RARITY_LABELS } from '../types/skill'

const EFFECT_ICONS: Record<string, string> = {
  damage: '伤',
  heal: '疗',
  add_buff: '增',
  remove_buff: '净',
  modify_stat: '属',
  add_permanent_ap: '久',
  add_temporary_ap: '动',
  grant_permanent_ap: '久',
  grant_temporary_ap: '动',
  grant_random_common_skill: '技',
  extra_turn_next_round: '回',
  alliance: '盟',
  remove_alliance: '断',
  swap_attack: '换',
  sync_hp: '同',
  summon: '召',
  delayed_damage: '延',
  grant_skill: '技',
  burn: '火',
  stun: '晕',
}

function getSkillIcon(template: SkillTemplateRead): string {
  if (template.iconUrl) return template.iconUrl
  const first = template.effects[0] as { type: string } | undefined
  return first ? EFFECT_ICONS[first.type] ?? '技' : '技'
}

interface Props {
  instance: SkillInstance
  template: SkillTemplateRead
  isSelected: boolean
  onClick: () => void
}

export default function SkillCard({ instance, template, isSelected, onClick }: Props) {
  const [showTooltip, setShowTooltip] = useState(false)
  const icon = getSkillIcon(template)
  const quantity = Math.max(0, instance.quantity ?? 1)

  const targetLabel: Record<string, string> = {
    single: '单体',
    emptyCell: '空格',
    direction: '方向',
    self: '自身',
  }

  const areaLabel: Record<string, string> = {
    single: '',
    line: '直线',
    cross: '十字',
    square: '方形',
    none: '',
  }

  return (
    <div
      className={`skill-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="skill-card-icon">
        {icon.startsWith('/') || icon.startsWith('http') ? <img src={icon} alt={template.name} /> : icon}
      </div>
      <div className="skill-card-body">
        <div className="skill-card-title-row">
          <div className="skill-card-name">{template.name}</div>
          <span className="rarity-pill" style={{ borderColor: RARITY_COLORS[template.rarity], color: RARITY_COLORS[template.rarity] }}>
            {RARITY_LABELS[template.rarity]}
          </span>
          {quantity > 1 && <span className="skill-stack-badge">x{quantity}</span>}
        </div>
        <div className="skill-card-desc">{template.description || '暂无技能描述'}</div>
        <div className="skill-card-meta">
          <span className="skill-cost">行动:{template.cost}</span>
          <span className="skill-cost">点数:{template.skillPointCost}</span>
          <span className="skill-range">范围:{template.range}</span>
          <span className="skill-target">{targetLabel[template.targetType] ?? template.targetType}</span>
          {areaLabel[template.areaType] && <span className="skill-area">{areaLabel[template.areaType]}</span>}
        </div>
        <div className="skill-once-tag">剩余 {quantity} / {instance.maxQuantity ?? 3}</div>
      </div>

      {showTooltip && (
        <div className="skill-tooltip">
          <div className="skill-tooltip-name">{template.name}</div>
          <div className="skill-tooltip-desc">{template.description || '暂无描述'}</div>
          <div className="skill-tooltip-meta">
            消耗:{template.cost} | 技能点:{template.skillPointCost} | 范围:{template.range} | {targetLabel[template.targetType]}
          </div>
          <div className="skill-tooltip-src">来源:{instance.source} | 数量:{quantity}/{instance.maxQuantity ?? 3}</div>
        </div>
      )}
    </div>
  )
}
