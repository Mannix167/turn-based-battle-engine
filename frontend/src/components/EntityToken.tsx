import React from 'react'
import type { BattleEntity, TreasureEntity } from '../types/game'

interface Props {
  entity: BattleEntity | TreasureEntity
  isCurrentActor: boolean
  isSelected: boolean
  visualEffect?: { type: 'hit' | 'critical' | 'heal' | 'die' | 'cast' | 'move'; amount?: number }
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
  burn: '灼',
  stun: '晕',
  sync_hp: '链',
  damage_sync_link: '链',
  next_damage_multiplier: '爆',
  silence: '默',
  root: '禁',
  adrenaline: '肾',
  delayed_damage: '延',
  stat_modifier: '属',
  alliance: '盟',
}

const STATUS_LABELS: Record<string, string> = {
  burn: '灼烧',
  stun: '眩晕',
  sync_hp: '血量同步',
  damage_sync_link: '伤害同步',
  next_damage_multiplier: '下一次伤害强化',
  silence: '沉默',
  root: '禁走',
  adrenaline: '肾上腺素',
  delayed_damage: '延迟伤害',
  stat_modifier: '属性变化',
  alliance: '结盟',
}

export default function EntityToken({ entity, isCurrentActor, isSelected, visualEffect, tokenImageUrl }: Props) {
  const isTreasure = entity.type === 'treasure'
  const treasure = isTreasure ? (entity as TreasureEntity) : null
  const battle = !isTreasure ? (entity as BattleEntity) : null

  const hpPct = battle ? Math.max(0, Math.min(100, (battle.currentHp / battle.maxHp) * 100)) : 100

  const hpColor =
    hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ffb300' : '#f44336'

  const buffIcons = battle
    ? battle.statusEffects
        .slice(0, 3)
        .map((se) => ({ icon: BUFF_ICONS[se.type] ?? '状', label: STATUS_LABELS[se.type] ?? se.type, turns: se.remainingTurns }))
    : []

  const classNames = [
    'entity-token',
    isCurrentActor ? 'current-actor' : '',
    isSelected ? 'selected-token' : '',
    visualEffect ? `token-effect-${visualEffect.type}` : '',
    battle && !battle.isAlive ? 'dead-token' : '',
    isTreasure && treasure?.isDug ? 'dug-treasure' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const allianceColor = battle ? hashColor(battle.ownerId ?? battle.id) : '#888'

  return (
    <div className={classNames} title={entity.name}>
      {visualEffect?.type === 'critical' && <div className="token-effect-burst critical">-{visualEffect.amount ?? '暴击'}</div>}
      {visualEffect?.type === 'hit' && <div className="token-effect-burst hit">-{visualEffect.amount ?? '受击'}</div>}
      {visualEffect?.type === 'heal' && <div className="token-effect-burst heal">恢复</div>}
      {visualEffect?.type === 'cast' && <div className="token-cast-ring" />}

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
          <span className="token-treasure-icon">{treasure?.isDug ? '空' : '宝'}</span>
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
        <>
          <div className="token-hp-bar">
            <div
              className="token-hp-fill"
              style={{ width: `${hpPct}%`, background: hpColor }}
            />
          </div>
          <div className="token-hp-text">{battle.currentHp} / {battle.maxHp}</div>
        </>
      )}
    </div>
  )
}
