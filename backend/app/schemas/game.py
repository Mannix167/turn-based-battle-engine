from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import Position
from app.schemas.map import MapCell


class SkillInstanceSchema(BaseModel):
    instanceId: str
    templateId: str
    source: Literal[
        "character_default",
        "start_common",
        "treasure",
        "monster_reward",
        "kill_reward",
        "random_reward",
        "summon",
    ]
    isUsed: bool = False
    quantity: int = 1
    maxQuantity: int = 3
    sourceTypes: list[str] = []
    acquiredAt: str | None = None


class StatusEffectSchema(BaseModel):
    id: str
    type: str
    sourceEntityId: str
    targetEntityId: str
    duration: int | None = None
    remainingTurns: int | None = None
    value: int | None = None
    metadata: dict = {}


class BattleEntitySchema(BaseModel):
    id: str
    type: Literal["character", "summon", "monster"]
    name: str
    ownerId: str | None = None
    controllerId: str | None = None
    factionId: str = ""
    x: int
    y: int
    maxHp: int
    currentHp: int
    baseAttack: int
    currentAttack: int
    baseDefense: int
    currentDefense: int
    attackRange: int
    tempApPerTurn: int
    permanentAP: int
    temporaryAP: int
    speed: int
    critRate: int
    luck: int
    joinOrder: int
    templateId: str | None = None
    tokenImageUrl: str | None = None
    portraitImageUrl: str | None = None
    isAlive: bool
    activeRound: int = 1
    extraTurnNextRound: int = 0
    skillInstances: list[SkillInstanceSchema] = []
    statusEffects: list[StatusEffectSchema] = []


class TreasureEntitySchema(BaseModel):
    id: str
    type: Literal["treasure"] = "treasure"
    name: str
    x: int
    y: int
    isDug: bool = False


class CreateGameRequest(BaseModel):
    mapId: str = "map_default"


class StartGameRequest(BaseModel):
    mapId: str | None = None
    mapTemplateId: str | None = None
    entityIds: list[str] | None = None
    selectedCharacterIds: list[str] | None = None
    positions: dict[str, Position] = {}
    characterPlacements: list["CharacterPlacement"] = []
    selectedSkillTemplateIds: dict[str, list[str]] = {}
    selectedCommonSkillIdsByCharacterId: dict[str, list[str]] = {}
    randomMonsterCount: int = Field(default=0, ge=0)
    randomTreasureCount: int = Field(default=0, ge=0)
    monsterTemplatePoolIds: list[str] = []
    rewardSkillPoolTemplateIds: list[str] = []
    rewardSkillTemplateRarities: dict[str, str] = {}
    rarityDropWeights: dict[str, int] = {}
    maxSkillStackQuantity: int = 3
    factions: list["FactionSchema"] = []
    characterFactionAssignments: dict[str, str] = {}
    startSeed: str | None = None


class CharacterPlacement(BaseModel):
    characterId: str
    position: Position


class FactionSchema(BaseModel):
    id: str
    name: str
    color: str
    iconUrl: str | None = None


class PreviewMonster(BaseModel):
    id: str
    monsterTemplateId: str
    position: Position


class PreviewTreasure(BaseModel):
    id: str
    position: Position


class PreviewStartResponse(BaseModel):
    startSeed: str
    previewMonsters: list[PreviewMonster]
    previewTreasures: list[PreviewTreasure]
    rewardSkillPoolTemplateIds: list[str]
    rewardSkillTemplateRarities: dict[str, str] = {}
    rarityDropWeights: dict[str, int] = {}
    maxSkillStackQuantity: int = 3
    warnings: list[str] = []


class MoveRequest(BaseModel):
    entityId: str
    to: Position


class BasicAttackRequest(BaseModel):
    attackerId: str
    targetId: str


class AttackTerrainRequest(BaseModel):
    attackerId: str
    targetCell: Position


class UseSkillRequest(BaseModel):
    casterId: str
    skillInstanceId: str
    targetEntityId: str | None = None
    secondTargetEntityId: str | None = None
    targetCell: Position | None = None
    direction: Literal["up", "down", "left", "right"] | None = None


class EndActionRequest(BaseModel):
    entityId: str


class DigTreasureRequest(BaseModel):
    entityId: str
    treasureId: str
    failureDamage: int = Field(default=10, ge=0)


class ChooseKillRewardRequest(BaseModel):
    killerId: str
    templateId: str


class PendingRewardSchema(BaseModel):
    killerEntityId: str
    defeatedEntityId: str
    availableTemplateIds: list[str]


