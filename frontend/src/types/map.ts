export interface MapCell {
  x: number
  y: number
  enabled: boolean
  terrainType: 'normal'
  tileImageUrl: string | null
}

export interface SpawnZone {
  id: string
  name: string
  cells: { x: number; y: number }[]
  type: 'player' | 'neutral' | 'custom'
}

export interface MapFixedEntity {
  id: string
  type: 'monster' | 'treasure'
  templateId: string | null
  x: number
  y: number
}

export interface MapRandomRule {
  id: string
  type: 'monster' | 'treasure'
  count: number
  allowedCells: { x: number; y: number }[]
  excludedCells: { x: number; y: number }[]
  templatePool: string[]
}

export interface MapRead {
  id: string
  name: string
  description: string
  width: number
  height: number
  cells: MapCell[]
  validCells: { x: number; y: number }[]
  spawnZones: SpawnZone[]
  fixedEntities: MapFixedEntity[]
  randomRules: MapRandomRule[]
  backgroundImageUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface MapWrite extends Omit<MapRead, 'id' | 'createdAt' | 'updatedAt'> {
  id?: string
}

export interface MapValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}
