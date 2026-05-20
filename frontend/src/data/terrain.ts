import type { TerrainType } from '../types/map'

/** 地形定义，用于前端展示和交互提示，不包含规则计算 */
export interface TerrainDefinition {
  type: TerrainType
  name: string
  description: string
  /** 是否可进入 */
  walkable: boolean
  /** 是否可部署 */
  blocksPlacement: boolean
  /** 是否阻挡直线技能 */
  blocksLineOfEffect: boolean
  /** 离开消耗 AP */
  leaveCost: number
  /** 进入消耗 AP */
  enterCost: number
  /** 是否危险地形（前端展示用） */
  dangerous: boolean
  /** 背景图片路径 */
  imageUrl: string
  /** 颜色占位（无图片时使用） */
  color: string
  /** 编辑器中的 emoji 图标 */
  icon: string
  /** tooltip 详情 */
  tooltipLines: string[]
}

const BASE = '/terrain'

export const TERRAIN_DEFINITIONS: Record<TerrainType, TerrainDefinition> = {
  normal: {
    type: 'normal',
    name: '普通地形',
    description: '普通可行走地形。',
    walkable: true,
    blocksPlacement: false,
    blocksLineOfEffect: false,
    leaveCost: 1,
    enterCost: 1,
    dangerous: false,
    imageUrl: `${BASE}/normal.png`,
    color: 'rgba(120, 180, 120, 0.25)',
    icon: '',
    tooltipLines: ['可进入', '离开消耗：1 AP'],
  },
  obstacle: {
    type: 'obstacle',
    name: '障碍物',
    description: '不可进入，阻挡直线技能。',
    walkable: false,
    blocksPlacement: true,
    blocksLineOfEffect: true,
    leaveCost: Infinity,
    enterCost: Infinity,
    dangerous: false,
    imageUrl: `${BASE}/obstacle.png`,
    color: 'rgba(80, 80, 90, 0.55)',
    icon: '🪨',
    tooltipLines: ['不可进入', '不可部署', '阻挡直线技能'],
  },
  lava: {
    type: 'lava',
    name: '岩浆',
    description: '回合开始时受到 5 点真实伤害。',
    walkable: true,
    blocksPlacement: false,
    blocksLineOfEffect: false,
    leaveCost: 1,
    enterCost: 1,
    dangerous: true,
    imageUrl: `${BASE}/lava.png`,
    color: 'rgba(220, 80, 30, 0.35)',
    icon: '🔥',
    tooltipLines: ['⚠️ 危险地形', '可进入', '回合开始受到 5 点真实伤害', '离开消耗：1 AP'],
  },
  swamp: {
    type: 'swamp',
    name: '沼泽',
    description: '从该格离开需要 2 AP。',
    walkable: true,
    blocksPlacement: false,
    blocksLineOfEffect: false,
    leaveCost: 2,
    enterCost: 1,
    dangerous: false,
    imageUrl: `${BASE}/swamp.png`,
    color: 'rgba(50, 100, 50, 0.4)',
    icon: '🌿',
    tooltipLines: ['可进入', '离开消耗：2 AP', '进入消耗：1 AP'],
  },
  wood_stake: {
    type: 'wood_stake',
    name: '木桩',
    description: '不可进入，可被攻击，拥有 10 点生命值，摧毁后变为普通地形。',
    walkable: false,
    blocksPlacement: true,
    blocksLineOfEffect: true,
    leaveCost: Infinity,
    enterCost: Infinity,
    dangerous: false,
    imageUrl: `${BASE}/wood_stake.png`,
    color: 'rgba(140, 90, 40, 0.45)',
    icon: '🪵',
    tooltipLines: ['不可进入', '不可部署', '阻挡直线技能', '可被攻击', 'HP：10', '摧毁后变为普通地形'],
  },
  ice: {
    type: 'ice',
    name: '冰面',
    description: '从冰面离开不消耗行动点。',
    walkable: true,
    blocksPlacement: false,
    blocksLineOfEffect: false,
    leaveCost: 0,
    enterCost: 0,
    dangerous: false,
    imageUrl: `${BASE}/ice.png`,
    color: 'rgba(100, 180, 255, 0.3)',
    icon: '❄️',
    tooltipLines: ['可进入', '离开消耗：0 AP', '进入消耗：0 AP'],
  },
  thunderstorm: {
    type: 'thunderstorm',
    name: '雷暴',
    description: '回合开始时根据幸运值概率受到 30 点真实伤害。',
    walkable: true,
    blocksPlacement: false,
    blocksLineOfEffect: false,
    leaveCost: 1,
    enterCost: 1,
    dangerous: true,
    imageUrl: `${BASE}/thunderstorm.png`,
    color: 'rgba(120, 60, 200, 0.35)',
    icon: '⚡',
    tooltipLines: ['⚠️ 危险地形', '可进入', '回合开始雷击判定', '雷击概率 = 100 - 幸运值', '伤害：30 真实伤害', '离开消耗：1 AP'],
  },
}

export const TERRAIN_TYPES: TerrainType[] = [
  'normal', 'obstacle', 'lava', 'swamp', 'wood_stake', 'ice', 'thunderstorm',
]

/** 获取地形 tooltip 文本（含木桩动态 HP） */
export function getTerrainTooltip(terrainType: TerrainType, terrainState?: { hp?: number | null; maxHp?: number | null } | null): string {
  const def = TERRAIN_DEFINITIONS[terrainType]
  if (!def) return terrainType

  const lines = [...def.tooltipLines]

  // 木桩动态 HP
  if (terrainType === 'wood_stake' && terrainState) {
    const hp = terrainState.hp ?? 10
    const maxHp = terrainState.maxHp ?? 10
    const hpIdx = lines.findIndex((l) => l.startsWith('HP：'))
    if (hpIdx >= 0) {
      lines[hpIdx] = `HP：${hp} / ${maxHp}`
    }
  }

  return `${def.name}\n${lines.join('\n')}`
}

/** 获取移动消耗提示文字 */
export function getMoveCostHint(terrainType: TerrainType): string | null {
  const def = TERRAIN_DEFINITIONS[terrainType]
  if (!def) return null
  if (!def.walkable) return null
  if (def.leaveCost === 0) return '0 AP'
  if (def.leaveCost === 2) return '2 AP'
  return null
}