class DamageEventSchema(BaseModel):
    sourceEntityId: str
    targetEntityId: str
    amount: int
    isCrit: bool = False
    rawDamage: int = 0
    linkedFromEntityId: str | None = None


class PlaybackCueSchema(BaseModel):
    atMs: int
    kind: str
    entityId: str | None = None
    sourceEntityId: str | None = None
    amount: int | None = None
    hpAfter: int | None = None
    isCrit: bool = False
    sourcePosition: Position | None = None
    targetPosition: Position | None = None


class BattlePlaybackSchema(BaseModel):
    id: str
    visualKey: str
    actorId: str
    sourcePosition: Position
    targetPosition: Position
    durationMs: int
    cues: list[PlaybackCueSchema] = []


class BattleEventSchema(BaseModel):
    id: str
    type: str
    timestamp: float
    actorId: str | None = None
    targetIds: list[str] = []
    sourcePosition: Position | None = None
    targetPosition: Position | None = None
    targetPositions: list[Position] = []
    skillTemplateId: str | None = None
    terrainType: str | None = None
    oldTerrainType: str | None = None
    newTerrainType: str | None = None
    value: int | None = None
    visualKey: str | None = None
    soundKey: str | None = None
    playback: BattlePlaybackSchema | None = None
    metadata: dict = {}


class ActionPreviewRequest(BaseModel):
    gameId: str
    actorId: str
    actionType: Literal["attack", "skill", "move", "dig"]
    targetPosition: Position | None = None
    targetEntityId: str | None = None
    skillInstanceId: str | None = None
    direction: Literal["up", "down", "left", "right"] | None = None
    selectedTargetIds: list[str] = []


class ActionPreviewApCost(BaseModel):
    temporaryAp: int = 0
    permanentAp: int = 0
    total: int = 0


class DamagePreviewItem(BaseModel):
    targetEntityId: str
    targetName: str
    damageType: Literal["normal", "true", "percent_max_hp", "terrain"] = "normal"
    finalDamage: int
    baseDamage: int | None = None
    defenseReduction: int | None = None
    canCrit: bool = False
    critRate: int | None = None
    critDamagePreview: int | None = None
    willKill: bool = False


class HealPreviewItem(BaseModel):
    targetEntityId: str
    targetName: str
    amount: int


class BuffPreviewItem(BaseModel):
    targetEntityId: str
    targetName: str
    buffType: str
    duration: int | None = None


class TerrainPreviewItem(BaseModel):
    position: Position
    terrainType: str | None = None
    value: int | None = None


class DigPreview(BaseModel):
    successRate: int
    failNoEffectRate: int
    failDamageRate: int
    failDamageValue: int


class KillPreview(BaseModel):
    willKill: bool
    killedEntityIds: list[str] = []


class ActionPreviewResponse(BaseModel):
    valid: bool
    reason: str | None = None
    actionType: Literal["attack", "skill", "move", "dig"]
    apCost: ActionPreviewApCost | None = None
    damagePreviews: list[DamagePreviewItem] = []
    healPreviews: list[HealPreviewItem] = []
    buffPreviews: list[BuffPreviewItem] = []
    terrainPreviews: list[TerrainPreviewItem] = []
    counterAttackPreview: DamagePreviewItem | None = None
    digPreview: DigPreview | None = None
    killPreview: KillPreview | None = None
    affectedPositions: list[Position] = []


class GameMapRead(BaseModel):
    id: str
    name: str
    width: int
    height: int
    cells: list[MapCell] = []


class AllianceLinkRead(BaseModel):
    sourceEntityId: str
    targetEntityId: str
    remainingTurns: int | None = None


class GameStateRead(BaseModel):
    gameId: str
    mapId: str
    map: GameMapRead | None = None
    roundNumber: int
    currentEntityId: str | None
    actionQueue: list[str]
    entities: list[BattleEntitySchema]
    treasures: list[TreasureEntitySchema] = []
    pendingRewards: dict[str, PendingRewardSchema] = {}
    factions: list[FactionSchema] = []
    alliances: list[AllianceLinkRead] = []
    rewardSkillPoolTemplateIds: list[str] = []
    rewardSkillTemplateRarities: dict[str, str] = {}
    rarityDropWeights: dict[str, int] = {}
    maxSkillStackQuantity: int = 3
    startSeed: str | None = None
    recentDamageEvents: list[DamageEventSchema] = []
    recentEvents: list[BattleEventSchema] = []
    isFinished: bool = False
    winnerGroup: list[str] = []
    log: list[str] = []
