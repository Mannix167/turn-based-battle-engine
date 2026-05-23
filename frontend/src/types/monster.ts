export interface MonsterTemplateRead {
  id: string
  name: string
  description: string
  maxHp: number
  baseAttack: number
  baseDefense: number
  attackRange: number
  speed: number
  critRate: number
  luck: number
  tempApPerTurn: number
  rarity: import('./skill').Rarity
  tokenImageUrl: string | null
  portraitImageUrl: string | null
  enabled: boolean
  canSpawnAsMonster: boolean
  canBeSummoned: boolean
  summonSkillTemplateIds: string[]
  createdAt: string
  updatedAt: string
}

export type MonsterTemplateWrite = Omit<MonsterTemplateRead, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}
