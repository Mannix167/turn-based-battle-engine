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
  quantity: number
  maxQuantity: number
  sourceTypes: string[]
  acquiredAt?: string | null
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
  factionId: string
  templateId?: string | null
  tokenImageUrl?: string | null
  portraitImageUrl?: string | null
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

export interface DamageEvent {
  sourceEntityId: string
  targetEntityId: string
  amount: number
  isCrit: boolean
  rawDamage: number
  linkedFromEntityId?: string | null
}

export interface GameMapRead {
  id: string
  name: string
  width: number
  height: number
  cells: import('./map').MapCell[]
}

export interface BattleEvent {
  id: string
  type: string
  timestamp: number
  actorId?: string | null
  targetIds?: string[]
  sourcePosition?: Position | null
  targetPosition?: Position | null
  targetPositions?: Position[]
  skillTemplateId?: string | null
  terrainType?: string | null
  oldTerrainType?: string | null
  newTerrainType?: string | null
  value?: number | null
  visualKey?: string | null
  soundKey?: string | null
  metadata?: Record<string, unknown>
}

export interface Faction {
  id: string
  name: string
  color: string
  iconUrl?: string | null
}

export interface GameStateRead {
  gameId: string
  mapId: string
  map: GameMapRead | null
  roundNumber: number
  currentEntityId: string | null
  actionQueue: string[]
  entities: BattleEntity[]
  treasures: TreasureEntity[]
  pendingRewards: Record<string, PendingReward>
  factions: Faction[]
  rewardSkillPoolTemplateIds: string[]
  rewardSkillTemplateRarities: Record<string, string>
  rarityDropWeights: Record<string, number>
  maxSkillStackQuantity: number
  startSeed: string | null
  recentDamageEvents: DamageEvent[]
  recentEvents: BattleEvent[]
  isFinished: boolean
  winnerGroup: string[]
  log: string[]
}

export interface StartGameRequest {
  mapId?: string
  mapTemplateId?: string
  entityIds?: string[]
  selectedCharacterIds?: string[]
  positions?: Record<string, Position>
  characterPlacements?: { characterId: string; position: Position }[]
  selectedSkillTemplateIds?: Record<string, string[]>
  selectedCommonSkillIdsByCharacterId?: Record<string, string[]>
  randomMonsterCount?: number
  randomTreasureCount?: number
  monsterTemplatePoolIds?: string[]
  rewardSkillPoolTemplateIds?: string[]
  factions?: Faction[]
  characterFactionAssignments?: Record<string, string>
  startSeed?: string | null
}

export interface PreviewStartResponse {
  startSeed: string
  previewMonsters: { id: string; monsterTemplateId: string; position: Position }[]
  previewTreasures: { id: string; position: Position }[]
  rewardSkillPoolTemplateIds: string[]
  rewardSkillTemplateRarities: Record<string, string>
  rarityDropWeights: Record<string, number>
  maxSkillStackQuantity: number
  warnings: string[]
}

export interface UseSkillPayload {
  casterId: string
  skillInstanceId: string
  targetEntityId?: string
  secondTargetEntityId?: string
  targetCell?: Position
  direction?: Direction
}

export type ActionPreviewType = 'attack' | 'skill' | 'move' | 'dig'

export interface ActionPreviewRequest {
  gameId: string
  actorId: string
  actionType: ActionPreviewType
  targetPosition?: Position
  targetEntityId?: string
  skillInstanceId?: string
  direction?: Direction
  selectedTargetIds?: string[]
}

export interface ActionPreviewApCost {
  temporaryAp: number
  permanentAp: number
  total: number
}

export interface DamagePreviewItem {
  targetEntityId: string
  targetName: string
  damageType: 'normal' | 'true' | 'percent_max_hp' | 'terrain'
  finalDamage: number
  baseDamage?: number | null
  defenseReduction?: number | null
  canCrit: boolean
  critRate?: number | null
  critDamagePreview?: number | null
  willKill: boolean
}

export interface ActionPreviewResponse {
  valid: boolean
  reason?: string | null
  actionType: ActionPreviewType
  apCost?: ActionPreviewApCost | null
  damagePreviews: DamagePreviewItem[]
  healPreviews: { targetEntityId: string; targetName: string; amount: number }[]
  buffPreviews: { targetEntityId: string; targetName: string; buffType: string; duration?: number | null }[]
  terrainPreviews: { position: Position; terrainType?: string | null; value?: number | null }[]
  counterAttackPreview?: DamagePreviewItem | null
  digPreview?: {
    successRate: number
    failNoEffectRate: number
    failDamageRate: number
    failDamageValue: number
  } | null
  killPreview?: { willKill: boolean; killedEntityIds: string[] } | null
  affectedPositions: Position[]
}
