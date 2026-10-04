/** Default assets are bundled with the frontend; uploaded URLs take precedence. */
export type AssetKind = 'character' | 'portrait' | 'skill' | 'treasure' | 'monster' | 'summon' | 'status'
export const DEFAULT_ASSETS: Record<AssetKind, string> = Object.fromEntries(
  ['character', 'portrait', 'skill', 'treasure', 'monster', 'summon', 'status'].map(
    (kind) => [kind, `/assets/placeholders/${kind}_default.svg`],
  ),
) as Record<AssetKind, string>

export const STATUS_VISUALS: Record<string, { label: string; icon: string }> = {
  burn: { label: '灼烧', icon: 'burn' },
  stun: { label: '眩晕', icon: 'stun' },
  sync_hp: { label: '血量同步', icon: 'chain' },
  damage_sync_link: { label: '伤害同步', icon: 'chain' },
  next_damage_multiplier: { label: '下一次伤害强化', icon: 'power' },
  silence: { label: '沉默', icon: 'silence' },
  root: { label: '禁走', icon: 'root' },
  adrenaline: { label: '肾上腺素', icon: 'power' },
  delayed_damage: { label: '延迟伤害', icon: 'delayed' },
  delayed_area_damage: { label: '延迟范围伤害', icon: 'delayed' },
  stat_modifier: { label: '属性变化', icon: 'stat' },
  alliance: { label: '结盟', icon: 'alliance' },
}

export function statusVisual(type: string) {
  const visual = STATUS_VISUALS[type]
  return { label: visual?.label ?? type, iconUrl: visual ? `/assets/buffs/icons/${visual.icon}.svg` : DEFAULT_ASSETS.status }
}
