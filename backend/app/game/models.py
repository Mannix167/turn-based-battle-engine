from dataclasses import dataclass, field
from typing import Any, Literal


EntityType = Literal["character", "summon", "monster"]
Direction = Literal["up", "down", "left", "right"]
TerrainType = Literal["normal", "obstacle", "lava", "swamp", "wood_stake", "ice", "thunderstorm"]
Rarity = Literal["common", "rare", "uncommon", "epic", "legendary"]


@dataclass(frozen=True)
class Position:
    x: int
    y: int


@dataclass
class SkillInstance:
    instanceId: str
    templateId: str
    source: str
    isUsed: bool = False
    quantity: int = 1
    maxQuantity: int = 3
    sourceTypes: list[str] = field(default_factory=list)
    acquiredAt: str | None = None


@dataclass
class StatusEffect:
    id: str
    type: str
    sourceEntityId: str
    targetEntityId: str
    duration: int | None = None
    remainingTurns: int | None = None
    value: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AllianceLink:
    sourceEntityId: str
    targetEntityId: str
    remainingTurns: int | None = None


@dataclass
class PendingReward:
    killerEntityId: str
    defeatedEntityId: str
    availableTemplateIds: list[str]


@dataclass
class DamageEvent:
    sourceEntityId: str
    targetEntityId: str
    amount: int
    isCrit: bool = False
    rawDamage: int = 0
    linkedFromEntityId: str | None = None


@dataclass
class TerrainState:
    originalTerrainType: TerrainType | None = None
    duration: int | Literal["permanent"] | None = None
    createdBySkillId: str | None = None
    createdByEntityId: str | None = None
    hp: int | None = None
    maxHp: int | None = None
    defense: int | None = None


@dataclass
class MapCell:
    x: int
    y: int
    enabled: bool = True
    terrainType: TerrainType = "normal"
    tileImageUrl: str | None = None
    terrainState: TerrainState | None = None

    @property
    def position(self) -> Position:
        return Position(self.x, self.y)


@dataclass
class PlaybackCue:
    atMs: int
    kind: str
    entityId: str | None = None
    sourceEntityId: str | None = None
    amount: int | None = None
    hpAfter: int | None = None
    isCrit: bool = False
    sourcePosition: Position | None = None
    targetPosition: Position | None = None


@dataclass
class BattlePlayback:
    id: str
    visualKey: str
    actorId: str
    sourcePosition: Position
    targetPosition: Position
    durationMs: int
    cues: list[PlaybackCue] = field(default_factory=list)


@dataclass
class BattleEvent:
    id: str
    type: str
    timestamp: float
    actorId: str | None = None
    targetIds: list[str] = field(default_factory=list)
    sourcePosition: Position | None = None
    targetPosition: Position | None = None
    targetPositions: list[Position] = field(default_factory=list)
    skillTemplateId: str | None = None
    terrainType: TerrainType | None = None
    oldTerrainType: TerrainType | None = None
    newTerrainType: TerrainType | None = None
    value: int | None = None
    visualKey: str | None = None
    soundKey: str | None = None
    playback: BattlePlayback | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Faction:
    id: str
    name: str
    color: str
    iconUrl: str | None = None


@dataclass
class BattleEntity:
    id: str
    type: EntityType
    name: str
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
    speed: int
    critRate: int
    luck: int
    joinOrder: int
    templateId: str | None = None
    tokenImageUrl: str | None = None
    portraitImageUrl: str | None = None
    ownerId: str | None = None
    controllerId: str | None = None
    factionId: str = ""
    permanentAP: int = 3
    temporaryAP: int = 0
    isAlive: bool = True
    activeRound: int = 1
    extraTurnNextRound: int = 0
    skillInstances: list[SkillInstance] = field(default_factory=list)
    statusEffects: list[StatusEffect] = field(default_factory=list)

    @property
    def position(self) -> Position:
        return Position(self.x, self.y)


@dataclass
class TreasureEntity:
    id: str
    name: str
    x: int
    y: int
    isDug: bool = False

    @property
    def position(self) -> Position:
        return Position(self.x, self.y)


@dataclass
class GameMap:
    id: str
    name: str
    width: int
    height: int
    validCells: set[Position] = field(default_factory=set)
    cells: dict[Position, MapCell] = field(default_factory=dict)


@dataclass
class GameState:
    gameId: str
    gameMap: GameMap
    entities: dict[str, BattleEntity]
    treasures: dict[str, TreasureEntity] = field(default_factory=dict)
    roundNumber: int = 1
    actionQueue: list[str] = field(default_factory=list)
    currentEntityId: str | None = None
    alliances: list[AllianceLink] = field(default_factory=list)
    factions: dict[str, Faction] = field(default_factory=dict)
    pendingRewards: dict[str, PendingReward] = field(default_factory=dict)
    rewardSkillPoolTemplateIds: list[str] = field(default_factory=list)
    rewardSkillTemplateRarities: dict[str, Rarity] = field(default_factory=dict)
    rarityDropWeights: dict[Rarity, int] = field(
        default_factory=lambda: {
            "common": 50,
            "rare": 25,
            "uncommon": 15,
            "epic": 8,
            "legendary": 2,
        }
    )
    maxSkillStackQuantity: int = 3
    startSeed: str | None = None
    recentDamagedEntityIds: list[str] = field(default_factory=list)
    recentDamageEvents: list[DamageEvent] = field(default_factory=list)
    recentEvents: list[BattleEvent] = field(default_factory=list)
    isFinished: bool = False
    winnerGroup: list[str] = field(default_factory=list)
    log: list[str] = field(default_factory=list)
