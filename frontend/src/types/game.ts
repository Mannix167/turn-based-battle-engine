export type Direction = 'up' | 'down' | 'left' | 'right'

export interface Position {
  x: number
  y: number
}

export interface SkillInstance {
  instanceId: string
  templateId: string
  source: string
  isUsed: boolean
}

export interface StatusEffect {
  id: string
  type: string
  sourceEntityId: string
  targetEntityId: string
  duration?: number
  remainingTurns?: number
  value?: number
  metadata: Record<string, unknown>
}

export interface BattleEntity {
  id: string
  type: 'character' | 'summon' | 'monster'
  name: string
  ownerId?: string
  controllerId?: string
  x: number
  y: number
  maxHp: number
  currentHp: number
  baseAttack: number
  currentAttack: number
  baseDefense: number
  currentDefense: number
  attackRange: number
  tempApPerTurn: number
  permanentAP: number
  temporaryAP: number
  speed: number
  critRate: number
  luck: number
  joinOrder: number
  isAlive: boolean
  activeRound: number
  extraTurnNextRound: number
  skillInstances: SkillInstance[]
  statusEffects: StatusEffect[]
}

export interface TreasureEntity {
  id: string
  type: 'treasure'
  name: string
  x: number
  y: number
  isDug: boolean
}

export interface PendingReward {
  killerEntityId: string
  defeatedEntityId: string
  availableTemplateIds: string[]
}

export interface GameStateRead {
  gameId: string
  mapId: string
  roundNumber: number
  currentEntityId: string | null
  actionQueue: string[]
  entities: BattleEntity[]
  treasures: TreasureEntity[]
  pendingRewards: Record<string, PendingReward>
  isFinished: boolean
  winnerGroup: string[]
  log: string[]
}

export interface StartGameRequest {
  mapId: string
  entityIds: string[]
  positions: Record<string, Position>
  selectedSkillTemplateIds?: Record<string, string[]>
}

export interface UseSkillPayload {
  casterId: string
  skillInstanceId: string
  targetEntityId?: string
  targetCell?: Position
  direction?: Direction
}
