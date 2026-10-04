import React from 'react'
import type { BattleEntity, Faction, TreasureEntity } from '../types/game'
import GameImage from './GameImage'
import StatusIcon from './StatusIcon'
import { statusVisual } from '../data/assets'
import type { TokenVisualEffect } from '../battle/playback'

interface Props {
  entity: BattleEntity | TreasureEntity
  isCurrentActor: boolean
  isSelected: boolean
  visualEffect?: TokenVisualEffect
  tokenImageUrl?: string | null
  faction?: Faction | null
  allianceNames?: string[]
}

// 根据 entity id 哈希出一种颜色（阵营色）
function hashColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff
  const hue = h % 360
  return `hsl(${hue},70%,55%)`
}

export default function EntityToken({ entity, isCurrentActor, isSelected, visualEffect, tokenImageUrl, faction, allianceNames = [] }: Props) {
  const isTreasure = entity.type === 'treasure'
  const treasure = isTreasure ? (entity as TreasureEntity) : null
  const battle = !isTreasure ? (entity as BattleEntity) : null

  const hpPct = battle ? Math.max(0, Math.min(100, (battle.currentHp / battle.maxHp) * 100)) : 100

  const hpColor =
    hpPct > 60 ? '#4caf50' : hpPct > 30 ? '#ffb300' : '#f44336'

  const buffIcons = battle
    ? battle.statusEffects
        .map((se) => ({ id: se.id, type: se.type, label: statusVisual(se.type).label, turns: se.remainingTurns }))
        .sort((a, b) => (['stun', 'root', 'silence', 'burn'].indexOf(a.type) + 1 || 99) - (['stun', 'root', 'silence', 'burn'].indexOf(b.type) + 1 || 99))
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

  const allianceColor = battle ? (faction?.color ?? hashColor(battle.factionId || battle.ownerId || battle.id)) : '#888'

  return (
    <div className={classNames} title={faction ? `${entity.name} / ${faction.name}` : entity.name} style={visualEffect?.fromPosition && visualEffect.targetPosition ? {
      '--token-move-x': `${(visualEffect.fromPosition.x - visualEffect.targetPosition.x) * 72}px`,
      '--token-move-y': `${(visualEffect.fromPosition.y - visualEffect.targetPosition.y) * 72}px`,
    } as React.CSSProperties : visualEffect?.targetPosition && battle ? {
      '--token-attack-x': `${Math.sign(visualEffect.targetPosition.x - battle.x) * 9}px`,
      '--token-attack-y': `${Math.sign(visualEffect.targetPosition.y - battle.y) * 9}px`,
    } as React.CSSProperties : undefined}>
      {visualEffect?.type === 'critical' && <div className="token-effect-burst critical">-{visualEffect.amount ?? '暴击'}</div>}
      {visualEffect?.type === 'hit' && <div className="token-effect-burst hit">-{visualEffect.amount ?? '受击'}</div>}
      {visualEffect?.type === 'heal' && <div className="token-effect-burst heal">+{visualEffect.amount ?? '恢复'}</div>}
      {visualEffect?.type === 'buff' && <div className="token-effect-burst buff">状态变化</div>}
      {visualEffect?.type === 'cast' && <div className="token-cast-ring" />}

      {/* 阵营颜色圆点 */}
      {battle && (
        <div className="token-faction-dot" style={{ background: allianceColor }} />
      )}
      {battle?.type === 'summon' && <div className="token-summon-mark">召</div>}
      {battle?.type === 'monster' && <div className="token-summon-mark token-monster-mark">怪</div>}

      {/* Buff 图标 */}
      {(buffIcons.length > 0 || allianceNames.length > 0) && (
        <div className="token-buffs">
          {buffIcons.slice(0, 3).map((b) => (
            <span key={b.id} className="token-buff-icon" title={`${b.label}${b.turns != null ? ` (${b.turns}回合)` : ''}`}>
              <StatusIcon type={b.type} />
            </span>
          ))}
          {buffIcons.length > 3 && <span className="token-buff-overflow" title={buffIcons.slice(3).map((b) => `${b.label} ${b.turns ?? '∞'}`).join('、')}>+{buffIcons.length - 3}</span>}
          {allianceNames.length > 0 && <span className="token-buff-icon" title={`结盟：${allianceNames.join('、')}`}><StatusIcon type="alliance" /></span>}
        </div>
      )}

      {/* 主体图像 */}
      <div className="token-body">
        <GameImage src={tokenImageUrl ?? battle?.tokenImageUrl} fallbackKind={isTreasure ? 'treasure' : battle?.type ?? 'character'} alt={entity.name} className="token-img" />
        {!isTreasure && <span className="token-name-mark">{entity.name.charAt(0)}</span>}
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
