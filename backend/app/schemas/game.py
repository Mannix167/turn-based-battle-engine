from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import Position


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
    ]
    isUsed: bool = False


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
    mapId: str = "map_default"
    entityIds: list[str] = Field(min_length=1)
    positions: dict[str, Position]


class MoveRequest(BaseModel):
    entityId: str
    to: Position


class BasicAttackRequest(BaseModel):
    attackerId: str
    targetId: str


class UseSkillRequest(BaseModel):
    casterId: str
    skillInstanceId: str
    targetEntityId: str | None = None
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


class GameStateRead(BaseModel):
    gameId: str
    roundNumber: int
    currentEntityId: str | None
    actionQueue: list[str]
    entities: list[BattleEntitySchema]
    treasures: list[TreasureEntitySchema] = []
    pendingRewards: dict[str, PendingRewardSchema] = {}
    isFinished: bool = False
    winnerGroup: list[str] = []
    log: list[str] = []
