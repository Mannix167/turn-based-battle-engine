export type SoundKey =
  | 'ui_click'
  | 'ui_hover'
  | 'move_step'
  | 'attack_slash'
  | 'counter_attack'
  | 'dig_success'
  | 'dig_fail'
  | 'skill_blast'
  | 'skill_heal'
  | 'skill_laser'
  | 'skill_chain'
  | 'skill_curse'
  | 'buff_apply'
  | 'damage_hit'
  | 'heal'
  | 'death'
  | 'terrain_lava'
  | 'terrain_wood_stake'
  | 'terrain_thunderstorm'
  | 'victory'
  | 'defeat'

export const soundRegistry: Partial<Record<SoundKey, string>> = {
  ui_click: '/audio/ui/click.wav',
  ui_hover: '/audio/ui/hover.wav',
  move_step: '/audio/actions/move_step.wav',
  attack_slash: '/audio/actions/attack_slash.wav',
  counter_attack: '/audio/actions/counter_attack.wav',
  death: '/audio/actions/death.wav',
  dig_success: '/audio/actions/dig_success.wav',
  dig_fail: '/audio/actions/dig_fail.wav',
  skill_blast: '/audio/skills/blast.wav',
  skill_heal: '/audio/skills/heal.wav',
  skill_laser: '/audio/skills/laser.wav',
  skill_chain: '/audio/skills/chain.wav',
  skill_curse: '/audio/skills/curse.wav',
  buff_apply: '/audio/skills/buff_apply.wav',
  damage_hit: '/audio/actions/damage_hit.wav',
  heal: '/audio/skills/heal.wav',
  terrain_lava: '/audio/terrain/lava.wav',
  terrain_wood_stake: '/audio/terrain/wood_stake.wav',
  terrain_thunderstorm: '/audio/terrain/thunderstorm.wav',
  victory: '/audio/system/victory.wav',
  defeat: '/audio/system/defeat.wav',
}

export function fallbackSoundForEvent(type: string, terrainType?: string | null): SoundKey | null {
  if (type.includes('move')) return 'move_step'
  if (type.includes('counter')) return 'counter_attack'
  if (type.includes('damage')) return terrainType ? null : 'damage_hit'
  if (type.includes('heal')) return 'heal'
  if (type.includes('death')) return 'death'
  if (type.includes('treasure_dig_success')) return 'dig_success'
  if (type.includes('treasure_dig_fail')) return 'dig_fail'
  if (type.includes('terrain_triggered') || type.includes('terrain_damaged')) {
    if (terrainType === 'lava') return 'terrain_lava'
    if (terrainType === 'wood_stake') return 'terrain_wood_stake'
    if (terrainType === 'thunderstorm') return 'terrain_thunderstorm'
  }
  if (type.includes('skill')) return 'skill_blast'
  return null
}
