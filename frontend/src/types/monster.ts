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
  tokenImageUrl: string | null
  portraitImageUrl: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type MonsterTemplateWrite = Omit<MonsterTemplateRead, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string
}
