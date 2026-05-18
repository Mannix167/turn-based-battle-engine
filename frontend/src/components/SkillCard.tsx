import React, { useState } from 'react'
import type { SkillInstance } from '../types/game'
import type { SkillTemplateRead } from '../types/skill'

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
      <div className="skill-card-icon">{icon}</div>
      <div className="skill-card-body">
        <div className="skill-card-name">{template.name}</div>
        <div className="skill-card-meta">
          <span className="skill-cost">行动:{template.cost}</span>
          <span className="skill-range">范围:{template.range}</span>
          <span className="skill-target">{targetLabel[template.targetType] ?? template.targetType}</span>
          {areaLabel[template.areaType] && <span className="skill-area">{areaLabel[template.areaType]}</span>}
        </div>
        <div className="skill-once-tag">一次性</div>
      </div>

      {showTooltip && (
        <div className="skill-tooltip">
          <div className="skill-tooltip-name">{template.name}</div>
          <div className="skill-tooltip-desc">{template.description || '暂无描述'}</div>
          <div className="skill-tooltip-meta">
            消耗:{template.cost} | 范围:{template.range} | {targetLabel[template.targetType]}
          </div>
          <div className="skill-tooltip-src">来源:{instance.source}</div>
        </div>
      )}
    </div>
  )
}
