from dataclasses import dataclass, field
from typing import Any, Literal


EntityType = Literal["character", "summon", "monster"]
Direction = Literal["up", "down", "left", "right"]


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
    ownerId: str | None = None
    controllerId: str | None = None
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
    pendingRewards: dict[str, PendingReward] = field(default_factory=dict)
    recentDamagedEntityIds: list[str] = field(default_factory=list)
    isFinished: bool = False
    winnerGroup: list[str] = field(default_factory=list)
    log: list[str] = field(default_factory=list)
