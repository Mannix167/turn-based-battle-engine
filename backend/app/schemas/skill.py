from typing import Any, Literal

from pydantic import BaseModel, Field


EffectType = Literal[
    "damage",
    "heal",
    "add_buff",
    "remove_buff",
    "modify_stat",
    "add_permanent_ap",
    "add_temporary_ap",
    "extra_turn_next_round",
    "alliance",
    "remove_alliance",
    "swap_attack",
    "sync_hp",
    "summon",
    "delayed_damage",
    "grant_skill",
]


class EffectConfig(BaseModel):
    type: EffectType
    value: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SkillTemplateRead(BaseModel):
    id: str
    name: str
    description: str = ""
    category: Literal["character", "common"]
    cost: int = Field(ge=0)
    range: int = Field(ge=0)
    targetType: Literal["single", "emptyCell", "direction", "self"]
    areaType: Literal["single", "line", "cross", "square", "none"]
    canTargetSelf: bool = False
    canTargetAlly: bool = False
    canTargetEnemy: bool = True
    canTargetEmptyCell: bool = False
    effects: list[EffectConfig]
