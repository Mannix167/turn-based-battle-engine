import React from 'react'
import type { BattleEntity, TreasureEntity } from '../types/game'

interface Props {
  entity: BattleEntity | TreasureEntity
  isCurrentActor: boolean
  isSelected: boolean
  tokenImageUrl?: string | null
}

// 根据 entity id 哈希出一种颜色（阵营色）
function hashColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff
  const hue = h % 360
  return `hsl(${hue},70%,55%)`
}

// Buff type → emoji
const BUFF_ICONS: Record<string, string> = {
  burn: '🔥',
  stun: '⭐',
  sync_hp: '🔗',
  delayed_damage: '⏰',
  stat_modifier: '📊',
  alliance: '🤝',
}

const STATUS_LABELS: Record<string, string> = {
  burn: '灼烧',
  stun: '眩晕',
  sync_hp: '血量同步',
  delayed_damage: '延迟伤害',
  stat_modifier: '属性变化',
  alliance: '结盟',
}

export default function EntityToken({ entity, isCurrentActor, isSelected, tokenImageUrl }: Props) {
  const isTreasure = entity.type === 'treasure'
  const treasure = isTreasure ? (entity as TreasureEntity) : null
  const battle = !isTreasure ? (entity as BattleEntity) : null

  const hpPct = battle ? Math.max(0, Math.min(100, (battle.currentHp / battle.maxHp) * 100)) : 100

  const hpColor =
    hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ffb300' : '#f44336'

  const buffIcons = battle
    ? battle.statusEffects
        .slice(0, 3)
        .map((se) => ({ icon: BUFF_ICONS[se.type] ?? '❓', label: STATUS_LABELS[se.type] ?? se.type, turns: se.remainingTurns }))
    : []

  const classNames = [
    'entity-token',
    isCurrentActor ? 'current-actor' : '',
    isSelected ? 'selected-token' : '',
    battle && !battle.isAlive ? 'dead-token' : '',
    isTreasure && treasure?.isDug ? 'dug-treasure' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const allianceColor = battle ? hashColor(battle.ownerId ?? battle.id) : '#888'

  return (
    <div className={classNames} title={entity.name}>
      {/* 阵营颜色圆点 */}
      {battle && (
        <div className="token-faction-dot" style={{ background: allianceColor }} />
      )}

      {/* Buff 图标 */}
      {buffIcons.length > 0 && (
        <div className="token-buffs">
          {buffIcons.map((b, i) => (
            <span key={i} className="token-buff-icon" title={`${b.label}${b.turns != null ? ` (${b.turns}回合)` : ''}`}>
              {b.icon}
            </span>
          ))}
        </div>
      )}

      {/* 主体图像 */}
      <div className="token-body">
        {isTreasure ? (
          <span className="token-treasure-icon">{treasure?.isDug ? '📦' : '🎁'}</span>
        ) : tokenImageUrl ? (
          <img src={tokenImageUrl} alt={entity.name} className="token-img" />
        ) : (
          <div
            className="token-placeholder"
            style={{
              background:
                battle?.type === 'monster'
                  ? '#5a1a1a'
                  : battle?.type === 'summon'
                  ? '#1a1a5a'
                  : '#1a3a5a',
            }}
          >
            {entity.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* 血条 */}
      {battle && battle.isAlive && (
        <div className="token-hp-bar">
          <div
            className="token-hp-fill"
            style={{ width: `${hpPct}%`, background: hpColor }}
          />
        </div>
      )}
    </div>
  )
}
