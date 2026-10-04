import GameImage from './GameImage'
import React, { useState } from 'react'
import type { SkillInstance } from '../types/game'
import type { SkillTemplateRead } from '../types/skill'
import { RARITY_COLORS, RARITY_LABELS } from '../types/skill'

interface Props {
  instance: SkillInstance
  template: SkillTemplateRead
  isSelected: boolean
  onClick: () => void
  disabled?: boolean
  unavailableReason?: string
}

export default function SkillCard({ instance, template, isSelected, onClick, disabled = false, unavailableReason }: Props) {
  const [showTooltip, setShowTooltip] = useState(false)
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
      className={`skill-card ${isSelected ? 'selected' : ''} ${disabled ? 'unavailable' : ''}`}
      role="button"
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onClick()}
      onKeyDown={(event) => { if (!disabled && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick() } }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="skill-card-icon">
        <GameImage fallbackKind="skill" src={template.iconUrl} alt={template.name} />
      </div>
      <div className="skill-card-body">
        <div className="skill-card-title-row">
          <div className="skill-card-name">{template.name}</div>
          <span className="skill-source-label">{instance.sourceTypes?.includes('character') || instance.source === 'character_default' ? '专属' : instance.sourceTypes?.includes('reward') ? '奖励' : '通用'}</span>
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
        {unavailableReason && <div className="skill-unavailable-reason">{unavailableReason}</div>}
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
