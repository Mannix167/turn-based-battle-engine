import React from 'react'
import type { BattleEntity, SkillInstance } from '../types/game'
import type { SkillTemplateRead } from '../types/skill'
import SkillCard from './SkillCard'

const BUFF_ICONS: Record<string, string> = {
  burn: '🔥',
  stun: '⭐',
  sync_hp: '🔗',
  delayed_damage: '⏰',
  stat_modifier: '📊',
  alliance: '🤝',
}
const BUFF_LABELS: Record<string, string> = {
  burn: '灼烧',
  stun: '眩晕',
  sync_hp: '血量同步',
  delayed_damage: '延迟伤害',
  stat_modifier: '属性变化',
  alliance: '结盟',
}

interface Props {
  entity: BattleEntity | null
  portraitImageUrl?: string | null
  templates: Record<string, SkillTemplateRead>
  selectedSkillId: string | null
  onSkillClick: (instance: SkillInstance) => void
  onBasicAttack: () => void
  onDigTreasure: () => void
  onEndAction: () => void
  interactionMode: string
  errorMessage: string | null
}

function ApDots({ count, color, label }: { count: number; color: string; label: string }) {
  if (count <= 10) {
    return (
      <div className="ap-dots">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="ap-dot" style={{ background: color }} title={label} />
        ))}
      </div>
    )
  }
  return (
    <span className="ap-text" style={{ color }}>
      {label}: {count}
    </span>
  )
}

export default function EntityPanel({
  entity,
  portraitImageUrl,
  templates,
  selectedSkillId,
  onSkillClick,
  onBasicAttack,
  onDigTreasure,
  onEndAction,
  interactionMode,
  errorMessage,
}: Props) {
  if (!entity) {
    return (
      <div className="entity-panel entity-panel-empty">
        <p>等待行动...</p>
      </div>
    )
  }

  const hpPct = Math.max(0, Math.min(100, (entity.currentHp / entity.maxHp) * 100))
  const hpColor = hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ffb300' : '#f44336'

  return (
    <div className="entity-panel">
      {/* 立绘与名称 */}
      <div className="panel-portrait-row">
        <div className="panel-portrait">
          {portraitImageUrl ? (
            <img src={portraitImageUrl} alt={entity.name} />
          ) : (
            <div className="panel-portrait-placeholder">
              {entity.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="panel-name-block">
          <div className="panel-name">{entity.name}</div>
          <div className={`panel-type-tag type-${entity.type}`}>
            {entity.type === 'character' ? '角色' : entity.type === 'summon' ? '召唤物' : '小怪'}
          </div>
        </div>
      </div>

      {/* HP 血条 */}
      <div className="panel-hp-block">
        <div className="panel-hp-label">
          <span>HP</span>
          <span style={{ color: hpColor }}>{entity.currentHp} / {entity.maxHp}</span>
        </div>
        <div className="panel-hp-bar">
          <div className="panel-hp-fill" style={{ width: `${hpPct}%`, background: hpColor }} />
        </div>
      </div>

      {/* 行动点 */}
      <div className="panel-ap-block">
        <div className="panel-ap-row">
          <span className="ap-label">临时AP</span>
          <ApDots count={entity.temporaryAP} color="#ffd700" label="临时AP" />
        </div>
        <div className="panel-ap-row">
          <span className="ap-label">永久AP</span>
          <ApDots count={entity.permanentAP} color="#4f8ef7" label="永久AP" />
        </div>
      </div>

      {/* 属性简要 */}
      <div className="panel-stats">
        <div className="panel-stat"><span>攻</span><span>{entity.currentAttack}</span></div>
        <div className="panel-stat"><span>防</span><span>{entity.currentDefense}</span></div>
        <div className="panel-stat"><span>速</span><span>{entity.speed}</span></div>
        <div className="panel-stat"><span>暴</span><span>{entity.critRate}%</span></div>
        <div className="panel-stat"><span>幸</span><span>{entity.luck}</span></div>
        <div className="panel-stat"><span>范</span><span>{entity.attackRange}</span></div>
      </div>

      {/* Buff 区域 */}
      {entity.statusEffects.length > 0 && (
        <div className="panel-buffs">
          <div className="panel-section-label">状态效果</div>
          <div className="panel-buff-list">
            {entity.statusEffects.map((se) => (
              <div
                key={se.id}
                className="panel-buff-item"
                title={`${BUFF_LABELS[se.type] ?? se.type}${se.remainingTurns != null ? ` (${se.remainingTurns}回合)` : ''}`}
              >
                <span className="panel-buff-icon">{BUFF_ICONS[se.type] ?? '❓'}</span>
                <span className="panel-buff-turns">
                  {se.remainingTurns != null ? se.remainingTurns : '∞'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 技能列表 */}
      {entity.skillInstances.length > 0 && (
        <div className="panel-skills">
          <div className="panel-section-label">技能</div>
          <div className="panel-skill-list">
            {entity.skillInstances.map((inst) => {
              const tmpl = templates[inst.templateId]
              if (!tmpl) return null
              return (
                <SkillCard
                  key={inst.instanceId}
                  instance={inst}
                  template={tmpl}
                  isSelected={selectedSkillId === inst.instanceId}
                  onClick={() => onSkillClick(inst)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* 操作按钮 */}
      <div className="panel-actions">
        {errorMessage && <div className="panel-error">{errorMessage}</div>}
        <div className="panel-action-buttons">
          <button
            className={`btn ${interactionMode === 'attacking' ? 'btn-active' : 'btn-secondary'}`}
            onClick={onBasicAttack}
          >
            ⚔️ 普通攻击
          </button>
          <button className="btn btn-secondary" onClick={onDigTreasure}>
            🎁 挖宝
          </button>
          <button className="btn btn-danger" onClick={onEndAction}>
            ✓ 结束行动
          </button>
        </div>
        {interactionMode !== 'idle' && (
          <div className="panel-mode-hint">
            {interactionMode === 'moving' && '点击地图格子移动'}
            {interactionMode === 'attacking' && '点击目标进行攻击'}
            {interactionMode === 'skill-target' && '点击目标释放技能'}
            {interactionMode === 'skill-direction' && '选择技能方向'}
          </div>
        )}
      </div>
    </div>
  )
}
